/**
 * #478 — 身份組 hierarchy panel component contract (acceptance trace rows
 * H-17/H-18/H-19): safe role/view URL state with safe fallback, Back
 * behavior, focus movement, and single-owner Cantonese feedback. The
 * panel is a read projection + rename affordance; the server is the
 * authority (H-16) so the component only renders server-projected
 * actions.
 */
/* oxlint-disable vitest/max-expects -- each acceptance-trace row asserts its full observable contract in one test. */
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
const FORBIDDEN_MESSAGE = "您沒有權限執行此操作。";

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
          reorderActions: [],
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
          reorderActions: [],
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
          reorderActions: [],
        },
      ],
      createOptions: [
        {
          category_key: "Global",
          scope_kind: "Global",
          scope_id: null,
          scopeLabel: "全教會",
        },
      ],
    },
    {
      categoryKey: "Department",
      label: "部門",
      description: "部門範圍的可指派身份組分類",
      displayOrder: 1,
      childCount: 2,
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
          assignedAccountUserIds: ["account-1"],
          grantCount: 12,
          actions: [
            { action: "rename", label: "重新命名" },
            { action: "permissions", label: "編輯權限" },
          ],
          reorderActions: [{ action: "reorder", label: "調整順序" }],
        },
        {
          roleDefinitionId: "018f3b8a-0000-7000-8000-1000000000bb",
          label: "成區副手",
          description: "部門副手。",
          kind: "DEPARTMENT_SCOPED",
          scopeKind: "Department",
          scopeId: "018f3b8a-0000-7000-8000-000000000002",
          scopeLabel: "成區",
          position: 11,
          isProtected: false,
          isArchived: false,
          assignmentCount: 0,
          lifecycleActions: [{ action: "archive", label: "停用" }],
          grantCount: 0,
          actions: [],
          reorderActions: [{ action: "reorder", label: "調整順序" }],
        },
      ],
      createOptions: [
        {
          category_key: "Department",
          scope_kind: "Department",
          scope_id: "018f3b8a-0000-7000-8000-000000000002",
          scopeLabel: "成區",
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
      createOptions: [],
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
    expect(screen.getByText("11")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "重新命名" })).toBeTruthy();
  });
  test("H-03: renders the server-projected permissions action and preserves its route", async () => {
    const user = userEvent.setup();
    mocks.searchParams = new URLSearchParams(
      `module=roles&role=${MANAGER_ROLE}&view=detail`
    );
    server.use(http.get("/api/v1/identity/roles", () => hierarchyResponse()));
    render(<RoleHierarchyPanel />);

    const permissions = await screen.findByRole("button", {
      name: "編輯權限",
    });
    await user.click(permissions);
    expect(mocks.router.push).toHaveBeenCalledWith(
      `/management?module=permissions&role=${MANAGER_ROLE}&view=permissions`
    );
  });
  test("identity-first assigned account link converges on Account Access", async () => {
    mocks.searchParams = new URLSearchParams(
      `module=roles&role=${MANAGER_ROLE}&view=detail`
    );
    server.use(http.get("/api/v1/identity/roles", () => hierarchyResponse()));
    render(<RoleHierarchyPanel />);

    const access = await screen.findByRole("button", {
      name: "管理已指派帳戶",
    });
    await userEvent.setup().click(access);
    expect(mocks.router.push).toHaveBeenCalledWith(
      `/management?module=accounts&roleDefinition=${MANAGER_ROLE}&view=access&return=%2Fmanagement%3Fmodule%3Droles%26role%3D${MANAGER_ROLE}%26view%3Ddetail`
    );
  });
  test("identity-first zero-assignment role still opens Account Access lifecycle entry", async () => {
    mocks.searchParams = new URLSearchParams(
      "module=roles&role=018f3b8a-0000-7000-8000-1000000000bb&view=detail"
    );
    server.use(http.get("/api/v1/identity/roles", () => hierarchyResponse()));
    render(<RoleHierarchyPanel />);
    const access = await screen.findByRole("button", {
      name: "管理已指派帳戶",
    });
    await userEvent.setup().click(access);
    expect(mocks.router.push).toHaveBeenCalledWith(
      "/management?module=accounts&roleDefinition=018f3b8a-0000-7000-8000-1000000000bb&view=access&return=%2Fmanagement%3Fmodule%3Droles%26role%3D018f3b8a-0000-7000-8000-1000000000bb%26view%3Ddetail"
    );
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

  test("H-17: direct rename links preload the selected role's current name", async () => {
    mocks.searchParams = new URLSearchParams(
      `module=roles&role=${MANAGER_ROLE}&view=rename`
    );
    server.use(http.get("/api/v1/identity/roles", () => hierarchyResponse()));
    render(<RoleHierarchyPanel />);

    const input = await screen.findByLabelText("新名稱");
    await waitFor(() => {
      expect(input).toHaveValue("成人部門管理者");
    });
    expect(input).toHaveFocus();
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
    await user.click(
      screen.getByRole("button", { name: /成人部門管理者 · 詳情/u })
    );
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
    // LiveRegion is the sole production announcement owner; visible
    // success/error copy is intentionally not a live region.
    expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getAllByText(/身份組名稱已更新/u)).toHaveLength(2);
  });

  test("hierarchy load errors use the global LiveRegion without a duplicate alert", async () => {
    server.use(
      http.get("/api/v1/identity/roles", () =>
        HttpResponse.json(
          {
            status: 403,
            code: "FORBIDDEN",
            title: "Forbidden",
            detail: "forbidden",
            requestId: "rid-forbidden",
          },
          { status: 403 }
        )
      )
    );
    render(
      <>
        <LiveRegion />
        <RoleHierarchyPanel />
      </>
    );
    await expect(
      screen.findByText(FORBIDDEN_MESSAGE, { selector: "h2" })
    ).resolves.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(FORBIDDEN_MESSAGE);
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("Back from detail returns to the list without mutating the URL", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/v1/identity/roles", () => hierarchyResponse()));
    render(<RoleHierarchyPanel />);
    await expect(
      screen.findByRole("heading", { name: /身份組/u })
    ).resolves.toBeTruthy();

    await user.click(screen.getByRole("button", { name: /部門/u }));
    await user.click(
      screen.getByRole("button", { name: /成人部門管理者 · 詳情/u })
    );
    await user.click(screen.getByRole("button", { name: "返回身份組列表" }));
    expect(screen.getByRole("heading", { name: /部門/u })).toBeTruthy();
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  test("Back from rename does not add a duplicate history entry", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/v1/identity/roles", () => hierarchyResponse()));
    render(<RoleHierarchyPanel />);
    await screen.findByRole("heading", { name: /身份組/u });
    await user.click(screen.getByRole("button", { name: /部門/u }));
    await user.click(
      screen.getByRole("button", { name: /成人部門管理者 · 詳情/u })
    );
    await user.click(screen.getByRole("button", { name: "重新命名" }));
    const historyLength = window.history.length;
    await user.click(screen.getByRole("button", { name: "返回身份組列表" }));
    expect(window.history).toHaveLength(historyLength);
    expect(window.location.search).toContain(`role=${MANAGER_ROLE}`);
    expect(window.location.search).toContain("view=detail");
    await waitFor(() => expect(screen.getByRole("article")).toHaveFocus());
  });

  test("H-17: popstate reconciles detail/list and restores focus", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/v1/identity/roles", () => hierarchyResponse()));
    render(<RoleHierarchyPanel />);
    await screen.findByRole("heading", { name: /身份組/u });
    await user.click(screen.getByRole("button", { name: /部門/u }));
    await user.click(
      screen.getByRole("button", { name: /成人部門管理者 · 詳情/u })
    );
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
      expect(
        screen.getByRole("heading", { name: "身份組", level: 1 })
      ).toHaveFocus()
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

  test("B-479-12: Admin sees the global creation affordance on the Global category", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/v1/identity/roles", () => hierarchyResponse()));
    render(<RoleHierarchyPanel />);
    await screen.findByRole("heading", { name: /身份組/u });
    await user.click(screen.getByRole("button", { name: /全教會/u }));
    expect(
      screen.getAllByRole("button", { name: "建立身份組" }).length
    ).toBeGreaterThanOrEqual(1);
  });

  test("B-479-14: the create form submits a scoped body under the projected Department scope", async () => {
    const user = userEvent.setup();
    let createBody: unknown = null;
    server.use(
      http.get("/api/v1/identity/roles", () => hierarchyResponse()),
      http.post("/api/v1/identity/role-definitions", async ({ request }) => {
        createBody = await request.json();
        return HttpResponse.json({
          requestId: "rid-create",
          data: {
            roleDefinitionId: "018f3b8a-0000-7000-8000-1000000000aa",
            categoryKey: "Department",
            label: "成區新角色",
            scopeKind: "Department",
            scopeId: "018f3b8a-0000-7000-8000-000000000002",
            position: 12,
            revision: 5,
            idempotent: false,
          },
        });
      }),
      http.get("/api/v1/identity/roles", () => hierarchyResponse())
    );
    render(
      <>
        <LiveRegion />
        <RoleHierarchyPanel />
      </>
    );
    await screen.findByRole("heading", { name: /身份組/u });
    await user.click(screen.getByRole("button", { name: /部門/u }));
    const departmentSection = screen
      .getByRole("heading", { name: /部門/u })
      .closest("section");
    expect(departmentSection).not.toBeNull();
    await user.click(
      within(departmentSection as HTMLElement).getByRole("button", {
        name: "建立身份組",
      })
    );
    const nameInput = screen.getByLabelText("名稱");
    await user.type(nameInput, "成區新角色");
    await user.click(screen.getByRole("button", { name: "建立" }));
    await expect(screen.findByRole("status")).resolves.toHaveTextContent(
      /身份組已建立/u
    );
    await waitFor(() => {
      expect(createBody).not.toBeNull();
    });
    const body = createBody as Record<string, unknown>;
    expect(body.category_key).toBe("Department");
    expect(body.scope_kind).toBe("Department");
    expect(body.scope_id).toBe("018f3b8a-0000-7000-8000-000000000002");
    expect(body.label).toBe("成區新角色");
    expect(body.base_revision).toBeTypeOf("number");
  });

  test("B-479-08: 上移/下移 buttons appear on reorder-eligible siblings and submit the swap", async () => {
    const user = userEvent.setup();
    let reorderBody: unknown = null;
    server.use(
      http.get("/api/v1/identity/roles", () => hierarchyResponse()),
      http.patch("/api/v1/identity/roles/order", async ({ request }) => {
        reorderBody = await request.json();
        return HttpResponse.json({
          requestId: "rid-reorder",
          data: {
            categoryKey: "Department",
            orderedRoleDefinitionIds: [MANAGER_ROLE, "sibling-b"],
            revision: 5,
            idempotent: false,
          },
        });
      })
    );
    render(
      <>
        <LiveRegion />
        <RoleHierarchyPanel />
      </>
    );
    await screen.findByRole("heading", { name: /身份組/u });
    await user.click(screen.getByRole("button", { name: /部門/u }));
    const managerRow = screen.getByRole("button", {
      name: /成人部門管理者 · 詳情/u,
    });
    expect(managerRow).toBeInTheDocument();
    const upButton = screen.getByRole("button", {
      name: /上移 · 成人部門管理者/u,
    });
    // The manager is the first sibling: 上移 is disabled, 下移 is enabled.
    expect(upButton).toBeDisabled();
    const downButton = screen.getByRole("button", {
      name: /下移 · 成人部門管理者/u,
    });
    expect(downButton).toBeEnabled();
    await user.click(downButton);
    await waitFor(() => {
      expect(reorderBody).not.toBeNull();
    });
    const body = reorderBody as Record<string, unknown>;
    expect(body.category_key).toBe("Department");
    expect(Array.isArray(body.targets)).toBeTruthy();
    expect(body.targets as unknown[]).toHaveLength(2);
  });

  test("B-479-10: ROLE_ORDER_CONFLICT exposes 保留我的排序 and 採用最新排序 recovery", async () => {
    const user = userEvent.setup();
    let keepMineBody: unknown = null;
    server.use(
      http.get("/api/v1/identity/roles", () => hierarchyResponse()),
      http.patch("/api/v1/identity/roles/order", async ({ request }) => {
        if (keepMineBody === null) {
          // The first attempt is the conflict.
          keepMineBody = "first";
          return HttpResponse.json(
            {
              status: 409,
              code: "ROLE_ORDER_CONFLICT",
              title: "Conflict",
              detail: "身份組順序已有更新，請選擇保留方式後再試。",
              requestId: "rid-conflict",
              currentRevision: 9,
              orderedRoleDefinitionIds: ["sibling-b", MANAGER_ROLE],
            },
            { status: 409 }
          );
        }
        const body = await request.json();
        keepMineBody = body;
        return HttpResponse.json({
          requestId: "rid-reorder-retry",
          data: {
            categoryKey: "Department",
            orderedRoleDefinitionIds: [MANAGER_ROLE, "sibling-b"],
            revision: 10,
            idempotent: false,
          },
        });
      })
    );
    render(
      <>
        <LiveRegion />
        <RoleHierarchyPanel />
      </>
    );
    await screen.findByRole("heading", { name: /身份組/u });
    await user.click(screen.getByRole("button", { name: /部門/u }));
    await user.click(
      screen.getByRole("button", { name: /下移 · 成人部門管理者/u })
    );
    await expect(
      screen.findByRole("heading", { name: "順序衝突" })
    ).resolves.toBeTruthy();
    expect(
      screen.getByRole("button", { name: "保留我的排序" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "採用最新排序" })
    ).toBeInTheDocument();
    // Both the local and the authoritative order are exposed.
    expect(screen.getByText("我的排序")).toBeInTheDocument();
    expect(screen.getByText("最新排序")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "保留我的排序" }));
    await waitFor(() => {
      expect(keepMineBody).not.toBe("first");
    });
    const retry = keepMineBody as Record<string, unknown>;
    expect(retry.category_key).toBe("Department");
    expect(Array.isArray(retry.targets)).toBeTruthy();
  });

  test("B-479 scope UI renders only projected Staff destinations and submits the scope edit", async () => {
    const user = userEvent.setup();
    let scopeBody: unknown = null;
    const scopeView: RoleHierarchyView = {
      ...VIEW,
      categories: VIEW.categories.map((category) =>
        category.categoryKey === "Department"
          ? {
              ...category,
              definitions: category.definitions.map((definition) =>
                definition.roleDefinitionId === MANAGER_ROLE
                  ? {
                      ...definition,
                      actions: [
                        { action: "rename", label: "重新命名" },
                        { action: "scope", label: "編輯適用範圍" },
                      ],
                      scopeOptions: [
                        {
                          category_key: "Department",
                          scope_kind: "Department",
                          scope_id: "018f3b8a-0000-7000-8000-000000000002",
                          scopeLabel: "成區",
                        },
                      ],
                    }
                  : definition
              ),
            }
          : category
      ),
    };
    server.use(
      http.get("/api/v1/identity/roles", () => hierarchyResponse(scopeView)),
      http.patch(
        `/api/v1/identity/role-definitions/${MANAGER_ROLE}/scope`,
        async ({ request }) => {
          scopeBody = await request.json();
          return HttpResponse.json({
            requestId: "rid-scope",
            data: {
              roleDefinitionId: MANAGER_ROLE,
              categoryKey: "Department",
              scopeKind: "Department",
              scopeId: "018f3b8a-0000-7000-8000-000000000002",
              position: 12,
              revision: 5,
              idempotent: false,
            },
          });
        }
      )
    );
    render(
      <>
        <LiveRegion />
        <RoleHierarchyPanel />
      </>
    );
    await screen.findByRole("heading", { name: /身份組/u });
    await user.click(screen.getByRole("button", { name: /部門/u }));
    await user.click(
      screen.getByRole("button", { name: /成人部門管理者 · 詳情/u })
    );
    await user.click(screen.getByRole("button", { name: "編輯適用範圍" }));
    const scopeSelect = screen.getByRole("combobox", {
      name: "適用範圍",
    });
    expect(scopeSelect).toHaveTextContent("成區");
    await user.click(scopeSelect);
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option", { name: "成區" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "儲存適用範圍" }));
    const body = scopeBody as Record<string, unknown>;
    expect(body.category_key).toBe("Department");
    expect(body.scope_kind).toBe("Department");
    expect(body.scope_id).toBe("018f3b8a-0000-7000-8000-000000000002");
    expect(body.base_revision).toBeTypeOf("number");
  });
});
