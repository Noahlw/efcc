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

INSERT OR IGNORE INTO role_definition_grants (role_definition_id, capability, granted_by, granted_at) VALUES
  ('018f3b8a-0000-7000-8000-000000000a03', 'program.enroll', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-000000000a02', 'role.read', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-000000000a02', 'role.assign', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-000000000a02', 'role.revoke', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-000000000a02', 'role.reorder', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-000000000a02', 'role.permissions.read', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-000000000a02', 'role.permissions.write', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-000000000a02', 'role.create', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-000000000a02', 'role.delete', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-100000000001', 'role.read', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-100000000001', 'role.assign', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-100000000001', 'role.revoke', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-100000000001', 'role.reorder', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-100000000001', 'role.permissions.read', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-100000000001', 'role.permissions.write', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-100000000001', 'department.manage', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-100000000001', 'department.publish', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-100000000001', 'department.module.configure', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-100000000001', 'program.manage', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-100000000001', 'program.publish', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-100000000001', 'program.leader.assign', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-100000000002', 'role.read', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-100000000002', 'role.assign', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-100000000002', 'role.revoke', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-100000000002', 'program.manage', NULL, '2026-08-27T00:00:00.000Z'),
  ('018f3b8a-0000-7000-8000-100000000002', 'program.enroll', NULL, '2026-08-27T00:00:00.000Z');

INSERT OR IGNORE INTO role_assignments (
  assignment_id, account_user_id, role_definition_id,
  granted_by, granted_at, revoked_by, revoked_at, revoke_reason
) VALUES
  ('0-000000000a01-ADMIN', 'E2E_DISPOSABLE_ADMIN', '018f3b8a-0000-7000-8000-000000000a01', 'E2E_DISPOSABLE_ADMIN', '2026-08-27T00:00:00.000Z', NULL, NULL, NULL),
  ('0-000000000a03-ADMIN', 'E2E_DISPOSABLE_ADMIN', '018f3b8a-0000-7000-8000-000000000a03', 'E2E_DISPOSABLE_ADMIN', '2026-08-27T00:00:00.000Z', NULL, NULL, NULL),
  ('0-000000000a02-STAFF', 'E2E_DISPOSABLE_STAFF', '018f3b8a-0000-7000-8000-000000000a02', 'E2E_DISPOSABLE_ADMIN', '2026-08-27T00:00:00.000Z', NULL, NULL, NULL),
  ('0-000000000a03-STAFF', 'E2E_DISPOSABLE_STAFF', '018f3b8a-0000-7000-8000-000000000a03', 'E2E_DISPOSABLE_ADMIN', '2026-08-27T00:00:00.000Z', NULL, NULL, NULL),
  ('0-000000000a02-DM', 'E2E_DISPOSABLE_DM', '018f3b8a-0000-7000-8000-000000000a02', 'E2E_DISPOSABLE_ADMIN', '2026-08-27T00:00:00.000Z', NULL, NULL, NULL),
  ('0-000000000a03-DM', 'E2E_DISPOSABLE_DM', '018f3b8a-0000-7000-8000-000000000a03', 'E2E_DISPOSABLE_ADMIN', '2026-08-27T00:00:00.000Z', NULL, NULL, NULL),
  ('0-100000000001-DM', 'E2E_DISPOSABLE_DM', '018f3b8a-0000-7000-8000-100000000001', 'E2E_DISPOSABLE_ADMIN', '2026-08-27T00:00:00.000Z', NULL, NULL, NULL),
  ('0-000000000a02-PL', 'E2E_DISPOSABLE_PL', '018f3b8a-0000-7000-8000-000000000a02', 'E2E_DISPOSABLE_ADMIN', '2026-08-27T00:00:00.000Z', NULL, NULL, NULL),
  ('0-000000000a03-PL', 'E2E_DISPOSABLE_PL', '018f3b8a-0000-7000-8000-000000000a03', 'E2E_DISPOSABLE_ADMIN', '2026-08-27T00:00:00.000Z', NULL, NULL, NULL),
  ('0-100000000002-PL', 'E2E_DISPOSABLE_PL', '018f3b8a-0000-7000-8000-100000000002', 'E2E_DISPOSABLE_ADMIN', '2026-08-27T00:00:00.000Z', NULL, NULL, NULL),
  ('0-000000000a03-MEMBER', 'E2E_DISPOSABLE_MEMBER', '018f3b8a-0000-7000-8000-000000000a03', 'E2E_DISPOSABLE_ADMIN', '2026-08-27T00:00:00.000Z', NULL, NULL, NULL);

