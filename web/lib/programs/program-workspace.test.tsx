import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { RpcError } from "@/lib/api";
import { COPY } from "@/lib/copy";
import type {
  Department,
  DepartmentModule,
  Enrollment,
  EnrollmentRequest,
  PreviewResult,
  Program,
  ProgramEvent,
  ScheduleRule,
} from "@/lib/programs/program-api";
import { ProgramWorkspace } from "@/lib/programs/program-workspace";

const mocks = vi.hoisted(() => ({
  getManagementProgram: vi.fn(),
  listEvents: vi.fn(),
  listEnrollmentRequests: vi.fn(),
  listEnrollments: vi.fn(),
  getEvent: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  setEventAvailability: vi.fn(),
  cancelEvent: vi.fn(),
  listScheduleRules: vi.fn(),
  previewEvents: vi.fn(),
  generateEvents: vi.fn(),
}));

vi.mock(import("@/lib/programs/program-api"), () => ({
  getManagementProgram: mocks.getManagementProgram,
  listEvents: mocks.listEvents,
  listEnrollmentRequests: mocks.listEnrollmentRequests,
  listEnrollments: mocks.listEnrollments,
  createEvent: mocks.createEvent,
  getEvent: mocks.getEvent,
  updateEvent: mocks.updateEvent,
  setEventAvailability: mocks.setEventAvailability,
  cancelEvent: mocks.cancelEvent,
  listScheduleRules: mocks.listScheduleRules,
  previewEvents: mocks.previewEvents,
  generateEvents: mocks.generateEvents,
}));

const program: Program = {
  program_id: "program-1",
  department_id: "dept-1",
  name: "查經小組",
  description: "週三晚上的門徒訓練查經。",
  category: "門徒訓練",
  behavior_type: "Recurring",
  lifecycle: "Active",
  discoverability: "Listed",
  enrollment_mode: "MemberRequest",
  display_order: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  capabilities: {
    manage: true,
    publish: true,
    enroll: false,
    leader_assign: false,
  },
};

const department: Department = {
  department_id: "dept-1",
  code: "YOUTH",
  name: "青年事工",
  description: null,
  lifecycle: "Active",
  display_order: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  capabilities: {
    manage: true,
    publish: true,
    module_configure: true,
  },
};
const modules: DepartmentModule[] = [
  {
    department_id: "dept-1",
    module_key: "program_catalog",
    enabled: 1,
    enabled_at: "2026-01-01T00:00:00.000Z",
  },
  {
    department_id: "dept-1",
    module_key: "events",
    enabled: 1,
    enabled_at: "2026-01-01T00:00:00.000Z",
  },
  {
    department_id: "dept-1",
    module_key: "enrollment",
    enabled: 1,
    enabled_at: "2026-01-01T00:00:00.000Z",
  },
];

const event: ProgramEvent = {
  event_id: "event-1",
  program_id: "program-1",
  starts_at: "2030-08-20T11:00:00.000Z",
  ends_at: "2026-08-20T13:00:00.000Z",
  status: "Active",
  source: "SCHEDULE",
  cancel_reason: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const request: EnrollmentRequest = {
  request_id: "request-1",
  program_id: "program-1",
  member_user_id: "member-1",
  status: "Pending",
  submitted_at: "2026-08-01T00:00:00.000Z",
  decided_by: null,
  decided_at: null,
  decision_note: null,
  request_version: 1,
  member_name: "陳同工",
};

const enrollment: Enrollment = {
  enrollment_id: "enrollment-1",
  program_id: "program-1",
  member_user_id: "member-2",
  request_id: null,
  status: "Active",
  enrolled_at: "2026-08-02T00:00:00.000Z",
  cancelled_at: null,
  cancelled_by: null,
  created_by: "manager-1",
  created_at: "2026-08-02T00:00:00.000Z",
  member_name: "李同工",
};

const rule: ScheduleRule = {
  rule_id: "rule-1",
  program_id: "program-1",
  recurrence: "WEEKLY",
  day_of_week: 3,
  month_day: null,
  start_time: "19:30",
  end_time: "21:00",
  location: "主堂",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const plan: PreviewResult = {
  plan: {
    plan_id: "plan-abc123",
    program_id: "program-1",
    plan_hash: "hash-abc123",
    horizon_days: 14,
    from_date: "2026-08-13",
    rule_count: 1,
    created_at: "2026-08-13T00:00:00.000Z",
  },
  occurrences: [
    {
      occurrence_id: "rule-1:2026-08-19",
      plan_id: "plan-abc123",
      rule_id: "rule-1",
      occurs_on: "2026-08-19",
      starts_at: "2026-08-19T11:30:00.000Z",
      ends_at: "2026-08-19T13:00:00.000Z",
      location: "主堂",
      skip_reason: null,
      exception_id: null,
    },
    {
      occurrence_id: "rule-1:2026-08-26",
      plan_id: "plan-abc123",
      rule_id: "rule-1",
      occurs_on: "2026-08-26",
      starts_at: "2026-08-26T12:30:00.000Z",
      ends_at: "2026-08-26T14:00:00.000Z",
      location: "主堂",
      skip_reason: "CANCEL",
      exception_id: null,
    },
  ],
};

function mockWorkspace() {
  mocks.getManagementProgram.mockResolvedValue({
    program,
    department,
    modules,
  });
  mocks.listEvents.mockResolvedValue({ events: [event] });
  mocks.listEnrollmentRequests.mockResolvedValue({ requests: [request] });
  mocks.listEnrollments.mockResolvedValue({ enrollments: [enrollment] });
}

beforeEach(() => {
  mocks.getManagementProgram.mockReset();
  mocks.listEvents.mockReset();
  mocks.listEnrollmentRequests.mockReset();
  mocks.listEnrollments.mockReset();
  mocks.createEvent.mockReset();
  mocks.listScheduleRules.mockReset();
  mocks.previewEvents.mockReset();
  mocks.generateEvents.mockReset();
  mocks.listScheduleRules.mockResolvedValue({ rules: [rule] });
});

afterEach(() => {
  cleanup();
});

describe(ProgramWorkspace, () => {
  test("shows identity, operational facts, nearest Event, and restrained counts", async () => {
    mockWorkspace();
    render(
      <ProgramWorkspace
        programId="program-1"
        onBack={vi.fn()}
        onTaskChange={vi.fn()}
      />
    );

    await expect(
      screen.findByRole("heading", { name: "查經小組" })
    ).resolves.toBeInTheDocument();
    await expect(
      screen.findByText("青年事工 · YOUTH")
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.detailBehaviorRecurring)
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.discoverabilityListed)
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.detailParticipationMemberRequest)
    ).toBeInTheDocument();
    await expect(
      screen.findByText(COPY.programs.workspacePendingRequests)
    ).resolves.toBeInTheDocument();
    await expect(
      screen.findByText(COPY.programs.workspaceActiveParticipants)
    ).resolves.toBeInTheDocument();
  });

  test("renders Events with the management create entry point", async () => {
    mockWorkspace();
    const onTaskChange = vi.fn();
    render(
      <ProgramWorkspace
        programId="program-1"
        task="events"
        onBack={vi.fn()}
        onTaskChange={onTaskChange}
      />
    );

    await expect(
      screen.findByRole("heading", {
        name: COPY.programs.workspaceTaskEvents,
      })
    ).resolves.toBeInTheDocument();
    await expect(
      screen.findByText(COPY.programs.eventScheduleSource)
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.eventCreate })
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("link", {
        name: COPY.programs.workspaceTaskParticipants,
      })
    );
    expect(onTaskChange).toHaveBeenCalledWith("participants");
  });

  test("shows a privacy-preserving revoked state for an unauthorized direct link", async () => {
    mocks.getManagementProgram.mockRejectedValue(
      new RpcError({ code: "NOT_FOUND", status: 404 })
    );
    render(
      <ProgramWorkspace
        programId="secret-program"
        onBack={vi.fn()}
        onTaskChange={vi.fn()}
      />
    );

    await expect(
      screen.findByRole("heading", { name: COPY.programs.workspaceUnavailable })
    ).resolves.toBeInTheDocument();
    expect(screen.queryByText("secret-program")).not.toBeInTheDocument();
  });

  test("keeps module-disabled task links explicit without fetching protected data", async () => {
    mocks.getManagementProgram.mockResolvedValue({
      program,
      department,
      modules: [
        {
          department_id: "dept-1",
          module_key: "program_catalog",
          enabled: 1,
          enabled_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    render(
      <ProgramWorkspace
        programId="program-1"
        task="events"
        onBack={vi.fn()}
        onTaskChange={vi.fn()}
      />
    );

    await expect(
      screen.findByText(COPY.programs.workspaceTaskUnavailable)
    ).resolves.toBeInTheDocument();
    expect(mocks.listEvents).not.toHaveBeenCalled();
  });
  test("keeps server denial explicit on a focused task", async () => {
    mockWorkspace();
    mocks.listEvents.mockRejectedValue(
      new RpcError({ code: "FORBIDDEN", status: 403 })
    );
    render(
      <ProgramWorkspace
        programId="program-1"
        task="events"
        onBack={vi.fn()}
        onTaskChange={vi.fn()}
      />
    );

    await expect(
      screen.findByText(COPY.error.forbidden)
    ).resolves.toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.listEvents).toHaveBeenCalledWith("program-1")
    );
  });
});

describe("EVT-01 workspace Event deep link (#251)", () => {
  beforeEach(() => {
    mocks.getEvent.mockReset();
  });

  test("events rows hand the Event id to onEventChange", async () => {
    mockWorkspace();
    const onEventChange = vi.fn();
    render(
      <ProgramWorkspace
        programId="program-1"
        task="events"
        onBack={vi.fn()}
        onTaskChange={vi.fn()}
        onEventChange={onEventChange}
      />
    );
    const open = await screen.findByRole("button", {
      name: COPY.programs.eventDetailOpen,
    });
    await userEvent.click(open);
    expect(onEventChange).toHaveBeenCalledWith("event-1");
  });
  test("creates an Event with HK wall-time fields and opens its detail", async () => {
    mockWorkspace();
    mocks.createEvent.mockResolvedValue({
      event: { ...event, event_id: "event-created" },
    });
    const onEventChange = vi.fn();
    render(
      <ProgramWorkspace
        programId="program-1"
        task="events"
        onBack={vi.fn()}
        onTaskChange={vi.fn()}
        onEventChange={onEventChange}
      />
    );

    await userEvent.click(
      await screen.findByRole("button", { name: COPY.programs.eventCreate })
    );
    await userEvent.type(
      screen.getByLabelText(COPY.programs.eventName),
      "新聚會"
    );
    await userEvent.type(
      screen.getByLabelText(COPY.programs.eventLocation),
      "主堂"
    );
    fireEvent.change(screen.getByLabelText(COPY.programs.eventStart), {
      target: { value: "2026-09-13T18:00" },
    });
    fireEvent.change(screen.getByLabelText(COPY.programs.eventEnd), {
      target: { value: "2026-09-13T19:30" },
    });
    fireEvent.change(
      screen.getByLabelText(COPY.programs.eventCheckInWindowOpensAt),
      { target: { value: "2026-09-13T17:30" } }
    );
    fireEvent.change(
      screen.getByLabelText(COPY.programs.eventCheckInWindowClosesAt),
      { target: { value: "2026-09-13T19:30" } }
    );
    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.eventCreateSubmit })
    );

    await waitFor(() =>
      expect(mocks.createEvent).toHaveBeenCalledWith("program-1", {
        name: "新聚會",
        location: "主堂",
        starts_at: "2026-09-13T10:00:00.000Z",
        ends_at: "2026-09-13T11:30:00.000Z",
        check_in_window_opens_at: "2026-09-13T09:30:00.000Z",
        check_in_window_closes_at: "2026-09-13T11:30:00.000Z",
      })
    );
    expect(onEventChange).toHaveBeenCalledWith("event-created");
  });

  test("an eventId renders the Event detail screen and back clears it", async () => {
    mockWorkspace();
    mocks.getEvent.mockResolvedValue({
      event: { ...event, name: "迎新聚會" },
      leaders: [],
      participant_summary: { active_enrollments: 0, checked_in: 0 },
    });
    const onEventChange = vi.fn();
    render(
      <ProgramWorkspace
        programId="program-1"
        task="events"
        eventId="event-1"
        onBack={vi.fn()}
        onTaskChange={vi.fn()}
        onEventChange={onEventChange}
      />
    );
    await expect(
      screen.findByRole("heading", { name: "迎新聚會" })
    ).resolves.toBeInTheDocument();
    expect(mocks.getEvent).toHaveBeenCalledWith("program-1", "event-1");
    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.eventDetailBack })
    );
    expect(onEventChange).toHaveBeenCalledWith(null);
  });
});

describe("EVT-02 recurring preview and generation UI (#252)", () => {
  function renderEventsTask() {
    mockWorkspace();
    return render(
      <ProgramWorkspace
        programId="program-1"
        task="events"
        onBack={vi.fn()}
        onTaskChange={vi.fn()}
      />
    );
  }

  test("preview controls are reachable and render an exact plan with exception state", async () => {
    const user = userEvent.setup();
    renderEventsTask();
    await screen.findByRole("button", { name: COPY.programs.previewEvents });
    mocks.previewEvents.mockResolvedValue(plan);

    await user.click(
      screen.getByRole("button", { name: COPY.programs.previewEvents })
    );
    expect(mocks.previewEvents).toHaveBeenCalledWith("program-1", 90);

    await expect(
      screen.findByText(
        COPY.programs.previewPlanLabel.replace("{id}", "plan-abc"),
        { exact: false }
      )
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.previewOccurrenceSkipped)
    ).toBeInTheDocument();
    expect(screen.getAllByText("主堂").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: COPY.programs.generateEvents })
    ).toBeInTheDocument();
  });

  test("a stale plan error surfaces, clears the plan, and requires a new preview", async () => {
    const user = userEvent.setup();
    renderEventsTask();
    await screen.findByRole("button", { name: COPY.programs.previewEvents });
    mocks.previewEvents.mockResolvedValue(plan);
    mocks.generateEvents.mockRejectedValue(
      new RpcError({ code: "STALE_PLAN", status: 409 })
    );

    await user.click(
      screen.getByRole("button", { name: COPY.programs.previewEvents })
    );
    await screen.findByRole("button", { name: COPY.programs.generateEvents });
    await user.click(
      screen.getByRole("button", { name: COPY.programs.generateEvents })
    );

    await expect(
      screen.findByRole("alert")
    ).resolves.toHaveTextContent(COPY.programs.previewChanged);
    expect(
      screen.queryByRole("button", { name: COPY.programs.generateEvents })
    ).not.toBeInTheDocument();
  });

  test("generation reports deterministic counts and refreshes the event list", async () => {
    const user = userEvent.setup();
    renderEventsTask();
    await screen.findByRole("button", { name: COPY.programs.previewEvents });
    mocks.previewEvents.mockResolvedValue(plan);
    mocks.generateEvents.mockResolvedValue({
      generated: {
        run_id: "run-1",
        plan_id: "plan-abc123",
        status: "completed",
        created: 1,
        skipped: 1,
        failed: 0,
        resumed: false,
      },
    });

    await user.click(
      screen.getByRole("button", { name: COPY.programs.previewEvents })
    );
    await screen.findByRole("button", { name: COPY.programs.generateEvents });
    await user.click(
      screen.getByRole("button", { name: COPY.programs.generateEvents })
    );

    await expect(
      screen.findByText("已產生 1 場聚會，跳過 1 場重複。")
    ).resolves.toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.generateEvents).toHaveBeenCalledWith(
        "program-1",
        "plan-abc123"
      )
    );
  });

  test("an empty schedule hides preview controls behind an explicit empty state", async () => {
    mocks.listScheduleRules.mockResolvedValue({ rules: [] });
    mockWorkspace();
    render(
      <ProgramWorkspace
        programId="program-1"
        task="events"
        onBack={vi.fn()}
        onTaskChange={vi.fn()}
      />
    );
    await expect(
      screen.findByText(COPY.programs.settingsScheduleNone)
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.previewEvents })
    ).not.toBeInTheDocument();
  });

  test("preview controls stay hidden without the manage capability", async () => {
    mocks.getManagementProgram.mockResolvedValue({
      program: { ...program, capabilities: { ...program.capabilities, manage: false } },
      department,
      modules,
    });
    mocks.listEvents.mockResolvedValue({ events: [] });
    mocks.listEnrollmentRequests.mockResolvedValue({ requests: [] });
    mocks.listEnrollments.mockResolvedValue({ enrollments: [] });
    render(
      <ProgramWorkspace
        programId="program-1"
        task="events"
        onBack={vi.fn()}
        onTaskChange={vi.fn()}
      />
    );
    await screen.findByRole("heading", {
      name: COPY.programs.workspaceTaskEvents,
    });
    expect(
      screen.queryByRole("button", { name: COPY.programs.previewEvents })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.generateEvents })
    ).not.toBeInTheDocument();
  });
});
