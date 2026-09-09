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

import { AssistedScannerPanel } from "@/lib/assisted-scanner-panel";
import type { AttendanceEvent, AttendanceMember } from "@/lib/attendance";
import { COPY } from "@/lib/copy";

const server = setupServer();

const EVENTS: AttendanceEvent[] = [
  {
    event_id: "event-1",
    program_id: "program-1",
    program_name: "青年團契",
    name: "週六聚會",
    location: "主堂",
    starts_at: "2026-08-14T11:30:00.000Z",
    ends_at: "2026-08-14T13:00:00.000Z",
    manual_check_in_code: "ATT-1",
    check_in_window_opens_at: "2026-08-14T10:30:00.000Z",
    check_in_window_closes_at: "2026-08-14T13:30:00.000Z",
    status: "Active",
    availability: "Active",
  },
  {
    event_id: "event-2",
    program_id: "program-2",
    program_name: "成人主日學",
    name: "主日課程",
    location: "副堂",
    starts_at: "2026-08-14T14:30:00.000Z",
    ends_at: "2026-08-14T16:00:00.000Z",
    manual_check_in_code: "ATT-2",
    check_in_window_opens_at: "2026-08-14T13:30:00.000Z",
    check_in_window_closes_at: "2026-08-14T16:30:00.000Z",
    status: "Active",
    availability: "Active",
  },
];

const MEMBER: AttendanceMember = {
  user_id: "member-1",
  name: "陳大文",
  phone: "9123 4567",
  qr_code_string: "MEMBER-QR-1",
};

let detectorResult: Promise<{ rawValue: string }[]> = Promise.resolve([
  { rawValue: "MEMBER-QR-1" },
]);

function fakeBarcodeDetector() {
  return {
    detect: () => detectorResult,
  };
}

function renderPanel(
  requestedEventId: string | null = null,
  contextError: string | null = null
) {
  const onEventChange = vi.fn<(eventId: string | null) => void>();
  render(
    <AssistedScannerPanel
      events={EVENTS}
      requestedEventId={requestedEventId}
      contextError={contextError}
      onEventChange={onEventChange}
    />
  );
  return onEventChange;
}

describe("Assisted Scanner panel", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

  afterEach(() => {
    cleanup();
    server.resetHandlers();
    detectorResult = Promise.resolve([{ rawValue: "MEMBER-QR-1" }]);
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "BarcodeDetector");
    Reflect.deleteProperty(navigator, "mediaDevices");
  });

  afterAll(() => server.close());

  test("pins the selected Program/Event and checks in a searched enrolled member", async () => {
    server.use(
      http.get("/api/v1/attendance/events/event-1/members", () =>
        HttpResponse.json({
          requestId: "rid-members",
          data: { members: [MEMBER] },
        })
      ),
      http.post("/api/v1/attendance/events/event-1/check-in", () =>
        HttpResponse.json({
          requestId: "rid-checkin",
          data: { outcome: "success", attendance_id: "attendance-1" },
        })
      )
    );
    const user = userEvent.setup();
    renderPanel("event-1");

    expect(screen.getByLabelText(COPY.attendance.assistedContext)).toHaveValue(
      "event-1"
    );
    expect(screen.getByText(/青年團契/u)).toBeVisible();
    await user.type(
      screen.getByLabelText(COPY.attendance.memberSearch),
      "陳大文"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.search })
    );
    await screen.findByText(MEMBER.name);
    expect(
      screen.getByText(COPY.attendance.assistedMembersFound)
    ).toBeVisible();
    const results = screen.getByRole("list", {
      name: COPY.attendance.memberSearch,
    });
    expect(results).toHaveAttribute("aria-live", "polite");
    await waitFor(() => expect(document.activeElement).toBe(results));
    await user.click(screen.getByRole("button", { name: /替成員簽到/u }));
    await waitFor(() =>
      expect(screen.getByText(COPY.attendance.success)).toBeVisible()
    );
  });

  test("searches an enrolled member by phone", async () => {
    server.use(
      http.get("/api/v1/attendance/events/event-1/members", () =>
        HttpResponse.json({
          requestId: "rid-phone",
          data: { members: [MEMBER] },
        })
      )
    );
    const user = userEvent.setup();
    renderPanel("event-1");
    await user.type(
      screen.getByLabelText(COPY.attendance.memberSearch),
      "9123 4567"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.search })
    );
    await expect(screen.findByText(MEMBER.name)).resolves.toBeVisible();
  });

  test("exposes pending state while member search is loading", async () => {
    const response = Promise.withResolvers<Response>();
    server.use(
      http.get(
        "/api/v1/attendance/events/event-1/members",
        () => response.promise
      )
    );
    const user = userEvent.setup();
    renderPanel("event-1");
    await user.type(
      screen.getByLabelText(COPY.attendance.memberSearch),
      "陳大文"
    );
    const search = screen.getByRole("button", {
      name: COPY.attendance.search,
    });
    await user.click(search);
    await waitFor(() => expect(search).toBeDisabled());
    expect(search).toHaveAttribute("aria-busy", "true");
    response.resolve(
      HttpResponse.json({
        requestId: "rid-empty",
        data: { members: [] },
      })
    );
    await waitFor(() => expect(search).not.toBeDisabled());
  });

  test("shows the empty state when member search returns no matches", async () => {
    server.use(
      http.get("/api/v1/attendance/events/event-1/members", () =>
        HttpResponse.json({
          requestId: "rid-empty",
          data: { members: [] },
        })
      )
    );
    const user = userEvent.setup();
    renderPanel("event-1");
    await user.type(
      screen.getByLabelText(COPY.attendance.memberSearch),
      "不存在"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.search })
    );
    await expect(
      screen.findByText(COPY.attendance.memberSearchEmpty)
    ).resolves.toBeVisible();
  });

  test("maps RFC errors from member search to recoverable status copy", async () => {
    server.use(
      http.get("/api/v1/attendance/events/event-1/members", () =>
        HttpResponse.json(
          {
            type: "https://efcc.example/problems/unavailable",
            title: "Unavailable",
            status: 503,
            detail: "Temporary failure",
            code: "UNAVAILABLE",
            requestId: "rid-unavailable",
          },
          { status: 503 }
        )
      )
    );
    const user = userEvent.setup();
    renderPanel("event-1");
    await user.type(
      screen.getByLabelText(COPY.attendance.memberSearch),
      "陳大文"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.search })
    );
    await expect(
      screen.findByText(COPY.error.unavailable)
    ).resolves.toBeVisible();
  });

  test("disables camera restart while the stream is open", async () => {
    const pendingDetection = Promise.withResolvers<{ rawValue: string }[]>();
    detectorResult = pendingDetection.promise;
    const stop = vi.fn<() => void>();
    const stream = {
      getTracks: () => [{ stop, addEventListener: vi.fn() }],
    } as unknown as MediaStream;
    Object.defineProperty(window, "BarcodeDetector", {
      configurable: true,
      value: fakeBarcodeDetector,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi
          .fn<() => Promise<MediaStream>>()
          .mockResolvedValue(stream),
      },
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const user = userEvent.setup();
    renderPanel("event-1");

    await user.click(
      screen.getByRole("button", { name: COPY.attendance.camera })
    );
    await screen.findByRole("button", { name: COPY.attendance.cameraClose });
    expect(
      screen.getByRole("button", { name: COPY.attendance.cameraRetry })
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.cameraClose })
    );
    pendingDetection.resolve([]);
    expect(stop).toHaveBeenCalledOnce();
  });

  test("QR scans with multiple matching members stop before check-in", async () => {
    server.use(
      http.get("/api/v1/attendance/events/event-1/members", () =>
        HttpResponse.json({
          requestId: "rid-ambiguous",
          data: {
            members: [
              MEMBER,
              { ...MEMBER, user_id: "member-2", qr_code_string: "MEMBER-QR-2" },
            ],
          },
        })
      )
    );
    const stop = vi.fn<() => void>();
    const stream = {
      getTracks: () => [{ stop, addEventListener: vi.fn() }],
    } as unknown as MediaStream;
    Object.defineProperty(window, "BarcodeDetector", {
      configurable: true,
      value: fakeBarcodeDetector,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi
          .fn<() => Promise<MediaStream>>()
          .mockResolvedValue(stream),
      },
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const user = userEvent.setup();
    renderPanel("event-1");
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.camera })
    );
    await waitFor(() =>
      expect(
        screen.getByText(COPY.attendance.assistedMemberSearchAmbiguous)
      ).toBeVisible()
    );
    expect(stop).toHaveBeenCalledOnce();
  });

  test("changing context clears the search result and stops using the old Event", async () => {
    server.use(
      http.get("/api/v1/attendance/events/event-1/members", () =>
        HttpResponse.json({
          requestId: "rid-members",
          data: { members: [MEMBER] },
        })
      )
    );
    const user = userEvent.setup();
    const onEventChange = renderPanel("event-1");
    await user.type(screen.getByLabelText(COPY.attendance.memberSearch), "陳");
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.search })
    );
    await screen.findByText(MEMBER.name);

    await user.selectOptions(
      screen.getByLabelText(COPY.attendance.assistedContext),
      "event-2"
    );
    expect(onEventChange).toHaveBeenCalledWith("event-2");
    expect(screen.queryByText(MEMBER.name)).not.toBeInTheDocument();
  });

  test("does not open an unauthorized or stale deep-link Event", () => {
    renderPanel("event-forbidden", COPY.attendance.assistedContextStale);
    expect(screen.getByRole("alert")).toHaveTextContent(
      COPY.attendance.assistedContextStale
    );
    expect(
      screen.queryByLabelText(COPY.attendance.memberSearch)
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(COPY.attendance.assistedContext)).toHaveValue(
      ""
    );
  });

  test("invokes onAuthRequired when member search returns AUTH_REQUIRED", async () => {
    const onAuthRequired = vi.fn();
    server.use(
      http.get("/api/v1/attendance/events/event-1/members", () =>
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
    const user = userEvent.setup();
    render(
      <AssistedScannerPanel
        events={EVENTS}
        requestedEventId="event-1"
        onEventChange={() => {}}
        onAuthRequired={onAuthRequired}
      />
    );
    await user.type(
      screen.getByLabelText(COPY.attendance.memberSearch),
      "陳大文"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.search })
    );
    await waitFor(() => expect(onAuthRequired).toHaveBeenCalledOnce());
  });

  test("invokes onAuthRequired when check-in returns AUTH_REQUIRED", async () => {
    const onAuthRequired = vi.fn();
    server.use(
      http.get("/api/v1/attendance/events/event-1/members", () =>
        HttpResponse.json({
          requestId: "rid-members",
          data: { members: [MEMBER] },
        })
      ),
      http.post("/api/v1/attendance/events/event-1/check-in", () =>
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
    const user = userEvent.setup();
    render(
      <AssistedScannerPanel
        events={EVENTS}
        requestedEventId="event-1"
        onEventChange={() => {}}
        onAuthRequired={onAuthRequired}
      />
    );
    await user.type(
      screen.getByLabelText(COPY.attendance.memberSearch),
      "陳大文"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.search })
    );
    await screen.findByText(MEMBER.name);
    await user.click(screen.getByRole("button", { name: /替成員簽到/u }));
    await waitFor(() => expect(onAuthRequired).toHaveBeenCalledOnce());
  });

  test("displays forbidden error without exposing member search results when search returns 403", async () => {
    server.use(
      http.get("/api/v1/attendance/events/event-1/members", () =>
        HttpResponse.json(
          {
            type: "https://efcc.example/problems/forbidden",
            title: "Forbidden",
            status: 403,
            code: "FORBIDDEN",
            requestId: "rid-forbidden",
          },
          { status: 403 }
        )
      )
    );
    const user = userEvent.setup();
    renderPanel("event-1");
    await user.type(
      screen.getByLabelText(COPY.attendance.memberSearch),
      "陳大文"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.search })
    );
    await expect(
      screen.findByText(COPY.error.forbidden)
    ).resolves.toBeVisible();
    expect(screen.queryByText(MEMBER.name)).not.toBeInTheDocument();
  });
});
