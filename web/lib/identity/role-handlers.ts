/**
 * #478 — S5-A03 Worker/HTTP seam for the 身份組 hierarchy and rename
 * mutation (Spec 091 §9.3, ADR-0042).
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
 *   * GET  /api/v1/identity/roles            → role hierarchy projection
 *   * PATCH /api/v1/identity/roles/:id/name  → rename mutation
 *
 * The rename path requires the `Idempotency-Key` header (ADR-0018 §8); a
 * replay of the same key + request fingerprint returns the original
 * result, and a key reused with a different fingerprint is rejected with
 * `ROLE_IDEMPOTENCY_REUSE` (H-13, Spec 091 §9.3). The fingerprint is
 * computed server-side from the request semantics; a client-supplied
 * value is never the authority.
 */
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
  ROLE_NAME_MAX_LENGTH,
  RoleAdminProtectedError,
  RoleBaselineProtectedError,
  RoleCapabilityDeniedError,
  RoleHighestProtectedError,
  RoleNameConflictError,
  RoleProtectedIdentityError,
  RoleScopeMismatchError,
  RoleSelfRenameError,
  RoleTargetNotFoundError,
} from "./role-hierarchy";
import type { RoleRenameResult } from "./role-hierarchy";

export interface RoleEnv {
  DB: D1Database;
  EFCC_ACCESS_TOKEN_SECRET: string;
}

/** A rename request body; every field is validated before any D1 call. */
interface RenameBody {
  label?: unknown;
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
