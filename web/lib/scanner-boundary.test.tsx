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

describe("Scanner mode boundary", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => {
    cleanup();
    server.resetHandlers();
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
    expect(screen.getByText(COPY.attendance.selfHint)).toBeVisible();
  });

  test("keeps Self usable and exposes a retry when the Assisted access probe fails", async () => {
    server.use(
      http.get("/api/v1/attendance/scanner-events", () =>
        HttpResponse.json({ status: 503, code: "UNAVAILABLE" }, { status: 503 })
      )
    );
    const user = userEvent.setup();
    render(<ScannerBoundary />);

    expect(screen.getByText(COPY.attendance.selfHint)).toBeVisible();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(COPY.error.unavailable);
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
