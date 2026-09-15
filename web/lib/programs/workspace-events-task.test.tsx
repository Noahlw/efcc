import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { COPY } from "@/lib/copy";
import type {
  Program,
  ProgramEvent,
  ScheduleRule,
} from "@/lib/programs/program-api";

import {
  clearEventCreateDraft,
  readEventCreateDraft,
  writeEventCreateDraft,
} from "./event-create-draft";
import { WorkspaceTaskProvider } from "./workspace-context";
import { EventsTask } from "./workspace-events-task";

const mocks = vi.hoisted(() => ({
  createEvent: vi.fn<() => Promise<{ event: ProgramEvent }>>(),
  listEvents: vi.fn<() => Promise<{ events: ProgramEvent[] }>>(),
  listScheduleRules: vi.fn<() => Promise<{ rules: ScheduleRule[] }>>(),
}));

vi.mock(import("@/lib/programs/program-api"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createEvent: mocks.createEvent,
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

function renderTask(
  onWorkspaceDirtyChange: (dirty: boolean) => void = vi.fn<
    (dirty: boolean) => void
  >()
) {
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
        onWorkspaceDirtyChange,
      }}
    >
      <EventsTask />
    </WorkspaceTaskProvider>
  );
}

describe("EventsTask operations-first composition", () => {
  beforeEach(() => {
    clearEventCreateDraft(program.program_id);
    mocks.createEvent.mockReset();
    mocks.listEvents.mockReset().mockResolvedValue({ events: [event] });
    mocks.listScheduleRules.mockReset().mockResolvedValue({ rules: [] });
  });

  afterEach(() => {
    clearEventCreateDraft(program.program_id);
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

  test("restores an Event creation draft and reports the shell dirty state", async () => {
    const onWorkspaceDirtyChange = vi.fn<(dirty: boolean) => void>();
    writeEventCreateDraft(program.program_id, {
      version: 1,
      date: "2026-09-22",
      startTime: "19:30",
      endTime: "20:30",
      endAuto: true,
      name: "保留中的聚會",
      location: "副堂",
      eventType: "訓練",
      windowOverride: false,
      windowOpens: "",
      windowCloses: "",
    });

    renderTask(onWorkspaceDirtyChange);

    await expect(
      screen.findByRole("heading", { name: COPY.programs.createMeeting })
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: COPY.programs.eventName })
    ).toHaveValue("保留中的聚會");
    expect(screen.getByLabelText(COPY.programs.eventTime)).toHaveValue("19:30");
    expect(screen.getByLabelText(COPY.programs.eventEnd)).toHaveValue("20:30");
    await waitFor(() =>
      expect(onWorkspaceDirtyChange).toHaveBeenCalledWith(true)
    );
  });

  test("persists edited fields and clears the draft on explicit discard", async () => {
    const user = userEvent.setup();
    const onWorkspaceDirtyChange = vi.fn<(dirty: boolean) => void>();
    renderTask(onWorkspaceDirtyChange);

    await user.click(
      await screen.findByRole("button", { name: COPY.programs.createMeeting })
    );
    const name = screen.getByRole("textbox", {
      name: COPY.programs.eventName,
    });
    await user.type(name, "暫存聚會");
    await waitFor(() => {
      expect(readEventCreateDraft(program.program_id)?.name).toBe("暫存聚會");
      expect(onWorkspaceDirtyChange).toHaveBeenCalledWith(true);
    });

    await user.click(
      screen.getByRole("button", { name: COPY.programs.eventCreateCancel })
    );
    await waitFor(() => {
      expect(readEventCreateDraft(program.program_id)).toBeNull();
      expect(onWorkspaceDirtyChange).toHaveBeenCalledWith(false);
    });
  });

  test("keeps the draft after a failed create and clears it after success", async () => {
    const user = userEvent.setup();
    const onWorkspaceDirtyChange = vi.fn<(dirty: boolean) => void>();
    writeEventCreateDraft(program.program_id, {
      version: 1,
      date: "2026-09-22",
      startTime: "19:30",
      endTime: "20:30",
      endAuto: true,
      name: "失敗後仍保留",
      location: "副堂",
      eventType: "小組",
      windowOverride: false,
      windowOpens: "",
      windowCloses: "",
    });
    mocks.createEvent.mockRejectedValueOnce(new Error("offline"));
    renderTask(onWorkspaceDirtyChange);

    await screen.findByRole("heading", { name: COPY.programs.createMeeting });
    const submit = screen
      .getAllByRole("button", { name: COPY.programs.createMeeting })
      .at(-1);
    expect(submit).toBeDefined();
    if (!submit) {
      throw new Error("create submit button was not rendered");
    }
    await user.click(submit);
    await screen.findByRole("alert");
    expect(
      screen.getByRole("textbox", { name: COPY.programs.eventName })
    ).toHaveValue("失敗後仍保留");
    expect(readEventCreateDraft(program.program_id)?.name).toBe("失敗後仍保留");

    mocks.createEvent.mockResolvedValueOnce({
      event: { ...event, event_id: "event-created" },
    });
    const retrySubmit = screen
      .getAllByRole("button", { name: COPY.programs.createMeeting })
      .at(-1);
    if (!retrySubmit) {
      throw new Error("create retry button was not rendered");
    }
    await user.click(retrySubmit);
    await waitFor(() => {
      expect(readEventCreateDraft(program.program_id)).toBeNull();
      expect(onWorkspaceDirtyChange).toHaveBeenCalledWith(false);
    });
  });
});
