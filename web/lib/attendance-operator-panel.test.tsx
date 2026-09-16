// ATT-03 (#215) — component tests for the attendance operator panel. MSW
// intercepts the Worker RPCs; the announced-success + silent-reload flow
// and the cancelled-event gating are asserted against the real DOM,
// matching the E2E suite's observable contracts.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import type {
  AttendanceEvent,
  AttendanceExpectedRow,
  AttendanceMember,
  AttendanceRow,
} from "@/lib/attendance";
import {
  AttendanceOperatorPanel,
  AttendanceRoster,
} from "@/lib/attendance-operator-panel";
import type { AttendanceOperatorPanelProps } from "@/lib/attendance-operator-panel";
import { COPY } from "@/lib/copy";
import { announce, LiveRegion } from "@/lib/live-region";

const server = setupServer();
const ACTIVE_STARTS_AT = new Date(Date.now() - 30 * 60_000).toISOString();
const ACTIVE_ENDS_AT = new Date(Date.now() + 90 * 60_000).toISOString();
const ACTIVE_WINDOW_OPENS_AT = new Date(Date.now() - 45 * 60_000).toISOString();
const ACTIVE_WINDOW_CLOSES_AT = new Date(
  Date.now() + 30 * 60_000
).toISOString();

const ACTIVE: AttendanceEvent = {
  event_id: "evt-1",
  program_id: "prog-1",
  program_name: "週六團契",
  name: "週六聚會",
  location: "主堂",
  starts_at: ACTIVE_STARTS_AT,
  ends_at: ACTIVE_ENDS_AT,
  manual_check_in_code: "ATT1234",
  check_in_window_opens_at: ACTIVE_WINDOW_OPENS_AT,
  check_in_window_closes_at: ACTIVE_WINDOW_CLOSES_AT,
  status: "Active",
  availability: "Active",
};

const CANCELLED: AttendanceEvent = {
  ...ACTIVE,
  event_id: "evt-2",
  manual_check_in_code: "ATT9999",
  status: "Cancelled",
};

const CLOSED: AttendanceEvent = {
  ...ACTIVE,
  event_id: "evt-closed",
  starts_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
  ends_at: new Date(Date.now() - 60 * 60_000).toISOString(),
  check_in_window_opens_at: new Date(
    Date.now() - 3 * 60 * 60_000
  ).toISOString(),
  check_in_window_closes_at: new Date(Date.now() - 30 * 60_000).toISOString(),
};

const MEMBER: AttendanceMember = {
  user_id: "U-E2E-MEMBER",
  name: "E2E Member",
  phone: "9123 4567",
  qr_code_string: "E2E-MEMBER-U-E2E-MEMBER",
};

const ADDITION_MEMBER: AttendanceMember = {
  user_id: "U-E2E-ADDITION",
  name: "E2E Addition",
  phone: "9333 4444",
  qr_code_string: "E2E-ADDITION-U-E2E-ADDITION",
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

const CANCELLED_GUEST_ROW: AttendanceRow = {
  ...ROW,
  attendance_id: "att-cancelled-guest",
  event_id: CANCELLED.event_id,
  member_user_id: null,
  guest_name: "取消訪客",
  guest_phone: "9123 4567",
  guest_phone_normalized: "hk:85291234567",
  method: "guest_manual_code",
};

const EXPECTED_NOT_YET: AttendanceExpectedRow = {
  expected_attendance_id: null,
  event_id: ACTIVE.event_id,
  enrollment_id: "enrollment-1",
  member_user_id: "U-E2E-EXPECTED",
  member_name: "陳小明",
  member_phone: "9000 0000",
  source: "event_start",
  state: "Not Yet",
  attendance: null,
  disposition: null,
};

const EXPECTED_MEMBER: AttendanceExpectedRow = {
  ...EXPECTED_NOT_YET,
  member_user_id: MEMBER.user_id,
  member_name: MEMBER.name,
};

function rosterHandler(event: AttendanceEvent, rows: AttendanceRow[]) {
  return http.get(`/api/v1/attendance/events/${event.event_id}/roster`, () =>
    HttpResponse.json({
      requestId: "rid-roster",
      data: { event, attendances: rows },
    })
  );
}

function renderWithLiveRegion(props: AttendanceOperatorPanelProps = {}) {
  render(
    <>
      <LiveRegion />
      <AttendanceOperatorPanel {...props} />
    </>
  );
}

describe(AttendanceOperatorPanel, () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => {
    cleanup();
    announce("");
    window.history.replaceState(null, "", "/");
    server.resetHandlers();
  });

  afterAll(() => server.close());

  test("open roster exposes row check-in and reason actions through Sheets", async () => {
    const onCheckIn = vi.fn<(row: AttendanceExpectedRow) => void>();
    const onExcuse = vi
      .fn<(row: AttendanceExpectedRow, reason: string) => Promise<boolean>>()
      .mockResolvedValue(true);
    const user = userEvent.setup();
    render(
      <AttendanceRoster
        event={ACTIVE}
        rows={[]}
        expectedRows={[EXPECTED_NOT_YET]}
        onCheckIn={onCheckIn}
        onExcuse={onExcuse}
      />
    );

    await user.click(
      screen.getByRole("button", { name: COPY.attendance.checkInMember })
    );
    expect(onCheckIn).toHaveBeenCalledWith(EXPECTED_NOT_YET);

    await user.click(screen.getByRole("button", { name: /標記請假/u }));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("combobox", { name: /請假原因/u })).toBeVisible();
  });

  test("a failed roster refresh keeps the last snapshot explicitly stale and read-only until Retry succeeds", async () => {
    let rosterCalls = 0;
    server.use(
      http.get("/api/v1/attendance/scanner-events", () =>
        HttpResponse.json({
          requestId: "rid-list",
          data: { events: [ACTIVE] },
        })
      ),
      http.get(`/api/v1/attendance/events/${ACTIVE.event_id}/roster`, () => {
        rosterCalls += 1;
        if (rosterCalls === 2) {
          return HttpResponse.json(
            {
              type: "about:blank",
              title: "Unavailable",
              status: 503,
              code: "UNAVAILABLE",
              detail: "暫時無法更新出席名單。",
            },
            { status: 503 }
          );
        }
        return HttpResponse.json({
          requestId: "rid-roster",
          data: { event: ACTIVE, attendances: [ROW] },
        });
      })
    );
    const user = userEvent.setup();
    renderWithLiveRegion();

    await user.click(await screen.findByRole("button", { name: /週六聚會/u }));
    await screen.findAllByText(MEMBER.user_id);
    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(rosterCalls).toBe(2));
    await expect(
      screen.findByText(/未能更新，現正顯示/u)
    ).resolves.toBeVisible();
    expect(
      screen.getByRole("button", { name: COPY.attendance.voidAttendance })
    ).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: COPY.management.retry })
    );
    await waitFor(() => expect(rosterCalls).toBe(3));
    expect(
      screen.getByRole("button", { name: COPY.attendance.voidAttendance })
    ).toBeEnabled();
  });

  test("a roster auth failure marks the retained snapshot stale before recovery", async () => {
    let rosterCalls = 0;
    const onAuthRequired = vi.fn<() => void>();
    server.use(
      http.get("/api/v1/attendance/scanner-events", () =>
        HttpResponse.json({
          requestId: "rid-list",
          data: { events: [ACTIVE] },
        })
      ),
      http.get(`/api/v1/attendance/events/${ACTIVE.event_id}/roster`, () => {
        rosterCalls += 1;
        if (rosterCalls === 2) {
          return HttpResponse.json(
            {
              type: "about:blank",
              title: "Authentication required",
              status: 401,
              code: "AUTH_REQUIRED",
            },
            { status: 401 }
          );
        }
        return HttpResponse.json({
          requestId: "rid-roster",
          data: { event: ACTIVE, attendances: [ROW] },
        });
      })
    );
    const user = userEvent.setup();
    renderWithLiveRegion({ onAuthRequired });

    await user.click(await screen.findByRole("button", { name: /週六聚會/u }));
    await screen.findAllByText(MEMBER.user_id);
    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(rosterCalls).toBe(2));
    expect(onAuthRequired).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: COPY.attendance.voidAttendance })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: COPY.management.retry })
    ).toBeVisible();
  });

  test("a failed deep-linked event read clears the prior event projection and retries into a closed read-only roster", async () => {
    const closedEvent = { ...CLOSED, name: "已結束聚會" };
    let closedRosterCalls = 0;
    server.use(
      http.get("/api/v1/attendance/scanner-events", () =>
        HttpResponse.json({
          requestId: "rid-list",
          data: { events: [ACTIVE, closedEvent] },
        })
      ),
      rosterHandler(ACTIVE, [ROW]),
      http.get(
        `/api/v1/attendance/events/${closedEvent.event_id}/roster`,
        () => {
          closedRosterCalls += 1;
          if (closedRosterCalls === 1) {
            return HttpResponse.json(
              {
                type: "about:blank",
                title: "Unavailable",
                status: 503,
                code: "UNAVAILABLE",
                detail: "暫時無法更新出席名單。",
              },
              { status: 503 }
            );
          }
          return HttpResponse.json({
            requestId: "rid-closed-roster",
            data: { event: closedEvent, attendances: [] },
          });
        }
      )
    );
    const user = userEvent.setup();
    renderWithLiveRegion();

    await user.click(await screen.findByRole("button", { name: /^週六聚會/u }));
    await screen.findAllByText(MEMBER.user_id);
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.chooseEvent })
    );
    await user.click(
      await screen.findByRole("button", { name: /^已結束聚會/u })
    );
    await waitFor(() =>
      expect(screen.queryByText(MEMBER.user_id)).not.toBeInTheDocument()
    );
    expect(
      screen.getByRole("button", { name: COPY.management.retry })
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: COPY.management.retry })
    );
    await expect(
      screen.findByRole("heading", { name: COPY.attendance.rosterTitle })
    ).resolves.toBeVisible();
    expect(closedRosterCalls).toBe(2);
    expect(
      screen.queryByRole("button", {
        name: COPY.attendance.eventCheckInSheetOpen,
      })
    ).not.toBeInTheDocument();
  });

  test("void reason is collected in a Sheet instead of expanding the row", async () => {
    const onVoid = vi
      .fn<(row: AttendanceRow, reason: string) => Promise<boolean>>()
      .mockResolvedValue(true);
    const user = userEvent.setup();
    render(<AttendanceRoster event={ACTIVE} rows={[ROW]} onVoid={onVoid} />);

    await user.click(
      screen.getByRole("button", { name: COPY.attendance.voidAttendance })
    );
    const sheet = screen.getByRole("dialog");
    expect(sheet).toBeVisible();
    await user.type(
      screen.getByRole("textbox", { name: COPY.attendance.voidReason }),
      "輸入錯誤"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.voidConfirm })
    );
    await waitFor(() => expect(onVoid).toHaveBeenCalledWith(ROW, "輸入錯誤"));
  });

  test("assisted check-in announces success and keeps the notice after roster reload", async () => {
    let rosterCalls = 0;
    server.use(
      http.get("/api/v1/attendance/scanner-events", () =>
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
            expected: [
              rosterCalls === 1
                ? EXPECTED_MEMBER
                : { ...EXPECTED_MEMBER, state: "Present", attendance: ROW },
            ],
          },
        });
      }),
      http.get(`/api/v1/attendance/events/${ACTIVE.event_id}/members`, () =>
        HttpResponse.json({
          requestId: "rid-members",
          data: { members: [MEMBER, ADDITION_MEMBER] },
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

    await user.click(await screen.findByRole("button", { name: /週六聚會/u }));
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
    await screen.findByRole("button", {
      name: /E2E Member.*替成員簽到/u,
    });
    await screen.findByRole("button", {
      name: /E2E Addition.*新增並簽到/u,
    });

    await user.click(
      screen.getByRole("button", { name: /E2E Member.*替成員簽到/u })
    );
    expect(
      screen.getByRole("dialog", {
        name: COPY.attendance.assistedCheckInConfirmTitle,
      })
    ).toHaveTextContent(COPY.attendance.assistedCheckInConfirmLead);
    await user.click(
      screen.getByRole("button", {
        name: COPY.attendance.assistedCheckInConfirm,
      })
    );
    // The silent roster reload must NOT overwrite the visible success…
    await waitFor(() => expect(rosterCalls).toBeGreaterThanOrEqual(2));
    // Both the panel output and the sr-only live region carry the notice.
    const successMessage = COPY.attendance.assistedCheckInSuccess(
      MEMBER.name,
      ACTIVE.name ?? ACTIVE.program_name
    );
    const successOutputs = await screen.findAllByText(successMessage);
    expect(successOutputs.length).toBeGreaterThanOrEqual(2);
    // …and the sr-only live region announced it for screen readers.
    const live = document.querySelector('output[role="status"]');
    await waitFor(() => expect(live?.textContent).toBe(successMessage));
  });

  test("cancelled event: chooser suffix, notice, and no check-in controls", async () => {
    server.use(
      http.get("/api/v1/attendance/scanner-events", () =>
        HttpResponse.json({
          requestId: "rid-list",
          data: { events: [ACTIVE, CANCELLED] },
        })
      ),
      rosterHandler(CANCELLED, [CANCELLED_GUEST_ROW]),
      rosterHandler(ACTIVE, [])
    );
    const user = userEvent.setup();
    renderWithLiveRegion();
    expect(document.querySelectorAll('[data-slot="card"]')).toHaveLength(1);

    const [, cancelledButton] = await screen.findAllByRole("button", {
      name: /週六聚會/u,
    });
    await user.click(cancelledButton);
    await screen.findByText(COPY.attendance.eventCancelled);
    expect(
      screen.queryByLabelText(COPY.attendance.memberSearch)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.attendance.camera })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.attendance.voidAttendance })
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: COPY.attendance.correctGuest })
    ).not.toBeInTheDocument();
  });

  test.each([CLOSED, CANCELLED])(
    "direct roster access hides Event QR for closed or cancelled events (%s)",
    async (selectedEvent) => {
      window.history.replaceState(
        null,
        "",
        `/events?event=${selectedEvent.event_id}`
      );
      server.use(
        http.get("/api/v1/attendance/scanner-events", () =>
          HttpResponse.json({
            requestId: "rid-list",
            data: { events: [selectedEvent] },
          })
        ),
        rosterHandler(selectedEvent, [])
      );
      renderWithLiveRegion();

      await expect(
        screen.findByRole("heading", { name: COPY.attendance.rosterTitle })
      ).resolves.toBeVisible();
      expect(
        screen.queryByRole("button", {
          name: COPY.attendance.eventCheckInSheetOpen,
        })
      ).not.toBeInTheDocument();
    }
  );

  test("does not materialize a snapshot as a side effect of roster GET", async () => {
    let materializeCalls = 0;
    server.use(
      http.get("/api/v1/attendance/scanner-events", () =>
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
            attendances: [],
            expected: [],
            guests: [],
            snapshot: null,
            counts: {
              expected: 0,
              present: 0,
              not_yet: 0,
              absent: 0,
              excused: 0,
              guests: 0,
            },
            materialization_required: true,
          },
        })
      ),
      http.post(
        `/api/v1/attendance/events/${ACTIVE.event_id}/materialize`,
        () => {
          materializeCalls += 1;
          return HttpResponse.json({
            requestId: "rid-materialize",
            data: {},
          });
        }
      )
    );
    const user = userEvent.setup();
    renderWithLiveRegion();

    await user.click(await screen.findByRole("button", { name: /週六聚會/u }));
    await expect(
      screen.findByRole("button", {
        name: COPY.attendance.rosterMaterialize,
      })
    ).resolves.toBeVisible();
    expect(materializeCalls).toBe(0);
  });

  test("operator voids an active attendance row with reason", async () => {
    let voided = false;
    server.use(
      http.get("/api/v1/attendance/scanner-events", () =>
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

    await user.click(await screen.findByRole("button", { name: /週六聚會/u }));

    await screen.findAllByText(MEMBER.user_id);
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.voidAttendance })
    );
    await user.type(
      screen.getByLabelText(COPY.attendance.voidReason),
      "輸入錯誤"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.voidConfirm })
    );

    await waitFor(() => {
      expect(voided).toBeTruthy();
      expect(screen.getAllByText(COPY.attendance.voidSuccess)[0]).toBeVisible();
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
      http.get("/api/v1/attendance/scanner-events", () =>
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

    await user.click(await screen.findByRole("button", { name: /週六聚會/u }));
    await screen.findAllByText("舊訪客名");
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
      expect(screen.getAllByText("新訪客名")[0]).toBeVisible();
      expect(screen.getAllByText("9222 3333")[0]).toBeVisible();
    });
  });

  test("operator panel surfaces error tone and recovers when void fails", async () => {
    server.use(
      http.get("/api/v1/attendance/scanner-events", () =>
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

    await user.click(await screen.findByRole("button", { name: /週六聚會/u }));
    await screen.findAllByText(MEMBER.user_id);
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.voidAttendance })
    );
    await user.type(
      screen.getByLabelText(COPY.attendance.voidReason),
      "嘗試作廢"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.voidConfirm })
    );

    const errorOutputs = await screen.findAllByText(COPY.error.forbidden);
    expect(errorOutputs.length).toBeGreaterThanOrEqual(1);
    const visibleOutput = errorOutputs.find(
      (el) => el.dataset.tone === "error"
    );
    expect(visibleOutput).toBeDefined();
    expect(screen.getAllByText(MEMBER.user_id)[0]).toBeVisible();
    expect(
      screen.getByRole("button", { name: COPY.attendance.voidConfirm })
    ).toBeEnabled();
  });

  test("unknown void outcome blocks navigation until the target settles on Retry", async () => {
    let rosterCalls = 0;
    const onMutationBlockChange = vi.fn<(blocked: boolean) => void>();
    const voidedRow: AttendanceRow = {
      ...ROW,
      status: "Voided",
      voided_by: "U-ADMIN",
      voided_at: "2026-08-13T11:40:00.000Z",
      void_reason: "網絡中斷前已提交",
    };
    server.use(
      http.get("/api/v1/attendance/scanner-events", () =>
        HttpResponse.json({
          requestId: "rid-list",
          data: { events: [ACTIVE] },
        })
      ),
      http.get(`/api/v1/attendance/events/${ACTIVE.event_id}/roster`, () => {
        rosterCalls += 1;
        if (rosterCalls === 1) {
          return HttpResponse.json({
            requestId: "rid-roster",
            data: { event: ACTIVE, attendances: [ROW] },
          });
        }
        if (rosterCalls === 2 || rosterCalls === 4) {
          return HttpResponse.json(
            {
              type: "about:blank",
              title: "Unavailable",
              status: 503,
              code: "UNAVAILABLE",
              detail: "暫時無法確認最新簽到狀態。",
            },
            { status: 503 }
          );
        }
        if (rosterCalls === 3) {
          return HttpResponse.json({
            requestId: "rid-mismatch",
            data: { event: ACTIVE, attendances: [ROW] },
          });
        }
        return HttpResponse.json({
          requestId: "rid-reconciled",
          data: { event: ACTIVE, attendances: [voidedRow] },
        });
      }),
      http.post(`/api/v1/attendance/${ROW.attendance_id}/void`, () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Unavailable",
            status: 503,
            code: "UNAVAILABLE",
            detail: "暫時無法確認簽到是否已作廢。",
          },
          { status: 503 }
        )
      )
    );
    const user = userEvent.setup();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    renderWithLiveRegion({ onMutationBlockChange });

    await user.click(await screen.findByRole("button", { name: /週六聚會/u }));
    await screen.findAllByText(MEMBER.user_id);
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.voidAttendance })
    );
    await user.type(
      screen.getByLabelText(COPY.attendance.voidReason),
      "網絡中斷前已提交"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.voidConfirm })
    );

    await screen.findAllByText(COPY.attendance.transportAmbiguous);
    expect(onMutationBlockChange).toHaveBeenCalledWith(true);
    expect(
      screen.getByRole("button", { name: COPY.attendance.voidAttendance })
    ).toBeDisabled();

    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(rosterCalls).toBe(3));
    expect(
      screen.getByRole("button", { name: COPY.attendance.voidAttendance })
    ).toBeDisabled();
    expect(onMutationBlockChange).toHaveBeenLastCalledWith(true);

    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(rosterCalls).toBe(4));
    expect(
      screen.getByRole("button", { name: COPY.attendance.voidAttendance })
    ).toBeDisabled();
    expect(onMutationBlockChange).toHaveBeenLastCalledWith(true);

    const outsideLink = document.createElement("a");
    outsideLink.href = "/home";
    outsideLink.textContent = "Home";
    document.body.append(outsideLink);
    const navigation = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    outsideLink.dispatchEvent(navigation);
    expect(navigation.defaultPrevented).toBe(true);
    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);
    outsideLink.remove();

    await user.click(
      screen.getByRole("button", { name: COPY.management.retry })
    );
    await screen.findAllByText(COPY.programs.workspaceReconciled);
    expect(onMutationBlockChange).toHaveBeenLastCalledWith(false);
    expect(
      screen.queryByRole("button", { name: COPY.attendance.voidAttendance })
    ).not.toBeInTheDocument();
  });

  test("operator panel calls onAuthRequired when loading scanner events returns AUTH_REQUIRED", async () => {
    const onAuthRequired = vi.fn<() => void>();
    server.use(
      http.get("/api/v1/attendance/scanner-events", () =>
        HttpResponse.json(
          {
            type: "https://efcc.example/problems/auth-required",
            title: "Auth Required",
            status: 401,
            code: "AUTH_REQUIRED",
            requestId: "rid-auth",
          },
          { status: 401 }
        )
      )
    );
    renderWithLiveRegion({ onAuthRequired });
    await waitFor(() => expect(onAuthRequired).toHaveBeenCalledOnce());
  });
});
