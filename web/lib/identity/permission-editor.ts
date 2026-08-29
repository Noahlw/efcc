import { CAPABILITY_CATALOG, isCapability } from "./capability-catalog";
import type { Capability, CapabilityMetadata } from "./capability-catalog";
/**
 * #485 — normalized Role Definition detail and permission mutation authority.
 *
 * This module is deliberately the only grant-editing seam. It projects the
 * closed catalog for the browser, rechecks every authority rule from D1, and
 * delegates all writes to applyRoleMutation.
 */
/* oxlint-disable eslint/complexity, eslint/no-await-in-loop, eslint/no-unused-vars, unicorn/no-lonely-if -- the authority sequence mirrors the identity mutation vocabulary and every guard is explicit. */
import {
  applyRoleMutation,
  readCurrentRevision,
  reserveRoleMutationConflict,
  reserveRoleMutationDenial,
  reserveRoleMutationNoop,
  RoleCapabilityCatalogError,
  RoleIdempotencyConflictError,
  RoleRevisionConflictError,
} from "./mutations";
import {
  loadActorRoles,
  resolveActorCapabilities,
  ROLE_HIERARCHY_ACTION,
  RoleAdminProtectedError,
  RoleArchivedError,
  RoleBaselineProtectedError,
  RoleCapabilityDeniedError,
  RoleHighestProtectedError,
  RoleInvalidTargetError,
  RoleScopeMismatchError,
  RoleTargetNotFoundError,
} from "./role-hierarchy";
import type {
  RoleHierarchyActionAffordance,
  RoleHierarchyDefinition,
} from "./role-hierarchy";
import { PROTECTED_STABLE_KEYS, ROLE_CATEGORY_KEY } from "./types";
import type { RoleAuditOutcome, RoleScopeKind } from "./types";

export interface RoleDefinitionPermission {
  capability: Capability;
  label: string;
  description: string;
  group: CapabilityMetadata["group"];
  risk: CapabilityMetadata["risk"];
  scopeRequired: boolean;
  value: boolean;
  editable: boolean;
  locked: boolean;
  lockReason: string | null;
}

export interface RoleDefinitionAssignedAccount {
  assignmentId: string;
  userId: string;
  name: string;
  username: string;
  status: string;
}

export interface RoleDefinitionDetailView {
  roleDefinition: RoleHierarchyDefinition;
  permissions: readonly RoleDefinitionPermission[];
  assignedAccounts: readonly RoleDefinitionAssignedAccount[];
  revision: number;
  caller: {
    userId: string;
    canRead: boolean;
    canWrite: boolean;
  };
}

export interface PermissionGrantChange {
  capability: Capability;
  value: boolean;
}

export interface UpdateRoleDefinitionGrantsInput {
  actor_user_id: string;
  role_definition_id: string;
  base_revision: number;
  idempotency_key: string;
  changes: readonly PermissionGrantChange[];
  now: string;
  audit_id: string;
  correlation_id: string;
}

export interface RoleDefinitionMutationResult extends RoleDefinitionDetailView {
  idempotent: boolean;
  /** Internal transport identity; handlers strip it from public data. */
  responseRequestId?: string;
}

interface RoleDefinitionRecord {
  role_definition_id: string;
  stable_key: string;
  label: string;
  description: string;
  category_key: "Global" | "Department" | "Program";
  scope_kind: RoleScopeKind;
  scope_id: string | null;
  position: number;
  is_protected: number;
  is_archived: number;
}

interface CountRecord {
  assignments: number;
  grants: number;
}

interface AssignedAccountRecord {
  assignment_id: string;
  user_id: string;
  name: string;
  username: string;
  account_status: string;
}

interface MutationRecord {
  idempotency_key: string;
  request_fingerprint: string;
  actor_user_id: string;
  outcome: "PENDING" | "SUCCESS" | "CONFLICT" | "DENIED";
  resulting_revision: number | null;
  result_json: string | null;
}

function roleKind(
  categoryKey: RoleDefinitionRecord["category_key"],
  stableKey: string
): RoleHierarchyDefinition["kind"] {
  if (
    categoryKey === ROLE_CATEGORY_KEY.GLOBAL &&
    Object.values(PROTECTED_STABLE_KEYS).includes(stableKey)
  ) {
    return "SYSTEM";
  }
  if (categoryKey === ROLE_CATEGORY_KEY.GLOBAL) {
    return "GLOBAL";
  }
  if (categoryKey === ROLE_CATEGORY_KEY.DEPARTMENT) {
    return "DEPARTMENT_SCOPED";
  }
  return "PROGRAM_SCOPED";
}

function withinActorScope(
  actorRoles: Awaited<ReturnType<typeof loadActorRoles>>,
  target: RoleDefinitionRecord
): boolean {
  const highest = actorRoles[0];
  if (!highest) {
    return false;
  }
  if (highest.scope_kind === ROLE_CATEGORY_KEY.GLOBAL) {
    return true;
  }
  return (
    highest.scope_kind === target.scope_kind &&
    highest.scope_id !== null &&
    highest.scope_id === target.scope_id
  );
}

function scopeLabel(
  scopeKind: RoleScopeKind,
  scopeId: string | null
): string | null {
  if (scopeKind === ROLE_CATEGORY_KEY.GLOBAL) {
    return null;
  }
  return scopeId;
}
async function readScopeLabel(
  db: D1Database,
  target: RoleDefinitionRecord
): Promise<string | null> {
  if (target.scope_kind === ROLE_CATEGORY_KEY.GLOBAL || !target.scope_id) {
    return null;
  }
  if (target.scope_kind === ROLE_CATEGORY_KEY.DEPARTMENT) {
    const row = await db
      .prepare("SELECT name FROM departments WHERE department_id = ?")
      .bind(target.scope_id)
      .first<{ name: string }>();
    return row?.name ?? scopeLabel(target.scope_kind, target.scope_id);
  }
  if (target.scope_kind === ROLE_CATEGORY_KEY.PROGRAM) {
    const row = await db
      .prepare("SELECT name FROM programs WHERE program_id = ?")
      .bind(target.scope_id)
      .first<{ name: string }>();
    return row?.name ?? scopeLabel(target.scope_kind, target.scope_id);
  }
  return scopeLabel(target.scope_kind, target.scope_id);
}

async function findRoleDefinition(
  db: D1Database,
  roleDefinitionId: string
): Promise<RoleDefinitionRecord | null> {
  return db
    .prepare(
      `SELECT role_definition_id, stable_key, label, description,
              category_key, scope_kind, scope_id, position,
              is_protected, is_archived
         FROM role_definitions
        WHERE role_definition_id = ?`
    )
    .bind(roleDefinitionId)
    .first<RoleDefinitionRecord>();
}

async function readRoleCounts(
  db: D1Database,
  roleDefinitionId: string
): Promise<CountRecord> {
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM role_assignments
           WHERE role_definition_id = ? AND revoked_at IS NULL) AS assignments,
         (SELECT COUNT(*) FROM role_definition_grants
           WHERE role_definition_id = ?) AS grants`
    )
    .bind(roleDefinitionId, roleDefinitionId)
    .first<CountRecord>();
  return row ?? { assignments: 0, grants: 0 };
}

async function readAssignedAccounts(
  db: D1Database,
  roleDefinitionId: string
): Promise<RoleDefinitionAssignedAccount[]> {
  const rows = await db
    .prepare(
      `SELECT ra.assignment_id, a.user_id, a.name, a.username,
              a.account_status
         FROM role_assignments ra
         JOIN accounts a ON a.user_id = ra.account_user_id
        WHERE ra.role_definition_id = ? AND ra.revoked_at IS NULL
        ORDER BY a.name COLLATE NOCASE ASC, a.user_id ASC`
    )
    .bind(roleDefinitionId)
    .all<AssignedAccountRecord>();
  return (rows.results ?? []).map((row) => ({
    assignmentId: row.assignment_id,
    userId: row.user_id,
    name: row.name,
    username: row.username,
    status: row.account_status,
  }));
}

async function readRoleGrants(
  db: D1Database,
  roleDefinitionId: string
): Promise<Set<string>> {
  const rows = await db
    .prepare(
      `SELECT capability FROM role_definition_grants
        WHERE role_definition_id = ?`
    )
    .bind(roleDefinitionId)
    .all<{ capability: string }>();
  return new Set((rows.results ?? []).map((row) => row.capability));
}

async function readMutation(
  db: D1Database,
  idempotencyKey: string
): Promise<MutationRecord | null> {
  return db
    .prepare(
      `SELECT idempotency_key, request_fingerprint, actor_user_id,
              outcome, resulting_revision, result_json
         FROM role_policy_mutations
        WHERE idempotency_key = ?`
    )
    .bind(idempotencyKey)
    .first<MutationRecord>();
}

function lockReasonFor(
  target: RoleDefinitionRecord,
  actorRoles: Awaited<ReturnType<typeof loadActorRoles>>,
  canWrite: boolean,
  metadata: CapabilityMetadata,
  actorCanGrant: boolean
): string | null {
  if (target.stable_key === PROTECTED_STABLE_KEYS.ADMIN) {
    return "系統管理員身份的所有權限均由系統固定。";
  }
  if (target.stable_key === PROTECTED_STABLE_KEYS.MEMBER) {
    return "會友基礎是所有生效帳戶的自動基線，不可修改。";
  }
  if (target.is_archived === 1) {
    return "已停用的身份組只供查看，不能修改權限。";
  }
  const highest = actorRoles[0];
  if (!highest || target.position <= highest.position) {
    return "不可修改自己或更高順位的身份組。";
  }
  if (!withinActorScope(actorRoles, target)) {
    return "身份組超出你的可管理範圍。";
  }
  if (!canWrite) {
    return "你沒有編輯身份組權限。";
  }
  if (
    metadata.systemOnly &&
    !actorRoles.some((role) => role.stable_key === PROTECTED_STABLE_KEYS.ADMIN)
  ) {
    return "此項權限只限系統管理員授予。";
  }
  if (!actorCanGrant) {
    return "你未獲授權授予此項能力。";
  }
  return null;
}
interface RoleActionProjection {
  actions: RoleHierarchyActionAffordance[];
  reorderActions: RoleHierarchyActionAffordance[];
}

function projectRoleActions(
  target: RoleDefinitionRecord,
  actorRoles: Awaited<ReturnType<typeof loadActorRoles>>,
  capabilities: Readonly<Record<string, boolean>>
): RoleActionProjection {
  const highest = actorRoles[0];
  const lowerThanHighest =
    highest !== undefined &&
    target.position > highest.position &&
    highest.role_definition_id !== target.role_definition_id;
  const inScope = withinActorScope(actorRoles, target);
  const canRename =
    capabilities["role.name.write"] === true &&
    (target.is_protected === 0 ||
      target.stable_key === PROTECTED_STABLE_KEYS.STAFF) &&
    target.is_archived === 0 &&
    lowerThanHighest &&
    inScope;
  const canRescope =
    capabilities["role.scope.write"] === true &&
    (highest?.stable_key === PROTECTED_STABLE_KEYS.ADMIN ||
      highest?.stable_key === PROTECTED_STABLE_KEYS.STAFF) &&
    target.is_protected === 0 &&
    target.stable_key !== PROTECTED_STABLE_KEYS.ADMIN &&
    target.stable_key !== PROTECTED_STABLE_KEYS.MEMBER &&
    target.is_archived === 0 &&
    lowerThanHighest &&
    inScope;
  const canReadPermissions =
    capabilities["role.permissions.read"] === true &&
    target.is_protected === 0 &&
    target.stable_key !== PROTECTED_STABLE_KEYS.ADMIN &&
    target.stable_key !== PROTECTED_STABLE_KEYS.MEMBER &&
    target.is_archived === 0 &&
    lowerThanHighest &&
    inScope;
  const canReorder =
    capabilities["role.reorder"] === true &&
    target.is_archived === 0 &&
    lowerThanHighest &&
    inScope;
  const actions: RoleHierarchyActionAffordance[] = [];
  if (canRename) {
    actions.push({
      action: ROLE_HIERARCHY_ACTION.RENAME,
      label: "重新命名",
    });
  }
  if (canRescope) {
    actions.push({
      action: ROLE_HIERARCHY_ACTION.SCOPE,
      label: "編輯適用範圍",
    });
  }
  if (canReadPermissions) {
    actions.push({
      action: ROLE_HIERARCHY_ACTION.PERMISSIONS,
      label: "編輯權限",
    });
  }
  return {
    actions,
    reorderActions: canReorder
      ? [{ action: ROLE_HIERARCHY_ACTION.REORDER, label: "調整順序" }]
      : [],
  };
}

function toRoleDefinition(
  target: RoleDefinitionRecord,
  counts: CountRecord,
  scopeName: string | null,
  actionProjection: RoleActionProjection
): RoleHierarchyDefinition {
  return {
    roleDefinitionId: target.role_definition_id,
    label: target.label,
    description: target.description,
    kind: roleKind(target.category_key, target.stable_key),
    scopeKind: target.scope_kind,
    scopeId: target.scope_id,
    scopeLabel: scopeName,
    position: target.position,
    isProtected: target.is_protected === 1,
    isArchived: target.is_archived === 1,
    assignmentCount: counts.assignments,
    grantCount: counts.grants,
    actions: actionProjection.actions,
    reorderActions: actionProjection.reorderActions,
  };
}

function capabilityScopeFor(
  target: RoleDefinitionRecord
): { departmentId?: string; programId?: string } | null {
  if (target.scope_kind === ROLE_CATEGORY_KEY.DEPARTMENT && target.scope_id) {
    return { departmentId: target.scope_id };
  }
  if (target.scope_kind === ROLE_CATEGORY_KEY.PROGRAM && target.scope_id) {
    return { programId: target.scope_id };
  }
  return null;
}

function projectTerminalDetail(
  detail: RoleDefinitionDetailView,
  changes: readonly PermissionGrantChange[],
  revision: number
): RoleDefinitionDetailView {
  const changedByCapability = new Map(
    changes.map((change) => [change.capability, change.value])
  );
  const grantDelta = changes.reduce(
    (delta, change) => delta + (change.value ? 1 : -1),
    0
  );
  return {
    ...detail,
    roleDefinition: {
      ...detail.roleDefinition,
      grantCount: Math.max(0, detail.roleDefinition.grantCount + grantDelta),
    },
    permissions: detail.permissions.map((permission) => {
      const value = changedByCapability.get(permission.capability);
      return value === undefined ? permission : { ...permission, value };
    }),
    revision,
  };
}

interface StoredRoleResponse {
  requestId?: string;
  data: RoleDefinitionDetailView;
}

function isRoleDefinitionDetail(
  value: unknown
): value is RoleDefinitionDetailView {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("roleDefinition" in value) || !("permissions" in value)) {
    return false;
  }
  return (
    typeof value.roleDefinition === "object" &&
    value.roleDefinition !== null &&
    Array.isArray(value.permissions) &&
    "revision" in value &&
    typeof value.revision === "number"
  );
}

function parseStoredResponse(
  resultJson: string | null
): StoredRoleResponse | null {
  if (!resultJson) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(resultJson);
    if (isRoleDefinitionDetail(parsed)) {
      return { data: parsed };
    }
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "data" in parsed &&
      isRoleDefinitionDetail(parsed.data)
    ) {
      const requestId =
        "requestId" in parsed && typeof parsed.requestId === "string"
          ? parsed.requestId
          : undefined;
      return { requestId, data: parsed.data };
    }
  } catch {
    // Pre-0023 rows may contain a legacy projection or malformed data.
  }
  return null;
}

export function canonicalPermissionFingerprint(input: {
  actor_user_id: string;
  role_definition_id: string;
  base_revision: number;
  changes: readonly { capability: string; value: boolean }[];
}): string {
  const changes = input.changes
    .map((change) => `${change.capability}:${change.value ? "1" : "0"}`)
    .sort()
    .join(",");
  return `permission|${input.actor_user_id}|${input.role_definition_id}|${input.base_revision}|${changes}`;
}

/**
 * Project one Role Definition's complete closed capability state. The caller
 * must hold role.permissions.read; target locks are represented in the
 * projection rather than hidden, so the UI can explain every unavailable
 * switch without treating the projection as authority.
 */
export async function loadRoleDefinitionDetail(
  db: D1Database,
  actorUserId: string,
  roleDefinitionId: string
): Promise<RoleDefinitionDetailView> {
  if (!roleDefinitionId) {
    throw new RoleInvalidTargetError();
  }
  const target = await findRoleDefinition(db, roleDefinitionId);
  if (!target) {
    throw new RoleTargetNotFoundError();
  }
  const capabilities = await resolveActorCapabilities(
    db,
    actorUserId,
    capabilityScopeFor(target)
  );
  if (!capabilities["role.permissions.read"]) {
    throw new RoleCapabilityDeniedError();
  }
  const actorRoles = await loadActorRoles(db, actorUserId);
  const highest = actorRoles[0];
  if (highest && !withinActorScope(actorRoles, target)) {
    throw new RoleScopeMismatchError();
  }
  const canWrite =
    capabilities["role.permissions.write"] === true &&
    target.is_archived === 0 &&
    target.stable_key !== PROTECTED_STABLE_KEYS.ADMIN &&
    target.stable_key !== PROTECTED_STABLE_KEYS.MEMBER &&
    highest !== undefined &&
    target.position > highest.position &&
    highest.role_definition_id !== target.role_definition_id;
  const [counts, grants, assignedAccounts, revision, scopeName] =
    await Promise.all([
      readRoleCounts(db, roleDefinitionId),
      readRoleGrants(db, roleDefinitionId),
      readAssignedAccounts(db, roleDefinitionId),
      readCurrentRevision(db),
      readScopeLabel(db, target),
    ]);
  const isAdminTarget = target.stable_key === PROTECTED_STABLE_KEYS.ADMIN;
  const isBaselineTarget = target.stable_key === PROTECTED_STABLE_KEYS.MEMBER;
  const hasAdminIdentity = actorRoles.some(
    (role) => role.stable_key === PROTECTED_STABLE_KEYS.ADMIN
  );
  const permissions = CAPABILITY_CATALOG.map((metadata) => {
    const value =
      isAdminTarget ||
      (isBaselineTarget && metadata.capability === "program.enroll") ||
      grants.has(metadata.capability);
    const actorCanGrant =
      hasAdminIdentity ||
      (!metadata.systemOnly && capabilities[metadata.capability] === true);
    const lockReason = lockReasonFor(
      target,
      actorRoles,
      canWrite,
      metadata,
      actorCanGrant
    );
    const editable = lockReason === null;
    return {
      capability: metadata.capability,
      label: metadata.label,
      description: metadata.description,
      group: metadata.group,
      risk: metadata.risk,
      scopeRequired: metadata.scopeRequired,
      value,
      editable,
      locked: !editable,
      lockReason,
    } satisfies RoleDefinitionPermission;
  });
  const actionProjection = projectRoleActions(target, actorRoles, capabilities);
  return {
    roleDefinition: toRoleDefinition(
      target,
      counts,
      scopeName,
      actionProjection
    ),
    permissions,
    assignedAccounts,
    revision,
    caller: {
      userId: actorUserId,
      canRead: true,
      canWrite,
    },
  };
}

function permissionErrorCode(error: Error): string {
  if (error instanceof RoleCapabilityCatalogError) {
    return "ROLE_NOT_FOUND";
  }
  if (error instanceof RoleAdminProtectedError) {
    return "ROLE_ADMIN_PROTECTED";
  }
  if (error instanceof RoleBaselineProtectedError) {
    return "ROLE_BASELINE_PROTECTED";
  }
  if (error instanceof RoleArchivedError) {
    return "ROLE_ARCHIVED";
  }
  if (error instanceof RoleHighestProtectedError) {
    return "ROLE_HIGHEST_PROTECTED";
  }
  if (error instanceof RoleScopeMismatchError) {
    return "ROLE_SCOPE_MISMATCH";
  }
  if (error instanceof RoleInvalidTargetError) {
    return "ROLE_INVALID_TARGET";
  }
  return "ROLE_FORBIDDEN";
}

interface StoredPermissionError {
  errorCode: string;
  requestId?: string;
  capability?: string;
}

function parseStoredPermissionError(
  resultJson: string | null
): StoredPermissionError | null {
  if (!resultJson) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(resultJson);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("errorCode" in parsed) ||
      typeof parsed.errorCode !== "string"
    ) {
      return null;
    }
    const requestId =
      "requestId" in parsed && typeof parsed.requestId === "string"
        ? parsed.requestId
        : undefined;
    const capability =
      "capability" in parsed && typeof parsed.capability === "string"
        ? parsed.capability
        : undefined;
    return { errorCode: parsed.errorCode, requestId, capability };
  } catch {
    return null;
  }
}

function replayPermissionError(resultJson: string | null): Error | null {
  const stored = parseStoredPermissionError(resultJson);
  if (!stored) {
    return null;
  }
  const error =
    stored.errorCode === "ROLE_NOT_FOUND"
      ? new RoleCapabilityCatalogError(stored.capability ?? "")
      : stored.errorCode === "ROLE_ADMIN_PROTECTED"
        ? new RoleAdminProtectedError()
        : stored.errorCode === "ROLE_BASELINE_PROTECTED"
          ? new RoleBaselineProtectedError()
          : stored.errorCode === "ROLE_ARCHIVED"
            ? new RoleArchivedError()
            : stored.errorCode === "ROLE_HIGHEST_PROTECTED"
              ? new RoleHighestProtectedError()
              : stored.errorCode === "ROLE_SCOPE_MISMATCH"
                ? new RoleScopeMismatchError()
                : stored.errorCode === "ROLE_INVALID_TARGET"
                  ? new RoleInvalidTargetError()
                  : new RoleCapabilityDeniedError();
  if (stored.requestId) {
    Object.assign(error, { requestId: stored.requestId });
  }
  return error;
}

async function recordPermissionOutcome(
  db: D1Database,
  input: UpdateRoleDefinitionGrantsInput,
  changes: readonly { capability: string; value: boolean }[],
  reason: string,
  outcome: Extract<RoleAuditOutcome, "DENIED" | "REJECTED">,
  requestFingerprint: string,
  capability?: string
): Promise<void> {
  await reserveRoleMutationDenial(
    db,
    {
      idempotency_key: input.idempotency_key,
      request_fingerprint: requestFingerprint,
      actor_user_id: input.actor_user_id,
      base_revision: input.base_revision,
      now: input.now,
      audit_id: input.audit_id,
      correlation_id: input.correlation_id,
      desired: [],
      audit_summary: {
        action: "ROLE_DEFINITION_POLICY_UPDATE",
        entity_type: "role_definition",
        entity_id: input.role_definition_id,
        old_value_json: null,
        new_value_json: JSON.stringify(changes),
      },
    },
    {
      errorCode: reason,
      auditOutcome: outcome,
      capability,
    }
  );
}

/**
 * Apply a complete intended grant delta atomically through applyRoleMutation.
 * No grant row is written here; duplicate/no-op entries simply return the
 * authoritative projection without advancing the policy revision.
 */
export async function updateRoleDefinitionGrants(
  db: D1Database,
  input: UpdateRoleDefinitionGrantsInput
): Promise<RoleDefinitionMutationResult> {
  if (!input.role_definition_id) {
    throw new RoleInvalidTargetError();
  }
  const target = await findRoleDefinition(db, input.role_definition_id);
  if (!target) {
    throw new RoleTargetNotFoundError();
  }

  if (!Array.isArray(input.changes)) {
    throw new RoleInvalidTargetError();
  }
  const rawChanges: readonly unknown[] = input.changes;
  const fingerprintChanges = rawChanges.map((change) => {
    if (typeof change !== "object" || change === null) {
      return { capability: "", value: false };
    }
    const capability =
      "capability" in change && typeof change.capability === "string"
        ? change.capability
        : "";
    const value =
      "value" in change && typeof change.value === "boolean"
        ? change.value
        : false;
    return { capability, value };
  });
  const fingerprint = canonicalPermissionFingerprint({
    actor_user_id: input.actor_user_id,
    role_definition_id: input.role_definition_id,
    base_revision: input.base_revision,
    changes: fingerprintChanges,
  });

  // Replays are resolved before current authority checks. A response-loss
  // retry therefore replays the original terminal result even if the actor's
  // assignments or grants changed after the first request.
  const existing = await readMutation(db, input.idempotency_key);
  if (existing) {
    if (
      existing.actor_user_id !== input.actor_user_id ||
      existing.request_fingerprint !== fingerprint
    ) {
      // A changed actor/key/fingerprint is rejected without a new audit.
      throw new RoleIdempotencyConflictError();
    }
    if (existing.outcome === "DENIED") {
      throw (
        replayPermissionError(existing.result_json) ??
        new RoleCapabilityDeniedError()
      );
    }
    if (existing.outcome === "SUCCESS") {
      const stored = parseStoredResponse(existing.result_json);
      if (stored) {
        return {
          ...stored.data,
          idempotent: true,
          responseRequestId: stored.requestId,
        };
      }
      // Explicit pre-0023 fallback: old terminal rows have no response
      // envelope, so only those rows re-read the current detail.
      const detail = await loadRoleDefinitionDetail(
        db,
        input.actor_user_id,
        input.role_definition_id
      );
      return { ...detail, idempotent: true };
    }
    if (existing.outcome === "CONFLICT") {
      const storedError = parseStoredPermissionError(existing.result_json);
      throw new RoleRevisionConflictError(
        existing.resulting_revision ?? (await readCurrentRevision(db)),
        true,
        true,
        storedError?.requestId
      );
    }
  }

  const normalized = new Map<string, boolean>();
  for (const change of rawChanges) {
    if (typeof change !== "object" || change === null) {
      const error = new RoleInvalidTargetError();
      await recordPermissionOutcome(
        db,
        input,
        fingerprintChanges,
        permissionErrorCode(error),
        "REJECTED",
        fingerprint
      );
      throw error;
    }
    const capability =
      "capability" in change && typeof change.capability === "string"
        ? change.capability
        : null;
    const value =
      "value" in change && typeof change.value === "boolean"
        ? change.value
        : null;
    if (capability === null || value === null) {
      const error = new RoleInvalidTargetError();
      await recordPermissionOutcome(
        db,
        input,
        fingerprintChanges,
        permissionErrorCode(error),
        "REJECTED",
        fingerprint
      );
      throw error;
    }
    if (!isCapability(capability)) {
      const error = new RoleCapabilityCatalogError(capability);
      await recordPermissionOutcome(
        db,
        input,
        fingerprintChanges,
        permissionErrorCode(error),
        "REJECTED",
        fingerprint,
        capability
      );
      throw error;
    }
    const previous = normalized.get(capability);
    if (previous !== undefined && previous !== value) {
      const error = new RoleInvalidTargetError();
      await recordPermissionOutcome(
        db,
        input,
        fingerprintChanges,
        permissionErrorCode(error),
        "REJECTED",
        fingerprint
      );
      throw error;
    }
    normalized.set(capability, value);
  }
  const requestedChanges = [...normalized.entries()].map(
    ([capability, value]) => ({ capability: capability as Capability, value })
  );
  const reject = async (
    error: Error,
    outcome: Extract<RoleAuditOutcome, "DENIED" | "REJECTED"> = "DENIED"
  ): Promise<never> => {
    await recordPermissionOutcome(
      db,
      input,
      requestedChanges,
      permissionErrorCode(error),
      outcome,
      fingerprint,
      error instanceof RoleCapabilityCatalogError ? error.capability : undefined
    );
    throw error;
  };

  let detail: RoleDefinitionDetailView;
  try {
    detail = await loadRoleDefinitionDetail(
      db,
      input.actor_user_id,
      input.role_definition_id
    );
  } catch (error) {
    if (
      error instanceof RoleCapabilityDeniedError ||
      error instanceof RoleScopeMismatchError
    ) {
      await recordPermissionOutcome(
        db,
        input,
        requestedChanges,
        permissionErrorCode(error),
        "DENIED",
        fingerprint
      );
    }
    throw error;
  }
  const actorRoles = await loadActorRoles(db, input.actor_user_id);
  const highest = actorRoles[0];
  if (target.stable_key === PROTECTED_STABLE_KEYS.ADMIN) {
    return reject(new RoleAdminProtectedError());
  }
  if (target.stable_key === PROTECTED_STABLE_KEYS.MEMBER) {
    return reject(new RoleBaselineProtectedError());
  }
  if (target.is_archived === 1) {
    return reject(new RoleArchivedError(), "REJECTED");
  }
  if (!highest || target.position <= highest.position) {
    return reject(new RoleHighestProtectedError());
  }
  if (!withinActorScope(actorRoles, target)) {
    return reject(new RoleScopeMismatchError());
  }
  if (!detail.caller.canWrite) {
    return reject(new RoleCapabilityDeniedError());
  }
  for (const change of requestedChanges) {
    const permission = detail.permissions.find(
      (item) => item.capability === change.capability
    );
    if (!permission || !permission.editable) {
      return reject(new RoleCapabilityDeniedError());
    }
  }

  const currentRevision = await readCurrentRevision(db);
  if (currentRevision !== input.base_revision) {
    const conflict = await reserveRoleMutationConflict(db, {
      idempotency_key: input.idempotency_key,
      request_fingerprint: fingerprint,
      actor_user_id: input.actor_user_id,
      base_revision: input.base_revision,
      now: input.now,
      audit_id: input.audit_id,
      correlation_id: input.correlation_id,
      desired: [],
      audit_summary: {
        action: "ROLE_DEFINITION_POLICY_UPDATE",
        entity_type: "role_definition",
        entity_id: input.role_definition_id,
        reason: `ROLE_POLICY_CONFLICT:current=${currentRevision}`,
        new_value_json: JSON.stringify(requestedChanges),
      },
    });
    if (conflict.outcome === "CONFLICT") {
      const storedError = parseStoredPermissionError(conflict.result_json);
      throw new RoleRevisionConflictError(
        conflict.resulting_revision,
        conflict.idempotent,
        true,
        storedError?.requestId ?? input.correlation_id
      );
    }
    const stored = parseStoredResponse(conflict.result_json);
    return {
      ...(stored?.data ?? detail),
      idempotent: conflict.idempotent,
      responseRequestId: stored?.requestId,
    };
  }

  const grants = await readRoleGrants(db, input.role_definition_id);
  const effectiveCurrent = new Map<string, boolean>();
  for (const metadata of CAPABILITY_CATALOG) {
    effectiveCurrent.set(metadata.capability, grants.has(metadata.capability));
  }
  const actualChanges = requestedChanges.filter(
    (change) => effectiveCurrent.get(change.capability) !== change.value
  );
  const resultRevision =
    actualChanges.length === 0 ? detail.revision : input.base_revision + 1;
  const projectedDetail = projectTerminalDetail(
    detail,
    actualChanges,
    resultRevision
  );
  const allGranted =
    actualChanges.length > 0 && actualChanges.every((change) => change.value);
  const allRevoked =
    actualChanges.length > 0 && actualChanges.every((change) => !change.value);
  const auditSummary = {
    action: allGranted
      ? "ROLE_DEFINITION_GRANT"
      : allRevoked
        ? "ROLE_DEFINITION_REVOKE"
        : "ROLE_DEFINITION_POLICY_UPDATE",
    entity_type: "role_definition",
    entity_id: input.role_definition_id,
    reason: `base=${input.base_revision};new=${input.base_revision + 1};idem=${input.idempotency_key}`,
    old_value_json: JSON.stringify(
      actualChanges.map((change) => ({
        capability: change.capability,
        value: effectiveCurrent.get(change.capability) === true,
      }))
    ),
    new_value_json: JSON.stringify(actualChanges),
  };
  const resultJson = JSON.stringify({
    requestId: input.correlation_id,
    data: projectedDetail,
  });

  const result =
    actualChanges.length === 0
      ? await reserveRoleMutationNoop(db, {
          idempotency_key: input.idempotency_key,
          request_fingerprint: fingerprint,
          actor_user_id: input.actor_user_id,
          base_revision: input.base_revision,
          now: input.now,
          audit_id: input.audit_id,
          correlation_id: input.correlation_id,
          desired: [],
          result_json: resultJson,
          audit_summary: auditSummary,
        })
      : await applyRoleMutation(db, {
          idempotency_key: input.idempotency_key,
          request_fingerprint: fingerprint,
          actor_user_id: input.actor_user_id,
          base_revision: input.base_revision,
          now: input.now,
          audit_id: input.audit_id,
          correlation_id: input.correlation_id,
          desired: actualChanges.map((change) => ({
            kind: change.value
              ? ("add_grant" as const)
              : ("remove_grant" as const),
            role_definition_id: input.role_definition_id,
            capability: change.capability,
          })),
          result_json: resultJson,
          audit_summary: auditSummary,
        });
  if (result.outcome === "CONFLICT") {
    const storedError = parseStoredPermissionError(result.result_json);
    throw new RoleRevisionConflictError(
      result.resulting_revision,
      result.idempotent,
      true,
      storedError?.requestId ?? input.correlation_id
    );
  }
  const stored = parseStoredResponse(result.result_json);
  let resultDetail = stored?.data;
  if (!resultDetail && result.idempotent) {
    // Explicit pre-0023 fallback for terminal rows without result_json.
    resultDetail = await loadRoleDefinitionDetail(
      db,
      input.actor_user_id,
      input.role_definition_id
    );
  }
  return {
    ...(resultDetail ?? projectedDetail),
    idempotent: result.idempotent,
    responseRequestId: stored?.requestId ?? input.correlation_id,
  };
}

export const __test = {
  roleKind,
  withinActorScope,
  scopeLabel,
  lockReasonFor,
};
