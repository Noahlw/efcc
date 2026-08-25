/**
 * EFCC Programs domain — capability vocabulary (PRG-01 #197).
 *
 * Capabilities are coarse-grained domain verbs. The authorization seam
 * (capability-authorizer.ts) resolves whether an actor's effective policy
 * grants a capability for a given scope. No capability is implied by another;
 * the domain module composes them when an operation needs multiple powers.
 */

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
  // Account Permissions matrix read (087-03 #320). Role-policy seeded for
  // Admin + Staff in migration 0013; Department Manager is an effective
  // scoped profile with no role row, so DM-only actors are denied server-side.
  ACCOUNT_PERMISSIONS_READ: "account.permissions.read",
  // S4 Account Directory read and Registration Approval decision powers are
  // global identity-management capabilities, not Department/Program grants.
  ACCOUNT_DIRECTORY_READ: "account.directory.read",
  REGISTRATION_APPROVAL_MANAGE: "registration.approval.manage",
  // Only Admin may change the global authorization policy.
  ACCOUNT_PERMISSIONS_WRITE: "account.permissions.write",
  // Home Content CMS publish power (087-05). Home is church-wide, not
  // department-scoped, so this remains an Admin-only capability.
  HOME_PUBLISH: "home.publish",
} as const;

export type Capability = (typeof CAPABILITY)[keyof typeof CAPABILITY];

export type GlobalRole = "Admin" | "Staff" | "Member";

export const GLOBAL_ROLES = ["Admin", "Staff", "Member"] as const satisfies readonly GlobalRole[];

/**
 * S4's additive default policy. Every role retains the participant baseline;
 * Staff receives normal operational authority, while Admin-only powers change
 * church-wide content or the authorization system itself.
 */
export const ROLE_CAPABILITY_DEFAULTS: Record<
  GlobalRole,
  readonly Capability[]
> = {
  Admin: Object.values(CAPABILITY),
  Staff: Object.values(CAPABILITY).filter(
    (capability) =>
      capability !== CAPABILITY.ACCOUNT_PERMISSIONS_WRITE &&
      capability !== CAPABILITY.HOME_PUBLISH
  ),
  Member: [CAPABILITY.PROGRAM_ENROLL],
};

/**
 * Department-level capability flags as served to the client and used by the
 * domain module. `manager_assign` is optional because only management
 * projections carry it.
 */
export interface DepartmentCapabilities {
  manage: boolean;
  publish: boolean;
  module_configure: boolean;
  manager_assign?: boolean;
}

/**
 * Canonical department-level management scope rule (shared by the server
 * module and the client projections). Any department capability exposes the
 * department's Programs in the management directory; keep this in lockstep
 * with the scope the server uses to serve management rows.
 */
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

/** Approved product modules that may be enabled per Department. */
export const MODULE_KEY = {
  PROGRAM_CATALOG: "program_catalog",
  ENROLLMENT: "enrollment",
  EVENTS: "events",
  ATTENDANCE: "attendance",
  CUSTOM_FORMS: "custom_forms",
} as const;

export type ModuleKey = (typeof MODULE_KEY)[keyof typeof MODULE_KEY];

export const MODULE_KEYS: ModuleKey[] = Object.values(MODULE_KEY);
