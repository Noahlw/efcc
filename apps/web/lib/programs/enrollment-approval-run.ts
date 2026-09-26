import type {
  EnrollmentRequestRow,
  EnrollmentRequestStatus,
} from "./workspace-store";

export type EnrollmentApprovalRunStatus = "active" | "completed" | "cancelled";
export type EnrollmentApprovalRunItemStatus =
  | "not_started"
  | "in_flight"
  | "completed"
  | "failed"
  | "outcome_unknown";

export interface EnrollmentApprovalRunItem {
  item_id: string;
  run_id: string;
  sequence: number;
  request_id: string;
  program_id: string;
  member_user_id: string;
  member_name?: string;
  member_username?: string;
  request_version: number;
  idempotency_key: string;
  status: EnrollmentApprovalRunItemStatus;
  retryable: boolean;
  enrollment_id: string | null;
  error_code: string | null;
  detail: string | null;
  started_at: string | null;
  settled_at: string | null;
}
export interface EnrollmentApprovalRun {
  run_id: string;
  program_id: string;
  status: EnrollmentApprovalRunStatus;
  created_at: string;
  finished_at: string | null;
  cancelled_at: string | null;
  items: EnrollmentApprovalRunItem[];
}

export interface EnrollmentApprovalRunRow extends EnrollmentApprovalRun {
  actor_user_id: string;
  correlation_id: string | null;
}

export interface EnrollmentApprovalRunItemRow extends EnrollmentApprovalRunItem {
  actor_user_id?: string;
}

export interface EnrollmentApprovalRunClaim {
  claimed: boolean;
  item: EnrollmentApprovalRunItemRow | null;
}

export interface EnrollmentApprovalRunAuthority {
  request_status: EnrollmentRequestStatus;
  request_version: number;
  enrollment_id: string | null;
  enrollment_request_id: string | null;
  enrollment_audit_outcome:
    | "SUCCESS"
    | "DUPLICATE"
    | "CONFLICT"
    | "DENIED"
    | "FAILED"
    | null;
  enrollment_audit_entity_id: string | null;
}

export interface EnrollmentApprovalRunSummary {
  total: number;
  not_started: number;
  in_flight: number;
  completed: number;
  failed: number;
  outcome_unknown: number;
  retryable: number;
  settled: number;
}

export interface CreateEnrollmentApprovalRunInput {
  program_id: string;
  requests: readonly Pick<
    EnrollmentRequestRow,
    | "request_id"
    | "program_id"
    | "member_user_id"
    | "member_name"
    | "member_username"
    | "status"
    | "request_version"
  >[];
  run_id?: string;
  created_at?: string;
}

export interface ApprovalRunFailure {
  code: string;
  detail: string;
  retryable: boolean;
}

export interface ApprovalRunOutcome {
  status: "completed" | "failed" | "outcome_unknown";
  enrollment_id?: string | null;
  failure?: ApprovalRunFailure;
}

const TERMINAL_ITEM_STATUSES = new Set<EnrollmentApprovalRunItemStatus>([
  "completed",
  "failed",
]);

function nowIso(): string {
  return new Date().toISOString();
}

function id(): string {
  return crypto.randomUUID();
}

function itemId(runId: string, requestId: string): string {
  return `${runId}:${requestId}`;
}

function assertStartableRequest(
  programId: string,
  request: CreateEnrollmentApprovalRunInput["requests"][number],
  seen: Set<string>
): void {
  if (seen.has(request.request_id)) {
    throw new Error(
      "Enrollment Approval Run cannot contain duplicate requests."
    );
  }
  if (request.program_id !== programId || request.status !== "Pending") {
    throw new Error(
      "Enrollment Approval Run requires Pending requests from one Program."
    );
  }
  if (
    !Number.isSafeInteger(request.request_version) ||
    request.request_version < 1
  ) {
    throw new Error("Enrollment Approval Run requires valid request versions.");
  }
  seen.add(request.request_id);
}

export function createEnrollmentApprovalRun(
  input: CreateEnrollmentApprovalRunInput
): EnrollmentApprovalRun {
  if (input.requests.length === 0) {
    throw new Error("Enrollment Approval Run requires at least one request.");
  }
  const runId = input.run_id ?? id();
  const createdAt = input.created_at ?? nowIso();
  const seen = new Set<string>();
  const items = input.requests.map((request, sequence) => {
    assertStartableRequest(input.program_id, request, seen);
    return {
      item_id: itemId(runId, request.request_id),
      run_id: runId,
      sequence,
      request_id: request.request_id,
      program_id: input.program_id,
      member_user_id: request.member_user_id,
      member_name: request.member_name,
      member_username: request.member_username,
      request_version: request.request_version,
      idempotency_key: id(),
      status: "not_started" as const,
      retryable: true,
      enrollment_id: null,
      error_code: null,
      detail: null,
      started_at: null,
      settled_at: null,
    };
  });
  return {
    run_id: runId,
    program_id: input.program_id,
    status: "active",
    created_at: createdAt,
    finished_at: null,
    cancelled_at: null,
    items,
  };
}

export function summarizeEnrollmentApprovalRun(
  run: Pick<EnrollmentApprovalRun, "items">
): EnrollmentApprovalRunSummary {
  const summary: EnrollmentApprovalRunSummary = {
    total: run.items.length,
    not_started: 0,
    in_flight: 0,
    completed: 0,
    failed: 0,
    outcome_unknown: 0,
    retryable: 0,
    settled: 0,
  };
  for (const item of run.items) {
    summary[item.status] += 1;
    if (item.retryable) {
      summary.retryable += 1;
    }
    if (TERMINAL_ITEM_STATUSES.has(item.status)) {
      summary.settled += 1;
    }
  }
  return summary;
}

function replaceItem(
  run: EnrollmentApprovalRun,
  requestId: string,
  update: (item: EnrollmentApprovalRunItem) => EnrollmentApprovalRunItem
): EnrollmentApprovalRun {
  let found = false;
  const items = run.items.map((item) => {
    if (item.request_id !== requestId) {
      return item;
    }
    found = true;
    return update(item);
  });
  if (!found) {
    throw new Error(`Unknown Enrollment Approval Run item: ${requestId}`);
  }
  return { ...run, items };
}

function maybeFinish(
  run: EnrollmentApprovalRun,
  settledAt: string
): EnrollmentApprovalRun {
  if (
    run.status === "active" &&
    run.items.length > 0 &&
    run.items.every(
      (item) =>
        item.status === "completed" ||
        (item.status === "failed" && !item.retryable)
    )
  ) {
    return { ...run, status: "completed", finished_at: settledAt };
  }
  return run;
}

export function beginNextEnrollmentApprovalItem(
  run: EnrollmentApprovalRun,
  startedAt = nowIso()
): { run: EnrollmentApprovalRun; item: EnrollmentApprovalRunItem } | null {
  if (run.status !== "active") {
    return null;
  }
  if (
    run.items.some(
      (item) => item.status === "in_flight" || item.status === "outcome_unknown"
    )
  ) {
    return null;
  }
  const next = run.items.find(
    (item) =>
      item.status === "not_started" ||
      (item.status === "failed" && item.retryable)
  );
  if (!next) {
    return null;
  }
  const nextRun = replaceItem(run, next.request_id, (item) => ({
    ...item,
    status: "in_flight",
    started_at: item.started_at ?? startedAt,
    settled_at: null,
    error_code: null,
    detail: null,
  }));
  return {
    run: nextRun,
    item: nextRun.items.find(
      (item) => item.request_id === next.request_id
    ) as EnrollmentApprovalRunItem,
  };
}

export function settleEnrollmentApprovalItem(
  run: EnrollmentApprovalRun,
  requestId: string,
  outcome: ApprovalRunOutcome,
  settledAt = nowIso()
): EnrollmentApprovalRun {
  const nextRun = replaceItem(run, requestId, (item) => {
    if (item.status !== "in_flight") {
      throw new Error("Only an in-flight Approval Run item can settle.");
    }
    return {
      ...item,
      status: outcome.status,
      retryable: outcome.failure?.retryable ?? false,
      enrollment_id:
        outcome.status === "completed"
          ? (outcome.enrollment_id ?? null)
          : item.enrollment_id,
      error_code: outcome.failure?.code ?? null,
      detail: outcome.failure?.detail ?? null,
      settled_at: settledAt,
    };
  });
  return maybeFinish(nextRun, settledAt);
}

function reconcileEnrollmentApprovalItem(
  item: EnrollmentApprovalRunItem,
  authority: EnrollmentApprovalRunAuthority,
  reconciledAt = nowIso(),
  allowRetry = true
): EnrollmentApprovalRunItem {
  if (item.status !== "in_flight" && item.status !== "outcome_unknown") {
    return item;
  }
  const hasAuthoritativeCommit =
    authority.request_status === "Approved" &&
    authority.request_version === item.request_version + 1 &&
    authority.enrollment_id !== null &&
    authority.enrollment_request_id === item.request_id &&
    authority.enrollment_audit_outcome === "SUCCESS" &&
    authority.enrollment_audit_entity_id === authority.enrollment_id;
  if (hasAuthoritativeCommit) {
    return {
      ...item,
      status: "completed",
      retryable: false,
      enrollment_id:
        authority.enrollment_id ?? authority.enrollment_audit_entity_id,
      error_code: null,
      detail: null,
      settled_at: reconciledAt,
    };
  }
  if (
    authority.request_status === "Pending" &&
    authority.request_version === item.request_version
  ) {
    return {
      ...item,
      status: allowRetry ? "failed" : "outcome_unknown",
      retryable: allowRetry,
      error_code: allowRetry ? "OUTCOME_NOT_COMMITTED" : "OUTCOME_UNKNOWN",
      detail: allowRetry
        ? "未找到已核准紀錄，可由操作人員明確繼續。"
        : "已取消後續處理，但目前仍未能確認已提交的核准結果。",
      settled_at: reconciledAt,
    };
  }
  return {
    ...item,
    status: "failed",
    retryable: false,
    error_code:
      authority.request_status === "Pending"
        ? "STALE_REQUEST_VERSION"
        : "REQUEST_ALREADY_HANDLED",
    detail:
      authority.request_status === "Pending"
        ? "報名申請版本已更新，請重新整理後重新選取。"
        : "報名申請已由其他結果處理，未重複核准。",
    settled_at: reconciledAt,
  };
}

export function reconcileEnrollmentApprovalRun(
  run: EnrollmentApprovalRun,
  authorityByRequestId: ReadonlyMap<string, EnrollmentApprovalRunAuthority>,
  reconciledAt = nowIso()
): EnrollmentApprovalRun {
  const reconciled = run.items.map((item) => {
    const authority = authorityByRequestId.get(item.request_id);
    return authority
      ? reconcileEnrollmentApprovalItem(
          item,
          authority,
          reconciledAt,
          run.status === "active"
        )
      : item;
  });
  return maybeFinish({ ...run, items: reconciled }, reconciledAt);
}

export function cancelEnrollmentApprovalRun(
  run: EnrollmentApprovalRun,
  cancelledAt = nowIso()
): EnrollmentApprovalRun {
  if (run.status !== "active") {
    return run;
  }
  return {
    ...run,
    status: "cancelled",
    cancelled_at: cancelledAt,
  };
}
