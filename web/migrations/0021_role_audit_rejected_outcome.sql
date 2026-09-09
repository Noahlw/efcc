-- Migration number: 0021  2026-08-28T00:00:00.000Z
-- #478 — extend role_audit_events outcome vocabulary with REJECTED.
--
-- The #478 acceptance trace (docs/specs/s4-phase-a-acceptance-trace.md,
-- H-07/H-13) documents REJECTED audit rows for name-conflict and
-- idempotency-key-reuse rejections. Migration 0019's CHECK only allowed
-- SUCCESS / DUPLICATE / CONFLICT / DENIED / FAILED (Spec 091 §11), so the
-- table is rebuilt with REJECTED added. The rebuild preserves every row,
-- the STRICT mode, the immutability triggers, and the existing indexes.
--
-- SQLite has no ALTER TABLE ... DROP CONSTRAINT, so the rebuild is the
-- supported path: create the new table, copy rows, drop the old table
-- (with its triggers), rename, and recreate the triggers + indexes.

CREATE TABLE role_audit_events_new (
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

INSERT INTO role_audit_events_new
  (audit_id, inserted_at, actor_user_id, action, entity_type,
   entity_id, old_value_json, new_value_json, reason, outcome, correlation_id)
SELECT audit_id, inserted_at, actor_user_id, action, entity_type,
       entity_id, old_value_json, new_value_json, reason, outcome, correlation_id
  FROM role_audit_events;

DROP TABLE role_audit_events;

ALTER TABLE role_audit_events_new RENAME TO role_audit_events;

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
