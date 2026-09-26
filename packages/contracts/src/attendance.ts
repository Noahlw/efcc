/**
 * Attendance wire contracts (spec #646, tickets #660 authenticated /
 * assisted and #661 guest + proof-bound reconciliation).
 *
 * Source-derived from `apps/web/lib/attendance.ts` (all 14 handlers)
 * and the worker dispatch. Validators never transform. Guest identity
 * stays secret-redacted: duplicate responses reveal no existing
 * record id or time (Spec #244 dec 14). A lost/malformed guest
 * acknowledgement reconciles through the proof-bound flow — never an
 * automatic second check-in. Guest Attendance never becomes member
 * Attendance (member_user_id stays null on guest writes).
 */
import * as z from "zod";

import { nonEmptyString, nullableString } from "./primitives";

export const AttendanceMethodSchema = z.enum([
  "self_qr_scan",
  "self_manual_code",
  "leader_qr_scan",
  "leader_manual_search",
  "guest_qr_scan",
  "guest_manual_code",
]);
export type AttendanceMethod = z.infer<typeof AttendanceMethodSchema>;
export const AttendanceStateSchema = z.enum([
  "Present",
  "Not Yet",
  "Absent",
  "Excused",
  "Cancelled",
]);
export const CheckInOutcomeSchema = z.enum(["success", "duplicate"]);
export const ReconcileOutcomeSchema = z.enum(["found", "not_found"]);
export const VoidOutcomeSchema = z.enum(["voided", "already_voided"]);

/** Guest-name cap shared by check-in and correction (UI maxLength). */
export const GUEST_NAME_MAX_LENGTH = 80;

export const EXCUSE_CATEGORIES: readonly string[] = [
  "身體不適",
  "工作或上課",
  "家庭事務",
  "其他",
];

/**
 * HK/intl phone normalization (exact port): trims and strips
 * separators, then classifies hk: vs intl: forms. Null when invalid.
 */
export function normalizeGuestPhone(input: string): string | null {
  const compact = input.trim().replaceAll(/[\s().-]/gu, "");
  if (!compact) {
    return null;
  }
  if (/^\+852\d{8}$/u.test(compact)) {
    return `hk:${compact.slice(1)}`;
  }
  if (/^852\d{8}$/u.test(compact)) {
    return `hk:${compact}`;
  }
  if (/^\d{8}$/u.test(compact)) {
    return `hk:852${compact}`;
  }
  if (/^\+[1-9]\d{6,14}$/u.test(compact)) {
    return `intl:${compact.slice(1)}`;
  }
  if (/^\d{7,15}$/u.test(compact)) {
    return `intl:${compact}`;
  }
  return null;
}

/** Guest display-name rule: trimmed, non-empty, ≤ 80 chars. */
export function isValidGuestName(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= GUEST_NAME_MAX_LENGTH
  );
}

/**
 * Guest idempotency header: trimmed-or-null, overlong invalid.
 * Mirrors readGuestIdempotencyKey exactly (empty becomes null).
 */
export function parseGuestIdempotencyKey(
  value: unknown
): string | null | "invalid" {
  const key = typeof value === "string" ? value.trim() || null : null;
  if (key === null) {
    return null;
  }
  return key.length > 200 ? "invalid" : key;
}

/**
 * Resolve query with the exact mutual-exclusion rule: at most one of
 * program_token / manual_code / event, and a non-empty value overall.
 */
export function parseResolveQuery(
  params: URLSearchParams
):
  | {
      ok: true;
      token: string | null;
      code: string | null;
      entry: string | null;
      eventId: string | null;
    }
  | { ok: false } {
  const token = params.get("program_token");
  const code = params.get("manual_code");
  const entry = params.get("entry");
  const eventId = params.get("event");
  const explicitCount = [token, code, eventId].filter(Boolean).length;
  if (explicitCount > 1) {
    return { ok: false };
  }
  const value = token ?? code ?? entry ?? "";
  if (eventId) {
    return { ok: true, token, code, entry, eventId };
  }
  if (!value) {
    return { ok: false };
  }
  return { ok: true, token, code, entry, eventId };
}

/** Self check-in body with the exact shape rule. */
export const SelfCheckInBodySchema = z.object({
  event_id: z.string(),
  method: z.enum(["self_qr_scan", "self_manual_code"]).optional(),
  program_token: z.string().optional(),
  manual_code: z.string().optional(),
  entry: z.string().optional(),
});

export const SelfCheckInRequestSchema = SelfCheckInBodySchema.refine(
  (body) =>
    typeof body.entry === "string" ||
    typeof body.program_token === "string" ||
    typeof body.manual_code === "string",
  { message: "簽到資料無效。" }
);

/** Guest check-in body shape (name/phone/key rules stay in handlers). */
export const GuestCheckInBodySchema = z.object({
  event_id: z.string(),
  method: z.enum(["guest_qr_scan", "guest_manual_code"]).optional(),
  name: z.string(),
  phone: z.string(),
  program_token: z.string().optional(),
  manual_code: z.string().optional(),
  entry: z.string().optional(),
});

export const GuestCheckInRequestSchema = GuestCheckInBodySchema.refine(
  (body) =>
    (typeof body.entry === "string" ||
      typeof body.program_token === "string" ||
      typeof body.manual_code === "string") &&
    isValidGuestName(body.name) &&
    normalizeGuestPhone(body.phone) !== null,
  { message: "姓名和電話都是必填資料。" }
);

/**
 * Assisted check-in body shape. member_user_id is any string here —
 * empties flow to the existing 403 ENROLLMENT_REQUIRED, never a 422.
 */
export const AssistedCheckInBodySchema = z.object({
  member_user_id: z.string(),
  method: z.enum(["leader_qr_scan", "leader_manual_search"]).optional(),
});

export const VoidAttendanceBodySchema = z.object({
  reason: z.string().refine((reason) => reason.trim().length > 0),
});

export const ExcusedAttendanceBodySchema = z.object({
  enrollment_id: nonEmptyString,
  reason: z.string().refine((reason) => parseExcuseReason(reason).ok),
});

/** Void body: trimmed non-empty reason. */
export function parseVoidReason(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Guest-correction body shape (name/phone/key rules stay in handlers). */
export const GuestCorrectionBodySchema = z.object({
  name: z.string(),
  phone: z.string(),
  reason: z.string(),
});

export const GuestCorrectionRequestSchema = GuestCorrectionBodySchema.refine(
  (body) =>
    isValidGuestName(body.name) &&
    body.reason.trim().length > 0 &&
    normalizeGuestPhone(body.phone) !== null,
  { message: "姓名、電話和原因都是必填資料。" }
);

/** Excuse category：details rule with the exact split semantics. */
export function parseExcuseReason(
  value: unknown
): { ok: true; reason: string } | { ok: false } {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false };
  }
  const reason = value.trim();
  if (reason.length > 500) {
    return { ok: false };
  }
  const separator = reason.indexOf("：");
  const category = (
    separator === -1 ? reason : reason.slice(0, separator)
  ).trim();
  const details = separator === -1 ? "" : reason.slice(separator + 1).trim();
  if (
    !EXCUSE_CATEGORIES.includes(category) ||
    (category === "其他" && !details)
  ) {
    return { ok: false };
  }
  return { ok: true, reason: details ? `${category}：${details}` : category };
}

// ---------------------------------------------------------------------------
// Response projections.
// ---------------------------------------------------------------------------

export const AttendanceEventSchema = z.object({
  event_id: nonEmptyString,
  program_id: nonEmptyString,
  program_name: z.string(),
  name: nullableString,
  location: nullableString,
  starts_at: nonEmptyString,
  ends_at: nonEmptyString,
  manual_check_in_code: nonEmptyString,
  check_in_window_opens_at: nonEmptyString,
  check_in_window_closes_at: nonEmptyString,
  status: z.enum(["Active", "Cancelled"]),
  availability: z.enum(["Active", "Inactive"]),
});

export const ResolveEventsSchema = z.object({
  events: z.array(AttendanceEventSchema).min(1),
});

export const ResolveNoEventsSchema = z.object({
  events: z.array(AttendanceEventSchema).max(0),
  latest: z
    .object({
      event_id: z.string().optional(),
      event_name: nullableString.optional(),
      location: nullableString.optional(),
      ends_at: nullableString.optional(),
      status: z.enum(["Active", "Cancelled"]),
      availability: z.enum(["Active", "Inactive"]),
      starts_at: nullableString,
      check_in_window_opens_at: nullableString,
      check_in_window_closes_at: nullableString.optional(),
      program_id: nonEmptyString,
      program_name: z.string(),
    })
    .nullable(),
  enrolled: z.boolean(),
});

export const AttendanceResolveResponseSchema = z.union([
  ResolveEventsSchema,
  ResolveNoEventsSchema,
]);

export const CheckInSuccessSchema = z.object({
  outcome: z.literal("success"),
  attendance_id: nonEmptyString,
  checked_in_at: nonEmptyString,
});

// Strict: duplicate responses must not echo the existing record id
// (identity oracle rule); extras are rejected, not stripped.
export const CheckInDuplicateSchema = z
  .object({
    outcome: z.literal("duplicate"),
  })
  .strict();

export const CheckInResponseSchema = z.union([
  CheckInSuccessSchema,
  CheckInDuplicateSchema,
]);

export const ExcusedResponseSchema = z.object({
  outcome: z.enum(["excused", "already_excused"]),
  disposition_id: nonEmptyString,
  enrollment_id: nonEmptyString,
});

export const ReconcileResponseSchema = z.object({
  outcome: ReconcileOutcomeSchema,
});

const AttendanceRowSchema = z.object({
  attendance_id: nonEmptyString,
  event_id: nonEmptyString,
  member_user_id: nullableString,
  guest_name: nullableString,
  guest_phone: nullableString,
  guest_phone_normalized: nullableString,
  method: AttendanceMethodSchema,
  status: z.enum(["Active", "Voided"]),
  checked_in_at: nonEmptyString,
  checked_in_by: nullableString,
  voided_by: nullableString,
  voided_at: nullableString,
  void_reason: nullableString,
});

const AttendanceExpectedSchema = z.object({
  expected_attendance_id: nullableString,
  event_id: nonEmptyString,
  enrollment_id: nonEmptyString,
  member_user_id: nonEmptyString,
  member_name: z.string(),
  member_phone: nullableString,
  source: z.enum([
    "event_start",
    "early_attendance",
    "late_approval",
    "preview",
  ]),
  state: AttendanceStateSchema,
  attendance: AttendanceRowSchema.nullable(),
  disposition: z
    .object({
      disposition_id: nonEmptyString,
      event_id: nonEmptyString,
      enrollment_id: nonEmptyString,
      member_user_id: nonEmptyString,
      disposition: z.literal("Excused"),
      reason: z.string(),
      recorded_by: nonEmptyString,
      recorded_at: nonEmptyString,
    })
    .nullable(),
});

const AttendanceSnapshotSchema = z.object({
  snapshot_id: nonEmptyString,
  event_id: nonEmptyString,
  materialized_at: nonEmptyString,
  last_materialized_at: nonEmptyString,
});

export const RosterResponseSchema = z.object({
  event: AttendanceEventSchema,
  attendances: z.array(AttendanceRowSchema),
  guests: z.array(AttendanceRowSchema),
  expected: z.array(AttendanceExpectedSchema),
  snapshot: AttendanceSnapshotSchema.nullable(),
  counts: z.object({
    expected: z.number(),
    present: z.number(),
    not_yet: z.number(),
    absent: z.number(),
    excused: z.number(),
    guests: z.number(),
  }),
  materialization_required: z.boolean(),
});

export const MaterializeResponseSchema = RosterResponseSchema.extend({
  materialization: z.object({
    status: z.enum(["materialized", "not_started", "cancelled"]),
    materialized: z.boolean(),
    added_expected: z.number(),
    snapshot: AttendanceSnapshotSchema.nullable(),
  }),
});

const ParticipantEventSchema = z.object({
  event_id: nonEmptyString,
  program_id: nonEmptyString,
  program_name: z.string(),
  name: nullableString,
  location: nullableString,
  starts_at: nonEmptyString,
  ends_at: nonEmptyString,
  check_in_window_opens_at: nonEmptyString,
  check_in_window_closes_at: nonEmptyString,
  status: z.enum(["Active", "Cancelled"]),
  availability: z.enum(["Active", "Inactive"]),
});

export const OwnAttendanceResponseSchema = z.object({
  event: ParticipantEventSchema,
  state: AttendanceStateSchema,
  attendance: z
    .object({
      attendance_id: nonEmptyString,
      status: z.enum(["Active", "Voided"]),
      checked_in_at: nonEmptyString,
    })
    .nullable(),
  disposition: z
    .object({
      disposition: z.literal("Excused"),
      reason: z.string(),
      recorded_at: nonEmptyString,
    })
    .nullable(),
});

export const AttendanceMembersSchema = z.object({
  members: z.array(
    z.object({
      user_id: nonEmptyString,
      name: z.string(),
      phone: nullableString,
      qr_code_string: nullableString,
    })
  ),
});

export const ManageableEventsSchema = z.object({
  events: z.array(
    z.object({
      event_id: nonEmptyString,
      program_id: nonEmptyString,
      program_name: z.string(),
      name: nullableString,
      location: nullableString,
      starts_at: nonEmptyString,
      ends_at: nonEmptyString,
      check_in_window_opens_at: nonEmptyString,
      check_in_window_closes_at: nonEmptyString,
      status: z.enum(["Active", "Cancelled"]),
      availability: z.enum(["Active", "Inactive"]),
    })
  ),
});

export const VoidResponseSchema = z.object({
  outcome: VoidOutcomeSchema,
  attendance_id: nonEmptyString,
});

export const GuestCorrectionResponseSchema = z.object({
  outcome: z.literal("corrected"),
  attendance_id: nonEmptyString,
});

/** Full Attendance mutation result union consumed by the browser facade. */
export const AttendanceResultSchema = z.union([
  CheckInResponseSchema,
  ExcusedResponseSchema,
  VoidResponseSchema,
  GuestCorrectionResponseSchema,
]);
