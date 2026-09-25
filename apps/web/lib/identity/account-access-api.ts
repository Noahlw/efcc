import type { EligibleAccountSearch } from "@efcc/contracts";
import {
  AccountAccessMutationResultSchema,
  AccountAccessViewSchema,
  EligibleAccountSearchSchema,
  RoleDefinitionLifecyclePreviewSchema,
  RoleDefinitionLifecycleResultSchema,
  parseProblemDetails,
  parseSuccessEnvelope,
  problemFallback,
} from "@efcc/contracts";

import { RpcError } from "@/lib/api";
import type { ProblemDetails } from "@/lib/api";

import type {
  AccountAccessMutationResult,
  AccountAccessView,
  RoleDefinitionLifecyclePreview,
  RoleDefinitionLifecycleResult,
} from "./account-access";

async function accountFetch<T>(
  path: string,
  method: "GET" | "POST",
  payloadSchema: { safeParse: (value: unknown) => { success: boolean } },
  body?: unknown,
  idempotencyKey?: string
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(method === "POST"
          ? { "Idempotency-Key": idempotencyKey ?? crypto.randomUUID() }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(method === "GET" ? { cache: "no-store" } : {}),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new RpcError({
      status: 0,
      code: "NETWORK_ERROR",
      title: "Network error",
      detail: "無法連接伺服器，請檢查網路後再試。",
    });
  }
  const requestId = response.headers.get("X-Request-Id") ?? undefined;
  if (response.ok) {
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new RpcError({
        status: response.status,
        code: "MALFORMED_RESPONSE",
        title: "Malformed success response",
        detail: "伺服器回應格式錯誤。",
        requestId,
      });
    }
    const envelope = parseSuccessEnvelope(parsed);
    // Shared contract gate (#655): malformed 2xx data is
    // MALFORMED_RESPONSE, never a partial success.
    if (!envelope || !payloadSchema.safeParse(envelope.data).success) {
      throw new RpcError({
        status: response.status,
        code: "MALFORMED_RESPONSE",
        title: "Malformed success envelope",
        detail: "伺服器回應格式錯誤。",
        requestId,
      });
    }
    return envelope.data as T;
  }
  let parsedError: unknown;
  try {
    parsedError = await response.json();
  } catch {
    parsedError = null;
  }
  const problem =
    parseProblemDetails(parsedError, response.status, requestId) ??
    problemFallback(
      response.status,
      requestId,
      "UNAVAILABLE",
      "Upstream error",
      "系統暫時無法處理請求，請稍後再試。"
    );
  throw new RpcError(problem as ProblemDetails);
}

export type EligibleAccountSearchResult = EligibleAccountSearch;

export function searchEligibleAccounts(
  query: string,
  options?: { offset?: number; limit?: number }
): Promise<EligibleAccountSearchResult> {
  const params = new URLSearchParams({ q: query });
  if (options?.offset !== undefined)
    params.set("offset", String(options.offset));
  if (options?.limit !== undefined) params.set("limit", String(options.limit));
  return accountFetch<EligibleAccountSearchResult>(
    `/api/v1/identity/accounts?${params.toString()}`,
    "GET",
    EligibleAccountSearchSchema
  );
}

export function getAccountAccess(
  accountUserId: string
): Promise<AccountAccessView> {
  return accountFetch<AccountAccessView>(
    `/api/v1/identity/accounts/${encodeURIComponent(accountUserId)}/assignments`,
    "GET",
    AccountAccessViewSchema
  );
}

export function mutateAccountAssignments(
  accountUserId: string,
  input: { baseRevision: number; roleDefinitionIds: readonly string[] },
  idempotencyKey?: string
): Promise<AccountAccessMutationResult> {
  return accountFetch<AccountAccessMutationResult>(
    `/api/v1/identity/accounts/${encodeURIComponent(accountUserId)}/assignments`,
    "POST",
    AccountAccessMutationResultSchema,
    {
      base_revision: input.baseRevision,
      role_definition_ids: input.roleDefinitionIds,
    },
    idempotencyKey
  );
}

export function revokeAccountAssignments(
  accountUserId: string,
  input: { baseRevision: number; roleDefinitionIds: readonly string[] },
  idempotencyKey?: string
): Promise<AccountAccessMutationResult> {
  return accountFetch<AccountAccessMutationResult>(
    `/api/v1/identity/accounts/${encodeURIComponent(accountUserId)}/assignments/revoke`,
    "POST",
    AccountAccessMutationResultSchema,
    {
      base_revision: input.baseRevision,
      role_definition_ids: input.roleDefinitionIds,
    },
    idempotencyKey
  );
}

export function getRoleDefinitionLifecyclePreview(
  roleDefinitionId: string,
  action: "archive" | "restore"
): Promise<RoleDefinitionLifecyclePreview> {
  const params = new URLSearchParams({ action });
  return accountFetch<RoleDefinitionLifecyclePreview>(
    `/api/v1/identity/role-definitions/${encodeURIComponent(roleDefinitionId)}/lifecycle?${params.toString()}`,
    "GET",
    RoleDefinitionLifecyclePreviewSchema
  );
}
export function updateRoleDefinitionLifecycle(
  roleDefinitionId: string,
  input: {
    action: "archive" | "restore";
    baseRevision: number;
    reason?: string;
  },
  idempotencyKey?: string
): Promise<RoleDefinitionLifecycleResult> {
  return accountFetch<RoleDefinitionLifecycleResult>(
    `/api/v1/identity/role-definitions/${encodeURIComponent(roleDefinitionId)}/lifecycle`,
    "POST",
    RoleDefinitionLifecycleResultSchema,
    {
      action: input.action,
      base_revision: input.baseRevision,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    },
    idempotencyKey
  );
}

export const __test = { accountFetch };
