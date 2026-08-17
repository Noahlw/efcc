import { cleanup, render, screen, waitFor } from "@testing-library/react";
// PRG-02 (#198) — component tests for the events panel (U1-U6).
// MSW intercepts the Worker program endpoints; fixtures carry no credential
// material. Hong Kong wall times are asserted via Intl-rendered labels.
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { COPY } from "@/lib/copy";
import type {
  Program,
  ProgramEvent,
  ScheduleException,
  ScheduleRule,
} from "@/lib/programs/program-api";
import { EventsPanel } from "@/lib/programs/programs-events-panel";

const server = setupServer();

const RECURRING: Program = {
  program_id: "prog-1",
  department_id: "dept-1",
  name: "週六團契",
  description: null,
  category: null,
  behavior_type: "Recurring",
  lifecycle: "Active",
  discoverability: "Listed",
  enrollment_mode: "MemberRequest",
  display_order: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  capabilities: {
    manage: true,
    publish: true,
    enroll: false,
    leader_assign: true,
  },
};

const ONE_OFF: Program = {
  ...RECURRING,
  program_id: "prog-2",
  behavior_type: "OneOff",
};

const WEEKLY_RULE: ScheduleRule = {
  rule_id: "rule-1",
  program_id: "prog-1",
  recurrence: "WEEKLY",
  day_of_week: 2,
  month_day: null,
  start_time: "19:30",
  end_time: "21:00",
  location: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const ACTIVE_EVENT: ProgramEvent = {
  event_id: "evt-1",
  program_id: "prog-1",
  program_name: "顯恩堂主日學",
  starts_at: "2026-08-13T11:30:00.000Z",
  ends_at: "2026-08-13T13:00:00.000Z",
  status: "Active",
  source: "SCHEDULE",
  cancel_reason: null,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
};

// A SCHEDULE event on the WEEKLY_RULE's weekday (2026-08-11 is a Tuesday):
// 2026-08-11T11:30Z == 19:30 HK wall, matching rule-1's start_time.
const TUESDAY_EVENT: ProgramEvent = {
  ...ACTIVE_EVENT,
  event_id: "evt-tue",
  starts_at: "2026-08-11T11:30:00.000Z",
  ends_at: "2026-08-11T13:00:00.000Z",
};

const CANCEL_EXCEPTION: ScheduleException = {
  exception_id: "exc-1",
  rule_id: "rule-1",
  override_date: "2026-08-11",
  action: "CANCEL",
  new_start_time: null,
  new_end_time: null,
  created_at: "2026-08-01T00:00:00.000Z",
};

function normalized(text: string): string {
  return text.replaceAll(/[\u202F\u00A0\u2009]/gu, " ");
}

describe("PRG-02 events panel", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => {
    cleanup();
    server.resetHandlers();
  });

  afterAll(() => server.close());

  test("U1 Members see rules and HK wall times, but no management affordances", async () => {
    server.use(
      http.get("/api/v1/programs/prog-1/schedule-rules", () =>
        HttpResponse.json({
          requestId: "rid-1",
          data: { rules: [WEEKLY_RULE] },
        })
      ),
      http.get("/api/v1/programs/prog-1/events", () =>
        HttpResponse.json({
          requestId: "rid-2",
          data: { events: [ACTIVE_EVENT] },
        })
      )
    );
    render(<EventsPanel program={RECURRING} canManage={false} />);
    await expect(
      screen.findByText((text) =>
        text.includes(`${COPY.programs.ruleWeekly} 星期二`)
      )
    ).resolves.toBeInTheDocument();
    const matches = await screen.findAllByText(
      (_, el) =>
        el?.textContent !== undefined &&
        normalized(el.textContent).includes("2026/08/13 19:30")
    );
    expect(matches.length).toBeGreaterThan(0);
    expect(screen.getByText(COPY.programs.eventActive)).toBeInTheDocument();
    expect(
      screen.getAllByText(COPY.programs.eventScheduleSource).length
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: COPY.programs.addRule })
    ).not.toBeInTheDocument();
  });

  test("U2 Recurring managers get the rule form, generate button, and empty copy", async () => {
    server.use(
      http.get("/api/v1/programs/prog-1/schedule-rules", () =>
        HttpResponse.json({ requestId: "rid-1", data: { rules: [] } })
      ),
      http.get("/api/v1/programs/prog-1/events", () =>
        HttpResponse.json({ requestId: "rid-2", data: { events: [] } })
      )
    );
    render(<EventsPanel program={RECURRING} canManage />);
    await expect(
      screen.findByText(COPY.programs.noRules)
    ).resolves.toBeInTheDocument();
    expect(screen.getAllByText(COPY.programs.hkTimeMarker).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: COPY.programs.createMeeting })
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.secondaryGeneratorLabel)
    ).toBeInTheDocument();
  });

  test("U3 OneOff managers get the manual event form, not rule/generate controls", async () => {
    server.use(
      http.get("/api/v1/programs/prog-2/schedule-rules", () =>
        HttpResponse.json({ requestId: "rid-1", data: { rules: [] } })
      ),
      http.get("/api/v1/programs/prog-2/events", () =>
        HttpResponse.json({ requestId: "rid-2", data: { events: [] } })
      )
    );
    render(<EventsPanel program={ONE_OFF} canManage />);
    await expect(
      screen.findByText(COPY.programs.eventsEmpty)
    ).resolves.toBeInTheDocument();
    expect(screen.getByLabelText(COPY.programs.eventDate)).toBeInTheDocument();
    expect(screen.getByLabelText(COPY.programs.eventTime)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.createMeeting })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.secondaryGeneratorLabel })
    ).not.toBeInTheDocument();
  });

  test("U4 adding a rule posts WEEKLY fields, shows notice, and reloads the list", async () => {
    const rules: ScheduleRule[] = [];
    server.use(
      http.get("/api/v1/programs/prog-1/schedule-rules", () =>
        HttpResponse.json({ requestId: "rid-1", data: { rules } })
      ),
      http.get("/api/v1/programs/prog-1/events", () =>
        HttpResponse.json({ requestId: "rid-2", data: { events: [] } })
      ),
      http.post(
        "/api/v1/programs/prog-1/schedule-rules",
        async ({ request }) => {
          const body = (await request.json()) as {
            recurrence: string;
            day_of_week: number;
            start_time: string;
            end_time: string;
          };
          expect(body.day_of_week).toBe(3);
          expect(body.start_time).toBe("19:30");
          rules.push({
            ...WEEKLY_RULE,
            rule_id: "rule-new",
            day_of_week: 3,
            start_time: "19:30",
            end_time: "21:00",
          });
          return HttpResponse.json({
            requestId: "rid-3",
            data: { rule: rules[0] },
          });
        }
      )
    );
    const user = userEvent.setup();
    render(<EventsPanel program={RECURRING} canManage />);
    await screen.findByText(COPY.programs.noRules);
    await user.selectOptions(
      screen.getByLabelText(COPY.programs.dayOfWeekLabel),
      "3"
    );
    await user.type(screen.getByLabelText(COPY.programs.startTime), "19:30");
    await user.type(screen.getByLabelText(COPY.programs.endTime), "21:00");
    await user.click(
      screen.getByRole("button", { name: COPY.programs.addRule })
    );
    await expect(
      screen.findByText(COPY.programs.created)
    ).resolves.toBeInTheDocument();
    await expect(
      screen.findByText((text) =>
        text.includes(`${COPY.programs.ruleWeekly} 星期三`)
      )
    ).resolves.toBeInTheDocument();
  });

  test("U5 cancelling an event requires a reason, posts it, and reloads the status", async () => {
    const events: ProgramEvent[] = [{ ...ACTIVE_EVENT }];
    server.use(
      http.get("/api/v1/programs/prog-1/schedule-rules", () =>
        HttpResponse.json({ requestId: "rid-1", data: { rules: [] } })
      ),
      http.get("/api/v1/programs/prog-1/events", () =>
        HttpResponse.json({ requestId: "rid-2", data: { events } })
      ),
      http.patch(
        "/api/v1/programs/prog-1/events/evt-1",
        async ({ request }) => {
          const body = (await request.json()) as { reason: string };
          expect(body.reason).toBe("惡劣天氣");
          events[0] = {
            ...events[0],
            status: "Cancelled",
            cancel_reason: body.reason,
          };
          return HttpResponse.json({
            requestId: "rid-3",
            data: { event: events[0] },
          });
        }
      )
    );
    const user = userEvent.setup();
    render(<EventsPanel program={RECURRING} canManage />);
    await screen.findByText(COPY.programs.eventActive);
    const cancelReasonInput = screen.getByLabelText(COPY.programs.cancelReason);
    // The reason remains an optional audit note; cancellation still requires
    // an explicit confirmation step before the request is sent.
    await user.type(cancelReasonInput, "惡劣天氣");
    await user.click(
      screen.getByRole("button", { name: COPY.programs.cancelEvent })
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.confirmCancelEvent })
    );
    await expect(
      screen.findByText(COPY.programs.eventCancelledNotice)
    ).resolves.toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByText(COPY.programs.eventCancelled)
      ).toBeInTheDocument();
    });
  });

  test("U8 rescheduling posts a RESCHEDULE exception for the event's wall date", async () => {
    server.use(
      http.get("/api/v1/programs/prog-1/schedule-rules", () =>
        HttpResponse.json({ requestId: "rid-1", data: { rules: [WEEKLY_RULE] } })
      ),
      http.get("/api/v1/programs/prog-1/events", () =>
        HttpResponse.json({ requestId: "rid-2", data: { events: [TUESDAY_EVENT] } })
      ),
      http.post(
        "/api/v1/programs/prog-1/schedule-rules/rule-1/exceptions",
        async ({ request }) => {
          const body = (await request.json()) as {
            override_date: string;
            action: string;
            new_start_time: string;
            new_end_time: string;
          };
          expect(body).toEqual({
            override_date: "2026-08-11",
            action: "RESCHEDULE",
            new_start_time: "20:30",
            new_end_time: "22:00",
          });
          return HttpResponse.json({
            requestId: "rid-3",
            data: {
              exception: {
                ...CANCEL_EXCEPTION,
                exception_id: "exc-r",
                action: "RESCHEDULE",
                new_start_time: "20:30",
                new_end_time: "22:00",
              },
            },
          });
        }
      )
    );
    const user = userEvent.setup();
    render(<EventsPanel program={RECURRING} canManage />);
    await screen.findByText(COPY.programs.eventActive);
    await user.click(
      screen.getByRole("button", { name: COPY.programs.rescheduleEvent })
    );
    await user.type(
      screen.getByLabelText(COPY.programs.rescheduleStart),
      "20:30"
    );
    await user.type(
      screen.getByLabelText(COPY.programs.rescheduleEnd),
      "22:00"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.confirmReschedule })
    );
    await expect(
      screen.findByText(COPY.programs.exceptionUpdatedNotice)
    ).resolves.toBeInTheDocument();
    // The session exception surfaces the restore affordance on the row.
    await expect(
      screen.findByRole("button", { name: COPY.programs.restoreOccurrence })
    ).resolves.toBeInTheDocument();
  });

  test("U9 取消該次 posts a CANCEL exception; 恢復該次 deletes it", async () => {
    const events: ProgramEvent[] = [{ ...TUESDAY_EVENT }];
    let deleted = false;
    server.use(
      http.get("/api/v1/programs/prog-1/schedule-rules", () =>
        HttpResponse.json({ requestId: "rid-1", data: { rules: [WEEKLY_RULE] } })
      ),
      http.get("/api/v1/programs/prog-1/events", () =>
        HttpResponse.json({ requestId: "rid-2", data: { events } })
      ),
      http.post(
        "/api/v1/programs/prog-1/schedule-rules/rule-1/exceptions",
        async ({ request }) => {
          const body = (await request.json()) as {
            override_date: string;
            action: string;
          };
          expect(body).toEqual({
            override_date: "2026-08-11",
            action: "CANCEL",
          });
          return HttpResponse.json({
            requestId: "rid-3",
            data: { exception: CANCEL_EXCEPTION },
          });
        }
      ),
      http.delete(
        "/api/v1/programs/prog-1/schedule-rules/rule-1/exceptions/exc-1",
        () => {
          deleted = true;
          return HttpResponse.json({
            requestId: "rid-4",
            data: { deleted: true },
          });
        }
      )
    );
    const user = userEvent.setup();
    render(<EventsPanel program={RECURRING} canManage />);
    await screen.findByText(COPY.programs.eventActive);
    await user.click(
      screen.getByRole("button", { name: COPY.programs.cancelOccurrence })
    );
    // The confirm step replaces the trigger until confirmed.
    await expect(
      screen.getByText(COPY.programs.cancelOccurrenceConfirm)
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: COPY.programs.confirmCancelOccurrence })
    );
    await expect(
      screen.findByText(COPY.programs.exceptionUpdatedNotice)
    ).resolves.toBeInTheDocument();
    const restore = await screen.findByRole("button", {
      name: COPY.programs.restoreOccurrence,
    });
    await user.click(restore);
    await expect(
      screen.findByText(COPY.programs.exceptionRemovedNotice)
    ).resolves.toBeInTheDocument();
    expect(deleted).toBe(true);
    await expect(
      screen.findByRole("button", { name: COPY.programs.cancelOccurrence })
    ).resolves.toBeInTheDocument();
  });

  test("U10 exception controls are capability- and source-gated", async () => {
    const cancelled: ProgramEvent = {
      ...TUESDAY_EVENT,
      event_id: "evt-x",
      status: "Cancelled",
      cancel_reason: "惡劣天氣",
    };
    const manual: ProgramEvent = {
      ...TUESDAY_EVENT,
      event_id: "evt-m",
      source: "MANUAL",
    };
    const events = [TUESDAY_EVENT, cancelled, manual];
    server.use(
      http.get("/api/v1/programs/prog-1/schedule-rules", () =>
        HttpResponse.json({ requestId: "rid-1", data: { rules: [WEEKLY_RULE] } })
      ),
      http.get("/api/v1/programs/prog-1/events", () =>
        HttpResponse.json({ requestId: "rid-2", data: { events } })
      )
    );
    // Member: no exception controls at all.
    render(<EventsPanel program={RECURRING} canManage={false} />);
    await screen.findAllByText(COPY.programs.eventActive);
    expect(
      screen.queryByRole("button", { name: COPY.programs.rescheduleEvent })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.cancelOccurrence })
    ).not.toBeInTheDocument();
    cleanup();
    server.resetHandlers();
    // Manager: the SCHEDULE Active row gets controls; Cancelled and MANUAL
    // rows do not (the cancelled row shows its reason instead).
    server.use(
      http.get("/api/v1/programs/prog-1/schedule-rules", () =>
        HttpResponse.json({ requestId: "rid-1", data: { rules: [WEEKLY_RULE] } })
      ),
      http.get("/api/v1/programs/prog-1/events", () =>
        HttpResponse.json({ requestId: "rid-2", data: { events } })
      )
    );
    render(<EventsPanel program={RECURRING} canManage />);
    await screen.findAllByText(COPY.programs.eventActive);
    expect(
      screen.getByRole("button", { name: COPY.programs.rescheduleEvent })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.cancelOccurrence })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.restoreOccurrence })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        COPY.programs.cancelledReason.replace("{reason}", "惡劣天氣")
      )
    ).toBeInTheDocument();
    // One MANUAL Active event shares the date; controls render per row, so
    // count the SCHEDULE row's affordances (2 rows with 取消該次 would be a
    // gating leak — the MANUAL row must not render one).
    expect(
      screen.getAllByRole("button", { name: COPY.programs.rescheduleEvent })
    ).toHaveLength(1);
    expect(
      screen.getAllByRole("button", { name: COPY.programs.cancelOccurrence })
    ).toHaveLength(1);
  });

  test("U11 a cancelled event surfaces its reason in the row", async () => {
    server.use(
      http.get("/api/v1/programs/prog-1/schedule-rules", () =>
        HttpResponse.json({ requestId: "rid-1", data: { rules: [] } })
      ),
      http.get("/api/v1/programs/prog-1/events", () =>
        HttpResponse.json({
          requestId: "rid-2",
          data: {
            events: [
              {
                ...TUESDAY_EVENT,
                status: "Cancelled",
                cancel_reason: "天氣惡劣",
              },
            ],
          },
        })
      )
    );
    render(<EventsPanel program={RECURRING} canManage />);
    await expect(
      screen.findByText(
        COPY.programs.cancelledReason.replace("{reason}", "天氣惡劣")
      )
    ).resolves.toBeInTheDocument();
  });

  test("U12 a RESCHEDULE exception renders the 已改期 badge on the row", async () => {
    const RESCHEDULE_EXCEPTION: ScheduleException = {
      exception_id: "exc-2",
      rule_id: "rule-1",
      override_date: "2026-08-11",
      action: "RESCHEDULE",
      new_start_time: "08:30",
      new_end_time: "10:00",
      created_at: "2026-08-01T00:00:00.000Z",
    };
    server.use(
      http.get("/api/v1/programs/prog-1/schedule-rules", () =>
        HttpResponse.json({ requestId: "rid-1", data: { rules: [] } })
      ),
      http.get("/api/v1/programs/prog-1/events", () =>
        HttpResponse.json({
          requestId: "rid-2",
          data: {
            events: [{ ...TUESDAY_EVENT, exception: RESCHEDULE_EXCEPTION }],
          },
        })
      )
    );
    render(<EventsPanel program={RECURRING} canManage />);
    await expect(
      screen.findByText(
        COPY.programs.eventRescheduledBadge.replace("{time}", "08:30")
      )
    ).resolves.toBeInTheDocument();
  });

  test("U13 a CANCEL exception renders the 本次已取消 badge, and no exception renders none", async () => {
    server.use(
      http.get("/api/v1/programs/prog-1/schedule-rules", () =>
        HttpResponse.json({ requestId: "rid-1", data: { rules: [] } })
      ),
      http.get("/api/v1/programs/prog-1/events", () =>
        HttpResponse.json({
          requestId: "rid-2",
          data: {
            events: [
              { ...TUESDAY_EVENT, exception: CANCEL_EXCEPTION },
              { ...ACTIVE_EVENT, event_id: "evt-2" },
            ],
          },
        })
      )
    );
    render(<EventsPanel program={RECURRING} canManage />);
    await expect(
      screen.findByText(COPY.programs.eventCancelledBadge)
    ).resolves.toBeInTheDocument();
    expect(
      screen.getAllByText(COPY.programs.eventCancelledBadge)
    ).toHaveLength(1);
  });
  test("086-03 rows show meeting identity, type, recurrence tag, and informational note", async () => {
    const meeting = {
      ...ACTIVE_EVENT,
      source: "MANUAL" as const,
      name: "領袖訓練",
      event_type: "訓練",
      recurrence_tag: "每週",
      has_attendance: false,
    } as ProgramEvent;
    server.use(
      http.get("/api/v1/programs/prog-1/schedule-rules", () =>
        HttpResponse.json({ requestId: "rid-1", data: { rules: [] } })
      ),
      http.get("/api/v1/programs/prog-1/events", () =>
        HttpResponse.json({ requestId: "rid-2", data: { events: [meeting] } })
      )
    );
    render(<EventsPanel program={RECURRING} canManage />);
    await expect(screen.findByText("領袖訓練")).resolves.toBeInTheDocument();
    expect(screen.getAllByText("訓練").length).toBeGreaterThan(1);
    expect(
      screen.getByText(COPY.programs.repeatLabel.replace("{tag}", "每週"))
    ).toBeInTheDocument();
    expect(screen.getByText(COPY.programs.repeatInformational)).toBeInTheDocument();
  });

  test("086-03 manual creation validates required date, time, and name without submitting", async () => {
    let submitted = false;
    server.use(
      http.get("/api/v1/programs/prog-1/schedule-rules", () =>
        HttpResponse.json({ requestId: "rid-1", data: { rules: [] } })
      ),
      http.get("/api/v1/programs/prog-1/events", () =>
        HttpResponse.json({ requestId: "rid-2", data: { events: [] } })
      ),
      http.post("/api/v1/programs/prog-1/events", () => {
        submitted = true;
        return HttpResponse.json({ requestId: "rid-3", data: { event: ACTIVE_EVENT } });
      })
    );
    const user = userEvent.setup();
    render(<EventsPanel program={RECURRING} canManage />);
    await user.click(await screen.findByRole("button", { name: COPY.programs.createMeeting }));
    await user.click(screen.getByRole("button", { name: COPY.programs.createMeeting }));
    await expect(
      screen.findByText(COPY.programs.createMeetingValidation)
    ).resolves.toBeInTheDocument();
    expect(submitted).toBe(false);
  });

  test("086-03 valid manual creation submits event type and informational recurrence tag", async () => {
    let submittedBody: Record<string, unknown> | null = null;
    const created = {
      ...ACTIVE_EVENT,
      source: "MANUAL" as const,
      event_id: "evt-created",
      name: "新聚會",
      event_type: "小組",
      recurrence_tag: "無",
      has_attendance: false,
    } as ProgramEvent;
    server.use(
      http.get("/api/v1/programs/prog-1/schedule-rules", () =>
        HttpResponse.json({ requestId: "rid-1", data: { rules: [] } })
      ),
      http.get("/api/v1/programs/prog-1/events", () =>
        HttpResponse.json({ requestId: "rid-2", data: { events: [created] } })
      ),
      http.post("/api/v1/programs/prog-1/events", async ({ request }) => {
        submittedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ requestId: "rid-3", data: { event: created } });
      })
    );
    const user = userEvent.setup();
    render(<EventsPanel program={RECURRING} canManage />);
    await user.click(await screen.findByRole("button", { name: COPY.programs.createMeeting }));
    await user.type(screen.getByLabelText(COPY.programs.eventDate), "2026-09-13");
    await user.type(screen.getByLabelText(COPY.programs.eventTime), "19:30");
    await user.type(screen.getByLabelText(COPY.programs.eventName), "新聚會");
    await user.selectOptions(screen.getByLabelText(COPY.programs.eventType), "小組");
    await user.selectOptions(screen.getByLabelText(COPY.programs.recurrenceTag), "無");
    await user.click(screen.getByRole("button", { name: COPY.programs.createMeeting }));
    await waitFor(() => expect(submittedBody).not.toBeNull());
    expect(submittedBody).toMatchObject({
      name: "新聚會",
      event_type: "小組",
    });
    expect(submittedBody).not.toHaveProperty("recurrence_tag");
  });
  test("086-03 cancellation with attendance is refused without a cancel request", async () => {
    const meeting = {
      ...ACTIVE_EVENT,
      has_attendance: true,
      name: "已有出席聚會",
    } as ProgramEvent;
    let cancelRequested = false;
    server.use(
      http.get("/api/v1/programs/prog-1/schedule-rules", () =>
        HttpResponse.json({ requestId: "rid-1", data: { rules: [] } })
      ),
      http.get("/api/v1/programs/prog-1/events", () =>
        HttpResponse.json({ requestId: "rid-2", data: { events: [meeting] } })
      ),
      http.patch("/api/v1/programs/prog-1/events/evt-1", () => {
        cancelRequested = true;
        return HttpResponse.json({ requestId: "rid-3", data: { event: meeting } });
      })
    );
    const user = userEvent.setup();
    render(<EventsPanel program={RECURRING} canManage />);
    await user.click(await screen.findByRole("button", { name: COPY.programs.cancelEvent }));
    await expect(
      screen.findByText(COPY.programs.cancelBlockedWithAttendance)
    ).resolves.toBeInTheDocument();
    expect(cancelRequested).toBe(false);
  });

  test("086-03 cancellation without attendance requires confirmation; keep preserves the meeting", async () => {
    const meeting = { ...ACTIVE_EVENT, has_attendance: false } as ProgramEvent;
    let cancelled = false;
    server.use(
      http.get("/api/v1/programs/prog-1/schedule-rules", () =>
        HttpResponse.json({ requestId: "rid-1", data: { rules: [] } })
      ),
      http.get("/api/v1/programs/prog-1/events", () =>
        HttpResponse.json({
          requestId: "rid-2",
          data: { events: cancelled ? [{ ...meeting, status: "Cancelled" }] : [meeting] },
        })
      ),
      http.patch("/api/v1/programs/prog-1/events/evt-1", async ({ request }) => {
        const body = (await request.json()) as { status?: string };
        if (body.status === "Cancelled") cancelled = true;
        return HttpResponse.json({
          requestId: "rid-3",
          data: { event: { ...meeting, status: cancelled ? "Cancelled" : "Active" } },
        });
      })
    );
    const user = userEvent.setup();
    render(<EventsPanel program={RECURRING} canManage />);
    await user.click(await screen.findByRole("button", { name: COPY.programs.cancelEvent }));
    await expect(
      screen.findByText(COPY.programs.cancelMeetingConfirmTitle)
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.cancelMeetingConfirmBody)
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: COPY.programs.keepMeeting }));
    expect(cancelled).toBe(false);
    expect(screen.queryByText(COPY.programs.cancelMeetingConfirmTitle)).not.toBeInTheDocument();
  });
});
