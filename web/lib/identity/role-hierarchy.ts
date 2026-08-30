import { CAPABILITY_CATALOG } from "./capability-catalog";
/**
 * #478/#479 — S5-A03 normalized read-only 身份組 hierarchy + the rename /
 * create / rescope / reorder mutation authority seam (Spec 091, ADR-0042).
 *
 * This module owns the disposable-D1 read projection and the mutation
 * authority seam:
 *
 *   * `loadRoleHierarchy()` — the read-only tree: fixed Role Categories
 *     (non-assignable headings), ordered Role Definition summaries, the
 *     protected Admin / 會友基礎 anchors, scope labels, child counts,
 *     protected states, and the server-projected action affordances. The
 *     read is gated on the actor's effective `role.read` capability; the
 *     rename/scope/reorder affordances are projected only when the matching
 *     capability is held.
 *   * `createRoleDefinition()` — #479 creation: Admin creates global or
 *     scoped definitions; Staff creates scoped definitions only under an
 *     existing permitted fixed category and strictly below Staff. New
 *     definitions start Active with zero grants, a globally unique
 *     normalized name, and an authoritative order revision.
 *   * `reorderRoleDefinitions()` — #479 sibling-only order: two sibling
 *     Role Definitions inside one fixed category swap positions; the
 *     parent Category, grants, scope, and assignments are untouched. A
 *     stale base revision is rejected with the authoritative revision and
 *     order (ROLE_ORDER_CONFLICT).
 *   * `renameRoleDefinition()` — the Phase A complete lower-target rename;
 *     stable ID, order, scope, grants, and assignments are untouched.
 *   * `rescopeRoleDefinition()` — #479 changes one lower identity's explicit
 *     scope and fixed parent atomically while preserving its stable identity,
 *     label, grants, assignments, and protected anchors.
 *
 * Authority is recomputed from D1 on every call — the UI projection is
 * never the authority (Spec 091 §10). The Worker handlers
 * (web/lib/identity/role-handlers.ts) are the only callers.
 *
 * Name contract (Spec 091 §8.2): display names are globally unique after
 * trim / Unicode normalization (NFC) / case folding; the canonical
 * fingerprint for idempotency is computed server-side from the request
 * semantics (role ID, base revision, normalized name) and never trusts a
 * client-supplied value.
 */
/* oxlint-disable eslint/max-classes-per-file, eslint/no-unused-vars, eslint/no-use-before-define, eslint/prefer-destructuring, eslint/require-await, eslint/complexity, unicorn/no-lonely-if -- classes mirror the Worker error vocabulary; guards are sequential by design and authority helpers are declared top-down for readability. */
import {
  applyRoleMutation,
  readCurrentRevision,
  recordRoleDenial,
  RoleIdempotencyConflictError,
  RoleRevisionConflictError,
} from "./mutations";
import { PROTECTED_STABLE_KEYS, ROLE_CATEGORY_KEY } from "./types";
import type { RoleAuditOutcome, RoleCategoryKey, RoleScopeKind } from "./types";

/** Name contract (H-11): trimmed, non-empty, ≤ 60 characters (Spec 091 §8.2). */
export const ROLE_NAME_MAX_LENGTH = 60;

export const ROLE_HIERARCHY_ACTION = {
  RENAME: "rename",
  SCOPE: "scope",
  REORDER: "reorder",
  PERMISSIONS: "permissions",
} as const;

export type RoleHierarchyAction =
  (typeof ROLE_HIERARCHY_ACTION)[keyof typeof ROLE_HIERARCHY_ACTION];

/** Server-authorized identity assignment action. */
export interface RoleAssignmentActionAffordance {
  action: "assign" | "revoke";
  label: string;
}

/** Server-authorized lifecycle action for an identity-first entry. */
export interface RoleLifecycleActionAffordance {
  action: "archive" | "restore";
  label: string;
}

/** Server-projected action affordance (H-03). */
export interface RoleHierarchyActionAffordance {
  action: RoleHierarchyAction;
  /** Human-readable Cantonese label the UI may use. */
  label: string;
}

/**
 * One server-projected creation target (B-479-02/B-479-12): an existing
 * fixed Category plus the explicit scope the actor may create under.
 * Global entries carry `scope_id: null` and are projected only for Admin;
 * scoped entries carry the Department/Program scope the actor holds below
 * Staff.
 */
export interface RoleHierarchyScopeOption {
  category_key: RoleCategoryKey;
  scope_kind: RoleScopeKind;
  scope_id: string | null;
  /** Human-readable scope label (e.g. 成區 / 青少年查經). */
  scopeLabel: string;
}

/** Reorder action payload (B-479-07/B-479-08). */
export interface RoleHierarchyOrderTarget {
  role_definition_id: string;
  position: number;
}

/** Authoritative reorder result (B-479-07/B-479-10). */
export interface RoleReorderResult {
  categoryKey: RoleCategoryKey;
  orderedRoleDefinitionIds: string[];
  revision: number;
  /** True when the idempotency key was replayed. */
  idempotent: boolean;
}

/** One Role Definition summary inside the tree (H-01/H-03). */
export interface RoleHierarchyDefinition {
  roleDefinitionId: string;
  label: string;
  description: string;
  kind: "SYSTEM" | "GLOBAL" | "DEPARTMENT_SCOPED" | "PROGRAM_SCOPED";
  scopeKind: RoleScopeKind;
  scopeId: string | null;
  /** Parent Department ID for Program-scoped identity context. */
  scopeParentDepartmentId?: string | null;
  /** Human-readable scope label; null for Global identities. */
  scopeLabel: string | null;
  position: number;
  isProtected: boolean;
  isArchived: boolean;
  assignmentCount: number;
  /** Opaque IDs for identity-first Account Access entry links. */
  assignedAccountUserIds?: string[];
  /** Server-authorized assignment actions for this definition. */
  assignmentActions?: RoleAssignmentActionAffordance[];
  /** Server-authorized archive/restore actions for Account Access. */
  lifecycleActions?: RoleLifecycleActionAffordance[];
  grantCount: number;
  /** Server-projected actions per the caller's capabilities (H-03). */
  actions: RoleHierarchyActionAffordance[];
  /** Server-projected scope destinations for this definition. */
  scopeOptions?: RoleHierarchyScopeOption[];
  /** Server-projected reorder affordances (B-479-07/B-479-08). */
  reorderActions: RoleHierarchyActionAffordance[];
}

/** One fixed Role Category heading (H-01). */
export interface RoleHierarchyCategory {
  categoryKey: RoleCategoryKey;
  label: string;
  description: string;
  displayOrder: number;
  childCount: number;
  definitions: RoleHierarchyDefinition[];
  /** Server-projected creation targets (B-479-02/B-479-12). */
  createOptions: RoleHierarchyScopeOption[];
}

/** Complete read projection (H-01). */
export interface RoleHierarchyView {
  categories: RoleHierarchyCategory[];
  revision: number;
  caller: {
    userId: string;
    /** Highest position held by the caller. */
    highestPosition: number;
  };
}

/** Rename mutation input (H-05). */
export interface RoleRenameInput {
  actor_user_id: string;
  idempotency_key: string;
  base_revision: number;
  role_definition_id: string;
  /** Trimmed, validated display name (≤ ROLE_NAME_MAX_LENGTH). */
  label: string;
  now: string;
  audit_id: string;
  correlation_id: string;
}

/** Authoritative rename result (H-05/H-15). */
export interface RoleRenameResult {
  roleDefinitionId: string;
  label: string;
  revision: number;
  /** True when the idempotency key was replayed (H-06). */
  idempotent: boolean;
}
/** #479 scope mutation input (Spec 091 §9.2). */
export interface RoleRescopeInput {
  actor_user_id: string;
  idempotency_key: string;
  base_revision: number;
  role_definition_id: string;
  /** Global is valid only for an Admin actor; scoped kinds require scope_id. */
  scope_kind: RoleScopeKind;
  scope_id: string | null;
  /** Optional client echo; the authority derives this from scope_kind. */
  category_key?: RoleCategoryKey;
  now: string;
  audit_id: string;
  correlation_id: string;
}

/** Authoritative scope mutation result (Spec 091 §9.2). */
export interface RoleRescopeResult {
  roleDefinitionId: string;
  categoryKey: RoleCategoryKey;
  scopeKind: RoleScopeKind;
  scopeId: string | null;
  position: number;
  revision: number;
  /** True when the idempotency key was replayed. */
  idempotent: boolean;
}

/** #479 creation mutation input (B-479-01/B-479-14). */
export interface RoleCreateInput {
  actor_user_id: string;
  idempotency_key: string;
  base_revision: number;
  category_key: RoleCategoryKey;
  /** Trimmed, validated display name (≤ ROLE_NAME_MAX_LENGTH). */
  label: string;
  description: string;
  scope_kind: RoleScopeKind;
  scope_id: string | null;
  now: string;
  audit_id: string;
  correlation_id: string;
}

/** #479 authoritative create result (B-479-01/B-479-14). */
export interface RoleCreateResult {
  roleDefinitionId: string;
  categoryKey: RoleCategoryKey;
  label: string;
  scopeKind: RoleScopeKind;
  scopeId: string | null;
  position: number;
  revision: number;
  /** True when the idempotency key was replayed. */
  idempotent: boolean;
}

/** #479 sibling reorder mutation input (B-479-07/B-479-08). */
export interface RoleReorderInput {
  actor_user_id: string;
  idempotency_key: string;
  base_revision: number;
  category_key: RoleCategoryKey;
  targets: readonly RoleHierarchyOrderTarget[];
  now: string;
  audit_id: string;
  correlation_id: string;
}

/** Typed rename failures; the handler maps them to Problem Details. */
export class RoleInvalidNameError extends Error {
  constructor() {
    super(
      "INVALID_NAME: display name must be trimmed, non-empty, and within ROLE_NAME_MAX_LENGTH"
    );
    this.name = "RoleInvalidNameError";
  }
}

export class RoleNameConflictError extends Error {
  constructor() {
    super("ROLE_NAME_TAKEN: normalized display name already exists");
    this.name = "RoleNameConflictError";
  }
}

export class RoleArchivedError extends Error {
  constructor() {
    super("ROLE_ARCHIVED: archived Role Definition cannot be renamed");
    this.name = "RoleArchivedError";
  }
}

export class RoleCapabilityDeniedError extends Error {
  constructor() {
    super("ROLE_FORBIDDEN: actor lacks the operation capability");
    this.name = "RoleCapabilityDeniedError";
  }
}

export class RoleAdminProtectedError extends Error {
  constructor() {
    super("ROLE_ADMIN_PROTECTED: Admin is immutable");
    this.name = "RoleAdminProtectedError";
  }
}

export class RoleBaselineProtectedError extends Error {
  constructor() {
    super("ROLE_BASELINE_PROTECTED: 會友基礎 is immutable");
    this.name = "RoleBaselineProtectedError";
  }
}

export class RoleProtectedIdentityError extends Error {
  constructor() {
    super("ROLE_ADMIN_OR_BASELINE_PROTECTED: protected system identity");
    this.name = "RoleProtectedIdentityError";
  }
}

export class RoleHighestProtectedError extends Error {
  constructor() {
    super("ROLE_HIGHEST_PROTECTED: target is at or above the actor's highest");
    this.name = "RoleHighestProtectedError";
  }
}

export class RoleScopeMismatchError extends Error {
  constructor() {
    super("ROLE_SCOPE_MISMATCH: target is outside the actor's scope");
    this.name = "RoleScopeMismatchError";
  }
}

export class RoleSelfRenameError extends Error {
  constructor() {
    super("ROLE_SELF_RENAME: an actor cannot rename its own highest identity");
    this.name = "RoleSelfRenameError";
  }
}

export class RoleTargetNotFoundError extends Error {
  constructor() {
    super("ROLE_NOT_FOUND: unknown Role Definition");
    this.name = "RoleTargetNotFoundError";
  }
}
/** Empty role IDs are invalid targets, distinct from unknown IDs. */
export class RoleInvalidTargetError extends Error {
  constructor() {
    super("ROLE_INVALID_TARGET: role definition target is required");
    this.name = "RoleInvalidTargetError";
  }
}

/** B-479-02/B-479-09: creation/reorder under an invalid parent Category. */
export class RoleInvalidParentError extends Error {
  constructor() {
    super("ROLE_INVALID_PARENT: the fixed Category is not a permitted parent");
    this.name = "RoleInvalidParentError";
  }
}

/** B-479-09: a reorder tries to move a Role Definition across Categories. */
export class RoleCrossCategoryError extends Error {
  constructor() {
    super(
      "ROLE_INVALID_PARENT: reorder targets must be siblings in one Category"
    );
    this.name = "RoleCrossCategoryError";
  }
}

/** B-479-04: a scoped creation is missing its explicit scope. */
export class RoleScopeRequiredError extends Error {
  constructor() {
    super(
      "ROLE_SCOPE_REQUIRED: a scoped Role Definition needs an explicit scope"
    );
    this.name = "RoleScopeRequiredError";
  }
}

/** B-479-10: the base order revision is stale; authoritative order exposed. */
export class RoleOrderConflictError extends Error {
  readonly currentRevision: number;
  readonly authoritativeIds: string[];
  constructor(currentRevision: number, authoritativeIds: string[]) {
    super(
      "ROLE_ORDER_CONFLICT: stale order revision; authoritative order exposed"
    );
    this.name = "RoleOrderConflictError";
    this.currentRevision = currentRevision;
    this.authoritativeIds = authoritativeIds;
  }
}

interface RoleDefinitionRow {
  role_definition_id: string;
  stable_key: string;
  label: string;
  description: string;
  category_key: RoleCategoryKey;
  scope_kind: RoleScopeKind;
  scope_id: string | null;
  /** Parent Department ID for Program-scoped definitions. */
  parent_department_id?: string | null;
  position: number;
  is_protected: number;
  is_archived: number;
}

interface CategoryRow {
  category_key: RoleCategoryKey;
  label: string;
  description: string;
  display_order: number;
}

interface CountRow {
  role_definition_id: string;
  assignments: number;
  assignment_user_ids: string | null;
  grants: number;
}

function parseAssignedAccountUserIds(
  value: string | null | undefined
): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) &&
      parsed.every((entry): entry is string => typeof entry === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

interface DepartmentRow {
  department_id: string;
  name: string;
}

interface ProgramRow {
  program_id: string;
  name: string;
}

/** Roles the actor holds in the disposable model, in global order. */
interface ActorRoleRow {
  role_definition_id: string;
  position: number;
  is_protected: number;
  category_key: RoleCategoryKey;
  scope_kind: RoleScopeKind;
  scope_id: string | null;
  label: string;
  stable_key: string;
}

function roleKind(
  categoryKey: RoleCategoryKey,
  stableKey: string
): RoleHierarchyDefinition["kind"] {
  // Global custom identities are assignable Role Definitions, not system
  // anchors. Only the three code-owned stable keys are system identities.
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

/** Load every role the actor holds (active assignments only, Spec 091 §4.5). */
export async function loadActorRoles(
  db: D1Database,
  actorUserId: string
): Promise<ActorRoleRow[]> {
  const rows = await db
    .prepare(
      `SELECT rd.role_definition_id, rd.position, rd.is_protected,
              rd.category_key, rd.scope_kind, rd.scope_id, rd.label,
              rd.stable_key
         FROM role_assignments ra
         JOIN role_definitions rd ON rd.role_definition_id = ra.role_definition_id
        WHERE ra.account_user_id = ?
          AND ra.revoked_at IS NULL
          AND rd.is_archived = 0
        ORDER BY rd.position ASC`
    )
    .bind(actorUserId)
    .all<ActorRoleRow>();
  return rows.results ?? [];
}

/**
 * Effective capability resolution (Spec 091 §4.5/§6.1): Admin holds every
 * closed catalog capability; every Active Account receives the automatic
 * `program.enroll` baseline; all other capabilities are the union of grants
 * across active assignments whose declared scope is Global or exactly matches
 * the requested resource scope. A Program scope is resolved to its parent
 * Department before filtering so Department authority applies to its Programs.
 */
export async function resolveActorCapabilities(
  db: D1Database,
  actorUserId: string,
  scope?: { departmentId?: string; programId?: string } | null
): Promise<Record<string, boolean>> {
  const roles = await loadActorRoles(db, actorUserId);
  const capabilities: Record<string, boolean> = {};
  const account = await db
    .prepare(`SELECT account_status FROM accounts WHERE user_id = ?`)
    .bind(actorUserId)
    .first<{ account_status: string }>();
  if (account?.account_status === "Active") {
    capabilities["program.enroll"] = true;
  }
  if (account?.account_status !== "Active") {
    return capabilities;
  }
  if (roles.some((role) => role.stable_key === PROTECTED_STABLE_KEYS.ADMIN)) {
    for (const entry of CAPABILITY_CATALOG) {
      capabilities[entry.capability] = true;
    }
    return capabilities;
  }

  const parentDepartment = scope?.programId
    ? await db
        .prepare(`SELECT department_id FROM programs WHERE program_id = ?`)
        .bind(scope.programId)
        .first<{ department_id: string }>()
    : null;
  let scopedFilter = "";
  let scopeBinds: string[] = [];
  if (scope?.programId) {
    scopedFilter = `AND (
      (rd.scope_kind = 'Global' AND rd.scope_id IS NULL)
      OR (rd.scope_kind = 'Department' AND rd.scope_id = ?)
      OR (rd.scope_kind = 'Program' AND rd.scope_id = ?)
    )`;
    scopeBinds = [
      parentDepartment?.department_id ?? scope.departmentId ?? "",
      scope.programId,
    ];
  } else if (scope?.departmentId) {
    scopedFilter = `AND (
      (rd.scope_kind = 'Global' AND rd.scope_id IS NULL)
      OR (rd.scope_kind = 'Department' AND rd.scope_id = ?)
    )`;
    scopeBinds = [scope.departmentId];
  } else if (scope === null) {
    scopedFilter = `AND rd.scope_kind = 'Global' AND rd.scope_id IS NULL`;
  }
  const grants = await db
    .prepare(
      `SELECT DISTINCT rg.capability
         FROM role_definition_grants rg
         JOIN role_assignments ra
           ON ra.role_definition_id = rg.role_definition_id
         JOIN role_definitions rd
           ON rd.role_definition_id = ra.role_definition_id
        WHERE ra.account_user_id = ?
          AND ra.revoked_at IS NULL
          AND rd.is_archived = 0
          ${scopedFilter}`
    )
    .bind(actorUserId, ...scopeBinds)
    .all<{ capability: string }>();
  for (const grant of grants.results ?? []) {
    capabilities[grant.capability] = true;
  }
  return capabilities;
}

export interface BootstrapIdentitySummary {
  label: string;
  scopeKind: RoleScopeKind;
  scopeLabel: string | null;
}

export interface BootstrapIdentity {
  systemRole: "Admin" | "Staff" | null;
  identities: readonly BootstrapIdentitySummary[];
  capabilities: Record<string, boolean>;
}

/** Load the privacy-safe identity projection used by the authenticated shell. */
export async function loadBootstrapIdentity(
  db: D1Database,
  actorUserId: string
): Promise<BootstrapIdentity> {
  const roles = await loadActorRoles(db, actorUserId);
  const names = await loadScopeNames(db);
  const identities = roles
    .filter((role) => role.stable_key !== PROTECTED_STABLE_KEYS.MEMBER)
    .map((role) => ({
      label: role.label,
      scopeKind: role.scope_kind,
      scopeLabel: scopeLabel(role.scope_kind, role.scope_id, names),
    }));
  const systemRole = roles.some(
    (role) => role.stable_key === PROTECTED_STABLE_KEYS.ADMIN
  )
    ? "Admin"
    : roles.some((role) => role.stable_key === PROTECTED_STABLE_KEYS.STAFF)
      ? "Staff"
      : null;
  return {
    systemRole,
    identities,
    capabilities: await resolveActorCapabilities(db, actorUserId),
  };
}

/**
 * Highest position held by the actor. Every role-management authority rule
 * (Spec 091 §5.1) is relative to this: the actor may manage only identities
 * strictly below it, may not rename its own highest identity, and Admin
 * (position 0) is untouchable for everyone.
 */
export async function resolveActorHighestPosition(
  db: D1Database,
  actorUserId: string
): Promise<number> {
  const roles = await loadActorRoles(db, actorUserId);
  if (roles.length === 0) {
    // A Member-baseline-only caller manages nothing (H-08 baseline lock).
    return Number.POSITIVE_INFINITY;
  }
  return roles[0]?.position ?? Number.POSITIVE_INFINITY;
}

interface ScopeNames {
  departments: Map<string, string>;
  programs: Map<string, string>;
}

async function loadScopeNames(db: D1Database): Promise<ScopeNames> {
  const departments = await db
    .prepare(`SELECT department_id, name FROM departments`)
    .all<DepartmentRow>();
  const programs = await db
    .prepare(`SELECT program_id, name FROM programs`)
    .all<ProgramRow>();
  return {
    departments: new Map(
      (departments.results ?? []).map((row) => [row.department_id, row.name])
    ),
    programs: new Map(
      (programs.results ?? []).map((row) => [row.program_id, row.name])
    ),
  };
}

function scopeLabel(
  scopeKind: RoleScopeKind,
  scopeId: string | null,
  names: ScopeNames
): string | null {
  if (scopeKind === ROLE_CATEGORY_KEY.DEPARTMENT && scopeId) {
    return names.departments.get(scopeId) ?? "部門";
  }
  if (scopeKind === ROLE_CATEGORY_KEY.PROGRAM && scopeId) {
    return names.programs.get(scopeId) ?? "課程";
  }
  return null;
}

/** The complete read-only hierarchy projection (H-01/H-02/H-03). */
export async function loadRoleHierarchy(
  db: D1Database,
  actorUserId: string
): Promise<RoleHierarchyView> {
  // Spec 091 §10: resolve the operation capability before any projection.
  // `role.read` gates the read surface; a caller without it receives the
  // canonical ROLE_FORBIDDEN problem and no tree.
  const capabilities = await resolveActorCapabilities(db, actorUserId);
  if (!capabilities["role.read"]) {
    throw new RoleCapabilityDeniedError();
  }
  const [categories, definitions, counts, revisionRow, actorRoles] =
    await Promise.all([
      db
        .prepare(
          `SELECT category_key, label, description, display_order
             FROM role_categories ORDER BY display_order ASC`
        )
        .all<CategoryRow>(),
      db
        .prepare(
          `SELECT role_definition_id, stable_key, label, description,
                  category_key, scope_kind, scope_id,
                  (
                    SELECT p.department_id
                      FROM programs p
                     WHERE p.program_id = role_definitions.scope_id
                       AND role_definitions.scope_kind = 'Program'
                  ) AS parent_department_id,
                  position, is_protected, is_archived
             FROM role_definitions ORDER BY position ASC`
        )
        .all<RoleDefinitionRow>(),
      db
        .prepare(
          `SELECT rd.role_definition_id,
                  (SELECT COUNT(*) FROM role_assignments ra
                    WHERE ra.role_definition_id = rd.role_definition_id
                      AND ra.revoked_at IS NULL) AS assignments,
                  (SELECT json_group_array(ra.account_user_id)
                     FROM role_assignments ra
                    WHERE ra.role_definition_id = rd.role_definition_id
                      AND ra.revoked_at IS NULL) AS assignment_user_ids,
                  (SELECT COUNT(*) FROM role_definition_grants rg
                    WHERE rg.role_definition_id = rd.role_definition_id) AS grants
             FROM role_definitions rd`
        )
        .all<CountRow>(),
      db
        .prepare(`SELECT revision FROM role_policy_revisions WHERE id = 1`)
        .first<{ revision: number }>(),
      loadActorRoles(db, actorUserId),
    ]);

  const revision = revisionRow?.revision ?? 1;
  const names = await loadScopeNames(db);
  const countById = new Map(
    (counts.results ?? []).map((row) => [
      row.role_definition_id,
      {
        assignments: row.assignments,
        assignment_user_ids: row.assignment_user_ids,
        grants: row.grants,
      },
    ])
  );

  const highestPosition =
    actorRoles.length > 0
      ? (actorRoles[0]?.position ?? Number.POSITIVE_INFINITY)
      : Number.POSITIVE_INFINITY;
  const projectedScopeOptions = scopeOptionsForActor(actorRoles, names);
  const permissionCapabilities = new Map(
    await Promise.all(
      (definitions.results ?? []).map(async (row) => {
        const scope =
          row.scope_kind === ROLE_CATEGORY_KEY.DEPARTMENT && row.scope_id
            ? { departmentId: row.scope_id }
            : row.scope_kind === ROLE_CATEGORY_KEY.PROGRAM && row.scope_id
              ? { programId: row.scope_id }
              : null;
        return [
          row.role_definition_id,
          await resolveActorCapabilities(db, actorUserId, scope),
        ] as const;
      })
    )
  );
  // A scoped `role.read` grant authorizes only matching role scopes. Keep the
  // category headings so the tree remains structurally safe, but do not emit
  // labels, descriptions, grants, scope labels, or archive metadata for rows
  // outside the actor's authorized Department/Program scopes.
  const visibleDefinitions = (definitions.results ?? []).filter(
    (row) =>
      permissionCapabilities.get(row.role_definition_id)?.["role.read"] === true
  );

  const categoriesView: RoleHierarchyCategory[] = (
    categories.results ?? []
  ).map((category) => {
    const definitionsView = visibleDefinitions
      .filter((row) => row.category_key === category.category_key)
      .map((row) => {
        const countsForRole = countById.get(row.role_definition_id);
        const canRename =
          capabilities["role.name.write"] === true &&
          // Staff is assignable and can be renamed by an eligible higher
          // actor holding role.name.write; only Admin and 會友基礎 are locked.
          (row.is_protected === 0 ||
            row.stable_key === PROTECTED_STABLE_KEYS.STAFF) &&
          row.is_archived === 0 &&
          row.position > highestPosition &&
          actorRoles[0]?.role_definition_id !== row.role_definition_id &&
          isWithinActorScope(actorRoles, row);
        const canRescope =
          capabilities["role.scope.write"] === true &&
          isEligibleRoleManager(actorRoles) &&
          row.is_protected === 0 &&
          row.stable_key !== PROTECTED_STABLE_KEYS.ADMIN &&
          row.stable_key !== PROTECTED_STABLE_KEYS.MEMBER &&
          row.is_archived === 0 &&
          row.position > highestPosition &&
          actorRoles[0]?.role_definition_id !== row.role_definition_id &&
          isWithinActorScope(actorRoles, row);
        // B-479-07/B-479-08: the reorder affordance appears on every lower,
        // in-scope sibling when the actor holds role.reorder.
        const canReorder =
          capabilities["role.reorder"] === true &&
          row.is_archived === 0 &&
          row.position > highestPosition &&
          actorRoles[0]?.role_definition_id !== row.role_definition_id &&
          isWithinActorScope(actorRoles, row);
        const canAssign =
          permissionCapabilities.get(row.role_definition_id)?.[
            "role.assign"
          ] === true &&
          row.is_protected === 0 &&
          row.stable_key !== PROTECTED_STABLE_KEYS.ADMIN &&
          row.stable_key !== PROTECTED_STABLE_KEYS.MEMBER &&
          row.is_archived === 0 &&
          row.position > highestPosition &&
          actorRoles[0]?.role_definition_id !== row.role_definition_id &&
          isWithinActorScope(actorRoles, row);
        const canRevoke =
          permissionCapabilities.get(row.role_definition_id)?.[
            "role.revoke"
          ] === true &&
          row.is_protected === 0 &&
          row.stable_key !== PROTECTED_STABLE_KEYS.ADMIN &&
          row.stable_key !== PROTECTED_STABLE_KEYS.MEMBER &&
          row.is_archived === 0 &&
          row.position > highestPosition &&
          actorRoles[0]?.role_definition_id !== row.role_definition_id &&
          isWithinActorScope(actorRoles, row);
        const assignmentActions: RoleAssignmentActionAffordance[] = [];
        if (canAssign) {
          assignmentActions.push({ action: "assign", label: "指派" });
        }
        if (canRevoke) {
          assignmentActions.push({ action: "revoke", label: "撤銷" });
        }
        const canReadAssignments = assignmentActions.length > 0;
        const canReadPermissions =
          permissionCapabilities.get(row.role_definition_id)?.[
            "role.permissions.read"
          ] === true &&
          row.is_protected === 0 &&
          row.stable_key !== PROTECTED_STABLE_KEYS.ADMIN &&
          row.stable_key !== PROTECTED_STABLE_KEYS.MEMBER &&
          row.is_archived === 0 &&
          row.position > highestPosition &&
          actorRoles[0]?.role_definition_id !== row.role_definition_id &&
          isWithinActorScope(actorRoles, row);
        const canLifecycle =
          permissionCapabilities.get(row.role_definition_id)?.[
            "role.delete"
          ] === true &&
          row.is_protected === 0 &&
          row.position > highestPosition &&
          actorRoles[0]?.role_definition_id !== row.role_definition_id &&
          isWithinActorScope(actorRoles, row);

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
        const lifecycleActions: RoleLifecycleActionAffordance[] = canLifecycle
          ? [
              {
                action: row.is_archived === 1 ? "restore" : "archive",
                label: row.is_archived === 1 ? "恢復" : "停用",
              },
            ]
          : [];
        return {
          roleDefinitionId: row.role_definition_id,
          label: row.label,
          description: row.description,
          kind: roleKind(row.category_key, row.stable_key),
          scopeKind: row.scope_kind,
          scopeParentDepartmentId: row.parent_department_id ?? null,
          scopeId: row.scope_id,
          scopeLabel: scopeLabel(row.scope_kind, row.scope_id, names),
          position: row.position,
          isProtected: row.is_protected === 1,
          isArchived: row.is_archived === 1,
          assignmentCount: canReadAssignments
            ? (countsForRole?.assignments ?? 0)
            : 0,
          assignedAccountUserIds: canReadAssignments
            ? parseAssignedAccountUserIds(countsForRole?.assignment_user_ids)
            : [],
          assignmentActions,
          grantCount: countsForRole?.grants ?? 0,
          actions,
          lifecycleActions,
          scopeOptions: canRescope ? projectedScopeOptions : [],
          reorderActions: canReorder
            ? [{ action: ROLE_HIERARCHY_ACTION.REORDER, label: "調整順序" }]
            : [],
        };
      });
    // B-479-02/B-479-12: server-projected creation targets. Admin may
    // create global or scoped definitions; Staff sees only scoped targets
    // inside its effective scope. The explicit scope is revalidated from D1
    // by the Worker; the UI projection is never the authority.
    const createOptions: RoleHierarchyScopeOption[] = [];
    const canCreate = capabilities["role.create"] === true;
    const actor = actorRoles[0];
    if (
      canCreate &&
      category.category_key === ROLE_CATEGORY_KEY.GLOBAL &&
      actor?.stable_key === PROTECTED_STABLE_KEYS.ADMIN
    ) {
      createOptions.push({
        category_key: ROLE_CATEGORY_KEY.GLOBAL,
        scope_kind: ROLE_CATEGORY_KEY.GLOBAL,
        scope_id: null,
        scopeLabel: "全教會",
      });
    }
    if (
      canCreate &&
      category.category_key !== ROLE_CATEGORY_KEY.GLOBAL &&
      (actor?.stable_key === PROTECTED_STABLE_KEYS.ADMIN ||
        actor?.stable_key === PROTECTED_STABLE_KEYS.STAFF)
    ) {
      const scopeIds =
        category.category_key === ROLE_CATEGORY_KEY.DEPARTMENT
          ? [...names.departments.keys()]
          : [...names.programs.keys()];
      for (const scopeId of scopeIds) {
        if (
          !isWithinActorScopeValue(actorRoles, category.category_key, scopeId)
        ) {
          continue;
        }
        createOptions.push({
          category_key: category.category_key,
          scope_kind: category.category_key,
          scope_id: scopeId,
          scopeLabel:
            scopeLabel(category.category_key, scopeId, names) ?? category.label,
        });
      }
    }
    return {
      categoryKey: category.category_key,
      label: category.label,
      description: category.description,
      displayOrder: category.display_order,
      childCount: definitionsView.length,
      definitions: definitionsView,
      createOptions,
    };
  });

  return {
    categories: categoriesView,
    revision,
    caller: {
      userId: actorUserId,
      highestPosition,
    },
  };
}

function isWithinActorScopeValue(
  actorRoles: ActorRoleRow[],
  scopeKind: RoleScopeKind,
  scopeId: string | null
): boolean {
  const highest = actorRoles[0];
  if (!highest) {
    return false;
  }
  if (highest.scope_kind === ROLE_CATEGORY_KEY.GLOBAL) {
    return scopeKind !== ROLE_CATEGORY_KEY.GLOBAL || scopeId === null;
  }
  return (
    highest.scope_kind === scopeKind &&
    highest.scope_id !== null &&
    highest.scope_id === scopeId
  );
}

/**
 * Role-definition management is intentionally limited to the two global
 * system identities. A custom role may carry a copied grant, but it does not
 * become an Admin/Staff authority merely by receiving role.scope.write.
 */
function isEligibleRoleManager(actorRoles: ActorRoleRow[]): boolean {
  const highest = actorRoles[0];
  return (
    highest?.stable_key === PROTECTED_STABLE_KEYS.ADMIN ||
    highest?.stable_key === PROTECTED_STABLE_KEYS.STAFF
  );
}

/** Project every concrete destination this actor may choose in the UI. */
function scopeOptionsForActor(
  actorRoles: ActorRoleRow[],
  names: ScopeNames
): RoleHierarchyScopeOption[] {
  const highest = actorRoles[0];
  if (!highest || !isEligibleRoleManager(actorRoles)) {
    return [];
  }
  const options: RoleHierarchyScopeOption[] = [];
  if (highest.stable_key === PROTECTED_STABLE_KEYS.ADMIN) {
    options.push({
      category_key: ROLE_CATEGORY_KEY.GLOBAL,
      scope_kind: ROLE_CATEGORY_KEY.GLOBAL,
      scope_id: null,
      scopeLabel: "全教會",
    });
  }
  for (const scopeId of names.departments.keys()) {
    if (
      isWithinActorScopeValue(actorRoles, ROLE_CATEGORY_KEY.DEPARTMENT, scopeId)
    ) {
      options.push({
        category_key: ROLE_CATEGORY_KEY.DEPARTMENT,
        scope_kind: ROLE_CATEGORY_KEY.DEPARTMENT,
        scope_id: scopeId,
        scopeLabel:
          scopeLabel(ROLE_CATEGORY_KEY.DEPARTMENT, scopeId, names) ?? "部門",
      });
    }
  }
  for (const scopeId of names.programs.keys()) {
    if (
      isWithinActorScopeValue(actorRoles, ROLE_CATEGORY_KEY.PROGRAM, scopeId)
    ) {
      options.push({
        category_key: ROLE_CATEGORY_KEY.PROGRAM,
        scope_kind: ROLE_CATEGORY_KEY.PROGRAM,
        scope_id: scopeId,
        scopeLabel:
          scopeLabel(ROLE_CATEGORY_KEY.PROGRAM, scopeId, names) ?? "課程",
      });
    }
  }
  return options;
}

/**
 * Pick the next valid global-order position in the destination category.
 * The anchors are never moved or crossed: active definitions occupy the
 * interval strictly after Staff and strictly before 會友基礎.
 */
async function nextRolePosition(
  db: D1Database,
  categoryKey: RoleCategoryKey,
  excludedRoleDefinitionId: string
): Promise<number> {
  const [anchorRows, activeRows] = await Promise.all([
    db
      .prepare(
        `SELECT stable_key, position FROM role_definitions
          WHERE stable_key IN (?, ?, ?)`
      )
      .bind(
        PROTECTED_STABLE_KEYS.ADMIN,
        PROTECTED_STABLE_KEYS.STAFF,
        PROTECTED_STABLE_KEYS.MEMBER
      )
      .all<{ stable_key: string; position: number }>(),
    db
      .prepare(
        `SELECT role_definition_id, category_key, position
           FROM role_definitions
          WHERE is_archived = 0 AND role_definition_id <> ?`
      )
      .bind(excludedRoleDefinitionId)
      .all<{
        role_definition_id: string;
        category_key: RoleCategoryKey;
        position: number;
      }>(),
  ]);
  const anchors = new Map(
    (anchorRows.results ?? []).map((row) => [row.stable_key, row.position])
  );
  const adminPosition = anchors.get(PROTECTED_STABLE_KEYS.ADMIN) ?? 0;
  const staffPosition = anchors.get(PROTECTED_STABLE_KEYS.STAFF) ?? 1;
  const memberPosition = anchors.get(PROTECTED_STABLE_KEYS.MEMBER) ?? 999;
  const lowerBound = Math.max(adminPosition + 1, staffPosition + 1);
  const upperBound = memberPosition - 1;
  if (lowerBound > upperBound) {
    throw new RoleInvalidParentError();
  }

  const rows = activeRows.results ?? [];
  const used = new Set(rows.map((row) => row.position));
  const categoryPositions = rows
    .filter(
      (row) =>
        row.category_key === categoryKey &&
        row.position >= lowerBound &&
        row.position <= upperBound
    )
    .map((row) => row.position);
  let candidate =
    categoryPositions.length > 0
      ? Math.max(...categoryPositions) + 1
      : lowerBound;
  candidate = Math.max(candidate, lowerBound);
  while (candidate <= upperBound && used.has(candidate)) {
    candidate += 1;
  }
  if (candidate <= upperBound) {
    return candidate;
  }
  // A sparse/legacy layout may leave a gap below the baseline anchor.
  for (let position = lowerBound; position <= upperBound; position += 1) {
    if (!used.has(position)) {
      return position;
    }
  }
  throw new RoleInvalidParentError();
}

/**
 * Scope rule (Spec 091 §4.5/§5.2): a Department actor may manage a
 * Program-scoped target when that Program belongs to the same Department;
 * other scoped targets still require an exact scope match.
 */
function isWithinActorScope(
  actorRoles: ActorRoleRow[],
  target: RoleDefinitionRow
): boolean {
  const highest = actorRoles[0];
  if (
    highest?.scope_kind === ROLE_CATEGORY_KEY.DEPARTMENT &&
    target.scope_kind === ROLE_CATEGORY_KEY.PROGRAM
  ) {
    return target.parent_department_id === highest.scope_id;
  }
  return isWithinActorScopeValue(
    actorRoles,
    target.scope_kind,
    target.scope_id
  );
}

/**
 * Canonical name normalization (Spec 091 §8.2): trim, Unicode NFC
 * normalization, then case folding. Used for both collision detection and
 * the canonical rename fingerprint; display labels are stored verbatim
 * (trimmed only) so the operator's chosen casing/spelling is preserved.
 */
export function normalizeName(label: string): string {
  return label.trim().normalize("NFC").toLowerCase();
}

/**
 * Canonical rename fingerprint computed server-side from the request
 * semantics (Spec 091 §11 / H-13): role ID, base revision, normalized name.
 * The client-supplied `request_fingerprint` is never authoritative, so a
 * key reused with a different change cannot replay a false result.
 */
export function canonicalRenameFingerprint(input: {
  actor_user_id: string;
  role_definition_id: string;
  base_revision: number;
  label: string;
}): string {
  return `rename|${input.actor_user_id}|${input.role_definition_id}|${input.base_revision}|${normalizeName(input.label)}`;
}
/**
 * Canonical scope fingerprint computed from the requested semantics. The
 * destination category is derived from scope_kind, so an optional client
 * category echo cannot create a second meaning for the same request.
 */
export function canonicalRescopeFingerprint(input: {
  actor_user_id: string;
  role_definition_id: string;
  base_revision: number;
  scope_kind: RoleScopeKind;
  scope_id: string | null;
}): string {
  return `rescope|${input.actor_user_id}|${input.role_definition_id}|${input.base_revision}|${input.scope_kind}|${input.scope_id ?? "global"}`;
}

/** Rename eligibility is recomputed here from D1 (H-16: UI is not authority). */
async function assertRenameEligible(
  db: D1Database,
  actorUserId: string,
  target: RoleDefinitionRow
): Promise<void> {
  // Spec 091 §10 order: capability first (ROLE_FORBIDDEN), then the
  // protected Admin / 會友基礎 locks (H-08), then self/highest/scope.
  const capabilities = await resolveActorCapabilities(db, actorUserId);
  if (!capabilities["role.name.write"]) {
    throw new RoleCapabilityDeniedError();
  }
  const actorRoles = await loadActorRoles(db, actorUserId);
  const highestPosition =
    actorRoles.length > 0
      ? (actorRoles[0]?.position ?? Number.POSITIVE_INFINITY)
      : Number.POSITIVE_INFINITY;
  // Archived definitions remain historical records but are no longer mutable.
  // The Worker maps this stable lifecycle failure to ROLE_ARCHIVED.
  if (target.is_archived === 1) {
    throw new RoleArchivedError();
  }

  // H-08: Admin and 會友基礎 are locked for every actor. Staff is a
  // protected-by-position system identity but remains renameable by an
  // eligible higher actor (Spec 091 §4.2 / §9.2).
  if (target.stable_key === PROTECTED_STABLE_KEYS.ADMIN) {
    throw new RoleAdminProtectedError();
  }
  if (target.stable_key === PROTECTED_STABLE_KEYS.MEMBER) {
    throw new RoleBaselineProtectedError();
  }
  if (target.is_protected === 1) {
    // Any other protected row (future system identity) stays hard-locked.
    throw new RoleProtectedIdentityError();
  }
  // H-14: an actor cannot rename its own highest assigned identity
  // (Spec 091 §5.1); lower identities the actor also holds stay manageable.
  if (actorRoles[0]?.role_definition_id === target.role_definition_id) {
    throw new RoleSelfRenameError();
  }
  // H-09: the target must sit strictly below the actor's highest identity.
  if (target.position <= highestPosition) {
    throw new RoleHighestProtectedError();
  }
  // H-10: scoped actors cannot manage targets outside their scope.
  if (!isWithinActorScope(actorRoles, target)) {
    throw new RoleScopeMismatchError();
  }
}

async function findRoleDefinition(
  db: D1Database,
  roleDefinitionId: string
): Promise<RoleDefinitionRow | null> {
  return db
    .prepare(
      `SELECT role_definition_id, stable_key, label, description,
              category_key, scope_kind, scope_id,
              (
                SELECT p.department_id
                  FROM programs p
                 WHERE p.program_id = role_definitions.scope_id
                   AND role_definitions.scope_kind = 'Program'
              ) AS parent_department_id,
              position, is_protected, is_archived
         FROM role_definitions WHERE role_definition_id = ?`
    )
    .bind(roleDefinitionId)
    .first<RoleDefinitionRow>();
}

/**
 * Rename one lower Role Definition (H-05). The D1 batch in
 * `applyRoleMutation` commits the label change, the immutable audit row,
 * and the terminal idempotency row atomically; replay returns the original
 * result (H-06). Stable ID, assignments, order position, scope, and grants
 * are untouched by design (the batch only writes label/description).
 */
export async function renameRoleDefinition(
  db: D1Database,
  input: RoleRenameInput
): Promise<RoleRenameResult> {
  // H-11: name validation happens before any D1 write or audit row
  // (Spec 091 §9.3): trimmed, non-empty, ≤ ROLE_NAME_MAX_LENGTH. The
  // canonical uniqueness check below re-validates the normalized form.
  const label = input.label.trim();
  const normalizedLabel = normalizeName(label);
  if (normalizedLabel.length === 0 || label.length > ROLE_NAME_MAX_LENGTH) {
    throw new RoleInvalidNameError();
  }

  const target = await findRoleDefinition(db, input.role_definition_id);
  if (!target) {
    throw new RoleTargetNotFoundError();
  }

  const oldName = target.label;
  const newName = label;

  // Recompute every authority rule from D1 before any write (Spec 091 §10);
  // each rejection records the documented DENIED audit row.
  try {
    await assertRenameEligible(db, input.actor_user_id, target);
  } catch (error) {
    const isDenied =
      error instanceof RoleCapabilityDeniedError ||
      error instanceof RoleAdminProtectedError ||
      error instanceof RoleBaselineProtectedError ||
      error instanceof RoleProtectedIdentityError ||
      error instanceof RoleSelfRenameError ||
      error instanceof RoleHighestProtectedError ||
      error instanceof RoleScopeMismatchError;
    if (isDenied || error instanceof RoleArchivedError) {
      await recordRoleDenialForRename(db, {
        actor_user_id: input.actor_user_id,
        role_definition_id: input.role_definition_id,
        now: input.now,
        audit_id: input.audit_id,
        correlation_id: input.correlation_id,
        old_label: oldName,
        new_label: newName,
        outcome: error instanceof RoleArchivedError ? "REJECTED" : "DENIED",
        reason:
          error instanceof RoleArchivedError ? "ROLE_ARCHIVED" : error.name,
      });
    }
    throw error;
  }

  const normalizedNew = normalizeName(newName);
  if (normalizedNew !== normalizeName(oldName)) {
    const candidates = await db
      .prepare(
        `SELECT role_definition_id, label FROM role_definitions
          WHERE role_definition_id <> ?`
      )
      .bind(input.role_definition_id)
      .all<{ role_definition_id: string; label: string }>();
    const collision = (candidates.results ?? []).some(
      (row) => normalizeName(row.label) === normalizedNew
    );
    if (collision) {
      await recordRoleDenialForRename(db, {
        actor_user_id: input.actor_user_id,
        role_definition_id: input.role_definition_id,
        now: input.now,
        audit_id: input.audit_id,
        correlation_id: input.correlation_id,
        old_label: oldName,
        new_label: newName,
        outcome: "REJECTED",
        reason: "ROLE_NAME_TAKEN",
      });
      throw new RoleNameConflictError();
    }
  }

  // The canonical fingerprint is computed server-side from the request
  // semantics (H-13): a client-supplied fingerprint is never the authority,
  // so a key reused with a different change returns ROLE_IDEMPOTENCY_REUSE
  // instead of replaying a false result.
  const fingerprint = canonicalRenameFingerprint({
    actor_user_id: input.actor_user_id,
    role_definition_id: input.role_definition_id,
    base_revision: input.base_revision,
    label: newName,
  });

  // H-05/H-15 audit evidence: the immutable SUCCESS row carries the actor
  // (actor_user_id), old/new names (old/new_value_json), the base revision,
  // the resulting revision (base + 1 is deterministic under the revision
  // gate), and the idempotency key (reason field).
  const baseRevision = input.base_revision;
  const auditReason = `base=${baseRevision};new=${baseRevision + 1};idem=${input.idempotency_key}`;

  try {
    const result = await applyRoleMutation(db, {
      idempotency_key: input.idempotency_key,
      request_fingerprint: fingerprint,
      actor_user_id: input.actor_user_id,
      base_revision: input.base_revision,
      now: input.now,
      audit_id: input.audit_id,
      correlation_id: input.correlation_id,
      desired: [
        {
          kind: "rename_role_definition",
          role_definition_id: input.role_definition_id,
          label: newName,
        },
      ],
      audit_summary: {
        action: "ROLE_DEFINITION_RENAME",
        entity_type: "role_definition",
        entity_id: input.role_definition_id,
        reason: auditReason,
        old_value_json: JSON.stringify({ label: oldName }),
        new_value_json: JSON.stringify({ label: newName }),
      },
    });
    return {
      roleDefinitionId: input.role_definition_id,
      label: newName,
      revision: result.resulting_revision,
      idempotent: result.idempotent,
    };
  } catch (error) {
    if (error instanceof RoleRevisionConflictError && !error.auditWritten) {
      // Preflight stale revisions do not create a ledger row, so they still
      // need one conflict audit. A raced batch already writes its immutable
      // conflict audit atomically and must not be duplicated here.
      await recordRoleDenialForRename(db, {
        actor_user_id: input.actor_user_id,
        role_definition_id: input.role_definition_id,
        now: input.now,
        audit_id: input.audit_id,
        correlation_id: input.correlation_id,
        old_label: oldName,
        new_label: newName,
        outcome: "CONFLICT",
        reason: `ROLE_REVISION_CONFLICT:current=${error.currentRevision}`,
      });
    }
    if (error instanceof RoleIdempotencyConflictError) {
      // H-13: a key already used for a different change is rejected and
      // recorded as the documented immutable REJECTED audit row; no
      // domain row is written (the batch never ran).
      await recordRoleDenialForRename(db, {
        actor_user_id: input.actor_user_id,
        role_definition_id: input.role_definition_id,
        now: input.now,
        audit_id: input.audit_id,
        correlation_id: input.correlation_id,
        old_label: oldName,
        new_label: newName,
        outcome: "REJECTED",
        reason: "ROLE_IDEMPOTENCY_REUSE",
      });
    }
    throw error;
  }
}

/** Insert a DENIED/CONFLICT/REJECTED audit row for a rejected rename. */
export async function recordRoleDenialForRename(
  db: D1Database,
  input: {
    actor_user_id: string;
    role_definition_id: string;
    now: string;
    audit_id: string;
    correlation_id: string;
    old_label: string | null;
    new_label: string | null;
    outcome: Exclude<RoleAuditOutcome, "SUCCESS" | "DUPLICATE">;
    reason: string;
  }
): Promise<void> {
  await recordRoleDenial(db, {
    audit_id: input.audit_id,
    inserted_at: input.now,
    actor_user_id: input.actor_user_id,
    action: "ROLE_DEFINITION_RENAME",
    entity_type: "role_definition",
    entity_id: input.role_definition_id,
    old_value_json:
      input.old_label === null
        ? null
        : JSON.stringify({ label: input.old_label }),
    new_value_json:
      input.new_label === null
        ? null
        : JSON.stringify({ label: input.new_label }),
    reason: input.reason,
    outcome: input.outcome,
    correlation_id: input.correlation_id,
  });
}

/** Generic DENIED/CONFLICT/REJECTED audit row for a rejected #479 mutation. */
export async function recordRoleDenialForCreate(
  db: D1Database,
  input: {
    actor_user_id: string;
    now: string;
    audit_id: string;
    correlation_id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    reason: string;
    outcome: Exclude<RoleAuditOutcome, "SUCCESS" | "DUPLICATE">;
    old_value_json?: string | null;
    new_value_json?: string | null;
  }
): Promise<void> {
  await recordRoleDenial(db, {
    audit_id: input.audit_id,
    inserted_at: input.now,
    actor_user_id: input.actor_user_id,
    action: input.action,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    old_value_json: input.old_value_json ?? null,
    new_value_json: input.new_value_json ?? null,
    reason: input.reason,
    outcome: input.outcome,
    correlation_id: input.correlation_id,
  });
}

/** Canonical create fingerprint (B-479-16): actor, category, normalized name, scope. */
export function canonicalCreateFingerprint(input: {
  actor_user_id: string;
  category_key: string;
  base_revision: number;
  label: string;
  scope_kind: string;
  scope_id: string | null;
}): string {
  return `create|${input.actor_user_id}|${input.category_key}|${input.scope_kind}|${input.scope_id ?? "global"}|${input.base_revision}|${normalizeName(input.label)}`;
}

/** Canonical reorder fingerprint (B-479-16): actor, category, targets, base revision. */
export function canonicalReorderFingerprint(input: {
  actor_user_id: string;
  category_key: string;
  base_revision: number;
  targets: readonly { role_definition_id: string; position: number }[];
}): string {
  const targets = input.targets
    .map((target) => `${target.role_definition_id}:${target.position}`)
    .sort()
    .join(",");
  return `reorder|${input.actor_user_id}|${input.category_key}|${input.base_revision}|${targets}`;
}

/**
 * #479 scope authority (Spec 091 §5.1/§5.2/§9.2): change one lower Role
 * Definition's explicit scope and fixed parent atomically. Admin may choose
 * Global or any existing Department/Program; Staff may choose only an
 * existing Department/Program inside its effective scope.
 */
export async function rescopeRoleDefinition(
  db: D1Database,
  input: RoleRescopeInput
): Promise<RoleRescopeResult> {
  const categoryKey =
    input.scope_kind === ROLE_CATEGORY_KEY.GLOBAL ||
    input.scope_kind === ROLE_CATEGORY_KEY.DEPARTMENT ||
    input.scope_kind === ROLE_CATEGORY_KEY.PROGRAM
      ? input.scope_kind
      : null;
  if (categoryKey === null) {
    throw new RoleInvalidParentError();
  }
  const target = await findRoleDefinition(db, input.role_definition_id);
  if (!target) {
    throw new RoleTargetNotFoundError();
  }
  const recordValidationRejection = async (error: Error): Promise<never> => {
    await recordRoleDenialForCreate(db, {
      actor_user_id: input.actor_user_id,
      now: input.now,
      audit_id: input.audit_id,
      correlation_id: input.correlation_id,
      action: "ROLE_DEFINITION_RESCOPE",
      entity_type: "role_definition",
      entity_id: input.role_definition_id,
      old_value_json: JSON.stringify({
        category_key: target.category_key,
        scope_kind: target.scope_kind,
        scope_id: target.scope_id,
        position: target.position,
      }),
      new_value_json: JSON.stringify({
        category_key: input.category_key ?? null,
        scope_kind: input.scope_kind,
        scope_id: input.scope_id,
      }),
      reason: error.message.split(":", 1)[0] ?? error.name,
      outcome: "REJECTED",
    });
    throw error;
  };
  if (input.category_key !== undefined && input.category_key !== categoryKey) {
    return recordValidationRejection(new RoleInvalidParentError());
  }
  if (categoryKey === ROLE_CATEGORY_KEY.GLOBAL) {
    if (input.scope_id !== null) {
      return recordValidationRejection(new RoleScopeRequiredError());
    }
  } else if (
    typeof input.scope_id !== "string" ||
    input.scope_id.length === 0
  ) {
    return recordValidationRejection(new RoleScopeRequiredError());
  }

  const oldValue = {
    category_key: target.category_key,
    scope_kind: target.scope_kind,
    scope_id: target.scope_id,
    position: target.position,
  };
  const requestedValue = {
    category_key: categoryKey,
    scope_kind: input.scope_kind,
    scope_id: input.scope_id,
  };
  const recordDenial = async (
    error: Error,
    outcome: "DENIED" | "REJECTED" = "DENIED"
  ): Promise<never> => {
    await recordRoleDenialForCreate(db, {
      actor_user_id: input.actor_user_id,
      now: input.now,
      audit_id: input.audit_id,
      correlation_id: input.correlation_id,
      action: "ROLE_DEFINITION_RESCOPE",
      entity_type: "role_definition",
      entity_id: input.role_definition_id,
      old_value_json: JSON.stringify(oldValue),
      new_value_json: JSON.stringify(requestedValue),
      reason: error.message.split(":", 1)[0] ?? error.name,
      outcome,
    });
    throw error;
  };

  const fingerprint = canonicalRescopeFingerprint({
    actor_user_id: input.actor_user_id,
    role_definition_id: input.role_definition_id,
    base_revision: input.base_revision,
    scope_kind: categoryKey,
    scope_id: input.scope_id,
  });

  // A response-loss replay must return the original destination/position
  // before current authority checks can reject the now-updated target.
  const existingReplay = await db
    .prepare(
      `SELECT request_fingerprint, actor_user_id, outcome,
              resulting_revision
         FROM role_policy_mutations
        WHERE idempotency_key = ?`
    )
    .bind(input.idempotency_key)
    .first<{
      request_fingerprint: string;
      actor_user_id: string;
      outcome: string;
      resulting_revision: number | null;
    }>();
  if (existingReplay) {
    if (
      existingReplay.actor_user_id !== input.actor_user_id ||
      existingReplay.request_fingerprint !== fingerprint
    ) {
      await recordRoleDenialForCreate(db, {
        actor_user_id: input.actor_user_id,
        now: input.now,
        audit_id: input.audit_id,
        correlation_id: input.correlation_id,
        action: "ROLE_DEFINITION_RESCOPE",
        entity_type: "role_definition",
        entity_id: input.role_definition_id,
        old_value_json: JSON.stringify(oldValue),
        new_value_json: JSON.stringify(requestedValue),
        reason: "ROLE_IDEMPOTENCY_REUSE",
        outcome: "REJECTED",
      });
      throw new RoleIdempotencyConflictError();
    }
    if (existingReplay.outcome === "SUCCESS") {
      const audit = await db
        .prepare(
          `SELECT new_value_json
             FROM role_audit_events
            WHERE action = 'ROLE_DEFINITION_RESCOPE'
              AND entity_type = 'role_definition'
              AND entity_id = ?
              AND outcome = 'SUCCESS'
              AND instr(COALESCE(reason, ''), ?) > 0
            ORDER BY inserted_at DESC
            LIMIT 1`
        )
        .bind(input.role_definition_id, `idem=${input.idempotency_key}`)
        .first<{ new_value_json: string | null }>();
      let saved: {
        category_key?: unknown;
        scope_kind?: unknown;
        scope_id?: unknown;
        position?: unknown;
      } = {};
      if (audit?.new_value_json) {
        try {
          saved = JSON.parse(audit.new_value_json) as typeof saved;
        } catch {
          saved = {};
        }
      }
      const savedCategory =
        saved.category_key === ROLE_CATEGORY_KEY.GLOBAL ||
        saved.category_key === ROLE_CATEGORY_KEY.DEPARTMENT ||
        saved.category_key === ROLE_CATEGORY_KEY.PROGRAM
          ? saved.category_key
          : target.category_key;
      const savedScopeKind =
        saved.scope_kind === ROLE_CATEGORY_KEY.GLOBAL ||
        saved.scope_kind === ROLE_CATEGORY_KEY.DEPARTMENT ||
        saved.scope_kind === ROLE_CATEGORY_KEY.PROGRAM
          ? saved.scope_kind
          : target.scope_kind;
      const savedScopeId =
        saved.scope_id === null || typeof saved.scope_id === "string"
          ? saved.scope_id
          : target.scope_id;
      const savedPosition =
        typeof saved.position === "number" ? saved.position : target.position;
      return {
        roleDefinitionId: input.role_definition_id,
        categoryKey: savedCategory,
        scopeKind: savedScopeKind,
        scopeId: savedScopeId,
        position: savedPosition,
        revision: existingReplay.resulting_revision ?? input.base_revision,
        idempotent: true,
      };
    }
  }

  const capabilities = await resolveActorCapabilities(db, input.actor_user_id);
  if (!capabilities["role.scope.write"]) {
    return recordDenial(new RoleCapabilityDeniedError());
  }
  const actorRoles = await loadActorRoles(db, input.actor_user_id);
  if (!isEligibleRoleManager(actorRoles)) {
    return recordDenial(new RoleCapabilityDeniedError());
  }
  const highestPosition =
    actorRoles.length > 0
      ? (actorRoles[0]?.position ?? Number.POSITIVE_INFINITY)
      : Number.POSITIVE_INFINITY;
  if (target.is_archived === 1) {
    return recordDenial(new RoleArchivedError(), "REJECTED");
  }
  if (target.stable_key === PROTECTED_STABLE_KEYS.ADMIN) {
    return recordDenial(new RoleAdminProtectedError());
  }
  if (target.stable_key === PROTECTED_STABLE_KEYS.MEMBER) {
    return recordDenial(new RoleBaselineProtectedError());
  }
  if (target.is_protected === 1) {
    return recordDenial(new RoleProtectedIdentityError());
  }
  if (
    target.role_definition_id === actorRoles[0]?.role_definition_id ||
    target.position <= highestPosition
  ) {
    return recordDenial(new RoleHighestProtectedError());
  }
  if (!isWithinActorScope(actorRoles, target)) {
    return recordDenial(new RoleScopeMismatchError());
  }
  // Staff has a global system assignment but its scope-edit contract is
  // intentionally scoped-only; Admin is the only actor that may choose Global.
  if (
    actorRoles[0]?.stable_key === PROTECTED_STABLE_KEYS.STAFF &&
    categoryKey === ROLE_CATEGORY_KEY.GLOBAL
  ) {
    return recordDenial(new RoleScopeMismatchError());
  }
  if (!isWithinActorScopeValue(actorRoles, categoryKey, input.scope_id)) {
    return recordDenial(new RoleScopeMismatchError());
  }

  const category = await db
    .prepare(`SELECT category_key FROM role_categories WHERE category_key = ?`)
    .bind(categoryKey)
    .first<{ category_key: RoleCategoryKey }>();
  if (!category) {
    return recordDenial(new RoleInvalidParentError(), "REJECTED");
  }
  if (categoryKey === ROLE_CATEGORY_KEY.DEPARTMENT) {
    const scope = await db
      .prepare(`SELECT 1 FROM departments WHERE department_id = ?`)
      .bind(input.scope_id)
      .first();
    if (!scope) {
      return recordDenial(new RoleInvalidParentError(), "REJECTED");
    }
  }
  if (categoryKey === ROLE_CATEGORY_KEY.PROGRAM) {
    const scope = await db
      .prepare(`SELECT 1 FROM programs WHERE program_id = ?`)
      .bind(input.scope_id)
      .first();
    if (!scope) {
      return recordDenial(new RoleInvalidParentError(), "REJECTED");
    }
  }

  let position: number;
  try {
    position = await nextRolePosition(
      db,
      categoryKey,
      input.role_definition_id
    );
  } catch (error) {
    if (error instanceof RoleInvalidParentError) {
      return recordDenial(error, "REJECTED");
    }
    throw error;
  }
  const baseRevision = input.base_revision;
  const auditReason = `base=${baseRevision};new=${baseRevision + 1};idem=${input.idempotency_key}`;
  const newValue = {
    ...requestedValue,
    position,
  };
  try {
    const result = await applyRoleMutation(db, {
      idempotency_key: input.idempotency_key,
      request_fingerprint: fingerprint,
      actor_user_id: input.actor_user_id,
      base_revision: input.base_revision,
      now: input.now,
      audit_id: input.audit_id,
      correlation_id: input.correlation_id,
      desired: [
        {
          kind: "rescope_role_definition",
          role_definition_id: input.role_definition_id,
          category_key: categoryKey,
          scope_kind: input.scope_kind,
          scope_id: input.scope_id,
          position,
        },
      ],
      audit_summary: {
        action: "ROLE_DEFINITION_RESCOPE",
        entity_type: "role_definition",
        entity_id: input.role_definition_id,
        reason: auditReason,
        old_value_json: JSON.stringify(oldValue),
        new_value_json: JSON.stringify(newValue),
      },
    });
    return {
      roleDefinitionId: input.role_definition_id,
      categoryKey,
      scopeKind: input.scope_kind,
      scopeId: input.scope_id,
      position,
      revision: result.resulting_revision,
      idempotent: result.idempotent,
    };
  } catch (error) {
    if (error instanceof RoleRevisionConflictError && !error.auditWritten) {
      await recordRoleDenialForCreate(db, {
        actor_user_id: input.actor_user_id,
        now: input.now,
        audit_id: input.audit_id,
        correlation_id: input.correlation_id,
        action: "ROLE_DEFINITION_RESCOPE",
        entity_type: "role_definition",
        entity_id: input.role_definition_id,
        old_value_json: JSON.stringify(oldValue),
        new_value_json: JSON.stringify(newValue),
        reason: `ROLE_REVISION_CONFLICT:current=${error.currentRevision}`,
        outcome: "CONFLICT",
      });
    }
    if (error instanceof RoleIdempotencyConflictError) {
      await recordRoleDenialForCreate(db, {
        actor_user_id: input.actor_user_id,
        now: input.now,
        audit_id: input.audit_id,
        correlation_id: input.correlation_id,
        action: "ROLE_DEFINITION_RESCOPE",
        entity_type: "role_definition",
        entity_id: input.role_definition_id,
        old_value_json: JSON.stringify(oldValue),
        new_value_json: JSON.stringify(newValue),
        reason: "ROLE_IDEMPOTENCY_REUSE",
        outcome: "REJECTED",
      });
    }
    throw error;
  }
}

/**
 * #479 create authority (B-479-01/B-479-02/B-479-14): every rule is
 * recomputed from D1. Admin may create global or scoped definitions; Staff
 * may create scoped definitions only under a permitted fixed category it
 * holds below Staff. New definitions start Active, zero-grant, globally
 * unique-named, with one explicit scope when scoped, and land on the
 * authoritative order revision.
 */
export async function createRoleDefinition(
  db: D1Database,
  input: RoleCreateInput
): Promise<RoleCreateResult> {
  const label = input.label.trim();
  const normalizedLabel = normalizeName(label);
  if (normalizedLabel.length === 0 || label.length > ROLE_NAME_MAX_LENGTH) {
    throw new RoleInvalidNameError();
  }
  const auditEntityId = `key:${input.idempotency_key}`;
  const recordDenial = async (
    error: Error,
    outcome: "DENIED" | "REJECTED" = "DENIED"
  ): Promise<never> => {
    await recordRoleDenialForCreate(db, {
      actor_user_id: input.actor_user_id,
      now: input.now,
      audit_id: input.audit_id,
      correlation_id: input.correlation_id,
      action: "ROLE_DEFINITION_CREATE",
      entity_type: "role_definition",
      entity_id: auditEntityId,
      reason: error.message.split(":", 1)[0] ?? error.name,
      outcome,
      new_value_json: JSON.stringify({
        category_key: input.category_key,
        label,
        description: input.description.trim(),
        scope_kind: input.scope_kind,
        scope_id: input.scope_id,
      }),
    });
    throw error;
  };
  // B-479-16/B-479-17: a replay of the same canonical payload returns the
  // original authoritative result before the name-collision/authority
  // checks — the first attempt already committed server-side. A key reused
  // with a different canonical payload is rejected with the documented
  // REJECTED audit row (the batch never runs).
  const fingerprint = canonicalCreateFingerprint({
    actor_user_id: input.actor_user_id,
    category_key: input.category_key,
    base_revision: input.base_revision,
    label,
    scope_kind: input.scope_kind,
    scope_id: input.scope_id,
  });
  const existingReplay = await db
    .prepare(
      `SELECT idempotency_key, request_fingerprint, actor_user_id,
              outcome, resulting_revision
         FROM role_policy_mutations
        WHERE idempotency_key = ?`
    )
    .bind(input.idempotency_key)
    .first<{
      idempotency_key: string;
      request_fingerprint: string;
      actor_user_id: string;
      outcome: string;
      resulting_revision: number | null;
    }>();
  if (existingReplay) {
    if (
      existingReplay.actor_user_id !== input.actor_user_id ||
      existingReplay.request_fingerprint !== fingerprint
    ) {
      await recordRoleDenialForCreate(db, {
        actor_user_id: input.actor_user_id,
        now: input.now,
        audit_id: input.audit_id,
        correlation_id: input.correlation_id,
        action: "ROLE_DEFINITION_CREATE",
        entity_type: "role_definition",
        entity_id: `key:${input.idempotency_key}`,
        reason: "ROLE_IDEMPOTENCY_REUSE",
        outcome: "REJECTED",
      });
      throw new RoleIdempotencyConflictError();
    }
    if (existingReplay.outcome === "SUCCESS") {
      // The immutable audit row for the original create embeds the
      // idempotency key in `reason` (`idem=<key>`) and carries the created
      // Role Definition ID as entity_id; replay returns that original
      // authoritative result.
      const created = await db
        .prepare(
          `SELECT rd.role_definition_id, rd.category_key, rd.label,
                  rd.scope_kind, rd.scope_id, rd.position
             FROM role_audit_events ae
             JOIN role_definitions rd
               ON rd.role_definition_id = ae.entity_id
            WHERE ae.action = 'ROLE_DEFINITION_CREATE'
              AND ae.outcome = 'SUCCESS'
              AND ae.reason LIKE ?
            ORDER BY ae.inserted_at DESC
            LIMIT 1`
        )
        .bind(`%idem=${input.idempotency_key}%`)
        .first<{
          role_definition_id: string;
          category_key: string;
          label: string;
          scope_kind: string;
          scope_id: string | null;
          position: number;
        }>();
      if (created) {
        return {
          roleDefinitionId: created.role_definition_id,
          categoryKey: created.category_key as RoleCategoryKey,
          label: created.label,
          scopeKind: created.scope_kind as RoleScopeKind,
          scopeId: created.scope_id,
          position: created.position,
          revision: existingReplay.resulting_revision ?? input.base_revision,
          idempotent: true,
        };
      }
    }
  }
  if (
    input.scope_kind === ROLE_CATEGORY_KEY.GLOBAL &&
    input.scope_id !== null
  ) {
    return recordDenial(new RoleScopeRequiredError(), "REJECTED");
  }
  if (
    input.scope_kind !== ROLE_CATEGORY_KEY.GLOBAL &&
    (input.scope_id === null || input.scope_id.length === 0)
  ) {
    return recordDenial(new RoleScopeRequiredError(), "REJECTED");
  }
  // A scoped creation must use the fixed Category matching the scope kind
  // (B-479-04: a scoped body without an explicit scope is rejected).
  if (
    input.scope_kind !== ROLE_CATEGORY_KEY.GLOBAL &&
    input.category_key !== input.scope_kind
  ) {
    return recordDenial(new RoleInvalidParentError(), "REJECTED");
  }
  if (
    input.scope_kind === ROLE_CATEGORY_KEY.GLOBAL &&
    input.category_key !== ROLE_CATEGORY_KEY.GLOBAL
  ) {
    return recordDenial(new RoleInvalidParentError(), "REJECTED");
  }

  const capabilities = await resolveActorCapabilities(db, input.actor_user_id);
  if (!capabilities["role.create"]) {
    return recordDenial(new RoleCapabilityDeniedError());
  }
  const actorRoles = await loadActorRoles(db, input.actor_user_id);
  const highestPosition =
    actorRoles.length > 0
      ? (actorRoles[0]?.position ?? Number.POSITIVE_INFINITY)
      : Number.POSITIVE_INFINITY;
  const actor = actorRoles[0];
  if (input.scope_kind === ROLE_CATEGORY_KEY.GLOBAL) {
    // Only Admin (the Global system identity) may create global definitions.
    if (actor?.stable_key !== PROTECTED_STABLE_KEYS.ADMIN) {
      return recordDenial(new RoleCapabilityDeniedError());
    }
  } else {
    // Staff may create scoped definitions only under an existing permitted
    // fixed category. Admin may also create scoped definitions, while custom
    // identities never become create authority by copied grants.
    if (!isEligibleRoleManager(actorRoles)) {
      return recordDenial(new RoleCapabilityDeniedError());
    }
    if (
      !isWithinActorScopeValue(actorRoles, input.scope_kind, input.scope_id)
    ) {
      return recordDenial(new RoleScopeMismatchError());
    }
    const table =
      input.scope_kind === ROLE_CATEGORY_KEY.DEPARTMENT
        ? "departments"
        : "programs";
    const scopeColumn =
      input.scope_kind === ROLE_CATEGORY_KEY.DEPARTMENT
        ? "department_id"
        : "program_id";
    const scopeExists = await db
      .prepare(`SELECT 1 FROM ${table} WHERE ${scopeColumn} = ?`)
      .bind(input.scope_id)
      .first();
    if (!scopeExists) {
      return recordDenial(new RoleInvalidParentError(), "REJECTED");
    }
  }

  // Globally unique normalized name (B-479-03/B-479-04).
  const candidates = await db
    .prepare(`SELECT label FROM role_definitions`)
    .all<{ label: string }>();
  const collision = (candidates.results ?? []).some(
    (row) => normalizeName(row.label) === normalizedLabel
  );
  if (collision) {
    await recordRoleDenialForCreate(db, {
      actor_user_id: input.actor_user_id,
      now: input.now,
      audit_id: input.audit_id,
      correlation_id: input.correlation_id,
      action: "ROLE_DEFINITION_CREATE",
      entity_type: "role_definition",
      entity_id: `name:${normalizedLabel}`,
      reason: "ROLE_NAME_TAKEN",
      outcome: "REJECTED",
      new_value_json: JSON.stringify({ label }),
    });
    throw new RoleNameConflictError();
  }

  // Keep every new definition inside the authoritative interval between the
  // Staff and 會友基礎 anchors. Global definitions therefore land above the
  // pinned baseline instead of after it.
  let nextPosition: number;
  try {
    nextPosition = await nextRolePosition(
      db,
      input.category_key,
      "__new_role_definition__"
    );
  } catch (error) {
    if (error instanceof RoleInvalidParentError) {
      return recordDenial(error, "REJECTED");
    }
    throw error;
  }
  const roleDefinitionId = crypto.randomUUID();
  const stableKey = `role.${crypto.randomUUID()}`;

  const baseRevision = input.base_revision;
  const auditReason = `base=${baseRevision};new=${baseRevision + 1};idem=${input.idempotency_key}`;
  try {
    const result = await applyRoleMutation(db, {
      idempotency_key: input.idempotency_key,
      request_fingerprint: fingerprint,
      actor_user_id: input.actor_user_id,
      base_revision: input.base_revision,
      now: input.now,
      audit_id: input.audit_id,
      correlation_id: input.correlation_id,
      desired: [
        {
          kind: "create_role_definition",
          role_definition_id: roleDefinitionId,
          category_key: input.category_key,
          stable_key: stableKey,
          label,
          description: input.description.trim(),
          scope_kind: input.scope_kind,
          scope_id: input.scope_id,
          position: nextPosition,
          capabilities: [],
        },
      ],
      audit_summary: {
        action: "ROLE_DEFINITION_CREATE",
        entity_type: "role_definition",
        entity_id: roleDefinitionId,
        reason: auditReason,
        new_value_json: JSON.stringify({
          label,
          category_key: input.category_key,
          scope_kind: input.scope_kind,
          scope_id: input.scope_id,
          position: nextPosition,
        }),
      },
    });
    return {
      roleDefinitionId,
      categoryKey: input.category_key,
      label,
      scopeKind: input.scope_kind,
      scopeId: input.scope_id,
      position: nextPosition,
      revision: result.resulting_revision,
      idempotent: result.idempotent,
    };
  } catch (error) {
    if (error instanceof RoleRevisionConflictError && !error.auditWritten) {
      await recordRoleDenialForCreate(db, {
        actor_user_id: input.actor_user_id,
        now: input.now,
        audit_id: input.audit_id,
        correlation_id: input.correlation_id,
        action: "ROLE_DEFINITION_CREATE",
        entity_type: "role_definition",
        entity_id: roleDefinitionId,
        reason: `ROLE_REVISION_CONFLICT:current=${error.currentRevision}`,
        outcome: "CONFLICT",
      });
    }
    if (error instanceof RoleIdempotencyConflictError) {
      await recordRoleDenialForCreate(db, {
        actor_user_id: input.actor_user_id,
        now: input.now,
        audit_id: input.audit_id,
        correlation_id: input.correlation_id,
        action: "ROLE_DEFINITION_CREATE",
        entity_type: "role_definition",
        entity_id: roleDefinitionId,
        reason: "ROLE_IDEMPOTENCY_REUSE",
        outcome: "REJECTED",
      });
    }
    throw error;
  }
}

/**
 * #479 sibling-only reorder (B-479-07/B-479-08/B-479-10): two sibling Role
 * Definitions inside one fixed Category swap positions. The parent
 * Category, grants, scope, and assignments are untouched by construction.
 * A stale base revision is rejected with the authoritative revision and
 * the authoritative sibling order (ROLE_ORDER_CONFLICT).
 */
export async function reorderRoleDefinitions(
  db: D1Database,
  input: RoleReorderInput
): Promise<RoleReorderResult> {
  const [first, second] = input.targets;
  const auditEntityId =
    first && second
      ? `${first.role_definition_id},${second.role_definition_id}`
      : `key:${input.idempotency_key}`;
  const recordDenial = async (
    error: Error,
    outcome: "DENIED" | "REJECTED" = "DENIED"
  ): Promise<never> => {
    await recordRoleDenialForCreate(db, {
      actor_user_id: input.actor_user_id,
      now: input.now,
      audit_id: input.audit_id,
      correlation_id: input.correlation_id,
      action: "ROLE_DEFINITION_REORDER",
      entity_type: "role_definition",
      entity_id: auditEntityId,
      reason: error.message.split(":", 1)[0] ?? error.name,
      outcome,
      new_value_json:
        JSON.stringify({
          category_key: input.category_key,
          targets: input.targets,
        }) ?? null,
    });
    throw error;
  };
  if (input.targets.length !== 2) {
    return recordDenial(new RoleInvalidParentError(), "REJECTED");
  }
  if (!first || !second) {
    return recordDenial(new RoleInvalidParentError(), "REJECTED");
  }
  const fingerprint = canonicalReorderFingerprint({
    actor_user_id: input.actor_user_id,
    category_key: input.category_key,
    base_revision: input.base_revision,
    targets: input.targets,
  });
  const existingReplay = await db
    .prepare(
      `SELECT request_fingerprint, actor_user_id, outcome,
              resulting_revision
         FROM role_policy_mutations
        WHERE idempotency_key = ?`
    )
    .bind(input.idempotency_key)
    .first<{
      request_fingerprint: string;
      actor_user_id: string;
      outcome: string;
      resulting_revision: number | null;
    }>();
  if (existingReplay) {
    if (
      existingReplay.actor_user_id !== input.actor_user_id ||
      existingReplay.request_fingerprint !== fingerprint
    ) {
      return recordDenial(new RoleIdempotencyConflictError(), "REJECTED");
    }
    if (existingReplay.outcome === "SUCCESS") {
      return {
        categoryKey: input.category_key,
        orderedRoleDefinitionIds: [
          first.role_definition_id,
          second.role_definition_id,
        ],
        revision: existingReplay.resulting_revision ?? input.base_revision,
        idempotent: true,
      };
    }
  }
  // B-479-09: the two targets must be siblings in the same fixed Category
  // and must not be protected anchors.
  const rows = await db
    .prepare(
      `SELECT role_definition_id, stable_key, label, description,
              category_key, scope_kind, scope_id,
              (
                SELECT p.department_id
                  FROM programs p
                 WHERE p.program_id = role_definitions.scope_id
                   AND role_definitions.scope_kind = 'Program'
              ) AS parent_department_id,
              position, is_protected, is_archived
         FROM role_definitions
        WHERE role_definition_id IN (?, ?)`
    )
    .bind(first.role_definition_id, second.role_definition_id)
    .all<RoleDefinitionRow>();
  const byId = new Map(
    (rows.results ?? []).map((row) => [row.role_definition_id, row])
  );
  const firstRow = byId.get(first.role_definition_id);
  const secondRow = byId.get(second.role_definition_id);
  if (!firstRow || !secondRow) {
    return recordDenial(new RoleTargetNotFoundError(), "REJECTED");
  }
  if (
    firstRow.category_key !== input.category_key ||
    secondRow.category_key !== input.category_key ||
    firstRow.category_key !== secondRow.category_key
  ) {
    return recordDenial(new RoleCrossCategoryError(), "REJECTED");
  }
  // The positions must be a swap of the two current sibling positions.
  if (
    first.position !== secondRow.position ||
    second.position !== firstRow.position
  ) {
    return recordDenial(new RoleInvalidParentError(), "REJECTED");
  }
  for (const row of [firstRow, secondRow]) {
    if (row.stable_key === PROTECTED_STABLE_KEYS.ADMIN) {
      return recordDenial(new RoleAdminProtectedError());
    }
    if (row.stable_key === PROTECTED_STABLE_KEYS.MEMBER) {
      return recordDenial(new RoleBaselineProtectedError());
    }
    if (row.is_protected === 1) {
      return recordDenial(new RoleProtectedIdentityError());
    }
    if (row.is_archived === 1) {
      return recordDenial(new RoleArchivedError(), "REJECTED");
    }
  }

  const capabilities = await resolveActorCapabilities(db, input.actor_user_id);
  if (!capabilities["role.reorder"]) {
    return recordDenial(new RoleCapabilityDeniedError());
  }
  const actorRoles = await loadActorRoles(db, input.actor_user_id);
  const highestPosition =
    actorRoles.length > 0
      ? (actorRoles[0]?.position ?? Number.POSITIVE_INFINITY)
      : Number.POSITIVE_INFINITY;
  // B-479-09: the actor's highest identity is never a reorder target, and
  // the targets must be strictly below it and inside the actor's scope.
  for (const row of [firstRow, secondRow]) {
    if (row.position <= highestPosition) {
      return recordDenial(new RoleHighestProtectedError());
    }
    if (actorRoles[0]?.role_definition_id === row.role_definition_id) {
      return recordDenial(new RoleHighestProtectedError());
    }
    if (!isWithinActorScope(actorRoles, row)) {
      return recordDenial(new RoleScopeMismatchError());
    }
  }
  const baseRevision = input.base_revision;
  const auditReason = `base=${baseRevision};new=${baseRevision + 1};idem=${input.idempotency_key}`;

  try {
    const result = await applyRoleMutation(db, {
      idempotency_key: input.idempotency_key,
      request_fingerprint: fingerprint,
      actor_user_id: input.actor_user_id,
      base_revision: input.base_revision,
      now: input.now,
      audit_id: input.audit_id,
      correlation_id: input.correlation_id,
      desired: [
        {
          kind: "reorder_role_definitions",
          category_key: input.category_key,
          targets: input.targets,
        },
      ],
      audit_summary: {
        action: "ROLE_DEFINITION_REORDER",
        entity_type: "role_definition",
        entity_id: auditEntityId,
        reason: auditReason,
        old_value_json: JSON.stringify({
          [first.role_definition_id]: firstRow.position,
          [second.role_definition_id]: secondRow.position,
        }),
        new_value_json: JSON.stringify({
          [first.role_definition_id]: secondRow.position,
          [second.role_definition_id]: firstRow.position,
        }),
      },
    });
    return {
      categoryKey: input.category_key,
      orderedRoleDefinitionIds: [
        first.role_definition_id,
        second.role_definition_id,
      ],
      revision: result.resulting_revision,
      idempotent: result.idempotent,
    };
  } catch (error) {
    if (error instanceof RoleRevisionConflictError) {
      // B-479-10: a stale order revision is rejected with the authoritative
      // revision and the authoritative sibling order. The mutation kernel
      // already owns the conflict audit when auditWritten is true.
      const authoritative = await db
        .prepare(
          `SELECT role_definition_id FROM role_definitions
            WHERE category_key = ? AND is_archived = 0
            ORDER BY position ASC`
        )
        .bind(input.category_key)
        .all<{ role_definition_id: string }>();
      const authoritativeIds =
        (authoritative.results ?? []).map((row) => row.role_definition_id) ??
        [];
      if (!error.auditWritten) {
        await recordRoleDenialForCreate(db, {
          actor_user_id: input.actor_user_id,
          now: input.now,
          audit_id: input.audit_id,
          correlation_id: input.correlation_id,
          action: "ROLE_DEFINITION_REORDER",
          entity_type: "role_definition",
          entity_id: auditEntityId,
          reason: `ROLE_ORDER_CONFLICT:current=${error.currentRevision}`,
          outcome: "CONFLICT",
        });
      }
      throw new RoleOrderConflictError(error.currentRevision, authoritativeIds);
    }
    if (error instanceof RoleIdempotencyConflictError) {
      await recordRoleDenialForCreate(db, {
        actor_user_id: input.actor_user_id,
        now: input.now,
        audit_id: input.audit_id,
        correlation_id: input.correlation_id,
        action: "ROLE_DEFINITION_REORDER",
        entity_type: "role_definition",
        entity_id: auditEntityId,
        reason: "ROLE_IDEMPOTENCY_REUSE",
        outcome: "REJECTED",
      });
    }
    throw error;
  }
}

export const __test = {
  normalizeName,
  canonicalRenameFingerprint,
  canonicalCreateFingerprint,
  canonicalRescopeFingerprint,
  canonicalReorderFingerprint,
  isWithinActorScope,
  isWithinActorScopeValue,
  isEligibleRoleManager,
  roleKind,
};
