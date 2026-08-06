/**
 * EFCC D1 identity — legacy-PIN brute-force lockout state machine
 * (AUTH-01 #159, ADR-0020 §4).
 *
 * The one-time legacy-PIN hash is a THROWAWAY identity gate during the forced
 * credential upgrade, NOT a standalone security boundary: it proves the
 * upgrade on first login, then is cleared forever. Because the legacy key
 * space is only 4 numeric digits (10,000 possibilities), it must be defended
 * against offline/online brute force. This module implements the per-account
 * escalation ladder the operator locked:
 *
 *   STAGE 0 (no lock):      fewer than LEGACY_FAIL_THRESHOLD (5) failed
 *                           legacy-PIN verifications.
 *   STAGE 1 (5-min lock):   the 5th failed verification enters a 5-minute
 *                           lock (locked_until = now + LEGACY_LOCK_STAGE1_MS).
 *   STAGE 2 (15-min lock):  once the 5-min lock has expired, a fresh round of
 *                           5 failed verifications escalates to a 15-minute
 *                           lock (locked_until = now + LEGACY_LOCK_STAGE2_MS).
 *   STAGE 3 (admin unlock): once the 15-min lock has expired, a fresh round
 *                           of 5 failed verifications escalates to a permanent
 *                           lock that only an Admin/Teacher can clear via
 *                           adminUnlockLegacyUpgrade().
 *
 * Escalation is per "round": each stage is entered by LEGACY_FAIL_THRESHOLD
 * failures since the previous reset, and the failed_attempts counter resets
 * to 0 each time a stage is entered. Time-locks (stages 1 and 2) auto-expire;
 * stage 3 is permanent until intervention. A SUCCESSFUL upgrade also clears
 * the whole lockout state.
 *
 * Only non-secret state is persisted per account: lock_level (0-3),
 * failed_attempts (integer), locked_until / lock_since (epoch-ms). The legacy
 * PIN and any credential are never stored in or derived from this state.
 */

import type { AccountRow } from "./accounts";

/** Failed legacy-PIN verifications that enter the first lock stage. */
export const LEGACY_FAIL_THRESHOLD = 5;
/** Stage 1 lock duration: 5 minutes. */
export const LEGACY_LOCK_STAGE1_MS = 5 * 60 * 1000;
/** Stage 2 lock duration: 15 minutes. */
export const LEGACY_LOCK_STAGE2_MS = 15 * 60 * 1000;

/** Lockout stage: 0 none | 1 5-min | 2 15-min | 3 admin-unlock. */
export type LockLevel = 0 | 1 | 2 | 3;

/** The evaluated lockout state for an account at a point in time. */
export interface LockoutState {
  /** Current lock_level stored on the account (raw, unserialized). */
  level: LockLevel;
  /** True if the account is currently blocked from verifying a legacy PIN. */
  locked: boolean;
  /** True if the lock is permanent (stage 3, admin unlock required). */
  requiresAdminUnlock: boolean;
  /** Epoch-ms after which a time-lock (stage 1/2) expires, else null. */
  lockedUntil: number | null;
  /** Epoch-ms at which the current lock level was entered, else null. */
  lockSince: number | null;
}

/** Raised when a legacy-PIN verification is blocked by the lockout state. */
export class LegacyUpgradeLockedError extends Error {
  readonly isAuthLocked = true as const;
  readonly level: LockLevel;
  readonly lockedUntil: number | null;
  constructor(level: LockLevel, lockedUntil: number | null, message: string) {
    super(message);
    this.name = "LegacyUpgradeLockedError";
    this.level = level;
    this.lockedUntil = lockedUntil;
  }
}

function levelOf(raw: unknown): LockLevel {
  const n = Number(raw);
  if (n === 1 || n === 2 || n === 3) return n;
  return 0;
}

/**
 * Evaluate the lockout state for an account at `now`. Pure: does not throw,
 * does not write. `locked` is true only when a time-lock is still active or
 * the account is in the permanent admin-unlock stage.
 */
export function evaluateLockout(account: AccountRow, now: number): LockoutState {
  const level = levelOf(account.lock_level);
  const lockedUntil =
    account.locked_until === null ? null : Number(account.locked_until);
  const lockSince =
    account.lock_since === null ? null : Number(account.lock_since);

  if (level === 3) {
    return {
      level,
      locked: true,
      requiresAdminUnlock: true,
      lockedUntil: null,
      lockSince,
    };
  }
  if ((level === 1 || level === 2) && lockedUntil !== null && now < lockedUntil) {
    return {
      level,
      locked: true,
      requiresAdminUnlock: false,
      lockedUntil,
      lockSince,
    };
  }
  return { level, locked: false, requiresAdminUnlock: false, lockedUntil, lockSince };
}

/**
 * Assert the account is not locked at `now`. Throws LegacyUpgradeLockedError
 * when the lockout gate blocks verification.
 */
export function assertNotLocked(account: AccountRow, now: number): void {
  const state = evaluateLockout(account, now);
  if (!state.locked) return;
  if (state.level === 3) {
    throw new LegacyUpgradeLockedError(
      3,
      null,
      "Account is locked pending credential-upgrade review. Contact an Admin or Teacher to unlock."
    );
  }
  throw new LegacyUpgradeLockedError(
    state.level,
    state.lockedUntil,
    "Too many failed attempts. Try again later."
  );
}

/**
 * Record one failed legacy-PIN verification and persist the escalated lockout
 * state. Applies the STAGE 0 → 1 → 2 → 3 ladder described at the top. Returns
 * the resulting lockout state. Never touches or emits the PIN.
 */
export async function recordLegacyPinFailure(
  db: D1Database,
  userId: string,
  account: AccountRow,
  now: number
): Promise<LockoutState> {
  const current = levelOf(account.lock_level);
  const failed = Number(account.failed_attempts) + 1;

  let level: LockLevel = current;
  let lockedUntil: number | null =
    account.locked_until === null ? null : Number(account.locked_until);
  let lockSince: number | null =
    account.lock_since === null ? null : Number(account.lock_since);
  let nextFailed = failed;

  if (failed >= LEGACY_FAIL_THRESHOLD) {
    if (current === 0) {
      level = 1;
      lockedUntil = now + LEGACY_LOCK_STAGE1_MS;
      lockSince = now;
    } else if (current === 1) {
      level = 2;
      lockedUntil = now + LEGACY_LOCK_STAGE2_MS;
      lockSince = now;
    } else if (current === 2) {
      level = 3;
      lockedUntil = null;
      lockSince = now;
    }
    // current === 3 stays at 3 (permanent).
    nextFailed = 0; // each stage is entered by a fresh round of failures
  }

  await db
    .prepare(
      `UPDATE accounts
         SET failed_attempts = ?, lock_level = ?, locked_until = ?,
             lock_since = ?, updated_at = ?
       WHERE user_id = ?`
    )
    .bind(nextFailed, level, lockedUntil, lockSince, now, userId)
    .run();

  return {
    level,
    locked: level === 3 || (lockedUntil !== null && now < lockedUntil),
    requiresAdminUnlock: level === 3,
    lockedUntil,
    lockSince,
  };
}

/**
 * Admin/Teacher intervention: clear a stage-3 (or any) upgrade lockout so the
 * member can attempt the forced upgrade again. Does NOT clear requires_upgrade
 * or the legacy-pin hash — the upgrade itself must still be completed.
 *
 * Returns `true` when the user existed (and the lockout state was reset);
 * `false` when the user_id is unknown so the caller can surface a precise
 * 404 instead of falsely reporting `unlocked: true`.
 */
export async function adminUnlockLegacyUpgrade(
  db: D1Database,
  userId: string,
  now: number = Date.now()
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE accounts
         SET lock_level = 0, failed_attempts = 0, locked_until = NULL,
             lock_since = NULL, updated_at = ?
       WHERE user_id = ?`
    )
    .bind(now, userId)
    .run();
  // meta.changes === 0 when the user_id did not match any row.
  return (result.meta?.changes ?? 0) > 0;
}