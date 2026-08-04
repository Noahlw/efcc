/* oxlint-disable vitest/prefer-importing-vitest-globals --
 * This is a Playwright spec, not a vitest test.
 */
/**
 * CF1-01 (#151) Worker transport end-to-end smoke test.
 *
 * Proves the full browser path through the Cloudflare Worker:
 *   Next.js -> POST /api/v1/rpc -> Worker signs -> Apps Script -> response
 *
 * Credential hygiene: this suite authenticates with username + PIN at the
 * Worker's signed RPC boundary. Credentials are read from exact environment
 * variables (E2E_MEMBER_USERNAME / E2E_MEMBER_PIN / E2E_ADMIN_USERNAME /
 * E2E_ADMIN_PIN); the test never hardcodes them, never logs them, and
 * never attaches them. RPC capture is metadata-only (method / status /
 * headers / duration) and is off by default; set E2E_LOG_METADATA=1 to
 * opt in for local debugging. The capture MUST NOT call request.postData(),
 * response.text(), or attach request/response bodies.
 */
import { test, expect } from "@playwright/test";
import type { Page, Request, Response, TestInfo } from "@playwright/test";

// Credentials are env-only. Failing fast at module load surfaces a
// missing-credential problem before any test fires a network request.
const requiredCreds = [
  "E2E_MEMBER_USERNAME",
  "E2E_MEMBER_PIN",
  "E2E_ADMIN_USERNAME",
  "E2E_ADMIN_PIN",
] as const;

const missingCreds = requiredCreds.filter((name) => !process.env[name]);
if (missingCreds.length > 0) {
  throw new Error(
    `Missing required environment variables for the credential-bearing ` +
      `Worker transport suite: ${missingCreds.join(", ")}. ` +
      `See docs/omp-plans/2026-08-04-fix-issue-151-review-findings.md §3.`
  );
}

const MEMBER_CREDENTIALS = {
  username: process.env.E2E_MEMBER_USERNAME!,
  pin: process.env.E2E_MEMBER_PIN!,
} as const;

const ADMIN_CREDENTIALS = {
  username: process.env.E2E_ADMIN_USERNAME!,
  pin: process.env.E2E_ADMIN_PIN!,
} as const;

const LOG_METADATA = process.env.E2E_LOG_METADATA === "1";

// Individual assertion timeout: must exceed the client's worst-case retry
// path (3 attempts × 30s upstream cap + backoff). 45s covers one retry
// cycle with headroom; the per-test timeout (60s) bounds the whole flow.
const APP_READY_TIMEOUT = 45_000;

// The app renders two navs: .nav-phone (mobile bottom bar) and .nav-desktop
// (sidebar ≥768px). At desktop width .nav-phone is display:none, so we must
// target the visible nav explicitly.
const NAV_SELECTOR = ".nav-desktop .nav-item";

// One project's Playwright test-budget ceiling. The plan's `--retries=0`
// strict run is the final word on flakiness.
const PER_TEST_TIMEOUT = 60_000;

// The paired restoreApp baseline issues one login PLUS two additional
// restoreApp calls, each of which can hit the Worker's own retry budget
// (MAX_UPSTREAM_ATTEMPTS=2 x UPSTREAM_TIMEOUT_MS=12s = 24s worst case per
// call, per web/worker.ts). Documented upstream latency in
// docs/research/2026-08-04-worker-apps-script-reliability.md records
// intermittent 20-30s upstream hangs, so login (up to APP_READY_TIMEOUT)
// plus two worst-case restoreApp calls can exceed PER_TEST_TIMEOUT. This
// test gets a wider budget so a slow-but-successful upstream is not
// misreported as a test-harness failure.
const PAIRED_BASELINE_TIMEOUT = 120_000;

// Minimal typed deferred. Avoids depending on `Promise.withResolvers`
// (ES2024) and stays compatible with the e2e tsconfig (`lib: ES2022`).
interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface RpcEntry {
  method: string;
  status: number;
  contentType: string;
  durationMs: number;
  cfRay: string;
  xRequestId: string;
}

interface RpcCapture {
  snapshot(): RpcEntry[];
  snapshotSettled(): Promise<RpcEntry[]>;
}

/**
 * Capture metadata-only headers/status for every /api/v1/rpc request and
 * response pair. The capture MUST NEVER call request.postData() or
 * response.text(): those return request/response bodies that may carry
 * credentials, envelope signatures, or session tokens. Attachments only
 * contain method, status, content-type, duration, cf-ray, and x-request-id.
 *
 * The capture is opt-in via E2E_LOG_METADATA=1 so a local debug run can
 * still see headers without ever surfacing body bytes.
 */
function captureRpcTraffic(page: Page): RpcCapture {
  if (!LOG_METADATA) {
    return {
      snapshot: () => [],
      snapshotSettled: async () => [],
    };
  }

  const log: RpcEntry[] = [];
  const pending = new Map<Request, number>();

  page.on("request", (req: Request) => {
    if (!req.url().includes("/api/v1/rpc")) return;
    pending.set(req, Date.now());
  });

  page.on("response", (res: Response) => {
    const req = res.request();
    if (!res.url().includes("/api/v1/rpc")) return;
    const start = pending.get(req);
    if (start === undefined) return;
    pending.delete(req);
    log.push({
      method: req.method(),
      status: res.status(),
      contentType: res.headers()["content-type"] ?? "",
      durationMs: Date.now() - start,
      cfRay: res.headers()["cf-ray"] ?? "",
      xRequestId: res.headers()["x-request-id"] ?? "",
    });
    // Intentionally do NOT read res.text(); bodies may carry tokens,
    // envelope signatures, or other sensitive material. Metadata is
    // sufficient for trace correlation (cf-ray + x-request-id).
  });

  return {
    snapshot(): RpcEntry[] {
      return [...log];
    },
    /**
     * Wait for all in-flight response handlers to settle before
     * snapshotting. The current implementation pushes synchronously in
     * the response listener, so this resolves on the next microtask.
     */
    async snapshotSettled(): Promise<RpcEntry[]> {
      const d = deferred<RpcEntry[]>();
      setImmediate(() => d.resolve([...log]));
      return d.promise;
    },
  };
}

async function loginAs(page: Page, creds: { username: string; pin: string }) {
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
 * Attach the metadata-only RPC capture log to the test result. Safe to
 * call in a finally block: the attach is a no-op if the test already
 * failed and was torn down. When E2E_LOG_METADATA is not "1" we skip the
 * attach entirely so no header trace ever hits the artifacts directory
 * by default for this credential-bearing suite.
 */
async function attachRpcLog(
  testInfo: TestInfo,
  label: string,
  capture: RpcCapture
) {
  if (!LOG_METADATA) return;
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
    test.setTimeout(PER_TEST_TIMEOUT);
    const capture = captureRpcTraffic(page);
    try {
      await loginAs(page, MEMBER_CREDENTIALS);

      const navItems = page.locator(NAV_SELECTOR);
      expect(await navItems.count()).toBeGreaterThan(0);

      await expect(page.locator("h1")).toContainText("個人資料", {
        timeout: APP_READY_TIMEOUT,
      });

      // Profile must carry the real role + status from the signed RPC
      // (seed values in the DEV Users sheet), not placeholders. We don't
      // echo the env username here — operators can re-check
      // E2E_MEMBER_USERNAME locally; echoing it would risk attaching it
      // to CI artifacts if redact logic ever weakens.
      const profileText = await page.locator("main").innerText();
      for (const expected of ["MEMBER", "Active"]) {
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

  test("ADMIN login + sees admin nav (single-privilege check)", async ({
    page,
  }, testInfo) => {
    // Single login. The previous "compare admin vs member navs in one
    // test" pattern mixed two privileged sessions and shared storage
    // state; the plan mandates splitting this into one privilege /
    // navigation assertion per test.
    test.setTimeout(PER_TEST_TIMEOUT);
    const capture = captureRpcTraffic(page);
    try {
      await loginAs(page, ADMIN_CREDENTIALS);

      const adminNavCount = await page.locator(NAV_SELECTOR).count();
      expect(adminNavCount).toBeGreaterThan(0);

      await expect(page.locator(NAV_SELECTOR).first()).toBeVisible({
        timeout: APP_READY_TIMEOUT,
      });
      await expect(
        page.locator(`${NAV_SELECTOR}[href="/permissions"]`)
      ).toBeVisible({
        timeout: APP_READY_TIMEOUT,
      });

      await logout(page);
    } finally {
      await attachRpcLog(testInfo, "ADMIN", capture);
    }
  });

  test("MEMBER paired restoreApp baseline (already authenticated)", async ({
    page,
  }, testInfo) => {
    // Plan-mandated paired baseline. We authenticate once (populating
    // localStorage.efcc_session + the session cookie), then issue EXACTLY
    // TWO restoreApp POSTs from the same authenticated browser session
    // via `page.evaluate`. Each response is parsed in memory and
    // discarded — only redacted metadata returns to the test process.
    //
    // The page.evaluate body intentionally does NOT rely on the
    // AppShell's behavior, nav clicks, or a response listener: the
    // test's two POSTs are explicit and countable, not inferred from
    // incidental traffic.
    test.setTimeout(PAIRED_BASELINE_TIMEOUT);
    const capture = captureRpcTraffic(page);

    try {
      // Authenticate up-front; this populates localStorage.efcc_session
      // and the session cookie the AppShell uses on subsequent calls.
      await loginAs(page, MEMBER_CREDENTIALS);

      // Issue exactly two restoreApp POSTs sequentially from the same
      // authenticated browser session. Redacted metadata only.
      interface RestoreMetadata {
        observed: boolean;
        status: number;
        contentType: string;
        envelopeShape: "success" | "problem" | "unknown";
        // When `envelopeShape === "problem"`, the body's `status` field
        // must equal the outer HTTP status (RFC 7807 invariant). We
        // capture the parsed body's numeric `status` here so the test
        // can compare it; the body itself is never returned.
        problemStatus: number | null;
      }
      interface RestoreResult {
        ok: boolean;
        sessionPresent: boolean;
        results: RestoreMetadata[];
        error?: string;
      }

      // `page.evaluate` runs in the browser context; `res` is the
      // browser `Response`, whose `.status` is a getter and `.json()` /
      // `.headers.get()` are methods. We type `fetch`'s return against
      // a minimal browser `Response` shape (not Node's `undici`) so the
      // shape is what the browser actually exposes.
      interface BrowserResponse {
        status: number;
        headers: { get(name: string): string | null };
        json(): Promise<unknown>;
      }

      const paired = await page.evaluate<RestoreResult, { rpcUrl: string }>(
        async ({ rpcUrl }) => {
          const raw = window.localStorage.getItem("efcc_session");
          if (!raw) {
            return {
              ok: false,
              sessionPresent: false,
              results: [],
              error: "efcc_session missing from localStorage",
            };
          }

          let userId: string;
          let sessionId: string;
          let sessionToken: string;
          try {
            const session = JSON.parse(raw) as Record<string, unknown>;
            if (
              typeof session.userId !== "string" ||
              typeof session.sessionId !== "string" ||
              typeof session.sessionToken !== "string"
            ) {
              return {
                ok: false,
                sessionPresent: true,
                results: [],
                error: "efcc_session missing required fields",
              };
            }
            userId = session.userId;
            sessionId = session.sessionId;
            sessionToken = session.sessionToken;
          } catch {
            return {
              ok: false,
              sessionPresent: true,
              results: [],
              error: "efcc_session unparseable",
            };
          }

          const observations: RestoreMetadata[] = [];
          // Issue exactly two restoreApp POSTs sequentially. Each parses
          // the body in memory, classifies it, captures only the numeric
          // `status` for the RFC-7807 invariant check, and discards the
          // rest of the bytes.
          for (let i = 0; i < 2; i++) {
            const res = (await fetch(rpcUrl, {
              method: "POST",
              credentials: "include",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sessionToken}`,
                "X-Efcc-Session-Id": sessionId,
              },
              body: JSON.stringify({
                action: "restoreApp",
                params: { userId },
              }),
            })) as unknown as BrowserResponse;

            const contentType = res.headers.get("content-type") ?? "";
            const status = res.status;
            let envelopeShape: RestoreMetadata["envelopeShape"] = "unknown";
            let problemStatus: number | null = null;
            let observed = false;
            try {
              const body: unknown = await res.json();
              observed = true;
              if (
                body !== null &&
                typeof body === "object" &&
                !Array.isArray(body)
              ) {
                // Narrow with `in` checks so the runtime check actually
                // happens; do not fabricate an inline type cast.
                if (
                  "status" in body &&
                  typeof body.status === "number" &&
                  "code" in body &&
                  typeof body.code === "string" &&
                  "title" in body &&
                  typeof body.title === "string" &&
                  "requestId" in body &&
                  typeof body.requestId === "string"
                ) {
                  envelopeShape = "problem";
                  problemStatus = body.status;
                } else if (
                  "success" in body &&
                  body.success === true &&
                  "requestId" in body &&
                  typeof body.requestId === "string" &&
                  "data" in body &&
                  typeof body.data === "object" &&
                  body.data !== null
                ) {
                  envelopeShape = "success";
                }
              }
            } catch {
              // Non-JSON body — leave observed=false, shape=unknown, and
              // problemStatus=null.
            }
            observations.push({
              observed,
              status,
              contentType,
              envelopeShape,
              problemStatus,
            });
          }
          return {
            ok: true,
            sessionPresent: true,
            results: observations,
          };
        },
        { rpcUrl: "/api/v1/rpc" }
      );

      expect(paired.ok).toBeTruthy();
      expect(paired.sessionPresent).toBeTruthy();
      expect(paired.results).toHaveLength(2);

      // Both fetches must surface a sane envelope shape and matching
      // status. Body content is intentionally discarded — we assert on
      // metadata only.
      for (const obs of paired.results) {
        expect(obs.observed).toBeTruthy();
        // Any structured JSON response is a valid outcome here: 2xx is a
        // success envelope, 4xx is a Problem Details rejection, and a
        // structured 5xx (e.g. 502 UPSTREAM_UNREACHABLE) is a legitimate
        // Worker response after it exhausts its own upstream retry budget
        // (documented intermittent 20-30s Apps Script hangs, see
        // docs/research/2026-08-04-worker-apps-script-reliability.md).
        // The baseline proves the Worker always answers with a structured,
        // correlated JSON envelope — not that the upstream never fails.
        expect(obs.status).toBeGreaterThanOrEqual(200);
        expect(obs.status).toBeLessThan(600);
        if (obs.contentType) {
          expect(obs.contentType).toMatch(/application\/json/i);
        }
        expect(
          obs.envelopeShape === "success" || obs.envelopeShape === "problem"
        ).toBeTruthy();
        // RFC 7807 invariant: when the envelope is a Problem Details
        // object, the body's `status` MUST equal the outer HTTP status.
        if (obs.envelopeShape === "problem") {
          expect(obs.problemStatus).not.toBeNull();
          expect(obs.problemStatus).toBe(obs.status);
        }
      }

      await logout(page);
    } finally {
      await attachRpcLog(testInfo, "RESTORE", capture);
    }
  });
});
