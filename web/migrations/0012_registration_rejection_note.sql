-- Migration number: 0012  2026-08-17T00:00:00.000Z
-- Registration Approvals Detail (Ticket 087-02 #319): required rejection note
-- per ADR-0006 ("Rejecting requires a reason"). The note is written atomically
-- with the Rejected transition and surfaced read-only on the Approval Detail
-- screen. NULL for Pending/Approved requests.

ALTER TABLE registration_requests ADD COLUMN rejection_note TEXT;
