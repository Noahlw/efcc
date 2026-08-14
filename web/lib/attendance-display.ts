import type { AttendanceEventSummary } from "@/lib/attendance";
import { COPY } from "@/lib/copy";
import { hkWallLabel } from "@/lib/hk-time";

export function attendanceEventName(event: AttendanceEventSummary): string {
  return event.name?.trim() || event.program_name;
}

export function attendanceEventLabel(event: AttendanceEventSummary): string {
  return `${attendanceEventName(event)} · ${hkWallLabel(event.starts_at)}`;
}

export function attendanceEventMeta(event: AttendanceEventSummary): string {
  const location = event.location?.trim();
  return location
    ? `${hkWallLabel(event.starts_at)} · ${COPY.attendance.eventLocation}: ${location}`
    : hkWallLabel(event.starts_at);
}
