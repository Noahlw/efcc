/* oxlint-disable vitest/prefer-importing-vitest-globals --
 * This is a Playwright spec, not a vitest test.
 */
/**
 * CF1-01 (#151) Worker transport end-to-end smoke test.
 *
 * Proves the full browser path through the Cloudflare Worker:
 *   Next.js -> POST /api/v1/rpc -> Worker signs -> Apps Script -> response
 *
 * Unlike the role-matrix suite, this test does NOT need Google session
 * states (.auth/*.storage.json) because the Next.js app authenticates
 * with username + PIN through the Worker's signed RPC boundary.
 */
import { test, expect } from "@playwright/test";
import type { Page, Request, Response, TestInfo } from "@playwright/test";

const CREDENTIALS = {
  alice: { username: "alice", pin: "1234" },
  bob: { username: "bob", pin: "5678" },
  noah: { username: "noah", pin: "6883" },
} as const;

// Individual assertion timeout: must exceed the client's worst-case retry
// path (3 attempts × 30s upstream cap + backoff). 45s covers one retry
// cycle with headroom; the per-test timeout (60s) bounds the whole flow.
const APP_READY_TIMEOUT = 45_000;

// The app renders two navs: .nav-phone (mobile bottom bar) and .nav-desktop
// (sidebar ≥768px). At desktop width .nav-phone is display:none, so we must
// target the visible nav explicitly.
const NAV_SELECTOR = ".nav-desktop .nav-item";

interface RpcEntry {
  method: string;
  status: number;
  contentType: string;
  durationMs: number;
  requestBody: string | null;
  responseBodyPreview: string;
}

interface RpcCapture {
  snapshot(): RpcEntry[];
  snapshotSettled(): Promise<RpcEntry[]>;
}

/**
 * Capture every /api/v1/rpc request/response pair. The returned capture
 * object can be snapshotted at any time; callers should attach the
 * snapshot in a `finally` block so the log is emitted even when an
 * assertion throws.
 */
function captureRpcTraffic(page: Page): RpcCapture {
  const log: RpcEntry[] = [];
  const pending = new Map<Request, { body: string | null; start: number }>();
  const inflightResponses = new Set<Promise<void>>();

  page.on("request", (req: Request) => {
    if (!req.url().includes("/api/v1/rpc")) return;
    pending.set(req, { body: req.postData(), start: Date.now() });
  });

  page.on("response", (res: Response) => {
    const req = res.request();
    if (!res.url().includes("/api/v1/rpc")) return;
    const entry = pending.get(req);
    if (!entry) return;
    pending.delete(req);
    const done = (async () => {
      let responseBody = "";
      try {
        responseBody = await res.text();
      } catch {
        responseBody = "(failed to read body)";
      }
      log.push({
        method: req.method(),
        status: res.status(),
        contentType: res.headers()["content-type"] ?? "",
        durationMs: Date.now() - entry.start,
        requestBody: entry.body,
        responseBodyPreview: responseBody.substring(0, 1000),
      });
    })();
    inflightResponses.add(done);
    void done.finally(() => inflightResponses.delete(done));
  });

  return {
    snapshot(): RpcEntry[] {
      return [...log];
    },
    /**
     * Wait for all in-flight response handlers to settle before snapshotting,
     * so the log includes every response captured before test exit.
     */
    async snapshotSettled(): Promise<RpcEntry[]> {
      await Promise.allSettled([...inflightResponses]);
      return [...log];
    },
  };
}

async function loginAs(
  page: Page,
  creds: { username: string; pin: string }
) {
  // Single navigation: wait for React hydration to complete (networkidle)
  // before interacting — otherwise clicking submit triggers a native form
  // POST (navigating to /?) because the onSubmit handler isn't attached yet.
  await page.goto("/", { waitUntil: "networkidle" });

  const usernameInput = page.locator('input[autocomplete="username"]');
  const pinInput = page.locator('input[autocomplete="current-password"]');
  const submitButton = page.locator('button[type="submit"]');

  await expect(usernameInput).toBeVisible({ timeout: APP_READY_TIMEOUT });
  await expect(pinInput).toBeVisible();
  await expect(submitButton).toBeVisible();

  await usernameInput.fill(creds.username);
  await pinInput.fill(creds.pin);
  await submitButton.click();

  // Wait for the app shell to mount: login completes, router navigates to
  // the first section, AppShell calls restoreApp, and the nav bar renders.
  await expect(page.locator(NAV_SELECTOR).first()).toBeVisible({
    timeout: APP_READY_TIMEOUT,
  });
}

async function logout(page: Page) {
  const logoutButton = page.locator('button:has-text("登出")');
  await expect(logoutButton).toBeVisible({ timeout: APP_READY_TIMEOUT });
  await logoutButton.click();
  // Wait for the login form to reappear.
  await expect(page.locator('input[autocomplete="username"]')).toBeVisible({
    timeout: APP_READY_TIMEOUT,
  });
}

/**
 * Attach the RPC capture log to the test result. Safe to call in a
 * finally block: the attach is a no-op if the test already failed and
 * was torn down.
 */
async function attachRpcLog(
  testInfo: TestInfo,
  label: string,
  capture: RpcCapture
) {
  try {
    const snapshot = await capture.snapshotSettled();
    await testInfo.attach(`${label}-rpc-log`, {
      body: JSON.stringify(snapshot, null, 2),
      contentType: "application/json",
    });
  } catch {
    // Attach failures must not mask the original test failure.
  }
}

test.describe("CF1-01 Worker transport (#151)", () => {
  test("MEMBER login + profile + navigation through Worker", async ({
    page,
  }, testInfo) => {
    const capture = captureRpcTraffic(page);
    try {
      await loginAs(page, CREDENTIALS.alice);

      const navItems = page.locator(NAV_SELECTOR);
      expect(await navItems.count()).toBeGreaterThan(0);

      await expect(page.locator("h1")).toContainText("個人資料", {
        timeout: APP_READY_TIMEOUT,
      });

      // Profile fields must carry the real user data from the signed RPC
      // (seed values in the DEV Users sheet), not placeholders.
      const profileText = await page.locator("main").innerText();
      for (const expected of [
        "Alice",
        "52205922",
        "MEMBER",
        "Active",
        "GC-C88C-85E1",
      ]) {
        expect(profileText).toContain(expected);
      }

      const secondNav = navItems.nth(1);
      expect(await secondNav.getAttribute("href")).toBeTruthy();
      await secondNav.click();

      await expect(
        page.locator(`${NAV_SELECTOR}[aria-current="page"]`)
      ).toBeVisible({ timeout: APP_READY_TIMEOUT });

      await logout(page);
    } finally {
      await attachRpcLog(testInfo, "MEMBER", capture);
    }
  });

  test("ADMIN sees at least as many nav items as MEMBER", async ({
    page,
  }, testInfo) => {
    const capture = captureRpcTraffic(page);
    try {
      await loginAs(page, CREDENTIALS.noah);
      const adminNavCount = await page.locator(NAV_SELECTOR).count();

      await logout(page);
      await loginAs(page, CREDENTIALS.alice);
      const memberNavCount = await page.locator(NAV_SELECTOR).count();

      expect(adminNavCount).toBeGreaterThanOrEqual(memberNavCount);

      await logout(page);
    } finally {
      await attachRpcLog(testInfo, "ADMIN", capture);
    }
  });
});