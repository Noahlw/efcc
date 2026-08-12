import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { RpcError } from "@/lib/api";
import { COPY } from "@/lib/copy";
import type { Program, ScheduleRule } from "@/lib/programs/program-api";
import { ProgramSettings } from "@/lib/programs/program-settings";

const mocks = vi.hoisted(() => ({
  updateProgram: vi.fn(),
  listScheduleRules: vi.fn(),
  createScheduleRule: vi.fn(),
  updateScheduleRule: vi.fn(),
  createScheduleException: vi.fn(),
  deleteScheduleException: vi.fn(),
}));

vi.mock(import("@/lib/programs/program-api"), () => ({
  updateProgram: mocks.updateProgram,
  listScheduleRules: mocks.listScheduleRules,
  createScheduleRule: mocks.createScheduleRule,
  updateScheduleRule: mocks.updateScheduleRule,
  createScheduleException: mocks.createScheduleException,
  deleteScheduleException: mocks.deleteScheduleException,
}));

const recurringProgram: Program = {
  program_id: "program-1",
  department_id: "dept-1",
  name: "查經小組",
  description: "週三晚上的門徒訓練查經。",
  category: "門徒訓練",
  behavior_type: "Recurring",
  lifecycle: "Active",
  discoverability: "Listed",
  enrollment_mode: "MemberRequest",
  check_in_token: "secret-token",
  check_in_opens_at_minutes_before_start: 15,
  check_in_closes_at_minutes_after_end: 0,
  display_order: 2,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  capabilities: {
    manage: true,
    publish: true,
    enroll: false,
    leader_assign: false,
  },
};

const oneOffProgram: Program = {
  ...recurringProgram,
  program_id: "program-oneoff",
  name: "退修日",
  behavior_type: "OneOff",
};

const rule: ScheduleRule = {
  rule_id: "rule-1",
  program_id: "program-1",
  recurrence: "WEEKLY",
  day_of_week: 3,
  month_day: null,
  start_time: "19:30",
  end_time: "21:00",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function updatedProgram(overrides: Partial<Program> = {}): Program {
  return { ...recurringProgram, ...overrides };
}

beforeEach(() => {
  mocks.updateProgram.mockReset();
  mocks.listScheduleRules.mockReset();
  mocks.createScheduleRule.mockReset();
  mocks.updateScheduleRule.mockReset();
  mocks.createScheduleException.mockReset();
  mocks.deleteScheduleException.mockReset();
  mocks.listScheduleRules.mockResolvedValue({ rules: [rule] });
  mocks.updateProgram.mockResolvedValue({ program: updatedProgram() });
  mocks.createScheduleRule.mockResolvedValue({ rule });
  mocks.updateScheduleRule.mockResolvedValue({ rule });
  mocks.createScheduleException.mockResolvedValue({
    exception: {
      exception_id: "exception-1",
      rule_id: "rule-1",
      override_date: "2026-09-02",
      action: "CANCEL",
      new_start_time: null,
      new_end_time: null,
      created_at: "2026-01-01T00:00:00.000Z",
    },
  });
  mocks.deleteScheduleException.mockResolvedValue({ deleted: true });
});

afterEach(() => {
  cleanup();
});

describe(ProgramSettings, () => {
  test("shows four scope-owned groups and keeps Event generation out of Settings", async () => {
    render(<ProgramSettings program={recurringProgram} onTaskChange={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: COPY.programs.settingsBasics })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: COPY.programs.settingsEnrollment,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: COPY.programs.settingsSchedule })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: COPY.programs.settingsAttendance })
    ).toBeInTheDocument();
    await expect(
      screen.findByText(`${COPY.programs.ruleWeekly} ${COPY.programs.weekdayWednesday}`)
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.generateEvents })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("secret-token")).not.toBeInTheDocument();
  });

  test("does not render editable schedule controls for a OneOff Program", async () => {
    render(<ProgramSettings program={oneOffProgram} onTaskChange={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: COPY.programs.settingsSchedule })
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.settingsScheduleOneOff)
    ).toBeInTheDocument();
    expect(mocks.listScheduleRules).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: COPY.programs.addRule })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: COPY.programs.startTime })
    ).not.toBeInTheDocument();
  });

  test("saves Basics immediately and confirms the resulting state", async () => {
    const user = userEvent.setup();
    mocks.updateProgram.mockResolvedValueOnce({
      program: updatedProgram({ name: "更新後小組", display_order: 4 }),
    });
    render(<ProgramSettings program={recurringProgram} onTaskChange={vi.fn()} />);

    const name = screen.getByRole("textbox", { name: COPY.programs.programName });
    await user.clear(name);
    await user.type(name, "更新後小組");
    await user.clear(
      screen.getByRole("spinbutton", {
        name: COPY.programs.programDisplayOrder,
      })
    );
    await user.type(
      screen.getByRole("spinbutton", {
        name: COPY.programs.programDisplayOrder,
      }),
      "4"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.settingsSaveBasics })
    );

    await waitFor(() =>
      expect(mocks.updateProgram).toHaveBeenCalledWith("program-1", {
        name: "更新後小組",
        description: "週三晚上的門徒訓練查經。",
        category: "門徒訓練",
        display_order: 4,
      })
    );
    await expect(
      screen.findByText(COPY.programs.settingsSaved)
    ).resolves.toBeInTheDocument();
  });

  test("explains and confirms consequential enrollment changes", async () => {
    const user = userEvent.setup();
    render(<ProgramSettings program={recurringProgram} onTaskChange={vi.fn()} />);

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: COPY.programs.discoverabilityListed,
      }),
      "Unlisted"
    );
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.settingsSaveEnrollment,
      })
    );

    expect(
      screen.getByRole("alert", { name: COPY.programs.settingsConfirmEnrollment })
    ).toBeInTheDocument();
    expect(mocks.updateProgram).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.settingsConfirmChange,
      })
    );
    await waitFor(() =>
      expect(mocks.updateProgram).toHaveBeenCalledWith("program-1", {
        discoverability: "Unlisted",
        enrollment_mode: "MemberRequest",
      })
    );
  });

  test("saves Attendance defaults without exposing the Program token", async () => {
    const user = userEvent.setup();
    mocks.updateProgram.mockResolvedValueOnce({
      program: updatedProgram({
        check_in_opens_at_minutes_before_start: 30,
        check_in_closes_at_minutes_after_end: 10,
      }),
    });
    render(<ProgramSettings program={recurringProgram} onTaskChange={vi.fn()} />);

    await user.clear(
      screen.getByRole("spinbutton", {
        name: COPY.programs.settingsAttendanceOpens,
      })
    );
    await user.type(
      screen.getByRole("spinbutton", {
        name: COPY.programs.settingsAttendanceOpens,
      }),
      "30"
    );
    await user.clear(
      screen.getByRole("spinbutton", {
        name: COPY.programs.settingsAttendanceCloses,
      })
    );
    await user.type(
      screen.getByRole("spinbutton", {
        name: COPY.programs.settingsAttendanceCloses,
      }),
      "10"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.settingsSaveAttendance })
    );

    await waitFor(() =>
      expect(mocks.updateProgram).toHaveBeenCalledWith("program-1", {
        check_in_opens_at_minutes_before_start: 30,
        check_in_closes_at_minutes_after_end: 10,
      })
    );
    expect(screen.queryByText("secret-token")).not.toBeInTheDocument();
  });

  test("preserves edited Basics input when the server rejects the mutation", async () => {
    const user = userEvent.setup();
    mocks.updateProgram.mockRejectedValueOnce(
      new RpcError({ code: "CONFLICT", status: 409 })
    );
    render(<ProgramSettings program={recurringProgram} onTaskChange={vi.fn()} />);

    const name = screen.getByRole("textbox", { name: COPY.programs.programName });
    await user.clear(name);
    await user.type(name, "尚未確認的名稱");
    await user.click(
      screen.getByRole("button", { name: COPY.programs.settingsSaveBasics })
    );

    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      COPY.programs.programConflict
    );
    expect(name).toHaveValue("尚未確認的名稱");
  });

  test("hides groups when the server grants no management capability", () => {
    render(
      <ProgramSettings
        program={{
          ...recurringProgram,
          capabilities: { ...recurringProgram.capabilities, manage: false },
        }}
        onTaskChange={vi.fn()}
      />
    );

    expect(
      screen.getByText(COPY.programs.settingsNoManagement)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: COPY.programs.settingsBasics })
    ).not.toBeInTheDocument();
    expect(mocks.listScheduleRules).not.toHaveBeenCalled();
  });
});
