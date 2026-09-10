/* oxlint-disable vitest/prefer-importing-vitest-globals --
 * Playwright spec (uses @playwright/test's `test`/`expect`), not a Vitest
 * test file. oxlint's vitest plugin unconditionally matches **\\/*.test.ts.
 */
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { COPY } from "../../web/lib/copy";

const story = (id: string) => `/iframe.html?id=${id}&viewMode=story`;

const STORIES = {
  participantDirectory: "t07-3-programs--participant-directory",
  participantProgramDetail: "t07-3-programs--participant-program-detail",
  managementDirectory: "t07-3-programs--management-directory",
} as const;

const PROGRAMS_WORKSHOP_NAME = "Storybook Programs Workshop";

async function expectShellFrame(page: Page) {
  const nav = page.locator("nav#main-navigation");
  const main = page.locator("main#shell-content");
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

async function expectManagerBrand(page: Page) {
  const header = page.locator("header[data-shell-header]");
  await expect(header).toBeVisible();
  await expect(
    header.getByText("T07.1 Storybook Manager", { exact: true })
  ).toBeVisible();
  await expect(
    header.getByText("T07.1 synthetic manager", { exact: true })
  ).toBeVisible();
}

test("Participant Directory production baseline keeps its direct locator across W7", async ({
  page,
}) => {
  await page.goto(story(STORIES.participantDirectory));
  await expectShellFrame(page);
  await expectMemberBrand(page);
  await expect(
    page.locator("[data-program-name]", { hasText: PROGRAMS_WORKSHOP_NAME })
  ).toBeVisible();
});

test("Participant Program Detail production baseline keeps its direct locator across W7", async ({
  page,
}) => {
  await page.goto(story(STORIES.participantProgramDetail));
  await expectShellFrame(page);
  await expectMemberBrand(page);
  await expect(page.locator("#program-detail-title")).toHaveText(
    PROGRAMS_WORKSHOP_NAME
  );
});

test("Management Directory production baseline keeps its direct locator across W7", async ({
  page,
}) => {
  await page.goto(story(STORIES.managementDirectory));
  await expectShellFrame(page);
  await expectManagerBrand(page);
  await expect(page.locator("#programs-management-directory-title")).toHaveText(
    "管理課程目錄"
  );
});
