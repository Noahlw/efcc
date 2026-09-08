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
  await expect(page.locator("[data-foundation-state]")).toHaveAttribute(
    "data-foundation-state",
    "default compact"
  );
  const card = page.locator('[data-testid="foundation-surface-card"]');
  await expect(card).toBeVisible();
  await expectWithinViewport(page, card, "surface card");
  await expect(card).toHaveClass(/overflow-visible/u);
  const defaultPadding = await card.evaluate((element) => {
    const style = getComputedStyle(element);
    return [
      style.paddingTop,
      style.paddingRight,
      style.paddingBottom,
      style.paddingLeft,
    ].map((value) => Number.parseFloat(value));
  });
  expect(
    defaultPadding.every((value) => value > 0),
    "default Surface keeps approved internal padding"
  ).toBe(true);
  const compact = page.locator('[data-testid="foundation-surface-card-sm"]');
  await expect(compact).toHaveAttribute("data-size", "sm");
  const compactPadding = await compact.evaluate((element) => {
    const style = getComputedStyle(element);
    return [
      style.paddingTop,
      style.paddingRight,
      style.paddingBottom,
      style.paddingLeft,
    ].map((value) => Number.parseFloat(value));
  });
  expect(
    compactPadding.every((value) => value > 0),
    "compact Surface keeps approved internal padding"
  ).toBe(true);
  await expectNoHorizontalOverflow(page, "Surface Story");
});

test("CardFooter stays full-bleed inside the Card boundary", async ({
  page,
}) => {
  await openStory(page, "foundations--surface-card-footer");
  const card = page.locator('[data-testid="foundation-card-footer-card"]');
  const footer = page.locator('[data-testid="foundation-card-footer"]');
  await expect(card).toBeVisible();
  await expect(footer).toBeVisible();

  const cardBox = await rect(card);
  const footerBox = await rect(footer);
  expect(footerBox.left, "CardFooter left edge").toBeGreaterThanOrEqual(
    cardBox.left - 1
  );
  expect(footerBox.right, "CardFooter right edge").toBeLessThanOrEqual(
    cardBox.right + 1
  );
  expect(footerBox.bottom, "CardFooter bottom edge").toBeLessThanOrEqual(
    cardBox.bottom + 1
  );
  expect(
    cardBox.left - footerBox.left,
    "CardFooter reaches left edge"
  ).toBeLessThanOrEqual(2);
  expect(
    cardBox.right - footerBox.right,
    "CardFooter reaches right edge"
  ).toBeLessThanOrEqual(2);
  expect(
    cardBox.bottom - footerBox.bottom,
    "CardFooter reaches bottom edge"
  ).toBeLessThanOrEqual(2);
  await expectNoHorizontalOverflow(page, "CardFooter Story");
});

test("Feedback exposes six tones and independent announcement ownership", async ({
  page,
}) => {
  await openStory(page, "foundations--feedback");
  const alerts = page.locator('[data-slot="alert"]');
  await expect(alerts).toHaveCount(9);
  await expect(alerts.nth(0)).toHaveAttribute("data-tone", "info");
  await expect(alerts.nth(1)).toHaveAttribute("data-tone", "success");
  await expect(alerts.nth(2)).toHaveAttribute("data-tone", "pending");
  await expect(alerts.nth(3)).toHaveAttribute("data-tone", "warning");
  await expect(alerts.nth(4)).toHaveAttribute("data-tone", "conflict");
  await expect(alerts.nth(5)).toHaveAttribute("data-tone", "error");
  const ownership = page.locator(
    '[data-testid="foundation-feedback-announcement-states"]'
  );
  await expect(ownership.getByRole("status")).toHaveAttribute(
    "data-tone",
    "success"
  );
  await expect(ownership.getByRole("status")).toHaveAttribute(
    "aria-live",
    "polite"
  );
  await expect(ownership.getByRole("alert")).toHaveAttribute(
    "data-tone",
    "error"
  );
  expect(await ownership.locator('[data-announcement="none"]').count()).toBe(1);
  await expectNoHorizontalOverflow(page, "Feedback Story");
});

const overlayStories = [
  {
    storyId: "foundations--dialog-overlay",
    roleName: "dialog",
    triggerId: "dialog-trigger",
    state: "default",
    longContent: false,
    busyDisabled: false,
  },
  {
    storyId: "foundations--dialog-long-content",
    roleName: "dialog",
    triggerId: "dialog-trigger",
    state: "long-content",
    longContent: true,
    busyDisabled: false,
  },
  {
    storyId: "foundations--dialog-busy-disabled",
    roleName: "dialog",
    triggerId: "dialog-trigger",
    state: "busy-disabled",
    longContent: false,
    busyDisabled: true,
  },
  {
    storyId: "foundations--alert-dialog-overlay",
    roleName: "alertdialog",
    triggerId: "alert-dialog-trigger",
    state: "review-destructive",
    longContent: false,
    busyDisabled: false,
  },
  {
    storyId: "foundations--alert-dialog-long-content",
    roleName: "alertdialog",
    triggerId: "alert-dialog-trigger",
    state: "long-content",
    longContent: true,
    busyDisabled: false,
  },
  {
    storyId: "foundations--alert-dialog-busy-disabled",
    roleName: "alertdialog",
    triggerId: "alert-dialog-trigger",
    state: "busy-disabled",
    longContent: false,
    busyDisabled: true,
  },
  {
    storyId: "foundations--sheet-overlay",
    roleName: "dialog",
    triggerId: "sheet-trigger",
    state: "default",
    longContent: false,
    busyDisabled: false,
  },
  {
    storyId: "foundations--sheet-long-content",
    roleName: "dialog",
    triggerId: "sheet-trigger",
    state: "long-content",
    longContent: true,
    busyDisabled: false,
  },
  {
    storyId: "foundations--sheet-busy-disabled",
    roleName: "dialog",
    triggerId: "sheet-trigger",
    state: "busy-disabled",
    longContent: false,
    busyDisabled: true,
  },
] as const;

for (const {
  storyId,
  roleName,
  triggerId,
  state,
  longContent,
  busyDisabled,
} of overlayStories) {
  test(`${roleName} ${storyId} exposes its ${state} state with reachable actions`, async ({
    page,
  }) => {
    await openStory(page, storyId);
    await expect(page.locator("[data-foundation-state]")).toHaveAttribute(
      "data-foundation-state",
      state
    );
    const content = page.getByRole(roleName);
    await expect(content).toBeVisible();
    await expectWithinViewport(page, content, `${storyId} content`);
    if (longContent) {
      expect(
        await content.evaluate(
          (element: HTMLElement) => element.scrollHeight > element.clientHeight
        )
      ).toBe(true);
    }

    if (longContent) {
      await content.evaluate((element: HTMLElement) => {
        element.scrollTop = element.scrollHeight;
      });
    }
    const footer = content.locator('[data-slot$="footer"]');
    await expect(footer).toBeVisible();
    await expectWithinViewport(page, footer, `${storyId} footer`);
    await expectNoHorizontalOverflow(page, storyId);
    if (busyDisabled) {
      await expect(content.locator('[aria-busy="true"]')).toBeDisabled();
    }

    if (triggerId === "sheet-trigger") {
      await expect(content).toHaveAttribute("data-side", "bottom");
      const safeAreaEvidence = await content.evaluate((element) => {
        const classNames = Array.from(element.classList);
        return {
          ownsEnvFormula: classNames.includes(
            "pb-[env(safe-area-inset-bottom,0px)]"
          ),
          computedPaddingBottomPx: Number.parseFloat(
            getComputedStyle(element).paddingBottom
          ),
        };
      });
      expect(
        safeAreaEvidence.ownsEnvFormula,
        "machine proof: SheetContent owns the safe-area env() formula; this is not positive device-inset evidence"
      ).toBe(true);
      expect(
        safeAreaEvidence.computedPaddingBottomPx,
        "desktop fallback is a non-negative computed value, not proof of a device inset"
      ).toBeGreaterThanOrEqual(0);
    }

    const trigger = page.getByTestId(triggerId);
    // Modal primitives intentionally hide their trigger from the accessible
    // tree while the overlay is open; it becomes the focus-return target on
    // dismissal.
    await expect(trigger).toBeAttached();
    const focusable = content.locator(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
    );
    await expect(focusable).not.toHaveCount(0);
    await focusable.last().focus();
    await page.keyboard.press("Tab");
    await expect(focusable.first()).toBeFocused();
    await focusable.first().focus();
    await page.keyboard.press("Shift+Tab");
    await expect(focusable.last()).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(content).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.press("Enter");
    await expect(content).toBeVisible();
  });
}
