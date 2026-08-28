/**
 * #478 — S5-A03 normalized read-only 身份組 hierarchy + one rename mutation
 * (Spec 091, ADR-0042).
 *
 * This module owns the disposable-D1 read projection and the rename
 * authority seam:
 *
 *   * `loadRoleHierarchy()` — the read-only tree: fixed Role Categories
 *     (non-assignable headings), ordered Role Definition summaries, the
 *     protected Admin / 會友基礎 anchors, scope labels, child counts,
 *     protected states, and the server-projected action affordances. The
 *     read is gated on the actor's effective `role.read` capability; the
 *     rename affordance is projected only when `role.name.write` is held.
 *   * `renameRoleDefinition()` — the one complete lower-target mutation:
 *     stable ID, assignments, order position, scope, and grants all
 *     survive; the D1 batch commits domain state, the immutable audit row,
 *     the terminal idempotency row, and the authoritative response
 *     atomically (revision + 1); a replay of the same key + fingerprint
 *     returns the original result.
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
/* oxlint-disable eslint/max-classes-per-file, eslint/no-unused-vars, eslint/no-use-before-define, eslint/prefer-destructuring, eslint/require-await, unicorn/no-lonely-if -- classes mirror the Worker error vocabulary; guards are sequential by design and authority helpers are declared top-down for readability. */
import {
  applyRoleMutation,
  readCurrentRevision,
  recordRoleDenial,
  RoleIdempotencyConflictError,
  RoleRevisionConflictError,
} from "./mutations";
import {
  CAPABILITY_CATALOG,
  PROTECTED_STABLE_KEYS,
  ROLE_CATEGORY_KEY,
} from "./types";
import type { RoleAuditOutcome, RoleCategoryKey, RoleScopeKind } from "./types";

/** Name contract (H-11): trimmed, non-empty, ≤ 60 characters (Spec 091 §8.2). */
export const ROLE_NAME_MAX_LENGTH = 60;

export const ROLE_HIERARCHY_ACTION = {
  RENAME: "rename",
} as const;

export type RoleHierarchyAction =
  (typeof ROLE_HIERARCHY_ACTION)[keyof typeof ROLE_HIERARCHY_ACTION];

/** Server-projected action affordance (H-03). */
export interface RoleHierarchyActionAffordance {
  action: RoleHierarchyAction;
  /** Human-readable Cantonese label the UI may use. */
  label: string;
}

/** One Role Definition summary inside the tree (H-01/H-03). */
export interface RoleHierarchyDefinition {
  roleDefinitionId: string;
  label: string;
  description: string;
  kind: "SYSTEM" | "GLOBAL" | "DEPARTMENT_SCOPED" | "PROGRAM_SCOPED";
  scopeKind: RoleScopeKind;
  scopeId: string | null;
  /** Human-readable scope label; null for Global identities. */
  scopeLabel: string | null;
  position: number;
  isProtected: boolean;
  isArchived: boolean;
  assignmentCount: number;
  grantCount: number;
  /** Server-projected actions per the caller's capabilities (H-03). */
  actions: RoleHierarchyActionAffordance[];
}

/** One fixed Role Category heading (H-01). */
export interface RoleHierarchyCategory {
  categoryKey: RoleCategoryKey;
  label: string;
  description: string;
  displayOrder: number;
  childCount: number;
  definitions: RoleHierarchyDefinition[];
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

interface RoleDefinitionRow {
  role_definition_id: string;
  stable_key: string;
  label: string;
  description: string;
  category_key: RoleCategoryKey;
  scope_kind: RoleScopeKind;
  scope_id: string | null;
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
  grants: number;
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
  categoryKey: RoleCategoryKey
): RoleHierarchyDefinition["kind"] {
  // Every Global-category definition is one of the protected system anchors
  // (Admin / Staff / 會友基礎, Spec 091 §4.2); scoped categories map 1:1.
  if (categoryKey === ROLE_CATEGORY_KEY.GLOBAL) {
    return "SYSTEM";
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
        WHERE ra.account_user_id = ? AND ra.revoked_at IS NULL
        ORDER BY rd.position ASC`
    )
    .bind(actorUserId)
    .all<ActorRoleRow>();
  return rows.results ?? [];
}

/**
 * Effective capability resolution (Spec 091 §4.5/§6.1): Admin holds every
 * `role.*` capability; every other actor's capabilities are the union of
 * grants across their active assignments. The hierarchy/rename surface
 * checks exactly `role.read` (read projection) and `role.name.write`
 * (rename mutation) — never the UI projection.
 */
export async function resolveActorCapabilities(
  db: D1Database,
  actorUserId: string
): Promise<Record<string, boolean>> {
  const roles = await loadActorRoles(db, actorUserId);
  const capabilities: Record<string, boolean> = {};
  for (const role of roles) {
    if (role.stable_key === PROTECTED_STABLE_KEYS.ADMIN) {
      for (const capability of CAPABILITY_CATALOG) {
        if (capability.startsWith("role.")) {
          capabilities[capability] = true;
        }
      }
    }
  }
  const grants = await db
    .prepare(
      `SELECT DISTINCT rg.capability
         FROM role_definition_grants rg
         JOIN role_assignments ra
           ON ra.role_definition_id = rg.role_definition_id
        WHERE ra.account_user_id = ? AND ra.revoked_at IS NULL`
    )
    .bind(actorUserId)
    .all<{ capability: string }>();
  for (const grant of grants.results ?? []) {
    capabilities[grant.capability] = true;
  }
  return capabilities;
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
                  category_key, scope_kind, scope_id, position,
                  is_protected, is_archived
             FROM role_definitions ORDER BY position ASC`
        )
        .all<RoleDefinitionRow>(),
      db
        .prepare(
          `SELECT rd.role_definition_id,
                  (SELECT COUNT(*) FROM role_assignments ra
                    WHERE ra.role_definition_id = rd.role_definition_id
                      AND ra.revoked_at IS NULL) AS assignments,
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
      { assignments: row.assignments, grants: row.grants },
    ])
  );

  const highestPosition =
    actorRoles.length > 0
      ? (actorRoles[0]?.position ?? Number.POSITIVE_INFINITY)
      : Number.POSITIVE_INFINITY;

  const categoriesView: RoleHierarchyCategory[] = (
    categories.results ?? []
  ).map((category) => {
    const definitionsView = (definitions.results ?? [])
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
        return {
          roleDefinitionId: row.role_definition_id,
          label: row.label,
          description: row.description,
          kind: roleKind(row.category_key),
          scopeKind: row.scope_kind,
          scopeId: row.scope_id,
          scopeLabel: scopeLabel(row.scope_kind, row.scope_id, names),
          position: row.position,
          isProtected: row.is_protected === 1,
          isArchived: row.is_archived === 1,
          assignmentCount: countsForRole?.assignments ?? 0,
          grantCount: countsForRole?.grants ?? 0,
          actions: canRename
            ? [{ action: ROLE_HIERARCHY_ACTION.RENAME, label: "重新命名" }]
            : [],
        };
      });
    return {
      categoryKey: category.category_key,
      label: category.label,
      description: category.description,
      displayOrder: category.display_order,
      childCount: definitionsView.length,
      definitions: definitionsView,
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

/** Scope rule (Spec 091 §5.2): a scoped actor cannot manage outside scope. */
/**
 * Scope rule (Spec 091 §4.5/§5.2): the HIGHEST assigned identity drives
 * role-management authority. A Global highest (Admin/Staff) manages any
 * lower definition church-wide; a scoped highest manages only lower
 * definitions with the identical Department/Program scope.
 */
function isWithinActorScope(
  actorRoles: ActorRoleRow[],
  target: RoleDefinitionRow
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
    highest.scope_id === target.scope_id
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
  role_definition_id: string;
  base_revision: number;
  label: string;
}): string {
  return `rename|${input.role_definition_id}|${input.base_revision}|${normalizeName(input.label)}`;
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
              category_key, scope_kind, scope_id, position,
              is_protected, is_archived
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
    if (
      error instanceof RoleCapabilityDeniedError ||
      error instanceof RoleAdminProtectedError ||
      error instanceof RoleBaselineProtectedError ||
      error instanceof RoleProtectedIdentityError ||
      error instanceof RoleSelfRenameError ||
      error instanceof RoleHighestProtectedError ||
      error instanceof RoleScopeMismatchError
    ) {
      await recordRoleDenialForRename(db, {
        actor_user_id: input.actor_user_id,
        role_definition_id: input.role_definition_id,
        now: input.now,
        audit_id: input.audit_id,
        correlation_id: input.correlation_id,
        old_label: oldName,
        new_label: newName,
        outcome: "DENIED",
        reason: error.name,
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
    if (error instanceof RoleRevisionConflictError) {
      // H-12: CONFLICT audit row; the idempotency ledger records the
      // rejected attempt as its own terminal row.
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

export const __test = {
  normalizeName,
  canonicalRenameFingerprint,
  isWithinActorScope,
  roleKind,
};
