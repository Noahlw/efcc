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
  return { router };
});

vi.mock(import("next/navigation"), () => ({
  useRouter: () => mocks.router,
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

const VIEW: AccountPermissionsView = { accounts: ACCOUNTS, roles: ROLES };

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

  test("shows the explanatory lead, title, and settings back link", async () => {
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
      name: PERMISSIONS.backToSettings,
    });
    expect(back).toHaveAttribute("href", "/management?module=settings");
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
});
