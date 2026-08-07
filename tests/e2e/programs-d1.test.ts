/* oxlint-disable vitest/prefer-importing-vitest-globals */
// PRG-05 (#201) — deployed end-to-end proof of the Program System.
//
// Drives the real browser UI (Next.js static export served by the Worker
// ASSETS binding) plus same-origin `/api/v1/programs/*` RPCs at phone and
// desktop widths against a fresh isolated Worker/D1 acceptance target.
// Acceptance trace: docs/omp-plans/2026-08-06-prg-05-ticket-201.md.
// Copy strings below mirror web/lib/copy.ts; the suite asserts observable
// DOM state and server responses, never client-side gating alone.
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

// Dev-testing worker fixtures (single source: ./dev-fixtures.ts; see
// .github/CI-SECRETS.md) — overridable via PROGRAMS_* env.
import { DEV_ADMIN, DEV_MEMBER, DEV_STAFF } from "./dev-fixtures";

const ADMIN_USER = process.env.PROGRAMS_ADMIN_USERNAME ?? DEV_ADMIN.username;
const ADMIN_CRED = process.env.PROGRAMS_ADMIN_CREDENTIAL ?? DEV_ADMIN.credential;
const STAFF_USER = process.env.PROGRAMS_STAFF_USERNAME ?? DEV_STAFF.username;
const STAFF_CRED = process.env.PROGRAMS_STAFF_CREDENTIAL ?? DEV_STAFF.credential;
const MEMBER_USER = process.env.PROGRAMS_MEMBER_USERNAME ?? DEV_MEMBER.username;
const MEMBER_CRED = process.env.PROGRAMS_MEMBER_CREDENTIAL ?? DEV_MEMBER.credential;

const COPY = {
  login: "登入",
  pageTitle: "課程與活動",
  createDepartment: "新增部門",
  deptCode: "部門代碼",
  deptName: "部門名稱",
  created: "已建立。",
  programName: "課程名稱",
  discoverabilityListed: "公開",
  createProgram: "新增課程",
  expand: "展開",
  collapse: "收合",
  dayOfWeekLabel: "每週日子",
  startTime: "開始時間",
  endTime: "結束時間",
  addRule: "新增時間表",
  generateEvents: "產生聚會",
  requestEnroll: "申請報名",
  requestSubmitted: "已送出報名申請。",
  requestPending: "待處理",
  approve: "核准",
  enrollmentActive: "已加入",
  eventActive: "進行",
  leaderUserId: "選擇會友",
  assignLeader: "新增負責人",
  revokeLeader: "移除負責人",
  leaderAssignedNotice: "已新增事工負責人。",
  leaderRevokedNotice: "已移除事工負責人。",
  noLeaders: "目前沒有事工負責人。",
  noRules: "尚未設定時間表。",
  eventsEmpty: "目前沒有聚會。",
  programDetails: "查看課程詳情",
  programOverview: "概覽",
  programEdit: "基本資料",
  programEvents: "聚會與時間表",
  programEnrollment: "報名",
  programLeaders: "事工負責人",
  pageLead: "先選部門，再處理課程、聚會或報名。",
  ruleWeekly: "每週",
  confirmRevoke: "確定移除",
  behaviorType: "形式",
  programLifecycle: "課程狀態",
  lifecycleActive: "啟用",
  saveProgram: "儲存課程",
  editProgram: "編輯課程",
  updated: "已更新。",
  withdrawRequest: "撤回申請",
  requestWithdrawnNotice: "申請已撤回。",
  requestWithdrawn: "已撤回",
  cancelEnrollment: "取消報名",
  enrollmentCancelledNotice: "報名已取消。",
  enrollmentCancelled: "已取消",
  memberId: "成員 ID",
  assistedEnroll: "新增報名",
  assistedSubmitted: "已新增報名。",
  enable: "啟用",
  disable: "停用",
  moduleEvents: "聚會",
  eventStart: "開始時間（香港時間）",
  eventEnd: "結束時間（香港時間）",
  createEvent: "新增聚會",
  enrollmentDuplicate: "此會友已報名此課程。",
  // E2E-18..22 — events-panel slice (monthly rules, exceptions, cancel reason).
  ruleMonthly: "每月",
  monthDayLabel: "每月日子",
  rescheduleEvent: "改期",
  confirmReschedule: "確認改期",
  rescheduleStart: "改期開始時間",
  rescheduleEnd: "改期結束時間",
  cancelOccurrence: "取消該次",
  confirmCancelOccurrence: "確定取消該次",
  keepOccurrence: "保留該次",
  restoreOccurrence: "恢復該次",
  exceptionUpdatedNotice: "已更新例外。",
  exceptionRemovedNotice: "已移除例外。",
  cancelledReasonLabel: "取消原因：",
  memberSearchEmpty: "找不到符合的現有會友。",
  clearMember: "清除選擇",
  cancelEvent: "取消聚會",
  cancelReason: "取消原因",
  confirmCancelEvent: "取消聚會",
  cancelEventConfirm: "確定取消這場聚會嗎？取消後仍會保留記錄。",
  eventCancelledNotice: "聚會已取消。",
  eventCancelled: "已取消",
};

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function fresh(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

// The <li> row whose <p> carries the exact program/department name. Names are
// unique per level (dept code only in the dept row, program name only in the
// program row), so a direct filter is unambiguous.
function innermostLiWith(page: Page, text: string) {
  // The dept <li> nests the program <li>s (leader view), so the raw filter
  // can match both; the LAST match in document order is the innermost row.
  return page
    .locator("li")
    .filter({ has: page.getByText(text, { exact: true }) })
    .last();
}


async function resolveUserId(
  client: { get: (url: string) => Promise<{ status(): number; json(): Promise<unknown> }> },
  programId: string,
  username: string
): Promise<string> {
  const res = await client.get(
    `/api/v1/programs/${programId}/member-options?q=${encodeURIComponent(username)}`
  );
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    data: { members: { user_id: string; username: string }[] };
  };
  const hit = body.data.members.find((m) => m.username === username);
  expect(hit).toBeTruthy();
  return hit!.user_id;
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

// Expand the department row (idempotent) so its program rows are in the DOM.
// Retries because a click right after SSR/session-nav can land before React
// attaches the handler (hydration race); we confirm via the collapse button.
async function openDepartment(page: Page, deptCode: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const collapseBtn = innermostLiWith(page, deptCode).getByRole("button", {
      name: COPY.collapse,
    });
    if (await collapseBtn.count()) {
      return;
    }
    const expandBtn = innermostLiWith(page, deptCode).getByRole("button", {
      name: COPY.expand,
    });
    if (await expandBtn.count()) {
      await expandBtn.click();
    }
    if (await collapseBtn.count()) {
      return;
    }
    await page.waitForTimeout(500);
  }
}

async function createDepartmentViaUi(
  page: Page
): Promise<{ departmentId: string; deptCode: string }> {
  const deptCode = fresh("E2E_DEPT");
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/v1/programs/departments" &&
      response.status() === 201
  );
  await page.getByLabel(COPY.deptCode).fill(deptCode);
  await page.getByLabel(COPY.deptName).fill(`E2E 部門 ${deptCode}`);
  await page.getByRole("button", { name: COPY.createDepartment }).click();
  const response = await responsePromise;
  const body = (await response.json()) as {
    data: { department: { department_id: string } };
  };
  await expect(page.getByText(COPY.created)).toBeVisible();
  await expect(page.getByText(deptCode, { exact: true })).toBeVisible();
  await Promise.all(
    ["program_catalog", "events", "enrollment"].map(async (moduleKey) => {
      const moduleResponse = await page.request.post(
        `/api/v1/programs/departments/${body.data.department.department_id}/modules/${moduleKey}/enable`
      );
      expect(moduleResponse.status()).toBe(200);
    })
  );
  return { departmentId: body.data.department.department_id, deptCode };
}

async function createProgramViaUi(
  page: Page,
  deptCode: string,
  departmentId: string,
  behavior: "Recurring" | "OneOff" = "Recurring"
): Promise<{ programId: string; programName: string }> {
  const programName =
    behavior === "OneOff"
      ? `E2E 單次 ${fresh("P")}`
      : `E2E 課程 ${fresh("P")}`;
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname ===
        `/api/v1/programs/departments/${departmentId}/programs` &&
      response.status() === 201
  );
  await openDepartment(page, deptCode);
  await page.getByLabel(COPY.programName).fill(programName);
  if (behavior === "OneOff") {
    await page.getByLabel(COPY.behaviorType).selectOption("OneOff");
  }
  await page.getByLabel(COPY.discoverabilityListed).selectOption("Listed");
  await page.getByRole("button", { name: COPY.createProgram }).click();
  const response = await responsePromise;
  const body = (await response.json()) as {
    data: { program: { program_id: string } };
  };
  await expect(page.getByText(programName)).toBeVisible();
  return { programId: body.data.program.program_id, programName };
}

async function setupProgram(
  page: Page
): Promise<{ programId: string; programName: string; deptCode: string }> {
  const { departmentId, deptCode } = await createDepartmentViaUi(page);
  const { programId, programName } = await createProgramViaUi(
    page,
    deptCode,
    departmentId
  );
  return { programId, programName, deptCode };
}

async function openProgramTask(item: Locator, taskName: string): Promise<void> {
  const task = item.getByRole("button", { name: taskName, exact: true });
  if ((await task.count()) === 0) {
    await item.getByRole("button", { name: COPY.programDetails }).click();
  }
  await expect(task).toBeVisible();
  await task.click();
}

async function chooseMember(item: Locator, username: string): Promise<void> {
  await openProgramTask(item, COPY.programLeaders);
  await item.getByLabel(COPY.leaderUserId).fill(username);
  await item.getByRole("button", { name: new RegExp(username, "u") }).click();
}

// ---------------------------------------------------------------------------
// E2E-18..22 — events-panel slice helpers (monthly rules, exceptions, cancel).
// ---------------------------------------------------------------------------

/** Today's HK wall date, "YYYY-MM-DD" (matches the worker's hkTodayWallDate). */
function hkWallToday(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Shift a HK wall date by whole days (DST-free wall arithmetic). */
function addWallDays(wallDate: string, days: number): string {
  const [year, month, day] = wallDate.split("-").map(Number);
  // Date.UTC normalizes overflow (e.g. Aug 32 -> Sep 1); wall-date weekday
  // is read back from the same UTC calendar day.
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

/** First wall date strictly after `wallDate` whose HK weekday is `weekday`. */
function nextWallWeekday(wallDate: string, weekday: number): string {
  for (let days = 1; days <= 7; days += 1) {
    const candidate = addWallDays(wallDate, days);
    const [year, month, day] = candidate.split("-").map(Number);
    if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() === weekday) {
      return candidate;
    }
  }
  throw new Error("unreachable: one weekday must occur within 7 days");
}

/** "YYYY-MM-DD" + "HH:MM" (HK wall) -> ISO-8601 UTC instant. */
function hkWallToUtc(wallDate: string, wallTime: string): string {
  return new Date(`${wallDate}T${wallTime}:00+08:00`).toISOString();
}

async function listEventsVia(
  page: Page,
  programId: string
): Promise<{ event_id: string; starts_at: string; status: string }[]> {
  const res = await page.request.get(`/api/v1/programs/${programId}/events`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    data: { events: { event_id: string; starts_at: string; status: string }[] };
  };
  return body.data.events;
}

// The event <li> whose date span carries the given HK wall start time. Dates
// render as "2026/08/11 19:30" (Intl may insert narrow no-break spaces).
function eventRowAt(item: Locator, page: Page, time: string): Locator {
  return item
    .locator("li")
    .filter({
      has: page.getByText(
        new RegExp(`^\\d{4}/\\d{2}/\\d{2}\\s*${time}`, "u")
      ),
    })
    .first();
}

/** Wall date ("YYYY-MM-DD") of the earliest event row starting at `time`. */
async function firstEventWallDate(
  item: Locator,
  page: Page,
  time: string
): Promise<string> {
  const row = eventRowAt(item, page, time);
  const label = await row
    .getByText(/^\d{4}\/\d{2}\/\d{2}\s*\d{2}:\d{2}/u)
    .textContent();
  const match = label?.match(/^(\d{4})\/(\d{2})\/(\d{2})/u);
  if (!match) {
    throw new Error(`event row has no wall-date label: ${label}`);
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

// E2E-04/05-style rule creation (weekly Tuesday 19:30-21:00) + first generate.
async function addTuesdayRuleAndGenerate(item: Locator): Promise<void> {
  await item.getByLabel(COPY.dayOfWeekLabel).selectOption("2");
  await item.getByLabel(COPY.startTime).fill("19:30");
  await item.getByLabel(COPY.endTime).fill("21:00");
  await item.getByRole("button", { name: COPY.addRule }).click();
  await expect(item.getByText(COPY.created)).toBeVisible();
  await item.getByRole("button", { name: COPY.generateEvents }).click();
  await expect(item.getByText(/已產生 [1-9]/u)).toBeVisible();
  await expect(item.getByText(COPY.eventActive).first()).toBeVisible();
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
      "PROGRAMS_*_USERNAME must start with E2E_; deployed suites require disposable acceptance accounts"
    );
  }
});

test.describe("PRG-05 deployed programs proof", () => {
  test("E2E-01 admin login renders the programs surface (C1)", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    // Standing dev worker has migration-0003 seeded departments; assert the
    // surface renders (heading + lead), not an empty state.
    await expect(
      page.getByRole("heading", { name: COPY.pageTitle })
    ).toBeVisible();
    await expect(page.getByText(COPY.pageLead)).toBeVisible();
  });

  test("E2E-02 admin creates a department; row persists on reload (C1, C3, C4)", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const { deptCode } = await createDepartmentViaUi(page);
    const name = `E2E 部門 ${deptCode}`;
    await page.reload();
    await expect(page.getByText(name)).toBeVisible();
  });

  test("E2E-03 admin creates a Recurring program inside the department (C1, C3)", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const { departmentId, deptCode } = await createDepartmentViaUi(page);
    await createProgramViaUi(page, deptCode, departmentId);
  });

  test("E2E-04 staff adds a schedule rule; rule row persists (C1, C3)", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_STAFF_USERNAME", STAFF_USER),
      required("PROGRAMS_STAFF_CREDENTIAL", STAFF_CRED)
    );
    const { programName, deptCode } = await setupProgram(page);
    const item = innermostLiWith(page, programName);
    await openProgramTask(item, COPY.programEvents);
    await item.getByLabel(COPY.dayOfWeekLabel).selectOption("2");
    await item.getByLabel(COPY.startTime).fill("19:30");
    await item.getByLabel(COPY.endTime).fill("21:00");
    await item.getByRole("button", { name: COPY.addRule }).click();
    await expect(item.getByText(COPY.created)).toBeVisible();
    await page.reload();
    await openDepartment(page, deptCode);
    const reloadedDepartment = innermostLiWith(page, deptCode);
    await openProgramTask(reloadedDepartment, COPY.programEvents);
    await expect(
      reloadedDepartment.getByText(`${COPY.ruleWeekly} 星期二`)
    ).toBeVisible();
    await expect(reloadedDepartment.getByText("19:30–21:00")).toBeVisible();
    await expect(page.getByText(programName)).toBeVisible();
  });

  test("E2E-05 staff generates events; rows render (C1, C3)", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_STAFF_USERNAME", STAFF_USER),
      required("PROGRAMS_STAFF_CREDENTIAL", STAFF_CRED)
    );
    const { programName } = await setupProgram(page);
    const item = innermostLiWith(page, programName);
    await openProgramTask(item, COPY.programEvents);
    await item.getByLabel(COPY.dayOfWeekLabel).selectOption("2");
    await item.getByLabel(COPY.startTime).fill("19:30");
    await item.getByLabel(COPY.endTime).fill("21:00");
    await item.getByRole("button", { name: COPY.addRule }).click();
    await expect(item.getByText(COPY.created)).toBeVisible();
    await item.getByRole("button", { name: COPY.generateEvents }).click();
    await expect(item.getByText(/已產生/u)).toBeVisible();
    await expect(item.getByText(COPY.eventActive).first()).toBeVisible();
    await item.getByRole("button", { name: COPY.generateEvents }).click();
    await expect(item.getByText(/已產生 0 場聚會，跳過 [1-9]/u)).toBeVisible();
  });

  test("E2E-06 member requests enrollment; admin approves; enrollment active (C1, C3)", async ({
    page,
    browser,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const { programName, deptCode } = await setupProgram(page);

    const memberContext = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const memberPage = await memberContext.newPage();
    await loginAs(
      memberPage,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );
    await openDepartment(memberPage, deptCode);
    const memberItem = innermostLiWith(memberPage, programName);
    await openProgramTask(memberItem, COPY.programEnrollment);
    await memberItem.getByRole("button", { name: COPY.requestEnroll }).click();
    await expect(memberItem.getByText(COPY.requestSubmitted)).toBeVisible();
    await expect(memberItem.getByText(COPY.requestPending)).toBeVisible();

    await page.reload();
    await openDepartment(page, deptCode);
    const adminItem = innermostLiWith(page, programName);
    await openProgramTask(adminItem, COPY.programEnrollment);
    await adminItem.getByRole("button", { name: COPY.approve }).click();
    await expect(adminItem.getByText(COPY.requestPending)).toHaveCount(0);

    await memberPage.reload();
    await openDepartment(memberPage, deptCode);
    const reloadedItem = innermostLiWith(memberPage, programName);
    await openProgramTask(reloadedItem, COPY.programEnrollment);
    await expect(
      reloadedItem.getByText(COPY.enrollmentActive, {
        exact: true,
      })
    ).toBeVisible();
    await memberContext.close();
  });

  test("E2E-06b server contract: department create without lifecycle is a 422 VALIDATION", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const res = await page.request.post("/api/v1/programs/departments", {
      data: { code: fresh("E2E_STRICT"), name: "E2E Strict Dept" },
    });
    expect(res.status()).toBe(422);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("VALIDATION");
  });

  test("E2E-06c server contract: repeat enrollment request is a 409 ENROLLMENT_DUPLICATE", async ({
    page,
    browser,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const { programId } = await setupProgram(page);
    const memberContext = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const memberPage = await memberContext.newPage();
    await loginAs(
      memberPage,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );
    const first = await memberPage.request.post(
      `/api/v1/programs/${programId}/enrollment-requests`,
      { data: {} }
    );
    expect(first.status()).toBe(201);
    const second = await memberPage.request.post(
      `/api/v1/programs/${programId}/enrollment-requests`,
      { data: {} }
    );
    expect(second.status()).toBe(409);
    const body = (await second.json()) as { code?: string };
    expect(body.code).toBe("ENROLLMENT_DUPLICATE");
    await memberContext.close();
  });

  test("E2E-06d server contract: repeat approve is a quiet 200 (ADR-0027 DUPLICATE)", async ({
    page,
    browser,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const { programId } = await setupProgram(page);
    const memberContext = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const memberPage = await memberContext.newPage();
    await loginAs(
      memberPage,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );
    const submit = await memberPage.request.post(
      `/api/v1/programs/${programId}/enrollment-requests`,
      { data: {} }
    );
    expect(submit.status()).toBe(201);
    const requestId = (
      (await submit.json()) as {
        data: { request: { request_id: string } };
      }
    ).data.request.request_id;
    const approve = await page.request.post(
      `/api/v1/programs/${programId}/enrollment-requests/${requestId}/decision`,
      { data: { action: "Approved" } }
    );
    expect(approve.status()).toBe(200);
    const repeat = await page.request.post(
      `/api/v1/programs/${programId}/enrollment-requests/${requestId}/decision`,
      { data: { action: "Approved" } }
    );
    expect(repeat.status()).toBe(200);
    await memberContext.close();
  });

  test("E2E-07 member duplicate request surfaces conflict; member API forbid is server-side (C2, C4)", async ({
    page,
    browser,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const { programId, programName, deptCode } = await setupProgram(page);

    const firstContext = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const firstPage = await firstContext.newPage();
    await loginAs(
      firstPage,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );
    await openDepartment(firstPage, deptCode);
    await openProgramTask(
      innermostLiWith(firstPage, programName),
      COPY.programEnrollment
    );

    const secondContext = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const secondPage = await secondContext.newPage();
    await loginAs(
      secondPage,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );
    await openDepartment(secondPage, deptCode);
    await openProgramTask(
      innermostLiWith(secondPage, programName),
      COPY.programEnrollment
    );
    // Ensure the stale second session has its request button rendered before
    // the first session submits, so its later click is a genuine duplicate.
    await expect(
      innermostLiWith(secondPage, programName).getByRole("button", {
        name: COPY.requestEnroll,
      })
    ).toBeVisible();

    const firstItem = innermostLiWith(firstPage, programName);
    await firstItem.getByRole("button", { name: COPY.requestEnroll }).click();
    await expect(firstItem.getByText(COPY.requestSubmitted)).toBeVisible();

    const secondItem = innermostLiWith(secondPage, programName);
    await secondItem.getByRole("button", { name: COPY.requestEnroll }).click();
    await expect(secondItem.getByRole("alert")).toContainText(
      COPY.enrollmentDuplicate
    );

    const duplicate = await secondContext.request.post(
      `/api/v1/programs/${programId}/enrollment-requests`,
      { data: {} }
    );
    expect(duplicate.status()).toBe(409);

    const ruleForbidden = await secondContext.request.post(
      `/api/v1/programs/${programId}/schedule-rules`,
      {
        data: {
          recurrence: "WEEKLY",
          day_of_week: 2,
          month_day: null,
          start_time: "19:30",
          end_time: "21:00",
        },
      }
    );
    expect(ruleForbidden.status()).toBe(403);
    await firstContext.close();
    await secondContext.close();
  });

  test("E2E-08 admin assigns leader; leader row persists and gains server-side manage (C1, C2, C3)", async ({
    page,
    browser,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const { programId, programName, deptCode } = await setupProgram(page);
    const item = innermostLiWith(page, programName);
    await chooseMember(item, required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER));
    await item.getByRole("button", { name: COPY.assignLeader }).click();
    await expect(item.getByText(COPY.leaderAssignedNotice)).toBeVisible();

    await page.reload();
    await openDepartment(page, deptCode);
    const reloadedItem = innermostLiWith(page, programName);
    await openProgramTask(reloadedItem, COPY.programLeaders);
    await expect(reloadedItem.getByText(COPY.noLeaders)).toHaveCount(0);
    await expect(
      reloadedItem.getByText(
        new RegExp(
          `${required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER)}\\)`,
          "u"
        )
      )
    ).toBeVisible();

    const leaderContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const leaderPage = await leaderContext.newPage();
    await loginAs(
      leaderPage,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );
    const ruleOk = await leaderContext.request.post(
      `/api/v1/programs/${programId}/schedule-rules`,
      {
        data: {
          recurrence: "WEEKLY",
          day_of_week: 2,
          month_day: null,
          start_time: "19:30",
          end_time: "21:00",
        },
      }
    );
    expect(ruleOk.status()).toBe(201);
    await leaderContext.close();
  });

  test("E2E-09 leader cannot delegate; server rejects (C2)", async ({
    page,
    browser,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const { programId, programName, deptCode } = await setupProgram(page);
    const item = innermostLiWith(page, programName);
    await chooseMember(item, required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER));
    await item.getByRole("button", { name: COPY.assignLeader }).click();
    await expect(item.getByText(COPY.leaderAssignedNotice)).toBeVisible();

    const leaderContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const leaderPage = await leaderContext.newPage();
    await loginAs(
      leaderPage,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );
    await openDepartment(leaderPage, deptCode);
    const leaderItem = innermostLiWith(leaderPage, programName);
    await openProgramTask(leaderItem, COPY.programEvents);
    await expect(
      leaderItem.getByRole("button", { name: COPY.assignLeader })
    ).toHaveCount(0);
    const delegation = await leaderContext.request.post(
      `/api/v1/programs/${programId}/leaders`,
      {
        data: {
          // The delegation target must be an immutable user_id — resolve it
          // through the same member-options search the picker uses.
          user_id: await resolveUserId(
            leaderContext.request,
            programId,
            ADMIN_USER
          ),
        },
      }
    );
    expect(delegation.status()).toBe(403);
    await leaderContext.close();
  });

  test("E2E-10 revoke removes manage; revoked leader API forbid is server-side (C2, C3, C4)", async ({
    page,
    browser,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const { programId, programName, deptCode } = await setupProgram(page);
    const item = innermostLiWith(page, programName);
    await chooseMember(item, required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER));
    await item.getByRole("button", { name: COPY.assignLeader }).click();
    await expect(item.getByText(COPY.leaderAssignedNotice)).toBeVisible();
    await item.getByRole("button", { name: COPY.revokeLeader }).click();
    await item.getByRole("button", { name: COPY.confirmRevoke }).click();
    await expect(item.getByText(COPY.leaderRevokedNotice)).toBeVisible();
    await expect(item.getByText(COPY.noLeaders)).toBeVisible();

    const leaderContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const leaderPage = await leaderContext.newPage();
    await loginAs(
      leaderPage,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );
    await openDepartment(leaderPage, deptCode);
    const leaderItem = innermostLiWith(leaderPage, programName);
    await expect(
      leaderItem.getByRole("button", { name: COPY.addRule })
    ).toHaveCount(0);
    const ruleForbidden = await leaderContext.request.post(
      `/api/v1/programs/${programId}/schedule-rules`,
      {
        data: {
          recurrence: "WEEKLY",
          day_of_week: 2,
          month_day: null,
          start_time: "19:30",
          end_time: "21:00",
        },
      }
    );
    expect(ruleForbidden.status()).toBe(403);
    await leaderContext.close();
  });

  test("E2E-11 scoped leader lists own program, denied for others (C2)", async ({
    page,
    browser,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const { departmentId, deptCode } = await createDepartmentViaUi(page);
    const { programId: programAId, programName: programAName } =
      await createProgramViaUi(page, deptCode, departmentId);
    const itemA = innermostLiWith(page, programAName);
    await chooseMember(
      itemA,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER)
    );
    await itemA.getByRole("button", { name: COPY.assignLeader }).click();
    await expect(itemA.getByText(COPY.leaderAssignedNotice)).toBeVisible();

    const { programId: programBId, programName: programBName } =
      await createProgramViaUi(page, deptCode, departmentId);
    await expect(page.getByText(programBName)).toBeVisible();

    const leaderContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const leaderPage = await leaderContext.newPage();
    await loginAs(
      leaderPage,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );
    await openDepartment(leaderPage, deptCode);
    for (const programName of [programAName, programBName]) {
      const item = innermostLiWith(leaderPage, programName);
      await openProgramTask(item, COPY.programOverview);
      await expect(
        item.getByRole("button", { name: COPY.programLeaders })
      ).toHaveCount(0);
      await expect(
        item.getByRole("button", { name: COPY.revokeLeader })
      ).toHaveCount(0);
    }
    const own = await leaderContext.request.get(
      `/api/v1/programs/${programAId}/leaders`
    );
    expect(own.status()).toBe(200);
    const cross = await leaderContext.request.get(
      `/api/v1/programs/${programBId}/leaders`
    );
    expect(cross.status()).toBe(404);
    await leaderContext.close();
  });

  test("E2E-12 program detail empty states survive reload recovery (C3, C4)", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const { programName, deptCode } = await setupProgram(page);
    await openDepartment(page, deptCode);
    const item = innermostLiWith(page, programName);
    await openProgramTask(item, COPY.programEvents);
    await expect(item.getByText(COPY.noRules)).toBeVisible();
    await expect(item.getByText(COPY.eventsEmpty)).toBeVisible();

    await page.reload();
    await openDepartment(page, deptCode);
    const reloadedItem = innermostLiWith(page, programName);
    await openProgramTask(reloadedItem, COPY.programEvents);
    await expect(reloadedItem.getByText(COPY.noRules)).toBeVisible();
    await expect(reloadedItem.getByText(COPY.eventsEmpty)).toBeVisible();
    });

  test("E2E-13 OneOff program creates a manual event; no schedule-rule surface (C1, C3)", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const { departmentId, deptCode } = await createDepartmentViaUi(page);
    const { programName } = await createProgramViaUi(
      page,
      deptCode,
      departmentId,
      "OneOff"
    );
    const item = innermostLiWith(page, programName);
    await openProgramTask(item, COPY.programEvents);
    await expect(
      item.getByRole("button", { name: COPY.generateEvents })
    ).toHaveCount(0);
    await item.getByLabel(COPY.eventStart).fill("2026-08-20T19:30");
    await item.getByLabel(COPY.eventEnd).fill("2026-08-20T21:00");
    await item.getByRole("button", { name: COPY.createEvent }).click();
    await expect(item.getByText(COPY.eventActive).first()).toBeVisible();
  });

  test("E2E-14 admin edits program name and publishes lifecycle; persists (C1, C3, C4)", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const { programName, deptCode } = await setupProgram(page);
    const renamed = `${programName} 改名`;
    const item = innermostLiWith(page, programName);
    await openProgramTask(item, COPY.programEdit);
    // The tab click can land pre-hydration; wait for the edit form and retry.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (await item.getByText(COPY.editProgram).count()) {
        break;
      }
      await item.getByRole("button", { name: COPY.programEdit, exact: true }).click();
      await page.waitForTimeout(500);
    }
    await expect(item.getByText(COPY.editProgram)).toBeVisible();
    const nameInput = item.getByLabel(COPY.programName);
    await nameInput.fill(renamed);
    await item.getByLabel(COPY.programLifecycle).selectOption("Active");
    await item.getByRole("button", { name: COPY.saveProgram }).click();
    // The save notice is transient; assert the renamed row renders instead.
    await expect(page.getByText(renamed)).toBeVisible();
    await page.reload();
    await openDepartment(page, deptCode);
    await expect(page.getByText(renamed)).toBeVisible();
  });

  test("E2E-15 admin publishes a department and toggles a module via UI; persists (C1, C3, C4)", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const { deptCode } = await createDepartmentViaUi(page);
    const dept = innermostLiWith(page, deptCode);
    // Retry the publish click — a click landing pre-hydration silently no-ops.
    // The success signal is the publish BUTTON disappearing (the lifecycle
    // badge and the button share the 啟用 text, so the button count is the
    // unambiguous state).
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const publish = dept
        .getByRole("button", { name: COPY.lifecycleActive, exact: true })
        .first();
      if ((await publish.count()) === 0) {
        break;
      }
      await publish.click();
      await page.waitForTimeout(700);
    }
    await expect(
      dept
        .getByRole("button", { name: COPY.lifecycleActive, exact: true })
        .first()
    ).toHaveCount(0);
    await openDepartment(page, deptCode);
    // The module row is the parent of the module-name label; its only button
    // is the enable/disable toggle.
    const eventsModuleRow = dept
      .getByText(COPY.moduleEvents, { exact: true })
      .locator("xpath=..");
    await eventsModuleRow.getByRole("button", { name: COPY.disable }).click();
    await expect(
      eventsModuleRow.getByRole("button", { name: COPY.enable })
    ).toBeVisible();
    await page.reload();
    await openDepartment(page, deptCode);
    const reloadedDept = innermostLiWith(page, deptCode);
    await expect(
      reloadedDept.getByText(COPY.lifecycleActive, { exact: true }).first()
    ).toBeVisible();
    await expect(
      reloadedDept
        .getByText(COPY.moduleEvents, { exact: true })
        .locator("xpath=..")
        .getByRole("button", { name: COPY.enable })
    ).toBeVisible();
  });

  test("E2E-16a member withdraws a Pending request via UI (C1, C3)", async ({
    page,
    browser,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const { programName, deptCode } = await setupProgram(page);
    const memberContext = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const memberPage = await memberContext.newPage();
    await loginAs(
      memberPage,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );
    await openDepartment(memberPage, deptCode);
    const memberItem = innermostLiWith(memberPage, programName);
    await openProgramTask(memberItem, COPY.programEnrollment);
    await memberItem.getByRole("button", { name: COPY.requestEnroll }).click();
    await expect(memberItem.getByText(COPY.requestPending)).toBeVisible();
    await memberItem.getByRole("button", { name: COPY.withdrawRequest }).click();
    await expect(memberItem.getByText(COPY.requestWithdrawnNotice)).toBeVisible();
    await expect(
      memberItem.getByText(COPY.requestWithdrawn, { exact: true })
    ).toBeVisible();
    await memberContext.close();
  });

  test("E2E-16b member cancels an Active enrollment via UI (C1, C3)", async ({
    page,
    browser,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const { programName, deptCode } = await setupProgram(page);
    const memberContext = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const memberPage = await memberContext.newPage();
    await loginAs(
      memberPage,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );
    await openDepartment(memberPage, deptCode);
    const memberItem = innermostLiWith(memberPage, programName);
    await openProgramTask(memberItem, COPY.programEnrollment);
    await memberItem.getByRole("button", { name: COPY.requestEnroll }).click();
    await expect(memberItem.getByText(COPY.requestPending)).toBeVisible();

    await page.reload();
    await openDepartment(page, deptCode);
    const adminItem = innermostLiWith(page, programName);
    await openProgramTask(adminItem, COPY.programEnrollment);
    await adminItem.getByRole("button", { name: COPY.approve }).click();
    await expect(adminItem.getByText(COPY.requestPending)).toHaveCount(0);

    await memberPage.reload();
    await openDepartment(memberPage, deptCode);
    const reloadedItem = innermostLiWith(memberPage, programName);
    await openProgramTask(reloadedItem, COPY.programEnrollment);
    await expect(
      reloadedItem.getByText(COPY.enrollmentActive, { exact: true })
    ).toBeVisible();
    await reloadedItem.getByRole("button", { name: COPY.cancelEnrollment }).click();
    await expect(
      reloadedItem.getByText(COPY.enrollmentCancelledNotice)
    ).toBeVisible();
    await expect(
      reloadedItem.getByText(COPY.enrollmentCancelled, { exact: true })
    ).toBeVisible();
    await memberContext.close();
  });

  test("E2E-17 admin assists enrollment on a ManagerOnly program via UI (C1, C3)", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const { departmentId, deptCode } = await createDepartmentViaUi(page);
    const programName = `E2E 專員 ${fresh("P")}`;
    const create = await page.request.post(
      `/api/v1/programs/departments/${departmentId}/programs`,
      {
        data: {
          name: programName,
          behavior_type: "Recurring",
          lifecycle: "Draft",
          enrollment_mode: "ManagerOnly",
        },
      }
    );
    expect(create.status()).toBe(201);
    await page.reload();
    await openDepartment(page, deptCode);
    const item = innermostLiWith(page, programName);
    await openProgramTask(item, COPY.programEnrollment);
    await item.getByLabel(COPY.memberId).fill(MEMBER_USER);
    await item.getByRole("button", { name: new RegExp(MEMBER_USER, "u") }).click();
    await item.getByRole("button", { name: COPY.assistedEnroll }).click();
    await expect(item.getByText(COPY.assistedSubmitted)).toBeVisible();
    await expect(
      item.getByText(COPY.enrollmentActive, { exact: true })
    ).toBeVisible();
});

  test("E2E-18 staff creates a MONTHLY rule; generate renders events on month_day (C1, C3)", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_STAFF_USERNAME", STAFF_USER),
      required("PROGRAMS_STAFF_CREDENTIAL", STAFF_CRED)
    );
    const { programName, deptCode } = await setupProgram(page);
    const item = innermostLiWith(page, programName);
    await openProgramTask(item, COPY.programEvents);
    await item.getByLabel(COPY.behaviorType).selectOption("monthly");
    await item.getByLabel(COPY.monthDayLabel).fill("15");
    await item.getByLabel(COPY.startTime).fill("19:30");
    await item.getByLabel(COPY.endTime).fill("21:00");
    await item.getByRole("button", { name: COPY.addRule }).click();
    await expect(item.getByText(COPY.created)).toBeVisible();
    await expect(item.getByText(`${COPY.ruleMonthly} 15`)).toBeVisible();
    await item.getByRole("button", { name: COPY.generateEvents }).click();
    await expect(item.getByText(/已產生 [1-9]/u)).toBeVisible();
    // Events materialize on the 15th of each month in the horizon.
    await expect(item.getByText(/\/15\s*19:30/u).first()).toBeVisible();
    // Rule row persists across reload.
    await page.reload();
    await openDepartment(page, deptCode);
    const reloaded = innermostLiWith(page, programName);
    await openProgramTask(reloaded, COPY.programEvents);
    await expect(reloaded.getByText(`${COPY.ruleMonthly} 15`)).toBeVisible();
  });

  test("E2E-19 admin member-search picker: typing → results → selection (C1, C3)", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const { programName } = await setupProgram(page);
    const item = innermostLiWith(page, programName);
    await openProgramTask(item, COPY.programLeaders);
    // The input is role=combobox; the options <ul> shares the aria-label, so
    // role-scoping keeps the locator unambiguous once results render.
    const picker = item.getByRole("combobox", { name: COPY.leaderUserId });
    // Typing >= 2 chars fires the member search; the option row renders.
    await picker.fill(required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER));
    await expect(
      item.getByRole("button", {
        name: new RegExp(required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER), "u"),
      })
    ).toBeVisible();
    // A query matching nobody surfaces the empty-state hint.
    await picker.fill("E2E_zzzz");
    await expect(item.getByText(COPY.memberSearchEmpty)).toBeVisible();
    // Re-search and select; the chip shows "name (username)" and clears.
    await picker.fill(required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER));
    await item
      .getByRole("button", {
        name: new RegExp(required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER), "u"),
      })
      .click();
    await expect(
      item.getByText(
        new RegExp(
          `${required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER)}\\)`,
          "u"
        )
      )
    ).toBeVisible();
    await expect(
      item.getByRole("button", { name: COPY.clearMember })
    ).toBeVisible();
    // The selected member becomes the leader through the same panel.
    await item.getByRole("button", { name: COPY.assignLeader }).click();
    await expect(item.getByText(COPY.leaderAssignedNotice)).toBeVisible();
  });

  test("E2E-20 per-event 改期 reschedules an occurrence; regenerate keeps the exception (C1, C3)", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_STAFF_USERNAME", STAFF_USER),
      required("PROGRAMS_STAFF_CREDENTIAL", STAFF_CRED)
    );
    const { programName } = await setupProgram(page);
    const item = innermostLiWith(page, programName);
    await openProgramTask(item, COPY.programEvents);
    await addTuesdayRuleAndGenerate(item);
    const row = eventRowAt(item, page, "19:30");
    const wallDate = await firstEventWallDate(item, page, "19:30");
    // 改期 moves the occurrence to 20:30-22:00 on the same HK wall date.
    await row.getByRole("button", { name: COPY.rescheduleEvent }).click();
    await row.getByLabel(COPY.rescheduleStart).fill("20:30");
    await row.getByLabel(COPY.rescheduleEnd).fill("22:00");
    await row.getByRole("button", { name: COPY.confirmReschedule }).click();
    await expect(item.getByText(COPY.exceptionUpdatedNotice)).toBeVisible();
    // Regenerating materializes the rescheduled occurrence and keeps it:
    // the new-time row appears once, and a second generate creates nothing.
    const dateSlash = wallDate.replaceAll("-", "/");
    await item.getByRole("button", { name: COPY.generateEvents }).click();
    await expect(
      item.getByText(new RegExp(`${dateSlash}\\s*20:30`, "u")).first()
    ).toBeVisible();
    await item.getByRole("button", { name: COPY.generateEvents }).click();
    await expect(item.getByText(/已產生 0 場聚會，跳過 [1-9]/u)).toBeVisible();
  });

  test("E2E-21 per-event 取消該次 suppresses an occurrence; 恢復該次 restores it (C1, C3)", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_STAFF_USERNAME", STAFF_USER),
      required("PROGRAMS_STAFF_CREDENTIAL", STAFF_CRED)
    );
    const { programId, programName } = await setupProgram(page);
    const item = innermostLiWith(page, programName);
    await openProgramTask(item, COPY.programEvents);
    await addTuesdayRuleAndGenerate(item);
    const row = eventRowAt(item, page, "19:30");
    // 取消該次 adds a CANCEL exception for the occurrence's wall date.
    await row.getByRole("button", { name: COPY.cancelOccurrence }).click();
    await row
      .getByRole("button", { name: COPY.confirmCancelOccurrence })
      .click();
    await expect(item.getByText(COPY.exceptionUpdatedNotice)).toBeVisible();
    await expect(
      row.getByRole("button", { name: COPY.restoreOccurrence })
    ).toBeVisible();
    // Regenerate suppresses: nothing new is materialized; the row is intact.
    await item.getByRole("button", { name: COPY.generateEvents }).click();
    await expect(item.getByText(/已產生 0 場聚會，跳過 [1-9]/u)).toBeVisible();
    await expect(row.getByText(COPY.eventActive)).toBeVisible();
    // 恢復該次 removes the exception; the occurrence control returns.
    await row.getByRole("button", { name: COPY.restoreOccurrence }).click();
    await expect(item.getByText(COPY.exceptionRemovedNotice)).toBeVisible();
    await expect(
      row.getByRole("button", { name: COPY.cancelOccurrence })
    ).toBeVisible();
    // Server contract (the UI cannot show an un-materialized occurrence): a
    // CANCEL exception suppresses the next Thursday, DELETE restores it.
    const rule = await page.request.post(
      `/api/v1/programs/${programId}/schedule-rules`,
      {
        data: {
          recurrence: "WEEKLY",
          day_of_week: 4,
          month_day: null,
          start_time: "20:00",
          end_time: "21:00",
        },
      }
    );
    expect(rule.status()).toBe(201);
    const ruleId = (
      (await rule.json()) as { data: { rule: { rule_id: string } } }
    ).data.rule.rule_id;
    const thursday = nextWallWeekday(hkWallToday(), 4);
    const exception = await page.request.post(
      `/api/v1/programs/${programId}/schedule-rules/${ruleId}/exceptions`,
      { data: { override_date: thursday, action: "CANCEL" } }
    );
    expect(exception.status()).toBe(201);
    const exceptionId = (
      (await exception.json()) as {
        data: { exception: { exception_id: string } };
      }
    ).data.exception.exception_id;
    const first = await page.request.post(
      `/api/v1/programs/${programId}/events/generate`,
      { data: {} }
    );
    expect(first.status()).toBe(200);
    const suppressed = await listEventsVia(page, programId);
    expect(
      suppressed.some((e) => e.starts_at === hkWallToUtc(thursday, "20:00"))
    ).toBe(false);
    const removed = await page.request.delete(
      `/api/v1/programs/${programId}/schedule-rules/${ruleId}/exceptions/${exceptionId}`
    );
    expect(removed.status()).toBe(200);
    const second = await page.request.post(
      `/api/v1/programs/${programId}/events/generate`,
      { data: {} }
    );
    expect(second.status()).toBe(200);
    const restored = await listEventsVia(page, programId);
    expect(
      restored.some((e) => e.starts_at === hkWallToUtc(thursday, "20:00"))
    ).toBe(true);
  });

  test("E2E-22 per-event 取消活動 needs a reason; Cancelled status + reason visible; repeat cancel is quiet (C1, C3)", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_STAFF_USERNAME", STAFF_USER),
      required("PROGRAMS_STAFF_CREDENTIAL", STAFF_CRED)
    );
    const { programId, programName } = await setupProgram(page);
    const item = innermostLiWith(page, programName);
    await openProgramTask(item, COPY.programEvents);
    await addTuesdayRuleAndGenerate(item);
    const row = eventRowAt(item, page, "19:30");
    const reasonInput = row.getByLabel(COPY.cancelReason);
    // The reason is mandatory: an empty submit never reaches the confirm step.
    await expect(reasonInput).toHaveAttribute("required", "");
    await row.getByRole("button", { name: COPY.cancelEvent }).click();
    await expect(
      row.getByText(COPY.cancelEventConfirm)
    ).toHaveCount(0);
    const reason = "惡劣天氣";
    await reasonInput.fill(reason);
    await row.getByRole("button", { name: COPY.cancelEvent }).click();
    await expect(row.getByText(COPY.cancelEventConfirm)).toBeVisible();
    await row.getByRole("button", { name: COPY.confirmCancelEvent }).click();
    await expect(item.getByText(COPY.eventCancelledNotice)).toBeVisible();
    await expect(
      row.getByText(COPY.eventCancelled, { exact: true })
    ).toBeVisible();
    await expect(
      row.getByText(`${COPY.cancelledReasonLabel}${reason}`)
    ).toBeVisible();
    // The cancel affordance disappears for a Cancelled event.
    await expect(
      row.getByRole("button", { name: COPY.cancelEvent })
    ).toHaveCount(0);
    // Server contract: a repeat cancel is a quiet 200 (EVT-9).
    const events = await listEventsVia(page, programId);
    const eventId = events[0]?.event_id;
    expect(eventId).toBeTruthy();
    const repeat = await page.request.patch(
      `/api/v1/programs/${programId}/events/${eventId}`,
      { data: { reason: "重複取消" } }
    );
    expect(repeat.status()).toBe(200);
  });
});
