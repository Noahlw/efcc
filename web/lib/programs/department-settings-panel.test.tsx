import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { COPY } from "@/lib/copy";

import { DepartmentSettingsPanel } from "./department-settings-panel";
import { clearManagementDraft, writeManagementDraft } from "./management-draft";
import {
  clearWorkspaceMutationRecovery,
  readWorkspaceMutationRecovery,
  writeWorkspaceMutationRecovery,
} from "./mutation-recovery";

const mocks = vi.hoisted(() => ({
  getDepartment: vi.fn(),
  isUnknownMutationOutcome: vi.fn<(error: unknown) => boolean>(),
  setDepartmentModule: vi.fn(),
  updateDepartment: vi.fn(),
}));

vi.mock("@/lib/programs/program-api", () => ({
  getDepartment: mocks.getDepartment,
  isUnknownMutationOutcome: mocks.isUnknownMutationOutcome,
  setDepartmentModule: mocks.setDepartmentModule,
  updateDepartment: mocks.updateDepartment,
}));
vi.mock("./program-form", () => ({
  ProgramForm: () => null,
}));

const department = {
  department_id: "dept&1",
  code: "YOUTH",
  name: "青年事工",
  description: "",
  lifecycle: "Active" as const,
  display_order: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  capabilities: {
    manage: false,
    publish: false,
    module_configure: false,
    manager_assign: true,
    role_read: true,
    role_assign: true,
    role_revoke: true,
  },
};

const managedDepartment = {
  ...department,
  capabilities: {
    ...department.capabilities,
    manage: true,
    module_configure: true,
  },
};

beforeEach(() => {
  mocks.isUnknownMutationOutcome.mockReturnValue(false);
  mocks.getDepartment.mockResolvedValue({ department, modules: [] });
});
afterEach(() => {
  clearManagementDraft(managedDepartment.department_id, "department-settings");
  clearWorkspaceMutationRecovery("department", {
    departmentId: managedDepartment.department_id,
  });
  cleanup();
  vi.clearAllMocks();
});

describe("DepartmentSettingsPanel identity access", () => {
  test("routes authorized Department identity access into scoped Account Access", async () => {
    render(
      <DepartmentSettingsPanel department={department} onClose={vi.fn()} />
    );
    const link = await screen.findByRole("link", { name: "管理帳戶身份組" });
    expect(link).toHaveAttribute(
      "href",
      "/management?module=accounts&scopeKind=Department&scopeId=dept%261&view=access&return=%2Fprograms%3Fmode%3Dmanagement%26department%3Ddept%25261"
    );
  });

  test("hides Department identity access without role.read", async () => {
    const withoutRoleRead = {
      ...department,
      capabilities: { ...department.capabilities, role_read: false },
    };
    mocks.getDepartment.mockResolvedValue({
      department: withoutRoleRead,
      modules: [],
    });
    render(
      <DepartmentSettingsPanel department={withoutRoleRead} onClose={vi.fn()} />
    );
    await screen.findByRole("heading", { name: /部門設定/u });
    expect(
      screen.queryByRole("link", { name: "管理帳戶身份組" })
    ).not.toBeInTheDocument();
  });

  test("keeps a settled load failure recoverable", async () => {
    mocks.getDepartment.mockReset();
    mocks.getDepartment
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({ department, modules: [] });
    const user = userEvent.setup();

    render(
      <DepartmentSettingsPanel
        department={department}
        onClose={vi.fn<() => void>()}
      />
    );

    await screen.findByText(COPY.programs.departmentSettingsLoadError);
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.departmentSettingsRetry,
      })
    );
    await screen.findByRole("link", { name: "管理帳戶身份組" });
    expect(mocks.getDepartment).toHaveBeenCalledTimes(2);
  });

  test("does not discard a dirty Department draft for a module action", async () => {
    mocks.getDepartment.mockResolvedValue({
      department: managedDepartment,
      modules: [
        {
          department_id: managedDepartment.department_id,
          module_key: "events",
          enabled: 1,
          enabled_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const user = userEvent.setup();
    render(
      <DepartmentSettingsPanel
        department={managedDepartment}
        onClose={vi.fn<() => void>()}
      />
    );

    const name = await screen.findByRole("textbox", {
      name: COPY.programs.deptName,
    });
    await user.clear(name);
    await user.type(name, "新部門名稱");
    await user.click(
      screen.getByRole("button", { name: COPY.programs.disable })
    );

    expect(mocks.setDepartmentModule).not.toHaveBeenCalled();
    expect(
      screen.getByText(COPY.programs.departmentDraftBlocking)
    ).toBeInTheDocument();
  });

  test("requires an explicit recovery choice for a restored Department draft", async () => {
    writeManagementDraft(
      managedDepartment.department_id,
      "department-settings",
      {
        name: "恢復中的部門",
        description: "恢復中的描述",
      }
    );
    const user = userEvent.setup();
    render(
      <DepartmentSettingsPanel
        department={managedDepartment}
        onClose={vi.fn<() => void>()}
      />
    );

    const dialog = await screen.findByRole("alertdialog", {
      name: COPY.programs.departmentDraftRecoveryTitle,
    });
    expect(dialog).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", { name: COPY.programs.draftRecover })
    );
    await expect(
      screen.findByRole("textbox", { name: COPY.programs.deptName })
    ).resolves.toHaveValue("恢復中的部門");
  });

  test("blocks replay until an unknown Department mutation is reconciled", async () => {
    const user = userEvent.setup();
    mocks.updateDepartment.mockRejectedValue(new Error("transport lost"));
    mocks.isUnknownMutationOutcome.mockReturnValue(true);

    render(
      <DepartmentSettingsPanel
        department={managedDepartment}
        onClose={vi.fn<() => void>()}
      />
    );

    const name = await screen.findByRole("textbox", {
      name: COPY.programs.deptName,
    });
    await user.clear(name);
    await user.type(name, "重載後部門");
    await user.click(
      screen.getByRole("button", { name: COPY.programs.saveDepartment })
    );

    await screen.findByText(COPY.programs.programTransportAmbiguous);
    const retry = screen.getByRole("button", {
      name: COPY.programs.departmentSettingsRetry,
    });
    expect(retry).toBeEnabled();
    expect(
      screen.getByRole("button", { name: COPY.programs.saveDepartment })
    ).toBeDisabled();
    expect(mocks.updateDepartment).toHaveBeenCalledOnce();
    expect(readWorkspaceMutationRecovery()?.surface).toBe("department");

    mocks.getDepartment.mockResolvedValue({
      department: managedDepartment,
      modules: [],
    });
    await user.click(retry);

    await screen.findByText(COPY.programs.programTransportAmbiguous);
    expect(mocks.updateDepartment).toHaveBeenCalledOnce();
    expect(retry).toBeEnabled();

    mocks.getDepartment.mockResolvedValue({
      department: { ...managedDepartment, name: "重載後部門" },
      modules: [],
    });
    await user.click(retry);

    await screen.findByText(COPY.programs.departmentMutationReconciled);
    expect(mocks.updateDepartment).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: COPY.programs.saveDepartment })
    ).toBeEnabled();
  });

  test("restores a response-lost Department mutation after reload without replaying", async () => {
    const user = userEvent.setup();
    writeWorkspaceMutationRecovery({
      surface: "department",
      departmentId: managedDepartment.department_id,
      idempotencyKey: "department-reload-key",
      mutation: {
        kind: "details",
        patch: { name: "重載後部門", description: "重載後描述" },
        expected: { name: "重載後部門", description: "重載後描述" },
      },
    });
    mocks.getDepartment.mockResolvedValue({
      department: managedDepartment,
      modules: [],
    });
    render(
      <DepartmentSettingsPanel
        department={managedDepartment}
        onClose={vi.fn<() => void>()}
      />
    );

    await screen.findByText(COPY.programs.programTransportAmbiguous);
    expect(
      screen.getByRole("button", { name: COPY.programs.saveDepartment })
    ).toBeDisabled();
    expect(mocks.updateDepartment).not.toHaveBeenCalled();
    mocks.getDepartment.mockResolvedValue({
      department: {
        ...managedDepartment,
        name: "重載後部門",
        description: "重載後描述",
      },
      modules: [],
    });
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.departmentSettingsRetry,
      })
    );
    await screen.findByText(COPY.programs.departmentMutationReconciled);
    expect(mocks.updateDepartment).not.toHaveBeenCalled();
    expect(readWorkspaceMutationRecovery()).toBeNull();
  });

  test("keeps a committed Department write distinct from failed readback", async () => {
    const user = userEvent.setup();
    const updated = { ...managedDepartment, name: "更新後部門" };
    mocks.updateDepartment.mockResolvedValueOnce({ department: updated });
    mocks.getDepartment
      .mockResolvedValueOnce({ department: managedDepartment, modules: [] })
      .mockRejectedValueOnce(new Error("readback unavailable"))
      .mockResolvedValueOnce({ department: updated, modules: [] });
    render(
      <DepartmentSettingsPanel
        department={managedDepartment}
        onClose={vi.fn<() => void>()}
      />
    );

    const name = await screen.findByRole("textbox", {
      name: COPY.programs.deptName,
    });
    await user.clear(name);
    await user.type(name, updated.name);
    await user.click(
      screen.getByRole("button", { name: COPY.programs.saveDepartment })
    );

    await waitFor(() =>
      expect(
        screen.getAllByText(COPY.programs.departmentSavedRefreshPending).length
      ).toBeGreaterThan(0)
    );
    expect(
      screen.queryByText(COPY.programs.programTransportAmbiguous)
    ).not.toBeInTheDocument();
    expect(mocks.updateDepartment).toHaveBeenCalledOnce();
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.departmentSettingsRetry,
      })
    );
    await waitFor(() => expect(name).toHaveValue(updated.name));
    expect(mocks.updateDepartment).toHaveBeenCalledOnce();
  });

  test("keeps a confirmed Department write visible across a stale readback", async () => {
    const user = userEvent.setup();
    const updated = { ...managedDepartment, name: "更新後部門" };
    mocks.updateDepartment.mockResolvedValueOnce({ department: updated });
    mocks.getDepartment
      .mockResolvedValueOnce({ department: managedDepartment, modules: [] })
      .mockResolvedValueOnce({ department: managedDepartment, modules: [] })
      .mockResolvedValueOnce({ department: updated, modules: [] });
    render(
      <DepartmentSettingsPanel
        department={managedDepartment}
        onClose={vi.fn<() => void>()}
      />
    );

    const name = await screen.findByRole("textbox", {
      name: COPY.programs.deptName,
    });
    await user.clear(name);
    await user.type(name, updated.name);
    await user.click(
      screen.getByRole("button", { name: COPY.programs.saveDepartment })
    );

    await screen.findByText(COPY.programs.programTransportAmbiguous);
    expect(name).toHaveValue(updated.name);
    expect(mocks.updateDepartment).toHaveBeenCalledOnce();
    await user.click(
      screen.getByRole("button", {
        name: COPY.programs.departmentSettingsRetry,
      })
    );
    await screen.findByText(COPY.programs.departmentMutationReconciled);
    expect(name).toHaveValue(updated.name);
    expect(mocks.updateDepartment).toHaveBeenCalledOnce();
  });
});
