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
import type { Browser, Locator, Page } from "@playwright/test";

import { DEV_ADMIN, DEV_MEMBER, DEV_STAFF } from "./dev-fixtures";

const configuredTarget = process.env.PROGRAMS_TARGET_URL;
const TARGET_ORIGIN = new URL(
  configuredTarget ?? "http://127.0.0.1:8787"
).origin;
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
  sessionExpired: {
    reLogin: "重新登入",
  },
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
  nextMeeting: "下一次聚會",
  detailEventLocation: "地點",
  viewEventDetail: "查看聚會詳情",
  checkInAvailable: "可簽到",
  eventInstructions: "請於簽到時間內前往掃描，確認聚會後完成簽到。",
  goToScan: "前往掃描",
  backToOrigin: "返回",
  noticesListLabel: "通知清單",
  noticesMarkAllRead: "全部標示已讀",
  noticesMarkedAllRead: "已將全部通知標示為已讀",
  noticesUnread: "未讀",
  noticesEmpty: "暫時沒有通知",
  noticesLoading: "正在載入通知…",
  noticesRetry: "重試載入通知",
  noticesLoadError: "未能載入通知。",
  scheduleTitle: "聚會時間表",
  conflictNote: "此時段與「{program}」聚會時間相近，僅供提示，不影響報名。",
  archivedNote: "此課程已封存，暫不接受報名",
  catalogSearchLabel: "搜尋課程",
  catalogClearSearch: "清除搜尋",
  catalogNoMatches: "找不到相關課程",
  catalogEmpty: "找不到相關課程",
  catalogEmptyHint: "請嘗試其他關鍵字或清除篩選。",
  catalogClearFilters: "清除篩選",
  catalogListLabel: "課程目錄",
  filterGroupLabel: "課程篩選",
  filterAll: "全部",
  filterEligible: "可報名",
  filterActive: "已參加",
  filterPending: "待審批",
  filterDraft: "草稿",
  statusActive: "已參加",
  statusPending: "待審批",
  statusEligible: "可報名",
  statusManagerOnly: "由同工安排",
  statusWithdrawn: "已取消申請",
  statusCancelled: "已退出",
  statusRejected: "已拒絕",
  statusArchived: "已封存",
  enrollment: "報名",
  enroll: "報名",
  reEnroll: "重新報名",
  requestEnroll: "申請報名",
  requestSubmitted: "報名申請已提交",
  requestPendingHint: "申請已送出，等待課程負責人處理。",
  withdrawRequest: "取消申請",
  withdrawConfirmTitle: "取消報名申請？",
  withdrawConfirmBody: "你仍可在課程接受報名期間重新提交。",
  withdrawConfirmAccept: "取消申請",
  requestWithdrawnNotice: "已取消申請",
  cancelEnrollment: "退出課程",
  cancelConfirmTitle: "退出課程？",
  cancelConfirmBody: "退出後如需再參加，需重新報名。",
  cancelConfirmAccept: "退出課程",
  enrollmentCancelledNotice: "已退出課程",
  cancelRevoke: "取消",
  updated: "已更新。",
  offlineError: "未能儲存。請重新連線後再試。",
  requestPending: "待處理",
  enrollmentActiveHint: "你目前已加入此課程。",
  enrollmentScheduleAdvisory:
    "申請前請確認時間是否適合；系統只提供提示，不會因時間重疊自動阻擋。",
  managerOnlyNote: "此課程由同工安排參加",
  managementDirectoryTitle: "管理課程目錄",
  attentionTitle: "管理提示",
  attentionZero: "目前沒有需要處理或檢視的項目。",
  notificationRegion: "管理通知",
  notificationBell: "開啟管理通知",
  notificationTitle: "管理通知",
  notificationZero: "目前沒有新的管理通知。",
  notificationViewAll: "查看全部通知",
  hubTitle: "管理工作",
  hubLead: "在你獲授權的範圍內處理會員、課程、聚會及內容工作。",
  hubGroupMemberPermissions: "會員與權限",
  hubGroupOperations: "事工營運",
  hubGroupContentSystem: "內容與系統",
  hubApprovals: "註冊審批",
  hubApprovalsHint: "核准或拒絕會員申請",
  hubPermissions: "帳戶與權限",
  hubPermissionsHint: "管理員帳戶及角色",
  hubDepartments: "部門設定",
  hubDepartmentsHint: "部門開關、管理者及建立課程",
  hubAttendance: "聚會／出席",
  hubAttendanceHint: "出席點名、代簽及修正",
  attendanceChooserTitle: "聚會／出席",
  attendanceChooserLead: "選擇一個開放簽到的聚會，處理出席點名及代簽。",
  attendanceChooserEmpty: "目前沒有開放簽到的聚會",
  attendanceChooserOpenMeetings: "開放簽到的聚會",
  rosterTitle: "簽到名單",
  hubMembers: "參與者",
  hubMembersHint: "搜尋並查看會員資料",
  hubHomeContent: "首頁內容",
  hubHomeContentHint: "版面 A／B 編輯及發佈",
  hubAnotherEntry: "另一個工作入口",
  hubGoCourseManagement: "前往課程管理",
  hubGoCourseManagementHint:
    "課程 tab 內以管理模式選擇課程，再進入 Course Cockpit。",
  // 087-02 (#319): registration approvals list + routable detail.
  approvals: {
    approvalsTitle: "註冊審批",
    openDetail: "查看申請詳情",
    approvalDetailTitle: "註冊審批 · 詳情",
    backToApprovals: "返回註冊審批",
    applicantName: "姓名",
    applicantContact: "聯絡",
    status: "狀態",
    statusPending: "待審批",
    statusApproved: "已核准",
    statusRejected: "已拒絕",
    approve: "核准",
    reject: "拒絕",
    decisionNote: "決定備註",
    rejectionNoteRequired: "拒絕時必須填寫決定備註。",
    decisionMade: "已處理申請。",
  },
  managementDirectorySearchLabel: "搜尋可管理課程",
  managementScopeDepartment: "部門範圍",
  workspaceIdentity: "課程資料",
  workspaceNearestEvent: "最近聚會",
  workspaceTaskEvents: "聚會",
  workspaceTaskParticipants: "參與者",
  workspacePendingRequests: "待處理報名",
  workspaceActiveParticipants: "活躍參與者",
  cockpitNextMeeting: "下一聚會",
  cockpitOperations: "營運",
  cockpitWeeklyWork: "每週工作",
  cockpitEventsTile: "聚會",
  cockpitParticipantsTile: "參與者",
  cockpitEventsCount: "{count} 個聚會",
  cockpitPendingLabel: "待審批報名 ×{count}",
  cockpitNoPending: "查看活躍名單",
  cockpitManageRoster: "前往管理名單",
  cockpitCheckedIn: "已簽到",
  cockpitAutoScheduled: "自動排程",
  cockpitOthers: "其他",
  cockpitLowFrequency: "低頻設定",
  cockpitCourseFacts: "課程資料",
  cockpitCourseFactsHint: "只讀摘要與分類標籤",
  courseFacts: "課程資料",
  courseFactsHint: "只讀摘要與分類標籤",
  factsName: "課程名稱",
  factsDepartment: "所屬部門",
  factsPurpose: "課程簡介",
  factsLifecycle: "課程狀態",
  factsDiscoverability: "可見性",
  factsEnrollmentMode: "報名方式",
  editTitle: "編輯課程",
  editNameLabel: "課程名稱",
  editPurposeLabel: "課程簡介",
  saveCourse: "儲存課程",
  courseSaved: "課程已更新",
  editRequired: "請完成課程名稱及簡介",
  workspaceParticipantsRefresh: "重新整理參與者資料",
  workspaceParticipantsPendingEmpty: "目前沒有待處理報名。",
  tabsPending: "待審批",
  tabsActive: "使用中",
  tabsHistory: "歷史",
  assistedEnroll: "代報名",
  assistedEnrollAck: "只會建立報名紀錄，不會自動簽到。",
  approve: "核准",
  reject: "拒絕",
  decisionNote: "決定備註",
  decisionMade: "已處理申請。",
  enrollmentHistory: "你的報名紀錄",
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
  createProgram: "建立課程",
  programCreatedNotice: "課程已建立（草稿狀態）",
  editProgram: "編輯課程",
  saveProgram: "儲存課程",
  workspaceDepartment: "所屬部門",
  programName: "課程名稱",
  programPurpose: "課程目的",
  programCategory: "活動類別",
  behaviorType: "形式",
  behaviorOneOff: "單次",
  lifecycle: "課程狀態",
  lifecycleActive: "啟用",
  // EVT-01 (#251): event operational detail and independent availability.
  createMeeting: "建立聚會",
  createMeetingValidation: "請輸入日期、時間及聚會名稱。",
  eventDate: "日期",
  eventTime: "時間",
  eventType: "類型",
  eventTypeTraining: "訓練",
  recurrenceTag: "重複標記",
  recurrenceNone: "無",
  repeatInformational: "「重複標記」只作顯示參考，不會自動生成其他聚會。",
  cancelBlockedWithAttendance:
    "此聚會已有出席記錄，不能取消；如需更正請使用出席名單的作廢功能。",
  cancelMeetingConfirmTitle: "取消此聚會？",
  cancelMeetingConfirmBody:
    "取消後此聚會不再開放簽到，記錄會保留為「已取消」。",
  confirmCancelMeeting: "取消聚會",
  keepMeeting: "保留聚會",
  secondaryGeneratorLabel: "按時間表預覽及產生聚會",
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
  attentionEventCount: "{count} 場聚會需檢視",
  attentionCancelledCount: "{count} 場聚會狀態",
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
  departmentsTitle: "部門設定",
  departmentsLead: "只顯示你獲授權管理的部門。",
  modules: "模組",
  moduleProgramCatalog: "課程目錄",
  moduleEnrollment: "報名",
  moduleEvents: "聚會",
  moduleAttendance: "出席",
  moduleCustomForms: "自訂表格",
  departmentManagers: "部門管理者",
  departmentManagerUserId: "選擇部門管理者",
  assignDepartmentManager: "指派部門管理者",
  revokeDepartmentManager: "撤銷部門管理者",
  confirmRevokeDepartmentManager: "確定要撤銷此部門管理者嗎？",
  departmentManagerAssignedNotice: "已指派部門管理者。",
  departmentManagerRevokedNotice: "已撤銷部門管理者。",
  noDepartmentManagers: "目前沒有部門管理者。",
  settingsScheduleUnavailable:
    "所屬部門目前未啟用聚會模組；不能在這裡編輯時間表規則。",
  settingsAttendanceUnavailable:
    "所屬部門目前未啟用出席模組；不能在這裡編輯簽到預設。",
  discoverabilityListed: "公開",
  discoverabilityUnlisted: "不公開",
  settingsSaveEnrollment: "儲存報名與可見性",
  settingsConfirmEnrollment:
    "確認後會影響日後的新報名與課程目錄顯示；既有紀錄不會改變。",
  settingsConfirmChange: "確認變更",
  settingsSaved: "課程設定已儲存。",
  eventAvailabilityConfirmBody:
    "暫停後，此聚會將停止開放簽到（{count} 項進行中的操作會受影響）。",
  // 087-03 Account Permissions matrix (mirrors COPY.permissions).
  permissionsTitle: "帳戶與權限",
  permissionsLead:
    "管理員帳戶可指派角色及部門授權。角色變更會即時反映；部門管理者不能自行授予管理者權限。",
  accountsSection: "管理員帳戶",
  rolesSection: "角色定義",
  accountName: "姓名",
  accountRole: "角色",
  accountDepartment: "部門",
  roleAdmin: "管理員",
  roleAdminScope: "全部範圍",
  roleDepartmentManager: "部門管理者",
  roleDepartmentManagerScope: "所屬部門課程、聚會及出席",
  roleStaff: "同工",
  roleStaffScope: "部門範圍內協助工作",
  stateAssigned: "已設",
  stateAssignable: "可指派",
  backToSettings: "設定",
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

/**
 * The eligible action is 報名 (enroll); after a withdrawn/cancelled/rejected
 * history it becomes 重新報名 (reEnroll). Shared member-flow helpers must
 * accept either so repeated suite runs against the same D1 stay stable.
 */
function submitActionButton(panel: Locator) {
  return panel.getByRole("button", {
    name: new RegExp(`^(${COPY.enroll}|${COPY.reEnroll})$`, "u"),
  });
}

/**
 * The enrollment section is named 報名; the nested history section is named
 * 你的報名紀錄, which substring-matches 報名 under Playwright's getByRole
 * name matching. Anchor the exact label so the locator never straddles both.
 */
function enrollmentPanelOf(page: Page): Locator {
  return page.getByRole("region", {
    name: new RegExp(`^${COPY.enrollment}$`, "u"),
  });
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

    // The stale localStorage presence hint survives cookie clearing, so the
    // shell surfaces the dedicated session-expired screen (prototype-exact,
    // 084-01) and remembers the deep link; re-login returns to the form.
    await expect(page).toHaveURL(/\/$/u);
    const relogin = page.getByRole("button", {
      name: COPY.sessionExpired.reLogin,
    });
    await expect(relogin).toBeVisible();
    await relogin.click();
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
  test("member sees Listed catalog rows with status tags and never the Unlisted fixture", async ({
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
      page.getByRole("button", { name: /E2E_DEMO_管理安排/u })
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: new RegExp(COPY.statusManagerOnly, "u"),
      })
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

  test("filter pills allow filtering by viewer relationship", async ({
    page,
    browser,
  }) => {
    // A fresh member makes the viewer-relative states deterministic: the
    // shared local D1 accumulates enrollment history across earlier tests,
    // so the stock E2E_member's relationship to the demo programs is not
    // guaranteed pristine. Register + approve a unique member here.
    const freshUsername = `E2E_filter_${Date.now()}`;
    const freshPassword = "E2E_filter_pw!1";
    const freshName = `E2E Filter ${Date.now()}`;
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const registered = await page.evaluate(
      async ({ username, password, name }) => {
        const response = await fetch("/api/v1/auth/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": `e2e-register-${Date.now()}`,
          },
          body: JSON.stringify({
            username,
            password,
            name,
            phone: "555-0200",
          }),
        });
        return { ok: response.ok, status: response.status };
      },
      { username: freshUsername, password: freshPassword, name: freshName }
    );
    expect(registered.ok, "fresh member registration must submit").toBe(true);
    const approved = await page.evaluate(
      async ({ username }) => {
        const listResponse = await fetch("/api/v1/auth/registrations");
        const body = (await listResponse.json()) as {
          data?: {
            registrations?: { requestId: string; username: string }[];
          };
        };
        const pending = body.data?.registrations?.find(
          (row) => row.username === username
        );
        if (!pending) {
          return { ok: false, status: 404 };
        }
        const response = await fetch(
          `/api/v1/auth/registrations/${encodeURIComponent(pending.requestId)}/approve`,
          {
            method: "POST",
            headers: { "Idempotency-Key": `e2e-approve-${Date.now()}` },
          }
        );
        return { ok: response.ok, status: response.status };
      },
      { username: freshUsername }
    );
    expect(approved.ok, "admin must approve the fresh member").toBe(true);

    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    let programId = "";
    try {
      await loginAs(memberPage, freshUsername, freshPassword);

      const filterGroup = memberPage.getByRole("group", {
        name: COPY.filterGroupLabel,
      });
      await expect(filterGroup).toBeVisible();

      const allPill = filterGroup.getByRole("button", {
        name: COPY.filterAll,
      });
      const eligiblePill = filterGroup.getByRole("button", {
        name: COPY.filterEligible,
      });
      const activePill = filterGroup.getByRole("button", {
        name: COPY.filterActive,
      });
      const pendingPill = filterGroup.getByRole("button", {
        name: COPY.filterPending,
      });

      await expect(allPill).toHaveAttribute("aria-pressed", "true");

      // Filter: 可報名 — the fresh member is eligible for every MemberRequest
      // program and never for the ManagerOnly one.
      await eligiblePill.click();
      await expect(eligiblePill).toHaveAttribute("aria-pressed", "true");
      await expect(allPill).toHaveAttribute("aria-pressed", "false");
      await expect(
        memberPage.getByRole("button", { name: /E2E_DEMO_成人查經/u })
      ).toBeVisible();
      await expect(
        memberPage.getByRole("button", { name: /E2E_DEMO_青年團契/u })
      ).toBeVisible();
      await expect(
        memberPage.getByRole("button", { name: /E2E_DEMO_管理安排/u })
      ).toHaveCount(0);

      // Filter: 待審批 — submit a real enrollment request, then the pill
      // shows exactly the requested program. Use 青年團契 (not 成人查經):
      // the 成人查經 roster counts are asserted exactly by MUI-01/EVT-01
      // tests running concurrently on other viewport workers against the
      // same shared D1, so this test must never write enrollments to it.
      [programId] = await catalogProgramIds(memberPage, "E2E_DEMO_青年團契");
      expect(programId).toBeTruthy();
      await memberPage.goto(`/programs?program=${programId}#overview`);
      const enrollmentPanel = enrollmentPanelOf(memberPage);
      await submitActionButton(enrollmentPanel).click();
      await expect(
        enrollmentPanel.getByText(COPY.requestPendingHint)
      ).toBeVisible();
      await memberPage.goto("/programs");
      await pendingPill.click();
      await expect(pendingPill).toHaveAttribute("aria-pressed", "true");
      await expect(
        memberPage.getByRole("button", { name: /E2E_DEMO_青年團契/u })
      ).toBeVisible();
      await expect(
        memberPage.getByRole("button", { name: /E2E_DEMO_成人查經/u })
      ).toHaveCount(0);

      // Filter: 已參加 — the admin approves the fresh request; the member's
      // relationship becomes Active and the pill shows the enrolled program.
      await page.goto(
        `/programs?mode=management&program=${encodeURIComponent(programId)}&task=participants`
      );
      const requestRow = page
        .getByRole("listitem")
        .filter({ hasText: freshName });
      await expect(
        requestRow.getByRole("button", { name: COPY.approve })
      ).toBeVisible();
      await requestRow.getByRole("button", { name: COPY.approve }).click();
      await expect(
        page
          .getByRole("region", { name: COPY.workspaceTaskParticipants })
          .getByText(COPY.decisionMade, { exact: true })
      ).toBeVisible();
      await memberPage.goto("/programs");
      await activePill.click();
      await expect(activePill).toHaveAttribute("aria-pressed", "true");
      await expect(
        memberPage.getByRole("button", { name: /E2E_DEMO_青年團契/u })
      ).toBeVisible();
      await expect(
        memberPage.getByRole("button", { name: /E2E_DEMO_成人查經/u })
      ).toHaveCount(0);

      // Filter: 全部 restores every listed row, including the ManagerOnly one.
      await allPill.click();
      await expect(allPill).toHaveAttribute("aria-pressed", "true");
      await expect(
        memberPage.getByRole("button", { name: /E2E_DEMO_成人查經/u })
      ).toBeVisible();
      await expect(
        memberPage.getByRole("button", { name: /E2E_DEMO_青年團契/u })
      ).toBeVisible();
      await expect(
        memberPage.getByRole("button", { name: /E2E_DEMO_管理安排/u })
      ).toBeVisible();
    } finally {
      // Best-effort cleanup on every path: cancel the fresh member's Active
      // enrollment so the shared D1 returns to its pre-test enrollment
      // state — an extra Active enrollment would break the queue-count and
      // event 已報名 count assertions in later tests on the same database.
      try {
        if (programId) {
          await memberPage.goto(`/programs?program=${programId}#overview`);
          const cleanupPanel = enrollmentPanelOf(memberPage);
          const cancel = cleanupPanel.getByRole("button", {
            name: COPY.cancelEnrollment,
          });
          if (await cancel.isVisible()) {
            await cancel.click();
            // The exit action is gated by an explicit confirm dialog;
            // anchor the accept label exactly (getByRole name is substring).
            await cleanupPanel
              .getByRole("button", {
                name: new RegExp(`^${COPY.cancelConfirmAccept}$`, "u"),
              })
              .click();
          }
        }
      } catch {
        // Cleanup is best-effort; the test outcome is already decided.
      }
      await memberContext.close();
    }
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
      page.getByRole("heading", { name: COPY.catalogEmpty })
    ).toBeVisible();
    await expect(
      page.locator("#programs-catalog-state").getByRole("button", {
        name: COPY.catalogClearFilters,
      })
    ).toBeVisible();
    await page
      .locator("#programs-catalog-state")
      .getByRole("button", { name: COPY.catalogClearFilters })
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
    // The detail surfaces the real next-meeting projection: mono label,
    // meeting title, date/time, and the event-detail action.
    await expect(page.getByText(COPY.nextMeeting)).toBeVisible();
    await expect(
      page.getByRole("button", { name: COPY.viewEventDetail })
    ).toBeVisible();
    // Schedule rules render as the 聚會時間表 table (E2E_DEMO_成人查經 is
    // seeded with a weekly rule and generated meetings).
    await expect(
      page.getByRole("table", { name: COPY.scheduleTitle })
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("heading", { name: COPY.detailPurpose })
    ).toBeVisible();
    await expect(
      page.getByRole("table", { name: COPY.scheduleTitle })
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

test.describe("PUI-05 participant Event Detail", () => {
  test("opens from Program detail, shows availability, and 前往掃描 pre-selects the event", async ({
    page,
    browser,
  }) => {
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    let programId = "";
    try {
      await loginAs(
        memberPage,
        required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
        required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
      );
      [programId] = await catalogProgramIds(memberPage, "E2E_DEMO_成人查經");
      expect(programId).toBeTruthy();

      // Event Detail is gated to enrolled members; establish an Active
      // enrollment (request → admin approval) like PUI-04 does. Tolerate a
      // leftover Pending request or Active enrollment from an interrupted
      // prior run.
      await memberPage.goto(`/programs?program=${programId}#overview`);
      const enrollmentPanel = enrollmentPanelOf(memberPage);
      const pendingHint = enrollmentPanel.getByText(COPY.requestPendingHint);
      const activeHint = enrollmentPanel.getByText(COPY.enrollmentActiveHint);
      await expect(
        submitActionButton(enrollmentPanel).or(pendingHint).or(activeHint)
      ).toBeVisible();
      const needsApproval = !(await activeHint.isVisible().catch(() => false));
      if (
        needsApproval &&
        !(await pendingHint.isVisible().catch(() => false))
      ) {
        await submitActionButton(enrollmentPanel).click();
        await expect(pendingHint).toBeVisible();
      }
      if (needsApproval) {
        await loginAs(
          page,
          required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
          required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
        );
        await page.goto(
          `/programs?mode=management&program=${encodeURIComponent(programId)}&task=participants`
        );
        const requestRow = page
          .getByRole("listitem")
          .filter({ hasText: "E2E Member" });
        await expect(
          requestRow.getByRole("button", { name: COPY.approve })
        ).toBeVisible();
        await requestRow.getByRole("button", { name: COPY.approve }).click();
        await expect(
          page
            .getByRole("region", { name: COPY.workspaceTaskParticipants })
            .getByText(COPY.decisionMade, { exact: true })
        ).toBeVisible();
        await memberPage.reload();
      }

      // From Program detail, open the next-meeting event detail (boundary
      // intent deep link: /programs?program=<id>&event=<eventId>).
      await memberPage.goto(`/programs?program=${programId}#overview`);
      await expect(
        memberPage.getByRole("heading", { name: COPY.detailPurpose })
      ).toBeVisible();
      const eventDetailButton = memberPage.getByRole("button", {
        name: COPY.viewEventDetail,
      });
      await expect(eventDetailButton).toBeVisible();
      await eventDetailButton.click();
      await expect(memberPage).toHaveURL(
        new RegExp(
          `/programs\\?program=${encodeURIComponent(programId)}&event=[^&]+$`,
          "u"
        )
      );

      // Event detail: the event-name heading (PUI-05 renders the real event
      // title, not a fixed label), back action, instructions, and scan CTA.
      await expect(
        memberPage.locator("#participant-event-title")
      ).toBeVisible();
      await expect(memberPage.getByText(COPY.eventInstructions)).toBeVisible();
      await expect(
        memberPage.getByRole("button", { name: COPY.backToOrigin })
      ).toBeVisible();
      // 可簽到 badge is conditional on the real check-in window; assert it
      // only when present (the acceptance requires it only when the window is
      // currently open).
      const badge = memberPage.getByText(COPY.checkInAvailable);
      if ((await badge.count()) > 0) {
        await expect(badge.first()).toBeVisible();
      }

      // 前往掃描 deep-links into the scanner with this exact event; the flow
      // resolves it (server returns the matching event pre-selected).
      const scanCta = memberPage.getByRole("link", { name: COPY.goToScan });
      await expect(scanCta).toBeVisible();
      const ctaHref = await scanCta.getAttribute("href");
      expect(ctaHref).toMatch(/\/scanner\?event=[^&]+$/u);
      const eventIdFromCta = new URL(
        ctaHref ?? "",
        "http://x"
      ).searchParams.get("event");
      expect(eventIdFromCta).toBeTruthy();
      const resolvePromise = memberPage.waitForResponse(
        (response) =>
          response.url().includes("/api/v1/attendance/resolve") &&
          response
            .url()
            .includes(`event=${encodeURIComponent(eventIdFromCta ?? "")}`)
      );
      await scanCta.click();
      await expect(memberPage).toHaveURL(/\/scanner\?event=[^&]+$/u);
      const resolveResponse = await resolvePromise;
      const resolveBody = (await resolveResponse.json()) as {
        data?: { events?: { event_id?: string }[] };
      };
      const resolvedIds = (resolveBody.data?.events ?? []).map(
        (event) => event.event_id
      );
      // The CTA deep-link must pre-select THIS exact event: when the check-in
      // window is open the resolve response contains exactly the target event;
      // when closed it returns an empty events list and the scanner shows the
      // outcome screen (never a different event).
      expect(Array.isArray(resolveBody.data?.events)).toBe(true);
      if (resolvedIds.length > 0) {
        expect(resolvedIds).toEqual([eventIdFromCta]);
      }

      // Back navigation returns to the originating Program detail (no
      // hardcoded target): browser back restores the event detail, then the
      // program detail.
      await memberPage.goBack();
      await expect(memberPage).toHaveURL(
        new RegExp(
          `/programs\\?program=${encodeURIComponent(programId)}&event=[^&]+$`,
          "u"
        )
      );
      await memberPage.goBack();
      await expect(memberPage).toHaveURL(
        new RegExp(`/programs\\?program=${programId}#overview$`, "u")
      );
    } finally {
      if (programId) {
        // Failure-safe cleanup: cancel any Active enrollment and withdraw
        // any Pending request so later queue/roster counts stay stable
        // (same contract as PUI-04's cleanup, member self-service API).
        await memberPage.evaluate(async (id) => {
          const enrollmentsResponse = await fetch(
            `/api/v1/programs/${encodeURIComponent(id)}/enrollments`
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
          const enrollment = enrollmentsBody.data?.enrollments?.find(
            (row) =>
              row.member_user_id === "U-E2E-MEMBER" && row.status === "Active"
          );
          if (enrollment) {
            await fetch(
              `/api/v1/programs/${encodeURIComponent(id)}/enrollments/${encodeURIComponent(enrollment.enrollment_id)}/cancel`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              }
            );
          }
          const requestsResponse = await fetch(
            `/api/v1/programs/${encodeURIComponent(id)}/enrollment-requests`
          );
          const requestsBody = (await requestsResponse.json()) as {
            data?: {
              requests?: {
                request_id: string;
                member_user_id: string;
                status: string;
              }[];
            };
          };
          const request = requestsBody.data?.requests?.find(
            (row) =>
              row.member_user_id === "U-E2E-MEMBER" && row.status === "Pending"
          );
          if (request) {
            await fetch(
              `/api/v1/programs/${encodeURIComponent(id)}/enrollment-requests/${encodeURIComponent(request.request_id)}/withdraw`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              }
            );
          }
        }, programId);
      }
      await memberContext.close();
    }
  });
});

test.describe("NTC-01 participant Notices", () => {
  // PUI-05's cleanup cancels the demo member's Active enrollment in the
  // recurring program (the same program the 聚會提醒 notice deep-links
  // into), and getEventDetail requires an Active enrollment for the
  // participant projection. The deep-link tests below re-establish it and
  // cancel it afterwards, because PUI-04 (which runs later) expects the
  // member to start un-enrolled.
  async function enrollAndCancelAround(
    page: Page,
    run: () => Promise<void>,
    browser: Browser
  ): Promise<void> {
    // API-only: browser logins here would hammer the local worker and
    // slow PUI-04's subsequent page load (its assertion races the
    // loading state). Use the page context's APIRequestContext with an
    // explicit auth cookie (the login redirect is manual; the context
    // does not auto-carry the Set-Cookie on a followed redirect).
    const apiContext = await browser.newContext();
    const api = apiContext.request;
    try {
      const loginResponse = await api.post(`${TARGET_ORIGIN}/api/v1/auth/login`, {
        data: {
          username: required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
          password: required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED),
        },
      });
      expect(loginResponse.ok()).toBe(true);
      const setCookie = loginResponse.headers()["set-cookie"];
      const authCookie = setCookie?.split(";")[0];
      expect(authCookie).toBeTruthy();
      const adminHeaders = authCookie
        ? { Cookie: authCookie, Origin: TARGET_ORIGIN }
        : { Origin: TARGET_ORIGIN };
      const directoryResponse = await api.get(
        `${TARGET_ORIGIN}/api/v1/programs/management-directory`,
        { headers: adminHeaders }
      );
      const directory = (await directoryResponse.json()) as {
        data?: { programs?: { program_id: string; name: string }[] };
      };
      const program = directory.data?.programs?.find(
        (p) => p.name === "E2E_DEMO_成人查經"
      );
      expect(program?.program_id).toBeTruthy();
      const programId = program!.program_id;
      const enrollResponse = await api.post(
        `${TARGET_ORIGIN}/api/v1/programs/${encodeURIComponent(programId)}/enrollments`,
        {
          headers: adminHeaders,
          data: { member_user_id: DEV_MEMBER.userId },
        }
      );
      expect(enrollResponse.status()).toBe(201);
      // Let the local worker settle after the API burst; the member's
      // browser login right after can otherwise race the still-busy
      // workerd and stall on the permission-check redirect.
      await page.waitForTimeout(250);
      try {
        await run();
      } finally {
        // Cancel any Active enrollment so PUI-04 (runs later) sees the
        // member un-enrolled with no Active row.
        const enrollmentsResponse = await api.get(
          `${TARGET_ORIGIN}/api/v1/programs/${encodeURIComponent(programId)}/enrollments`,
          { headers: adminHeaders }
        );
        const body = (await enrollmentsResponse.json()) as {
          data?: {
            enrollments?: {
              enrollment_id: string;
              member_user_id: string;
              status: string;
            }[];
          };
        };
        const enrollment = body.data?.enrollments?.find(
          (row) =>
            row.member_user_id === DEV_MEMBER.userId &&
            row.status === "Active"
        );
        if (enrollment) {
          const cancelResponse = await api.post(
            `${TARGET_ORIGIN}/api/v1/programs/${encodeURIComponent(programId)}/enrollments/${encodeURIComponent(enrollment.enrollment_id)}/cancel`,
            { headers: adminHeaders, data: {} }
          );
          expect(cancelResponse.ok()).toBe(true);
        }
      }
    } finally {
      await apiContext.close();
    }
  }

  test("lists notices with unread indicators and timestamps, and marks all read", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );
    await page.goto("/notices");
    const list = page.getByRole("list", { name: COPY.noticesListLabel });
    await expect(list).toBeVisible();
    // The demo seed creates 3 notices: 聚會提醒 (event), 報名結果
    // (program), 帳戶更新 (account).
    await expect(list.getByRole("link", { name: /聚會提醒/u })).toBeVisible();
    await expect(list.getByRole("link", { name: /報名結果/u })).toBeVisible();
    await expect(list.getByRole("link", { name: /帳戶更新/u })).toBeVisible();
    // Per-item timestamp renders as <time>.
    await expect(list.locator("time").first()).toBeVisible();

    // The three viewport projects share one D1; the first sees the fresh
    // 2-unread seed, later ones see the already-marked state.
    const fresh = (await page.getByText(`2 ${COPY.noticesUnread}`).count()) > 0;
    if (fresh) {
      // Two unread sr-only labels (the read 帳戶更新 notice has none).
      await expect(
        list.getByText(COPY.noticesUnread, { exact: true })
      ).toHaveCount(2);
      await page.getByRole("button", { name: COPY.noticesMarkAllRead }).click();
      // Toast confirmation via the announce live region.
      await expect(
        page.getByRole("status").filter({ hasText: COPY.noticesMarkedAllRead })
      ).toBeVisible();
      await expect(page.getByText(`2 ${COPY.noticesUnread}`)).toHaveCount(0);
      // Server-persisted: reload keeps read state; notices retained.
      await page.reload();
      await expect(
        page.getByRole("button", { name: COPY.noticesMarkAllRead })
      ).toBeDisabled();
      await expect(
        list.getByText(COPY.noticesUnread, { exact: true })
      ).toHaveCount(0);
    } else {
      await expect(page.getByText(`2 ${COPY.noticesUnread}`)).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: COPY.noticesMarkAllRead })
      ).toBeDisabled();
      await expect(
        list.getByText(COPY.noticesUnread, { exact: true })
      ).toHaveCount(0);
    }
  });

  test("opens an event notice to the Event Detail", async ({ page, browser }) => {
    await enrollAndCancelAround(page, async () => {
      await loginAs(
        page,
        required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
        required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
      );
      await page.goto("/notices");
      await page.getByRole("link", { name: /聚會提醒/u }).click();
      await expect(page).toHaveURL(/\/programs\?program=[^&]+&event=[^&]+$/u);
    }, browser);
  });

  test("returns to Notices after back from event detail opened via notice", async ({
    page,
    browser,
  }) => {
    await enrollAndCancelAround(page, async () => {
      await loginAs(
        page,
        required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
        required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
      );
      await page.goto("/notices");
      await page.getByRole("link", { name: /聚會提醒/u }).click();
      await expect(page).toHaveURL(/\/programs\?program=[^&]+&event=[^&]+$/u);
      await page.getByRole("button", { name: COPY.backToOrigin }).click();
      await expect(page).toHaveURL(/\/notices$/u);
      await expect(
        page.getByRole("list", { name: COPY.noticesListLabel })
      ).toBeVisible();
    }, browser);
  });

  test("opens a program notice to the Program detail", async ({ page, browser }) => {
    await enrollAndCancelAround(page, async () => {
      await loginAs(
        page,
        required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
        required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
      );
      await page.goto("/notices");
      await page.getByRole("link", { name: /報名結果/u }).click();
      await expect(page).toHaveURL(/\/programs\?program=[^&]+$/u);
    }, browser);
  });

  test("opens an account notice to the account page", async ({ page }) => {
    await loginAs(
      page,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );
    await page.goto("/notices");
    await page.getByRole("link", { name: /帳戶更新/u }).click();
    await expect(page).toHaveURL(/\/profile$/u);
  });
});

test.describe("PUI-04 participant Enrollment lifecycle", () => {
  test("member submits a request, sees Pending, and withdraws through the confirm dialog", async ({
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

    const enrollmentPanel = enrollmentPanelOf(page);
    const requestButton = submitActionButton(enrollmentPanel);
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
    // The real request is also projected into the member's own history.
    await expect(
      enrollmentPanel.getByRole("list", { name: COPY.enrollmentHistory })
    ).toContainText(COPY.requestPending);

    // Dismissing the confirm dialog leaves the request intact.
    await enrollmentPanel
      .getByRole("button", { name: COPY.withdrawRequest })
      .click();
    const withdrawDialog = page.getByRole("dialog", {
      name: COPY.withdrawConfirmTitle,
    });
    await expect(withdrawDialog).toBeVisible();
    await expect(
      withdrawDialog.getByText(COPY.withdrawConfirmBody)
    ).toBeVisible();
    // Playwright getByRole name matches substrings, so anchor exact labels.
    await withdrawDialog
      .getByRole("button", { name: new RegExp(`^${COPY.cancelRevoke}$`, "u") })
      .click();
    await expect(
      page.getByRole("dialog", { name: COPY.withdrawConfirmTitle })
    ).toHaveCount(0);
    await expect(
      enrollmentPanel.getByText(COPY.requestPendingHint)
    ).toBeVisible();

    // Confirming withdraws the request; the member can re-submit.
    await enrollmentPanel
      .getByRole("button", { name: COPY.withdrawRequest })
      .click();
    await page
      .getByRole("dialog", { name: COPY.withdrawConfirmTitle })
      .getByRole("button", {
        name: new RegExp(`^${COPY.withdrawConfirmAccept}$`, "u"),
      })
      .click();
    await expect(
      enrollmentPanel.getByText(COPY.requestWithdrawnNotice)
    ).toBeVisible();
    await expect(
      enrollmentPanel.getByRole("button", { name: COPY.reEnroll })
    ).toBeVisible();
  });

  test("member exits an approved enrollment through the confirm dialog and re-enrolls", async ({
    page,
    browser,
  }) => {
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    let programId = "";
    let adminReady = false;
    try {
      await loginAs(
        memberPage,
        required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
        required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
      );
      [programId] = await catalogProgramIds(memberPage, "E2E_DEMO_成人查經");
      expect(programId).toBeTruthy();
      await memberPage.goto(`/programs?program=${programId}#overview`);
      const enrollmentPanel = enrollmentPanelOf(memberPage);

      // Reach Pending regardless of the member's residual history from a
      // previous project run (報名 or 重新報名; an already-pending request
      // from an interrupted run also satisfies the precondition). Wait for
      // the panel to settle first so the branch below is not racing the
      // detail load.
      const pendingHint = enrollmentPanel.getByText(COPY.requestPendingHint);
      const submitButton = submitActionButton(enrollmentPanel);
      await expect(submitButton.or(pendingHint)).toBeVisible();
      if (await pendingHint.isVisible().catch(() => false)) {
        // Pending request already exists.
      } else {
        await submitButton.click();
        await expect(pendingHint).toBeVisible();
      }

      await loginAs(
        page,
        required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
        required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
      );
      adminReady = true;
      await page.goto(
        `/programs?mode=management&program=${encodeURIComponent(programId)}&task=participants`
      );
      const requestRow = page
        .getByRole("listitem")
        .filter({ hasText: "E2E Member" });
      await expect(
        requestRow.getByRole("button", { name: COPY.approve })
      ).toBeVisible();
      await requestRow.getByRole("button", { name: COPY.approve }).click();
      await expect(
        page
          .getByRole("region", { name: COPY.workspaceTaskParticipants })
          .getByText(COPY.decisionMade, { exact: true })
      ).toBeVisible();

      // The approved enrollment shows as Active for the member.
      await memberPage.reload();
      await expect(
        enrollmentPanel.getByText(COPY.enrollmentActiveHint)
      ).toBeVisible();

      // Dismissing the exit dialog keeps the enrollment active.
      await enrollmentPanel
        .getByRole("button", { name: COPY.cancelEnrollment })
        .click();
      const exitDialog = memberPage.getByRole("dialog", {
        name: COPY.cancelConfirmTitle,
      });
      await expect(exitDialog).toBeVisible();
      await expect(exitDialog.getByText(COPY.cancelConfirmBody)).toBeVisible();
      await exitDialog
        .getByRole("button", {
          name: new RegExp(`^${COPY.cancelRevoke}$`, "u"),
        })
        .click();
      await expect(
        memberPage.getByRole("dialog", { name: COPY.cancelConfirmTitle })
      ).toHaveCount(0);
      await expect(
        enrollmentPanel.getByText(COPY.enrollmentActiveHint)
      ).toBeVisible();

      // Confirming exits the course; 重新報名 becomes available again.
      await enrollmentPanel
        .getByRole("button", { name: COPY.cancelEnrollment })
        .click();
      await memberPage
        .getByRole("dialog", { name: COPY.cancelConfirmTitle })
        .getByRole("button", {
          name: new RegExp(`^${COPY.cancelConfirmAccept}$`, "u"),
        })
        .click();
      await expect(
        enrollmentPanel.getByText(COPY.enrollmentCancelledNotice)
      ).toBeVisible();
      await expect(
        enrollmentPanel.getByRole("button", { name: COPY.reEnroll })
      ).toBeVisible();
    } finally {
      if (programId && adminReady) {
        // Failure-safe cleanup: cancel any Active enrollment and withdraw
        // any Pending request so later queue/roster counts stay stable.
        await page.evaluate(async (id) => {
          const enrollmentsResponse = await fetch(
            `/api/v1/programs/${encodeURIComponent(id)}/enrollments`
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
          const enrollment = enrollmentsBody.data?.enrollments?.find(
            (row) =>
              row.member_user_id === "U-E2E-MEMBER" && row.status === "Active"
          );
          if (enrollment) {
            await fetch(
              `/api/v1/programs/${encodeURIComponent(id)}/enrollments/${encodeURIComponent(enrollment.enrollment_id)}/cancel`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              }
            );
          }
          const requestsResponse = await fetch(
            `/api/v1/programs/${encodeURIComponent(id)}/enrollment-requests`
          );
          const requestsBody = (await requestsResponse.json()) as {
            data?: {
              requests?: {
                request_id: string;
                member_user_id: string;
                status: string;
              }[];
            };
          };
          const request = requestsBody.data?.requests?.find(
            (row) =>
              row.member_user_id === "U-E2E-MEMBER" && row.status === "Pending"
          );
          if (request) {
            await fetch(
              `/api/v1/programs/${encodeURIComponent(id)}/enrollment-requests/${encodeURIComponent(request.request_id)}/withdraw`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              }
            );
          }
        }, programId);
      }
      await memberContext.close();
    }
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
    await expect(page.getByRole("button", { name: COPY.enroll })).toHaveCount(
      0
    );
    await expect(
      page.getByRole("button", { name: COPY.withdrawRequest })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: COPY.cancelEnrollment })
    ).toHaveCount(0);
  });
});
test.describe("MUI-01 management Directory and Workspace", () => {
  test("admin opens the status-first Cockpit and carries meeting/program context", async ({
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
    const search = page.getByRole("searchbox", {
      name: COPY.managementDirectorySearchLabel,
    });
    await search.fill("成人查經");
    await expect(directory.getByRole("button")).toHaveCount(1);
    await directory.getByRole("button", { name: /E2E_DEMO_成人查經/u }).click();
    await expect(page).toHaveURL(
      new RegExp(`/programs\\?mode=management&program=${programId}$`, "u")
    );

    // Status-first header and operational tiles are sourced from real D1 data.
    await expect(
      page.getByRole("heading", { name: "E2E_DEMO_成人查經" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: COPY.cockpitOperations })
    ).toBeVisible();
    await expect(page.getByText(COPY.cockpitWeeklyWork)).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: new RegExp(`${COPY.cockpitEventsTile}.*個聚會`, "u"),
      })
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: new RegExp(`^${COPY.cockpitParticipantsTile}\\s`, "u"),
      })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: COPY.cockpitOthers })
    ).toBeVisible();

    const nextMeeting = page.getByRole("button", {
      name: COPY.cockpitManageRoster,
    });
    await expect(nextMeeting).toBeVisible();
    await nextMeeting.click();
    await expect(page).toHaveURL(
      new RegExp(
        `/programs\\?mode=management&program=${programId}&task=participants&event=[^&]+$`,
        "u"
      )
    );

    // Returning from participant mode keeps the same program context.
    await page.getByRole("tab", { name: COPY.participantMode }).click();
    await expect(page).toHaveURL(
      new RegExp(`/programs\\?program=${programId}`, "u")
    );
    await page.getByRole("button", { name: COPY.enterManagement }).click();
    await expect(page).toHaveURL(
      new RegExp(`/programs\\?mode=management&program=${programId}$`, "u")
    );
    await expect(
      page.getByRole("heading", { name: "E2E_DEMO_成人查經" })
    ).toBeVisible();
  });
  test("admin opens Course Facts, edits course name and purpose, and verifies server persistence", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const [programId] = await catalogProgramIds(page, "E2E_DEMO_成人查經");
    expect(programId).toBeTruthy();
    const id = required("target program", programId);

    await page.goto(`/programs?mode=management&program=${id}`);
    await expect(
      page.getByRole("heading", { name: "E2E_DEMO_成人查經" })
    ).toBeVisible();

    // 1. Select 課程資料 quiet row in Cockpit
    await page
      .getByRole("button", {
        name: new RegExp(
          `${COPY.cockpitCourseFacts}.*${COPY.cockpitCourseFactsHint}`,
          "u"
        ),
      })
      .click();

    // 2. Facts screen renders read-only fields (no textboxes/inputs)
    await expect(
      page.getByRole("heading", { name: COPY.courseFacts })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "E2E_DEMO_成人查經" })
    ).toBeVisible();
    await expect(page.getByText(COPY.factsDepartment)).toBeVisible();
    await expect(page.getByText(COPY.factsDiscoverability)).toBeVisible();
    await expect(page.getByText(COPY.factsEnrollmentMode)).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);

    // 3. Select 編輯課程
    await page.getByRole("button", { name: COPY.editProgram }).click();
    await expect(
      page.getByRole("heading", { name: COPY.editProgram })
    ).toBeVisible();

    // 4. Pre-filled values
    const nameInput = page.getByRole("textbox", { name: COPY.editNameLabel });
    const purposeInput = page.getByRole("textbox", {
      name: COPY.editPurposeLabel,
    });
    await expect(nameInput).toHaveValue("E2E_DEMO_成人查經");

    const originalPurpose = await purposeInput.inputValue();

    try {
      // 5. Test validation: clear name and attempt to save
      await nameInput.fill("");
      await page.getByRole("button", { name: COPY.saveProgram }).click();
      // The validation message also lands in the sr-only announce live
      // region, so scope to the form's role=alert to avoid a strict-mode
      // collision with the duplicated announced text.
      await expect(
        page.getByRole("alert").filter({ hasText: COPY.editRequired })
      ).toBeVisible();

      // 6. Fill updated values and save (re-query inputs after the
      // validation re-render; the original locators may be stale)
      const updatedPurpose = `${originalPurpose} (已更新)`;
      await page
        .getByRole("textbox", { name: COPY.editNameLabel })
        .fill("E2E_DEMO_成人查經");
      await page
        .getByRole("textbox", { name: COPY.editPurposeLabel })
        .fill(updatedPurpose);
      await page.getByRole("button", { name: COPY.saveProgram }).click();

      // 7. Toast / announcement + return to Course Facts with updated purpose
      await expect(
        page.getByRole("heading", { name: COPY.courseFacts })
      ).toBeVisible();
      await expect(page.getByText(updatedPurpose)).toBeVisible();

      // 8. Server persistence: reload and verify
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "E2E_DEMO_成人查經" })
      ).toBeVisible();
      await page
        .getByRole("button", {
          name: new RegExp(
            `${COPY.cockpitCourseFacts}.*${COPY.cockpitCourseFactsHint}`,
            "u"
          ),
        })
        .click();
      await expect(
        page.getByRole("heading", { name: COPY.courseFacts })
      ).toBeVisible();
      await expect(page.getByText(updatedPurpose)).toBeVisible();
    } finally {
      // Cleanup / restore original values
      await page.getByRole("button", { name: COPY.editProgram }).click();
      const editPurpose = page.getByRole("textbox", {
        name: COPY.editPurposeLabel,
      });
      await editPurpose.fill(originalPurpose);
      await page.getByRole("button", { name: COPY.saveProgram }).click();
      await expect(page.getByText(originalPurpose)).toBeVisible();
    }
  });
  test("manager Participants queue shows scoped counts and approves a pending request", async ({
    page,
    browser,
  }) => {
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    let programId = "";
    let adminReady = false;
    try {
      await loginAs(
        memberPage,
        required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
        required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
      );
      [programId] = await catalogProgramIds(memberPage, "E2E_DEMO_成人查經");
      expect(programId).toBeTruthy();
      await memberPage.goto(`/programs?program=${programId}#overview`);
      const enrollmentPanel = enrollmentPanelOf(memberPage);
      await submitActionButton(enrollmentPanel).click();
      await expect(
        enrollmentPanel.getByText(COPY.requestPendingHint)
      ).toBeVisible();

      await loginAs(
        page,
        required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
        required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
      );
      adminReady = true;
      await page.goto(
        `/programs?mode=management&program=${encodeURIComponent(programId)}&task=participants`
      );
      await expect(
        page.getByRole("heading", {
          name: COPY.workspaceTaskParticipants,
          exact: true,
        })
      ).toBeVisible();
      const pendingTab = page.getByRole("tab", {
        name: new RegExp(`${COPY.tabsPending} \\(\\d+\\)`, "u"),
      });
      const activeTab = page.getByRole("tab", {
        name: new RegExp(`${COPY.tabsActive} \\(\\d+\\)`, "u"),
      });
      await expect(pendingTab).toBeVisible();
      await expect(activeTab).toBeVisible();
      await expect(pendingTab).toHaveAttribute("aria-selected", "true");
      await expect(pendingTab).toHaveAttribute(
        "aria-controls",
        "participants-pending-panel"
      );
      await expect(activeTab).toHaveAttribute(
        "aria-controls",
        "participants-active-panel"
      );

      const requestRow = page
        .getByRole("listitem")
        .filter({ hasText: "E2E Member" });
      await expect(
        requestRow.getByRole("button", { name: COPY.approve })
      ).toBeVisible();
      await requestRow.getByRole("button", { name: COPY.approve }).click();
      await expect(
        page
          .getByRole("region", { name: COPY.workspaceTaskParticipants })
          .getByText(COPY.decisionMade, { exact: true })
      ).toBeVisible();
      await expect(activeTab).toContainText("(1)");
      await activeTab.click();
      await expect(
        page.getByRole("list", { name: COPY.workspaceActiveParticipants })
      ).toContainText("E2E Member");

      // ENR-01 reject path: a second member submits, the manager rejects
      // with a note, and the rejected request leaves no Active enrollment.
      const secondUsername = `E2E_reject_${Date.now()}`;
      const secondPassword = "E2E_reject_pw!1";
      const secondContext = await browser.newContext();
      const secondPage = await secondContext.newPage();
      let secondReady = false;
      try {
        const registered = await page.evaluate(
          async ({ username, password }) => {
            const response = await fetch("/api/v1/auth/register", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": `e2e-register-${Date.now()}`,
              },
              body: JSON.stringify({
                username,
                password,
                name: "E2E Reject Member",
                phone: "555-0100",
              }),
            });
            return { ok: response.ok, status: response.status };
          },
          { username: secondUsername, password: secondPassword }
        );
        expect(registered.ok, "second member registration must submit").toBe(
          true
        );
        const approved = await page.evaluate(
          async ({ username }) => {
            const listResponse = await fetch("/api/v1/auth/registrations");
            const body = (await listResponse.json()) as {
              data?: {
                registrations?: { requestId: string; username: string }[];
              };
            };
            const pending = body.data?.registrations?.find(
              (row) => row.username === username
            );
            if (!pending) {
              return { ok: false, status: 404 };
            }
            const response = await fetch(
              `/api/v1/auth/registrations/${encodeURIComponent(pending.requestId)}/approve`,
              {
                method: "POST",
                headers: { "Idempotency-Key": `e2e-approve-${Date.now()}` },
              }
            );
            return { ok: response.ok, status: response.status };
          },
          { username: secondUsername }
        );
        expect(approved.ok, "admin must approve the second member").toBe(true);

        await loginAs(secondPage, secondUsername, secondPassword);
        secondReady = true;
        await secondPage.goto(`/programs?program=${programId}#overview`);
        const secondPanel = enrollmentPanelOf(secondPage);
        await secondPanel.getByRole("button", { name: COPY.enroll }).click();
        await expect(
          secondPanel.getByText(COPY.requestPendingHint)
        ).toBeVisible();

        await page
          .getByRole("button", { name: COPY.workspaceParticipantsRefresh })
          .click();
        await page
          .getByRole("tab", {
            name: new RegExp(`${COPY.tabsPending} \\(\\d+\\)`, "u"),
          })
          .click();
        const secondRow = page
          .getByRole("listitem")
          .filter({ hasText: "E2E Reject Member" });
        await expect(secondRow).toBeVisible();
        await secondRow.getByLabel(COPY.decisionNote).fill("時間不合");
        await secondRow.getByRole("button", { name: COPY.reject }).click();
        await expect(
          page
            .getByRole("region", { name: COPY.workspaceTaskParticipants })
            .getByText(COPY.decisionMade, { exact: true })
        ).toBeVisible();
        await expect(
          page.getByText(COPY.workspaceParticipantsPendingEmpty)
        ).toBeVisible();
        await expect(
          page.getByRole("listitem").filter({ hasText: "E2E Reject Member" })
        ).toHaveCount(0);
        const secondEnrollments = await secondPage.evaluate(async (id) => {
          const response = await fetch(
            `/api/v1/programs/${encodeURIComponent(id)}/enrollment-snapshot`
          );
          const body = (await response.json()) as {
            data?: { enrollments?: { status: string }[] };
          };
          return body.data?.enrollments ?? [];
        }, programId);
        expect(
          secondEnrollments.some((row) => row.status === "Active"),
          "rejected request must not create an Active enrollment"
        ).toBe(false);
        const historyTab = page.getByRole("tab", {
          name: new RegExp(`${COPY.tabsHistory} \\(\\d+\\)`, "u"),
        });
        await historyTab.click();
        await expect(
          page
            .getByRole("list", { name: COPY.enrollmentHistory })
            .filter({ hasText: "E2E Reject Member" })
        ).toContainText("時間不合");
      } finally {
        if (secondReady) {
          await secondPage.evaluate(async (id) => {
            const response = await fetch(
              `/api/v1/programs/${encodeURIComponent(id)}/enrollment-requests`
            );
            const body = (await response.json()) as {
              data?: {
                requests?: {
                  request_id: string;
                  status: string;
                }[];
              };
            };
            const pending = (body.data?.requests ?? []).find(
              (row) => row.status === "Pending"
            );
            if (pending) {
              await fetch(
                `/api/v1/programs/${encodeURIComponent(id)}/enrollment-requests/${encodeURIComponent(pending.request_id)}/withdraw`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: "{}",
                }
              );
            }
          }, programId);
          await secondContext.close();
        }
      }
    } finally {
      if (programId && adminReady) {
        await page.evaluate(async (id) => {
          const response = await fetch(
            `/api/v1/programs/${encodeURIComponent(id)}/enrollments`
          );
          const body = (await response.json()) as {
            data?: {
              enrollments?: {
                enrollment_id: string;
                member_user_id: string;
                status: string;
              }[];
            };
          };
          const enrollment = body.data?.enrollments?.find(
            (row) =>
              row.member_user_id === "U-E2E-MEMBER" && row.status === "Active"
          );
          if (enrollment) {
            await fetch(
              `/api/v1/programs/${encodeURIComponent(id)}/enrollments/${encodeURIComponent(enrollment.enrollment_id)}/cancel`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              }
            );
          }
        }, programId);
        await memberPage.evaluate(async (id) => {
          const response = await fetch(
            `/api/v1/programs/${encodeURIComponent(id)}/enrollment-requests`
          );
          const body = (await response.json()) as {
            data?: {
              requests?: {
                request_id: string;
                member_user_id: string;
                status: string;
              }[];
            };
          };
          const request = body.data?.requests?.find(
            (row) =>
              row.member_user_id === "U-E2E-MEMBER" && row.status === "Pending"
          );
          if (request) {
            await fetch(
              `/api/v1/programs/${encodeURIComponent(id)}/enrollment-requests/${encodeURIComponent(request.request_id)}/withdraw`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              }
            );
          }
        }, programId);
      }
      await memberContext.close();
    }
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
    // Capture the row's program name before navigating (the directory
    // unmounts once the Cockpit opens).
    const firstProgramName = required(
      "first program name",
      (await firstProgram.textContent())?.split("\n")[0]?.trim()
    );
    await firstProgram.focus();
    await firstProgram.press("Enter");
    // The status-first Cockpit leads with the program-name heading (no
    // tabbed workspace header); the 聚會 operational tile is the events
    // entry point.
    await expect(
      page.getByRole("heading", { name: firstProgramName })
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: new RegExp(`^${COPY.cockpitEventsTile}\\s`, "u"),
      })
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
    await page.goto(
      `/programs?mode=management&program=${programId}&task=participants`
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
    await expect(page.getByRole("button", { name: COPY.addRule })).toHaveCount(
      0
    );
  });

  test("renders unavailable copy for Schedule and Attendance when their modules are disabled", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const [gateProgramId] = await catalogProgramIds(page, "E2E_模組停用課程");
    const id = required("module-gate program id", gateProgramId);

    await page.goto(`/programs?mode=management&program=${id}&task=settings`);
    await expect(
      page.getByText(COPY.settingsScheduleUnavailable)
    ).toBeVisible();
    await expect(page.getByRole("button", { name: COPY.addRule })).toHaveCount(
      0
    );
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
      await page.goto(`/programs?mode=management&program=${id}&task=settings`);
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
      expect(status, "safety-net restore of discoverability must succeed").toBe(
        200
      );
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

    await page.goto(`/programs?mode=management&program=${id}&task=settings`);
    const leadersPanel = page.getByRole("region", {
      name: COPY.programLeaders,
    });
    await expect(leadersPanel).toBeVisible();
    // Wait for the async leader-list load to settle before interacting,
    // so a throttled (phone) profile doesn't race the initial fetch.
    await expect(leadersPanel.getByText(/E2E Member/).first()).toBeVisible();

    const combo = leadersPanel.getByRole("combobox", {
      name: COPY.leaderUserId,
    });

    try {
      // Self-assignment denial: pick self, submit, server-side 403.
      // The baseline above guarantees E2E_member as leader, so this must
      // not touch that grant.
      await combo.click();
      await combo.fill("E2E_staff");
      await leadersPanel.getByRole("option", { name: /E2E Staff/ }).click();
      await leadersPanel
        .getByRole("button", { name: COPY.assignLeader })
        .click();
      await expect(
        leadersPanel.getByText(COPY.selfDelegationForbidden, { exact: true })
      ).toBeVisible();

      // Revoke: a real state transition, not a duplicate-grant no-op.
      // The self-denial error above does not reload the list (runAction
      // only reloads on success), so E2E Member is still here.
      await expect(leadersPanel.getByText(/E2E Member/).first()).toBeVisible();
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
        leadersPanel
          .getByText(COPY.leaderRevokedNotice, { exact: true })
          .first()
      ).toBeVisible();

      // Re-grant: exercise the real grant path and its notice.
      await combo.click();
      await combo.fill("E2E_member");
      await leadersPanel.getByRole("option", { name: /E2E Member/ }).click();
      await leadersPanel
        .getByRole("button", { name: COPY.assignLeader })
        .click();
      await expect(
        leadersPanel
          .getByText(COPY.leaderAssignedNotice, { exact: true })
          .first()
      ).toBeVisible();
      await expect(leadersPanel.getByText(/E2E Member/).first()).toBeVisible();
    } finally {
      // Failure-safe restoration: guarantee E2E_member ends the test as
      // leader regardless of where an assertion above failed.
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
    const deptId = required(
      "E2E_DEMO_MINISTRY department id",
      departmentId ?? undefined
    );

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
      await managersPanel.getByRole("option", { name: /E2E Member/ }).click();
      await managersPanel
        .getByRole("button", { name: COPY.assignDepartmentManager })
        .click();
      await expect(
        deptPanel
          .getByText(COPY.departmentManagerAssignedNotice, { exact: true })
          .first()
      ).toBeVisible();
      await expect(managersPanel.getByText(/E2E Member/).first()).toBeVisible();

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

test.describe("086-06 Departments directory and detail", () => {
  test("directory displays only the actor's authorized department projection", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    await page.goto("/programs?mode=management");
    const scopedDepartments = await page.evaluate(async () => {
      const response = await fetch("/api/v1/programs/management-directory");
      const body = (await response.json()) as {
        data?: { departments?: { department_id: string }[] };
      };
      return {
        status: response.status,
        count: body.data?.departments?.length ?? 0,
      };
    });
    expect(scopedDepartments.status).toBe(200);
    await expect(
      page.getByRole("heading", { name: COPY.managementDirectoryTitle })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /部門設定/u })).toHaveCount(
      scopedDepartments.count
    );
  });

  test("department detail exposes five independently toggleable modules", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    await page.goto("/programs?mode=management");
    await page
      .getByRole("button", { name: /E2E_DEMO_示範事工.*部門設定/u })
      .click();
    const departmentPanel = page.getByRole("region", {
      name: /部門設定.*E2E_DEMO_示範事工/u,
    });
    const modulesPanel = departmentPanel.getByRole("region", {
      name: COPY.modules,
    });
    const moduleLabels = [
      ["program_catalog", COPY.moduleProgramCatalog],
      ["enrollment", COPY.moduleEnrollment],
      ["events", COPY.moduleEvents],
      ["attendance", COPY.moduleAttendance],
      ["custom_forms", COPY.moduleCustomForms],
    ] as const;
    for (const [moduleKey, label] of moduleLabels) {
      const row = modulesPanel.locator("li").filter({ hasText: label });
      await expect(row).toHaveCount(1);
      const button = row.getByRole("button", { name: /^(啟用|停用)$/u });
      await expect(button).toBeVisible();
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/modules/${moduleKey}/`) &&
          response.request().method() === "POST" &&
          response.status() === 200
      );
      await button.click();
      await responsePromise;
      await expect(
        departmentPanel.getByText(COPY.updated, { exact: true })
      ).toBeVisible();
      const restoreButton = modulesPanel
        .locator("li")
        .filter({ hasText: label })
        .getByRole("button", { name: /^(啟用|停用)$/u });
      const restoreResponse = page.waitForResponse(
        (response) =>
          response.url().includes(`/modules/${moduleKey}/`) &&
          response.request().method() === "POST" &&
          response.status() === 200
      );
      await restoreButton.click();
      await restoreResponse;
    }
  });

  test("offline department save stays inline and reports the save error", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    await page.goto("/programs?mode=management");
    await page
      .getByRole("button", { name: /E2E_DEMO_示範事工.*部門設定/u })
      .click();
    const departmentPanel = page.getByRole("region", {
      name: /部門設定.*E2E_DEMO_示範事工/u,
    });
    const originalUrl = page.url();
    await departmentPanel
      .getByRole("textbox", { name: "部門名稱" })
      .fill("離線不應儲存");
    await page.context().setOffline(true);
    try {
      await departmentPanel.getByRole("button", { name: "儲存部門" }).click();
      await expect(departmentPanel.getByRole("alert")).toHaveText(
        COPY.offlineError
      );
      await expect(page).toHaveURL(originalUrl);
    } finally {
      await page.context().setOffline(false);
    }
  });

  test("creates a program from department detail and lands in its cockpit", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    await page.goto("/programs?mode=management");
    await page
      .getByRole("button", { name: /E2E_DEMO_示範事工.*部門設定/u })
      .click();
    const departmentPanel = page.getByRole("region", {
      name: /部門設定.*E2E_DEMO_示範事工/u,
    });
    await departmentPanel
      .getByRole("button", { name: COPY.createProgram })
      .click();
    await expect(
      departmentPanel.getByRole("heading", { name: COPY.createProgram })
    ).toBeVisible();
    const name = `E2E_08606_${Date.now()}`;
    await departmentPanel
      .getByRole("textbox", { name: COPY.programName })
      .fill(name);
    await departmentPanel
      .getByRole("textbox", { name: COPY.programPurpose })
      .fill("086-06 acceptance purpose");
    await departmentPanel
      .getByRole("button", { name: COPY.saveProgram })
      .click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByText(COPY.programCreatedNotice)).toBeVisible();
    await expect(page).toHaveURL(/program=[^&]+/u);
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
    // Post-086-06 the create entry lives in the department settings panel
    // (the management directory no longer carries a top-level create).
    await page
      .getByRole("button", { name: /E2E_DEMO_示範事工.*部門設定/u })
      .click();
    const departmentPanel = page.getByRole("region", {
      name: /部門設定.*E2E_DEMO_示範事工/u,
    });
    await departmentPanel
      .getByRole("button", { name: COPY.createProgram })
      .click();
    await expect(
      departmentPanel.getByRole("heading", { name: COPY.createProgram })
    ).toBeVisible();

    const originalName = `E2E_MUI250_${Date.now()}`;
    await page
      .getByRole("textbox", { name: COPY.programName })
      .fill(originalName);
    // The create contract (086-06) requires a non-empty purpose.
    await page
      .getByRole("textbox", { name: COPY.programPurpose })
      .fill("MUI-02 建立測試課程目的");
    await page
      .getByRole("textbox", { name: COPY.programPurpose })
      .fill("E2E 測試課程簡介");
    await page
      .getByRole("textbox", { name: COPY.programCategory })
      .fill("E2E 活動類別");
    await page
      .getByLabel(COPY.behaviorType)
      .selectOption("OneOff");
    await page
      .getByLabel(COPY.lifecycle)
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
    await page
      .getByRole("textbox", { name: COPY.editPurposeLabel })
      .fill("MUI-02 測試簡介 (已更新)");
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
  test("MemberRequest managers can open Participants and use assisted enrollment", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const [programId] = await catalogProgramIds(page, "E2E_DEMO_成人查經");
    const id = required("MemberRequest fixture program id", programId);
    const programMode = await page.evaluate(async (targetId) => {
      const response = await fetch(`/api/v1/programs/${targetId}/management`);
      const body = (await response.json()) as {
        data?: { program?: { enrollment_mode?: string } };
      };
      return body.data?.program?.enrollment_mode;
    }, id);
    expect(programMode).toBe("MemberRequest");

    await page.goto(
      `/programs?mode=management&program=${encodeURIComponent(id)}&task=participants`
    );
    await expect(
      page.getByRole("heading", {
        name: COPY.workspaceTaskParticipants,
        exact: true,
      })
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: /待審批 \(\d+\)/u })
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: /使用中 \(\d+\)/u })
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: /歷史 \(\d+\)/u })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: COPY.assistedEnroll })
    ).toBeVisible();
    await expect(page.getByText(COPY.assistedEnrollAck)).toBeVisible();
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
  async function openEventsTask(page: Page, programId: string): Promise<void> {
    await page.goto(
      `/programs?mode=management&program=${encodeURIComponent(programId)}&task=events`
    );
    await expect(
      page.getByRole("heading", {
        name: COPY.workspaceTaskEvents,
        exact: true,
      })
    ).toBeVisible();
  }
  async function createManualEvent(
    page: Page,
    programId: string,
    name: string,
    minuteOffsetMinutes: number,
    dateOffsetDays = 0
  ): Promise<string> {
    await openEventsTask(page, programId);
    await page
      .getByRole("button", { name: COPY.createMeeting })
      .first()
      .click();
    const createForm = page.getByRole("form", { name: COPY.createMeeting });
    // The primary form must reject an empty submission before any D1 write.
    await createForm.getByRole("button", { name: COPY.createMeeting }).click();
    await expect(
      createForm.getByText(COPY.createMeetingValidation, { exact: true })
    ).toBeVisible();
    const startsAt = eventStart(dateOffsetDays, minuteOffsetMinutes);
    const [date, time] = startsAt.split("T");
    await createForm.getByLabel(COPY.eventDate).fill(date);
    await createForm.getByLabel(COPY.eventTime).fill(time);
    await createForm.getByLabel(COPY.eventName).fill(name);
    await createForm
      .getByLabel(COPY.eventType)
      .selectOption(COPY.eventTypeTraining);
    await createForm
      .getByLabel(COPY.recurrenceTag)
      .selectOption(COPY.recurrenceNone);
    await createForm.getByRole("button", { name: COPY.createMeeting }).click();
    await expect(page).toHaveURL(
      new RegExp(
        `/programs\\?mode=management&program=${programId}&task=events&event=[A-Za-z0-9-]+$`,
        "u"
      )
    );
    const match = page.url().match(/[?&]event=([A-Za-z0-9-]+)$/u);
    expect(
      match?.[1],
      "create must navigate to the new event detail"
    ).toBeTruthy();
    await expect(page.getByRole("heading", { name })).toBeVisible();
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
    const endsAt = eventEndMinutesLater(startsAt, 60);
    await expect(
      page.getByRole("region", { name: COPY.eventDetailTitle })
    ).toBeVisible();
    await expect(
      page.getByText(`${hkWallLabel(startsAt)} — ${hkWallLabel(endsAt)}`)
    ).toBeVisible();
    await expect(
      page.getByText(COPY.eventManualSource, { exact: true }).first()
    ).toBeVisible();
    await expect(
      page.getByText(COPY.eventTypeTraining, { exact: true }).first()
    ).toBeVisible();
    await expect(
      page.getByText(COPY.eventActive, { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText(COPY.eventAvailable, { exact: true })
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
    await expect(page.getByRole("heading", { name: renamed })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: renamed })).toBeVisible();

    await page.getByRole("button", { name: COPY.eventDetailBack }).click();
    await expect(page).toHaveURL(
      new RegExp(
        `/programs\\?mode=management&program=${programId}&task=events$`,
        "u"
      )
    );
    await expect(
      page.getByRole("heading", {
        name: COPY.workspaceTaskEvents,
        exact: true,
      })
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
      90,
      -121
    );

    const eventDetail = page.getByRole("region", {
      name: COPY.eventDetailTitle,
    });

    await page
      .getByRole("button", { name: COPY.eventAvailabilityDeactivate })
      .click();
    await expect(
      eventDetail.getByText(COPY.eventAvailabilityNotice, { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: COPY.eventAvailabilityConfirmProceed })
    ).toHaveCount(0);
    const undo = page.getByRole("button", { name: COPY.eventAvailabilityUndo });
    await expect(undo).toBeVisible();
    await undo.click();
    await expect(
      eventDetail
        .getByText(COPY.eventAvailabilityRestoredNotice, { exact: true })
        .first()
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

    const eventId = await createManualEvent(
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
      expect(await apiJsonStatus(memberPage, "/api/v1/programs/access")).toBe(
        200
      );
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
      page
        .getByRole("region", { name: COPY.eventDetailTitle })
        .getByText(COPY.eventAvailabilityNotice, { exact: true })
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
    expect(
      await apiJsonStatus(
        page,
        `/api/v1/programs/${encodeURIComponent(programId)}/events/${encodeURIComponent(eventId)}`,
        "PATCH",
        { availability: "Active" }
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
            check_in_window_opens_at: new Date(now - 15 * 60_000).toISOString(),
            check_in_window_closes_at: new Date(
              now + 45 * 60_000
            ).toISOString(),
          }),
        }
      );
      const body = (await res.json()) as {
        data?: { event?: { event_id?: string } };
      };
      return {
        status: res.status,
        eventId: body.data?.event?.event_id ?? null,
      };
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
        page
          .getByRole("region", { name: COPY.eventDetailTitle })
          .getByText(COPY.eventAvailabilityNotice, { exact: true })
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
      expect(restoreStatus, "restoring the event to Active must succeed").toBe(
        200
      );
    }
  });
});

test.describe("NTF-01 management attention", () => {
  test.describe.configure({ mode: "serial" });

  async function createAttentionEvent(
    page: Page,
    programId: string,
    name: string,
    offsetDays: number
  ): Promise<string> {
    const startsAt = new Date(
      Date.now() + offsetDays * 86_400_000
    ).toISOString();
    const response = await page.evaluate(
      async ({ programId: id, name: eventName, startsAt: start }) => {
        const result = await fetch(
          `/api/v1/programs/${encodeURIComponent(id)}/events`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: eventName,
              location: "NTF-01 測試場地",
              starts_at: start,
              ends_at: new Date(
                new Date(start).getTime() + 90 * 60_000
              ).toISOString(),
              check_in_window_opens_at: new Date(
                new Date(start).getTime() - 30 * 60_000
              ).toISOString(),
              check_in_window_closes_at: new Date(
                new Date(start).getTime() + 120 * 60_000
              ).toISOString(),
            }),
          }
        );
        const body = (await result.json()) as {
          data?: { event?: { event_id?: string } };
        };
        return { status: result.status, eventId: body.data?.event?.event_id };
      },
      { programId, name, startsAt }
    );
    expect(response.status, "attention event creation must succeed").toBe(201);
    expect(response.eventId, "attention event must return an id").toBeTruthy();
    return response.eventId ?? "";
  }

  async function patchAttentionEvent(
    page: Page,
    programId: string,
    eventId: string,
    body: Record<string, string>
  ): Promise<number> {
    return await page.evaluate(
      async ({ programId: id, eventId: itemId, patch }) => {
        const response = await fetch(
          `/api/v1/programs/${encodeURIComponent(id)}/events/${encodeURIComponent(itemId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          }
        );
        return response.status;
      },
      { programId, eventId, patch: body }
    );
  }

  test("zero state is explicit and management attention stays scoped", async ({
    page,
    browser,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    await page.goto("/programs?mode=management");

    const control = page.getByRole("region", { name: COPY.notificationRegion });
    await expect(control).toBeVisible();
    const trigger = control.getByRole("button", {
      name: COPY.notificationBell,
    });
    await expect(trigger.locator('[class*="badge"]')).toHaveCount(0);
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: COPY.notificationTitle });
    await expect(dialog).toBeVisible();
    const dialogBox = await dialog.boundingBox();
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(dialogBox).not.toBeNull();
    expect((dialogBox?.x ?? 0) + (dialogBox?.width ?? 0)).toBeLessThanOrEqual(
      viewportWidth
    );
    await expect(dialog.getByRole("status")).toHaveText(COPY.notificationZero);

    const memberContext = await browser.newContext();
    try {
      const memberPage = await memberContext.newPage();
      await loginAs(
        memberPage,
        required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
        required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
      );
      await memberPage.goto("/programs?mode=management");
      await expect(
        memberPage.getByText(COPY.noManagementScope, { exact: true })
      ).toBeVisible();
      await expect(
        memberPage.getByRole("region", { name: COPY.notificationRegion })
      ).toHaveCount(0);
    } finally {
      await memberContext.close();
    }
  });

  test("lists bounded real sources, exact task links, workspace counts, and refreshes after decisions", async ({
    page,
    browser,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );

    const departmentId = required(
      "E2E_DEMO_MINISTRY department id",
      await page.evaluate(async () => {
        const response = await fetch("/api/v1/programs/departments");
        const body = (await response.json()) as {
          data?: { departments?: { department_id: string; code: string }[] };
        };
        return body.data?.departments?.find(
          ({ code }) => code === "E2E_DEMO_MINISTRY"
        )?.department_id;
      })
    );
    const programName = `E2E_NTF256_${Date.now()}`;
    const program = await page.evaluate(
      async ({ departmentId: id, name }) => {
        const response = await fetch(
          `/api/v1/programs/departments/${encodeURIComponent(id)}/programs`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              description: "NTF-01 測試課程",
              category: "NTF-01",
              behavior_type: "OneOff",
              lifecycle: "Active",
              discoverability: "Listed",
              enrollment_mode: "MemberRequest",
            }),
          }
        );
        const body = (await response.json()) as {
          data?: { program?: { program_id?: string } };
        };
        return { status: response.status, id: body.data?.program?.program_id };
      },
      { departmentId, name: programName }
    );
    expect(program.status, "attention fixture Program creation").toBe(201);
    const programId = required("attention fixture program id", program.id);
    let pendingRequestId = "";
    let pendingResolved = false;
    let inactiveEventId = "";
    let cancelledEventId = "";
    let memberLeaderAssigned = false;
    try {
      const memberContext = await browser.newContext();
      try {
        const memberPage = await memberContext.newPage();
        await loginAs(
          memberPage,
          required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
          required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
        );
        const request = await memberPage.evaluate(
          async (requestPath) => {
            const response = await fetch(requestPath, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            });
            const body = (await response.json()) as {
              data?: { request?: { request_id?: string } };
            };
            return {
              status: response.status,
              requestId: body.data?.request?.request_id ?? "",
            };
          },
          `/api/v1/programs/${encodeURIComponent(programId)}/enrollment-requests`
        );
        pendingRequestId = request.requestId;
        expect([200, 201]).toContain(request.status);
      } finally {
        await memberContext.close();
      }
      const memberLeaderStatus = await postProgramLeader(
        page,
        programId,
        DEV_MEMBER.userId,
        "assign"
      );
      expect(memberLeaderStatus).toBe(200);
      memberLeaderAssigned = true;

      inactiveEventId = await createAttentionEvent(
        page,
        programId,
        `E2E_NTF256_暫停_${Date.now()}`,
        5
      );
      expect(
        await patchAttentionEvent(page, programId, inactiveEventId, {
          availability: "Inactive",
        })
      ).toBe(200);

      cancelledEventId = await createAttentionEvent(
        page,
        programId,
        `E2E_NTF256_取消_${Date.now()}`,
        6
      );
      expect(
        await patchAttentionEvent(page, programId, cancelledEventId, {
          reason: "NTF-01 測試取消",
        })
      ).toBe(200);

      const aggregateBeforeUi = await page.evaluate(async () => {
        const response = await fetch("/api/v1/programs/notifications?limit=20");
        const body = (await response.json()) as {
          data?: { unread_count?: number };
        };
        return body.data?.unread_count ?? 0;
      });
      await page.goto("/programs?mode=management");
      const control = page.getByRole("region", {
        name: COPY.notificationRegion,
      });
      const trigger = control.getByRole("button", {
        name: COPY.notificationBell,
      });
      await expect(trigger.locator('[class*="badge"]')).toHaveText(
        String(aggregateBeforeUi)
      );
      const markedReadPromise = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().endsWith("/api/v1/programs/notifications/read")
      );
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: COPY.notificationTitle });
      await expect(dialog).toBeVisible();

      const pendingHref = `/programs?mode=management&program=${programId}&task=participants`;
      const inactiveHref = `/programs?mode=management&program=${programId}&task=events&event=${inactiveEventId}`;
      const cancelledHref = `/programs?mode=management&program=${programId}&task=events&event=${cancelledEventId}`;
      await expect(dialog.locator(`a[href="${pendingHref}"]`)).toBeVisible();
      await expect(dialog.locator(`a[href="${inactiveHref}"]`)).toBeVisible();
      await expect(dialog.locator(`a[href="${cancelledHref}"]`)).toBeVisible();
      await expect(dialog.getByRole("link")).toHaveCount(3);

      const markedRead = await markedReadPromise;
      expect(markedRead.ok()).toBeTruthy();
      expect(
        await page.evaluate(async (eventId) => {
          const response = await fetch(
            "/api/v1/programs/notifications?limit=20"
          );
          const body = (await response.json()) as {
            data?: {
              items?: { kind: string; event_id?: string; read: boolean }[];
            };
          };
          return body.data?.items?.find(
            (item) => item.kind === "event" && item.event_id === eventId
          )?.read;
        }, inactiveEventId)
      ).toBe(true);

      expect(
        await patchAttentionEvent(page, programId, inactiveEventId, {
          name: `E2E_NTF256_修訂_${Date.now()}`,
        })
      ).toBe(200);
      expect(
        await page.evaluate(async (eventId) => {
          const response = await fetch(
            "/api/v1/programs/notifications?limit=20"
          );
          const body = (await response.json()) as {
            data?: {
              items?: { kind: string; event_id?: string; read: boolean }[];
            };
          };
          return body.data?.items?.find(
            (item) => item.kind === "event" && item.event_id === eventId
          )?.read;
        }, inactiveEventId)
      ).toBe(false);

      await page.goto(pendingHref);
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

      await page.goto(inactiveHref);
      const eventDetail = page.getByRole("region", {
        name: COPY.eventDetailTitle,
      });
      await expect(eventDetail).toBeVisible();
      await expect(
        eventDetail.getByRole("button", {
          name: COPY.eventAvailabilityActivate,
        })
      ).toBeVisible();

      await page.goto(
        `/programs?mode=management&program=${programId}&task=events`
      );
      const eventsTask = page.getByRole("region", {
        name: COPY.workspaceTaskEvents,
      });
      await expect(
        eventsTask.getByLabel(COPY.attentionEventCount.replace("{count}", "1"))
      ).toHaveText("1");
      await expect(
        eventsTask.getByLabel(
          COPY.attentionCancelledCount.replace("{count}", "1")
        )
      ).toHaveText("1");

      await page.goto("/programs?mode=management");
      await expect(control).toBeVisible();
      await trigger.click();
      await expect(dialog.locator(`a[href="${pendingHref}"]`)).toBeVisible();

      const pending = await page.evaluate(
        async (requestPath) => {
          const response = await fetch(requestPath);
          const body = (await response.json()) as {
            data?: { requests?: { request_id: string; status: string }[] };
          };
          return body.data?.requests?.find(
            (request) => request.status === "Pending"
          );
        },
        `/api/v1/programs/${encodeURIComponent(programId)}/enrollment-requests`
      );
      expect(
        pending?.request_id,
        "pending source must have an identity"
      ).toBeTruthy();
      pendingRequestId = pending?.request_id ?? pendingRequestId;
      const decisionStatus = await page.evaluate(
        async ({ programId: id, requestId }) => {
          const response = await fetch(
            `/api/v1/programs/${encodeURIComponent(id)}/enrollment-requests/${encodeURIComponent(requestId)}/decision`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "Approved" }),
            }
          );
          return response.status;
        },
        { programId, requestId: pending?.request_id ?? "" }
      );
      expect(decisionStatus).toBe(200);
      pendingResolved = decisionStatus === 200;
      await trigger.click();
      await expect(dialog).toHaveCount(0);
      const aggregateAfterApproval = await page.evaluate(async () => {
        const response = await fetch("/api/v1/programs/notifications?limit=20");
        const body = (await response.json()) as {
          data?: { unread_count?: number };
        };
        return body.data?.unread_count ?? 0;
      });
      await trigger.click();
      await expect(dialog.locator(`a[href="${pendingHref}"]`)).toHaveCount(0);
      await expect(trigger.locator('[class*="badge"]')).toHaveCount(
        aggregateAfterApproval > 0 ? 1 : 0
      );
      if (aggregateAfterApproval > 0) {
        await expect(trigger.locator('[class*="badge"]')).toHaveText(
          String(aggregateAfterApproval)
        );
      }

      // NTF-01.2: a deep link captured before its source resolved must
      // re-authorize and re-read current state, never a stale-looking
      // success -- landing on the (now-approved) pending link must show
      // the fresh zero count, not the badge's earlier (1).
      await page.goto(pendingHref);
      await expect(
        participants.getByRole("tab", {
          name: new RegExp(`${COPY.tabsPending} \\(0\\)`, "u"),
        })
      ).toBeVisible();

      await page.goto(inactiveHref);
      await page
        .getByRole("button", { name: COPY.eventAvailabilityActivate })
        .click();
      await expect(
        eventDetail.getByText(COPY.eventAvailabilityRestoredNotice, {
          exact: true,
        })
      ).toBeVisible();
      await page.goto(inactiveHref);
      const refreshedEventDetail = page.getByRole("region", {
        name: COPY.eventDetailTitle,
      });
      await expect(refreshedEventDetail).toBeVisible();
      await expect(
        refreshedEventDetail.getByRole("button", {
          name: COPY.eventAvailabilityActivate,
        })
      ).toHaveCount(0);
      await expect(
        refreshedEventDetail.getByRole("button", {
          name: COPY.eventAvailabilityDeactivate,
        })
      ).toBeVisible();

      expect(
        await postProgramLeader(page, programId, DEV_MEMBER.userId, "revoke")
      ).toBe(200);
      memberLeaderAssigned = false;
      const revokedContext = await browser.newContext();
      try {
        const revokedPage = await revokedContext.newPage();
        await loginAs(
          revokedPage,
          required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
          required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
        );
        await revokedPage.goto(inactiveHref);
        await expect(
          revokedPage.getByRole("heading", {
            name: COPY.noManagementScope,
          })
        ).toBeVisible();
        await expect(revokedPage.getByText(programName)).toHaveCount(0);
      } finally {
        await revokedContext.close();
      }

      await page.goto("/programs?mode=management");
      await trigger.click();
      await expect(dialog.locator(`a[href="${inactiveHref}"]`)).toHaveCount(0);
      await expect(dialog.locator(`a[href="${cancelledHref}"]`)).toBeVisible();
    } finally {
      if (memberLeaderAssigned) {
        await postProgramLeader(
          page,
          programId,
          DEV_MEMBER.userId,
          "revoke"
        ).catch(() => {});
      }
      if (pendingRequestId && !pendingResolved) {
        await page
          .evaluate(
            async ({ programId: id, requestId }) => {
              const response = await fetch(
                `/api/v1/programs/${encodeURIComponent(id)}/enrollment-requests/${encodeURIComponent(requestId)}/decision`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "Rejected" }),
                }
              );
              if (!response.ok) {
                await fetch(
                  `/api/v1/programs/${encodeURIComponent(id)}/enrollment-requests/${encodeURIComponent(requestId)}/withdraw`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: "{}",
                  }
                );
              }
            },
            { programId, requestId: pendingRequestId }
          )
          .catch(() => {});
      }
      if (inactiveEventId) {
        await patchAttentionEvent(page, programId, inactiveEventId, {
          availability: "Active",
        }).catch(() => -1);
      }
      if (cancelledEventId) {
        await patchAttentionEvent(page, programId, cancelledEventId, {
          starts_at: "2000-01-01T00:00:00.000Z",
          ends_at: "2000-01-01T01:30:00.000Z",
          check_in_window_opens_at: "2000-01-01T00:00:00.000Z",
          check_in_window_closes_at: "2000-01-01T02:00:00.000Z",
        }).catch(() => -1);
      }
    }
  });
});
test.describe("EVT-02 recurring preview and generation", () => {
  // EVT-02 (#252): reachable Program Workspace preview/generate controls.
  const previewEvents = "預覽聚會";
  const previewChanged = "時間表已變更，請重新預覽。";
  const previewLead =
    "預覽會依目前時間表產生未來聚會清單，不會寫入任何聚會記錄。";

  async function openEventsTask(page: Page, programId: string): Promise<void> {
    await page.goto(
      `/programs?mode=management&program=${encodeURIComponent(programId)}&task=events`
    );
    await expect(
      page.getByRole("heading", { name: COPY.workspaceTaskEvents, exact: true })
    ).toBeVisible();
  }

  async function eventCount(page: Page, programId: string): Promise<number> {
    const body = await page.evaluate(
      async (requestPath) => {
        const response = await fetch(requestPath);
        return (await response.json()) as { data?: { events?: unknown[] } };
      },
      `/api/v1/programs/${encodeURIComponent(programId)}/events`
    );
    return (body.data?.events ?? []).length;
  }

  async function scheduleRules(
    page: Page,
    programId: string
  ): Promise<{ rule_id: string; start_time: string }[]> {
    const body = await page.evaluate(
      async (requestPath) => {
        const response = await fetch(requestPath);
        return (await response.json()) as { data?: { rules?: unknown[] } };
      },
      `/api/v1/programs/${encodeURIComponent(programId)}/schedule-rules`
    );
    return (body.data?.rules ?? []) as {
      rule_id: string;
      start_time: string;
    }[];
  }

  async function patchRule(
    page: Page,
    programId: string,
    ruleId: string,
    patch: Record<string, unknown>
  ): Promise<number> {
    return page.evaluate(
      async ({ requestPath, body }) => {
        const response = await fetch(requestPath, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return response.status;
      },
      {
        requestPath: `/api/v1/programs/${encodeURIComponent(programId)}/schedule-rules/${encodeURIComponent(ruleId)}`,
        body: patch,
      }
    );
  }

  /**
   * Create a disposable recurring program (with one weekly rule) under the
   * demo department so generation tests are deterministic: no prior plans,
   * runs, or events exist for it, and the deterministic plan identity can
   * never collide with state left by an earlier suite run.
   */
  async function createRecurringProgram(
    page: Page,
    prefix: string
  ): Promise<string> {
    const catalog = await fetchCatalog(page);
    const departmentId = catalog[0]?.department.department_id;
    expect(departmentId).toBeTruthy();
    const name = `${prefix}_${Date.now()}`;
    const created = await page.evaluate(
      async ({ requestPath, body }) => {
        const response = await fetch(requestPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return {
          status: response.status,
          body: (await response.json()) as {
            data?: { program?: { program_id?: string } };
          },
        };
      },
      {
        requestPath: `/api/v1/programs/departments/${encodeURIComponent(departmentId)}/programs`,
        body: {
          name,
          description: "EVT-02 產生測試課程",
          category: "測試類別",
          behavior_type: "Recurring",
          lifecycle: "Draft",
          discoverability: "Unlisted",
          enrollment_mode: "MemberRequest",
          display_order: 0,
        },
      }
    );
    expect(created.status).toBe(201);
    const programId = created.body.data?.program?.program_id;
    expect(programId).toBeTruthy();
    const ruleStatus = await page.evaluate(
      async ({ requestPath, body }) => {
        const response = await fetch(requestPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return response.status;
      },
      {
        requestPath: `/api/v1/programs/${encodeURIComponent(programId ?? "")}/schedule-rules`,
        body: {
          recurrence: "WEEKLY",
          day_of_week: 3,
          start_time: "19:30",
          end_time: "20:45",
        },
      }
    );
    expect(ruleStatus).toBe(201);
    return programId ?? "";
  }

  test("preview materializes exact rows without writing events", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const [programId] = await catalogProgramIds(page, "E2E_DEMO_成人查經");
    const id = required("fixture program id", programId);
    await openEventsTask(page, id);

    const before = await eventCount(page, id);
    await expect(
      page.getByRole("button", { name: previewEvents })
    ).toBeVisible();
    await page.getByRole("button", { name: previewEvents }).click();

    // Server-owned plan identity + exact occurrence rows in the DOM.
    await expect(page.getByText(previewLead)).toBeVisible();
    await expect(page.getByText(/^方案 /u).first()).toBeVisible();
    await expect(
      page.locator("[aria-label='預覽聚會'] > li").first()
    ).toBeVisible();
    // The generate control becomes reachable only with a current plan.
    await expect(
      page.getByRole("button", { name: COPY.generateEvents })
    ).toBeVisible();

    // Non-mutating: the observable event directory is unchanged.
    expect(await eventCount(page, id)).toBe(before);
  });

  test("generation reports deterministic created/skipped counts and refreshes the directory", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const id = await createRecurringProgram(page, "E2E_EVT02_產生");
    await openEventsTask(page, id);
    const before = await eventCount(page, id);
    expect(before).toBe(0);
    await page.getByRole("button", { name: previewEvents }).click();
    await expect(
      page.getByRole("button", { name: COPY.generateEvents })
    ).toBeVisible();
    await page.getByRole("button", { name: COPY.generateEvents }).click();

    await expect(
      page.getByText(/^已產生 \d+ 場聚會，跳過 \d+ 場重複。$/u).first()
    ).toBeVisible();
    await expect.poll(async () => eventCount(page, id)).toBeGreaterThan(before);

    // Deterministic repeat: the same plan generates nothing new.
    await page.getByRole("button", { name: COPY.generateEvents }).click();
    await expect(
      page.getByText(/^已接續上次產生，新增 0 場，跳過 \d+ 場。$/u).first()
    ).toBeVisible();
    expect(await eventCount(page, id)).toBeGreaterThan(before);
  });

  test("a stale plan is rejected before writes and requires a fresh preview", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const id = await createRecurringProgram(page, "E2E_EVT02_過期");
    const rules = await scheduleRules(page, id);
    const rule = rules[0];
    expect(rule).toBeTruthy();

    await openEventsTask(page, id);
    const before = await eventCount(page, id);
    await page.getByRole("button", { name: previewEvents }).click();
    await expect(
      page.getByRole("button", { name: COPY.generateEvents })
    ).toBeVisible();

    // Change a rule after the preview, then generate with the stale plan.
    const patchStatus = await patchRule(page, id, rule.rule_id, {
      start_time: "19:45",
    });
    expect(patchStatus).toBe(200);
    await page.getByRole("button", { name: COPY.generateEvents }).click();

    const staleAlert = page.getByRole("alert").filter({
      hasText: previewChanged,
    });
    await expect(staleAlert).toBeVisible();
    // The stale plan is cleared; the UI requires a new preview.
    await expect(
      page.getByRole("button", { name: COPY.generateEvents })
    ).toHaveCount(0);
    expect(await eventCount(page, id)).toBe(before);
  });

  test("preview/generate controls are unreachable without the manage capability", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );
    const [programId] = await catalogProgramIds(page, "E2E_DEMO_成人查經");
    const id = required("fixture program id", programId);
    // A member without Program Manage cannot enter management mode at all:
    // the capability-shaped boundary renders the no-management-scope state,
    // so no preview/generate control is reachable.
    await page.goto(
      `/programs?mode=management&program=${encodeURIComponent(id)}&task=events`
    );
    await expect(
      page.getByRole("heading", { name: COPY.noManagementScope })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: previewEvents })).toHaveCount(
      0
    );
    await expect(
      page.getByRole("button", { name: COPY.generateEvents })
    ).toHaveCount(0);
  });
});

// 087-01 (#310): Management Hub directory — three fixed groups, capability-
// filtered rows, canonical module URLs, and the spec-084 no-Care regression.
// The hub renders exactly what GET /api/v1/programs/hub projects; the Admin
// fixture is the full projection and Staff is the narrow fixture (role lacks
// home.publish, so the 內容與系統 group — whose only row is 首頁內容 — must be
// omitted entirely, never shown disabled).
test.describe("HUB-01 Management Hub directory", () => {
  test("admin sees the three groups, all six rows, and the course-management card", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    await page.goto("/management");

    await expect(
      page.getByRole("heading", { name: COPY.hubTitle })
    ).toBeVisible();
    await expect(page.getByText(COPY.hubLead, { exact: true })).toBeVisible();

    for (const group of [
      COPY.hubGroupMemberPermissions,
      COPY.hubGroupOperations,
      COPY.hubGroupContentSystem,
    ]) {
      await expect(page.getByRole("heading", { name: group })).toBeVisible();
    }

    // Every row renders both label and description and carries its canonical
    // hub URL (087-02..05 build the destinations behind these links).
    const rowCases: [string, string, string][] = [
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
    for (const [label, hint, href] of rowCases) {
      const row = page.getByRole("link", { name: new RegExp(label, "u") });
      await expect(row).toBeVisible();
      await expect(row).toHaveAttribute("href", href);
      await expect(page.getByText(hint, { exact: true })).toBeVisible();
    }

    // 另一個工作入口 card with the course-management link.
    await expect(
      page.getByText(COPY.hubAnotherEntry, { exact: true })
    ).toBeVisible();
    const courseLink = page.getByRole("link", {
      name: new RegExp(COPY.hubGoCourseManagement, "u"),
    });
    await expect(courseLink).toBeVisible();
    await expect(courseLink).toHaveAttribute(
      "href",
      "/programs?mode=management"
    );
    await expect(
      page.getByText(COPY.hubGoCourseManagementHint, { exact: true })
    ).toBeVisible();

    // Spec 084 regression: no Care row anywhere in the hub.
    await expect(page.getByText(/Care/iu)).toHaveCount(0);
    await expect(page.getByText("關懷", { exact: true })).toHaveCount(0);
  });

  test("staff without home.publish sees granted rows only — 內容與系統 omitted entirely", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_STAFF_USERNAME", STAFF_USER),
      required("PROGRAMS_STAFF_CREDENTIAL", STAFF_CRED)
    );
    await page.goto("/management");

    await expect(
      page.getByRole("heading", { name: COPY.hubTitle })
    ).toBeVisible();

    // Staff grants: approvals/permissions (Admin|Staff), departments
    // (department.manage), attendance (program.manage + enabled module),
    // members (Admin|Staff). Each row still carries its description.
    for (const [label, hint] of [
      [COPY.hubApprovals, COPY.hubApprovalsHint],
      [COPY.hubPermissions, COPY.hubPermissionsHint],
      [COPY.hubDepartments, COPY.hubDepartmentsHint],
      [COPY.hubAttendance, COPY.hubAttendanceHint],
      [COPY.hubMembers, COPY.hubMembersHint],
    ] as const) {
      await expect(
        page.getByRole("link", { name: new RegExp(label, "u") })
      ).toBeVisible();
      await expect(page.getByText(hint, { exact: true })).toBeVisible();
    }

    // Ungranted: home.publish is Admin-only (migration 0010), so 首頁內容 and
    // its whole 內容與系統 group are omitted — never shown disabled.
    await expect(
      page.getByRole("heading", { name: COPY.hubGroupContentSystem })
    ).toHaveCount(0);
    await expect(
      page.getByText(COPY.hubHomeContent, { exact: true })
    ).toHaveCount(0);
    await expect(
      page.getByText(COPY.hubHomeContentHint, { exact: true })
    ).toHaveCount(0);

    // The entry card stays reachable (Staff holds management capability).
    await expect(
      page.getByRole("link", {
        name: new RegExp(COPY.hubGoCourseManagement, "u"),
      })
    ).toBeVisible();

    // Spec 084 regression also holds for the narrow projection.
    await expect(page.getByText(/Care/iu)).toHaveCount(0);
    await expect(page.getByText("關懷", { exact: true })).toHaveCount(0);
  });

  test("attendance hub lists open meetings and opens the selected roster", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const [programId] = await catalogProgramIds(page, "E2E_DEMO_成人查經");
    const id = required("attendance chooser program", programId);
    const meetingName = `E2E_HUB_開放_${Date.now()}`;
    const created = await page.evaluate(
      async ({ programId: targetProgramId, name }) => {
        const now = Date.now();
        const response = await fetch(
          `/api/v1/programs/${encodeURIComponent(targetProgramId)}/events`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
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
        const body = (await response.json()) as {
          data?: { event?: { event_id?: string } };
        };
        return { status: response.status, eventId: body.data?.event?.event_id };
      },
      { programId: id, name: meetingName }
    );
    expect(created.status).toBe(201);
    const eventId = required("attendance chooser event", created.eventId);

    try {
      await page.goto("/management?module=attendance");
      await expect(
        page.getByRole("heading", { name: COPY.attendanceChooserTitle })
      ).toBeVisible();
      await expect(
        page.getByText(COPY.attendanceChooserLead, { exact: true })
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
      await page.evaluate(
        async ({ programId: targetProgramId, eventId: targetEventId }) => {
          await fetch(
            `/api/v1/programs/${encodeURIComponent(targetProgramId)}/events/${encodeURIComponent(targetEventId)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ availability: "Inactive" }),
            }
          );
        },
        { programId: id, eventId }
      );
    }
  });

  test("approvals list opens a routable detail; approve/reject stay atomic and read-only", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const stamp = Date.now();
    const approveUsername = `E2E_HUB_APR_${stamp}`;
    const rejectUsername = `E2E_HUB_REJ_${stamp}`;
    const approveName = `E2E Hub Approve ${stamp}`;
    const rejectName = `E2E Hub Reject ${stamp}`;

    // Two fresh pending registrations through the real register endpoint.
    const created = await page.evaluate(
      async ({ approveUsername, rejectUsername, approveName, rejectName }) => {
        const register = async (username: string, name: string) => {
          const response = await fetch("/api/v1/auth/register", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": `e2e-08702-${username}`,
            },
            body: JSON.stringify({
              username,
              password: `${username}-pw!1`,
              name,
              phone: "555-0199",
            }),
          });
          return response.ok;
        };
        const okApprove = await register(approveUsername, approveName);
        const okReject = await register(rejectUsername, rejectName);
        const listResponse = await fetch("/api/v1/auth/registrations");
        const body = (await listResponse.json()) as {
          data?: { registrations?: { requestId: string; username: string }[] };
        };
        const rows = body.data?.registrations ?? [];
        return {
          okApprove,
          okReject,
          approveId:
            rows.find((row) => row.username === approveUsername)?.requestId ??
            "",
          rejectId:
            rows.find((row) => row.username === rejectUsername)?.requestId ??
            "",
        };
      },
      { approveUsername, rejectUsername, approveName, rejectName }
    );
    expect(created.okApprove, "approve-candidate must register").toBe(true);
    expect(created.okReject, "reject-candidate must register").toBe(true);
    const approveId = required(
      "approve-candidate request id",
      created.approveId
    );
    const rejectId = required("reject-candidate request id", created.rejectId);

    // List: both pending rows render with routable detail links.
    await page.goto("/management?module=approvals");
    await expect(
      page.getByRole("heading", { name: COPY.approvals.approvalsTitle })
    ).toBeVisible();
    await expect(page.getByText(approveName, { exact: true })).toBeVisible();
    await expect(page.getByText(rejectName, { exact: true })).toBeVisible();
    const approveLink = page.getByRole("link", {
      name: new RegExp(`${COPY.approvals.openDetail} ${approveName}`, "u"),
    });
    await expect(approveLink).toHaveAttribute(
      "href",
      `/management?module=approvals&request=${approveId}`
    );

    // Deep-link straight into the detail (URL-addressable) and reload: the
    // URL alone restores the same request within the session.
    await page.goto(`/management?module=approvals&request=${approveId}`);
    await expect(
      page.getByRole("heading", { name: COPY.approvals.approvalDetailTitle })
    ).toBeVisible();
    await expect(page.getByText(approveName, { exact: true })).toBeVisible();
    await expect(
      page.getByText(approveUsername, { exact: true })
    ).toBeVisible();
    await expect(page.getByText("555-0199", { exact: true })).toBeVisible();
    await expect(
      page.getByText(COPY.approvals.statusPending, { exact: true })
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText(COPY.approvals.statusPending, { exact: true })
    ).toBeVisible();

    // 核准 commits atomically: the detail flips to the read-only outcome.
    await page.getByRole("button", { name: COPY.approvals.approve }).click();
    await expect(
      page.getByText(COPY.approvals.statusApproved, { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText(COPY.approvals.decisionMade, { exact: true }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: COPY.approvals.approve })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: COPY.approvals.reject })
    ).toHaveCount(0);

    // Back-nav returns to the list, which no longer shows the decided row.
    await page
      .getByRole("link", { name: COPY.approvals.backToApprovals })
      .click();
    await expect(page).toHaveURL(/\/management\?module=approvals$/u);
    await expect(page.getByText(approveName, { exact: true })).toHaveCount(0);
    await expect(page.getByText(rejectName, { exact: true })).toBeVisible();

    // Reject path: the note is required — an empty attempt posts nothing.
    await page.goto(`/management?module=approvals&request=${rejectId}`);
    await expect(
      page.getByRole("heading", { name: COPY.approvals.approvalDetailTitle })
    ).toBeVisible();
    await page.getByRole("button", { name: COPY.approvals.reject }).click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: COPY.approvals.rejectionNoteRequired })
    ).toBeVisible();
    await expect(
      page.getByText(COPY.approvals.statusPending, { exact: true })
    ).toBeVisible();

    // With the note, rejection commits atomically and stays viewable.
    const note = "資料不完整，請補充聯絡方式。";
    await page.getByLabel(COPY.approvals.decisionNote).fill(note);
    await page.getByRole("button", { name: COPY.approvals.reject }).click();
    await expect(
      page.getByText(COPY.approvals.statusRejected, { exact: true })
    ).toBeVisible();
    await expect(page.getByText(note, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: COPY.approvals.approve })
    ).toHaveCount(0);

    // The decided request remains viewable read-only at the same URL after
    // a reload (spec 087 US 7: past decisions stay auditable).
    await page.reload();
    await expect(
      page.getByText(COPY.approvals.statusRejected, { exact: true })
    ).toBeVisible();
    await expect(page.getByText(note, { exact: true })).toBeVisible();

    // Back-nav: list is intact and neither decided row reappears.
    await page
      .getByRole("link", { name: COPY.approvals.backToApprovals })
      .click();
    await expect(page).toHaveURL(/\/management\?module=approvals$/u);
    await expect(page.getByText(approveName, { exact: true })).toHaveCount(0);
    await expect(page.getByText(rejectName, { exact: true })).toHaveCount(0);
  });

  test("approvals list preserves scroll position after detail back-nav", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const stamp = Date.now();
    const seeded = await page.evaluate(
      async ({ stamp: runStamp }) => {
        const register = async (username: string, name: string) => {
          const response = await fetch("/api/v1/auth/register", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": `e2e-08702-scroll-${username}`,
            },
            body: JSON.stringify({
              username,
              password: `${username}-pw!1`,
              name,
              phone: "555-0199",
            }),
          });
          return response.ok;
        };
        const names: string[] = [];
        for (let index = 0; index < 8; index += 1) {
          const username = `E2E_HUB_SCROLL_${runStamp}_${index}`;
          const name = `E2E Hub Scroll ${runStamp} ${index}`;
          const ok = await register(username, name);
          if (!ok) {
            return { ok: false as const, names };
          }
          names.push(name);
        }
        return { ok: true as const, names };
      },
      { stamp }
    );
    expect(seeded.ok, "scroll fixture registrations must succeed").toBe(true);
    const [firstName] = seeded.names;
    const lastName = required("scroll fixture last name", seeded.names.at(-1));

    await page.goto("/management?module=approvals");
    await expect(page.getByText(lastName, { exact: true })).toBeVisible();
    const scrollBefore = await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      return window.scrollY;
    });
    expect(scrollBefore).toBeGreaterThan(0);

    await page
      .getByRole("link", {
        name: new RegExp(`${COPY.approvals.openDetail} ${lastName}`, "u"),
      })
      .click();
    await expect(
      page.getByRole("heading", { name: COPY.approvals.approvalDetailTitle })
    ).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/management\?module=approvals$/u);
    await expect(page.getByText(firstName, { exact: true })).toBeVisible();
    const scrollAfter = await page.evaluate(() => window.scrollY);
    expect(scrollAfter).toBeGreaterThanOrEqual(scrollBefore - 50);
  });
});

// 087-03 (#320): Account Permissions real matrix — real elevated accounts
// (Admin / Staff / Staff-with-DM-grant) with role + department context, the
// fixed three role definitions with live assignment states (角色變更會即時反映),
// and the server-side DM denial asserted by direct API call — the DM-only
// fixture (Member with a grant) exercises the endpoint itself, never
// client-side hiding alone. A Member DM grant stays scoped access and never
// enters this church-wide matrix (worker contract, migration 0013).
test.describe("PERM-01 Account Permissions matrix", () => {
  test("Admin sees the real matrix; a Staff DM grant reflects immediately; the DM-only fixture is denied server-side", async ({
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
        data?: { departments?: { department_id: string; code: string }[] };
      };
      return (
        body.data?.departments?.find((d) => d.code === "E2E_DEMO_MINISTRY")
          ?.department_id ?? null
      );
    });
    const deptId = required(
      "E2E_DEMO_MINISTRY department id",
      departmentId ?? undefined
    );

    const revokeManagerGrant = (userId: string) =>
      page.evaluate(
        async ({ deptId, userId }) => {
          const listRes = await fetch(
            `/api/v1/programs/departments/${deptId}/managers`
          );
          const listBody = (await listRes.json()) as {
            data?: { managers?: { user_id: string }[] };
          };
          const hasUser = (listBody.data?.managers ?? []).some(
            (manager) => manager.user_id === userId
          );
          if (hasUser) {
            await fetch(
              `/api/v1/programs/departments/${deptId}/managers/${userId}/revoke`,
              { method: "POST" }
            );
          }
        },
        { deptId, userId }
      );

    const grantManager = (userId: string) =>
      page.evaluate(
        async ({ deptId, userId }) => {
          const res = await fetch(
            `/api/v1/programs/departments/${deptId}/managers`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ user_id: userId }),
            }
          );
          return res.status;
        },
        { deptId, userId }
      );

    try {
      // Order-independent baseline: no active grants for either fixture.
      await revokeManagerGrant(DEV_STAFF.userId);
      await revokeManagerGrant(DEV_MEMBER.userId);

      // Admin opens the matrix: every elevated fixture is listed with role +
      // department context; no grants at baseline, so the department cell
      // falls back to the role scope.
      await page.goto("/management?module=permissions");
      await expect(
        page.getByRole("heading", { name: COPY.permissionsTitle })
      ).toBeVisible();
      await expect(page.getByText(COPY.permissionsLead)).toBeVisible();

      const table = page.getByRole("table", { name: COPY.accountsSection });
      await expect(table).toBeVisible();
      await expect(
        table.getByRole("columnheader", { name: COPY.accountName })
      ).toBeVisible();
      await expect(
        table.getByRole("columnheader", { name: COPY.accountRole })
      ).toBeVisible();
      await expect(
        table.getByRole("columnheader", { name: COPY.accountDepartment })
      ).toBeVisible();
      await expect(
        table.getByRole("rowheader", { name: "E2E Admin", exact: true })
      ).toBeVisible();
      await expect(
        table.getByRole("rowheader", { name: "E2E Staff", exact: true })
      ).toBeVisible();
      // A Member (DM grant or not) is never an elevated matrix account.
      await expect(
        table.getByRole("rowheader", { name: "E2E Member", exact: true })
      ).toHaveCount(0);

      // Fixed role definitions: exactly three, each with scope + state.
      const rolesRegion = page.getByRole("region", {
        name: COPY.rolesSection,
      });
      await expect(rolesRegion).toBeVisible();
      await expect(rolesRegion.locator("li")).toHaveCount(3);
      await expect(rolesRegion.getByText(COPY.roleAdmin)).toBeVisible();
      await expect(rolesRegion.getByText(COPY.roleAdminScope)).toBeVisible();
      await expect(
        rolesRegion.getByText(COPY.roleDepartmentManager)
      ).toBeVisible();
      await expect(
        rolesRegion.getByText(COPY.roleDepartmentManagerScope)
      ).toBeVisible();
      await expect(rolesRegion.getByText(COPY.roleStaff)).toBeVisible();
      await expect(rolesRegion.getByText(COPY.roleStaffScope)).toBeVisible();
      // Baseline states: the Admin + Staff fixtures hold their roles; the
      // department-manager role has no holder yet -> 可指派.
      await expect(rolesRegion.getByText(COPY.stateAssigned)).toHaveCount(2);
      await expect(rolesRegion.getByText(COPY.stateAssignable)).toHaveCount(1);

      // Grant the STAFF fixture Department Manager on the demo department:
      // the matrix reflects the change on the next load (即時反映) — the
      // account projects as 部門管理者 with its real department context.
      expect(await grantManager(DEV_STAFF.userId)).toBe(200);

      await page.reload();
      await expect(
        table.getByRole("rowheader", { name: "E2E Staff", exact: true })
      ).toBeVisible();
      await expect(
        table.getByText("E2E_DEMO_示範事工", { exact: true })
      ).toBeVisible();
      await expect(
        table.getByText(COPY.roleDepartmentManager).first()
      ).toBeVisible();
      // Every role now has a holder: three 已設, no 可指派.
      await expect(rolesRegion.getByText(COPY.stateAssigned)).toHaveCount(3);
      await expect(rolesRegion.getByText(COPY.stateAssignable)).toHaveCount(0);

      // Revoke: the Staff account returns to 同工 and the DM role to 可指派.
      await revokeManagerGrant(DEV_STAFF.userId);
      await page.reload();
      await expect(table.getByText(COPY.roleDepartmentManager)).toHaveCount(0);
      await expect(rolesRegion.getByText(COPY.stateAssignable)).toHaveCount(1);

      // The DM-only fixture is denied server-side: after granting the MEMBER
      // fixture a department manager role, the direct endpoint call returns
      // 403 FORBIDDEN — never client-side hiding alone.
      expect(await grantManager(DEV_MEMBER.userId)).toBe(200);
      await clearSession(page);
      await loginAs(
        page,
        required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
        required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
      );
      const denied = await page.evaluate(async () => {
        const res = await fetch("/api/v1/programs/account-permissions");
        return { status: res.status, body: await res.json() };
      });
      expect(denied.status).toBe(403);
      expect(denied.body).toMatchObject({ code: "FORBIDDEN" });
    } finally {
      // Failure-safe restoration: re-authenticate as Admin and revoke both
      // grants so the fixtures end exactly as they started.
      await clearSession(page);
      await loginAs(
        page,
        required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
        required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
      );
      await revokeManagerGrant(DEV_STAFF.userId);
      await revokeManagerGrant(DEV_MEMBER.userId);
      await clearSession(page);
    }
  });
});
