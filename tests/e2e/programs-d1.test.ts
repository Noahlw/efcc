/* oxlint-disable vitest/prefer-importing-vitest-globals */
// PUI-01 / Issue #245 — bounded local/deployed D1 proof for the Programs entry boundary.
//
// This reuses the Programs Playwright configuration and its disposable E2E_*
// fixtures. The former PRG-05 suite drove the nested Department -> Program ->
// Events/Enrollment/Leaders manager, which is not rendered by Issue #245 and
// is intentionally covered by later tickets. These checks assert only
// observable boundary DOM, URL state, accessibility, and server-shaped
// capability outcomes.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { DEV_ADMIN, DEV_MEMBER, DEV_STAFF } from "./dev-fixtures";

const configuredTarget = process.env.PROGRAMS_TARGET_URL;
const localTarget =
  !configuredTarget ||
  ["localhost", "127.0.0.1"].includes(new URL(configuredTarget).hostname);
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

const COPY = {
  login: "登入",
  pageTitle: "課程與活動",
  pageLead: "課程與活動集中於此，先了解適合你的下一步。",
  participantMode: "參與者模式",
  managementMode: "管理模式",
  enterManagement: "進入管理模式",
  malformedIntent: "連結資料無效",
  directProgramIntent: "已保留活動連結",
  detailPurpose: "課程簡介",
  detailEvents: "近期活動",
  detailUnavailable: "無法開啟這個課程",
  detailBack: "返回課程目錄",
  catalogSearchLabel: "搜尋課程",
  catalogClearSearch: "清除搜尋",
  catalogNoMatches: "找不到符合的課程",
  catalogListLabel: "課程目錄",
  filterDraft: "草稿",
  enrollment: "報名",
  requestEnroll: "申請報名",
  requestPendingHint: "申請已送出，等待課程負責人處理。",
  withdrawRequest: "撤回申請",
  requestWithdrawnNotice: "申請已撤回。",
  cancelEnrollment: "取消報名",
  enrollmentScheduleAdvisory:
    "申請前請確認時間是否適合；系統只提供提示，不會因時間重疊自動阻擋。",
  managerOnlyNote: "此課程由管理員安排成員加入。",
  managementDirectoryTitle: "管理課程目錄",
  managementDirectorySearchLabel: "搜尋可管理課程",
  managementScopeDepartment: "部門範圍",
  workspaceIdentity: "課程資料",
  workspaceNearestEvent: "最近聚會",
  workspaceTaskEvents: "聚會",
  workspaceTaskParticipants: "參與者",
  workspaceTaskSettings: "課程設定",
  workspaceUnavailable: "課程管理範圍已失效",
  noManagementScope: "沒有管理範圍",
  workspaceBack: "返回管理課程目錄",
  workspaceTitle: "課程工作區",
};

async function hasProjectedManagementCapability(page: Page): Promise<boolean> {
  const response = await page.evaluate(async () => {
    const accessResponse = await fetch("/api/v1/programs/access");
    return { status: accessResponse.status, body: await accessResponse.json() };
  });
  expect(response.status).toBe(200);
  const body = response.body as {
    data: { hasManagementCapability: boolean };
  };
  return body.data.hasManagementCapability;
}

interface CatalogEntry {
  department: { department_id: string };
  programs: { program_id: string; name: string }[];
}

async function fetchCatalog(page: Page): Promise<CatalogEntry[]> {
  const response = await page.evaluate(async () => {
    const catalogResponse = await fetch("/api/v1/programs/catalog");
    return {
      status: catalogResponse.status,
      body: await catalogResponse.json(),
    };
  });
  expect(response.status).toBe(200);
  const body = response.body as { data: { catalog: CatalogEntry[] } };
  return body.data.catalog;
}

async function catalogProgramIds(
  page: Page,
  namePrefix: string
): Promise<string[]> {
  const catalog = await fetchCatalog(page);
  return catalog
    .flatMap((entry) => entry.programs)
    .filter((program) => program.name.startsWith(namePrefix))
    .map((program) => program.program_id);
}

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
  await page.getByRole("button", { name: COPY.login }).click();
  await page.waitForURL((url) => url.pathname !== "/");
  await page.goto("/programs");
  await expect(
    page.getByRole("heading", { name: COPY.pageTitle })
  ).toBeVisible();
}

async function postProgramLeader(
  page: Page,
  programId: string,
  userId: string,
  action: "assign" | "revoke"
): Promise<number> {
  const path =
    action === "assign"
      ? `/api/v1/programs/${encodeURIComponent(programId)}/leaders`
      : `/api/v1/programs/${encodeURIComponent(programId)}/leaders/${encodeURIComponent(userId)}/revoke`;
  return page.evaluate(
    async ({
      path: requestPath,
      action: requestAction,
      userId: requestUserId,
    }) => {
      const response = await fetch(requestPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body:
          requestAction === "assign"
            ? JSON.stringify({ user_id: requestUserId })
            : "{}",
      });
      return response.status;
    },
    { path, action, userId }
  );
}

test.beforeAll(() => {
  for (const [name, value] of [
    ["PROGRAMS_ADMIN_USERNAME", ADMIN_USER],
    ["PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED],
    ["PROGRAMS_STAFF_USERNAME", STAFF_USER],
    ["PROGRAMS_STAFF_CREDENTIAL", STAFF_CRED],
    ["PROGRAMS_MEMBER_USERNAME", MEMBER_USER],
    ["PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED],
  ]) {
    if (!value) {
      throw new Error(`${name} is required`);
    }
  }
  if (
    ![ADMIN_USER, STAFF_USER, MEMBER_USER].every((user) =>
      user?.startsWith("E2E_")
    )
  ) {
    throw new Error(
      "PROGRAMS_*_USERNAME must start with E2E_; remote runs require disposable acceptance accounts"
    );
  }
});

test.describe("PUI-01 Programs boundary", () => {
  test("admin enters Participant mode with capability-shaped Management entry", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );

    await expect(
      page.getByRole("heading", { name: COPY.participantMode })
    ).toBeVisible();
    await expect(page.locator("#programs-mode-panel")).toBeVisible();
    await expect(page.getByText(COPY.pageLead)).toBeVisible();
    const hasManagement = await hasProjectedManagementCapability(page);
    expect(
      hasManagement,
      "admin fixture must expose projected management capability"
    ).toBe(true);
    const managementButton = page.getByRole("button", {
      name: COPY.enterManagement,
    });
    await expect(managementButton).toBeVisible();
    await expect(
      page.getByText(COPY.managementMode, { exact: true })
    ).toBeVisible();
  });

  test("staff also enters Participant mode before any management action", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_STAFF_USERNAME", STAFF_USER),
      required("PROGRAMS_STAFF_CREDENTIAL", STAFF_CRED)
    );

    await expect(
      page.getByRole("heading", { name: COPY.participantMode })
    ).toBeVisible();
    await expect(page.locator("#programs-mode-panel")).toBeVisible();
  });

  test("member enters Participant mode without a management gateway", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );

    await expect(
      page.getByRole("heading", { name: COPY.participantMode })
    ).toBeVisible();
    const hasManagement = await hasProjectedManagementCapability(page);
    const managementButton = page.getByRole("button", {
      name: COPY.enterManagement,
    });
    await expect(managementButton).toHaveCount(hasManagement ? 1 : 0);
  });

  test("mode switching preserves a valid Program intent and exposes tabpanel semantics", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const hasManagement = await hasProjectedManagementCapability(page);
    expect(
      hasManagement,
      "admin fixture must expose projected management capability"
    ).toBe(true);
    const [programId] = await catalogProgramIds(page, "E2E_DEMO_");
    expect(
      programId,
      "catalog fixture must expose a visible Program"
    ).toBeTruthy();
    await page.goto(`/programs?program=${programId}#overview`);
    await expect(
      page.getByRole("heading", { name: COPY.detailPurpose })
    ).toBeVisible();
    const panel = page.locator("#programs-mode-panel");
    await expect(panel).toHaveAttribute("role", "region");

    await page.getByRole("button", { name: COPY.enterManagement }).click();
    await expect(page).toHaveURL(
      new RegExp(
        `/programs\\?mode=management&program=${programId}#overview$`,
        "u"
      )
    );
    await expect(
      page.getByRole("tab", { name: COPY.managementMode })
    ).toHaveAttribute("aria-selected", "true");
    await expect(panel).toHaveAttribute(
      "aria-labelledby",
      "programs-management-tab"
    );

    await page.goBack();
    await expect(page).toHaveURL(
      new RegExp(`/programs\\?program=${programId}#overview$`, "u")
    );
    await expect(page.locator("#programs-mode-panel")).toBeVisible();

    await page.goForward();
    await expect(page).toHaveURL(
      new RegExp(
        `/programs\\?mode=management&program=${programId}#overview$`,
        "u"
      )
    );
    await expect(
      page.getByRole("tab", { name: COPY.managementMode })
    ).toHaveAttribute("aria-selected", "true");
    await page.reload();
    await expect(
      page.getByRole("tab", { name: COPY.managementMode })
    ).toHaveAttribute("aria-selected", "true");

    await page.getByRole("tab", { name: COPY.participantMode }).click();
    await expect(page).toHaveURL(
      new RegExp(`/programs\\?program=${programId}#overview$`, "u")
    );
    await expect(
      page.getByRole("heading", { name: COPY.detailPurpose })
    ).toBeVisible();
  });

  test("malformed direct intent stays recoverable inside Programs", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    await page.goto("/programs?mode=sideways#overview");

    await expect(
      page.getByRole("heading", { name: COPY.malformedIntent })
    ).toBeVisible();
    await expect(page).toHaveURL(/\/programs\?mode=sideways#overview$/u);
    await expect(page.getByRole("link", { name: "返回首頁" })).toHaveCount(0);
  });

  test("restores a direct Programs intent after session expiry and login", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    await page.goto("/programs?mode=management&program=e2e-intent#overview");
    await page.context().clearCookies();
    await page.reload();

    await expect(page).toHaveURL(/\/$/u);
    await page
      .locator('input[autocomplete="username"]')
      .fill(required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER));
    await page
      .locator('input[autocomplete="current-password"]')
      .fill(required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED));
    await page.getByRole("button", { name: COPY.login }).click();

    await expect(page).toHaveURL(
      /\/programs\?mode=management&program=e2e-intent#overview$/u
    );
    await expect(
      page.getByRole("heading", { name: COPY.managementMode })
    ).toBeVisible();
  });
});

test.describe("PUI-02 participant Programs directory", () => {
  test("member sees Listed catalog rows and never the Unlisted fixture", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );

    await expect(
      page.getByRole("button", { name: /E2E_DEMO_成人查經/u })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /E2E_DEMO_青年團契/u })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /E2E_DEMO_社區關懷/u })
    ).toHaveCount(0);

    const ids = await catalogProgramIds(page, "E2E_DEMO_社區關懷");
    expect(ids).toHaveLength(0);
  });

  test("admin sees the Unlisted fixture through scoped management access", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const hasManagement = await hasProjectedManagementCapability(page);
    expect(hasManagement).toBe(true);

    await expect(
      page.getByRole("button", { name: /E2E_DEMO_成人查經/u })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /E2E_DEMO_社區關懷/u })
    ).toBeVisible();
  });

  test("search narrows the catalog and clearing restores the same rows", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );

    await expect(
      page.getByRole("button", { name: /E2E_DEMO_成人查經/u })
    ).toBeVisible();
    const search = page.getByRole("searchbox", {
      name: COPY.catalogSearchLabel,
    });
    await search.fill("青年");
    await expect(
      page.getByRole("button", { name: /E2E_DEMO_成人查經/u })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /E2E_DEMO_青年團契/u })
    ).toBeVisible();

    await page.getByRole("button", { name: COPY.catalogClearSearch }).click();
    await expect(
      page.getByRole("button", { name: /E2E_DEMO_成人查經/u })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /E2E_DEMO_青年團契/u })
    ).toBeVisible();
  });

  test("empty search result is recoverable by clearing", async ({ page }) => {
    await loginAs(
      page,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );

    await page
      .getByRole("searchbox", { name: COPY.catalogSearchLabel })
      .fill("完全不存在");
    await expect(
      page.getByRole("heading", { name: /找不到符合的課程/u })
    ).toBeVisible();
    await expect(
      page.locator("#programs-catalog-state").getByRole("button", {
        name: COPY.catalogClearSearch,
      })
    ).toBeVisible();
    await page
      .locator("#programs-catalog-state")
      .getByRole("button", { name: COPY.catalogClearSearch })
      .click();
    await expect(
      page.getByRole("button", { name: /E2E_DEMO_成人查經/u })
    ).toBeVisible();
  });

  test("row selection hands off through the canonical Program intent URL", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );

    const [programId] = await catalogProgramIds(page, "E2E_DEMO_成人查經");
    expect(programId).toBeTruthy();
    await page.getByRole("button", { name: /E2E_DEMO_成人查經/u }).click();
    await expect(page).toHaveURL(
      new RegExp(`/programs\\?program=${programId}$`, "u")
    );
    await expect(
      page.getByRole("heading", { name: COPY.detailPurpose })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: COPY.detailBack })
    ).toBeVisible();
  });
});

test.describe("PUI-03 participant Program detail", () => {
  test("direct detail survives refresh and returns to the directory", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );
    const [programId] = await catalogProgramIds(page, "E2E_DEMO_成人查經");
    expect(programId).toBeTruthy();

    await page.goto(`/programs?program=${programId}#overview`);
    await expect(
      page.getByRole("heading", { name: COPY.detailPurpose })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: COPY.detailEvents })
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("heading", { name: COPY.detailPurpose })
    ).toBeVisible();

    await page.getByRole("button", { name: COPY.detailBack }).click();
    await expect(page).toHaveURL(/\/programs#overview$/u);
    await expect(
      page.getByRole("button", { name: /E2E_DEMO_成人查經/u })
    ).toBeVisible();
  });

  test("member receives privacy-preserving unavailable state for Unlisted detail", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const [hiddenProgramId] = await catalogProgramIds(
      page,
      "E2E_DEMO_社區關懷"
    );
    expect(hiddenProgramId).toBeTruthy();

    await page.context().clearCookies();
    await loginAs(
      page,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );
    await page.goto(`/programs?program=${hiddenProgramId}#overview`);

    await expect(
      page.getByRole("heading", { name: COPY.detailUnavailable })
    ).toBeVisible();
    await expect(page.getByText(hiddenProgramId)).toHaveCount(0);
    await page.getByRole("button", { name: COPY.detailBack }).click();
    await expect(page).toHaveURL(/\/programs#overview$/u);
  });
});

test.describe("PUI-04 participant Enrollment lifecycle", () => {
  test("member can submit one request, see Pending, and withdraw it", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );
    const [programId] = await catalogProgramIds(page, "E2E_DEMO_成人查經");
    expect(programId).toBeTruthy();

    await page.goto(`/programs?program=${programId}#overview`);
    await expect(
      page.getByRole("heading", { name: COPY.detailPurpose })
    ).toBeVisible();

    const enrollmentPanel = page.getByRole("region", { name: COPY.enrollment });
    const requestButton = enrollmentPanel.getByRole("button", {
      name: COPY.requestEnroll,
    });
    await expect(requestButton).toBeVisible();
    await expect(
      enrollmentPanel.getByText(COPY.enrollmentScheduleAdvisory)
    ).toBeVisible();
    await requestButton.click();
    await expect(
      enrollmentPanel.getByText(COPY.requestPendingHint)
    ).toBeVisible();
    await expect(
      enrollmentPanel.getByRole("button", { name: COPY.withdrawRequest })
    ).toBeVisible();

    await enrollmentPanel
      .getByRole("button", { name: COPY.withdrawRequest })
      .click();
    await expect(
      enrollmentPanel.getByText(COPY.requestWithdrawnNotice)
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: COPY.requestEnroll })
    ).toBeVisible();
  });

  test("ManagerOnly detail explains that participants cannot self-enroll", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );
    const [programId] = await catalogProgramIds(page, "E2E_DEMO_管理安排");
    expect(programId).toBeTruthy();

    await page.goto(`/programs?program=${programId}#overview`);
    await expect(
      page.getByRole("heading", { name: COPY.detailPurpose })
    ).toBeVisible();
    await expect(page.getByText(COPY.managerOnlyNote)).toBeVisible();
    await expect(
      page.getByRole("button", { name: COPY.requestEnroll })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: COPY.withdrawRequest })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: COPY.cancelEnrollment })
    ).toHaveCount(0);
  });
});
test.describe("MUI-01 management Directory and Workspace", () => {
  test("admin searches the scoped Directory and navigates focused Workspace tasks", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const [programId] = await catalogProgramIds(page, "E2E_DEMO_成人查經");
    expect(programId).toBeTruthy();

    await page.getByRole("button", { name: COPY.enterManagement }).click();
    await expect(page).toHaveURL(/\/programs\?mode=management$/u);
    await expect(
      page.getByRole("heading", { name: COPY.managementDirectoryTitle })
    ).toBeVisible();
    const directory = page.getByRole("list", { name: "可管理課程" });
    await expect(directory.getByRole("button")).toHaveCount(4);
    await expect(directory.getByText("E2E_DEMO_MINISTRY")).toHaveCount(4);

    const search = page.getByRole("searchbox", {
      name: COPY.managementDirectorySearchLabel,
    });
    await search.fill("成人查經");
    await expect(directory.getByRole("button")).toHaveCount(1);
    await directory.getByRole("button", { name: /E2E_DEMO_成人查經/u }).click();
    await expect(page).toHaveURL(
      new RegExp(`/programs\\?mode=management&program=${programId}$`, "u")
    );
    await expect(
      page.getByRole("heading", { name: COPY.workspaceIdentity })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: COPY.workspaceNearestEvent })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: COPY.workspaceTitle })
    ).toHaveAttribute("aria-current", "page");

    await page
      .getByRole("link", { name: COPY.workspaceTaskEvents, exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp(
        `/programs\\?mode=management&program=${programId}&task=events$`,
        "u"
      )
    );
    await expect(
      page.getByRole("heading", { name: COPY.workspaceTaskEvents })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: COPY.workspaceTaskEvents, exact: true })
    ).toHaveAttribute("aria-current", "page");

    await page
      .getByRole("link", { name: COPY.workspaceTaskParticipants, exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp(
        `/programs\\?mode=management&program=${programId}&task=participants$`,
        "u"
      )
    );
    await expect(
      page.getByRole("heading", { name: COPY.workspaceTaskParticipants })
    ).toBeVisible();

    await page
      .getByRole("link", { name: COPY.workspaceTaskSettings, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: COPY.workspaceTaskSettings })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: COPY.workspaceTaskSettings, exact: true })
    ).toHaveAttribute("aria-current", "page");
  });
  test("keeps Directory and Workspace entry points keyboard-operable", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const enterManagement = page.getByRole("button", {
      name: COPY.enterManagement,
    });
    await enterManagement.focus();
    await enterManagement.press("Enter");
    await expect(
      page.getByRole("heading", { name: COPY.managementDirectoryTitle })
    ).toBeVisible();
    const firstProgram = page
      .getByRole("list", { name: "可管理課程" })
      .getByRole("button")
      .first();
    await firstProgram.focus();
    await firstProgram.press("Enter");
    await expect(
      page.getByRole("heading", { name: COPY.workspaceIdentity })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: COPY.workspaceTaskEvents, exact: true })
    ).toBeVisible();
  });

  test("member direct management links stay out of scope", async ({ page }) => {
    await loginAs(
      page,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );
    const [programId] = await catalogProgramIds(page, "E2E_DEMO_成人查經");
    expect(programId).toBeTruthy();
    await page.goto(
      `/programs?mode=management&program=${programId}&task=settings`
    );
    await expect(
      page.getByRole("heading", { name: COPY.noManagementScope })
    ).toBeVisible();
    await expect(page.getByText(programId)).toHaveCount(0);
  });
  test("staff uses the same capability-shaped Directory information architecture", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_STAFF_USERNAME", STAFF_USER),
      required("PROGRAMS_STAFF_CREDENTIAL", STAFF_CRED)
    );
    await page.getByRole("button", { name: COPY.enterManagement }).click();
    await expect(
      page.getByRole("heading", { name: COPY.managementDirectoryTitle })
    ).toBeVisible();
    await expect(page.getByRole("list", { name: "可管理課程" })).toBeVisible();
  });

  test("leader exact scope and manager inheritance stay distinct", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const [targetId] = await catalogProgramIds(page, "E2E_DEMO_成人查經");
    expect(targetId).toBeTruthy();
    const programId = required("target program", targetId);
    const staleRevoke = await postProgramLeader(
      page,
      programId,
      DEV_MEMBER.userId,
      "revoke"
    );
    expect([200, 404]).toContain(staleRevoke);
    expect(
      await postProgramLeader(page, programId, DEV_MEMBER.userId, "assign")
    ).toBe(200);

    try {
      await page.context().clearCookies();
      await loginAs(
        page,
        required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
        required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
      );
      await page.goto("/programs?mode=management");
      const leaderDirectory = page.getByRole("list", { name: "可管理課程" });
      await expect(leaderDirectory.getByRole("button")).toHaveCount(1);
      await expect(
        leaderDirectory.getByRole("button", { name: /E2E_DEMO_成人查經/u })
      ).toBeVisible();
      await expect(page.getByText("E2E_DEMO_青年團契")).toHaveCount(0);
      await leaderDirectory
        .getByRole("button", { name: /E2E_DEMO_成人查經/u })
        .click();
      await expect(
        page.getByRole("heading", { name: "E2E_DEMO_成人查經" })
      ).toBeVisible();

      await page.context().clearCookies();
      await loginAs(
        page,
        required("PROGRAMS_STAFF_USERNAME", STAFF_USER),
        required("PROGRAMS_STAFF_CREDENTIAL", STAFF_CRED)
      );
      await page.goto("/programs?mode=management");
      const inheritedDirectory = page.getByRole("list", {
        name: "可管理課程",
      });
      await expect(inheritedDirectory.getByRole("button")).toHaveCount(4);
      await expect(
        inheritedDirectory.getByRole("button", {
          name: /E2E_DEMO_青年團契/u,
        })
      ).toBeVisible();
    } finally {
      await page.context().clearCookies();
      await loginAs(
        page,
        required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
        required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
      );
      expect(
        await postProgramLeader(page, programId, DEV_MEMBER.userId, "revoke")
      ).toBe(200);
    }

    await page.context().clearCookies();
    await loginAs(
      page,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );
    await page.goto(`/programs?mode=management&program=${programId}`);
    await expect(
      page.getByRole("heading", { name: COPY.noManagementScope })
    ).toBeVisible();
    await expect(page.getByText("E2E_DEMO_成人查經")).toHaveCount(0);
  });

  test("a revoked or unknown direct management link stays generic", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    await page.goto(
      "/programs?mode=management&program=E2E_REVOKED_PROGRAM&task=events"
    );
    await expect(
      page.getByRole("heading", { name: COPY.workspaceUnavailable })
    ).toBeVisible();
    await expect(page.getByText("E2E_REVOKED_PROGRAM")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: COPY.workspaceBack })
    ).toBeVisible();
  });
});
