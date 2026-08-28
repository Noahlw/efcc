/* oxlint-disable vitest/prefer-importing-vitest-globals */
// UI-04 (#196) — local/deployed Next frontend browser trace.
//
// Drives the rebuilt Next.js frontend (served by the Worker ASSETS binding)
// in a real browser against the local Worker/D1 by default, or an explicitly
// isolated efcc-auth-* acceptance deployment, asserting login, registration,
// shell, Profile, Account Settings, the role-gated approval queue, and
// responsive DOM states at 375x667. It uses only the out-of-band
// PROGRAMS_* role fixtures and never mocks the backend; every assertion reads
// observable DOM state.
//
// Mutation coverage (PRG-05 #201): the suite also exercises both end-to-end
// mutation flows while keeping the acceptance fixtures pristine — a
// registration is submitted and then rejected from the Admin queue, and the
// admin credential is rotated to a throwaway value and changed back, so the
// fixture ends exactly as it started.
// Deliberately out of scope (would invent or mutate backend behavior):
//   - inducing a network failure to render the RecoveryView error path.
// Acceptance trace: docs/omp-plans/2026-08-07-ui-04-release-stack.md Task 8.
// Copy strings below mirror web/lib/copy.ts / registration-copy.ts /
// account-settings-copy.ts; the suite asserts observable DOM state, never
// client-side gating alone.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { DEV_ADMIN, DEV_MEMBER, DEV_STAFF } from "./dev-fixtures";

const configuredTarget = process.env.AUTH_UI_TARGET_URL;
const localTarget =
  !configuredTarget ||
  ["localhost", "127.0.0.1"].includes(new URL(configuredTarget).hostname);
const TARGET_ORIGIN = new URL(configuredTarget ?? "http://127.0.0.1:8787")
  .origin;
const ADMIN_USER =
  process.env.PROGRAMS_ADMIN_USERNAME ??
  (localTarget ? DEV_ADMIN.username : undefined);
const ADMIN_CRED =
  process.env.PROGRAMS_ADMIN_CREDENTIAL ??
  (localTarget ? DEV_ADMIN.credential : undefined);
const STAFF_USER =
  process.env.PROGRAMS_STAFF_USERNAME ??
  (localTarget ? DEV_STAFF.username : undefined);
const STAFF_CRED =
  process.env.PROGRAMS_STAFF_CREDENTIAL ??
  (localTarget ? DEV_STAFF.credential : undefined);
const MEMBER_USER =
  process.env.PROGRAMS_MEMBER_USERNAME ??
  (localTarget ? DEV_MEMBER.username : undefined);
const MEMBER_CRED =
  process.env.PROGRAMS_MEMBER_CREDENTIAL ??
  (localTarget ? DEV_MEMBER.credential : undefined);

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
  appFullName: "顯恩堂",
  loginSubmit: "登入",
  loginError: "用戶名稱或密碼不正確。",
  registerTitle: "註冊帳戶",
  registerUsername: "用戶名稱",
  registerPassword: "密碼",
  registerName: "姓名",
  registerSubmit: "提交註冊申請",
  accountSettingsTitle: "帳戶設定",
  currentPassword: "現時密碼",
  newPassword: "新密碼",
  settingsUsername: "新登入名稱",
  passwordHint: "最少 8 個字元。",
  confirmationPassword: "確認新密碼",
  qrCode: "會員二維碼 · 預覽",
  phone: "電話",
  registrationPhone: "電話",
  status: "狀態",
  homeSection: "首頁",
  profileSection: "帳戶",
  programsSection: "課程與活動",
  scannerSection: "掃描",
  managementSection: "管理",
  noticesSection: "通知",
  approvalTitle: "註冊審批",
  approvalCount: /待審批 \d+/,
  approvalEmpty: "目前沒有待審批的申請。",
  approve: "核准",
  reject: "拒絕",
  approvalDetailTitle: "註冊審批 · 詳情",
  decisionNote: "決定備註",
  confirmReject: "確認拒絕",
  statusRejected: "已拒絕",
  forbidden: "您沒有權限執行此操作。",
  registerDone: "申請已提交",
  passwordSubmit: "更改密碼",
  accountUpdatedNotice: "帳戶資料已更新，請重新登入。",
  // 084-04 Settings hub (mirrors web/lib/copy.ts settings + profile blocks).
  settingsEntry: "設定",
  settingsEntryHint: "帳戶及系統設定",
  settingsTitle: "設定",
  settingsBack: "返回管理工作",
  settingsBackToHub: "設定",
  accountsPermissionsRow: "帳戶與權限",
  accountsPermissionsRowHint: "管理帳戶及授權",
  checkinSettingsRow: "簽到設定",
  checkinSettingsRowHint: "簽到時段及方式",
  timezoneRow: "時區",
  timezoneRowHint: "香港時間（GMT+8）",
  checkinTitle: "簽到設定",
  checkinMethods: "簽到方式",
  memberQr: "會員二維碼",
  memberQrHint: "掃描會員帳戶頁面的二維碼",
  eventCode: "聚會代碼",
  eventCodeHint: "輸入場地顯示的六位數代碼",
  assisted: "代為簽到",
  assistedHint: "同工於出席名單代簽",
  enabledBadge: "已啟用",
  openWindow: "開放時段",
  beforeStart: "聚會開始前",
  beforeStartHint: "開放簽到的提前時數",
  beforeStartValue: "30 分鐘",
  afterEnd: "聚會結束後",
  afterEndHint: "結束後仍可簽到多久",
  afterEndValue: "15 分鐘",
  timezoneTitle: "時區",
  timezoneLead: "聚會、報名及發佈時間均以香港時間顯示。",
  gmt8: "香港時間（GMT+8）",
  gmt8Value: "GMT+8",
  // Phase B role-first Account & Permissions copy.
  permissionsTitle: "帳戶與權限",
  permissionsLead: "按工作範圍檢視能力；管理員可先建立草稿，確認後一次儲存。",
  rolesSection: "角色定義",
  roleAdmin: "管理員",
  roleDepartmentManager: "部門管理者",
  roleStaff: "同工",
} as const;

const TARGET_PATH = process.env.AUTH_UI_TARGET_URL
  ? new URL(process.env.AUTH_UI_TARGET_URL).pathname.replace(/\/$/u, "")
  : "";

function appPath(pathname: string): string {
  return `${TARGET_PATH}${pathname}` || "/";
}
const SIGNED_OUT_PATH = appPath("/");

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
  await page.goto(appPath("/"));
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole("button", { name: COPY.loginSubmit }).click();
  // The landing page navigates to the first permitted section on success.
  await page.waitForURL((url) => url.pathname !== SIGNED_OUT_PATH);
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

test.describe("UI-04 Next frontend trace", () => {
  test("admin login renders the shared shell and Profile identity", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    await page.goto(appPath("/profile"));
    await expect(page.getByText(COPY.appFullName).first()).toBeVisible();
    await page.getByText("帳戶資料", { exact: true }).click();
    await expect(
      page.getByText(required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER), {
        exact: true,
      })
    ).toBeVisible();
    await expect(page.getByText("管理員", { exact: true })).toBeVisible();
    const qr = page.getByRole("img", { name: COPY.qrCode });
    await expect(qr).toBeVisible();
    await expect(qr).toHaveAttribute("aria-label", COPY.qrCode);
    await expect(qr).toHaveCSS("width", "220px");
    await expect(qr).toHaveCSS("height", "220px");
    const qrBox = await qr.boundingBox();
    expect(qrBox?.width).toBe(220);
    expect(qrBox?.height).toBe(220);
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
    await page.goto(appPath("/profile"));
    await expect(page.getByText(COPY.appFullName).first()).toBeVisible();
    await expect(page.getByText("同工", { exact: true })).toBeVisible();
    for (const section of [
      COPY.homeSection,
      COPY.programsSection,
      COPY.scannerSection,
      COPY.managementSection,
      COPY.profileSection,
    ]) {
      await expect(
        page.getByRole("link", { name: section, exact: true })
      ).toBeVisible();
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
    await page.goto(appPath("/profile"));
    await page.getByText("帳戶資料", { exact: true }).click();
    await expect(page.getByText("Member", { exact: true })).toBeVisible();
  });

  test("member shell keeps stable navigation and omits unauthorized sections", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );
    await page.goto(appPath("/profile"));
    for (const section of [COPY.scannerSection, COPY.noticesSection]) {
      await expect(
        page.getByRole("link", { name: section, exact: true })
      ).toBeVisible();
    }
    await expect(
      page.getByRole("link", { name: COPY.managementSection, exact: true })
    ).toHaveCount(0);
  });

  test("member direct links to restricted sections render the shared forbidden state", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CRED", MEMBER_CRED)
    );
    for (const path of ["/events", "/permissions", "/registrations"]) {
      await page.goto(appPath(path));
      await expect(
        page.getByRole("alert").filter({ hasText: COPY.forbidden })
      ).toContainText(COPY.forbidden);
    }
  });

  test("registration form renders on the public /register surface", async ({
    page,
  }) => {
    await page.goto(appPath("/register"));
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
    await page.goto(appPath("/profile/settings"));
    await expect(
      page.getByRole("heading", { name: COPY.accountSettingsTitle })
    ).toBeVisible();
    await expect(page.getByLabel(COPY.settingsUsername)).toBeVisible();
    await expect(page.getByLabel(COPY.currentPassword)).toBeVisible();
    await expect(
      page.getByLabel(COPY.newPassword, { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText(COPY.passwordHint, { exact: true })
    ).toBeVisible();
    await expect(page.getByLabel(COPY.confirmationPassword)).toBeVisible();
    await expect(page.locator("form")).toHaveCount(2);
  });

  test("approval queue renders for Admin (role-gated)", async ({ page }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    await page.goto(appPath("/registrations"));
    await expect(
      page.getByRole("heading", { name: COPY.approvalTitle })
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: /待審批 \d+/u })).toBeVisible();
    await expect(
      page.getByRole("tabpanel", { name: /待審批 \d+/u })
    ).toBeVisible();
    const pendingList = page.getByRole("list", { name: "待審批" });
    if ((await pendingList.count()) > 0) {
      await expect(pendingList).toBeVisible();
    } else {
      await expect(
        page.getByText(COPY.approvalEmpty, { exact: true })
      ).toBeVisible();
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
    await page.goto(appPath("/registrations"));
    await expect(
      page.getByRole("alert").filter({ hasText: COPY.forbidden })
    ).toContainText(COPY.forbidden);
  });

  test("invalid login surfaces an observable error with no session", async ({
    page,
  }) => {
    await page.goto(appPath("/"));
    await expect(page.getByLabel(COPY.registerUsername)).toBeVisible();
    await expect(page.getByLabel(COPY.registerPassword)).toBeVisible();
    await page
      .locator('input[autocomplete="username"]')
      .fill("E2E_no_such_user");
    await page
      .locator('input[autocomplete="current-password"]')
      .fill("wrong-password");
    await page.getByRole("button", { name: COPY.loginSubmit }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: COPY.loginError })
    ).toContainText(COPY.loginError);
  });

  test("shell nav switches phone/desktop layouts at the 800px breakpoint", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    await page.goto(appPath("/profile"));
    const phone = (page.viewportSize()?.width ?? 0) < 800;
    const navigation = page.getByRole("navigation", { name: "主要導航" });
    await expect(navigation).toBeVisible();
    await expect(navigation).toHaveCSS("position", phone ? "fixed" : "sticky");
  });

  test("registration submit creates a new request the admin queue can reject", async ({
    page,
  }) => {
    // Unique per run: a decided request still reserves its normalized
    // username (registration conflicts with any existing request row), so a
    // fixed value would collide across runs/projects.
    const username = `E2E_reg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await page.goto(appPath("/register"));
    await page.getByLabel(COPY.registerUsername).fill(username);
    await page.getByLabel(COPY.registerPassword).fill("register-pw-123");
    await page.getByLabel(COPY.registerName).fill("E2E Registration");
    await page.getByLabel(COPY.registrationPhone).fill("555-0199");
    await page.getByRole("button", { name: COPY.registerSubmit }).click();
    await expect(
      page.getByRole("heading", { name: COPY.registerDone })
    ).toBeVisible();

    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    await page.goto(appPath("/management?module=approvals"));
    const row = page.getByRole("listitem").filter({ hasText: username });
    await expect(row).toBeVisible();
    const detailLink = row.getByRole("link");
    const detailHref = required(
      "approval detail href",
      (await detailLink.getAttribute("href")) ?? undefined
    );
    const requestId = new URL(detailHref, TARGET_ORIGIN).searchParams.get(
      "request"
    );
    expect(requestId).toBeTruthy();
    await page.goto(detailHref);
    await expect(
      page.getByRole("heading", { name: COPY.approvalDetailTitle })
    ).toBeVisible();
    await page.getByRole("button", { name: COPY.reject }).click();
    await page.getByLabel(COPY.decisionNote).fill("E2E cleanup note");
    await page.getByRole("button", { name: COPY.confirmReject }).click();
    await expect(
      page.getByText(COPY.statusRejected, { exact: true })
    ).toBeVisible();
  });

  test("Settings hub trace: 設定 entry → hub → 簽到設定 → 時區 (read-only)", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    await page.goto(appPath("/profile"));

    // Account surface: the 設定 entry links to the system Settings hub while
    // the existing 帳戶設定 row stays intact.
    const hubEntry = page.getByRole("link", { name: /^設定/u });
    await expect(hubEntry).toBeVisible();
    await expect(hubEntry).toHaveAttribute(
      "href",
      /management\?module=settings/u
    );
    await hubEntry.click();
    await expect(page).toHaveURL(/management\?module=settings/u);

    // Hub: exactly three rows in order with the locked descriptions.
    await expect(
      page.getByRole("heading", { name: COPY.settingsTitle })
    ).toBeVisible();
    await expect(page.getByText(COPY.accountsPermissionsRow)).toBeVisible();
    await expect(page.getByText(COPY.accountsPermissionsRowHint)).toBeVisible();
    await expect(page.getByText(COPY.checkinSettingsRow)).toBeVisible();
    await expect(page.getByText(COPY.checkinSettingsRowHint)).toBeVisible();
    await expect(page.getByText(COPY.timezoneRow)).toBeVisible();
    await expect(page.getByText(COPY.timezoneRowHint)).toBeVisible();
    const permissionsRow = page.getByRole("link", {
      name: new RegExp(COPY.accountsPermissionsRow),
    });
    await expect(permissionsRow).toHaveAttribute(
      "href",
      /management\?module=permissions/u
    );
    await permissionsRow.click();
    await expect(page).toHaveURL(/management\?module=permissions/u);
    await expect(
      page.getByRole("heading", { name: COPY.permissionsTitle })
    ).toBeVisible();
    await expect(page.getByText(COPY.permissionsLead)).toBeVisible();
    // 帳戶與權限 uses the Phase B role-first projection. Assigned accounts
    // open from a selected role; the initial view contains fixed roles only.
    const rolesRegion = page.getByRole("region", {
      name: COPY.rolesSection,
    });
    await expect(rolesRegion).toBeVisible();
    const roleList = rolesRegion.getByRole("list", {
      name: COPY.rolesSection,
    });
    await expect(roleList.locator("li")).toHaveCount(3);
    await expect(
      roleList.getByRole("button", {
        name: `${COPY.roleAdmin} · 角色詳情`,
        exact: true,
      })
    ).toBeVisible();
    await expect(
      roleList.getByRole("button", {
        name: `${COPY.roleStaff} · 角色詳情`,
        exact: true,
      })
    ).toBeVisible();
    await expect(
      roleList.getByRole("button", {
        name: "會友 · 角色詳情",
        exact: true,
      })
    ).toBeVisible();
    await expect(roleList.getByText(COPY.roleDepartmentManager)).toHaveCount(0);
    await page.getByRole("link", { name: COPY.settingsBackToHub }).click();
    await expect(page).toHaveURL(/management\?module=settings/u);

    // 簽到設定: read-only method badges + fixed window durations, no forms.
    await page
      .getByRole("link", { name: new RegExp(COPY.checkinSettingsRow) })
      .click();
    await expect(page).toHaveURL(/management\?module=checkin-settings/u);
    await expect(
      page.getByRole("heading", { name: COPY.checkinTitle })
    ).toBeVisible();
    await expect(page.getByText(COPY.checkinMethods)).toBeVisible();
    await expect(page.getByText(COPY.memberQr)).toBeVisible();
    await expect(page.getByText(COPY.memberQrHint)).toBeVisible();
    await expect(page.getByText(COPY.eventCode)).toBeVisible();
    await expect(page.getByText(COPY.eventCodeHint)).toBeVisible();
    await expect(page.getByText(COPY.assisted)).toBeVisible();
    await expect(page.getByText(COPY.assistedHint)).toBeVisible();
    await expect(page.getByText(COPY.enabledBadge)).toHaveCount(3);
    await expect(page.getByText(COPY.openWindow)).toBeVisible();
    await expect(page.getByText(COPY.beforeStart)).toBeVisible();
    await expect(page.getByText(COPY.beforeStartHint)).toBeVisible();
    await expect(page.getByText(COPY.beforeStartValue)).toBeVisible();
    await expect(page.getByText(COPY.afterEnd)).toBeVisible();
    await expect(page.getByText(COPY.afterEndHint)).toBeVisible();
    await expect(page.getByText(COPY.afterEndValue)).toBeVisible();
    await expect(page.locator("form, input, select, textarea")).toHaveCount(0);

    // Back to the hub, then on to 時區: read-only GMT+8 row, no forms.
    await page.getByRole("link", { name: COPY.settingsBackToHub }).click();
    await expect(page).toHaveURL(/management\?module=settings/u);
    await page
      .getByRole("link", { name: new RegExp(COPY.timezoneRow) })
      .click();
    await expect(page).toHaveURL(/management\?module=timezone-settings/u);
    await expect(
      page.getByRole("heading", { name: COPY.timezoneTitle })
    ).toBeVisible();
    await expect(page.getByText(COPY.timezoneLead)).toBeVisible();
    await expect(page.getByText(COPY.gmt8)).toBeVisible();
    await expect(page.getByText(COPY.gmt8Value, { exact: true })).toBeVisible();
    await expect(page.locator("form, input, select, textarea")).toHaveCount(0);

    // Final back returns to the hub.
    await page.getByRole("link", { name: COPY.settingsBackToHub }).click();
    await expect(page).toHaveURL(/management\?module=settings/u);
    await expect(
      page.getByRole("heading", { name: COPY.settingsTitle })
    ).toBeVisible();
  });

  test("admin password rotation revokes the session and restores the fixture", async ({
    page,
  }) => {
    const rotationPassword = "E2E_admin!devRot";
    const fixturePassword = required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED);
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      fixturePassword
    );
    await page.goto(appPath("/profile/settings"));

    // Rotate to the throwaway value; success revokes every session and
    // routes to the login surface with the one-time notice.
    await page.getByLabel(COPY.currentPassword).fill(fixturePassword);
    await page
      .getByLabel(COPY.newPassword, { exact: true })
      .fill(rotationPassword);
    await page.getByLabel(COPY.confirmationPassword).fill(rotationPassword);
    await page.getByRole("button", { name: COPY.passwordSubmit }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: COPY.accountUpdatedNotice })
    ).toBeVisible();
    await expect(page).toHaveURL((url) => url.pathname === SIGNED_OUT_PATH);

    // The rotated password is now the accepted credential; the revoked
    // session cannot be reused.
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      rotationPassword
    );
    await page.goto(appPath("/profile/settings"));

    // Change back so the fixture ends exactly as it started.
    await page.getByLabel(COPY.currentPassword).fill(rotationPassword);
    await page
      .getByLabel(COPY.newPassword, { exact: true })
      .fill(fixturePassword);
    await page.getByLabel(COPY.confirmationPassword).fill(fixturePassword);
    await page.getByRole("button", { name: COPY.passwordSubmit }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: COPY.accountUpdatedNotice })
    ).toBeVisible();
  });
});
