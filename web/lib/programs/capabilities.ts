import type { Capability as IdentityCapability } from "../identity/capability-catalog";

export const DEPARTMENT_CAPABILITY = {
  MANAGE: "department.manage",
  PUBLISH: "department.publish",
  MODULE_CONFIGURE: "department.module.configure",
  MANAGER_ASSIGN: "department.manager.assign",
} as const;

export const PROGRAM_CAPABILITY = {
  MANAGE: "program.manage",
  PUBLISH: "program.publish",
  ENROLL: "program.enroll",
  LEADER_ASSIGN: "program.leader.assign",
} as const;

export const CAPABILITY = {
  DEPARTMENT_MANAGE: DEPARTMENT_CAPABILITY.MANAGE,
  DEPARTMENT_PUBLISH: DEPARTMENT_CAPABILITY.PUBLISH,
  DEPARTMENT_MODULE_CONFIGURE: DEPARTMENT_CAPABILITY.MODULE_CONFIGURE,
  DEPARTMENT_MANAGER_ASSIGN: DEPARTMENT_CAPABILITY.MANAGER_ASSIGN,
  PROGRAM_MANAGE: PROGRAM_CAPABILITY.MANAGE,
  PROGRAM_PUBLISH: PROGRAM_CAPABILITY.PUBLISH,
  PROGRAM_ENROLL: PROGRAM_CAPABILITY.ENROLL,
  PROGRAM_LEADER_ASSIGN: PROGRAM_CAPABILITY.LEADER_ASSIGN,
  ACCOUNT_PERMISSIONS_READ: "account.permissions.read",
  ACCOUNT_DIRECTORY_READ: "account.directory.read",
  REGISTRATION_APPROVAL_MANAGE: "registration.approval.manage",
  ACCOUNT_PERMISSIONS_WRITE: "account.permissions.write",
  HOME_PUBLISH: "home.publish",
} as const satisfies Record<string, IdentityCapability>;

export type Capability = IdentityCapability;

export interface DepartmentCapabilities {
  manage: boolean;
  publish: boolean;
  module_configure: boolean;
  manager_assign?: boolean;
}

/** A Department capability exposes its Programs in the management directory. */
export function hasDepartmentManagementScope(department: {
  capabilities: DepartmentCapabilities;
}): boolean {
  return (
    department.capabilities.manage ||
    department.capabilities.publish ||
    department.capabilities.module_configure ||
    department.capabilities.manager_assign === true
  );
}

export const MODULE_KEY = {
  PROGRAM_CATALOG: "program_catalog",
  ENROLLMENT: "enrollment",
  EVENTS: "events",
  ATTENDANCE: "attendance",
  CUSTOM_FORMS: "custom_forms",
} as const;

export type ModuleKey = (typeof MODULE_KEY)[keyof typeof MODULE_KEY];

export const MODULE_KEYS: ModuleKey[] = Object.values(MODULE_KEY);
