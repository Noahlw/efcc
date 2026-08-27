/**
 * EFCC D1 identity (Spec 091) — public surface for the disposable
 * pre-production Role Identity foundation.
 */

export {
  preflightDisposableSchema,
  __test as __preflightTest,
} from "./preflight";
export type { DisposableDatabaseInfo, PreflightOutcome } from "./preflight";

export { seedDisposableIdentity, __test as __seedsTest } from "./seeds";
export type { SeedResult } from "./seeds";

export {
  applyRoleMutation,
  recordRoleDenial,
  RoleIdempotencyConflictError,
  RoleRevisionConflictError,
  RoleCapabilityCatalogError,
  __test as __mutationsTest,
} from "./mutations";
export type {
  RoleMutationInput,
  RoleMutationResult,
  RoleDesiredChange,
} from "./mutations";

export {
  ROLE_CATEGORY_KEY,
  ROLE_SCOPE_KIND,
  PROTECTED_STABLE_KEYS,
  CAPABILITY_CATALOG,
  ROLE_AUDIT_ACTION,
  isCapability,
} from "./types";
export type {
  RoleCategoryKey,
  RoleScopeKind,
  RoleCategoryRow,
  RoleDefinitionRow,
  RoleDefinitionGrantRow,
  RoleAssignmentRow,
  RolePolicyRevisionRow,
  RolePolicyMutationRecord,
  RoleMutationOutcome,
  RoleAuditEventRow,
  RoleAuditOutcome,
  RoleAuditAction,
  Capability,
} from "./types";
