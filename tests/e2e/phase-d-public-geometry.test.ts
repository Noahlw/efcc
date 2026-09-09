/* oxlint-disable vitest/prefer-importing-vitest-globals */
/**
 * D-488-05 — public/auth/account numeric geometry and observable recovery.
 * The suite intentionally asserts DOM behavior and CSS-pixel measurements only.
 */
import { expect, test } from "@playwright/test";
import type { Page, Route, TestInfo } from "@playwright/test";

import { projectSections, projectNavigation } from "../../web/lib/sections";
import { attachNumericEvidence } from "./numeric-evidence";

const AUTH_HINT_KEY = "efcc_auth_active";
const TARGET_PATH = process.env.AUTH_UI_TARGET_URL
  ? new URL(process.env.AUTH_UI_TARGET_URL).pathname.replace(/\/$/u, "")
  : "";

const PROFILE = {
  userId: "E2E_geometry_member",
  name: "幾何測試會友",
  username: "E2E_geometry_member",
  phone: "91234567",
  status: "Active",
  qrCodeString: "qr:E2E_geometry_member",
  identities: [
    {
      label: "青年部門協調員",
      scopeKind: "Department" as const,
      scopeLabel: "青年部",
    },
  ],
  capabilities: { "program.enroll": true, "role.manage": false },
};
type GeometryProfile = Omit<typeof PROFILE, "identities" | "capabilities"> & {
  identities: {
    label: string;
    scopeKind: "Global" | "Department" | "Program";
    scopeLabel: string | null;
  }[];
  capabilities: Record<string, boolean>;
};
const MANAGEMENT_PROFILE: GeometryProfile = {
  ...PROFILE,
  capabilities: {
    ...PROFILE.capabilities,
    "role.read": true,
  },
};

function appPath(pathname: string): string {
  return `${TARGET_PATH}${pathname}` || "/";
}

async function stubAuthenticatedSession(
  page: Page,
  profile: GeometryProfile = PROFILE
): Promise<void> {
  await page.addInitScript((key) => {
    localStorage.setItem(key, "1");
  }, AUTH_HINT_KEY);
  await page.route("**/api/v1/auth/refresh", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ requestId: "geometry-refresh", data: {} }),
    })
  );
  await page.route("**/api/v1/auth/me", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        requestId: "geometry-me",
        data: {
          user: profile,
          sections: projectSections(profile.capabilities),
          navigation: projectNavigation(profile.capabilities),
        },
      }),
    })
  );
}
async function stubLoginError(page: Page): Promise<void> {
  await page.route("**/api/v1/auth/login", (route: Route) =>
    route.fulfill({
      status: 401,
      contentType: "application/problem+json",
      body: JSON.stringify({
        status: 401,
        code: "AUTH_REQUIRED",
        title: "Unauthorized",
        detail: "用戶名稱或密碼不正確。",
        requestId: "geometry-login-error",
      }),
    })
  );
}

async function stubRecoverableRestore(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    localStorage.setItem(key, "1");
  }, AUTH_HINT_KEY);
  await page.route("**/api/v1/auth/me", (route: Route) =>
    route.fulfill({
      status: 503,
      contentType: "application/problem+json",
      body: JSON.stringify({
        status: 503,
        code: "UNAVAILABLE",
        title: "Unavailable",
        detail: "temporary",
        requestId: "geometry-restore-error",
      }),
    })
  );
}

async function stubRegistrationSuccess(page: Page): Promise<void> {
  await page.route("**/api/v1/auth/register", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        requestId: "geometry-register",
        data: { status: "pending" },
      }),
    })
  );
}

async function stubUsernameUnavailable(page: Page): Promise<void> {
  await page.route("**/api/v1/auth/username", (route: Route) =>
    route.fulfill({
      status: 503,
      contentType: "application/problem+json",
      body: JSON.stringify({
        status: 503,
        code: "UNAVAILABLE",
        title: "Unavailable",
        detail: "temporary",
        requestId: "geometry-username-error",
      }),
    })
  );
}

async function assertContained(
  page: Page,
  requireShell = false,
  testInfo?: TestInfo
): Promise<void> {
  const viewport = await page.evaluate(() => {
    const navigation = document.querySelector<HTMLElement>("#main-navigation");
    const content = document.querySelector<HTMLElement>("#shell-content");
    const active = document.activeElement;
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      shell:
        navigation && content
          ? {
              navigationPosition: getComputedStyle(navigation).position,
              navigationTop: navigation.getBoundingClientRect().top,
              navigationBottom: navigation.getBoundingClientRect().bottom,
              contentClientWidth: content.clientWidth,
              contentScrollWidth: content.scrollWidth,
              contentPaddingBottom: Number.parseFloat(
                getComputedStyle(content).paddingBottom
              ),
              focusedInNavigation: active ? navigation.contains(active) : false,
            }
          : null,
    };
  });
  const undersized = await page
    .locator("a, button, input, select, textarea")
    .evaluateAll((elements) =>
      elements
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            role: element.tagName.toLowerCase(),
            width: rect.width,
            height: rect.height,
            text: element.textContent?.trim() ?? "",
          };
        })
        .filter(({ width, height }) => width > 0 && (width < 44 || height < 44))
    );
  if (testInfo) {
    await attachNumericEvidence(testInfo, "public-contained-viewport", {
      undersized,
      viewport,
    });
  }
  expect(viewport.documentWidth).toBeLessThanOrEqual(viewport.innerWidth);
  expect(viewport.bodyWidth).toBeLessThanOrEqual(viewport.innerWidth);
  if (requireShell) {
    expect(viewport.shell).not.toBeNull();
  }
  if (viewport.shell) {
    expect(viewport.shell.contentScrollWidth).toBeLessThanOrEqual(
      viewport.shell.contentClientWidth + 1
    );
    if (viewport.innerWidth < 800) {
      expect(viewport.shell.navigationPosition).toBe("fixed");
      expect(viewport.shell.navigationTop).toBeGreaterThanOrEqual(0);
      expect(viewport.shell.navigationBottom).toBeGreaterThanOrEqual(
        viewport.innerHeight - 16
      );
      expect(viewport.shell.navigationBottom).toBeLessThanOrEqual(
        viewport.innerHeight + 1
      );
      expect(viewport.shell.contentPaddingBottom).toBeGreaterThanOrEqual(84);
    } else {
      expect(viewport.shell.navigationPosition).toBe("sticky");
    }
  }
  expect(undersized).toEqual([]);
}

async function assertFocusedControlVisible(
  page: Page,
  expectedSelector?: string,
  testInfo?: TestInfo
): Promise<void> {
  const result = await page.evaluate((selector) => {
    const active = document.activeElement;
    if (
      !(active instanceof HTMLElement) ||
      active === document.body ||
      active === document.documentElement
    ) {
      return null;
    }
    const navigation = document.querySelector<HTMLElement>("#main-navigation");
    const rect = active.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      navigationTop: navigation?.getBoundingClientRect().top ?? null,
      focusedInNavigation: navigation?.contains(active) ?? false,
      matches: selector === undefined ? true : active.matches(selector),
    };
  }, expectedSelector);
  if (testInfo && result) {
    await attachNumericEvidence(testInfo, "public-focused-control", result);
  }
  expect(result).not.toBeNull();
  expect(result?.bottom).toBeLessThanOrEqual(result?.viewportHeight ?? 0);
  expect(result?.top).toBeGreaterThanOrEqual(0);
  expect(result?.left).toBeGreaterThanOrEqual(0);
  expect(result?.right).toBeLessThanOrEqual(result?.viewportWidth ?? 0);
  if (
    result &&
    result.viewportWidth < 800 &&
    result.navigationTop !== null &&
    !result.focusedInNavigation
  ) {
    expect(result.bottom).toBeLessThanOrEqual(result.navigationTop + 1);
  }
  if (expectedSelector !== undefined) {
    expect(result?.matches, `expected focus: ${expectedSelector}`).toBe(true);
  }
}

test("public login keeps one heading, recovery focus, and target sizes", async ({
  page,
}, testInfo: TestInfo) => {
  await page.goto(appPath("/"));
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "登入" })).toBeVisible();
  await page.getByRole("button", { name: "登入" }).click();
  const username = page.getByLabel("用戶名稱");
  await expect(username).toBeFocused();
  await expect(username).toHaveAttribute("aria-invalid", "true");
  await expect(username).toHaveAttribute("aria-describedby", "login-error");
  await assertFocusedControlVisible(page, "#login-username", testInfo);
  await assertContained(page, false, testInfo);
});
test("login error keeps a focused critical error anchor", async ({
  page,
}, testInfo: TestInfo) => {
  await stubLoginError(page);
  await page.goto(appPath("/"));
  await page.getByLabel("用戶名稱").fill("E2E_geometry_missing");
  await page.getByLabel("密碼").fill("wrong-password");
  await page.getByRole("button", { name: "登入" }).click();
  await expect(
    page.getByRole("alert", { name: "用戶名稱或密碼不正確。" })
  ).toBeVisible();
  await expect(page.locator("#login-error").locator("xpath=..")).toBeFocused();
  await assertFocusedControlVisible(
    page,
    '[tabindex="-1"]:has(#login-error)',
    testInfo
  );
  await assertContained(page, false, testInfo);
});
test("recoverable auth restore exposes retry and safe-home anchors", async ({
  page,
}, testInfo: TestInfo) => {
  await stubRecoverableRestore(page);
  await page.goto(appPath("/"));
  await expect(
    page.getByRole("alert", { name: "系統暫時無法使用，請稍後再試。" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "重試連接" })).toBeVisible();
  await expect(page.getByRole("link", { name: "返回首頁" })).toHaveAttribute(
    "href",
    "/"
  );
  await assertFocusedControlVisible(page, 'main[tabindex="-1"]', testInfo);
  await assertContained(page, false, testInfo);
});
test("legacy upgrade gate preserves focused validation and bounded controls", async ({
  page,
}, testInfo: TestInfo) => {
  await page.route("**/api/v1/auth/login", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        requestId: "geometry-upgrade-login",
        data: {
          userId: "E2E_geometry_legacy",
          name: "幾何測試舊帳戶",
          status: "Active",
          mustSetNewCredential: true,
        },
      }),
    })
  );
  await page.goto(appPath("/"));
  await page.getByLabel("用戶名稱").fill("E2E_geometry_legacy");
  await page.getByLabel("密碼").fill("1234");
  await page.getByRole("button", { name: "登入" }).click();
  await expect(page.getByRole("heading", { name: "設定新密碼" })).toBeVisible();
  const upgradeSubmit = page.getByRole("button", {
    name: "設定新密碼並登入",
  });
  await page.locator("#legacy-pin").fill("");
  await upgradeSubmit.click();
  await expect(page.locator("#legacy-pin")).toBeFocused();
  await assertFocusedControlVisible(page, "#legacy-pin", testInfo);
  await assertContained(page, false, testInfo);
  await page.locator("#legacy-pin").fill("1234");
  await page.locator("#new-credential").fill("short");
  await expect(page.locator("#new-credential")).toBeFocused();
  await assertContained(page, false, testInfo);
});

test("session expiry keeps the re-login recovery surface contained", async ({
  page,
}, testInfo: TestInfo) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("efcc_session_expired", "1");
  });
  await page.goto(appPath("/"));
  await expect(
    page.getByRole("heading", { name: "工作階段已過期" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "重新登入" })).toBeVisible();
  await assertFocusedControlVisible(page, "#session-expired-title", testInfo);
  await assertContained(page, false, testInfo);
});

test("duplicate registration keeps the username draft and field recovery", async ({
  page,
}, testInfo: TestInfo) => {
  await page.route("**/api/v1/auth/register", (route: Route) =>
    route.fulfill({
      status: 409,
      contentType: "application/problem+json",
      body: JSON.stringify({
        status: 409,
        code: "CONFLICT",
        title: "Conflict",
        detail: "duplicate",
        requestId: "geometry-registration-conflict",
      }),
    })
  );
  await page.goto(appPath("/register"));
  const username = page.getByLabel("用戶名稱");
  await username.fill("E2E_geometry_duplicate");
  await page.getByLabel("密碼").fill("geometry-password");
  await page.getByLabel("姓名").fill("幾何測試");
  await page.getByLabel("電話").fill("91234567");
  await page.getByRole("button", { name: "提交註冊申請" }).click();
  await expect(page.locator("#registration-error")).toBeVisible();
  await expect(username).toHaveAttribute("aria-invalid", "true");
  await expect(username).toBeFocused();
  await expect(username).toHaveValue("E2E_geometry_duplicate");
  await assertFocusedControlVisible(page, "#reg-username", testInfo);
  await assertContained(page, false, testInfo);
});

test("registration keeps one heading, field recovery, and target sizes", async ({
  page,
}, testInfo: TestInfo) => {
  await page.goto(appPath("/register"));
  await expect(page.locator("h1")).toHaveCount(1);
  await page.getByRole("button", { name: "提交註冊申請" }).click();
  const username = page.getByLabel("用戶名稱");
  await expect(username).toBeFocused();
  await expect(username).toHaveAttribute("aria-invalid", "true");
  await expect(username).toHaveAttribute(
    "aria-describedby",
    "registration-error"
  );
  await assertFocusedControlVisible(page, undefined, testInfo);
  await assertContained(page, false, testInfo);
});
test("registration done state keeps final destination anchors contained", async ({
  page,
}, testInfo: TestInfo) => {
  await stubRegistrationSuccess(page);
  await page.goto(appPath("/register"));
  await page.getByLabel("用戶名稱").fill("E2E_geometry_register");
  await page.getByLabel("密碼").fill("geometry-password");
  await page.getByLabel("姓名").fill("幾何測試");
  await page.getByLabel("電話").fill("91234567");
  await page.getByRole("button", { name: "提交註冊申請" }).click();
  await expect(page.getByRole("heading", { name: "申請已提交" })).toBeVisible();
  await expect(page.getByRole("link", { name: "返回登入" })).toHaveAttribute(
    "href",
    "/"
  );
  await expect(page.getByRole("link", { name: "訪客簽到" })).toHaveAttribute(
    "href",
    "/guest-check-in"
  );
  await assertContained(page, false, testInfo);
});

test("Profile renders privacy-safe identity summaries at every W7 width", async ({
  page,
}, testInfo: TestInfo) => {
  await stubAuthenticatedSession(page);
  await page.goto(appPath("/profile"));
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByRole("region", { name: "身份組" })).toContainText(
    "青年部門協調員"
  );
  await expect(page.getByRole("region", { name: "身份組" })).toContainText(
    "部門（Department） · 青年部"
  );
  await expect(page.getByText(PROFILE.phone, { exact: true })).toHaveCount(0);
  await expect(page.getByText("program.enroll", { exact: true })).toHaveCount(
    0
  );
  await assertContained(page, true, testInfo);
});
test("Profile keeps no-QR and zero-identity states private and contained", async ({
  page,
}, testInfo: TestInfo) => {
  await stubAuthenticatedSession(page, {
    ...PROFILE,
    qrCodeString: "",
    identities: [],
  });
  await page.goto(appPath("/profile?from=scanner"));
  await expect(
    page.getByRole("img", { name: "會員二維碼 · 預覽" })
  ).toHaveCount(0);
  await expect(
    page.getByText("目前沒有 QR 資料。", { exact: true })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "返回掃描" })).toHaveAttribute(
    "href",
    "/scanner"
  );
  await assertContained(page, true, testInfo);
});

test("Profile wraps multiple long identity labels without leakage", async ({
  page,
}, testInfo: TestInfo) => {
  const longLabel = "身份組".repeat(80);
  await stubAuthenticatedSession(page, {
    ...PROFILE,
    qrCodeString: "",
    identities: [
      {
        label: longLabel,
        scopeKind: "Department",
        scopeLabel: "部門".repeat(40),
      },
      {
        label: `${longLabel}-二`,
        scopeKind: "Program",
        scopeLabel: "課程".repeat(40),
      },
    ],
  });
  await page.goto(appPath("/profile"));
  const identities = page.getByRole("region", { name: "身份組" });
  await expect(identities).toContainText(longLabel);
  await expect(identities).toContainText("Department");
  await expect(identities).toContainText("Program");
  await expect(page.getByText(PROFILE.phone, { exact: true })).toHaveCount(0);
  await assertContained(page, true, testInfo);
});

test("Account Settings canonical ready state keeps anchors reachable at W7 widths", async ({
  page,
}, testInfo: TestInfo) => {
  await stubAuthenticatedSession(page);
  await page.goto(appPath("/profile/settings"));
  await expect(page.getByRole("heading", { name: "帳戶設定" })).toBeVisible();
  await expect(
    page.locator("#shell-content").getByRole("link", { name: "帳戶" })
  ).toHaveAttribute("href", "/profile");
  await expect(page.locator("form")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "儲存登入名稱" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "更改密碼" })).toBeVisible();
  await assertContained(page, true, testInfo);
});
test("Account Settings unavailable state preserves draft and focuses retry", async ({
  page,
}, testInfo: TestInfo) => {
  test.skip(
    !["w-320", "w-799", "w-800"].includes(testInfo.project.name),
    "Material account settings error states are pinned at 320/799/800."
  );
  await stubAuthenticatedSession(page);
  await stubUsernameUnavailable(page);
  await page.goto(appPath("/profile/settings"));
  const username = page.getByLabel("新登入名稱");
  await username.fill("E2E_geometry_unavailable");
  await page.getByRole("button", { name: "儲存登入名稱" }).click();
  await expect(
    page.getByRole("alert", { name: "系統暫時無法使用，請稍後再試。" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "重試連接" })).toBeFocused();
  await expect(username).toHaveValue("E2E_geometry_unavailable");
  await assertFocusedControlVisible(page, undefined, testInfo);
  await assertContained(page, true, testInfo);
});
test("registrations and management settings keep canonical destinations contained", async ({
  page,
}, testInfo: TestInfo) => {
  await stubAuthenticatedSession(page, MANAGEMENT_PROFILE);
  await page.goto(
    appPath("/registrations?return=https%3A%2F%2Fattacker.example")
  );
  await expect(page).toHaveURL(/\/management\?module=approvals$/u);
  await page.goto(appPath("/registrations?return=%2Fprograms"));
  await expect(page).toHaveURL(/\/programs$/u);
  await page.goto(appPath("/management?module=settings"));
  await expect(
    page.getByRole("heading", { name: "設定", exact: true })
  ).toBeVisible();
  await assertContained(page, true, testInfo);
  const checkinLink = page.getByRole("link", { name: /簽到設定/u });
  await expect(checkinLink).toHaveAttribute(
    "href",
    "/management?module=checkin-settings"
  );
  await checkinLink.click();
  await expect(
    page.getByRole("heading", { name: "簽到設定", exact: true })
  ).toBeVisible();
  await assertContained(page, true, testInfo);
  await page.getByRole("link", { name: "設定", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "設定", exact: true })
  ).toBeVisible();

  const timezoneLink = page.getByRole("link", { name: /時區/u });
  await expect(timezoneLink).toHaveAttribute(
    "href",
    "/management?module=timezone-settings"
  );
  await timezoneLink.click();
  await expect(
    page.getByRole("heading", { name: "時區", exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("香港時間（GMT+8）", { exact: true })
  ).toBeVisible();
  await assertContained(page, true, testInfo);
});
