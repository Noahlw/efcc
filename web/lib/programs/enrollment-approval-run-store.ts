import type { D1Database } from "@cloudflare/workers-types";

import type {
  EnrollmentApprovalRun,
  EnrollmentApprovalRunItem,
  EnrollmentApprovalRunItemRow,
  EnrollmentApprovalRunRow,
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

export async function listActiveEnrollmentApprovalRuns(
  db: D1Database,
  actorUserId: string,
  programId: string
): Promise<EnrollmentApprovalRunRow[]> {
  const result = await db
    .prepare(
      `SELECT * FROM enrollment_approval_runs
       WHERE actor_user_id = ? AND program_id = ? AND status = 'active'
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
  >
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE enrollment_approval_run_items
       SET status = ?, retryable = ?, enrollment_id = ?, error_code = ?,
           detail = ?, started_at = ?, settled_at = ?
       WHERE run_id = ? AND request_id = ?`
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
      requestId
    )
    .run();
  return (result.meta?.changes ?? 0) > 0;
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
       WHERE run_id = ?`
    )
    .bind(run.status, run.finished_at, run.cancelled_at, run.run_id)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}
