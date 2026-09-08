import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

const story = (id: string) => `/iframe.html?id=${id}&viewMode=story`;

async function rect(locator: Locator) {
  return locator.evaluate((element: HTMLElement) => {
    const box = element.getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      width: box.width,
    };
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth
      ) - window.innerWidth
  );
  expect(overflow, "T10 Page Frame horizontal overflow").toBeLessThanOrEqual(1);
}

test("Page Frame keeps shared gutter and content contained across W7", async ({
  page,
}) => {
  await page.goto(story("t10-composition--page-frame"));
  const frame = page.locator("[data-page-frame]");
  const content = page.locator("[data-t10-page-frame-content]");
  await expect(frame).toBeVisible();
  await expect(content).toBeVisible();

  const frameBox = await rect(frame);
  const contentBox = await rect(content);
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(frameBox.left, "Page Frame left containment").toBeGreaterThanOrEqual(
    -1
  );
  expect(frameBox.right, "Page Frame right containment").toBeLessThanOrEqual(
    (viewport?.width ?? 0) + 1
  );
  expect(
    contentBox.left,
    "content stays inside Page Frame"
  ).toBeGreaterThanOrEqual(frameBox.left - 1);
  expect(
    contentBox.right,
    "content stays inside Page Frame"
  ).toBeLessThanOrEqual(frameBox.right + 1);
  expect(frameBox.width).toBeGreaterThan(0);
  await expectNoHorizontalOverflow(page);
});
