import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import type {
  AttendanceEvent,
  AttendanceEventSummary,
  AttendanceExpectedRow,
  AttendanceRow,
} from "@/lib/attendance";
import {
  AttendanceChooser,
  AttendanceRoster,
} from "@/lib/attendance-operator-panel";
import { COPY } from "@/lib/copy";

const EVENT_WINDOW_OPENS_AT = new Date(Date.now() - 30 * 60_000).toISOString();
const EVENT_WINDOW_CLOSES_AT = new Date(Date.now() + 30 * 60_000).toISOString();

const EVENT: AttendanceEvent = {
  event_id: "evt-roster",
  program_id: "program-roster",
  program_name: "週六團契",
  name: "週六聚會",
  location: "主堂",
  starts_at: "2026-08-13T11:30:00.000Z",
  ends_at: "2026-08-13T13:00:00.000Z",
  manual_check_in_code: "ATT1234",
  check_in_window_opens_at: EVENT_WINDOW_OPENS_AT,
  check_in_window_closes_at: EVENT_WINDOW_CLOSES_AT,
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

const EXPECTED_ROW: AttendanceExpectedRow = {
  expected_attendance_id: "expected-1",
  event_id: EVENT.event_id,
  enrollment_id: "enrollment-1",
  member_user_id: "member-3",
  member_name: "會員三",
  member_phone: "95556666",
  source: "event_start",
  state: "Absent",
  attendance: null,
  disposition: null,
};

afterEach(() => cleanup());

describe(AttendanceChooser, () => {
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

describe(AttendanceRoster, () => {
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

  test("defaults to not-yet and switches between checked-in and all", async () => {
    const user = userEvent.setup();
    const notYetRow: AttendanceExpectedRow = {
      ...EXPECTED_ROW,
      member_user_id: "member-not-yet",
      member_name: "尚未簽到會員",
      state: "Not Yet",
    };
    const checkedInRow: AttendanceExpectedRow = {
      ...EXPECTED_ROW,
      expected_attendance_id: "expected-checked-in",
      enrollment_id: "enrollment-checked-in",
      member_user_id: "member-checked-in",
      member_name: "已簽到會員",
      state: "Present",
      attendance: MEMBER_ROW,
    };
    render(
      <AttendanceRoster
        event={EVENT}
        rows={[MEMBER_ROW]}
        expectedRows={[notYetRow, checkedInRow]}
        counts={{
          expected: 2,
          present: 1,
          not_yet: 1,
          absent: 0,
          excused: 0,
          guests: 0,
        }}
      />
    );

    expect(screen.getByText("尚未簽到會員")).toBeVisible();
    expect(screen.queryByText("已簽到會員")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /已簽到 \(1\)/u }));
    expect(screen.getByText("已簽到會員")).toBeVisible();
    expect(screen.queryByText("尚未簽到會員")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /全部 \(2\)/u }));
    expect(screen.getByText("尚未簽到會員")).toBeVisible();
  });

  test("keeps filters available when nobody is pending", async () => {
    const user = userEvent.setup();
    const presentRow: AttendanceExpectedRow = {
      ...EXPECTED_ROW,
      member_name: "已完成會員",
      state: "Present",
      attendance: MEMBER_ROW,
    };
    render(
      <AttendanceRoster
        event={EVENT}
        rows={[MEMBER_ROW]}
        expectedRows={[presentRow]}
        counts={{
          expected: 1,
          present: 1,
          not_yet: 0,
          absent: 0,
          excused: 0,
          guests: 0,
        }}
      />
    );

    expect(screen.getByRole("tab", { name: /未簽到 \(0\)/u })).toBeVisible();
    expect(screen.getByText(COPY.attendance.rosterFilterEmpty)).toBeVisible();

    await user.click(screen.getByRole("tab", { name: /已簽到 \(1\)/u }));
    expect(screen.getByText("已完成會員")).toBeVisible();
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

  test("renders durable expected state and saves a structured Excused reason", async () => {
    const user = userEvent.setup();
    const onExcuse = vi
      .fn<(row: AttendanceExpectedRow, reason: string) => Promise<boolean>>()
      .mockResolvedValue(true);
    render(
      <AttendanceRoster
        event={EVENT}
        rows={[]}
        expectedRows={[EXPECTED_ROW]}
        counts={{
          expected: 1,
          present: 0,
          not_yet: 0,
          absent: 1,
          excused: 0,
          guests: 0,
        }}
        onExcuse={onExcuse}
      />
    );

    expect(screen.getByText("缺席")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "標記請假" }));
    await user.click(screen.getByRole("button", { name: "確認請假" }));
    expect(onExcuse).not.toHaveBeenCalled();

    await user.click(screen.getByRole("combobox", { name: "請假原因" }));
    await user.click(screen.getByRole("option", { name: "家庭事務" }));
    await user.click(screen.getByRole("button", { name: "確認請假" }));
    expect(onExcuse).toHaveBeenCalledWith(EXPECTED_ROW, "家庭事務");
  });

  test("requires details when the Other Excused reason is selected", async () => {
    const user = userEvent.setup();
    const onExcuse = vi.fn().mockResolvedValue(true);
    render(
      <AttendanceRoster
        event={EVENT}
        rows={[]}
        expectedRows={[EXPECTED_ROW]}
        onExcuse={onExcuse}
      />
    );

    await user.click(screen.getByRole("button", { name: "標記請假" }));
    await user.click(screen.getByRole("combobox", { name: "請假原因" }));
    await user.click(screen.getByRole("option", { name: "其他" }));
    const confirm = screen.getByRole("button", { name: "確認請假" });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText(/補充說明/u), "需要照顧家人");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onExcuse).toHaveBeenCalledWith(EXPECTED_ROW, "其他：需要照顧家人");
  });

  test("opens participant detail with status, history, and context actions", async () => {
    const user = userEvent.setup();
    const onVoid = vi.fn();
    render(
      <AttendanceRoster
        event={EVENT}
        rows={[]}
        expectedRows={[
          {
            ...EXPECTED_ROW,
            state: "Present",
            attendance: MEMBER_ROW,
          },
        ]}
        onVoid={onVoid}
      />
    );

    await user.click(screen.getByRole("tab", { name: /已簽到 \(1\)/u }));
    await user.click(screen.getByRole("button", { name: "會員三" }));
    expect(screen.getByRole("heading", { name: "參與者詳情" })).toBeVisible();
    expect(
      screen.getByText("週六團契 · 週六聚會 · 2026/08/13 19:30")
    ).toBeVisible();
    expect(screen.getAllByText("已出席")).not.toHaveLength(0);
    expect(screen.getByText(/簽到時間：/u)).toBeVisible();
    expect(
      screen.getByRole("button", { name: COPY.attendance.voidAttendance })
    ).toBeVisible();
  });

  test("keeps the roster read-only while offline and offers the last-known state", () => {
    render(
      <AttendanceRoster
        event={EVENT}
        rows={[MEMBER_ROW]}
        readOnly
        offline
        lastUpdatedAt={Date.parse("2026-08-13T11:40:00.000Z")}
        onRefresh={vi.fn()}
        onVoid={vi.fn()}
      />
    );

    expect(screen.getByText(COPY.attendance.rosterOffline)).toBeVisible();
    expect(
      screen.getByRole("button", { name: COPY.attendance.voidAttendance })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: COPY.management.retry })
    ).toBeDisabled();
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
