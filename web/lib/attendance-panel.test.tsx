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
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { AttendancePanel } from "@/lib/attendance-panel";
import type { AttendanceEvent } from "@/lib/attendance";
import { COPY } from "@/lib/copy";

const server = setupServer();

const EVENT: AttendanceEvent = {
  event_id: "evt-1",
  program_id: "prog-1",
  program_name: "週六團契",
  starts_at: "2026-08-13T11:30:00.000Z",
  ends_at: "2026-08-13T13:00:00.000Z",
  manual_check_in_code: "ATT1234",
  check_in_window_opens_at: "2026-08-13T10:30:00.000Z",
  check_in_window_closes_at: "2026-08-13T13:30:00.000Z",
  status: "Active",
};

/** Resolve an entry to a chooser with the single event auto-selected. */
async function resolveSingleEvent(user: UserEvent) {
  await user.type(screen.getByLabelText(COPY.attendance.inputLabel), "ATT1234");
  await user.click(screen.getByRole("button", { name: COPY.attendance.resolve }));
  await screen.findByLabelText(COPY.attendance.guestName);
}

// The phone label also wraps the hint span (客名 by value), so match by
// The phone label also wraps the hint span, so its full label text is
// 電話例如：… — match the label by 電話 prefix instead of the whole text.
function phoneField(): HTMLInputElement {
  return screen.getByLabelText(new RegExp(`^${COPY.attendance.guestPhone}`));
}

describe("AttendancePanel guest flow", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => {
    cleanup();
    server.resetHandlers();
  });
  afterAll(() => server.close());

  test("guest name input is required and capped at 80 characters", async () => {
    server.use(
      http.get("/api/v1/attendance/resolve", () =>
        HttpResponse.json({
          requestId: "rid-1",
          data: { events: [EVENT] },
        })
      )
    );
    const user = userEvent.setup();
    render(<AttendancePanel guest />);
    await resolveSingleEvent(user);

    const nameInput = screen.getByLabelText(COPY.attendance.guestName);
    expect(nameInput).toHaveAttribute("maxLength", "80");
    expect(nameInput).toHaveAttribute("required");
  });

  test("empty guest submit is blocked by native form validation (no request)", async () => {
    let guestPosts = 0;
    server.use(
      http.get("/api/v1/attendance/resolve", () =>
        HttpResponse.json({
          requestId: "rid-1",
          data: { events: [EVENT] },
        })
      ),
      http.post("/api/v1/attendance/guest", () => {
        guestPosts += 1;
        return HttpResponse.json({
          requestId: "rid-2",
          data: { outcome: "success", attendance_id: "a1" },
        });
      })
    );
    const user = userEvent.setup();
    render(<AttendancePanel guest />);
    await resolveSingleEvent(user);

    await user.click(
      screen.getByRole("button", { name: COPY.attendance.guestSubmit })
    );
    // Native constraint validation must abort the submit before any RPC.
    await waitFor(() => expect(guestPosts).toBe(0));
    const phoneInput = phoneField();
    expect(phoneInput.validity.valueMissing).toBe(true);
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
    render(<AttendancePanel guest />);
    await resolveSingleEvent(user);

    await user.type(screen.getByLabelText(COPY.attendance.guestName), "E2E訪客");
    await user.type(phoneField(), "abc");
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.guestSubmit })
    );

    const output = await screen.findByText("請輸入有效電話號碼。");
    expect(output.closest("output")).toHaveAttribute("data-tone", "error");
  });

  test("guest duplicate is a neutral info notice, not an error", async () => {
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
    render(<AttendancePanel guest />);
    await resolveSingleEvent(user);

    await user.type(screen.getByLabelText(COPY.attendance.guestName), "E2E訪客");
    await user.type(phoneField(), "91234567");
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.guestSubmit })
    );
    const output = await screen.findByText(COPY.attendance.guestDuplicate);
    expect(output.closest("output")).toHaveAttribute("data-tone", "info");
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
    expect(css).not.toMatch(
      /font-size: (0\.[89]rem|0\.95rem|0\.78rem)/u
    );
  });
});