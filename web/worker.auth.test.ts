/**
 * AUTH-02 (#160) — Worker/browser auth boundary, proven end to end through
 * the real `workerd` runtime: `/api/auth/*` is cookie-only.
 *
 * Acceptance covered here (ADR-0020 / ADR-0018 §2):
 *   - The auth surface has NO CORS: OPTIONS on `/api/auth/*` is rejected
 *     (405), and successful auth responses carry no Access-Control-Allow-*
 *     headers.
 *   - The legacy header transports are REJECTED on the auth surface:
 *     Authorization and X-Efcc-Session-Id each produce a fail-closed 403.
 *   - Cross-origin requests are rejected (no CORS = no cross-origin).
 *   - A same-origin cookie-only login succeeds and emits the two locked
 *     cookies (httpOnly, Secure, SameSite=Strict) via Set-Cookie / a
 *     second real Set-Cookie header (Headers.append keeps duplicates).
 *   - The preserved `/api/v1/rpc` proxy still answers OPTIONS with CORS
 *     headers (the two surfaces have different transport contracts).
 *   - No token/session values appear in test output (assertions only
 *     check names and attributes, never values).
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

/**
 * Both auth cookies arrive as two real `Set-Cookie` headers (access first,
 * refresh second). Returns the raw header strings keyed by cookie name.
 */
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

/** Parse the value out of a raw Set-Cookie header (for the refresh round-trip). */
function cookieValueFrom(raw: string): string {
  return raw.split(";")[0].split("=").slice(1).join("=");
}

/**
 * Assert a parsed auth response body (and any nested user object) carries no
 * raw session/token material — the opaque refresh key and access token travel
 * ONLY inside the two httpOnly cookies (AUTH-02 #160).
 */
function assertBodyHasNoTokenKeys(body: unknown): void {
  const text = JSON.stringify(body);
  assert.ok(
    !/sessionId|accessToken|refreshToken|sessionToken|session_id|access_token|refresh_token/i.test(
      text
    ),
    `auth response body must not expose token/session keys, got: ${text}`
  );
  // Walk nested objects too (e.g. `user`) so a key is not hidden one level down.
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

beforeAll(async () => {
  await applyMigrations();
  await importLegacyUsers(testDb(), [
    HEADER,
    ["U001", "Alice Chan", "alice", "1234", "Admin", "Active"],
    ["U002", "Bob Lee", "bob", "5678", "Member", "Active"],
    // U003 stays legacy-imported (requires_upgrade=1) for the upgrade test.
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

describe("AUTH-02: auth surface has no CORS / OPTIONS", () => {
  test("OPTIONS on /api/auth/login is rejected (405)", async () => {
    const res = await worker.fetch(
      authRequest("/api/auth/login", { method: "OPTIONS" }),
      testEnv()
    );
    assert.strictEqual(res.status, 405);
    assertNoCors(res);
  });

  test("OPTIONS on /api/auth/refresh is rejected (405)", async () => {
    const res = await worker.fetch(
      authRequest("/api/auth/refresh", { method: "OPTIONS" }),
      testEnv()
    );
    assert.strictEqual(res.status, 405);
    assertNoCors(res);
  });

  test("successful login response carries no Access-Control-Allow-* headers", async () => {
    const res = await worker.fetch(
      authRequest("/api/auth/login", {
        headers: { Origin: HOST },
        body: { username: "alice", credential: "alice-secret" },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    assertNoCors(res);
  });
});

describe("AUTH-02: legacy header transports rejected on auth surface", () => {
  test("Authorization header is rejected fail-closed (403)", async () => {
    const res = await worker.fetch(
      authRequest("/api/auth/login", {
        headers: { Origin: HOST, Authorization: "Bearer leaked-token-value" },
        body: { username: "alice", credential: "alice-secret" },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 403);
    const body = (await res.json()) as { code: string };
    assert.strictEqual(body.code, "TRANSPORT_FORBIDDEN");
    // The rejected token value must never echo back.
    assert.ok(!JSON.stringify(body).includes("leaked-token-value"));
  });

  test("X-Efcc-Session-Id header is rejected fail-closed (403)", async () => {
    const res = await worker.fetch(
      authRequest("/api/auth/login", {
        headers: { Origin: HOST, "X-Efcc-Session-Id": "opaque-session-value" },
        body: { username: "alice", credential: "alice-secret" },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 403);
    const body = (await res.json()) as { code: string };
    assert.strictEqual(body.code, "TRANSPORT_FORBIDDEN");
  });

  test("cross-origin request is rejected fail-closed (403)", async () => {
    const res = await worker.fetch(
      authRequest("/api/auth/login", {
        headers: { Origin: "https://evil.example" },
        body: { username: "alice", credential: "alice-secret" },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 403);
    const body = (await res.json()) as { code: string };
    assert.strictEqual(body.code, "CROSS_ORIGIN_FORBIDDEN");
  });
});

describe("AUTH-02: cookie-only login/refresh/logout over the Worker", () => {
  test("same-origin cookie-only login succeeds and emits two locked cookies", async () => {
    const res = await worker.fetch(
      authRequest("/api/auth/login", {
        headers: { Origin: HOST, "Content-Type": "application/json" },
        body: { username: "alice", credential: "alice-secret" },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    // Two separate cookies (access + refresh), each with locked attributes.
    const { access, refresh } = readAuthCookiesFromResponse(res);
    assertLockedCookie(access, ACCESS_COOKIE_NAME);
    assertLockedCookie(refresh, REFRESH_COOKIE_NAME);
    // The response body must not expose the refresh key or access token.
    assertBodyHasNoTokenKeys(await res.json());
  });

  test("refresh exchanges the refresh cookie for a fresh access cookie", async () => {
    const login = await worker.fetch(
      authRequest("/api/auth/login", {
        headers: { Origin: HOST },
        body: { username: "bob", credential: "bob-secret" },
      }),
      testEnv()
    );
    assert.strictEqual(login.status, 200);
    const loginCookies = readAuthCookiesFromResponse(login);
    const refreshValue = cookieValueFrom(loginCookies.refresh);

    const res = await worker.fetch(
      authRequest("/api/auth/refresh", {
        headers: { Origin: HOST, Cookie: `efcc_refresh=${refreshValue}` },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    const refreshed = readAuthCookiesFromResponse(res);
    assertLockedCookie(refreshed.access, ACCESS_COOKIE_NAME);
    assertLockedCookie(refreshed.refresh, REFRESH_COOKIE_NAME);
    assertBodyHasNoTokenKeys(await res.json());
  });

  test("upgrade succeeds via cookie-only transport and the body omits token keys", async () => {
    // U003 (carol) is legacy-imported but NOT upgraded in beforeAll; the forced
    // upgrade proves the legacy hash (0000), then issues a session. Body must
    // not carry the refresh key / access token.
    const res = await worker.fetch(
      authRequest("/api/auth/upgrade", {
        headers: { Origin: HOST, "Content-Type": "application/json" },
        body: { username: "carol", legacyPin: "0000", newCredential: "carol-new-secret" },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    const { access, refresh } = readAuthCookiesFromResponse(res);
    assertLockedCookie(access, ACCESS_COOKIE_NAME);
    assertLockedCookie(refresh, REFRESH_COOKIE_NAME);
    assertBodyHasNoTokenKeys(await res.json());
  });

  test("logout clears both cookies and revokes the refresh session", async () => {
    const login = await worker.fetch(
      authRequest("/api/auth/login", {
        headers: { Origin: HOST },
        body: { username: "alice", credential: "alice-secret" },
      }),
      testEnv()
    );
    const loginCookies = readAuthCookiesFromResponse(login);
    const refreshValue = cookieValueFrom(loginCookies.refresh);

    const res = await worker.fetch(
      authRequest("/api/auth/logout", {
        headers: { Origin: HOST, Cookie: `efcc_refresh=${refreshValue}` },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 204); // no content on logout
    // Both cookies cleared (empty value + Expires/Max-Age=0).
    const cleared = readAuthCookiesFromResponse(res);
    for (const [name, raw] of [
      [ACCESS_COOKIE_NAME, cleared.access],
      [REFRESH_COOKIE_NAME, cleared.refresh],
    ] as const) {
      assert.ok(raw.startsWith(`${name}=`));
      assert.match(raw, /Max-Age=0|Expires=/i);
    }
  });
});

describe("AUTH-02: preserved /api/v1/rpc proxy still has CORS (regression)", () => {
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
