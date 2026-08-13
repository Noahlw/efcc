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
import {
  ManagementDirectory,
  projectManagementPrograms,
} from "@/lib/programs/management-directory";
import type {
  Department,
  ManagementAttention,
  Program,
} from "@/lib/programs/program-api";

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
    getManagementDirectory: vi.fn(),
    replace: router.replace,
    router,
  };
});

vi.mock(import("@/lib/programs/program-api"), () => ({
  getManagementDirectory: mocks.getManagementDirectory,
}));

vi.mock(import("next/navigation"), () => ({
  useRouter: () => mocks.router,
}));

const department = (
  departmentId: string,
  name: string,
  capabilities: Department["capabilities"]
): Department => ({
  department_id: departmentId,
  code: departmentId.toUpperCase(),
  name,
  description: null,
  lifecycle: "Active",
  display_order: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  capabilities,
});

const program = (
  programId: string,
  departmentId: string,
  name: string,
  capabilities: Program["capabilities"],
  overrides: Partial<Program> = {}
): Program => ({
  program_id: programId,
  department_id: departmentId,
  name,
  description: null,
  category: null,
  behavior_type: "Recurring",
  lifecycle: "Active",
  discoverability: "Listed",
  enrollment_mode: "MemberRequest",
  display_order: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  capabilities,
  ...overrides,
});

const departmentScope = {
  manage: true,
  publish: true,
  module_configure: true,
};
const noDepartmentScope = {
  manage: false,
  publish: false,
  module_configure: false,
};
const programScope = {
  manage: true,
  publish: true,
  enroll: false,
  leader_assign: false,
};
const noProgramScope = {
  manage: false,
  publish: false,
  enroll: true,
  leader_assign: false,
};

beforeEach(() => {
  mocks.getManagementDirectory.mockReset();
  mocks.replace.mockReset();
});

afterEach(() => {
  cleanup();
});

describe(projectManagementPrograms, () => {
  test("projects Department inheritance and exact Program scope without duplicates", () => {
    const inherited = department("dept-inherited", "青年事工", departmentScope);
    const exact = department("dept-exact", "外展事工", noDepartmentScope);
    const rows = projectManagementPrograms(
      [inherited, exact],
      [
        [
          program(
            "program-inherited-1",
            inherited.department_id,
            "查經小組",
            noProgramScope
          ),
          program(
            "program-inherited-2",
            inherited.department_id,
            "青年團契",
            noProgramScope
          ),
        ],
        [
          program(
            "program-exact",
            exact.department_id,
            "社區關懷",
            programScope
          ),
          program(
            "program-public",
            exact.department_id,
            "公開活動",
            noProgramScope
          ),
          program(
            "program-exact",
            exact.department_id,
            "重複資料",
            programScope
          ),
        ],
      ]
    );

    expect(
      new Set(rows.map(({ program: value }) => value.program_id))
    ).toStrictEqual(
      new Set(["program-inherited-1", "program-inherited-2", "program-exact"])
    );
    expect(rows.filter(({ scope }) => scope === "department")).toHaveLength(2);
    expect(
      rows.find(({ program: value }) => value.program_id === "program-exact")
        ?.scope
    ).toBe("program");
  });
});

describe(ManagementDirectory, () => {
  const departments = [
    department("dept-youth", "青年事工", departmentScope),
    department("dept-outreach", "外展事工", noDepartmentScope),
  ];
  const programsByDepartment = [
    [program("program-youth", "dept-youth", "查經小組", noProgramScope)],
    [
      program("program-leader", "dept-outreach", "社區關懷", programScope, {
        category: "關懷",
        description: "長者探訪。",
      }),
      program("program-public", "dept-outreach", "公開活動", noProgramScope),
    ],
  ];

  function mockDirectory() {
    mocks.getManagementDirectory.mockResolvedValue({
      departments,
      programs: programsByDepartment.flat(),
    });
  }

  test("loads only scoped Programs with Department context and search", async () => {
    mockDirectory();
    const onOpenProgram = vi.fn();
    render(<ManagementDirectory onOpenProgram={onOpenProgram} />);

    const list = await screen.findByRole("list", {
      name: COPY.programs.managementDirectoryListLabel,
    });
    expect(within(list).getAllByRole("button")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /查經小組/u })).toHaveTextContent(
      "青年事工"
    );
    expect(screen.getByRole("button", { name: /社區關懷/u })).toHaveTextContent(
      "外展事工"
    );
    expect(
      screen.queryByRole("button", { name: /公開活動/u })
    ).not.toBeInTheDocument();

    const search = screen.getByRole("searchbox", {
      name: COPY.programs.managementDirectorySearchLabel,
    });
    await userEvent.type(search, "外展");
    expect(
      screen.getByRole("button", { name: /社區關懷/u })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /查經小組/u })
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /社區關懷/u }));
    expect(onOpenProgram).toHaveBeenCalledWith("program-leader");
  });
  test("offers creation only from a Department management scope", async () => {
    mockDirectory();
    const onCreateProgram = vi.fn();
    render(
      <ManagementDirectory
        onOpenProgram={vi.fn()}
        onCreateProgram={onCreateProgram}
      />
    );

    await userEvent.click(
      await screen.findByRole("button", {
        name: COPY.programs.createProgram,
      })
    );
    expect(onCreateProgram).toHaveBeenCalledWith(departments);
  });
  test("uses source-specific server attention badges as exact task links", async () => {
    mockDirectory();
    const attention: ManagementAttention = {
      programs: [
        {
          program_id: "program-youth",
          department_id: "dept-youth",
          pending_enrollment_count: 2,
          inactive_event_count: 1,
          cancelled_event_count: 1,
          actionable_count: 3,
        },
      ],
      items: [],
      total_actionable_count: 3,
      has_more: false,
    };
    render(
      <ManagementDirectory
        attention={attention}
        onOpenProgram={vi.fn()}
      />
    );

    const row = await screen.findByRole("button", { name: /查經小組/u });
    expect(row).toHaveTextContent("查經小組");
    expect(
      screen.getByRole("link", { name: "待處理報名 2 項" })
    ).toHaveAttribute(
      "href",
      "/programs?mode=management&program=program-youth&task=participants"
    );
    expect(
      screen.getByRole("link", { name: "暫停聚會 1 場" })
    ).toHaveAttribute(
      "href",
      "/programs?mode=management&program=program-youth&task=events"
    );
    expect(
      screen.getByRole("link", { name: "已取消聚會 1 場" })
    ).toHaveAttribute(
      "href",
      "/programs?mode=management&program=program-youth&task=events"
    );
  });

  test("surfaces a forbidden state and retries without exposing records", async () => {
    mocks.getManagementDirectory
      .mockRejectedValueOnce(new RpcError({ code: "FORBIDDEN", status: 403 }))
      .mockResolvedValueOnce({
        departments,
        programs: programsByDepartment.flat(),
      });
    render(<ManagementDirectory onOpenProgram={vi.fn()} />);

    await expect(
      screen.findByRole("heading", {
        name: COPY.programs.managementDirectoryForbidden,
      })
    ).resolves.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", {
        name: COPY.programs.managementDirectoryRetry,
      })
    );
    await waitFor(() =>
      expect(mocks.getManagementDirectory).toHaveBeenCalledTimes(2)
    );
  });
});
