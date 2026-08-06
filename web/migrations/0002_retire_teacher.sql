-- Migration number: 0002 	 2026-08-06T00:00:00.000Z
-- EFCC D1 identity — retire the legacy Teacher role (ADR-0025).
--
-- Canonical global roles are `Admin`, `Staff`, and `Member`; `Teacher` is
-- retired as a stored+API value. This data migration converts any existing
-- Teacher account to the canonical Staff role. It is reversible via the
-- inverse UPDATE and touches no account rows beyond the role column: user_id
-- and QR identity are untouched (ADR-0025 line 5, plan §Failure Modes).

UPDATE accounts SET role = 'Staff' WHERE role = 'Teacher';
-- Migration ends here