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
 *     { accountStatus } }`, Idempotency-Key required, Admin/Teacher-only,
 *     idempotent replay, and conflict/404 handling.
 *   - Every response carries `X-Request-Id` matching the body `requestId`.
 *   - No credential or token value appears in any response body or log.
 *   - The preserved `/api/v1/rpc` proxy still answers OPTIONS with CORS
 *     headers (the two surfaces have different transport contracts).
 */
import assert from "node:assert/strict";
import { beforeAll, describe, test } from "vitest";

import { env } from "cloudflare:workers";

import worker from "./worker";
import type { Env } from "./worker";
import { applyMigrations, testDb } from "./lib/auth/test-bootstrap";
import { importLegacyUsers } from "./lib/auth/accounts";
import { completeCredentialUpgrade } from "./lib/auth/upgrade";
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
} from "./lib/auth/cookies";

const SECRET = "test-access-token-secret";
const HEADER = ["User_ID", "Name", "Username", "PIN_Code", "System_Role", "Status"];
const HOST = "https://efcc.example";

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...(env as unknown as Env),
    APPS_SCRIPT_EXEC_URL: "https://script.google.com/macros/s/fake/exec",
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
  assert.ok(raw!.startsWith(`${name}=`), `${name} cookie named correctly`);
  assert.match(raw!, /; HttpOnly/i, `${name} must be httpOnly`);
  assert.match(raw!, /; Secure/i, `${name} must be Secure`);
  assert.match(raw!, /; SameSite=Strict/i, `${name} must be SameSite=Strict`);
}

function readAuthCookiesFromResponse(
  res: Response
): { access: string; refresh: string } {
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
  return { access: found[ACCESS_COOKIE_NAME], refresh: found[REFRESH_COOKIE_NAME] };
}

function cookieValueFrom(raw: string): string {
  return raw.split(";")[0].split("=").slice(1).join("=");
}

/**
 * Assert an auth response body (and any nested object) carries no raw
 * session/token material AND that its `requestId` equals the X-Request-Id
 * header (ADR-0018 §8 / AUTH-04 correlation).
 */
function assertBodyHasNoTokenKeys(body: unknown): void {
  const text = JSON.stringify(body);
  assert.ok(
    !/sessionId|accessToken|refreshToken|sessionToken|session_id|access_token|refresh_token/i.test(
      text
    ),
    `auth response body must not expose token/session keys, got: ${text}`
  );
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        assert.ok(
          !/session|token/i.test(k),
          `auth response body must not contain a '${k}' key`
        );
        walk(val);
      }
    }
  };
  walk(body);
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
type ProblemBody = { code: string; status: number; requestId: string };

async function problemOf(res: Response): Promise<ProblemBody> {
  return (await res.json()) as ProblemBody;
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
  return row!.request_id;
}

/** Log in as an upgraded account and return the raw access cookie value. */
async function accessCookieFor(username: string, password: string): Promise<string> {
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
        body: { username: "dave", password: "dave-password-1", name: "Dave Ng" },
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
        body: { username: "erin", password: "erin-password-1", name: "Erin Ho" },
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
        body: { username: "grace", password: "short", name: "Grace Wu" },
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
        body: { username: "dave", password: "dave-password-2", name: "Dave Again" },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 409);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "CONFLICT");
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
    assert.notStrictEqual(r1, r2, "each login must mint a distinct refresh session");
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
    assert.strictEqual(res.headers.getSetCookie().length, 0, "no cookies before upgrade");
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
    assert.notStrictEqual(newRefresh, oldRefresh, "refresh must rotate the opaque value");

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
    assert.ok(res.headers.get("X-Request-Id"), "logout must carry X-Request-Id");
    const cleared = readAuthCookiesFromResponse(res);
    for (const [name, raw] of [
      [ACCESS_COOKIE_NAME, cleared.access],
      [REFRESH_COOKIE_NAME, cleared.refresh],
    ] as const) {
      assert.ok(raw.startsWith(`${name}=`));
      assert.match(raw, /Max-Age=0|Expires=/i);
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
        body: { username: "hugo", password: "hugo-password-1", name: "Hugo Ma" },
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

  test("reject marks a Pending registration as rejected without an account", async () => {
    const reg = await worker.fetch(
      authRequest("/api/v1/auth/register", {
        headers: { Origin: HOST, "Idempotency-Key": "idem-reject-1" },
        body: { username: "iris", password: "iris-password-1", name: "Iris Lam" },
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
        },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    const body = (await assertCorrelated(res)) as {
      data: { accountStatus: string };
    };
    assert.strictEqual(body.data.accountStatus, "rejected");

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
        },
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
      authRequest("/api/v1/auth/registrations/00000000-0000-0000-0000-000000000000/approve", {
        headers: {
          Origin: HOST,
          Cookie: `efcc_access=${adminAccess}`,
          "Idempotency-Key": "idem-missing-1",
        },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 404);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "NOT_FOUND");
  });

  test("approve without an Idempotency-Key is rejected (422)", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const res = await worker.fetch(
      authRequest("/api/v1/auth/registrations/00000000-0000-0000-0000-000000000000/approve", {
        headers: { Origin: HOST, Cookie: `efcc_access=${adminAccess}` },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 422);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "VALIDATION");
  });

  test("approve without an access cookie is rejected (401)", async () => {
    const res = await worker.fetch(
      authRequest("/api/v1/auth/registrations/00000000-0000-0000-0000-000000000000/approve", {
        headers: { Origin: HOST, "Idempotency-Key": "idem-noauth-1" },
      }),
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
      authRequest("/api/v1/auth/registrations/00000000-0000-0000-0000-000000000000/approve", {
        headers: {
          Origin: HOST,
          Cookie: `efcc_access=${memberAccess}`,
          "Idempotency-Key": "idem-forbidden-1",
        },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 403);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "FORBIDDEN");
  });
});

describe("AUTH-06: preserved /api/v1/rpc proxy still has CORS (regression)", () => {
  test("OPTIONS on /api/v1/rpc still returns 204 with CORS headers", async () => {
    const res = await worker.fetch(
      authRequest("/api/v1/rpc", {
        method: "OPTIONS",
        headers: { Origin: HOST },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 204);
    assert.ok(res.headers.get("Access-Control-Allow-Origin"));
    assert.ok(res.headers.get("Access-Control-Allow-Methods")!.includes("POST"));
  });
});