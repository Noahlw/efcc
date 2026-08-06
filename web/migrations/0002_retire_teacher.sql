-- Migration number: 0002 	 2026-08-06T00:00:00.000Z
-- EFCC D1 identity — retire the legacy Teacher role (ADR-0025).
--
-- Canonical global roles are `Admin`, `Staff`, and `Member`; `Teacher` is
-- retired as a stored+API value. This data migration converts any existing
-- Teacher account to the canonical Staff role. It is reversible via the
-- inverse UPDATE and touches no account rows beyond the role column: user_id
-- and QR identity are untouched (ADR-0025 line 5, plan §Failure Modes).

UPDATE accounts SET role = 'Staff' WHERE role = 'Teacher';

-- Write-time enforcement (review P2 / migration finding): the migration above
-- only rewrites rows that exist TODAY. Raw INSERT/UPDATE statements that still
-- carry the retired spelling (or any non-canonical value) would silently
-- re-introduce it, because no schema constraint checked the column. These
-- triggers fail the statement closed on every write path.
CREATE TRIGGER accounts_role_write_guard_insert
AFTER INSERT ON accounts
WHEN NEW.role NOT IN ('Admin', 'Staff', 'Member')
BEGIN
  SELECT RAISE(ABORT, 'role must be Admin, Staff, or Member');
END;

CREATE TRIGGER accounts_role_write_guard_update
AFTER UPDATE OF role ON accounts
WHEN NEW.role NOT IN ('Admin', 'Staff', 'Member')
BEGIN
  SELECT RAISE(ABORT, 'role must be Admin, Staff, or Member');
END;
-- Migration ends here