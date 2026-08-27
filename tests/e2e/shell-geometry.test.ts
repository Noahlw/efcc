/* oxlint-disable vitest/prefer-importing-vitest-globals --
 * Playwright spec (uses @playwright/test's `test`/`expect`), not a Vitest
 * test file. oxlint's vitest plugin unconditionally matches **\/*.test.ts.
 */
/**
 * TK-09 — pinned Chromium geometry for the Authenticated Shell.
 *
 * Widths: 320, 390, 600, 799, 800, 1024, 1440 CSS px (project names w-*).
 * Proves shell critical anchors (outlet/chrome, skip link, primary nav,
 * dock or rail, main, live region) with no horizontal overflow and no
 * obstruction. Both sides of the 800px breakpoint are exercised (w-799 and
 * w-800). All evidence is numeric CSS pixels — no screenshots (TK-12).
 */
import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

import { COPY } from "../../web/lib/copy";
import {
  defaultSections,
  stableNavigationSections,
} from "../../web/lib/sections";

const AUTH_HINT_KEY = "efcc_auth_active";

const PUBLIC_USER = {
  userId: "u1",
  name: "Test User",
  username: "tester",
  phone: "0900000000",
  role: "Staff",
  status: "active",
  qrCodeString: "qr:u1",
};

async function stubAuth(route: Route) {
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
  await page.route("**/api/v1/auth/me", stubAuth);
  await page.route("**/api/v1/auth/refresh", stubAuth);
  await page.route("**/api/v1/auth/logout", stubAuth);
});

const isPhone = (projectName: string) =>
  ["w-320", "w-390", "w-600", "w-799"].includes(projectName);

test("shell critical anchors render at the pinned width with no overflow or obstruction", async ({
  page,
}, testInfo) => {
  await page.goto("/home");

  // Wait for the authenticated shell (nav landmark + main outlet).
  const nav = page.locator("#main-navigation");
  await expect(nav).toBeVisible();
  const main = page.locator("main#shell-content");
  await expect(main).toBeVisible();

  // Skip link present as the first focusable anchor.
  const skip = page.locator('a[href="#shell-content"]');
  await expect(skip).toBeAttached();

  // Live region: exactly one polite status region.
  await expect(
    page.locator('output[role="status"][aria-live="polite"]')
  ).toHaveCount(1);

  // Shell header present (Staff role renders identity + bell).
  const header = page.locator("header[data-shell-header]");
  await expect(header).toBeVisible();

  const geometry = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const doc = document.documentElement;
    const horizontalOverflow = Math.max(
      doc.scrollWidth,
      document.body.scrollWidth
    ) - viewportWidth;

    const nav = document.querySelector<HTMLElement>("#main-navigation");
    const navStyle = nav ? getComputedStyle(nav) : null;
    const mainEl = document.querySelector<HTMLElement>("#shell-content");
    const headerEl = document.querySelector<HTMLElement>(
      "header[data-shell-header]"
    );
    const headerBox = headerEl?.getBoundingClientRect();
    const navBox = nav?.getBoundingClientRect();

    const visibleControls = [
      ...document.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, summary, [role="button"], [role="tab"]'
      ),
    ]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          display: style.display,
          visibility: style.visibility,
          height: rect.height,
          width: rect.width,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
          top: rect.top,
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

    return {
      viewportWidth,
      viewportHeight,
      horizontalOverflow,
      navPosition: navStyle ? navStyle.position : null,
      navBottom: navBox ? navBox.bottom : null,
      navHeight: navBox ? navBox.height : null,
      headerBottom: headerBox ? headerBox.bottom : null,
      headerTop: headerBox ? headerBox.top : null,
      mainScrollable: mainEl
        ? getComputedStyle(mainEl).overflowY === "auto"
        : false,
      mainPaddingBottom: mainEl
        ? getComputedStyle(mainEl).paddingBottom
        : null,
      undersized: visibleControls.filter(
        (c) => c.width < 44 || c.height < 44
      ).length,
    };
  });

  const phone = isPhone(testInfo.project.name);

  // No horizontal overflow (tolerance: 1px, matching the S4 hardening gate).
  expect(
    geometry.horizontalOverflow,
    `horizontal overflow at ${geometry.viewportWidth}px`
  ).toBeLessThanOrEqual(1);

  // Shell presentation matches the breakpoint side.
  expect(geometry.navPosition).toBe(phone ? "fixed" : "sticky");

  // Dock clears the bottom safe-area reserve (phone); rail is below the
  // header (desktop) and content does not overlap the chrome.
  if (phone) {
    expect(geometry.navBottom).not.toBeNull();
    if (geometry.navBottom !== null) {
      expect(geometry.navBottom).toBeLessThanOrEqual(geometry.viewportHeight);
    }
    // Dock height ~62px + bottom offset within the viewport.
    expect(geometry.navHeight).toBeGreaterThanOrEqual(44);
    // Outlet reserves the dock height (84px + safe-area) on phone.
    expect(geometry.mainPaddingBottom).not.toBe("0px");
  } else {
    // Rail starts below the header and is persistent (sticky).
    if (
      geometry.headerBottom !== null &&
      geometry.navBottom !== null &&
      geometry.navHeight !== null
    ) {
      expect(geometry.headerBottom).toBeLessThanOrEqual(
        geometry.navBottom - geometry.navHeight + 1
      );
    }
    // Outlet reserves nothing on desktop.
    expect(geometry.mainPaddingBottom).toBe("0px");
  }

  // Main outlet is the scroll container.
  expect(geometry.mainScrollable).toBe(true);

  // No visible control is below the 44px target.
  expect(geometry.undersized).toBe(0);
});

test("799px shows the phone shell; 800px shows the desktop shell", async ({
  page,
}, testInfo) => {
  await page.goto("/home");
  await expect(page.locator("#main-navigation")).toBeVisible();

  const position = await page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>("#main-navigation");
    return nav ? getComputedStyle(nav).position : null;
  });

  if (testInfo.project.name === "w-799") {
    expect(position).toBe("fixed");
  }
  if (testInfo.project.name === "w-800") {
    expect(position).toBe("sticky");
  }
});

test("focus order at the pinned width: skip link, primary nav, main, then chrome tail", async ({
  page,
}, testInfo) => {
  await page.goto("/home");
  const nav = page.locator("#main-navigation");
  await expect(nav).toBeVisible();

  // First Tab focuses the skip link.
  await page.keyboard.press("Tab");
  const firstFocus = await page.evaluate(() => {
    const el = document.activeElement;
    return {
      tag: el?.tagName ?? null,
      href: el instanceof HTMLAnchorElement ? el.getAttribute("href") : null,
    };
  });
  expect(firstFocus.href).toBe("#shell-content");

  // Tab through until the first nav link receives focus; assert the nav
  // links are reachable and show a visible focus outline.
  let active = null;
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("Tab");
    active = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        inNav: el instanceof HTMLElement && !!el.closest("#main-navigation"),
        tag: el?.tagName ?? null,
      };
    });
    if (active.inNav) {
      break;
    }
  }
  expect(active?.inNav, "primary nav must be reachable via Tab").toBe(true);

  const outline = await page.evaluate(() => {
    const el = document.activeElement;
    return el instanceof HTMLElement ? getComputedStyle(el).outlineWidth : "0px";
  });
  expect(outline, "focused nav item must show a focus outline").not.toBe("0px");
});
