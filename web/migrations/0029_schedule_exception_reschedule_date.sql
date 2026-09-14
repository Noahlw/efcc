-- Migration number: 0029  2026-09-15T00:00:00.000Z
-- Programs production workset #608: persist an optional replacement HK wall
-- date for a single scheduled occurrence. NULL preserves the legacy
-- same-date time-only reschedule contract.

ALTER TABLE program_schedule_exceptions ADD COLUMN new_date TEXT;
