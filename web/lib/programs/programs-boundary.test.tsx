import { StrictMode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { COPY } from "@/lib/copy";
import { RpcError } from "@/lib/api";
import type { Department, Program } from "@/lib/programs/program-api";
import { ProgramsBoundary } from "@/lib/programs/programs-boundary";
import {
  buildProgramsHref,
  parseProgramsIntent,
} from "@/lib/programs/programs-intent";
import { projectManagementAccess } from "@/lib/programs/programs-access";

const mocks = vi.hoisted(() => {
  const router = { push: vi.fn(), replace: vi.fn() };
  return {
    listDepartments: vi.fn(),
    listPrograms: vi.fn(),
    pathname: vi.fn(() => "/programs"),
    push: router.push,
    replace: router.replace,
    router,
  };
});

vi.mock("@/lib/programs/program-api", () => ({
  listDepartments: mocks.listDepartments,
  listPrograms: mocks.listPrograms,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname(),
  useRouter: () => mocks.router,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));


const department = (capabilities: Department["capabilities"]): Department => ({
  department_id: "dept-1",
  code: "D1",
  name: "部門",
  description: null,
  lifecycle: "Active",
  display_order: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  capabilities,
});

const program = (capabilities: Program["capabilities"]): Program => ({
  program_id: "program-1",
  department_id: "dept-1",
  name: "活動",
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
});

describe("Programs intent", () => {
  test("defaults to participant mode and preserves a valid Program intent", () => {
    expect(parseProgramsIntent("?program=program-1#overview")).toEqual({
      mode: "participant",
      programId: "program-1",
      hash: "#overview",
      malformed: false,
    });
    expect(parseProgramsIntent("?program=program-1")).toEqual({
      mode: "participant",
      programId: "program-1",
      hash: null,
      malformed: false,
    });
    expect(
      buildProgramsHref({
        mode: "participant",
        programId: "program-1",
        hash: "#overview",
      })
    ).toBe("/programs?program=program-1#overview");
  });

  test("keeps management mode URL-addressable and rejects malformed intent", () => {
    expect(
      buildProgramsHref({ mode: "management", programId: "program-1" })
    ).toBe("/programs?mode=management&program=program-1");
    expect(parseProgramsIntent("?mode=sideways").malformed).toBe(true);
    expect(parseProgramsIntent("?program=bad%2Fid").malformed).toBe(true);
  });
});

describe("Programs boundary copy", () => {
  test("entry lead describes the boundary without promising deferred manager tasks", () => {
    expect(COPY.programs.entryLead).toContain("集中於此");
    expect(COPY.programs.entryLead).not.toContain("先選部門");
  });
});

describe("Programs capability projection", () => {
  test("uses only server-shaped scoped booleans, not profile role names", () => {
    expect(
      projectManagementAccess(
        [department({ manage: false, publish: false, module_configure: false })],
        [[program({ manage: false, publish: false, enroll: true, leader_assign: false })]]
      )
    ).toEqual({
      hasManagementCapability: false,
      departmentScopes: 0,
      programScopes: 0,
    });

    expect(
      projectManagementAccess(
        [department({ manage: false, publish: false, module_configure: false })],
        [[
          program({
            manage: true,
            publish: true,
            enroll: false,
            leader_assign: false,
          }),
        ]]
      )
    ).toEqual({
      hasManagementCapability: true,
      departmentScopes: 0,
      programScopes: 1,
    });
  });
});

beforeEach(() => {
  window.history.replaceState({}, "", "/programs");
  sessionStorage.clear();
  mocks.listDepartments.mockReset();
  mocks.listPrograms.mockReset();
  mocks.pathname.mockReturnValue("/programs");
  mocks.push.mockReset();
  mocks.replace.mockReset();
});

afterEach(() => {
  cleanup();
});

  test.each([
    [
      "Member",
      false,
      { manage: false, publish: false, module_configure: false },
      { manage: false, publish: false, enroll: true, leader_assign: false },
    ],
    [
      "Program Leader",
      true,
      { manage: false, publish: false, module_configure: false },
      { manage: true, publish: true, enroll: false, leader_assign: false },
    ],
    [
      "Department Manager",
      true,
      { manage: true, publish: true, module_configure: true },
      { manage: false, publish: false, enroll: false, leader_assign: false },
    ],
    [
      "Staff",
      true,
      { manage: true, publish: true, module_configure: true },
      { manage: false, publish: false, enroll: false, leader_assign: false },
    ],
    [
      "Admin",
      true,
      { manage: true, publish: true, module_configure: true },
      { manage: false, publish: false, enroll: false, leader_assign: false },
    ],
  ] as const)("%s enters Participant mode by default", async (_account, hasManagement, departmentCapabilities, programCapabilities) => {
    mocks.listDepartments.mockResolvedValue({
      departments: [department(departmentCapabilities)],
    });
    mocks.listPrograms.mockResolvedValue({
      programs: [program(programCapabilities)],
    });

    render(<ProgramsBoundary />);

    expect(
      await screen.findByRole("heading", { name: "參與者模式" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "參與者模式" })
    ).toHaveAttribute("aria-selected", "true");
    if (hasManagement) {
      expect(
        screen.getByRole("button", { name: "進入管理模式" })
      ).toBeInTheDocument();
    } else {
      expect(
        screen.queryByRole("button", { name: "進入管理模式" })
      ).not.toBeInTheDocument();
    }
  });

describe("Programs boundary", () => {
  test("opens in participant mode and hides management without a scoped capability", async () => {
    mocks.listDepartments.mockResolvedValue({
      departments: [
        department({ manage: false, publish: false, module_configure: false }),
      ],
    });
    mocks.listPrograms.mockResolvedValue({
      programs: [
        program({
          manage: false,
          publish: false,
          enroll: true,
          leader_assign: false,
        }),
      ],
    });

    render(<ProgramsBoundary />);

    expect(
      await screen.findByRole("heading", { name: "參與者模式" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "進入管理模式" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("活動")).not.toBeInTheDocument();
  });

  test("shows a compact accessible management entry from server scope and preserves Program intent", async () => {
    window.history.replaceState(
      {},
      "",
      "/programs?program=program-1#overview"
    );
    mocks.listDepartments.mockResolvedValue({
      departments: [
        department({ manage: true, publish: true, module_configure: true }),
      ],
    });

    render(<ProgramsBoundary />);

    const managementButton = await screen.findByRole("button", {
      name: "進入管理模式",
    });
    expect(
      screen.getByRole("tab", { name: "參與者模式" })
    ).toHaveAttribute("aria-selected", "true");

    await userEvent.click(managementButton);

    expect(mocks.push).toHaveBeenCalledWith(
      "/programs?mode=management&program=program-1#overview"
    );
    expect(
      screen.getByRole("heading", { name: "管理模式" })
    ).toBeInTheDocument();
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "管理模式" })
    );

    await userEvent.click(
      screen.getByRole("tab", { name: "參與者模式" })
    );
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "參與者模式" })
    );
  });

  test("follows same-route App Router query changes and restores focus on Back", async () => {
    mocks.listDepartments.mockResolvedValue({ departments: [] });
    const { rerender } = render(<ProgramsBoundary />);

    await screen.findByRole("heading", { name: "參與者模式" });
    window.history.pushState({}, "", "/programs?mode=management");
    mocks.pathname.mockReturnValue("/programs");
    rerender(<ProgramsBoundary />);

    expect(
      await screen.findByRole("tab", { name: "管理模式" })
    ).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "管理模式" })
    );

    window.history.pushState({}, "", "/programs");
    rerender(<ProgramsBoundary />);
    expect(
      await screen.findByRole("tab", { name: "參與者模式" })
    ).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "參與者模式" })
    );
  });


  test("preserves hash-only Program intent on route synchronization", async () => {
    window.history.replaceState({}, "", "/programs#overview");
    mocks.listDepartments.mockResolvedValue({
      departments: [
        department({ manage: true, publish: true, module_configure: true }),
      ],
    });
    const { rerender } = render(<ProgramsBoundary />);

    const managementButton = await screen.findByRole("button", {
      name: "進入管理模式",
    });
    window.history.pushState({}, "", "/programs#details");
    rerender(<ProgramsBoundary />);
    await userEvent.click(managementButton);

    expect(mocks.push).toHaveBeenCalledWith(
      "/programs?mode=management#details"
    );
  });
  test("keeps management data out of the loading frame", () => {
    const { promise } = Promise.withResolvers<{ departments: Department[] }>();
    mocks.listDepartments.mockReturnValue(promise);
    render(<ProgramsBoundary />);

    expect(screen.getByText("正在確認管理權限…")).toBeInTheDocument();
    expect(screen.queryByText("管理範圍已載入")).not.toBeInTheDocument();
  });

  test("ignores stale StrictMode access results after a fresh run", async () => {
    const stale = Promise.withResolvers<{ departments: Department[] }>();
    mocks.listDepartments.mockReturnValue(stale.promise);

    const { rerender } = render(
      <StrictMode>
        <ProgramsBoundary key="stale" />
      </StrictMode>
    );

    mocks.listDepartments.mockResolvedValue({
      departments: [
        department({ manage: true, publish: true, module_configure: true }),
      ],
    });
    rerender(
      <StrictMode>
        <ProgramsBoundary key="fresh" />
      </StrictMode>
    );

    const managementEntry = await screen.findByRole("button", {
      name: "進入管理模式",
    });
    stale.resolve({ departments: [] });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "進入管理模式" })
      ).toBe(managementEntry);
    });
  });

  test("contains no-scope and forbidden states inside Programs", async () => {
    window.history.replaceState({}, "", "/programs?mode=management");
    mocks.listDepartments.mockResolvedValue({ departments: [] });

    const { unmount } = render(<ProgramsBoundary />);
    expect(
      await screen.findByRole("heading", { name: "沒有管理範圍" })
    ).toBeInTheDocument();
    unmount();

    mocks.listDepartments.mockRejectedValue(
      new RpcError({ code: "FORBIDDEN", status: 403 })
    );
    render(<ProgramsBoundary />);
    expect(
      await screen.findByRole("heading", { name: "無法進入管理模式" })
    ).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "返回參與者模式" })
    );
    expect(
      await screen.findByRole("heading", { name: COPY.error.forbidden })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "參與者模式" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.retryAccess })
    ).toBeInTheDocument();
  });

  test("moves focus to loading status when retry replaces an error", async () => {
    const pending = Promise.withResolvers<{ departments: Department[] }>();
    window.history.replaceState({}, "", "/programs?mode=management");
    mocks.listDepartments
      .mockRejectedValueOnce(new Error("offline"))
      .mockReturnValueOnce(pending.promise);
    render(<ProgramsBoundary />);

    const retry = await screen.findByRole("button", {
      name: "重試確認管理權限",
    });
    await userEvent.click(retry);
    const loading = await screen.findByRole("status");
    expect(loading).toHaveAttribute("id", "programs-access-state");
    await waitFor(() => {
      expect(document.activeElement).toBe(loading);
    });
  });

  test("shows participant-mode transport failures with a retry action", async () => {
    mocks.listDepartments.mockRejectedValue(new Error("offline"));
    render(<ProgramsBoundary />);

    expect(
      await screen.findByRole("heading", { name: COPY.error.unavailable })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.retryAccess })
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("tab", { name: COPY.programs.participantMode })
    );
    expect(
      screen.getByRole("heading", { name: COPY.error.unavailable })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.retryAccess })
    ).toBeInTheDocument();
  });

  test("keeps default participant FORBIDDEN inside Programs with safe recovery", async () => {
    mocks.listDepartments.mockRejectedValue(
      new RpcError({ code: "FORBIDDEN", status: 403 })
    );
    render(<ProgramsBoundary />);

    expect(
      await screen.findByRole("heading", { name: COPY.error.forbidden })
    ).toBeInTheDocument();
    expect(screen.getByText(COPY.nav.unauthorized)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: COPY.programs.participantMode })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.enterManagement })
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.retryAccess })
    );
    await waitFor(() => {
      expect(mocks.listDepartments).toHaveBeenCalledTimes(2);
    });
    expect(
      await screen.findByRole("heading", { name: COPY.error.forbidden })
    ).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  test("keeps malformed intent recoverable at the Programs boundary", async () => {
    window.history.replaceState({}, "", "/programs?mode=sideways");

    render(<ProgramsBoundary />);

    expect(
      await screen.findByRole("heading", { name: "連結資料無效" })
    ).toBeInTheDocument();
    expect(mocks.listDepartments).not.toHaveBeenCalled();

    const malformedPanel = screen
      .getAllByRole("region", { name: COPY.programs.pageTitle })
      .find((element) => element.id === "programs-mode-panel");
    if (!malformedPanel) {
      throw new Error("malformed Programs panel is not exposed as a region");
    }
    expect(malformedPanel).toHaveAttribute(
      "aria-labelledby",
      "programs-title"
    );
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "返回首頁" }));
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "參與者模式" })
    );
  });
  test("stores the full Programs URL before expired-session recovery", async () => {
    window.history.replaceState(
      {},
      "",
      "/programs?mode=management&program=program-1#overview"
    );
    mocks.listDepartments.mockRejectedValue(
      new RpcError({ code: "AUTH_REQUIRED", status: 401 })
    );

    render(<ProgramsBoundary />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/");
    });
    expect(sessionStorage.getItem("efcc_deep_link")).toBe(
      "/programs?mode=management&program=program-1#overview"
    );
  });
});
