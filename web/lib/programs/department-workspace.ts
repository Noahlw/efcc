/**
 * EFCC Programs domain — DepartmentWorkspace domain module.
 *
 * Owns Department/Program/module lifecycle, scope checks, audit, and transaction
 * invariants. The Worker HTTP handlers and browser UI are thin adapters around
 * this module.
 */

import { CAPABILITY, MODULE_KEYS } from "./capabilities";
import type { Capability, ModuleKey } from "./capabilities";
import { AuthorizationDeniedError } from "./capability-authorizer";
import type {
  AuthorizationContext,
  CapabilityAuthorizer,
} from "./capability-authorizer";
import { hkTodayWallDate, occurrencesForRule } from "./recurrence";
import type {
  DepartmentLifecycle,
  DepartmentRow,
  DepartmentUpdate,
  EventRow,
  GenerateResult,
  ProgramLifecycle,
  ProgramRow,
  ProgramUpdate,
  RecurrenceKind,
  ScheduleExceptionAction,
  ScheduleExceptionRow,
  ScheduleRuleRow,
  WorkspaceStore,
} from "./workspace-store";

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
export class DuplicateEventError extends Error {
  constructor(startsAt: string) {
    super(`An event already exists for this start time: ${startsAt}`);
    this.name = "DuplicateEventError";
  }
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

  private async audit(
    ctx: AuthorizationContext,
    action: string,
    entityType: string,
    entityId: string,
    outcome: "SUCCESS" | "DUPLICATE" | "CONFLICT" | "DENIED" | "FAILED",
    oldValue: unknown,
    newValue: unknown,
    correlationId: string | null
  ): Promise<void> {
    await this.store.audit({
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
    });
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

  listDepartments(_ctx: AuthorizationContext): Promise<DepartmentRow[]> {
    return this.store.listDepartments();
  }

  getDepartment(
    _ctx: AuthorizationContext,
    id: string
  ): Promise<DepartmentRow | null> {
    return this.store.findDepartmentById(id);
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
  ): Promise<ProgramRow[]> {
    const canManage = await this.authorizer.can(
      ctx,
      CAPABILITY.PROGRAM_MANAGE,
      {
        departmentId,
      }
    );
    if (canManage) {
      return this.store.listProgramsForDepartment(departmentId);
    }
    return this.store.listListedProgramsForDepartment(departmentId);
  }

  async getProgram(
    ctx: AuthorizationContext,
    id: string
  ): Promise<ProgramRow | null> {
    const row = await this.store.findProgramById(id);
    if (!row) {
      return null;
    }
    if (row.discoverability === "Unlisted") {
      const canSee = await this.authorizer.can(ctx, CAPABILITY.PROGRAM_MANAGE, {
        departmentId: row.department_id,
        programId: row.program_id,
      });
      if (!canSee) {
        return null;
      }
    }
    return row;
  }

  async updateProgram(
    ctx: AuthorizationContext,
    id: string,
    update: ProgramUpdate,
    correlationId: string | null
  ): Promise<ProgramRow> {
    const old = await this.store.findProgramById(id);
    if (!old) {
      throw new AuthorizationDeniedError(CAPABILITY.PROGRAM_MANAGE);
    }
    await this.ensure(ctx, CAPABILITY.PROGRAM_MANAGE, {
      departmentId: old.department_id,
      programId: old.program_id,
    });
    if (update.lifecycle === "Active" && old.lifecycle !== "Active") {
      await this.ensure(ctx, CAPABILITY.PROGRAM_PUBLISH, {
        departmentId: old.department_id,
        programId: old.program_id,
      });
    }
    const row = await this.store.updateProgram(id, {
      ...update,
      updated_by: ctx.actorUserId,
      updated_at: new Date().toISOString(),
    });
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
    return row;
  }

  async setDepartmentModule(
    ctx: AuthorizationContext,
    cmd: SetModuleCommand,
    correlationId: string | null
  ): Promise<void> {
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
  }

  async listDepartmentModules(
    ctx: AuthorizationContext,
    departmentId: string
  ): Promise<ModuleKey[]> {
    const rows = await this.store.listDepartmentModules(departmentId);
    return rows.filter((r) => r.enabled === 1).map((r) => r.module_key);
  }

  private async requireProgramFor(
    ctx: AuthorizationContext,
    programId: string,
    capability: Capability
  ): Promise<ProgramRow> {
    const program = await this.store.findProgramById(programId);
    if (!program) {
      throw new AuthorizationDeniedError(capability);
    }
    await this.ensure(ctx, capability, {
      departmentId: program.department_id,
      programId: program.program_id,
    });
    return program;
  }

  getScheduleRule(
    _ctx: AuthorizationContext,
    ruleId: string
  ): Promise<ScheduleRuleRow | null> {
    return this.store.findScheduleRule(ruleId);
  }

  listScheduleRules(
    _ctx: AuthorizationContext,
    programId: string
  ): Promise<ScheduleRuleRow[]> {
    return this.store.listScheduleRules(programId);
  }

  getScheduleException(
    _ctx: AuthorizationContext,
    exceptionId: string
  ): Promise<ScheduleExceptionRow | null> {
    return this.store.findScheduleException(exceptionId);
  }

  getEvent(_ctx: AuthorizationContext, eventId: string): Promise<EventRow | null> {
    return this.store.findEventById(eventId);
  }

  async createScheduleRule(
    ctx: AuthorizationContext,
    programId: string,
    cmd: CreateScheduleRuleCommand,
    correlationId: string | null
  ): Promise<ScheduleRuleRow> {    const program = await this.requireProgramFor(
      ctx,
      programId,
      CAPABILITY.PROGRAM_MANAGE
    );
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
    await this.requireProgramFor(
      ctx,
      rule.program_id,
      CAPABILITY.PROGRAM_MANAGE
    );
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
    await this.requireProgramFor(
      ctx,
      rule.program_id,
      CAPABILITY.PROGRAM_MANAGE
    );
    const row = await this.store.createScheduleException({
      rule_id: ruleId,
      ...cmd,
      created_by: ctx.actorUserId,
      created_at: new Date().toISOString(),
    });
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
    await this.requireProgramFor(
      ctx,
      rule.program_id,
      CAPABILITY.PROGRAM_MANAGE
    );
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
    if (program.behavior_type !== "Recurring") {
      throw new ScheduleRuleNotApplicableError(programId);
    }
    const rules = await this.store.listScheduleRules(programId);
    if (rules.length === 0) {
      return { created: 0, skipped: 0, rule_count: 0 };
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
    const result: GenerateResult = { created, skipped, rule_count: rules.length };
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
    await this.requireProgramFor(ctx, programId, CAPABILITY.PROGRAM_MANAGE);
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
    if (!program) {
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
    if (canManage) {
      return rows;
    }
    if (program.discoverability === "Unlisted") {
      return null;
    }
    return rows.filter((r) => r.status === "Active");
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
    await this.requireProgramFor(
      ctx,
      event.program_id,
      CAPABILITY.PROGRAM_MANAGE
    );
    const updated = await this.store.cancelEvent(
      eventId,
      cmd.reason,
      ctx.actorUserId,
      new Date().toISOString()
    );
    if (!updated) {
      throw new AuthorizationDeniedError(CAPABILITY.PROGRAM_MANAGE);
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
}
