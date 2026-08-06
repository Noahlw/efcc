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
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  return `${map.year}-${map.month}-${map.day}`;
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
  const byDate = new Map(exceptions.map((e) => [e.override_date, e]));
  for (let i = 0; i < horizonDays; i += 1) {
    const date = addWallDays(fromDate, i);
    const matches =
      rule.recurrence === "WEEKLY"
        ? wallWeekday(date) === rule.day_of_week
        : Number(date.slice(8, 10)) === rule.month_day;
    if (!matches) {
      continue;
    }
    const exception = byDate.get(date);
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
