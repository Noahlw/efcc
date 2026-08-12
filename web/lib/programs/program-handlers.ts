/**
 * EFCC Programs domain — Worker route handlers for `/api/v1/programs/*`.
 *
 * All routes are cookie-only (same transport as auth handlers). The handlers are
 * thin adapters: they resolve the actor, delegate to DepartmentWorkspace, and
 * format RFC 9457 Problem Details on failures.
 */

import { findAccountByUserId } from "../auth/accounts";
import type { AccountRow } from "../auth/accounts";
import { ACCESS_COOKIE_NAME } from "../auth/cookies";
import { verifyAccessToken } from "../auth/sessions";
import type { ModuleKey } from "./capabilities";
import {
  AuthorizationDeniedError,
  D1CapabilityAuthorizer,
} from "./capability-authorizer";
import type { AuthorizationContext } from "./capability-authorizer";
import { D1WorkspaceStore, WorkspaceNotFoundError } from "./d1-workspace-store";
import {
  DepartmentManagerConflictError,
  DepartmentManagerNotAssignedError,
  DepartmentWorkspace,
  DuplicateDepartmentCodeError,
  DuplicateEnrollmentError,
  DuplicateEventError,
  DuplicateProgramNameError,
  DuplicateScheduleExceptionError,
  EnrollmentNotAllowedError,
  EventAvailabilityConfirmationRequiredError,
  InvalidModuleKeyError,
  InvalidProgramLifecycleError,
  LeaderAccountInactiveError,
  LeaderNotAssignedError,
  NoScheduleRulesError,
  ProgramArchiveBlockedError,
  RequestNotDecidableError,
  ScheduleRuleNotApplicableError,
  SelfDelegationError,
  SelfDepartmentManagerError,
  ProgramLeaderConflictError,
} from "./department-workspace";
import type {
  CreateEventCommand,
  CreateScheduleRuleCommand,
  EventAvailability,
  UpdateEventCommand,
  DepartmentView,
  UpdateScheduleRuleCommand,
} from "./department-workspace";
import { isWallDate, isWallTime } from "./recurrence";
import type {
  DepartmentManagerRow,
  DepartmentUpdate,
  ProgramUpdate,
  ScheduleRuleRow,
} from "./workspace-store";

export interface ProgramEnv {
  DB: D1Database;
  EFCC_ACCESS_TOKEN_SECRET: string;
}

function departmentManagerDto(row: DepartmentManagerRow) {
  return {
    department_id: row.department_id,
    user_id: row.user_id,
    granted_by: row.granted_by,
    granted_at: row.granted_at,
    revoked_by: row.revoked_by,
    revoked_at: row.revoked_at,
    ...(row.user_name === undefined ? {} : { user_name: row.user_name }),
    ...(row.username === undefined ? {} : { username: row.username }),
  };
}

function departmentDto(row: DepartmentView) {
  return {
    department_id: row.department_id,
    code: row.code,
    name: row.name,
    description: row.description,
    lifecycle: row.lifecycle,
    display_order: row.display_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
    capabilities: row.capabilities,
  };
}

function isDepartmentLifecycle(
  v: unknown
): v is "Draft" | "PendingDevelopment" | "Active" | "Archived" {
  return (
    v === "Draft" ||
    v === "PendingDevelopment" ||
    v === "Active" ||
    v === "Archived"
  );
}

function isProgramBehaviorType(v: unknown): v is "Recurring" | "OneOff" {
  return v === "Recurring" || v === "OneOff";
}

function isProgramLifecycle(v: unknown): v is "Draft" | "Active" | "Archived" {
  return v === "Draft" || v === "Active" || v === "Archived";
}

function isProgramDiscoverability(v: unknown): v is "Listed" | "Unlisted" {
  return v === "Listed" || v === "Unlisted";
}

function isProgramEnrollmentMode(
  v: unknown
): v is "MemberRequest" | "ManagerOnly" {
  return v === "MemberRequest" || v === "ManagerOnly";
}

const INVALID_PROGRAM_VALUE = Symbol("invalid program value");
const PROGRAM_FIELD_PARSERS: Record<string, (value: unknown) => unknown> = {
  name: (value) =>
    typeof value === "string" && value.trim()
      ? value.trim()
      : INVALID_PROGRAM_VALUE,
  description: (value) =>
    value === null || typeof value === "string" ? value : INVALID_PROGRAM_VALUE,
  category: (value) =>
    typeof value === "string" && value.trim()
      ? value.trim()
      : value === null
        ? null
        : INVALID_PROGRAM_VALUE,
  behavior_type: (value) =>
    isProgramBehaviorType(value) ? value : INVALID_PROGRAM_VALUE,
  lifecycle: (value) =>
    isProgramLifecycle(value) ? value : INVALID_PROGRAM_VALUE,
  discoverability: (value) =>
    isProgramDiscoverability(value) ? value : INVALID_PROGRAM_VALUE,
  enrollment_mode: (value) =>
    isProgramEnrollmentMode(value) ? value : INVALID_PROGRAM_VALUE,
  display_order: (value) =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0
      ? value
      : INVALID_PROGRAM_VALUE,
};

function parseProgramFields(
  body: Record<string, unknown>,
  required: readonly string[]
): Record<string, unknown> | null {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    const parser = PROGRAM_FIELD_PARSERS[key];
    if (!parser) {
      return null;
    }
    const parsed = parser(value);
    if (parsed === INVALID_PROGRAM_VALUE) {
      return null;
    }
    fields[key] = parsed;
  }
  return required.every((key) => key in fields) ? fields : null;
}

function problem(
  status: number,
  code: string,
  title: string,
  detail: string | undefined,
  requestId: string,
  extensions?: Record<string, unknown>
): Response {
  const body: Record<string, unknown> = {
    type: `tag:apps-script/efcc/errors#${code}`,
    title,
    status,
    code,
    requestId,
  };
  if (detail !== undefined) {
    body.detail = detail;
  }
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

function validation(requestId: string, detail: string): Response {
  return problem(422, "VALIDATION", "Validation failed", detail, requestId);
}

function notFound(requestId: string, detail: string): Response {
  return problem(404, "NOT_FOUND", "Not found", detail, requestId);
}
function jsonResponse(
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
    const k = pair.slice(0, eq).trim();
    if (k === name) {
      return pair.slice(eq + 1).trim();
    }
  }
  return null;
}

async function requireActor(
  request: Request,
  env: ProgramEnv,
  requestId: string
): Promise<{ account: AccountRow } | Response> {
  const access = readCookie(request.headers, ACCESS_COOKIE_NAME);
  if (!access) {
    return problem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Access cookie missing.",
      requestId
    );
  }
  const claims = await verifyAccessToken(env.EFCC_ACCESS_TOKEN_SECRET, access);
  if (!claims) {
    return problem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Access token invalid or expired.",
      requestId
    );
  }
  const account = await findAccountByUserId(env.DB, claims.uid);
  if (!account) {
    return problem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Unknown account.",
      requestId
    );
  }
  if (account.account_status !== "Active") {
    return problem(
      403,
      "FORBIDDEN",
      "Forbidden",
      "Account is not active.",
      requestId
    );
  }
  return { account };
}

function getModule(env: ProgramEnv): { workspace: DepartmentWorkspace } {
  const store = new D1WorkspaceStore(env.DB);
  const authorizer = new D1CapabilityAuthorizer(store);
  return { workspace: new DepartmentWorkspace(store, authorizer) };
}

function ctxFrom(account: AccountRow): AuthorizationContext {
  return { actorUserId: account.user_id, actorRole: account.role };
}

async function parseJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/** POST /api/v1/programs/departments */
export async function handleCreateDepartment(
  request: Request,
  env: ProgramEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const correlationId = request.headers.get("Idempotency-Key") ?? requestId;
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }

  const body = await parseJson<{
    code?: unknown;
    name?: unknown;
    description?: unknown;
    lifecycle?: unknown;
    display_order?: unknown;
  }>(request);
  if (body === null) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "Body must be JSON.",
      requestId
    );
  }
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!code || !name) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "code and name are required.",
      requestId
    );
  }
  if (
    typeof body.lifecycle !== "string" ||
    !isDepartmentLifecycle(body.lifecycle)
  ) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "lifecycle must be Draft, PendingDevelopment, Active, or Archived.",
      requestId
    );
  }
  if (
    body.display_order !== undefined &&
    typeof body.display_order !== "number"
  ) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "display_order must be a number.",
      requestId
    );
  }

  const { workspace } = await getModule(env);
  try {
    const row = await workspace.createDepartment(
      ctxFrom(auth.account),
      {
        code,
        name,
        description:
          typeof body.description === "string" ? body.description : undefined,
        lifecycle: body.lifecycle,
        display_order:
          typeof body.display_order === "number" ? body.display_order : 0,
      },
      correlationId
    );
    return jsonResponse(201, { department: row }, requestId);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId);
    }
    if (error instanceof DuplicateDepartmentCodeError) {
      return problem(409, "CONFLICT", "Conflict", error.message, requestId);
    }
    throw error;
  }
}

/** GET /api/v1/programs/departments */
export async function handleListDepartments(
  request: Request,
  env: ProgramEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }

  const { workspace } = await getModule(env);
  const rows = await workspace.listDepartments(ctxFrom(auth.account));
  return jsonResponse(200, { departments: rows }, requestId);
}

/** GET /api/v1/programs/access — capability-only Programs entry projection. */
export async function handleListManagementAccess(
  request: Request,
  env: ProgramEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }

  const { workspace } = await getModule(env);
  const access = await workspace.getManagementAccess(ctxFrom(auth.account));
  return jsonResponse(200, access, requestId);
}
/** GET /api/v1/programs/management-directory — scoped, redacted manager rows. */
export async function handleListManagementDirectory(
  request: Request,
  env: ProgramEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const { workspace } = await getModule(env);
  const directory = await workspace.listManagementDirectory(
    ctxFrom(auth.account)
  );
  return jsonResponse(200, directory, requestId);
}

/** GET /api/v1/programs/:id/management — reauthorized safe workspace read. */
export async function handleGetManagementProgram(
  request: Request,
  env: ProgramEnv,
  programId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const { workspace } = await getModule(env);
  const result = await workspace.getManagementProgram(
    ctxFrom(auth.account),
    programId
  );
  if (!result) {
    return notFound(requestId, "Unknown program.");
  }
  return jsonResponse(200, result, requestId);
}

/**
 * GET /api/v1/programs/catalog — narrow participant Programs directory
 * (PUI-02 / Issue #246). Server projects visibility and strips check-in
 * secrets; the browser never sees manager DTO breadth.
 */
export async function handleListParticipantCatalog(
  request: Request,
  env: ProgramEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }

  const { workspace } = await getModule(env);
  const catalog = await workspace.listParticipantCatalog(ctxFrom(auth.account));
  return jsonResponse(200, { catalog }, requestId);
}
/**
 * GET /api/v1/programs/:id/participant-detail — privacy-preserving detail
 * projection for the participant Programs surface.
 */
export async function handleGetParticipantProgramDetail(
  request: Request,
  env: ProgramEnv,
  programId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const { workspace } = await getModule(env);
  const detail = await workspace.getParticipantProgramDetail(
    ctxFrom(auth.account),
    programId
  );
  if (!detail) {
    return notFound(requestId, "Unknown program.");
  }
  return jsonResponse(200, { detail }, requestId);
}

/** GET /api/v1/programs/departments/:id */
export async function handleGetDepartment(
  request: Request,
  env: ProgramEnv,
  departmentId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }

  const { workspace } = await getModule(env);
  const row = await workspace.getDepartment(
    ctxFrom(auth.account),
    departmentId
  );
  if (!row) {
    return problem(
      404,
      "NOT_FOUND",
      "Not found",
      "Unknown department.",
      requestId
    );
  }
  const modules = await workspace.listDepartmentModules(
    ctxFrom(auth.account),
    departmentId
  );
  const safeModules = (modules ?? []).map(
    ({ department_id, module_key, enabled, enabled_at }) => ({
      department_id,
      module_key,
      enabled,
      enabled_at,
    })
  );
  return jsonResponse(
    200,
    { department: departmentDto(row), modules: safeModules },
    requestId
  );
}
/** GET /api/v1/programs/departments/:id/managers */
export async function handleListDepartmentManagers(
  request: Request,
  env: ProgramEnv,
  departmentId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const { workspace } = await getModule(env);
  const managers = await workspace.listDepartmentManagers(
    ctxFrom(auth.account),
    departmentId
  );
  if (managers === null) {
    return notFound(requestId, "Unknown department.");
  }
  return jsonResponse(
    200,
    { managers: managers.map(departmentManagerDto) },
    requestId
  );
}

/** POST /api/v1/programs/departments/:id/managers */
export async function handleAssignDepartmentManager(
  request: Request,
  env: ProgramEnv,
  departmentId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const correlationId = request.headers.get("Idempotency-Key") ?? requestId;
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await parseJson<{ user_id?: unknown }>(request);
  if (body === null || typeof body.user_id !== "string" || !body.user_id) {
    return validation(requestId, "user_id is required.");
  }
  const target = await findAccountByUserId(env.DB, body.user_id);
  if (!target) {
    return validation(requestId, "Unknown user_id.");
  }
  const { workspace } = await getModule(env);
  try {
    const manager = await workspace.assignDepartmentManager(
      ctxFrom(auth.account),
      departmentId,
      body.user_id,
      correlationId
    );
    return jsonResponse(
      200,
      { manager: departmentManagerDto(manager) },
      requestId
    );
  } catch (error) {
    if (
      error instanceof AuthorizationDeniedError ||
      error instanceof SelfDepartmentManagerError
    ) {
      return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId);
    }
    if (error instanceof LeaderAccountInactiveError) {
      return problem(
        422,
        "ACCOUNT_INACTIVE",
        "Validation failed",
        error.message,
        requestId
      );
    }
    if (error instanceof DepartmentManagerConflictError) {
      return problem(409, "CONFLICT", "Conflict", error.message, requestId);
    }
    throw error;
  }
}

/** POST /api/v1/programs/departments/:id/managers/:userId/revoke */
export async function handleRevokeDepartmentManager(
  request: Request,
  env: ProgramEnv,
  departmentId: string,
  userId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const correlationId = request.headers.get("Idempotency-Key") ?? requestId;
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const { workspace } = await getModule(env);
  try {
    const manager = await workspace.revokeDepartmentManager(
      ctxFrom(auth.account),
      departmentId,
      userId,
      correlationId
    );
    return jsonResponse(
      200,
      { manager: departmentManagerDto(manager) },
      requestId
    );
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId);
    }
    if (error instanceof DepartmentManagerNotAssignedError) {
      return notFound(requestId, error.message);
    }
    if (error instanceof DepartmentManagerConflictError) {
      return problem(409, "CONFLICT", "Conflict", error.message, requestId);
    }
    throw error;
  }
}

/** GET /api/v1/programs/departments/:id/member-options?q=... */
export async function handleSearchDepartmentMemberOptions(
  request: Request,
  env: ProgramEnv,
  departmentId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const { workspace } = await getModule(env);
  const department = await workspace.getDepartment(
    ctxFrom(auth.account),
    departmentId
  );
  if (!department || department.capabilities.manager_assign !== true) {
    return notFound(requestId, "Unknown department.");
  }
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return validation(requestId, "Search requires at least two characters.");
  }
  const members = await workspace.searchActiveMembers(query, 20);
  return jsonResponse(200, { members }, requestId);
}

/** PATCH /api/v1/programs/departments/:id */
export async function handleUpdateDepartment(
  request: Request,
  env: ProgramEnv,
  departmentId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const correlationId = request.headers.get("Idempotency-Key") ?? requestId;
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }

  const body = await parseJson<{
    name?: unknown;
    description?: unknown;
    lifecycle?: unknown;
    display_order?: unknown;
  }>(request);
  if (body === null) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "Body must be JSON.",
      requestId
    );
  }
  // Provided fields must be valid — mirror create's strictness so a typo'd
  // value cannot silently no-op (updateProgram already validates this way).
  if (body.name !== undefined && typeof body.name !== "string") {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "name must be a string.",
      requestId
    );
  }
  if (body.description !== undefined && typeof body.description !== "string") {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "description must be a string.",
      requestId
    );
  }
  if (body.lifecycle !== undefined && !isDepartmentLifecycle(body.lifecycle)) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "lifecycle must be Draft, PendingDevelopment, Active, or Archived.",
      requestId
    );
  }
  if (
    body.display_order !== undefined &&
    typeof body.display_order !== "number"
  ) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "display_order must be a number.",
      requestId
    );
  }
  const { workspace } = await getModule(env);
  const update: DepartmentUpdate = {
    updated_by: auth.account.user_id,
    updated_at: new Date().toISOString(),
  };
  if (typeof body.name === "string") {
    update.name = body.name.trim();
  }
  if (typeof body.description === "string") {
    update.description = body.description;
  }
  if (isDepartmentLifecycle(body.lifecycle)) {
    update.lifecycle = body.lifecycle;
  }
  if (typeof body.display_order === "number") {
    update.display_order = body.display_order;
  }

  try {
    const row = await workspace.updateDepartment(
      ctxFrom(auth.account),
      departmentId,
      update,
      correlationId
    );
    return jsonResponse(200, { department: row }, requestId);
  } catch (error) {
    if (
      error instanceof AuthorizationDeniedError ||
      error instanceof WorkspaceNotFoundError
    ) {
      return problem(
        403,
        "FORBIDDEN",
        "Forbidden",
        "Not authorized to update this department.",
        requestId
      );
    }
    throw error;
  }
}

/** POST /api/v1/programs/departments/:id/programs */
export async function handleCreateProgram(
  request: Request,
  env: ProgramEnv,
  departmentId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const correlationId = request.headers.get("Idempotency-Key") ?? requestId;
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }

  const body = await parseJson<{
    name?: unknown;
    description?: unknown;
    category?: unknown;
    behavior_type?: unknown;
    lifecycle?: unknown;
    discoverability?: unknown;
    enrollment_mode?: unknown;
    display_order?: unknown;
  }>(request);
  if (body === null) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "Body must be JSON.",
      requestId
    );
  }
  const fields = parseProgramFields(body, [
    "name",
    "category",
    "behavior_type",
    "lifecycle",
  ]);
  if (!fields || fields.category === null) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "name, category, behavior_type, and lifecycle are required and must be valid.",
      requestId
    );
  }

  const { workspace } = await getModule(env);
  try {
    const row = await workspace.createProgram(
      ctxFrom(auth.account),
      {
        department_id: departmentId,
        name: fields.name as string,
        description:
          typeof fields.description === "string"
            ? fields.description
            : undefined,
        category:
          typeof fields.category === "string" ? fields.category : undefined,
        behavior_type: fields.behavior_type as "Recurring" | "OneOff",
        lifecycle: fields.lifecycle as "Draft" | "Active" | "Archived",
        discoverability: (fields.discoverability ?? "Listed") as
          | "Listed"
          | "Unlisted",
        enrollment_mode: (fields.enrollment_mode ?? "MemberRequest") as
          | "MemberRequest"
          | "ManagerOnly",
        display_order:
          typeof fields.display_order === "number" ? fields.display_order : 0,
      },
      correlationId
    );
    return jsonResponse(201, { program: row }, requestId);
  } catch (error) {
    if (
      error instanceof AuthorizationDeniedError ||
      error instanceof WorkspaceNotFoundError
    ) {
      return problem(
        403,
        "FORBIDDEN",
        "Forbidden",
        "Not authorized to create programs in this department.",
        requestId
      );
    }
    if (error instanceof DuplicateProgramNameError) {
      return problem(409, "CONFLICT", "Conflict", error.message, requestId);
    }
    if (error instanceof InvalidProgramLifecycleError) {
      return problem(
        422,
        "VALIDATION",
        "Validation failed",
        error.message,
        requestId
      );
    }
    throw error;
  }
}

/** GET /api/v1/programs/departments/:id/programs */
export async function handleListPrograms(
  request: Request,
  env: ProgramEnv,
  departmentId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }

  const { workspace } = await getModule(env);
  const rows = await workspace.listPrograms(
    ctxFrom(auth.account),
    departmentId
  );
  return jsonResponse(200, { programs: rows }, requestId);
}

/** GET /api/v1/programs/:id */
export async function handleGetProgram(
  request: Request,
  env: ProgramEnv,
  programId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }

  const { workspace } = await getModule(env);
  const row = await workspace.getProgram(ctxFrom(auth.account), programId);
  if (!row) {
    return problem(
      404,
      "NOT_FOUND",
      "Not found",
      "Unknown program.",
      requestId
    );
  }
  return jsonResponse(200, { program: row }, requestId);
}

/** PATCH /api/v1/programs/:id */
export async function handleUpdateProgram(
  request: Request,
  env: ProgramEnv,
  programId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const correlationId = request.headers.get("Idempotency-Key") ?? requestId;
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }

  const body = await parseJson<{
    name?: unknown;
    description?: unknown;
    category?: unknown;
    behavior_type?: unknown;
    lifecycle?: unknown;
    discoverability?: unknown;
    enrollment_mode?: unknown;
    display_order?: unknown;
  }>(request);
  if (body === null) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "Body must be JSON.",
      requestId
    );
  }
  if (Object.keys(body).length === 0) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "At least one program field is required.",
      requestId
    );
  }
  const fields = parseProgramFields(body, []);
  if (!fields) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "Program fields must be valid and known.",
      requestId
    );
  }
  const { workspace } = await getModule(env);
  const update: ProgramUpdate = {
    updated_by: auth.account.user_id,
    updated_at: new Date().toISOString(),
  };
  for (const [key, value] of Object.entries(fields)) {
    (update as unknown as Record<string, unknown>)[key] = value;
  }

  try {
    const row = await workspace.updateProgram(
      ctxFrom(auth.account),
      programId,
      update,
      correlationId
    );
    return jsonResponse(200, { program: row }, requestId);
  } catch (error) {
    if (
      error instanceof AuthorizationDeniedError ||
      error instanceof WorkspaceNotFoundError
    ) {
      return problem(
        403,
        "FORBIDDEN",
        "Forbidden",
        "Not authorized to update this program.",
        requestId
      );
    }
    if (error instanceof DuplicateProgramNameError) {
      return problem(409, "CONFLICT", "Conflict", error.message, requestId);
    }
    if (error instanceof InvalidProgramLifecycleError) {
      return problem(
        422,
        "VALIDATION",
        "Validation failed",
        error.message,
        requestId
      );
    }
    if (error instanceof ProgramArchiveBlockedError) {
      // Detail carries the machine-readable block reason token(s) (e.g.
      // 'already_archived' vs 'future_active_event') so the client can show
      // accurate copy; the generic message is not user-facing for this code.
      return problem(
        409,
        "PROGRAM_ARCHIVE_BLOCKED",
        "Conflict",
        error.reasons.join(","),
        requestId
      );
    }
    throw error;
  }
}

/** GET /api/v1/programs/:id/member-options?q=... */
export async function handleSearchMemberOptions(
  request: Request,
  env: ProgramEnv,
  programId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const { workspace } = await getModule(env);
  const program = await workspace.getProgram(ctxFrom(auth.account), programId);
  if (!program || !program.capabilities.manage) {
    return problem(
      404,
      "NOT_FOUND",
      "Not found",
      "Unknown program.",
      requestId
    );
  }
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "Search requires at least two characters.",
      requestId
    );
  }
  const members = await workspace.searchActiveMembers(query, 20);
  return jsonResponse(200, { members }, requestId);
}

/** POST /api/v1/programs/departments/:id/modules/:moduleKey/(enable|disable) */
export async function handleSetModule(
  request: Request,
  env: ProgramEnv,
  departmentId: string,
  moduleKey: string,
  enabled: boolean
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const correlationId = request.headers.get("Idempotency-Key") ?? requestId;
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }

  const { workspace } = await getModule(env);
  try {
    const module = await workspace.setDepartmentModule(
      ctxFrom(auth.account),
      {
        department_id: departmentId,
        module_key: moduleKey as ModuleKey,
        enabled,
      },
      correlationId
    );
    return jsonResponse(200, { module }, requestId);
  } catch (error) {
    if (error instanceof InvalidModuleKeyError) {
      return problem(
        422,
        "VALIDATION",
        "Validation failed",
        error.message,
        requestId
      );
    }
    if (
      error instanceof AuthorizationDeniedError ||
      error instanceof WorkspaceNotFoundError
    ) {
      return problem(
        403,
        "FORBIDDEN",
        "Forbidden",
        "Not authorized to configure modules.",
        requestId
      );
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// PRG-02 (#198): schedule rules, exceptions, generation, events.
// ---------------------------------------------------------------------------

function isRecurrenceKind(v: unknown): v is "WEEKLY" | "MONTHLY" {
  return v === "WEEKLY" || v === "MONTHLY";
}

function isScheduleExceptionAction(v: unknown): v is "CANCEL" | "RESCHEDULE" {
  return v === "CANCEL" || v === "RESCHEDULE";
}

function isIsoInstant(v: unknown): v is string {
  if (typeof v !== "string") {
    return false;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z$/u.test(v)) {
    return false;
  }
  return !Number.isNaN(Date.parse(v));
}

function isDayOfWeekValue(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 6;
}

function isMonthDayValue(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 31;
}

/**
 * The rule resolved from `update` over `existing` must satisfy the same
 * cross-field invariants as create: the field matching the effective
 * recurrence kind is required. Returns an error detail, or null when valid.
 */
function resolvedRuleInvariantError(
  update: UpdateScheduleRuleCommand,
  existing: ScheduleRuleRow
): string | null {
  const resolvedRecurrence = update.recurrence ?? existing.recurrence;
  const resolvedDayOfWeek = update.day_of_week ?? existing.day_of_week;
  const resolvedMonthDay = update.month_day ?? existing.month_day;
  if (
    resolvedRecurrence === "WEEKLY" &&
    (resolvedDayOfWeek === null || !isDayOfWeekValue(resolvedDayOfWeek))
  ) {
    return "day_of_week (0-6) is required for WEEKLY.";
  }
  if (
    resolvedRecurrence === "MONTHLY" &&
    (resolvedMonthDay === null || !isMonthDayValue(resolvedMonthDay))
  ) {
    return "month_day (1-31) is required for MONTHLY.";
  }
  return null;
}

type RuleBodyResult =
  | { ok: false; detail: string }
  | { ok: true; value: CreateScheduleRuleCommand };

function parseRuleBody(body: {
  recurrence?: unknown;
  day_of_week?: unknown;
  month_day?: unknown;
  start_time?: unknown;
  end_time?: unknown;
}): RuleBodyResult {
  if (!isRecurrenceKind(body.recurrence)) {
    return { ok: false, detail: "recurrence must be WEEKLY or MONTHLY." };
  }
  if (!isWallTime(body.start_time) || !isWallTime(body.end_time)) {
    return { ok: false, detail: "start_time and end_time must be HH:MM." };
  }
  if (body.end_time <= body.start_time) {
    return { ok: false, detail: "end_time must be after start_time." };
  }
  const isDayOfWeek = isDayOfWeekValue(body.day_of_week);
  const isMonthDay = isMonthDayValue(body.month_day);
  if (body.recurrence === "WEEKLY" && !isDayOfWeek) {
    return { ok: false, detail: "day_of_week (0-6) is required for WEEKLY." };
  }
  if (body.recurrence === "MONTHLY" && !isMonthDay) {
    return { ok: false, detail: "month_day (1-31) is required for MONTHLY." };
  }
  return {
    ok: true,
    value: {
      recurrence: body.recurrence,
      day_of_week: isDayOfWeekValue(body.day_of_week) ? body.day_of_week : null,
      month_day: isMonthDayValue(body.month_day) ? body.month_day : null,
      start_time: body.start_time,
      end_time: body.end_time,
    },
  };
}

/** GET /api/v1/programs/:programId/schedule-rules */
export async function handleListScheduleRules(
  request: Request,
  env: ProgramEnv,
  programId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const { workspace } = await getModule(env);
  const program = await workspace.getProgram(ctxFrom(auth.account), programId);
  if (!program) {
    return notFound(requestId, "Unknown program.");
  }
  const rules = await workspace.listScheduleRules(
    ctxFrom(auth.account),
    programId
  );
  return jsonResponse(200, { rules }, requestId);
}

/** POST /api/v1/programs/:programId/schedule-rules */
export async function handleCreateScheduleRule(
  request: Request,
  env: ProgramEnv,
  programId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const correlationId = request.headers.get("Idempotency-Key") ?? requestId;
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await parseJson<{
    recurrence?: unknown;
    day_of_week?: unknown;
    month_day?: unknown;
    start_time?: unknown;
    end_time?: unknown;
  }>(request);
  if (body === null) {
    return validation(requestId, "Body must be JSON.");
  }
  const parsed = parseRuleBody(body);
  if (!parsed.ok) {
    return validation(requestId, parsed.detail);
  }
  const { value } = parsed;

  const { workspace } = await getModule(env);
  const program = await workspace.getProgram(ctxFrom(auth.account), programId);
  if (!program) {
    return notFound(requestId, "Unknown program.");
  }
  try {
    const row = await workspace.createScheduleRule(
      ctxFrom(auth.account),
      programId,
      value,
      correlationId
    );
    return jsonResponse(201, { rule: row }, requestId);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId);
    }
    if (error instanceof ScheduleRuleNotApplicableError) {
      return validation(requestId, error.message);
    }
    throw error;
  }
}

type RulePatchResult =
  | { ok: false; detail: string }
  | { ok: true; update: UpdateScheduleRuleCommand };

function parseRulePatch(
  body: {
    recurrence?: unknown;
    day_of_week?: unknown;
    month_day?: unknown;
    start_time?: unknown;
    end_time?: unknown;
  },
  existing: ScheduleRuleRow
): RulePatchResult {
  const update: UpdateScheduleRuleCommand = {};
  if (isRecurrenceKind(body.recurrence)) {
    update.recurrence = body.recurrence;
  }
  if (body.day_of_week !== undefined && !isDayOfWeekValue(body.day_of_week)) {
    return { ok: false, detail: "day_of_week must be an integer 0-6." };
  }
  if (isDayOfWeekValue(body.day_of_week)) {
    update.day_of_week = body.day_of_week;
  }
  if (body.month_day !== undefined && !isMonthDayValue(body.month_day)) {
    return { ok: false, detail: "month_day must be an integer 1-31." };
  }
  if (isMonthDayValue(body.month_day)) {
    update.month_day = body.month_day;
  }
  const startTime =
    typeof body.start_time === "string" ? body.start_time : null;
  const endTime = typeof body.end_time === "string" ? body.end_time : null;
  if (startTime !== null && !isWallTime(startTime)) {
    return { ok: false, detail: "start_time must be HH:MM." };
  }
  if (endTime !== null && !isWallTime(endTime)) {
    return { ok: false, detail: "end_time must be HH:MM." };
  }
  if (startTime !== null) {
    update.start_time = startTime;
  }
  if (endTime !== null) {
    update.end_time = endTime;
  }
  const resolvedStart = update.start_time ?? existing.start_time;
  const resolvedEnd = update.end_time ?? existing.end_time;
  if (resolvedEnd <= resolvedStart) {
    return { ok: false, detail: "end_time must be after start_time." };
  }
  const invariantError = resolvedRuleInvariantError(update, existing);
  if (invariantError !== null) {
    return { ok: false, detail: invariantError };
  }
  return { ok: true, update };
}

/** PATCH /api/v1/programs/:programId/schedule-rules/:ruleId */
export async function handleUpdateScheduleRule(
  request: Request,
  env: ProgramEnv,
  programId: string,
  ruleId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const correlationId = request.headers.get("Idempotency-Key") ?? requestId;
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await parseJson<{
    recurrence?: unknown;
    day_of_week?: unknown;
    month_day?: unknown;
    start_time?: unknown;
    end_time?: unknown;
  }>(request);
  if (body === null) {
    return validation(requestId, "Body must be JSON.");
  }

  const { workspace } = await getModule(env);
  const existing = await workspace.getScheduleRule(
    ctxFrom(auth.account),
    ruleId
  );
  if (!existing) {
    return notFound(requestId, "Unknown schedule rule.");
  }
  if (existing.program_id !== programId) {
    return notFound(requestId, "Unknown schedule rule.");
  }
  const parsed = parseRulePatch(body, existing);
  if (!parsed.ok) {
    return validation(requestId, parsed.detail);
  }
  const { update } = parsed;

  try {
    const row = await workspace.updateScheduleRule(
      ctxFrom(auth.account),
      ruleId,
      update,
      correlationId
    );
    return jsonResponse(200, { rule: row }, requestId);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId);
    }
    throw error;
  }
}

/** POST /api/v1/programs/:programId/schedule-rules/:ruleId/exceptions */
// oxlint-disable-next-line eslint/complexity
export async function handleCreateScheduleException(
  request: Request,
  env: ProgramEnv,
  programId: string,
  ruleId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const correlationId = request.headers.get("Idempotency-Key") ?? requestId;
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await parseJson<{
    override_date?: unknown;
    action?: unknown;
    new_start_time?: unknown;
    new_end_time?: unknown;
  }>(request);
  if (body === null) {
    return validation(requestId, "Body must be JSON.");
  }
  if (!isWallDate(body.override_date)) {
    return validation(requestId, "override_date must be YYYY-MM-DD.");
  }
  if (!isScheduleExceptionAction(body.action)) {
    return validation(requestId, "action must be CANCEL or RESCHEDULE.");
  }
  const newStart =
    typeof body.new_start_time === "string" ? body.new_start_time : null;
  const newEnd =
    typeof body.new_end_time === "string" ? body.new_end_time : null;
  if (newStart !== null && !isWallTime(newStart)) {
    return validation(requestId, "new_start_time must be HH:MM.");
  }
  if (newEnd !== null && !isWallTime(newEnd)) {
    return validation(requestId, "new_end_time must be HH:MM.");
  }
  if (body.action === "RESCHEDULE" && (newStart === null || newEnd === null)) {
    return validation(
      requestId,
      "RESCHEDULE requires new_start_time and new_end_time."
    );
  }
  if (body.action === "CANCEL" && (newStart !== null || newEnd !== null)) {
    return validation(requestId, "CANCEL must not include new times.");
  }
  if (
    body.action === "RESCHEDULE" &&
    newStart !== null &&
    newEnd !== null &&
    newEnd <= newStart
  ) {
    return validation(requestId, "new_end_time must be after new_start_time.");
  }

  const { workspace } = await getModule(env);
  const rule = await workspace.getScheduleRule(ctxFrom(auth.account), ruleId);
  if (!rule) {
    return notFound(requestId, "Unknown schedule rule.");
  }
  if (rule.program_id !== programId) {
    return notFound(requestId, "Unknown schedule rule.");
  }
  try {
    const row = await workspace.createScheduleException(
      ctxFrom(auth.account),
      ruleId,
      {
        override_date: body.override_date,
        action: body.action,
        new_start_time: newStart,
        new_end_time: newEnd,
      },
      correlationId
    );
    return jsonResponse(201, { exception: row }, requestId);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId);
    }
    if (error instanceof DuplicateScheduleExceptionError) {
      return problem(409, "CONFLICT", "Conflict", error.message, requestId);
    }
    throw error;
  }
}

/** DELETE /api/v1/programs/:programId/schedule-rules/:ruleId/exceptions/:exceptionId */
export async function handleDeleteScheduleException(
  request: Request,
  env: ProgramEnv,
  programId: string,
  exceptionId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const correlationId = request.headers.get("Idempotency-Key") ?? requestId;
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const { workspace } = await getModule(env);
  const exists = await workspace.getScheduleException(
    ctxFrom(auth.account),
    exceptionId
  );
  if (!exists) {
    return notFound(requestId, "Unknown schedule exception.");
  }
  const rule = await workspace.getScheduleRule(
    ctxFrom(auth.account),
    exists.rule_id
  );
  if (!rule || rule.program_id !== programId) {
    return notFound(requestId, "Unknown schedule exception.");
  }
  try {
    await workspace.deleteScheduleException(
      ctxFrom(auth.account),
      exceptionId,
      correlationId
    );
    return jsonResponse(200, { deleted: true }, requestId);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId);
    }
    throw error;
  }
}

/** POST /api/v1/programs/:programId/events/generate */
export async function handleGenerateEvents(
  request: Request,
  env: ProgramEnv,
  programId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const correlationId = request.headers.get("Idempotency-Key") ?? requestId;
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await parseJson<{ horizon_days?: unknown }>(request);
  let horizonDays = 90;
  if (body !== null) {
    const raw = body.horizon_days;
    if (
      typeof raw === "number" &&
      Number.isInteger(raw) &&
      raw >= 1 &&
      raw <= 365
    ) {
      horizonDays = raw;
    } else if (raw !== undefined) {
      return validation(requestId, "horizon_days must be an integer 1-365.");
    }
  }
  const { workspace } = await getModule(env);
  const program = await workspace.getProgram(ctxFrom(auth.account), programId);
  if (!program) {
    return notFound(requestId, "Unknown program.");
  }
  try {
    const result = await workspace.generateEvents(
      ctxFrom(auth.account),
      programId,
      horizonDays,
      correlationId
    );
    return jsonResponse(200, { generated: result }, requestId);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId);
    }
    if (error instanceof ScheduleRuleNotApplicableError) {
      return validation(requestId, error.message);
    }
    if (error instanceof NoScheduleRulesError) {
      return validation(requestId, error.message);
    }
    throw error;
  }
}

/** POST /api/v1/programs/:programId/events */
export async function handleCreateEvent(
  request: Request,
  env: ProgramEnv,
  programId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const correlationId = request.headers.get("Idempotency-Key") ?? requestId;
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await parseJson<{
    starts_at?: unknown;
    ends_at?: unknown;
    name?: unknown;
    location?: unknown;
    check_in_window_opens_at?: unknown;
    check_in_window_closes_at?: unknown;
  }>(request);
  if (body === null) {
    return validation(requestId, "Body must be JSON.");
  }
  if (!isIsoInstant(body.starts_at) || !isIsoInstant(body.ends_at)) {
    return validation(requestId, "starts_at and ends_at must be ISO-8601 UTC.");
  }
  if (body.ends_at <= body.starts_at) {
    return validation(requestId, "ends_at must be after starts_at.");
  }
  const textField = (
    value: unknown,
    field: string
  ): string | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== "string") {
      throw new Error(`${field} must be text.`);
    }
    return value.trim() || null;
  };
  let name: string | null | undefined;
  let location: string | null | undefined;
  let opens: string | null | undefined;
  let closes: string | null | undefined;
  try {
    name = textField(body.name, "name");
    location = textField(body.location, "location");
    opens = textField(
      body.check_in_window_opens_at,
      "check_in_window_opens_at"
    );
    closes = textField(
      body.check_in_window_closes_at,
      "check_in_window_closes_at"
    );
  } catch (error) {
    return validation(
      requestId,
      error instanceof Error ? error.message : "Invalid text field."
    );
  }
  if (
    (opens !== undefined && opens !== null && !isIsoInstant(opens)) ||
    (closes !== undefined && closes !== null && !isIsoInstant(closes))
  ) {
    return validation(
      requestId,
      "Check-in window values must be ISO-8601 UTC."
    );
  }
  if (
    opens !== undefined &&
    closes !== undefined &&
    opens !== null &&
    closes !== null &&
    closes <= opens
  ) {
    return validation(
      requestId,
      "check-in window closes_at must be after opens_at."
    );
  }
  const { workspace } = await getModule(env);
  const program = await workspace.getProgram(ctxFrom(auth.account), programId);
  if (!program) {
    return notFound(requestId, "Unknown program.");
  }
  try {
    const row = await workspace.createEvent(
      ctxFrom(auth.account),
      programId,
      {
        starts_at: body.starts_at,
        ends_at: body.ends_at,
        name: name ?? null,
        location: location ?? null,
        check_in_window_opens_at: opens ?? null,
        check_in_window_closes_at: closes ?? null,
      } satisfies CreateEventCommand,
      correlationId
    );
    return jsonResponse(201, { event: row }, requestId);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId);
    }
    if (error instanceof DuplicateEventError) {
      return problem(409, "CONFLICT", "Conflict", error.message, requestId);
    }
    throw error;
  }
}

/** GET /api/v1/programs/:programId/events */
export async function handleListEvents(
  request: Request,
  env: ProgramEnv,
  programId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const { workspace } = await getModule(env);
  const rows = await workspace.listEvents(ctxFrom(auth.account), programId);
  if (rows === null) {
    return notFound(requestId, "Unknown program.");
  }
  return jsonResponse(200, { events: rows }, requestId);
}

/** GET /api/v1/programs/:programId/events/:eventId */
export async function handleGetEvent(
  request: Request,
  env: ProgramEnv,
  programId: string,
  eventId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const { workspace } = await getModule(env);
  try {
    const detail = await workspace.getEventDetail(
      ctxFrom(auth.account),
      eventId
    );
    if (!detail || detail.event.program_id !== programId) {
      return notFound(requestId, "Unknown event.");
    }
    return jsonResponse(200, detail, requestId);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId);
    }
    throw error;
  }
}

/** PATCH /api/v1/programs/:programId/events/:eventId */
export async function handleEventUpdate(
  request: Request,
  env: ProgramEnv,
  programId: string,
  eventId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const correlationId = request.headers.get("Idempotency-Key") ?? requestId;
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await parseJson<Record<string, unknown>>(request);
  if (body === null) {
    return validation(requestId, "Body must be JSON.");
  }
  if ("availability" in body) {
    if (body.availability !== "Active" && body.availability !== "Inactive") {
      return validation(requestId, "availability must be Active or Inactive.");
    }
  }
  if ("reason" in body) {
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) {
      return validation(requestId, "reason is required.");
    }
  }
  const { workspace } = await getModule(env);
  const existing = await workspace.getEvent(ctxFrom(auth.account), eventId);
  if (!existing || existing.program_id !== programId) {
    return notFound(requestId, "Unknown event.");
  }
  if ("availability" in body) {
    const confirmed = body.confirm === true;
    const availability = body.availability as EventAvailability;
    try {
      const row = await workspace.setEventAvailability(
        ctxFrom(auth.account),
        eventId,
        { availability, confirm: confirmed },
        correlationId
      );
      return jsonResponse(200, { event: row }, requestId);
    } catch (error) {
      if (error instanceof EventAvailabilityConfirmationRequiredError) {
        return problem(
          409,
          "CONFIRMATION_REQUIRED",
          "Confirmation required",
          `${error.message} Affected open operations: ${error.affectedOperations}.`,
          requestId,
          { open_operations: error.affectedOperations }
        );
      }
      if (error instanceof AuthorizationDeniedError) {
        return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId);
      }
      throw error;
    }
  }
  if ("reason" in body) {
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    try {
      const row = await workspace.cancelEvent(
        ctxFrom(auth.account),
        eventId,
        { reason },
        correlationId
      );
      return jsonResponse(200, { event: row }, requestId);
    } catch (error) {
      if (error instanceof AuthorizationDeniedError) {
        return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId);
      }
      throw error;
    }
  }
  const ALLOWED_EVENT_UPDATE_FIELDS: Record<string, true> = {
    starts_at: true,
    ends_at: true,
    name: true,
    location: true,
    check_in_window_opens_at: true,
    check_in_window_closes_at: true,
  };
  if (Object.keys(body).some((key) => !ALLOWED_EVENT_UPDATE_FIELDS[key])) {
    return validation(requestId, "Unknown event field.");
  }
  const parseOptionalText = (value: unknown, field: string) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== "string") {
      throw new Error(`${field} must be text.`);
    }
    return value.trim() || null;
  };
  let update: UpdateEventCommand;
  try {
    const starts = body.starts_at;
    const ends = body.ends_at;
    if (starts !== undefined && !isIsoInstant(starts)) {
      return validation(requestId, "starts_at must be ISO-8601 UTC.");
    }
    if (ends !== undefined && !isIsoInstant(ends)) {
      return validation(requestId, "ends_at must be ISO-8601 UTC.");
    }
    const effectiveStarts =
      (starts as string | undefined) ?? existing.starts_at;
    const effectiveEnds = (ends as string | undefined) ?? existing.ends_at;
    if (effectiveEnds <= effectiveStarts) {
      return validation(requestId, "ends_at must be after starts_at.");
    }
    const opens = parseOptionalText(
      body.check_in_window_opens_at,
      "check_in_window_opens_at"
    );
    const closes = parseOptionalText(
      body.check_in_window_closes_at,
      "check_in_window_closes_at"
    );
    if (
      (opens !== undefined && opens !== null && !isIsoInstant(opens)) ||
      (closes !== undefined && closes !== null && !isIsoInstant(closes))
    ) {
      return validation(
        requestId,
        "Check-in window values must be ISO-8601 UTC."
      );
    }
    const effectiveOpens = opens ?? existing.check_in_window_opens_at;
    const effectiveCloses = closes ?? existing.check_in_window_closes_at;
    if (
      effectiveOpens !== null &&
      effectiveCloses !== null &&
      effectiveOpens !== undefined &&
      effectiveCloses !== undefined &&
      effectiveCloses <= effectiveOpens
    ) {
      return validation(
        requestId,
        "check-in window closes_at must be after opens_at."
      );
    }
    update = {
      ...(starts === undefined ? {} : { starts_at: starts }),
      ...(ends === undefined ? {} : { ends_at: ends }),
      ...(body.name === undefined
        ? {}
        : { name: parseOptionalText(body.name, "name") }),
      ...(body.location === undefined
        ? {}
        : { location: parseOptionalText(body.location, "location") }),
      ...(body.check_in_window_opens_at === undefined
        ? {}
        : { check_in_window_opens_at: opens }),
      ...(body.check_in_window_closes_at === undefined
        ? {}
        : { check_in_window_closes_at: closes }),
    };
  } catch (error) {
    return validation(
      requestId,
      error instanceof Error ? error.message : "Invalid event field."
    );
  }
  try {
    const row = await workspace.updateEvent(
      ctxFrom(auth.account),
      eventId,
      update,
      correlationId
    );
    return jsonResponse(200, { event: row }, requestId);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId);
    }
    if (error instanceof DuplicateEventError) {
      return problem(409, "CONFLICT", "Conflict", error.message, requestId);
    }
    throw error;
  }
}

/** POST /api/v1/programs/:programId/enrollment-requests */
export async function handleCreateEnrollmentRequest(
  request: Request,
  env: ProgramEnv,
  programId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const correlationId = request.headers.get("Idempotency-Key") ?? requestId;
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const { workspace } = await getModule(env);
  const program = await workspace.getProgram(ctxFrom(auth.account), programId);
  if (!program) {
    return notFound(requestId, "Unknown program.");
  }
  try {
    const row = await workspace.submitEnrollmentRequest(
      ctxFrom(auth.account),
      programId,
      correlationId
    );
    return jsonResponse(201, { request: row }, requestId);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId);
    }
    if (error instanceof EnrollmentNotAllowedError) {
      return validation(requestId, error.message);
    }
    if (error instanceof DuplicateEnrollmentError) {
      return problem(
        409,
        "ENROLLMENT_DUPLICATE",
        "Conflict",
        error.message,
        requestId
      );
    }
    throw error;
  }
}

/** GET /api/v1/programs/:programId/enrollment-requests */
export async function handleListEnrollmentRequests(
  request: Request,
  env: ProgramEnv,
  programId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const { workspace } = await getModule(env);
  const rows = await workspace.listEnrollmentRequests(
    ctxFrom(auth.account),
    programId
  );
  if (rows === null) {
    return notFound(requestId, "Unknown program.");
  }
  return jsonResponse(200, { requests: rows }, requestId);
}

/** POST /api/v1/programs/:programId/enrollment-requests/:requestId/decision */
export async function handleDecideEnrollmentRequest(
  request: Request,
  env: ProgramEnv,
  programId: string,
  enrollmentRequestId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const correlationId = request.headers.get("Idempotency-Key") ?? requestId;
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await parseJson<{ action?: unknown; note?: unknown }>(request);
  if (body === null) {
    return validation(requestId, "Body must be JSON.");
  }
  if (body.action !== "Approved" && body.action !== "Rejected") {
    return validation(requestId, "action must be Approved or Rejected.");
  }
  const note = typeof body.note === "string" ? body.note.trim() : null;
  const { workspace } = await getModule(env);
  const existing = await workspace.getEnrollmentRequest(
    ctxFrom(auth.account),
    enrollmentRequestId
  );
  if (!existing) {
    return notFound(requestId, "Unknown enrollment request.");
  }
  if (existing.program_id !== programId) {
    return notFound(requestId, "Unknown enrollment request.");
  }
  try {
    const row = await workspace.decideEnrollmentRequest(
      ctxFrom(auth.account),
      programId,
      enrollmentRequestId,
      { action: body.action, note },
      correlationId
    );
    return jsonResponse(200, { request: row }, requestId);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId);
    }
    if (error instanceof RequestNotDecidableError) {
      return problem(409, "CONFLICT", "Conflict", error.message, requestId);
    }
    if (error instanceof DuplicateEnrollmentError) {
      return problem(
        409,
        "ENROLLMENT_DUPLICATE",
        "Conflict",
        error.message,
        requestId
      );
    }
    throw error;
  }
}

/** POST /api/v1/programs/:programId/enrollment-requests/:requestId/withdraw */
export async function handleWithdrawEnrollmentRequest(
  request: Request,
  env: ProgramEnv,
  programId: string,
  enrollmentRequestId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const correlationId = request.headers.get("Idempotency-Key") ?? requestId;
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const { workspace } = await getModule(env);
  const existing = await workspace.getEnrollmentRequest(
    ctxFrom(auth.account),
    enrollmentRequestId
  );
  if (!existing) {
    return notFound(requestId, "Unknown enrollment request.");
  }
  if (existing.program_id !== programId) {
    return notFound(requestId, "Unknown enrollment request.");
  }
  try {
    const row = await workspace.withdrawEnrollmentRequest(
      ctxFrom(auth.account),
      programId,
      enrollmentRequestId,
      correlationId
    );
    return jsonResponse(200, { request: row }, requestId);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId);
    }
    if (error instanceof RequestNotDecidableError) {
      return problem(409, "CONFLICT", "Conflict", error.message, requestId);
    }
    throw error;
  }
}

/** POST /api/v1/programs/:programId/enrollments */
export async function handleAssistedEnroll(
  request: Request,
  env: ProgramEnv,
  programId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const correlationId = request.headers.get("Idempotency-Key") ?? requestId;
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await parseJson<{ member_user_id?: unknown }>(request);
  if (body === null) {
    return validation(requestId, "Body must be JSON.");
  }
  const memberUserId =
    typeof body.member_user_id === "string" ? body.member_user_id : "";
  if (!memberUserId) {
    return validation(requestId, "member_user_id is required.");
  }
  const member = await findAccountByUserId(env.DB, memberUserId);
  if (!member) {
    return validation(requestId, "Unknown member_user_id.");
  }
  const { workspace } = await getModule(env);
  const program = await workspace.getProgram(ctxFrom(auth.account), programId);
  if (!program) {
    return notFound(requestId, "Unknown program.");
  }
  try {
    const row = await workspace.assistedEnroll(
      ctxFrom(auth.account),
      programId,
      { memberUserId },
      correlationId
    );
    return jsonResponse(201, { enrollment: row }, requestId);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId);
    }
    if (error instanceof EnrollmentNotAllowedError) {
      return validation(requestId, error.message);
    }
    if (error instanceof DuplicateEnrollmentError) {
      return problem(
        409,
        "ENROLLMENT_DUPLICATE",
        "Conflict",
        error.message,
        requestId
      );
    }
    throw error;
  }
}

/** GET /api/v1/programs/:programId/enrollments */
export async function handleListEnrollments(
  request: Request,
  env: ProgramEnv,
  programId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const { workspace } = await getModule(env);
  const rows = await workspace.listEnrollments(
    ctxFrom(auth.account),
    programId
  );
  if (rows === null) {
    return notFound(requestId, "Unknown program.");
  }
  return jsonResponse(200, { enrollments: rows }, requestId);
}

/** POST /api/v1/programs/:programId/enrollments/:enrollmentId/cancel */
export async function handleCancelEnrollment(
  request: Request,
  env: ProgramEnv,
  programId: string,
  enrollmentId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const correlationId = request.headers.get("Idempotency-Key") ?? requestId;
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const { workspace } = await getModule(env);
  const existing = await workspace.getEnrollment(
    ctxFrom(auth.account),
    enrollmentId
  );
  if (!existing) {
    return notFound(requestId, "Unknown enrollment.");
  }
  if (existing.program_id !== programId) {
    return notFound(requestId, "Unknown enrollment.");
  }
  try {
    const row = await workspace.cancelEnrollment(
      ctxFrom(auth.account),
      programId,
      enrollmentId,
      correlationId
    );
    return jsonResponse(200, { enrollment: row }, requestId);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId);
    }
    if (error instanceof RequestNotDecidableError) {
      return problem(409, "CONFLICT", "Conflict", error.message, requestId);
    }
    throw error;
  }
}

/** POST /api/v1/programs/:programId/leaders */
export async function handleAssignProgramLeader(
  request: Request,
  env: ProgramEnv,
  programId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const correlationId = request.headers.get("Idempotency-Key") ?? requestId;
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await parseJson<{ user_id?: unknown }>(request);
  if (body === null) {
    return validation(requestId, "Body must be JSON.");
  }
  const userId = typeof body.user_id === "string" ? body.user_id : "";
  if (!userId) {
    return validation(requestId, "user_id is required.");
  }
  const target = await findAccountByUserId(env.DB, userId);
  if (!target) {
    return validation(requestId, "Unknown user_id.");
  }
  const { workspace } = await getModule(env);
  try {
    const row = await workspace.assignProgramLeader(
      ctxFrom(auth.account),
      programId,
      userId,
      correlationId
    );
    return jsonResponse(200, { leader: row }, requestId);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId);
    }
    if (error instanceof SelfDelegationError) {
      return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId);
    }
    if (error instanceof LeaderAccountInactiveError) {
      return problem(
        422,
        "ACCOUNT_INACTIVE",
        "Validation failed",
        error.message,
        requestId
      );
    }
    if (error instanceof ProgramLeaderConflictError) {
      return problem(409, "CONFLICT", "Conflict", error.message, requestId);
    }
    throw error;
  }
}

/** POST /api/v1/programs/:programId/leaders/:userId/revoke */
export async function handleRevokeProgramLeader(
  request: Request,
  env: ProgramEnv,
  programId: string,
  userId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const correlationId = request.headers.get("Idempotency-Key") ?? requestId;
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const { workspace } = await getModule(env);
  try {
    const row = await workspace.revokeProgramLeader(
      ctxFrom(auth.account),
      programId,
      userId,
      correlationId
    );
    return jsonResponse(200, { leader: row }, requestId);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId);
    }
    if (error instanceof ProgramLeaderConflictError) {
      return problem(409, "CONFLICT", "Conflict", error.message, requestId);
    }
    if (error instanceof LeaderNotAssignedError) {
      return notFound(requestId, error.message);
    }
    throw error;
  }
}

/** GET /api/v1/programs/:programId/leaders */
export async function handleListProgramLeaders(
  request: Request,
  env: ProgramEnv,
  programId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const { workspace } = await getModule(env);
  const leaders = await workspace.listProgramLeaders(
    ctxFrom(auth.account),
    programId
  );
  if (leaders === null) {
    return notFound(requestId, "Unknown program.");
  }
  return jsonResponse(200, { leaders }, requestId);
}
