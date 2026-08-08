-- Migration number: 0003 	 2026-08-06T00:00:00.000Z
-- EFCC D1 Program/Enrollment domain foundation (PRG-01 #197 / Spec #190).
--
-- Deploys the authoritative relational schema from docs/specs/080-d1-relational-schema.md
-- §4–§9, plus backfilled CHECK constraints on the existing identity tables
-- (§10.2). The new domain starts from an empty baseline: no legacy Sheet import,
-- no Sheet adapter, no dual-write path.
--
-- Conventions:
--   * All new tables use TEXT UUID primary keys and STRICT mode.
--   * All new domain timestamps are ISO-8601 UTC TEXT.
--   * Foreign keys are ON DELETE RESTRICT (D1 enforces FKs by default).
--   * Every closed vocabulary is CHECK-constrained.
--   * audit_events is immutable (triggers shipped here).
--   * Existing identity tables are rebuilt in place to add CHECK constraints.
--   * The legacy global role value 'Teacher' is normalized to 'Staff' before the
--     role CHECK is applied, matching ADR-0025 and the canonical role vocabulary.

-- ---------------------------------------------------------------------------
-- 0. Normalize legacy role value before the CHECK constraint rebuild.
-- ---------------------------------------------------------------------------

UPDATE accounts SET role = 'Staff' WHERE role = 'Teacher';
UPDATE registration_requests SET role = 'Staff' WHERE role = 'Teacher';

-- ---------------------------------------------------------------------------
-- 1. Backfill CHECK constraints on existing identity tables.
--    SQLite cannot ADD CHECK, so we rebuild each table inside a transaction.
-- ---------------------------------------------------------------------------

-- accounts ---------------------------------------------------------------
ALTER TABLE accounts RENAME TO accounts_old;

CREATE TABLE accounts (
  user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL,
  username_normalized TEXT NOT NULL,
  credential_hash TEXT,
  credential_kind TEXT NOT NULL CHECK (credential_kind IN ('legacy_pin','password','pin')),
  credential_version INTEGER NOT NULL DEFAULT 1,
  account_status TEXT NOT NULL CHECK (account_status IN ('Pending','Active','Suspended','Deactivated')),
  role TEXT NOT NULL CHECK (role IN ('Admin','Staff','Member')),
  phone TEXT,
  qr_code_string TEXT,
  legacy_pin_hash TEXT,
  requires_upgrade INTEGER NOT NULL DEFAULT 0,
  lock_level INTEGER NOT NULL DEFAULT 0,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  lock_since INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

INSERT INTO accounts SELECT * FROM accounts_old;

DROP TABLE accounts_old;

CREATE UNIQUE INDEX accounts_username_normalized_idx
  ON accounts(username_normalized);

CREATE TRIGGER accounts_user_id_immutable
BEFORE UPDATE OF user_id ON accounts
BEGIN
  SELECT RAISE(ABORT, 'user_id is immutable');
END;

-- Recreate the ADR-0025 role write-guard: the rebuild above (RENAME →
-- CREATE → DROP) carries 0002_retire_teacher.sql's triggers away with
-- accounts_old. Re-created as BEFORE triggers so the guard's RAISE message
-- wins over the new role CHECK (BEFORE triggers run before constraints;
-- AFTER triggers run after them and would surface the raw CHECK error).
CREATE TRIGGER accounts_role_write_guard_insert
BEFORE INSERT ON accounts
WHEN NEW.role NOT IN ('Admin', 'Staff', 'Member')
BEGIN
  SELECT RAISE(ABORT, 'role must be Admin, Staff, or Member');
END;

CREATE TRIGGER accounts_role_write_guard_update
BEFORE UPDATE OF role ON accounts
WHEN NEW.role NOT IN ('Admin', 'Staff', 'Member')
BEGIN
  SELECT RAISE(ABORT, 'role must be Admin, Staff, or Member');
END;

-- registration_requests ----------------------------------------------------
ALTER TABLE registration_requests RENAME TO registration_requests_old;

CREATE TABLE registration_requests (
  request_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  username_normalized TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  credential_hash TEXT NOT NULL,
  credential_kind TEXT NOT NULL,
  account_status TEXT NOT NULL DEFAULT 'Pending' CHECK (account_status IN ('Pending','Active','Rejected')),
  role TEXT NOT NULL DEFAULT 'Member' CHECK (role IN ('Admin','Staff','Member')),
  submitted_at INTEGER NOT NULL,
  reviewed_by TEXT,
  reviewed_at INTEGER,
  review_decision TEXT CHECK (review_decision IS NULL OR review_decision IN ('Approved','Rejected'))
) STRICT;

INSERT INTO registration_requests SELECT * FROM registration_requests_old;

DROP TABLE registration_requests_old;

-- sessions -----------------------------------------------------------------
-- No closed vocabulary to CHECK; recreate to preserve FK and index contract.
ALTER TABLE sessions RENAME TO sessions_old;

CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  device_fingerprint TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES accounts(user_id) ON DELETE RESTRICT
) STRICT;

INSERT INTO sessions SELECT * FROM sessions_old;

DROP TABLE sessions_old;

CREATE INDEX sessions_user_id_idx ON sessions(user_id);

-- ---------------------------------------------------------------------------
-- 2. Authorization (§4)
-- ---------------------------------------------------------------------------

CREATE TABLE role_capabilities (
  role          TEXT NOT NULL CHECK (role IN ('Admin','Staff','Member')),
  capability    TEXT NOT NULL,
  granted_by    TEXT,
  granted_at    TEXT NOT NULL,
  PRIMARY KEY (role, capability),
  FOREIGN KEY (granted_by) REFERENCES accounts(user_id) ON DELETE RESTRICT
) STRICT;

-- ---------------------------------------------------------------------------
-- 3. Department domain (§5)
-- ---------------------------------------------------------------------------

CREATE TABLE departments (
  department_id TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT,
  lifecycle     TEXT NOT NULL CHECK (lifecycle IN ('Draft','PendingDevelopment','Active','Archived')),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_by    TEXT,
  created_at    TEXT NOT NULL,
  updated_by    TEXT,
  updated_at    TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES accounts(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES accounts(user_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE department_modules (
  department_id TEXT NOT NULL,
  module_key    TEXT NOT NULL CHECK (module_key IN ('program_catalog','enrollment','events','attendance','custom_forms')),
  enabled       INTEGER NOT NULL DEFAULT 0,
  enabled_by    TEXT,
  enabled_at    TEXT NOT NULL,
  PRIMARY KEY (department_id, module_key),
  FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE RESTRICT,
  FOREIGN KEY (enabled_by)   REFERENCES accounts(user_id)      ON DELETE RESTRICT
) STRICT;

CREATE TABLE programs (
  program_id      TEXT PRIMARY KEY,
  department_id   TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  category        TEXT,
  behavior_type   TEXT NOT NULL CHECK (behavior_type IN ('Recurring','OneOff')),
  lifecycle       TEXT NOT NULL CHECK (lifecycle IN ('Draft','Active','Archived')),
  discoverability TEXT NOT NULL CHECK (discoverability IN ('Listed','Unlisted')),
  enrollment_mode TEXT NOT NULL CHECK (enrollment_mode IN ('MemberRequest','ManagerOnly')),
  display_order   INTEGER NOT NULL DEFAULT 0,
  created_by      TEXT,
  created_at      TEXT NOT NULL,
  updated_by      TEXT,
  updated_at      TEXT NOT NULL,
  FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by)    REFERENCES accounts(user_id)        ON DELETE RESTRICT,
  FOREIGN KEY (updated_by)    REFERENCES accounts(user_id)        ON DELETE RESTRICT
) STRICT;

CREATE INDEX programs_department_idx ON programs(department_id);

-- ---------------------------------------------------------------------------
-- 4. Scheduling (§6)
-- ---------------------------------------------------------------------------

CREATE TABLE program_schedule_rules (
  rule_id       TEXT PRIMARY KEY,
  program_id    TEXT NOT NULL,
  recurrence    TEXT NOT NULL CHECK (recurrence IN ('WEEKLY','MONTHLY')),
  day_of_week   INTEGER CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6)),
  month_day     INTEGER CHECK (month_day IS NULL OR (month_day >= 1 AND month_day <= 31)),
  start_time    TEXT NOT NULL,
  end_time      TEXT NOT NULL,
  created_by    TEXT,
  created_at    TEXT NOT NULL,
  updated_by    TEXT,
  updated_at    TEXT NOT NULL,
  FOREIGN KEY (program_id) REFERENCES programs(program_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES accounts(user_id)   ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES accounts(user_id)   ON DELETE RESTRICT
) STRICT;

CREATE INDEX schedule_rules_program_idx ON program_schedule_rules(program_id);

CREATE TABLE program_schedule_exceptions (
  exception_id   TEXT PRIMARY KEY,
  rule_id        TEXT NOT NULL,
  override_date  TEXT NOT NULL,
  action         TEXT NOT NULL CHECK (action IN ('CANCEL','RESCHEDULE')),
  new_start_time TEXT,
  new_end_time   TEXT,
  created_by     TEXT,
  created_at     TEXT NOT NULL,
  FOREIGN KEY (rule_id)    REFERENCES program_schedule_rules(rule_id)    ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES accounts(user_id)                  ON DELETE RESTRICT
) STRICT;

-- One override per (rule, HK wall date); the app maps the constraint
-- violation to a 409 Conflict before the DB race-guard fires.
CREATE UNIQUE INDEX schedule_exceptions_rule_date_idx
  ON program_schedule_exceptions(rule_id, override_date);

-- ---------------------------------------------------------------------------
-- 5. Events (§7)
-- ---------------------------------------------------------------------------

CREATE TABLE events (
  event_id    TEXT PRIMARY KEY,
  program_id  TEXT NOT NULL,
  starts_at   TEXT NOT NULL,
  ends_at     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Cancelled')),
  source      TEXT NOT NULL CHECK (source IN ('SCHEDULE','MANUAL')),
  cancel_reason  TEXT,
  created_by  TEXT,
  created_at  TEXT NOT NULL,
  updated_by  TEXT,
  updated_at  TEXT NOT NULL,
  FOREIGN KEY (program_id) REFERENCES programs(program_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES accounts(user_id)   ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES accounts(user_id)   ON DELETE RESTRICT
) STRICT;

CREATE UNIQUE INDEX events_program_start_idx ON events(program_id, starts_at);

-- ---------------------------------------------------------------------------
-- 6. Enrollment, Leadership, Attendance (§8)
-- ---------------------------------------------------------------------------

CREATE TABLE enrollment_requests (
  request_id      TEXT PRIMARY KEY,
  program_id      TEXT NOT NULL,
  member_user_id  TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('Pending','Approved','Rejected','Withdrawn')),
  submitted_at    TEXT NOT NULL,
  decided_by      TEXT,
  decided_at      TEXT,
  decision_note   TEXT,
  request_version INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (program_id)     REFERENCES programs(program_id) ON DELETE RESTRICT,
  FOREIGN KEY (member_user_id) REFERENCES accounts(user_id)   ON DELETE RESTRICT,
  FOREIGN KEY (decided_by)     REFERENCES accounts(user_id)   ON DELETE RESTRICT
) STRICT;

CREATE INDEX enrollment_requests_program_status_idx ON enrollment_requests(program_id, status);
CREATE INDEX enrollment_requests_member_idx ON enrollment_requests(member_user_id);

CREATE TABLE enrollments (
  enrollment_id TEXT PRIMARY KEY,
  program_id    TEXT NOT NULL,
  member_user_id TEXT NOT NULL,
  request_id    TEXT,
  status        TEXT NOT NULL CHECK (status IN ('Active','Cancelled')),
  enrolled_at   TEXT NOT NULL,
  cancelled_at  TEXT,
  cancelled_by  TEXT,
  created_by    TEXT,
  created_at    TEXT NOT NULL,
  FOREIGN KEY (program_id)     REFERENCES programs(program_id)     ON DELETE RESTRICT,
  FOREIGN KEY (member_user_id) REFERENCES accounts(user_id)       ON DELETE RESTRICT,
  FOREIGN KEY (request_id)     REFERENCES enrollment_requests(request_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by)     REFERENCES accounts(user_id)       ON DELETE RESTRICT,
  FOREIGN KEY (cancelled_by)   REFERENCES accounts(user_id)       ON DELETE RESTRICT
) STRICT;

CREATE UNIQUE INDEX enrollments_active_member_program_idx
  ON enrollments(program_id, member_user_id) WHERE status = 'Active';

CREATE INDEX enrollments_member_idx ON enrollments(member_user_id);

CREATE TABLE program_leaders (
  program_id  TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  granted_by  TEXT NOT NULL,
  granted_at  TEXT NOT NULL,
  revoked_by  TEXT,
  revoked_at  TEXT,
  PRIMARY KEY (program_id, user_id),
  FOREIGN KEY (program_id) REFERENCES programs(program_id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id)     REFERENCES accounts(user_id)   ON DELETE RESTRICT,
  FOREIGN KEY (granted_by)  REFERENCES accounts(user_id)   ON DELETE RESTRICT,
  FOREIGN KEY (revoked_by)  REFERENCES accounts(user_id)   ON DELETE RESTRICT
) STRICT;

CREATE UNIQUE INDEX program_leaders_active_idx
  ON program_leaders(program_id, user_id) WHERE revoked_at IS NULL;

CREATE INDEX program_leaders_program_idx ON program_leaders(program_id);

CREATE TABLE attendances (
  attendance_id  TEXT PRIMARY KEY,
  event_id       TEXT NOT NULL,
  member_user_id TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('Active','Voided')),
  checked_in_at  TEXT NOT NULL,
  checked_in_by  TEXT,
  voided_by      TEXT,
  voided_at      TEXT,
  void_reason    TEXT,
  FOREIGN KEY (event_id)       REFERENCES events(event_id)       ON DELETE RESTRICT,
  FOREIGN KEY (member_user_id) REFERENCES accounts(user_id)      ON DELETE RESTRICT,
  FOREIGN KEY (checked_in_by)  REFERENCES accounts(user_id)      ON DELETE RESTRICT,
  FOREIGN KEY (voided_by)      REFERENCES accounts(user_id)      ON DELETE RESTRICT
) STRICT;

CREATE UNIQUE INDEX attendances_active_event_member_idx
  ON attendances(event_id, member_user_id) WHERE status = 'Active';

CREATE INDEX attendances_event_idx ON attendances(event_id);

-- ---------------------------------------------------------------------------
-- 7. Audit (§9)
-- ---------------------------------------------------------------------------

CREATE TABLE audit_events (
  audit_id       TEXT PRIMARY KEY,
  inserted_at    TEXT NOT NULL,
  actor_user_id  TEXT,
  action         TEXT NOT NULL,
  entity_type    TEXT NOT NULL,
  entity_id      TEXT NOT NULL,
  old_value_json TEXT,
  new_value_json TEXT,
  reason         TEXT,
  outcome        TEXT NOT NULL CHECK (outcome IN ('SUCCESS','DUPLICATE','CONFLICT','DENIED','FAILED')),
  correlation_id TEXT
) STRICT;

CREATE INDEX audit_events_entity_idx  ON audit_events(entity_type, entity_id);
CREATE INDEX audit_events_actor_idx   ON audit_events(actor_user_id);
CREATE INDEX audit_events_corr_idx    ON audit_events(correlation_id);

CREATE TRIGGER audit_events_no_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is immutable');
END;

CREATE TRIGGER audit_events_no_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is immutable');
END;

-- ---------------------------------------------------------------------------
-- 8. Seed initial departments.
-- ---------------------------------------------------------------------------

INSERT INTO departments (department_id, code, name, description, lifecycle, display_order, created_by, created_at, updated_by, updated_at)
VALUES
  ('018f3b8a-0000-7000-8000-000000000001', '青區', '青區', '青少年事工部門', 'Active', 0, NULL, '2026-08-06T00:00:00Z', NULL, '2026-08-06T00:00:00Z'),
  ('018f3b8a-0000-7000-8000-000000000002', '成區', '成區', '成人事工部門', 'PendingDevelopment', 1, NULL, '2026-08-06T00:00:00Z', NULL, '2026-08-06T00:00:00Z'),
  ('018f3b8a-0000-7000-8000-000000000003', '兒區', '兒區', '兒童事工部門', 'PendingDevelopment', 2, NULL, '2026-08-06T00:00:00Z', NULL, '2026-08-06T00:00:00Z');

-- ---------------------------------------------------------------------------
-- 9. Seed role policies and disabled module rows. The migration is the single
-- source of seeding; there is no runtime per-request seeding fan-out.
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO role_capabilities (role, capability, granted_by, granted_at) VALUES
  ('Admin',  'department.manage',           NULL, '2026-08-06T00:00:00Z'),
  ('Admin',  'department.publish',          NULL, '2026-08-06T00:00:00Z'),
  ('Admin',  'department.module.configure', NULL, '2026-08-06T00:00:00Z'),
  ('Admin',  'program.manage',              NULL, '2026-08-06T00:00:00Z'),
  ('Admin',  'program.publish',             NULL, '2026-08-06T00:00:00Z'),
  ('Admin',  'program.leader.assign',       NULL, '2026-08-06T00:00:00Z'),
  ('Staff',  'department.manage',           NULL, '2026-08-06T00:00:00Z'),
  ('Staff',  'department.publish',          NULL, '2026-08-06T00:00:00Z'),
  ('Staff',  'department.module.configure', NULL, '2026-08-06T00:00:00Z'),
  ('Staff',  'program.manage',              NULL, '2026-08-06T00:00:00Z'),
  ('Staff',  'program.publish',             NULL, '2026-08-06T00:00:00Z'),
  ('Staff',  'program.leader.assign',       NULL, '2026-08-06T00:00:00Z'),
  ('Member', 'program.enroll',              NULL, '2026-08-06T00:00:00Z');

INSERT OR IGNORE INTO department_modules (department_id, module_key, enabled, enabled_by, enabled_at)
SELECT d.department_id, m.module_key, 0, NULL, '2026-08-06T00:00:00Z'
  FROM departments d
 CROSS JOIN (
   SELECT 'program_catalog' AS module_key
   UNION ALL SELECT 'enrollment'
   UNION ALL SELECT 'events'
   UNION ALL SELECT 'attendance'
   UNION ALL SELECT 'custom_forms'
 ) AS m;

-- Migration ends here
