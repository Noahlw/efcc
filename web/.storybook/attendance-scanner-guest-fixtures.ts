import { http, HttpResponse } from "msw";

import type {
  AttendanceEvent,
  AttendanceEventSummary,
  AttendanceMember,
  AttendanceRow,
} from "@/lib/attendance";

import { authMeHandler } from "./management-hub-fixtures";

const REQUEST_ID = "t07-5-storybook";

const envelope = <T>(data: T) =>
  HttpResponse.json({ requestId: REQUEST_ID, data });

export const ATTENDANCE_EVENT_SUMMARY: AttendanceEventSummary = {
  event_id: "t07-5-event",
  program_id: "t07-5-program",
  program_name: "Storybook Attendance",
  name: "Storybook Attendance Session",
  location: "Storybook Hall",
  starts_at: "2099-09-01T10:00:00.000Z",
  ends_at: "2099-09-01T11:00:00.000Z",
  check_in_window_opens_at: "2099-09-01T09:45:00.000Z",
  check_in_window_closes_at: "2099-09-01T11:15:00.000Z",
  status: "Active",
  availability: "Active",
};

export const ATTENDANCE_EVENT: AttendanceEvent = {
  ...ATTENDANCE_EVENT_SUMMARY,
  manual_check_in_code: "570570",
};

export const ATTENDANCE_MEMBER: AttendanceMember = {
  user_id: "t07-5-member",
  name: "Storybook Member",
  phone: "00000000",
  qr_code_string: null,
};

export const ATTENDANCE_ROW: AttendanceRow = {
  attendance_id: "t07-5-attendance",
  event_id: ATTENDANCE_EVENT.event_id,
  member_user_id: ATTENDANCE_MEMBER.user_id,
  guest_name: null,
  guest_phone: null,
  guest_phone_normalized: null,
  method: "leader_manual_search",
  status: "Active",
  checked_in_at: "2099-09-01T10:05:00.000Z",
  checked_in_by: "t07-5-operator",
  voided_by: null,
  voided_at: null,
  void_reason: null,
};

const result = (outcome: "success" | "duplicate" = "success") =>
  envelope({ outcome, attendance_id: "t07-5-new-attendance" });

export const attendanceScannerGuestHandlers = [
  authMeHandler,
  http.get("/api/v1/attendance/resolve", () =>
    envelope({
      events: [ATTENDANCE_EVENT],
      latest: {
        status: ATTENDANCE_EVENT.status,
        availability: ATTENDANCE_EVENT.availability,
        starts_at: ATTENDANCE_EVENT.starts_at,
        check_in_window_opens_at: ATTENDANCE_EVENT.check_in_window_opens_at,
        program_id: ATTENDANCE_EVENT.program_id,
        program_name: ATTENDANCE_EVENT.program_name,
      },
      enrolled: true,
    })
  ),
  http.get("/api/v1/attendance/scanner-events", () =>
    envelope({ events: [ATTENDANCE_EVENT_SUMMARY] })
  ),
  http.get("/api/v1/attendance/events", () =>
    envelope({ events: [ATTENDANCE_EVENT_SUMMARY] })
  ),
  http.get("/api/v1/attendance/events/:eventId/roster", () =>
    envelope({ event: ATTENDANCE_EVENT, attendances: [ATTENDANCE_ROW] })
  ),
  http.get("/api/v1/attendance/events/:eventId/members", () =>
    envelope({ members: [ATTENDANCE_MEMBER] })
  ),
  http.post("/api/v1/attendance/events/:eventId/check-in", () => result()),
  http.post("/api/v1/attendance/self", () => result()),
  http.post("/api/v1/attendance/guest", () => result()),
  http.post("/api/v1/attendance/:attendanceId/void", () => result()),
  http.patch("/api/v1/attendance/:attendanceId/guest-correction", () =>
    result()
  ),
];
