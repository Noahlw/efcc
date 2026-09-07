/* oxlint-disable vitest/prefer-importing-vitest-globals */
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
      width: box.width,
      height: box.height,
      right: box.right,
      bottom: box.bottom,
    };
  });
}

async function expectFloor(locator: Locator, label: string) {
  const box = await rect(locator);
  expect(box.height, `${label} height`).toBeGreaterThanOrEqual(44);
  expect(box.width, `${label} width`).toBeGreaterThanOrEqual(44);
  return box;
}

test("Button and icon controls keep target floor, wrapping, and no overflow", async ({
  page,
}) => {
  await openStory(page, "controls--button-states");
  const buttons = page.locator('[data-slot="button"]');
  const count = await buttons.count();
  expect(count).toBeGreaterThanOrEqual(8);
  for (let index = 0; index < count; index += 1) {
    await expectFloor(buttons.nth(index), `button ${index}`);
  }
  const longTc = page.locator('[data-testid="t08-button-long-tc"]');
  const longLatin = page.locator('[data-testid="t08-button-long-latin"]');
  expect((await rect(longTc)).height).toBeGreaterThan(44);
  expect((await rect(longLatin)).height).toBeGreaterThan(44);
  const overflow = await page.evaluate(
    () =>
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth
      ) - window.innerWidth
  );
  expect(overflow, "Button Story horizontal overflow").toBeLessThanOrEqual(1);

  await openStory(page, "controls--icon-button-states");
  const icon = page.getByRole("button", { name: "開啟通知" });
  await expectFloor(icon, "icon button");
  expect(await icon.locator("svg").boundingBox()).not.toBeNull();
});

test("Input and Textarea keep native semantics, target floor, and focus presentation", async ({
  page,
}) => {
  await openStory(page, "controls--input-states");
  const input = page.locator("#t08-input-normal");
  await expectFloor(input, "Input");
  await expect(page.locator("#t08-input-long")).toHaveJSProperty(
    "type",
    "text"
  );
  await input.focus();
  expect(
    await input.evaluate((element: HTMLElement) => {
      const style = getComputedStyle(element);
      return (
        element.matches(":focus-visible") &&
        (style.outlineStyle !== "none" || style.boxShadow !== "none")
      );
    })
  ).toBe(true);

  await openStory(page, "controls--textarea-states");
  const textarea = page.locator("#t08-textarea");
  const textareaBox = await rect(textarea);
  expect(textareaBox.height).toBeGreaterThanOrEqual(64);
  await expect(textarea).toHaveAttribute("rows", "3");
});

test("Checkbox and Switch preserve state semantics and 44px roots", async ({
  page,
}) => {
  await openStory(page, "controls--checkbox-states");
  await expectFloor(
    page.getByRole("checkbox", { name: "全選目前結果" }),
    "mixed checkbox"
  );
  await expect(
    page.getByRole("checkbox", { name: "全選目前結果" })
  ).toHaveAttribute("aria-checked", "mixed");
  await expectFloor(
    page.getByRole("checkbox", { name: "停用項目" }),
    "disabled checkbox"
  );

  await openStory(page, "controls--switch-states");
  const toggle = page.getByRole("switch", { name: "啟用通知" });
  await expectFloor(toggle, "switch");
  const visualTrack = await toggle.evaluate((element: HTMLElement) => {
    const style = getComputedStyle(element, "::before");
    return { width: style.width, height: style.height };
  });
  expect(visualTrack.width).toBe("32px");
  expect(Number.parseFloat(visualTrack.height)).toBeCloseTo(18.4, 1);
  const before = await rect(toggle);
  await toggle.click();
  const after = await rect(toggle);
  expect(after.width).toBe(before.width);
  expect(after.height).toBe(before.height);
});

test("Select bounds closed values, wraps open options, and returns focus", async ({
  page,
}) => {
  await openStory(page, "controls--select-states");
  const trigger = page.getByRole("combobox", { name: "長活動類型" });
  await expectFloor(trigger, "Select trigger");
  const triggerBox = await rect(trigger);
  const containerBox = await rect(page.locator("label").first());
  expect(triggerBox.right).toBeLessThanOrEqual(containerBox.right + 1);
  await trigger.click();
  const option = page.getByRole("option", { name: /一個很長的繁體中文選項/u });
  await expect(option).toBeVisible();
  const optionBox = await rect(option);
  expect(optionBox.width).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth)
  );
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("the browser contract detector fails on a deliberately undersized test fixture", async ({
  page,
}) => {
  await openStory(page, "controls--button-states");
  const negative = await page.evaluate(() => {
    const element = document.createElement("button");
    element.dataset.t08Negative = "true";
    element.style.height = "32px";
    element.style.width = "32px";
    document.body.append(element);
    return element.getBoundingClientRect().toJSON();
  });
  expect(negative.height).toBeLessThan(44);
  let failure = "";
  try {
    await expectFloor(
      page.locator('[data-t08-negative="true"]'),
      "negative fixture"
    );
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  expect(failure).toContain("negative fixture height");
  await expect(page.locator('[data-t08-negative="true"]')).toHaveJSProperty(
    "tagName",
    "BUTTON"
  );
});
