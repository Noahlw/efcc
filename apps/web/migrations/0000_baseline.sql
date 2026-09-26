-- Development D1 baseline generated from the fully migrated schema.
-- Wrangler creates and owns the d1_migrations ledger.

CREATE TABLE account_events (
  event_id                  TEXT PRIMARY KEY,
  actor_user_id             TEXT NOT NULL,
  action                    TEXT NOT NULL CHECK (action IN ('username_changed', 'password_changed')),
  old_username_normalized   TEXT,
  new_username_normalized   TEXT,
  correlation_id            TEXT NOT NULL,
  created_at                INTEGER NOT NULL
);

CREATE TABLE "accounts" (
  user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL,
  username_normalized TEXT NOT NULL,
  credential_hash TEXT,
  account_status TEXT NOT NULL CHECK (account_status IN ('Pending','Active','Suspended','Deactivated')),
  phone TEXT,
  qr_code_string TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE attendance_guest_reconcile_proofs (
  proof_hash          TEXT PRIMARY KEY,
  request_fingerprint TEXT NOT NULL,
  program_id          TEXT NOT NULL,
  event_id            TEXT NOT NULL,
  attendance_id       TEXT NOT NULL,
  request_id          TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  FOREIGN KEY (program_id) REFERENCES programs(program_id) ON DELETE RESTRICT,
  FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE RESTRICT,
  FOREIGN KEY (attendance_id) REFERENCES attendances(attendance_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE attendances (
  attendance_id          TEXT PRIMARY KEY,
  event_id               TEXT NOT NULL,
  member_user_id         TEXT,
  guest_name             TEXT,
  guest_phone            TEXT,
  guest_phone_normalized TEXT,
  method                 TEXT NOT NULL DEFAULT 'self_qr_scan'
                         CHECK (method IN (
                           'self_qr_scan',
                           'self_manual_code',
                           'leader_qr_scan',
                           'leader_manual_search',
                           'guest_qr_scan',
                           'guest_manual_code'
                         )),
  status                 TEXT NOT NULL CHECK (status IN ('Active','Voided')),
  checked_in_at          TEXT NOT NULL,
  checked_in_by          TEXT,
  voided_by              TEXT,
  voided_at              TEXT,
  void_reason            TEXT,
  FOREIGN KEY (event_id)       REFERENCES events(event_id)       ON DELETE RESTRICT,
  FOREIGN KEY (member_user_id) REFERENCES accounts(user_id)      ON DELETE RESTRICT,
  FOREIGN KEY (checked_in_by)  REFERENCES accounts(user_id)      ON DELETE RESTRICT,
  FOREIGN KEY (voided_by)      REFERENCES accounts(user_id)      ON DELETE RESTRICT
) STRICT;

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

CREATE TABLE enrollment_approval_run_items (
  item_id          TEXT PRIMARY KEY,
  run_id           TEXT NOT NULL,
  sequence         INTEGER NOT NULL CHECK (sequence >= 0),
  request_id       TEXT NOT NULL,
  program_id       TEXT NOT NULL,
  member_user_id   TEXT NOT NULL,
  member_name      TEXT,
  member_username  TEXT,
  request_version  INTEGER NOT NULL CHECK (request_version >= 1),
  idempotency_key  TEXT NOT NULL UNIQUE,
  status           TEXT NOT NULL CHECK (
    status IN ('not_started', 'in_flight', 'completed', 'failed', 'outcome_unknown')
  ),
  retryable        INTEGER NOT NULL CHECK (retryable IN (0, 1)),
  enrollment_id    TEXT,
  error_code       TEXT,
  detail           TEXT CHECK (detail IS NULL OR length(detail) <= 1000),
  started_at       TEXT,
  settled_at       TEXT,
  FOREIGN KEY (run_id) REFERENCES enrollment_approval_runs(run_id) ON DELETE RESTRICT,
  FOREIGN KEY (request_id) REFERENCES enrollment_requests(request_id) ON DELETE RESTRICT,
  FOREIGN KEY (program_id) REFERENCES programs(program_id) ON DELETE RESTRICT,
  FOREIGN KEY (member_user_id) REFERENCES accounts(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (enrollment_id) REFERENCES enrollments(enrollment_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE enrollment_approval_runs (
  run_id         TEXT PRIMARY KEY,
  program_id     TEXT NOT NULL,
  actor_user_id  TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at     TEXT NOT NULL,
  finished_at    TEXT,
  cancelled_at   TEXT,
  correlation_id TEXT,
  FOREIGN KEY (program_id) REFERENCES programs(program_id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id) REFERENCES accounts(user_id) ON DELETE RESTRICT
) STRICT;

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
  created_at    TEXT NOT NULL, cancellation_reason TEXT,
  FOREIGN KEY (program_id)     REFERENCES programs(program_id)     ON DELETE RESTRICT,
  FOREIGN KEY (member_user_id) REFERENCES accounts(user_id)       ON DELETE RESTRICT,
  FOREIGN KEY (request_id)     REFERENCES enrollment_requests(request_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by)     REFERENCES accounts(user_id)       ON DELETE RESTRICT,
  FOREIGN KEY (cancelled_by)   REFERENCES accounts(user_id)       ON DELETE RESTRICT
) STRICT;

CREATE TABLE event_attendance_dispositions (
  disposition_id TEXT PRIMARY KEY,
  event_id       TEXT NOT NULL,
  enrollment_id  TEXT NOT NULL,
  member_user_id TEXT NOT NULL,
  disposition    TEXT NOT NULL CHECK (disposition IN ('Excused')),
  reason         TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  recorded_by    TEXT NOT NULL,
  recorded_at    TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE RESTRICT,
  FOREIGN KEY (enrollment_id) REFERENCES enrollments(enrollment_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (member_user_id) REFERENCES accounts(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (recorded_by) REFERENCES accounts(user_id) ON DELETE RESTRICT,
  UNIQUE (event_id, enrollment_id)
) STRICT;

CREATE TABLE event_attendance_snapshots (
  snapshot_id         TEXT PRIMARY KEY,
  event_id            TEXT NOT NULL UNIQUE,
  materialized_at     TEXT NOT NULL,
  last_materialized_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE event_expected_attendance (
  expected_attendance_id TEXT PRIMARY KEY,
  event_id               TEXT NOT NULL,
  snapshot_id            TEXT NOT NULL,
  enrollment_id          TEXT NOT NULL,
  member_user_id         TEXT NOT NULL,
  source                 TEXT NOT NULL CHECK (
    source IN ('event_start', 'early_attendance', 'late_approval')
  ),
  captured_at            TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE RESTRICT,
  FOREIGN KEY (snapshot_id) REFERENCES event_attendance_snapshots(snapshot_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (enrollment_id) REFERENCES enrollments(enrollment_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (member_user_id) REFERENCES accounts(user_id) ON DELETE RESTRICT,
  UNIQUE (event_id, enrollment_id),
  UNIQUE (event_id, member_user_id)
) STRICT;

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
  updated_at  TEXT NOT NULL, manual_check_in_code TEXT, check_in_window_opens_at TEXT, check_in_window_closes_at TEXT, availability TEXT NOT NULL DEFAULT 'Active'
  CHECK (availability IN ('Active', 'Inactive')), name TEXT, location TEXT, event_type TEXT
  CHECK (event_type IS NULL OR event_type IN ('崇拜', '訓練', '小組', '排練', '外展', '其他')), schedule_rule_id TEXT, occurrence_date TEXT,
  FOREIGN KEY (program_id) REFERENCES programs(program_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES accounts(user_id)   ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES accounts(user_id)   ON DELETE RESTRICT
) STRICT;

CREATE TABLE home_content (
  content_id        TEXT NOT NULL,
  version           INTEGER NOT NULL CHECK (version >= 1),
  template_type     TEXT NOT NULL CHECK (template_type IN ('A', 'B')),
  status            TEXT NOT NULL CHECK (status IN ('Draft', 'Published', 'Archived')),
  publish_mode      TEXT NOT NULL DEFAULT 'immediate'
                    CHECK (publish_mode IN ('immediate', 'scheduled')),
  start_at          TEXT,
  end_at            TEXT,
  title             TEXT,
  summary           TEXT,
  body_markdown     TEXT,
  cta_label         TEXT,
  cta_url           TEXT,
  image_url         TEXT,
  image_alt         TEXT,
  featured_event_id TEXT,
  created_by        TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  updated_by        TEXT,
  updated_at        TEXT NOT NULL,
  published_by      TEXT,
  published_at      TEXT,
  archived_by       TEXT,
  archived_at       TEXT,
  PRIMARY KEY (content_id, version),
  FOREIGN KEY (featured_event_id) REFERENCES events(event_id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES accounts(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES accounts(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (published_by) REFERENCES accounts(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (archived_by) REFERENCES accounts(user_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE participant_notices (
  notice_id      TEXT PRIMARY KEY,
  member_user_id TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('event','program','account')),
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  program_id     TEXT,
  event_id       TEXT,
  read_at        INTEGER,
  created_at     INTEGER NOT NULL
);

CREATE TABLE program_check_in_token_rotations (
  idempotency_key   TEXT PRIMARY KEY,
  request_fingerprint TEXT NOT NULL,
  actor_user_id     TEXT NOT NULL,
  program_id        TEXT NOT NULL,
  resulting_token   TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  FOREIGN KEY (actor_user_id) REFERENCES accounts(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (program_id) REFERENCES programs(program_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE program_generation_run_items (
  item_id       TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL,
  occurrence_id TEXT NOT NULL,
  starts_at     TEXT NOT NULL,
  outcome       TEXT NOT NULL CHECK (outcome IN ('created','skipped','failed')),
  event_id      TEXT,
  detail        TEXT,
  FOREIGN KEY (run_id)        REFERENCES program_generation_runs(run_id)   ON DELETE RESTRICT,
  FOREIGN KEY (occurrence_id) REFERENCES program_preview_occurrences(occurrence_id) ON DELETE RESTRICT,
  FOREIGN KEY (event_id)      REFERENCES events(event_id)                  ON DELETE RESTRICT
) STRICT;

CREATE TABLE program_generation_runs (
  run_id         TEXT PRIMARY KEY,
  program_id     TEXT NOT NULL,
  plan_id        TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('completed','partial','failed')),
  created        INTEGER NOT NULL DEFAULT 0,
  skipped        INTEGER NOT NULL DEFAULT 0,
  failed         INTEGER NOT NULL DEFAULT 0,
  started_at     TEXT NOT NULL,
  finished_at    TEXT,
  created_by     TEXT,
  correlation_id TEXT,
  FOREIGN KEY (program_id) REFERENCES programs(program_id) ON DELETE RESTRICT,
  FOREIGN KEY (plan_id)    REFERENCES program_preview_plans(plan_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES accounts(user_id)             ON DELETE RESTRICT
) STRICT;

CREATE TABLE program_notification_reads (
  user_id        TEXT NOT NULL,
  source_key     TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  read_at        TEXT NOT NULL,
  PRIMARY KEY (user_id, source_key, source_revision),
  FOREIGN KEY (user_id) REFERENCES accounts(user_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE program_preview_occurrences (
  occurrence_id TEXT PRIMARY KEY,
  plan_id       TEXT NOT NULL,
  rule_id       TEXT NOT NULL,
  occurs_on     TEXT NOT NULL,
  starts_at     TEXT NOT NULL,
  ends_at       TEXT NOT NULL,
  location      TEXT,
  skip_reason   TEXT CHECK (skip_reason IS NULL OR skip_reason IN ('CANCEL', 'DUPLICATE')),
  exception_id  TEXT, replacement_date TEXT,
  FOREIGN KEY (plan_id) REFERENCES program_preview_plans(plan_id) ON DELETE RESTRICT,
  FOREIGN KEY (rule_id) REFERENCES program_schedule_rules(rule_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE program_preview_plans (
  plan_id      TEXT PRIMARY KEY,
  program_id   TEXT NOT NULL,
  plan_hash    TEXT NOT NULL,
  horizon_days INTEGER NOT NULL CHECK (horizon_days >= 1 AND horizon_days <= 365),
  from_date    TEXT NOT NULL,
  rule_count   INTEGER NOT NULL CHECK (rule_count >= 0),
  created_by   TEXT,
  created_at   TEXT NOT NULL, to_date TEXT, schedule_version INTEGER, reviewed_at INTEGER,
  FOREIGN KEY (program_id) REFERENCES programs(program_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES accounts(user_id)   ON DELETE RESTRICT
) STRICT;

CREATE TABLE program_schedule_exceptions (
  exception_id   TEXT PRIMARY KEY,
  rule_id        TEXT NOT NULL,
  override_date  TEXT NOT NULL,
  action         TEXT NOT NULL CHECK (action IN ('CANCEL','RESCHEDULE')),
  new_start_time TEXT,
  new_end_time   TEXT,
  created_by     TEXT,
  created_at     TEXT NOT NULL, new_date TEXT,
  FOREIGN KEY (rule_id)    REFERENCES program_schedule_rules(rule_id)    ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES accounts(user_id)                  ON DELETE RESTRICT
) STRICT;

CREATE TABLE program_schedule_rule_idempotency (
  idempotency_key     TEXT PRIMARY KEY,
  request_fingerprint TEXT NOT NULL,
  actor_user_id       TEXT NOT NULL,
  program_id          TEXT NOT NULL,
  rule_id             TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  FOREIGN KEY (actor_user_id) REFERENCES accounts(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (program_id) REFERENCES programs(program_id) ON DELETE RESTRICT
) STRICT;

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
  updated_at    TEXT NOT NULL, location TEXT, effective_start_date TEXT, effective_end_date TEXT, retired_at TEXT, retired_by TEXT,
  FOREIGN KEY (program_id) REFERENCES programs(program_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES accounts(user_id)   ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES accounts(user_id)   ON DELETE RESTRICT
) STRICT;

CREATE TABLE program_schedule_versions (
  program_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL CHECK (version >= 0),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (program_id) REFERENCES programs(program_id) ON DELETE RESTRICT
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
  updated_at      TEXT NOT NULL, check_in_token TEXT, check_in_opens_at_minutes_before_start INTEGER NOT NULL DEFAULT 15, check_in_closes_at_minutes_after_end INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by)    REFERENCES accounts(user_id)        ON DELETE RESTRICT,
  FOREIGN KEY (updated_by)    REFERENCES accounts(user_id)        ON DELETE RESTRICT
) STRICT;

CREATE TABLE registration_batch_idempotency (
  actor_user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL CHECK (endpoint = 'registration.approve-batch'),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL CHECK (length(response_json) <= 20000),
  request_count INTEGER NOT NULL CHECK (request_count > 0 AND request_count <= 100),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (actor_user_id, endpoint, idempotency_key)
) STRICT;

CREATE TABLE "registration_requests" (
  request_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  username_normalized TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  credential_hash TEXT NOT NULL,
  account_status TEXT NOT NULL DEFAULT 'Pending' CHECK (account_status IN ('Pending','Active','Rejected')),
  submitted_at INTEGER NOT NULL,
  reviewed_by TEXT,
  reviewed_at INTEGER,
  review_decision TEXT CHECK (review_decision IS NULL OR review_decision IN ('Approved','Rejected')),
  rejection_note TEXT
) STRICT;

CREATE TABLE role_assignments (
  assignment_id    TEXT PRIMARY KEY,
  account_user_id  TEXT NOT NULL,
  role_definition_id TEXT NOT NULL,
  granted_by       TEXT NOT NULL,
  granted_at       TEXT NOT NULL,
  revoked_by       TEXT,
  revoked_at       TEXT,
  revoke_reason    TEXT, scope_kind TEXT NOT NULL DEFAULT 'Global'
    CHECK (scope_kind IN ('Global', 'Department', 'Program')), scope_id TEXT,
  FOREIGN KEY (account_user_id)   REFERENCES accounts(user_id)          ON DELETE RESTRICT,
  FOREIGN KEY (role_definition_id) REFERENCES role_definitions(role_definition_id) ON DELETE RESTRICT,
  FOREIGN KEY (granted_by)        REFERENCES accounts(user_id)          ON DELETE RESTRICT,
  FOREIGN KEY (revoked_by)        REFERENCES accounts(user_id)          ON DELETE RESTRICT
) STRICT;

CREATE TABLE "role_audit_events" (
  audit_id        TEXT PRIMARY KEY,
  inserted_at     TEXT NOT NULL,
  actor_user_id   TEXT,
  action          TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  old_value_json  TEXT,
  new_value_json  TEXT,
  reason          TEXT,
  outcome         TEXT NOT NULL
                  CHECK (outcome IN ('SUCCESS','DUPLICATE','CONFLICT','DENIED','REJECTED','FAILED')),
  correlation_id  TEXT
) STRICT;

CREATE TABLE role_categories (
  category_key    TEXT PRIMARY KEY
                  CHECK (category_key IN ('Global', 'Department', 'Program')),
  label           TEXT NOT NULL,
  description     TEXT NOT NULL,
  is_assignable   INTEGER NOT NULL DEFAULT 0
                  CHECK (is_assignable IN (0, 1)),
  display_order   INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
) STRICT;

CREATE TABLE role_definition_grants (
  role_definition_id TEXT NOT NULL,
  capability         TEXT NOT NULL
                     CHECK (capability IN (
                       'role.read',
                       'role.assign',
                       'role.revoke',
                       'role.reorder',
                       'role.name.write',
                       'role.permissions.read',
                       'role.permissions.write',
                       'role.scope.read',
                       'role.scope.write',
                       'role.create',
                       'role.delete',
                       'department.manage',
                       'department.publish',
                       'department.module.configure',
                       'department.manager.assign',
                       'program.manage',
                       'program.publish',
                       'program.enroll',
                       'program.leader.assign',
                       'account.permissions.read',
                       'account.permissions.write',
                       'account.directory.read',
                       'registration.approval.manage',
                       'home.publish'
                     )),
  granted_by         TEXT,
  granted_at         TEXT NOT NULL,
  PRIMARY KEY (role_definition_id, capability),
  FOREIGN KEY (role_definition_id) REFERENCES role_definitions(role_definition_id) ON DELETE RESTRICT,
  FOREIGN KEY (granted_by)         REFERENCES accounts(user_id)                   ON DELETE RESTRICT
) STRICT;

CREATE TABLE role_definitions (
  role_definition_id TEXT PRIMARY KEY,
  category_key       TEXT NOT NULL,
  stable_key         TEXT NOT NULL,
  label              TEXT NOT NULL,
  description        TEXT NOT NULL,
  scope_kind         TEXT NOT NULL
                     CHECK (scope_kind IN ('Global', 'Department', 'Program')),
  scope_id           TEXT,
  position           INTEGER NOT NULL,
  is_protected       INTEGER NOT NULL DEFAULT 0
                     CHECK (is_protected IN (0, 1)),
  is_archived        INTEGER NOT NULL DEFAULT 0
                     CHECK (is_archived IN (0, 1)),
  created_by         TEXT,
  created_at         TEXT NOT NULL,
  updated_by         TEXT,
  updated_at         TEXT NOT NULL,
  FOREIGN KEY (category_key) REFERENCES role_categories(category_key) ON DELETE RESTRICT,
  FOREIGN KEY (created_by)   REFERENCES accounts(user_id)             ON DELETE RESTRICT,
  FOREIGN KEY (updated_by)   REFERENCES accounts(user_id)             ON DELETE RESTRICT
) STRICT;

CREATE TABLE role_policy_mutations (
  idempotency_key      TEXT PRIMARY KEY,
  request_fingerprint  TEXT NOT NULL,
  actor_user_id        TEXT NOT NULL,
  base_revision        INTEGER NOT NULL CHECK (base_revision >= 1),
  outcome              TEXT NOT NULL
                       CHECK (outcome IN ('PENDING','SUCCESS','CONFLICT','DENIED')),
  resulting_revision   INTEGER,
  applied              INTEGER NOT NULL DEFAULT 0
                       CHECK (applied IN (0, 1)),
  audit_written        INTEGER NOT NULL DEFAULT 0
                       CHECK (audit_written IN (0, 1)),
  created_at           TEXT NOT NULL,
  completed_at         TEXT, result_json TEXT,
  FOREIGN KEY (actor_user_id) REFERENCES accounts(user_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE role_policy_revisions (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  revision     INTEGER NOT NULL CHECK (revision >= 1),
  updated_at   TEXT NOT NULL
) STRICT;

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

INSERT INTO "departments" ("department_id", "code", "name", "description", "lifecycle", "display_order", "created_by", "created_at", "updated_by", "updated_at") VALUES ('018f3b8a-0000-7000-8000-000000000001', '青區', '青區', '青少年事工部門', 'Active', 0, NULL, '2026-08-06T00:00:00Z', NULL, '2026-08-06T00:00:00Z');
INSERT INTO "departments" ("department_id", "code", "name", "description", "lifecycle", "display_order", "created_by", "created_at", "updated_by", "updated_at") VALUES ('018f3b8a-0000-7000-8000-000000000002', '成區', '成區', '成人事工部門', 'PendingDevelopment', 1, NULL, '2026-08-06T00:00:00Z', NULL, '2026-08-06T00:00:00Z');
INSERT INTO "departments" ("department_id", "code", "name", "description", "lifecycle", "display_order", "created_by", "created_at", "updated_by", "updated_at") VALUES ('018f3b8a-0000-7000-8000-000000000003', '兒區', '兒區', '兒童事工部門', 'PendingDevelopment', 2, NULL, '2026-08-06T00:00:00Z', NULL, '2026-08-06T00:00:00Z');

INSERT INTO "role_categories" ("category_key", "label", "description", "is_assignable", "display_order", "created_at") VALUES ('Global', '全教會', '全教會範圍的身份組分類，僅供受保護系統身份使用', 0, 0, '2026-08-27T00:00:00.000Z');
INSERT INTO "role_categories" ("category_key", "label", "description", "is_assignable", "display_order", "created_at") VALUES ('Department', '部門', '部門範圍的可指派身份組分類', 0, 1, '2026-08-27T00:00:00.000Z');
INSERT INTO "role_categories" ("category_key", "label", "description", "is_assignable", "display_order", "created_at") VALUES ('Program', '課程', '課程範圍的可指派身份組分類', 0, 2, '2026-08-27T00:00:00.000Z');

INSERT INTO "role_policy_revisions" ("id", "revision", "updated_at") VALUES (1, 1, '2026-08-27T00:00:00.000Z');

INSERT INTO "department_modules" ("department_id", "module_key", "enabled", "enabled_by", "enabled_at") VALUES ('018f3b8a-0000-7000-8000-000000000001', 'program_catalog', 0, NULL, '2026-08-06T00:00:00Z');
INSERT INTO "department_modules" ("department_id", "module_key", "enabled", "enabled_by", "enabled_at") VALUES ('018f3b8a-0000-7000-8000-000000000001', 'enrollment', 0, NULL, '2026-08-06T00:00:00Z');
INSERT INTO "department_modules" ("department_id", "module_key", "enabled", "enabled_by", "enabled_at") VALUES ('018f3b8a-0000-7000-8000-000000000001', 'events', 0, NULL, '2026-08-06T00:00:00Z');
INSERT INTO "department_modules" ("department_id", "module_key", "enabled", "enabled_by", "enabled_at") VALUES ('018f3b8a-0000-7000-8000-000000000001', 'attendance', 0, NULL, '2026-08-06T00:00:00Z');
INSERT INTO "department_modules" ("department_id", "module_key", "enabled", "enabled_by", "enabled_at") VALUES ('018f3b8a-0000-7000-8000-000000000001', 'custom_forms', 0, NULL, '2026-08-06T00:00:00Z');
INSERT INTO "department_modules" ("department_id", "module_key", "enabled", "enabled_by", "enabled_at") VALUES ('018f3b8a-0000-7000-8000-000000000002', 'program_catalog', 0, NULL, '2026-08-06T00:00:00Z');
INSERT INTO "department_modules" ("department_id", "module_key", "enabled", "enabled_by", "enabled_at") VALUES ('018f3b8a-0000-7000-8000-000000000002', 'enrollment', 0, NULL, '2026-08-06T00:00:00Z');
INSERT INTO "department_modules" ("department_id", "module_key", "enabled", "enabled_by", "enabled_at") VALUES ('018f3b8a-0000-7000-8000-000000000002', 'events', 0, NULL, '2026-08-06T00:00:00Z');
INSERT INTO "department_modules" ("department_id", "module_key", "enabled", "enabled_by", "enabled_at") VALUES ('018f3b8a-0000-7000-8000-000000000002', 'attendance', 0, NULL, '2026-08-06T00:00:00Z');
INSERT INTO "department_modules" ("department_id", "module_key", "enabled", "enabled_by", "enabled_at") VALUES ('018f3b8a-0000-7000-8000-000000000002', 'custom_forms', 0, NULL, '2026-08-06T00:00:00Z');
INSERT INTO "department_modules" ("department_id", "module_key", "enabled", "enabled_by", "enabled_at") VALUES ('018f3b8a-0000-7000-8000-000000000003', 'program_catalog', 0, NULL, '2026-08-06T00:00:00Z');
INSERT INTO "department_modules" ("department_id", "module_key", "enabled", "enabled_by", "enabled_at") VALUES ('018f3b8a-0000-7000-8000-000000000003', 'enrollment', 0, NULL, '2026-08-06T00:00:00Z');
INSERT INTO "department_modules" ("department_id", "module_key", "enabled", "enabled_by", "enabled_at") VALUES ('018f3b8a-0000-7000-8000-000000000003', 'events', 0, NULL, '2026-08-06T00:00:00Z');
INSERT INTO "department_modules" ("department_id", "module_key", "enabled", "enabled_by", "enabled_at") VALUES ('018f3b8a-0000-7000-8000-000000000003', 'attendance', 0, NULL, '2026-08-06T00:00:00Z');
INSERT INTO "department_modules" ("department_id", "module_key", "enabled", "enabled_by", "enabled_at") VALUES ('018f3b8a-0000-7000-8000-000000000003', 'custom_forms', 0, NULL, '2026-08-06T00:00:00Z');

CREATE INDEX account_events_action_idx ON account_events(action);

CREATE INDEX account_events_actor_idx ON account_events(actor_user_id);

CREATE UNIQUE INDEX accounts_username_normalized_idx
  ON accounts(username_normalized);

CREATE INDEX attendance_guest_reconcile_proofs_event_idx
  ON attendance_guest_reconcile_proofs(program_id, event_id);

CREATE UNIQUE INDEX attendances_active_event_guest_phone_idx
  ON attendances(event_id, guest_phone_normalized)
  WHERE status = 'Active'
    AND member_user_id IS NULL
    AND guest_phone_normalized IS NOT NULL;

CREATE UNIQUE INDEX attendances_active_event_member_idx
  ON attendances(event_id, member_user_id)
  WHERE status = 'Active' AND member_user_id IS NOT NULL;

CREATE INDEX attendances_event_idx ON attendances(event_id);

CREATE INDEX audit_events_actor_idx   ON audit_events(actor_user_id);

CREATE INDEX audit_events_corr_idx    ON audit_events(correlation_id);

CREATE INDEX audit_events_entity_idx  ON audit_events(entity_type, entity_id);

CREATE UNIQUE INDEX enrollment_approval_run_items_run_request_idx
  ON enrollment_approval_run_items(run_id, request_id);

CREATE UNIQUE INDEX enrollment_approval_run_items_run_sequence_idx
  ON enrollment_approval_run_items(run_id, sequence);

CREATE INDEX enrollment_approval_run_items_run_status_idx
  ON enrollment_approval_run_items(run_id, status, sequence);

CREATE UNIQUE INDEX enrollment_approval_runs_active_actor_program_idx
  ON enrollment_approval_runs(actor_user_id, program_id) WHERE status = 'active';

CREATE INDEX enrollment_approval_runs_actor_idx
  ON enrollment_approval_runs(actor_user_id, program_id, status, created_at DESC);

CREATE INDEX enrollment_approval_runs_program_idx
  ON enrollment_approval_runs(program_id, created_at DESC);

CREATE INDEX enrollment_requests_member_idx ON enrollment_requests(member_user_id);

CREATE UNIQUE INDEX enrollment_requests_pending_member_program_idx
  ON enrollment_requests(program_id, member_user_id) WHERE status = 'Pending';

CREATE INDEX enrollment_requests_program_status_idx ON enrollment_requests(program_id, status);

CREATE UNIQUE INDEX enrollments_active_member_program_idx
  ON enrollments(program_id, member_user_id) WHERE status = 'Active';

CREATE INDEX enrollments_member_idx ON enrollments(member_user_id);

CREATE INDEX event_attendance_dispositions_event_idx
  ON event_attendance_dispositions(event_id, member_user_id);

CREATE INDEX event_expected_attendance_event_idx
  ON event_expected_attendance(event_id, member_user_id);

CREATE INDEX events_availability_idx
  ON events(program_id, availability, starts_at);

CREATE UNIQUE INDEX events_manual_check_in_code_idx
  ON events(manual_check_in_code);

CREATE UNIQUE INDEX events_program_start_idx ON events(program_id, starts_at);

CREATE INDEX events_schedule_rule_occurrence_idx
  ON events(schedule_rule_id, occurrence_date);

CREATE INDEX generation_run_items_event_idx
  ON program_generation_run_items(event_id);

CREATE UNIQUE INDEX generation_run_items_run_occurrence_idx
  ON program_generation_run_items(run_id, occurrence_id);

CREATE UNIQUE INDEX generation_runs_plan_idx ON program_generation_runs(plan_id);

CREATE INDEX generation_runs_program_idx ON program_generation_runs(program_id, started_at DESC);

CREATE INDEX home_content_status_idx
  ON home_content(status, publish_mode, start_at, end_at);

CREATE INDEX home_content_template_updated_idx
  ON home_content(template_type, updated_at DESC);

CREATE UNIQUE INDEX home_content_version_idx
  ON home_content(version);

CREATE INDEX idx_participant_notices_member_created
  ON participant_notices(member_user_id, created_at DESC);

CREATE INDEX preview_occurrences_plan_idx
  ON program_preview_occurrences(plan_id, occurs_on, starts_at);

CREATE INDEX preview_plans_program_created_idx
  ON program_preview_plans(program_id, created_at DESC);

CREATE UNIQUE INDEX preview_plans_program_hash_idx
  ON program_preview_plans(program_id, plan_hash);

CREATE INDEX preview_plans_program_reviewed_idx
  ON program_preview_plans(program_id, reviewed_at DESC, plan_id DESC);

CREATE INDEX program_notification_reads_source_revision_idx
  ON program_notification_reads(source_key, source_revision);

CREATE INDEX program_notification_reads_user_source_idx
  ON program_notification_reads(user_id, source_key);

CREATE INDEX program_qr_rotations_actor_idx
  ON program_check_in_token_rotations(actor_user_id);

CREATE INDEX program_qr_rotations_program_idx
  ON program_check_in_token_rotations(program_id);

CREATE UNIQUE INDEX programs_check_in_token_idx
  ON programs(check_in_token);

CREATE INDEX programs_department_idx ON programs(department_id);

CREATE INDEX registration_batch_idempotency_actor_idx
  ON registration_batch_idempotency(actor_user_id, created_at);

CREATE INDEX role_assignments_account_idx
  ON role_assignments(account_user_id);

CREATE UNIQUE INDEX role_assignments_active_idx
  ON role_assignments(account_user_id, role_definition_id) WHERE revoked_at IS NULL;

CREATE INDEX role_assignments_active_role_idx
  ON role_assignments(role_definition_id) WHERE revoked_at IS NULL;

CREATE INDEX role_assignments_role_idx
  ON role_assignments(role_definition_id);

CREATE INDEX role_audit_events_actor_idx
  ON role_audit_events(actor_user_id);

CREATE INDEX role_audit_events_corr_idx
  ON role_audit_events(correlation_id);

CREATE INDEX role_audit_events_entity_idx
  ON role_audit_events(entity_type, entity_id);

CREATE INDEX role_definition_grants_capability_idx
  ON role_definition_grants(capability);

CREATE INDEX role_definitions_category_idx
  ON role_definitions(category_key, position);

CREATE UNIQUE INDEX role_definitions_stable_key_idx
  ON role_definitions(stable_key);

CREATE INDEX role_policy_mutations_actor_idx
  ON role_policy_mutations(actor_user_id, created_at);

CREATE UNIQUE INDEX schedule_exceptions_rule_date_idx
  ON program_schedule_exceptions(rule_id, override_date);

CREATE INDEX schedule_rule_idempotency_actor_idx
  ON program_schedule_rule_idempotency(actor_user_id);

CREATE INDEX schedule_rule_idempotency_program_idx
  ON program_schedule_rule_idempotency(program_id);

CREATE INDEX schedule_rules_program_effective_start_idx
  ON program_schedule_rules(program_id, effective_start_date);

CREATE INDEX schedule_rules_program_idx ON program_schedule_rules(program_id);

CREATE INDEX sessions_user_id_idx ON sessions(user_id);

CREATE TRIGGER accounts_user_id_immutable
BEFORE UPDATE OF user_id ON accounts
BEGIN
  SELECT RAISE(ABORT, 'user_id is immutable');
END;

CREATE TRIGGER attendance_guest_reconcile_proofs_bind_guest_attendance
BEFORE INSERT ON attendance_guest_reconcile_proofs
WHEN NOT EXISTS (
  SELECT 1
    FROM attendances attendance
    JOIN events event ON event.event_id = attendance.event_id
   WHERE attendance.attendance_id = NEW.attendance_id
     AND attendance.event_id = NEW.event_id
     AND event.program_id = NEW.program_id
     AND attendance.member_user_id IS NULL
     AND attendance.guest_phone_normalized IS NOT NULL
     AND attendance.status = 'Active'
)
BEGIN
  SELECT RAISE(ABORT, 'guest reconciliation proof target mismatch');
END;

CREATE TRIGGER attendance_guest_reconcile_proofs_no_delete
BEFORE DELETE ON attendance_guest_reconcile_proofs
BEGIN
  SELECT RAISE(ABORT, 'guest reconciliation proofs are immutable');
END;

CREATE TRIGGER attendance_guest_reconcile_proofs_no_update
BEFORE UPDATE ON attendance_guest_reconcile_proofs
BEGIN
  SELECT RAISE(ABORT, 'guest reconciliation proofs are immutable');
END;

CREATE TRIGGER audit_events_no_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is immutable');
END;

CREATE TRIGGER audit_events_no_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is immutable');
END;

CREATE TRIGGER enrollment_approval_run_items_identity_immutable
BEFORE UPDATE OF item_id, run_id, sequence, request_id, program_id,
  member_user_id, request_version, idempotency_key
ON enrollment_approval_run_items
BEGIN
  SELECT RAISE(ABORT, 'enrollment approval run item identity is immutable');
END;

CREATE TRIGGER enrollment_approval_run_items_no_delete
BEFORE DELETE ON enrollment_approval_run_items
BEGIN
  SELECT RAISE(ABORT, 'enrollment approval run items are immutable history');
END;

CREATE TRIGGER enrollment_approval_runs_no_delete
BEFORE DELETE ON enrollment_approval_runs
BEGIN
  SELECT RAISE(ABORT, 'enrollment approval runs are immutable history');
END;

CREATE TRIGGER event_attendance_snapshots_no_delete
BEFORE DELETE ON event_attendance_snapshots
BEGIN
  SELECT RAISE(ABORT, 'event_attendance_snapshots is immutable');
END;

CREATE TRIGGER event_expected_attendance_no_delete
BEFORE DELETE ON event_expected_attendance
BEGIN
  SELECT RAISE(ABORT, 'event_expected_attendance is immutable');
END;

CREATE TRIGGER event_expected_attendance_no_update
BEFORE UPDATE ON event_expected_attendance
BEGIN
  SELECT RAISE(ABORT, 'event_expected_attendance is immutable');
END;

CREATE TRIGGER events_schedule_provenance_immutable_update
BEFORE UPDATE OF schedule_rule_id, occurrence_date ON events
WHEN NEW.schedule_rule_id IS NOT OLD.schedule_rule_id
   OR NEW.occurrence_date IS NOT OLD.occurrence_date
BEGIN
  SELECT RAISE(ABORT, 'event schedule provenance is immutable');
END;

CREATE TRIGGER events_schedule_provenance_reference_insert
BEFORE INSERT ON events
WHEN NEW.schedule_rule_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
      FROM program_schedule_rules rule
     WHERE rule.rule_id = NEW.schedule_rule_id
       AND rule.program_id = NEW.program_id
  )
BEGIN
  SELECT RAISE(ABORT, 'event schedule provenance rule is invalid');
END;

CREATE TRIGGER events_schedule_provenance_reference_update
BEFORE UPDATE OF program_id, source, schedule_rule_id ON events
WHEN NEW.schedule_rule_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
      FROM program_schedule_rules rule
     WHERE rule.rule_id = NEW.schedule_rule_id
       AND rule.program_id = NEW.program_id
  )
BEGIN
  SELECT RAISE(ABORT, 'event schedule provenance rule is invalid');
END;

CREATE TRIGGER events_schedule_provenance_shape_insert
BEFORE INSERT ON events
WHEN (
    (NEW.schedule_rule_id IS NULL AND NEW.occurrence_date IS NOT NULL)
    OR (NEW.schedule_rule_id IS NOT NULL AND NEW.occurrence_date IS NULL)
    OR (NEW.source <> 'SCHEDULE' AND NEW.schedule_rule_id IS NOT NULL)
  )
BEGIN
  SELECT RAISE(ABORT, 'event schedule provenance must match source');
END;

CREATE TRIGGER events_schedule_provenance_shape_update
BEFORE UPDATE OF source, program_id, schedule_rule_id, occurrence_date ON events
WHEN (
    (NEW.schedule_rule_id IS NULL AND NEW.occurrence_date IS NOT NULL)
    OR (NEW.schedule_rule_id IS NOT NULL AND NEW.occurrence_date IS NULL)
    OR (NEW.source <> 'SCHEDULE' AND NEW.schedule_rule_id IS NOT NULL)
  )
BEGIN
  SELECT RAISE(ABORT, 'event schedule provenance must match source');
END;

CREATE TRIGGER program_qr_rotations_no_delete
BEFORE DELETE ON program_check_in_token_rotations
BEGIN
  SELECT RAISE(ABORT, 'program_check_in_token_rotations is immutable');
END;

CREATE TRIGGER program_qr_rotations_no_update
BEFORE UPDATE ON program_check_in_token_rotations
BEGIN
  SELECT RAISE(ABORT, 'program_check_in_token_rotations is immutable');
END;

CREATE TRIGGER registration_batch_idempotency_immutable_delete
BEFORE DELETE ON registration_batch_idempotency
BEGIN
  SELECT RAISE(ABORT, 'registration batch idempotency is immutable');
END;

CREATE TRIGGER registration_batch_idempotency_immutable_update
BEFORE UPDATE ON registration_batch_idempotency
BEGIN
  SELECT RAISE(ABORT, 'registration batch idempotency is immutable');
END;

CREATE TRIGGER role_assignments_active_update_guard
BEFORE UPDATE ON role_assignments
WHEN OLD.revoked_at IS NULL
  AND NEW.revoked_at IS NULL
  AND (
    NEW.assignment_id IS NOT OLD.assignment_id
    OR NEW.account_user_id IS NOT OLD.account_user_id
    OR NEW.role_definition_id IS NOT OLD.role_definition_id
    OR NEW.granted_by IS NOT OLD.granted_by
    OR NEW.granted_at IS NOT OLD.granted_at
    OR NEW.revoked_by IS NOT OLD.revoked_by
    OR NEW.revoke_reason IS NOT OLD.revoke_reason
  )
BEGIN
  SELECT RAISE(ABORT, 'role_assignments: active assignment rows are immutable');
END;

CREATE TRIGGER role_assignments_archived_guard
BEFORE INSERT ON role_assignments
WHEN EXISTS (
  SELECT 1 FROM role_definitions rd
   WHERE rd.role_definition_id = NEW.role_definition_id
     AND rd.is_archived = 1
)
BEGIN
  SELECT RAISE(ABORT, 'role_assignments: cannot assign an archived Role Definition');
END;

CREATE TRIGGER role_assignments_scope_snapshot_insert_guard
BEFORE INSERT ON role_assignments
WHEN EXISTS (
  SELECT 1
    FROM role_definitions rd
   WHERE rd.role_definition_id = NEW.role_definition_id
     AND (
       NEW.scope_kind IS NOT rd.scope_kind
       OR NEW.scope_id IS NOT rd.scope_id
     )
)
BEGIN
  SELECT RAISE(ABORT, 'role_assignments: scope snapshot must match Role Definition');
END;

CREATE TRIGGER role_assignments_scope_snapshot_no_update
BEFORE UPDATE OF scope_kind, scope_id ON role_assignments
BEGIN
  SELECT RAISE(ABORT, 'role_assignments: scope snapshot is immutable');
END;

CREATE TRIGGER role_assignments_terminal_delete_guard
BEFORE DELETE ON role_assignments
WHEN OLD.revoked_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'role_assignments: terminal assignment rows are immutable');
END;

CREATE TRIGGER role_assignments_terminal_update_guard
BEFORE UPDATE ON role_assignments
WHEN OLD.revoked_at IS NOT NULL
  OR (
    OLD.revoked_at IS NULL
    AND NEW.revoked_at IS NOT NULL
    AND (
      NEW.assignment_id IS NOT OLD.assignment_id
      OR NEW.account_user_id IS NOT OLD.account_user_id
      OR NEW.role_definition_id IS NOT OLD.role_definition_id
      OR NEW.scope_kind IS NOT OLD.scope_kind
      OR NEW.scope_id IS NOT OLD.scope_id
      OR NEW.granted_by IS NOT OLD.granted_by
      OR NEW.granted_at IS NOT OLD.granted_at
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'role_assignments: terminal assignment rows are immutable');
END;

CREATE TRIGGER role_audit_events_no_delete
BEFORE DELETE ON role_audit_events
BEGIN
  SELECT RAISE(ABORT, 'role_audit_events is immutable');
END;

CREATE TRIGGER role_audit_events_no_update
BEFORE UPDATE ON role_audit_events
BEGIN
  SELECT RAISE(ABORT, 'role_audit_events is immutable');
END;

CREATE TRIGGER role_categories_fixed_update
BEFORE UPDATE ON role_categories
BEGIN
  SELECT RAISE(ABORT, 'role_categories are fixed and non-assignable');
END;

CREATE TRIGGER role_categories_key_immutable
BEFORE UPDATE OF category_key ON role_categories
BEGIN
  SELECT RAISE(ABORT, 'role_categories.category_key is immutable');
END;

CREATE TRIGGER role_categories_no_delete
BEFORE DELETE ON role_categories
BEGIN
  SELECT RAISE(ABORT, 'role_categories is fixed and non-assignable');
END;

CREATE TRIGGER role_categories_non_assignable_insert
BEFORE INSERT ON role_categories
WHEN NEW.is_assignable <> 0
BEGIN
  SELECT RAISE(ABORT, 'role_categories must remain non-assignable');
END;

CREATE TRIGGER role_definition_grants_archived_guard
BEFORE INSERT ON role_definition_grants
WHEN EXISTS (
  SELECT 1 FROM role_definitions rd
   WHERE rd.role_definition_id = NEW.role_definition_id
     AND rd.is_archived = 1
)
BEGIN
  SELECT RAISE(ABORT, 'role_definition_grants: cannot grant to an archived Role Definition');
END;

CREATE TRIGGER role_definitions_id_immutable
BEFORE UPDATE OF role_definition_id ON role_definitions
BEGIN
  SELECT RAISE(ABORT, 'role_definitions.role_definition_id is immutable');
END;

CREATE TRIGGER role_definitions_protected_delete_guard
BEFORE DELETE ON role_definitions
WHEN OLD.is_protected = 1
   AND OLD.stable_key <> 'staff'
BEGIN
  SELECT RAISE(ABORT, 'role_definitions: protected system identity rows are immutable');
END;

CREATE TRIGGER role_definitions_protected_update_guard
BEFORE UPDATE ON role_definitions
WHEN OLD.is_protected = 1
   AND OLD.stable_key <> 'staff'
   AND (OLD.label <> NEW.label
        OR OLD.description <> NEW.description
        OR OLD.position <> NEW.position
        OR OLD.is_protected <> NEW.is_protected
        OR OLD.is_archived <> NEW.is_archived
        OR OLD.stable_key <> NEW.stable_key
        OR OLD.category_key <> NEW.category_key
        OR OLD.scope_kind <> NEW.scope_kind
        OR COALESCE(OLD.scope_id, '<NULL>') <> COALESCE(NEW.scope_id, '<NULL>'))
BEGIN
  SELECT RAISE(ABORT, 'role_definitions: protected system identity rows are immutable');
END;

CREATE TRIGGER role_definitions_scope_required_insert
BEFORE INSERT ON role_definitions
WHEN (NEW.scope_kind = 'Global'     AND NEW.scope_id IS NOT NULL)
   OR (NEW.scope_kind IN ('Department','Program') AND NEW.scope_id IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'role_definitions.scope_id is required for non-Global scope and forbidden for Global scope');
END;

CREATE TRIGGER role_definitions_scope_required_update
BEFORE UPDATE OF scope_kind, scope_id ON role_definitions
WHEN (NEW.scope_kind = 'Global'     AND NEW.scope_id IS NOT NULL)
   OR (NEW.scope_kind IN ('Department','Program') AND NEW.scope_id IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'role_definitions.scope_id is required for non-Global scope and forbidden for Global scope');
END;

CREATE TRIGGER role_definitions_staff_must_remain_assignable_insert
BEFORE INSERT ON role_definitions
WHEN NEW.stable_key = 'staff' AND NEW.is_protected <> 0
BEGIN
  SELECT RAISE(ABORT, 'role_definitions: Staff must remain assignable');
END;

CREATE TRIGGER role_definitions_staff_must_remain_assignable_update
BEFORE UPDATE ON role_definitions
WHEN NEW.stable_key = 'staff' AND NEW.is_protected <> 0
BEGIN
  SELECT RAISE(ABORT, 'role_definitions: Staff must remain assignable');
END;

CREATE TRIGGER role_definitions_system_anchors_no_update
BEFORE UPDATE ON role_definitions
WHEN OLD.stable_key IN ('admin', 'member')
BEGIN
  SELECT RAISE(ABORT, 'role_definitions: protected system identity rows are immutable');
END;

CREATE TRIGGER role_policy_mutations_terminal_no_delete
BEFORE DELETE ON role_policy_mutations
WHEN OLD.outcome <> 'PENDING'
BEGIN
  SELECT RAISE(ABORT, 'role_policy_mutations: terminal idempotency rows are immutable');
END;

CREATE TRIGGER role_policy_mutations_terminal_no_update
BEFORE UPDATE ON role_policy_mutations
WHEN OLD.outcome <> 'PENDING'
BEGIN
  SELECT RAISE(ABORT, 'role_policy_mutations: terminal idempotency rows are immutable');
END;

CREATE TRIGGER schedule_rule_idempotency_no_delete
BEFORE DELETE ON program_schedule_rule_idempotency
BEGIN
  SELECT RAISE(ABORT, 'program_schedule_rule_idempotency is immutable');
END;

CREATE TRIGGER schedule_rule_idempotency_no_update
BEFORE UPDATE ON program_schedule_rule_idempotency
BEGIN
  SELECT RAISE(ABORT, 'program_schedule_rule_idempotency is immutable');
END;

CREATE TRIGGER schedule_rule_retirement_immutable_update
BEFORE UPDATE OF retired_at, retired_by ON program_schedule_rules
WHEN OLD.retired_at IS NOT NULL
  AND (
    NEW.retired_at IS NOT OLD.retired_at
    OR NEW.retired_by IS NOT OLD.retired_by
  )
BEGIN
  SELECT RAISE(ABORT, 'schedule rule retirement is immutable');
END;

CREATE TRIGGER schedule_rule_retirement_shape_insert
BEFORE INSERT ON program_schedule_rules
WHEN (NEW.retired_at IS NULL AND NEW.retired_by IS NOT NULL)
   OR (NEW.retired_at IS NOT NULL AND NEW.retired_by IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'schedule rule retirement markers must be paired');
END;

CREATE TRIGGER schedule_rule_retirement_shape_update
BEFORE UPDATE OF retired_at, retired_by ON program_schedule_rules
WHEN (NEW.retired_at IS NULL AND NEW.retired_by IS NOT NULL)
   OR (NEW.retired_at IS NOT NULL AND NEW.retired_by IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'schedule rule retirement markers must be paired');
END;
