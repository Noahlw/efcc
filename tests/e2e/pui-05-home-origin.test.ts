/* oxlint-disable vitest/prefer-importing-vitest-globals */
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { DEV_ADMIN, DEV_MEMBER } from "./dev-fixtures";
import { resetParticipantEnrollment } from "./participant-enrollment-cleanup";
import { restoreEventWindow } from './participant-event-window';
import type { EventWindowSetup, EventWindowSnapshot } from './participant-event-window';

const ADMIN_USER = process.env.PROGRAMS_ADMIN_USERNAME ?? DEV_ADMIN.username;
const ADMIN_CRED =
  process.env.PROGRAMS_ADMIN_CREDENTIAL ?? DEV_ADMIN.credential;
const MEMBER_USER = process.env.PROGRAMS_MEMBER_USERNAME ?? DEV_MEMBER.username;
const MEMBER_CRED =
  process.env.PROGRAMS_MEMBER_CREDENTIAL ?? DEV_MEMBER.credential;

const COPY = {
  login: "登入",
  pageTitle: "課程與活動",
  detailPurpose: "課程簡介",
  approve: "核准",
  decisionMade: "已處理申請。",
  workspaceTaskParticipants: "參與者",
  requestPendingHint: "申請已送出，等待課程負責人處理。",
  enrollmentActiveHint: "你目前已加入此課程。",
  enroll: "報名",
  reEnroll: "重新報名",
  enrollment: "報名",
  cancelEnrollment: "退出課程",
  cancelConfirmTitle: "退出課程？",
  cancelConfirmAccept: "退出課程",
  withdrawRequest: "取消申請",
  withdrawConfirmTitle: "取消報名申請？",
  withdrawConfirmAccept: "取消申請",
  homeViewEvent: "查看聚會",
  checkInAvailable: "可簽到",
  eventInstructions: "請於簽到時間內前往掃描，確認聚會後完成簽到。",
  backToOrigin: "返回",
  homeBack: "首頁",
};

interface CatalogEntry {
  programs: { program_id: string; name: string }[];
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
}

async function catalogProgramIds(
  page: Page,
  namePrefix: string
): Promise<string[]> {
  const response = await page.evaluate(async () => {
    const catalogResponse = await fetch("/api/v1/programs/catalog");
    return {
      status: catalogResponse.status,
      body: await catalogResponse.json(),
    };
  });
  expect(response.status).toBe(200);
  const body = response.body as { data: { catalog: CatalogEntry[] } };
  return body.data.catalog
    .flatMap((entry) => entry.programs)
    .filter((program) => program.name.startsWith(namePrefix))
    .map((program) => program.program_id);
}

function enrollmentPanelOf(page: Page): Locator {
  return page.getByRole("region", {
    name: new RegExp(`^${COPY.enrollment}$`, "u"),
  });
}

function submitActionButton(panel: Locator) {
  return panel.getByRole("button", {
    name: new RegExp(`^(${COPY.enroll}|${COPY.reEnroll})$`, "u"),
  });
}

async function ensureActiveEnrollment(
  memberPage: Page,
  adminPage: Page,
  programId: string
): Promise<void> {
  await memberPage.goto(`/programs?program=${programId}#overview`);
  const enrollmentPanel = enrollmentPanelOf(memberPage);
  // The enrollment projection loads async; wait for the panel itself
  // before inspecting state, or the .or() below races the fetch.
  await expect(enrollmentPanel).toBeVisible();
  const pendingHint = enrollmentPanel.getByText(COPY.requestPendingHint, {
    exact: true,
  });
  const activeHint = enrollmentPanel.getByText(COPY.enrollmentActiveHint);
  await expect(
    submitActionButton(enrollmentPanel).or(pendingHint).or(activeHint)
  ).toBeVisible({ timeout: 15_000 });
  const needsApproval = !(await activeHint.isVisible().catch(() => false));
  if (needsApproval && !(await pendingHint.isVisible().catch(() => false))) {
    await submitActionButton(enrollmentPanel).click();
    await expect(pendingHint).toBeVisible();
  }
  if (!needsApproval) {
    return;
  }
  await loginAs(adminPage, ADMIN_USER, ADMIN_CRED);
  const memberName = await memberPage.evaluate(async () => {
    const response = await fetch("/api/v1/auth/me");
    if (!response.ok) {
      return "";
    }
    const body = (await response.json()) as {
      data?: { user?: { name?: string } };
    };
    return body.data?.user?.name ?? "";
  });
  expect(memberName).toBeTruthy();
  await adminPage.goto(
    `/programs?mode=management&program=${encodeURIComponent(programId)}&task=participants`
  );
  const requestRow = adminPage
    .getByRole("listitem")
    .filter({ hasText: memberName });
  await requestRow.getByRole("button", { name: COPY.approve }).click();
  await expect(
    adminPage
      .getByRole("region", { name: COPY.workspaceTaskParticipants })
      .getByText(COPY.decisionMade, { exact: true })
  ).toBeVisible({ timeout: 15_000 });
  await memberPage.reload();
  // The approve response must leave an Active enrollment; assert it so a
  // silent Pending (e.g. approval racing the member's reload) fails here
  // instead of downstream at the home card.
  const enrollmentPanelAfter = enrollmentPanelOf(memberPage);
  await expect(
    enrollmentPanelAfter.getByText(COPY.enrollmentActiveHint)
  ).toBeVisible();
}

async function openNextEventCheckInWindow(
  adminPage: Page,
  programId: string
): Promise<EventWindowSetup | null> {
  if (adminPage.url() === "about:blank") {
    await loginAs(adminPage, ADMIN_USER, ADMIN_CRED);
  }
  return await adminPage.evaluate(async (targetProgramId) => {
    const origin = window.location.origin;
    const listResponse = await fetch(
      `${origin}/api/v1/programs/${encodeURIComponent(targetProgramId)}/events`
    );
    const listBody = (await listResponse.json()) as {
      data?: {
        events?: {
          event_id: string;
          starts_at: string;
          status: string;
          availability: string;
          check_in_window_opens_at: string | null;
          check_in_window_closes_at: string | null;
        }[];
      };
    };
    const nowIso = new Date().toISOString();
    const [nextEvent] = [...(listBody.data?.events ?? [])]
      .filter(
        (event) =>
          event.status === "Active" &&
          event.availability === "Active" &&
          event.starts_at >= nowIso
      )
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    if (!nextEvent) {
      return null;
    }
    const now = Date.now();
    const snapshot = {
      eventId: nextEvent.event_id,
      opensAt: nextEvent.check_in_window_opens_at,
      closesAt: nextEvent.check_in_window_closes_at,
    };
    try {
      const patchResponse = await fetch(
        `${origin}/api/v1/programs/${encodeURIComponent(targetProgramId)}/events/${encodeURIComponent(nextEvent.event_id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            check_in_window_opens_at: new Date(now - 15 * 60_000).toISOString(),
            check_in_window_closes_at: new Date(
              now + 45 * 60_000
            ).toISOString(),
          }),
        }
      );
      return { snapshot, opened: patchResponse.ok };
    } catch {
      return { snapshot, opened: false };
    }
  }, programId);
}

test.describe("PUI-05 Home origin supplement", () => {
  test("Home long Explore copy wraps without horizontal overflow", async ({
    page,
  }) => {
    await loginAs(page, MEMBER_USER, MEMBER_CRED);
    const longTitle = "超長課程名稱：門徒訓練與社區同行計劃";
    const longSummary =
      "https://example.invalid/programs/this-is-a-deliberately-unbroken-value";
    await page.route("**/api/v1/home", async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as {
        data?: {
          featuredEvent?: {
            title?: string;
            programTitle?: string;
            location?: string | null;
            isEnrolled?: boolean;
          } | null;
          announcement?: {
            title?: string;
            summary?: string;
            ctaUrl?: string | null;
          } | null;
          exploreProgram?: {
            title?: string;
            summary?: string | null;
          } | null;
        };
      };
      const featuredEvent = body.data?.featuredEvent;
      const announcement = body.data?.announcement;
      const exploreProgram = body.data?.exploreProgram;
      if (!featuredEvent || !announcement || !exploreProgram) {
        await route.fulfill({ response });
        return;
      }
      featuredEvent.isEnrolled = true;
      featuredEvent.title = longTitle;
      featuredEvent.programTitle = `${longTitle}課程`;
      featuredEvent.location = longSummary;
      announcement.title = longTitle;
      announcement.ctaUrl = "https://example.invalid/home-venue";
      announcement.summary = longSummary;
      exploreProgram.title = longTitle;
      exploreProgram.summary = longSummary;
      await route.fulfill({ response, json: body });
    });
    await page.goto("/home");

    const eventCard = page.getByTestId("next-event-card");
    const announcementCard = page.getByTestId("announcement-card");
    const exploreCard = page.getByTestId("explore-card");
    await expect(eventCard).toBeVisible();
    await expect(announcementCard).toBeVisible();
    await expect(exploreCard).toBeVisible();
    await expect(eventCard).toContainText(longTitle);
    await expect(eventCard).toContainText(longSummary);
    await expect(announcementCard).toContainText(longTitle);
    await expect(announcementCard).toContainText(longSummary);
    await expect(exploreCard).toContainText(longTitle);
    await expect(exploreCard).toContainText(longSummary);
    await expect(
      page.getByRole("link", { name: COPY.homeViewEvent })
    ).toBeVisible();
    for (const [width, height] of [
      [320, 812],
      [375, 844],
      [390, 844],
      [414, 844],
      [600, 844],
      [799, 900],
      [800, 900],
      [1024, 900],
      [1440, 900],
    ] as const) {
      await page.setViewportSize({ width, height });
      const geometry = await page.evaluate(() => {
        const outlet = document.querySelector<HTMLElement>("#shell-content");
        const cards = [
          ...document.querySelectorAll<HTMLElement>(
            '[data-testid="next-event-card"], [data-testid="announcement-card"], [data-testid="explore-card"]'
          ),
        ];
        const primaryActions = [
          ...document.querySelectorAll<HTMLElement>("[data-feed-event-action]"),
        ];
        if (!outlet || cards.length !== 3) {
          throw new Error("Home long-copy geometry fixture is incomplete");
        }
        const right = (element: Element) =>
          element.getBoundingClientRect().right;
        return {
          outletClientWidth: outlet.clientWidth,
          outletScrollWidth: outlet.scrollWidth,
          outletRight: right(outlet),
          cards: cards.map((card) => {
            const isEventCard = card.dataset.testid === "next-event-card";
            const icons = card.querySelectorAll("svg");
            const chevron = isEventCard ? null : (icons[0] ?? null);
            const eventIcons = isEventCard ? icons : [];
            if (
              (isEventCard && eventIcons.length < 3) ||
              (!isEventCard && !chevron)
            ) {
              throw new Error("Home card controls are incomplete");
            }
            const textNodes = [
              ...card.querySelectorAll<HTMLElement>("h1,h2,p,span"),
            ];
            return {
              clientWidth: card.clientWidth,
              scrollWidth: card.scrollWidth,
              right: right(card),
              textOverflow: textNodes.some(
                (text) => text.scrollWidth > text.clientWidth
              ),
              isEventCard,
              eventIconCount: eventIcons.length,
              chevronPresent: chevron !== null,
              chevronRight: chevron ? right(chevron) : null,
            };
          }),
          primaryActionRights: primaryActions.map(right),
        };
      });
      expect(geometry.outletScrollWidth).toBeLessThanOrEqual(
        geometry.outletClientWidth
      );
      for (const cardGeometry of geometry.cards) {
        expect(cardGeometry.isEventCard ? cardGeometry.eventIconCount : 0).toBe(
          cardGeometry.isEventCard ? 3 : 0
        );
        expect(cardGeometry.chevronPresent).toBe(!cardGeometry.isEventCard);
        expect(cardGeometry.scrollWidth).toBeLessThanOrEqual(
          cardGeometry.clientWidth
        );
        expect(cardGeometry.textOverflow).toBe(false);
        expect(cardGeometry.right).toBeLessThanOrEqual(
          geometry.outletRight + 1
        );
        if (cardGeometry.chevronRight !== null) {
          expect(cardGeometry.chevronRight).toBeLessThanOrEqual(
            cardGeometry.right + 1
          );
        }
      }
      expect(geometry.primaryActionRights).toHaveLength(1);
      for (const primaryActionRight of geometry.primaryActionRights) {
        expect(primaryActionRight).toBeLessThanOrEqual(
          geometry.outletRight + 1
        );
      }
      await expect(
        page.getByRole("link", { name: COPY.homeViewEvent })
      ).toBeVisible();
      await expect(eventCard).toBeVisible();
      await expect(announcementCard).toBeVisible();
      await expect(exploreCard).toBeVisible();
    }
    await announcementCard.click();
    const detail = page.getByTestId("announcement-detail");
    const detailBack = page.getByRole("button", { name: COPY.homeBack });
    const detailExternal = detail.getByRole("link");
    await expect(detail).toBeVisible();
    await expect(detail).toContainText(longTitle);
    await expect(detail).toContainText(longSummary);
    for (const [width, height] of [
      [320, 812],
      [375, 844],
      [390, 844],
      [414, 844],
      [799, 900],
      [600, 844],
      [800, 900],
      [1440, 900],
      [1024, 900],
    ] as const) {
      await page.setViewportSize({ width, height });
      const detailGeometry = await page.evaluate(() => {
        const outlet = document.querySelector<HTMLElement>("#shell-content");
        const detailPage = document.querySelector<HTMLElement>(
          '[data-testid="announcement-detail"]'
        );
        const back = detailPage?.querySelector<HTMLElement>("[data-feed-back]");
        const external = detailPage?.querySelector<HTMLElement>(
          "[data-feed-external]"
        );
        if (!outlet || !detailPage || !back || !external) {
          throw new Error("announcement detail geometry fixture is incomplete");
        }
        const right = (element: Element) =>
          element.getBoundingClientRect().right;
        const textNodes = [
          ...detailPage.querySelectorAll<HTMLElement>("h1,h2,p,li"),
        ];
        return {
          outletClientWidth: outlet.clientWidth,
          outletScrollWidth: outlet.scrollWidth,
          outletRight: right(outlet),
          detailClientWidth: detailPage.clientWidth,
          detailScrollWidth: detailPage.scrollWidth,
          textOverflow: textNodes.some(
            (text) => text.scrollWidth > text.clientWidth
          ),
          backRight: right(back),
          externalRight: right(external),
        };
      });
      expect(detailGeometry.outletScrollWidth).toBeLessThanOrEqual(
        detailGeometry.outletClientWidth
      );
      expect(detailGeometry.detailScrollWidth).toBeLessThanOrEqual(
        detailGeometry.detailClientWidth
      );
      expect(detailGeometry.textOverflow).toBe(false);
      expect(detailGeometry.backRight).toBeLessThanOrEqual(
        detailGeometry.outletRight + 1
      );
      expect(detailGeometry.externalRight).toBeLessThanOrEqual(
        detailGeometry.outletRight + 1
      );
      await expect(detailBack).toBeVisible();
      await expect(detailExternal).toBeVisible();
      await detailBack.focus();
      expect(
        await detailBack.evaluate(
          (element) => document.activeElement === element
        )
      ).toBe(true);
    }
    await detailBack.click();
    await expect(exploreCard).toBeVisible();
  });
  test("Home announcement Back consumes only the overlay history entry", async ({
    page,
  }) => {
    await loginAs(page, MEMBER_USER, MEMBER_CRED);
    await page.goto("/home");
    const announcementCard = page.getByTestId("announcement-card");
    await expect(announcementCard).toBeVisible();
    const historyLength = await page.evaluate(() => window.history.length);

    await announcementCard.click();
    await expect(page.getByTestId("announcement-detail")).toBeVisible();
    expect(await page.evaluate(() => window.history.length)).toBe(
      historyLength + 1
    );

    await page.evaluate(() => window.history.back());
    await expect(page.getByTestId("announcement-detail")).toHaveCount(0);
    await expect(announcementCard).toBeVisible();
    expect(await page.evaluate(() => window.history.length)).toBe(
      historyLength
    );
  });
  test("Notices and Messages keep long feed copy inside the W7 viewport seams", async ({
    page,
  }) => {
    await loginAs(page, MEMBER_USER, MEMBER_CRED);
    const longCopy =
      "https://example.invalid/feed/this-is-a-deliberately-unbroken-value-with-cantonese-長篇內容";
    await page.route("**/api/v1/programs/notices", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          requestId: "r-notices-geometry",
          data: {
            unread_count: 1,
            notices: [
              {
                notice_id: "notice-geometry",
                kind: "account",
                title: longCopy,
                body: longCopy,
                program_id: null,
                event_id: null,
                read_at: null,
                created_at: Date.parse("2026-08-19T01:00:00.000Z"),
              },
            ],
          },
        }),
      });
    });
    await page.route("**/api/v1/home/announcements", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          requestId: "r-messages-geometry",
          data: {
            announcements: [
              {
                contentId: "message-geometry",
                version: 1,
                title: longCopy,
                summary: longCopy,
                bodyMarkdown: null,
                ctaLabel: null,
                ctaUrl: null,
                imageUrl: null,
                imageAlt: null,
                publishedAt: "2026-08-19T01:00:00.000Z",
              },
            ],
          },
        }),
      });
    });

    const widths = [320, 390, 600, 799, 800, 1024, 1440] as const;
    for (const path of ["/notices", "/messages"] as const) {
      await page.goto(path);
      const feed = page.locator(
        '[data-feed-announcement-owner="global-live-region"]'
      );
      await expect(feed).toBeVisible();
      await expect(
        feed.locator("[data-feed-list-item], [data-feed-list]")
      ).toBeVisible();
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        const geometry = await feed.evaluate((element) => {
          const text = [
            ...element.querySelectorAll<HTMLElement>("h1,h2,p,strong,span"),
          ];
          const actions = [
            ...element.querySelectorAll<HTMLElement>("a,button"),
          ];
          return {
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            textOverflow: text.some(
              (node) => node.scrollWidth > node.clientWidth
            ),
            actionsInside: actions.every((action) => {
              const feedRect = element.getBoundingClientRect();
              const actionRect = action.getBoundingClientRect();
              return (
                actionRect.left >= feedRect.left - 1 &&
                actionRect.right <= feedRect.right + 1
              );
            }),
            nestedLiveRegions: element.querySelectorAll("[aria-live]").length,
          };
        });
        expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
        expect(geometry.textOverflow).toBe(false);
        expect(geometry.actionsInside).toBe(true);
        expect(geometry.nestedLiveRegions).toBe(0);
      }
    }
  });

  test("Home next-event card opens event detail with 可簽到 and back-nav", async ({
    page,
    browser,
  }) => {
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    let programId = "";
    let openedEvent: EventWindowSnapshot | null = null;
    try {
      await loginAs(memberPage, MEMBER_USER, MEMBER_CRED);
      programId =
        (await catalogProgramIds(memberPage, "E2E_DEMO_成人查經"))[0] ?? "";
      expect(programId).toBeTruthy();
      await ensureActiveEnrollment(memberPage, page, programId);
      const eventSetup = await openNextEventCheckInWindow(page, programId);
      openedEvent = eventSetup?.snapshot ?? null;
      expect(eventSetup?.opened).toBe(true);
      await memberPage.goto("/home");
      const homeEventCard = memberPage.getByTestId("next-event-card");
      await expect(homeEventCard).toBeVisible({ timeout: 15_000 });
      const eventLink = homeEventCard.getByRole("link", {
        name: COPY.homeViewEvent,
      });
      const eventHref = await eventLink.getAttribute("href");
      expect(eventHref).toMatch(
        new RegExp(
          `/programs\\?program=${encodeURIComponent(programId)}&from=home&event=${encodeURIComponent(openedEvent?.eventId ?? "")}$`
        )
      );
      const expectedEventUrl = new URL(
        eventHref ?? "",
        memberPage.url()
      ).toString();
      await eventLink.click();
      await expect(memberPage).toHaveURL(expectedEventUrl);
      await expect(
        memberPage.locator("#participant-event-title")
      ).toBeVisible();
      await expect(memberPage.getByText(COPY.eventInstructions)).toBeVisible();
      await expect(memberPage.getByText(COPY.checkInAvailable)).toBeVisible();
      await memberPage.getByRole("button", { name: COPY.backToOrigin }).click();
      await expect(memberPage).toHaveURL(/\/home$/u);
    } finally {
      try {
        if (programId) {
          try {
            if (openedEvent) {
              await restoreEventWindow(page, programId, openedEvent);
            }
          } finally {
            await memberPage.goto(`/programs?program=${programId}#overview`);
            await resetParticipantEnrollment(
              memberPage,
              enrollmentPanelOf(memberPage),
              COPY
            );
          }
        }
      } finally {
        await memberContext.close();
      }
    }
  });

  test("Home Explore opens Program Detail and returns Home", async ({
    page,
  }) => {
    await loginAs(page, MEMBER_USER, MEMBER_CRED);
    await page.goto("/programs");
    const exploreCard = page.getByTestId("explore-card");
    const homeResponsePromise = page
      .waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname === "/api/v1/home",
        { timeout: 15_000 }
      )
      .catch(() => null);
    await page.goto("/home");
    const renderedExploreReady = exploreCard
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => null)
      .catch(() => null);
    const homeResponse = await Promise.race([
      homeResponsePromise,
      renderedExploreReady,
    ]);
    let expectedExploreProgram: {
      programId: string;
      title: string;
    } | null = null;
    if (homeResponse?.ok()) {
      const body = (await homeResponse.json()) as {
        data?: {
          exploreProgram?: { programId: string; title: string } | null;
        };
      };
      expectedExploreProgram = body.data?.exploreProgram ?? null;
    }
    await expect(exploreCard).toBeVisible({ timeout: 15_000 });
    await expect(exploreCard).toHaveAttribute(
      "href",
      /\/programs\?program=[^&]+&from=home/u
    );
    const exploreHref = await exploreCard.getAttribute("href");
    const expectedExploreHref = expectedExploreProgram
      ? `/programs?program=${encodeURIComponent(expectedExploreProgram.programId)}&from=home`
      : null;
    if (expectedExploreHref) {
      expect(exploreHref).toBe(expectedExploreHref);
    } else {
      expect(exploreHref).toMatch(/^\/programs\?program=[^&]+&from=home$/u);
    }
    const expectedExploreUrl = new URL(
      exploreHref ?? "",
      page.url()
    ).toString();
    await exploreCard.click();
    await expect(page).toHaveURL(expectedExploreUrl);
    if (expectedExploreProgram) {
      await expect(
        page.getByRole("heading", {
          name: expectedExploreProgram.title,
          exact: true,
        })
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole("heading", { name: /E2E_DEMO_/u })
      ).toBeVisible();
    }
    await page.getByRole("button", { name: "課程", exact: true }).click();
    await expect(page).toHaveURL(/\/home$/u);
  });
});
