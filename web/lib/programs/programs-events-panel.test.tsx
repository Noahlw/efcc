// PRG-02 (#198) — component tests for the events panel (U1-U6).
// MSW intercepts the Worker program endpoints; fixtures carry no credential
// material. Hong Kong wall times are asserted via Intl-rendered labels.
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { COPY, errorCopyFor } from "@/lib/copy";
import type {
  Program,
  ProgramEvent,
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
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const ACTIVE_EVENT: ProgramEvent = {
  event_id: "evt-1",
  program_id: "prog-1",
  starts_at: "2026-08-13T11:30:00.000Z",
  ends_at: "2026-08-13T13:00:00.000Z",
  status: "Active",
  source: "SCHEDULE",
  cancel_reason: null,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
};

function normalized(text: string): string {
  return text.replaceAll(/[\u202F\u00A0]/gu, " ");
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
      screen.findByText((text) => text.includes(`${COPY.programs.ruleWeekly} 2`))
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByText((_, el) =>
        el?.textContent !== undefined && normalized(el.textContent).includes("2026/08/13 19:30")
      )
    ).toBeInTheDocument();
    expect(screen.getByText(COPY.programs.eventActive)).toBeInTheDocument();
    expect(screen.getByText(COPY.programs.eventScheduleSource)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: COPY.programs.addRule })).not.toBeInTheDocument();
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
    await expect(screen.findByText(COPY.programs.noRules)).resolves.toBeInTheDocument();
    expect(screen.getByText(COPY.programs.eventsEmpty)).toBeInTheDocument();
    expect(screen.getByText(COPY.programs.hkTimeMarker)).toBeInTheDocument();
    expect(screen.getByLabelText(COPY.programs.startTime)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: COPY.programs.addRule })).toBeInTheDocument();
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
    await expect(screen.findByText(COPY.programs.eventsEmpty)).resolves.toBeInTheDocument();
    expect(screen.getByLabelText(COPY.programs.eventStart)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: COPY.programs.createEvent })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: COPY.programs.addRule })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.generateEvents })
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
      http.post("/api/v1/programs/prog-1/schedule-rules", async ({ request }) => {
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
      })
    );
    const user = userEvent.setup();
    render(<EventsPanel program={RECURRING} canManage />);
    await screen.findByText(COPY.programs.noRules);
    await user.type(screen.getByLabelText(COPY.programs.dayOfWeekLabel), "3");
    await user.type(screen.getByLabelText(COPY.programs.startTime), "19:30");
    await user.type(screen.getByLabelText(COPY.programs.endTime), "21:00");
    await user.click(screen.getByRole("button", { name: COPY.programs.addRule }));
    await expect(screen.findByText(COPY.programs.created)).resolves.toBeInTheDocument();
    await expect(
      screen.findByText((text) => text.includes(`${COPY.programs.ruleWeekly} 3`))
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
      http.patch("/api/v1/programs/prog-1/events/evt-1", async ({ request }) => {
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
      })
    );
    const user = userEvent.setup();
    render(<EventsPanel program={RECURRING} canManage />);
    await screen.findByText(COPY.programs.eventActive);
    const cancelButton = screen.getByRole("button", { name: COPY.programs.cancelEvent });
    // the form is invalid until the manager types a reason
    expect(cancelButton).toBeDisabled();
    await user.type(screen.getByLabelText(COPY.programs.cancelReason), "惡劣天氣");
    await user.click(cancelButton);
    await expect(
      screen.findByText(COPY.programs.eventCancelledNotice)
    ).resolves.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(COPY.programs.eventCancelled)).toBeInTheDocument();
    });
  });

  test("U6 a failed generation surfaces the mapped error in an alert", async () => {
    server.use(
      http.get("/api/v1/programs/prog-1/schedule-rules", () =>
        HttpResponse.json({ requestId: "rid-1", data: { rules: [] } })
      ),
      http.get("/api/v1/programs/prog-1/events", () =>
        HttpResponse.json({ requestId: "rid-2", data: { events: [] } })
      ),
      http.post("/api/v1/programs/prog-1/events/generate", () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Invalid",
            status: 422,
            code: "VALIDATION",
            detail: "horizon_days must be an integer 1-365.",
            requestId: "rid-4",
          },
          { status: 422 }
        )
      )
    );
    const user = userEvent.setup();
    render(<EventsPanel program={RECURRING} canManage />);
    await screen.findByText(COPY.programs.noRules);
    await user.click(screen.getByRole("button", { name: COPY.programs.generateEvents }));
    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(errorCopyFor("VALIDATION"));
  });
});
