import type { AttendanceEvent } from "@/lib/attendance";
import { COPY } from "@/lib/copy";
import { hkWallLabel } from "@/lib/hk-time";

export function attendanceEventName(event: AttendanceEvent): string {
  return event.name?.trim() || event.program_name;
}

export function attendanceEventLabel(event: AttendanceEvent): string {
  return `${attendanceEventName(event)} · ${hkWallLabel(event.starts_at)}`;
}

export function attendanceEventMeta(event: AttendanceEvent): string {
  const location = event.location?.trim();
  return location
    ? `${hkWallLabel(event.starts_at)} · ${COPY.attendance.eventLocation}: ${location}`
    : hkWallLabel(event.starts_at);
}
