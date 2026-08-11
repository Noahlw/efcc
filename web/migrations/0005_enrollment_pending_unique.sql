-- Preserve the oldest request and close any legacy duplicate Pending rows
-- before the new race guard is created. No request history is deleted.
WITH duplicate_pending AS (
  SELECT
    request_id,
    ROW_NUMBER() OVER (
      PARTITION BY program_id, member_user_id
      ORDER BY submitted_at ASC, request_id ASC
    ) AS occurrence
  FROM enrollment_requests
  WHERE status = 'Pending'
)
UPDATE enrollment_requests
SET status = 'Withdrawn',
    decided_by = NULL,
    decided_at = submitted_at,
    decision_note = COALESCE(
      decision_note,
      'Closed duplicate Pending request during idempotency migration.'
    ),
    request_version = request_version + 1
WHERE request_id IN (
  SELECT request_id
  FROM duplicate_pending
  WHERE occurrence > 1
);

CREATE UNIQUE INDEX enrollment_requests_pending_member_program_idx
  ON enrollment_requests(program_id, member_user_id) WHERE status = 'Pending';
