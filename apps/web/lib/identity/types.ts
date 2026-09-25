/**
 * EFCC D1 identity (Spec 091) — disposable pre-production Role Identity types.
 *
 * Roles, categories, grants, assignments, revisions, idempotency, and audit
 * are the building blocks the read projection (#478) and downstream command
 * handlers rely on. The D1 schema lives in apps/web/migrations/0000_baseline.sql;
 * this module is the type-only surface other modules import.
 */

import { CAPABILITY_CATALOG, isCapability } from "./capability-catalog";
import type { Capability } from "./capability-catalog";

export { CAPABILITY_CATALOG, isCapability };
export type { Capability };

export const ROLE_CATEGORY_KEY = {
  GLOBAL: "Global",
  DEPARTMENT: "Department",
  PROGRAM: "Program",
} as const;

export type RoleCategoryKey =
  (typeof ROLE_CATEGORY_KEY)[keyof typeof ROLE_CATEGORY_KEY];

const ROLE_SCOPE_KIND = {
  GLOBAL: "Global",
  DEPARTMENT: "Department",
  PROGRAM: "Program",
} as const;

export type RoleScopeKind =
  (typeof ROLE_SCOPE_KIND)[keyof typeof ROLE_SCOPE_KIND];

/**
 * Normalized Role Definition (Spec 091 §3).
 *
 * `is_protected` covers the two fixed system identities (`admin`, `member` —
 * the last rendered as 會友基礎); their label/description/position are
 * write-guarded at the schema layer. Staff is assignable and therefore not
 * protected.
 *
 * `is_archived` is the lifecycle flag; archived roles keep their grants and
 * assignment history but the Worker transaction is the only path that
 * transitions a role to archived, and it revokes the existing active
 * assignments atomically (the audit row records the revoked accounts).
 */

type RoleMutationOutcome = "PENDING" | "SUCCESS" | "CONFLICT" | "DENIED";

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
 * The capability key and metadata catalog live in capability-catalog.ts.
 * Re-exporting the closed keys here keeps the existing identity type surface
 * stable while leaving one code-owned metadata source.
 */

/** Stable keys for the two fixed system identities and assignable Staff. */
export const PROTECTED_STABLE_KEYS = {
  ADMIN: "admin",
  STAFF: "staff",
  MEMBER: "member",
} as const as Record<string, string>;

const ROLE_AUDIT_ACTION = {
  ROLE_DEFINITION_CREATE: "ROLE_DEFINITION_CREATE",
  ROLE_DEFINITION_RENAME: "ROLE_DEFINITION_RENAME",
  ROLE_DEFINITION_RESCOPE: "ROLE_DEFINITION_RESCOPE",
  ROLE_DEFINITION_REORDER: "ROLE_DEFINITION_REORDER",
  ROLE_DEFINITION_ARCHIVE: "ROLE_DEFINITION_ARCHIVE",
  ROLE_DEFINITION_RESTORE: "ROLE_DEFINITION_RESTORE",
  ROLE_DEFINITION_GRANT: "ROLE_DEFINITION_GRANT",
  ROLE_DEFINITION_REVOKE: "ROLE_DEFINITION_REVOKE",
  ROLE_DEFINITION_POLICY_UPDATE: "ROLE_DEFINITION_POLICY_UPDATE",
  ROLE_ASSIGNMENT_GRANT: "ROLE_ASSIGNMENT_GRANT",
  ROLE_ASSIGNMENT_REVOKE: "ROLE_ASSIGNMENT_REVOKE",
} as const;
