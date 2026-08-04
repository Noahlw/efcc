/* oxlint-disable vitest/prefer-importing-vitest-globals --
 * Playwright spec (uses @playwright/test's `test`/`expect`), not a Vitest
 * test file. oxlint's vitest plugin unconditionally matches **\/*.test.ts.
 */
// CF0-06 acceptance suite — local production shell at 375×812 and 1280×800.
// Runs against the static export served by tests/e2e/serve-static.ts; the
// /api/v1/rpc endpoint is stubbed in-browser so the suite has no Google /
// Apps Script dependency (criterion 7).

import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

import { COPY } from "../../web/lib/copy";

// Helper: assert a possibly-null bounding box is present, then return it.
function requireBox(box: { width: number; height: number } | null): {
  width: number;
  height: number;
} {
  if (!box) {
    throw new Error("bounding box is null");
  }
  return box;
}

interface Bootstrap {
  session: {
    userId: string;
    name: string;
    role: string;
    qrCodeString: string;
    sessionId: string;
    sessionToken: string;
  };
  sections: {
    key: string;
    label: string;
    capability: string;
    requiresServerAuth: boolean;
  }[];
  profile: {
    userId: string;
    name: string;
    username: string;
    phone: string;
    role: string;
    status: string;
    qrCodeString: string;
  };
}

const SESSION = {
  userId: "u1",
  sessionId: "s1",
  sessionToken: "t1",
} as const;

const BOOTSTRAP: Bootstrap = {
  session: {
    userId: "u1",
    name: "Test User",
    role: "staff",
    qrCodeString: "qr:u1",
    sessionId: "s1",
    sessionToken: "t1",
  },
  sections: [
    {
      key: "profile",
      label: COPY.sections.profile,
      capability: "READ",
      requiresServerAuth: false,
    },
    {
      key: "programs",
      label: COPY.sections.programs,
      capability: "READ",
      requiresServerAuth: false,
    },
    {
      key: "care",
      label: COPY.sections.care,
      capability: "AUTH",
      requiresServerAuth: true,
    },
  ],
  profile: {
    userId: "u1",
    name: "Test User",
    username: "tester",
    phone: "0900000000",
    role: "staff",
    status: "active",
    qrCodeString: "qr:u1",
  },
};

async function stubRpc(route: Route, request: { postDataJSON: () => unknown }) {
  const body = request.postDataJSON() ?? {};
  const action =
    body &&
    typeof body === "object" &&
    "action" in body &&
    typeof body.action === "string"
      ? body.action
      : undefined;

  if (action === "restoreApp") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        requestId: "r-1",
        data: BOOTSTRAP,
      }),
    });
    return;
  }

  if (action === "authorizedNavigate") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        requestId: "r-2",
        data: { authorized: true },
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
  // Stringify inside the init script: SESSION is a Node value, not a value
  // that survives into the browser context otherwise.
  await page.addInitScript((serialized: string) => {
    localStorage.setItem("efcc_session", serialized);
  }, JSON.stringify(SESSION));

  await page.route("**/api/v1/rpc", stubRpc);
});

const isMobile = (projectName: string) => projectName.startsWith("mobile");

test("bottom nav below 768px, side rail at or above 768px", async ({
  page,
}, testInfo) => {
  await page.goto("/care.html");

  if (isMobile(testInfo.project.name)) {
    await expect(page.locator(".nav-phone")).toBeVisible();
    await expect(page.locator(".nav-desktop")).toBeHidden();
  } else {
    await expect(page.locator(".nav-desktop")).toBeVisible();
    await expect(page.locator(".nav-phone")).toBeHidden();
  }
});

test("no horizontal overflow at the target viewport", async ({ page }) => {
  for (const path of ["/profile.html", "/care.html"] as const) {
    await page.goto(path);
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    );
    expect(fits, `horizontal overflow on ${path}`).toBeTruthy();
  }
});

test("bottom nav and page outlet reserve safe-area inset", async ({
  page,
}, testInfo) => {
  await page.goto("/care.html");

  // Emulate a notched device so env(safe-area-inset-bottom) resolves to a
  // non-zero value (viewport-fit=cover is set in web/app/layout.tsx).
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", {
    insets: { top: 0, left: 0, right: 0, bottom: 34 },
  });

  const paddings = await page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>(".nav-phone");
    const shell = document.querySelector<HTMLElement>(".shell");
    return {
      navBottom: nav ? getComputedStyle(nav).paddingBottom : null,
      shellBottom: shell ? getComputedStyle(shell).paddingBottom : null,
    };
  });

  // At/above 768px the side rail replaces the fixed bottom nav, so the
  // outlet intentionally reserves nothing (padding-bottom: 0).
  const expectedShell = isMobile(testInfo.project.name) ? "94px" : "0px";

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
  // Clean URL — the production worker serves /care; the static test server
  // maps extensionless paths to *.html. The app derives the active section
  // from the pathname, so a .html suffix would break aria-current detection.
  await page.goto("/care");

  const nav = page.locator(`nav[aria-label="${COPY.nav.label}"]:visible`);
  await expect(nav).toBeVisible();

  const activeCount = await nav.locator('[aria-current="page"]').count();
  expect(activeCount, "exactly one active section in visible nav").toBe(1);
  const activeHref = await nav
    .locator('[aria-current="page"]')
    .first()
    .getAttribute("href");
  expect(activeHref).toBe("/care");

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
  await page.goto("/care.html");

  const regions = page.locator('output[role="status"][aria-live="polite"]');
  await expect(regions).toHaveCount(1);

  // Wait for the restoreApp announcement to land (the live region is empty
  // before the bootstrap resolves).
  await expect
    .poll(async () => (await regions.first().textContent()) ?? "", {
      timeout: 5000,
    })
    .not.toBe("");
});

test("primary controls are at least 44x44", async ({ page }) => {
  await page.goto("/profile.html");
  const signOut = page.getByRole("button", { name: COPY.logout.submit });
  await expect(signOut).toBeVisible();
  const box = await signOut.boundingBox();
  expect(box, "Sign Out bounding box").not.toBeNull();
  const { width, height } = requireBox(box);
  expect(width).toBeGreaterThanOrEqual(44);
  expect(height).toBeGreaterThanOrEqual(44);
});

test("login form controls are at least 44x44", async ({ page }) => {
  // Force the login route: an AUTH_REQUIRED restore response makes the
  // shell clear the stored session and redirect to /.
  await page.unroute("**/api/v1/rpc");
  await page.route("**/api/v1/rpc", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/problem+json",
      body: JSON.stringify({
        status: 401,
        code: "AUTH_REQUIRED",
        title: "Session expired",
      }),
    })
  );
  await page.goto("/care");

  const username = page.locator('input[autocomplete="username"]');
  const pin = page.locator('input[autocomplete="current-password"]');
  const submit = page.getByRole("button", { name: COPY.login.submit });
  await expect(username).toBeVisible();
  await expect(pin).toBeVisible();
  await expect(submit).toBeVisible();

  for (const [label, control] of [
    ["username", username],
    ["PIN", pin],
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
  // A 503 restore failure renders the RecoveryView with a retry control.
  await page.unroute("**/api/v1/rpc");
  await page.route("**/api/v1/rpc", (route) =>
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
  await page.goto("/care");

  const retry = page.getByRole("button", { name: COPY.error.retry });
  await expect(retry).toBeVisible();
  const box = await retry.boundingBox();
  expect(box, "retry bounding box").not.toBeNull();
  const { width, height } = requireBox(box);
  expect(width).toBeGreaterThanOrEqual(44);
  expect(height).toBeGreaterThanOrEqual(44);
});
