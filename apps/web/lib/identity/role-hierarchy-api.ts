/**
 * #478 — client surface for the 身份組 hierarchy + rename mutation.
 *
 * Thin cookie-only fetch wrapper mirroring `apps/web/lib/programs/program-api.ts`
 * (same transport rules: no auth headers, Idempotency-Key on mutations,
 * RFC 9457 problems surfaced as `RpcError`). The server is always the
 * authority (Spec 091 §10); this module only renders what the Worker
 * projects.
 */
import {
  RoleCreateResultSchema,
  RoleDefinitionDetailViewSchema,
  RoleHierarchyViewSchema,
  RoleRenameResultSchema,
  RoleReorderResultSchema,
  RoleRescopeResultSchema,
  parseProblemDetails,
  parseSuccessEnvelope,
  problemFallback,
} from "@efcc/contracts";

import { RpcError } from "@/lib/api";
import type { ProblemDetails } from "@/lib/api";
import type {
  PermissionGrantChange,
  RoleDefinitionDetailView,
  RoleHierarchyView,
  RoleRenameResult,
  RoleCreateResult,
  RoleRescopeResult,
  RoleReorderResult,
} from "@/lib/identity";

async function roleFetch<T>(
  path: string,
  method: "GET" | "PATCH" | "POST",
  payloadSchema: { safeParse: (value: unknown) => { success: boolean } },
  body?: unknown,
  idempotencyKey?: string
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(method === "GET"
          ? {}
          : { "Idempotency-Key": idempotencyKey ?? crypto.randomUUID() }),
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

  const requestId = res.headers.get("X-Request-Id") ?? undefined;
  if (res.ok) {
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      throw new RpcError({
        status: res.status,
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
        status: res.status,
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
    parsedError = await res.json();
  } catch {
    parsedError = null;
  }
  // Shared error contract (#655): well-formed problems keep their codes
  // and extensions; anything else falls back with status + requestId.
  const problem =
    parseProblemDetails(parsedError, res.status, requestId) ??
    problemFallback(
      res.status,
      requestId,
      "UNAVAILABLE",
      "Upstream error",
      "系統暫時無法處理請求，請稍後再試。"
    );
  throw new RpcError(problem as ProblemDetails);
}

/** GET /api/v1/identity/roles — the read-only hierarchy projection. */
export function getRoleHierarchy(): Promise<RoleHierarchyView> {
  return roleFetch<RoleHierarchyView>(
    "/api/v1/identity/roles",
    "GET",
    RoleHierarchyViewSchema
  );
}

/** GET /api/v1/identity/role-definitions/:id — one safe detail projection. */
export function getRoleDefinitionDetail(
  roleDefinitionId: string
): Promise<RoleDefinitionDetailView> {
  return roleFetch<RoleDefinitionDetailView>(
    `/api/v1/identity/role-definitions/${encodeURIComponent(roleDefinitionId)}`,
    "GET",
    RoleDefinitionDetailViewSchema
  );
}

/**
 * PATCH /api/v1/identity/role-definitions/:id/grants — revision-bound grant
 * replacement. The Worker derives the actor from the cookie and validates the
 * closed catalog; this client only serializes the public request shape.
 */
export function updateRoleDefinitionGrants(
  roleDefinitionId: string,
  input: {
    baseRevision: number;
    changes: readonly PermissionGrantChange[];
  },
  idempotencyKey?: string
): Promise<RoleDefinitionDetailView> {
  return roleFetch<RoleDefinitionDetailView>(
    `/api/v1/identity/role-definitions/${encodeURIComponent(roleDefinitionId)}/grants`,
    "PATCH",
    RoleDefinitionDetailViewSchema,
    {
      base_revision: input.baseRevision,
      changes: input.changes,
    },
    idempotencyKey
  );
}

/**
 * PATCH /api/v1/identity/roles/:id/name — one complete rename mutation.
 * Pass a stable idempotency key to replay a lost response; the server
 * computes the canonical request fingerprint itself (Spec 091 §11), so a
 * client-supplied fingerprint is never the authority.
 */
export function renameRoleDefinition(
  roleDefinitionId: string,
  input: {
    label: string;
    baseRevision: number;
  },
  idempotencyKey?: string
): Promise<RoleRenameResult> {
  return roleFetch<RoleRenameResult>(
    `/api/v1/identity/roles/${encodeURIComponent(roleDefinitionId)}/name`,
    "PATCH",
    RoleRenameResultSchema,
    {
      label: input.label,
      base_revision: input.baseRevision,
    },
    idempotencyKey
  );
}

/**
 * POST /api/v1/identity/role-definitions — #479 creation (B-479-01/B-479-14).
 * The server recomputes the actor's creation authority from D1; the client
 * only sends the fixed Category and explicit scope the projection offered.
 */
export function createRoleDefinition(
  input: {
    category_key: "Global" | "Department" | "Program";
    label: string;
    description: string;
    scope_kind: "Global" | "Department" | "Program";
    scope_id: string | null;
    base_revision: number;
  },
  idempotencyKey?: string
): Promise<RoleCreateResult> {
  return roleFetch<RoleCreateResult>(
    "/api/v1/identity/role-definitions",
    "POST",
    RoleCreateResultSchema,
    {
      category_key: input.category_key,
      label: input.label,
      description: input.description,
      scope_kind: input.scope_kind,
      scope_id: input.scope_id,
      base_revision: input.base_revision,
    },
    idempotencyKey
  );
}

/**
 * PATCH /api/v1/identity/roles/order — #479 sibling-only reorder
 * (B-479-07/B-479-08). Pass a stable idempotency key to replay a lost
 * response; the server computes the canonical fingerprint itself.
 */
export function reorderRoleDefinitions(
  categoryKey: "Global" | "Department" | "Program",
  targets: { role_definition_id: string; position: number }[],
  baseRevision: number,
  idempotencyKey?: string
): Promise<RoleReorderResult> {
  return roleFetch<RoleReorderResult>(
    "/api/v1/identity/roles/order",
    "PATCH",
    RoleReorderResultSchema,
    {
      category_key: categoryKey,
      targets,
      base_revision: baseRevision,
    },
    idempotencyKey
  );
}
/**
 * PATCH /api/v1/identity/role-definitions/:id/scope — #479 scope edit.
 * The server derives the fixed parent from scope_kind and rechecks actor
 * authority; category_key is an optional integrity echo for tamper detection.
 */
export function rescopeRoleDefinition(
  roleDefinitionId: string,
  input: {
    category_key?: "Global" | "Department" | "Program";
    scope_kind: "Global" | "Department" | "Program";
    scope_id: string | null;
    base_revision: number;
  },
  idempotencyKey?: string
): Promise<RoleRescopeResult> {
  return roleFetch<RoleRescopeResult>(
    `/api/v1/identity/role-definitions/${encodeURIComponent(roleDefinitionId)}/scope`,
    "PATCH",
    RoleRescopeResultSchema,
    {
      ...(input.category_key === undefined
        ? {}
        : { category_key: input.category_key }),
      scope_kind: input.scope_kind,
      scope_id: input.scope_id,
      base_revision: input.base_revision,
    },
    idempotencyKey
  );
}
