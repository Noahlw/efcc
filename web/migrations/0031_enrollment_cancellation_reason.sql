-- Migration number: 0031  2026-09-15T05:00:00.000Z
-- Preserve the operator's reason when a manager cancels another member's
-- enrollment. Existing self-exit rows remain NULL.
ALTER TABLE enrollments ADD COLUMN cancellation_reason TEXT;
