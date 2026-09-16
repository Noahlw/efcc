-- Programs production readiness #623: durable schedule revision and preview
-- review recency. Generation uses the revision in an atomic D1 batch guard so
-- a schedule mutation cannot commit between freshness validation and an Event
-- write.

CREATE TABLE program_schedule_versions (
  program_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL CHECK (version >= 0),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (program_id) REFERENCES programs(program_id) ON DELETE RESTRICT
) STRICT;

INSERT INTO program_schedule_versions (program_id, version, updated_at)
SELECT program_id, 0, updated_at
  FROM programs;

ALTER TABLE program_preview_plans ADD COLUMN schedule_version INTEGER;
ALTER TABLE program_preview_plans ADD COLUMN reviewed_at INTEGER;

UPDATE program_preview_plans
   SET schedule_version = 0
 WHERE schedule_version IS NULL;

UPDATE program_preview_plans
   SET reviewed_at = CAST(strftime('%s', created_at) AS INTEGER) * 1000
 WHERE reviewed_at IS NULL;

CREATE INDEX preview_plans_program_reviewed_idx
  ON program_preview_plans(program_id, reviewed_at DESC, plan_id DESC);
