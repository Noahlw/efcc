/**
 * EFCC D1 identity (Spec 091) — public surface for the disposable
 * pre-production Role Identity foundation.
 */

export {
  preflightDisposableSchema,
  __test as __preflightTest,
} from "./preflight";

export { seedDisposableIdentity } from "./seeds";

export {
  applyRoleMutation,
  RoleIdempotencyConflictError,
  RoleRevisionConflictError,
} from "./mutations";

export {
  loadRoleHierarchy,
  resolveActorCapabilities,
  loadBootstrapIdentity,
  renameRoleDefinition,
  createRoleDefinition,
  rescopeRoleDefinition,
  reorderRoleDefinitions,
  recordRoleDenialForRename,
  ROLE_NAME_MAX_LENGTH,
  canonicalRenameFingerprint,
  canonicalRescopeFingerprint,
  RoleInvalidNameError,
  RoleNameConflictError,
  RoleArchivedError,
  RoleCapabilityDeniedError,
  RoleAdminProtectedError,
  RoleBaselineProtectedError,
  RoleHighestProtectedError,
  RoleScopeMismatchError,
  RoleSelfRenameError,
  RoleTargetNotFoundError,
  RoleInvalidParentError,
  RoleCrossCategoryError,
  RoleScopeRequiredError,
  RoleOrderConflictError,
} from "./role-hierarchy";
export type {
  RoleHierarchyView,
  RoleHierarchyDefinition,
  RoleHierarchyOrderTarget,
  RoleRenameResult,
  RoleCreateResult,
  RoleRescopeResult,
  RoleReorderResult,
} from "./role-hierarchy";

export { loadRoleDefinitionDetail } from "./permission-editor";
export type {
  RoleDefinitionDetailView,
  RoleDefinitionPermission,
  PermissionGrantChange,
} from "./permission-editor";
