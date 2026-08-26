/* oxlint-disable vitest/prefer-importing-vitest-globals -- this is a Playwright suite. */
/**
 * S4-12 / issue #467 — authenticated local-D1 evidence gate.
 *
 * The suite consumes the real Worker/D1 runtime through PROGRAMS_TARGET_URL.
 * It intentionally creates only disposable, uniquely prefixed E2E records;
 * the local seed/reset lifecycle owns cleanup. The role-first and persistent
 * approval assertions encode the frozen H-14–H-35 contract and should surface
 * an incomplete lower stack branch rather than silently weakening coverage.
 */
import path from "node:path";

import { expect, test } from "@playwright/test";
import type { Locator, Page, TestInfo } from "@playwright/test";

import { DEV_ADMIN } from "./dev-fixtures";

const LOGIN = "登入";
const HUB_TITLE = "管理工作";
const ACCOUNTS_TITLE = "帳戶名錄";
const PERMISSIONS_TITLE = "帳戶與權限";
const APPROVALS_TITLE = "註冊審批";
const BASELINE_LABEL = "會友基礎";
const BASELINE_SUMMARY = "適用於所有生效帳戶 · 系統固定";
const TARGET_URL = process.env.PROGRAMS_TARGET_URL;

if (!TARGET_URL) {
  throw new Error(
    "PROGRAMS_TARGET_URL is required for the S4 Management hardening gate"
  );
}

const parsedTarget = new URL(TARGET_URL);
if (
  parsedTarget.protocol !== "http:" ||
  parsedTarget.username ||
  parsedTarget.password ||
  !["localhost", "127.0.0.1"].includes(parsedTarget.hostname)
) {
  throw new Error(
    "PROGRAMS_TARGET_URL must be an HTTP loopback URL without credentials"
  );
}

const ADMIN_USER = process.env.PROGRAMS_ADMIN_USERNAME ?? DEV_ADMIN.username;
const ADMIN_CREDENTIAL =
  process.env.PROGRAMS_ADMIN_CREDENTIAL ?? DEV_ADMIN.credential;
const SCREENSHOT_ROOT =
  process.env.S4_E2E_SCREENSHOT_DIR ??
  path.resolve("test-results", "s4-management-hardening", "screenshots");

interface ApiResult {
  body: unknown;
  status: number;
}

interface ApiInit {
  body?: unknown;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
}

interface RegistrationRef {
  name: string;
  requestId: string;
  username: string;
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is required for the S4 Management E2E gate`);
  }
  return value;
}

function escaped(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function slug(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-");
}

function objectBody(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} response was not an object`);
  }
  return value as Record<string, unknown>;
}

async function api(
  page: Page,
  requestPath: string,
  init: ApiInit = {}
): Promise<ApiResult> {
  return page.evaluate(
    async ({ body, headers, method, path: requestUrl }) => {
      const response = await fetch(requestUrl, {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers:
          body === undefined
            ? headers
            : { "Content-Type": "application/json", ...headers },
        method,
      });
      const text = await response.text();
      let parsed: unknown = null;
      if (text) {
        try {
          parsed = JSON.parse(text) as unknown;
        } catch {
          parsed = text;
        }
      }
      return { body: parsed, status: response.status };
    },
    {
      body: init.body,
      headers: init.headers,
      method: init.method ?? "GET",
      path: requestPath,
    }
  );
}

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/");
  await page
    .locator('input[autocomplete="username"]')
    .fill(required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER));
  await page
    .locator('input[autocomplete="current-password"]')
    .fill(required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CREDENTIAL));
  await page.getByRole("button", { name: LOGIN, exact: true }).click();
  await page.waitForURL((url) => url.pathname !== "/");
}

async function clearSession(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.removeItem("efcc_auth_active");
  });
}

async function clickNamed(
  root: Page | Locator,
  name: string | RegExp
): Promise<void> {
  const button = root.getByRole("button", { name });
  if (await button.count()) {
    await button.first().click();
    return;
  }
  const link = root.getByRole("link", { name });
  if (await link.count()) {
    await link.first().click();
    return;
  }
  throw new Error(`Could not find interactive control: ${String(name)}`);
}

async function searchInput(page: Page, label: string): Promise<Locator> {
  const labeled = page.getByLabel(label, { exact: true });
  if (await labeled.count()) {
    return labeled.first();
  }
  const searchbox = page.getByRole("searchbox", { name: label });
  if (await searchbox.count()) {
    return searchbox.first();
  }
  return page.locator('input[type="search"]').first();
}

async function listRegistrations(
  page: Page,
  status: "Pending" | "Processed" = "Pending"
): Promise<RegistrationRef[]> {
  const suffix = status === "Pending" ? "" : "?status=Processed";
  const response = await api(page, `/api/v1/auth/registrations${suffix}`);
  expect(response.status).toBe(200);
  const data = objectBody(
    objectBody(response.body, "registration list").data,
    "registration data"
  );
  if (!Array.isArray(data.registrations)) {
    throw new TypeError("Registration list did not contain registrations");
  }
  return data.registrations as RegistrationRef[];
}

async function registerPending(
  page: Page,
  name: string,
  username: string
): Promise<RegistrationRef> {
  const response = await api(page, "/api/v1/auth/register", {
    body: {
      name,
      password: "S4-gate-password!",
      phone: "555-0199",
      username,
    },
    headers: { "Idempotency-Key": `s4-gate-register-${uniqueSuffix()}` },
    method: "POST",
  });
  expect(response.status).toBe(200);
  const rows = await listRegistrations(page);
  const row = rows.find((candidate) => candidate.username === username);
  if (!row) {
    throw new Error(`Could not locate newly registered fixture ${username}`);
  }
  return { name, requestId: row.requestId, username };
}

async function approveBatch(
  page: Page,
  requestIds: readonly string[]
): Promise<void> {
  const response = await api(page, "/api/v1/auth/registrations/approve-batch", {
    body: { requestIds },
    headers: { "Idempotency-Key": `s4-gate-approve-${uniqueSuffix()}` },
    method: "POST",
  });
  expect(response.status).toBe(200);
}

async function selectionControl(
  page: Page,
  applicantName: string
): Promise<Locator> {
  const pattern = new RegExp(
    `(?:選取|取消選取).*${escaped(applicantName)}`,
    "u"
  );
  const checkbox = page.getByRole("checkbox", { name: pattern });
  if (await checkbox.count()) {
    return checkbox.first();
  }
  const button = page.getByRole("button", { name: pattern });
  if (await button.count()) {
    return button.first();
  }
  throw new Error(
    `Could not find approval selection control for ${applicantName}`
  );
}

async function expectSelected(control: Locator): Promise<void> {
  const pressed = await control.getAttribute("aria-pressed");
  if (pressed !== null) {
    await expect(control).toHaveAttribute("aria-pressed", "true");
    return;
  }
  await expect(control).toBeChecked();
}

async function openApprovalDetail(
  page: Page,
  applicantName: string
): Promise<void> {
  const pattern = new RegExp(escaped(applicantName), "u");
  const link = page.getByRole("link", { name: pattern });
  if (await link.count()) {
    await link.first().click();
    return;
  }
  const identityButton = page
    .getByRole("button")
    .filter({ hasText: applicantName });
  if (await identityButton.count()) {
    await identityButton.last().click();
    return;
  }
  throw new Error(`Could not open approval detail for ${applicantName}`);
}

function onlyProjects(testInfo: TestInfo, names: readonly string[]): void {
  test.skip(
    !names.includes(testInfo.project.name),
    `Focused functional probe runs only at ${names.join(" / ")}`
  );
}

async function captureEvidence(
  page: Page,
  testInfo: TestInfo,
  label: string
): Promise<void> {
  const directory = path.join(SCREENSHOT_ROOT, testInfo.project.name);
  const filename = `${testInfo.testId.replaceAll(/[^a-z0-9_-]/giu, "-")}-${slug(label)}.png`;
  const { mkdirSync } = await import("node:fs");
  mkdirSync(directory, { recursive: true });
  await page.screenshot({
    fullPage: true,
    path: path.join(directory, filename),
  });
}

async function assertResponsiveGeometry(page: Page): Promise<void> {
  const geometry = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const horizontalWidth = Math.max(
      document.body.scrollWidth,
      document.documentElement.scrollWidth
    );
    const controls = [
      ...document.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, summary, [role="button"], [role="tab"]'
      ),
    ]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          display: style.display,
          height: rect.height,
          label:
            element.getAttribute("aria-label") ??
            element.textContent?.trim() ??
            element.tagName,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
          visibility: style.visibility,
          width: rect.width,
        };
      })
      .filter(
        (control) =>
          control.display !== "none" &&
          control.visibility !== "hidden" &&
          control.width > 0 &&
          control.height > 0 &&
          control.right > 0 &&
          control.left < viewportWidth &&
          control.bottom > 0
      );
    return {
      horizontalOverflow: horizontalWidth - viewportWidth,
      undersized: controls.filter(
        (control) => control.width < 44 || control.height < 44
      ),
    };
  });
  expect(
    geometry.horizontalOverflow,
    `horizontal overflow: ${geometry.horizontalOverflow}px`
  ).toBeLessThanOrEqual(1);
  expect(geometry.undersized).toEqual([]);
}

test.describe("S4 Management hardening integration gate", () => {
  test("canonical management navigation preserves safe Back origins", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/management");
    await expect(page.getByRole("heading", { name: HUB_TITLE })).toBeVisible();

    await expect(
      page.getByRole("link", { name: /帳戶名錄/u }).first()
    ).toHaveAttribute("href", "/management?module=accounts");
    await expect(
      page.getByRole("link", { name: /帳戶與權限/u }).first()
    ).toHaveAttribute("href", "/management?module=permissions");
    await expect(
      page.getByRole("link", { name: /註冊審批/u }).first()
    ).toHaveAttribute("href", "/management?module=approvals");

    await page.goto("/management?module=approvals");
    await expect(
      page.getByRole("heading", { name: APPROVALS_TITLE })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "返回管理工作", exact: true }).first()
    ).toHaveAttribute("href", "/management");

    await page.goto(
      "/management?module=approvals&return=%2Fmanagement%3Fmodule%3Dsettings"
    );
    await expect(
      page.getByRole("link", { name: "設定", exact: true }).first()
    ).toHaveAttribute("href", "/management?module=settings");

    await page.goto(
      "/management?module=accounts&return=%2Fmanagement%3Fmodule%3Dsettings"
    );
    await expect(
      page.getByRole("heading", { name: ACCOUNTS_TITLE })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "返回管理工作", exact: true }).first()
    ).toHaveAttribute("href", "/management?module=settings");

    await page.goto(
      "/management?module=permissions&return=%2Fmanagement%3Fmodule%3Dsettings"
    );
    await expect(
      page.getByRole("heading", { name: PERMISSIONS_TITLE })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "設定", exact: true }).first()
    ).toHaveAttribute("href", "/management?module=settings");

    await page.goto("/permissions");
    await expect(page).toHaveURL(/\/management\?module=permissions/u);
    await page.goto("/registrations");
    await expect(page).toHaveURL(/\/management\?module=approvals/u);

    await captureEvidence(page, test.info(), "canonical-management-routes");
  });

  test("Account Directory opens populated and supports search plus phone/desktop filters", async ({
    page,
  }, testInfo) => {
    onlyProjects(testInfo, ["phone-390", "desktop-1024"]);
    await loginAsAdmin(page);
    await page.goto("/management?module=accounts");
    await expect(
      page.getByRole("heading", { name: ACCOUNTS_TITLE })
    ).toBeVisible();
    const directorySearch = await searchInput(page, "搜尋帳戶");
    await expect(directorySearch).toHaveValue("");
    await expect(page.getByRole("heading", { name: "帳戶結果" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /E2E Admin/u })
    ).toBeVisible();

    await directorySearch.fill("E2E");
    await expect(
      page.getByRole("button", { name: /E2E Admin/u })
    ).toBeVisible();

    if (testInfo.project.name === "phone-390") {
      await page.getByRole("button", { name: /^篩選/u }).click();
      const dialog = page.getByRole("dialog", { name: "篩選帳戶" });
      await expect(dialog).toBeVisible();
      await dialog.locator("#account-sheet-role").selectOption("Admin");
      await dialog
        .getByRole("button", { name: "套用篩選", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: /篩選\s+1/u })
      ).toBeVisible();
    } else {
      const roleFilter = page.locator("#account-directory-role");
      await (
        (await roleFilter.count())
          ? roleFilter
          : page.getByLabel("角色", { exact: true }).first()
      ).selectOption("Admin");
    }
    await expect(
      page.getByRole("button", { name: /E2E Admin/u })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /E2E Staff/u })).toHaveCount(
      0
    );

    await page
      .getByRole("button", { name: /E2E Admin/u })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "E2E Admin", exact: true })
    ).toBeVisible();
    await expect(page.getByText("帳戶詳情", { exact: true })).toBeVisible();
    await expect(
      page.locator("article[aria-labelledby='account-directory-detail-title']")
    ).toBeFocused();
    await captureEvidence(page, testInfo, "account-directory-detail");
  });

  test("Account Directory progressively appends a bounded page", async ({
    page,
  }, testInfo) => {
    onlyProjects(testInfo, ["desktop-1024"]);
    await loginAsAdmin(page);

    const suffix = uniqueSuffix();
    const namePrefix = `S4 Page ${suffix}`;
    const usernamePrefix = `e2e-s4-page-${suffix}`;
    const registrations: RegistrationRef[] = [];
    for (let index = 0; index < 51; index += 1) {
      registrations.push(
        await registerPending(
          page,
          `${namePrefix} ${String(index).padStart(2, "0")}`,
          `${usernamePrefix}-${index}`
        )
      );
    }
    await approveBatch(
      page,
      registrations.map((registration) => registration.requestId)
    );

    await page.goto("/management?module=accounts");
    const directorySearch = await searchInput(page, "搜尋帳戶");
    await directorySearch.fill(namePrefix);
    const accountRows = page.getByRole("button", {
      name: new RegExp(escaped(namePrefix), "u"),
    });
    await expect(accountRows).toHaveCount(50);
    const loadMore = page.getByRole("button", {
      name: "載入更多帳戶",
      exact: true,
    });
    await expect(loadMore).toBeVisible();
    await loadMore.click();
    await expect(accountRows).toHaveCount(51);
    await expect(loadMore).toHaveCount(0);
    await captureEvidence(page, testInfo, "account-directory-pagination");
  });

  test("Role list keeps Member Baseline fixed and drills into Permissions or Assigned Accounts", async ({
    page,
  }, testInfo) => {
    onlyProjects(testInfo, ["phone-390", "desktop-1024"]);
    await loginAsAdmin(page);
    await page.goto("/management?module=permissions");
    await expect(
      page.getByRole("heading", { name: PERMISSIONS_TITLE })
    ).toBeVisible();
    await expect(page.getByText(BASELINE_LABEL, { exact: true })).toBeVisible();
    await expect(
      page.getByText(BASELINE_SUMMARY, { exact: true })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /會友基礎/u })).toHaveCount(
      0
    );

    const staffRole = page.getByRole("button", { name: /^同工/u });
    expect(await staffRole.count()).toBeGreaterThan(0);
    await staffRole.click();
    await expect(page.getByRole("heading", { name: /同工/u })).toBeVisible();
    await expect(page.getByText(/角色詳情|固定角色/u).first()).toBeVisible();

    await clickNamed(page, /權限/u);
    await expect(
      page.getByRole("heading", { name: /權限/u, level: 2 })
    ).toBeVisible();
    const permissionSearch = await searchInput(page, "搜尋權限");
    await permissionSearch.fill("account.directory.read");
    await expect(page.getByText("查看帳戶名錄", { exact: true })).toBeVisible();
    await clickNamed(page, /返回角色詳情/u);

    await clickNamed(page, /已指派帳戶/u);
    await expect(
      page.getByRole("heading", { name: /已指派帳戶/u })
    ).toBeVisible();
    await expect(page.getByText(/只供查看|唯讀/u).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /新增|指派|移除/u })
    ).toHaveCount(0);
    await captureEvidence(page, testInfo, "role-assigned-accounts-readonly");

    await clickNamed(page, /返回角色詳情/u);
    await clickNamed(page, /返回角色列表|返回角色/u);
    await expect(
      page.getByText(BASELINE_SUMMARY, { exact: true })
    ).toBeVisible();
  });

  test("approval Pending/Processed views preserve explicit selection lifecycle", async ({
    page,
  }, testInfo) => {
    onlyProjects(testInfo, ["phone-390"]);
    await loginAsAdmin(page);

    const suffix = uniqueSuffix();
    const first = await registerPending(
      page,
      `S4 Approval First ${suffix}`,
      `e2e-s4-approval-first-${suffix}`
    );
    const second = await registerPending(
      page,
      `S4 Approval Second ${suffix}`,
      `e2e-s4-approval-second-${suffix}`
    );
    const processed = await registerPending(
      page,
      `S4 Approval Processed ${suffix}`,
      `e2e-s4-approval-processed-${suffix}`
    );
    await approveBatch(page, [processed.requestId]);

    await page.goto("/management?module=approvals");
    await expect(
      page.getByRole("heading", { name: APPROVALS_TITLE })
    ).toBeVisible();
    const pendingTab = page.getByRole("tab", { name: /待審批|待處理/u });
    const processedTab = page.getByRole("tab", {
      name: /^已處理(?:\s+\d+)?$/u,
    });
    await expect(pendingTab).toHaveAttribute("aria-selected", "true");
    await expect(processedTab).toHaveAttribute("aria-selected", "false");

    const approvalSearch = await searchInput(page, "搜尋申請人或登入名稱");
    await approvalSearch.fill(first.name);
    await expect(page.getByText(first.name, { exact: true })).toBeVisible();
    const firstSelection = await selectionControl(page, first.name);
    await firstSelection.click();
    await expectSelected(firstSelection);

    await approvalSearch.fill(second.name);
    await expect(page.getByText(second.name, { exact: true })).toBeVisible();
    const secondSelection = await selectionControl(page, second.name);
    await secondSelection.click();
    await expectSelected(secondSelection);
    await expect(page.getByText("已選 2 位", { exact: true })).toBeVisible();

    await approvalSearch.fill(first.name);
    await openApprovalDetail(page, first.name);
    await expect(page).toHaveURL(/module=approvals&request=/u);
    await expect(
      page.getByRole("heading", { name: /註冊審批/u })
    ).toBeVisible();
    await clickNamed(page, /返回註冊審批/u);
    await expect(page.getByText("已選 2 位", { exact: true })).toBeVisible();

    const tray = page.locator('[aria-label="審批選取集"]');
    await expect(tray).toBeVisible();
    await tray.getByRole("button", { name: "檢視所選", exact: true }).click();
    const selectedList = tray.getByRole("list", { name: "所選申請" });
    await expect(selectedList).toBeVisible();
    await expect(
      selectedList.getByText(first.name, { exact: true })
    ).toBeVisible();
    await expect(
      selectedList.getByText(second.name, { exact: true })
    ).toBeVisible();
    await selectedList
      .getByRole("button", {
        name: new RegExp(`移除\\s*${escaped(second.name)}`, "u"),
      })
      .click();
    await expect(page.getByText("已選 1 位", { exact: true })).toBeVisible();
    await tray.getByRole("button", { name: "收起所選", exact: true }).click();
    await expect(page.getByText("已選 1 位", { exact: true })).toBeVisible();
    await page
      .locator('[aria-label="審批選取集"]')
      .getByRole("button", { name: "清除", exact: true })
      .click();
    await expect(page.locator('[aria-label="審批選取集"]')).toHaveCount(0);

    await processedTab.click();
    await expect(processedTab).toHaveAttribute("aria-selected", "true");
    await approvalSearch.fill(processed.name);
    await expect(page.getByText(processed.name, { exact: true })).toBeVisible();
    const processedRow = page
      .locator("article, li, tr")
      .filter({ hasText: processed.name })
      .last();
    await expect(processedRow.getByRole("checkbox")).toHaveCount(0);
    await expect(
      processedRow.getByRole("button", { name: /選取|取消選取/u })
    ).toHaveCount(0);
    await openApprovalDetail(page, processed.name);
    await expect(
      page.getByText(/唯讀|已處理申請|申請已處理/u).first()
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /核准|批准|拒絕/u })
    ).toHaveCount(0);

    await page.goto("/management");
    await page.goto("/management?module=approvals");
    await expect(
      page.getByRole("tab", { name: /待審批|待處理/u })
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[aria-label="審批選取集"]')).toHaveCount(0);
    await captureEvidence(page, testInfo, "approval-selection-lifecycle");
  });

  test("management landmarks expose busy state, focus seams, no overflow, and 44px controls", async ({
    page,
  }, testInfo) => {
    await loginAsAdmin(page);
    const surfaces = [
      ["/management", HUB_TITLE],
      ["/management?module=accounts", ACCOUNTS_TITLE],
      ["/management?module=permissions", PERMISSIONS_TITLE],
      ["/management?module=approvals", APPROVALS_TITLE],
    ] as const;

    for (const [surface, title] of surfaces) {
      await page.goto(surface);
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
      await expect(page.locator("main#shell-content")).toHaveCount(1);
      await expect(
        page.locator("main#shell-content [aria-labelledby]").first()
      ).toBeVisible();
      await assertResponsiveGeometry(page);
    }

    await page.goto("/management?module=accounts");
    const accountsSection = page.locator(
      'section[aria-labelledby="account-directory-title"]'
    );
    await expect(accountsSection).toHaveAttribute("aria-busy", "false");
    if (
      testInfo.project.name.startsWith("phone-") ||
      testInfo.project.name.startsWith("tablet-")
    ) {
      const filter = page.getByRole("button", { name: /^篩選/u });
      await filter.focus();
      await filter.click();
      const filterDialog = page.getByRole("dialog", { name: "篩選帳戶" });
      await expect(
        filterDialog.getByRole("button", { name: /關閉/u })
      ).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(filter).toBeFocused();
    }
    await captureEvidence(
      page,
      testInfo,
      "management-responsive-accessibility"
    );
  });

  test("legacy route redirects retain auth deep-link behavior after session clear", async ({
    page,
  }, testInfo) => {
    onlyProjects(testInfo, ["phone-320"]);
    await loginAsAdmin(page);
    await page.goto("/management?module=accounts");
    await expect(
      page.getByRole("heading", { name: ACCOUNTS_TITLE })
    ).toBeVisible();
    await clearSession(page);
    await page.goto("/management?module=accounts");
    await expect(page).toHaveURL(/\/$/u);
    await expect(page.locator('input[autocomplete="username"]')).toBeVisible();
    await captureEvidence(page, testInfo, "management-auth-deep-link");
  });
});
