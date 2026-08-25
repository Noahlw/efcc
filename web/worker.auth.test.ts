/**
 * AUTH-06 (#165) — the locked AUTH-04 `/api/v1/auth/*` Worker route contract,
 * proven end to end through the real `workerd` runtime.
 *
 * Acceptance covered (AUTH-04 #162 / #165):
 *   - The auth surface has NO CORS: OPTIONS on `/api/v1/auth/*` is rejected
 *     (405), and successful auth responses carry no Access-Control-Allow-*
 *     headers. The legacy header transports are REJECTED (Authorization and
 *     X-Efcc-Session-Id each produce a fail-closed 403); cross-origin is
 *     rejected.
 *   - register: `{ requestId, data: { status: "pending" } }`, Idempotency-Key
 *     required, validation errors, and no duplicate request on a taken
 *     username (409).
 *   - login: `{ requestId, data: { userId, name, role, status,
 *     mustSetNewCredential } }`; sets the two locked httpOnly Secure
 *     SameSite=Strict cookies; NOT idempotent. Legacy accounts present the
 *     legacy PIN and get `mustSetNewCredential: true` with NO session.
 *   - refresh: rotates the opaque value (the old value is rejected
 *     immediately) and sets a fresh access cookie.
 *   - logout: clears both cookies (Max-Age=0) and revokes the refresh
 *     session server-side.
 *   - registrations/:id/approve and /:id/reject: `{ requestId, data:
 *     { accountStatus } }`, Idempotency-Key required, Admin/Staff-only,
 *     idempotent replay, and conflict/404 handling.
 *   - Every response carries `X-Request-Id` matching the body `requestId`.
 *   - No credential or token value appears in any response body or log.
 */
import assert from "node:assert/strict";

import { env } from "cloudflare:workers";
import { beforeAll, describe, test } from "vitest";
/* oxlint-disable vitest/require-top-level-describe -- shared workerd/D1 fixture spans all contract suites. */

import { importLegacyUsers } from "./lib/auth/accounts";
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from "./lib/auth/cookies";
import { handleLogout } from "./lib/auth/handlers";
import { applyMigrations, testDb } from "./lib/auth/test-bootstrap";
import { completeCredentialUpgrade } from "./lib/auth/upgrade";
import worker from "./worker";
import type { Env } from "./worker";

const SECRET = "test-access-token-secret";
const HEADER = [
  "User_ID",
  "Name",
  "Username",
  "PIN_Code",
  "System_Role",
  "Status",
];
const HOST = "https://efcc.example";

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...(env as unknown as Env),
    EFCC_ACCESS_TOKEN_SECRET: SECRET,
    ...overrides,
  };
}

function authRequest(
  path: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {}
): Request {
  return new Request(`${HOST}${path}`, {
    method: init.method ?? "POST",
    headers: init.headers ?? {},
    body:
      init.body === undefined
        ? undefined
        : typeof init.body === "string"
          ? init.body
          : JSON.stringify(init.body),
  });
}

/** Assert a response has no CORS headers at all. */
function assertNoCors(res: Response): void {
  for (const name of [
    "Access-Control-Allow-Origin",
    "Access-Control-Allow-Methods",
    "Access-Control-Allow-Headers",
    "Access-Control-Allow-Credentials",
  ]) {
    assert.strictEqual(
      res.headers.get(name),
      null,
      `auth surface must not emit ${name}`
    );
  }
}

/** Assert a cookie value carries the locked attributes. */
function assertLockedCookie(raw: string | null, name: string): void {
  assert.ok(raw, `${name} cookie must be set`);
  if (raw === null) {
    return;
  }
  assert.ok(raw.startsWith(`${name}=`), `${name} cookie named correctly`);
  assert.match(raw, /; HttpOnly/iu, `${name} must be httpOnly`);
  assert.match(raw, /; Secure/iu, `${name} must be Secure`);
  assert.match(raw, /; SameSite=Strict/iu, `${name} must be SameSite=Strict`);
}

function readAuthCookiesFromResponse(res: Response): {
  access: string;
  refresh: string;
} {
  const setCookies = res.headers.getSetCookie();
  assert.ok(
    setCookies.length >= 2,
    `expected at least 2 Set-Cookie headers, got ${setCookies.length}`
  );
  const found: Record<string, string> = {};
  for (const raw of setCookies) {
    const name = raw.split(";")[0].split("=")[0].trim();
    assert.ok(!(name in found), `duplicate ${name} Set-Cookie header`);
    found[name] = raw;
  }
  assert.ok(found[ACCESS_COOKIE_NAME], "access cookie must be present");
  assert.ok(found[REFRESH_COOKIE_NAME], "refresh cookie must be present");
  return {
    access: found[ACCESS_COOKIE_NAME],
    refresh: found[REFRESH_COOKIE_NAME],
  };
}

function cookieValueFrom(raw: string): string {
  return raw.split(";")[0].split("=").slice(1).join("=");
}

/**
 * Assert an auth response body (and any nested object) carries no raw
 * session/token material AND that its `requestId` equals the X-Request-Id
 * header (ADR-0018 §8 / AUTH-04 correlation).
 */
function assertNoTokenKeysWalk(v: unknown): void {
  if (Array.isArray(v)) {
    for (const item of v) {
      assertNoTokenKeysWalk(item);
    }
    return;
  }
  if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      assert.ok(
        !/session|token/iu.test(k),
        `auth response body must not contain a '${k}' key`
      );
      assertNoTokenKeysWalk(val);
    }
  }
}

function assertBodyHasNoTokenKeys(body: unknown): void {
  const text = JSON.stringify(body);
  assert.ok(
    !/sessionId|accessToken|refreshToken|sessionToken|session_id|access_token|refresh_token/iu.test(
      text
    ),
    `auth response body must not expose token/session keys, got: ${text}`
  );
  assertNoTokenKeysWalk(body);
}

/** Assert the response body's requestId matches the X-Request-Id header. */
async function assertCorrelated(res: Response): Promise<unknown> {
  const header = res.headers.get("X-Request-Id");
  assert.ok(header, "X-Request-Id header must be present");
  const body = (await res.json()) as { requestId?: unknown };
  if (typeof body.requestId === "string") {
    assert.strictEqual(
      body.requestId,
      header,
      "body requestId must equal X-Request-Id header"
    );
  }
  return body;
}

/** Body echoed by Problem Details errors, for error assertions. */
interface ProblemBody {
  code: string;
  status: number;
  requestId: string;
}

async function problemOf(res: Response): Promise<ProblemBody> {
  assert.strictEqual(
    res.headers.get("Content-Type"),
    "application/problem+json"
  );
  const body = (await res.json()) as ProblemBody;
  assert.ok(body.requestId, "problem response must carry requestId");
  assert.strictEqual(
    body.requestId,
    res.headers.get("X-Request-Id"),
    "problem requestId must match X-Request-Id"
  );
  return body;
}

/** Look up the registration request_id for a username (approval discovery). */
async function registrationIdFor(username: string): Promise<string> {
  const row = await testDb()
    .prepare(
      "SELECT request_id FROM registration_requests WHERE username_normalized = ?"
    )
    .bind(username.trim().toLowerCase())
    .first<{ request_id: string }>();
  assert.ok(row, `no registration request for ${username}`);
  if (!row) {
    throw new Error(`no registration request for ${username}`);
  }
  return row.request_id;
}

/** Log in as an upgraded account and return the raw access cookie value. */
async function accessCookieFor(
  username: string,
  password: string
): Promise<string> {
  const res = await worker.fetch(
    authRequest("/api/v1/auth/login", {
      headers: { Origin: HOST, "Content-Type": "application/json" },
      body: { username, password },
    }),
    testEnv()
  );
  assert.strictEqual(res.status, 200, "login must succeed for fixture");
  return cookieValueFrom(readAuthCookiesFromResponse(res).access);
}

beforeAll(async () => {
  await applyMigrations();
  await importLegacyUsers(testDb(), [
    HEADER,
    ["U001", "Alice Chan", "alice", "1234", "Admin", "Active"],
    ["U002", "Bob Lee", "bob", "5678", "Member", "Active"],
    // U003 stays legacy-imported (requires_upgrade=1) for the forced-upgrade
    // login + upgrade tests.
    ["U003", "Carol Wong", "carol", "0000", "Member", "Active"],
    // U005 is a Staff member — the canonical elevated role (ADR-0025).
    ["U005", "Eve Staff", "eve", "9999", "Staff", "Active"],
  ]);
  await completeCredentialUpgrade(testDb(), {
    userId: "U001",
    legacyPin: "1234",
    newCredential: "alice-secret",
  });
  await completeCredentialUpgrade(testDb(), {
    userId: "U002",
    legacyPin: "5678",
    newCredential: "bob-secret",
  });
  await completeCredentialUpgrade(testDb(), {
    userId: "U005",
    legacyPin: "9999",
    newCredential: "eve-secret",
  });
});

describe("AUTH-06: auth surface has no CORS / OPTIONS", () => {
  test("OPTIONS on /api/v1/auth/login is rejected (405)", async () => {
    const res = await worker.fetch(
      authRequest("/api/v1/auth/login", { method: "OPTIONS" }),
      testEnv()
    );
    assert.strictEqual(res.status, 405);
    assertNoCors(res);
  });

  test("OPTIONS on /api/v1/auth/refresh is rejected (405)", async () => {
    const res = await worker.fetch(
      authRequest("/api/v1/auth/refresh", { method: "OPTIONS" }),
      testEnv()
    );
    assert.strictEqual(res.status, 405);
    assertNoCors(res);
  });

  test("successful login response carries no Access-Control-Allow-* headers", async () => {
    const res = await worker.fetch(
      authRequest("/api/v1/auth/login", {
        headers: { Origin: HOST },
        body: { username: "alice", password: "alice-secret" },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    assertNoCors(res);
  });
});

describe("AUTH-06: legacy header transports rejected on auth surface", () => {
  test("Authorization header is rejected fail-closed (403)", async () => {
    const res = await worker.fetch(
      authRequest("/api/v1/auth/login", {
        headers: { Origin: HOST, Authorization: "Bearer leaked-token-value" },
        body: { username: "alice", password: "alice-secret" },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 403);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "TRANSPORT_FORBIDDEN");
    assert.ok(!JSON.stringify(body).includes("leaked-token-value"));
  });

  test("X-Efcc-Session-Id header is rejected fail-closed (403)", async () => {
    const res = await worker.fetch(
      authRequest("/api/v1/auth/login", {
        headers: { Origin: HOST, "X-Efcc-Session-Id": "opaque-session-value" },
        body: { username: "alice", password: "alice-secret" },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 403);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "TRANSPORT_FORBIDDEN");
  });

  test("cross-origin request is rejected fail-closed (403)", async () => {
    const res = await worker.fetch(
      authRequest("/api/v1/auth/login", {
        headers: { Origin: "https://evil.example" },
        body: { username: "alice", password: "alice-secret" },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 403);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "CROSS_ORIGIN_FORBIDDEN");
  });
});

describe("AUTH-06: register", () => {
  test("register succeeds with an Idempotency-Key and a valid body", async () => {
    const res = await worker.fetch(
      authRequest("/api/v1/auth/register", {
        headers: { Origin: HOST, "Idempotency-Key": "idem-reg-1" },
        body: {
          username: "dave",
          password: "dave-password-1",
          name: "Dave Ng",
          phone: "9123 4567",
        },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    const body = (await assertCorrelated(res)) as {
      data: { status: string };
    };
    assert.strictEqual(body.data.status, "pending");
    assertBodyHasNoTokenKeys(body);
    assertNoCors(res);
  });

  test("register rejects a missing Idempotency-Key (422)", async () => {
    const res = await worker.fetch(
      authRequest("/api/v1/auth/register", {
        headers: { Origin: HOST },
        body: {
          username: "erin",
          password: "erin-password-1",
          name: "Erin Ho",
          phone: "9123 4568",
        },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 422);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "VALIDATION");
  });

  test("register rejects missing fields (422)", async () => {
    const res = await worker.fetch(
      authRequest("/api/v1/auth/register", {
        headers: { Origin: HOST, "Idempotency-Key": "idem-reg-2" },
        body: { username: "frank" },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 422);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "VALIDATION");
  });

  test("register rejects a short password (422)", async () => {
    const res = await worker.fetch(
      authRequest("/api/v1/auth/register", {
        headers: { Origin: HOST, "Idempotency-Key": "idem-reg-3" },
        body: {
          username: "grace",
          password: "short",
          name: "Grace Wu",
          phone: "9123 4569",
        },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 422);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "VALIDATION");
  });

  test("register for a taken username is a conflict (409) — no duplicate", async () => {
    const res = await worker.fetch(
      authRequest("/api/v1/auth/register", {
        headers: { Origin: HOST, "Idempotency-Key": "idem-reg-dup" },
        body: {
          username: "dave",
          password: "dave-password-2",
          name: "Dave Again",
          phone: "9123 4570",
        },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 409);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "CONFLICT");
  });

  test("concurrent registrations for one username create one request", async () => {
    const responses = await Promise.all([
      worker.fetch(
        authRequest("/api/v1/auth/register", {
          headers: { Origin: HOST, "Idempotency-Key": "idem-race-a" },
          body: {
            username: "race-user",
            password: "race-password-1",
            name: "Race User",
            phone: "9123 4571",
          },
        }),
        testEnv()
      ),
      worker.fetch(
        authRequest("/api/v1/auth/register", {
          headers: { Origin: HOST, "Idempotency-Key": "idem-race-b" },
          body: {
            username: "race-user",
            password: "race-password-2",
            name: "Race User",
            phone: "9123 4571",
          },
        }),
        testEnv()
      ),
    ]);
    assert.deepStrictEqual(
      responses.map((response) => response.status).sort((a, b) => a - b),
      [200, 409]
    );
    const row = await testDb()
      .prepare(
        "SELECT COUNT(*) AS n FROM registration_requests WHERE username_normalized = ?"
      )
      .bind("race-user")
      .first<{ n: number }>();
    assert.strictEqual(Number(row?.n ?? 0), 1);
  });
});

describe("AUTH-06: login", () => {
  test("login succeeds, sets two locked cookies, and is not idempotent", async () => {
    const res = await worker.fetch(
      authRequest("/api/v1/auth/login", {
        headers: { Origin: HOST, "Content-Type": "application/json" },
        body: { username: "alice", password: "alice-secret" },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    const body = (await assertCorrelated(res)) as {
      data: {
        userId: string;
        name: string;
        role: string;
        status: string;
        mustSetNewCredential: boolean;
      };
    };
    assert.strictEqual(body.data.userId, "U001");
    assert.strictEqual(body.data.name, "Alice Chan");
    assert.strictEqual(body.data.role, "Admin");
    assert.strictEqual(body.data.mustSetNewCredential, false);
    assertBodyHasNoTokenKeys(body);
    const { access, refresh } = readAuthCookiesFromResponse(res);
    assertLockedCookie(access, ACCESS_COOKIE_NAME);
    assertLockedCookie(refresh, REFRESH_COOKIE_NAME);
  });

  test("/me returns the complete public profile DTO", async () => {
    const access = await accessCookieFor("alice", "alice-secret");
    const res = await worker.fetch(
      authRequest("/api/v1/auth/me", {
        method: "GET",
        headers: { Origin: HOST, Cookie: `${ACCESS_COOKIE_NAME}=${access}` },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    const body = (await assertCorrelated(res)) as {
      data: { user: Record<string, unknown> };
    };
    assert.deepStrictEqual(body.data.user, {
      userId: "U001",
      name: "Alice Chan",
      username: "alice",
      phone: "",
      role: "Admin",
      status: "Active",
      qrCodeString: "",
    });
    assertBodyHasNoTokenKeys(body);
  });

  test("/me returns server-authorized sections and stable navigation projections", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const adminRes = await worker.fetch(
      authRequest("/api/v1/auth/me", {
        method: "GET",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
        },
      }),
      testEnv()
    );
    assert.strictEqual(adminRes.status, 200);
    const adminBody = (await assertCorrelated(adminRes)) as {
      data: {
        sections: Array<{ key: string }>;
        navigation: Array<{ key: string }>;
      };
    };
    assert.deepStrictEqual(
      adminBody.data.sections.map((s) => s.key),
      ["home", "programs", "scanner", "management", "profile", "events"]
    );
    assert.deepStrictEqual(
      adminBody.data.navigation.map((s) => s.key),
      ["home", "programs", "scanner", "management", "profile"]
    );

    const memberAccess = await accessCookieFor("bob", "bob-secret");
    const memberRes = await worker.fetch(
      authRequest("/api/v1/auth/me", {
        method: "GET",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${memberAccess}`,
        },
      }),
      testEnv()
    );
    assert.strictEqual(memberRes.status, 200);
    const memberBody = (await assertCorrelated(memberRes)) as {
      data: {
        sections: Array<{ key: string }>;
        navigation: Array<{ key: string }>;
      };
    };
    assert.deepStrictEqual(
      memberBody.data.sections.map((s) => s.key),
      ["home", "programs", "scanner", "notices", "profile"]
    );
    assert.deepStrictEqual(
      memberBody.data.navigation.map((s) => s.key),
      ["home", "programs", "scanner", "notices", "profile"]
    );
  });

  test("a repeated successful login issues a fresh refresh session (not idempotent)", async () => {
    const one = await worker.fetch(
      authRequest("/api/v1/auth/login", {
        headers: { Origin: HOST },
        body: { username: "bob", password: "bob-secret" },
      }),
      testEnv()
    );
    const two = await worker.fetch(
      authRequest("/api/v1/auth/login", {
        headers: { Origin: HOST },
        body: { username: "bob", password: "bob-secret" },
      }),
      testEnv()
    );
    assert.strictEqual(one.status, 200);
    assert.strictEqual(two.status, 200);
    const r1 = cookieValueFrom(readAuthCookiesFromResponse(one).refresh);
    const r2 = cookieValueFrom(readAuthCookiesFromResponse(two).refresh);
    assert.notStrictEqual(
      r1,
      r2,
      "each login must mint a distinct refresh session"
    );
  });

  test("legacy account login verifies the legacy PIN and returns mustSetNewCredential with NO session", async () => {
    const res = await worker.fetch(
      authRequest("/api/v1/auth/login", {
        headers: { Origin: HOST, "Content-Type": "application/json" },
        body: { username: "carol", password: "0000" },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    const body = (await assertCorrelated(res)) as {
      data: { userId: string; mustSetNewCredential: boolean };
    };
    assert.strictEqual(body.data.userId, "U003");
    assert.strictEqual(body.data.mustSetNewCredential, true);
    // No session is issued before the credential is set.
    assert.strictEqual(
      res.headers.getSetCookie().length,
      0,
      "no cookies before upgrade"
    );
    assertBodyHasNoTokenKeys(body);
  });

  test("legacy account login with the wrong PIN is rejected (401)", async () => {
    const res = await worker.fetch(
      authRequest("/api/v1/auth/login", {
        headers: { Origin: HOST },
        body: { username: "carol", password: "9999" },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 401);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "AUTH_REQUIRED");
  });

  test("login with an unknown user is rejected (401)", async () => {
    const res = await worker.fetch(
      authRequest("/api/v1/auth/login", {
        headers: { Origin: HOST },
        body: { username: "nobody", password: "whatever-1" },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 401);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "AUTH_REQUIRED");
  });

  test("login with a wrong password is rejected (401)", async () => {
    const res = await worker.fetch(
      authRequest("/api/v1/auth/login", {
        headers: { Origin: HOST },
        body: { username: "alice", password: "wrong-password" },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 401);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "AUTH_REQUIRED");
  });

  test("login with missing fields is rejected (422)", async () => {
    const res = await worker.fetch(
      authRequest("/api/v1/auth/login", {
        headers: { Origin: HOST },
        body: { username: "alice" },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 422);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "VALIDATION");
  });
});

describe("AUTH-06: refresh rotation", () => {
  test("refresh exchanges the refresh cookie for a fresh access cookie and a new rotated value", async () => {
    const login = await worker.fetch(
      authRequest("/api/v1/auth/login", {
        headers: { Origin: HOST },
        body: { username: "bob", password: "bob-secret" },
      }),
      testEnv()
    );
    const loginCookies = readAuthCookiesFromResponse(login);
    const oldRefresh = cookieValueFrom(loginCookies.refresh);

    const res = await worker.fetch(
      authRequest("/api/v1/auth/refresh", {
        headers: { Origin: HOST, Cookie: `efcc_refresh=${oldRefresh}` },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    const refreshed = readAuthCookiesFromResponse(res);
    assertLockedCookie(refreshed.access, ACCESS_COOKIE_NAME);
    assertLockedCookie(refreshed.refresh, REFRESH_COOKIE_NAME);
    assertBodyHasNoTokenKeys(await assertCorrelated(res));
    const newRefresh = cookieValueFrom(refreshed.refresh);
    assert.notStrictEqual(
      newRefresh,
      oldRefresh,
      "refresh must rotate the opaque value"
    );

    // The OLD refresh value is invalidated immediately and can never renew.
    const reuse = await worker.fetch(
      authRequest("/api/v1/auth/refresh", {
        headers: { Origin: HOST, Cookie: `efcc_refresh=${oldRefresh}` },
      }),
      testEnv()
    );
    assert.strictEqual(reuse.status, 401);
    const body = await problemOf(reuse);
    assert.strictEqual(body.code, "AUTH_REQUIRED");
  });

  test("refresh without a refresh cookie is rejected (401)", async () => {
    const res = await worker.fetch(
      authRequest("/api/v1/auth/refresh", { headers: { Origin: HOST } }),
      testEnv()
    );
    assert.strictEqual(res.status, 401);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "AUTH_REQUIRED");
  });
});

describe("AUTH-06: logout", () => {
  test("logout clears both cookies and revokes the refresh session", async () => {
    const login = await worker.fetch(
      authRequest("/api/v1/auth/login", {
        headers: { Origin: HOST },
        body: { username: "alice", password: "alice-secret" },
      }),
      testEnv()
    );
    const loginCookies = readAuthCookiesFromResponse(login);
    const refreshValue = cookieValueFrom(loginCookies.refresh);

    const res = await worker.fetch(
      authRequest("/api/v1/auth/logout", {
        headers: { Origin: HOST, Cookie: `efcc_refresh=${refreshValue}` },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 204);
    assert.ok(
      res.headers.get("X-Request-Id"),
      "logout must carry X-Request-Id"
    );
    const cleared = readAuthCookiesFromResponse(res);
    for (const [name, raw] of [
      [ACCESS_COOKIE_NAME, cleared.access],
      [REFRESH_COOKIE_NAME, cleared.refresh],
    ] as const) {
      assert.ok(raw.startsWith(`${name}=`));
      assert.match(raw, /Max-Age=0|Expires=/iu);
    }
    // The revoked refresh session can never be renewed.
    const reuse = await worker.fetch(
      authRequest("/api/v1/auth/refresh", {
        headers: { Origin: HOST, Cookie: `efcc_refresh=${refreshValue}` },
      }),
      testEnv()
    );
    assert.strictEqual(reuse.status, 401);
  });

  test("logout clears both cookies even when server-side revocation fails (503, fail-closed)", async () => {
    const brokenDb = {
      prepare: () => ({
        bind: () => ({
          run: () => {
            throw new Error("D1 unavailable");
          },
        }),
      }),
    } as unknown as D1Database;
    const res = await handleLogout(
      new Request(`${HOST}/api/v1/auth/logout`, {
        method: "POST",
        headers: { Origin: HOST, Cookie: `efcc_refresh=stale-session` },
      }),
      { DB: brokenDb, EFCC_ACCESS_TOKEN_SECRET: SECRET }
    );
    assert.strictEqual(res.status, 503);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "UNAVAILABLE");
    assert.ok(
      res.headers.get("X-Request-Id"),
      "logout must carry X-Request-Id even on failure"
    );
    // Fail-closed: the browser must not retain credentials it cannot use.
    const cleared = readAuthCookiesFromResponse(res);
    for (const [name, raw] of [
      [ACCESS_COOKIE_NAME, cleared.access],
      [REFRESH_COOKIE_NAME, cleared.refresh],
    ] as const) {
      assert.ok(raw.startsWith(`${name}=`));
      assert.match(raw, /Max-Age=0|Expires=/iu);
    }
  });
});

describe("AUTH-06: legacy upgrade (preserved forced-upgrade)", () => {
  test("upgrade verifies the legacy PIN, issues a session, and the body omits token keys", async () => {
    const res = await worker.fetch(
      authRequest("/api/v1/auth/upgrade", {
        headers: { Origin: HOST, "Content-Type": "application/json" },
        body: {
          username: "carol",
          legacyPin: "0000",
          newCredential: "carol-new-secret",
        },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    const body = await assertCorrelated(res);
    assertBodyHasNoTokenKeys(body);
    const { access, refresh } = readAuthCookiesFromResponse(res);
    assertLockedCookie(access, ACCESS_COOKIE_NAME);
    assertLockedCookie(refresh, REFRESH_COOKIE_NAME);
  });
});

describe("AUTH-06: registrations approve/reject", () => {
  test("approve promotes a Pending registration into an Active account", async () => {
    // A fresh registration to approve.
    const reg = await worker.fetch(
      authRequest("/api/v1/auth/register", {
        headers: { Origin: HOST, "Idempotency-Key": "idem-approve-1" },
        body: {
          username: "hugo",
          password: "hugo-password-1",
          name: "Hugo Ma",
          phone: "9123 4572",
        },
      }),
      testEnv()
    );
    assert.strictEqual(reg.status, 200);
    const requestId = await registrationIdFor("hugo");
    const adminAccess = await accessCookieFor("alice", "alice-secret");

    const res = await worker.fetch(
      authRequest(`/api/v1/auth/registrations/${requestId}/approve`, {
        headers: {
          Origin: HOST,
          Cookie: `efcc_access=${adminAccess}`,
          "Idempotency-Key": "idem-approve-1",
        },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    const body = (await assertCorrelated(res)) as {
      data: { accountStatus: string };
    };
    assert.strictEqual(body.data.accountStatus, "active");
    assertBodyHasNoTokenKeys(body);

    // The approved account can now log in with its registered credential.
    const login = await worker.fetch(
      authRequest("/api/v1/auth/login", {
        headers: { Origin: HOST },
        body: { username: "hugo", password: "hugo-password-1" },
      }),
      testEnv()
    );
    assert.strictEqual(login.status, 200);
  });

  test("approve an already-approved request is an idempotent no-op success", async () => {
    const requestId = await registrationIdFor("hugo");
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const res = await worker.fetch(
      authRequest(`/api/v1/auth/registrations/${requestId}/approve`, {
        headers: {
          Origin: HOST,
          Cookie: `efcc_access=${adminAccess}`,
          "Idempotency-Key": "idem-approve-1-replay",
        },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as { data: { accountStatus: string } };
    assert.strictEqual(body.data.accountStatus, "active");
  });

  test("concurrent approval creates one account", async () => {
    const reg = await worker.fetch(
      authRequest("/api/v1/auth/register", {
        headers: { Origin: HOST, "Idempotency-Key": "idem-approve-race" },
        body: {
          username: "approve-race",
          password: "approve-race-password",
          name: "Approve Race",
          phone: "9123 4573",
        },
      }),
      testEnv()
    );
    assert.strictEqual(reg.status, 200);
    const requestId = await registrationIdFor("approve-race");
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const responses = await Promise.all([
      worker.fetch(
        authRequest(`/api/v1/auth/registrations/${requestId}/approve`, {
          headers: {
            Origin: HOST,
            Cookie: `efcc_access=${adminAccess}`,
            "Idempotency-Key": "idem-approve-race-a",
          },
        }),
        testEnv()
      ),
      worker.fetch(
        authRequest(`/api/v1/auth/registrations/${requestId}/approve`, {
          headers: {
            Origin: HOST,
            Cookie: `efcc_access=${adminAccess}`,
            "Idempotency-Key": "idem-approve-race-b",
          },
        }),
        testEnv()
      ),
    ]);
    assert.deepStrictEqual(
      responses.map((response) => response.status).sort((a, b) => a - b),
      [200, 200]
    );
    const row = await testDb()
      .prepare(
        "SELECT COUNT(*) AS n FROM accounts WHERE username_normalized = ?"
      )
      .bind("approve-race")
      .first<{ n: number }>();
    assert.strictEqual(Number(row?.n ?? 0), 1);
  });

  test("reject marks a Pending registration as rejected without an account", async () => {
    const reg = await worker.fetch(
      authRequest("/api/v1/auth/register", {
        headers: { Origin: HOST, "Idempotency-Key": "idem-reject-1" },
        body: {
          username: "iris",
          password: "iris-password-1",
          name: "Iris Lam",
          phone: "9123 4574",
        },
      }),
      testEnv()
    );
    assert.strictEqual(reg.status, 200);
    const requestId = await registrationIdFor("iris");
    const adminAccess = await accessCookieFor("alice", "alice-secret");

    const res = await worker.fetch(
      authRequest(`/api/v1/auth/registrations/${requestId}/reject`, {
        headers: {
          Origin: HOST,
          Cookie: `efcc_access=${adminAccess}`,
          "Idempotency-Key": "idem-reject-1",
          "Content-Type": "application/json",
        },
        body: { decisionNote: "資料不完整" },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    const body = (await assertCorrelated(res)) as {
      data: { accountStatus: string };
    };
    assert.strictEqual(body.data.accountStatus, "rejected");

    // The required rejection note (ADR-0006; migration 0012) is stored
    // atomically with the terminal transition.
    const row = await testDb()
      .prepare(
        "SELECT rejection_note FROM registration_requests WHERE request_id = ?"
      )
      .bind(requestId)
      .first<{ rejection_note: string | null }>();
    assert.strictEqual(row?.rejection_note, "資料不完整");

    // The rejected user cannot log in (no account was created).
    const login = await worker.fetch(
      authRequest("/api/v1/auth/login", {
        headers: { Origin: HOST },
        body: { username: "iris", password: "iris-password-1" },
      }),
      testEnv()
    );
    assert.strictEqual(login.status, 401);
  });

  test("reject an already-rejected request is an idempotent no-op success", async () => {
    const requestId = await registrationIdFor("iris");
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const res = await worker.fetch(
      authRequest(`/api/v1/auth/registrations/${requestId}/reject`, {
        headers: {
          Origin: HOST,
          Cookie: `efcc_access=${adminAccess}`,
          "Idempotency-Key": "idem-reject-1-replay",
          "Content-Type": "application/json",
        },
        body: { decisionNote: "重複拒絕（no-op）" },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as { data: { accountStatus: string } };
    assert.strictEqual(body.data.accountStatus, "rejected");
  });

  test("approve of a rejected request is a conflict (409)", async () => {
    const requestId = await registrationIdFor("iris");
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const res = await worker.fetch(
      authRequest(`/api/v1/auth/registrations/${requestId}/approve`, {
        headers: {
          Origin: HOST,
          Cookie: `efcc_access=${adminAccess}`,
          "Idempotency-Key": "idem-conflict-1",
        },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 409);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "CONFLICT");
  });

  test("approve an unknown registration id is a 404", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const res = await worker.fetch(
      authRequest(
        "/api/v1/auth/registrations/00000000-0000-0000-0000-000000000000/approve",
        {
          headers: {
            Origin: HOST,
            Cookie: `efcc_access=${adminAccess}`,
            "Idempotency-Key": "idem-missing-1",
          },
        }
      ),
      testEnv()
    );
    assert.strictEqual(res.status, 404);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "NOT_FOUND");
  });

  test("approve without an Idempotency-Key is rejected (422)", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const res = await worker.fetch(
      authRequest(
        "/api/v1/auth/registrations/00000000-0000-0000-0000-000000000000/approve",
        {
          headers: { Origin: HOST, Cookie: `efcc_access=${adminAccess}` },
        }
      ),
      testEnv()
    );
    assert.strictEqual(res.status, 422);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "VALIDATION");
  });

  test("approve without an access cookie is rejected (401)", async () => {
    const res = await worker.fetch(
      authRequest(
        "/api/v1/auth/registrations/00000000-0000-0000-0000-000000000000/approve",
        {
          headers: { Origin: HOST, "Idempotency-Key": "idem-noauth-1" },
        }
      ),
      testEnv()
    );
    assert.strictEqual(res.status, 401);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "AUTH_REQUIRED");
  });

  test("a non-admin caller cannot approve (403)", async () => {
    // bob is a Member — not allowed to approve.
    const memberAccess = await accessCookieFor("bob", "bob-secret");
    const res = await worker.fetch(
      authRequest(
        "/api/v1/auth/registrations/00000000-0000-0000-0000-000000000000/approve",
        {
          headers: {
            Origin: HOST,
            Cookie: `efcc_access=${memberAccess}`,
            "Idempotency-Key": "idem-forbidden-1",
          },
        }
      ),
      testEnv()
    );
    assert.strictEqual(res.status, 403);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "FORBIDDEN");
  });

  test("a Staff caller can approve (requireAdminOrStaff accepts Staff)", async () => {
    // eve is a Staff member — the canonical elevated role (ADR-0025).
    const candidate = `iris-${crypto.randomUUID().slice(0, 8)}`;
    const reg = await worker.fetch(
      authRequest("/api/v1/auth/register", {
        headers: { Origin: HOST, "Idempotency-Key": "idem-staff-approve" },
        body: {
          username: candidate,
          password: "iris-password-1",
          name: "Iris Wu",
          phone: "9123 4575",
        },
      }),
      testEnv()
    );
    assert.strictEqual(reg.status, 200);
    const requestId = await registrationIdFor(candidate);
    const staffAccess = await accessCookieFor("eve", "eve-secret");
    const res = await worker.fetch(
      authRequest(`/api/v1/auth/registrations/${requestId}/approve`, {
        headers: {
          Origin: HOST,
          Cookie: `efcc_access=${staffAccess}`,
          "Idempotency-Key": "idem-staff-approve",
        },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    const body = (await assertCorrelated(res)) as {
      data: { accountStatus: string };
    };
    assert.strictEqual(body.data.accountStatus, "active");
  });

  test("registration approval follows the capability policy, not the role label", async () => {
    const staffAccess = await accessCookieFor("eve", "eve-secret");
    await testDb()
      .prepare(
        "DELETE FROM role_capabilities WHERE role = 'Staff' AND capability = 'registration.approval.manage'"
      )
      .run();
    try {
      const res = await worker.fetch(
        authRequest("/api/v1/auth/registrations", {
          method: "GET",
          headers: {
            Origin: HOST,
            Cookie: `efcc_access=${staffAccess}`,
          },
        }),
        testEnv()
      );
      assert.strictEqual(res.status, 403);
      const body = await problemOf(res);
      assert.strictEqual(body.code, "FORBIDDEN");
    } finally {
      await testDb()
        .prepare(
          "INSERT OR IGNORE INTO role_capabilities (role, capability, granted_by, granted_at) VALUES ('Staff', 'registration.approval.manage', NULL, '2026-08-25T00:00:00.000Z')"
        )
        .run();
    }
  });

  test("suspended Staff cannot use registration approval capability", async () => {
    const staffAccess = await accessCookieFor("eve", "eve-secret");
    await testDb()
      .prepare("UPDATE accounts SET account_status = 'Suspended' WHERE user_id = 'U005'")
      .run();
    try {
      const res = await worker.fetch(
        authRequest("/api/v1/auth/registrations", {
          method: "GET",
          headers: {
            Origin: HOST,
            Cookie: `efcc_access=${staffAccess}`,
          },
        }),
        testEnv()
      );
      assert.strictEqual(res.status, 403);
      const body = await problemOf(res);
      assert.strictEqual(body.code, "FORBIDDEN");
    } finally {
      await testDb()
        .prepare("UPDATE accounts SET account_status = 'Active' WHERE user_id = 'U005'")
        .run();
    }
  });
});

describe("087-02 (#319): registration detail read + required rejection note", () => {
  test("reject without a decisionNote is a 422 and writes nothing", async () => {
    const reg = await worker.fetch(
      authRequest("/api/v1/auth/register", {
        headers: { Origin: HOST, "Idempotency-Key": "idem-reject-note-1" },
        body: {
          username: "noel",
          password: "noel-password-1",
          name: "Noel Tang",
          phone: "9123 4576",
        },
      }),
      testEnv()
    );
    assert.strictEqual(reg.status, 200);
    const requestId = await registrationIdFor("noel");
    const adminAccess = await accessCookieFor("alice", "alice-secret");

    // Empty body and whitespace-only note both fail closed.
    for (const [index, body] of [
      undefined,
      { decisionNote: "   " },
    ].entries()) {
      const res = await worker.fetch(
        authRequest(`/api/v1/auth/registrations/${requestId}/reject`, {
          headers: {
            Origin: HOST,
            Cookie: `efcc_access=${adminAccess}`,
            "Idempotency-Key": `idem-reject-note-1-${index}`,
            ...(body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
          },
          ...(body === undefined ? {} : { body }),
        }),
        testEnv()
      );
      assert.strictEqual(res.status, 422);
      const problem = await problemOf(res);
      assert.strictEqual(problem.code, "VALIDATION");
    }

    // Nothing was written: the request is still Pending and no account exists.
    const row = await testDb()
      .prepare(
        "SELECT account_status, rejection_note FROM registration_requests WHERE request_id = ?"
      )
      .bind(requestId)
      .first<{ account_status: string; rejection_note: string | null }>();
    assert.strictEqual(row?.account_status, "Pending");
    assert.strictEqual(row?.rejection_note, null);
    const account = await testDb()
      .prepare(
        "SELECT COUNT(*) AS n FROM accounts WHERE username_normalized = ?"
      )
      .bind("noel")
      .first<{ n: number }>();
    assert.strictEqual(Number(account?.n ?? 0), 0);
  });

  test("GET /registrations/:id returns the Pending request detail", async () => {
    const requestId = await registrationIdFor("noel");
    const adminAccess = await accessCookieFor("alice", "alice-secret");

    const res = await worker.fetch(
      authRequest(`/api/v1/auth/registrations/${requestId}`, {
        method: "GET",
        headers: { Origin: HOST, Cookie: `efcc_access=${adminAccess}` },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    const body = (await assertCorrelated(res)) as {
      data: {
        registration: {
          requestId: string;
          username: string;
          name: string;
          phone: string | null;
          status: string;
          role: string;
          submittedAt: number;
          decidedAt: number | null;
          decisionNote: string | null;
          decision: string | null;
        };
      };
    };
    assert.strictEqual(body.data.registration.requestId, requestId);
    assert.strictEqual(body.data.registration.username, "noel");
    assert.strictEqual(body.data.registration.name, "Noel Tang");
    assert.strictEqual(body.data.registration.phone, "9123 4576");
    assert.strictEqual(body.data.registration.status, "Pending");
    assert.strictEqual(body.data.registration.role, "Member");
    assert.ok(
      typeof body.data.registration.submittedAt === "number",
      "submittedAt must be an epoch-millis number"
    );
    assert.strictEqual(body.data.registration.decidedAt, null);
    assert.strictEqual(body.data.registration.decisionNote, null);
    assert.strictEqual(body.data.registration.decision, null);
    assertBodyHasNoTokenKeys(body);
  });

  test("GET /registrations/:id stays viewable read-only after a decision", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");

    // iris was rejected earlier with a note (see AUTH-06) — the detail
    // projects the recorded outcome.
    const rejectedId = await registrationIdFor("iris");
    const rejected = await worker.fetch(
      authRequest(`/api/v1/auth/registrations/${rejectedId}`, {
        method: "GET",
        headers: { Origin: HOST, Cookie: `efcc_access=${adminAccess}` },
      }),
      testEnv()
    );
    assert.strictEqual(rejected.status, 200);
    const rejectedBody = (await assertCorrelated(rejected)) as {
      data: {
        registration: {
          status: string;
          decidedAt: number | null;
          decisionNote: string | null;
          decision: string | null;
        };
      };
    };
    assert.strictEqual(rejectedBody.data.registration.status, "Rejected");
    assert.strictEqual(rejectedBody.data.registration.decision, "Rejected");
    assert.strictEqual(
      rejectedBody.data.registration.decisionNote,
      "資料不完整"
    );
    assert.ok(
      typeof rejectedBody.data.registration.decidedAt === "number",
      "decidedAt must be set after a decision"
    );

    // hugo was approved earlier — Active outcome, no note.
    const approvedId = await registrationIdFor("hugo");
    const approved = await worker.fetch(
      authRequest(`/api/v1/auth/registrations/${approvedId}`, {
        method: "GET",
        headers: { Origin: HOST, Cookie: `efcc_access=${adminAccess}` },
      }),
      testEnv()
    );
    assert.strictEqual(approved.status, 200);
    const approvedBody = (await assertCorrelated(approved)) as {
      data: {
        registration: {
          status: string;
          decidedAt: number | null;
          decisionNote: string | null;
          decision: string | null;
        };
      };
    };
    assert.strictEqual(approvedBody.data.registration.status, "Active");
    assert.strictEqual(approvedBody.data.registration.decision, "Approved");
    assert.strictEqual(approvedBody.data.registration.decisionNote, null);
    assert.ok(
      typeof approvedBody.data.registration.decidedAt === "number",
      "decidedAt must be set after a decision"
    );
  });

  test("GET /registrations/:id is Staff-allowed, Member-forbidden, 401/404 guarded", async () => {
    const requestId = await registrationIdFor("noel");

    const staffAccess = await accessCookieFor("eve", "eve-secret");
    const staff = await worker.fetch(
      authRequest(`/api/v1/auth/registrations/${requestId}`, {
        method: "GET",
        headers: { Origin: HOST, Cookie: `efcc_access=${staffAccess}` },
      }),
      testEnv()
    );
    assert.strictEqual(staff.status, 200);

    const memberAccess = await accessCookieFor("bob", "bob-secret");
    const member = await worker.fetch(
      authRequest(`/api/v1/auth/registrations/${requestId}`, {
        method: "GET",
        headers: { Origin: HOST, Cookie: `efcc_access=${memberAccess}` },
      }),
      testEnv()
    );
    assert.strictEqual(member.status, 403);
    assert.strictEqual((await problemOf(member)).code, "FORBIDDEN");

    const anonymous = await worker.fetch(
      authRequest(`/api/v1/auth/registrations/${requestId}`, {
        method: "GET",
        headers: { Origin: HOST },
      }),
      testEnv()
    );
    assert.strictEqual(anonymous.status, 401);
    assert.strictEqual((await problemOf(anonymous)).code, "AUTH_REQUIRED");

    const missing = await worker.fetch(
      authRequest(
        "/api/v1/auth/registrations/00000000-0000-0000-0000-000000000000",
        {
          method: "GET",
          headers: { Origin: HOST, Cookie: `efcc_access=${staffAccess}` },
        }
      ),
      testEnv()
    );
    assert.strictEqual(missing.status, 404);
    assert.strictEqual((await problemOf(missing)).code, "NOT_FOUND");
  });
});

describe("AUTH-05: registration queue listing", () => {
  test("GET /registrations lists Pending requests with safe metadata only", async () => {
    // A fresh Pending request to list.
    const reg = await worker.fetch(
      authRequest("/api/v1/auth/register", {
        headers: { Origin: HOST, "Idempotency-Key": "idem-queue-1" },
        body: {
          username: "kevin",
          password: "kevin-password-1",
          name: "Kevin Yu",
          phone: "9999-8888",
        },
      }),
      testEnv()
    );
    assert.strictEqual(reg.status, 200);

    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const res = await worker.fetch(
      authRequest("/api/v1/auth/registrations", {
        method: "GET",
        headers: { Origin: HOST, Cookie: `efcc_access=${adminAccess}` },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    const body = (await assertCorrelated(res)) as {
      data: { registrations: Record<string, unknown>[] };
    };
    assert.ok(
      Array.isArray(body.data.registrations),
      "registrations must be an array"
    );
    const kevin = body.data.registrations.find((r) => r.username === "kevin");
    assert.ok(kevin, "kevin's Pending request must be listed");
    assert.strictEqual(kevin.accountStatus, "Pending");
    assert.strictEqual(kevin.name, "Kevin Yu");
    assert.strictEqual(kevin.phone, "9999-8888");
    assert.strictEqual(typeof kevin.requestId, "string");
    assert.strictEqual(typeof kevin.submittedAt, "number");
    // The queue must never expose credential material or the identity key.
    assertBodyHasNoTokenKeys(body);
    const text = JSON.stringify(body);
    assert.ok(
      !/credential|password|pin|user_id|requires_upgrade/iu.test(text),
      `queue listing must not expose credential/identity material, got: ${text}`
    );
    assertNoCors(res);
  });

  test("GET /registrations without a session is rejected (401)", async () => {
    const res = await worker.fetch(
      authRequest("/api/v1/auth/registrations", {
        method: "GET",
        headers: { Origin: HOST },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 401);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "AUTH_REQUIRED");
  });

  test("a Member caller cannot list the queue (403)", async () => {
    const memberAccess = await accessCookieFor("bob", "bob-secret");
    const res = await worker.fetch(
      authRequest("/api/v1/auth/registrations", {
        method: "GET",
        headers: { Origin: HOST, Cookie: `efcc_access=${memberAccess}` },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 403);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "FORBIDDEN");
  });

  test("GET /registrations with POST method is not listed (404)", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const res = await worker.fetch(
      authRequest("/api/v1/auth/registrations", {
        method: "POST",
        headers: { Origin: HOST, Cookie: `efcc_access=${adminAccess}` },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 404);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "NOT_FOUND");
  });
});
