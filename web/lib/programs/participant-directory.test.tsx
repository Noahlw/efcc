/* oxlint-disable vitest/require-top-level-describe, vitest/prefer-import-in-mock, vitest/prefer-mock-promise-shorthand, vitest/prefer-called-with -- shared fixture hooks cover all PUI-02 describes */
import {
  cleanup,
  fireEvent,
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
  ParticipantCatalogProgram,
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

const catalogProgram = (
  programId: string,
  name: string,
  overrides: Partial<ParticipantCatalogProgram> = {}
): ParticipantCatalogProgram => ({
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
  viewerState: "eligible",
  nextEventStartsAt: null,
  upcomingEventCount: 0,
  ...overrides,
});

const catalogFixture = (
  programs: ParticipantCatalogProgram[] = [
    catalogProgram("program-1", "查經小組", {
      description: "週三門徒訓練查經。",
      category: "門徒訓練",
      viewerState: "active",
      nextEventStartsAt: "2026-03-10T11:30:00.000Z",
      upcomingEventCount: 4,
    }),
    catalogProgram("program-2", "青年團契", {
      description: "青年聚會。",
      category: "團契",
      viewerState: "eligible",
      nextEventStartsAt: "2026-03-15T06:00:00.000Z",
      upcomingEventCount: 2,
    }),
    catalogProgram("program-3", "社區關懷", {
      description: "長者探訪。",
      category: "關懷",
      viewerState: "pending",
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
  const managementHref = props.managementHref ?? "/programs?mode=management";
  const homeHref = props.homeHref ?? "/home";
  const programHref =
    props.programHref ??
    vi.fn((programId: string) => `/programs?program=${programId}`);
  const view = render(
    <ParticipantDirectory
      programId={props.programId ?? null}
      canManage={props.canManage ?? false}
      managementHref={managementHref}
      homeHref={homeHref}
      onOpenProgram={props.onOpenProgram}
      focusProgramId={props.focusProgramId}
      onFocusProgram={props.onFocusProgram}
      programHref={programHref}
    />
  );
  return { managementHref, homeHref, programHref, view };
}

const rowNames = (): string[] =>
  [...document.querySelectorAll<HTMLElement>("a[data-program-row]")].map(
    (link) => link.querySelector("[data-program-name]")?.textContent ?? ""
  );

beforeEach(() => {
  mocks.listParticipantCatalog.mockReset();
  mocks.push.mockReset();
  mocks.replace.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("PUI-02 participant directory loading and collection", () => {
  test("shows a loading skeleton with aria-label, then flat collection", async () => {
    const pending = Promise.withResolvers<{
      catalog: ParticipantCatalogEntry[];
    }>();
    mocks.listParticipantCatalog.mockReturnValue(pending.promise);
    renderDirectory();

    const loading = screen.getByRole("status");
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading).toHaveAttribute("aria-label", COPY.programs.catalogLoading);

    pending.resolve({ catalog: catalogFixture() });
    const list = await screen.findByRole("list", {
      name: COPY.programs.catalogListLabel,
    });
    expect(within(list).getAllByRole("link")).toHaveLength(3);
    expect(rowNames()).toStrictEqual(["查經小組", "青年團契", "社區關懷"]);
  });

  test("true empty catalog shows a no-programs state", async () => {
    mocks.listParticipantCatalog.mockResolvedValue({ catalog: [] });
    renderDirectory();

    await expect(
      screen.findByRole("heading", { name: COPY.programs.catalogNoPrograms })
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.catalogNoProgramsHint)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: COPY.programs.catalogClearFilters,
      })
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  test("rows expose active, pending, eligible, and managerOnly tags", async () => {
    mocks.listParticipantCatalog.mockResolvedValue({
      catalog: catalogFixture([
        catalogProgram("p-active", "查經小組", {
          viewerState: "active",
          nextEventStartsAt: "2026-03-10T11:30:00.000Z",
          upcomingEventCount: 3,
        }),
        catalogProgram("p-pending", "青年團契", {
          viewerState: "pending",
        }),
        catalogProgram("p-eligible", "主日崇拜", {
          viewerState: "eligible",
          nextEventStartsAt: "2026-03-15T02:00:00.000Z",
          upcomingEventCount: 5,
        }),
        catalogProgram("p-manager", "事奉團隊", {
          viewerState: "managerOnly",
        }),
      ]),
    });
    renderDirectory();

    const list = await screen.findByRole("list", {
      name: COPY.programs.catalogListLabel,
    });
    const buttons = within(list).getAllByRole("link");
    expect(buttons).toHaveLength(4);
    expect(buttons[0]).toHaveTextContent(COPY.programs.statusActive);
    expect(buttons[1]).toHaveTextContent(COPY.programs.statusPending);
    expect(buttons[2]).toHaveTextContent(COPY.programs.statusEligible);
    expect(buttons[3]).toHaveTextContent(COPY.programs.statusManagerOnly);
  });

  test("rows expose withdrawn, cancelled, rejected, and archived tags", async () => {
    mocks.listParticipantCatalog.mockResolvedValue({
      catalog: catalogFixture([
        catalogProgram("p-withdrawn", "長者團契", {
          viewerState: "withdrawn",
          description: "長者聚會簡介",
        }),
        catalogProgram("p-cancelled", "夫婦小組", {
          viewerState: "cancelled",
          description: "夫婦小組簡介",
        }),
        catalogProgram("p-rejected", "少年詩班", {
          viewerState: "rejected",
        }),
        catalogProgram("p-archived", "歷史講座", {
          viewerState: "archived",
        }),
      ]),
    });
    renderDirectory();

    const list = await screen.findByRole("list", {
      name: COPY.programs.catalogListLabel,
    });
    const buttons = within(list).getAllByRole("link");
    expect(buttons).toHaveLength(4);
    expect(buttons[0]).toHaveTextContent(COPY.programs.statusWithdrawn);
    expect(buttons[1]).toHaveTextContent(COPY.programs.statusCancelled);
    expect(buttons[2]).toHaveTextContent(COPY.programs.statusRejected);
    expect(buttons[3]).toHaveTextContent(COPY.programs.statusArchived);
  });

  test("no check-in or management DTO fields are rendered", async () => {
    mocks.listParticipantCatalog.mockResolvedValue({
      catalog: catalogFixture([catalogProgram("program-1", "查經小組")]),
    });
    renderDirectory();

    await screen.findByRole("link", { name: /查經小組/u });
    expect(screen.queryByText(/check_in_token/iu)).not.toBeInTheDocument();
    expect(screen.queryByText(/capabilities/iu)).not.toBeInTheDocument();
  });

  test("keeps long title and URL-like secondary content in the card", async () => {
    const longTitle = "超長課程名稱：門徒訓練與社區同行計劃";
    const longSecondary =
      "https://example.invalid/programs/this-is-a-deliberately-unbroken-value";
    mocks.listParticipantCatalog.mockResolvedValue({
      catalog: catalogFixture([
        catalogProgram("program-long", longTitle, {
          viewerState: "withdrawn",
          description: longSecondary,
          nextEventStartsAt: null,
          upcomingEventCount: 0,
        }),
      ]),
    });
    renderDirectory();

    const card = await screen.findByRole("link", { name: /超長課程名稱/u });
    expect(card).toHaveTextContent(longTitle);
    expect(card).toHaveTextContent(longSecondary);
    expect(card.querySelector("svg")).toBeInTheDocument();
  });
});

describe("PUI-02 participant directory search and filters", () => {
  test("catalog search is icon-only with an accessible name and visible placeholder", async () => {
    mocks.listParticipantCatalog.mockResolvedValue({
      catalog: catalogFixture(),
    });
    renderDirectory();

    await screen.findByRole("link", { name: /查經小組/u });
    expect(
      screen.queryByRole("heading", { name: COPY.programs.participantMode })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(COPY.programs.catalogSearchLabel)
    ).not.toBeInTheDocument();
    const search = screen.getByRole("searchbox", {
      name: COPY.programs.catalogSearchLabel,
    });
    expect(search).toHaveAttribute(
      "placeholder",
      COPY.programs.catalogSearchLabel
    );
    expect(search.closest("div")?.querySelector("svg")).not.toBeNull();
  });

  test("search matches name, description, and category; clearing restores all rows", async () => {
    const user = userEvent.setup();
    mocks.listParticipantCatalog.mockResolvedValue({
      catalog: catalogFixture(),
    });
    renderDirectory();

    await screen.findByRole("link", { name: /查經小組/u });
    const originalOrder = rowNames();

    const search = screen.getByRole("searchbox");
    await user.type(search, "團契");
    expect(rowNames()).toStrictEqual(["青年團契"]);

    await user.clear(search);
    await user.type(search, "門徒");
    expect(rowNames()).toStrictEqual(["查經小組"]);

    await user.clear(search);
    await user.type(search, "長者");
    expect(rowNames()).toStrictEqual(["社區關懷"]);

    await user.click(
      screen.getByRole("button", { name: COPY.programs.catalogClearSearch })
    );
    expect(rowNames()).toStrictEqual(originalOrder);
  });

  test("filter pill group filters by eligible and active states", async () => {
    const user = userEvent.setup();
    mocks.listParticipantCatalog.mockResolvedValue({
      catalog: catalogFixture([
        catalogProgram("p-active", "活躍課程", { viewerState: "active" }),
        catalogProgram("p-eligible", "可報名課程", { viewerState: "eligible" }),
        catalogProgram("p-pending", "待審批課程", { viewerState: "pending" }),
      ]),
    });
    renderDirectory();

    await screen.findByRole("link", { name: /活躍課程/u });
    const filterGroup = screen.getByRole("group", {
      name: COPY.programs.filterGroupLabel,
    });

    const allPill = within(filterGroup).getByRole("button", {
      name: COPY.programs.filterAll,
    });
    const eligiblePill = within(filterGroup).getByRole("button", {
      name: COPY.programs.filterEligible,
    });
    const activePill = within(filterGroup).getByRole("button", {
      name: COPY.programs.filterActive,
    });

    expect(allPill).toHaveAttribute("aria-pressed", "true");

    await user.click(eligiblePill);
    expect(eligiblePill).toHaveAttribute("aria-pressed", "true");
    expect(rowNames()).toStrictEqual(["可報名課程"]);

    await user.click(activePill);
    expect(activePill).toHaveAttribute("aria-pressed", "true");
    expect(rowNames()).toStrictEqual(["活躍課程"]);
  });

  test("filter pill group filters by pending state and resets to all", async () => {
    const user = userEvent.setup();
    mocks.listParticipantCatalog.mockResolvedValue({
      catalog: catalogFixture([
        catalogProgram("p-active", "活躍課程", { viewerState: "active" }),
        catalogProgram("p-pending", "待審批課程", { viewerState: "pending" }),
      ]),
    });
    renderDirectory();

    await screen.findByRole("link", { name: /活躍課程/u });
    const filterGroup = screen.getByRole("group", {
      name: COPY.programs.filterGroupLabel,
    });

    const allPill = within(filterGroup).getByRole("button", {
      name: COPY.programs.filterAll,
    });
    const pendingPill = within(filterGroup).getByRole("button", {
      name: COPY.programs.filterPending,
    });

    await user.click(pendingPill);
    expect(pendingPill).toHaveAttribute("aria-pressed", "true");
    expect(rowNames()).toStrictEqual(["待審批課程"]);

    await user.click(allPill);
    expect(allPill).toHaveAttribute("aria-pressed", "true");
    expect(rowNames()).toHaveLength(2);
  });

  test("empty search or filter zero-match is recoverable with clear filters button", async () => {
    const user = userEvent.setup();
    mocks.listParticipantCatalog.mockResolvedValue({
      catalog: catalogFixture([
        catalogProgram("p-1", "查經小組", { viewerState: "active" }),
      ]),
    });
    renderDirectory();

    await screen.findByRole("link", { name: /查經小組/u });

    const filterGroup = screen.getByRole("group", {
      name: COPY.programs.filterGroupLabel,
    });
    await user.click(
      within(filterGroup).getByRole("button", {
        name: COPY.programs.filterPending,
      })
    );

    await expect(
      screen.findByRole("heading", { name: COPY.programs.catalogEmpty })
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.catalogEmptyHint)
    ).toBeInTheDocument();

    const clearButton = screen.getByRole("button", {
      name: COPY.programs.catalogClearFilters,
    });
    await user.click(clearButton);

    await expect(
      screen.findByRole("link", { name: /查經小組/u })
    ).resolves.toBeInTheDocument();
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
          managementHref="/programs?mode=management"
          homeHref="/home"
          programHref={() => "/programs"}
        />
      </StrictMode>
    );

    mocks.listParticipantCatalog.mockResolvedValue({
      catalog: catalogFixture([catalogProgram("program-2", "新鮮課程")]),
    });
    rerender(
      <StrictMode>
        <ParticipantDirectory
          key="fresh"
          programId={null}
          canManage={false}
          managementHref="/programs?mode=management"
          homeHref="/home"
          programHref={() => "/programs"}
        />
      </StrictMode>
    );

    const freshRow = await screen.findByRole("link", { name: /新鮮課程/u });
    stale.resolve({
      catalog: catalogFixture([catalogProgram("program-1", "過期課程")]),
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("link", { name: /過期課程/u })
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
    expect(screen.getByRole("link", { name: /查經小組/u })).toBeInTheDocument();
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

  test("load-error alert renders with retry CTA and refocuses", async () => {
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
    expect(
      screen.getByText(COPY.programs.catalogLoadErrorHint)
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();

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
      screen.findByRole("link", { name: /查經小組/u })
    ).resolves.toBeInTheDocument();
  });

  test("retry preserves active search and filter state", async () => {
    const user = userEvent.setup();
    mocks.listParticipantCatalog
      .mockResolvedValueOnce({ catalog: catalogFixture() })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ catalog: catalogFixture() });
    const { homeHref, managementHref, programHref, view } = renderDirectory();

    await screen.findByRole("link", { name: /查經小組/u });
    const search = screen.getByRole("searchbox", {
      name: COPY.programs.catalogSearchLabel,
    });
    await user.type(search, "青年");
    const filterGroup = screen.getByRole("group", {
      name: COPY.programs.filterGroupLabel,
    });
    const eligible = within(filterGroup).getByRole("button", {
      name: COPY.programs.filterEligible,
    });
    await user.click(eligible);
    expect(rowNames()).toStrictEqual(["青年團契"]);

    mocks.router = { ...mocks.router };
    view.rerender(
      <ParticipantDirectory
        programId={null}
        canManage={false}
        managementHref={managementHref}
        homeHref={homeHref}
        programHref={programHref}
      />
    );
    await screen.findByRole("heading", {
      name: COPY.programs.catalogLoadError,
    });
    await user.click(
      screen.getByRole("button", { name: COPY.programs.catalogRetry })
    );

    await screen.findByRole("link", { name: /青年團契/u });
    expect(screen.getByRole("searchbox")).toHaveValue("青年");
    const eligibleAfter = within(
      screen.getByRole("group", { name: COPY.programs.filterGroupLabel })
    ).getByRole("button", { name: COPY.programs.filterEligible });
    expect(eligibleAfter).toHaveAttribute("aria-pressed", "true");
  });

  test("FORBIDDEN catalog failure shows the forbidden state with Home escape", async () => {
    mocks.listParticipantCatalog.mockRejectedValueOnce(
      new RpcError({ code: "FORBIDDEN", status: 403 })
    );
    const { homeHref } = renderDirectory();

    await expect(
      screen.findByRole("heading", {
        name: COPY.programs.catalogForbidden,
      })
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByText(COPY.programs.catalogForbiddenHint)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.programs.catalogRetry })
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("link", { name: COPY.nav.backToHome })
    ).toHaveAttribute("href", homeHref);
    expect(mocks.listParticipantCatalog).toHaveBeenCalledOnce();
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

  test("row selection hands off the opaque Program id", async () => {
    mocks.listParticipantCatalog.mockResolvedValue({
      catalog: catalogFixture(),
    });
    const { programHref } = renderDirectory();
    const link = await screen.findByRole("link", { name: /青年團契/u });
    expect(link).toHaveAttribute("href", "/programs?program=program-2");
    expect(programHref).toHaveBeenCalledWith("program-2");
  });

  test("records row navigation and restores focus to the origin row", async () => {
    mocks.listParticipantCatalog.mockResolvedValue({
      catalog: catalogFixture(),
    });
    const onOpenProgram = vi.fn();
    const onFocusProgram = vi.fn();
    renderDirectory({
      onOpenProgram,
      focusProgramId: "program-2",
      onFocusProgram,
    });

    const row = await screen.findByRole("link", { name: /青年團契/u });
    await waitFor(() => expect(document.activeElement).toBe(row));
    expect(onFocusProgram).toHaveBeenCalledOnce();

    fireEvent.click(row);
    expect(onOpenProgram).toHaveBeenCalledWith("program-2");
  });

  test("management entry appears only with server-projected capability", async () => {
    mocks.listParticipantCatalog.mockResolvedValue({
      catalog: catalogFixture(),
    });
    renderDirectory({
      canManage: true,
      managementHref: "/programs?mode=management",
    });

    const entry = await screen.findByRole("link", {
      name: COPY.programs.enterManagement,
    });
    expect(entry).toHaveAttribute("href", "/programs?mode=management");
  });
});
