/**
 * EFCC D1 identity — registration-request lifecycle (AUTH-04 #162 / AUTH-06
 * #165, ADR-0020 §3).
 *
 * Self-service registrations land as `Pending` rows in `registration_requests`
 * (identity + credential hash + Pending status). A Teacher/Admin later
 * approves one into `accounts` with an Active status, or rejects it without
 * creating an account. The approval workflow's UI is AUTH-05 (#163); this
 * module owns only the storage shape and the Pending-before-Active gate.
 *
 * Idempotency is enforced on the natural keys, matching the ADR-0019
 * grant/revoke pattern (recheck, not a stored request-key table):
 *   * register  — `username_normalized` is UNIQUE; a second register for the
 *                 same username fails closed (409) instead of duplicating.
 *   * approve   — approving an already-approved request is a no-op success;
 *                 approving a rejected request is a conflict.
 *   * reject    — rejecting an already-rejected request is a no-op success;
 *                 rejecting an approved request is a conflict.
 * No cleartext PIN, password, or credential is ever stored, logged, or
 * returned.
 */

import { normalizeUsername } from "./credentials";
import { findAccountByUserId, findAccountByUsername } from "./accounts";

export const REGISTRATION_STATUS = {
  PENDING: "Pending",
  ACTIVE: "Active",
  REJECTED: "Rejected",
} as const;

export interface RegistrationRequestRow {
  request_id: string;
  user_id: string;
  username: string;
  username_normalized: string;
  name: string;
  phone: string | null;
  credential_hash: string;
  credential_kind: string;
  account_status: string;
  role: string;
  submitted_at: number;
  reviewed_by: string | null;
  reviewed_at: number | null;
  review_decision: string | null;
}

/** Raise when the `:id` names no registration request (→ 404). */
export class RegistrationNotFoundError extends Error {
  constructor(requestId: string) {
    super(`Unknown registration request: ${requestId}`);
    this.name = "RegistrationNotFoundError";
  }
}

/** Raise when the requested state transition is impossible (→ 409). */
export class RegistrationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistrationConflictError";
  }
}

const REQUEST_COLUMNS = `request_id, user_id, username, username_normalized,
  name, phone, credential_hash, credential_kind, account_status, role,
  submitted_at, reviewed_by, reviewed_at, review_decision`;

/** Look up a registration request by its opaque request_id, or null. */
export async function findRegistrationById(
  db: D1Database,
  requestId: string
): Promise<RegistrationRequestRow | null> {
  if (!requestId) return null;
  return (
    (await db
      .prepare(
        `SELECT ${REQUEST_COLUMNS} FROM registration_requests WHERE request_id = ?`
      )
      .bind(requestId)
      .first<RegistrationRequestRow>()) ?? null
  );
}

/** Look up a registration request by its normalized username, or null. */
export async function findRegistrationByUsername(
  db: D1Database,
  username: string
): Promise<RegistrationRequestRow | null> {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;
  return (
    (await db
      .prepare(
        `SELECT ${REQUEST_COLUMNS} FROM registration_requests WHERE username_normalized = ?`
      )
      .bind(normalized)
      .first<RegistrationRequestRow>()) ?? null
  );
}

/**
 * Create a self-service registration request (Pending). Fails closed with
 * RegistrationConflictError when the normalized username is already taken by
 * either an existing account or a pending/decided registration request. The
 * credential is stored only as its PBKDF2 hash.
 */
export async function createRegistrationRequest(
  db: D1Database,
  options: {
    userId: string;
    username: string;
    name: string;
    phone?: string;
    credentialHash: string;
    now?: number;
  }
): Promise<RegistrationRequestRow> {
  const now = options.now ?? Date.now();
  const normalized = normalizeUsername(options.username);
  if (!normalized) {
    throw new RegistrationConflictError("Username is required.");
  }

  const existingAccount = await findAccountByUsername(db, options.username);
  if (existingAccount) {
    throw new RegistrationConflictError(
      "An account with that username already exists."
    );
  }
  const existingRequest = await findRegistrationByUsername(db, options.username);
  if (existingRequest) {
    throw new RegistrationConflictError(
      "A registration request for that username already exists."
    );
  }

  const requestId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO registration_requests (
         request_id, user_id, username, username_normalized, name, phone,
         credential_hash, credential_kind, account_status, role, submitted_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'password', 'Pending', 'Member', ?)`
    )
    .bind(
      requestId,
      options.userId,
      options.username,
      normalized,
      options.name,
      options.phone ?? null,
      options.credentialHash,
      now
    )
    .run();

  return {
    request_id: requestId,
    user_id: options.userId,
    username: options.username,
    username_normalized: normalized,
    name: options.name,
    phone: options.phone ?? null,
    credential_hash: options.credentialHash,
    credential_kind: "password",
    account_status: "Pending",
    role: "Member",
    submitted_at: now,
    reviewed_by: null,
    reviewed_at: null,
    review_decision: null,
  };
}

async function requireRequest(
  db: D1Database,
  requestId: string
): Promise<RegistrationRequestRow> {
  const request = await findRegistrationById(db, requestId);
  if (!request) throw new RegistrationNotFoundError(requestId);
  return request;
}

/**
 * Approve a Pending registration into an Active account. Idempotent: an
 * already-approved request returns `active` without touching the DB a second
 * time. Conflicts: approving a Rejected request, or a request whose username
 * / user_id is already taken by an existing account.
 */
export async function approveRegistration(
  db: D1Database,
  options: { requestId: string; reviewerId: string; now?: number }
): Promise<"active"> {
  const now = options.now ?? Date.now();
  const request = await requireRequest(db, options.requestId);

  if (request.account_status === "Active") {
    return "active"; // idempotent replay
  }
  if (request.account_status === "Rejected") {
    throw new RegistrationConflictError(
      "Cannot approve a registration that was already rejected."
    );
  }

  // Guard against a username/user_id collision that slipped past register
  // (e.g. an account created out-of-band for the same identity).
  const normalized = request.username_normalized;
  if (await findAccountByUsername(db, request.username)) {
    throw new RegistrationConflictError(
      "An account with that username already exists."
    );
  }
  if (await findAccountByUserId(db, request.user_id)) {
    throw new RegistrationConflictError(
      "An account with that user_id already exists."
    );
  }

  // Approve in one transaction: promote the request to Active and create the
  // Active account, so the gate cannot be bypassed by a partial write.
  await db.batch([
    db
      .prepare(
        `INSERT INTO accounts (
           user_id, name, username, username_normalized,
           credential_hash, credential_kind, credential_version,
           account_status, role, phone, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 1, 'Active', ?, ?, ?, ?)`
      )
      .bind(
        request.user_id,
        request.name,
        request.username,
        normalized,
        request.credential_hash,
        request.credential_kind,
        request.role,
        request.phone,
        now,
        now
      ),
    db
      .prepare(
        `UPDATE registration_requests
            SET account_status = 'Active', reviewed_by = ?, reviewed_at = ?,
                review_decision = 'Approved'
          WHERE request_id = ?`
      )
      .bind(options.reviewerId, now, request.request_id),
  ]);

  return "active";
}

/**
 * Reject a Pending registration without creating an account. Idempotent: an
 * already-rejected request returns `rejected`. Conflicts: rejecting an
 * approved request (the account already exists).
 */
export async function rejectRegistration(
  db: D1Database,
  options: { requestId: string; reviewerId: string; now?: number }
): Promise<"rejected"> {
  const now = options.now ?? Date.now();
  const request = await requireRequest(db, options.requestId);

  if (request.account_status === "Rejected") {
    return "rejected"; // idempotent replay
  }
  if (request.account_status === "Active") {
    throw new RegistrationConflictError(
      "Cannot reject a registration that was already approved."
    );
  }

  await db
    .prepare(
      `UPDATE registration_requests
          SET account_status = 'Rejected', reviewed_by = ?, reviewed_at = ?,
              review_decision = 'Rejected'
        WHERE request_id = ?`
    )
    .bind(options.reviewerId, now, request.request_id)
    .run();

  return "rejected";
}

/**
 * Safe metadata columns for the Teacher/Admin approval queue (AUTH-05
 * #163). Deliberately excludes `credential_hash`, `credential_kind`, and
 * `user_id` — the queue must never expose credential material or the
 * immutable identity key to the browser.
 */
const QUEUE_COLUMNS = `request_id, username, name, phone, account_status, role,
  submitted_at, reviewed_by, reviewed_at, review_decision`;

export interface QueueRegistrationRow {
  request_id: string;
  username: string;
  name: string;
  phone: string | null;
  account_status: string;
  role: string;
  submitted_at: number;
  reviewed_by: string | null;
  reviewed_at: number | null;
  review_decision: string | null;
}

/**
 * List Pending registration requests for the approval queue, oldest first.
 * Defaults to Pending only (the queue never re-lists resolved requests);
 * returns safe metadata rows with no credential or identity-key material.
 */
export async function listPendingRegistrations(
  db: D1Database
): Promise<QueueRegistrationRow[]> {
  return (
    await db
      .prepare(
        `SELECT ${QUEUE_COLUMNS} FROM registration_requests
          WHERE account_status = 'Pending'
          ORDER BY submitted_at ASC`
      )
      .all<QueueRegistrationRow>()
  ).results ?? [];
}