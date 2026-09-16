// ATT-01/02 (#213/#214) — component tests for the guest/member check-in
// panel. MSW intercepts the Worker RPCs; the form's native constraint
// validation and the error/duplicate feedback paths are asserted against
// the real DOM, matching the E2E suite's observable contracts.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
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
  AttendanceResolveLatest,
} from "@/lib/attendance";
import { AttendancePanel } from "@/lib/attendance-panel";
import { COPY } from "@/lib/copy";
import { clearGuestCredential, readGuestCredential } from "@/lib/guest-context";

const server = setupServer();

const EVENT: AttendanceEvent = {
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

/** Fill the single guest form without triggering its one submit action. */
async function fillGuestForm(user: UserEvent, code = "ATT1234") {
  await user.type(screen.getByLabelText(COPY.attendance.guestCode), code);
  await user.type(screen.getByLabelText(COPY.attendance.guestName), "E2E訪客");
  await user.type(
    screen.getByLabelText(
      new RegExp(`^${COPY.attendance.guestPhoneLabel}`, "u")
    ),
    "91234567"
  );
}

// The phone label includes the hint span, so match its label prefix.
function phoneField(): HTMLInputElement {
  return screen.getByLabelText(
    new RegExp(`^${COPY.attendance.guestPhoneLabel}`, "u")
  );
}

// Guest check-in deliberately has no camera affordance or decoder setup.

describe(AttendancePanel, () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

  afterEach(() => {
    cleanup();
    server.resetHandlers();
    vi.restoreAllMocks();
  });

  afterAll(() => server.close());

  describe("AttendancePanel guest flow", () => {
    test("renders one light form with the three guest fields", () => {
      render(<AttendancePanel />);

      expect(screen.getByLabelText(COPY.attendance.guestCode)).toBeVisible();
      expect(screen.getByLabelText(COPY.attendance.guestName)).toHaveAttribute(
        "maxLength",
        "80"
      );
      expect(phoneField()).toHaveAttribute("inputMode", "tel");
      expect(
        screen.getByRole("button", { name: COPY.attendance.guestSubmit })
      ).toBeVisible();
      expect(
        screen.getByRole("link", { name: COPY.attendance.guestBack })
      ).toHaveAttribute("href", "/");
    });

    test("shows busy copy while resolving the guest entry", async () => {
      let releaseResolve!: (response: Response) => void;
      const pendingResolve = new Promise<Response>((resolve) => {
        releaseResolve = resolve;
      });
      server.use(
        http.get("/api/v1/attendance/resolve", () => pendingResolve),
        http.post("/api/v1/attendance/guest", () =>
          HttpResponse.json({
            requestId: "rid-busy-guest",
            data: { outcome: "success", attendance_id: "a-busy" },
          })
        )
      );
      const user = userEvent.setup();
      render(<AttendancePanel />);
      await fillGuestForm(user);
      await user.click(
        screen.getByRole("button", { name: COPY.attendance.guestSubmit })
      );

      const submitButton = await screen.findByRole("button", {
        name: COPY.attendance.guestSubmitting,
      });
      expect(submitButton).toBeDisabled();
      expect(submitButton).toHaveAttribute("aria-busy", "true");

      releaseResolve(
        HttpResponse.json({
          requestId: "rid-busy",
          data: { events: [EVENT] },
        })
      );
      const resultHeading = await screen.findByRole("heading", {
        name: COPY.attendance.guestResultTitle,
      });
      expect(resultHeading).toBeVisible();
      expect(resultHeading).toHaveFocus();
    });

    test("missing guest fields are announced and focus the first missing field", async () => {
      let resolveCalls = 0;
      let guestPosts = 0;
      server.use(
        http.get("/api/v1/attendance/resolve", () => {
          resolveCalls += 1;
          return HttpResponse.json({
            requestId: "rid-1",
            data: { events: [EVENT] },
          });
        }),
        http.post("/api/v1/attendance/guest", () => {
          guestPosts += 1;
          return HttpResponse.json({
            requestId: "rid-2",
            data: { outcome: "success", attendance_id: "a1" },
          });
        })
      );
      const user = userEvent.setup();
      render(<AttendancePanel />);

      await user.click(
        screen.getByRole("button", { name: COPY.attendance.guestSubmit })
      );

      await expect(
        screen.findByText(COPY.attendance.guestValidation)
      ).resolves.toBeVisible();
      expect(screen.getByLabelText(COPY.attendance.guestCode)).toHaveFocus();
      expect(resolveCalls).toBe(0);
      expect(guestPosts).toBe(0);
    });

    test("missing guest name focuses name field and missing phone focuses phone field", async () => {
      const user = userEvent.setup();
      render(<AttendancePanel />);

      const codeInput = screen.getByLabelText(COPY.attendance.guestCode);
      const nameInput = screen.getByLabelText(
        new RegExp(`^${COPY.attendance.guestName}`, "u")
      );
      const submitButton = screen.getByRole("button", {
        name: COPY.attendance.guestSubmit,
      });

      // Fill code only -> submit should focus name
      await user.type(codeInput, "ATT1234");
      await user.click(submitButton);
      expect(nameInput).toHaveFocus();

      // Fill name as well, leave phone empty -> submit should focus phone
      await user.type(nameInput, "陳小明");
      await user.click(submitButton);
      expect(phoneField()).toHaveFocus();
    });

    test("one open event chains resolve to a real completion card", async () => {
      server.use(
        http.get("/api/v1/attendance/resolve", () =>
          HttpResponse.json({
            requestId: "rid-1",
            data: { events: [EVENT] },
          })
        ),
        http.post("/api/v1/attendance/guest", () =>
          HttpResponse.json({
            requestId: "rid-2",
            data: { outcome: "success", attendance_id: "a1" },
          })
        )
      );
      const user = userEvent.setup();
      render(<AttendancePanel />);
      await fillGuestForm(user);
      await user.click(
        screen.getByRole("button", { name: COPY.attendance.guestSubmit })
      );

      await expect(
        screen.findByRole("heading", {
          name: COPY.attendance.guestResultTitle,
        })
      ).resolves.toBeVisible();
      expect(
        screen.getByText(COPY.attendance.guestResultLead("晚上"))
      ).toBeVisible();
      expect(
        screen.getByRole("link", { name: COPY.attendance.guestDone })
      ).toHaveAttribute("href", "/");
    });

    test("guest closed-event resolve shows an explicit window outcome", async () => {
      const latest: AttendanceResolveLatest = {
        status: "Active",
        availability: "Active",
        starts_at: "2026-08-13T11:30:00.000Z",
        check_in_window_opens_at: "2026-08-13T10:30:00.000Z",
        program_id: "prog-1",
        program_name: "週六團契",
      };
      server.use(
        http.get("/api/v1/attendance/resolve", () =>
          HttpResponse.json({
            requestId: "rid-closed-guest",
            data: { events: [], latest, enrolled: false },
          })
        )
      );
      const user = userEvent.setup();
      render(<AttendancePanel />);
      await fillGuestForm(user, "ATTCLOSED");
      await user.click(
        screen.getByRole("button", { name: COPY.attendance.guestSubmit })
      );

      const outcomeHeading = await screen.findByRole("heading", {
        name: COPY.attendance.outcomeWindowTitle,
      });
      expect(outcomeHeading).toBeVisible();
      expect(outcomeHeading).toHaveFocus();
      expect(screen.getByText(COPY.attendance.outcomeHeader)).toBeVisible();
      expect(
        screen.queryByLabelText(COPY.attendance.guestCode)
      ).not.toBeInTheDocument();
    });

    test("guest cancelled-event resolve shows the cancellation outcome", async () => {
      const latest: AttendanceResolveLatest = {
        status: "Cancelled",
        availability: "Active",
        starts_at: "2026-08-13T11:30:00.000Z",
        check_in_window_opens_at: "2026-08-13T10:30:00.000Z",
        program_id: "prog-1",
        program_name: "週六團契",
      };
      server.use(
        http.get("/api/v1/attendance/resolve", () =>
          HttpResponse.json({
            requestId: "rid-cancelled-guest",
            data: { events: [], latest, enrolled: false },
          })
        )
      );
      const user = userEvent.setup();
      render(<AttendancePanel />);
      await fillGuestForm(user, "ATTCANCEL");
      await user.click(
        screen.getByRole("button", { name: COPY.attendance.guestSubmit })
      );

      const cancelledHeading = await screen.findByRole("heading", {
        name: COPY.attendance.outcomeCancelledTitle,
      });
      expect(cancelledHeading).toBeVisible();
      expect(cancelledHeading).toHaveFocus();
      expect(
        screen.getByText(COPY.attendance.outcomeCancelledBody)
      ).toBeVisible();
      expect(
        screen.queryByLabelText(COPY.attendance.guestCode)
      ).not.toBeInTheDocument();
    });

    test("invalid phone stays inline, focuses the phone field, and does not complete", async () => {
      server.use(
        http.get("/api/v1/attendance/resolve", () =>
          HttpResponse.json({
            requestId: "rid-1",
            data: { events: [EVENT] },
          })
        ),
        http.post("/api/v1/attendance/guest", () =>
          HttpResponse.json(
            {
              type: "about:blank",
              title: "Validation failed",
              status: 422,
              code: "VALIDATION",
              detail: "請輸入有效電話號碼。",
            },
            { status: 422 }
          )
        )
      );
      const user = userEvent.setup();
      render(<AttendancePanel />);
      await user.type(
        screen.getByLabelText(COPY.attendance.guestCode),
        "ATT1234"
      );
      await user.type(
        screen.getByLabelText(COPY.attendance.guestName),
        "E2E訪客"
      );
      await user.type(phoneField(), "abc");
      await user.click(
        screen.getByRole("button", { name: COPY.attendance.guestSubmit })
      );

      const output = await screen.findByText("請輸入有效電話號碼。");
      expect(output.closest("output")).toHaveAttribute("data-tone", "error");
      expect(phoneField()).toHaveFocus();
    });

    test("offline guest submit uses B-02 recovery copy without a result", async () => {
      server.use(
        http.get("/api/v1/attendance/resolve", () =>
          HttpResponse.json({
            requestId: "rid-1",
            data: { events: [EVENT] },
          })
        ),
        http.post("/api/v1/attendance/guest", () => HttpResponse.error())
      );
      const user = userEvent.setup();
      render(<AttendancePanel />);
      await fillGuestForm(user);
      await user.click(
        screen.getByRole("button", { name: COPY.attendance.guestSubmit })
      );

      const output = await screen.findByText(COPY.attendance.offlineResolve);
      expect(output.closest("output")).toHaveAttribute("data-tone", "error");
      expect(
        screen.queryByRole("heading", {
          name: COPY.attendance.guestResultTitle,
        })
      ).not.toBeInTheDocument();
    });

    test("ambiguous guest submit reconciles before showing a committed result", async () => {
      let guestPosts = 0;
      let submittedKey: string | null = null;
      let reconciledKey: string | null = null;
      server.use(
        http.get("/api/v1/attendance/resolve", () =>
          HttpResponse.json({
            requestId: "rid-reconcile-resolve",
            data: { events: [EVENT] },
          })
        ),
        http.post("/api/v1/attendance/guest", ({ request }) => {
          guestPosts += 1;
          submittedKey = request.headers.get("Idempotency-Key");
          return HttpResponse.error();
        }),
        http.post("/api/v1/attendance/guest/reconcile", ({ request }) => {
          reconciledKey = request.headers.get("Idempotency-Key");
          return HttpResponse.json({
            requestId: "rid-reconcile",
            data: { outcome: "found" },
          });
        })
      );
      const user = userEvent.setup();
      render(<AttendancePanel />);
      await fillGuestForm(user);
      await user.click(
        screen.getByRole("button", { name: COPY.attendance.guestSubmit })
      );

      await expect(
        screen.findByText(COPY.attendance.transportAmbiguous)
      ).resolves.toBeVisible();
      expect({
        reconcileDisabled: screen
          .getByRole("button", { name: COPY.attendance.guestReconcile })
          .hasAttribute("disabled"),
        nameDisabled: screen
          .getByLabelText(COPY.attendance.guestName)
          .hasAttribute("disabled"),
        guestPosts,
      }).toStrictEqual({
        reconcileDisabled: false,
        nameDisabled: true,
        guestPosts: 1,
      });

      await user.click(
        screen.getByRole("button", { name: COPY.attendance.guestReconcile })
      );
      await expect(
        screen.findByRole("heading", {
          name: COPY.attendance.guestResultTitle,
        })
      ).resolves.toBeVisible();
      expect([submittedKey, reconciledKey]).toStrictEqual([
        expect.any(String),
        submittedKey,
      ]);
    });

    test("locks an unknown guest attempt until reconciliation makes an explicit decision", async () => {
      const event2: AttendanceEvent = {
        ...EVENT,
        event_id: "evt-unknown-2",
        name: "主日聚會",
        manual_check_in_code: "ATT5678",
      };
      let guestPosts = 0;
      const submittedKeys: string[] = [];
      server.use(
        http.get("/api/v1/attendance/resolve", () =>
          HttpResponse.json({
            requestId: "rid-unknown-resolve",
            data: { events: [EVENT, event2] },
          })
        ),
        http.post("/api/v1/attendance/guest", ({ request }) => {
          guestPosts += 1;
          submittedKeys.push(request.headers.get("Idempotency-Key") ?? "");
          return guestPosts === 1
            ? HttpResponse.error()
            : HttpResponse.json({
                requestId: "rid-unknown-retry",
                data: { outcome: "success", attendance_id: "a-retry" },
              });
        }),
        http.post("/api/v1/attendance/guest/reconcile", () =>
          HttpResponse.json({
            requestId: "rid-unknown-not-found",
            data: { outcome: "not_found" },
          })
        )
      );
      clearGuestCredential();
      const user = userEvent.setup();
      render(<AttendancePanel />);
      await fillGuestForm(user, "PROG-TOKEN");
      await user.click(
        screen.getByRole("button", { name: COPY.attendance.guestSubmit })
      );
      await user.click(await screen.findByRole("radio", { name: /主日聚會/u }));
      await user.click(
        screen.getByRole("button", { name: COPY.attendance.continue })
      );

      await expect(
        screen.findByText(COPY.attendance.transportAmbiguous)
      ).resolves.toBeVisible();
      expect(screen.getByRole("radio", { name: /主日聚會/u })).toBeDisabled();
      expect(
        screen.getByRole("button", { name: COPY.attendance.continue })
      ).toBeDisabled();

      await user.click(
        screen.getByRole("link", { name: COPY.attendance.guestBack })
      );
      await user.click(
        screen.getByRole("link", { name: COPY.attendance.loginForMember })
      );
      expect(
        screen.getByRole("button", { name: COPY.attendance.guestReconcile })
      ).toBeVisible();
      expect(readGuestCredential()).toBeNull();

      await user.click(
        screen.getByRole("button", { name: COPY.attendance.guestReconcile })
      );
      await expect(
        screen.findByText(COPY.attendance.guestReconcileNotFound)
      ).resolves.toBeVisible();
      expect(screen.getByRole("radio", { name: /主日聚會/u })).toBeEnabled();

      await user.click(
        screen.getByRole("button", { name: COPY.attendance.continue })
      );
      await expect(
        screen.findByRole("heading", { name: COPY.attendance.guestResultTitle })
      ).resolves.toBeVisible();
      expect(guestPosts).toBe(2);
      expect(submittedKeys[0]).not.toBe(submittedKeys[1]);
      clearGuestCredential();
    });

    test("duplicate is a neutral result without an attendance identifier", async () => {
      server.use(
        http.get("/api/v1/attendance/resolve", () =>
          HttpResponse.json({
            requestId: "rid-1",
            data: { events: [EVENT] },
          })
        ),
        http.post("/api/v1/attendance/guest", () =>
          HttpResponse.json({
            requestId: "rid-2",
            data: { outcome: "duplicate", attendance_id: "private-id" },
          })
        )
      );
      const user = userEvent.setup();
      render(<AttendancePanel />);
      await fillGuestForm(user);
      await user.click(
        screen.getByRole("button", { name: COPY.attendance.guestSubmit })
      );

      await expect(
        screen.findByText(COPY.attendance.guestDuplicate)
      ).resolves.toBeVisible();
      expect(screen.getByTestId("guest-result-icon-duplicate")).toBeVisible();
      expect(screen.queryByText("private-id")).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    test("member login handoff preserves the typed guest code", async () => {
      clearGuestCredential();
      const user = userEvent.setup();
      render(<AttendancePanel />);
      await user.type(
        screen.getByLabelText(COPY.attendance.guestCode),
        "ATT1234"
      );
      await user.click(
        screen.getByRole("link", { name: COPY.attendance.loginForMember })
      );
      expect(readGuestCredential()).toStrictEqual({
        kind: "manual_code",
        value: "ATT1234",
      });
      clearGuestCredential();
    });

    test("multiple open events require selection before the guest write", async () => {
      const event2: AttendanceEvent = {
        ...EVENT,
        event_id: "evt-2",
        name: "主日聚會",
        manual_check_in_code: "ATT5678",
      };
      let capturedEventId: string | undefined;
      server.use(
        http.get("/api/v1/attendance/resolve", () =>
          HttpResponse.json({
            requestId: "rid-multi",
            data: { events: [EVENT, event2] },
          })
        ),
        http.post("/api/v1/attendance/guest", async ({ request }) => {
          capturedEventId = ((await request.json()) as { event_id: string })
            .event_id;
          return HttpResponse.json({
            requestId: "rid-guest",
            data: { outcome: "success", attendance_id: "a1" },
          });
        })
      );
      const user = userEvent.setup();
      render(<AttendancePanel />);
      await fillGuestForm(user, "PROG-TOKEN");
      await user.click(
        screen.getByRole("button", { name: COPY.attendance.guestSubmit })
      );

      const pickerLegend = await screen.findByText(COPY.attendance.chooseEvent);
      await waitFor(() => expect(pickerLegend).toHaveFocus());
      expect(screen.getByLabelText(COPY.attendance.guestName)).toHaveValue(
        "E2E訪客"
      );
      await user.click(screen.getByRole("radio", { name: /主日聚會/u }));
      await user.click(
        screen.getByRole("button", { name: COPY.attendance.continue })
      );

      await expect(
        screen.findByRole("heading", {
          name: COPY.attendance.guestResultTitle,
        })
      ).resolves.toBeVisible();
      expect(capturedEventId).toBe("evt-2");
    });

    test("deep-linked multi-event selection submits without a second confirm", async () => {
      const event2: AttendanceEvent = {
        ...EVENT,
        event_id: "evt-deep-2",
        name: "主日聚會",
        manual_check_in_code: "ATT-DEEP-2",
      };
      let capturedEventId: string | undefined;
      const previousUrl = new URL(window.location.href);
      window.history.replaceState(
        null,
        "",
        "/guest-check-in?program_token=PROG-DEEP"
      );
      server.use(
        http.get("/api/v1/attendance/resolve", () =>
          HttpResponse.json({
            requestId: "rid-deep",
            data: { events: [EVENT, event2] },
          })
        ),
        http.post("/api/v1/attendance/guest", async ({ request }) => {
          capturedEventId = ((await request.json()) as { event_id: string })
            .event_id;
          return HttpResponse.json({
            requestId: "rid-deep-guest",
            data: { outcome: "success", attendance_id: "a1" },
          });
        })
      );
      const user = userEvent.setup();
      try {
        render(<AttendancePanel />);
        const pickerLegend = await screen.findByText(
          COPY.attendance.chooseEvent
        );
        await expect(pickerLegend).toBeVisible();
        await user.type(
          screen.getByLabelText(COPY.attendance.guestName),
          "深鏈訪客"
        );
        await user.type(phoneField(), "91234567");
        await user.click(screen.getByRole("radio", { name: /主日聚會/u }));
        await user.click(
          screen.getByRole("button", { name: COPY.attendance.continue })
        );
        await expect(
          screen.findByRole("heading", {
            name: COPY.attendance.guestResultTitle,
          })
        ).resolves.toBeVisible();
        expect(capturedEventId).toBe("evt-deep-2");
      } finally {
        window.history.replaceState(
          null,
          "",
          `${previousUrl.pathname}${previousUrl.search}${previousUrl.hash}`
        );
      }
    });

    test("zero open events show an actionable error without a guest write", async () => {
      let guestPosts = 0;
      server.use(
        http.get("/api/v1/attendance/resolve", () =>
          HttpResponse.json({
            requestId: "rid-empty",
            data: { events: [] },
          })
        ),
        http.post("/api/v1/attendance/guest", () => {
          guestPosts += 1;
          return HttpResponse.json({
            requestId: "rid-guest",
            data: { outcome: "success", attendance_id: "a1" },
          });
        })
      );
      const user = userEvent.setup();
      render(<AttendancePanel />);
      await fillGuestForm(user, "PROG-EMPTY");
      await user.click(
        screen.getByRole("button", { name: COPY.attendance.guestSubmit })
      );

      const output = await screen.findByText(COPY.attendance.invalidEntryCode);
      expect(output.closest("output")).toHaveAttribute("data-tone", "error");
      expect(guestPosts).toBe(0);
    });

    test("offline resolve uses the actionable retry copy without a guest write", async () => {
      let guestPosts = 0;
      server.use(
        http.get("/api/v1/attendance/resolve", () => HttpResponse.error()),
        http.post("/api/v1/attendance/guest", () => {
          guestPosts += 1;
          return HttpResponse.json({
            requestId: "rid-guest",
            data: { outcome: "success", attendance_id: "a1" },
          });
        })
      );
      const user = userEvent.setup();
      render(<AttendancePanel />);
      await fillGuestForm(user, "PROG-OFFLINE");
      await user.click(
        screen.getByRole("button", { name: COPY.attendance.guestSubmit })
      );

      const output = await screen.findByText(COPY.attendance.offlineResolve);
      expect(output.closest("output")).toHaveAttribute("data-tone", "error");
      expect(guestPosts).toBe(0);
    });
  });

  describe("AttendancePanel camera boundary", () => {
    test("guest check-in renders no camera or permission trigger", () => {
      const getUserMedia = vi.fn<() => Promise<MediaStream>>();
      const originalMediaDevices = navigator.mediaDevices;
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: { getUserMedia },
      });
      try {
        render(<AttendancePanel />);
        expect(
          screen.queryByRole("button", {
            name: COPY.attendance.startScan,
          })
        ).not.toBeInTheDocument();
        expect(getUserMedia).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(navigator, "mediaDevices", {
          configurable: true,
          value: originalMediaDevices,
        });
      }
    });
  });
});
