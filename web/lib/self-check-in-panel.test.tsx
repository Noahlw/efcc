import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import type { AttendanceEvent, AttendanceResolveLatest } from "@/lib/attendance";
import { COPY } from "@/lib/copy";
import { SelfCheckInPanel } from "@/lib/self-check-in-panel";

const server = setupServer();

const EVENT: AttendanceEvent = {
  event_id: "evt-1",
  program_id: "prog-1",
  program_name: "週六團契",
  name: "週六聚會",
  location: "主堂",
  starts_at: "2026-08-13T11:00:00.000Z",
  ends_at: "2026-08-13T13:00:00.000Z",
  manual_check_in_code: "123456",
  check_in_window_opens_at: "2026-08-13T10:30:00.000Z",
  check_in_window_closes_at: "2026-08-13T13:30:00.000Z",
  status: "Active",
  availability: "Active",
};

const EVENT_TWO: AttendanceEvent = {
  ...EVENT,
  event_id: "evt-2",
  name: "週日崇拜",
  location: "副堂",
  starts_at: "2026-08-14T11:00:00.000Z",
  ends_at: "2026-08-14T13:00:00.000Z",
};

function FakeBarcodeDetector() {
  return {
    detect: () => Promise.resolve([]),
  };
}

function installCamera() {
  Object.defineProperty(window, "BarcodeDetector", {
    configurable: true,
    value: FakeBarcodeDetector,
  });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn<() => Promise<MediaStream>>().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
      } as unknown as MediaStream),
    },
  });
}

function resolveHandler(options: {
  events?: AttendanceEvent[];
  latest?: AttendanceResolveLatest | null;
  enrolled?: boolean;
}) {
  const { events = [], latest = null, enrolled = true } = options;
  return http.get("/api/v1/attendance/resolve", () =>
    HttpResponse.json({
      requestId: "rid-resolve",
      data: { events, latest, enrolled },
    })
  );
}

describe(SelfCheckInPanel, () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  beforeEach(() => {
    installCamera();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    server.resetHandlers();
    Reflect.deleteProperty(window, "BarcodeDetector");
    Reflect.deleteProperty(navigator, "mediaDevices");
  });
  afterAll(() => server.close());

  test("renders main scan surface without guest or assisted controls", async () => {
    render(<SelfCheckInPanel title={COPY.attendance.scanTitle} />);

    expect(screen.queryByLabelText(COPY.attendance.guestName)).toBeNull();
    expect(screen.queryByText(COPY.attendance.assistedOpen)).toBeNull();
    expect(
      screen.getByRole("heading", { name: COPY.attendance.scanTitle })
    ).toBeInTheDocument();
    expect(screen.getByText(COPY.attendance.scanLead)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.attendance.startScan })
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.attendance.manualEntryTitle)
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.attendance.manualOnlyTitle)
    ).toBeInTheDocument();
  });

  test("camera unavailable shows alert and manual-code card remains visible and usable", async () => {
    Reflect.deleteProperty(window, "BarcodeDetector");
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });

    render(<SelfCheckInPanel />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(COPY.attendance.cameraUnavailableTitle);
    expect(alert).toHaveTextContent(COPY.attendance.cameraUnavailableHint);

    const manualButton = screen.getByRole("button", {
      name: new RegExp(COPY.attendance.manualEntryTitle),
    });
    expect(manualButton).toBeInTheDocument();
    fireEvent.click(manualButton);

    const input = await screen.findByLabelText(
      new RegExp(COPY.attendance.manualEntryTitle)
    );
    expect(input).toHaveFocus();
  });

  test("manual code validation rejects non-6-digit input and resolves on valid 6 digits", async () => {
    server.use(resolveHandler({ events: [EVENT] }));
    const user = userEvent.setup();
    render(<SelfCheckInPanel />);

    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(COPY.attendance.manualEntryTitle),
      })
    );
    const input = await screen.findByLabelText(
      new RegExp(COPY.attendance.manualEntryTitle)
    );
    expect(input).toHaveFocus();

    await user.type(input, "12345");
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.resolve })
    );

    const errorOutput = await screen.findByText(
      COPY.attendance.invalidManualCode
    );
    expect(errorOutput.closest("output")).toHaveAttribute("data-tone", "error");
    expect(input).toHaveFocus();

    await user.clear(input);
    await user.type(input, "123456");
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.resolve })
    );

    const submitButton = await screen.findByRole("button", {
      name: COPY.attendance.memberSubmit,
    });
    expect(submitButton).toHaveFocus();
  });

  test("single open event resolution lands on confirmation seam and submits successfully", async () => {
    let checkInBody: Record<string, unknown> | undefined;
    server.use(
      resolveHandler({ events: [EVENT] }),
      http.post("/api/v1/attendance/self", async ({ request }) => {
        checkInBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          requestId: "rid-self",
          data: { outcome: "success", attendance_id: "att-1" },
        });
      })
    );

    const user = userEvent.setup();
    render(<SelfCheckInPanel />);

    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(COPY.attendance.manualEntryTitle),
      })
    );
    const input = await screen.findByLabelText(
      new RegExp(COPY.attendance.manualEntryTitle)
    );
    await user.type(input, "123456");
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.resolve })
    );

    const submitButton = await screen.findByRole("button", {
      name: COPY.attendance.memberSubmit,
    });
    expect(submitButton).toHaveFocus();
    expect(screen.getByText(/主堂/u)).toBeInTheDocument();

    await user.click(submitButton);
    await expect(
      screen.findByText(COPY.attendance.success)
    ).resolves.toBeInTheDocument();
    expect(checkInBody).toMatchObject({
      event_id: EVENT.event_id,
      method: "self_manual_code",
      entry: "123456",
    });
  });

  test("multi-event chooser lists candidates, supports rescan back, and candidate selection lands on confirmation seam", async () => {
    server.use(resolveHandler({ events: [EVENT, EVENT_TWO] }));
    const user = userEvent.setup();
    render(<SelfCheckInPanel />);

    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(COPY.attendance.manualEntryTitle),
      })
    );
    const input = await screen.findByLabelText(
      new RegExp(COPY.attendance.manualEntryTitle)
    );
    await user.type(input, "123456");
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.resolve })
    );

    const chooserHeading = await screen.findByRole("heading", {
      name: COPY.attendance.chooseMeeting,
    });
    expect(chooserHeading).toHaveFocus();
    expect(
      screen.getByText(COPY.attendance.recognizedMultiple)
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.attendance.chooseMeetingHint)
    ).toBeInTheDocument();

    const candidateButtons = screen.getAllByRole("button", {
      name: /週六聚會|週日崇拜/u,
    });
    expect(candidateButtons).toHaveLength(2);

    const rescanButton = screen.getByRole("button", {
      name: COPY.attendance.rescan,
    });
    await user.click(rescanButton);
    expect(
      screen.getByRole("heading", { name: COPY.attendance.scanTitle })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(COPY.attendance.manualEntryTitle),
      })
    );
    const input2 = await screen.findByLabelText(
      new RegExp(COPY.attendance.manualEntryTitle)
    );
    await user.type(input2, "123456");
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.resolve })
    );

    const secondChooserButtons = await screen.findAllByRole("button", {
      name: /週六聚會|週日崇拜/u,
    });
    await user.click(secondChooserButtons[1]);

    const submitButton = await screen.findByRole("button", {
      name: COPY.attendance.memberSubmit,
    });
    expect(submitButton).toHaveFocus();
    expect(screen.getByText(/副堂/u)).toBeInTheDocument();
  });

  test("window-not-open outcome shows exact opening time, amber icon, and returns to scan on backToScan", async () => {
    server.use(
      resolveHandler({
        events: [],
        latest: {
          status: "Active",
          availability: "Active",
          check_in_window_opens_at: "2026-08-13T10:30:00.000Z",
          starts_at: "2026-08-13T11:00:00.000Z",
          program_id: "prog-1",
          program_name: "週六團契",
        },
        enrolled: true,
      })
    );

    const user = userEvent.setup();
    render(<SelfCheckInPanel />);

    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(COPY.attendance.manualEntryTitle),
      })
    );
    const input = await screen.findByLabelText(
      new RegExp(COPY.attendance.manualEntryTitle)
    );
    await user.type(input, "123456");
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.resolve })
    );

    const outcomeHeading = await screen.findByRole("heading", {
      name: COPY.attendance.outcomeWindowTitle,
    });
    expect(outcomeHeading).toHaveFocus();
    expect(screen.getByText(COPY.attendance.outcomeHeader)).toBeInTheDocument();
    expect(
      screen.getByTestId("attendance-outcome-icon-window-not-open")
    ).toBeInTheDocument();
    expect(screen.getByText("6:30 PM")).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(COPY.attendance.outcomeWindowBodyPrefix))
    ).toBeInTheDocument();

    const backButton = screen.getByRole("button", {
      name: COPY.attendance.backToScan,
    });
    await user.click(backButton);
    expect(
      screen.getByRole("heading", { name: COPY.attendance.scanTitle })
    ).toBeInTheDocument();
  });

  test("cancelled outcome shows cancellation copy, red info icon, and returns to scan", async () => {
    server.use(
      resolveHandler({
        events: [],
        latest: {
          status: "Cancelled",
          availability: "Active",
          check_in_window_opens_at: "2026-08-13T10:30:00.000Z",
          starts_at: null,
          program_id: "prog-1",
          program_name: "週六團契",
        },
        enrolled: true,
      })
    );

    const user = userEvent.setup();
    render(<SelfCheckInPanel />);

    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(COPY.attendance.manualEntryTitle),
      })
    );
    const input = await screen.findByLabelText(
      new RegExp(COPY.attendance.manualEntryTitle)
    );
    await user.type(input, "123456");
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.resolve })
    );

    const cancelledHeading = await screen.findByRole("heading", {
      name: COPY.attendance.outcomeCancelledTitle,
    });
    expect(cancelledHeading).toHaveFocus();
    expect(
      screen.getByTestId("attendance-outcome-icon-cancelled")
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.attendance.outcomeCancelledBody)
    ).toBeInTheDocument();

    const backButton = screen.getByRole("button", {
      name: COPY.attendance.backToScan,
    });
    await user.click(backButton);
    expect(
      screen.getByRole("heading", { name: COPY.attendance.scanTitle })
    ).toBeInTheDocument();
  });

  test("not-enrolled outcome shows not-enrolled copy, gray icon, and CTA linking to program detail", async () => {
    server.use(
      resolveHandler({
        events: [],
        latest: {
          status: "Active",
          availability: "Active",
          check_in_window_opens_at: "2026-08-13T10:30:00.000Z",
          starts_at: null,
          program_id: "prog-42",
          program_name: "成長課程",
        },
        enrolled: false,
      })
    );

    const user = userEvent.setup();
    render(<SelfCheckInPanel />);

    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(COPY.attendance.manualEntryTitle),
      })
    );
    const input = await screen.findByLabelText(
      new RegExp(COPY.attendance.manualEntryTitle)
    );
    await user.type(input, "123456");
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.resolve })
    );

    const notEnrolledHeading = await screen.findByRole("heading", {
      name: COPY.attendance.outcomeNotEnrolledTitle,
    });
    expect(notEnrolledHeading).toHaveFocus();
    expect(
      screen.getByTestId("attendance-outcome-icon-not-enrolled")
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.attendance.outcomeNotEnrolledBody)
    ).toBeInTheDocument();

    const detailLink = screen.getByRole("link", {
      name: COPY.attendance.viewProgramDetail,
    });
    expect(detailLink).toHaveAttribute("href", "/programs?program=prog-42");

    const backButton = screen.getByRole("button", {
      name: COPY.attendance.backToScan,
    });
    await user.click(backButton);
    expect(
      screen.getByRole("heading", { name: COPY.attendance.scanTitle })
    ).toBeInTheDocument();
  });

  test("unknown/invalid code shows inline error on main scan screen with immediate retry", async () => {
    server.use(
      resolveHandler({
        events: [],
        latest: null,
        enrolled: false,
      })
    );

    const user = userEvent.setup();
    render(<SelfCheckInPanel />);

    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(COPY.attendance.manualEntryTitle),
      })
    );
    const input = await screen.findByLabelText(
      new RegExp(COPY.attendance.manualEntryTitle)
    );
    await user.type(input, "123456");
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.resolve })
    );

    const output = await screen.findByText(COPY.attendance.invalidEntry);
    expect(output.closest("output")).toHaveAttribute("data-tone", "error");
    expect(input).toHaveValue("123456");
  });

  test("offline network error shows inline error on main scan screen with immediate retry", async () => {
    server.use(
      http.get("/api/v1/attendance/resolve", () => HttpResponse.error())
    );

    const user = userEvent.setup();
    render(<SelfCheckInPanel />);

    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(COPY.attendance.manualEntryTitle),
      })
    );
    const input = await screen.findByLabelText(
      new RegExp(COPY.attendance.manualEntryTitle)
    );
    await user.type(input, "123456");
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.resolve })
    );

    const output = await screen.findByText(COPY.error.networkError);
    expect(output.closest("output")).toHaveAttribute("data-tone", "error");
    expect(input).toHaveValue("123456");
  });

  test("duplicate check-in renders accessible neutral notice", async () => {
    server.use(
      resolveHandler({ events: [EVENT] }),
      http.post("/api/v1/attendance/self", () =>
        HttpResponse.json({
          requestId: "rid-dup",
          data: { outcome: "duplicate", attendance_id: "att-1" },
        })
      )
    );

    const user = userEvent.setup();
    render(<SelfCheckInPanel />);

    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(COPY.attendance.manualEntryTitle),
      })
    );
    const input = await screen.findByLabelText(
      new RegExp(COPY.attendance.manualEntryTitle)
    );
    await user.type(input, "123456");
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.resolve })
    );
    await user.click(
      await screen.findByRole("button", { name: COPY.attendance.memberSubmit })
    );

    const output = await screen.findByText(COPY.attendance.duplicate);
    expect(output.closest("output")).toHaveAttribute("data-tone", "info");
  });

  test("preserves selection and offers retry after ambiguous transport on submission", async () => {
    let attempts = 0;
    server.use(
      resolveHandler({ events: [EVENT] }),
      http.post("/api/v1/attendance/self", () => {
        attempts += 1;
        return attempts === 1
          ? HttpResponse.error()
          : HttpResponse.json({
              requestId: "rid-retry",
              data: { outcome: "success", attendance_id: "att-1" },
            });
      })
    );

    const user = userEvent.setup();
    render(<SelfCheckInPanel />);

    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(COPY.attendance.manualEntryTitle),
      })
    );
    const input = await screen.findByLabelText(
      new RegExp(COPY.attendance.manualEntryTitle)
    );
    await user.type(input, "123456");
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.resolve })
    );
    await user.click(
      await screen.findByRole("button", { name: COPY.attendance.memberSubmit })
    );

    const retryButton = await screen.findByRole("button", {
      name: COPY.attendance.retry,
    });
    expect(retryButton).toHaveFocus();
    const ambiguous = screen.getByText(COPY.attendance.transportAmbiguous);
    expect(ambiguous.closest("output")).toHaveAttribute("data-tone", "error");

    await user.click(retryButton);
    await expect(
      screen.findByText(COPY.attendance.success)
    ).resolves.toBeInTheDocument();
    expect(attempts).toBe(2);
  });
});
