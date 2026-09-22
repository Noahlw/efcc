import { describe, expect, test } from "vitest";

import {
  beginNextEnrollmentApprovalItem,
  cancelEnrollmentApprovalRun,
  createEnrollmentApprovalRun,
  reconcileEnrollmentApprovalRun,
  settleEnrollmentApprovalItem,
  summarizeEnrollmentApprovalRun,
} from "./enrollment-approval-run";

const requests = [
  {
    request_id: "req-1",
    program_id: "program-1",
    member_user_id: "member-1",
    member_name: "阿明",
    member_username: "ming",
    status: "Pending" as const,
    request_version: 3,
  },
  {
    request_id: "req-2",
    program_id: "program-1",
    member_user_id: "member-2",
    member_name: "阿May",
    member_username: "may",
    status: "Pending" as const,
    request_version: 7,
  },
];

describe("durable Enrollment Approval Run", () => {
  test("preserves selection order, versions, and stable per-request identities", () => {
    const run = createEnrollmentApprovalRun({
      run_id: "run-1",
      program_id: "program-1",
      created_at: "2026-09-16T00:00:00.000Z",
      requests,
    });

    expect(
      run.items.map(({ request_id, request_version, sequence }) => [
        request_id,
        request_version,
        sequence,
      ])
    ).toStrictEqual([
      ["req-1", 3, 0],
      ["req-2", 7, 1],
    ]);
    expect(
      new Set(run.items.map(({ idempotency_key }) => idempotency_key)).size
    ).toBe(2);
    expect(
      run.items.every(({ status }) => status === "not_started")
    ).toBeTruthy();
  });

  test("settles one item at a time and never schedules after an unknown outcome", () => {
    const run = createEnrollmentApprovalRun({
      run_id: "run-2",
      program_id: "program-1",
      created_at: "2026-09-16T00:00:00.000Z",
      requests,
    });
    const first = beginNextEnrollmentApprovalItem(
      run,
      "2026-09-16T00:01:00.000Z"
    );
    expect(first?.item.request_id).toBe("req-1");

    const unknown = settleEnrollmentApprovalItem(
      first?.run as typeof run,
      "req-1",
      {
        status: "outcome_unknown",
        failure: {
          code: "NETWORK_ERROR",
          detail: "未能確認回應。",
          retryable: false,
        },
      },
      "2026-09-16T00:02:00.000Z"
    );
    expect(beginNextEnrollmentApprovalItem(unknown)).toBeNull();
    expect(summarizeEnrollmentApprovalRun(unknown)).toMatchObject({
      total: 2,
      in_flight: 0,
      outcome_unknown: 1,
      not_started: 1,
    });
  });

  test("reconciles a committed approval without replaying it", () => {
    const run = createEnrollmentApprovalRun({
      run_id: "run-3",
      program_id: "program-1",
      created_at: "2026-09-16T00:00:00.000Z",
      requests,
    });
    const first = beginNextEnrollmentApprovalItem(
      run,
      "2026-09-16T00:01:00.000Z"
    );
    const unknown = settleEnrollmentApprovalItem(
      first?.run as typeof run,
      "req-1",
      {
        status: "outcome_unknown",
        failure: {
          code: "NETWORK_ERROR",
          detail: "未能確認回應。",
          retryable: false,
        },
      },
      "2026-09-16T00:02:00.000Z"
    );
    const reconciled = reconcileEnrollmentApprovalRun(
      unknown,
      new Map([
        [
          "req-1",
          {
            request_status: "Approved",
            request_version: 4,
            enrollment_id: "enrollment-1",
            enrollment_request_id: "req-1",
            enrollment_audit_outcome: "SUCCESS" as const,
            enrollment_audit_entity_id: "enrollment-1",
          },
        ],
      ]),
      "2026-09-16T00:03:00.000Z"
    );

    expect(reconciled.items[0]).toMatchObject({
      status: "completed",
      enrollment_id: "enrollment-1",
    });
    expect(reconciled.items[1]?.status).toBe("not_started");
    expect(beginNextEnrollmentApprovalItem(reconciled)?.item.request_id).toBe(
      "req-2"
    );
  });

  test("reconciles an uncommitted request as explicitly retryable and cancellation keeps completions", () => {
    const run = createEnrollmentApprovalRun({
      run_id: "run-4",
      program_id: "program-1",
      created_at: "2026-09-16T00:00:00.000Z",
      requests,
    });
    const first = beginNextEnrollmentApprovalItem(run);
    const unknown = settleEnrollmentApprovalItem(
      first?.run as typeof run,
      "req-1",
      {
        status: "outcome_unknown",
        failure: {
          code: "NETWORK_ERROR",
          detail: "未能確認回應。",
          retryable: false,
        },
      }
    );
    const reconciled = reconcileEnrollmentApprovalRun(
      unknown,
      new Map([
        [
          "req-1",
          {
            request_status: "Pending" as const,
            request_version: 3,
            enrollment_id: null,
            enrollment_request_id: null,
            enrollment_audit_outcome: null,
            enrollment_audit_entity_id: null,
          },
        ],
      ])
    );
    expect(reconciled.items[0]).toMatchObject({
      status: "failed",
      retryable: true,
      error_code: "OUTCOME_NOT_COMMITTED",
    });
    const cancelled = cancelEnrollmentApprovalRun(
      {
        ...reconciled,
        items: reconciled.items.map((item, index) =>
          index === 1 ? { ...item, status: "completed" as const } : item
        ),
      },
      "2026-09-16T00:04:00.000Z"
    );
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.items[1]?.status).toBe("completed");
  });

  test("keeps a cancelled in-flight outcome unknown until it is authoritative", () => {
    const run = createEnrollmentApprovalRun({
      run_id: "run-5",
      program_id: "program-1",
      created_at: "2026-09-16T00:00:00.000Z",
      requests,
    });
    const first = beginNextEnrollmentApprovalItem(run);
    if (!first) {
      throw new Error("expected the first Approval Run item to be claimable");
    }
    const cancelled = cancelEnrollmentApprovalRun(first.run);
    const reconciled = reconcileEnrollmentApprovalRun(
      cancelled,
      new Map([
        [
          "req-1",
          {
            request_status: "Pending" as const,
            request_version: 3,
            enrollment_id: null,
            enrollment_request_id: null,
            enrollment_audit_outcome: null,
            enrollment_audit_entity_id: null,
          },
        ],
      ])
    );

    expect(reconciled.items[0]).toMatchObject({
      status: "outcome_unknown",
      retryable: false,
      error_code: "OUTCOME_UNKNOWN",
    });
    expect(beginNextEnrollmentApprovalItem(reconciled)).toBeNull();
  });
});
