/* oxlint-disable vitest/prefer-importing-vitest-globals */
import { expect, request, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

import { DEV_ADMIN, DEV_MEMBER } from "./dev-fixtures";

const TARGET_URL = process.env.PROGRAMS_TARGET_URL ?? "http://127.0.0.1:8787";
const TARGET_ORIGIN = new URL(TARGET_URL).origin;
const ADMIN = {
  username: process.env.PROGRAMS_ADMIN_USERNAME ?? DEV_ADMIN.username,
  credential: process.env.PROGRAMS_ADMIN_CREDENTIAL ?? DEV_ADMIN.credential,
};
const MEMBER = {
  username: process.env.PROGRAMS_MEMBER_USERNAME ?? DEV_MEMBER.username,
  credential: process.env.PROGRAMS_MEMBER_CREDENTIAL ?? DEV_MEMBER.credential,
};
const SEED_FEED_NOTICES = process.env.PROGRAMS_FEED_RESULTS_FILE !== undefined;

const LONG_TITLE = "超長課程名稱：門徒訓練與社區同行計劃";
const LONG_COPY =
  "https://example.invalid/pui-05/long-copy-with-no-break-opportunities-長篇內容";
const LONG_FEED_COPY =
  "https://example.invalid/pui-05/feed/long-copy-with-no-break-opportunities-長篇內容";
const HOME_LONG_COPY_WIDTHS = [320, 390, 799, 800] as const;

const COPY = {
  login: "登入",
  homeViewEvent: "查看聚會",
  homeBack: "首頁",
  viewAllMessages: "查看全部",
  churchNews: "教會消息",
  noticesListLabel: "通知清單",
  noticesUnread: "未讀",
  noticesMarkAllRead: "全部標示已讀",
  noticesMarkedAllRead: "已將全部通知標示為已讀",
  profileHeading: "我的帳戶",
  eventInstructions: "請於簽到時間內前往掃描，確認聚會後完成簽到。",
  eventDetailTitle: "聚會詳情",
  checkInAvailable: "可簽到",
  backToOrigin: "返回",
  programDetailBack: "課程",
};

interface Identity {
  username: string;
  credential: string;
}

interface JsonResponse {
  status: () => number;
  json: () => Promise<unknown>;
}

interface Envelope<T> {
  data: T;
}

interface HomeFixture {
  announcementId: string;
  announcementTitle: string;
  eventNoticeTitle: string;
  eventNoticeName: string;
  eventNoticeProgramId: string;
  eventNoticeId: string;
  programNoticeTitle: string;
  programNoticeProgramName: string;
  programNoticeProgramId: string;
  accountNoticeTitle: string;
  exploreProgramId: string;
  exploreProgramName: string;
  eventProgramId: string;
  eventId: string;
  eventName: string;
}

let adminApi: APIRequestContext | null = null;
let memberApi: APIRequestContext | null = null;
let fixture: HomeFixture | null = null;

function homeFixture(): HomeFixture {
  if (fixture === null) {
    throw new Error("Home acceptance fixture was not seeded");
  }
  return fixture;
}

async function responseData<T>(
  response: JsonResponse,
  expectedStatus: number
): Promise<T> {
  const body = await response.json().catch(() => null);
  if (response.status() !== expectedStatus) {
    throw new Error(
      `Home acceptance fixture expected HTTP ${expectedStatus}, got ${response.status()}: ${JSON.stringify(body)}`
    );
  }
  if (typeof body !== "object" || body === null || !("data" in body)) {
    throw new Error(
      "Home acceptance fixture received a malformed API response"
    );
  }
  return (body as Envelope<T>).data;
}

async function loginApi(identity: Identity): Promise<APIRequestContext> {
  const loginContext = await request.newContext({
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
  return await request.newContext({
    baseURL: TARGET_URL,
    extraHTTPHeaders: { Cookie: cookie, Origin: TARGET_ORIGIN },
  });
}

async function loginAs(page: Page, identity: Identity): Promise<void> {
  await page.goto("/");
  await page.locator('input[autocomplete="username"]').fill(identity.username);
  await page
    .locator('input[autocomplete="current-password"]')
    .fill(identity.credential);
  await page.getByRole("button", { name: COPY.login }).click();
  await page.waitForURL((url) => url.pathname !== "/");
}

async function assertHomeCardsFit(page: Page, width: number): Promise<void> {
  const geometry = await page.evaluate(() => {
    const outlet = document.querySelector<HTMLElement>("#shell-content");
    const cards = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-testid="next-event-card"], [data-testid="announcement-card"], [data-testid="explore-card"]'
      ),
    ];
    if (!outlet || cards.length !== 3) {
      throw new Error("Home long-copy geometry fixture is incomplete");
    }
    const visibleText = (element: HTMLElement) =>
      [...element.querySelectorAll<HTMLElement>("h1,h2,p,span")].filter(
        (node) => {
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0
          );
        }
      );
    const outletRect = outlet.getBoundingClientRect();
    return {
      pageScrollWidth: document.documentElement.scrollWidth,
      outletClientWidth: outlet.clientWidth,
      outletScrollWidth: outlet.scrollWidth,
      outletRight: outletRect.right,
      cards: cards.map((card) => {
        const rect = card.getBoundingClientRect();
        return {
          clientWidth: card.clientWidth,
          scrollWidth: card.scrollWidth,
          right: rect.right,
          textOverflow: visibleText(card).some(
            (node) => node.scrollWidth > node.clientWidth
          ),
        };
      }),
    };
  });

  expect(
    geometry.pageScrollWidth,
    `page overflow at ${width}px`
  ).toBeLessThanOrEqual(width + 1);
  expect(
    geometry.outletScrollWidth,
    `Home overflow at ${width}px`
  ).toBeLessThanOrEqual(geometry.outletClientWidth + 1);
  expect(geometry.cards).toHaveLength(3);
  for (const card of geometry.cards) {
    expect(card.scrollWidth, `card overflow at ${width}px`).toBeLessThanOrEqual(
      card.clientWidth + 1
    );
    expect(card.textOverflow, `text overflow at ${width}px`).toBe(false);
    expect(card.right, `card escapes Home at ${width}px`).toBeLessThanOrEqual(
      geometry.outletRight + 1
    );
  }
}

async function assertAnnouncementDetailFits(
  page: Page,
  width: number
): Promise<void> {
  const detail = page.getByTestId("announcement-detail");
  const geometry = await detail.evaluate((element) => {
    const outlet = document.querySelector<HTMLElement>("#shell-content");
    const back = element.querySelector<HTMLElement>("[data-feed-back]");
    const external = element.querySelector<HTMLElement>("[data-feed-external]");
    if (!outlet || !back || !external) {
      throw new Error(
        "Home announcement detail geometry fixture is incomplete"
      );
    }
    const outletRect = outlet.getBoundingClientRect();
    const text = [
      ...element.querySelectorAll<HTMLElement>("h1,h2,p,li"),
    ].filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    return {
      pageScrollWidth: document.documentElement.scrollWidth,
      outletClientWidth: outlet.clientWidth,
      outletScrollWidth: outlet.scrollWidth,
      outletRight: outletRect.right,
      detailClientWidth: element.clientWidth,
      detailScrollWidth: element.scrollWidth,
      textOverflow: text.some((node) => node.scrollWidth > node.clientWidth),
      backRight: back.getBoundingClientRect().right,
      externalRight: external.getBoundingClientRect().right,
    };
  });
  expect(
    geometry.pageScrollWidth,
    `page overflow at ${width}px`
  ).toBeLessThanOrEqual(width + 1);
  expect(geometry.outletScrollWidth).toBeLessThanOrEqual(
    geometry.outletClientWidth + 1
  );
  expect(geometry.detailScrollWidth).toBeLessThanOrEqual(
    geometry.detailClientWidth + 1
  );
  expect(geometry.textOverflow, `detail text overflow at ${width}px`).toBe(
    false
  );
  expect(geometry.backRight).toBeLessThanOrEqual(geometry.outletRight + 1);
  expect(geometry.externalRight).toBeLessThanOrEqual(geometry.outletRight + 1);
  await expect(page.getByRole("button", { name: COPY.homeBack })).toBeVisible();
}

async function assertFeedFits(page: Page, width: number): Promise<void> {
  const feed = page.locator(
    '[data-feed-announcement-owner="global-live-region"]'
  );
  const geometry = await feed.evaluate((element) => {
    const text = [
      ...element.querySelectorAll<HTMLElement>("h1,h2,p,strong,span"),
    ].filter((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return (
        !node.closest(".sr-only") &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    });
    const actions = [...element.querySelectorAll<HTMLElement>("a,button")];
    const feedRect = element.getBoundingClientRect();
    return {
      pageScrollWidth: document.documentElement.scrollWidth,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      textOverflow: text.some((node) => node.scrollWidth > node.clientWidth),
      actionsInside: actions.every((action) => {
        const rect = action.getBoundingClientRect();
        return (
          rect.left >= feedRect.left - 1 && rect.right <= feedRect.right + 1
        );
      }),
      nestedLiveRegions: element.querySelectorAll("[aria-live]").length,
    };
  });
  expect(
    geometry.pageScrollWidth,
    `page overflow at ${width}px`
  ).toBeLessThanOrEqual(width + 1);
  expect(
    geometry.scrollWidth,
    `feed overflow at ${width}px`
  ).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.textOverflow, `feed text overflow at ${width}px`).toBe(false);
  expect(geometry.actionsInside).toBe(true);
  expect(geometry.nestedLiveRegions).toBe(0);
}

test.beforeAll(async () => {
  adminApi = await loginApi(ADMIN);
  memberApi = await loginApi(MEMBER);
  const suffix = crypto.randomUUID().slice(0, 8);

  const departmentData = await responseData<{
    department: { department_id: string };
  }>(
    await adminApi.post("/api/v1/programs/departments", {
      headers: { "Idempotency-Key": `pui05-home-department-${suffix}` },
      data: {
        code: `E2E_PUI05H_${suffix}`,
        name: `E2E PUI-05 Home ${suffix}`,
        lifecycle: "Active",
      },
    }),
    201
  );
  const departmentId = departmentData.department.department_id;
  for (const moduleKey of ["program_catalog", "events", "enrollment"]) {
    await responseData(
      await adminApi.post(
        `/api/v1/programs/departments/${departmentId}/modules/${moduleKey}/enable`,
        { headers: { "Idempotency-Key": `pui05-home-${moduleKey}-${suffix}` } }
      ),
      200
    );
  }

  const programName = `E2E PUI-05 ${LONG_TITLE} ${suffix}`;
  const programData = await responseData<{
    program: { program_id: string };
  }>(
    await adminApi.post(
      `/api/v1/programs/departments/${departmentId}/programs`,
      {
        headers: { "Idempotency-Key": `pui05-home-program-${suffix}` },
        data: {
          name: programName,
          description: LONG_COPY,
          category: "PUI-05",
          behavior_type: "Recurring",
          lifecycle: "Active",
          discoverability: "Listed",
          enrollment_mode: "MemberRequest",
        },
      }
    ),
    201
  );
  const programId = programData.program.program_id;
  await responseData(
    await adminApi.patch(`/api/v1/programs/${programId}`, {
      headers: { "Idempotency-Key": `pui05-home-publish-program-${suffix}` },
      data: { lifecycle: "Active", discoverability: "Listed" },
    }),
    200
  );

  const now = Date.now();
  const eventStart = new Date(now + 30 * 60_000).toISOString();
  const eventEnd = new Date(now + 2 * 60 * 60_000).toISOString();
  const eventData = await responseData<{ event: { event_id: string } }>(
    await adminApi.post(`/api/v1/programs/${programId}/events`, {
      headers: { "Idempotency-Key": `pui05-home-event-${suffix}` },
      data: {
        starts_at: eventStart,
        ends_at: eventEnd,
        name: LONG_TITLE,
        location: LONG_COPY,
        event_type: "訓練",
      },
    }),
    201
  );
  const eventId = eventData.event.event_id;
  await responseData(
    await adminApi.patch(`/api/v1/programs/${programId}/events/${eventId}`, {
      headers: { "Idempotency-Key": `pui05-home-event-window-${suffix}` },
      data: {
        check_in_window_opens_at: new Date(now - 5 * 60_000).toISOString(),
        check_in_window_closes_at: new Date(now + 90 * 60_000).toISOString(),
      },
    }),
    200
  );

  const memberData = await responseData<{
    user: { userId: string };
  }>(await memberApi.get("/api/v1/auth/me"), 200);
  const requestData = await responseData<{
    request: { request_id: string };
  }>(
    await memberApi.post(`/api/v1/programs/${programId}/enrollment-requests`, {
      headers: { "Idempotency-Key": `pui05-home-enrollment-${suffix}` },
      data: {},
    }),
    201
  );
  const decisionData = await responseData<{
    enrollment: { status: string };
  }>(
    await adminApi.post(
      `/api/v1/programs/${programId}/enrollment-requests/${requestData.request.request_id}/decision`,
      {
        headers: { "Idempotency-Key": `pui05-home-approval-${suffix}` },
        data: { action: "Approved" },
      }
    ),
    200
  );
  expect(decisionData.enrollment.status).toBe("Active");

  const announcementId = `E2E_PUI05_HOME_${suffix}`;
  const eventNoticeTitle = `E2E PUI-05 Event ${suffix}`;
  const programNoticeTitle = `E2E PUI-05 Program ${suffix}`;
  const accountNoticeTitle = `${LONG_TITLE} ${suffix}`;
  const draftData = await responseData<{ version: number }>(
    await adminApi.post("/api/v1/home/draft", {
      headers: { "Idempotency-Key": `pui05-home-draft-${suffix}` },
      data: {
        content_id: announcementId,
        template_type: "B",
        publish_mode: "immediate",
        title: LONG_TITLE,
        summary: LONG_COPY,
        body_markdown: LONG_FEED_COPY,
        cta_label: "了解詳情",
        cta_url: "https://example.invalid/pui-05/home-details",
      },
    }),
    200
  );
  await responseData(
    await adminApi.post("/api/v1/home/publish", {
      headers: { "Idempotency-Key": `pui05-home-publish-${suffix}` },
      data: {
        content_id: announcementId,
        version: draftData.version,
        publish_mode: "immediate",
        start_at: null,
        end_at: null,
      },
    }),
    200
  );
  await responseData<{ marked_count: number }>(
    await memberApi.post("/api/v1/programs/notices/read-all"),
    200
  );
  await responseData(
    await adminApi.post("/api/v1/programs/notices", {
      headers: { "Idempotency-Key": `pui05-home-notice-${suffix}` },
      data: {
        member_user_id: memberData.user.userId,
        kind: "account",
        title: accountNoticeTitle,
        body: LONG_FEED_COPY,
      },
    }),
    201
  );
  if (SEED_FEED_NOTICES) {
    for (const notice of [
      {
        kind: "event",
        title: eventNoticeTitle,
        program_id: programId,
        event_id: eventId,
      },
      { kind: "program", title: programNoticeTitle, program_id: programId },
    ]) {
      await responseData(
        await adminApi.post("/api/v1/programs/notices", {
          headers: {
            "Idempotency-Key": `pui05-home-notice-${notice.kind}-${suffix}`,
          },
          data: {
            member_user_id: memberData.user.userId,
            kind: notice.kind,
            title: notice.title,
            body: LONG_FEED_COPY,
            program_id: notice.program_id,
            ...(notice.kind === "event" ? { event_id: notice.event_id } : {}),
          },
        }),
        201
      );
    }
  }

  const homeData = await responseData<{
    featuredEvent: { eventId: string; programId: string; title: string } | null;
    announcement: { contentId: string } | null;
    exploreProgram: { programId: string; title: string } | null;
  }>(await memberApi.get("/api/v1/home"), 200);
  if (homeData.featuredEvent === null) {
    throw new Error("Home acceptance fixture requires a selected next event");
  }
  if (homeData.exploreProgram === null) {
    throw new Error(
      "Home acceptance fixture requires a selected Explore program"
    );
  }
  expect(homeData.announcement?.contentId).toBe(announcementId);
  fixture = {
    announcementId,
    announcementTitle: LONG_TITLE,
    eventNoticeTitle,
    eventNoticeName: LONG_TITLE,
    eventNoticeProgramId: programId,
    eventNoticeId: eventId,
    programNoticeTitle,
    programNoticeProgramName: programName,
    programNoticeProgramId: programId,
    accountNoticeTitle,
    exploreProgramId: homeData.exploreProgram.programId,
    exploreProgramName: homeData.exploreProgram.title,
    eventProgramId: homeData.featuredEvent.programId,
    eventId: homeData.featuredEvent.eventId,
    eventName: homeData.featuredEvent.title,
  };
});

test.afterAll(async () => {
  await adminApi?.dispose();
  await memberApi?.dispose();
});

test.describe("Home and member-feed Browser Acceptance", () => {
  test("PUI-05 case 64: Home cards and announcement detail keep long copy inside the viewport", async ({
    page,
  }) => {
    homeFixture();
    await loginAs(page, MEMBER);
    await page.goto("/home");

    const eventCard = page.getByTestId("next-event-card");
    const announcementCard = page.getByTestId("announcement-card");
    const exploreCard = page.getByTestId("explore-card");
    await expect(eventCard).toBeVisible();
    await expect(announcementCard).toBeVisible();
    await expect(exploreCard).toBeVisible();
    for (const card of [eventCard, announcementCard, exploreCard]) {
      await expect(card).toContainText(LONG_TITLE);
      await expect(card).toContainText(LONG_COPY);
    }

    for (const width of HOME_LONG_COPY_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await assertHomeCardsFit(page, width);
    }

    await announcementCard.click();
    const detail = page.getByTestId("announcement-detail");
    await expect(detail).toBeVisible();
    await expect(detail).toContainText(LONG_TITLE);
    await expect(detail).toContainText(LONG_COPY);
    for (const width of HOME_LONG_COPY_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await assertAnnouncementDetailFits(page, width);
    }
  });

  test("PUI-05 case 65: native Back closes only the announcement overlay and restores the previous route", async ({
    page,
  }) => {
    homeFixture();
    await loginAs(page, MEMBER);
    await page.goto("/programs");
    await page.goto("/home");
    const homePath = new URL(page.url()).pathname;
    expect(homePath).toBe("/home");
    const homeUrl = page.url();
    const historyLength = await page.evaluate(() => window.history.length);

    await page.getByTestId("announcement-card").click();
    await expect(page.getByTestId("announcement-detail")).toBeVisible();
    expect(page.url()).toBe(homeUrl);
    expect(await page.evaluate(() => window.history.length)).toBe(
      historyLength + 1
    );
    expect(
      await page.evaluate(() => window.history.state?.efccOverlay ?? null)
    ).toBe("announcement");

    await page.goBack();
    await expect(page).toHaveURL(/\/home$/u);
    await expect(page.getByTestId("announcement-detail")).toHaveCount(0);
    await expect(page.getByTestId("home-page")).toBeVisible();
    expect(
      await page.evaluate(() => window.history.state?.efccOverlay ?? null)
    ).toBeNull();

    await page.goBack();
    await expect(page).toHaveURL(/\/programs(?:\?.*)?$/u);
  });

  test("PUI-05 case 66: Notices and Messages keep seeded long copy inside the viewport", async ({
    page,
  }) => {
    homeFixture();
    await loginAs(page, MEMBER);
    for (const [route, copy] of [
      ["/notices", LONG_FEED_COPY],
      ["/messages", LONG_COPY],
    ] as const) {
      await page.goto(route);
      const feed = page.locator(
        '[data-feed-announcement-owner="global-live-region"]'
      );
      const list =
        route === "/notices"
          ? feed.getByRole("list", { name: COPY.noticesListLabel })
          : feed.locator("[data-feed-list]");
      await expect(feed).toBeVisible();
      await expect(list).toBeVisible();
      await expect(list).toContainText(LONG_TITLE);
      await expect(list).toContainText(copy);
      for (const width of HOME_LONG_COPY_WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await assertFeedFits(page, width);
      }
    }
  });

  test("PUI-05 case 67: Home next-event opens the selected Event Detail with 可簽到 and returns Home", async ({
    page,
  }) => {
    const current = homeFixture();
    await loginAs(page, MEMBER);
    await page.goto("/home");
    const eventCard = page.getByTestId("next-event-card");
    await expect(eventCard).toBeVisible();
    const eventLink = eventCard.getByRole("link", {
      name: COPY.homeViewEvent,
    });
    const expectedHref = `/programs?program=${encodeURIComponent(current.eventProgramId)}&from=home&event=${encodeURIComponent(current.eventId)}`;
    await expect(eventLink).toHaveAttribute("href", expectedHref);
    await eventLink.click();
    await expect(page).toHaveURL(new URL(expectedHref, TARGET_URL).toString());
    await expect(page.locator("#participant-event-title")).toBeVisible();
    await expect(page.locator("#participant-event-title")).toContainText(
      current.eventName
    );
    await expect(page.getByText(COPY.eventInstructions)).toBeVisible();
    await expect(page.getByText(COPY.checkInAvailable)).toBeVisible();
    await page.getByRole("link", { name: COPY.backToOrigin }).click();
    await expect(page).toHaveURL(/\/home$/u);
    await expect(page.getByTestId("home-page")).toBeVisible();
  });

  test("PUI-05 case 68: Home Explore opens the selected Program Detail and returns Home", async ({
    page,
  }) => {
    const current = homeFixture();
    await loginAs(page, MEMBER);
    await page.goto("/home");
    const exploreCard = page.getByTestId("explore-card");
    await expect(exploreCard).toBeVisible();
    const expectedHref = `/programs?program=${encodeURIComponent(current.exploreProgramId)}&from=home`;
    await expect(exploreCard).toHaveAttribute("href", expectedHref);
    await exploreCard.click();
    await expect(page).toHaveURL(new URL(expectedHref, TARGET_URL).toString());
    const programTitle = page.locator("#program-detail-title");
    await expect(programTitle).toBeVisible();
    await expect(programTitle).toContainText(current.exploreProgramName);
    const back = page.locator(
      'a[data-screen-icon-button="true"][href="/home"]'
    );
    await expect(back).toHaveAttribute("href", "/home");
    await back.click();
    await expect(page).toHaveURL(/\/home$/u);
    await expect(page.getByTestId("home-page")).toBeVisible();
  });
  test("programs-d1 #18: Home 查看全部 opens the Messages list", async ({
    page,
  }) => {
    await loginAs(page, MEMBER);
    await page.goto("/home");
    await page.getByRole("link", { name: COPY.viewAllMessages }).click();
    await expect(page).toHaveURL(/\/messages\/?$/u);
    await expect(
      page.getByRole("heading", { name: COPY.churchNews, exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: new RegExp(LONG_TITLE, "u") })
    ).toBeVisible();
  });

  test("programs-d1 #19: Messages detail Back returns to the same row", async ({
    page,
  }) => {
    const current = homeFixture();
    await loginAs(page, MEMBER);
    await page.goto("/messages");
    const row = page.getByRole("link", {
      name: new RegExp(current.announcementTitle, "u"),
    });
    await expect(row).toBeVisible();
    await row.click();
    await expect(page).toHaveURL(/\/messages\?content=[^&]+&from=messages$/u);
    await expect(page.getByTestId("announcement-detail")).toBeVisible();
    await page.getByRole("button", { name: COPY.churchNews }).click();
    await expect(page).toHaveURL(/\/messages\/?$/u);
    await expect(row).toBeVisible();
  });

  test("programs-d1 #20: Notices show unread timestamps and persist mark-all-read", async ({
    page,
  }) => {
    const current = homeFixture();
    await loginAs(page, MEMBER);
    await page.goto("/notices");
    const list = page.getByRole("list", { name: COPY.noticesListLabel });
    await expect(list).toBeVisible();
    for (const title of [
      current.eventNoticeTitle,
      current.programNoticeTitle,
      current.accountNoticeTitle,
    ]) {
      const row = list.locator("li").filter({ hasText: title });
      await expect(row).toHaveCount(1);
      await expect(row.locator("time")).toHaveCount(1);
      await expect(
        row.getByText(COPY.noticesUnread, { exact: true })
      ).toBeVisible();
    }
    await expect(page.getByText(`3 ${COPY.noticesUnread}`)).toBeVisible();
    await expect(
      list.getByText(COPY.noticesUnread, { exact: true })
    ).toHaveCount(3);

    await page.getByRole("button", { name: COPY.noticesMarkAllRead }).click();
    await expect(
      page.getByRole("status").filter({ hasText: COPY.noticesMarkedAllRead })
    ).toBeVisible();
    await expect(page.getByText(`3 ${COPY.noticesUnread}`)).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("button", { name: COPY.noticesMarkAllRead })
    ).toBeDisabled();
    await expect(
      list.getByText(COPY.noticesUnread, { exact: true })
    ).toHaveCount(0);
  });

  test("programs-d1 #21: Event notice opens its selected Event Detail", async ({
    page,
  }) => {
    const current = homeFixture();
    await loginAs(page, MEMBER);
    await page.goto("/notices");
    await page
      .getByRole("link", { name: new RegExp(current.eventNoticeTitle, "u") })
      .click();
    await expect(page).toHaveURL(
      new RegExp(
        `/programs\\?program=${current.eventNoticeProgramId}&from=notices&event=${current.eventNoticeId}$`,
        "u"
      )
    );
    await expect(
      page.getByRole("region", { name: current.eventNoticeName, exact: true })
    ).toBeVisible();
  });

  test("programs-d1 #22: Event notice detail Back returns to Notices", async ({
    page,
  }) => {
    const current = homeFixture();
    await loginAs(page, MEMBER);
    await page.goto("/notices");
    await page
      .getByRole("link", { name: new RegExp(current.eventNoticeTitle, "u") })
      .click();
    await expect(page).toHaveURL(
      new RegExp(
        `/programs\\?program=${current.eventNoticeProgramId}&from=notices&event=${current.eventNoticeId}$`,
        "u"
      )
    );
    await expect(
      page.getByRole("region", { name: current.eventNoticeName, exact: true })
    ).toBeVisible();
    await page.getByRole("link", { name: COPY.backToOrigin }).click();
    await expect(page).toHaveURL(/\/notices$/u);
    await expect(
      page.getByRole("list", { name: COPY.noticesListLabel })
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: new RegExp(current.eventNoticeTitle, "u"),
      })
    ).toBeVisible();
  });

  test("programs-d1 #23: Program notice opens its selected Program Detail", async ({
    page,
  }) => {
    const current = homeFixture();
    await loginAs(page, MEMBER);
    await page.goto("/notices");
    await page
      .getByRole("link", { name: new RegExp(current.programNoticeTitle, "u") })
      .click();
    await expect(page).toHaveURL(
      new RegExp(
        `/programs\\?program=${current.programNoticeProgramId}&from=notices$`,
        "u"
      )
    );
    await expect(page.locator("#program-detail-title")).toHaveText(
      current.programNoticeProgramName
    );
  });

  test("programs-d1 #24: Account notice opens the profile page", async ({
    page,
  }) => {
    const current = homeFixture();
    await loginAs(page, MEMBER);
    await page.goto("/notices");
    await page
      .getByRole("link", { name: new RegExp(current.accountNoticeTitle, "u") })
      .click();
    await expect(page).toHaveURL(/\/profile$/u);
    await expect(
      page.getByRole("heading", { name: COPY.profileHeading, exact: true })
    ).toBeVisible();
  });
});
