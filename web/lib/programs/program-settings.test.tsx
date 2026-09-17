import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { RpcError } from "@/lib/api";
import { COPY } from "@/lib/copy";
import type { Program, ScheduleRule } from "@/lib/programs/program-api";
import { ProgramSettings, SettingsHub } from "@/lib/programs/program-settings";
import type { ProgramSettingsSection } from "@/lib/programs/program-settings";
import { hkTodayWallDate } from "@/lib/programs/recurrence";

import {
  clearManagementDraftsForEntity,
  readManagementDraft,
  writeManagementDraft,
} from "./management-draft";
import {
  clearWorkspaceMutationRecovery,
  readWorkspaceMutationRecovery,
  writeWorkspaceMutationRecovery,
} from "./mutation-recovery";

const qrMocks = vi.hoisted(() => ({ qrDataUrl: vi.fn() }));

vi.mock(import("@/lib/qr"), () => ({ qrDataUrl: qrMocks.qrDataUrl }));

const mocks = vi.hoisted(() => ({
  updateProgram: vi.fn(),
  getProgramAttendanceArtifact: vi.fn(),
  rotateProgramAttendanceArtifact: vi.fn(),
  listScheduleRules: vi.fn(),
  createScheduleRule: vi.fn(),
  updateScheduleRule: vi.fn(),
  listScheduleExceptions: vi.fn(),
  createScheduleException: vi.fn(),
  deleteScheduleException: vi.fn(),
  isUnknownMutationOutcome: vi.fn<(error: unknown) => boolean>((error) => {
    const problem = (error as { problem?: { code?: string; status?: number } })
      .problem;
    return (
      problem === undefined ||
      problem.status === 0 ||
      problem.code === "NETWORK_ERROR" ||
      problem.code === "MALFORMED_RESPONSE" ||
      problem.code === "MALFORMED_REQUEST" ||
      problem.code === "UNAVAILABLE"
    );
  }),
}));

vi.mock(import("@/lib/programs/program-api"), () => ({
  updateProgram: mocks.updateProgram,
  getProgramAttendanceArtifact: mocks.getProgramAttendanceArtifact,
  rotateProgramAttendanceArtifact: mocks.rotateProgramAttendanceArtifact,
  listScheduleRules: mocks.listScheduleRules,
  createScheduleRule: mocks.createScheduleRule,
  updateScheduleRule: mocks.updateScheduleRule,
  listScheduleExceptions: mocks.listScheduleExceptions,
  createScheduleException: mocks.createScheduleException,
  deleteScheduleException: mocks.deleteScheduleException,
  isUnknownMutationOutcome: mocks.isUnknownMutationOutcome,
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
  mocks.getProgramAttendanceArtifact.mockReset();
  mocks.rotateProgramAttendanceArtifact.mockReset();
  mocks.listScheduleRules.mockReset();
  mocks.createScheduleRule.mockReset();
  mocks.updateScheduleRule.mockReset();
  mocks.listScheduleExceptions.mockReset();
  mocks.createScheduleException.mockReset();
  mocks.deleteScheduleException.mockReset();
  mocks.listScheduleRules.mockResolvedValue({ rules: [rule] });
  mocks.updateProgram.mockResolvedValue({ program: updatedProgram() });
  mocks.getProgramAttendanceArtifact.mockResolvedValue({
    artifact: {
      program_id: recurringProgram.program_id,
      program_name: recurringProgram.name,
      check_in_token: recurringProgram.check_in_token ?? "secret-token",
      can_rotate: false,
    },
  });
  mocks.rotateProgramAttendanceArtifact.mockResolvedValue({
    rotation: {
      program_id: recurringProgram.program_id,
      check_in_token: "rotated-token",
      idempotent: false,
    },
  });
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
  qrMocks.qrDataUrl.mockReset();
  qrMocks.qrDataUrl.mockResolvedValue("data:image/svg+xml,%3Csvg/%3E");
});

afterEach(() => {
  clearManagementDraftsForEntity(recurringProgram.program_id);
  clearWorkspaceMutationRecovery("program", {
    programId: recurringProgram.program_id,
  });
  clearWorkspaceMutationRecovery("schedule", {
    programId: recurringProgram.program_id,
  });
  cleanup();
});

describe(ProgramSettings, () => {
  test("focused editors expose dirty Save/Discard only after a draft changes", async () => {
    const user = userEvent.setup();
    render(
      <ProgramSettings
        program={recurringProgram}
        section="basics"
        onTaskChange={vi.fn()}
      />
    );

    expect(
      screen.queryByTestId("program-settings-dirty-actions")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.settingsSaveBasics })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.settingsDiscard })
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-screen-settings-dirty="true"]')
    ).not.toBeInTheDocument();

    const name = screen.getByRole("textbox", {
      name: COPY.programs.programName,
    });
    await user.clear(name);
    await user.type(name, "未儲存名稱");

    expect(screen.getByText(COPY.programs.settingsUnsaved)).toBeInTheDocument();
    const actions = screen.getByTestId("program-settings-dirty-actions");
    expect(actions).toHaveAttribute(
      "data-screen-foundation",
      "program-settings-dirty-actions"
    );
    const save = screen.getByRole("button", {
      name: COPY.programs.settingsSaveBasics,
    });
    const discard = screen.getByRole("button", {
      name: COPY.programs.settingsDiscard,
    });
    expect(save).toBeEnabled();
    expect(discard).toBeEnabled();
  });

  test("focused editor Discard restores the server baseline without mutating", async () => {
    const user = userEvent.setup();
    render(
      <ProgramSettings
        program={recurringProgram}
        section="basics"
        onTaskChange={vi.fn()}
      />
    );

    const name = screen.getByRole("textbox", {
      name: COPY.programs.programName,
    });
    await user.clear(name);
    await user.type(name, "未儲存名稱");
    const discard = screen.getByRole("button", {
      name: COPY.programs.settingsDiscard,
    });

    await user.click(discard);
    expect(name).toHaveValue(recurringProgram.name);
    expect(
      screen.queryByText(COPY.programs.settingsUnsaved)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("program-settings-dirty-actions")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.settingsSaveBasics })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.settingsDiscard })
    ).not.toBeInTheDocument();
    expect(mocks.updateProgram).not.toHaveBeenCalled();
  });

  test("reconciles an uncertain focused save before allowing further edits", async () => {
    const user = userEvent.setup();
    const onReload = vi
      .fn()
      .mockResolvedValue(updatedProgram({ name: "重試後名稱" }));
    mocks.updateProgram.mockRejectedValueOnce(
      new RpcError({ code: "NETWORK_ERROR", status: 0 })
    );
    render(
      <ProgramSettings
        program={recurringProgram}
        section="basics"
        onTaskChange={vi.fn()}
        onReload={onReload}
      />
    );

    const name = screen.getByRole("textbox", {
      name: COPY.programs.programName,
    });
    await user.clear(name);
    await user.type(name, "重試後名稱");
    await user.click(
      screen.getByRole("button", { name: COPY.programs.settingsSaveBasics })
    );

    await expect(
      screen.findByText(COPY.programs.programTransportAmbiguous)
    ).resolves.toBeInTheDocument();
    const reconcile = screen.getByRole("button", {
      name: COPY.programs.workspaceRetryRefresh,
    });
    expect(name).toHaveValue("重試後名稱");
    await user.click(reconcile);

    await waitFor(() => expect(mocks.updateProgram).toHaveBeenCalledTimes(1));
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(name).toHaveValue("重試後名稱");
    await expect(
      screen.findByText(COPY.programs.workspaceReconciled)
    ).resolves.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByTestId("program-settings-dirty-actions")
      ).not.toBeInTheDocument()
    );
  });

  test("restores a response-lost settings mutation after reload without replaying", async () => {
    const user = userEvent.setup();
    const onReload = vi
      .fn()
      .mockResolvedValue(updatedProgram({ name: "重載後名稱" }));
    mocks.updateProgram.mockRejectedValueOnce(
      new RpcError({ code: "NETWORK_ERROR", status: 0 })
    );
    const props = {
      program: recurringProgram,
      section: "basics" as const,
      onTaskChange: vi.fn(),
      onReload,
    };
    const first = render(<ProgramSettings {...props} />);
    const name = screen.getByRole("textbox", {
      name: COPY.programs.programName,
    });
    await user.clear(name);
    await user.type(name, "重載後名稱");
    await user.click(
      screen.getByRole("button", { name: COPY.programs.settingsSaveBasics })
    );
    await screen.findByText(COPY.programs.programTransportAmbiguous);
    expect(readWorkspaceMutationRecovery()?.surface).toBe("program");

    first.unmount();
    render(<ProgramSettings {...props} />);
    await screen.findByText(COPY.programs.programTransportAmbiguous);
    expect(mocks.updateProgram).toHaveBeenCalledOnce();
    await user.click(
      screen.getByRole("button", { name: COPY.programs.workspaceRetryRefresh })
    );
    await screen.findByText(COPY.programs.workspaceReconciled);
    expect(mocks.updateProgram).toHaveBeenCalledOnce();
    expect(readWorkspaceMutationRecovery()).toBeNull();
  });

  test("renders a focused publishing editor and keeps archive atomic", async () => {
    const user = userEvent.setup();
    render(
      <ProgramSettings
        program={recurringProgram}
        section="publishing"
        onTaskChange={vi.fn()}
      />
    );

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: COPY.programs.settingsPublishing,
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: COPY.programs.settingsBasics })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: COPY.programs.settingsSchedule })
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("combobox", { name: COPY.programs.settingsLifecycle })
    );
    await user.click(
      screen.getByRole("option", { name: COPY.programs.lifecycleArchived })
    );
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.settingsSavePublishing,
      })
    );
    expect(
      screen.getByRole("alert", {
        name: COPY.programs.settingsConfirmPublishing,
      })
    ).toBeInTheDocument();
    expect(mocks.updateProgram).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.settingsConfirmPublishingChange,
      })
    );
    await waitFor(() =>
      expect(mocks.updateProgram).toHaveBeenCalledWith(
        "program-1",
        {
          lifecycle: "Archived",
        },
        expect.any(String)
      )
    );
  });

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

  test("keeps focused Schedule on an overview until a new-rule editor is opened", async () => {
    const user = userEvent.setup();
    expect(COPY.programs.addRule).toBe("新增規則");
    render(
      <ProgramSettings
        program={recurringProgram}
        section="schedule"
        scheduleBackHref="/programs?mode=management&program=program-1&task=schedule"
        scheduleAddon={() => <output>schedule-preview-addon</output>}
      />
    );

    await screen.findByText(
      `${COPY.programs.ruleWeekly} ${COPY.programs.weekdayWednesday}`
    );
    expect(
      [
        screen.getByRole("heading", { name: COPY.programs.scheduleRulesTitle }),
        screen.getByRole("button", { name: COPY.programs.addRule }),
        screen.getByText("schedule-preview-addon"),
      ].every(Boolean) &&
        screen.queryByLabelText(COPY.programs.startTime) === null
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: COPY.programs.addRule })
    );

    expect(
      [
        screen.getByRole("heading", { name: COPY.programs.addRule }),
        screen.getByLabelText(COPY.programs.startTime),
        screen.getByLabelText(COPY.programs.endTime),
      ].every(Boolean) &&
        screen.queryByRole("heading", {
          name: COPY.programs.scheduleRulesTitle,
        }) === null
    ).toBeTruthy();
    expect(screen.queryByText("schedule-preview-addon")).not.toBeVisible();

    await user.click(
      screen.getByRole("link", { name: COPY.programs.backToOverview })
    );

    expect(
      Boolean(
        screen.getByRole("heading", { name: COPY.programs.scheduleRulesTitle })
      ) &&
        screen.queryByLabelText(COPY.programs.startTime) === null &&
        Boolean(screen.getByText("schedule-preview-addon"))
    ).toBeTruthy();
  });

  test("settles Schedule on a read error without showing loading rows", async () => {
    mocks.listScheduleRules.mockRejectedValue(
      new RpcError({ code: "FORBIDDEN", status: 403 })
    );
    render(
      <ProgramSettings
        program={recurringProgram}
        section="schedule"
        scheduleBackHref="/programs?mode=management&program=program-1&task=schedule"
      />
    );

    await expect(
      screen.findByText(COPY.error.forbidden)
    ).resolves.toBeVisible();
    expect(
      screen.getByRole("button", { name: COPY.programs.settingsScheduleRetry })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.addRule })
    ).toBeDisabled();
    expect(
      screen.queryByText(COPY.programs.settingsScheduleLoading)
    ).not.toBeInTheDocument();
  });

  test("uses focused editors for rule edits and exceptions", async () => {
    const user = userEvent.setup();
    render(
      <ProgramSettings
        program={recurringProgram}
        section="schedule"
        scheduleBackHref="/programs?mode=management&program=program-1&task=schedule"
        scheduleAddon={() => <output>schedule-preview-addon</output>}
      />
    );

    const ruleLabel = `${COPY.programs.ruleWeekly} ${COPY.programs.weekdayWednesday}`;
    await screen.findByText(ruleLabel);
    await user.click(
      screen.getByRole("button", { name: COPY.programs.settingsRuleEdit })
    );

    expect(
      Boolean(
        screen.getByRole("heading", { name: COPY.programs.settingsRuleEdit })
      ) &&
        (screen.getByLabelText(COPY.programs.startTime) as HTMLInputElement)
          .value === rule.start_time &&
        screen.queryByText(ruleLabel) === null
    ).toBeTruthy();
    expect(screen.queryByText("schedule-preview-addon")).not.toBeVisible();

    await user.click(
      screen.getByRole("link", { name: COPY.programs.backToOverview })
    );
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.settingsRuleAddException,
      })
    );

    expect(
      Boolean(
        screen.getByRole("heading", {
          name: COPY.programs.settingsRuleAddException,
        })
      ) &&
        Boolean(screen.getByLabelText(COPY.programs.settingsExceptionDate)) &&
        screen.queryByText(ruleLabel) === null
    ).toBeTruthy();
    expect(screen.queryByText("schedule-preview-addon")).not.toBeVisible();

    await user.click(
      screen.getByRole("link", { name: COPY.programs.backToOverview })
    );
    expect(
      Boolean(screen.getByText(ruleLabel)) &&
        Boolean(screen.getByText("schedule-preview-addon"))
    ).toBeTruthy();
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
      expect(mocks.updateProgram).toHaveBeenCalledWith(
        "program-1",
        {
          name: "更新後小組",
          description: "週三晚上的門徒訓練查經。",
          category: "門徒訓練",
          display_order: 4,
        },
        expect.any(String)
      )
    );
    await expect(
      screen.findByText(COPY.programs.settingsSaved)
    ).resolves.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByTestId("program-settings-dirty-actions")
      ).not.toBeInTheDocument()
    );
  });

  test("keeps an unrelated action draft when Basics succeeds", async () => {
    const user = userEvent.setup();
    const publishingDraft = {
      lifecycle: "Archived" as const,
      discoverability: "Listed" as const,
    };
    writeManagementDraft(
      recurringProgram.program_id,
      "settings-publishing",
      publishingDraft
    );
    mocks.updateProgram.mockResolvedValueOnce({
      program: updatedProgram({ name: "基本資料更新" }),
    });
    render(
      <ProgramSettings program={recurringProgram} onTaskChange={vi.fn()} />
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.draftRecover })
    );

    const name = screen.getByRole("textbox", {
      name: COPY.programs.programName,
    });
    await user.clear(name);
    await user.type(name, "基本資料更新");
    await user.click(
      screen.getByRole("button", { name: COPY.programs.settingsSaveBasics })
    );

    await screen.findByText(COPY.programs.settingsSaved);
    expect(
      readManagementDraft(recurringProgram.program_id, "settings-publishing")
    ).toEqual(publishingDraft);
  });

  test("keeps a confirmed Basics write locked across a stale readback", async () => {
    const user = userEvent.setup();
    const saved = updatedProgram({ name: "已確認名稱" });
    const stale = updatedProgram({ name: "舊的伺服器名稱" });
    const onReload = vi
      .fn()
      .mockResolvedValueOnce(stale)
      .mockResolvedValueOnce(stale)
      .mockResolvedValueOnce(saved);
    mocks.updateProgram.mockResolvedValueOnce({ program: saved });
    render(
      <ProgramSettings
        program={recurringProgram}
        onTaskChange={vi.fn()}
        onReload={onReload}
      />
    );

    const name = screen.getByRole("textbox", {
      name: COPY.programs.programName,
    });
    await user.clear(name);
    await user.type(name, saved.name);
    await user.click(
      screen.getByRole("button", { name: COPY.programs.settingsSaveBasics })
    );

    await screen.findByText(COPY.programs.programTransportAmbiguous);
    expect(name).toHaveValue(saved.name);
    expect(readWorkspaceMutationRecovery()?.surface).toBe("program");
    expect(mocks.updateProgram).toHaveBeenCalledOnce();

    await user.click(
      screen.getByRole("button", { name: COPY.programs.workspaceRetryRefresh })
    );
    await screen.findByText(COPY.programs.programTransportAmbiguous);
    expect(mocks.updateProgram).toHaveBeenCalledOnce();

    await user.click(
      screen.getByRole("button", { name: COPY.programs.workspaceRetryRefresh })
    );
    await screen.findByText(COPY.programs.workspaceReconciled);
    expect(readWorkspaceMutationRecovery()).toBeNull();
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
      expect(mocks.updateProgram).toHaveBeenCalledWith(
        "program-1",
        {
          discoverability: "Unlisted",
          enrollment_mode: "MemberRequest",
        },
        expect.any(String)
      )
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
      expect(mocks.updateProgram).toHaveBeenCalledWith(
        "program-1",
        {
          check_in_opens_at_minutes_before_start: 30,
          check_in_closes_at_minutes_after_end: 10,
        },
        expect.any(String)
      )
    );
    expect(screen.queryByText("secret-token")).not.toBeInTheDocument();
  });

  test("validates each focused Attendance default field inline", async () => {
    const user = userEvent.setup();
    render(
      <ProgramSettings
        program={recurringProgram}
        section="attendance"
        onTaskChange={vi.fn()}
      />
    );

    const opens = screen.getByRole("spinbutton", {
      name: COPY.programs.settingsAttendanceOpens,
    });
    const closes = screen.getByRole("spinbutton", {
      name: COPY.programs.settingsAttendanceCloses,
    });
    await user.clear(opens);
    await user.clear(closes);
    await user.click(
      screen.getByRole("button", { name: COPY.programs.settingsSaveAttendance })
    );

    expect(mocks.updateProgram).not.toHaveBeenCalled();
    expect(opens).toHaveAttribute("aria-invalid", "true");
    expect(opens).toHaveAttribute(
      "aria-describedby",
      "program-settings-attendance-opens-error"
    );
    expect(closes).toHaveAttribute("aria-invalid", "true");
    expect(closes).toHaveAttribute(
      "aria-describedby",
      "program-settings-attendance-closes-error"
    );
    expect(
      screen.getAllByText(COPY.programs.settingsAttendanceValidation)
    ).toHaveLength(2);
  });

  test("shows the permanent Program QR and requires confirmation before rotation", async () => {
    mocks.getProgramAttendanceArtifact.mockResolvedValueOnce({
      artifact: {
        program_id: recurringProgram.program_id,
        program_name: recurringProgram.name,
        check_in_token: "stable-program-token",
        can_rotate: true,
      },
    });
    mocks.rotateProgramAttendanceArtifact.mockResolvedValueOnce({
      rotation: {
        program_id: recurringProgram.program_id,
        check_in_token: "replacement-program-token",
        idempotent: false,
      },
    });
    const user = userEvent.setup();
    render(
      <ProgramSettings
        program={recurringProgram}
        section="attendance"
        onTaskChange={vi.fn()}
      />
    );

    expect(
      await screen.findByTestId("program-attendance-qr")
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.settingsAttendanceQrRotate,
      })
    );
    expect(
      screen.getByRole("alertdialog", {
        name: COPY.programs.settingsAttendanceQrRotateTitle,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.settingsAttendanceQrRotateBody)
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.settingsAttendanceQrRotateConfirm,
      })
    );

    await waitFor(() =>
      expect(
        screen.getByText(COPY.programs.settingsAttendanceQrRotated)
      ).toBeVisible()
    );
    expect(mocks.rotateProgramAttendanceArtifact).toHaveBeenCalledWith(
      recurringProgram.program_id,
      expect.any(String)
    );
  });

  test("settles a permanent Program QR encode failure with Retry", async () => {
    mocks.getProgramAttendanceArtifact.mockResolvedValue({
      artifact: {
        program_id: recurringProgram.program_id,
        program_name: recurringProgram.name,
        check_in_token: "stable-program-token",
        can_rotate: false,
      },
    });
    qrMocks.qrDataUrl
      .mockRejectedValueOnce(new Error("encode failed"))
      .mockResolvedValueOnce("data:image/svg+xml,%3Csvg/%3E");
    const user = userEvent.setup();
    render(
      <ProgramSettings
        program={recurringProgram}
        section="attendance"
        onTaskChange={vi.fn()}
      />
    );

    await expect(
      screen.findByText(COPY.programs.settingsAttendanceQrUnavailable)
    ).resolves.toBeVisible();
    expect(
      screen.queryByText(COPY.programs.settingsAttendanceQrLoading)
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.settingsAttendanceQrRetry,
      })
    );
    await waitFor(() => expect(qrMocks.qrDataUrl).toHaveBeenCalledTimes(2));
    await expect(
      screen.findByAltText(COPY.programs.settingsAttendanceQrLabel)
    ).resolves.toBeInTheDocument();
  });

  test("reports permanent Program QR download success and failure", async () => {
    const user = userEvent.setup();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click");
    try {
      const props = {
        program: recurringProgram,
        section: "attendance" as const,
        onTaskChange: vi.fn<(task: "events" | "schedule" | null) => void>(),
      };
      const view = render(<ProgramSettings {...props} />);
      await screen.findByAltText(COPY.programs.settingsAttendanceQrLabel);

      await user.click(
        screen.getByRole("button", {
          name: COPY.programs.settingsAttendanceQrDownload,
        })
      );
      await expect(
        screen.findByText(COPY.programs.settingsAttendanceQrDownloadSuccess)
      ).resolves.toBeVisible();

      click.mockImplementation(() => {
        throw new Error("download blocked");
      });

      await user.click(
        screen.getByRole("button", {
          name: COPY.programs.settingsAttendanceQrDownload,
        })
      );
      await expect(
        screen.findByText(COPY.programs.settingsAttendanceQrDownloadError)
      ).resolves.toBeVisible();
      view.unmount();
    } finally {
      click.mockRestore();
    }
  });

  test("reports a blocked permanent Program sign print instead of staying silent", async () => {
    mocks.getProgramAttendanceArtifact.mockResolvedValue({
      artifact: {
        program_id: recurringProgram.program_id,
        program_name: recurringProgram.name,
        check_in_token: "stable-program-token",
        can_rotate: false,
      },
    });
    const printDocument = document.implementation.createHTMLDocument();
    const open = vi
      .spyOn(window, "open")
      .mockReturnValueOnce(null)
      .mockReturnValue({
        document: printDocument,
        focus: vi.fn(),
        print: vi.fn(),
      } as unknown as Window);
    const user = userEvent.setup();
    try {
      render(
        <ProgramSettings
          program={recurringProgram}
          section="attendance"
          onTaskChange={vi.fn()}
        />
      );
      await screen.findByAltText(COPY.programs.settingsAttendanceQrLabel);

      await user.click(
        screen.getByRole("button", {
          name: COPY.programs.settingsAttendanceQrPrint,
        })
      );
      await expect(
        screen.findByText(COPY.programs.settingsAttendanceQrPrintError)
      ).resolves.toBeVisible();

      await user.click(
        screen.getByRole("button", {
          name: COPY.programs.settingsAttendanceQrPrint,
        })
      );
      await expect(
        screen.findByText(COPY.programs.settingsAttendanceQrPrintSuccess)
      ).resolves.toBeVisible();
      expect(
        screen.queryByText(COPY.programs.settingsAttendanceQrPrintError)
      ).not.toBeInTheDocument();
    } finally {
      open.mockRestore();
    }
  });

  test("reports a native permanent Program print failure", async () => {
    const printDocument = document.implementation.createHTMLDocument();
    const print = vi.fn<() => void>(() => {
      throw new Error("native print failed");
    });
    const open = vi.spyOn(window, "open").mockReturnValue({
      document: printDocument,
      focus: vi.fn<() => void>(),
      print,
    } as unknown as Window);
    const user = userEvent.setup();
    try {
      render(
        <ProgramSettings
          program={recurringProgram}
          section="attendance"
          onTaskChange={vi.fn<(task: "events" | "schedule" | null) => void>()}
        />
      );
      await screen.findByAltText(COPY.programs.settingsAttendanceQrLabel);
      await user.click(
        screen.getByRole("button", {
          name: COPY.programs.settingsAttendanceQrPrint,
        })
      );
      await expect(
        screen.findByText(COPY.programs.settingsAttendanceQrPrintError)
      ).resolves.toBeVisible();
      expect(print).toHaveBeenCalledOnce();
    } finally {
      open.mockRestore();
    }
  });

  test("keeps focused Attendance dirty-only actions and reads back saved defaults", async () => {
    const user = userEvent.setup();
    mocks.updateProgram.mockResolvedValueOnce({
      program: updatedProgram({
        check_in_opens_at_minutes_before_start: 30,
        check_in_closes_at_minutes_after_end: 10,
      }),
    });
    render(
      <ProgramSettings
        program={recurringProgram}
        section="attendance"
        onTaskChange={vi.fn()}
      />
    );

    expect(
      screen.queryByTestId("program-settings-dirty-actions")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: COPY.programs.settingsSaveAttendance,
      })
    ).not.toBeInTheDocument();

    const opens = screen.getByRole("spinbutton", {
      name: COPY.programs.settingsAttendanceOpens,
    });
    const closes = screen.getByRole("spinbutton", {
      name: COPY.programs.settingsAttendanceCloses,
    });
    await user.clear(opens);
    await user.type(opens, "30");
    await user.clear(closes);
    await user.type(closes, "10");

    expect(
      screen.getByTestId("program-settings-dirty-actions")
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: COPY.programs.settingsSaveAttendance })
    );

    await waitFor(() =>
      expect(mocks.updateProgram).toHaveBeenCalledWith(
        "program-1",
        {
          check_in_opens_at_minutes_before_start: 30,
          check_in_closes_at_minutes_after_end: 10,
        },
        expect.any(String)
      )
    );
    await expect(
      screen.findByText(COPY.programs.settingsSaved)
    ).resolves.toBeInTheDocument();
    expect(opens).toHaveValue(30);
    expect(closes).toHaveValue(10);
    expect(
      screen.queryByTestId("program-settings-dirty-actions")
    ).not.toBeInTheDocument();
  });

  test("reconciles a focused Attendance draft after an uncertain save", async () => {
    const user = userEvent.setup();
    const onReload = vi.fn().mockResolvedValue(
      updatedProgram({
        check_in_opens_at_minutes_before_start: 45,
        check_in_closes_at_minutes_after_end: 5,
      })
    );
    mocks.updateProgram.mockRejectedValueOnce(
      new RpcError({ code: "NETWORK_ERROR", status: 0 })
    );
    render(
      <ProgramSettings
        program={recurringProgram}
        section="attendance"
        onTaskChange={vi.fn()}
        onReload={onReload}
      />
    );

    const opens = screen.getByRole("spinbutton", {
      name: COPY.programs.settingsAttendanceOpens,
    });
    const closes = screen.getByRole("spinbutton", {
      name: COPY.programs.settingsAttendanceCloses,
    });
    await user.clear(opens);
    await user.type(opens, "45");
    await user.clear(closes);
    await user.type(closes, "5");
    await user.click(
      screen.getByRole("button", { name: COPY.programs.settingsSaveAttendance })
    );

    await expect(
      screen.findByText(COPY.programs.programTransportAmbiguous)
    ).resolves.toBeInTheDocument();
    expect(opens).toHaveValue(45);
    expect(closes).toHaveValue(5);

    await user.click(
      screen.getByRole("button", { name: COPY.programs.workspaceRetryRefresh })
    );
    await waitFor(() => expect(mocks.updateProgram).toHaveBeenCalledTimes(1));
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(opens).toHaveValue(45);
    expect(closes).toHaveValue(5);
    await expect(
      screen.findByText(COPY.programs.workspaceReconciled)
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByTestId("program-settings-dirty-actions")
    ).not.toBeInTheDocument();
  });

  test("preserves edited Basics input when the server rejects the mutation", async () => {
    const user = userEvent.setup();
    const onReload = vi
      .fn()
      .mockResolvedValue(updatedProgram({ name: "伺服器最新名稱" }));
    mocks.updateProgram.mockRejectedValueOnce(
      new RpcError({ code: "CONFLICT", status: 409 })
    );
    render(
      <ProgramSettings
        program={recurringProgram}
        onTaskChange={vi.fn()}
        onReload={onReload}
      />
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
    const reload = screen.getByRole("button", {
      name: COPY.programs.workspaceRetryRefresh,
    });
    expect(reload).toBeInTheDocument();
    await user.click(reload);
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(name).toHaveValue("伺服器最新名稱");
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
      <ProgramSettings
        program={recurringProgram}
        section="schedule"
        onTaskChange={vi.fn()}
        scheduleAddon={({ scheduleMutationVersion }) => (
          <output data-testid="schedule-mutation-version">
            {scheduleMutationVersion}
          </output>
        )}
      />
    );
    await screen.findByText(
      `${COPY.programs.ruleWeekly} ${COPY.programs.weekdayWednesday}`
    );

    await user.click(
      screen.getByRole("button", { name: COPY.programs.addRule })
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
    expect(screen.getByTestId("schedule-mutation-version")).toHaveTextContent(
      "1"
    );
  });

  test("reconciles a response-lost schedule save without retrying the write", async () => {
    const user = userEvent.setup();
    const savedRule: ScheduleRule = {
      ...rule,
      rule_id: "rule-saved",
      start_time: "20:00",
      end_time: "21:30",
      effective_start_date: hkTodayWallDate(),
    };
    mocks.createScheduleRule.mockRejectedValueOnce(new Error("response lost"));
    mocks.listScheduleRules
      .mockResolvedValueOnce({ rules: [rule] })
      .mockResolvedValueOnce({ rules: [rule, savedRule] });
    render(
      <ProgramSettings
        program={recurringProgram}
        section="schedule"
        onTaskChange={vi.fn<(task: "events" | "schedule" | null) => void>()}
      />
    );
    await screen.findByText(
      `${COPY.programs.ruleWeekly} ${COPY.programs.weekdayWednesday}`
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.addRule })
    );
    await user.type(screen.getByLabelText(COPY.programs.startTime), "20:00");
    await user.type(screen.getByLabelText(COPY.programs.endTime), "21:30");
    await user.click(
      screen.getByRole("button", { name: COPY.programs.addRule })
    );

    await expect(
      screen.findByText(COPY.programs.workspaceReconciled)
    ).resolves.toBeInTheDocument();
    expect(mocks.createScheduleRule).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", {
        name: COPY.programs.workspaceRetryRefresh,
      })
    ).not.toBeInTheDocument();
  });

  test("restores a response-lost schedule mutation after reload with its recovery key", async () => {
    const user = userEvent.setup();
    const savedRule: ScheduleRule = {
      ...rule,
      rule_id: "rule-reloaded",
      start_time: "20:00",
      end_time: "21:30",
      effective_start_date: hkTodayWallDate(),
    };
    mocks.createScheduleRule.mockRejectedValueOnce(new Error("response lost"));
    mocks.listScheduleRules.mockResolvedValue({ rules: [rule] });
    const first = render(
      <ProgramSettings
        program={recurringProgram}
        section="schedule"
        onTaskChange={vi.fn()}
      />
    );
    await screen.findByText(
      `${COPY.programs.ruleWeekly} ${COPY.programs.weekdayWednesday}`
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.addRule })
    );
    await user.type(screen.getByLabelText(COPY.programs.startTime), "20:00");
    await user.type(screen.getByLabelText(COPY.programs.endTime), "21:30");
    await user.click(
      screen.getByRole("button", { name: COPY.programs.addRule })
    );
    await screen.findByText(COPY.programs.programTransportAmbiguous);
    expect(mocks.createScheduleRule).toHaveBeenCalledOnce();
    expect(readWorkspaceMutationRecovery()?.surface).toBe("schedule");

    first.unmount();
    mocks.listScheduleRules.mockResolvedValue({ rules: [rule, savedRule] });
    render(
      <ProgramSettings
        program={recurringProgram}
        section="schedule"
        onTaskChange={vi.fn()}
      />
    );
    await screen.findByText(COPY.programs.programTransportAmbiguous);
    await user.click(
      screen.getByRole("button", { name: COPY.programs.workspaceRetryRefresh })
    );
    await screen.findByText(COPY.programs.workspaceReconciled);
    expect(mocks.createScheduleRule).toHaveBeenCalledOnce();
    expect(readWorkspaceMutationRecovery()).toBeNull();
  });

  test("restores a cancelled exception recovery with omitted optional fields", async () => {
    const user = userEvent.setup();
    const exception = {
      exception_id: "exception-reloaded",
      rule_id: rule.rule_id,
      override_date: "2026-09-22",
      action: "CANCEL" as const,
      new_start_time: null,
      new_end_time: null,
      created_at: "2026-01-01T00:00:00.000Z",
    };
    writeWorkspaceMutationRecovery({
      surface: "schedule",
      programId: recurringProgram.program_id,
      idempotencyKey: "cancel-exception-reload-key",
      mutation: {
        kind: "create-exception",
        ruleId: rule.rule_id,
        input: { override_date: exception.override_date, action: "CANCEL" },
        expected: { override_date: exception.override_date, action: "CANCEL" },
      },
    });
    mocks.listScheduleRules.mockResolvedValue({ rules: [rule] });
    mocks.listScheduleExceptions.mockResolvedValue({ exceptions: [exception] });
    render(
      <ProgramSettings
        program={recurringProgram}
        section="schedule"
        onTaskChange={vi.fn()}
      />
    );

    await screen.findByText(COPY.programs.programTransportAmbiguous);
    await user.click(
      screen.getByRole("button", { name: COPY.programs.workspaceRetryRefresh })
    );
    await screen.findByText(COPY.programs.workspaceReconciled);
    expect(readWorkspaceMutationRecovery()).toBeNull();
  });

  test("clears new-rule input only after a confirmed schedule-rule save", async () => {
    const user = userEvent.setup();
    const savedRule: ScheduleRule = {
      ...rule,
      start_time: "19:00",
      end_time: "20:30",
      effective_start_date: hkTodayWallDate(),
    };
    mocks.listScheduleRules
      .mockResolvedValueOnce({ rules: [rule] })
      .mockResolvedValueOnce({ rules: [rule, savedRule] });
    render(
      <ProgramSettings
        program={recurringProgram}
        section="schedule"
        onTaskChange={vi.fn()}
      />
    );
    await screen.findByText(
      `${COPY.programs.ruleWeekly} ${COPY.programs.weekdayWednesday}`
    );

    await user.click(
      screen.getByRole("button", { name: COPY.programs.addRule })
    );
    await user.type(screen.getByLabelText(COPY.programs.startTime), "19:00");
    await user.type(screen.getByLabelText(COPY.programs.endTime), "20:30");
    await user.click(
      screen.getByRole("button", { name: COPY.programs.addRule })
    );

    await expect(
      screen.findByText(COPY.programs.settingsSaved)
    ).resolves.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: COPY.programs.addRule })
    );
    expect(screen.getByLabelText(COPY.programs.startTime)).toHaveValue("");
    expect(screen.getByLabelText(COPY.programs.endTime)).toHaveValue("");
  });

  test("keeps rule-edit input when the rule-edit mutation fails", async () => {
    const user = userEvent.setup();
    mocks.updateScheduleRule.mockRejectedValueOnce(
      new RpcError({ code: "CONFLICT", status: 409 })
    );
    render(
      <ProgramSettings
        program={recurringProgram}
        section="schedule"
        onTaskChange={vi.fn()}
      />
    );
    await screen.findByText(
      `${COPY.programs.ruleWeekly} ${COPY.programs.weekdayWednesday}`
    );

    await user.click(
      screen.getByRole("button", { name: COPY.programs.settingsRuleEdit })
    );
    const startTime = screen.getByLabelText(COPY.programs.startTime);
    await user.clear(startTime);
    await user.type(startTime, "20:00");
    await user.click(
      screen.getByRole("button", { name: COPY.programs.settingsRuleSave })
    );

    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      COPY.programs.programConflict
    );
    expect(screen.getByLabelText(COPY.programs.startTime)).toHaveValue("20:00");
    expect(
      screen.getByRole("button", { name: COPY.programs.settingsRuleSave })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.settingsRuleEdit })
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
      <ProgramSettings
        program={recurringProgram}
        section="schedule"
        onTaskChange={vi.fn()}
      />
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
      <ProgramSettings
        program={recurringProgram}
        section="schedule"
        onTaskChange={vi.fn()}
      />
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
      "exception-existing",
      expect.any(String)
    );
  });
});

describe(SettingsHub, () => {
  test("uses local buttons only for editors and canonical links for destinations", async () => {
    const onSelect = vi.fn();
    render(
      <SettingsHub
        program={recurringProgram}
        eventsEnabled
        attendanceEnabled
        onSelect={onSelect}
        accessHref="/management?module=accounts"
        scheduleHref="/programs?mode=management&program=program-1&task=schedule"
        notificationsHref="/programs?mode=management&task=notifications"
      />
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: /課程基本資料名稱、描述同分類/u,
      })
    );
    expect(onSelect).toHaveBeenCalledWith("basics");
    expect(
      screen.getByRole("link", { name: COPY.programs.settingsHubAccess })
    ).toHaveAttribute("href", "/management?module=accounts");
    expect(
      screen.getByRole("link", { name: COPY.programs.settingsHubSchedule })
    ).toHaveAttribute(
      "href",
      "/programs?mode=management&program=program-1&task=schedule"
    );
    expect(
      screen.getByRole("link", {
        name: COPY.programs.settingsHubNotifications,
      })
    ).toHaveAttribute("href", "/programs?mode=management&task=notifications");
    expect(
      screen.getByRole("button", { name: /發布與顯示狀態同可見範圍/u })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /封存課程停止一般使用/u })
    ).toBeInTheDocument();
  });

  test("shows each destination its authoritative current value", () => {
    render(
      <SettingsHub
        program={recurringProgram}
        eventsEnabled
        attendanceEnabled
        onSelect={vi.fn()}
        scheduleHref="/programs?mode=management&program=program-1&task=schedule"
        notificationsHref="/programs?mode=management&task=notifications"
        scheduleCurrentValue="已設定 1 條規則 · 下一次 2099-01-01 18:00"
        notificationCurrentValue="未讀 2 · 共 5 項"
      />
    );

    expect(
      screen.getByRole("button", { name: /課程基本資料名稱、描述同分類/u })
    ).toHaveTextContent(
      `${recurringProgram.name} · ${recurringProgram.category}`
    );
    expect(
      screen.getByRole("button", { name: /發布與顯示狀態同可見範圍/u })
    ).toHaveTextContent(
      `${COPY.programs.lifecycleActive} · ${COPY.programs.discoverabilityListed}`
    );
    expect(screen.getByRole("button", { name: /報名設定/u })).toHaveTextContent(
      COPY.programs.enrollmentModeMemberRequest
    );
    expect(
      screen.getByRole("button", { name: /出席與簽到/u })
    ).toHaveTextContent(
      `開始前 ${recurringProgram.check_in_opens_at_minutes_before_start} 分鐘 · 結束後 ${recurringProgram.check_in_closes_at_minutes_after_end} 分鐘`
    );
    expect(
      screen.getByRole("link", { name: COPY.programs.settingsHubSchedule })
    ).toHaveTextContent("已設定 1 條規則 · 下一次 2099-01-01 18:00");
    expect(
      screen.getByRole("link", { name: COPY.programs.settingsHubNotifications })
    ).toHaveTextContent("未讀 2 · 共 5 項");
  });

  test("does not invent schedule or attendance rows when capabilities are absent", () => {
    render(
      <SettingsHub
        program={{
          ...oneOffProgram,
          capabilities: { ...oneOffProgram.capabilities, manage: true },
        }}
        eventsEnabled={false}
        attendanceEnabled={false}
        onSelect={vi.fn()}
        scheduleHref="/programs?mode=management&program=program-oneoff&task=schedule"
        notificationsHref="/programs?mode=management&task=notifications"
      />
    );

    expect(
      screen.queryByRole("link", { name: COPY.programs.settingsHubSchedule })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: COPY.programs.settingsHubAttendance,
      })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: COPY.programs.settingsHubNotifications })
    ).toBeInTheDocument();
  });

  test("confirms archive through its dedicated action", async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn<() => void>();
    const onSelect = vi.fn<(section: ProgramSettingsSection) => void>();
    render(
      <SettingsHub
        program={recurringProgram}
        eventsEnabled
        attendanceEnabled
        onSelect={onSelect}
        onArchive={onArchive}
        scheduleHref="/programs?mode=management&program=program-1&task=schedule"
      />
    );

    await user.click(
      screen.getByRole("button", { name: /封存課程停止一般使用/u })
    );
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.settingsHubArchiveConfirm,
      })
    );

    expect(onArchive).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalledWith("publishing");
  });

  test("gives a leader-assignment-only Program only scoped Account Access", () => {
    render(
      <SettingsHub
        program={{
          ...recurringProgram,
          capabilities: {
            ...recurringProgram.capabilities,
            manage: false,
            leader_assign: true,
            role_read: true,
            role_assign: true,
          },
        }}
        eventsEnabled
        attendanceEnabled
        onSelect={vi.fn()}
        accessHref="/management?module=accounts&scopeKind=Program&scopeId=program-1"
        scheduleHref="/programs?mode=management&program=program-1&task=schedule"
        notificationsHref="/programs?mode=management&task=notifications"
      />
    );

    expect(
      screen.getByRole("link", { name: COPY.programs.settingsHubAccess })
    ).toBeInTheDocument();
    for (const title of [
      COPY.programs.settingsHubBasics,
      COPY.programs.settingsHubPublishing,
      COPY.programs.settingsHubEnrollment,
      COPY.programs.settingsHubSchedule,
      COPY.programs.settingsHubAttendance,
      COPY.programs.settingsHubNotifications,
      COPY.programs.settingsHubArchive,
    ]) {
      expect(screen.queryByText(title)).not.toBeInTheDocument();
    }
  });
});
