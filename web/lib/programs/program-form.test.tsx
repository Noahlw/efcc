import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { RpcError } from "@/lib/api";
import { COPY } from "@/lib/copy";
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
        input: ProgramInput
      ) => Promise<{ program: Program }>
    >(),
  updateProgram:
    vi.fn<
      (programId: string, patch: ProgramPatch) => Promise<{ program: Program }>
    >(),
}));

vi.mock(import("@/lib/programs/program-api"), () => ({
  createProgram: mocks.createProgram,
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

describe(ProgramForm, () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
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
    expect(
      within(departmentSelect).getByRole("option", {
        name: "青年事工 · DEPT-1",
      })
    ).toBeInTheDocument();
    expect(
      within(departmentSelect).queryByRole("option", {
        name: "只讀事工 · DEPT-2",
      })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/check-in/gu)).not.toBeInTheDocument();

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
    await user.selectOptions(
      screen.getByRole("combobox", { name: COPY.programs.behaviorType }),
      "OneOff"
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: COPY.programs.programLifecycle }),
      "Active"
    );
    await user.click(
      screen.getByRole("button", { name: COPY.programs.saveProgram })
    );

    expect(mocks.createProgram).toHaveBeenCalledWith("dept-1", {
      name: "單次培訓",
      description: "單次培訓目的",
      category: "領袖訓練",
      behavior_type: "OneOff",
      lifecycle: "Active",
      discoverability: "Unlisted",
      enrollment_mode: "MemberRequest",
    });
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

    expect(mocks.createProgram).toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith("created-no-category");
  });

  test("disables Active lifecycle and shows a draft-only hint without publish", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn<(programId: string) => void>();
    const readOnly = department("dept-1", "青年事工", true);
    readOnly.capabilities.publish = false;

    render(<ProgramForm departments={[readOnly]} onSaved={onSaved} />);

    const lifecycle = screen.getByRole("combobox", {
      name: COPY.programs.programLifecycle,
    });
    expect(
      within(lifecycle).getByRole("option", {
        name: COPY.programs.lifecycleActive,
      })
    ).toBeDisabled();
    expect(
      screen.getByText(COPY.programs.programCreateDraftOnlyHint)
    ).toBeInTheDocument();

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

    expect(mocks.createProgram).toHaveBeenCalledWith("dept-1", {
      name: "草稿課程",
      description: "草稿課程目的",
      category: "門徒訓練",
      behavior_type: "Recurring",
      lifecycle: "Draft",
      discoverability: "Unlisted",
      enrollment_mode: "MemberRequest",
    });
  });

  test("edits lifecycle and shows the archive commitment conflict", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn<(programId: string) => void>();
    mocks.updateProgram.mockRejectedValueOnce(
      new RpcError({ code: "PROGRAM_ARCHIVE_BLOCKED", status: 409 })
    );

    render(<ProgramForm initial={program} onSaved={onSaved} />);

    const lifecycle = screen.getByRole("combobox", {
      name: COPY.programs.programLifecycle,
    });
    expect(
      within(lifecycle).getByRole("option", {
        name: COPY.programs.lifecycleArchived,
      })
    ).toBeInTheDocument();
    await user.selectOptions(lifecycle, "Archived");
    await user.click(
      screen.getByRole("button", { name: COPY.programs.saveProgram })
    );

    expect(mocks.updateProgram).toHaveBeenCalledWith("program-1", {
      name: "現有課程",
      description: "簡介",
      category: "門徒訓練",
      lifecycle: "Archived",
      discoverability: "Listed",
      enrollment_mode: "MemberRequest",
    });
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

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: COPY.programs.programLifecycle,
      }),
      "Archived"
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
});
