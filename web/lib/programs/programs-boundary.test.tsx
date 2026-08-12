import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { RpcError } from "@/lib/api";
import { COPY } from "@/lib/copy";
import type {
  Department,
  ParticipantCatalogEntry,
  ParticipantProgramDetail,
  Program,
  ProgramSummary,
  ProgramsManagementAccess,
} from "@/lib/programs/program-api";
import { projectManagementAccess } from "@/lib/programs/programs-access";
import { ProgramsBoundary } from "@/lib/programs/programs-boundary";
import {
  buildProgramsHref,
  parseProgramsIntent,
} from "@/lib/programs/programs-intent";

const mocks = vi.hoisted(() => {
  const router = { push: vi.fn(), replace: vi.fn() };
  return {
    getManagementAccess: vi.fn(),
    getManagementDirectory: vi.fn(),
    getManagementProgram: vi.fn(),
    getParticipantProgramDetail: vi.fn(),
    listParticipantCatalog: vi.fn(),
    pathname: vi.fn(() => "/programs"),
    push: router.push,
    replace: router.replace,
    router,
  };
});

vi.mock(import("@/lib/programs/program-api"), () => ({
  getManagementAccess: mocks.getManagementAccess,
  getManagementDirectory: mocks.getManagementDirectory,
  getManagementProgram: mocks.getManagementProgram,
  getParticipantProgramDetail: mocks.getParticipantProgramDetail,
  listParticipantCatalog: mocks.listParticipantCatalog,
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

const managementAccess = (
  hasManagementCapability: boolean,
  scope: "department" | "program" | "none" = hasManagementCapability
    ? "department"
    : "none"
): ProgramsManagementAccess => ({
  hasManagementCapability,
  departmentScopes: scope === "department" ? 1 : 0,
  programScopes: scope === "program" ? 1 : 0,
});

const programSummary = (
  programId: string,
  name: string,
  overrides: Partial<ProgramSummary> = {}
): ProgramSummary => ({
  program_id: programId,
  department_id: "dept-1",
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
  ...overrides,
});

const catalogFixture = (
  programs: ProgramSummary[] = [
    programSummary("program-1", "查經小組", {
      description: "週三晚上的門徒訓練查經。",
      category: "門徒訓練",
    }),
  ]
): ParticipantCatalogEntry[] => [
  {
    department: {
      department_id: "dept-1",
      code: "D1",
      name: "青年事工",
      description: null,
      lifecycle: "Active",
      display_order: 0,
    },
    programs,
  },
];
const detailFixture = (): ParticipantProgramDetail => ({
  program: programSummary("program-1", "查經小組", {
    description: "週三晚上的門徒訓練查經。",
    category: "門徒訓練",
  }),
  department: {
    department_id: "dept-1",
    code: "D1",
    name: "青年事工",
    description: null,
    lifecycle: "Active",
    display_order: 0,
  },
  schedule_rules: [],
  events: [],
  enrollment: null,
  enrollment_access: "Eligible",
});

describe("Programs intent", () => {
  test("defaults to participant mode and preserves a valid Program intent", () => {
    expect(parseProgramsIntent("?program=program-1#overview")).toStrictEqual({
      mode: "participant",
      programId: "program-1",
      hash: "#overview",
      malformed: false,
    });
    expect(parseProgramsIntent("?program=program-1")).toStrictEqual({
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
    expect(parseProgramsIntent("?mode=sideways").malformed).toBeTruthy();
    expect(parseProgramsIntent("?program=bad%2Fid").malformed).toBeTruthy();
    expect(
      parseProgramsIntent("?mode=participant&mode=management").malformed
    ).toBeTruthy();
    expect(
      parseProgramsIntent("?program=program-1&program=program-2").malformed
    ).toBeTruthy();
    expect(
      parseProgramsIntent("?program=program-1&programId=program-1").malformed
    ).toBeTruthy();
  });

  test("preserves management task intent and rejects task links without a Program", () => {
    expect(
      parseProgramsIntent(
        "?mode=management&program=program-1&task=events#overview"
      )
    ).toStrictEqual({
      mode: "management",
      programId: "program-1",
      hash: "#overview",
      task: "events",
      malformed: false,
    });
    expect(
      buildProgramsHref({
        mode: "management",
        programId: "program-1",
        task: "participants",
      })
    ).toBe("/programs?mode=management&program=program-1&task=participants");
    expect(
      parseProgramsIntent("?mode=management&task=settings").malformed
    ).toBeTruthy();
    expect(
      parseProgramsIntent("?mode=management&program=program-1&task=unknown")
        .malformed
    ).toBeTruthy();
  });
});

describe("Programs boundary copy", () => {
  test("entry lead describes the boundary without promising deferred manager tasks", () => {
    expect(COPY.programs.entryLead).toContain("集中於此");
    expect(COPY.programs.entryLead).not.toContain("先選部門");
    expect(COPY.programs.malformedIntentHint).toContain("課程入口");
  });
});

describe("Programs capability projection", () => {
  test("uses only server-shaped scoped booleans, not profile role names", () => {
    expect(
      projectManagementAccess(
        [
          department({
            manage: false,
            publish: false,
            module_configure: false,
          }),
        ],
        [
          [
            program({
              manage: false,
              publish: false,
              enroll: true,
              leader_assign: false,
            }),
          ],
        ]
      )
    ).toStrictEqual({
      hasManagementCapability: false,
      departmentScopes: 0,
      programScopes: 0,
    });

    expect(
      projectManagementAccess(
        [
          department({
            manage: false,
            publish: false,
            module_configure: false,
          }),
        ],
        [
          [
            program({
              manage: true,
              publish: true,
              enroll: false,
              leader_assign: false,
            }),
          ],
        ]
      )
    ).toStrictEqual({
      hasManagementCapability: true,
      departmentScopes: 0,
      programScopes: 1,
    });
  });
});

beforeEach(() => {
  window.history.replaceState({}, "", "/programs");
  sessionStorage.clear();
  mocks.getManagementAccess.mockReset();
  mocks.getManagementDirectory.mockReset();
  mocks.getManagementProgram.mockReset();
  mocks.listParticipantCatalog.mockResolvedValue({ catalog: [] });
  mocks.getManagementDirectory.mockResolvedValue({
    departments: [],
    programs: [],
  });
  mocks.getParticipantProgramDetail.mockResolvedValue(detailFixture());
  mocks.push.mockReset();
  mocks.replace.mockReset();
});

afterEach(() => {
  cleanup();
});

test.each([
  ["Member", false],
  ["Program Leader", true],
  ["Department Manager", true],
  ["Staff", true],
  ["Admin", true],
] as const)(
  "%s enters Participant mode by default",
  async (_account, hasManagement) => {
    mocks.getManagementAccess.mockResolvedValue(
      managementAccess(hasManagement)
    );

    render(<ProgramsBoundary />);

    await expect(
      screen.findByRole("heading", { name: "參與者模式" })
    ).resolves.toBeInTheDocument();
    expect(document.querySelector("#programs-mode-panel")).toHaveAttribute(
      "role",
      "region"
    );
    if (hasManagement) {
      expect(
        screen.getByRole("button", { name: "進入管理模式" })
      ).toBeInTheDocument();
    } else {
      expect(
        screen.queryByRole("button", { name: "進入管理模式" })
      ).not.toBeInTheDocument();
    }
  }
);

describe("Programs boundary", () => {
  test("opens in participant mode and hides management without a scoped capability", async () => {
    mocks.getManagementAccess.mockResolvedValue(managementAccess(false));

    render(<ProgramsBoundary />);

    await expect(
      screen.findByRole("heading", { name: "參與者模式" })
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "進入管理模式" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("活動")).not.toBeInTheDocument();
  });

  test("preserves an existing Program hash when selecting another directory row", async () => {
    window.history.replaceState({}, "", "/programs#overview");
    mocks.getManagementAccess.mockResolvedValue(managementAccess(false));
    mocks.listParticipantCatalog.mockResolvedValue({
      catalog: catalogFixture([
        programSummary("program-1", "查經小組"),
        programSummary("program-2", "青年團契"),
      ]),
    });

    render(<ProgramsBoundary />);

    await userEvent.click(
      await screen.findByRole("button", { name: /青年團契/u })
    );

    expect(window.location.search).toBe("?program=program-2");
    expect(window.location.hash).toBe("#overview");
  });

  test("renders direct Program detail and returns to the directory safely", async () => {
    window.history.replaceState({}, "", "/programs?program=program-1#overview");
    mocks.getManagementAccess.mockResolvedValue(managementAccess(false));

    render(<ProgramsBoundary />);

    await expect(
      screen.findByRole("heading", { name: "查經小組" })
    ).resolves.toBeInTheDocument();
    expect(screen.getByText(COPY.programs.detailPurpose)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.detailBack })
    );
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#overview");
    await expect(
      screen.findByRole("heading", { name: COPY.programs.participantMode })
    ).resolves.toBeInTheDocument();
  });

  test("shows a compact accessible management entry from server scope and preserves Program intent", async () => {
    window.history.replaceState({}, "", "/programs?program=program-1#overview");
    mocks.getManagementAccess.mockResolvedValue(managementAccess(true));

    render(<ProgramsBoundary />);

    const managementButton = await screen.findByRole("button", {
      name: "進入管理模式",
    });
    expect(
      screen.queryByRole("tab", { name: "參與者模式" })
    ).not.toBeInTheDocument();

    await userEvent.click(managementButton);

    expect(window.location.pathname).toBe("/programs");
    expect(window.location.search).toBe("?mode=management&program=program-1");
    expect(window.location.hash).toBe("#overview");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "管理模式" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.managementBoundaryHint)
    ).toBeInTheDocument();
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "管理模式" })
    );

    await userEvent.click(screen.getByRole("tab", { name: "參與者模式" }));
    await expect(
      screen.findByRole("heading", { name: "查經小組" })
    ).resolves.toBeInTheDocument();
  });

  test("supports keyboard mode entry and return", async () => {
    mocks.getManagementAccess.mockResolvedValue(managementAccess(true));
    const user = userEvent.setup();
    render(<ProgramsBoundary />);

    const managementButton = await screen.findByRole("button", {
      name: COPY.programs.enterManagement,
    });
    managementButton.focus();
    await user.keyboard("{Enter}");

    await expect(
      screen.findByRole("tab", { name: COPY.programs.managementMode })
    ).resolves.toHaveAttribute("aria-selected", "true");

    const participantTab = screen.getByRole("tab", {
      name: COPY.programs.participantMode,
    });
    participantTab.focus();
    await user.keyboard("{Enter}");
    await expect(
      screen.findByRole("heading", {
        name: COPY.programs.participantMode,
      })
    ).resolves.toBeInTheDocument();
  });

  test("follows same-route App Router query changes and restores focus on Back", async () => {
    mocks.getManagementAccess.mockResolvedValue(managementAccess(true));
    const { rerender } = render(<ProgramsBoundary />);

    await screen.findByRole("heading", { name: "參與者模式" });
    window.history.pushState({}, "", "/programs?mode=management");
    mocks.pathname.mockReturnValue("/programs");
    rerender(<ProgramsBoundary />);

    await expect(
      screen.findByRole("tab", { name: "管理模式" })
    ).resolves.toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "管理模式" })
    );

    window.history.pushState({}, "", "/programs");
    rerender(<ProgramsBoundary />);
    await expect(
      screen.findByRole("heading", { name: "參與者模式" })
    ).resolves.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  test("preserves hash-only Program intent on route synchronization", async () => {
    window.history.replaceState({}, "", "/programs#overview");
    mocks.getManagementAccess.mockResolvedValue(managementAccess(true));
    const { rerender } = render(<ProgramsBoundary />);

    const managementButton = await screen.findByRole("button", {
      name: "進入管理模式",
    });
    window.history.pushState({}, "", "/programs#details");
    rerender(<ProgramsBoundary />);
    await userEvent.click(managementButton);

    expect(window.location.pathname).toBe("/programs");
    expect(window.location.search).toBe("?mode=management");
    expect(window.location.hash).toBe("#details");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  test("keeps management data and tabs out of the loading frame", () => {
    const { promise } = Promise.withResolvers<ProgramsManagementAccess>();
    window.history.replaceState({}, "", "/programs?mode=management");
    mocks.getManagementAccess.mockReturnValue(promise);
    render(<ProgramsBoundary />);

    expect(screen.getByText("正在確認管理權限…")).toBeInTheDocument();
    expect(screen.queryByText("管理範圍已載入")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: COPY.programs.managementMode })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
  });

  test("ignores stale StrictMode access results after a fresh run", async () => {
    const stale = Promise.withResolvers<ProgramsManagementAccess>();
    mocks.getManagementAccess.mockReturnValue(stale.promise);

    const { rerender } = render(
      <StrictMode>
        <ProgramsBoundary key="stale" />
      </StrictMode>
    );

    mocks.getManagementAccess.mockResolvedValue(managementAccess(true));
    rerender(
      <StrictMode>
        <ProgramsBoundary key="fresh" />
      </StrictMode>
    );

    const managementEntry = await screen.findByRole("button", {
      name: "進入管理模式",
    });
    stale.resolve(managementAccess(false));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "進入管理模式" })).toBe(
        managementEntry
      );
    });
  });

  test("contains no-scope and forbidden states inside Programs", async () => {
    window.history.replaceState({}, "", "/programs?mode=management");
    mocks.getManagementAccess.mockResolvedValue(managementAccess(false));

    const { unmount } = render(<ProgramsBoundary />);
    await expect(
      screen.findByRole("heading", { name: "沒有管理範圍" })
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: COPY.programs.managementMode })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.enterParticipant })
    );
    expect(window.location.pathname).toBe("/programs");
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    unmount();

    mocks.getManagementAccess.mockRejectedValue(
      new RpcError({ code: "FORBIDDEN", status: 403 })
    );
    mocks.replace.mockReset();
    mocks.push.mockReset();
    window.history.replaceState({}, "", "/programs?mode=management");
    render(<ProgramsBoundary />);
    await expect(
      screen.findByRole("heading", { name: "無法進入管理模式" })
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: COPY.programs.managementMode })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "返回參與者模式" })
    );
    await expect(
      screen.findByRole("heading", { name: COPY.error.forbidden })
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "參與者模式" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.retryAccess })
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/programs");
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  test("moves focus to loading status when retry replaces an error", async () => {
    const pending = Promise.withResolvers<ProgramsManagementAccess>();
    window.history.replaceState({}, "", "/programs?mode=management");
    mocks.getManagementAccess
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
    mocks.getManagementAccess.mockRejectedValue(new Error("offline"));
    render(<ProgramsBoundary />);

    await expect(
      screen.findByRole("heading", { name: COPY.error.unavailable })
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.retryAccess })
    ).toBeInTheDocument();

    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: COPY.error.unavailable })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.retryAccess })
    ).toBeInTheDocument();
  });

  test("keeps default participant FORBIDDEN inside Programs with safe recovery", async () => {
    mocks.getManagementAccess.mockRejectedValue(
      new RpcError({ code: "FORBIDDEN", status: 403 })
    );
    render(<ProgramsBoundary />);

    await expect(
      screen.findByRole("heading", { name: COPY.error.forbidden })
    ).resolves.toBeInTheDocument();
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
      expect(mocks.getManagementAccess).toHaveBeenCalledTimes(2);
    });
    await expect(
      screen.findByRole("heading", { name: COPY.error.forbidden })
    ).resolves.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  test("keeps malformed intent recoverable at the Programs boundary", async () => {
    window.history.replaceState({}, "", "/programs?mode=sideways");

    render(<ProgramsBoundary />);

    await expect(
      screen.findByRole("heading", { name: "連結資料無效" })
    ).resolves.toBeInTheDocument();
    expect(mocks.getManagementAccess).not.toHaveBeenCalled();

    const malformedPanel = screen
      .getAllByRole("region", { name: COPY.programs.pageTitle })
      .find((element) => element.id === "programs-mode-panel");
    if (!malformedPanel) {
      throw new Error("malformed Programs panel is not exposed as a region");
    }
    expect(malformedPanel).toHaveAttribute("aria-labelledby", "programs-title");
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();

    mocks.getManagementAccess.mockResolvedValue(managementAccess(false));
    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.backToEntry })
    );
    expect(window.location.pathname).toBe("/programs");
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: COPY.programs.participantMode })
      ).toBeInTheDocument();
    });
  });

  test("stores the full Programs URL before expired-session recovery", async () => {
    window.history.replaceState(
      {},
      "",
      "/programs?mode=management&program=program-1#overview"
    );
    mocks.getManagementAccess.mockRejectedValue(
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

describe("PUI-02 Programs directory (boundary integration)", () => {
  test("participant mode loads the server catalog as one coherent collection", async () => {
    mocks.getManagementAccess.mockResolvedValue(managementAccess(false));
    mocks.listParticipantCatalog.mockResolvedValue({
      catalog: catalogFixture([
        programSummary("program-1", "查經小組", { category: "門徒訓練" }),
        programSummary("program-2", "青年團契", { category: "團契" }),
      ]),
    });

    render(<ProgramsBoundary />);

    const list = await screen.findByRole("list", {
      name: COPY.programs.catalogListLabel,
    });
    expect(
      within(list).getByRole("button", { name: /查經小組/u })
    ).toBeInTheDocument();
    expect(
      within(list).getByRole("button", { name: /青年團契/u })
    ).toBeInTheDocument();
    expect(screen.getAllByText("青年事工").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("tab", { name: COPY.programs.managementMode })
    ).not.toBeInTheDocument();
  });

  test("row selection pushes the canonical Program intent URL", async () => {
    mocks.getManagementAccess.mockResolvedValue(managementAccess(true));
    mocks.listParticipantCatalog.mockResolvedValue({
      catalog: catalogFixture(),
    });

    render(<ProgramsBoundary />);

    const row = await screen.findByRole("button", { name: /查經小組/u });
    await userEvent.click(row);

    expect(window.location.pathname).toBe("/programs");
    expect(window.location.search).toBe("?program=program-1");
    expect(window.location.hash).toBe("");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: COPY.programs.enterManagement })
    ).toBeInTheDocument();
  });

  test("deep-link intent opens detail or privacy-preserving unavailable state", async () => {
    mocks.getManagementAccess.mockResolvedValue(managementAccess(false));
    window.history.replaceState({}, "", "/programs?program=program-1#overview");
    const { unmount } = render(<ProgramsBoundary />);

    await expect(
      screen.findByRole("heading", { name: "查經小組" })
    ).resolves.toBeInTheDocument();
    unmount();

    mocks.getParticipantProgramDetail.mockRejectedValueOnce(
      new RpcError({ code: "NOT_FOUND", status: 404 })
    );
    window.history.replaceState({}, "", "/programs?program=missing-1");
    render(<ProgramsBoundary />);
    await expect(
      screen.findByRole("heading", { name: COPY.programs.detailUnavailable })
    ).resolves.toBeInTheDocument();
    expect(screen.queryByText("missing-1")).not.toBeInTheDocument();
  });

  test("catalog transport failure keeps a recoverable retry inside Programs", async () => {
    mocks.getManagementAccess.mockResolvedValue(managementAccess(false));
    mocks.listParticipantCatalog
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ catalog: catalogFixture() });

    render(<ProgramsBoundary />);

    await expect(
      screen.findByRole("heading", {
        name: COPY.programs.catalogLoadError,
      })
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.programs.catalogRetry })
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: COPY.programs.catalogRetry })
    );
    await expect(
      screen.findByRole("button", { name: /查經小組/u })
    ).resolves.toBeInTheDocument();
  });
});
