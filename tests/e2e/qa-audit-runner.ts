import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium, request } from "@playwright/test";
import type { APIRequestContext, Browser, BrowserContext, Page } from "@playwright/test";
const TARGET_URL = "http://127.0.0.1:8791";
const SCREENSHOT_DIR = path.resolve(process.cwd(), "docs/qa/screenshots");

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

interface AuditMeasurement {
  selector: string;
  rect: { x: number; y: number; width: number; height: number };
  computedStyle?: Record<string, string>;
  text?: string;
  attributes?: Record<string, string | null>;
}

interface FindingEvidence {
  id: string;
  surface: string;
  state: string;
  viewport: string;
  steps: string[];
  expected: string;
  actual: string;
  severity: "Blocker" | "Major" | "Minor" | "Nit";
  screenshotPath: string;
  measurements: AuditMeasurement[];
  notes?: string;
}

const findings: FindingEvidence[] = [];
let findingCounter = 1;

function recordFinding(f: Omit<FindingEvidence, "id">) {
  const id = `F-${String(findingCounter++).padStart(2, "0")}`;
  findings.push({ id, ...f });
  console.log(`[${f.severity}] ${id} (${f.surface} - ${f.state}): ${f.actual}`);
}

async function captureElement(
  page: Page,
  selector: string,
  screenshotName: string
): Promise<{ rect: { x: number; y: number; width: number; height: number }; computedStyle: Record<string, string>; attributes: Record<string, string | null>; text: string }> {
  const loc = page.locator(selector).first();
  await loc.waitFor({ state: "visible", timeout: 5000 });
  const rect = (await loc.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  const info = await loc.evaluate((el: HTMLElement) => {
    const cs = window.getComputedStyle(el);
    const attrs: Record<string, string | null> = {};
    for (const attr of el.attributes) {
      attrs[attr.name] = attr.value;
    }
    return {
      text: el.innerText || el.textContent || "",
      computedStyle: {
        minHeight: cs.minHeight,
        height: cs.height,
        width: cs.width,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        borderRadius: cs.borderRadius,
        outline: cs.outline,
        display: cs.display,
        lineHeight: cs.lineHeight,
      },
      attributes: attrs,
    };
  });

  const fullPath = path.join(SCREENSHOT_DIR, `${screenshotName}.png`);
  await page.screenshot({ path: fullPath, fullPage: false });
  return { rect, ...info };
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
function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function setupFixtures(browser: Browser) {
  const admin = await loginApi(browser, "E2E_admin", "E2E_admin!dev");
  const member = await loginApi(browser, "E2E_member", "E2E_member!dev");
  // Create test department
  const deptCode = `QA_${Date.now().toString(36)}`;
  const deptRes = await admin.api.post("/api/v1/programs/departments", {
    data: {
      code: deptCode,
      name: `QA 測試事工 ${deptCode}`,
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
        name: "主日崇拜 (QA示範)",
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
  // Active event A1 (Open check-in window)
  const eventA1Res = await admin.api.post(
    `/api/v1/programs/${progAId}/events`,
    {
      data: {
        name: "早堂崇拜",
        starts_at: minutesFromNow(-60),
        ends_at: minutesFromNow(60),
        location: "大禮堂 1/F",
      },
    }
  );
  const eventA1Json = (await eventA1Res.json()) as { data: { event: { event_id: string } } };
  const eventA1Id = eventA1Json.data.event.event_id;

  // Active event A2 (Overlapping, for chooser)
  const eventA2Res = await admin.api.post(
    `/api/v1/programs/${progAId}/events`,
    {
      data: {
        name: "午堂崇拜",
        starts_at: minutesFromNow(-45),
        ends_at: minutesFromNow(75),
        location: "副堂 2/F",
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

  // Future Event (Window not open: starts 4 hours from now)
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

  // Set predictable 6-digit manual check in codes via SQL update
  const sql = `
    UPDATE events SET manual_check_in_code = '482913' WHERE event_id = '${eventA1Id}';
    UPDATE events SET manual_check_in_code = '482914' WHERE event_id = '${eventA2Id}';
    UPDATE events SET manual_check_in_code = '482915' WHERE event_id = '${eventCancelledId}';
    UPDATE events SET manual_check_in_code = '482916' WHERE event_id = '${eventFutureId}';
    UPDATE events SET manual_check_in_code = '482917' WHERE event_id = '${eventUnenrolledId}';
  `;
  const webDir = path.resolve(process.cwd(), ".worktrees/stack-base-s3-authority/web");
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
  const codeA1 = "482913";
  const codeA2 = "482914";
  const codeCancelled = "482915";
  const codeFuture = "482916";
  const codeUnenrolled = "482917";
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

async function runAudit() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--enable-blink-features=ShapeDetection",
    ],
  });

  const fixtures = await setupFixtures(browser);
  console.log("Fixtures ready:", fixtures);

  // Viewports to test
  const viewports = [
    { name: "phone-320x568", width: 320, height: 568 },
    { name: "phone-375x844", width: 375, height: 844 },
    { name: "desktop-1280x900", width: 1280, height: 900 },
  ];

  // -------------------------------------------------------------
  // 1. AUDIT SURFACE: `/` Signed-out login
  // -------------------------------------------------------------
  console.log("\n=== 1. AUDITING `/` SIGNED-OUT LOGIN ===");
  for (const vp of viewports) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    await page.goto(`${TARGET_URL}/`);
    await page.waitForSelector("form");

    // Check guest entry link
    const guestLinkInfo = await captureElement(
      page,
      'p[class*="guestEntry"] a',
      `login-guest-entry-${vp.name}`
    );
    console.log(
      `Login Guest Link (${vp.name}): rect=${JSON.stringify(guestLinkInfo.rect)}, minHeight=${guestLinkInfo.computedStyle.minHeight}`
    );

    if (guestLinkInfo.rect.height < 44) {
      recordFinding({
        surface: "/",
        state: "signed-out",
        viewport: vp.name,
        steps: [`1. Open / at ${vp.name}`, `2. Measure .guestEntry a height`],
        expected: "Touch target height >= 44px (2.75rem)",
        actual: `Target height is ${guestLinkInfo.rect.height}px (< 44px)`,
        severity: "Major",
        screenshotPath: `docs/qa/screenshots/login-guest-entry-${vp.name}.png`,
        measurements: [{ selector: 'p[class*="guestEntry"] a', ...guestLinkInfo }],
      });
    }

    // Check register entry link
    const regLinkInfo = await captureElement(
      page,
      'p[class*="registerEntry"] a',
      `login-register-entry-${vp.name}`
    );
    console.log(
      `Login Register Link (${vp.name}): rect=${JSON.stringify(regLinkInfo.rect)}, minHeight=${regLinkInfo.computedStyle.minHeight}`
    );

    if (regLinkInfo.rect.height < 44) {
      recordFinding({
        surface: "/",
        state: "signed-out",
        viewport: vp.name,
        steps: [`1. Open / at ${vp.name}`, `2. Measure .registerEntry a height`],
        expected: "Touch target height >= 44px (2.75rem)",
        actual: `Target height is ${regLinkInfo.rect.height}px (< 44px)`,
        severity: "Major",
        screenshotPath: `docs/qa/screenshots/login-register-entry-${vp.name}.png`,
        measurements: [
          { selector: 'p[class*="registerEntry"] a', ...regLinkInfo },
        ],
      });
    }

    // Test tab navigation and focus ring
    await page.keyboard.press("Tab"); // username
    await page.keyboard.press("Tab"); // password
    await page.keyboard.press("Tab"); // submit
    await page.keyboard.press("Tab"); // register link
    const focusedRegTag = await page.evaluate(() => document.activeElement?.tagName);
    const focusedRegHref = await page.evaluate(() => (document.activeElement as HTMLAnchorElement)?.href);
    console.log(`Focused element after 4 tabs: ${focusedRegTag} (${focusedRegHref})`);

    await page.keyboard.press("Tab"); // guest check-in link
    const focusedGuestHref = await page.evaluate(() => (document.activeElement as HTMLAnchorElement)?.href);
    console.log(`Focused element after 5 tabs: ${focusedGuestHref}`);

    await ctx.close();
  }

  // -------------------------------------------------------------
  // 2. AUDIT SURFACE: `/guest-check-in`
  // -------------------------------------------------------------
  console.log("\n=== 2. AUDITING `/guest-check-in` ===");
  for (const vp of viewports) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    await page.goto(`${TARGET_URL}/guest-check-in`);
    await page.waitForSelector("#attendance-code");

    // Capture initial state
    const initialScreen = await captureElement(
      page,
      'section[class*="card"]',
      `guest-initial-${vp.name}`
    );
    const submitBtn = await captureElement(
      page,
      'button[type="submit"]',
      `guest-submit-btn-${vp.name}`
    );
    const backLink = await captureElement(
      page,
      'a[class*="back"]',
      `guest-back-link-${vp.name}`
    );
    const memberLoginLink = await captureElement(
      page,
      'div[class*="group"] a[class*="back"]',
      `guest-member-login-link-${vp.name}`
    );

    // Check fold visibility on 320x568
    if (vp.name === "phone-320x568") {
      const submitBottom = submitBtn.rect.y + submitBtn.rect.height;
      console.log(`320x568 Guest Submit Button bottom y = ${submitBottom}`);
      if (submitBottom > 568) {
        recordFinding({
          surface: "/guest-check-in",
          state: "initial",
          viewport: vp.name,
          steps: [
            `1. Open /guest-check-in at 320x568`,
            `2. Check if primary submit button clears the viewport fold without scrolling`,
          ],
          expected: `Primary action (確認簽到) bottom edge <= 568px`,
          actual: `Submit button bottom edge is at ${submitBottom}px (> 568px fold)`,
          severity: "Minor",
          screenshotPath: `docs/qa/screenshots/guest-initial-${vp.name}.png`,
          measurements: [
            { selector: 'button[type="submit"]', ...submitBtn },
          ],
        });
      }
    }

    // State 2.1: Empty submit validation
    await page.locator('button[type="submit"]').click();
    const errorInfo = await captureElement(
      page,
      'output[data-tone="error"]',
      `guest-validation-empty-${vp.name}`
    );
    const focusedId = await page.evaluate(() => document.activeElement?.id);
    const ariaInvalidCode = await page.locator("#attendance-code").getAttribute("aria-invalid");
    console.log(`Guest empty validation: focusedId=${focusedId}, ariaInvalid=${ariaInvalidCode}, error=${errorInfo.text}`);

    if (focusedId !== "attendance-code") {
      recordFinding({
        surface: "/guest-check-in",
        state: "validation",
        viewport: vp.name,
        steps: [`1. Click 確認簽到 with empty fields`],
        expected: "Focus moves to first invalid input (#attendance-code)",
        actual: `Focused element is #${focusedId}`,
        severity: "Major",
        screenshotPath: `docs/qa/screenshots/guest-validation-empty-${vp.name}.png`,
        measurements: [{ selector: 'output[data-tone="error"]', ...errorInfo }],
      });
    }

    // Check partial validation: fill code only
    await page.locator("#attendance-code").fill(fixtures.codeA1);
    await page.locator('button[type="submit"]').click();
    const focusedIdName = await page.evaluate(() => document.activeElement?.id);
    console.log(`Guest partial validation (code filled): focusedId=${focusedIdName}`);

    // Check partial validation: fill name only
    await page.locator("#guest-name").fill("陳大文");
    await page.locator('button[type="submit"]').click();
    const focusedIdPhone = await page.evaluate(() => document.activeElement?.id);
    console.log(`Guest partial validation (code+name filled): focusedId=${focusedIdPhone}`);

    // Check invalid phone validation
    await page.locator("#guest-phone").fill("123");
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(500);
    const invalidPhoneError = await captureElement(
      page,
      'output[data-tone="error"]',
      `guest-validation-invalid-phone-${vp.name}`
    );
    console.log(`Guest invalid phone error: ${invalidPhoneError.text}`);

    // State 2.2: Invalid code
    await page.locator("#attendance-code").fill("999999");
    await page.locator("#guest-name").fill("陳大文");
    await page.locator("#guest-phone").fill("91234567");
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(500);
    const invalidCodeError = await captureElement(
      page,
      'output[data-tone="error"]',
      `guest-invalid-code-${vp.name}`
    );
    console.log(`Guest invalid code error: ${invalidCodeError.text}`);

    // State 2.3: Successful Guest Check-in
    const guestPhone = `9${Math.floor(1000000 + Math.random() * 8999999)}`;
    await page.locator("#attendance-code").fill(fixtures.codeA1);
    await page.locator("#guest-name").fill("陳大文");
    await page.locator("#guest-phone").fill(guestPhone);
    await page.locator('button[type="submit"]').click();
    await page.waitForSelector('section[class*="checkinResult"]');

    const successResult = await captureElement(
      page,
      'section[class*="checkinResult"]',
      `guest-success-result-${vp.name}`
    );
    const successTitle = await page.locator("#guest-result-title").innerText();
    const focusedResultH1 = await page.evaluate(() => document.activeElement?.id);
    console.log(`Guest success result: title=${successTitle}, focusedElement=${focusedResultH1}`);

    // State 2.4: Duplicate Guest Check-in
    // Go back and submit again with same phone
    await page.goto(`${TARGET_URL}/guest-check-in`);
    await page.locator("#attendance-code").fill(fixtures.codeA1);
    await page.locator("#guest-name").fill("陳大文");
    await page.locator("#guest-phone").fill(guestPhone);
    await page.locator('button[type="submit"]').click();
    await page.waitForSelector('section[class*="checkinResult"]');

    const duplicateResult = await captureElement(
      page,
      'section[class*="checkinResult"]',
      `guest-duplicate-result-${vp.name}`
    );
    const dupTitle = await page.locator("#guest-result-title").innerText();
    const dupIcon = await page.locator('[data-testid="guest-result-icon-duplicate"]').count();
    console.log(`Guest duplicate result: title=${dupTitle}, dupIconFound=${dupIcon}`);

    // State 2.5: Multi-event chooser on guest check-in
    await page.goto(`${TARGET_URL}/guest-check-in`);
    await page.locator("#attendance-code").fill(fixtures.tokenA);
    await page.locator("#guest-name").fill("黃訪客");
    await page.locator("#guest-phone").fill(`9${Math.floor(1000000 + Math.random() * 8999999)}`);
    await page.locator('button[type="submit"]').click();
    await page.waitForSelector('div[class*="group"] input[type="radio"]');

    const chooserInfo = await captureElement(
      page,
      'div[class*="group"]',
      `guest-chooser-${vp.name}`
    );
    console.log(`Guest Chooser visible with radio options`);

    // State 2.6: Long name stress test
    await page.goto(`${TARGET_URL}/guest-check-in`);
    const longName = "陳大文陳大文陳大文陳大文陳大文陳大文陳大文陳大文陳大文陳大文陳大文陳大文陳大文陳大文陳大文陳大文陳大文陳大文陳大文陳大文";
    await page.locator("#attendance-code").fill(fixtures.codeA1);
    await page.locator("#guest-name").fill(longName);
    await page.locator("#guest-phone").fill(`9${Math.floor(1000000 + Math.random() * 8999999)}`);
    const isOverflowing = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    console.log(`Guest long name form: horizontal overflow = ${isOverflowing}`);
    await captureElement(page, 'section[class*="card"]', `guest-long-name-${vp.name}`);

    if (isOverflowing) {
      recordFinding({
        surface: "/guest-check-in",
        state: "edge-case-long-name",
        viewport: vp.name,
        steps: [`1. Fill 80-char name in guest check-in form`, `2. Check page horizontal overflow`],
        expected: "No horizontal scroll (scrollWidth <= clientWidth)",
        actual: "Page has horizontal scroll bar",
        severity: "Major",
        screenshotPath: `docs/qa/screenshots/guest-long-name-${vp.name}.png`,
        measurements: [],
      });
    }

    await ctx.close();
  }

  // -------------------------------------------------------------
  // 3. AUDIT SURFACE: `/scanner` on phone (<800px)
  // -------------------------------------------------------------
  console.log("\n=== 3. AUDITING `/scanner` ON PHONE ===");
  for (const vp of [viewports[0], viewports[1]]) {
    const ctx = await browser.newContext({
      viewport: vp,
      permissions: ["camera"],
      extraHTTPHeaders: {
        Cookie: fixtures.memberCookieHeader,
        Origin: TARGET_URL,
      },
    });

    const page = await ctx.newPage();

    // Set auth hint in localStorage before goto
    await page.addInitScript(() => {
      localStorage.setItem("efcc_auth_active", "1");
    });

    // State 3.1 & 3.2: Camera live state
    await page.goto(`${TARGET_URL}/scanner`);
    await page.waitForSelector('[data-camera-state="live"]', { timeout: 10000 });

    const liveCamera = await captureElement(
      page,
      '[data-camera-state="live"]',
      `scanner-live-${vp.name}`
    );
    const stopBtn = await captureElement(
      page,
      'button[class*="cameraStop"]',
      `scanner-stop-btn-${vp.name}`
    );
    console.log(`Scanner Live (${vp.name}): stopBtn rect = ${JSON.stringify(stopBtn.rect)}`);

    // Check stop button clearing fold and floating dock
    if (vp.name === "phone-320x568") {
      const stopBottom = stopBtn.rect.y + stopBtn.rect.height;
      console.log(`320x568 Scanner Stop button bottom = ${stopBottom}`);
      if (stopBottom > 568 - 56) { // dock height is ~56px
        console.log(`Warning: Stop button bottom ${stopBottom} is near/under dock`);
      }
    }

    // State 3.3: Stop scan → Fallback state
    await page.locator('button[class*="cameraStop"]').click();
    await page.waitForSelector('[data-scanner-state="fallback"]');

    const fallbackState = await captureElement(
      page,
      '[data-scanner-state="fallback"]',
      `scanner-fallback-${vp.name}`
    );
    const manualCard = await captureElement(
      page,
      'button[class*="methodCard"]',
      `scanner-method-manual-${vp.name}`
    );
    const qrCard = await captureElement(
      page,
      'a[class*="methodCard"]',
      `scanner-method-qr-${vp.name}`
    );
    console.log(
      `Fallback Methods (${vp.name}): manualCard height=${manualCard.rect.height}, qrCard height=${qrCard.rect.height}`
    );

    // State 3.4: Manual 6-digit code entry
    await page.locator('button[class*="methodCard"]').click();
    await page.waitForSelector('[data-scanner-state="manual"]');

    const manualForm = await captureElement(
      page,
      '[data-scanner-state="manual"]',
      `scanner-manual-form-${vp.name}`
    );
    const manualInput = await captureElement(
      page,
      "#attendance-code",
      `scanner-manual-input-${vp.name}`
    );
    console.log(`Manual Code Form (${vp.name}): input focused=${await page.evaluate(() => document.activeElement?.id === "attendance-code")}`);

    // Test typing invalid length
    await page.locator("#attendance-code").fill("12345");
    await page.locator('button[type="submit"]').click();
    const manualInvalidError = await captureElement(
      page,
      'output[data-tone="error"]',
      `scanner-manual-invalid-${vp.name}`
    );
    console.log(`Manual invalid code error: ${manualInvalidError.text}`);

    // Resolve valid manual code
    await page.locator("#attendance-code").fill(fixtures.codeA1);
    await page.locator('button[type="submit"]').click();
    await page.waitForSelector('section[class*="confirmation"]');

    // State 3.5: Confirmation screen
    const confirmScreen = await captureElement(
      page,
      'section[class*="confirmation"]',
      `scanner-confirmation-${vp.name}`
    );
    const confirmH1 = await page.locator("#attendance-confirm-title").innerText();
    const confirmEventTitle = await page.locator("#attendance-confirm-event-title").innerText();
    const notThisBtn = await captureElement(
      page,
      'button:has-text("不是這個聚會")',
      `scanner-not-this-btn-${vp.name}`
    );
    console.log(`Scanner Confirmation: title=${confirmH1}, event=${confirmEventTitle}, notThisBtn=${JSON.stringify(notThisBtn.rect)}`);

    // Test "不是這個聚會" escape
    await page.locator('button:has-text("不是這個聚會")').click();
    await page.waitForTimeout(500);
    // Should return to live scanner
    const isBackAtScanner = await page.locator('[data-camera-state="live"], [data-camera-state="opening"]').count();
    console.log(`Not this event clicked: returned to scanner = ${isBackAtScanner > 0}`);

    // Resolve code again and submit
    await page.locator('button[class*="cameraStop"]').click();
    await page.locator('button[class*="methodCard"]').click();
    await page.locator("#attendance-code").fill(fixtures.codeA1);
    await page.locator('button[type="submit"]').click();
    await page.waitForSelector('section[class*="confirmation"]');

    // Submit confirmation
    await page.locator('button:has-text("確認簽到")').click();
    await page.waitForSelector('section[class*="checkinResult"]');

    // State 3.6: Success result screen
    const memberSuccess = await captureElement(
      page,
      'section[class*="checkinResult"]',
      `scanner-member-success-${vp.name}`
    );
    const memberSuccessTitle = await page.locator("#attendance-result-title").innerText();
    console.log(`Member Success: ${memberSuccessTitle}`);

    // State 3.7: Duplicate check-in result
    await page.locator('button:has-text("再次簽到")').click();
    await page.waitForSelector('[data-camera-state="live"]');
    await page.locator('button[class*="cameraStop"]').click();
    await page.locator('button[class*="methodCard"]').click();
    await page.locator("#attendance-code").fill(fixtures.codeA1);
    await page.locator('button[type="submit"]').click();
    await page.waitForSelector('section[class*="confirmation"]');
    await page.locator('button:has-text("確認簽到")').click();
    await page.waitForSelector('section[class*="checkinResult"]');

    const memberDup = await captureElement(
      page,
      'section[class*="checkinResult"]',
      `scanner-member-duplicate-${vp.name}`
    );
    const memberDupTitle = await page.locator("#attendance-result-title").innerText();
    console.log(`Member Duplicate: ${memberDupTitle}`);

    // State 3.8: Multi-event chooser screen
    await page.goto(`${TARGET_URL}/scanner?program_token=${fixtures.tokenA}`);
    await page.waitForSelector('section[class*="chooser"]');

    const memberChooser = await captureElement(
      page,
      'section[class*="chooser"]',
      `scanner-member-chooser-${vp.name}`
    );
    console.log(`Member Chooser rendered`);

    // State 3.9: Outcome screens
    // Window not open
    await page.goto(`${TARGET_URL}/scanner?manual_code=${fixtures.codeFuture}`);
    await page.waitForSelector('section[class*="outcome"]');
    const outcomeWindow = await captureElement(
      page,
      'section[class*="outcome"]',
      `scanner-outcome-window-${vp.name}`
    );
    console.log(`Outcome Window Not Open: ${await page.locator("#scanner-outcome-title").innerText()}`);

    // Cancelled
    await page.goto(`${TARGET_URL}/scanner?manual_code=${fixtures.codeCancelled}`);
    await page.waitForSelector('section[class*="outcome"]');
    const outcomeCancelled = await captureElement(
      page,
      'section[class*="outcome"]',
      `scanner-outcome-cancelled-${vp.name}`
    );
    console.log(`Outcome Cancelled: ${await page.locator("#scanner-outcome-title").innerText()}`);

    // Not enrolled
    await page.goto(`${TARGET_URL}/scanner?manual_code=${fixtures.codeUnenrolled}`);
    await page.waitForSelector('section[class*="outcome"]');
    const outcomeNotEnrolled = await captureElement(
      page,
      'section[class*="outcome"]',
      `scanner-outcome-not-enrolled-${vp.name}`
    );
    console.log(`Outcome Not Enrolled: ${await page.locator("#scanner-outcome-title").innerText()}`);

    await ctx.close();
  }

  // -------------------------------------------------------------
  // 4. AUDIT SURFACE: `/scanner` on Desktop (1280x900)
  // -------------------------------------------------------------
  console.log("\n=== 4. AUDITING `/scanner` ON DESKTOP ===");
  const desktopVp = viewports[2];
  const desktopCtx = await browser.newContext({
    viewport: desktopVp,
    extraHTTPHeaders: {
      Cookie: fixtures.memberCookieHeader,
      Origin: TARGET_URL,
    },
  });
  const desktopPage = await desktopCtx.newPage();
  await desktopPage.addInitScript(() => {
    localStorage.setItem("efcc_auth_active", "1");
  });
  await desktopPage.goto(`${TARGET_URL}/scanner`);
  await desktopPage.waitForSelector('[data-scanner-state="desktop-manual"]');

  const desktopManual = await captureElement(
    desktopPage,
    '[data-scanner-state="desktop-manual"]',
    `scanner-desktop-manual-${desktopVp.name}`
  );
  const desktopRail = await captureElement(
    desktopPage,
    'nav[class*="rail"]',
    `scanner-desktop-rail-${desktopVp.name}`
  );
  console.log(`Desktop Manual State: card rect=${JSON.stringify(desktopManual.rect)}, rail visible=${Boolean(desktopRail.rect)}`);

  // Fill manual code on desktop
  await desktopPage.locator("#attendance-code").fill(fixtures.codeA1);
  await desktopPage.locator('button[type="submit"]').click();
  await desktopPage.waitForSelector('section[class*="confirmation"]');

  const desktopConfirm = await captureElement(
    desktopPage,
    'section[class*="confirmation"]',
    `scanner-desktop-confirmation-${desktopVp.name}`
  );
  console.log(`Desktop Confirmation State rendered`);

  await desktopCtx.close();

  // -------------------------------------------------------------
  // 5. AUDIT CAMERA DENIED & UNSUPPORTED STATES
  // -------------------------------------------------------------
  console.log("\n=== 5. AUDITING CAMERA DENIED & UNSUPPORTED STATES ===");
  // Denied camera
  const deniedCtx = await browser.newContext({
    viewport: viewports[1],
    permissions: [], // no camera permission
    extraHTTPHeaders: {
      Cookie: fixtures.memberCookieHeader,
      Origin: TARGET_URL,
    },
  });
  const deniedPage = await deniedCtx.newPage();
  await deniedPage.addInitScript(() => {
    localStorage.setItem("efcc_auth_active", "1");
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
  });
  await deniedPage.goto(`${TARGET_URL}/scanner`);
  await deniedPage.waitForSelector('div[class*="cameraUnavailable"]');

  const deniedScreen = await captureElement(
    deniedPage,
    '[data-scanner-state="fallback"]',
    `scanner-camera-denied-${viewports[1].name}`
  );
  const retryBtn = await captureElement(
    deniedPage,
    'button:has-text("重試相機")',
    `scanner-camera-retry-btn-${viewports[1].name}`
  );
  console.log(`Camera Denied State: retryBtn visible=${Boolean(retryBtn.rect)}`);
  await deniedCtx.close();

  // Unsupported camera
  const unsuppCtx = await browser.newContext({
    viewport: viewports[1],
    extraHTTPHeaders: {
      Cookie: fixtures.memberCookieHeader,
      Origin: TARGET_URL,
    },
  });
  const unsuppPage = await unsuppCtx.newPage();
  await unsuppPage.addInitScript(() => {
    localStorage.setItem("efcc_auth_active", "1");
    // Delete mediaDevices
    Object.defineProperty(navigator, "mediaDevices", {
      value: undefined,
      configurable: true,
    });
  });
  await unsuppPage.goto(`${TARGET_URL}/scanner`);
  await unsuppPage.waitForSelector('div[class*="cameraUnavailable"]');

  const unsuppScreen = await captureElement(
    unsuppPage,
    '[data-scanner-state="fallback"]',
    `scanner-camera-unsupported-${viewports[1].name}`
  );
  const hasRetry = await unsuppPage.locator('button:has-text("重試相機")').count();
  console.log(`Camera Unsupported State: hasRetryButton=${hasRetry > 0}`);
  await unsuppCtx.close();

  await browser.close();

  console.log(`\nAudit completed! Total recorded findings: ${findings.length}`);
  fs.writeFileSync(
    path.resolve(process.cwd(), "docs/qa/audit-findings.json"),
    JSON.stringify(findings, null, 2)
  );
}

runAudit().catch((err) => {
  console.error("Audit error:", err);
  process.exit(1);
});
