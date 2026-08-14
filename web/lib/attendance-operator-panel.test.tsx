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

  test("operator voids an active attendance row with reason", async () => {
    let voided = false;
    server.use(
      http.get("/api/v1/attendance/events", () =>
        HttpResponse.json({
          requestId: "rid-list",
          data: { events: [ACTIVE] },
        })
      ),
      http.get(`/api/v1/attendance/events/${ACTIVE.event_id}/roster`, () =>
        HttpResponse.json({
          requestId: "rid-roster",
          data: {
            event: ACTIVE,
            attendances: [
              voided
                ? { ...ROW, status: "Voided", void_reason: "輸入錯誤" }
                : ROW,
            ],
          },
        })
      ),
      http.post("/api/v1/attendance/att-1/void", async ({ request }) => {
        const body = (await request.json()) as { reason: string };
        expect(body.reason).toBe("輸入錯誤");
        voided = true;
        return HttpResponse.json({
          requestId: "rid-void",
          data: { outcome: "voided", attendance_id: "att-1" },
        });
      })
    );
    const user = userEvent.setup();
    renderWithLiveRegion();

    await screen.findByLabelText(COPY.attendance.chooseEvent);
    await user.selectOptions(
      screen.getByLabelText(COPY.attendance.chooseEvent),
      ACTIVE.event_id
    );

    await screen.findByText(MEMBER.user_id);
    await user.type(
      screen.getByLabelText(COPY.attendance.voidReason),
      "輸入錯誤"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.void })
    );

    await waitFor(() => {
      expect(screen.getByText(COPY.attendance.status.Voided)).toBeVisible();
    });
  });

  test("operator corrects guest attendance name and phone with reason", async () => {
    const guestRow: AttendanceRow = {
      attendance_id: "att-guest-1",
      event_id: ACTIVE.event_id,
      member_user_id: null,
      guest_name: "舊訪客名",
      guest_phone: "9111 2222",
      guest_phone_normalized: "hk:85291112222",
      method: "guest_manual_code",
      status: "Active",
      checked_in_at: "2026-08-13T11:31:00.000Z",
      checked_in_by: null,
      voided_by: null,
      voided_at: null,
      void_reason: null,
    };
    let corrected = false;
    server.use(
      http.get("/api/v1/attendance/events", () =>
        HttpResponse.json({
          requestId: "rid-list",
          data: { events: [ACTIVE] },
        })
      ),
      http.get(`/api/v1/attendance/events/${ACTIVE.event_id}/roster`, () =>
        HttpResponse.json({
          requestId: "rid-roster",
          data: {
            event: ACTIVE,
            attendances: [
              corrected
                ? {
                    ...guestRow,
                    guest_name: "新訪客名",
                    guest_phone: "9222 3333",
                  }
                : guestRow,
            ],
          },
        })
      ),
      http.patch(
        "/api/v1/attendance/att-guest-1/guest-correction",
        async ({ request }) => {
          const body = (await request.json()) as {
            name: string;
            phone: string;
            reason: string;
          };
          expect(body.name).toBe("新訪客名");
          expect(body.phone).toBe("9222 3333");
          expect(body.reason).toBe("更正電話");
          corrected = true;
          return HttpResponse.json({
            requestId: "rid-corr",
            data: { outcome: "corrected", attendance_id: "att-guest-1" },
          });
        }
      )
    );
    const user = userEvent.setup();
    renderWithLiveRegion();

    await screen.findByLabelText(COPY.attendance.chooseEvent);
    await user.selectOptions(
      screen.getByLabelText(COPY.attendance.chooseEvent),
      ACTIVE.event_id
    );

    await screen.findByText("舊訪客名");
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.correctGuest })
    );

    const nameInput = screen.getByDisplayValue("舊訪客名");
    await user.clear(nameInput);
    await user.type(nameInput, "新訪客名");

    const phoneInput = screen.getByDisplayValue("9111 2222");
    await user.clear(phoneInput);
    await user.type(phoneInput, "9222 3333");

    await user.type(
      screen.getByLabelText(COPY.attendance.correctionReason),
      "更正電話"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.saveCorrection })
    );

    await waitFor(() => {
      expect(screen.getByText("新訪客名")).toBeVisible();
      expect(screen.getByText("9222 3333")).toBeVisible();
    });
  });

  test("operator panel surfaces error tone and recovers when void fails", async () => {
    server.use(
      http.get("/api/v1/attendance/events", () =>
        HttpResponse.json({
          requestId: "rid-list",
          data: { events: [ACTIVE] },
        })
      ),
      http.get(`/api/v1/attendance/events/${ACTIVE.event_id}/roster`, () =>
        HttpResponse.json({
          requestId: "rid-roster",
          data: { event: ACTIVE, attendances: [ROW] },
        })
      ),
      http.post("/api/v1/attendance/att-1/void", () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Forbidden",
            status: 403,
            code: "FORBIDDEN",
            detail: "你沒有取消此簽到的權限。",
          },
          { status: 403 }
        )
      )
    );
    const user = userEvent.setup();
    renderWithLiveRegion();

    await screen.findByLabelText(COPY.attendance.chooseEvent);
    await user.selectOptions(
      screen.getByLabelText(COPY.attendance.chooseEvent),
      ACTIVE.event_id
    );

    await screen.findByText(MEMBER.user_id);
    await user.type(
      screen.getByLabelText(COPY.attendance.voidReason),
      "嘗試作廢"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.void })
    );

    const errorOutputs = await screen.findAllByText(COPY.error.forbidden);
    expect(errorOutputs.length).toBeGreaterThanOrEqual(1);
    const visibleOutput = errorOutputs.find(
      (el) => el.dataset.tone === "error"
    );
    expect(visibleOutput).toBeDefined();
    // Roster remains visible and intact; no optimistic deletion occurs on failure.
    expect(screen.getByText(MEMBER.user_id)).toBeVisible();
    expect(
      screen.getByRole("button", { name: COPY.attendance.void })
    ).toBeEnabled();
  });
});
