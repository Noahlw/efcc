/* oxlint-disable vitest/prefer-importing-vitest-globals --
 * Playwright spec (uses @playwright/test's `test`/`expect`), not a Vitest
 * test file. oxlint's vitest plugin unconditionally matches **\/*.test.ts.
 */
// CF0-06 acceptance suite — local production shell at 375×812 and 1280×800.
// Runs against the static export served by tests/e2e/serve-static.ts; the
// /api/v1/auth/* cookie boundary is stubbed in-browser so the suite has no
// Google / Apps Script dependency (criterion 7).

import { expect, test } from "@playwright/test";
import type { Page, Route, TestInfo } from "@playwright/test";

import { COPY, LANDING } from "../../web/lib/copy";
import { defaultSections, projectNavigation } from "../../web/lib/sections";
import { attachNumericEvidence } from "./numeric-evidence";

interface BoundingBox {
  width: number;
  height: number;
  x: number;
  y: number;
}

// Helper: assert a possibly-null bounding box is present, then return it.
function requireBox(box: BoundingBox | null): BoundingBox {
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
  status: "active",
  qrCodeString: "qr:u1",
  identities: [
    {
      label: "同工",
      scopeKind: "Global",
      scopeLabel: null,
    },
  ],
  capabilities: { "program.manage": true },
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
          navigation: projectNavigation({}),
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

test("bottom nav below 800px, side rail at or above 800px", async ({
  page,
}, testInfo: TestInfo) => {
  await page.goto("/home.html");

  const nav = page.locator("#main-navigation");
  await expect(nav).toBeVisible();
  const position = await nav.evaluate((el) => getComputedStyle(el).position);
  await attachNumericEvidence(testInfo, "responsive-navigation-position", {
    position,
    project: testInfo.project.name,
  });
  if (isMobile(testInfo.project.name)) {
    expect(position).toBe("fixed");
  } else {
    expect(position).toBe("sticky");
  }
});

test("shell header spans top and desktop side rail sits below it, not overlapping", async ({
  page,
}, testInfo: TestInfo) => {
  await page.goto("/profile.html");

  const header = page.getByRole("banner");
  await expect(header).toBeVisible();
  const headerBox = requireBox(await header.boundingBox());
  let railBox: BoundingBox | null = null;
  if (!isMobile(testInfo.project.name)) {
    const rail = page.locator("#main-navigation");
    await expect(rail).toBeVisible();
    railBox = requireBox(await rail.boundingBox());
  }
  await attachNumericEvidence(testInfo, "responsive-header-rail", {
    headerBox,
    railBox,
    project: testInfo.project.name,
  });

  expect(headerBox.x).toBe(0);
  if (!isMobile(testInfo.project.name)) {
    expect(railBox?.x).toBe(0);
    expect(railBox?.y).toBeGreaterThanOrEqual(
      headerBox.y + headerBox.height - 1
    );
  }
});

test("no horizontal overflow at the target viewport", async ({
  page,
}, testInfo: TestInfo) => {
  for (const path of [
    "/profile.html",
    "/profile/settings.html",
    "/home.html",
  ] as const) {
    await page.goto(path);
    const geometry = await page.evaluate(() => ({
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    await attachNumericEvidence(testInfo, "responsive-document-overflow", {
      path,
      ...geometry,
    });
    expect(
      geometry.documentScrollWidth,
      `horizontal overflow on ${path}`
    ).toBeLessThanOrEqual(geometry.viewportWidth);
  }
});

test("profile page fits the shell-content without horizontal overflow at 375x812", async ({
  page,
}, testInfo: TestInfo) => {
  test.skip(!isMobile(testInfo.project.name), "mobile-only");
  await page.goto("/profile.html");
  await expect(page.getByRole("main")).toBeVisible();
  await page.waitForSelector("#shell-content", { state: "visible" });
  const geometry = await page.evaluate(() => {
    const el = document.getElementById("shell-content");
    return el
      ? { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
      : null;
  });
  await attachNumericEvidence(testInfo, "responsive-shell-content-overflow", {
    geometry,
  });
  expect(geometry).not.toBeNull();
  expect(geometry?.scrollWidth).toBeLessThanOrEqual(
    (geometry?.clientWidth ?? 0) + 1
  );
});

test("bottom nav and page outlet reserve safe-area inset", async ({
  page,
}, testInfo: TestInfo) => {
  await page.goto("/home.html");
  await expect(page.locator("#main-navigation")).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();

  // Emulate a notched device so env(safe-area-inset-bottom) resolves to a
  // non-zero value (viewport-fit=cover is set in web/app/layout.tsx).
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", {
    insets: { top: 0, left: 0, right: 0, bottom: 34 },
  });

  const layout = await page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>("#main-navigation");
    const shell = document.getElementById("shell-content");
    const navStyle = nav ? getComputedStyle(nav) : null;
    const shellStyle = shell ? getComputedStyle(shell) : null;
    return {
      navBottom: navStyle ? navStyle.bottom : null,
      shellBottom: shellStyle ? shellStyle.paddingBottom : null,
    };
  });

  // At/above 800px the side rail replaces the fixed bottom nav, so the
  // outlet intentionally reserves nothing (padding-bottom: 0).
  const expectedShell = isMobile(testInfo.project.name) ? "118px" : "0px";
  await attachNumericEvidence(testInfo, "responsive-safe-area", {
    layout,
    expectedShell,
    project: testInfo.project.name,
  });
  if (isMobile(testInfo.project.name)) {
    expect(
      layout.navBottom,
      "floating dock bottom offset must clear the safe-area inset"
    ).toBe("44px");
  }
  expect(
    layout.shellBottom,
    "page outlet must reserve the nav height plus safe-area inset"
  ).toBe(expectedShell);
});

test("nav targets are at least 44x44 and keyboard reachable with a visible focus cue", async ({
  page,
}, testInfo: TestInfo) => {
  await page.goto("/profile.html");

  const visibleNav = page.locator("#main-navigation");
  await expect(visibleNav).toBeVisible();

  const navItems = visibleNav.locator(".nav-item");
  const count = await navItems.count();
  expect(count).toBeGreaterThan(0);
  const boxes = await Promise.all(
    Array.from({ length: count }, (_, index) =>
      navItems.nth(index).boundingBox()
    )
  );
  await attachNumericEvidence(testInfo, "responsive-nav-targets", {
    project: testInfo.project.name,
    targets: boxes.map((box, index) => ({ index, box })),
  });

  for (const [index, box] of boxes.entries()) {
    expect(box, `nav item ${index} bounding box`).not.toBeNull();
    const { width, height } = requireBox(box);
    expect(width, `nav item ${index} width`).toBeGreaterThanOrEqual(44);
    expect(height, `nav item ${index} height`).toBeGreaterThanOrEqual(44);
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
  await attachNumericEvidence(testInfo, "responsive-nav-focus", {
    activeIsNavItem,
    outlineWidth,
  });
  expect(outlineWidth, "focused nav item must show a focus outline").not.toBe(
    "0px"
  );
});

test("active section exposes aria-current and the nav has an accessible label", async ({
  page,
}) => {
  // Clean URL — the production worker serves /home; the static test server
  // maps extensionless paths to *.html. The app derives the active section
  // from the pathname, so a .html suffix would break aria-current detection.
  await page.goto("/home");

  const nav = page.locator("#main-navigation:visible");
  await expect(nav).toBeVisible();

  const activeCount = await nav.locator('[aria-current="page"]').count();
  expect(activeCount, "exactly one active section in the nav landmark").toBe(1);
  const activeHref = await nav
    .locator('[aria-current="page"]')
    .first()
    .getAttribute("href");
  expect(activeHref).toBe("/home");
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

test("primary controls are at least 44x44", async ({
  page,
}, testInfo: TestInfo) => {
  await page.goto("/profile.html");
  const signOut = page
    .getByRole("button", { name: COPY.logout.submit })
    .first();
  await expect(signOut).toBeVisible();
  const box = await signOut.boundingBox();
  await attachNumericEvidence(testInfo, "responsive-primary-control", {
    box,
  });
  expect(box, "Sign Out bounding box").not.toBeNull();
  const requiredBox = requireBox(box);
  expect(requiredBox.width).toBeGreaterThanOrEqual(44);
  expect(requiredBox.height).toBeGreaterThanOrEqual(44);
});

test("login form controls are at least 44x44", async ({
  page,
}, testInfo: TestInfo) => {
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
  await page.waitForLoadState("networkidle");
  const username = page.locator('input[autocomplete="username"]');
  const relogin = page.getByRole("button", {
    name: COPY.sessionExpired.reLogin,
  });
  await expect(relogin).toBeVisible();
  await relogin.click();
  const password = page.locator('input[autocomplete="current-password"]');
  const submit = page.getByRole("button", { name: COPY.login.submit });
  await expect(username).toBeVisible();
  await expect(password).toBeVisible();
  await expect(submit).toBeVisible();

  const controls = [
    ["username", username],
    ["password", password],
    ["submit", submit],
  ] as const;
  const boxes = await Promise.all(
    controls.map(async ([label, control]) => ({
      label,
      box: await control.boundingBox(),
    }))
  );
  await attachNumericEvidence(testInfo, "responsive-login-controls", {
    boxes,
  });
  for (const { label, box } of boxes) {
    expect(box, `${label} bounding box`).not.toBeNull();
    const { width, height } = requireBox(box);
    expect(width, `${label} width`).toBeGreaterThanOrEqual(44);
    expect(height, `${label} height`).toBeGreaterThanOrEqual(44);
  }
});

test("recovery retry control is at least 44x44", async ({
  page,
}, testInfo: TestInfo) => {
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
  await attachNumericEvidence(testInfo, "responsive-recovery-retry", {
    box,
  });
  expect(box, "retry bounding box").not.toBeNull();
  const requiredBox = requireBox(box);
  expect(requiredBox.width).toBeGreaterThanOrEqual(44);
  expect(requiredBox.height).toBeGreaterThanOrEqual(44);
});

test("register skip link and brand are at least 44px tall", async ({
  page,
}, testInfo: TestInfo) => {
  await page.goto("/register.html");
  // CSS module classes are hashed in the static export, so select by the
  // stable role/aria-label the register surface exposes.
  const skip = page.locator('a[href="#register"]');
  const brand = page.getByRole("link", { name: LANDING.homeLabel });
  await expect(brand).toBeVisible();
  const elements = [
    ["skip link", skip],
    ["brand", brand],
  ] as const;
  const heights = await Promise.all(
    elements.map(async ([label, element]) => ({
      label,
      height: await element.evaluate(
        (node) => node.getBoundingClientRect().height
      ),
    }))
  );
  await attachNumericEvidence(testInfo, "responsive-register-targets", {
    heights,
  });
  for (const { label, height } of heights) {
    expect(height, `${label} height`).toBeGreaterThanOrEqual(44);
  }
});

test("register page fits 375x667 without vertical scroll", async ({
  page,
}, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/register.html");
  const geometry = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
  await attachNumericEvidence(testInfo, "responsive-register-viewport", {
    ...geometry,
  });
  expect(
    geometry.scrollHeight,
    "register exceeds the 375x667 viewport"
  ).toBeLessThanOrEqual(geometry.clientHeight);
});
