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
  reserveRoleMutationNoop,
  reserveRoleMutationConflict,
  reserveRoleMutationDenial,
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
  RoleMutationDenialOptions,
} from "./mutations";

export {
  loadRoleHierarchy,
  loadActorRoles,
  resolveActorHighestPosition,
  resolveActorCapabilities,
  renameRoleDefinition,
  createRoleDefinition,
  rescopeRoleDefinition,
  reorderRoleDefinitions,
  recordRoleDenialForRename,
  recordRoleDenialForCreate,
  ROLE_HIERARCHY_ACTION,
  ROLE_NAME_MAX_LENGTH,
  normalizeName,
  canonicalRenameFingerprint,
  canonicalCreateFingerprint,
  canonicalRescopeFingerprint,
  canonicalReorderFingerprint,
  RoleInvalidNameError,
  RoleNameConflictError,
  RoleArchivedError,
  RoleCapabilityDeniedError,
  RoleAdminProtectedError,
  RoleBaselineProtectedError,
  RoleProtectedIdentityError,
  RoleHighestProtectedError,
  RoleScopeMismatchError,
  RoleSelfRenameError,
  RoleInvalidTargetError,
  RoleTargetNotFoundError,
  RoleInvalidParentError,
  RoleCrossCategoryError,
  RoleScopeRequiredError,
  RoleOrderConflictError,
  __test as __hierarchyTest,
} from "./role-hierarchy";
export type {
  RoleHierarchyView,
  RoleHierarchyCategory,
  RoleHierarchyDefinition,
  RoleHierarchyAction,
  RoleHierarchyActionAffordance,
  RoleHierarchyScopeOption,
  RoleHierarchyOrderTarget,
  RoleRenameInput,
  RoleRenameResult,
  RoleCreateInput,
  RoleCreateResult,
  RoleRescopeInput,
  RoleRescopeResult,
  RoleReorderInput,
  RoleReorderResult,
} from "./role-hierarchy";

export {
  ROLE_CATEGORY_KEY,
  ROLE_SCOPE_KIND,
  PROTECTED_STABLE_KEYS,
  CAPABILITY_CATALOG,
  ROLE_AUDIT_ACTION,
  isCapability,
} from "./types";
export {
  HIGH_RISK_CAPABILITIES,
  capabilityMetadata,
} from "./capability-catalog";
export type {
  CapabilityMetadata,
  CapabilityRisk,
  CapabilityGroup,
} from "./capability-catalog";

export {
  loadRoleDefinitionDetail,
  updateRoleDefinitionGrants,
  canonicalPermissionFingerprint,
} from "./permission-editor";
export type {
  RoleDefinitionDetailView,
  RoleDefinitionMutationResult,
  RoleDefinitionPermission,
  RoleDefinitionAssignedAccount,
  PermissionGrantChange,
  UpdateRoleDefinitionGrantsInput,
} from "./permission-editor";
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
