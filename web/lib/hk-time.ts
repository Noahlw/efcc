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
