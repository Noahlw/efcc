import { http, HttpResponse } from "msw";
import type { RequestHandler } from "msw";

import type {
  Department,
  DepartmentModule,
  EventDetail,
  ManagementAttention,
  ManagementCockpitView,
  ManagementDirectory,
  ManagementNotifications,
  ParticipantCatalogEntry,
  ParticipantProgramDetail,
  Program,
  ProgramEvent,
  ProgramSummary,
  PreviewResult,
  ScheduleRule,
} from "@/lib/programs/program-api";

import { authMeHandler } from "./management-hub-fixtures";
import { memberAuthMeHandler } from "./public-auth-member-communications-fixtures";

const REQUEST_ID = "t07-3-storybook";
const PROGRAM_ID = "t07-3-program";
const DEPARTMENT_ID = "t07-3-department";
const EVENT_ID = "t07-3-event";

const envelope = <T>(data: T) =>
  HttpResponse.json({ requestId: REQUEST_ID, data });

const DEPARTMENT: Department = {
  department_id: DEPARTMENT_ID,
  code: "T073",
  name: "Storybook Programs Department",
  description: "Synthetic management scope for T07.3.",
  lifecycle: "Active",
  display_order: 1,
  created_at: "2099-09-01T00:00:00.000Z",
  updated_at: "2099-09-01T00:00:00.000Z",
  capabilities: {
    manage: true,
    publish: true,
    module_configure: true,
    role_read: true,
    role_assign: true,
    role_revoke: true,
  },
};

const MODULES: DepartmentModule[] = [
  "program_catalog",
  "enrollment",
  "events",
  "attendance",
].map((module_key) => ({
  department_id: DEPARTMENT_ID,
  module_key: module_key as DepartmentModule["module_key"],
  enabled: 1,
  enabled_at: "2099-09-01T00:00:00.000Z",
}));

const PROGRAM: Program = {
  program_id: PROGRAM_ID,
  department_id: DEPARTMENT_ID,
  name: "Storybook Programs Workshop",
  description: "Synthetic programme for the Programs presentation catalog.",
  category: "Community",
  behavior_type: "Recurring",
  lifecycle: "Active",
  discoverability: "Listed",
  enrollment_mode: "MemberRequest",
  display_order: 1,
  created_at: "2099-09-01T00:00:00.000Z",
  updated_at: "2099-09-01T00:00:00.000Z",
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

const PROGRAM_SUMMARY: ProgramSummary = {
  program_id: PROGRAM_ID,
  department_id: DEPARTMENT_ID,
  name: PROGRAM.name,
  description: PROGRAM.description,
  category: PROGRAM.category,
  behavior_type: PROGRAM.behavior_type,
  lifecycle: PROGRAM.lifecycle,
  discoverability: PROGRAM.discoverability,
  enrollment_mode: PROGRAM.enrollment_mode,
  display_order: PROGRAM.display_order,
  created_at: PROGRAM.created_at,
  updated_at: PROGRAM.updated_at,
};

const PARTICIPANT_EVENT = {
  event_id: EVENT_ID,
  program_id: PROGRAM_ID,
  starts_at: "2099-09-12T10:00:00.000Z",
  ends_at: "2099-09-12T11:30:00.000Z",
  status: "Active" as const,
  source: "SCHEDULE" as const,
  name: "Storybook participant gathering",
  location: "Storybook Hall",
  self_check_in_available: true,
};

const PARTICIPANT_CATALOG: ParticipantCatalogEntry[] = [
  {
    department: {
      department_id: DEPARTMENT_ID,
      code: DEPARTMENT.code,
      name: DEPARTMENT.name,
      description: DEPARTMENT.description,
      lifecycle: DEPARTMENT.lifecycle,
      display_order: DEPARTMENT.display_order,
    },
    programs: [
      {
        ...PROGRAM_SUMMARY,
        viewerState: "active",
        nextEventStartsAt: PARTICIPANT_EVENT.starts_at,
        upcomingEventCount: 1,
      },
    ],
  },
];

const PARTICIPANT_DETAIL: ParticipantProgramDetail = {
  program: PROGRAM_SUMMARY,
  department: {
    department_id: DEPARTMENT_ID,
    code: DEPARTMENT.code,
    name: DEPARTMENT.name,
    description: DEPARTMENT.description,
    lifecycle: DEPARTMENT.lifecycle,
    display_order: DEPARTMENT.display_order,
  },
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
        enrolled_at: "2099-09-02T00:00:00.000Z",
        cancelled_at: null,
      },
    ],
  },
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
  name: "Storybook management event",
  event_type: "訓練",
  location: "Storybook Hall",
  manual_check_in_code: null,
  check_in_window_opens_at: null,
  check_in_window_closes_at: null,
  cancel_reason: null,
  created_at: "2099-09-01T00:00:00.000Z",
  updated_at: "2099-09-01T00:00:00.000Z",
  exception: null,
  recurrence_tag: "每週",
  has_attendance: false,
};

const EVENT_DETAIL: EventDetail = {
  event: MANAGEMENT_EVENT,
  leaders: [],
  participant_summary: { active_enrollments: 3, checked_in: 1 },
};

const MANAGEMENT_DIRECTORY = {
  departments: [DEPARTMENT],
  programs: [PROGRAM],
} as unknown as ManagementDirectory;

const MANAGEMENT_COCKPIT: ManagementCockpitView = {
  program_id: PROGRAM_ID,
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
  active_event_count: 1,
  pending_enrollment_count: 0,
};

const MANAGEMENT_ATTENTION: ManagementAttention = {
  programs: [],
  items: [],
  total_actionable_count: 0,
  has_more: false,
};

const MANAGEMENT_NOTIFICATIONS: ManagementNotifications = {
  items: [],
  unread_count: 0,
  has_more: false,
};

const SCHEDULE_RULE: ScheduleRule = {
  rule_id: "t07-3-rule",
  program_id: PROGRAM_ID,
  recurrence: "WEEKLY",
  day_of_week: 6,
  month_day: null,
  start_time: "18:00",
  end_time: "19:30",
  location: "Storybook Hall",
  created_at: "2099-09-01T00:00:00.000Z",
  updated_at: "2099-09-01T00:00:00.000Z",
};

const SCHEDULE_PREVIEW: PreviewResult = {
  plan: {
    plan_id: "t07-3-plan",
    program_id: PROGRAM_ID,
    plan_hash: "t07-3-plan-hash",
    horizon_days: 90,
    from_date: "2099-09-01",
    rule_count: 1,
    created_at: "2099-09-01T00:00:00.000Z",
  },
  occurrences: [
    {
      occurrence_id: "t07-3-rule:2099-09-05",
      plan_id: "t07-3-plan",
      rule_id: SCHEDULE_RULE.rule_id,
      occurs_on: "2099-09-05",
      starts_at: "2099-09-05T10:00:00.000Z",
      ends_at: "2099-09-05T11:30:00.000Z",
      location: SCHEDULE_RULE.location,
      skip_reason: null,
      exception_id: null,
    },
  ],
};

const PENDING_PARTICIPANT_DETAIL: ParticipantProgramDetail = {
  ...PARTICIPANT_DETAIL,
  enrollment: {
    requests: [
      {
        request_id: "t07-3-pending-request",
        status: "Pending",
        submitted_at: "2099-09-02T00:00:00.000Z",
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
        submitted_at: "2099-08-28T00:00:00.000Z",
        decided_at: "2099-08-29T00:00:00.000Z",
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
    check_in_window_closes_at: "2099-09-30T00:00:00.000Z",
  },
};

const INELIGIBLE_EVENT_DETAIL: EventDetail = {
  ...EVENT_DETAIL,
  event: {
    ...EVENT_DETAIL.event,
    availability: "Inactive",
  },
};

const UNREAD_NOTIFICATIONS: ManagementNotifications = {
  items: [
    {
      kind: "enrollment",
      source_key: "t07-3-notification",
      source_revision: "1",
      read: false,
      actionable: true,
      count: 2,
      latest_submitted_at: "2099-09-02T00:00:00.000Z",
      program_id: PROGRAM_ID,
      program_name: PROGRAM.name,
      department_id: DEPARTMENT_ID,
      department_name: DEPARTMENT.name,
    },
  ],
  unread_count: 1,
  has_more: false,
};

const participantProgramHandlers = [
  memberAuthMeHandler,
  http.get("/api/v1/programs/access", () =>
    envelope({
      hasManagementCapability: false,
      departmentScopes: 0,
      programScopes: 0,
    })
  ),
  http.get("/api/v1/programs/catalog", () =>
    envelope({ catalog: PARTICIPANT_CATALOG })
  ),
  http.get("/api/v1/programs/:programId/participant-detail", () =>
    envelope({ detail: PARTICIPANT_DETAIL })
  ),
  http.get("/api/v1/programs/:programId/events/:eventId", () =>
    envelope(EVENT_DETAIL)
  ),
];

const managementProgramHandlers = [
  authMeHandler,
  http.get("/api/v1/programs/access", () =>
    envelope({
      hasManagementCapability: true,
      departmentScopes: 1,
      programScopes: 1,
    })
  ),
  http.get("/api/v1/programs/management-directory", () =>
    envelope(MANAGEMENT_DIRECTORY)
  ),
  http.get("/api/v1/programs/departments", () =>
    envelope({ departments: [DEPARTMENT] })
  ),
  http.get("/api/v1/programs/attention", () => envelope(MANAGEMENT_ATTENTION)),
  http.get("/api/v1/programs/notifications", () =>
    envelope(MANAGEMENT_NOTIFICATIONS)
  ),
  http.post("/api/v1/programs/notifications/read", () =>
    envelope({ notifications: MANAGEMENT_NOTIFICATIONS })
  ),
  http.get("/api/v1/programs/:programId/management", () =>
    envelope({
      program: PROGRAM,
      department: DEPARTMENT,
      modules: MODULES,
      cockpit: MANAGEMENT_COCKPIT,
    })
  ),
  http.get("/api/v1/programs/:programId/events", () =>
    envelope({ events: [MANAGEMENT_EVENT] })
  ),
  http.get("/api/v1/programs/:programId/events/:eventId", () =>
    envelope(EVENT_DETAIL)
  ),
  http.get("/api/v1/programs/:programId/enrollment-requests", () =>
    envelope({ requests: [] })
  ),
  http.get("/api/v1/programs/:programId/enrollments", () =>
    envelope({ enrollments: [] })
  ),
  http.get("/api/v1/programs/:programId/enrollment-snapshot", () =>
    envelope({ requests: [], enrollments: [] })
  ),
  http.get("/api/v1/programs/:programId/schedule-rules", () =>
    envelope({ rules: [SCHEDULE_RULE] })
  ),
  http.get(
    "/api/v1/programs/:programId/schedule-rules/:ruleId/exceptions",
    () => envelope({ exceptions: [] })
  ),
  http.post("/api/v1/programs/:programId/events/preview", () =>
    envelope(SCHEDULE_PREVIEW)
  ),
  http.post("/api/v1/programs/:programId/events/generate", () =>
    envelope({
      generated: {
        run_id: "t07-3-run",
        plan_id: SCHEDULE_PREVIEW.plan.plan_id,
        status: "completed" as const,
        created: 1,
        skipped: 0,
        failed: 0,
        resumed: false,
      },
    })
  ),
];

const withScenarioHandlers = (
  base: readonly RequestHandler[],
  ...overrides: RequestHandler[]
): readonly RequestHandler[] => [...overrides, ...base];

const conflictProgramHandler = http.patch("/api/v1/programs/:programId", () =>
  HttpResponse.json(
    {
      status: 409,
      code: "CONFLICT",
      title: "Conflict",
      detail: "The program changed on the server.",
    },
    { status: 409 }
  )
);

const stalePlanHandler = http.post(
  "/api/v1/programs/:programId/events/generate",
  () =>
    HttpResponse.json(
      {
        status: 409,
        code: "STALE_PLAN",
        title: "Stale plan",
        detail: "The schedule changed; preview again.",
      },
      { status: 409 }
    )
);

const partialGenerateHandler = http.post(
  "/api/v1/programs/:programId/events/generate",
  () =>
    envelope({
      generated: {
        run_id: "t07-3-partial-run",
        plan_id: SCHEDULE_PREVIEW.plan.plan_id,
        status: "partial" as const,
        created: 1,
        skipped: 0,
        failed: 1,
        resumed: true,
      },
    })
);

export const programsParticipantHandlers = participantProgramHandlers;
export const programsManagementHandlers = managementProgramHandlers;

export const PROGRAMS_MATERIAL_SCENARIO_NAMES = [
  "participant-directory-member",
  "participant-directory-capable",
  "participant-program-detail-active",
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

// oxlint-disable-next-line complexity -- the named matrix intentionally keeps each route state explicit.
export function getProgramsStoryScenario(
  name: ProgramsMaterialScenarioName
): ProgramsStoryScenario {
  switch (name) {
    case "participant-directory-member": {
      return storyScenario({}, programsParticipantHandlers);
    }
    case "participant-directory-capable":
    case "management-directory-mixed": {
      return storyScenario({ mode: "management" }, programsManagementHandlers);
    }
    case "participant-program-detail-active": {
      return storyScenario(
        { program: PROGRAM_ID },
        programsParticipantHandlers
      );
    }
    case "participant-program-detail-pending": {
      return storyScenario(
        { program: PROGRAM_ID },
        withScenarioHandlers(
          programsParticipantHandlers,
          http.get("/api/v1/programs/:programId/participant-detail", () =>
            envelope({ detail: PENDING_PARTICIPANT_DETAIL })
          )
        )
      );
    }
    case "participant-program-detail-rejected": {
      return storyScenario(
        { program: PROGRAM_ID },
        withScenarioHandlers(
          programsParticipantHandlers,
          http.get("/api/v1/programs/:programId/participant-detail", () =>
            envelope({ detail: REJECTED_PARTICIPANT_DETAIL })
          )
        )
      );
    }
    case "participant-event-detail-closed": {
      return storyScenario(
        { event: EVENT_ID, program: PROGRAM_ID },
        programsParticipantHandlers
      );
    }
    case "participant-event-detail-open": {
      return storyScenario(
        { event: EVENT_ID, program: PROGRAM_ID },
        withScenarioHandlers(
          programsParticipantHandlers,
          http.get("/api/v1/programs/:programId/events/:eventId", () =>
            envelope(OPEN_EVENT_DETAIL)
          )
        )
      );
    }
    case "participant-event-detail-ineligible": {
      return storyScenario(
        { event: EVENT_ID, program: PROGRAM_ID },
        withScenarioHandlers(
          programsParticipantHandlers,
          http.get("/api/v1/programs/:programId/events/:eventId", () =>
            envelope(INELIGIBLE_EVENT_DETAIL)
          )
        )
      );
    }
    case "workspace-overview-populated": {
      return storyScenario(
        { mode: "management", program: PROGRAM_ID },
        programsManagementHandlers
      );
    }
    case "workspace-overview-zero": {
      return storyScenario(
        { mode: "management", program: PROGRAM_ID },
        withScenarioHandlers(
          programsManagementHandlers,
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
      );
    }
    case "workspace-events-mixed": {
      return storyScenario(
        { mode: "management", program: PROGRAM_ID, task: "events" },
        withScenarioHandlers(
          programsManagementHandlers,
          http.get("/api/v1/programs/:programId/events", () =>
            envelope({
              events: [
                MANAGEMENT_EVENT,
                {
                  ...MANAGEMENT_EVENT,
                  event_id: "t07-3-cancelled-event",
                  status: "Cancelled" as const,
                  availability: "Inactive" as const,
                  cancel_reason: "Venue unavailable",
                },
              ],
            })
          )
        )
      );
    }
    case "workspace-participants-pending": {
      return storyScenario(
        { mode: "management", program: PROGRAM_ID, task: "participants" },
        withScenarioHandlers(
          programsManagementHandlers,
          http.get("/api/v1/programs/:programId/enrollment-snapshot", () =>
            envelope({
              requests: [
                {
                  request_id: "t07-3-pending-request",
                  program_id: PROGRAM_ID,
                  member_user_id: "t07-3-member",
                  status: "Pending" as const,
                  submitted_at: "2099-09-02T00:00:00.000Z",
                  decided_by: null,
                  decided_at: null,
                  decision_note: null,
                  request_version: 1,
                  member_name: "陳小明",
                  member_username: "chan.ming",
                },
              ],
              enrollments: [],
            })
          )
        )
      );
    }
    case "workspace-settings-dirty": {
      return storyScenario(
        { mode: "management", program: PROGRAM_ID, task: "settings" },
        programsManagementHandlers
      );
    }
    case "workspace-settings-conflict": {
      return storyScenario(
        { mode: "management", program: PROGRAM_ID, task: "settings" },
        withScenarioHandlers(programsManagementHandlers, conflictProgramHandler)
      );
    }
    case "workspace-schedule-focused": {
      return storyScenario(
        { mode: "management", program: PROGRAM_ID, task: "schedule" },
        programsManagementHandlers
      );
    }
    case "workspace-schedule-stale": {
      return storyScenario(
        { mode: "management", program: PROGRAM_ID, task: "schedule" },
        withScenarioHandlers(programsManagementHandlers, stalePlanHandler)
      );
    }
    case "workspace-schedule-partial-resume": {
      return storyScenario(
        { mode: "management", program: PROGRAM_ID, task: "schedule" },
        withScenarioHandlers(programsManagementHandlers, partialGenerateHandler)
      );
    }
    case "notifications-unread": {
      return storyScenario(
        { mode: "management", task: "notifications" },
        withScenarioHandlers(
          programsManagementHandlers,
          http.get("/api/v1/programs/notifications", () =>
            envelope(UNREAD_NOTIFICATIONS)
          )
        )
      );
    }
    case "notifications-empty-recoverable": {
      let attempts = 0;
      return storyScenario(
        { mode: "management", task: "notifications" },
        withScenarioHandlers(
          programsManagementHandlers,
          http.get("/api/v1/programs/notifications", () => {
            attempts += 1;
            return attempts === 1
              ? HttpResponse.json(
                  {
                    status: 503,
                    code: "UNAVAILABLE",
                    title: "Unavailable",
                    detail: "Notifications are temporarily unavailable.",
                  },
                  { status: 503 }
                )
              : envelope(MANAGEMENT_NOTIFICATIONS);
          })
        )
      );
    }
    default: {
      throw new Error(`Unknown Programs material scenario: ${name}`);
    }
  }
}
