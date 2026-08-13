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
  settingsBasics: "基本資料",
  settingsEnrollment: "報名與可見性",
  settingsSchedule: "時間表",
  settingsAttendance: "出席",
  settingsScheduleOneOff:
    "單次課程不使用固定時間表。請到聚會工作流程建立或管理具體聚會。",
  settingsAttendanceOpens: "開始前可簽到分鐘",
  settingsAttendanceCloses: "結束後仍可簽到分鐘",
  settingsSaveBasics: "儲存基本資料",
  settingsSaveAttendance: "儲存出席預設",
  addRule: "新增時間表",
  generateEvents: "產生聚會",
  noManagementScope: "沒有管理範圍",
  workspaceBack: "返回管理課程目錄",
  workspaceTitle: "課程工作區",
  createProgram: "新增課程",
  editProgram: "編輯課程",
  saveProgram: "儲存課程",
  workspaceDepartment: "所屬部門",
  programName: "課程名稱",
  programCategory: "活動類別",
  behaviorType: "形式",
  behaviorOneOff: "單次",
  lifecycle: "課程狀態",
  lifecycleActive: "啟用",
  // EVT-01 (#251): event operational detail and independent availability.
  eventCreate: "新增聚會",
  eventCreateSubmit: "建立聚會",
  eventDetailBack: "返回聚會列表",
  eventDetailTitle: "聚會詳情",
  eventDetailParticipantSummary: "報名與出席",
  eventName: "聚會名稱",
  eventLocation: "地點",
  eventStart: "開始時間（香港時間）",
  eventEnd: "結束時間（香港時間）",
  eventCheckInWindowOpensAt: "開放簽到",
  eventCheckInWindowClosesAt: "結束簽到",
  eventManualSource: "手動",
  eventActive: "進行",
  eventCancelled: "已取消",
  eventAvailable: "開放",
  eventUnavailable: "暫停",
  eventAvailabilityDeactivate: "暫停聚會",
  eventAvailabilityActivate: "恢復開放",
  eventAvailabilityConfirmProceed: "確定暫停",
  eventAvailabilityNotice: "聚會已暫停開放。",
  eventAvailabilityRestoredNotice: "聚會已恢復開放。",
  eventAvailabilityUndo: "復原",
  eventEditTitle: "編輯聚會資料",
  eventEditSave: "儲存更改",
  eventSavedNotice: "聚會資料已更新。",
  eventCreatedNotice: "聚會已建立。",
  cancelEvent: "取消聚會",
  confirmCancelEvent: "取消聚會",
  keepEvent: "保留聚會",
  cancelReason: "取消原因",
  eventCancelledNotice: "聚會已取消。",
  // AUTH-01 (#255): Program Leader and Department Manager administration.
  programLeaders: "事工負責人",
  leaderUserId: "選擇會友",
  assignLeader: "新增負責人",
  revokeLeader: "移除負責人",
  confirmRevokeLeader: "確定要移除此事工負責人嗎？",
  confirmRevoke: "確定移除",
  leaderAssignedNotice: "已新增事工負責人。",
  leaderRevokedNotice: "已移除事工負責人。",
  selfDelegationForbidden: "您沒有權限執行此操作。",
  departmentSettings: "部門設定",
  departmentManagers: "部門管理者",
  departmentManagerUserId: "選擇部門管理者",
  assignDepartmentManager: "新增部門管理者",
  revokeDepartmentManager: "移除部門管理者",
  confirmRevokeDepartmentManager: "確定要移除此部門管理者嗎？",
  departmentManagerAssignedNotice: "已新增部門管理者。",
  departmentManagerRevokedNotice: "已移除部門管理者。",
  noDepartmentManagers: "目前沒有部門管理者。",
  settingsScheduleUnavailable: "所屬部門目前未啟用聚會模組；不能在這裡編輯時間表規則。",
  settingsAttendanceUnavailable: "所屬部門目前未啟用出席模組；不能在這裡編輯簽到預設。",
  discoverabilityListed: "公開",
  discoverabilityUnlisted: "不公開",
  settingsSaveEnrollment: "儲存報名與可見性",
  settingsConfirmEnrollment: "確認後會影響日後的新報名與課程目錄顯示；既有紀錄不會改變。",
  settingsConfirmChange: "確認變更",
  settingsSaved: "課程設定已儲存。",
  eventAvailabilityConfirmBody:
    "暫停後，此聚會將停止開放簽到（{count} 項進行中的操作會受影響）。",
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

/**
 * Clear cookies AND the `efcc_auth_active` localStorage presence flag
 * before switching personas. `page.context().clearCookies()` alone
 * leaves the flag set; the shell's restore effect (app-shell.tsx) then
 * sees a stale "was logged in" hint on the next navigation and attempts
 * a doomed authMe -> authRefresh round-trip against the now-cookie-less
 * session before loginAs()'s fresh login ever runs. Individually
 * harmless, but this file switches personas often enough (several
 * pre-existing tests plus AUTH-01's dept-manager scope check) that the
 * wasted round-trips add measurable load to a single long-lived local
 * wrangler dev process across a full sequential run.
 */
async function clearSession(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.evaluate(() => {
    try {
      localStorage.removeItem("efcc_auth_active");
    } catch {
      // Storage unavailable — nothing to clear.
    }
  });
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

    await clearSession(page);
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
    const demoDirectoryRows = directory
      .getByRole("button")
      .filter({ hasText: /^E2E_DEMO_/u });
    await expect(demoDirectoryRows).toHaveCount(4);
    expect(
      await directory
        .getByRole("listitem")
        .filter({ hasText: "E2E_DEMO_MINISTRY" })
        .count()
    ).toBeGreaterThanOrEqual(4);

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
      page.getByRole("heading", {
        name: COPY.workspaceTaskParticipants,
        exact: true,
      })
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
      await clearSession(page);
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

      await clearSession(page);
      await loginAs(
        page,
        required("PROGRAMS_STAFF_USERNAME", STAFF_USER),
        required("PROGRAMS_STAFF_CREDENTIAL", STAFF_CRED)
      );
      await page.goto("/programs?mode=management");
      const inheritedDirectory = page.getByRole("list", {
        name: "可管理課程",
      });
      const inheritedDemoRows = inheritedDirectory
        .getByRole("button")
        .filter({ hasText: /^E2E_DEMO_/u });
      await expect
        .poll(async () => inheritedDemoRows.count())
        .toBeGreaterThanOrEqual(4);
      await expect(
        inheritedDirectory.getByRole("button", {
          name: /E2E_DEMO_青年團契/u,
        })
      ).toBeVisible();
    } finally {
      await clearSession(page);
      await loginAs(
        page,
        required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
        required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
      );
      expect(
        await postProgramLeader(page, programId, DEV_MEMBER.userId, "revoke")
      ).toBe(200);
    }

    await clearSession(page);
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

test.describe("CFG-01 Program Settings", () => {
  test("renders all scope-owned groups and omits recurring controls for OneOff", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const [recurringId] = await catalogProgramIds(page, "E2E_DEMO_成人查經");
    const [oneOffId] = await catalogProgramIds(page, "E2E_DEMO_青年團契");
    expect(recurringId).toBeTruthy();
    expect(oneOffId).toBeTruthy();

    await page.goto(
      `/programs?mode=management&program=${required("recurring id", recurringId)}&task=settings`
    );
    await expect(
      page.getByRole("heading", { name: COPY.settingsBasics })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: COPY.settingsEnrollment })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: COPY.settingsSchedule })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: COPY.settingsAttendance })
    ).toBeVisible();
    await expect(
      page.getByRole("spinbutton", { name: COPY.settingsAttendanceOpens })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: COPY.generateEvents })
    ).toHaveCount(0);

    await page.goto(
      `/programs?mode=management&program=${required("one-off id", oneOffId)}&task=settings`
    );
    await expect(
      page.getByRole("heading", { name: COPY.settingsSchedule })
    ).toBeVisible();
    await expect(page.getByText(COPY.settingsScheduleOneOff)).toBeVisible();
    await expect(
      page.getByRole("button", { name: COPY.addRule })
    ).toHaveCount(0);
  });

  test("renders unavailable copy for Schedule and Attendance when their modules are disabled", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const [gateProgramId] = await catalogProgramIds(
      page,
      "E2E_模組停用課程"
    );
    const id = required("module-gate program id", gateProgramId);

    await page.goto(
      `/programs?mode=management&program=${id}&task=settings`
    );
    await expect(
      page.getByText(COPY.settingsScheduleUnavailable)
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: COPY.addRule })
    ).toHaveCount(0);
    await expect(
      page.getByText(COPY.settingsAttendanceUnavailable)
    ).toBeVisible();
    await expect(
      page.getByRole("spinbutton", { name: COPY.settingsAttendanceOpens })
    ).toHaveCount(0);
  });

  test("consequential discoverability change requires confirmation before it saves", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const [programId] = await catalogProgramIds(page, "E2E_DEMO_成人查經");
    const id = required("program id", programId);

    try {
      await page.goto(
        `/programs?mode=management&program=${id}&task=settings`
      );
      const discoverabilitySelect = page.getByRole("combobox", {
        name: COPY.discoverabilityListed,
      });
      await expect(discoverabilitySelect).toHaveValue("Listed");

      await discoverabilitySelect.selectOption("Unlisted");
      await page
        .getByRole("button", { name: COPY.settingsSaveEnrollment })
        .click();
      // Submitting a changed value shows the inline confirm instead of
      // saving immediately -- the save button itself is replaced by the
      // confirm row (saveEnrollment sets confirmingEnrollment, it does
      // not mutate yet).
      const confirmAlert = page.getByRole("alert", {
        name: COPY.settingsConfirmEnrollment,
      });
      await expect(confirmAlert).toBeVisible();
      await expect(
        page.getByRole("button", { name: COPY.settingsSaveEnrollment })
      ).toHaveCount(0);

      await confirmAlert
        .getByRole("button", { name: COPY.settingsConfirmChange })
        .click();
      await expect(
        page.getByText(COPY.settingsSaved, { exact: true }).first()
      ).toBeVisible();
      await expect(discoverabilitySelect).toHaveValue("Unlisted");

      // Revert, same confirm flow.
      await discoverabilitySelect.selectOption("Listed");
      await page
        .getByRole("button", { name: COPY.settingsSaveEnrollment })
        .click();
      await expect(
        page.getByRole("alert", { name: COPY.settingsConfirmEnrollment })
      ).toBeVisible();
      await page
        .getByRole("alert", { name: COPY.settingsConfirmEnrollment })
        .getByRole("button", { name: COPY.settingsConfirmChange })
        .click();
      await expect(
        page.getByText(COPY.settingsSaved, { exact: true }).first()
      ).toBeVisible();
      await expect(discoverabilitySelect).toHaveValue("Listed");
    } finally {
      const status = await page.evaluate(async (programId) => {
        const res = await fetch(`/api/v1/programs/${programId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ discoverability: "Listed" }),
        });
        return res.status;
      }, id);
      expect(
        status,
        "safety-net restore of discoverability must succeed"
      ).toBe(200);
    }
  });
});

test.describe("AUTH-01 Program Leader administration", () => {
  test("Staff denies self-assignment, revokes the seeded leader, and re-grants it", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_STAFF_USERNAME", STAFF_USER),
      required("PROGRAMS_STAFF_CREDENTIAL", STAFF_CRED)
    );
    const [programId] = await catalogProgramIds(page, "E2E_DEMO_成人查經");
    expect(programId).toBeTruthy();
    const id = required("program id", programId);

    // Establish a known baseline instead of assuming one: the demo
    // fixture does not itself grant leadership (no seed script creates
    // program_leaders rows), and another pre-existing test in this file
    // ("leader exact scope and manager inheritance stay distinct",
    // MUI-01) deliberately revokes E2E_member's leadership as part of
    // its own designed end-state. This test must not assume it runs
    // before or after that one -- ensure the precondition itself.
    await page.evaluate(
      async ({ programId, memberUserId }) => {
        const listRes = await fetch(`/api/v1/programs/${programId}/leaders`);
        const listBody = (await listRes.json()) as {
          data?: { leaders?: { user_id: string }[] };
        };
        const hasMember = (listBody.data?.leaders ?? []).some(
          (leader) => leader.user_id === memberUserId
        );
        if (!hasMember) {
          await fetch(`/api/v1/programs/${programId}/leaders`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: memberUserId }),
          });
        }
      },
      { programId: id, memberUserId: DEV_MEMBER.userId }
    );

    await page.goto(
      `/programs?mode=management&program=${id}&task=settings`
    );
    const leadersPanel = page.getByRole("region", {
      name: COPY.programLeaders,
    });
    await expect(leadersPanel).toBeVisible();
    // Wait for the async leader-list load to settle before interacting,
    // so a throttled (phone) profile doesn't race the initial fetch.
    await expect(
      leadersPanel.getByText(/E2E Member/).first()
    ).toBeVisible();

    const combo = leadersPanel.getByRole("combobox", {
      name: COPY.leaderUserId,
    });

    try {
      // Self-assignment denial: pick self, submit, server-side 403.
      // The baseline above guarantees E2E_member as leader, so this must
      // not touch that grant.
      await combo.click();
      await combo.fill("E2E_staff");
      await leadersPanel
        .getByRole("option", { name: /E2E Staff/ })
        .click();
      await leadersPanel
        .getByRole("button", { name: COPY.assignLeader })
        .click();
      await expect(
        leadersPanel.getByText(COPY.selfDelegationForbidden, { exact: true })
      ).toBeVisible();

      // Revoke: a real state transition, not a duplicate-grant no-op.
      // The self-denial error above does not reload the list (runAction
      // only reloads on success), so E2E Member is still here.
      await expect(
        leadersPanel.getByText(/E2E Member/).first()
      ).toBeVisible();
      await leadersPanel
        .getByRole("button", { name: COPY.revokeLeader })
        .click();
      await expect(
        leadersPanel.getByText(COPY.confirmRevokeLeader)
      ).toBeVisible();
      await leadersPanel
        .getByRole("button", { name: COPY.confirmRevoke })
        .click();
      await expect(
        leadersPanel.getByText(COPY.leaderRevokedNotice, { exact: true }).first()
      ).toBeVisible();

      // Re-grant: exercise the real grant path and its notice.
      await combo.click();
      await combo.fill("E2E_member");
      await leadersPanel
        .getByRole("option", { name: /E2E Member/ })
        .click();
      await leadersPanel
        .getByRole("button", { name: COPY.assignLeader })
        .click();
      await expect(
        leadersPanel
          .getByText(COPY.leaderAssignedNotice, { exact: true })
          .first()
      ).toBeVisible();
      await expect(
        leadersPanel.getByText(/E2E Member/).first()
      ).toBeVisible();
    } finally {
      // Failure-safe restoration: guarantee E2E_member ends the test as
      // leader regardless of where an assertion above failed.
      await page.evaluate(
        async ({ programId, memberUserId }) => {
          const listRes = await fetch(
            `/api/v1/programs/${programId}/leaders`
          );
          const listBody = (await listRes.json()) as {
            data?: { leaders?: { user_id: string }[] };
          };
          const hasMember = (listBody.data?.leaders ?? []).some(
            (leader) => leader.user_id === memberUserId
          );
          if (!hasMember) {
            await fetch(`/api/v1/programs/${programId}/leaders`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ user_id: memberUserId }),
            });
          }
        },
        { programId: id, memberUserId: DEV_MEMBER.userId }
      );
    }
  });
});

test.describe("AUTH-01 Department Manager administration", () => {
  test("Admin grants a Department Manager, scope inherits, then revokes", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );

    const departmentId = await page.evaluate(async () => {
      const res = await fetch("/api/v1/programs/departments");
      const body = (await res.json()) as {
        data?: {
          departments?: { department_id: string; code: string }[];
        };
      };
      return (
        body.data?.departments?.find((d) => d.code === "E2E_DEMO_MINISTRY")
          ?.department_id ?? null
      );
    });
    const deptId = required("E2E_DEMO_MINISTRY department id", departmentId ?? undefined);

    try {
      await page.goto("/programs?mode=management");
      await page
        .getByRole("button", { name: /E2E_DEMO_示範事工.*部門設定/ })
        .click();

      // The panel's notice/error live in the OUTER "部門設定: ..." section,
      // as a sibling of the "部門管理者" sub-region below -- not nested
      // inside it (unlike the single-purpose LeadersPanel).
      const deptPanel = page.getByRole("region", {
        name: /部門設定.*E2E_DEMO_示範事工/,
      });
      const managersPanel = deptPanel.getByRole("region", {
        name: COPY.departmentManagers,
      });
      await expect(managersPanel).toBeVisible();
      // Confirmed empty at fixture baseline (no prior grant for this dept).
      await expect(
        managersPanel.getByText(COPY.noDepartmentManagers)
      ).toBeVisible();

      const combo = managersPanel.getByRole("combobox", {
        name: COPY.departmentManagerUserId,
      });
      await combo.click();
      await combo.fill("E2E_member");
      await managersPanel
        .getByRole("option", { name: /E2E Member/ })
        .click();
      await managersPanel
        .getByRole("button", { name: COPY.assignDepartmentManager })
        .click();
      await expect(
        deptPanel
          .getByText(COPY.departmentManagerAssignedNotice, { exact: true })
          .first()
      ).toBeVisible();
      await expect(
        managersPanel.getByText(/E2E Member/).first()
      ).toBeVisible();

      // Scope inheritance: E2E_member should now see the whole department
      // (all 4 programs + the department settings card), not just the one
      // program they lead.
      await clearSession(page);
      await loginAs(
        page,
        required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
        required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
      );
      await page.goto("/programs?mode=management");
      for (const programName of [
        "E2E_DEMO_成人查經",
        "E2E_DEMO_青年團契",
        "E2E_DEMO_社區關懷",
        "E2E_DEMO_管理安排",
      ]) {
        await expect(
          page.getByRole("button", { name: new RegExp(programName) })
        ).toBeVisible();
      }
      await expect(
        page.getByRole("button", { name: /E2E_DEMO_示範事工.*部門設定/ })
      ).toBeVisible();

      // Revoke, back as Admin.
      await clearSession(page);
      await loginAs(
        page,
        required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
        required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
      );
      await page.goto("/programs?mode=management");
      await page
        .getByRole("button", { name: /E2E_DEMO_示範事工.*部門設定/ })
        .click();
      const deptPanel2 = page.getByRole("region", {
        name: /部門設定.*E2E_DEMO_示範事工/,
      });
      const managersPanel2 = deptPanel2.getByRole("region", {
        name: COPY.departmentManagers,
      });
      await expect(
        managersPanel2.getByText(/E2E Member/).first()
      ).toBeVisible();
      await managersPanel2
        .getByRole("button", { name: COPY.revokeDepartmentManager })
        .click();
      await expect(
        managersPanel2.getByText(COPY.confirmRevokeDepartmentManager)
      ).toBeVisible();
      await managersPanel2
        .getByRole("button", { name: COPY.confirmRevoke })
        .click();
      await expect(
        deptPanel2
          .getByText(COPY.departmentManagerRevokedNotice, { exact: true })
          .first()
      ).toBeVisible();
      await expect(
        managersPanel2.getByText(COPY.noDepartmentManagers)
      ).toBeVisible();
    } finally {
      // Failure-safe restoration: re-authenticate as Admin regardless of
      // which persona was active when the try block failed (e.g. a
      // failure mid-scope-check would otherwise leave the page on the
      // E2E_member session, which lacks department.manager.assign and
      // would 403 on the revoke below).
      await clearSession(page);
      await loginAs(
        page,
        required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
        required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
      );
      const cleanup = await page.evaluate(
        async ({ deptId, memberUserId }) => {
          const listRes = await fetch(
            `/api/v1/programs/departments/${deptId}/managers`
          );
          const listBody = (await listRes.json()) as {
            data?: { managers?: { user_id: string }[] };
          };
          const hasMember = (listBody.data?.managers ?? []).some(
            (m) => m.user_id === memberUserId
          );
          if (!hasMember) {
            return { revoked: false, status: null as number | null };
          }
          const revokeRes = await fetch(
            `/api/v1/programs/departments/${deptId}/managers/${memberUserId}/revoke`,
            { method: "POST" }
          );
          return { revoked: true, status: revokeRes.status };
        },
        { deptId, memberUserId: DEV_MEMBER.userId }
      );
      if (cleanup.revoked) {
        expect(
          cleanup.status,
          "safety-net revoke must succeed to leave the fixture clean"
        ).toBe(200);
      }
    }
  });
});

test.describe("MUI-02 scoped Program management", () => {
  test("creates a OneOff, operates multiple Events, edits, and blocks archive", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    await page.getByRole("button", { name: COPY.enterManagement }).click();
    await page.getByRole("button", { name: COPY.createProgram }).click();
    await expect(
      page.getByRole("heading", { name: COPY.createProgram })
    ).toBeVisible();
    // The department combobox defaults to the first department by
    // display_order, which is the baseline 青區 — its program_catalog module
    // is disabled (#250 module gating), so creating a program there is a 403.
    // Explicitly pick the E2E_DEMO_ demo department (module enabled by seed).
    await page
      .getByRole("combobox", { name: COPY.workspaceDepartment })
      .selectOption({ label: "E2E_DEMO_示範事工 · E2E_DEMO_MINISTRY" });

    const originalName = `E2E_MUI250_${Date.now()}`;
    await page
      .getByRole("textbox", { name: COPY.programName })
      .fill(originalName);
    await page
      .getByRole("textbox", { name: COPY.programCategory })
      .fill("E2E 活動類別");
    await page
      .getByRole("combobox", { name: COPY.behaviorType })
      .selectOption("OneOff");
    await page
      .getByRole("combobox", { name: COPY.lifecycle })
      .selectOption("Active");
    await page.getByRole("button", { name: COPY.saveProgram }).click();

    await expect(
      page.getByRole("heading", { name: originalName })
    ).toBeVisible();
    const programId = new URL(page.url()).searchParams.get("program");
    expect(programId).toBeTruthy();
    const id = required("created program id", programId ?? undefined);
    const events = [
      ["2098-12-01T10:00:00.000Z", "2098-12-01T11:00:00.000Z"],
      ["2098-12-08T10:00:00.000Z", "2098-12-08T11:00:00.000Z"],
    ] as const;
    const eventResult = await page.evaluate(
      async ({ programId: id, eventTimes }) => {
        const statuses = await Promise.all(
          eventTimes.map(async ([starts_at, ends_at]) => {
            const response = await fetch(`/api/v1/programs/${id}/events`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ starts_at, ends_at }),
            });
            return response.status;
          })
        );
        const listed = await fetch(`/api/v1/programs/${id}/events`);
        const body = (await listed.json()) as {
          data?: { events?: unknown[] };
        };
        return {
          statuses,
          listStatus: listed.status,
          count: body.data?.events?.length ?? -1,
        };
      },
      { programId: id, eventTimes: events }
    );
    expect(eventResult).toStrictEqual({
      statuses: [201, 201],
      listStatus: 200,
      count: 2,
    });

    await page.getByRole("button", { name: COPY.editProgram }).click();
    const updatedName = `${originalName}_更新`;
    await page
      .getByRole("textbox", { name: COPY.programName })
      .fill(updatedName);
    await page.getByRole("button", { name: COPY.saveProgram }).click();
    await expect(
      page.getByRole("heading", { name: updatedName })
    ).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`/programs\\?mode=management&program=${id}$`, "u")
    );

    const archiveStatus = await page.evaluate(async (programId) => {
      const response = await fetch(`/api/v1/programs/${programId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lifecycle: "Archived" }),
      });
      return response.status;
    }, id);
    expect(archiveStatus).toBe(409);
  });

  test("member direct Program mutation is denied server-side", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const [programId] = await catalogProgramIds(page, "E2E_DEMO_成人查經");
    const id = required("fixture program id", programId);

    // This test's premise is that the member has NO management relationship
    // to the program. That is not guaranteed by suite order alone -- an
    // earlier AUTH-01 test intentionally leaves E2E_member re-granted as
    // this program's leader (restoring what it found), and a Program
    // Leader legitimately has PROGRAM_MANAGE over their own program. Revoke
    // any such grant first so the denial below tests the real "no
    // relationship" case regardless of what ran before it.
    const staleLeaderRevoke = await postProgramLeader(
      page,
      id,
      DEV_MEMBER.userId,
      "revoke"
    );
    expect([200, 404]).toContain(staleLeaderRevoke);
    await clearSession(page);
    await loginAs(
      page,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );
    const denied = await page.evaluate(async (programId) => {
      const response = await fetch(`/api/v1/programs/${programId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "E2E unauthorized rename" }),
      });
      return {
        status: response.status,
        body: (await response.json()) as { code?: string },
      };
    }, id);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe("FORBIDDEN");
  });
});

test.describe("EVT-01 event operational detail and availability", () => {
  // Fresh E2E_DEMO_ fixtures (ADR-0029 reseed) are required: schedule-rule
  // generation only ever creates Wednesdays 19:30, and this suite creates
  // events at a worker-unique minute (+120 days, +start-second minutes), so
  // starts_at never collides with generated events or earlier runs.
  let evtBaseEpoch: number | null = null;
  function eventStart(
    dateOffsetDays: number,
    minuteOffsetMinutes: number
  ): string {
    const base =
      evtBaseEpoch ??
      (evtBaseEpoch =
        Date.now() + 120 * 86_400_000 + new Date().getSeconds() * 60_000);
    const start = new Date(
      base + dateOffsetDays * 86_400_000 + minuteOffsetMinutes * 60_000
    );
    const pad = (value: number): string => String(value).padStart(2, "0");
    return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(
      start.getDate()
    )}T${pad(start.getHours())}:${pad(start.getMinutes())}`;
  }

  function eventEndMinutesLater(start: string, minutes: number): string {
    const value = new Date(`${start}:00`);
    value.setMinutes(value.getMinutes() + minutes);
    const pad = (value: number): string => String(value).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(
      value.getDate()
    )}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
  }

  // Mirrors hkWallDateTimeLabel in web/lib/programs/recurrence.ts.
  const HK_WALL_FORMATTER = new Intl.DateTimeFormat("zh-Hant", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  function hkWallLabel(wallInput: string): string {
    return HK_WALL_FORMATTER.format(new Date(`${wallInput}:00+08:00`));
  }

  async function apiJsonStatus(
    page: Page,
    path: string,
    method = "GET",
    body?: unknown
  ): Promise<number> {
    return await page.evaluate(
      async ({ requestPath, requestMethod, requestBody }) => {
        if (requestBody === undefined) {
          const response = await fetch(requestPath, { method: requestMethod });
          return response.status;
        }
        const response = await fetch(requestPath, {
          method: requestMethod,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
        return response.status;
      },
      { requestPath: path, requestMethod: method, requestBody: body }
    );
  }

  interface EvtEnrollmentRequest {
    request_id: string;
    member_user_id: string;
    status: string;
  }

  async function evtPendingRequests(
    page: Page,
    programId: string
  ): Promise<EvtEnrollmentRequest[]> {
    const body = await page.evaluate(
      async (requestPath) => {
        const response = await fetch(requestPath);
        return (await response.json()) as { data?: { requests?: unknown } };
      },
      `/api/v1/programs/${encodeURIComponent(programId)}/enrollment-requests`
    );
    return ((body.data?.requests ?? []) as EvtEnrollmentRequest[]).filter(
      ({ status }) => status === "Pending"
    );
  }

  interface EvtEnrollment {
    enrollment_id: string;
    member_user_id: string;
    status: string;
  }

  async function evtActiveEnrollments(
    page: Page,
    programId: string
  ): Promise<EvtEnrollment[]> {
    const body = await page.evaluate(
      async (requestPath) => {
        const response = await fetch(requestPath);
        return (await response.json()) as { data?: { enrollments?: unknown } };
      },
      `/api/v1/programs/${encodeURIComponent(programId)}/enrollments`
    );
    return (body.data?.enrollments ?? []) as EvtEnrollment[];
  }

  async function openEventsTask(
    page: Page,
    programId: string
  ): Promise<void> {
    await page.goto(
      `/programs?mode=management&program=${encodeURIComponent(programId)}&task=events`
    );
    await expect(
      page.getByRole("heading", { name: COPY.workspaceTaskEvents })
    ).toBeVisible();
  }

  async function createManualEvent(
    page: Page,
    programId: string,
    name: string,
    minuteOffsetMinutes: number
  ): Promise<string> {
    await openEventsTask(page, programId);
    await page.getByRole("button", { name: COPY.eventCreate }).click();
    const startsAt = eventStart(0, minuteOffsetMinutes);
    await page.getByLabel(COPY.eventName).fill(name);
    await page.getByLabel(COPY.eventLocation).fill("測試場地");
    await page.getByLabel(COPY.eventStart).fill(startsAt);
    await page
      .getByLabel(COPY.eventEnd)
      .fill(eventEndMinutesLater(startsAt, 90));
    await page
      .getByLabel(COPY.eventCheckInWindowOpensAt)
      .fill(eventEndMinutesLater(startsAt, -30));
    await page
      .getByLabel(COPY.eventCheckInWindowClosesAt)
      .fill(eventEndMinutesLater(startsAt, 120));
    await page.getByRole("button", { name: COPY.eventCreateSubmit }).click();
    await expect(page).toHaveURL(
      new RegExp(
        `/programs\\?mode=management&program=${programId}&task=events&event=[A-Za-z0-9-]+$`,
        "u"
      )
    );
    const match = page
      .url()
      .match(/[?&]event=([A-Za-z0-9-]+)$/u);
    expect(match?.[1], "create must navigate to the new event detail").toBeTruthy();
    await expect(
      page.getByRole("heading", { name })
    ).toBeVisible();
    return match?.[1] ?? "";
  }

  test("admin creates, deep-links, and edits an event with HK wall display", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const [programId] = await catalogProgramIds(page, "E2E_DEMO_成人查經");
    expect(programId).toBeTruthy();

    const name = `E2E_EVT_建立_${Date.now()}`;
    const renamed = `E2E_EVT_改名_${Date.now()}`;
    await createManualEvent(page, programId, name, 0);

    const startsAt = eventStart(0, 0);
    const endsAt = eventEndMinutesLater(startsAt, 90);
    const opensAt = eventEndMinutesLater(startsAt, -30);
    const closesAt = eventEndMinutesLater(startsAt, 120);
    await expect(
      page.getByRole("region", { name: COPY.eventDetailTitle })
    ).toBeVisible();
    await expect(
      page.getByText(`${hkWallLabel(startsAt)} — ${hkWallLabel(endsAt)}`)
    ).toBeVisible();
    await expect(page.getByText(COPY.eventManualSource, { exact: true })).toBeVisible();
    await expect(page.getByText(COPY.eventActive, { exact: true })).toBeVisible();
    await expect(page.getByText(COPY.eventAvailable, { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        `${COPY.eventCheckInWindowOpensAt} ${hkWallLabel(opensAt)}；${COPY.eventCheckInWindowClosesAt} ${hkWallLabel(closesAt)}`
      )
    ).toBeVisible();
    await expect(page.getByText("已報名 0 人", { exact: true })).toBeVisible();
    await expect(page.getByText("已簽到 0 人", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: COPY.eventDetailParticipantSummary })
    ).toBeVisible();

    await page.getByRole("button", { name: COPY.eventEditTitle }).click();
    await page.getByLabel(COPY.eventName).fill(renamed);
    await page.getByLabel(COPY.eventLocation).fill("副堂 A");
    await page.getByRole("button", { name: COPY.eventEditSave }).click();
    await expect(
      page.getByText(COPY.eventSavedNotice, { exact: true }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: renamed })
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("heading", { name: renamed })
    ).toBeVisible();

    await page.getByRole("button", { name: COPY.eventDetailBack }).click();
    await expect(page).toHaveURL(
      new RegExp(
        `/programs\\?mode=management&program=${programId}&task=events$`,
        "u"
      )
    );
    await expect(
      page.getByRole("heading", { name: COPY.workspaceTaskEvents })
    ).toBeVisible();
  });

  test("safe deactivation is immediate with Undo; cancellation retires controls", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const [programId] = await catalogProgramIds(page, "E2E_DEMO_成人查經");
    expect(programId).toBeTruthy();

    await createManualEvent(
      page,
      programId,
      `E2E_EVT_暫停_${Date.now()}`,
      90
    );

    await page.getByRole("button", { name: COPY.eventAvailabilityDeactivate }).click();
    await expect(
      page.getByText(COPY.eventAvailabilityNotice, { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: COPY.eventAvailabilityConfirmProceed })
    ).toHaveCount(0);
    const undo = page.getByRole("button", { name: COPY.eventAvailabilityUndo });
    await expect(undo).toBeVisible();
    await undo.click();
    await expect(
      page.getByText(COPY.eventAvailabilityRestoredNotice, { exact: true }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: COPY.eventAvailabilityDeactivate })
    ).toBeVisible();

    await page.getByRole("button", { name: COPY.cancelEvent }).click();
    await page.getByLabel(COPY.cancelReason).fill("場地維修");
    await page.getByRole("button", { name: COPY.confirmCancelEvent }).click();
    await expect(
      page.getByText(COPY.eventCancelledNotice, { exact: true }).first()
    ).toBeVisible();
    await expect(page.getByText("取消原因：場地維修")).toBeVisible();
    await expect(
      page.getByText(COPY.eventCancelled, { exact: true })
    ).toBeVisible();
    for (const label of [
      COPY.eventAvailabilityDeactivate,
      COPY.eventAvailabilityActivate,
      COPY.eventAvailabilityUndo,
      COPY.eventEditTitle,
      COPY.cancelEvent,
    ]) {
      await expect(page.getByRole("button", { name: label })).toHaveCount(0);
    }
  });

  test("an active Program enrollment alone does not gate this event's deactivation", async ({
    page,
    browser,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const [programId] = await catalogProgramIds(page, "E2E_DEMO_成人查經");
    expect(programId).toBeTruthy();

    await createManualEvent(
      page,
      programId,
      `E2E_EVT_確認_${Date.now()}`,
      180
    );

    // A concurrent actor enrolls and is approved. EVT-01 (#251): enrollments
    // are Program-scoped, not this Event's own open operations, so an
    // approved enrollment must never gate deactivation of an event that has
    // no check-ins of its own.
    const memberContext = await browser.newContext();
    try {
      const memberPage = await memberContext.newPage();
      await loginAs(
        memberPage,
        required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
        required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
      );
      expect(
        await apiJsonStatus(
          memberPage,
          `/api/v1/programs/${encodeURIComponent(programId)}/enrollment-requests`,
          "POST",
          {}
        )
      ).toBeGreaterThanOrEqual(200);
      expect(
        await apiJsonStatus(memberPage, "/api/v1/programs/access")
      ).toBe(200);
    } finally {
      await memberContext.close();
    }

    const pending = await evtPendingRequests(page, programId);
    const request = pending.find(
      ({ member_user_id }) => member_user_id === DEV_MEMBER.userId
    );
    expect(request, "member request must be pending for approval").toBeTruthy();
    const decisionStatus = await apiJsonStatus(
      page,
      `/api/v1/programs/${encodeURIComponent(programId)}/enrollment-requests/${encodeURIComponent(request?.request_id ?? "")}/decision`,
      "POST",
      { action: "Approved" }
    );
    expect([200, 409]).toContain(decisionStatus);
    const approved = await evtActiveEnrollments(page, programId);
    expect(
      approved.some(
        ({ member_user_id }) => member_user_id === DEV_MEMBER.userId
      ),
      "approval must leave an Active enrollment"
    ).toBeTruthy();

    // Deactivation must succeed immediately: this event has zero check-ins,
    // so the unrelated Program enrollment above must not surface a
    // confirmation gate.
    await page
      .getByRole("button", { name: COPY.eventAvailabilityDeactivate })
      .click();
    await expect(
      page.getByText(COPY.eventAvailabilityNotice, { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: COPY.eventAvailabilityUndo })
    ).toBeVisible();

    // Restore the fixture: retire the seeded approval so a same-day re-run
    // starts clean.
    const enrollments = await evtActiveEnrollments(page, programId);
    const enrollment = enrollments.find(
      ({ member_user_id, status }) =>
        member_user_id === DEV_MEMBER.userId && status === "Active"
    );
    expect(enrollment, "approved enrollment must be active").toBeTruthy();
    expect(
      await apiJsonStatus(
        page,
        `/api/v1/programs/${encodeURIComponent(programId)}/enrollments/${encodeURIComponent(enrollment?.enrollment_id ?? "")}/cancel`,
        "POST",
        {}
      )
    ).toBe(200);
  });

  test("a currently open check-in window with zero check-ins still requires confirmation to deactivate", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const [programId] = await catalogProgramIds(page, "E2E_DEMO_成人查經");
    expect(programId).toBeTruthy();

    // This event's window must be open right now (unlike every other
    // fixture in this file, which is dated +120 days so the window is
    // never open at test time) -- construct it relative to Date.now().
    const created = await page.evaluate(async (programId) => {
      const now = Date.now();
      const res = await fetch(
        `/api/v1/programs/${encodeURIComponent(programId)}/events`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            starts_at: new Date(now - 30 * 60_000).toISOString(),
            ends_at: new Date(now + 30 * 60_000).toISOString(),
            check_in_window_opens_at: new Date(
              now - 15 * 60_000
            ).toISOString(),
            check_in_window_closes_at: new Date(
              now + 45 * 60_000
            ).toISOString(),
          }),
        }
      );
      const body = (await res.json()) as {
        data?: { event?: { event_id?: string } };
      };
      return { status: res.status, eventId: body.data?.event?.event_id ?? null };
    }, programId);
    expect(created.status, "event creation must succeed").toBe(201);
    const id = required("open-window event id", created.eventId ?? undefined);

    try {
      await page.goto(
        `/programs?mode=management&program=${programId}&task=events&event=${id}`
      );
      await expect(
        page.getByRole("region", { name: COPY.eventDetailTitle })
      ).toBeVisible();

      // Single click: the client optimistically attempts a no-confirm
      // deactivate (checked_in === 0 in the loaded summary), the server
      // rejects it with 409 CONFIRMATION_REQUIRED because the window is
      // open, and the client catches that and shows the same inline
      // confirm UI as the checked-in>0 case -- with an exact count of 1
      // (the open window itself is the one affected operation; see
      // department-workspace.ts's impactCount = Math.max(checked_in,
      // windowOpen ? 1 : 0)).
      await page
        .getByRole("button", { name: COPY.eventAvailabilityDeactivate })
        .click();
      const expectedBody = COPY.eventAvailabilityConfirmBody.replace(
        "{count}",
        "1"
      );
      const confirmAlert = page.getByRole("alert").filter({
        hasText: expectedBody,
      });
      await expect(confirmAlert).toBeVisible();
      await expect(
        confirmAlert.getByRole("button", {
          name: COPY.eventAvailabilityConfirmProceed,
        })
      ).toBeVisible();

      await confirmAlert
        .getByRole("button", { name: COPY.eventAvailabilityConfirmProceed })
        .click();
      await expect(
        page.getByText(COPY.eventAvailabilityNotice, { exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: COPY.eventAvailabilityUndo })
      ).toBeVisible();
    } finally {
      const restoreStatus = await page.evaluate(
        async ({ programId, eventId }) => {
          const res = await fetch(
            `/api/v1/programs/${encodeURIComponent(programId)}/events/${encodeURIComponent(eventId)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ availability: "Active" }),
            }
          );
          return res.status;
        },
        { programId, eventId: id }
      );
      expect(
        restoreStatus,
        "restoring the event to Active must succeed"
      ).toBe(200);
    }
  });
});
