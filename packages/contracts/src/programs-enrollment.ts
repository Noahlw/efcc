/**
 * Enrollment/approval-run wire contracts (spec #646, ticket #659).
 *
 * Source-derived from `apps/web/lib/programs/program-handlers.ts`
 * (request/decide/withdraw/enroll/list/cancel handlers),
 * `workspace-store.ts` row shapes, `enrollment-approval-run.ts` run
 * shapes, and `department-workspace.ts` result shapes. Validators
 * never transform. Approval-run unknown outcomes, idempotency, and
 * no-duplicate-enrollment semantics stay in the existing R44-tested
 * seams; a malformed acknowledgement stays unresolved through the
 * existing unknown-outcome classification (no blind replay).
 */
import * as z from "zod";

import { nonEmptyString, nullableString } from "./primitives";

export const EnrollmentRequestStatusSchema = z.enum([
  "Pending",
  "Approved",
  "Rejected",
  "Withdrawn",
]);
export const EnrollmentStatusSchema = z.enum(["Active", "Cancelled"]);
export const ApprovalRunStatusSchema = z.enum([
  "active",
  "completed",
  "cancelled",
]);
export const ApprovalRunItemStatusSchema = z.enum([
  "not_started",
  "in_flight",
  "completed",
  "failed",
  "outcome_unknown",
]);
export const DecideActionSchema = z.enum(["Approved", "Rejected"]);

export const EnrollmentRequestRowSchema = z.object({
  request_id: nonEmptyString,
  program_id: nonEmptyString,
  member_user_id: nonEmptyString,
  status: EnrollmentRequestStatusSchema,
  submitted_at: nonEmptyString,
  decided_by: nullableString,
  decided_at: nullableString,
  decision_note: nullableString,
  request_version: z.number(),
  member_name: z.string().optional(),
  member_username: z.string().optional(),
});

export const EnrollmentRowSchema = z.object({
  enrollment_id: nonEmptyString,
  program_id: nonEmptyString,
  member_user_id: nonEmptyString,
  request_id: nullableString,
  status: EnrollmentStatusSchema,
  enrolled_at: nonEmptyString,
  cancelled_at: nullableString,
  cancelled_by: nullableString,
  cancellation_reason: nullableString.optional(),
  created_by: nullableString,
  created_at: nonEmptyString,
  member_name: z.string().optional(),
  member_username: z.string().optional(),
});

export const EnrollmentRequestCreateResponseSchema = z.object({
  request: EnrollmentRequestRowSchema,
});

export const EnrollmentRequestsSchema = z.object({
  requests: z.array(EnrollmentRequestRowSchema),
});

export const EnrollmentSnapshotSchema = z.object({
  requests: z.array(
    z.object({
      request_id: nonEmptyString,
      status: EnrollmentRequestStatusSchema,
      submitted_at: nonEmptyString,
      decided_at: nullableString,
    })
  ),
  enrollments: z.array(
    z.object({
      enrollment_id: nonEmptyString,
      status: EnrollmentStatusSchema,
      enrolled_at: nonEmptyString,
      cancelled_at: nullableString,
    })
  ),
});

const ApprovalRunItemSchema = z.object({
  item_id: nonEmptyString,
  run_id: nonEmptyString,
  sequence: z.number(),
  request_id: nonEmptyString,
  program_id: nonEmptyString,
  member_user_id: nonEmptyString,
  member_name: z.string().optional(),
  member_username: z.string().optional(),
  request_version: z.number(),
  idempotency_key: nonEmptyString,
  status: ApprovalRunItemStatusSchema,
  retryable: z.boolean(),
  enrollment_id: nullableString,
  error_code: nullableString,
  detail: nullableString,
  started_at: nullableString,
  settled_at: nullableString,
});

export const ApprovalRunSchema = z.object({
  run_id: nonEmptyString,
  program_id: nonEmptyString,
  status: ApprovalRunStatusSchema,
  created_at: nonEmptyString,
  finished_at: nullableString,
  cancelled_at: nullableString,
  items: z.array(ApprovalRunItemSchema),
});

export const ApprovalRunStartResponseSchema = z.object({
  run: ApprovalRunSchema,
  created: z.boolean(),
});

export const ApprovalRunsSchema = z.object({
  runs: z.array(ApprovalRunSchema),
});

export const ApprovalRunResponseSchema = z.object({
  run: ApprovalRunSchema,
});

export const ApprovalRunActionResponseSchema = z.object({
  run: ApprovalRunSchema,
  item: ApprovalRunItemSchema.nullable().optional(),
});

export const EnrollmentDecisionResponseSchema = z.object({
  request: EnrollmentRequestRowSchema,
  enrollment: EnrollmentRowSchema.nullable(),
});

export const EnrollmentWithdrawResponseSchema = z.object({
  request: EnrollmentRequestRowSchema,
});

export const AssistedEnrollResponseSchema = z.object({
  enrollment: EnrollmentRowSchema,
});

export const EnrollmentsSchema = z.object({
  enrollments: z.array(EnrollmentRowSchema),
});

export const CancelEnrollmentResponseSchema = z.object({
  enrollment: EnrollmentRowSchema,
});

// ---------------------------------------------------------------------------
// Request predicates with exact handler semantics.
// ---------------------------------------------------------------------------

/** Start-run body: request_ids must be an array of strings (may be empty). */
export const ApprovalRunStartBodySchema = z.object({
  request_ids: z.array(z.string()),
});

/** Decide action enum (request_version handled below for its null pass). */
export function parseDecideAction(
  value: unknown
): "Approved" | "Rejected" | null {
  return value === "Approved" || value === "Rejected" ? value : null;
}

/**
 * request_version with the exact decide semantics: undefined/null pass
 * through as undefined; otherwise a positive safe integer is required.
 */
export function parseDecideRequestVersion(
  value: unknown
): number | undefined | "invalid" {
  if (value === undefined || value === null) {
    return undefined;
  }
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1
    ? value
    : "invalid";
}

/** Decide note: trimmed string or null (non-strings become null). */
export function parseDecideNote(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}

/**
 * Assisted-enroll member id with the exact handler semantics: non-strings
 * become "" (rejected as required); note: no trimming (whitespace passes).
 */
export function parseAssistedMemberId(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Cancel reason: trimmed or null; overlong is invalid. */
export function parseCancelReason(value: unknown): string | null | "invalid" {
  const reason = typeof value === "string" ? value.trim() : null;
  if (reason !== null && reason.length > 500) {
    return "invalid";
  }
  return reason;
}
