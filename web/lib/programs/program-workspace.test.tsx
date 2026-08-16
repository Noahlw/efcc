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
  ManagementCockpitView,
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
  listEnrollmentSnapshot: vi.fn(),
  listEnrollments: vi.fn(),
  decideEnrollmentRequest: vi.fn(),
  assistedEnroll: vi.fn(),
  searchMemberOptions: vi.fn(),
  createEvent: vi.fn(),
  getEvent: vi.fn(),
  updateEvent: vi.fn(),
  setEventAvailability: vi.fn(),
  cancelEvent: vi.fn(),
  listScheduleRules: vi.fn(),
  previewEvents: vi.fn(),
  generateEvents: vi.fn(),
  updateProgram: vi.fn(),
}));

vi.mock(import("@/lib/programs/program-api"), () => ({
  getManagementProgram: mocks.getManagementProgram,
  listEvents: mocks.listEvents,
  listEnrollmentRequests: mocks.listEnrollmentRequests,
  listEnrollmentSnapshot: mocks.listEnrollmentSnapshot,
  listEnrollments: mocks.listEnrollments,
  decideEnrollmentRequest: mocks.decideEnrollmentRequest,
  assistedEnroll: mocks.assistedEnroll,
  searchMemberOptions: mocks.searchMemberOptions,
  getEvent: mocks.getEvent,
  createEvent: mocks.createEvent,
  updateEvent: mocks.updateEvent,
  setEventAvailability: mocks.setEventAvailability,
  cancelEvent: mocks.cancelEvent,
  listScheduleRules: mocks.listScheduleRules,
  previewEvents: mocks.previewEvents,
  generateEvents: mocks.generateEvents,
  updateProgram: mocks.updateProgram,
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

const cockpitWithNext: ManagementCockpitView = {
  program_id: "program-1",
  next_event: {
    event_id: "event-1",
    program_id: "program-1",
    title: "查經小組 第 1 節",
    name: "查經小組 第 1 節",
    starts_at: "2030-08-20T11:00:00.000Z",
    ends_at: "2030-08-20T13:00:00.000Z",
    location: "副堂 201",
    source: "SCHEDULE",
    is_recurring: true,
    checked_in_count: 8,
    roster_count: 12,
  },
  active_event_count: 5,
  pending_enrollment_count: 3,
};

const cockpitNoNext: ManagementCockpitView = {
  program_id: "program-1",
  next_event: null,
  active_event_count: 2,
  pending_enrollment_count: 0,
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
  mocks.listEnrollmentSnapshot.mockResolvedValue({
    requests: [request],
    enrollments: [enrollment],
  });

}
beforeEach(() => {
  mocks.getManagementProgram.mockReset();
  mocks.listEvents.mockReset();
  mocks.listEnrollmentRequests.mockReset();
  mocks.listEnrollments.mockReset();
  mocks.listEnrollmentSnapshot.mockReset();
  mocks.assistedEnroll.mockReset();
  mocks.searchMemberOptions.mockReset();
  mocks.createEvent.mockReset();
  mocks.listScheduleRules.mockReset();
  mocks.previewEvents.mockReset();
  mocks.generateEvents.mockReset();
  mocks.updateProgram.mockReset();
  mocks.listScheduleRules.mockResolvedValue({ rules: [rule] });
});
afterEach(() => {
  cleanup();
});

describe(ProgramWorkspace, () => {
  test("renders status-first Cockpit layout with next-meeting card, live check-in counts, and operational tiles", async () => {
    mocks.getManagementProgram.mockResolvedValue({
      program,
      department,
      modules,
      cockpit: cockpitWithNext,
    });
    const onTaskChange = vi.fn();
    const onEventChange = vi.fn();
    render(
      <ProgramWorkspace
        programId="program-1"
        onBack={vi.fn()}
        onTaskChange={onTaskChange}
        onEventChange={onEventChange}
      />
    );

    // Header with quiet edit button and pills
    await expect(
      screen.findByRole("heading", { name: "查經小組" })
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.cockpitEditProgram })
    ).toBeInTheDocument();
    expect(screen.getByText("青年事工 · YOUTH")).toBeInTheDocument();
    expect(screen.getByText(COPY.programs.lifecycleActive)).toBeInTheDocument();

    // 下一聚會 card with live counts
    expect(
      screen.getByText(COPY.programs.cockpitNextMeeting)
    ).toBeInTheDocument();
    expect(screen.getByText("查經小組 第 1 節")).toBeInTheDocument();
    expect(screen.getByText(/副堂 201/u)).toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.cockpitAutoScheduled)
    ).toBeInTheDocument();
    expect(screen.getByText("8/12")).toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.cockpitCheckedIn)
    ).toBeInTheDocument();

    // 前往管理名單 carries event context
    const rosterButton = screen.getByRole("button", {
      name: COPY.programs.cockpitManageRoster,
    });
    await userEvent.click(rosterButton);
    expect(onEventChange).not.toHaveBeenCalled();
    expect(onTaskChange).toHaveBeenCalledWith("participants", "event-1");

    // 2-up operational tiles
    expect(
      screen.getByRole("heading", { name: COPY.programs.cockpitOperations })
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.cockpitWeeklyWork)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: new RegExp(`${COPY.programs.cockpitEventsTile}.*5 個聚會`, "u"),
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: new RegExp(`${COPY.programs.cockpitParticipantsTile}.*待審批報名 ×3`, "u"),
      })
    ).toBeInTheDocument();

    // 低頻設定 quiet rows
    expect(
      screen.getByRole("heading", { name: COPY.programs.cockpitOthers })
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.cockpitLowFrequency)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: new RegExp(`${COPY.programs.cockpitCourseFacts}.*${COPY.programs.cockpitCourseFactsHint}`, "u"),
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: new RegExp(COPY.programs.cockpitSettings, "u"),
      })
    ).toBeInTheDocument();

    // No tabs in the Cockpit
    expect(
      screen.queryByRole("nav", { name: COPY.programs.workspaceTaskLabel })
    ).not.toBeInTheDocument();
  });

  test("omits next-meeting block entirely when no upcoming meeting exists", async () => {
    mocks.getManagementProgram.mockResolvedValue({
      program,
      department,
      modules,
      cockpit: cockpitNoNext,
    });
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

    // Next-meeting block completely absent
    expect(
      screen.queryByText(COPY.programs.cockpitNextMeeting)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.cockpitManageRoster })
    ).not.toBeInTheDocument();

    // Operational tiles still render with live counts
    expect(
      screen.getByRole("button", {
        name: new RegExp(`${COPY.programs.cockpitEventsTile}.*2 個聚會`, "u"),
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: new RegExp(`${COPY.programs.cockpitParticipantsTile}.*${COPY.programs.cockpitNoPending}`, "u"),
      })
    ).toBeInTheDocument();
  });

  test("navigates to tasks and renders Course Facts view with all 6 read-only fields and back navigation to Cockpit", async () => {
    mocks.getManagementProgram.mockResolvedValue({
      program,
      department,
      modules,
      cockpit: cockpitWithNext,
    });
    const onTaskChange = vi.fn();
    render(
      <ProgramWorkspace
        programId="program-1"
        onBack={vi.fn()}
        onTaskChange={onTaskChange}
      />
    );

    await expect(
      screen.findByRole("heading", { name: "查經小組" })
    ).resolves.toBeInTheDocument();

    // Click events tile
    await userEvent.click(
      screen.getByRole("button", {
        name: new RegExp(COPY.programs.cockpitEventsTile, "u"),
      })
    );
    expect(onTaskChange).toHaveBeenCalledWith("events");

    // Click course facts quiet row
    await userEvent.click(
      screen.getByRole("button", {
        name: new RegExp(COPY.programs.cockpitCourseFacts, "u"),
      })
    );
    expect(
      await screen.findByRole("heading", {
        name: COPY.programs.cockpitCourseFacts,
      })
    ).toBeInTheDocument();

    // Verify all 6 read-only fields
    expect(screen.getByRole("heading", { name: "查經小組" })).toBeInTheDocument();
    expect(screen.getByText("週三晚上的門徒訓練查經。")).toBeInTheDocument();
    expect(screen.getByText("青年事工")).toBeInTheDocument();
    expect(
      screen.getAllByText(COPY.programs.lifecycleActive).length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText(COPY.programs.discoverabilityListed)
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.detailParticipationMemberRequest)
    ).toBeInTheDocument();
    // Verify Facts screen has NO editable inputs
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    // Verify 編輯課程 button is present on Facts
    expect(
      screen.getByRole("button", { name: COPY.programs.cockpitEditProgram })
    ).toBeInTheDocument();

    // Return to Cockpit
    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.backToOverview })
    );
    expect(
      await screen.findByRole("heading", {
        name: COPY.programs.cockpitOperations,
      })
    ).toBeInTheDocument();
  });

  test("renders Course Edit from Facts, validates non-empty fields, saves changes, and returns to Facts with updated values", async () => {
    const updatedProgram: Program = {
      ...program,
      name: "門徒進階查經",
      description: "進階查經課程簡介。",
    };
    mocks.getManagementProgram.mockResolvedValue({
      program,
      department,
      modules,
      cockpit: cockpitWithNext,
    });
    mocks.updateProgram.mockResolvedValue({ program: updatedProgram });

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

    // Open Course Facts
    await userEvent.click(
      screen.getByRole("button", {
        name: new RegExp(COPY.programs.cockpitCourseFacts, "u"),
      })
    );
    expect(
      await screen.findByRole("heading", {
        name: COPY.programs.cockpitCourseFacts,
      })
    ).toBeInTheDocument();

    // Open Course Edit
    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.cockpitEditProgram })
    );
    expect(
      await screen.findByRole("heading", {
        name: COPY.programs.cockpitEditProgram,
      })
    ).toBeInTheDocument();

    // Pre-filled values
    const nameInput = screen.getByRole("textbox", {
      name: COPY.programs.editNameLabel,
    });
    const purposeInput = screen.getByRole("textbox", {
      name: COPY.programs.editPurposeLabel,
    });
    expect(nameInput).toHaveValue("查經小組");
    expect(purposeInput).toHaveValue("週三晚上的門徒訓練查經。");

    // Validation 1: empty name blocks save
    await userEvent.clear(nameInput);
    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.saveCourse })
    );
    expect(screen.getByText(COPY.programs.editRequired)).toBeInTheDocument();
    expect(mocks.updateProgram).not.toHaveBeenCalled();

    // Validation 2: empty purpose blocks save
    await userEvent.type(nameInput, "門徒進階查經");
    await userEvent.clear(purposeInput);
    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.saveCourse })
    );
    expect(screen.getByText(COPY.programs.editRequired)).toBeInTheDocument();
    expect(mocks.updateProgram).not.toHaveBeenCalled();

    // Fill valid purpose and save
    await userEvent.type(purposeInput, "進階查經課程簡介。");
    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.saveCourse })
    );

    expect(mocks.updateProgram).toHaveBeenCalledWith("program-1", {
      name: "門徒進階查經",
      description: "進階查經課程簡介。",
    });

    // Success returns to Facts with updated values
    expect(
      await screen.findByRole("heading", {
        name: COPY.programs.cockpitCourseFacts,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "門徒進階查經" })
    ).toBeInTheDocument();
    expect(screen.getByText("進階查經課程簡介。")).toBeInTheDocument();
  });

  test("renders Course Edit from Cockpit edit button and allows back navigation to Facts", async () => {
    mocks.getManagementProgram.mockResolvedValue({
      program,
      department,
      modules,
      cockpit: cockpitWithNext,
    });

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

    // Click 編輯課程 in Cockpit header
    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.cockpitEditProgram })
    );
    expect(
      await screen.findByRole("heading", {
        name: COPY.programs.cockpitEditProgram,
      })
    ).toBeInTheDocument();

    // Click back button returns to Facts view
    await userEvent.click(
      screen.getByRole("button", {
        name: new RegExp(
          `${COPY.programs.courseFacts}|${COPY.programs.backToOverview}`,
          "u"
        ),
      })
    );
    expect(
      await screen.findByRole("heading", {
        name: COPY.programs.cockpitCourseFacts,
      })
    ).toBeInTheDocument();
  });

  test("handles Course Edit save API error gracefully", async () => {
    mocks.getManagementProgram.mockResolvedValue({
      program,
      department,
      modules,
      cockpit: cockpitWithNext,
    });
    mocks.updateProgram.mockRejectedValue(
      new RpcError({ code: "INTERNAL_ERROR", detail: "未能儲存課程資料" })
    );

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

    // Open Edit directly
    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.cockpitEditProgram })
    );
    const nameInput = screen.getByRole("textbox", {
      name: COPY.programs.editNameLabel,
    });
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "新名稱");

    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.saveCourse })
    );

    // Error is displayed and form remains with input intact
    expect(
      await screen.findByText(COPY.error.serverError)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: COPY.programs.editNameLabel })
    ).toHaveValue("新名稱");
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
      screen.getByRole("button", { name: COPY.programs.createMeeting })
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
describe("ENR-01 participants workspace", () => {
  test("renders pending, active, and history tabs from server state", async () => {
    mockWorkspace();
    mocks.decideEnrollmentRequest.mockResolvedValue({
      request: { ...request, status: "Approved" },
    });
    render(
      <ProgramWorkspace
        programId="program-1"
        task="participants"
        onBack={vi.fn()}
        onTaskChange={vi.fn()}
      />
    );

    await expect(
      screen.findByRole("heading", {
        name: COPY.programs.workspaceTaskParticipants,
      })
    ).resolves.toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.listEnrollmentSnapshot).toHaveBeenCalledWith("program-1")
    );
    expect(
      await screen.findByRole("tab", {
        name: `${COPY.programs.workspacePendingRequests} (1)`,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", {
        name: `${COPY.programs.workspaceActiveParticipants} (1)`,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", {
        name: `${COPY.programs.workspaceActiveParticipants} (1)`,
      })
    ).toHaveAttribute("aria-controls", "participants-active-panel");
    expect(
      screen.getByRole("button", { name: COPY.programs.approve })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.reject })
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("tab", {
        name: `${COPY.programs.workspaceActiveParticipants} (1)`,
      })
    );
    expect(await screen.findByText("李同工")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.approve })
    ).not.toBeInTheDocument();
  });

  test("sends the request version and keeps stale decisions visible", async () => {
    mockWorkspace();
    mocks.decideEnrollmentRequest.mockRejectedValue(
      new RpcError({
        code: "STALE",
        status: 409,
        detail: COPY.programs.workspaceParticipantsStale,
      })
    );
    render(
      <ProgramWorkspace
        programId="program-1"
        task="participants"
        onBack={vi.fn()}
        onTaskChange={vi.fn()}
      />
    );

    await userEvent.click(
      await screen.findByRole("button", { name: COPY.programs.approve })
    );
    await waitFor(() =>
      expect(mocks.decideEnrollmentRequest).toHaveBeenCalledWith(
        "program-1",
        "request-1",
        "Approved",
        undefined,
        1
      )
    );
    expect(
      await screen.findByText(COPY.programs.workspaceParticipantsStale)
    ).toBeInTheDocument();
    expect(screen.getByText("陳同工")).toBeInTheDocument();
  });

  test("keeps the queue visible when assisted enrollment fails", async () => {
    mockWorkspace();
    mocks.getManagementProgram.mockResolvedValue({
      program: { ...program, enrollment_mode: "ManagerOnly" },
      department,
      modules,
    });
    mocks.searchMemberOptions.mockResolvedValue({
      members: [
        { user_id: "member-3", name: "王同工", username: "wang" },
      ],
    });
    mocks.assistedEnroll.mockRejectedValue(
      new RpcError({
        code: "ENROLLMENT_DUPLICATE",
        status: 409,
        detail: COPY.programs.enrollmentDuplicate,
      })
    );
    render(
      <ProgramWorkspace
        programId="program-1"
        task="participants"
        onBack={vi.fn()}
        onTaskChange={vi.fn()}
      />
    );

    const picker = await screen.findByRole("combobox", {
      name: COPY.programs.memberId,
    });
    await userEvent.type(picker, "王同");
    await userEvent.click(await screen.findByRole("button", { name: /王同工/ }));
    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.assistedEnroll })
    );
    expect(
      await screen.findByText(
        `${COPY.programs.workspaceParticipantsConflict} ${COPY.programs.enrollmentDuplicate}`
      )
    ).toBeInTheDocument();
    expect(screen.getByText("陳同工")).toBeInTheDocument();
    expect(
      screen.getByRole("tab", {
        name: `${COPY.programs.workspacePendingRequests} (1)`,
      })
    ).toBeInTheDocument();
  });

  test("an approved request whose enrollment is later cancelled counts once in history", async () => {
    mockWorkspace();
    mocks.listEnrollmentSnapshot.mockResolvedValue({
      requests: [
        {
          ...request,
          status: "Approved",
          request_version: 2,
          decided_by: "manager-1",
          decided_at: "2026-08-03T00:00:00.000Z",
        },
      ],
      enrollments: [
        {
          ...enrollment,
          request_id: "request-1",
          status: "Cancelled",
          cancelled_at: "2026-08-04T00:00:00.000Z",
          cancelled_by: "member-1",
        },
      ],
    });
    render(
      <ProgramWorkspace
        programId="program-1"
        task="participants"
        onBack={vi.fn()}
        onTaskChange={vi.fn()}
      />
    );

    await userEvent.click(
      await screen.findByRole("tab", {
        name: `${COPY.programs.enrollmentHistory} (1)`,
      })
    );
    const history = screen.getByRole("list", {
      name: COPY.programs.enrollmentHistory,
    });
    expect(history.querySelectorAll("li")).toHaveLength(1);
    expect(history).toHaveTextContent(COPY.programs.enrollmentCancelled);
  });

  test("keeps the queue rendered when the post-decision refresh fails", async () => {
    mockWorkspace();
    mocks.decideEnrollmentRequest.mockResolvedValue({
      request: { ...request, status: "Approved" },
    });
    mocks.listEnrollmentSnapshot
      .mockResolvedValueOnce({
        requests: [request],
        enrollments: [enrollment],
      })
      .mockRejectedValueOnce(
        new RpcError({
          code: "NETWORK",
          status: 0,
          detail: "refresh failed",
        })
      );
    render(
      <ProgramWorkspace
        programId="program-1"
        task="participants"
        onBack={vi.fn()}
        onTaskChange={vi.fn()}
      />
    );

    await userEvent.click(
      await screen.findByRole("button", { name: COPY.programs.approve })
    );
    expect(
      await screen.findByText(COPY.programs.workspaceParticipantsRefreshFailed)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", {
        name: `${COPY.programs.workspacePendingRequests} (1)`,
      })
    ).toBeInTheDocument();
    expect(screen.getByText("陳同工")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: COPY.programs.workspaceTaskParticipantsRetry,
      })
    ).not.toBeInTheDocument();
  });

  test("submits an assisted enrollment from the ManagerOnly queue", async () => {
    mockWorkspace();
    mocks.getManagementProgram.mockResolvedValue({
      program: { ...program, enrollment_mode: "ManagerOnly" },
      department,
      modules,
    });
    mocks.listEnrollmentSnapshot.mockResolvedValue({
      requests: [],
      enrollments: [],
    });
    mocks.searchMemberOptions.mockResolvedValue({
      members: [
        { user_id: "member-3", name: "王同工", username: "wang" },
      ],
    });
    mocks.assistedEnroll.mockResolvedValue({
      enrollment: { ...enrollment, member_user_id: "member-3" },
    });
    render(
      <ProgramWorkspace
        programId="program-1"
        task="participants"
        onBack={vi.fn()}
        onTaskChange={vi.fn()}
      />
    );

    const picker = await screen.findByRole("combobox", {
      name: COPY.programs.memberId,
    });
    await userEvent.type(picker, "王同");
    await userEvent.click(await screen.findByRole("button", { name: /王同工/ }));
    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.assistedEnroll })
    );
    await waitFor(() =>
      expect(mocks.assistedEnroll).toHaveBeenCalledWith(
        "program-1",
        "member-3"
      )
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
      await screen.findByRole("button", { name: COPY.programs.createMeeting })
    );
    fireEvent.change(screen.getByLabelText(COPY.programs.eventDate), {
      target: { value: "2026-09-13" },
    });
    fireEvent.change(screen.getByLabelText(COPY.programs.eventTime), {
      target: { value: "18:00" },
    });
    await userEvent.type(
      screen.getByLabelText(COPY.programs.eventName),
      "新聚會"
    );
    fireEvent.change(screen.getByLabelText(COPY.programs.eventType), {
      target: { value: COPY.programs.eventTypeOptions[1] },
    });
    fireEvent.change(screen.getByLabelText(COPY.programs.recurrenceTag), {
      target: { value: COPY.programs.recurrenceNone },
    });
    await userEvent.click(
      screen.getAllByRole("button", { name: COPY.programs.createMeeting }).at(-1)!
    );

    await waitFor(() =>
      expect(mocks.createEvent).toHaveBeenCalledWith("program-1", {
        name: "新聚會",
        event_type: COPY.programs.eventTypeOptions[1],
        starts_at: "2026-09-13T10:00:00.000Z",
        ends_at: "2026-09-13T11:00:00.000Z",
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

  test("a schedule-rules load failure keeps the Preview form reachable next to the error alert", async () => {
    mocks.listScheduleRules.mockRejectedValue(
      new RpcError({ code: "FORBIDDEN", status: 403 })
    );
    mockWorkspace();
    render(
      <ProgramWorkspace
        programId="program-1"
        task="events"
        onBack={vi.fn()}
        onTaskChange={vi.fn()}
      />
    );
    // The failure is communicated by the existing error alert…
    await expect(
      screen.findByRole("alert")
    ).resolves.toHaveTextContent(COPY.error.forbidden);
    // …but the Preview form must stay reachable (rules stays null on error,
    // so the no-rules empty state is NOT shown and the horizon input lives
    // on). A transient rules-load failure must not masquerade as "no
    // schedule configured".
    expect(
      screen.getByRole("button", { name: COPY.programs.previewEvents })
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(COPY.programs.previewHorizon)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.programs.settingsScheduleNone)
    ).not.toBeInTheDocument();
  });

  test("a partial generation reports through the alert treatment and stays retryable", async () => {
    const user = userEvent.setup();
    renderEventsTask();
    await screen.findByRole("button", { name: COPY.programs.previewEvents });
    mocks.previewEvents.mockResolvedValue(plan);
    mocks.generateEvents.mockResolvedValue({
      generated: {
        run_id: "run-1",
        plan_id: "plan-abc123",
        status: "partial",
        created: 1,
        skipped: 0,
        failed: 1,
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

    // partial/failed output uses the alert treatment, not the plain notice
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      COPY.programs.generatedPartial
        .replace("{created}", "1")
        .replace("{skipped}", "0")
        .replace("{failed}", "1")
    );
    expect(
      screen.queryByText(COPY.programs.generated)
    ).not.toBeInTheDocument();
    // The plan is kept and Generate stays enabled so the operator can
    // immediately retry the failed units on the same plan.
    expect(
      screen.getByRole("button", { name: COPY.programs.generateEvents })
    ).toBeEnabled();
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
