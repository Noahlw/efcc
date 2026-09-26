/**
 * Schedule Plan/Event wire contracts (spec #646, ticket #658, ADR-0047).
 *
 * Source-derived from `apps/web/lib/programs/program-handlers.ts`
 * (rule/exception/preview/generate/event handlers),
 * `workspace-store.ts` row shapes, and `recurrence.ts` wall predicates
 * (ported verbatim — recurrence.ts imports UI modules, so the pure
 * predicates live here too). Validators never transform.
 *
 * ADR-0047 is carried: a malformed/lost Generate acknowledgement stays
 * unresolved until an authoritative Audit Outcome; the browser already
 * classifies MALFORMED_RESPONSE as unknown (isUnknownMutationOutcome)
 * and never auto-replays. Nothing here retries a write.
 */
import * as z from "zod";

import { nonEmptyString, nullableString } from "./primitives";

const WALL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
const WALL_TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;

/** HH:MM wall time (exact port of the recurrence predicate). */
export function isWallTime(v: unknown): v is string {
  return typeof v === "string" && WALL_TIME_RE.test(v);
}

/** Calendar-valid HK wall date (exact port of the recurrence predicate). */
export function isValidWallDate(v: unknown): v is string {
  if (typeof v !== "string" || !WALL_DATE_RE.test(v)) {
    return false;
  }
  const [year, month, day] = v.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** ISO-8601 UTC instant (exact port of the iso-instant predicate). */
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z$/u;
export function isIsoInstant(v: unknown): v is string {
  if (typeof v !== "string" || !ISO_INSTANT_RE.test(v)) {
    return false;
  }
  const timestamp = Date.parse(v);
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  return new Date(timestamp).toISOString().slice(0, 16) === v.slice(0, 16);
}

export function isDayOfWeekValue(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 6;
}

export function isMonthDayValue(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 31;
}

export const RecurrenceSchema = z.enum(["WEEKLY", "MONTHLY"]);
export const ExceptionActionSchema = z.enum(["CANCEL", "RESCHEDULE"]);
export const EventTypeSchema = z.enum([
  "崇拜",
  "訓練",
  "小組",
  "排練",
  "外展",
  "其他",
]);
export const GenerationStatusSchema = z.enum([
  "completed",
  "partial",
  "failed",
]);

// ---------------------------------------------------------------------------
// Request predicates with exact handler semantics.
// ---------------------------------------------------------------------------

export interface RuleBody {
  recurrence?: unknown;
  day_of_week?: unknown;
  month_day?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  location?: unknown;
  effective_start_date?: unknown;
  effective_end_date?: unknown;
}

export type RuleBodyResult =
  | { ok: false; detail: string }
  | {
      ok: true;
      value: {
        recurrence: "WEEKLY" | "MONTHLY";
        day_of_week: number | null;
        month_day: number | null;
        start_time: string;
        end_time: string;
        location?: string | null;
        effective_start_date?: string;
        effective_end_date?: string | null;
      };
    };

/** Exact port of the handler parseRuleBody (messages preserved). */
export function parseRuleBody(body: RuleBody): RuleBodyResult {
  if (body.recurrence !== "WEEKLY" && body.recurrence !== "MONTHLY") {
    return { ok: false, detail: "recurrence must be WEEKLY or MONTHLY." };
  }
  if (!isWallTime(body.start_time) || !isWallTime(body.end_time)) {
    return { ok: false, detail: "start_time and end_time must be HH:MM." };
  }
  if (body.end_time <= body.start_time) {
    return { ok: false, detail: "end_time must be after start_time." };
  }
  const isDayOfWeek = isDayOfWeekValue(body.day_of_week);
  const isMonthDay = isMonthDayValue(body.month_day);
  if (body.recurrence === "WEEKLY" && !isDayOfWeek) {
    return { ok: false, detail: "day_of_week (0-6) is required for WEEKLY." };
  }
  if (body.recurrence === "MONTHLY" && !isMonthDay) {
    return { ok: false, detail: "month_day (1-31) is required for MONTHLY." };
  }
  if (
    body.location !== undefined &&
    body.location !== null &&
    typeof body.location !== "string"
  ) {
    return { ok: false, detail: "location must be text or null." };
  }
  if (
    body.effective_start_date !== undefined &&
    !isValidWallDate(body.effective_start_date)
  ) {
    return { ok: false, detail: "effective_start_date must be YYYY-MM-DD." };
  }
  if (
    body.effective_end_date !== undefined &&
    body.effective_end_date !== null &&
    !isValidWallDate(body.effective_end_date)
  ) {
    return {
      ok: false,
      detail: "effective_end_date must be YYYY-MM-DD or null.",
    };
  }
  const effectiveStart =
    body.effective_start_date === undefined
      ? undefined
      : body.effective_start_date;
  const effectiveEnd =
    body.effective_end_date === undefined ? undefined : body.effective_end_date;
  if (
    typeof effectiveStart === "string" &&
    typeof effectiveEnd === "string" &&
    effectiveEnd < effectiveStart
  ) {
    return {
      ok: false,
      detail: "effective_end_date must be on or after effective_start_date.",
    };
  }
  return {
    ok: true,
    value: {
      recurrence: body.recurrence,
      day_of_week: isDayOfWeekValue(body.day_of_week) ? body.day_of_week : null,
      month_day: isMonthDayValue(body.month_day) ? body.month_day : null,
      start_time: body.start_time,
      end_time: body.end_time,
      ...(body.location === undefined
        ? {}
        : {
            location:
              typeof body.location === "string"
                ? body.location.trim() || null
                : null,
          }),
      ...(effectiveStart === undefined
        ? {}
        : { effective_start_date: effectiveStart }),
      ...(effectiveEnd === undefined
        ? {}
        : { effective_end_date: effectiveEnd }),
    },
  };
}

export interface ExistingRuleShape {
  recurrence: "WEEKLY" | "MONTHLY";
  day_of_week: number | null;
  month_day: number | null;
  start_time: string;
  end_time: string;
  effective_start_date?: string | null;
  effective_end_date?: string | null;
}

export type RulePatchResult =
  | { ok: false; detail: string }
  | {
      ok: true;
      update: {
        recurrence?: "WEEKLY" | "MONTHLY";
        day_of_week?: number;
        month_day?: number;
        start_time?: string;
        end_time?: string;
        location?: string | null;
        effective_start_date?: string | null;
        effective_end_date?: string | null;
      };
    };

/** Exact port of the handler parseRulePatch (messages preserved). */
export function parseRulePatch(
  body: RuleBody,
  existing: ExistingRuleShape
): RulePatchResult {
  const update: Extract<RulePatchResult, { ok: true }>["update"] = {};
  if (body.recurrence === "WEEKLY" || body.recurrence === "MONTHLY") {
    update.recurrence = body.recurrence;
  }
  if (body.day_of_week !== undefined && !isDayOfWeekValue(body.day_of_week)) {
    return { ok: false, detail: "day_of_week must be an integer 0-6." };
  }
  if (isDayOfWeekValue(body.day_of_week)) {
    update.day_of_week = body.day_of_week;
  }
  if (body.month_day !== undefined && !isMonthDayValue(body.month_day)) {
    return { ok: false, detail: "month_day must be an integer 1-31." };
  }
  if (isMonthDayValue(body.month_day)) {
    update.month_day = body.month_day;
  }
  const startTime =
    typeof body.start_time === "string" ? body.start_time : null;
  const endTime = typeof body.end_time === "string" ? body.end_time : null;
  if (startTime !== null && !isWallTime(startTime)) {
    return { ok: false, detail: "start_time must be HH:MM." };
  }
  if (endTime !== null && !isWallTime(endTime)) {
    return { ok: false, detail: "end_time must be HH:MM." };
  }
  if (startTime !== null) {
    update.start_time = startTime;
  }
  if (endTime !== null) {
    update.end_time = endTime;
  }
  if (body.location !== undefined) {
    if (body.location !== null && typeof body.location !== "string") {
      return { ok: false, detail: "location must be text or null." };
    }
    update.location =
      typeof body.location === "string" ? body.location.trim() || null : null;
  }
  if (body.effective_start_date !== undefined) {
    if (
      body.effective_start_date !== null &&
      !isValidWallDate(body.effective_start_date)
    ) {
      return {
        ok: false,
        detail: "effective_start_date must be YYYY-MM-DD or null.",
      };
    }
    update.effective_start_date = body.effective_start_date as string | null;
  }
  if (body.effective_end_date !== undefined) {
    if (
      body.effective_end_date !== null &&
      !isValidWallDate(body.effective_end_date)
    ) {
      return {
        ok: false,
        detail: "effective_end_date must be YYYY-MM-DD or null.",
      };
    }
    update.effective_end_date = body.effective_end_date as string | null;
  }
  const resolvedStart = update.start_time ?? existing.start_time;
  const resolvedEnd = update.end_time ?? existing.end_time;
  if (resolvedEnd <= resolvedStart) {
    return { ok: false, detail: "end_time must be after start_time." };
  }
  const resolvedRecurrence = update.recurrence ?? existing.recurrence;
  const resolvedDayOfWeek = update.day_of_week ?? existing.day_of_week;
  const resolvedMonthDay = update.month_day ?? existing.month_day;
  if (
    resolvedRecurrence === "WEEKLY" &&
    (resolvedDayOfWeek === null || !isDayOfWeekValue(resolvedDayOfWeek))
  ) {
    return { ok: false, detail: "day_of_week (0-6) is required for WEEKLY." };
  }
  if (
    resolvedRecurrence === "MONTHLY" &&
    (resolvedMonthDay === null || !isMonthDayValue(resolvedMonthDay))
  ) {
    return { ok: false, detail: "month_day (1-31) is required for MONTHLY." };
  }
  const resolvedEffectiveStart =
    update.effective_start_date === undefined
      ? (existing.effective_start_date ?? null)
      : update.effective_start_date;
  const resolvedEffectiveEnd =
    update.effective_end_date === undefined
      ? (existing.effective_end_date ?? null)
      : update.effective_end_date;
  if (
    typeof resolvedEffectiveStart === "string" &&
    typeof resolvedEffectiveEnd === "string" &&
    resolvedEffectiveEnd < resolvedEffectiveStart
  ) {
    return {
      ok: false,
      detail: "effective_end_date must be on or after effective_start_date.",
    };
  }
  return { ok: true, update };
}

export interface ExceptionBody {
  override_date?: unknown;
  action?: unknown;
  new_date?: unknown;
  new_start_time?: unknown;
  new_end_time?: unknown;
}

export type ExceptionBodyResult =
  | { ok: false; detail: string }
  | {
      ok: true;
      value: {
        override_date: string;
        action: "CANCEL" | "RESCHEDULE";
        new_date: string | null;
        new_start_time: string | null;
        new_end_time: string | null;
      };
    };

/** Exact port of the exception-create validation chain. */
export function parseExceptionBody(body: ExceptionBody): ExceptionBodyResult {
  if (!isValidWallDate(body.override_date)) {
    return { ok: false, detail: "override_date must be YYYY-MM-DD." };
  }
  if (body.action !== "CANCEL" && body.action !== "RESCHEDULE") {
    return { ok: false, detail: "action must be CANCEL or RESCHEDULE." };
  }
  const newStart =
    typeof body.new_start_time === "string" ? body.new_start_time : null;
  const newEnd =
    typeof body.new_end_time === "string" ? body.new_end_time : null;
  const newDate =
    body.new_date === undefined || body.new_date === null
      ? null
      : body.new_date;
  if (newDate !== null && !isValidWallDate(newDate)) {
    return { ok: false, detail: "new_date must be YYYY-MM-DD or null." };
  }
  if (newStart !== null && !isWallTime(newStart)) {
    return { ok: false, detail: "new_start_time must be HH:MM." };
  }
  if (newEnd !== null && !isWallTime(newEnd)) {
    return { ok: false, detail: "new_end_time must be HH:MM." };
  }
  if (body.action === "RESCHEDULE" && (newStart === null || newEnd === null)) {
    return {
      ok: false,
      detail: "RESCHEDULE requires new_start_time and new_end_time.",
    };
  }
  if (body.action === "CANCEL" && (newStart !== null || newEnd !== null)) {
    return { ok: false, detail: "CANCEL must not include new times." };
  }
  if (body.action === "CANCEL" && newDate !== null) {
    return { ok: false, detail: "CANCEL must not include new_date." };
  }
  if (
    body.action === "RESCHEDULE" &&
    newStart !== null &&
    newEnd !== null &&
    newEnd <= newStart
  ) {
    return { ok: false, detail: "new_end_time must be after new_start_time." };
  }
  return {
    ok: true,
    value: {
      override_date: body.override_date,
      action: body.action,
      new_date: newDate,
      new_start_time: newStart,
      new_end_time: newEnd,
    },
  };
}

/** Preview horizon rule: integer 1..365 when present. */
export function parsePreviewHorizon(value: unknown): number | null | "invalid" {
  if (value === undefined) {
    return null;
  }
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 365
  ) {
    return value;
  }
  return "invalid";
}

/** Generate plan reference: non-blank string. */
export function parseGeneratePlanId(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * Event text field with the exact create/update trim semantics:
 * undefined stays absent, null stays null, strings trim (blank
 * becomes null), anything else throws exactly like the handler.
 */
export function parseEventText(
  value: unknown,
  field: string
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new TypeError(`${field} must be text.`);
  }
  return value.trim() || null;
}

// ---------------------------------------------------------------------------
// Response projections.
// ---------------------------------------------------------------------------

export const ScheduleRuleRowSchema = z.object({
  rule_id: nonEmptyString,
  program_id: nonEmptyString,
  recurrence: RecurrenceSchema,
  day_of_week: z.number().nullable(),
  month_day: z.number().nullable(),
  start_time: nonEmptyString,
  end_time: nonEmptyString,
  location: nullableString,
  effective_start_date: nullableString.optional(),
  effective_end_date: nullableString.optional(),
  retired_at: nullableString.optional(),
  retired_by: nullableString.optional(),
  has_generated_events: z.union([z.number(), z.boolean()]).optional(),
  created_by: nullableString,
  created_at: nonEmptyString,
  updated_by: nullableString,
  updated_at: nonEmptyString,
});

export const ScheduleRulesSchema = z.object({
  rules: z.array(ScheduleRuleRowSchema),
});

export const ScheduleRuleCreateResponseSchema = z.object({
  rule: ScheduleRuleRowSchema,
  idempotent: z.boolean(),
});

export const ScheduleRuleResponseSchema = z.object({
  rule: ScheduleRuleRowSchema,
});

export const ScheduleExceptionRowSchema = z.object({
  exception_id: nonEmptyString,
  rule_id: nonEmptyString,
  override_date: nonEmptyString,
  action: ExceptionActionSchema,
  new_start_time: nullableString,
  new_end_time: nullableString,
  new_date: nullableString.optional(),
  created_by: nullableString,
  created_at: nonEmptyString,
});

export const ScheduleExceptionsSchema = z.object({
  exceptions: z.array(ScheduleExceptionRowSchema),
});

export const ScheduleExceptionCreateResponseSchema = z.object({
  exception: ScheduleExceptionRowSchema,
});

export const ScheduleExceptionDeleteResponseSchema = z.object({
  deleted: z.literal(true),
});

const PreviewPlanSchema = z.object({
  plan_id: nonEmptyString,
  program_id: nonEmptyString,
  plan_hash: nonEmptyString,
  horizon_days: z.number(),
  from_date: nonEmptyString,
  to_date: nonEmptyString,
  rule_count: z.number(),
  created_at: nonEmptyString,
});

const PreviewOccurrenceSchema = z.object({
  occurrence_id: nonEmptyString,
  plan_id: nonEmptyString,
  rule_id: nonEmptyString,
  occurs_on: nonEmptyString,
  starts_at: nonEmptyString,
  ends_at: nonEmptyString,
  location: nullableString,
  skip_reason: z.enum(["CANCEL", "DUPLICATE"]).nullable(),
  exception_id: nullableString,
  replacement_date: nullableString.optional(),
});

export const PreviewEventsResponseSchema = z.object({
  plan: PreviewPlanSchema,
  occurrences: z.array(PreviewOccurrenceSchema),
});

const GenerateSkippedOccurrenceSchema = z.object({
  occurrence_id: nonEmptyString,
  starts_at: nonEmptyString,
  reason: z.enum(["CANCEL", "DUPLICATE"]),
});

const GenerateUnresolvedOccurrenceSchema = z.object({
  occurrence_id: nonEmptyString,
  starts_at: nonEmptyString,
  detail: nullableString,
});

export const GenerateEventsResponseSchema = z.object({
  generated: z.object({
    run_id: nonEmptyString,
    plan_id: nonEmptyString,
    status: GenerationStatusSchema,
    created: z.number(),
    skipped: z.number(),
    failed: z.number(),
    resumed: z.boolean(),
    requires_review: z.boolean().optional(),
    created_event_ids: z.array(nonEmptyString),
    skipped_occurrences: z.array(GenerateSkippedOccurrenceSchema),
    unresolved_occurrences: z.array(GenerateUnresolvedOccurrenceSchema),
  }),
});

export const ProgramEventSchema = z.object({
  event_id: nonEmptyString,
  program_id: nonEmptyString,
  program_name: z.string().optional(),
  starts_at: nonEmptyString,
  ends_at: nonEmptyString,
  status: z.enum(["Active", "Cancelled"]),
  availability: z.enum(["Active", "Inactive"]).optional(),
  source: z.enum(["SCHEDULE", "MANUAL"]),
  schedule_rule_id: nullableString.optional(),
  occurrence_date: nullableString.optional(),
  name: nullableString.optional(),
  event_type: EventTypeSchema.nullable().optional(),
  location: nullableString.optional(),
  manual_check_in_code: nullableString.optional(),
  check_in_window_opens_at: nullableString.optional(),
  check_in_window_closes_at: nullableString.optional(),
  cancel_reason: nullableString,
  created_at: nonEmptyString,
  updated_at: nonEmptyString,
  recurrence_tag: nullableString.optional(),
  has_attendance: z.boolean().optional(),
});

export const EventsListSchema = z.object({
  events: z.array(ProgramEventSchema),
});

export const EventCreateResponseSchema = z.object({
  event: ProgramEventSchema,
});

export const EventResponseSchema = z.object({
  event: ProgramEventSchema,
});

export const EventDetailResponseSchema = z.object({
  event: ProgramEventSchema,
  leaders: z.array(
    z.object({
      program_id: nonEmptyString,
      user_id: nonEmptyString,
      role_definition_id: nonEmptyString,
      label: z.string(),
      scope_kind: z.enum(["Global", "Department", "Program"]),
      scope_id: nullableString,
      granted_at: nonEmptyString,
    })
  ),
  participant_summary: z.object({
    active_enrollments: z.number(),
    checked_in: z.number(),
  }),
});
