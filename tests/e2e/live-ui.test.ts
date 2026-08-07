/* oxlint-disable vitest/prefer-importing-vitest-globals */
// UI-04 (#196) — deployed Next frontend browser trace.
//
// Drives the rebuilt Next.js frontend (served by the Worker ASSETS binding)
// in a real browser against the isolated efcc-auth-* acceptance deployment,
// asserting login, registration, shell, Profile, Account Settings, the
// role-gated approval queue, and responsive DOM states at 375x667. It uses
// only the out-of-band PROGRAMS_* role fixtures and never mocks the backend;
// every assertion reads observable DOM state.
//
// Deliberately out of scope (would invent or mutate backend behavior):
//   - submitting the registration form / deciding real registrations
//     (creates or mutates target rows),
//   - inducing a network failure to render the RecoveryView error path.
// Acceptance trace: docs/omp-plans/2026-08-07-ui-04-release-stack.md Task 8.
// Copy strings below mirror web/lib/copy.ts / registration-copy.ts /
// account-settings-copy.ts; the suite asserts observable DOM state, never
// client-side gating alone.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const ADMIN_USER = process.env.PROGRAMS_ADMIN_USERNAME;
const ADMIN_CRED = process.env.PROGRAMS_ADMIN_CREDENTIAL;
const STAFF_USER = process.env.PROGRAMS_STAFF_USERNAME;
const STAFF_CRED = process.env.PROGRAMS_STAFF_CREDENTIAL;
const MEMBER_USER = process.env.PROGRAMS_MEMBER_USERNAME;
const MEMBER_CRED = process.env.PROGRAMS_MEMBER_CREDENTIAL;

const ROLE_FIXTURES = [
  {
    usernameName: "PROGRAMS_ADMIN_USERNAME",
    username: ADMIN_USER,
    credentialName: "PROGRAMS_ADMIN_CREDENTIAL",
    credential: ADMIN_CRED,
  },
  {
    usernameName: "PROGRAMS_STAFF_USERNAME",
    username: STAFF_USER,
    credentialName: "PROGRAMS_STAFF_CREDENTIAL",
    credential: STAFF_CRED,
  },
  {
    usernameName: "PROGRAMS_MEMBER_USERNAME",
    username: MEMBER_USER,
    credentialName: "PROGRAMS_MEMBER_CREDENTIAL",
    credential: MEMBER_CRED,
  },
] as const;

const COPY = {
  appFullName: "中國基督教播道會顯恩堂",
  loginSubmit: "登入",
  loginError: "用戶名稱或密碼不正確。",
  registerTitle: "註冊帳戶",
  registerUsername: "用戶名稱",
  registerPassword: "密碼",
  registerName: "姓名",
  registerSubmit: "提交註冊申請",
  accountSettingsTitle: "帳戶資料",
  currentPassword: "目前密碼",
  newPassword: "新密碼",
  settingsUsername: "新用戶名稱",
  passwordHint: "密碼須至少 8 個字元。",
  confirmationPassword: "確認密碼",
  qrCode: "QR Code",
  phone: "電話",
  registrationPhone: "電話（選填）",
  status: "狀態",
  profileSection: "個人檔案",
  programsSection: "課程與活動",
  eventsSection: "聚會管理",
  scannerSection: "掃描簽到",
  careSection: "關懷儀表板",
  permissionsSection: "權限管理",
  approvalTitle: "註冊審批",
  approvalCount: /\d+ 筆待審核/,
  approvalEmpty: "目前沒有待審批的申請。",
  approve: "批准",
  reject: "拒絕",
  forbidden: "您沒有權限執行此操作。",
} as const;

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function loginAs(
  page: Page,
  username: string,
  password: string
): Promise<void> {
  await page.goto("/");
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole("button", { name: COPY.loginSubmit }).click();
  // The landing page navigates to the first permitted section on success.
  await page.waitForURL((url) => url.pathname !== "/");
}

test.beforeAll(() => {
  const usernames = new Set<string>();
  const credentials = new Set<string>();
  for (const fixture of ROLE_FIXTURES) {
    if (!fixture.username) {
      throw new Error(`${fixture.usernameName} is required`);
    }
    if (!fixture.credential) {
      throw new Error(`${fixture.credentialName} is required`);
    }
    if (!/^E2E_[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(fixture.username)) {
      throw new Error(
        `${fixture.usernameName} must be a distinct disposable E2E_* username`
      );
    }
    if (fixture.credential.trim().length < 8) {
      throw new Error(
        `${fixture.credentialName} must contain at least 8 non-whitespace characters`
      );
    }
    const normalizedUsername = fixture.username.toLowerCase();
    if (usernames.has(normalizedUsername)) {
      throw new Error("PROGRAMS_*_USERNAME values must be distinct");
    }
    usernames.add(normalizedUsername);
    if (credentials.has(fixture.credential)) {
      throw new Error("PROGRAMS_*_CREDENTIAL values must be distinct");
    }
    credentials.add(fixture.credential);
  }
  // Each claimed canonical role is verified by its corresponding login test.
});

test.describe("UI-04 deployed Next frontend trace", () => {
  test("admin login renders the shared shell and Profile identity", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    await page.goto("/profile");
    await expect(page.getByText(COPY.appFullName).first()).toBeVisible();
    await expect(
      page.getByText(required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER), {
        exact: true,
      })
    ).toBeVisible();
    await expect(page.getByText("Admin", { exact: true })).toBeVisible();
    const qr = page.getByRole("img", { name: COPY.qrCode });
    await expect(qr).toBeVisible();
    await expect(qr).toHaveAttribute("aria-label", COPY.qrCode);
    await expect(qr).toHaveCSS("width", "220px");
    await expect(qr).toHaveCSS("height", "220px");
    await expect(page.getByText(COPY.phone, { exact: true })).toBeVisible();
    await expect(page.getByText(COPY.status, { exact: true })).toBeVisible();
  });

  test("staff login renders the shell and Profile identity", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_STAFF_USERNAME", STAFF_USER),
      required("PROGRAMS_STAFF_CREDENTIAL", STAFF_CRED)
    );
    await page.goto("/profile");
    await expect(page.getByText(COPY.appFullName).first()).toBeVisible();
    await expect(page.getByText("Staff", { exact: true })).toBeVisible();
    for (const section of [
      COPY.profileSection,
      COPY.programsSection,
      COPY.eventsSection,
      COPY.scannerSection,
      COPY.careSection,
      COPY.permissionsSection,
    ]) {
      await expect(page.getByRole("link", { name: section })).toBeVisible();
    }
  });

  test("member login renders the shell and Profile identity", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );
    await page.goto("/profile");
    await expect(page.getByText(COPY.appFullName).first()).toBeVisible();
    await expect(page.getByText("Member", { exact: true })).toBeVisible();
  });

  test("member shell omits unauthorized sections (role-gated nav)", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );
    await page.goto("/profile");
    for (const section of [
      COPY.eventsSection,
      COPY.scannerSection,
      COPY.careSection,
      COPY.permissionsSection,
    ]) {
      await expect(page.getByRole("link", { name: section })).toHaveCount(0);
    }
  });

  test("member direct links render the shared forbidden state", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );
    for (const path of [
      "/events",
      "/scanner",
      "/care",
      "/permissions",
      "/registrations",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("alert")).toContainText(COPY.forbidden);
    }
  });

  test("registration form renders on the public /register surface", async ({
    page,
  }) => {
    await page.goto("/register");
    await expect(
      page.getByRole("heading", { name: COPY.registerTitle })
    ).toBeVisible();
    await expect(page.getByLabel(COPY.registerUsername)).toBeVisible();
    await expect(page.getByLabel(COPY.registerPassword)).toBeVisible();
    await expect(page.getByLabel(COPY.registerName)).toBeVisible();
    await expect(page.getByLabel(COPY.registrationPhone)).toBeVisible();
    await expect(
      page.getByRole("button", { name: COPY.registerSubmit })
    ).toBeVisible();
  });

  test("Account Settings surface renders credential-change fields", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    await page.goto("/profile/settings");
    await expect(
      page.getByRole("heading", { name: COPY.accountSettingsTitle })
    ).toBeVisible();
    await expect(page.getByLabel(COPY.settingsUsername)).toBeVisible();
    await expect(page.getByLabel(COPY.currentPassword)).toBeVisible();
    await expect(page.getByLabel(COPY.newPassword)).toBeVisible();
    await expect(page.getByText(COPY.passwordHint, { exact: true })).toBeVisible();
    await expect(page.getByLabel(COPY.confirmationPassword)).toHaveCount(0);
    await expect(page.locator("form")).toHaveCount(2);
  });

  test("approval queue renders for Admin (role-gated)", async ({ page }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    await page.goto("/registrations");
    await expect(
      page.getByRole("heading", { name: COPY.approvalTitle })
    ).toBeVisible();
    await expect(page.getByText(COPY.approvalCount)).toBeVisible();
    const approveButtons = page.getByRole("button", { name: COPY.approve });
    const rejectButtons = page.getByRole("button", { name: COPY.reject });
    if ((await approveButtons.count()) > 0) {
      await expect(rejectButtons).toHaveCount(await approveButtons.count());
    } else {
      await expect(page.getByText(COPY.approvalEmpty)).toBeVisible();
    }
  });

  test("approval queue is forbidden for Member (role-gated)", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );
    await page.goto("/registrations");
    await expect(page.getByRole("alert")).toContainText(COPY.forbidden);
  });

  test("invalid login surfaces an observable error with no session", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByLabel(COPY.registerUsername)).toBeVisible();
    await expect(page.getByLabel(COPY.registerPassword)).toBeVisible();
    await page
      .locator('input[autocomplete="username"]')
      .fill("E2E_no_such_user");
    await page
      .locator('input[autocomplete="current-password"]')
      .fill("wrong-password");
    await page.getByRole("button", { name: COPY.loginSubmit }).click();
    await expect(page.getByRole("alert")).toContainText(COPY.loginError);
  });

  test("shell nav switches phone/desktop layouts at the 800px breakpoint", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    await page.goto("/profile");
    const { width } = page.viewportSize() ?? { width: 0 };
    const phone = width < 800;
    const phoneNav = page.locator(".nav-phone").first();
    const desktopNav = page.locator(".nav-desktop").first();
    if (phone) {
      await expect(phoneNav).toBeVisible();
      await expect(desktopNav).toBeHidden();
    } else {
      await expect(desktopNav).toBeVisible();
      await expect(phoneNav).toBeHidden();
    }
  });
});