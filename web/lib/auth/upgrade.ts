/**
 * EFCC D1 identity — forced credential upgrade for legacy-imported accounts
 * (AUTH-01 #159, ADR-0020 §4 — the user-selected one-time legacy-PIN-hash
 * path).
 *
 * Every account imported from the legacy Users sheet carries `requires_upgrade
 * = 1` and a one-time salted PBKDF2 hash of its normalized legacy PIN. The
 * FIRST login must prove identity with that legacy PIN, set a new credential,
 * and then CLEAR the one-time hash — after which the legacy PIN is gone from
 * D1 entirely and can never be used again. No session is issued until the
 * upgrade completes (enforced by `issueSession`/`refreshSession`'s
 * UPGRADE_REQUIRED gate).
 *
 * The legacy-PIN hash is a THROWAWAY identity gate, not a standalone security
 * boundary (see ADR-0020 §4 and web/lib/auth/lockout.ts). Because the legacy
 * key space is only 4 digits, the check is brute-force hardened by a
 * per-account escalation ladder: 5 failed verifications enter a 5-minute lock,
 * a further round enters a 15-minute lock, and a final round locks the path
 * until an Admin/Teacher unlocks it. Failed attempts are counted and the
 * lockout state persisted (non-secret counters/timestamps only); the legacy
 * PIN itself is never stored, logged, or returned.
 *
 * The upgrade also revokes all outstanding sessions (a credential change), so
 * any access token issued before the upgrade stops being renewable immediately
 * and the new credential is the only live one.
 */

import { verifyCredential, hashCredential, normalizePin } from "./credentials";
import { findAccountByUserId } from "./accounts";
import { revokeAllUserSessions } from "./sessions";
import {
  assertNotLocked,
  recordLegacyPinFailure,
} from "./lockout";

export interface UpgradeResult {
  ok: true;
}

/**
 * Complete the forced credential upgrade for a legacy account.
 *
 * @param db D1 binding.
 * @param userId immutable account id.
 * @param legacyPin the legacy 4-digit PIN presented at first login.
 * @param newCredential the new credential the member chose.
 * @param now Epoch millis (injectable for tests).
 * @returns {ok: true} on success.
 * @throws AuthError AUTH_REQUIRED if the account is unknown, FORBIDDEN if it
 *   is not awaiting upgrade, LegacyUpgradeLockedError if the account is
 *   currently locked out, or AUTH_REQUIRED if the legacy PIN does not match
 *   (identity not proven).
 */
export async function completeCredentialUpgrade(
  db: D1Database,
  options: {
    userId: string;
    legacyPin: string;
    newCredential: string;
    now?: number;
  }
): Promise<UpgradeResult> {
  const now = options.now ?? Date.now();
  const account = await findAccountByUserId(db, options.userId);
  if (!account) {
    throw new Error("AUTH_REQUIRED: Unknown account.");
  }
  if (account.requires_upgrade !== 1 || !account.legacy_pin_hash) {
    throw new Error("FORBIDDEN: Account is not awaiting credential upgrade.");
  }

  // Brute-force gate: fail closed while a time-lock is active or the account
  // is in the admin-unlock stage. Never lets the PIN be verified while locked.
  assertNotLocked(account, now);

  const proven = await verifyCredential(
    normalizeLegacyPin(options.legacyPin),
    account.legacy_pin_hash
  );
  if (!proven) {
    // Record the failure (and escalate the lockout) BEFORE throwing, so the
    // account's failed-attempt state is durable even if the request dies.
    await recordLegacyPinFailure(db, options.userId, account, now);
    // Ambiguous on purpose: never reveal whether the username or the PIN was
    // wrong, and never leak that a legacy account exists.
    throw new Error("AUTH_REQUIRED: Invalid username or PIN.");
  }

  const newCredentialHash = await hashCredential(options.newCredential);

  // Success: set the new credential and CLEAR both the one-time legacy hash
  // and the entire lockout state (the legacy key is gone forever).
  await db
    .prepare(
      `UPDATE accounts
         SET credential_hash = ?, credential_kind = 'password',
             credential_version = 2, legacy_pin_hash = NULL,
             requires_upgrade = 0,
             lock_level = 0, failed_attempts = 0,
             locked_until = NULL, lock_since = NULL,
             updated_at = ?
       WHERE user_id = ?`
    )
    .bind(newCredentialHash, now, options.userId)
    .run();

  // Credential change: revoke every outstanding session so the new credential
  // is the only live one and old access tokens lose renewability at once.
  await revokeAllUserSessions(db, options.userId, now);

  return { ok: true };
}

function normalizeLegacyPin(raw: string): string {
  return normalizePin(raw);
}