/* oxlint-disable vitest/prefer-importing-vitest-globals --
 * Playwright spec (uses @playwright/test's `test`/`expect`), not a Vitest
 * test file.
 */
/**
 * #478 H-20 — pinned Chromium geometry for the 身份組 hierarchy panel.
 *
 * Same harness as the Authenticated Shell geometry suite (TK-09): static
 * export served at http://127.0.0.1:4173 with the /api/v1/auth/* cookie
 * boundary AND the /api/v1/identity/roles projection stubbed in-browser.
 * Widths: 320, 390, 600, 799, 800, 1024, 1440 CSS px. Proves the panel's
 * critical anchors (list headings, role rows, detail, rename affordance)
 * with no horizontal overflow, no undersized controls, and the rename
 * affordance clear of the phone dock / safe-area reserve. Both sides of
 * the 800px breakpoint are exercised (w-799 and w-800). Numeric CSS
 * pixels only — no screenshots (TK-12).
 */
import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

import {
  defaultSections,
  stableNavigationSections,
} from "../../web/lib/sections";

const AUTH_HINT_KEY = "efcc_auth_active";

const PUBLIC_USER = {
  userId: "u-admin",
  name: "Test Admin",
  username: "tester",
  phone: "0900000000",
  role: "Admin",
  status: "active",
  qrCodeString: "qr:u-admin",
};

const HIERARCHY = {
  revision: 1,
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
          roleDefinitionId: "r-admin",
          label: "系統管理員",
          description: "受保護系統身份",
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
          roleDefinitionId: "r-member",
          label: "會友基礎",
          description: "最低限度身份",
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
          roleDefinitionId: "r-manager",
          label: "成人部門管理者",
          description: "可管理成人部門的日常運作及課程目錄。",
          kind: "DEPARTMENT_SCOPED",
          scopeKind: "Department",
          scopeId: "dept-adult",
          scopeLabel: "成區",
          position: 10,
          isProtected: false,
          isArchived: false,
          assignmentCount: 1,
          grantCount: 6,
          actions: [{ action: "rename", label: "重新命名" }],
        },
      ],
    },
  ],
};

async function stubApi(route: Route) {
  const url = new URL(route.request().url());
  const path = url.pathname;
  const method = route.request().method();

  if (path === "/api/v1/auth/me" && method === "GET") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        requestId: "r-me",
        data: {
          user: PUBLIC_USER,
          sections: defaultSections(),
          navigation: stableNavigationSections(PUBLIC_USER.role),
        },
      }),
    });
    return;
  }
  if (path === "/api/v1/auth/refresh" && method === "POST") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ requestId: "r-refresh", data: {} }),
    });
    return;
  }
  if (path === "/api/v1/auth/logout" && method === "POST") {
    await route.fulfill({ status: 204 });
    return;
  }
  if (path === "/api/v1/identity/roles" && method === "GET") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        requestId: "r-roles",
        data: HIERARCHY,
      }),
    });
    return;
  }
  await route.fulfill({
    status: 400,
    contentType: "application/problem+json",
    body: JSON.stringify({
      status: 400,
      code: "MALFORMED_REQUEST",
      title: "Bad request",
    }),
  });
}

test.beforeEach(async ({ page }: { page: Page }) => {
  await page.addInitScript(
    ({ key, value }: { key: string; value: string }) => {
      localStorage.setItem(key, value);
    },
    { key: AUTH_HINT_KEY, value: "1" }
  );
  await page.route("**/api/v1/auth/me", stubApi);
  await page.route("**/api/v1/auth/refresh", stubApi);
  await page.route("**/api/v1/auth/logout", stubApi);
  await page.route("**/api/v1/identity/roles", stubApi);
});

const isPhone = (projectName: string) =>
  ["w-320", "w-390", "w-600", "w-799"].includes(projectName);

test("identity hierarchy panel has no overflow or undersized controls at the pinned width", async ({
  page,
}, testInfo) => {
  await page.goto("/management?module=roles");

  const heading = page.getByRole("heading", { name: "身份組" });
  await expect(heading).toBeVisible();
  await expect(page.getByRole("heading", { name: "全教會" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "部門" })).toBeVisible();

  const geometry = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const doc = document.documentElement;
    const horizontalOverflow =
      Math.max(doc.scrollWidth, document.body.scrollWidth) - viewportWidth;

    const visibleControls = [
      ...document.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, summary, [role="button"], [role="tab"]'
      ),
    ]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          tag: element.tagName,
          display: style.display,
          visibility: style.visibility,
          height: rect.height,
          width: rect.width,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
        };
      })
      .filter(
        (c) =>
          c.display !== "none" &&
          c.visibility !== "hidden" &&
          c.width > 0 &&
          c.height > 0 &&
          c.right > 0 &&
          c.left < viewportWidth &&
          c.bottom > 0
      );

    const dock = document.querySelector<HTMLElement>(".nav-phone");
    const dockBox = dock?.getBoundingClientRect();
    const renameButtons = [
      ...document.querySelectorAll<HTMLElement>("button"),
    ].filter((element) => element.textContent?.includes("重新命名"));

    return {
      viewportWidth,
      horizontalOverflow,
      undersized: visibleControls.filter((c) => c.width < 44 || c.height < 44),
      dockTop: dockBox ? dockBox.top : null,
      renameBottom:
        renameButtons.length > 0
          ? (renameButtons
              .map((element) => element.getBoundingClientRect().bottom)
              .at(-1) ?? null)
          : null,
    };
  });

  // No horizontal overflow (tolerance: 1px, matching the shell suites).
  expect(
    geometry.horizontalOverflow,
    `horizontal overflow at ${geometry.viewportWidth}px`
  ).toBeLessThanOrEqual(1);

  // No visible control is below the 44px target.
  expect(
    geometry.undersized.length,
    `undersized controls: ${JSON.stringify(geometry.undersized)}`
  ).toBe(0);

  // Phone: the rename affordance (opened from detail) must clear the dock.
  if (isPhone(testInfo.project.name) && geometry.renameBottom !== null) {
    expect(geometry.dockTop).not.toBeNull();
    if (geometry.dockTop !== null) {
      expect(geometry.renameBottom).toBeLessThanOrEqual(geometry.dockTop + 1);
    }
  }
});

test("rename detail keeps the affordance visible and in flow at the pinned width", async ({
  page,
}, testInfo) => {
  await page.goto("/management?module=roles");

  await expect(page.getByRole("heading", { name: "身份組" })).toBeVisible();
  const managerRow = page.getByRole("button", { name: /成人部門管理者/u });
  await managerRow.click();
  const rename = page.getByRole("button", { name: "重新命名" });
  await expect(rename).toBeVisible();
  await rename.click();

  const input = page.getByLabel("新名稱");
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();

  const geometry = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const doc = document.documentElement;
    const horizontalOverflow =
      Math.max(doc.scrollWidth, document.body.scrollWidth) - viewportWidth;
    const dock = document.querySelector<HTMLElement>(".nav-phone");
    const dockBox = dock?.getBoundingClientRect();
    const save = document.querySelector<HTMLElement>("button");
    const saveBox = save?.getBoundingClientRect();
    return {
      viewportWidth,
      horizontalOverflow,
      dockTop: dockBox ? dockBox.top : null,
      saveBottom: saveBox ? saveBox.bottom : null,
    };
  });

  expect(
    geometry.horizontalOverflow,
    `horizontal overflow at ${geometry.viewportWidth}px`
  ).toBeLessThanOrEqual(1);

  if (isPhone(testInfo.project.name) && geometry.saveBottom !== null) {
    expect(geometry.dockTop).not.toBeNull();
    if (geometry.dockTop !== null) {
      expect(geometry.saveBottom).toBeLessThanOrEqual(geometry.dockTop + 1);
    }
  }
});
