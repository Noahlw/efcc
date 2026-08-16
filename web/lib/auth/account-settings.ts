/**
 * EFCC D1 identity — self-service account settings (UI-04 #196 / Spec #191).
 *
 * Two authenticated mutations: change the login username, and change the
 * password. Both preserve the immutable `User_ID` key and QR identity defaults
 * (ADR-0020 §1). Each change runs as ONE atomic `env.DB.batch([...])` so a
 * failing statement aborts everything: no new username/password without its
 * audit row, and no revoked session without the change.
 *
 * Contract (Spec #191, locked):
 *   * Username uniqueness is case-insensitive + whitespace-normalized via the
 *     existing `normalizeUsername` rule (trim + lowercase). Duplicates fail
 *     closed (409) against BOTH `accounts` and `registration_requests`, and a
 *     concurrent insert that wins the race aborts the batch on the unique
 *     `accounts.username_normalized` index (ADR-0019 recheck pattern).
 *   * An unchanged username is a value-idempotent no-op (no audit row, no
 *     session revocation, no cookie clearing).
 *   * A password change requires the current password; a wrong current value
 *     is a 422 VALIDATION (deliberately NOT 401, so the client cannot conflate
 *     it with session expiry). It does NOT feed the legacy-PIN escalation
 *     ladder (lockout.ts is scoped to the 10,000-key legacy space).
 *   * Both changes revoke ALL refresh sessions for the account inside the
 *     batch (the `completeCredentialUpgrade` precedent), because the login
 *     identifier / credential changed. Outstanding short-lived access tokens
 *     follow the existing bounded-revocation contract (≤ ~15 min).
 *   * Every change is audited in `account_events` with NO credential material:
 *     username_changed rows carry old/new normalized usernames; password_changed
 *     rows carry NULL username columns. `correlation_id` = request's requestId.
 *
 * The handlers (web/lib/auth/handlers.ts) own the HTTP/session boundary and
 * the cookie clearing; this module owns the D1 transaction and authorization.
 */

import { findAccountByUserId, findAccountByUsername } from "./accounts";
import type { AccountRow } from "./accounts";
import {
  normalizeUsername,
  hashCredential,
  verifyCredential,
} from "./credentials";
import { findRegistrationByUsername } from "./registrations";

/** The account's status must be Active; anything else is a 403. */
// oxlint-disable-next-line eslint/max-classes-per-file
export class AccountStatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountStatusError";
  }
}

/** The normalized username is already taken (accounts or registration). */
// oxlint-disable-next-line eslint/max-classes-per-file
export class AccountConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountConflictError";
  }
}

/** The presented current password does not match the stored credential. */
// oxlint-disable-next-line eslint/max-classes-per-file
export class WrongCurrentPasswordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WrongCurrentPasswordError";
  }
}

export interface UsernameChangeResult {
  /** The display username (untrusted casing) after the change. */
  username: string;
  /** The normalized (trim + lowercase) unique lookup key. */
  usernameNormalized: string;
  /**
   * False when the submitted value normalized to the account's current
   * username — a value-idempotent no-op (no audit row, no revocation).
   */
  changed: boolean;
  /**
   * True when no live refresh session remains. On a no-op replay after an
   * earlier identical change already revoked everything, the client must
   * clear its auth cookies (review P1 retry/duplicate audit).
   */
  sessionRevoked: boolean;
}

export interface PasswordChangeResult {
  ok: true;
}

/** Resolve the account and enforce the Active status gate (per Spec §1.1). */
async function requireActiveUser(
  db: D1Database,
  userId: string
): Promise<AccountRow> {
  const account = await findAccountByUserId(db, userId);
  if (!account) {
    throw new AccountStatusError("Unknown account.");
  }
  if (account.account_status !== "Active") {
    throw new AccountStatusError("Account is not active.");
  }
  return account;
}

/**
 * Change the login username. Preserves `User_ID` and `qr_code_string`.
 * `correlation_id` is the request's requestId, echoed in the audit row.
 */
export async function changeUsername(
  db: D1Database,
  options: { userId: string; username: string; requestId: string; now?: number }
): Promise<UsernameChangeResult> {
  const now = options.now ?? Date.now();
  const account = await requireActiveUser(db, options.userId);

  const normalized = normalizeUsername(options.username);
  if (!normalized) {
    // The handler validates this first; fail closed here regardless.
    throw new AccountConflictError("Username is required.");
  }

  // Value-idempotent no-op: the submitted value already IS the account's
  // username (any casing/whitespace variant of the same normalized form).
  if (normalized === account.username_normalized) {
    // Distinguish a fresh no-op (sessions stay live) from a replay after an
    // identical change already revoked everything: count live sessions — 0
    // means the client should clear its auth cookies.
    const live = await db
      .prepare(
        `SELECT COUNT(*) AS c FROM sessions
          WHERE user_id = ? AND revoked_at IS NULL`
      )
      .bind(account.user_id)
      .first<{ c: number }>();
    return {
      username: options.username,
      usernameNormalized: normalized,
      changed: false,
      sessionRevoked: (live?.c ?? 0) === 0,
    };
  }

  // Pre-flight duplicate check against accounts AND registration_requests
  // (the createRegistrationRequest recheck pattern, ADR-0019). The accounts
  // check finds the actor itself only when normalized is unchanged — already
  // returned above — so any hit here is a genuine collision.
  const existingAccount = await findAccountByUsername(db, options.username);
  if (existingAccount) {
    throw new AccountConflictError(
      "An account with that username already exists."
    );
  }
  const existingRequest = await findRegistrationByUsername(
    db,
    options.username
  );
  if (existingRequest) {
    throw new AccountConflictError(
      "An account with that username already exists."
    );
  }

  // One atomic transaction: the UPDATE plus its audit row plus the revocation.
  // The batch itself is the uniqueness authority (review P1 / advisory):
  // statement 1 is a guarded UPDATE that only applies while no OTHER account
  // or any registration request claims the normalized username. Statements 2
  // and 3 carry the same guards so a lost race side-effects nothing — the
  // audit insert emits no row and the revocation targets only the new
  // username being in effect. A per-table unique index alone cannot arbitrate
  // across accounts + registration_requests, so we inspect changes() after
  // the batch: 0 rows updated ⇒ the claim was lost ⇒ 409, nothing written.
  const eventId = crypto.randomUUID();
  try {
    const results = await db.batch([
      db
        .prepare(
          `UPDATE accounts
              SET username = ?, username_normalized = ?, updated_at = ?
            WHERE user_id = ?
              AND account_status = 'Active'
              AND username_normalized = ?
              AND NOT EXISTS (
                SELECT 1 FROM accounts
                 WHERE username_normalized = ? AND user_id <> ?)
              AND NOT EXISTS (
                SELECT 1 FROM registration_requests
                 WHERE username_normalized = ?)`
        )
        .bind(
          options.username,
          normalized,
          now,
          account.user_id,
          account.username_normalized,
          normalized,
          account.user_id,
          normalized
        ),
      db
        .prepare(
          `INSERT INTO account_events (
             event_id, actor_user_id, action,
             old_username_normalized, new_username_normalized,
             correlation_id, created_at
           )
           SELECT ?, ?, 'username_changed', ?, ?, ?, ?
            WHERE NOT EXISTS (
              SELECT 1 FROM accounts
               WHERE username_normalized = ? AND user_id <> ?)
              AND NOT EXISTS (
               SELECT 1 FROM registration_requests
               WHERE username_normalized = ?)
             AND EXISTS (
                SELECT 1 FROM accounts
                 WHERE user_id = ? AND username_normalized = ?)`
        )
        .bind(
          eventId,
          account.user_id,
          account.username_normalized,
          normalized,
          options.requestId,
          now,
          normalized,
          account.user_id,
          normalized,
          account.user_id,
          normalized
        ),
      db
        .prepare(
          `UPDATE sessions SET revoked_at = ?
            WHERE user_id = ? AND revoked_at IS NULL
              AND EXISTS (
                SELECT 1 FROM accounts
                 WHERE user_id = ? AND username_normalized = ?)`
        )
        .bind(now, account.user_id, account.user_id, normalized),
    ]);

    // 0 rows changed means the username was claimed between the pre-flight
    // check and this batch — the guards keep audit + revocation unwritten.
    if ((results[0]?.meta.changes ?? 0) === 0) {
      throw new AccountConflictError(
        "An account with that username already exists."
      );
    }
  } catch (error) {
    if (error instanceof AccountConflictError) {
      throw error;
    }
    if (error instanceof Error && /unique|constraint/iu.test(error.message)) {
      throw new AccountConflictError(
        "An account with that username already exists."
      );
    }
    throw error;
  }

  return {
    username: options.username,
    usernameNormalized: normalized,
    changed: true,
    sessionRevoked: true,
  };
}

/**
 * Change the login password. Requires the correct current password (422 on
 * mismatch, mapping to WrongCurrentPasswordError). `correlation_id` is the
 * request's requestId. The password_changed audit row carries NO username
 * columns (the login identifier is unchanged).
 */
export async function changePassword(
  db: D1Database,
  options: {
    userId: string;
    currentPassword: string;
    newPassword: string;
    requestId: string;
    now?: number;
  }
): Promise<PasswordChangeResult> {
  const now = options.now ?? Date.now();
  const account = await requireActiveUser(db, options.userId);

  const ok = await verifyCredential(
    options.currentPassword,
    account.credential_hash
  );
  if (!ok) {
    // Value-idempotent replay (review P1): an identical prior request may
    // already have applied this exact change. The stored hash is salted
    // PBKDF2 that can never be re-derived from the submitted value, so the
    // replay authority is verifying the submitted NEW password against the
    // stored hash — true means "the value IS the stored state".
    if (await verifyCredential(options.newPassword, account.credential_hash)) {
      return { ok: true };
    }
    throw new WrongCurrentPasswordError("current password is incorrect");
  }

  const newCredentialHash = await hashCredential(options.newPassword);

  // One atomic transaction: the credential UPDATE plus its audit row plus the
  // revocation. The audit row stores no credential material.
  const eventId = crypto.randomUUID();
  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO account_events (
           event_id, actor_user_id, action,
           old_username_normalized, new_username_normalized,
           correlation_id, created_at
      )
          SELECT ?, ?, 'password_changed', NULL, NULL, ?, ?
           WHERE EXISTS (
             SELECT 1 FROM accounts
             WHERE user_id = ? AND credential_hash = ?
               AND account_status = 'Active')`
      )
      .bind(
        eventId,
        account.user_id,
        options.requestId,
        now,
        account.user_id,
        account.credential_hash
      ),
    db
      .prepare(
        `UPDATE sessions SET revoked_at = ?
          WHERE user_id = ? AND revoked_at IS NULL
            AND EXISTS (
              SELECT 1 FROM accounts
               WHERE user_id = ? AND credential_hash = ?
                 AND account_status = 'Active')`
      )
      .bind(now, account.user_id, account.user_id, account.credential_hash),
    db
      .prepare(
        `UPDATE accounts
            SET credential_hash = ?, credential_kind = 'password',
                credential_version = 2, updated_at = ?
          WHERE user_id = ?
            AND account_status = 'Active'
            AND credential_hash = ?`
      )
      .bind(newCredentialHash, now, account.user_id, account.credential_hash),
  ]);

  // 0 rows changed on the credential UPDATE: either the account stopped
  // being Active, or a concurrent identical request already applied this
  // exact change. Re-verify the new
  // password against the stored hash to distinguish replay (ok) from
  // suspension (403). Nothing escaped either way — the audit INSERT and the
  // revocation are guarded by the OLD hash, so a duplicate request can never
  // emit a second audit row.
  if ((results[2]?.meta.changes ?? 0) === 0) {
    const stored = await db
      .prepare("SELECT credential_hash FROM accounts WHERE user_id = ?")
      .bind(account.user_id)
      .first<{ credential_hash: string }>();
    if (
      stored &&
      (await verifyCredential(options.newPassword, stored.credential_hash))
    ) {
      return { ok: true };
    }
    throw new AccountStatusError("Account is not active.");
  }

  return { ok: true };
}
