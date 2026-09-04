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
  programName: "課程名稱",
  programDescription: "課程簡介",
  enroll: "報名",
  workspace: "課程工作區",
  workspaceEvents: "聚會",
  workspaceParticipants: "參與者",
};
const REQUIRED_VIEWPORT_WIDTHS: Record<string, number> = {
  "phone-320": 320,
  "phone-390": 390,
  "desktop-1280": 1280,
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
};

type Geometry = {
  expectedWidth: number;
  innerWidth: number;
  bodyScrollWidth: number;
  documentScrollWidth: number;
  outletPaddingBottom: number;
  dockTop: number | null;
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
  suffix: string
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
  for (const moduleKey of ["program_catalog", "events", "enrollment"]) {
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
  const eventResponse = await api.post(
    `/api/v1/programs/${programBody.data.program.program_id}/events`,
    {
      data: {
        name: `E2E_T05R Event ${suffix} with responsive copy`,
        location: "Responsive test venue",
        starts_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        ends_at: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
      },
    }
  );
  expect(eventResponse.status()).toBe(201);
  const eventBody = (await eventResponse.json()) as {
    data: { event: { event_id: string } };
  };
  return {
    programId: programBody.data.program.program_id,
    programName,
    eventId: eventBody.data.event.event_id,
  };
}

async function measure(page: Page, expectedWidth: number): Promise<Geometry> {
  return page.evaluate((expectedWidth) => {
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
    const controls = [
      ...document.querySelectorAll(
        "main a, main button, main input, main select, main textarea"
      ),
    ].filter(visible);
    const sizes = controls.map((element) => {
      const box = element.getBoundingClientRect();
      return { width: box.width, height: box.height };
    });
    const dock = document.querySelector<HTMLElement>(".nav-phone");
    const outlet = document.querySelector<HTMLElement>("#shell-content");
    return {
      expectedWidth,
      innerWidth: window.innerWidth,
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      outletPaddingBottom: outlet
        ? Number.parseFloat(getComputedStyle(outlet).paddingBottom)
        : 0,
      dockTop: dock && visible(dock) ? dock.getBoundingClientRect().top : null,
      visibleControlCount: controls.length,
      minimumControlWidth: Math.min(...sizes.map(({ width }) => width)),
      minimumControlHeight: Math.min(...sizes.map(({ height }) => height)),
    };
  }, expectedWidth);
}

function assertGeometry(geometry: Geometry, scenario: string): void {
  const label = `${scenario} @ ${geometry.expectedWidth}px`;
  expect(geometry.innerWidth, label).toBe(geometry.expectedWidth);
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
    ).toBeGreaterThanOrEqual(84);
    expect(geometry.dockTop, `${label} phone dock`).not.toBeNull();
  } else {
    expect(
      geometry.outletPaddingBottom,
      `${label} desktop dock clearance`
    ).toBe(0);
  }
}

test.beforeAll(async ({ playwright }) => {
  const admin = await loginWithPlaywright(playwright, ADMIN);
  fixtureAdminApi = admin.api;
  fixture = await createFixture(
    fixtureAdminApi,
    crypto.randomUUID().slice(0, 8)
  );
});

test.afterAll(async () => {
  await fixtureAdminApi?.dispose();
});

test.describe("T05.6 responsive Programs UI matrix", () => {
  test("participant catalog/detail keeps action geometry and dock clearance bounded", async ({
    page,
    browser,
  }, testInfo) => {
    const viewport = configuredViewport(testInfo);
    expect(fixture).not.toBeNull();
    const { eventId, programId, programName } = fixture!;
    await loginAs(page, MEMBER);
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
    await search.fill(programName);
    const programLink = page.getByRole("link", {
      name: new RegExp(programName, "u"),
    });
    await expect(programLink).toBeVisible();
    assertGeometry(await measure(page, viewport.width), "participant catalog");
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

  test("management settings keeps composition and controls usable", async ({
    page,
  }, testInfo) => {
    const viewport = configuredViewport(testInfo);
    expect(fixture).not.toBeNull();
    const { programId } = fixture!;
    await loginAs(page, ADMIN);
    await page.goto(
      `/programs?mode=management&program=${programId}&task=settings`
    );
    await expect(
      page.getByRole("heading", { name: COPY.managementSettings })
    ).toBeVisible();
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

    const notificationsButton = page.getByRole("button", {
      name: COPY.managementNotifications,
    });
    await expect(notificationsButton).toBeVisible();
    await notificationsButton.click();
    await expect(
      page.getByRole("dialog", { name: COPY.notificationsDialog })
    ).toBeVisible();
    assertGeometry(
      await measure(page, viewport.width),
      "management attention popover"
    );
    await notificationsButton.click();

    assertGeometry(await measure(page, viewport.width), "management settings");

    await workspaceNavigation
      .getByRole("link", { name: COPY.workspace, exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "營運" })).toBeVisible();
    assertGeometry(await measure(page, viewport.width), "management workspace");

    await page
      .getByRole("link", {
        name: new RegExp(`^${COPY.workspaceParticipants}`, "u"),
      })
      .click();
    await expect(
      page.getByRole("heading", {
        name: COPY.workspaceParticipants,
        exact: true,
      })
    ).toBeVisible();
    assertGeometry(
      await measure(page, viewport.width),
      "management participants task"
    );

    await page
      .getByRole("link", { name: COPY.workspaceEvents, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: COPY.workspaceEvents, exact: true })
    ).toBeVisible();
    assertGeometry(
      await measure(page, viewport.width),
      "management events task"
    );
  });
});
