import {
  CreateBodySchema,
  RenameBodySchema,
  ReorderBodySchema,
  ReorderTargetSchema,
  RescopeBodySchema,
  RoleCategoryKeySchema,
  RoleCreateResultSchema,
  RoleHierarchyViewSchema,
  RoleRenameResultSchema,
  RoleReorderResultSchema,
  RoleRescopeResultSchema,
  RoleScopeKindSchema,
  isValidRoleLabel,
  parseIdempotencyKey,
} from "@efcc/contracts";

/**
 * #478/#479 — S5-A03 Worker/HTTP seam for the 身份組 hierarchy and identity
 * mutations (Spec 091 §9.2/§9.3, ADR-0042).
 *
 * Thin adapters in the same shape as `apps/web/lib/programs/program-handlers.ts`:
 * they resolve the cookie-only actor, delegate to the D1 authority seam in
 * `./role-hierarchy.ts`, and format RFC 9457 Problem Details for every
 * typed failure. The client branch (role-hierarchy-api.ts) mirrors this
 * seam and is never the authority (Spec 091 §10).
 *
 * Problem Details shape (stable across the identity surface):
 *
 *   * `type` — `tag:apps-script/efcc/errors#<CODE>` (ADR-0018).
 *   * `status` — the HTTP status.
 *   * `code` — the stable machine code the client branches on.
 *   * `title` / `detail` — human-readable; Cantonese where a real operator
 *     may see it, English elsewhere. Never copies credentials, secrets, or
 *     member/account private data (Spec 091 §11).
 *   * `requestId` — echoed in the body AND the `X-Request-Id` header.
 *   * Extensions are limited to the authoritative revision number on
 *     revision conflicts (H-12); no sensitive data ever leaves this seam.
 *
 * Routes:
 *
 *   * GET   /api/v1/identity/roles                  → role hierarchy
 *   * PATCH /api/v1/identity/roles/:id/name        → rename mutation
 *   * PATCH /api/v1/identity/role-definitions/:id/scope → scope mutation
 * The rename path requires the `Idempotency-Key` header (ADR-0018 §8); a
 * replay of the same key + request fingerprint returns the original
 * result, and a key reused with a different fingerprint is rejected with
 * `ROLE_IDEMPOTENCY_REUSE` (H-13, Spec 091 §9.3). The fingerprint is
 * computed server-side from the request semantics; a client-supplied
 * value is never the authority.
 */
/* oxlint-disable eslint/complexity -- create/reorder handlers validate every body field sequentially and map the typed failures 1:1; the linear guard chain is intentional (same convention as role-hierarchy.ts). */
import type { AccountRow } from "../auth/accounts";
import { resolveRequestSession } from "../auth/sessions";
import {
  RoleIdempotencyConflictError,
  RoleRevisionConflictError,
} from "./mutations";
import {
  loadRoleHierarchy,
  renameRoleDefinition,
  createRoleDefinition,
  rescopeRoleDefinition,
  reorderRoleDefinitions,
  ROLE_NAME_MAX_LENGTH,
  RoleAdminProtectedError,
  RoleBaselineProtectedError,
  RoleCapabilityDeniedError,
  RoleHighestProtectedError,
  RoleNameConflictError,
  RoleArchivedError,
  RoleProtectedIdentityError,
  RoleScopeMismatchError,
  RoleSelfRenameError,
  RoleTargetNotFoundError,
  RoleInvalidParentError,
  RoleCrossCategoryError,
  RoleScopeRequiredError,
  RoleOrderConflictError,
} from "./role-hierarchy";
import type {
  RoleRenameResult,
  RoleCreateResult,
  RoleRescopeResult,
  RoleReorderResult,
} from "./role-hierarchy";

export interface RoleEnv {
  DB: D1Database;
  EFCC_ACCESS_TOKEN_SECRET: string;
}

export function roleProblem(
  status: number,
  code: string,
  title: string,
  detail: string,
  requestId: string,
  extensions?: Record<string, unknown>
): Response {
  const body: Record<string, unknown> = {
    type: `tag:apps-script/efcc/errors#${code}`,
    title,
    status,
    code,
    detail,
    requestId,
  };
  if (extensions !== undefined) {
    Object.assign(body, extensions);
  }
  return Response.json(body, {
    status,
    headers: {
      "Content-Type": "application/problem+json",
      "X-Request-Id": requestId,
    },
  });
}

export function roleSuccess(
  status: number,
  body: unknown,
  requestId: string
): Response {
  return Response.json(
    { requestId, data: body },
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
      },
    }
  );
}

/**
 * Resolve the cookie-only actor (same contract as the auth/programs
 * surfaces). Returns a Problem Details Response on any auth failure.
 */
export async function requireActor(
  request: Request,
  env: RoleEnv,
  requestId: string
): Promise<{ account: AccountRow } | Response> {
  const resolved = await resolveRequestSession(
    request,
    env.DB,
    env.EFCC_ACCESS_TOKEN_SECRET
  );
  if (resolved.status === "missing") {
    return roleProblem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Access cookie missing.",
      requestId
    );
  }
  if (resolved.status === "invalid") {
    return roleProblem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Access token invalid or expired.",
      requestId
    );
  }
  if (resolved.status === "unknown_account") {
    return roleProblem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Unknown account.",
      requestId
    );
  }
  const { account } = resolved;
  if (account.account_status !== "Active") {
    return roleProblem(
      403,
      "FORBIDDEN",
      "Forbidden",
      "Account is not active.",
      requestId
    );
  }
  return { account };
}

/**
 * 1:1 mapping of the typed rename failures to Problem Details (Spec 091
 * §9.3). Extensions are limited to the authoritative revision on stale
 * revision conflicts; no payload data is echoed back.
 */
function mapRenameError(error: unknown, requestId: string): Response {
  if (error instanceof RoleCapabilityDeniedError) {
    return roleProblem(
      403,
      "ROLE_FORBIDDEN",
      "Forbidden",
      "您沒有權限執行此操作。",
      requestId
    );
  }
  if (error instanceof RoleAdminProtectedError) {
    return roleProblem(
      403,
      "ROLE_ADMIN_PROTECTED",
      "Forbidden",
      "系統管理員身份不可重新命名。",
      requestId
    );
  }
  if (error instanceof RoleBaselineProtectedError) {
    return roleProblem(
      403,
      "ROLE_BASELINE_PROTECTED",
      "Forbidden",
      "會友基礎身份不可重新命名。",
      requestId
    );
  }
  if (error instanceof RoleProtectedIdentityError) {
    return roleProblem(
      403,
      "ROLE_PROTECTED",
      "Forbidden",
      "受保護系統身份不可重新命名。",
      requestId
    );
  }
  if (error instanceof RoleHighestProtectedError) {
    return roleProblem(
      403,
      "ROLE_HIGHEST_PROTECTED",
      "Forbidden",
      "不可重新命名自己或更高順位的身份組。",
      requestId
    );
  }
  if (error instanceof RoleSelfRenameError) {
    return roleProblem(
      403,
      "ROLE_HIGHEST_PROTECTED",
      "Forbidden",
      "不可重新命名自己的最高身份組。",
      requestId
    );
  }
  if (error instanceof RoleScopeMismatchError) {
    return roleProblem(
      403,
      "ROLE_SCOPE_MISMATCH",
      "Forbidden",
      "身份組超出你的可管理範圍。",
      requestId
    );
  }
  if (error instanceof RoleArchivedError) {
    return roleProblem(
      409,
      "ROLE_ARCHIVED",
      "Conflict",
      "已停用的身份組不可重新命名。",
      requestId
    );
  }
  if (error instanceof RoleNameConflictError) {
    return roleProblem(
      409,
      "ROLE_NAME_TAKEN",
      "Conflict",
      "已存在相同名稱的身份組。",
      requestId
    );
  }
  if (error instanceof RoleRevisionConflictError) {
    return roleProblem(
      409,
      "ROLE_POLICY_CONFLICT",
      "Conflict",
      "身份組政策已有更新，請重新載入後再試。",
      requestId,
      { currentRevision: error.currentRevision }
    );
  }
  if (error instanceof RoleIdempotencyConflictError) {
    return roleProblem(
      409,
      "ROLE_IDEMPOTENCY_REUSE",
      "Conflict",
      "相同請求鍵已用於另一項變更；請重新提交。",
      requestId
    );
  }
  if (error instanceof RoleTargetNotFoundError) {
    return roleProblem(
      404,
      "ROLE_NOT_FOUND",
      "Not found",
      "找不到指定的身份組。",
      requestId
    );
  }
  return roleProblem(
    500,
    "INTERNAL_ERROR",
    "Internal error",
    "伺服器未能完成此操作，請稍後再試。",
    requestId
  );
}

/**
 * 1:1 mapping of the #479 create/reorder typed failures to Problem Details.
 * Every rejection commits no domain mutation; the authority seam records the
 * documented DENIED/CONFLICT/REJECTED audit row. The stale-order conflict
 * (B-479-10) exposes the authoritative revision AND the authoritative
 * sibling order so the client can present 保留我的排序 / 採用最新排序.
 */
function mapIdentityError(error: unknown, requestId: string): Response {
  if (error instanceof RoleCapabilityDeniedError) {
    return roleProblem(
      403,
      "ROLE_FORBIDDEN",
      "Forbidden",
      "您沒有權限執行此操作。",
      requestId
    );
  }
  if (error instanceof RoleAdminProtectedError) {
    return roleProblem(
      403,
      "ROLE_ADMIN_PROTECTED",
      "Forbidden",
      "系統管理員身份不可變更。",
      requestId
    );
  }
  if (error instanceof RoleBaselineProtectedError) {
    return roleProblem(
      403,
      "ROLE_BASELINE_PROTECTED",
      "Forbidden",
      "會友基礎身份不可變更。",
      requestId
    );
  }
  if (error instanceof RoleProtectedIdentityError) {
    return roleProblem(
      403,
      "ROLE_PROTECTED",
      "Forbidden",
      "受保護系統身份不可變更。",
      requestId
    );
  }
  if (error instanceof RoleHighestProtectedError) {
    return roleProblem(
      403,
      "ROLE_HIGHEST_PROTECTED",
      "Forbidden",
      "不可變更自己或更高順位的身份組。",
      requestId
    );
  }
  if (error instanceof RoleScopeMismatchError) {
    return roleProblem(
      403,
      "ROLE_SCOPE_MISMATCH",
      "Forbidden",
      "身份組超出你的可管理範圍。",
      requestId
    );
  }
  if (error instanceof RoleInvalidParentError) {
    return roleProblem(
      422,
      "ROLE_INVALID_PARENT",
      "Validation failed",
      "所選分類不允許在此建立身份組。",
      requestId
    );
  }
  if (error instanceof RoleCrossCategoryError) {
    return roleProblem(
      422,
      "ROLE_INVALID_PARENT",
      "Validation failed",
      "只能在同一分類內調整身份組順序。",
      requestId
    );
  }
  if (error instanceof RoleScopeRequiredError) {
    return roleProblem(
      422,
      "ROLE_SCOPE_REQUIRED",
      "Validation failed",
      "指定範圍的身份組必須提供明確的適用範圍。",
      requestId
    );
  }
  if (error instanceof RoleArchivedError) {
    return roleProblem(
      409,
      "ROLE_ARCHIVED",
      "Conflict",
      "已停用的身份組不可變更。",
      requestId
    );
  }
  if (error instanceof RoleNameConflictError) {
    return roleProblem(
      409,
      "ROLE_NAME_TAKEN",
      "Conflict",
      "已存在相同名稱的身份組。",
      requestId
    );
  }
  if (error instanceof RoleOrderConflictError) {
    return roleProblem(
      409,
      "ROLE_ORDER_CONFLICT",
      "Conflict",
      "身份組順序已有更新，請選擇保留方式後再試。",
      requestId,
      {
        currentRevision: error.currentRevision,
        orderedRoleDefinitionIds: error.authoritativeIds,
      }
    );
  }
  if (error instanceof RoleRevisionConflictError) {
    return roleProblem(
      409,
      "ROLE_POLICY_CONFLICT",
      "Conflict",
      "身份組政策已有更新，請重新載入後再試。",
      requestId,
      { currentRevision: error.currentRevision }
    );
  }
  if (error instanceof RoleIdempotencyConflictError) {
    return roleProblem(
      409,
      "ROLE_IDEMPOTENCY_REUSE",
      "Conflict",
      "相同請求鍵已用於另一項變更；請重新提交。",
      requestId
    );
  }
  if (error instanceof RoleTargetNotFoundError) {
    return roleProblem(
      404,
      "ROLE_NOT_FOUND",
      "Not found",
      "找不到指定的身份組。",
      requestId
    );
  }
  return roleProblem(
    500,
    "INTERNAL_ERROR",
    "Internal error",
    "伺服器未能完成此操作，請稍後再試。",
    requestId
  );
}

/** GET /api/v1/identity/roles — the read-only hierarchy projection. */
export async function handleGetRoleHierarchy(
  request: Request,
  env: RoleEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  try {
    const view = await loadRoleHierarchy(env.DB, auth.account.user_id);
    if (!RoleHierarchyViewSchema.safeParse(view).success) {
      // Shared contract gate (#655): never a malformed 2xx. The throw
      // routes through the identical 500 below.
      console.error(
        `[identity] GET /api/v1/identity/roles malformed data requestId=${requestId}`
      );
      throw new Error("identity contract violation");
    }
    return roleSuccess(200, view, requestId);
  } catch (error) {
    // A caller without the effective `role.read` capability receives the
    // canonical ROLE_FORBIDDEN problem (Spec 091 §9.3), not a 500.
    if (error instanceof RoleCapabilityDeniedError) {
      return roleProblem(
        403,
        "ROLE_FORBIDDEN",
        "Forbidden",
        "您沒有權限執行此操作。",
        requestId
      );
    }
    return roleProblem(
      500,
      "INTERNAL_ERROR",
      "Internal error",
      "身份組資料暫時無法載入，請稍後再試。",
      requestId
    );
  }
}

/**
 * PATCH /api/v1/identity/roles/:id/name — one complete rename mutation.
 * The typed failures are mapped here (never in the client) and every
 * rejection commits no domain mutation; the authority seam records the
 * documented DENIED/CONFLICT/REJECTED audit row.
 */
export async function handleRenameRoleDefinition(
  request: Request,
  env: RoleEnv,
  roleDefinitionId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }

  const idempotencyKey = parseIdempotencyKey(
    request.headers.get("Idempotency-Key")
  );
  if (idempotencyKey === null) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "Idempotency-Key header is required for identity changes.",
      requestId
    );
  }

  let rawBody: unknown;
  try {
    rawBody = (await request.json()) as unknown;
  } catch {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "Request body must be valid JSON.",
      requestId
    );
  }
  const parsedBody = RenameBodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "label and base_revision are required.",
      requestId
    );
  }

  const label = parsedBody.data.label.trim();
  if (!isValidRoleLabel(label)) {
    return roleProblem(
      400,
      "INVALID_NAME",
      "Invalid name",
      `身份組名稱不可空白，且不可超過 ${ROLE_NAME_MAX_LENGTH} 個字元。`,
      requestId
    );
  }

  try {
    const result: RoleRenameResult = await renameRoleDefinition(env.DB, {
      actor_user_id: auth.account.user_id,
      idempotency_key: idempotencyKey,
      base_revision: parsedBody.data.base_revision,
      role_definition_id: roleDefinitionId,
      label,
      now: new Date().toISOString(),
      audit_id: crypto.randomUUID(),
      correlation_id: requestId,
    });
    if (!RoleRenameResultSchema.safeParse(result).success) {
      console.error(`[identity] rename malformed data requestId=${requestId}`);
      throw new Error("identity contract violation");
    }
    return roleSuccess(200, result, requestId);
  } catch (error) {
    return mapRenameError(error, requestId);
  }
}

/**
 * POST /api/v1/identity/role-definitions — #479 creation (B-479-01/B-479-14).
 * Admin creates global or scoped definitions; Staff creates scoped
 * definitions only under an existing permitted fixed category. The Worker
 * recomputes actor/capability/position/scope from D1 (B-479-13); the UI
 * projection is never the authority.
 */
export async function handleCreateRoleDefinition(
  request: Request,
  env: RoleEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }

  const idempotencyKey = parseIdempotencyKey(
    request.headers.get("Idempotency-Key")
  );
  if (idempotencyKey === null) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "Idempotency-Key header is required for identity changes.",
      requestId
    );
  }

  let rawBody: unknown;
  try {
    rawBody = (await request.json()) as unknown;
  } catch {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "Request body must be valid JSON.",
      requestId
    );
  }
  const parsedBody = CreateBodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "category_key, label, scope_kind, scope_id, and base_revision are required.",
      requestId
    );
  }
  const body = parsedBody.data;

  if (!RoleCategoryKeySchema.safeParse(body.category_key).success) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "category_key must be Global, Department, or Program.",
      requestId
    );
  }
  if (!RoleScopeKindSchema.safeParse(body.scope_kind).success) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "scope_kind must be Global, Department, or Program.",
      requestId
    );
  }

  const label = body.label.trim();
  if (!isValidRoleLabel(label)) {
    return roleProblem(
      400,
      "INVALID_NAME",
      "Invalid name",
      `身份組名稱不可空白，且不可超過 ${ROLE_NAME_MAX_LENGTH} 個字元。`,
      requestId
    );
  }

  try {
    const result: RoleCreateResult = await createRoleDefinition(env.DB, {
      actor_user_id: auth.account.user_id,
      idempotency_key: idempotencyKey,
      base_revision: body.base_revision,
      category_key: body.category_key as "Global" | "Department" | "Program",
      label,
      description: typeof body.description === "string" ? body.description : "",
      scope_kind: body.scope_kind as "Global" | "Department" | "Program",
      scope_id: body.scope_id ?? null,
      now: new Date().toISOString(),
      audit_id: crypto.randomUUID(),
      correlation_id: requestId,
    });
    if (!RoleCreateResultSchema.safeParse(result).success) {
      console.error(`[identity] create malformed data requestId=${requestId}`);
      throw new Error("identity contract violation");
    }
    return roleSuccess(200, result, requestId);
  } catch (error) {
    return mapIdentityError(error, requestId);
  }
}

/**
 * PATCH /api/v1/identity/role-definitions/:id/scope — #479 scope edit.
 * The cookie-only actor and all destination/authority checks are delegated
 * to the D1 authority seam; the optional category echo is validated there.
 */
export async function handleRescopeRoleDefinition(
  request: Request,
  env: RoleEnv,
  roleDefinitionId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }

  const idempotencyKey = parseIdempotencyKey(
    request.headers.get("Idempotency-Key")
  );
  if (idempotencyKey === null) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "Idempotency-Key header is required for identity changes.",
      requestId
    );
  }

  let rawBody: unknown;
  try {
    rawBody = (await request.json()) as unknown;
  } catch {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "Request body must be valid JSON.",
      requestId
    );
  }
  const parsedBody = RescopeBodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "scope_kind, scope_id, and base_revision are required.",
      requestId
    );
  }
  const body = parsedBody.data;
  if (!RoleScopeKindSchema.safeParse(body.scope_kind).success) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "scope_kind must be Global, Department, or Program.",
      requestId
    );
  }
  if (
    body.category_key !== undefined &&
    !RoleCategoryKeySchema.safeParse(body.category_key).success
  ) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "category_key must be Global, Department, or Program.",
      requestId
    );
  }
  const scopeKind = body.scope_kind as "Global" | "Department" | "Program";

  try {
    const result: RoleRescopeResult = await rescopeRoleDefinition(env.DB, {
      actor_user_id: auth.account.user_id,
      idempotency_key: idempotencyKey,
      base_revision: body.base_revision,
      role_definition_id: roleDefinitionId,
      category_key: body.category_key as
        | "Global"
        | "Department"
        | "Program"
        | undefined,
      scope_kind: scopeKind,
      scope_id: body.scope_id ?? null,
      now: new Date().toISOString(),
      audit_id: crypto.randomUUID(),
      correlation_id: requestId,
    });
    if (!RoleRescopeResultSchema.safeParse(result).success) {
      console.error(`[identity] rescope malformed data requestId=${requestId}`);
      throw new Error("identity contract violation");
    }
    return roleSuccess(200, result, requestId);
  } catch (error) {
    return mapIdentityError(error, requestId);
  }
}

/**
 * PATCH /api/v1/identity/roles/order — #479 sibling-only reorder
 * (B-479-07/B-479-08/B-479-10). The body names exactly two sibling Role
 * Definitions inside one fixed Category; the authority seam recomputes the
 * sibling/scope/highest rules from D1.
 */
export async function handleReorderRoleDefinitions(
  request: Request,
  env: RoleEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }

  const idempotencyKey = parseIdempotencyKey(
    request.headers.get("Idempotency-Key")
  );
  if (idempotencyKey === null) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "Idempotency-Key header is required for identity changes.",
      requestId
    );
  }

  let rawBody: unknown;
  try {
    rawBody = (await request.json()) as unknown;
  } catch {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "Request body must be valid JSON.",
      requestId
    );
  }
  const parsedBody = ReorderBodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "targets (two siblings) and base_revision are required.",
      requestId
    );
  }
  const body = parsedBody.data;
  if (!RoleCategoryKeySchema.safeParse(body.category_key).success) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "category_key must be Global, Department, or Program.",
      requestId
    );
  }

  const { targets } = body;
  for (const target of targets) {
    if (!ReorderTargetSchema.safeParse(target).success) {
      return roleProblem(
        422,
        "VALIDATION",
        "Validation failed",
        "Each target needs role_definition_id and an integer position.",
        requestId
      );
    }
  }

  try {
    const result: RoleReorderResult = await reorderRoleDefinitions(env.DB, {
      actor_user_id: auth.account.user_id,
      idempotency_key: idempotencyKey,
      base_revision: body.base_revision,
      category_key: body.category_key as "Global" | "Department" | "Program",
      targets: targets as { role_definition_id: string; position: number }[],
      now: new Date().toISOString(),
      audit_id: crypto.randomUUID(),
      correlation_id: requestId,
    });
    if (!RoleReorderResultSchema.safeParse(result).success) {
      console.error(`[identity] reorder malformed data requestId=${requestId}`);
      throw new Error("identity contract violation");
    }
    return roleSuccess(200, result, requestId);
  } catch (error) {
    return mapIdentityError(error, requestId);
  }
}
