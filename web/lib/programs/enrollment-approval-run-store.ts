import type { D1Database } from "@cloudflare/workers-types";

import type {
  EnrollmentApprovalRun,
  EnrollmentApprovalRunAuthority,
  EnrollmentApprovalRunClaim,
  EnrollmentApprovalRunItem,
  EnrollmentApprovalRunItemRow,
  EnrollmentApprovalRunRow,
  EnrollmentApprovalRunItemStatus,
  EnrollmentApprovalRunStatus,
} from "./enrollment-approval-run";

interface EnrollmentApprovalRunDbRow {
  run_id: string;
  program_id: string;
  actor_user_id: string;
  status: EnrollmentApprovalRunStatus;
  created_at: string;
  finished_at: string | null;
  cancelled_at: string | null;
  correlation_id: string | null;
}
interface EnrollmentApprovalRunItemDbRow extends Omit<
  EnrollmentApprovalRunItem,
  "retryable"
> {
  retryable: number;
}

function itemFromDb(
  row: EnrollmentApprovalRunItemDbRow
): EnrollmentApprovalRunItemRow {
  return { ...row, retryable: row.retryable === 1 };
}

export async function insertEnrollmentApprovalRun(
  db: D1Database,
  run: EnrollmentApprovalRunRow,
  items: readonly EnrollmentApprovalRunItem[]
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO enrollment_approval_runs
           (run_id, program_id, actor_user_id, status, created_at,
            finished_at, cancelled_at, correlation_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        run.run_id,
        run.program_id,
        run.actor_user_id,
        run.status,
        run.created_at,
        run.finished_at,
        run.cancelled_at,
        run.correlation_id
      ),
    ...items.map((item) =>
      db
        .prepare(
          `INSERT INTO enrollment_approval_run_items
             (item_id, run_id, sequence, request_id, program_id,
              member_user_id, member_name, member_username, request_version,
              idempotency_key, status, retryable, enrollment_id, error_code,
              detail, started_at, settled_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          item.item_id,
          item.run_id,
          item.sequence,
          item.request_id,
          item.program_id,
          item.member_user_id,
          item.member_name ?? null,
          item.member_username ?? null,
          item.request_version,
          item.idempotency_key,
          item.status,
          item.retryable ? 1 : 0,
          item.enrollment_id,
          item.error_code,
          item.detail,
          item.started_at,
          item.settled_at
        )
    ),
  ]);
}

export async function findEnrollmentApprovalRun(
  db: D1Database,
  runId: string
): Promise<EnrollmentApprovalRunRow | null> {
  const [runResult, itemResult] = await db.batch([
    db
      .prepare("SELECT * FROM enrollment_approval_runs WHERE run_id = ?")
      .bind(runId),
    db
      .prepare(
        `SELECT * FROM enrollment_approval_run_items
         WHERE run_id = ? ORDER BY sequence ASC`
      )
      .bind(runId),
  ]);
  const row = runResult?.results?.[0] as EnrollmentApprovalRunDbRow | undefined;
  if (!row) {
    return null;
  }
  return {
    ...row,
    items: (
      (itemResult?.results ?? []) as EnrollmentApprovalRunItemDbRow[]
    ).map(itemFromDb),
  };
}

export async function listEnrollmentApprovalRuns(
  db: D1Database,
  actorUserId: string,
  programId: string
): Promise<EnrollmentApprovalRunRow[]> {
  const result = await db
    .prepare(
      `SELECT * FROM enrollment_approval_runs
       WHERE actor_user_id = ? AND program_id = ?
       ORDER BY created_at DESC`
    )
    .bind(actorUserId, programId)
    .all<EnrollmentApprovalRunDbRow>();
  const runs = await Promise.all(
    (result.results ?? []).map((row) =>
      findEnrollmentApprovalRun(db, row.run_id)
    )
  );
  return runs.filter((run): run is EnrollmentApprovalRunRow => run !== null);
}

export async function claimNextEnrollmentApprovalRunItem(
  db: D1Database,
  runId: string,
  actorUserId: string,
  startedAt: string
): Promise<EnrollmentApprovalRunClaim> {
  const update = await db
    .prepare(
      `UPDATE enrollment_approval_run_items
       SET status = 'in_flight', started_at = COALESCE(started_at, ?),
           settled_at = NULL, error_code = NULL, detail = NULL
       WHERE item_id = (
         SELECT candidate.item_id
           FROM enrollment_approval_run_items candidate
           JOIN enrollment_approval_runs run ON run.run_id = candidate.run_id
          WHERE candidate.run_id = ?
            AND run.actor_user_id = ?
            AND run.status = 'active'
            AND NOT EXISTS (
              SELECT 1
                FROM enrollment_approval_run_items blocked
               WHERE blocked.run_id = candidate.run_id
                 AND blocked.status IN ('in_flight', 'outcome_unknown')
            )
            AND (
              candidate.status = 'not_started' OR
              (candidate.status = 'failed' AND candidate.retryable = 1)
            )
          ORDER BY candidate.sequence ASC
          LIMIT 1
       )`
    )
    .bind(startedAt, runId, actorUserId)
    .run();
  if ((update.meta?.changes ?? 0) === 0) {
    return { claimed: false, item: null };
  }
  const result = await db
    .prepare(
      `SELECT items.*
         FROM enrollment_approval_run_items items
         JOIN enrollment_approval_runs runs ON runs.run_id = items.run_id
        WHERE items.run_id = ? AND runs.actor_user_id = ?
          AND items.status = 'in_flight'
        ORDER BY items.sequence ASC`
    )
    .bind(runId, actorUserId)
    .all<EnrollmentApprovalRunItemDbRow>();
  const row = result.results?.[0];
  return {
    claimed: row !== undefined,
    item: row ? itemFromDb(row) : null,
  };
}

export async function updateEnrollmentApprovalRunItem(
  db: D1Database,
  runId: string,
  requestId: string,
  item: Pick<
    EnrollmentApprovalRunItem,
    | "status"
    | "retryable"
    | "enrollment_id"
    | "error_code"
    | "detail"
    | "started_at"
    | "settled_at"
  >,
  expectedStatus?: EnrollmentApprovalRunItemStatus
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE enrollment_approval_run_items
       SET status = ?, retryable = ?, enrollment_id = ?, error_code = ?,
           detail = ?, started_at = ?, settled_at = ?
       WHERE run_id = ? AND request_id = ?
         AND (? IS NULL OR status = ?)`
    )
    .bind(
      item.status,
      item.retryable ? 1 : 0,
      item.enrollment_id,
      item.error_code,
      item.detail,
      item.started_at,
      item.settled_at,
      runId,
      requestId,
      expectedStatus ?? null,
      expectedStatus ?? null
    )
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function findEnrollmentApprovalAuthority(
  db: D1Database,
  programId: string,
  requestId: string,
  memberUserId: string,
  idempotencyKey: string
): Promise<EnrollmentApprovalRunAuthority | null> {
  const [request, enrollment, audit] = await db.batch([
    db
      .prepare(
        `SELECT status, request_version
           FROM enrollment_requests
          WHERE request_id = ? AND program_id = ? AND member_user_id = ?`
      )
      .bind(requestId, programId, memberUserId),
    db
      .prepare(
        `SELECT enrollment_id, request_id
           FROM enrollments
          WHERE program_id = ? AND member_user_id = ? AND request_id = ?
          ORDER BY created_at DESC LIMIT 1`
      )
      .bind(programId, memberUserId, requestId),
    db
      .prepare(
        `SELECT outcome, entity_id
           FROM audit_events audit
           JOIN enrollments audited_enrollment
             ON audited_enrollment.enrollment_id = audit.entity_id
            AND audited_enrollment.program_id = ?
            AND audited_enrollment.member_user_id = ?
            AND audited_enrollment.request_id = ?
          WHERE audit.action = 'ENROLLMENT_CREATE'
            AND audit.entity_type = 'enrollment'
            AND audit.outcome = 'SUCCESS'
            AND audit.correlation_id = ?
          ORDER BY audit.inserted_at DESC LIMIT 1`
      )
      .bind(programId, memberUserId, requestId, idempotencyKey),
  ]);
  const requestRow = request.results?.[0] as
    | {
        status: EnrollmentApprovalRunAuthority["request_status"];
        request_version: number;
      }
    | undefined;
  if (!requestRow) {
    return null;
  }
  const enrollmentRow = enrollment.results?.[0] as
    | { enrollment_id: string; request_id: string | null }
    | undefined;
  const auditRow = audit.results?.[0] as
    | {
        outcome: EnrollmentApprovalRunAuthority["enrollment_audit_outcome"];
        entity_id: string;
      }
    | undefined;
  return {
    request_status: requestRow.status,
    request_version: requestRow.request_version,
    enrollment_id: enrollmentRow?.enrollment_id ?? null,
    enrollment_request_id: enrollmentRow?.request_id ?? null,
    enrollment_audit_outcome: auditRow?.outcome ?? null,
    enrollment_audit_entity_id: auditRow?.entity_id ?? null,
  };
}

export async function updateEnrollmentApprovalRun(
  db: D1Database,
  run: Pick<
    EnrollmentApprovalRun,
    "run_id" | "status" | "finished_at" | "cancelled_at"
  >
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE enrollment_approval_runs
       SET status = ?, finished_at = ?, cancelled_at = ?
       WHERE run_id = ? AND status = 'active'`
    )
    .bind(run.status, run.finished_at, run.cancelled_at, run.run_id)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}
