/**
 * EFCC D1 identity (Spec 091 §6, ADR-0042) — privileged mutation API.
 *
 * Every privileged mutation runs through one D1 batch that:
 *
 *   1. Inserts the PENDING idempotency row (gated by idempotency_key +
 *      request_fingerprint) so replays of the same payload are idempotent
 *      and a key reused with a different payload is rejected with 409
 *      IDEMPOTENCY_CONFLICT.
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
import { isCapability } from "./types";
import type { Capability, RoleAuditEventRow, RoleScopeKind } from "./types";

/** Shape of the privileged mutation input the Worker sends to D1. */
export interface RoleMutationInput {
  idempotency_key: string;
  request_fingerprint: string;
  actor_user_id: string;
  base_revision: number;
  now: string;
  audit_id: string;
  desired: readonly RoleDesiredChange[];
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
      kind: "grant_assignment";
      assignment_id: string;
      account_user_id: string;
      role_definition_id: string;
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
}

export class RoleIdempotencyConflictError extends Error {
  constructor() {
    super(
      "IDEMPOTENCY_CONFLICT: idempotency_key reused with a different payload"
    );
    this.name = "RoleIdempotencyConflictError";
  }
}

export class RoleRevisionConflictError extends Error {
  readonly currentRevision: number;
  readonly reusedKey: boolean;
  constructor(currentRevision: number, reusedKey: boolean) {
    super("ROLE_REVISION_CONFLICT: stale base revision");
    this.name = "RoleRevisionConflictError";
    this.currentRevision = currentRevision;
    this.reusedKey = reusedKey;
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

interface RoleMutationRecord {
  idempotency_key: string;
  request_fingerprint: string;
  actor_user_id: string;
  base_revision: number;
  outcome: "PENDING" | "SUCCESS" | "CONFLICT" | "DENIED";
  resulting_revision: number | null;
}

function gate(
  input: Pick<
    RoleMutationInput,
    "idempotency_key" | "request_fingerprint" | "base_revision"
  >
): string {
  return `EXISTS (
    SELECT 1 FROM role_policy_mutations m
     WHERE m.idempotency_key = ?
       AND m.request_fingerprint = ?
       AND m.outcome = 'PENDING'
  ) AND EXISTS (
    SELECT 1 FROM role_policy_revisions s
     WHERE s.id = 1 AND s.revision = ?
  )`;
}

function bindGate(
  input: Pick<
    RoleMutationInput,
    "idempotency_key" | "request_fingerprint" | "base_revision"
  >
) {
  return [
    input.idempotency_key,
    input.request_fingerprint,
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
              base_revision, outcome, resulting_revision
         FROM role_policy_mutations
        WHERE idempotency_key = ?`
    )
    .bind(idempotencyKey)
    .first<RoleMutationRecord>();
}

async function readCurrentRevision(db: D1Database): Promise<number> {
  const row = await db
    .prepare(`SELECT revision FROM role_policy_revisions WHERE id = 1`)
    .first<{ revision: number }>();
  if (!row) {
    throw new Error("role_policy_revisions singleton missing");
  }
  return row.revision;
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
    if (existing.request_fingerprint !== input.request_fingerprint) {
      throw new RoleIdempotencyConflictError();
    }
    if (existing.outcome === "CONFLICT" || existing.outcome === "DENIED") {
      throw new RoleRevisionConflictError(
        existing.resulting_revision ?? input.base_revision,
        true
      );
    }
    if (existing.outcome === "SUCCESS") {
      return {
        outcome: "SUCCESS",
        resulting_revision: existing.resulting_revision ?? input.base_revision,
        idempotent: true,
        created: false,
      };
    }
  }

  const currentRevision = await readCurrentRevision(db);
  if (currentRevision !== input.base_revision) {
    throw new RoleRevisionConflictError(currentRevision, false);
  }

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
    if (change.kind === "grant_assignment") {
      statements.push(
        db
          .prepare(
            `INSERT INTO role_assignments
               (assignment_id, account_user_id, role_definition_id,
                granted_by, granted_at, revoked_by, revoked_at, revoke_reason)
             SELECT ?, ?, ?, ?, ?, NULL, NULL, NULL
              WHERE ${gateClause}`
          )
          .bind(
            change.assignment_id,
            change.account_user_id,
            change.role_definition_id,
            input.actor_user_id,
            input.now,
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
            AND EXISTS (
              SELECT 1 FROM role_policy_mutations m
               WHERE m.idempotency_key = ?
                 AND m.request_fingerprint = ?
                 AND m.outcome = 'PENDING'
            )`
      )
      .bind(
        input.now,
        input.base_revision,
        input.idempotency_key,
        input.request_fingerprint
      ),
    db
      .prepare(
        `UPDATE role_policy_mutations
            SET applied = 1
          WHERE idempotency_key = ?
            AND request_fingerprint = ?
            AND outcome = 'PENDING'
            AND changes() > 0`
      )
      .bind(input.idempotency_key, input.request_fingerprint)
  );

  statements.push(
    db
      .prepare(
        `UPDATE role_policy_mutations
            SET outcome = CASE WHEN applied = 1 THEN 'SUCCESS' ELSE 'CONFLICT' END,
                resulting_revision = (
                  SELECT revision FROM role_policy_revisions WHERE id = 1
                ),
                completed_at = ?
          WHERE idempotency_key = ?
            AND request_fingerprint = ?
            AND outcome = 'PENDING'`
      )
      .bind(input.now, input.idempotency_key, input.request_fingerprint)
  );

  // The terminal audit row is the one the read projection can join on;
  // a replay never writes a new row because audit_written is monotonic.
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
            AND m.outcome IN ('SUCCESS', 'CONFLICT')
            AND m.audit_written = 0`
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
        input.idempotency_key,
        input.idempotency_key,
        input.request_fingerprint
      ),
    db
      .prepare(
        `UPDATE role_policy_mutations
            SET audit_written = 1
          WHERE idempotency_key = ?
            AND request_fingerprint = ?
            AND outcome IN ('SUCCESS', 'CONFLICT')
            AND audit_written = 0`
      )
      .bind(input.idempotency_key, input.request_fingerprint)
  );

  const results = await db.batch(statements);
  const record = await findMutation(db, input.idempotency_key);
  if (!record || record.request_fingerprint !== input.request_fingerprint) {
    throw new RoleIdempotencyConflictError();
  }
  if (record.outcome === "PENDING" || record.outcome === "DENIED") {
    throw new Error("role mutation did not reach a terminal state");
  }
  return {
    outcome: record.outcome,
    resulting_revision: record.resulting_revision ?? input.base_revision,
    idempotent: false,
    created: (results[0]?.meta?.changes ?? 0) > 0,
  };
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
