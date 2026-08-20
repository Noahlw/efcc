/* oxlint-disable vitest/prefer-importing-vitest-globals --
 * Playwright acceptance suite for Spec 085 / Ticket 085-01 (#306):
 * Participant Home and Church Announcement surfaces.
 */
import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

import { COPY } from "../../web/lib/copy";
import {
  defaultSections,
  stableNavigationSections,
} from "../../web/lib/sections";

const AUTH_HINT_KEY = "efcc_auth_active";

const MEMBER_USER = {
  userId: "u-member-101",
  name: "陳小明",
  username: "member.demo",
  phone: "91234567",
  role: "Member",
  status: "Active",
  qrCodeString: "qr:u-member-101",
};

interface HomeRouteOptions {
  featuredEvent?: {
    eventId: string;
    programId: string;
    programTitle: string;
    title: string;
    startsAt: string;
    endsAt: string;
    location: string;
    status: string;
    isEnrolled: boolean;
  } | null;
  announcement?: {
    contentId: string;
    version: number;
    title: string;
    summary: string;
    bodyMarkdown: string | null;
    ctaLabel: string | null;
    ctaUrl: string | null;
    imageUrl: string | null;
    imageAlt: string | null;
    publishedAt: string;
  } | null;
  exploreProgram?: {
    programId: string;
    title: string;
    summary: string;
    category: string;
    enrollmentType: string;
    nextEventStartAt: string | null;
  } | null;
}

function stubAuthEndpoints(user: typeof MEMBER_USER) {
  return async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (path === "/api/v1/auth/me" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          requestId: "r-me",
          data: {
            user,
            sections: defaultSections(),
            navigation: stableNavigationSections(user.role),
          },
        }),
      });
      return;
    }

    if (path === "/api/v1/auth/refresh" && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ requestId: "r-refresh", data: {} }),
      });
      return;
    }

    if (path === "/api/v1/auth/logout" && method === "POST") {
      await route.fulfill({ status: 204 });
      return;
    }

    await route.fulfill({ status: 404 });
  };
}

function stubHomeEndpoint(options: HomeRouteOptions = {}) {
  const defaultEvent = {
    eventId: "e-101",
    programId: "p-disc",
    programTitle: "門徒訓練基礎課",
    title: "第三課聚會",
    startsAt: "2026-08-20T11:30:00.000Z",
    endsAt: "2026-08-20T13:00:00.000Z",
    location: "二樓禮堂",
    status: "Active",
    isEnrolled: true,
  };

  const defaultAnnouncement = {
    contentId: "c-001",
    version: 1,
    title: "本週崇拜及聚會安排",
    summary: "請留意本週三晚聚會改於二樓禮堂舉行。其他聚會時間維持不變。",
    bodyMarkdown: null,
    ctaLabel: "聚會場地資料",
    ctaUrl: "https://example.com/venue-details",
    imageUrl: null,
    imageAlt: null,
    publishedAt: "8月15日",
  };

  const defaultExploreProgram = {
    programId: "p-intro",
    title: "慕道入門課程",
    summary: "現正接受報名 · 9月7日開始",
    category: "Faith",
    enrollmentType: "Open",
    nextEventStartAt: "2026-09-07T02:00:00.000Z",
  };

  const data = {
    featuredEvent:
      options.featuredEvent === undefined
        ? defaultEvent
        : options.featuredEvent,
    announcement:
      options.announcement === undefined
        ? defaultAnnouncement
        : options.announcement,
    exploreProgram:
      options.exploreProgram === undefined
        ? defaultExploreProgram
        : options.exploreProgram,
  };

  return async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        requestId: "r-home",
        data,
      }),
    });
  };
}

async function initAuthenticatedPage(
  page: Page,
  homeOptions?: HomeRouteOptions,
  user = MEMBER_USER
) {
  await page.addInitScript(
    ({ key, value }: { key: string; value: string }) => {
      localStorage.setItem(key, value);
    },
    { key: AUTH_HINT_KEY, value: "1" }
  );
  await page.route("**/api/v1/auth/**", stubAuthEndpoints(user));
  await page.route("**/api/v1/home", stubHomeEndpoint(homeOptions));
  await page.route("**/api/v1/programs/catalog", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ requestId: "r-catalog", data: { catalog: [] } }),
    });
  });
}

test.describe("085-01: Participant Home and Church Announcement", () => {
  test("Home renders greeting with member name and next event card when enrolled", async ({
    page,
  }) => {
    await initAuthenticatedPage(page);
    await page.goto("/home");

    // 1. Greeting header
    const greeting = page.locator("h1");
    await expect(greeting).toContainText(COPY.home.greeting);
    await expect(greeting).toContainText("陳小明");
    await expect(page.getByText(COPY.home.subtitle)).toBeVisible();

    // 2. Next Event Card
    const eventCard = page.getByTestId("next-event-card");
    await expect(eventCard).toBeVisible();
    await expect(eventCard.getByText(COPY.home.enrolledBadge)).toBeVisible();
    await expect(eventCard.getByText("門徒訓練基礎課")).toBeVisible();
    await expect(
      eventCard.getByRole("heading", { level: 2, name: "第三課聚會" })
    ).toBeVisible();
    await expect(eventCard.getByText("二樓禮堂")).toBeVisible();

    // 3. CTA navigates to /programs
    const viewEventButton = eventCard.getByRole("link", {
      name: COPY.home.viewEvent,
    });
    await expect(viewEventButton).toBeVisible();
    await viewEventButton.click();
    await expect(page).toHaveURL(/\/programs/);
  });

  test("Home keeps a structural skeleton distinct from empty while projection is pending", async ({
    page,
  }) => {
    await initAuthenticatedPage(page);
    await page.unroute("**/api/v1/home");
    let release!: () => void;
    // oxlint-disable-next-line promise/avoid-new -- hold the intercepted response
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/v1/home", async (route) => {
      await pending;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          requestId: "r-home-skeleton",
          data: {
            featuredEvent: null,
            announcement: null,
            exploreProgram: null,
          },
        }),
      });
    });

    await page.goto("/home");
    const loading = page.getByTestId("home-loading-state");
    await expect(page.getByTestId("home-loading-skeleton")).toBeVisible();
    await expect(loading).toHaveAttribute("aria-busy", "true");
    await expect(page.getByTestId("home-empty-state")).toHaveCount(0);
    const geometry = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.innerWidth);
    await expect(
      page.getByTestId("home-loading-skeleton").locator("a,button")
    ).toHaveCount(0);
    release();
    await expect(page.getByTestId("home-empty-state")).toBeVisible();
    await expect(page.getByTestId("home-loading-skeleton")).toHaveCount(0);
  });

  test("Home renders empty state when member is not enrolled in any upcoming event", async ({
    page,
  }) => {
    await initAuthenticatedPage(page, { featuredEvent: null });
    await page.goto("/home");

    // 1. Greeting
    await expect(page.locator("h1")).toContainText(COPY.home.greeting);

    // 2. Empty State
    const emptyState = page.getByTestId("home-empty-state");
    await expect(emptyState).toBeVisible();
    await expect(
      emptyState.getByRole("heading", { level: 2, name: COPY.home.emptyTitle })
    ).toBeVisible();
    await expect(emptyState.getByText(COPY.home.emptySubtitle)).toBeVisible();

    // 3. CTA navigates to /programs
    const exploreProgramsButton = emptyState.getByRole("link", {
      name: COPY.home.explorePrograms,
    });
    await expect(exploreProgramsButton).toBeVisible();
    await exploreProgramsButton.click();
    await expect(page).toHaveURL(/\/programs/);
  });

  test("Clicking 教會消息 opens announcement detail with venue info and external link", async ({
    page,
  }) => {
    await initAuthenticatedPage(page, {
      announcement: {
        contentId: "c-001",
        version: 1,
        title: "本週崇拜及聚會安排",
        summary: "請留意本週三晚聚會改於二樓禮堂舉行。其他聚會時間維持不變。",
        bodyMarkdown: null,
        ctaLabel: "聚會場地資料",
        ctaUrl: "https://example.com/venue-details",
        imageUrl: null,
        imageAlt: null,
        publishedAt: "8月15日",
      },
    });
    await page.goto("/home");

    // 1. Church news section and card on home
    await expect(
      page.getByRole("heading", { level: 2, name: COPY.home.churchNews })
    ).toBeVisible();
    const announcementCard = page.getByTestId("announcement-card");
    await expect(announcementCard).toBeVisible();
    await expect(
      announcementCard.getByText("本週崇拜及聚會安排")
    ).toBeVisible();

    // 2. Click opens announcement detail
    await announcementCard.click();

    const detailView = page.getByTestId("announcement-detail");
    await expect(detailView).toBeVisible();
    await expect(
      detailView.getByRole("heading", { level: 1, name: "本週崇拜及聚會安排" })
    ).toBeVisible();
    await expect(detailView.getByText("8月15日")).toBeVisible();
    await expect(
      detailView.getByText(
        "請留意本週三晚聚會改於二樓禮堂舉行。其他聚會時間維持不變。"
      )
    ).toBeVisible();

    // 3. Venue information
    await expect(
      detailView.getByRole("heading", { level: 2, name: COPY.home.venueTitle })
    ).toBeVisible();
    await expect(
      detailView.getByText(COPY.home.venueInstructions)
    ).toBeVisible();
    await expect(detailView.getByText(COPY.home.worshipLocation)).toBeVisible();
    await expect(detailView.getByText(COPY.home.familyRoom)).toBeVisible();
    await expect(
      detailView.getByText(COPY.home.visitorReception)
    ).toBeVisible();

    // 4. External link properties
    const externalLink = detailView.getByRole("link", {
      name: new RegExp(COPY.home.externalLink),
    });
    await expect(externalLink).toBeVisible();
    await expect(externalLink).toHaveAttribute(
      "href",
      "https://example.com/venue-details"
    );
    await expect(externalLink).toHaveAttribute("target", "_blank");
    await expect(externalLink).toHaveAttribute("rel", "noopener");

    // 5. Back button returns to home
    const backButton = detailView.getByRole("button", {
      name: new RegExp(COPY.home.backHome),
    });
    await expect(backButton).toBeVisible();
    await backButton.click();

    await expect(detailView).not.toBeVisible();
    await expect(page.getByTestId("home-page")).toBeVisible();
  });

  test("Clicking 探索 / 全部課程 navigates to /programs", async ({ page }) => {
    await initAuthenticatedPage(page, {
      exploreProgram: {
        programId: "p-intro",
        title: "慕道入門課程",
        summary: "現正接受報名 · 9月7日開始",
        category: "Faith",
        enrollmentType: "Open",
        nextEventStartAt: "2026-09-07T02:00:00.000Z",
      },
    });
    await page.goto("/home");

    // 1. Explore section
    await expect(
      page.getByRole("heading", { level: 2, name: COPY.home.explore })
    ).toBeVisible();

    // 2. All programs link navigates to /programs
    const allProgramsLink = page.getByRole("link", {
      name: COPY.home.allPrograms,
    });
    await expect(allProgramsLink).toBeVisible();
    await allProgramsLink.click();
    await expect(page).toHaveURL(/\/programs/);
  });
});
