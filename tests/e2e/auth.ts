/**
 * EFCC E2E storage-state generator (ADR-0012).
 *
 * Runs once per role to capture the developer's Google session cookies
 * (after a hand-typed Google sign-in) into `.auth/<role>.storage.json`,
 * which the Playwright projects in playwright.config.ts then load on
 * every test run to skip the interactive Google login wall.
 *
 * Invoked as: `npm run e2e:auth -- --role=<alice|bob|noah>`
 *
 * WHY HEADFUL + HAND-TYPED SIGN-IN:
 *   Google's anti-automation blocks scripted sign-in attempts; we leave
 *   the credential entry to the developer in a visible Chromium window
 *   and only script the wait-for-load + storageState capture.
 */
import { parseArgs } from "node:util";

import { chromium } from "@playwright/test";
import type { Frame, Page } from "@playwright/test";

const ROLES = ["alice", "bob", "noah"] as const;
type Role = (typeof ROLES)[number];

// Five minutes covers a slow developer + Google's interactive flow + first
// shell RPC after sign-in. The script polls every 500ms and exits non-zero
// with a clear error if not reached in time — we never write a partial
// storage state.
const APP_READY_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 500;

function die(message: string, code = 1): never {
  // stderr so it doesn't get captured as a successful "ready" signal by
  // callers parsing stdout.
  process.stderr.write(`error: ${message}\n`);
  process.exit(code);
  // Unreachable at runtime — process.exit never returns — but the
  // throw lets TS narrow downstream `if (cond) die(...)` callers.
  throw new Error("unreachable");
}

function resolveRole(): Role {
  let parsed: { values: { role?: string } };
  try {
    parsed = parseArgs({
      options: {
        role: { type: "string" },
      },
      strict: true,
      allowPositionals: false,
    });
  } catch (error) {
    die(
      `failed to parse arguments: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const raw = parsed.values.role;
  if (raw === undefined || raw === "") {
    die(
      `missing required --role flag. usage: npm run e2e:auth -- --role=<${ROLES.join("|")}>`
    );
  }
  if (!(ROLES as readonly string[]).includes(raw)) {
    die(
      `invalid --role "${raw}". must be one of: ${ROLES.join(", ")} (see docs/adr/0012-e2e-testing-strategy.md for the role matrix).`
    );
  }
  return raw as Role;
}

async function findAppFrame(page: Page, role: Role): Promise<Frame> {
  // Google's iframe chain (outer page -> iframe#sandboxFrame -> inner
  // userHtmlFrame containing #app) is documented in
  // docs/specs/067-role-nav-acceptance-plan.md but is NOT a stable public
  // contract: Google has been observed adding/removing wrappers between
  // sessions. Instead of hardcoding frame indices or selectors that pin
  // specific nesting depth, we enumerate page.frames() — which recursively
  // lists every nested frame Playwright knows about — and return the
  // first one that exposes the EFCC app root in the SIGNED_OUT state.
  const deadline = Date.now() + APP_READY_TIMEOUT_MS;
  const seenUrls = new Set<string>();

  async function readAppState(frame: Frame): Promise<string | null> {
    const element = await frame.$("#app").catch(() => null);
    seenUrls.add(frame.url());
    if (!element) {
      return null;
    }
    try {
      // oxlint-disable-next-line unicorn/prefer-dom-node-dataset -- this
      // is a Playwright ElementHandle (frame.$ result), not a live DOM
      // node; it has no .dataset accessor, only getAttribute.
      return await element.getAttribute("data-app-state");
    } catch {
      return null;
    }
  }

  while (Date.now() < deadline) {
    let frames: Frame[] = [];
    try {
      frames = page.frames();
    } catch {
      if (page.isClosed()) {
        break;
      }
      try {
        await page.waitForTimeout(POLL_INTERVAL_MS);
      } catch {
        /* closed */
      }
      continue;
    }

    const states = await Promise.all(
      frames.map(async (frame) => ({
        frame,
        state: await readAppState(frame),
      }))
    );
    const ready = states.find((s) => s.state === "SIGNED_OUT");
    if (ready) {
      return ready.frame;
    }
    try {
      await page.waitForTimeout(POLL_INTERVAL_MS);
    } catch {
      if (page.isClosed()) {
        break;
      }
    }
  }
  throw new Error(
    `timed out after ${APP_READY_TIMEOUT_MS / 1000}s waiting for an EFCC app frame (#app[data-app-state="SIGNED_OUT"]) to appear for role "${role}". ` +
      `observed frames: ${[...seenUrls].join(", ") || "<none>"}. ` +
      `did Google sign-in complete successfully for the "${role}" Google account?`
  );
}
async function main(): Promise<void> {
  const role = resolveRole();

  const targetUrl = process.env.E2E_TARGET_URL;
  if (!targetUrl) {
    die(
      "E2E_TARGET_URL is not set. export the deployed Apps Script /exec URL first " +
        "(CI: repo variable/secret; local: `export E2E_TARGET_URL=https://script.google.com/.../exec`)."
    );
  }

  process.stdout.write(
    [
      "",
      "================================================================",
      ` EFCC E2E auth capture — role: ${role}`,
      "================================================================",
      `Target: ${targetUrl}`,
      "",
      "A browser window is about to open.",
      "",
      `  1. Sign in with the Google account you want bound to the "${role}" role.`,
      "  2. Wait for the EFCC login form (username + PIN) to finish loading.",
      "  3. Do NOT type EFCC credentials yet — this script only captures the",
      "     Google session. The username/PIN form is driven by test:e2e later.",
      "",
      "This script polls for the EFCC app until it appears, then writes",
      `.auth/${role}.storage.json and exits. Timeout: ${APP_READY_TIMEOUT_MS / 1000}s.`,
      "----------------------------------------------------------------",
      "",
    ].join("\n")
  );

  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    process.stdout.write("navigated. waiting for EFCC app to mount...\n");

    const appFrame = await findAppFrame(page, role);
    const state = await appFrame.locator("#app").getAttribute("data-app-state");
    process.stdout.write(
      `EFCC app reachable in frame (${appFrame.url()}). data-app-state=${state ?? "<missing>"}\n`
    );

    const storagePath = `.auth/${role}.storage.json`;
    // Capture on the *outer page's browser context* — not the inner
    // iframe's. Google session cookies live on the script.google.com /
    // accounts.google.com origin attached to the top-level context;
    // the inner iframe is same-origin with the outer for our purposes
    // but the cookie jar we want to persist is the top-level context's.
    await context.storageState({ path: storagePath });
    process.stdout.write(`wrote ${storagePath}\n`);
    process.stdout.write(
      "done. you may close the browser window or press Ctrl-C in this terminal.\n"
    );
  } catch (error) {
    die(
      `auth capture failed for role "${role}": ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    // Always release the browser — even on successful capture — so the
    // developer isn't left with a stuck window. context.close() is
    // idempotent w.r.t. browser.close(), but calling both makes the
    // teardown order obvious and tolerates a half-attached context.
    // Swallow teardown errors — we're exiting either way and a close()
    // failure here must never mask the original capture error/success.
    await context.close().catch(() => {
      // intentionally ignored — see comment above.
    });
    await browser.close().catch(() => {
      // intentionally ignored — see comment above.
    });
  }
}

main();
