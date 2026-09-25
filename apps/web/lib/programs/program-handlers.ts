import {
  AccountDirectoryMemberSchema,
  AccountDirectoryStatusSchema,
  AccountDirectoryViewSchema,
  DepartmentDetailSchema,
  DepartmentGetSchema,
  DepartmentsListSchema,
  MemberOptionsSchema,
  ProgramGetSchema,
  ProgramsListSchema,
  ManagementAccessViewSchema,
  ManagementAttentionViewSchema,
  ManagementCockpitViewSchema,
  ManagementDirectoryViewSchema,
  ManagementHubViewSchema,
  ManagementNotificationsViewSchema,
  ManagementProgramWorkspaceViewSchema,
  MarkedCountSchema,
  MembersSearchResultSchema,
  NoticeCreateResponseSchema,
  NotificationReadItemSchema,
  NotificationsReadBodySchema,
  ParticipantCatalogSchema,
  ParticipantNoticesViewSchema,
  ParticipantNoticeKindSchema,
  ParticipantProgramDetailSchema,
  ProgramAttendanceArtifactSchema,
  ProgramTokenRotationSchema,
  floorClampLimit,
  isValidAccountCursor,
  optionalIdField,
  parseOptionalIdempotencyKey,
  parseSearchTerm,
  trimmedField,
} from "@efcc/contracts";
import {
  DepartmentCreateResponseSchema,
  DepartmentLifecycleSchema,
  DepartmentUpdateResponseSchema,
  ProgramCreateResponseSchema,
  ProgramUpdateResponseSchema,
  SetModuleResponseSchema,
  parseProgramFields,
} from "@efcc/contracts";
import {
  EventCreateResponseSchema,
  EventTypeSchema,
  EventDetailResponseSchema,
  EventResponseSchema,
  EventsListSchema,
  ExceptionActionSchema,
  GenerateEventsResponseSchema,
  PreviewEventsResponseSchema,
  ScheduleExceptionCreateResponseSchema,
  ScheduleExceptionDeleteResponseSchema,
  ScheduleExceptionsSchema,
  ScheduleRuleCreateResponseSchema,
  ScheduleRuleResponseSchema,
  ScheduleRulesSchema,
  parseExceptionBody,
  parseRuleBody,
  parseRulePatch,
} from "@efcc/contracts";

import type { AccountRow } from "../auth/accounts";
import { resolveRequestSession } from "../auth/sessions";
/**
 * EFCC Programs domain — Worker route handlers for `/api/v1/programs/*`.
 *
 * All routes are cookie-only (same transport as auth handlers). The handlers are
 * thin adapters: they resolve the actor, delegate to DepartmentWorkspace, and
 * format RFC 9457 Problem Details on failures.
 */
import { COPY } from "../copy";
import type { ModuleKey } from "./capabilities";
import {
  AuthorizationDeniedError,
  D1CapabilityAuthorizer,
} from "./capability-authorizer";
import type { AuthorizationContext } from "./capability-authorizer";
import { D1WorkspaceStore, WorkspaceNotFoundError } from "./d1-workspace-store";
import { DepartmentWorkspace } from "./department-workspace";
import type {
  CreateEventCommand,
  CreateScheduleRuleCommand,
  EventAvailability,
  UpdateEventCommand,
  DepartmentView,
  UpdateScheduleRuleCommand,
} from "./department-workspace";
import { isIsoInstant } from "./iso-instant";
import {
  DuplicateDepartmentCodeError,
  DuplicateEnrollmentError,
  DuplicateEventError,
  DuplicateProgramNameError,
  DuplicateScheduleExceptionError,
  EnrollmentAccountInactiveError,
  EnrollmentCancellationReasonRequiredError,
  EnrollmentDecisionConflictError,
  EnrollmentApprovalRunValidationError,
  EmptyPreviewPlanError,
  EnrollmentNotAllowedError,
  EventCancellationBlockedError,
  EventAvailabilityConfirmationRequiredError,
  EventCancelledReadOnlyError,
  EventIdentityChangeReasonRequiredError,
  EventNameRequiredError,
  EventRescheduleBlockedError,
  InvalidModuleKeyError,
  InvalidProgramLifecycleError,
  NoScheduleRulesError,
  PreviewPlanNotFoundError,
  ProgramArchiveBlockedError,
  ProgramTokenRotationConflictError,
  RequestNotDecidableError,
  ScheduleRuleRetiredError,
  ScheduleRuleIdempotencyConflictError,
  ScheduleRuleNotApplicableError,
  StaleEnrollmentRequestError,
  StalePreviewPlanError,
} from "./program-errors";
import {
  addWallDays,
  addWallMonths,
  hkTodayWallDate,
  isValidWallDate,
  isWallTime,
  wallDaySpan,
} from "./recurrence";
import type {
  DepartmentUpdate,
  ProgramUpdate,
  ScheduleRuleRow,
  EventType,
  NotificationReadStateInput,
} from "./workspace-store";

export interface ProgramEnv {
  DB: D1Database;
  EFCC_ACCESS_TOKEN_SECRET: string;
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

function isOneOf<T extends string>(v: unknown, options: readonly T[]): v is T {
  return typeof v === "string" && (options as readonly string[]).includes(v);
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

function mapEnrollmentApprovalRunError(
  error: unknown,
  requestId: string
): Response | null {
  if (error instanceof EnrollmentApprovalRunValidationError) {
    return validation(requestId, error.message);
  }
  return null;
}

/**
 * Central 1:1 mapping from DepartmentWorkspace domain errors to Problem
 * Details responses. Returns null for errors this mapping does not know
 * (including WorkspaceNotFoundError, which only a few handlers map, with
 * handler-specific detail) so callers fall through to bespoke handling or
 * rethrow.
 */
function mapWorkspaceError(error: unknown, requestId: string): Response | null {
  if (error instanceof AuthorizationDeniedError) {
    return problem(403, "FORBIDDEN", "Forbidden", error.message, requestId);
  }
  if (error instanceof EnrollmentAccountInactiveError) {
    return problem(
      422,
      "ENROLLMENT_ACCOUNT_INACTIVE",
      "Validation failed",
      error.message,
      requestId
    );
  }
  if (error instanceof StaleEnrollmentRequestError) {
    return problem(409, "STALE", "Stale request", error.message, requestId);
  }
  if (
    error instanceof InvalidProgramLifecycleError ||
    error instanceof InvalidModuleKeyError ||
    error instanceof EnrollmentNotAllowedError ||
    error instanceof EnrollmentCancellationReasonRequiredError ||
    error instanceof ScheduleRuleNotApplicableError ||
    error instanceof NoScheduleRulesError ||
    error instanceof EmptyPreviewPlanError
  ) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      error.message,
      requestId
    );
  }
  if (error instanceof ScheduleRuleRetiredError) {
    return problem(
      409,
      "SCHEDULE_RULE_RETIRED",
      "Conflict",
      error.message,
      requestId
    );
  }
  if (error instanceof ScheduleRuleIdempotencyConflictError) {
    return problem(
      409,
      "SCHEDULE_RULE_IDEMPOTENCY_CONFLICT",
      "Conflict",
      error.message,
      requestId
    );
  }
  if (error instanceof PreviewPlanNotFoundError) {
    return problem(
      404,
      "PLAN_NOT_FOUND",
      "Not found",
      error.message,
      requestId
    );
  }
  if (error instanceof StalePreviewPlanError) {
    return problem(409, "STALE_PLAN", "Conflict", error.message, requestId);
  }
  if (
    error instanceof DuplicateDepartmentCodeError ||
    error instanceof DuplicateProgramNameError ||
    error instanceof DuplicateEventError ||
    error instanceof DuplicateScheduleExceptionError ||
    error instanceof RequestNotDecidableError ||
    error instanceof EnrollmentDecisionConflictError
  ) {
    return problem(409, "CONFLICT", "Conflict", error.message, requestId);
  }
  if (error instanceof ProgramTokenRotationConflictError) {
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
  if (error instanceof EventRescheduleBlockedError) {
    return problem(
      409,
      "EVENT_RESCHEDULE_BLOCKED",
      "Conflict",
      error.message,
      requestId
    );
  }
  if (error instanceof EventCancellationBlockedError) {
    return problem(
      409,
      "EVENT_CANCEL_BLOCKED",
      "Conflict",
      COPY.programs.cancelBlockedWithAttendance,
      requestId
    );
  }
  if (error instanceof EventNameRequiredError) {
    return validation(requestId, error.message);
  }
  if (error instanceof EventIdentityChangeReasonRequiredError) {
    return validation(requestId, error.message);
  }
  if (error instanceof EventCancelledReadOnlyError) {
    return problem(
      409,
      "EVENT_CANCELLED",
      "Conflict",
      error.message,
      requestId
    );
  }
  return null;
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

async function requireActor(
  request: Request,
  env: ProgramEnv,
  requestId: string
): Promise<{ account: AccountRow } | Response> {
  const resolved = await resolveRequestSession(
    request,
    env.DB,
    env.EFCC_ACCESS_TOKEN_SECRET
  );
  if (resolved.status === "missing") {
    return problem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Access cookie missing.",
      requestId
    );
  }
  if (resolved.status === "invalid") {
    return problem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Access token invalid or expired.",
      requestId
    );
  }
  if (resolved.status === "unknown_account") {
    return problem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Unknown account.",
      requestId
    );
  }
  const { account } = resolved;
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
  const authorizer = new D1CapabilityAuthorizer(env.DB);
  return { workspace: new DepartmentWorkspace(store, authorizer) };
}

function authorizationContextFor(account: AccountRow): AuthorizationContext {
  return { actorUserId: account.user_id };
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
    !DepartmentLifecycleSchema.safeParse(body.lifecycle).success
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
      authorizationContextFor(auth.account),
      {
        code,
        name,
        description:
          typeof body.description === "string" ? body.description : undefined,
        lifecycle: body.lifecycle as
          | "Draft"
          | "PendingDevelopment"
          | "Active"
          | "Archived",
        display_order:
          typeof body.display_order === "number" ? body.display_order : 0,
      },
      correlationId
    );
    const createdData = { department: row };
    if (!DepartmentCreateResponseSchema.safeParse(createdData).success) {
      console.error(
        `[programs] department create malformed data requestId=${requestId}`
      );
      throw new Error("programs contract violation");
    }
    return jsonResponse(201, createdData, requestId);
  } catch (error) {
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
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
  const rows = await workspace.listDepartments(
    authorizationContextFor(auth.account)
  );
  const data = { departments: rows };
  if (!DepartmentsListSchema.safeParse(data).success) {
    console.error(
      `[programs] departments malformed data requestId=${requestId}`
    );
    throw new Error("programs contract violation");
  }
  return jsonResponse(200, data, requestId);
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
  const access = await workspace.getManagementAccess(
    authorizationContextFor(auth.account)
  );
  if (!ManagementAccessViewSchema.safeParse(access).success) {
    // Shared contract gate (#656): never a malformed 2xx. The throw
    // reaches the programs catch as the existing 500 INTERNAL_ERROR.
    console.error(`[programs] access malformed data requestId=${requestId}`);
    throw new Error("programs contract violation");
  }
  return jsonResponse(200, access, requestId);
}
/** GET /api/v1/programs/hub — capability-filtered Management Hub directory. */
export async function handleGetManagementHub(
  request: Request,
  env: ProgramEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const { workspace } = await getModule(env);
  const hub = await workspace.getManagementHub(
    authorizationContextFor(auth.account)
  );
  if (!ManagementHubViewSchema.safeParse(hub).success) {
    console.error(`[programs] hub malformed data requestId=${requestId}`);
    throw new Error("programs contract violation");
  }
  return jsonResponse(200, hub, requestId);
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
    authorizationContextFor(auth.account)
  );
  if (!ManagementDirectoryViewSchema.safeParse(directory).success) {
    console.error(`[programs] directory malformed data requestId=${requestId}`);
    throw new Error("programs contract violation");
  }
  return jsonResponse(200, directory, requestId);
}

/**
 * GET /api/v1/programs/members?q=... — Member Directory search (Spec 087
 * US 13-15 / ticket 087-04 #321).
 *
 * Admin/Staff resolve church-wide over all Active accounts; a Department
 * Manager resolves only over members with an Active enrollment in a program
 * of one of their assigned departments (server-side scope enforcement);
 * anyone else is denied (403). The search requires at least two characters
 * and returns at most `limit` (default 20, max 50) read-only member
 * projections whose department memberships render detail inline.
 */
export async function handleSearchManagementMembers(
  request: Request,
  env: ProgramEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const url = new URL(request.url);
  const query = parseSearchTerm(url.searchParams.get("q"));
  if (query.length < 2) {
    return validation(requestId, "Search requires at least two characters.");
  }
  const limit = floorClampLimit(url.searchParams.get("limit"), 20, 1, 50);
  const { workspace } = await getModule(env);
  try {
    const members = await workspace.searchManagementMembers(
      authorizationContextFor(auth.account),
      query,
      limit
    );
    const data = { members };
    if (!MembersSearchResultSchema.safeParse(data).success) {
      console.error(`[programs] members malformed data requestId=${requestId}`);
      throw new Error("programs contract violation");
    }
    return jsonResponse(200, data, requestId);
  } catch (error) {
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
    }
    throw error;
  }
}

/** GET /api/v1/programs/accounts?q=... — Account Directory search. */
export async function handleSearchAccountDirectory(
  request: Request,
  env: ProgramEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const url = new URL(request.url);
  const query = parseSearchTerm(url.searchParams.get("q"));
  const limit = floorClampLimit(url.searchParams.get("limit"), 20, 1, 50);
  const rawCursor = url.searchParams.get("cursor");
  const cursor = rawCursor === null ? 0 : Number(rawCursor);
  const rawStatus = url.searchParams.get("status");
  const rawDepartment = url.searchParams.get("department")?.trim() || undefined;
  if (!isValidAccountCursor(cursor)) {
    return validation(requestId, "Invalid Account Directory cursor.");
  }
  if (
    rawStatus !== null &&
    !AccountDirectoryStatusSchema.safeParse(rawStatus).success
  ) {
    return validation(requestId, "Unknown account status filter.");
  }
  if (rawDepartment !== undefined && rawDepartment.length > 80) {
    return validation(requestId, "Department filter is too long.");
  }
  const { workspace } = await getModule(env);
  try {
    const directory = await workspace.searchAccountDirectory(
      authorizationContextFor(auth.account),
      query,
      limit,
      {
        department: rawDepartment,
        status:
          rawStatus === null
            ? undefined
            : (rawStatus as "Pending" | "Active" | "Suspended" | "Deactivated"),
      },
      cursor
    );
    if (!AccountDirectoryViewSchema.safeParse(directory).success) {
      console.error(
        `[programs] accounts malformed data requestId=${requestId}`
      );
      throw new Error("programs contract violation");
    }
    return jsonResponse(200, directory, requestId);
  } catch (error) {
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
    }
    throw error;
  }
}

/** GET /api/v1/programs/accounts/:id — Account Directory detail. */
export async function handleGetAccountDirectoryDetail(
  request: Request,
  env: ProgramEnv,
  accountId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const { workspace } = await getModule(env);
  try {
    const account = await workspace.getAccountDirectoryDetail(
      authorizationContextFor(auth.account),
      accountId
    );
    if (!AccountDirectoryMemberSchema.safeParse(account).success) {
      console.error(
        `[programs] account detail malformed data requestId=${requestId}`
      );
      throw new Error("programs contract violation");
    }
    return jsonResponse(200, account, requestId);
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) {
      return problem(
        404,
        "NOT_FOUND",
        "Not found",
        "Account not found.",
        requestId
      );
    }
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
    }
    throw error;
  }
}

/** GET /api/v1/programs/attention — fresh, scoped operator attention state. */
export async function handleGetManagementAttention(
  request: Request,
  env: ProgramEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const { workspace } = await getModule(env);
  const limit = floorClampLimit(
    new URL(request.url).searchParams.get("limit"),
    5,
    1,
    50
  );
  const attention = await workspace.getManagementAttention(
    authorizationContextFor(auth.account),
    limit
  );
  if (!ManagementAttentionViewSchema.safeParse(attention).success) {
    console.error(`[programs] attention malformed data requestId=${requestId}`);
    throw new Error("programs contract violation");
  }
  return jsonResponse(200, attention, requestId);
}

/** GET /api/v1/programs/notifications — current scoped read-state overlay. */
export async function handleGetManagementNotifications(
  request: Request,
  env: ProgramEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const { workspace } = await getModule(env);
  const limit = floorClampLimit(
    new URL(request.url).searchParams.get("limit"),
    20,
    1,
    20
  );
  try {
    const notifications = await workspace.getManagementNotifications(
      authorizationContextFor(auth.account),
      limit
    );
    if (!ManagementNotificationsViewSchema.safeParse(notifications).success) {
      console.error(
        `[programs] notifications malformed data requestId=${requestId}`
      );
      throw new Error("programs contract violation");
    }
    return jsonResponse(200, notifications, requestId);
  } catch (error) {
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
    }
    throw error;
  }
}

/** POST /api/v1/programs/notifications/read — idempotent read-state writes. */
export async function handleMarkManagementNotificationsRead(
  request: Request,
  env: ProgramEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await parseJson<{ items?: unknown }>(request);
  const parsedEnvelope = NotificationsReadBodySchema.safeParse(body);
  if (!parsedEnvelope.success) {
    return validation(
      requestId,
      "items must be an array containing at most 100 notification sources."
    );
  }
  const items: NotificationReadStateInput[] = [];
  const seen = new Set<string>();
  for (const raw of parsedEnvelope.data.items) {
    if (typeof raw !== "object" || raw === null) {
      return validation(
        requestId,
        "Each notification source must be an object."
      );
    }
    const parsedItem = NotificationReadItemSchema.safeParse(raw);
    if (!parsedItem.success) {
      return validation(
        requestId,
        "Each notification source requires bounded source_key and source_revision strings."
      );
    }
    const key = `${parsedItem.data.source_key}\u0000${parsedItem.data.source_revision}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push({
      source_key: parsedItem.data.source_key,
      source_revision: parsedItem.data.source_revision,
    });
  }
  const { workspace } = await getModule(env);
  try {
    const markedCount = await workspace.markManagementNotificationsRead(
      authorizationContextFor(auth.account),
      items
    );
    const data = { marked_count: markedCount };
    if (!MarkedCountSchema.safeParse(data).success) {
      console.error(
        `[programs] notifications read malformed data requestId=${requestId}`
      );
      throw new Error("programs contract violation");
    }
    return jsonResponse(200, data, requestId);
  } catch (error) {
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
    }
    throw error;
  }
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
    authorizationContextFor(auth.account),
    programId
  );
  if (!result) {
    return notFound(requestId, "Unknown program.");
  }
  if (!ManagementProgramWorkspaceViewSchema.safeParse(result).success) {
    console.error(
      `[programs] management malformed data requestId=${requestId}`
    );
    throw new Error("programs contract violation");
  }
  return jsonResponse(200, result, requestId);
}

/** GET /api/v1/programs/:id/attendance-artifact — scoped Program QR read. */
export async function handleGetProgramAttendanceArtifact(
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
  const artifact = await workspace.getProgramAttendanceArtifact(
    authorizationContextFor(auth.account),
    programId
  );
  if (!artifact) {
    return notFound(requestId, "Unknown program.");
  }
  const artifactData = { artifact };
  if (!ProgramAttendanceArtifactSchema.safeParse(artifactData).success) {
    console.error(`[programs] artifact malformed data requestId=${requestId}`);
    throw new Error("programs contract violation");
  }
  return jsonResponse(200, artifactData, requestId);
}

/** POST /api/v1/programs/:id/attendance-artifact/rotate — emergency rotation. */
export async function handleRotateProgramAttendanceArtifact(
  request: Request,
  env: ProgramEnv,
  programId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const parsedKey = parseOptionalIdempotencyKey(
    request.headers.get("Idempotency-Key")
  );
  if (parsedKey === null) {
    return validation(requestId, "Idempotency-Key is too long.");
  }
  const idempotencyKey = parsedKey.key;
  const correlationId = idempotencyKey || requestId;
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const { workspace } = await getModule(env);
  try {
    const rotation = await workspace.rotateProgramCheckInToken(
      authorizationContextFor(auth.account),
      programId,
      idempotencyKey || requestId,
      correlationId
    );
    const rotationData = { rotation };
    if (!ProgramTokenRotationSchema.safeParse(rotationData).success) {
      console.error(
        `[programs] rotation malformed data requestId=${requestId}`
      );
      throw new Error("programs contract violation");
    }
    return jsonResponse(200, rotationData, requestId);
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) {
      return notFound(requestId, "Unknown program.");
    }
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
    }
    throw error;
  }
}

/** GET /api/v1/programs/:id/cockpit — scoped management cockpit projection. */
export async function handleGetManagementCockpit(
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
  const result = await workspace.getManagementCockpit(
    authorizationContextFor(auth.account),
    programId
  );
  if (!result) {
    return notFound(requestId, "Unknown program.");
  }
  const cockpitData = { cockpit: result };
  if (!ManagementCockpitViewSchema.safeParse(cockpitData).success) {
    console.error(`[programs] cockpit malformed data requestId=${requestId}`);
    throw new Error("programs contract violation");
  }
  return jsonResponse(200, cockpitData, requestId);
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
  const catalog = await workspace.listParticipantCatalog(
    authorizationContextFor(auth.account)
  );
  const catalogData = { catalog };
  if (!ParticipantCatalogSchema.safeParse(catalogData).success) {
    console.error(`[programs] catalog malformed data requestId=${requestId}`);
    throw new Error("programs contract violation");
  }
  return jsonResponse(200, catalogData, requestId);
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
    authorizationContextFor(auth.account),
    programId
  );
  if (!detail) {
    return notFound(requestId, "Unknown program.");
  }
  const detailData = { detail };
  if (!ParticipantProgramDetailSchema.safeParse(detailData).success) {
    console.error(`[programs] detail malformed data requestId=${requestId}`);
    throw new Error("programs contract violation");
  }
  return jsonResponse(200, detailData, requestId);
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
    authorizationContextFor(auth.account),
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
    authorizationContextFor(auth.account),
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
  const detailData = { department: departmentDto(row), modules: safeModules };
  if (!DepartmentDetailSchema.safeParse(detailData).success) {
    console.error(
      `[programs] department malformed data requestId=${requestId}`
    );
    throw new Error("programs contract violation");
  }
  return jsonResponse(200, detailData, requestId);
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
  if (
    body.lifecycle !== undefined &&
    !DepartmentLifecycleSchema.safeParse(body.lifecycle).success
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
  if (
    body.lifecycle !== undefined &&
    DepartmentLifecycleSchema.safeParse(body.lifecycle).success
  ) {
    update.lifecycle = body.lifecycle as
      | "Draft"
      | "PendingDevelopment"
      | "Active"
      | "Archived";
  }
  if (typeof body.display_order === "number") {
    update.display_order = body.display_order;
  }

  try {
    const row = await workspace.updateDepartment(
      authorizationContextFor(auth.account),
      departmentId,
      update,
      correlationId
    );
    const updatedData = { department: row };
    if (!DepartmentUpdateResponseSchema.safeParse(updatedData).success) {
      console.error(
        `[programs] department update malformed data requestId=${requestId}`
      );
      throw new Error("programs contract violation");
    }
    return jsonResponse(200, updatedData, requestId);
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
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
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
    "description",
    "behavior_type",
    "lifecycle",
  ]);
  if (
    !fields ||
    typeof fields.description !== "string" ||
    !fields.description.trim()
  ) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "name, purpose, behavior_type, and lifecycle are required and must be valid.",
      requestId
    );
  }

  const { workspace } = await getModule(env);
  try {
    const row = await workspace.createProgram(
      authorizationContextFor(auth.account),
      {
        department_id: departmentId,
        name: fields.name as string,
        description: (fields.description as string).trim(),
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
    const createdProgramData = { program: row };
    if (!ProgramCreateResponseSchema.safeParse(createdProgramData).success) {
      console.error(
        `[programs] program create malformed data requestId=${requestId}`
      );
      throw new Error("programs contract violation");
    }
    return jsonResponse(201, createdProgramData, requestId);
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
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
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
    authorizationContextFor(auth.account),
    departmentId
  );
  const programsData = { programs: rows };
  if (!ProgramsListSchema.safeParse(programsData).success) {
    console.error(`[programs] programs malformed data requestId=${requestId}`);
    throw new Error("programs contract violation");
  }
  return jsonResponse(200, programsData, requestId);
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
  const row = await workspace.getProgram(
    authorizationContextFor(auth.account),
    programId
  );
  if (!row) {
    return problem(
      404,
      "NOT_FOUND",
      "Not found",
      "Unknown program.",
      requestId
    );
  }
  const programData = { program: row };
  if (!ProgramGetSchema.safeParse(programData).success) {
    console.error(`[programs] program malformed data requestId=${requestId}`);
    throw new Error("programs contract violation");
  }
  return jsonResponse(200, programData, requestId);
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
    check_in_opens_at_minutes_before_start?: unknown;
    check_in_closes_at_minutes_after_end?: unknown;
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
      authorizationContextFor(auth.account),
      programId,
      update,
      correlationId
    );
    const updatedProgramData = { program: row };
    if (!ProgramUpdateResponseSchema.safeParse(updatedProgramData).success) {
      console.error(
        `[programs] program update malformed data requestId=${requestId}`
      );
      throw new Error("programs contract violation");
    }
    return jsonResponse(200, updatedProgramData, requestId);
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
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
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
  const program = await workspace.getProgram(
    authorizationContextFor(auth.account),
    programId
  );
  if (!program || !program.capabilities.manage) {
    return problem(
      404,
      "NOT_FOUND",
      "Not found",
      "Unknown program.",
      requestId
    );
  }
  const query = parseSearchTerm(new URL(request.url).searchParams.get("q"));
  const excludeEnrolled =
    new URL(request.url).searchParams.get("excludeEnrolled") === "true";
  if (query.length < 2) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "Search requires at least two characters.",
      requestId
    );
  }
  const members = await workspace.searchActiveMembers(
    query,
    20,
    excludeEnrolled ? programId : undefined
  );
  const optionsData = { members };
  if (!MemberOptionsSchema.safeParse(optionsData).success) {
    console.error(
      `[programs] member options malformed data requestId=${requestId}`
    );
    throw new Error("programs contract violation");
  }
  return jsonResponse(200, optionsData, requestId);
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
      authorizationContextFor(auth.account),
      {
        department_id: departmentId,
        module_key: moduleKey as ModuleKey,
        enabled,
      },
      correlationId
    );
    const moduleData = { module };
    if (!SetModuleResponseSchema.safeParse(moduleData).success) {
      console.error(`[programs] module malformed data requestId=${requestId}`);
      throw new Error("programs contract violation");
    }
    return jsonResponse(200, moduleData, requestId);
  } catch (error) {
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
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// PRG-02 (#198): schedule rules, exceptions, generation, events.
// ---------------------------------------------------------------------------

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
  if (!(await workspace.programExists(programId))) {
    return notFound(requestId, "Unknown program.");
  }
  try {
    const ctx = authorizationContextFor(auth.account);
    await workspace.assertProgramManagement(ctx, programId);
    const rules = await workspace.listScheduleRules(ctx, programId);
    const rulesData = { rules };
    if (!ScheduleRulesSchema.safeParse(rulesData).success) {
      console.error(`[programs] rules malformed data requestId=${requestId}`);
      throw new Error("programs contract violation");
    }
    return jsonResponse(200, rulesData, requestId);
  } catch (error) {
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
    }
    throw error;
  }
}

/** GET /api/v1/programs/:programId/schedule-rules/:ruleId/exceptions */
export async function handleListScheduleExceptions(
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
  const { workspace } = await getModule(env);
  if (!(await workspace.programExists(programId))) {
    return notFound(requestId, "Unknown schedule rule.");
  }
  try {
    const ctx = authorizationContextFor(auth.account);
    await workspace.assertProgramManagement(ctx, programId);
    const rule = await workspace.getScheduleRule(ctx, ruleId);
    if (!rule || rule.program_id !== programId) {
      return notFound(requestId, "Unknown schedule rule.");
    }
    const exceptions = await workspace.listScheduleExceptions(
      ctx,
      programId,
      ruleId
    );
    const exceptionsData = { exceptions };
    if (!ScheduleExceptionsSchema.safeParse(exceptionsData).success) {
      console.error(
        `[programs] exceptions malformed data requestId=${requestId}`
      );
      throw new Error("programs contract violation");
    }
    return jsonResponse(200, exceptionsData, requestId);
  } catch (error) {
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
    }
    throw error;
  }
}

/** POST /api/v1/programs/:programId/schedule-rules */
export async function handleCreateScheduleRule(
  request: Request,
  env: ProgramEnv,
  programId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || null;
  const correlationId = idempotencyKey ?? requestId;
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
    location?: unknown;
    effective_start_date?: unknown;
    effective_end_date?: unknown;
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
  if (!(await workspace.programExists(programId))) {
    return notFound(requestId, "Unknown program.");
  }
  try {
    const result = await workspace.createScheduleRule(
      authorizationContextFor(auth.account),
      programId,
      value,
      correlationId,
      idempotencyKey
    );
    const ruleData = { rule: result.rule, idempotent: result.idempotent };
    if (!ScheduleRuleCreateResponseSchema.safeParse(ruleData).success) {
      console.error(
        `[programs] rule create malformed data requestId=${requestId}`
      );
      throw new Error("programs contract violation");
    }
    return jsonResponse(result.idempotent ? 200 : 201, ruleData, requestId);
  } catch (error) {
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
    }
    throw error;
  }
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
    location?: unknown;
    effective_start_date?: unknown;
    effective_end_date?: unknown;
  }>(request);
  if (body === null) {
    return validation(requestId, "Body must be JSON.");
  }

  const { workspace } = await getModule(env);
  const ctx = authorizationContextFor(auth.account);

  try {
    await workspace.assertProgramManagement(ctx, programId);
    const existing = await workspace.getScheduleRule(ctx, ruleId);
    if (!existing || existing.program_id !== programId) {
      return notFound(requestId, "Unknown schedule rule.");
    }
    const parsed = parseRulePatch(body, existing);
    if (!parsed.ok) {
      return validation(requestId, parsed.detail);
    }
    const { update } = parsed;
    const row = await workspace.updateScheduleRule(
      ctx,
      ruleId,
      update,
      correlationId
    );
    const ruleData = { rule: row };
    if (!ScheduleRuleResponseSchema.safeParse(ruleData).success) {
      console.error(`[programs] rule malformed data requestId=${requestId}`);
      throw new Error("programs contract violation");
    }
    return jsonResponse(200, ruleData, requestId);
  } catch (error) {
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
    }
    throw error;
  }
}

/** POST /api/v1/programs/:programId/schedule-rules/:ruleId/retire */
export async function handleRetireScheduleRule(
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
  const { workspace } = await getModule(env);
  const ctx = authorizationContextFor(auth.account);
  try {
    await workspace.assertProgramManagement(ctx, programId);
    const existing = await workspace.getScheduleRule(ctx, ruleId);
    if (!existing || existing.program_id !== programId) {
      return notFound(requestId, "Unknown schedule rule.");
    }
    const row = await workspace.retireScheduleRule(ctx, ruleId, correlationId);
    const ruleData = { rule: row };
    if (!ScheduleRuleResponseSchema.safeParse(ruleData).success) {
      console.error(`[programs] rule malformed data requestId=${requestId}`);
      throw new Error("programs contract violation");
    }
    return jsonResponse(200, ruleData, requestId);
  } catch (error) {
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
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
    new_date?: unknown;
    new_start_time?: unknown;
    new_end_time?: unknown;
  }>(request);
  if (body === null) {
    return validation(requestId, "Body must be JSON.");
  }
  if (!isValidWallDate(body.override_date)) {
    return validation(requestId, "override_date must be YYYY-MM-DD.");
  }
  if (!ExceptionActionSchema.safeParse(body.action).success) {
    return validation(requestId, "action must be CANCEL or RESCHEDULE.");
  }
  const newStart =
    typeof body.new_start_time === "string" ? body.new_start_time : null;
  const newEnd =
    typeof body.new_end_time === "string" ? body.new_end_time : null;
  const newDate =
    body.new_date === undefined || body.new_date === null
      ? null
      : body.new_date;
  if (newDate !== null && !isValidWallDate(newDate)) {
    return validation(requestId, "new_date must be YYYY-MM-DD or null.");
  }
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
  if (body.action === "CANCEL" && newDate !== null) {
    return validation(requestId, "CANCEL must not include new_date.");
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
  const ctx = authorizationContextFor(auth.account);
  try {
    await workspace.assertProgramManagement(ctx, programId);
    const rule = await workspace.getScheduleRule(ctx, ruleId);
    if (!rule || rule.program_id !== programId) {
      return notFound(requestId, "Unknown schedule rule.");
    }
    const row = await workspace.createScheduleException(
      ctx,
      ruleId,
      {
        override_date: body.override_date,
        action: body.action as "CANCEL" | "RESCHEDULE",
        new_date: newDate,
        new_start_time: newStart,
        new_end_time: newEnd,
      },
      correlationId
    );
    const exceptionData = { exception: row };
    if (
      !ScheduleExceptionCreateResponseSchema.safeParse(exceptionData).success
    ) {
      console.error(
        `[programs] exception malformed data requestId=${requestId}`
      );
      throw new Error("programs contract violation");
    }
    return jsonResponse(201, exceptionData, requestId);
  } catch (error) {
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
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
  const ctx = authorizationContextFor(auth.account);
  try {
    await workspace.assertProgramManagement(ctx, programId);
    const exists = await workspace.getScheduleException(ctx, exceptionId);
    if (!exists) {
      return notFound(requestId, "Unknown schedule exception.");
    }
    const rule = await workspace.getScheduleRule(ctx, exists.rule_id);
    if (!rule || rule.program_id !== programId) {
      return notFound(requestId, "Unknown schedule exception.");
    }
    await workspace.deleteScheduleException(ctx, exceptionId, correlationId);
    const deletedData = { deleted: true };
    if (!ScheduleExceptionDeleteResponseSchema.safeParse(deletedData).success) {
      console.error(
        `[programs] exception delete malformed data requestId=${requestId}`
      );
      throw new Error("programs contract violation");
    }
    return jsonResponse(200, deletedData, requestId);
  } catch (error) {
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
    }
    throw error;
  }
}

/** POST /api/v1/programs/:programId/events/preview */
export async function handlePreviewEvents(
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
  // This is the only handler whose body is fully optional, so `parseJson`
  // returning null for BOTH an empty body and malformed JSON would silently
  // default a garbage body to horizonDays = 90 and persist a real preview.
  // Read the raw text: empty/whitespace-only means "no body, use defaults";
  // any non-empty body must parse as a non-null, non-array JSON object or
  // the request is rejected before any write (EVT-02.4 acceptance).
  const rawBody = await request.text();
  let body: {
    horizon_days?: unknown;
    from_date?: unknown;
    until_date?: unknown;
  } | null = null;
  if (rawBody.trim().length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return validation(requestId, "請求內容必須是有效的 JSON 物件。");
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return validation(requestId, "請求內容必須是有效的 JSON 物件。");
    }
    body = parsed as {
      horizon_days?: unknown;
      from_date?: unknown;
      until_date?: unknown;
    };
  }
  const defaultFromDate = hkTodayWallDate();
  let fromDate = defaultFromDate;
  let untilDate = addWallDays(addWallMonths(fromDate, 3), -1);
  let horizonDays: number | null = null;
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
      return validation(
        requestId,
        "產生範圍的天數必須是 1 至 365 之間的整數。"
      );
    }
    if (body.from_date !== undefined && !isValidWallDate(body.from_date)) {
      return validation(requestId, "from_date must be YYYY-MM-DD.");
    }
    if (body.until_date !== undefined && !isValidWallDate(body.until_date)) {
      return validation(requestId, "until_date must be YYYY-MM-DD.");
    }
    if (body.from_date !== undefined) {
      fromDate = body.from_date;
      if (horizonDays === null && body.until_date === undefined) {
        untilDate = addWallDays(addWallMonths(fromDate, 3), -1);
      }
    }
    if (horizonDays !== null && body.until_date !== undefined) {
      return validation(
        requestId,
        "請使用 horizon_days 或 from_date/until_date 其中一種範圍格式。"
      );
    }
    if (horizonDays !== null) {
      untilDate = addWallDays(fromDate, horizonDays - 1);
    } else if (body.until_date !== undefined) {
      untilDate = body.until_date;
    }
  }
  if (untilDate < fromDate) {
    return validation(requestId, "until_date must be on or after from_date.");
  }
  horizonDays = wallDaySpan(fromDate, untilDate);
  if (horizonDays < 1 || horizonDays > 365) {
    return validation(requestId, "預覽範圍必須在 1 至 365 個香港時間日內。");
  }
  const { workspace } = await getModule(env);
  if (!(await workspace.programExists(programId))) {
    return notFound(requestId, "Unknown program.");
  }
  try {
    const result = await workspace.previewEvents(
      authorizationContextFor(auth.account),
      programId,
      horizonDays,
      correlationId,
      { fromDate, untilDate }
    );
    const previewData = { plan: result.plan, occurrences: result.occurrences };
    if (!PreviewEventsResponseSchema.safeParse(previewData).success) {
      console.error(`[programs] preview malformed data requestId=${requestId}`);
      throw new Error("programs contract violation");
    }
    return jsonResponse(200, previewData, requestId);
  } catch (error) {
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
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
  const body = await parseJson<{ plan_id?: unknown }>(request);
  if (
    body === null ||
    typeof body.plan_id !== "string" ||
    body.plan_id.trim().length === 0
  ) {
    return validation(requestId, "plan_id is required.");
  }
  const { workspace } = await getModule(env);
  if (!(await workspace.programExists(programId))) {
    return notFound(requestId, "Unknown program.");
  }
  try {
    const result = await workspace.generateEvents(
      authorizationContextFor(auth.account),
      programId,
      body.plan_id,
      correlationId
    );
    const generatedData = { generated: result };
    if (!GenerateEventsResponseSchema.safeParse(generatedData).success) {
      console.error(
        `[programs] generate malformed data requestId=${requestId}`
      );
      throw new Error("programs contract violation");
    }
    return jsonResponse(200, generatedData, requestId);
  } catch (error) {
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
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
    event_type?: unknown;
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
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    if (typeof value !== "string") {
      throw new TypeError(`${field} must be text.`);
    }
    return value.trim() || null;
  };
  let name: string | null | undefined;
  let location: string | null | undefined;
  let opens: string | null | undefined;
  let closes: string | null | undefined;
  try {
    name = textField(body.name, "name");
    if (name === undefined || name === null) {
      return validation(requestId, "name is required.");
    }
    location = textField(body.location, "location");
    if (
      body.event_type !== undefined &&
      body.event_type !== null &&
      !EventTypeSchema.safeParse(body.event_type).success
    ) {
      return validation(
        requestId,
        "event_type must be one of 崇拜, 訓練, 小組, 排練, 外展, 其他."
      );
    }
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
  if (!(await workspace.programExists(programId))) {
    return notFound(requestId, "Unknown program.");
  }
  try {
    const row = await workspace.createEvent(
      authorizationContextFor(auth.account),
      programId,
      {
        starts_at: body.starts_at,
        ends_at: body.ends_at,
        name: name ?? null,
        event_type: (body.event_type as EventType) ?? null,
        location: location ?? null,
        check_in_window_opens_at: opens ?? null,
        check_in_window_closes_at: closes ?? null,
      } satisfies CreateEventCommand,
      correlationId
    );
    const eventData = { event: row };
    if (!EventCreateResponseSchema.safeParse(eventData).success) {
      console.error(
        `[programs] event create malformed data requestId=${requestId}`
      );
      throw new Error("programs contract violation");
    }
    return jsonResponse(201, eventData, requestId);
  } catch (error) {
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
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
  const rows = await workspace.listEvents(
    authorizationContextFor(auth.account),
    programId
  );
  if (rows === null) {
    return notFound(requestId, "Unknown program.");
  }
  const eventsData = { events: rows };
  if (!EventsListSchema.safeParse(eventsData).success) {
    console.error(`[programs] events malformed data requestId=${requestId}`);
    throw new Error("programs contract violation");
  }
  return jsonResponse(200, eventsData, requestId);
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
      authorizationContextFor(auth.account),
      eventId
    );
    if (!detail || detail.event.program_id !== programId) {
      return notFound(requestId, "Unknown event.");
    }
    if (!EventDetailResponseSchema.safeParse(detail).success) {
      console.error(
        `[programs] event detail malformed data requestId=${requestId}`
      );
      throw new Error("programs contract violation");
    }
    return jsonResponse(200, detail, requestId);
  } catch (error) {
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
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
  if (
    "reason" in body &&
    body.reason !== null &&
    body.reason !== undefined &&
    (typeof body.reason !== "string" || !body.reason.trim())
  ) {
    return validation(requestId, "reason must be text when provided.");
  }
  const ALLOWED_EVENT_UPDATE_FIELDS: Record<string, true> = {
    starts_at: true,
    ends_at: true,
    name: true,
    location: true,
    event_type: true,
    check_in_window_opens_at: true,
    check_in_window_closes_at: true,
    reason: true,
  };
  const isCancellationPayload =
    "reason" in body &&
    Object.keys(body).every((key) => key === "reason" || key === "confirm");
  const { workspace } = await getModule(env);
  const existing = await workspace.getEvent(
    authorizationContextFor(auth.account),
    eventId
  );
  if (!existing || existing.program_id !== programId) {
    return notFound(requestId, "Unknown event.");
  }
  if ("availability" in body) {
    const confirmed = body.confirm === true;
    const availability = body.availability as EventAvailability;
    try {
      const row = await workspace.setEventAvailability(
        authorizationContextFor(auth.account),
        eventId,
        { availability, confirm: confirmed },
        correlationId
      );
      const updatedEventData = { event: row };
      if (!EventResponseSchema.safeParse(updatedEventData).success) {
        console.error(
          `[programs] event update malformed data requestId=${requestId}`
        );
        throw new Error("programs contract violation");
      }
      return jsonResponse(200, updatedEventData, requestId);
    } catch (error) {
      const mapped = mapWorkspaceError(error, requestId);
      if (mapped) {
        return mapped;
      }
      throw error;
    }
  }
  if (isCancellationPayload) {
    const reason =
      typeof body.reason === "string" ? body.reason.trim() || null : null;
    try {
      const row = await workspace.cancelEvent(
        authorizationContextFor(auth.account),
        eventId,
        { reason },
        correlationId
      );
      const updatedEventData = { event: row };
      if (!EventResponseSchema.safeParse(updatedEventData).success) {
        console.error(
          `[programs] event update malformed data requestId=${requestId}`
        );
        throw new Error("programs contract violation");
      }
      return jsonResponse(200, updatedEventData, requestId);
    } catch (error) {
      const mapped = mapWorkspaceError(error, requestId);
      if (mapped) {
        return mapped;
      }
      throw error;
    }
  }
  if (Object.keys(body).some((key) => !ALLOWED_EVENT_UPDATE_FIELDS[key])) {
    return validation(requestId, "Unknown event field.");
  }
  if ("name" in body && (typeof body.name !== "string" || !body.name.trim())) {
    return validation(requestId, "name is required.");
  }
  const parseOptionalText = (value: unknown, field: string) => {
    if (value === undefined) {
      return;
    }
    if (value === null) {
      return null;
    }
    if (typeof value !== "string") {
      throw new TypeError(`${field} must be text.`);
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
    if (
      body.event_type !== undefined &&
      body.event_type !== null &&
      !EventTypeSchema.safeParse(body.event_type).success
    ) {
      return validation(
        requestId,
        "event_type must be one of 崇拜, 訓練, 小組, 排練, 外展, 其他."
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
        : {
            name: parseOptionalText(body.name, "name"),
          }),
      ...(body.event_type === undefined
        ? {}
        : { event_type: (body.event_type as EventType | null) ?? null }),
      ...(body.location === undefined
        ? {}
        : { location: parseOptionalText(body.location, "location") }),
      ...(body.check_in_window_opens_at === undefined
        ? {}
        : { check_in_window_opens_at: opens }),
      ...(body.check_in_window_closes_at === undefined
        ? {}
        : { check_in_window_closes_at: closes }),
      ...(body.reason === undefined
        ? {}
        : {
            reason:
              typeof body.reason === "string"
                ? body.reason.trim() || null
                : null,
          }),
    };
  } catch (error) {
    return validation(
      requestId,
      error instanceof Error ? error.message : "Invalid event field."
    );
  }
  try {
    const row = await workspace.updateEvent(
      authorizationContextFor(auth.account),
      eventId,
      update,
      correlationId
    );
    const updatedEventData = { event: row };
    if (!EventResponseSchema.safeParse(updatedEventData).success) {
      console.error(
        `[programs] event update malformed data requestId=${requestId}`
      );
      throw new Error("programs contract violation");
    }
    return jsonResponse(200, updatedEventData, requestId);
  } catch (error) {
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
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
  if (!(await workspace.programExists(programId))) {
    return notFound(requestId, "Unknown program.");
  }
  try {
    const row = await workspace.submitEnrollmentRequest(
      authorizationContextFor(auth.account),
      programId,
      correlationId
    );
    return jsonResponse(201, { request: row }, requestId);
  } catch (error) {
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
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
    authorizationContextFor(auth.account),
    programId
  );
  if (rows === null) {
    return notFound(requestId, "Unknown program.");
  }
  return jsonResponse(200, { requests: rows }, requestId);
}
/** GET /api/v1/programs/:programId/enrollment-snapshot */
export async function handleListEnrollmentSnapshot(
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
  const snapshot = await workspace.listEnrollmentSnapshot(
    authorizationContextFor(auth.account),
    programId
  );
  if (snapshot === null) {
    return notFound(requestId, "Unknown program.");
  }
  return jsonResponse(200, snapshot, requestId);
}

/** POST /api/v1/programs/:programId/enrollment-approval-runs */
export async function handleStartEnrollmentApprovalRun(
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
  const body = await parseJson<{ request_ids?: unknown }>(request);
  if (
    body === null ||
    !Array.isArray(body.request_ids) ||
    !body.request_ids.every((id): id is string => typeof id === "string")
  ) {
    return validation(requestId, "request_ids must be an array of strings.");
  }
  const { workspace } = await getModule(env);
  if (!(await workspace.programExists(programId))) {
    return notFound(requestId, "Unknown program.");
  }
  try {
    const result = await workspace.startEnrollmentApprovalRun(
      authorizationContextFor(auth.account),
      programId,
      body.request_ids,
      correlationId
    );
    return jsonResponse(201, result, requestId);
  } catch (error) {
    const mapped =
      mapEnrollmentApprovalRunError(error, requestId) ??
      mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
    }
    throw error;
  }
}

/** GET /api/v1/programs/:programId/enrollment-approval-runs */
export async function handleListEnrollmentApprovalRuns(
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
  if (!(await workspace.programExists(programId))) {
    return notFound(requestId, "Unknown program.");
  }
  try {
    const runs = await workspace.listEnrollmentApprovalRuns(
      authorizationContextFor(auth.account),
      programId
    );
    return jsonResponse(200, { runs }, requestId);
  } catch (error) {
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
    }
    throw error;
  }
}

async function handleEnrollmentApprovalRunAction(
  request: Request,
  env: ProgramEnv,
  programId: string,
  runId: string,
  action: "reconcile" | "continue" | "cancel"
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const correlationId = request.headers.get("Idempotency-Key") ?? requestId;
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const { workspace } = await getModule(env);
  if (!(await workspace.programExists(programId))) {
    return notFound(requestId, "Unknown program.");
  }
  try {
    const ctx = authorizationContextFor(auth.account);
    if (action === "reconcile") {
      const run = await workspace.reconcileEnrollmentApprovalRun(
        ctx,
        programId,
        runId,
        correlationId
      );
      return run
        ? jsonResponse(200, { run }, requestId)
        : notFound(requestId, "Unknown Enrollment Approval Run.");
    }
    if (action === "continue") {
      const result = await workspace.continueEnrollmentApprovalRun(
        ctx,
        programId,
        runId,
        correlationId
      );
      return result
        ? jsonResponse(200, result, requestId)
        : notFound(requestId, "Unknown Enrollment Approval Run.");
    }
    const run = await workspace.cancelEnrollmentApprovalRun(
      ctx,
      programId,
      runId,
      correlationId
    );
    return run
      ? jsonResponse(200, { run }, requestId)
      : notFound(requestId, "Unknown Enrollment Approval Run.");
  } catch (error) {
    const mapped =
      mapEnrollmentApprovalRunError(error, requestId) ??
      mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
    }
    throw error;
  }
}

/** POST /api/v1/programs/:programId/enrollment-approval-runs/:runId/reconcile */
export function handleReconcileEnrollmentApprovalRun(
  request: Request,
  env: ProgramEnv,
  programId: string,
  runId: string
): Promise<Response> {
  return handleEnrollmentApprovalRunAction(
    request,
    env,
    programId,
    runId,
    "reconcile"
  );
}

/** POST /api/v1/programs/:programId/enrollment-approval-runs/:runId/continue */
export function handleContinueEnrollmentApprovalRun(
  request: Request,
  env: ProgramEnv,
  programId: string,
  runId: string
): Promise<Response> {
  return handleEnrollmentApprovalRunAction(
    request,
    env,
    programId,
    runId,
    "continue"
  );
}

/** POST /api/v1/programs/:programId/enrollment-approval-runs/:runId/cancel */
export function handleCancelEnrollmentApprovalRun(
  request: Request,
  env: ProgramEnv,
  programId: string,
  runId: string
): Promise<Response> {
  return handleEnrollmentApprovalRunAction(
    request,
    env,
    programId,
    runId,
    "cancel"
  );
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
  const body = await parseJson<{
    action?: unknown;
    note?: unknown;
    request_version?: unknown;
  }>(request);
  if (body === null) {
    return validation(requestId, "Body must be JSON.");
  }
  if (body.action !== "Approved" && body.action !== "Rejected") {
    return validation(requestId, "action must be Approved or Rejected.");
  }
  const requestVersion =
    body.request_version === undefined || body.request_version === null
      ? undefined
      : body.request_version;
  if (
    requestVersion !== undefined &&
    (typeof requestVersion !== "number" ||
      !Number.isSafeInteger(requestVersion) ||
      requestVersion < 1)
  ) {
    return validation(requestId, "request_version must be a positive integer.");
  }
  const note = typeof body.note === "string" ? body.note.trim() : null;
  const { workspace } = await getModule(env);
  const existing = await workspace.getEnrollmentRequest(
    authorizationContextFor(auth.account),
    enrollmentRequestId
  );
  if (!existing) {
    return notFound(requestId, "Unknown enrollment request.");
  }
  if (existing.program_id !== programId) {
    return notFound(requestId, "Unknown enrollment request.");
  }
  try {
    const result = await workspace.decideEnrollmentRequest(
      authorizationContextFor(auth.account),
      programId,
      enrollmentRequestId,
      {
        action: body.action,
        note,
        expectedRequestVersion: requestVersion,
      },
      correlationId
    );
    return jsonResponse(200, result, requestId);
  } catch (error) {
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
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
    authorizationContextFor(auth.account),
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
      authorizationContextFor(auth.account),
      programId,
      enrollmentRequestId,
      correlationId
    );
    return jsonResponse(200, { request: row }, requestId);
  } catch (error) {
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
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
  const { workspace } = await getModule(env);
  if (!(await workspace.programExists(programId))) {
    return notFound(requestId, "Unknown program.");
  }
  try {
    const row = await workspace.assistedEnroll(
      authorizationContextFor(auth.account),
      programId,
      { memberUserId },
      correlationId
    );
    return jsonResponse(201, { enrollment: row }, requestId);
  } catch (error) {
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
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
    authorizationContextFor(auth.account),
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
  const body = await parseJson<{ reason?: unknown }>(request);
  if (body === null) {
    return validation(requestId, "Body must be JSON.");
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : null;
  if (reason !== null && reason.length > 500) {
    return validation(requestId, "reason must be 500 characters or fewer.");
  }
  const { workspace } = await getModule(env);
  const existing = await workspace.getEnrollment(
    authorizationContextFor(auth.account),
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
      authorizationContextFor(auth.account),
      programId,
      enrollmentId,
      correlationId,
      reason
    );
    return jsonResponse(200, { enrollment: row }, requestId);
  } catch (error) {
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
    }
    throw error;
  }
}

/**
 * GET /api/v1/programs/notices — member-scoped participant Notices
 * (085-07 #324). Newest-first within the 90-day retention window; READ
 * notices are included. Strictly the actor's own rows.
 */
export async function handleListParticipantNotices(
  request: Request,
  env: ProgramEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const { workspace } = await getModule(env);
  try {
    const notices = await workspace.listParticipantNotices(
      authorizationContextFor(auth.account),
      auth.account.user_id
    );
    if (!ParticipantNoticesViewSchema.safeParse(notices).success) {
      console.error(`[programs] notices malformed data requestId=${requestId}`);
      throw new Error("programs contract violation");
    }
    return jsonResponse(200, notices, requestId);
  } catch (error) {
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
    }
    throw error;
  }
}

/** POST /api/v1/programs/notices/read-all — idempotent mark-all-read. */
export async function handleMarkParticipantNoticesRead(
  request: Request,
  env: ProgramEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const { workspace } = await getModule(env);
  try {
    const markedCount = await workspace.markAllParticipantNoticesRead(
      authorizationContextFor(auth.account),
      auth.account.user_id
    );
    const markedData = { marked_count: markedCount };
    if (!MarkedCountSchema.safeParse(markedData).success) {
      console.error(
        `[programs] notices read-all malformed data requestId=${requestId}`
      );
      throw new Error("programs contract violation");
    }
    return jsonResponse(200, markedData, requestId);
  } catch (error) {
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
    }
    throw error;
  }
}

/** POST /api/v1/programs/notices — Admin/Staff-only notice creation. */
export async function handleCreateParticipantNotice(
  request: Request,
  env: ProgramEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await parseJson<{
    member_user_id?: unknown;
    kind?: unknown;
    title?: unknown;
    body?: unknown;
    program_id?: unknown;
    event_id?: unknown;
  }>(request);
  if (body === null) {
    return validation(requestId, "Body must be JSON.");
  }
  const memberUserId = trimmedField(body.member_user_id);
  const title = trimmedField(body.title);
  const noticeBody = trimmedField(body.body);
  if (
    !memberUserId ||
    !ParticipantNoticeKindSchema.safeParse(body.kind).success ||
    !title ||
    !noticeBody
  ) {
    return validation(
      requestId,
      "member_user_id, kind (event|program|account), a non-empty title, and a non-empty body are required."
    );
  }
  if (
    body.program_id !== undefined &&
    body.program_id !== null &&
    typeof body.program_id !== "string"
  ) {
    return validation(requestId, "program_id must be a string when provided.");
  }
  if (
    body.event_id !== undefined &&
    body.event_id !== null &&
    typeof body.event_id !== "string"
  ) {
    return validation(requestId, "event_id must be a string when provided.");
  }
  const programId = optionalIdField(body.program_id);
  const eventId = optionalIdField(body.event_id);
  const { workspace } = await getModule(env);
  try {
    const notice = await workspace.createParticipantNotice(
      authorizationContextFor(auth.account),
      {
        member_user_id: memberUserId,
        kind: body.kind as "event" | "program" | "account",
        title,
        body: noticeBody,
        program_id: programId,
        event_id: eventId,
      }
    );
    const noticeData = { notice };
    if (!NoticeCreateResponseSchema.safeParse(noticeData).success) {
      console.error(
        `[programs] notice create malformed data requestId=${requestId}`
      );
      throw new Error("programs contract violation");
    }
    return jsonResponse(201, noticeData, requestId);
  } catch (error) {
    const mapped = mapWorkspaceError(error, requestId);
    if (mapped) {
      return mapped;
    }
    throw error;
  }
}
