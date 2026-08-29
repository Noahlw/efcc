/**
 * #485 — cookie-only Worker handlers for Role Definition permissions.
 *
 * Authentication, response envelopes, and Problem Details use the existing
 * identity handler seam. These handlers only validate transport input and
 * delegate authority to permission-editor.ts.
 */
/* oxlint-disable eslint/complexity -- request validation and one-to-one error mapping are intentionally explicit. */
import {
  RoleCapabilityCatalogError,
  RoleIdempotencyConflictError,
  RoleRevisionConflictError,
} from "./mutations";
import {
  loadRoleDefinitionDetail,
  updateRoleDefinitionGrants,
} from "./permission-editor";
import type { PermissionGrantChange } from "./permission-editor";
import {
  RoleAdminProtectedError,
  RoleArchivedError,
  RoleBaselineProtectedError,
  RoleCapabilityDeniedError,
  RoleHighestProtectedError,
  RoleInvalidTargetError,
  RoleScopeMismatchError,
  RoleTargetNotFoundError,
} from "./role-hierarchy";
import {
  requireActor,
  roleProblem,
  roleSuccess,
} from "./role-handlers";
import type { RoleEnv } from "./role-handlers";
import { isCapability } from "./capability-catalog";

type GrantsBody = {
  base_revision?: unknown;
  changes?: unknown;
  actor_user_id?: unknown;
};
function hasOnlyKeys(value: object, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}


function mapPermissionError(error: unknown, requestId: string): Response {
  if (error instanceof RoleCapabilityDeniedError) {
    return roleProblem(
      403,
      "ROLE_FORBIDDEN",
      "Forbidden",
      "您沒有權限檢視或編輯此身份組權限。",
      requestId
    );
  }
  if (error instanceof RoleHighestProtectedError) {
    return roleProblem(
      403,
      "ROLE_HIGHEST_PROTECTED",
      "Forbidden",
      "不可編輯自己或更高順位的身份組。",
      requestId
    );
  }
  if (error instanceof RoleAdminProtectedError) {
    return roleProblem(
      403,
      "ROLE_ADMIN_PROTECTED",
      "Forbidden",
      "系統管理員身份不可修改權限。",
      requestId
    );
  }
  if (error instanceof RoleBaselineProtectedError) {
    return roleProblem(
      403,
      "ROLE_BASELINE_PROTECTED",
      "Forbidden",
      "會友基礎身份不可修改權限。",
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
  if (error instanceof RoleArchivedError) {
    return roleProblem(
      409,
      "ROLE_ARCHIVED",
      "Conflict",
      "已停用的身份組不可修改權限。",
      requestId
    );
  }
  if (error instanceof RoleCapabilityCatalogError) {
    return roleProblem(
      422,
      "ROLE_INVALID_TARGET",
      "Validation failed",
      "指定的權限不在受控目錄內。",
      requestId
    );
  }
  if (error instanceof RoleInvalidTargetError) {
    return roleProblem(
      422,
      "ROLE_INVALID_TARGET",
      "Validation failed",
      "必須提供有效的身份組。",
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

function idempotencyKeyFor(request: Request): string | null {
  const key = request.headers.get("Idempotency-Key")?.trim() ?? "";
  return key.length > 0 && key.length <= 200 ? key : null;
}

/** GET /api/v1/identity/role-definitions/:id. */
export async function handleGetRoleDefinitionDetail(
  request: Request,
  env: RoleEnv,
  roleDefinitionId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  try {
    const detail = await loadRoleDefinitionDetail(
      env.DB,
      auth.account.user_id,
      roleDefinitionId
    );
    return roleSuccess(200, detail, requestId);
  } catch (error) {
    return mapPermissionError(error, requestId);
  }
}

/** PATCH /api/v1/identity/role-definitions/:id/grants. */
export async function handleUpdateRoleDefinitionGrants(
  request: Request,
  env: RoleEnv,
  roleDefinitionId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const idempotencyKey = idempotencyKeyFor(request);
  if (idempotencyKey === null) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "Idempotency-Key header is required for identity permission changes.",
      requestId
    );
  }
  let body: GrantsBody;
  try {
    body = (await request.json()) as GrantsBody;
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
    !hasOnlyKeys(body, ["base_revision", "changes"]) ||
    typeof body.base_revision !== "number" ||
    !Number.isInteger(body.base_revision) ||
    body.base_revision < 1 ||
    !Array.isArray(body.changes)
  ) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "base_revision and changes are required; actor identity comes from the access cookie.",
      requestId
    );
  }
  if (body.changes.length > 100) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "changes cannot contain more than 100 entries.",
      requestId
    );
  }
  for (const change of body.changes) {
    if (
      typeof change !== "object" ||
      change === null ||
      !hasOnlyKeys(change, ["capability", "value"]) ||
      !("capability" in change) ||
      typeof change.capability !== "string" ||
      !("value" in change) ||
      typeof change.value !== "boolean"
    ) {
      return roleProblem(
        422,
        "ROLE_INVALID_TARGET",
        "Validation failed",
        "每項權限變更都需要有效的 capability 及 value。",
        requestId
      );
    }
  }
  try {
    const changes = body.changes as PermissionGrantChange[];
    const result = await updateRoleDefinitionGrants(env.DB, {
      actor_user_id: auth.account.user_id,
      role_definition_id: roleDefinitionId,
      base_revision: body.base_revision,
      idempotency_key: idempotencyKey,
      changes,
      now: new Date().toISOString(),
      audit_id: crypto.randomUUID(),
      correlation_id: requestId,
    });
    return roleSuccess(200, result, requestId);
  } catch (error) {
    return mapPermissionError(error, requestId);
  }
}

export const __test = {
  idempotencyKeyFor,
  mapPermissionError,
  isCapability,
};
