/**
 * EFCC Programs domain — D1 persistence adapter (WorkspaceStore).
 */

import { MODULE_KEYS } from "./capabilities";
import type { Capability, ModuleKey } from "./capabilities";
import type { RolePolicyStore } from "./capability-authorizer";
import type {
  AuditInput,
  GenerationRunItemInput,
  GenerationRunItemRow,
  GenerationRunRow,
  GenerationRunStatus,
  ProgramAccessRow,
  DepartmentInput,
  DepartmentManagerGrantInput,
  DepartmentManagerRevokeInput,
  DepartmentManagerRow,
  DepartmentModuleRow,
  DepartmentRow,
  DepartmentUpdate,
  EnrollmentInput,
  EnrollmentRequestInput,
  EnrollmentRequestRow,
  EnrollmentRow,
  EventInput,
  EventRow,
  PreviewOccurrenceRow,
  PreviewPlanRow,
  ProgramInput,
  ProgramLeaderGrantInput,
  ProgramLeaderRevokeInput,
  ProgramLeaderRow,
  ProgramRow,
  ProgramUpdate,
  MemberOptionRow,
  ScheduleExceptionInput,
  ScheduleExceptionRow,
  ScheduleRuleInput,
  ScheduleRuleRow,
  ScheduleRuleUpdate,
  WorkspaceStore,
} from "./workspace-store";

// oxlint-disable-next-line eslint/max-classes-per-file
export class WorkspaceNotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`Unknown ${entity}: ${id}`);
    this.name = "WorkspaceNotFoundError";
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class D1WorkspaceStore implements WorkspaceStore, RolePolicyStore {
  readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  private async requireDepartment(id: string): Promise<DepartmentRow> {
    const row = await this.findDepartmentById(id);
    if (!row) {
      throw new WorkspaceNotFoundError("department", id);
    }
    return row;
  }

  private async requireProgram(id: string): Promise<ProgramRow> {
    const row = await this.findProgramById(id);
    if (!row) {
      throw new WorkspaceNotFoundError("program", id);
    }
    return row;
  }

  async isAccountActive(userId: string): Promise<boolean> {
    const row = await this.db
      .prepare(
        "SELECT 1 FROM accounts WHERE user_id = ? AND account_status = 'Active'"
      )
      .bind(userId)
      .first<{ _: 1 }>();
    return row !== null;
  }

  async createDepartment(input: DepartmentInput): Promise<DepartmentRow> {
    const id = crypto.randomUUID();
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO departments (department_id, code, name, description, lifecycle,
             display_order, created_by, created_at, updated_by, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          input.code,
          input.name,
          input.description ?? null,
          input.lifecycle,
          input.display_order ?? 0,
          input.created_by,
          input.created_at,
          input.updated_by,
          input.updated_at
        ),
      ...MODULE_KEYS.map((moduleKey) =>
        this.db
          .prepare(
            `INSERT INTO department_modules
               (department_id, module_key, enabled, enabled_by, enabled_at)
             VALUES (?, ?, 0, NULL, ?)`
          )
          .bind(id, moduleKey, input.created_at)
      ),
    ]);
    return this.requireDepartment(id);
  }

  async listDepartments(): Promise<DepartmentRow[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM departments
         ORDER BY display_order ASC, created_at ASC`
      )
      .all<DepartmentRow>();
    return result.results ?? [];
  }

  async findDepartmentById(id: string): Promise<DepartmentRow | null> {
    if (!id) {
      return null;
    }
    return (
      (await this.db
        .prepare("SELECT * FROM departments WHERE department_id = ?")
        .bind(id)
        .first<DepartmentRow>()) ?? null
    );
  }

  async findDepartmentByCode(code: string): Promise<DepartmentRow | null> {
    if (!code) {
      return null;
    }
    return (
      (await this.db
        .prepare("SELECT * FROM departments WHERE code = ?")
        .bind(code)
        .first<DepartmentRow>()) ?? null
    );
  }

  async updateDepartment(
    id: string,
    update: DepartmentUpdate
  ): Promise<DepartmentRow> {
    const current = await this.findDepartmentById(id);
    if (!current) {
      throw new WorkspaceNotFoundError("department", id);
    }
    const fields: string[] = [];
    const values: (string | number | null)[] = [];
    if (update.name !== undefined) {
      fields.push("name = ?");
      values.push(update.name);
    }
    if (update.description !== undefined) {
      fields.push("description = ?");
      values.push(update.description ?? null);
    }
    if (update.lifecycle !== undefined) {
      fields.push("lifecycle = ?");
      values.push(update.lifecycle);
    }
    if (update.display_order !== undefined) {
      fields.push("display_order = ?");
      values.push(update.display_order);
    }
    fields.push("updated_by = ?", "updated_at = ?");
    values.push(update.updated_by, update.updated_at, id);

    await this.db
      .prepare(
        `UPDATE departments SET ${fields.join(", ")} WHERE department_id = ?`
      )
      .bind(...values)
      .run();
    return this.requireDepartment(id);
  }

  async createProgram(input: ProgramInput): Promise<ProgramRow> {
    const id = crypto.randomUUID();
    await this.db
      .prepare(
        `INSERT INTO programs (program_id, department_id, name, description,
           category, behavior_type, lifecycle, discoverability, enrollment_mode,
           display_order, created_by, created_at, updated_by, updated_at,
           check_in_token)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
           lower(hex(randomblob(16))))`
      )
      .bind(
        id,
        input.department_id,
        input.name,
        input.description ?? null,
        input.category ?? null,
        input.behavior_type,
        input.lifecycle,
        input.discoverability,
        input.enrollment_mode,
        input.display_order ?? 0,
        input.created_by,
        input.created_at,
        input.updated_by,
        input.updated_at
      )
      .run();
    return this.requireProgram(id);
  }

  async listProgramsForDepartment(departmentId: string): Promise<ProgramRow[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM programs WHERE department_id = ?
         ORDER BY display_order ASC, created_at ASC`
      )
      .bind(departmentId)
      .all<ProgramRow>();
    return result.results ?? [];
  }

  async listProgramAccessRows(
    departmentId: string
  ): Promise<ProgramAccessRow[]> {
    const result = await this.db
      .prepare(
        `SELECT program_id, department_id FROM programs
         WHERE department_id = ?
         ORDER BY display_order ASC, created_at ASC`
      )
      .bind(departmentId)
      .all<ProgramAccessRow>();
    return result.results ?? [];
  }

  async findProgramById(id: string): Promise<ProgramRow | null> {
    if (!id) {
      return null;
    }
    return (
      (await this.db
        .prepare("SELECT * FROM programs WHERE program_id = ?")
        .bind(id)
        .first<ProgramRow>()) ?? null
    );
  }

  async searchActiveMembers(
    query: string,
    limit: number
  ): Promise<MemberOptionRow[]> {
    const escaped = query.replaceAll(/[\\%_]/gu, "\\$&");
    const pattern = `%${escaped}%`;
    const result = await this.db
      .prepare(
        `SELECT user_id, name, username
           FROM accounts
          WHERE account_status = 'Active'
            AND (name LIKE ? ESCAPE '\\' OR username LIKE ? ESCAPE '\\')
          ORDER BY name ASC, username ASC
          LIMIT ?`
      )
      .bind(pattern, pattern, limit)
      .all<MemberOptionRow>();
    return result.results ?? [];
  }

  private static programUpdateParts(update: ProgramUpdate): {
    fields: string[];
    values: (string | number | null)[];
  } {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];
    if (update.name !== undefined) {
      fields.push("name = ?");
      values.push(update.name);
    }
    if (update.description !== undefined) {
      fields.push("description = ?");
      values.push(update.description ?? null);
    }
    if (update.category !== undefined) {
      fields.push("category = ?");
      values.push(update.category ?? null);
    }
    if (update.behavior_type !== undefined) {
      fields.push("behavior_type = ?");
      values.push(update.behavior_type);
    }
    if (update.lifecycle !== undefined) {
      fields.push("lifecycle = ?");
      values.push(update.lifecycle);
    }
    if (update.discoverability !== undefined) {
      fields.push("discoverability = ?");
      values.push(update.discoverability);
    }
    if (update.enrollment_mode !== undefined) {
      fields.push("enrollment_mode = ?");
      values.push(update.enrollment_mode);
    }
    if (update.display_order !== undefined) {
      fields.push("display_order = ?");
      values.push(update.display_order);
    }
    if (update.check_in_opens_at_minutes_before_start !== undefined) {
      fields.push("check_in_opens_at_minutes_before_start = ?");
      values.push(update.check_in_opens_at_minutes_before_start);
    }
    if (update.check_in_closes_at_minutes_after_end !== undefined) {
      fields.push("check_in_closes_at_minutes_after_end = ?");
      values.push(update.check_in_closes_at_minutes_after_end);
    }
    fields.push("updated_by = ?", "updated_at = ?");
    values.push(update.updated_by, update.updated_at);
    return { fields, values };
  }

  async updateProgram(id: string, update: ProgramUpdate): Promise<ProgramRow> {
    const current = await this.findProgramById(id);
    if (!current) {
      throw new WorkspaceNotFoundError("program", id);
    }
    const { fields, values } = D1WorkspaceStore.programUpdateParts(update);
    await this.db
      .prepare(`UPDATE programs SET ${fields.join(", ")} WHERE program_id = ?`)
      .bind(...values, id)
      .run();
    return this.requireProgram(id);
  }

  async archiveProgramIfClear(
    id: string,
    update: ProgramUpdate,
    now: string
  ): Promise<ProgramRow | null> {
    const { fields, values } = D1WorkspaceStore.programUpdateParts(update);
    const result = await this.db
      .prepare(
        `UPDATE programs
            SET ${fields.join(", ")}
          WHERE program_id = ?
            AND lifecycle = 'Active'
            AND NOT EXISTS (
              SELECT 1
                FROM events
               WHERE events.program_id = programs.program_id
                 AND events.status = 'Active'
                 AND events.starts_at IS NOT NULL
                 AND julianday(events.starts_at) > julianday(?)
            )
            AND NOT EXISTS (
              SELECT 1
                FROM enrollment_requests
               WHERE enrollment_requests.program_id = programs.program_id
                 AND enrollment_requests.status = 'Pending'
            )`
      )
      .bind(...values, id, now)
      .run();
    return result.meta.changes > 0 ? this.requireProgram(id) : null;
  }

  async setDepartmentModule(
    departmentId: string,
    moduleKey: ModuleKey,
    enabled: boolean,
    enabledBy: string | null,
    enabledAt: string
  ): Promise<DepartmentModuleRow> {
    await this.db
      .prepare(
        `INSERT INTO department_modules (department_id, module_key, enabled, enabled_by, enabled_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (department_id, module_key) DO UPDATE SET
           enabled = excluded.enabled,
           enabled_by = excluded.enabled_by,
           enabled_at = excluded.enabled_at`
      )
      .bind(departmentId, moduleKey, enabled ? 1 : 0, enabledBy, enabledAt)
      .run();
    const result = await this.db
      .prepare(
        "SELECT * FROM department_modules WHERE department_id = ? AND module_key = ?"
      )
      .bind(departmentId, moduleKey)
      .first<DepartmentModuleRow>();
    if (!result) {
      throw new WorkspaceNotFoundError("department_modules", departmentId);
    }
    return result;
  }

  async listDepartmentModules(
    departmentId: string
  ): Promise<DepartmentModuleRow[]> {
    const result = await this.db
      .prepare(
        "SELECT * FROM department_modules WHERE department_id = ? ORDER BY module_key ASC"
      )
      .bind(departmentId)
      .all<DepartmentModuleRow>();
    return result.results ?? [];
  }

  async createScheduleRule(input: ScheduleRuleInput): Promise<ScheduleRuleRow> {
    const ruleId = crypto.randomUUID();
    await this.db
      .prepare(
        `INSERT INTO program_schedule_rules (rule_id, program_id, recurrence,
           day_of_week, month_day, start_time, end_time, location, created_by,
           created_at, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        ruleId,
        input.program_id,
        input.recurrence,
        input.day_of_week,
        input.month_day,
        input.start_time,
        input.end_time,
        input.location ?? null,
        input.created_by,
        input.created_at,
        input.updated_by,
        input.updated_at
      )
      .run();
    const row = await this.findScheduleRule(ruleId);
    if (!row) {
      throw new WorkspaceNotFoundError("schedule_rule", ruleId);
    }
    return row;
  }

  async updateScheduleRule(
    ruleId: string,
    update: ScheduleRuleUpdate
  ): Promise<ScheduleRuleRow> {
    // location is nullable, so an explicit null (clear) must be
    // distinguishable from an absent field (keep). A sentinel flag drives a
    // CASE; COALESCE would silently ignore the clear.
    const locationProvided = update.location !== undefined;
    await this.db
      .prepare(
        `UPDATE program_schedule_rules SET
           recurrence = COALESCE(?, recurrence),
           day_of_week = COALESCE(?, day_of_week),
           month_day = COALESCE(?, month_day),
           start_time = COALESCE(?, start_time),
           end_time = COALESCE(?, end_time),
           location = CASE WHEN ? = 1 THEN ? ELSE location END,
           updated_by = ?,
           updated_at = ?
         WHERE rule_id = ?`
      )
      .bind(
        update.recurrence ?? null,
        update.day_of_week ?? null,
        update.month_day ?? null,
        update.start_time ?? null,
        update.end_time ?? null,
        locationProvided ? 1 : 0,
        update.location ?? null,
        update.updated_by,
        update.updated_at,
        ruleId
      )
      .run();
    const row = await this.findScheduleRule(ruleId);
    if (!row) {
      throw new WorkspaceNotFoundError("schedule_rule", ruleId);
    }
    return row;
  }

  async listScheduleRules(programId: string): Promise<ScheduleRuleRow[]> {
    const result = await this.db
      .prepare(
        "SELECT * FROM program_schedule_rules WHERE program_id = ? ORDER BY created_at ASC"
      )
      .bind(programId)
      .all<ScheduleRuleRow>();
    return result.results ?? [];
  }

  async findScheduleRule(ruleId: string): Promise<ScheduleRuleRow | null> {
    const row = await this.db
      .prepare("SELECT * FROM program_schedule_rules WHERE rule_id = ?")
      .bind(ruleId)
      .first<ScheduleRuleRow>();
    return row ?? null;
  }

  async createScheduleException(
    input: ScheduleExceptionInput
  ): Promise<ScheduleExceptionRow> {
    const exceptionId = crypto.randomUUID();
    await this.db
      .prepare(
        `INSERT INTO program_schedule_exceptions (exception_id, rule_id,
           override_date, action, new_start_time, new_end_time, created_by,
           created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        exceptionId,
        input.rule_id,
        input.override_date,
        input.action,
        input.new_start_time,
        input.new_end_time,
        input.created_by,
        input.created_at
      )
      .run();
    const row = await this.db
      .prepare(
        "SELECT * FROM program_schedule_exceptions WHERE exception_id = ?"
      )
      .bind(exceptionId)
      .first<ScheduleExceptionRow>();
    if (!row) {
      throw new WorkspaceNotFoundError("schedule_exception", exceptionId);
    }
    return row;
  }

  async deleteScheduleException(exceptionId: string): Promise<boolean> {
    const result = await this.db
      .prepare("DELETE FROM program_schedule_exceptions WHERE exception_id = ?")
      .bind(exceptionId)
      .run();
    return (result.meta?.changes ?? 0) > 0;
  }

  async listScheduleExceptions(
    ruleIds: string[]
  ): Promise<ScheduleExceptionRow[]> {
    if (ruleIds.length === 0) {
      return [];
    }
    const placeholders = ruleIds.map(() => "?").join(", ");
    const result = await this.db
      .prepare(
        `SELECT * FROM program_schedule_exceptions
         WHERE rule_id IN (${placeholders}) ORDER BY override_date ASC`
      )
      .bind(...ruleIds)
      .all<ScheduleExceptionRow>();
    return result.results ?? [];
  }

  async findScheduleException(
    exceptionId: string
  ): Promise<ScheduleExceptionRow | null> {
    const result = await this.db
      .prepare(
        "SELECT * FROM program_schedule_exceptions WHERE exception_id = ?"
      )
      .bind(exceptionId)
      .first<ScheduleExceptionRow>();
    return result ?? null;
  }

  async createEvent(input: EventInput): Promise<EventRow> {
    const eventId = crypto.randomUUID();
    await this.db
      .prepare(
        // Attendance readiness (migration 0004): every Event gets a never-
        // reused manual code plus a check-in window derived from the
        // Program's minutes-before/after config, exactly like the migration
        // backfill so fresh rows are check-in capable on day one.
        `INSERT INTO events (event_id, program_id, starts_at, ends_at, status,
           availability, source, name, location, cancel_reason, manual_check_in_code,
           check_in_window_opens_at, check_in_window_closes_at,
           created_by, created_at, updated_by, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
           upper(substr(hex(randomblob(4)), 1, 8)),
           COALESCE(?, strftime('%Y-%m-%dT%H:%M:%SZ', ?,
             printf('-%d minutes', (SELECT check_in_opens_at_minutes_before_start
               FROM programs WHERE programs.program_id = ?)))),
           COALESCE(?, strftime('%Y-%m-%dT%H:%M:%SZ', ?,
             printf('+%d minutes', (SELECT check_in_closes_at_minutes_after_end
               FROM programs WHERE programs.program_id = ?)))),
           ?, ?, ?, ?`
      )
      .bind(
        eventId,
        input.program_id,
        input.starts_at,
        input.ends_at,
        input.status,
        input.availability,
        input.source,
        input.name,
        input.location,
        input.cancel_reason,
        input.check_in_window_opens_at,
        input.starts_at,
        input.program_id,
        input.check_in_window_closes_at,
        input.ends_at,
        input.program_id,
        input.created_by,
        input.created_at,
        input.updated_by,
        input.updated_at
      )
      .run();
    const row = await this.findEventById(eventId);
    if (!row) {
      throw new WorkspaceNotFoundError("event", eventId);
    }
    return row;
  }

  async insertGeneratedEvent(input: EventInput): Promise<boolean> {
    const result = await this.db
      .prepare(
        `INSERT OR IGNORE INTO events (event_id, program_id, starts_at, ends_at,
         status, availability, source, name, location, cancel_reason, manual_check_in_code,
         check_in_window_opens_at, check_in_window_closes_at,
         created_by, created_at, updated_by, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         upper(substr(hex(randomblob(4)), 1, 8)),
         COALESCE(?, strftime('%Y-%m-%dT%H:%M:%SZ', ?,
           printf('-%d minutes', (SELECT check_in_opens_at_minutes_before_start
             FROM programs WHERE programs.program_id = ?)))),
         COALESCE(?, strftime('%Y-%m-%dT%H:%M:%SZ', ?,
           printf('+%d minutes', (SELECT check_in_closes_at_minutes_after_end
             FROM programs WHERE programs.program_id = ?)))),
         ?, ?, ?, ?`
      )
      .bind(
        crypto.randomUUID(),
        input.program_id,
        input.starts_at,
        input.ends_at,
        input.status,
        input.availability,
        input.source,
        input.name,
        input.location,
        input.cancel_reason,
        input.check_in_window_opens_at,
        input.starts_at,
        input.program_id,
        input.check_in_window_closes_at,
        input.ends_at,
        input.program_id,
        input.created_by,
        input.created_at,
        input.updated_by,
        input.updated_at
      )
      .run();
    return (result.meta?.changes ?? 0) > 0;
  }

  async findEventByStart(
    programId: string,
    startsAt: string
  ): Promise<EventRow | null> {
    const row = await this.db
      .prepare("SELECT * FROM events WHERE program_id = ? AND starts_at = ?")
      .bind(programId, startsAt)
      .first<EventRow>();
    return row ?? null;
  }

  async findEventById(id: string): Promise<EventRow | null> {
    const row = await this.db
      .prepare("SELECT * FROM events WHERE event_id = ?")
      .bind(id)
      .first<EventRow>();
    return row ?? null;
  }

  async listEvents(programId: string): Promise<EventRow[]> {
    const result = await this.db
      .prepare(
        "SELECT * FROM events WHERE program_id = ? ORDER BY starts_at ASC"
      )
      .bind(programId)
      .all<EventRow>();
    return result.results ?? [];
  }

  async cancelEvent(
    id: string,
    reason: string,
    updatedBy: string,
    updatedAt: string
  ): Promise<EventRow | null> {
    const result = await this.db
      .prepare(
        `UPDATE events SET status = 'Cancelled', cancel_reason = ?,
           updated_by = ?, updated_at = ?
         WHERE event_id = ? AND status = 'Active'`
      )
      .bind(reason, updatedBy, updatedAt, id)
      .run();
    if ((result.meta?.changes ?? 0) === 0) {
      return null;
    }
    return this.findEventById(id);
  }
  async updateEvent(
    id: string,
    update: {
      starts_at?: string;
      ends_at?: string;
      name?: string | null;
      location?: string | null;
      check_in_window_opens_at?: string | null;
      check_in_window_closes_at?: string | null;
      availability?: "Active" | "Inactive";
    },
    updatedBy: string,
    updatedAt: string
  ): Promise<EventRow | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    const entries: [string, unknown][] = [
      ["starts_at", update.starts_at],
      ["ends_at", update.ends_at],
      ["name", update.name],
      ["location", update.location],
      // EVT-01 (#251): an absent window field keeps the existing window; an
      // explicit null clears it. Same nullable convention as name/location.
      ["check_in_window_opens_at", update.check_in_window_opens_at],
      ["check_in_window_closes_at", update.check_in_window_closes_at],
      ["availability", update.availability],
    ];
    for (const [column, value] of entries) {
      if (value !== undefined) {
        fields.push(`${column} = ?`);
        values.push(value);
      }
    }
    if (fields.length === 0) {
      return this.findEventById(id);
    }
    fields.push("updated_by = ?", "updated_at = ?");
    values.push(updatedBy, updatedAt, id);
    await this.db
      .prepare(`UPDATE events SET ${fields.join(", ")} WHERE event_id = ?`)
      .bind(...values)
      .run();
    return this.findEventById(id);
  }

  async getEventParticipantSummary(
    eventId: string,
    programId: string
  ): Promise<{ active_enrollments: number; checked_in: number }> {
    const [enrollments, checkedIn] = await Promise.all([
      this.db
        .prepare(
          "SELECT COUNT(*) AS count FROM enrollments WHERE program_id = ? AND status = 'Active'"
        )
        .bind(programId)
        .first<{ count: number }>(),
      this.db
        .prepare(
          "SELECT COUNT(*) AS count FROM attendances WHERE event_id = ? AND status = 'Active'"
        )
        .bind(eventId)
        .first<{ count: number }>(),
    ]);
    return {
      active_enrollments: Number(enrollments?.count ?? 0),
      checked_in: Number(checkedIn?.count ?? 0),
    };
  }

  // --- EVT-02 (#252): preview plans and generation runs ---

  async findPreviewPlan(planId: string): Promise<PreviewPlanRow | null> {
    const row = await this.db
      .prepare("SELECT * FROM program_preview_plans WHERE plan_id = ?")
      .bind(planId)
      .first<PreviewPlanRow>();
    return row ?? null;
  }

  async findLatestPreviewPlan(
    programId: string
  ): Promise<PreviewPlanRow | null> {
    const row = await this.db
      .prepare(
        `SELECT * FROM program_preview_plans
         WHERE program_id = ? ORDER BY created_at DESC, plan_id DESC LIMIT 1`
      )
      .bind(programId)
      .first<PreviewPlanRow>();
    return row ?? null;
  }

  async listPreviewOccurrences(
    planId: string
  ): Promise<PreviewOccurrenceRow[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM program_preview_occurrences
         WHERE plan_id = ? ORDER BY occurs_on ASC, starts_at ASC, rule_id ASC`
      )
      .bind(planId)
      .all<PreviewOccurrenceRow>();
    return result.results ?? [];
  }

  async replacePreviewPlan(
    plan: PreviewPlanRow,
    occurrences: PreviewOccurrenceRow[]
  ): Promise<PreviewPlanRow> {
    // plan_id is deterministic (program + plan_hash), so the plan row and
    // its exact occurrence rows commit atomically: either the whole plan
    // materializes or nothing does. Identical inputs re-run the same
    // INSERT OR IGNORE statements, which also repairs any occurrence rows a
    // previous crash may have left missing before the plan is returned.
    //
    // Occurrence inserts are chunked at 500 statements per db.batch() so a
    // large valid schedule (horizon up to 365 days, no rule-count cap) never
    // exceeds D1's 1,000-statement batch() limit. The plan-row insert leads
    // the first chunk (or stands alone when the plan has zero occurrences).
    // A crash between chunks self-heals on the next identical preview: every
    // chunk is INSERT OR IGNORE, so the repair philosophy is unchanged.
    const planStatement = this.db
      .prepare(
        `INSERT OR IGNORE INTO program_preview_plans (plan_id, program_id,
           plan_hash, horizon_days, from_date, rule_count, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        plan.plan_id,
        plan.program_id,
        plan.plan_hash,
        plan.horizon_days,
        plan.from_date,
        plan.rule_count,
        plan.created_by,
        plan.created_at
      );
    const occurrenceStatements = (rows: PreviewOccurrenceRow[]) =>
      rows.map((occurrence) =>
        this.db
          .prepare(
            `INSERT OR IGNORE INTO program_preview_occurrences
               (occurrence_id, plan_id, rule_id, occurs_on, starts_at, ends_at,
                location, skip_reason, exception_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            occurrence.occurrence_id,
            occurrence.plan_id,
            occurrence.rule_id,
            occurrence.occurs_on,
            occurrence.starts_at,
            occurrence.ends_at,
            occurrence.location,
            occurrence.skip_reason,
            occurrence.exception_id
          )
      );
    const CHUNK_SIZE = 500;
    await this.db.batch([
      planStatement,
      ...occurrenceStatements(occurrences.slice(0, CHUNK_SIZE)),
    ]);
    for (let offset = CHUNK_SIZE; offset < occurrences.length; offset += CHUNK_SIZE) {
      await this.db.batch(
        occurrenceStatements(occurrences.slice(offset, offset + CHUNK_SIZE))
      );
    }
    const persisted = await this.db
      .prepare(
        `SELECT * FROM program_preview_plans
         WHERE program_id = ? AND plan_hash = ?`
      )
      .bind(plan.program_id, plan.plan_hash)
      .first<PreviewPlanRow>();
    if (!persisted) {
      throw new WorkspaceNotFoundError("preview_plan", plan.plan_id);
    }
    return persisted;
  }

  async findGenerationRunByPlan(planId: string): Promise<GenerationRunRow | null> {
    const row = await this.db
      .prepare("SELECT * FROM program_generation_runs WHERE plan_id = ?")
      .bind(planId)
      .first<GenerationRunRow>();
    return row ?? null;
  }

  async createGenerationRun(input: {
    run_id: string;
    program_id: string;
    plan_id: string;
    started_at: string;
    created_by: string | null;
    correlation_id: string | null;
  }): Promise<{ run: GenerationRunRow; created: boolean }> {
    const result = await this.db
      .prepare(
        `INSERT OR IGNORE INTO program_generation_runs (run_id, program_id,
           plan_id, status, created, skipped, failed, started_at, created_by,
           correlation_id)
         VALUES (?, ?, ?, 'partial', 0, 0, 0, ?, ?, ?)`
      )
      .bind(
        input.run_id,
        input.program_id,
        input.plan_id,
        input.started_at,
        input.created_by,
        input.correlation_id
      )
      .run();
    const row = await this.findGenerationRunByPlan(input.plan_id);
    if (!row) {
      throw new WorkspaceNotFoundError("generation_run", input.run_id);
    }
    return { run: row, created: (result.meta?.changes ?? 0) > 0 };
  }

  async listGenerationRunItems(runId: string): Promise<GenerationRunItemRow[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM program_generation_run_items
         WHERE run_id = ? ORDER BY item_id ASC`
      )
      .bind(runId)
      .all<GenerationRunItemRow>();
    return result.results ?? [];
  }

  /**
   * Record one attempt durably. Fresh occurrences insert; an existing row is
   * only superseded when it previously FAILED (retry after a partial run),
   * so terminal created/skipped outcomes are never overwritten by a
   * concurrent or repeated request.
   */
  async recordGenerationRunItem(
    input: GenerationRunItemInput
  ): Promise<boolean> {
    const result = await this.db
      .prepare(
        `INSERT INTO program_generation_run_items (item_id, run_id,
           occurrence_id, starts_at, outcome, event_id, detail)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(run_id, occurrence_id) DO UPDATE SET
           outcome = excluded.outcome,
           event_id = excluded.event_id,
           detail = excluded.detail
         WHERE outcome = 'failed'`
      )
      .bind(
        input.item_id,
        input.run_id,
        input.occurrence_id,
        input.starts_at,
        input.outcome,
        input.event_id,
        input.detail
      )
      .run();
    return (result.meta?.changes ?? 0) > 0;
  }

  /**
   * Settle a run from its durable item rows in one atomic statement. The
   * counts and status are recomputed from program_generation_run_items
   * inside the UPDATE, so a caller can never mark a run terminal from an
   * incomplete snapshot while another request is still recording. The
   * `status != 'completed'` guard keeps the run re-settlable while it is
   * partial/failed — a retry that fixes previously-failed items must be
   * able to update the run's counts/status even though `finished_at` was
   * already written by the first settlement — and locks the row only once
   * every occurrence genuinely reached a terminal created/skipped outcome
   * (matching `generateEvents`'s `status === "completed"` short-circuit).
   * The UPDATE recomputes every column idempotently from the item table,
   * so repeat/concurrent finishers always converge on the same counts.
   */
  async finishGenerationRun(
    runId: string,
    finishedAt: string
  ): Promise<GenerationRunRow> {
    await this.db
      .prepare(
        `UPDATE program_generation_runs SET
          created = (SELECT COUNT(*) FROM program_generation_run_items
                     WHERE run_id = ?1 AND outcome = 'created'),
          skipped = (SELECT COUNT(*) FROM program_generation_run_items
                     WHERE run_id = ?1 AND outcome = 'skipped'),
          failed  = (SELECT COUNT(*) FROM program_generation_run_items
                     WHERE run_id = ?1 AND outcome = 'failed'),
          status = CASE
            WHEN (SELECT COUNT(*) FROM program_generation_run_items
                  WHERE run_id = ?1 AND outcome = 'failed') = 0
              THEN 'completed'
            WHEN (SELECT COUNT(*) FROM program_generation_run_items
                  WHERE run_id = ?1 AND outcome IN ('created','skipped')) > 0
              THEN 'partial'
            ELSE 'failed'
          END,
          finished_at = ?2
        WHERE run_id = ?1 AND status != 'completed'`
      )
      .bind(runId, finishedAt)
      .run();
    const row = await this.db
      .prepare("SELECT * FROM program_generation_runs WHERE run_id = ?")
      .bind(runId)
      .first<GenerationRunRow>();
    if (!row) {
      throw new WorkspaceNotFoundError("generation_run", runId);
    }
    return row;
  }

  async createEnrollmentRequest(
    input: EnrollmentRequestInput
  ): Promise<EnrollmentRequestRow> {
    await this.db
      .prepare(
        `INSERT INTO enrollment_requests (request_id, program_id, member_user_id,
           status, submitted_at, request_version)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.request_id,
        input.program_id,
        input.member_user_id,
        input.status,
        input.submitted_at,
        input.request_version
      )
      .run();
    const row = await this.findEnrollmentRequestById(input.request_id);
    if (!row) {
      throw new WorkspaceNotFoundError("enrollment_request", input.request_id);
    }
    return row;
  }

  async findEnrollmentRequestById(
    id: string
  ): Promise<EnrollmentRequestRow | null> {
    const row = await this.db
      .prepare("SELECT * FROM enrollment_requests WHERE request_id = ?")
      .bind(id)
      .first<EnrollmentRequestRow>();
    return row ?? null;
  }

  async findPendingRequestByMember(
    programId: string,
    memberUserId: string
  ): Promise<EnrollmentRequestRow | null> {
    const row = await this.db
      .prepare(
        `SELECT * FROM enrollment_requests
         WHERE program_id = ? AND member_user_id = ? AND status = 'Pending'
         ORDER BY submitted_at ASC`
      )
      .bind(programId, memberUserId)
      .first<EnrollmentRequestRow>();
    return row ?? null;
  }

  async listEnrollmentRequests(
    programId: string
  ): Promise<EnrollmentRequestRow[]> {
    const result = await this.db
      .prepare(
        `SELECT enrollment_requests.*, accounts.name AS member_name,
                accounts.username AS member_username
           FROM enrollment_requests
           LEFT JOIN accounts ON accounts.user_id = enrollment_requests.member_user_id
          WHERE enrollment_requests.program_id = ?
          ORDER BY enrollment_requests.submitted_at ASC`
      )
      .bind(programId)
      .all<EnrollmentRequestRow>();
    return result.results ?? [];
  }

  async listParticipantEnrollmentSnapshot(
    programId: string,
    memberUserId: string
  ): Promise<{
    requests: EnrollmentRequestRow[];
    enrollments: EnrollmentRow[];
  }> {
    const [requests, enrollments] = await this.db.batch([
      this.db
        .prepare(
          `SELECT * FROM enrollment_requests
           WHERE program_id = ? AND member_user_id = ?
           ORDER BY submitted_at ASC`
        )
        .bind(programId, memberUserId),
      this.db
        .prepare(
          `SELECT * FROM enrollments
           WHERE program_id = ? AND member_user_id = ?
           ORDER BY enrolled_at ASC`
        )
        .bind(programId, memberUserId),
    ]);
    return {
      requests: (requests.results ?? []) as EnrollmentRequestRow[],
      enrollments: (enrollments.results ?? []) as EnrollmentRow[],
    };
  }

  async decideRequest(
    id: string,
    decision: "Approved" | "Rejected",
    decidedBy: string,
    decidedAt: string,
    note: string | null,
    audit: AuditInput
  ): Promise<EnrollmentRequestRow | null> {
    const results = await this.db.batch([
      this.db
        .prepare(
          `UPDATE enrollment_requests
           SET status = ?, decided_by = ?, decided_at = ?, decision_note = ?
           WHERE request_id = ? AND status = 'Pending'`
        )
        .bind(decision, decidedBy, decidedAt, note, id),
      // ponytail: gate the audit on the same decided-state the UPDATE just
      // wrote, so a no-op decision (0 changes) inserts no audit row.
      this.db
        .prepare(
          `INSERT INTO audit_events (audit_id, inserted_at, actor_user_id, action,
             entity_type, entity_id, old_value_json, new_value_json, reason, outcome,
             correlation_id)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
             FROM enrollment_requests r
            WHERE r.request_id = ? AND r.status = ? AND r.decided_by = ? AND r.decided_at = ?`
        )
        .bind(
          audit.audit_id,
          audit.inserted_at,
          audit.actor_user_id,
          audit.action,
          audit.entity_type,
          audit.entity_id,
          audit.old_value_json,
          audit.new_value_json,
          audit.reason,
          audit.outcome,
          audit.correlation_id,
          id,
          decision,
          decidedBy,
          decidedAt
        ),
    ]);
    if ((results[0]?.meta?.changes ?? 0) === 0) {
      return null;
    }
    return this.findEnrollmentRequestById(id);
  }

  async approveEnrollmentRequest(input: {
    request_id: string;
    program_id: string;
    member_user_id: string;
    enrollment_id: string;
    decided_by: string;
    decided_at: string;
    note: string | null;
    auditCreate: AuditInput;
    auditDecide: AuditInput;
  }): Promise<{
    request: EnrollmentRequestRow;
    enrollment: EnrollmentRow;
  } | null> {
    const results = await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO enrollments (enrollment_id, program_id, member_user_id,
             request_id, status, enrolled_at, created_by, created_at)
           SELECT ?, r.program_id, r.member_user_id, ?, 'Active', ?, ?, ?
             FROM enrollment_requests r
            WHERE r.request_id = ? AND r.status = 'Pending'`
        )
        .bind(
          input.enrollment_id,
          input.request_id,
          input.decided_at,
          input.decided_by,
          input.decided_at,
          input.request_id
        ),
      this.db
        .prepare(
          `UPDATE enrollment_requests
           SET status = 'Approved', decided_by = ?, decided_at = ?, decision_note = ?
           WHERE request_id = ? AND status = 'Pending'`
        )
        .bind(input.decided_by, input.decided_at, input.note, input.request_id),
      // ponytail: gate both audits on the enrollment row the INSERT..SELECT
      // just created, so a no-op batch (0-row select) inserts no audit rows.
      this.auditInsertGated(input.auditCreate, input.enrollment_id),
      this.auditInsertGated(input.auditDecide, input.enrollment_id),
    ]);
    if ((results[1]?.meta?.changes ?? 0) === 0) {
      return null;
    }
    const [request, enrollment] = await Promise.all([
      this.findEnrollmentRequestById(input.request_id),
      this.findEnrollmentById(input.enrollment_id),
    ]);
    if (!request || !enrollment) {
      throw new WorkspaceNotFoundError("enrollment", input.enrollment_id);
    }
    return { request, enrollment };
  }

  async withdrawRequest(
    id: string,
    memberUserId: string,
    withdrawnAt: string
  ): Promise<EnrollmentRequestRow | null> {
    const result = await this.db
      .prepare(
        `UPDATE enrollment_requests
         SET status = 'Withdrawn', decided_by = ?, decided_at = ?
         WHERE request_id = ? AND status = 'Pending' AND member_user_id = ?`
      )
      .bind(memberUserId, withdrawnAt, id, memberUserId)
      .run();
    if ((result.meta?.changes ?? 0) === 0) {
      return null;
    }
    return this.findEnrollmentRequestById(id);
  }

  async createEnrollment(input: EnrollmentInput): Promise<EnrollmentRow> {
    await this.db
      .prepare(
        `INSERT INTO enrollments (enrollment_id, program_id, member_user_id,
           request_id, status, enrolled_at, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.enrollment_id,
        input.program_id,
        input.member_user_id,
        input.request_id,
        input.status,
        input.enrolled_at,
        input.created_by,
        input.created_at
      )
      .run();
    const row = await this.findEnrollmentById(input.enrollment_id);
    if (!row) {
      throw new WorkspaceNotFoundError("enrollment", input.enrollment_id);
    }
    return row;
  }

  async hasActiveEnrollment(
    programId: string,
    memberUserId: string
  ): Promise<boolean> {
    const row = await this.db
      .prepare(
        `SELECT enrollment_id FROM enrollments
         WHERE program_id = ? AND member_user_id = ? AND status = 'Active'`
      )
      .bind(programId, memberUserId)
      .first<{ enrollment_id: string }>();
    return row !== null;
  }

  async findActiveEnrollment(
    programId: string,
    memberUserId: string
  ): Promise<EnrollmentRow | null> {
    const row = await this.db
      .prepare(
        `SELECT * FROM enrollments
         WHERE program_id = ? AND member_user_id = ? AND status = 'Active'`
      )
      .bind(programId, memberUserId)
      .first<EnrollmentRow>();
    return row ?? null;
  }

  async findEnrollmentById(id: string): Promise<EnrollmentRow | null> {
    const row = await this.db
      .prepare("SELECT * FROM enrollments WHERE enrollment_id = ?")
      .bind(id)
      .first<EnrollmentRow>();
    return row ?? null;
  }

  async listEnrollments(programId: string): Promise<EnrollmentRow[]> {
    const result = await this.db
      .prepare(
        `SELECT enrollments.*, accounts.name AS member_name,
                accounts.username AS member_username
           FROM enrollments
           LEFT JOIN accounts ON accounts.user_id = enrollments.member_user_id
          WHERE enrollments.program_id = ?
          ORDER BY enrollments.enrolled_at ASC`
      )
      .bind(programId)
      .all<EnrollmentRow>();
    return result.results ?? [];
  }

  async cancelEnrollment(
    id: string,
    cancelledBy: string,
    cancelledAt: string
  ): Promise<EnrollmentRow | null> {
    const result = await this.db
      .prepare(
        `UPDATE enrollments
         SET status = 'Cancelled', cancelled_by = ?, cancelled_at = ?
         WHERE enrollment_id = ? AND status = 'Active'`
      )
      .bind(cancelledBy, cancelledAt, id)
      .run();
    if ((result.meta?.changes ?? 0) === 0) {
      return null;
    }
    return this.findEnrollmentById(id);
  }

  findDepartmentManager(
    departmentId: string,
    userId: string
  ): Promise<DepartmentManagerRow | null> {
    return this.db
      .prepare(
        `SELECT department_id, user_id, granted_by, granted_at, revoked_by, revoked_at
           FROM department_managers
          WHERE department_id = ? AND user_id = ?`
      )
      .bind(departmentId, userId)
      .first<DepartmentManagerRow>();
  }

  listDepartmentManagers(
    departmentId: string
  ): Promise<DepartmentManagerRow[]> {
    return this.db
      .prepare(
        `SELECT department_managers.*, accounts.name AS user_name,
                accounts.username
           FROM department_managers
           LEFT JOIN accounts ON accounts.user_id = department_managers.user_id
          WHERE department_managers.department_id = ?
            AND department_managers.revoked_at IS NULL
          ORDER BY department_managers.granted_at`
      )
      .bind(departmentId)
      .all<DepartmentManagerRow>()
      .then((result) => result.results);
  }

  async assignDepartmentManager(
    input: DepartmentManagerGrantInput
  ): Promise<DepartmentManagerRow> {
    const existing = await this.findDepartmentManager(
      input.department_id,
      input.user_id
    );
    if (existing?.revoked_at === null) {
      return existing;
    }
    await this.db
      .prepare(
        existing
          ? `UPDATE department_managers
                SET granted_by = ?, granted_at = ?, revoked_by = NULL, revoked_at = NULL
              WHERE department_id = ? AND user_id = ? AND revoked_at IS NOT NULL`
          : `INSERT INTO department_managers
                (department_id, user_id, granted_by, granted_at)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(department_id, user_id) DO NOTHING`
      )
      .bind(
        ...(existing
          ? [
              input.granted_by,
              input.granted_at,
              input.department_id,
              input.user_id,
            ]
          : [
              input.department_id,
              input.user_id,
              input.granted_by,
              input.granted_at,
            ])
      )
      .run();
    const row = await this.findDepartmentManager(
      input.department_id,
      input.user_id
    );
    if (!row) {
      throw new Error("department manager row missing after assign");
    }
    return row;
  }

  async revokeDepartmentManager(
    input: DepartmentManagerRevokeInput
  ): Promise<DepartmentManagerRow | null> {
    await this.db
      .prepare(
        `UPDATE department_managers
            SET revoked_by = ?, revoked_at = ?
          WHERE department_id = ? AND user_id = ? AND revoked_at IS NULL`
      )
      .bind(
        input.revoked_by,
        input.revoked_at,
        input.department_id,
        input.user_id
      )
      .run();
    return this.findDepartmentManager(input.department_id, input.user_id);
  }

  findProgramLeader(
    programId: string,
    userId: string
  ): Promise<ProgramLeaderRow | null> {
    return this.db
      .prepare(
        `SELECT program_id, user_id, granted_by, granted_at, revoked_by, revoked_at
         FROM program_leaders
         WHERE program_id = ? AND user_id = ?`
      )
      .bind(programId, userId)
      .first<ProgramLeaderRow>();
  }

  listProgramLeaders(programId: string): Promise<ProgramLeaderRow[]> {
    return this.db
      .prepare(
        `SELECT program_leaders.*, accounts.name AS user_name,
                accounts.username
           FROM program_leaders
           LEFT JOIN accounts ON accounts.user_id = program_leaders.user_id
          WHERE program_leaders.program_id = ? AND program_leaders.revoked_at IS NULL
          ORDER BY program_leaders.granted_at`
      )
      .bind(programId)
      .all<ProgramLeaderRow>()
      .then((r) => r.results);
  }

  async assignProgramLeader(
    input: ProgramLeaderGrantInput
  ): Promise<ProgramLeaderRow> {
    const existing = await this.findProgramLeader(
      input.program_id,
      input.user_id
    );
    const sql = existing
      ? `UPDATE program_leaders
         SET granted_by = ?, granted_at = ?, revoked_by = NULL, revoked_at = NULL
         WHERE program_id = ? AND user_id = ? AND revoked_at IS NOT NULL`
      : `INSERT INTO program_leaders (program_id, user_id, granted_by, granted_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(program_id, user_id) DO NOTHING`;
    const args = existing
      ? [input.granted_by, input.granted_at, input.program_id, input.user_id]
      : [input.program_id, input.user_id, input.granted_by, input.granted_at];
    await this.db
      .prepare(sql)
      .bind(...args)
      .run();
    const row = await this.findProgramLeader(input.program_id, input.user_id);
    if (!row) {
      throw new Error("program leader row missing after assign");
    }
    return row;
  }

  async revokeProgramLeader(
    input: ProgramLeaderRevokeInput
  ): Promise<ProgramLeaderRow | null> {
    await this.db
      .prepare(
        `UPDATE program_leaders
         SET revoked_by = ?, revoked_at = ?
         WHERE program_id = ? AND user_id = ? AND revoked_at IS NULL`
      )
      .bind(input.revoked_by, input.revoked_at, input.program_id, input.user_id)
      .run();
    return this.findProgramLeader(input.program_id, input.user_id);
  }

  private auditInsertStatement(input: AuditInput): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO audit_events (audit_id, inserted_at, actor_user_id, action,
           entity_type, entity_id, old_value_json, new_value_json, reason, outcome,
           correlation_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.audit_id,
        input.inserted_at,
        input.actor_user_id,
        input.action,
        input.entity_type,
        input.entity_id,
        input.old_value_json,
        input.new_value_json,
        input.reason,
        input.outcome,
        input.correlation_id
      );
  }

  private auditInsertGated(
    input: AuditInput,
    enrollmentId: string
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO audit_events (audit_id, inserted_at, actor_user_id, action,
           entity_type, entity_id, old_value_json, new_value_json, reason, outcome,
           correlation_id)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           FROM enrollments e
          WHERE e.enrollment_id = ?`
      )
      .bind(
        input.audit_id,
        input.inserted_at,
        input.actor_user_id,
        input.action,
        input.entity_type,
        input.entity_id,
        input.old_value_json,
        input.new_value_json,
        input.reason,
        input.outcome,
        input.correlation_id,
        enrollmentId
      );
  }

  async audit(input: AuditInput): Promise<void> {
    await this.auditInsertStatement(input).run();
  }

  async hasCapability(role: string, capability: Capability): Promise<boolean> {
    const row = await this.db
      .prepare(
        "SELECT 1 FROM role_capabilities WHERE role = ? AND capability = ?"
      )
      .bind(role, capability)
      .first<{ 1: number }>();
    return row !== null;
  }

  async hasDepartmentManagement(
    userId: string,
    departmentId: string
  ): Promise<boolean> {
    const row = await this.db
      .prepare(
        `SELECT 1 FROM department_managers
          WHERE department_id = ? AND user_id = ? AND revoked_at IS NULL`
      )
      .bind(departmentId, userId)
      .first<{ 1: number }>();
    return row !== null;
  }

  async hasProgramLeadership(
    userId: string,
    programId: string
  ): Promise<boolean> {
    const row = await this.db
      .prepare(
        `SELECT 1 FROM program_leaders
         WHERE program_id = ? AND user_id = ? AND revoked_at IS NULL`
      )
      .bind(programId, userId)
      .first<{ 1: number }>();
    return row !== null;
  }
}
