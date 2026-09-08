import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

const story = (id: string) => `/iframe.html?id=${id}&viewMode=story`;

async function rect(locator: Locator) {
  return locator.evaluate((element: HTMLElement) => {
    const box = element.getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      height: box.height,
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

test("Route Header keeps content and actions reachable across W7", async ({
  page,
}) => {
  await page.goto(story("t10-composition--route-header-story"));
  const header = page.locator("[data-route-header]");
  const heading = header.getByRole("heading", { level: 1 });
  const lead = header.locator("p");
  const back = header.getByRole("link", { name: "返回管理工作" });
  const action = header.locator("[data-route-header-actions]");
  const save = header.getByRole("button", { name: "儲存已編輯內容" });
  const status = header.getByRole("status");
  const viewport = page.viewportSize();

  await expect(header).toBeVisible();
  await expect(heading).toBeVisible();
  await expect(lead).toBeVisible();
  await expect(back).toBeVisible();
  await expect(action).toBeVisible();
  await expect(save).toBeVisible();
  await expect(status).toHaveText("草稿已載入");
  expect(viewport).not.toBeNull();

  const headerBox = await rect(header);
  const headingBox = await rect(heading);
  const leadBox = await rect(lead);
  const actionBox = await rect(action);
  expect(
    headerBox.left,
    "Route Header left containment"
  ).toBeGreaterThanOrEqual(-1);
  expect(headerBox.right, "Route Header right containment").toBeLessThanOrEqual(
    (viewport?.width ?? 0) + 1
  );
  expect(
    actionBox.right,
    "Route Header action reachability"
  ).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
  expect(actionBox.width).toBeGreaterThan(0);

  if ((viewport?.width ?? 0) <= 799) {
    expect(actionBox.left).toBeGreaterThanOrEqual(headerBox.left - 1);
    expect(actionBox.top).toBeGreaterThanOrEqual(headingBox.top);
    if ((viewport?.width ?? 0) <= 414) {
      expect(
        headingBox.height,
        "long title wraps at narrow widths"
      ).toBeGreaterThan(48);
      expect(
        leadBox.height,
        "long lead wraps at narrow widths"
      ).toBeGreaterThan(32);
    }
  } else if ((viewport?.width ?? 0) === 800) {
    expect(actionBox.top).toBeLessThanOrEqual(headingBox.bottom + 1);
  }

  await expectNoHorizontalOverflow(page);
});
