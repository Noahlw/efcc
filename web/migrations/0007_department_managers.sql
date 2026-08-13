-- Migration number: 0007  2026-08-12T00:00:00.000Z
-- AUTH-01 #255 — scoped Department Manager assignments.
--
-- Department Manager is an effective scoped profile, not a global role. Rows
-- retain grant/revocation history so repeated and concurrent changes can be
-- audited without materializing inherited Program Leader rows.

CREATE TABLE department_managers (
  department_id TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  granted_by    TEXT NOT NULL,
  granted_at    TEXT NOT NULL,
  revoked_by    TEXT,
  revoked_at    TEXT,
  PRIMARY KEY (department_id, user_id),
  FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id)       REFERENCES accounts(user_id)         ON DELETE RESTRICT,
  FOREIGN KEY (granted_by)    REFERENCES accounts(user_id)         ON DELETE RESTRICT,
  FOREIGN KEY (revoked_by)    REFERENCES accounts(user_id)         ON DELETE RESTRICT
) STRICT;

CREATE UNIQUE INDEX department_managers_active_idx
  ON department_managers(department_id, user_id) WHERE revoked_at IS NULL;

CREATE INDEX department_managers_user_idx ON department_managers(user_id);
INSERT OR IGNORE INTO role_capabilities (role, capability, granted_by, granted_at)
VALUES
  ('Admin', 'department.manager.assign', NULL, '2026-08-12T00:00:00Z'),
  ('Staff', 'department.manager.assign', NULL, '2026-08-12T00:00:00Z');
