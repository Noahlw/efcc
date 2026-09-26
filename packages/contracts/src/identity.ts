/**
 * Identity Role/Grant/Account wire contracts (spec #646, ticket #655).
 *
 * Source-derived from `apps/web/lib/identity/role-handlers.ts`,
 * `permission-editor-handlers.ts`, `account-access-handlers.ts`, the
 * worker dispatch, Spec 091, and ADR-0042. Every shape mirrors an
 * observed wire value. Validators never transform; accepted extras
 * flow exactly as today (loose bodies ignore unknown keys; the
 * grants/assignments/lifecycle bodies reject them — mirrored here).
 *
 * Capability catalog membership stays server-side (the closed
 * vocabulary lives in the app; copying it here would drift). Schemas
 * require a non-empty capability string; the Worker maps unknown
 * capabilities to the existing 422.
 */
import * as z from "zod";

import { nonEmptyString, nullableString, positiveInt } from "./primitives";

export const RoleCategoryKeySchema = z.enum([
  "Global",
  "Department",
  "Program",
]);
export type RoleCategoryKey = z.infer<typeof RoleCategoryKeySchema>;

export const RoleScopeKindSchema = z.enum(["Global", "Department", "Program"]);
export type RoleScopeKind = z.infer<typeof RoleScopeKindSchema>;

export const LifecycleActionSchema = z.enum(["archive", "restore"]);
export type LifecycleAction = z.infer<typeof LifecycleActionSchema>;

export const DefinitionKindSchema = z.enum([
  "SYSTEM",
  "GLOBAL",
  "DEPARTMENT_SCOPED",
  "PROGRAM_SCOPED",
]);
export type DefinitionKind = z.infer<typeof DefinitionKindSchema>;

export const AssignmentStateSchema = z.enum(["ACTIVE", "REVOKED"]);
export type AssignmentState = z.infer<typeof AssignmentStateSchema>;

/** H-11 / Spec 091 §8.2: trimmed, non-empty, ≤ 60 chars. */
export const ROLE_NAME_MAX_LENGTH = 60;

/** Pure port of the authority seam predicate (trim + NFC + lowercase). */
export function normalizeRoleName(label: string): string {
  return label.trim().normalize("NFC").toLowerCase();
}

/** Exact rename/create label rule: non-blank after normalization, ≤ max. */
export function isValidRoleLabel(label: unknown): boolean {
  return (
    typeof label === "string" &&
    label.trim().length > 0 &&
    normalizeRoleName(label).length > 0 &&
    label.trim().length <= ROLE_NAME_MAX_LENGTH
  );
}

/**
 * Identity mutation header rule: trimmed, 1..200 chars. Every identity
 * mutation rejects a missing/overlong key with the same 422.
 */
export function parseIdempotencyKey(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const key = value.trim();
  return key.length > 0 && key.length <= 200 ? key : null;
}

/** Rename request: label + base_revision; unknown keys ignored. */
export const RenameBodySchema = z.object({
  label: z.string(),
  base_revision: positiveInt,
});
export type RenameBody = z.infer<typeof RenameBodySchema>;

/**
 * Create request SHAPE: string-ness only. Value enums stay in the handler
 * branches (distinct 422 messages); validate them with
 * RoleCategoryKeySchema / RoleScopeKindSchema.
 */
export const CreateBodySchema = z.object({
  category_key: z.string(),
  label: z.string(),
  description: z.unknown().optional(),
  scope_kind: z.string(),
  scope_id: z.string().nullable().optional(),
  base_revision: positiveInt,
});
export type CreateBody = z.infer<typeof CreateBodySchema>;

/** Rescope request SHAPE (value enums validated in handler branches). */
export const RescopeBodySchema = z.object({
  scope_kind: z.string(),
  scope_id: z.string().nullable().optional(),
  base_revision: positiveInt,
  category_key: z.string().optional(),
});
export type RescopeBody = z.infer<typeof RescopeBodySchema>;

/** Reorder request SHAPE (category enum + per-target loop stay in handler). */
export const ReorderTargetSchema = z.object({
  role_definition_id: nonEmptyString,
  position: z.number().int().min(0),
});
export const ReorderBodySchema = z.object({
  category_key: z.string(),
  targets: z.array(z.unknown()).length(2),
  base_revision: positiveInt,
});
export type ReorderBody = z.infer<typeof ReorderBodySchema>;

/**
 * Grants PATCH: STRICT key policy (an `actor_user_id` echo is rejected;
 * the actor comes from the cookie). ≤ 100 changes, each strictly
 * {capability, value}.
 */
export const GrantChangeSchema = z
  .object({ capability: nonEmptyString, value: z.boolean() })
  .strict();
/**
 * Grants PATCH envelope: STRICT keys, array shape only. Per-change
 * {capability, value} validation stays in the handler loop with its
 * distinct ROLE_INVALID_TARGET message (validated by GrantChangeSchema).
 */
export const GrantsBodySchema = z
  .object({ base_revision: positiveInt, changes: z.array(z.unknown()) })
  .strict();
export type GrantsBody = z.infer<typeof GrantsBodySchema>;

/**
 * Assignment batch: STRICT keys; non-empty-string ids.
 * (The 50-cap and the mutate/revoke empty-list distinction stay in the
 * handler with their distinct 422 messages.)
 */
export const AssignmentsBodySchema = z
  .object({
    base_revision: positiveInt,
    role_definition_ids: z.array(nonEmptyString),
  })
  .strict();
export type AssignmentsBody = z.infer<typeof AssignmentsBodySchema>;

/** Lifecycle transition: STRICT keys; reason optional string. */
export const LifecycleBodySchema = z
  .object({
    action: LifecycleActionSchema,
    base_revision: positiveInt,
    reason: z.string().optional(),
  })
  .strict();
export type LifecycleBody = z.infer<typeof LifecycleBodySchema>;

/**
 * Eligible-account search query with the exact current policy: invalid
 * offset/limit is a 422 (never clamped — unlike the CMS audit list).
 */
export function parseAccountSearchQuery(
  params: URLSearchParams
): { q: string; offset: number; limit: number } | null {
  const offset = Number(params.get("offset") ?? "0");
  const limit = Number(params.get("limit") ?? "20");
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    return null;
  }
  return { q: params.get("q") ?? "", offset, limit };
}

// ---------------------------------------------------------------------------
// Response projections (accepted wire shapes, source-derived).
// ---------------------------------------------------------------------------

const ActionAffordanceSchema = z.object({
  action: z.string(),
  label: z.string(),
});

const ScopeOptionSchema = z.object({
  category_key: RoleCategoryKeySchema,
  scope_kind: RoleScopeKindSchema,
  scope_id: nullableString,
  scopeLabel: z.string(),
});

const AssignedAccountSchema = z.object({
  assignmentId: nonEmptyString,
  userId: nonEmptyString,
  name: z.string(),
  username: z.string(),
  status: z.string(),
});

export const RoleHierarchyDefinitionSchema = z.object({
  roleDefinitionId: nonEmptyString,
  label: z.string(),
  description: z.string(),
  kind: DefinitionKindSchema,
  scopeKind: RoleScopeKindSchema,
  scopeId: nullableString,
  scopeParentDepartmentId: nullableString.nullish(),
  scopeLabel: nullableString,
  position: z.number(),
  isProtected: z.boolean(),
  isArchived: z.boolean(),
  assignmentCount: z.number(),
  assignedAccounts: z.array(AssignedAccountSchema).nullish(),
  assignmentActions: z
    .array(
      z.object({ action: z.enum(["assign", "revoke"]), label: z.string() })
    )
    .nullish(),
  lifecycleActions: z
    .array(z.object({ action: LifecycleActionSchema, label: z.string() }))
    .nullish(),
  grantCount: z.number(),
  actions: z.array(ActionAffordanceSchema),
  scopeOptions: z.array(ScopeOptionSchema).nullish(),
  reorderActions: z.array(ActionAffordanceSchema),
});
export type RoleHierarchyDefinition = z.infer<
  typeof RoleHierarchyDefinitionSchema
>;

export const RoleHierarchyViewSchema = z.object({
  categories: z.array(
    z.object({
      categoryKey: RoleCategoryKeySchema,
      label: z.string(),
      description: z.string(),
      displayOrder: z.number(),
      childCount: z.number(),
      definitions: z.array(RoleHierarchyDefinitionSchema),
      createOptions: z.array(ScopeOptionSchema),
    })
  ),
  revision: z.number(),
  caller: z.object({ userId: nonEmptyString, highestPosition: z.number() }),
});
export type RoleHierarchyView = z.infer<typeof RoleHierarchyViewSchema>;

export const RoleRenameResultSchema = z.object({
  roleDefinitionId: nonEmptyString,
  label: z.string(),
  revision: z.number(),
  idempotent: z.boolean(),
});
export type RoleRenameResult = z.infer<typeof RoleRenameResultSchema>;

export const RoleCreateResultSchema = z.object({
  roleDefinitionId: nonEmptyString,
  categoryKey: RoleCategoryKeySchema,
  label: z.string(),
  scopeKind: RoleScopeKindSchema,
  scopeId: nullableString,
  position: z.number(),
  revision: z.number(),
  idempotent: z.boolean(),
});
export type RoleCreateResult = z.infer<typeof RoleCreateResultSchema>;

export const RoleRescopeResultSchema = z.object({
  roleDefinitionId: nonEmptyString,
  categoryKey: RoleCategoryKeySchema,
  scopeKind: RoleScopeKindSchema,
  scopeId: nullableString,
  position: z.number(),
  revision: z.number(),
  idempotent: z.boolean(),
});
export type RoleRescopeResult = z.infer<typeof RoleRescopeResultSchema>;

export const RoleReorderResultSchema = z.object({
  categoryKey: RoleCategoryKeySchema,
  orderedRoleDefinitionIds: z.array(nonEmptyString),
  revision: z.number(),
  idempotent: z.boolean(),
});
export type RoleReorderResult = z.infer<typeof RoleReorderResultSchema>;

const DefinitionPermissionSchema = z.object({
  capability: nonEmptyString,
  label: z.string(),
  description: z.string(),
  group: z.string(),
  risk: z.string(),
  scopeRequired: z.boolean(),
  value: z.boolean(),
  editable: z.boolean(),
  locked: z.boolean(),
  lockReason: nullableString,
});

export const RoleDefinitionDetailViewSchema = z.object({
  roleDefinition: RoleHierarchyDefinitionSchema,
  permissions: z.array(DefinitionPermissionSchema),
  assignedAccounts: z.array(AssignedAccountSchema),
  revision: z.number(),
  caller: z.object({
    userId: nonEmptyString,
    canRead: z.boolean(),
    canWrite: z.boolean(),
  }),
});
export type RoleDefinitionDetailView = z.infer<
  typeof RoleDefinitionDetailViewSchema
>;

const AccountAccessIdentitySchema = z.object({
  assignmentId: nonEmptyString,
  roleDefinitionId: nonEmptyString,
  label: z.string(),
  scopeKind: RoleScopeKindSchema,
  scopeId: nullableString,
  scopeLabel: nullableString,
  position: z.number(),
  state: AssignmentStateSchema,
  grantedAt: nonEmptyString,
  revokedAt: nullableString.nullish(),
  revokedBy: nullableString.nullish(),
  revokeReason: nullableString.nullish(),
});

const EffectiveAccessGrantSchema = z.object({
  capability: nonEmptyString,
  label: z.string(),
  description: z.string(),
  group: z.string(),
  risk: z.string(),
  scopeRequired: z.boolean(),
  scopeKind: RoleScopeKindSchema,
  scopeId: nullableString,
  scopeLabel: nullableString,
  sources: z.array(z.string()),
  sourceRoleDefinitionIds: z.array(nonEmptyString),
});

const EffectiveAccessGroupsSchema = z.object({
  Global: z.array(EffectiveAccessGrantSchema),
  Department: z.array(EffectiveAccessGrantSchema),
  Program: z.array(EffectiveAccessGrantSchema),
});

export const AccountAccessViewSchema = z.object({
  account: z.object({
    userId: nonEmptyString,
    name: z.string(),
    username: z.string(),
    status: z.string(),
  }),
  activeAssignments: z.array(AccountAccessIdentitySchema),
  revokedAssignments: z.array(AccountAccessIdentitySchema),
  assignmentHistory: z.array(AccountAccessIdentitySchema),
  assignableRoles: z.array(
    z.object({
      roleDefinitionId: nonEmptyString,
      label: z.string(),
      scopeKind: RoleScopeKindSchema,
      scopeId: nullableString,
      scopeLabel: nullableString,
      position: z.number(),
    })
  ),
  effectiveAccess: EffectiveAccessGroupsSchema,
  lifecycleImpacts: z.record(
    z.string(),
    z.object({
      roleDefinitionId: nonEmptyString,
      label: z.string(),
      action: LifecycleActionSchema,
      lost: EffectiveAccessGroupsSchema,
      retained: EffectiveAccessGroupsSchema,
    })
  ),
  revision: z.number(),
  actions: z.object({
    assign: z.boolean(),
    revoke: z.boolean(),
    archive: z.boolean(),
    restore: z.boolean(),
    revokeRoleDefinitionIds: z.array(nonEmptyString),
    archiveRoleDefinitionIds: z.array(nonEmptyString),
    restoreRoleDefinitionIds: z.array(nonEmptyString),
  }),
});
export type AccountAccessView = z.infer<typeof AccountAccessViewSchema>;

/**
 * Mutation result: the public view plus replay/duplicate metadata.
 * Handlers strip the internal `responseRequestId` before gating.
 */
export const AccountAccessMutationResultSchema = AccountAccessViewSchema.extend(
  {
    idempotent: z.boolean(),
    duplicateRoleDefinitionIds: z.array(nonEmptyString),
    impact: z
      .object({
        lost: EffectiveAccessGroupsSchema,
        retained: EffectiveAccessGroupsSchema,
      })
      .nullish(),
  }
);
export type AccountAccessMutationResult = z.infer<
  typeof AccountAccessMutationResultSchema
>;

export const EligibleAccountSearchSchema = z.object({
  accounts: z.array(
    z.object({
      userId: nonEmptyString,
      name: z.string(),
      username: z.string(),
      identities: z.array(
        z.object({
          roleDefinitionId: nonEmptyString,
          label: z.string(),
          scopeLabel: nullableString,
        })
      ),
    })
  ),
  nextOffset: z.number().nullable(),
});
export type EligibleAccountSearch = z.infer<typeof EligibleAccountSearchSchema>;

const LifecycleImpactEntrySchema = z.object({
  accountUserId: nonEmptyString,
  lost: EffectiveAccessGroupsSchema,
  retained: EffectiveAccessGroupsSchema,
});

export const RoleDefinitionLifecycleResultSchema = z.object({
  roleDefinitionId: nonEmptyString,
  action: LifecycleActionSchema,
  isArchived: z.boolean(),
  revision: z.number(),
  affectedAccountUserIds: z.array(nonEmptyString),
  impact: z.array(LifecycleImpactEntrySchema),
  idempotent: z.boolean(),
});
export type RoleDefinitionLifecycleResult = z.infer<
  typeof RoleDefinitionLifecycleResultSchema
>;

export const RoleDefinitionLifecyclePreviewSchema =
  RoleDefinitionLifecycleResultSchema.omit({ idempotent: true });
export type RoleDefinitionLifecyclePreview = z.infer<
  typeof RoleDefinitionLifecyclePreviewSchema
>;
