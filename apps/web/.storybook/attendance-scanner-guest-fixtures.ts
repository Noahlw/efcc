import { http, HttpResponse } from "msw";

import type {
  AttendanceDisposition,
  AttendanceEvent,
  AttendanceEventSummary,
  AttendanceExpectedRow,
  AttendanceMember,
  AttendanceRosterCounts,
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
  check_in_window_opens_at: "2020-01-01T00:00:00.000Z",
  check_in_window_closes_at: "2099-12-31T23:59:59.000Z",
};

export const ATTENDANCE_MEMBER: AttendanceMember = {
  user_id: "t07-5-member",
  name: "Storybook Member",
  phone: "00000000",
  qr_code_string: null,
};

export const ATTENDANCE_ADDITION_MEMBER: AttendanceMember = {
  user_id: "t07-5-addition-member",
  name: "Storybook Addition",
  phone: "11111111",
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

const GUEST_ROW: AttendanceRow = {
  attendance_id: "t07-5-guest-attendance",
  event_id: ATTENDANCE_EVENT.event_id,
  member_user_id: null,
  guest_name: "訪客 林寶怡",
  guest_phone: "9123 4567",
  guest_phone_normalized: "hk:85291234567",
  method: "guest_manual_code",
  status: "Active",
  checked_in_at: "2099-09-01T10:08:00.000Z",
  checked_in_by: null,
  voided_by: null,
  voided_at: null,
  void_reason: null,
};

const PARTICIPANT_NAMES = [
  "陳嘉敏",
  "黃子軒",
  "李欣怡",
  "張芷晴",
  "劉俊謙",
  "鄭樂瑤",
  "何卓謙",
  "周雅雯",
  "林浩然",
  "梁曉彤",
  "吳梓謙",
  "許心怡",
  "蔡承恩",
  "葉詠晴",
  "鄧宇軒",
  "蘇婉儀",
  "曾俊傑",
  "羅雅芝",
  "鍾浩文",
  "馮詩敏",
  "謝朗軒",
  "邱可欣",
  "杜文傑",
  "余凱琳",
  "方皓恩",
  "彭思穎",
  "鄺志豪",
  "馬嘉怡",
  "黎俊豪",
  "郭曉琳",
] as const;

const ATTENDANCE_EXPECTED_ROWS: AttendanceExpectedRow[] = PARTICIPANT_NAMES.map(
  (member_name, index) => ({
    expected_attendance_id: index === 0 ? ATTENDANCE_ROW.attendance_id : null,
    event_id: ATTENDANCE_EVENT.event_id,
    enrollment_id: `t07-5-enrollment-${index + 1}`,
    member_user_id:
      index === 0 ? ATTENDANCE_MEMBER.user_id : `t07-5-member-${index + 1}`,
    member_name,
    member_phone: null,
    source: "event_start",
    state: index === 0 ? "Present" : "Not Yet",
    attendance: index === 0 ? ATTENDANCE_ROW : null,
    disposition: null,
  })
);

export const ATTENDANCE_POST_EVENT: AttendanceEvent = {
  ...ATTENDANCE_EVENT,
  event_id: "t07-5-post-event",
  name: "Storybook 已結束聚會",
  starts_at: "2020-09-01T10:00:00.000Z",
  ends_at: "2020-09-01T11:00:00.000Z",
  check_in_window_opens_at: "2020-09-01T09:45:00.000Z",
  check_in_window_closes_at: "2020-09-01T11:15:00.000Z",
};

const postEventAttendance = (
  memberUserId: string,
  index: number
): AttendanceRow => ({
  ...ATTENDANCE_ROW,
  attendance_id: `t07-5-post-attendance-${index + 1}`,
  event_id: ATTENDANCE_POST_EVENT.event_id,
  member_user_id: memberUserId,
  checked_in_at: "2020-09-01T10:05:00.000Z",
});

const postEventDisposition = (
  row: AttendanceExpectedRow,
  index: number
): AttendanceDisposition => ({
  disposition_id: `t07-5-post-disposition-${index + 1}`,
  event_id: ATTENDANCE_POST_EVENT.event_id,
  enrollment_id: row.enrollment_id,
  member_user_id: row.member_user_id,
  disposition: "Excused",
  reason: index % 2 === 0 ? "工作或上課" : "家庭事務",
  recorded_by: "t07-5-operator",
  recorded_at: "2020-09-01T10:10:00.000Z",
});

export const ATTENDANCE_POST_EVENT_EXPECTED_ROWS: AttendanceExpectedRow[] =
  ATTENDANCE_EXPECTED_ROWS.map((row, index) => {
    const state = index < 10 ? "Present" : index < 18 ? "Excused" : "Absent";
    return {
      ...row,
      event_id: ATTENDANCE_POST_EVENT.event_id,
      expected_attendance_id:
        state === "Present"
          ? `t07-5-post-expected-${index + 1}`
          : row.expected_attendance_id,
      state,
      attendance:
        state === "Present"
          ? postEventAttendance(row.member_user_id, index)
          : null,
      disposition:
        state === "Excused" ? postEventDisposition(row, index) : null,
    };
  });

const POST_EVENT_GUEST_ROW: AttendanceRow = {
  ...GUEST_ROW,
  attendance_id: "t07-5-post-guest-attendance",
  event_id: ATTENDANCE_POST_EVENT.event_id,
  checked_in_at: "2020-09-01T10:08:00.000Z",
};

const ATTENDANCE_POST_EVENT_COUNTS: AttendanceRosterCounts = {
  expected: ATTENDANCE_POST_EVENT_EXPECTED_ROWS.length,
  present: 10,
  not_yet: 0,
  absent: 12,
  excused: 8,
  guests: 1,
};

const ATTENDANCE_COUNTS: AttendanceRosterCounts = {
  expected: ATTENDANCE_EXPECTED_ROWS.length,
  present: 1,
  not_yet: ATTENDANCE_EXPECTED_ROWS.length - 1,
  absent: 0,
  excused: 0,
  guests: 1,
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
  http.get("/api/v1/attendance/events/:eventId/roster", ({ params }) => {
    if (params.eventId === ATTENDANCE_POST_EVENT.event_id) {
      return envelope({
        event: ATTENDANCE_POST_EVENT,
        attendances: [
          ...ATTENDANCE_POST_EVENT_EXPECTED_ROWS.flatMap(({ attendance }) =>
            attendance ? [attendance] : []
          ),
          POST_EVENT_GUEST_ROW,
        ],
        guests: [POST_EVENT_GUEST_ROW],
        expected: ATTENDANCE_POST_EVENT_EXPECTED_ROWS,
        snapshot: {
          snapshot_id: "t07-5-post-snapshot",
          event_id: ATTENDANCE_POST_EVENT.event_id,
          materialized_at: "2020-09-01T10:00:00.000Z",
          last_materialized_at: "2020-09-01T10:00:00.000Z",
        },
        counts: ATTENDANCE_POST_EVENT_COUNTS,
        materialization_required: false,
      });
    }
    return envelope({
      event: ATTENDANCE_EVENT,
      attendances: [ATTENDANCE_ROW, GUEST_ROW],
      guests: [GUEST_ROW],
      expected: ATTENDANCE_EXPECTED_ROWS,
      snapshot: {
        snapshot_id: "t07-5-snapshot",
        event_id: ATTENDANCE_EVENT.event_id,
        materialized_at: "2099-09-01T10:00:00.000Z",
        last_materialized_at: "2099-09-01T10:00:00.000Z",
      },
      counts: ATTENDANCE_COUNTS,
      materialization_required: false,
    });
  }),
  http.get("/api/v1/attendance/events/:eventId/members", () =>
    envelope({ members: [ATTENDANCE_MEMBER, ATTENDANCE_ADDITION_MEMBER] })
  ),
  http.post("/api/v1/attendance/events/:eventId/check-in", () => result()),
  http.post("/api/v1/attendance/self", () => result()),
  http.post("/api/v1/attendance/guest", () => result()),
  http.post("/api/v1/attendance/:attendanceId/void", () => result()),
  http.patch("/api/v1/attendance/:attendanceId/guest-correction", () =>
    result()
  ),
];
