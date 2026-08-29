/**
 * EFCC D1 identity (Spec 091 §6, ADR-0042) — privileged mutation API.
 *
 * Every privileged mutation runs through one D1 batch that:
 *
 *   1. Inserts the PENDING idempotency row (gated by idempotency_key +
 *      request_fingerprint) so replays of the same payload are idempotent
 *      and a key reused with a different payload is rejected with 409
 *      ROLE_IDEMPOTENCY_REUSE.
 *   2. Performs the role / grant / assignment / archive / revoke writes,
 *      each gated on the same PENDING row plus the expected base revision.
 *   3. Advances role_policy_revisions by one on success.
 *   4. Marks the idempotency row SUCCESS or CONFLICT and writes the
 *      terminal audit row in the same batch — D1 rolls the whole batch
 *      back if any statement fails, so role rows, revision, ledger, and
 *      audit cannot partially commit.
 *
 * Worker preflight: the caller is responsible for authorizing the actor
 * (Admin / Staff / Member) and for the protected-identity lock; the schema
 * layer is the last line of defense (rejects UPDATE / DELETE on a
 * protected role_definitions row, rejects an assignment to an archived
 * role, rejects an unknown capability key in role_definition_grants).
 */
/* oxlint-disable eslint/max-classes-per-file, eslint/complexity, eslint/no-unused-vars, eslint/require-await, unicorn/no-lonely-if, unicorn/prefer-single-call -- the mutation batch is one D1 transaction; classes mirror the Worker error vocabulary. */
import { isCapability } from "./capability-catalog";
import type { Capability } from "./capability-catalog";
import type { RoleAuditEventRow, RoleScopeKind } from "./types";

/** Shape of the privileged mutation input the Worker sends to D1. */
export interface RoleMutationInput {
  idempotency_key: string;
  request_fingerprint: string;
  actor_user_id: string;
  base_revision: number;
  now: string;
  audit_id: string;
  /** Correlation/request ID copied to the immutable audit event. */
  correlation_id?: string | null;
  desired: readonly RoleDesiredChange[];
  /**
   * JSON response projection captured with the terminal ledger row. The
   * permission editor supplies its authoritative post-change detail; other
   * mutation domains leave this null.
   */
  result_json?: string | null;
  audit_summary: {
    action: string;
    entity_type: string;
    entity_id: string;
    reason?: string | null;
    old_value_json?: string | null;
    new_value_json?: string | null;
  };
}

export type RoleDesiredChange =
  | {
      kind: "create_role_definition";
      role_definition_id: string;
      category_key: "Global" | "Department" | "Program";
      stable_key: string;
      label: string;
      description: string;
      scope_kind: RoleScopeKind;
      scope_id: string | null;
      position: number;
      capabilities: readonly string[];
    }
  | {
      kind: "archive_role_definition";
      role_definition_id: string;
    }
  | {
      kind: "restore_role_definition";
      role_definition_id: string;
    }
  | {
      kind: "rename_role_definition";
      role_definition_id: string;
      /** New display name (globally unique; Spec 091 §9.2 PATCH identity name). */
      label: string;
    }
  | {
      kind: "reorder_role_definitions";
      category_key: "Global" | "Department" | "Program";
      /**
       * Exactly two sibling Role Definitions inside the fixed category whose
       * positions swap. The mutation kernel writes only these two position
       * values — the parent Category, grants, scope, and assignments are
       * untouched by construction (B-479-07/B-479-08).
       */
      targets: readonly {
        role_definition_id: string;
        position: number;
      }[];
    }
  | {
      kind: "rescope_role_definition";
      role_definition_id: string;
      category_key: "Global" | "Department" | "Program";
      scope_kind: RoleScopeKind;
      scope_id: string | null;
      position: number;
    }
  | {
      kind: "grant_assignment";
      assignment_id: string;
      account_user_id: string;
      role_definition_id: string;
      /** Immutable scope snapshot captured from the Role Definition. */
      scope_kind: RoleScopeKind;
      scope_id: string | null;
    }
  | {
      kind: "revoke_assignment";
      account_user_id: string;
      role_definition_id: string;
      revoke_reason?: string | null;
    }
  | {
      kind: "add_grant";
      role_definition_id: string;
      capability: string;
    }
  | {
      kind: "remove_grant";
      role_definition_id: string;
      capability: string;
    };

export interface RoleMutationResult {
  outcome: "SUCCESS" | "CONFLICT" | "DENIED";
  resulting_revision: number;
  idempotent: boolean;
  created: boolean;
  /** The terminal response projection stored by the mutation, when any. */
  result_json: string | null;
}

export class RoleIdempotencyConflictError extends Error {
  constructor() {
    super(
      "ROLE_IDEMPOTENCY_REUSE: idempotency_key reused with a different payload"
    );
    this.name = "RoleIdempotencyConflictError";
  }
}

export class RoleRevisionConflictError extends Error {
  readonly currentRevision: number;
  readonly reusedKey: boolean;
  readonly auditWritten: boolean;
  readonly requestId?: string;
  constructor(
    currentRevision: number,
    reusedKey: boolean,
    auditWritten = false,
    requestId?: string
  ) {
    super("ROLE_REVISION_CONFLICT: stale base revision");
    this.name = "RoleRevisionConflictError";
    this.currentRevision = currentRevision;
    this.reusedKey = reusedKey;
    this.auditWritten = auditWritten;
    this.requestId = requestId;
  }
}

export class RoleCapabilityCatalogError extends Error {
  readonly capability: string;
  constructor(capability: string) {
    super(`ROLE_CAPABILITY_CLOSED_VIOLATION: unknown capability ${capability}`);
    this.name = "RoleCapabilityCatalogError";
    this.capability = capability;
  }
}

export interface RoleMutationDenialOptions {
  errorCode: string;
  auditOutcome: "DENIED" | "REJECTED" | "DUPLICATE";
  capability?: string;
  resultJson?: string | null;
}

interface RoleMutationRecord {
  idempotency_key: string;
  request_fingerprint: string;
  actor_user_id: string;
  base_revision: number;
  outcome: "PENDING" | "SUCCESS" | "CONFLICT" | "DENIED";
  resulting_revision: number | null;
  result_json: string | null;
}

function gate(
  input: Pick<
    RoleMutationInput,
    | "idempotency_key"
    | "request_fingerprint"
    | "actor_user_id"
    | "base_revision"
  >
): string {
  return `EXISTS (
    SELECT 1 FROM role_policy_mutations m
     WHERE m.idempotency_key = ?
       AND m.request_fingerprint = ?
       AND m.actor_user_id = ?
       AND m.outcome = 'PENDING'
  ) AND EXISTS (
    SELECT 1 FROM role_policy_revisions s
     WHERE s.id = 1 AND s.revision = ?
  )`;
}

function bindGate(
  input: Pick<
    RoleMutationInput,
    | "idempotency_key"
    | "request_fingerprint"
    | "actor_user_id"
    | "base_revision"
  >
) {
  return [
    input.idempotency_key,
    input.request_fingerprint,
    input.actor_user_id,
    input.base_revision,
  ];
}

async function findMutation(
  db: D1Database,
  idempotencyKey: string
): Promise<RoleMutationRecord | null> {
  return db
    .prepare(
      `SELECT idempotency_key, request_fingerprint, actor_user_id,
              base_revision, outcome, resulting_revision, result_json
         FROM role_policy_mutations
        WHERE idempotency_key = ?`
    )
    .bind(idempotencyKey)
    .first<RoleMutationRecord>();
}

/**
 * Read the authoritative current revision (Spec 091 §7). Exported for the
 * rename handler's conflict path (H-12: the response identifies the current
 * authoritative revision).
 */
export async function readCurrentRevision(db: D1Database): Promise<number> {
  const row = await db
    .prepare(`SELECT revision FROM role_policy_revisions WHERE id = 1`)
    .first<{ revision: number }>();
  if (!row) {
    throw new Error("role_policy_revisions singleton missing");
  }
  return row.revision;
}
function mutationResult(
  record: RoleMutationRecord,
  idempotent: boolean,
  created: boolean,
  fallbackRevision: number
): RoleMutationResult {
  if (record.outcome === "PENDING") {
    throw new Error("role mutation did not reach a terminal state");
  }
  return {
    outcome: record.outcome,
    resulting_revision: record.resulting_revision ?? fallbackRevision,
    idempotent,
    created,
    result_json: record.result_json,
  };
}

function storedRequestId(resultJson: string | null): string | undefined {
  if (!resultJson) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(resultJson);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "requestId" in parsed &&
      typeof parsed.requestId === "string"
    ) {
      return parsed.requestId;
    }
  } catch {
    // Pre-0023 rows may contain a legacy projection or malformed data.
  }
  return undefined;
}

/**
 * Reserve a value-idempotent permission mutation as a terminal success. The
 * reservation intentionally does not advance the policy revision or append
 * an audit event, but it still binds the response projection to the actor,
 * fingerprint, and key for response-loss recovery.
 */
export async function reserveRoleMutationNoop(
  db: D1Database,
  input: RoleMutationInput
): Promise<RoleMutationResult> {
  const existing = await findMutation(db, input.idempotency_key);
  if (existing) {
    if (
      existing.actor_user_id !== input.actor_user_id ||
      existing.request_fingerprint !== input.request_fingerprint
    ) {
      throw new RoleIdempotencyConflictError();
    }
    if (existing.outcome === "CONFLICT" || existing.outcome === "DENIED") {
      throw new RoleRevisionConflictError(
        existing.resulting_revision ?? input.base_revision,
        true,
        true
      );
    }
    if (existing.outcome === "SUCCESS") {
      return mutationResult(existing, true, false, input.base_revision);
    }
  }

  const results = await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO role_policy_mutations
           (idempotency_key, request_fingerprint, actor_user_id,
            base_revision, outcome, resulting_revision, result_json,
            applied, audit_written, created_at, completed_at)
         SELECT ?, ?, ?, ?, 'SUCCESS', ?, ?, 0, 0, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM role_policy_revisions
             WHERE id = 1 AND revision = ?
          )`
      )
      .bind(
        input.idempotency_key,
        input.request_fingerprint,
        input.actor_user_id,
        input.base_revision,
        input.base_revision,
        input.result_json ?? null,
        input.now,
        input.now,
        input.base_revision
      ),
  ]);
  const record = await findMutation(db, input.idempotency_key);
  if (!record && (results[0]?.meta?.changes ?? 0) === 0) {
    const conflict = await reserveRoleMutationConflict(db, input);
    if (conflict.outcome === "CONFLICT") {
      throw new RoleRevisionConflictError(
        conflict.resulting_revision,
        conflict.idempotent,
        true
      );
    }
    return conflict;
  }
  if (
    !record ||
    record.actor_user_id !== input.actor_user_id ||
    record.request_fingerprint !== input.request_fingerprint
  ) {
    throw new RoleIdempotencyConflictError();
  }
  return mutationResult(
    record,
    (results[0]?.meta?.changes ?? 0) === 0,
    (results[0]?.meta?.changes ?? 0) > 0,
    input.base_revision
  );
}

/**
 * Reserve one stale-revision conflict in the normalized kernel. The ledger
 * row and its conflict audit are inserted atomically; replaying the same
 * actor/key/fingerprint returns the recorded revision without another audit.
 */
export async function reserveRoleMutationConflict(
  db: D1Database,
  input: RoleMutationInput
): Promise<RoleMutationResult> {
  const existing = await findMutation(db, input.idempotency_key);
  if (existing) {
    if (
      existing.actor_user_id !== input.actor_user_id ||
      existing.request_fingerprint !== input.request_fingerprint
    ) {
      throw new RoleIdempotencyConflictError();
    }
    if (existing.outcome === "SUCCESS") {
      return mutationResult(existing, true, false, input.base_revision);
    }
    if (existing.outcome === "CONFLICT") {
      return mutationResult(existing, true, false, input.base_revision);
    }
    if (existing.outcome === "DENIED") {
      throw new RoleRevisionConflictError(
        existing.resulting_revision ?? input.base_revision,
        true,
        true,
        storedRequestId(existing.result_json)
      );
    }
  }

  const currentRevision = await readCurrentRevision(db);
  const conflictReason = input.audit_summary.reason?.startsWith(
    "ROLE_POLICY_CONFLICT"
  )
    ? input.audit_summary.reason
    : input.audit_summary.action === "ROLE_DEFINITION_REORDER"
      ? `ROLE_ORDER_CONFLICT:current=${currentRevision}`
      : `ROLE_REVISION_CONFLICT:current=${currentRevision}`;
  const results = await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO role_policy_mutations
           (idempotency_key, request_fingerprint, actor_user_id,
            base_revision, outcome, resulting_revision, result_json,
            applied, audit_written, created_at, completed_at)
         VALUES (?, ?, ?, ?, 'CONFLICT',
                 (SELECT revision FROM role_policy_revisions WHERE id = 1),
                 ?, 0, 1, ?, ?)`
      )
      .bind(
        input.idempotency_key,
        input.request_fingerprint,
        input.actor_user_id,
        input.base_revision,
        JSON.stringify({
          errorCode: "ROLE_POLICY_CONFLICT",
          requestId: input.correlation_id ?? null,
        }),
        input.now,
        input.now
      ),
    db
      .prepare(
        `INSERT INTO role_audit_events
           (audit_id, inserted_at, actor_user_id, action, entity_type,
            entity_id, old_value_json, new_value_json, reason, outcome,
            correlation_id)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFLICT', ?
           FROM role_policy_mutations m
          WHERE m.idempotency_key = ?
            AND m.request_fingerprint = ?
            AND m.actor_user_id = ?
            AND m.outcome = 'CONFLICT'
            AND changes() > 0`
      )
      .bind(
        input.audit_id,
        input.now,
        input.actor_user_id,
        input.audit_summary.action,
        input.audit_summary.entity_type,
        input.audit_summary.entity_id,
        input.audit_summary.old_value_json ?? null,
        input.audit_summary.new_value_json ?? null,
        conflictReason,
        input.correlation_id ?? null,
        input.idempotency_key,
        input.request_fingerprint,
        input.actor_user_id
      ),
  ]);
  const record = await findMutation(db, input.idempotency_key);
  if (
    !record ||
    record.actor_user_id !== input.actor_user_id ||
    record.request_fingerprint !== input.request_fingerprint
  ) {
    throw new RoleIdempotencyConflictError();
  }
  if (record.outcome !== "CONFLICT") {
    return mutationResult(record, true, false, currentRevision);
  }
  return mutationResult(
    record,
    (results[0]?.meta?.changes ?? 0) === 0,
    (results[0]?.meta?.changes ?? 0) > 0,
    currentRevision
  );
}

/**
 * Reserve an authorization/validation denial as one terminal idempotency
 * result. The ledger outcome stays DENIED while the audit outcome preserves
 * whether the request was denied by authority or rejected by validation.
 * Replays return the stored terminal metadata and never append another audit.
 */
export async function reserveRoleMutationDenial(
  db: D1Database,
  input: RoleMutationInput,
  options: RoleMutationDenialOptions
): Promise<RoleMutationResult> {
  const existing = await findMutation(db, input.idempotency_key);
  if (existing) {
    if (
      existing.actor_user_id !== input.actor_user_id ||
      existing.request_fingerprint !== input.request_fingerprint
    ) {
      throw new RoleIdempotencyConflictError();
    }
    if (existing.outcome === "SUCCESS" || existing.outcome === "DENIED") {
      return mutationResult(existing, true, false, input.base_revision);
    }
    if (existing.outcome === "CONFLICT") {
      return mutationResult(existing, true, false, input.base_revision);
    }
  }

  const resultJson =
    options.resultJson ??
    JSON.stringify({
      errorCode: options.errorCode,
      requestId: input.correlation_id ?? null,
      ...(options.capability === undefined
        ? {}
        : { capability: options.capability }),
    });
  const results = await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO role_policy_mutations
           (idempotency_key, request_fingerprint, actor_user_id,
            base_revision, outcome, resulting_revision, result_json,
            applied, audit_written, created_at, completed_at)
         VALUES (?, ?, ?, ?, 'DENIED',
                 (SELECT revision FROM role_policy_revisions WHERE id = 1),
                 ?, 0, 1, ?, ?)`
      )
      .bind(
        input.idempotency_key,
        input.request_fingerprint,
        input.actor_user_id,
        input.base_revision,
        resultJson,
        input.now,
        input.now
      ),
    db
      .prepare(
        `INSERT INTO role_audit_events
           (audit_id, inserted_at, actor_user_id, action, entity_type,
            entity_id, old_value_json, new_value_json, reason, outcome,
            correlation_id)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           FROM role_policy_mutations m
          WHERE m.idempotency_key = ?
            AND m.request_fingerprint = ?
            AND m.actor_user_id = ?
            AND m.outcome = 'DENIED'
            AND changes() > 0`
      )
      .bind(
        input.audit_id,
        input.now,
        input.actor_user_id,
        input.audit_summary.action,
        input.audit_summary.entity_type,
        input.audit_summary.entity_id,
        input.audit_summary.old_value_json ?? null,
        input.audit_summary.new_value_json ?? null,
        options.errorCode,
        options.auditOutcome,
        input.correlation_id ?? null,
        input.idempotency_key,
        input.request_fingerprint,
        input.actor_user_id
      ),
  ]);
  const record = await findMutation(db, input.idempotency_key);
  if (
    !record ||
    record.actor_user_id !== input.actor_user_id ||
    record.request_fingerprint !== input.request_fingerprint
  ) {
    throw new RoleIdempotencyConflictError();
  }
  return mutationResult(
    record,
    (results[0]?.meta?.changes ?? 0) === 0,
    (results[0]?.meta?.changes ?? 0) > 0,
    input.base_revision
  );
}

/**
 * Apply a privileged role mutation. The D1 batch is the single source of
 * truth: every statement is gated on the same PENDING idempotency row plus
 * the expected base revision, and D1 rolls the whole batch back if any
 * statement fails.
 */
export async function applyRoleMutation(
  db: D1Database,
  input: RoleMutationInput
): Promise<RoleMutationResult> {
  // Caller-side validation: the capability set must be closed against the
  // canonical catalog. The schema CHECK enforces this at write time, but
  // surfacing the failure as a typed error lets the Worker return a 422
  // POLICY_SAFETY_VIOLATION before the D1 batch.
  for (const change of input.desired) {
    if (change.kind === "add_grant" || change.kind === "remove_grant") {
      if (!isCapability(change.capability)) {
        throw new RoleCapabilityCatalogError(change.capability);
      }
    }
    if (change.kind === "create_role_definition") {
      for (const capability of change.capabilities) {
        if (!isCapability(capability)) {
          throw new RoleCapabilityCatalogError(capability);
        }
      }
    }
  }

  const existing = await findMutation(db, input.idempotency_key);
  if (existing) {
    if (
      existing.actor_user_id !== input.actor_user_id ||
      existing.request_fingerprint !== input.request_fingerprint
    ) {
      throw new RoleIdempotencyConflictError();
    }
    if (existing.outcome === "CONFLICT" || existing.outcome === "DENIED") {
      // A terminal conflict/denial already has its immutable audit outcome.
      // Replays must not append another row.
      throw new RoleRevisionConflictError(
        existing.resulting_revision ?? input.base_revision,
        true,
        true
      );
    }
    if (existing.outcome === "SUCCESS") {
      return {
        outcome: "SUCCESS",
        resulting_revision: existing.resulting_revision ?? input.base_revision,
        idempotent: true,
        created: false,
        result_json: existing.result_json,
      };
    }
  }

  const currentRevision = await readCurrentRevision(db);
  if (currentRevision !== input.base_revision) {
    const conflict = await reserveRoleMutationConflict(db, input);
    if (conflict.outcome === "CONFLICT") {
      throw new RoleRevisionConflictError(
        conflict.resulting_revision,
        conflict.idempotent,
        true
      );
    }
    return conflict;
  }
  if (input.desired.length === 0) {
    return reserveRoleMutationNoop(db, input);
  }
  // A single rename must prove that its guarded UPDATE changed a row before
  // the revision can advance. This closes the concurrent revision race:
  // another writer may commit after the pre-read but before this batch.
  // A single sibling reorder proves the same for its first position UPDATE.
  const domainChangeGuard =
    input.desired.length === 1 &&
    (input.desired[0]?.kind === "rename_role_definition" ||
      input.desired[0]?.kind === "reorder_role_definitions" ||
      input.desired[0]?.kind === "rescope_role_definition")
      ? "AND changes() > 0"
      : "";

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT OR IGNORE INTO role_policy_mutations
           (idempotency_key, request_fingerprint, actor_user_id,
            base_revision, outcome, resulting_revision, created_at)
         VALUES (?, ?, ?, ?, 'PENDING', NULL, ?)`
      )
      .bind(
        input.idempotency_key,
        input.request_fingerprint,
        input.actor_user_id,
        input.base_revision,
        input.now
      ),
  ];

  for (const change of input.desired) {
    const gateClause = gate(input);
    if (change.kind === "create_role_definition") {
      statements.push(
        db
          .prepare(
            `INSERT INTO role_definitions
               (role_definition_id, category_key, stable_key, label, description,
                scope_kind, scope_id, position, is_protected, is_archived,
                created_by, created_at, updated_by, updated_at)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, NULL, ?
              WHERE ${gateClause}`
          )
          .bind(
            change.role_definition_id,
            change.category_key,
            change.stable_key,
            change.label,
            change.description,
            change.scope_kind,
            change.scope_id,
            change.position,
            input.actor_user_id,
            input.now,
            input.now,
            ...bindGate(input)
          )
      );
      for (const capability of change.capabilities) {
        statements.push(
          db
            .prepare(
              `INSERT INTO role_definition_grants
                 (role_definition_id, capability, granted_by, granted_at)
               SELECT ?, ?, ?, ?
                WHERE ${gateClause}`
            )
            .bind(
              change.role_definition_id,
              capability,
              input.actor_user_id,
              input.now,
              ...bindGate(input)
            )
        );
      }
      continue;
    }
    if (change.kind === "archive_role_definition") {
      statements.push(
        db
          .prepare(
            `UPDATE role_definitions
                SET is_archived = 1, updated_by = ?, updated_at = ?
              WHERE role_definition_id = ? AND is_archived = 0
                AND ${gateClause}`
          )
          .bind(
            input.actor_user_id,
            input.now,
            change.role_definition_id,
            ...bindGate(input)
          ),
        db
          .prepare(
            `UPDATE role_assignments
                SET revoked_by = ?, revoked_at = ?, revoke_reason = 'role_archived'
              WHERE role_definition_id = ? AND revoked_at IS NULL
                AND ${gateClause}`
          )
          .bind(
            input.actor_user_id,
            input.now,
            change.role_definition_id,
            ...bindGate(input)
          )
      );
      continue;
    }
    if (change.kind === "restore_role_definition") {
      statements.push(
        db
          .prepare(
            `UPDATE role_definitions
                SET is_archived = 0, updated_by = ?, updated_at = ?
              WHERE role_definition_id = ? AND is_archived = 1
                AND ${gateClause}`
          )
          .bind(
            input.actor_user_id,
            input.now,
            change.role_definition_id,
            ...bindGate(input)
          )
      );
      continue;
    }
    if (change.kind === "rename_role_definition") {
      // #478: the one complete rename mutation. Only label (and the audit
      // bookkeeping columns) are written; role_definition_id, position,
      // scope, grants, and assignments are untouched, so the stable ID,
      // order, scope, and grant/assignment rows survive by construction.
      // The protected-row guard in migration 0019 rejects Admin/會友基礎 at
      // the schema layer as the last line of defense.
      statements.push(
        db
          .prepare(
            `UPDATE role_definitions
                SET label = ?, updated_by = ?, updated_at = ?
              WHERE role_definition_id = ? AND is_archived = 0
                AND ${gateClause}`
          )
          .bind(
            change.label,
            input.actor_user_id,
            input.now,
            change.role_definition_id,
            ...bindGate(input)
          )
      );
      continue;
    }
    if (change.kind === "reorder_role_definitions") {
      // #479 B-479-07/B-479-08: a sibling-only position swap inside one
      // fixed Category. Only the two named position values are written; the
      // parent Category, grants, scope, and assignments are untouched by
      // construction. The schema protected-row guard rejects Admin/會友基礎,
      // and the authority seam pre-validates the two targets are siblings
      // in the same category before this batch runs.
      for (const target of change.targets) {
        statements.push(
          db
            .prepare(
              `UPDATE role_definitions
                  SET position = ?, updated_by = ?, updated_at = ?
                WHERE role_definition_id = ? AND category_key = ?
                  AND is_archived = 0
                  AND ${gateClause}`
            )
            .bind(
              target.position,
              input.actor_user_id,
              input.now,
              target.role_definition_id,
              change.category_key,
              ...bindGate(input)
            )
        );
      }
      continue;
    }
    if (change.kind === "rescope_role_definition") {
      // #479 scope edits atomically reparent the role, update its explicit
      // scope, and choose the authority-computed sibling position. Stable
      // identity, label, grants, and assignments remain untouched.
      statements.push(
        db
          .prepare(
            `UPDATE role_definitions
                SET category_key = ?, scope_kind = ?, scope_id = ?,
                    position = ?, updated_by = ?, updated_at = ?
              WHERE role_definition_id = ? AND is_archived = 0
                AND ${gateClause}`
          )
          .bind(
            change.category_key,
            change.scope_kind,
            change.scope_id,
            change.position,
            input.actor_user_id,
            input.now,
            change.role_definition_id,
            ...bindGate(input)
          )
      );
      continue;
    }
    if (change.kind === "grant_assignment") {
      statements.push(
        db
          .prepare(
            `INSERT INTO role_assignments
               (assignment_id, account_user_id, role_definition_id,
                granted_by, granted_at, scope_kind, scope_id,
                revoked_by, revoked_at, revoke_reason)
             SELECT ?, ?, ?, ?, ?, rd.scope_kind, rd.scope_id,
                    NULL, NULL, NULL
               FROM role_definitions rd
              WHERE rd.role_definition_id = ? AND ${gateClause}`
          )
          .bind(
            change.assignment_id,
            change.account_user_id,
            change.role_definition_id,
            input.actor_user_id,
            input.now,
            change.role_definition_id,
            ...bindGate(input)
          )
      );
      continue;
    }
    if (change.kind === "revoke_assignment") {
      statements.push(
        db
          .prepare(
            `UPDATE role_assignments
                SET revoked_by = ?, revoked_at = ?, revoke_reason = ?
              WHERE account_user_id = ? AND role_definition_id = ? AND revoked_at IS NULL
                AND ${gateClause}`
          )
          .bind(
            input.actor_user_id,
            input.now,
            change.revoke_reason ?? null,
            change.account_user_id,
            change.role_definition_id,
            ...bindGate(input)
          )
      );
      continue;
    }
    if (change.kind === "add_grant") {
      statements.push(
        db
          .prepare(
            `INSERT INTO role_definition_grants
               (role_definition_id, capability, granted_by, granted_at)
             SELECT ?, ?, ?, ?
              WHERE ${gateClause}`
          )
          .bind(
            change.role_definition_id,
            change.capability,
            input.actor_user_id,
            input.now,
            ...bindGate(input)
          )
      );
      continue;
    }
    // remove_grant
    statements.push(
      db
        .prepare(
          `DELETE FROM role_definition_grants
            WHERE role_definition_id = ? AND capability = ?
              AND ${gateClause}`
        )
        .bind(change.role_definition_id, change.capability, ...bindGate(input))
    );
  }

  statements.push(
    db
      .prepare(
        `UPDATE role_policy_revisions
            SET revision = revision + 1, updated_at = ?
          WHERE id = 1 AND revision = ?
            ${domainChangeGuard}
            AND EXISTS (
              SELECT 1 FROM role_policy_mutations m
               WHERE m.idempotency_key = ?
                 AND m.request_fingerprint = ?
                 AND m.actor_user_id = ?
                 AND m.outcome = 'PENDING'
            )`
      )
      .bind(
        input.now,
        input.base_revision,
        input.idempotency_key,
        input.request_fingerprint,
        input.actor_user_id
      ),
    db
      .prepare(
        `UPDATE role_policy_mutations
            SET applied = 1
          WHERE idempotency_key = ?
            AND request_fingerprint = ?
            AND actor_user_id = ?
            AND outcome = 'PENDING'
            AND changes() > 0`
      )
      .bind(
        input.idempotency_key,
        input.request_fingerprint,
        input.actor_user_id
      )
  );
  statements.push(
    db
      .prepare(
        `UPDATE role_policy_mutations
            SET audit_written = 1
          WHERE idempotency_key = ?
            AND request_fingerprint = ?
            AND actor_user_id = ?
            AND outcome = 'PENDING'`
      )
      .bind(
        input.idempotency_key,
        input.request_fingerprint,
        input.actor_user_id
      )
  );

  statements.push(
    db
      .prepare(
        `UPDATE role_policy_mutations
            SET outcome = CASE WHEN applied = 1 THEN 'SUCCESS' ELSE 'CONFLICT' END,
                resulting_revision = (
                  SELECT revision FROM role_policy_revisions WHERE id = 1
                ),
                result_json = CASE WHEN applied = 1 THEN ? ELSE NULL END,
                completed_at = ?
          WHERE idempotency_key = ?
            AND request_fingerprint = ?
            AND actor_user_id = ?
            AND outcome = 'PENDING'`
      )
      .bind(
        input.result_json ?? null,
        input.now,
        input.idempotency_key,
        input.request_fingerprint,
        input.actor_user_id
      )
  );

  // The terminal audit row is the one the read projection can join on.
  // The INSERT is gated on this batch's own PENDING→terminal transition
  // (the outcome UPDATE immediately above): a same-key concurrent batch
  // whose INSERT OR IGNORE lost the PK claim sees changes() = 0 here and
  // must not append a duplicate SUCCESS/CONFLICT audit for the winner's
  // already-audited row. A replay never writes a new row either, because
  // it never flips a PENDING row.
  statements.push(
    db
      .prepare(
        `INSERT INTO role_audit_events
           (audit_id, inserted_at, actor_user_id, action, entity_type,
            entity_id, old_value_json, new_value_json, reason, outcome,
            correlation_id)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?,
                CASE WHEN m.outcome = 'SUCCESS' THEN 'SUCCESS' ELSE 'CONFLICT' END,
                ?
           FROM role_policy_mutations m
          WHERE m.idempotency_key = ?
            AND m.request_fingerprint = ?
            AND m.actor_user_id = ?
            AND m.outcome IN ('SUCCESS', 'CONFLICT')
            AND m.audit_written = 1
            AND changes() > 0`
      )
      .bind(
        input.audit_id,
        input.now,
        input.actor_user_id,
        input.audit_summary.action,
        input.audit_summary.entity_type,
        input.audit_summary.entity_id,
        input.audit_summary.old_value_json ?? null,
        input.audit_summary.new_value_json ?? null,
        input.audit_summary.reason ?? null,
        input.correlation_id ?? null,
        input.idempotency_key,
        input.request_fingerprint,
        input.actor_user_id
      )
  );

  const results = await db.batch(statements);
  const record = await findMutation(db, input.idempotency_key);
  if (
    !record ||
    record.actor_user_id !== input.actor_user_id ||
    record.request_fingerprint !== input.request_fingerprint
  ) {
    throw new RoleIdempotencyConflictError();
  }
  if (record.outcome === "PENDING" || record.outcome === "DENIED") {
    throw new Error("role mutation did not reach a terminal state");
  }
  if (record.outcome === "CONFLICT") {
    throw new RoleRevisionConflictError(
      record.resulting_revision ?? (await readCurrentRevision(db)),
      false,
      true
    );
  }
  // The batch's INSERT OR IGNORE is the authoritative claim on the
  // idempotency key: when another same-key batch won the PK (a concurrent
  // caller that passed preflight before this one), this batch's writes
  const claimed = (results[0]?.meta?.changes ?? 0) > 0;
  return mutationResult(record, !claimed, claimed, input.base_revision);
}

/**
 * Insert a DENIED audit row for an authorization failure. The role_policy_mutations
 * ledger is not touched because the request was rejected before any write.
 */
export async function recordRoleDenial(
  db: D1Database,
  audit: RoleAuditEventRow
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO role_audit_events
         (audit_id, inserted_at, actor_user_id, action, entity_type,
          entity_id, old_value_json, new_value_json, reason, outcome,
          correlation_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      audit.audit_id,
      audit.inserted_at,
      audit.actor_user_id,
      audit.action,
      audit.entity_type,
      audit.entity_id,
      audit.old_value_json,
      audit.new_value_json,
      audit.reason,
      audit.outcome,
      audit.correlation_id
    )
    .run();
}

export const __test = {
  gate,
  bindGate,
};
