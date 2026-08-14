// ATT-03 (#215) — component tests for the attendance operator panel. MSW
// intercepts the Worker RPCs; the announced-success + silent-reload flow
// and the cancelled-event gating are asserted against the real DOM,
// matching the E2E suite's observable contracts.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import type {
  AttendanceEvent,
  AttendanceMember,
  AttendanceRow,
} from "@/lib/attendance";
import { AttendanceOperatorPanel } from "@/lib/attendance-operator-panel";
import { COPY } from "@/lib/copy";
import { LiveRegion } from "@/lib/live-region";

const server = setupServer();

const ACTIVE: AttendanceEvent = {
  event_id: "evt-1",
  program_id: "prog-1",
  program_name: "週六團契",
  name: "週六聚會",
  location: "主堂",
  starts_at: "2026-08-13T11:30:00.000Z",
  ends_at: "2026-08-13T13:00:00.000Z",
  manual_check_in_code: "ATT1234",
  check_in_window_opens_at: "2026-08-13T10:30:00.000Z",
  check_in_window_closes_at: "2026-08-13T13:30:00.000Z",
  status: "Active",
  availability: "Active",
};

const CANCELLED: AttendanceEvent = {
  ...ACTIVE,
  event_id: "evt-2",
  manual_check_in_code: "ATT9999",
  status: "Cancelled",
};

const MEMBER: AttendanceMember = {
  user_id: "U-E2E-MEMBER",
  name: "E2E Member",
  phone: "9123 4567",
  qr_code_string: "E2E-MEMBER-U-E2E-MEMBER",
};

const ROW: AttendanceRow = {
  attendance_id: "att-1",
  event_id: ACTIVE.event_id,
  member_user_id: MEMBER.user_id,
  guest_name: null,
  guest_phone: null,
  guest_phone_normalized: null,
  method: "leader_manual_search",
  status: "Active",
  checked_in_at: "2026-08-13T11:31:00.000Z",
  checked_in_by: "U-ADMIN",
  voided_by: null,
  voided_at: null,
  void_reason: null,
};

function rosterHandler(event: AttendanceEvent, rows: AttendanceRow[]) {
  return http.get(`/api/v1/attendance/events/${event.event_id}/roster`, () =>
    HttpResponse.json({
      requestId: "rid-roster",
      data: { event, attendances: rows },
    })
  );
}

function renderWithLiveRegion() {
  render(
    <>
      <LiveRegion />
      <AttendanceOperatorPanel />
    </>
  );
}

describe(AttendanceOperatorPanel, () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => {
    cleanup();
    server.resetHandlers();
  });

  afterAll(() => server.close());

  test("assisted check-in announces success and keeps the notice after roster reload", async () => {
    let rosterCalls = 0;
    server.use(
      http.get("/api/v1/attendance/events", () =>
        HttpResponse.json({
          requestId: "rid-list",
          data: { events: [ACTIVE] },
        })
      ),
      http.get(`/api/v1/attendance/events/${ACTIVE.event_id}/roster`, () => {
        rosterCalls += 1;
        // First call: empty roster before the assist; later calls: the member row.
        return HttpResponse.json({
          requestId: "rid-roster",
          data: {
            event: ACTIVE,
            attendances: rosterCalls === 1 ? [] : [ROW],
          },
        });
      }),
      http.get(`/api/v1/attendance/events/${ACTIVE.event_id}/members`, () =>
        HttpResponse.json({
          requestId: "rid-members",
          data: { members: [MEMBER] },
        })
      ),
      http.post(`/api/v1/attendance/events/${ACTIVE.event_id}/check-in`, () =>
        HttpResponse.json({
          requestId: "rid-checkin",
          data: { outcome: "success", attendance_id: "att-1" },
        })
      )
    );
    const user = userEvent.setup();
    renderWithLiveRegion();

    await screen.findByLabelText(COPY.attendance.chooseEvent);
    await user.selectOptions(
      screen.getByLabelText(COPY.attendance.chooseEvent),
      ACTIVE.event_id
    );
    await waitFor(() =>
      expect(screen.getByLabelText(COPY.attendance.memberSearch)).toBeVisible()
    );

    await user.type(
      screen.getByLabelText(COPY.attendance.memberSearch),
      "E2E Member"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.search })
    );
    await screen.findByText(MEMBER.name);

    await user.click(screen.getByRole("button", { name: /替成員簽到/u }));
    // The silent roster reload must NOT overwrite the visible success…
    await waitFor(() => expect(rosterCalls).toBeGreaterThanOrEqual(2));
    // Both the panel output and the sr-only live region carry the notice.
    const successOutputs = await screen.findAllByText(COPY.attendance.success);
    expect(successOutputs.length).toBeGreaterThanOrEqual(2);
    expect(
      screen.queryByText(`${1} ${COPY.attendance.roster}`)
    ).not.toBeInTheDocument();

    // …and the sr-only live region announced it for screen readers.
    const live = document.querySelector('output[role="status"]');
    await waitFor(() =>
      expect(live?.textContent).toBe(COPY.attendance.success)
    );
  });

  test("cancelled event: chooser suffix, notice, and no check-in controls", async () => {
    server.use(
      http.get("/api/v1/attendance/events", () =>
        HttpResponse.json({
          requestId: "rid-list",
          data: { events: [ACTIVE, CANCELLED] },
        })
      ),
      rosterHandler(CANCELLED, []),
      rosterHandler(ACTIVE, [])
    );
    const user = userEvent.setup();
    renderWithLiveRegion();

    await screen.findByRole("option", {
      name: new RegExp(`（${COPY.programs.eventCancelled}）`, "u"),
    });

    await user.selectOptions(
      screen.getByLabelText(COPY.attendance.chooseEvent),
      CANCELLED.event_id
    );
    await screen.findByText(COPY.attendance.eventCancelled);
    expect(
      screen.queryByLabelText(COPY.attendance.memberSearch)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.attendance.camera })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.attendance.printSheet })
    ).not.toBeInTheDocument();
  });
});
