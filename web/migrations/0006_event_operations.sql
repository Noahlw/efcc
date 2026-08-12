-- Migration number: 0006  2026-08-12T00:00:00.000Z
-- Event Operations (#251): independent availability plus operator identity fields.

ALTER TABLE events ADD COLUMN availability TEXT NOT NULL DEFAULT 'Active'
  CHECK (availability IN ('Active', 'Inactive'));
ALTER TABLE events ADD COLUMN name TEXT;
ALTER TABLE events ADD COLUMN location TEXT;

CREATE INDEX events_availability_idx
  ON events(program_id, availability, starts_at);
