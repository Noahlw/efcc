import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  listScheduleExceptions: vi.fn(),
  createScheduleException: vi.fn(),
  deleteScheduleException: vi.fn(),
}));

vi.mock(import("@/lib/programs/program-api"), () => ({
  updateProgram: mocks.updateProgram,
  listScheduleRules: mocks.listScheduleRules,
  createScheduleRule: mocks.createScheduleRule,
  updateScheduleRule: mocks.updateScheduleRule,
  listScheduleExceptions: mocks.listScheduleExceptions,
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
  location: null,
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
  mocks.listScheduleExceptions.mockReset();
  mocks.createScheduleException.mockReset();
  mocks.deleteScheduleException.mockReset();
  mocks.listScheduleRules.mockResolvedValue({ rules: [rule] });
  mocks.updateProgram.mockResolvedValue({ program: updatedProgram() });
  mocks.createScheduleRule.mockResolvedValue({ rule });
  mocks.updateScheduleRule.mockResolvedValue({ rule });
  mocks.listScheduleExceptions.mockResolvedValue({ exceptions: [] });
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
    render(
      <ProgramSettings program={recurringProgram} onTaskChange={vi.fn()} />
    );

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
      screen.findByText(
        `${COPY.programs.ruleWeekly} ${COPY.programs.weekdayWednesday}`
      )
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
    render(
      <ProgramSettings program={recurringProgram} onTaskChange={vi.fn()} />
    );

    const name = screen.getByRole("textbox", {
      name: COPY.programs.programName,
    });
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
    render(
      <ProgramSettings program={recurringProgram} onTaskChange={vi.fn()} />
    );

    await user.click(
      screen.getByRole("combobox", {
        name: COPY.programs.discoverabilityListed,
      })
    );
    await user.click(
      screen.getByRole("option", {
        name: COPY.programs.discoverabilityUnlisted,
      })
    );
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.settingsSaveEnrollment,
      })
    );

    expect(
      screen.getByRole("alert", {
        name: COPY.programs.settingsConfirmEnrollment,
      })
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
    render(
      <ProgramSettings program={recurringProgram} onTaskChange={vi.fn()} />
    );

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
    render(
      <ProgramSettings program={recurringProgram} onTaskChange={vi.fn()} />
    );

    const name = screen.getByRole("textbox", {
      name: COPY.programs.programName,
    });
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

  test("withholds schedule controls when the events module is disabled", async () => {
    render(
      <ProgramSettings
        program={recurringProgram}
        eventsEnabled={false}
        onTaskChange={vi.fn()}
      />
    );

    expect(
      screen.getByRole("heading", { name: COPY.programs.settingsSchedule })
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.settingsScheduleUnavailable)
    ).toBeInTheDocument();
    expect(mocks.listScheduleRules).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: COPY.programs.addRule })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: COPY.programs.startTime })
    ).not.toBeInTheDocument();
  });

  test("keeps new-rule input when the schedule-rule mutation fails", async () => {
    const user = userEvent.setup();
    mocks.createScheduleRule.mockRejectedValueOnce(
      new RpcError({ code: "CONFLICT", status: 409 })
    );
    render(
      <ProgramSettings program={recurringProgram} onTaskChange={vi.fn()} />
    );
    await screen.findByText(
      `${COPY.programs.ruleWeekly} ${COPY.programs.weekdayWednesday}`
    );

    await user.type(screen.getByLabelText(COPY.programs.startTime), "20:00");
    await user.type(screen.getByLabelText(COPY.programs.endTime), "21:30");
    await user.click(
      screen.getByRole("button", { name: COPY.programs.addRule })
    );

    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      COPY.programs.programConflict
    );
    expect(screen.getByLabelText(COPY.programs.startTime)).toHaveValue("20:00");
    expect(screen.getByLabelText(COPY.programs.endTime)).toHaveValue("21:30");
    expect(
      screen.queryByText(COPY.programs.settingsSaved)
    ).not.toBeInTheDocument();
  });

  test("clears new-rule input only after a confirmed schedule-rule save", async () => {
    const user = userEvent.setup();
    render(
      <ProgramSettings program={recurringProgram} onTaskChange={vi.fn()} />
    );
    await screen.findByText(
      `${COPY.programs.ruleWeekly} ${COPY.programs.weekdayWednesday}`
    );

    await user.type(screen.getByLabelText(COPY.programs.startTime), "19:00");
    await user.type(screen.getByLabelText(COPY.programs.endTime), "20:30");
    await user.click(
      screen.getByRole("button", { name: COPY.programs.addRule })
    );

    await expect(
      screen.findByText(COPY.programs.settingsSaved)
    ).resolves.toBeInTheDocument();
    expect(screen.getByLabelText(COPY.programs.startTime)).toHaveValue("");
    expect(screen.getByLabelText(COPY.programs.endTime)).toHaveValue("");
  });

  test("keeps rule-edit input when the rule-edit mutation fails", async () => {
    const user = userEvent.setup();
    mocks.updateScheduleRule.mockRejectedValueOnce(
      new RpcError({ code: "CONFLICT", status: 409 })
    );
    render(
      <ProgramSettings program={recurringProgram} onTaskChange={vi.fn()} />
    );
    await screen.findByText(
      `${COPY.programs.ruleWeekly} ${COPY.programs.weekdayWednesday}`
    );

    const row = screen
      .getByText(
        `${COPY.programs.ruleWeekly} ${COPY.programs.weekdayWednesday}`
      )
      .closest("li") as HTMLElement;
    await user.click(
      within(row).getByRole("button", { name: COPY.programs.settingsRuleEdit })
    );
    const startTime = within(row).getByLabelText(COPY.programs.startTime);
    await user.clear(startTime);
    await user.type(startTime, "20:00");
    await user.click(
      within(row).getByRole("button", { name: COPY.programs.settingsRuleSave })
    );

    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      COPY.programs.programConflict
    );
    expect(within(row).getByLabelText(COPY.programs.startTime)).toHaveValue(
      "20:00"
    );
    expect(
      within(row).getByRole("button", { name: COPY.programs.settingsRuleSave })
    ).toBeInTheDocument();
    expect(
      within(row).queryByRole("button", {
        name: COPY.programs.settingsRuleEdit,
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(COPY.programs.settingsSaved)
    ).not.toBeInTheDocument();
  });

  test("keeps exception input when the exception mutation fails", async () => {
    const user = userEvent.setup();
    mocks.createScheduleException.mockRejectedValueOnce(
      new RpcError({ code: "CONFLICT", status: 409 })
    );
    render(
      <ProgramSettings program={recurringProgram} onTaskChange={vi.fn()} />
    );
    await screen.findByText(
      `${COPY.programs.ruleWeekly} ${COPY.programs.weekdayWednesday}`
    );

    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.settingsRuleAddException,
      })
    );
    await user.type(
      screen.getByLabelText(COPY.programs.settingsExceptionDate),
      "2026-08-13"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.settingsExceptionSave })
    );

    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      COPY.programs.programConflict
    );
    expect(
      screen.getByLabelText(COPY.programs.settingsExceptionDate)
    ).toHaveValue("2026-08-13");
    expect(
      screen.getByRole("button", { name: COPY.programs.settingsExceptionSave })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.programs.settingsSaved)
    ).not.toBeInTheDocument();
  });

  test("shows accurate copy for a duplicate schedule exception", async () => {
    const user = userEvent.setup();
    mocks.createScheduleException.mockRejectedValueOnce(
      new RpcError({
        code: "CONFLICT",
        status: 409,
        detail:
          "Schedule exception already exists for rule rule-1 on 2026-08-13",
      })
    );
    render(
      <ProgramSettings program={recurringProgram} onTaskChange={vi.fn()} />
    );
    await screen.findByText(
      `${COPY.programs.ruleWeekly} ${COPY.programs.weekdayWednesday}`
    );

    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.settingsRuleAddException,
      })
    );
    await user.type(
      screen.getByLabelText(COPY.programs.settingsExceptionDate),
      "2026-08-13"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.settingsExceptionSave })
    );

    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      COPY.programs.settingsExceptionDuplicate
    );
    expect(
      screen.queryByText(COPY.programs.programConflict)
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText(COPY.programs.settingsExceptionDate)
    ).toHaveValue("2026-08-13");
  });

  test("shows existing schedule exceptions and lets a manager remove one", async () => {
    const user = userEvent.setup();
    mocks.listScheduleExceptions.mockResolvedValueOnce({
      exceptions: [
        {
          exception_id: "exception-existing",
          rule_id: "rule-1",
          override_date: "2026-08-13",
          action: "CANCEL",
          new_start_time: null,
          new_end_time: null,
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    render(
      <ProgramSettings program={recurringProgram} onTaskChange={vi.fn()} />
    );

    await expect(
      screen.findByText(`2026-08-13 · ${COPY.programs.settingsExceptionCancel}`)
    ).resolves.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: `${COPY.programs.settingsExceptionRestore} 2026-08-13`,
      })
    );
    expect(mocks.deleteScheduleException).toHaveBeenCalledWith(
      "program-1",
      "rule-1",
      "exception-existing"
    );
  });
});
