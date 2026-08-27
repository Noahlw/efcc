// S4.10 (#465) — component tests for the role-first Account & Permissions
// surface. MSW intercepts GET /api/v1/programs/account-permissions at the
// same seam as lib/approval-detail.test.tsx; fixtures carry no credential
// material. The assigned-account assertions retain the legacy safe account
// matrix semantics while navigation and policy editing follow the S4 contract.
import userEvent from "@testing-library/user-event";
import {
  cleanup,
  render,
  screen,
  within,
} from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { PermissionsPanel } from "@/app/management/permissions-panel";
import { COPY } from "./copy";
import type {
  AccountPermissionAccount,
  AccountPermissionPolicy,
  AccountPermissionRole,
  AccountPermissionsView,
} from "./programs/program-api";

const mocks = vi.hoisted(() => {
  const router = {
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    refresh: vi.fn<() => void>(),
    push: vi.fn<() => void>(),
    replace: vi.fn<() => void>(),
    prefetch: vi.fn<() => void>(),
  };
  return { router, returnValue: null as string | null };
});

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
  useSearchParams: () =>
    new URLSearchParams(
      mocks.returnValue ? { return: mocks.returnValue } : undefined
    ),
}));

const server = setupServer();

const PERMISSIONS = COPY.permissions;

const ACCOUNTS: AccountPermissionAccount[] = [
  {
    userId: "U-PERM-ADMIN",
    name: "陳小明",
    role: "admin",
    departments: [{ id: "dept-grow", name: "培育部" }],
  },
  {
    userId: "U-PERM-DM",
    name: "黃家豪",
    role: "department-manager",
    departments: [{ id: "dept-worship", name: "崇拜部" }],
  },
  {
    userId: "U-PERM-STAFF",
    name: "李秀蘭",
    role: "staff",
    departments: [],
  },
];

const ROLES: AccountPermissionRole[] = [
  {
    key: "admin",
    label: PERMISSIONS.roleAdmin,
    scope: PERMISSIONS.roleAdminScope,
    assignmentState: "assigned",
  },
  {
    key: "department-manager",
    label: PERMISSIONS.roleDepartmentManager,
    scope: PERMISSIONS.roleDepartmentManagerScope,
    assignmentState: "assigned",
  },
  {
    key: "staff",
    label: PERMISSIONS.roleStaff,
    scope: PERMISSIONS.roleStaffScope,
    assignmentState: "assignable",
  },
];

const cell = (
  value: boolean,
  overrides: Partial<AccountPermissionPolicy["capabilities"][number]["roles"]["admin"]> = {}
) => ({
  value,
  applicable: value,
  editable: false,
  locked: !value,
  lockReason: value ? null : "會友角色不能設定管理權限。",
  ...overrides,
});

const POLICY: AccountPermissionPolicy = {
  revision: 18,
  actor: { role: "Admin", canRead: true, canEdit: true },
  capabilities: [
    {
      key: "program.enroll",
      label: "提交課程報名",
      description: "以會友身份提交自己的課程報名",
      group: "會友基礎",
      roles: {
        admin: cell(true, {
          applicable: true,
          locked: true,
          lockReason: "會友基礎必須保留。",
        }),
        staff: cell(true, {
          applicable: true,
          locked: true,
          lockReason: "會友基礎必須保留。",
        }),
        member: cell(true, {
          applicable: true,
          locked: true,
          lockReason: "會友基礎必須保留。",
        }),
      },
    },
    {
      key: "department.manage",
      label: "部門管理",
      description: "編輯部門資料及日常運作",
      group: "部門",
      roles: {
        admin: cell(true, { editable: true, locked: false, lockReason: null }),
        staff: cell(true, { editable: true, locked: false, lockReason: null }),
        member: cell(false),
      },
    },
    {
      key: "account.permissions.write",
      label: "修改權限政策",
      description: "改變全系統角色權限",
      group: "帳戶與系統",
      roles: {
        admin: cell(true, {
          applicable: true,
          locked: true,
          lockReason: "權限政策修改受系統安全規則保護。",
        }),
        staff: cell(false, {
          applicable: false,
          locked: true,
          lockReason: "只限管理員使用。",
        }),
        member: cell(false, {
          applicable: false,
          locked: true,
          lockReason: "會友角色不能設定管理權限。",
        }),
      },
    },
  ],
};

const VIEW: AccountPermissionsView = {
  accounts: ACCOUNTS,
  roles: ROLES,
  policy: POLICY,
};

function viewResponse() {
  return HttpResponse.json({ requestId: "rid-permissions", data: VIEW });
}

async function openRoleDetail(role: string) {
  await screen.findByRole("list", { name: PERMISSIONS.rolesSection });
  await userEvent.click(
    screen.getByRole("button", { name: `${role} · 角色詳情` })
  );
}

async function openRoleSubview(role: string, subview: "權限" | "已指派帳戶") {
  await openRoleDetail(role);
  await userEvent.click(
    screen.getByRole("button", { name: `${role} · ${subview}` })
  );
}

function problemResponse(status: number, code: string, detail: string) {
  return HttpResponse.json(
    { type: "about:blank", title: detail, status, detail, code },
    { status }
  );
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

describe("PermissionsPanel", () => {
  test("opens on fixed global roles with a separate non-editable Member Baseline", async () => {
    server.use(
      http.get("/api/v1/programs/account-permissions", () => viewResponse())
    );
    render(<PermissionsPanel />);

    const list = await screen.findByRole("list", { name: "角色定義" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).getByText(PERMISSIONS.roleAdmin)).toBeInTheDocument();
    expect(within(list).getByText(PERMISSIONS.roleStaff)).toBeInTheDocument();
    expect(within(list).getByText(PERMISSIONS.policyRoleMember)).toBeInTheDocument();
    expect(screen.getByText("會友基礎")).toBeInTheDocument();
    expect(
      screen.getByText("適用於所有生效帳戶 · 系統固定")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /會友基礎/u })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /刪除|重新排序|指派/u })
    ).not.toBeInTheDocument();
  });

  test("drills from a role to Permissions and returns through the shared Back actions", async () => {
    server.use(
      http.get("/api/v1/programs/account-permissions", () => viewResponse())
    );
    render(<PermissionsPanel />);

    await screen.findByRole("list", { name: "角色定義" });
    await userEvent.click(
      screen.getByRole("button", { name: /管理員.*角色詳情/u })
    );
    expect(
      await screen.findByRole("heading", { name: /管理員/u, level: 2 })
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /管理員.*權限/u })
    );
    expect(
      await screen.findByRole("heading", { name: /權限政策.*管理員/u })
    ).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "搜尋權限" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "返回角色詳情" }));
    expect(
      await screen.findByRole("heading", { name: /管理員/u, level: 2 })
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "返回角色列表" }));
    expect(
      await screen.findByRole("list", { name: "角色定義" })
    ).toBeInTheDocument();
  });

  test("keeps Assigned Accounts read-only and maps the scoped Department Manager under Staff", async () => {
    server.use(
      http.get("/api/v1/programs/account-permissions", () => viewResponse())
    );
    render(<PermissionsPanel />);

    await openRoleSubview(PERMISSIONS.roleStaff, "已指派帳戶");
    const table = await screen.findByRole("table", {
      name: /已指派帳戶/u,
    });
    expect(within(table).getByText("黃家豪")).toBeInTheDocument();
    expect(within(table).getByText("李秀蘭")).toBeInTheDocument();
    expect(within(table).getByText("崇拜部")).toBeInTheDocument();
    expect(within(table).getByText(PERMISSIONS.roleDepartmentManager)).toBeInTheDocument();
    expect(
      within(table).queryByRole("button", { name: /指派|移除|變更/u })
    ).not.toBeInTheDocument();
  });

  test("filters grouped permissions and reveals the matching group", async () => {
    server.use(
      http.get("/api/v1/programs/account-permissions", () => viewResponse())
    );
    render(<PermissionsPanel />);

    await openRoleSubview(PERMISSIONS.roleAdmin, "權限");
    const search = screen.getByRole("searchbox", { name: "搜尋權限" });
    await userEvent.type(search, "部門");
    expect(screen.getByText("部門")).toBeInTheDocument();
    expect(screen.getByText("部門管理")).toBeInTheDocument();
    expect(screen.queryByText("提交課程報名")).not.toBeInTheDocument();
  });

  test("renders every elevated account with name, role, and department context", async () => {
    server.use(
      http.get("/api/v1/programs/account-permissions", () => viewResponse())
    );
    render(<PermissionsPanel />);

    await openRoleSubview(PERMISSIONS.roleAdmin, "已指派帳戶");
    const table = await screen.findByRole("table", {
      name: /已指派帳戶/u,
    });

    // Accessible column headers make the matrix readable.
    for (const header of [
      PERMISSIONS.accountName,
      PERMISSIONS.accountRole,
      PERMISSIONS.accountDepartment,
    ]) {
      expect(
        within(table).getByRole("columnheader", { name: header })
      ).toBeInTheDocument();
    }

    // The selected global role shows its safely-projected account rows.
    expect(
      within(table).getByRole("rowheader", { name: ACCOUNTS[0].name })
    ).toBeInTheDocument();

    // Role labels render from the server projection, not a client branch.
    expect(within(table).getByText(PERMISSIONS.roleAdmin)).toBeInTheDocument();
    expect(within(table).getByText(PERMISSIONS.roleAdmin)).toBeInTheDocument();

    // Department context remains verbatim for the selected account.
    expect(within(table).getByText("培育部")).toBeInTheDocument();
  });

  test("renders exactly three fixed global roles without a scoped profile row", async () => {
    server.use(
      http.get("/api/v1/programs/account-permissions", () => viewResponse())
    );
    render(<PermissionsPanel />);

    const list = await screen.findByRole("list", {
      name: PERMISSIONS.rolesSection,
    });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);

    const adminItem = items[0];
    expect(within(adminItem).getByText(PERMISSIONS.roleAdmin)).toBeInTheDocument();
    expect(
      within(adminItem).getByText(PERMISSIONS.roleAdminScope)
    ).toBeInTheDocument();

    const managerItem = items[1];
    expect(
      within(managerItem).getByText(PERMISSIONS.roleStaff)
    ).toBeInTheDocument();
    expect(
      within(managerItem).getByText(PERMISSIONS.roleStaffScope)
    ).toBeInTheDocument();

    const memberItem = items[2];
    expect(
      within(memberItem).getByText(PERMISSIONS.policyRoleMember)
    ).toBeInTheDocument();
    expect(
      within(list).queryByText(PERMISSIONS.roleDepartmentManager)
    ).not.toBeInTheDocument();
  });

  test("shows the explanatory lead, title, and Management back link", async () => {
    server.use(
      http.get("/api/v1/programs/account-permissions", () => viewResponse())
    );
    render(<PermissionsPanel />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: PERMISSIONS.permissionsTitle,
      })
    ).toBeInTheDocument();
    expect(screen.getByText(PERMISSIONS.permissionsLead)).toBeInTheDocument();

    const back = screen.getByRole("link", {
      name: "返回管理工作",
    });
    expect(back).toHaveAttribute("href", "/management");
  });

  test("shows the loading state while the projection is in flight", async () => {
    const { promise: gate, resolve: release } =
      Promise.withResolvers<unknown>();
    server.use(
      http.get("/api/v1/programs/account-permissions", () =>
        gate.then(() => viewResponse())
      )
    );
    render(<PermissionsPanel />);

    const loading = screen.getByText(PERMISSIONS.loading);
    const stateRegion = loading.closest("#permissions-panel-state");
    expect(stateRegion).not.toBeNull();
    expect(stateRegion).toHaveAttribute("aria-busy", "true");
    expect(stateRegion).toHaveAttribute("tabindex", "-1");
    // The panel root also carries aria-busy while loading.
    expect(loading.closest('[aria-busy="true"]')).not.toBeNull();
    expect(
      screen.queryByRole("list", { name: PERMISSIONS.rolesSection })
    ).not.toBeInTheDocument();

    release(null);
    expect(
      await screen.findByRole("list", { name: PERMISSIONS.rolesSection })
    ).toBeInTheDocument();
  });

  test("shows the recoverable error state and retry re-fetches the matrix", async () => {
    let calls = 0;
    server.use(
      http.get("/api/v1/programs/account-permissions", () => {
        calls += 1;
        return calls === 1
          ? problemResponse(500, "UNAVAILABLE", "系統暫時無法使用，請稍後再試。")
          : viewResponse();
      })
    );
    render(<PermissionsPanel />);

    const errorRegion = await screen.findByRole("alert");
    expect(
      within(errorRegion).getByRole("heading", { name: PERMISSIONS.loadError })
    ).toBeInTheDocument();

    await userEvent.click(
      within(errorRegion).getByRole("button", { name: PERMISSIONS.retry })
    );

    expect(
      await screen.findByRole("list", { name: PERMISSIONS.rolesSection })
    ).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  test("shows the server-shaped forbidden state for a 403 (Department Manager denied)", async () => {
    server.use(
      http.get("/api/v1/programs/account-permissions", () =>
        problemResponse(403, "FORBIDDEN", "您沒有權限執行此操作。")
      )
    );
    render(<PermissionsPanel />);

    const alertRegion = await screen.findByRole("alert");
    expect(
      within(alertRegion).getByRole("heading", { name: PERMISSIONS.forbidden })
    ).toBeInTheDocument();
    expect(
      within(alertRegion).getByRole("button", { name: PERMISSIONS.retry })
    ).toBeInTheDocument();

    // Never a client-side projection for a denied actor.
    expect(
      screen.queryByRole("list", { name: PERMISSIONS.rolesSection })
    ).not.toBeInTheDocument();
  });

  test("renders grouped policy cells and the Admin change-set review summary", async () => {
    server.use(
      http.get("/api/v1/programs/account-permissions", () =>
        viewResponse()
      )
    );
    render(<PermissionsPanel />);

    await openRoleSubview(PERMISSIONS.roleAdmin, "權限");
    expect(
      await screen.findByRole("heading", { name: /權限政策.*管理員/u })
    ).toBeInTheDocument();
    expect(screen.getByText("目前顯示政策版本 18。"))
      .toBeInTheDocument();
    expect(screen.getByText("會友基礎")).toBeInTheDocument();
    expect(screen.getAllByText("部門").length).toBeGreaterThan(0);
    expect(screen.getByText("帳戶與系統")).toBeInTheDocument();
    expect(screen.getAllByText("固定：會友基礎必須保留。").length)
      .toBeGreaterThan(0);
    expect(
      screen.getByText("固定：權限政策修改受系統安全規則保護。")
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "變更摘要" }))
      .toBeInTheDocument();
    expect(screen.getByText("管理員可編輯未鎖定的政策格。"))
      .toBeInTheDocument();
  });

  test("renders Staff as read-only without editable controls", async () => {
    const staffView: AccountPermissionsView = {
      ...VIEW,
      policy: {
        ...POLICY,
        actor: { role: "Staff", canRead: true, canEdit: false },
        capabilities: POLICY.capabilities.map((capability) => ({
          ...capability,
          roles: Object.fromEntries(
            Object.entries(capability.roles).map(([role, value]) => [
              role,
              { ...value, editable: false },
            ])
          ) as typeof capability.roles,
        })),
      },
    };
    server.use(
      http.get("/api/v1/programs/account-permissions", () =>
        HttpResponse.json({ requestId: "rid-permissions", data: staffView })
      )
    );
    render(<PermissionsPanel />);

    await openRoleSubview(PERMISSIONS.roleStaff, "權限");
    expect(await screen.findByText(PERMISSIONS.policyStaffReadOnly))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "檢視並儲存" }))
      .not.toBeInTheDocument();
  });

  test("stages an editable cell and submits one atomic change set", async () => {
    let posts = 0;
    server.use(
      http.get("/api/v1/programs/account-permissions", () => viewResponse()),
      http.post("/api/v1/programs/account-permissions", async ({ request }) => {
        posts += 1;
        const body = (await request.json()) as {
          baseRevision: number;
          changes: Array<{
            role: string;
            capability: string;
            value: boolean;
          }>;
        };
        expect(body.baseRevision).toBe(18);
        expect(body.changes).toEqual([
          {
            role: "admin",
            capability: "department.manage",
            value: false,
          },
        ]);
        return HttpResponse.json({
          requestId: "rid-permissions-save",
          data: {
            ...VIEW,
            policy: { ...POLICY, revision: 19 },
            mutation: { outcome: "SUCCESS", idempotent: false, revision: 19 },
          },
        });
      })
    );
    render(<PermissionsPanel />);

    await openRoleSubview(PERMISSIONS.roleAdmin, "權限");
    const toggle = screen.getByRole("button", {
      name: "部門管理 · 管理員",
    });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(PERMISSIONS.policyDirty)).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "未儲存變更操作" })
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("group", { name: "未儲存變更操作" })
      ).getByText("1 項未儲存")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: PERMISSIONS.policyChangesTitle })
    ).toBeInTheDocument();
    expect(screen.getByText(/管理員 · ✓ → 停用/u)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: PERMISSIONS.policySave })
    );
    expect(posts).toBe(1);
    expect(
      await screen.findByText(PERMISSIONS.policySaved)
    ).toBeInTheDocument();
    expect(
      screen.getByText(`${PERMISSIONS.policySynced} 19。`)
    ).toBeInTheDocument();
  });

  test("preserves the draft when Save conflicts", async () => {
    server.use(
      http.get("/api/v1/programs/account-permissions", () => viewResponse()),
      http.post("/api/v1/programs/account-permissions", () =>
        problemResponse(409, "POLICY_REVISION_CONFLICT", "政策已有更新。")
      )
    );
    render(<PermissionsPanel />);

    await openRoleSubview(PERMISSIONS.roleAdmin, "權限");
    const toggle = screen.getByRole("button", {
      name: "部門管理 · 管理員",
    });
    await userEvent.click(toggle);
    await userEvent.click(
      screen.getByRole("button", { name: PERMISSIONS.policySave })
    );

    expect(
      await screen.findByText(PERMISSIONS.policyConflict)
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(PERMISSIONS.policyConflictHint).length
    ).toBeGreaterThan(0);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: PERMISSIONS.policyReload })
    ).toBeInTheDocument();
  });
});
