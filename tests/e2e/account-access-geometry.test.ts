import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

import { defaultSections, projectNavigation } from "../../web/lib/sections";

const AUTH_HINT_KEY = "efcc_auth_active";
const ACCOUNT_ID = "account-access-target";
const ROLE_ID = "account-access-role";
const PUBLIC_USER = {
  userId: "account-access-admin",
  name: "Account Access Admin",
  username: "account-access-admin",
  phone: "",
  role: "Admin",
  status: "active",
  qrCodeString: "",
};
const VIEW = {
  account: {
    userId: ACCOUNT_ID,
    name: "Target Account",
    username: "target",
    status: "Active",
  },
  activeAssignments: [],
  revokedAssignments: [],
  assignmentHistory: [],
  effectiveAccess: { Global: [], Department: [], Program: [] },
  lifecycleImpacts: {},
  revision: 3,
  actions: {
    assign: true,
    revoke: false,
    archive: false,
    restore: false,
    revokeRoleDefinitionIds: [],
    archiveRoleDefinitionIds: [],
    restoreRoleDefinitionIds: [],
  },
  assignableRoles: [
    {
      roleDefinitionId: ROLE_ID,
      label: "課程協調者",
      scopeKind: "Global",
      scopeId: null,
      scopeLabel: null,
      position: 4,
    },
  ],
};
const HIERARCHY = {
  revision: 3,
  caller: { userId: PUBLIC_USER.userId, highestPosition: 0 },
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
          roleDefinitionId: ROLE_ID,
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

async function stubApi(route: Route) {
  const url = new URL(route.request().url());
  if (url.pathname === "/api/v1/auth/me") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        requestId: "r-me",
        data: {
          user: PUBLIC_USER,
          sections: defaultSections(),
          navigation: projectNavigation({ "home.publish": true }),
        },
      }),
    });
    return;
  }
  if (url.pathname === "/api/v1/auth/refresh") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ requestId: "r-refresh", data: {} }),
    });
    return;
  }
  if (url.pathname === "/api/v1/auth/logout") {
    await route.fulfill({ status: 204 });
    return;
  }
  if (url.pathname === "/api/v1/identity/roles") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ requestId: "r-roles", data: HIERARCHY }),
    });
    return;
  }
  if (url.pathname === `/api/v1/identity/accounts/${ACCOUNT_ID}/assignments`) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ requestId: "r-account", data: VIEW }),
    });
    return;
  }
  await route.fulfill({
    status: 404,
    contentType: "application/problem+json",
    body: JSON.stringify({
      status: 404,
      code: "NOT_FOUND",
      title: "Not found",
    }),
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ key, value }: { key: string; value: string }) =>
      localStorage.setItem(key, value),
    { key: AUTH_HINT_KEY, value: "1" }
  );
  await page.route("**/api/v1/**", stubApi);
});

test("Account Access remains contained with 44px actions across W7", async ({
  page,
}) => {
  await page.goto(
    `/management?module=accounts&account=${ACCOUNT_ID}&view=access`
  );
  await expect(
    page.getByRole("heading", { name: "Target Account" })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Global" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Department" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Program" })).toBeVisible();
  const geometry = await page.evaluate(() => {
    const box = (node: Element | null) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        bottom: rect.bottom,
      };
    };
    const doc = document.documentElement;
    const buttons = [...document.querySelectorAll<HTMLElement>("button")].map(
      box
    );
    const switches = [
      ...document.querySelectorAll<HTMLElement>('[role="switch"]'),
    ].map(box);
    const input = box(
      document.querySelector<HTMLElement>("#account-access-search")
    );
    const content = document.querySelector<HTMLElement>("#shell-content");
    const dock = document.querySelector<HTMLElement>(".nav-phone");
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      overflow:
        Math.max(doc.scrollWidth, document.body.scrollWidth) -
        window.innerWidth,
      main: box(
        document.querySelector("#shell-content main") ??
          document.querySelector("main")
      ),
      buttons,
      switches,
      input,
      dock: box(dock),
      dockPosition: dock ? getComputedStyle(dock).position : null,
      paddingBottom: content ? getComputedStyle(content).paddingBottom : null,
    };
  });
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(geometry.main).not.toBeNull();
  expect(geometry.input).not.toBeNull();
  expect(geometry.input?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(geometry.buttons.every((button) => (button?.height ?? 0) >= 44)).toBe(
    true
  );
  expect(geometry.switches.length).toBeGreaterThan(0);
  expect(
    geometry.switches.every(
      (item) => (item?.width ?? 0) >= 44 && (item?.height ?? 0) >= 44
    )
  ).toBe(true);
  expect(geometry.dock).not.toBeNull();
  if (geometry.viewportWidth <= 799) {
    expect(geometry.dockPosition).toBe("fixed");
    expect(geometry.paddingBottom).toMatch(/84px/);
  } else {
    expect(geometry.dockPosition).toBe("sticky");
    expect(geometry.paddingBottom).toBe("0px");
  }
});

test("Account Access add review stays inside the viewport", async ({
  page,
}) => {
  await page.goto(
    `/management?module=accounts&account=${ACCOUNT_ID}&view=access`
  );
  await page.getByRole("switch", { name: "新增 課程協調者" }).click();
  await page.getByRole("button", { name: /檢視新增/ }).click();
  await expect(
    page.getByRole("heading", { name: "確認新增身份組" })
  ).toBeVisible();
  const sheet = page.locator('[data-slot="sheet-content"]');
  await page.waitForFunction(() => {
    const element = document.querySelector<HTMLElement>(
      '[data-slot="sheet-content"]'
    );
    return (
      element !== null &&
      element.getBoundingClientRect().bottom <= window.innerHeight + 1
    );
  });
  const rect = await sheet.evaluate((element) => {
    const value = element.getBoundingClientRect();
    return { left: value.left, right: value.right, bottom: value.bottom };
  });
  expect(rect.left).toBeGreaterThanOrEqual(-1);
  expect(rect.right).toBeLessThanOrEqual(
    (await page.evaluate(() => window.innerWidth)) + 1
  );
  expect(rect.bottom).toBeLessThanOrEqual(
    (await page.evaluate(() => window.innerHeight)) + 1
  );
});
