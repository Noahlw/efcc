/**
 * EFCC D1 identity (Spec 091) — disposable pre-production Role Identity types.
 *
 * Roles, categories, grants, assignments, revisions, idempotency, and audit
 * are the building blocks the read projection (#478) and downstream command
 * handlers rely on. The D1 schema lives in migration 0019_disposable_role_identity.sql;
 * this module is the type-only surface other modules import.
 */

export const ROLE_CATEGORY_KEY = {
  GLOBAL: "Global",
  DEPARTMENT: "Department",
  PROGRAM: "Program",
} as const;

export type RoleCategoryKey =
  (typeof ROLE_CATEGORY_KEY)[keyof typeof ROLE_CATEGORY_KEY];

/** Fixed, non-assignable Role Category (Spec 091 §2). */
export interface RoleCategoryRow {
  category_key: RoleCategoryKey;
  label: string;
  description: string;
  is_assignable: 0 | 1;
  display_order: number;
  created_at: string;
}

export const ROLE_SCOPE_KIND = {
  GLOBAL: "Global",
  DEPARTMENT: "Department",
  PROGRAM: "Program",
} as const;

export type RoleScopeKind =
  (typeof ROLE_SCOPE_KIND)[keyof typeof ROLE_SCOPE_KIND];

/**
 * Normalized Role Definition (Spec 091 §3).
 *
 * `is_protected` covers the three system anchors (`admin`, `staff`,
 * `member` — the last rendered as 會友基礎); their label/description/position
 * are write-guarded at the schema layer.
 *
 * `is_archived` is the lifecycle flag; archived roles keep their grants and
 * assignment history but the Worker transaction is the only path that
 * transitions a role to archived, and it revokes the existing active
 * assignments atomically (the audit row records the revoked accounts).
 */
export interface RoleDefinitionRow {
  role_definition_id: string;
  category_key: RoleCategoryKey;
  stable_key: string;
  label: string;
  description: string;
  scope_kind: RoleScopeKind;
  scope_id: string | null;
  position: number;
  is_protected: 0 | 1;
  is_archived: 0 | 1;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

/** A single grant row (Spec 091 §4). */
export interface RoleDefinitionGrantRow {
  role_definition_id: string;
  capability: Capability;
  granted_by: string | null;
  granted_at: string;
}

/** Active or revoked Account → Role Definition assignment (Spec 091 §5). */
export interface RoleAssignmentRow {
  assignment_id: string;
  account_user_id: string;
  role_definition_id: string;
  granted_by: string;
  granted_at: string;
  revoked_by: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
}

/** Singleton revision ledger row (Spec 091 §6). */
export interface RolePolicyRevisionRow {
  id: 1;
  revision: number;
  updated_at: string;
}

export type RoleMutationOutcome = "PENDING" | "SUCCESS" | "CONFLICT" | "DENIED";

/** Idempotency record (Spec 091 §6). */
export interface RolePolicyMutationRecord {
  idempotency_key: string;
  request_fingerprint: string;
  actor_user_id: string;
  base_revision: number;
  outcome: RoleMutationOutcome;
  resulting_revision: number | null;
}

export type RoleAuditOutcome =
  | "SUCCESS"
  | "DUPLICATE"
  | "CONFLICT"
  | "DENIED"
  | "REJECTED"
  | "FAILED";

/** Immutable role audit row. */
export interface RoleAuditEventRow {
  audit_id: string;
  inserted_at: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  old_value_json: string | null;
  new_value_json: string | null;
  reason: string | null;
  outcome: RoleAuditOutcome;
  correlation_id: string | null;
}

/**
 * Closed capability catalog (Spec 091 §4).
 *
 * The CHECK in role_definition_grants validates against this set at the SQL
 * boundary; an unknown capability key is rejected before any D1 write. New
 * capabilities must be added here, in the migration, and in the authorization
 * seam in lockstep.
 */
export const CAPABILITY_CATALOG = [
  "department.manage",
  "department.publish",
  "department.module.configure",
  "department.manager.assign",
  "program.manage",
  "program.publish",
  "program.enroll",
  "program.leader.assign",
  "account.permissions.read",
  "account.permissions.write",
  "account.directory.read",
  "registration.approval.manage",
  "home.publish",
] as const;

export type Capability = (typeof CAPABILITY_CATALOG)[number];

export function isCapability(value: string): value is Capability {
  return (CAPABILITY_CATALOG as readonly string[]).includes(value);
}

/** Stable keys for the three protected system identities. */
export const PROTECTED_STABLE_KEYS = {
  ADMIN: "admin",
  STAFF: "staff",
  MEMBER: "member",
} as const as Record<string, string>;

/** Audit action vocabulary (Spec 091 §6 + ADR-0042). */
export const ROLE_AUDIT_ACTION = {
  ROLE_DEFINITION_CREATE: "ROLE_DEFINITION_CREATE",
  ROLE_DEFINITION_RENAME: "ROLE_DEFINITION_RENAME",
  ROLE_DEFINITION_ARCHIVE: "ROLE_DEFINITION_ARCHIVE",
  ROLE_DEFINITION_GRANT: "ROLE_DEFINITION_GRANT",
  ROLE_DEFINITION_REVOKE: "ROLE_DEFINITION_REVOKE",
  ROLE_ASSIGNMENT_GRANT: "ROLE_ASSIGNMENT_GRANT",
  ROLE_ASSIGNMENT_REVOKE: "ROLE_ASSIGNMENT_REVOKE",
} as const;

export type RoleAuditAction =
  (typeof ROLE_AUDIT_ACTION)[keyof typeof ROLE_AUDIT_ACTION];
