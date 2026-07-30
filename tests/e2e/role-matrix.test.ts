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
 * EFCC role-matrix end-to-end spec (ADR-0012, issue #67).
 *
 * Each `test()` block runs once per Playwright project (alice / bob / noah)
 * because `playwright.config.ts` registers three named projects, each with
 * its own `storageState`. The project name selects the EFCC credential
 * pair to drive the application-layer login form with — see
 * `CREDENTIALS_BY_PROJECT` below.
 *
 * The AC numbers cited in each block comment refer to issue #67's
 * acceptance criteria (1:1 traced by
 * docs/specs/067-role-nav-acceptance-plan.md's steps 2-12).
 *
 * No `process`/`fs`/node-specific globals are referenced here — only
 * Playwright's test API — so this file's compilation is independent of
 * `@types/node` (see ADR-0012 §Decision-1).
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

/**
 * Project name -> server-authorized section keys, in the order
 * `bootstrapSectionsForRole_` returns them in Code.gs. Duplicated here
 * because this file compiles standalone (no shared server file) and the
 * matrix is small enough that drift is cheap to fix in two places — the
 * real safety net is the `bootstrapSectionsForRole_` unit tests in
 * tests/gas/role-navigation.test.js + this spec's structural assertions.
 */
const PHONE_SECTIONS_BY_PROJECT: Record<string, string[]> = {
  // MEMBER alice: profile, programs, events (3 items; no overflow,
  // so no 更多 button).
  alice: ["profile", "programs", "events"],
  // STAFF bob / ADMIN noah: profile, programs, scanner, events +
  // 更多 (care, permissions).
  bob: ["profile", "programs", "scanner", "events", "more"],
  noah: ["profile", "programs", "scanner", "events", "more"],
};

const OVERFLOW_SECTIONS_BY_PROJECT: Record<string, string[]> = {
  alice: [],
  bob: ["care", "permissions"],
  noah: ["care", "permissions"],
};

const DESKTOP_SECTIONS_BY_PROJECT: Record<string, string[]> = {
  alice: ["profile", "programs", "events"],
  bob: ["profile", "programs", "scanner", "events", "care", "permissions"],
  noah: ["profile", "programs", "scanner", "events", "care", "permissions"],
};

const PHONE_VIEWPORT = { width: 375, height: 812 };
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const APP_READY_TIMEOUT_MS = 30_000;

/**
 * oxlint-disable unicorn/prefer-dom-node-dataset -- this is a Playwright
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

/**
 * Resolve the EFCC app frame inside the Google sandbox iframe chain.
 *
 * The deployment serves the app inside outer page -> iframe#sandboxFrame
 * -> inner userHtmlFrame containing the #app element. Playwright's
 * `page.frames()` recursively enumerates every nested frame, so we walk
 * that list for the first one that exposes #app + a non-null
 * data-app-state (meaning the EFCC shell script has mounted and the
 * Google-account RPC bridge is alive). This is the same strategy
 * `auth.ts`'s `findAppFrame` helper uses; copied here so this spec is
 * self-contained for `tsc --noEmit` purposes and so the two files
 * don't have to share a non-public helper.
 */
async function resolveAppFrame(
  page: Page,
  timeoutMs = APP_READY_TIMEOUT_MS
): Promise<Frame> {
  await page.goto("", {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });
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

test.describe("EFCC role-matrix phone nav (issue #67 AC #2 / AC #4)", () => {
  test.use({ viewport: PHONE_VIEWPORT });

  test("MEMBER phone nav shows exactly profile/programs/events (AC #2)", async ({
    page,
  }) => {
    test.skip(
      test.info().project.name !== "alice",
      `AC #2 is MEMBER-specific; this run is the ${test.info().project.name} project.`
    );
    const frame = await resolveAppFrame(page);
    await login(
      frame,
      CREDENTIALS_BY_PROJECT.alice.username,
      CREDENTIALS_BY_PROJECT.alice.pin
    );

    const phoneNav = frame.locator("#app-nav-phone");
    await expect(phoneNav).toBeVisible();
    const sections = PHONE_SECTIONS_BY_PROJECT.alice;
    await expect(
      frame.locator(
        "#app-nav-phone > button.nav-item-phone:not(.nav-item-more)"
      )
    ).toHaveCount(sections.length);
    const dataSections = await frame
      .locator("#app-nav-phone > button.nav-item-phone:not(.nav-item-more)")
      // oxlint-disable-next-line unicorn/prefer-dom-node-dataset -- browser-context live DOM Element inside evaluateAll; `.dataset` is functionally equivalent but `.getAttribute` preserves the original assertion shape.
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-section")));
    expect(dataSections).toEqual(sections);
    // AC #2 negative: MEMBER must not see scanner/care/permissions.
    for (const forbidden of ["scanner", "care", "permissions"]) {
      expect(
        await frame
          .locator(`#app-nav-phone [data-section="${forbidden}"]`)
          .count()
      ).toBe(0);
    }
    // No 更多 button — MEMBER fits in PHONE_MAX_VISIBLE.
    await expect(frame.locator("#app-nav-phone .nav-item-more")).toHaveCount(0);
  });

  test("STAFF/ADMIN phone nav shows profile/programs/scanner/events + 更多 (AC #4)", async ({
    page,
  }) => {
    test.skip(
      test.info().project.name === "alice",
      `AC #4 is STAFF/ADMIN-specific; this run is the ${test.info().project.name} project.`
    );
    const project = test.info().project.name;
    const creds = CREDENTIALS_BY_PROJECT[project];
    if (!creds) {
      throw new Error(`no credentials registered for project ${project}`);
    }

    const frame = await resolveAppFrame(page);
    await login(frame, creds.username, creds.pin);

    const phoneNav = frame.locator("#app-nav-phone");
    await expect(phoneNav).toBeVisible();
    // Direct (non-更多) buttons in the expected order.
    const sections = PHONE_SECTIONS_BY_PROJECT[project].filter(
      (s) => s !== "more"
    );
    await expect(
      frame.locator(
        "#app-nav-phone > button.nav-item-phone:not(.nav-item-more)"
      )
    ).toHaveCount(sections.length);
    const dataSections = await frame
      .locator("#app-nav-phone > button.nav-item-phone:not(.nav-item-more)")
      // oxlint-disable-next-line unicorn/prefer-dom-node-dataset -- browser-context live DOM Element inside evaluateAll; `.dataset` is functionally equivalent but `.getAttribute` preserves the original assertion shape.
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-section")));
    expect(dataSections).toEqual(sections);

    // 更多 button + menu overflow items.
    const moreButton = frame.locator("#app-nav-phone .nav-item-more");
    await expect(moreButton).toHaveCount(1);
    await moreButton.click();
    const moreMenu = frame.locator("#app-nav-phone #more-menu");
    await expect(moreMenu).toBeVisible();
    const overflow = OVERFLOW_SECTIONS_BY_PROJECT[project];
    await expect(moreMenu.locator(".more-menu-item")).toHaveCount(
      overflow.length
    );
    const overflowDataSections = await moreMenu
      .locator(".more-menu-item")
      // oxlint-disable-next-line unicorn/prefer-dom-node-dataset -- browser-context live DOM Element inside evaluateAll; `.dataset` is functionally equivalent but `.getAttribute` preserves the original assertion shape.
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-section")));
    expect(overflowDataSections).toEqual(overflow);
  });
});

test.describe("EFCC role-matrix desktop nav (issue #67 AC #5)", () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test("Desktop side rail lists all authorized sections with no 更多 (AC #5)", async ({
    page,
  }) => {
    const project = test.info().project.name;
    const creds = CREDENTIALS_BY_PROJECT[project];
    if (!creds) {
      throw new Error(`no credentials registered for project ${project}`);
    }
    const expected = DESKTOP_SECTIONS_BY_PROJECT[project];

    const frame = await resolveAppFrame(page);
    await login(frame, creds.username, creds.pin);

    const desktopNav = frame.locator("#app-nav-desktop");
    await expect(desktopNav).toBeVisible();
    await expect(frame.locator("#app-nav-phone")).toBeHidden();

    await expect(
      frame.locator("#app-nav-desktop > button.nav-item-desktop")
    ).toHaveCount(expected.length);
    const dataSections = await frame
      .locator("#app-nav-desktop > button.nav-item-desktop")
      // oxlint-disable-next-line unicorn/prefer-dom-node-dataset -- browser-context live DOM Element inside evaluateAll; `.dataset` is functionally equivalent but `.getAttribute` preserves the original assertion shape.
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-section")));
    expect(dataSections).toEqual(expected);

    // AC #5 negative: no 更多 button in the desktop rail.
    await expect(frame.locator("#app-nav-desktop .nav-item-more")).toHaveCount(
      0
    );
    await expect(frame.locator("#app-nav-desktop #more-menu")).toHaveCount(0);
  });
});

test.describe("EFCC role-matrix active-section state (issue #67 AC #6)", () => {
  test.use({ viewport: PHONE_VIEWPORT });

  test("Profile is active on landing; active state moves when a section is clicked (AC #6)", async ({
    page,
  }) => {
    const project = test.info().project.name;
    const creds = CREDENTIALS_BY_PROJECT[project];
    if (!creds) {
      throw new Error(`no credentials registered for project ${project}`);
    }

    const frame = await resolveAppFrame(page);
    await login(frame, creds.username, creds.pin);

    const profileButton = frame.locator(
      '#app-nav-phone > button.nav-item-phone[data-section="profile"]'
    );
    await expect(profileButton).toHaveAttribute("aria-current", "page");
    await expect(profileButton).toHaveClass(/nav-item-active/u);

    // Programs is universally authorized for every role in this matrix
    // (MEMBER / STAFF / ADMIN), so it's a safe target for the active-
    // state-moves assertion across all projects.
    const programsButton = frame.locator(
      '#app-nav-phone > button.nav-item-phone[data-section="programs"]'
    );
    await programsButton.click();
    await expect(programsButton).toHaveAttribute("aria-current", "page");
    await expect(programsButton).toHaveClass(/nav-item-active/u);
    await expect(profileButton).toHaveAttribute("aria-current", "false");
    await expect(profileButton).not.toHaveClass(/nav-item-active/u);
  });
});

test.describe("EFCC role-matrix forbidden recovery (issue #67 AC #8)", () => {
  test.use({ viewport: PHONE_VIEWPORT });

  // AC #8 trigger honesty note:
  //   `navigateTo_` is closed over by the IIFE wrapper at the top of
  //   shell-session.js.html and is NOT exposed on `window`. The
  //   positive forbidden-state assertion — "calling navigateTo_ with a
  //   section key outside sections_ lands on the forbidden view with
  //   a 返回 button that resolves to the nearest permitted section" —
  //   cannot be reached from this spec without either modifying the
  //   production client to expose a test-only escape hatch or
  //   reverse-engineering the IIFE's private state from a non-public
  //   contract. Neither is acceptable for a wave that locked its
  //   scope on test-only assertions.
  //
  //   What this block DOES prove (the negative half of AC #8):
  //     "The MEMBER role's rendered phone nav contains no button
  //     whose data-section corresponds to a section the role is not
  //     authorized for." This is the user-facing half of AC #8 —
  //     "Manually navigating to an unauthorized section resolves to
  //     Forbidden state, not blank/protected content" — verified
  //     implicitly because there is no path in the MEMBER phone nav
  //     to dispatch such a click in the first place. The positive
  //     forbidden-recovery assertion (heading "無法存取" + 返回
  //     button + click → Profile) is left for a follow-up ticket
  //     that adds a `window.__e2eNavigate(key)` test-only hook on the
  //     production client (gated by a guard the IIFE already has
  //     for inline-script sandbox checks); see the final report.
  test("MEMBER's phone nav does not expose unauthorized sections (AC #8 negative)", async ({
    page,
  }) => {
    test.skip(
      test.info().project.name !== "alice",
      `AC #8's forbidden-route scenario is MEMBER-specific (alice's matrix does not list scanner/care/permissions); this run is the ${test.info().project.name} project.`
    );
    const frame = await resolveAppFrame(page);
    await login(
      frame,
      CREDENTIALS_BY_PROJECT.alice.username,
      CREDENTIALS_BY_PROJECT.alice.pin
    );

    // The forbidden sections per bootstrapSectionsForRole_ for MEMBER
    // (alice has no Program Leader assignment, so no scanner either).
    const forbiddenForMember = ["scanner", "care", "permissions"];
    for (const section of forbiddenForMember) {
      await expect(
        frame.locator(`#app-nav-phone [data-section="${section}"]`)
      ).toHaveCount(0);
      await expect(
        frame.locator(`#app-nav-desktop [data-section="${section}"]`)
      ).toHaveCount(0);
      await expect(
        frame.locator(`#more-menu [data-section="${section}"]`)
      ).toHaveCount(0);
    }
  });
});
