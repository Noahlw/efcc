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

const ADMIN_USER = process.env.PROGRAMS_ADMIN_USERNAME;
const ADMIN_CRED = process.env.PROGRAMS_ADMIN_CREDENTIAL;
const STAFF_USER = process.env.PROGRAMS_STAFF_USERNAME;
const STAFF_CRED = process.env.PROGRAMS_STAFF_CREDENTIAL;
const MEMBER_USER = process.env.PROGRAMS_MEMBER_USERNAME;
const MEMBER_CRED = process.env.PROGRAMS_MEMBER_CREDENTIAL;

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
  programEvents: "聚會與時間表",
  programEnrollment: "報名",
  programLeaders: "事工負責人",
  noDepartments: "目前沒有部門。新增部門後，就可以開始建立課程。",
  ruleWeekly: "每週",
  confirmRevoke: "確定移除",
  enrollmentDuplicate: "此會友已報名此課程。",
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
  return page
    .locator("li")
    .filter({ has: page.getByText(text, { exact: true }) });
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
  departmentId: string
): Promise<{ programId: string; programName: string }> {
  const programName = `E2E 課程 ${fresh("P")}`;
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname ===
        `/api/v1/programs/departments/${departmentId}/programs` &&
      response.status() === 201
  );
  await openDepartment(page, deptCode);
  await page.getByLabel(COPY.programName).fill(programName);
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
    await expect(page.getByText(COPY.noDepartments)).toBeVisible();
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
    await expect(
      innermostLiWith(memberPage, programName).getByText(
        COPY.enrollmentActive,
        {
          exact: true,
        }
      )
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
          user_id: required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
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
});
