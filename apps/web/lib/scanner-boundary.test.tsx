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
          getTracks: () => [
            { stop: vi.fn<() => void>(), addEventListener: vi.fn() },
          ],
        } as unknown as MediaStream),
      },
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    server.resetHandlers();
    sessionStorage.clear();
    Reflect.deleteProperty(window, "BarcodeDetector");
    Reflect.deleteProperty(navigator, "mediaDevices");
    window.history.replaceState(null, "", "/scanner");
  });

  afterAll(() => server.close());

  test("shows the accessible Self/Operator switch only for eligible access", async () => {
    server.use(eventsHandler([EVENT]));
    const user = userEvent.setup();
    render(<ScannerBoundary />);

    const operatorTab = await screen.findByRole("tab", {
      name: COPY.attendance.operatorMode,
    });
    const selfTab = screen.getByRole("tab", { name: COPY.attendance.selfMode });
    expect(selfTab).toHaveAttribute("aria-selected", "true");
    await user.click(operatorTab);
    expect(operatorTab).toHaveAttribute("aria-selected", "true");
    expect(window.location.search).toBe("?mode=assisted");
    await screen.findByLabelText(COPY.attendance.assistedContext);

    await user.click(selfTab);
    expect(selfTab).toHaveAttribute("aria-selected", "true");
    expect(window.location.search).toBe("?mode=self");
    await waitFor(() =>
      expect(
        screen.queryByLabelText(COPY.attendance.assistedContext)
      ).not.toBeInTheDocument()
    );
  });

  test("keeps Assisted mode hidden when the server returns no eligible Events", async () => {
    server.use(eventsHandler([]));
    render(<ScannerBoundary />);

    await waitFor(() =>
      expect(
        screen.queryByRole("tab", { name: COPY.attendance.operatorMode })
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

  test("handles AUTH_REQUIRED by remembering deep link and redirecting to login", async () => {
    window.history.replaceState(
      null,
      "",
      "/scanner?mode=assisted&event=event-1#scan"
    );
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
    render(<ScannerBoundary />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"));
    expect(sessionStorage.getItem("efcc_session_expired")).toBe("1");
    expect(sessionStorage.getItem("efcc_deep_link")).toBe(
      "/scanner?mode=assisted&event=event-1#scan"
    );
  });

  test("falls back safely to Self mode without mode tabs when URL intent is malformed", async () => {
    window.history.replaceState(null, "", "/scanner?mode=assisted&mode=self");
    server.use(eventsHandler([EVENT]));
    render(<ScannerBoundary />);

    await screen.findByText(COPY.attendance.cameraLiveHint);
    expect(
      screen.queryByRole("tab", { name: COPY.attendance.operatorMode })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(COPY.attendance.assistedContext)
    ).not.toBeInTheDocument();
  });
});
