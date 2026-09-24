import {
  expect,
  request,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from "@playwright/test";

import { DEV_ADMIN, DEV_MEMBER, DEV_STAFF } from "./dev-fixtures";
import { resetParticipantEnrollment } from "./participant-enrollment-cleanup";

const TARGET_URL = process.env.PROGRAMS_TARGET_URL ?? "http://127.0.0.1:8787";
const TARGET_ORIGIN = new URL(TARGET_URL).origin;
const COPY = {
  login: "登入",
  pageTitle: "課程",
  pageLead: "尋找合適的課程，查看聚會及報名狀態。",
  enterManagement: "進入管理模式",
  enterParticipant: "返回參與者模式",
  malformedIntent: "連結資料無效",
  detailUnavailable: "無法開啟這個課程",
  detailBack: "課程",
  sessionExpiredLogin: "重新登入",
  backHome: "返回首頁",
  catalogForbidden: "無法載入課程目錄",
  catalogForbiddenHint: "你沒有權限查看課程目錄。",
  catalogRetry: "重新載入",
  catalogList: "課程目錄",
  catalogSearch: "搜尋課程",
  clearSearch: "清除搜尋",
  empty: "找不到相關課程",
  clearFilters: "清除搜尋與篩選",
  filterGroup: "課程篩選",
  all: "全部",
  eligible: "可報名",
  pending: "待審批",
  active: "已參加",
  managerOnly: "由同工安排",
  enrollment: "報名",
  enroll: "報名",
  reEnroll: "重新報名",
  requestPending: "申請已送出，等待課程負責人處理。",
  cancelEnrollment: "退出課程",
  cancelConfirmTitle: "退出課程？",
  cancelConfirmAccept: "退出課程",
  withdrawRequest: "取消申請",
  withdrawConfirmTitle: "取消報名申請？",
  withdrawConfirmAccept: "取消申請",
  scheduleRulesGroup: "時間規則",
  scheduleEventsGroup: "即將舉行",
  nextMeeting: "下一次聚會",
  viewEventDetail: "查看聚會詳情",
  eventTitle: "聚會詳情",
  eventInstructions: "請於簽到時間內前往掃描，確認聚會後完成簽到。",
  checkInAvailable: "可簽到",
  scan: "前往掃描",
  backToOrigin: "返回",
  enrollmentAdvisory: "加入後可查看聚會詳情",
};

interface Identity {
  username: string;
  credential: string;
}

interface NavigationFixture {
  programId: string;
  programName: string;
  managerOnlyProgramName: string;
  unlistedProgramId: string;
  unlistedProgramName: string;
  eventProgramId: string;
  eventProgramName: string;
  eventId: string;
  eventName: string;
  freshMember: Identity;
}

interface ApiEnvelope<T> {
  data: T;
}

let adminApi: APIRequestContext | null = null;
let fixture: NavigationFixture | null = null;

function navigationFixture(): NavigationFixture {
  if (fixture === null) {
    throw new Error("Programs navigation fixture was not seeded");
  }
  return fixture;
}

function idempotencyKey(label: string): string {
  return `programs-navigation-${label}-${crypto.randomUUID()}`;
}

async function responseData<T>(
  response: APIResponse,
  expectedStatus: number
): Promise<T> {
  const body = await response.json().catch(() => null);
  if (response.status() !== expectedStatus) {
    throw new Error(
      `Programs navigation fixture expected HTTP ${expectedStatus}, got ${response.status()}: ${JSON.stringify(body)}`
    );
  }
  if (typeof body !== "object" || body === null || !("data" in body)) {
    throw new Error(
      "Programs navigation fixture received a malformed response"
    );
  }
  return (body as ApiEnvelope<T>).data;
}

async function loginApi(
  playwright: {
    request: { newContext(options?: object): Promise<APIRequestContext> };
  },
  identity: Identity
): Promise<APIRequestContext> {
  const loginContext = await playwright.request.newContext({
    baseURL: TARGET_URL,
  });
  const response = await loginContext.post("/api/v1/auth/login", {
    headers: { Origin: TARGET_ORIGIN },
    data: { username: identity.username, password: identity.credential },
  });
  expect(response.status()).toBe(200);
  const cookie = response
    .headersArray()
    .filter(({ name }) => name.toLowerCase() === "set-cookie")
    .map(({ value }) => value.split(";", 1)[0])
    .join("; ");
  expect(cookie).not.toBe("");
  await loginContext.dispose();
  return playwright.request.newContext({
    baseURL: TARGET_URL,
    extraHTTPHeaders: { Cookie: cookie, Origin: TARGET_ORIGIN },
  });
}

async function loginAs(page: Page, identity: Identity): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/");
  await page.locator('input[autocomplete="username"]').fill(identity.username);
  await page
    .locator('input[autocomplete="current-password"]')
    .fill(identity.credential);
  await page.getByRole("button", { name: COPY.login }).click();
  await page.waitForURL((url) => url.pathname !== "/");
}

async function createProgram(
  departmentId: string,
  name: string,
  enrollmentMode: "MemberRequest" | "ManagerOnly",
  discoverability: "Listed" | "Unlisted"
): Promise<{ programId: string; name: string }> {
  const program = await responseData<{
    program: { program_id: string };
  }>(
    await adminApi!.post(
      `/api/v1/programs/departments/${departmentId}/programs`,
      {
        headers: { "Idempotency-Key": idempotencyKey("program") },
        data: {
          name,
          description: `Disposable navigation parity fixture ${name}.`,
          category: "T05",
          behavior_type: "Recurring",
          lifecycle: "Active",
          discoverability,
          enrollment_mode: enrollmentMode,
        },
      }
    ),
    201
  );
  const programId = program.program.program_id;
  await responseData(
    await adminApi!.patch(`/api/v1/programs/${programId}`, {
      headers: { "Idempotency-Key": idempotencyKey("publish") },
      data: { lifecycle: "Active", discoverability },
    }),
    200
  );
  return { programId, name };
}

async function createEvent(
  programId: string,
  name: string,
  startsAt: string
): Promise<string> {
  const start = Date.parse(startsAt);
  const event = await responseData<{ event: { event_id: string } }>(
    await adminApi!.post(`/api/v1/programs/${programId}/events`, {
      headers: { "Idempotency-Key": idempotencyKey("event") },
      data: {
        starts_at: new Date(start).toISOString(),
        ends_at: new Date(start + 90 * 60_000).toISOString(),
        name,
        location: "E2E Navigation Hall",
        event_type: "訓練",
      },
    }),
    201
  );
  return event.event.event_id;
}

function enrollmentPanel(page: Page) {
  return page.getByRole("region", { name: COPY.enrollment, exact: true });
}

function enrollmentSubmitButton(panel: ReturnType<typeof enrollmentPanel>) {
  return panel.getByRole("button", {
    name: new RegExp(`^(${COPY.enroll}|${COPY.reEnroll})$`, "u"),
  });
}

async function hasManagementCapability(page: Page): Promise<boolean> {
  const response = await page.evaluate(async () => {
    const result = await fetch("/api/v1/programs/access");
    return { status: result.status, body: await result.json() };
  });
  expect(response.status).toBe(200);
  return (response.body as { data: { hasManagementCapability: boolean } }).data
    .hasManagementCapability;
}

function detailBackLink(page: Page) {
  return page
    .getByLabel(COPY.detailBack)
    .getByRole("link", { name: COPY.detailBack, exact: true });
}

test.beforeAll(async ({ playwright }) => {
  adminApi = await loginApi(playwright, DEV_ADMIN);
  const suffix = crypto.randomUUID().slice(0, 8);
  const department = await responseData<{
    department: { department_id: string };
  }>(
    await adminApi.post("/api/v1/programs/departments", {
      headers: { "Idempotency-Key": idempotencyKey("department") },
      data: {
        code: `E2E_NAV_${suffix}`,
        name: `E2E Navigation ${suffix}`,
        lifecycle: "Active",
      },
    }),
    201
  );
  const departmentId = department.department.department_id;
  for (const moduleKey of ["program_catalog", "events", "enrollment"]) {
    await responseData(
      await adminApi.post(
        `/api/v1/programs/departments/${departmentId}/modules/${moduleKey}/enable`,
        { headers: { "Idempotency-Key": idempotencyKey(moduleKey) } }
      ),
      200
    );
  }

  const program = await createProgram(
    departmentId,
    `E2E_NAV_青年_${suffix}`,
    "MemberRequest",
    "Listed"
  );
  const managerOnly = await createProgram(
    departmentId,
    `E2E_NAV_ManagerOnly_${suffix}`,
    "ManagerOnly",
    "Listed"
  );
  const unlisted = await createProgram(
    departmentId,
    `E2E_NAV_Unlisted_${suffix}`,
    "MemberRequest",
    "Unlisted"
  );
  const eventProgram = await createProgram(
    departmentId,
    `E2E_NAV_Event_${suffix}`,
    "MemberRequest",
    "Listed"
  );

  await responseData(
    await adminApi.post(
      `/api/v1/programs/${program.programId}/schedule-rules`,
      {
        headers: { "Idempotency-Key": idempotencyKey("schedule-rule") },
        data: {
          recurrence: "WEEKLY",
          day_of_week: 3,
          start_time: "19:00",
          end_time: "20:00",
          location: "E2E Navigation Hall",
          effective_start_date: new Date(Date.now() - 86_400_000)
            .toISOString()
            .slice(0, 10),
        },
      }
    ),
    201
  );
  const now = Date.now();
  for (let index = 0; index < 8; index += 1) {
    await createEvent(
      program.programId,
      `E2E_NAV_MEETING_${index + 1}_${suffix}`,
      new Date(now + (index + 1) * 60 * 60_000).toISOString()
    );
  }
  const eventName = `E2E_NAV_CHECKIN_${suffix}`;
  const eventId = await createEvent(
    eventProgram.programId,
    eventName,
    new Date(now + 45 * 60_000).toISOString()
  );

  const freshMember = {
    username: `E2E_navigation_${suffix}`,
    credential: "E2E_navigation!dev1",
  };
  const publicApi = await request.newContext({
    baseURL: TARGET_URL,
    extraHTTPHeaders: { Origin: TARGET_ORIGIN },
  });
  try {
    const registration = await publicApi.post("/api/v1/auth/register", {
      headers: { "Idempotency-Key": idempotencyKey("register") },
      data: {
        username: freshMember.username,
        password: freshMember.credential,
        name: `E2E Navigation Member ${suffix}`,
        phone: "555-0200",
      },
    });
    if (!registration.ok()) {
      throw new Error(
        `Programs navigation registration returned HTTP ${registration.status()}: ${await registration.text()}`
      );
    }
    const registrations = await responseData<{
      registrations: { requestId: string; username: string }[];
    }>(await adminApi.get("/api/v1/auth/registrations"), 200);
    const pending = registrations.registrations.find(
      (entry) => entry.username === freshMember.username
    );
    if (!pending) {
      throw new Error("Programs navigation registration was not found");
    }
    const approval = await adminApi.post(
      `/api/v1/auth/registrations/${encodeURIComponent(pending.requestId)}/approve`,
      { headers: { "Idempotency-Key": idempotencyKey("approve-account") } }
    );
    if (!approval.ok()) {
      throw new Error(
        `Programs navigation account approval returned HTTP ${approval.status()}: ${await approval.text()}`
      );
    }
  } finally {
    await publicApi.dispose();
  }

  fixture = {
    programId: program.programId,
    programName: program.name,
    managerOnlyProgramName: managerOnly.name,
    unlistedProgramId: unlisted.programId,
    unlistedProgramName: unlisted.name,
    eventProgramId: eventProgram.programId,
    eventProgramName: eventProgram.name,
    eventId,
    eventName,
    freshMember,
  };
});

test.afterAll(async () => {
  await adminApi?.dispose();
});

test.describe("Programs navigation parity", () => {
  test("programs-d1 #1: Admin enters Participant mode with its Management gateway", async ({
    page,
  }) => {
    await loginAs(page, DEV_ADMIN);
    await page.goto("/programs");
    await expect(
      page.getByRole("heading", { name: COPY.pageTitle })
    ).toBeVisible();
    await expect(page.locator("#programs-mode-panel")).toBeVisible();
    await expect(page.getByText(COPY.pageLead)).toBeVisible();
    expect(await hasManagementCapability(page)).toBe(true);
    await expect(
      page.getByRole("link", { name: COPY.enterManagement })
    ).toBeVisible();
  });

  test("programs-d1 #2: Staff enters Participant mode before management", async ({
    page,
  }) => {
    await loginAs(page, DEV_STAFF);
    await page.goto("/programs");
    await expect(
      page.getByRole("heading", { name: COPY.pageTitle })
    ).toBeVisible();
    await expect(page.locator("#programs-mode-panel")).toBeVisible();
  });

  test("programs-d1 #3: Member has no Management gateway", async ({ page }) => {
    await loginAs(page, DEV_MEMBER);
    await page.goto("/programs");
    await expect(
      page.getByRole("heading", { name: COPY.pageTitle })
    ).toBeVisible();
    expect(await hasManagementCapability(page)).toBe(false);
    await expect(
      page.getByRole("link", { name: COPY.enterManagement })
    ).toHaveCount(0);
  });

  test("programs-d1 #4: Mode switching preserves the Program intent and hash", async ({
    page,
  }) => {
    const current = navigationFixture();
    await loginAs(page, DEV_ADMIN);
    await page.goto(`/programs?program=${current.programId}#overview`);
    await expect(page.locator("#program-detail-title")).toHaveText(
      current.programName
    );
    await page.getByRole("link", { name: COPY.enterManagement }).click();
    await expect(page).toHaveURL(
      new RegExp(
        `/programs\\?mode=management&program=${current.programId}#overview$`,
        "u"
      )
    );
    await expect(
      page.getByRole("heading", { name: current.programName, exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: COPY.pageTitle, exact: true })
    ).toBeVisible();
    await expect(
      page
        .getByRole("banner")
        .getByRole("link", { name: COPY.enterParticipant })
    ).toHaveAttribute("href", `/programs?program=${current.programId}`);

    await page.goBack();
    await expect(page).toHaveURL(
      new RegExp(`/programs\\?program=${current.programId}#overview$`, "u")
    );
    await expect(page.locator("#program-detail-title")).toHaveText(
      current.programName
    );
    await page.goForward();
    await expect(page).toHaveURL(
      new RegExp(
        `/programs\\?mode=management&program=${current.programId}#overview$`,
        "u"
      )
    );
    await page.reload();
    await expect(
      page.getByRole("heading", { name: current.programName, exact: true })
    ).toBeVisible();
    await page
      .getByRole("banner")
      .getByRole("link", { name: COPY.enterParticipant })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/programs\\?program=${current.programId}#overview$`, "u")
    );
    await expect(page.locator("#program-detail-title")).toHaveText(
      current.programName
    );
  });

  test("programs-d1 #5: Malformed Programs intent stays recoverable", async ({
    page,
  }) => {
    await loginAs(page, DEV_ADMIN);
    await page.goto("/programs?mode=sideways#overview");
    await expect(
      page.getByRole("heading", { name: COPY.malformedIntent })
    ).toBeVisible();
    await expect(page).toHaveURL(/\/programs\?mode=sideways#overview$/u);
    await expect(page.getByRole("link", { name: COPY.backHome })).toHaveCount(
      0
    );
  });

  test("programs-d1 #6: Session expiry restores the direct Programs intent", async ({
    page,
  }) => {
    const current = navigationFixture();
    await loginAs(page, DEV_ADMIN);
    const target = `/programs?mode=management&program=${current.programId}#overview`;
    await page.goto(target);
    await page.context().clearCookies();
    await page.reload();
    await expect(page).toHaveURL(/\/$/u);
    const relogin = page.getByRole("button", {
      name: COPY.sessionExpiredLogin,
    });
    await expect(relogin).toBeVisible();
    await relogin.click();
    await page
      .locator('input[autocomplete="username"]')
      .fill(DEV_ADMIN.username);
    await page
      .locator('input[autocomplete="current-password"]')
      .fill(DEV_ADMIN.credential);
    await page.getByRole("button", { name: COPY.login }).click();
    await expect(page).toHaveURL(new URL(target, TARGET_URL).toString());
    await expect(
      page.getByRole("heading", { name: current.programName, exact: true })
    ).toBeVisible();
  });

  test("programs-d1 #7: Member sees Listed and ManagerOnly rows but no Unlisted row", async ({
    page,
  }) => {
    const current = navigationFixture();
    await loginAs(page, DEV_MEMBER);
    await page.goto("/programs");
    const catalog = page.getByRole("list", { name: COPY.catalogList });
    await expect(
      catalog.getByRole("link", { name: new RegExp(current.programName, "u") })
    ).toBeVisible();
    const managerRow = catalog.getByRole("link", {
      name: new RegExp(current.managerOnlyProgramName, "u"),
    });
    await expect(managerRow).toBeVisible();
    await expect(managerRow).toContainText(COPY.managerOnly);
    await expect(
      catalog.getByRole("link", {
        name: new RegExp(current.unlistedProgramName, "u"),
      })
    ).toHaveCount(0);
  });

  test("programs-d1 #8 (presentation-only): Forbidden catalog offers only the Home escape", async ({
    page,
  }) => {
    await loginAs(page, DEV_MEMBER);
    await page.route("**/api/v1/programs/catalog", async (route) => {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          status: 403,
          code: "FORBIDDEN",
          title: "Forbidden",
          detail: COPY.catalogForbiddenHint,
        }),
      });
    });
    await page.goto("/programs");
    await expect(
      page.getByRole("heading", { name: COPY.catalogForbidden })
    ).toBeVisible();
    const home = page.getByRole("link", { name: COPY.backHome });
    await expect(home).toBeVisible();
    await expect(
      page.getByRole("button", { name: COPY.catalogRetry })
    ).toHaveCount(0);
    await home.click();
    await expect(page).toHaveURL(/\/home$/u);
  });

  test("programs-d1 #10: Admin sees the Unlisted fixture through scoped access", async ({
    page,
  }) => {
    const current = navigationFixture();
    await loginAs(page, DEV_ADMIN);
    await page.goto("/programs");
    expect(await hasManagementCapability(page)).toBe(true);
    await expect(
      page.getByRole("link", {
        name: new RegExp(current.unlistedProgramName, "u"),
      })
    ).toBeVisible();
  });

  test("programs-d1 #11: Relationship filters reflect D1 Eligible, Pending, Active, and All states", async ({
    page,
  }) => {
    const current = navigationFixture();
    await loginAs(page, current.freshMember);
    let pendingRequestId = "";
    const filters = page.getByRole("group", { name: COPY.filterGroup });
    const all = filters.getByRole("button", { name: COPY.all });
    const eligible = filters.getByRole("button", { name: COPY.eligible });
    const pending = filters.getByRole("button", { name: COPY.pending });
    const active = filters.getByRole("button", { name: COPY.active });
    const programRow = page.getByRole("link", {
      name: new RegExp(current.programName, "u"),
    });
    const managerRow = page.getByRole("link", {
      name: new RegExp(current.managerOnlyProgramName, "u"),
    });
    try {
      await page.goto("/programs");
      await expect(all).toHaveAttribute("aria-pressed", "true");
      await eligible.click();
      await expect(programRow).toBeVisible();
      await expect(managerRow).toHaveCount(0);

      await page.goto(`/programs?program=${current.programId}#overview`);
      const requestResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response
            .url()
            .includes(
              `/api/v1/programs/${current.programId}/enrollment-requests`
            )
      );
      await enrollmentSubmitButton(enrollmentPanel(page)).click();
      const submitted = await requestResponse;
      expect(submitted.status()).toBe(201);
      const requestBody = (await submitted.json()) as {
        data: { request: { request_id: string } };
      };
      pendingRequestId = requestBody.data.request.request_id;
      await expect(
        enrollmentPanel(page).getByText(COPY.requestPending)
      ).toBeVisible();

      await page.goto("/programs");
      await pending.click();
      await expect(programRow).toBeVisible();
      await expect(managerRow).toHaveCount(0);
      const decision = await adminApi!.post(
        `/api/v1/programs/${current.programId}/enrollment-requests/${pendingRequestId}/decision`,
        {
          headers: { "Idempotency-Key": idempotencyKey("approve-enrollment") },
          data: { action: "Approved" },
        }
      );
      await responseData<{ enrollment: { status: string } }>(decision, 200);

      await page.goto("/programs");
      await active.click();
      await expect(programRow).toBeVisible();
      await expect(managerRow).toHaveCount(0);
      await all.click();
      await expect(programRow).toBeVisible();
      await expect(managerRow).toBeVisible();
    } finally {
      await page.goto(`/programs?program=${current.programId}#overview`);
      await resetParticipantEnrollment(page, enrollmentPanel(page), {
        cancelEnrollment: COPY.cancelEnrollment,
        cancelConfirmTitle: COPY.cancelConfirmTitle,
        cancelConfirmAccept: COPY.cancelConfirmAccept,
        withdrawRequest: COPY.withdrawRequest,
        withdrawConfirmTitle: COPY.withdrawConfirmTitle,
        withdrawConfirmAccept: COPY.withdrawConfirmAccept,
        enroll: COPY.enroll,
        reEnroll: COPY.reEnroll,
      });
    }
  });

  test("programs-d1 #12: Clearing catalog search restores the same rows", async ({
    page,
  }) => {
    const current = navigationFixture();
    await loginAs(page, DEV_MEMBER);
    await page.goto("/programs");
    const listedRow = page.getByRole("link", {
      name: new RegExp(current.programName, "u"),
    });
    const managerRow = page.getByRole("link", {
      name: new RegExp(current.managerOnlyProgramName, "u"),
    });
    await expect(listedRow).toBeVisible();
    await expect(managerRow).toBeVisible();
    await page
      .getByRole("searchbox", { name: COPY.catalogSearch })
      .fill("青年");
    await expect(listedRow).toBeVisible();
    await expect(managerRow).toHaveCount(0);
    await page.getByRole("button", { name: COPY.clearSearch }).click();
    await expect(listedRow).toBeVisible();
    await expect(managerRow).toBeVisible();
  });

  test("programs-d1 #13: Empty catalog search recovers when cleared", async ({
    page,
  }) => {
    const current = navigationFixture();
    await loginAs(page, DEV_MEMBER);
    await page.goto("/programs");
    await page
      .getByRole("searchbox", { name: COPY.catalogSearch })
      .fill(`E2E_NAV_NO_MATCH_${crypto.randomUUID()}`);
    await expect(page.getByRole("heading", { name: COPY.empty })).toBeVisible();
    await page.getByRole("button", { name: COPY.clearFilters }).click();
    await expect(
      page.getByRole("link", { name: new RegExp(current.programName, "u") })
    ).toBeVisible();
  });

  test("programs-d1 #15: Program detail refresh, focus, schedule, and seven widths remain stable", async ({
    page,
  }) => {
    const current = navigationFixture();
    await loginAs(page, DEV_MEMBER);
    await page.goto("/programs");
    const row = page.getByRole("link", {
      name: new RegExp(current.programName, "u"),
    });
    await row.focus();
    await row.click();
    await expect(page.locator("#program-detail-title")).toHaveText(
      current.programName
    );
    await detailBackLink(page).click();
    await expect(page).toHaveURL(/\/programs$/u);
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.activeElement instanceof HTMLElement
            ? (document.activeElement.dataset.programId ?? null)
            : null
        )
      )
      .toBe(current.programId);

    await page.goto(`/programs?program=${current.programId}#overview`);
    await expect(page.locator("#program-detail-title")).toHaveText(
      current.programName
    );
    await expect(
      page.getByRole("heading", { name: COPY.nextMeeting, exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: COPY.scheduleRulesGroup })
    ).toBeVisible();
    await expect(
      page.getByText(COPY.enrollmentAdvisory, { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: COPY.viewEventDetail })
    ).toHaveCount(0);
    const events = page.getByRole("list", { name: COPY.scheduleEventsGroup });
    await expect(events).toBeVisible();
    for (const [width, height] of [
      [320, 812],
      [375, 844],
      [390, 844],
      [414, 844],
      [799, 900],
      [800, 900],
      [1440, 900],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect(events.getByRole("listitem")).toHaveCount(
        width < 800 ? 4 : 8
      );
    }
    await page.reload();
    await expect(page.locator("#program-detail-title")).toHaveText(
      current.programName
    );
    await detailBackLink(page).click();
    await expect(page).toHaveURL(/\/programs#overview$/u);
    await expect(row).toBeVisible();
  });

  test("programs-d1 #16: Unlisted detail stays private and returns to the catalog", async ({
    page,
  }) => {
    const current = navigationFixture();
    await loginAs(page, DEV_MEMBER);
    await page.goto(`/programs?program=${current.unlistedProgramId}#overview`);
    await expect(
      page.getByRole("heading", { name: COPY.detailUnavailable })
    ).toBeVisible();
    await expect(page.getByText(current.unlistedProgramId)).toHaveCount(0);
    await expect(page.getByText(current.unlistedProgramName)).toHaveCount(0);
    await detailBackLink(page).click();
    await expect(page).toHaveURL(/\/programs#overview$/u);
    await expect(
      page.getByRole("heading", { name: COPY.pageTitle })
    ).toBeVisible();
  });

  test("programs-d1 #17: Active Event detail preselects the scanner and restores state", async ({
    page,
  }) => {
    const current = navigationFixture();
    let eventWindowOpened = false;
    const originalWindow = {
      eventId: current.eventId,
      opensAt: null,
      closesAt: null,
    };
    await loginAs(page, current.freshMember);
    const programUrl = `/programs?program=${current.eventProgramId}#overview`;
    try {
      await page.goto(programUrl);
      const enrollment = enrollmentPanel(page);
      await resetParticipantEnrollment(page, enrollment, {
        cancelEnrollment: COPY.cancelEnrollment,
        cancelConfirmTitle: COPY.cancelConfirmTitle,
        cancelConfirmAccept: COPY.cancelConfirmAccept,
        withdrawRequest: COPY.withdrawRequest,
        withdrawConfirmTitle: COPY.withdrawConfirmTitle,
        withdrawConfirmAccept: COPY.withdrawConfirmAccept,
        enroll: COPY.enroll,
        reEnroll: COPY.reEnroll,
      });
      const requestResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response
            .url()
            .includes(
              `/api/v1/programs/${current.eventProgramId}/enrollment-requests`
            )
      );
      await enrollmentSubmitButton(enrollment).click();
      const requestResponse = await requestResponsePromise;
      expect(requestResponse.status()).toBe(201);
      const requestBody = (await requestResponse.json()) as {
        data: { request: { request_id: string } };
      };
      const decision = await adminApi!.post(
        `/api/v1/programs/${current.eventProgramId}/enrollment-requests/${requestBody.data.request.request_id}/decision`,
        {
          headers: {
            "Idempotency-Key": idempotencyKey("approve-event-member"),
          },
          data: { action: "Approved" },
        }
      );
      await responseData<{ enrollment: { status: string } }>(decision, 200);

      const now = Date.now();
      const openWindow = await adminApi!.patch(
        `/api/v1/programs/${current.eventProgramId}/events/${current.eventId}`,
        {
          headers: { "Idempotency-Key": idempotencyKey("open-event-window") },
          data: {
            check_in_window_opens_at: new Date(now - 15 * 60_000).toISOString(),
            check_in_window_closes_at: new Date(
              now + 90 * 60_000
            ).toISOString(),
          },
        }
      );
      await responseData(openWindow, 200);
      eventWindowOpened = true;

      await page.reload();
      await expect(page.locator("#program-detail-title")).toHaveText(
        current.eventProgramName
      );
      const eventDetail = page.getByRole("link", {
        name: COPY.viewEventDetail,
      });
      await expect(eventDetail).toBeVisible();
      await eventDetail.click();
      await expect
        .poll(() => new URL(page.url()).searchParams.get("event"))
        .toBe(current.eventId);
      await expect(page.locator("#participant-event-title")).toHaveText(
        current.eventName
      );
      await expect(page.getByText(COPY.eventInstructions)).toBeVisible();
      await expect(page.getByText(COPY.checkInAvailable)).toBeVisible();

      const scan = page.getByRole("link", { name: COPY.scan });
      const scanUrl = await scan.getAttribute("href");
      expect(new URL(scanUrl ?? "", TARGET_URL).searchParams.get("event")).toBe(
        current.eventId
      );
      const resolveResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          url.pathname === "/api/v1/attendance/resolve" &&
          url.searchParams.get("event") === current.eventId
        );
      });
      await scan.click();
      await expect(page).toHaveURL(
        new URL(
          `/scanner?event=${encodeURIComponent(current.eventId)}`,
          TARGET_URL
        ).toString()
      );
      const resolveResponse = await resolveResponsePromise;
      expect(resolveResponse.status()).toBe(200);
      const resolved = (await resolveResponse.json()) as {
        data?: { events?: { event_id?: string }[] };
      };
      expect(
        (resolved.data?.events ?? []).map((event) => event.event_id)
      ).toEqual([current.eventId]);

      await page.goBack();
      await expect
        .poll(() => new URL(page.url()).searchParams.get("event"))
        .toBe(current.eventId);
      await page.getByRole("link", { name: COPY.backToOrigin }).click();
      await expect
        .poll(() => new URL(page.url()).searchParams.get("program"))
        .toBe(current.eventProgramId);
    } finally {
      try {
        if (eventWindowOpened) {
          await responseData(
            await adminApi!.patch(
              `/api/v1/programs/${current.eventProgramId}/events/${current.eventId}`,
              {
                headers: {
                  "Idempotency-Key": idempotencyKey("restore-event-window"),
                },
                data: {
                  check_in_window_opens_at: originalWindow.opensAt,
                  check_in_window_closes_at: originalWindow.closesAt,
                },
              }
            ),
            200
          );
        }
      } finally {
        await page.goto(programUrl);
        await resetParticipantEnrollment(page, enrollmentPanel(page), {
          cancelEnrollment: COPY.cancelEnrollment,
          cancelConfirmTitle: COPY.cancelConfirmTitle,
          cancelConfirmAccept: COPY.cancelConfirmAccept,
          withdrawRequest: COPY.withdrawRequest,
          withdrawConfirmTitle: COPY.withdrawConfirmTitle,
          withdrawConfirmAccept: COPY.withdrawConfirmAccept,
          enroll: COPY.enroll,
          reEnroll: COPY.reEnroll,
        });
      }
    }
  });
});
