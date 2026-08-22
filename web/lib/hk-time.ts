// HK wall-clock formatting shared by the attendance panels (/scanner,
// /events) and the check-in sheet labels. Matches the programs events
// panel's pinned Asia/Hong_Kong rendering (no seconds, hour12 off) so one
// event never formats two ways depending on which surface shows it.

export const HK_TIME_ZONE = "Asia/Hong_Kong";

/** HK wall-clock label for an ISO timestamp: 2026/08/07 19:00. */
export function hkWallLabel(iso: string): string {
  return new Intl.DateTimeFormat("zh-Hant", {
    timeZone: HK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function hkWallParts(iso: string): {
  weekday: string;
  month: string;
  day: string;
  hour24: number;
  hour12: string;
  minute: string;
} {
  const parts = new Intl.DateTimeFormat("zh-Hant-HK", {
    timeZone: HK_TIME_ZONE,
    weekday: "narrow",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  const hour24 = Number(part("hour"));
  const hour12 = hour24 % 12 === 0 ? "12" : String(hour24 % 12);
  return {
    weekday: part("weekday"),
    month: part("month"),
    day: part("day"),
    hour24,
    hour12,
    minute: part("minute"),
  };
}

function hkDayPeriod(hour24: number): "早上" | "下午" | "晚上" {
  if (hour24 < 12) {
    return "早上";
  }
  if (hour24 < 18) {
    return "下午";
  }
  return "晚上";
}

/** Short HK date: 8月20日（三）. */
export function hkShortDateLabel(iso: string): string {
  const { weekday, month, day } = hkWallParts(iso);
  return `${month}月${day}日（${weekday}）`;
}

/** Short HK month/day date: 8月20日. */
export function hkMonthDayLabel(iso: string): string {
  const { month, day } = hkWallParts(iso);
  return `${month}月${day}日`;
}
/** Day numeral zero-padded for calendar chip: "26" or "02". */
export function hkDayPadded(iso: string): string {
  const { day } = hkWallParts(iso);
  return day.padStart(2, "0");
}

/** Month + weekday badge label for calendar chip: "8月·三". */
export function hkMonthWeekdayLabel(iso: string): string {
  const { month, weekday } = hkWallParts(iso);
  return `${month}月·${weekday}`;
}

/** Spoken time range from two HH:MM strings: "晚上 7:30–8:45". */
export function spokenTimeRangeFromHHMM(
  startHHMM: string,
  endHHMM: string
): string {
  const [sh, sm] = startHHMM.split(":").map(Number);
  const [eh, em] = endHHMM.split(":").map(Number);
  if (Number.isNaN(sh) || Number.isNaN(eh)) {
    return `${startHHMM}–${endHHMM}`;
  }
  const sPeriod = hkDayPeriod(sh);
  const ePeriod = hkDayPeriod(eh);
  const s12 = sh % 12 === 0 ? 12 : sh % 12;
  const e12 = eh % 12 === 0 ? 12 : eh % 12;
  const smStr = String(sm).padStart(2, "0");
  const emStr = String(em).padStart(2, "0");
  if (sPeriod === ePeriod) {
    return `${sPeriod} ${s12}:${smStr}–${e12}:${emStr}`;
  }
  return `${sPeriod} ${s12}:${smStr}–${ePeriod} ${e12}:${emStr}`;
}

/** Short HK time with 早上/下午/晚上: 晚上 7:30. */
export function hkShortTimeLabel(iso: string): string {
  const { hour24, hour12, minute } = hkWallParts(iso);
  return `${hkDayPeriod(hour24)} ${hour12}:${minute}`;
}

/** Same-period range collapses the second prefix: 晚上 7:30–9:00. */
export function hkShortTimeRange(startIso: string, endIso: string): string {
  const startParts = hkWallParts(startIso);
  const endParts = hkWallParts(endIso);
  const startPeriod = hkDayPeriod(startParts.hour24);
  const endPeriod = hkDayPeriod(endParts.hour24);
  const start = `${startPeriod} ${startParts.hour12}:${startParts.minute}`;
  const endClock = `${endParts.hour12}:${endParts.minute}`;
  if (startPeriod === endPeriod) {
    return `${start}–${endClock}`;
  }
  return `${start}–${endPeriod} ${endClock}`;
}

function hkYmd(ms: number): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("zh-Hant-HK", {
    timeZone: HK_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(ms));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value ?? Number.NaN);
  return { year: part("year"), month: part("month"), day: part("day") };
}

function hkDaySerial(ms: number): number {
  const { year, month, day } = hkYmd(ms);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/** Notices list label: 今天 / 昨天 / M月D日 / YYYY年M月D日 (Church Time). */
export function hkNoticeListLabel(iso: string, nowMs = Date.now()): string {
  const createdMs = new Date(iso).getTime();
  const delta = hkDaySerial(nowMs) - hkDaySerial(createdMs);
  if (delta === 0) {
    return "今天";
  }
  if (delta === 1) {
    return "昨天";
  }
  const created = hkYmd(createdMs);
  const now = hkYmd(nowMs);
  if (created.year === now.year) {
    return `${created.month}月${created.day}日`;
  }
  return `${created.year}年${created.month}月${created.day}日`;
}
