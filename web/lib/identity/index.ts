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
  readCurrentRevision,
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
  loadRoleHierarchy,
  loadActorRoles,
  resolveActorHighestPosition,
  resolveActorCapabilities,
  renameRoleDefinition,
  recordRoleDenialForRename,
  ROLE_HIERARCHY_ACTION,
  ROLE_NAME_MAX_LENGTH,
  normalizeName,
  canonicalRenameFingerprint,
  RoleInvalidNameError,
  RoleNameConflictError,
  RoleCapabilityDeniedError,
  RoleAdminProtectedError,
  RoleBaselineProtectedError,
  RoleProtectedIdentityError,
  RoleHighestProtectedError,
  RoleScopeMismatchError,
  RoleSelfRenameError,
  RoleTargetNotFoundError,
  __test as __hierarchyTest,
} from "./role-hierarchy";
export type {
  RoleHierarchyView,
  RoleHierarchyCategory,
  RoleHierarchyDefinition,
  RoleHierarchyAction,
  RoleHierarchyActionAffordance,
  RoleRenameInput,
  RoleRenameResult,
} from "./role-hierarchy";

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
