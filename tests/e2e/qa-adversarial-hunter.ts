import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium, request } from "@playwright/test";
import type { APIRequestContext, Browser, Page } from "@playwright/test";

const TARGET_URL = "http://127.0.0.1:8791";
const SCREENSHOT_DIR = path.resolve(process.cwd(), "docs/qa/screenshots");
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

interface Finding {
  id: string;
  title: string;
  surface: string;
  state: string;
  viewport: string;
  steps: string[];
  expected: string;
  actual: string;
  severity: "Blocker" | "Major" | "Minor" | "Nit";
  screenshotPath: string;
  evidence: {
    selector: string;
    metrics: Record<string, unknown>;
  };
  remediation: string;
}

const findings: Finding[] = [];
let findingIndex = 1;

function addFinding(f: Omit<Finding, "id">) {
  const id = `F-${String(findingIndex++).padStart(2, "0")}`;
  findings.push({ id, ...f });
  console.log(`\n🚨 [${f.severity}] ${id}: ${f.title}`);
  console.log(`   Surface: ${f.surface} (${f.state}) at ${f.viewport}`);
  console.log(`   Expected: ${f.expected}`);
  console.log(`   Actual:   ${f.actual}`);
}

function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function loginApi(
  browser: Browser,
  username: string,
  credential: string
): Promise<{ api: APIRequestContext; cookieHeader: string }> {
  const loginContext = await browser.newContext();
  const response = await loginContext.request.post(`${TARGET_URL}/api/v1/auth/login`, {
    headers: { Origin: TARGET_URL },
    data: { username, password: credential },
  });
  if (response.status() !== 200) {
    throw new Error(`Login failed for ${username}: ${response.status()}`);
  }

  const setCookies = response.headersArray().filter(h => h.name.toLowerCase() === "set-cookie").map(h => h.value);
  const cookieHeader = setCookies.map(c => c.split(";")[0]).join("; ");

  const api = await request.newContext({
    baseURL: TARGET_URL,
    extraHTTPHeaders: { Cookie: cookieHeader, Origin: TARGET_URL },
  });
  return { api, cookieHeader };
}

async function setupFixtures(browser: Browser) {
  const admin = await loginApi(browser, "E2E_admin", "E2E_admin!dev");
  const member = await loginApi(browser, "E2E_member", "E2E_member!dev");

  const deptCode = `QA_ADV_${Date.now().toString(36)}`;
  const deptRes = await admin.api.post("/api/v1/programs/departments", {
    data: {
      code: deptCode,
      name: `QA 測試部 ${deptCode}`,
      lifecycle: "Active",
    },
  });
  const deptJson = (await deptRes.json()) as { data: { department: { department_id: string } } };
  const departmentId = deptJson.data.department.department_id;

  for (const mod of ["program_catalog", "events", "enrollment"]) {
    await admin.api.post(
      `/api/v1/programs/departments/${departmentId}/modules/${mod}/enable`
    );
  }

  // Program A (Enrolled)
  const progARes = await admin.api.post(
    `/api/v1/programs/departments/${departmentId}/programs`,
    {
      data: {
        name: "主日崇拜 (QA示範事工)",
        description: "主日聚會",
        category: "崇拜",
        behavior_type: "Recurring",
        lifecycle: "Active",
        discoverability: "Listed",
        enrollment_mode: "MemberRequest",
      },
    }
  );
  const progAJson = (await progARes.json()) as { data: { program: { program_id: string; check_in_token: string } } };
  const progAId = progAJson.data.program.program_id;
  const tokenA = progAJson.data.program.check_in_token;

  // Active event A1
  const eventA1Res = await admin.api.post(
    `/api/v1/programs/${progAId}/events`,
    {
      data: {
        name: "早堂崇拜聚會",
        starts_at: minutesFromNow(-60),
        ends_at: minutesFromNow(60),
        location: "大禮堂 1/F 主堂大堂位置",
      },
    }
  );
  const eventA1Json = (await eventA1Res.json()) as { data: { event: { event_id: string } } };
  const eventA1Id = eventA1Json.data.event.event_id;

  // Active event A2 (Overlapping with long CJK name for chooser stress)
  const eventA2Res = await admin.api.post(
    `/api/v1/programs/${progAId}/events`,
    {
      data: {
        name: "下午堂成人主日崇拜暨聖餐禮拜特別聚會",
        starts_at: minutesFromNow(-45),
        ends_at: minutesFromNow(75),
        location: "副堂 2/F 青年活動中心暨副禮堂副堂室",
      },
    }
  );
  const eventA2Json = (await eventA2Res.json()) as { data: { event: { event_id: string } } };
  const eventA2Id = eventA2Json.data.event.event_id;

  // Cancelled Event
  const eventCancelledRes = await admin.api.post(
    `/api/v1/programs/${progAId}/events`,
    {
      data: {
        name: "特別聚會 (已取消)",
        starts_at: minutesFromNow(-30),
        ends_at: minutesFromNow(90),
        location: "大禮堂",
      },
    }
  );
  const eventCancelledJson = (await eventCancelledRes.json()) as { data: { event: { event_id: string } } };
  const eventCancelledId = eventCancelledJson.data.event.event_id;
  await admin.api.patch(
    `/api/v1/programs/${progAId}/events/${eventCancelledId}`,
    {
      data: { reason: "QA 測試取消" },
    }
  );

  // Future Event
  const eventFutureRes = await admin.api.post(
    `/api/v1/programs/${progAId}/events`,
    {
      data: {
        name: "晚堂崇拜 (未開放)",
        starts_at: minutesFromNow(240),
        ends_at: minutesFromNow(300),
        location: "大禮堂",
      },
    }
  );
  const eventFutureJson = (await eventFutureRes.json()) as { data: { event: { event_id: string } } };
  const eventFutureId = eventFutureJson.data.event.event_id;

  // Program B (Unenrolled)
  const progBRes = await admin.api.post(
    `/api/v1/programs/departments/${departmentId}/programs`,
    {
      data: {
        name: "門徒培育班 (未報名)",
        description: "培育課程",
        category: "培育",
        behavior_type: "OneOff",
        lifecycle: "Active",
        discoverability: "Listed",
        enrollment_mode: "MemberRequest",
      },
    }
  );
  const progBJson = (await progBRes.json()) as { data: { program: { program_id: string } } };
  const progBId = progBJson.data.program.program_id;
  const eventUnenrolledRes = await admin.api.post(
    `/api/v1/programs/${progBId}/events`,
    {
      data: {
        name: "第一課：門徒生命",
        starts_at: minutesFromNow(-60),
        ends_at: minutesFromNow(60),
        location: "301室",
      },
    }
  );
  const eventUnenrolledJson = (await eventUnenrolledRes.json()) as { data: { event: { event_id: string } } };
  const eventUnenrolledId = eventUnenrolledJson.data.event.event_id;
  const codeA1 = String(Math.floor(100000 + Math.random() * 899999));
  const codeA2 = String(Math.floor(100000 + Math.random() * 899999));
  const codeCancelled = String(Math.floor(100000 + Math.random() * 899999));
  const codeFuture = String(Math.floor(100000 + Math.random() * 899999));
  const codeUnenrolled = String(Math.floor(100000 + Math.random() * 899999));

  const webDir = path.resolve(
    process.cwd(),
    ".worktrees/stack-base-s3-authority/web"
  );
  // Update predictable 6-digit codes in D1
  const sql = `
    UPDATE events SET manual_check_in_code = '${codeA1}' WHERE event_id = '${eventA1Id}';
    UPDATE events SET manual_check_in_code = '${codeA2}' WHERE event_id = '${eventA2Id}';
    UPDATE events SET manual_check_in_code = '${codeCancelled}' WHERE event_id = '${eventCancelledId}';
    UPDATE events SET manual_check_in_code = '${codeFuture}' WHERE event_id = '${eventFutureId}';
    UPDATE events SET manual_check_in_code = '${codeUnenrolled}' WHERE event_id = '${eventUnenrolledId}';
  `;
  execSync(
    `npx wrangler d1 execute efcc-identity --local --command="${sql.replaceAll("\n", " ")}"`,
    {
      cwd: webDir,
      env: {
        ...process.env,
        PATH: `/Users/noah.wong/.local/share/fnm/node-versions/v22.18.0/installation/bin:${process.env.PATH}`,
      },
    }
  );

  // Enroll member in Program A
  const enrollReqRes = await member.api.post(
    `/api/v1/programs/${progAId}/enrollment-requests`,
    {
      data: {},
    }
  );
  const enrollReqJson = (await enrollReqRes.json()) as { data?: { request?: { request_id?: string } } };
  const enrollReqId = enrollReqJson.data?.request?.request_id;
  if (enrollReqId) {
    await admin.api.post(
      `/api/v1/programs/${progAId}/enrollment-requests/${enrollReqId}/decision`,
      {
        data: { action: "Approved" },
      }
    );
  }

  return {
    departmentId,
    progAId,
    tokenA,
    codeA1,
    codeA2,
    codeCancelled,
    codeFuture,
    codeUnenrolled,
    memberCookieHeader: member.cookieHeader,
  };
}

async function captureScreenshot(page: Page, name: string): Promise<string> {
  const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  return `docs/qa/screenshots/${name}.png`;
}

async function runAdversarialAudit() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--enable-blink-features=ShapeDetection",
    ],
  });

  const fixtures = await setupFixtures(browser);
  console.log("Fixtures initialized:", fixtures);

  // =========================================================================
  // TEST 1: Paste full 6-digit code vs typing digit-by-digit + non-digit stripping
  // =========================================================================
  console.log("\n--- TEST 1: Code input formatting & paste behavior ---");
  {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 844 },
      permissions: ["camera"],
      extraHTTPHeaders: { Cookie: fixtures.memberCookieHeader, Origin: TARGET_URL },
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => { localStorage.setItem("efcc_auth_active", "1"); });
    await page.goto(`${TARGET_URL}/scanner`);
    await page.waitForSelector('[data-camera-state="live"]');
    await page.locator('button[class*="cameraStop"]').click();
    await page.locator('button[class*="methodCard"]').click();
    await page.waitForSelector('[data-scanner-state="manual"]');

    // 1A. Test pasting formatted code with spaces " 482 913 "
    await page.locator("#attendance-code").focus();
    await page.evaluate(() => {
      const input = document.getElementById("attendance-code") as HTMLInputElement;
      input.value = " 482 913 ";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const valuePasted = await page.locator("#attendance-code").inputValue();
    console.log(`Manual input value after pasting ' 482 913 ': '${valuePasted}'`);

    // 1B. Test typing alphabetic letters into manual input on /scanner
    await page.locator("#attendance-code").fill("");
    await page.locator("#attendance-code").type("48AB29");
    const valueTypedLetters = await page.locator("#attendance-code").inputValue();
    console.log(`Manual input value after typing '48AB29': '${valueTypedLetters}'`);

    // 1C. Test pasting full token into /guest-check-in attendance code
    await page.goto(`${TARGET_URL}/guest-check-in`);
    await page.locator("#attendance-code").fill(`  ${fixtures.codeA1}  `);
    await page.locator("#guest-name").fill("陳大文");
    await page.locator("#guest-phone").fill("91234567");
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(600);
    // Did it succeed or fail because of un-trimmed input?
    const hasResult = await page.locator('section[class*="checkinResult"]').count();
    console.log(`Guest check-in with spaced code '  482913  ': successResult = ${hasResult > 0}`);

    if (hasResult === 0) {
      const shot = await captureScreenshot(page, "hunt-paste-guest-untrimmed");
      const errText = await page.locator('output[data-tone="error"]').textContent();
      addFinding({
        title: "Guest check-in fails on pasted code with leading/trailing whitespace",
        surface: "/guest-check-in",
        state: "validation",
        viewport: "375x844",
        steps: [
          `1. Open /guest-check-in`,
          `2. Paste valid code with leading/trailing spaces ('  482913  ')`,
          `3. Fill name '陳大文' and phone '91234567'`,
          `4. Click 確認簽到`,
        ],
        expected: "Whitespace is trimmed before resolution; check-in succeeds",
        actual: `Submission fails with error: '${errText}'`,
        severity: "Major",
        screenshotPath: shot,
        evidence: {
          selector: "#attendance-code",
          metrics: { inputVal: "  482913  ", error: errText },
        },
        remediation: "Apply .trim() to flow.input before passing to resolve / guestCheckIn.",
      });
    }

    await ctx.close();
  }

  // =========================================================================
  // TEST 2: IME composition for Chinese names (submitting mid-composition)
  // =========================================================================
  console.log("\n--- TEST 2: IME composition on Chinese name input ---");
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(`${TARGET_URL}/guest-check-in`);
    await page.locator("#attendance-code").fill(fixtures.codeA1);
    await page.locator("#guest-phone").fill("91234567");

    // Simulate IME composition on guest name: user types 'chan', presses Enter to select candidate
    await page.locator("#guest-name").focus();
    await page.evaluate(() => {
      const input = document.getElementById("guest-name") as HTMLInputElement;
      input.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
      input.value = "chan";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      // Press Enter while isComposing is true
      const enterEvt = new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(enterEvt, "isComposing", { value: true });
      input.dispatchEvent(enterEvt);
    });

    await page.waitForTimeout(500);
    const hasOutput = await page.locator('output[data-tone]').count();
    const statusText = hasOutput > 0 ? await page.locator('output[data-tone]').textContent() : "";
    console.log(`IME Enter press during composition: statusText='${statusText}' (form submitted prematurely = ${hasOutput > 0})`);
  }

  // =========================================================================
  // TEST 3: Permission revoked mid-live stream
  // =========================================================================
  console.log("\n--- TEST 3: Stream track termination mid-live ---");
  {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 844 },
      permissions: ["camera"],
      extraHTTPHeaders: { Cookie: fixtures.memberCookieHeader, Origin: TARGET_URL },
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => { localStorage.setItem("efcc_auth_active", "1"); });
    await page.goto(`${TARGET_URL}/scanner`);
    await page.waitForSelector('[data-camera-state="live"]');

    // Simulate OS track ending (revoked permission or hardware interruption)
    await page.evaluate(() => {
      const video = document.querySelector("video") as HTMLVideoElement;
      if (video && video.srcObject) {
        const stream = video.srcObject as MediaStream;
        for (const track of stream.getTracks()) {
          track.stop();
          track.dispatchEvent(new Event("ended"));
        }
      }
    });

    await page.waitForTimeout(1000);
    const cameraState = await page.locator('[data-camera-state]').getAttribute("data-camera-state");
    const isFallback = await page.locator('[data-scanner-state="fallback"]').count();
    console.log(`After track.stop() mid-live: cameraState=${cameraState}, fallbackVisible=${isFallback > 0}`);

    if (isFallback === 0) {
      const shot = await captureScreenshot(page, "hunt-camera-track-ended-freeze");
      addFinding({
        title: "Camera viewfinder stays in frozen live state when track is ended by OS/hardware",
        surface: "/scanner",
        state: "scan-live",
        viewport: "375x844",
        steps: [
          `1. Open /scanner with camera active ('scan-live')`,
          `2. Simulate video track termination (OS permission revoke / stream interruption)`,
          `3. Observe scanner surface`,
        ],
        expected: "useQrCamera listens to track 'ended' event and transitions to fallback state",
        actual: "Surface remains locked in 'scan-live' with a frozen video frame and no error message",
        severity: "Major",
        screenshotPath: shot,
        evidence: {
          selector: '[data-camera-state="live"]',
          metrics: { cameraState, isFallback },
        },
        remediation: "Add track.addEventListener('ended', stopCamera) inside useQrCamera stream setup.",
      });
    }

    await ctx.close();
  }

  // =========================================================================
  // TEST 4: Rapid stop/start camera toggling (double-tap 停止掃描 / 重試相機)
  // =========================================================================
  console.log("\n--- TEST 4: Rapid stop/start camera toggle ---");
  {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 844 },
      permissions: ["camera"],
      extraHTTPHeaders: { Cookie: fixtures.memberCookieHeader, Origin: TARGET_URL },
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => { localStorage.setItem("efcc_auth_active", "1"); });
    await page.goto(`${TARGET_URL}/scanner`);
    await page.waitForSelector('[data-camera-state="live"]');

    // Rapidly double click stop scan
    await page.locator('button[class*="cameraStop"]').dblclick();
    await page.waitForTimeout(500);

    const fallbackVisible = await page.locator('[data-scanner-state="fallback"]').count();
    console.log(`After rapid double-click on Stop Scan: fallbackVisible=${fallbackVisible > 0}`);

    if (fallbackVisible === 0) {
      const shot = await captureScreenshot(page, "hunt-rapid-stop-toggle-fail");
      addFinding({
        title: "Rapid double-click on 停止掃描 causes race condition preventing fallback view",
        surface: "/scanner",
        state: "scan-live",
        viewport: "375x844",
        steps: [`1. Open /scanner live`, `2. Rapidly double-tap 停止掃描`],
        expected: "State cleanly transitions to fallback state with method cards",
        actual: "Fallback view did not render or got stuck in opening",
        severity: "Major",
        screenshotPath: shot,
        evidence: { selector: 'button[class*="cameraStop"]', metrics: { fallbackVisible } },
        remediation: "Ensure stopScanning is idempotent and synchronously cancels pending stream promises.",
      });
    }

    await ctx.close();
  }

  // =========================================================================
  // TEST 5: Backgrounded-tab camera return (switch tab away and back)
  // =========================================================================
  console.log("\n--- TEST 5: Backgrounded-tab visibility change ---");
  {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 844 },
      permissions: ["camera"],
      extraHTTPHeaders: { Cookie: fixtures.memberCookieHeader, Origin: TARGET_URL },
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => { localStorage.setItem("efcc_auth_active", "1"); });
    await page.goto(`${TARGET_URL}/scanner`);
    await page.waitForSelector('[data-camera-state="live"]');

    // Simulate tab hiding and restoring
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", writable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "visible", writable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(500);

    const videoPaused = await page.evaluate(() => {
      const v = document.querySelector("video");
      return v ? v.paused : false;
    });
    console.log(`After visibility change away & back: videoPaused = ${videoPaused}`);

    await ctx.close();
  }

  // =========================================================================
  // TEST 6: Offline flap mid-submit (network goes down right at submit)
  // =========================================================================
  console.log("\n--- TEST 6: Offline flap mid-submit on confirmation screen ---");
  {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 844 },
      permissions: ["camera"],
      extraHTTPHeaders: { Cookie: fixtures.memberCookieHeader, Origin: TARGET_URL },
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => { localStorage.setItem("efcc_auth_active", "1"); });
    await page.goto(`${TARGET_URL}/scanner?manual_code=${fixtures.codeA1}`);
    await page.waitForSelector('section[class*="confirmation"]');

    // Intercept self check-in request to simulate offline network drop
    await page.route("**/api/v1/attendance/self", (route) => {
      route.abort("failed");
    });

    await page.locator('button:has-text("確認簽到")').click();
    await page.waitForSelector('p[class*="confirmError"]');

    const errorMsg = await page.locator('p[class*="confirmError"]').textContent();
    const hasRetryBtn = await page.locator('button:has-text("重試簽到")').count();
    const confirmBtnDisabled = await page.locator('button:has-text("確認簽到")').isDisabled();
    console.log(`Offline mid-submit: errorMsg='${errorMsg}', hasRetryBtn=${hasRetryBtn > 0}, confirmBtnDisabled=${confirmBtnDisabled}`);

    // Capture screenshot
    const shot = await captureScreenshot(page, "hunt-offline-confirmation-state");

    if (hasRetryBtn === 0) {
      addFinding({
        title: "Network error on confirmation screen hides '重試簽到' button",
        surface: "/scanner",
        state: "scan-confirmation",
        viewport: "375x844",
        steps: [
          `1. Land on confirmation screen for valid event`,
          `2. Click 確認簽到 while network is interrupted (network abort/failure)`,
          `3. Observe error state and available retry affordances`,
        ],
        expected: "Error explains network issue AND '重試簽到' secondary button appears with focus (F-11)",
        actual: `Error message displays '${errorMsg}' but '重試簽到' button is not rendered (setRetryAvailable(!offline) hides it)`,
        severity: "Major",
        screenshotPath: shot,
        evidence: {
          selector: 'section[class*="confirmation"]',
          metrics: { errorMsg, hasRetryBtn, confirmBtnDisabled },
        },
        remediation: "Ensure retryAvailable is true on retryable network errors so users have a clear retry button.",
      });
    }

    await ctx.close();
  }

  // =========================================================================
  // TEST 7: Chooser with long CJK event names at 320px width
  // =========================================================================
  console.log("\n--- TEST 7: Chooser with long CJK names at 320px width ---");
  {
    const ctx = await browser.newContext({
      viewport: { width: 320, height: 568 },
      permissions: ["camera"],
      extraHTTPHeaders: { Cookie: fixtures.memberCookieHeader, Origin: TARGET_URL },
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => { localStorage.setItem("efcc_auth_active", "1"); });
    await page.goto(`${TARGET_URL}/scanner?program_token=${fixtures.tokenA}`);
    await page.waitForSelector('section[class*="chooser"]');

    const shot = await captureScreenshot(page, "hunt-chooser-long-cjk-320");
    const radioRows = page.locator('label[class*="radioRow"]');
    const count = await radioRows.count();
    const isOverflowing = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

    // Measure hit area of radio rows
    const rowBoxes = [];
    for (let i = 0; i < count; i++) {
      const box = await radioRows.nth(i).boundingBox();
      rowBoxes.push(box);
    }
    console.log(`Chooser 320px: count=${count}, overflow=${isOverflowing}, rowBoxes=${JSON.stringify(rowBoxes)}`);

    if (rowBoxes.some(b => !b || b.height < 44)) {
      addFinding({
        title: "Chooser radio row touch target below 44px on 320px viewport",
        surface: "/scanner",
        state: "scan-chooser",
        viewport: "320x568",
        steps: [`1. Open multi-event chooser at 320x568`, `2. Measure label.radioRow bounding box`],
        expected: "Every radio choice row has minHeight >= 44px (2.75rem)",
        actual: `Radio row height is < 44px`,
        severity: "Major",
        screenshotPath: shot,
        evidence: { selector: 'label[class*="radioRow"]', metrics: { rowBoxes } },
        remediation: "Set min-height: 2.75rem on label.radioRow.",
      });
    }

    await ctx.close();
  }

  // =========================================================================
  // TEST 8: VoiceOver / TalkBack focus management across step transitions
  // =========================================================================
  console.log("\n--- TEST 8: Accessibility focus management across step transitions ---");
  {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 844 },
      permissions: ["camera"],
      extraHTTPHeaders: { Cookie: fixtures.memberCookieHeader, Origin: TARGET_URL },
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => { localStorage.setItem("efcc_auth_active", "1"); });

    // Transition 8A: Go to chooser -> does legend/heading receive focus?
    await page.goto(`${TARGET_URL}/scanner?program_token=${fixtures.tokenA}`);
    await page.waitForSelector('section[class*="chooser"]');
    await page.waitForTimeout(300);
    const focusedChooser = await page.evaluate(() => document.activeElement?.id);
    console.log(`Transition to Chooser: focusedElementId='${focusedChooser}'`);

    if (focusedChooser !== "scanner-chooser-title") {
      const shot = await captureScreenshot(page, "hunt-a11y-chooser-focus");
      addFinding({
        title: "Focus does not move to Chooser legend title on transition",
        surface: "/scanner",
        state: "scan-chooser",
        viewport: "375x844",
        steps: [
          `1. Resolve program token with multiple events on /scanner`,
          `2. Transition to ScannerChooser view`,
          `3. Check document.activeElement`,
        ],
        expected: "Focus shifts to #scanner-chooser-title (legend tabIndex={-1})",
        actual: `Focused element is '${focusedChooser}'`,
        severity: "Minor",
        screenshotPath: shot,
        evidence: { selector: "#scanner-chooser-title", metrics: { focusedChooser } },
        remediation: "Ensure headingRef on legend receives .focus() in useEffect when flow.events.length > 1.",
      });
    }

    // Transition 8B: Select row and Continue -> does Confirmation title receive focus?
    await page.locator('input[type="radio"]').first().check();
    await page.locator('button:has-text("繼續")').click();
    await page.waitForSelector('section[class*="confirmation"]');
    await page.waitForTimeout(300);
    const focusedConfirm = await page.evaluate(() => document.activeElement?.id);
    console.log(`Transition to Confirmation: focusedElementId='${focusedConfirm}'`);

    // Transition 8C: Submit confirmation -> does Result title receive focus?
    await page.locator('button:has-text("確認簽到")').click();
    await page.waitForSelector('section[class*="checkinResult"]');
    await page.waitForTimeout(300);
    const focusedResult = await page.evaluate(() => document.activeElement?.id);
    console.log(`Transition to Result: focusedElementId='${focusedResult}'`);

    await ctx.close();
  }

  // =========================================================================
  // TEST 9: 200% Zoom text scaling at 320px and Desktop
  // =========================================================================
  console.log("\n--- TEST 9: 200% Zoom scaling ---");
  {
    // Test 320px viewport with 200% text zoom (deviceScaleFactor = 2 or font zoom)
    const ctx = await browser.newContext({
      viewport: { width: 320, height: 568 },
    });
    const page = await ctx.newPage();
    await page.goto(`${TARGET_URL}/guest-check-in`);
    await page.waitForSelector("#attendance-code");

    // Apply 200% root font scaling
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await page.waitForTimeout(500);

    const shot = await captureScreenshot(page, "hunt-guest-200-zoom-320");
    const isOverflowingZoom = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    console.log(`Guest check-in 200% font zoom on 320px: overflow=${isOverflowingZoom}`);

    if (isOverflowingZoom) {
      addFinding({
        title: "Horizontal overflow at 200% text zoom on 320px phone viewport",
        surface: "/guest-check-in",
        state: "initial",
        viewport: "320x568 (200% text zoom)",
        steps: [
          `1. Open /guest-check-in at 320x568`,
          `2. Set font size to 200% (WCAG 1.4.4 Resize text)`,
          `3. Check page horizontal scrolling`,
        ],
        expected: "Content wraps gracefully without requiring horizontal scroll",
        actual: `Page requires horizontal scrolling (scrollWidth > clientWidth)`,
        severity: "Minor",
        screenshotPath: shot,
        evidence: { selector: "html", metrics: { isOverflowingZoom } },
        remediation: "Ensure all padding and container widths use box-sizing: border-box and flexible units.",
      });
    }

    await ctx.close();
  }

  // =========================================================================
  // TEST 10: Double-tap 確認簽到 / 繼續 (idempotency and button disabled state)
  // =========================================================================
  console.log("\n--- TEST 10: Double-tap submit idempotency ---");
  {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 844 },
      permissions: ["camera"],
      extraHTTPHeaders: { Cookie: fixtures.memberCookieHeader, Origin: TARGET_URL },
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => { localStorage.setItem("efcc_auth_active", "1"); });
    await page.goto(`${TARGET_URL}/scanner?manual_code=${fixtures.codeA2}`);
    await page.waitForSelector('section[class*="confirmation"]');

    let requestCount = 0;
    page.on("request", (req) => {
      if (req.url().includes("/api/v1/attendance/self")) {
        requestCount++;
      }
    });

    // Rapid double click on 確認簽到
    const submitBtn = page.locator('button:has-text("確認簽到")');
    await submitBtn.dblclick();
    await page.waitForSelector('section[class*="checkinResult"]');

    console.log(`Double-tap on 確認簽到: total /attendance/self requests fired = ${requestCount}`);
    if (requestCount > 1) {
      const shot = await captureScreenshot(page, "hunt-double-tap-duplicate-requests");
      addFinding({
        title: "Rapid double-tap on 確認簽到 fires multiple concurrent network requests",
        surface: "/scanner",
        state: "scan-confirmation",
        viewport: "375x844",
        steps: [
          `1. Open confirmation screen on /scanner`,
          `2. Rapidly double-tap 確認簽到 button`,
          `3. Observe network request count to /api/v1/attendance/self`,
        ],
        expected: "Button disables immediately on first tap, issuing exactly 1 request",
        actual: `Rapid tap fired ${requestCount} concurrent network requests`,
        severity: "Major",
        screenshotPath: shot,
        evidence: { selector: 'button:has-text("確認簽到")', metrics: { requestCount } },
        remediation: "Set submitting state synchronously before entering async dispatch in onSubmit.",
      });
    }

    await ctx.close();
  }

  await browser.close();

  console.log(`\n========================================`);
  console.log(`Adversarial hunt complete! Total findings: ${findings.length}`);
  console.log(`========================================`);

  fs.writeFileSync(
    path.resolve(process.cwd(), "docs/qa/adversarial-findings.json"),
    JSON.stringify(findings, null, 2)
  );
}

runAdversarialAudit().catch((err) => {
  console.error("Adversarial audit failed:", err);
  process.exit(1);
});
