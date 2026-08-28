/**
 * #478 — 身份組 hierarchy panel component contract (acceptance trace rows
 * H-17/H-18/H-19): safe role/view URL state with safe fallback, Back
 * behavior, focus movement, and single-owner Cantonese feedback. The
 * panel is a read projection + rename affordance; the server is the
 * authority (H-16) so the component only renders server-projected
 * actions.
 */
/* oxlint-disable vitest/max-expects -- each acceptance-trace row asserts its full observable contract in one test. */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { ReadonlyURLSearchParams } from "next/navigation";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import { RoleHierarchyPanel } from "@/app/management/role-hierarchy-panel";
import type { RoleHierarchyView } from "@/lib/identity";
import { LiveRegion } from "@/lib/live-region";

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  router: {
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    refresh: vi.fn<() => void>(),
    replace: vi.fn<(href: string) => void>(),
    push: vi.fn<(href: string) => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
}));

vi.mock(import("next/navigation"), () => ({
  useRouter: () => mocks.router,
  useSearchParams: () =>
    mocks.searchParams as unknown as ReadonlyURLSearchParams,
}));

const server = setupServer();

const ADMIN_ROLE = "018f3b8a-0000-7000-8000-000000000a01";
const MANAGER_ROLE = "018f3b8a-0000-7000-8000-100000000001";

const VIEW: RoleHierarchyView = {
  revision: 4,
  caller: { userId: "u-admin", highestPosition: 0 },
  categories: [
    {
      categoryKey: "Global",
      label: "全教會",
      description: "全教會範圍的身份組分類",
      displayOrder: 0,
      childCount: 3,
      definitions: [
        {
          roleDefinitionId: ADMIN_ROLE,
          label: "系統管理員",
          description: "全教會唯一可改變授權政策的身份。",
          kind: "SYSTEM",
          scopeKind: "Global",
          scopeId: null,
          scopeLabel: null,
          position: 0,
          isProtected: true,
          isArchived: false,
          assignmentCount: 1,
          grantCount: 0,
          actions: [],
        },
        {
          roleDefinitionId: "018f3b8a-0000-7000-8000-000000000a02",
          label: "同工",
          description: "全教會同工。",
          kind: "SYSTEM",
          scopeKind: "Global",
          scopeId: null,
          scopeLabel: null,
          position: 1,
          isProtected: false,
          isArchived: false,
          assignmentCount: 1,
          grantCount: 0,
          actions: [{ action: "rename", label: "重新命名" }],
        },
        {
          roleDefinitionId: "018f3b8a-0000-7000-8000-000000000a03",
          label: "會友基礎",
          description: "每位正式會友皆持有的最低限度身份。",
          kind: "SYSTEM",
          scopeKind: "Global",
          scopeId: null,
          scopeLabel: null,
          position: 999,
          isProtected: true,
          isArchived: false,
          assignmentCount: 1,
          grantCount: 1,
          actions: [],
        },
      ],
    },
    {
      categoryKey: "Department",
      label: "部門",
      description: "部門範圍的可指派身份組分類",
      displayOrder: 1,
      childCount: 1,
      definitions: [
        {
          roleDefinitionId: MANAGER_ROLE,
          label: "成人部門管理者",
          description: "可管理成人部門的日常運作及課程目錄。",
          kind: "DEPARTMENT_SCOPED",
          scopeKind: "Department",
          scopeId: "018f3b8a-0000-7000-8000-000000000002",
          scopeLabel: "成區",
          position: 10,
          isProtected: false,
          isArchived: false,
          assignmentCount: 1,
          grantCount: 12,
          actions: [{ action: "rename", label: "重新命名" }],
        },
      ],
    },
    {
      categoryKey: "Program",
      label: "課程",
      description: "課程範圍的可指派身份組分類",
      displayOrder: 2,
      childCount: 0,
      definitions: [],
    },
  ],
};

function hierarchyResponse(overrides: Partial<RoleHierarchyView> = {}) {
  return HttpResponse.json({
    requestId: "rid-role-hierarchy",
    data: { ...VIEW, ...overrides },
  });
}

describe(RoleHierarchyPanel, () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => {
    cleanup();
    server.resetHandlers();
    mocks.searchParams = new URLSearchParams();
    window.history.replaceState({}, "", "/");
    vi.clearAllMocks();
  });

  afterAll(() => server.close());

  test("H-01/H-02: categories collapse by default and expand locally", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/v1/identity/roles", () => hierarchyResponse()));
    render(<RoleHierarchyPanel />);

    await expect(
      screen.findByRole("heading", { name: /身份組/u })
    ).resolves.toBeTruthy();
    const globalToggle = screen.getByRole("button", { name: /全教會/u });
    const departmentToggle = screen.getByRole("button", { name: /部門/u });
    expect(globalToggle).toHaveAttribute("aria-expanded", "false");
    expect(departmentToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("系統管理員")).toBeNull();

    await user.click(globalToggle);
    expect(globalToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("系統管理員")).toBeInTheDocument();
    expect(screen.getByText("會友基礎")).toBeInTheDocument();
  });

  test("H-03: technical capability keys never appear as primary labels", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/v1/identity/roles", () => hierarchyResponse()));
    render(<RoleHierarchyPanel />);
    await screen.findByRole("heading", { name: /身份組/u });
    await user.click(screen.getByRole("button", { name: /部門/u }));
    expect(screen.getByText("成人部門管理者")).toBeInTheDocument();
    expect(screen.queryByText(/department\.manage/u)).toBeNull();
  });

  test("H-17: opens a detail via the URL role/view state and preserves Back", async () => {
    mocks.searchParams = new URLSearchParams(
      `module=roles&role=${MANAGER_ROLE}&view=detail`
    );
    server.use(http.get("/api/v1/identity/roles", () => hierarchyResponse()));
    render(<RoleHierarchyPanel />);

    await expect(
      screen.findByRole("heading", { name: "成人部門管理者" })
    ).resolves.toBeTruthy();
    expect(screen.getByText(/成區/u)).toBeTruthy();
    expect(screen.getByRole("button", { name: "重新命名" })).toBeTruthy();
  });

  test("H-18: a malformed role parameter falls back to the safe list", async () => {
    mocks.searchParams = new URLSearchParams(
      "module=roles&role=not-a-real-id&view=detail"
    );
    server.use(http.get("/api/v1/identity/roles", () => hierarchyResponse()));
    render(<RoleHierarchyPanel />);

    // The list renders (safe default), the unknown role is not selected,
    // and no detail for the malformed value is shown.
    await expect(
      screen.findByRole("heading", { name: /身份組/u })
    ).resolves.toBeTruthy();
    expect(screen.getByRole("heading", { name: /部門/u })).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "成人部門管理者" })
    ).toBeNull();
  });

  test("H-19: rename focus moves to the input and Cantonese success is announced once", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/v1/identity/roles", () => hierarchyResponse()),
      http.patch(`/api/v1/identity/roles/${MANAGER_ROLE}/name`, () =>
        HttpResponse.json({
          requestId: "rid-rename",
          data: {
            roleDefinitionId: MANAGER_ROLE,
            label: "成人部門主管",
            revision: 5,
            idempotent: false,
          },
        })
      )
    );
    render(
      <>
        <LiveRegion />
        <RoleHierarchyPanel />
      </>
    );
    await expect(
      screen.findByRole("heading", { name: /身份組/u })
    ).resolves.toBeTruthy();

    await user.click(screen.getByRole("button", { name: /部門/u }));
    await user.click(screen.getByRole("button", { name: /成人部門管理者/u }));
    await user.click(screen.getByRole("button", { name: "重新命名" }));
    const input = screen.getByLabelText("新名稱") as HTMLInputElement;
    expect(input.value).toBe("成人部門管理者");
    expect(document.activeElement).toBe(input);

    await user.clear(input);
    await user.type(input, "成人部門主管");
    await user.click(screen.getByRole("button", { name: "儲存名稱" }));

    await expect(screen.findByRole("status")).resolves.toHaveTextContent(
      /身份組名稱已更新/u
    );
    // LiveRegion is the sole production announcement owner; the visible
    // success copy is intentionally not a live region.
    expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    expect(screen.getAllByText(/身份組名稱已更新/u)).toHaveLength(2);
  });

  test("Back from detail returns to the list without mutating the URL", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/v1/identity/roles", () => hierarchyResponse()));
    render(<RoleHierarchyPanel />);
    await expect(
      screen.findByRole("heading", { name: /身份組/u })
    ).resolves.toBeTruthy();

    await user.click(screen.getByRole("button", { name: /部門/u }));
    await user.click(screen.getByRole("button", { name: /成人部門管理者/u }));
    await user.click(screen.getByRole("button", { name: "返回身份組列表" }));
    expect(screen.getByRole("heading", { name: /部門/u })).toBeTruthy();
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  test("H-17: popstate reconciles detail/list and restores focus", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/v1/identity/roles", () => hierarchyResponse()));
    render(<RoleHierarchyPanel />);
    await screen.findByRole("heading", { name: /身份組/u });
    await user.click(screen.getByRole("button", { name: /部門/u }));
    await user.click(screen.getByRole("button", { name: /成人部門管理者/u }));
    await waitFor(() => expect(screen.getByRole("article")).toHaveFocus());

    window.history.pushState(
      {},
      "",
      `/management?module=roles&role=${MANAGER_ROLE}&view=detail`
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
    await waitFor(() =>
      expect(screen.getByRole("article")).toBeInTheDocument()
    );

    window.history.pushState({}, "", "/management?module=roles");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /身份組/u })).toHaveFocus()
    );
  });

  test("H-17: rename URL is downgraded when the projection has no rename action", async () => {
    mocks.searchParams = new URLSearchParams(
      `module=roles&role=${ADMIN_ROLE}&view=rename`
    );
    server.use(http.get("/api/v1/identity/roles", () => hierarchyResponse()));
    render(<RoleHierarchyPanel />);
    await expect(
      screen.findByRole("heading", { name: "系統管理員" })
    ).resolves.toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "新名稱" })).toBeNull();
  });
});
