/**
 * EFCC Programs domain — Worker route handlers for `/api/v1/programs/*`.
 *
 * All routes are cookie-only (same transport as auth handlers). The handlers are
 * thin adapters: they resolve the actor, delegate to DepartmentWorkspace, and
 * format RFC 9457 Problem Details on failures.
 */

import { findAccountByUserId } from '../auth/accounts';
import type { AccountRow } from '../auth/accounts';
import { ACCESS_COOKIE_NAME } from "../auth/cookies";
import { verifyAccessToken } from "../auth/sessions";
import { DEFAULT_ROLE_POLICIES } from './capabilities';
import type { ModuleKey } from './capabilities';
import { AuthorizationDeniedError, D1CapabilityAuthorizer } from './capability-authorizer';
import type { AuthorizationContext } from './capability-authorizer';
import { D1WorkspaceStore, WorkspaceNotFoundError } from "./d1-workspace-store";
import {
  DepartmentWorkspace,
  DuplicateDepartmentCodeError,
  DuplicateProgramNameError,
  InvalidModuleKeyError,
} from "./department-workspace";
import type { DepartmentUpdate, ProgramUpdate } from "./workspace-store";

export interface ProgramEnv {
  DB: D1Database;
  EFCC_ACCESS_TOKEN_SECRET: string;
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

function problem(
  status: number,
  code: string,
  title: string,
  detail: string | undefined,
  requestId: string
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
  return Response.json(body, {
    status,
    headers: {
      "Content-Type": "application/problem+json",
      "X-Request-Id": requestId,
    },
  });
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

async function getModule(
  env: ProgramEnv
): Promise<{ workspace: DepartmentWorkspace }> {
  const store = new D1WorkspaceStore(env.DB);
  await store.seedRolePolicies(DEFAULT_ROLE_POLICIES);
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

  const { workspace } = await getModule(env);
  try {
    const row = await workspace.createDepartment(
      ctxFrom(auth.account),
      {
        code,
        name,
        description:
          typeof body.description === "string" ? body.description : undefined,
        lifecycle: isDepartmentLifecycle(body.lifecycle)
          ? body.lifecycle
          : "Draft",
        display_order:
          typeof body.display_order === "number" ? body.display_order : 0,
      },
      requestId
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
  return jsonResponse(200, { department: row, modules }, requestId);
}

/** PATCH /api/v1/programs/departments/:id */
export async function handleUpdateDepartment(
  request: Request,
  env: ProgramEnv,
  departmentId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
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
      requestId
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
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const behaviorType = isProgramBehaviorType(body.behavior_type)
    ? body.behavior_type
    : "";
  if (!name || !behaviorType) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "name and behavior_type are required.",
      requestId
    );
  }

  const { workspace } = await getModule(env);
  try {
    const row = await workspace.createProgram(
      ctxFrom(auth.account),
      {
        department_id: departmentId,
        name,
        description:
          typeof body.description === "string" ? body.description : undefined,
        category: typeof body.category === "string" ? body.category : undefined,
        behavior_type: behaviorType,
        lifecycle: isProgramLifecycle(body.lifecycle)
          ? body.lifecycle
          : "Draft",
        discoverability: isProgramDiscoverability(body.discoverability)
          ? body.discoverability
          : "Unlisted",
        enrollment_mode: isProgramEnrollmentMode(body.enrollment_mode)
          ? body.enrollment_mode
          : "MemberRequest",
        display_order:
          typeof body.display_order === "number" ? body.display_order : 0,
      },
      requestId
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
  const { workspace } = await getModule(env);
  const update: ProgramUpdate = {
    updated_by: auth.account.user_id,
    updated_at: new Date().toISOString(),
  };
  if (typeof body.name === "string") {
    update.name = body.name.trim();
  }
  if (typeof body.description === "string") {
    update.description = body.description;
  }
  if (typeof body.category === "string") {
    update.category = body.category;
  }
  if (isProgramBehaviorType(body.behavior_type)) {
    update.behavior_type = body.behavior_type;
  }
  if (isProgramLifecycle(body.lifecycle)) {
    update.lifecycle = body.lifecycle;
  }
  if (isProgramDiscoverability(body.discoverability)) {
    update.discoverability = body.discoverability;
  }
  if (isProgramEnrollmentMode(body.enrollment_mode)) {
    update.enrollment_mode = body.enrollment_mode;
  }
  if (typeof body.display_order === "number") {
    update.display_order = body.display_order;
  }

  try {
    const row = await workspace.updateProgram(
      ctxFrom(auth.account),
      programId,
      update,
      requestId
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
    throw error;
  }
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
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }

  const { workspace } = await getModule(env);
  try {
    await workspace.setDepartmentModule(
      ctxFrom(auth.account),
      {
        department_id: departmentId,
        module_key: moduleKey as ModuleKey,
        enabled,
      },
      requestId
    );
    return jsonResponse(200, { enabled }, requestId);
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
