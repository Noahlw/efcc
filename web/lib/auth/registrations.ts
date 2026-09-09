/**
 * EFCC D1 identity — registration-request lifecycle (AUTH-04 #162 / AUTH-06
 * #165, ADR-0020 §3).
 *
 * Self-service registrations land as `Pending` rows in `registration_requests`
 * (identity + credential hash + Pending status). A Staff/Admin later
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

import { findAccountByUserId, findAccountByUsername } from "./accounts";
import { normalizeUsername } from "./credentials";

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
  submitted_at: number;
  reviewed_by: string | null;
  reviewed_at: number | null;
  review_decision: string | null;
  rejection_note: string | null;
}

/** Raise when the `:id` names no registration request (→ 404). */
export class RegistrationNotFoundError extends Error {
  constructor(requestId: string) {
    super(`Unknown registration request: ${requestId}`);
    this.name = "RegistrationNotFoundError";
  }
}

/** Raise when the requested state transition is impossible (→ 409). */
// oxlint-disable-next-line eslint/max-classes-per-file
export class RegistrationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistrationConflictError";
  }
}

const REQUEST_COLUMNS = `request_id, user_id, username, username_normalized,
  name, phone, credential_hash, credential_kind, account_status,
  submitted_at, reviewed_by, reviewed_at, review_decision, rejection_note`;

/** Look up a registration request by its opaque request_id, or null. */
export async function findRegistrationById(
  db: D1Database,
  requestId: string
): Promise<RegistrationRequestRow | null> {
  if (!requestId) {
    return null;
  }
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
  if (!normalized) {
    return null;
  }
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
  const existingRequest = await findRegistrationByUsername(
    db,
    options.username
  );
  if (existingRequest) {
    throw new RegistrationConflictError(
      "A registration request for that username already exists."
    );
  }

  const requestId = crypto.randomUUID();
  let result: D1Result<unknown>;
  try {
    result = await db
      .prepare(
        `INSERT INTO registration_requests (
           request_id, user_id, username, username_normalized, name, phone,
           credential_hash, credential_kind, account_status, submitted_at
         )
         SELECT ?, ?, ?, ?, ?, ?, ?, 'password', 'Pending', ?
          WHERE NOT EXISTS (
            SELECT 1 FROM accounts WHERE username_normalized = ?
          )
            AND NOT EXISTS (
              SELECT 1 FROM registration_requests
               WHERE username_normalized = ?
            )`
      )
      .bind(
        requestId,
        options.userId,
        options.username,
        normalized,
        options.name,
        options.phone ?? null,
        options.credentialHash,
        now,
        normalized,
        normalized
      )
      .run();
  } catch (error) {
    if (error instanceof Error && /unique|constraint/iu.test(error.message)) {
      throw new RegistrationConflictError(
        "A registration request for that username already exists."
      );
    }
    throw error;
  }
  if ((result.meta?.changes ?? 0) !== 1) {
    throw new RegistrationConflictError(
      "A registration request for that username already exists."
    );
  }

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
    submitted_at: now,
    reviewed_by: null,
    reviewed_at: null,
    review_decision: null,
    rejection_note: null,
  };
}

async function requireRequest(
  db: D1Database,
  requestId: string
): Promise<RegistrationRequestRow> {
  const request = await findRegistrationById(db, requestId);
  if (!request) {
    throw new RegistrationNotFoundError(requestId);
  }
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
    return "active";
  }
  if (request.account_status === "Rejected") {
    throw new RegistrationConflictError(
      "Cannot approve a registration that was already rejected."
    );
  }

  // Guard against a username/user_id collision that slipped past register
  // (e.g. an account created out-of-band for the same identity).
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

  // Approve in one transaction. The account INSERT is conditional on the
  // request still being Pending, then the compare-and-set state transition is
  // the transaction's final statement. A concurrent reject/approve therefore
  // either wins the Pending transition or produces no account at all.
  let results: D1Result<unknown>[];
  try {
    results = await db.batch([
      db
        .prepare(
          `INSERT INTO accounts (
             user_id, name, username, username_normalized,
             credential_hash, credential_kind, credential_version,
             account_status, phone, created_at, updated_at
           )
           SELECT user_id, name, username, username_normalized,
                  credential_hash, credential_kind, 1, 'Active',
                  phone, ?, ?
             FROM registration_requests
            WHERE request_id = ? AND account_status = 'Pending'`
        )
        .bind(now, now, request.request_id),
      // H-35: one credential-free immutable audit outcome in the same
      // transaction as Account creation and request resolution.
      db
        .prepare(
          `INSERT INTO audit_events (
             audit_id, inserted_at, actor_user_id, action, entity_type,
             entity_id, old_value_json, new_value_json, outcome
           )
           VALUES (lower(hex(randomblob(16))), ?, ?, 'REGISTRATION_APPROVE',
                   'registration', ?, ?, ?, 'SUCCESS')`
        )
        .bind(
          new Date(now).toISOString(),
          options.reviewerId,
          request.request_id,
          JSON.stringify({ accountStatus: "Pending" }),
          JSON.stringify({ accountStatus: "Active" })
        ),
      db
        .prepare(
          `UPDATE registration_requests
              SET account_status = 'Active', reviewed_by = ?, reviewed_at = ?,
                  review_decision = 'Approved'
            WHERE request_id = ? AND account_status = 'Pending'`
        )
        .bind(options.reviewerId, now, request.request_id),
    ]);
  } catch (error) {
    if (error instanceof Error && /unique|constraint/iu.test(error.message)) {
      throw new RegistrationConflictError(
        "An account with that username already exists."
      );
    }
    throw error;
  }
  if ((results[1]?.meta?.changes ?? 0) !== 1) {
    const current = await requireRequest(db, request.request_id);
    if (current.account_status === "Active") {
      return "active";
    }
    if (current.account_status === "Rejected") {
      throw new RegistrationConflictError(
        "Cannot approve a registration that was already rejected."
      );
    }
    throw new RegistrationConflictError(
      "Registration approval could not be completed."
    );
  }

  return "active";
}

/**
 * Reject a Pending registration without creating an account. Idempotent: an
 * already-rejected request returns `rejected`. Conflicts: rejecting an
 * approved request (the account already exists). The rejection note (ADR-0006
 * "Rejecting requires a reason"; migration 0012) is written atomically with
 * the terminal Rejected transition — never stored for Pending/Approved rows.
 * The caller (handler) enforces the non-empty note; this layer stores it
 * trimmed.
 */
export async function rejectRegistration(
  db: D1Database,
  options: {
    requestId: string;
    reviewerId: string;
    note: string;
    now?: number;
  }
): Promise<"rejected"> {
  const now = options.now ?? Date.now();
  const request = await requireRequest(db, options.requestId);

  if (request.account_status === "Rejected") {
    return "rejected";
  }
  if (request.account_status === "Active") {
    throw new RegistrationConflictError(
      "Cannot reject a registration that was already approved."
    );
  }

  // H-35: one credential-free immutable audit outcome in the same
  // transaction as the terminal request transition.
  const result = await db.batch([
    db
      .prepare(
        `INSERT INTO audit_events (
           audit_id, inserted_at, actor_user_id, action, entity_type,
           entity_id, old_value_json, new_value_json, outcome, reason
         )
         VALUES (lower(hex(randomblob(16))), ?, ?, 'REGISTRATION_REJECT',
                 'registration', ?, ?, ?, 'SUCCESS', ?)`
      )
      .bind(
        new Date(now).toISOString(),
        options.reviewerId,
        request.request_id,
        JSON.stringify({ accountStatus: "Pending" }),
        JSON.stringify({ accountStatus: "Rejected" }),
        options.note.trim()
      ),
    db
      .prepare(
        `UPDATE registration_requests
            SET account_status = 'Rejected', reviewed_by = ?, reviewed_at = ?,
                review_decision = 'Rejected', rejection_note = ?
          WHERE request_id = ? AND account_status = 'Pending'`
      )
      .bind(options.reviewerId, now, options.note.trim(), request.request_id),
  ]);

  const updateResult = result[1] as D1Result<unknown>;
  if ((updateResult.meta?.changes ?? 0) !== 1) {
    const current = await requireRequest(db, request.request_id);
    if (current.account_status === "Rejected") {
      return "rejected";
    }
    if (current.account_status === "Active") {
      throw new RegistrationConflictError(
        "Cannot reject a registration that was already approved."
      );
    }
    throw new RegistrationConflictError(
      "Registration rejection could not be completed."
    );
  }

  return "rejected";
}

/**
 * Safe metadata columns for the Staff/Admin approval queue (AUTH-05
 * #163). Deliberately excludes `credential_hash`, `credential_kind`, and
 * `user_id` — the queue must never expose credential material or the
 * immutable identity key to the browser.
 */
const QUEUE_COLUMNS = `request_id, username, name, phone, account_status,
  submitted_at, reviewed_by, reviewed_at, review_decision, rejection_note`;

export interface QueueRegistrationRow {
  request_id: string;
  username: string;
  name: string;
  phone: string | null;
  account_status: string;
  submitted_at: number;
  reviewed_by: string | null;
  reviewed_at: number | null;
  review_decision: string | null;
  rejection_note: string | null;
}

export type RegistrationQueueStatus = "Pending" | "Processed";

export interface RegistrationBatchApprovalResult {
  accountStatus: "active";
  approvedCount: number;
}

/**
 * List Pending registration requests for the approval queue, oldest first.
 * Defaults to Pending only (the queue never re-lists resolved requests);
 * returns safe metadata rows with no credential or identity-key material.
 */
export async function listPendingRegistrations(
  db: D1Database
): Promise<QueueRegistrationRow[]> {
  return listRegistrations(db, "Pending");
}

/**
 * List safe approval metadata. `Processed` includes Approved and Rejected
 * requests and remains read-only at the browser boundary.
 */
export async function listRegistrations(
  db: D1Database,
  status: RegistrationQueueStatus = "Pending"
): Promise<QueueRegistrationRow[]> {
  const predicate =
    status === "Pending"
      ? "account_status = 'Pending'"
      : "account_status <> 'Pending'";
  const result = await db
    .prepare(
      `SELECT ${QUEUE_COLUMNS} FROM registration_requests
        WHERE ${predicate}
        ORDER BY submitted_at ASC`
    )
    .all<QueueRegistrationRow>();
  return result.results ?? [];
}

/**
 * Approve an explicit set of Pending registration requests atomically.
 * Idempotency is actor/endpoint/key scoped and stores only a safe response
 * summary. The CTE guard deliberately violates the positive request_count
 * CHECK when any selected request is not Pending, forcing D1 to roll back the
 * whole batch before account/status/audit statements can commit.
 */
export async function approveRegistrationsBatch(
  db: D1Database,
  options: {
    idempotencyKey: string;
    now?: number;
    requestHash: string;
    requestIds: readonly string[];
    reviewerId: string;
  }
): Promise<RegistrationBatchApprovalResult> {
  const ids = [...options.requestIds];
  const now = options.now ?? Date.now();
  if (
    ids.length === 0 ||
    ids.length > 100 ||
    new Set(ids).size !== ids.length
  ) {
    throw new RegistrationConflictError(
      "Registration batch selection is invalid."
    );
  }

  const existing = await db
    .prepare(
      `SELECT request_hash, response_json
         FROM registration_batch_idempotency
        WHERE actor_user_id = ?
          AND endpoint = 'registration.approve-batch'
          AND idempotency_key = ?`
    )
    .bind(options.reviewerId, options.idempotencyKey)
    .first<{ request_hash: string; response_json: string }>();
  if (existing) {
    if (existing.request_hash !== options.requestHash) {
      throw new RegistrationConflictError(
        "Idempotency key was already used for another selection."
      );
    }
    return JSON.parse(
      existing.response_json
    ) as RegistrationBatchApprovalResult;
  }

  const idPlaceholders = ids.map(() => "?").join(", ");
  const response: RegistrationBatchApprovalResult = {
    accountStatus: "active",
    approvedCount: ids.length,
  };
  const responseJson = JSON.stringify(response);
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `WITH candidate AS (
                SELECT COUNT(*) AS valid_count
                  FROM registration_requests
                 WHERE account_status = 'Pending'
                   AND request_id IN (${idPlaceholders})
              )
         INSERT INTO registration_batch_idempotency (
           actor_user_id, endpoint, idempotency_key, request_hash,
           response_json, request_count, created_at
         )
         SELECT ?, 'registration.approve-batch', ?, ?, ?,
                CASE WHEN (SELECT valid_count FROM candidate) = ?
                     THEN ? ELSE -1 END,
                ?`
      )
      .bind(
        ...ids,
        options.reviewerId,
        options.idempotencyKey,
        options.requestHash,
        responseJson,
        ids.length,
        ids.length,
        now
      ),
  ];

  // Keep the D1 batch under its statement limit even for the contract's
  // maximum 100 selected requests: one bulk account insert, one bulk audit
  // insert, and one compare-and-set update instead of three statements per
  // request. The guard above makes these predicates stable for the batch.
  statements.push(
    db
      .prepare(
        `INSERT INTO accounts (
           user_id, name, username, username_normalized,
           credential_hash, credential_kind, credential_version,
           account_status, phone, created_at, updated_at
         )
         SELECT user_id, name, username, username_normalized,
                credential_hash, credential_kind, 1, 'Active',
                phone, ?, ?
           FROM registration_requests
          WHERE request_id IN (${idPlaceholders})
            AND account_status = 'Pending'`
      )
      .bind(now, now, ...ids),
    db
      .prepare(
        `INSERT INTO audit_events (
           audit_id, inserted_at, actor_user_id, action, entity_type,
           entity_id, old_value_json, new_value_json, outcome, correlation_id
         )
         SELECT lower(hex(randomblob(16))), ?, ?,
                'REGISTRATION_BATCH_APPROVE', 'registration', request_id,
                ?, ?, 'SUCCESS', ?
           FROM registration_requests
          WHERE request_id IN (${idPlaceholders})
            AND account_status = 'Pending'`
      )
      .bind(
        new Date(now).toISOString(),
        options.reviewerId,
        JSON.stringify({ accountStatus: "Pending" }),
        JSON.stringify({ accountStatus: "Active" }),
        options.idempotencyKey,
        ...ids
      ),
    db
      .prepare(
        `UPDATE registration_requests
            SET account_status = 'Active', reviewed_by = ?, reviewed_at = ?,
                review_decision = 'Approved'
          WHERE request_id IN (${idPlaceholders})
            AND account_status = 'Pending'`
      )
      .bind(options.reviewerId, now, ...ids)
  );

  try {
    await db.batch(statements);
  } catch (error) {
    const replay = await db
      .prepare(
        `SELECT request_hash, response_json
           FROM registration_batch_idempotency
          WHERE actor_user_id = ?
            AND endpoint = 'registration.approve-batch'
            AND idempotency_key = ?`
      )
      .bind(options.reviewerId, options.idempotencyKey)
      .first<{ request_hash: string; response_json: string }>();
    if (replay?.request_hash === options.requestHash) {
      return JSON.parse(
        replay.response_json
      ) as RegistrationBatchApprovalResult;
    }
    if (
      error instanceof Error &&
      /unique|constraint|check/iu.test(error.message)
    ) {
      throw new RegistrationConflictError(
        "One or more registration requests are no longer pending."
      );
    }
    throw error;
  }

  return response;
}
