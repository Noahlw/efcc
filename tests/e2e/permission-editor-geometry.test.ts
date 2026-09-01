/* oxlint-disable vitest/prefer-importing-vitest-globals --
 * Playwright spec (uses @playwright/test's `test`/`expect`), not a Vitest
 * test file.
 */
/**
 * #485 C-485-04/C-485-06 — pinned Chromium geometry for the Permission Editor.
 *
 * The static export is served by the existing role-hierarchy geometry harness;
 * identity reads are stubbed in-browser so this suite proves only observable
 * route geometry. Widths are the required W7 matrix: 320, 390, 600, 799,
 * 800, 1024, and 1440 CSS px. Numeric CSS pixels only — no screenshots.
 */
import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

import { defaultSections, projectNavigation } from "../../web/lib/sections";
import { attachNumericEvidence } from "./numeric-evidence";

const AUTH_HINT_KEY = "efcc_auth_active";
const ROLE_ID = "r-staff";

const PUBLIC_USER = {
  userId: "u-admin",
  name: "Test Admin",
  username: "tester",
  phone: "0900000000",
  status: "active",
  qrCodeString: "qr:u-admin",
  identities: [
    {
      label: "系統管理員",
      scopeKind: "Global" as const,
      scopeLabel: null,
    },
  ],
  capabilities: {
    "role.manage": true,
    "role.read": true,
    "role.assign": true,
  },
};

const ROLE_DEFINITION = {
  roleDefinitionId: ROLE_ID,
  label: "同工",
  description: "可編輯其他較低身份組的權限。",
  kind: "SYSTEM",
  scopeKind: "Global",
  scopeId: null,
  scopeLabel: null,
  position: 1,
  isProtected: false,
  isArchived: false,
  assignmentCount: 1,
  grantCount: 2,
  actions: [{ action: "rename", label: "重新命名" }],
  reorderActions: [],
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
      childCount: 1,
      definitions: [ROLE_DEFINITION],
      createOptions: [],
    },
  ],
};

const PERMISSIONS = [
  {
    capability: "department.manage",
    label: "部門管理",
    description: "編輯部門資料及日常運作。",
    group: "部門",
    risk: "normal",
    scopeRequired: true,
    value: false,
    editable: true,
    locked: false,
    lockReason: null,
  },
  {
    capability: "program.manage",
    label: "課程管理",
    description: "建立及編輯課程與聚會。",
    group: "課程",
    risk: "normal",
    scopeRequired: true,
    value: false,
    editable: true,
    locked: false,
    lockReason: null,
  },
  {
    capability: "program.enroll",
    label: "提交課程報名",
    description: "以會友身份提交自己的課程報名。",
    group: "會友基礎",
    risk: "normal",
    scopeRequired: false,
    value: true,
    editable: false,
    locked: true,
    lockReason: "會友基礎自動提供，不能修改。",
  },
  {
    capability: "account.permissions.write",
    label: "修改權限政策",
    description: "改變全系統身份組權限。",
    group: "帳戶與系統",
    risk: "high",
    scopeRequired: false,
    value: false,
    editable: false,
    locked: true,
    lockReason: "只有系統固定身份可以使用。",
  },
];

const DETAIL = {
  roleDefinition: ROLE_DEFINITION,
  permissions: PERMISSIONS,
  assignedAccounts: [
    {
      assignmentId: "a-staff",
      userId: "u-staff",
      name: "同工帳戶",
      username: "staff",
      status: "active",
    },
  ],
  revision: 7,
  caller: { userId: "u-admin", canRead: true, canWrite: true },
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
          navigation: projectNavigation({ "home.publish": true }),
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
      body: JSON.stringify({ requestId: "r-roles", data: HIERARCHY }),
    });
    return;
  }
  if (
    path === `/api/v1/identity/role-definitions/${ROLE_ID}` &&
    method === "GET"
  ) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ requestId: "r-detail", data: DETAIL }),
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
  await page.route(`**/api/v1/identity/role-definitions/${ROLE_ID}`, stubApi);
});

const W7_PHONE_PROJECTS: Record<string, true> = {
  "w-320": true,
  "w-390": true,
  "w-600": true,
  "w-799": true,
};

test("Permission Editor detail stays contained across the W7 widths", async ({
  page,
}, testInfo) => {
  await page.goto(
    `/management?module=permissions&role=${ROLE_ID}&view=permissions`
  );

  await expect(
    page.getByRole("heading", { name: "權限管理 · 同工", exact: true })
  ).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "搜尋權限" })).toBeVisible();
  await expect(page.getByLabel("連續權限清單")).toBeVisible();
  await expect(page.locator("[data-capability]")).toHaveCount(
    PERMISSIONS.length
  );
  if (W7_PHONE_PROJECTS[testInfo.project.name] === true) {
    await page.locator('[aria-label="權限儲存操作"]').scrollIntoViewIfNeeded();
  }
  const geometry = await page.evaluate(() => {
    const box = (element: Element | null) => {
      if (!element) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const doc = document.documentElement;
    const content = document.querySelector<HTMLElement>("#shell-content");
    const main = document.querySelector<HTMLElement>("#shell-content > main");
    const list = document.querySelector<HTMLElement>(
      '[aria-label="連續權限清單"]'
    );
    const rows = [
      ...document.querySelectorAll<HTMLElement>("[data-capability]"),
    ];
    const switches = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-capability] [role="switch"]'
      ),
    ];
    const back = document.querySelector<HTMLElement>(
      'a[href*="module=permissions"]'
    );
    const sticky = document.querySelector<HTMLElement>(
      '[data-slot="action-surface"][aria-label="權限儲存操作"]'
    );
    const dock = document.querySelector<HTMLElement>(".nav-phone");
    const dockStyle = dock ? getComputedStyle(dock) : null;
    const contentStyle = content ? getComputedStyle(content) : null;

    return {
      viewportWidth,
      viewportHeight,
      horizontalOverflow:
        Math.max(doc.scrollWidth, document.body.scrollWidth) - viewportWidth,
      main: box(main),
      list: box(list),
      rows: rows.map(box),
      switches: switches.map(box),
      back: box(back),
      sticky: box(sticky),
      dock: box(dock),
      dockPosition: dockStyle?.position ?? null,
      contentPaddingBottom: contentStyle?.paddingBottom ?? null,
    };
  });

  await attachNumericEvidence(
    testInfo,
    "permission-editor-detail-geometry",
    geometry
  );
  expect(
    geometry.horizontalOverflow,
    `horizontal overflow at ${geometry.viewportWidth}px`
  ).toBeLessThanOrEqual(1);
  expect(geometry.main).not.toBeNull();
  expect(geometry.list).not.toBeNull();
  expect(geometry.rows.length).toBe(PERMISSIONS.length);

  for (const item of [
    { name: "main", box: geometry.main },
    { name: "permission list", box: geometry.list },
    ...geometry.rows.map((box, index) => ({
      name: `permission row ${index + 1}`,
      box,
    })),
  ]) {
    expect(item.box, `${item.name} must render`).not.toBeNull();
    if (item.box) {
      expect(
        item.box.left,
        `${item.name} left at ${geometry.viewportWidth}px`
      ).toBeGreaterThanOrEqual(-1);
      expect(
        item.box.right,
        `${item.name} right at ${geometry.viewportWidth}px`
      ).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    }
  }

  expect(
    geometry.back?.height ?? 0,
    "Back target height"
  ).toBeGreaterThanOrEqual(44);
  expect(
    geometry.rows.every((row) => (row?.height ?? 0) >= 44),
    "permission rows provide 44px action targets"
  ).toBe(true);
  expect(
    geometry.sticky?.height ?? 0,
    "action surface target height"
  ).toBeGreaterThanOrEqual(44);
  expect(
    geometry.switches.length,
    "each permission has a switch projection"
  ).toBe(PERMISSIONS.length);
  for (const [index, item] of geometry.switches.entries()) {
    expect(item, `permission switch ${index + 1} must render`).not.toBeNull();
    if (item) {
      expect(
        item.width,
        `permission switch ${index + 1} width`
      ).toBeGreaterThanOrEqual(44);
      expect(
        item.height,
        `permission switch ${index + 1} height`
      ).toBeGreaterThanOrEqual(44);
    }
  }

  if (W7_PHONE_PROJECTS[testInfo.project.name] === true) {
    expect(geometry.dockPosition).toBe("fixed");
    expect(geometry.dock).not.toBeNull();
    expect(geometry.contentPaddingBottom).toMatch(/84px/);
    expect(geometry.sticky).not.toBeNull();
    if (geometry.dock && geometry.sticky) {
      expect(
        geometry.sticky.bottom,
        `action surface must clear the phone dock at ${geometry.viewportWidth}px`
      ).toBeLessThanOrEqual(geometry.dock.top + 1);
    }
  } else {
    expect(geometry.dock).not.toBeNull();
    expect(geometry.dockPosition).toBe("sticky");
    expect(geometry.contentPaddingBottom).toBe("0px");
    expect(geometry.sticky).not.toBeNull();
    if (geometry.dock && geometry.sticky) {
      expect(
        geometry.dock.width,
        `desktop rail width at ${geometry.viewportWidth}px`
      ).toBeGreaterThanOrEqual(190);
      expect(
        geometry.sticky.right,
        `desktop action surface right edge at ${geometry.viewportWidth}px`
      ).toBeLessThanOrEqual(geometry.viewportWidth + 1);
      expect(
        geometry.sticky.bottom,
        `desktop action surface bottom edge at ${geometry.viewportWidth}px`
      ).toBeLessThanOrEqual(geometry.viewportHeight - 15);
    }
  }
});

test("Permission Editor review surface remains inside the viewport", async ({
  page,
}, testInfo) => {
  await page.goto(
    `/management?module=permissions&role=${ROLE_ID}&view=permissions`
  );

  await expect(
    page.getByRole("heading", { name: "權限管理 · 同工", exact: true })
  ).toBeVisible();
  const editableSwitch = page.getByRole("switch", { name: "部門管理" });
  await editableSwitch.click();
  await page.getByRole("button", { name: "儲存變更" }).click();
  const reviewTitle = page.getByRole("heading", { name: "確認權限變更" });
  await expect(reviewTitle).toBeVisible();
  await page.waitForFunction(() => {
    const sheet = document.querySelector<HTMLElement>(
      '[data-slot="sheet-content"]'
    );
    return (
      sheet !== null &&
      sheet.getBoundingClientRect().bottom <= window.innerHeight + 1
    );
  });

  const geometry = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const doc = document.documentElement;
    const sheet = document.querySelector<HTMLElement>(
      '[data-slot="sheet-content"]'
    );
    const review = document.querySelector<HTMLElement>(
      '[aria-label="待儲存權限變更"]'
    );
    const reviewItems = [
      ...document.querySelectorAll<HTMLElement>(
        '[aria-label="待儲存權限變更"] > li'
      ),
    ];
    const box = (element: HTMLElement | null) => {
      if (!element) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    return {
      viewportWidth,
      viewportHeight,
      horizontalOverflow:
        Math.max(doc.scrollWidth, document.body.scrollWidth) - viewportWidth,
      sheet: box(sheet),
      review: box(review),
      reviewItems: reviewItems.map(box),
    };
  });
  await attachNumericEvidence(
    testInfo,
    "permission-editor-review-geometry",
    geometry
  );
  expect(
    geometry.horizontalOverflow,
    `horizontal overflow at ${geometry.viewportWidth}px with review open`
  ).toBeLessThanOrEqual(1);
  expect(geometry.sheet).not.toBeNull();
  expect(geometry.review).not.toBeNull();
  expect(geometry.reviewItems.length).toBe(1);
  if (geometry.sheet) {
    expect(geometry.sheet.left).toBeGreaterThanOrEqual(-1);
    expect(geometry.sheet.right).toBeLessThanOrEqual(
      geometry.viewportWidth + 1
    );
    expect(geometry.sheet.bottom).toBeLessThanOrEqual(
      geometry.viewportHeight + 1
    );
  }
  if (geometry.review) {
    expect(geometry.review.left).toBeGreaterThanOrEqual(-1);
    expect(geometry.review.right).toBeLessThanOrEqual(
      geometry.viewportWidth + 1
    );
  }
  for (const [index, item] of geometry.reviewItems.entries()) {
    expect(item, `review item ${index + 1} must render`).not.toBeNull();
    if (item) {
      expect(item.left).toBeGreaterThanOrEqual(-1);
      expect(item.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    }
  }
});
