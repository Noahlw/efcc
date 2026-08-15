-- AUTH-06 #295 — persist the reviewer's rejection note on registration
-- rejections (AUTH-04 #162). The domain module requires a non-empty note for
-- the Pending -> Rejected transition and stores it here for the reviewer's
-- record. The note is never exposed through the safe-metadata queue listing
-- (QUEUE_COLUMNS deliberately excludes it) or any response body.
ALTER TABLE registration_requests ADD COLUMN rejection_note TEXT;
