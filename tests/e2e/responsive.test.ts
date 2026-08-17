/* oxlint-disable vitest/prefer-importing-vitest-globals --
 * Playwright spec (uses @playwright/test's `test`/`expect`), not a Vitest
 * test file. oxlint's vitest plugin unconditionally matches **\/*.test.ts.
 */
// CF0-06 acceptance suite — local production shell at 375×812 and 1280×800.
// Runs against the static export served by tests/e2e/serve-static.ts; the
// /api/v1/auth/* cookie boundary is stubbed in-browser so the suite has no
// Google / Apps Script dependency (criterion 7).

import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

import { COPY, LANDING } from "../../web/lib/copy";
import {
  defaultSections,
  stableNavigationSections,
} from "../../web/lib/sections";

// Helper: assert a possibly-null bounding box is present, then return it.
function requireBox(
  box: { x: number; y: number; width: number; height: number } | null
): {
  width: number;
  height: number;
  x: number;
  y: number;
} {
  if (!box) {
    throw new Error("bounding box is null");
  }
  return box;
}

const PUBLIC_USER = {
  userId: "u1",
  name: "Test User",
  username: "tester",
  phone: "0900000000",
  role: "Staff",
  status: "active",
  qrCodeString: "qr:u1",
};

const AUTH_HINT_KEY = "efcc_auth_active";

// Stub the cookie-only AUTH boundary. The shell resolves the user via
// GET /api/v1/auth/me (access cookie) and refreshes via POST
// /api/v1/auth/refresh; logout is POST /api/v1/auth/logout (204). The
// legacy /api/v1/rpc proxy is no longer called by the shell.
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
          // R1 contract: /auth/me returns separate server-shaped content and
          // stable navigation projections; this fixture does not derive either
          // from the profile role.
          sections: defaultSections(),
          navigation: stableNavigationSections(),
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
  // Presence hint (non-secret) so the shell attempts a cookie restore.
  await page.addInitScript(
    ({ key, value }: { key: string; value: string }) => {
      localStorage.setItem(key, value);
    },
    { key: AUTH_HINT_KEY, value: "1" }
  );

  await page.route("**/api/v1/auth/me", stubAuth);
  await page.route("**/api/v1/auth/refresh", stubAuth);
  await page.route("**/api/v1/auth/logout", stubAuth);
  await page.route("**/api/v1/rpc", stubAuth);
});

const isMobile = (projectName: string) => projectName.startsWith("mobile");

test("bottom nav below 920px, side rail at or above 920px", async ({
  page,
}, testInfo) => {
  await page.goto("/home.html");

  if (isMobile(testInfo.project.name)) {
    await expect(page.locator(".nav-phone")).toBeVisible();
    await expect(page.locator(".nav-desktop")).toBeHidden();
  } else {
    await expect(page.locator(".nav-desktop")).toBeVisible();
    await expect(page.locator(".nav-phone")).toBeHidden();
  }
});

test("shell header brand sits beside the desktop side rail, not under it", async ({
  page,
}, testInfo) => {
  await page.goto("/profile.html");

  const header = page.locator("header").first();
  await expect(header).toBeVisible();
  const headerBox = requireBox(await header.boundingBox());

  if (isMobile(testInfo.project.name)) {
    await expect(page.locator(".nav-desktop")).toBeHidden();
    expect(headerBox.x).toBeGreaterThanOrEqual(16);
    expect(headerBox.width).toBeGreaterThanOrEqual(300);
    return;
  }

  await expect(page.locator(".nav-desktop")).toBeVisible();
  const railBox = requireBox(await page.locator(".nav-desktop").boundingBox());
  expect(railBox.width).toBe(180);
  expect(headerBox.x).toBeGreaterThanOrEqual(railBox.x + railBox.width);

  const topmostAtHeader = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      if (!el) {
        return null;
      }
      return el.closest(".nav-desktop") ? "rail" : "header";
    },
    {
      x: headerBox.x + 8,
      y: headerBox.y + headerBox.height / 2,
    }
  );
  expect(topmostAtHeader).toBe("header");
});

test("no horizontal overflow at the target viewport", async ({ page }) => {
  for (const path of [
    "/profile.html",
    "/profile/settings.html",
    "/home.html",
  ] as const) {
    await page.goto(path);
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    );
    expect(fits, `horizontal overflow on ${path}`).toBeTruthy();
  }
});

test("scanner and notices surfaces fit the shell at every target viewport", async ({
  page,
}) => {
  await page.route("**/api/v1/attendance/scanner-events", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        requestId: "r-scanner-events",
        data: { events: [] },
      }),
    });
  });
  await page.route("**/api/v1/programs/notices", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        requestId: "r-notices",
        data: { notices: [], unread_count: 0 },
      }),
    });
  });

  await page.goto("/scanner.html");
  await expect(
    page.getByRole("heading", { name: COPY.attendance.scanTitle })
  ).toBeVisible();
  await expect(
    page.locator(`[aria-label="${COPY.attendance.camera}"]`)
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: new RegExp(COPY.attendance.manualEntryTitle),
    })
  ).toBeVisible();
  const scannerFits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth
  );
  expect(scannerFits).toBeTruthy();

  await page.goto("/notices.html");
  await expect(
    page.getByRole("heading", { name: COPY.sections.notices, level: 1 })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: COPY.notices.noticesLatest, level: 2 })
  ).toBeVisible();

  const noticesFits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth
  );
  expect(noticesFits).toBeTruthy();
});

test("profile page fits the shell-content without horizontal overflow at 375x812", async ({
  page,
}, testInfo) => {
  test.skip(!isMobile(testInfo.project.name), "mobile-only");
  await page.goto("/profile.html");
  await expect(page.locator(".shell-content")).toBeVisible();
  const fits = await page.evaluate(() => {
    const el = document.querySelector(".shell-content");
    if (!el) {
      return false;
    }
    return el.scrollWidth <= el.clientWidth;
  });
  expect(
    fits,
    "profile horizontally overflows the shell-content scroll box"
  ).toBeTruthy();
});

test("bottom nav and page outlet reserve safe-area inset", async ({
  page,
}, testInfo) => {
  await page.goto("/home.html");

  // Emulate a notched device so env(safe-area-inset-bottom) resolves to a
  // non-zero value (viewport-fit=cover is set in web/app/layout.tsx).
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", {
    insets: { top: 0, left: 0, right: 0, bottom: 34 },
  });

  const paddings = await page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>(".nav-phone");
    // The shell is a flex column; the scrollable outlet that must reserve the
    // bottom nav height + safe-area inset is .shell-content (Ui01 shell
    // contract).
    const shell = document.querySelector<HTMLElement>(".shell-content");
    return {
      navBottom: nav ? getComputedStyle(nav).paddingBottom : null,
      shellBottom: shell ? getComputedStyle(shell).paddingBottom : null,
    };
  });

  // Phone main: 78px dock + 28px FAB overhang + safe-area.
  // Desktop main: 64px bottom padding (no dock).
  const expectedShell = isMobile(testInfo.project.name) ? "140px" : "64px";

  expect(paddings.navBottom, "bottom nav must pad the safe-area inset").toBe(
    "34px"
  );
  expect(
    paddings.shellBottom,
    "page outlet must reserve the nav height plus safe-area inset"
  ).toBe(expectedShell);
});

test("nav targets are at least 44x44 and keyboard reachable with a visible focus cue", async ({
  page,
}, testInfo) => {
  await page.goto("/profile.html");

  const visibleNavSelector = isMobile(testInfo.project.name)
    ? ".nav-phone"
    : ".nav-desktop";
  const visibleNav = page.locator(visibleNavSelector);
  await expect(visibleNav).toBeVisible();

  const navItems = visibleNav.locator(".nav-item");
  const count = await navItems.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i += 1) {
    const item = navItems.nth(i);
    const box = await item.boundingBox();
    expect(box, `nav item ${i} bounding box`).not.toBeNull();
    const { width, height } = requireBox(box);
    expect(width, `nav item ${i} width`).toBeGreaterThanOrEqual(44);
    expect(height, `nav item ${i} height`).toBeGreaterThanOrEqual(44);
  }

  await page.keyboard.press("Tab");
  // Focus may land on the first nav item, a button, or another focusable;
  // the contract is that a .nav-item is reachable and shows the focus
  // outline when focused via keyboard.
  let activeIsNavItem = await page.evaluate(() =>
    document.activeElement?.classList.contains("nav-item")
  );
  // Allow up to a small number of Tab presses for the first nav-item to
  // actually receive focus (other focusable nodes may sit before it).
  for (let i = 0; !activeIsNavItem && i < 8; i += 1) {
    await page.keyboard.press("Tab");
    activeIsNavItem = await page.evaluate(() =>
      document.activeElement?.classList.contains("nav-item")
    );
  }
  expect(activeIsNavItem, "a .nav-item must be reachable via Tab").toBeTruthy();

  const outlineWidth = await page.evaluate(() => {
    const el = document.activeElement;
    return el instanceof HTMLElement
      ? getComputedStyle(el).outlineWidth
      : "0px";
  });
  expect(outlineWidth, "focused nav item must show a focus outline").not.toBe(
    "0px"
  );
});

test("active section exposes aria-current and the nav has an accessible label", async ({
  page,
}, testInfo) => {
  // Clean URL — the production worker serves /home; the static test server
  // maps extensionless paths to *.html. The app derives the active section
  // from the pathname, so a .html suffix would break aria-current detection.
  await page.goto("/home");

  const nav = page.locator(`nav[aria-label="${COPY.nav.label}"]:visible`);
  await expect(nav).toBeVisible();

  const activeCount = await nav.locator('[aria-current="page"]').count();
  expect(activeCount, "exactly one active section in visible nav").toBe(1);
  const activeHref = await nav
    .locator('[aria-current="page"]')
    .first()
    .getAttribute("href");
  expect(activeHref).toBe("/home");

  // Both rails render the same sections; the hidden one must also carry a
  // single aria-current=page marker (proves the conditional render uses
  // the same data path).
  const otherSelector = isMobile(testInfo.project.name)
    ? ".nav-desktop"
    : ".nav-phone";
  const otherActiveCount = await page
    .locator(`${otherSelector} [aria-current="page"]`)
    .count();
  expect(
    otherActiveCount,
    "exactly one active section in the hidden nav rail too"
  ).toBe(1);
});

test("exactly one polite live region announces shell status", async ({
  page,
}) => {
  await page.goto("/home.html");

  const regions = page.locator('output[role="status"][aria-live="polite"]');
  await expect(regions).toHaveCount(1);

  // Wait for the restore announcement to land (the live region is empty
  // before the bootstrap resolves).
  await expect
    .poll(async () => (await regions.first().textContent()) ?? "", {
      timeout: 5000,
    })
    .not.toBe("");
});

test("primary controls are at least 44x44", async ({ page }) => {
  await page.goto("/profile.html");
  const signOut = page
    .getByRole("button", { name: COPY.logout.submit })
    .first();
  await expect(signOut).toBeVisible();
  const box = await signOut.boundingBox();
  expect(box, "Sign Out bounding box").not.toBeNull();
  const { width, height } = requireBox(box);
  expect(width).toBeGreaterThanOrEqual(44);
  expect(height).toBeGreaterThanOrEqual(44);
});

test("login form controls are at least 44x44", async ({ page }) => {
  // Force the login route: an expired/revoked cookie restore (me 401 then
  // refresh 401) makes the shell clear the presence hint and land on Login.
  await page.unroute("**/api/v1/auth/me");
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/problem+json",
      body: JSON.stringify({
        status: 401,
        code: "AUTH_REQUIRED",
        title: "Unauthorized",
        detail: "Access cookie invalid or expired.",
      }),
    })
  );
  await page.route("**/api/v1/auth/refresh", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/problem+json",
      body: JSON.stringify({
        status: 401,
        code: "AUTH_REQUIRED",
        title: "Unauthorized",
        detail: "Refresh cookie missing.",
      }),
    })
  );
  await page.goto("/");
  const username = page.locator('input[autocomplete="username"]');
  const relogin = page.getByRole("button", {
    name: COPY.sessionExpired.reLogin,
  });
  await expect(username.or(relogin)).toBeVisible();
  if (await relogin.isVisible()) {
    await relogin.click();
  }
  const password = page.locator('input[autocomplete="current-password"]');
  const submit = page.getByRole("button", { name: COPY.login.submit });
  await expect(username).toBeVisible();
  await expect(password).toBeVisible();
  await expect(submit).toBeVisible();

  for (const [label, control] of [
    ["username", username],
    ["password", password],
    ["submit", submit],
  ] as const) {
    const box = await control.boundingBox();
    expect(box, `${label} bounding box`).not.toBeNull();
    const { width, height } = requireBox(box);
    expect(width, `${label} width`).toBeGreaterThanOrEqual(44);
    expect(height, `${label} height`).toBeGreaterThanOrEqual(44);
  }
});

test("recovery retry control is at least 44x44", async ({ page }) => {
  // A 503 /me failure renders the RecoveryView with a retry control.
  await page.unroute("**/api/v1/auth/me");
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/problem+json",
      body: JSON.stringify({
        status: 503,
        code: "UNAVAILABLE",
        title: "Service unavailable",
        detail: COPY.error.unavailable,
      }),
    })
  );
  await page.goto("/home");

  const retry = page.getByRole("button", { name: COPY.error.retry });
  await expect(retry).toBeVisible();
  const box = await retry.boundingBox();
  expect(box, "retry bounding box").not.toBeNull();
  const { width, height } = requireBox(box);
  expect(width).toBeGreaterThanOrEqual(44);
  expect(height).toBeGreaterThanOrEqual(44);
});

test("register skip link and brand are at least 44px tall", async ({
  page,
}) => {
  await page.goto("/register.html");
  // CSS module classes are hashed in the static export, so select by the
  // stable role/aria-label the register surface exposes.
  const skip = page.locator('a[href="#register"]');
  const brand = page.getByRole("link", { name: LANDING.homeLabel });
  await expect(brand).toBeVisible();
  for (const [label, el] of [
    ["skip link", skip],
    ["brand", brand],
  ] as const) {
    const height = await el.evaluate(
      (node) => node.getBoundingClientRect().height
    );
    expect(height, `${label} height`).toBeGreaterThanOrEqual(44);
  }
});

test("register page fits 375x667 without vertical scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/register.html");
  const fits = await page.evaluate(
    () =>
      document.documentElement.scrollHeight <=
      document.documentElement.clientHeight
  );
  expect(fits, "register exceeds the 375x667 viewport").toBeTruthy();
});
