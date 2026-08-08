/**
 * EFCC Programs domain — persistence seam (WorkspaceStore).
 *
 * The D1 adapter is used in production; tests may use an in-memory or test-D1
 * adapter. The new domain has no Sheet adapter and no dual-write path.
 */

import type { ModuleKey } from "./capabilities";

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
  description?: string;
  category?: string;
  behavior_type?: ProgramBehaviorType;
  lifecycle?: ProgramLifecycle;
  discoverability?: ProgramDiscoverability;
  enrollment_mode?: ProgramEnrollmentMode;
  display_order?: number;
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
}

export interface DepartmentModuleRow {
  department_id: string;
  module_key: ModuleKey;
  enabled: number;
  enabled_by: string | null;
  enabled_at: string;
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
  seedRolePolicies: (
    policies: Record<string, { capability: string; granted_at: string }[]>
  ) => Promise<void>;

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
  listListedProgramsForDepartment: (
    departmentId: string
  ) => Promise<ProgramRow[]>;
  findProgramById: (id: string) => Promise<ProgramRow | null>;
  updateProgram: (id: string, update: ProgramUpdate) => Promise<ProgramRow>;

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

  audit: (input: AuditInput) => Promise<void>;
}
