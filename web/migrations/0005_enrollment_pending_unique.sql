-- Keep concurrent participant requests idempotent at the database boundary.
CREATE UNIQUE INDEX enrollment_requests_pending_member_program_idx
  ON enrollment_requests(program_id, member_user_id) WHERE status = 'Pending';
