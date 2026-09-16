/**
 * EFCC Programs domain — DepartmentWorkspace domain module.
 *
 * Owns Department/Program/module lifecycle, scope checks, audit, and transaction
 * invariants. The Worker HTTP handlers and browser UI are thin adapters around
 * this module.
 */

import { COPY } from "../copy";
import {
  CAPABILITY,
  hasDepartmentManagementScope,
  MODULE_KEY,
  MODULE_KEYS,
} from "./capabilities";
import type {
  Capability,
  DepartmentCapabilities,
  ModuleKey,
} from "./capabilities";
import { AuthorizationDeniedError } from "./capability-authorizer";
import type {
  AuthorizationContext,
  CapabilityAuthorizer,
} from "./capability-authorizer";
import { WorkspaceNotFoundError } from "./d1-workspace-store";
import {
  beginNextEnrollmentApprovalItem,
  cancelEnrollmentApprovalRun,
  createEnrollmentApprovalRun,
  reconcileEnrollmentApprovalRun,
  settleEnrollmentApprovalItem,
} from "./enrollment-approval-run";
import type {
  ApprovalRunFailure,
  EnrollmentApprovalRun,
  EnrollmentApprovalRunAuthority,
  EnrollmentApprovalRunItem,
  EnrollmentApprovalRunRow,
} from "./enrollment-approval-run";
import type {
  ManagementHubGroup,
  ManagementHubRow,
  ManagementHubView,
} from "./hub-types";
import { parseIsoInstant } from "./iso-instant";
import type { ProgramEvent } from "./program-api";
import {
  DuplicateDepartmentCodeError,
  DuplicateEnrollmentError,
  DuplicateEventError,
  DuplicateProgramNameError,
  DuplicateScheduleExceptionError,
  EnrollmentAccountInactiveError,
  EnrollmentCancellationReasonRequiredError,
  EnrollmentDecisionConflictError,
  EmptyPreviewPlanError,
  EnrollmentNotAllowedError,
  EventCancellationBlockedError,
  EventAvailabilityConfirmationRequiredError,
  EventCancelledReadOnlyError,
  EventIdentityChangeReasonRequiredError,
  EventNameRequiredError,
  EventRescheduleBlockedError,
  EnrollmentApprovalRunValidationError,
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
  exceptionForEvent,
  recurrenceTagForEvent,
  hkTodayWallDate,
  wallDaySpan,
  previewOccurrencesForRule,
} from "./recurrence";
import type {
  PreviewOccurrenceCandidate,
  RecurrenceKind,
  ScheduleExceptionAction,
} from "./recurrence";
import type {
  AuditInput,
  AuditOutcome,
  DepartmentLifecycle,
  DepartmentRow,
  DepartmentUpdate,
  EnrollmentRequestRow,
  EnrollmentRow,
  EventAvailability,
  EventRow,
  EventType,
  GenerateResult,
  GenerationRunRow,
  GenerationRunItemRow,
  PreviewOccurrenceRow,
  PreviewPlanRow,
  ProgramBehaviorType,
  ProgramDiscoverability,
  ProgramEnrollmentMode,
  ProgramLifecycle,
  DepartmentModuleRow,
  MemberOptionRow,
  ProgramRow,
  ProgramTokenRotationInput,
  ProgramTokenRotationResult,
  ProgramIdentityAssignmentRow,
  ManagementAttentionEventRow,
  NotificationReadStateInput,
  ParticipantNoticeCreateInput,
  ParticipantNoticeKind,
  ParticipantNoticeRow,
  ProgramUpdate,
  AccountDirectorySearchFilters,
  AccountDirectorySummary,
  ScheduleExceptionRow,
  ScheduleRuleCreationResult,
  ScheduleRuleRow,
  WorkspaceStore,
} from "./workspace-store";

export type { EventAvailability } from "./workspace-store";

// Capability flags live in the pure vocabulary module; the domain module
// re-exports the type so the public surface of this file is unchanged.
export type { DepartmentCapabilities } from "./capabilities";

export interface ProgramCapabilities {
  manage: boolean;
  publish: boolean;
  enroll: boolean;
  leader_assign: boolean;
  /** Whether the caller may enter the scoped Account Access destination. */
  role_read?: boolean;
  role_assign?: boolean;
  role_revoke?: boolean;
}

export interface ProgramAttendanceArtifactView {
  program_id: string;
  program_name: string;
  check_in_token: string;
  can_rotate: boolean;
}

export interface ProgramTokenRotationView {
  program_id: string;
  check_in_token: string;
  idempotent: boolean;
}

export type DepartmentView = DepartmentRow & {
  capabilities: DepartmentCapabilities;
};

export type ProgramView = (ProgramRow | ProgramSummary) & {
  capabilities: ProgramCapabilities;
};
export type ManagementDepartmentView = Omit<
  DepartmentView,
  "created_by" | "updated_by"
>;
export type ManagementProgramView = ProgramSummary & {
  capabilities: ProgramCapabilities;
};
export type ManagementProgramSettingsView = ManagementProgramView & {
  check_in_opens_at_minutes_before_start?: number;
  check_in_closes_at_minutes_after_end?: number;
};
export type ManagementDepartmentModuleView = Omit<
  DepartmentModuleRow,
  "enabled_by"
>;

export interface ManagementDirectoryView {
  departments: ManagementDepartmentView[];
  programs: ManagementProgramView[];
}

export interface ManagementAttentionProgramView {
  program_id: string;
  department_id: string;
  pending_enrollment_count: number;
  inactive_event_count: number;
  cancelled_event_count: number;
  actionable_count: number;
}

interface ManagementAttentionItemBase {
  program_id: string;
  program_name: string;
  department_id: string;
  department_name: string;
}

export type ManagementAttentionItem =
  | (ManagementAttentionItemBase & {
      kind: "enrollment";
      actionable: true;
      count: number;
    })
  | (ManagementAttentionItemBase & {
      kind: "event";
      actionable: boolean;
      event_id: string;
      starts_at: string;
      status: "Active" | "Cancelled";
      availability: "Active" | "Inactive";
      name: string | null;
    });

export interface ManagementAttentionView {
  programs: ManagementAttentionProgramView[];
  items: ManagementAttentionItem[];
  total_actionable_count: number;
  has_more: boolean;
}

interface ManagementNotificationItemBase {
  source_key: string;
  source_revision: string;
  read: boolean;
  program_id: string;
  program_name: string;
  department_id: string;
  department_name: string;
}

export type ManagementNotificationItem =
  | (ManagementNotificationItemBase & {
      kind: "enrollment";
      actionable: true;
      count: number;
      latest_submitted_at: string;
    })
  | (ManagementNotificationItemBase & {
      kind: "event";
      actionable: boolean;
      event_id: string;
      starts_at: string;
      status: "Active" | "Cancelled";
      availability: "Active" | "Inactive";
      name: string | null;
      updated_at: string;
    });

export interface ManagementNotificationsView {
  items: ManagementNotificationItem[];
  unread_count: number;
  has_more: boolean;
}

// 085-07 (#324) — participant Notices. The wire shape omits the member's own
// user id (the API is strictly self-scoped); read_at/created_at are epoch
// milliseconds. Notices older than NOTICE_RETENTION_MS are never served.
export type { ParticipantNoticeKind } from "./workspace-store";

export interface ParticipantNoticeView {
  notice_id: string;
  kind: ParticipantNoticeKind;
  title: string;
  body: string;
  program_id: string | null;
  event_id: string | null;
  read_at: number | null;
  created_at: number;
}

export interface ParticipantNoticesView {
  notices: ParticipantNoticeView[];
  unread_count: number;
}

export interface CreateParticipantNoticeInput {
  member_user_id: string;
  kind: ParticipantNoticeKind;
  title: string;
  body: string;
  program_id?: string | null;
  event_id?: string | null;
  read_at?: number | null;
}

export const NOTICE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export const MANAGEMENT_ATTENTION_LIMIT = 5;
export const MANAGEMENT_NOTIFICATION_LIMIT = 20;
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
  /** Every currently open check-in Event, ordered for operator choice. */
  open_events: ManagementCockpitNextEvent[];
  active_event_count: number;
  pending_enrollment_count: number;
}

export interface ManagementProgramWorkspaceView {
  program: ManagementProgramSettingsView;
  department: ManagementDepartmentView;
  modules: ManagementDepartmentModuleView[];
  cockpit: ManagementCockpitView;
}
export interface EventDetailView {
  event: ProgramEvent;
  leaders: ProgramIdentityAssignmentRow[];
  participant_summary: {
    active_enrollments: number;
    checked_in: number;
  };
}

function hasProgramManagementScope(
  program: Pick<ManagementProgramView, "capabilities">
): boolean {
  return (
    program.capabilities.manage ||
    program.capabilities.publish ||
    program.capabilities.leader_assign
  );
}

export interface ManagementAccessView {
  hasManagementCapability: boolean;
  departmentScopes: number;
  programScopes: number;
}

/**
 * One Member Directory result (087-04 #321 / Spec 087 US 13-15): identity,
 * contact, role, and the departments of the member's Active enrollments
 * (restricted to the actor's managed departments for a Department Manager).
 */
export interface ManagementMemberIdentity {
  id: string;
  label: string;
  stableKey: string;
  scopeKind: "Global" | "Department" | "Program";
  scopeId: string | null;
}

export interface ManagementMemberView {
  userId: string;
  name: string;
  phone: string | null;
  identities: ManagementMemberIdentity[];
  status: string;
  departments: { id: string; name: string }[];
}

export interface AccountDirectoryMember extends ManagementMemberView {
  username: string | null;
  canOpenAccess: boolean;
}

export interface AccountDirectoryView {
  accounts: AccountDirectoryMember[];
  nextCursor: string | null;
  summary: AccountDirectorySummary;
}

// ---------------------------------------------------------------------------
// Management Hub directory (087-01 #310). Row/group copy comes from the
// centralized COPY.management block (web/lib/copy.ts) — the worker projects
// it verbatim and the browser renders the projection as-is; no client-side
// capability branching, no second copy of the strings. Wire types live in
// hub-types.ts (shared with the browser client).
// ---------------------------------------------------------------------------

// Re-export the shared wire types so the Worker surface has one public name.
export type {
  ManagementHubGroup,
  ManagementHubRow,
  ManagementHubView,
} from "./hub-types";

const HUB_COPY = COPY.management;

/** Fixed group order (spec 087 US 1); keys are stable UI anchors. */
export const MANAGEMENT_HUB_GROUPS: readonly ManagementHubGroup[] = [
  {
    key: "members-and-permissions",
    label: HUB_COPY.groupMemberPermissions,
    rows: [
      {
        key: "accounts",
        label: HUB_COPY.accountsRow,
        description: HUB_COPY.accountsRowHint,
        href: "/management?module=accounts",
      },
      {
        key: "approvals",
        label: HUB_COPY.approvalsRow,
        description: HUB_COPY.approvalsRowHint,
        href: "/management?module=approvals",
      },
      {
        key: "permissions",
        label: HUB_COPY.permissionsRow,
        description: HUB_COPY.permissionsRowHint,
        href: "/management?module=permissions",
      },
    ],
  },
  {
    key: "ministry-operations",
    label: HUB_COPY.groupOperations,
    rows: [
      {
        key: "departments",
        label: HUB_COPY.departmentsRow,
        description: HUB_COPY.departmentsRowHint,
        href: "/management?module=departments",
      },
      {
        key: "attendance",
        label: HUB_COPY.attendanceRow,
        description: HUB_COPY.attendanceRowHint,
        href: "/management?module=attendance",
      },
      {
        key: "members",
        label: HUB_COPY.membersRow,
        description: HUB_COPY.membersRowHint,
        href: "/management?module=members",
      },
    ],
  },
  {
    key: "content-and-system",
    label: HUB_COPY.groupContentSystem,
    rows: [
      {
        key: "home-content",
        label: HUB_COPY.homeContentRow,
        description: HUB_COPY.homeContentRowHint,
        href: "/management?module=home-content",
      },
    ],
  },
];

/** 另一個工作入口 card, rendered between 事工營運 and 內容與系統. */
export const MANAGEMENT_HUB_ENTRY_CARD: ManagementHubRow = {
  key: "course-management",
  label: HUB_COPY.goCourseManagement,
  description: HUB_COPY.goCourseManagementHint,
  href: "/programs?mode=management",
};

/**
 * Client-safe preview plan projection. Never carries the internal actor id
 * (created_by) or any other server-only column across the Worker boundary.
 */
export interface PreviewPlanView {
  plan_id: string;
  program_id: string;
  plan_hash: string;
  horizon_days: number;
  from_date: string;
  to_date: string;
  rule_count: number;
  created_at: string;
}

function previewPlanView(plan: PreviewPlanRow): PreviewPlanView {
  return {
    plan_id: plan.plan_id,
    program_id: plan.program_id,
    plan_hash: plan.plan_hash,
    horizon_days: plan.horizon_days,
    from_date: plan.from_date,
    to_date: plan.to_date ?? addWallDays(plan.from_date, plan.horizon_days - 1),
    rule_count: plan.rule_count,
    created_at: plan.created_at,
  };
}

/**
 * Narrow participant directory projection (PUI-02 / Issue #246). Deliberately
 * omits the manager-facing DTO breadth: check-in secrets, capability booleans,
 * and audit/operator columns. Lifecycle is surfaced as a status field; the
 * server never filters Draft/Archived silently.
 */
export interface ProgramSummary {
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
  created_at: string;
  updated_at: string;
}

export interface DepartmentSummary {
  department_id: string;
  code: string;
  name: string;
  description: string | null;
  lifecycle: DepartmentLifecycle;
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
  recurrence: RecurrenceKind;
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
  /** Server-derived participant affordance; never an attendance authority. */
  self_check_in_available: boolean;
}

export function participantSelfCheckInAvailable(
  event: Pick<
    EventRow,
    | "status"
    | "availability"
    | "check_in_window_opens_at"
    | "check_in_window_closes_at"
  >,
  program: Pick<ProgramView, "lifecycle" | "enrollment_mode" | "capabilities">,
  hasActiveEnrollment: boolean,
  now = Date.now()
): boolean {
  if (
    !hasActiveEnrollment ||
    program.capabilities.manage ||
    program.lifecycle === "Archived" ||
    program.enrollment_mode === "ManagerOnly" ||
    event.status !== "Active" ||
    event.availability !== "Active" ||
    event.check_in_window_opens_at === null ||
    event.check_in_window_closes_at === null
  ) {
    return false;
  }
  const opensAt = parseIsoInstant(event.check_in_window_opens_at);
  const closesAt = parseIsoInstant(event.check_in_window_closes_at);
  return (
    opensAt !== null && closesAt !== null && now >= opensAt && now <= closesAt
  );
}

export interface ParticipantEnrollmentRequest {
  request_id: string;
  status: EnrollmentRequestRow["status"];
  submitted_at: string;
  decided_at: string | null;
}

export interface ParticipantEnrollment {
  enrollment_id: string;
  status: EnrollmentRow["status"];
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

export interface CreateDepartmentCommand {
  code: string;
  name: string;
  description?: string;
  lifecycle?: DepartmentLifecycle;
  display_order?: number;
}

export interface CreateProgramCommand {
  department_id: string;
  name: string;
  description: string;
  category?: string;
  behavior_type: "Recurring" | "OneOff";
  lifecycle?: ProgramLifecycle;
  discoverability?: "Listed" | "Unlisted";
  enrollment_mode?: "MemberRequest" | "ManagerOnly";
  display_order?: number;
}

export interface SetModuleCommand {
  department_id: string;
  module_key: ModuleKey;
  enabled: boolean;
}

export interface CreateScheduleRuleCommand {
  recurrence: RecurrenceKind;
  day_of_week: number | null;
  month_day: number | null;
  start_time: string;
  end_time: string;
  location?: string | null;
  effective_start_date?: string | null;
  effective_end_date?: string | null;
}

export interface UpdateScheduleRuleCommand {
  recurrence?: RecurrenceKind;
  day_of_week?: number | null;
  month_day?: number | null;
  start_time?: string;
  end_time?: string;
  location?: string | null;
  effective_start_date?: string | null;
  effective_end_date?: string | null;
}

export interface CreateScheduleExceptionCommand {
  override_date: string;
  action: ScheduleExceptionAction;
  new_start_time: string | null;
  new_end_time: string | null;
  new_date?: string | null;
}

export interface CreateEventCommand {
  starts_at: string;
  ends_at: string;
  name: string | null;
  event_type?: EventType | null;
  location: string | null;
  check_in_window_opens_at: string | null;
  check_in_window_closes_at: string | null;
}

export interface UpdateEventCommand {
  starts_at?: string;
  ends_at?: string;
  name?: string | null;
  location?: string | null;
  event_type?: EventType | null;
  check_in_window_opens_at?: string | null;
  check_in_window_closes_at?: string | null;
  reason?: string | null;
}

export interface SetEventAvailabilityCommand {
  availability: EventAvailability;
  confirm: boolean;
}

export interface CancelEventCommand {
  reason?: string | null;
}

export interface DecideEnrollmentRequestCommand {
  action: "Approved" | "Rejected";
  note: string | null;
  expectedRequestVersion?: number;
}
export interface EnrollmentDecisionResult {
  request: EnrollmentRequestRow;
  enrollment: EnrollmentRow | null;
}

export interface EnrollmentApprovalRunActionResult {
  run: EnrollmentApprovalRun;
  item: EnrollmentApprovalRunItem | null;
}

export interface AssistedEnrollCommand {
  memberUserId: string;
}

function isPendingEnrollmentConstraint(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("enrollment_requests.program_id") &&
    message.includes("enrollment_requests.member_user_id")
  );
}

function approvalRunView(row: EnrollmentApprovalRunRow): EnrollmentApprovalRun {
  return {
    run_id: row.run_id,
    program_id: row.program_id,
    status: row.status,
    created_at: row.created_at,
    finished_at: row.finished_at,
    cancelled_at: row.cancelled_at,
    items: row.items,
  };
}

function approvalRunFailure(error: unknown): ApprovalRunFailure {
  if (error instanceof StaleEnrollmentRequestError) {
    return {
      code: "STALE_REQUEST_VERSION",
      detail: "報名申請版本已更新，請重新整理後重新選取。",
      retryable: false,
    };
  }
  if (error instanceof EnrollmentDecisionConflictError) {
    return {
      code: "REQUEST_ALREADY_HANDLED",
      detail: "報名申請已由其他結果處理，未重複核准。",
      retryable: false,
    };
  }
  if (error instanceof RequestNotDecidableError) {
    return {
      code: "REQUEST_ALREADY_HANDLED",
      detail: "報名申請已不在可核准狀態，未重複核准。",
      retryable: false,
    };
  }
  if (error instanceof DuplicateEnrollmentError) {
    return {
      code: "ENROLLMENT_DUPLICATE",
      detail: "成員已有有效報名，未重複建立 Enrollment。",
      retryable: false,
    };
  }
  if (error instanceof EnrollmentAccountInactiveError) {
    return {
      code: "ENROLLMENT_ACCOUNT_INACTIVE",
      detail: "成員帳戶目前未能建立 Enrollment。",
      retryable: false,
    };
  }
  if (error instanceof EnrollmentNotAllowedError) {
    return {
      code: "ENROLLMENT_NOT_ALLOWED",
      detail: "此 Program 目前不接受這類 Enrollment。",
      retryable: false,
    };
  }
  if (error instanceof AuthorizationDeniedError) {
    return {
      code: "FORBIDDEN",
      detail: "你目前沒有權限完成此 Enrollment approval。",
      retryable: false,
    };
  }
  return {
    code: "OUTCOME_UNKNOWN",
    detail: "核准結果未能確認，請先重新整理並由系統核對後再繼續。",
    retryable: false,
  };
}

export class DepartmentWorkspace {
  readonly store: WorkspaceStore;
  readonly authorizer: CapabilityAuthorizer;

  constructor(store: WorkspaceStore, authorizer: CapabilityAuthorizer) {
    this.store = store;
    this.authorizer = authorizer;
  }

  private async canOpenAccountAccess(
    ctx: AuthorizationContext
  ): Promise<boolean> {
    // An empty scope asks the normalized resolver whether the actor has this
    // assignment capability in any declared scope; Account Access applies
    // target eligibility and assignment-scope filtering afterward.
    const [canAssign, canRevoke] = await Promise.all([
      this.authorizer.can(ctx, CAPABILITY.ROLE_ASSIGN, {}),
      this.authorizer.can(ctx, CAPABILITY.ROLE_REVOKE, {}),
    ]);
    return canAssign || canRevoke;
  }

  private async ensure(
    ctx: AuthorizationContext,
    capability: Capability,
    scope: { departmentId?: string; programId?: string } | null = null
  ): Promise<void> {
    if (!(await this.authorizer.can(ctx, capability, scope))) {
      throw new AuthorizationDeniedError(capability);
    }
  }

  private async hasParticipantProgramHistory(
    ctx: AuthorizationContext,
    programId: string
  ): Promise<boolean> {
    const snapshot = await this.store.listParticipantEnrollmentSnapshot(
      programId,
      ctx.actorUserId
    );
    return snapshot.requests.length > 0 || snapshot.enrollments.length > 0;
  }

  private async canViewParticipantProgram(
    ctx: AuthorizationContext,
    row: ProgramRow,
    capabilities: ProgramCapabilities
  ): Promise<boolean> {
    if (capabilities.manage) {
      return true;
    }
    if (row.lifecycle === "Active" && row.discoverability === "Listed") {
      return true;
    }
    // Unlisted Active Programs, and Draft/Archived Programs, are reachable
    // only through an existing participant relationship/history. A directory
    // row must never become an implicit direct-context authorization.
    return this.hasParticipantProgramHistory(ctx, row.program_id);
  }

  private buildAuditRow(
    ctx: AuthorizationContext,
    action: string,
    entityType: string,
    entityId: string,
    outcome: AuditOutcome,
    oldValue: unknown,
    newValue: unknown,
    correlationId: string | null,
    reason: string | null = null
  ): AuditInput {
    return {
      audit_id: crypto.randomUUID(),
      inserted_at: new Date().toISOString(),
      actor_user_id: ctx.actorUserId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      old_value_json: oldValue ? JSON.stringify(oldValue) : null,
      new_value_json: newValue ? JSON.stringify(newValue) : null,
      reason,
      outcome,
      correlation_id: correlationId,
    };
  }

  private async audit(
    ctx: AuthorizationContext,
    action: string,
    entityType: string,
    entityId: string,
    outcome: AuditOutcome,
    oldValue: unknown,
    newValue: unknown,
    correlationId: string | null,
    reason: string | null = null
  ): Promise<void> {
    await this.store.audit(
      this.buildAuditRow(
        ctx,
        action,
        entityType,
        entityId,
        outcome,
        oldValue,
        newValue,
        correlationId,
        reason
      )
    );
  }

  async createDepartment(
    ctx: AuthorizationContext,
    cmd: CreateDepartmentCommand,
    correlationId: string | null
  ): Promise<DepartmentRow> {
    await this.ensure(ctx, CAPABILITY.DEPARTMENT_MANAGE);
    const existing = await this.store.findDepartmentByCode(cmd.code);
    if (existing) {
      await this.audit(
        ctx,
        "DEPARTMENT_CREATE",
        "department",
        existing.department_id,
        "CONFLICT",
        null,
        { code: cmd.code },
        correlationId
      );
      throw new DuplicateDepartmentCodeError(cmd.code);
    }
    const now = new Date().toISOString();
    const row = await this.store.createDepartment({
      ...cmd,
      lifecycle: cmd.lifecycle ?? "Draft",
      display_order: cmd.display_order ?? 0,
      created_by: ctx.actorUserId,
      created_at: now,
      updated_by: ctx.actorUserId,
      updated_at: now,
    });
    await this.audit(
      ctx,
      "DEPARTMENT_CREATE",
      "department",
      row.department_id,
      "SUCCESS",
      null,
      row,
      correlationId
    );
    return row;
  }

  async listDepartments(ctx: AuthorizationContext): Promise<DepartmentView[]> {
    const rows = await this.store.listDepartments();
    return Promise.all(rows.map((row) => this.departmentView(ctx, row)));
  }
  async listManagementDirectory(
    ctx: AuthorizationContext
  ): Promise<ManagementDirectoryView> {
    const allDepartments = await this.listDepartments(ctx);
    const scopedDepartments = allDepartments.filter((department) =>
      hasDepartmentManagementScope(department)
    );
    const departmentPrograms = await Promise.all(
      allDepartments.map(async (department) => {
        const departmentScope = scopedDepartments.some(
          ({ department_id }) => department_id === department.department_id
        );
        if (!(await this.isModuleEnabled(department.department_id))) {
          return [];
        }
        const rows = await this.store.listProgramsForDepartment(
          department.department_id
        );
        const views = await Promise.all(
          rows.map(async (row) => ({
            row,
            capabilities: await this.programCapabilities(ctx, row),
          }))
        );
        return views
          .filter(
            ({ capabilities }) =>
              departmentScope || hasProgramManagementScope({ capabilities })
          )
          .map(({ row, capabilities }) =>
            this.managementProgram(row, capabilities)
          );
      })
    );
    const scopedPrograms = departmentPrograms.flat();
    const scopedDepartmentIds = new Set([
      ...scopedDepartments.map(({ department_id }) => department_id),
      ...scopedPrograms.map(({ department_id }) => department_id),
    ]);
    return {
      departments: allDepartments
        .filter(({ department_id }) => scopedDepartmentIds.has(department_id))
        .map((department) => this.managementDepartment(department)),
      programs: scopedPrograms,
    };
  }

  async getManagementAttention(
    ctx: AuthorizationContext,
    limit = MANAGEMENT_ATTENTION_LIMIT
  ): Promise<ManagementAttentionView> {
    const normalizedLimit = Math.min(50, Math.max(1, Math.floor(limit)));
    const directory = await this.listManagementDirectory(ctx);
    const departmentsById = new Map(
      directory.departments.map((department) => [
        department.department_id,
        department,
      ])
    );
    const managedPrograms = directory.programs.filter(
      ({ capabilities }) => capabilities.manage
    );
    const moduleScopes = await Promise.all(
      managedPrograms.map(async (program) => ({
        program,
        enrollment: await this.isModuleEnabled(
          program.department_id,
          MODULE_KEY.ENROLLMENT
        ),
        events: await this.isModuleEnabled(
          program.department_id,
          MODULE_KEY.EVENTS
        ),
      }))
    );
    const enrollmentProgramIds = moduleScopes
      .filter(({ enrollment }) => enrollment)
      .map(({ program }) => program.program_id);
    const eventProgramIds = moduleScopes
      .filter(({ events }) => events)
      .map(({ program }) => program.program_id);
    const startsAtOrAfter = new Date().toISOString();
    const [pendingRows, eventCounts, eventRows] = await Promise.all([
      this.store.countPendingEnrollmentRequests(enrollmentProgramIds),
      this.store.countManagementEventAttention(
        eventProgramIds,
        startsAtOrAfter
      ),
      this.store.listManagementEventAttention(
        eventProgramIds,
        startsAtOrAfter,
        normalizedLimit
      ),
    ]);
    const pendingByProgram = new Map(
      pendingRows.map(({ program_id, count }) => [program_id, count])
    );
    const eventsByProgram = new Map(
      eventCounts.map(
        ({ program_id, inactive_event_count, cancelled_event_count }) => [
          program_id,
          { inactive_event_count, cancelled_event_count },
        ]
      )
    );
    const programs = managedPrograms.map((program) => {
      const pending = pendingByProgram.get(program.program_id) ?? 0;
      const events = eventsByProgram.get(program.program_id) ?? {
        inactive_event_count: 0,
        cancelled_event_count: 0,
      };
      return {
        program_id: program.program_id,
        department_id: program.department_id,
        pending_enrollment_count: pending,
        inactive_event_count: events.inactive_event_count,
        cancelled_event_count: events.cancelled_event_count,
        actionable_count: pending + events.inactive_event_count,
      };
    });
    const programById = new Map(
      managedPrograms.map((program) => [program.program_id, program])
    );
    const items: ManagementAttentionItem[] = [];
    for (const program of programs) {
      const source = programById.get(program.program_id);
      const department = departmentsById.get(program.department_id);
      if (!source || !department) {
        continue;
      }
      if (program.pending_enrollment_count > 0) {
        items.push({
          kind: "enrollment",
          actionable: true,
          count: program.pending_enrollment_count,
          program_id: source.program_id,
          program_name: source.name,
          department_id: department.department_id,
          department_name: department.name,
        });
      }
    }
    for (const event of eventRows) {
      const program = programById.get(event.program_id);
      const department = program
        ? departmentsById.get(program.department_id)
        : undefined;
      if (!program || !department) {
        continue;
      }
      items.push({
        kind: "event",
        actionable:
          event.status === "Active" && event.availability === "Inactive",
        event_id: event.event_id,
        program_id: event.program_id,
        program_name: program.name,
        department_id: department.department_id,
        department_name: department.name,
        starts_at: event.starts_at,
        status: event.status,
        availability: event.availability,
        name: event.name,
      });
    }
    items.sort((left, right) => {
      if (left.actionable !== right.actionable) {
        return left.actionable ? -1 : 1;
      }
      if (left.kind === "event" && right.kind === "event") {
        return (
          left.starts_at.localeCompare(right.starts_at) ||
          left.event_id.localeCompare(right.event_id)
        );
      }
      return left.program_name.localeCompare(right.program_name, "zh-Hant");
    });
    const totalActionableCount = programs.reduce(
      (total, program) => total + program.actionable_count,
      0
    );
    const totalItemCount =
      programs.filter(
        ({ pending_enrollment_count }) => pending_enrollment_count > 0
      ).length +
      eventCounts.reduce(
        (total, { inactive_event_count, cancelled_event_count }) =>
          total + inactive_event_count + cancelled_event_count,
        0
      );
    return {
      programs,
      items: items.slice(0, normalizedLimit),
      total_actionable_count: totalActionableCount,
      has_more: totalItemCount > normalizedLimit,
    };
  }

  async getManagementNotifications(
    ctx: AuthorizationContext,
    limit = MANAGEMENT_NOTIFICATION_LIMIT
  ): Promise<ManagementNotificationsView> {
    const normalizedLimit = Math.min(1000, Math.max(1, Math.floor(limit)));
    const directory = await this.listManagementDirectory(ctx);
    const managedPrograms = directory.programs.filter(
      ({ capabilities }) => capabilities.manage
    );
    const hasGlobalProgramManagement = await this.authorizer.can(
      ctx,
      CAPABILITY.PROGRAM_MANAGE,
      null
    );
    if (!hasGlobalProgramManagement && managedPrograms.length === 0) {
      throw new AuthorizationDeniedError(CAPABILITY.PROGRAM_MANAGE);
    }

    const departmentsById = new Map(
      directory.departments.map((department) => [
        department.department_id,
        department,
      ])
    );
    const moduleScopes = await Promise.all(
      managedPrograms.map(async (program) => ({
        program,
        enrollment: await this.isModuleEnabled(
          program.department_id,
          MODULE_KEY.ENROLLMENT
        ),
        events: await this.isModuleEnabled(
          program.department_id,
          MODULE_KEY.EVENTS
        ),
      }))
    );
    const enrollmentProgramIds = moduleScopes
      .filter(({ enrollment }) => enrollment)
      .map(({ program }) => program.program_id);
    const eventProgramIds = moduleScopes
      .filter(({ events }) => events)
      .map(({ program }) => program.program_id);
    const startsAtOrAfter = new Date().toISOString();
    const [enrollmentRows, eventRows] = await Promise.all([
      this.store.listManagementNotificationEnrollments(enrollmentProgramIds),
      this.store.listManagementNotificationEvents(
        eventProgramIds,
        startsAtOrAfter
      ),
    ]);
    const programById = new Map(
      managedPrograms.map((program) => [program.program_id, program])
    );
    const current: {
      item: ManagementNotificationItem;
      sortAt: string;
    }[] = [];
    for (const enrollment of enrollmentRows) {
      const program = programById.get(enrollment.program_id);
      const department = program
        ? departmentsById.get(program.department_id)
        : undefined;
      if (!program || !department || enrollment.count <= 0) {
        continue;
      }
      const sourceKey = `enrollment:${program.program_id}`;
      const sourceRevision = `v1:${enrollment.count}:${enrollment.latest_submitted_at}`;
      current.push({
        sortAt: enrollment.latest_submitted_at,
        item: {
          source_key: sourceKey,
          source_revision: sourceRevision,
          read: false,
          kind: "enrollment",
          actionable: true,
          count: enrollment.count,
          latest_submitted_at: enrollment.latest_submitted_at,
          program_id: program.program_id,
          program_name: program.name,
          department_id: department.department_id,
          department_name: department.name,
        },
      });
    }
    for (const event of eventRows) {
      const program = programById.get(event.program_id);
      const department = program
        ? departmentsById.get(program.department_id)
        : undefined;
      if (!program || !department) {
        continue;
      }
      const sourceKey = `event:${event.event_id}`;
      const sourceRevision = `v1:${event.status}:${event.availability}:${event.updated_at}`;
      current.push({
        sortAt: event.updated_at,
        item: {
          source_key: sourceKey,
          source_revision: sourceRevision,
          read: false,
          kind: "event",
          actionable:
            event.status === "Active" && event.availability === "Inactive",
          event_id: event.event_id,
          program_id: program.program_id,
          program_name: program.name,
          department_id: department.department_id,
          department_name: department.name,
          starts_at: event.starts_at,
          status: event.status,
          availability: event.availability,
          name: event.name,
          updated_at: event.updated_at,
        },
      });
    }
    current.sort((left, right) => {
      if (left.item.actionable !== right.item.actionable) {
        return left.item.actionable ? -1 : 1;
      }
      return (
        right.sortAt.localeCompare(left.sortAt) ||
        left.item.source_key.localeCompare(right.item.source_key)
      );
    });
    const readStates = await this.store.listNotificationReadStates(
      ctx.actorUserId,
      current.map(({ item }) => item.source_key)
    );
    const readKeys = new Set(
      readStates.map(
        ({ source_key, source_revision }) =>
          `${source_key}\u0000${source_revision}`
      )
    );
    for (const entry of current) {
      entry.item.read = readKeys.has(
        `${entry.item.source_key}\u0000${entry.item.source_revision}`
      );
    }
    return {
      items: current.slice(0, normalizedLimit).map(({ item }) => item),
      unread_count: current.filter(({ item }) => !item.read).length,
      has_more: current.length > normalizedLimit,
    };
  }

  async markManagementNotificationsRead(
    ctx: AuthorizationContext,
    requested: readonly NotificationReadStateInput[]
  ): Promise<number> {
    if (requested.length === 0) {
      return 0;
    }
    const current = await this.getManagementNotifications(ctx, 1000);
    const currentKeys = new Set(
      current.items.map(
        ({ source_key, source_revision }) =>
          `${source_key}\u0000${source_revision}`
      )
    );
    const authorized = requested.filter(({ source_key, source_revision }) =>
      currentKeys.has(`${source_key}\u0000${source_revision}`)
    );
    return this.store.markNotificationReadStates(
      ctx.actorUserId,
      authorized,
      new Date().toISOString()
    );
  }

  /**
   * 085-07 (#324) — list the actor's participant Notices, newest-first,
   * within the 90-day retention window. Strictly self-scoped: only rows with
   * member_user_id === ctx.actorUserId are ever returned, and a caller
   * targeting another member is denied.
   */
  async listParticipantNotices(
    ctx: AuthorizationContext,
    memberUserId: string
  ): Promise<ParticipantNoticesView> {
    if (memberUserId !== ctx.actorUserId) {
      throw new AuthorizationDeniedError(CAPABILITY.PROGRAM_MANAGE);
    }
    const rows = await this.store.listParticipantNotices(
      ctx.actorUserId,
      Date.now() - NOTICE_RETENTION_MS
    );
    const notices = rows.map((row) => this.participantNoticeView(row));
    return {
      notices,
      unread_count: notices.filter((notice) => notice.read_at === null).length,
    };
  }

  /** 085-07 (#324) — idempotently mark every unread notice of the actor as read. */
  async markAllParticipantNoticesRead(
    ctx: AuthorizationContext,
    memberUserId: string
  ): Promise<number> {
    if (memberUserId !== ctx.actorUserId) {
      throw new AuthorizationDeniedError(CAPABILITY.PROGRAM_MANAGE);
    }
    return this.store.markAllParticipantNoticesRead(
      ctx.actorUserId,
      Date.now()
    );
  }

  /**
   * 085-07 (#324) — create one participant notice for a member. This
   * church-wide mutation requires the normalized global Program capability.
   */
  async createParticipantNotice(
    ctx: AuthorizationContext,
    input: CreateParticipantNoticeInput
  ): Promise<ParticipantNoticeView> {
    await this.ensure(ctx, CAPABILITY.PROGRAM_MANAGE);
    const row = await this.store.createParticipantNotice({
      notice_id: crypto.randomUUID(),
      member_user_id: input.member_user_id,
      kind: input.kind,
      title: input.title,
      body: input.body,
      program_id: input.program_id ?? null,
      event_id: input.event_id ?? null,
      read_at: input.read_at ?? null,
      created_at: Date.now(),
    });
    return this.participantNoticeView(row);
  }

  async getManagementProgram(
    ctx: AuthorizationContext,
    id: string
  ): Promise<ManagementProgramWorkspaceView | null> {
    const row = await this.store.findProgramById(id);
    if (!row || !(await this.isModuleEnabled(row.department_id))) {
      return null;
    }
    const departmentRow = await this.store.findDepartmentById(
      row.department_id
    );
    if (!departmentRow) {
      return null;
    }
    const department = await this.departmentView(ctx, departmentRow);
    const modules = (
      await this.store.listDepartmentModules(row.department_id)
    ).map(({ department_id, module_key, enabled, enabled_at }) => ({
      department_id,
      module_key,
      enabled,
      enabled_at,
    }));
    const program = this.managementProgramSettings(
      row,
      await this.programCapabilities(ctx, row)
    );
    if (
      !hasDepartmentManagementScope(department) &&
      !hasProgramManagementScope(program)
    ) {
      return null;
    }
    const cockpit = await this.computeManagementCockpit(ctx, row);
    return {
      program,
      department: this.managementDepartment(department),
      modules,
      cockpit,
    };
  }

  async getManagementCockpit(
    ctx: AuthorizationContext,
    id: string
  ): Promise<ManagementCockpitView | null> {
    const row = await this.store.findProgramById(id);
    if (!row || !(await this.isModuleEnabled(row.department_id))) {
      return null;
    }
    const departmentRow = await this.store.findDepartmentById(
      row.department_id
    );
    if (!departmentRow) {
      return null;
    }
    const department = await this.departmentView(ctx, departmentRow);
    const program = this.managementProgramSettings(
      row,
      await this.programCapabilities(ctx, row)
    );
    if (
      !hasDepartmentManagementScope(department) &&
      !hasProgramManagementScope(program)
    ) {
      return null;
    }
    return this.computeManagementCockpit(ctx, row);
  }

  private async computeManagementCockpit(
    _ctx: AuthorizationContext,
    row: ProgramRow
  ): Promise<ManagementCockpitView> {
    const isEventsEnabled = await this.isModuleEnabled(
      row.department_id,
      MODULE_KEY.EVENTS
    );
    const isEnrollmentEnabled = await this.isModuleEnabled(
      row.department_id,
      MODULE_KEY.ENROLLMENT
    );

    let next_event: ManagementCockpitNextEvent | null = null;
    let open_events: ManagementCockpitNextEvent[] = [];
    let active_event_count = 0;

    if (isEventsEnabled) {
      const events = await this.store.listEvents(row.program_id);
      const activeEvents = events.filter(
        (e) => e.status === "Active" && e.availability === "Active"
      );
      active_event_count = activeEvents.length;
      const now = Date.now();
      const openEvents = activeEvents
        .filter((event) => {
          const opensAt = parseIsoInstant(event.check_in_window_opens_at);
          const closesAt = parseIsoInstant(event.check_in_window_closes_at);
          return (
            opensAt !== null &&
            closesAt !== null &&
            now >= opensAt &&
            now <= closesAt
          );
        })
        .sort(
          (left, right) =>
            Date.parse(left.starts_at) - Date.parse(right.starts_at) ||
            left.event_id.localeCompare(right.event_id)
        );
      const futureEvents = activeEvents
        .filter(
          (e) =>
            Number.isFinite(Date.parse(e.starts_at)) &&
            Date.parse(e.starts_at) >= now
        )
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

      const projectEvent = async (
        event: EventRow
      ): Promise<ManagementCockpitNextEvent> => {
        const summary = await this.store.getEventParticipantSummary(
          event.event_id,
          row.program_id
        );
        return {
          event_id: event.event_id,
          program_id: event.program_id,
          title: event.name ?? null,
          name: event.name ?? null,
          starts_at: event.starts_at,
          ends_at: event.ends_at,
          location: event.location ?? null,
          source: event.source,
          is_recurring:
            row.behavior_type === "Recurring" || event.source === "SCHEDULE",
          checked_in_count: summary.checked_in,
          roster_count: summary.active_enrollments,
        };
      };
      const projectedOpenEvents = await Promise.all(
        openEvents.map((event) => projectEvent(event))
      );
      open_events = projectedOpenEvents;
      const [firstProjectedOpenEvent] = projectedOpenEvents;
      if (firstProjectedOpenEvent) {
        next_event = firstProjectedOpenEvent;
      } else if (futureEvents[0]) {
        next_event = await projectEvent(futureEvents[0]);
      }
    }

    let pending_enrollment_count = 0;
    if (isEnrollmentEnabled) {
      const pendingRows = await this.store.countPendingEnrollmentRequests([
        row.program_id,
      ]);
      pending_enrollment_count = pendingRows[0]?.count ?? 0;
    }

    return {
      program_id: row.program_id,
      next_event,
      open_events,
      active_event_count,
      pending_enrollment_count,
    };
  }

  async getManagementAccess(
    ctx: AuthorizationContext
  ): Promise<ManagementAccessView> {
    const departments = await this.listDepartments(ctx);
    const departmentScopes = departments.filter(
      hasDepartmentManagementScope
    ).length;

    // A department-level grant is enough to expose the entry. Avoid scanning
    // every Program row for broad operators; the workspace will re-check the
    // exact scope when the downstream management slice is opened.
    if (departmentScopes > 0) {
      return {
        hasManagementCapability: true,
        departmentScopes,
        programScopes: 0,
      };
    }

    const programRows = (
      await Promise.all(
        departments.map(async ({ department_id }) => {
          if (!(await this.isModuleEnabled(department_id))) {
            return [];
          }
          return this.store.listProgramAccessRows(department_id);
        })
      )
    ).flat();

    const programScopes = (
      await Promise.all(
        programRows.map(async ({ department_id, program_id }) => {
          const scope = { departmentId: department_id, programId: program_id };
          const [manage, publish, leaderAssign] = await Promise.all([
            this.authorizer.can(ctx, CAPABILITY.PROGRAM_MANAGE, scope),
            this.authorizer.can(ctx, CAPABILITY.PROGRAM_PUBLISH, scope),
            this.authorizer.can(ctx, CAPABILITY.PROGRAM_LEADER_ASSIGN, scope),
          ]);
          return manage || publish || leaderAssign;
        })
      )
    ).filter(Boolean).length;

    return {
      hasManagementCapability: programScopes > 0,
      departmentScopes,
      programScopes,
    };
  }

  /**
   * GET /api/v1/programs/hub — Management Hub directory (087-01 #310).
   *
   * Server-projected rows/groups: ungranted rows and empty groups are omitted
   * entirely (never shown disabled). Role gates reuse the canonical role
   * vocabulary; scope gates reuse the capability authorizer's effective
   * department/program scope resolution — browser visibility is never
   * authority. No Care row exists anywhere in the projection (spec 084/087).
   */
  async getManagementHub(
    ctx: AuthorizationContext
  ): Promise<ManagementHubView> {
    const departments = await this.listDepartments(ctx);
    const departmentScopes = departments.filter(hasDepartmentManagementScope);
    // Effective department.manage scope (role policy or per-department grant).
    const hasDepartmentManageScope = departmentScopes.some(
      (department) => department.capabilities.manage
    );
    // Attendance row: effective program.manage scope over a program whose
    // department runs the attendance module (086-04 gate family, same effective
    // scope the manageable-events chooser resolves for the actor).
    const programRows = (
      await Promise.all(
        departments.map(async ({ department_id }) => {
          if (!(await this.isModuleEnabled(department_id))) {
            return [];
          }
          return this.store.listProgramAccessRows(department_id);
        })
      )
    ).flat();
    // Identity management is independent of product-module enablement. Load
    // every Program scope so a scoped role manager always gets a real entry.
    const allProgramRows = (
      await Promise.all(
        departments.map(({ department_id }) =>
          this.store.listProgramAccessRows(department_id)
        )
      )
    ).flat();
    const hasAttendanceScope = (
      await Promise.all(
        programRows.map(async ({ department_id, program_id }) => {
          const managed = await this.authorizer.can(
            ctx,
            CAPABILITY.PROGRAM_MANAGE,
            { departmentId: department_id, programId: program_id }
          );
          return (
            managed &&
            (await this.isModuleEnabled(department_id, MODULE_KEY.ATTENDANCE))
          );
        })
      )
    ).some(Boolean);

    // Home Content publish is church-wide and resolves through the same
    // normalized capability adapter as every other management operation.
    const canPublishHome = await this.authorizer.can(
      ctx,
      CAPABILITY.HOME_PUBLISH,
      null
    );
    const canReadAccountDirectory = await this.authorizer.can(
      ctx,
      CAPABILITY.ACCOUNT_DIRECTORY_READ,
      null
    );
    const canManageRegistrationApprovals = await this.authorizer.can(
      ctx,
      CAPABILITY.REGISTRATION_APPROVAL_MANAGE,
      null
    );
    const canReadRoleTree = await this.authorizer.can(
      ctx,
      CAPABILITY.ROLE_READ,
      null
    );
    const canReadPermissionsGlobally = await this.authorizer.can(
      ctx,
      "role.permissions.read",
      null
    );

    const scopedRoleManagement = await Promise.all(
      [
        ...departments.map(({ department_id }) => ({
          scopeKind: "Department" as const,
          scopeId: department_id,
          scope: { departmentId: department_id },
        })),
        ...allProgramRows.map(({ department_id, program_id }) => ({
          scopeKind: "Program" as const,
          scopeId: program_id,
          scope: { departmentId: department_id, programId: program_id },
        })),
      ].map(async ({ scopeKind, scopeId, scope }) => {
        const [roleRead, roleAssign, roleRevoke, permissionRead] =
          await Promise.all([
            this.authorizer.can(ctx, CAPABILITY.ROLE_READ, scope),
            this.authorizer.can(ctx, CAPABILITY.ROLE_ASSIGN, scope),
            this.authorizer.can(ctx, CAPABILITY.ROLE_REVOKE, scope),
            this.authorizer.can(ctx, "role.permissions.read", scope),
          ]);
        if (!roleRead) {
          return null;
        }
        return {
          scopeKind,
          scopeId,
          canReadPermissions: permissionRead,
          canOpenAccess: roleAssign || roleRevoke,
        };
      })
    );
    const scopedPermissionDestination =
      scopedRoleManagement.find(
        (destination) => destination?.canReadPermissions === true
      ) ?? null;
    const scopedAssignmentDestination =
      scopedRoleManagement.find(
        (destination) => destination?.canOpenAccess === true
      ) ?? null;
    const canReadScopedRoleTree = scopedRoleManagement.some(
      (destination) => destination !== null
    );
    const canOpenPermissionEditor =
      (canReadRoleTree && canReadPermissionsGlobally) ||
      scopedPermissionDestination?.canReadPermissions === true;
    const permissionsHref = canOpenPermissionEditor
      ? "/management?module=permissions"
      : scopedAssignmentDestination
        ? `/management?module=accounts&view=access&scopeKind=${scopedAssignmentDestination.scopeKind}&scopeId=${encodeURIComponent(scopedAssignmentDestination.scopeId)}`
        : canReadRoleTree || canReadScopedRoleTree
          ? "/management?module=roles"
          : null;

    const granted = new Set<string>();
    if (canReadAccountDirectory) {
      granted.add("accounts");
    }
    if (canManageRegistrationApprovals) {
      granted.add("approvals");
    }
    if (permissionsHref) {
      granted.add("permissions");
    }
    if (hasDepartmentManageScope) {
      granted.add("departments");
      granted.add("members");
    }
    if (hasAttendanceScope) {
      granted.add("attendance");
    }
    if (canPublishHome) {
      granted.add("home-content");
    }

    const groups = MANAGEMENT_HUB_GROUPS.map((group) => ({
      key: group.key,
      label: group.label,
      rows: group.rows
        .filter((row) => granted.has(row.key))
        .map((row) =>
          row.key === "permissions" && permissionsHref
            ? { ...row, href: permissionsHref }
            : row
        ),
    })).filter((group) => group.rows.length > 0);

    // 另一個工作入口: any management capability (department scope OR program
    // manage/publish/leader_assign) — the exact `/access` entry gate.
    const { hasManagementCapability } = await this.getManagementAccess(ctx);

    return {
      groups,
      entryCard: hasManagementCapability ? MANAGEMENT_HUB_ENTRY_CARD : null,
    };
  }

  async getDepartment(
    ctx: AuthorizationContext,
    id: string
  ): Promise<DepartmentView | null> {
    const row = await this.store.findDepartmentById(id);
    if (!row) {
      return null;
    }
    const [canManage, canConfigureModules, canAssignManagers] =
      await Promise.all([
        this.authorizer.can(ctx, CAPABILITY.DEPARTMENT_MANAGE, {
          departmentId: id,
        }),
        this.authorizer.can(ctx, CAPABILITY.DEPARTMENT_MODULE_CONFIGURE, {
          departmentId: id,
        }),
        this.authorizer.can(ctx, CAPABILITY.DEPARTMENT_MANAGER_ASSIGN, {
          departmentId: id,
        }),
      ]);
    if (!(canManage || canConfigureModules || canAssignManagers)) {
      return null;
    }
    return this.departmentView(ctx, row);
  }

  async updateDepartment(
    ctx: AuthorizationContext,
    id: string,
    update: DepartmentUpdate,
    correlationId: string | null
  ): Promise<DepartmentRow> {
    await this.ensure(ctx, CAPABILITY.DEPARTMENT_MANAGE, { departmentId: id });
    const old = await this.store.findDepartmentById(id);
    if (!old) {
      throw new AuthorizationDeniedError(CAPABILITY.DEPARTMENT_MANAGE);
    }
    if (update.lifecycle === "Active" && old.lifecycle !== "Active") {
      await this.ensure(ctx, CAPABILITY.DEPARTMENT_PUBLISH, {
        departmentId: id,
      });
    }
    const row = await this.store.updateDepartment(id, {
      ...update,
      updated_by: ctx.actorUserId,
      updated_at: new Date().toISOString(),
    });
    await this.audit(
      ctx,
      "DEPARTMENT_UPDATE",
      "department",
      id,
      "SUCCESS",
      old,
      row,
      correlationId
    );
    return row;
  }

  async createProgram(
    ctx: AuthorizationContext,
    cmd: CreateProgramCommand,
    correlationId: string | null
  ): Promise<ProgramRow> {
    await this.ensure(ctx, CAPABILITY.PROGRAM_MANAGE, {
      departmentId: cmd.department_id,
    });
    const department = await this.store.findDepartmentById(cmd.department_id);
    if (!department) {
      throw new AuthorizationDeniedError(CAPABILITY.PROGRAM_MANAGE);
    }
    if (!(await this.isModuleEnabled(cmd.department_id))) {
      throw new AuthorizationDeniedError(CAPABILITY.PROGRAM_MANAGE);
    }
    if (cmd.lifecycle === "Archived") {
      // Create-time validation, not a lifecycle transition: Draft is merely
      // the default create state, so the transition-pair message would lie.
      throw new InvalidProgramLifecycleError(
        "Draft",
        "Archived",
        "Programs cannot be created directly in the Archived state."
      );
    }
    if (cmd.lifecycle === "Active") {
      await this.ensure(ctx, CAPABILITY.PROGRAM_PUBLISH, {
        departmentId: cmd.department_id,
      });
    }
    const existing = await this.store.listProgramsForDepartment(
      cmd.department_id
    );
    if (existing.some((p) => p.name === cmd.name)) {
      throw new DuplicateProgramNameError(cmd.name);
    }
    const now = new Date().toISOString();
    const row = await this.store.createProgram({
      ...cmd,
      lifecycle: "Draft",
      discoverability: "Unlisted",
      enrollment_mode: cmd.enrollment_mode ?? "MemberRequest",
      display_order: cmd.display_order ?? 0,
      created_by: ctx.actorUserId,
      created_at: now,
      updated_by: ctx.actorUserId,
      updated_at: now,
    });
    await this.audit(
      ctx,
      "PROGRAM_CREATE",
      "program",
      row.program_id,
      "SUCCESS",
      null,
      row,
      correlationId
    );
    return row;
  }

  async listPrograms(
    ctx: AuthorizationContext,
    departmentId: string
  ): Promise<ProgramView[]> {
    if (!(await this.isModuleEnabled(departmentId))) {
      return [];
    }
    const rows = await this.store.listProgramsForDepartment(departmentId);
    const views = await Promise.all(
      rows.map(async (row) => ({
        row,
        capabilities: await this.programCapabilities(ctx, row),
      }))
    );
    const visible = await Promise.all(
      views.map(async ({ row, capabilities }) => ({
        row,
        capabilities,
        visible: await this.canViewParticipantProgram(ctx, row, capabilities),
      }))
    );
    return visible
      .filter(({ visible: isVisible }) => isVisible)
      .map(({ row, capabilities }) => this.programView(row, capabilities));
  }

  async getProgram(
    ctx: AuthorizationContext,
    id: string
  ): Promise<ProgramView | null> {
    const row = await this.store.findProgramById(id);
    if (!row || !(await this.isModuleEnabled(row.department_id))) {
      return null;
    }
    const capabilities = await this.programCapabilities(ctx, row);
    if (!(await this.canViewParticipantProgram(ctx, row, capabilities))) {
      return null;
    }
    return this.programView(row, capabilities);
  }

  /**
   * Return whether a Program is addressable by a route-level existence check.
   * Participant visibility is intentionally not part of this probe: mutation
   * handlers need to distinguish an unknown resource (404) from a known
   * resource on which the actor lacks the required capability (403).
   */
  async programExists(id: string): Promise<boolean> {
    const row = await this.store.findProgramById(id);
    return row !== null && (await this.isModuleEnabled(row.department_id));
  }

  /**
   * Participant Programs directory (PUI-02 / Issue #246): narrow, grouped
   * catalog projection over production D1. Visibility keeps the incumbent
   * server policy — Active+Listed rows are public, while unlisted, Draft, and
   * Archived rows appear only through an authorized relationship/history or
   * scoped `program.manage` access. Module-disabled Departments are excluded.
   * Departments with zero visible Programs are omitted so the landing's empty
   * state means a truly empty catalog.
   */
  async listParticipantCatalog(
    ctx: AuthorizationContext
  ): Promise<ParticipantCatalogEntry[]> {
    const departments = await this.store.listDepartments();
    const entries = await Promise.all(
      departments.map(async (department) => {
        if (!(await this.isModuleEnabled(department.department_id))) {
          return null;
        }
        const rows = await this.store.listProgramsForDepartment(
          department.department_id
        );
        const visible = (
          await Promise.all(
            rows.map(async (row) => {
              const capabilities = await this.programCapabilities(ctx, row);
              return {
                row,
                capabilities,
                visible: await this.canViewParticipantProgram(
                  ctx,
                  row,
                  capabilities
                ),
              };
            })
          )
        ).filter(({ visible }) => visible);
        if (visible.length === 0) {
          return null;
        }
        const [isEnrollmentEnabled, isEventsEnabled] = await Promise.all([
          this.isModuleEnabled(department.department_id, MODULE_KEY.ENROLLMENT),
          this.isModuleEnabled(department.department_id, MODULE_KEY.EVENTS),
        ]);
        const programs = await Promise.all(
          visible.map(async ({ row }) =>
            this.participantCatalogProgram(
              ctx,
              row,
              isEnrollmentEnabled,
              isEventsEnabled
            )
          )
        );
        return {
          department: this.departmentSummary(department),
          programs,
        };
      })
    );
    return entries.filter(
      (entry): entry is ParticipantCatalogEntry => entry !== null
    );
  }

  private async participantCatalogProgram(
    ctx: AuthorizationContext,
    row: ProgramRow,
    isEnrollmentEnabled: boolean,
    isEventsEnabled: boolean
  ): Promise<ParticipantCatalogProgram> {
    const summary = this.programSummary(row);
    let viewerState: ParticipantCatalogViewerState;

    if (row.lifecycle === "Archived") {
      viewerState = "archived";
    } else if (!isEnrollmentEnabled || !ctx.actorUserId) {
      viewerState =
        row.enrollment_mode === "ManagerOnly" ? "managerOnly" : "eligible";
    } else {
      const { requests, enrollments } =
        await this.store.listParticipantEnrollmentSnapshot(
          row.program_id,
          ctx.actorUserId
        );
      const userRequests = requests
        .filter((r) => r.member_user_id === ctx.actorUserId)
        .sort((a, b) =>
          (a.submitted_at || "").localeCompare(b.submitted_at || "")
        );
      const userEnrollments = enrollments
        .filter((e) => e.member_user_id === ctx.actorUserId)
        .sort((a, b) =>
          (a.enrolled_at || "").localeCompare(b.enrolled_at || "")
        );

      if (userEnrollments.some((e) => e.status === "Active")) {
        viewerState = "active";
      } else if (userRequests.some((r) => r.status === "Pending")) {
        viewerState = "pending";
      } else {
        const latestRequest =
          userRequests.length > 0 ? userRequests.at(-1) : null;
        const cancelledEnrollments = userEnrollments.filter(
          (e) => e.status === "Cancelled"
        );
        const latestCancelledEnrollment =
          cancelledEnrollments.length > 0 ? cancelledEnrollments.at(-1) : null;

        if (latestRequest?.status === "Rejected") {
          const reqTime = Date.parse(
            latestRequest.decided_at ?? latestRequest.submitted_at
          );
          const cancelTime = latestCancelledEnrollment
            ? Date.parse(
                latestCancelledEnrollment.cancelled_at ??
                  latestCancelledEnrollment.enrolled_at
              )
            : -1;
          if (
            !latestCancelledEnrollment ||
            !Number.isFinite(cancelTime) ||
            reqTime >= cancelTime
          ) {
            viewerState = "rejected";
          } else {
            viewerState = "cancelled";
          }
        } else if (latestRequest?.status === "Withdrawn") {
          const reqTime = Date.parse(
            latestRequest.decided_at ?? latestRequest.submitted_at
          );
          const cancelTime = latestCancelledEnrollment
            ? Date.parse(
                latestCancelledEnrollment.cancelled_at ??
                  latestCancelledEnrollment.enrolled_at
              )
            : -1;
          if (
            !latestCancelledEnrollment ||
            !Number.isFinite(cancelTime) ||
            reqTime >= cancelTime
          ) {
            viewerState = "withdrawn";
          } else {
            viewerState = "cancelled";
          }
        } else if (latestCancelledEnrollment) {
          viewerState = "cancelled";
        } else if (row.enrollment_mode === "ManagerOnly") {
          viewerState = "managerOnly";
        } else {
          viewerState = "eligible";
        }
      }
    }

    let nextEventStartsAt: string | null = null;
    let upcomingEventCount = 0;

    if (isEventsEnabled) {
      const events = await this.store.listEvents(row.program_id);
      const now = Date.now();
      const futureEvents = events
        .filter(
          (e) =>
            e.status === "Active" &&
            e.availability === "Active" &&
            Number.isFinite(Date.parse(e.starts_at)) &&
            Date.parse(e.starts_at) > now
        )
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

      nextEventStartsAt = futureEvents[0]?.starts_at ?? null;
      upcomingEventCount = futureEvents.length;
    }

    return {
      ...summary,
      viewerState,
      nextEventStartsAt,
      upcomingEventCount,
    };
  }
  /**
   * Participant Program detail (PUI-03 / Issue #247). Revalidates the same
   * server visibility policy as `getProgram`, then projects only participant
   * fields plus safe schedule/event context. Event rows are always active-only
   * here, including for managers, so check-in and operator data stay private.
   */
  async getParticipantProgramDetail(
    ctx: AuthorizationContext,
    programId: string
  ): Promise<ParticipantProgramDetail | null> {
    const view = await this.getProgram(ctx, programId);
    if (!view) {
      return null;
    }
    const department = await this.store.findDepartmentById(view.department_id);
    if (!department) {
      return null;
    }
    const [rules, eventRows, enrollmentState] = await Promise.all([
      this.listScheduleRules(ctx, programId),
      this.listEvents(ctx, programId),
      this.participantEnrollmentSnapshot(ctx, view),
    ]);
    const { hasActiveEnrollment } = enrollmentState;
    return {
      program: this.programSummary(view),
      department: this.departmentSummary(department),
      schedule_rules: rules.map((rule) => ({
        rule_id: rule.rule_id,
        recurrence: rule.recurrence,
        day_of_week: rule.day_of_week,
        month_day: rule.month_day,
        start_time: rule.start_time,
        end_time: rule.end_time,
      })),
      events: (eventRows ?? [])
        .filter(
          (event) =>
            event.status === "Active" && event.availability === "Active"
        )
        .map((event) => ({
          event_id: event.event_id,
          program_id: event.program_id,
          starts_at: event.starts_at,
          ends_at: event.ends_at,
          status: "Active" as const,
          source: event.source,
          // Next-meeting card surfaces the real meeting title/venue only;
          // check-in and operator fields stay private here.
          name: event.name,
          location: event.location,
          self_check_in_available: participantSelfCheckInAvailable(
            event,
            view,
            hasActiveEnrollment
          ),
        })),
      enrollment: enrollmentState.snapshot,
      enrollment_access: enrollmentState.access,
    };
  }

  private async participantEnrollmentSnapshot(
    ctx: AuthorizationContext,
    view: ProgramView
  ): Promise<{
    access: ParticipantEnrollmentAccess;
    snapshot: ParticipantEnrollmentSnapshot | null;
    hasActiveEnrollment: boolean;
  }> {
    const { requests, enrollments } =
      await this.store.listParticipantEnrollmentSnapshot(
        view.program_id,
        ctx.actorUserId
      );
    const hasActiveEnrollment = enrollments.some(
      (enrollment) => enrollment.status === "Active"
    );
    if (
      !(await this.isModuleEnabled(view.department_id, MODULE_KEY.ENROLLMENT))
    ) {
      return {
        access: "Unavailable",
        snapshot: null,
        hasActiveEnrollment,
      };
    }
    if (view.lifecycle !== "Active") {
      return {
        access: "Unavailable",
        snapshot: {
          requests: requests
            .filter((request) => request.member_user_id === ctx.actorUserId)
            .map((request) => ({
              request_id: request.request_id,
              status: request.status,
              submitted_at: request.submitted_at,
              decided_at: request.decided_at,
            })),
          enrollments: enrollments
            .filter(
              (enrollment) => enrollment.member_user_id === ctx.actorUserId
            )
            .map((enrollment) => ({
              enrollment_id: enrollment.enrollment_id,
              status: enrollment.status,
              enrolled_at: enrollment.enrolled_at,
              cancelled_at: enrollment.cancelled_at,
            })),
        },
        hasActiveEnrollment,
      };
    }
    if (!view.capabilities.enroll) {
      return { access: "Ineligible", snapshot: null, hasActiveEnrollment };
    }
    return {
      access: "Eligible",
      snapshot: {
        requests: requests
          .filter((request) => request.member_user_id === ctx.actorUserId)
          .map((request) => ({
            request_id: request.request_id,
            status: request.status,
            submitted_at: request.submitted_at,
            decided_at: request.decided_at,
          })),
        enrollments: enrollments
          .filter((enrollment) => enrollment.member_user_id === ctx.actorUserId)
          .map((enrollment) => ({
            enrollment_id: enrollment.enrollment_id,
            status: enrollment.status,
            enrolled_at: enrollment.enrolled_at,
            cancelled_at: enrollment.cancelled_at,
          })),
      },
      hasActiveEnrollment,
    };
  }

  private programSummary(
    row: Pick<ProgramRow, keyof ProgramSummary>
  ): ProgramSummary {
    return {
      program_id: row.program_id,
      department_id: row.department_id,
      name: row.name,
      description: row.description,
      category: row.category,
      behavior_type: row.behavior_type,
      lifecycle: row.lifecycle,
      discoverability: row.discoverability,
      enrollment_mode: row.enrollment_mode,
      display_order: row.display_order,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
  private programView(
    row: ProgramRow,
    capabilities: ProgramCapabilities
  ): ProgramView {
    return capabilities.manage
      ? { ...row, capabilities }
      : { ...this.programSummary(row), capabilities };
  }
  private managementProgram(
    row: ProgramRow,
    capabilities: ProgramCapabilities
  ): ManagementProgramView {
    return { ...this.programSummary(row), capabilities };
  }
  private managementProgramSettings(
    row: ProgramRow,
    capabilities: ProgramCapabilities
  ): ManagementProgramSettingsView {
    const program = this.managementProgram(row, capabilities);
    return capabilities.manage
      ? {
          ...program,
          check_in_opens_at_minutes_before_start:
            row.check_in_opens_at_minutes_before_start,
          check_in_closes_at_minutes_after_end:
            row.check_in_closes_at_minutes_after_end,
        }
      : program;
  }
  private programMutationView(
    row: ProgramRow,
    capabilities: ProgramCapabilities
  ): ManagementProgramSettingsView {
    // PATCH responses mirror the management read projection: attendance
    // defaults for managers, but never the check-in secret.
    return this.managementProgramSettings(row, capabilities);
  }

  async getProgramAttendanceArtifact(
    ctx: AuthorizationContext,
    id: string
  ): Promise<ProgramAttendanceArtifactView | null> {
    const row = await this.store.findProgramById(id);
    if (
      !row ||
      row.lifecycle === "Archived" ||
      !(await this.isModuleEnabled(row.department_id, MODULE_KEY.ATTENDANCE))
    ) {
      return null;
    }
    const capabilities = await this.programCapabilities(ctx, row);
    if (!capabilities.manage || !row.check_in_token) {
      return null;
    }
    return {
      program_id: row.program_id,
      program_name: row.name,
      check_in_token: row.check_in_token,
      can_rotate: await this.authorizer.can(ctx, CAPABILITY.DEPARTMENT_MANAGE, {
        departmentId: row.department_id,
      }),
    };
  }

  async rotateProgramCheckInToken(
    ctx: AuthorizationContext,
    id: string,
    idempotencyKey: string,
    correlationId: string | null
  ): Promise<ProgramTokenRotationView> {
    const row = await this.store.findProgramById(id);
    const action = "PROGRAM_CHECK_IN_TOKEN_ROTATE";
    const safeProgram = { program_id: id };
    if (
      !row ||
      row.lifecycle === "Archived" ||
      !(await this.isModuleEnabled(row.department_id, MODULE_KEY.ATTENDANCE))
    ) {
      await this.audit(
        ctx,
        action,
        "program",
        id,
        "DENIED",
        safeProgram,
        safeProgram,
        correlationId
      );
      throw new AuthorizationDeniedError(CAPABILITY.DEPARTMENT_MANAGE);
    }
    const canRotate = await this.authorizer.can(
      ctx,
      CAPABILITY.DEPARTMENT_MANAGE,
      {
        departmentId: row.department_id,
      }
    );
    if (!canRotate) {
      await this.audit(
        ctx,
        action,
        "program",
        id,
        "DENIED",
        safeProgram,
        safeProgram,
        correlationId
      );
      throw new AuthorizationDeniedError(CAPABILITY.DEPARTMENT_MANAGE);
    }

    const input: ProgramTokenRotationInput = {
      program_id: id,
      actor_user_id: ctx.actorUserId,
      idempotency_key: idempotencyKey,
      request_fingerprint: `program-check-in-token-rotate:${id}`,
      now: new Date().toISOString(),
      audit_id: crypto.randomUUID(),
      correlation_id: correlationId,
    };
    let result: ProgramTokenRotationResult;
    try {
      result = await this.store.rotateProgramCheckInToken(input);
    } catch (error) {
      if (error instanceof ProgramTokenRotationConflictError) {
        await this.audit(
          ctx,
          action,
          "program",
          id,
          "CONFLICT",
          safeProgram,
          safeProgram,
          correlationId
        );
      }
      throw error;
    }
    const token = result.program.check_in_token;
    if (!token) {
      throw new Error("Program token rotation returned an empty token.");
    }
    return {
      program_id: result.program.program_id,
      check_in_token: token,
      idempotent: result.idempotent,
    };
  }

  private managementDepartment(view: DepartmentView): ManagementDepartmentView {
    return {
      department_id: view.department_id,
      code: view.code,
      name: view.name,
      description: view.description,
      lifecycle: view.lifecycle,
      display_order: view.display_order,
      created_at: view.created_at,
      updated_at: view.updated_at,
      capabilities: view.capabilities,
    };
  }

  private departmentSummary(row: DepartmentRow): DepartmentSummary {
    return {
      department_id: row.department_id,
      code: row.code,
      name: row.name,
      description: row.description,
      lifecycle: row.lifecycle,
      display_order: row.display_order,
    };
  }

  private participantNoticeView(
    row: ParticipantNoticeRow
  ): ParticipantNoticeView {
    return {
      notice_id: row.notice_id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      program_id: row.program_id,
      event_id: row.event_id,
      read_at: row.read_at,
      created_at: row.created_at,
    };
  }

  async updateProgram(
    ctx: AuthorizationContext,
    id: string,
    update: ProgramUpdate,
    correlationId: string | null
  ): Promise<ManagementProgramSettingsView> {
    const old = await this.store.findProgramById(id);
    if (!old) {
      await this.audit(
        ctx,
        "PROGRAM_UPDATE",
        "program",
        id,
        "DENIED",
        null,
        null,
        correlationId
      );
      throw new AuthorizationDeniedError(CAPABILITY.PROGRAM_MANAGE);
    }
    if (!(await this.isModuleEnabled(old.department_id))) {
      await this.audit(
        ctx,
        "PROGRAM_UPDATE",
        "program",
        id,
        "DENIED",
        old,
        old,
        correlationId
      );
      throw new AuthorizationDeniedError(CAPABILITY.PROGRAM_MANAGE);
    }
    try {
      await this.ensure(ctx, CAPABILITY.PROGRAM_MANAGE, {
        departmentId: old.department_id,
        programId: old.program_id,
      });
    } catch (error) {
      if (error instanceof AuthorizationDeniedError) {
        await this.audit(
          ctx,
          "PROGRAM_UPDATE",
          "program",
          id,
          "DENIED",
          old,
          old,
          correlationId
        );
      }
      throw error;
    }
    if (update.name !== undefined && update.name !== old.name) {
      const existing = await this.store.listProgramsForDepartment(
        old.department_id
      );
      if (
        existing.some(
          (program) => program.program_id !== id && program.name === update.name
        )
      ) {
        throw new DuplicateProgramNameError(update.name);
      }
    }
    const updateWithAudit = {
      ...update,
      updated_by: ctx.actorUserId,
      updated_at: new Date().toISOString(),
    };
    if (update.lifecycle === "Archived") {
      const onlyLifecycle =
        update.name === undefined &&
        update.description === undefined &&
        update.category === undefined &&
        update.behavior_type === undefined &&
        update.discoverability === undefined &&
        update.enrollment_mode === undefined &&
        update.display_order === undefined &&
        update.check_in_opens_at_minutes_before_start === undefined &&
        update.check_in_closes_at_minutes_after_end === undefined;
      if (old.lifecycle === "Archived") {
        if (onlyLifecycle) {
          // Terminal repeat: same-actor is a quiet DUPLICATE (never silent),
          // a different actor observes a CONFLICT against the archived row.
          const sameActor = old.updated_by === ctx.actorUserId;
          await this.audit(
            ctx,
            "PROGRAM_ARCHIVE",
            "program",
            id,
            sameActor ? "DUPLICATE" : "CONFLICT",
            old,
            old,
            correlationId
          );
          if (sameActor) {
            return this.programMutationView(
              old,
              await this.programCapabilities(ctx, old)
            );
          }
          throw new ProgramArchiveBlockedError(id, ["already_archived"]);
        } else {
          // Metadata edits on an archived program are still allowed; fall
          // through to the generic update path below.
        }
      } else if (old.lifecycle === "Active") {
        const row = await this.store.archiveProgramIfClear(
          id,
          updateWithAudit,
          new Date().toISOString()
        );
        if (!row) {
          // The atomic update failed: either another actor archived the
          // program concurrently (repeat classification by actor), or an
          // operational commitment still blocks the archive (conflict with
          // reasons).
          const current = await this.store.findProgramById(id);
          if (current?.lifecycle === "Archived") {
            const sameActor = current.updated_by === ctx.actorUserId;
            await this.audit(
              ctx,
              "PROGRAM_ARCHIVE",
              "program",
              id,
              sameActor ? "DUPLICATE" : "CONFLICT",
              old,
              current,
              correlationId
            );
            if (sameActor) {
              return this.programMutationView(
                current,
                await this.programCapabilities(ctx, current)
              );
            }
            throw new ProgramArchiveBlockedError(id, ["already_archived"]);
          }
          const [events, requests] = await Promise.all([
            this.store.listEvents(id),
            this.store.listEnrollmentRequests(id),
          ]);
          const reasons = [
            events.some(
              (event) =>
                event.status === "Active" &&
                Number.isFinite(Date.parse(event.starts_at)) &&
                Date.parse(event.starts_at) > Date.now()
            )
              ? "future_active_event"
              : null,
            requests.some((request) => request.status === "Pending")
              ? "pending_enrollment_request"
              : null,
          ].filter((reason): reason is string => reason !== null);
          await this.audit(
            ctx,
            "PROGRAM_ARCHIVE",
            "program",
            id,
            "CONFLICT",
            old,
            { reasons },
            correlationId
          );
          throw new ProgramArchiveBlockedError(id, reasons);
        }
        await this.audit(
          ctx,
          "PROGRAM_ARCHIVE",
          "program",
          id,
          "SUCCESS",
          old,
          row,
          correlationId
        );
        return this.programMutationView(
          row,
          await this.programCapabilities(ctx, row)
        );
      } else {
        throw new InvalidProgramLifecycleError(old.lifecycle, "Archived");
      }
    }
    if (update.lifecycle !== undefined && update.lifecycle !== old.lifecycle) {
      const validTransition =
        (old.lifecycle === "Draft" && update.lifecycle === "Active") ||
        (old.lifecycle === "Active" && update.lifecycle === "Archived");
      if (!validTransition) {
        throw new InvalidProgramLifecycleError(old.lifecycle, update.lifecycle);
      }
    }
    if (update.lifecycle === "Active" && old.lifecycle !== "Active") {
      await this.ensure(ctx, CAPABILITY.PROGRAM_PUBLISH, {
        departmentId: old.department_id,
        programId: old.program_id,
      });
    }
    const row = await this.store.updateProgram(id, updateWithAudit);
    await this.audit(
      ctx,
      "PROGRAM_UPDATE",
      "program",
      id,
      "SUCCESS",
      old,
      row,
      correlationId
    );
    return this.programMutationView(
      row,
      await this.programCapabilities(ctx, row)
    );
  }

  async setDepartmentModule(
    ctx: AuthorizationContext,
    cmd: SetModuleCommand,
    correlationId: string | null
  ): Promise<DepartmentModuleRow> {
    await this.ensure(ctx, CAPABILITY.DEPARTMENT_MODULE_CONFIGURE, {
      departmentId: cmd.department_id,
    });
    if (!MODULE_KEYS.includes(cmd.module_key)) {
      throw new InvalidModuleKeyError(cmd.module_key);
    }
    const department = await this.store.findDepartmentById(cmd.department_id);
    if (!department) {
      throw new AuthorizationDeniedError(
        CAPABILITY.DEPARTMENT_MODULE_CONFIGURE
      );
    }
    const oldModules = await this.store.listDepartmentModules(
      cmd.department_id
    );
    const row = await this.store.setDepartmentModule(
      cmd.department_id,
      cmd.module_key,
      cmd.enabled,
      ctx.actorUserId,
      new Date().toISOString()
    );
    const action = cmd.enabled ? "MODULE_ENABLE" : "MODULE_DISABLE";
    await this.audit(
      ctx,
      action,
      "department_module",
      `${cmd.department_id}:${cmd.module_key}`,
      "SUCCESS",
      oldModules,
      row,
      correlationId
    );
    return row;
  }

  async listDepartmentModules(
    ctx: AuthorizationContext,
    departmentId: string
  ): Promise<DepartmentModuleRow[] | null> {
    const department = await this.store.findDepartmentById(departmentId);
    if (!department) {
      return null;
    }
    const [canManage, canConfigureModules] = await Promise.all([
      this.authorizer.can(ctx, CAPABILITY.DEPARTMENT_MANAGE, {
        departmentId,
      }),
      this.authorizer.can(ctx, CAPABILITY.DEPARTMENT_MODULE_CONFIGURE, {
        departmentId,
      }),
    ]);
    if (!(canManage || canConfigureModules)) {
      return null;
    }
    return this.store.listDepartmentModules(departmentId);
  }

  private async departmentView(
    ctx: AuthorizationContext,
    row: DepartmentRow
  ): Promise<DepartmentView> {
    const [
      manage,
      publish,
      moduleConfigure,
      managerAssign,
      roleRead,
      roleAssign,
      roleRevoke,
    ] = await Promise.all([
      this.authorizer.can(ctx, CAPABILITY.DEPARTMENT_MANAGE, {
        departmentId: row.department_id,
      }),
      this.authorizer.can(ctx, CAPABILITY.DEPARTMENT_PUBLISH, {
        departmentId: row.department_id,
      }),
      this.authorizer.can(ctx, CAPABILITY.DEPARTMENT_MODULE_CONFIGURE, {
        departmentId: row.department_id,
      }),
      this.authorizer.can(ctx, CAPABILITY.DEPARTMENT_MANAGER_ASSIGN, {
        departmentId: row.department_id,
      }),
      this.authorizer.can(ctx, CAPABILITY.ROLE_READ, {
        departmentId: row.department_id,
      }),
      this.authorizer.can(ctx, CAPABILITY.ROLE_ASSIGN, {
        departmentId: row.department_id,
      }),
      this.authorizer.can(ctx, CAPABILITY.ROLE_REVOKE, {
        departmentId: row.department_id,
      }),
    ]);
    return {
      ...row,
      capabilities: {
        manage,
        publish,
        module_configure: moduleConfigure,
        manager_assign: managerAssign,
        role_read: roleRead,
        role_assign: roleAssign,
        role_revoke: roleRevoke,
      },
    };
  }

  private async programCapabilities(
    ctx: AuthorizationContext,
    row: ProgramRow
  ): Promise<ProgramCapabilities> {
    const scope = {
      departmentId: row.department_id,
      programId: row.program_id,
    };
    const [
      manage,
      publish,
      enroll,
      leaderAssign,
      roleRead,
      roleAssign,
      roleRevoke,
    ] = await Promise.all([
      this.authorizer.can(ctx, CAPABILITY.PROGRAM_MANAGE, scope),
      this.authorizer.can(ctx, CAPABILITY.PROGRAM_PUBLISH, scope),
      this.authorizer.can(ctx, CAPABILITY.PROGRAM_ENROLL, scope),
      this.authorizer.can(ctx, CAPABILITY.PROGRAM_LEADER_ASSIGN, scope),
      this.authorizer.can(ctx, CAPABILITY.ROLE_READ, scope),
      this.authorizer.can(ctx, CAPABILITY.ROLE_ASSIGN, scope),
      this.authorizer.can(ctx, CAPABILITY.ROLE_REVOKE, scope),
    ]);
    return {
      manage,
      publish,
      enroll,
      leader_assign: leaderAssign,
      role_read: roleRead,
      role_assign: roleAssign,
      role_revoke: roleRevoke,
    };
  }

  private async requireProgramFor(
    ctx: AuthorizationContext,
    programId: string,
    capability: Capability
  ): Promise<ProgramRow> {
    const program = await this.store.findProgramById(programId);
    if (!program || program.lifecycle === "Archived") {
      throw new AuthorizationDeniedError(capability);
    }
    if (!(await this.isModuleEnabled(program.department_id))) {
      throw new AuthorizationDeniedError(capability);
    }
    await this.ensure(ctx, capability, {
      departmentId: program.department_id,
      programId: program.program_id,
    });
    return program;
  }

  private async isModuleEnabled(
    departmentId: string,
    moduleKey: ModuleKey = MODULE_KEY.PROGRAM_CATALOG
  ): Promise<boolean> {
    const modules = await this.store.listDepartmentModules(departmentId);
    return modules.some(
      (module) => module.module_key === moduleKey && module.enabled === 1
    );
  }

  private async requireModuleEnabled(
    departmentId: string,
    moduleKey: ModuleKey
  ): Promise<void> {
    if (!(await this.isModuleEnabled(departmentId, moduleKey))) {
      throw new AuthorizationDeniedError(CAPABILITY.PROGRAM_MANAGE);
    }
  }

  getScheduleRule(
    _ctx: AuthorizationContext,
    ruleId: string
  ): Promise<ScheduleRuleRow | null> {
    return this.store.findScheduleRule(ruleId);
  }

  async listScheduleRules(
    _ctx: AuthorizationContext,
    programId: string
  ): Promise<ScheduleRuleRow[]> {
    const program = await this.store.findProgramById(programId);
    if (
      !program ||
      !(await this.isModuleEnabled(program.department_id, MODULE_KEY.EVENTS))
    ) {
      return [];
    }
    return this.store.listScheduleRules(programId);
  }

  async assertProgramManagement(
    ctx: AuthorizationContext,
    programId: string
  ): Promise<void> {
    await this.requireProgramFor(ctx, programId, CAPABILITY.PROGRAM_MANAGE);
  }

  async listScheduleExceptions(
    ctx: AuthorizationContext,
    programId: string,
    ruleId: string
  ): Promise<ScheduleExceptionRow[]> {
    const program = await this.requireProgramFor(
      ctx,
      programId,
      CAPABILITY.PROGRAM_MANAGE
    );
    await this.requireModuleEnabled(program.department_id, MODULE_KEY.EVENTS);
    const rule = await this.store.findScheduleRule(ruleId);
    if (!rule || rule.program_id !== programId) {
      return [];
    }
    return this.store.listScheduleExceptions([ruleId]);
  }

  getScheduleException(
    _ctx: AuthorizationContext,
    exceptionId: string
  ): Promise<ScheduleExceptionRow | null> {
    return this.store.findScheduleException(exceptionId);
  }

  getEvent(
    _ctx: AuthorizationContext,
    eventId: string
  ): Promise<EventRow | null> {
    return this.store.findEventById(eventId);
  }

  async getEventDetail(
    ctx: AuthorizationContext,
    eventId: string
  ): Promise<EventDetailView | null> {
    const event = await this.store.findEventById(eventId);
    if (!event) {
      return null;
    }
    const program = await this.store.findProgramById(event.program_id);
    if (!program) {
      return null;
    }
    // Operators keep the existing PROGRAM_MANAGE-gated projection
    // (leaders / participant_summary / exceptions / recurrence_tag).
    const operatorScoped = await this.authorizer.can(
      ctx,
      CAPABILITY.PROGRAM_MANAGE,
      { programId: program.program_id }
    );
    if (operatorScoped) {
      await this.requireModuleEnabled(program.department_id, MODULE_KEY.EVENTS);
      const [leaders, participant_summary, rules] = await Promise.all([
        this.store.listProgramIdentityAssignments(program.program_id),
        this.store.getEventParticipantSummary(
          event.event_id,
          program.program_id
        ),
        this.store.listScheduleRules(program.program_id),
      ]);
      const exceptions =
        rules.length === 0
          ? []
          : await this.store.listScheduleExceptions(
              rules.map((r) => r.rule_id)
            );
      const exception =
        (exceptionForEvent(
          event,
          rules,
          exceptions
        ) as ScheduleExceptionRow | null) ?? null;
      const recurrence_tag = recurrenceTagForEvent(event, rules);
      const decoratedEvent: EventRow = {
        ...event,
        exception,
        recurrence_tag,
        has_attendance: participant_summary.checked_in > 0,
      };
      return {
        event: { ...decoratedEvent, program_name: program.name },
        leaders,
        participant_summary,
      };
    }
    // Participant projection: an enrolled member may read any Available
    // event on their enrolled program (past, present, future, or cancelled).
    // Cancellation remains visible as history, but the participant projection
    // never includes a credential and therefore cannot create attendance.
    if ((event.availability ?? "Active") !== "Active") {
      return null;
    }
    const enrolled = await this.store.hasActiveEnrollment(
      program.program_id,
      ctx.actorUserId
    );
    if (!enrolled) {
      return null;
    }
    const participantEvent: ProgramEvent = {
      event_id: event.event_id,
      program_id: event.program_id,
      program_name: program.name,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      status: event.status,
      availability: event.availability ?? "Active",
      source: event.source,
      name: event.name,
      event_type: event.event_type,
      location: event.location,
      manual_check_in_code: null,
      check_in_window_opens_at: event.check_in_window_opens_at,
      check_in_window_closes_at: event.check_in_window_closes_at,
      cancel_reason: event.cancel_reason,
      created_at: event.created_at,
      updated_at: event.updated_at,
    };
    return {
      event: participantEvent,
      leaders: [],
      participant_summary: { active_enrollments: 0, checked_in: 0 },
    };
  }

  async createScheduleRule(
    ctx: AuthorizationContext,
    programId: string,
    cmd: CreateScheduleRuleCommand,
    correlationId: string | null,
    idempotencyKey: string | null = null
  ): Promise<ScheduleRuleCreationResult> {
    const program = await this.requireProgramFor(
      ctx,
      programId,
      CAPABILITY.PROGRAM_MANAGE
    );
    await this.requireModuleEnabled(program.department_id, MODULE_KEY.EVENTS);
    if (program.behavior_type !== "Recurring") {
      throw new ScheduleRuleNotApplicableError(programId);
    }
    const now = new Date().toISOString();
    const effectiveStartDate = cmd.effective_start_date ?? hkTodayWallDate();
    const effectiveEndDate = cmd.effective_end_date ?? null;
    const requestFingerprint = JSON.stringify({
      program_id: programId,
      recurrence: cmd.recurrence,
      day_of_week: cmd.day_of_week,
      month_day: cmd.month_day,
      start_time: cmd.start_time,
      end_time: cmd.end_time,
      location: cmd.location ?? null,
      effective_start_date: effectiveStartDate,
      effective_end_date: effectiveEndDate,
    });
    let result: ScheduleRuleCreationResult;
    try {
      result = await this.store.createScheduleRule({
        program_id: programId,
        ...cmd,
        created_by: ctx.actorUserId,
        created_at: now,
        updated_by: ctx.actorUserId,
        updated_at: now,
        effective_start_date: effectiveStartDate,
        effective_end_date: effectiveEndDate,
        idempotency_key: idempotencyKey,
        request_fingerprint: requestFingerprint,
      });
    } catch (error) {
      if (error instanceof ScheduleRuleIdempotencyConflictError) {
        await this.audit(
          ctx,
          "SCHEDULE_RULE_CREATE",
          "schedule_rule",
          programId,
          "CONFLICT",
          null,
          { idempotency_key: idempotencyKey },
          correlationId
        );
      }
      throw error;
    }
    await this.audit(
      ctx,
      "SCHEDULE_RULE_CREATE",
      "schedule_rule",
      result.rule.rule_id,
      result.idempotent ? "DUPLICATE" : "SUCCESS",
      null,
      result.rule,
      correlationId
    );
    return result;
  }

  async updateScheduleRule(
    ctx: AuthorizationContext,
    ruleId: string,
    cmd: UpdateScheduleRuleCommand,
    correlationId: string | null
  ): Promise<ScheduleRuleRow> {
    const rule = await this.store.findScheduleRule(ruleId);
    if (!rule) {
      throw new AuthorizationDeniedError(CAPABILITY.PROGRAM_MANAGE);
    }
    const program = await this.requireProgramFor(
      ctx,
      rule.program_id,
      CAPABILITY.PROGRAM_MANAGE
    );
    await this.requireModuleEnabled(program.department_id, MODULE_KEY.EVENTS);
    if (rule.retired_at !== undefined && rule.retired_at !== null) {
      throw new ScheduleRuleRetiredError(ruleId);
    }
    const row = await this.store.updateScheduleRule(ruleId, {
      ...cmd,
      updated_by: ctx.actorUserId,
      updated_at: new Date().toISOString(),
    });
    await this.audit(
      ctx,
      "SCHEDULE_RULE_UPDATE",
      "schedule_rule",
      ruleId,
      "SUCCESS",
      rule,
      row,
      correlationId
    );
    return row;
  }

  async retireScheduleRule(
    ctx: AuthorizationContext,
    ruleId: string,
    correlationId: string | null
  ): Promise<ScheduleRuleRow> {
    const rule = await this.store.findScheduleRule(ruleId);
    if (!rule) {
      throw new AuthorizationDeniedError(CAPABILITY.PROGRAM_MANAGE);
    }
    const program = await this.requireProgramFor(
      ctx,
      rule.program_id,
      CAPABILITY.PROGRAM_MANAGE
    );
    await this.requireModuleEnabled(program.department_id, MODULE_KEY.EVENTS);
    if (rule.retired_at !== undefined && rule.retired_at !== null) {
      await this.audit(
        ctx,
        "SCHEDULE_RULE_RETIRE",
        "schedule_rule",
        ruleId,
        "DUPLICATE",
        rule,
        { ...rule, reason: "already_retired" },
        correlationId
      );
      return rule;
    }
    const retired = await this.store.retireScheduleRule(
      ruleId,
      ctx.actorUserId,
      new Date().toISOString()
    );
    await this.audit(
      ctx,
      "SCHEDULE_RULE_RETIRE",
      "schedule_rule",
      ruleId,
      "SUCCESS",
      rule,
      retired,
      correlationId
    );
    return retired;
  }

  async createScheduleException(
    ctx: AuthorizationContext,
    ruleId: string,
    cmd: CreateScheduleExceptionCommand,
    correlationId: string | null
  ): Promise<ScheduleExceptionRow> {
    const rule = await this.store.findScheduleRule(ruleId);
    if (!rule) {
      throw new AuthorizationDeniedError(CAPABILITY.PROGRAM_MANAGE);
    }
    const program = await this.requireProgramFor(
      ctx,
      rule.program_id,
      CAPABILITY.PROGRAM_MANAGE
    );
    await this.requireModuleEnabled(program.department_id, MODULE_KEY.EVENTS);
    if (rule.retired_at !== undefined && rule.retired_at !== null) {
      throw new ScheduleRuleRetiredError(ruleId);
    }
    const existing = (await this.store.listScheduleExceptions([ruleId])).find(
      (e) => e.override_date === cmd.override_date
    );
    if (existing) {
      await this.audit(
        ctx,
        "SCHEDULE_EXCEPTION_CREATE",
        "schedule_exception",
        existing.exception_id,
        "CONFLICT",
        null,
        { rule_id: ruleId, override_date: cmd.override_date },
        correlationId
      );
      throw new DuplicateScheduleExceptionError(ruleId, cmd.override_date);
    }
    let row: ScheduleExceptionRow;
    try {
      row = await this.store.createScheduleException({
        rule_id: ruleId,
        ...cmd,
        created_by: ctx.actorUserId,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      // ponytail: the (rule_id, override_date) unique index is the race
      // guard; on constraint violation the exception already exists.
      if (
        (await this.store.listScheduleExceptions([ruleId])).some(
          (e) => e.override_date === cmd.override_date
        )
      ) {
        throw new DuplicateScheduleExceptionError(ruleId, cmd.override_date);
      }
      throw error;
    }
    await this.audit(
      ctx,
      "SCHEDULE_EXCEPTION_CREATE",
      "schedule_exception",
      row.exception_id,
      "SUCCESS",
      null,
      row,
      correlationId
    );
    return row;
  }

  async deleteScheduleException(
    ctx: AuthorizationContext,
    exceptionId: string,
    correlationId: string | null
  ): Promise<void> {
    const row = await this.store.findScheduleException(exceptionId);
    if (!row) {
      throw new AuthorizationDeniedError(CAPABILITY.PROGRAM_MANAGE);
    }
    const rule = await this.store.findScheduleRule(row.rule_id);
    if (!rule) {
      throw new AuthorizationDeniedError(CAPABILITY.PROGRAM_MANAGE);
    }
    const program = await this.requireProgramFor(
      ctx,
      rule.program_id,
      CAPABILITY.PROGRAM_MANAGE
    );
    await this.requireModuleEnabled(program.department_id, MODULE_KEY.EVENTS);
    if (rule.retired_at !== undefined && rule.retired_at !== null) {
      throw new ScheduleRuleRetiredError(rule.rule_id);
    }
    await this.store.deleteScheduleException(exceptionId);
    await this.audit(
      ctx,
      "SCHEDULE_EXCEPTION_DELETE",
      "schedule_exception",
      exceptionId,
      "SUCCESS",
      row,
      null,
      correlationId
    );
  }

  /**
   * Deterministic SHA-256 hex over the exact plan inputs (sorted so rule and
   * exception ordering never changes the identity). The hash freezes the
   * rules/exceptions/horizon/from-date the plan was computed from, including
   * their authoritative revisions, which is what generation re-checks to
   * reject stale plans before any write.
   */
  private async computePlanHash(
    rules: ScheduleRuleRow[],
    exceptions: ScheduleExceptionRow[],
    horizonDays: number,
    fromDate: string
  ): Promise<string> {
    const canonical = JSON.stringify({
      horizon_days: horizonDays,
      from_date: fromDate,
      rules: [...rules]
        .sort((a, b) => a.rule_id.localeCompare(b.rule_id))
        .map((rule) => ({
          rule_id: rule.rule_id,
          recurrence: rule.recurrence,
          day_of_week: rule.day_of_week,
          month_day: rule.month_day,
          start_time: rule.start_time,
          end_time: rule.end_time,
          location: rule.location ?? null,
          effective_start_date: rule.effective_start_date ?? null,
          effective_end_date: rule.effective_end_date ?? null,
          retired_at: rule.retired_at ?? null,
          version: rule.updated_at,
        })),
      exceptions: [...exceptions]
        .sort((a, b) =>
          a.rule_id === b.rule_id
            ? a.override_date.localeCompare(b.override_date)
            : a.rule_id.localeCompare(b.rule_id)
        )
        .map((exception) => ({
          exception_id: exception.exception_id,
          rule_id: exception.rule_id,
          override_date: exception.override_date,
          action: exception.action,
          new_start_time: exception.new_start_time,
          new_end_time: exception.new_end_time,
          new_date: exception.new_date ?? null,
          version: exception.created_at,
        })),
    });
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(canonical)
    );
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * EVT-02 (#252): preview the exact future occurrence set for the current
   * rules. Server-owned and durable; writes no events and no generation
   * records. Identical inputs resolve to the same plan identity; changed
   * inputs produce a new superseding plan. Zero rules is an explicit failed
   * outcome with a durable FAILED audit record.
   */
  async previewEvents(
    ctx: AuthorizationContext,
    programId: string,
    horizonDays: number,
    correlationId: string | null,
    range?: { fromDate: string; untilDate: string }
  ): Promise<{
    plan: PreviewPlanView;
    occurrences: PreviewOccurrenceRow[];
  }> {
    const program = await this.requireProgramFor(
      ctx,
      programId,
      CAPABILITY.PROGRAM_MANAGE
    );
    await this.requireModuleEnabled(program.department_id, MODULE_KEY.EVENTS);
    if (program.behavior_type !== "Recurring") {
      throw new ScheduleRuleNotApplicableError(programId);
    }
    const rules = await this.store.listScheduleRules(programId);
    if (rules.length === 0) {
      await this.audit(
        ctx,
        "EVENT_PREVIEW",
        "event",
        programId,
        "FAILED",
        null,
        { rule_count: 0 },
        correlationId
      );
      throw new NoScheduleRulesError();
    }
    const exceptions = await this.store.listScheduleExceptions(
      rules.map((rule) => rule.rule_id)
    );
    const scheduleVersion = await this.store.findScheduleVersion(programId);
    const fromDate = range?.fromDate ?? hkTodayWallDate();
    const untilDate =
      range?.untilDate ?? addWallDays(fromDate, horizonDays - 1);
    const resolvedHorizonDays = range
      ? wallDaySpan(fromDate, untilDate)
      : horizonDays;
    const candidates = this.materializeOccurrences(
      rules,
      fromDate,
      resolvedHorizonDays,
      exceptions
    );
    // Preview-time duplicate signal: mark occurrences whose starts_at is
    // already claimed by a live event row, or by an earlier candidate in
    // this same plan (intra-plan collision), so the operator sees skipped
    // duplicates BEFORE any write. This is purely advisory: generation's
    // own atomic revision guard + INSERT OR IGNORE check in
    // recordGeneratedOccurrence stays the authoritative write-time guard and
    // continues to run regardless of this advisory flag.
    await this.markPreviewDuplicates(programId, candidates);
    const planHash = await this.computePlanHash(
      rules,
      exceptions,
      resolvedHorizonDays,
      fromDate
    );
    const now = new Date().toISOString();
    // Deterministic plan identity: the same (program, hash) always maps to
    // the same plan_id, so re-previewing identical inputs resolves to the
    // same durable plan row and the plan + its occurrence rows commit in
    // one atomic batch.
    const plan: PreviewPlanRow = {
      plan_id: `pln_${programId}_${planHash.slice(0, 24)}`,
      program_id: programId,
      plan_hash: planHash,
      horizon_days: resolvedHorizonDays,
      from_date: fromDate,
      to_date: untilDate,
      rule_count: rules.length,
      created_by: ctx.actorUserId,
      created_at: now,
      schedule_version: scheduleVersion,
      reviewed_at: Date.now(),
    };
    const occurrences = candidates.map((candidate) =>
      this.previewOccurrenceRow(plan.plan_id, candidate)
    );
    const persisted = await this.store.replacePreviewPlan(plan, occurrences);
    // The persisted plan is authoritative (identical inputs resolve to the
    // existing plan); read its exact rows back so plan identity and
    // occurrence identities always agree.
    const storedOccurrences = await this.store.listPreviewOccurrences(
      persisted.plan_id
    );
    await this.audit(
      ctx,
      "EVENT_PREVIEW",
      "event",
      programId,
      "SUCCESS",
      null,
      {
        plan_id: persisted.plan_id,
        plan_hash: persisted.plan_hash,
        horizon_days: persisted.horizon_days,
        rule_count: persisted.rule_count,
        occurrence_count: storedOccurrences.length,
      },
      correlationId
    );
    return { plan: previewPlanView(persisted), occurrences: storedOccurrences };
  }

  /**
   * EVT-02 (#252): generate events from a current preview plan.
   *
   * The plan must be current (hash matches the live schedule and no newer
   * plan supersedes it) before any write; otherwise a deterministic
   * STALE_PLAN failure leaves the event directory untouched. Generation is
   * idempotent and resumable: one durable run per plan, one attempt row per
   * occurrence, and the events (program_id, starts_at) unique index, so
   * repeat, concurrent, and post-partial-failure retries never duplicate an
   * already-created event and expose deterministic counts.
   */
  async generateEvents(
    ctx: AuthorizationContext,
    programId: string,
    planId: string,
    correlationId: string | null
  ): Promise<GenerateResult> {
    const program = await this.requireProgramFor(
      ctx,
      programId,
      CAPABILITY.PROGRAM_MANAGE
    );
    await this.requireModuleEnabled(program.department_id, MODULE_KEY.EVENTS);
    if (program.behavior_type !== "Recurring") {
      throw new ScheduleRuleNotApplicableError(programId);
    }
    const plan = await this.store.findPreviewPlan(planId);
    if (!plan || plan.program_id !== programId) {
      throw new PreviewPlanNotFoundError(planId);
    }
    const isCurrentPlan = async (): Promise<boolean> => {
      const rules = await this.store.listScheduleRules(programId);
      const exceptions = await this.store.listScheduleExceptions(
        rules.map((rule) => rule.rule_id)
      );
      const currentHash = await this.computePlanHash(
        rules,
        exceptions,
        plan.horizon_days,
        plan.from_date
      );
      const currentScheduleVersion =
        await this.store.findScheduleVersion(programId);
      const latest = await this.store.findLatestPreviewPlan(programId);
      const superseded =
        latest !== null &&
        latest.plan_id !== plan.plan_id &&
        (latest.reviewed_at > plan.reviewed_at ||
          (latest.reviewed_at === plan.reviewed_at &&
            latest.plan_id > plan.plan_id));
      return (
        currentHash === plan.plan_hash &&
        plan.schedule_version !== null &&
        currentScheduleVersion === plan.schedule_version &&
        !superseded
      );
    };
    const rejectStalePlan = async (): Promise<never> => {
      // Business-state conflict (schedule changed / plan superseded), not a
      // system failure: ADR-0023/0027 reserve FAILED for system-level
      // failures, so this audits CONFLICT.
      await this.audit(
        ctx,
        "EVENT_GENERATE",
        "event",
        programId,
        "CONFLICT",
        null,
        { plan_id: planId, reason: "stale_plan" },
        correlationId
      );
      throw new StalePreviewPlanError(planId, programId);
    };
    // Reject stale/ambiguous plans before writes: the live schedule must
    // still match the plan's frozen inputs, and no newer preview may have
    // superseded this plan.
    if (!(await isCurrentPlan())) {
      await rejectStalePlan();
    }
    const scheduleVersion = plan.schedule_version;
    if (scheduleVersion === null) {
      await rejectStalePlan();
      throw new StalePreviewPlanError(planId, programId);
    }
    const occurrences = await this.store.listPreviewOccurrences(planId);
    if (occurrences.length === 0) {
      await this.audit(
        ctx,
        "EVENT_GENERATE",
        "event",
        programId,
        "CONFLICT",
        null,
        { plan_id: planId, reason: "empty_plan" },
        correlationId
      );
      throw new EmptyPreviewPlanError();
    }
    const now = new Date().toISOString();
    const { run, created: runCreated } = await this.store.createGenerationRun({
      run_id: crypto.randomUUID(),
      program_id: programId,
      plan_id: planId,
      started_at: now,
      created_by: ctx.actorUserId,
      correlation_id: correlationId,
    });
    const resumed = !runCreated;
    if (run.status === "completed") {
      if (!(await isCurrentPlan())) {
        await rejectStalePlan();
      }
      // Deterministic repeat (ADR-0027): the plan was already fully
      // generated, so this request created nothing and skipped every
      // occurrence; the repeat still emits its own EVENT_GENERATE audit row
      // with created = 0, skipped > 0.
      const skipped = occurrences.length;
      await this.audit(
        ctx,
        "EVENT_GENERATE",
        "event",
        programId,
        "SUCCESS",
        null,
        {
          run_id: run.run_id,
          plan_id: planId,
          status: "completed",
          created: 0,
          skipped,
          failed: 0,
          resumed: true,
        },
        correlationId
      );
      return this.generationResult(run, occurrences, true, {
        created: 0,
        skipped,
        failed: 0,
        createdEventIds: [],
      });
    }
    // Each occurrence gets exactly one durable attempt row; repeated and
    // concurrent requests converge on the same rows (INSERT … ON CONFLICT
    // only supersedes previously-failed rows), so the item table is the
    // single source of truth for the final counts. Failed rows are retried;
    // created/skipped rows are terminal.
    const staleDuringGeneration = await this.processGenerationOccurrences(
      run.run_id,
      programId,
      planId,
      occurrences,
      ctx.actorUserId,
      now,
      scheduleVersion,
      plan.reviewed_at
    );
    if (staleDuringGeneration || !(await isCurrentPlan())) {
      await this.markUnprocessedGenerationOccurrences(run.run_id, occurrences);
      // Settle from durable item rows before surfacing the conflict. A
      // mid-run revision may already have committed Events; returning its
      // partial result keeps the operator from mistaking committed work for
      // a failed write. The stale Plan is never retryable: the caller must
      // review a new Plan before attempting any remaining occurrences.
      await this.store.finishGenerationRun(
        run.run_id,
        new Date().toISOString()
      );
      const conflictSettled = await this.store.findGenerationRunByPlan(planId);
      if (!conflictSettled) {
        throw new WorkspaceNotFoundError("generation_run", run.run_id);
      }
      if (
        conflictSettled.status === "completed" ||
        conflictSettled.created + conflictSettled.skipped > 0
      ) {
        const settlementOutcome =
          conflictSettled.status === "completed" ? "SUCCESS" : "CONFLICT";
        await this.audit(
          ctx,
          "EVENT_GENERATE",
          "event",
          programId,
          settlementOutcome,
          null,
          {
            run_id: conflictSettled.run_id,
            plan_id: planId,
            reason: "stale_plan",
            status: conflictSettled.status,
            created: conflictSettled.created,
            skipped: conflictSettled.skipped,
            failed: conflictSettled.failed,
            requires_review: true,
          },
          correlationId
        );
        return this.generationResult(conflictSettled, occurrences, resumed, {
          requiresReview: true,
        });
      }
      await rejectStalePlan();
    }
    // Atomic compare-and-set settlement: finishGenerationRun recomputes
    // counts/status from the item table in one statement and only the first
    // finisher writes; every caller reloads the settled row, so the run and
    // every response converge deterministically.
    await this.store.finishGenerationRun(run.run_id, new Date().toISOString());
    const settled = await this.store.findGenerationRunByPlan(planId);
    if (!settled) {
      throw new WorkspaceNotFoundError("generation_run", run.run_id);
    }
    await this.audit(
      ctx,
      "EVENT_GENERATE",
      "event",
      programId,
      settled.status === "completed" ? "SUCCESS" : "FAILED",
      null,
      {
        run_id: settled.run_id,
        plan_id: planId,
        status: settled.status,
        created: settled.created,
        skipped: settled.skipped,
        failed: settled.failed,
        resumed,
      },
      correlationId
    );
    return this.generationResult(settled, occurrences, resumed);
  }

  private async generationResult(
    run: GenerationRunRow,
    occurrences: readonly PreviewOccurrenceRow[],
    resumed: boolean,
    overrides: {
      created?: number;
      skipped?: number;
      failed?: number;
      createdEventIds?: string[];
      requiresReview?: boolean;
    } | null = null
  ): Promise<GenerateResult> {
    const items = await this.store.listGenerationRunItems(run.run_id);
    const occurrenceIds = new Set(
      occurrences.map((occurrence) => occurrence.occurrence_id)
    );
    return {
      run_id: run.run_id,
      plan_id: run.plan_id,
      status: run.status,
      created: overrides?.created ?? run.created,
      skipped: overrides?.skipped ?? run.skipped,
      failed: overrides?.failed ?? run.failed,
      resumed,
      ...(overrides?.requiresReview ? { requires_review: true } : {}),
      created_event_ids:
        overrides?.createdEventIds ??
        items
          .filter(
            (item) =>
              item.outcome === "created" &&
              item.event_id !== null &&
              occurrenceIds.has(item.occurrence_id)
          )
          .map((item) => item.event_id as string),
      skipped_occurrences: items
        .filter(
          (item) =>
            item.outcome === "skipped" && occurrenceIds.has(item.occurrence_id)
        )
        .map((item) => ({
          occurrence_id: item.occurrence_id,
          starts_at: item.starts_at,
          reason:
            item.detail === "CANCEL"
              ? ("CANCEL" as const)
              : ("DUPLICATE" as const),
        })),
      unresolved_occurrences: items
        .filter(
          (item) =>
            item.outcome === "failed" && occurrenceIds.has(item.occurrence_id)
        )
        .map((item) => ({
          occurrence_id: item.occurrence_id,
          starts_at: item.starts_at,
          detail: item.detail,
        })),
    };
  }

  /**
   * Durably attempt every occurrence of a run. Attempts are independent and
   * run with bounded concurrency; each attempt row is durable, so a crash
   * mid-run leaves a resumable partial state and retries resume from the item
   * table. Failed units are retried; created/skipped rows are terminal.
   */
  private async processGenerationOccurrences(
    runId: string,
    programId: string,
    planId: string,
    occurrences: PreviewOccurrenceRow[],
    actorUserId: string,
    now: string,
    scheduleVersion: number,
    reviewedAt: number
  ): Promise<boolean> {
    const runItems = await this.store.listGenerationRunItems(runId);
    const processed = new Map(
      runItems.map((item) => [item.occurrence_id, item])
    );
    const concurrency = Math.min(8, Math.max(1, occurrences.length));
    let nextIndex = 0;
    let stale = false;
    const worker = async (): Promise<void> => {
      while (true) {
        if (stale) {
          return;
        }
        const occurrence = occurrences[nextIndex];
        nextIndex += 1;
        if (!occurrence) {
          return;
        }
        // Each attempt is an independent durable unit; the concurrency cap
        // prevents a large preview from flooding D1 while preserving retry
        // and per-occurrence provenance.
        // oxlint-disable-next-line no-await-in-loop
        const occurrenceStale = await this.attemptGenerationOccurrence(
          runId,
          programId,
          planId,
          occurrence,
          actorUserId,
          now,
          processed,
          scheduleVersion,
          reviewedAt
        );
        if (occurrenceStale) {
          stale = true;
          return;
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    return stale;
  }

  private async markUnprocessedGenerationOccurrences(
    runId: string,
    occurrences: readonly PreviewOccurrenceRow[]
  ): Promise<void> {
    const processed = new Set(
      (await this.store.listGenerationRunItems(runId)).map(
        (item) => item.occurrence_id
      )
    );
    for (const occurrence of occurrences) {
      if (processed.has(occurrence.occurrence_id)) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop
      await this.store.recordGenerationRunItem({
        item_id: `${runId}:${occurrence.occurrence_id}`,
        run_id: runId,
        occurrence_id: occurrence.occurrence_id,
        starts_at: occurrence.starts_at,
        outcome: "failed",
        event_id: null,
        detail: "STALE_PLAN",
      });
    }
  }

  private async attemptGenerationOccurrence(
    runId: string,
    programId: string,
    planId: string,
    occurrence: PreviewOccurrenceRow,
    actorUserId: string,
    now: string,
    processed: ReadonlyMap<string, GenerationRunItemRow>,
    scheduleVersion: number,
    reviewedAt: number
  ): Promise<boolean> {
    const prior = processed.get(occurrence.occurrence_id);
    if (prior && prior.outcome !== "failed") {
      return false;
    }
    try {
      const outcome = await this.store.recordGeneratedOccurrence({
        scheduleVersion,
        reviewedAt,
        planId,
        runId,
        programId,
        occurrence,
        actorUserId,
        createdAt: now,
      });
      if (outcome === "stale") {
        return true;
      }
      return false;
    } catch (error) {
      await this.store.recordGenerationRunItem({
        item_id: `${runId}:${occurrence.occurrence_id}`,
        run_id: runId,
        occurrence_id: occurrence.occurrence_id,
        starts_at: occurrence.starts_at,
        outcome: "failed",
        event_id: null,
        detail: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /** Deterministic, ordered occurrence candidates for every rule. */
  private materializeOccurrences(
    rules: ScheduleRuleRow[],
    fromDate: string,
    horizonDays: number,
    exceptions: ScheduleExceptionRow[]
  ): PreviewOccurrenceCandidate[] {
    const candidates: PreviewOccurrenceCandidate[] = [];
    for (const rule of rules) {
      candidates.push(
        ...previewOccurrencesForRule(rule, fromDate, horizonDays, exceptions)
      );
    }
    return candidates.sort(
      (a, b) =>
        a.occurs_on.localeCompare(b.occurs_on) ||
        a.starts_at.localeCompare(b.starts_at) ||
        a.rule_id.localeCompare(b.rule_id)
    );
  }

  /**
   * Mark preview candidates that generation would skip as DUPLICATE. The
   * candidates arrive sorted (occurs_on, starts_at, rule_id), so the first
   * candidate to claim a starts_at is the deterministic "earlier" one: any
   * later candidate with the same starts_at — whether already materialized
   * as an event row, or produced by another rule in this same plan — is
   * flagged DUPLICATE. CANCEL rows keep their existing marker and neither
   * claim nor release a starts_at. Pure preview-time signal; no writes.
   */
  private async markPreviewDuplicates(
    programId: string,
    candidates: PreviewOccurrenceCandidate[]
  ): Promise<void> {
    const existingEvents = await this.store.listEvents(programId);
    const existingStarts = new Set(
      existingEvents.map((event) => event.starts_at)
    );
    const acceptedStarts = new Set<string>();
    for (const candidate of candidates) {
      if (candidate.skip_reason === "CANCEL") {
        continue;
      }
      if (
        existingStarts.has(candidate.starts_at) ||
        acceptedStarts.has(candidate.starts_at)
      ) {
        candidate.skip_reason = "DUPLICATE";
      } else {
        acceptedStarts.add(candidate.starts_at);
      }
    }
  }

  /**
   * Deterministic occurrence row identity: plan + rule + HK wall date.
   * Plan-scoped so a superseding plan never collides on the same row ids.
   */
  private previewOccurrenceRow(
    planId: string,
    candidate: PreviewOccurrenceCandidate
  ): PreviewOccurrenceRow {
    return {
      occurrence_id: `${planId}:${candidate.rule_id}:${candidate.occurs_on}`,
      plan_id: planId,
      rule_id: candidate.rule_id,
      occurs_on: candidate.occurs_on,
      starts_at: candidate.starts_at,
      ends_at: candidate.ends_at,
      location: candidate.location,
      skip_reason: candidate.skip_reason,
      exception_id: candidate.exception_id,
      replacement_date: candidate.replacement_date,
    };
  }

  async createEvent(
    ctx: AuthorizationContext,
    programId: string,
    cmd: CreateEventCommand,
    correlationId: string | null
  ): Promise<EventRow> {
    if (!cmd.name?.trim()) {
      throw new EventNameRequiredError();
    }
    const program = await this.requireProgramFor(
      ctx,
      programId,
      CAPABILITY.PROGRAM_MANAGE
    );
    await this.requireModuleEnabled(program.department_id, MODULE_KEY.EVENTS);
    const existing = await this.store.findEventByStart(
      programId,
      cmd.starts_at
    );
    if (existing) {
      await this.audit(
        ctx,
        "EVENT_CREATE",
        "event",
        existing.event_id,
        "CONFLICT",
        null,
        { starts_at: cmd.starts_at },
        correlationId
      );
      throw new DuplicateEventError(cmd.starts_at);
    }
    const now = new Date().toISOString();
    const row = await this.store.createEvent({
      program_id: programId,
      starts_at: cmd.starts_at,
      ends_at: cmd.ends_at,
      status: "Active",
      availability: "Active",
      source: "MANUAL",
      name: cmd.name.trim(),
      event_type: cmd.event_type ?? null,
      location: cmd.location,
      check_in_window_opens_at: cmd.check_in_window_opens_at,
      check_in_window_closes_at: cmd.check_in_window_closes_at,
      cancel_reason: null,
      created_by: ctx.actorUserId,
      created_at: now,
      updated_by: ctx.actorUserId,
      updated_at: now,
    });
    await this.audit(
      ctx,
      "EVENT_CREATE",
      "event",
      row.event_id,
      "SUCCESS",
      null,
      row,
      correlationId
    );
    return { ...row, recurrence_tag: "無", has_attendance: false };
  }

  async listEvents(
    ctx: AuthorizationContext,
    programId: string
  ): Promise<EventRow[] | null> {
    const program = await this.store.findProgramById(programId);
    if (
      !program ||
      !(await this.isModuleEnabled(program.department_id)) ||
      !(await this.isModuleEnabled(program.department_id, MODULE_KEY.EVENTS))
    ) {
      return null;
    }
    const canManage = await this.authorizer.can(
      ctx,
      CAPABILITY.PROGRAM_MANAGE,
      {
        departmentId: program.department_id,
        programId: program.program_id,
      }
    );
    const rows = await this.store.listEvents(programId);
    const decorated =
      rows.length === 0 ? rows : await this.decorateEventsWithExceptions(rows);
    if (canManage) {
      return decorated;
    }
    if (program.discoverability === "Unlisted") {
      return null;
    }
    return decorated.filter(
      (r) => r.status === "Active" && r.availability === "Active"
    );
  }

  /**
   * Attach the schedule exception (attributed rule + HK wall date) to each
   * materialized event row, so the UI can badge 已改期/本次已取消. The
   * server contract that un-materialized future occurrences carry no state
   * until generate-time is unchanged.
   */
  private async decorateEventsWithExceptions(
    rows: EventRow[]
  ): Promise<EventRow[]> {
    const [rules, attendanceSet] = await Promise.all([
      this.store.listScheduleRules(rows[0].program_id),
      this.store.listActiveAttendanceEventIds(rows.map((r) => r.event_id)),
    ]);
    const exceptions =
      rules.length === 0
        ? []
        : await this.store.listScheduleExceptions(rules.map((r) => r.rule_id));
    return rows.map((row) => ({
      ...row,
      // The attributed exception is a read-only projection: provenance
      // columns (created_by/created_at) are not carried on this decoration
      // path, matching the client's ScheduleException shape.
      exception:
        (exceptionForEvent(
          row,
          rules,
          exceptions
        ) as ScheduleExceptionRow | null) ?? null,
      recurrence_tag: recurrenceTagForEvent(row, rules),
      has_attendance: attendanceSet.has(row.event_id),
    }));
  }
  async updateEvent(
    ctx: AuthorizationContext,
    eventId: string,
    cmd: UpdateEventCommand,
    correlationId: string | null
  ): Promise<EventRow> {
    const event = await this.store.findEventById(eventId);
    if (!event) {
      throw new AuthorizationDeniedError(CAPABILITY.PROGRAM_MANAGE);
    }
    const program = await this.requireProgramFor(
      ctx,
      event.program_id,
      CAPABILITY.PROGRAM_MANAGE
    );
    await this.requireModuleEnabled(program.department_id, MODULE_KEY.EVENTS);
    if (event.status === "Cancelled") {
      await this.audit(
        ctx,
        "EVENT_UPDATE",
        "event",
        eventId,
        "DENIED",
        event,
        null,
        correlationId,
        cmd.reason ?? null
      );
      throw new EventCancelledReadOnlyError();
    }
    const identityChanged =
      (cmd.name !== undefined && cmd.name !== event.name) ||
      (cmd.location !== undefined && cmd.location !== event.location) ||
      (cmd.event_type !== undefined && cmd.event_type !== event.event_type);
    const attemptedIdentity = {
      name: cmd.name === undefined ? event.name : cmd.name,
      location: cmd.location === undefined ? event.location : cmd.location,
      event_type:
        cmd.event_type === undefined ? event.event_type : cmd.event_type,
    };
    const activeAttendanceCount = identityChanged
      ? await this.store.countActiveAttendance(eventId)
      : 0;
    if (identityChanged && activeAttendanceCount > 0) {
      if (!cmd.reason?.trim()) {
        await this.audit(
          ctx,
          "EVENT_UPDATE",
          "event",
          eventId,
          "DENIED",
          event,
          {
            ...attemptedIdentity,
            active_attendance_count: activeAttendanceCount,
          },
          correlationId
        );
        throw new EventIdentityChangeReasonRequiredError();
      }
      if (!(await this.store.isGlobalStaffOrAdmin(ctx.actorUserId))) {
        await this.audit(
          ctx,
          "EVENT_UPDATE",
          "event",
          eventId,
          "DENIED",
          event,
          {
            ...attemptedIdentity,
            active_attendance_count: activeAttendanceCount,
          },
          correlationId,
          cmd.reason.trim()
        );
        throw new AuthorizationDeniedError(CAPABILITY.PROGRAM_MANAGE);
      }
    }
    // Identity edits remain safe after an Event starts. A schedule change is
    // a new operational Event once the original has started, has Attendance,
    // or has a durable expected-roster snapshot.
    const startsChanged =
      cmd.starts_at !== undefined && cmd.starts_at !== event.starts_at;
    const endsChanged =
      cmd.ends_at !== undefined && cmd.ends_at !== event.ends_at;
    if (startsChanged || endsChanged) {
      const started =
        Number.isFinite(Date.parse(event.starts_at)) &&
        Date.parse(event.starts_at) <= Date.now();
      const hasSnapshot = await this.store.hasAttendanceSnapshot(eventId);
      const scheduleAttendanceCount =
        await this.store.countActiveAttendance(eventId);
      if (started || hasSnapshot || scheduleAttendanceCount > 0) {
        await this.audit(
          ctx,
          "EVENT_UPDATE",
          "event",
          eventId,
          "CONFLICT",
          event,
          {
            starts_at: cmd.starts_at ?? event.starts_at,
            reason: started
              ? "event_started"
              : hasSnapshot
                ? "attendance_snapshot_exists"
                : "active_attendance_exists",
          },
          correlationId
        );
        throw new EventRescheduleBlockedError(eventId);
      }
      if (cmd.starts_at !== undefined && cmd.starts_at !== event.starts_at) {
        const requestedStart = cmd.starts_at;
        const duplicate = await this.store.findEventByStart(
          event.program_id,
          requestedStart
        );
        if (duplicate && duplicate.event_id !== event.event_id) {
          await this.audit(
            ctx,
            "EVENT_UPDATE",
            "event",
            duplicate.event_id,
            "CONFLICT",
            event,
            { starts_at: requestedStart },
            correlationId
          );
          throw new DuplicateEventError(requestedStart);
        }
      }
    }
    const updated = await this.store.updateEvent(
      eventId,
      cmd,
      ctx.actorUserId,
      new Date().toISOString()
    );
    if (!updated) {
      const current = await this.store.findEventById(eventId);
      if (current?.status === "Cancelled") {
        await this.audit(
          ctx,
          "EVENT_UPDATE",
          "event",
          eventId,
          "DENIED",
          current,
          null,
          correlationId,
          cmd.reason?.trim() ?? null
        );
        throw new EventCancelledReadOnlyError();
      }
      throw new AuthorizationDeniedError(CAPABILITY.PROGRAM_MANAGE);
    }
    await this.audit(
      ctx,
      "EVENT_UPDATE",
      "event",
      eventId,
      "SUCCESS",
      event,
      updated,
      correlationId,
      identityChanged && activeAttendanceCount > 0
        ? (cmd.reason?.trim() ?? null)
        : null
    );
    return updated;
  }

  async setEventAvailability(
    ctx: AuthorizationContext,
    eventId: string,
    cmd: SetEventAvailabilityCommand,
    correlationId: string | null
  ): Promise<EventRow> {
    const event = await this.store.findEventById(eventId);
    if (!event) {
      throw new AuthorizationDeniedError(CAPABILITY.PROGRAM_MANAGE);
    }
    const program = await this.requireProgramFor(
      ctx,
      event.program_id,
      CAPABILITY.PROGRAM_MANAGE
    );
    await this.requireModuleEnabled(program.department_id, MODULE_KEY.EVENTS);
    if (event.status === "Cancelled") {
      await this.audit(
        ctx,
        "EVENT_AVAILABILITY",
        "event",
        eventId,
        "DENIED",
        event,
        null,
        correlationId
      );
      throw new EventCancelledReadOnlyError();
    }
    if (event.availability === cmd.availability) {
      await this.audit(
        ctx,
        "EVENT_AVAILABILITY",
        "event",
        eventId,
        "DUPLICATE",
        event,
        event,
        correlationId
      );
      return event;
    }
    if (cmd.availability === "Inactive" && !cmd.confirm) {
      const summary = await this.store.getEventParticipantSummary(
        event.event_id,
        event.program_id
      );
      // EVT-01 (#251): enrollments are Program-scoped; this Event's own open
      // operations are its active check-ins and any open check-in window.
      // Deactivating a never-attended event whose window is still open still
      // closes an in-progress operation, so it requires confirmation.
      const affectedOperations = summary.checked_in;
      const now = new Date().toISOString();
      const windowOpen =
        event.check_in_window_opens_at !== null &&
        event.check_in_window_closes_at !== null &&
        now >= event.check_in_window_opens_at &&
        now <= event.check_in_window_closes_at;
      const impactCount = Math.max(affectedOperations, windowOpen ? 1 : 0);
      if (impactCount > 0) {
        await this.audit(
          ctx,
          "EVENT_AVAILABILITY",
          "event",
          eventId,
          "DENIED",
          event,
          event,
          correlationId
        );
        throw new EventAvailabilityConfirmationRequiredError(impactCount);
      }
    }
    const updated = await this.store.updateEvent(
      eventId,
      { availability: cmd.availability },
      ctx.actorUserId,
      new Date().toISOString()
    );
    if (!updated) {
      const current = await this.store.findEventById(eventId);
      if (current?.status === "Cancelled") {
        await this.audit(
          ctx,
          "EVENT_AVAILABILITY",
          "event",
          eventId,
          "DENIED",
          current,
          null,
          correlationId
        );
        throw new EventCancelledReadOnlyError();
      }
      throw new AuthorizationDeniedError(CAPABILITY.PROGRAM_MANAGE);
    }
    await this.audit(
      ctx,
      "EVENT_AVAILABILITY",
      "event",
      eventId,
      "SUCCESS",
      event,
      updated,
      correlationId
    );
    return updated;
  }

  async cancelEvent(
    ctx: AuthorizationContext,
    eventId: string,
    cmd: CancelEventCommand,
    correlationId: string | null
  ): Promise<EventRow> {
    const event = await this.store.findEventById(eventId);
    if (!event) {
      throw new AuthorizationDeniedError(CAPABILITY.PROGRAM_MANAGE);
    }
    const program = await this.requireProgramFor(
      ctx,
      event.program_id,
      CAPABILITY.PROGRAM_MANAGE
    );
    await this.requireModuleEnabled(program.department_id, MODULE_KEY.EVENTS);
    // Cancellation is blocked while any attendance row remains Active.
    const activeAttendanceCount =
      await this.store.countActiveAttendance(eventId);
    if (activeAttendanceCount > 0) {
      await this.audit(
        ctx,
        "EVENT_CANCEL",
        "event",
        eventId,
        "CONFLICT",
        event,
        {
          reason: "active_attendance",
          active_attendance_count: activeAttendanceCount,
        },
        correlationId
      );
      throw new EventCancellationBlockedError(activeAttendanceCount);
    }
    const updated = await this.store.cancelEvent(
      eventId,
      cmd.reason ?? null,
      ctx.actorUserId,
      new Date().toISOString()
    );
    if (!updated) {
      const activeAttendanceAfterRace =
        event.status === "Active"
          ? await this.store.countActiveAttendance(eventId)
          : 0;
      if (activeAttendanceAfterRace > 0) {
        await this.audit(
          ctx,
          "EVENT_CANCEL",
          "event",
          eventId,
          "CONFLICT",
          event,
          {
            reason: "active_attendance",
            active_attendance_count: activeAttendanceAfterRace,
          },
          correlationId
        );
        throw new EventCancellationBlockedError(activeAttendanceAfterRace);
      }
      await this.audit(
        ctx,
        "EVENT_CANCEL",
        "event",
        eventId,
        "DUPLICATE",
        null,
        { ...event, reason: "already_cancelled" },
        correlationId
      );
      return event;
    }
    await this.audit(
      ctx,
      "EVENT_CANCEL",
      "event",
      eventId,
      "SUCCESS",
      event,
      updated,
      correlationId
    );
    return updated;
  }

  getEnrollmentRequest(
    _ctx: AuthorizationContext,
    requestId: string
  ): Promise<EnrollmentRequestRow | null> {
    return this.store.findEnrollmentRequestById(requestId);
  }

  searchActiveMembers(
    query: string,
    limit: number,
    programId?: string
  ): Promise<MemberOptionRow[]> {
    return this.store.searchActiveMembers(query, limit, programId);
  }

  /**
   * GET /api/v1/programs/members — Member Directory search (Spec 087
   * US 13-15 / ticket 087-04 #321).
   *
   * Global identity assignments resolve church-wide. Scoped assignments
   * resolve only over members with an Active enrollment in one of the actor's
   * exact Department scopes. Anyone else is denied and no unrelated member
   * data is disclosed.
   */
  async searchManagementMembers(
    ctx: AuthorizationContext,
    query: string,
    limit: number
  ): Promise<ManagementMemberView[]> {
    let departmentIds: readonly string[] | undefined;
    if (!(await this.authorizer.can(ctx, CAPABILITY.DEPARTMENT_MANAGE, null))) {
      departmentIds = await this.store.listManagedDepartmentIds(
        ctx.actorUserId
      );
      if (departmentIds.length === 0) {
        throw new AuthorizationDeniedError(CAPABILITY.DEPARTMENT_MANAGE);
      }
    }
    const rows = await this.store.searchManagementMembers(
      query,
      limit,
      departmentIds
    );
    const members = new Map<string, ManagementMemberView>();
    for (const row of rows) {
      let member = members.get(row.user_id);
      if (!member) {
        member = {
          userId: row.user_id,
          name: row.name,
          phone: row.phone,
          identities: [],
          status: row.account_status,
          departments: [],
        };
        members.set(row.user_id, member);
      }
      if (
        row.department_id !== null &&
        row.department_name !== null &&
        !member.departments.some(({ id }) => id === row.department_id)
      ) {
        member.departments.push({
          id: row.department_id,
          name: row.department_name,
        });
      }
      if (
        row.identity_id !== null &&
        row.identity_label !== null &&
        row.identity_stable_key !== null &&
        row.identity_scope_kind !== null &&
        !member.identities.some(({ id }) => id === row.identity_id)
      ) {
        member.identities.push({
          id: row.identity_id,
          label: row.identity_label,
          stableKey: row.identity_stable_key,
          scopeKind: row.identity_scope_kind,
          scopeId: row.identity_scope_id,
        });
      }
    }
    return [...members.values()];
  }

  async searchAccountDirectory(
    ctx: AuthorizationContext,
    query: string,
    limit: number,
    filters: AccountDirectorySearchFilters = {},
    offset = 0
  ): Promise<AccountDirectoryView> {
    await this.ensure(ctx, CAPABILITY.ACCOUNT_DIRECTORY_READ);
    const [rows, summary, canOpenAccountAccess] = await Promise.all([
      this.store.searchAccountDirectory(query, limit + 1, filters, offset),
      this.store.countAccountDirectory(query, filters),
      this.canOpenAccountAccess(ctx),
    ]);
    const accounts = new Map<string, AccountDirectoryMember>();
    for (const row of rows) {
      let account = accounts.get(row.user_id);
      if (!account) {
        account = {
          userId: row.user_id,
          name: row.name,
          username: row.username,
          phone: row.phone,
          identities: [],
          status: row.account_status,
          canOpenAccess:
            canOpenAccountAccess &&
            row.is_admin !== 1 &&
            row.user_id !== ctx.actorUserId &&
            row.account_status === "Active",
          departments: [],
        };
        accounts.set(row.user_id, account);
      }
      if (
        row.department_id !== null &&
        row.department_name !== null &&
        !account.departments.some(({ id }) => id === row.department_id)
      ) {
        account.departments.push({
          id: row.department_id,
          name: row.department_name,
        });
      }
      if (
        row.identity_id !== null &&
        row.identity_label !== null &&
        row.identity_stable_key !== null &&
        row.identity_scope_kind !== null &&
        !account.identities.some(({ id }) => id === row.identity_id)
      ) {
        account.identities.push({
          id: row.identity_id,
          label: row.identity_label,
          stableKey: row.identity_stable_key,
          scopeKind: row.identity_scope_kind,
          scopeId: row.identity_scope_id,
        });
      }
    }
    const page = [...accounts.values()];
    const hasNextPage = page.length > limit;
    return {
      accounts: page.slice(0, limit),
      nextCursor: hasNextPage ? String(offset + limit) : null,
      summary,
    };
  }

  async getAccountDirectoryDetail(
    ctx: AuthorizationContext,
    userId: string
  ): Promise<AccountDirectoryMember> {
    await this.ensure(ctx, CAPABILITY.ACCOUNT_DIRECTORY_READ);
    const rows = await this.store.getAccountDirectoryAccount(userId);
    const first = rows[0];
    if (!first) {
      throw new WorkspaceNotFoundError("account", userId);
    }
    const departments = new Map<string, { id: string; name: string }>();
    const identities = new Map<string, ManagementMemberIdentity>();
    for (const row of rows) {
      if (row.department_id !== null && row.department_name !== null) {
        departments.set(row.department_id, {
          id: row.department_id,
          name: row.department_name,
        });
      }
      if (
        row.identity_id !== null &&
        row.identity_label !== null &&
        row.identity_stable_key !== null &&
        row.identity_scope_kind !== null
      ) {
        identities.set(row.identity_id, {
          id: row.identity_id,
          label: row.identity_label,
          stableKey: row.identity_stable_key,
          scopeKind: row.identity_scope_kind,
          scopeId: row.identity_scope_id,
        });
      }
    }
    return {
      userId: first.user_id,
      name: first.name,
      username: first.username,
      phone: first.phone,
      identities: [...identities.values()],
      status: first.account_status,
      canOpenAccess:
        (await this.canOpenAccountAccess(ctx)) &&
        first.is_admin !== 1 &&
        first.user_id !== ctx.actorUserId &&
        first.account_status === "Active",
      departments: [...departments.values()],
    };
  }

  getEnrollment(
    _ctx: AuthorizationContext,
    enrollmentId: string
  ): Promise<EnrollmentRow | null> {
    return this.store.findEnrollmentById(enrollmentId);
  }

  async submitEnrollmentRequest(
    ctx: AuthorizationContext,
    programId: string,
    correlationId: string | null
  ): Promise<EnrollmentRequestRow> {
    const program = await this.requireProgramFor(
      ctx,
      programId,
      CAPABILITY.PROGRAM_ENROLL
    );
    await this.requireModuleEnabled(
      program.department_id,
      MODULE_KEY.ENROLLMENT
    );
    if (program.lifecycle !== "Active") {
      throw new AuthorizationDeniedError(CAPABILITY.PROGRAM_ENROLL);
    }
    if (program.enrollment_mode !== "MemberRequest") {
      throw new EnrollmentNotAllowedError(programId, "MemberRequest");
    }
    if (await this.store.hasActiveEnrollment(programId, ctx.actorUserId)) {
      await this.audit(
        ctx,
        "ENROLLMENT_REQUEST_CREATE",
        "enrollment_request",
        programId,
        "DUPLICATE",
        null,
        { member_user_id: ctx.actorUserId, reason: "active_enrollment_exists" },
        correlationId
      );
      throw new DuplicateEnrollmentError(programId, ctx.actorUserId);
    }
    if (
      await this.store.findPendingRequestByMember(programId, ctx.actorUserId)
    ) {
      await this.audit(
        ctx,
        "ENROLLMENT_REQUEST_CREATE",
        "enrollment_request",
        programId,
        "DUPLICATE",
        null,
        { member_user_id: ctx.actorUserId, reason: "pending_request_exists" },
        correlationId
      );
      throw new DuplicateEnrollmentError(programId, ctx.actorUserId);
    }
    const now = new Date().toISOString();
    let row: EnrollmentRequestRow;
    try {
      row = await this.store.createEnrollmentRequest({
        request_id: crypto.randomUUID(),
        program_id: programId,
        member_user_id: ctx.actorUserId,
        status: "Pending",
        submitted_at: now,
        request_version: 1,
      });
    } catch (error) {
      if (!isPendingEnrollmentConstraint(error)) {
        throw error;
      }
      await this.audit(
        ctx,
        "ENROLLMENT_REQUEST_CREATE",
        "enrollment_request",
        programId,
        "DUPLICATE",
        null,
        { member_user_id: ctx.actorUserId, reason: "pending_request_race" },
        correlationId
      );
      throw new DuplicateEnrollmentError(programId, ctx.actorUserId);
    }
    await this.audit(
      ctx,
      "ENROLLMENT_REQUEST_CREATE",
      "enrollment_request",
      row.request_id,
      "SUCCESS",
      null,
      row,
      correlationId
    );
    return row;
  }

  async listEnrollmentRequests(
    ctx: AuthorizationContext,
    programId: string
  ): Promise<EnrollmentRequestRow[] | null> {
    const program = await this.store.findProgramById(programId);
    if (
      !program ||
      !(await this.isModuleEnabled(program.department_id)) ||
      !(await this.isModuleEnabled(
        program.department_id,
        MODULE_KEY.ENROLLMENT
      ))
    ) {
      return null;
    }
    const canManage = await this.authorizer.can(
      ctx,
      CAPABILITY.PROGRAM_MANAGE,
      {
        departmentId: program.department_id,
        programId: program.program_id,
      }
    );
    const rows = await this.store.listEnrollmentRequests(programId);
    if (canManage) {
      return rows;
    }
    if (program.discoverability === "Unlisted") {
      return null;
    }
    await this.ensure(ctx, CAPABILITY.PROGRAM_ENROLL, {
      departmentId: program.department_id,
      programId: program.program_id,
    });
    return rows.filter((r) => r.member_user_id === ctx.actorUserId);
  }
  async listEnrollmentSnapshot(
    ctx: AuthorizationContext,
    programId: string
  ): Promise<{
    requests: EnrollmentRequestRow[];
    enrollments: EnrollmentRow[];
  } | null> {
    const program = await this.store.findProgramById(programId);
    if (
      !program ||
      !(await this.isModuleEnabled(program.department_id)) ||
      !(await this.isModuleEnabled(
        program.department_id,
        MODULE_KEY.ENROLLMENT
      ))
    ) {
      return null;
    }
    const canManage = await this.authorizer.can(
      ctx,
      CAPABILITY.PROGRAM_MANAGE,
      {
        departmentId: program.department_id,
        programId: program.program_id,
      }
    );
    const snapshot = await this.store.listEnrollmentSnapshot(programId);
    if (canManage) {
      return snapshot;
    }
    if (program.discoverability === "Unlisted") {
      return null;
    }
    await this.ensure(ctx, CAPABILITY.PROGRAM_ENROLL, {
      departmentId: program.department_id,
      programId: program.program_id,
    });
    return {
      requests: snapshot.requests.filter(
        (request) => request.member_user_id === ctx.actorUserId
      ),
      enrollments: snapshot.enrollments.filter(
        (enrollment) => enrollment.member_user_id === ctx.actorUserId
      ),
    };
  }

  private async requireApprovalRunProgram(
    ctx: AuthorizationContext,
    programId: string
  ): Promise<ProgramRow> {
    const program = await this.requireProgramFor(
      ctx,
      programId,
      CAPABILITY.PROGRAM_MANAGE
    );
    await this.requireModuleEnabled(
      program.department_id,
      MODULE_KEY.ENROLLMENT
    );
    return program;
  }

  private async findOwnedApprovalRun(
    ctx: AuthorizationContext,
    programId: string,
    runId: string
  ): Promise<EnrollmentApprovalRunRow | null> {
    const row = await this.store.findEnrollmentApprovalRun(runId);
    if (
      !row ||
      row.actor_user_id !== ctx.actorUserId ||
      row.program_id !== programId
    ) {
      return null;
    }
    return row;
  }

  private async persistApprovalRun(
    current: EnrollmentApprovalRunRow,
    next: EnrollmentApprovalRun
  ): Promise<EnrollmentApprovalRunRow> {
    const currentByRequestId = new Map(
      current.items.map((item) => [item.request_id, item])
    );
    for (const item of next.items) {
      const previous = currentByRequestId.get(item.request_id);
      if (!previous) {
        continue;
      }
      const changed =
        previous.status !== item.status ||
        previous.retryable !== item.retryable ||
        previous.enrollment_id !== item.enrollment_id ||
        previous.error_code !== item.error_code ||
        previous.detail !== item.detail ||
        previous.started_at !== item.started_at ||
        previous.settled_at !== item.settled_at;
      if (!changed) {
        continue;
      }
      // oxlint-disable-next-line eslint/no-await-in-loop -- each CAS settles before the run status is updated or the next item is touched.
      const saved = await this.store.updateEnrollmentApprovalRunItem(
        current.run_id,
        item.request_id,
        item,
        previous.status
      );
      if (!saved) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- reload the concurrent winner before returning the run projection.
        const latest = await this.store.findEnrollmentApprovalRun(
          current.run_id
        );
        return latest ?? current;
      }
    }
    if (
      current.status !== next.status ||
      current.finished_at !== next.finished_at ||
      current.cancelled_at !== next.cancelled_at
    ) {
      // ponytail: only an active row may become terminal; a concurrent cancel
      // must not be overwritten by a stale in-flight approval settle.
      const runUpdated = await this.store.updateEnrollmentApprovalRun(next);
      if (!runUpdated) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- reload the terminal winner before returning the run projection.
        const latest = await this.store.findEnrollmentApprovalRun(
          current.run_id
        );
        return latest ?? current;
      }
    }
    const latest = await this.store.findEnrollmentApprovalRun(current.run_id);
    return latest ?? { ...current, ...next };
  }

  private async reconcileApprovalRunRow(
    ctx: AuthorizationContext,
    row: EnrollmentApprovalRunRow,
    correlationId: string | null
  ): Promise<EnrollmentApprovalRunRow> {
    const current = approvalRunView(row);
    const authorityEntries = await Promise.all(
      current.items
        .filter(
          (item) =>
            item.status === "in_flight" || item.status === "outcome_unknown"
        )
        .map(
          async (item) =>
            [
              item.request_id,
              await this.store.findEnrollmentApprovalAuthority(
                item.program_id,
                item.request_id,
                item.member_user_id,
                item.idempotency_key
              ),
            ] as const
        )
    );
    const authorityByRequestId = new Map<
      string,
      EnrollmentApprovalRunAuthority
    >(
      authorityEntries.filter(
        (entry): entry is readonly [string, EnrollmentApprovalRunAuthority] =>
          entry[1] !== null
      )
    );
    const next = reconcileEnrollmentApprovalRun(current, authorityByRequestId);
    const persisted = await this.persistApprovalRun(row, next);
    if (
      persisted.status !== row.status ||
      persisted.items.some(
        (item, index) => item.status !== row.items[index]?.status
      )
    ) {
      await this.audit(
        ctx,
        "ENROLLMENT_APPROVAL_RUN_RECONCILE",
        "enrollment_approval_run",
        row.run_id,
        "SUCCESS",
        current,
        next,
        correlationId ?? row.correlation_id,
        "authoritative_reconciliation"
      );
    }
    return persisted;
  }

  async startEnrollmentApprovalRun(
    ctx: AuthorizationContext,
    programId: string,
    requestIds: readonly string[],
    correlationId: string | null
  ): Promise<EnrollmentApprovalRun> {
    await this.requireApprovalRunProgram(ctx, programId);
    const ids = requestIds.map((requestId) => requestId.trim());
    if (
      ids.length === 0 ||
      ids.some((requestId) => requestId.length === 0) ||
      new Set(ids).size !== ids.length
    ) {
      throw new EnrollmentApprovalRunValidationError(
        "Enrollment Approval Run requires distinct request IDs."
      );
    }
    const requestRows = await this.store.listEnrollmentRequests(programId);
    const requestsById = new Map(
      requestRows.map((request) => [request.request_id, request])
    );
    const requests = ids.map((requestId) => requestsById.get(requestId));
    if (
      requests.some(
        (request) =>
          !request ||
          request.program_id !== programId ||
          request.status !== "Pending"
      )
    ) {
      throw new EnrollmentApprovalRunValidationError(
        "Enrollment Approval Run requires current Pending requests from one Program."
      );
    }
    const runs = await this.store.listEnrollmentApprovalRuns(
      ctx.actorUserId,
      programId
    );
    const existing = runs.find((run) => run.status === "active");
    if (existing) {
      return approvalRunView(existing);
    }
    let run: EnrollmentApprovalRun;
    try {
      run = createEnrollmentApprovalRun({
        program_id: programId,
        requests: requests as EnrollmentRequestRow[],
      });
    } catch (error) {
      throw new EnrollmentApprovalRunValidationError(
        error instanceof Error
          ? error.message
          : "Enrollment Approval Run selection is invalid."
      );
    }
    const row: EnrollmentApprovalRunRow = {
      ...run,
      actor_user_id: ctx.actorUserId,
      correlation_id: correlationId,
    };
    try {
      await this.store.createEnrollmentApprovalRun(row, run.items);
    } catch (error) {
      // ponytail: the partial unique index is the single active-run race
      // guard; return its winner instead of creating or replaying a second run.
      const candidates = await this.store.listEnrollmentApprovalRuns(
        ctx.actorUserId,
        programId
      );
      const winner = candidates.find(
        (candidate) => candidate.status === "active"
      );
      if (winner) {
        return approvalRunView(winner);
      }
      throw error;
    }
    await this.audit(
      ctx,
      "ENROLLMENT_APPROVAL_RUN_CREATE",
      "enrollment_approval_run",
      run.run_id,
      "SUCCESS",
      null,
      {
        program_id: programId,
        items: run.items.map(({ request_id, request_version, sequence }) => ({
          request_id,
          request_version,
          sequence,
        })),
      },
      correlationId,
      "selected_pending_requests"
    );
    return run;
  }

  async listEnrollmentApprovalRuns(
    ctx: AuthorizationContext,
    programId: string
  ): Promise<EnrollmentApprovalRun[]> {
    await this.requireApprovalRunProgram(ctx, programId);
    const runs = await this.store.listEnrollmentApprovalRuns(
      ctx.actorUserId,
      programId
    );
    return runs.map((run) => approvalRunView(run));
  }

  async reconcileEnrollmentApprovalRun(
    ctx: AuthorizationContext,
    programId: string,
    runId: string,
    correlationId: string | null
  ): Promise<EnrollmentApprovalRun | null> {
    await this.requireApprovalRunProgram(ctx, programId);
    const row = await this.findOwnedApprovalRun(ctx, programId, runId);
    if (!row) {
      return null;
    }
    const reconciled = await this.reconcileApprovalRunRow(
      ctx,
      row,
      correlationId
    );
    return approvalRunView(reconciled);
  }

  async continueEnrollmentApprovalRun(
    ctx: AuthorizationContext,
    programId: string,
    runId: string,
    correlationId: string | null
  ): Promise<EnrollmentApprovalRunActionResult | null> {
    await this.requireApprovalRunProgram(ctx, programId);
    const initial = await this.findOwnedApprovalRun(ctx, programId, runId);
    if (!initial) {
      return null;
    }
    const reconciled = await this.reconcileApprovalRunRow(
      ctx,
      initial,
      correlationId
    );
    const current = approvalRunView(reconciled);
    const begun = beginNextEnrollmentApprovalItem(current);
    if (!begun) {
      return { run: current, item: null };
    }
    const claimed = await this.store.claimNextEnrollmentApprovalRunItem(
      runId,
      ctx.actorUserId,
      begun.item.started_at ?? new Date().toISOString()
    );
    if (!claimed) {
      const latest = await this.store.findEnrollmentApprovalRun(runId);
      return latest ? { run: approvalRunView(latest), item: null } : null;
    }
    const claimedRun: EnrollmentApprovalRun = {
      ...current,
      items: current.items.map((item) =>
        item.request_id === claimed.request_id ? claimed : item
      ),
    };
    const claimedRow: EnrollmentApprovalRunRow = {
      ...reconciled,
      ...claimedRun,
    };
    let next: EnrollmentApprovalRun;
    let outcome: "SUCCESS" | "FAILED" = "SUCCESS";
    try {
      const result = await this.decideEnrollmentRequest(
        ctx,
        programId,
        claimed.request_id,
        {
          action: "Approved",
          note: null,
          expectedRequestVersion: claimed.request_version,
        },
        claimed.idempotency_key
      );
      if (result.enrollment) {
        next = settleEnrollmentApprovalItem(claimedRun, claimed.request_id, {
          status: "completed",
          enrollment_id: result.enrollment.enrollment_id,
        });
      } else {
        const authority = await this.store.findEnrollmentApprovalAuthority(
          claimed.program_id,
          claimed.request_id,
          claimed.member_user_id,
          claimed.idempotency_key
        );
        next = authority
          ? reconcileEnrollmentApprovalRun(
              claimedRun,
              new Map([[claimed.request_id, authority]])
            )
          : claimedRun;
        const settledItem = next.items.find(
          (item) => item.request_id === claimed.request_id
        );
        if (settledItem?.status === "in_flight") {
          next = settleEnrollmentApprovalItem(claimedRun, claimed.request_id, {
            status: "outcome_unknown",
            failure: {
              code: "OUTCOME_UNKNOWN",
              detail: "核准結果未能確認，請先重新整理並由系統核對後再繼續。",
              retryable: false,
            },
          });
        }
        if (
          next.items.find((item) => item.request_id === claimed.request_id)
            ?.status !== "completed"
        ) {
          outcome = "FAILED";
        }
      }
    } catch (error) {
      const failure = approvalRunFailure(error);
      outcome = "FAILED";
      next = settleEnrollmentApprovalItem(claimedRun, claimed.request_id, {
        status:
          failure.code === "OUTCOME_UNKNOWN" ? "outcome_unknown" : "failed",
        failure,
      });
    }
    const persisted = await this.persistApprovalRun(claimedRow, next);
    await this.audit(
      ctx,
      "ENROLLMENT_APPROVAL_RUN_CONTINUE",
      "enrollment_approval_run",
      runId,
      outcome,
      current,
      next,
      correlationId ?? claimed.idempotency_key,
      "explicit_continue"
    );
    const item = persisted.items.find(
      (candidate) => candidate.request_id === claimed.request_id
    );
    return { run: approvalRunView(persisted), item: item ?? null };
  }

  async cancelEnrollmentApprovalRun(
    ctx: AuthorizationContext,
    programId: string,
    runId: string,
    correlationId: string | null
  ): Promise<EnrollmentApprovalRun | null> {
    await this.requireApprovalRunProgram(ctx, programId);
    const row = await this.findOwnedApprovalRun(ctx, programId, runId);
    if (!row) {
      return null;
    }
    const current = approvalRunView(row);
    const next = cancelEnrollmentApprovalRun(current);
    if (next.status === current.status) {
      return current;
    }
    const persisted = await this.persistApprovalRun(row, next);
    await this.audit(
      ctx,
      "ENROLLMENT_APPROVAL_RUN_CANCEL",
      "enrollment_approval_run",
      runId,
      "SUCCESS",
      current,
      next,
      correlationId,
      "operator_cancelled_future_scheduling"
    );
    return approvalRunView(persisted);
  }

  async decideEnrollmentRequest(
    ctx: AuthorizationContext,
    programId: string,
    requestId: string,
    cmd: DecideEnrollmentRequestCommand,
    correlationId: string | null
  ): Promise<EnrollmentDecisionResult> {
    const program = await this.requireProgramFor(
      ctx,
      programId,
      CAPABILITY.PROGRAM_MANAGE
    );
    await this.requireModuleEnabled(
      program.department_id,
      MODULE_KEY.ENROLLMENT
    );
    const decisionResult = async (
      row: EnrollmentRequestRow
    ): Promise<EnrollmentDecisionResult> => ({
      request: row,
      enrollment:
        row.status === "Approved"
          ? await this.store.findActiveEnrollment(programId, row.member_user_id)
          : null,
    });
    // ADR-0023 §3 / ADR-0027: DUPLICATE is the SAME actor repeating their own
    // terminal decision; CONFLICT is a different actor reaching the terminal
    // state first or an opposite terminal state. Check STATUS before
    // request-version staleness so a terminal request is never misclassified
    // as a stale-version CONFLICT (a deciding actor's own idempotent retry
    // after a network timeout carries an already-advanced version).
    const classifyObserved = async (
      latest: EnrollmentRequestRow | null
    ): Promise<EnrollmentDecisionResult | null> => {
      if (latest && latest.status !== "Pending") {
        if (
          latest.status === cmd.action &&
          latest.decided_by === ctx.actorUserId
        ) {
          await this.audit(
            ctx,
            "ENROLLMENT_REQUEST_DECIDE",
            "enrollment_request",
            requestId,
            "DUPLICATE",
            null,
            { ...latest, reason: "already_decided" },
            correlationId
          );
          return decisionResult(latest);
        }
        await this.audit(
          ctx,
          "ENROLLMENT_REQUEST_DECIDE",
          "enrollment_request",
          requestId,
          "CONFLICT",
          request,
          {
            ...latest,
            reason:
              latest.status === cmd.action
                ? "already_decided_by_other_actor"
                : "terminal_request",
          },
          correlationId
        );
        throw new EnrollmentDecisionConflictError(requestId, latest.status);
      }
      if (
        latest &&
        cmd.expectedRequestVersion !== undefined &&
        cmd.expectedRequestVersion !== latest.request_version
      ) {
        await this.audit(
          ctx,
          "ENROLLMENT_REQUEST_DECIDE",
          "enrollment_request",
          requestId,
          "CONFLICT",
          request,
          { ...latest, reason: "stale_request_version" },
          correlationId
        );
        throw new StaleEnrollmentRequestError(requestId);
      }
      return null;
    };
    const request = await this.store.findEnrollmentRequestById(requestId);
    if (!request || request.program_id !== programId) {
      throw new RequestNotDecidableError(requestId);
    }
    const alreadyTerminal = await classifyObserved(request);
    if (alreadyTerminal) {
      return alreadyTerminal;
    }

    const now = new Date().toISOString();
    let decided: EnrollmentDecisionResult | null;
    if (cmd.action === "Approved") {
      const enrollmentId = crypto.randomUUID();
      const auditCreate = this.buildAuditRow(
        ctx,
        "ENROLLMENT_CREATE",
        "enrollment",
        enrollmentId,
        "SUCCESS",
        null,
        {
          enrollment_id: enrollmentId,
          program_id: request.program_id,
          member_user_id: request.member_user_id,
          request_id: requestId,
          status: "Active",
        },
        correlationId
      );
      const auditDecide = this.buildAuditRow(
        ctx,
        "ENROLLMENT_REQUEST_DECIDE",
        "enrollment_request",
        requestId,
        "SUCCESS",
        { status: "Pending", request_version: request.request_version },
        {
          ...request,
          request_version: request.request_version + 1,
          status: "Approved",
          decided_by: ctx.actorUserId,
          decided_at: now,
          note: cmd.note,
          enrollment_id: enrollmentId,
        },
        correlationId
      );
      try {
        const committed = await this.store.approveEnrollmentRequest({
          request_id: requestId,
          program_id: programId,
          member_user_id: request.member_user_id,
          enrollment_id: enrollmentId,
          decided_by: ctx.actorUserId,
          decided_at: now,
          note: cmd.note,
          auditCreate,
          auditDecide,
          expected_request_version: cmd.expectedRequestVersion,
        });
        decided = committed;
      } catch (error) {
        // ponytail: the (member, program) unique index is the race guard; on
        // constraint violation the whole batch rolled back, so the request is
        // still Pending and the member already has an Active enrollment.
        const existing = await this.store.findActiveEnrollment(
          programId,
          request.member_user_id
        );
        if (existing) {
          const outcome =
            existing.created_by === ctx.actorUserId ? "DUPLICATE" : "CONFLICT";
          await this.audit(
            ctx,
            "ENROLLMENT_REQUEST_DECIDE",
            "enrollment_request",
            requestId,
            outcome,
            null,
            {
              status: "Pending",
              enrollment_id: existing.enrollment_id,
              reason: "active_enrollment_exists",
            },
            correlationId
          );
          throw new DuplicateEnrollmentError(programId, request.member_user_id);
        }
        throw error;
      }
    } else {
      const auditDecide = this.buildAuditRow(
        ctx,
        "ENROLLMENT_REQUEST_DECIDE",
        "enrollment_request",
        requestId,
        "SUCCESS",
        { status: "Pending", request_version: request.request_version },
        {
          ...request,
          request_version: request.request_version + 1,
          status: "Rejected",
          decided_by: ctx.actorUserId,
          decided_at: now,
          note: cmd.note,
        },
        correlationId
      );
      const rejected = await this.store.decideRequest(
        requestId,
        "Rejected",
        ctx.actorUserId,
        now,
        cmd.note,
        auditDecide,
        cmd.expectedRequestVersion
      );
      decided = rejected ? { request: rejected, enrollment: null } : null;
    }
    if (decided) {
      return decided;
    }

    const latest = await this.store.findEnrollmentRequestById(requestId);
    const observed = await classifyObserved(latest);
    if (observed) {
      return observed;
    }
    // Defensive: the CAS failed but the re-read is a Pending row matching the
    // expected version — treat the decision as already applied and return the
    // observed row so the caller never fabricates a second mutation.
    await this.audit(
      ctx,
      "ENROLLMENT_REQUEST_DECIDE",
      "enrollment_request",
      requestId,
      "DUPLICATE",
      null,
      { ...(latest ?? request), reason: "already_decided" },
      correlationId
    );
    return decisionResult(latest ?? request);
  }

  async withdrawEnrollmentRequest(
    ctx: AuthorizationContext,
    programId: string,
    requestId: string,
    correlationId: string | null
  ): Promise<EnrollmentRequestRow> {
    const program = await this.requireProgramFor(
      ctx,
      programId,
      CAPABILITY.PROGRAM_ENROLL
    );
    await this.requireModuleEnabled(
      program.department_id,
      MODULE_KEY.ENROLLMENT
    );
    const request = await this.store.findEnrollmentRequestById(requestId);
    if (!request || request.program_id !== programId) {
      throw new RequestNotDecidableError(requestId);
    }
    if (request.member_user_id !== ctx.actorUserId) {
      throw new AuthorizationDeniedError(CAPABILITY.PROGRAM_ENROLL);
    }
    const withdrawn = await this.store.withdrawRequest(
      requestId,
      ctx.actorUserId,
      new Date().toISOString()
    );
    if (!withdrawn) {
      await this.audit(
        ctx,
        "ENROLLMENT_REQUEST_WITHDRAW",
        "enrollment_request",
        requestId,
        "DUPLICATE",
        null,
        { ...request, reason: "already_withdrawn" },
        correlationId
      );
      return request;
    }
    await this.audit(
      ctx,
      "ENROLLMENT_REQUEST_WITHDRAW",
      "enrollment_request",
      requestId,
      "SUCCESS",
      { status: "Pending" },
      withdrawn,
      correlationId
    );
    return withdrawn;
  }

  async assistedEnroll(
    ctx: AuthorizationContext,
    programId: string,
    cmd: AssistedEnrollCommand,
    correlationId: string | null
  ): Promise<EnrollmentRow> {
    const program = await this.requireProgramFor(
      ctx,
      programId,
      CAPABILITY.PROGRAM_MANAGE
    );
    await this.requireModuleEnabled(
      program.department_id,
      MODULE_KEY.ENROLLMENT
    );
    if (!(await this.store.isAccountActive(cmd.memberUserId))) {
      await this.audit(
        ctx,
        "ENROLLMENT_CREATE",
        "enrollment",
        cmd.memberUserId,
        "DENIED",
        null,
        { program_id: programId, reason: "account_inactive_or_unknown" },
        correlationId
      );
      throw new EnrollmentAccountInactiveError(cmd.memberUserId);
    }
    const existing = await this.store.findActiveEnrollment(
      programId,
      cmd.memberUserId
    );
    if (existing) {
      const outcome =
        existing.created_by === ctx.actorUserId ? "DUPLICATE" : "CONFLICT";
      await this.audit(
        ctx,
        "ENROLLMENT_CREATE",
        "enrollment",
        existing.enrollment_id,
        outcome,
        existing,
        { ...existing, reason: "active_enrollment_exists" },
        correlationId
      );
      if (outcome === "DUPLICATE") {
        return existing;
      }
      throw new DuplicateEnrollmentError(programId, cmd.memberUserId);
    }
    const now = new Date().toISOString();
    const enrollmentId = crypto.randomUUID();
    const auditCreate = this.buildAuditRow(
      ctx,
      "ENROLLMENT_CREATE",
      "enrollment",
      enrollmentId,
      "SUCCESS",
      null,
      {
        enrollment_id: enrollmentId,
        program_id: programId,
        member_user_id: cmd.memberUserId,
        request_id: null,
        status: "Active",
        enrolled_at: now,
        created_by: ctx.actorUserId,
        created_at: now,
      },
      correlationId
    );
    let row: EnrollmentRow;
    try {
      row = await this.store.createEnrollmentWithAudit(
        {
          enrollment_id: enrollmentId,
          program_id: programId,
          member_user_id: cmd.memberUserId,
          request_id: null,
          status: "Active",
          enrolled_at: now,
          created_by: ctx.actorUserId,
          created_at: now,
        },
        auditCreate
      );
    } catch (error) {
      // ponytail: partial unique index is the race guard; on constraint
      // violation the member already has an Active enrollment.
      const existing = await this.store.findActiveEnrollment(
        programId,
        cmd.memberUserId
      );
      if (existing) {
        const outcome =
          existing.created_by === ctx.actorUserId ? "DUPLICATE" : "CONFLICT";
        await this.audit(
          ctx,
          "ENROLLMENT_CREATE",
          "enrollment",
          existing.enrollment_id,
          outcome,
          existing,
          {
            ...existing,
            reason: "active_enrollment_exists",
          },
          correlationId
        );
        if (outcome === "DUPLICATE") {
          return existing;
        }
        throw new DuplicateEnrollmentError(programId, cmd.memberUserId);
      }
      throw error;
    }
    return row;
  }

  async listEnrollments(
    ctx: AuthorizationContext,
    programId: string
  ): Promise<EnrollmentRow[] | null> {
    const program = await this.store.findProgramById(programId);
    if (
      !program ||
      !(await this.isModuleEnabled(program.department_id)) ||
      !(await this.isModuleEnabled(
        program.department_id,
        MODULE_KEY.ENROLLMENT
      ))
    ) {
      return null;
    }
    const canManage = await this.authorizer.can(
      ctx,
      CAPABILITY.PROGRAM_MANAGE,
      {
        departmentId: program.department_id,
        programId: program.program_id,
      }
    );
    const rows = await this.store.listEnrollments(programId);
    if (canManage) {
      return rows;
    }
    if (program.discoverability === "Unlisted") {
      return null;
    }
    await this.ensure(ctx, CAPABILITY.PROGRAM_ENROLL, {
      departmentId: program.department_id,
      programId: program.program_id,
    });
    return rows.filter((r) => r.member_user_id === ctx.actorUserId);
  }

  async cancelEnrollment(
    ctx: AuthorizationContext,
    programId: string,
    enrollmentId: string,
    correlationId: string | null,
    cancellationReason: string | null = null
  ): Promise<EnrollmentRow> {
    const enrollment = await this.store.findEnrollmentById(enrollmentId);
    if (!enrollment || enrollment.program_id !== programId) {
      throw new AuthorizationDeniedError(CAPABILITY.PROGRAM_ENROLL);
    }
    const isOwner = enrollment.member_user_id === ctx.actorUserId;
    const program = await this.requireProgramFor(
      ctx,
      programId,
      isOwner ? CAPABILITY.PROGRAM_ENROLL : CAPABILITY.PROGRAM_MANAGE
    );
    await this.requireModuleEnabled(
      program.department_id,
      MODULE_KEY.ENROLLMENT
    );
    const reason = cancellationReason?.trim() || null;
    if (!isOwner && enrollment.status === "Active" && !reason) {
      throw new EnrollmentCancellationReasonRequiredError();
    }
    const cancelled = await this.store.cancelEnrollment(
      enrollmentId,
      ctx.actorUserId,
      new Date().toISOString(),
      reason
    );
    if (!cancelled) {
      await this.audit(
        ctx,
        "ENROLLMENT_CANCEL",
        "enrollment",
        enrollmentId,
        "DUPLICATE",
        null,
        { ...enrollment, reason: "already_cancelled" },
        correlationId
      );
      return enrollment;
    }
    await this.audit(
      ctx,
      "ENROLLMENT_CANCEL",
      "enrollment",
      enrollmentId,
      "SUCCESS",
      enrollment,
      cancelled,
      correlationId
    );
    if (!isOwner) {
      await this.store.createParticipantNotice({
        notice_id: crypto.randomUUID(),
        member_user_id: enrollment.member_user_id,
        kind: "program",
        title: "課程報名已被取消",
        body: `你在「${program.name}」的報名已被管理員取消。原因：${reason}`,
        program_id: programId,
        event_id: null,
        read_at: null,
        created_at: Date.now(),
      });
    }
    return cancelled;
  }
}
