// ATT-01/02 (#213/#214) — component tests for the guest/member check-in
// panel. MSW intercepts the Worker RPCs; the form's native constraint
// validation and the error/duplicate feedback paths are asserted against
// the real DOM, matching the E2E suite's observable contracts.
import { readFileSync } from "node:fs";
import path from "node:path";

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

import type { AttendanceEvent } from "@/lib/attendance";
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

async function fillGuestForm(
  user: UserEvent,
  values: {
    code?: string;
    name?: string;
    phone?: string;
  } = {}
) {
  await user.type(
    screen.getByLabelText(COPY.attendance.guestCodeLabel),
    values.code ?? "ATT1234"
  );
  if (values.name !== undefined) {
    await user.type(
      screen.getByLabelText(COPY.attendance.guestName),
      values.name
    );
  }
  if (values.phone !== undefined) {
    await user.type(phoneField(), values.phone);
  }
}

// The phone label also wraps the hint span (客名 by value), so match by
// The phone label also wraps the hint span, so its full label text is
// 電話例如：… — match the label by 電話 prefix instead of the whole text.
function phoneField(): HTMLInputElement {
  return screen.getByLabelText(
    new RegExp(`^${COPY.attendance.guestPhone}`, "u")
  );
}

function FailedBarcodeDetector() {
  return {
    detect: () => Promise.reject(new Error("detector unavailable")),
  };
}

describe(AttendancePanel, () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

  afterEach(() => {
    cleanup();
    server.resetHandlers();
    vi.restoreAllMocks();
  });

  afterAll(() => server.close());

  describe("AttendancePanel guest flow", () => {
    test("guest fields render in the primary form with native constraints", () => {
      render(<AttendancePanel />);

      const nameInput = screen.getByLabelText(COPY.attendance.guestName);
      expect(nameInput).toHaveAttribute("maxLength", "80");
      expect(nameInput).toHaveAttribute("required");
      expect(
        screen.getByLabelText(COPY.attendance.guestCodeLabel)
      ).toHaveAttribute("placeholder", COPY.attendance.guestCodePlaceholder);
      expect(
        screen.getByText(COPY.attendance.camera, { selector: "summary" })
      ).toBeInTheDocument();
    });

    test("empty guest submit is blocked by native form validation (no request)", async () => {
      let guestPosts = 0;
      server.use(
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
      await fillGuestForm(user, { name: "E2E訪客" });

      await user.click(
        screen.getByRole("button", { name: COPY.attendance.guestSubmit })
      );
      // Native constraint validation must abort the submit before any RPC.
      await waitFor(() => expect(guestPosts).toBe(0));
      const phoneInput = phoneField();
      expect(phoneInput.validity.valueMissing).toBeTruthy();
    });

    test("invalid phone surfaces the server VALIDATION detail with error tone", async () => {
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
      await fillGuestForm(user, { name: "E2E訪客", phone: "abc" });
      await user.click(
        screen.getByRole("button", { name: COPY.attendance.guestSubmit })
      );

      const output = await screen.findByText("請輸入有效電話號碼。");
      expect(output.closest("output")).toHaveAttribute("data-tone", "error");
    });

    test("guest duplicate gets a dedicated neutral result card", async () => {
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
            data: { outcome: "duplicate", attendance_id: "a1" },
          })
        )
      );
      const user = userEvent.setup();
      render(<AttendancePanel />);
      await fillGuestForm(user, { name: "E2E訪客", phone: "91234567" });
      await user.click(
        screen.getByRole("button", { name: COPY.attendance.guestSubmit })
      );

      await expect(
        screen.findByRole("heading", {
          name: COPY.attendance.guestResultDuplicateTitle,
        })
      ).resolves.toBeInTheDocument();
      expect(
        screen.getByText(COPY.attendance.guestDuplicate)
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: COPY.attendance.guestResultComplete })
      ).toHaveAttribute("href", "/");
    });

    test("clicking member login link preserves typed code as a guest credential", async () => {
      clearGuestCredential();
      const user = userEvent.setup();
      render(<AttendancePanel />);
      await user.type(
        screen.getByLabelText(COPY.attendance.guestCodeLabel),
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

    test("resolving multiple events presents chooser and allows selection", async () => {
      const event2: AttendanceEvent = {
        ...EVENT,
        event_id: "evt-2",
        name: "主日聚會",
        manual_check_in_code: "ATT5678",
      };
      server.use(
        http.get("/api/v1/attendance/resolve", () =>
          HttpResponse.json({
            requestId: "rid-multi",
            data: { events: [EVENT, event2] },
          })
        ),
        http.post("/api/v1/attendance/guest", () =>
          HttpResponse.json({
            requestId: "rid-guest",
            data: { outcome: "success", attendance_id: "a1" },
          })
        )
      );
      const user = userEvent.setup();
      render(<AttendancePanel />);
      await fillGuestForm(user, {
        code: "PROG-TOKEN",
        name: "E2E訪客",
        phone: "91234567",
      });
      await user.click(
        screen.getByRole("button", { name: COPY.attendance.guestSubmit })
      );

      await expect(
        screen.findByRole("heading", { name: COPY.attendance.chooseEvent })
      ).resolves.toBeVisible();
      expect(screen.getByText("週六聚會")).toBeVisible();
      expect(screen.getByText("主日聚會")).toBeVisible();

      await user.click(screen.getByRole("button", { name: /主日聚會/u }));
      await expect(
        screen.findByRole("heading", { name: COPY.attendance.guestResultTitle })
      ).resolves.toBeVisible();
    });

    test("resolving with no events reports the empty event notice", async () => {
      server.use(
        http.get("/api/v1/attendance/resolve", () =>
          HttpResponse.json({
            requestId: "rid-empty",
            data: { events: [] },
          })
        )
      );
      const user = userEvent.setup();
      render(<AttendancePanel />);
      await fillGuestForm(user, {
        code: "PROG-EMPTY",
        name: "E2E訪客",
        phone: "91234567",
      });
      await user.click(
        screen.getByRole("button", { name: COPY.attendance.guestSubmit })
      );

      await expect(
        screen.findByText(COPY.attendance.noEvents)
      ).resolves.toBeVisible();
    });
  });

  describe("AttendancePanel camera feedback", () => {
    test("turns a detector failure into recoverable camera feedback", async () => {
      const stream = {
        getTracks: () => [{ stop: vi.fn<() => void>() }],
      } as unknown as MediaStream;
      const originalDetector = (
        window as Window & { BarcodeDetector?: unknown }
      ).BarcodeDetector;
      Object.defineProperty(window, "BarcodeDetector", {
        configurable: true,
        value: FailedBarcodeDetector,
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
      render(<AttendancePanel />);
      await user.click(
        screen.getByText(COPY.attendance.camera, { selector: "summary" })
      );
      await user.click(
        screen.getByRole("button", { name: COPY.attendance.selfScanStart })
      );

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(COPY.attendance.cameraUnavailableTitle);
      expect(alert).toHaveTextContent(
        COPY.attendance.cameraUnavailableGuidance
      );
      expect(
        screen.getByRole("button", { name: COPY.attendance.selfScanStart })
      ).toBeInTheDocument();

      if (originalDetector === undefined) {
        Reflect.deleteProperty(window, "BarcodeDetector");
      } else {
        Object.defineProperty(window, "BarcodeDetector", {
          configurable: true,
          value: originalDetector,
        });
      }
    });

    test("guest camera scan detects Program QR, resolves single event, and submits with guest_qr_scan method", async () => {
      let capturedMethod: string | undefined;
      let capturedToken: string | undefined;
      server.use(
        http.get("/api/v1/attendance/resolve", () =>
          HttpResponse.json({
            requestId: "rid-qr",
            data: { events: [EVENT] },
          })
        ),
        http.post("/api/v1/attendance/guest", async ({ request }) => {
          const body = (await request.json()) as {
            method: string;
            program_token?: string;
          };
          capturedMethod = body.method;
          capturedToken = body.program_token;
          return HttpResponse.json({
            requestId: "rid-guest",
            data: { outcome: "success", attendance_id: "att-qr-1" },
          });
        })
      );

      const stop = vi.fn<() => void>();
      const stream = {
        getTracks: () => [{ stop }],
      } as unknown as MediaStream;
      class FakeDetector {
        detected = [
          {
            rawValue:
              "https://efcc.example/scanner?program_token=ATTENDANCE-PROGRAM-TOKEN",
          },
        ];

        detect() {
          return Promise.resolve(this.detected);
        }
      }
      Object.defineProperty(window, "BarcodeDetector", {
        configurable: true,
        value: FakeDetector,
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
      render(<AttendancePanel />);
      await user.click(
        screen.getByText(COPY.attendance.camera, { selector: "summary" })
      );
      await user.click(
        screen.getByRole("button", { name: COPY.attendance.selfScanStart })
      );
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: COPY.attendance.guestSubmit })
        ).not.toBeDisabled();
      });
      await user.type(
        screen.getByLabelText(COPY.attendance.guestName),
        "相機訪客"
      );
      await user.type(phoneField(), "98765432");
      await user.click(
        screen.getByRole("button", { name: COPY.attendance.guestSubmit })
      );

      await waitFor(() => {
        expect(
          screen.getByRole("heading", {
            name: COPY.attendance.guestResultTitle,
          })
        ).toBeVisible();
      });
      expect(capturedMethod).toBe("guest_qr_scan");
      expect(capturedToken).toBe("ATTENDANCE-PROGRAM-TOKEN");
      expect(stop).toHaveBeenCalledWith();
    });
  });

  describe("attendance module guardrails", () => {
    test(".rowName wraps long names instead of occluding sibling controls", () => {
      const css = readFileSync(
        path.resolve(process.cwd(), "lib/attendance-panel.module.css"),
        "utf-8"
      );
      const rowNameBlock = css.match(/\.rowName \{[^}]*\}/u)?.[0] ?? "";
      expect(rowNameBlock).toContain("overflow-wrap: anywhere");
      expect(rowNameBlock).toContain("max-width");
      expect(rowNameBlock).toContain("min-width: 0");
    });

    test("off-scale font sizes are gone from the attendance module", () => {
      const css = readFileSync(
        path.resolve(process.cwd(), "lib/attendance-panel.module.css"),
        "utf-8"
      );
      expect(css).not.toMatch(/font-size: (?:0\.[89]rem|0\.95rem|0\.78rem)/u);
    });
  });
});
