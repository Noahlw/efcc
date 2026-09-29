-- Custom SQL migration file, put your code below! --
-- Drizzle Kit 0.31.11 does not generate EFCC's descending Home index or
-- immutable audit triggers. Keep these SQL objects in the same Wrangler D1
-- migration ledger as the generated table/index SQL.
CREATE INDEX home_content_template_updated_idx
  ON home_content(template_type, updated_at DESC);
--> statement-breakpoint
CREATE TRIGGER audit_events_no_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER audit_events_no_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is immutable');
END;
