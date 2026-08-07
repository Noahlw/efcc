/**
 * EFCC Programs domain — D1 persistence adapter (WorkspaceStore).
 */

import { MODULE_KEYS } from "./capabilities";
import type { Capability, ModuleKey } from "./capabilities";
import type { RolePolicyStore } from "./capability-authorizer";
import type {
  AuditInput,
  DepartmentInput,
  DepartmentModuleRow,
  DepartmentRow,
  DepartmentUpdate,
  EnrollmentInput,
  EnrollmentRequestInput,
  EnrollmentRequestRow,
  EnrollmentRow,
  EventInput,
  EventRow,
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
           display_order, created_by, created_at, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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

  async listListedProgramsForDepartment(
    departmentId: string
  ): Promise<ProgramRow[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM programs
         WHERE department_id = ? AND discoverability = 'Listed'
         ORDER BY display_order ASC, created_at ASC`
      )
      .bind(departmentId)
      .all<ProgramRow>();
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
    programId: string,
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
            AND (EXISTS (SELECT 1 FROM enrollments e WHERE e.program_id = ? AND e.member_user_id = accounts.user_id)
              OR EXISTS (SELECT 1 FROM enrollment_requests r WHERE r.program_id = ? AND r.member_user_id = accounts.user_id)
              OR EXISTS (SELECT 1 FROM program_leaders pl WHERE pl.program_id = ? AND pl.user_id = accounts.user_id))
          ORDER BY name ASC, username ASC
          LIMIT ?`
      )
      .bind(pattern, pattern, programId, programId, programId, limit)
      .all<MemberOptionRow>();
    return result.results ?? [];
  }

  async updateProgram(id: string, update: ProgramUpdate): Promise<ProgramRow> {
    const current = await this.findProgramById(id);
    if (!current) {
      throw new WorkspaceNotFoundError("program", id);
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
    fields.push("updated_by = ?", "updated_at = ?");
    values.push(update.updated_by, update.updated_at, id);

    await this.db
      .prepare(`UPDATE programs SET ${fields.join(", ")} WHERE program_id = ?`)
      .bind(...values)
      .run();
    return this.requireProgram(id);
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
           day_of_week, month_day, start_time, end_time, created_by, created_at,
           updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        ruleId,
        input.program_id,
        input.recurrence,
        input.day_of_week,
        input.month_day,
        input.start_time,
        input.end_time,
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
    await this.db
      .prepare(
        `UPDATE program_schedule_rules SET
           recurrence = COALESCE(?, recurrence),
           day_of_week = COALESCE(?, day_of_week),
           month_day = COALESCE(?, month_day),
           start_time = COALESCE(?, start_time),
           end_time = COALESCE(?, end_time),
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
        `INSERT INTO events (event_id, program_id, starts_at, ends_at, status,
           source, cancel_reason, created_by, created_at, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        eventId,
        input.program_id,
        input.starts_at,
        input.ends_at,
        input.status,
        input.source,
        input.cancel_reason,
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
           status, source, cancel_reason, created_by, created_at, updated_by,
           updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        input.program_id,
        input.starts_at,
        input.ends_at,
        input.status,
        input.source,
        input.cancel_reason,
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
         WHERE event_id = ?`
      )
      .bind(reason, updatedBy, updatedAt, id)
      .run();
    if ((result.meta?.changes ?? 0) === 0) {
      return null;
    }
    return this.findEventById(id);
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

  async decideRequest(
    id: string,
    decision: "Approved" | "Rejected",
    decidedBy: string,
    decidedAt: string,
    note: string | null
  ): Promise<EnrollmentRequestRow | null> {
    const result = await this.db
      .prepare(
        `UPDATE enrollment_requests
         SET status = ?, decided_by = ?, decided_at = ?, decision_note = ?
         WHERE request_id = ? AND status = 'Pending'`
      )
      .bind(decision, decidedBy, decidedAt, note, id)
      .run();
    if ((result.meta?.changes ?? 0) === 0) {
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
  }): Promise<{ request: EnrollmentRequestRow; enrollment: EnrollmentRow } | null> {
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
        .bind(
          input.decided_by,
          input.decided_at,
          input.note,
          input.request_id
        ),
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

  listProgramLeaderHistory(programId: string): Promise<ProgramLeaderRow[]> {
    return this.db
      .prepare(
        `SELECT program_id, user_id, granted_by, granted_at, revoked_by, revoked_at
         FROM program_leaders
         WHERE program_id = ?
         ORDER BY granted_at`
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
         WHERE program_id = ? AND user_id = ?`
      : `INSERT INTO program_leaders (program_id, user_id, granted_by, granted_at)
         VALUES (?, ?, ?, ?)`;
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

  async audit(input: AuditInput): Promise<void> {
    await this.db
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
      )
      .run();
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
