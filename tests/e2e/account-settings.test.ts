/* oxlint-disable vitest/prefer-importing-vitest-globals --
 * Playwright acceptance suite for Spec 084 / Ticket 084-03 (#305):
 * Account and Account Settings surfaces.
 */
import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

import { ACCOUNT_SETTINGS_COPY } from "../../web/lib/account-settings-copy";
import { COPY } from "../../web/lib/copy";
import { defaultSections, projectNavigation } from "../../web/lib/sections";

const AUTH_HINT_KEY = "efcc_auth_active";

const MEMBER_USER = {
  userId: "u-member-101",
  name: "陳小明",
  username: "member.demo",
  phone: "91234567",
  role: "Member",
  status: "Active",
  qrCodeString: "qr:u-member-101",
  identities: [{ label: "會友基礎", scopeKind: "Global", scopeLabel: null }],
  capabilities: { "program.enroll": true, "role.manage": false },
};

function stubAuthEndpoints(user: typeof MEMBER_USER, revoked = false) {
  let sessionRevoked = revoked;
  return async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (path === "/api/v1/auth/me" && method === "GET") {
      if (sessionRevoked) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({
            requestId: "r-me",
            error: { code: "AUTH_REQUIRED" },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          requestId: "r-me",
          data: {
            user,
            sections: defaultSections(),
            navigation: projectNavigation({
              "program.manage": user.role !== "Member",
            }),
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

    if (path === "/api/v1/auth/username" && method === "POST") {
      const body = route.request().postDataJSON() as { username?: string };
      sessionRevoked = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          requestId: "r-username",
          data: {
            username: body?.username ?? "new-username",
            sessionRevoked: true,
          },
        }),
      });
      return;
    }

    if (path === "/api/v1/auth/password" && method === "POST") {
      sessionRevoked = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          requestId: "r-password",
          data: { sessionRevoked: true },
        }),
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

async function initAuthenticatedPage(
  page: Page,
  user = MEMBER_USER,
  revoked = false
) {
  await page.addInitScript(
    ({ key, value }: { key: string; value: string }) => {
      localStorage.setItem(key, value);
    },
    { key: AUTH_HINT_KEY, value: "1" }
  );
  await page.route("**/api/v1/auth/**", stubAuthEndpoints(user, revoked));
}

test.describe("084-03: Account & Account Settings acceptance", () => {
  test("Account screen renders privacy-safe profile info and QR code", async ({
    page,
  }) => {
    await initAuthenticatedPage(page);
    await page.goto("/profile");

    // H1 and Subtitle
    await expect(page.locator("h1")).toHaveText(COPY.profile.title);
    await expect(page.getByText(COPY.profile.subtitle)).toBeVisible();

    // QR badge and display name
    await expect(page.getByText(COPY.profile.qrBadge)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: MEMBER_USER.name })
    ).toBeVisible();

    // Details summary & list items
    const details = page.locator("details");
    if ((await details.count()) > 0) {
      // expand details if needed
      await details.locator("summary").click();
    }
    await expect(page.getByText(MEMBER_USER.username)).toBeVisible();
    await expect(page.getByText(MEMBER_USER.phone)).toHaveCount(0);
    await expect(page.getByText(MEMBER_USER.role, { exact: true })).toHaveCount(
      0
    );
    const identities = page.getByRole("region", { name: "身份組" });
    await expect(identities).toContainText("會友基礎");
    await expect(identities).toContainText("全域（Global）");
    await expect(page.getByText("program.enroll", { exact: true })).toHaveCount(
      0
    );

    // Settings actions
    await expect(
      page.getByRole("link", {
        name: new RegExp(ACCOUNT_SETTINGS_COPY.sectionTitle),
      })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: COPY.logout.submit }).first()
    ).toBeVisible();
  });

  test("Account Settings link navigates to /profile/settings", async ({
    page,
  }) => {
    await initAuthenticatedPage(page);
    await page.goto("/profile");

    const settingsLink = page.getByRole("link", {
      name: new RegExp(ACCOUNT_SETTINGS_COPY.sectionTitle),
    });
    await expect(settingsLink).toBeVisible();
    await settingsLink.click();

    await page.waitForURL("**/profile/settings");
    await expect(page.locator("h1")).toHaveText(
      ACCOUNT_SETTINGS_COPY.sectionTitle
    );
    await expect(
      page.getByText(ACCOUNT_SETTINGS_COPY.sectionLead)
    ).toBeVisible();

    // Back link returns to /profile
    const backLink = page.locator('a[href="/profile"]').last();
    await expect(backLink).toBeVisible();
  });

  test("Username change validates non-empty and routes through sign-in after success", async ({
    page,
  }) => {
    await initAuthenticatedPage(page);
    await page.goto("/profile/settings");

    const usernameInput = page.locator("#new-username");
    await expect(usernameInput).toBeVisible();

    const submitUsernameBtn = page.getByRole("button", {
      name: ACCOUNT_SETTINGS_COPY.usernameSubmit,
    });
    await expect(submitUsernameBtn).toBeVisible();

    // 1. Submit empty -> client validation error
    await usernameInput.fill("");
    await submitUsernameBtn.click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: ACCOUNT_SETTINGS_COPY.missingUsername })
    ).toBeVisible();

    // 2. Submit valid username -> session is revoked and sign-in receives a flash
    await usernameInput.fill("member.updated");
    await submitUsernameBtn.click();

    await expect(page).toHaveURL(/\/$/u);
    await expect(
      page.getByRole("region", { name: COPY.login.title }).getByRole("alert")
    ).toHaveText(COPY.account.updatedNotice);
  });

  test("Password change validates ≥8 chars and mismatch, succeeds with sign-out redirect", async ({
    page,
  }) => {
    await initAuthenticatedPage(page);
    await page.goto("/profile/settings");

    const currentPasswordInput = page.locator("#current-password");
    const newPasswordInput = page.locator("#new-password");
    const confirmPasswordInput = page.locator("#confirm-password");
    const submitPasswordBtn = page.getByRole("button", {
      name: ACCOUNT_SETTINGS_COPY.passwordSubmit,
    });

    await expect(currentPasswordInput).toBeVisible();
    await expect(newPasswordInput).toBeVisible();
    await expect(confirmPasswordInput).toBeVisible();
    await expect(submitPasswordBtn).toBeVisible();

    // Helper text for 8 chars
    await expect(
      page.getByText(ACCOUNT_SETTINGS_COPY.passwordHint)
    ).toBeVisible();
    // Notice text
    await expect(
      page.getByText(ACCOUNT_SETTINGS_COPY.passwordNotice)
    ).toBeVisible();

    // 1. Validation: empty / short password
    await currentPasswordInput.fill("");
    await newPasswordInput.fill("short");
    await confirmPasswordInput.fill("short");
    await submitPasswordBtn.click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: ACCOUNT_SETTINGS_COPY.missingPasswordFields })
    ).toBeVisible();

    // 2. Validation: password mismatch
    await currentPasswordInput.fill("current-pass-123");
    await newPasswordInput.fill("new-password-123");
    await confirmPasswordInput.fill("mismatched-password-456");
    await submitPasswordBtn.click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: ACCOUNT_SETTINGS_COPY.passwordMismatch })
    ).toBeVisible();

    // 3. Success: matching ≥8 chars -> redirects to /
    await confirmPasswordInput.fill("new-password-123");
    await submitPasswordBtn.click();

    // Session revoked -> routes to login /
    await page.waitForURL("**/");
  });

  test("Offline username/password attempts show '未能更新。請重新連線後再試。'", async ({
    page,
  }) => {
    await initAuthenticatedPage(page);
    await page.goto("/profile/settings");

    // Simulate offline state in page
    await page.evaluate(() => {
      Object.defineProperty(navigator, "onLine", {
        value: false,
        configurable: true,
      });
      window.dispatchEvent(new Event("offline"));
    });

    // 1. Username offline attempt
    const usernameInput = page.locator("#new-username");
    await usernameInput.fill("member.offline");
    const submitUsernameBtn = page.getByRole("button", {
      name: ACCOUNT_SETTINGS_COPY.usernameSubmit,
    });
    await submitUsernameBtn.click();

    await expect(page.locator("#new-username-error")).toHaveText(
      ACCOUNT_SETTINGS_COPY.offlineError
    );

    // 2. Password offline attempt
    const currentPasswordInput = page.locator("#current-password");
    const newPasswordInput = page.locator("#new-password");
    const confirmPasswordInput = page.locator("#confirm-password");
    await currentPasswordInput.fill("current-pass-123");
    await newPasswordInput.fill("new-password-123");
    await confirmPasswordInput.fill("new-password-123");

    const submitPasswordBtn = page.getByRole("button", {
      name: ACCOUNT_SETTINGS_COPY.passwordSubmit,
    });
    await submitPasswordBtn.click();

    await expect(page.locator("#password-error")).toHaveText(
      ACCOUNT_SETTINGS_COPY.offlineError
    );
  });
});
