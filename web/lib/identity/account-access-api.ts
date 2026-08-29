import { RpcError } from "@/lib/api";
import type { ProblemDetails } from "@/lib/api";

import type {
  AccountAccessMutationResult,
  AccountAccessView,
  RoleDefinitionLifecyclePreview,
  RoleDefinitionLifecycleResult,
} from "./account-access";

type AccountSuccess<T> = { requestId: string; data: T };

async function accountFetch<T>(
  path: string,
  method: "GET" | "POST",
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
      });
    }
    if (typeof parsed !== "object" || parsed === null || !("data" in parsed)) {
      throw new RpcError({
        status: response.status,
        code: "MALFORMED_RESPONSE",
        title: "Malformed success envelope",
        detail: "伺服器回應格式錯誤。",
      });
    }
    return (parsed as AccountSuccess<T>).data;
  }
  const requestId = response.headers.get("X-Request-Id") ?? undefined;
  let problem: ProblemDetails;
  try {
    problem = (await response.json()) as ProblemDetails;
  } catch {
    problem = { status: response.status, code: "UNAVAILABLE", requestId };
  }
  if (typeof problem !== "object" || problem === null) {
    problem = { status: response.status, code: "UNAVAILABLE", requestId };
  }
  if (typeof problem.status !== "number") {
    problem.status = response.status;
  }
  if (requestId && !problem.requestId) {
    problem.requestId = requestId;
  }
  throw new RpcError(problem);
}

export interface EligibleAccountSearchResult {
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
}

export function searchEligibleAccounts(
  query: string,
  options?: { offset?: number; limit?: number }
): Promise<EligibleAccountSearchResult> {
  const params = new URLSearchParams({ q: query });
  if (options?.offset !== undefined)
    params.set("offset", String(options.offset));
  if (options?.limit !== undefined) params.set("limit", String(options.limit));
  return accountFetch(`/api/v1/identity/accounts?${params.toString()}`, "GET");
}

export function getAccountAccess(
  accountUserId: string
): Promise<AccountAccessView> {
  return accountFetch(
    `/api/v1/identity/accounts/${encodeURIComponent(accountUserId)}/assignments`,
    "GET"
  );
}

export function mutateAccountAssignments(
  accountUserId: string,
  input: { baseRevision: number; roleDefinitionIds: readonly string[] },
  idempotencyKey?: string
): Promise<AccountAccessMutationResult> {
  return accountFetch(
    `/api/v1/identity/accounts/${encodeURIComponent(accountUserId)}/assignments`,
    "POST",
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
  return accountFetch(
    `/api/v1/identity/accounts/${encodeURIComponent(accountUserId)}/assignments/revoke`,
    "POST",
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
  return accountFetch(
    `/api/v1/identity/role-definitions/${encodeURIComponent(roleDefinitionId)}/lifecycle?${params.toString()}`,
    "GET"
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
  return accountFetch(
    `/api/v1/identity/role-definitions/${encodeURIComponent(roleDefinitionId)}/lifecycle`,
    "POST",
    {
      action: input.action,
      base_revision: input.baseRevision,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    },
    idempotencyKey
  );
}
export const getEligibleAccounts = searchEligibleAccounts;
export const getAccountAssignments = getAccountAccess;

export const __test = { accountFetch };
