/**
 * EFCC Programs domain — DepartmentWorkspace domain module.
 *
 * Owns Department/Program/module lifecycle, scope checks, audit, and transaction
 * invariants. The Worker HTTP handlers and browser UI are thin adapters around
 * this module.
 */

import { CAPABILITY, MODULE_KEYS } from "./capabilities";
import type { ModuleKey } from "./capabilities";
import { AuthorizationDeniedError } from "./capability-authorizer";
import type {
  AuthorizationContext,
  CapabilityAuthorizer,
} from "./capability-authorizer";
import type {
  DepartmentLifecycle,
  DepartmentRow,
  DepartmentUpdate,
  ProgramLifecycle,
  ProgramRow,
  ProgramUpdate,
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
}
