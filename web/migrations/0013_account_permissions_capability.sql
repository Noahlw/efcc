-- Migration number: 0013  2026-08-17T00:00:00.000Z
-- 087-03 #320 — Account Permissions real matrix read capability.
--
-- The 帳戶與權限 surface (Spec 087 US 9-12) is an Admin/Staff-only read.
-- Department Manager is an effective scoped profile (migration 0007), so it
-- never receives a role capability row — the capability authorizer denies
-- DM-only actors server-side (403/FORBIDDEN) with no client-side branch.
INSERT OR IGNORE INTO role_capabilities (role, capability, granted_by, granted_at)
VALUES
  ('Admin', 'account.permissions.read', NULL, '2026-08-17T00:00:00Z'),
  ('Staff', 'account.permissions.read', NULL, '2026-08-17T00:00:00Z');
