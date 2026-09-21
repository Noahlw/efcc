import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { RpcError } from "@/lib/api";
import { COPY } from "@/lib/copy";
import type {
  EnrollmentApprovalRun,
  EnrollmentApprovalRunItem,
} from "@/lib/programs/enrollment-approval-run";
import { clearWorkspaceMutationRecovery } from "@/lib/programs/mutation-recovery";
import type {
  Department,
  DepartmentModule,
  Enrollment,
  EnrollmentRequest,
  ManagementCockpitView,
  ManagementNotificationItem,
  PreviewResult,
  Program,
  ProgramEvent,
  ScheduleRule,
} from "@/lib/programs/program-api";
import { ProgramWorkspace } from "@/lib/programs/program-workspace";
import type { ManagementNotificationState } from "@/lib/programs/programs-notifications";
import {
  addWallDays,
  addWallMonths,
  hkTodayWallDate,
} from "@/lib/programs/recurrence";
import { WorkspaceRouteProvider } from "@/lib/programs/workspace-context";

import {
  clearEventCreateDraft,
  readEventCreateDraft,
} from "./event-create-draft";
import { clearGenerationRecovery } from "./generation-recovery";
import {
  clearManagementDraftsForEntity,
  writeManagementDraft,
} from "./management-draft";
import { SETTINGS_DRAFT_ACTION } from "./program-settings";

const StatefulWorkspaceHarness = ({
  initialTask,
}: {
  initialTask: "settings" | "events";
}) => {
  const [task, setTask] = useState<"settings" | "events" | null>(initialTask);
  return (
    <ProgramWorkspace
      programId="program-1"
      task={task ?? undefined}
      onBack={() => {}}
      onTaskChange={(nextTask) =>
        setTask(nextTask === initialTask ? initialTask : null)
      }
    />
  );
};

const mocks = vi.hoisted(() => ({
  getManagementProgram: vi.fn(),
  updateProgram: vi.fn(),
  listEvents: vi.fn(),
  listEnrollmentRequests: vi.fn(),
  listEnrollmentSnapshot: vi.fn(),
  listEnrollmentApprovalRuns: vi.fn(),
  startEnrollmentApprovalRun: vi.fn(),
  reconcileEnrollmentApprovalRun: vi.fn(),
  continueEnrollmentApprovalRun: vi.fn(),
  cancelEnrollmentApprovalRun: vi.fn(),
  listEnrollments: vi.fn(),
  decideEnrollmentRequest: vi.fn(),
  assistedEnroll: vi.fn(),
  cancelEnrollment: vi.fn(),
  searchMemberOptions: vi.fn(),
  createEvent: vi.fn(),
  getEvent: vi.fn(),
  updateEvent: vi.fn(),
  setEventAvailability: vi.fn(),
  cancelEvent: vi.fn(),
  createScheduleException: vi.fn(),
  deleteScheduleException: vi.fn(),
  listScheduleExceptions: vi.fn(),
  listScheduleRules: vi.fn(),
  previewEvents: vi.fn(),
  generateEvents: vi.fn(),
  isUnknownMutationOutcome: vi.fn<(error: unknown) => boolean>((error) => {
    const { problem } = error as {
      problem?: { code?: string; status?: number };
    };
    return (
      problem === undefined ||
      problem.status === 0 ||
      problem.code === "NETWORK_ERROR" ||
      problem.code === "MALFORMED_RESPONSE" ||
      problem.code === "MALFORMED_REQUEST" ||
      problem.code === "UNAVAILABLE"
    );
  }),
}));

vi.mock(import("@/lib/programs/program-api"), () => ({
  getManagementProgram: mocks.getManagementProgram,
  updateProgram: mocks.updateProgram,
  listEvents: mocks.listEvents,
  listEnrollmentRequests: mocks.listEnrollmentRequests,
  listEnrollmentSnapshot: mocks.listEnrollmentSnapshot,
  listEnrollmentApprovalRuns: mocks.listEnrollmentApprovalRuns,
  startEnrollmentApprovalRun: mocks.startEnrollmentApprovalRun,
  reconcileEnrollmentApprovalRun: mocks.reconcileEnrollmentApprovalRun,
  continueEnrollmentApprovalRun: mocks.continueEnrollmentApprovalRun,
  cancelEnrollmentApprovalRun: mocks.cancelEnrollmentApprovalRun,
  listEnrollments: mocks.listEnrollments,
  decideEnrollmentRequest: mocks.decideEnrollmentRequest,
  assistedEnroll: mocks.assistedEnroll,
  cancelEnrollment: mocks.cancelEnrollment,
  searchMemberOptions: mocks.searchMemberOptions,
  getEvent: mocks.getEvent,
  createEvent: mocks.createEvent,
  updateEvent: mocks.updateEvent,
  setEventAvailability: mocks.setEventAvailability,
  cancelEvent: mocks.cancelEvent,
  createScheduleException: mocks.createScheduleException,
  deleteScheduleException: mocks.deleteScheduleException,
  listScheduleExceptions: mocks.listScheduleExceptions,
  listScheduleRules: mocks.listScheduleRules,
  previewEvents: mocks.previewEvents,
  generateEvents: mocks.generateEvents,
  isUnknownMutationOutcome: mocks.isUnknownMutationOutcome,
  isUnknownMutationWriteOutcome: mocks.isUnknownMutationOutcome,
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
  program_name: "顯恩堂主日學",
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
    from_date: hkTodayWallDate(),
    to_date: addWallDays(addWallMonths(hkTodayWallDate(), 3), -1),
    rule_count: 1,
    created_at: "2026-09-16T00:00:00.000Z",
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
  updated_at: "2026-01-01T00:00:00.000Z",
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
  updated_at: "2026-01-01T00:00:00.000Z",
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
  mocks.updateProgram.mockResolvedValue({ program });
  mocks.listEvents.mockResolvedValue({ events: [event] });
  mocks.listEnrollmentRequests.mockResolvedValue({ requests: [request] });
  mocks.listEnrollmentApprovalRuns.mockResolvedValue({ runs: [] });
  mocks.listEnrollments.mockResolvedValue({ enrollments: [enrollment] });
  mocks.listEnrollmentSnapshot.mockResolvedValue({
    requests: [request],
    enrollments: [enrollment],
  });
}
beforeEach(() => {
  clearEventCreateDraft("program-1");
  clearManagementDraftsForEntity("program-1");
  clearWorkspaceMutationRecovery("event", {
    programId: "program-1",
    eventId: "event-1",
  });
  clearWorkspaceMutationRecovery("events", { programId: "program-1" });
  clearGenerationRecovery("program-1");
  mocks.getManagementProgram.mockReset();
  mocks.updateProgram.mockReset();
  mocks.listEvents.mockReset();
  mocks.listEnrollmentRequests.mockReset();
  mocks.listEnrollments.mockReset();
  mocks.listEnrollmentSnapshot.mockReset();
  mocks.listEnrollmentApprovalRuns.mockReset();
  mocks.startEnrollmentApprovalRun.mockReset();
  mocks.reconcileEnrollmentApprovalRun.mockReset();
  mocks.continueEnrollmentApprovalRun.mockReset();
  mocks.cancelEnrollmentApprovalRun.mockReset();
  mocks.assistedEnroll.mockReset();
  mocks.cancelEnrollment.mockReset();
  mocks.searchMemberOptions.mockReset();
  mocks.createEvent.mockReset();
  mocks.cancelEvent.mockReset();
  mocks.createScheduleException.mockReset();
  mocks.deleteScheduleException.mockReset();
  mocks.listScheduleExceptions.mockReset();
  mocks.listScheduleRules.mockReset();
  mocks.previewEvents.mockReset();
  mocks.generateEvents.mockReset();
  mocks.listScheduleRules.mockResolvedValue({ rules: [rule] });
  mocks.listScheduleExceptions.mockResolvedValue({ exceptions: [] });
});
afterEach(() => {
  clearEventCreateDraft("program-1");
  clearManagementDraftsForEntity("program-1");
  clearGenerationRecovery("program-1");
  clearWorkspaceMutationRecovery("event", {
    programId: "program-1",
    eventId: "event-1",
  });
  clearWorkspaceMutationRecovery("events", { programId: "program-1" });
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
    const onTaskChange = vi.fn<(...args: unknown[]) => void>();
    const onEventChange = vi.fn();
    const onOpenAttendance = vi.fn();
    render(
      <ProgramWorkspace
        programId="program-1"
        onBack={vi.fn()}
        onTaskChange={onTaskChange}
        onEventChange={onEventChange}
        onOpenAttendance={onOpenAttendance}
      />
    );

    // Header with title, department context, and lifecycle pill
    await expect(
      screen.findByRole("heading", { name: "查經小組" })
    ).resolves.toBeInTheDocument();
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
    const rosterLink = screen.getByRole("link", {
      name: COPY.programs.cockpitManageRoster,
    });
    await userEvent.click(rosterLink);
    expect(onEventChange).not.toHaveBeenCalled();
    expect(onTaskChange).not.toHaveBeenCalled();
    expect(onOpenAttendance).toHaveBeenCalledExactlyOnceWith("event-1");
    expect(rosterLink).toHaveAttribute("href", "/events?eventId=event-1");

    // 2-up operational tiles
    expect(
      screen.getByRole("heading", { name: COPY.programs.cockpitOperations })
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.cockpitWeeklyWork)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: new RegExp(`${COPY.programs.cockpitEventsTile}.*5 個聚會`, "u"),
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: new RegExp(
          `${COPY.programs.cockpitParticipantsTile}.*待審批報名 ×3`,
          "u"
        ),
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
      screen.getByRole("link", {
        name: new RegExp(COPY.programs.workspaceTaskSettingsLead, "u"),
      })
    ).toBeInTheDocument();
    const scheduleLink = screen.getByRole("link", {
      name: new RegExp(COPY.programs.workspaceTaskSchedule, "u"),
    });
    expect(scheduleLink).toHaveAttribute(
      "href",
      expect.stringContaining("task=schedule")
    );
    const addEventLink = screen.getByRole("link", {
      name: new RegExp(COPY.programs.cockpitAddEvent, "u"),
    });
    expect(addEventLink).toHaveAttribute(
      "href",
      expect.stringContaining("#create-event")
    );

    // Sibling navigation stays persistent on the overview and exposes only
    // server-authorized workspace destinations.
    const workspaceNav = screen.getByRole("navigation", {
      name: COPY.programs.workspaceTaskLabel,
    });
    expect(
      within(workspaceNav).getByRole("link", {
        name: COPY.programs.workspaceOverviewTab,
      })
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(workspaceNav).getByRole("link", {
        name: COPY.programs.workspaceTaskEvents,
      })
    ).toBeInTheDocument();
    expect(
      within(workspaceNav).getByRole("link", {
        name: COPY.programs.workspaceTaskParticipants,
      })
    ).toBeInTheDocument();
    expect(
      within(workspaceNav).getByRole("link", {
        name: COPY.programs.workspaceSettingsTab,
      })
    ).toBeInTheDocument();
    expect(
      within(workspaceNav).queryByRole("link", {
        name: COPY.programs.workspaceTaskNotifications,
      })
    ).not.toBeInTheDocument();
  });

  test("orders Overview as identity, current or next Event, compact counts, then destinations", async () => {
    mocks.getManagementProgram.mockResolvedValue({
      program,
      department,
      modules,
      cockpit: cockpitWithNext,
    });
    mocks.listEvents.mockResolvedValue({ events: [event] });
    mocks.listEnrollmentRequests.mockResolvedValue({ requests: [request] });
    mocks.listEnrollments.mockResolvedValue({ enrollments: [enrollment] });
    render(
      <ProgramWorkspace
        programId="program-1"
        onBack={vi.fn()}
        onTaskChange={vi.fn<(...args: unknown[]) => void>()}
      />
    );

    await expect(
      screen.findByRole("heading", { name: "查經小組" })
    ).resolves.toBeInTheDocument();
    const order = screen
      .getAllByRole("heading")
      .map((heading) => heading.textContent ?? "");
    const positionOf = (label: string) => order.indexOf(label);
    expect(positionOf(COPY.programs.cockpitNextMeeting)).toBeGreaterThan(-1);
    expect(positionOf(COPY.programs.cockpitNextMeeting)).toBeLessThan(
      positionOf(COPY.programs.cockpitSummary)
    );
    expect(positionOf(COPY.programs.cockpitSummary)).toBeLessThan(
      positionOf(COPY.programs.cockpitOperations)
    );
    expect(positionOf(COPY.programs.cockpitOperations)).toBeLessThan(
      positionOf(COPY.programs.cockpitOthers)
    );
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
        onBack={vi.fn<(...args: unknown[]) => void>()}
        onTaskChange={vi.fn<(...args: unknown[]) => void>()}
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
      screen.queryByRole("link", { name: COPY.programs.cockpitManageRoster })
    ).not.toBeInTheDocument();

    // Operational tiles still render with live counts
    await expect(
      screen.findByRole("link", {
        name: new RegExp(`${COPY.programs.cockpitEventsTile}.*2 個聚會`, "u"),
      })
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: new RegExp(
          `${COPY.programs.cockpitParticipantsTile}.*${COPY.programs.cockpitNoPending}`,
          "u"
        ),
      })
    ).toBeInTheDocument();
  });

  test("keeps unavailable summary counts explicit and retries the failed read", async () => {
    mocks.getManagementProgram.mockResolvedValue({
      program,
      department,
      modules,
      cockpit: cockpitWithNext,
    });
    mocks.listEvents.mockResolvedValue({ events: [event] });
    mocks.listEnrollmentRequests.mockResolvedValue({ requests: [] });
    mocks.listEnrollments
      .mockRejectedValueOnce(new RpcError({ code: "FORBIDDEN", status: 403 }))
      .mockResolvedValue({ enrollments: [enrollment] });
    render(
      <ProgramWorkspace
        programId="program-1"
        onBack={vi.fn<(...args: unknown[]) => void>()}
        onTaskChange={vi.fn<(...args: unknown[]) => void>()}
      />
    );

    await expect(
      screen.findByRole("heading", { name: "查經小組" })
    ).resolves.toBeInTheDocument();
    const activeMetric = screen.getByText(
      COPY.programs.cockpitActiveParticipants
    ).parentElement as HTMLElement;
    expect(within(activeMetric).getByText("—")).toBeInTheDocument();
    await expect(
      screen.findByText(COPY.error.forbidden)
    ).resolves.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.workspaceRetry })
    );
    await waitFor(() => {
      expect(mocks.listEnrollments).toHaveBeenCalledTimes(2);
      expect(within(activeMetric).getByText("1")).toBeInTheDocument();
    });
  });

  test("retries an unavailable cockpit through the workspace loader", async () => {
    mocks.getManagementProgram
      .mockResolvedValueOnce({
        program,
        department,
        modules,
        cockpit: null,
      })
      .mockResolvedValue({
        program,
        department,
        modules,
        cockpit: cockpitWithNext,
      });
    mocks.listEvents.mockResolvedValue({ events: [event] });
    mocks.listEnrollmentRequests.mockResolvedValue({ requests: [] });
    mocks.listEnrollments.mockResolvedValue({ enrollments: [enrollment] });
    render(
      <ProgramWorkspace
        programId="program-1"
        onBack={vi.fn<(...args: unknown[]) => void>()}
        onTaskChange={vi.fn<(...args: unknown[]) => void>()}
      />
    );

    await expect(
      screen.findByRole("heading", { name: "查經小組" })
    ).resolves.toBeInTheDocument();
    await screen.findAllByText(COPY.programs.workspaceSummaryUnavailable);
    expect(
      screen.getAllByRole("button", { name: COPY.programs.workspaceRetry })
    ).toHaveLength(1);

    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.workspaceRetry })
    );
    await waitFor(() => {
      expect(mocks.getManagementProgram).toHaveBeenCalledTimes(2);
      expect(
        screen.getByRole("link", {
          name: COPY.programs.cockpitManageRoster,
        })
      ).toBeInTheDocument();
    });
  });

  test("filters unavailable Events and carries exact Program plus Event context", async () => {
    const earliestEvent: ProgramEvent = {
      ...event,
      event_id: "event-earliest",
      name: "最早聚會",
      starts_at: "2099-08-20T11:00:00.000Z",
      ends_at: "2099-08-20T13:00:00.000Z",
      location: "小組室",
      availability: "Active",
    };
    const laterEvent: ProgramEvent = {
      ...earliestEvent,
      event_id: "event-later",
      name: "較後聚會",
      starts_at: "2099-08-27T11:00:00.000Z",
      ends_at: "2099-08-27T13:00:00.000Z",
    };
    const unavailableEvent: ProgramEvent = {
      ...earliestEvent,
      event_id: "event-unavailable",
      name: "不可用聚會",
      starts_at: "2099-08-13T11:00:00.000Z",
      ends_at: "2099-08-13T13:00:00.000Z",
      availability: "Inactive",
    };
    mocks.getManagementProgram.mockResolvedValue({
      program,
      department,
      modules,
    });
    mocks.listEvents.mockResolvedValue({
      events: [laterEvent, unavailableEvent, earliestEvent],
    });
    mocks.listEnrollmentRequests.mockResolvedValue({ requests: [] });
    mocks.listEnrollments.mockResolvedValue({ enrollments: [] });
    const onTaskChange = vi.fn<(...args: unknown[]) => void>();
    render(
      <ProgramWorkspace
        programId="program-1"
        onBack={vi.fn<(...args: unknown[]) => void>()}
        onTaskChange={onTaskChange}
      />
    );

    await expect(
      screen.findByRole("heading", { name: "查經小組" })
    ).resolves.toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.listEvents).toHaveBeenCalledWith("program-1")
    );
    expect(screen.queryByText("不可用聚會")).not.toBeInTheDocument();
    await expect(
      screen.findByRole("link", {
        name: new RegExp(`${COPY.programs.cockpitEventsTile}.*2 個聚會`, "u"),
      })
    ).resolves.toBeInTheDocument();

    const rosterLink = screen.getByRole("link", {
      name: COPY.programs.cockpitManageRoster,
    });
    expect(rosterLink).toHaveAttribute(
      "href",
      "/programs?mode=management&program=program-1&task=events&event=event-earliest"
    );
    await userEvent.click(rosterLink);
    expect(onTaskChange).toHaveBeenCalledWith("events", "event-earliest");
  });

  test("renders an authoritative zero Event count without inventing a next Event", async () => {
    mocks.getManagementProgram.mockResolvedValue({
      program,
      department,
      modules,
      cockpit: {
        ...cockpitNoNext,
        active_event_count: 0,
      },
    });
    render(
      <ProgramWorkspace
        programId="program-1"
        onBack={vi.fn<(...args: unknown[]) => void>()}
        onTaskChange={vi.fn<(...args: unknown[]) => void>()}
      />
    );

    await expect(
      screen.findByRole("heading", { name: "查經小組" })
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: new RegExp(`${COPY.programs.cockpitEventsTile}.*0 個聚會`, "u"),
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.programs.cockpitNextMeeting)
    ).not.toBeInTheDocument();
  });

  test("gives managers one action when no Event is open for check-in", async () => {
    mockWorkspace();
    mocks.getManagementProgram.mockResolvedValue({
      program,
      department,
      modules,
      cockpit: {
        ...cockpitNoNext,
        open_events: [],
      },
    });
    const onTaskChange = vi.fn<(...args: unknown[]) => void>();
    render(
      <ProgramWorkspace
        programId="program-1"
        onBack={vi.fn<(...args: unknown[]) => void>()}
        onTaskChange={onTaskChange}
      />
    );

    await screen.findByRole("heading", {
      name: COPY.programs.cockpitOpenMeetings,
    });
    expect(
      screen.getByText(COPY.programs.cockpitNoOpenCheckIn)
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.cockpitViewEvents })
    );
    expect(onTaskChange).toHaveBeenCalledWith("events");
  });

  test("offers a truthful choice when more than one Event is open for check-in", async () => {
    const openA = {
      ...cockpitWithNext.next_event,
      event_id: "event-open-a",
      title: "開放聚會 A",
      name: "開放聚會 A",
    };
    const openB = {
      ...cockpitWithNext.next_event,
      event_id: "event-open-b",
      title: "開放聚會 B",
      name: "開放聚會 B",
    };
    mocks.getManagementProgram.mockResolvedValue({
      program,
      department,
      modules,
      cockpit: {
        ...cockpitWithNext,
        next_event: openA,
        open_events: [openA, openB],
      },
    });

    render(
      <ProgramWorkspace
        programId="program-1"
        onBack={vi.fn<(...args: unknown[]) => void>()}
        onTaskChange={vi.fn<(...args: unknown[]) => void>()}
      />
    );

    await screen.findByRole("heading", {
      name: COPY.programs.cockpitOpenMeetings,
    });
    expect(screen.getByRole("link", { name: /開放聚會 A/u })).toHaveAttribute(
      "href",
      "/programs?mode=management&program=program-1&task=events&event=event-open-a"
    );
    expect(screen.getByRole("link", { name: /開放聚會 B/u })).toHaveAttribute(
      "href",
      "/programs?mode=management&program=program-1&task=events&event=event-open-b"
    );
  });

  test("keeps Overview read-only and places course editing under Settings", async () => {
    mockWorkspace();
    render(
      <ProgramWorkspace
        programId="program-1"
        onBack={vi.fn<(...args: unknown[]) => void>()}
        onTaskChange={vi.fn<(...args: unknown[]) => void>()}
      />
    );

    await expect(
      screen.findByRole("heading", { name: "查經小組" })
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: COPY.programs.cockpitEditProgram,
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: new RegExp(COPY.programs.cockpitCourseFacts, "u"),
      })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: COPY.programs.workspaceSettingsTab })
    ).toBeInTheDocument();
  });

  test("renders the contextual notification action in the shared header", async () => {
    mockWorkspace();
    render(
      <ProgramWorkspace
        programId="program-1"
        onBack={vi.fn()}
        onTaskChange={vi.fn()}
        headerAction={<button type="button">通知</button>}
      />
    );

    await screen.findByRole("heading", { name: "查經小組" });
    const actions = document.querySelector("[data-route-header-actions]");
    expect(actions).not.toBeNull();
    expect(
      within(actions as HTMLElement).getByRole("button", { name: "通知" })
    ).toBeInTheDocument();
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

    const participantsLink = screen.getByRole("link", {
      name: COPY.programs.workspaceTaskParticipants,
    });
    expect(participantsLink).toHaveAttribute(
      "href",
      "/programs?mode=management&program=program-1&task=participants"
    );
    await userEvent.click(participantsLink);
    expect(onTaskChange).toHaveBeenCalledWith("participants");
  });

  test("renders the server-projected event exception in the Events task", async () => {
    mockWorkspace();
    mocks.listEvents.mockResolvedValue({
      events: [
        {
          ...event,
          exception: {
            exception_id: "exception-1",
            rule_id: "rule-1",
            override_date: "2030-08-20",
            action: "RESCHEDULE" as const,
            new_start_time: "20:30",
            new_end_time: "22:00",
            created_at: "2030-08-01T00:00:00.000Z",
          },
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
      screen.findByText(
        COPY.programs.eventRescheduledBadge.replace("{time}", "20:30")
      )
    ).resolves.toBeInTheDocument();
  });

  test("RP2.1 inline dirty joins the parent Back handshake; Continue keeps it, Discard clears it", async () => {
    mockWorkspace();
    const user = userEvent.setup();
    const targetLink = document.createElement("a");
    targetLink.href = "/programs?mode=management&program=program-1&task=events";
    targetLink.textContent = "聚會";
    document.body.append(targetLink);
    const onTaskChange = vi.fn();
    try {
      mocks.previewEvents.mockResolvedValue(plan);
      render(
        <ProgramWorkspace
          programId="program-1"
          task="schedule"
          onBack={vi.fn()}
          onTaskChange={onTaskChange}
        />
      );
      await user.click(
        await screen.findByRole("button", { name: COPY.programs.previewEvents })
      );
      const adjust = await screen.findAllByRole("button", {
        name: COPY.programs.previewAdjustOccurrence,
      });
      await user.click(adjust[0]);
      const dateInput = await screen.findByLabelText(
        COPY.programs.settingsExceptionNewDate
      );
      await user.clear(dateInput);
      await user.type(dateInput, "2026-09-17");
      // Close the Sheet via its dismiss affordance; the dirty draft stays.
      await user.click(screen.getByRole("button", { name: "Close" }));
      await waitFor(() =>
        expect(
          screen.queryByRole("heading", {
            name: COPY.programs.previewAdjustSheetTitle,
          })
        ).not.toBeInTheDocument()
      );
      // In-app navigation while inline-dirty opens Continue/Discard.
      await user.click(targetLink);
      await user.click(
        screen.getByRole("button", {
          name: COPY.programs.settingsContinueEditing,
        })
      );
      expect(onTaskChange).not.toHaveBeenCalled();
      // The edit survives Continue.
      expect(
        screen.getByText(COPY.programs.previewExceptionDraft)
      ).toBeInTheDocument();
      // Navigate again, then Discard: clears the occurrence draft and leaves.
      await user.click(targetLink);
      await user.click(
        screen.getByRole("button", {
          name: COPY.programs.settingsDiscardAndLeave,
        })
      );
      await waitFor(() =>
        expect(
          screen.queryByText(COPY.programs.previewExceptionDraft)
        ).not.toBeInTheDocument()
      );
      expect(onTaskChange).toHaveBeenCalledWith("events");
    } finally {
      targetLink.remove();
    }
  });

  test("returns focused Schedule to the Events task from the workspace Back link", async () => {
    mockWorkspace();
    const onBack = vi.fn();
    const onTaskChange = vi.fn();
    render(
      <ProgramWorkspace
        programId="program-1"
        task="schedule"
        onBack={onBack}
        onTaskChange={onTaskChange}
      />
    );

    const back = await screen.findByRole("link", {
      name: COPY.programs.workspaceBack,
    });
    await userEvent.click(back);

    expect(onTaskChange).toHaveBeenCalledWith("events");
    expect(onBack).not.toHaveBeenCalled();
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

  test("mounts the focused Settings task with all domain-owned groups", async () => {
    mockWorkspace();
    render(
      <ProgramWorkspace
        programId="program-1"
        task="settings"
        onBack={vi.fn()}
        onTaskChange={vi.fn()}
      />
    );

    await expect(
      screen.findByRole("heading", {
        name: COPY.programs.settingsHubTitle,
      })
    ).resolves.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "課程" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "參與" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "聚會" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "溝通" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "高風險操作" })
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", {
        name: /基本資料名稱、描述同分類/u,
      })
    );
    await expect(
      screen.findByRole("heading", {
        name: COPY.programs.settingsBasics,
      })
    ).resolves.toBeInTheDocument();
  });

  test("does not present a paginated notification page as a total", async () => {
    mockWorkspace();
    const notifications: ManagementNotificationItem[] = Array.from(
      { length: 21 },
      (_, index) => ({
        kind: "enrollment" as const,
        source_key: `enrollment-${index}`,
        source_revision: "1",
        read: false,
        actionable: true as const,
        count: 1,
        latest_submitted_at: "2026-09-16T00:00:00.000Z",
        program_id: program.program_id,
        program_name: program.name,
        department_id: department.department_id,
        department_name: department.name,
      })
    );
    const notificationState: ManagementNotificationState = {
      kind: "ready",
      notifications: {
        items: notifications,
        unread_count: notifications.length,
        has_more: true,
      },
    };
    render(
      <ProgramWorkspace
        programId="program-1"
        task="settings"
        notificationState={notificationState}
        onBack={vi.fn<(...args: unknown[]) => void>()}
        onTaskChange={vi.fn<(...args: unknown[]) => void>()}
      />
    );

    await screen.findByRole("heading", {
      name: COPY.programs.settingsHubTitle,
    });
    expect(screen.getByText(/至少 21 項 · 還有更多/u)).toBeInTheDocument();
    expect(screen.queryByText("未讀 21 · 共 21 項")).not.toBeInTheDocument();
  });

  test("keeps an archived write committed when the follow-up workspace read fails", async () => {
    const user = userEvent.setup();
    mocks.getManagementProgram.mockReset();
    mocks.getManagementProgram
      .mockResolvedValueOnce({ program, department, modules })
      .mockRejectedValueOnce(new Error("refresh unavailable"))
      .mockResolvedValueOnce({
        program: {
          ...program,
          lifecycle: "Archived",
          updated_at: "2026-01-02T00:00:00.000Z",
        },
        department,
        modules,
      });
    mocks.updateProgram.mockResolvedValue({
      program: {
        ...program,
        lifecycle: "Archived",
        updated_at: "2026-01-02T00:00:00.000Z",
      },
    });

    render(
      <ProgramWorkspace
        programId="program-1"
        task="settings"
        onBack={vi.fn<(...args: unknown[]) => void>()}
        onTaskChange={vi.fn<(...args: unknown[]) => void>()}
      />
    );

    await screen.findByRole("heading", {
      name: COPY.programs.settingsHubTitle,
    });
    await user.click(
      screen.getByRole("button", { name: /封存課程停止一般使用/u })
    );
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.settingsHubArchiveConfirm,
      })
    );

    await waitFor(() =>
      expect(
        screen.getByTestId("program-workspace-freshness")
      ).toHaveTextContent(COPY.programs.workspaceSavedStale)
    );
    expect(mocks.updateProgram).toHaveBeenCalledOnce();
    const refreshButtons = screen.getAllByRole("button", {
      name: COPY.programs.workspaceRetryRefresh,
    });
    expect(refreshButtons.length).toBeGreaterThan(1);

    await user.click(refreshButtons.at(-1) as HTMLButtonElement);
    await screen.findByText(COPY.programs.settingsArchiveSaved);
    expect(mocks.updateProgram).toHaveBeenCalledOnce();
    expect(mocks.getManagementProgram).toHaveBeenCalledTimes(3);
  });

  test("keeps a revision-rejected workspace refresh stale", async () => {
    const user = userEvent.setup();
    const latestProgram = {
      ...program,
      name: "最新課程名稱",
      updated_at: "2026-01-02T00:00:00.000Z",
    };
    const olderProgram = {
      ...program,
      name: "舊課程名稱",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    mocks.getManagementProgram.mockReset();
    mocks.getManagementProgram
      .mockResolvedValueOnce({
        program: latestProgram,
        department,
        modules,
        cockpit: { ...cockpitWithNext, updated_at: "2026-01-02T00:00:00.000Z" },
      })
      .mockResolvedValueOnce({
        program: olderProgram,
        department,
        modules,
        cockpit: { ...cockpitWithNext, updated_at: "2026-01-01T00:00:00.000Z" },
      });
    mocks.updateProgram.mockResolvedValue({
      program: { ...latestProgram, lifecycle: "Archived" },
    });

    render(
      <ProgramWorkspace
        programId="program-1"
        task="settings"
        onBack={vi.fn()}
        onTaskChange={vi.fn()}
      />
    );

    await screen.findByRole("heading", {
      name: COPY.programs.settingsHubTitle,
    });
    await user.click(
      screen.getByRole("button", { name: /封存課程停止一般使用/u })
    );
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.settingsHubArchiveConfirm,
      })
    );

    await waitFor(() =>
      expect(
        screen.getByTestId("program-workspace-freshness")
      ).toHaveTextContent(COPY.programs.workspaceSavedStale)
    );
    expect(
      screen.getByRole("heading", { name: "最新課程名稱" })
    ).toBeInTheDocument();
    expect(screen.queryByText("舊課程名稱")).not.toBeInTheDocument();
    expect(
      screen.queryByText(COPY.programs.settingsArchiveSaved)
    ).not.toBeInTheDocument();
  });

  test("reconciles a response-lost archive without replaying the write", async () => {
    const user = userEvent.setup();
    mocks.getManagementProgram.mockReset();
    mocks.getManagementProgram
      .mockResolvedValueOnce({ program, department, modules })
      .mockResolvedValueOnce({
        program: {
          ...program,
          lifecycle: "Archived",
          updated_at: "2026-01-02T00:00:00.000Z",
        },
        department,
        modules,
      });
    mocks.updateProgram.mockRejectedValueOnce(new Error("response lost"));

    render(
      <ProgramWorkspace
        programId="program-1"
        task="settings"
        onBack={vi.fn<(...args: unknown[]) => void>()}
        onTaskChange={vi.fn<(...args: unknown[]) => void>()}
      />
    );
    await screen.findByRole("heading", {
      name: COPY.programs.settingsHubTitle,
    });
    await user.click(
      screen.getByRole("button", { name: /封存課程停止一般使用/u })
    );
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.settingsHubArchiveConfirm,
      })
    );

    await expect(
      screen.findByText(COPY.programs.settingsArchiveSaved)
    ).resolves.toBeInTheDocument();
    expect(mocks.updateProgram).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", {
        name: COPY.programs.workspaceRetryRefresh,
      })
    ).not.toBeInTheDocument();
  });

  test("focused Settings uses one task header and Back without a duplicate root header", async () => {
    mockWorkspace();
    render(
      <ProgramWorkspace
        programId="program-1"
        task="settings"
        onBack={vi.fn()}
        onTaskChange={vi.fn()}
        headerAction={<button type="button">通知</button>}
      />
    );

    await userEvent.click(
      await screen.findByRole("button", {
        name: /基本資料名稱、描述同分類/u,
      })
    );

    const headers = document.querySelectorAll(
      '[data-screen-foundation="header"]'
    );
    expect(headers).toHaveLength(1);
    expect(
      document.querySelector(
        '[data-screen-foundation="header"][data-screen-level="root"]'
      )
    ).toBeNull();
    expect(
      document.querySelector(
        '[data-screen-foundation="header"][data-screen-level="child"]'
      )
    ).not.toBeNull();
    expect(
      document.querySelector(
        'section[aria-labelledby="program-settings-focused-title"]'
      )
    ).not.toBeNull();
    expect(
      document.querySelector(
        'section[aria-labelledby="programs-workspace-title"]'
      )
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: COPY.programs.settingsBackToHub })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.settingsBackToHub })
    ).not.toBeInTheDocument();
    const actions = document.querySelector("[data-route-header-actions]");
    expect(actions).not.toBeNull();
    expect(
      within(actions as HTMLElement).getByRole("button", { name: "通知" })
    ).toBeInTheDocument();
  });

  test("protects dirty Settings navigation until the draft is discarded", async () => {
    mockWorkspace();
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onTaskChange = vi.fn();
    render(
      <ProgramWorkspace
        programId="program-1"
        task="settings"
        onBack={onBack}
        onTaskChange={onTaskChange}
      />
    );

    await user.click(
      await screen.findByRole("button", {
        name: /基本資料名稱、描述同分類/u,
      })
    );
    const name = screen.getByRole("textbox", {
      name: COPY.programs.programName,
    });
    await user.clear(name);
    await user.type(name, "未儲存名稱");

    await user.click(
      screen.getByRole("link", { name: COPY.programs.settingsBackToHub })
    );
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.settingsContinueEditing,
      })
    );

    expect(
      screen.getByRole("heading", { name: COPY.programs.settingsBasics })
    ).toBeInTheDocument();
    expect(name).toHaveValue("未儲存名稱");
    expect(onBack).not.toHaveBeenCalled();
    expect(onTaskChange).toHaveBeenCalledWith(
      "schedule",
      undefined,
      "settings"
    );
    expect(
      screen.getByText(
        `${COPY.programs.settingsUnsaved} ${COPY.programs.settingsSaveBasics} / ${COPY.programs.settingsDiscard}`
      )
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("program-settings-dirty-actions")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.settingsSaveBasics })
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: COPY.programs.settingsDiscard })
    ).toBeEnabled();
    await user.click(
      screen.getByRole("link", {
        name: COPY.programs.workspaceOverviewTab,
      })
    );
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.settingsContinueEditing,
      })
    );
    expect(
      screen.getByRole("heading", { name: COPY.programs.settingsBasics })
    ).toBeInTheDocument();
    expect(onTaskChange).toHaveBeenCalledWith(
      "schedule",
      undefined,
      "settings"
    );

    await user.click(
      screen.getByRole("button", { name: COPY.programs.settingsDiscard })
    );
    await waitFor(() => expect(name).toHaveValue(program.name));
    expect(
      document.querySelector('[data-screen-settings-dirty="true"]')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("program-settings-dirty-actions")
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("link", { name: COPY.programs.settingsBackToHub })
    );
    await expect(
      screen.findByRole("heading", { name: COPY.programs.settingsHubTitle })
    ).resolves.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: /基本資料名稱、描述同分類/u,
      })
    );
    await user.click(
      screen.getByRole("link", { name: COPY.programs.settingsBackToHub })
    );
    await expect(
      screen.findByRole("heading", { name: COPY.programs.settingsHubTitle })
    ).resolves.toBeInTheDocument();
  });

  test("protects a hidden Preview draft from the Settings hub", async () => {
    mockWorkspace();
    const user = userEvent.setup();
    const onTaskChange = vi.fn();
    const draftAction = "settings-exception:rule-1:2099-01-01";
    writeManagementDraft("program-1", draftAction, {
      action: "RESCHEDULE",
      newDate: "2099-01-02",
      newStartTime: "19:30",
      newEndTime: "21:00",
    });
    render(
      <ProgramWorkspace
        programId="program-1"
        task="settings"
        onBack={vi.fn()}
        onTaskChange={onTaskChange}
      />
    );

    await screen.findByRole("button", {
      name: /基本資料名稱、描述同分類/u,
    });
    await user.click(
      screen.getByRole("link", { name: COPY.programs.workspaceOverviewTab })
    );
    expect(
      screen.getByRole("button", {
        name: COPY.programs.settingsContinueEditing,
      })
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.settingsContinueEditing,
      })
    );
    expect(onTaskChange).toHaveBeenCalledWith(
      "schedule",
      undefined,
      "settings"
    );
    expect(
      window.sessionStorage.getItem(
        "efcc_management_draft:program-1:settings-exception%3Arule-1%3A2099-01-01"
      )
    ).not.toBeNull();
  });

  test("preserves a requested Settings section when discarding a dirty draft", async () => {
    mockWorkspace();
    const user = userEvent.setup();
    const onSettingsSectionChange = vi.fn<(...args: unknown[]) => void>();
    const requestedSection = document.createElement("a");
    requestedSection.href =
      "/programs?mode=management&program=program-1&task=settings&settingsSection=publishing";
    requestedSection.textContent = "發佈設定";
    document.body.append(requestedSection);
    const laterSection = document.createElement("a");
    laterSection.href =
      "/programs?mode=management&program=program-1&task=settings&settingsSection=attendance";
    laterSection.textContent = "出席設定";
    document.body.append(laterSection);

    try {
      render(
        <ProgramWorkspace
          programId="program-1"
          task="settings"
          settingsSection="basics"
          onSettingsSectionChange={onSettingsSectionChange}
          onBack={() => {}}
          onTaskChange={vi.fn<(...args: unknown[]) => void>()}
        />
      );

      await user.click(
        await screen.findByRole("textbox", {
          name: COPY.programs.programName,
        })
      );
      const name = screen.getByRole("textbox", {
        name: COPY.programs.programName,
      });
      await user.clear(name);
      await user.type(name, "未儲存基本資料");
      fireEvent.click(requestedSection);
      await user.click(
        screen.getByRole("button", {
          name: COPY.programs.settingsContinueEditing,
        })
      );
      fireEvent.click(laterSection);

      await user.click(
        screen.getByRole("button", {
          name: COPY.programs.settingsDiscardAndLeave,
        })
      );
      expect(onSettingsSectionChange).toHaveBeenCalledWith("publishing");
    } finally {
      requestedSection.remove();
      laterSection.remove();
    }
  });

  test("reaches the overview after discarding a dirty Settings route", async () => {
    mockWorkspace();
    const user = userEvent.setup();
    render(<StatefulWorkspaceHarness initialTask="settings" />);

    await user.click(
      await screen.findByRole("button", {
        name: /基本資料名稱、描述同分類/u,
      })
    );
    await user.type(
      screen.getByRole("textbox", { name: COPY.programs.programName }),
      "未儲存設定"
    );
    await user.click(
      screen.getByRole("link", { name: COPY.programs.workspaceOverviewTab })
    );
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.settingsDiscardAndLeave,
      })
    );

    await expect(
      screen.findByRole("heading", { level: 1, name: program.name })
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: COPY.programs.settingsHubTitle })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  test("protects workspace navigation while an Event creation draft is dirty", async () => {
    mockWorkspace();
    const user = userEvent.setup();
    const onTaskChange = vi.fn();
    render(
      <ProgramWorkspace
        programId="program-1"
        task="events"
        onBack={vi.fn()}
        onTaskChange={onTaskChange}
      />
    );

    await user.click(
      await screen.findByRole("button", { name: COPY.programs.createMeeting })
    );
    const name = screen.getByRole("textbox", {
      name: COPY.programs.eventName,
    });
    await user.type(name, "未儲存聚會");
    await waitFor(() => {
      expect(readEventCreateDraft("program-1")?.name).toBe("未儲存聚會");
    });

    await user.click(
      screen.getByRole("link", { name: COPY.programs.workspaceOverviewTab })
    );
    expect(onTaskChange).not.toHaveBeenCalled();
    expect(
      screen.getByTestId("program-event-draft-navigation-blocked")
    ).toHaveTextContent(COPY.programs.eventCreateUnsaved);
    expect(name).toHaveValue("未儲存聚會");

    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.eventCreateContinueEditing,
      })
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.eventCreateCancel })
    );
    await waitFor(() => {
      expect(readEventCreateDraft("program-1")).toBeNull();
    });
    await user.click(
      screen.getByRole("link", { name: COPY.programs.workspaceOverviewTab })
    );
    expect(onTaskChange).toHaveBeenCalledWith(null);
  });

  test("prioritizes Settings recovery and preserves Event drafts", async () => {
    mockWorkspace();
    const user = userEvent.setup();
    const onTaskChange = vi.fn();
    writeManagementDraft("program-1", SETTINGS_DRAFT_ACTION.basics, {
      name: "未儲存設定",
    });
    render(
      <ProgramWorkspace
        programId="program-1"
        task="events"
        onBack={vi.fn()}
        onTaskChange={onTaskChange}
      />
    );

    await user.click(
      await screen.findByRole("button", { name: COPY.programs.createMeeting })
    );
    await user.type(
      screen.getByRole("textbox", { name: COPY.programs.eventName }),
      "未儲存聚會"
    );
    await user.click(
      screen.getByRole("link", { name: COPY.programs.workspaceOverviewTab })
    );
    expect(
      screen.getByRole("button", {
        name: COPY.programs.settingsContinueEditing,
      })
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.settingsDiscardAndLeave,
      })
    );
    expect(readEventCreateDraft("program-1")?.name).toBe("未儲存聚會");
    expect(onTaskChange).toHaveBeenCalledWith(null);
  });

  test("reaches the overview after discarding a dirty Event route", async () => {
    mockWorkspace();
    const user = userEvent.setup();
    render(<StatefulWorkspaceHarness initialTask="events" />);

    await user.click(
      await screen.findByRole("button", { name: COPY.programs.createMeeting })
    );
    await user.type(
      screen.getByRole("textbox", { name: COPY.programs.eventName }),
      "未儲存聚會"
    );
    await user.click(
      screen.getByRole("link", { name: COPY.programs.workspaceOverviewTab })
    );
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.eventCreateDiscardAndLeave,
      })
    );

    await expect(
      screen.findByRole("heading", { level: 1, name: program.name })
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.createMeeting })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  test("opens the Event draft decision dialog on browser Back", async () => {
    mockWorkspace();
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(
      <ProgramWorkspace
        programId="program-1"
        task="events"
        onBack={onBack}
        onTaskChange={vi.fn()}
      />
    );

    await user.click(
      await screen.findByRole("button", { name: COPY.programs.createMeeting })
    );
    await user.type(
      screen.getByRole("textbox", { name: COPY.programs.eventName }),
      "瀏覽器返回未儲存"
    );
    await waitFor(() => {
      expect(readEventCreateDraft("program-1")?.name).toBe("瀏覽器返回未儲存");
    });

    window.dispatchEvent(new PopStateEvent("popstate"));
    await expect(
      screen.findByRole("heading", {
        name: COPY.programs.eventCreateLeaveTitle,
      })
    ).resolves.toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.eventCreateContinueEditing,
      })
    );
    expect(
      screen.getByRole("textbox", { name: COPY.programs.eventName })
    ).toHaveValue("瀏覽器返回未儲存");
  });

  test("locks manager lifecycle navigation until an unknown Event mutation reconciles", async () => {
    mockWorkspace();
    const detail = {
      event: {
        ...event,
        starts_at: "2026-09-12T10:00:00.000Z",
        ends_at: "2026-09-12T11:30:00.000Z",
        source: "MANUAL" as const,
        name: "迎新聚會",
        location: "教會禮堂",
        has_attendance: false,
      },
      leaders: [],
      participant_summary: { active_enrollments: 0, checked_in: 0 },
    };
    mocks.getEvent.mockResolvedValueOnce(detail).mockResolvedValueOnce({
      ...detail,
      event: {
        ...detail.event,
        status: "Cancelled" as const,
        updated_at: "2026-01-02T00:00:00.000Z",
      },
    });
    mocks.cancelEvent.mockRejectedValueOnce(new Error("request lost"));
    const user = userEvent.setup();
    const onEventChange = vi.fn();
    const outsideLink = document.createElement("a");
    outsideLink.href = "/home";
    outsideLink.textContent = "Home";
    document.body.append(outsideLink);
    try {
      render(
        <ProgramWorkspace
          programId="program-1"
          task="events"
          eventId="event-1"
          onBack={vi.fn<(...args: unknown[]) => void>()}
          onTaskChange={vi.fn<(...args: unknown[]) => void>()}
          onEventChange={onEventChange}
        />
      );

      await screen.findByRole("heading", { name: "迎新聚會" });
      await user.click(
        screen.getByRole("button", { name: COPY.programs.eventMoreActions })
      );
      await user.click(
        screen.getByRole("menuitem", { name: COPY.programs.cancelEvent })
      );
      await user.click(
        screen.getByRole("button", { name: COPY.programs.confirmCancel })
      );

      await screen.findByText(COPY.programs.programTransportAmbiguous);
      const navigation = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
      });
      outsideLink.dispatchEvent(navigation);
      expect(navigation.defaultPrevented).toBeTruthy();
      const beforeUnload = new Event("beforeunload", { cancelable: true });
      expect(window.dispatchEvent(beforeUnload)).toBeFalsy();
      const blockedHref = window.location.href;
      window.dispatchEvent(new PopStateEvent("popstate"));
      expect(window.location.href).toBe(blockedHref);
      expect(onEventChange).not.toHaveBeenCalled();

      await user.click(
        screen.getByRole("button", {
          name: COPY.programs.workspaceRetryRefresh,
        })
      );
      await screen.findByText(COPY.programs.workspaceReconciled);
      const cleanBeforeUnload = new Event("beforeunload", {
        cancelable: true,
      });
      expect(window.dispatchEvent(cleanBeforeUnload)).toBeTruthy();
    } finally {
      outsideLink.remove();
    }
  });

  test("shows Save/Discard guidance when a dirty draft blocks the first tab escape", async () => {
    mockWorkspace();
    const user = userEvent.setup();
    const onTaskChange = vi.fn();
    render(
      <ProgramWorkspace
        programId="program-1"
        task="settings"
        onBack={vi.fn()}
        onTaskChange={onTaskChange}
      />
    );

    await user.click(
      await screen.findByRole("button", {
        name: /基本資料名稱、描述同分類/u,
      })
    );
    const name = screen.getByRole("textbox", {
      name: COPY.programs.programName,
    });
    await user.clear(name);
    await user.type(name, "首次 Tab 未儲存名稱");

    await user.click(
      screen.getByRole("link", {
        name: COPY.programs.workspaceOverviewTab,
      })
    );
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.settingsContinueEditing,
      })
    );

    expect(
      screen.getByRole("heading", { name: COPY.programs.settingsBasics })
    ).toBeInTheDocument();
    expect(name).toHaveValue("首次 Tab 未儲存名稱");
    expect(onTaskChange).toHaveBeenCalledWith(
      "schedule",
      undefined,
      "settings"
    );
    expect(
      screen.getByText(
        `${COPY.programs.settingsUnsaved} ${COPY.programs.settingsSaveBasics} / ${COPY.programs.settingsDiscard}`
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.settingsSaveBasics })
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: COPY.programs.settingsDiscard })
    ).toBeEnabled();
  });

  test("protects external mode and global links while dirty and cleans up", async () => {
    mockWorkspace();
    const user = userEvent.setup();
    const modeClick = vi.fn();
    const globalClick = vi.fn();
    render(
      <>
        <a
          href="/programs?mode=participant"
          onClick={(event) => {
            modeClick();
            event.preventDefault();
          }}
        >
          模式
        </a>
        <a
          href="/home"
          onClick={(event) => {
            globalClick();
            event.preventDefault();
          }}
        >
          首頁
        </a>
      </>
    );
    const { unmount } = render(
      <ProgramWorkspace
        programId="program-1"
        task="settings"
        onBack={vi.fn()}
        onTaskChange={vi.fn()}
      />
    );

    await user.click(
      await screen.findByRole("button", {
        name: /基本資料名稱、描述同分類/u,
      })
    );
    const name = screen.getByRole("textbox", {
      name: COPY.programs.programName,
    });
    await user.clear(name);
    await user.type(name, "外部連結未儲存名稱");

    const beforeUnload = new Event("beforeunload", { cancelable: true });
    expect(window.dispatchEvent(beforeUnload)).toBeFalsy();
    await user.click(screen.getByRole("link", { name: "模式" }));
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.settingsContinueEditing,
      })
    );
    await user.click(screen.getByRole("link", { name: "首頁" }));
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.settingsContinueEditing,
      })
    );
    expect(modeClick).not.toHaveBeenCalled();
    expect(globalClick).not.toHaveBeenCalled();
    expect(name).toHaveValue("外部連結未儲存名稱");
    expect(
      screen.getByText(
        `${COPY.programs.settingsUnsaved} ${COPY.programs.settingsSaveBasics} / ${COPY.programs.settingsDiscard}`
      )
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: COPY.programs.settingsDiscard })
    );
    await waitFor(() =>
      expect(
        document.querySelector('[data-screen-settings-dirty="true"]')
      ).not.toBeInTheDocument()
    );
    await user.click(screen.getByRole("link", { name: "模式" }));
    await user.click(screen.getByRole("link", { name: "首頁" }));
    expect(modeClick).toHaveBeenCalledOnce();
    expect(globalClick).toHaveBeenCalledOnce();
    const cleanBeforeUnload = new Event("beforeunload", {
      cancelable: true,
    });
    expect(window.dispatchEvent(cleanBeforeUnload)).toBeTruthy();

    await user.clear(name);
    await user.type(name, "卸載前未儲存名稱");
    unmount();
    await user.click(screen.getByRole("link", { name: "模式" }));
    expect(modeClick).toHaveBeenCalledTimes(2);
    const unmountedBeforeUnload = new Event("beforeunload", {
      cancelable: true,
    });
    expect(window.dispatchEvent(unmountedBeforeUnload)).toBeTruthy();
  });

  test("passes through modified, new-tab, download, and hash links while dirty", async () => {
    mockWorkspace();
    const user = userEvent.setup();
    const modifiedClick = vi.fn();
    const newTabClick = vi.fn();
    const downloadClick = vi.fn();
    const hashClick = vi.fn();
    const preventNavigation =
      (callback: () => void) =>
      (event: React.MouseEvent<HTMLAnchorElement>) => {
        callback();
        event.preventDefault();
      };
    render(
      <>
        <a href="/home" onClick={preventNavigation(modifiedClick)}>
          修改鍵
        </a>
        <a
          href="/home"
          target="_blank"
          onClick={preventNavigation(newTabClick)}
        >
          新分頁
        </a>
        <a
          href="/program.csv"
          download="program.csv"
          onClick={preventNavigation(downloadClick)}
        >
          下載
        </a>
        <a href="#details" onClick={preventNavigation(hashClick)}>
          錨點
        </a>
        <ProgramWorkspace
          programId="program-1"
          task="settings"
          onBack={vi.fn<(...args: unknown[]) => void>()}
          onTaskChange={vi.fn()}
        />
      </>
    );

    await user.click(
      await screen.findByRole("button", {
        name: /基本資料名稱、描述同分類/u,
      })
    );
    const name = screen.getByRole("textbox", {
      name: COPY.programs.programName,
    });
    await user.clear(name);
    await user.type(name, "保留連結語意的未儲存名稱");

    fireEvent.click(screen.getByRole("link", { name: "修改鍵" }), {
      ctrlKey: true,
    });
    await user.click(screen.getByRole("link", { name: "新分頁" }));
    await user.click(screen.getByRole("link", { name: "下載" }));
    await user.click(screen.getByRole("link", { name: "錨點" }));

    expect(modifiedClick).toHaveBeenCalledOnce();
    expect(newTabClick).toHaveBeenCalledOnce();
    expect(downloadClick).toHaveBeenCalledOnce();
    expect(hashClick).toHaveBeenCalledOnce();
    expect(name).toHaveValue("保留連結語意的未儲存名稱");
    expect(
      document.querySelector('[data-screen-settings-dirty="true"]')
    ).toBeInTheDocument();
  });

  test("releases navigation guards after a successful Basics save", async () => {
    mockWorkspace();
    mocks.getManagementProgram
      .mockReset()
      .mockResolvedValueOnce({ program, department, modules })
      .mockResolvedValue({
        program: {
          ...program,
          name: "儲存後名稱",
          updated_at: "2026-01-02T00:00:00.000Z",
        },
        department,
        modules,
      });
    mocks.updateProgram.mockResolvedValueOnce({
      program: {
        ...program,
        name: "儲存後名稱",
        updated_at: "2026-01-02T00:00:00.000Z",
      },
    });
    const user = userEvent.setup();
    const exitClick = vi.fn();
    render(
      <>
        <a
          href="/home"
          onClick={(event) => {
            exitClick();
            event.preventDefault();
          }}
        >
          離開
        </a>
        <ProgramWorkspace
          programId="program-1"
          task="settings"
          onBack={vi.fn()}
          onTaskChange={vi.fn()}
        />
      </>
    );

    await user.click(
      await screen.findByRole("button", {
        name: /基本資料名稱、描述同分類/u,
      })
    );
    const name = screen.getByRole("textbox", {
      name: COPY.programs.programName,
    });
    await user.clear(name);
    await user.type(name, "儲存後名稱");
    expect(
      document.querySelector('[data-screen-settings-dirty="true"]')
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: COPY.programs.settingsSaveBasics })
    );
    await waitFor(() => expect(mocks.updateProgram).toHaveBeenCalledOnce());
    await expect(
      screen.findByText(COPY.programs.settingsSaved)
    ).resolves.toBeInTheDocument();
    await waitFor(() =>
      expect(
        document.querySelector('[data-screen-settings-dirty="true"]')
      ).not.toBeInTheDocument()
    );

    await user.click(screen.getByRole("link", { name: "離開" }));
    expect(exitClick).toHaveBeenCalledOnce();
    const cleanBeforeUnload = new Event("beforeunload", {
      cancelable: true,
    });
    expect(window.dispatchEvent(cleanBeforeUnload)).toBeTruthy();
  });

  test("hides identity access without an authorized Account Directory destination", async () => {
    mockWorkspace();
    render(
      <ProgramWorkspace
        programId="program-1"
        task="settings"
        onBack={vi.fn()}
        onTaskChange={vi.fn()}
      />
    );
    await screen.findByRole("heading", {
      name: COPY.programs.workspaceTaskSettings,
    });
    expect(
      screen.queryByRole("link", {
        name: COPY.programs.settingsHubAccess,
      })
    ).not.toBeInTheDocument();
  });

  test("routes authorized Program identity access into scoped Account Access", async () => {
    mocks.getManagementProgram.mockResolvedValue({
      program: {
        ...program,
        program_id: "program-1",
        capabilities: {
          ...program.capabilities,
          role_read: true,
          role_assign: true,
        },
      },
      department,
      modules,
    });
    render(
      <ProgramWorkspace
        programId="program-1"
        task="settings"
        onBack={vi.fn()}
        onTaskChange={vi.fn()}
      />
    );
    const link = await screen.findByRole("link", {
      name: COPY.programs.settingsHubAccess,
    });
    expect(link).toHaveAttribute(
      "href",
      "/management?module=accounts&scopeKind=Program&scopeId=program-1&view=access&return=%2Fprograms%3Fmode%3Dmanagement%26program%3Dprogram-1%26task%3Dsettings"
    );
  });

  test("Program Leader can reach scoped identity access without management tasks", async () => {
    mocks.getManagementProgram.mockResolvedValue({
      program: {
        ...program,
        capabilities: {
          ...program.capabilities,
          manage: false,
          leader_assign: true,
          role_read: true,
          role_assign: true,
        },
      },
      department,
      modules,
    });
    render(
      <WorkspaceRouteProvider
        value={{ departmentId: "dept-1", hash: "#overview" }}
      >
        <ProgramWorkspace
          programId="program-1"
          task="settings"
          onBack={vi.fn()}
          onTaskChange={vi.fn()}
        />
      </WorkspaceRouteProvider>
    );

    await expect(
      screen.findByRole("heading", {
        name: COPY.programs.workspaceTaskSettings,
      })
    ).resolves.toBeInTheDocument();
    const accessLink = screen.getByRole("link", {
      name: COPY.programs.settingsHubAccess,
    });
    expect(accessLink).toHaveAttribute(
      "href",
      "/management?module=accounts&scopeKind=Program&scopeId=program-1&view=access&return=%2Fprograms%3Fmode%3Dmanagement%26department%3Ddept-1%26program%3Dprogram-1%26task%3Dsettings%23overview"
    );
    expect(
      screen.queryByRole("link", {
        name: COPY.programs.workspaceTaskEvents,
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", {
        name: COPY.programs.workspaceTaskParticipants,
      })
    ).not.toBeInTheDocument();
  });

  test("keeps global Notifications out of the program workspace", async () => {
    mockWorkspace();
    render(
      <ProgramWorkspace
        programId="program-1"
        onBack={vi.fn()}
        onTaskChange={vi.fn()}
      />
    );

    await screen.findByRole("heading", { name: "查經小組" });
    expect(
      screen.queryByRole("button", {
        name: new RegExp(COPY.programs.notificationsTitle, "u"),
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", {
        name: COPY.programs.workspaceTaskNotifications,
      })
    ).not.toBeInTheDocument();
  });
});
describe("ENR-01 participants workspace", () => {
  test("renders pending, active, and history tabs from server state", async () => {
    mockWorkspace();
    const approvedEnrollment: Enrollment = {
      ...enrollment,
      enrollment_id: "enrollment-approved",
      member_user_id: request.member_user_id,
      request_id: request.request_id,
      member_name: request.member_name,
    };
    mocks.listEnrollmentSnapshot
      .mockResolvedValueOnce({
        requests: [request],
        enrollments: [enrollment],
      })
      .mockResolvedValueOnce({
        requests: [{ ...request, status: "Approved" }],
        enrollments: [enrollment, approvedEnrollment],
      });
    mocks.decideEnrollmentRequest.mockResolvedValue({
      request: { ...request, status: "Approved" },
      enrollment: approvedEnrollment,
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
    await expect(
      screen.findByRole("tab", {
        name: `${COPY.programs.tabsPending} (1)`,
      })
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByRole("tab", {
        name: `${COPY.programs.tabsPending} (1)`,
      })
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("tab", {
        name: `${COPY.programs.tabsActive} (1)`,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", {
        name: `${COPY.programs.tabsHistory} (0)`,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", {
        name: `${COPY.programs.tabsActive} (1)`,
      })
    ).toHaveAttribute("aria-controls", "participants-active-panel");
    expect(
      screen.getByRole("button", { name: COPY.programs.approve })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.reject })
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.approve })
    );
    await expect(
      screen.findByText(COPY.programs.decisionMade)
    ).resolves.toBeInTheDocument();
    await expect(
      screen.findByRole("tab", {
        name: `${COPY.programs.tabsActive} (2)`,
      })
    ).resolves.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("tab", {
        name: `${COPY.programs.tabsActive} (2)`,
      })
    );
    await expect(screen.findByText("陳同工")).resolves.toBeInTheDocument();
    await expect(screen.findByText("李同工")).resolves.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.approve })
    ).not.toBeInTheDocument();
  });

  test("keeps delayed scroll restoration after the initial tab settles", async () => {
    mockWorkspace();
    mocks.listEnrollmentSnapshot.mockResolvedValue({
      requests: [],
      enrollments: [enrollment],
    });
    const scroller = document.createElement("div");
    scroller.id = "shell-content";
    document.body.append(scroller);
    const storageKey = "efcc_programs_workspace_scroll:program-1:participants";
    sessionStorage.setItem(storageKey, "180");
    vi.useFakeTimers();

    try {
      render(
        <ProgramWorkspace
          programId="program-1"
          task="participants"
          onBack={vi.fn()}
          onTaskChange={vi.fn()}
        />
      );

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(
        screen.getByRole("tab", {
          name: `${COPY.programs.tabsActive} (1)`,
        })
      ).toHaveAttribute("aria-selected", "true");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
      expect(scroller.scrollTop).toBe(180);
      expect(sessionStorage.getItem(storageKey)).toBeNull();
    } finally {
      vi.useRealTimers();
      sessionStorage.removeItem(storageKey);
      scroller.remove();
    }
  });

  test("reviews selected requests and preserves a successful approval beside a stale item", async () => {
    mockWorkspace();
    const secondRequest: EnrollmentRequest = {
      ...request,
      request_id: "request-2",
      member_user_id: "member-3",
      member_name: "王小明",
    };
    const approvedEnrollment: Enrollment = {
      ...enrollment,
      enrollment_id: "enrollment-approved",
      member_user_id: request.member_user_id,
      request_id: request.request_id,
      member_name: request.member_name,
    };
    mocks.listEnrollmentSnapshot
      .mockResolvedValueOnce({
        requests: [request, secondRequest],
        enrollments: [],
      })
      .mockResolvedValueOnce({
        requests: [{ ...request, status: "Approved" }, secondRequest],
        enrollments: [approvedEnrollment],
      });
    const runId = "approval-run-1";
    const itemFor = (
      selected: EnrollmentRequest,
      sequence: number,
      status: EnrollmentApprovalRunItem["status"] = "not_started",
      retryable = true,
      errorCode: string | null = null
    ): EnrollmentApprovalRunItem => ({
      item_id: `${runId}:${selected.request_id}`,
      run_id: runId,
      sequence,
      request_id: selected.request_id,
      program_id: selected.program_id,
      member_user_id: selected.member_user_id,
      member_name: selected.member_name,
      member_username: selected.member_username,
      request_version: selected.request_version,
      idempotency_key: `approval-key-${sequence}`,
      status,
      retryable,
      enrollment_id:
        status === "completed" ? approvedEnrollment.enrollment_id : null,
      error_code: errorCode,
      detail: errorCode === "STALE_REQUEST_VERSION" ? "request changed" : null,
      started_at: status === "not_started" ? null : "2026-08-04T00:00:00.000Z",
      settled_at: status === "not_started" ? null : "2026-08-04T00:01:00.000Z",
    });
    const initialRun: EnrollmentApprovalRun = {
      run_id: runId,
      program_id: request.program_id,
      status: "active",
      created_at: "2026-08-04T00:00:00.000Z",
      finished_at: null,
      cancelled_at: null,
      items: [itemFor(request, 0), itemFor(secondRequest, 1)],
    };
    const firstRun: EnrollmentApprovalRun = {
      ...initialRun,
      items: [
        itemFor(request, 0, "completed", false),
        itemFor(secondRequest, 1),
      ],
    };
    const finalRun: EnrollmentApprovalRun = {
      ...firstRun,
      status: "completed",
      finished_at: "2026-08-04T00:02:00.000Z",
      items: [
        firstRun.items[0] as EnrollmentApprovalRunItem,
        itemFor(secondRequest, 1, "failed", false, "STALE_REQUEST_VERSION"),
      ],
    };
    mocks.startEnrollmentApprovalRun.mockResolvedValue({
      run: initialRun,
      created: true,
    });
    mocks.continueEnrollmentApprovalRun
      .mockResolvedValueOnce({ run: firstRun, item: firstRun.items[0] })
      .mockResolvedValueOnce({ run: finalRun, item: finalRun.items[1] });

    render(
      <ProgramWorkspace
        programId="program-1"
        task="participants"
        onBack={vi.fn()}
        onTaskChange={vi.fn()}
      />
    );

    const firstSelection = await screen.findByRole("checkbox", {
      name: /選取.*陳同工/u,
    });
    const secondSelection = screen.getByRole("checkbox", {
      name: /選取.*王小明/u,
    });
    await userEvent.click(firstSelection);
    await userEvent.click(secondSelection);
    expect(screen.getByText("已選 2 位")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "檢視所選" }));
    const review = screen.getByRole("alertdialog", {
      name: "確認核准所選報名",
    });
    expect(review).toHaveTextContent("陳同工");
    expect(review).toHaveTextContent("王小明");
    await userEvent.click(screen.getByRole("button", { name: "確認核准" }));

    await waitFor(() =>
      expect(mocks.continueEnrollmentApprovalRun).toHaveBeenCalledTimes(2)
    );
    expect(mocks.startEnrollmentApprovalRun).toHaveBeenCalledWith(
      "program-1",
      [request.request_id, secondRequest.request_id],
      expect.any(String)
    );
    expect(mocks.continueEnrollmentApprovalRun).toHaveBeenNthCalledWith(
      1,
      "program-1",
      runId,
      expect.any(String)
    );
    expect(mocks.continueEnrollmentApprovalRun).toHaveBeenNthCalledWith(
      2,
      "program-1",
      runId,
      expect.any(String)
    );
    expect(mocks.continueEnrollmentApprovalRun.mock.calls[0]?.[2]).not.toBe(
      mocks.continueEnrollmentApprovalRun.mock.calls[1]?.[2]
    );
    expect(screen.getByText("已核准")).toBeInTheDocument();
    expect(screen.getByText("資料已更新")).toBeInTheDocument();
    expect(screen.getAllByText("全部完成").length).toBeGreaterThanOrEqual(1);
  });

  test("stops scheduling later approvals after the task unmounts", async () => {
    mockWorkspace();
    mocks.listEnrollmentSnapshot.mockResolvedValue({
      requests: [request],
      enrollments: [],
    });
    const runId = "approval-run-unmount";
    const initialItem: EnrollmentApprovalRunItem = {
      item_id: `${runId}:${request.request_id}`,
      run_id: runId,
      sequence: 0,
      request_id: request.request_id,
      program_id: request.program_id,
      member_user_id: request.member_user_id,
      member_name: request.member_name,
      member_username: request.member_username,
      request_version: request.request_version,
      idempotency_key: "approval-key-unmount",
      status: "not_started",
      retryable: true,
      enrollment_id: null,
      error_code: null,
      detail: null,
      started_at: null,
      settled_at: null,
    };
    const initialRun: EnrollmentApprovalRun = {
      run_id: runId,
      program_id: request.program_id,
      status: "active",
      created_at: "2026-08-04T00:00:00.000Z",
      finished_at: null,
      cancelled_at: null,
      items: [initialItem],
    };
    const settledRun: EnrollmentApprovalRun = {
      ...initialRun,
      status: "completed",
      finished_at: "2026-08-04T00:01:00.000Z",
      items: [
        {
          ...initialItem,
          status: "completed",
          retryable: false,
          enrollment_id: "enrollment-unmount",
          started_at: "2026-08-04T00:00:01.000Z",
          settled_at: "2026-08-04T00:01:00.000Z",
        },
      ],
    };
    let resolveContinue:
      | ((result: {
          run: EnrollmentApprovalRun;
          item: EnrollmentApprovalRunItem;
        }) => void)
      | undefined;
    mocks.startEnrollmentApprovalRun.mockResolvedValue({
      run: initialRun,
      created: true,
    });
    mocks.continueEnrollmentApprovalRun.mockImplementation(
      () =>
        // oxlint-disable-next-line promise/avoid-new -- hold the first approval until the task is unmounted.
        new Promise((resolve) => {
          resolveContinue = resolve;
        })
    );
    const view = render(
      <ProgramWorkspace
        programId="program-1"
        task="participants"
        onBack={() => {}}
        onTaskChange={() => {}}
      />
    );

    await userEvent.click(
      await screen.findByRole("checkbox", { name: /選取.*陳同工/u })
    );
    await userEvent.click(screen.getByRole("button", { name: "檢視所選" }));
    await userEvent.click(screen.getByRole("button", { name: "確認核准" }));
    await waitFor(() =>
      expect(mocks.continueEnrollmentApprovalRun).toHaveBeenCalledOnce()
    );

    view.unmount();
    resolveContinue?.({
      run: settledRun,
      item: settledRun.items[0] ?? initialItem,
    });
    await waitFor(() =>
      expect(mocks.continueEnrollmentApprovalRun).toHaveBeenCalledOnce()
    );
  });

  test("does not auto-continue an existing active Run returned by Start", async () => {
    mockWorkspace();
    mocks.listEnrollmentSnapshot.mockResolvedValue({
      requests: [request],
      enrollments: [],
    });
    const runId = "approval-run-existing";
    const existingRun: EnrollmentApprovalRun = {
      run_id: runId,
      program_id: request.program_id,
      status: "active",
      created_at: "2026-08-04T00:00:00.000Z",
      finished_at: null,
      cancelled_at: null,
      items: [
        {
          item_id: `${runId}:${request.request_id}`,
          run_id: runId,
          sequence: 0,
          request_id: request.request_id,
          program_id: request.program_id,
          member_user_id: request.member_user_id,
          member_name: request.member_name,
          member_username: request.member_username,
          request_version: request.request_version,
          idempotency_key: "approval-key-existing",
          status: "not_started",
          retryable: true,
          enrollment_id: null,
          error_code: null,
          detail: null,
          started_at: null,
          settled_at: null,
        },
      ],
    };
    mocks.startEnrollmentApprovalRun.mockResolvedValue({
      run: existingRun,
      created: false,
    });
    render(
      <ProgramWorkspace
        programId="program-1"
        task="participants"
        onBack={() => {}}
        onTaskChange={() => {}}
      />
    );

    await userEvent.click(
      await screen.findByRole("checkbox", { name: /選取.*陳同工/u })
    );
    await userEvent.click(screen.getByRole("button", { name: "檢視所選" }));
    await userEvent.click(screen.getByRole("button", { name: "確認核准" }));
    await expect(
      screen.findByRole("button", { name: "繼續處理餘下項目" })
    ).resolves.toBeInTheDocument();
    expect(mocks.continueEnrollmentApprovalRun).not.toHaveBeenCalled();
  });

  test("keeps Reconcile available when cancellation leaves an in-flight item", async () => {
    mockWorkspace();
    const runId = "approval-run-cancelled-in-flight";
    const inFlightItem: EnrollmentApprovalRunItem = {
      item_id: `${runId}:${request.request_id}`,
      run_id: runId,
      sequence: 0,
      request_id: request.request_id,
      program_id: request.program_id,
      member_user_id: request.member_user_id,
      member_name: request.member_name,
      member_username: request.member_username,
      request_version: request.request_version,
      idempotency_key: "approval-key-cancelled-in-flight",
      status: "in_flight",
      retryable: false,
      enrollment_id: null,
      error_code: null,
      detail: null,
      started_at: "2026-08-04T00:00:00.000Z",
      settled_at: null,
    };
    const activeRun: EnrollmentApprovalRun = {
      run_id: runId,
      program_id: request.program_id,
      status: "active",
      created_at: "2026-08-04T00:00:00.000Z",
      finished_at: null,
      cancelled_at: null,
      items: [inFlightItem],
    };
    const cancelledRun: EnrollmentApprovalRun = {
      ...activeRun,
      status: "cancelled",
      cancelled_at: "2026-08-04T00:02:00.000Z",
    };
    const reconciledRun: EnrollmentApprovalRun = {
      ...cancelledRun,
      items: [
        {
          ...inFlightItem,
          status: "outcome_unknown",
          error_code: "OUTCOME_UNKNOWN",
          detail: "仍未能確認",
          settled_at: "2026-08-04T00:03:00.000Z",
        },
      ],
    };
    mocks.listEnrollmentApprovalRuns.mockResolvedValue({ runs: [activeRun] });
    mocks.reconcileEnrollmentApprovalRun
      .mockResolvedValueOnce({ run: activeRun })
      .mockResolvedValueOnce({ run: reconciledRun });
    mocks.cancelEnrollmentApprovalRun.mockResolvedValue({
      run: cancelledRun,
    });
    render(
      <ProgramWorkspace
        programId="program-1"
        task="participants"
        onBack={() => {}}
        onTaskChange={() => {}}
      />
    );

    await expect(
      screen.findByRole("button", { name: "取消後續處理" })
    ).resolves.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "取消後續處理" }));
    await expect(
      screen.findByRole("button", { name: "重新核對結果" })
    ).resolves.toBeInTheDocument();
    expect(mocks.reconcileEnrollmentApprovalRun).toHaveBeenCalledTimes(2);
    expect(mocks.listEnrollmentSnapshot).toHaveBeenCalledTimes(3);
  });

  test("reloads cancelled unresolved Runs and refreshes after explicit Reconcile", async () => {
    mockWorkspace();
    const runId = "approval-run-reload-cancelled";
    const unresolvedRun: EnrollmentApprovalRun = {
      run_id: runId,
      program_id: request.program_id,
      status: "cancelled",
      created_at: "2026-08-04T00:00:00.000Z",
      finished_at: null,
      cancelled_at: "2026-08-04T00:02:00.000Z",
      items: [
        {
          item_id: `${runId}:${request.request_id}`,
          run_id: runId,
          sequence: 0,
          request_id: request.request_id,
          program_id: request.program_id,
          member_user_id: request.member_user_id,
          member_name: request.member_name,
          member_username: request.member_username,
          request_version: request.request_version,
          idempotency_key: "approval-key-reload-cancelled",
          status: "outcome_unknown",
          retryable: false,
          enrollment_id: null,
          error_code: "OUTCOME_UNKNOWN",
          detail: "仍未能確認",
          started_at: "2026-08-04T00:00:00.000Z",
          settled_at: "2026-08-04T00:03:00.000Z",
        },
      ],
    };
    const settledRun: EnrollmentApprovalRun = {
      ...unresolvedRun,
      items: [
        {
          ...unresolvedRun.items[0],
          status: "completed",
          retryable: false,
          enrollment_id: "enrollment-reload-cancelled",
          error_code: null,
          detail: null,
        },
      ],
    };
    mocks.listEnrollmentApprovalRuns.mockResolvedValue({
      runs: [unresolvedRun],
    });
    mocks.reconcileEnrollmentApprovalRun
      .mockResolvedValueOnce({ run: unresolvedRun })
      .mockResolvedValueOnce({ run: settledRun });
    render(
      <ProgramWorkspace
        programId="program-1"
        task="participants"
        onBack={() => {}}
        onTaskChange={() => {}}
      />
    );

    await waitFor(() =>
      expect(mocks.reconcileEnrollmentApprovalRun).toHaveBeenCalledOnce()
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "重新核對結果" })
    );
    await waitFor(() =>
      expect(mocks.reconcileEnrollmentApprovalRun).toHaveBeenCalledTimes(2)
    );
    expect(mocks.continueEnrollmentApprovalRun).not.toHaveBeenCalled();
    expect(mocks.listEnrollmentSnapshot).toHaveBeenCalledTimes(3);
  });

  test("cancels an active enrollment and renders refreshed cancellation history", async () => {
    mockWorkspace();
    const cancelledEnrollment: Enrollment = {
      ...enrollment,
      status: "Cancelled",
      cancelled_at: "2026-08-05T00:00:00.000Z",
      cancelled_by: "manager-1",
    };
    mocks.listEnrollmentSnapshot
      .mockResolvedValueOnce({
        requests: [],
        enrollments: [enrollment],
      })
      .mockResolvedValueOnce({
        requests: [],
        enrollments: [cancelledEnrollment],
      });
    mocks.cancelEnrollment.mockResolvedValue({
      enrollment: cancelledEnrollment,
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
        name: `${COPY.programs.tabsActive} (1)`,
      })
    );
    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.cancelEnrollment })
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "取消成員報名？",
    });
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "取消原因" }),
      "課程安排調整"
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "確認取消" })
    );

    await waitFor(() =>
      expect(mocks.cancelEnrollment).toHaveBeenCalledWith(
        "program-1",
        "enrollment-1",
        expect.any(String),
        "課程安排調整"
      )
    );
    await expect(
      screen.findByText(COPY.programs.enrollmentCancelledNotice)
    ).resolves.toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.listEnrollmentSnapshot).toHaveBeenCalledTimes(2)
    );
    await expect(
      screen.findByRole("tab", {
        name: `${COPY.programs.tabsHistory} (1)`,
      })
    ).resolves.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("tab", {
        name: `${COPY.programs.tabsHistory} (1)`,
      })
    );
    const history = screen.getByRole("list", {
      name: COPY.programs.enrollmentHistory,
    });
    expect(history).toHaveTextContent("李同工");
    expect(history).toHaveTextContent(COPY.programs.enrollmentCancelled);
  });

  test("keeps an active enrollment available when cancellation conflicts", async () => {
    mockWorkspace();
    mocks.cancelEnrollment.mockRejectedValue(
      new RpcError({
        code: "CONFLICT",
        status: 409,
        detail: "enrollment changed",
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
      await screen.findByRole("tab", {
        name: `${COPY.programs.tabsActive} (1)`,
      })
    );
    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.cancelEnrollment })
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "取消成員報名？",
    });
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "取消原因" }),
      "名單修訂"
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "確認取消" })
    );

    await expect(
      screen.findByText(COPY.programs.workspaceParticipantsConflict)
    ).resolves.toBeInTheDocument();
    expect(mocks.listEnrollmentSnapshot).toHaveBeenCalledOnce();
    expect(screen.getByText("李同工")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.cancelEnrollment })
    ).toBeInTheDocument();
  });

  test("reconciles an ambiguous cancellation before any retry", async () => {
    mockWorkspace();
    const cancelledEnrollment: Enrollment = {
      ...enrollment,
      status: "Cancelled",
      cancelled_at: "2026-08-05T00:00:00.000Z",
      cancelled_by: "manager-1",
    };
    mocks.listEnrollmentSnapshot
      .mockResolvedValueOnce({
        requests: [],
        enrollments: [enrollment],
      })
      .mockResolvedValueOnce({
        requests: [],
        enrollments: [cancelledEnrollment],
      });
    mocks.cancelEnrollment
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({ enrollment: cancelledEnrollment });
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
        name: `${COPY.programs.tabsActive} (1)`,
      })
    );
    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.cancelEnrollment })
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "取消成員報名？",
    });
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "取消原因" }),
      "回應逾時重試"
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "確認取消" })
    );
    await expect(
      screen.findByText(COPY.programs.workspaceReconciled)
    ).resolves.toBeInTheDocument();
    expect(mocks.cancelEnrollment).toHaveBeenCalledOnce();
  });

  test("keeps cancellation disabled until a failed refresh is retried", async () => {
    mockWorkspace();
    mocks.listEnrollmentSnapshot
      .mockResolvedValueOnce({
        requests: [],
        enrollments: [enrollment],
      })
      .mockRejectedValueOnce(
        new RpcError({
          code: "NETWORK",
          status: 0,
          detail: "refresh failed",
        })
      )
      .mockResolvedValueOnce({
        requests: [],
        enrollments: [enrollment],
      });
    mocks.cancelEnrollment.mockResolvedValue({
      enrollment: { ...enrollment, status: "Cancelled" },
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
        name: `${COPY.programs.tabsActive} (1)`,
      })
    );
    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.cancelEnrollment })
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "取消成員報名？",
    });
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "取消原因" }),
      "名單修訂"
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "確認取消" })
    );
    await expect(
      screen.findByText(COPY.programs.workspaceParticipantsRefreshFailed)
    ).resolves.toBeInTheDocument();
    const cancelButton = screen.getByRole("button", {
      name: COPY.programs.cancelEnrollment,
    });
    expect(cancelButton).toBeDisabled();
    await userEvent.click(
      screen.getByRole("button", {
        name: COPY.programs.workspaceParticipantsRefresh,
      })
    );
    await expect(
      screen.findByText(COPY.programs.workspaceParticipantsRefreshSuccess)
    ).resolves.toBeInTheDocument();
    expect(mocks.listEnrollmentSnapshot).toHaveBeenCalledTimes(3);
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: COPY.programs.cancelEnrollment,
        })
      ).not.toBeDisabled()
    );
  });

  test("rejects a pending request into terminal history", async () => {
    mockWorkspace();
    mocks.listEnrollmentSnapshot
      .mockResolvedValueOnce({ requests: [request], enrollments: [] })
      .mockResolvedValueOnce({
        requests: [
          {
            ...request,
            status: "Rejected",
            decided_at: "2026-08-04T00:00:00.000Z",
            decision_note: "名額已滿",
          },
        ],
        enrollments: [],
      });
    mocks.decideEnrollmentRequest.mockResolvedValue({
      request: { ...request, status: "Rejected" },
      enrollment: undefined,
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
      await screen.findByRole("button", { name: COPY.programs.reject })
    );
    await expect(
      screen.findByText(COPY.programs.decisionMade)
    ).resolves.toBeInTheDocument();
    const historyTab = await screen.findByRole("tab", {
      name: `${COPY.programs.tabsHistory} (1)`,
    });
    await userEvent.click(historyTab);
    await expect(
      screen.findByText(COPY.programs.requestRejected)
    ).resolves.toBeInTheDocument();
    expect(screen.getByText("名額已滿")).toBeInTheDocument();
  });

  test("renders an honest empty state for each participant tab", async () => {
    mockWorkspace();
    mocks.listEnrollmentSnapshot.mockResolvedValue({
      requests: [],
      enrollments: [],
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
      screen.findByRole("tab", {
        name: `${COPY.programs.tabsActive} (0)`,
      })
    ).resolves.toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByText(COPY.programs.tabsEmpty.active)
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("tab", { name: `${COPY.programs.tabsPending} (0)` })
    );
    expect(
      screen.getByText(COPY.programs.tabsEmpty.pending)
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("tab", { name: `${COPY.programs.tabsHistory} (0)` })
    );
    expect(
      screen.getByText(COPY.programs.tabsEmpty.history)
    ).toBeInTheDocument();
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
    await expect(
      screen.findByText(COPY.programs.workspaceParticipantsStale)
    ).resolves.toBeInTheDocument();
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
      members: [{ user_id: "member-3", name: "王同工", username: "wang" }],
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

    await userEvent.click(
      await screen.findByRole("button", {
        name: COPY.programs.workspaceParticipantsAdd,
      })
    );
    const picker = await screen.findByRole("combobox", {
      name: COPY.programs.memberId,
    });
    await userEvent.type(picker, "王同");
    await userEvent.click(
      await screen.findByRole("button", { name: /王同工/ })
    );
    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.assistedEnroll })
    );
    await expect(
      screen.findByText(
        `${COPY.programs.workspaceParticipantsConflict} ${COPY.programs.enrollmentDuplicate}`
      )
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByText(`${COPY.programs.tabsPending} (1)`)
    ).toBeInTheDocument();
    expect(screen.getByText("陳同工")).toBeInTheDocument();
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
        name: `${COPY.programs.tabsHistory} (1)`,
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
    await expect(
      screen.findByText(COPY.programs.workspaceParticipantsRefreshFailed)
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByRole("tab", {
        name: `${COPY.programs.tabsPending} (1)`,
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
      members: [{ user_id: "member-3", name: "王同工", username: "wang" }],
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

    await userEvent.click(
      await screen.findByRole("button", {
        name: COPY.programs.workspaceParticipantsAdd,
      })
    );
    const picker = await screen.findByRole("combobox", {
      name: COPY.programs.memberId,
    });
    await userEvent.type(picker, "王同");
    await userEvent.click(
      await screen.findByRole("button", { name: /王同工/ })
    );
    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.assistedEnroll })
    );
    await waitFor(() =>
      expect(mocks.assistedEnroll).toHaveBeenCalledWith("program-1", "member-3")
    );
  });

  test("renders assisted enrollment for a MemberRequest program", async () => {
    mockWorkspace();
    mocks.searchMemberOptions.mockResolvedValue({
      members: [{ user_id: "member-3", name: "王同工", username: "wang" }],
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

    await userEvent.click(
      await screen.findByRole("button", {
        name: COPY.programs.workspaceParticipantsAdd,
      })
    );
    await expect(
      screen.findByText(COPY.programs.assistedEnrollAck)
    ).resolves.toBeInTheDocument();
    const picker = screen.getByRole("combobox", {
      name: COPY.programs.memberId,
    });
    await userEvent.type(picker, "王同");
    await userEvent.click(
      await screen.findByRole("button", { name: /王同工/ })
    );
    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.assistedEnroll })
    );
    await waitFor(() =>
      expect(mocks.assistedEnroll).toHaveBeenCalledWith("program-1", "member-3")
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
    const open = await screen.findByRole("link", {
      name: /2030-08-20.*詳情/u,
    });
    expect(open).toHaveAttribute(
      "href",
      "/programs?mode=management&program=program-1&task=events&event=event-1"
    );
    await userEvent.click(open);
    expect(onEventChange).toHaveBeenCalledWith("event-1");
  });

  test("creates an Event with HK wall-time fields and opens its detail", async () => {
    mockWorkspace();
    const createdEvent = {
      ...event,
      event_id: "event-created",
      starts_at: "2026-09-13T10:00:00.000Z",
      ends_at: "2026-09-13T11:00:00.000Z",
      name: "新聚會",
      event_type: COPY.programs.eventTypeOptions[1],
      location: null,
    };
    mocks.createEvent.mockResolvedValue({ event: createdEvent });
    mocks.listEvents
      .mockReset()
      .mockResolvedValueOnce({ events: [event] })
      .mockResolvedValueOnce({ events: [event, createdEvent] });
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
    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.eventDate })
    );
    const calendar = await screen.findByRole("grid");
    const dayButton = calendar.querySelector<HTMLButtonElement>(
      '[data-day="2026-09-13"] button'
    );
    expect(dayButton).not.toBeNull();
    await userEvent.click(dayButton!);
    fireEvent.change(screen.getByLabelText(COPY.programs.eventTime), {
      target: { value: "18:00" },
    });
    await userEvent.type(
      screen.getByLabelText(COPY.programs.eventName),
      "新聚會"
    );
    await userEvent.click(
      screen.getByRole("combobox", { name: COPY.programs.eventType })
    );
    await userEvent.click(
      screen.getByRole("option", {
        name: COPY.programs.eventTypeOptions[1],
      })
    );
    await userEvent.click(
      screen
        .getAllByRole("button", { name: COPY.programs.createMeeting })
        .at(-1)!
    );

    await waitFor(() =>
      expect(mocks.createEvent).toHaveBeenCalledWith("program-1", {
        name: "新聚會",
        event_type: COPY.programs.eventTypeOptions[1],
        starts_at: "2026-09-13T10:00:00.000Z",
        ends_at: "2026-09-13T11:00:00.000Z",
        location: null,
        check_in_window_opens_at: null,
        check_in_window_closes_at: null,
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
    const backLink = screen.getByRole("link", {
      name: COPY.programs.eventDetailBack,
    });
    expect(backLink).toHaveAttribute(
      "href",
      "/programs?mode=management&program=program-1&task=events"
    );
    await userEvent.click(backLink);
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

  function renderScheduleTask(
    onTaskChange = vi.fn<(...args: unknown[]) => void>(),
    onScheduleEditorChange = vi.fn<(...args: unknown[]) => void>()
  ) {
    mockWorkspace();
    return render(
      <ProgramWorkspace
        programId="program-1"
        task="schedule"
        onBack={vi.fn<(...args: unknown[]) => void>()}
        onTaskChange={onTaskChange}
        onScheduleEditorChange={onScheduleEditorChange}
      />
    );
  }

  test("guards dirty Schedule drafts across tabs, browser Back, and external leave", async () => {
    const user = userEvent.setup();
    const onScheduleEditorChange = vi.fn<(...args: unknown[]) => void>();
    const externalLink = document.createElement("a");
    externalLink.href = "/home";
    externalLink.textContent = "首頁";
    document.body.append(externalLink);

    try {
      renderScheduleTask(vi.fn(), onScheduleEditorChange);
      await user.click(
        await screen.findByRole("button", { name: COPY.programs.addRule })
      );
      await user.type(screen.getByLabelText(COPY.programs.startTime), "10:00");

      await user.click(externalLink);
      expect(
        screen.getByRole("button", {
          name: COPY.programs.settingsContinueEditing,
        })
      ).toBeInTheDocument();
      const beforeUnload = new Event("beforeunload", { cancelable: true });
      expect(window.dispatchEvent(beforeUnload)).toBeFalsy();

      await user.click(
        screen.getByRole("button", {
          name: COPY.programs.settingsContinueEditing,
        })
      );
      await waitFor(() =>
        expect(
          screen.queryByRole("button", {
            name: COPY.programs.settingsContinueEditing,
          })
        ).not.toBeInTheDocument()
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
      await waitFor(() =>
        expect(
          screen.getByRole("button", {
            name: COPY.programs.settingsContinueEditing,
          })
        ).toBeInTheDocument()
      );
      await user.click(
        screen.getByRole("button", {
          name: COPY.programs.settingsContinueEditing,
        })
      );
      await user.click(
        screen.getByRole("link", { name: COPY.programs.backToOverview })
      );
      await user.click(
        screen.getByRole("button", {
          name: COPY.programs.settingsDiscardAndLeave,
        })
      );
      expect(onScheduleEditorChange).toHaveBeenLastCalledWith(null, null);
    } finally {
      externalLink.remove();
    }
  });

  test("keeps recurrence operations behind the Schedule destination", async () => {
    renderEventsTask();

    await screen.findByRole("link", {
      name: new RegExp(COPY.programs.settingsScheduleEventsLink, "u"),
    });
    expect(
      screen.queryByRole("button", { name: COPY.programs.rescheduleEvent })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.cancelOccurrence })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.restoreOccurrence })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.previewEvents })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.generateEvents })
    ).not.toBeInTheDocument();
    expect(mocks.listScheduleRules).not.toHaveBeenCalled();
    expect(mocks.createScheduleException).not.toHaveBeenCalled();
    expect(mocks.deleteScheduleException).not.toHaveBeenCalled();
  });

  test("keeps Schedule overview compact and opens a child rule editor", async () => {
    const user = userEvent.setup();
    renderScheduleTask();

    await screen.findByText(
      `${COPY.programs.ruleWeekly} ${COPY.programs.weekdayWednesday}`
    );
    expect(
      screen.queryByLabelText(COPY.programs.startTime) === null &&
        Boolean(
          screen.getByRole("button", { name: COPY.programs.previewEvents })
        )
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: COPY.programs.addRule })
    );
    const back = screen.getByRole("link", {
      name: COPY.programs.backToOverview,
    });
    expect(
      back.getAttribute("href") ===
        "/programs?mode=management&program=program-1&task=schedule" &&
        Boolean(screen.getByRole("heading", { name: COPY.programs.addRule })) &&
        screen.queryByRole("button", { name: COPY.programs.previewEvents }) ===
          null
    ).toBeTruthy();

    await user.click(back);
    expect(
      screen.getByRole("button", { name: COPY.programs.previewEvents })
    ).toBeInTheDocument();
  });

  test("preview controls are reachable and render an exact plan with exception state", async () => {
    const user = userEvent.setup();
    renderScheduleTask();
    await screen.findByRole("button", { name: COPY.programs.previewEvents });
    mocks.previewEvents.mockResolvedValue(plan);

    await user.click(
      screen.getByRole("button", { name: COPY.programs.previewEvents })
    );
    expect(mocks.previewEvents).toHaveBeenCalledWith("program-1", {
      from_date: hkTodayWallDate(),
      until_date: addWallDays(addWallMonths(hkTodayWallDate(), 3), -1),
    });

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

  test("changing the visible range keeps the old Preview but requires Review Again", async () => {
    const user = userEvent.setup();
    renderScheduleTask();
    await screen.findByRole("button", { name: COPY.programs.previewEvents });
    mocks.previewEvents.mockImplementation(
      async (
        _programId: string,
        range: { from_date: string; until_date: string }
      ) => ({
        ...plan,
        plan: {
          ...plan.plan,
          from_date: range.from_date,
          to_date: range.until_date,
        },
      })
    );

    await user.click(
      screen.getByRole("button", { name: COPY.programs.previewEvents })
    );
    await screen.findByText(
      COPY.programs.previewPlanLabel.replace("{id}", "plan-abc"),
      { exact: false }
    );

    fireEvent.change(screen.getByLabelText(COPY.programs.previewUntilDate), {
      target: { value: addWallDays(hkTodayWallDate(), 7) },
    });
    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      COPY.programs.previewChanged
    );
    expect(
      screen.getByRole("button", {
        name: COPY.programs.generateEvents,
        hidden: true,
      })
    ).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: COPY.programs.previewReviewAgain })
    );
    await waitFor(() => expect(mocks.previewEvents).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: COPY.programs.generateEvents })
      ).toBeEnabled()
    );
  });

  test("invalid re-review retains the old Preview and keeps Generate stale", async () => {
    const user = userEvent.setup();
    renderScheduleTask();
    await screen.findByRole("button", { name: COPY.programs.previewEvents });
    mocks.previewEvents.mockResolvedValue(plan);

    await user.click(
      screen.getByRole("button", { name: COPY.programs.previewEvents })
    );
    await screen.findByText(COPY.programs.previewPlanLabel, { exact: false });
    fireEvent.change(screen.getByLabelText(COPY.programs.previewUntilDate), {
      target: { value: addWallDays(hkTodayWallDate(), 366) },
    });
    await user.click(
      screen.getByRole("button", { name: COPY.programs.previewReviewAgain })
    );

    await expect(
      screen.findByText(COPY.programs.previewError)
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.previewPlanLabel, { exact: false })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: COPY.programs.generateEvents,
        hidden: true,
      })
    ).toBeDisabled();
    expect(mocks.previewEvents).toHaveBeenCalledOnce();
  });

  test("failed re-review retains the old Preview and exposes the stale recovery state", async () => {
    const user = userEvent.setup();
    renderScheduleTask();
    await screen.findByRole("button", { name: COPY.programs.previewEvents });
    mocks.previewEvents
      .mockResolvedValueOnce(plan)
      .mockRejectedValueOnce(new Error("offline"));

    await user.click(
      screen.getByRole("button", { name: COPY.programs.previewEvents })
    );
    await screen.findByText(COPY.programs.previewPlanLabel, { exact: false });
    fireEvent.change(screen.getByLabelText(COPY.programs.previewUntilDate), {
      target: { value: addWallDays(hkTodayWallDate(), 7) },
    });
    await user.click(
      screen.getByRole("button", { name: COPY.programs.previewReviewAgain })
    );

    await expect(
      screen.findByText(COPY.programs.scheduleTransportAmbiguous)
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.previewPlanLabel, { exact: false })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: COPY.programs.generateEvents,
        hidden: true,
      })
    ).toBeDisabled();
  });

  test("preview occurrence actions distinguish an unsaved draft from the saved exception", async () => {
    const user = userEvent.setup();
    renderScheduleTask();
    await screen.findByRole("button", { name: COPY.programs.previewEvents });
    mocks.previewEvents.mockResolvedValue(plan);

    await user.click(
      screen.getByRole("button", { name: COPY.programs.previewEvents })
    );
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", {
          name: COPY.programs.previewAdjustOccurrence,
        }).length
      ).toBeGreaterThan(0)
    );
    await user.click(
      screen.getAllByRole("button", {
        name: COPY.programs.previewAdjustOccurrence,
      })[0]
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.previewSkipOccurrence })
    );
    expect(
      screen.getByText(COPY.programs.previewExceptionDraft)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: COPY.programs.generateEvents,
        hidden: true,
      })
    ).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: COPY.programs.previewSaveException })
    );
    await waitFor(() =>
      expect(mocks.createScheduleException).toHaveBeenCalledWith(
        "program-1",
        "rule-1",
        { override_date: "2026-08-19", action: "CANCEL" }
      )
    );
    expect(
      screen.getByRole("button", {
        name: COPY.programs.generateEvents,
        hidden: true,
      })
    ).toBeDisabled();
  });

  test("a pending exception save keeps Generate disabled until it settles", async () => {
    const user = userEvent.setup();
    const pending = Promise.withResolvers<unknown>();
    renderScheduleTask();
    await screen.findByRole("button", { name: COPY.programs.previewEvents });
    mocks.previewEvents.mockResolvedValue(plan);
    mocks.createScheduleException.mockReturnValueOnce(pending.promise);

    await user.click(
      screen.getByRole("button", { name: COPY.programs.previewEvents })
    );
    await user.click(
      (
        await screen.findAllByRole("button", {
          name: COPY.programs.previewAdjustOccurrence,
        })
      )[0]
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.previewSkipOccurrence })
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.previewSaveException })
    );

    expect(
      screen.getByRole("button", {
        name: COPY.programs.generateEvents,
        hidden: true,
      })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: COPY.programs.submitting })
    ).toBeDisabled();
    pending.resolve({
      exception: {
        exception_id: "exception-1",
        rule_id: "rule-1",
        override_date: "2026-08-19",
        action: "CANCEL",
        new_start_time: null,
        new_end_time: null,
        created_at: "2026-09-16T00:00:00.000Z",
      },
    });
    await waitFor(() =>
      expect(mocks.createScheduleException).toHaveBeenCalledOnce()
    );
    expect(
      screen.getByRole("button", { name: COPY.programs.generateEvents })
    ).toBeDisabled();
  });

  test("a failed settings exception save keeps the reviewed Plan stale", async () => {
    const user = userEvent.setup();
    mocks.previewEvents.mockResolvedValue(plan);
    mocks.createScheduleException.mockRejectedValueOnce(
      new RpcError({ code: "CONFLICT", status: 409 })
    );
    renderScheduleTask();
    await screen.findByRole("button", { name: COPY.programs.previewEvents });

    await user.click(
      screen.getByRole("button", { name: COPY.programs.previewEvents })
    );
    await screen.findByRole("button", { name: COPY.programs.generateEvents });
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.settingsRuleAddException,
      })
    );
    await user.type(
      screen.getByLabelText(COPY.programs.settingsExceptionDate),
      "2026-08-13"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.settingsExceptionSave })
    );
    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      COPY.programs.programConflict
    );
    await user.click(
      screen.getByRole("link", { name: COPY.programs.backToOverview })
    );
    expect(
      screen.getByRole("button", {
        name: COPY.programs.generateEvents,
        hidden: true,
      })
    ).toBeDisabled();
  });

  test("an unknown exception save blocks retry until saved Rules and exceptions reconcile", async () => {
    const user = userEvent.setup();
    mocks.previewEvents.mockResolvedValue(plan);
    mocks.createScheduleException.mockRejectedValueOnce(new Error("offline"));
    renderScheduleTask();
    await screen.findByRole("button", { name: COPY.programs.previewEvents });

    await user.click(
      screen.getByRole("button", { name: COPY.programs.previewEvents })
    );
    await user.click(
      (
        await screen.findAllByRole("button", {
          name: COPY.programs.previewAdjustOccurrence,
        })
      )[0]
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.previewSkipOccurrence })
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.previewSaveException })
    );

    await expect(
      screen.findByText(COPY.programs.scheduleTransportAmbiguous)
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: COPY.programs.generateEvents,
        hidden: true,
      })
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: COPY.programs.workspaceRetryRefresh })
    );
    await waitFor(() =>
      expect(mocks.listScheduleRules).toHaveBeenCalledTimes(2)
    );
    expect(
      screen.queryByText(COPY.programs.programTransportAmbiguous)
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: COPY.programs.generateEvents,
        hidden: true,
      })
    ).toBeDisabled();
  });

  test("a stale plan stays visible, disables Generate, and requires a new preview", async () => {
    const user = userEvent.setup();
    renderScheduleTask();
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

    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      COPY.programs.previewChanged
    );
    expect(
      screen.getByRole("button", { name: COPY.programs.generateEvents })
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: COPY.programs.previewReviewAgain })
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: COPY.programs.generateEvents })
      ).toBeEnabled()
    );
  });

  test("generation reports deterministic counts and refreshes the event list", async () => {
    const user = userEvent.setup();
    const onTaskChange = vi.fn();
    renderScheduleTask(onTaskChange);
    await screen.findByRole("button", { name: COPY.programs.previewEvents });
    mocks.previewEvents.mockResolvedValue(plan);
    mocks.generateEvents.mockResolvedValueOnce({
      generated: {
        run_id: "run-1",
        plan_id: "plan-abc123",
        status: "completed",
        created: 1,
        skipped: 1,
        failed: 0,
        resumed: false,
        created_event_ids: ["event-created"],
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
    await user.click(
      screen.getByRole("button", { name: COPY.programs.generatedCreatedEvent })
    );
    expect(onTaskChange).toHaveBeenCalledWith("events", "event-created");
  });

  test("a schedule-rules load failure keeps the Preview form reachable next to the error alert", async () => {
    mocks.listScheduleRules.mockRejectedValue(
      new RpcError({ code: "FORBIDDEN", status: 403 })
    );
    mockWorkspace();
    render(
      <ProgramWorkspace
        programId="program-1"
        task="schedule"
        onBack={vi.fn()}
        onTaskChange={vi.fn()}
      />
    );
    // The failure is communicated by the existing error alert…
    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      COPY.error.forbidden
    );
    // …but the Preview form must stay reachable (rules stays null on error,
    // so the no-rules empty state is NOT shown and the horizon input lives
    // on). A transient rules-load failure must not masquerade as "no
    // schedule configured".
    expect(
      screen.getByRole("button", { name: COPY.programs.previewEvents })
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(COPY.programs.previewFromDate)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.programs.settingsScheduleNone)
    ).not.toBeInTheDocument();
  });

  test("a partial generation reports through the alert treatment and stays retryable", async () => {
    const user = userEvent.setup();
    renderScheduleTask();
    await screen.findByRole("button", { name: COPY.programs.previewEvents });
    mocks.previewEvents.mockResolvedValue(plan);
    mocks.generateEvents
      .mockResolvedValueOnce({
        generated: {
          run_id: "run-1",
          plan_id: "plan-abc123",
          status: "partial",
          created: 1,
          skipped: 0,
          failed: 1,
          resumed: false,
          unresolved_occurrences: [
            {
              occurrence_id: "occ-1",
              starts_at: "2026-09-16T11:30:00.000Z",
              detail: "SQLITE_BUSY: internal storage detail",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        generated: {
          run_id: "run-1",
          plan_id: "plan-abc123",
          status: "completed",
          created: 1,
          skipped: 0,
          failed: 0,
          resumed: true,
          created_event_ids: ["event-1"],
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
    expect(screen.queryByText(COPY.programs.generated)).not.toBeInTheDocument();
    expect(screen.getByText(/未完成，請核對後重試。/u)).toBeInTheDocument();
    expect(screen.queryByText(/SQLITE_BUSY/u)).not.toBeInTheDocument();
    // The plan is kept, but a retry is gated until the operator acknowledges
    // the server's unresolved units.
    expect(
      screen.getByRole("button", { name: COPY.programs.generateEvents })
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: COPY.programs.generatedReconcile })
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: COPY.programs.generateEvents })
      ).toBeEnabled()
    );
    expect(mocks.generateEvents).toHaveBeenCalledTimes(2);
  });

  test("a stale partial generation keeps counts but requires Review Again", async () => {
    const user = userEvent.setup();
    renderScheduleTask();
    await screen.findByRole("button", { name: COPY.programs.previewEvents });
    mocks.previewEvents.mockResolvedValue(plan);
    mocks.generateEvents.mockResolvedValue({
      generated: {
        run_id: "run-stale-partial",
        plan_id: "plan-abc123",
        status: "partial",
        created: 1,
        skipped: 0,
        failed: 1,
        resumed: false,
        requires_review: true,
        unresolved_occurrences: [
          {
            occurrence_id: "occ-stale",
            starts_at: "2026-09-16T11:30:00.000Z",
            detail: "STALE_PLAN",
          },
        ],
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
      screen.findByText(
        COPY.programs.generatedPartial
          .replace("{created}", "1")
          .replace("{skipped}", "0")
          .replace("{failed}", "1"),
        { exact: true }
      )
    ).resolves.toBeVisible();
    expect(
      screen.queryByRole("button", { name: COPY.programs.generatedReconcile })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.previewReviewAgain })
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: COPY.programs.generateEvents })
    ).toBeDisabled();
  });

  test("an unknown generation response is reconciled before retry is enabled", async () => {
    const user = userEvent.setup();
    renderScheduleTask();
    await screen.findByRole("button", { name: COPY.programs.previewEvents });
    mocks.previewEvents.mockResolvedValue(plan);
    mocks.generateEvents
      .mockRejectedValueOnce(new TypeError("request lost"))
      .mockResolvedValueOnce({
        generated: {
          run_id: "run-unknown",
          plan_id: "plan-abc123",
          status: "completed",
          created: 1,
          skipped: 1,
          failed: 0,
          resumed: true,
          created_event_ids: ["event-reconciled"],
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
      screen.findByText(COPY.programs.scheduleTransportAmbiguous)
    ).resolves.toBeVisible();
    expect(
      screen.getByRole("button", {
        name: COPY.programs.generatedReconcileUnknown,
      })
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: COPY.programs.generateEvents })
    ).toBeDisabled();

    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.generatedReconcileUnknown,
      })
    );
    await expect(
      screen.findByText("已接續上次產生，新增 1 場，跳過 1 場。")
    ).resolves.toBeVisible();
    expect(mocks.generateEvents).toHaveBeenCalledTimes(2);
  });

  test("an empty schedule hides preview controls behind an explicit empty state", async () => {
    mocks.listScheduleRules.mockResolvedValue({ rules: [] });
    mockWorkspace();
    render(
      <ProgramWorkspace
        programId="program-1"
        task="schedule"
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
      program: {
        ...program,
        capabilities: { ...program.capabilities, manage: false },
      },
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
