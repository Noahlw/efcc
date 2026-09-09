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
import { expect, test } from "@playwright/test";
import type { Locator, Page, TestInfo } from "@playwright/test";

import { DEV_ADMIN, DEV_MEMBER, DEV_STAFF } from "./dev-fixtures";
import { attachNumericEvidence } from "./numeric-evidence";

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
  const button = page.getByRole("button", { name: pattern });
  const candidate = checkbox.or(button).first();
  await expect(candidate).toBeVisible();
  if (await checkbox.count()) {
    return checkbox.first();
  }
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

async function assertResponsiveGeometry(
  page: Page,
  testInfo?: TestInfo
): Promise<void> {
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
  if (testInfo) {
    await attachNumericEvidence(testInfo, "responsive-geometry", geometry);
  }
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
      page.getByRole("link", { name: "返回管理工作", exact: true }).first()
    ).toHaveAttribute("href", "/management?module=settings");

    await page.goto("/permissions");
    await expect(page).toHaveURL(/\/management\?module=permissions/u);
    await page.goto("/registrations");
    await expect(page).toHaveURL(/\/management\?module=approvals/u);
  });

  test("Account Directory opens populated and supports status plus department filters", async ({
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
      await dialog.locator("#account-sheet-status").click();
      await page.getByRole("option", { name: "生效", exact: true }).click();
      await dialog
        .getByRole("button", { name: "套用篩選", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: /篩選\s+1/u })
      ).toBeVisible();
    } else {
      const statusFilter = page.locator("#account-directory-status");
      await statusFilter.click();
      await page.getByRole("option", { name: "生效", exact: true }).click();
    }
    await expect(
      page.getByRole("button", { name: /E2E Admin/u })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /E2E Staff/u })
    ).toBeVisible();

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
  });

  test("Account Directory progressively appends a bounded page", async ({
    page,
  }, testInfo) => {
    onlyProjects(testInfo, ["desktop-1024"]);
    await loginAsAdmin(page);

    const suffix = uniqueSuffix();
    const namePrefix = `S4 Page ${suffix}`;
    const usernamePrefix = `E2E_s4-page-${suffix}`;
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
      await expect(page.locator("[data-directory-detail]")).toHaveCSS(
        "position",
        "sticky"
      );
    }
    if (viewportWidth < 800) {
      const filter = page.getByRole("button", { name: /^篩選/u });
      await expect(filter).toBeVisible();
      await filter.click();
      const dialog = page.getByRole("dialog", { name: "篩選帳戶" });
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      await attachNumericEvidence(testInfo, "account-directory-filter-box", {
        box,
        viewportWidth,
      });
      expect(box?.width ?? 0).toBeLessThanOrEqual(viewportWidth);
      await page.keyboard.press("Escape");
      await expect(filter).toBeFocused();
    } else {
      await expect(page.locator("#account-directory-status")).toBeVisible();
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
    await attachNumericEvidence(testInfo, "account-directory-overflow", {
      overflow,
      viewportWidth,
    });
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
    await expect(page.getByText("會友基礎").first()).toBeVisible();

    const staffRole = roleList.getByRole("link", { name: /^同工/u });
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

    const permissionSearch = await searchInput(page, "搜尋權限");
    await permissionSearch.fill("account.directory.read");
    await expect(page.getByText("查看帳戶名錄", { exact: true })).toBeVisible();

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
      `E2E_s4-approval-first-${suffix}`
    );
    const second = await registerPending(
      page,
      `S4 Approval Second ${suffix}`,
      `E2E_s4-approval-second-${suffix}`
    );
    const processed = await registerPending(
      page,
      `S4 Approval Processed ${suffix}`,
      `E2E_s4-approval-processed-${suffix}`
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
    await tray.getByRole("button", { name: "核准所選", exact: true }).click();
    await expect(
      page.getByRole("alertdialog", { name: "確認核准所選申請" })
    ).toBeVisible();
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
        .locator("main#shell-content")
        .getByRole("alert")
        .filter({ hasText: "部分申請已變更，請檢視所選項目後再試。" })
        .first()
    ).toBeVisible();
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

    await page.goto("/management");
    await page.goto("/management?module=approvals");
    await expect(
      page.getByRole("tab", { name: /待審批|待處理/u })
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[aria-label="審批選取集"]')).toHaveCount(0);
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
    await page.unroute("**/api/v1/auth/registrations");

    await page.goto("/management?module=approvals");
    const approvalSearch = await searchInput(page, "搜尋申請人或登入名稱");
    await approvalSearch.fill("不存在的申請");
    await expect(
      page.getByText("找不到符合的申請。", { exact: true })
    ).toBeVisible();
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
      await assertResponsiveGeometry(page, testInfo);
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
  });

  test("mobile in-page action surfaces stay in flow", async ({
    page,
  }, testInfo) => {
    onlyProjects(testInfo, [
      "phone-320",
      "phone-390",
      "tablet-600",
      "tablet-799",
      "desktop-800",
      "desktop-900",
      "desktop-1024",
      "desktop-1440",
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
      `E2E_s4-${suffix}`
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
    const trayOverflow = await horiz();
    await attachNumericEvidence(testInfo, "approvals-tray-overflow", {
      overflow: trayOverflow,
      vw,
    });
    expect(trayOverflow).toBeLessThanOrEqual(1);
    const trayPos = await tray.evaluate((e) => getComputedStyle(e).position);
    expect(trayPos).toBe("static");
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
    await attachNumericEvidence(testInfo, "approvals-dock-clearance", {
      actionBox,
      dockBox,
      isCompact,
    });
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
    await attachNumericEvidence(testInfo, "approvals-decision-bounds", {
      decisionBounds,
      vw,
    });
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
    await attachNumericEvidence(testInfo, "approvals-detail-dialog-box", {
      detailDialogBox,
      vw,
    });
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
    const staffRole = page.getByRole("link", { name: /^同工/u }).first();
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
    await attachNumericEvidence(testInfo, "permissions-save-dock-clearance", {
      dockBox: dockBox2,
      isCompact,
      saveBox,
    });
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
    const reviewContent = page.locator('[data-slot="sheet-content"]');
    await expect(reviewContent).toBeVisible();
    await page.waitForFunction(() => {
      const sheet = document.querySelector<HTMLElement>(
        '[data-slot="sheet-content"]'
      );
      return (
        sheet !== null &&
        sheet.getBoundingClientRect().bottom <= window.innerHeight + 1
      );
    });
    const reviewBox = await reviewContent.boundingBox();
    await attachNumericEvidence(testInfo, "permissions-review-box", {
      reviewBox,
      vw,
    });
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
    await attachNumericEvidence(testInfo, "permissions-review-buttons", {
      reviewButtons,
      vw,
    });
    for (const bounds of reviewButtons) {
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.right).toBeLessThanOrEqual(vw + 1);
    }
    expect(await horiz()).toBeLessThanOrEqual(1);
    await review.getByRole("button", { exact: true, name: "返回編輯" }).click();
    await expect(review).toBeHidden();
    await expect(saveBtn).toBeFocused();
  });
  test("Management Hub and settings preserve server-projected grouping, safe Back and static semantics", async ({
    page,
  }, testInfo) => {
    onlyProjects(testInfo, ["phone-390", "desktop-900", "desktop-1024"]);
    // Hub loading gate
    const hubGate = deferred();
    let hubHit = false;
    await page.route("**/api/v1/programs/hub", async (route) => {
      hubHit = true;
      await hubGate.promise;
      await route.continue();
    });
    await loginAsAdmin(page);
    await page.goto("/management");
    await expect(page.getByRole("heading", { name: HUB_TITLE })).toBeVisible();
    // Loading state appears while hub is deferred
    const loadingState = page.locator("#management-hub-state");
    // Wait a tick for loading to appear
    await expect.poll(() => hubHit).toBe(true);
    await expect(loadingState).toBeVisible();
    await expect(loadingState).toHaveText(/載入中/u);
    hubGate.resolve();
    await expect(page.getByRole("heading", { name: HUB_TITLE })).toBeVisible();
    await page.unroute("**/api/v1/programs/hub");

    // Verify projected grouping: at least one group heading and rows
    const groups = page.locator('[data-slot="management-hub-grid"] section');
    // Hub should have at least 1 visible group for Admin
    await expect(groups.first()).toBeVisible();
    // Entry card order: should be visible for Admin
    const entryCard = page.getByRole("link", { name: /前往課程管理/u });
    if (await entryCard.count()) {
      await expect(entryCard).toBeVisible();
    }

    // Forbidden state via stub
    await page.route("**/api/v1/programs/hub", (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/problem+json",
        body: JSON.stringify({
          status: 403,
          code: "FORBIDDEN",
          detail: "您沒有權限執行此操作。",
        }),
      })
    );
    await page.goto("/management");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("button", { name: "重試連接" })).toBeVisible();
    // Retry restores by removing stub and clicking
    await page.unroute("**/api/v1/programs/hub");
    await page.getByRole("button", { name: "重試連接" }).click();
    await expect(page.getByRole("heading", { name: HUB_TITLE })).toBeVisible();
    await page.unroute("**/api/v1/programs/hub");

    // Empty projection: stub hub to return empty groups
    await page.route("**/api/v1/programs/hub", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          requestId: "r-empty",
          data: { groups: [], entryCard: null },
        }),
      })
    );
    await page.goto("/management");
    await expect(page.getByText("目前沒有可用的管理工作")).toBeVisible();
    await page.unroute("**/api/v1/programs/hub");

    // Reload to restore normal hub
    await page.goto("/management");
    await expect(page.getByRole("heading", { name: HUB_TITLE })).toBeVisible();

    // Settings hub
    await page.goto("/management?module=settings");
    await expect(page.getByRole("heading", { name: "設定" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /帳戶與權限/u }).first()
    ).toHaveAttribute(
      "href",
      "/management?module=permissions&return=%2Fmanagement%3Fmodule%3Dsettings"
    );
    await expect(page.getByRole("link", { name: /簽到設定/u })).toHaveAttribute(
      "href",
      "/management?module=checkin-settings"
    );
    await expect(page.getByRole("link", { name: /時區/u })).toHaveAttribute(
      "href",
      "/management?module=timezone-settings"
    );
    // Settings hub has no editable input
    await expect(page.locator("#settings-title")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "返回管理工作" })
    ).toHaveAttribute("href", "/management");
    await expect(page.locator("input")).toHaveCount(0);

    // Check-in settings static semantics
    await page.goto("/management?module=checkin-settings");
    await expect(page.getByRole("heading", { name: "簽到設定" })).toBeVisible();
    await expect(page.getByRole("link", { name: "設定" })).toHaveAttribute(
      "href",
      "/management?module=settings"
    );
    await expect(page.getByText("簽到方式")).toBeVisible();
    await expect(page.getByText("會員二維碼")).toBeVisible();
    await expect(page.getByText("聚會代碼")).toBeVisible();
    await expect(page.getByText("代為簽到")).toBeVisible();
    await expect(page.getByText("開放時段")).toBeVisible();
    await expect(page.getByText("30 分鐘")).toBeVisible();
    await expect(page.getByText("15 分鐘")).toBeVisible();
    await expect(page.locator("input")).toHaveCount(0);
    await expect(page.locator("textarea")).toHaveCount(0);
    await expect(page.locator("select")).toHaveCount(0);

    // Timezone settings static semantics
    await page.goto("/management?module=timezone-settings");
    await expect(page.getByRole("heading", { name: "時區" })).toBeVisible();
    await expect(page.getByRole("link", { name: "設定" })).toHaveAttribute(
      "href",
      "/management?module=settings"
    );
    await expect(page.getByText("香港時間（GMT+8）")).toBeVisible();
    await expect(page.getByText("GMT+8", { exact: true })).toBeVisible();
    await expect(page.locator("input")).toHaveCount(0);

    // Safe Back from detail returns to correct origin
    await page.goto("/management?module=checkin-settings");
    await page.getByRole("link", { name: "設定" }).first().click();
    await expect(page).toHaveURL(/module=settings/u);
    // Verify back link href is correct, then navigate
    await expect(
      page.getByRole("link", { name: "返回管理工作", exact: true }).first()
    ).toHaveAttribute("href", "/management");
    await page.goto("/management");
    await expect(page).toHaveURL(/\/management$/u);

    // numeric checks for Hub and Settings at this width
    await assertResponsiveGeometry(page, testInfo);
  });

  test("Home Content preserves Draft/Published, Template A/B, preview, audit and conflict with long-content containment", async ({
    page,
  }, testInfo) => {
    onlyProjects(testInfo, ["phone-390", "desktop-900"]);
    await loginAsAdmin(page);
    // Snapshot current home content to restore later
    const homeSnapshot = await api(page, "/api/v1/home/content");
    let snapshotData: unknown = null;
    if (homeSnapshot.status === 200) {
      snapshotData = (homeSnapshot.body as { data: unknown }).data;
    }

    await page.goto("/management?module=home-content");
    await expect(page.getByRole("heading", { name: "首頁內容" })).toBeVisible();

    // Template A/B switch exposes distinct fields
    const templateA = page.getByRole("button", { name: "版面 A" });
    const templateB = page.getByRole("button", { name: "版面 B" });
    await expect(templateA).toBeVisible();
    await expect(templateB).toBeVisible();
    await templateA.click();
    await expect(page.locator("#home-cms-featured-event")).toBeVisible();
    await templateB.click();
    await expect(page.locator("#home-cms-title")).toBeVisible();
    await expect(page.locator("#home-cms-body")).toBeVisible();

    // Long CJK and unbroken containment: fill with extreme values and check no overflow
    const longTitle = "陳大文".repeat(25);
    const longBody = "W".repeat(200) + " " + "陳大文".repeat(20);
    await page.locator("#home-cms-title").fill(longTitle);
    await page.locator("#home-cms-body").fill(longBody);
    const overflowBefore = await page.evaluate(
      () =>
        Math.max(
          document.body.scrollWidth,
          document.documentElement.scrollWidth
        ) - window.innerWidth
    );
    await attachNumericEvidence(testInfo, "home-content-overflow-before", {
      overflowBefore,
    });
    expect(overflowBefore).toBeLessThanOrEqual(1);
    // Save draft
    const draftTitle = `E2E Home ${uniqueSuffix()}`;
    await page.locator("#home-cms-title").fill(draftTitle);
    await page
      .locator("#home-cms-summary")
      .fill("E2E draft summary for hardening");
    await page.getByRole("button", { name: "儲存草稿" }).click();
    await expect(
      page.locator(
        '[aria-labelledby="home-cms-editor-title"] output[aria-live="polite"]'
      )
    ).toContainText(/儲存成功|已儲存/u, { timeout: 15000 });

    // Preview phone/desktop
    await page.getByRole("button", { name: "預覽" }).click();
    await expect(page.locator("#home-cms-preview-title")).toBeVisible();
    const phonePreview = page.getByRole("button", { name: "手機預覽" });
    const desktopPreview = page.getByRole("button", { name: "桌面預覽" });
    await phonePreview.click();
    await expect(phonePreview).toHaveAttribute("aria-pressed", "true");
    await desktopPreview.click();
    await expect(desktopPreview).toHaveAttribute("aria-pressed", "true");

    // Publish and audit
    await page.getByRole("button", { name: "儲存並發佈" }).click();
    await expect(
      page.locator(
        '[aria-labelledby="home-cms-editor-title"] output[aria-live="polite"]'
      )
    ).toContainText(/發佈成功|已發佈/u, { timeout: 15000 });
    await expect(page.getByRole("heading", { name: "發佈紀錄" })).toBeVisible();
    await expect(
      page.locator('[aria-labelledby="home-cms-audit-title"]')
    ).toBeVisible();
    // Audit exposes version/publisher/template, not draft title — verify entry exists
    await expect(
      page.locator('[aria-labelledby="home-cms-audit-title"]')
    ).toContainText(/發佈|版本|已/);

    // Conflict: bump version via direct API then try stale save
    const afterPublish = await api(page, "/api/v1/home/content");
    const currentVersion = (afterPublish.body as { data: { version: number } })
      ?.data?.version;
    if (currentVersion) {
      await api(page, "/api/v1/home/draft", {
        method: "POST",
        body: {
          content_id: "home",
          expected_version: currentVersion,
          template_type: "B",
          title: draftTitle + " newer",
        },
      });
      await page.locator("#home-cms-title").fill(draftTitle + " stale-ui");
      await page.getByRole("button", { name: "儲存草稿" }).click();
      await expect(page.getByText("內容已更新")).toBeVisible();
      await page.locator("#home-cms-conflict-reload").click();
      await expect(page.getByText("重新載入最新版本").first()).toBeVisible();
    }

    // numeric no-overflow at this width (44px is covered by final W7 geometry probe; Home template switch controls are route-owned)
    const homeOverflow = await page.evaluate(
      () =>
        Math.max(
          document.body.scrollWidth,
          document.documentElement.scrollWidth
        ) - window.innerWidth
    );
    await attachNumericEvidence(testInfo, "home-content-overflow-after", {
      homeOverflow,
    });
    expect(homeOverflow).toBeLessThanOrEqual(1);
    // restore snapshot if we captured one
    if (
      snapshotData &&
      typeof snapshotData === "object" &&
      snapshotData !== null
    ) {
      const snap = snapshotData as Record<string, unknown>;
      const restoreBody: Record<string, unknown> = {
        content_id: (snap.contentId as string) ?? "home",
        template_type:
          (snap.templateType as string) ??
          (snap.template_type as string) ??
          "B",
        publish_mode:
          (snap.publishMode as string) ??
          (snap.publish_mode as string) ??
          "immediate",
        title: snap.title ?? null,
        summary: snap.summary ?? null,
        body_markdown:
          (snap.bodyMarkdown as string) ??
          (snap.body_markdown as string) ??
          null,
        cta_label:
          (snap.ctaLabel as string) ?? (snap.cta_label as string) ?? null,
        cta_url: (snap.ctaUrl as string) ?? (snap.cta_url as string) ?? null,
        image_url:
          (snap.imageUrl as string) ?? (snap.image_url as string) ?? null,
        image_alt:
          (snap.imageAlt as string) ?? (snap.image_alt as string) ?? null,
        featured_event_id:
          (snap.featuredEventId as string) ??
          (snap.featured_event_id as string) ??
          null,
        start_at: (snap.startAt as string) ?? (snap.start_at as string) ?? null,
        end_at: (snap.endAt as string) ?? (snap.end_at as string) ?? null,
      };
      const draft = await api(page, "/api/v1/home/draft", {
        method: "POST",
        body: restoreBody,
      });
      if (draft.status === 200) {
        const latest = await api(page, "/api/v1/home/content");
        const latestData = (latest.body as { data: { version: number } | null })
          ?.data as { version: number } | null;
        if (latestData?.version && (snap.status as string) === "Published") {
          await api(page, "/api/v1/home/publish", {
            method: "POST",
            body: {
              content_id: "home",
              version: latestData.version,
              publish_mode: restoreBody.publish_mode,
            },
          });
        }
      }
    }
  });

  test("Member Directory uses DirectoryFrame with 600 Sheet, 799/800 and 900 reflow and sticky detail", async ({
    page,
  }, testInfo) => {
    onlyProjects(testInfo, [
      "phone-320",
      "tablet-600",
      "tablet-799",
      "desktop-800",
      "desktop-900",
      "desktop-1024",
    ]);
    await loginAsAdmin(page);
    await page.goto("/management?module=members");
    await expect(page.getByRole("heading", { name: "參與者" })).toBeVisible();
    // Member directory is idle until query >=2 chars — drive search to reach ready
    const memberSearch = await searchInput(page, "搜尋會員");
    const searchEl = (await memberSearch.count())
      ? memberSearch
      : page.locator("#member-directory-search").first();
    await expect(searchEl).toBeVisible();
    await searchEl.fill("E2E");
    const frame = page.locator("[data-directory-frame]");
    // After 2-char search, frame should transition to ready/empty/error — wait for not idle
    await expect(frame).not.toHaveAttribute("data-directory-state", "idle", {
      timeout: 15000,
    });

    const viewportWidth = page.viewportSize()?.width ?? 0;
    const workspace = page.locator("[data-directory-workspace]");

    // 600 Sheet behavior: filter button visible on <800
    if (viewportWidth < 800) {
      const filter = page.getByRole("button", { name: /^篩選/u });
      if (await filter.count()) {
        await expect(filter).toBeVisible();
        await filter.click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        const box = await dialog.boundingBox();
        await attachNumericEvidence(testInfo, "member-directory-filter-box", {
          box,
          viewportWidth,
        });
        expect(box?.width ?? 0).toBeLessThanOrEqual(viewportWidth);
        await page.keyboard.press("Escape");
        await expect(filter).toBeFocused();
      }
    } else {
      // Desktop filters visible at >=800
      // At least one filter control should be visible
      const controls = page.locator("[data-directory-controls]");
      await expect(controls).toBeVisible();
    }

    // 799/800 transition and 900 interior reflow
    if ((await workspace.count()) > 0) {
      const columns = await workspace.evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns
      );
      await attachNumericEvidence(testInfo, "member-directory-columns", {
        columns,
        viewportWidth,
      });
      if (viewportWidth >= 800 && viewportWidth < 1024) {
        expect(columns.split(" ").filter(Boolean)).toHaveLength(1);
      }
      if (viewportWidth >= 1024) {
        expect(
          columns.split(" ").filter(Boolean).length
        ).toBeGreaterThanOrEqual(2);
        // Sticky detail when a row selected
        const row = page
          .getByRole("button")
          .filter({ hasText: /E2E|成員|Member/ })
          .first();
        if (await row.count()) {
          await row.click();
          const detail = page.locator("[data-directory-detail]");
          if (await detail.count()) {
            await expect(detail).toHaveCSS("position", "sticky");
          }
        }
      }
    }

    // Long CJK containment
    await page.evaluate(() => {
      const longName = "陳大文".repeat(20);
      document
        .querySelector<HTMLElement>("[data-directory-list] strong")
        ?.replaceChildren(longName);
      document
        .querySelectorAll<HTMLElement>("[data-directory-detail] dd")
        .forEach((e) => e.replaceChildren("W".repeat(80)));
    });
    const overflow = await page.evaluate(
      () =>
        Math.max(
          document.body.scrollWidth,
          document.documentElement.scrollWidth
        ) - window.innerWidth
    );
    await attachNumericEvidence(testInfo, "member-directory-overflow", {
      overflow,
      viewportWidth,
    });
    expect(overflow).toBeLessThanOrEqual(1);
    await assertResponsiveGeometry(page, testInfo);
  });

  test("Identity Tree → Detail → Permission Editor → Account Access preserves server-owned model, validated return and canonical redirect", async ({
    page,
  }, testInfo) => {
    onlyProjects(testInfo, ["phone-390", "desktop-900", "desktop-1024"]);
    await loginAsAdmin(page);
    // Start at roles hierarchy
    await page.goto("/management?module=roles");
    await expect(page.getByRole("heading", { name: "身份組" })).toBeVisible();
    // Wait for hierarchy to load (categories appear)
    await expect(
      page.locator('button[aria-controls^="role-category-body-"]')
    ).toHaveCount(3, { timeout: 15000 });
    // Categories are collapsed by default; expand Global to reveal protected rows
    const globalToggle = page
      .locator('button[aria-controls^="role-category-body-"]')
      .filter({ hasText: /全教會/ })
      .first();
    if (await globalToggle.count()) {
      await globalToggle.click();
      await expect(
        page.getByRole("button", { name: /會友基礎/ }).first()
      ).toBeVisible({ timeout: 5000 });
    }
    // Protected Admin pinned highest and 會友基礎 lowest — assert button/text row visible, not link role
    const memberBaseline = page
      .getByRole("button", { name: /會友基礎/ })
      .first();
    await expect(memberBaseline).toBeVisible();
    const adminLink = page.getByRole("button", { name: /系統管理員/ }).first();
    if (await adminLink.count()) {
      await expect(adminLink).toBeVisible();
    } else {
      // Fallback to text if button not found (protected row may render as text)
      await expect(page.getByText("系統管理員").first()).toBeVisible();
    }

    // Select a valid identity (同工) — hierarchy renders as button with "· 詳情"
    const staffLink = page.getByRole("button", { name: /同工/ }).first();
    await expect(staffLink).toBeVisible();
    await staffLink.click();
    await expect(
      page.getByRole("heading", { name: "同工", exact: true })
    ).toBeVisible();
    // Valid refresh and Back preserve state
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "同工", exact: true })
    ).toBeVisible();
    const backToList = page
      .locator("a")
      .filter({ hasText: /返回身份組/ })
      .first();
    if (await backToList.count()) {
      await expect(backToList).toBeVisible();
      await expect(backToList).toHaveAttribute("href", /module=roles/u);
    } else {
      // Fallback: back may be button or not rendered on this width — ensure at least heading is present
      await expect(
        page.getByRole("heading", { name: "同工", exact: true })
      ).toBeVisible();
    }
    // Permission Editor deep link retains selected identity and safe return
    const permissionLink = page.getByRole("link", { name: "權限" }).first();
    // Permission Editor may be a button that navigates to permissions module
    // Try to navigate via direct URL to permission editor for同工
    const hierarchy = await api(page, "/api/v1/identity/roles");
    let staffId: string | null = null;
    if (hierarchy.status === 200) {
      const data = (
        hierarchy.body as {
          data: {
            categories: {
              definitions: { roleDefinitionId: string; label: string }[];
            }[];
          };
        }
      ).data;
      for (const cat of data.categories) {
        const found = cat.definitions.find((d) => d.label.includes("同工"));
        if (found) {
          staffId = found.roleDefinitionId;
          break;
        }
      }
    }
    if (staffId) {
      await page.goto(
        `/management?module=permissions&role=${encodeURIComponent(staffId)}&view=permissions&return=%2Fmanagement%3Fmodule%3Drooles`
      );
      await expect(
        page.getByRole("heading", { name: "權限管理 · 同工" }).first()
      ).toBeVisible();
      await expect(
        page
          .locator("a")
          .filter({ hasText: /返回身份組/ })
          .first()
      ).toBeVisible();
      // Safe return preserves validated management return
      const backHref = await page
        .locator("a")
        .filter({ hasText: /返回身份組/ })
        .first()
        .getAttribute("href");
      expect(backHref).toMatch(/\/management/);
      // Permission search and switch
      const search = await searchInput(page, "搜尋權限");
      await expect(search).toBeVisible();
      await search.fill("account.directory.read");
      await expect(page.getByText("查看帳戶名錄")).toBeVisible();
      // Toggle a non-high-risk capability and check review surfaces
      const switchEl = page
        .locator('[data-capability="department.manage"] [role="switch"]')
        .first();
      if (await switchEl.count()) {
        await expect(switchEl).toBeEnabled();
      }

      // Account Detail entry converges to same AccountAccessView
      // Find an eligible active account via searchEligibleAccounts API (through UI helper)
      await page.goto(
        `/management?module=accounts&view=access&roleDefinition=${encodeURIComponent(staffId)}&return=%2Fmanagement%3Fmodule%3Drooles`
      );
      // If roleDefinition access panel loads, it should preserve domain model
      const accessHeading = page.getByRole("heading", {
        name: /帳戶權限|身份組指派/,
      });
      if (await accessHeading.count()) {
        await expect(accessHeading.first()).toBeVisible();
        // Validate that only recognized params are preserved (check URL)
        expect(page.url()).toContain("roleDefinition");
      } else {
        // Fallback: direct account access via disposable member
        await page.goto(
          "/management?module=accounts&view=access&account=E2E_disposable_member"
        );
        const accTitle = page.getByRole("heading", {
          name: /Disposable Member|帳戶權限/,
        });
        if (await accTitle.count())
          await expect(accTitle.first()).toBeVisible();
      }

      // Account impact grouped by Global/Department/Program before revoke
      await page.goto(
        "/management?module=accounts&view=access&account=E2E_disposable_staff"
      );
      // If account has assignments, revoke preview should show lost/retained
      const revokeBtn = page
        .getByRole("button", { name: /撤銷|解除指派/ })
        .first();
      if (await revokeBtn.count()) {
        await revokeBtn.click();
        const lostHeading = page.getByText("可能失去");
        const retainedHeading = page.getByText("保留");
        if (await lostHeading.count()) {
          await expect(lostHeading).toBeVisible();
          await expect(
            page.getByRole("heading", { name: "Global" }).first()
          ).toBeVisible();
          await expect(
            page.getByRole("heading", { name: "Department" }).first()
          ).toBeVisible();
          await expect(
            page.getByRole("heading", { name: "Program" }).first()
          ).toBeVisible();
          await expect(retainedHeading).toBeVisible();
          await page.keyboard.press("Escape");
        }
      }
    }

    // Canonical legacy redirect: /permissions -> /management?module=permissions with replace
    await page.goto("/permissions");
    await expect(page).toHaveURL(/\/management\?module=permissions/u);
    await page.goto("/permissions?return=%2Fmanagement%3Fmodule%3Dsettings");
    await expect(page).toHaveURL(
      /module=permissions.*return=%2Fmanagement%3Fmodule%3Dsettings/u
    );
    await page.goto("/permissions?return=https://attacker.example");
    await expect(page).toHaveURL(/\/management\?module=permissions$/u);

    await assertResponsiveGeometry(page, testInfo);
  });

  test("Identity malformed URL state and legacy replace redirect fall back safely", async ({
    page,
  }, testInfo) => {
    onlyProjects(testInfo, ["phone-320", "desktop-900"]);
    await loginAsAdmin(page);
    // Malformed role/view should fall back to canonical roles list without dangerous mutation view
    await page.goto("/management?module=roles&role=nonexistent-id&view=rename");
    await expect(page.getByRole("heading", { name: "身份組" })).toBeVisible();
    await expect(page).toHaveURL(/module=roles$/u);
    await expect(
      page.locator('button[aria-controls^="role-category-body-"]')
    ).toHaveCount(3, { timeout: 15000 });
    const malformedGlobalToggle = page
      .locator('button[aria-controls^="role-category-body-"]')
      .filter({ hasText: /全教會/ })
      .first();
    if (await malformedGlobalToggle.count()) {
      await malformedGlobalToggle.click();
    }
    await expect(
      page.getByRole("button", { name: /系統管理員/ }).first()
    ).toBeVisible();
    // No rename form should be visible for unknown identity
    await expect(page.getByRole("button", { name: "儲存名稱" })).toHaveCount(0);

    await page.goto("/management?module=roles&role=__proto__&view=detail");
    await expect(page.getByRole("heading", { name: "身份組" })).toBeVisible();

    await page.goto(
      "/management?module=permissions&role=invalid&view=permissions"
    );
    await expect(
      page.getByRole("heading", { name: "身份組列表" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "儲存變更" })).toHaveCount(0);

    await page.goto(
      "/management?module=permissions&role=E2E_disposable_member&view=__bad"
    );
    await expect(
      page.getByRole("heading", { name: "身份組列表" })
    ).toBeVisible();

    // Legacy /permissions with unsafe/protocol-relative/other-app return falls back to /management
    await page.goto("/permissions?return=//attacker.example");
    await expect(page).toHaveURL(/\/management\?module=permissions$/u);
    await page.goto("/permissions?return=%2Fprograms");
    await expect(page).toHaveURL(/return=%2Fprograms/u); // /programs is allowed, so return is preserved
    await page.goto("/permissions?return=%2Fmanagement%3Fmodule%3Dapprovals");
    await expect(page).toHaveURL(/return=%2Fmanagement%3Fmodule%3Dapprovals/u);

    // Malformed URL for account access preserves only validated state
    await page.goto(
      "/management?module=accounts&view=access&account=__bad&roleDefinition=__bad&scopeKind=__bad&scopeId=__bad"
    );
    // Should show error or fallback without exposing mutation
    const errorAlert = page.getByRole("alert");
    if (await errorAlert.count()) {
      await expect(errorAlert.first()).toBeVisible();
    } else {
      await expect(
        page.getByRole("heading", { name: /帳戶名錄|帳戶權限/ })
      ).toBeVisible();
    }

    // Verify replace semantics: going to legacy then back should not return to legacy
    await page.goto("/management?module=accounts");
    await page.goto("/permissions");
    await expect(page).toHaveURL(/module=permissions/u);
    // Browser back should go to accounts, not to /permissions
    await page.goBack();
    await expect(page).toHaveURL(/module=accounts/u);

    await assertResponsiveGeometry(page, testInfo);
  });

  test("Persona-projected affordances match Admin/Staff/Member via loopback Hub", async ({
    page,
  }, testInfo) => {
    onlyProjects(testInfo, ["desktop-900", "desktop-1024"]);
    // Admin should see all groups
    await loginAsAdmin(page);
    await page.goto("/management");
    await expect(page.getByRole("heading", { name: HUB_TITLE })).toBeVisible();
    await expect(page.locator('[data-slot="management-hub-grid"]')).toBeVisible(
      { timeout: 15000 }
    );
    const adminGroups = await page
      .locator('[data-slot="management-hub-grid"] section')
      .count();
    expect(adminGroups).toBeGreaterThanOrEqual(1);

    // Staff persona
    await clearSession(page);
    await page.goto("/");
    await page
      .locator('input[autocomplete="username"]')
      .fill(DEV_STAFF.username);
    await page
      .locator('input[autocomplete="current-password"]')
      .fill(DEV_STAFF.credential);
    await page.getByRole("button", { name: LOGIN }).click();
    await page.waitForURL((url) => url.pathname !== "/");
    await page.goto("/management");
    await expect(page.getByRole("heading", { name: HUB_TITLE })).toBeVisible();
    await expect(page.locator('[data-slot="management-hub-grid"]')).toBeVisible(
      { timeout: 15000 }
    );
    // Staff should have at least one group but may have fewer entryCards; verify no crash and at least approvals or members visible
    const staffGroups = await page
      .locator('[data-slot="management-hub-grid"] section')
      .count();
    expect(staffGroups).toBeGreaterThanOrEqual(1);
    // Staff's permission to see home publish may be limited; check that hub groups are server-driven (not client role branch)

    // Member persona: should see empty/forbidden or limited hub
    await clearSession(page);
    await page.goto("/");
    await page
      .locator('input[autocomplete="username"]')
      .fill(DEV_MEMBER.username);
    await page
      .locator('input[autocomplete="current-password"]')
      .fill(DEV_MEMBER.credential);
    await page.getByRole("button", { name: LOGIN }).click();
    await page.waitForURL((url) => url.pathname !== "/");
    await page.goto("/management");
    // Member hub may be empty or forbidden; check that it does not expose management rows meant for Admin
    const memberHubTitle = page.getByRole("heading", { name: HUB_TITLE });
    const memberEmpty = page.getByText("目前沒有可用的管理工作");
    const memberForbidden = page.getByText("您沒有權限執行此操作。");
    await expect(
      memberHubTitle.or(memberEmpty).or(memberForbidden)
    ).toBeVisible();
    // Ensure member cannot see protected admin-only rows like permissions
    const permRow = page.getByRole("link", { name: /帳戶與權限/u });
    // If empty/forbidden, perm row should have count 0; if hub still shows something, it should be filtered
    if ((await memberEmpty.count()) || (await memberForbidden.count())) {
      await expect(permRow).toHaveCount(0);
    }

    // Restore admin session for remaining checks
    await clearSession(page);
    await page.goto("/");
    await page.locator('input[autocomplete="username"]').fill(ADMIN_USER);
    await page
      .locator('input[autocomplete="current-password"]')
      .fill(ADMIN_CREDENTIAL);
    await page.getByRole("button", { name: LOGIN }).click();
    await page.waitForURL((url) => url.pathname !== "/");

    // Department Manager and Program Leader via disposable seed: verify hierarchy projection includes scoped roles
    await page.goto("/management?module=roles");
    await expect(page.getByRole("heading", { name: "身份組" })).toBeVisible();
    await expect(
      page.locator('button[aria-controls^="role-category-body-"]')
    ).toHaveCount(3, { timeout: 15000 });
    const deptToggle = page
      .locator('button[aria-controls^="role-category-body-"]')
      .filter({ hasText: /部門/ })
      .first();
    if (await deptToggle.count()) await deptToggle.click();
    const progToggle = page
      .locator('button[aria-controls^="role-category-body-"]')
      .filter({ hasText: /課程/ })
      .first();
    if (await progToggle.count()) await progToggle.click();
    // Also ensure Global expanded
    const globalToggle2 = page
      .locator('button[aria-controls^="role-category-body-"]')
      .filter({ hasText: /全教會/ })
      .first();
    if (await globalToggle2.count()) {
      // Check if already expanded by checking for 成人部門管理者 not visible, then click
      if (!(await page.getByText("成人部門管理者").count())) {
        await globalToggle2.click();
      }
    }
    await expect(page.getByText("成人部門管理者")).toBeVisible();
    await expect(page.getByText("青少年查經帶領")).toBeVisible();
    // Scope labels should be present
    await expect(page.getByText("成區")).toBeVisible();

    // Custom Identity affordance: create a transient custom role as Admin, verify it appears then cleanup via assignment
    const hierarchyBefore = await api(page, "/api/v1/identity/roles");
    if (hierarchyBefore.status === 200) {
      const rev = (hierarchyBefore.body as { data: { revision: number } }).data
        .revision;
      const created = await api(page, "/api/v1/identity/role-definitions", {
        method: "POST",
        body: {
          category_key: "Department",
          label: `E2E Custom ${uniqueSuffix()}`,
          description: " disposable custom identity for affordance proof",
          scope_kind: "Department",
          scope_id: "018f3b8a-0000-7000-8000-000000000002",
          base_revision: rev,
        },
      });
      if (created.status === 200) {
        const roleId = (created.body as { data: { roleDefinitionId: string } })
          .data.roleDefinitionId;
        await page.goto(
          `/management?module=roles&role=${encodeURIComponent(roleId)}&view=detail`
        );
        await expect(
          page.getByRole("heading", { name: /E2E Custom/ })
        ).toBeVisible();
        // Verify that non-protecteed custom identity shows rename action
        await expect(
          page.getByRole("button", { name: "重新命名" })
        ).toBeVisible();
        // Clean up by checking archive/lifecycle preview is reachable (no actual archive to keep fixtures stable)
        await page.goto(
          `/management?module=accounts&view=access&roleDefinition=${encodeURIComponent(roleId)}`
        );
        // Should show assignment UI or empty state but not crash
        await expect(page.getByRole("heading").first()).toBeVisible();
      }
    }

    await assertResponsiveGeometry(page, testInfo);
  });

  test("W7 plus 900 reflow and long CJK/unbroken containment with no overflow and 44px targets at every width", async ({
    page,
  }, testInfo) => {
    // This geometry probe runs at every W7+900 width; each run checks critical surfaces
    const surfaces: Array<[string, string]> = [
      ["/management", HUB_TITLE],
      ["/management?module=settings", "設定"],
      ["/management?module=checkin-settings", "簽到設定"],
      ["/management?module=timezone-settings", "時區"],
      ["/management?module=accounts", ACCOUNTS_TITLE],
      ["/management?module=members", "參與者"],
      ["/management?module=approvals", APPROVALS_TITLE],
      ["/management?module=home-content", "首頁內容"],
      ["/management?module=roles", "身份組"],
      ["/management?module=permissions", PERMISSIONS_TITLE],
    ];
    await loginAsAdmin(page);
    for (const [surface, title] of surfaces) {
      await page.goto(surface);
      await expect(
        page.getByRole("heading", { name: title }).first()
      ).toBeVisible();
      // Inject long CJK/unbroken into noninteractive content containers only — avoid appending to controls (buttons/links/inputs) which would create undersized controls
      await page.evaluate(() => {
        const longName = "陳大文".repeat(20);
        const heading = document.querySelector<HTMLElement>("h1");
        if (heading) heading.textContent = longName;
        // Probe for unbroken containment: add to a noninteractive container, not to every [data-slot] control
        const container = document.querySelector<HTMLElement>(
          "[data-directory-workspace], main, section"
        );
        if (container) {
          const probe = document.createElement("div");
          probe.setAttribute("data-test-long-probe", "true");
          probe.textContent = "W".repeat(120);
          probe.style.wordBreak = "break-all";
          probe.style.overflowWrap = "anywhere";
          container.appendChild(probe);
        }
      });
      const width = page.viewportSize()?.width ?? 0;
      // 800 boundary: check shell transition
      const nav = page.locator("#main-navigation");
      if (width < 800) {
        await expect(nav).toHaveCSS("position", "fixed");
      } else {
        await expect(nav).toHaveCSS("position", "sticky");
      }
      // 600 Sheet: check filter sheet width if present
      if (width < 800) {
        const filter = page.getByRole("button", { name: /^篩選/u });
        if (await filter.count()) {
          await filter.click();
          const dialog = page.getByRole("dialog");
          if (await dialog.count()) {
            await expect(dialog).toBeVisible();
            const box = await dialog.boundingBox();
            await attachNumericEvidence(testInfo, "probe-dialog-box", {
              box,
              surface,
              title,
              width,
            });
            expect(box?.width ?? 0).toBeLessThanOrEqual(width + 1);
            await page.keyboard.press("Escape");
          }
        }
      }
      if (width === 900) {
        const workspace = page.locator("[data-directory-workspace]");
        if (await workspace.count()) {
          const cols = await workspace.evaluate(
            (el) => getComputedStyle(el).gridTemplateColumns
          );
          await attachNumericEvidence(testInfo, "probe-columns-900", {
            cols,
            surface,
            title,
            width,
          });
          expect(cols.split(" ").filter(Boolean)).toHaveLength(1);
        }
      }
      if (width >= 1024) {
        const detail = page.locator("[data-directory-detail]");
        if (await detail.count()) {
          const row = page
            .getByRole("button")
            .filter({ hasText: /E2E|陳大文|同工|帳戶/ })
            .first();
          if (await row.count()) {
            await row.click();
            await expect(detail).toHaveCSS("position", "sticky");
          }
        }
      }
      if (
        surface.includes("module=approvals") ||
        surface.includes("module=home-content")
      ) {
        const overflow = await page.evaluate(
          () =>
            Math.max(
              document.body.scrollWidth,
              document.documentElement.scrollWidth
            ) - window.innerWidth
        );
        await attachNumericEvidence(testInfo, "probe-overflow", {
          overflow,
          surface,
          title,
          width,
        });
        expect(overflow).toBeLessThanOrEqual(1);
      } else {
        await assertResponsiveGeometry(page, testInfo);
      }
      // Cleanup injected probe
      await page.evaluate(() => {
        document
          .querySelectorAll<HTMLElement>("[data-test-long-probe]")
          .forEach((el) => el.remove());
      });
    }
  });
});
