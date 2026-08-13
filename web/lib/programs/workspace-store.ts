/**
 * EFCC Programs domain — persistence seam (WorkspaceStore).
 *
 * The D1 adapter is used in production; tests may use an in-memory or test-D1
 * adapter. The new domain has no Sheet adapter and no dual-write path.
 */

import type { ModuleKey } from "./capabilities";
// Domain vocabulary lives in the pure recurrence module; rows and commands
// reuse it so there is one definition (no drift risk).
import type { RecurrenceKind, ScheduleExceptionAction } from "./recurrence";

export interface DepartmentInput {
  code: string;
  name: string;
  description?: string;
  lifecycle: DepartmentLifecycle;
  display_order?: number;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

export interface DepartmentUpdate {
  name?: string;
  description?: string;
  lifecycle?: DepartmentLifecycle;
  display_order?: number;
  updated_by: string;
  updated_at: string;
}

export type DepartmentLifecycle =
  | "Draft"
  | "PendingDevelopment"
  | "Active"
  | "Archived";

export interface DepartmentRow {
  department_id: string;
  code: string;
  name: string;
  description: string | null;
  lifecycle: DepartmentLifecycle;
  display_order: number;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

export interface ProgramInput {
  department_id: string;
  name: string;
  description?: string;
  category?: string;
  behavior_type: ProgramBehaviorType;
  lifecycle: ProgramLifecycle;
  discoverability: ProgramDiscoverability;
  enrollment_mode: ProgramEnrollmentMode;
  display_order?: number;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

export interface ProgramUpdate {
  name?: string;
  description?: string | null;
  category?: string | null;
  behavior_type?: ProgramBehaviorType;
  lifecycle?: ProgramLifecycle;
  discoverability?: ProgramDiscoverability;
  enrollment_mode?: ProgramEnrollmentMode;
  display_order?: number;
  check_in_opens_at_minutes_before_start?: number;
  check_in_closes_at_minutes_after_end?: number;
  updated_by: string;
  updated_at: string;
}

export type ProgramBehaviorType = "Recurring" | "OneOff";
export type ProgramLifecycle = "Draft" | "Active" | "Archived";
export type ProgramDiscoverability = "Listed" | "Unlisted";
export type ProgramEnrollmentMode = "MemberRequest" | "ManagerOnly";

export interface ProgramRow {
  program_id: string;
  department_id: string;
  name: string;
  description: string | null;
  category: string | null;
  behavior_type: ProgramBehaviorType;
  lifecycle: ProgramLifecycle;
  discoverability: ProgramDiscoverability;
  enrollment_mode: ProgramEnrollmentMode;
  display_order: number;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  check_in_token: string | null;
  check_in_opens_at_minutes_before_start: number;
  check_in_closes_at_minutes_after_end: number;
}

/** Minimal server-side identity used for capability projection only. */
export interface ProgramAccessRow {
  program_id: string;
  department_id: string;
}

export interface DepartmentModuleRow {
  department_id: string;
  module_key: ModuleKey;
  enabled: number;
  enabled_by: string | null;
  enabled_at: string;
}

export interface MemberOptionRow {
  user_id: string;
  name: string;
  username: string;
}

export type EventStatus = "Active" | "Cancelled";
export type EventAvailability = "Active" | "Inactive";
export type EventSource = "SCHEDULE" | "MANUAL";

export interface ScheduleRuleInput {
  program_id: string;
  recurrence: RecurrenceKind;
  day_of_week: number | null;
  month_day: number | null;
  start_time: string;
  end_time: string;
  location?: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

export interface ScheduleRuleUpdate {
  recurrence?: RecurrenceKind;
  day_of_week?: number | null;
  month_day?: number | null;
  start_time?: string;
  end_time?: string;
  location?: string | null;
  updated_by: string;
  updated_at: string;
}

export interface ScheduleRuleRow {
  rule_id: string;
  program_id: string;
  recurrence: RecurrenceKind;
  day_of_week: number | null;
  month_day: number | null;
  start_time: string;
  end_time: string;
  location: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

export interface ScheduleExceptionInput {
  rule_id: string;
  override_date: string;
  action: ScheduleExceptionAction;
  new_start_time: string | null;
  new_end_time: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ScheduleExceptionRow {
  exception_id: string;
  rule_id: string;
  override_date: string;
  action: ScheduleExceptionAction;
  new_start_time: string | null;
  new_end_time: string | null;
  created_by: string | null;
  created_at: string;
}
export interface EventInput {
  program_id: string;
  starts_at: string;
  ends_at: string;
  status: EventStatus;
  availability: EventAvailability;
  source: EventSource;
  name: string | null;
  location: string | null;
  check_in_window_opens_at?: string | null;
  check_in_window_closes_at?: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

export interface EventRow {
  event_id: string;
  program_id: string;
  starts_at: string;
  ends_at: string;
  status: EventStatus;
  availability: EventAvailability;
  source: EventSource;
  name: string | null;
  location: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  /** Matching schedule exception (attributed rule + HK wall date), if any. */
  exception?: ScheduleExceptionRow | null;
  manual_check_in_code: string | null;
  check_in_window_opens_at: string | null;
  check_in_window_closes_at: string | null;
}

/** Bounded operator-facing Event state rows for the Management attention seam. */
export interface ManagementAttentionEventRow {
  event_id: string;
  program_id: string;
  starts_at: string;
  status: EventStatus;
  availability: EventAvailability;
  name: string | null;
}

/** Current source rows used to project per-user management notifications. */
export interface ManagementNotificationEventRow {
  event_id: string;
  program_id: string;
  starts_at: string;
  status: EventStatus;
  availability: EventAvailability;
  name: string | null;
  updated_at: string;
}

export interface ManagementNotificationEnrollmentRow {
  program_id: string;
  count: number;
  latest_submitted_at: string;
}

export interface NotificationReadStateInput {
  source_key: string;
  source_revision: string;
}

export interface NotificationReadStateRow extends NotificationReadStateInput {
  read_at: string;
}

export interface GenerateResult {
  run_id: string;
  plan_id: string;
  status: GenerationRunStatus;
  created: number;
  skipped: number;
  failed: number;
  resumed: boolean;
}

// ---------------------------------------------------------------------------
// EVT-02 (#252): preview plans and generation runs.
// ---------------------------------------------------------------------------

export interface PreviewPlanRow {
  plan_id: string;
  program_id: string;
  plan_hash: string;
  horizon_days: number;
  from_date: string;
  rule_count: number;
  created_by: string | null;
  created_at: string;
}

export type PreviewSkipReason = "CANCEL" | "DUPLICATE";

export interface PreviewOccurrenceRow {
  occurrence_id: string;
  plan_id: string;
  rule_id: string;
  occurs_on: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  skip_reason: PreviewSkipReason | null;
  exception_id: string | null;
}

export type GenerationRunStatus = "completed" | "partial" | "failed";
export type GenerationRunItemOutcome = "created" | "skipped" | "failed";

export interface GenerationRunRow {
  run_id: string;
  program_id: string;
  plan_id: string;
  status: GenerationRunStatus;
  created: number;
  skipped: number;
  failed: number;
  started_at: string;
  finished_at: string | null;
  created_by: string | null;
  correlation_id: string | null;
}

export interface GenerationRunItemRow {
  item_id: string;
  run_id: string;
  occurrence_id: string;
  starts_at: string;
  outcome: GenerationRunItemOutcome;
  event_id: string | null;
  detail: string | null;
}

export interface GenerationRunItemInput {
  item_id: string;
  run_id: string;
  occurrence_id: string;
  starts_at: string;
  outcome: GenerationRunItemOutcome;
  event_id: string | null;
  detail: string | null;
}

export type EnrollmentRequestStatus =
  | "Pending"
  | "Approved"
  | "Rejected"
  | "Withdrawn";
export type EnrollmentStatus = "Active" | "Cancelled";

export interface EnrollmentRequestRow {
  request_id: string;
  program_id: string;
  member_user_id: string;
  status: EnrollmentRequestStatus;
  submitted_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  request_version: number;
  member_name?: string;
  member_username?: string;
}

export interface EnrollmentRow {
  enrollment_id: string;
  program_id: string;
  member_user_id: string;
  request_id: string | null;
  status: EnrollmentStatus;
  enrolled_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  created_by: string | null;
  created_at: string;
  member_name?: string;
  member_username?: string;
}

export interface EnrollmentRequestInput {
  request_id: string;
  program_id: string;
  member_user_id: string;
  status: "Pending";
  submitted_at: string;
  request_version: number;
}

export interface EnrollmentInput {
  enrollment_id: string;
  program_id: string;
  member_user_id: string;
  request_id: string | null;
  status: "Active";
  enrolled_at: string;
  created_by: string | null;
  created_at: string;
}

export interface ProgramLeaderRow {
  program_id: string;
  user_id: string;
  granted_by: string;
  granted_at: string;
  revoked_by: string | null;
  revoked_at: string | null;
  user_name?: string;
  username?: string;
}

export interface ProgramLeaderGrantInput {
  program_id: string;
  user_id: string;
  granted_by: string;
  granted_at: string;
}

export interface ProgramLeaderRevokeInput {
  program_id: string;
  user_id: string;
  revoked_by: string;
  revoked_at: string;
}
export interface DepartmentManagerRow {
  department_id: string;
  user_id: string;
  granted_by: string;
  granted_at: string;
  revoked_by: string | null;
  revoked_at: string | null;
  user_name?: string;
  username?: string;
}

export interface DepartmentManagerGrantInput {
  department_id: string;
  user_id: string;
  granted_by: string;
  granted_at: string;
}

export interface DepartmentManagerRevokeInput {
  department_id: string;
  user_id: string;
  revoked_by: string;
  revoked_at: string;
}

export interface AuditInput {
  audit_id: string;
  inserted_at: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  old_value_json: string | null;
  new_value_json: string | null;
  reason: string | null;
  outcome: AuditOutcome;
  correlation_id: string | null;
}

export type AuditOutcome =
  | "SUCCESS"
  | "DUPLICATE"
  | "CONFLICT"
  | "DENIED"
  | "FAILED";

export interface WorkspaceStore {
  createDepartment: (input: DepartmentInput) => Promise<DepartmentRow>;
  listDepartments: () => Promise<DepartmentRow[]>;
  findDepartmentById: (id: string) => Promise<DepartmentRow | null>;
  findDepartmentByCode: (code: string) => Promise<DepartmentRow | null>;
  updateDepartment: (
    id: string,
    update: DepartmentUpdate
  ) => Promise<DepartmentRow>;

  createProgram: (input: ProgramInput) => Promise<ProgramRow>;
  listProgramsForDepartment: (departmentId: string) => Promise<ProgramRow[]>;
  findProgramById: (id: string) => Promise<ProgramRow | null>;
  listProgramAccessRows: (departmentId: string) => Promise<ProgramAccessRow[]>;
  updateProgram: (id: string, update: ProgramUpdate) => Promise<ProgramRow>;
  archiveProgramIfClear: (
    id: string,
    update: ProgramUpdate,
    now: string
  ) => Promise<ProgramRow | null>;
  searchActiveMembers: (
    query: string,
    limit: number,
    programId?: string
  ) => Promise<MemberOptionRow[]>;

  setDepartmentModule: (
    departmentId: string,
    moduleKey: ModuleKey,
    enabled: boolean,
    enabledBy: string | null,
    enabledAt: string
  ) => Promise<DepartmentModuleRow>;
  listDepartmentModules: (
    departmentId: string
  ) => Promise<DepartmentModuleRow[]>;

  createScheduleRule: (input: ScheduleRuleInput) => Promise<ScheduleRuleRow>;
  updateScheduleRule: (
    ruleId: string,
    update: ScheduleRuleUpdate
  ) => Promise<ScheduleRuleRow>;
  listScheduleRules: (programId: string) => Promise<ScheduleRuleRow[]>;
  findScheduleRule: (ruleId: string) => Promise<ScheduleRuleRow | null>;

  createScheduleException: (
    input: ScheduleExceptionInput
  ) => Promise<ScheduleExceptionRow>;
  deleteScheduleException: (exceptionId: string) => Promise<boolean>;
  findScheduleException: (
    exceptionId: string
  ) => Promise<ScheduleExceptionRow | null>;
  listScheduleExceptions: (
    ruleIds: string[]
  ) => Promise<ScheduleExceptionRow[]>;

  createEvent: (input: EventInput) => Promise<EventRow>;
  insertGeneratedEvent: (input: EventInput) => Promise<boolean>;
  findEventByStart: (
    programId: string,
    startsAt: string
  ) => Promise<EventRow | null>;
  findEventById: (id: string) => Promise<EventRow | null>;
  listEvents: (programId: string) => Promise<EventRow[]>;
  countPendingEnrollmentRequests: (
    programIds: readonly string[]
  ) => Promise<Array<{ program_id: string; count: number }>>;
  countManagementEventAttention: (
    programIds: readonly string[],
    startsAtOrAfter: string
  ) => Promise<
    Array<{
      program_id: string;
      inactive_event_count: number;
      cancelled_event_count: number;
    }>
  >;
  listManagementEventAttention: (
    programIds: readonly string[],
    startsAtOrAfter: string,
    limit: number
  ) => Promise<ManagementAttentionEventRow[]>;
  listManagementNotificationEnrollments: (
    programIds: readonly string[]
  ) => Promise<ManagementNotificationEnrollmentRow[]>;
  listManagementNotificationEvents: (
    programIds: readonly string[],
    startsAtOrAfter: string
  ) => Promise<ManagementNotificationEventRow[]>;
  listNotificationReadStates: (
    userId: string,
    sourceKeys: readonly string[]
  ) => Promise<NotificationReadStateRow[]>;
  markNotificationReadStates: (
    userId: string,
    states: readonly NotificationReadStateInput[],
    readAt: string
  ) => Promise<number>;
  cancelEvent: (
    id: string,
    reason: string,
    updatedBy: string,
    updatedAt: string
  ) => Promise<EventRow | null>;
  updateEvent: (
    id: string,
    update: {
      starts_at?: string;
      ends_at?: string;
      name?: string | null;
      location?: string | null;
      check_in_window_opens_at?: string | null;
      check_in_window_closes_at?: string | null;
      availability?: EventAvailability;
    },
    updatedBy: string,
    updatedAt: string
  ) => Promise<EventRow | null>;
  getEventParticipantSummary: (
    eventId: string,
    programId: string
  ) => Promise<{
    active_enrollments: number;
    checked_in: number;
  }>;

  // --- EVT-02 (#252): preview plans and generation runs ---

  findPreviewPlan: (planId: string) => Promise<PreviewPlanRow | null>;
  findLatestPreviewPlan: (programId: string) => Promise<PreviewPlanRow | null>;
  listPreviewOccurrences: (
    planId: string
  ) => Promise<PreviewOccurrenceRow[]>;
  /** Persist a preview plan and its exact occurrence rows idempotently. */
  replacePreviewPlan: (
    plan: PreviewPlanRow,
    occurrences: PreviewOccurrenceRow[]
  ) => Promise<PreviewPlanRow>;
  findGenerationRunByPlan: (planId: string) => Promise<GenerationRunRow | null>;
  /** One durable run per plan; resolves the existing run on repeat. */
  createGenerationRun: (input: {
    run_id: string;
    program_id: string;
    plan_id: string;
    started_at: string;
    created_by: string | null;
    correlation_id: string | null;
  }) => Promise<{ run: GenerationRunRow; created: boolean }>;
  listGenerationRunItems: (runId: string) => Promise<GenerationRunItemRow[]>;
  /** Record one attempt durably; false when the row already exists. */
  recordGenerationRunItem: (
    input: GenerationRunItemInput
  ) => Promise<boolean>;
  /** Atomic settle: recompute counts/status from the item rows, CAS first-finisher-wins. */
  finishGenerationRun: (
    runId: string,
    finishedAt: string
  ) => Promise<GenerationRunRow>;

  createEnrollmentRequest: (
    input: EnrollmentRequestInput
  ) => Promise<EnrollmentRequestRow>;
  findEnrollmentRequestById: (
    id: string
  ) => Promise<EnrollmentRequestRow | null>;
  findPendingRequestByMember: (
    programId: string,
    memberUserId: string
  ) => Promise<EnrollmentRequestRow | null>;
  listEnrollmentRequests: (
    programId: string
  ) => Promise<EnrollmentRequestRow[]>;
  listEnrollmentSnapshot: (programId: string) => Promise<{
    requests: EnrollmentRequestRow[];
    enrollments: EnrollmentRow[];
  }>;
  listParticipantEnrollmentSnapshot: (
    programId: string,
    memberUserId: string
  ) => Promise<{
    requests: EnrollmentRequestRow[];
    enrollments: EnrollmentRow[];
  }>;
  decideRequest: (
    id: string,
    decision: "Approved" | "Rejected",
    decidedBy: string,
    decidedAt: string,
    note: string | null,
    audit: AuditInput,
    expectedRequestVersion?: number
  ) => Promise<EnrollmentRequestRow | null>;
  approveEnrollmentRequest: (input: {
    request_id: string;
    program_id: string;
    member_user_id: string;
    enrollment_id: string;
    decided_by: string;
    decided_at: string;
    note: string | null;
    auditCreate: AuditInput;
    auditDecide: AuditInput;
    expected_request_version?: number;
  }) => Promise<{
    request: EnrollmentRequestRow;
    enrollment: EnrollmentRow;
  } | null>;
  withdrawRequest: (
    id: string,
    memberUserId: string,
    withdrawnAt: string
  ) => Promise<EnrollmentRequestRow | null>;

  createEnrollment: (input: EnrollmentInput) => Promise<EnrollmentRow>;
  hasActiveEnrollment: (
    programId: string,
    memberUserId: string
  ) => Promise<boolean>;
  findActiveEnrollment: (
    programId: string,
    memberUserId: string
  ) => Promise<EnrollmentRow | null>;
  findEnrollmentById: (id: string) => Promise<EnrollmentRow | null>;
  listEnrollments: (programId: string) => Promise<EnrollmentRow[]>;
  cancelEnrollment: (
    id: string,
    cancelledBy: string,
    cancelledAt: string
  ) => Promise<EnrollmentRow | null>;
  findDepartmentManager: (
    departmentId: string,
    userId: string
  ) => Promise<DepartmentManagerRow | null>;
  listDepartmentManagers: (
    departmentId: string
  ) => Promise<DepartmentManagerRow[]>;
  assignDepartmentManager: (
    input: DepartmentManagerGrantInput
  ) => Promise<DepartmentManagerRow>;
  revokeDepartmentManager: (
    input: DepartmentManagerRevokeInput
  ) => Promise<DepartmentManagerRow | null>;

  findProgramLeader: (
    programId: string,
    userId: string
  ) => Promise<ProgramLeaderRow | null>;
  isAccountActive: (userId: string) => Promise<boolean>;
  listProgramLeaders: (programId: string) => Promise<ProgramLeaderRow[]>;
  assignProgramLeader: (
    input: ProgramLeaderGrantInput
  ) => Promise<ProgramLeaderRow>;
  revokeProgramLeader: (
    input: ProgramLeaderRevokeInput
  ) => Promise<ProgramLeaderRow | null>;

  audit: (input: AuditInput) => Promise<void>;
}
