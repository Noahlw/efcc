import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { COPY } from "@/lib/copy";
import type {
  Program,
  ProgramEvent,
  ScheduleRule,
} from "@/lib/programs/program-api";

import { WorkspaceTaskProvider } from "./workspace-context";
import { EventsTask } from "./workspace-events-task";

const mocks = vi.hoisted(() => ({
  listEvents: vi.fn<() => Promise<{ events: ProgramEvent[] }>>(),
  listScheduleRules: vi.fn<() => Promise<{ rules: ScheduleRule[] }>>(),
}));

vi.mock(import("@/lib/programs/program-api"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    listEvents: mocks.listEvents,
    listScheduleRules: mocks.listScheduleRules,
  };
});

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

const event: ProgramEvent = {
  event_id: "event-1",
  program_id: "program-1",
  program_name: "查經小組",
  starts_at: "2026-09-16T11:30:00.000Z",
  ends_at: "2026-09-16T13:00:00.000Z",
  status: "Active",
  source: "SCHEDULE",
  name: "週三查經",
  event_type: "小組",
  location: "主堂",
  cancel_reason: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  recurrence_tag: "每週",
  exception: null,
};

function renderTask() {
  return render(
    <WorkspaceTaskProvider
      value={{
        program,
        modules: [],
        attention: null,
        departmentId: null,
        hash: null,
        onAttentionRefresh: vi.fn<() => void>(),
        onTaskChange: vi.fn<() => void>(),
        onOpenEvent: vi.fn<() => void>(),
      }}
    >
      <EventsTask />
    </WorkspaceTaskProvider>
  );
}

describe("EventsTask operations-first composition", () => {
  beforeEach(() => {
    mocks.listEvents.mockReset().mockResolvedValue({ events: [event] });
    mocks.listScheduleRules.mockReset().mockResolvedValue({ rules: [] });
  });

  afterEach(() => {
    cleanup();
  });

  test("puts operational rows before Schedule and keeps recurrence operations out of Events", async () => {
    renderTask();

    const eventLink = await screen.findByRole("link", {
      name: COPY.programs.eventDetailOpen,
    });
    const scheduleLink = screen.getByRole("link", {
      name: new RegExp(COPY.programs.settingsScheduleEventsLink, "u"),
    });

    expect(eventLink.compareDocumentPosition(scheduleLink)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(
      screen.queryByRole("button", { name: COPY.programs.rescheduleEvent })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.cancelOccurrence })
    ).not.toBeInTheDocument();
    expect(mocks.listScheduleRules).not.toHaveBeenCalled();
  });

  test("keeps edit, reschedule, and cancel behind a More menu", async () => {
    renderTask();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", {
        name: COPY.programs.eventMoreActions,
      })
    );
    expect(
      screen.getByRole("menuitem", { name: COPY.programs.eventEdit })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: COPY.programs.eventReschedule })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: COPY.programs.cancelEvent })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: COPY.programs.cancelReason })
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("menuitem", { name: COPY.programs.cancelEvent })
    );
    expect(
      screen.getByRole("textbox", { name: COPY.programs.cancelReason })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.keepMeeting })
    ).toBeInTheDocument();
  });
});
