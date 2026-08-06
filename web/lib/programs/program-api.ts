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

export interface ScheduleRule {
  rule_id: string;
  program_id: string;
  recurrence: "WEEKLY" | "MONTHLY";
  day_of_week: number | null;
  month_day: number | null;
  start_time: string;
  end_time: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduleException {
  exception_id: string;
  rule_id: string;
  override_date: string;
  action: "CANCEL" | "RESCHEDULE";
  new_start_time: string | null;
  new_end_time: string | null;
  created_at: string;
}

export interface ProgramEvent {
  event_id: string;
  program_id: string;
  starts_at: string;
  ends_at: string;
  status: "Active" | "Cancelled";
  source: "SCHEDULE" | "MANUAL";
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnrollmentRequest {
  request_id: string;
  program_id: string;
  member_user_id: string;
  status: "Pending" | "Approved" | "Rejected" | "Withdrawn";
  submitted_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  request_version: number;
}

export interface Enrollment {
  enrollment_id: string;
  program_id: string;
  member_user_id: string;
  request_id: string | null;
  status: "Active" | "Cancelled";
  enrolled_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  created_by: string | null;
  created_at: string;
}

export type EnrollmentDecision = "Approved" | "Rejected";

export interface ProgramLeader {
  program_id: string;
  user_id: string;
  granted_by: string;
  granted_at: string;
  revoked_by: string | null;
  revoked_at: string | null;
}

export interface GenerateResult {
  created: number;
  skipped: number;
  rule_count: number;
}

export interface ScheduleRuleInput {
  recurrence: ScheduleRule["recurrence"];
  day_of_week?: number;
  month_day?: number;
  start_time: string;
  end_time: string;
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
  method: "POST" | "GET" | "PATCH" | "DELETE",
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

/** POST /api/v1/programs/:programId/enrollment-requests */
export function submitEnrollmentRequest(
  programId: string
): Promise<{ request: EnrollmentRequest }> {
  return programsFetch(
    `/api/v1/programs/${programId}/enrollment-requests`,
    "POST",
    {}
  );
}

/** GET /api/v1/programs/:programId/enrollment-requests */
export function listEnrollmentRequests(
  programId: string
): Promise<{ requests: EnrollmentRequest[] }> {
  return programsFetch(
    `/api/v1/programs/${programId}/enrollment-requests`,
    "GET"
  );
}

/** POST /api/v1/programs/:programId/enrollment-requests/:requestId/decision */
export function decideEnrollmentRequest(
  programId: string,
  requestId: string,
  action: EnrollmentDecision,
  note?: string
): Promise<{ request: EnrollmentRequest }> {
  return programsFetch(
    `/api/v1/programs/${programId}/enrollment-requests/${requestId}/decision`,
    "POST",
    { action, note: note?.trim() ? note.trim() : null }
  );
}

/** POST /api/v1/programs/:programId/enrollment-requests/:requestId/withdraw */
export function withdrawEnrollmentRequest(
  programId: string,
  requestId: string
): Promise<{ request: EnrollmentRequest }> {
  return programsFetch(
    `/api/v1/programs/${programId}/enrollment-requests/${requestId}/withdraw`,
    "POST",
    {}
  );
}

/** POST /api/v1/programs/:programId/enrollments (assisted, ManagerOnly) */
export function assistedEnroll(
  programId: string,
  memberUserId: string
): Promise<{ enrollment: Enrollment }> {
  return programsFetch(`/api/v1/programs/${programId}/enrollments`, "POST", {
    member_user_id: memberUserId,
  });
}

/** GET /api/v1/programs/:programId/enrollments */
export function listEnrollments(
  programId: string
): Promise<{ enrollments: Enrollment[] }> {
  return programsFetch(`/api/v1/programs/${programId}/enrollments`, "GET");
}

/** POST /api/v1/programs/:programId/enrollments/:enrollmentId/cancel */
export function cancelEnrollment(
  programId: string,
  enrollmentId: string
): Promise<{ enrollment: Enrollment }> {
  return programsFetch(
    `/api/v1/programs/${programId}/enrollments/${enrollmentId}/cancel`,
    "POST",
    {}
  );
}

/** GET /api/v1/programs/:programId/leaders */
export function listProgramLeaders(
  programId: string
): Promise<{ leaders: ProgramLeader[] }> {
  return programsFetch(`/api/v1/programs/${programId}/leaders`, "GET");
}

/** POST /api/v1/programs/:programId/leaders */
export function assignProgramLeader(
  programId: string,
  userId: string
): Promise<{ leader: ProgramLeader }> {
  return programsFetch(`/api/v1/programs/${programId}/leaders`, "POST", {
    user_id: userId,
  });
}

/** POST /api/v1/programs/:programId/leaders/:userId/revoke */
export function revokeProgramLeader(
  programId: string,
  userId: string
): Promise<{ leader: ProgramLeader }> {
  return programsFetch(
    `/api/v1/programs/${programId}/leaders/${userId}/revoke`,
    "POST",
    {}
  );
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

/** GET /api/v1/programs/:id/schedule-rules */
export function listScheduleRules(
  programId: string
): Promise<{ rules: ScheduleRule[] }> {
  return programsFetch(
    `/api/v1/programs/${encodeURIComponent(programId)}/schedule-rules`,
    "GET"
  );
}

/** POST /api/v1/programs/:id/schedule-rules */
export function createScheduleRule(
  programId: string,
  input: ScheduleRuleInput
): Promise<{ rule: ScheduleRule }> {
  return programsFetch(
    `/api/v1/programs/${encodeURIComponent(programId)}/schedule-rules`,
    "POST",
    input
  );
}

/** PATCH /api/v1/programs/:id/schedule-rules/:ruleId */
export function updateScheduleRule(
  programId: string,
  ruleId: string,
  patch: Partial<ScheduleRuleInput>
): Promise<{ rule: ScheduleRule }> {
  return programsFetch(
    `/api/v1/programs/${encodeURIComponent(programId)}/schedule-rules/${encodeURIComponent(ruleId)}`,
    "PATCH",
    patch
  );
}

/** POST /api/v1/programs/:id/schedule-rules/:ruleId/exceptions */
export function createScheduleException(
  programId: string,
  ruleId: string,
  input: {
    override_date: string;
    action: "CANCEL" | "RESCHEDULE";
    new_start_time?: string;
    new_end_time?: string;
  }
): Promise<{ exception: ScheduleException }> {
  return programsFetch(
    `/api/v1/programs/${encodeURIComponent(programId)}/schedule-rules/${encodeURIComponent(ruleId)}/exceptions`,
    "POST",
    input
  );
}

/** DELETE /api/v1/programs/:id/schedule-rules/:ruleId/exceptions/:exceptionId */
export function deleteScheduleException(
  programId: string,
  ruleId: string,
  exceptionId: string
): Promise<{ deleted: boolean }> {
  return programsFetch(
    `/api/v1/programs/${encodeURIComponent(programId)}/schedule-rules/${encodeURIComponent(ruleId)}/exceptions/${encodeURIComponent(exceptionId)}`,
    "DELETE"
  );
}

/** POST /api/v1/programs/:id/events/generate */
export function generateEvents(
  programId: string,
  horizonDays?: number
): Promise<{ generated: GenerateResult }> {
  return programsFetch(
    `/api/v1/programs/${encodeURIComponent(programId)}/events/generate`,
    "POST",
    horizonDays === undefined ? {} : { horizon_days: horizonDays }
  );
}

/** POST /api/v1/programs/:id/events */
export function createEvent(
  programId: string,
  input: { starts_at: string; ends_at: string }
): Promise<{ event: ProgramEvent }> {
  return programsFetch(
    `/api/v1/programs/${encodeURIComponent(programId)}/events`,
    "POST",
    input
  );
}

/** GET /api/v1/programs/:id/events */
export function listEvents(
  programId: string
): Promise<{ events: ProgramEvent[] }> {
  return programsFetch(
    `/api/v1/programs/${encodeURIComponent(programId)}/events`,
    "GET"
  );
}

/** PATCH /api/v1/programs/:id/events/:eventId — soft cancel */
export function cancelEvent(
  programId: string,
  eventId: string,
  reason: string
): Promise<{ event: ProgramEvent }> {
  return programsFetch(
    `/api/v1/programs/${encodeURIComponent(programId)}/events/${encodeURIComponent(eventId)}`,
    "PATCH",
    { reason }
  );
}
