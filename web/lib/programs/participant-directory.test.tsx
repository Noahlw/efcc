/* oxlint-disable vitest/require-top-level-describe -- shared fixture hooks cover all PUI-02 describes */
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
import { ParticipantDirectory } from "@/lib/programs/participant-directory";
import type {
  ParticipantCatalogEntry,
  ProgramSummary,
} from "@/lib/programs/program-api";

const mocks = vi.hoisted(() => {
  const router = {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    refresh: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string, options?: unknown) => void>(),
  };
  return {
    listParticipantCatalog:
      vi.fn<() => Promise<{ catalog: ParticipantCatalogEntry[] }>>(),
    push: router.push,
    replace: router.replace,
    router,
  };
});

vi.mock(import("@/lib/programs/program-api"), () => ({
  listParticipantCatalog: mocks.listParticipantCatalog,
}));

vi.mock(import("next/navigation"), () => ({
  useRouter: () => mocks.router,
}));

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
      description: "週三門徒訓練查經。",
      category: "門徒訓練",
    }),
    programSummary("program-2", "青年團契", {
      description: "青年聚會。",
      category: "團契",
    }),
    programSummary("program-3", "社區關懷", {
      description: "長者探訪。",
      category: "關懷",
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

function renderDirectory(
  props: Partial<Parameters<typeof ParticipantDirectory>[0]> = {}
) {
  const onManagement = vi.fn<() => void>();
  const onOpenProgram = vi.fn<(programId: string) => void>();
  const view = render(
    <ParticipantDirectory
      programId={props.programId ?? null}
      canManage={props.canManage ?? false}
      onManagement={props.onManagement ?? onManagement}
      onOpenProgram={props.onOpenProgram ?? onOpenProgram}
    />
  );
  return { onManagement, onOpenProgram, view };
}

const rowNames = (): string[] =>
  screen
    .getAllByRole("button")
    .filter((button) => button.className.includes("directoryCard"))
    .map((button) => button.querySelector("span")?.textContent ?? "");

beforeEach(() => {
  mocks.listParticipantCatalog.mockReset();
  mocks.push.mockReset();
  mocks.replace.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("PUI-02 participant directory loading and collection", () => {
  test("shows a busy loading state, then one flat collection keyed by program_id", async () => {
    const pending = Promise.withResolvers<{
      catalog: ParticipantCatalogEntry[];
    }>();
    mocks.listParticipantCatalog.mockReturnValue(pending.promise);
    renderDirectory();

    const loading = screen.getByRole("status");
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading).toHaveTextContent(COPY.programs.catalogLoading);

    pending.resolve({ catalog: catalogFixture() });
    const list = await screen.findByRole("list", {
      name: COPY.programs.catalogListLabel,
    });
    expect(within(list).getAllByRole("button")).toHaveLength(3);
    // Department context renders as recognition metadata, never a nested step.
    expect(screen.getAllByText("青年事工").length).toBeGreaterThan(0);
  });

  test("empty catalog shows a distinct empty state", async () => {
    mocks.listParticipantCatalog.mockResolvedValue({ catalog: [] });
    renderDirectory();

    await expect(
      screen.findByRole("heading", { name: COPY.programs.catalogEmpty })
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.catalogEmptyHint)
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  test("rows expose only decision metadata and accessible lifecycle status text", async () => {
    mocks.listParticipantCatalog.mockResolvedValue({
      catalog: catalogFixture([
        programSummary("program-1", "查經小組", {
          category: "門徒訓練",
          lifecycle: "Active",
        }),
        programSummary("program-2", "青年團契", {
          category: "團契",
          lifecycle: "Draft",
        }),
        programSummary("program-3", "社區關懷", {
          category: "關懷",
          lifecycle: "Archived",
        }),
      ]),
    });
    renderDirectory();

    const row = await screen.findByRole("button", {
      name: /查經小組/u,
    });
    expect(row).toHaveTextContent("青年事工");
    expect(row).toHaveTextContent("門徒訓練");
    expect(row).toHaveTextContent(COPY.programs.filterActive);
    const list = screen.getByRole("list", {
      name: COPY.programs.catalogListLabel,
    });
    expect(
      within(list).getByRole("button", { name: /已存檔/u })
    ).toBeInTheDocument();
    expect(
      within(list).getByRole("button", { name: /草稿/u })
    ).toBeInTheDocument();
    expect(rowNames()).toHaveLength(3);
  });

  test("no check-in or management DTO fields are rendered", async () => {
    mocks.listParticipantCatalog.mockResolvedValue({
      catalog: catalogFixture([programSummary("program-1", "查經小組")]),
    });
    renderDirectory();

    await screen.findByRole("button", { name: /查經小組/u });
    expect(screen.queryByText(/check_in_token/iu)).not.toBeInTheDocument();
    expect(screen.queryByText(/capabilities/iu)).not.toBeInTheDocument();
  });
});

describe("PUI-02 participant directory search and filters", () => {
  test("search matches name, description, and category; clearing restores the stable list", async () => {
    const user = userEvent.setup();
    mocks.listParticipantCatalog.mockResolvedValue({
      catalog: catalogFixture(),
    });
    renderDirectory();

    await screen.findByRole("button", { name: /查經小組/u });
    const originalOrder = rowNames();

    const search = screen.getByRole("searchbox");
    await user.type(search, "團契");
    expect(rowNames()).toStrictEqual(["青年團契"]);

    await user.clear(search);
    await user.type(search, "門徒");
    expect(rowNames()).toStrictEqual(["查經小組"]);

    await user.clear(search);
    await user.type(search, "探訪");
    expect(rowNames()).toStrictEqual(["社區關懷"]);

    await user.click(
      screen.getByRole("button", { name: COPY.programs.catalogClearSearch })
    );
    expect(rowNames()).toStrictEqual(originalOrder);
  });

  test("lifecycle and participation filter chips narrow the catalog with aria-pressed", async () => {
    const user = userEvent.setup();
    mocks.listParticipantCatalog.mockResolvedValue({
      catalog: catalogFixture([
        programSummary("program-1", "查經小組", { lifecycle: "Active" }),
        programSummary("program-2", "青年團契", { lifecycle: "Draft" }),
        programSummary("program-3", "社區關懷", {
          lifecycle: "Archived",
          enrollment_mode: "ManagerOnly",
        }),
      ]),
    });
    renderDirectory();

    await screen.findByRole("button", { name: /查經小組/u });
    const draftChip = screen.getByRole("button", {
      name: COPY.programs.filterDraft,
    });
    await user.click(draftChip);
    expect(draftChip).toHaveAttribute("aria-pressed", "true");
    expect(rowNames()).toStrictEqual(["青年團契"]);

    await user.click(
      screen.getAllByRole("button", { name: COPY.programs.filterAll })[0]
    );

    const managerOnlyChip = screen.getByRole("button", {
      name: COPY.programs.filterManagerOnly,
    });
    await user.click(managerOnlyChip);
    expect(managerOnlyChip).toHaveAttribute("aria-pressed", "true");
    expect(rowNames()).toStrictEqual(["社區關懷"]);

    await user.click(
      screen.getAllByRole("button", { name: COPY.programs.filterAll })[1]
    );
    expect(rowNames()).toHaveLength(3);
  });
  test("filter-only no-match state explains and clears active filters", async () => {
    const user = userEvent.setup();
    mocks.listParticipantCatalog.mockResolvedValue({
      catalog: catalogFixture([programSummary("program-1", "查經小組")]),
    });
    renderDirectory();

    await screen.findByRole("button", { name: /查經小組/u });
    await user.click(
      screen.getByRole("button", { name: COPY.programs.filterDraft })
    );

    await expect(
      screen.findByRole("heading", { name: COPY.programs.catalogNoMatches })
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.catalogNoFilterMatchesHint)
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: COPY.programs.catalogClearFilters })
    );
    await expect(
      screen.findByRole("button", { name: /查經小組/u })
    ).resolves.toBeInTheDocument();
  });

  test("empty search result is distinct and recoverable by clearing", async () => {
    const user = userEvent.setup();
    mocks.listParticipantCatalog.mockResolvedValue({
      catalog: catalogFixture(),
    });
    renderDirectory();

    await screen.findByRole("button", { name: /查經小組/u });
    const search = screen.getByRole("searchbox");
    await user.type(search, "完全不存在");

    await expect(
      screen.findByRole("heading", {
        name: `${COPY.programs.catalogNoMatches}「完全不存在」`,
      })
    ).resolves.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();

    const panel = document.querySelector<HTMLElement>(
      "#programs-catalog-state"
    );
    if (!panel) {
      throw new Error("empty-search state panel is not exposed");
    }
    await user.click(
      within(panel).getByRole("button", {
        name: COPY.programs.catalogClearSearch,
      })
    );
    await expect(
      screen.findByRole("button", { name: /查經小組/u })
    ).resolves.toBeInTheDocument();
    expect(rowNames()).toHaveLength(3);
  });
});

describe("PUI-02 participant directory recovery and handoff", () => {
  test("ignores a stale superseded catalog response in favor of the fresh one", async () => {
    const stale = Promise.withResolvers<{
      catalog: ParticipantCatalogEntry[];
    }>();
    mocks.listParticipantCatalog.mockReturnValue(stale.promise);

    const { rerender } = render(
      <StrictMode>
        <ParticipantDirectory
          key="stale"
          programId={null}
          canManage={false}
          onManagement={vi.fn<() => void>()}
          onOpenProgram={vi.fn<(programId: string) => void>()}
        />
      </StrictMode>
    );

    mocks.listParticipantCatalog.mockResolvedValue({
      catalog: catalogFixture([programSummary("program-2", "新鮮課程")]),
    });
    rerender(
      <StrictMode>
        <ParticipantDirectory
          key="fresh"
          programId={null}
          canManage={false}
          onManagement={vi.fn<() => void>()}
          onOpenProgram={vi.fn<(programId: string) => void>()}
        />
      </StrictMode>
    );

    const freshRow = await screen.findByRole("button", { name: /新鮮課程/u });
    stale.resolve({
      catalog: catalogFixture([programSummary("program-1", "過期課程")]),
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /過期課程/u })
      ).not.toBeInTheDocument();
    });
    expect(freshRow).toBeInTheDocument();
  });

  test("deep-link intent with a non-visible Program shows an unavailable notice while the directory stays interactive", async () => {
    mocks.listParticipantCatalog.mockResolvedValue({
      catalog: catalogFixture(),
    });
    renderDirectory({ programId: "missing-1" });

    const unavailable = await screen.findByText(
      COPY.programs.programUnavailable
    );
    expect(unavailable.closest('[role="status"]')).toHaveTextContent(
      COPY.programs.programUnavailableHint
    );
    expect(
      screen.getByRole("button", { name: /查經小組/u })
    ).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });

  test("deep-link intent with a visible Program shows the preserved-link notice", async () => {
    mocks.listParticipantCatalog.mockResolvedValue({
      catalog: catalogFixture(),
    });
    renderDirectory({ programId: "program-1" });

    const preserved = await screen.findByText(
      COPY.programs.directProgramIntent
    );
    expect(preserved.closest('[role="status"]')).toHaveTextContent("查經小組");
  });

  test("recoverable transport failure shows a retry that restores the catalog and refocuses on re-error", async () => {
    const user = userEvent.setup();
    mocks.listParticipantCatalog
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ catalog: catalogFixture() });
    renderDirectory();

    const heading = await screen.findByRole("heading", {
      name: COPY.programs.catalogLoadError,
    });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText(COPY.error.networkError)).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: COPY.programs.catalogRetry })
    );
    const failedAgain = await screen.findByRole("heading", {
      name: COPY.programs.catalogLoadError,
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(failedAgain.parentElement);
    });

    await user.click(
      screen.getByRole("button", { name: COPY.programs.catalogRetry })
    );
    await expect(
      screen.findByRole("button", { name: /查經小組/u })
    ).resolves.toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });

  test("FORBIDDEN catalog failure shows the forbidden state with retry", async () => {
    const user = userEvent.setup();
    mocks.listParticipantCatalog
      .mockRejectedValueOnce(new RpcError({ code: "FORBIDDEN", status: 403 }))
      .mockResolvedValueOnce({ catalog: catalogFixture() });
    renderDirectory();

    await expect(
      screen.findByRole("heading", {
        name: COPY.programs.catalogForbidden,
      })
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.catalogForbiddenHint)
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: COPY.programs.catalogRetry })
    );
    await expect(
      screen.findByRole("button", { name: /查經小組/u })
    ).resolves.toBeInTheDocument();
  });

  test("expired session defers to login and stores the deep link", async () => {
    mocks.listParticipantCatalog.mockRejectedValue(
      new RpcError({ code: "AUTH_REQUIRED", status: 401 })
    );
    renderDirectory();

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/");
    });
  });

  test("row selection hands off the opaque Program id without inventing a second URL grammar", async () => {
    const user = userEvent.setup();
    mocks.listParticipantCatalog.mockResolvedValue({
      catalog: catalogFixture(),
    });
    const { onOpenProgram } = renderDirectory();

    await user.click(await screen.findByRole("button", { name: /青年團契/u }));
    expect(onOpenProgram).toHaveBeenCalledWith("program-2");
  });

  test("management entry appears only with server-projected capability", async () => {
    mocks.listParticipantCatalog.mockResolvedValue({
      catalog: catalogFixture(),
    });
    const { onManagement, view } = renderDirectory({ canManage: true });

    const entry = await screen.findByRole("button", {
      name: COPY.programs.enterManagement,
    });
    await userEvent.click(entry);
    expect(onManagement).toHaveBeenCalledOnce();
    view.unmount();
  });
});
