/**
 * EFCC Programs domain — browser client for `/api/v1/programs/*` (PRG-01
 * #197). Same transport contract as the auth surface: identity travels only
 * in the server-set httpOnly cookies, requests are same-origin, and every
 * success is `{ requestId, data }` with `X-Request-Id` on the wire. Errors
 * are RFC 9457 Problem Details surfaced as RpcError (shared with api.ts).
 */

import { RpcError } from "@/lib/api";
import type { ProblemDetails } from "@/lib/api";
import type {
  AttendanceEvent as AttendanceEventType,
  AttendanceEventSummary as AttendanceEventSummaryType,
  AttendanceMember as AttendanceMemberType,
  AttendanceResolveLatest as AttendanceResolveLatestType,
  AttendanceResolveResult as AttendanceResolveResultType,
  AttendanceRow as AttendanceRowType,
} from "@/lib/attendance";

import type { ManagementHubView } from "./hub-types";
import type { ProgramsManagementAccess } from "./programs-access";

// Management Hub directory (087-01 #310): the worker projection is the single
// source for group/row copy; the browser renders it verbatim. Wire types are
// shared via hub-types.ts (both tsconfig programs can include it).
export type {
  ManagementHubGroup,
  ManagementHubRow,
  ManagementHubView,
} from "./hub-types";

// Attendance contracts are owned by the Worker handler module (`@/lib/attendance.ts`).
// Re-export under the original names so the browser surface has one shared shape.
export type {
  AttendanceEvent,
  AttendanceEventSummary,
  AttendanceMember,
  AttendanceResolveLatest,
  AttendanceResolveResult,
  AttendanceRow,
} from "@/lib/attendance";

export interface Department {
  department_id: string;
  code: string;
  name: string;
  description: string | null;
  lifecycle: "Draft" | "PendingDevelopment" | "Active" | "Archived";
  display_order: number;
  created_at: string;
  updated_at: string;
  capabilities: {
    manage: boolean;
    publish: boolean;
    module_configure: boolean;
    manager_assign?: boolean;
  };
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
  check_in_token?: string | null;
  check_in_opens_at_minutes_before_start?: number;
  check_in_closes_at_minutes_after_end?: number;
  display_order: number;
  created_at: string;
  updated_at: string;
  capabilities: {
    manage: boolean;
    publish: boolean;
    enroll: boolean;
    leader_assign: boolean;
  };
}
export type ManagementProgram = Omit<
  Program,
  | "check_in_token"
  | "check_in_opens_at_minutes_before_start"
  | "check_in_closes_at_minutes_after_end"
>;
export type ManagementProgramSettings = ManagementProgram &
  Pick<
    Program,
    | "check_in_opens_at_minutes_before_start"
    | "check_in_closes_at_minutes_after_end"
  >;
/** Server-filtered and secret-redacted Programs management projection. */
export interface ManagementDirectory {
  departments: Department[];
  programs: ManagementProgram[];
}
export type AccountPermissionRoleKey = "admin" | "department-manager" | "staff";

export interface AccountPermissionAccount {
  userId: string;
  name: string;
  role: AccountPermissionRoleKey;
  departments: Array<{
    id: string;
    name: string;
  }>;
}

export interface AccountPermissionRole {
  key: AccountPermissionRoleKey;
  label: string;
  scope: string;
  assignmentState: "assigned" | "assignable";
}

export interface AccountPermissionsView {
  accounts: AccountPermissionAccount[];
  roles: AccountPermissionRole[];
}

export interface ManagementCockpitNextEvent {
  event_id: string;
  program_id: string;
  title: string | null;
  name: string | null;
  starts_at: string;
  ends_at: string;
  location: string | null;
  source: "SCHEDULE" | "MANUAL";
  is_recurring: boolean;
  checked_in_count: number;
  roster_count: number;
}

export interface ManagementCockpitView {
  program_id: string;
  next_event: ManagementCockpitNextEvent | null;
  active_event_count: number;
  pending_enrollment_count: number;
}

export interface ManagementAttentionProgram {
  program_id: string;
  department_id: string;
  pending_enrollment_count: number;
  inactive_event_count: number;
  cancelled_event_count: number;
  actionable_count: number;
}

export type ManagementAttentionItem =
  | {
      kind: "enrollment";
      actionable: true;
      count: number;
      program_id: string;
      program_name: string;
      department_id: string;
      department_name: string;
    }
  | {
      kind: "event";
      actionable: boolean;
      event_id: string;
      program_id: string;
      program_name: string;
      department_id: string;
      department_name: string;
      starts_at: string;
      status: "Active" | "Cancelled";
      availability: "Active" | "Inactive";
      name: string | null;
    };

export interface ManagementAttention {
  programs: ManagementAttentionProgram[];
  items: ManagementAttentionItem[];
  total_actionable_count: number;
  has_more: boolean;
}

export type ManagementNotificationItem =
  | {
      kind: "enrollment";
      source_key: string;
      source_revision: string;
      read: boolean;
      actionable: true;
      count: number;
      latest_submitted_at: string;
      program_id: string;
      program_name: string;
      department_id: string;
      department_name: string;
    }
  | {
      kind: "event";
      source_key: string;
      source_revision: string;
      read: boolean;
      actionable: boolean;
      event_id: string;
      program_id: string;
      program_name: string;
      department_id: string;
      department_name: string;
      starts_at: string;
      status: "Active" | "Cancelled";
      availability: "Active" | "Inactive";
      name: string | null;
      updated_at: string;
    };

export interface ManagementNotifications {
  items: ManagementNotificationItem[];
  unread_count: number;
  has_more: boolean;
}

export interface DepartmentDetail {
  department: Department;
  modules: DepartmentModule[];
}

/**
 * Narrow participant directory projection (PUI-02 / Issue #246): the same
 * wire contract as the Worker catalog endpoint. Check-in secrets, capability
 * booleans, and manager DTO breadth never reach the browser here.
 */
export interface ProgramSummary {
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

export interface DepartmentSummary {
  department_id: string;
  code: string;
  name: string;
  description: string | null;
  lifecycle: "Draft" | "PendingDevelopment" | "Active" | "Archived";
  display_order: number;
}

export type ParticipantCatalogViewerState =
  | "active"
  | "pending"
  | "eligible"
  | "managerOnly"
  | "withdrawn"
  | "cancelled"
  | "rejected"
  | "archived";

export interface ParticipantCatalogProgram extends ProgramSummary {
  viewerState: ParticipantCatalogViewerState;
  nextEventStartsAt: string | null;
  upcomingEventCount: number;
}

export interface ParticipantCatalogEntry {
  department: DepartmentSummary;
  programs: ParticipantCatalogProgram[];
}
export interface ParticipantScheduleRule {
  rule_id: string;
  recurrence: "WEEKLY" | "MONTHLY";
  day_of_week: number | null;
  month_day: number | null;
  start_time: string;
  end_time: string;
}

export interface ParticipantEventSummary {
  event_id: string;
  program_id: string;
  starts_at: string;
  ends_at: string;
  status: "Active";
  source: "SCHEDULE" | "MANUAL";
  /** Projected from the real event row; null when the meeting has no title. */
  name: string | null;
  /** Projected from the real event row; null when the meeting has no venue. */
  location: string | null;
}

export interface ParticipantEnrollmentRequest {
  request_id: string;
  status: "Pending" | "Approved" | "Rejected" | "Withdrawn";
  submitted_at: string;
  decided_at: string | null;
}

export interface ParticipantEnrollment {
  enrollment_id: string;
  status: "Active" | "Cancelled";
  enrolled_at: string;
  cancelled_at: string | null;
}

export interface ParticipantEnrollmentSnapshot {
  requests: ParticipantEnrollmentRequest[];
  enrollments: ParticipantEnrollment[];
}

export type ParticipantEnrollmentAccess =
  | "Eligible"
  | "Ineligible"
  | "Unavailable";

export interface ParticipantProgramDetail {
  program: ProgramSummary;
  department: DepartmentSummary;
  schedule_rules: ParticipantScheduleRule[];
  events: ParticipantEventSummary[];
  enrollment: ParticipantEnrollmentSnapshot | null;
  enrollment_access: ParticipantEnrollmentAccess;
}

export type { ProgramsManagementAccess } from "./programs-access";

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
  location: string | null;
  created_at: string;
  updated_at: string;
}

export type EventType = "崇拜" | "訓練" | "小組" | "排練" | "外展" | "其他";
export type RecurrenceTag = "無" | "每週" | "每月";

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
  /** Independent operational availability; absent only in legacy test fixtures. */
  availability?: "Active" | "Inactive";
  source: "SCHEDULE" | "MANUAL";
  name?: string | null;
  event_type?: EventType | null;
  location?: string | null;
  manual_check_in_code?: string | null;
  check_in_window_opens_at?: string | null;
  check_in_window_closes_at?: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  /** Matching schedule exception (attributed rule + HK wall date), if any. */
  exception?: ScheduleException | null;
  /** Derived recurrence tag (e.g. '每週' | '每月' | '無'). */
  recurrence_tag?: RecurrenceTag | null;
  /** Whether active check-in/attendance records exist for this event. */
  has_attendance?: boolean;
}
export interface EventDetail {
  event: ProgramEvent;
  leaders: ProgramLeader[];
  participant_summary: {
    active_enrollments: number;
    checked_in: number;
  };
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
  member_name?: string;
  member_username?: string;
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
  member_name?: string;
  member_username?: string;
}

export interface EnrollmentSnapshot {
  requests: EnrollmentRequest[];
  enrollments: Enrollment[];
}

export type EnrollmentDecision = "Approved" | "Rejected";
export interface ProgramLeader {
  program_id: string;
  user_id: string;
  granted_by: string;
  granted_at: string;
  revoked_by: string | null;
  revoked_at: string | null;
  user_name?: string;
  username?: string;
}
export interface DepartmentManager {
  department_id: string;
  user_id: string;
  granted_by: string;
  granted_at: string;
  revoked_by: string | null;
  revoked_at: string | null;
  user_name?: string;
  username?: string;
}

export interface MemberOption {
  user_id: string;
  name: string;
  username: string;
}
/** Server-scoped Member Directory result (Management Hub, Spec 087 US 13-15). */
export type MemberDirectoryRole = "Admin" | "Staff" | "Member";

export interface MemberDirectoryDepartment {
  id: string;
  name: string;
}

export interface MemberDirectoryMember {
  userId: string;
  name: string;
  phone: string | null;
  role: MemberDirectoryRole;
  status: "Active";
  departments: MemberDirectoryDepartment[];
}

export interface GenerateResult {
  run_id: string;
  plan_id: string;
  status: "completed" | "partial" | "failed";
  created: number;
  skipped: number;
  failed: number;
  /** True when the request resumed an already-started run (retry/concurrent). */
  resumed: boolean;
}

/** One materialized occurrence row of a server-owned preview plan. */
export interface PreviewOccurrence {
  occurrence_id: string;
  plan_id: string;
  rule_id: string;
  occurs_on: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  skip_reason: "CANCEL" | "DUPLICATE" | null;
  exception_id: string | null;
}

export interface PreviewPlan {
  plan_id: string;
  program_id: string;
  plan_hash: string;
  horizon_days: number;
  from_date: string;
  rule_count: number;
  created_at: string;
}

export interface PreviewResult {
  plan: PreviewPlan;
  occurrences: PreviewOccurrence[];
}

export interface ScheduleRuleInput {
  recurrence: ScheduleRule["recurrence"];
  day_of_week?: number;
  month_day?: number;
  start_time: string;
  end_time: string;
  location?: string | null;
}

export interface ProgramInput {
  name: string;
  description?: string;
  behavior_type: Program["behavior_type"];
  discoverability?: Program["discoverability"];
  lifecycle: Program["lifecycle"];
  enrollment_mode: Program["enrollment_mode"];
  category?: string;
  display_order?: number;
}

export type ProgramPatch = Omit<
  Partial<ProgramInput>,
  "description" | "category"
> & {
  description?: string | null;
  category?: string | null;
  check_in_opens_at_minutes_before_start?: number;
  check_in_closes_at_minutes_after_end?: number;
};

interface ProgramsSuccess<T> {
  requestId: string;
  data: T;
}

function idempotencyHeaders(
  method: "POST" | "GET" | "PATCH" | "DELETE",
  key: string | null | undefined
): Record<string, string> {
  if (method === "GET" || key === null) {
    return {};
  }
  return { "Idempotency-Key": key ?? crypto.randomUUID() };
}

/** One fetch to the cookie-only programs surface. Never builds auth headers. */
async function programsFetch<T>(
  path: string,
  method: "POST" | "GET" | "PATCH" | "DELETE",
  body?: unknown,
  options: {
    idempotencyKey?: string | null;
    cache?: "no-store";
  } = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...idempotencyHeaders(method, options.idempotencyKey),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(options.cache === undefined ? {} : { cache: options.cache }),
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

/** GET /api/v1/programs/:programId/enrollment-snapshot */
export function listEnrollmentSnapshot(
  programId: string
): Promise<EnrollmentSnapshot> {
  return programsFetch(
    `/api/v1/programs/${programId}/enrollment-snapshot`,
    "GET"
  );
}

/** POST /api/v1/programs/:programId/enrollment-requests/:requestId/decision */
export function decideEnrollmentRequest(
  programId: string,
  requestId: string,
  action: EnrollmentDecision,
  note?: string,
  requestVersion?: number
): Promise<{
  request: EnrollmentRequest;
  enrollment: Enrollment | null;
}> {
  return programsFetch(
    `/api/v1/programs/${programId}/enrollment-requests/${requestId}/decision`,
    "POST",
    {
      action,
      note: note?.trim() ? note.trim() : null,
      request_version: requestVersion ?? null,
    }
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
  return programsFetch(
    `/api/v1/programs/${programId}/leaders`,
    "POST",
    { user_id: userId },
    { idempotencyKey: null }
  );
}

/** POST /api/v1/programs/:programId/leaders/:userId/revoke */
export function revokeProgramLeader(
  programId: string,
  userId: string
): Promise<{ leader: ProgramLeader }> {
  return programsFetch(
    `/api/v1/programs/${programId}/leaders/${userId}/revoke`,
    "POST",
    {},
    { idempotencyKey: null }
  );
}

/** GET /api/v1/programs/departments */
export function listDepartments(): Promise<{
  departments: Department[];
}> {
  return programsFetch("/api/v1/programs/departments", "GET");
}
/** GET /api/v1/programs/management-directory — scoped, redacted manager rows. */
export function getManagementDirectory(): Promise<ManagementDirectory> {
  return programsFetch(
    "/api/v1/programs/management-directory",
    "GET",
    undefined,
    { cache: "no-store" }
  );
}

/** GET /api/v1/programs/attention — fresh, scoped operator attention state. */
export function getManagementAttention(
  limit = 5
): Promise<ManagementAttention> {
  const query = new URLSearchParams({ limit: String(limit) });
  return programsFetch(`/api/v1/programs/attention?${query}`, "GET");
}

/** GET /api/v1/programs/notifications — current scoped read-state overlay. */
export function getManagementNotifications(
  limit = 20
): Promise<ManagementNotifications> {
  const query = new URLSearchParams({ limit: String(limit) });
  return programsFetch(`/api/v1/programs/notifications?${query}`, "GET");
}

/** POST /api/v1/programs/notifications/read — idempotent read-state write. */
export function markManagementNotificationsRead(
  items: readonly {
    source_key: string;
    source_revision: string;
  }[]
): Promise<{ marked_count: number }> {
  return programsFetch("/api/v1/programs/notifications/read", "POST", {
    items,
  });
}

/** GET /api/v1/programs/access — capability-only entry projection. */
export function getManagementAccess(): Promise<ProgramsManagementAccess> {
  return programsFetch("/api/v1/programs/access", "GET");
}

/**
 * GET /api/v1/programs/hub — capability-filtered Management Hub directory.
 * `no-store`: a revoked scope must be reflected on the next load.
 */
export function getManagementHub(): Promise<ManagementHubView> {
  return programsFetch("/api/v1/programs/hub", "GET", undefined, {
    cache: "no-store",
  });
}

/**
 * GET /api/v1/programs/account-permissions — Admin/Staff-only Account
 * Permissions matrix (087-03 #320). `no-store`: role changes must be
 * reflected on the next load.
 */
export function getAccountPermissions(): Promise<AccountPermissionsView> {
  return programsFetch(
    "/api/v1/programs/account-permissions",
    "GET",
    undefined,
    {
      cache: "no-store",
    }
  );
}

/** GET /api/v1/programs/catalog — narrow participant directory projection. */
export function listParticipantCatalog(): Promise<{
  catalog: ParticipantCatalogEntry[];
}> {
  return programsFetch("/api/v1/programs/catalog", "GET");
}
/** GET /api/v1/programs/:id/participant-detail — narrow participant detail. */
export function getParticipantProgramDetail(
  programId: string
): Promise<ParticipantProgramDetail> {
  return programsFetch<{ detail: ParticipantProgramDetail }>(
    `/api/v1/programs/${encodeURIComponent(programId)}/participant-detail`,
    "GET"
  ).then(({ detail }) => detail);
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

/** GET /api/v1/programs/:id/management — reauthorized safe workspace read. */
export function getManagementProgram(programId: string): Promise<{
  program: ManagementProgramSettings;
  department: Department;
  modules: DepartmentModule[];
  cockpit: ManagementCockpitView;
}> {
  return programsFetch(
    `/api/v1/programs/${encodeURIComponent(programId)}/management`,
    "GET",
    undefined,
    { cache: "no-store" }
  );
}

/** GET /api/v1/programs/:id/cockpit — scoped management cockpit projection. */
export function getManagementCockpit(
  programId: string
): Promise<{ cockpit: ManagementCockpitView }> {
  return programsFetch(
    `/api/v1/programs/${encodeURIComponent(programId)}/cockpit`,
    "GET",
    undefined,
    { cache: "no-store" }
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
/** GET /api/v1/programs/departments/:id/managers */
export function listDepartmentManagers(departmentId: string): Promise<{
  managers: DepartmentManager[];
}> {
  return programsFetch(
    `/api/v1/programs/departments/${encodeURIComponent(departmentId)}/managers`,
    "GET"
  );
}

/** GET /api/v1/programs/departments/:id/member-options?q=... */
export function searchDepartmentMemberOptions(
  departmentId: string,
  query: string
): Promise<{ members: MemberOption[] }> {
  return programsFetch(
    `/api/v1/programs/departments/${encodeURIComponent(departmentId)}/member-options?q=${encodeURIComponent(query)}`,
    "GET"
  );
}

/** POST /api/v1/programs/departments/:id/managers */
export function assignDepartmentManager(
  departmentId: string,
  userId: string
): Promise<{ manager: DepartmentManager }> {
  return programsFetch(
    `/api/v1/programs/departments/${encodeURIComponent(departmentId)}/managers`,
    "POST",
    { user_id: userId },
    { idempotencyKey: null }
  );
}

/** POST /api/v1/programs/departments/:id/managers/:userId/revoke */
export function revokeDepartmentManager(
  departmentId: string,
  userId: string
): Promise<{ manager: DepartmentManager }> {
  return programsFetch(
    `/api/v1/programs/departments/${encodeURIComponent(departmentId)}/managers/${encodeURIComponent(userId)}/revoke`,
    "POST",
    {},
    { idempotencyKey: null }
  );
}

/** PATCH /api/v1/programs/:id */
export function updateProgram(
  programId: string,
  patch: ProgramPatch
): Promise<{ program: Program }> {
  return programsFetch(
    `/api/v1/programs/${encodeURIComponent(programId)}`,
    "PATCH",
    patch
  );
}

/** GET /api/v1/programs/:id/member-options?q=... */
export function searchMemberOptions(
  programId: string,
  query: string,
  options?: { excludeEnrolled?: boolean }
): Promise<{ members: MemberOption[] }> {
  const params = new URLSearchParams({ q: query });
  if (options?.excludeEnrolled) {
    params.set("excludeEnrolled", "true");
  }
  return programsFetch(
    `/api/v1/programs/${encodeURIComponent(programId)}/member-options?${params.toString()}`,
    "GET"
  );
}
/** GET /api/v1/programs/members?q=...&limit=... — server-scoped directory. */
export function searchManagementMembers(
  query: string,
  options?: { limit?: number }
): Promise<{ members: MemberDirectoryMember[] }> {
  const params = new URLSearchParams({ q: query });
  if (options?.limit !== undefined) {
    params.set("limit", String(options.limit));
  }
  return programsFetch(`/api/v1/programs/members?${params.toString()}`, "GET");
}

/** POST /api/v1/programs/departments/:id/modules/:key/(enable|disable) */
export function setDepartmentModule(
  departmentId: string,
  moduleKey: string,
  enabled: boolean
): Promise<{ module: DepartmentModule }> {
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

/** GET /api/v1/programs/:id/schedule-rules/:ruleId/exceptions */
export function listScheduleExceptions(
  programId: string,
  ruleId: string
): Promise<{ exceptions: ScheduleException[] }> {
  return programsFetch(
    `/api/v1/programs/${encodeURIComponent(programId)}/schedule-rules/${encodeURIComponent(ruleId)}/exceptions`,
    "GET"
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

/**
 * POST /api/v1/programs/:id/events/preview — server-owned preview plan.
 * Writes no events; identical inputs resolve to the same plan identity.
 */
export function previewEvents(
  programId: string,
  horizonDays: number
): Promise<PreviewResult> {
  return programsFetch(
    `/api/v1/programs/${encodeURIComponent(programId)}/events/preview`,
    "POST",
    { horizon_days: horizonDays }
  );
}

/** POST /api/v1/programs/:id/events/generate — generate from a current plan. */
export function generateEvents(
  programId: string,
  planId: string
): Promise<{ generated: GenerateResult }> {
  return programsFetch(
    `/api/v1/programs/${encodeURIComponent(programId)}/events/generate`,
    "POST",
    { plan_id: planId }
  );
}

/** POST /api/v1/programs/:id/events */
export function createEvent(
  programId: string,
  input: {
    starts_at: string;
    ends_at: string;
    name?: string | null;
    location?: string | null;
    check_in_window_opens_at?: string | null;
    check_in_window_closes_at?: string | null;
    event_type?: EventType | null;
  }
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

/** GET /api/v1/programs/:id/events/:eventId — operator detail projection. */
export function getEvent(
  programId: string,
  eventId: string
): Promise<EventDetail> {
  return programsFetch(
    `/api/v1/programs/${encodeURIComponent(programId)}/events/${encodeURIComponent(eventId)}`,
    "GET"
  );
}

/** PATCH /api/v1/programs/:id/events/:eventId — identity/schedule edit. */
export function updateEvent(
  programId: string,
  eventId: string,
  patch: {
    starts_at?: string;
    ends_at?: string;
    name?: string | null;
    event_type?: EventType | null;
    location?: string | null;
    check_in_window_opens_at?: string | null;
    check_in_window_closes_at?: string | null;
  }
): Promise<{ event: ProgramEvent }> {
  return programsFetch(
    `/api/v1/programs/${encodeURIComponent(programId)}/events/${encodeURIComponent(eventId)}`,
    "PATCH",
    patch
  );
}

/** PATCH /api/v1/programs/:id/events/:eventId — independent availability. */
export function setEventAvailability(
  programId: string,
  eventId: string,
  availability: "Active" | "Inactive",
  confirm = false
): Promise<{ event: ProgramEvent }> {
  return programsFetch(
    `/api/v1/programs/${encodeURIComponent(programId)}/events/${encodeURIComponent(eventId)}`,
    "PATCH",
    { availability, confirm }
  );
}

/** PATCH /api/v1/programs/:id/events/:eventId — soft cancel. */
export function cancelEvent(
  programId: string,
  eventId: string,
  reason?: string | null
): Promise<{ event: ProgramEvent }> {
  return programsFetch(
    `/api/v1/programs/${encodeURIComponent(programId)}/events/${encodeURIComponent(eventId)}`,
    "PATCH",
    { reason: reason ?? null }
  );
}

// --- Attendance client (Spec 081) ---

export interface AttendanceResult {
  outcome: "success" | "duplicate" | "already_voided" | "voided" | "corrected";
  /** Present on success/void/correction; deliberately ABSENT on duplicate
   *  (Spec #244 dec 14: duplicate responses must not echo the existing
   *  record's id — it would be an identity oracle for public guests). */
  attendance_id?: string;
}

/** GET /api/v1/attendance/resolve */
export function resolveAttendance(input: {
  program_token?: string;
  manual_code?: string;
  entry?: string;
}): Promise<AttendanceResolveResultType> {
  const search = new URLSearchParams();
  if (input.program_token) {
    search.set("program_token", input.program_token);
  }
  if (input.manual_code) {
    search.set("manual_code", input.manual_code);
  }
  if (input.entry) {
    search.set("entry", input.entry);
  }
  return programsFetch(`/api/v1/attendance/resolve?${search}`, "GET");
}

/** POST /api/v1/attendance/self */
export function selfCheckIn(input: {
  event_id: string;
  method: "self_qr_scan" | "self_manual_code";
  program_token?: string;
  manual_code?: string;
  entry?: string;
}): Promise<AttendanceResult> {
  return programsFetch("/api/v1/attendance/self", "POST", input);
}

/** POST /api/v1/attendance/guest */
export function guestCheckIn(input: {
  event_id: string;
  method: "guest_qr_scan" | "guest_manual_code";
  name: string;
  phone: string;
  program_token?: string;
  manual_code?: string;
  entry?: string;
}): Promise<AttendanceResult> {
  return programsFetch("/api/v1/attendance/guest", "POST", input);
}

/** GET /api/v1/attendance/events — legacy operator chooser */
export function listManageableEvents(): Promise<{
  events: AttendanceEventSummaryType[];
}> {
  return programsFetch("/api/v1/attendance/events", "GET");
}

/** GET /api/v1/attendance/scanner-events — eligible Assisted context */
export function listScannerEvents(): Promise<{
  events: AttendanceEventSummaryType[];
}> {
  return programsFetch("/api/v1/attendance/scanner-events", "GET");
}

/** GET /api/v1/attendance/events/:eventId/members */
export function searchAttendanceMembers(
  eventId: string,
  query: string
): Promise<{ members: AttendanceMemberType[] }> {
  return programsFetch(
    `/api/v1/attendance/events/${encodeURIComponent(eventId)}/members?q=${encodeURIComponent(query)}`,
    "GET"
  );
}

/** POST /api/v1/attendance/events/:eventId/check-in */
export function assistedCheckIn(
  eventId: string,
  member_user_id: string,
  method: "leader_qr_scan" | "leader_manual_search" = "leader_manual_search"
): Promise<AttendanceResult> {
  return programsFetch(
    `/api/v1/attendance/events/${encodeURIComponent(eventId)}/check-in`,
    "POST",
    { member_user_id, method }
  );
}

/** GET /api/v1/attendance/events/:eventId/roster */
export function listAttendanceRoster(
  eventId: string
): Promise<{ event: AttendanceEventType; attendances: AttendanceRowType[] }> {
  return programsFetch(
    `/api/v1/attendance/events/${encodeURIComponent(eventId)}/roster`,
    "GET"
  );
}

/** POST /api/v1/attendance/:attendanceId/void */
export function voidAttendance(
  attendanceId: string,
  reason: string
): Promise<AttendanceResult> {
  return programsFetch(
    `/api/v1/attendance/${encodeURIComponent(attendanceId)}/void`,
    "POST",
    { reason }
  );
}

/** PATCH /api/v1/attendance/:attendanceId/guest-correction */
export function correctGuestAttendance(
  attendanceId: string,
  input: { name: string; phone: string; reason: string }
): Promise<AttendanceResult> {
  return programsFetch(
    `/api/v1/attendance/${encodeURIComponent(attendanceId)}/guest-correction`,
    "PATCH",
    input
  );
}
