-- Migration number: 0022  2026-08-28T00:00:00.000Z
-- #476 remediation — fixed Role Categories and protected identity anchors.
--
-- Migration 0019 established the normalized disposable identity schema. These
-- additive guards close the remaining SQL boundary: the three initial Role
-- Categories are fixed, and every column on the protected Admin / 會友基礎
-- anchors is immutable. Staff deliberately remains assignable and writable by
-- the Worker role-management authority seam.

-- The initial category tree is product-owned structure. Categories are
-- non-assignable headings, not operator-editable records.
CREATE TRIGGER role_categories_fixed_update
BEFORE UPDATE ON role_categories
BEGIN
  SELECT RAISE(ABORT, 'role_categories are fixed and non-assignable');
END;

CREATE TRIGGER role_categories_non_assignable_insert
BEFORE INSERT ON role_categories
WHEN NEW.is_assignable <> 0
BEGIN
  SELECT RAISE(ABORT, 'role_categories must remain non-assignable');
END;

-- Admin and 會友基礎 are the two protected system anchors. Guarding the
-- complete row (rather than a selected field list) also covers timestamps and
-- future metadata columns added through a table rebuild. Staff is intentionally
-- excluded: it is an assignable system identity and may be changed by the
-- authorized Worker seam.
CREATE TRIGGER role_definitions_system_anchors_no_update
BEFORE UPDATE ON role_definitions
WHEN OLD.stable_key IN ('admin', 'member')
BEGIN
  SELECT RAISE(ABORT, 'role_definitions: protected system identity rows are immutable');
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

-- Migration ends here
