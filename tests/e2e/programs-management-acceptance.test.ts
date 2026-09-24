import { expect, test } from "@playwright/test";
import type { BrowserContext, Page, Request } from "@playwright/test";

import { COPY as APP_COPY } from "../../web/lib/copy";

const ADMIN = {
  username: process.env.PROGRAMS_ADMIN_USERNAME ?? "E2E_admin",
  credential: process.env.PROGRAMS_ADMIN_CREDENTIAL ?? "E2E_admin!dev",
};
const STAFF = {
  username: process.env.PROGRAMS_STAFF_USERNAME ?? "E2E_staff",
  credential: process.env.PROGRAMS_STAFF_CREDENTIAL ?? "E2E_staff!dev",
};
const MEMBER = {
  username: process.env.PROGRAMS_MEMBER_USERNAME ?? "E2E_member",
  credential: process.env.PROGRAMS_MEMBER_CREDENTIAL ?? "E2E_member!dev",
};

const COPY = {
  login: "登入",
  directoryTitle: "管理課程",
  directorySearch: "搜尋可管理課程",
  directoryList: "可管理課程",
  settings: "課程設定",
  departmentSettings: "部門設定",
  departmentName: "部門名稱",
  saveDepartment: "儲存部門",
  offlineError: "未能儲存。請重新連線後再試。",
  settingsBasics: "課程基本資料",
  settingsBasicsHeading: "基本資料",
  settingsBack: "返回設定",
  home: "首頁",
  settingsUnsaved: "有未儲存變更。",
  settingsContinueEditing: "繼續編輯",
  draftRecover: "恢復草稿",
  settingsDiscard: "捨棄變更",
  programName: "課程名稱",
  programDescription: "課程簡介",
  saveBasics: "儲存基本資料",
  saved: "課程設定已儲存。",
  workspaceSavedStale:
    "操作已完成，但最新課程資料暫時未能更新。請按「重試更新」確認目前狀態。",
  workspaceRetryRefresh: "重試更新課程工作區",
  workspaceOverview: "概覽",
  workspaceEvents: "聚會",
  workspaceParticipants: "參與者",
  workspaceActiveParticipants: "活躍參與者",
  schedulePageTitle: "聚會排程",
  previewEvents: "預覽聚會",
  generateEvents: "產生聚會",
  eventFilterPast: "過往",
  eventDetailBack: "返回聚會列表",
  eventCreateCancel: "取消",
  enroll: "報名",
  createMeeting: "建立聚會",
  createMeetingValidation: "請輸入日期、時間及聚會名稱。",
  eventDate: "日期",
  eventTime: "時間",
  eventName: "聚會名稱",
  eventType: "類型",
  eventTypeTraining: "訓練",
  eventCreatedNotice: "聚會已建立。",
  approve: "核准",
  decisionMade: "已處理申請。",
  pendingCount: "待審批",
  activeParticipants: "活躍參與者",
  enterManagement: "進入管理模式",
  enterParticipant: "返回參與者模式",
  participantDirectory: "課程",
  notificationsTitle: "通知",
  notificationsReadError: "通知狀態未能更新，請重試。",
  notificationsRetry: "重試載入通知",
  returnManagementDirectory: "返回管理課程目錄",
  settingsPublishing: "發布與顯示",
  savePublishing: "儲存發布與顯示",
  confirmPublishing:
    "確認後會更新課程狀態或課程目錄顯示；封存仍會按現有營運承諾規則檢查。",
  confirmChange: "確認變更",
  discoverabilityListed: "公開",
  discoverabilityUnlisted: "不公開",
  modules: "模組",
  catalogSectionTitle: "全部課程",
  collapse: "收合",
  moduleProgramCatalog: "課程目錄",
  moduleEnrollment: "報名",
  moduleEvents: "聚會",
  moduleAttendance: "出席",
  moduleCustomForms: "自訂表格",
  programPurpose: "課程目的",
  programCategory: "活動類別",
  behaviorType: "形式",
  behaviorOneOff: "單次",
  lifecycle: "課程狀態",
  lifecycleActive: "啟用",
  createProgram: "建立課程",
  programCreatedNotice: "課程已建立（草稿狀態）",
  saveProgram: "儲存課程",
  workspaceTaskParticipants: "參與者",
  workspaceParticipantsAdd: "新增參與者",
  workspaceParticipantsRefresh: "重新整理參與者資料",
  tabsPending: "待審批",
  tabsActive: "使用中",
  tabsHistory: "歷史",
  assistedEnroll: "代報名",
  assistedEnrollAck: "只會建立報名紀錄，不會自動簽到。",
  reject: "拒絕",
  decisionNote: "決定備註",
  requestRejected: "已拒絕",
  cancelEnrollment: "退出課程",
  cancelEnrollmentReason: "取消原因",
  confirmCancelEnrollment: "確認取消",
  enrollmentCancelledNotice: "已退出課程",
  enrollmentHistory: "你的報名紀錄",
  eventRescheduledBadge: "已改期至 {time}",
  eventDetailTitle: "聚會詳情",
  eventMoreActions: "更多操作",
  eventEditTitle: "編輯聚會資料",
  eventEditSave: "儲存更改",
  eventSavedNotice: "聚會資料已更新。",
  eventDetailParticipantSummary: "報名與出席",
  eventLocation: "地點",
  eventManualSource: "手動",
  eventActive: "進行",
  eventNotStarted: "尚未開始",
  eventAvailable: "開放",
  eventAvailabilityDeactivate: "暫停聚會",
  eventAvailabilityActivate: "恢復開放",
  eventAvailabilityConfirmProceed: "確定暫停",
  eventAvailabilityConfirmBody:
    "暫停後，此聚會將停止開放簽到（{count} 項進行中的操作會受影響）。",
  eventAvailabilityNotice: "聚會已暫停開放。",
  eventAvailabilityUndo: "復原",
  eventAvailabilityRestoredNotice: "聚會已恢復開放。",
  cancelEvent: "取消聚會",
  confirmCancelEvent: "取消聚會",
  cancelReason: "取消原因",
  eventCancelled: "已取消",
  eventCancelledNotice: "聚會已取消。",
  previewLead:
    "先選擇實際日期範圍，再預覽目前時間表；預覽不會寫入任何聚會記錄。",
  previewPlanLabel: "已審閱預覽",
  previewFromDate: "由（香港時間）",
  previewUntilDate: "至（香港時間）",
  previewReviewAgain: "重新預覽",
  previewChanged: "顯示範圍或時間表已變更，請重新預覽。",
  previewAdjustOccurrence: "調整",
  previewAdjustSheetTitle: "調整今次安排",
  previewOccurrenceRescheduled: "已改期",
  previewRescheduleOccurrence: "改期本次",
  previewSaveException: "儲存今次安排",
  settingsExceptionNewDate: "改期日期（可留空）",
  settingsExceptionNewStart: "新開始時間",
  settingsExceptionNewEnd: "新結束時間",
  previewRemoveException: "移除已儲存安排",
  noManagementScope: "沒有管理範圍",
  notificationRegion: "管理通知",
  notificationBell: "開啟管理通知",
  notificationTitle: "管理通知",
  attentionEventCount: "{count} 場聚會需檢視",
  attentionCancelledCount: "{count} 場聚會狀態",
  attendanceChooserTitle: "聚會／出席",
  attendanceChooserLead: "選擇一個開放簽到的聚會，處理出席點名及代簽。",
  rosterTitle: "簽到名單",
  hubTitle: "管理工作",
  hubLead: "在你獲授權的範圍內處理會員、課程、聚會及內容工作。",
  hubGroupMemberPermissions: "會員與權限",
  hubGroupOperations: "事工營運",
  hubGroupContentSystem: "內容與系統",
  hubAccounts: "帳戶名錄",
  hubAccountsHint: "搜尋登入身份及帳戶狀態",
  hubApprovals: "註冊審批",
  hubApprovalsHint: "核准或拒絕會員申請",
  hubPermissions: "帳戶與權限",
  hubPermissionsHint: "管理員帳戶及角色",
  hubDepartments: "部門設定",
  hubDepartmentsHint: "部門開關、管理者及建立課程",
  hubAttendance: "聚會／出席",
  hubAttendanceHint: "出席點名、代簽及修正",
  hubMembers: "參與者",
  hubMembersHint: "搜尋並查看會員資料",
  hubHomeContent: "首頁內容",
  hubHomeContentHint: "版面 A／B 編輯及發佈",
  hubAnotherEntry: "另一個工作入口",
  hubGoCourseManagement: "前往課程管理",
  hubGoCourseManagementHint:
    "課程 tab 內以管理模式選擇課程，再進入 Course Cockpit。",
  approvalsTitle: "註冊審批",
  approvalsOpenDetail: "查看申請詳情",
  approvalDetailTitle: "註冊審批 · 詳情",
  approvalsBack: "返回註冊審批",
  approvalPending: "待審批",
  approvalApproved: "已核准",
  approvalRejected: "已拒絕",
  approvalApprove: "核准",
  approvalReject: "拒絕",
  approvalDecisionNote: "決定備註",
  approvalRejectionNoteRequired: "拒絕時必須填寫決定備註。",
  approvalConfirm: "確認核准",
  approvalRejectConfirm: "確認拒絕",
};

interface Fixture {
  departmentId: string;
  departmentName: string;
  programId: string;
  programName: string;
  description: string;
}

async function loginAs(
  page: Page,
  username = ADMIN.username,
  credential = ADMIN.credential
): Promise<void> {
  await page.goto("/");
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[autocomplete="current-password"]').fill(credential);
  await page.getByRole("button", { name: COPY.login }).click();
  await page.waitForURL((url) => url.pathname !== "/");
}

async function chooseSelectOption(
  page: Page,
  label: string,
  option: string
): Promise<void> {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

function localDateValue(date: Date): string {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) =>
      index === 0 ? String(part) : String(part).padStart(2, "0")
    )
    .join("-");
}

const HK_WALL_FORMATTER = new Intl.DateTimeFormat("zh-Hant", {
  timeZone: "Asia/Hong_Kong",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  hourCycle: "h23",
});

function hkWallLabel(iso: string): string {
  return HK_WALL_FORMATTER.format(new Date(iso));
}

async function chooseDate(
  page: Page,
  label: string,
  date: Date
): Promise<void> {
  const value = localDateValue(date);
  await page.getByRole("button", { name: label }).click();
  const day = page.locator(`[data-day="${value}"]`);
  const dayButton = day.getByRole("button");
  await ((await dayButton.count()) > 0 ? dayButton : day).click();
}

async function createFixture(page: Page, suffix: string): Promise<Fixture> {
  const fixture = await page.evaluate(async (value) => {
    async function post(
      path: string,
      data?: unknown,
      method: "POST" | "PATCH" = "POST"
    ) {
      const response = await fetch(path, {
        method,
        headers:
          data === undefined ? {} : { "Content-Type": "application/json" },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      return { status: response.status, body: await response.json() };
    }

    const departmentName = `E2E_T05M Management ${value}`;
    const department = await post("/api/v1/programs/departments", {
      code: `E2E_T05M_${value}`,
      name: departmentName,
      lifecycle: "Active",
    });
    if (department.status !== 201) {
      throw new Error(`department fixture returned HTTP ${department.status}`);
    }
    const departmentId = (
      department.body as { data: { department: { department_id: string } } }
    ).data.department.department_id;
    for (const moduleKey of ["program_catalog", "events", "enrollment"]) {
      const module = await post(
        `/api/v1/programs/departments/${departmentId}/modules/${moduleKey}/enable`
      );
      if (module.status !== 200) {
        throw new Error(`${moduleKey} fixture returned HTTP ${module.status}`);
      }
    }
    const programName = `E2E_T05M Program ${value}`;
    const description = "Disposable management Browser Acceptance fixture.";
    const program = await post(
      `/api/v1/programs/departments/${departmentId}/programs`,
      {
        name: programName,
        description,
        category: "T05",
        behavior_type: "Recurring",
        lifecycle: "Active",
        discoverability: "Listed",
        enrollment_mode: "MemberRequest",
      }
    );
    if (program.status !== 201) {
      throw new Error(`program fixture returned HTTP ${program.status}`);
    }
    const programId = (
      program.body as { data: { program: { program_id: string } } }
    ).data.program.program_id;
    const published = await post(
      `/api/v1/programs/${programId}`,
      {
        lifecycle: "Active",
        discoverability: "Listed",
      },
      "PATCH"
    );
    if (published.status !== 200) {
      throw new Error(
        `program fixture publish returned HTTP ${published.status}`
      );
    }
    return {
      departmentId,
      departmentName,
      programId,
      programName,
      description,
    };
  }, suffix);
  return fixture as Fixture;
}
async function createEventFixture(
  page: Page,
  fixture: Fixture,
  name: string,
  startsAt: string,
  endsAt: string
): Promise<string> {
  const event = await page.evaluate(
    async ({ programId, name: eventName, startsAt: start, endsAt: end }) => {
      const response = await fetch(
        `/api/v1/programs/${encodeURIComponent(programId)}/events`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            starts_at: start,
            ends_at: end,
            name: eventName,
            event_type: "訓練",
          }),
        }
      );
      const body = (await response.json()) as {
        data?: { event?: { event_id?: string } };
      };
      return {
        status: response.status,
        eventId: body.data?.event?.event_id ?? "",
      };
    },
    {
      programId: fixture.programId,
      name,
      startsAt,
      endsAt,
    }
  );
  if (event.status !== 201 || !event.eventId) {
    throw new Error(
      `event fixture returned HTTP ${event.status} without an event id`
    );
  }
  return event.eventId;
}

async function restoreFixture(page: Page, fixture: Fixture): Promise<void> {
  if (page.isClosed()) {
    return;
  }
  await page.evaluate(async ({ programId, programName, description }) => {
    const response = await fetch(`/api/v1/programs/${programId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: programName,
        description,
        category: "T05",
        lifecycle: "Active",
        discoverability: "Listed",
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `management fixture restore returned HTTP ${response.status}: ${body.slice(0, 500)}`
      );
    }
  }, fixture);
}

interface ApiResult {
  status: number;
  body: unknown;
}

async function apiRequest(
  page: Page,
  path: string,
  method = "GET",
  body?: unknown
): Promise<ApiResult> {
  return await page.evaluate(
    async ({ requestPath, requestMethod, requestBody }) => {
      const response = await fetch(requestPath, {
        method: requestMethod,
        headers: {
          ...(requestBody === undefined
            ? {}
            : { "Content-Type": "application/json" }),
          ...(requestMethod === "POST"
            ? { "Idempotency-Key": crypto.randomUUID() }
            : {}),
        },
        body:
          requestBody === undefined ? undefined : JSON.stringify(requestBody),
      });
      let responseBody: unknown = null;
      try {
        responseBody = await response.json();
      } catch {
        // Empty responses are valid for some mutation paths.
      }
      return { status: response.status, body: responseBody };
    },
    { requestPath: path, requestMethod: method, requestBody: body }
  );
}

function dataOf<T>(result: ApiResult): T {
  const body = result.body as { data?: T } | null;
  if (!body?.data) {
    throw new Error(`Expected data envelope, got HTTP ${result.status}`);
  }
  return body.data;
}

async function createProgramForFixture(
  page: Page,
  fixture: Fixture,
  name: string,
  behaviorType: "Recurring" | "OneOff" = "Recurring",
  enrollmentMode: "MemberRequest" | "ManagerOnly" = "MemberRequest"
): Promise<string> {
  return await createProgramForDepartment(
    page,
    fixture.departmentId,
    name,
    behaviorType,
    enrollmentMode
  );
}

async function createProgramForDepartment(
  page: Page,
  departmentId: string,
  name: string,
  behaviorType: "Recurring" | "OneOff" = "Recurring",
  enrollmentMode: "MemberRequest" | "ManagerOnly" = "MemberRequest"
): Promise<string> {
  const created = await apiRequest(
    page,
    `/api/v1/programs/departments/${encodeURIComponent(departmentId)}/programs`,
    "POST",
    {
      name,
      description: `Disposable parity fixture ${name}.`,
      category: "T05",
      behavior_type: behaviorType,
      lifecycle: "Active",
      discoverability: "Listed",
      enrollment_mode: enrollmentMode,
    }
  );
  expect(created.status).toBe(201);
  const programId = dataOf<{ program: { program_id: string } }>(created).program
    .program_id;
  const published = await apiRequest(
    page,
    `/api/v1/programs/${encodeURIComponent(programId)}`,
    "PATCH",
    { lifecycle: "Active", discoverability: "Listed" }
  );
  expect(published.status).toBe(200);
  return programId;
}

async function createEventForProgram(
  page: Page,
  programId: string,
  name: string,
  startsAt: string,
  endsAt: string,
  checkInWindow?: { opensAt: string; closesAt: string }
): Promise<string> {
  const created = await apiRequest(
    page,
    `/api/v1/programs/${encodeURIComponent(programId)}/events`,
    "POST",
    {
      name,
      starts_at: startsAt,
      ends_at: endsAt,
      event_type: "訓練",
      ...(checkInWindow
        ? {
            check_in_window_opens_at: checkInWindow.opensAt,
            check_in_window_closes_at: checkInWindow.closesAt,
          }
        : {}),
    }
  );
  expect(created.status).toBe(201);
  return dataOf<{ event: { event_id: string } }>(created).event.event_id;
}

async function eventRows(
  page: Page,
  programId: string
): Promise<{ event_id: string; availability?: string; status?: string }[]> {
  const listed = await apiRequest(
    page,
    `/api/v1/programs/${encodeURIComponent(programId)}/events`
  );
  expect(listed.status).toBe(200);
  return (
    dataOf<{
      events: { event_id: string; availability?: string; status?: string }[];
    }>(listed).events ?? []
  );
}

async function enrollmentRows(
  page: Page,
  programId: string
): Promise<
  { enrollment_id: string; member_user_id: string; status: string }[]
> {
  const listed = await apiRequest(
    page,
    `/api/v1/programs/${encodeURIComponent(programId)}/enrollments`
  );
  expect(listed.status).toBe(200);
  return (
    dataOf<{
      enrollments: {
        enrollment_id: string;
        member_user_id: string;
        status: string;
      }[];
    }>(listed).enrollments ?? []
  );
}

test.describe("T05.5 management Browser Acceptance", () => {
  test("cold management load makes one access request", async ({ page }) => {
    await loginAs(page);
    const accessRequests: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "GET" &&
        new URL(request.url()).pathname === "/api/v1/programs/access"
      ) {
        accessRequests.push(request.url());
      }
    });

    await page.goto("/programs?mode=management");
    // oxlint-disable-next-line vitest/prefer-importing-vitest-globals -- Playwright's expect is intentionally used in this browser suite.
    await expect(
      page.getByRole("heading", { name: COPY.directoryTitle })
    ).toBeVisible();
    await expect
      .poll(() => accessRequests.length, { timeout: 5000 })
      .toBeGreaterThan(0);
    await page.waitForTimeout(100);

    expect(accessRequests).toHaveLength(1);
  });

  test("shares a pending Home access prefetch with the Programs route", async ({
    page,
  }) => {
    let releaseAccess!: () => void;
    // The E2E config targets ES2022, so Promise.withResolvers is unavailable.
    // oxlint-disable-next-line promise/avoid-new -- a manually released request gate is required for this race proof
    const accessReleased = new Promise<void>((resolve) => {
      releaseAccess = resolve;
    });
    let accessRequests = 0;
    const accessRoute = "**/api/v1/programs/access";

    await page.route(accessRoute, async (route) => {
      accessRequests += 1;
      if (accessRequests === 1) {
        await accessReleased;
      }
      await route.continue();
    });

    try {
      await loginAs(page);
      await page.goto("/home");
      const programsLink = page.locator('a[href="/programs"]').first();
      await expect(programsLink).toBeVisible();
      await expect.poll(() => accessRequests).toBe(1);

      await programsLink.click();
      await page.waitForURL((url) => url.pathname === "/programs");
      await page.waitForTimeout(100);

      expect(accessRequests).toBe(1);
      releaseAccess();
      await expect(
        page.getByRole("heading", { name: COPY.participantDirectory })
      ).toBeVisible();
    } finally {
      releaseAccess();
      await page.unroute(accessRoute);
    }
  });

  test("admin opens a scoped Program, saves management data, and reads it back", async ({
    page,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    try {
      await page.goto("/programs?mode=management");
      await expect(
        page.getByRole("heading", { name: COPY.directoryTitle })
      ).toBeVisible();
      const search = page.getByRole("searchbox", {
        name: COPY.directorySearch,
      });
      await search.fill(fixture.programName);
      const programLink = page
        .getByRole("list", { name: COPY.directoryList })
        .getByRole("link", { name: fixture.programName });
      await expect(programLink).toBeVisible();
      await programLink.click();
      await expect(page).toHaveURL(
        new RegExp(
          `/programs\\?mode=management&program=${fixture.programId}$`,
          "u"
        )
      );

      await page.goto(
        `/programs?mode=management&program=${fixture.programId}&task=settings`
      );
      await expect(
        page.getByRole("heading", { name: COPY.settings })
      ).toBeVisible();
      await page
        .getByRole("button", { name: new RegExp(COPY.settingsBasics, "u") })
        .click();
      await expect(
        page.getByRole("heading", { name: COPY.settingsBasicsHeading })
      ).toBeVisible();
      const nameInput = page.getByRole("textbox", { name: COPY.programName });
      const descriptionInput = page.getByRole("textbox", {
        name: COPY.programDescription,
      });
      await expect(nameInput).toHaveValue(fixture.programName);
      await expect(descriptionInput).toHaveValue(fixture.description);

      const draftName = `${fixture.programName} Draft`;
      await nameInput.fill(draftName);
      await page.getByRole("link", { name: COPY.enterParticipant }).click();
      const leaveDialog = page.getByRole("alertdialog");
      await expect(leaveDialog).toBeVisible();
      await leaveDialog
        .getByRole("button", { name: COPY.settingsContinueEditing })
        .click();
      await expect(page).toHaveURL(
        new RegExp(
          `/programs\\?mode=management&program=${fixture.programId}&task=schedule&scheduleOrigin=settings$`,
          "u"
        )
      );
      const draftRecovery = page.getByRole("alertdialog");
      await draftRecovery
        .getByRole("button", { name: COPY.draftRecover })
        .click();
      await expect(draftRecovery).toHaveCount(0);
      await expect(nameInput).toHaveValue(draftName);
      await expect(
        page.locator('[data-screen-settings-dirty="true"]')
      ).toContainText(COPY.settingsUnsaved);
      await expect(
        page.getByRole("button", { name: COPY.saveBasics })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: COPY.settingsDiscard })
      ).toBeVisible();
      const dirtyActionGeometry = await page.evaluate(() => {
        const action = document.querySelector<HTMLElement>(
          "[data-testid=program-settings-dirty-actions]"
        );
        const form = document.querySelector<HTMLElement>(
          "#program-settings-basics-form"
        );
        const fields = form
          ? [
              ...form.querySelectorAll<HTMLElement>(
                "input, textarea, [role=combobox]"
              ),
            ].filter((field) => {
              const box = field.getBoundingClientRect();
              return box.width > 0 && box.height > 0;
            })
          : [];
        const actionBox = action?.getBoundingClientRect();
        const targets = [
          ...(action?.querySelectorAll<HTMLElement>("button") ?? []),
        ].map((target) => target.getBoundingClientRect());

        return {
          actionTop: actionBox?.top ?? Number.NEGATIVE_INFINITY,
          fieldBottom: Math.max(
            ...fields.map((field) => field.getBoundingClientRect().bottom),
            Number.NEGATIVE_INFINITY
          ),
          minimumTarget: Math.min(
            ...targets.map((box) => Math.min(box.width, box.height))
          ),
          overflow:
            Math.max(
              document.documentElement.scrollWidth,
              document.body.scrollWidth
            ) - window.innerWidth,
          position: action ? getComputedStyle(action).position : null,
          bottom: action ? getComputedStyle(action).bottom : null,
        };
      });
      expect(dirtyActionGeometry.position).toBe("static");
      expect(dirtyActionGeometry.bottom).toBe("auto");
      expect(dirtyActionGeometry.actionTop).toBeGreaterThanOrEqual(
        dirtyActionGeometry.fieldBottom - 1
      );
      expect(dirtyActionGeometry.minimumTarget).toBeGreaterThanOrEqual(44);
      expect(dirtyActionGeometry.overflow).toBeLessThanOrEqual(1);

      await page.getByRole("link", { name: COPY.settingsBack }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: COPY.settingsContinueEditing })
        .click();
      await expect(
        page.getByRole("heading", { name: COPY.settingsBasicsHeading })
      ).toBeVisible();
      await expect(nameInput).toHaveValue(draftName);

      await page.getByRole("link", { name: COPY.home }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: COPY.settingsContinueEditing })
        .click();
      await expect(nameInput).toHaveValue(draftName);
      await expect(
        page.locator('[data-screen-settings-dirty="true"]')
      ).toContainText(COPY.settingsUnsaved);
      await expect(
        page.getByRole("button", { name: COPY.settingsDiscard })
      ).toBeVisible();

      await page.getByRole("link", { name: COPY.settingsBack }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: COPY.settingsContinueEditing })
        .click();

      await page.getByRole("button", { name: COPY.settingsDiscard }).click();
      await expect(nameInput).toHaveValue(fixture.programName);
      await expect(
        page.locator('[data-screen-settings-dirty="true"]')
      ).toHaveCount(0);
      await page.getByRole("link", { name: COPY.settingsBack }).click();
      await expect(
        page.getByRole("heading", { name: COPY.settings })
      ).toBeVisible();

      await page
        .getByRole("button", { name: new RegExp(COPY.settingsBasics, "u") })
        .click();
      await page.getByRole("link", { name: COPY.settingsBack }).click();
      await expect(
        page.getByRole("heading", { name: COPY.settings })
      ).toBeVisible();

      await page
        .getByRole("button", { name: new RegExp(COPY.settingsBasics, "u") })
        .click();
      await expect(nameInput).toHaveValue(fixture.programName);

      const updatedName = `${fixture.programName} Updated`;
      const updatedDescription = `${fixture.description} Updated`;
      await nameInput.fill(updatedName);
      await descriptionInput.fill(updatedDescription);
      await page.getByRole("button", { name: COPY.saveBasics }).click();
      await expect(
        page.getByText(COPY.saved, { exact: true }).first()
      ).toBeVisible();
      await expect(nameInput).toHaveValue(updatedName);
      await expect(descriptionInput).toHaveValue(updatedDescription);

      // R42/AC41: the saved authoritative Program is visible in Overview
      // without a full-page reload or remount from the old directory props.
      await page.getByRole("link", { name: COPY.settingsBack }).click();
      await expect(
        page.getByRole("heading", { name: COPY.settings })
      ).toBeVisible();
      await page.getByRole("link", { name: COPY.workspaceOverview }).click();
      await expect(page).toHaveURL(
        new RegExp(
          `/programs\\?mode=management&program=${fixture.programId}$`,
          "u"
        )
      );
      await expect(
        page.getByRole("heading", { name: updatedName, exact: true })
      ).toBeVisible();

      await page.reload();
      await page.goto(
        `/programs?mode=management&program=${fixture.programId}&task=settings`
      );
      await page
        .getByRole("button", { name: new RegExp(COPY.settingsBasics, "u") })
        .click();
      await expect(
        page.getByRole("textbox", { name: COPY.programName })
      ).toHaveValue(updatedName);
      await expect(
        page.getByRole("textbox", { name: COPY.programDescription })
      ).toHaveValue(updatedDescription);

      await page.goto(
        `/programs?mode=management&program=${fixture.programId}&task=settings`
      );
      await expect(
        page.getByRole("heading", { name: COPY.settings })
      ).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 480));
      await page.getByRole("link", { name: COPY.enterParticipant }).click();
      await expect(page).toHaveURL(/\/programs$/u);
      await expect(
        page.getByRole("heading", {
          name: COPY.participantDirectory,
          exact: true,
        })
      ).toBeVisible();

      await page.evaluate(() => window.scrollTo(0, 480));
      await page.getByRole("link", { name: COPY.enterManagement }).click();
      await expect(page).toHaveURL(/\/programs\?mode=management$/u);
      await expect(
        page.getByRole("heading", { name: COPY.directoryTitle, exact: true })
      ).toBeVisible();
    } finally {
      await restoreFixture(page, fixture);
    }
  });

  test("programs-d1 #55: generation refreshes the visible Events directory", async ({
    page,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    try {
      const ruleStatus = await page.evaluate(async (programId) => {
        const response = await fetch(
          "/api/v1/programs/" +
            encodeURIComponent(programId) +
            "/schedule-rules",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recurrence: "WEEKLY",
              day_of_week: 3,
              start_time: "19:30",
              end_time: "20:45",
            }),
          }
        );
        return response.status;
      }, fixture.programId);
      expect(ruleStatus).toBe(201);

      await page.goto(
        "/programs?mode=management&program=" +
          encodeURIComponent(fixture.programId) +
          "&task=schedule"
      );
      await expect(
        page.getByRole("heading", { name: COPY.schedulePageTitle })
      ).toBeVisible();
      const generate = page.getByRole("button", {
        name: COPY.generateEvents,
      });
      await page.getByRole("button", { name: COPY.previewEvents }).click();
      await expect(generate).toBeEnabled();
      await generate.click();
      await expect(
        page.getByText(/^已產生 \d+ 場聚會，跳過 \d+ 場重複。$/u).first()
      ).toBeVisible();
      const firstGenerationCount = (await eventRows(page, fixture.programId))
        .length;
      await expect(generate).toBeEnabled();
      await generate.click();
      await expect(
        page.getByText(/^已接續上次產生，新增 0 場，跳過 \d+ 場。$/u).first()
      ).toBeVisible();
      expect((await eventRows(page, fixture.programId)).length).toBe(
        firstGenerationCount
      );

      const upcomingEventId = await page.evaluate(async (programId) => {
        const response = await fetch(
          "/api/v1/programs/" + encodeURIComponent(programId) + "/events"
        );
        const body = (await response.json()) as {
          data?: {
            events?: {
              event_id: string;
              starts_at: string;
              status: string;
            }[];
          };
        };
        return (
          (body.data?.events ?? []).find(
            (event) =>
              event.status === "Active" &&
              Date.parse(event.starts_at) > Date.now()
          )?.event_id ?? null
        );
      }, fixture.programId);
      expect(upcomingEventId).toBeTruthy();

      await page
        .getByRole("link", {
          name: COPY.returnManagementDirectory,
          exact: true,
        })
        .click();
      await expect(page).toHaveURL(/task=events/u);
      await expect(
        page.locator('[data-event-id="' + upcomingEventId + '"]')
      ).toBeVisible();
    } finally {
      await restoreFixture(page, fixture);
    }
  });

  test("programs-d1 #38: discoverability changes wait for confirmation before saving", async ({
    page,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    const programRoute = `**/api/v1/programs/${fixture.programId}`;
    let updates = 0;
    await page.route(programRoute, async (route) => {
      if (route.request().method() === "PATCH") {
        updates += 1;
      }
      await route.continue();
    });

    try {
      await page.goto(
        `/programs?mode=management&program=${fixture.programId}&task=settings`
      );
      await page
        .getByRole("button", { name: new RegExp(COPY.settingsPublishing, "u") })
        .click();
      const discoverability = page.getByRole("combobox", {
        name: COPY.discoverabilityListed,
      });
      await expect(discoverability).toHaveText(COPY.discoverabilityListed);
      await chooseSelectOption(
        page,
        COPY.discoverabilityListed,
        COPY.discoverabilityUnlisted
      );
      await page
        .getByRole("button", { name: COPY.savePublishing, exact: true })
        .click();

      const confirmation = page.getByRole("alert", {
        name: COPY.confirmPublishing,
      });
      await expect(confirmation).toBeVisible();
      expect(updates).toBe(0);

      const unlistResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "PATCH" &&
          response.url().includes(`/api/v1/programs/${fixture.programId}`)
      );
      await confirmation
        .getByRole("button", { name: COPY.confirmChange })
        .click();
      expect((await unlistResponse).status()).toBe(200);
      await expect(discoverability).toHaveText(COPY.discoverabilityUnlisted);
      expect(updates).toBe(1);

      await chooseSelectOption(
        page,
        COPY.discoverabilityListed,
        COPY.discoverabilityListed
      );
      await page
        .getByRole("button", { name: COPY.savePublishing, exact: true })
        .click();
      const relistConfirmation = page.getByRole("alert", {
        name: COPY.confirmPublishing,
      });
      await expect(relistConfirmation).toBeVisible();
      expect(updates).toBe(1);

      const relistResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "PATCH" &&
          response.url().includes(`/api/v1/programs/${fixture.programId}`)
      );
      await relistConfirmation
        .getByRole("button", { name: COPY.confirmChange })
        .click();
      expect((await relistResponse).status()).toBe(200);
      await expect(discoverability).toHaveText(COPY.discoverabilityListed);
      expect(updates).toBe(2);
    } finally {
      await page.unroute(programRoute).catch(() => {});
      await restoreFixture(page, fixture);
    }
  });

  test("programs-d1 #41: offline department save stays inline and reports the save error", async ({
    page,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    try {
      await page.goto("/programs?mode=management");
      await page
        .locator("#programs-management-department-settings-trigger")
        .click();
      const picker = page.getByRole("dialog", {
        name: COPY.departmentSettings,
      });
      if ((await picker.count()) > 0) {
        await picker
          .getByRole("button", { name: fixture.departmentName, exact: true })
          .click();
      }

      const departmentPanel = page.locator(
        `[id="${fixture.departmentId}-settings-panel"]`
      );
      await expect(departmentPanel).toHaveRole("region");
      await expect(departmentPanel).toBeVisible();
      const name = departmentPanel.getByRole("textbox", {
        name: COPY.departmentName,
      });
      await name.fill("離線不應儲存");
      const originalUrl = page.url();
      await page.context().setOffline(true);
      try {
        await departmentPanel
          .getByRole("button", { name: COPY.saveDepartment })
          .click();
        await expect(departmentPanel.getByRole("alert")).toHaveText(
          COPY.offlineError
        );
        await expect(page).toHaveURL(originalUrl);
        await expect(name).toHaveValue("離線不應儲存");
      } finally {
        await page.context().setOffline(false);
      }
    } finally {
      await restoreFixture(page, fixture);
    }
  });

  test("keeps a successful Settings write distinct from a failed workspace readback", async ({
    page,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    const managementRoute = `**/api/v1/programs/${fixture.programId}/management`;
    let managementReads = 0;
    try {
      await page.goto(
        `/programs?mode=management&program=${fixture.programId}&task=settings`
      );
      await expect(
        page.getByRole("heading", { name: COPY.settings })
      ).toBeVisible();
      await page
        .getByRole("button", { name: new RegExp(COPY.settingsBasics, "u") })
        .click();
      const nameInput = page.getByRole("textbox", { name: COPY.programName });
      await expect(nameInput).toHaveValue(fixture.programName);

      await page.route(managementRoute, async (route) => {
        if (route.request().method() !== "GET") {
          await route.continue();
          return;
        }
        managementReads += 1;
        if (managementReads === 1) {
          await route.fulfill({
            status: 503,
            contentType: "application/problem+json",
            body: JSON.stringify({
              status: 503,
              code: "UNAVAILABLE",
              title: "Unavailable",
              detail: "測試中的 workspace readback failure",
            }),
          });
          return;
        }
        await route.continue();
      });

      const updatedName = `${fixture.programName} Readback`;
      await nameInput.fill(updatedName);
      await page.getByRole("button", { name: COPY.saveBasics }).click();
      await expect(
        page.getByText(COPY.saved, { exact: true }).first()
      ).toBeVisible();
      await expect(
        page
          .getByTestId("program-workspace-freshness")
          .getByText(COPY.workspaceSavedStale)
      ).toBeVisible();
      await expect(
        page
          .getByTestId("program-workspace-freshness")
          .getByRole("button", { name: COPY.workspaceRetryRefresh })
      ).toBeVisible();
      expect(managementReads).toBe(1);

      await page
        .getByTestId("program-workspace-freshness")
        .getByRole("button", { name: COPY.workspaceRetryRefresh })
        .click();
      await expect(page.getByTestId("program-workspace-freshness")).toHaveCount(
        0
      );
      await expect(nameInput).toHaveValue(updatedName);
      expect(managementReads).toBe(2);
    } finally {
      await page.unroute(managementRoute).catch(() => {});
      await restoreFixture(page, fixture);
    }
  });

  test("consumes one-shot Event create intent and keeps Cancel closed", async ({
    page,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    try {
      await page.goto(
        `/programs?mode=management&program=${encodeURIComponent(fixture.programId)}&task=events#create-event`
      );
      const createForm = page.getByRole("form", { name: COPY.createMeeting });
      await expect(createForm).toBeVisible();
      await expect.poll(() => new URL(page.url()).hash).toBe("");

      await createForm
        .getByRole("button", { name: COPY.eventCreateCancel })
        .click();
      await expect(createForm).toHaveCount(0);

      const headerCreate = page.getByRole("button", {
        name: COPY.createMeeting,
        exact: true,
      });
      await expect(headerCreate).toHaveCount(1);
      await expect(headerCreate).not.toHaveAttribute("aria-expanded");
      await expect(headerCreate).not.toHaveAttribute("aria-pressed");
      await headerCreate.click();
      await expect(createForm).toBeVisible();
      await createForm
        .getByRole("button", { name: COPY.eventCreateCancel })
        .click();
      await expect(createForm).toHaveCount(0);

      await page.reload();
      await expect(
        page.getByRole("form", { name: COPY.createMeeting })
      ).toHaveCount(0);
    } finally {
      await restoreFixture(page, fixture);
    }
  });

  test("restores the Events filter and list position after browser Back from a focused Event", async ({
    page,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    const eventName = `E2E_626_Past Event ${fixture.programId.slice(-8)}`;
    const startsAt = new Date(Date.now() - 2 * 24 * 60 * 60_000);
    let eventId = "";
    try {
      eventId = await createEventFixture(
        page,
        fixture,
        eventName,
        startsAt.toISOString(),
        new Date(startsAt.getTime() + 60 * 60_000).toISOString()
      );
      // Enough rows that the past list overflows the phone viewport, so the
      // restored shell position is a real assertion rather than a no-op.
      for (let index = 1; index <= 12; index += 1) {
        const fillerStart = new Date(
          startsAt.getTime() - index * 24 * 60 * 60_000
        );
        await createEventFixture(
          page,
          fixture,
          `E2E_626_Filler ${index} ${fixture.programId.slice(-8)}`,
          fillerStart.toISOString(),
          new Date(fillerStart.getTime() + 60 * 60_000).toISOString()
        );
      }
      await page.goto(
        `/programs?mode=management&program=${encodeURIComponent(fixture.programId)}&task=events`
      );
      await expect(
        page.getByRole("heading", { name: COPY.workspaceEvents, exact: true })
      ).toBeVisible();
      const pastTab = page.getByRole("tab", { name: COPY.eventFilterPast });
      await pastTab.click();
      await expect
        .poll(() => new URL(page.url()).searchParams.get("eventFilter"))
        .toBe("past");
      await expect(pastTab).toHaveAttribute("aria-selected", "true");

      const eventRow = page.locator(`[data-event-id="${eventId}"]`);
      await expect(eventRow).toBeVisible();
      await page.evaluate(() => {
        const scroller = document.querySelector<HTMLElement>("#shell-content");
        scroller?.scrollTo(0, scroller.scrollHeight);
      });
      const scrolledTo = await page.evaluate(() => {
        const scroller = document.querySelector<HTMLElement>("#shell-content");
        return scroller?.scrollTop ?? 0;
      });
      expect(scrolledTo).toBeGreaterThan(0);

      await eventRow.getByRole("link").first().click();
      await expect
        .poll(() => new URL(page.url()).searchParams.get("event"))
        .toBe(eventId);
      await expect(
        page.getByRole("heading", { name: eventName })
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: COPY.eventDetailBack })
      ).toBeVisible();

      await page.goBack();
      await expect
        .poll(() => new URL(page.url()).searchParams.get("event"))
        .toBeNull();
      await expect
        .poll(() => new URL(page.url()).searchParams.get("eventFilter"))
        .toBe("past");
      await expect(pastTab).toHaveAttribute("aria-selected", "true");
      await expect(eventRow).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(() => {
            const scroller =
              document.querySelector<HTMLElement>("#shell-content");
            return scroller?.scrollTop ?? 0;
          })
        )
        .toBe(scrolledTo);
    } finally {
      await restoreFixture(page, fixture);
    }
  });

  test("restores the Participants list position after returning from Overview", async ({
    page,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    try {
      for (let index = 0; index < 14; index += 1) {
        const created = await page.evaluate(async (programId) => {
          const response = await fetch(
            `/api/v1/programs/${encodeURIComponent(programId)}/enrollments`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ member_user_id: "U-E2E-MEMBER" }),
            }
          );
          return {
            status: response.status,
            body: (await response.json()) as {
              data?: { enrollment?: { enrollment_id?: string } };
            },
          };
        }, fixture.programId);
        expect(created.status).toBe(201);
        const enrollmentId = created.body.data?.enrollment?.enrollment_id;
        expect(enrollmentId).toBeTruthy();
        const cancelled = await page.evaluate(
          async ({ programId, enrollmentId }) => {
            const response = await fetch(
              `/api/v1/programs/${encodeURIComponent(programId)}/enrollments/${encodeURIComponent(enrollmentId ?? "")}/cancel`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: "滾動位置測試" }),
              }
            );
            return response.status;
          },
          { programId: fixture.programId, enrollmentId }
        );
        expect(cancelled).toBe(200);
      }

      await page.goto(
        `/programs?mode=management&program=${encodeURIComponent(fixture.programId)}&task=participants&participantTab=history`
      );
      await expect(
        page.getByRole("heading", { name: COPY.workspaceParticipants })
      ).toBeVisible();
      await expect
        .poll(() => page.locator("#participants-history-panel li").count())
        .toBeGreaterThan(10);
      const historyTab = page.getByRole("tab", { name: /歷史/ });
      await historyTab.focus();
      await expect(historyTab).toBeFocused();
      await page.evaluate(() => {
        const scroller = document.querySelector<HTMLElement>("#shell-content");
        scroller?.scrollTo(0, scroller.scrollHeight);
      });
      const scrolledTo = await page.evaluate(
        () =>
          document.querySelector<HTMLElement>("#shell-content")?.scrollTop ?? 0
      );
      expect(scrolledTo).toBeGreaterThan(0);

      await page.getByRole("link", { name: COPY.workspaceOverview }).click();
      await expect(
        page.getByRole("heading", { name: fixture.programName })
      ).toBeVisible();
      await page
        .getByTestId("programs-workspace-tabs")
        .getByRole("link", { name: COPY.workspaceParticipants })
        .click();
      await expect
        .poll(() => new URL(page.url()).searchParams.get("task"))
        .toBe("participants");
      await expect(
        page.getByRole("heading", { name: COPY.workspaceParticipants })
      ).toBeVisible();
      await expect
        .poll(() => page.locator("#participants-history-panel li").count(), {
          timeout: 15_000,
        })
        .toBeGreaterThan(10);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.querySelector<HTMLElement>("#shell-content")
                ?.scrollTop ?? 0
          )
        )
        .toBe(scrolledTo);
      await expect(page.locator("#participants-history-tab")).toBeFocused();
    } finally {
      await restoreFixture(page, fixture);
    }
  });

  test("keeps modifier-key notification navigation independent from read failures", async ({
    page,
    browser,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    let linkedPage: Page | null = null;
    const readRoute = "**/api/v1/programs/notifications/read";
    let readAttempts = 0;
    try {
      const memberContext = await browser.newContext();
      try {
        const memberPage = await memberContext.newPage();
        await loginAs(memberPage, "E2E_member", "E2E_member!dev");
        const requestStatus = await memberPage.evaluate(async (programId) => {
          const response = await fetch(
            `/api/v1/programs/${encodeURIComponent(programId)}/enrollment-requests`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            }
          );
          return response.status;
        }, fixture.programId);
        expect([200, 201]).toContain(requestStatus);
      } finally {
        await memberContext.close();
      }

      await page.route(readRoute, async (route) => {
        readAttempts += 1;
        await route.fulfill({
          status: 503,
          contentType: "application/problem+json",
          body: JSON.stringify({
            status: 503,
            code: "UNAVAILABLE",
            title: "Unavailable",
            detail: "測試中的通知讀取失敗",
          }),
        });
      });
      await page.goto("/programs?mode=management&task=notifications");
      await expect(
        page.getByRole("heading", {
          name: COPY.notificationsTitle,
          exact: true,
        })
      ).toBeVisible();
      const notificationLink = page
        .locator(
          `a[href*="program=${encodeURIComponent(fixture.programId)}"][href*="task=participants"]`
        )
        .first();
      await expect(notificationLink).toBeVisible();

      const newTabModifier = process.platform === "darwin" ? "Meta" : "Control";
      const linkedPagePromise = page.context().waitForEvent("page");
      await notificationLink.click({ modifiers: [newTabModifier] });
      linkedPage = await linkedPagePromise;
      await expect
        .poll(() =>
          new URL(linkedPage?.url() ?? "").searchParams.get("program")
        )
        .toBe(fixture.programId);
      await expect
        .poll(() => new URL(linkedPage?.url() ?? "").searchParams.get("task"))
        .toBe("participants");
      await expect(
        linkedPage.getByRole("heading", { name: fixture.programName })
      ).toBeVisible();
      await expect.poll(() => readAttempts).toBe(1);
      await expect(
        page.getByText(COPY.notificationsReadError, { exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: COPY.notificationsRetry })
      ).toBeVisible();
    } finally {
      await page.unroute(readRoute).catch(() => {});
      await linkedPage?.close().catch(() => {});
      await restoreFixture(page, fixture);
    }
  });

  test("keeps a normal notification click on the real task while mark-read fails", async ({
    page,
    browser,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    const readRoute = "**/api/v1/programs/notifications/read";
    let readAttempts = 0;
    try {
      const memberContext = await browser.newContext();
      try {
        const memberPage = await memberContext.newPage();
        await loginAs(memberPage, "E2E_member", "E2E_member!dev");
        const requestStatus = await memberPage.evaluate(async (programId) => {
          const response = await fetch(
            `/api/v1/programs/${encodeURIComponent(programId)}/enrollment-requests`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            }
          );
          return response.status;
        }, fixture.programId);
        expect([200, 201]).toContain(requestStatus);
      } finally {
        await memberContext.close();
      }

      await page.route(readRoute, async (route) => {
        readAttempts += 1;
        await route.fulfill({
          status: 503,
          contentType: "application/problem+json",
          body: JSON.stringify({
            status: 503,
            code: "UNAVAILABLE",
            title: "Unavailable",
            detail: "測試中的通知讀取失敗",
          }),
        });
      });
      await page.goto("/programs?mode=management&task=notifications");
      await expect(
        page.getByRole("heading", {
          name: COPY.notificationsTitle,
          exact: true,
        })
      ).toBeVisible();
      const notificationLink = page
        .locator(
          `a[href*="program=${encodeURIComponent(fixture.programId)}"][href*="task=participants"]`
        )
        .first();
      await expect(notificationLink).toBeVisible();

      await notificationLink.click();

      await expect
        .poll(() => new URL(page.url()).searchParams.get("task"))
        .toBe("participants");
      await expect
        .poll(() => new URL(page.url()).searchParams.get("program"))
        .toBe(fixture.programId);
      await expect.poll(() => readAttempts).toBe(1);
      await expect(
        page.getByRole("heading", { name: fixture.programName })
      ).toBeVisible();
    } finally {
      await page.unroute(readRoute).catch(() => {});
      await restoreFixture(page, fixture);
    }
  });

  test("settings, Event, and Enrollment mutations converge in Overview without reload", async ({
    page,
  }: {
    page: Page;
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    let eventId = "";
    try {
      await page.context().clearCookies();
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await loginAs(page, "E2E_member", "E2E_member!dev");
      await page.goto(`/programs?program=${fixture.programId}`);
      await page.getByRole("button", { name: COPY.enroll }).click();
      await expect(
        page.getByText("報名申請已提交", { exact: true })
      ).toBeVisible();

      await page.context().clearCookies();
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await loginAs(page);
      await page.goto(`/programs?mode=management&program=${fixture.programId}`);
      await expect(
        page.getByRole("heading", { name: fixture.programName })
      ).toBeVisible();

      await page
        .getByRole("link", { name: COPY.workspaceEvents, exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: COPY.workspaceEvents, exact: true })
      ).toBeVisible();
      await page
        .getByRole("button", { name: COPY.createMeeting })
        .first()
        .click();
      const createForm = page.getByRole("form", {
        name: COPY.createMeeting,
      });
      await chooseDate(
        page,
        COPY.eventDate,
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      );
      await createForm.locator("#programs-event-time").fill("10:00");
      await createForm
        .getByLabel(COPY.eventName)
        .fill("E2E_622_Overview Event");
      await chooseSelectOption(page, COPY.eventType, COPY.eventTypeTraining);
      await createForm
        .getByRole("button", { name: COPY.createMeeting })
        .click();
      await expect(
        page.getByRole("heading", { name: "E2E_622_Overview Event" })
      ).toBeVisible({ timeout: 15_000 });
      eventId = new URL(page.url()).searchParams.get("event") ?? "";
      expect(eventId).toBeTruthy();

      await page.getByRole("link", { name: COPY.workspaceOverview }).click();
      await expect(
        page.getByRole("heading", { name: fixture.programName })
      ).toBeVisible();
      await expect(page.getByText("E2E_622_Overview Event")).toBeVisible();
      await expect(page.getByText(/1 個聚會/u).first()).toBeVisible();

      await page.goto(
        `/programs?mode=management&program=${fixture.programId}&task=participants`
      );
      await expect(
        page.getByRole("heading", { name: COPY.workspaceParticipants })
      ).toBeVisible();
      const pendingRow = page
        .getByRole("listitem")
        .filter({ hasText: "E2E Member" });
      await pendingRow.getByRole("button", { name: COPY.approve }).click();
      await expect(
        page.getByLabel(fixture.programName).getByText(COPY.decisionMade, {
          exact: true,
        })
      ).toBeVisible();

      await page.getByRole("link", { name: COPY.workspaceOverview }).click();
      await expect(
        page.getByText(COPY.pendingCount, { exact: true }).locator("..")
      ).toContainText("0");
      await expect(
        page.getByText(COPY.activeParticipants, { exact: true }).locator("..")
      ).toContainText("1");
    } finally {
      if (!page.isClosed()) {
        await page.evaluate(
          async ({ programId, eventId }) => {
            const enrollmentsResponse = await fetch(
              `/api/v1/programs/${encodeURIComponent(programId)}/enrollments`
            );
            const enrollmentsBody = (await enrollmentsResponse.json()) as {
              data?: {
                enrollments?: {
                  enrollment_id: string;
                  member_user_id: string;
                  status: string;
                }[];
              };
            };
            const active = enrollmentsBody.data?.enrollments?.find(
              (item) =>
                item.member_user_id === "U-E2E-MEMBER" &&
                item.status === "Active"
            );
            if (active) {
              await fetch(
                `/api/v1/programs/${encodeURIComponent(programId)}/enrollments/${encodeURIComponent(active.enrollment_id)}/cancel`,
                { method: "POST", body: "{}" }
              );
            }
            if (eventId) {
              await fetch(
                `/api/v1/programs/${encodeURIComponent(programId)}/events/${encodeURIComponent(eventId)}`,
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    status: "Cancelled",
                    cancel_reason: "測試清理",
                  }),
                }
              );
            }
          },
          { programId: fixture.programId, eventId }
        );
        await restoreFixture(page, fixture);
      }
    }
  });
});

test.describe("Programs parity replacements 29-30", () => {
  test("programs-d1 #29: blank Basics name is rejected without a write", async ({
    page,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    const programPath = `/api/v1/programs/${encodeURIComponent(fixture.programId)}`;
    let updateRequests = 0;
    const onRequest = (request: Request): void => {
      if (
        request.method() === "PATCH" &&
        new URL(request.url()).pathname === programPath
      ) {
        updateRequests += 1;
      }
    };
    page.on("request", onRequest);
    try {
      const before = dataOf<{
        program: { name: string; description: string | null };
      }>(
        await apiRequest(
          page,
          `/api/v1/programs/${fixture.programId}/management`
        )
      ).program;
      await page.goto(
        `/programs?mode=management&program=${encodeURIComponent(fixture.programId)}&task=settings`
      );
      await page
        .getByRole("button", { name: new RegExp(COPY.settingsBasics, "u") })
        .click();
      const nameInput = page.getByRole("textbox", { name: COPY.programName });
      await expect(nameInput).toHaveValue(fixture.programName);
      // The required attribute owns the empty-string case in the browser.
      // Whitespace reaches the application validator, which must trim it.
      await nameInput.fill("   ");
      await page.getByRole("button", { name: COPY.saveBasics }).click();
      await expect(
        page
          .getByRole("alert")
          .filter({ hasText: APP_COPY.programs.settingsBasicsValidation })
      ).toBeVisible();
      expect(updateRequests).toBe(0);
      const after = dataOf<{
        program: { name: string; description: string | null };
      }>(
        await apiRequest(
          page,
          `/api/v1/programs/${fixture.programId}/management`
        )
      ).program;
      expect(after).toEqual(before);
    } finally {
      page.off("request", onRequest);
      await restoreFixture(page, fixture);
    }
  });

  test("programs-d1 #30: Participants approval updates scoped Pending and Active counts", async ({
    page,
    browser,
  }) => {
    await loginAs(page);
    const directory = await apiRequest(
      page,
      "/api/v1/programs/management-directory"
    );
    expect(directory.status).toBe(200);
    const seededProgram = dataOf<{
      programs: { name: string; department_id: string }[];
    }>(directory).programs.find(({ name }) => name === "E2E_DEMO_成人查經");
    expect(seededProgram?.department_id).toBeTruthy();
    const departmentId = seededProgram?.department_id ?? "";
    let programId = "";
    let memberContext: BrowserContext | null = null;
    let memberPage: Page | null = null;
    let requestId = "";
    let resolved = false;
    let rejectedContext: BrowserContext | null = null;
    let rejectedPage: Page | null = null;
    let rejectedRequestId = "";
    let rejectionResolved = false;
    let enrollmentWasEnabled: boolean | null = null;
    try {
      const departmentBefore = await apiRequest(
        page,
        `/api/v1/programs/departments/${encodeURIComponent(departmentId)}`
      );
      expect(departmentBefore.status).toBe(200);
      const enrollmentModuleBefore = dataOf<{
        modules: { module_key: string; enabled: number }[];
      }>(departmentBefore).modules.find(
        ({ module_key }) => module_key === "enrollment"
      );
      expect(enrollmentModuleBefore).toEqual(
        expect.objectContaining({ module_key: "enrollment" })
      );
      enrollmentWasEnabled = enrollmentModuleBefore?.enabled === 1;
      const enrollmentEnabled = await apiRequest(
        page,
        `/api/v1/programs/departments/${encodeURIComponent(departmentId)}/modules/enrollment/enable`,
        "POST"
      );
      expect(enrollmentEnabled.status).toBe(200);
      const department = await apiRequest(
        page,
        `/api/v1/programs/departments/${encodeURIComponent(departmentId)}`
      );
      expect(department.status).toBe(200);
      const enrollmentModule = dataOf<{
        modules: { module_key: string; enabled: number }[];
      }>(department).modules.find(
        ({ module_key }) => module_key === "enrollment"
      );
      expect(enrollmentModule).toEqual(
        expect.objectContaining({ module_key: "enrollment", enabled: 1 })
      );
      programId = await createProgramForDepartment(
        page,
        departmentId,
        `E2E_PARITY_30_${Date.now()}`,
        "OneOff"
      );
      memberContext = await browser.newContext();
      memberPage = await memberContext.newPage();
      await loginAs(memberPage, MEMBER.username, MEMBER.credential);
      const request = await apiRequest(
        memberPage,
        `/api/v1/programs/${encodeURIComponent(programId)}/enrollment-requests`,
        "POST",
        {}
      );
      expect(request.status).toBe(201);
      requestId = dataOf<{ request: { request_id: string } }>(request).request
        .request_id;

      await page.goto(
        `/programs?mode=management&program=${encodeURIComponent(programId)}&task=participants`
      );
      const pendingTab = page.getByRole("tab", {
        name: new RegExp(`${COPY.tabsPending} \\(1\\)`, "u"),
      });
      const activeTab = page.getByRole("tab", {
        name: new RegExp(`${COPY.tabsActive} \\(0\\)`, "u"),
      });
      await expect(pendingTab).toBeVisible();
      await expect(activeTab).toBeVisible();
      const requestRow = page
        .getByRole("listitem")
        .filter({ hasText: "E2E Member" });
      await expect(
        requestRow.getByRole("button", { name: COPY.approve })
      ).toBeVisible();
      await requestRow.getByRole("button", { name: COPY.approve }).click();
      await expect(
        page
          .getByText(COPY.decisionMade, { exact: true })
          .filter({ visible: true })
          .first()
      ).toBeVisible();
      resolved = true;
      await expect(
        page.getByRole("tab", {
          name: new RegExp(`${COPY.tabsPending} \\(0\\)`, "u"),
        })
      ).toBeVisible();
      const activeAfterApproval = page.getByRole("tab", {
        name: new RegExp(`${COPY.tabsActive} \\(1\\)`, "u"),
      });
      await expect(activeAfterApproval).toBeVisible();
      await activeAfterApproval.click();
      await expect(
        page.getByRole("list", { name: COPY.workspaceActiveParticipants })
      ).toContainText("E2E Member");

      const firstEnrollment = (await enrollmentRows(page, programId)).find(
        (enrollment) =>
          enrollment.member_user_id === "U-E2E-MEMBER" &&
          enrollment.status === "Active"
      );
      expect(firstEnrollment?.enrollment_id).toBeTruthy();
      const cancelled = await apiRequest(
        page,
        `/api/v1/programs/${encodeURIComponent(programId)}/enrollments/${encodeURIComponent(firstEnrollment?.enrollment_id ?? "")}/cancel`,
        "POST",
        { reason: "E2E parity cancellation" }
      );
      expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);

      const rejectedUsername = `E2E_filter_30_REJECT_${Date.now()}`;
      const rejectedPassword = `${rejectedUsername}-pw!1`;
      const registration = await apiRequest(
        page,
        "/api/v1/auth/register",
        "POST",
        {
          username: rejectedUsername,
          password: rejectedPassword,
          name: "E2E Reject Member",
          phone: "555-0130",
        }
      );
      expect(registration.status).toBe(200);
      const registrationId = await page.evaluate(async (username) => {
        const response = await fetch("/api/v1/auth/registrations");
        if (!response.ok) {
          return null;
        }
        const body = (await response.json()) as {
          data?: {
            registrations?: { requestId: string; username: string }[];
          };
        };
        return (
          body.data?.registrations?.find((row) => row.username === username)
            ?.requestId ?? null
        );
      }, rejectedUsername);
      expect(registrationId).toBeTruthy();
      const approvedAccount = await apiRequest(
        page,
        `/api/v1/auth/registrations/${encodeURIComponent(registrationId ?? "")}/approve`,
        "POST"
      );
      expect(approvedAccount.status).toBe(200);

      rejectedContext = await browser.newContext();
      const rejectedMemberPage = await rejectedContext.newPage();
      rejectedPage = rejectedMemberPage;
      await loginAs(rejectedMemberPage, rejectedUsername, rejectedPassword);
      const rejectedRequest = await apiRequest(
        rejectedMemberPage,
        `/api/v1/programs/${encodeURIComponent(programId)}/enrollment-requests`,
        "POST",
        {}
      );
      expect(rejectedRequest.status).toBe(201);
      rejectedRequestId = dataOf<{ request: { request_id: string } }>(
        rejectedRequest
      ).request.request_id;

      await page.goto(
        `/programs?mode=management&program=${encodeURIComponent(programId)}&task=participants`
      );
      await page
        .getByRole("button", { name: COPY.workspaceParticipantsRefresh })
        .click();
      await expect(
        page.getByRole("tab", {
          name: new RegExp(`${COPY.tabsPending} \\(1\\)`, "u"),
        })
      ).toBeVisible();
      await expect(
        page.getByRole("tab", {
          name: new RegExp(`${COPY.tabsActive} \\(0\\)`, "u"),
        })
      ).toBeVisible();
      await page
        .getByRole("tab", {
          name: new RegExp(`${COPY.tabsPending} \\(1\\)`, "u"),
        })
        .click();
      const rejectedRow = page
        .getByRole("listitem")
        .filter({ hasText: "E2E Reject Member" });
      await expect(rejectedRow).toBeVisible();
      await rejectedRow.getByRole("button", { name: /詳情/u }).click();
      await rejectedRow.getByLabel(COPY.decisionNote).fill("時間不合");
      await rejectedRow.getByRole("button", { name: COPY.reject }).click();
      await expect(
        page
          .getByText(COPY.decisionMade, { exact: true })
          .filter({ visible: true })
          .first()
      ).toBeVisible();
      rejectionResolved = true;
      await expect(
        page.getByRole("tab", {
          name: new RegExp(`${COPY.tabsPending} \\(0\\)`, "u"),
        })
      ).toBeVisible();
      await expect(
        page.getByRole("listitem").filter({ hasText: "E2E Reject Member" })
      ).toHaveCount(0);
      const rejectedSnapshot = await apiRequest(
        rejectedMemberPage,
        `/api/v1/programs/${encodeURIComponent(programId)}/enrollment-snapshot`
      );
      expect(rejectedSnapshot.status).toBe(200);
      const rejectedEnrollments = dataOf<{
        enrollments: { status: string }[];
      }>(rejectedSnapshot).enrollments;
      expect(
        rejectedEnrollments.some(({ status }) => status === "Active")
      ).toBe(false);
      await page
        .getByRole("tab", {
          name: new RegExp(`${COPY.tabsHistory} \\(\\d+\\)`, "u"),
        })
        .click();
      const history = page.getByRole("list", {
        name: COPY.enrollmentHistory,
      });
      const rejectedHistoryRow = history
        .getByRole("listitem")
        .filter({ hasText: "E2E Reject Member" });
      await expect(rejectedHistoryRow).toContainText(COPY.requestRejected);
      await expect(rejectedHistoryRow).toContainText("時間不合");
    } finally {
      try {
        if (programId && requestId && !resolved) {
          const rejected = await apiRequest(
            page,
            `/api/v1/programs/${encodeURIComponent(programId)}/enrollment-requests/${encodeURIComponent(requestId)}/decision`,
            "POST",
            { action: "Rejected" }
          );
          if (rejected.status >= 400) {
            if (memberPage) {
              await apiRequest(
                memberPage,
                `/api/v1/programs/${encodeURIComponent(programId)}/enrollment-requests/${encodeURIComponent(requestId)}/withdraw`,
                "POST",
                {}
              );
            }
          }
        }
        if (rejectedPage && rejectedRequestId && !rejectionResolved) {
          await apiRequest(
            rejectedPage,
            `/api/v1/programs/${encodeURIComponent(programId)}/enrollment-requests/${encodeURIComponent(rejectedRequestId)}/withdraw`,
            "POST",
            {}
          );
        }
        if (programId) {
          for (const enrollment of await enrollmentRows(page, programId)) {
            if (
              enrollment.member_user_id === "U-E2E-MEMBER" &&
              enrollment.status === "Active"
            ) {
              await apiRequest(
                page,
                `/api/v1/programs/${encodeURIComponent(programId)}/enrollments/${encodeURIComponent(enrollment.enrollment_id)}/cancel`,
                "POST",
                { reason: "E2E parity cleanup" }
              );
            }
          }
          const archived = await apiRequest(
            page,
            `/api/v1/programs/${encodeURIComponent(programId)}`,
            "PATCH",
            { lifecycle: "Archived" }
          );
          expect(archived.status, JSON.stringify(archived.body)).toBe(200);
        }
      } finally {
        try {
          if (enrollmentWasEnabled === false) {
            const enrollmentRestored = await apiRequest(
              page,
              `/api/v1/programs/departments/${encodeURIComponent(departmentId)}/modules/enrollment/disable`,
              "POST"
            );
            expect(enrollmentRestored.status).toBe(200);
          }
        } finally {
          try {
            await rejectedContext?.close();
          } finally {
            await memberContext?.close();
          }
        }
      }
    }
  });
});

test.describe("Programs parity replacements 39-63", () => {
  test("programs-d1 #39: directory displays only the actor's authorized department projection", async ({
    page,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    try {
      const projection = await apiRequest(
        page,
        "/api/v1/programs/management-directory"
      );
      expect(projection.status).toBe(200);
      const departments = dataOf<{
        departments: { department_id: string; name: string }[];
      }>(projection).departments;
      const apiDepartmentProjection = departments
        .map(({ department_id, name }) => ({ department_id, name }))
        .sort((left, right) =>
          left.department_id.localeCompare(right.department_id)
        );
      expect(apiDepartmentProjection).toContainEqual({
        department_id: fixture.departmentId,
        name: fixture.departmentName,
      });

      await page.goto("/programs?mode=management");
      await expect(
        page.getByRole("heading", { name: COPY.directoryTitle })
      ).toBeVisible();
      const catalog = page.getByRole("region", {
        name: COPY.catalogSectionTitle,
      });
      const settingsButton = catalog.getByRole("button", {
        name: COPY.departmentSettings,
        exact: true,
      });
      await expect(settingsButton).toHaveCount(1);
      await settingsButton.click();
      const picker = page.getByRole("dialog", {
        name: COPY.departmentSettings,
      });
      if (departments.length > 1) {
        await expect(picker).toBeVisible();
        const renderedDepartmentNames = await picker
          .getByRole("button")
          .evaluateAll(
            (buttons, collapseLabel) =>
              buttons
                .map((button) => button.textContent?.trim() ?? "")
                .filter((label) => label !== collapseLabel),
            COPY.collapse
          );
        expect([...renderedDepartmentNames].sort()).toEqual(
          departments.map(({ name }) => name).sort()
        );
        await picker
          .getByRole("button", { name: fixture.departmentName, exact: true })
          .click();
      }
      await expect(
        page.locator(`[id="${fixture.departmentId}-settings-panel"]`)
      ).toBeVisible();
    } finally {
      await restoreFixture(page, fixture);
    }
  });

  test("programs-d1 #40: department detail exposes five independently toggleable modules", async ({
    page,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    try {
      for (const moduleKey of ["attendance", "custom_forms"]) {
        const enabled = await apiRequest(
          page,
          `/api/v1/programs/departments/${encodeURIComponent(fixture.departmentId)}/modules/${moduleKey}/enable`,
          "POST"
        );
        expect(enabled.status).toBe(200);
      }
      await page.goto("/programs?mode=management");
      await page
        .locator("#programs-management-department-settings-trigger")
        .click();
      const picker = page.getByRole("dialog", {
        name: COPY.departmentSettings,
      });
      if ((await picker.count()) > 0) {
        await picker
          .getByRole("button", { name: fixture.departmentName, exact: true })
          .click();
      }
      const panel = page.locator(
        `[id="${fixture.departmentId}-settings-panel"]`
      );
      const modules = panel.getByRole("region", { name: COPY.modules });
      for (const [moduleKey, label] of [
        ["program_catalog", COPY.moduleProgramCatalog],
        ["enrollment", COPY.moduleEnrollment],
        ["events", COPY.moduleEvents],
        ["attendance", COPY.moduleAttendance],
        ["custom_forms", COPY.moduleCustomForms],
      ] as const) {
        const row = modules.locator("li").filter({ hasText: label });
        const button = row.getByRole("button", { name: /^(啟用|停用)$/u });
        const initial = await button.innerText();
        const initialPressed = await button.getAttribute("aria-pressed");
        expect(["true", "false"]).toContain(initialPressed);
        const changed = page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            response.url().includes(`/modules/${moduleKey}/`) &&
            response.status() === 200
        );
        await button.click();
        await changed;
        await expect(
          panel.getByText(APP_COPY.programs.updated, { exact: true })
        ).toBeVisible();
        await expect(button).toHaveAttribute(
          "aria-pressed",
          initialPressed === "true" ? "false" : "true"
        );
        await expect(button).toHaveText(initial === "啟用" ? "停用" : "啟用");
        const restored = page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            response.url().includes(`/modules/${moduleKey}/`) &&
            response.status() === 200
        );
        await row.getByRole("button", { name: /^(啟用|停用)$/u }).click();
        await restored;
        await expect(
          row.getByRole("button", { name: initial as "啟用" | "停用" })
        ).toBeVisible();
        await expect(
          row.getByRole("button", { name: initial as "啟用" | "停用" })
        ).toHaveAttribute("aria-pressed", initialPressed ?? "false");
      }
    } finally {
      await restoreFixture(page, fixture);
    }
  });

  test("programs-d1 #42: creates a program from department detail and lands in its cockpit", async ({
    page,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    let createdProgramId = "";
    try {
      await page.goto("/programs?mode=management");
      await page
        .locator("#programs-management-department-settings-trigger")
        .click();
      const picker = page.getByRole("dialog", {
        name: COPY.departmentSettings,
      });
      if ((await picker.count()) > 0) {
        await picker
          .getByRole("button", { name: fixture.departmentName, exact: true })
          .click();
      }
      const panel = page.locator(
        `[id="${fixture.departmentId}-settings-panel"]`
      );
      await panel.getByRole("button", { name: COPY.createProgram }).click();
      const name = `E2E_PARITY_42_${Date.now()}`;
      await panel.getByRole("textbox", { name: COPY.programName }).fill(name);
      await panel
        .getByRole("textbox", { name: COPY.programPurpose })
        .fill("Department detail parity purpose");
      await panel.getByRole("button", { name: COPY.saveProgram }).click();
      await expect(page.getByRole("heading", { name })).toBeVisible();
      await expect(
        page.getByText(COPY.programCreatedNotice, { exact: true })
      ).toBeVisible();
      createdProgramId = new URL(page.url()).searchParams.get("program") ?? "";
      expect(createdProgramId).toBeTruthy();
      await expect(page).toHaveURL(/program=[^&]+/u);
    } finally {
      if (createdProgramId) {
        const published = await apiRequest(
          page,
          `/api/v1/programs/${encodeURIComponent(createdProgramId)}`,
          "PATCH",
          { lifecycle: "Active", discoverability: "Listed" }
        );
        expect(published.status).toBe(200);
        const archived = await apiRequest(
          page,
          `/api/v1/programs/${encodeURIComponent(createdProgramId)}`,
          "PATCH",
          { lifecycle: "Archived" }
        );
        expect(archived.status).toBe(200);
      }
      await restoreFixture(page, fixture);
    }
  });

  test("programs-d1 #43: creates a OneOff, operates multiple Events, edits, and blocks archive", async ({
    page,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    const programId = await createProgramForFixture(
      page,
      fixture,
      `E2E_PARITY_43_${Date.now()}`,
      "OneOff"
    );
    try {
      for (const [index, date] of ["2098-12-01", "2098-12-08"].entries()) {
        await createEventForProgram(
          page,
          programId,
          `E2E_PARITY_43_Event_${index}`,
          `${date}T10:00:00.000Z`,
          `${date}T11:00:00.000Z`
        );
      }
      await page.goto(
        `/programs?mode=management&program=${encodeURIComponent(programId)}&task=settings`
      );
      await page
        .getByRole("button", {
          name: new RegExp(COPY.settingsBasics, "u"),
        })
        .click();
      const updatedName = `E2E_PARITY_43_Updated_${Date.now()}`;
      await page
        .getByRole("textbox", { name: COPY.programName })
        .fill(updatedName);
      await page
        .getByRole("textbox", { name: COPY.programDescription })
        .fill("Updated OneOff purpose");
      await page.getByRole("button", { name: COPY.saveBasics }).click();
      await expect(
        page
          .getByText(COPY.saved, { exact: true })
          .filter({ visible: true })
          .first()
      ).toBeVisible();
      const updated = dataOf<{
        program: { name: string; description: string | null };
      }>(
        await apiRequest(
          page,
          `/api/v1/programs/${encodeURIComponent(programId)}/management`
        )
      ).program;
      expect(updated.name).toBe(updatedName);
      expect(updated.description).toBe("Updated OneOff purpose");
      const archived = await apiRequest(
        page,
        `/api/v1/programs/${encodeURIComponent(programId)}`,
        "PATCH",
        { lifecycle: "Archived" }
      );
      expect(archived.status).toBe(409);
      expect((await eventRows(page, programId)).length).toBe(2);
    } finally {
      // The OneOff and its Events live only in this runner's disposable D1.
      await restoreFixture(page, fixture);
    }
  });

  test("programs-d1 #45: MemberRequest managers can open Participants and use assisted enrollment", async ({
    page,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    try {
      await page.goto(
        `/programs?mode=management&program=${encodeURIComponent(fixture.programId)}&task=participants`
      );
      await expect(
        page.getByRole("heading", { name: COPY.workspaceTaskParticipants })
      ).toBeVisible();
      await expect(
        page.getByRole("tab", { name: /待審批 \(\d+\)/u })
      ).toBeVisible();
      await expect(
        page.getByRole("tab", { name: /使用中 \(\d+\)/u })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: COPY.workspaceParticipantsAdd })
      ).toBeVisible();
      await page
        .getByRole("button", { name: COPY.workspaceParticipantsAdd })
        .click();
      await expect(
        page.getByRole("heading", { name: COPY.workspaceParticipantsAdd })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: COPY.assistedEnroll })
      ).toBeVisible();
      await expect(page.getByText(COPY.assistedEnrollAck)).toBeVisible();
    } finally {
      await restoreFixture(page, fixture);
    }
  });

  test("programs-d1 #46: canonical ParticipantsTask cancels an active enrollment into history", async ({
    page,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    try {
      const enrolled = await apiRequest(
        page,
        `/api/v1/programs/${encodeURIComponent(fixture.programId)}/enrollments`,
        "POST",
        { member_user_id: "U-E2E-MEMBER" }
      );
      expect(enrolled.status).toBe(201);
      await page.goto(
        `/programs?mode=management&program=${encodeURIComponent(fixture.programId)}&task=participants`
      );
      await page.getByRole("tab", { name: /使用中 \(\d+\)/u }).click();
      const activeRow = page
        .locator("li")
        .filter({ hasText: "E2E Member" })
        .first();
      await expect(activeRow).toBeVisible();
      await activeRow
        .getByRole("button", { name: COPY.cancelEnrollment })
        .click();
      await page
        .getByLabel(COPY.cancelEnrollmentReason)
        .fill("Parity cancellation");
      await page
        .getByRole("button", { name: COPY.confirmCancelEnrollment })
        .click();
      await expect(
        page
          .getByText(COPY.enrollmentCancelledNotice, { exact: true })
          .filter({ visible: true })
          .first()
      ).toBeVisible();
      const historyTab = page.getByRole("tab", {
        name: /歷史 \(\d+\)/u,
      });
      await expect(historyTab).toBeVisible();
      await historyTab.click();
      await expect(historyTab).toHaveAttribute("aria-selected", "true");
      await expect(
        page.getByRole("list", { name: COPY.enrollmentHistory })
      ).toContainText("E2E Member");
    } finally {
      for (const enrollment of await enrollmentRows(page, fixture.programId)) {
        if (
          enrollment.member_user_id === "U-E2E-MEMBER" &&
          enrollment.status === "Active"
        ) {
          await apiRequest(
            page,
            `/api/v1/programs/${encodeURIComponent(fixture.programId)}/enrollments/${encodeURIComponent(enrollment.enrollment_id)}/cancel`,
            "POST",
            {}
          );
        }
      }
      await restoreFixture(page, fixture);
    }
  });

  test("programs-d1 #47: EventsTask refetches schedule exceptions after reschedule and restore", async ({
    page,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    let ruleId: string | null = null;
    let exceptionId: string | null = null;
    try {
      const rule = await apiRequest(
        page,
        `/api/v1/programs/${encodeURIComponent(fixture.programId)}/schedule-rules`,
        "POST",
        {
          recurrence: "WEEKLY",
          day_of_week: 3,
          start_time: "19:30",
          end_time: "20:45",
        }
      );
      expect(rule.status).toBe(201);
      ruleId = dataOf<{ rule: { rule_id: string } }>(rule).rule.rule_id;
      await page.goto(
        `/programs?mode=management&program=${encodeURIComponent(fixture.programId)}&task=schedule`
      );
      await page.getByRole("button", { name: COPY.previewEvents }).click();
      await expect(
        page.getByRole("button", { name: COPY.generateEvents })
      ).toBeEnabled();
      await page.getByRole("button", { name: COPY.generateEvents }).click();
      await expect(
        page.getByText(/^已產生 \d+ 場聚會，跳過 \d+ 場重複。$/u).first()
      ).toBeVisible();

      const generated = dataOf<{
        events: {
          event_id: string;
          occurrence_date: string | null;
          starts_at: string;
          status: string;
        }[];
      }>(
        await apiRequest(
          page,
          `/api/v1/programs/${encodeURIComponent(fixture.programId)}/events`
        )
      ).events;
      const targetEvent = generated.find(
        (event) =>
          event.status === "Active" && Date.parse(event.starts_at) > Date.now()
      );
      const targetEventId = targetEvent?.event_id;
      const targetDate = targetEvent?.occurrence_date ?? "";
      expect(targetEventId).toBeTruthy();
      expect(targetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/u);

      await page.goto(
        `/programs?mode=management&program=${encodeURIComponent(fixture.programId)}&task=events`
      );
      const events = page.getByRole("list", { name: COPY.workspaceEvents });
      const row = events.locator(`[data-event-id="${targetEventId}"]`);
      await expect(row).toBeVisible();
      await expect(
        row.getByText(COPY.eventRescheduledBadge.replace("{time}", "20:00"))
      ).toHaveCount(0);

      const createdException = await apiRequest(
        page,
        `/api/v1/programs/${encodeURIComponent(fixture.programId)}/schedule-rules/${encodeURIComponent(ruleId)}/exceptions`,
        "POST",
        {
          override_date: targetDate,
          action: "RESCHEDULE",
          new_date: "2098-12-01",
          new_start_time: "20:00",
          new_end_time: "21:00",
        }
      );
      expect(createdException.status).toBe(201);
      exceptionId = dataOf<{
        exception: { exception_id: string };
      }>(createdException).exception.exception_id;

      const rescheduled = dataOf<{
        events: {
          event_id: string;
          exception?: {
            action?: string;
            new_date?: string | null;
            new_start_time?: string | null;
          } | null;
        }[];
      }>(
        await apiRequest(
          page,
          `/api/v1/programs/${encodeURIComponent(fixture.programId)}/events`
        )
      ).events.find((event) => event.event_id === targetEventId);
      expect(rescheduled?.exception?.action).toBe("RESCHEDULE");
      expect(rescheduled?.exception?.new_date).toBe("2098-12-01");
      expect(rescheduled?.exception?.new_start_time).toBe("20:00");

      await page.reload();
      const refreshedRow = events.locator(`[data-event-id="${targetEventId}"]`);
      await expect(
        refreshedRow.getByText(
          COPY.eventRescheduledBadge.replace("{time}", "20:00")
        )
      ).toBeVisible();

      const deletedException = await apiRequest(
        page,
        `/api/v1/programs/${encodeURIComponent(fixture.programId)}/schedule-rules/${encodeURIComponent(ruleId)}/exceptions/${encodeURIComponent(exceptionId)}`,
        "DELETE"
      );
      expect(deletedException.status).toBe(200);
      exceptionId = null;
      await page.reload();
      await expect(
        events
          .locator(`[data-event-id="${targetEventId}"]`)
          .getByText(COPY.eventRescheduledBadge.replace("{time}", "20:00"))
      ).toHaveCount(0);
    } finally {
      if (exceptionId !== null && ruleId !== null) {
        await apiRequest(
          page,
          `/api/v1/programs/${encodeURIComponent(fixture.programId)}/schedule-rules/${encodeURIComponent(ruleId)}/exceptions/${encodeURIComponent(exceptionId)}`,
          "DELETE"
        );
      }
      if (ruleId !== null) {
        await apiRequest(
          page,
          `/api/v1/programs/${encodeURIComponent(fixture.programId)}/schedule-rules/${encodeURIComponent(ruleId)}/retire`,
          "POST",
          {}
        );
      }
      await restoreFixture(page, fixture);
    }
  });

  test("programs-d1 #48: admin creates, deep-links, and edits an event with HK wall display", async ({
    page,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    const eventName = `E2E_PARITY_48_${Date.now()}`;
    const renamed = `${eventName}_Updated`;
    const startsAt = "2098-12-01T10:00:00.000Z";
    const endsAt = "2098-12-01T11:00:00.000Z";
    let eventId = "";
    try {
      eventId = await createEventForProgram(
        page,
        fixture.programId,
        eventName,
        startsAt,
        endsAt
      );
      await page.goto(
        `/programs?mode=management&program=${encodeURIComponent(fixture.programId)}&task=events&event=${encodeURIComponent(eventId)}`
      );
      await expect(
        page.getByRole("region", { name: COPY.eventDetailTitle })
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: eventName })
      ).toBeVisible();
      await expect(
        page.getByText(`${hkWallLabel(startsAt)} — ${hkWallLabel(endsAt)}`)
      ).toBeVisible();
      for (const label of [
        COPY.eventManualSource,
        COPY.eventTypeTraining,
        COPY.eventNotStarted,
        COPY.eventAvailable,
        "已報名 0 人",
        "已簽到 0 人",
      ]) {
        await expect(
          page.getByText(label, { exact: true }).first()
        ).toBeVisible();
      }
      await expect(
        page.getByRole("heading", { name: COPY.eventDetailParticipantSummary })
      ).toBeVisible();
      await page.getByRole("button", { name: COPY.eventMoreActions }).click();
      await page.getByRole("menuitem", { name: COPY.eventEditTitle }).click();
      await page.getByLabel(COPY.eventName).fill(renamed);
      await page.getByLabel(COPY.eventLocation).fill("副堂 A");
      await page.getByRole("button", { name: COPY.eventEditSave }).click();
      await expect(
        page.getByText(COPY.eventSavedNotice, { exact: true }).first()
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: renamed })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("heading", { name: renamed })).toBeVisible();
      await page.getByRole("link", { name: COPY.eventDetailBack }).click();
      await expect(page).toHaveURL(
        new RegExp(
          `/programs\\?mode=management&program=${fixture.programId}&task=events$`,
          "u"
        )
      );
      await expect(
        page.getByRole("heading", { name: COPY.workspaceEvents, exact: true })
      ).toBeVisible();
    } finally {
      if (eventId) {
        await apiRequest(
          page,
          `/api/v1/programs/${encodeURIComponent(fixture.programId)}/events/${encodeURIComponent(eventId)}`,
          "PATCH",
          { availability: "Inactive" }
        );
      }
      await restoreFixture(page, fixture);
    }
  });

  test("programs-d1 #49: safe deactivation is immediate with Undo; cancellation retires controls", async ({
    page,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    let eventId = "";
    try {
      eventId = await createEventForProgram(
        page,
        fixture.programId,
        `E2E_PARITY_49_${Date.now()}`,
        "2098-12-01T10:00:00.000Z",
        "2098-12-01T11:00:00.000Z"
      );
      await page.goto(
        `/programs?mode=management&program=${encodeURIComponent(fixture.programId)}&task=events&event=${encodeURIComponent(eventId)}`
      );
      const detail = page.getByRole("region", { name: COPY.eventDetailTitle });
      await detail.getByRole("button", { name: COPY.eventMoreActions }).click();
      await page
        .getByRole("menuitem", { name: COPY.eventAvailabilityDeactivate })
        .click();
      await expect(
        detail.getByText(COPY.eventAvailabilityNotice, { exact: true })
      ).toBeVisible();
      await page
        .getByRole("button", { name: COPY.eventAvailabilityUndo })
        .click();
      await expect(
        detail
          .getByText(COPY.eventAvailabilityRestoredNotice, { exact: true })
          .first()
      ).toBeVisible();
      await detail.getByRole("button", { name: COPY.eventMoreActions }).click();
      await page.getByRole("menuitem", { name: COPY.cancelEvent }).click();
      await page.getByLabel(COPY.cancelReason).fill("場地維修");
      await page.getByRole("button", { name: COPY.confirmCancelEvent }).click();
      await expect(
        page.getByText(COPY.eventCancelledNotice, { exact: true }).first()
      ).toBeVisible();
      await expect(
        page.getByText(COPY.eventCancelled, { exact: true })
      ).toBeVisible();
      const cancellationReason = detail
        .locator("details")
        .filter({ hasText: COPY.cancelReason });
      await cancellationReason.locator("summary").click();
      await expect(
        cancellationReason.getByText("場地維修", { exact: true })
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
    } finally {
      await restoreFixture(page, fixture);
    }
  });

  test("programs-d1 #51: a currently open check-in window with zero check-ins still requires confirmation to deactivate", async ({
    page,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    let eventId = "";
    try {
      const now = Date.now();
      eventId = await createEventForProgram(
        page,
        fixture.programId,
        `E2E_PARITY_51_${now}`,
        new Date(now - 30 * 60_000).toISOString(),
        new Date(now + 30 * 60_000).toISOString(),
        {
          opensAt: new Date(now - 15 * 60_000).toISOString(),
          closesAt: new Date(now + 45 * 60_000).toISOString(),
        }
      );
      await page.goto(
        `/programs?mode=management&program=${encodeURIComponent(fixture.programId)}&task=events&event=${encodeURIComponent(eventId)}`
      );
      const detail = page.getByRole("region", { name: COPY.eventDetailTitle });
      await detail.getByRole("button", { name: COPY.eventMoreActions }).click();
      await page
        .getByRole("menuitem", { name: COPY.eventAvailabilityDeactivate })
        .click();
      const confirmation = page.getByRole("alert").filter({
        hasText: COPY.eventAvailabilityConfirmBody.replace("{count}", "1"),
      });
      await expect(
        confirmation.getByRole("button", {
          name: COPY.eventAvailabilityConfirmProceed,
        })
      ).toBeVisible();
      await expect(
        confirmation.getByText(
          COPY.eventAvailabilityConfirmBody.replace("{count}", "1")
        )
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: COPY.eventAvailabilityUndo })
      ).toHaveCount(0);
      await confirmation
        .getByRole("button", { name: COPY.eventAvailabilityConfirmProceed })
        .click();
      await expect(
        detail.getByText(COPY.eventAvailabilityNotice, { exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: COPY.eventAvailabilityUndo })
      ).toBeVisible();
    } finally {
      if (eventId) {
        const restored = await apiRequest(
          page,
          `/api/v1/programs/${encodeURIComponent(fixture.programId)}/events/${encodeURIComponent(eventId)}`,
          "PATCH",
          { availability: "Active" }
        );
        expect(restored.status).toBe(200);
      }
      await restoreFixture(page, fixture);
    }
  });

  test("programs-d1 #52: managers can open notifications and no-scope users cannot", async ({
    page,
    browser,
  }) => {
    await loginAs(page);
    const notificationResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response.url().includes("/api/v1/programs/notifications")
    );
    await page.goto("/programs?mode=management");
    expect((await notificationResponse).status()).toBe(200);
    const notificationsLink = page
      .locator("[data-shell-header]")
      .getByRole("link", { name: COPY.notificationBell });
    await expect(notificationsLink).toHaveAttribute(
      "href",
      "/programs?mode=management&task=notifications"
    );
    const openedFeedResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response.url().includes("/api/v1/programs/notifications")
    );
    await notificationsLink.click();
    const feedResponse = await openedFeedResponse;
    expect(feedResponse.status()).toBe(200);
    await expect(page).toHaveURL(
      /\/programs\?mode=management&task=notifications$/u
    );
    await expect(
      page.getByRole("heading", {
        name: COPY.notificationsTitle,
        exact: true,
      })
    ).toBeVisible();
    const feed = page.getByRole("region", { name: COPY.notificationsTitle });
    const feedBody = (await feedResponse.json()) as {
      data?: { items?: unknown[] };
    };
    expect(Array.isArray(feedBody.data?.items)).toBe(true);
    if ((feedBody.data?.items?.length ?? 0) === 0) {
      await expect(
        feed
          .getByRole("status")
          .filter({ hasText: APP_COPY.programs.notificationsEmpty })
      ).toBeVisible();
    } else {
      await expect(
        feed.getByRole("list", {
          name: APP_COPY.programs.notificationsListLabel,
        })
      ).toBeVisible();
    }

    const memberContext = await browser.newContext();
    try {
      const memberPage = await memberContext.newPage();
      await loginAs(memberPage, MEMBER.username, MEMBER.credential);
      await memberPage.goto("/programs?mode=management");
      await expect(
        memberPage.getByRole("heading", { name: COPY.noManagementScope })
      ).toBeVisible();
      await expect(
        memberPage
          .locator("[data-shell-header]")
          .getByRole("link", { name: COPY.notificationBell })
      ).toHaveCount(0);
    } finally {
      await memberContext.close();
    }
  });

  test("programs-d1 #53: lists bounded real sources, exact task links, workspace counts, and refreshes after decisions", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    await loginAs(page);
    const directory = await apiRequest(
      page,
      "/api/v1/programs/management-directory"
    );
    expect(directory.status).toBe(200);
    const seededProgram = dataOf<{
      programs: { program_id: string; name: string; department_id: string }[];
    }>(directory).programs.find(({ name }) => name === "E2E_DEMO_成人查經");
    expect(seededProgram?.department_id).toBeTruthy();
    const departmentId = seededProgram?.department_id ?? "";
    const programName = `E2E_PARITY_53_${Date.now()}`;
    let programId = "";
    let memberContext: BrowserContext | null = null;
    let memberPage: Page | null = null;
    let memberRequestId = "";
    let pendingRequestId = "";
    let pendingResolved = false;
    let inactiveEventId = "";
    let cancelledEventId = "";
    let enrollmentWasEnabled: boolean | null = null;
    try {
      const departmentBefore = await apiRequest(
        page,
        `/api/v1/programs/departments/${encodeURIComponent(departmentId)}`
      );
      expect(departmentBefore.status).toBe(200);
      const enrollmentModuleBefore = dataOf<{
        modules: { module_key: string; enabled: number }[];
      }>(departmentBefore).modules.find(
        ({ module_key }) => module_key === "enrollment"
      );
      expect(enrollmentModuleBefore).toEqual(
        expect.objectContaining({ module_key: "enrollment" })
      );
      enrollmentWasEnabled = enrollmentModuleBefore?.enabled === 1;
      const enrollmentEnabled = await apiRequest(
        page,
        `/api/v1/programs/departments/${encodeURIComponent(departmentId)}/modules/enrollment/enable`,
        "POST"
      );
      expect(enrollmentEnabled.status).toBe(200);
      const department = await apiRequest(
        page,
        `/api/v1/programs/departments/${encodeURIComponent(departmentId)}`
      );
      expect(department.status).toBe(200);
      const enrollmentModule = dataOf<{
        modules: { module_key: string; enabled: number }[];
      }>(department).modules.find(
        ({ module_key }) => module_key === "enrollment"
      );
      expect(enrollmentModule).toEqual(
        expect.objectContaining({ module_key: "enrollment", enabled: 1 })
      );
      programId = await createProgramForDepartment(
        page,
        departmentId,
        programName,
        "OneOff"
      );
      memberContext = await browser.newContext();
      memberPage = await memberContext.newPage();
      await loginAs(memberPage, MEMBER.username, MEMBER.credential);
      const request = await apiRequest(
        memberPage,
        `/api/v1/programs/${encodeURIComponent(programId)}/enrollment-requests`,
        "POST",
        {}
      );
      expect(request.status).toBe(201);
      memberRequestId = dataOf<{ request: { request_id: string } }>(request)
        .request.request_id;
      const inactiveName = `E2E_PARITY_53_INACTIVE_${Date.now()}`;
      inactiveEventId = await createEventForProgram(
        page,
        programId,
        inactiveName,
        new Date(Date.now() + 5 * 86_400_000).toISOString(),
        new Date(Date.now() + 5 * 86_400_000 + 90 * 60_000).toISOString()
      );
      const inactive = await apiRequest(
        page,
        `/api/v1/programs/${encodeURIComponent(programId)}/events/${encodeURIComponent(inactiveEventId)}`,
        "PATCH",
        { availability: "Inactive" }
      );
      expect(inactive.status).toBe(200);
      cancelledEventId = await createEventForProgram(
        page,
        programId,
        `E2E_PARITY_53_CANCELLED_${Date.now()}`,
        new Date(Date.now() + 6 * 86_400_000).toISOString(),
        new Date(Date.now() + 6 * 86_400_000 + 90 * 60_000).toISOString()
      );
      const cancelled = await apiRequest(
        page,
        `/api/v1/programs/${encodeURIComponent(programId)}/events/${encodeURIComponent(cancelledEventId)}`,
        "PATCH",
        { reason: "Parity cancellation" }
      );
      expect(cancelled.status).toBe(200);

      const departmentQuery = `department=${encodeURIComponent(departmentId)}`;
      const pendingHref = `/programs?mode=management&${departmentQuery}&program=${programId}&task=participants`;
      const inactiveHref = `/programs?mode=management&${departmentQuery}&program=${programId}&task=events&event=${inactiveEventId}`;
      const cancelledHref = `/programs?mode=management&${departmentQuery}&program=${programId}&task=events&event=${cancelledEventId}`;
      const initialNotifications = dataOf<{
        items: {
          kind: string;
          event_id?: string;
          program_id: string;
          read: boolean;
        }[];
      }>(
        await apiRequest(page, "/api/v1/programs/notifications?limit=20")
      ).items.filter((item) => item.program_id === programId);
      expect(initialNotifications).toHaveLength(3);
      expect(initialNotifications.every((item) => !item.read)).toBe(true);

      await page.goto("/programs?mode=management&task=notifications");
      let notifications = page.getByRole("region", {
        name: COPY.notificationsTitle,
      });
      await expect(notifications).toBeVisible();
      for (const href of [pendingHref, inactiveHref, cancelledHref]) {
        await expect(notifications.locator(`a[href="${href}"]`)).toBeVisible();
      }
      await expect(
        notifications.locator(
          `a[href*="program=${encodeURIComponent(programId)}"]`
        )
      ).toHaveCount(3);

      const pendingReadPromise = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().endsWith("/api/v1/programs/notifications/read")
      );
      await notifications.locator(`a[href="${pendingHref}"]`).click();
      expect((await pendingReadPromise).ok()).toBe(true);
      await expect(page).toHaveURL(pendingHref);
      const participants = page.getByRole("region", {
        name: COPY.workspaceTaskParticipants,
      });
      await expect(
        participants.getByRole("tab", {
          name: new RegExp(`${COPY.tabsPending} \\(1\\)`, "u"),
        })
      ).toBeVisible();
      await expect(
        participants.getByRole("listitem").filter({ hasText: "E2E Member" })
      ).toBeVisible();
      const pendingRead = dataOf<{
        items: {
          kind: string;
          event_id?: string;
          program_id: string;
          read: boolean;
        }[];
      }>(
        await apiRequest(page, "/api/v1/programs/notifications?limit=20")
      ).items.find(
        (item) => item.program_id === programId && item.kind === "enrollment"
      );
      expect(pendingRead?.read).toBe(true);

      await page.goto("/programs?mode=management&task=notifications");
      notifications = page.getByRole("region", {
        name: COPY.notificationsTitle,
      });
      await expect(
        notifications.locator(`a[href="${pendingHref}"]`)
      ).toBeVisible();
      await expect(
        notifications.locator(`a[href="${pendingHref}"]`).getByLabel("未讀")
      ).toHaveCount(0);

      const inactiveReadPromise = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().endsWith("/api/v1/programs/notifications/read")
      );
      await notifications.locator(`a[href="${inactiveHref}"]`).click();
      expect((await inactiveReadPromise).ok()).toBe(true);
      await expect(page).toHaveURL(inactiveHref);

      const renamed = `E2E_PARITY_53_REVISED_${Date.now()}`;
      const renamedEvent = await apiRequest(
        page,
        `/api/v1/programs/${encodeURIComponent(programId)}/events/${encodeURIComponent(inactiveEventId)}`,
        "PATCH",
        { name: renamed }
      );
      expect(renamedEvent.status).toBe(200);
      const refreshedRead = dataOf<{
        items: { event_id?: string; read: boolean; program_id: string }[];
      }>(
        await apiRequest(page, "/api/v1/programs/notifications?limit=20")
      ).items.find(
        (item) =>
          item.program_id === programId && item.event_id === inactiveEventId
      )?.read;
      expect(refreshedRead).toBe(false);

      await page.goto(inactiveHref);
      const eventDetail = page.getByRole("region", {
        name: COPY.eventDetailTitle,
      });
      await expect(eventDetail).toBeVisible();
      await eventDetail
        .getByRole("button", { name: COPY.eventMoreActions })
        .click();
      await expect(
        page.getByRole("menuitem", { name: COPY.eventAvailabilityActivate })
      ).toBeVisible();

      await page.goto(
        `/programs?mode=management&program=${encodeURIComponent(programId)}&task=events`
      );
      await expect(
        page
          .getByRole("region", { name: COPY.workspaceEvents })
          .getByLabel(COPY.attentionEventCount.replace("{count}", "1"))
      ).toHaveText("1");
      await expect(
        page
          .getByRole("region", { name: COPY.workspaceEvents })
          .getByLabel(COPY.attentionCancelledCount.replace("{count}", "1"))
      ).toHaveText("1");

      const pending = dataOf<{
        requests: { request_id: string; status: string }[];
      }>(
        await apiRequest(
          page,
          `/api/v1/programs/${encodeURIComponent(programId)}/enrollment-requests`
        )
      ).requests.find((request) => request.status === "Pending");
      expect(pending?.request_id).toBeTruthy();
      pendingRequestId = pending?.request_id ?? memberRequestId;
      const decision = await apiRequest(
        page,
        `/api/v1/programs/${encodeURIComponent(programId)}/enrollment-requests/${encodeURIComponent(pendingRequestId)}/decision`,
        "POST",
        { action: "Approved" }
      );
      expect(decision.status).toBe(200);
      expect(
        dataOf<{
          request: { request_id: string; status: string };
        }>(decision).request
      ).toEqual(
        expect.objectContaining({
          request_id: pendingRequestId,
          status: "Approved",
        })
      );
      pendingResolved = true;
      const requestAfterDecision = await apiRequest(
        page,
        `/api/v1/programs/${encodeURIComponent(programId)}/enrollment-requests`
      );
      expect(
        dataOf<{
          requests: { request_id: string; status: string }[];
        }>(requestAfterDecision).requests.find(
          (request) => request.request_id === pendingRequestId
        )?.status
      ).toBe("Approved");

      await page.goto("/programs?mode=management&task=notifications");
      notifications = page.getByRole("region", {
        name: COPY.notificationsTitle,
      });
      await expect(
        notifications.locator(`a[href="${pendingHref}"]`)
      ).toHaveCount(0);
      await expect(
        notifications.locator(`a[href="${inactiveHref}"]`)
      ).toBeVisible();
      await expect(
        notifications.locator(`a[href="${cancelledHref}"]`)
      ).toBeVisible();

      await page.goto(pendingHref);
      await expect(
        participants.getByRole("tab", {
          name: new RegExp(`${COPY.tabsPending} \\(0\\)`, "u"),
        })
      ).toBeVisible();

      await page.goto(inactiveHref);
      await page.getByRole("button", { name: COPY.eventMoreActions }).click();
      await page
        .getByRole("menuitem", { name: COPY.eventAvailabilityActivate })
        .click();
      await expect(
        page
          .getByText(COPY.eventAvailabilityRestoredNotice, { exact: true })
          .filter({ visible: true })
          .first()
      ).toBeVisible();
      await page.goto(inactiveHref);
      const refreshedDetail = page.getByRole("region", {
        name: COPY.eventDetailTitle,
      });
      await refreshedDetail
        .getByRole("button", { name: COPY.eventMoreActions })
        .click();
      await expect(
        page.getByRole("menuitem", { name: COPY.eventAvailabilityActivate })
      ).toHaveCount(0);
      await expect(
        page.getByRole("menuitem", { name: COPY.eventAvailabilityDeactivate })
      ).toBeVisible();

      await page.goto("/programs?mode=management&task=notifications");
      notifications = page.getByRole("region", {
        name: COPY.notificationsTitle,
      });
      await expect(
        notifications.locator(`a[href="${inactiveHref}"]`)
      ).toHaveCount(0);
      await expect(
        notifications.locator(`a[href="${cancelledHref}"]`)
      ).toBeVisible();

      const cancelledReadPromise = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().endsWith("/api/v1/programs/notifications/read")
      );
      await notifications.locator(`a[href="${cancelledHref}"]`).click();
      expect((await cancelledReadPromise).ok()).toBe(true);
      await expect(page).toHaveURL(cancelledHref);
      await expect(
        page
          .getByRole("region", { name: COPY.eventDetailTitle })
          .getByText(COPY.eventCancelled, { exact: true })
      ).toBeVisible();

      await page.goto("/programs?mode=management&task=notifications");
      notifications = page.getByRole("region", {
        name: COPY.notificationsTitle,
      });
      await expect(
        notifications.locator(`a[href="${cancelledHref}"]`)
      ).toBeVisible();
      await expect(
        notifications.locator(`a[href="${cancelledHref}"]`).getByLabel("未讀")
      ).toHaveCount(0);

      const revokedContext = await browser.newContext();
      try {
        const revokedPage = await revokedContext.newPage();
        await loginAs(revokedPage, MEMBER.username, MEMBER.credential);
        await revokedPage.goto(inactiveHref);
        await expect(
          revokedPage.getByRole("heading", { name: COPY.noManagementScope })
        ).toBeVisible();
        await expect(revokedPage.getByText(programName)).toHaveCount(0);
      } finally {
        await revokedContext.close();
      }
    } finally {
      try {
        const cleanupRequestId = pendingRequestId || memberRequestId;
        if (programId && cleanupRequestId && !pendingResolved) {
          const rejected = await apiRequest(
            page,
            `/api/v1/programs/${encodeURIComponent(programId)}/enrollment-requests/${encodeURIComponent(cleanupRequestId)}/decision`,
            "POST",
            { action: "Rejected" }
          );
          if (rejected.status >= 400) {
            if (memberPage) {
              await apiRequest(
                memberPage,
                `/api/v1/programs/${encodeURIComponent(programId)}/enrollment-requests/${encodeURIComponent(cleanupRequestId)}/withdraw`,
                "POST",
                {}
              );
            }
          }
        }
        if (programId) {
          for (const enrollment of await enrollmentRows(page, programId)) {
            if (
              enrollment.member_user_id === "U-E2E-MEMBER" &&
              enrollment.status === "Active"
            ) {
              await apiRequest(
                page,
                `/api/v1/programs/${encodeURIComponent(programId)}/enrollments/${encodeURIComponent(enrollment.enrollment_id)}/cancel`,
                "POST",
                { reason: "E2E parity cleanup" }
              );
            }
          }
          for (const eventId of [inactiveEventId, cancelledEventId]) {
            if (eventId) {
              await apiRequest(
                page,
                `/api/v1/programs/${encodeURIComponent(programId)}/events/${encodeURIComponent(eventId)}`,
                "PATCH",
                {
                  starts_at: "2000-01-01T00:00:00.000Z",
                  ends_at: "2000-01-01T01:30:00.000Z",
                  check_in_window_opens_at: "2000-01-01T00:00:00.000Z",
                  check_in_window_closes_at: "2000-01-01T02:00:00.000Z",
                }
              );
            }
          }
          const archived = await apiRequest(
            page,
            `/api/v1/programs/${encodeURIComponent(programId)}`,
            "PATCH",
            { lifecycle: "Archived" }
          );
          expect(archived.status, JSON.stringify(archived.body)).toBe(200);
        }
      } finally {
        try {
          if (enrollmentWasEnabled === false) {
            const enrollmentRestored = await apiRequest(
              page,
              `/api/v1/programs/departments/${encodeURIComponent(departmentId)}/modules/enrollment/disable`,
              "POST"
            );
            expect(enrollmentRestored.status).toBe(200);
          }
        } finally {
          await memberContext?.close();
        }
      }
    }
  });

  test("programs-d1 #56: changing the visible range requires Review Again before generation", async ({
    page,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    try {
      const rule = await apiRequest(
        page,
        `/api/v1/programs/${encodeURIComponent(fixture.programId)}/schedule-rules`,
        "POST",
        {
          recurrence: "WEEKLY",
          day_of_week: 3,
          start_time: "19:30",
          end_time: "20:45",
        }
      );
      expect(rule.status).toBe(201);
      await page.goto(
        `/programs?mode=management&program=${encodeURIComponent(fixture.programId)}&task=schedule`
      );
      await page.getByRole("button", { name: COPY.previewEvents }).click();
      await expect(page.getByText(COPY.previewPlanLabel)).toBeVisible();
      const fromDate = page.getByLabel(COPY.previewFromDate);
      const nextFromDate = await fromDate.evaluate((input) => {
        const value = (input as HTMLInputElement).value;
        const date = new Date(`${value}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + 1);
        return date.toISOString().slice(0, 10);
      });
      await fromDate.fill(nextFromDate);
      await expect(
        page.getByRole("alert").filter({ hasText: COPY.previewChanged })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: COPY.generateEvents })
      ).toBeDisabled();
      await page.getByRole("button", { name: COPY.previewReviewAgain }).click();
      await expect(
        page.getByRole("button", { name: COPY.generateEvents })
      ).toBeEnabled();
      const generated = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response
            .url()
            .includes(`/api/v1/programs/${fixture.programId}/events/generate`)
      );
      await page.getByRole("button", { name: COPY.generateEvents }).click();
      expect((await generated).status()).toBe(200);
      await expect
        .poll(async () => (await eventRows(page, fixture.programId)).length)
        .toBeGreaterThan(0);
    } finally {
      await restoreFixture(page, fixture);
    }
  });

  test("programs-d1 #57: a stale plan is rejected before writes and requires a fresh preview", async ({
    page,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    try {
      const createdRule = await apiRequest(
        page,
        `/api/v1/programs/${encodeURIComponent(fixture.programId)}/schedule-rules`,
        "POST",
        {
          recurrence: "WEEKLY",
          day_of_week: 3,
          start_time: "19:30",
          end_time: "20:45",
        }
      );
      expect(createdRule.status).toBe(201);
      const rules = await apiRequest(
        page,
        `/api/v1/programs/${encodeURIComponent(fixture.programId)}/schedule-rules`
      );
      const ruleId = dataOf<{ rules: { rule_id: string }[] }>(rules).rules[0]
        ?.rule_id;
      expect(ruleId).toBeTruthy();
      await page.goto(
        `/programs?mode=management&program=${encodeURIComponent(fixture.programId)}&task=schedule`
      );
      await page.getByRole("button", { name: COPY.previewEvents }).click();
      await expect(
        page.getByRole("button", { name: COPY.generateEvents })
      ).toBeEnabled();
      const patched = await apiRequest(
        page,
        `/api/v1/programs/${encodeURIComponent(fixture.programId)}/schedule-rules/${encodeURIComponent(ruleId ?? "")}`,
        "PATCH",
        { start_time: "19:45" }
      );
      expect(patched.status).toBe(200);
      await page.getByRole("button", { name: COPY.generateEvents }).click();
      await expect(
        page.getByRole("alert").filter({ hasText: COPY.previewChanged })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: COPY.generateEvents })
      ).toBeDisabled();
      expect((await eventRows(page, fixture.programId)).length).toBe(0);
      await page.getByRole("button", { name: COPY.previewReviewAgain }).click();
      await expect(
        page.getByRole("button", { name: COPY.generateEvents })
      ).toBeEnabled();
      const generated = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response
            .url()
            .includes(`/api/v1/programs/${fixture.programId}/events/generate`)
      );
      await page.getByRole("button", { name: COPY.generateEvents }).click();
      expect((await generated).status()).toBe(200);
      await expect
        .poll(async () => (await eventRows(page, fixture.programId)).length)
        .toBeGreaterThan(0);
    } finally {
      await restoreFixture(page, fixture);
    }
  });

  test("programs-d1 #58: preview/generate controls are unreachable without the manage capability", async ({
    page,
  }) => {
    await loginAs(page, MEMBER.username, MEMBER.credential);
    const catalog = await apiRequest(page, "/api/v1/programs/catalog");
    const programId = dataOf<{
      catalog: { programs: { program_id: string }[] }[];
    }>(catalog).catalog[0]?.programs[0]?.program_id;
    expect(programId).toBeTruthy();
    await page.goto(
      `/programs?mode=management&program=${encodeURIComponent(programId ?? "")}&task=events`
    );
    await expect(
      page.getByRole("heading", { name: COPY.noManagementScope })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: COPY.previewEvents })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: COPY.generateEvents })
    ).toHaveCount(0);
  });

  test("programs-d1 #59: admin sees the three groups, all seven rows, and the course-management card", async ({
    page,
  }) => {
    await loginAs(page);
    await page.goto("/management");
    await expect(
      page.getByRole("heading", { name: COPY.hubTitle })
    ).toBeVisible();
    for (const label of [
      COPY.hubGroupMemberPermissions,
      COPY.hubGroupOperations,
      COPY.hubGroupContentSystem,
    ]) {
      await expect(page.getByRole("heading", { name: label })).toBeVisible();
    }
    const hub = page.getByRole("region", { name: COPY.hubTitle });
    await expect(hub.getByRole("link")).toHaveCount(8);
    await expect(
      hub
        .getByRole("region", { name: COPY.hubGroupMemberPermissions })
        .getByRole("link")
    ).toHaveCount(3);
    await expect(
      hub
        .getByRole("region", { name: COPY.hubGroupOperations })
        .getByRole("link")
    ).toHaveCount(3);
    await expect(
      hub
        .getByRole("region", { name: COPY.hubGroupContentSystem })
        .getByRole("link")
    ).toHaveCount(1);
    const rows: [string, string, string][] = [
      [COPY.hubAccounts, COPY.hubAccountsHint, "/management?module=accounts"],
      [
        COPY.hubApprovals,
        COPY.hubApprovalsHint,
        "/management?module=approvals",
      ],
      [
        COPY.hubPermissions,
        COPY.hubPermissionsHint,
        "/management?module=permissions",
      ],
      [
        COPY.hubDepartments,
        COPY.hubDepartmentsHint,
        "/management?module=departments",
      ],
      [
        COPY.hubAttendance,
        COPY.hubAttendanceHint,
        "/management?module=attendance",
      ],
      [COPY.hubMembers, COPY.hubMembersHint, "/management?module=members"],
      [
        COPY.hubHomeContent,
        COPY.hubHomeContentHint,
        "/management?module=home-content",
      ],
    ];
    for (const [label, hint, href] of rows) {
      await expect(
        page.getByRole("link", { name: new RegExp(label, "u") })
      ).toHaveAttribute("href", href);
      await expect(page.getByText(hint, { exact: true })).toBeVisible();
    }
    await expect(
      page.getByRole("link", {
        name: new RegExp(COPY.hubGoCourseManagement, "u"),
      })
    ).toHaveAttribute("href", "/programs?mode=management");
    await expect(hub.getByText(/Care/iu)).toHaveCount(0);
    await expect(hub.getByText("關懷", { exact: true })).toHaveCount(0);
  });

  test("programs-d1 #60: staff without home.publish sees six granted rows and omits 內容與系統", async ({
    page,
  }) => {
    await loginAs(page, STAFF.username, STAFF.credential);
    await page.goto("/management");
    await expect(
      page.getByRole("heading", { name: COPY.hubTitle })
    ).toBeVisible();
    const hub = page.getByRole("region", { name: COPY.hubTitle });
    await expect(hub.getByRole("link")).toHaveCount(7);
    await expect(
      hub
        .getByRole("region", { name: COPY.hubGroupMemberPermissions })
        .getByRole("link")
    ).toHaveCount(3);
    await expect(
      hub
        .getByRole("region", { name: COPY.hubGroupOperations })
        .getByRole("link")
    ).toHaveCount(3);
    for (const [label, hint] of [
      [COPY.hubAccounts, COPY.hubAccountsHint],
      [COPY.hubApprovals, COPY.hubApprovalsHint],
      [COPY.hubPermissions, COPY.hubPermissionsHint],
      [COPY.hubDepartments, COPY.hubDepartmentsHint],
      [COPY.hubAttendance, COPY.hubAttendanceHint],
      [COPY.hubMembers, COPY.hubMembersHint],
    ]) {
      await expect(
        page.getByRole("link", { name: new RegExp(label, "u") })
      ).toBeVisible();
      await expect(page.getByText(hint, { exact: true })).toBeVisible();
    }
    await expect(
      page.getByRole("heading", { name: COPY.hubGroupContentSystem })
    ).toHaveCount(0);
    await expect(
      page.getByText(COPY.hubHomeContent, { exact: true })
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", {
        name: new RegExp(COPY.hubGoCourseManagement, "u"),
      })
    ).toBeVisible();
    await expect(hub.getByText(/Care/iu)).toHaveCount(0);
    await expect(hub.getByText("關懷", { exact: true })).toHaveCount(0);
  });

  test("programs-d1 #61: attendance hub lists open meetings and opens the selected roster", async ({
    page,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    let eventId = "";
    try {
      const enabled = await apiRequest(
        page,
        `/api/v1/programs/departments/${encodeURIComponent(fixture.departmentId)}/modules/attendance/enable`,
        "POST"
      );
      expect(enabled.status).toBe(200);
      const now = Date.now();
      const meetingName = `E2E_PARITY_61_${now}`;
      eventId = await createEventForProgram(
        page,
        fixture.programId,
        meetingName,
        new Date(now - 30 * 60_000).toISOString(),
        new Date(now + 30 * 60_000).toISOString(),
        {
          opensAt: new Date(now - 15 * 60_000).toISOString(),
          closesAt: new Date(now + 45 * 60_000).toISOString(),
        }
      );
      await page.goto("/management?module=attendance");
      await expect(
        page.getByRole("heading", { name: COPY.attendanceChooserTitle })
      ).toBeVisible();
      await expect(page.getByText(meetingName, { exact: true })).toBeVisible();
      await page
        .getByRole("button", { name: new RegExp(meetingName, "u") })
        .click();
      await expect(page).toHaveURL(
        new RegExp(
          `/management\\?module=attendance&event=${encodeURIComponent(eventId)}$`,
          "u"
        )
      );
      await expect(
        page.getByRole("heading", { name: COPY.rosterTitle })
      ).toBeVisible();
    } finally {
      if (eventId) {
        await apiRequest(
          page,
          `/api/v1/programs/${encodeURIComponent(fixture.programId)}/events/${encodeURIComponent(eventId)}`,
          "PATCH",
          { availability: "Inactive" }
        );
      }
      await restoreFixture(page, fixture);
    }
  });

  test("programs-d1 #62: approvals list opens a routable detail; approve/reject stay atomic and read-only", async ({
    page,
  }) => {
    await loginAs(page);
    const stamp = Date.now();
    const approveUsername = `E2E_PARITY_62_APPROVE_${stamp}`;
    const rejectUsername = `E2E_PARITY_62_REJECT_${stamp}`;
    const approveName = `E2E Parity Approve ${stamp}`;
    const rejectName = `E2E Parity Reject ${stamp}`;
    for (const [username, name] of [
      [approveUsername, approveName],
      [rejectUsername, rejectName],
    ]) {
      const registered = await apiRequest(
        page,
        "/api/v1/auth/register",
        "POST",
        {
          username,
          password: `${username}-pw!1`,
          name,
          phone: "555-0162",
        }
      );
      expect(registered.status).toBe(200);
    }
    const requests = await apiRequest(page, "/api/v1/auth/registrations");
    const rows = dataOf<{
      registrations: { requestId: string; username: string }[];
    }>(requests).registrations;
    const approveId = rows.find(
      (row) => row.username === approveUsername
    )?.requestId;
    const rejectId = rows.find(
      (row) => row.username === rejectUsername
    )?.requestId;
    expect(approveId).toBeTruthy();
    expect(rejectId).toBeTruthy();

    await page.goto("/management?module=approvals");
    for (const name of [approveName, rejectName]) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }
    const approveLink = page.getByRole("link", {
      name: new RegExp(`${COPY.approvalsOpenDetail} ${approveName}`, "u"),
    });
    await expect(approveLink).toHaveAttribute(
      "href",
      `/management?module=approvals&request=${approveId}`
    );

    await page.goto(`/management?module=approvals&request=${approveId}`);
    await expect(
      page.getByRole("heading", { name: COPY.approvalDetailTitle })
    ).toBeVisible();
    await expect(
      page.getByText(COPY.approvalPending, { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText(approveUsername, { exact: true })
    ).toBeVisible();
    await expect(page.getByText("555-0162", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: COPY.approvalApprove }).click();
    await page.getByRole("button", { name: COPY.approvalConfirm }).click();
    await expect(
      page.getByText(COPY.approvalApproved, { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText(COPY.decisionMade, { exact: true }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: COPY.approvalApprove })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: COPY.approvalReject })
    ).toHaveCount(0);
    await page.getByRole("link", { name: COPY.approvalsBack }).click();
    await expect(page).toHaveURL(/\/management\?module=approvals$/u);
    await expect(page.getByText(approveName, { exact: true })).toHaveCount(0);
    await expect(page.getByText(rejectName, { exact: true })).toBeVisible();

    await page.goto(`/management?module=approvals&request=${rejectId}`);
    await page.getByRole("button", { name: COPY.approvalReject }).click();
    const rejectDialog = page.getByRole("alertdialog", {
      name: "確認拒絕申請",
    });
    await expect(rejectDialog).toBeVisible();
    let rejectPosts = 0;
    const rejectPath = `/api/v1/auth/registrations/${rejectId}/reject`;
    const onRejectRequest = (request: Request): void => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === rejectPath
      ) {
        rejectPosts += 1;
      }
    };
    page.on("request", onRejectRequest);
    try {
      await rejectDialog
        .getByRole("button", { name: COPY.approvalRejectConfirm })
        .click();
      await expect(
        page
          .getByRole("alert")
          .filter({ hasText: COPY.approvalRejectionNoteRequired })
      ).toBeVisible();
      await expect(
        page.getByText(COPY.approvalPending, { exact: true })
      ).toBeVisible();
      expect(rejectPosts).toBe(0);
    } finally {
      page.off("request", onRejectRequest);
    }

    const note = "資料不完整，請補充聯絡方式。";
    await page.getByLabel(COPY.approvalDecisionNote).fill(note);
    await page
      .getByRole("alertdialog", { name: "確認拒絕申請" })
      .getByRole("button", { name: COPY.approvalRejectConfirm })
      .click();
    await expect(
      page.getByText(COPY.approvalRejected, { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText(COPY.decisionMade, { exact: true }).first()
    ).toBeVisible();
    await expect(page.getByText(note, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: COPY.approvalApprove })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: COPY.approvalReject })
    ).toHaveCount(0);
    await expect(page.getByLabel(COPY.approvalDecisionNote)).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByText(COPY.approvalRejected, { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText(COPY.decisionMade, { exact: true }).first()
    ).toBeVisible();
    await expect(page.getByText(note, { exact: true })).toBeVisible();
    await expect(page.getByLabel(COPY.approvalDecisionNote)).toHaveCount(0);
    await page.getByRole("link", { name: COPY.approvalsBack }).click();
    await expect(page).toHaveURL(/\/management\?module=approvals$/u);
    await expect(page.getByText(approveName, { exact: true })).toHaveCount(0);
    await expect(page.getByText(rejectName, { exact: true })).toHaveCount(0);
  });

  test("programs-d1 #63: approvals list preserves scroll position after detail back-nav", async ({
    page,
  }) => {
    await loginAs(page);
    const stamp = Date.now();
    const names: string[] = [];
    for (let index = 0; index < 8; index += 1) {
      const username = `E2E_PARITY_63_${stamp}_${index}`;
      const name = `E2E Parity Scroll ${stamp} ${index}`;
      const registered = await apiRequest(
        page,
        "/api/v1/auth/register",
        "POST",
        {
          username,
          password: `${username}-pw!1`,
          name,
          phone: "555-0163",
        }
      );
      expect(registered.status).toBe(200);
      names.push(name);
    }
    await page.goto("/management?module=approvals");
    const last = names.at(-1);
    expect(last).toBeTruthy();
    const detailLink = page.getByRole("link", {
      name: new RegExp(`${COPY.approvalsOpenDetail} ${last}`, "u"),
    });
    await expect(detailLink).toBeVisible();
    const detailHref = await detailLink.getAttribute("href");
    expect(detailHref).toBeTruthy();
    const detailUrl = new URL(detailHref ?? "", page.url()).toString();
    await detailLink.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>("#shell-content");
      scroller?.scrollTo(0, scroller.scrollHeight);
      return scroller?.scrollTop ?? 0;
    });
    expect(before).toBeGreaterThan(0);
    await detailLink.click();
    await expect(page).toHaveURL(detailUrl, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: COPY.approvalDetailTitle })
    ).toBeVisible({ timeout: 15_000 });
    await page.goBack();
    await expect(page).toHaveURL(/\/management\?module=approvals$/u);
    await expect(page.getByText(names[0] ?? "", { exact: true })).toBeVisible();
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              document.querySelector<HTMLElement>("#shell-content")
                ?.scrollTop ?? 0
          ),
        { message: "approval queue restores its inner scroll position" }
      )
      .toBeGreaterThanOrEqual(before - 50);
  });
});
