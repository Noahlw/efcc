-- Migration number: 0028  2026-09-15T00:00:00.000Z
-- Programs production workset #596: per-rule inclusive Church Time bounds
-- and an exact selected Preview period. Existing rows remain readable: a NULL
-- rule start is the legacy "no lower bound" value and a NULL plan end is
-- reconstructed from the existing horizon_days/from_date pair.

ALTER TABLE program_schedule_rules ADD COLUMN effective_start_date TEXT;
ALTER TABLE program_schedule_rules ADD COLUMN effective_end_date TEXT;

-- Keep horizon_days/from_date as the compatibility representation while
-- retaining the explicit end date for new date-range requests.
ALTER TABLE program_preview_plans ADD COLUMN to_date TEXT;

CREATE INDEX schedule_rules_program_effective_start_idx
  ON program_schedule_rules(program_id, effective_start_date);
