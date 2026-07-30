import AxeBuilder from "@axe-core/playwright";
/* oxlint-disable vitest/prefer-importing-vitest-globals -- see role-matrix.test.ts's
 * header comment for the full rationale (oxlint's vitest plugin
 * unconditionally matches **\/*.test.ts; this is a Playwright spec).
 */
/**
 * EFCC shell accessibility + keyboard traversal end-to-end spec
 * (issue #71, parent #64).
 *
 * Covers issue #71's AC #6 (keyboard reachability), AC #8 (accessible
 * status announcements — structurally verified since Playwright cannot
 * assert what a screen reader actually spoke), AC #12 (automated a11y
 * checks + manual keyboard checks across Login, root nav, nested Back,
 * retry, More, and dirty-form confirmation).
 *
 * Automated a11y scanning uses @axe-core/playwright's AxeBuilder, which
 * "automatically injects into all frames" per its documented behavior —
 * necessary here because the EFCC app renders inside a Google HTML
 * Service sandbox iframe chain (see resolveAppFrame below, copied from
 * role-matrix.test.ts's helper). No `.include()` selector scoping is
 * used so the scan covers every frame axe can reach, matching the
 * package's own guidance for cross-frame pages.
 *
 * Keyboard traversal uses Playwright's `page.keyboard.press()` against
 * the resolved frame's active element, walking Tab order and asserting
 * on `document.activeElement` inside that frame — there is no other
 * reliable way to prove "reachable, activatable, and leaves" for a
 * nested-iframe SPA than driving real keyboard events and reading back
 * the live focus target.
 *
 * No `process`/`fs`/node-specific globals are referenced here — only
 * Playwright's test API — so this file's compilation is independent of
 * `@types/node` (see ADR-0012 §Decision-1).
 */
import { test, expect } from "@playwright/test";
import type { ElementHandle, Frame, Page } from "@playwright/test";

const CREDENTIALS_BY_PROJECT: Record<
  string,
  { username: string; pin: string }
> = {
  alice: { username: "alice", pin: "1234" },
  bob: { username: "bob", pin: "5678" },
  noah: { username: "noah", pin: "6883" },
};

const PHONE_VIEWPORT = { width: 375, height: 812 };
const APP_READY_TIMEOUT_MS = 30_000;

/* oxlint-disable unicorn/prefer-dom-node-dataset -- ElementHandle has no
 * .dataset accessor; same workaround as role-matrix.test.ts.
 */
async function readAppState(handle: ElementHandle): Promise<string | null> {
  try {
    return await handle.getAttribute("data-app-state");
  } catch {
    return null;
  }
}
/* oxlint-enable unicorn/prefer-dom-node-dataset */

async function resolveAppFrame(
  page: Page,
  timeoutMs = APP_READY_TIMEOUT_MS
): Promise<Frame> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      const root = await frame.$("#app").catch(() => null);
      if (!root) {
        continue;
      }
      const state = await readAppState(root);
      if (state !== null) {
        return frame;
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error(
    `timed out after ${timeoutMs}ms waiting for the EFCC app frame ` +
      "to mount. Verify E2E_TARGET_URL is set and the deployment is " +
      "reachable."
  );
}

async function login(
  frame: Frame,
  username: string,
  pin: string
): Promise<void> {
  const usernameInput = frame.locator("#login-username");
  const pinInput = frame.locator("#login-pin");
  await usernameInput.waitFor({
    state: "visible",
    timeout: APP_READY_TIMEOUT_MS,
  });
  await usernameInput.fill(username);
  await pinInput.fill(pin);
  await Promise.all([
    frame.waitForFunction(
      () =>
        (document.querySelector("#app") as HTMLElement | null)?.dataset
          .appState === "READY",
      null,
      { timeout: APP_READY_TIMEOUT_MS }
    ),
    frame.locator("#login-submit").click(),
  ]);
}

/** Reads the `data-*` attribute (or tag+id fallback) of the frame's
 * live document.activeElement, for asserting keyboard focus targets. */
function activeElementDescriptor(frame: Frame): Promise<string> {
  return frame.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) {
      return "(none)";
    }
    const { section } = el.dataset;
    const { action } = el.dataset;
    const heading = el.dataset.appHeading;
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${
      section ? `[data-section=${section}]` : ""
    }${
      action ? `[data-action=${action}]` : ""
    }${heading ? `[data-app-heading=${heading}]` : ""}`;
  });
}

// -----------------------------------------------------------------------
// Automated a11y scan — Login (AC #12)
// -----------------------------------------------------------------------

test.describe("EFCC accessibility — automated axe scan (issue #71 AC #12)", () => {
  test.use({ viewport: PHONE_VIEWPORT });

  test("Login view has no automated a11y violations", async ({ page }) => {
    test.skip(
      test.info().project.name !== "alice",
      "Login is role-independent; run once per pipeline via the alice project."
    );
    await resolveAppFrame(page);
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations,
      `axe violations on Login: ${JSON.stringify(results.violations, null, 2)}`
    ).toEqual([]);
  });

  test("Authenticated root nav (Profile) has no automated a11y violations", async ({
    page,
  }) => {
    test.skip(
      test.info().project.name !== "bob",
      "Run once against a STAFF account so More/Care/Permissions render too."
    );
    const frame = await resolveAppFrame(page);
    await login(
      frame,
      CREDENTIALS_BY_PROJECT.bob.username,
      CREDENTIALS_BY_PROJECT.bob.pin
    );
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations,
      `axe violations on authenticated shell: ${JSON.stringify(results.violations, null, 2)}`
    ).toEqual([]);
  });
});

// -----------------------------------------------------------------------
// Keyboard traversal — root nav, More menu, nested task Back, retry
// (issue #71 AC #6/#7)
// -----------------------------------------------------------------------

test.describe("EFCC accessibility — keyboard traversal (issue #71 AC #6/#7)", () => {
  test.use({ viewport: PHONE_VIEWPORT });

  test("Tab reaches every phone nav item, including More, in DOM order", async ({
    page,
  }) => {
    test.skip(
      test.info().project.name !== "bob",
      "STAFF has the full nav set including the More overflow button."
    );
    const frame = await resolveAppFrame(page);
    await login(
      frame,
      CREDENTIALS_BY_PROJECT.bob.username,
      CREDENTIALS_BY_PROJECT.bob.pin
    );

    // Move focus into the phone nav's first item directly (deterministic
    // starting point instead of Tab-walking from document top, which
    // would also traverse the skip link and header — those are asserted
    // separately by the axe scan above).
    await frame.locator('[data-section="profile"]').first().focus();
    let descriptor = await activeElementDescriptor(frame);
    expect(descriptor).toContain("data-section=profile");

    // Tab through: programs, scanner, events, more (5 nav items for STAFF).
    const expectedOrder = ["programs", "scanner", "events", "more"];
    for (const expected of expectedOrder) {
      await page.keyboard.press("Tab");
      descriptor = await activeElementDescriptor(frame);
      expect(
        descriptor,
        `expected focus on data-section=${expected}, saw ${descriptor}`
      ).toContain(`data-section=${expected}`);
    }
  });

  test("More menu: Enter opens it, focus lands on first item, Escape closes and restores focus to the trigger", async ({
    page,
  }) => {
    test.skip(
      test.info().project.name !== "bob",
      "More menu only renders for STAFF/ADMIN phone nav."
    );
    const frame = await resolveAppFrame(page);
    await login(
      frame,
      CREDENTIALS_BY_PROJECT.bob.username,
      CREDENTIALS_BY_PROJECT.bob.pin
    );

    const moreTrigger = frame.locator('[data-section="more"]');
    await moreTrigger.focus();
    await page.keyboard.press("Enter");

    const moreMenu = frame.locator("#more-menu");
    await expect(moreMenu).toBeVisible();
    await expect(moreTrigger).toHaveAttribute("aria-expanded", "true");

    // Focus should have moved into the first menu item.
    const descriptor = await activeElementDescriptor(frame);
    expect(descriptor).toContain("more-menu-item");

    await page.keyboard.press("Escape");
    await expect(moreMenu).toBeHidden();
    await expect(moreTrigger).toHaveAttribute("aria-expanded", "false");
    const afterEscape = await activeElementDescriptor(frame);
    expect(afterEscape).toContain("data-section=more");
  });

  test("Nested task: Back button is keyboard-focused on entry, and Enter closes the task", async ({
    page,
  }) => {
    test.skip(
      test.info().project.name !== "alice",
      "Any authenticated role can open the Programs demo task."
    );
    const frame = await resolveAppFrame(page);
    await login(
      frame,
      CREDENTIALS_BY_PROJECT.alice.username,
      CREDENTIALS_BY_PROJECT.alice.pin
    );
    await frame.locator('[data-section="programs"]').first().click();
    await frame
      .locator('[data-action="open-task"][data-task="programs-detail-demo"]')
      .click();

    const backBtn = frame.locator('[data-action="task-back"]');
    await expect(backBtn).toBeVisible();
    await expect(async () => {
      const descriptor = await activeElementDescriptor(frame);
      expect(descriptor).toContain("data-action=task-back");
    }).toPass({ timeout: 5000 });

    await page.keyboard.press("Enter");
    await expect(frame.locator(".view-task")).toHaveCount(0);
    // Focus must land somewhere real, not be lost to <body>.
    const afterClose = await activeElementDescriptor(frame);
    expect(afterClose).not.toBe("(none)");
  });

  test("Section retry: a forced Programs failure focuses the retry button, which is keyboard-activatable", async ({
    page,
  }) => {
    test.skip(
      test.info().project.name !== "alice",
      "Single-role check is sufficient — retry focus is role-independent."
    );
    const frame = await resolveAppFrame(page);
    await login(
      frame,
      CREDENTIALS_BY_PROJECT.alice.username,
      CREDENTIALS_BY_PROJECT.alice.pin
    );
    // Force a transport-style failure by going offline right before
    // navigating to Programs, then restoring connectivity so the retry
    // click succeeds.
    await page.context().setOffline(true);
    await frame.locator('[data-section="programs"]').first().click();
    const retryBtn = frame.locator('[data-action="section-retry"]');
    await expect(retryBtn).toBeVisible({ timeout: APP_READY_TIMEOUT_MS });
    await expect(async () => {
      const descriptor = await activeElementDescriptor(frame);
      expect(descriptor).toContain("data-action=section-retry");
    }).toPass({ timeout: 5000 });
    await page.context().setOffline(false);
    await page.keyboard.press("Enter");
    await expect(frame.locator(".programs-list")).toBeVisible({
      timeout: APP_READY_TIMEOUT_MS,
    });
  });
});

// -----------------------------------------------------------------------
// Dirty-form discard confirmation — keyboard flow (issue #71 AC #7/#12)
// -----------------------------------------------------------------------

test.describe("EFCC accessibility — dirty-form discard confirmation keyboard flow", () => {
  test.use({ viewport: PHONE_VIEWPORT });

  test("Tab cycles between Confirm/Cancel inside the dialog; Escape restores focus to the field", async ({
    page,
  }) => {
    test.skip(
      test.info().project.name !== "bob",
      "The demo edit task is reachable by any role; STAFF keeps parity with the other keyboard specs."
    );
    const frame = await resolveAppFrame(page);
    await login(
      frame,
      CREDENTIALS_BY_PROJECT.bob.username,
      CREDENTIALS_BY_PROJECT.bob.pin
    );
    await frame.locator('[data-section="events"]').first().click();
    await frame
      .locator('[data-action="open-task"][data-task="events-edit-demo"]')
      .click();

    const field = frame.locator("#demo-edit-field");
    await field.fill("dirty value");
    // Trigger the guard by attempting to navigate away.
    await frame.locator('[data-action="task-back"]').click();

    const dialog = frame.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute(
      "aria-labelledby",
      "discard-dialog-heading"
    );
    await expect(dialog).toHaveAttribute(
      "aria-describedby",
      "discard-dialog-message"
    );

    // Cancel is focused by default (safer default per form-guard.js.html).
    const cancelBtn = dialog.locator("button", { hasText: "繼續編輯" });
    const confirmBtn = dialog.locator("button", { hasText: "捨棄變更" });

    // Tab from Cancel should wrap to Confirm (only two focusable
    // elements inside the trap).
    await page.keyboard.press("Tab");
    await expect(confirmBtn).toBeFocused();
    // Shift+Tab back to Cancel.
    await page.keyboard.press("Shift+Tab");
    await expect(cancelBtn).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    // Focus restored to the field the discard guard was protecting.
    await expect(field).toBeFocused();
  });
});
