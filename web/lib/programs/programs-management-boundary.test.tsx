import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { RpcError } from "@/lib/api";
import { COPY } from "@/lib/copy";
import type {
  Department,
  DepartmentModule,
  Program,
} from "@/lib/programs/program-api";
import { ProgramsBoundary } from "@/lib/programs/programs-boundary";

const mocks = vi.hoisted(() => {
  const router = {
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  };
  return {
    getManagementAccess: vi.fn(),
    getManagementDirectory: vi.fn(),
    getManagementProgram: vi.fn(),
    listEvents: vi.fn(),
    listEnrollmentRequests: vi.fn(),
    listEnrollments: vi.fn(),
    pathname: vi.fn(() => "/programs"),
    router,
  };
});

vi.mock(import("@/lib/programs/program-api"), () => ({
  getManagementAccess: mocks.getManagementAccess,
  getManagementDirectory: mocks.getManagementDirectory,
  getManagementProgram: mocks.getManagementProgram,
  listEvents: mocks.listEvents,
  listEnrollmentRequests: mocks.listEnrollmentRequests,
  listEnrollments: mocks.listEnrollments,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname(),
  useRouter: () => mocks.router,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const department: Department = {
  department_id: "dept-1",
  code: "D1",
  name: "青年事工",
  description: null,
  lifecycle: "Active",
  display_order: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  capabilities: {
    manage: true,
    publish: true,
    module_configure: true,
  },
};

const program: Program = {
  program_id: "program-1",
  department_id: "dept-1",
  name: "查經小組",
  description: "週三查經。",
  category: "門徒訓練",
  behavior_type: "Recurring",
  lifecycle: "Active",
  discoverability: "Listed",
  enrollment_mode: "MemberRequest",
  display_order: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  capabilities: {
    manage: true,
    publish: true,
    enroll: false,
    leader_assign: false,
  },
};
const modules: DepartmentModule[] = [
  {
    department_id: "dept-1",
    module_key: "program_catalog",
    enabled: 1,
    enabled_at: "2026-01-01T00:00:00.000Z",
  },
  {
    department_id: "dept-1",
    module_key: "events",
    enabled: 1,
    enabled_at: "2026-01-01T00:00:00.000Z",
  },
  {
    department_id: "dept-1",
    module_key: "enrollment",
    enabled: 1,
    enabled_at: "2026-01-01T00:00:00.000Z",
  },
];

beforeEach(() => {
  window.history.replaceState({}, "", "/programs?mode=management");
  mocks.getManagementAccess.mockReset();
  mocks.getManagementDirectory.mockReset();
  mocks.getManagementProgram.mockReset();
  mocks.listEvents.mockReset();
  mocks.listEnrollmentRequests.mockReset();
  mocks.listEnrollments.mockReset();
  mocks.router.push.mockReset();
  mocks.router.replace.mockReset();
  mocks.getManagementAccess.mockResolvedValue({
    hasManagementCapability: true,
    departmentScopes: 1,
    programScopes: 0,
  });
  mocks.getManagementDirectory.mockResolvedValue({
    departments: [department],
    programs: [program],
  });
  mocks.getManagementProgram.mockResolvedValue({
    program,
    department,
    modules,
  });
  mocks.listEvents.mockResolvedValue({ events: [] });
  mocks.listEnrollmentRequests.mockResolvedValue({ requests: [] });
  mocks.listEnrollments.mockResolvedValue({ enrollments: [] });
});

afterEach(() => {
  cleanup();
});

describe("Programs management boundary", () => {
  test("routes from scoped Directory into one Program workspace and a focused task", async () => {
    render(<ProgramsBoundary />);

    const row = await screen.findByRole("button", { name: /查經小組/u });
    expect(row).toHaveTextContent("青年事工");
    await userEvent.click(row);

    expect(window.location.search).toBe("?mode=management&program=program-1");
    await expect(
      screen.findByRole("heading", { name: "查經小組" })
    ).resolves.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("link", { name: COPY.programs.workspaceTaskEvents })
    );
    expect(window.location.search).toBe(
      "?mode=management&program=program-1&task=events"
    );
    await expect(
      screen.findByRole("heading", {
        name: COPY.programs.workspaceTaskEvents,
      })
    ).resolves.toBeInTheDocument();
  });

  test("direct revoked links show a generic unavailable state without record leakage", async () => {
    window.history.replaceState(
      {},
      "",
      "/programs?mode=management&program=revoked-program"
    );
    mocks.getManagementProgram.mockRejectedValue(
      new RpcError({ code: "NOT_FOUND", status: 404 })
    );
    render(<ProgramsBoundary />);

    await expect(
      screen.findByRole("heading", { name: COPY.programs.workspaceUnavailable })
    ).resolves.toBeInTheDocument();
    expect(screen.queryByText("revoked-program")).not.toBeInTheDocument();
  });
});
