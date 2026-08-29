import {
  CAPABILITY_CATALOG,
  capabilityMetadata,
  isCapability,
} from "./capability-catalog";
import {
  applyRoleMutation,
  reserveRoleMutationConflict,
  reserveRoleMutationDenial,
  readCurrentRevision,
  RoleIdempotencyConflictError,
  RoleRevisionConflictError,
} from "./mutations";
import {
  loadActorRoles,
  resolveActorCapabilities,
  RoleAdminProtectedError,
  RoleArchivedError,
  RoleBaselineProtectedError,
  RoleCapabilityDeniedError,
  RoleHighestProtectedError,
  RoleInvalidTargetError,
  RoleScopeMismatchError,
  RoleTargetNotFoundError,
} from "./role-hierarchy";
import { PROTECTED_STABLE_KEYS, ROLE_CATEGORY_KEY } from "./types";
import type { Capability, RoleScopeKind } from "./types";

/* oxlint-disable eslint/complexity, eslint/no-await-in-loop, eslint/no-unused-vars, unicorn/no-lonely-if -- Account Access is the single authority seam; the ordered guards intentionally mirror the named failure taxonomy. */

export interface AccountAccessAccount {
  userId: string;
  name: string;
  username: string;
  status: string;
}

export interface AccountAccessIdentity {
  assignmentId: string;
  roleDefinitionId: string;
  label: string;
  scopeKind: RoleScopeKind;
  scopeId: string | null;
  scopeLabel: string | null;
  position: number;
  state: "ACTIVE" | "REVOKED";
  grantedAt: string;
  revokedAt?: string | null;
  revokedBy?: string | null;
  revokeReason?: string | null;
}

export interface EffectiveAccessGrant {
  capability: Capability;
  label: string;
  description: string;
  group: string;
  risk: "normal" | "high";
  scopeRequired: boolean;
  scopeKind: RoleScopeKind;
  scopeId: string | null;
  scopeLabel: string | null;
  sources: string[];
  sourceRoleDefinitionIds: string[];
}

export interface EffectiveAccessGroups {
  Global: EffectiveAccessGrant[];
  Department: EffectiveAccessGrant[];
  Program: EffectiveAccessGrant[];
}

export interface AccountAccessActions {
  assign: boolean;
  revoke: boolean;
  archive: boolean;
  restore: boolean;
  /** Exact role IDs the server authorized for each operation. */
  revokeRoleDefinitionIds: string[];
  archiveRoleDefinitionIds: string[];
  restoreRoleDefinitionIds: string[];
}

export interface AccountAccessAssignableRole {
  roleDefinitionId: string;
  label: string;
  scopeKind: RoleScopeKind;
  scopeId: string | null;
  scopeLabel: string | null;
  position: number;
}

export interface AccountAccessLifecycleImpact {
  roleDefinitionId: string;
  label: string;
  action: "archive" | "restore";
  lost: EffectiveAccessGroups;
  retained: EffectiveAccessGroups;
}

export interface AccountAccessView {
  account: AccountAccessAccount;
  activeAssignments: AccountAccessIdentity[];
  revokedAssignments: AccountAccessIdentity[];
  /** Alias retained in the projection so callers can name the audit/history tab. */
  assignmentHistory: AccountAccessIdentity[];
  /** Server-authorized lower identities available for assignment. */
  assignableRoles: AccountAccessAssignableRole[];
  effectiveAccess: EffectiveAccessGroups;
  /** Per-role impact computed from normalized grants and assignments. */
  lifecycleImpacts: Record<string, AccountAccessLifecycleImpact>;
  revision: number;
  actions: AccountAccessActions;
}

export interface AccountAccessImpact {
  lost: EffectiveAccessGroups;
  retained: EffectiveAccessGroups;
}

export interface AccountAccessMutationResult extends AccountAccessView {
  idempotent: boolean;
  duplicateRoleDefinitionIds: string[];
  impact?: AccountAccessImpact;
}

export interface AccountAccessMutationInput {
  actor_user_id: string;
  account_user_id: string;
  base_revision: number;
  role_definition_ids: readonly string[];
  idempotency_key: string;
  now: string;
  audit_id: string;
  correlation_id: string;
}

export interface RoleDefinitionLifecycleInput {
  actor_user_id: string;
  role_definition_id: string;
  action: "archive" | "restore";
  base_revision: number;
  reason?: string | null;
  idempotency_key: string;
  now: string;
  audit_id: string;
  correlation_id: string;
}

export interface RoleDefinitionLifecycleResult {
  roleDefinitionId: string;
  action: "archive" | "restore";
  isArchived: boolean;
  revision: number;
  affectedAccountUserIds: string[];
  impact: ReadonlyArray<{
    accountUserId: string;
    lost: EffectiveAccessGroups;
    retained: EffectiveAccessGroups;
  }>;
  idempotent: boolean;
}

export type RoleDefinitionLifecyclePreview = Omit<
  RoleDefinitionLifecycleResult,
  "idempotent"
>;

interface AccountRecord {
  user_id: string;
  name: string;
  username: string;
  account_status: string;
}

interface RoleRecord {
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

interface AssignmentRecord {
  assignment_id: string;
  account_user_id: string;
  role_definition_id: string;
  scope_kind: RoleScopeKind;
  scope_id: string | null;
  granted_by: string;
  granted_at: string;
  revoked_by: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
}

interface GrantRecord {
  role_definition_id: string;
  capability: string;
}

interface ScopeNames {
  departments: Map<string, string>;
  programs: Map<string, string>;
}

interface StagedAdd {
  assignmentId: string;
  role: RoleRecord;
  grantedAt: string;
}

interface StagedRevoke {
  assignment: AssignmentRecord;
  role: RoleRecord;
  revokedAt: string;
  revokedBy: string;
  reason: string | null;
}

interface ProjectionOptions {
  stagedAdds?: readonly StagedAdd[];
  stagedRevokes?: readonly StagedRevoke[];
  revision?: number;
  includeLifecycleImpacts?: boolean;
  /** Capability the projection must resolve for each managed assignment (defaults to assign-or-revoke). */
  manageCapability?: "role.assign" | "role.revoke" | "role.delete";
}

interface StoredMutation {
  actor_user_id: string;
  request_fingerprint: string;
  outcome: "PENDING" | "SUCCESS" | "CONFLICT" | "DENIED";
  resulting_revision: number | null;
  result_json: string | null;
}

export class AccountTargetIneligibleError extends Error {
  readonly code = "ROLE_TARGET_INELIGIBLE";
  constructor() {
    super(
      "ROLE_TARGET_INELIGIBLE: account must be an Active non-Admin account"
    );
    this.name = "AccountTargetIneligibleError";
  }
}

export class AccountAdminProtectedError extends Error {
  readonly code = "ROLE_ADMIN_PROTECTED";
  constructor() {
    super("ROLE_ADMIN_PROTECTED: Admin accounts cannot hold lower assignments");
    this.name = "AccountAdminProtectedError";
  }
}

export class AccountSelfProtectedError extends Error {
  readonly code = "ROLE_HIGHEST_PROTECTED";
  constructor() {
    super("ROLE_HIGHEST_PROTECTED: an actor cannot change its own assignments");
    this.name = "AccountSelfProtectedError";
  }
}

export class AccountRevokeTargetError extends Error {
  readonly code = "ROLE_INVALID_TARGET";
  constructor() {
    super("ROLE_INVALID_TARGET: at least one assignment is required to revoke");
    this.name = "AccountRevokeTargetError";
  }
}

function asAccount(record: AccountRecord): AccountAccessAccount {
  return {
    userId: record.user_id,
    name: record.name,
    username: record.username,
    status: record.account_status,
  };
}

function scopeForRole(
  role: Pick<RoleRecord, "scope_kind" | "scope_id">
): { departmentId?: string; programId?: string } | null {
  if (role.scope_kind === ROLE_CATEGORY_KEY.DEPARTMENT && role.scope_id) {
    return { departmentId: role.scope_id };
  }
  if (role.scope_kind === ROLE_CATEGORY_KEY.PROGRAM && role.scope_id) {
    return { programId: role.scope_id };
  }
  return null;
}

function scopeLabel(role: RoleRecord, names: ScopeNames): string | null {
  if (role.scope_kind === ROLE_CATEGORY_KEY.DEPARTMENT && role.scope_id) {
    return names.departments.get(role.scope_id) ?? "部門";
  }
  if (role.scope_kind === ROLE_CATEGORY_KEY.PROGRAM && role.scope_id) {
    return names.programs.get(role.scope_id) ?? "課程";
  }
  return null;
}

function roleIdentity(
  assignment: AssignmentRecord,
  role: RoleRecord,
  names: ScopeNames
): AccountAccessIdentity {
  const snapshot = {
    scope_kind: assignment.scope_kind,
    scope_id: assignment.scope_id,
  };
  const scope =
    assignment.revoked_at === null
      ? { scope_kind: role.scope_kind, scope_id: role.scope_id }
      : snapshot;
  return {
    assignmentId: assignment.assignment_id,
    roleDefinitionId: role.role_definition_id,
    label: role.label,
    scopeKind: scope.scope_kind,
    scopeId: scope.scope_id,
    scopeLabel: scopeLabel(
      {
        ...role,
        ...scope,
      },
      names
    ),
    position: role.position,
    state: assignment.revoked_at === null ? "ACTIVE" : "REVOKED",
    grantedAt: assignment.granted_at,
    revokedAt: assignment.revoked_at,
    revokedBy: assignment.revoked_by,
    revokeReason: assignment.revoke_reason,
  };
}

function emptyGroups(): EffectiveAccessGroups {
  return { Global: [], Department: [], Program: [] };
}

function groupKey(
  scopeKind: RoleScopeKind,
  scopeId: string | null,
  capability: string
): string {
  return `${scopeKind}|${scopeId ?? ""}|${capability}`;
}

function addGrant(
  groups: EffectiveAccessGroups,
  role: RoleRecord,
  capability: string,
  sourceRoleDefinitionId: string,
  sourceLabel: string,
  names: ScopeNames
): void {
  const metadata = capabilityMetadata(capability);
  if (!metadata || !isCapability(capability)) {
    return;
  }
  const bucket = groups[role.scope_kind];
  const key = groupKey(role.scope_kind, role.scope_id, capability);
  const current = bucket.find(
    (grant) =>
      groupKey(grant.scopeKind, grant.scopeId, grant.capability) === key
  );
  if (current) {
    if (!current.sources.includes(sourceLabel)) {
      current.sources.push(sourceLabel);
    }
    if (!current.sourceRoleDefinitionIds.includes(sourceRoleDefinitionId)) {
      current.sourceRoleDefinitionIds.push(sourceRoleDefinitionId);
    }
    return;
  }
  bucket.push({
    capability,
    label: metadata.label,
    description: metadata.description,
    group: metadata.group,
    risk: metadata.risk,
    scopeRequired: metadata.scopeRequired,
    scopeKind: role.scope_kind,
    scopeId: role.scope_id,
    scopeLabel: scopeLabel(role, names),
    sources: [sourceLabel],
    sourceRoleDefinitionIds: [sourceRoleDefinitionId],
  });
}

function resolveEffectiveAccess(
  activeAssignments: readonly AssignmentRecord[],
  rolesById: ReadonlyMap<string, RoleRecord>,
  grants: readonly GrantRecord[],
  names: ScopeNames
): EffectiveAccessGroups {
  const groups = emptyGroups();
  const grantsByRole = new Map<string, string[]>();
  for (const grant of grants) {
    const list = grantsByRole.get(grant.role_definition_id) ?? [];
    list.push(grant.capability);
    grantsByRole.set(grant.role_definition_id, list);
  }

  // `會友基礎` is automatic for every Active Account, even when a fixture has
  // no baseline assignment row. Its scope is Global because program.enroll is
  // an unscoped capability in the closed catalog.
  const baseline = rolesById.get("__member_baseline__");
  if (baseline) {
    addGrant(
      groups,
      baseline,
      "program.enroll",
      baseline.role_definition_id,
      baseline.label,
      names
    );
  }

  for (const assignment of activeAssignments) {
    const role = rolesById.get(assignment.role_definition_id);
    if (!role || role.is_archived === 1) {
      continue;
    }
    const capabilities =
      role.stable_key === PROTECTED_STABLE_KEYS.ADMIN
        ? CAPABILITY_CATALOG.map((entry) => entry.capability)
        : (grantsByRole.get(role.role_definition_id) ?? []);
    for (const capability of capabilities) {
      addGrant(
        groups,
        role,
        capability,
        role.role_definition_id,
        role.label,
        names
      );
    }
  }
  return groups;
}

function differenceGroups(
  before: EffectiveAccessGroups,
  after: EffectiveAccessGroups
): EffectiveAccessGroups {
  const result = emptyGroups();
  for (const scope of ["Global", "Department", "Program"] as const) {
    const afterKeys = new Set(
      after[scope].map((grant) =>
        groupKey(grant.scopeKind, grant.scopeId, grant.capability)
      )
    );
    result[scope] = before[scope]
      .filter(
        (grant) =>
          !afterKeys.has(
            groupKey(grant.scopeKind, grant.scopeId, grant.capability)
          )
      )
      .map((grant) => ({
        ...grant,
        sources: [...grant.sources],
        sourceRoleDefinitionIds: [...grant.sourceRoleDefinitionIds],
      }));
  }
  return result;
}

function intersectGroups(
  before: EffectiveAccessGroups,
  after: EffectiveAccessGroups
): EffectiveAccessGroups {
  const result = emptyGroups();
  for (const scope of ["Global", "Department", "Program"] as const) {
    const beforeKeys = new Set(
      before[scope].map((grant) =>
        groupKey(grant.scopeKind, grant.scopeId, grant.capability)
      )
    );
    result[scope] = after[scope]
      .filter((grant) =>
        beforeKeys.has(
          groupKey(grant.scopeKind, grant.scopeId, grant.capability)
        )
      )
      .map((grant) => ({
        ...grant,
        sources: [...grant.sources],
        sourceRoleDefinitionIds: [...grant.sourceRoleDefinitionIds],
      }));
  }
  return result;
}

async function readAccount(
  db: D1Database,
  userId: string
): Promise<AccountRecord | null> {
  return (
    (await db
      .prepare(
        `SELECT user_id, name, username, account_status
           FROM accounts WHERE user_id = ?`
      )
      .bind(userId)
      .first<AccountRecord>()) ?? null
  );
}

async function readRole(
  db: D1Database,
  roleDefinitionId: string
): Promise<RoleRecord | null> {
  return (
    (await db
      .prepare(
        `SELECT role_definition_id, stable_key, label, description,
                category_key, scope_kind, scope_id, position,
                is_protected, is_archived
           FROM role_definitions WHERE role_definition_id = ?`
      )
      .bind(roleDefinitionId)
      .first<RoleRecord>()) ?? null
  );
}
async function readRoleByStableKey(
  db: D1Database,
  stableKey: string
): Promise<RoleRecord | null> {
  return (
    (await db
      .prepare(
        `SELECT role_definition_id, stable_key, label, description,
                category_key, scope_kind, scope_id, position,
                is_protected, is_archived
           FROM role_definitions WHERE stable_key = ?`
      )
      .bind(stableKey)
      .first<RoleRecord>()) ?? null
  );
}

async function readRoles(
  db: D1Database,
  roleDefinitionIds: readonly string[]
): Promise<RoleRecord[]> {
  if (roleDefinitionIds.length === 0) {
    return [];
  }
  const placeholders = roleDefinitionIds.map(() => "?").join(",");
  const rows = await db
    .prepare(
      `SELECT role_definition_id, stable_key, label, description,
              category_key, scope_kind, scope_id, position,
              is_protected, is_archived
         FROM role_definitions
        WHERE role_definition_id IN (${placeholders})`
    )
    .bind(...roleDefinitionIds)
    .all<RoleRecord>();
  return rows.results ?? [];
}

async function readAllRoles(db: D1Database): Promise<RoleRecord[]> {
  const rows = await db
    .prepare(
      `SELECT role_definition_id, stable_key, label, description,
              category_key, scope_kind, scope_id, position,
              is_protected, is_archived
         FROM role_definitions`
    )
    .all<RoleRecord>();
  return rows.results ?? [];
}

async function readAssignments(
  db: D1Database,
  accountUserId: string,
  revoked: boolean
): Promise<AssignmentRecord[]> {
  const rows = await db
    .prepare(
      `SELECT assignment_id, account_user_id, role_definition_id,
              scope_kind, scope_id, granted_by, granted_at,
              revoked_by, revoked_at, revoke_reason
         FROM role_assignments
        WHERE account_user_id = ? AND revoked_at IS ${revoked ? "NOT NULL" : "NULL"}
        ORDER BY ${revoked ? "revoked_at DESC, granted_at DESC" : "granted_at ASC"}, assignment_id ASC`
    )
    .bind(accountUserId)
    .all<AssignmentRecord>();
  return rows.results ?? [];
}

async function readScopeNames(db: D1Database): Promise<ScopeNames> {
  const [departments, programs] = await Promise.all([
    db
      .prepare("SELECT department_id, name FROM departments")
      .all<{ department_id: string; name: string }>(),
    db
      .prepare("SELECT program_id, name FROM programs")
      .all<{ program_id: string; name: string }>(),
  ]);
  return {
    departments: new Map(
      (departments.results ?? []).map((row) => [row.department_id, row.name])
    ),
    programs: new Map(
      (programs.results ?? []).map((row) => [row.program_id, row.name])
    ),
  };
}

async function readGrants(
  db: D1Database,
  roleDefinitionIds: readonly string[]
): Promise<GrantRecord[]> {
  if (roleDefinitionIds.length === 0) {
    return [];
  }
  const placeholders = roleDefinitionIds.map(() => "?").join(",");
  const rows = await db
    .prepare(
      `SELECT role_definition_id, capability
         FROM role_definition_grants
        WHERE role_definition_id IN (${placeholders})`
    )
    .bind(...roleDefinitionIds)
    .all<GrantRecord>();
  return rows.results ?? [];
}

function adminRole(role: RoleRecord): boolean {
  return role.stable_key === PROTECTED_STABLE_KEYS.ADMIN;
}

function baselineRole(role: RoleRecord): boolean {
  return role.stable_key === PROTECTED_STABLE_KEYS.MEMBER;
}

type ActorScope = Pick<
  RoleRecord,
  "scope_kind" | "scope_id" | "position" | "stable_key"
>;

function withinActorScope(
  actorRoles: readonly ActorScope[],
  role: Pick<RoleRecord, "scope_kind" | "scope_id">
): boolean {
  const highest = actorRoles[0];
  if (!highest) {
    return false;
  }
  if (highest.scope_kind === ROLE_CATEGORY_KEY.GLOBAL) {
    return true;
  }
  return (
    highest.scope_kind === role.scope_kind &&
    highest.scope_id !== null &&
    highest.scope_id === role.scope_id
  );
}
async function filterAuthorizedAssignments(
  db: D1Database,
  actorUserId: string,
  actorRoles: readonly ActorScope[],
  assignments: readonly AssignmentRecord[],
  rolesById: ReadonlyMap<string, RoleRecord>,
  manageCapability?: "role.assign" | "role.revoke" | "role.delete"
): Promise<AssignmentRecord[]> {
  const visible = await Promise.all(
    assignments.map(async (assignment) => {
      const role = rolesById.get(assignment.role_definition_id);
      if (!role) {
        return null;
      }
      if (baselineRole(role)) {
        return assignment;
      }
      const scopedRole =
        assignment.revoked_at === null
          ? role
          : {
              ...role,
              scope_kind: assignment.scope_kind,
              scope_id: assignment.scope_id,
            };
      if (!withinActorScope(actorRoles, scopedRole)) {
        return null;
      }
      const highest = actorRoles[0];
      if (
        !highest ||
        highest.stable_key === PROTECTED_STABLE_KEYS.MEMBER ||
        scopedRole.position <= highest.position
      ) {
        return null;
      }
      const capabilities = await resolveActorCapabilities(
        db,
        actorUserId,
        scopeForRole(scopedRole)
      );
      if (manageCapability) {
        return capabilities[manageCapability] === true ? assignment : null;
      }
      return capabilities["role.assign"] === true ||
        capabilities["role.revoke"] === true
        ? assignment
        : null;
    })
  );
  return visible.filter(
    (assignment): assignment is AssignmentRecord => assignment !== null
  );
}

async function assertActiveActor(
  db: D1Database,
  actorUserId: string
): Promise<Awaited<ReturnType<typeof loadActorRoles>>> {
  const actor = await readAccount(db, actorUserId);
  if (!actor || actor.account_status !== "Active") {
    throw new RoleCapabilityDeniedError();
  }
  return loadActorRoles(db, actorUserId);
}

async function assertOperationCapability(
  db: D1Database,
  actorUserId: string,
  capability: "role.assign" | "role.revoke" | "role.delete"
): Promise<Awaited<ReturnType<typeof loadActorRoles>>> {
  const actorRoles = await assertActiveActor(db, actorUserId);
  const capabilities = await resolveActorCapabilities(db, actorUserId);
  if (capabilities[capability] !== true) {
    throw new RoleCapabilityDeniedError();
  }
  return actorRoles;
}

async function assertAccountAccessCapability(
  db: D1Database,
  actorUserId: string
): Promise<Awaited<ReturnType<typeof loadActorRoles>>> {
  const actorRoles = await assertActiveActor(db, actorUserId);
  const capabilities = await resolveActorCapabilities(db, actorUserId);
  if (
    capabilities["role.assign"] !== true &&
    capabilities["role.revoke"] !== true
  ) {
    throw new RoleCapabilityDeniedError();
  }
  return actorRoles;
}

async function assertEligibleAccount(
  db: D1Database,
  actorUserId: string,
  accountUserId: string,
  actorRoles?: Awaited<ReturnType<typeof loadActorRoles>>
): Promise<{
  actorRoles: Awaited<ReturnType<typeof loadActorRoles>>;
  account: AccountRecord;
}> {
  if (!accountUserId) {
    throw new AccountTargetIneligibleError();
  }
  const resolvedActorRoles =
    actorRoles ?? (await assertActiveActor(db, actorUserId));
  const account = await readAccount(db, accountUserId);
  if (!account || account.account_status !== "Active") {
    throw new AccountTargetIneligibleError();
  }
  return { actorRoles: resolvedActorRoles, account };
}

async function assertNonAdminTarget(
  db: D1Database,
  accountUserId: string
): Promise<void> {
  const hasAdminAssignment = await db
    .prepare(
      `SELECT 1
         FROM role_assignments ra
         JOIN role_definitions rd ON rd.role_definition_id = ra.role_definition_id
        WHERE ra.account_user_id = ?
          AND ra.revoked_at IS NULL
          AND rd.stable_key = ?
        LIMIT 1`
    )
    .bind(accountUserId, PROTECTED_STABLE_KEYS.ADMIN)
    .first<{ one: number }>();
  if (hasAdminAssignment) {
    throw new AccountAdminProtectedError();
  }
}

function assertSelfTarget(
  actorUserId: string,
  accountUserId: string,
  actorRoles: Awaited<ReturnType<typeof loadActorRoles>>,
  role: RoleRecord
): void {
  if (actorUserId !== accountUserId) {
    return;
  }
  if (adminRole(role)) {
    throw new RoleAdminProtectedError();
  }
  const highest = actorRoles[0];
  if (highest && role.position <= highest.position) {
    throw new RoleHighestProtectedError();
  }
  throw new RoleCapabilityDeniedError();
}

async function assertRoleManageable(
  db: D1Database,
  actorUserId: string,
  actorRoles: Awaited<ReturnType<typeof loadActorRoles>>,
  role: RoleRecord,
  capability: "role.assign" | "role.revoke" | "role.delete",
  allowArchived = false
): Promise<void> {
  if (adminRole(role)) {
    throw new RoleAdminProtectedError();
  }
  if (baselineRole(role)) {
    throw new RoleBaselineProtectedError();
  }
  if (role.is_archived === 1 && !allowArchived) {
    throw new RoleArchivedError();
  }
  const highest = actorRoles[0];
  if (!highest) {
    throw new RoleCapabilityDeniedError();
  }
  if (highest.stable_key === PROTECTED_STABLE_KEYS.MEMBER) {
    throw new RoleCapabilityDeniedError();
  }
  if (role.position <= highest.position) {
    throw new RoleHighestProtectedError();
  }
  if (!withinActorScope(actorRoles, role)) {
    throw new RoleScopeMismatchError();
  }
  const capabilities = await resolveActorCapabilities(
    db,
    actorUserId,
    scopeForRole(role)
  );
  if (capabilities[capability] !== true) {
    throw new RoleCapabilityDeniedError();
  }
}

async function lifecycleImpactsForProjection(
  db: D1Database,
  actorUserId: string,
  accountUserId: string,
  base: AccountAccessView,
  activeAssignments: readonly AssignmentRecord[],
  history: readonly AssignmentRecord[],
  rolesById: ReadonlyMap<string, RoleRecord>,
  revision: number
): Promise<Record<string, AccountAccessLifecycleImpact>> {
  const impacts: Record<string, AccountAccessLifecycleImpact> = {};
  const now = new Date().toISOString();
  const archivedRoleIds = new Set<string>();
  for (const assignment of activeAssignments) {
    const role = rolesById.get(assignment.role_definition_id);
    if (
      !role ||
      role.is_protected === 1 ||
      role.is_archived === 1 ||
      archivedRoleIds.has(role.role_definition_id)
    ) {
      continue;
    }
    const after = await readProjection(db, actorUserId, accountUserId, {
      stagedRevokes: [
        {
          assignment,
          role,
          revokedAt: now,
          revokedBy: actorUserId,
          reason: "role_archived",
        },
      ],
      revision,
      includeLifecycleImpacts: false,
    });
    impacts[role.role_definition_id] = {
      roleDefinitionId: role.role_definition_id,
      label: role.label,
      action: "archive",
      lost: differenceGroups(base.effectiveAccess, after.effectiveAccess),
      retained: intersectGroups(base.effectiveAccess, after.effectiveAccess),
    };
    archivedRoleIds.add(role.role_definition_id);
  }
  for (const assignment of history) {
    const role = rolesById.get(assignment.role_definition_id);
    if (
      !role ||
      role.is_protected === 1 ||
      role.is_archived !== 1 ||
      archivedRoleIds.has(role.role_definition_id)
    ) {
      continue;
    }
    const after = await readProjection(db, actorUserId, accountUserId, {
      revision,
      includeLifecycleImpacts: false,
    });
    impacts[role.role_definition_id] = {
      roleDefinitionId: role.role_definition_id,
      label: role.label,
      action: "restore",
      lost: differenceGroups(base.effectiveAccess, after.effectiveAccess),
      retained: intersectGroups(base.effectiveAccess, after.effectiveAccess),
    };
    archivedRoleIds.add(role.role_definition_id);
  }
  return impacts;
}

async function readProjection(
  db: D1Database,
  actorUserId: string,
  accountUserId: string,
  options: ProjectionOptions = {}
): Promise<AccountAccessView> {
  const account = await readAccount(db, accountUserId);
  if (!account) {
    throw new AccountTargetIneligibleError();
  }
  const [activeRows, revokedRows, names, revision] = await Promise.all([
    readAssignments(db, accountUserId, false),
    readAssignments(db, accountUserId, true),
    readScopeNames(db),
    readCurrentRevision(db),
  ]);
  const stagedAdds = [...(options.stagedAdds ?? [])];
  const stagedRevokes = [...(options.stagedRevokes ?? [])];
  const roleIds = [
    ...new Set([
      ...activeRows.map((assignment) => assignment.role_definition_id),
      ...revokedRows.map((assignment) => assignment.role_definition_id),
      ...stagedAdds.map((staged) => staged.role.role_definition_id),
    ]),
  ];
  const [roles, grants, baselineFromDb, allRoles] = await Promise.all([
    readRoles(db, roleIds),
    readGrants(db, roleIds),
    readRoleByStableKey(db, PROTECTED_STABLE_KEYS.MEMBER),
    readAllRoles(db),
  ]);
  const rolesById = new Map(
    roles.map((role) => [role.role_definition_id, role])
  );
  const baseline =
    roles.find((role) => role.stable_key === PROTECTED_STABLE_KEYS.MEMBER) ??
    baselineFromDb;
  if (baseline) {
    rolesById.set("__member_baseline__", baseline);
  }
  const actorRoles = await loadActorRoles(db, actorUserId);
  const [visibleActiveRows, visibleRevokedRows] = await Promise.all([
    filterAuthorizedAssignments(
      db,
      actorUserId,
      actorRoles,
      activeRows,
      rolesById,
      options.manageCapability
    ),
    filterAuthorizedAssignments(
      db,
      actorUserId,
      actorRoles,
      revokedRows,
      rolesById,
      options.manageCapability
    ),
  ]);
  const active = visibleActiveRows.filter(
    (assignment) =>
      !stagedRevokes.some(
        (revoked) =>
          revoked.assignment.assignment_id === assignment.assignment_id
      )
  );
  for (const staged of stagedAdds) {
    active.push({
      assignment_id: staged.assignmentId,
      account_user_id: accountUserId,
      role_definition_id: staged.role.role_definition_id,
      scope_kind: staged.role.scope_kind,
      scope_id: staged.role.scope_id,
      granted_by: actorUserId,
      granted_at: staged.grantedAt,
      revoked_by: null,
      revoked_at: null,
      revoke_reason: null,
    });
  }
  const history = [...visibleRevokedRows];
  for (const staged of stagedRevokes) {
    history.unshift({
      ...staged.assignment,
      revoked_by: staged.revokedBy,
      revoked_at: staged.revokedAt,
      revoke_reason: staged.reason,
    });
  }
  const actorCapabilities = await resolveActorCapabilities(db, actorUserId);
  const canAssign = actorCapabilities["role.assign"] === true;
  const activeRoleIds = new Set(
    active.map((assignment) => assignment.role_definition_id)
  );
  const assignableRoles = canAssign
    ? (
        await Promise.all(
          allRoles
            .filter(
              (role) =>
                role.is_protected === 0 &&
                role.is_archived === 0 &&
                !activeRoleIds.has(role.role_definition_id)
            )
            .map(async (role) => {
              try {
                await assertRoleManageable(
                  db,
                  actorUserId,
                  actorRoles,
                  role,
                  "role.assign"
                );
                return {
                  roleDefinitionId: role.role_definition_id,
                  label: role.label,
                  scopeKind: role.scope_kind,
                  scopeId: role.scope_id,
                  scopeLabel: scopeLabel(role, names),
                  position: role.position,
                } satisfies AccountAccessAssignableRole;
              } catch {
                return null;
              }
            })
        )
      ).filter((role): role is AccountAccessAssignableRole => role !== null)
    : [];
  const authorizedRoleIds = async (
    assignments: readonly AssignmentRecord[],
    capability: "role.revoke" | "role.delete",
    allowArchived = false
  ): Promise<string[]> => {
    const ids = await Promise.all(
      assignments.map(async (assignment) => {
        const role = rolesById.get(assignment.role_definition_id);
        if (!role) {
          return null;
        }
        try {
          await assertRoleManageable(
            db,
            actorUserId,
            actorRoles,
            role,
            capability,
            allowArchived
          );
          return role.role_definition_id;
        } catch {
          return null;
        }
      })
    );
    return [...new Set(ids.filter((id): id is string => id !== null))];
  };
  const [
    revokeRoleDefinitionIds,
    archiveRoleDefinitionIds,
    restoreRoleDefinitionIds,
  ] = await Promise.all([
    authorizedRoleIds(active, "role.revoke"),
    authorizedRoleIds(active, "role.delete"),
    authorizedRoleIds(
      history.filter(
        (assignment) =>
          rolesById.get(assignment.role_definition_id)?.is_archived === 1
      ),
      "role.delete",
      true
    ),
  ]);
  const actions: AccountAccessActions = {
    assign: canAssign,
    revoke: revokeRoleDefinitionIds.length > 0,
    archive: archiveRoleDefinitionIds.length > 0,
    restore: restoreRoleDefinitionIds.length > 0,
    revokeRoleDefinitionIds,
    archiveRoleDefinitionIds,
    restoreRoleDefinitionIds,
  };
  const projectionRevision = options.revision ?? revision;
  const projection: AccountAccessView = {
    account: asAccount(account),
    activeAssignments: active
      .map((assignment) => {
        const role = rolesById.get(assignment.role_definition_id);
        return role ? roleIdentity(assignment, role, names) : null;
      })
      .filter(
        (identity): identity is AccountAccessIdentity => identity !== null
      )
      .sort((a, b) => a.position - b.position),
    revokedAssignments: history
      .map((assignment) => {
        const role = rolesById.get(assignment.role_definition_id);
        return role ? roleIdentity(assignment, role, names) : null;
      })
      .filter(
        (identity): identity is AccountAccessIdentity => identity !== null
      ),
    assignmentHistory: history
      .map((assignment) => {
        const role = rolesById.get(assignment.role_definition_id);
        return role ? roleIdentity(assignment, role, names) : null;
      })
      .filter(
        (identity): identity is AccountAccessIdentity => identity !== null
      ),
    assignableRoles,
    effectiveAccess: resolveEffectiveAccess(active, rolesById, grants, names),
    lifecycleImpacts: {},
    revision: projectionRevision,
    actions,
  };
  if (options.includeLifecycleImpacts !== false) {
    projection.lifecycleImpacts = await lifecycleImpactsForProjection(
      db,
      actorUserId,
      accountUserId,
      projection,
      active,
      history,
      rolesById,
      projectionRevision
    );
  }
  return projection;
}

async function assertAccountAccessRead(
  db: D1Database,
  actorUserId: string,
  accountUserId: string
): Promise<{
  actorRoles: Awaited<ReturnType<typeof loadActorRoles>>;
  account: AccountRecord;
}> {
  // Authorization is deliberately resolved before any target account lookup.
  const actorRoles = await assertAccountAccessCapability(db, actorUserId);
  const eligibility = await assertEligibleAccount(
    db,
    actorUserId,
    accountUserId,
    actorRoles
  );
  if (actorUserId === accountUserId) {
    throw new AccountSelfProtectedError();
  }
  await assertNonAdminTarget(db, accountUserId);
  // Target eligibility is independent of which assignment scopes are visible.
  // `readProjection` applies the actor's exact scope to assignments, history,
  // effective grants, and lifecycle affordances without disclosing other scopes.
  return eligibility;
}

function canonicalAssignmentFingerprint(
  input: AccountAccessMutationInput
): string {
  const ids = [...new Set(input.role_definition_ids)].sort().join(",");
  return `assignment|grant|${input.actor_user_id}|${input.account_user_id}|${input.base_revision}|${ids}`;
}

function canonicalRevokeFingerprint(input: AccountAccessMutationInput): string {
  const ids = [...new Set(input.role_definition_ids)].sort().join(",");
  return `assignment|revoke|${input.actor_user_id}|${input.account_user_id}|${input.base_revision}|${ids}`;
}

function canonicalLifecycleFingerprint(
  input: RoleDefinitionLifecycleInput
): string {
  return `lifecycle|${input.action}|${input.actor_user_id}|${input.role_definition_id}|${input.base_revision}|${input.reason?.trim() ?? ""}`;
}

async function readMutation(
  db: D1Database,
  idempotencyKey: string
): Promise<StoredMutation | null> {
  return (
    (await db
      .prepare(
        `SELECT actor_user_id, request_fingerprint, outcome,
                resulting_revision, result_json
           FROM role_policy_mutations WHERE idempotency_key = ?`
      )
      .bind(idempotencyKey)
      .first<StoredMutation>()) ?? null
  );
}

function parseEnvelope<T>(resultJson: string | null): T | null {
  if (!resultJson) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(resultJson);
    if (typeof parsed === "object" && parsed !== null && "data" in parsed) {
      return parsed.data as T;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

function errorForCode(code: string): Error {
  if (code === "ROLE_ADMIN_PROTECTED") return new RoleAdminProtectedError();
  if (code === "ROLE_BASELINE_PROTECTED")
    return new RoleBaselineProtectedError();
  if (code === "ROLE_HIGHEST_PROTECTED") return new RoleHighestProtectedError();
  if (code === "ROLE_SCOPE_MISMATCH") return new RoleScopeMismatchError();
  if (code === "ROLE_ARCHIVED") return new RoleArchivedError();
  if (code === "ROLE_NOT_FOUND") return new RoleTargetNotFoundError();
  if (code === "ROLE_TARGET_INELIGIBLE")
    return new AccountTargetIneligibleError();
  if (code === "ROLE_INVALID_TARGET") return new RoleInvalidTargetError();
  if (code === "ROLE_ADMIN_PROTECTED") return new AccountAdminProtectedError();
  return new RoleCapabilityDeniedError();
}

async function replayIfTerminal<T>(
  db: D1Database,
  input: {
    idempotency_key: string;
    actor_user_id: string;
    request_fingerprint: string;
  }
): Promise<{ value: T; idempotent: true } | null> {
  const existing = await readMutation(db, input.idempotency_key);
  if (!existing) {
    return null;
  }
  if (
    existing.actor_user_id !== input.actor_user_id ||
    existing.request_fingerprint !== input.request_fingerprint
  ) {
    throw new RoleIdempotencyConflictError();
  }
  if (existing.outcome === "CONFLICT") {
    throw new RoleRevisionConflictError(
      existing.resulting_revision ?? (await readCurrentRevision(db)),
      true,
      true
    );
  }
  if (existing.outcome === "DENIED") {
    const parsed = parseEnvelope<unknown>(existing.result_json);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "duplicateRoleDefinitionIds" in parsed
    ) {
      return { value: parsed as T, idempotent: true };
    }
    const errorCode =
      typeof parsed === "object" &&
      parsed !== null &&
      "errorCode" in parsed &&
      typeof parsed.errorCode === "string"
        ? parsed.errorCode
        : "ROLE_FORBIDDEN";
    throw errorForCode(errorCode);
  }
  if (existing.outcome === "SUCCESS") {
    const value = parseEnvelope<T>(existing.result_json);
    if (value === null) {
      return null;
    }
    return { value, idempotent: true };
  }
  return null;
}

function auditOutcomeFor(errorCode: string): "DENIED" | "REJECTED" {
  switch (errorCode) {
    case "ROLE_FORBIDDEN":
    case "ROLE_ADMIN_PROTECTED":
    case "ROLE_BASELINE_PROTECTED":
    case "ROLE_HIGHEST_PROTECTED":
    case "ROLE_SCOPE_MISMATCH":
      return "DENIED";
    default:
      return "REJECTED";
  }
}

async function deny(
  db: D1Database,
  input: AccountAccessMutationInput | RoleDefinitionLifecycleInput,
  fingerprint: string,
  error: Error,
  errorCode: string,
  auditAction: string,
  entityType: string,
  entityId: string,
  auditOutcome: "DENIED" | "REJECTED" = "REJECTED"
): Promise<never> {
  await reserveRoleMutationDenial(
    db,
    {
      idempotency_key: input.idempotency_key,
      request_fingerprint: fingerprint,
      actor_user_id: input.actor_user_id,
      base_revision: input.base_revision,
      now: input.now,
      audit_id: input.audit_id,
      correlation_id: input.correlation_id,
      desired: [],
      audit_summary: {
        action: auditAction,
        entity_type: entityType,
        entity_id: entityId,
        reason: errorCode,
      },
    },
    {
      errorCode,
      auditOutcome,
      resultJson: JSON.stringify({
        errorCode,
        requestId: input.correlation_id,
      }),
    }
  );
  throw error;
}

async function duplicateResult(
  db: D1Database,
  input: AccountAccessMutationInput,
  fingerprint: string,
  view: AccountAccessView,
  duplicateRoleDefinitionIds: string[],
  activeRoleDefinitionIds: readonly string[],
  auditAction: "ROLE_ASSIGNMENT_GRANT" | "ROLE_ASSIGNMENT_REVOKE"
): Promise<AccountAccessMutationResult> {
  const resultJson = JSON.stringify({
    requestId: input.correlation_id,
    data: { ...view, idempotent: false, duplicateRoleDefinitionIds },
  });
  const result = await reserveRoleMutationDenial(
    db,
    {
      idempotency_key: input.idempotency_key,
      request_fingerprint: fingerprint,
      actor_user_id: input.actor_user_id,
      base_revision: input.base_revision,
      now: input.now,
      audit_id: input.audit_id,
      correlation_id: input.correlation_id,
      desired: [],
      audit_summary: {
        action: auditAction,
        entity_type: "account",
        entity_id: input.account_user_id,
        reason: "ROLE_ASSIGNMENT_DUPLICATE",
        old_value_json: JSON.stringify(activeRoleDefinitionIds),
        new_value_json: JSON.stringify(activeRoleDefinitionIds),
      },
    },
    {
      errorCode: "ROLE_ASSIGNMENT_DUPLICATE",
      auditOutcome: "DUPLICATE",
      resultJson,
    }
  );
  if (result.idempotent) {
    const replay = parseEnvelope<AccountAccessMutationResult>(
      result.result_json
    );
    if (replay) {
      return { ...replay, idempotent: true };
    }
  }
  return { ...view, idempotent: false, duplicateRoleDefinitionIds };
}

function normalizeRoleIds(input: readonly string[]): string[] {
  return [...new Set(input)].filter(
    (id) => typeof id === "string" && id.length > 0
  );
}

/**
 * Account Access read projection. It is deliberately account-first and safe:
 * only Active non-Admin targets are exposed, and credential/contact/activity
 * columns never enter the query or result.
 */
export async function loadAccountAccess(
  db: D1Database,
  actorUserId: string,
  accountUserId: string
): Promise<AccountAccessView> {
  await assertAccountAccessRead(db, actorUserId, accountUserId);
  return readProjection(db, actorUserId, accountUserId);
}

/**
 * Search candidates for assignment. Pagination is offset based as required by
 * the account picker contract; LIMIT+1 avoids a count query and keeps the
 * result bounded.
 */
export async function searchEligibleAccounts(
  db: D1Database,
  actorUserId: string,
  query: string,
  offset: number,
  limit: number
): Promise<{
  accounts: readonly {
    userId: string;
    name: string;
    username: string;
    identities: readonly {
      roleDefinitionId: string;
      label: string;
      scopeLabel: string | null;
    }[];
  }[];
  nextOffset: number | null;
}> {
  const actorRoles = await assertActiveActor(db, actorUserId);
  const capabilities = await resolveActorCapabilities(db, actorUserId);
  if (!capabilities["role.assign"] && !capabilities["role.revoke"]) {
    throw new RoleCapabilityDeniedError();
  }
  const safeOffset = Number.isInteger(offset) && offset >= 0 ? offset : 0;
  const safeLimit =
    Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 20;
  const term = query.trim().slice(0, 120);
  const pattern = `%${term}%`;
  const rows = await db
    .prepare(
      `SELECT a.user_id, a.name, a.username
         FROM accounts a
        WHERE a.account_status = 'Active'
          AND a.user_id <> ?
          AND NOT EXISTS (
            SELECT 1
              FROM role_assignments ra
              JOIN role_definitions rd ON rd.role_definition_id = ra.role_definition_id
             WHERE ra.account_user_id = a.user_id
               AND ra.revoked_at IS NULL
               AND rd.stable_key = ?
          )
          AND (a.name LIKE ? COLLATE NOCASE OR a.username LIKE ? COLLATE NOCASE)
        ORDER BY a.name COLLATE NOCASE ASC, a.user_id ASC
        LIMIT ? OFFSET ?`
    )
    .bind(
      actorUserId,
      PROTECTED_STABLE_KEYS.ADMIN,
      pattern,
      pattern,
      safeLimit + 1,
      safeOffset
    )
    .all<{ user_id: string; name: string; username: string }>();
  const resultRows = (rows.results ?? []).slice(0, safeLimit);
  const names = await readScopeNames(db);
  const accounts = await Promise.all(
    resultRows.map(async (row) => {
      const assignments = await readAssignments(db, row.user_id, false);
      const roles = await readRoles(
        db,
        assignments.map((assignment) => assignment.role_definition_id)
      );
      const rolesById = new Map(
        roles.map((role) => [role.role_definition_id, role])
      );
      const visibleAssignments = await filterAuthorizedAssignments(
        db,
        actorUserId,
        actorRoles,
        assignments,
        rolesById
      );
      return {
        userId: row.user_id,
        name: row.name,
        username: row.username,
        identities: visibleAssignments
          .map((assignment) => {
            const role = rolesById.get(assignment.role_definition_id);
            if (!role || adminRole(role) || baselineRole(role)) {
              return null;
            }
            return {
              roleDefinitionId: role.role_definition_id,
              label: role.label,
              scopeLabel: scopeLabel(role, names),
            };
          })
          .filter(
            (
              identity
            ): identity is {
              roleDefinitionId: string;
              label: string;
              scopeLabel: string | null;
            } => identity !== null
          ),
      };
    })
  );
  return {
    accounts,
    nextOffset:
      (rows.results ?? []).length > safeLimit ? safeOffset + safeLimit : null,
  };
}

/**
 * Add one or more identities to one eligible account. This route is additive;
 * revocation uses `revokeAccountAssignments` so an empty list can never hide a
 * destructive operation. Active duplicates are terminal DUPLICATE no-ops.
 */
export async function mutateAccountAssignments(
  db: D1Database,
  input: AccountAccessMutationInput
): Promise<AccountAccessMutationResult> {
  const roleIds = normalizeRoleIds(input.role_definition_ids);
  const fingerprint = canonicalAssignmentFingerprint({
    ...input,
    role_definition_ids: roleIds,
  });
  const replay = await replayIfTerminal<AccountAccessMutationResult>(db, {
    idempotency_key: input.idempotency_key,
    actor_user_id: input.actor_user_id,
    request_fingerprint: fingerprint,
  });
  if (replay) {
    return { ...replay.value, idempotent: true };
  }
  if (roleIds.length === 0) {
    return deny(
      db,
      input,
      fingerprint,
      new RoleInvalidTargetError(),
      "ROLE_INVALID_TARGET",
      "ROLE_ASSIGNMENT_GRANT",
      "account",
      input.account_user_id
    );
  }
  let eligibility: Awaited<ReturnType<typeof assertEligibleAccount>>;
  try {
    const actorRoles = await assertOperationCapability(
      db,
      input.actor_user_id,
      "role.assign"
    );
    eligibility = await assertEligibleAccount(
      db,
      input.actor_user_id,
      input.account_user_id,
      actorRoles
    );
    if (input.actor_user_id !== input.account_user_id) {
      await assertNonAdminTarget(db, input.account_user_id);
    }
  } catch (error) {
    const code =
      error instanceof AccountAdminProtectedError
        ? "ROLE_ADMIN_PROTECTED"
        : error instanceof AccountTargetIneligibleError
          ? "ROLE_TARGET_INELIGIBLE"
          : "ROLE_FORBIDDEN";
    return deny(
      db,
      input,
      fingerprint,
      error as Error,
      code,
      "ROLE_ASSIGNMENT_GRANT",
      "account",
      input.account_user_id,
      auditOutcomeFor(code)
    );
  }
  const roles = await readRoles(db, roleIds);
  const byId = new Map(roles.map((role) => [role.role_definition_id, role]));
  const activeRows = await readAssignments(db, input.account_user_id, false);
  const activeIds = new Set(
    activeRows.map((assignment) => assignment.role_definition_id)
  );
  const duplicates: string[] = [];
  const additions: StagedAdd[] = [];
  const desired: {
    kind: "grant_assignment";
    assignment_id: string;
    account_user_id: string;
    role_definition_id: string;
    scope_kind: RoleScopeKind;
    scope_id: string | null;
  }[] = [];
  try {
    for (const roleId of roleIds) {
      const role = byId.get(roleId);
      if (!role) {
        throw new RoleTargetNotFoundError();
      }
      assertSelfTarget(
        input.actor_user_id,
        input.account_user_id,
        eligibility.actorRoles,
        role
      );
      // Authorize every requested role before classifying an active duplicate.
      // A no-op must not disclose the target projection to an unauthorized
      // actor or bypass protected/archive/position/scope checks.
      await assertRoleManageable(
        db,
        input.actor_user_id,
        eligibility.actorRoles,
        role,
        "role.assign"
      );
      if (activeIds.has(roleId)) {
        duplicates.push(roleId);
        continue;
      }
      const assignmentId = crypto.randomUUID();
      additions.push({ assignmentId, role, grantedAt: input.now });
      desired.push({
        kind: "grant_assignment",
        assignment_id: assignmentId,
        account_user_id: input.account_user_id,
        role_definition_id: role.role_definition_id,
        scope_kind: role.scope_kind,
        scope_id: role.scope_id,
      });
    }
  } catch (error) {
    const code =
      error instanceof RoleAdminProtectedError
        ? "ROLE_ADMIN_PROTECTED"
        : error instanceof RoleBaselineProtectedError
          ? "ROLE_BASELINE_PROTECTED"
          : error instanceof RoleArchivedError
            ? "ROLE_ARCHIVED"
            : error instanceof RoleHighestProtectedError
              ? "ROLE_HIGHEST_PROTECTED"
              : error instanceof RoleScopeMismatchError
                ? "ROLE_SCOPE_MISMATCH"
                : error instanceof RoleTargetNotFoundError
                  ? "ROLE_NOT_FOUND"
                  : "ROLE_FORBIDDEN";
    return deny(
      db,
      input,
      fingerprint,
      error as Error,
      code,
      "ROLE_ASSIGNMENT_GRANT",
      "account",
      input.account_user_id,
      auditOutcomeFor(code)
    );
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
        action: "ROLE_ASSIGNMENT_GRANT",
        entity_type: "account",
        entity_id: input.account_user_id,
        reason: "ROLE_POLICY_CONFLICT",
      },
    });
    throw new RoleRevisionConflictError(
      conflict.resulting_revision,
      false,
      true
    );
  }
  const viewBefore = await readProjection(
    db,
    input.actor_user_id,
    input.account_user_id
  );
  if (desired.length === 0) {
    return duplicateResult(
      db,
      input,
      fingerprint,
      viewBefore,
      duplicates,
      activeRows.map((assignment) => assignment.role_definition_id),
      "ROLE_ASSIGNMENT_GRANT"
    );
  }
  const projected = await readProjection(
    db,
    input.actor_user_id,
    input.account_user_id,
    {
      stagedAdds: additions,
      revision: input.base_revision + 1,
    }
  );
  const mutation = await applyRoleMutation(db, {
    idempotency_key: input.idempotency_key,
    request_fingerprint: fingerprint,
    actor_user_id: input.actor_user_id,
    base_revision: input.base_revision,
    now: input.now,
    audit_id: input.audit_id,
    correlation_id: input.correlation_id,
    desired,
    result_json: JSON.stringify({
      requestId: input.correlation_id,
      data: {
        ...projected,
        idempotent: false,
        duplicateRoleDefinitionIds: duplicates,
      },
    }),
    audit_summary: {
      action: "ROLE_ASSIGNMENT_GRANT",
      entity_type: "account",
      entity_id: input.account_user_id,
      reason: "account_access_grant",
      old_value_json: JSON.stringify(
        activeRows.map((assignment) => assignment.role_definition_id)
      ),
      new_value_json: JSON.stringify([
        ...activeRows.map((assignment) => assignment.role_definition_id),
        ...desired.map((change) => change.role_definition_id),
      ]),
    },
  });
  if (mutation.idempotent) {
    const stored = parseEnvelope<AccountAccessMutationResult>(
      mutation.result_json
    );
    if (stored) {
      return { ...stored, idempotent: true };
    }
  }
  const view = await loadAccountAccess(
    db,
    input.actor_user_id,
    input.account_user_id
  );
  return { ...view, idempotent: false, duplicateRoleDefinitionIds: duplicates };
}

/** Explicit revoke route contract: role_definition_ids names identities to revoke. */
export async function revokeAccountAssignments(
  db: D1Database,
  input: AccountAccessMutationInput
): Promise<AccountAccessMutationResult> {
  const roleIds = normalizeRoleIds(input.role_definition_ids);
  const fingerprint = canonicalRevokeFingerprint({
    ...input,
    role_definition_ids: roleIds,
  });
  const replay = await replayIfTerminal<AccountAccessMutationResult>(db, {
    idempotency_key: input.idempotency_key,
    actor_user_id: input.actor_user_id,
    request_fingerprint: fingerprint,
  });
  if (replay) {
    return { ...replay.value, idempotent: true };
  }
  if (roleIds.length === 0) {
    return deny(
      db,
      input,
      fingerprint,
      new AccountRevokeTargetError(),
      "ROLE_INVALID_TARGET",
      "ROLE_ASSIGNMENT_REVOKE",
      "account",
      input.account_user_id
    );
  }
  let eligibility: Awaited<ReturnType<typeof assertEligibleAccount>>;
  try {
    const actorRoles = await assertOperationCapability(
      db,
      input.actor_user_id,
      "role.revoke"
    );
    eligibility = await assertEligibleAccount(
      db,
      input.actor_user_id,
      input.account_user_id,
      actorRoles
    );
    if (input.actor_user_id !== input.account_user_id) {
      await assertNonAdminTarget(db, input.account_user_id);
    }
  } catch (error) {
    const code =
      error instanceof AccountAdminProtectedError
        ? "ROLE_ADMIN_PROTECTED"
        : error instanceof AccountTargetIneligibleError
          ? "ROLE_TARGET_INELIGIBLE"
          : "ROLE_FORBIDDEN";
    return deny(
      db,
      input,
      fingerprint,
      error as Error,
      code,
      "ROLE_ASSIGNMENT_REVOKE",
      "account",
      input.account_user_id,
      auditOutcomeFor(code)
    );
  }
  const activeRows = await readAssignments(db, input.account_user_id, false);
  const roles = await readRoles(db, roleIds);
  const byId = new Map(roles.map((role) => [role.role_definition_id, role]));
  const activeByRole = new Map(
    activeRows.map((assignment) => [assignment.role_definition_id, assignment])
  );
  const noops: string[] = [];
  const staged: StagedRevoke[] = [];
  const desired: {
    kind: "revoke_assignment";
    account_user_id: string;
    role_definition_id: string;
    revoke_reason: string;
  }[] = [];
  try {
    for (const roleId of roleIds) {
      const role = byId.get(roleId);
      if (!role) {
        throw new RoleTargetNotFoundError();
      }
      assertSelfTarget(
        input.actor_user_id,
        input.account_user_id,
        eligibility.actorRoles,
        role
      );
      // An absent assignment is still an authorization-sensitive no-op.
      await assertRoleManageable(
        db,
        input.actor_user_id,
        eligibility.actorRoles,
        role,
        "role.revoke"
      );
      const assignment = activeByRole.get(roleId);
      if (!assignment) {
        noops.push(roleId);
        continue;
      }
      staged.push({
        assignment,
        role,
        revokedAt: input.now,
        revokedBy: input.actor_user_id,
        reason: "account_access_revoke",
      });
      desired.push({
        kind: "revoke_assignment",
        account_user_id: input.account_user_id,
        role_definition_id: roleId,
        revoke_reason: "account_access_revoke",
      });
    }
  } catch (error) {
    const code =
      error instanceof RoleAdminProtectedError
        ? "ROLE_ADMIN_PROTECTED"
        : error instanceof RoleBaselineProtectedError
          ? "ROLE_BASELINE_PROTECTED"
          : error instanceof RoleHighestProtectedError
            ? "ROLE_HIGHEST_PROTECTED"
            : error instanceof RoleScopeMismatchError
              ? "ROLE_SCOPE_MISMATCH"
              : error instanceof RoleTargetNotFoundError
                ? "ROLE_NOT_FOUND"
                : "ROLE_FORBIDDEN";
    return deny(
      db,
      input,
      fingerprint,
      error as Error,
      code,
      "ROLE_ASSIGNMENT_REVOKE",
      "account",
      input.account_user_id,
      auditOutcomeFor(code)
    );
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
        action: "ROLE_ASSIGNMENT_REVOKE",
        entity_type: "account",
        entity_id: input.account_user_id,
        reason: "ROLE_POLICY_CONFLICT",
      },
    });
    throw new RoleRevisionConflictError(
      conflict.resulting_revision,
      false,
      true
    );
  }
  const before = await readProjection(
    db,
    input.actor_user_id,
    input.account_user_id
  );
  if (desired.length === 0) {
    return duplicateResult(
      db,
      input,
      fingerprint,
      before,
      noops,
      activeRows.map((assignment) => assignment.role_definition_id),
      "ROLE_ASSIGNMENT_REVOKE"
    );
  }
  const projected = await readProjection(
    db,
    input.actor_user_id,
    input.account_user_id,
    {
      stagedRevokes: staged,
      revision: input.base_revision + 1,
    }
  );
  const mutation = await applyRoleMutation(db, {
    idempotency_key: input.idempotency_key,
    request_fingerprint: fingerprint,
    actor_user_id: input.actor_user_id,
    base_revision: input.base_revision,
    now: input.now,
    audit_id: input.audit_id,
    correlation_id: input.correlation_id,
    desired,
    result_json: JSON.stringify({
      requestId: input.correlation_id,
      data: {
        ...projected,
        idempotent: false,
        duplicateRoleDefinitionIds: noops,
        impact: {
          lost: differenceGroups(
            before.effectiveAccess,
            projected.effectiveAccess
          ),
          retained: intersectGroups(
            before.effectiveAccess,
            projected.effectiveAccess
          ),
        },
      },
    }),
    audit_summary: {
      action: "ROLE_ASSIGNMENT_REVOKE",
      entity_type: "account",
      entity_id: input.account_user_id,
      reason: "account_access_revoke",
      old_value_json: JSON.stringify(
        activeRows.map((assignment) => assignment.role_definition_id)
      ),
      new_value_json: JSON.stringify(
        activeRows
          .filter(
            (assignment) =>
              !staged.some(
                (revoke) =>
                  revoke.assignment.assignment_id === assignment.assignment_id
              )
          )
          .map((assignment) => assignment.role_definition_id)
      ),
    },
  });
  if (mutation.idempotent) {
    const stored = parseEnvelope<AccountAccessMutationResult>(
      mutation.result_json
    );
    if (stored) {
      return { ...stored, idempotent: true };
    }
  }
  const view = await loadAccountAccess(
    db,
    input.actor_user_id,
    input.account_user_id
  );
  return {
    ...view,
    idempotent: false,
    duplicateRoleDefinitionIds: noops,
    impact: {
      lost: differenceGroups(before.effectiveAccess, view.effectiveAccess),
      retained: intersectGroups(before.effectiveAccess, view.effectiveAccess),
    },
  };
}

async function lifecycleImpact(
  db: D1Database,
  actorUserId: string,
  roleDefinitionId: string,
  activeAssignments: readonly AssignmentRecord[],
  now: string,
  action: "archive" | "restore",
  revision: number
): Promise<RoleDefinitionLifecycleResult["impact"]> {
  if (action !== "archive") {
    return [];
  }
  const impacts: {
    accountUserId: string;
    lost: EffectiveAccessGroups;
    retained: EffectiveAccessGroups;
  }[] = [];
  for (const assignment of activeAssignments) {
    const before = await readProjection(
      db,
      actorUserId,
      assignment.account_user_id,
      { includeLifecycleImpacts: false, manageCapability: "role.delete" }
    );
    const role = await readRole(db, roleDefinitionId);
    if (!role) {
      continue;
    }
    const after = await readProjection(
      db,
      actorUserId,
      assignment.account_user_id,
      {
        stagedRevokes: [
          {
            assignment,
            role,
            revokedAt: now,
            revokedBy: actorUserId,
            reason: "role_archived",
          },
        ],
        revision,
        includeLifecycleImpacts: false,
        manageCapability: "role.delete",
      }
    );
    impacts.push({
      accountUserId: assignment.account_user_id,
      lost: differenceGroups(before.effectiveAccess, after.effectiveAccess),
      retained: intersectGroups(before.effectiveAccess, after.effectiveAccess),
    });
  }
  return impacts;
}

/**
 * Return a revision-bound lifecycle impact without writing state. The caller
 * must already hold role.delete; target role state and assignments are read
 * only after that capability check.
 */
export async function getRoleDefinitionLifecyclePreview(
  db: D1Database,
  actorUserId: string,
  roleDefinitionId: string,
  action: "archive" | "restore"
): Promise<RoleDefinitionLifecyclePreview> {
  const actorRoles = await assertOperationCapability(
    db,
    actorUserId,
    "role.delete"
  );
  const role = await readRole(db, roleDefinitionId);
  if (!role) {
    throw new RoleTargetNotFoundError();
  }
  if (
    (action === "archive" && role.is_archived === 1) ||
    (action === "restore" && role.is_archived === 0)
  ) {
    throw new RoleArchivedError();
  }
  await assertRoleManageable(
    db,
    actorUserId,
    actorRoles,
    role,
    "role.delete",
    action === "restore"
  );
  const revision = await readCurrentRevision(db);
  const assignments = await db
    .prepare(
      `SELECT assignment_id, account_user_id, role_definition_id,
              scope_kind, scope_id, granted_by, granted_at,
              revoked_by, revoked_at, revoke_reason
         FROM role_assignments
        WHERE role_definition_id = ? AND revoked_at IS NULL`
    )
    .bind(role.role_definition_id)
    .all<AssignmentRecord>();
  const activeRows = assignments.results ?? [];
  return {
    roleDefinitionId: role.role_definition_id,
    action,
    isArchived: role.is_archived === 1,
    revision,
    affectedAccountUserIds: activeRows.map(
      (assignment) => assignment.account_user_id
    ),
    impact: await lifecycleImpact(
      db,
      actorUserId,
      role.role_definition_id,
      activeRows,
      new Date().toISOString(),
      action,
      revision
    ),
  };
}

/** Archive/restore one Role Definition through the same mutation kernel. */
export async function mutateRoleDefinitionLifecycle(
  db: D1Database,
  input: RoleDefinitionLifecycleInput
): Promise<RoleDefinitionLifecycleResult> {
  const fingerprint = canonicalLifecycleFingerprint(input);
  const replay = await replayIfTerminal<RoleDefinitionLifecycleResult>(db, {
    idempotency_key: input.idempotency_key,
    actor_user_id: input.actor_user_id,
    request_fingerprint: fingerprint,
  });
  if (replay) {
    return { ...replay.value, idempotent: true };
  }
  let actorRoles: Awaited<ReturnType<typeof loadActorRoles>>;
  try {
    actorRoles = await assertOperationCapability(
      db,
      input.actor_user_id,
      "role.delete"
    );
  } catch (error) {
    return deny(
      db,
      input,
      fingerprint,
      error as Error,
      "ROLE_FORBIDDEN",
      "ROLE_DEFINITION_LIFECYCLE",
      "role_definition",
      input.role_definition_id,
      "DENIED"
    );
  }
  const role = await readRole(db, input.role_definition_id);
  if (!role) {
    return deny(
      db,
      input,
      fingerprint,
      new RoleTargetNotFoundError(),
      "ROLE_NOT_FOUND",
      "ROLE_DEFINITION_LIFECYCLE",
      "role_definition",
      input.role_definition_id
    );
  }
  if (input.action === "archive" && role.is_archived === 1) {
    return deny(
      db,
      input,
      fingerprint,
      new RoleArchivedError(),
      "ROLE_ARCHIVED",
      "ROLE_DEFINITION_ARCHIVE",
      "role_definition",
      role.role_definition_id
    );
  }
  if (input.action === "restore" && role.is_archived === 0) {
    return deny(
      db,
      input,
      fingerprint,
      new RoleArchivedError(),
      "ROLE_ARCHIVED",
      "ROLE_DEFINITION_RESTORE",
      "role_definition",
      role.role_definition_id
    );
  }
  try {
    await assertRoleManageable(
      db,
      input.actor_user_id,
      actorRoles,
      role,
      "role.delete",
      input.action === "restore"
    );
  } catch (error) {
    const code =
      error instanceof RoleAdminProtectedError
        ? "ROLE_ADMIN_PROTECTED"
        : error instanceof RoleBaselineProtectedError
          ? "ROLE_BASELINE_PROTECTED"
          : error instanceof RoleArchivedError
            ? "ROLE_ARCHIVED"
            : error instanceof RoleHighestProtectedError
              ? "ROLE_HIGHEST_PROTECTED"
              : error instanceof RoleScopeMismatchError
                ? "ROLE_SCOPE_MISMATCH"
                : "ROLE_FORBIDDEN";
    return deny(
      db,
      input,
      fingerprint,
      error as Error,
      code,
      input.action === "archive"
        ? "ROLE_DEFINITION_ARCHIVE"
        : "ROLE_DEFINITION_RESTORE",
      "role_definition",
      role.role_definition_id,
      auditOutcomeFor(code)
    );
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
        action:
          input.action === "archive"
            ? "ROLE_DEFINITION_ARCHIVE"
            : "ROLE_DEFINITION_RESTORE",
        entity_type: "role_definition",
        entity_id: role.role_definition_id,
        reason: "ROLE_POLICY_CONFLICT",
      },
    });
    throw new RoleRevisionConflictError(
      conflict.resulting_revision,
      false,
      true
    );
  }
  const activeAssignments = await db
    .prepare(
      `SELECT assignment_id, account_user_id, role_definition_id,
              scope_kind, scope_id, granted_by, granted_at,
              revoked_by, revoked_at, revoke_reason
         FROM role_assignments
        WHERE role_definition_id = ? AND revoked_at IS NULL`
    )
    .bind(role.role_definition_id)
    .all<AssignmentRecord>();
  const activeRows = activeAssignments.results ?? [];
  const impact = await lifecycleImpact(
    db,
    input.actor_user_id,
    role.role_definition_id,
    activeRows,
    input.now,
    input.action,
    input.base_revision + 1
  );
  const lifecycle: RoleDefinitionLifecycleResult = {
    roleDefinitionId: role.role_definition_id,
    action: input.action,
    isArchived: input.action === "archive",
    revision: input.base_revision + 1,
    affectedAccountUserIds: activeRows.map(
      (assignment) => assignment.account_user_id
    ),
    impact,
    idempotent: false,
  };
  const mutation = await applyRoleMutation(db, {
    idempotency_key: input.idempotency_key,
    request_fingerprint: fingerprint,
    actor_user_id: input.actor_user_id,
    base_revision: input.base_revision,
    now: input.now,
    audit_id: input.audit_id,
    correlation_id: input.correlation_id,
    desired: [
      input.action === "archive"
        ? {
            kind: "archive_role_definition",
            role_definition_id: role.role_definition_id,
          }
        : {
            kind: "restore_role_definition",
            role_definition_id: role.role_definition_id,
          },
    ],
    result_json: JSON.stringify({
      requestId: input.correlation_id,
      data: lifecycle,
    }),
    audit_summary: {
      action:
        input.action === "archive"
          ? "ROLE_DEFINITION_ARCHIVE"
          : "ROLE_DEFINITION_RESTORE",
      entity_type: "role_definition",
      entity_id: role.role_definition_id,
      reason: input.reason?.trim() || null,
      old_value_json: JSON.stringify({ is_archived: role.is_archived }),
      new_value_json: JSON.stringify({
        is_archived: input.action === "archive" ? 1 : 0,
        affectedAccountUserIds: lifecycle.affectedAccountUserIds,
      }),
    },
  });
  if (mutation.idempotent) {
    const stored = parseEnvelope<RoleDefinitionLifecycleResult>(
      mutation.result_json
    );
    if (stored) {
      return { ...stored, idempotent: true };
    }
  }
  return lifecycle;
}
export const updateRoleDefinitionLifecycle = mutateRoleDefinitionLifecycle;

export const __test = {
  canonicalAssignmentFingerprint,
  canonicalRevokeFingerprint,
  canonicalLifecycleFingerprint,
  differenceGroups,
  intersectGroups,
  normalizeRoleIds,
  resolveEffectiveAccess,
};
