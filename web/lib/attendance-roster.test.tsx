import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import type {
  AttendanceEvent,
  AttendanceEventSummary,
  AttendanceRow,
} from "@/lib/attendance";
import {
  AttendanceChooser,
  AttendanceRoster,
} from "@/lib/attendance-operator-panel";
import { COPY } from "@/lib/copy";

const EVENT: AttendanceEvent = {
  event_id: "evt-roster",
  program_id: "program-roster",
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

const SUMMARY: AttendanceEventSummary = {
  event_id: EVENT.event_id,
  program_id: EVENT.program_id,
  program_name: EVENT.program_name,
  name: EVENT.name,
  location: EVENT.location,
  starts_at: EVENT.starts_at,
  ends_at: EVENT.ends_at,
  check_in_window_opens_at: EVENT.check_in_window_opens_at,
  check_in_window_closes_at: EVENT.check_in_window_closes_at,
  status: EVENT.status,
  availability: EVENT.availability,
};

const MEMBER_ROW: AttendanceRow = {
  attendance_id: "att-member",
  event_id: EVENT.event_id,
  member_user_id: "member-1",
  guest_name: null,
  guest_phone: null,
  guest_phone_normalized: null,
  method: "leader_manual_search",
  status: "Active",
  checked_in_at: "2026-08-13T11:31:00.000Z",
  checked_in_by: "admin-1",
  voided_by: null,
  voided_at: null,
  void_reason: null,
};

const VOIDED_ROW: AttendanceRow = {
  ...MEMBER_ROW,
  attendance_id: "att-voided",
  member_user_id: "member-2",
  status: "Voided",
  void_reason: "重複簽到",
  voided_by: "admin-1",
  voided_at: "2026-08-13T11:40:00.000Z",
};

const GUEST_ROW: AttendanceRow = {
  ...MEMBER_ROW,
  attendance_id: "att-guest",
  member_user_id: null,
  guest_name: "舊訪客",
  guest_phone: "91234567",
  guest_phone_normalized: "hk:85291234567",
  method: "guest_manual_code",
};

afterEach(() => cleanup());

describe("AttendanceChooser", () => {
  test("renders the real open-meeting list and selects the exact row", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<AttendanceChooser events={[SUMMARY]} onSelect={onSelect} />);

    expect(
      screen.getByRole("heading", { name: COPY.attendance.chooserTitle })
    ).toBeVisible();
    expect(screen.getByText(COPY.attendance.chooserLead)).toBeVisible();
    expect(
      screen.getByRole("list", { name: COPY.attendance.chooserOpenMeetings })
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: /週六聚會/u }));
    expect(onSelect).toHaveBeenCalledWith(EVENT.event_id);
  });

  test("shows an honest empty state instead of an event-id input", () => {
    render(<AttendanceChooser events={[]} onSelect={vi.fn()} />);

    expect(screen.getByText(COPY.attendance.chooserEmpty)).toBeVisible();
    expect(
      screen.queryByLabelText(COPY.attendance.eventId)
    ).not.toBeInTheDocument();
  });
});

describe("AttendanceRoster", () => {
  test("shows status, title, live checked-in count, and preserves voided rows", () => {
    render(
      <AttendanceRoster
        event={EVENT}
        rows={[MEMBER_ROW, VOIDED_ROW]}
        memberDirectory={{
          "member-1": {
            user_id: "member-1",
            name: "會員一",
            phone: "91234567",
            qr_code_string: null,
          },
          "member-2": {
            user_id: "member-2",
            name: "會員二",
            phone: "93456789",
            qr_code_string: null,
          },
        }}
        onVoid={vi.fn()}
      />
    );

    expect(screen.getByText(COPY.attendance.rosterStatusActive)).toBeVisible();
    expect(
      screen.getByRole("heading", { name: COPY.attendance.rosterTitle })
    ).toBeVisible();
    expect(screen.getByText(/週六聚會/u)).toBeVisible();
    expect(
      screen.getByText(COPY.attendance.checkedInCount(1, 2))
    ).toBeVisible();
    expect(screen.getByText(COPY.attendance.status.Voided)).toBeVisible();
    expect(screen.getByText("重複簽到")).toBeVisible();
  });

  test("requires a void reason before calling the mutation", async () => {
    const user = userEvent.setup();
    const onVoid = vi.fn().mockResolvedValue(true);
    render(
      <AttendanceRoster event={EVENT} rows={[MEMBER_ROW]} onVoid={onVoid} />
    );

    await user.click(
      screen.getByRole("button", { name: COPY.attendance.voidAttendance })
    );
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.voidConfirm })
    );
    expect(onVoid).not.toHaveBeenCalled();

    await user.type(
      screen.getByLabelText(COPY.attendance.voidReason),
      "重複簽到"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.voidConfirm })
    );
    expect(onVoid).toHaveBeenCalledWith(MEMBER_ROW, "重複簽到");
  });

  test("requires a correction reason and preserves old/new guest values for the audit callback", async () => {
    const user = userEvent.setup();
    const onCorrectGuest = vi.fn().mockResolvedValue(true);
    render(
      <AttendanceRoster
        event={EVENT}
        rows={[GUEST_ROW]}
        onCorrectGuest={onCorrectGuest}
      />
    );

    await user.click(
      screen.getByRole("button", { name: COPY.attendance.guestCorrection })
    );
    const name = screen.getByDisplayValue("舊訪客");
    const phone = screen.getByDisplayValue("91234567");
    await user.clear(name);
    await user.type(name, "新訪客");
    await user.clear(phone);
    await user.type(phone, "92345678");
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.saveCorrection })
    );
    expect(onCorrectGuest).not.toHaveBeenCalled();

    await user.type(
      screen.getByLabelText(COPY.attendance.correctionReason),
      "客人提供新電話"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.saveCorrection })
    );
    expect(onCorrectGuest).toHaveBeenCalledWith(GUEST_ROW, {
      name: "新訪客",
      phone: "92345678",
      reason: "客人提供新電話",
    });
  });

  test("masks member phones for the printable sheet", () => {
    render(
      <AttendanceRoster
        event={EVENT}
        rows={[MEMBER_ROW]}
        memberDirectory={{
          "member-1": {
            user_id: "member-1",
            name: "會員一",
            phone: "9123 4567",
            qr_code_string: null,
          },
        }}
        onPrint={vi.fn()}
      />
    );

    expect(
      screen.getByText(COPY.attendance.maskedPhone("9123 4567"))
    ).toBeVisible();
    expect(
      screen.queryByText("9123 4567", { exact: true })
    ).not.toBeInTheDocument();
  });
});
