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
import { DEFAULT_ROLE_POLICIES } from "./capabilities";
import type { ModuleKey } from "./capabilities";
import {
  AuthorizationDeniedError,
  D1CapabilityAuthorizer,
} from "./capability-authorizer";
import type { AuthorizationContext } from "./capability-authorizer";
import { D1WorkspaceStore, WorkspaceNotFoundError } from "./d1-workspace-store";
import {
  DepartmentWorkspace,
  DuplicateDepartmentCodeError,
  DuplicateEnrollmentError,
  DuplicateEventError,
  DuplicateProgramNameError,
  EnrollmentNotAllowedError,
  InvalidModuleKeyError,
  InvalidProgramLifecycleError,
  LeaderNotAssignedError,
  RequestNotDecidableError,
  ScheduleRuleNotApplicableError,
  SelfDelegationError,
} from "./department-workspace";
import type {
  CreateScheduleRuleCommand,
  UpdateScheduleRuleCommand,
} from "./department-workspace";
import { isWallDate, isWallTime } from "./recurrence";
import type {
  DepartmentUpdate,
  ProgramUpdate,
  ScheduleRuleRow,
} from "./workspace-store";

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

const INVALID_PROGRAM_VALUE = Symbol("invalid program value");
const PROGRAM_FIELD_PARSERS: Record<string, (value: unknown) => unknown> = {
  name: (value) =>
    typeof value === "string" && value.trim()
      ? value.trim()
      : INVALID_PROGRAM_VALUE,
  description: (value) =>
    value === null || typeof value === "string" ? value : INVALID_PROGRAM_VALUE,
  category: (value) =>
    value === null || typeof value === "string" ? value : INVALID_PROGRAM_VALUE,
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
  const fields = parseProgramFields(body, [
    "name",
    "behavior_type",
    "lifecycle",
    "discoverability",
    "enrollment_mode",
  ]);
  if (!fields) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "name, behavior_type, lifecycle, discoverability, and enrollment_mode are required and must be valid.",
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
        discoverability: fields.discoverability as "Listed" | "Unlisted",
        enrollment_mode: fields.enrollment_mode as
          | "MemberRequest"
          | "ManagerOnly",
        display_order:
          typeof fields.display_order === "number" ? fields.display_order : 0,
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
  const members = await new D1WorkspaceStore(env.DB).searchActiveMembers(
    query,
    20
  );
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
      requestId
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

function validation(requestId: string, detail: string): Response {
  return problem(422, "VALIDATION", "Validation failed", detail, requestId);
}

function notFound(requestId: string, detail: string): Response {
  return problem(404, "NOT_FOUND", "Not found", detail, requestId);
}

function isDayOfWeekValue(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 6;
}

function isMonthDayValue(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 31;
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
      requestId
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
  if (isDayOfWeekValue(body.day_of_week)) {
    update.day_of_week = body.day_of_week;
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
      requestId
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
      requestId
    );
    return jsonResponse(201, { exception: row }, requestId);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId);
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
      requestId
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
      requestId
    );
    return jsonResponse(200, { generated: result }, requestId);
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

/** POST /api/v1/programs/:programId/events */
export async function handleCreateEvent(
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
    starts_at?: unknown;
    ends_at?: unknown;
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
  const { workspace } = await getModule(env);
  const program = await workspace.getProgram(ctxFrom(auth.account), programId);
  if (!program) {
    return notFound(requestId, "Unknown program.");
  }
  try {
    const row = await workspace.createEvent(
      ctxFrom(auth.account),
      programId,
      { starts_at: body.starts_at, ends_at: body.ends_at },
      requestId
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

/** PATCH /api/v1/programs/:programId/events/:eventId */
export async function handleCancelEvent(
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
  const body = await parseJson<{ reason?: unknown }>(request);
  if (body === null) {
    return validation(requestId, "Body must be JSON.");
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return validation(requestId, "reason is required.");
  }
  const { workspace } = await getModule(env);
  const existing = await workspace.getEvent(ctxFrom(auth.account), eventId);
  if (!existing) {
    return notFound(requestId, "Unknown event.");
  }
  if (existing.program_id !== programId) {
    return notFound(requestId, "Unknown event.");
  }
  try {
    const row = await workspace.cancelEvent(
      ctxFrom(auth.account),
      eventId,
      { reason },
      requestId
    );
    return jsonResponse(200, { event: row }, requestId);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId);
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
      { programId },
      requestId
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
      return problem(409, "CONFLICT", "Conflict", error.message, requestId);
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
  requestId: string
): Promise<Response> {
  const requestId2 = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId2);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await parseJson<{ action?: unknown; note?: unknown }>(request);
  if (body === null) {
    return validation(requestId2, "Body must be JSON.");
  }
  if (body.action !== "Approved" && body.action !== "Rejected") {
    return validation(requestId2, "action must be Approved or Rejected.");
  }
  const note = typeof body.note === "string" ? body.note.trim() : null;
  const { workspace } = await getModule(env);
  const existing = await workspace.getEnrollmentRequest(
    ctxFrom(auth.account),
    requestId
  );
  if (!existing) {
    return notFound(requestId2, "Unknown enrollment request.");
  }
  if (existing.program_id !== programId) {
    return notFound(requestId2, "Unknown enrollment request.");
  }
  try {
    const row = await workspace.decideEnrollmentRequest(
      ctxFrom(auth.account),
      programId,
      requestId,
      { action: body.action, note },
      requestId2
    );
    return jsonResponse(200, { request: row }, requestId2);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId2);
    }
    if (error instanceof RequestNotDecidableError) {
      return problem(409, "CONFLICT", "Conflict", error.message, requestId2);
    }
    if (error instanceof DuplicateEnrollmentError) {
      return problem(409, "CONFLICT", "Conflict", error.message, requestId2);
    }
    throw error;
  }
}

/** POST /api/v1/programs/:programId/enrollment-requests/:requestId/withdraw */
export async function handleWithdrawEnrollmentRequest(
  request: Request,
  env: ProgramEnv,
  programId: string,
  requestId: string
): Promise<Response> {
  const requestId2 = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId2);
  if (auth instanceof Response) {
    return auth;
  }
  const { workspace } = await getModule(env);
  const existing = await workspace.getEnrollmentRequest(
    ctxFrom(auth.account),
    requestId
  );
  if (!existing) {
    return notFound(requestId2, "Unknown enrollment request.");
  }
  if (existing.program_id !== programId) {
    return notFound(requestId2, "Unknown enrollment request.");
  }
  try {
    const row = await workspace.withdrawEnrollmentRequest(
      ctxFrom(auth.account),
      programId,
      requestId,
      requestId2
    );
    return jsonResponse(200, { request: row }, requestId2);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId2);
    }
    if (error instanceof RequestNotDecidableError) {
      return problem(409, "CONFLICT", "Conflict", error.message, requestId2);
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
      { programId, memberUserId },
      requestId
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
      return problem(409, "CONFLICT", "Conflict", error.message, requestId);
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
      requestId
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
      requestId
    );
    return jsonResponse(200, { leader: row }, requestId);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId);
    }
    if (error instanceof SelfDelegationError) {
      return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId);
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
      requestId
    );
    return jsonResponse(200, { leader: row }, requestId);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId);
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
