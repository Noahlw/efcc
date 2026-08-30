/* oxlint-disable vitest/prefer-importing-vitest-globals -- this is a Playwright suite. */
/* oxlint-disable promise/avoid-new -- deferred gates intentionally hold API requests for loading evidence. */
/**
 * S4-12 / issue #467 — authenticated local-D1 evidence gate.
 *
 * The suite consumes the real Worker/D1 runtime through PROGRAMS_TARGET_URL.
 * It intentionally creates only disposable, uniquely prefixed E2E records;
 * The role-first and persistent approval assertions encode the current
 * normalized identity-management contract and should surface an incomplete
 * lower stack branch rather than silently weakening coverage.
 */
import path from "node:path";

import { expect, test } from "@playwright/test";
import type { Locator, Page, TestInfo } from "@playwright/test";

import { DEV_ADMIN } from "./dev-fixtures";

const LOGIN = "登入";
const HUB_TITLE = "管理工作";
const ACCOUNTS_TITLE = "帳戶名錄";
const PERMISSIONS_TITLE = "權限管理";
const APPROVALS_TITLE = "註冊審批";
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

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise = () => {};
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
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
      await dialog.locator("#account-sheet-role").click();
      await page.getByRole("option", { name: "管理員", exact: true }).click();
      await dialog
        .getByRole("button", { name: "套用篩選", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: /篩選\s+1/u })
      ).toBeVisible();
    } else {
      const roleFilter = page.locator("#account-directory-role");
      await roleFilter.click();
      await page.getByRole("option", { name: "管理員", exact: true }).click();
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

  test("Directory Frame follows 600 Sheet, shell, reflow, and detail geometry", async ({
    page,
  }, testInfo) => {
    onlyProjects(testInfo, [
      "tablet-600",
      "tablet-799",
      "desktop-800",
      "desktop-1024",
    ]);
    await loginAsAdmin(page);
    await page.goto("/management?module=accounts");
    const frame = page.locator("[data-directory-frame]");
    await expect(frame).toHaveAttribute("data-directory-state", "ready");
    await expect(
      frame.getByRole("heading", { name: ACCOUNTS_TITLE })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /E2E Admin/u }).first()
    ).toBeVisible();

    const viewportWidth = page.viewportSize()?.width ?? 0;
    const workspace = page.locator("[data-directory-workspace]");
    const columns = await workspace.evaluate(
      (element) => getComputedStyle(element).gridTemplateColumns
    );
    if (viewportWidth >= 800 && viewportWidth < 1024) {
      expect(columns.split(" ").filter(Boolean)).toHaveLength(1);
    }
    if (viewportWidth >= 1024) {
      expect(columns.split(" ").filter(Boolean).length).toBeGreaterThanOrEqual(
        2
      );
      await page
        .getByRole("button", { name: /E2E Admin/u })
        .first()
        .click();
      const detail = page.locator(
        '[data-directory-detail] article[aria-labelledby="account-directory-detail-title"]'
      );
      await expect(detail).toBeFocused();
      await expect(detail).toHaveCSS("position", "sticky");
    }
    if (viewportWidth < 800) {
      const filter = page.getByRole("button", { name: /^篩選/u });
      await expect(filter).toBeVisible();
      await filter.click();
      const dialog = page.getByRole("dialog", { name: "篩選帳戶" });
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box?.width ?? 0).toBeLessThanOrEqual(viewportWidth);
      await page.keyboard.press("Escape");
      await expect(filter).toBeFocused();
    } else {
      await expect(page.locator("#account-directory-role")).toBeVisible();
    }
    await page.evaluate(() => {
      const longName = "陳大文".repeat(20);
      document
        .querySelector<HTMLElement>("[data-directory-list] strong")
        ?.replaceChildren(longName);
      document
        .querySelectorAll<HTMLElement>("[data-directory-detail] dd")
        .forEach((element) => element.replaceChildren("W".repeat(80)));
    });
    const overflow = await page.evaluate(
      () =>
        Math.max(
          document.body.scrollWidth,
          document.documentElement.scrollWidth
        ) - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
  test("Role list exposes protected Member Baseline and drills directly into permissions", async ({
    page,
  }, testInfo) => {
    onlyProjects(testInfo, ["phone-390", "desktop-1024"]);
    await loginAsAdmin(page);
    await page.goto("/management?module=permissions");
    await expect(
      page.getByRole("heading", { name: PERMISSIONS_TITLE })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        exact: true,
        level: 2,
        name: "身份組列表",
      })
    ).toBeVisible();
    const roleList = page.getByRole("list", {
      exact: true,
      name: "身份組列表",
    });
    await expect(roleList).toBeVisible();
    await expect(
      roleList.getByRole("button", { name: /^會友基礎/u })
    ).toBeVisible();

    await captureEvidence(page, testInfo, "role-list-baseline");
    const staffRole = roleList.getByRole("button", { name: /^同工/u });
    await expect(staffRole).toBeVisible();
    await staffRole.click();
    await expect(
      page.getByRole("heading", {
        exact: true,
        level: 2,
        name: "同工",
      })
    ).toBeVisible();
    const detailSurface = page.getByRole("region", {
      exact: true,
      name: "權限編輯：同工",
    });
    await expect(detailSurface).toBeVisible();
    await expect(
      page.getByRole("button", { exact: true, name: "權限" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { exact: true, name: "權限" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /已指派帳戶/u })
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: /已指派帳戶/u })).toHaveCount(
      0
    );
    await expect(page.getByRole("button", { name: /已指派帳戶/u })).toHaveCount(
      0
    );
    await captureEvidence(page, testInfo, "role-detail");
    await captureEvidence(
      page,
      testInfo,
      "role-detail-no-assigned-account-action"
    );

    const permissionSearch = await searchInput(page, "搜尋權限");
    await permissionSearch.fill("account.directory.read");
    await expect(page.getByText("查看帳戶名錄", { exact: true })).toBeVisible();
    await captureEvidence(page, testInfo, "role-permissions-search");

    await page
      .getByRole("link", { exact: true, name: "返回身份組列表" })
      .click();
    await expect(
      page.getByRole("heading", {
        exact: true,
        level: 2,
        name: "身份組列表",
      })
    ).toBeVisible();
    await expect(
      page.getByRole("list", { exact: true, name: "身份組列表" })
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
    await captureEvidence(page, testInfo, "approval-selection-tray");

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
    await captureEvidence(page, testInfo, "approval-selection-review");
    await tray.getByRole("button", { name: "核准所選", exact: true }).click();
    await expect(
      page.getByRole("alertdialog", { name: "確認核准所選申請" })
    ).toBeVisible();
    await captureEvidence(page, testInfo, "approval-confirmation");
    await page.getByRole("button", { name: "取消", exact: true }).click();

    await page.route("**/api/v1/auth/registrations/approve-batch", (route) =>
      route.fulfill({
        body: JSON.stringify({
          code: "CONFLICT",
          detail: "stale",
          status: 409,
        }),
        contentType: "application/problem+json",
        status: 409,
      })
    );
    await tray.getByRole("button", { name: "核准所選", exact: true }).click();
    await page.getByRole("button", { name: "確認核准", exact: true }).click();
    await expect(
      page
        .getByRole("region", { name: APPROVALS_TITLE })
        .getByText("部分申請已變更，請檢視所選項目後再試。", { exact: true })
    ).toBeVisible();
    await captureEvidence(page, testInfo, "approval-conflict");
    await page.unroute("**/api/v1/auth/registrations/approve-batch");
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
    await captureEvidence(page, testInfo, "approval-processed-detail");

    await page.goto("/management");
    await page.goto("/management?module=approvals");
    await expect(
      page.getByRole("tab", { name: /待審批|待處理/u })
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[aria-label="審批選取集"]')).toHaveCount(0);
    await captureEvidence(page, testInfo, "approval-selection-lifecycle");
  });

  test("captures explicit loading, empty, error, and forbidden management states", async ({
    page,
  }, testInfo) => {
    onlyProjects(testInfo, ["phone-390"]);
    await loginAsAdmin(page);

    const loadingGate = deferred();
    await page.route("**/api/v1/auth/registrations", async (route) => {
      if (route.request().method() === "GET") {
        await loadingGate.promise;
      }
      await route.continue();
    });
    await page.goto("/management?module=approvals");
    await expect(
      page
        .locator("section[aria-labelledby='approval-queue-title']")
        .getByRole("status")
    ).toBeVisible();
    await captureEvidence(page, testInfo, "approvals-loading");
    loadingGate.resolve();
    await expect(page.getByRole("tab", { name: /待審批/u })).toBeVisible();
    await page.unroute("**/api/v1/auth/registrations");

    const permissionLoadingGate = deferred();
    let permissionHierarchyRouteHit = false;
    await page.route("**/api/v1/identity/roles", async (route) => {
      permissionHierarchyRouteHit = true;
      await permissionLoadingGate.promise;
      await route.continue();
    });
    await page.goto("/management?module=permissions");
    const permissionLoadingState = page.locator(
      "output#permission-editor-state"
    );
    await expect(permissionLoadingState).toBeVisible();
    await expect(permissionLoadingState).toHaveText("正在載入權限…");
    await expect.poll(() => permissionHierarchyRouteHit).toBe(true);
    await captureEvidence(page, testInfo, "permissions-loading");
    permissionLoadingGate.resolve();
    await expect(
      page.getByRole("list", { exact: true, name: "身份組列表" })
    ).toBeVisible();
    await page.unroute("**/api/v1/identity/roles");

    let permissionErrorRouteHit = false;
    await page.route("**/api/v1/identity/roles", (route) => {
      permissionErrorRouteHit = true;
      return route.fulfill({
        body: JSON.stringify({
          code: "UNAVAILABLE",
          detail: "系統暫時無法使用，請稍後再試。",
          status: 500,
        }),
        contentType: "application/problem+json",
        status: 500,
      });
    });
    await page.goto("/management?module=permissions");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect.poll(() => permissionErrorRouteHit).toBe(true);
    await captureEvidence(page, testInfo, "permissions-error");
    await page.unroute("**/api/v1/identity/roles");

    await page.route("**/api/v1/auth/registrations", (route) =>
      route.fulfill({
        body: JSON.stringify({
          code: "FORBIDDEN",
          detail: "您沒有權限執行此操作。",
          status: 403,
        }),
        contentType: "application/problem+json",
        status: 403,
      })
    );
    await page.goto("/management?module=approvals");
    await expect(page.getByRole("alert")).toBeVisible();
    await captureEvidence(page, testInfo, "approvals-forbidden");
    await page.unroute("**/api/v1/auth/registrations");

    await page.goto("/management?module=approvals");
    const approvalSearch = await searchInput(page, "搜尋申請人或登入名稱");
    await approvalSearch.fill("不存在的申請");
    await expect(
      page.getByText("找不到符合的申請。", { exact: true })
    ).toBeVisible();
    await captureEvidence(page, testInfo, "approvals-empty-filter");
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

  test("mobile in-page action surfaces stay in flow", async ({
    page,
  }, testInfo) => {
    onlyProjects(testInfo, [
      "phone-320",
      "phone-375",
      "phone-390",
      "phone-414",
      "tablet-600",
      "phone-748",
      "tablet-799",
      "desktop-800",
      "desktop-1024",
      "desktop-1440",
      "desktop-1920",
    ]);
    await loginAsAdmin(page);
    const vw = page.viewportSize()?.width ?? 0;
    const isCompact = vw < 800;

    const horiz = async () =>
      page.evaluate(
        () =>
          Math.max(
            document.body.scrollWidth,
            document.documentElement.scrollWidth
          ) - window.innerWidth
      );

    // Approvals tray — measure while on approvals route
    const suffix = uniqueSuffix();
    const approval = await registerPending(
      page,
      `S4 ${suffix}`,
      `e2e-s4-${suffix}`
    );
    await page.goto("/management?module=approvals");
    await expect(
      page.getByRole("heading", { name: APPROVALS_TITLE })
    ).toBeVisible();
    const sInput = await searchInput(page, "搜尋申請人或登入名稱");
    await sInput.fill(`S4 ${suffix}`);
    const cb = await selectionControl(page, `S4 ${suffix}`);
    await cb.click();
    await expectSelected(cb);
    const tray = page.locator('[aria-label="審批選取集"]');
    await expect(tray).toBeVisible();
    expect(await horiz()).toBeLessThanOrEqual(1);
    const trayPos = await tray.evaluate((e) => getComputedStyle(e).position);
    expect(trayPos).toBe(isCompact ? "static" : "fixed");
    const approveBtn = tray.getByRole("button", { name: /核准/u }).first();
    await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>(".shell-content");
      if (shell) {
        shell.scrollTop = shell.scrollHeight;
      }
    });
    await approveBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    const dockBox = await page.locator(".nav-phone").boundingBox();
    const actionBox = await approveBtn.boundingBox();
    if (dockBox && actionBox && isCompact) {
      expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(dockBox.y + 1);
    }
    // Detail decision surface — the same Action Surface stays in flow at every width.
    await page.goto(
      `/management?module=approvals&request=${encodeURIComponent(approval.requestId)}`
    );
    await expect(
      page.getByRole("heading", { name: /註冊審批/u })
    ).toBeVisible();
    const detailSurface = page.locator(
      '[data-slot="action-surface"][aria-label="申請處理操作"]'
    );
    await expect(detailSurface).toBeVisible();
    await expect(detailSurface).toHaveAttribute("data-state", "save");
    expect(
      await detailSurface.evaluate(
        (element) => getComputedStyle(element).position
      )
    ).toBe("static");
    const decisionBounds = await detailSurface
      .getByRole("button")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            bottom: rect.bottom,
            height: rect.height,
            right: rect.right,
            width: rect.width,
          };
        })
      );
    for (const bounds of decisionBounds) {
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.right).toBeLessThanOrEqual(vw + 1);
    }
    const detailApprove = detailSurface.getByRole("button", { name: "核准" });
    await detailApprove.click();
    const detailDialog = page.getByRole("alertdialog", {
      name: "確認核准申請",
    });
    await expect(detailDialog).toBeVisible();
    const detailDialogBox = await detailDialog.boundingBox();
    if (detailDialogBox) {
      expect(detailDialogBox.width).toBeLessThanOrEqual(vw);
      expect(detailDialogBox.height).toBeLessThanOrEqual(
        page.viewportSize()?.height ?? 0
      );
    }
    await detailDialog.getByRole("button", { name: "取消" }).click();
    await expect(detailApprove).toBeFocused();

    // Permissions review — measure while on permissions route
    await page.goto("/management?module=permissions");
    await expect(
      page.getByRole("heading", { name: PERMISSIONS_TITLE })
    ).toBeVisible();
    const staffRole = page.getByRole("button", { name: /^同工/u }).first();
    await staffRole.click();
    await expect(
      page.getByRole("heading", {
        exact: true,
        level: 2,
        name: "同工",
      })
    ).toBeVisible();
    const permissionSurface = page.locator(
      '[data-slot="action-surface"][aria-label="權限編輯：同工"]'
    );
    await expect(permissionSurface).toBeVisible();
    const editableSwitch = page.locator(
      '[data-capability="department.manage"] [role="switch"]'
    );
    await expect(editableSwitch).toBeVisible();
    await expect(editableSwitch).toBeEnabled();
    await editableSwitch.click();

    const actionSurface = page.locator(
      '[data-slot="action-surface"][aria-label="權限儲存操作"]'
    );
    await expect(actionSurface).toBeVisible();
    const saveBtn = actionSurface.getByRole("button", {
      exact: true,
      name: "儲存變更",
    });
    await expect(saveBtn).toBeVisible();
    await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>(".shell-content");
      if (shell) {
        shell.scrollTop = shell.scrollHeight;
      }
    });
    await saveBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    const dockBox2 = await page.locator(".nav-phone").boundingBox();
    const saveBox = await saveBtn.boundingBox();
    if (dockBox2 && saveBox && isCompact) {
      expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(dockBox2.y + 1);
    }

    await saveBtn.click();
    const review = page.getByRole("dialog", {
      exact: true,
      name: "確認權限變更",
    });
    await expect(review).toBeVisible();
    await expect(
      review.getByRole("button", { exact: true, name: "確認儲存" })
    ).toBeVisible();
    const reviewBox = await review.boundingBox();
    expect(reviewBox).not.toBeNull();
    if (reviewBox) {
      expect(reviewBox.x).toBeGreaterThanOrEqual(-1);
      expect(reviewBox.y).toBeGreaterThanOrEqual(-1);
      expect(reviewBox.x + reviewBox.width).toBeLessThanOrEqual(vw + 1);
      expect(reviewBox.y + reviewBox.height).toBeLessThanOrEqual(
        (page.viewportSize()?.height ?? 0) + 1
      );
    }
    const reviewButtons = await review
      .getByRole("button")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            height: rect.height,
            right: rect.right,
            width: rect.width,
          };
        })
      );
    for (const bounds of reviewButtons) {
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.right).toBeLessThanOrEqual(vw + 1);
    }
    expect(await horiz()).toBeLessThanOrEqual(1);
    await review.getByRole("button", { exact: true, name: "返回編輯" }).click();
    await expect(review).toBeHidden();
    await expect(saveBtn).toBeFocused();

    await captureEvidence(page, testInfo, "mobile-inflow-regression");
  });
});
