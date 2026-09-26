import assert from "node:assert/strict";

import { describe, test } from "vitest";

import {
  ApprovalRunActionResponseSchema,
  ApprovalRunStartBodySchema,
  ApprovalRunStartResponseSchema,
  ApprovalRunsSchema,
  AssistedEnrollResponseSchema,
  CancelEnrollmentResponseSchema,
  EnrollmentDecisionResponseSchema,
  EnrollmentRequestCreateResponseSchema,
  EnrollmentRequestsSchema,
  EnrollmentSnapshotSchema,
  EnrollmentWithdrawResponseSchema,
  EnrollmentsSchema,
  parseAssistedMemberId,
  parseCancelReason,
  parseDecideAction,
  parseDecideNote,
  parseDecideRequestVersion,
} from "./programs-enrollment";

describe("enrollment request predicates", () => {
  test("start-run body requires string arrays", () => {
    assert.strictEqual(
      ApprovalRunStartBodySchema.safeParse({ request_ids: ["a"] }).success,
      true
    );
    assert.strictEqual(
      ApprovalRunStartBodySchema.safeParse({ request_ids: "a" }).success,
      false
    );
    assert.strictEqual(
      ApprovalRunStartBodySchema.safeParse({ request_ids: [42] }).success,
      false
    );
  });
  test("decide action/version/note mirror the handler", () => {
    assert.strictEqual(parseDecideAction("Approved"), "Approved");
    assert.strictEqual(parseDecideAction("Maybe"), null);
    assert.strictEqual(parseDecideRequestVersion(undefined), undefined);
    assert.strictEqual(parseDecideRequestVersion(null), undefined);
    assert.strictEqual(parseDecideRequestVersion(2), 2);
    assert.strictEqual(parseDecideRequestVersion(0), "invalid");
    assert.strictEqual(parseDecideRequestVersion("3"), "invalid");
    assert.strictEqual(parseDecideNote("  hi  "), "hi");
    assert.strictEqual(parseDecideNote(42), null);
  });
  test("assisted id has no trim; cancel reason caps at 500", () => {
    assert.strictEqual(parseAssistedMemberId("  u  "), "  u  ");
    assert.strictEqual(parseAssistedMemberId(42), "");
    assert.strictEqual(parseCancelReason(null), null);
    assert.strictEqual(parseCancelReason("x".repeat(501)), "invalid");
    assert.strictEqual(parseCancelReason("  ok  "), "ok");
  });
});

describe("enrollment response schemas", () => {
  const request = {
    request_id: "req",
    program_id: "p",
    member_user_id: "u",
    status: "Pending",
    submitted_at: "2026-09-01T00:00:00.000Z",
    decided_by: null,
    decided_at: null,
    decision_note: null,
    request_version: 1,
  };
  const enrollment = {
    enrollment_id: "enr",
    program_id: "p",
    member_user_id: "u",
    request_id: null,
    status: "Active",
    enrolled_at: "2026-09-01T00:00:00.000Z",
    cancelled_at: null,
    cancelled_by: null,
    created_by: null,
    created_at: "2026-09-01T00:00:00.000Z",
  };
  const run = {
    run_id: "run",
    program_id: "p",
    status: "active",
    created_at: "2026-09-01T00:00:00.000Z",
    finished_at: null,
    cancelled_at: null,
    items: [],
  };
  test("request create/list/withdraw", () => {
    assert.strictEqual(
      EnrollmentRequestCreateResponseSchema.safeParse({ request }).success,
      true
    );
    assert.strictEqual(
      EnrollmentRequestsSchema.safeParse({ requests: [request] }).success,
      true
    );
    assert.strictEqual(
      EnrollmentWithdrawResponseSchema.safeParse({ request }).success,
      true
    );
  });
  test("snapshot and enrollments", () => {
    assert.strictEqual(
      EnrollmentSnapshotSchema.safeParse({
        requests: [
          {
            request_id: "req",
            status: "Pending",
            submitted_at: "2026-09-01T00:00:00.000Z",
            decided_at: null,
          },
        ],
        enrollments: [],
      }).success,
      true
    );
    assert.strictEqual(
      EnrollmentsSchema.safeParse({ enrollments: [enrollment] }).success,
      true
    );
    assert.strictEqual(
      AssistedEnrollResponseSchema.safeParse({ enrollment }).success,
      true
    );
    assert.strictEqual(
      CancelEnrollmentResponseSchema.safeParse({ enrollment }).success,
      true
    );
  });
  test("runs, actions, decisions", () => {
    assert.strictEqual(
      ApprovalRunStartResponseSchema.safeParse({ run, created: true }).success,
      true
    );
    assert.strictEqual(
      ApprovalRunsSchema.safeParse({ runs: [run] }).success,
      true
    );
    assert.strictEqual(
      ApprovalRunActionResponseSchema.safeParse({ run, item: null }).success,
      true
    );
    assert.strictEqual(
      EnrollmentDecisionResponseSchema.safeParse({ request, enrollment })
        .success,
      true
    );
    assert.strictEqual(
      EnrollmentDecisionResponseSchema.safeParse({ request, enrollment: null })
        .success,
      true
    );
  });
});
