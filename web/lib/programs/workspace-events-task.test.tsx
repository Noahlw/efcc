import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { COPY } from "@/lib/copy";
import type {
  GenerateResult,
  PreviewResult,
  Program,
  ProgramEvent,
  ScheduleRule,
} from "@/lib/programs/program-api";

import {
  clearEventCreateDraft,
  readEventCreateDraft,
  writeEventCreateDraft,
} from "./event-create-draft";
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
  start_time: "19:30",
  end_time: "21:00",
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
  hash: string | null = null
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
    const todayDate = hkTodayWallDate();
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
      wallInstant(todayDate, "12:00"),
      wallInstant(todayDate, "13:00")
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
    expect(
      within(filters).getByRole("tab", {
        name: COPY.programs.eventsFilterCurrent,
      })
    ).toHaveAttribute("aria-selected", "true");
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
    expect({
      cancelled: list.querySelectorAll('[data-event-id="event-cancelled"]')
        .length,
      past: Boolean(list.querySelector('[data-event-id="event-past"]')),
      reason: Boolean(
        within(list).queryByText(
          COPY.programs.cancelledReason.replace("{reason}", "場地維修")
        )
      ),
    }).toStrictEqual({ cancelled: 1, past: false, reason: true });
    const cancelledRow = list.querySelector<HTMLElement>(
      '[data-event-id="event-cancelled"]'
    );
    expect(cancelledRow).not.toBeNull();
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
    expect(mocks.createEvent).toHaveBeenCalledTimes(1);
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
    const user = userEvent.setup();
    renderTask();

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
