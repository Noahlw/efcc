import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AccountAccessPanel } from "@/app/management/account-access-panel";
import type { AccountAccessView } from "@/lib/identity/account-access";
import type { RoleHierarchyView } from "@/lib/identity/role-hierarchy";

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(
    "module=accounts&account=target&view=access"
  ),
  router: { back: vi.fn(), push: vi.fn(), replace: vi.fn() },
  getAccountAccess: vi.fn(),
  searchEligibleAccounts: vi.fn(),
  getRoleHierarchy: vi.fn(),
  mutateAccountAssignments: vi.fn(),
  revokeAccountAssignments: vi.fn(),
  updateRoleDefinitionLifecycle: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
  useSearchParams: () => mocks.searchParams,
}));
vi.mock("@/lib/identity/account-access-api", () => ({
  getAccountAccess: mocks.getAccountAccess,
  searchEligibleAccounts: mocks.searchEligibleAccounts,
  mutateAccountAssignments: mocks.mutateAccountAssignments,
  revokeAccountAssignments: mocks.revokeAccountAssignments,
  updateRoleDefinitionLifecycle: mocks.updateRoleDefinitionLifecycle,
}));
vi.mock("@/lib/identity/role-hierarchy-api", () => ({
  getRoleHierarchy: mocks.getRoleHierarchy,
}));

const view: AccountAccessView = {
  account: {
    userId: "target",
    name: "Target Account",
    username: "target-user",
    status: "Active",
  },
  activeAssignments: [],
  revokedAssignments: [],
  assignmentHistory: [],
  effectiveAccess: {
    Global: [
      {
        capability: "program.enroll",
        label: "提交課程報名",
        description: "提交自己的課程報名。",
        group: "會友基礎",
        risk: "normal",
        scopeRequired: false,
        scopeKind: "Global",
        scopeId: null,
        scopeLabel: null,
        sources: ["會友基礎"],
        sourceRoleDefinitionIds: ["member"],
      },
    ],
    Department: [],
    Program: [],
  },
  revision: 3,
  actions: { assign: true, revoke: false, archive: false, restore: false },
};
const revokeView: AccountAccessView = {
  ...view,
  activeAssignments: [
    {
      assignmentId: "assignment-role-lower",
      roleDefinitionId: "role-lower",
      label: "課程協調者",
      scopeKind: "Global",
      scopeId: null,
      scopeLabel: null,
      position: 4,
      state: "ACTIVE",
      grantedAt: "2026-08-29T00:00:00.000Z",
      revokedAt: null,
      revokedBy: null,
      revokeReason: null,
    },
  ],
  effectiveAccess: {
    ...view.effectiveAccess,
    Global: [
      {
        ...view.effectiveAccess.Global[0],
        sources: ["會友基礎", "課程協調者"],
        sourceRoleDefinitionIds: ["member", "role-lower"],
      },
    ],
  },
  actions: { assign: false, revoke: true, archive: false, restore: false },
};

const hierarchy: RoleHierarchyView = {
  revision: 3,
  caller: { userId: "actor", highestPosition: 1 },
  categories: [
    {
      categoryKey: "Global",
      label: "全教會",
      description: "",
      displayOrder: 0,
      childCount: 1,
      createOptions: [],
      definitions: [
        {
          roleDefinitionId: "role-lower",
          label: "課程協調者",
          description: "",
          kind: "GLOBAL",
          scopeKind: "Global",
          scopeId: null,
          scopeLabel: null,
          position: 4,
          isProtected: false,
          isArchived: false,
          assignmentCount: 0,
          grantCount: 1,
          actions: [],
          reorderActions: [],
        },
      ],
    },
  ],
};

beforeEach(() => {
  mocks.getAccountAccess.mockResolvedValue(view);
  mocks.searchEligibleAccounts.mockResolvedValue({
    accounts: [],
    nextOffset: null,
  });
  mocks.getRoleHierarchy.mockResolvedValue(hierarchy);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AccountAccessPanel", () => {
  test("renders selected account, scope groups, and an atomic add review", async () => {
    render(<AccountAccessPanel />);
    expect(
      await screen.findByRole("heading", { name: "Target Account" })
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Global" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Department" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Program" })).toBeTruthy();
    expect(
      screen.getByRole("switch", { name: "新增 課程協調者" })
    ).toBeTruthy();
  });
  test("searches eligible accounts and navigates with canonical access URL", async () => {
    const user = userEvent.setup();
    mocks.searchEligibleAccounts.mockResolvedValue({
      accounts: [
        {
          userId: "other",
          name: "Other Account",
          username: "other-user",
          identities: [],
        },
      ],
      nextOffset: null,
    });
    render(<AccountAccessPanel />);
    await user.type(
      await screen.findByRole("searchbox", { name: "搜尋可用帳戶" }),
      "Other"
    );
    const candidate = await screen.findByRole("button", {
      name: /Other Account/,
    });
    await user.click(candidate);
    expect(mocks.router.push).toHaveBeenCalledWith(
      expect.stringContaining("module=accounts&account=other&view=access")
    );
  });
  test("reviews and submits multiple identities atomically", async () => {
    const user = userEvent.setup();
    mocks.mutateAccountAssignments.mockResolvedValue({
      ...view,
      idempotent: false,
      duplicateRoleDefinitionIds: [],
    });
    render(<AccountAccessPanel />);
    const identitySwitch = await screen.findByRole("switch", {
      name: "新增 課程協調者",
    });
    await user.click(identitySwitch);
    await user.click(screen.getByRole("button", { name: "檢視新增 (1)" }));
    expect(
      screen.getByRole("heading", { name: "確認新增身份組" })
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "確認一次新增" }));
    await waitFor(() =>
      expect(mocks.mutateAccountAssignments).toHaveBeenCalledWith(
        "target",
        { baseRevision: 3, roleDefinitionIds: ["role-lower"] },
        expect.any(String)
      )
    );
  });

  test("previews revoke impact and confirms an explicit revoke", async () => {
    const user = userEvent.setup();
    mocks.getAccountAccess.mockResolvedValue(revokeView);
    mocks.revokeAccountAssignments.mockResolvedValue({
      ...view,
      idempotent: false,
      duplicateRoleDefinitionIds: [],
    });
    render(<AccountAccessPanel />);
    await user.click(
      await screen.findByRole("button", { name: "撤銷 課程協調者" })
    );
    expect(
      screen.getByRole("heading", { name: "確認撤銷身份組？" })
    ).toBeTruthy();
    expect(screen.getByText(/可能失去/u)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "確認撤銷" }));
    await waitFor(() =>
      expect(mocks.revokeAccountAssignments).toHaveBeenCalledWith(
        "target",
        { baseRevision: 3, roleDefinitionIds: ["role-lower"] },
        expect.any(String)
      )
    );
  });
  test("renders retryable forbidden/error state without private fields", async () => {
    mocks.getAccountAccess.mockRejectedValue(new Error("forbidden"));
    render(<AccountAccessPanel />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(
      screen.queryByText(/credential|phone|attendance|pastoral/i)
    ).toBeNull();
  });
});
