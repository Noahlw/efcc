/* #485 — Permission Editor observable component seam. */
/* oxlint-disable vitest/max-expects -- each test covers one acceptance-trace journey. */
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

import { PermissionEditorPanel } from "@/app/management/permission-editor-panel";
import type {
  RoleDefinitionDetailView,
  RoleDefinitionPermission,
  RoleHierarchyView,
} from "@/lib/identity";
import { CAPABILITY_CATALOG } from "@/lib/identity/capability-catalog";

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
const ROLE_ID = "018f3b8a-0000-7000-8000-100000000002";
const OTHER_ROLE_ID = "018f3b8a-0000-7000-8000-100000000003";

const HIERARCHY: RoleHierarchyView = {
  categories: [
    {
      categoryKey: "Program",
      label: "課程",
      description: "課程身份組",
      displayOrder: 2,
      childCount: 2,
      createOptions: [],
      definitions: [
        {
          roleDefinitionId: ROLE_ID,
          label: "青少年查經帶領",
          description: "課程身份",
          kind: "PROGRAM_SCOPED",
          scopeKind: "Program",
          scopeId: "program-1",
          scopeLabel: "青少年查經",
          position: 20,
          isProtected: false,
          isArchived: false,
          assignmentCount: 1,
          grantCount: 0,
          actions: [],
          reorderActions: [],
        },
        {
          roleDefinitionId: OTHER_ROLE_ID,
          label: "成人課程協作",
          description: "另一個課程身份",
          kind: "PROGRAM_SCOPED",
          scopeKind: "Program",
          scopeId: "program-2",
          scopeLabel: "成人課程",
          position: 21,
          isProtected: false,
          isArchived: false,
          assignmentCount: 0,
          grantCount: 0,
          actions: [],
          reorderActions: [],
        },
      ],
    },
  ],
  revision: 4,
  caller: { userId: "E2E_DISPOSABLE_ADMIN", highestPosition: 0 },
};

function permission(
  metadata: (typeof CAPABILITY_CATALOG)[number],
  overrides: Partial<RoleDefinitionPermission> = {}
): RoleDefinitionPermission {
  return {
    capability: metadata.capability,
    label: metadata.label,
    description: metadata.description,
    group: metadata.group,
    risk: metadata.risk,
    scopeRequired: metadata.scopeRequired,
    value: false,
    editable: true,
    locked: false,
    lockReason: null,
    ...overrides,
  };
}

function detail(
  roleDefinitionId = ROLE_ID,
  overrides: Partial<RoleDefinitionDetailView> = {}
): RoleDefinitionDetailView {
  const definition = HIERARCHY.categories[0]?.definitions.find(
    (item) => item.roleDefinitionId === roleDefinitionId
  );
  if (!definition) {
    throw new Error("fixture role missing");
  }
  return {
    roleDefinition: definition,
    permissions: CAPABILITY_CATALOG.map((metadata) => permission(metadata)),
    assignedAccounts: [
      {
        assignmentId: "assignment-1",
        userId: "E2E_DISPOSABLE_STAFF",
        name: "Disposable Staff",
        username: "disposable-staff",
        status: "Active",
      },
    ],
    revision: HIERARCHY.revision,
    caller: {
      userId: "E2E_DISPOSABLE_ADMIN",
      canRead: true,
      canWrite: true,
    },
    ...overrides,
  };
}

function installDetail(detailView = detail()) {
  server.use(
    http.get("/api/v1/identity/roles", () =>
      HttpResponse.json({ requestId: "hierarchy-request", data: HIERARCHY })
    ),
    http.get(
      "/api/v1/identity/role-definitions/:roleDefinitionId",
      ({ params }) =>
        HttpResponse.json({
          requestId: "detail-request",
          data: String(params.roleDefinitionId) === ROLE_ID ? detailView : detail(OTHER_ROLE_ID),
        })
    ),
    http.patch(
      "/api/v1/identity/role-definitions/:roleDefinitionId/grants",
      () => HttpResponse.json({ requestId: "patch-request", data: detailView })
    )
  );
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  mocks.searchParams = new URLSearchParams();
  mocks.router.push.mockClear();
  mocks.router.replace.mockClear();
  window.history.replaceState(null, "", "/management?module=permissions");
});
afterAll(() => server.close());

describe("PermissionEditorPanel", () => {
  test("uses a safe role list fallback and renders a continuous searchable catalog", async () => {
    installDetail();
    render(<PermissionEditorPanel />);

    const list = await screen.findByRole("list", { name: "身份組列表" });
    expect(within(list).getByText("青少年查經帶領")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /青少年查經帶領/u }));

    expect(
      await screen.findByRole("heading", { name: /青少年查經帶領/u, level: 2 })
    ).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "搜尋權限" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "身份組管理", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "課程", level: 3 })).toBeInTheDocument();

    const search = screen.getByRole("searchbox", { name: "搜尋權限" });
    await userEvent.type(search, "課程");
    expect(screen.getByText("課程管理")).toBeInTheDocument();
    expect(screen.queryByText("查看帳戶名錄")).not.toBeInTheDocument();
    expect(window.location.search).toContain("view=permissions");
  });

  test("normalizes malformed identity and view parameters to the safe role list", async () => {
    installDetail();
    mocks.searchParams = new URLSearchParams("module=permissions&role=&view=bad");
    window.history.replaceState(null, "", "/management?module=permissions&role=&view=bad");
    render(<PermissionEditorPanel />);

    expect(await screen.findByRole("list", { name: "身份組列表" })).toBeInTheDocument();
    expect(window.location.search).toBe("?module=permissions");
  });

  test("keeps locked rows visible and exposes controlled switch semantics", async () => {
    const locked = permission(CAPABILITY_CATALOG[0]!, {
      editable: false,
      locked: true,
      lockReason: "不可修改自己或更高順位的身份組。",
    });
    installDetail(
      detail(ROLE_ID, {
        permissions: [locked, ...CAPABILITY_CATALOG.slice(1).map((item) => permission(item))],
      })
    );
    mocks.searchParams = new URLSearchParams(
      `module=permissions&role=${ROLE_ID}&view=permissions`
    );
    render(<PermissionEditorPanel />);

    const switchControl = await screen.findByRole("switch", { name: "檢視身份組" });
    expect(switchControl).toHaveAttribute("aria-checked", "false");
    expect(switchControl).toBeDisabled();
    expect(switchControl).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText(/不可修改自己或更高順位/u)
    ).toBeInTheDocument();

    const editable = screen.getByRole("switch", { name: "部門管理" });
    editable.focus();
    await userEvent.keyboard(" ");
    expect(editable).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/1 項待儲存/u)).toBeInTheDocument();
  });

  test("opens a capped Sheet for ordinary changes and replaces the draft with the authoritative revision", async () => {
    const ordinary = permission(CAPABILITY_CATALOG.find((item) => item.capability === "department.manage")!);
    installDetail(detail(ROLE_ID, {
      permissions: [ordinary, ...CAPABILITY_CATALOG.filter((item) => item.capability !== "department.manage").map((item) => permission(item))],
      revision: 7,
    }));
    mocks.searchParams = new URLSearchParams(
      `module=permissions&role=${ROLE_ID}&view=permissions`
    );
    let patchBody: unknown;
    server.use(
      http.patch("/api/v1/identity/role-definitions/:roleDefinitionId/grants", async ({ request }) => {
        patchBody = await request.json();
        return HttpResponse.json({
          requestId: "patch-request",
          data: detail(ROLE_ID, {
            permissions: [{ ...ordinary, value: true }, ...CAPABILITY_CATALOG.filter((item) => item.capability !== "department.manage").map((item) => permission(item))],
            revision: 8,
          }),
        });
      })
    );
    render(<PermissionEditorPanel />);

    await userEvent.click(await screen.findByRole("switch", { name: "部門管理" }));
    await userEvent.click(screen.getByRole("button", { name: "儲存變更" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("確認權限變更")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "確認儲存" }));

    await waitFor(() => expect(screen.getByText(/版本 8/u)).toBeInTheDocument());
    expect(patchBody).toEqual({
      base_revision: 7,
      changes: [{ capability: "department.manage", value: true }],
    });
    expect(screen.getByRole("switch", { name: "部門管理" })).toHaveAttribute("aria-checked", "true");
  });

  test("preserves the dirty draft and unlocks controls after a non-conflict failure", async () => {
    installDetail();
    mocks.searchParams = new URLSearchParams(
      `module=permissions&role=${ROLE_ID}&view=permissions`
    );
    server.use(
      http.patch(
        "/api/v1/identity/role-definitions/:roleDefinitionId/grants",
        () =>
          HttpResponse.json(
            { status: 503, code: "UNAVAILABLE", requestId: "unavailable" },
            { status: 503 }
          )
      )
    );
    render(<PermissionEditorPanel />);

    const toggle = await screen.findByRole("switch", { name: "部門管理" });
    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole("button", { name: "儲存變更" }));
    await userEvent.click(screen.getByRole("button", { name: "確認儲存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/草稿仍保留/u);
    expect(screen.getByRole("switch", { name: "部門管理" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByRole("button", { name: "儲存變更" })).toBeEnabled();
  });

  test("uses dedicated review for high-risk changes and preserves a dirty draft after conflict recovery", async () => {
    const highRisk = permission(CAPABILITY_CATALOG.find((item) => item.capability === "role.read")!);
    const latest = detail(ROLE_ID, {
      permissions: [permission(CAPABILITY_CATALOG.find((item) => item.capability === "role.read")!), ...CAPABILITY_CATALOG.filter((item) => item.capability !== "role.read").map((item) => permission(item))],
      revision: 10,
    });
    installDetail(detail(ROLE_ID, { permissions: [highRisk, ...CAPABILITY_CATALOG.filter((item) => item.capability !== "role.read").map((item) => permission(item))], revision: 9 }));
    mocks.searchParams = new URLSearchParams(
      `module=permissions&role=${ROLE_ID}&view=permissions`
    );
    let detailCalls = 0;
    server.resetHandlers(
      http.get("/api/v1/identity/roles", () => HttpResponse.json({ requestId: "hierarchy-request", data: HIERARCHY })),
      http.get("/api/v1/identity/role-definitions/:roleDefinitionId", () => {
        detailCalls += 1;
        return HttpResponse.json({ requestId: `detail-${detailCalls}`, data: detailCalls > 1 ? latest : detail(ROLE_ID, { permissions: [highRisk, ...CAPABILITY_CATALOG.filter((item) => item.capability !== "role.read").map((item) => permission(item))], revision: 9 }) });
      }),
      http.patch("/api/v1/identity/role-definitions/:roleDefinitionId/grants", () => HttpResponse.json({ status: 409, code: "ROLE_POLICY_CONFLICT", requestId: "conflict" }, { status: 409 }))
    );
    render(<PermissionEditorPanel />);

    await userEvent.click(await screen.findByRole("switch", { name: "檢視身份組" }));
    await userEvent.click(screen.getByRole("button", { name: "儲存變更" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "確認儲存" }));

    expect(await screen.findByText(/權限政策已有更新/u)).toBeInTheDocument();
    expect(screen.getByText("捨棄草稿並重新開始")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "檢視身份組" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("button", { name: "捨棄草稿並重新開始" }));
    expect(screen.queryByText("捨棄草稿並重新開始")).not.toBeInTheDocument();
  });

  test("uses the shared Back link and restores focus to the safe role list", async () => {
    installDetail();
    mocks.searchParams = new URLSearchParams(
      `module=permissions&role=${ROLE_ID}&view=permissions`
    );
    window.history.replaceState(
      null,
      "",
      `/management?module=permissions&role=${ROLE_ID}&view=permissions`
    );
    render(<PermissionEditorPanel />);

    expect(
      await screen.findByRole("heading", {
        name: "青少年查經帶領",
        level: 2,
      })
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("link", { name: "返回身份組列表" })
    );
    expect(await screen.findByRole("list", { name: "身份組列表" })).toBeInTheDocument();
    expect(window.location.search).toBe("?module=permissions");
    expect(document.activeElement).toHaveTextContent("身份組列表");
  });
});
