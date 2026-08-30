import {
  AccountAdminProtectedError,
  AccountRevokeTargetError,
  AccountSelfProtectedError,
  AccountTargetIneligibleError,
  getRoleDefinitionLifecyclePreview,
  loadAccountAccess,
  mutateAccountAssignments,
  mutateRoleDefinitionLifecycle,
  revokeAccountAssignments,
  searchEligibleAccounts,
} from "./account-access";
import type {
  AccountAccessMutationResult,
  RoleDefinitionLifecycleResult,
} from "./account-access";
import {
  RoleIdempotencyConflictError,
  RoleRevisionConflictError,
} from "./mutations";
import { requireActor, roleProblem, roleSuccess } from "./role-handlers";
import type { RoleEnv } from "./role-handlers";
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

/* oxlint-disable eslint/complexity -- transport guards are intentionally explicit so malformed input fails before any D1 query or mutation. */

type AssignmentsBody = {
  base_revision?: unknown;
  role_definition_ids?: unknown;
};
const MAX_ASSIGNMENT_ROLE_IDS = 50;

type LifecycleBody = {
  action?: unknown;
  base_revision?: unknown;
  reason?: unknown;
};

function hasOnlyKeys(value: object, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function idempotencyKeyFor(request: Request): string | null {
  const key = request.headers.get("Idempotency-Key")?.trim() ?? "";
  return key.length > 0 && key.length <= 200 ? key : null;
}

function mapAccountAccessError(error: unknown, requestId: string): Response {
  if (error instanceof RoleCapabilityDeniedError) {
    return roleProblem(
      403,
      "ROLE_FORBIDDEN",
      "Forbidden",
      "您沒有權限執行此操作。",
      requestId
    );
  }
  if (
    error instanceof AccountAdminProtectedError ||
    error instanceof RoleAdminProtectedError
  ) {
    return roleProblem(
      403,
      "ROLE_ADMIN_PROTECTED",
      "Forbidden",
      "系統管理員帳戶或身份組不可指派。",
      requestId
    );
  }
  if (error instanceof RoleBaselineProtectedError) {
    return roleProblem(
      403,
      "ROLE_BASELINE_PROTECTED",
      "Forbidden",
      "會友基礎不可指派或撤銷。",
      requestId
    );
  }
  if (
    error instanceof AccountSelfProtectedError ||
    error instanceof RoleHighestProtectedError
  ) {
    return roleProblem(
      403,
      "ROLE_HIGHEST_PROTECTED",
      "Forbidden",
      "不可變更自己或同等以上順位的身份組。",
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
  if (error instanceof AccountTargetIneligibleError) {
    return roleProblem(
      422,
      "ROLE_TARGET_INELIGIBLE",
      "Validation failed",
      "只能選擇生效中的非管理員帳戶。",
      requestId
    );
  }
  if (error instanceof RoleArchivedError) {
    return roleProblem(
      403,
      "ROLE_ARCHIVED",
      "Forbidden",
      "已停用的身份組不可指派。",
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
  if (
    error instanceof RoleInvalidTargetError ||
    error instanceof AccountRevokeTargetError
  ) {
    return roleProblem(
      422,
      "ROLE_INVALID_TARGET",
      "Validation failed",
      "必須提供有效的身份組清單。",
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
      {
        currentRevision: error.currentRevision,
        data: { authoritativeRevision: error.currentRevision },
      }
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
  return roleProblem(
    500,
    "INTERNAL_ERROR",
    "Internal error",
    "伺服器未能完成此操作，請稍後再試。",
    requestId
  );
}

async function parseAssignmentsBody(
  request: Request,
  requestId: string
): Promise<AssignmentsBody | Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "Request body must be valid JSON。",
      requestId
    );
  }
  if (typeof body !== "object" || body === null) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "base_revision and role_definition_ids are required。",
      requestId
    );
  }
  const candidate = body as Record<string, unknown>;
  const baseRevision = candidate.base_revision;
  const roleDefinitionIds = candidate.role_definition_ids;
  if (
    !hasOnlyKeys(candidate, ["base_revision", "role_definition_ids"]) ||
    typeof baseRevision !== "number" ||
    !Number.isInteger(baseRevision) ||
    baseRevision < 1 ||
    !Array.isArray(roleDefinitionIds) ||
    !roleDefinitionIds.every(
      (id: unknown) => typeof id === "string" && id.length > 0
    )
  ) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "base_revision and role_definition_ids are required。",
      requestId
    );
  }
  if (roleDefinitionIds.length > MAX_ASSIGNMENT_ROLE_IDS) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      `role_definition_ids must contain at most ${MAX_ASSIGNMENT_ROLE_IDS} identities。`,
      requestId
    );
  }
  return {
    base_revision: baseRevision,
    role_definition_ids: roleDefinitionIds,
  };
}

function assignmentInput(
  body: AssignmentsBody,
  actorUserId: string,
  accountUserId: string,
  requestId: string,
  idempotencyKey: string
): {
  actor_user_id: string;
  account_user_id: string;
  base_revision: number;
  role_definition_ids: readonly string[];
  idempotency_key: string;
  now: string;
  audit_id: string;
  correlation_id: string;
} {
  return {
    actor_user_id: actorUserId,
    account_user_id: accountUserId,
    base_revision: body.base_revision as number,
    role_definition_ids: body.role_definition_ids as string[],
    idempotency_key: idempotencyKey,
    now: new Date().toISOString(),
    audit_id: crypto.randomUUID(),
    correlation_id: requestId,
  };
}

/** GET /api/v1/identity/accounts?q=...&offset=...&limit=... */
export async function handleSearchEligibleAccounts(
  request: Request,
  env: RoleEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const offsetValue = Number(url.searchParams.get("offset") ?? "0");
  const limitValue = Number(url.searchParams.get("limit") ?? "20");
  if (
    !Number.isInteger(offsetValue) ||
    offsetValue < 0 ||
    !Number.isInteger(limitValue) ||
    limitValue < 1 ||
    limitValue > 100
  ) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "offset 和 limit 必須是有效的整數。",
      requestId
    );
  }
  try {
    const data = await searchEligibleAccounts(
      env.DB,
      auth.account.user_id,
      query,
      offsetValue,
      limitValue
    );
    return roleSuccess(200, data, requestId);
  } catch (error) {
    return mapAccountAccessError(error, requestId);
  }
}

/** GET /api/v1/identity/accounts/:userId/assignments */
export async function handleGetAccountAccess(
  request: Request,
  env: RoleEnv,
  accountUserId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  try {
    const data = await loadAccountAccess(
      env.DB,
      auth.account.user_id,
      accountUserId
    );
    return roleSuccess(200, data, requestId);
  } catch (error) {
    return mapAccountAccessError(error, requestId);
  }
}

/** POST /api/v1/identity/accounts/:userId/assignments — additive grant batch. */
export async function handleMutateAccountAssignments(
  request: Request,
  env: RoleEnv,
  accountUserId: string
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
      "Idempotency-Key header is required。",
      requestId
    );
  }
  const parsed = await parseAssignmentsBody(request, requestId);
  if (parsed instanceof Response) {
    return parsed;
  }
  if (
    parsed.role_definition_ids instanceof Array &&
    parsed.role_definition_ids.length === 0
  ) {
    return roleProblem(
      422,
      "ROLE_INVALID_TARGET",
      "Validation failed",
      "新增身份組不可使用空清單；撤銷請使用 /revoke 路徑。",
      requestId
    );
  }
  try {
    const data: AccountAccessMutationResult = await mutateAccountAssignments(
      env.DB,
      assignmentInput(
        parsed,
        auth.account.user_id,
        accountUserId,
        requestId,
        idempotencyKey
      )
    );
    return roleSuccess(200, data, requestId);
  } catch (error) {
    return mapAccountAccessError(error, requestId);
  }
}

/** POST /api/v1/identity/accounts/:userId/assignments/revoke — explicit revoke batch. */
export async function handleRevokeAccountAssignments(
  request: Request,
  env: RoleEnv,
  accountUserId: string
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
      "Idempotency-Key header is required。",
      requestId
    );
  }
  const parsed = await parseAssignmentsBody(request, requestId);
  if (parsed instanceof Response) {
    return parsed;
  }
  if (
    parsed.role_definition_ids instanceof Array &&
    parsed.role_definition_ids.length === 0
  ) {
    return roleProblem(
      422,
      "ROLE_INVALID_TARGET",
      "Validation failed",
      "撤銷時必須指定身份組。",
      requestId
    );
  }
  try {
    const data: AccountAccessMutationResult = await revokeAccountAssignments(
      env.DB,
      assignmentInput(
        parsed,
        auth.account.user_id,
        accountUserId,
        requestId,
        idempotencyKey
      )
    );
    return roleSuccess(200, data, requestId);
  } catch (error) {
    return mapAccountAccessError(error, requestId);
  }
}

/** POST /api/v1/identity/role-definitions/:id/lifecycle — archive/restore. */
export async function handleRoleDefinitionLifecycle(
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
      "Idempotency-Key header is required。",
      requestId
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "Request body must be valid JSON。",
      requestId
    );
  }
  if (typeof body !== "object" || body === null) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "action 和 base_revision 必須有效。",
      requestId
    );
  }
  const candidate = body as Record<string, unknown>;
  const action = candidate.action;
  const baseRevision = candidate.base_revision;
  const reason = candidate.reason;
  if (
    !hasOnlyKeys(candidate, ["action", "base_revision", "reason"]) ||
    (action !== "archive" && action !== "restore") ||
    typeof baseRevision !== "number" ||
    !Number.isInteger(baseRevision) ||
    baseRevision < 1 ||
    (reason !== undefined && typeof reason !== "string")
  ) {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "action 和 base_revision 必須有效。",
      requestId
    );
  }
  try {
    const typed = body as LifecycleBody;
    const data: RoleDefinitionLifecycleResult =
      await mutateRoleDefinitionLifecycle(env.DB, {
        actor_user_id: auth.account.user_id,
        role_definition_id: roleDefinitionId,
        action: typed.action as "archive" | "restore",
        base_revision: typed.base_revision as number,
        reason: (typed.reason as string | undefined)?.trim() || null,
        idempotency_key: idempotencyKey,
        now: new Date().toISOString(),
        audit_id: crypto.randomUUID(),
        correlation_id: requestId,
      });
    return roleSuccess(200, data, requestId);
  } catch (error) {
    return mapAccountAccessError(error, requestId);
  }
}

/** GET /api/v1/identity/role-definitions/:id/lifecycle?action=archive|restore */
export async function handleGetRoleDefinitionLifecyclePreview(
  request: Request,
  env: RoleEnv,
  roleDefinitionId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const action = new URL(request.url).searchParams.get("action");
  if (action !== "archive" && action !== "restore") {
    return roleProblem(
      422,
      "VALIDATION",
      "Validation failed",
      "action 必須是 archive 或 restore。",
      requestId
    );
  }
  try {
    const data = await getRoleDefinitionLifecyclePreview(
      env.DB,
      auth.account.user_id,
      roleDefinitionId,
      action
    );
    return roleSuccess(200, data, requestId);
  } catch (error) {
    return mapAccountAccessError(error, requestId);
  }
}

export const __test = {
  hasOnlyKeys,
  idempotencyKeyFor,
  mapAccountAccessError,
};
