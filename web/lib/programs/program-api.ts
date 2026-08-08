/**
 * EFCC Programs domain — browser client for `/api/v1/programs/*` (PRG-01
 * #197). Same transport contract as the auth surface: identity travels only
 * in the server-set httpOnly cookies, requests are same-origin, and every
 * success is `{ requestId, data }` with `X-Request-Id` on the wire. Errors
 * are RFC 9457 Problem Details surfaced as RpcError (shared with api.ts).
 */

import { RpcError } from "@/lib/api";
import type { ProblemDetails } from "@/lib/api";

export interface Department {
  department_id: string;
  code: string;
  name: string;
  description: string | null;
  lifecycle: "Draft" | "PendingDevelopment" | "Active" | "Archived";
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface DepartmentModule {
  department_id: string;
  module_key:
    | "program_catalog"
    | "enrollment"
    | "events"
    | "attendance"
    | "custom_forms";
  enabled: number;
  enabled_at: string;
}

export interface Program {
  program_id: string;
  department_id: string;
  name: string;
  description: string | null;
  category: string | null;
  behavior_type: "Recurring" | "OneOff";
  lifecycle: "Draft" | "Active" | "Archived";
  discoverability: "Listed" | "Unlisted";
  enrollment_mode: "MemberRequest" | "ManagerOnly";
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface DepartmentDetail {
  department: Department;
  modules: DepartmentModule[];
}

export interface DepartmentInput {
  code: string;
  name: string;
  description?: string;
  lifecycle?: Department["lifecycle"];
}

export interface ProgramInput {
  name: string;
  description?: string;
  behavior_type: Program["behavior_type"];
  discoverability?: Program["discoverability"];
}

interface ProgramsSuccess<T> {
  requestId: string;
  data: T;
}

/** One fetch to the cookie-only programs surface. Never builds auth headers. */
async function programsFetch<T>(
  path: string,
  method: "POST" | "GET" | "PATCH",
  body?: unknown
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
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
    return (parsed as ProgramsSuccess<T>).data as T;
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

/** GET /api/v1/programs/departments */
export function listDepartments(): Promise<{
  departments: Department[];
}> {
  return programsFetch("/api/v1/programs/departments", "GET");
}

/** POST /api/v1/programs/departments */
export function createDepartment(
  input: DepartmentInput
): Promise<{ department: Department }> {
  return programsFetch("/api/v1/programs/departments", "POST", input);
}

/** PATCH /api/v1/programs/departments/:id */
export function updateDepartment(
  departmentId: string,
  patch: Partial<Pick<Department, "name" | "description" | "lifecycle">>
): Promise<{ department: Department }> {
  return programsFetch(
    `/api/v1/programs/departments/${encodeURIComponent(departmentId)}`,
    "PATCH",
    patch
  );
}

/** GET /api/v1/programs/departments/:id — department plus its modules. */
export function getDepartment(departmentId: string): Promise<DepartmentDetail> {
  return programsFetch(
    `/api/v1/programs/departments/${encodeURIComponent(departmentId)}`,
    "GET"
  );
}

/** GET /api/v1/programs/departments/:id/programs — server-filtered by discoverability. */
export function listPrograms(
  departmentId: string
): Promise<{ programs: Program[] }> {
  return programsFetch(
    `/api/v1/programs/departments/${encodeURIComponent(departmentId)}/programs`,
    "GET"
  );
}

/** POST /api/v1/programs/departments/:id/programs */
export function createProgram(
  departmentId: string,
  input: ProgramInput
): Promise<{ program: Program }> {
  return programsFetch(
    `/api/v1/programs/departments/${encodeURIComponent(departmentId)}/programs`,
    "POST",
    input
  );
}

/** POST /api/v1/programs/departments/:id/modules/:key/(enable|disable) */
export function setDepartmentModule(
  departmentId: string,
  moduleKey: string,
  enabled: boolean
): Promise<{ enabled: boolean }> {
  return programsFetch(
    `/api/v1/programs/departments/${encodeURIComponent(departmentId)}/modules/${encodeURIComponent(moduleKey)}/${enabled ? "enable" : "disable"}`,
    "POST"
  );
}
