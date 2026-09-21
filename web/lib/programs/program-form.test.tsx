import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { RpcError } from "@/lib/api";
import { COPY } from "@/lib/copy";
import {
  clearAllWorkspaceMutationRecovery,
  readWorkspaceMutationRecovery,
} from "@/lib/programs/mutation-recovery";
import type {
  Department,
  Program,
  ProgramInput,
  ProgramPatch,
} from "@/lib/programs/program-api";
import { ProgramForm } from "@/lib/programs/program-form";

const mocks = vi.hoisted(() => ({
  createProgram:
    vi.fn<
      (
        departmentId: string,
        input: ProgramInput,
        idempotencyKey?: string | null
      ) => Promise<{ program: Program }>
    >(),
  updateProgram:
    vi.fn<
      (
        programId: string,
        patch: ProgramPatch,
        idempotencyKey?: string | null
      ) => Promise<{ program: Program }>
    >(),
  getManagementDirectory: vi.fn(),
  getManagementProgram: vi.fn(),
  isUnknownMutationWriteOutcome: vi.fn(() => false),
}));

vi.mock(import("@/lib/programs/program-api"), () => ({
  createProgram: mocks.createProgram,
  getManagementDirectory: mocks.getManagementDirectory,
  getManagementProgram: mocks.getManagementProgram,
  isUnknownMutationWriteOutcome: mocks.isUnknownMutationWriteOutcome,
  updateProgram: mocks.updateProgram,
}));

const department = (
  departmentId: string,
  name: string,
  manage: boolean
): Department => ({
  department_id: departmentId,
  code: departmentId.toUpperCase(),
  name,
  description: null,
  lifecycle: "Active",
  display_order: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  capabilities: {
    manage,
    publish: manage,
    module_configure: manage,
  },
});

const program: Program = {
  program_id: "program-1",
  department_id: "dept-1",
  name: "現有課程",
  description: "簡介",
  category: "門徒訓練",
  behavior_type: "Recurring",
  lifecycle: "Active",
  discoverability: "Listed",
  enrollment_mode: "MemberRequest",
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

async function chooseSelectOption(
  user: UserEvent,
  label: string,
  option: string
) {
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe(ProgramForm, () => {
  afterEach(() => {
    cleanup();
    clearAllWorkspaceMutationRecovery();
    vi.resetAllMocks();
  });

  test("creates a permitted recurring or one-off program without unrelated settings", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn<(programId: string) => void>();
    mocks.createProgram.mockResolvedValueOnce({
      program: { ...program, program_id: "created-1" },
    });
    const managed = department("dept-1", "青年事工", true);
    const unscoped = department("dept-2", "只讀事工", false);

    render(<ProgramForm departments={[managed, unscoped]} onSaved={onSaved} />);

    const departmentSelect = screen.getByRole("combobox", {
      name: COPY.programs.workspaceDepartment,
    });
    await user.click(departmentSelect);
    expect(
      screen.getByRole("option", { name: "青年事工 · DEPT-1" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "只讀事工 · DEPT-2" })
    ).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.type(
      screen.getByRole("textbox", { name: COPY.programs.programName }),
      "  單次培訓  "
    );
    await user.type(
      screen.getByRole("textbox", { name: COPY.programs.programPurpose }),
      "單次培訓目的"
    );
    await user.type(
      screen.getByRole("textbox", { name: COPY.programs.programCategory }),
      "領袖訓練"
    );
    await chooseSelectOption(
      user,
      COPY.programs.behaviorType,
      COPY.programs.behaviorOneOff
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.saveProgram })
    );

    expect(mocks.createProgram).toHaveBeenCalledWith(
      "dept-1",
      {
        name: "單次培訓",
        description: "單次培訓目的",
        category: "領袖訓練",
        behavior_type: "OneOff",
        lifecycle: "Draft",
        discoverability: "Unlisted",
        enrollment_mode: "MemberRequest",
      },
      expect.any(String)
    );
    expect(onSaved).toHaveBeenCalledWith("created-1");
  });

  test("requires a non-empty name and purpose before creating a program", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn<(programId: string) => void>();
    render(
      <ProgramForm
        departments={[department("dept-1", "青年事工", true)]}
        onSaved={onSaved}
      />
    );

    await user.type(
      screen.getByRole("textbox", { name: COPY.programs.programName }),
      "  "
    );
    await user.type(
      screen.getByRole("textbox", { name: COPY.programs.programPurpose }),
      "  "
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.saveProgram })
    );

    expect(mocks.createProgram).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      COPY.programs.purposeRequired
    );
  });

  test("shows the draft-created confirmation only after a successful create", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn<(programId: string) => void>();
    mocks.createProgram.mockResolvedValueOnce({
      program: { ...program, program_id: "created-draft" },
    });
    render(
      <ProgramForm
        departments={[department("dept-1", "青年事工", true)]}
        onSaved={onSaved}
      />
    );

    await user.type(
      screen.getByRole("textbox", { name: COPY.programs.programName }),
      "新課程"
    );
    await user.type(
      screen.getByRole("textbox", { name: COPY.programs.programPurpose }),
      "新課程目的"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.saveProgram })
    );

    await expect(
      screen.findByText(COPY.programs.programCreatedNotice)
    ).resolves.toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledWith("created-draft");
  });

  test("allows an empty optional category when name and purpose are present", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn<(programId: string) => void>();
    mocks.createProgram.mockResolvedValueOnce({
      program: { ...program, program_id: "created-no-category" },
    });
    render(
      <ProgramForm
        departments={[department("dept-1", "青年事工", true)]}
        onSaved={onSaved}
      />
    );

    await user.type(
      screen.getByRole("textbox", { name: COPY.programs.programName }),
      "單次培訓"
    );
    await user.type(
      screen.getByRole("textbox", { name: COPY.programs.programPurpose }),
      "培訓目的"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.saveProgram })
    );

    expect(mocks.createProgram).toHaveBeenCalledWith(
      "dept-1",
      {
        name: "單次培訓",
        description: "培訓目的",
        category: undefined,
        behavior_type: "Recurring",
        lifecycle: "Draft",
        discoverability: "Unlisted",
        enrollment_mode: "MemberRequest",
      },
      expect.any(String)
    );
    expect(onSaved).toHaveBeenCalledWith("created-no-category");
  });

  test("does not expose creation lifecycle or discoverability overrides", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn<(programId: string) => void>();
    const readOnly = department("dept-1", "青年事工", true);
    readOnly.capabilities.publish = false;

    render(<ProgramForm departments={[readOnly]} onSaved={onSaved} />);

    expect(
      screen.queryByRole("combobox", { name: COPY.programs.programLifecycle })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", {
        name: COPY.programs.discoverabilityListed,
      })
    ).not.toBeInTheDocument();

    await user.type(
      screen.getByRole("textbox", { name: COPY.programs.programName }),
      "草稿課程"
    );
    await user.type(
      screen.getByRole("textbox", { name: COPY.programs.programPurpose }),
      "草稿課程目的"
    );
    await user.type(
      screen.getByRole("textbox", { name: COPY.programs.programCategory }),
      "門徒訓練"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.saveProgram })
    );

    expect(mocks.createProgram).toHaveBeenCalledWith(
      "dept-1",
      {
        name: "草稿課程",
        description: "草稿課程目的",
        category: "門徒訓練",
        behavior_type: "Recurring",
        lifecycle: "Draft",
        discoverability: "Unlisted",
        enrollment_mode: "MemberRequest",
      },
      expect.any(String)
    );
  });

  test("renders a truthful unavailable state without a manageable Department", async () => {
    const onSaved = vi.fn<(programId: string) => void>();

    render(
      <ProgramForm
        departments={[department("dept-1", "只讀事工", false)]}
        onSaved={onSaved}
      />
    );

    await expect(
      screen.findByText(COPY.programs.programCreateUnavailable)
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: COPY.programs.programName })
    ).not.toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  test("edits lifecycle and shows the archive commitment conflict", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn<(programId: string) => void>();
    mocks.updateProgram.mockRejectedValueOnce(
      new RpcError({ code: "PROGRAM_ARCHIVE_BLOCKED", status: 409 })
    );

    render(<ProgramForm initial={program} onSaved={onSaved} />);

    await chooseSelectOption(
      user,
      COPY.programs.programLifecycle,
      COPY.programs.lifecycleArchived
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.saveProgram })
    );

    expect(mocks.updateProgram).toHaveBeenCalledWith(
      "program-1",
      {
        name: "現有課程",
        description: "簡介",
        category: "門徒訓練",
        lifecycle: "Archived",
        discoverability: "Listed",
        enrollment_mode: "MemberRequest",
      },
      expect.any(String)
    );
    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      COPY.programs.archiveBlocked
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  test("shows the already-archived copy when the block reason is already_archived", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn<(programId: string) => void>();
    mocks.updateProgram.mockRejectedValueOnce(
      new RpcError({
        code: "PROGRAM_ARCHIVE_BLOCKED",
        status: 409,
        detail: "already_archived",
      })
    );

    render(<ProgramForm initial={program} onSaved={onSaved} />);

    await chooseSelectOption(
      user,
      COPY.programs.programLifecycle,
      COPY.programs.lifecycleArchived
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.saveProgram })
    );

    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      COPY.programs.archiveAlreadyArchived
    );
    expect(
      screen.queryByText(COPY.programs.archiveBlocked)
    ).not.toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  test("retains an unknown update and resolves it by authoritative readback", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn<(programId: string) => void>();
    mocks.isUnknownMutationWriteOutcome.mockReturnValue(true);
    mocks.updateProgram.mockRejectedValueOnce(
      new RpcError({ code: "INTERNAL_ERROR", status: 500 })
    );
    mocks.getManagementProgram.mockResolvedValueOnce({
      program: { ...program, lifecycle: "Archived" },
      department: department("dept-1", "青年事工", true),
      modules: [],
    });

    render(<ProgramForm initial={program} onSaved={onSaved} />);
    await chooseSelectOption(
      user,
      COPY.programs.programLifecycle,
      COPY.programs.lifecycleArchived
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.saveProgram })
    );

    await expect(
      screen.findByText(COPY.programs.programTransportAmbiguous)
    ).resolves.toBeInTheDocument();
    expect(readWorkspaceMutationRecovery()?.surface).toBe("program");
    await user.click(
      screen.getByRole("button", { name: COPY.programs.workspaceRetryRefresh })
    );
    expect(onSaved).toHaveBeenCalledWith("program-1");
    expect(readWorkspaceMutationRecovery()).toBeNull();
  });

  test("retains an unknown create and resolves it by directory readback", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn<(programId: string) => void>();
    mocks.isUnknownMutationWriteOutcome.mockReturnValue(true);
    mocks.createProgram.mockRejectedValueOnce(
      new RpcError({ code: "INTERNAL_ERROR", status: 500 })
    );
    mocks.getManagementDirectory.mockResolvedValueOnce({
      departments: [],
      programs: [
        {
          ...program,
          program_id: "created-after-unknown",
          name: "新課程",
          description: "新課程目的",
          category: null,
          lifecycle: "Draft",
          discoverability: "Unlisted",
          display_order: 0,
        },
      ],
    });

    render(
      <ProgramForm
        departments={[department("dept-1", "青年事工", true)]}
        onSaved={onSaved}
      />
    );
    await user.type(
      screen.getByRole("textbox", { name: COPY.programs.programName }),
      "新課程"
    );
    await user.type(
      screen.getByRole("textbox", { name: COPY.programs.programPurpose }),
      "新課程目的"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.saveProgram })
    );

    await expect(
      screen.findByText(COPY.programs.programTransportAmbiguous)
    ).resolves.toBeInTheDocument();
    expect(readWorkspaceMutationRecovery()?.surface).toBe("program-create");
    await user.click(
      screen.getByRole("button", { name: COPY.programs.workspaceRetryRefresh })
    );
    expect(onSaved).toHaveBeenCalledWith("created-after-unknown");
    expect(readWorkspaceMutationRecovery()).toBeNull();
  });
});
