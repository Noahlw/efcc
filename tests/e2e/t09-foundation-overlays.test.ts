import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

const story = (id: string) => `/iframe.html?id=${id}&viewMode=story`;

async function openStory(page: Page, id: string) {
  await page.goto(story(id));
  await page.locator("[data-slot]").first().waitFor({ state: "visible" });
}

async function rect(locator: Locator) {
  return locator.evaluate((element: HTMLElement) => {
    const box = element.getBoundingClientRect();
    return {
      top: box.top,
      left: box.left,
      right: box.right,
      bottom: box.bottom,
      width: box.width,
      height: box.height,
    };
  });
}

async function expectWithinViewport(
  page: Page,
  locator: Locator,
  label: string
) {
  const box = await rect(locator);
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(box.left, `${label} left`).toBeGreaterThanOrEqual(-1);
  expect(box.top, `${label} top`).toBeGreaterThanOrEqual(-1);
  expect(box.right, `${label} right`).toBeLessThanOrEqual(
    (viewport?.width ?? 0) + 1
  );
  expect(box.bottom, `${label} bottom`).toBeLessThanOrEqual(
    (viewport?.height ?? 0) + 1
  );
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () =>
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth
      ) - window.innerWidth
  );
  expect(overflow, `${label} horizontal overflow`).toBeLessThanOrEqual(1);
}

test("Surface owns readable chrome without clipping long content", async ({
  page,
}) => {
  await openStory(page, "foundations--surface");
  const card = page.locator('[data-testid="foundation-surface-card"]');
  await expect(card).toBeVisible();
  await expectWithinViewport(page, card, "surface card");
  await expect(card).toHaveClass(/overflow-visible/u);
  await expectNoHorizontalOverflow(page, "Surface Story");
});

test("Feedback exposes six tones with explicit silent presentation state", async ({
  page,
}) => {
  await openStory(page, "foundations--feedback");
  const alerts = page.locator('[data-slot="alert"]');
  await expect(alerts).toHaveCount(6);
  await expect(alerts.nth(0)).toHaveAttribute("data-tone", "info");
  await expect(alerts.nth(1)).toHaveAttribute("data-tone", "success");
  await expect(alerts.nth(2)).toHaveAttribute("data-tone", "pending");
  await expect(alerts.nth(3)).toHaveAttribute("data-tone", "warning");
  await expect(alerts.nth(4)).toHaveAttribute("data-tone", "conflict");
  await expect(alerts.nth(5)).toHaveAttribute("data-tone", "error");
  expect(await page.locator("[aria-live]").count()).toBe(0);
  await expectNoHorizontalOverflow(page, "Feedback Story");
});

for (const [storyId, roleName] of [
  ["foundations--dialog-overlay", "dialog"],
  ["foundations--alert-dialog-overlay", "alertdialog"],
  ["foundations--sheet-overlay", "dialog"],
] as const) {
  test(`${roleName} ${storyId} stays bounded and actions remain reachable`, async ({
    page,
  }) => {
    await openStory(page, storyId);
    const content = page.getByRole(roleName);
    await expect(content).toBeVisible();
    await expectWithinViewport(page, content, `${storyId} content`);
    expect(
      await content.evaluate(
        (element: HTMLElement) => element.scrollHeight > element.clientHeight
      )
    ).toBe(true);

    await content.evaluate((element: HTMLElement) => {
      element.scrollTop = element.scrollHeight;
    });
    const footer = content.locator('[data-slot$="footer"]');
    await expect(footer).toBeVisible();
    await expectWithinViewport(page, footer, `${storyId} footer`);
    await expectNoHorizontalOverflow(page, storyId);
  });
}
