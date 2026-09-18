import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { RpcError } from "@/lib/api";
import { COPY } from "@/lib/copy";
import type {
  GenerateResult,
  PreviewResult,
  Program,
  ProgramEvent,
  ScheduleException,
  ScheduleRule,
} from "@/lib/programs/program-api";
import {
  clearEventCreateDraft,
  readEventCreateDraft,
  writeEventCreateDraft,
} from "./event-create-draft";
import { writeManagementDraft } from "./management-draft";
import {
  clearWorkspaceMutationRecovery,
  readWorkspaceMutationRecovery,
  writeWorkspaceMutationRecovery,
} from "./mutation-recovery";
import type { ManagementEventAction } from "./programs-intent";
import {
  addWallDays,
  addWallMonths,
  hkTodayWallDate,
  wallDaySpan,
} from "./recurrence";
import { WorkspaceTaskProvider } from "./workspace-context";
import { EventsTask, RecurringSchedulePanel } from "./workspace-events-task";
const mocks = vi.hoisted(() => ({
  createEvent: vi.fn<() => Promise<{ event: ProgramEvent }>>(),
  listEvents: vi.fn<() => Promise<{ events: ProgramEvent[] }>>(),
  listScheduleRules: vi.fn<() => Promise<{ rules: ScheduleRule[] }>>(),
  previewEvents: vi.fn<() => Promise<PreviewResult>>(),
  generateEvents:
    vi.fn<
      (
        programId: string,
        planId: string
      ) => Promise<{ generated: GenerateResult }>
    >(),
  createScheduleException:
    vi.fn<() => Promise<{ exception: ScheduleException }>>(),
}));
vi.mock(import("@/lib/programs/program-api"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createEvent: mocks.createEvent,
    listEvents: mocks.listEvents,
    listScheduleRules: mocks.listScheduleRules,
    previewEvents: mocks.previewEvents,
    generateEvents: mocks.generateEvents,
    createScheduleException: mocks.createScheduleException,
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
  starts_at: "2099-09-16T11:30:00.000Z",
  ends_at: "2099-09-16T13:00:00.000Z",
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

const wallInstant = (date: string, time: string) =>
  new Date(`${date}T${time}:00+08:00`).toISOString();

const rule: ScheduleRule = {
  rule_id: "rule-1",
  program_id: "program-1",
  recurrence: "WEEKLY",
  day_of_week: 3,
  month_day: null,
  start_time: "11:30",
  end_time: "13:00",
  location: "主堂",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const preview: PreviewResult = {
  plan: {
    plan_id: "plan-1",
    program_id: "program-1",
    plan_hash: "hash-1",
    horizon_days: wallDaySpan(
      hkTodayWallDate(),
      addWallDays(addWallMonths(hkTodayWallDate(), 3), -1)
    ),
    from_date: hkTodayWallDate(),
    to_date: addWallDays(addWallMonths(hkTodayWallDate(), 3), -1),
    rule_count: 1,
    created_at: "2026-09-16T00:00:00.000Z",
  },
  occurrences: [
    {
      occurrence_id: "occ-1",
      plan_id: "plan-1",
      rule_id: "rule-1",
      occurs_on: "2026-09-16",
      starts_at: "2026-09-16T11:30:00.000Z",
      ends_at: "2026-09-16T13:00:00.000Z",
      location: "主堂",
      skip_reason: null,
      exception_id: null,
    },
  ],
};

function renderTask(
  onWorkspaceDirtyChange: (dirty: boolean) => void = vi.fn<
    (dirty: boolean) => void
  >(),
  onOpenEvent:
    | ((eventId: string, action?: ManagementEventAction) => void)
    | null = vi.fn<(eventId: string, action?: ManagementEventAction) => void>(),
  onOpenAttendance: ((eventId: string) => void) | null = null,
  hash: string | null = null,
  onWorkspaceRefresh: (() => Promise<unknown>) | null = null
) {
  return render(
    <WorkspaceTaskProvider
      value={{
        program,
        modules: [],
        attention: null,
        departmentId: null,
        hash,
        onAttentionRefresh: vi.fn<() => void>(),
        onTaskChange: vi.fn<() => void>(),
        onOpenEvent: onOpenEvent ?? undefined,
        onOpenAttendance: onOpenAttendance ?? undefined,
        onWorkspaceDirtyChange,
        onWorkspaceRefresh:
          onWorkspaceRefresh === null
            ? undefined
            : async () => {
              await onWorkspaceRefresh();
            },
      }}
    >
      <EventsTask />
    </WorkspaceTaskProvider>
  );
}

describe("EventsTask operations-first composition", () => {
  beforeEach(() => {
    clearEventCreateDraft(program.program_id);
    clearWorkspaceMutationRecovery("events", {
      programId: program.program_id,
    });
    mocks.createEvent.mockReset();
    mocks.listEvents.mockReset().mockResolvedValue({ events: [event] });
    mocks.listScheduleRules.mockReset().mockResolvedValue({ rules: [] });
    mocks.previewEvents.mockReset().mockResolvedValue(preview);
    mocks.generateEvents.mockReset();
  });

  afterEach(() => {
    clearEventCreateDraft(program.program_id);
    clearWorkspaceMutationRecovery("events", {
      programId: program.program_id,
    });
    cleanup();
  });

  test("puts operational rows before Schedule and keeps recurrence operations out of Events", async () => {
    renderTask();

    const eventLink = await screen.findByRole("link", {
      name: /週三查經.*詳情/u,
    });
    expect(eventLink).toHaveClass("min-h-11");
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

  test("distinguishes no generated Events from no Rules at all", async () => {
    mocks.listEvents.mockReset().mockResolvedValue({ events: [] });
    renderTask();

    expect(
      await screen.findByText(COPY.programs.workspaceTaskEventsEmpty)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        `${COPY.programs.schedulePreviewTitle}：${COPY.programs.settingsScheduleNone}`
      )
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: new RegExp(COPY.programs.settingsScheduleEventsLink, "u"),
      })
    ).toBeInTheDocument();
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

  test("prioritizes open and today Events, filters history, and opens permitted Attendance", async () => {
    const now = Date.now();
    const todayStart = new Date(now + 30 * 60_000);
    const todayDate = hkTodayWallDate(todayStart);
    const makeEvent = (
      eventId: string,
      startsAt: string,
      endsAt: string,
      overrides: Partial<ProgramEvent> = {}
    ): ProgramEvent => ({
      ...event,
      event_id: eventId,
      starts_at: startsAt,
      ends_at: endsAt,
      ...overrides,
    });
    const open = makeEvent(
      "event-open",
      new Date(now + 30 * 60_000).toISOString(),
      new Date(now + 90 * 60_000).toISOString(),
      {
        check_in_window_opens_at: new Date(now - 60 * 60_000).toISOString(),
        check_in_window_closes_at: new Date(now + 60 * 60_000).toISOString(),
      }
    );
    const today = makeEvent(
      "event-today",
      todayStart.toISOString(),
      new Date(todayStart.getTime() + 60 * 60_000).toISOString()
    );
    const endedToday = makeEvent(
      "event-ended-today",
      new Date(now - 2 * 60 * 60_000).toISOString(),
      new Date(now - 60 * 60_000).toISOString()
    );
    const future = makeEvent(
      "event-future",
      wallInstant(addWallDays(todayDate, 1), "12:00"),
      wallInstant(addWallDays(todayDate, 1), "13:00")
    );
    const past = makeEvent(
      "event-past",
      wallInstant(addWallDays(todayDate, -1), "12:00"),
      wallInstant(addWallDays(todayDate, -1), "13:00")
    );
    const cancelled = makeEvent(
      "event-cancelled",
      wallInstant(addWallDays(todayDate, -1), "13:00"),
      wallInstant(addWallDays(todayDate, -1), "14:00"),
      { status: "Cancelled", cancel_reason: "場地維修" }
    );
    mocks.listEvents.mockResolvedValue({
      events: [future, past, cancelled, endedToday, today, open],
    });
    const onOpenEvent =
      vi.fn<(eventId: string, action?: ManagementEventAction) => void>();
    const onOpenAttendance = vi.fn<(eventId: string) => void>();
    const user = userEvent.setup();
    renderTask(vi.fn(), onOpenEvent, onOpenAttendance);

    const list = await screen.findByRole("list", {
      name: COPY.programs.workspaceTaskEvents,
    });
    const filters = screen.getByRole("tablist", {
      name: COPY.programs.eventsFilterLabel,
    });
    const currentTab = within(filters).getByRole("tab", {
      name: COPY.programs.eventsFilterCurrent,
    });
    expect(currentTab).toHaveAttribute("aria-selected", "true");
    expect(currentTab).toHaveAttribute(
      "aria-controls",
      "programs-events-filter-panel"
    );
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      currentTab.id
    );
    expect(
      [...list.querySelectorAll<HTMLElement>("[data-event-id]")].map(
        (row) => row.dataset.eventId
      )
    ).toStrictEqual(["event-open", "event-today", "event-future"]);

    const futureRow = list.querySelector<HTMLElement>(
      '[data-event-id="event-future"]'
    );
    if (!futureRow) {
      throw new Error("future Event row was not rendered");
    }
    expect(
      within(futureRow).queryByRole("link", {
        name: COPY.attendance.eventAttendanceOpen,
      })
    ).not.toBeInTheDocument();
    expect(
      within(futureRow).getByRole("link", { name: /詳情/u })
    ).toHaveAttribute(
      "href",
      "/programs?mode=management&program=program-1&task=events&event=event-future"
    );

    const openRow = list.querySelector<HTMLElement>(
      '[data-event-id="event-open"]'
    );
    if (!openRow) {
      throw new Error("open Event row was not rendered");
    }
    await user.click(
      within(openRow).getByRole("link", {
        name: COPY.attendance.eventAttendanceOpen,
      })
    );
    await user.click(
      within(openRow).getByRole("button", {
        name: COPY.programs.eventMoreActions,
      })
    );
    await user.click(
      screen.getByRole("menuitem", { name: COPY.programs.eventEdit })
    );
    await user.click(
      within(openRow).getByRole("button", {
        name: COPY.programs.eventMoreActions,
      })
    );
    await user.click(
      screen.getByRole("menuitem", { name: COPY.programs.eventReschedule })
    );
    expect({
      attendance: onOpenAttendance.mock.calls,
      event: onOpenEvent.mock.calls,
    }).toStrictEqual({
      attendance: [["event-open"]],
      event: [
        ["event-open", "edit"],
        ["event-open", "reschedule"],
      ],
    });

    await user.click(
      screen.getByRole("tab", { name: COPY.programs.eventsFilterPast })
    );
    expect({
      past: Boolean(list.querySelector('[data-event-id="event-past"]')),
      endedToday: Boolean(
        list.querySelector('[data-event-id="event-ended-today"]')
      ),
      open: Boolean(list.querySelector('[data-event-id="event-open"]')),
    }).toStrictEqual({ past: true, endedToday: true, open: false });

    await user.click(
      screen.getByRole("tab", {
        name: COPY.programs.eventsFilterCancelled,
      })
    );
    const cancelledRow = list.querySelector<HTMLElement>(
      '[data-event-id="event-cancelled"]'
    );
    expect(cancelledRow).not.toBeNull();
    const disclosure = (cancelledRow as HTMLElement).querySelector("details");
    expect(disclosure).not.toBeNull();
    expect(disclosure).not.toHaveAttribute("open");
    expect(
      within(disclosure as HTMLElement).getByText(COPY.programs.cancelReason)
    ).toBeInTheDocument();
    expect(
      within(disclosure as HTMLElement).getByText("場地維修")
    ).toBeInTheDocument();
    expect({
      cancelled: list.querySelectorAll('[data-event-id="event-cancelled"]')
        .length,
      past: Boolean(list.querySelector('[data-event-id="event-past"]')),
    }).toStrictEqual({ cancelled: 1, past: false });
    expect(
      within(cancelledRow as HTMLElement).queryByRole("button", {
        name: COPY.programs.eventMoreActions,
      })
    ).not.toBeInTheDocument();
    expect(
      within(cancelledRow as HTMLElement).queryByRole("link", {
        name: COPY.programs.eventAttendanceViewRecord,
      })
    ).not.toBeInTheDocument();
  });

  test("restores an Event creation draft and reports the shell dirty state", async () => {
    const user = userEvent.setup();
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
    await user.click(
      screen.getByRole("button", { name: COPY.programs.draftRecover })
    );

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

  test("consumes the one-shot create intent before opening the Event form", async () => {
    const user = userEvent.setup();
    const previousHref = window.location.href;
    window.history.replaceState(
      {},
      "",
      "/programs?program=program-1#create-event"
    );
    try {
      renderTask(vi.fn(), null, null, "#create-event");
      await screen.findByRole("heading", { name: COPY.programs.createMeeting });
      expect(window.location.hash).toBe("");

      await user.click(
        screen.getByRole("button", { name: COPY.programs.eventCreateCancel })
      );
      expect(
        screen.queryByRole("heading", { name: COPY.programs.createMeeting })
      ).not.toBeInTheDocument();
    } finally {
      window.history.replaceState({}, "", previousHref);
    }
  });

  test("does not reopen a discarded draft from the one-shot create intent", async () => {
    const user = userEvent.setup();
    const previousHref = window.location.href;
    writeEventCreateDraft(program.program_id, {
      version: 1,
      date: "2026-09-22",
      startTime: "19:30",
      endTime: "20:30",
      endAuto: true,
      name: "捨棄後不應重開",
      location: "副堂",
      eventType: "訓練",
      windowOverride: false,
      windowOpens: "",
      windowCloses: "",
    });
    window.history.replaceState(
      {},
      "",
      "/programs?program=program-1#create-event"
    );
    try {
      renderTask(vi.fn(), null, null, "#create-event");
      const dialog = await screen.findByRole("alertdialog", {
        name: COPY.programs.eventCreateRecoveryTitle,
      });
      await user.click(
        within(dialog).getByRole("button", { name: COPY.programs.draftDiscard })
      );
      await waitFor(() => {
        expect(readEventCreateDraft(program.program_id)).toBeNull();
        expect(
          screen.queryByRole("heading", { name: COPY.programs.createMeeting })
        ).not.toBeInTheDocument();
      });
      expect(window.location.hash).toBe("");
    } finally {
      window.history.replaceState({}, "", previousHref);
    }
  });

  test("does not reopen a discarded recovered draft from a stale create hash", async () => {
    const user = userEvent.setup();
    const previousHref = window.location.href;
    writeEventCreateDraft(program.program_id, {
      version: 1,
      date: "2026-09-22",
      startTime: "19:30",
      endTime: "20:30",
      endAuto: true,
      name: "重載草稿",
      location: "副堂",
      eventType: "訓練",
      windowOverride: false,
      windowOpens: "",
      windowCloses: "",
    });
    window.history.replaceState(
      {},
      "",
      "/programs?program=program-1#create-event"
    );
    try {
      renderTask(vi.fn(), null, null, "#create-event");
      const discard = await screen.findByRole("button", {
        name: COPY.programs.draftDiscard,
      });
      await user.click(discard);
      expect(window.location.hash).toBe("");
      expect(
        screen.queryByRole("heading", { name: COPY.programs.createMeeting })
      ).not.toBeInTheDocument();
      expect(readEventCreateDraft(program.program_id)).toBeNull();
    } finally {
      window.history.replaceState({}, "", previousHref);
    }
  });

  test("keeps the draft after a failed create and clears it after success", async () => {
    const user = userEvent.setup();
    const onWorkspaceDirtyChange = vi.fn<(dirty: boolean) => void>();
    const onOpenEvent = vi.fn<(eventId: string) => void>();
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
    renderTask(onWorkspaceDirtyChange, onOpenEvent);
    await user.click(
      screen.getByRole("button", { name: COPY.programs.draftRecover })
    );

    await screen.findByRole("heading", { name: COPY.programs.createMeeting });
    mocks.listEvents.mockResolvedValueOnce({
      events: [
        event,
        {
          ...event,
          event_id: "event-created",
          starts_at: wallInstant("2026-09-22", "19:30"),
          ends_at: wallInstant("2026-09-22", "20:30"),
          name: "失敗後仍保留",
          event_type: "小組",
          location: "副堂",
        },
      ],
    });
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

    await user.click(
      screen.getByRole("button", { name: COPY.programs.workspaceRetryRefresh })
    );
    await screen.findByText(COPY.programs.workspaceReconciled);
    await waitFor(() => {
      expect(readEventCreateDraft(program.program_id)).toBeNull();
      expect(onWorkspaceDirtyChange).toHaveBeenCalledWith(false);
    });
    expect(mocks.createEvent).toHaveBeenCalledOnce();
    expect(onOpenEvent).toHaveBeenCalledWith("event-created");
  });

  test("keeps confirmed create success visible when Event readback fails", async () => {
    const user = userEvent.setup();
    writeEventCreateDraft(program.program_id, {
      version: 1,
      date: "2026-09-22",
      startTime: "19:30",
      endTime: "20:30",
      endAuto: true,
      name: "讀回失敗後仍已建立",
      location: "副堂",
      eventType: "小組",
      windowOverride: false,
      windowOpens: "",
      windowCloses: "",
    });
    mocks.listEvents
      .mockReset()
      .mockResolvedValueOnce({ events: [event] })
      .mockRejectedValueOnce(new Error("readback"));
    mocks.createEvent.mockResolvedValueOnce({
      event: { ...event, event_id: "event-created" },
    });

    renderTask(vi.fn<(dirty: boolean) => void>(), null);
    await user.click(
      screen.getByRole("button", { name: COPY.programs.draftRecover })
    );
    await screen.findByRole("heading", { name: COPY.programs.createMeeting });
    const submit = screen
      .getAllByRole("button", { name: COPY.programs.createMeeting })
      .at(-1);
    if (!submit) {
      throw new Error("create submit button was not rendered");
    }
    await user.click(submit);

    await waitFor(() => {
      expect(
        screen.getByText(COPY.programs.eventCreatedNotice)
      ).toBeInTheDocument();
      expect(
        screen.getByText(COPY.programs.workspaceEventsSavedStale)
      ).toBeInTheDocument();
    });
  });

  test("opens a committed Event when workspace readback is stale but Event readback succeeds", async () => {
    const user = userEvent.setup();
    const onOpenEvent = vi.fn<(eventId: string) => void>();
    const onWorkspaceRefresh = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValue(undefined);
    const createdEvent = {
      ...event,
      event_id: "event-created",
      name: "工作區讀回失敗仍可開啟",
      starts_at: wallInstant("2026-09-22", "19:30"),
      ends_at: wallInstant("2026-09-22", "20:30"),
      location: "副堂",
      // The Worker supplies these defaults when the create request omits overrides.
      check_in_window_opens_at: wallInstant("2026-09-22", "19:15"),
      check_in_window_closes_at: wallInstant("2026-09-22", "21:00"),
    };
    writeEventCreateDraft(program.program_id, {
      version: 1,
      date: "2026-09-22",
      startTime: "19:30",
      endTime: "20:30",
      endAuto: true,
      name: createdEvent.name ?? "",
      location: "副堂",
      eventType: "小組",
      windowOverride: false,
      windowOpens: "",
      windowCloses: "",
    });
    mocks.listEvents
      .mockReset()
      .mockResolvedValueOnce({ events: [event] })
      .mockResolvedValueOnce({ events: [event, createdEvent] });
    mocks.createEvent.mockResolvedValueOnce({ event: createdEvent });

    renderTask(
      vi.fn<(dirty: boolean) => void>(),
      onOpenEvent,
      null,
      null,
      onWorkspaceRefresh
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.draftRecover })
    );
    await screen.findByRole("heading", { name: COPY.programs.createMeeting });
    const submit = screen
      .getAllByRole("button", { name: COPY.programs.createMeeting })
      .at(-1);
    if (!submit) {
      throw new Error("create submit button was not rendered");
    }
    await user.click(submit);

    await waitFor(() =>
      expect(onOpenEvent).toHaveBeenCalledWith("event-created")
    );
    expect(onWorkspaceRefresh).toHaveBeenCalledOnce();
    expect(
      screen.getByText(COPY.programs.eventCreatedNotice)
    ).toBeInTheDocument();
  });

  test("does not open a different Event that only matches create fields", async () => {
    const user = userEvent.setup();
    const onOpenEvent = vi.fn<(eventId: string) => void>();
    const createdEvent = {
      ...event,
      event_id: "event-created",
      name: "只匹配欄位的聚會",
      starts_at: wallInstant("2026-09-22", "19:30"),
      ends_at: wallInstant("2026-09-22", "20:30"),
      location: "副堂",
    };
    const differentReadback = { ...createdEvent, event_id: "event-different" };
    writeEventCreateDraft(program.program_id, {
      version: 1,
      date: "2026-09-22",
      startTime: "19:30",
      endTime: "20:30",
      endAuto: true,
      name: createdEvent.name ?? "",
      location: "副堂",
      eventType: "小組",
      windowOverride: false,
      windowOpens: "",
      windowCloses: "",
    });
    mocks.listEvents
      .mockReset()
      .mockResolvedValueOnce({ events: [event] })
      .mockResolvedValueOnce({ events: [event, differentReadback] });
    mocks.createEvent.mockResolvedValueOnce({ event: createdEvent });

    renderTask(vi.fn(), onOpenEvent);
    await user.click(
      screen.getByRole("button", { name: COPY.programs.draftRecover })
    );
    await screen.findByRole("heading", { name: COPY.programs.createMeeting });
    const submit = screen
      .getAllByRole("button", { name: COPY.programs.createMeeting })
      .at(-1);
    if (!submit) {
      throw new Error("create submit button was not rendered");
    }
    await user.click(submit);

    await waitFor(() =>
      expect(
        screen.getByText(COPY.programs.workspaceEventsSavedStale)
      ).toBeInTheDocument()
    );
    expect(onOpenEvent).not.toHaveBeenCalled();
  });

  test("restores an unknown Event create and reconciles it without replaying", async () => {
    writeEventCreateDraft(program.program_id, {
      version: 1,
      date: "2026-09-22",
      startTime: "19:30",
      endTime: "20:30",
      endAuto: true,
      name: "重載後聚會",
      location: "副堂",
      eventType: "小組",
      windowOverride: false,
      windowOpens: "",
      windowCloses: "",
    });
    const pending = {
      kind: "create" as const,
      programId: program.program_id,
      beforeEventIds: [event.event_id],
      name: "重載後聚會",
      eventType: "小組",
      startsAt: wallInstant("2026-09-22", "19:30"),
      endsAt: wallInstant("2026-09-22", "20:30"),
      location: "副堂",
      opensAt: null,
      closesAt: null,
    };
    writeWorkspaceMutationRecovery({
      surface: "events",
      programId: program.program_id,
      mutation: pending,
    });
    const created: ProgramEvent = {
      ...event,
      event_id: "event-reloaded",
      starts_at: pending.startsAt,
      ends_at: pending.endsAt,
      name: pending.name,
      event_type: "小組",
      location: pending.location,
      check_in_window_opens_at: null,
      check_in_window_closes_at: null,
    };
    mocks.listEvents
      .mockReset()
      .mockResolvedValueOnce({ events: [event] })
      .mockResolvedValueOnce({ events: [event, created] });
    renderTask();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: COPY.programs.draftRecover })
    );

    const submit = screen
      .getAllByRole("button", { name: COPY.programs.createMeeting })
      .at(-1);
    expect(submit).toBeDefined();
    if (!submit) {
      throw new Error("create submit button was not rendered");
    }
    expect(submit).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: COPY.programs.workspaceRetryRefresh })
    );
    await expect(
      screen.findByText(COPY.programs.workspaceReconciled)
    ).resolves.toBeInTheDocument();
    expect(readEventCreateDraft(program.program_id)).toBeNull();
    expect(readWorkspaceMutationRecovery()).toBeNull();
  });
});

describe("Schedule generation recovery", () => {
  beforeEach(() => {
    mocks.previewEvents.mockReset().mockResolvedValue(preview);
    mocks.generateEvents.mockReset();
  });

  afterEach(cleanup);

  test("states that no Rules exist instead of offering an unusable preview", () => {
    render(
      <RecurringSchedulePanel
        programId="program-1"
        rules={[]}
        rulesError={null}
        onGenerated={vi.fn<() => Promise<boolean>>()}
      />
    );

    expect(
      screen.getByText(
        `${COPY.programs.schedulePreviewTitle}：${COPY.programs.settingsScheduleNone}`
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.previewEvents })
    ).not.toBeInTheDocument();
  });

  test("settles an empty reviewed Plan as an explicit empty state without Generate", async () => {
    const user = userEvent.setup();
    mocks.previewEvents.mockResolvedValueOnce({
      plan: { ...preview.plan, rule_count: 0 },
      occurrences: [],
    });
    render(
      <RecurringSchedulePanel
        programId="program-1"
        rules={[rule]}
        rulesError={null}
        onGenerated={vi.fn<() => Promise<boolean>>()}
      />
    );

    await user.click(
      await screen.findByRole("button", { name: COPY.programs.previewEvents })
    );

    await expect(
      screen.findByText(COPY.programs.previewEmpty)
    ).resolves.toBeVisible();
    expect(
      screen.queryByRole("button", { name: COPY.programs.generateEvents })
    ).not.toBeInTheDocument();
  });

  test("a confirmed stale generation can retry read-only refresh without replaying", async () => {
    const user = userEvent.setup();
    const onGenerated = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValue(false);
    const onWorkspaceRefresh = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error("readback unavailable"))
      .mockResolvedValueOnce({});
    mocks.generateEvents.mockResolvedValueOnce({
      generated: {
        run_id: "run-stale",
        plan_id: "plan-1",
        status: "completed",
        created: 1,
        skipped: 0,
        failed: 0,
        resumed: false,
        requires_review: true,
        created_event_ids: ["event-created"],
      },
    });

    render(
      <RecurringSchedulePanel
        programId="program-1"
        rules={[rule]}
        rulesError={null}
        onGenerated={onGenerated}
        onWorkspaceRefresh={onWorkspaceRefresh}
        onScheduleRefresh={vi
          .fn<() => Promise<boolean>>()
          .mockResolvedValue(true)}
      />
    );

    await user.click(
      await screen.findByRole("button", { name: COPY.programs.previewEvents })
    );
    await user.click(
      await screen.findByRole("button", { name: COPY.programs.generateEvents })
    );

    await expect(
      screen.findByText(COPY.programs.workspaceSavedStale)
    ).resolves.toBeVisible();

    await user.click(
      screen.getByRole("button", { name: COPY.programs.workspaceRetryRefresh })
    );
    await expect(
      screen.findByText(COPY.programs.scheduleTransportAmbiguous)
    ).resolves.toBeVisible();

    await user.click(
      screen.getByRole("button", { name: COPY.programs.workspaceRetryRefresh })
    );
    await waitFor(() => expect(onWorkspaceRefresh).toHaveBeenCalledTimes(2));
    expect({
      generateCalls: mocks.generateEvents.mock.calls.length,
      generateDisabled: screen
        .getByRole("button", { name: COPY.programs.generateEvents })
        .hasAttribute("disabled"),
      reviewAgainVisible: Boolean(
        screen.getByRole("button", { name: COPY.programs.previewReviewAgain })
      ),
    }).toStrictEqual({
      generateCalls: 1,
      generateDisabled: true,
      reviewAgainVisible: true,
    });
  });
});
describe("F01 unresolved Generate survives Preview (#629)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    mocks.previewEvents.mockReset().mockResolvedValue(preview);
    mocks.generateEvents.mockReset();
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
  });

  function renderPanel() {
    return render(
      <RecurringSchedulePanel
        programId="program-1"
        rules={[rule]}
        rulesError={null}
        onGenerated={vi.fn<() => Promise<boolean>>().mockResolvedValue(true)}
      />
    );
  }

  async function previewAndLoseAcknowledgement(user: UserEvent) {
    renderPanel();
    await user.click(
      await screen.findByRole("button", { name: COPY.programs.previewEvents })
    );
    await screen.findByRole("button", { name: COPY.programs.generateEvents });
    mocks.generateEvents.mockRejectedValueOnce(
      new RpcError({ status: 0, code: "NETWORK_ERROR" })
    );
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: false,
    });
    await user.click(
      screen.getByRole("button", { name: COPY.programs.generateEvents })
    );
    const reconcile = await screen.findByRole(
      "button",
      { name: COPY.programs.generatedReconcileUnknown },
      { timeout: 2_000 }
    );
    expect(reconcile).toHaveAttribute("data-generation-plan-id", "plan-1");
    expect(mocks.generateEvents).toHaveBeenCalledTimes(1);
    return reconcile;
  }

  test("Preview while the write is unresolved keeps Plan A and the recovery reference", async () => {
    const user = userEvent.setup();
    const reconcile = await previewAndLoseAcknowledgement(user);

    // A fresh Preview is still allowed while the write is unresolved; it
    // must not clear Plan A or the recoverable generation reference.
    await user.click(
      screen.getByRole("button", { name: COPY.programs.previewEvents })
    );

    await expect(
      screen.findByRole("button", {
        name: COPY.programs.generatedReconcileUnknown,
      })
    ).resolves.toHaveAttribute("data-generation-plan-id", "plan-1");
    expect(
      screen.getByRole("button", { name: COPY.programs.generateEvents })
    ).toBeDisabled();
    expect(reconcile).toHaveAttribute("data-generation-plan-id", "plan-1");
  });

  test("remount restores the unresolved generation, stays blocked, and reconciles from Plan A", async () => {
    const user = userEvent.setup();
    await previewAndLoseAcknowledgement(user);
    cleanup();

    renderPanel();
    const reconcile = await screen.findByRole("button", {
      name: COPY.programs.generatedReconcileUnknown,
    });
    expect(reconcile).toHaveAttribute("data-generation-plan-id", "plan-1");
    expect(
      screen.getByText(COPY.programs.scheduleTransportAmbiguous)
    ).toBeInTheDocument();
    // Loading a fresh Preview must not clear the unresolved reference, and
    // the Generate affordance inside the new Preview stays blocked.
    await user.click(
      await screen.findByRole("button", { name: COPY.programs.previewEvents })
    );
    const generate = await screen.findByRole("button", {
      name: COPY.programs.generateEvents,
    });
    expect(generate).toBeDisabled();
    expect(reconcile).toHaveAttribute("data-generation-plan-id", "plan-1");
    mocks.generateEvents.mockResolvedValueOnce({
      generated: {
        run_id: "run-1",
        plan_id: "plan-1",
        status: "completed",
        created: 1,
        skipped: 0,
        failed: 0,
        resumed: true,
        created_event_ids: ["event-created"],
      },
    });
    const live = screen.getByRole("button", {
      name: COPY.programs.generatedReconcileUnknown,
    });
    await user.click(live);
    const resumedCopy = COPY.programs.generatedResumed
      .replace("{created}", "1")
      .replace("{skipped}", "0");
    await expect(
      screen.findByText((_, element) => element?.textContent === resumedCopy)
    ).resolves.toBeInTheDocument();
    expect(mocks.generateEvents).toHaveBeenLastCalledWith(
      "program-1",
      "plan-1"
    );
    expect(
      screen.getByRole("button", { name: COPY.programs.generateEvents })
    ).not.toBeDisabled();
    expect(window.sessionStorage.length).toBe(0);
  });

  test("each Generate attempt proves request send and response receive on the wire", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(
      await screen.findByRole("button", { name: COPY.programs.previewEvents })
    );
    await screen.findByRole("button", { name: COPY.programs.generateEvents });
    const witnessed = { request: false, response: false };
    mocks.generateEvents.mockImplementationOnce(
      async (programId: string, planId: string) => {
        witnessed.request = true;
        expect({ programId, planId }).toStrictEqual({
          programId: "program-1",
          planId: "plan-1",
        });
        const generated = {
          run_id: "run-1",
          plan_id: planId,
          status: "completed" as const,
          created: 1,
          skipped: 0,
          failed: 0,
          resumed: false,
          created_event_ids: ["event-created"],
        };
        witnessed.response = true;
        return { generated };
      }
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.generateEvents })
    );
    await expect(
      screen.findByText(
        COPY.programs.generated.replace("{created}", "1").replace("{skipped}", "0")
      )
    ).resolves.toBeInTheDocument();
    expect(witnessed).toStrictEqual({ request: true, response: true });
    expect(mocks.generateEvents).toHaveBeenCalledTimes(1);
    expect(mocks.generateEvents).toHaveBeenLastCalledWith(
      "program-1",
      "plan-1"
    );
  });
});
describe("F02 Preview 調整 uses Management Drafts (#632)", () => {
  const twoOccurrencePreview: PreviewResult = {
    plan: {
      plan_id: "plan-1",
      program_id: "program-1",
      plan_hash: "hash-1",
      horizon_days: wallDaySpan(
        hkTodayWallDate(),
        addWallDays(addWallMonths(hkTodayWallDate(), 3), -1)
      ),
      from_date: hkTodayWallDate(),
      to_date: addWallDays(addWallMonths(hkTodayWallDate(), 3), -1),
      rule_count: 1,
      created_at: "2026-09-16T00:00:00.000Z",
    },
    occurrences: [
      {
        occurrence_id: "occ-first",
        plan_id: "plan-1",
        rule_id: "rule-1",
        occurs_on: "2026-09-16",
        starts_at: "2026-09-16T11:30:00.000Z",
        ends_at: "2026-09-16T13:00:00.000Z",
        location: "主堂",
        skip_reason: null,
        exception_id: null,
      },
      {
        occurrence_id: "occ-second",
        plan_id: "plan-1",
        rule_id: "rule-1",
        occurs_on: "2026-09-23",
        starts_at: "2026-09-23T11:30:00.000Z",
        ends_at: "2026-09-23T13:00:00.000Z",
        location: "主堂",
        skip_reason: null,
        exception_id: null,
      },
    ],
  };

  beforeEach(() => {
    window.sessionStorage.clear();
    mocks.previewEvents.mockReset().mockResolvedValue(twoOccurrencePreview);
    mocks.generateEvents.mockReset();
    mocks.createScheduleException.mockReset();
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
  });

  function renderPanel() {
    return render(
      <RecurringSchedulePanel
        programId="program-1"
        rules={[rule]}
        rulesError={null}
        onGenerated={vi.fn<() => Promise<boolean>>().mockResolvedValue(true)}
      />
    );
  }

  function draftKeys(): string[] {
    const keys: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith("efcc_management_draft:")) {
        keys.push(decodeURIComponent(key));
      }
    }
    return keys.sort();
  }

  async function previewTwoOccurrences(user: UserEvent) {
    renderPanel();
    await user.click(
      await screen.findByRole("button", { name: COPY.programs.previewEvents })
    );
    const adjust = await screen.findAllByRole("button", {
      name: COPY.programs.previewAdjustOccurrence,
    });
    expect(adjust).toHaveLength(2);
    return adjust;
  }

  test("opening and closing the Sheet unchanged writes no draft and no server exception", async () => {
    const user = userEvent.setup();
    const adjust = await previewTwoOccurrences(user);
    await user.click(adjust[0]);
    await screen.findByRole("heading", {
      name: COPY.programs.previewAdjustSheetTitle,
    });
    await user.click(
      screen.getByRole("button", { name: COPY.programs.previewCancelDraft })
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", {
          name: COPY.programs.previewAdjustSheetTitle,
        })
      ).not.toBeInTheDocument()
    );
    expect(draftKeys()).toStrictEqual([]);
    expect(mocks.createScheduleException).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: COPY.programs.generateEvents })
    ).not.toBeDisabled();
  });

  test("a real field change persists one occurrence-scoped key and survives reload", async () => {
    const user = userEvent.setup();
    const adjust = await previewTwoOccurrences(user);
    await user.click(adjust[0]);
    const dateInput = await screen.findByLabelText(
      COPY.programs.settingsExceptionNewDate
    );
    await user.clear(dateInput);
    await user.type(dateInput, "2026-09-17");
    await waitFor(() =>
      expect(draftKeys()).toStrictEqual([
        "efcc_management_draft:program-1:settings-exception:rule-1:2026-09-16",
      ])
    );
    await user.click(
      screen.getByRole("button", { name: "Close" })
    );
    expect(mocks.createScheduleException).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: COPY.programs.generateEvents })
    ).toBeDisabled();
    expect(
      screen.getByText(COPY.programs.previewExceptionDraft)
    ).toBeInTheDocument();
    cleanup();

    renderPanel();
    await user.click(
      await screen.findByRole("button", { name: COPY.programs.previewEvents })
    );
    await screen.findAllByRole("button", {
      name: COPY.programs.previewAdjustOccurrence,
    });
    expect(
      screen.getByText(COPY.programs.previewExceptionDraft)
    ).toBeInTheDocument();
    expect(draftKeys()).toStrictEqual([
      "efcc_management_draft:program-1:settings-exception:rule-1:2026-09-16",
    ]);
  });

  test("two same-rule occurrences and the Settings editor occupy three distinct session keys", async () => {
    const user = userEvent.setup();
    writeManagementDraft(
      "program-1",
      "settings-exception:rule-1",
      {
        overrideDate: "2026-09-16",
        action: "CANCEL",
        newDate: "2026-09-16",
        newStartTime: "11:30",
        newEndTime: "13:00",
      }
    );
    const adjust = await previewTwoOccurrences(user);
    await user.click(adjust[0]);
    await user.clear(
      await screen.findByLabelText(COPY.programs.settingsExceptionNewDate)
    );
    await user.type(
      screen.getByLabelText(COPY.programs.settingsExceptionNewDate),
      "2026-09-17"
    );
    await waitFor(() =>
      expect(draftKeys()).toContain(
        "efcc_management_draft:program-1:settings-exception:rule-1:2026-09-16"
      )
    );
    await user.keyboard("{Escape}");
    await user.click(adjust[1]);
    await user.clear(
      await screen.findByLabelText(COPY.programs.settingsExceptionNewDate)
    );
    await user.type(
      screen.getByLabelText(COPY.programs.settingsExceptionNewDate),
      "2026-09-24"
    );
    await waitFor(() =>
      expect(draftKeys()).toStrictEqual([
        "efcc_management_draft:program-1:settings-exception:rule-1",
        "efcc_management_draft:program-1:settings-exception:rule-1:2026-09-16",
        "efcc_management_draft:program-1:settings-exception:rule-1:2026-09-23",
      ])
    );
  });

  test("an orphan draft stays Recover/Discard-able without permanently disabling Generate", async () => {
    const user = userEvent.setup();
    const adjust = await previewTwoOccurrences(user);
    await user.click(adjust[0]);
    await user.clear(
      await screen.findByLabelText(COPY.programs.settingsExceptionNewDate)
    );
    await user.type(
      screen.getByLabelText(COPY.programs.settingsExceptionNewDate),
      "2026-09-17"
    );
    await waitFor(() =>
      expect(draftKeys()).toHaveLength(1)
    );
    await user.click(
      screen.getByRole("button", { name: "Close" })
    );
    // The first occurrence leaves the visible range; the draft becomes an
    // orphan but remains recoverable.
    mocks.previewEvents.mockResolvedValue({
      ...twoOccurrencePreview,
      occurrences: [twoOccurrencePreview.occurrences[1]],
    });
    await user.click(
      screen.getByRole("button", { name: COPY.programs.previewReviewAgain })
    );
    await expect(
      screen.findByText(COPY.programs.previewOrphanDraftsTitle)
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.generateEvents })
    ).not.toBeDisabled();
    mocks.createScheduleException.mockResolvedValueOnce({
      exception: {
        exception_id: "exception-1",
        rule_id: "rule-1",
        override_date: "2026-09-16",
        action: "RESCHEDULE",
        new_start_time: "11:30",
        new_end_time: "13:00",
        new_date: "2026-09-17",
        created_at: "2026-09-18T00:00:00.000Z",
      },
    });
    await user.click(
      screen.getByRole("button", { name: COPY.programs.draftRecover })
    );
    await screen.findByRole("heading", {
      name: COPY.programs.previewAdjustSheetTitle,
    });
    await user.click(
      screen.getByRole("button", { name: COPY.programs.previewSaveException })
    );
    await waitFor(() =>
      expect(mocks.createScheduleException).toHaveBeenCalledWith(
        "program-1",
        "rule-1",
        {
          override_date: "2026-09-16",
          action: "RESCHEDULE",
          new_date: "2026-09-17",
          new_start_time: "11:30",
          new_end_time: "13:00",
        }
      )
    );
    await waitFor(() => expect(draftKeys()).toStrictEqual([]));
  });
});
