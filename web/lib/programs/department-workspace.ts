/**
 * EFCC Programs domain — DepartmentWorkspace domain module.
 *
 * Owns Department/Program/module lifecycle, scope checks, audit, and transaction
 * invariants. The Worker HTTP handlers and browser UI are thin adapters around
 * this module.
 */

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
import {
  DepartmentManagerConflictError,
  DepartmentManagerNotAssignedError,
  DuplicateDepartmentCodeError,
  DuplicateEnrollmentError,
  DuplicateEventError,
  DuplicateProgramNameError,
  DuplicateScheduleExceptionError,
  EmptyPreviewPlanError,
  EnrollmentNotAllowedError,
  EventAvailabilityConfirmationRequiredError,
  InvalidModuleKeyError,
  InvalidProgramLifecycleError,
  LeaderAccountInactiveError,
  LeaderNotAssignedError,
  NoScheduleRulesError,
  PreviewPlanNotFoundError,
  ProgramArchiveBlockedError,
  ProgramLeaderConflictError,
  RequestNotDecidableError,
  ScheduleRuleNotApplicableError,
  SelfDelegationError,
  SelfDepartmentManagerError,
  StalePreviewPlanError,
} from "./program-errors";
import {
  exceptionForEvent,
  hkTodayWallDate,
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
  DepartmentManagerRow,
  DepartmentRow,
  DepartmentUpdate,
  EnrollmentRequestRow,
  EnrollmentRow,
  EventAvailability,
  EventRow,
  GenerateResult,
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
  ProgramLeaderRow,
  ProgramUpdate,
  ScheduleExceptionRow,
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
export interface ManagementProgramWorkspaceView {
  program: ManagementProgramSettingsView;
  department: ManagementDepartmentView;
  modules: ManagementDepartmentModuleView[];
}
export interface EventDetailView {
  event: EventRow;
  leaders: ProgramLeaderRow[];
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

export interface ParticipantCatalogEntry {
  department: DepartmentSummary;
  programs: ProgramSummary[];
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
  description?: string;
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
}

export interface UpdateScheduleRuleCommand {
  recurrence?: RecurrenceKind;
  day_of_week?: number | null;
  month_day?: number | null;
  start_time?: string;
  end_time?: string;
  location?: string | null;
}

export interface CreateScheduleExceptionCommand {
  override_date: string;
  action: ScheduleExceptionAction;
  new_start_time: string | null;
  new_end_time: string | null;
}

export interface CreateEventCommand {
  starts_at: string;
  ends_at: string;
  name: string | null;
  location: string | null;
  check_in_window_opens_at: string | null;
  check_in_window_closes_at: string | null;
}

export interface UpdateEventCommand {
  starts_at?: string;
  ends_at?: string;
  name?: string | null;
  location?: string | null;
  check_in_window_opens_at?: string | null;
  check_in_window_closes_at?: string | null;
}

export interface SetEventAvailabilityCommand {
  availability: EventAvailability;
  confirm: boolean;
}

export interface CancelEventCommand {
  reason: string;
}

export interface DecideEnrollmentRequestCommand {
  action: "Approved" | "Rejected";
  note: string | null;
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

export class DepartmentWorkspace {
  readonly store: WorkspaceStore;
  readonly authorizer: CapabilityAuthorizer;

  constructor(store: WorkspaceStore, authorizer: CapabilityAuthorizer) {
    this.store = store;
    this.authorizer = authorizer;
  }

  private async ensure(
    ctx: AuthorizationContext,
    capability: (typeof CAPABILITY)[keyof typeof CAPABILITY],
    scope: { departmentId?: string; programId?: string } | null = null
  ): Promise<void> {
    if (!(await this.authorizer.can(ctx, capability, scope))) {
      throw new AuthorizationDeniedError(capability);
    }
  }

  private buildAuditRow(
    ctx: AuthorizationContext,
    action: string,
    entityType: string,
    entityId: string,
    outcome: AuditOutcome,
    oldValue: unknown,
    newValue: unknown,
    correlationId: string | null
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
      reason: null,
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
    correlationId: string | null
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
        correlationId
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
    return {
      program,
      department: this.managementDepartment(department),
      modules,
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

  async listDepartmentManagers(
    ctx: AuthorizationContext,
    departmentId: string
  ): Promise<DepartmentManagerRow[] | null> {
    const department = await this.store.findDepartmentById(departmentId);
    if (
      !department ||
      !(await this.authorizer.can(ctx, CAPABILITY.DEPARTMENT_MANAGER_ASSIGN, {
        departmentId,
      }))
    ) {
      return null;
    }
    return this.store.listDepartmentManagers(departmentId);
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
      lifecycle: cmd.lifecycle ?? "Draft",
      discoverability: cmd.discoverability ?? "Unlisted",
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
    return views
      .filter(
        ({ row, capabilities }) =>
          row.discoverability === "Listed" || capabilities.manage
      )
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
    if (row.discoverability === "Unlisted" && !capabilities.manage) {
      return null;
    }
    return this.programView(row, capabilities);
  }

  /**
   * Participant Programs directory (PUI-02 / Issue #246): narrow, grouped
   * catalog projection over production D1. Visibility keeps the incumbent
   * server policy — Listed rows are public, Unlisted rows appear only through
   * scoped `program.manage` effective access — and module-disabled Departments
   * are excluded. Lifecycle is surfaced as status; Draft/Archived rows are
   * never silently filtered. Departments with zero visible Programs are
   * omitted so the landing's empty state means a truly empty catalog.
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
            rows.map(async (row) => ({
              row,
              capabilities: await this.programCapabilities(ctx, row),
            }))
          )
        )
          .filter(
            ({ row, capabilities }) =>
              row.discoverability === "Listed" || capabilities.manage
          )
          .map(({ row }) => this.programSummary(row));
        if (visible.length === 0) {
          return null;
        }
        return {
          department: this.departmentSummary(department),
          programs: visible,
        };
      })
    );
    return entries.filter(
      (entry): entry is ParticipantCatalogEntry => entry !== null
    );
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
  }> {
    if (
      !(await this.isModuleEnabled(view.department_id, MODULE_KEY.ENROLLMENT))
    ) {
      return { access: "Unavailable", snapshot: null };
    }
    if (!view.capabilities.enroll) {
      return { access: "Ineligible", snapshot: null };
    }
    const { requests, enrollments } =
      await this.store.listParticipantEnrollmentSnapshot(
        view.program_id,
        ctx.actorUserId
      );
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
        if (!onlyLifecycle) {
          // Metadata edits on an archived program are still allowed; fall
          // through to the generic update path below.
        } else {
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
        }
      } else if (old.lifecycle !== "Active") {
        throw new InvalidProgramLifecycleError(old.lifecycle, "Archived");
      } else {
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
    const [manage, publish, moduleConfigure, managerAssign] = await Promise.all(
      [
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
      ]
    );
    return {
      ...row,
      capabilities: {
        manage,
        publish,
        module_configure: moduleConfigure,
        manager_assign: managerAssign,
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
    const [manage, publish, enroll, leaderAssign] = await Promise.all([
      this.authorizer.can(ctx, CAPABILITY.PROGRAM_MANAGE, scope),
      this.authorizer.can(ctx, CAPABILITY.PROGRAM_PUBLISH, scope),
      this.authorizer.can(ctx, CAPABILITY.PROGRAM_ENROLL, scope),
      this.authorizer.can(ctx, CAPABILITY.PROGRAM_LEADER_ASSIGN, scope),
    ]);
    return {
      manage,
      publish,
      enroll,
      leader_assign: leaderAssign,
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
    const program = await this.requireProgramFor(
      ctx,
      event.program_id,
      CAPABILITY.PROGRAM_MANAGE
    );
    await this.requireModuleEnabled(program.department_id, MODULE_KEY.EVENTS);
    const [leaders, participant_summary] = await Promise.all([
      this.store.listProgramLeaders(program.program_id),
      this.store.getEventParticipantSummary(event.event_id, program.program_id),
    ]);
    return { event, leaders, participant_summary };
  }

  async createScheduleRule(
    ctx: AuthorizationContext,
    programId: string,
    cmd: CreateScheduleRuleCommand,
    correlationId: string | null
  ): Promise<ScheduleRuleRow> {
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
    const row = await this.store.createScheduleRule({
      program_id: programId,
      ...cmd,
      created_by: ctx.actorUserId,
      created_at: now,
      updated_by: ctx.actorUserId,
      updated_at: now,
    });
    await this.audit(
      ctx,
      "SCHEDULE_RULE_CREATE",
      "schedule_rule",
      row.rule_id,
      "SUCCESS",
      null,
      row,
      correlationId
    );
    return row;
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
   * rules/exceptions/horizon/from-date the plan was computed from, which is
   * what generation re-checks to reject stale plans before any write.
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
        })),
      exceptions: [...exceptions]
        .sort((a, b) =>
          a.rule_id === b.rule_id
            ? a.override_date.localeCompare(b.override_date)
            : a.rule_id.localeCompare(b.rule_id)
        )
        .map((exception) => ({
          rule_id: exception.rule_id,
          override_date: exception.override_date,
          action: exception.action,
          new_start_time: exception.new_start_time,
          new_end_time: exception.new_end_time,
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
    correlationId: string | null
  ): Promise<{
    plan: PreviewPlanRow;
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
      throw new NoScheduleRulesError(programId);
    }
    const exceptions = await this.store.listScheduleExceptions(
      rules.map((rule) => rule.rule_id)
    );
    const fromDate = hkTodayWallDate();
    const candidates = this.materializeOccurrences(
      rules,
      fromDate,
      horizonDays,
      exceptions
    );
    const planHash = await this.computePlanHash(
      rules,
      exceptions,
      horizonDays,
      fromDate
    );
    const now = new Date().toISOString();
    const plan: PreviewPlanRow = {
      plan_id: crypto.randomUUID(),
      program_id: programId,
      plan_hash: planHash,
      horizon_days: horizonDays,
      from_date: fromDate,
      rule_count: rules.length,
      created_by: ctx.actorUserId,
      created_at: now,
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
    return { plan: persisted, occurrences: storedOccurrences };
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
    // Reject stale/ambiguous plans before writes: the live schedule must
    // still match the plan's frozen inputs, and no newer preview may have
    // superseded this plan.
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
    const latest = await this.store.findLatestPreviewPlan(programId);
    const superseded =
      latest !== null &&
      latest.plan_id !== plan.plan_id &&
      (latest.created_at > plan.created_at ||
        (latest.created_at === plan.created_at && latest.plan_id > plan.plan_id));
    if (currentHash !== plan.plan_hash || superseded) {
      await this.audit(
        ctx,
        "EVENT_GENERATE",
        "event",
        programId,
        "FAILED",
        null,
        { plan_id: planId, reason: "stale_plan" },
        correlationId
      );
      throw new StalePreviewPlanError(planId, programId);
    }
    const occurrences = await this.store.listPreviewOccurrences(planId);
    if (occurrences.length === 0) {
      await this.audit(
        ctx,
        "EVENT_GENERATE",
        "event",
        programId,
        "FAILED",
        null,
        { plan_id: planId, reason: "empty_plan" },
        correlationId
      );
      throw new EmptyPreviewPlanError(planId);
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
      // Deterministic repeat: the plan was already fully generated, so this
      // request created nothing and skipped every occurrence of the plan.
      return {
        run_id: run.run_id,
        plan_id: planId,
        status: "completed",
        created: 0,
        skipped: occurrences.length,
        failed: 0,
        resumed: true,
      };
    }
    // Each occurrence gets exactly one durable attempt row; repeated and
    // concurrent requests converge on the same rows (INSERT … ON CONFLICT
    // only supersedes previously-failed rows), so the item table is the
    // single source of truth for the final counts. Failed rows are retried;
    // created/skipped rows are terminal.
    await this.processGenerationOccurrences(
      run.run_id,
      programId,
      occurrences,
      ctx.actorUserId,
      now
    );
    const items = await this.store.listGenerationRunItems(run.run_id);
    const created = items.filter((item) => item.outcome === "created").length;
    const skipped = items.filter((item) => item.outcome === "skipped").length;
    const failed = items.filter((item) => item.outcome === "failed").length;
    const status: GenerateResult["status"] =
      failed === 0 ? "completed" : created + skipped > 0 ? "partial" : "failed";
    const finished = await this.store.finishGenerationRun(run.run_id, {
      status,
      created,
      skipped,
      failed,
      finished_at: new Date().toISOString(),
    });
    await this.audit(
      ctx,
      "EVENT_GENERATE",
      "event",
      programId,
      status === "completed" ? "SUCCESS" : "FAILED",
      null,
      {
        run_id: finished.run_id,
        plan_id: planId,
        status: finished.status,
        created: finished.created,
        skipped: finished.skipped,
        failed: finished.failed,
        resumed,
      },
      correlationId
    );
    return {
      run_id: finished.run_id,
      plan_id: planId,
      status: finished.status,
      created: finished.created,
      skipped: finished.skipped,
      failed: finished.failed,
      resumed,
    };
  }

  /**
   * Durably attempt every occurrence of a run. Attempts are independent and
   * run in parallel; each attempt row is durable, so a crash mid-run leaves
   * a resumable partial state and retries resume from the item table.
   * Failed units are retried; created/skipped rows are terminal.
   */
  private async processGenerationOccurrences(
    runId: string,
    programId: string,
    occurrences: PreviewOccurrenceRow[],
    actorUserId: string,
    now: string
  ): Promise<void> {
    const runItems = await this.store.listGenerationRunItems(runId);
    const processed = new Map(
      runItems.map((item) => [item.occurrence_id, item])
    );
    await Promise.all(
      occurrences.map((occurrence) =>
        this.attemptGenerationOccurrence(
          runId,
          programId,
          occurrence,
          actorUserId,
          now,
          processed
        )
      )
    );
  }

  private async attemptGenerationOccurrence(
    runId: string,
    programId: string,
    occurrence: PreviewOccurrenceRow,
    actorUserId: string,
    now: string,
    processed: ReadonlyMap<string, GenerationRunItemRow>
  ): Promise<void> {
    const prior = processed.get(occurrence.occurrence_id);
    if (prior && prior.outcome !== "failed") {
      return;
    }
    if (occurrence.skip_reason === "CANCEL") {
      await this.store.recordGenerationRunItem({
        item_id: `${runId}:${occurrence.occurrence_id}`,
        run_id: runId,
        occurrence_id: occurrence.occurrence_id,
        starts_at: occurrence.starts_at,
        outcome: "skipped",
        event_id: null,
        detail: "CANCEL",
      });
      return;
    }
    let outcome: "created" | "skipped" | "failed" = "failed";
    let eventId: string | null = null;
    let detail: string | null = null;
    try {
      const inserted = await this.store.insertGeneratedEvent({
        program_id: programId,
        starts_at: occurrence.starts_at,
        ends_at: occurrence.ends_at,
        status: "Active",
        availability: "Active",
        source: "SCHEDULE",
        name: null,
        location: occurrence.location,
        check_in_window_opens_at: null,
        check_in_window_closes_at: null,
        cancel_reason: null,
        created_by: actorUserId,
        created_at: now,
        updated_by: actorUserId,
        updated_at: now,
      });
      if (inserted) {
        outcome = "created";
        const createdEvent = await this.store.findEventByStart(
          programId,
          occurrence.starts_at
        );
        eventId = createdEvent?.event_id ?? null;
      } else {
        // Unique (program_id, starts_at) already satisfied by another run.
        outcome = "skipped";
      }
    } catch (error) {
      outcome = "failed";
      detail = error instanceof Error ? error.message : String(error);
    }
    await this.store.recordGenerationRunItem({
      item_id: `${runId}:${occurrence.occurrence_id}`,
      run_id: runId,
      occurrence_id: occurrence.occurrence_id,
      starts_at: occurrence.starts_at,
      outcome,
      event_id: eventId,
      detail,
    });
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
    };
  }

  async createEvent(
    ctx: AuthorizationContext,
    programId: string,
    cmd: CreateEventCommand,
    correlationId: string | null
  ): Promise<EventRow> {
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
      name: cmd.name,
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
    return row;
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
    const rules = await this.store.listScheduleRules(rows[0].program_id);
    const exceptions = await this.store.listScheduleExceptions(
      rules.map((r) => r.rule_id)
    );
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
    if (cmd.starts_at !== undefined && cmd.starts_at !== event.starts_at) {
      const duplicate = await this.store.findEventByStart(
        event.program_id,
        cmd.starts_at
      );
      if (duplicate && duplicate.event_id !== event.event_id) {
        await this.audit(
          ctx,
          "EVENT_UPDATE",
          "event",
          duplicate.event_id,
          "CONFLICT",
          event,
          { starts_at: cmd.starts_at },
          correlationId
        );
        throw new DuplicateEventError(cmd.starts_at);
      }
    }
    const updated = await this.store.updateEvent(
      eventId,
      cmd,
      ctx.actorUserId,
      new Date().toISOString()
    );
    if (!updated) {
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
      correlationId
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
        throw new EventAvailabilityConfirmationRequiredError(
          impactCount
        );
      }
    }
    const updated = await this.store.updateEvent(
      eventId,
      { availability: cmd.availability },
      ctx.actorUserId,
      new Date().toISOString()
    );
    if (!updated) {
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
    const updated = await this.store.cancelEvent(
      eventId,
      cmd.reason,
      ctx.actorUserId,
      new Date().toISOString()
    );
    if (!updated) {
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
    limit: number
  ): Promise<MemberOptionRow[]> {
    return this.store.searchActiveMembers(query, limit);
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

  async decideEnrollmentRequest(
    ctx: AuthorizationContext,
    programId: string,
    requestId: string,
    cmd: DecideEnrollmentRequestCommand,
    correlationId: string | null
  ): Promise<EnrollmentRequestRow> {
    const program = await this.requireProgramFor(
      ctx,
      programId,
      CAPABILITY.PROGRAM_MANAGE
    );
    await this.requireModuleEnabled(
      program.department_id,
      MODULE_KEY.ENROLLMENT
    );
    const request = await this.store.findEnrollmentRequestById(requestId);
    if (!request || request.program_id !== programId) {
      throw new RequestNotDecidableError(requestId);
    }
    const now = new Date().toISOString();
    let decided: EnrollmentRequestRow | null;
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
        { status: "Pending" },
        {
          ...request,
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
        });
        decided = committed?.request ?? null;
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
        { status: "Pending" },
        {
          ...request,
          status: "Rejected",
          decided_by: ctx.actorUserId,
          decided_at: now,
          note: cmd.note,
        },
        correlationId
      );
      decided = await this.store.decideRequest(
        requestId,
        "Rejected",
        ctx.actorUserId,
        now,
        cmd.note,
        auditDecide
      );
    }
    if (!decided) {
      await this.audit(
        ctx,
        "ENROLLMENT_REQUEST_DECIDE",
        "enrollment_request",
        requestId,
        "DUPLICATE",
        null,
        { ...request, reason: "already_decided" },
        correlationId
      );
      return request;
    }
    return decided;
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
    if (program.enrollment_mode !== "ManagerOnly") {
      throw new EnrollmentNotAllowedError(programId, "ManagerOnly");
    }
    if (await this.store.hasActiveEnrollment(programId, cmd.memberUserId)) {
      await this.audit(
        ctx,
        "ENROLLMENT_CREATE",
        "enrollment",
        programId,
        "CONFLICT",
        null,
        {
          member_user_id: cmd.memberUserId,
          reason: "active_enrollment_exists",
        },
        correlationId
      );
      throw new DuplicateEnrollmentError(programId, cmd.memberUserId);
    }
    const now = new Date().toISOString();
    let row: EnrollmentRow;
    try {
      row = await this.store.createEnrollment({
        enrollment_id: crypto.randomUUID(),
        program_id: programId,
        member_user_id: cmd.memberUserId,
        request_id: null,
        status: "Active",
        enrolled_at: now,
        created_by: ctx.actorUserId,
        created_at: now,
      });
    } catch (error) {
      // ponytail: partial unique index is the race guard; on constraint
      // violation the member already has an Active enrollment.
      if (await this.store.hasActiveEnrollment(programId, cmd.memberUserId)) {
        throw new DuplicateEnrollmentError(programId, cmd.memberUserId);
      }
      throw error;
    }
    await this.audit(
      ctx,
      "ENROLLMENT_CREATE",
      "enrollment",
      row.enrollment_id,
      "SUCCESS",
      null,
      row,
      correlationId
    );
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
    correlationId: string | null
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
    const cancelled = await this.store.cancelEnrollment(
      enrollmentId,
      ctx.actorUserId,
      new Date().toISOString()
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
    return cancelled;
  }

  async assignProgramLeader(
    ctx: AuthorizationContext,
    programId: string,
    userId: string,
    correlationId: string | null
  ): Promise<ProgramLeaderRow> {
    await this.requireProgramFor(
      ctx,
      programId,
      CAPABILITY.PROGRAM_LEADER_ASSIGN
    );
    if (userId === ctx.actorUserId) {
      await this.audit(
        ctx,
        "PROGRAM_LEADER_GRANT",
        "program_leader",
        programId,
        "DENIED",
        null,
        { user_id: userId, reason: "self_delegation" },
        correlationId
      );
      throw new SelfDelegationError(userId);
    }
    if (!(await this.store.isAccountActive(userId))) {
      await this.audit(
        ctx,
        "PROGRAM_LEADER_GRANT",
        "program_leader",
        programId,
        "DENIED",
        null,
        { user_id: userId, reason: "target_account_not_active" },
        correlationId
      );
      throw new LeaderAccountInactiveError(userId);
    }
    const existing = await this.store.findProgramLeader(programId, userId);
    if (existing?.revoked_at === null) {
      const outcome =
        existing.granted_by === ctx.actorUserId ? "DUPLICATE" : "CONFLICT";
      await this.audit(
        ctx,
        "PROGRAM_LEADER_GRANT",
        "program_leader",
        programId,
        outcome,
        existing,
        existing,
        correlationId
      );
      if (outcome === "CONFLICT") {
        throw new ProgramLeaderConflictError(programId, userId);
      }
      return existing;
    }
    let row: ProgramLeaderRow;
    try {
      row = await this.store.assignProgramLeader({
        program_id: programId,
        user_id: userId,
        granted_by: ctx.actorUserId,
        granted_at: new Date().toISOString(),
      });
    } catch (error) {
      await this.audit(
        ctx,
        "PROGRAM_LEADER_GRANT",
        "program_leader",
        programId,
        "FAILED",
        existing,
        { user_id: userId, reason: "store_error" },
        correlationId
      );
      throw error;
    }
    if (row.granted_by !== ctx.actorUserId || row.revoked_at !== null) {
      await this.audit(
        ctx,
        "PROGRAM_LEADER_GRANT",
        "program_leader",
        programId,
        "CONFLICT",
        existing,
        row,
        correlationId
      );
      throw new ProgramLeaderConflictError(programId, userId);
    }
    await this.audit(
      ctx,
      "PROGRAM_LEADER_GRANT",
      "program_leader",
      programId,
      "SUCCESS",
      existing,
      row,
      correlationId
    );
    return row;
  }

  async revokeProgramLeader(
    ctx: AuthorizationContext,
    programId: string,
    userId: string,
    correlationId: string | null
  ): Promise<ProgramLeaderRow | null> {
    await this.requireProgramFor(
      ctx,
      programId,
      CAPABILITY.PROGRAM_LEADER_ASSIGN
    );
    const existing = await this.store.findProgramLeader(programId, userId);
    if (!existing) {
      await this.audit(
        ctx,
        "PROGRAM_LEADER_REVOKE",
        "program_leader",
        programId,
        "DENIED",
        null,
        { user_id: userId, reason: "leader_not_assigned" },
        correlationId
      );
      throw new LeaderNotAssignedError(programId, userId);
    }
    if (existing.revoked_at !== null) {
      const outcome =
        existing.revoked_by === ctx.actorUserId ? "DUPLICATE" : "CONFLICT";
      await this.audit(
        ctx,
        "PROGRAM_LEADER_REVOKE",
        "program_leader",
        programId,
        outcome,
        existing,
        existing,
        correlationId
      );
      if (outcome === "CONFLICT") {
        throw new ProgramLeaderConflictError(programId, userId);
      }
      return existing;
    }
    let revoked: ProgramLeaderRow | null;
    try {
      revoked = await this.store.revokeProgramLeader({
        program_id: programId,
        user_id: userId,
        revoked_by: ctx.actorUserId,
        revoked_at: new Date().toISOString(),
      });
    } catch (error) {
      await this.audit(
        ctx,
        "PROGRAM_LEADER_REVOKE",
        "program_leader",
        programId,
        "FAILED",
        existing,
        { user_id: userId, reason: "store_error" },
        correlationId
      );
      throw error;
    }
    if (!revoked) {
      await this.audit(
        ctx,
        "PROGRAM_LEADER_REVOKE",
        "program_leader",
        programId,
        "CONFLICT",
        existing,
        null,
        correlationId
      );
      throw new ProgramLeaderConflictError(programId, userId);
    }
    if (revoked.revoked_by !== ctx.actorUserId || revoked.revoked_at === null) {
      await this.audit(
        ctx,
        "PROGRAM_LEADER_REVOKE",
        "program_leader",
        programId,
        "CONFLICT",
        existing,
        revoked,
        correlationId
      );
      throw new ProgramLeaderConflictError(programId, userId);
    }
    await this.audit(
      ctx,
      "PROGRAM_LEADER_REVOKE",
      "program_leader",
      programId,
      "SUCCESS",
      existing,
      revoked,
      correlationId
    );
    return revoked;
  }

  async listProgramLeaders(
    ctx: AuthorizationContext,
    programId: string
  ): Promise<ProgramLeaderRow[] | null> {
    const program = await this.store.findProgramById(programId);
    if (!program || !(await this.isModuleEnabled(program.department_id))) {
      return null;
    }
    const canView = await this.authorizer.can(ctx, CAPABILITY.PROGRAM_MANAGE, {
      departmentId: program.department_id,
      programId: program.program_id,
    });
    if (!canView) {
      return null;
    }
    return this.store.listProgramLeaders(programId);
  }
  async assignDepartmentManager(
    ctx: AuthorizationContext,
    departmentId: string,
    userId: string,
    correlationId: string | null
  ): Promise<DepartmentManagerRow> {
    const department = await this.store.findDepartmentById(departmentId);
    if (!department) {
      throw new AuthorizationDeniedError(CAPABILITY.DEPARTMENT_MANAGER_ASSIGN);
    }
    await this.ensure(ctx, CAPABILITY.DEPARTMENT_MANAGER_ASSIGN, {
      departmentId,
    });
    if (userId === ctx.actorUserId) {
      await this.audit(
        ctx,
        "DEPARTMENT_MANAGER_GRANT",
        "department_manager",
        `${departmentId}:${userId}`,
        "DENIED",
        null,
        {
          department_id: departmentId,
          user_id: userId,
          reason: "self_assignment",
        },
        correlationId
      );
      throw new SelfDepartmentManagerError(userId);
    }
    if (!(await this.store.isAccountActive(userId))) {
      await this.audit(
        ctx,
        "DEPARTMENT_MANAGER_GRANT",
        "department_manager",
        `${departmentId}:${userId}`,
        "DENIED",
        null,
        {
          department_id: departmentId,
          user_id: userId,
          reason: "target_account_not_active",
        },
        correlationId
      );
      throw new LeaderAccountInactiveError(userId, "Department Manager");
    }
    const existing = await this.store.findDepartmentManager(
      departmentId,
      userId
    );
    if (existing?.revoked_at === null) {
      const outcome =
        existing.granted_by === ctx.actorUserId ? "DUPLICATE" : "CONFLICT";
      await this.audit(
        ctx,
        "DEPARTMENT_MANAGER_GRANT",
        "department_manager",
        `${departmentId}:${userId}`,
        outcome,
        existing,
        existing,
        correlationId
      );
      if (outcome === "CONFLICT") {
        throw new DepartmentManagerConflictError(departmentId, userId);
      }
      return existing;
    }
    let row: DepartmentManagerRow;
    try {
      row = await this.store.assignDepartmentManager({
        department_id: departmentId,
        user_id: userId,
        granted_by: ctx.actorUserId,
        granted_at: new Date().toISOString(),
      });
    } catch (error) {
      await this.audit(
        ctx,
        "DEPARTMENT_MANAGER_GRANT",
        "department_manager",
        `${departmentId}:${userId}`,
        "FAILED",
        existing,
        { user_id: userId, reason: "store_error" },
        correlationId
      );
      throw error;
    }
    if (row.granted_by !== ctx.actorUserId || row.revoked_at !== null) {
      await this.audit(
        ctx,
        "DEPARTMENT_MANAGER_GRANT",
        "department_manager",
        `${departmentId}:${userId}`,
        "CONFLICT",
        existing,
        row,
        correlationId
      );
      throw new DepartmentManagerConflictError(departmentId, userId);
    }
    await this.audit(
      ctx,
      "DEPARTMENT_MANAGER_GRANT",
      "department_manager",
      `${departmentId}:${userId}`,
      "SUCCESS",
      existing,
      row,
      correlationId
    );
    return row;
  }

  async revokeDepartmentManager(
    ctx: AuthorizationContext,
    departmentId: string,
    userId: string,
    correlationId: string | null
  ): Promise<DepartmentManagerRow> {
    const department = await this.store.findDepartmentById(departmentId);
    if (!department) {
      throw new AuthorizationDeniedError(CAPABILITY.DEPARTMENT_MANAGER_ASSIGN);
    }
    await this.ensure(ctx, CAPABILITY.DEPARTMENT_MANAGER_ASSIGN, {
      departmentId,
    });
    const existing = await this.store.findDepartmentManager(
      departmentId,
      userId
    );
    if (!existing) {
      await this.audit(
        ctx,
        "DEPARTMENT_MANAGER_REVOKE",
        "department_manager",
        `${departmentId}:${userId}`,
        "DENIED",
        null,
        {
          department_id: departmentId,
          user_id: userId,
          reason: "manager_not_assigned",
        },
        correlationId
      );
      throw new DepartmentManagerNotAssignedError(departmentId, userId);
    }
    if (existing.revoked_at !== null) {
      const outcome =
        existing.revoked_by === ctx.actorUserId ? "DUPLICATE" : "CONFLICT";
      await this.audit(
        ctx,
        "DEPARTMENT_MANAGER_REVOKE",
        "department_manager",
        `${departmentId}:${userId}`,
        outcome,
        existing,
        existing,
        correlationId
      );
      if (outcome === "CONFLICT") {
        throw new DepartmentManagerConflictError(departmentId, userId);
      }
      return existing;
    }
    let row: DepartmentManagerRow | null;
    try {
      row = await this.store.revokeDepartmentManager({
        department_id: departmentId,
        user_id: userId,
        revoked_by: ctx.actorUserId,
        revoked_at: new Date().toISOString(),
      });
    } catch (error) {
      await this.audit(
        ctx,
        "DEPARTMENT_MANAGER_REVOKE",
        "department_manager",
        `${departmentId}:${userId}`,
        "FAILED",
        existing,
        { user_id: userId, reason: "store_error" },
        correlationId
      );
      throw error;
    }
    if (!row) {
      await this.audit(
        ctx,
        "DEPARTMENT_MANAGER_REVOKE",
        "department_manager",
        `${departmentId}:${userId}`,
        "CONFLICT",
        existing,
        null,
        correlationId
      );
      throw new DepartmentManagerConflictError(departmentId, userId);
    }
    if (row.revoked_by !== ctx.actorUserId || row.revoked_at === null) {
      await this.audit(
        ctx,
        "DEPARTMENT_MANAGER_REVOKE",
        "department_manager",
        `${departmentId}:${userId}`,
        "CONFLICT",
        existing,
        row,
        correlationId
      );
      throw new DepartmentManagerConflictError(departmentId, userId);
    }
    await this.audit(
      ctx,
      "DEPARTMENT_MANAGER_REVOKE",
      "department_manager",
      `${departmentId}:${userId}`,
      "SUCCESS",
      existing,
      row,
      correlationId
    );
    return row;
  }
}
