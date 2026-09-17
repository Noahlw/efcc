import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { COPY } from "@/lib/copy";

import { DepartmentSettingsPanel } from "./department-settings-panel";
import { clearManagementDraft, writeManagementDraft } from "./management-draft";

const mocks = vi.hoisted(() => ({
  getDepartment: vi.fn(),
  setDepartmentModule: vi.fn(),
  updateDepartment: vi.fn(),
}));

vi.mock("@/lib/programs/program-api", () => ({
  getDepartment: mocks.getDepartment,
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
  mocks.getDepartment.mockResolvedValue({ department, modules: [] });
});
afterEach(() => {
  clearManagementDraft(managedDepartment.department_id, "department-settings");
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
      <DepartmentSettingsPanel department={department} onClose={vi.fn()} />
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
      />
    );

    const dialog = await screen.findByRole("alertdialog", {
      name: COPY.programs.departmentDraftRecoveryTitle,
    });
    expect(dialog).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", { name: COPY.programs.draftRecover })
    );
    expect(
      await screen.findByRole("textbox", { name: COPY.programs.deptName })
    ).toHaveValue("恢復中的部門");
  });
});
