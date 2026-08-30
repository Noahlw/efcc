import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { DepartmentSettingsPanel } from "./department-settings-panel";

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
  department_id: "dept-1",
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

beforeEach(() => {
  mocks.getDepartment.mockResolvedValue({ department, modules: [] });
});
afterEach(() => {
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
      "/management?module=accounts&scopeKind=Department&scopeId=dept-1&view=access&return=%2Fprograms%3Fmode%3Dmanagement%26department%3Ddept-1"
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
});
