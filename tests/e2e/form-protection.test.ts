/* oxlint-disable vitest/prefer-importing-vitest-globals --
 * This is a Playwright spec (uses @playwright/test's `test`/`expect`), not a
 * Vitest test file. oxlint's vitest plugin unconditionally matches
 * `**\/*.test.ts` (see node_modules/ultracite/config/oxlint/vitest/index.mjs)
 * and its override wins over both top-level rule offs and scoped overrides
 * in the consuming oxlint.config.ts (verified empirically against oxlint
 * 1.76.0). File renamed from role-matrix.spec.ts to role-matrix.test.ts to
 * satisfy vitest/consistent-test-filename's naming convention (that rule is
 * file-level with no AST anchor, so it cannot be inline-disabled at all —
 * renaming was the only fix). Playwright's default testMatch already covers
 * both *.spec.ts and *.test.ts, so this rename needed no config change.
 */
/**
 * EFCC form-protection end-to-end spec (issue #6 AC #6).
 *
 * Covers dirty-form discard confirmation, submit-button structural
 * assertions, and safe rendering (no injected scripts or event handlers
 * after Programs renders).
 *
 * Each `test()` block runs once per Playwright project (alice / bob / noah)
 * because `playwright.config.ts` registers three named projects, each with
 * its own `storageState`. Per-step `test.skip()` gates limit execution to
 * the project specified by the acceptance plan
 *   (docs/specs/070-form-protection-acceptance-plan.md):
 *   AC 6a — Dirty-form discard confirmation blocks on cancel
 *   AC 6b — Confirm discards and navigates to target section
 *   AC 6c — Submit button carries data-action="demo-form-submit"
 *   AC 6d — Safe rendering: no injected scripts or event handlers
 *
 * All steps run as MEMBER (alice) on the phone viewport because the demo
 * detail task is universally accessible and the dirty-form flow is role-
 * independent.
 *
 * Selectors are built against the Fixed DOM contract described in the
 * issue #6 driver context. The parallel client implementation produces
 * exactly that DOM.
 *
 * No `process`/`fs`/node-specific globals are referenced here — only
 * Playwright's test API — so this file's compilation is independent of
 * `@types/node` (see ADR-0012).
 */
import { test, expect } from "@playwright/test";
import type { ElementHandle, Frame, Page } from "@playwright/test";

/**
 * Project name -> EFCC application-layer credential pair.
 * Pin 1:1 to .auth/<project>.storage.json + the Users-sheet rows seeded
 * for this project (alice/1234 MEMBER, bob/5678 STAFF, noah/6883 ADMIN).
 */
const CREDENTIALS_BY_PROJECT: Record<
  string,
  { username: string; pin: string }
> = {
  alice: { username: "alice", pin: "1234" },
  bob: { username: "bob", pin: "5678" },
  noah: { username: "noah", pin: "6883" },
};

const PHONE_VIEWPORT = { width: 375, height: 812 };
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const APP_READY_TIMEOUT_MS = 30_000;

/* oxlint-disable unicorn/prefer-dom-node-dataset -- this is a Playwright
 * ElementHandle (frame.$ result), not a live DOM node; it has no
 * .dataset accessor, only getAttribute. Same workaround as auth.ts's
 * readAppState — wrapped in a try/catch helper because oxlint 1.76.0
 * does not reliably suppress this rule via oxlint-disable-next-line
 * when the flagged getAttribute call is followed by a chained .catch().
 */
async function readAppState(handle: ElementHandle): Promise<string | null> {
  try {
    return await handle.getAttribute("data-app-state");
  } catch {
    return null;
  }
}

/* oxlint-enable unicorn/prefer-dom-node-dataset */

/**
 * Resolve the EFCC app frame inside the Google sandbox iframe chain.
 * The app frame is identified by having an element with id="app" that
 * carries a `data-app-state` attribute (any value — SIGNED_OUT, READY,
 * etc.).
 */
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

/**
 * Drive the EFCC login form. Assumes the frame is already mounted
 * (data-app-state === "SIGNED_OUT" — `restoreFromStorage_` only
 * transitions past that on a valid stored session, which storage-state
 * auth doesn't seed).
 */
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

/**
 * Click a root-section navigation item for the given section key.
 * Works on both phone and desktop layouts because both render
 * navigation buttons with `data-section="<key>"`.
 */
async function clickSectionNav(
  frame: Frame,
  sectionKey: string
): Promise<void> {
  await frame.locator(`[data-section="${sectionKey}"]`).first().click();
}

// ---------------------------------------------------------------------------
// AC 6a: Dirty-form discard confirmation blocks navigation on cancel
// ---------------------------------------------------------------------------
test.describe("EFCC form-protection — dirty-form discard blocks on cancel (AC 6a)", () => {
  test.use({ viewport: PHONE_VIEWPORT });

  test("Discard confirmation appears and blocks navigation when form is dirty", async ({
    page,
  }) => {
    test.skip(
      test.info().project.name !== "alice",
      `AC 6a is MEMBER-specific; skipping ${test.info().project.name}.`
    );

    const frame = await resolveAppFrame(page);
    await login(
      frame,
      CREDENTIALS_BY_PROJECT.alice.username,
      CREDENTIALS_BY_PROJECT.alice.pin
    );

    // Navigate to Events and open the demo edit task.
    await clickSectionNav(frame, "events");
    await expect(frame.locator("#app-content h2").first()).toHaveText("聚會");
    await frame.locator('.btn-open-task[data-task="events-edit-demo"]').click();
    const taskSection = frame.locator(
      'section.view-task[data-task-key="events-edit-demo"]'
    );
    await expect(taskSection).toBeVisible();

    // Make the form dirty by typing into the demo edit field.
    const formInput = taskSection.locator("input, textarea, select").first();
    await formInput.fill("modified value");

    // Attempt to navigate away (click Programs in the phone nav).
    await clickSectionNav(frame, "programs");

    // AC: The confirmation dialog renders and blocks navigation.
    const confirmDialog = frame.locator(".discard-overlay");
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog).toContainText("捨棄");

    // Click the cancel button ("繼續編輯") — navigation is blocked and
    // the task view remains visible.
    const cancelBtn = confirmDialog.locator(".btn-secondary");
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    // AC: The dialog is dismissed and the task view is still mounted.
    await expect(confirmDialog).not.toBeVisible();
    await expect(taskSection).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// AC 6b: Confirm discards and navigates to target section
// ---------------------------------------------------------------------------
test.describe("EFCC form-protection — confirm discards and navigates (AC 6b)", () => {
  test.use({ viewport: PHONE_VIEWPORT });

  test("Confirm dialog discards form changes and navigates to target section", async ({
    page,
  }) => {
    test.skip(
      test.info().project.name !== "alice",
      `AC 6b is MEMBER-specific; skipping ${test.info().project.name}.`
    );

    const frame = await resolveAppFrame(page);
    await login(
      frame,
      CREDENTIALS_BY_PROJECT.alice.username,
      CREDENTIALS_BY_PROJECT.alice.pin
    );

    // Navigate to Events and open the demo edit task.
    await clickSectionNav(frame, "events");
    await expect(frame.locator("#app-content h2").first()).toHaveText("聚會");
    await frame.locator('.btn-open-task[data-task="events-edit-demo"]').click();
    await expect(
      frame.locator('section.view-task[data-task-key="events-edit-demo"]')
    ).toBeVisible();

    // Make the form dirty.
    const formInput = frame
      .locator('section.view-task[data-task-key="events-edit-demo"]')
      .locator("input, textarea, select")
      .first();
    await formInput.fill("modified value");

    // Attempt to navigate away.
    await clickSectionNav(frame, "programs");

    // Confirm the discard dialog.
    const confirmDialog = frame.locator(".discard-overlay");
    await expect(confirmDialog).toBeVisible();
    const confirmBtn = confirmDialog.locator(".btn-danger");
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // AC: The dialog is dismissed and the app lands on the target
    // section (Programs), not the Events detail task.
    await expect(confirmDialog).not.toBeVisible();
    await expect(
      frame.locator('section.view-task[data-task-key="events-edit-demo"]')
    ).toHaveCount(0);
    await expect(frame.locator("#app-content h2").first()).toHaveText("課程");
  });
});

// ---------------------------------------------------------------------------
// AC 6c: Submit button carries data-action="demo-form-submit"
// ---------------------------------------------------------------------------
test.describe("EFCC form-protection — submit button structural assertion (AC 6c)", () => {
  test.use({ viewport: PHONE_VIEWPORT });

  test('Submit button has data-action="demo-form-submit"', async ({ page }) => {
    test.skip(
      test.info().project.name !== "alice",
      `AC 6c is MEMBER-specific; skipping ${test.info().project.name}.`
    );

    const frame = await resolveAppFrame(page);
    await login(
      frame,
      CREDENTIALS_BY_PROJECT.alice.username,
      CREDENTIALS_BY_PROJECT.alice.pin
    );

    // Navigate to Events and open the demo edit task.
    await clickSectionNav(frame, "events");
    await expect(frame.locator("#app-content h2").first()).toHaveText("聚會");
    await frame.locator('.btn-open-task[data-task="events-edit-demo"]').click();
    await expect(
      frame.locator('section.view-task[data-task-key="events-edit-demo"]')
    ).toBeVisible();

    // AC: The submit button inside the task view has the expected
    // data-action attribute. This is a structural assertion — the real
    // RPC path requires the real server, so we assert the DOM contract
    // that the client-side view produces.
    const submitBtn = frame.locator(
      'section.view-task[data-task-key="events-edit-demo"] ' +
        'button[data-action="demo-form-submit"]'
    );
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toHaveAttribute("data-action", "demo-form-submit");
  });
});

// ---------------------------------------------------------------------------
// AC 6d: Safe rendering — no injected scripts or event handlers
// ---------------------------------------------------------------------------
test.describe("EFCC form-protection — safe rendering (AC 6d)", () => {
  test.use({ viewport: PHONE_VIEWPORT });

  test("Programs list renders without injected scripts or event handlers", async ({
    page,
  }) => {
    test.skip(
      test.info().project.name !== "alice",
      `AC 6d is MEMBER-specific; skipping ${test.info().project.name}.`
    );

    const frame = await resolveAppFrame(page);
    await login(
      frame,
      CREDENTIALS_BY_PROJECT.alice.username,
      CREDENTIALS_BY_PROJECT.alice.pin
    );

    // Navigate to Programs and wait for the list to render.
    await clickSectionNav(frame, "programs");
    await expect(frame.locator("#app-content h2").first()).toHaveText("課程");

    // AC: No <script> tags exist inside the rendered content region.
    const scriptCount = await frame.evaluate(
      () => document.querySelectorAll("#app-content script").length
    );
    expect(scriptCount).toBe(0);

    // AC: No element in the Programs list has an injected onerror or
    // onclick attribute (proving safe rendering — the server must not
    // pass unsanitized HTML with inline event handlers into the DOM).
    const appContent = frame.locator("#app-content");
    const hasDangerousAttrs = await appContent.evaluate((el) => {
      const DANGEROUS_ATTRS = [
        "onerror",
        "onclick",
        "onload",
        "onmouseover",
        "onfocus",
        "onblur",
        "onsubmit",
        "onchange",
        "oninput",
      ];
      const allElements = [...el.querySelectorAll("*")];
      return allElements.some((e) =>
        DANGEROUS_ATTRS.some((attr) => e.hasAttribute(attr))
      );
    });
    expect(hasDangerousAttrs).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC 6e: safe rendering also holds at the desktop side-rail width (STAFF)
// ---------------------------------------------------------------------------
test.describe("EFCC form-protection — safe rendering at desktop width (AC 6e)", () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test("Programs list renders without injected scripts or event handlers on desktop", async ({
    page,
  }) => {
    test.skip(
      test.info().project.name !== "bob",
      `AC 6e is desktop-width-specific; skipping ${test.info().project.name}.`
    );

    const frame = await resolveAppFrame(page);
    await login(
      frame,
      CREDENTIALS_BY_PROJECT.bob.username,
      CREDENTIALS_BY_PROJECT.bob.pin
    );

    // Navigate to Programs via the desktop side rail and wait for the
    // list to render.
    await clickSectionNav(frame, "programs");
    await expect(frame.locator("#app-content h2").first()).toHaveText("課程");

    // AC: No <script> tags exist inside the rendered content region.
    const scriptCount = await frame.evaluate(
      () => document.querySelectorAll("#app-content script").length
    );
    expect(scriptCount).toBe(0);

    // AC: No element in the Programs list has an injected event-handler
    // attribute at the desktop width either.
    const appContent = frame.locator("#app-content");
    const hasDangerousAttrs = await appContent.evaluate((el) => {
      const DANGEROUS_ATTRS = [
        "onerror",
        "onclick",
        "onload",
        "onmouseover",
        "onfocus",
        "onblur",
        "onsubmit",
        "onchange",
        "oninput",
      ];
      const allElements = [...el.querySelectorAll("*")];
      return allElements.some((e) =>
        DANGEROUS_ATTRS.some((attr) => e.hasAttribute(attr))
      );
    });
    expect(hasDangerousAttrs).toBe(false);
  });
});
