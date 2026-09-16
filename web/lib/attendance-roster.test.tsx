import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

const POST_EVENT: AttendanceEvent = {
  ...EVENT,
  event_id: "evt-post",
  starts_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
  ends_at: new Date(Date.now() - 60 * 60_000).toISOString(),
  check_in_window_opens_at: new Date(
    Date.now() - 3 * 60 * 60_000
  ).toISOString(),
  check_in_window_closes_at: new Date(Date.now() - 30 * 60_000).toISOString(),
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

  test("Arrow keys update the live roster filter and rendered panel", async () => {
    const user = userEvent.setup();
    const notYetRow: AttendanceExpectedRow = {
      ...EXPECTED_ROW,
      member_user_id: "member-not-yet-keyboard",
      member_name: "鍵盤未簽到會員",
      state: "Not Yet",
    };
    const checkedInRow: AttendanceExpectedRow = {
      ...EXPECTED_ROW,
      expected_attendance_id: "expected-checked-in-keyboard",
      enrollment_id: "enrollment-checked-in-keyboard",
      member_user_id: "member-checked-in-keyboard",
      member_name: "鍵盤已簽到會員",
      state: "Present",
      attendance: MEMBER_ROW,
    };
    render(
      <AttendanceRoster
        event={EVENT}
        rows={[MEMBER_ROW]}
        expectedRows={[notYetRow, checkedInRow]}
      />
    );

    const notYetTab = screen.getByRole("tab", { name: /未簽到 \(1\)/u });
    notYetTab.focus();
    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("tab", { name: /已簽到 \(1\)/u })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByText("鍵盤已簽到會員")).toBeVisible();
    expect(screen.queryByText("鍵盤未簽到會員")).not.toBeInTheDocument();
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

  test("post-event roster defaults to Absent and keeps Present, Excused, and Guest views distinct", async () => {
    const user = userEvent.setup();
    const presentRow: AttendanceExpectedRow = {
      ...EXPECTED_ROW,
      expected_attendance_id: "expected-present",
      enrollment_id: "enrollment-present",
      member_name: "已出席會員",
      state: "Present",
      attendance: { ...MEMBER_ROW, event_id: POST_EVENT.event_id },
    };
    const excusedRow: AttendanceExpectedRow = {
      ...EXPECTED_ROW,
      expected_attendance_id: "expected-excused",
      enrollment_id: "enrollment-excused",
      member_name: "請假會員",
      state: "Excused",
      disposition: {
        disposition_id: "disp-1",
        event_id: POST_EVENT.event_id,
        enrollment_id: "enrollment-excused",
        member_user_id: "member-3",
        disposition: "Excused",
        reason: "家庭事務",
        recorded_by: "admin-1",
        recorded_at: "2026-08-13T10:00:00.000Z",
      },
    };
    const absentRow = {
      ...EXPECTED_ROW,
      event_id: POST_EVENT.event_id,
      member_name: "缺席會員",
    };
    const guestRow = { ...GUEST_ROW, event_id: POST_EVENT.event_id };
    render(
      <AttendanceRoster
        event={POST_EVENT}
        rows={[presentRow.attendance as AttendanceRow, guestRow]}
        expectedRows={[absentRow, presentRow, excusedRow]}
        counts={{
          expected: 3,
          present: 1,
          not_yet: 0,
          absent: 1,
          excused: 1,
          guests: 1,
        }}
      />
    );

    const absentTab = await screen.findByRole("tab", {
      name: /缺席 \(1\)/u,
    });
    expect(absentTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("缺席會員")).toBeVisible();
    expect(screen.queryByText("已出席會員")).not.toBeInTheDocument();
    expect(screen.queryByText("請假會員")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /已出席 \(1\)/u }));
    expect(screen.getByText("已出席會員")).toBeVisible();
    expect(screen.queryByText("缺席會員")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /請假 \(1\)/u }));
    expect(screen.getByText("請假會員")).toBeVisible();
    expect(screen.queryByText("缺席會員")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /訪客 \(1\)/u }));
    expect(screen.getByText("舊訪客")).toBeVisible();
    expect(screen.queryByText("缺席會員")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /全部 \(4\)/u }));
    expect(screen.getByText("缺席會員")).toBeVisible();
    expect(screen.getByText("已出席會員")).toBeVisible();
    expect(screen.getByText("請假會員")).toBeVisible();
    expect(screen.getByText("舊訪客")).toBeVisible();
  });

  test("Arrow keys switch post-event Absent, Present, Excused, and Guest panels", async () => {
    const user = userEvent.setup();
    const presentRow: AttendanceExpectedRow = {
      ...EXPECTED_ROW,
      expected_attendance_id: "expected-keyboard-present",
      enrollment_id: "enrollment-keyboard-present",
      member_name: "鍵盤已出席會員",
      state: "Present",
      attendance: { ...MEMBER_ROW, event_id: POST_EVENT.event_id },
    };
    const excusedRow: AttendanceExpectedRow = {
      ...EXPECTED_ROW,
      expected_attendance_id: "expected-keyboard-excused",
      enrollment_id: "enrollment-keyboard-excused",
      member_name: "鍵盤請假會員",
      state: "Excused",
      disposition: {
        disposition_id: "disp-keyboard",
        event_id: POST_EVENT.event_id,
        enrollment_id: "enrollment-keyboard-excused",
        member_user_id: "member-3",
        disposition: "Excused",
        reason: "家庭事務",
        recorded_by: "admin-1",
        recorded_at: "2026-08-13T10:00:00.000Z",
      },
    };
    const absentRow = {
      ...EXPECTED_ROW,
      event_id: POST_EVENT.event_id,
      member_name: "鍵盤缺席會員",
    };
    const guestRow = { ...GUEST_ROW, event_id: POST_EVENT.event_id };
    render(
      <AttendanceRoster
        event={POST_EVENT}
        rows={[presentRow.attendance as AttendanceRow, guestRow]}
        expectedRows={[absentRow, presentRow, excusedRow]}
      />
    );

    const absentTab = screen.getByRole("tab", { name: /缺席 \(1\)/u });
    expect(absentTab).toHaveAttribute("aria-selected", "true");
    absentTab.focus();

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: /請假 \(1\)/u })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByText("鍵盤請假會員")).toBeVisible();

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: /已出席 \(1\)/u })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByText("鍵盤已出席會員")).toBeVisible();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /請假 \(1\)/u })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /缺席 \(1\)/u })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /訪客 \(1\)/u })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByText("舊訪客")).toBeVisible();
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
    const onExcuse = vi.fn();
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
        onExcuse={onExcuse}
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
    expect(
      screen.queryByRole("button", { name: /標記請假/u })
    ).not.toBeInTheDocument();
  });

  test("restores focus to the expected member after closing detail", async () => {
    const user = userEvent.setup();
    render(
      <AttendanceRoster event={EVENT} rows={[]} expectedRows={[EXPECTED_ROW]} />
    );

    const opener = screen.getByRole("button", { name: "會員三" });
    opener.focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(opener).toHaveFocus());
  });

  test("restores focus to the guest after closing guest detail", async () => {
    const user = userEvent.setup();
    render(<AttendanceRoster event={EVENT} rows={[GUEST_ROW]} />);

    const opener = screen.getByRole("button", { name: "舊訪客" });
    opener.focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(opener).toHaveFocus());
  });

  test("restores expected-row focus after detail-to-void transition", async () => {
    const user = userEvent.setup();
    const onVoid = vi.fn().mockResolvedValue(true);
    const presentRow: AttendanceExpectedRow = {
      ...EXPECTED_ROW,
      state: "Present",
      attendance: MEMBER_ROW,
    };
    render(
      <AttendanceRoster
        event={EVENT}
        rows={[MEMBER_ROW]}
        expectedRows={[presentRow]}
        onVoid={onVoid}
      />
    );

    await user.click(screen.getByRole("tab", { name: /已簽到 \(1\)/u }));
    const opener = screen.getByRole("button", { name: "會員三" });
    await user.click(opener);
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.voidAttendance })
    );
    await user.type(
      screen.getByLabelText(COPY.attendance.voidReason),
      "更正簽到"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.voidConfirm })
    );

    await waitFor(() =>
      expect(onVoid).toHaveBeenCalledWith(MEMBER_ROW, "更正簽到")
    );
    await waitFor(() => expect(opener).toHaveFocus());
  });

  test("restores expected-row focus after detail-to-excuse transition", async () => {
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

    const opener = screen.getByRole("button", { name: "會員三" });
    await user.click(opener);
    await user.click(screen.getByRole("button", { name: "標記請假" }));
    await user.click(screen.getByRole("combobox", { name: "請假原因" }));
    await user.click(screen.getByRole("option", { name: "家庭事務" }));
    await user.click(screen.getByRole("button", { name: "確認請假" }));

    await waitFor(() =>
      expect(onExcuse).toHaveBeenCalledWith(EXPECTED_ROW, "家庭事務")
    );
    await waitFor(() => expect(opener).toHaveFocus());
  });

  test("restores guest focus after detail-to-correction transition", async () => {
    const user = userEvent.setup();
    const onCorrectGuest = vi.fn().mockResolvedValue(true);
    render(
      <AttendanceRoster
        event={EVENT}
        rows={[GUEST_ROW]}
        onCorrectGuest={onCorrectGuest}
      />
    );

    const opener = screen.getByRole("button", { name: "舊訪客" });
    await user.click(opener);
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.correctGuest })
    );
    await user.type(
      screen.getByLabelText(COPY.attendance.correctionReason),
      "更正訪客資料"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.saveCorrection })
    );

    await waitFor(() =>
      expect(onCorrectGuest).toHaveBeenCalledWith(GUEST_ROW, {
        name: GUEST_ROW.guest_name,
        phone: GUEST_ROW.guest_phone,
        reason: "更正訪客資料",
      })
    );
    await waitFor(() => expect(opener).toHaveFocus());
  });

  test("opens guest additional history from a 44px name target and preserves guest actions", async () => {
    const user = userEvent.setup();
    render(
      <AttendanceRoster
        event={EVENT}
        rows={[GUEST_ROW]}
        onVoid={vi.fn()}
        onCorrectGuest={vi.fn()}
      />
    );

    const guestName = screen.getByRole("button", { name: "舊訪客" });
    expect(guestName).toHaveClass("min-h-11");
    await user.click(guestName);
    expect(
      screen.getByRole("heading", {
        name: COPY.attendance.participantDetailTitle,
      })
    ).toBeVisible();
    expect(
      screen.getByText(COPY.attendance.participantDetailHistory)
    ).toBeVisible();
    expect(screen.queryByText("guest_manual_code")).not.toBeInTheDocument();
    expect(screen.getByText("訪客手動代碼")).toBeVisible();
    expect(
      screen.getByRole("button", { name: COPY.attendance.voidAttendance })
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: COPY.attendance.correctGuest })
    );
    expect(
      screen.getByLabelText(COPY.attendance.correctionReason)
    ).toBeVisible();
  });

  test("omits voided member history from Guest/additional rows after re-check-in", async () => {
    const activeRecheckIn: AttendanceRow = {
      ...MEMBER_ROW,
      attendance_id: "att-recheck-in",
      member_user_id: EXPECTED_ROW.member_user_id,
      checked_in_at: "2026-08-13T11:50:00.000Z",
    };
    const voidedHistory: AttendanceRow = {
      ...activeRecheckIn,
      attendance_id: "att-old-voided",
      status: "Voided",
      void_reason: "重複簽到",
      voided_at: "2026-08-13T11:40:00.000Z",
    };
    const expectedWithRecheckIn: AttendanceExpectedRow = {
      ...EXPECTED_ROW,
      state: "Present",
      attendance: activeRecheckIn,
    };
    const user = userEvent.setup();
    render(
      <AttendanceRoster
        event={EVENT}
        rows={[activeRecheckIn, voidedHistory, GUEST_ROW]}
        expectedRows={[expectedWithRecheckIn]}
      />
    );

    await user.click(screen.getByRole("tab", { name: /全部 \(2\)/u }));
    expect(screen.getByText("會員三")).toBeVisible();
    expect(screen.getByText("舊訪客")).toBeVisible();
    expect(screen.queryByText("重複簽到")).not.toBeInTheDocument();
    expect(screen.queryByText("att-old-voided")).not.toBeInTheDocument();
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
