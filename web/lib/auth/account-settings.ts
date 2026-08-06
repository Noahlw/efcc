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
    return {
      username: options.username,
      usernameNormalized: normalized,
      changed: false,
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
  const existingRequest = await findRegistrationByUsername(db, options.username);
  if (existingRequest) {
    throw new AccountConflictError(
      "An account with that username already exists."
    );
  }

  // One atomic transaction: the UPDATE plus its audit row plus the revocation.
  // A concurrent insert that wins the race on the unique
  // `accounts_username_normalized` index aborts the whole batch → 409.
  const eventId = crypto.randomUUID();
  try {
    await db.batch([
      db
        .prepare(
          `UPDATE accounts
              SET username = ?, username_normalized = ?, updated_at = ?
            WHERE user_id = ?`
        )
        .bind(options.username, normalized, now, account.user_id),
      db
        .prepare(
          `INSERT INTO account_events (
             event_id, actor_user_id, action,
             old_username_normalized, new_username_normalized,
             correlation_id, created_at
           ) VALUES (?, ?, 'username_changed', ?, ?, ?, ?)`
        )
        .bind(
          eventId,
          account.user_id,
          account.username_normalized,
          normalized,
          options.requestId,
          now
        ),
      db
        .prepare(
          `UPDATE sessions SET revoked_at = ?
            WHERE user_id = ? AND revoked_at IS NULL`
        )
        .bind(now, account.user_id),
    ]);
  } catch (error) {
    if (error instanceof Error && /unique|constraint/iu.test(error.message)) {
      throw new AccountConflictError(
        "An account with that username already exists."
      );
    }
    throw error;
  }

  return { username: options.username, usernameNormalized: normalized, changed: true };
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
    throw new WrongCurrentPasswordError("current password is incorrect");
  }

  const newCredentialHash = await hashCredential(options.newPassword);

  // One atomic transaction: the credential UPDATE plus its audit row plus the
  // revocation. The audit row stores no credential material.
  const eventId = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        `UPDATE accounts
            SET credential_hash = ?, credential_kind = 'password',
                credential_version = 2, updated_at = ?
          WHERE user_id = ?`
      )
      .bind(newCredentialHash, now, account.user_id),
    db
      .prepare(
        `INSERT INTO account_events (
           event_id, actor_user_id, action,
           old_username_normalized, new_username_normalized,
           correlation_id, created_at
         ) VALUES (?, ?, 'password_changed', NULL, NULL, ?, ?)`
      )
      .bind(eventId, account.user_id, options.requestId, now),
    db
      .prepare(
        `UPDATE sessions SET revoked_at = ?
          WHERE user_id = ? AND revoked_at IS NULL`
      )
      .bind(now, account.user_id),
  ]);

  return { ok: true };
}