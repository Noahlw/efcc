import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import type { AttendanceEvent } from "@/lib/attendance";
import { COPY } from "@/lib/copy";
import { SelfCheckInPanel } from "@/lib/self-check-in-panel";

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

function resolveHandler(events: AttendanceEvent[]) {
  return http.get("/api/v1/attendance/resolve", () =>
    HttpResponse.json({ requestId: "rid-resolve", data: { events } })
  );
}

describe(SelfCheckInPanel, () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => {
    cleanup();
    server.resetHandlers();
  });

  afterAll(() => server.close());

  test("renders a Self surface without guest or Assisted controls", async () => {
    server.use(resolveHandler([EVENT]));
    const user = userEvent.setup();
    render(<SelfCheckInPanel title={COPY.sections.scanner} />);

    expect(screen.queryByLabelText(COPY.attendance.guestName)).toBeNull();
    expect(screen.queryByText(COPY.attendance.assistedOpen)).toBeNull();
    await user.type(
      screen.getByLabelText(COPY.attendance.inputLabel),
      "ATT1234"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.resolve })
    );
    const submitButton = await screen.findByRole("button", {
      name: COPY.attendance.memberSubmit,
    });
    expect(submitButton).toHaveFocus();
  });

  test("shows location in the concise multi-event picker", async () => {
    server.use(
      resolveHandler([
        EVENT,
        {
          ...EVENT,
          event_id: "evt-2",
          name: "週日崇拜",
          location: "副堂",
          starts_at: "2026-08-14T11:30:00.000Z",
        },
      ])
    );
    const user = userEvent.setup();
    render(<SelfCheckInPanel />);
    await user.type(
      screen.getByLabelText(COPY.attendance.inputLabel),
      "ATT1234"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.resolve })
    );

    const pickerHeading = await screen.findByRole("heading", {
      name: COPY.attendance.chooseEvent,
    });
    expect(pickerHeading).toHaveFocus();
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(2);
    await user.click(screen.getAllByRole("button", { pressed: false })[0]);
    await expect(
      screen.findByRole("button", { name: COPY.attendance.memberSubmit })
    ).resolves.toHaveFocus();
  });

  test("explains that no eligible Event is available without leaving Scanner", async () => {
    server.use(resolveHandler([]));
    const user = userEvent.setup();
    render(<SelfCheckInPanel />);
    await user.type(
      screen.getByLabelText(COPY.attendance.inputLabel),
      "ATT1234"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.resolve })
    );

    await expect(
      screen.findByText(COPY.attendance.noEvents)
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByLabelText(COPY.attendance.inputLabel)
    ).toBeInTheDocument();
  });

  test("maps a QR no-event response to a recoverable info state", async () => {
    server.use(
      http.get("/api/v1/attendance/resolve", () =>
        HttpResponse.json(
          {
            status: 404,
            code: "CHECK_IN_NOT_FOUND",
            detail: "找不到可用的簽到聚會。",
          },
          { status: 404 }
        )
      )
    );
    const user = userEvent.setup();
    render(<SelfCheckInPanel />);
    await user.type(
      screen.getByLabelText(COPY.attendance.inputLabel),
      "https://efcc.example/guest-check-in?program_token=EMPTY"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.resolve })
    );

    const output = await screen.findByText(COPY.attendance.noEvents);
    expect(output.closest("output")).toHaveAttribute("data-tone", "info");
    expect(screen.getByLabelText(COPY.attendance.inputLabel)).toHaveValue(
      "EMPTY"
    );
  });

  test("announces resolution and blocks a second resolve while submitting", async () => {
    const pendingResolve = Promise.withResolvers<Response>();
    const pendingSubmit = Promise.withResolvers<Response>();
    server.use(
      http.get("/api/v1/attendance/resolve", () => pendingResolve.promise),
      http.post("/api/v1/attendance/self", () => pendingSubmit.promise)
    );
    const user = userEvent.setup();
    render(<SelfCheckInPanel />);
    await user.type(
      screen.getByLabelText(COPY.attendance.inputLabel),
      "ATT1234"
    );
    const resolveButton = screen.getByRole("button", {
      name: COPY.attendance.resolve,
    });
    await user.click(resolveButton);
    expect(resolveButton).toBeDisabled();
    expect(
      screen.getByText(COPY.attendance.resolving, { selector: "output" })
    ).toBeInTheDocument();

    pendingResolve.resolve(
      HttpResponse.json({ requestId: "rid-resolve", data: { events: [EVENT] } })
    );
    const submitButton = await screen.findByRole("button", {
      name: COPY.attendance.memberSubmit,
    });
    await user.click(submitButton);
    expect(
      screen.getByRole("button", { name: COPY.attendance.resolve })
    ).toBeDisabled();
    pendingSubmit.resolve(
      HttpResponse.json({
        requestId: "rid-self",
        data: { outcome: "success", attendance_id: "attendance-1" },
      })
    );
    await expect(
      screen.findByText(COPY.attendance.success)
    ).resolves.toBeInTheDocument();
  });

  test("submits Self attendance only after the server resolves an Event", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      resolveHandler([EVENT]),
      http.post("/api/v1/attendance/self", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          requestId: "rid-self",
          data: { outcome: "success", attendance_id: "attendance-1" },
        });
      })
    );
    const user = userEvent.setup();
    render(<SelfCheckInPanel />);
    await user.type(
      screen.getByLabelText(COPY.attendance.inputLabel),
      "ATT1234"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.resolve })
    );
    await user.click(
      await screen.findByRole("button", { name: COPY.attendance.memberSubmit })
    );

    await expect(
      screen.findByText(COPY.attendance.success)
    ).resolves.toBeInTheDocument();
    expect(body).toMatchObject({
      event_id: EVENT.event_id,
      method: "self_manual_code",
      entry: "ATT1234",
    });
  });

  test("preserves the selected task and offers retry after ambiguous transport", async () => {
    let attempts = 0;
    server.use(
      resolveHandler([EVENT]),
      http.post("/api/v1/attendance/self", () => {
        attempts += 1;
        return attempts === 1
          ? HttpResponse.error()
          : HttpResponse.json({
              requestId: "rid-retry",
              data: { outcome: "success", attendance_id: "attendance-1" },
            });
      })
    );
    const user = userEvent.setup();
    render(<SelfCheckInPanel />);
    const input = screen.getByLabelText(COPY.attendance.inputLabel);
    await user.type(input, "ATT1234");
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.resolve })
    );
    await user.click(
      await screen.findByRole("button", { name: COPY.attendance.memberSubmit })
    );

    const retry = await screen.findByRole("button", {
      name: COPY.attendance.retry,
    });
    expect(retry).toHaveFocus();
    const ambiguous = screen.getByText(COPY.attendance.transportAmbiguous);
    expect(ambiguous.closest("output")).toHaveAttribute("data-tone", "error");
    expect(input).toHaveValue("ATT1234");

    await user.click(retry);
    await expect(
      screen.findByText(COPY.attendance.success)
    ).resolves.toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  test("keeps Program QR provenance through resolution and Self submission", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      resolveHandler([EVENT]),
      http.post("/api/v1/attendance/self", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          requestId: "rid-qr-self",
          data: { outcome: "success", attendance_id: "attendance-qr" },
        });
      })
    );
    const user = userEvent.setup();
    render(<SelfCheckInPanel />);
    await user.type(
      screen.getByLabelText(COPY.attendance.inputLabel),
      "https://efcc.example/guest-check-in?program_token=PROGRAM-QR"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.resolve })
    );
    await user.click(
      await screen.findByRole("button", { name: COPY.attendance.memberSubmit })
    );

    await expect(
      screen.findByText(COPY.attendance.success)
    ).resolves.toBeInTheDocument();
    expect(body).toMatchObject({
      event_id: EVENT.event_id,
      method: "self_qr_scan",
      program_token: "PROGRAM-QR",
    });
  });

  test("focuses the manual fallback when camera is unavailable", async () => {
    const originalDetector = (window as Window & { BarcodeDetector?: unknown })
      .BarcodeDetector;
    const originalMediaDevices = navigator.mediaDevices;
    Reflect.deleteProperty(window, "BarcodeDetector");
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
    const user = userEvent.setup();
    render(<SelfCheckInPanel />);
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.camera })
    );

    const input = screen.getByLabelText(COPY.attendance.inputLabel);
    expect(input).toHaveFocus();
    expect(
      screen.getByText(COPY.attendance.cameraUnavailable)
    ).toBeInTheDocument();

    if (originalDetector === undefined) {
      Reflect.deleteProperty(window, "BarcodeDetector");
    } else {
      Object.defineProperty(window, "BarcodeDetector", {
        configurable: true,
        value: originalDetector,
      });
    }
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: originalMediaDevices,
    });
  });

  test("renders duplicate as an accessible neutral notice and preserves entry context", async () => {
    server.use(
      resolveHandler([EVENT]),
      http.post("/api/v1/attendance/self", () =>
        HttpResponse.json({
          requestId: "rid-duplicate",
          data: { outcome: "duplicate", attendance_id: "attendance-1" },
        })
      )
    );
    const user = userEvent.setup();
    render(<SelfCheckInPanel />);
    const input = screen.getByLabelText(COPY.attendance.inputLabel);
    await user.type(input, "ATT1234");
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.resolve })
    );
    await user.click(
      await screen.findByRole("button", { name: COPY.attendance.memberSubmit })
    );

    const output = await screen.findByText(COPY.attendance.duplicate);
    expect(output.closest("output")).toHaveAttribute("data-tone", "info");
    expect(input).toHaveValue("ATT1234");
  });

  test("surfaces denied and offline resolution states through the live output", async () => {
    server.use(
      resolveHandler([EVENT]),
      http.post("/api/v1/attendance/self", () =>
        HttpResponse.json(
          {
            type: "about:blank",
            status: 403,
            code: "ENROLLMENT_REQUIRED",
            detail: "denied",
          },
          { status: 403 }
        )
      )
    );
    const user = userEvent.setup();
    render(<SelfCheckInPanel />);
    const input = screen.getByLabelText(COPY.attendance.inputLabel);
    await user.type(input, "ATT1234");
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.resolve })
    );
    await user.click(
      await screen.findByRole("button", { name: COPY.attendance.memberSubmit })
    );
    await expect(
      screen.findByText(COPY.attendance.enrollmentRequired)
    ).resolves.toBeInTheDocument();
    expect(input).toHaveValue("ATT1234");

    cleanup();
    server.resetHandlers();
    server.use(
      http.get("/api/v1/attendance/resolve", () => HttpResponse.error())
    );
    render(<SelfCheckInPanel />);
    await user.type(screen.getByLabelText(COPY.attendance.inputLabel), "RETRY");
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.resolve })
    );
    const offline = await screen.findByText(COPY.error.networkError);
    expect(offline.closest("output")).toHaveAttribute("data-tone", "error");
    expect(screen.getByLabelText(COPY.attendance.inputLabel)).toHaveValue(
      "RETRY"
    );
  });
});
