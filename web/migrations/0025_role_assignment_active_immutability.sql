-- Migration number: 0025  2026-08-31T00:00:00.000Z
-- #486 — active assignment identity and grant fields are immutable.
--
-- Revoke is the only allowed active-row transition. Scope snapshots and all
-- assignment identity/grant fields must not be rewritten outside the Worker
-- mutation kernel.

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
