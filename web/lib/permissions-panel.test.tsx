// 087-03 (#320) — component tests for the Account Permissions real matrix
// (Spec 087 US 9-12). MSW intercepts GET /api/v1/programs/account-permissions
// at the same seam as lib/approval-detail.test.tsx; fixtures carry no
// credential material. Covers: every elevated account with name/role/
// department context, exactly three role definitions with scope + assignment
// state, the explanatory lead + settings back link, and the loading / error /
// server-shaped forbidden states (retry re-fetches).
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
  test("renders every elevated account with name, role, and department context", async () => {
    server.use(
      http.get("/api/v1/programs/account-permissions", () => viewResponse())
    );
    render(<PermissionsPanel />);

    const table = await screen.findByRole("table", {
      name: PERMISSIONS.accountsSection,
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

    // Every elevated account appears with its own row.
    for (const account of ACCOUNTS) {
      expect(
        within(table).getByRole("rowheader", { name: account.name })
      ).toBeInTheDocument();
    }

    // Role labels render from the server projection, not a client branch.
    expect(within(table).getByText(PERMISSIONS.roleAdmin)).toBeInTheDocument();
    expect(
      within(table).getByText(PERMISSIONS.roleDepartmentManager)
    ).toBeInTheDocument();
    expect(within(table).getByText(PERMISSIONS.roleStaff)).toBeInTheDocument();

    // Department context: granted departments verbatim; role scope when none.
    expect(within(table).getByText("培育部")).toBeInTheDocument();
    expect(within(table).getByText("崇拜部")).toBeInTheDocument();
    expect(within(table).getByText(PERMISSIONS.roleStaffScope)).toBeInTheDocument();
  });

  test("renders exactly three role definitions with scope and assignment states", async () => {
    server.use(
      http.get("/api/v1/programs/account-permissions", () => viewResponse())
    );
    render(<PermissionsPanel />);

    expect(
      await screen.findByRole("heading", { name: PERMISSIONS.rolesSection })
    ).toBeInTheDocument();

    const list = screen.getByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);

    // 管理員 · 全部範圍 · 已設 (an admin account holds the role).
    const adminItem = items[0];
    expect(within(adminItem).getByText(PERMISSIONS.roleAdmin)).toBeInTheDocument();
    expect(
      within(adminItem).getByText(PERMISSIONS.roleAdminScope)
    ).toBeInTheDocument();
    expect(
      within(adminItem).getByText(PERMISSIONS.stateAssigned)
    ).toBeInTheDocument();

    // 部門管理者 · 所屬部門課程、聚會及出席 · 已設 (DM grant holds the role).
    const managerItem = items[1];
    expect(
      within(managerItem).getByText(PERMISSIONS.roleDepartmentManager)
    ).toBeInTheDocument();
    expect(
      within(managerItem).getByText(PERMISSIONS.roleDepartmentManagerScope)
    ).toBeInTheDocument();
    expect(
      within(managerItem).getByText(PERMISSIONS.stateAssigned)
    ).toBeInTheDocument();

    // 同工 · 部門範圍內協助工作 · 可指派 (no staff account in the projection).
    const staffItem = items[2];
    expect(within(staffItem).getByText(PERMISSIONS.roleStaff)).toBeInTheDocument();
    expect(
      within(staffItem).getByText(PERMISSIONS.roleStaffScope)
    ).toBeInTheDocument();
    expect(
      within(staffItem).getByText(PERMISSIONS.stateAssignable)
    ).toBeInTheDocument();
    expect(
      within(staffItem).queryByText(PERMISSIONS.stateAssigned)
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
      screen.queryByRole("table", { name: PERMISSIONS.accountsSection })
    ).not.toBeInTheDocument();

    release(null);
    expect(
      await screen.findByRole("table", { name: PERMISSIONS.accountsSection })
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
      await screen.findByRole("table", { name: PERMISSIONS.accountsSection })
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
      screen.queryByRole("table", { name: PERMISSIONS.accountsSection })
    ).not.toBeInTheDocument();
  });

  test("renders grouped policy cells and the Admin change-set review summary", async () => {
    server.use(
      http.get("/api/v1/programs/account-permissions", () =>
        viewResponse()
      )
    );
    render(<PermissionsPanel />);

    expect(
      await screen.findByRole("heading", { name: "權限政策" })
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

    expect(await screen.findByText("同工只可查看，不能修改權限政策。"))
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

    await screen.findByRole("heading", { name: "權限政策" });
    const toggle = screen.getByRole("button", {
      name: "部門管理 · 管理員",
    });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(PERMISSIONS.policyDirty)).toBeInTheDocument();
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

    await screen.findByRole("heading", { name: "權限政策" });
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
