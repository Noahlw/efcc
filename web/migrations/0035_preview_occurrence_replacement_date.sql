-- Preserve the reviewed HK wall-date replacement on durable Preview rows.
-- occurs_on remains the original Rule occurrence for provenance.
ALTER TABLE program_preview_occurrences ADD COLUMN replacement_date TEXT;
