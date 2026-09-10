/* oxlint-disable vitest/prefer-importing-vitest-globals --
 * Playwright spec (uses @playwright/test's `test`/`expect`), not a Vitest
 * test file. oxlint's vitest plugin unconditionally matches **\\/*.test.ts.
 */
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { COPY } from "../../web/lib/copy";

const story = (id: string) => `/iframe.html?id=${id}&viewMode=story`;

const STORIES = {
  home: "t07-2-public-auth-member-communications--home",
  notices: "t07-2-public-auth-member-communications--notices",
  messages: "t07-2-public-auth-member-communications--messages",
  accountDirectory: "t07-4-management-identity--account-directory",
  programsParticipant: "t07-3-programs--participant-directory",
  programsParticipantDetail: "t07-3-programs--participant-program-detail",
  programsManagement: "t07-3-programs--management-directory",
  scannerBoundary: "t07-5-attendance-scanner-guest--scanner-boundary",
} as const;

async function expectShellFrame(page: Page) {
  const nav = page.locator("nav#main-navigation");
  const main = page.locator("main#shell-content");
  // Management baselines can finish their MSW-backed first render after the
  // default assertion timeout at the narrowest viewport.
  await expect(main).toHaveCount(1, { timeout: 30_000 });
  await expect(nav).toHaveCount(1, { timeout: 30_000 });
  await expect(nav).toBeVisible();
  await expect(main).toBeVisible();

  const geometry = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const doc = document.documentElement;
    const body = document.body;
    const main = document.querySelector<HTMLElement>("main#shell-content");
    const mainBox = main?.getBoundingClientRect();

    return {
      horizontalOverflow:
        Math.max(doc.scrollWidth, body.scrollWidth) - viewportWidth,
      mainContentOverflow: main
        ? main.scrollWidth - main.clientWidth
        : Number.POSITIVE_INFINITY,
      mainLeft: mainBox?.left ?? Number.NEGATIVE_INFINITY,
      mainRight: mainBox?.right ?? Number.POSITIVE_INFINITY,
      viewportWidth,
      headerHeight:
        document
          .querySelector<HTMLElement>("header[data-shell-header]")
          ?.getBoundingClientRect().height ?? null,
      navHeight:
        document
          .querySelector<HTMLElement>("nav#main-navigation")
          ?.getBoundingClientRect().height ?? null,
    };
  });

  expect(geometry.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(geometry.mainContentOverflow).toBeLessThanOrEqual(1);
  expect(geometry.mainLeft).toBeGreaterThanOrEqual(-1);
  expect(geometry.mainRight).toBeLessThanOrEqual(geometry.viewportWidth + 1);

  const width = Number.parseInt(test.info().project.name.slice(2), 10);
  if (geometry.headerHeight !== null) {
    expect(geometry.headerHeight).toBeGreaterThanOrEqual(56);
  }
  if (width < 800 && geometry.navHeight !== null) {
    expect(geometry.navHeight).toBeGreaterThanOrEqual(72);
  }
  await expect(nav).toHaveCSS("position", width < 800 ? "fixed" : "sticky");
}

async function expectMemberBrand(page: Page) {
  const header = page.locator("header[data-shell-header]");
  await expect(header).toBeVisible();
  await expect(
    header.getByText(COPY.shell.shortMark, { exact: true })
  ).toBeVisible();
}

test("Storybook Home keeps the member shell truthful across W7", async ({
  page,
}) => {
  await page.goto(story(STORIES.home));
  await expectShellFrame(page);
  await expectMemberBrand(page);
});

test("Screen Foundations Playground keeps shared geometry across W7", async ({
  page,
}) => {
  await page.goto(story("foundations--screen-foundations-playground"));

  const frame = page.locator('[data-screen-foundation="page-frame"]');
  const heading = frame.locator('[data-screen-heading="root"]');
  const rows = frame.locator("[data-screen-row]");
  const tabs = frame.locator('[data-screen-foundation="tabs"]');
  const stickyActions = frame.locator(
    '[data-screen-foundation="sticky-actions"]'
  );

  await expect(frame).toBeVisible();
  await expect(heading).toBeVisible();
  await expect(rows).toHaveCount(2);
  await expect(tabs).toBeVisible();
  await expect(stickyActions).toBeVisible();

  const geometry = await frame.evaluate((element) => {
    const frameElement = element as HTMLElement;
    const headingElement = frameElement.querySelector<HTMLElement>(
      '[data-screen-heading="root"]'
    );
    const tabElement = frameElement.querySelector<HTMLElement>(
      '[data-screen-foundation="tabs"]'
    );
    const stickyElement = frameElement.querySelector<HTMLElement>(
      '[data-screen-foundation="sticky-actions"]'
    );
    const targets = [
      ...frameElement.querySelectorAll<HTMLElement>(
        'a[href], button, input, textarea, [role="button"]'
      ),
    ].filter((target) => {
      const box = target.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    const boxes = targets.map((target) => target.getBoundingClientRect());
    const frameStyle = getComputedStyle(frameElement);
    const headingStyle = headingElement
      ? getComputedStyle(headingElement)
      : null;
    const viewportWidth = window.innerWidth;

    return {
      frame: frameElement.getBoundingClientRect().toJSON(),
      framePaddingLeft: Number.parseFloat(frameStyle.paddingLeft),
      framePaddingRight: Number.parseFloat(frameStyle.paddingRight),
      heading: headingStyle
        ? {
            fontSize: headingStyle.fontSize,
            lineHeight: headingStyle.lineHeight,
          }
        : null,
      minimumTarget: Math.min(
        ...boxes.map((box) => Math.min(box.width, box.height))
      ),
      rowHeights: [
        ...frameElement.querySelectorAll<HTMLElement>("[data-screen-row]"),
      ].map((row) => row.getBoundingClientRect().height),
      tabHeight: tabElement?.getBoundingClientRect().height ?? 0,
      stickyBottom: stickyElement?.getBoundingClientRect().bottom ?? 0,
      viewportWidth,
      overflow:
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth
        ) - viewportWidth,
    };
  });

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(geometry.frame.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.frame.right).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
  expect(geometry.framePaddingLeft).toBeGreaterThan(0);
  expect(geometry.framePaddingRight).toBe(geometry.framePaddingLeft);
  expect(geometry.heading).toStrictEqual({
    fontSize: "28px",
    lineHeight: "34px",
  });
  expect(geometry.minimumTarget).toBeGreaterThanOrEqual(44);
  expect(geometry.rowHeights[0]).toBeGreaterThanOrEqual(64);
  expect(geometry.rowHeights[1]).toBeGreaterThanOrEqual(64);
  expect(geometry.tabHeight).toBeGreaterThanOrEqual(44);
  expect(geometry.overflow).toBeLessThanOrEqual(1);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const stickyClearance = await stickyActions.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return window.innerHeight - box.bottom;
  });
  expect(stickyClearance).toBeGreaterThanOrEqual(
    (viewport?.width ?? 0) < 800 ? 71 : -1
  );
});

test("Programs participant shell keeps the brand-first header and no mode control", async ({
  page,
}) => {
  await page.goto(story(STORIES.programsParticipant));
  await expectShellFrame(page);
  await expectMemberBrand(page);
  await expect(
    page
      .locator("header[data-shell-header]")
      .getByRole("link", { name: COPY.programs.enterManagement })
  ).toHaveCount(0);
});

test("Programs management shell exposes one canonical home mode control", async ({
  page,
}) => {
  await page.goto(story(STORIES.programsManagement));
  await expectShellFrame(page);
  await expectMemberBrand(page);

  const header = page.locator("header[data-shell-header]");
  const modeLink = header.getByRole("link", {
    name: COPY.programs.enterParticipant,
  });
  await expect(modeLink).toHaveCount(1);
  await expect(modeLink).toHaveAttribute("href", "/programs");
  await expect(modeLink).toHaveAttribute("data-screen-icon-button", "true");
  await expect(modeLink).toHaveText("");
});

test("Programs detail uses a route-owned icon-only Back control", async ({
  page,
}) => {
  await page.goto(story(STORIES.programsParticipantDetail));
  await expectShellFrame(page);

  const back = page.locator(
    '[data-screen-foundation="header"] [data-screen-icon-button]'
  );
  await expect(back).toHaveCount(1);
  await expect(back).toHaveAttribute("href", "/programs");
  await expect(back).toHaveAttribute("aria-label", COPY.programs.detailBack);
  await expect(back).toHaveText("");
});

test("Storybook Notices keeps global brand and local H1 across W7", async ({
  page,
}) => {
  await page.goto(story(STORIES.notices));
  await expectShellFrame(page);
  await expectMemberBrand(page);

  const heading = page.getByRole("heading", {
    level: 1,
    name: COPY.sections.notices,
  });
  await expect(heading).toBeVisible();
  await expect(
    page.locator("header[data-shell-header]").getByText(COPY.sections.notices, {
      exact: true,
    })
  ).toHaveCount(0);
});

test("Storybook Messages keeps global brand and local H1 across W7", async ({
  page,
}) => {
  await page.goto(story(STORIES.messages));
  await expectShellFrame(page);
  await expectMemberBrand(page);

  const heading = page.getByRole("heading", {
    level: 1,
    name: COPY.home.churchNews,
  });
  await expect(heading).toBeVisible();
  await expect(
    page.locator("header[data-shell-header]").getByText(COPY.home.churchNews, {
      exact: true,
    })
  ).toHaveCount(0);
});

test("Storybook management Account Directory keeps brand and attention chrome across W7", async ({
  page,
}) => {
  await page.goto(story(STORIES.accountDirectory));
  await expectShellFrame(page);

  const header = page.locator("header[data-shell-header]");
  await expect(header).toBeVisible();
  await expect(
    header.getByText(COPY.shell.shortMark, { exact: true })
  ).toBeVisible();
  await expect(
    header.getByText("T07.1 Storybook Manager", { exact: true })
  ).toHaveCount(0);
  await expect(
    header.getByText("T07.1 synthetic manager", { exact: true })
  ).toHaveCount(0);
  const attentionButton = header.locator('button[aria-haspopup="dialog"]');
  await expect(attentionButton).toHaveCount(1);
  await expect(attentionButton).toBeVisible();
});

test("Storybook Scanner Boundary keeps navigation while suppressing the top header across W7", async ({
  page,
}) => {
  await page.goto(story(STORIES.scannerBoundary));
  await expectShellFrame(page);
  await expect(page.locator("header[data-shell-header]")).toHaveCount(0);
});
