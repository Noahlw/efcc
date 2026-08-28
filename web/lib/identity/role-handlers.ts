/**
 * #478/#479 — S5-A03 Worker/HTTP seam for the 身份組 hierarchy and identity
 * mutations (Spec 091 §9.2/§9.3, ADR-0042).
 *
 * Thin adapters in the same shape as `web/lib/programs/program-handlers.ts`:
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
import { findAccountByUserId } from "../auth/accounts";
import type { AccountRow } from "../auth/accounts";
import { ACCESS_COOKIE_NAME } from "../auth/cookies";
import { verifyAccessToken } from "../auth/sessions";
import {
  RoleIdempotencyConflictError,
  RoleRevisionConflictError,
} from "./mutations";
import {
  loadRoleHierarchy,
  normalizeName,
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

/** A rename request body; every field is validated before any D1 call. */
interface RenameBody {
  label?: unknown;
  base_revision?: unknown;
}

/** #479 create request body (B-479-01/B-479-14). */
interface CreateBody {
  category_key?: unknown;
  label?: unknown;
  description?: unknown;
  scope_kind?: unknown;
  scope_id?: unknown;
  base_revision?: unknown;
}

/** #479 reorder request body (B-479-07/B-479-08). */
interface ReorderBody {
  category_key?: unknown;
  targets?: unknown;
  base_revision?: unknown;
}
/** #479 rescope request body (Spec 091 §9.2). */
interface RescopeBody {
  category_key?: unknown;
  scope_kind?: unknown;
  scope_id?: unknown;
  base_revision?: unknown;
}

function roleProblem(
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

function roleSuccess(
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

function readCookie(headers: Headers, name: string): string | null {
  const raw = headers.get("Cookie");
  if (!raw) {
    return null;
  }
  for (const pair of raw.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = pair.slice(0, eq).trim();
    if (key === name) {
      return pair.slice(eq + 1).trim();
    }
  }
  return null;
}

/**
 * Resolve the cookie-only actor (same contract as the auth/programs
 * surfaces). Returns a Problem Details Response on any auth failure.
 */
async function requireActor(
  request: Request,
  env: RoleEnv,
  requestId: string
): Promise<{ account: AccountRow } | Response> {
  const access = readCookie(request.headers, ACCESS_COOKIE_NAME);
  if (!access) {
    return roleProblem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Access cookie missing.",
      requestId
    );
  }
  const claims = await verifyAccessToken(env.EFCC_ACCESS_TOKEN_SECRET, access);
  if (!claims) {
    return roleProblem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Access token invalid or expired.",
      requestId
    );
  }
  const account = await findAccountByUserId(env.DB, claims.uid);
  if (!account) {
    return roleProblem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Unknown account.",
      requestId
    );
  }
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

  const rawKey = request.headers.get("Idempotency-Key");
  const idempotencyKey = rawKey?.trim() ?? "";
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "Idempotency-Key header is required for identity changes.",
      requestId
    );
  }

  let body: RenameBody;
  try {
    body = (await request.json()) as RenameBody;
  } catch {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "Request body must be valid JSON.",
      requestId
    );
  }
  if (
    typeof body !== "object" ||
    body === null ||
    typeof body.label !== "string" ||
    typeof body.base_revision !== "number" ||
    !Number.isInteger(body.base_revision) ||
    body.base_revision < 1
  ) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "label and base_revision are required.",
      requestId
    );
  }

  const label = body.label.trim();
  if (
    normalizeName(label).length === 0 ||
    label.length > ROLE_NAME_MAX_LENGTH
  ) {
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
      base_revision: body.base_revision,
      role_definition_id: roleDefinitionId,
      label,
      now: new Date().toISOString(),
      audit_id: crypto.randomUUID(),
      correlation_id: requestId,
    });
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

  const rawKey = request.headers.get("Idempotency-Key");
  const idempotencyKey = rawKey?.trim() ?? "";
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "Idempotency-Key header is required for identity changes.",
      requestId
    );
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "Request body must be valid JSON.",
      requestId
    );
  }
  if (
    typeof body !== "object" ||
    body === null ||
    typeof body.label !== "string" ||
    typeof body.base_revision !== "number" ||
    !Number.isInteger(body.base_revision) ||
    body.base_revision < 1 ||
    typeof body.category_key !== "string" ||
    typeof body.scope_kind !== "string" ||
    (body.scope_id !== null &&
      body.scope_id !== undefined &&
      typeof body.scope_id !== "string")
  ) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "category_key, label, scope_kind, scope_id, and base_revision are required.",
      requestId
    );
  }

  const categoryKey = body.category_key;
  if (
    categoryKey !== "Global" &&
    categoryKey !== "Department" &&
    categoryKey !== "Program"
  ) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "category_key must be Global, Department, or Program.",
      requestId
    );
  }
  const scopeKind = body.scope_kind;
  if (
    scopeKind !== "Global" &&
    scopeKind !== "Department" &&
    scopeKind !== "Program"
  ) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "scope_kind must be Global, Department, or Program.",
      requestId
    );
  }

  const label = body.label.trim();
  if (
    normalizeName(label).length === 0 ||
    label.length > ROLE_NAME_MAX_LENGTH
  ) {
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
      category_key: categoryKey,
      label,
      description: typeof body.description === "string" ? body.description : "",
      scope_kind: scopeKind,
      scope_id: body.scope_id ?? null,
      now: new Date().toISOString(),
      audit_id: crypto.randomUUID(),
      correlation_id: requestId,
    });
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

  const rawKey = request.headers.get("Idempotency-Key");
  const idempotencyKey = rawKey?.trim() ?? "";
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "Idempotency-Key header is required for identity changes.",
      requestId
    );
  }

  let body: RescopeBody;
  try {
    body = (await request.json()) as RescopeBody;
  } catch {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "Request body must be valid JSON.",
      requestId
    );
  }
  if (
    typeof body !== "object" ||
    body === null ||
    typeof body.scope_kind !== "string" ||
    typeof body.base_revision !== "number" ||
    !Number.isInteger(body.base_revision) ||
    body.base_revision < 1 ||
    (body.scope_id !== null &&
      body.scope_id !== undefined &&
      typeof body.scope_id !== "string") ||
    (body.category_key !== undefined &&
      typeof body.category_key !== "string")
  ) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "scope_kind, scope_id, and base_revision are required.",
      requestId
    );
  }
  const scopeKind = body.scope_kind;
  if (
    scopeKind !== "Global" &&
    scopeKind !== "Department" &&
    scopeKind !== "Program"
  ) {
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
    body.category_key !== "Global" &&
    body.category_key !== "Department" &&
    body.category_key !== "Program"
  ) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "category_key must be Global, Department, or Program.",
      requestId
    );
  }

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

  const rawKey = request.headers.get("Idempotency-Key");
  const idempotencyKey = rawKey?.trim() ?? "";
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "Idempotency-Key header is required for identity changes.",
      requestId
    );
  }

  let body: ReorderBody;
  try {
    body = (await request.json()) as ReorderBody;
  } catch {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "Request body must be valid JSON.",
      requestId
    );
  }
  if (
    typeof body !== "object" ||
    body === null ||
    typeof body.base_revision !== "number" ||
    !Number.isInteger(body.base_revision) ||
    body.base_revision < 1 ||
    !Array.isArray(body.targets) ||
    body.targets.length !== 2
  ) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "targets (two siblings) and base_revision are required.",
      requestId
    );
  }
  const categoryKey = body.category_key;
  if (
    categoryKey !== "Global" &&
    categoryKey !== "Department" &&
    categoryKey !== "Program"
  ) {
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
    if (
      typeof target !== "object" ||
      target === null ||
      typeof target.role_definition_id !== "string" ||
      typeof target.position !== "number" ||
      !Number.isInteger(target.position) ||
      target.position < 0
    ) {
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
      category_key: categoryKey,
      targets: targets as { role_definition_id: string; position: number }[],
      now: new Date().toISOString(),
      audit_id: crypto.randomUUID(),
      correlation_id: requestId,
    });
    return roleSuccess(200, result, requestId);
  } catch (error) {
    return mapIdentityError(error, requestId);
  }
}
