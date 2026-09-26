import { http, HttpResponse } from "msw";
import type { RequestHandler } from "msw";

import type {
  Department,
  DepartmentModule,
  Enrollment,
  EnrollmentRequest,
  EventDetail,
  ManagementAttention,
  ManagementCockpitView,
  ManagementDirectory,
  ManagementNotifications,
  ParticipantCatalogEntry,
  ParticipantCatalogProgram,
  ParticipantEventSummary,
  ParticipantEnrollment,
  ParticipantEnrollmentRequest,
  ParticipantProgramDetail,
  Program,
  ProgramEvent,
  ProgramSummary,
  PreviewResult,
  ScheduleException,
  ScheduleRule,
} from "@/lib/programs/program-api";
import { wallDaySpan } from "@/lib/programs/recurrence";

import { authMeHandler } from "./management-hub-fixtures";
import { memberAuthMeHandler } from "./public-auth-member-communications-fixtures";

const REQUEST_ID = "t07-3-storybook";
const PROGRAM_ID = "t07-3-program";
const DEPARTMENT_ID = "t07-3-department";
const EVENT_ID = "t07-3-event";
const ELIGIBLE_PROGRAM_ID = "t07-3-eligible-program";
const EXPLORATION_PROGRAM_ID = "t07-3-exploration-program";
const FAMILY_PROGRAM_ID = "t07-3-family-program";
const YOUTH_PROGRAM_ID = "t07-3-youth-program";
// Fixed and internally consistent so the synthetic renderer never drifts with
// the wall clock; the range is exactly three inclusive calendar months.
const STORY_PREVIEW_FROM = "2026-09-01";
const STORY_PREVIEW_TO = "2026-11-30";

const storyApi = (path: string) => `*${path}`;

const envelope = <T>(data: T) =>
  HttpResponse.json({ requestId: REQUEST_ID, data });

const DEPARTMENT: Department = {
  department_id: DEPARTMENT_ID,
  code: "T073",
  name: "培育部",
  description: "負責門徒培育及基礎訓練。",
  lifecycle: "Active",
  display_order: 1,
  created_at: "2026-01-08T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
  capabilities: {
    manage: true,
    publish: true,
    module_configure: true,
    role_read: true,
    role_assign: true,
    role_revoke: true,
  },
};

const DEPARTMENTS: Department[] = [
  DEPARTMENT,
  {
    department_id: "t07-3-department-pastoral",
    code: "T074",
    name: "牧養部",
    description: "負責小組同行及牧養關顧。",
    lifecycle: "Active",
    display_order: 2,
    created_at: "2026-01-08T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    capabilities: { manage: true, publish: true, module_configure: true },
  },
  {
    department_id: "t07-3-department-gospel",
    code: "T075",
    name: "福音部",
    description: "負責福音探索及社區接觸。",
    lifecycle: "Active",
    display_order: 3,
    created_at: "2026-01-08T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    capabilities: { manage: true, publish: true, module_configure: true },
  },
  {
    department_id: "t07-3-department-family",
    code: "T076",
    name: "家庭事工",
    description: "支援家庭在生活與信仰上的同行。",
    lifecycle: "Active",
    display_order: 4,
    created_at: "2026-01-08T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    capabilities: { manage: true, publish: true, module_configure: true },
  },
  {
    department_id: "t07-3-department-youth",
    code: "T077",
    name: "青年部",
    description: "負責青年領袖培訓及同行。",
    lifecycle: "Active",
    display_order: 5,
    created_at: "2026-01-08T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    capabilities: { manage: true, publish: true, module_configure: true },
  },
];

const MODULES: DepartmentModule[] = [
  "program_catalog",
  "enrollment",
  "events",
  "attendance",
].map((module_key) => ({
  department_id: DEPARTMENT_ID,
  module_key: module_key as DepartmentModule["module_key"],
  enabled: 1,
  enabled_at: "2026-09-01T00:00:00.000Z",
}));

const PROGRAM: Program = {
  program_id: PROGRAM_ID,
  department_id: DEPARTMENT_ID,
  name: "門徒訓練基礎課",
  description: "以福音根基、靈命操練及教會生活為主的基礎課程。",
  category: "門徒培育",
  behavior_type: "Recurring",
  lifecycle: "Active",
  discoverability: "Listed",
  enrollment_mode: "MemberRequest",
  display_order: 1,
  created_at: "2026-01-10T00:00:00.000Z",
  updated_at: "2026-09-03T00:00:00.000Z",
  capabilities: {
    manage: true,
    publish: true,
    enroll: false,
    leader_assign: true,
    role_read: true,
    role_assign: true,
    role_revoke: true,
  },
};

const PROGRAMS: Program[] = [
  PROGRAM,
  {
    ...PROGRAM,
    program_id: ELIGIBLE_PROGRAM_ID,
    department_id: "t07-3-department-pastoral",
    name: "同行成長小組",
    description: "以小組同行建立穩定的靈性操練及彼此支持。",
    category: "小組同行",
    display_order: 2,
  },
  {
    ...PROGRAM,
    program_id: EXPLORATION_PROGRAM_ID,
    department_id: "t07-3-department-gospel",
    name: "信仰探索班",
    description: "讓對信仰有興趣的朋友循序認識福音。",
    category: "福音探索",
    behavior_type: "OneOff",
    lifecycle: "Draft",
    display_order: 3,
  },
  {
    ...PROGRAM,
    program_id: FAMILY_PROGRAM_ID,
    department_id: "t07-3-department-family",
    name: "家庭同行系列",
    description: "支援家庭在生活與信仰上的同行。",
    category: "家庭事工",
    lifecycle: "Archived",
    discoverability: "Unlisted",
    display_order: 4,
  },
  {
    ...PROGRAM,
    program_id: YOUTH_PROGRAM_ID,
    department_id: "t07-3-department-youth",
    name: "青年領袖培訓",
    description: "裝備青年領袖承擔教會服事及同行工作。",
    category: "青年事工",
    enrollment_mode: "ManagerOnly",
    display_order: 5,
  },
];

const programSummary = (program: Program): ProgramSummary => ({
  program_id: program.program_id,
  department_id: program.department_id,
  name: program.name,
  description: program.description,
  category: program.category,
  behavior_type: program.behavior_type,
  lifecycle: program.lifecycle,
  discoverability: program.discoverability,
  enrollment_mode: program.enrollment_mode,
  display_order: program.display_order,
  created_at: program.created_at,
  updated_at: program.updated_at,
});

const departmentSummary = (department: Department) => ({
  department_id: department.department_id,
  code: department.code,
  name: department.name,
  description: department.description,
  lifecycle: department.lifecycle,
  display_order: department.display_order,
});

const PROGRAM_SUMMARY = programSummary(PROGRAM);
const ELIGIBLE_PROGRAM_SUMMARY = programSummary(
  PROGRAMS.find((program) => program.program_id === ELIGIBLE_PROGRAM_ID) ??
    PROGRAM
);

const PARTICIPANT_EVENT: ParticipantEventSummary = {
  event_id: EVENT_ID,
  program_id: PROGRAM_ID,
  starts_at: "2026-09-12T10:00:00.000Z",
  ends_at: "2026-09-12T11:30:00.000Z",
  status: "Active" as const,
  source: "SCHEDULE" as const,
  name: "門徒訓練聚會",
  location: "培育室",
  self_check_in_available: false,
};

const PARTICIPANT_NEXT_EVENT_DATES = [
  "2026-09-12",
  "2026-09-19",
  "2026-09-26",
  null,
  "2026-10-03",
] as const;

const PARTICIPANT_CATALOG: ParticipantCatalogEntry[] = PROGRAMS.map(
  (program, index) => ({
    department: departmentSummary(DEPARTMENTS[index] ?? DEPARTMENT),
    programs: [
      {
        ...programSummary(program),
        viewerState: [
          "active",
          "eligible",
          "pending",
          "archived",
          "managerOnly",
        ][index] as ParticipantCatalogProgram["viewerState"],
        nextEventStartsAt: PARTICIPANT_NEXT_EVENT_DATES[index]
          ? `${PARTICIPANT_NEXT_EVENT_DATES[index]}T10:00:00.000Z`
          : null,
        upcomingEventCount: index === 3 ? 0 : index === 2 ? 2 : 1,
      },
    ],
  })
);

const PARTICIPANT_DETAIL: ParticipantProgramDetail = {
  program: PROGRAM_SUMMARY,
  department: departmentSummary(DEPARTMENT),
  schedule_rules: [
    {
      rule_id: "t07-3-rule",
      recurrence: "WEEKLY",
      day_of_week: 6,
      month_day: null,
      start_time: "18:00",
      end_time: "19:30",
    },
  ],
  events: [PARTICIPANT_EVENT],
  enrollment: {
    requests: [],
    enrollments: [
      {
        enrollment_id: "t07-3-enrollment",
        status: "Active",
        enrolled_at: "2026-09-02T00:00:00.000Z",
        cancelled_at: null,
      },
    ],
  },
  enrollment_access: "Eligible",
};

const ELIGIBLE_PARTICIPANT_DETAIL: ParticipantProgramDetail = {
  program: ELIGIBLE_PROGRAM_SUMMARY,
  department: departmentSummary(
    DEPARTMENTS.find(
      (department) => department.department_id === "t07-3-department-pastoral"
    ) ?? DEPARTMENT
  ),
  schedule_rules: [
    {
      rule_id: "t07-3-eligible-rule",
      recurrence: "WEEKLY",
      day_of_week: 2,
      month_day: null,
      start_time: "19:30",
      end_time: "21:00",
    },
  ],
  events: [
    {
      ...PARTICIPANT_EVENT,
      event_id: "t07-3-eligible-event",
      program_id: ELIGIBLE_PROGRAM_ID,
      name: "同行小組聚會",
      location: "牧養室",
    },
  ],
  enrollment: null,
  enrollment_access: "Eligible",
};

const MANAGEMENT_EVENT: ProgramEvent = {
  event_id: EVENT_ID,
  program_id: PROGRAM_ID,
  program_name: PROGRAM.name,
  starts_at: PARTICIPANT_EVENT.starts_at,
  ends_at: PARTICIPANT_EVENT.ends_at,
  status: "Active",
  availability: "Active",
  source: "SCHEDULE",
  name: "門徒訓練週會",
  event_type: "訓練",
  location: "培育室",
  manual_check_in_code: null,
  check_in_window_opens_at: null,
  check_in_window_closes_at: null,
  cancel_reason: null,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-03T00:00:00.000Z",
  exception: null,
  recurrence_tag: "每週",
  has_attendance: false,
};

const EVENT_DETAIL: EventDetail = {
  event: MANAGEMENT_EVENT,
  leaders: [],
  participant_summary: { active_enrollments: 3, checked_in: 1 },
};

const MANUAL_MANAGEMENT_EVENT: ProgramEvent = {
  ...MANAGEMENT_EVENT,
  event_id: "t07-3-manual-event",
  // Fixed (never drifts with the wall clock) but safely in the future: the
  // current-filter story needs an upcoming Active event under the real clock,
  // and the presentation contract bans far-future demo-year literals.
  starts_at: "2030-09-19T10:00:00.000Z",
  ends_at: "2030-09-19T11:30:00.000Z",
  source: "MANUAL",
  name: "門徒分享聚會",
  event_type: "小組",
  recurrence_tag: "無",
};

const CANCELLED_MANAGEMENT_EVENT: ProgramEvent = {
  ...MANAGEMENT_EVENT,
  event_id: "t07-3-cancelled-event",
  starts_at: "2026-09-26T10:00:00.000Z",
  ends_at: "2026-09-26T11:30:00.000Z",
  status: "Cancelled",
  availability: "Inactive",
  name: "家庭同行特別聚會",
  event_type: "其他",
  cancel_reason: "場地安排調整",
};

const MANAGEMENT_EVENTS: ProgramEvent[] = [
  MANAGEMENT_EVENT,
  MANUAL_MANAGEMENT_EVENT,
  CANCELLED_MANAGEMENT_EVENT,
];

const MIXED_MANAGEMENT_EVENTS: ProgramEvent[] = [
  MANUAL_MANAGEMENT_EVENT,
  CANCELLED_MANAGEMENT_EVENT,
  MANAGEMENT_EVENT,
];

const MANAGEMENT_DIRECTORY: ManagementDirectory = {
  departments: DEPARTMENTS,
  programs: PROGRAMS,
};

const MANAGEMENT_COCKPIT: ManagementCockpitView = {
  program_id: PROGRAM_ID,
  updated_at: "2026-01-01T00:00:00.000Z",
  next_event: {
    event_id: EVENT_ID,
    program_id: PROGRAM_ID,
    title: MANAGEMENT_EVENT.name ?? PROGRAM.name,
    name: MANAGEMENT_EVENT.name ?? null,
    starts_at: MANAGEMENT_EVENT.starts_at,
    ends_at: MANAGEMENT_EVENT.ends_at,
    location: MANAGEMENT_EVENT.location ?? null,
    source: "SCHEDULE",
    is_recurring: true,
    checked_in_count: 1,
    roster_count: 3,
  },
  active_event_count: 12,
  pending_enrollment_count: 2,
};

const MANAGEMENT_ATTENTION: ManagementAttention = {
  programs: PROGRAMS.map((program, index) => ({
    program_id: program.program_id,
    department_id: program.department_id,
    pending_enrollment_count: index === 0 ? 2 : 0,
    inactive_event_count: index === 3 ? 1 : 0,
    cancelled_event_count: index === 3 ? 1 : 0,
    actionable_count: index === 0 || index === 3 ? 2 : 0,
  })),
  items: [
    {
      kind: "enrollment",
      actionable: true,
      count: 2,
      program_id: PROGRAM_ID,
      program_name: PROGRAM.name,
      department_id: DEPARTMENT_ID,
      department_name: DEPARTMENT.name,
    },
    {
      kind: "event",
      actionable: true,
      event_id: CANCELLED_MANAGEMENT_EVENT.event_id,
      program_id: PROGRAM_ID,
      program_name: PROGRAM.name,
      department_id: DEPARTMENT_ID,
      department_name: DEPARTMENT.name,
      starts_at: CANCELLED_MANAGEMENT_EVENT.starts_at,
      status: "Cancelled",
      availability: "Inactive",
      name: CANCELLED_MANAGEMENT_EVENT.name ?? null,
    },
  ],
  total_actionable_count: 4,
  has_more: false,
};

const MANAGEMENT_NOTIFICATIONS: ManagementNotifications = {
  items: [
    {
      kind: "enrollment",
      source_key: "t07-3-notification-1",
      source_revision: "1",
      read: false,
      actionable: true,
      count: 2,
      latest_submitted_at: "2026-09-09T02:00:00.000Z",
      program_id: PROGRAM_ID,
      program_name: PROGRAM.name,
      department_id: DEPARTMENT_ID,
      department_name: DEPARTMENT.name,
    },
    {
      kind: "event",
      source_key: "t07-3-notification-2",
      source_revision: "1",
      read: false,
      actionable: true,
      event_id: MANUAL_MANAGEMENT_EVENT.event_id,
      program_id: PROGRAM_ID,
      program_name: PROGRAM.name,
      department_id: DEPARTMENT_ID,
      department_name: DEPARTMENT.name,
      starts_at: MANUAL_MANAGEMENT_EVENT.starts_at,
      status: "Active",
      availability: "Active",
      name: MANUAL_MANAGEMENT_EVENT.name ?? null,
      updated_at: "2026-09-05T00:00:00.000Z",
    },
    {
      kind: "event",
      source_key: "t07-3-notification-3",
      source_revision: "1",
      read: false,
      actionable: false,
      event_id: CANCELLED_MANAGEMENT_EVENT.event_id,
      program_id: PROGRAM_ID,
      program_name: PROGRAM.name,
      department_id: DEPARTMENT_ID,
      department_name: DEPARTMENT.name,
      starts_at: CANCELLED_MANAGEMENT_EVENT.starts_at,
      status: "Cancelled",
      availability: "Inactive",
      name: CANCELLED_MANAGEMENT_EVENT.name ?? null,
      updated_at: "2026-09-06T00:00:00.000Z",
    },
    {
      kind: "enrollment",
      source_key: "t07-3-notification-read",
      source_revision: "1",
      read: true,
      actionable: true,
      count: 1,
      latest_submitted_at: "2026-09-01T02:00:00.000Z",
      program_id: ELIGIBLE_PROGRAM_ID,
      program_name: "同行成長小組",
      department_id: "t07-3-department-pastoral",
      department_name: "牧養部",
    },
  ],
  unread_count: 3,
  has_more: false,
};

const EMPTY_MANAGEMENT_NOTIFICATIONS: ManagementNotifications = {
  items: [],
  unread_count: 0,
  has_more: false,
};

type NotificationFixtureScenario = "default" | "empty-recoverable";

const copyManagementNotifications = (
  source: ManagementNotifications
): ManagementNotifications => ({
  ...source,
  items: source.items.map((item) => ({ ...item })),
});

const createNotificationHandlers = (
  scenario: NotificationFixtureScenario = "default"
): readonly RequestHandler[] => {
  let readState = copyManagementNotifications(
    scenario === "empty-recoverable"
      ? EMPTY_MANAGEMENT_NOTIFICATIONS
      : MANAGEMENT_NOTIFICATIONS
  );
  let readAttempts = 0;
  if (typeof document !== "undefined" && document.body) {
    delete document.body.dataset.programsNotificationsReadPayload;
  }

  return [
    http.get(storyApi("/api/v1/programs/notifications"), () => {
      if (scenario === "empty-recoverable" && readAttempts === 0) {
        readAttempts += 1;
        return HttpResponse.json(
          {
            status: 503,
            code: "UNAVAILABLE",
            title: "Unavailable",
            detail: "通知暫時未能載入，請稍後再試。",
          },
          { status: 503 }
        );
      }
      return envelope(readState);
    }),
    http.post(
      storyApi("/api/v1/programs/notifications/read"),
      async ({ request }) => {
        const payload = (await request.json()) as {
          items?: readonly {
            source_key: string;
            source_revision: string;
          }[];
        };
        if (typeof document !== "undefined" && document.body) {
          document.body.dataset.programsNotificationsReadPayload =
            JSON.stringify(
              (payload.items ?? []).map(({ source_key, source_revision }) => ({
                source_key,
                source_revision,
              }))
            );
        }
        const requested = new Set(
          (payload.items ?? []).map(
            ({ source_key, source_revision }) =>
              `${source_key}:${source_revision}`
          )
        );
        const items = readState.items.map((item) =>
          requested.has(`${item.source_key}:${item.source_revision}`)
            ? { ...item, read: true }
            : item
        );
        readState = {
          ...readState,
          items,
          unread_count: items.filter((item) => !item.read).length,
        };
        return envelope({
          marked_count: items.filter((item) =>
            requested.has(`${item.source_key}:${item.source_revision}`)
          ).length,
        });
      }
    ),
  ];
};

const SCHEDULE_RULE: ScheduleRule = {
  rule_id: "t07-3-rule",
  program_id: PROGRAM_ID,
  recurrence: "WEEKLY",
  day_of_week: 6,
  month_day: null,
  start_time: "18:00",
  end_time: "19:30",
  location: "培育室",
  created_by: "t07-3-manager",
  created_at: "2026-09-01T00:00:00.000Z",
  updated_by: "t07-3-manager",
  updated_at: "2026-09-03T00:00:00.000Z",
};

const SCHEDULE_PREVIEW: PreviewResult = {
  plan: {
    plan_id: "t07-3-plan",
    program_id: PROGRAM_ID,
    plan_hash: "t07-3-plan-hash",
    horizon_days: 91,
    from_date: STORY_PREVIEW_FROM,
    to_date: STORY_PREVIEW_TO,
    rule_count: 2,
    created_at: "2026-09-03T00:00:00.000Z",
  },
  occurrences: [
    {
      occurrence_id: "t07-3-rule:2026-09-12",
      plan_id: "t07-3-plan",
      rule_id: SCHEDULE_RULE.rule_id,
      occurs_on: "2026-09-12",
      starts_at: "2026-09-12T10:00:00.000Z",
      ends_at: "2026-09-12T11:30:00.000Z",
      location: SCHEDULE_RULE.location,
      skip_reason: null,
      exception_id: null,
    },
    {
      occurrence_id: "t07-3-rule:2026-09-19",
      plan_id: "t07-3-plan",
      rule_id: SCHEDULE_RULE.rule_id,
      occurs_on: "2026-09-19",
      starts_at: "2026-09-19T10:00:00.000Z",
      ends_at: "2026-09-19T11:30:00.000Z",
      location: SCHEDULE_RULE.location,
      skip_reason: null,
      exception_id: null,
    },
  ],
};

const SCHEDULE_EXCEPTIONS: ScheduleException[] = [
  {
    exception_id: "t07-3-exception-cancel",
    rule_id: SCHEDULE_RULE.rule_id,
    override_date: "2026-09-26",
    action: "CANCEL",
    new_start_time: null,
    new_end_time: null,
    created_by: "t07-3-manager",
    created_at: "2026-09-04T00:00:00.000Z",
  },
];

const PENDING_PARTICIPANT_DETAIL: ParticipantProgramDetail = {
  ...PARTICIPANT_DETAIL,
  enrollment: {
    requests: [
      {
        request_id: "t07-3-pending-request",
        status: "Pending",
        submitted_at: "2026-09-09T02:00:00.000Z",
        decided_at: null,
      },
    ],
    enrollments: [],
  },
};

const REJECTED_PARTICIPANT_DETAIL: ParticipantProgramDetail = {
  ...PARTICIPANT_DETAIL,
  enrollment: {
    requests: [
      {
        request_id: "t07-3-rejected-request",
        status: "Rejected",
        submitted_at: "2026-08-28T02:00:00.000Z",
        decided_at: "2026-08-29T02:00:00.000Z",
      },
    ],
    enrollments: [],
  },
};

const OPEN_EVENT_DETAIL: EventDetail = {
  ...EVENT_DETAIL,
  event: {
    ...EVENT_DETAIL.event,
    check_in_window_opens_at: "2026-09-01T00:00:00.000Z",
    check_in_window_closes_at: "2026-09-30T00:00:00.000Z",
  },
};

const forbiddenEventHandler = () =>
  http.get("/api/v1/programs/:programId/events/:eventId", () =>
    HttpResponse.json(
      {
        type: "about:blank",
        title: "Forbidden",
        status: 403,
        code: "FORBIDDEN",
        detail: "你未獲授權參與此聚會。",
        requestId: REQUEST_ID,
      },
      {
        status: 403,
        headers: { "X-Request-Id": REQUEST_ID },
      }
    )
  );

const PARTICIPANT_REQUESTS = [
  {
    request_id: "t07-3-pending-request-1",
    program_id: PROGRAM_ID,
    member_user_id: "t07-3-member-1",
    status: "Pending" as const,
    submitted_at: "2026-09-09T02:00:00.000Z",
    decided_by: null,
    decided_at: null,
    decision_note: null,
    request_version: 1,
    member_name: "陳小明",
    member_username: "chan.ming",
  },
  {
    request_id: "t07-3-pending-request-2",
    program_id: PROGRAM_ID,
    member_user_id: "t07-3-member-2",
    status: "Pending" as const,
    submitted_at: "2026-09-08T02:00:00.000Z",
    decided_by: null,
    decided_at: null,
    decision_note: null,
    request_version: 1,
    member_name: "李欣怡",
    member_username: "lee.yan",
  },
];

const PARTICIPANT_ENROLLMENTS = [
  {
    enrollment_id: "t07-3-enrollment-1",
    program_id: PROGRAM_ID,
    member_user_id: "t07-3-member-3",
    request_id: null,
    status: "Active" as const,
    enrolled_at: "2026-08-20T02:00:00.000Z",
    cancelled_at: null,
    cancelled_by: null,
    created_by: "t07-3-manager",
    created_at: "2026-08-20T02:00:00.000Z",
    member_name: "王恩慈",
    member_username: "wong.grace",
  },
  {
    enrollment_id: "t07-3-enrollment-2",
    program_id: PROGRAM_ID,
    member_user_id: "t07-3-member-4",
    request_id: null,
    status: "Cancelled" as const,
    enrolled_at: "2026-07-20T02:00:00.000Z",
    cancelled_at: "2026-08-30T02:00:00.000Z",
    cancelled_by: "t07-3-manager",
    created_by: "t07-3-manager",
    created_at: "2026-07-20T02:00:00.000Z",
    member_name: "黃志成",
    member_username: "wong.chi",
  },
];

const createParticipantProgramHandlers = (
  hasManagementCapability = false
): readonly RequestHandler[] => [
  hasManagementCapability ? authMeHandler : memberAuthMeHandler,
  http.get(storyApi("/api/v1/programs/access"), () =>
    envelope({
      hasManagementCapability,
      departmentScopes: hasManagementCapability ? 1 : 0,
      programScopes: hasManagementCapability ? 1 : 0,
    })
  ),
  http.get(storyApi("/api/v1/programs/catalog"), () =>
    envelope({ catalog: PARTICIPANT_CATALOG })
  ),
  http.get(
    storyApi("/api/v1/programs/:programId/participant-detail"),
    ({ params }) =>
      envelope({
        detail:
          String(params.programId) === ELIGIBLE_PROGRAM_ID
            ? ELIGIBLE_PARTICIPANT_DETAIL
            : PARTICIPANT_DETAIL,
      })
  ),
  http.get(storyApi("/api/v1/programs/:programId/events/:eventId"), () =>
    envelope(EVENT_DETAIL)
  ),
  http.get(storyApi("/api/v1/attendance/events/:eventId/me"), () =>
    envelope({
      event: EVENT_DETAIL.event,
      state: "Not Yet",
      attendance: null,
      disposition: null,
    })
  ),
];

type ScheduleFixtureScenario = "default" | "stale" | "partial-resume";

const previewWithPlan = (
  planId: string,
  fromDate = STORY_PREVIEW_FROM,
  toDate = STORY_PREVIEW_TO
): PreviewResult => ({
  ...SCHEDULE_PREVIEW,
  plan: {
    ...SCHEDULE_PREVIEW.plan,
    plan_id: planId,
    plan_hash: `${planId}-hash`,
    from_date: fromDate,
    to_date: toDate,
    horizon_days: wallDaySpan(fromDate, toDate),
  },
  occurrences: SCHEDULE_PREVIEW.occurrences.map((occurrence) => ({
    ...occurrence,
    plan_id: planId,
  })),
});

const createScheduleHandlers = (
  scenario: ScheduleFixtureScenario = "default"
): readonly RequestHandler[] => {
  let previewCount = 0;
  let currentPlan = SCHEDULE_PREVIEW;
  let generateCount = 0;
  let generateRequests: {
    requestPlanId: string;
    responsePlanId: string;
    responseRunId: string;
  }[] = [];
  if (typeof document !== "undefined" && document.body) {
    delete document.body.dataset.programsScheduleGenerateRequests;
  }

  const recordGenerateRequest = (
    requestPlanId: string,
    responsePlanId: string,
    responseRunId: string
  ) => {
    generateRequests = [
      ...generateRequests,
      { requestPlanId, responsePlanId, responseRunId },
    ];
    if (typeof document !== "undefined" && document.body) {
      document.body.dataset.programsScheduleGenerateRequests =
        JSON.stringify(generateRequests);
    }
  };

  return [
    http.post(
      storyApi("/api/v1/programs/:programId/events/preview"),
      async ({ request }) => {
        const payload = (await request.json().catch(() => ({}))) as {
          from_date?: unknown;
          until_date?: unknown;
        };
        const fromDate =
          typeof payload.from_date === "string"
            ? payload.from_date
            : STORY_PREVIEW_FROM;
        const toDate =
          typeof payload.until_date === "string"
            ? payload.until_date
            : STORY_PREVIEW_TO;
        previewCount += 1;
        currentPlan =
          scenario === "stale"
            ? previewWithPlan(
                previewCount === 1 ? "t07-3-stale-plan" : "t07-3-fresh-plan",
                fromDate,
                toDate
              )
            : previewWithPlan("t07-3-plan", fromDate, toDate);
        return envelope(currentPlan);
      }
    ),
    http.post(
      storyApi("/api/v1/programs/:programId/events/generate"),
      async ({ request }) => {
        const payload = (await request.json()) as { plan_id?: string };
        generateCount += 1;
        if (scenario === "stale" && previewCount < 2) {
          return HttpResponse.json(
            {
              status: 409,
              code: "STALE_PLAN",
              title: "Stale plan",
              detail: "排程已有更新，請先重新預覽。",
            },
            { status: 409 }
          );
        }
        if (scenario === "partial-resume" && generateCount === 1) {
          recordGenerateRequest(
            payload.plan_id ?? "<missing>",
            currentPlan.plan.plan_id,
            "t07-3-partial-run"
          );
          return envelope({
            generated: {
              run_id: "t07-3-partial-run",
              plan_id: currentPlan.plan.plan_id,
              status: "partial" as const,
              created: 1,
              skipped: 0,
              failed: 1,
              resumed: false,
            },
          });
        }
        const runId =
          scenario === "partial-resume" ? "t07-3-partial-run" : "t07-3-run";
        recordGenerateRequest(
          payload.plan_id ?? "<missing>",
          currentPlan.plan.plan_id,
          runId
        );
        return envelope({
          generated: {
            run_id: runId,
            plan_id: currentPlan.plan.plan_id,
            status: "completed" as const,
            created: scenario === "partial-resume" ? 0 : 2,
            skipped: scenario === "partial-resume" ? 1 : 0,
            failed: 0,
            resumed: scenario === "partial-resume",
          },
        });
      }
    ),
  ];
};

const createManagementProgramHandlers = ({
  events = MANAGEMENT_EVENTS,
  scheduleScenario = "default",
  notificationScenario = "default",
}: {
  events?: readonly ProgramEvent[];
  scheduleScenario?: ScheduleFixtureScenario;
  notificationScenario?: NotificationFixtureScenario;
} = {}): readonly RequestHandler[] => [
  authMeHandler,
  http.get("/api/v1/programs/access", () =>
    envelope({
      hasManagementCapability: true,
      departmentScopes: 5,
      programScopes: 5,
    })
  ),
  http.get("/api/v1/programs/management-directory", () =>
    envelope(MANAGEMENT_DIRECTORY)
  ),
  http.get("/api/v1/programs/departments", () =>
    envelope({ departments: DEPARTMENTS })
  ),
  http.get("/api/v1/programs/departments/:departmentId", ({ params }) => {
    const department =
      DEPARTMENTS.find(
        (candidate) => candidate.department_id === String(params.departmentId)
      ) ?? DEPARTMENT;
    return envelope({
      department,
      modules: MODULES.map((module) => ({
        ...module,
        department_id: department.department_id,
      })),
    });
  }),
  http.get("/api/v1/programs/attention", () => envelope(MANAGEMENT_ATTENTION)),
  ...createNotificationHandlers(notificationScenario),
  http.get("/api/v1/programs/:programId/management", () =>
    envelope({
      program: PROGRAM,
      department: DEPARTMENT,
      modules: MODULES,
      cockpit: MANAGEMENT_COCKPIT,
    })
  ),
  http.get("/api/v1/programs/:programId/events", () => envelope({ events })),
  http.get("/api/v1/programs/:programId/events/:eventId", ({ params }) => {
    const event =
      events.find((candidate) => candidate.event_id === params.eventId) ??
      MANAGEMENT_EVENT;
    return envelope({ ...EVENT_DETAIL, event });
  }),
  http.get("/api/v1/programs/:programId/enrollment-requests", () =>
    envelope({ requests: PARTICIPANT_REQUESTS })
  ),
  http.get("/api/v1/programs/:programId/enrollment-approval-runs", () =>
    envelope({ runs: [] })
  ),
  http.get("/api/v1/programs/:programId/enrollments", () =>
    envelope({ enrollments: PARTICIPANT_ENROLLMENTS })
  ),
  http.get("/api/v1/programs/:programId/enrollment-snapshot", () =>
    envelope({
      requests: PARTICIPANT_REQUESTS,
      enrollments: PARTICIPANT_ENROLLMENTS,
    })
  ),
  http.get("/api/v1/programs/:programId/schedule-rules", () =>
    envelope({ rules: [SCHEDULE_RULE] })
  ),
  http.get(
    "/api/v1/programs/:programId/schedule-rules/:ruleId/exceptions",
    () => envelope({ exceptions: SCHEDULE_EXCEPTIONS })
  ),
  ...createScheduleHandlers(scheduleScenario),
];

const withScenarioHandlers = (
  base: readonly RequestHandler[],
  ...overrides: RequestHandler[]
): readonly RequestHandler[] => [...overrides, ...base];

type ParticipantMutationScenario =
  | "eligible"
  | "active"
  | "pending"
  | "rejected";

const participantRequestView = (
  request: EnrollmentRequest
): ParticipantEnrollmentRequest => ({
  request_id: request.request_id,
  status: request.status,
  submitted_at: request.submitted_at,
  decided_at: request.decided_at,
});

const participantEnrollmentView = (
  enrollment: Enrollment
): ParticipantEnrollment => ({
  enrollment_id: enrollment.enrollment_id,
  status: enrollment.status,
  enrolled_at: enrollment.enrolled_at,
  cancelled_at: enrollment.cancelled_at,
});

const createParticipantBehaviorHandlers = (
  scenario: ParticipantMutationScenario
): readonly RequestHandler[] => {
  const programId = scenario === "eligible" ? ELIGIBLE_PROGRAM_ID : PROGRAM_ID;
  const initialDetail =
    scenario === "eligible"
      ? ELIGIBLE_PARTICIPANT_DETAIL
      : scenario === "pending"
        ? PENDING_PARTICIPANT_DETAIL
        : scenario === "rejected"
          ? REJECTED_PARTICIPANT_DETAIL
          : PARTICIPANT_DETAIL;
  let detail = structuredClone(initialDetail);

  const detailHandler = http.get(
    storyApi("/api/v1/programs/:programId/participant-detail"),
    ({ params }) =>
      String(params.programId) === programId
        ? envelope({ detail })
        : HttpResponse.json({ status: 404 }, { status: 404 })
  );

  if (scenario === "eligible" || scenario === "rejected") {
    const request: EnrollmentRequest = {
      request_id:
        scenario === "eligible"
          ? "t07-3-eligible-request"
          : "t07-3-reenrollment-request",
      program_id: programId,
      member_user_id: "t07-3-member",
      status: "Pending",
      submitted_at: "2026-09-11T02:00:00.000Z",
      decided_by: null,
      decided_at: null,
      decision_note: null,
      request_version: 1,
    };
    return withScenarioHandlers(
      createParticipantProgramHandlers(),
      detailHandler,
      http.post(
        storyApi("/api/v1/programs/:programId/enrollment-requests"),
        ({ params }) => {
          if (String(params.programId) !== programId) {
            return HttpResponse.json({ status: 404 }, { status: 404 });
          }
          detail = {
            ...detail,
            enrollment: {
              requests: [
                ...(detail.enrollment?.requests ?? []),
                participantRequestView(request),
              ],
              enrollments: detail.enrollment?.enrollments ?? [],
            },
          };
          return envelope({ request });
        }
      )
    );
  }

  if (scenario === "pending") {
    const request: EnrollmentRequest = {
      request_id: "t07-3-pending-request",
      program_id: programId,
      member_user_id: "t07-3-member",
      status: "Withdrawn",
      submitted_at: "2026-09-09T02:00:00.000Z",
      decided_by: "t07-3-member",
      decided_at: "2026-09-11T02:00:00.000Z",
      decision_note: null,
      request_version: 2,
    };
    return withScenarioHandlers(
      createParticipantProgramHandlers(),
      detailHandler,
      http.post(
        storyApi(
          "/api/v1/programs/:programId/enrollment-requests/:requestId/withdraw"
        ),
        ({ params }) => {
          if (
            String(params.programId) !== programId ||
            String(params.requestId) !== request.request_id
          ) {
            return HttpResponse.json({ status: 404 }, { status: 404 });
          }
          detail = {
            ...detail,
            enrollment: {
              requests: [participantRequestView(request)],
              enrollments: detail.enrollment?.enrollments ?? [],
            },
          };
          return envelope({ request });
        }
      )
    );
  }

  const enrollment: Enrollment = {
    enrollment_id: "t07-3-enrollment",
    program_id: programId,
    member_user_id: "t07-3-member",
    request_id: null,
    status: "Cancelled",
    enrolled_at: "2026-09-02T00:00:00.000Z",
    cancelled_at: "2026-09-11T02:00:00.000Z",
    cancelled_by: "t07-3-member",
    created_by: "t07-3-manager",
    created_at: "2026-09-02T00:00:00.000Z",
  };
  return withScenarioHandlers(
    createParticipantProgramHandlers(),
    detailHandler,
    http.post(
      storyApi("/api/v1/programs/:programId/enrollments/:enrollmentId/cancel"),
      ({ params }) => {
        if (
          String(params.programId) !== programId ||
          String(params.enrollmentId) !== enrollment.enrollment_id
        ) {
          return HttpResponse.json({ status: 404 }, { status: 404 });
        }
        detail = {
          ...detail,
          enrollment: {
            requests: detail.enrollment?.requests ?? [],
            enrollments: [participantEnrollmentView(enrollment)],
          },
        };
        return envelope({ enrollment });
      }
    )
  );
};

const CONFLICT_REFRESHED_PROGRAM: Program = {
  ...PROGRAM,
  name: "伺服器最新課程",
  updated_at: "2026-09-12T00:00:00.000Z",
};

const conflictProgramHandlers = (): readonly RequestHandler[] => {
  let attempts = 0;
  let authoritativeProgram = PROGRAM;
  if (typeof document !== "undefined" && document.body) {
    delete document.body.dataset.programsSettingsPatchAttempts;
  }
  return [
    http.get("/api/v1/programs/:programId/management", () =>
      envelope({
        program: authoritativeProgram,
        department: DEPARTMENT,
        modules: MODULES,
        cockpit: MANAGEMENT_COCKPIT,
      })
    ),
    http.patch(storyApi("/api/v1/programs/:programId"), async ({ request }) => {
      attempts += 1;
      if (typeof document !== "undefined" && document.body) {
        document.body.dataset.programsSettingsPatchAttempts = String(attempts);
      }
      if (attempts === 1) {
        authoritativeProgram = CONFLICT_REFRESHED_PROGRAM;
        return HttpResponse.json(
          {
            status: 409,
            code: "CONFLICT",
            title: "Conflict",
            detail: "伺服器資料已有更新，請重新載入後再儲存。",
          },
          { status: 409 }
        );
      }
      const patch = (await request.json()) as Partial<Program>;
      authoritativeProgram = { ...authoritativeProgram, ...patch };
      return envelope({ program: authoritativeProgram });
    }),
  ];
};

export const programsParticipantHandlers = createParticipantProgramHandlers();
export const programsManagementHandlers = createManagementProgramHandlers();

export const PROGRAMS_MATERIAL_SCENARIO_NAMES = [
  "participant-directory-member",
  "participant-directory-capable",
  "participant-program-detail-active",
  "participant-program-detail-eligible",
  "participant-program-detail-pending",
  "participant-program-detail-rejected",
  "participant-event-detail-closed",
  "participant-event-detail-open",
  "participant-event-detail-ineligible",
  "management-directory-mixed",
  "workspace-overview-populated",
  "workspace-overview-zero",
  "workspace-events-mixed",
  "workspace-participants-pending",
  "workspace-settings-dirty",
  "workspace-settings-conflict",
  "workspace-schedule-focused",
  "workspace-schedule-stale",
  "workspace-schedule-partial-resume",
  "notifications-unread",
  "notifications-empty-recoverable",
] as const;

export type ProgramsMaterialScenarioName =
  (typeof PROGRAMS_MATERIAL_SCENARIO_NAMES)[number];

export interface ProgramsStoryScenario {
  readonly pathname: "/programs";
  readonly query: Readonly<Record<string, string>>;
  readonly handlers: readonly RequestHandler[];
}

const storyScenario = (
  query: Readonly<Record<string, string>>,
  handlers: readonly RequestHandler[]
): ProgramsStoryScenario => ({
  pathname: "/programs",
  query,
  handlers,
});

const PROGRAMS_STORY_SCENARIO_FACTORIES: Readonly<
  Record<ProgramsMaterialScenarioName, () => ProgramsStoryScenario>
> = {
  "participant-directory-member": () =>
    storyScenario({}, createParticipantProgramHandlers()),
  "participant-directory-capable": () =>
    storyScenario({}, createParticipantProgramHandlers(true)),
  "participant-program-detail-active": () =>
    storyScenario(
      { program: PROGRAM_ID },
      createParticipantBehaviorHandlers("active")
    ),
  "participant-program-detail-eligible": () =>
    storyScenario(
      { program: ELIGIBLE_PROGRAM_ID },
      createParticipantBehaviorHandlers("eligible")
    ),
  "participant-program-detail-pending": () =>
    storyScenario(
      { program: PROGRAM_ID },
      createParticipantBehaviorHandlers("pending")
    ),
  "participant-program-detail-rejected": () =>
    storyScenario(
      { program: PROGRAM_ID },
      createParticipantBehaviorHandlers("rejected")
    ),
  "participant-event-detail-closed": () =>
    storyScenario(
      { event: EVENT_ID, program: PROGRAM_ID },
      createParticipantProgramHandlers()
    ),
  "participant-event-detail-open": () =>
    storyScenario(
      { event: EVENT_ID, program: PROGRAM_ID },
      withScenarioHandlers(
        createParticipantProgramHandlers(),
        http.get("/api/v1/programs/:programId/events/:eventId", () =>
          envelope(OPEN_EVENT_DETAIL)
        )
      )
    ),
  "participant-event-detail-ineligible": () =>
    storyScenario(
      { event: EVENT_ID, program: PROGRAM_ID },
      withScenarioHandlers(
        createParticipantProgramHandlers(),
        forbiddenEventHandler()
      )
    ),
  "management-directory-mixed": () =>
    storyScenario({ mode: "management" }, createManagementProgramHandlers()),
  "workspace-overview-populated": () =>
    storyScenario(
      { mode: "management", program: PROGRAM_ID },
      createManagementProgramHandlers()
    ),
  "workspace-overview-zero": () =>
    storyScenario(
      { mode: "management", program: PROGRAM_ID },
      withScenarioHandlers(
        createManagementProgramHandlers(),
        http.get("/api/v1/programs/:programId/management", () =>
          envelope({
            program: PROGRAM,
            department: DEPARTMENT,
            modules: MODULES,
            cockpit: {
              ...MANAGEMENT_COCKPIT,
              next_event: null,
              active_event_count: 0,
              pending_enrollment_count: 0,
            },
          })
        )
      )
    ),
  "workspace-events-mixed": () =>
    storyScenario(
      { mode: "management", program: PROGRAM_ID, task: "events" },
      createManagementProgramHandlers({ events: MIXED_MANAGEMENT_EVENTS })
    ),
  "workspace-participants-pending": () =>
    storyScenario(
      { mode: "management", program: PROGRAM_ID, task: "participants" },
      createManagementProgramHandlers()
    ),
  "workspace-settings-dirty": () =>
    storyScenario(
      { mode: "management", program: PROGRAM_ID, task: "settings" },
      createManagementProgramHandlers()
    ),
  "workspace-settings-conflict": () =>
    storyScenario(
      { mode: "management", program: PROGRAM_ID, task: "settings" },
      withScenarioHandlers(
        createManagementProgramHandlers(),
        ...conflictProgramHandlers()
      )
    ),
  "workspace-schedule-focused": () =>
    storyScenario(
      { mode: "management", program: PROGRAM_ID, task: "schedule" },
      createManagementProgramHandlers()
    ),
  "workspace-schedule-stale": () =>
    storyScenario(
      { mode: "management", program: PROGRAM_ID, task: "schedule" },
      createManagementProgramHandlers({ scheduleScenario: "stale" })
    ),
  "workspace-schedule-partial-resume": () =>
    storyScenario(
      { mode: "management", program: PROGRAM_ID, task: "schedule" },
      createManagementProgramHandlers({ scheduleScenario: "partial-resume" })
    ),
  "notifications-unread": () =>
    storyScenario(
      { mode: "management", task: "notifications" },
      createManagementProgramHandlers()
    ),
  "notifications-empty-recoverable": () =>
    storyScenario(
      { mode: "management", task: "notifications" },
      createManagementProgramHandlers({
        notificationScenario: "empty-recoverable",
      })
    ),
};

export function getProgramsStoryScenario(
  name: ProgramsMaterialScenarioName
): ProgramsStoryScenario {
  return PROGRAMS_STORY_SCENARIO_FACTORIES[name]();
}
