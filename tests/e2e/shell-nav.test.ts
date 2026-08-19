/* oxlint-disable vitest/prefer-importing-vitest-globals --
 * Playwright acceptance suite for Spec 084 / Ticket 084-02:
 * 5-slot shell navigation, Care removal, offline banner, and accessibility.
 */
import { expect, test } from "@playwright/test";
import type { Route } from "@playwright/test";

import { COPY } from "../../web/lib/copy";
import {
  defaultSections,
  stableNavigationSections,
} from "../../web/lib/sections";

const AUTH_HINT_KEY = "efcc_auth_active";

const MEMBER_USER = {
  userId: "u-member",
  name: "Member User",
  username: "member",
  phone: "91234567",
  role: "Member",
  status: "active",
  qrCodeString: "qr:u-member",
};

const STAFF_USER = {
  userId: "u-staff",
  name: "Staff User",
  username: "staff",
  phone: "91234568",
  role: "Staff",
  status: "active",
  qrCodeString: "qr:u-staff",
};

function stubAuthFor(user: typeof MEMBER_USER) {
  return async (route: Route) => {
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
            user,
            sections: defaultSections(),
            navigation: stableNavigationSections(user.role),
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

    await route.fulfill({ status: 404 });
  };
}

test.describe("084-02: 5-slot navigation and shell contract", () => {
  test("Member role receives 5-slot dock with Notices (not Management)", async ({
    page,
  }, testInfo) => {
    await page.addInitScript(
      ({ key, value }: { key: string; value: string }) => {
        localStorage.setItem(key, value);
      },
      { key: AUTH_HINT_KEY, value: "1" }
    );
    await page.route("**/api/v1/auth/**", stubAuthFor(MEMBER_USER));
    await page.goto("/home");

    const nav = testInfo.project.name.startsWith("mobile")
      ? page.locator("nav.nav-phone")
      : page.locator("nav.nav-desktop");
    await expect(nav).toBeVisible();

    const links = nav.locator("a");
    await expect(links).toHaveCount(5);

    // Verify 5 slots: 首頁, 聚會, 簽到, 通知, 帳戶
    await expect(links.nth(0)).toHaveText(COPY.sections.home);
    await expect(links.nth(1)).toHaveText(COPY.sections.programs);
    await expect(links.nth(2)).toHaveText(COPY.sections.scanner);
    await expect(links.nth(3)).toHaveText(COPY.sections.notices);
    await expect(links.nth(4)).toHaveText(COPY.sections.profile);

    // Verify hrefs
    await expect(links.nth(0)).toHaveAttribute("href", "/home");
    await expect(links.nth(1)).toHaveAttribute("href", "/programs");
    await expect(links.nth(2)).toHaveAttribute("href", "/scanner");
    await expect(links.nth(3)).toHaveAttribute("href", "/notices");
    await expect(links.nth(4)).toHaveAttribute("href", "/profile");
  });

  test("Staff role receives 5-slot dock with Management (not Notices)", async ({
    page,
  }, testInfo) => {
    await page.addInitScript(
      ({ key, value }: { key: string; value: string }) => {
        localStorage.setItem(key, value);
      },
      { key: AUTH_HINT_KEY, value: "1" }
    );
    await page.route("**/api/v1/auth/**", stubAuthFor(STAFF_USER));
    await page.goto("/home");

    const nav = testInfo.project.name.startsWith("mobile")
      ? page.locator("nav.nav-phone")
      : page.locator("nav.nav-desktop");
    await expect(nav).toBeVisible();

    const links = nav.locator("a");
    await expect(links).toHaveCount(5);

    // Verify 5 slots: 首頁, 聚會, 簽到, 管理, 帳戶
    await expect(links.nth(0)).toHaveText(COPY.sections.home);
    await expect(links.nth(1)).toHaveText(COPY.sections.programs);
    await expect(links.nth(2)).toHaveText(COPY.sections.scanner);
    await expect(links.nth(3)).toHaveText(COPY.sections.management);
    await expect(links.nth(4)).toHaveText(COPY.sections.profile);

    // Verify hrefs
    await expect(links.nth(3)).toHaveAttribute("href", "/management");
  });

  test("Care is removed: no Care slot in nav and /care is not accessible", async ({
    page,
  }) => {
    await page.addInitScript(
      ({ key, value }: { key: string; value: string }) => {
        localStorage.setItem(key, value);
      },
      { key: AUTH_HINT_KEY, value: "1" }
    );
    await page.route("**/api/v1/auth/**", stubAuthFor(STAFF_USER));
    await page.goto("/home");

    // Nav has no care link
    const careNav = page.locator("nav a", { hasText: "關懷" });
    await expect(careNav).toHaveCount(0);
  });

  test("Offline banner appears when offline and auto-hides when online", async ({
    page,
    context,
  }) => {
    await page.addInitScript(
      ({ key, value }: { key: string; value: string }) => {
        localStorage.setItem(key, value);
      },
      { key: AUTH_HINT_KEY, value: "1" }
    );
    await page.route("**/api/v1/auth/**", stubAuthFor(MEMBER_USER));
    await page.goto("/home");

    const banner = page
      .getByRole("status", { name: COPY.offlineBanner })
      .or(page.getByText(COPY.offlineBanner));
    // Initially online -> banner not visible
    await expect(banner).toHaveCount(0);

    // Trigger offline
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(page.getByText(COPY.offlineBanner)).toBeVisible();

    // Trigger online
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.getByText(COPY.offlineBanner)).toHaveCount(0);
  });

  test("Skip link and polite live region are accessible", async ({ page }) => {
    await page.addInitScript(
      ({ key, value }: { key: string; value: string }) => {
        localStorage.setItem(key, value);
      },
      { key: AUTH_HINT_KEY, value: "1" }
    );
    await page.route("**/api/v1/auth/**", stubAuthFor(MEMBER_USER));
    await page.goto("/home");

    const skipLink = page.locator('a[href="#shell-content"]');
    await expect(skipLink).toBeAttached();
    await expect(skipLink).toHaveText(COPY.skipToContent);

    const liveRegion = page.locator('[role="status"][aria-live="polite"]');
    await expect(liveRegion).toBeAttached();
  });
});

test.describe("089-S1: Reconciled shared shell, top bar, and Attention panel contract", () => {
  test("Management top bar displays identity and bell; clicking bell opens Attention panel", async ({
    page,
  }) => {
    await page.addInitScript(
      ({ key, value }: { key: string; value: string }) => {
        localStorage.setItem(key, value);
      },
      { key: AUTH_HINT_KEY, value: "1" }
    );
    await page.route("**/api/v1/auth/**", stubAuthFor(STAFF_USER));
    await page.goto("/home");

    const header = page.locator("header");
    await expect(header).toBeVisible();
    await expect(header.getByText(COPY.shell.shortMark)).toBeVisible();
    await expect(header.getByText(STAFF_USER.name)).toBeVisible();
    await expect(header.getByText(COPY.shell.roleLabels.Staff)).toBeVisible();

    const bell = header.getByRole("button", {
      name: new RegExp(COPY.attention.title),
    });
    await expect(bell).toBeVisible();

    // Open attention panel
    await bell.click();
    const dialog = page.getByRole("dialog", { name: COPY.attention.title });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("tab", { name: COPY.attention.pendingTab })
    ).toBeVisible();
    await expect(
      dialog.getByRole("tab", { name: COPY.attention.noticesTab })
    ).toBeVisible();
    await expect(
      dialog.getByText(COPY.attention.pendingEmptyTitle)
    ).toBeVisible();

    // Dismiss on Escape
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("Member top bar renders simple section mark without identity or bell", async ({
    page,
  }) => {
    await page.addInitScript(
      ({ key, value }: { key: string; value: string }) => {
        localStorage.setItem(key, value);
      },
      { key: AUTH_HINT_KEY, value: "1" }
    );
    await page.route("**/api/v1/auth/**", stubAuthFor(MEMBER_USER));
    await page.goto("/home");

    const header = page.locator("header");
    await expect(header).toBeVisible();
    await expect(header.getByText(MEMBER_USER.name)).toHaveCount(0);
    await expect(
      header.getByRole("button", { name: new RegExp(COPY.attention.title) })
    ).toHaveCount(0);
  });

  test("On /scanner, top bar is suppressed while dock/rail nav remains mounted", async ({
    page,
  }, testInfo) => {
    await page.addInitScript(
      ({ key, value }: { key: string; value: string }) => {
        localStorage.setItem(key, value);
      },
      { key: AUTH_HINT_KEY, value: "1" }
    );
    await page.route("**/api/v1/auth/**", stubAuthFor(STAFF_USER));
    await page.goto("/scanner");

    // Top bar is hidden
    await expect(page.locator("header")).toHaveCount(0);

    // Navigation remains visible
    const nav = testInfo.project.name.startsWith("mobile")
      ? page.locator("nav.nav-phone")
      : page.locator("nav.nav-desktop");
    await expect(nav).toBeVisible();
    await expect(nav.locator(".nav-item--scan")).toBeVisible();
  });
});
