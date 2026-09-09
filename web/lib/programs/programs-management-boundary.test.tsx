import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
    listScheduleRules: vi.fn(),
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
  listScheduleRules: mocks.listScheduleRules,
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
const cockpit = {
  program_id: "program-1",
  next_event: {
    event_id: "event-1",
    program_id: "program-1",
    title: "查經小組 第 1 節",
    name: null,
    starts_at: "2099-01-01T10:00:00.000Z",
    ends_at: "2099-01-01T11:00:00.000Z",
    location: "副堂 201",
    source: "SCHEDULE" as const,
    is_recurring: true,
    checked_in_count: 1,
    roster_count: 3,
  },
  active_event_count: 5,
  pending_enrollment_count: 3,
};

beforeEach(() => {
  window.history.replaceState({}, "", "/programs?mode=management");
  mocks.getManagementAccess.mockReset();
  mocks.getManagementDirectory.mockReset();
  mocks.getManagementProgram.mockReset();
  mocks.listEvents.mockReset();
  mocks.listEnrollmentRequests.mockReset();
  mocks.listEnrollments.mockReset();
  mocks.listScheduleRules.mockReset();
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
    cockpit,
  });
  mocks.listEnrollmentRequests.mockResolvedValue({ requests: [] });
  mocks.listEnrollments.mockResolvedValue({ enrollments: [] });
  mocks.listScheduleRules.mockResolvedValue({ rules: [] });
});

afterEach(() => {
  cleanup();
});

describe("Programs management boundary", () => {
  test("routes from scoped Directory into a status-first Program Cockpit and focused task", async () => {
    const view = render(<ProgramsBoundary />);

    const row = await screen.findByRole("link", { name: /查經小組/u });
    expect(row).toHaveTextContent("青年事工");
    expect(row).toHaveAttribute(
      "href",
      "/programs?mode=management&program=program-1"
    );

    window.history.replaceState(
      {},
      "",
      row.getAttribute("href") ?? "/programs?mode=management"
    );
    view.rerender(<ProgramsBoundary />);
    await expect(
      screen.findByRole("heading", { name: "查經小組" })
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: COPY.programs.workspaceTaskEvents })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.cockpitParticipantsTile)
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: /聚會.*個聚會/u }));
    expect(window.location.search).toBe(
      "?mode=management&program=program-1&task=events"
    );
    await expect(
      screen.findByRole("heading", {
        name: COPY.programs.workspaceTaskEvents,
      })
    ).resolves.toBeInTheDocument();
  });
  test("restores the directory search and focuses the selected row after Back", async () => {
    const view = render(<ProgramsBoundary />);
    const search = await screen.findByRole("searchbox", {
      name: COPY.programs.managementDirectorySearchLabel,
    });
    await userEvent.type(search, "查經");
    const row = await screen.findByRole("link", { name: /查經小組/u });
    await userEvent.click(row);
    await screen.findByRole("heading", { name: "查經小組" });

    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.workspaceBack })
    );
    await expect(
      screen.findByRole("heading", {
        name: COPY.programs.managementDirectoryTitle,
      })
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", {
        name: COPY.programs.managementDirectorySearchLabel,
      })
    ).toHaveValue("查經");
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /查經小組/u })).toHaveFocus()
    );
    view.unmount();
  });
  test("restores the selected Department context from a management return URL", async () => {
    const otherDepartment = {
      ...department,
      department_id: "dept-2",
      code: "D2",
      name: "敬拜事工",
    };
    const otherProgram = {
      ...program,
      program_id: "program-2",
      department_id: "dept-2",
      name: "詩班練習",
    };
    mocks.getManagementDirectory.mockResolvedValue({
      departments: [department, otherDepartment],
      programs: [program, otherProgram],
    });
    window.history.replaceState(
      {},
      "",
      "/programs?mode=management&department=dept-1"
    );
    render(<ProgramsBoundary />);
    await screen.findByRole("button", { name: /青年事工.*部門設定/u });
    const row = await screen.findByRole("link", { name: /查經小組/u });
    expect(row).toHaveAttribute(
      "href",
      "/programs?mode=management&department=dept-1&program=program-1"
    );
    expect(
      screen.queryByRole("button", { name: /敬拜事工.*部門設定/u })
    ).not.toBeInTheDocument();
  });
  test("carries the next meeting event into the participants roster task", async () => {
    window.history.replaceState(
      {},
      "",
      "/programs?mode=management&program=program-1"
    );
    render(<ProgramsBoundary />);

    await screen.findByRole("link", {
      name: COPY.programs.cockpitManageRoster,
    });

    await userEvent.click(
      screen.getByRole("link", {
        name: COPY.programs.cockpitManageRoster,
      })
    );

    expect(window.location.search).toBe(
      "?mode=management&program=program-1&task=participants&event=event-1"
    );
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
