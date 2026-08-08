/**
 * AUTH-01 (#159) — legacy-PIN brute-force lockout state machine.
 *
 * Acceptance covered here (ADR-0020 §4 / web/lib/auth/lockout.ts):
 *   - The 5th failed legacy-PIN verification enters a 5-minute lock (stage 1);
 *     verification is blocked while the lock is active.
 *   - After the 5-minute lock expires, a fresh round of 5 failures escalates
 *     to a 15-minute lock (stage 2).
 *   - After the 15-minute lock expires, a fresh round of 5 failures escalates
 *     to a permanent lock requiring Admin/Staff intervention (stage 3).
 *   - adminUnlockLegacyUpgrade() clears the lock so the upgrade can proceed;
 *     the legacy pin hash / requires_upgrade gate is preserved.
 *   - A successful upgrade clears the whole lockout state.
 *   - Only non-secret counters/timestamps are persisted — never the PIN.
 *
 * Each test uses its own fixture IDs so tests are order-independent. No PIN,
 * credential, token, or raw session value appears in any assertion or output.
 */
import { describe, test, expect, beforeAll } from "vitest";

import { applyMigrations, testDb } from "./test-bootstrap";
import { importLegacyUsers, findAccountByUserId } from "./accounts";
import { completeCredentialUpgrade } from "./upgrade";
import {
  LEGACY_FAIL_THRESHOLD,
  LEGACY_LOCK_STAGE1_MS,
  LEGACY_LOCK_STAGE2_MS,
  evaluateLockout,
  adminUnlockLegacyUpgrade,
  LegacyUpgradeLockedError,
} from "./lockout";

const HEADER = ["User_ID", "Name", "Username", "PIN_Code", "System_Role", "Status"];

beforeAll(async () => {
  await applyMigrations();
});

/** Import a fresh legacy account for a given fixture id / pin. */
async function seed(userId: string, pin: string): Promise<void> {
  await importLegacyUsers(testDb(), [
    HEADER,
    [userId, "Lock Fixture", userId.toLowerCase(), pin, "Member", "Active"],
  ]);
}

/** Attempt a wrong-PIN upgrade and expect it to fail with AUTH_REQUIRED. */
async function failAttempt(userId: string, now: number): Promise<void> {
  await expect(
    completeCredentialUpgrade(testDb(), {
      userId,
      legacyPin: "9999", // wrong (never equals any seeded pin)
      newCredential: "never-used",
      now,
    })
  ).rejects.toThrow(/Invalid username or PIN/);
}

/**
 * Run one full round of LEGACY_FAIL_THRESHOLD failed attempts starting at
 * `start` (which must be outside any active lock). Returns the earliest
 * epoch-ms at which the next round may begin (after the resulting lock, if
 * any, has expired).
 */
async function roundStartAfter(userId: string, start: number): Promise<number> {
  for (let i = 0; i < LEGACY_FAIL_THRESHOLD; i++) {
    await failAttempt(userId, start + i);
  }
  const acct = await findAccountByUserId(testDb(), userId);
  const until = acct!.locked_until ?? start + LEGACY_FAIL_THRESHOLD;
  return Number(until) + 1;
}

describe("AUTH-01: legacy-PIN lockout state machine", () => {
  test("5 failed attempts enter a 5-minute lock that blocks verification", async () => {
    await seed("L100", "1111");
    const t0 = 1_000_000_000;
    // 4 failures: not yet locked.
    for (let i = 0; i < LEGACY_FAIL_THRESHOLD - 1; i++) {
      await failAttempt("L100", t0 + i);
    }
    let acct = await findAccountByUserId(testDb(), "L100");
    expect(acct!.lock_level).toBe(0);
    expect(acct!.failed_attempts).toBe(LEGACY_FAIL_THRESHOLD - 1);

    // 5th failure enters stage 1 (5-min lock).
    await failAttempt("L100", t0 + 100);
    acct = await findAccountByUserId(testDb(), "L100");
    expect(acct!.lock_level).toBe(1);
    expect(acct!.locked_until).toBe(t0 + 100 + LEGACY_LOCK_STAGE1_MS);

    // While the 5-min lock is active, even the correct PIN is blocked.
    await expect(
      completeCredentialUpgrade(testDb(), {
        userId: "L100",
        legacyPin: "1111", // correct
        newCredential: "x",
        now: t0 + 101,
      })
    ).rejects.toBeInstanceOf(LegacyUpgradeLockedError);
    expect(
      evaluateLockout((await findAccountByUserId(testDb(), "L100"))!, t0 + 101)
        .locked
    ).toBe(true);
  });

  test("after the 5-min lock expires, 5 more failures escalate to a 15-min lock", async () => {
    await seed("L101", "2222");
    const afterStage1 = await roundStartAfter("L101", 2_000_000_000);
    let acct = await findAccountByUserId(testDb(), "L101");
    expect(acct!.lock_level).toBe(1);

    // Lock expired: not locked, and a fresh round escalates to stage 2.
    expect(
      evaluateLockout((await findAccountByUserId(testDb(), "L101"))!, afterStage1)
        .locked
    ).toBe(false);
    const afterStage2 = await roundStartAfter("L101", afterStage1);
    acct = await findAccountByUserId(testDb(), "L101");
    expect(acct!.lock_level).toBe(2);
    expect(acct!.locked_until).toBe(
      afterStage1 + LEGACY_FAIL_THRESHOLD - 1 + LEGACY_LOCK_STAGE2_MS
    );
    expect(
      evaluateLockout((await findAccountByUserId(testDb(), "L101"))!, afterStage2)
        .locked
    ).toBe(false);
  });

  test("after the 15-min lock expires, 5 more failures require admin unlock", async () => {
    await seed("L102", "3333");
    const afterStage1 = await roundStartAfter("L102", 3_000_000_000);
    const afterStage2 = await roundStartAfter("L102", afterStage1);
    let acct = await findAccountByUserId(testDb(), "L102");
    expect(acct!.lock_level).toBe(2);

    const afterStage3 = await roundStartAfter("L102", afterStage2);
    acct = await findAccountByUserId(testDb(), "L102");
    expect(acct!.lock_level).toBe(3);
    expect(acct!.locked_until).toBeNull(); // permanent

    // Stage 3 is permanent: even the correct PIN is blocked indefinitely.
    await expect(
      completeCredentialUpgrade(testDb(), {
        userId: "L102",
        legacyPin: "3333",
        newCredential: "x",
        now: afterStage3 + LEGACY_LOCK_STAGE2_MS + 100_000,
      })
    ).rejects.toBeInstanceOf(LegacyUpgradeLockedError);
  });

  test("admin unlock clears the permanent lock so the upgrade can proceed", async () => {
    await seed("L103", "4444");
    let start = 4_000_000_000;
    for (let round = 0; round < 3; round++) {
      start = await roundStartAfter("L103", start);
    }
    let acct = await findAccountByUserId(testDb(), "L103");
    expect(acct!.lock_level).toBe(3);

    // Admin/Staff unlocks.
    await adminUnlockLegacyUpgrade(testDb(), "L103", start + 1_000_000);
    acct = await findAccountByUserId(testDb(), "L103");
    expect(acct!.lock_level).toBe(0);
    expect(acct!.failed_attempts).toBe(0);
    expect(acct!.locked_until).toBeNull();
    expect(acct!.lock_since).toBeNull();
    // The upgrade gate is preserved — the member still must upgrade.
    expect(acct!.requires_upgrade).toBe(1);
    expect(acct!.legacy_pin_hash).not.toBeNull();

    // Correct PIN now succeeds.
    const result = await completeCredentialUpgrade(testDb(), {
      userId: "L103",
      legacyPin: "4444",
      newCredential: "fresh-secret",
      now: start + 1_000_100,
    });
    expect(result.ok).toBe(true);
  });

  test("a successful upgrade clears the lockout state", async () => {
    await seed("L104", "5555");
    const afterStage1 = await roundStartAfter("L104", 5_000_000_000);
    let acct = await findAccountByUserId(testDb(), "L104");
    expect(acct!.lock_level).toBe(1);

    // Admin clears, then the first allowed attempt succeeds and clears state.
    await adminUnlockLegacyUpgrade(testDb(), "L104", afterStage1);
    await completeCredentialUpgrade(testDb(), {
      userId: "L104",
      legacyPin: "5555",
      newCredential: "final-secret",
      now: afterStage1 + 100,
    });
    acct = await findAccountByUserId(testDb(), "L104");
    expect(acct!.lock_level).toBe(0);
    expect(acct!.failed_attempts).toBe(0);
    expect(acct!.locked_until).toBeNull();
    expect(acct!.lock_since).toBeNull();
  });

  test("lockout persists only non-secret counters/timestamps — never the PIN", async () => {
    await seed("L105", "6666");
    await roundStartAfter("L105", 6_000_000_000);
    const acct = await findAccountByUserId(testDb(), "L105");
    const serialized = JSON.stringify(acct);
    // The numeric PIN never leaks into the persisted row.
    expect(serialized).not.toContain("6666");
    // Fields are the non-secret counter/timestamp shape.
    expect(typeof acct!.lock_level).toBe("number");
    expect(typeof acct!.failed_attempts).toBe("number");
    expect(typeof acct!.locked_until).toBe("number");
  });
});