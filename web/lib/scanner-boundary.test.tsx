import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import type { AttendanceEvent } from "@/lib/attendance";
import { COPY } from "@/lib/copy";
import { ScannerBoundary } from "@/lib/scanner-boundary";

const server = setupServer();
const mocks = vi.hoisted(() => {
  const replace = vi.fn<(url: string) => void>();
  const router = {
    replace,
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    refresh: vi.fn<() => void>(),
    push: vi.fn<(url: string) => void>(),
    prefetch: vi.fn<(url: string) => void>(),
  };
  return {
    pathname: vi.fn<() => string>(() => "/scanner"),
    replace,
    router,
  };
});

vi.mock(import("next/navigation"), () => ({
  usePathname: () => mocks.pathname(),
  useRouter: () => mocks.router,
}));

const EVENT: AttendanceEvent = {
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
};

function eventsHandler(events: AttendanceEvent[]) {
  return http.get("/api/v1/attendance/scanner-events", () =>
    HttpResponse.json({ requestId: "rid-events", data: { events } })
  );
}

function fakeBarcodeDetector(this: { detect: () => Promise<never[]> }) {
  this.detect = () => Promise.resolve([]);
}

describe("Scanner mode boundary", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  beforeEach(() => {
    Object.defineProperty(window, "BarcodeDetector", {
      configurable: true,
      value: fakeBarcodeDetector,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn<() => Promise<MediaStream>>().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn<() => void>() }],
        } as unknown as MediaStream),
      },
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    server.resetHandlers();
    Reflect.deleteProperty(window, "BarcodeDetector");
    Reflect.deleteProperty(navigator, "mediaDevices");
    window.history.replaceState(null, "", "/scanner");
  });

  afterAll(() => server.close());

  test("shows the accessible Self/Assisted switch only for eligible access", async () => {
    server.use(eventsHandler([EVENT]));
    const user = userEvent.setup();
    render(<ScannerBoundary />);

    const assistedTab = await screen.findByRole("tab", {
      name: COPY.attendance.assistedMode,
    });
    expect(
      screen.getByRole("tab", { name: COPY.attendance.selfMode })
    ).toHaveAttribute("aria-selected", "true");
    await user.click(assistedTab);
    expect(assistedTab).toHaveAttribute("aria-selected", "true");
    await screen.findByLabelText(COPY.attendance.assistedContext);
  });

  test("keeps Assisted mode hidden when the server returns no eligible Events", async () => {
    server.use(eventsHandler([]));
    render(<ScannerBoundary />);

    await waitFor(() =>
      expect(
        screen.queryByRole("tab", { name: COPY.attendance.assistedMode })
      ).not.toBeInTheDocument()
    );
    await screen.findByText(COPY.attendance.cameraLiveHint);
  });

  test("keeps Self usable and exposes a retry when the Assisted access probe fails", async () => {
    server.use(
      http.get("/api/v1/attendance/scanner-events", () =>
        HttpResponse.json({ status: 503, code: "UNAVAILABLE" }, { status: 503 })
      )
    );
    const user = userEvent.setup();
    render(<ScannerBoundary />);

    await screen.findByText(COPY.attendance.cameraLiveHint);
    const alert = await screen.findByText(COPY.error.unavailable);
    expect(alert).toBeVisible();
    const retry = screen.getByRole("button", {
      name: COPY.attendance.assistedRetry,
    });
    await waitFor(() => expect(document.activeElement).toBe(retry));
    await user.click(retry);
  });

  test("revalidates a direct Event intent and recovers stale context safely", async () => {
    window.history.replaceState(
      null,
      "",
      "/scanner?mode=assisted&event=event-missing"
    );
    server.use(eventsHandler([EVENT]));
    render(<ScannerBoundary />);

    const staleMessages = await screen.findAllByText(
      COPY.attendance.assistedContextStale
    );
    expect(staleMessages[0]).toBeVisible();
    expect(
      screen.queryByLabelText(COPY.attendance.memberSearch)
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(COPY.attendance.assistedContext)).toHaveValue(
      ""
    );
  });
});
