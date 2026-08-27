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

export type PermissionPolicyGroup = "會友基礎" | "部門" | "課程" | "帳戶與系統";

/**
 * The read-side catalog for the global Permission Policy. The labels and
 * descriptions are product copy, while role values remain authoritative D1
 * data. Keeping the catalog beside the capability vocabulary prevents the
 * Worker and browser from inventing different group or copy orderings.
 */
export interface PermissionPolicyDefinition {
  key: Capability;
  label: string;
  description: string;
  group: PermissionPolicyGroup;
}

export const PERMISSION_POLICY_DEFINITIONS: readonly PermissionPolicyDefinition[] = [
  {
    key: CAPABILITY.PROGRAM_ENROLL,
    label: "提交課程報名",
    description: "以會友身份提交自己的課程報名",
    group: "會友基礎",
  },
  {
    key: CAPABILITY.DEPARTMENT_MANAGE,
    label: "部門管理",
    description: "編輯部門資料及日常運作",
    group: "部門",
  },
  {
    key: CAPABILITY.DEPARTMENT_PUBLISH,
    label: "部門發佈",
    description: "將部門發佈為使用中",
    group: "部門",
  },
  {
    key: CAPABILITY.DEPARTMENT_MODULE_CONFIGURE,
    label: "部門模組設定",
    description: "啟用或停用部門模組",
    group: "部門",
  },
  {
    key: CAPABILITY.DEPARTMENT_MANAGER_ASSIGN,
    label: "部門管理者指派",
    description: "指派或撤銷部門管理者",
    group: "部門",
  },
  {
    key: CAPABILITY.PROGRAM_MANAGE,
    label: "課程管理",
    description: "建立及編輯課程與聚會",
    group: "課程",
  },
  {
    key: CAPABILITY.PROGRAM_PUBLISH,
    label: "課程發佈",
    description: "將課程列入會友目錄",
    group: "課程",
  },
  {
    key: CAPABILITY.PROGRAM_LEADER_ASSIGN,
    label: "事工負責人指派",
    description: "指派或撤銷課程負責人",
    group: "課程",
  },
  {
    key: CAPABILITY.ACCOUNT_PERMISSIONS_READ,
    label: "查看權限政策",
    description: "查看帳戶與角色政策",
    group: "帳戶與系統",
  },
  {
    key: CAPABILITY.ACCOUNT_DIRECTORY_READ,
    label: "查看帳戶名錄",
    description: "搜尋全教會登入帳戶",
    group: "帳戶與系統",
  },
  {
    key: CAPABILITY.REGISTRATION_APPROVAL_MANAGE,
    label: "註冊審批",
    description: "核准或拒絕帳戶申請",
    group: "帳戶與系統",
  },
  {
    key: CAPABILITY.HOME_PUBLISH,
    label: "首頁內容發佈",
    description: "發佈全教會首頁內容",
    group: "帳戶與系統",
  },
  {
    key: CAPABILITY.ACCOUNT_PERMISSIONS_WRITE,
    label: "修改權限政策",
    description: "改變全系統角色權限",
    group: "帳戶與系統",
  },
] as const;

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
