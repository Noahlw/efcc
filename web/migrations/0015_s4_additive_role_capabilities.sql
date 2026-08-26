-- Migration number: 0015  2026-08-25T00:00:00.000Z
-- S4-01 — Additive Roles and the 13-Capability foundation.
--
-- Every global Role keeps the Church Member participant baseline. Staff gets
-- normal Department/Program operations and delegation; only church-wide Home
-- publishing and authorization-policy mutation remain Admin-only.
INSERT OR IGNORE INTO role_capabilities (role, capability, granted_by, granted_at)
VALUES
  ('Admin', 'account.directory.read', NULL, '2026-08-25T00:00:00.000Z'),
  ('Admin', 'account.permissions.write', NULL, '2026-08-25T00:00:00.000Z'),
  ('Admin', 'program.enroll', NULL, '2026-08-25T00:00:00.000Z'),
  ('Admin', 'registration.approval.manage', NULL, '2026-08-25T00:00:00.000Z'),
  ('Staff', 'account.directory.read', NULL, '2026-08-25T00:00:00.000Z'),
  ('Staff', 'program.enroll', NULL, '2026-08-25T00:00:00.000Z'),
  ('Staff', 'registration.approval.manage', NULL, '2026-08-25T00:00:00.000Z');
