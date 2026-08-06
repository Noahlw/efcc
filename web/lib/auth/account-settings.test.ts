/**
 * UI-04 (#196) — self-service account settings: POST /api/v1/auth/username
 * and POST /api/v1/auth/password (Spec #191, locked contract).
 *
 * Acceptance covered here (from docs/omp-plans/2026-08-06-ui-04-ticket-196.md):
 *   - Username change preserves User_ID / QR identity; success returns
 *     `{ requestId, data: { username, sessionRevoked: true } }` and clears
 *     BOTH auth cookies via real Set-Cookie delete headers.
 *   - Duplicate usernames (casing/whitespace variants, registration_requests,
 *     and the concurrent race) fail closed with 409 and NO mutation.
 *   - An unchanged username is a value-idempotent no-op (200,
 *     `sessionRevoked: false`, no audit row, no revocation).
 *   - Password change requires the current password; wrong current is
 *     422 VALIDATION ("current password is incorrect"), NOT 401, with no
 *     audit row and no revocation. newPassword >= 8 chars (Unicode).
 *   - Every successful change writes ONE account_events row inside the same
 *     atomic batch, carrying NO credential material, and revokes ALL refresh
 *     sessions for the account.
 *   - Missing/invalid session -> 401; account not Active -> 403.
 *   - No password/hash/token/session key in any response body.
 */
/* oxlint-disable vitest/require-top-level-describe -- shared workerd/D1 fixture spans the suites. */
import assert from "node:assert/strict";

import { env } from "cloudflare:workers";
import { beforeAll, describe, test, expect, vi } from "vitest";

import { importLegacyUsers } from "./accounts";
import {
  AccountConflictError,
  changePassword,
  changeUsername,
} from "./account-settings";
import { verifyCredential } from "./credentials";
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from "./cookies";
import * as registrations from "./registrations";
import { signAccessToken, issueSession } from "./sessions";
import { applyMigrations, testDb } from "./test-bootstrap";
import { completeCredentialUpgrade } from "./upgrade";
import worker from "../../worker";
import type { Env } from "../../worker";

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
    APPS_SCRIPT_EXEC_URL: "https://script.google.com/macros/s/fake/exec",
    EFCC_ACCESS_TOKEN_SECRET: SECRET,
    ...overrides,
  };
}

function authRequest(
  path: string,
  init: {
    headers?: Record<string, string>;
    body?: unknown;
  } = {}
): Request {
  return new Request(`${HOST}${path}`, {
    method: "POST",
    headers: init.headers ?? {},
    body:
      init.body === undefined
        ? undefined
        : typeof init.body === "string"
          ? init.body
          : JSON.stringify(init.body),
  });
}

/** Sign an access token for an arbitrary uid (used for the suspended fixture). */
async function accessTokenFor(
  uid: string,
  sid = "sess-fixture"
): Promise<string> {
  return signAccessToken(SECRET, { sid, uid, iat: Date.now() });
}

async function sessionFor(userId: string): Promise<{
  access: string;
  refresh: string;
}> {
  const bundle = await issueSession(testDb(), {
    userId,
    accessTokenSecret: SECRET,
    deviceFingerprint: "test",
  });
  return { access: bundle.accessToken, refresh: bundle.sessionId };
}

function cookieHeader(access: string, refresh: string): Record<string, string> {
  return {
    Origin: HOST,
    "Content-Type": "application/json",
    Cookie: `${ACCESS_COOKIE_NAME}=${access}; ${REFRESH_COOKIE_NAME}=${refresh}`,
  };
}

async function activeSessionCount(userId: string): Promise<number> {
  const row = await testDb()
    .prepare(
      "SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND revoked_at IS NULL"
    )
    .bind(userId)
    .first();
  if (row && typeof row === "object" && "n" in row) {
    return Number(row.n);
  }
  return 0;
}

interface AuditRow {
  event_id: string;
  actor_user_id: string;
  action: string;
  old_username_normalized: string | null;
  new_username_normalized: string | null;
  correlation_id: string;
  created_at: number;
}

async function eventsFor(userId: string): Promise<AuditRow[]> {
  const result = await testDb()
    .prepare(
      `SELECT event_id, actor_user_id, action,
              old_username_normalized, new_username_normalized,
              correlation_id, created_at
         FROM account_events
        WHERE actor_user_id = ?
        ORDER BY created_at, event_id`
    )
    .bind(userId)
    .all<AuditRow>();
  return result.results ?? [];
}

/** Assert the response clears BOTH auth cookies via real delete headers. */
function assertCookiesCleared(res: Response): void {
  const setCookies = res.headers.getSetCookie();
  const names = setCookies.map((raw) => raw.split(";")[0].split("=")[0].trim());
  expect(names).toContain(ACCESS_COOKIE_NAME);
  expect(names).toContain(REFRESH_COOKIE_NAME);
  for (const raw of setCookies) {
    expect(raw).toMatch(/Max-Age=0/iu);
  }
}

/** Assert a response body carries no session/token/credential keys. */
function assertBodyHasNoSecretKeys(body: unknown): void {
  const text = JSON.stringify(body);
  expect(text).not.toMatch(
    /sessionId|accessToken|refreshToken|sessionToken|session_id|access_token|refresh_token|credential_hash|password/iu
  );
}

async function assertCorrelated(res: Response): Promise<Record<string, unknown>> {
  const header = res.headers.get("X-Request-Id");
  assert.ok(header, "X-Request-Id header must be present");
  const body = (await res.json()) as { requestId?: unknown };
  if (typeof body.requestId === "string") {
    expect(body.requestId).toBe(header);
  }
  return body as Record<string, unknown>;
}

async function problemOf(res: Response): Promise<{
  code: string;
  status: number;
  detail?: string;
}> {
  expect(res.headers.get("Content-Type")).toBe("application/problem+json");
  return (await res.json()) as { code: string; status: number; detail?: string };
}

beforeAll(async () => {
  await applyMigrations();
  await importLegacyUsers(testDb(), [
    HEADER,
    ["U001", "Alice Chan", "alice", "1234", "Admin", "Active"],
    ["U002", "Bob Lee", "bob", "5678", "Member", "Active"],
    ["U003", "Carol Wong", "carol", "0000", "Member", "Active"],
    // U004 stays Suspended: the self-service surface must refuse it (403).
    ["U004", "Dana Fox", "dana", "1111", "Member", "Suspended"],
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
    userId: "U003",
    legacyPin: "0000",
    newCredential: "carol-secret",
  });
});

describe("UI-04: POST /api/v1/auth/username", () => {
  test("happy path: 200, normalized value, audit row, all sessions revoked, cookies cleared", async () => {
    const { access, refresh } = await sessionFor("U001");
    await issueSession(testDb(), {
      userId: "U001",
      accessTokenSecret: SECRET,
      deviceFingerprint: "other-device",
    });

    const res = await worker.fetch(
      authRequest("/api/v1/auth/username", {
        headers: cookieHeader(access, refresh),
        body: { username: "  AliceNew  " },
      }),
      testEnv()
    );

    expect(res.status).toBe(200);
    const body = (await assertCorrelated(res)) as {
      data: { username: string; sessionRevoked: boolean };
    };
    expect(body.data.username).toBe("  AliceNew  ");
    expect(body.data.sessionRevoked).toBe(true);
    assertBodyHasNoSecretKeys(body);
    assertCookiesCleared(res);

    const account = await testDb()
      .prepare("SELECT * FROM accounts WHERE user_id = ?")
      .bind("U001")
      .first<{
        username: string;
        username_normalized: string;
        user_id: string;
        qr_code_string: string | null;
      }>();
    assert.ok(account, "account must still exist");
    expect(account.username_normalized).toBe("alicenew");
    // User_ID and QR identity default are immutable across the change.
    expect(account.user_id).toBe("U001");
    expect(account.qr_code_string).toBeNull();

    const events = await eventsFor("U001");
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe("username_changed");
    expect(events[0].old_username_normalized).toBe("alice");
    expect(events[0].new_username_normalized).toBe("alicenew");
    expect(events[0].correlation_id).toBe(
      res.headers.get("X-Request-Id")
    );
    // No credential material in the audit row.
    const rowText = JSON.stringify(events[0]);
    expect(rowText).not.toMatch(/password|hash|token|session|secret/iu);

    // Every refresh session for the account was revoked inside the batch.
    await expect(activeSessionCount("U001")).resolves.toBe(0);
  });

  test("duplicate (casing/whitespace variant) fails 409 with NO mutation", async () => {
    const { access, refresh } = await sessionFor("U002");
    const before = await eventsFor("U002");

    const res = await worker.fetch(
      authRequest("/api/v1/auth/username", {
        headers: cookieHeader(access, refresh),
        body: { username: "  CAROL " },
      }),
      testEnv()
    );

    expect(res.status).toBe(409);
    const problem = await problemOf(res);
    expect(problem.code).toBe("CONFLICT");
    expect(problem.detail).toBe("An account with that username already exists.");

    // No mutation: no audit row, sessions still live, username unchanged.
    const account = await testDb()
      .prepare("SELECT username, username_normalized FROM accounts WHERE user_id = ?")
      .bind("U002")
      .first<{ username: string; username_normalized: string }>();
    expect(account?.username_normalized).toBe("bob");
    expect(await eventsFor("U002")).toEqual(before);
    await expect(activeSessionCount("U002")).resolves.toBeGreaterThan(0);
  });

  test("duplicate against a pending registration request fails 409", async () => {
    const { access, refresh } = await sessionFor("U002");
    await testDb()
      .prepare(
        `INSERT INTO registration_requests (
           request_id, user_id, username, username_normalized, name,
           credential_hash, credential_kind, account_status, role, submitted_at
         ) VALUES (?, ?, ?, ?, ?, ?, 'password', 'Pending', 'Member', ?)`
      )
      .bind(
        "req-reserved",
        "req-user",
        "ReservedName",
        "reservedname",
        "Reserved Person",
        "pbkdf2:unused",
        Date.now()
      )
      .run();

    const res = await worker.fetch(
      authRequest("/api/v1/auth/username", {
        headers: cookieHeader(access, refresh),
        body: { username: "ReservedName" },
      }),
      testEnv()
    );

    expect(res.status).toBe(409);
    expect((await problemOf(res)).code).toBe("CONFLICT");
  });

  test("cross-table race past the pre-flight fails closed at the batch guard (409, zero side effects)", async () => {
    // A registration request claiming the target username is already committed,
    // but the pre-flight check is raced past (spy forces a pass). The batch
    // guard — NOT the pre-flight — is the uniqueness authority across
    // accounts + registration_requests (review P1 / advisory).
    await testDb()
      .prepare(
        `INSERT INTO registration_requests (
           request_id, user_id, username, username_normalized, name,
           credential_hash, credential_kind, account_status, role, submitted_at
         ) VALUES (?, ?, ?, ?, ?, ?, 'password', 'Pending', 'Member', ?)`
      )
      .bind(
        "req-race",
        "req-race-user",
        "RacerName",
        "racername",
        "Racer Person",
        "pbkdf2:unused",
        Date.now()
      )
      .run();

    const spy = vi
      .spyOn(registrations, "findRegistrationByUsername")
      .mockResolvedValue(null);
    const { access, refresh } = await sessionFor("U002");
    const before = await eventsFor("U002");
    try {
      const res = await worker.fetch(
        authRequest("/api/v1/auth/username", {
          headers: cookieHeader(access, refresh),
          body: { username: "RacerName" },
        }),
        testEnv()
      );
      expect(res.status).toBe(409);
      expect((await problemOf(res)).code).toBe("CONFLICT");
      // The spy must have been exercised — otherwise the pre-flight would have
      // rejected the duplicate itself and this test would not be covering the
      // batch guard at all.
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }

    // Lost race ⇒ zero side effects: account unchanged, no audit row, and no
    // session revocation (the guarded statements all no-op together).
    const account = await testDb()
      .prepare("SELECT username_normalized FROM accounts WHERE user_id = ?")
      .bind("U002")
      .first<{ username_normalized: string }>();
    expect(account?.username_normalized).toBe("bob");
    expect(await eventsFor("U002")).toEqual(before);
    await expect(activeSessionCount("U002")).resolves.toBeGreaterThan(0);
  });

  test("concurrent race fails closed: exactly one winner, one 409", async () => {
    const settled = await Promise.allSettled([
      changeUsername(testDb(), {
        userId: "U001",
        username: "raceuser",
        requestId: "race-1",
      }),
      changeUsername(testDb(), {
        userId: "U002",
        username: "raceuser",
        requestId: "race-2",
      }),
    ]);
    const fulfilled = settled.filter((r) => r.status === "fulfilled");
    const conflictRejected = settled.filter(
      (r): r is PromiseRejectedResult =>
        r.status === "rejected" && r.reason instanceof AccountConflictError
    );
    expect(fulfilled.length).toBe(1);
    expect(conflictRejected.length).toBe(1);

    // Exactly one account owns the normalized username; exactly one audit row.
    const owners = await testDb()
      .prepare(
        "SELECT user_id FROM accounts WHERE username_normalized = ?"
      )
      .bind("raceuser")
      .all<{ user_id: string }>();
    expect(owners.results ?? []).toHaveLength(1);
    const winnerId = owners.results?.[0]?.user_id;
    const events = await eventsFor(winnerId ?? "");
    // Exactly one race audit row for the target username.
    expect(
      events.filter(
        (e) =>
          e.action === "username_changed" &&
          e.new_username_normalized === "raceuser"
      )
    ).toHaveLength(1);
  });

  test("unchanged value is a value-idempotent no-op (200, no revocation)", async () => {
    const { access, refresh } = await sessionFor("U001");
    const before = await eventsFor("U001");

    const res = await worker.fetch(
      authRequest("/api/v1/auth/username", {
        headers: cookieHeader(access, refresh),
        body: { username: "  RACEUSER " },
      }),
      testEnv()
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { username: string; sessionRevoked: boolean };
    };
    expect(body.data.sessionRevoked).toBe(false);
    // No new audit row, no revocation, no cookie clearing.
    expect(await eventsFor("U001")).toEqual(before);
    await expect(activeSessionCount("U001")).resolves.toBeGreaterThan(0);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  test("empty username after trim -> 422 VALIDATION", async () => {
    const { access, refresh } = await sessionFor("U001");
    const res = await worker.fetch(
      authRequest("/api/v1/auth/username", {
        headers: cookieHeader(access, refresh),
        body: { username: "   " },
      }),
      testEnv()
    );
    expect(res.status).toBe(422);
    const problem = await problemOf(res);
    expect(problem.code).toBe("VALIDATION");
    expect(problem.detail).toBe("username is required.");
  });

  test("malformed body -> 422 VALIDATION", async () => {
    const { access, refresh } = await sessionFor("U001");
    const res = await worker.fetch(
      authRequest("/api/v1/auth/username", {
        headers: cookieHeader(access, refresh),
        body: "{not json",
      }),
      testEnv()
    );
    expect(res.status).toBe(422);
    expect((await problemOf(res)).code).toBe("VALIDATION");
  });

  test("missing session -> 401; suspended account -> 403", async () => {
    const noCookie = await worker.fetch(
      authRequest("/api/v1/auth/username", { body: { username: "x" } }),
      testEnv()
    );
    expect(noCookie.status).toBe(401);
    expect((await problemOf(noCookie)).code).toBe("AUTH_REQUIRED");

    const suspended = await worker.fetch(
      authRequest("/api/v1/auth/username", {
        headers: {
          Origin: HOST,
          "Content-Type": "application/json",
          Cookie: `${ACCESS_COOKIE_NAME}=${await accessTokenFor("U004")}`,
        },
        body: { username: "newdana" },
      }),
      testEnv()
    );
    expect(suspended.status).toBe(403);
    expect((await problemOf(suspended)).code).toBe("FORBIDDEN");
  });
});

describe("UI-04: POST /api/v1/auth/password", () => {
  test("happy path: 200, sessionRevoked true, audit row, sessions revoked, cookies cleared", async () => {
    const { access, refresh } = await sessionFor("U002");

    const res = await worker.fetch(
      authRequest("/api/v1/auth/password", {
        headers: cookieHeader(access, refresh),
        body: { currentPassword: "bob-secret", newPassword: "bob-new-secret" },
      }),
      testEnv()
    );

    expect(res.status).toBe(200);
    const body = (await assertCorrelated(res)) as {
      data: { sessionRevoked: boolean };
    };
    expect(body.data.sessionRevoked).toBe(true);
    assertBodyHasNoSecretKeys(body);
    assertCookiesCleared(res);

    const events = await eventsFor("U002");
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe("password_changed");
    expect(events[0].old_username_normalized).toBeNull();
    expect(events[0].new_username_normalized).toBeNull();
    // No credential material in the audit row: neither the old nor new
    // secret value, nor any credential/hash key.
    const rowText = JSON.stringify(events[0]);
    expect(rowText).not.toContain("bob-secret");
    expect(rowText).not.toContain("bob-new-secret");
    expect(rowText).not.toMatch(/credential_hash|pbkdf2/iu);

    await expect(activeSessionCount("U002")).resolves.toBe(0);

    // The new credential verifies; the old one no longer does.
    const account = await testDb()
      .prepare("SELECT credential_hash, credential_kind FROM accounts WHERE user_id = ?")
      .bind("U002")
      .first<{ credential_hash: string; credential_kind: string }>();
    assert.ok(account);
    expect(account.credential_kind).toBe("password");
    await expect(
      verifyCredential("bob-new-secret", account.credential_hash)
    ).resolves.toBe(true);
    await expect(
      verifyCredential("bob-secret", account.credential_hash)
    ).resolves.toBe(false);
  });

  test("wrong current password -> 422 VALIDATION, NO audit, NO revocation", async () => {
    const { access, refresh } = await sessionFor("U003");
    const before = await eventsFor("U003");

    const res = await worker.fetch(
      authRequest("/api/v1/auth/password", {
        headers: cookieHeader(access, refresh),
        body: { currentPassword: "wrong-current", newPassword: "carol-new-secret" },
      }),
      testEnv()
    );

    expect(res.status).toBe(422);
    const problem = await problemOf(res);
    expect(problem.code).toBe("VALIDATION");
    expect(problem.detail).toBe("current password is incorrect");
    // Deliberately not 401: never conflatable with session expiry.
    expect(res.status).not.toBe(401);

    expect(await eventsFor("U003")).toEqual(before);
    await expect(activeSessionCount("U003")).resolves.toBeGreaterThan(0);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  test("newPassword shorter than 8 chars -> 422", async () => {
    const { access, refresh } = await sessionFor("U003");
    const res = await worker.fetch(
      authRequest("/api/v1/auth/password", {
        headers: cookieHeader(access, refresh),
        body: { currentPassword: "carol-secret", newPassword: "short7" },
      }),
      testEnv()
    );
    expect(res.status).toBe(422);
    const problem = await problemOf(res);
    expect(problem.code).toBe("VALIDATION");
    expect(problem.detail).toBe("newPassword must be at least 8 characters.");
  });

  test("missing fields -> 422", async () => {
    const { access, refresh } = await sessionFor("U003");
    for (const body of [
      { newPassword: "carol-new-secret" },
      { currentPassword: "carol-secret" },
      {},
    ]) {
      const res = await worker.fetch(
        authRequest("/api/v1/auth/password", {
          headers: cookieHeader(access, refresh),
          body,
        }),
        testEnv()
      );
      expect(res.status).toBe(422);
      expect((await problemOf(res)).code).toBe("VALIDATION");
    }
  });

  test("Unicode newPassword of 8+ chars is accepted", async () => {
    const { access, refresh } = await sessionFor("U003");
    const res = await worker.fetch(
      authRequest("/api/v1/auth/password", {
        headers: cookieHeader(access, refresh),
        body: {
          currentPassword: "carol-secret",
          newPassword: "密碼密碼密碼密碼",
        },
      }),
      testEnv()
    );
    expect(res.status).toBe(200);
    expect(
      ((await res.json()) as { data: { sessionRevoked: boolean } }).data
        .sessionRevoked
    ).toBe(true);
  });

  test("repo layer: changePassword rejects a wrong current password directly", async () => {
    await expect(
      changePassword(testDb(), {
        userId: "U003",
        currentPassword: "nope",
        newPassword: "whatever-ok",
        requestId: "direct-1",
      })
    ).rejects.toThrow(/current password is incorrect/iu);
  });
});

describe("UI-04: migration 0001 account_events", () => {
  test("applies idempotently and enforces PK + action CHECK", async () => {
    await applyMigrations();

    // PK enforced: duplicate event_id aborts.
    const base = await eventsFor("U001");
    assert.ok(base.length > 0, "prior suites must have written audit rows");
    await expect(
      testDb()
        .prepare(
          `INSERT INTO account_events (
             event_id, actor_user_id, action,
             old_username_normalized, new_username_normalized,
             correlation_id, created_at
           ) VALUES (?, ?, 'username_changed', 'a', 'b', 'c', 1)`
        )
        .bind(base[0].event_id, "U009")
        .run()
    ).rejects.toThrow();

    // CHECK enforced: an action outside the locked vocabulary aborts.
    await expect(
      testDb()
        .prepare(
          `INSERT INTO account_events (
             event_id, actor_user_id, action,
             old_username_normalized, new_username_normalized,
             correlation_id, created_at
           ) VALUES (?, ?, 'credential_reset', NULL, NULL, 'c', 1)`
        )
        .bind("evt-invalid-action", "U009")
        .run()
    ).rejects.toThrow();
  });
});