-- Migration number: 0030  2026-09-15T00:00:00.000Z
-- Programs production workset #620: immutable generated-Event provenance and
-- one-way Schedule Rule retirement. Existing SCHEDULE rows remain readable as
-- legacy rows with NULL provenance; new generated rows are written through the
-- domain generator with both provenance columns populated.

ALTER TABLE events ADD COLUMN schedule_rule_id TEXT;
ALTER TABLE events ADD COLUMN occurrence_date TEXT;
ALTER TABLE program_schedule_rules ADD COLUMN retired_at TEXT;
ALTER TABLE program_schedule_rules ADD COLUMN retired_by TEXT;

CREATE INDEX events_schedule_rule_occurrence_idx
  ON events(schedule_rule_id, occurrence_date);

-- Provenance is an all-or-nothing pair and is only valid for Schedule Events.
-- The SCHEDULE + NULL legacy shape is intentionally allowed for rows created
-- before this migration; application generation owns the new-row guarantee.
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

-- A provenance-bearing Event must point at a Rule in the same Program. This
-- is a logical reference because the legacy table cannot be altered in place
-- to add a new FK without rebuilding it; there is deliberately no cascade.
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

-- The same logical reference must hold when a caller changes the Event's
-- Program, source, or Rule identity after insertion. Without an UPDATE guard,
-- a source-only edit could bypass both provenance invariants.
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

-- Provenance is historical identity, not editable Event metadata. Explicit
-- Event reschedules update starts_at/ends_at only and therefore remain valid.
CREATE TRIGGER events_schedule_provenance_immutable_update
BEFORE UPDATE OF schedule_rule_id, occurrence_date ON events
WHEN NEW.schedule_rule_id IS NOT OLD.schedule_rule_id
   OR NEW.occurrence_date IS NOT OLD.occurrence_date
BEGIN
  SELECT RAISE(ABORT, 'event schedule provenance is immutable');
END;

-- A Rule can be retired once; it remains a historical row. No delete or
-- cascade path is introduced, and a partial retirement marker is invalid.
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
