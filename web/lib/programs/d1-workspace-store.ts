/**
 * EFCC Programs domain — D1 persistence adapter (WorkspaceStore).
 */

import type { Capability, ModuleKey } from "./capabilities";
import type { RolePolicyStore } from "./capability-authorizer";
import type {
  AuditInput,
  DepartmentInput,
  DepartmentModuleRow,
  DepartmentRow,
  DepartmentUpdate,
  ProgramInput,
  ProgramRow,
  ProgramUpdate,
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

  async seedRolePolicies(
    policies: Record<string, { capability: string; granted_at: string }[]>
  ): Promise<void> {
    const statements = Object.entries(policies).flatMap(([role, caps]) =>
      caps.map(({ capability, granted_at }) =>
        this.db
          .prepare(
            `INSERT OR IGNORE INTO role_capabilities (role, capability, granted_at)
             VALUES (?, ?, ?)`
          )
          .bind(role, capability, granted_at)
          .run()
      )
    );
    await Promise.all(statements);
  }

  async createDepartment(input: DepartmentInput): Promise<DepartmentRow> {
    const id = crypto.randomUUID();
    await this.db
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
      )
      .run();
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
