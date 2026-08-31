-- EFCC disposable identity seed (#476/#478, Spec 091).
--
-- This file is applied only by `pnpm db:seed:disposable`, which hard-codes
-- Wrangler's --local flag. It is additive and idempotent: every statement is
-- INSERT OR IGNORE and every identity/account key is explicitly E2E_ scoped.
-- It never drops or updates non-disposable data.


-- Accounts used as foreign-key owners and disposable role actors. The
-- workerd seed (`web/lib/identity/seeds.ts`) upgrades these rows with the
-- same throwaway credential marker when it runs in focused tests.
INSERT OR IGNORE INTO accounts (
  user_id, name, username, username_normalized,
  credential_hash, credential_kind, credential_version,
  account_status, role, phone, qr_code_string,
  legacy_pin_hash, requires_upgrade, lock_level, failed_attempts,
  locked_until, lock_since, created_at, updated_at
) VALUES
  ('E2E_DISPOSABLE_ADMIN', 'Disposable Admin', 'E2E_disposable_admin', 'e2e_disposable_admin', NULL, 'password', 2, 'Active', 'Admin', NULL, NULL, NULL, 0, 0, 0, NULL, NULL, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('E2E_DISPOSABLE_STAFF', 'Disposable Staff', 'E2E_disposable_staff', 'e2e_disposable_staff', NULL, 'password', 2, 'Active', 'Staff', NULL, NULL, NULL, 0, 0, 0, NULL, NULL, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('E2E_DISPOSABLE_DM', 'Disposable Department Manager', 'E2E_disposable_dm', 'e2e_disposable_dm', NULL, 'password', 2, 'Active', 'Staff', NULL, NULL, NULL, 0, 0, 0, NULL, NULL, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('E2E_DISPOSABLE_PL', 'Disposable Program Leader', 'E2E_disposable_pl', 'e2e_disposable_pl', NULL, 'password', 2, 'Active', 'Staff', NULL, NULL, NULL, 0, 0, 0, NULL, NULL, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('E2E_DISPOSABLE_MEMBER', 'Disposable Member', 'E2E_disposable_member', 'e2e_disposable_member', NULL, 'password', 2, 'Active', 'Member', NULL, NULL, NULL, 0, 0, 0, NULL, NULL, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000);

-- The migration seeds these two fixed departments. INSERT OR IGNORE keeps
-- standalone reruns safe while making the dependency explicit for a clean
-- disposable database created from a schema-only export.
INSERT OR IGNORE INTO departments (
  department_id, code, name, description, lifecycle, display_order,
  created_by, created_at, updated_by, updated_at
) VALUES
  ('018f3b8a-0000-7000-8000-000000000001', '青區', '青區', '青少年事工部門', 'Active', 0, NULL, '2026-08-06T00:00:00.000Z', NULL, '2026-08-06T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-000000000002', '成區', '成區', '成人事工部門', 'PendingDevelopment', 1, NULL, '2026-08-06T00:00:00.000Z', NULL, '2026-08-06T00:00:00.000Z');

INSERT OR IGNORE INTO programs (
  program_id, department_id, name, description, category, behavior_type,
  lifecycle, discoverability, enrollment_mode, display_order,
  created_by, created_at, updated_by, updated_at
) VALUES (
  '018f3b8a-0000-7000-8000-300000000001',
  '018f3b8a-0000-7000-8000-000000000001',
  'E2E_DISPOSABLE_青少年查經', NULL, NULL, 'Recurring', 'Active', 'Unlisted',
  'MemberRequest', 0, NULL, '2026-08-27T00:00:00.000Z', NULL,
  '2026-08-27T00:00:00.000Z'
);

INSERT OR IGNORE INTO role_definitions (
  role_definition_id, category_key, stable_key, label, description,
  scope_kind, scope_id, position, is_protected, is_archived,
  created_by, created_at, updated_by, updated_at
) VALUES
  ('018f3b8a-0000-7000-8000-000000000a01', 'Global', 'admin', '系統管理員', '全教會唯一可改變授權政策、發佈首頁內容的身份。', 'Global', NULL, 0, 1, 0, NULL, '2026-08-27T00:00:00.000Z', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-000000000a02', 'Global', 'staff', '同工', '全教會同工，可管理部門、課程與指派負責人，但不可變更授權政策。', 'Global', NULL, 1, 0, 0, NULL, '2026-08-27T00:00:00.000Z', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-000000000a03', 'Global', 'member', '會友基礎', '每位正式會友皆持有的最低限度身份，僅含提交課程報名。', 'Global', NULL, 999, 1, 0, NULL, '2026-08-27T00:00:00.000Z', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-100000000001', 'Department', 'department.manager.adult', '成人部門管理者', '可管理成人部門的日常運作及課程目錄。', 'Department', '018f3b8a-0000-7000-8000-000000000002', 10, 0, 0, NULL, '2026-08-27T00:00:00.000Z', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-100000000002', 'Program', 'program.leader.youth-bible-study', '青少年查經帶領', '可帶領青少年查經聚會並登記出席。', 'Program', '018f3b8a-0000-7000-8000-300000000001', 20, 0, 0, NULL, '2026-08-27T00:00:00.000Z', NULL, '2026-08-27T00:00:00.000Z');

WITH seeded_grants(role_definition_id, capability) AS (
  VALUES
    ('018f3b8a-0000-7000-8000-000000000a02', 'role.read'),
    ('018f3b8a-0000-7000-8000-000000000a02', 'role.assign'),
    ('018f3b8a-0000-7000-8000-000000000a02', 'role.revoke'),
    ('018f3b8a-0000-7000-8000-000000000a02', 'role.reorder'),
    ('018f3b8a-0000-7000-8000-000000000a02', 'role.name.write'),
    ('018f3b8a-0000-7000-8000-000000000a02', 'role.permissions.read'),
    ('018f3b8a-0000-7000-8000-000000000a02', 'role.permissions.write'),
    ('018f3b8a-0000-7000-8000-000000000a02', 'role.scope.read'),
    ('018f3b8a-0000-7000-8000-000000000a02', 'role.scope.write'),
    ('018f3b8a-0000-7000-8000-000000000a02', 'role.create'),
    ('018f3b8a-0000-7000-8000-000000000a02', 'role.delete'),
    ('018f3b8a-0000-7000-8000-000000000a02', 'department.manage'),
    ('018f3b8a-0000-7000-8000-000000000a02', 'department.publish'),
    ('018f3b8a-0000-7000-8000-000000000a02', 'department.module.configure'),
    ('018f3b8a-0000-7000-8000-000000000a02', 'department.manager.assign'),
    ('018f3b8a-0000-7000-8000-000000000a02', 'program.manage'),
    ('018f3b8a-0000-7000-8000-000000000a02', 'program.publish'),
    ('018f3b8a-0000-7000-8000-000000000a02', 'program.enroll'),
    ('018f3b8a-0000-7000-8000-000000000a02', 'program.leader.assign'),
    ('018f3b8a-0000-7000-8000-000000000a02', 'account.permissions.read'),
    ('018f3b8a-0000-7000-8000-000000000a02', 'account.directory.read'),
    ('018f3b8a-0000-7000-8000-000000000a02', 'registration.approval.manage'),
    ('018f3b8a-0000-7000-8000-100000000001', 'role.read'),
    ('018f3b8a-0000-7000-8000-100000000001', 'role.assign'),
    ('018f3b8a-0000-7000-8000-100000000001', 'role.revoke'),
    ('018f3b8a-0000-7000-8000-100000000001', 'role.reorder'),
    ('018f3b8a-0000-7000-8000-100000000001', 'role.permissions.read'),
    ('018f3b8a-0000-7000-8000-100000000001', 'role.permissions.write'),
    ('018f3b8a-0000-7000-8000-100000000001', 'department.manage'),
    ('018f3b8a-0000-7000-8000-100000000001', 'department.publish'),
    ('018f3b8a-0000-7000-8000-100000000001', 'department.module.configure'),
    ('018f3b8a-0000-7000-8000-100000000001', 'program.manage'),
    ('018f3b8a-0000-7000-8000-100000000001', 'program.publish'),
    ('018f3b8a-0000-7000-8000-100000000001', 'program.leader.assign'),
    ('018f3b8a-0000-7000-8000-100000000002', 'role.read'),
    ('018f3b8a-0000-7000-8000-100000000002', 'role.assign'),
    ('018f3b8a-0000-7000-8000-100000000002', 'role.revoke'),
    ('018f3b8a-0000-7000-8000-100000000002', 'program.manage'),
    ('018f3b8a-0000-7000-8000-100000000002', 'program.enroll')
)
INSERT OR IGNORE INTO role_definition_grants
  (role_definition_id, capability, granted_by, granted_at)
SELECT seeded_grants.role_definition_id, seeded_grants.capability, NULL,
  '2026-08-27T00:00:00.000Z'
  FROM seeded_grants
  JOIN role_definitions
    ON role_definitions.role_definition_id = seeded_grants.role_definition_id
 WHERE role_definitions.is_archived = 0;

-- Re-seeding after a revoke keeps the terminal row and creates a fresh
-- assignment ID for the active fixture instead of reactivating history.
WITH seeded_assignments(assignment_id, account_user_id, role_definition_id, granted_by) AS (
  VALUES
    ('0-000000000a01-ADMIN', 'E2E_DISPOSABLE_ADMIN', '018f3b8a-0000-7000-8000-000000000a01', 'E2E_DISPOSABLE_ADMIN'),
    ('0-000000000a02-STAFF', 'E2E_DISPOSABLE_STAFF', '018f3b8a-0000-7000-8000-000000000a02', 'E2E_DISPOSABLE_ADMIN'),
    ('0-100000000001-DM', 'E2E_DISPOSABLE_DM', '018f3b8a-0000-7000-8000-100000000001', 'E2E_DISPOSABLE_ADMIN'),
    ('0-100000000002-PL', 'E2E_DISPOSABLE_PL', '018f3b8a-0000-7000-8000-100000000002', 'E2E_DISPOSABLE_ADMIN')
)
INSERT OR IGNORE INTO role_assignments (
  assignment_id, account_user_id, role_definition_id,
  granted_by, granted_at, scope_kind, scope_id,
  revoked_by, revoked_at, revoke_reason
)
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1
        FROM role_assignments AS history
       WHERE history.assignment_id = seeded_assignments.assignment_id
    )
    THEN seeded_assignments.assignment_id || '-' || lower(hex(randomblob(16)))
    ELSE seeded_assignments.assignment_id
  END,
  seeded_assignments.account_user_id,
  seeded_assignments.role_definition_id,
  seeded_assignments.granted_by,
  '2026-08-27T00:00:00.000Z',
  role_definitions.scope_kind,
  role_definitions.scope_id,
  NULL,
  NULL,
  NULL
  FROM seeded_assignments
  JOIN role_definitions
    ON role_definitions.role_definition_id = seeded_assignments.role_definition_id
 WHERE role_definitions.is_archived = 0
   AND NOT EXISTS (
     SELECT 1
       FROM role_assignments AS active
      WHERE active.account_user_id = seeded_assignments.account_user_id
        AND active.role_definition_id = seeded_assignments.role_definition_id
        AND active.revoked_at IS NULL
   );
