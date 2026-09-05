import { expect as pwExpect, test as pwTest } from "@playwright/test";

import { MANAGEMENT_HUB_PRESENTATION_DECLARATIONS } from "../../web/.storybook/management-hub.story-contract";

const storyIdFor = (state: string) => {
  const declaration = MANAGEMENT_HUB_PRESENTATION_DECLARATIONS.find(
    (candidate) => candidate.state === state
  );
  if (!declaration) {
    throw new Error(`Missing Management Hub Story for ${state}`);
  }
  return declaration.storyId;
};

const STORY_IDS = {
  default: storyIdFor("default"),
  loading: storyIdFor("loading"),
  empty: storyIdFor("empty"),
  recoverableError: storyIdFor("recoverable-error"),
} as const;

const storybookBaseUrl =
  process.env.STORYBOOK_BASE_URL ?? "http://127.0.0.1:6006";

const storyUrl = (storyId: string) =>
  new URL(
    `/iframe.html?id=${storyId}&viewMode=story`,
    storybookBaseUrl
  ).toString();

pwTest.describe("T07.1 Management Hub Storybook presentation contract", () => {
  pwTest(
    "default Story uses production shell and canonical hub links",
    async ({ page }) => {
      await page.goto(storyUrl(STORY_IDS.default));
      await pwExpect(
        page.getByRole("heading", { level: 1, name: "管理工作" })
      ).toBeVisible();
      await pwExpect(
        page.getByRole("link", { name: /註冊審批/u })
      ).toHaveAttribute("href", "/management?module=approvals");
      await pwExpect(page.locator("#main-navigation")).toBeVisible();
      await pwExpect(
        page.locator('[data-t07-deterministic-motion="true"]')
      ).toHaveCount(1);
    }
  );

  pwTest("all four PSN Stories are directly openable", async ({ page }) => {
    const expectations = [
      [STORY_IDS.default, "管理工作"],
      [STORY_IDS.loading, "載入中…"],
      [STORY_IDS.empty, "目前沒有可用的管理工作"],
      [STORY_IDS.recoverableError, "重試連接"],
    ] as const;

    for (const [storyId, text] of expectations) {
      await page.goto(storyUrl(storyId));
      await pwExpect(page.getByText(text, { exact: true })).toBeVisible();
    }
  });
});
