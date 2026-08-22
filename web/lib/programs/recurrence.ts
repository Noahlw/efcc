import { COPY } from "@/lib/copy";
import { spokenTimeRangeFromHHMM } from "@/lib/hk-time";

/**
 * EFCC Programs domain — Asia/Hong_Kong wall-clock recurrence math (PRG-02
 * #198). Pure functions, no I/O. Church-facing dates and times are computed
 * in Asia/Hong_Kong (UTC+8, no DST) and stored as ISO-8601 UTC instants.
 */

export const HK_TIME_ZONE = "Asia/Hong_Kong";

// ponytail: HK has no DST, so the offset is a constant. Revisit only if the
// territory ever adopts DST (Intl with the IANA zone stays the display path).
export const HK_UTC_OFFSET_MINUTES = 480;

export type RecurrenceKind = "WEEKLY" | "MONTHLY";

export interface ScheduleRuleLike {
  rule_id: string;
  recurrence: RecurrenceKind;
  day_of_week: number | null;
  month_day: number | null;
  start_time: string;
  end_time: string;
  /** Optional default venue materialized onto preview rows and generated events. */
  location?: string | null;
}

export type ScheduleExceptionAction = "CANCEL" | "RESCHEDULE";

export interface ScheduleExceptionLike {
  exception_id: string;
  rule_id: string;
  override_date: string;
  action: ScheduleExceptionAction;
  new_start_time: string | null;
  new_end_time: string | null;
}

export interface Occurrence {
  starts_at: string;
  ends_at: string;
}

/** HK wall date ("YYYY-MM-DD") of an ISO-8601 UTC instant. */
export function hkWallDateOf(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  return `${map.year}-${map.month}-${map.day}`;
}

/** "YYYY-MM-DD" (HK wall) + "HH:MM" (HK wall) -> ISO-8601 UTC instant. */
export function hkWallToUtc(wallDate: string, wallTime: string): string {
  return new Date(`${wallDate}T${wallTime}:00+08:00`).toISOString();
}

const WALL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
const WALL_TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;

export function isWallDate(v: unknown): v is string {
  return typeof v === "string" && WALL_DATE_RE.test(v);
}

export function isWallTime(v: unknown): v is string {
  return typeof v === "string" && WALL_TIME_RE.test(v);
}

/** Today's HK wall date, "YYYY-MM-DD". */
export function hkTodayWallDate(now: Date = new Date()): string {
  return hkWallDateOf(now.toISOString());
}

/** Shift a HK wall date by whole days (DST-free wall arithmetic). */
export function addWallDays(wallDate: string, days: number): string {
  const [y, m, d] = wallDate.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

/** 0 = Sunday .. 6 = Saturday on the HK wall calendar. */
export function wallWeekday(wallDate: string): number {
  const [y, m, d] = wallDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Concrete occurrences for a rule over [fromDate, fromDate + horizonDays). */
export function occurrencesForRule(
  rule: ScheduleRuleLike,
  fromDate: string,
  horizonDays: number,
  exceptions: ScheduleExceptionLike[]
): Occurrence[] {
  const result: Occurrence[] = [];
  // Rule-scoped lookups: exceptions on one rule never affect another rule
  // firing on the same wall date.
  const byRuleDate = new Map(
    exceptions.map((e) => [`${e.rule_id}:${e.override_date}`, e])
  );
  for (let i = 0; i < horizonDays; i += 1) {
    const date = addWallDays(fromDate, i);
    const matches =
      rule.recurrence === "WEEKLY"
        ? wallWeekday(date) === rule.day_of_week
        : Number(date.slice(8, 10)) === rule.month_day;
    if (!matches) {
      continue;
    }
    const exception = byRuleDate.get(`${rule.rule_id}:${date}`);
    if (exception?.action === "CANCEL") {
      continue;
    }
    const start = exception?.new_start_time ?? rule.start_time;
    const end = exception?.new_end_time ?? rule.end_time;
    result.push({
      starts_at: hkWallToUtc(date, start),
      ends_at: hkWallToUtc(date, end),
    });
  }
  return result;
}

/**
 * One materialized preview row for a rule. CANCEL exceptions still produce
 * a row (so the plan is exact about suppressed dates) carrying the original
 * rule times plus skip_reason; RESCHEDULE exceptions override the times and
 * record the exception_id.
 */
export interface PreviewOccurrenceCandidate {
  rule_id: string;
  /** HK wall date "YYYY-MM-DD" the occurrence falls on. */
  occurs_on: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  skip_reason: "CANCEL" | "DUPLICATE" | null;
  exception_id: string | null;
}

/**
 * Exact future occurrence candidates for one rule over
 * [fromDate, fromDate + horizonDays), including CANCEL rows marked for
 * skipping. Deterministic: dates ascend, and within a date the rule's own
 * times are used. Pure function (no I/O); the caller owns identity and
 * persistence.
 */
export function previewOccurrencesForRule(
  rule: ScheduleRuleLike,
  fromDate: string,
  horizonDays: number,
  exceptions: ScheduleExceptionLike[]
): PreviewOccurrenceCandidate[] {
  const result: PreviewOccurrenceCandidate[] = [];
  // Exceptions are rule-scoped: two rules firing on the same wall date must
  // never cross-affect, so lookups are keyed by (rule, date).
  const byRuleDate = new Map(
    exceptions.map((e) => [`${e.rule_id}:${e.override_date}`, e])
  );
  for (let i = 0; i < horizonDays; i += 1) {
    const date = addWallDays(fromDate, i);
    const matches =
      rule.recurrence === "WEEKLY"
        ? wallWeekday(date) === rule.day_of_week
        : Number(date.slice(8, 10)) === rule.month_day;
    if (!matches) {
      continue;
    }
    const exception = byRuleDate.get(`${rule.rule_id}:${date}`);
    if (exception?.action === "CANCEL") {
      result.push({
        rule_id: rule.rule_id,
        occurs_on: date,
        starts_at: hkWallToUtc(date, rule.start_time),
        ends_at: hkWallToUtc(date, rule.end_time),
        location: rule.location ?? null,
        skip_reason: "CANCEL",
        exception_id: exception.exception_id,
      });
      continue;
    }
    const start = exception?.new_start_time ?? rule.start_time;
    const end = exception?.new_end_time ?? rule.end_time;
    result.push({
      rule_id: rule.rule_id,
      occurs_on: date,
      starts_at: hkWallToUtc(date, start),
      ends_at: hkWallToUtc(date, end),
      location: rule.location ?? null,
      skip_reason: null,
      exception_id: exception?.exception_id ?? null,
    });
  }
  return result;
}

export interface EventLike {
  starts_at: string;
  source: string;
}

/**
 * The schedule exception overriding an event row, when attribution is
 * unambiguous: the rule whose schedule produced the event (same attribution
 * rule as the events panel) with an exception on the event's HK wall date.
 * CANCEL exceptions normally suppress generation, so a match here means the
 * exception was created after the row was materialized. Returns null for
 * MANUAL events and for rows with no matching exception.
 */
export function exceptionForEvent(
  event: EventLike,
  rules: ScheduleRuleLike[],
  exceptions: ScheduleExceptionLike[]
): ScheduleExceptionLike | null {
  if (event.source !== "SCHEDULE") {
    return null;
  }
  const date = hkWallDateOf(event.starts_at);
  const time = new Date(
    new Date(event.starts_at).getTime() + HK_UTC_OFFSET_MINUTES * 60_000
  )
    .toISOString()
    .slice(11, 16);
  const byDate = rules.filter((rule) =>
    rule.recurrence === "WEEKLY"
      ? rule.day_of_week === wallWeekday(date)
      : rule.month_day === Number(date.slice(8, 10))
  );
  const rule =
    byDate.length === 1
      ? byDate[0]
      : (byDate.find((r) => r.start_time === time) ?? null);
  if (!rule) {
    return null;
  }
  return (
    exceptions.find(
      (e) => e.rule_id === rule.rule_id && e.override_date === date
    ) ?? null
  );
}
export type RecurrenceTag = "無" | "每週" | "每月";

/**
 * Derive the informational recurrence tag for an event row.
 * SCHEDULE events resolve against linked schedule rules ('每週' or '每月').
 * MANUAL events return '無'.
 */
export function recurrenceTagForEvent(
  event: EventLike,
  rules: ScheduleRuleLike[]
): RecurrenceTag {
  if (event.source !== "SCHEDULE") {
    return "無";
  }
  const date = hkWallDateOf(event.starts_at);
  const time = new Date(
    new Date(event.starts_at).getTime() + HK_UTC_OFFSET_MINUTES * 60_000
  )
    .toISOString()
    .slice(11, 16);
  const byDate = rules.filter((rule) =>
    rule.recurrence === "WEEKLY"
      ? rule.day_of_week === wallWeekday(date)
      : rule.month_day === Number(date.slice(8, 10))
  );
  const rule =
    byDate.length === 1
      ? byDate[0]
      : (byDate.find((r) => r.start_time === time) ?? byDate[0] ?? null);
  if (!rule) {
    if (rules.length === 1) {
      return rules[0].recurrence === "WEEKLY" ? "每週" : "每月";
    }
    return "無";
  }
  return rule.recurrence === "WEEKLY" ? "每週" : "每月";
}

const HK_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-Hant", {
  timeZone: HK_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** HK wall date+time label ("2026/08/06 08:00") for an ISO-8601 UTC instant. */
export function hkWallDateTimeLabel(iso: string): string {
  return HK_DATE_TIME_FORMATTER.format(new Date(iso));
}

/** 0 = Sunday .. 6 = Saturday display labels (shared by settings + events panel). */
export const WEEKDAY_LABELS = [
  COPY.programs.weekdaySunday,
  COPY.programs.weekdayMonday,
  COPY.programs.weekdayTuesday,
  COPY.programs.weekdayWednesday,
  COPY.programs.weekdayThursday,
  COPY.programs.weekdayFriday,
  COPY.programs.weekdaySaturday,
];

export function formatScheduleRuleLabel(rule: ScheduleRuleLike): string {
  const timeRange = spokenTimeRangeFromHHMM(rule.start_time, rule.end_time);
  return rule.recurrence === "WEEKLY"
    ? `${COPY.programs.ruleWeekly} ${WEEKDAY_LABELS[rule.day_of_week ?? 0] ?? ""} ${timeRange}`
    : `${COPY.programs.ruleMonthly} ${rule.month_day ?? ""}日 ${timeRange}`;
}
