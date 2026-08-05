/**
 * AUTH-02 (#160) — Worker/D1 session lifecycle: short-lived access token +
 * 90-day-idle refresh session, multi-device, and revocation.
 *
 * Acceptance covered here:
 *   - Login issues exactly one new refresh-session row plus one access token;
 *     restore-on-load (refresh) exchanges a valid refresh session for a fresh
 *     access token with no credential re-entry.
 *   - An access token verifies statelessly (no D1 read) for its full ~15 min
 *     lifetime; expiry triggers a refresh-session lookup, not a hard logout.
 *   - Logout, a credential change, and an admin-suspend action each revoke the
 *     refresh session; a revoked session's outstanding access token stops
 *     working within its remaining lifetime and can never be silently renewed.
 *   - A member holds valid sessions on multiple devices simultaneously;
 *     revoking one does not affect the others.
 *   - An idle refresh session (no successful refresh for 90 days) expires and
 *     requires full re-login; an actively used session never forces re-entry.
 *   - No credential, token, or raw session value appears in test output.
 */
/* oxlint-disable vitest/require-top-level-describe -- one shared D1 fixture spans the suites. */
import { describe, test, expect, beforeAll } from "vitest";

import { importLegacyUsers } from "./accounts";
import { ACCESS_TOKEN_TTL_MS, REFRESH_IDLE_TTL_MS } from "./credentials";
import {
  issueSession,
  refreshSession,
  revokeSession,
  revokeAllUserSessions,
  verifyAccessToken,
} from "./sessions";
import { applyMigrations, testDb } from "./test-bootstrap";
import { completeCredentialUpgrade } from "./upgrade";

const SECRET = "test-access-token-secret";
const HEADER = [
  "User_ID",
  "Name",
  "Username",
  "PIN_Code",
  "System_Role",
  "Status",
];

/** Upgrade a legacy account so sessions can be issued. */
async function upgrade(userId: string, pin: string, newCred: string) {
  await completeCredentialUpgrade(testDb(), {
    userId,
    legacyPin: pin,
    newCredential: newCred,
  });
}

/** Count active (non-revoked) sessions for a user. */
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

async function sessionRevoked(sessionId: string): Promise<boolean> {
  const row = await testDb()
    .prepare("SELECT revoked_at FROM sessions WHERE session_id = ?")
    .bind(sessionId)
    .first();
  if (row && typeof row === "object" && "revoked_at" in row) {
    return row.revoked_at !== null;
  }
  // Unknown or missing sessions are treated as revoked.
  return true;
}

beforeAll(async () => {
  await applyMigrations();
  await importLegacyUsers(testDb(), [
    HEADER,
    ["U001", "Alice Chan", "alice", "1234", "Admin", "Active"],
    ["U002", "Bob Lee", "bob", "5678", "Member", "Active"],
    ["U003", "Carol Wong", "carol", "0000", "Member", "Active"],
  ]);
  await upgrade("U001", "1234", "alice-secret");
  await upgrade("U002", "5678", "bob-secret");
  await upgrade("U003", "0000", "carol-secret");
});

describe("AUTH-02: issue", () => {
  test("login issues exactly one refresh-session row plus one access token", async () => {
    const before = await activeSessionCount("U001");
    const bundle = await issueSession(testDb(), {
      userId: "U001",
      accessTokenSecret: SECRET,
      deviceFingerprint: "device-a",
    });
    await expect(activeSessionCount("U001")).resolves.toBe(before + 1);
    expect(bundle.sessionId).toBeTruthy();
    expect(bundle.accessToken).toBeTruthy();
    expect(bundle.expiresAt - bundle.issuedAt).toBe(REFRESH_IDLE_TTL_MS);
  });

  test("multi-device: independent sessions for the same member", async () => {
    const a = await issueSession(testDb(), {
      userId: "U001",
      accessTokenSecret: SECRET,
      deviceFingerprint: "phone",
    });
    const b = await issueSession(testDb(), {
      userId: "U001",
      accessTokenSecret: SECRET,
      deviceFingerprint: "tablet",
    });
    expect(a.sessionId).not.toBe(b.sessionId);
    await expect(activeSessionCount("U001")).resolves.toBeGreaterThanOrEqual(2);
    // Revoking one device leaves the other valid.
    await revokeSession(testDb(), a.sessionId);
    await expect(sessionRevoked(a.sessionId)).resolves.toBeTruthy();
    await expect(sessionRevoked(b.sessionId)).resolves.toBeFalsy();
    const bRefresh = await refreshSession(testDb(), {
      sessionId: b.sessionId,
      accessTokenSecret: SECRET,
    });
    expect(bRefresh.accessToken).toBeTruthy();
  });
});

describe("AUTH-02: stateless access-token verification", () => {
  test("token verifies statelessly for its full lifetime", async () => {
    const bundle = await issueSession(testDb(), {
      userId: "U002",
      accessTokenSecret: SECRET,
    });
    const nearIssue = await verifyAccessToken(
      SECRET,
      bundle.accessToken,
      bundle.issuedAt
    );
    expect(nearIssue).not.toBeNull();
    if (nearIssue === null) {
      return;
    }
    expect(nearIssue.uid).toBe("U002");
    expect(nearIssue.sid).toBe(bundle.sessionId);

    // Just before expiry is still valid (no hard logout).
    const ttl = bundle.issuedAt + ACCESS_TOKEN_TTL_MS;
    const beforeExpiry = await verifyAccessToken(
      SECRET,
      bundle.accessToken,
      ttl - 1
    );
    expect(beforeExpiry).not.toBeNull();
  });

  test("expired token is rejected but refresh still works (not a hard logout)", async () => {
    const bundle = await issueSession(testDb(), {
      userId: "U002",
      accessTokenSecret: SECRET,
    });
    const atExpiry = await verifyAccessToken(
      SECRET,
      bundle.accessToken,
      bundle.issuedAt + ACCESS_TOKEN_TTL_MS
    );
    expect(atExpiry).toBeNull();

    // Refresh session is still valid -> exchange for a fresh token.
    const refreshed = await refreshSession(testDb(), {
      sessionId: bundle.sessionId,
      accessTokenSecret: SECRET,
    });
    expect(refreshed.accessToken).toBeTruthy();
    const freshClaims = await verifyAccessToken(SECRET, refreshed.accessToken);
    expect(freshClaims).not.toBeNull();
  });

  test("tampered token is rejected", async () => {
    const bundle = await issueSession(testDb(), {
      userId: "U002",
      accessTokenSecret: SECRET,
    });
    const tampered = `${bundle.accessToken.slice(0, -1)}a`;
    await expect(verifyAccessToken(SECRET, tampered)).resolves.toBeNull();
  });

  test("token from a different secret is rejected", async () => {
    const bundle = await issueSession(testDb(), {
      userId: "U002",
      accessTokenSecret: SECRET,
    });
    await expect(
      verifyAccessToken("other-secret", bundle.accessToken)
    ).resolves.toBeNull();
  });
});

describe("AUTH-02: refresh idle expiry", () => {
  test("idle expiry (no refresh for 90 days) requires full re-login", async () => {
    const bundle = await issueSession(testDb(), {
      userId: "U002",
      accessTokenSecret: SECRET,
      now: 1_000_000,
    });
    // 90 days + 1s later, untouched -> idle-expired.
    await expect(
      refreshSession(testDb(), {
        sessionId: bundle.sessionId,
        accessTokenSecret: SECRET,
        now: 1_000_000 + REFRESH_IDLE_TTL_MS + 1,
      })
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });

  test("active use (touch on refresh) never forces re-entry", async () => {
    const bundle = await issueSession(testDb(), {
      userId: "U002",
      accessTokenSecret: SECRET,
      now: 1_000_000,
    });
    // Refresh at day 80 -> idle window extended past day 90.
    const day80 = 1_000_000 + 80 * 24 * 60 * 60 * 1000;
    const refreshed = await refreshSession(testDb(), {
      sessionId: bundle.sessionId,
      accessTokenSecret: SECRET,
      now: day80,
    });
    expect(refreshed.accessToken).toBeTruthy();
    // Day 100 -> still valid because the touch re-anchored expiry. The refresh
    // ROTATED the opaque value, so the next call uses the value returned by
    // the previous refresh (RFC 9700 §4.14.2).
    const after = await refreshSession(testDb(), {
      sessionId: refreshed.sessionId,
      accessTokenSecret: SECRET,
      now: day80 + 20 * 24 * 60 * 60 * 1000,
    });
    expect(after.accessToken).toBeTruthy();
  });

  test("refresh rotates the opaque value; the old value is invalidated immediately", async () => {
    const bundle = await issueSession(testDb(), {
      userId: "U002",
      accessTokenSecret: SECRET,
    });
    const first = await refreshSession(testDb(), {
      sessionId: bundle.sessionId,
      accessTokenSecret: SECRET,
    });
    const firstClaims = await verifyAccessToken(SECRET, first.accessToken);
    const oldRevoked = await sessionRevoked(bundle.sessionId);
    // The old value can never be renewed again.
    await expect(
      refreshSession(testDb(), {
        sessionId: bundle.sessionId,
        accessTokenSecret: SECRET,
      })
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    // A second refresh on the rotated value issues yet another new value.
    const second = await refreshSession(testDb(), {
      sessionId: first.sessionId,
      accessTokenSecret: SECRET,
    });
    const firstRevoked = await sessionRevoked(first.sessionId);
    expect({
      firstRotated: first.sessionId !== bundle.sessionId,
      firstTokenBound: firstClaims?.sid === first.sessionId,
      oldRevoked,
      secondRotated: second.sessionId !== first.sessionId,
      firstRevoked,
    }).toStrictEqual({
      firstRotated: true,
      firstTokenBound: true,
      oldRevoked: true,
      secondRotated: true,
      firstRevoked: true,
    });
  });

  test("concurrent refreshes consume one opaque value only once", async () => {
    const now = 9_000_000;
    const bundle = await issueSession(testDb(), {
      userId: "U002",
      accessTokenSecret: SECRET,
      now,
    });
    const attempts = await Promise.allSettled([
      refreshSession(testDb(), {
        sessionId: bundle.sessionId,
        accessTokenSecret: SECRET,
        now,
      }),
      refreshSession(testDb(), {
        sessionId: bundle.sessionId,
        accessTokenSecret: SECRET,
        now,
      }),
    ]);

    expect(
      attempts.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    expect(
      attempts.filter((result) => result.status === "rejected")
    ).toHaveLength(1);
    const row = await testDb()
      .prepare(
        "SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND issued_at = ? AND session_id != ?"
      )
      .bind("U002", now, bundle.sessionId)
      .first<{ n: number }>();
    expect(Number(row?.n ?? 0)).toBe(1);
  });
});

describe("AUTH-02: revocation", () => {
  test("logout revokes the refresh session; token can never be silently renewed", async () => {
    const bundle = await issueSession(testDb(), {
      userId: "U002",
      accessTokenSecret: SECRET,
    });
    await revokeSession(testDb(), bundle.sessionId);
    await expect(sessionRevoked(bundle.sessionId)).resolves.toBeTruthy();
    await expect(
      refreshSession(testDb(), {
        sessionId: bundle.sessionId,
        accessTokenSecret: SECRET,
      })
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });

  test("credential change revokes every session for the member", async () => {
    const a = await issueSession(testDb(), {
      userId: "U002",
      accessTokenSecret: SECRET,
    });
    const b = await issueSession(testDb(), {
      userId: "U002",
      accessTokenSecret: SECRET,
    });
    const c = await issueSession(testDb(), {
      userId: "U002",
      accessTokenSecret: SECRET,
    });
    // The production credential-change endpoint (AUTH-04) hashes the new
    // credential and calls revokeAllUserSessions for the user. Verify the
    // revoke primitive here.
    await revokeAllUserSessions(testDb(), "U002");
    await expect(sessionRevoked(a.sessionId)).resolves.toBeTruthy();
    await expect(sessionRevoked(b.sessionId)).resolves.toBeTruthy();
    await expect(sessionRevoked(c.sessionId)).resolves.toBeTruthy();
    // Multi-device independence: U001's sessions are untouched.
    const u1 = await issueSession(testDb(), {
      userId: "U001",
      accessTokenSecret: SECRET,
    });
    await expect(sessionRevoked(u1.sessionId)).resolves.toBeFalsy();
  });

  test("admin suspend revokes all active sessions", async () => {
    const a = await issueSession(testDb(), {
      userId: "U003",
      accessTokenSecret: SECRET,
    });
    const b = await issueSession(testDb(), {
      userId: "U003",
      accessTokenSecret: SECRET,
    });
    // Admin marks U003 (dedicated to this test) Suspended -> revoke all
    // sessions. U002 stays Active so later tests remain order-independent.
    await testDb()
      .prepare(
        "UPDATE accounts SET account_status = 'Suspended' WHERE user_id = ?"
      )
      .bind("U003")
      .run();
    await revokeAllUserSessions(testDb(), "U003");
    await expect(sessionRevoked(a.sessionId)).resolves.toBeTruthy();
    await expect(sessionRevoked(b.sessionId)).resolves.toBeTruthy();
    // Suspended account cannot refresh nor issue.
    await expect(
      refreshSession(testDb(), {
        sessionId: a.sessionId,
        accessTokenSecret: SECRET,
      })
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    await expect(
      issueSession(testDb(), { userId: "U003", accessTokenSecret: SECRET })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("revoked session's outstanding access token stops working at expiry", async () => {
    const bundle = await issueSession(testDb(), {
      userId: "U002",
      accessTokenSecret: SECRET,
      now: 5_000_000,
    });
    await revokeSession(testDb(), bundle.sessionId);
    // Still valid within its lifetime (stateless), then expires.
    await expect(
      verifyAccessToken(SECRET, bundle.accessToken, 5_000_000)
    ).resolves.not.toBeNull();
    await expect(
      verifyAccessToken(
        SECRET,
        bundle.accessToken,
        5_000_000 + ACCESS_TOKEN_TTL_MS
      )
    ).resolves.toBeNull();
    // And can never be renewed.
    await expect(
      refreshSession(testDb(), {
        sessionId: bundle.sessionId,
        accessTokenSecret: SECRET,
        now: 5_000_000,
      })
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });
});
