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
    };
  });

  expect(geometry.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(geometry.mainContentOverflow).toBeLessThanOrEqual(1);
  expect(geometry.mainLeft).toBeGreaterThanOrEqual(-1);
  expect(geometry.mainRight).toBeLessThanOrEqual(geometry.viewportWidth + 1);

  const width = Number.parseInt(test.info().project.name.slice(2), 10);
  await expect(nav).toHaveCSS("position", width < 800 ? "fixed" : "sticky");
}

async function expectMemberBrand(page: Page) {
  const header = page.locator("header[data-shell-header]");
  await expect(header).toBeVisible();
  await expect(
    header.getByText(COPY.appFullName, { exact: true })
  ).toBeVisible();
}

test("Storybook Home keeps the member shell truthful across W7", async ({
  page,
}) => {
  await page.goto(story(STORIES.home));
  await expectShellFrame(page);
  await expectMemberBrand(page);
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

test("Storybook management Account Directory keeps identity and attention chrome across W7", async ({
  page,
}) => {
  await page.goto(story(STORIES.accountDirectory));
  await expectShellFrame(page);

  const header = page.locator("header[data-shell-header]");
  await expect(header).toBeVisible();
  await expect(
    header.getByText("T07.1 Storybook Manager", { exact: true })
  ).toBeVisible();
  await expect(
    header.getByText("T07.1 synthetic manager", { exact: true })
  ).toBeVisible();
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
