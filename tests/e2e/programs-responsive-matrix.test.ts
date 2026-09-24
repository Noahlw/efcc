import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

const TARGET_URL = process.env.PROGRAMS_TARGET_URL ?? "http://127.0.0.1:8787";
const TARGET_ORIGIN = new URL(TARGET_URL).origin;
const ADMIN = {
  username: process.env.PROGRAMS_ADMIN_USERNAME ?? "E2E_admin",
  credential: process.env.PROGRAMS_ADMIN_CREDENTIAL ?? "E2E_admin!dev",
};
const MEMBER = {
  username: process.env.PROGRAMS_MEMBER_USERNAME ?? "E2E_member",
  credential: process.env.PROGRAMS_MEMBER_CREDENTIAL ?? "E2E_member!dev",
};

const COPY = {
  login: "登入",
  catalogSearch: "搜尋課程",
  catalogClearSearch: "清除搜尋與篩選",
  managementSettings: "課程設定",
  managementNotifications: "開啟管理通知",
  notificationsDialog: "管理通知",
  settingsBasics: "課程基本資料",
  programName: "課程名稱",
  programDescription: "課程簡介",
  enroll: "報名",
  workspaceOverview: "概覽",
  workspaceEvents: "聚會",
  workspaceParticipants: "參與者",
  attendanceRosterTitle: "簽到名單",
  attendanceStatusActive: "開放簽到",
  attendanceOperatorTitle: "聚會簽到管理",
  attendanceCamera: "使用相機掃描 QR",
  attendanceCheckInMember: "替成員簽到",
  attendanceFilterLabel: "出席名單檢視",
  attendanceFilterAll: "全部",
  attendanceAdditionalTitle: "訪客／額外記錄",
};
const ROSTER_PROJECT_SUFFIX = "-roster";
const ROSTER_TEST_TITLE = "attendance roster remains scannable at phone widths";
const ROSTER_MEMBER_NAMES = [
  "陳美玲",
  "黃志明",
  "李淑芬",
  "王俊傑",
  "林雅婷",
  "張家豪",
  "劉怡君",
  "蔡承恩",
  "楊舒涵",
  "吳冠廷",
  "鄭惠文",
  "周柏翰",
  "徐婉庭",
  "何宗翰",
  "許雅雯",
  "曾國維",
  "洪婕妤",
  "郭子謙",
  "鄧詠晴",
  "梁文傑",
  "葉欣怡",
  "蘇柏宇",
  "謝宜蓁",
  "馬志豪",
  "趙心妍",
  "方品妤",
  "朱柏霖",
  "高雅琪",
  "羅世勳",
  "江語柔",
] as const;
const ROSTER_GUEST_NAMES = [
  "訪客 蔡怡安",
  "訪客 陳昱廷",
  "訪客 王欣怡",
] as const;
const REQUIRED_VIEWPORT_WIDTHS: Record<string, number> = {
  "phone-320": 320,
  "phone-360": 360,
  "phone-390": 390,
  "phone-402": 402,
  "phone-360-roster": 360,
  "phone-390-roster": 390,
  "phone-402-roster": 402,
  "phone-600": 600,
  "phone-799": 799,
  "desktop-800": 800,
  "desktop-1024": 1024,
  "desktop-1440": 1440,
};

type PlaywrightRequest = {
  request: {
    newContext(options?: object): Promise<APIRequestContext>;
  };
};

type Fixture = {
  programId: string;
  programName: string;
  eventId: string;
  attendanceRoster?: {
    memberNames: readonly string[];
    guestNames: readonly string[];
  };
};

type Geometry = {
  expectedWidth: number;
  innerWidth: number;
  innerHeight: number;
  bodyScrollWidth: number;
  documentScrollWidth: number;
  outletPaddingBottom: number;
  dockPosition: string | null;
  dockTop: number | null;
  dockBottom: number | null;
  dockHeight: number | null;
  activeIndicator: {
    display: string;
    width: number;
    height: number;
    borderRadius: number;
  } | null;
  screenIconCount: number;
  minimumScreenIconWidth: number;
  minimumScreenIconHeight: number;
  maximumScreenIconCircleDelta: number;
  visibleControlCount: number;
  minimumControlWidth: number;
  minimumControlHeight: number;
};

function configuredViewport(testInfo: TestInfo): {
  width: number;
  height: number;
} {
  const expectedWidth = REQUIRED_VIEWPORT_WIDTHS[testInfo.project.name];
  const viewport = testInfo.project.use.viewport;
  if (
    expectedWidth === undefined ||
    viewport === null ||
    viewport === undefined ||
    viewport.width !== expectedWidth ||
    typeof viewport.height !== "number"
  ) {
    throw new Error(
      `T05.6 project ${testInfo.project.name} must configure its required viewport`
    );
  }
  return { width: expectedWidth, height: viewport.height };
}

let fixture: Fixture | null = null;
let fixtureAdminApi: APIRequestContext | null = null;

async function loginWithPlaywright(
  playwright: PlaywrightRequest,
  identity: { username: string; credential: string }
): Promise<{ api: APIRequestContext }> {
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
  return {
    api: await playwright.request.newContext({
      baseURL: TARGET_URL,
      extraHTTPHeaders: { Cookie: cookie, Origin: TARGET_ORIGIN },
    }),
  };
}

async function loginAs(page: Page, identity: typeof ADMIN): Promise<void> {
  await page.goto("/");
  await page.locator('input[autocomplete="username"]').fill(identity.username);
  await page
    .locator('input[autocomplete="current-password"]')
    .fill(identity.credential);
  await page.getByRole("button", { name: COPY.login }).click();
  await page.waitForURL((url) => url.pathname !== "/");
}

async function createFixture(
  api: APIRequestContext,
  suffix: string,
  options: { includeAttendanceRoster?: boolean } = {}
): Promise<Fixture> {
  const departmentResponse = await api.post("/api/v1/programs/departments", {
    data: {
      code: `E2E_T05R_${suffix}`,
      name: `E2E_T05R Responsive ${suffix}`,
      lifecycle: "Active",
    },
  });
  expect(departmentResponse.status()).toBe(201);
  const departmentBody = (await departmentResponse.json()) as {
    data: { department: { department_id: string } };
  };
  const departmentId = departmentBody.data.department.department_id;
  const moduleKeys = ["program_catalog", "events", "enrollment"];
  if (options.includeAttendanceRoster) {
    moduleKeys.push("attendance");
  }
  for (const moduleKey of moduleKeys) {
    const moduleResponse = await api.post(
      `/api/v1/programs/departments/${departmentId}/modules/${moduleKey}/enable`
    );
    expect(moduleResponse.status()).toBe(200);
  }
  const programName = `E2E_T05R Program ${suffix} with responsive copy`;
  const programResponse = await api.post(
    `/api/v1/programs/departments/${departmentId}/programs`,
    {
      data: {
        name: programName,
        description:
          "A deterministic responsive fixture with enough copy to exercise wrapping without changing domain state.",
        category: "T05 Responsive",
        behavior_type: "Recurring",
        lifecycle: "Active",
        discoverability: "Listed",
        enrollment_mode: "MemberRequest",
      },
    }
  );
  expect(programResponse.status()).toBe(201);
  const programBody = (await programResponse.json()) as {
    data: { program: { program_id: string } };
  };
  const promotionResponse = await api.patch(
    `/api/v1/programs/${programBody.data.program.program_id}`,
    {
      data: { lifecycle: "Active", discoverability: "Listed" },
    }
  );
  expect(promotionResponse.status()).toBe(200);
  const eventIsOpen = options.includeAttendanceRoster === true;
  const hourMs = 60 * 60 * 1000;
  const now = Date.now();
  const eventResponse = await api.post(
    `/api/v1/programs/${programBody.data.program.program_id}/events`,
    {
      data: {
        name: `E2E_T05R Event ${suffix} with responsive copy`,
        location: "Responsive test venue",
        starts_at: new Date(
          now + (eventIsOpen ? -1 : 24) * hourMs
        ).toISOString(),
        ends_at: new Date(now + (eventIsOpen ? 24 : 25) * hourMs).toISOString(),
        ...(eventIsOpen
          ? {
              check_in_window_opens_at: new Date(
                now - 2 * hourMs
              ).toISOString(),
              check_in_window_closes_at: new Date(
                now + 25 * hourMs
              ).toISOString(),
            }
          : {}),
      },
    }
  );
  expect(eventResponse.status()).toBe(201);
  const eventBody = (await eventResponse.json()) as {
    data: {
      event: {
        event_id: string;
        manual_check_in_code: string | null;
      };
    };
  };
  const fixture: Fixture = {
    programId: programBody.data.program.program_id,
    programName,
    eventId: eventBody.data.event.event_id,
  };
  if (!options.includeAttendanceRoster) {
    return fixture;
  }

  const memberPrefix = `E2E_T05R_${suffix}_member_`;
  const memberCredentials = ROSTER_MEMBER_NAMES.map((name, index) => ({
    name,
    username: `${memberPrefix}${String(index + 1).padStart(2, "0")}`,
    password: `E2E_T05R_${suffix}!${String(index + 1).padStart(2, "0")}`,
    phone: `9${String(7_000_000 + index).padStart(7, "0")}`,
  }));
  for (const member of memberCredentials) {
    const registrationResponse = await api.post("/api/v1/auth/register", {
      headers: {
        "Idempotency-Key": `${member.username}-registration`,
      },
      data: {
        username: member.username,
        password: member.password,
        name: member.name,
        phone: member.phone,
      },
    });
    expect(registrationResponse.status()).toBe(200);
  }

  const pendingResponse = await api.get(
    "/api/v1/auth/registrations?status=Pending"
  );
  expect(pendingResponse.status()).toBe(200);
  const pendingBody = (await pendingResponse.json()) as {
    data: {
      registrations: Array<{
        requestId: string;
        username: string;
      }>;
    };
  };
  const registrationsByUsername = new Map(
    pendingBody.data.registrations.map((registration) => [
      registration.username,
      registration,
    ])
  );
  const registrationIds = memberCredentials.map((member) => {
    const registration = registrationsByUsername.get(member.username);
    expect(
      registration,
      `pending registration for ${member.username}`
    ).toBeDefined();
    if (!registration) {
      throw new Error(`Missing pending registration for ${member.username}`);
    }
    return registration.requestId;
  });
  const approvalResponse = await api.post(
    "/api/v1/auth/registrations/approve-batch",
    {
      headers: {
        "Idempotency-Key": `${suffix}-responsive-roster-approval`,
      },
      data: { requestIds: registrationIds },
    }
  );
  expect(approvalResponse.status()).toBe(200);

  const accountsResponse = await api.get(
    `/api/v1/programs/accounts?q=${encodeURIComponent(
      memberPrefix
    )}&status=Active&limit=50`
  );
  expect(accountsResponse.status()).toBe(200);
  const accountsBody = (await accountsResponse.json()) as {
    data: {
      accounts: {
        userId: string;
        username: string | null;
        name: string;
      }[];
    };
  };
  const accountsByUsername = new Map(
    accountsBody.data.accounts
      .filter(
        (account): account is typeof account & { username: string } =>
          typeof account.username === "string"
      )
      .map((account) => [account.username, account])
  );
  expect(accountsByUsername.size).toBe(ROSTER_MEMBER_NAMES.length);

  for (const member of memberCredentials) {
    const account = accountsByUsername.get(member.username);
    expect(account, `active account for ${member.username}`).toBeDefined();
    if (!account) {
      throw new Error(`Missing active account for ${member.username}`);
    }
    const enrollmentResponse = await api.post(
      `/api/v1/programs/${fixture.programId}/enrollments`,
      {
        headers: {
          "Idempotency-Key": `${member.username}-enrollment`,
        },
        data: { member_user_id: account.userId },
      }
    );
    expect(enrollmentResponse.status()).toBe(201);
  }

  const manualCode = eventBody.data.event.manual_check_in_code;
  expect(manualCode, "open fixture event manual check-in code").toBeTruthy();
  for (const [index, name] of ROSTER_GUEST_NAMES.entries()) {
    const guestResponse = await api.post("/api/v1/attendance/guest", {
      headers: {
        "Idempotency-Key": `${suffix}-responsive-roster-guest-${index + 1}`,
      },
      data: {
        event_id: fixture.eventId,
        method: "guest_manual_code",
        name,
        phone: `9${String(8_000_000 + index).padStart(7, "0")}`,
        manual_code: manualCode,
      },
    });
    expect(guestResponse.status()).toBe(201);
  }

  const materializeResponse = await api.post(
    `/api/v1/attendance/events/${fixture.eventId}/materialize`,
    {
      headers: {
        "Idempotency-Key": `${suffix}-responsive-roster-materialize`,
      },
    }
  );
  expect(materializeResponse.status()).toBe(200);
  return {
    ...fixture,
    attendanceRoster: {
      memberNames: ROSTER_MEMBER_NAMES,
      guestNames: ROSTER_GUEST_NAMES,
    },
  };
}

async function measure(
  page: Page,
  expectedWidth: number,
  scopeSelector = "main"
): Promise<Geometry> {
  return page.evaluate(
    ({ expectedWidth, scopeSelector }) => {
      const visible = (element: Element): element is HTMLElement => {
        const htmlElement = element as HTMLElement;
        const box = htmlElement.getBoundingClientRect();
        const style = getComputedStyle(htmlElement);
        return (
          box.width > 0 &&
          box.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          htmlElement.getAttribute("aria-hidden") !== "true" &&
          !htmlElement.closest("[hidden]")
        );
      };
      const controlRoot = document.querySelector(scopeSelector) ?? document;
      const controls = [
        ...controlRoot.querySelectorAll("a, button, input, select, textarea"),
      ].filter(visible);
      const sizes = controls.map((element) => {
        const box = element.getBoundingClientRect();
        return { width: box.width, height: box.height };
      });
      const dock = document.querySelector<HTMLElement>(".nav-phone");
      const outlet = document.querySelector<HTMLElement>("#shell-content");
      const dockStyle = dock ? getComputedStyle(dock) : null;
      const activeNavItem = document.querySelector<HTMLElement>(
        '#main-navigation [aria-current="page"]'
      );
      const activeIndicatorStyle = activeNavItem
        ? getComputedStyle(activeNavItem, "::before")
        : null;
      const screenIconBoxes = [
        ...document.querySelectorAll<HTMLElement>(
          '[data-screen-icon-button="true"]'
        ),
      ]
        .filter(visible)
        .map((element) => element.getBoundingClientRect());
      const activeIndicator = activeIndicatorStyle
        ? {
            display: activeIndicatorStyle.display,
            width: Number.parseFloat(activeIndicatorStyle.width) || 0,
            height: Number.parseFloat(activeIndicatorStyle.height) || 0,
            borderRadius:
              Number.parseFloat(activeIndicatorStyle.borderTopLeftRadius) || 0,
          }
        : null;
      return {
        expectedWidth,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        bodyScrollWidth: document.body.scrollWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        outletPaddingBottom: outlet
          ? Number.parseFloat(getComputedStyle(outlet).paddingBottom)
          : 0,
        dockPosition: dockStyle?.position ?? null,
        dockTop:
          dock && visible(dock) ? dock.getBoundingClientRect().top : null,
        dockBottom:
          dock && visible(dock) ? dock.getBoundingClientRect().bottom : null,
        dockHeight:
          dock && visible(dock) ? dock.getBoundingClientRect().height : null,
        activeIndicator,
        screenIconCount: screenIconBoxes.length,
        minimumScreenIconWidth:
          screenIconBoxes.length === 0
            ? 0
            : Math.min(...screenIconBoxes.map(({ width }) => width)),
        minimumScreenIconHeight:
          screenIconBoxes.length === 0
            ? 0
            : Math.min(...screenIconBoxes.map(({ height }) => height)),
        maximumScreenIconCircleDelta:
          screenIconBoxes.length === 0
            ? Number.MAX_SAFE_INTEGER
            : Math.max(
                ...screenIconBoxes.map(({ width, height }) =>
                  Math.abs(width - height)
                )
              ),
        visibleControlCount: controls.length,
        minimumControlWidth: Math.min(...sizes.map(({ width }) => width)),
        minimumControlHeight: Math.min(...sizes.map(({ height }) => height)),
      };
    },
    { expectedWidth, scopeSelector }
  );
}

function assertGeometry(
  geometry: Geometry,
  scenario: string,
  options: { requireActiveIndicator?: boolean } = {}
): void {
  const label = `${scenario} @ ${geometry.expectedWidth}px`;
  expect(geometry.innerWidth, label).toBe(geometry.expectedWidth);
  if (geometry.screenIconCount > 0) {
    expect(
      geometry.minimumScreenIconWidth,
      `${label} shell icon width`
    ).toBeGreaterThanOrEqual(44);
    expect(
      geometry.minimumScreenIconHeight,
      `${label} shell icon height`
    ).toBeGreaterThanOrEqual(44);
    expect(
      geometry.maximumScreenIconCircleDelta,
      `${label} shell icon circle geometry`
    ).toBeLessThanOrEqual(1);
  }
  expect(
    geometry.bodyScrollWidth,
    `${label} body overflow`
  ).toBeLessThanOrEqual(geometry.expectedWidth + 1);
  expect(
    geometry.documentScrollWidth,
    `${label} document overflow`
  ).toBeLessThanOrEqual(geometry.expectedWidth + 1);
  expect(
    geometry.visibleControlCount,
    `${label} visible action count`
  ).toBeGreaterThan(0);
  expect(
    geometry.minimumControlWidth,
    `${label} target width`
  ).toBeGreaterThanOrEqual(44);
  expect(
    geometry.minimumControlHeight,
    `${label} target height`
  ).toBeGreaterThanOrEqual(44);
  if (geometry.expectedWidth < 800) {
    expect(
      geometry.outletPaddingBottom,
      `${label} dock clearance`
    ).toBeGreaterThanOrEqual(72);
    expect(geometry.dockPosition, `${label} dock positioning`).toBe("fixed");
    expect(geometry.dockBottom, `${label} dock bottom`).toBe(
      geometry.innerHeight
    );
    expect(geometry.dockHeight, `${label} dock height`).toBeGreaterThanOrEqual(
      72
    );
    expect(geometry.dockTop, `${label} phone dock`).not.toBeNull();
    if (options.requireActiveIndicator ?? true) {
      expect(
        geometry.activeIndicator,
        `${label} active indicator`
      ).not.toBeNull();
      expect(
        geometry.activeIndicator?.display,
        `${label} indicator display`
      ).not.toBe("none");
      expect(geometry.activeIndicator?.width, `${label} indicator width`).toBe(
        18
      );
      expect(
        geometry.activeIndicator?.height,
        `${label} indicator height`
      ).toBe(2);
      expect(
        geometry.activeIndicator?.borderRadius,
        `${label} indicator radius`
      ).toBe(2);
    }
  } else {
    expect(
      geometry.outletPaddingBottom,
      `${label} desktop dock clearance`
    ).toBe(0);
    expect(geometry.dockPosition, `${label} rail positioning`).toBe("sticky");
  }
}

test.beforeAll(async ({ playwright }, workerInfo) => {
  const admin = await loginWithPlaywright(playwright, ADMIN);
  fixtureAdminApi = admin.api;
  fixture = await createFixture(
    fixtureAdminApi,
    crypto.randomUUID().slice(0, 8),
    {
      includeAttendanceRoster: workerInfo.project.name.endsWith(
        ROSTER_PROJECT_SUFFIX
      ),
    }
  );
});

test.afterAll(async () => {
  await fixtureAdminApi?.dispose();
});

test.describe("T05.6 responsive Programs UI matrix", () => {
  test("programs-d1 #9: participant catalog/detail keeps action geometry and dock clearance bounded", async ({
    page,
    browser,
  }, testInfo) => {
    const viewport = configuredViewport(testInfo);
    expect(fixture).not.toBeNull();
    const { eventId, programId, programName } = fixture!;
    const longCopy = testInfo.project.name === "phone-320";
    const longTitle = "超長課程名稱：門徒訓練與社區同行計劃";
    const longDescription =
      "https://example.invalid/programs/this-is-a-deliberately-unbroken-value";
    await loginAs(page, MEMBER);
    if (longCopy) {
      await page.route("**/api/v1/programs/catalog", async (route) => {
        const response = await route.fetch();
        const body = (await response.json()) as {
          data?: {
            catalog?: {
              programs?: {
                program_id?: string;
                name?: string;
                description?: string;
                viewerState?: string;
                nextEventStartsAt?: string | null;
                upcomingEventCount?: number;
              }[];
            }[];
          };
        };
        const target = body.data?.catalog
          ?.flatMap((entry) => entry.programs ?? [])
          .find((program) => program.program_id === programId);
        if (!target) {
          await route.fulfill({ response });
          return;
        }
        target.name = longTitle;
        target.description = longDescription;
        target.viewerState = "withdrawn";
        target.nextEventStartsAt = null;
        target.upcomingEventCount = 0;
        await route.fulfill({ response, json: body });
      });
    }
    await page.goto("/programs");
    const search = page.getByRole("searchbox", { name: COPY.catalogSearch });
    await expect(search).toBeVisible();
    await search.fill("T05-no-matching-program");
    await expect(page.getByText("找不到相關課程")).toBeVisible();
    assertGeometry(
      await measure(page, viewport.width),
      "participant catalog empty search"
    );
    await page
      .getByRole("button", { name: COPY.catalogClearSearch })
      .first()
      .click();
    await expect(search).toHaveValue("");
    const visibleProgramName = longCopy ? longTitle : programName;
    await search.fill(visibleProgramName);
    const programLink = page.getByRole("link", {
      name: new RegExp(visibleProgramName, "u"),
    });
    await expect(programLink).toBeVisible();
    assertGeometry(await measure(page, viewport.width), "participant catalog");
    if (longCopy) {
      await expect(programLink).toContainText(longDescription);
      for (const width of [320, 390, 799, 800]) {
        await page.setViewportSize({ width, height: viewport.height });
        const geometry = await page.evaluate(() => {
          const outlet = document.querySelector<HTMLElement>("#shell-content");
          const card =
            document.querySelector<HTMLElement>("[data-program-row]");
          const title = card?.querySelector<HTMLElement>("[data-program-name]");
          const secondary = title?.nextElementSibling as HTMLElement | null;
          const chevron = card?.querySelector<SVGElement>("svg");
          const search = document.querySelector<HTMLElement>(
            "#programs-catalog-search"
          );
          const filters = document.querySelector<HTMLElement>(
            '[role="group"][aria-label="課程篩選"]'
          );
          if (
            !outlet ||
            !card ||
            !title ||
            !secondary ||
            !chevron ||
            !search ||
            !filters
          ) {
            throw new Error("long-copy geometry fixture is incomplete");
          }
          const right = (element: Element) =>
            element.getBoundingClientRect().right;
          return {
            outletClientWidth: outlet.clientWidth,
            outletScrollWidth: outlet.scrollWidth,
            titleClientWidth: title.clientWidth,
            titleScrollWidth: title.scrollWidth,
            descriptionClientWidth: secondary.clientWidth,
            descriptionScrollWidth: secondary.scrollWidth,
            outletRight: right(outlet),
            cardRight: right(card),
            chevronRight: right(chevron),
            searchRight: right(search),
            filtersRight: right(filters),
          };
        });
        expect(geometry.outletScrollWidth).toBeLessThanOrEqual(
          geometry.outletClientWidth
        );
        expect(geometry.titleScrollWidth).toBeLessThanOrEqual(
          geometry.titleClientWidth
        );
        expect(geometry.descriptionScrollWidth).toBeLessThanOrEqual(
          geometry.descriptionClientWidth
        );
        expect(geometry.chevronRight).toBeLessThanOrEqual(
          geometry.cardRight + 1
        );
        expect(geometry.cardRight).toBeLessThanOrEqual(
          geometry.outletRight + 1
        );
        expect(geometry.searchRight).toBeLessThanOrEqual(
          geometry.outletRight + 1
        );
        expect(geometry.filtersRight).toBeLessThanOrEqual(
          geometry.outletRight + 1
        );
      }
      await page.setViewportSize(viewport);
    }
    await programLink.click();
    await expect(page).toHaveURL(
      new RegExp(`/programs\\?program=${programId}(?:&from=programs)?$`, "u")
    );
    await expect(page.locator("#program-detail-title")).toBeVisible();
    await expect(page.getByRole("button", { name: COPY.enroll })).toBeVisible();
    assertGeometry(await measure(page, viewport.width), "participant detail");

    const eventContext = await browser.newContext({
      baseURL: TARGET_URL,
      viewport,
    });
    const eventPage = await eventContext.newPage();
    try {
      await loginAs(eventPage, ADMIN);
      await eventPage.goto(`/programs?program=${programId}&event=${eventId}`);
      await expect(eventPage.locator("#participant-event-title")).toBeVisible();
      assertGeometry(
        await measure(eventPage, viewport.width),
        "participant event detail"
      );
    } finally {
      await eventContext.close();
    }
  });

  test("programs-d1 #35: management settings keeps composition and controls usable", async ({
    page,
  }, testInfo) => {
    const viewport = configuredViewport(testInfo);
    expect(fixture).not.toBeNull();
    const { programId } = fixture!;
    const assertWorkspaceKeyboardGeometry = async () => {
      const workspace = page.locator(
        'section[aria-labelledby="program-settings-focused-title"], section[aria-labelledby="programs-workspace-title"]'
      );
      await workspace
        .locator("a, button, input, select, textarea")
        .filter({ visible: true })
        .first()
        .focus();
      await page.keyboard.press("Tab");
      const geometry = await workspace.evaluate((workspaceElement) => {
        const outlet = document.querySelector<HTMLElement>("#shell-content");
        const active = document.activeElement;
        if (
          !(workspaceElement instanceof HTMLElement) ||
          !outlet ||
          !(active instanceof HTMLElement) ||
          !workspaceElement.contains(active)
        ) {
          throw new Error(
            "management workspace geometry fixture is incomplete"
          );
        }
        const style = getComputedStyle(active);
        const workspaceBox = workspaceElement.getBoundingClientRect();
        const outletBox = outlet.getBoundingClientRect();
        return {
          focusVisible: active.matches(":focus-visible"),
          outlineWidth: Number.parseFloat(style.outlineWidth),
          boxShadow: style.boxShadow,
          workspaceClientWidth: workspaceElement.clientWidth,
          workspaceScrollWidth: workspaceElement.scrollWidth,
          workspaceLeft: workspaceBox.left,
          workspaceRight: workspaceBox.right,
          outletLeft: outletBox.left,
          outletRight: outletBox.right,
        };
      });
      expect(geometry.focusVisible).toBe(true);
      expect(geometry.outlineWidth >= 2 || geometry.boxShadow !== "none").toBe(
        true
      );
      expect(geometry.workspaceScrollWidth).toBeLessThanOrEqual(
        geometry.workspaceClientWidth + 1
      );
      expect(geometry.workspaceLeft).toBeGreaterThanOrEqual(
        geometry.outletLeft - 1
      );
      expect(geometry.workspaceRight).toBeLessThanOrEqual(
        geometry.outletRight + 1
      );
    };
    await loginAs(page, ADMIN);
    await page.goto(
      `/programs?mode=management&program=${programId}&task=settings`
    );
    await expect(
      page.getByRole("heading", { name: COPY.managementSettings })
    ).toBeVisible();
    await page
      .getByRole("button", { name: new RegExp(COPY.settingsBasics, "u") })
      .click();
    await expect(
      page.getByRole("textbox", { name: COPY.programName })
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: COPY.programDescription })
    ).toBeVisible();
    const workspaceNavigation = page.getByRole("navigation", {
      name: "管理工作",
    });
    await expect(workspaceNavigation).toBeVisible();
    await expect(
      workspaceNavigation.getByRole("link", { name: COPY.workspaceEvents })
    ).toBeVisible();
    await expect(
      workspaceNavigation.getByRole("link", {
        name: COPY.workspaceParticipants,
      })
    ).toBeVisible();

    const notificationsLink = page.getByRole("link", {
      name: COPY.managementNotifications,
    });
    await expect(notificationsLink).toBeVisible();
    await expect(notificationsLink).toHaveAttribute(
      "href",
      "/programs?mode=management&task=notifications"
    );
    await expect(
      page.getByRole("button", { name: COPY.managementNotifications })
    ).toHaveCount(0);
    await assertWorkspaceKeyboardGeometry();

    const managementGeometry = await measure(page, viewport.width);
    expect(
      managementGeometry.screenIconCount,
      `management settings @ ${viewport.width}px shell icon count`
    ).toBeGreaterThan(0);

    assertGeometry(managementGeometry, "management settings");

    await workspaceNavigation
      .getByRole("link", { name: COPY.workspaceOverview, exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "營運" })).toBeVisible({
      timeout: 15000,
    });
    await assertWorkspaceKeyboardGeometry();
    assertGeometry(await measure(page, viewport.width), "management workspace");

    await workspaceNavigation
      .getByRole("link", { name: COPY.workspaceParticipants, exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: COPY.workspaceParticipants,
        exact: true,
      })
    ).toBeVisible({ timeout: 15000 });
    await assertWorkspaceKeyboardGeometry();
    assertGeometry(
      await measure(page, viewport.width),
      "management participants task"
    );

    await page
      .getByRole("link", { name: COPY.workspaceEvents, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: COPY.workspaceEvents, exact: true })
    ).toBeVisible({ timeout: 15000 });
    await assertWorkspaceKeyboardGeometry();
    assertGeometry(
      await measure(page, viewport.width),
      "management events task"
    );
  });
  test(ROSTER_TEST_TITLE, async ({ page }, testInfo) => {
    const viewport = configuredViewport(testInfo);
    expect(testInfo.project.name).toMatch(/-roster$/u);
    if (!fixture?.attendanceRoster) {
      throw new Error(
        "Attendance roster fixture was not created for this project"
      );
    }
    const { eventId, attendanceRoster: rosterFixture } = fixture;

    await loginAs(page, ADMIN);
    await page.goto(`/events?eventId=${encodeURIComponent(eventId)}`);
    const rosterSurface = page.locator(
      "[data-attendance-operator-root='true']"
    );
    await expect(rosterSurface).toBeVisible();

    const screenHeadings = rosterSurface.locator("h1:visible");
    await expect(screenHeadings).toHaveCount(1);
    await expect(screenHeadings).toHaveText(COPY.attendanceRosterTitle);
    await expect(
      rosterSurface
        .locator("header [data-slot='badge']")
        .filter({ hasText: COPY.attendanceStatusActive })
    ).toHaveCount(1);

    const primaryScanActions = rosterSurface
      .locator("section[aria-labelledby='attendance-operations-title']")
      .getByRole("button", {
        name: COPY.attendanceCamera,
        exact: true,
      });
    await expect(primaryScanActions).toHaveCount(1);

    const expectedRows = rosterSurface.locator(
      "[data-attendance-expected-row]"
    );
    await expect(expectedRows).toHaveCount(rosterFixture.memberNames.length, {
      timeout: 15_000,
    });
    for (const name of rosterFixture.memberNames) {
      await expect(
        expectedRows.getByRole("button", { name, exact: true })
      ).toHaveCount(1);
    }
    await expect(
      rosterSurface.getByRole("tablist", {
        name: COPY.attendanceFilterLabel,
      })
    ).toBeVisible();
    await expect(
      rosterSurface.getByRole("tab", { name: /^未簽到 \(/u })
    ).toHaveAttribute("aria-selected", "true");

    const assertFlatRows = async () => {
      const rows = await rosterSurface
        .locator(
          "[data-attendance-expected-row], [data-attendance-additional-row]"
        )
        .evaluateAll((elements) =>
          elements.map((element) => ({
            tagName: element.tagName,
            parentTagName: element.parentElement?.tagName ?? null,
            nestedListItems: element.querySelectorAll("li").length,
            nestedCards: element.querySelectorAll("[data-slot='card']").length,
          }))
        );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows).toEqual(
        rows.map((row) => ({
          ...row,
          tagName: "LI",
          parentTagName: "UL",
          nestedListItems: 0,
          nestedCards: 0,
        }))
      );
      await expect(rosterSurface.locator("[data-slot='card']")).toHaveCount(1);
    };

    const assertNoClippedCopy = async () => {
      const copyContainers = rosterSurface.locator(
        [
          "h1:visible",
          "h2:visible",
          "header p:visible",
          "header [data-slot='button']:visible",
          "section[aria-labelledby='attendance-operations-title'] > p:visible",
          "[data-attendance-expected-row] p:visible",
          "[data-attendance-additional-row] p:visible",
          "[data-attendance-expected-row] [data-slot='button'][data-variant='link']:visible",
          "[data-attendance-additional-row] [data-slot='button'][data-variant='link']:visible",
        ].join(", ")
      );
      const clipped = await copyContainers.evaluateAll((elements) =>
        elements.flatMap((element) => {
          const htmlElement = element as HTMLElement;
          const box = htmlElement.getBoundingClientRect();
          if (box.width <= 0 || box.height <= 0) {
            return [];
          }
          return htmlElement.scrollWidth <= htmlElement.clientWidth + 1
            ? []
            : [
                {
                  text: htmlElement.textContent?.trim() ?? "",
                  scrollWidth: htmlElement.scrollWidth,
                  clientWidth: htmlElement.clientWidth,
                },
              ];
        })
      );
      expect(clipped).toEqual([]);
    };

    await assertFlatRows();
    await assertNoClippedCopy();
    assertGeometry(
      await measure(
        page,
        viewport.width,
        "[data-attendance-operator-root='true']"
      ),
      "attendance roster not-yet view",
      { requireActiveIndicator: false }
    );

    await rosterSurface
      .getByRole("tab", {
        name: new RegExp(`^${COPY.attendanceFilterAll} \\(`, "u"),
      })
      .click();
    const additionalRows = rosterSurface.locator(
      "[data-attendance-additional-row]"
    );
    await expect(
      rosterSurface.getByRole("heading", {
        name: COPY.attendanceAdditionalTitle,
        exact: true,
      })
    ).toBeVisible();
    await expect(additionalRows).toHaveCount(rosterFixture.guestNames.length);
    for (const name of rosterFixture.guestNames) {
      await expect(
        additionalRows.getByRole("button", { name, exact: true })
      ).toHaveCount(1);
    }
    await assertFlatRows();
    await assertNoClippedCopy();
    assertGeometry(
      await measure(
        page,
        viewport.width,
        "[data-attendance-operator-root='true']"
      ),
      "attendance roster all view",
      { requireActiveIndicator: false }
    );
  });
});
