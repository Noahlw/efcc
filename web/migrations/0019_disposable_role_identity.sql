-- Migration number: 0019  2026-08-27T00:00:00.000Z
-- #476 — Disposable pre-production D1 identity foundation (Spec 091 §§ 1–6,
-- ADR-0042).
--
-- This migration creates the canonical normalized identity schema:
--   * role_categories — fixed, non-assignable Role Categories.
--   * role_definitions — Role Definitions with explicit scope and lifecycle.
--   * role_definition_grants — closed capability grants.
--   * role_assignments — Account-to-Role Definition assignments with history.
--   * role_policy_revisions — singleton revision ledger.
--   * role_policy_mutations — actor-bound idempotency ledger.
--   * role_audit_events — immutable audit log.
--
-- Seeds and runtime authority use these records exclusively. A read-only
-- preflight rejects a database that still contains retired authority tables
-- and prints the operator's manual reset command; this migration never drops
-- data.
--
-- Conventions:
--   * All new tables use TEXT ISO-8601 UTC timestamps and STRICT mode.
--   * Foreign keys are ON DELETE RESTRICT.
--   * Every closed vocabulary is CHECK-constrained.
--   * role_audit_events is immutable (BEFORE UPDATE / DELETE triggers).
--   * role_policy_mutations audit_written is monotonic (1 once written).

-- ---------------------------------------------------------------------------
-- 1. Fixed, non-assignable Role Categories (Spec 091 §2).
-- ---------------------------------------------------------------------------

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

-- Categories are fixed identifiers; the only writable column on a category
-- row is its label/description/display_order/is_assignable. category_key is
-- immutable so the read projection can rely on stable join keys.
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

INSERT INTO role_categories (category_key, label, description, is_assignable, display_order, created_at) VALUES
  ('Global',     '全教會',     '全教會範圍的身份組分類，僅供受保護系統身份使用', 0, 0, '2026-08-27T00:00:00.000Z'),
  ('Department', '部門',       '部門範圍的可指派身份組分類',                   0, 1, '2026-08-27T00:00:00.000Z'),
  ('Program',    '課程',       '課程範圍的可指派身份組分類',                   0, 2, '2026-08-27T00:00:00.000Z');

-- ---------------------------------------------------------------------------
-- 2. Normalized Role Definitions (Spec 091 §3, ADR-0042).
-- ---------------------------------------------------------------------------

CREATE TABLE role_definitions (
  role_definition_id TEXT PRIMARY KEY,
  category_key       TEXT NOT NULL,
  stable_key         TEXT NOT NULL,
  label              TEXT NOT NULL,
  description        TEXT NOT NULL,
  scope_kind         TEXT NOT NULL
                     CHECK (scope_kind IN ('Global', 'Department', 'Program')),
  scope_id           TEXT,                         -- NULL only when scope_kind = 'Global'
  position           INTEGER NOT NULL,             -- display order, immutable
  is_protected       INTEGER NOT NULL DEFAULT 0
                     CHECK (is_protected IN (0, 1)),
  is_archived        INTEGER NOT NULL DEFAULT 0
                     CHECK (is_archived IN (0, 1)),
  created_by         TEXT,                         -- NULL for system-seeded rows
  created_at         TEXT NOT NULL,
  updated_by         TEXT,
  updated_at         TEXT NOT NULL,
  FOREIGN KEY (category_key) REFERENCES role_categories(category_key) ON DELETE RESTRICT,
  FOREIGN KEY (created_by)   REFERENCES accounts(user_id)             ON DELETE RESTRICT,
  FOREIGN KEY (updated_by)   REFERENCES accounts(user_id)             ON DELETE RESTRICT
) STRICT;

-- Stable key is the natural identifier (e.g. 'admin', 'staff', 'member',
-- 'department.manager.adult', 'program.leader.youth-bible-study'). It is
-- unique across the disposable schema so seeds and seeds-style imports can
-- look up a Role Definition without an extra column.
CREATE UNIQUE INDEX role_definitions_stable_key_idx
  ON role_definitions(stable_key);

CREATE INDEX role_definitions_category_idx
  ON role_definitions(category_key, position);

-- Scope invariant: scoped identities must carry an explicit scope_id, and a
-- Global identity must NOT carry one. BEFORE INSERT and UPDATE so the
-- constraint violation reads as a clean guard rather than a CHECK error.
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

-- Protected system identity immutability. Admin and 會友基礎 are seeded with
-- is_protected = 1; Staff remains assignable. Any UPDATE of
-- label/description/position that touches a protected row, or any DELETE,
-- is rejected at the schema layer.
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

CREATE TRIGGER role_definitions_protected_delete_guard
BEFORE DELETE ON role_definitions
WHEN OLD.is_protected = 1
   AND OLD.stable_key <> 'staff'
BEGIN
  SELECT RAISE(ABORT, 'role_definitions: protected system identity rows are immutable');
END;

-- role_definition_id is stable for the lifetime of a Role Definition: rename
-- is a label/description change, not a row replace, so the ID never shifts
-- and the assignment / grant archives keep their referential meaning.
CREATE TRIGGER role_definitions_id_immutable
BEFORE UPDATE OF role_definition_id ON role_definitions
BEGIN
  SELECT RAISE(ABORT, 'role_definitions.role_definition_id is immutable');
END;

-- ---------------------------------------------------------------------------
-- 3. Closed capability grants (Spec 091 §4, ADR-0042).
-- ---------------------------------------------------------------------------

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

CREATE INDEX role_definition_grants_capability_idx
  ON role_definition_grants(capability);

-- An archived Role Definition is no longer a target for new grants; existing
-- grants survive the archive (the audit row records what was carried at the
-- moment of archive) but a re-archive of a previously active row cannot
-- silently re-grant powers.
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

-- ---------------------------------------------------------------------------
-- 4. Account → Role Definition assignments (Spec 091 §5).
-- ---------------------------------------------------------------------------

CREATE TABLE role_assignments (
  assignment_id    TEXT PRIMARY KEY,
  account_user_id  TEXT NOT NULL,
  role_definition_id TEXT NOT NULL,
  granted_by       TEXT NOT NULL,
  granted_at       TEXT NOT NULL,
  revoked_by       TEXT,
  revoked_at       TEXT,
  revoke_reason    TEXT,
  FOREIGN KEY (account_user_id)   REFERENCES accounts(user_id)          ON DELETE RESTRICT,
  FOREIGN KEY (role_definition_id) REFERENCES role_definitions(role_definition_id) ON DELETE RESTRICT,
  FOREIGN KEY (granted_by)        REFERENCES accounts(user_id)          ON DELETE RESTRICT,
  FOREIGN KEY (revoked_by)        REFERENCES accounts(user_id)          ON DELETE RESTRICT
) STRICT;

-- One active (non-revoked) assignment per (account, Role Definition) pair.
-- The partial index keeps the active-row check cheap and is enforced by D1
-- as a UNIQUE constraint.
CREATE UNIQUE INDEX role_assignments_active_idx
  ON role_assignments(account_user_id, role_definition_id) WHERE revoked_at IS NULL;

CREATE INDEX role_assignments_account_idx
  ON role_assignments(account_user_id);
CREATE INDEX role_assignments_role_idx
  ON role_assignments(role_definition_id);
CREATE INDEX role_assignments_active_role_idx
  ON role_assignments(role_definition_id) WHERE revoked_at IS NULL;

-- Assignment against an archived Role Definition is rejected at the schema
-- layer; the Worker transaction is the only path that can archive a role
-- safely, and the archive is the operation that revokes existing assignments.
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

-- ---------------------------------------------------------------------------
-- 5. Singleton role policy revision ledger (Spec 091 §6).
-- ---------------------------------------------------------------------------

CREATE TABLE role_policy_revisions (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  revision     INTEGER NOT NULL CHECK (revision >= 1),
  updated_at   TEXT NOT NULL
) STRICT;

INSERT OR IGNORE INTO role_policy_revisions (id, revision, updated_at)
VALUES (1, 1, '2026-08-27T00:00:00.000Z');

-- ---------------------------------------------------------------------------
-- 6. Durable idempotency ledger for privileged mutations (Spec 091 §6).
-- ---------------------------------------------------------------------------

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
  completed_at         TEXT,
  FOREIGN KEY (actor_user_id) REFERENCES accounts(user_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX role_policy_mutations_actor_idx
  ON role_policy_mutations(actor_user_id, created_at);

-- ---------------------------------------------------------------------------
-- 7. Immutable audit log (Spec 091 §6, ADR-0042 role-deletion semantics).
-- ---------------------------------------------------------------------------

CREATE TABLE role_audit_events (
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

CREATE INDEX role_audit_events_entity_idx
  ON role_audit_events(entity_type, entity_id);
CREATE INDEX role_audit_events_actor_idx
  ON role_audit_events(actor_user_id);
CREATE INDEX role_audit_events_corr_idx
  ON role_audit_events(correlation_id);

CREATE TRIGGER role_audit_events_no_update
BEFORE UPDATE ON role_audit_events
BEGIN
  SELECT RAISE(ABORT, 'role_audit_events is immutable');
END;

CREATE TRIGGER role_audit_events_no_delete
BEFORE DELETE ON role_audit_events
BEGIN
  SELECT RAISE(ABORT, 'role_audit_events is immutable');
END;

-- Migration ends here
