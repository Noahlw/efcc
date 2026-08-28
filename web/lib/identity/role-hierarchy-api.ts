/**
 * #478 — client surface for the 身份組 hierarchy + rename mutation.
 *
 * Thin cookie-only fetch wrapper mirroring `web/lib/programs/program-api.ts`
 * (same transport rules: no auth headers, Idempotency-Key on mutations,
 * RFC 9457 problems surfaced as `RpcError`). The server is always the
 * authority (Spec 091 §10); this module only renders what the Worker
 * projects.
 */
import { RpcError } from "@/lib/api";
import type { ProblemDetails } from "@/lib/api";
import type {
  RoleHierarchyView,
  RoleRenameResult,
  RoleCreateResult,
  RoleReorderResult,
} from "@/lib/identity";

interface RoleSuccess<T> {
  requestId: string;
  data: T;
}

async function roleFetch<T>(
  path: string,
  method: "GET" | "PATCH" | "POST",
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
      });
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { data?: unknown }).data === undefined
    ) {
      throw new RpcError({
        status: res.status,
        code: "MALFORMED_RESPONSE",
        title: "Malformed success envelope",
        detail: "伺服器回應格式錯誤。",
      });
    }
    return (parsed as RoleSuccess<T>).data as T;
  }

  const requestId = res.headers.get("X-Request-Id") ?? undefined;
  let problem: ProblemDetails;
  try {
    problem = (await res.json()) as ProblemDetails;
  } catch {
    problem = { status: res.status, code: "UNAVAILABLE", requestId };
  }
  if (typeof problem !== "object" || problem === null) {
    problem = { status: res.status, code: "UNAVAILABLE", requestId };
  }
  if (typeof problem.status !== "number") {
    problem.status = res.status;
  }
  if (requestId && !problem.requestId) {
    problem.requestId = requestId;
  }
  throw new RpcError(problem);
}

/** GET /api/v1/identity/roles — the read-only hierarchy projection. */
export function getRoleHierarchy(): Promise<RoleHierarchyView> {
  return roleFetch("/api/v1/identity/roles", "GET");
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
  return roleFetch(
    `/api/v1/identity/roles/${encodeURIComponent(roleDefinitionId)}/name`,
    "PATCH",
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
  return roleFetch(
    "/api/v1/identity/role-definitions",
    "POST",
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
  return roleFetch(
    "/api/v1/identity/roles/order",
    "PATCH",
    {
      category_key: categoryKey,
      targets,
      base_revision: baseRevision,
    },
    idempotencyKey
  );
}
