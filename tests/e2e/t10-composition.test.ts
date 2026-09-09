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
  const frameStyle = await frame.evaluate((element: HTMLElement) => {
    const style = window.getComputedStyle(element);
    return {
      paddingBottom: Number.parseFloat(style.paddingBottom),
      paddingLeft: Number.parseFloat(style.paddingLeft),
      paddingRight: Number.parseFloat(style.paddingRight),
      paddingTop: Number.parseFloat(style.paddingTop),
    };
  });
  expect(viewport).not.toBeNull();
  const expectedFrameWidth = Math.min(viewport?.width ?? 0, 1180);
  expect(frameBox.width, "Page Frame width boundary").toBeGreaterThanOrEqual(
    expectedFrameWidth - 1
  );
  expect(frameBox.width, "Page Frame width boundary").toBeLessThanOrEqual(
    expectedFrameWidth + 1
  );
  expect(frameStyle.paddingLeft, "Page Frame shared gutter").toBeGreaterThan(0);
  expect(frameStyle.paddingRight, "Page Frame shared gutter").toBe(
    frameStyle.paddingLeft
  );
  expect(frameStyle.paddingTop, "Page Frame top reserve").toBeGreaterThan(0);
  expect(frameStyle.paddingBottom, "Page Frame bottom reserve").toBeGreaterThan(
    0
  );
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
  expect(contentBox.left - frameBox.left).toBeCloseTo(
    frameStyle.paddingLeft,
    0
  );
  expect(frameBox.right - contentBox.right).toBeCloseTo(
    frameStyle.paddingRight,
    0
  );
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
  const main = header.locator("[data-route-header-main]");
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
  const mainLayout = await main.evaluate((element: HTMLElement) => ({
    flexDirection: window.getComputedStyle(element).flexDirection,
    below800: window.matchMedia("(width < 800px)").matches,
  }));
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

  if ((viewport?.width ?? 0) <= 414) {
    expect(actionBox.left).toBeGreaterThanOrEqual(headerBox.left - 1);
    expect(actionBox.top).toBeGreaterThanOrEqual(leadBox.bottom - 1);
    expect(mainLayout.flexDirection).toBe("column");
    expect(mainLayout.below800).toBe(true);
    expect(
      headingBox.height,
      "long title wraps at narrow widths"
    ).toBeGreaterThan(48);
    expect(leadBox.height, "long lead wraps at narrow widths").toBeGreaterThan(
      32
    );
  } else if ((viewport?.width ?? 0) === 799) {
    expect(mainLayout.flexDirection).toBe("column");
    expect(mainLayout.below800).toBe(true);
    expect(actionBox.left).toBeGreaterThanOrEqual(headerBox.left - 1);
    expect(actionBox.top).toBeGreaterThanOrEqual(leadBox.bottom - 1);
  } else if ((viewport?.width ?? 0) === 800) {
    expect(mainLayout.flexDirection).toBe("row");
    expect(mainLayout.below800).toBe(false);
    expect(actionBox.top).toBeLessThanOrEqual(headingBox.bottom + 1);
    expect(actionBox.left).toBeGreaterThanOrEqual(headingBox.right - 1);
  }

  await expectNoHorizontalOverflow(page);
});
