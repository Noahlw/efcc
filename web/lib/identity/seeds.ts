/**
 * EFCC D1 identity (Spec 091 §§ 2–6) — disposable pre-production seeds.
 *
 * The seeds are the single source of the disposable identity foundation:
 * the fixed Admin and 會友基礎 identities plus assignable Staff, the
 * fixed Department / Program categories (already created by migration 0019),
 * a representative scoped Department manager Role Definition, a
 * representative scoped Program leader Role Definition, and a small set of
 * Active accounts that hold the baseline 會友基礎 assignment.
 *
 * Seeds are idempotent (every INSERT is OR IGNORE on a stable key) and run
 * through the disposable preflight before any write. A non-disposable or
 * stale-schema database refuses the seed run with the same error the
 * preflight surfaces; the operator must follow the manual reset command
 * before re-running.
 */
/* oxlint-disable eslint/no-await-in-loop, eslint/no-inline-comments, eslint/require-unicode-regexp, typescript/array-type -- seeds are sequenced to honor the FK dependencies between role_definitions, role_definition_grants, role_assignments, and accounts. */
import { importLegacyUsers } from "../auth/accounts";
import { preflightDisposableSchema } from "./preflight";
import type { DisposableDatabaseInfo } from "./preflight";
import { CAPABILITY_CATALOG, PROTECTED_STABLE_KEYS } from "./types";
import type { Capability } from "./types";

const SYSTEM_DEFINITIONS = {
  ADMIN: {
    stable_key: PROTECTED_STABLE_KEYS.ADMIN,
    label: "系統管理員",
    description: "全教會唯一可改變授權政策、發佈首頁內容的身份。",
    position: 0,
  },
  STAFF: {
    stable_key: PROTECTED_STABLE_KEYS.STAFF,
    label: "同工",
    description:
      "全教會同工，可管理部門、課程與指派負責人，但不可變更授權政策。",
    position: 1,
  },
  MEMBER: {
    stable_key: PROTECTED_STABLE_KEYS.MEMBER,
    label: "會友基礎",
    description: "每位正式會友皆持有的最低限度身份，僅含提交課程報名。",
    position: 999,
  },
} as const;

const MEMBER_BASELINE_CAPABILITIES: readonly Capability[] = ["program.enroll"];
const STAFF_ROLE_CAPABILITIES: readonly Capability[] = [
  "role.read",
  "role.assign",
  "role.revoke",
  "role.reorder",
  "role.permissions.read",
  "role.permissions.write",
  "role.create",
  "role.delete",
];

const DEPARTMENT_MANAGER_ROLE_CAPABILITIES: readonly Capability[] = [
  "role.read",
  "role.assign",
  "role.revoke",
  "role.reorder",
  "role.permissions.read",
  "role.permissions.write",
];

const PROGRAM_LEADER_ROLE_CAPABILITIES: readonly Capability[] = [
  "role.read",
  "role.assign",
  "role.revoke",
];

const DEPARTMENT_MANAGER_ADULT = {
  role_definition_id: "018f3b8a-0000-7000-8000-100000000001",
  stable_key: "department.manager.adult",
  category_key: "Department" as const,
  label: "成人部門管理者",
  description: "可管理成人部門的日常運作及課程目錄。",
  scope_kind: "Department" as const,
  scope_id: "018f3b8a-0000-7000-8000-000000000002", // 成區
  position: 10,
  capabilities: [
    "department.manage",
    "department.publish",
    "department.module.configure",
    "program.manage",
    "program.publish",
    "program.leader.assign",
  ] as readonly Capability[],
};

const PROGRAM_LEADER_YOUTH_BIBLE_STUDY = {
  role_definition_id: "018f3b8a-0000-7000-8000-100000000002",
  stable_key: "program.leader.youth-bible-study",
  category_key: "Program" as const,
  label: "青少年查經帶領",
  description: "可帶領青少年查經聚會並登記出席。",
  scope_kind: "Program" as const,
  scope_id: "018f3b8a-0000-7000-8000-300000000001",
  position: 20,
  capabilities: ["program.manage", "program.enroll"] as readonly Capability[],
};

const DISPOSABLE_ACCOUNTS = {
  ADMIN: {
    user_id: "E2E_DISPOSABLE_ADMIN",
    name: "Disposable Admin",
    username: "E2E_disposable_admin",
    role: "Admin",
  },
  STAFF: {
    user_id: "E2E_DISPOSABLE_STAFF",
    name: "Disposable Staff",
    username: "E2E_disposable_staff",
    role: "Staff",
  },
  DEPARTMENT_MANAGER: {
    user_id: "E2E_DISPOSABLE_DM",
    name: "Disposable Department Manager",
    username: "E2E_disposable_dm",
    role: "Staff",
  },
  PROGRAM_LEADER: {
    user_id: "E2E_DISPOSABLE_PL",
    name: "Disposable Program Leader",
    username: "E2E_disposable_pl",
    role: "Staff",
  },
  MEMBER: {
    user_id: "E2E_DISPOSABLE_MEMBER",
    name: "Disposable Member",
    username: "E2E_disposable_member",
    role: "Member",
  },
} as const;

const USERS_HEADER = [
  "User_ID",
  "Name",
  "Username",
  "PIN_Code",
  "System_Role",
  "Status",
];

const PROGRAM_LEADER_PROGRAM = {
  program_id: "018f3b8a-0000-7000-8000-300000000001",
  department_id: "018f3b8a-0000-7000-8000-000000000001", // 青區
  name: "E2E_DISPOSABLE_青少年查經",
};

const CREATED_AT = "2026-08-27T00:00:00.000Z";

function disposableRows() {
  return [
    USERS_HEADER,
    [
      DISPOSABLE_ACCOUNTS.ADMIN.user_id,
      DISPOSABLE_ACCOUNTS.ADMIN.name,
      DISPOSABLE_ACCOUNTS.ADMIN.username,
      "0000",
      DISPOSABLE_ACCOUNTS.ADMIN.role,
      "Active",
    ],
    [
      DISPOSABLE_ACCOUNTS.STAFF.user_id,
      DISPOSABLE_ACCOUNTS.STAFF.name,
      DISPOSABLE_ACCOUNTS.STAFF.username,
      "0000",
      DISPOSABLE_ACCOUNTS.STAFF.role,
      "Active",
    ],
    [
      DISPOSABLE_ACCOUNTS.DEPARTMENT_MANAGER.user_id,
      DISPOSABLE_ACCOUNTS.DEPARTMENT_MANAGER.name,
      DISPOSABLE_ACCOUNTS.DEPARTMENT_MANAGER.username,
      "0000",
      DISPOSABLE_ACCOUNTS.DEPARTMENT_MANAGER.role,
      "Active",
    ],
    [
      DISPOSABLE_ACCOUNTS.PROGRAM_LEADER.user_id,
      DISPOSABLE_ACCOUNTS.PROGRAM_LEADER.name,
      DISPOSABLE_ACCOUNTS.PROGRAM_LEADER.username,
      "0000",
      DISPOSABLE_ACCOUNTS.PROGRAM_LEADER.role,
      "Active",
    ],
    [
      DISPOSABLE_ACCOUNTS.MEMBER.user_id,
      DISPOSABLE_ACCOUNTS.MEMBER.name,
      DISPOSABLE_ACCOUNTS.MEMBER.username,
      "0000",
      DISPOSABLE_ACCOUNTS.MEMBER.role,
      "Active",
    ],
  ];
}

function assertCapability(capability: string): Capability {
  if (!(CAPABILITY_CATALOG as readonly string[]).includes(capability)) {
    throw new Error(
      `disposable seed references unknown capability: ${capability}`
    );
  }
  return capability as Capability;
}
async function seedRoleGrants(
  db: D1Database,
  roleDefinitionId: string,
  capabilities: readonly Capability[]
): Promise<void> {
  for (const capability of capabilities) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO role_definition_grants
           (role_definition_id, capability, granted_by, granted_at)
         VALUES (?, ?, NULL, ?)`
      )
      .bind(roleDefinitionId, assertCapability(capability), CREATED_AT)
      .run();
  }
}

/** Stable, distinct assignment_id derived from role + account. */
function assignmentIdFor(
  roleDefinitionId: string,
  accountUserId: string
): string {
  const roleTail = roleDefinitionId.slice(-14);
  const accountSegment = accountUserId.replace(/^E2E_DISPOSABLE_/, "");
  return `${roleTail}-${accountSegment}`;
}

export interface SeedResult {
  preflight: "ok";
  accounts: readonly string[];
  roleDefinitions: readonly string[];
  grants: number;
  assignments: number;
}

export async function seedDisposableIdentity(
  db: D1Database,
  info: DisposableDatabaseInfo
): Promise<SeedResult> {
  const preflight = await preflightDisposableSchema(db, info);
  if (preflight.kind !== "ok") {
    throw new Error(preflight.message);
  }

  const systemRoleIds: Record<keyof typeof SYSTEM_DEFINITIONS, string> = {
    ADMIN: "018f3b8a-0000-7000-8000-000000000a01",
    STAFF: "018f3b8a-0000-7000-8000-000000000a02",
    MEMBER: "018f3b8a-0000-7000-8000-000000000a03",
  };
  const systemRoleDefinitionRows = [
    {
      ...SYSTEM_DEFINITIONS.ADMIN,
      role_definition_id: systemRoleIds.ADMIN,
      category_key: "Global",
      scope_kind: "Global",
      scope_id: null,
    },
    {
      ...SYSTEM_DEFINITIONS.STAFF,
      role_definition_id: systemRoleIds.STAFF,
      category_key: "Global",
      scope_kind: "Global",
      scope_id: null,
    },
    {
      ...SYSTEM_DEFINITIONS.MEMBER,
      role_definition_id: systemRoleIds.MEMBER,
      category_key: "Global",
      scope_kind: "Global",
      scope_id: null,
    },
  ];

  for (const row of systemRoleDefinitionRows) {
    const isProtected =
      row.stable_key === PROTECTED_STABLE_KEYS.ADMIN ||
      row.stable_key === PROTECTED_STABLE_KEYS.MEMBER;
    await db
      .prepare(
        `INSERT OR IGNORE INTO role_definitions
           (role_definition_id, category_key, stable_key, label, description,
            scope_kind, scope_id, position, is_protected, is_archived,
            created_by, created_at, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, NULL, ?)`
      )
      .bind(
        row.role_definition_id,
        row.category_key,
        row.stable_key,
        row.label,
        row.description,
        row.scope_kind,
        row.scope_id,
        row.position,
        isProtected ? 1 : 0,
        CREATED_AT,
        CREATED_AT
      )
      .run();
  }

  await seedRoleGrants(db, systemRoleIds.MEMBER, MEMBER_BASELINE_CAPABILITIES);
  await seedRoleGrants(db, systemRoleIds.STAFF, STAFF_ROLE_CAPABILITIES);

  await db
    .prepare(
      `INSERT OR IGNORE INTO role_definitions
         (role_definition_id, category_key, stable_key, label, description,
          scope_kind, scope_id, position, is_protected, is_archived,
          created_by, created_at, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, NULL, ?)`
    )
    .bind(
      DEPARTMENT_MANAGER_ADULT.role_definition_id,
      DEPARTMENT_MANAGER_ADULT.category_key,
      DEPARTMENT_MANAGER_ADULT.stable_key,
      DEPARTMENT_MANAGER_ADULT.label,
      DEPARTMENT_MANAGER_ADULT.description,
      DEPARTMENT_MANAGER_ADULT.scope_kind,
      DEPARTMENT_MANAGER_ADULT.scope_id,
      DEPARTMENT_MANAGER_ADULT.position,
      CREATED_AT,
      CREATED_AT
    )
    .run();
  await seedRoleGrants(
    db,
    DEPARTMENT_MANAGER_ADULT.role_definition_id,
    DEPARTMENT_MANAGER_ROLE_CAPABILITIES
  );
  await seedRoleGrants(
    db,
    DEPARTMENT_MANAGER_ADULT.role_definition_id,
    DEPARTMENT_MANAGER_ADULT.capabilities
  );

  await db
    .prepare(
      `INSERT OR IGNORE INTO programs
         (program_id, department_id, name, description, category, behavior_type,
          lifecycle, discoverability, enrollment_mode, display_order,
          created_by, created_at, updated_by, updated_at)
       VALUES (?, ?, ?, NULL, NULL, 'Recurring', 'Active', 'Unlisted', 'MemberRequest',
               0, NULL, ?, NULL, ?)`
    )
    .bind(
      PROGRAM_LEADER_PROGRAM.program_id,
      PROGRAM_LEADER_PROGRAM.department_id,
      PROGRAM_LEADER_PROGRAM.name,
      CREATED_AT,
      CREATED_AT
    )
    .run();

  await db
    .prepare(
      `INSERT OR IGNORE INTO role_definitions
         (role_definition_id, category_key, stable_key, label, description,
          scope_kind, scope_id, position, is_protected, is_archived,
          created_by, created_at, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, NULL, ?)`
    )
    .bind(
      PROGRAM_LEADER_YOUTH_BIBLE_STUDY.role_definition_id,
      PROGRAM_LEADER_YOUTH_BIBLE_STUDY.category_key,
      PROGRAM_LEADER_YOUTH_BIBLE_STUDY.stable_key,
      PROGRAM_LEADER_YOUTH_BIBLE_STUDY.label,
      PROGRAM_LEADER_YOUTH_BIBLE_STUDY.description,
      PROGRAM_LEADER_YOUTH_BIBLE_STUDY.scope_kind,
      PROGRAM_LEADER_YOUTH_BIBLE_STUDY.scope_id,
      PROGRAM_LEADER_YOUTH_BIBLE_STUDY.position,
      CREATED_AT,
      CREATED_AT
    )
    .run();
  await seedRoleGrants(
    db,
    PROGRAM_LEADER_YOUTH_BIBLE_STUDY.role_definition_id,
    PROGRAM_LEADER_ROLE_CAPABILITIES
  );
  await seedRoleGrants(
    db,
    PROGRAM_LEADER_YOUTH_BIBLE_STUDY.role_definition_id,
    PROGRAM_LEADER_YOUTH_BIBLE_STUDY.capabilities
  );

  await importLegacyUsers(db, disposableRows());
  for (const account of Object.values(DISPOSABLE_ACCOUNTS)) {
    await db
      .prepare(
        `UPDATE accounts
            SET requires_upgrade = 0,
                legacy_pin_hash = NULL,
                credential_hash = 'pbkdf2:disposable:noop',
                credential_kind = 'password',
                credential_version = 2
          WHERE user_id = ?`
      )
      .bind(account.user_id)
      .run();
  }

  const activeAssignments: {
    account: string;
    roleDefinitionId: string;
  }[] = [
    {
      account: DISPOSABLE_ACCOUNTS.ADMIN.user_id,
      roleDefinitionId: systemRoleIds.ADMIN,
    },
    {
      account: DISPOSABLE_ACCOUNTS.ADMIN.user_id,
      roleDefinitionId: systemRoleIds.MEMBER,
    },
    {
      account: DISPOSABLE_ACCOUNTS.STAFF.user_id,
      roleDefinitionId: systemRoleIds.STAFF,
    },
    {
      account: DISPOSABLE_ACCOUNTS.STAFF.user_id,
      roleDefinitionId: systemRoleIds.MEMBER,
    },
    {
      account: DISPOSABLE_ACCOUNTS.DEPARTMENT_MANAGER.user_id,
      roleDefinitionId: systemRoleIds.STAFF,
    },
    {
      account: DISPOSABLE_ACCOUNTS.DEPARTMENT_MANAGER.user_id,
      roleDefinitionId: systemRoleIds.MEMBER,
    },
    {
      account: DISPOSABLE_ACCOUNTS.DEPARTMENT_MANAGER.user_id,
      roleDefinitionId: DEPARTMENT_MANAGER_ADULT.role_definition_id,
    },
    {
      account: DISPOSABLE_ACCOUNTS.PROGRAM_LEADER.user_id,
      roleDefinitionId: systemRoleIds.STAFF,
    },
    {
      account: DISPOSABLE_ACCOUNTS.PROGRAM_LEADER.user_id,
      roleDefinitionId: systemRoleIds.MEMBER,
    },
    {
      account: DISPOSABLE_ACCOUNTS.PROGRAM_LEADER.user_id,
      roleDefinitionId: PROGRAM_LEADER_YOUTH_BIBLE_STUDY.role_definition_id,
    },
    {
      account: DISPOSABLE_ACCOUNTS.MEMBER.user_id,
      roleDefinitionId: systemRoleIds.MEMBER,
    },
  ];

  for (const assignment of activeAssignments) {
    const id = assignmentIdFor(assignment.roleDefinitionId, assignment.account);
    await db
      .prepare(
        `INSERT OR IGNORE INTO role_assignments
           (assignment_id, account_user_id, role_definition_id,
            granted_by, granted_at, revoked_by, revoked_at, revoke_reason)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)`
      )
      .bind(
        id,
        assignment.account,
        assignment.roleDefinitionId,
        DISPOSABLE_ACCOUNTS.ADMIN.user_id,
        CREATED_AT
      )
      .run();
  }

  const grantCount = await db
    .prepare(`SELECT COUNT(*) AS c FROM role_definition_grants`)
    .first<{ c: number }>();
  const assignmentCount = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM role_assignments WHERE revoked_at IS NULL`
    )
    .first<{ c: number }>();

  return {
    preflight: "ok",
    accounts: Object.values(DISPOSABLE_ACCOUNTS).map((a) => a.user_id),
    roleDefinitions: [
      systemRoleIds.ADMIN,
      systemRoleIds.STAFF,
      systemRoleIds.MEMBER,
      DEPARTMENT_MANAGER_ADULT.role_definition_id,
      PROGRAM_LEADER_YOUTH_BIBLE_STUDY.role_definition_id,
    ],
    grants: grantCount?.c ?? 0,
    assignments: assignmentCount?.c ?? 0,
  };
}

export const __test = {
  SYSTEM_DEFINITIONS,
  DEPARTMENT_MANAGER_ADULT,
  PROGRAM_LEADER_YOUTH_BIBLE_STUDY,
  PROGRAM_LEADER_PROGRAM,
  DISPOSABLE_ACCOUNTS,
  CREATED_AT,
  assignmentIdFor,
};
