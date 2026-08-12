/**
 * EFCC Programs domain — DepartmentWorkspace domain module.
 *
 * Owns Department/Program/module lifecycle, scope checks, audit, and transaction
 * invariants. The Worker HTTP handlers and browser UI are thin adapters around
 * this module.
 */

import { CAPABILITY, MODULE_KEY, MODULE_KEYS } from "./capabilities";
import type { Capability, ModuleKey } from "./capabilities";
import { AuthorizationDeniedError } from "./capability-authorizer";
import type {
  AuthorizationContext,
  CapabilityAuthorizer,
} from "./capability-authorizer";
import {
  exceptionForEvent,
  hkTodayWallDate,
  occurrencesForRule,
} from "./recurrence";
import type { RecurrenceKind, ScheduleExceptionAction } from "./recurrence";
import type {
  AuditInput,
  AuditOutcome,
  DepartmentLifecycle,
  DepartmentRow,
  DepartmentUpdate,
  EnrollmentRequestRow,
  EnrollmentRow,
  EventRow,
  GenerateResult,
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

export interface DepartmentCapabilities {
  manage: boolean;
  publish: boolean;
  module_configure: boolean;
}

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

function hasDepartmentManagementScope(department: DepartmentView): boolean {
  return (
    department.capabilities.manage ||
    department.capabilities.publish ||
    department.capabilities.module_configure
  );
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
}

export interface UpdateScheduleRuleCommand {
  recurrence?: RecurrenceKind;
  day_of_week?: number | null;
  month_day?: number | null;
  start_time?: string;
  end_time?: string;
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

// oxlint-disable-next-line eslint/max-classes-per-file
export class DuplicateDepartmentCodeError extends Error {
  constructor(code: string) {
    super(`A department with code '${code}' already exists.`);
    this.name = "DuplicateDepartmentCodeError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class DuplicateProgramNameError extends Error {
  constructor(name: string) {
    super(`A program with name '${name}' already exists in this department.`);
    this.name = "DuplicateProgramNameError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class InvalidProgramLifecycleError extends Error {
  constructor(from: ProgramLifecycle, to: ProgramLifecycle) {
    super(`Invalid program lifecycle transition: ${from} -> ${to}.`);
    this.name = "InvalidProgramLifecycleError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class ProgramArchiveBlockedError extends Error {
  constructor(programId: string, reasons: readonly string[]) {
    super(`Program ${programId} cannot be archived: ${reasons.join(", ")}.`);
    this.name = "ProgramArchiveBlockedError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class InvalidModuleKeyError extends Error {
  constructor(key: string) {
    super(`Unknown module key: ${key}`);
    this.name = "InvalidModuleKeyError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class ScheduleRuleNotApplicableError extends Error {
  constructor(programId: string) {
    super(`Schedule rules apply only to Recurring programs: ${programId}`);
    this.name = "ScheduleRuleNotApplicableError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class NoScheduleRulesError extends Error {
  constructor(programId: string) {
    super(
      `Program ${programId} has no schedule rules to generate events from.`
    );
    this.name = "NoScheduleRulesError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class DuplicateEventError extends Error {
  constructor(startsAt: string) {
    super(`An event already exists for this start time: ${startsAt}`);
    this.name = "DuplicateEventError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class DuplicateScheduleExceptionError extends Error {
  constructor(ruleId: string, overrideDate: string) {
    super(
      `Schedule exception already exists for rule ${ruleId} on ${overrideDate}`
    );
    this.name = "DuplicateScheduleExceptionError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class EnrollmentNotAllowedError extends Error {
  constructor(programId: string, expected: string) {
    super(`Program ${programId} does not accept enrollment mode ${expected}.`);
    this.name = "EnrollmentNotAllowedError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class DuplicateEnrollmentError extends Error {
  constructor(programId: string, memberUserId: string) {
    super(
      `Member ${memberUserId} already has an open request or active enrollment for program ${programId}.`
    );
    this.name = "DuplicateEnrollmentError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class RequestNotDecidableError extends Error {
  constructor(requestId: string) {
    super(`Enrollment request ${requestId} is not in a decidable state.`);
    this.name = "RequestNotDecidableError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class SelfDelegationError extends Error {
  constructor(userId: string) {
    super(`A user cannot grant Program Leader to themselves: ${userId}`);
    this.name = "SelfDelegationError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class LeaderNotAssignedError extends Error {
  constructor(programId: string, userId: string) {
    super(`User ${userId} is not an active Program Leader of ${programId}.`);
    this.name = "LeaderNotAssignedError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class LeaderAccountInactiveError extends Error {
  constructor(userId: string) {
    super(`Cannot assign ${userId} as Program Leader: account is not Active.`);
    this.name = "LeaderAccountInactiveError";
  }
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
    const departmentScopeIds = new Set<string>();
    const departmentPrograms = await Promise.all(
      allDepartments.map(async (department) => {
        if (!(await this.isModuleEnabled(department.department_id))) {
          return [];
        }
        if (hasDepartmentManagementScope(department)) {
          departmentScopeIds.add(department.department_id);
        }
        const rows = await this.store.listProgramsForDepartment(
          department.department_id
        );
        const departmentScope = hasDepartmentManagementScope(department);
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
      ...departmentScopeIds,
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
      ({ capabilities }) =>
        capabilities.manage ||
        capabilities.publish ||
        capabilities.module_configure
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
    return row ? this.departmentView(ctx, row) : null;
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
      throw new InvalidProgramLifecycleError("Draft", "Archived");
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
        .filter((event) => event.status === "Active")
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
  ): Promise<ProgramView> {
    const old = await this.store.findProgramById(id);
    if (!old) {
      throw new AuthorizationDeniedError(CAPABILITY.PROGRAM_MANAGE);
    }
    if (!(await this.isModuleEnabled(old.department_id))) {
      throw new AuthorizationDeniedError(CAPABILITY.PROGRAM_MANAGE);
    }
    await this.ensure(ctx, CAPABILITY.PROGRAM_MANAGE, {
      departmentId: old.department_id,
      programId: old.program_id,
    });
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
            return {
              ...old,
              capabilities: await this.programCapabilities(ctx, old),
            };
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
              return {
                ...current,
                capabilities: await this.programCapabilities(ctx, current),
              };
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
        return {
          ...row,
          capabilities: await this.programCapabilities(ctx, row),
        };
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
    return { ...row, capabilities: await this.programCapabilities(ctx, row) };
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

  listDepartmentModules(
    ctx: AuthorizationContext,
    departmentId: string
  ): Promise<DepartmentModuleRow[]> {
    return this.store.listDepartmentModules(departmentId);
  }

  private async departmentView(
    ctx: AuthorizationContext,
    row: DepartmentRow
  ): Promise<DepartmentView> {
    const [manage, publish, moduleConfigure] = await Promise.all([
      this.authorizer.can(ctx, CAPABILITY.DEPARTMENT_MANAGE, {
        departmentId: row.department_id,
      }),
      this.authorizer.can(ctx, CAPABILITY.DEPARTMENT_PUBLISH, {
        departmentId: row.department_id,
      }),
      this.authorizer.can(ctx, CAPABILITY.DEPARTMENT_MODULE_CONFIGURE, {
        departmentId: row.department_id,
      }),
    ]);
    return {
      ...row,
      capabilities: {
        manage,
        publish,
        module_configure: moduleConfigure,
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

  async generateEvents(
    ctx: AuthorizationContext,
    programId: string,
    horizonDays: number,
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
    const rules = await this.store.listScheduleRules(programId);
    if (rules.length === 0) {
      await this.audit(
        ctx,
        "EVENT_GENERATE",
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
      rules.map((r) => r.rule_id)
    );
    const now = new Date().toISOString();
    const fromDate = hkTodayWallDate();
    let created = 0;
    let skipped = 0;
    const insertions: Promise<boolean>[] = [];
    for (const rule of rules) {
      const occurrences = occurrencesForRule(
        rule,
        fromDate,
        horizonDays,
        exceptions
      );
      for (const occurrence of occurrences) {
        insertions.push(
          this.store.insertGeneratedEvent({
            program_id: programId,
            starts_at: occurrence.starts_at,
            ends_at: occurrence.ends_at,
            status: "Active",
            source: "SCHEDULE",
            cancel_reason: null,
            created_by: ctx.actorUserId,
            created_at: now,
            updated_by: ctx.actorUserId,
            updated_at: now,
          })
        );
      }
    }
    const results = await Promise.all(insertions);
    for (const inserted of results) {
      if (inserted) {
        created += 1;
      } else {
        skipped += 1;
      }
    }
    const result: GenerateResult = {
      created,
      skipped,
      rule_count: rules.length,
    };
    await this.audit(
      ctx,
      "EVENT_GENERATE",
      "event",
      programId,
      "SUCCESS",
      null,
      result,
      correlationId
    );
    return result;
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
      source: "MANUAL",
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
    return decorated.filter((r) => r.status === "Active");
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
      throw new SelfDelegationError(userId);
    }
    if (!(await this.store.isAccountActive(userId))) {
      await this.audit(
        ctx,
        "PROGRAM_LEADER_GRANT",
        "program_leader",
        programId,
        "FAILED",
        null,
        { user_id: userId, reason: "target_account_not_active" },
        correlationId
      );
      throw new LeaderAccountInactiveError(userId);
    }
    const existing = await this.store.findProgramLeader(programId, userId);
    if (existing && existing.revoked_at === null) {
      await this.audit(
        ctx,
        "PROGRAM_LEADER_GRANT",
        "program_leader",
        programId,
        "DUPLICATE",
        existing,
        existing,
        correlationId
      );
      return existing;
    }
    const now = new Date().toISOString();
    const row = await this.store.assignProgramLeader({
      program_id: programId,
      user_id: userId,
      granted_by: ctx.actorUserId,
      granted_at: now,
    });
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
      throw new LeaderNotAssignedError(programId, userId);
    }
    if (existing.revoked_at !== null) {
      await this.audit(
        ctx,
        "PROGRAM_LEADER_REVOKE",
        "program_leader",
        programId,
        "DUPLICATE",
        existing,
        existing,
        correlationId
      );
      return existing;
    }
    const revoked = await this.store.revokeProgramLeader({
      program_id: programId,
      user_id: userId,
      revoked_by: ctx.actorUserId,
      revoked_at: new Date().toISOString(),
    });
    if (!revoked) {
      throw new LeaderNotAssignedError(programId, userId);
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
}
