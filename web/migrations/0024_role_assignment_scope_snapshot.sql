-- Migration number: 0024  2026-08-29T00:00:00.000Z
-- #486 — preserve the Role Definition scope at assignment time.
--
-- Assignment history must remain explainable after a Role Definition is
-- rescoped. These columns are immutable snapshots and are authoritative for
-- assignment display and authorization; current role metadata still controls
-- identity labels, grants, position, and lifecycle decisions.

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

-- A revoked assignment is a terminal history event. The only permitted
-- transition is active (revoked_at IS NULL) to revoked; all identity,
-- granting, and revocation fields are immutable afterwards.
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

CREATE TRIGGER role_assignments_terminal_delete_guard
BEFORE DELETE ON role_assignments
WHEN OLD.revoked_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'role_assignments: terminal assignment rows are immutable');
END;

-- Migration ends here
