-- Migration number: 0024  2026-08-29T00:00:00.000Z
-- #486 — preserve the Role Definition scope at assignment time.
--
-- Assignment history must remain explainable after a Role Definition is
-- rescoped. These columns are immutable snapshots, not a second authority
-- source: current role metadata still controls present lifecycle decisions.

ALTER TABLE role_assignments
  ADD COLUMN scope_kind TEXT NOT NULL DEFAULT 'Global'
    CHECK (scope_kind IN ('Global', 'Department', 'Program'));
ALTER TABLE role_assignments
  ADD COLUMN scope_id TEXT;

-- One-time migration backfill. New writes provide the snapshot explicitly.
UPDATE role_assignments
   SET scope_kind = (
         SELECT rd.scope_kind
           FROM role_definitions rd
          WHERE rd.role_definition_id = role_assignments.role_definition_id
       ),
       scope_id = (
         SELECT rd.scope_id
           FROM role_definitions rd
          WHERE rd.role_definition_id = role_assignments.role_definition_id
       );

CREATE TRIGGER role_assignments_scope_snapshot_insert_guard
BEFORE INSERT ON role_assignments
WHEN EXISTS (
  SELECT 1
    FROM role_definitions rd
   WHERE rd.role_definition_id = NEW.role_definition_id
     AND (
       NEW.scope_kind <> rd.scope_kind
       OR COALESCE(NEW.scope_id, '<NULL>') <> COALESCE(rd.scope_id, '<NULL>')
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

-- Migration ends here
