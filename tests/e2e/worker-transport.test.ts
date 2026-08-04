/* oxlint-disable vitest/prefer-importing-vitest-globals --
 * This is a Playwright spec, not a vitest test.
 */
/**
 * CF1-01 (#151) Worker transport end-to-end smoke test.
 *
 * Proves the full browser path through the Cloudflare Worker:
 *   Next.js -> POST /api/v1/rpc -> Worker signs -> Apps Script -> response
 *
 * Unlike the role-matrix suite, this test does NOT need Google session
 * states (.auth/*.storage.json) because the Next.js app authenticates
 * with username + PIN through the Worker's signed RPC boundary.
 */
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

const CREDENTIALS = {
  alice: { username: "alice", pin: "1234" },
  bob: { username: "bob", pin: "5678" },
  noah: { username: "noah", pin: "6883" },
} as const;

const APP_READY_TIMEOUT = 30_000;

// The app renders two navs: .nav-phone (mobile bottom bar) and .nav-desktop
// (sidebar ≥768px). At desktop width .nav-phone is display:none, so we must
// target the visible nav explicitly.
const NAV_SELECTOR = ".nav-desktop .nav-item";

async function loginAs(page: Page, creds: { username: string; pin: string }) {
  // Clear any stored session so the login page mounts cleanly.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  // Wait for React hydration to complete before interacting — otherwise
  // clicking submit triggers a native form POST (navigating to /?)
  // because the onSubmit handler isn't attached yet.
  await page.goto("/", { waitUntil: "networkidle" });

  const usernameInput = page.locator('input[autocomplete="username"]');
  const pinInput = page.locator('input[autocomplete="current-password"]');
  const submitButton = page.locator('button[type="submit"]');

  await expect(usernameInput).toBeVisible({ timeout: APP_READY_TIMEOUT });
  await expect(pinInput).toBeVisible();
  await expect(submitButton).toBeVisible();

  await usernameInput.fill(creds.username);
  await pinInput.fill(creds.pin);
  await submitButton.click();

  // Wait for the app shell to mount: login completes, router navigates to
  // the first section, AppShell calls restoreApp, and the nav bar renders.
  await expect(page.locator(NAV_SELECTOR).first()).toBeVisible({
    timeout: APP_READY_TIMEOUT,
  });
}

async function logout(page: Page) {
  const logoutButton = page.locator('button:has-text("登出")');
  await expect(logoutButton).toBeVisible({ timeout: APP_READY_TIMEOUT });
  await logoutButton.click();
  // Wait for the login form to reappear.
  await expect(page.locator('input[autocomplete="username"]')).toBeVisible({
    timeout: APP_READY_TIMEOUT,
  });
}

test.describe("CF1-01 Worker transport (#151)", () => {
  test("MEMBER login + profile + navigation through Worker", async ({
    page,
  }) => {
    await loginAs(page, CREDENTIALS.alice);

    // App shell loaded: nav items are visible.
    const navItems = page.locator(NAV_SELECTOR);
    const navCount = await navItems.count();
    expect(navCount).toBeGreaterThan(0);

    // Profile page rendered with real user data from the signed RPC.
    await expect(page.locator("h1")).toContainText("個人資料", {
      timeout: APP_READY_TIMEOUT,
    });

    // Profile data fields (name, username, role, etc.) are in <dd> elements.
    const profileFields = page.locator("dd");
    const fieldCount = await profileFields.count();
    expect(fieldCount).toBeGreaterThanOrEqual(4);

    // Navigate to another section via the nav bar.
    const secondNav = navItems.nth(1);
    const secondHref = await secondNav.getAttribute("href");
    expect(secondHref).toBeTruthy();

    await secondNav.click();

    // The new section's nav item is marked current.
    const activeNav = page.locator(`${NAV_SELECTOR}[aria-current="page"]`);
    await expect(activeNav).toBeVisible({ timeout: APP_READY_TIMEOUT });

    // Logout.
    await logout(page);
  });

  test("ADMIN sees at least as many nav items as MEMBER", async ({ page }) => {
    // Login as admin (noah).
    await loginAs(page, CREDENTIALS.noah);
    const adminNavCount = await page.locator(NAV_SELECTOR).count();

    // Logout and login as member (alice).
    await logout(page);
    await loginAs(page, CREDENTIALS.alice);
    const memberNavCount = await page.locator(NAV_SELECTOR).count();

    // Admin should see at least as many sections as MEMBER.
    expect(adminNavCount).toBeGreaterThanOrEqual(memberNavCount);

    await logout(page);
  });
});