/* oxlint-disable vitest/prefer-importing-vitest-globals */
// REL-01 (#261) Slice C — Programs Resilience Proof
//
// Failure-path resilience of the deployed Programs vertical, self-contained
// per repo convention (own COPY object + own fixture helpers, no shared
// module — same shape as programs-d1.test.ts / programs-vertical-proof.test.ts):
// - T1: enrollment-request network failure -> graceful error + retry -> success
// - T2: scanner check-in goes offline mid-flow -> graceful failure -> recovery
// - T3: viewport change mid-flow preserves partially entered guest data
// - T4: session expiry during an active mutation -> clean 401 -> login -> restore
//
// Every copy string below is grepped fresh from web/lib/copy.ts (attendance,
// programs, error and restore groups) — never guessed. programTransportAmbiguous
// is the program-save family copy (web/lib/programs/program-form.tsx) and is
// documented here for traceability; the enrollment-request panel surfaces
// error.networkError instead (errorCopyFor("NETWORK_ERROR")), which is what T1
// asserts as the actually-rendered copy.

import { expect, test } from "@playwright/test";
import type {
  APIRequestContext,
  Page,
  PlaywrightWorkerArgs,
} from "@playwright/test";

import { DEV_ADMIN, DEV_MEMBER } from "./dev-fixtures";

interface StorageState {
  cookies: {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Strict" | "Lax" | "None";
  }[];
  origins: {
    origin: string;
    localStorage: { name: string; value: string }[];
  }[];
}

type RequestFactory = Pick<PlaywrightWorkerArgs["playwright"], "request">;
const TARGET_URL = process.env.PROGRAMS_TARGET_URL ?? "http://127.0.0.1:8787";
const AUTH_HINT_KEY = "efcc_auth_active";

const ADMIN_USER = process.env.PROGRAMS_ADMIN_USERNAME ?? DEV_ADMIN.username;
const ADMIN_CRED =
  process.env.PROGRAMS_ADMIN_CREDENTIAL ?? DEV_ADMIN.credential;
const MEMBER_USER = process.env.PROGRAMS_MEMBER_USERNAME ?? DEV_MEMBER.username;
const MEMBER_CRED =
  process.env.PROGRAMS_MEMBER_CREDENTIAL ?? DEV_MEMBER.credential;
const MEMBER_USER_ID = DEV_MEMBER.userId;

const COPY = {
  // COPY.login (submit button label)
  login: "登入",
  // COPY.sections.programs
  pageTitle: "課程",
  // COPY.restore.expired
  restoreExpired: "工作階段已過期，請重新登入。",
  // COPY.error.networkError
  networkError: "無法連接伺服器，請檢查網路後再試。",
  // COPY.programs.enrollment
  enrollment: "報名",
  // COPY.programs.requestEnroll
  requestEnroll: "申請報名",
  // COPY.programs.requestSubmitted
  requestSubmitted: "已送出報名申請。",
  // COPY.programs.requestPendingHint
  requestPendingHint: "申請已送出，等待課程負責人處理。",
  // COPY.programs.programTransportAmbiguous (program-save family; not rendered by any flow tested here)
  programTransportAmbiguous:
    "未能確認課程是否已儲存。請重新整理工作區後再試，避免重複提交。",
  // COPY.sections.scanner
  scannerTitle: "掃描簽到",
  // COPY.attendance.resolve
  resolve: "查找聚會",
  // COPY.attendance.memberSubmit
  memberSubmit: "確認簽到",
  // COPY.attendance.transportAmbiguous
  transportAmbiguous: "未能確認簽到是否完成，請重試以確認狀態。",
  // COPY.attendance.retry
  retry: "重試簽到",
  // COPY.attendance.success
  success: "簽到成功。",
  // COPY.attendance.guestName
  guestName: "姓名",
  // COPY.attendance.guestPhone
  guestPhone: "電話",
  // COPY.attendance.guestSubmit
  guestSubmit: "確認簽到",
  // COPY.programs.settingsBasics
  settingsBasics: "基本資料",
  // COPY.programs.programDescription
  programDescription: "課程簡介",
  // COPY.programs.settingsSaveBasics
  settingsSaveBasics: "儲存基本資料",
};

interface ProofFixtures {
  requestProgramId: string;
  scannerProgramId: string;
  manualCode: string;
  adminContext: { storageState: StorageState };
  memberContext: { storageState: StorageState };
}

let fixtures: ProofFixtures;

function fresh(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required credential for ${name}`);
  }
  return value;
}

function statusText(page: Page, text: string | RegExp) {
  return page
    .locator("main")
    .getByText(text, { exact: typeof text === "string" });
}

function storageStateFromCookies(
  setCookieHeaders: string[],
  domain: string
): StorageState {
  const cookies = setCookieHeaders.map((header) => {
    const [pair, ...rest] = header.split(";");
    const eq = pair.indexOf("=");
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    const attrs = new Map(
      rest.map((part) => {
        const trimmed = part.trim();
        const sep = trimmed.indexOf("=");
        return sep === -1
          ? [trimmed.toLowerCase(), ""]
          : [trimmed.slice(0, sep).toLowerCase(), trimmed.slice(sep + 1)];
      })
    );
    const maxAge = attrs.get("max-age");
    const sameSite = attrs.get("samesite");
    return {
      name,
      value,
      domain,
      path: attrs.get("path") ?? "/",
      expires: maxAge ? Math.floor(Date.now() / 1000) + Number(maxAge) : -1,
      httpOnly: attrs.has("httponly"),
      secure: attrs.has("secure"),
      sameSite:
        sameSite === "Lax" ? "Lax" : sameSite === "None" ? "None" : "Strict",
    } as const satisfies StorageState["cookies"][number];
  });
  return { cookies, origins: [] };
}

async function loginApi(
  playwright: RequestFactory,
  usernameInput: string,
  passwordInput: string
): Promise<{ api: APIRequestContext; storageState: StorageState }> {
  const loginContext = await playwright.request.newContext({
    baseURL: TARGET_URL,
  });
  const response = await loginContext.post("/api/v1/auth/login", {
    headers: { Origin: new URL(TARGET_URL).origin },
    data: { username: usernameInput, password: passwordInput },
  });
  expect(response.status()).toBe(200);
  const setCookieHeaders = response
    .headersArray()
    .filter(({ name }) => name.toLowerCase() === "set-cookie")
    .map(({ value }) => value);
  const storageState: StorageState = storageStateFromCookies(
    setCookieHeaders,
    new URL(TARGET_URL).hostname
  );
  storageState.origins = [
    {
      origin: new URL(TARGET_URL).origin,
      localStorage: [{ name: AUTH_HINT_KEY, value: "1" }],
    },
  ];
  const cookieHeader = setCookieHeaders
    .map((header) => header.split(";", 1)[0])
    .join("; ");
  await loginContext.dispose();
  const api = await playwright.request.newContext({
    baseURL: TARGET_URL,
    extraHTTPHeaders: { Cookie: cookieHeader },
  });
  return { api, storageState };
}

async function postJson(
  api: APIRequestContext,
  path: string,
  data: unknown
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await api.post(path, { data });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    // Non-JSON response
  }
  return { status: res.status(), body };
}

/**
 * Page-driven login (pattern from tests/e2e/programs-d1.test.ts `loginAs`).
 * Deliberately stops right after the post-login navigation (no forced
 * /programs detour) so the deep-link restoration exercised by T4's re-login
 * stays observable.
 */
async function loginAs(
  page: Page,
  username: string,
  password: string
): Promise<void> {
  await page.goto("/");
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole("button", { name: COPY.login }).click();
  await page.waitForURL((url) => url.pathname !== "/");
}

test.beforeAll(async ({ playwright }) => {
  const adminLogin = await loginApi(
    playwright,
    required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
    required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
  );
  const memberLogin = await loginApi(
    playwright,
    required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
    required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
  );

  try {
    // 1. Dedicated department with every Programs module enabled
    const deptCode = fresh("DEPT_RPROOF");
    const deptRes = await postJson(
      adminLogin.api,
      "/api/v1/programs/departments",
      {
        code: deptCode,
        name: `Resilience Proof Department ${deptCode}`,
        lifecycle: "Active",
      }
    );
    expect(deptRes.status).toBe(201);
    const departmentId = (
      deptRes.body.data as { department: { department_id: string } }
    ).department.department_id;

    for (const moduleKey of [
      "program_catalog",
      "events",
      "enrollment",
      "attendance",
    ] as const) {
      const modRes = await adminLogin.api.post(
        `/api/v1/programs/departments/${departmentId}/modules/${moduleKey}/enable`
      );
      expect(modRes.status()).toBe(200);
    }

    // 2. MemberRequest program for T1 (member holds NO request for it, so the
    //    request-enroll mutation is genuinely in-flight when the route aborts).
    const reqProgRes = await postJson(
      adminLogin.api,
      `/api/v1/programs/departments/${departmentId}/programs`,
      {
        name: `Request Program ${fresh("REQ")}`,
        description: "Resilience request acceptance fixture",
        category: "測試",
        behavior_type: "Recurring",
        lifecycle: "Active",
        discoverability: "Listed",
        enrollment_mode: "MemberRequest",
      }
    );
    expect(reqProgRes.status).toBe(201);
    const requestProgramId = (
      reqProgRes.body.data as { program: { program_id: string } }
    ).program.program_id;

    // 3. ManagerOnly program for T2/T4 with an active Event whose check-in
    //    window is open now (starts ~30 min ago, ends ~60 min ahead).
    const scanProgRes = await postJson(
      adminLogin.api,
      `/api/v1/programs/departments/${departmentId}/programs`,
      {
        name: `Scanner Program ${fresh("SCN")}`,
        description: "Resilience scanner acceptance fixture",
        category: "測試",
        behavior_type: "Recurring",
        lifecycle: "Active",
        discoverability: "Listed",
        enrollment_mode: "ManagerOnly",
      }
    );
    expect(scanProgRes.status).toBe(201);
    const scannerProgramId = (
      scanProgRes.body.data as { program: { program_id: string } }
    ).program.program_id;

    const now = Date.now();
    const eventRes = await postJson(
      adminLogin.api,
      `/api/v1/programs/${scannerProgramId}/events`,
      {
        name: "Resilience Proof Gathering",
        location: "Main Hall",
        starts_at: new Date(now - 30 * 60_000).toISOString(),
        ends_at: new Date(now + 60 * 60_000).toISOString(),
      }
    );
    expect(eventRes.status).toBe(201);
    const manualCode = (
      eventRes.body.data as {
        event: { manual_check_in_code: string };
      }
    ).event.manual_check_in_code;

    // 4. Pre-enroll the member in the ManagerOnly scanner program (manager
    //    arranges members) so the T2 self check-in succeeds on retry.
    const enrollRes = await postJson(
      adminLogin.api,
      `/api/v1/programs/${scannerProgramId}/enrollments`,
      { member_user_id: MEMBER_USER_ID }
    );
    expect(enrollRes.status).toBe(201);

    fixtures = {
      requestProgramId,
      scannerProgramId,
      manualCode,
      adminContext: { storageState: adminLogin.storageState },
      memberContext: { storageState: memberLogin.storageState },
    };
  } finally {
    await adminLogin.api.dispose();
    await memberLogin.api.dispose();
  }
});

test.describe("Programs resilience proof (REL-01 / #261 Slice C)", () => {
  test("T1 network failure during enrollment request shows graceful retry, then recovers", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    await loginAs(
      page,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );
    await page.goto(`/programs?program=${fixtures.requestProgramId}`);
    const requestButton = page.getByRole("button", {
      name: COPY.requestEnroll,
    });
    await expect(requestButton).toBeVisible();

    // Abort only the POST mutation; reconciliation GETs must pass through, and
    // the route stays installed (no times limit) until the failure is proven.
    await page.route("**/enrollment-requests", (route) => {
      if (route.request().method() === "POST") {
        return route.abort("failed");
      }
      return route.continue();
    });

    await requestButton.click();

    // The enrollment panel surfaces the shared network-error copy
    // (errorCopyFor("NETWORK_ERROR") -> COPY.error.networkError) in an alert;
    // programTransportAmbiguous covers the program-save flow instead.
    const failureAlert = page.locator("main").getByRole("alert");
    await expect(failureAlert).toHaveText(COPY.networkError);

    // The Program detail context survives the failed mutation: still on the
    // detail URL with the enrollment panel and its retry affordance intact.
    await expect(page).toHaveURL(
      new RegExp(`/programs\\?program=${fixtures.requestProgramId}`, "u")
    );
    await expect(
      page.getByRole("heading", { name: COPY.enrollment })
    ).toBeVisible();
    await expect(requestButton).toBeVisible();

    await page.unroute("**/enrollment-requests");

    // Retry (the request-enroll button is the retry affordance): succeeds and
    // the request settles into the Pending state. (main-scoped: the success
    // notice is also announced into the shell-level sr-only live region,
    // which lives outside <main>.)
    await requestButton.click();
    await expect(statusText(page, COPY.requestSubmitted)).toBeVisible();
    await expect(statusText(page, COPY.requestPendingHint)).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("T2 scanner check-in survives going offline mid-flow, then recovers", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: fixtures.memberContext.storageState,
    });
    const page = await context.newPage();
    try {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(String(error)));

      await page.goto("/scanner");
      await expect(
        page.getByRole("heading", { name: COPY.scannerTitle })
      ).toBeVisible();

      // Resolve the Event by its manual code while online.
      await page.locator("#attendance-code").fill(fixtures.manualCode);
      await page.getByRole("button", { name: COPY.resolve }).click();
      const submitButton = page.getByRole("button", {
        name: COPY.memberSubmit,
      });
      await expect(submitButton).toBeVisible();

      // Go offline, then submit: the mutation must fail gracefully with the
      // ambiguous-transport state and a retry affordance — not a crash.
      await context.setOffline(true);
      await submitButton.click();
      await expect(statusText(page, COPY.transportAmbiguous)).toBeVisible();
      const retryButton = page.getByRole("button", { name: COPY.retry });
      await expect(retryButton).toBeVisible();
      expect(pageErrors).toEqual([]);

      // Back online: retry lands the check-in.
      await context.setOffline(false);
      await retryButton.click();
      await expect(statusText(page, COPY.success)).toBeVisible();
      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("T3 viewport change mid-flow preserves partially entered Guest Check-In data", async ({
    page,
  }) => {
    // Public route — the guest form is visible before resolution so a
    // viewport change preserves every field in the one-step flow.
    await page.goto("/guest-check-in");
    const codeInput = page.locator("#attendance-code");
    await codeInput.fill(fixtures.manualCode);
    const nameInput = page.getByLabel(COPY.guestName);
    const phoneInput = page.locator("#guest-phone");
    await expect(nameInput).toBeVisible();
    await expect(phoneInput).toBeVisible();

    const typedName = "Resilience 視像轉向";
    const typedPhone = "9123 4567";
    await nameInput.fill(typedName);
    await phoneInput.fill(typedPhone);

    // Simulate a 375x667 -> landscape rotation mid-flow, before submitting.
    await page.setViewportSize({ width: 667, height: 375 });

    // Partially entered state survives the in-flow viewport change…
    await expect(nameInput).toHaveValue(typedName);
    await expect(phoneInput).toHaveValue(typedPhone);
    // …and the primary action stays visible and enabled.
    const submitButton = page.getByRole("button", { name: COPY.guestSubmit });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();
  });

  test("T4 session expiry during an active mutation redirects to login and restores the in-progress object", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const settingsUrl = `/programs?mode=management&program=${fixtures.scannerProgramId}&task=settings`;
    await page.goto(settingsUrl);
    await expect(
      page.getByRole("heading", { name: COPY.settingsBasics })
    ).toBeVisible();

    // Settings/Basics description textarea (program-settings.tsx labels it
    // with COPY.programs.programDescription; the basics form is the only form
    // containing that label).
    const description = page
      .locator("form")
      .filter({ hasText: COPY.programDescription })
      .locator("textarea");
    await expect(description).toBeVisible();
    await description.fill("Resilience edit in progress");

    // Expiry mid-edit: cookies vanish while the workspace stays mounted.
    await page.context().clearCookies();

    // Submit the mutation: a clean 401 surfaces the session-expired copy
    // (errorCopyFor("AUTH_REQUIRED") -> COPY.restore.expired) and keeps the
    // workspace context intact — no blank crash, no phantom save.
    await page.getByRole("button", { name: COPY.settingsSaveBasics }).click();
    await expect(page.locator("main").getByRole("alert")).toHaveText(
      COPY.restoreExpired
    );
    await expect(page).toHaveURL(
      new RegExp(
        `/programs\\?mode=management&program=${fixtures.scannerProgramId}&task=settings`,
        "u"
      )
    );

    // Re-entering the shell (reload) detects the dead session and redirects
    // to login, remembering the in-progress task as the deep link.
    await page.reload();
    await expect(page).toHaveURL(/\/$/u);

    // Re-login restores the original Program Settings context.
    await page
      .locator('input[autocomplete="username"]')
      .fill(required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER));
    await page
      .locator('input[autocomplete="current-password"]')
      .fill(required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED));
    await page.getByRole("button", { name: COPY.login }).click();
    await expect(page).toHaveURL(
      new RegExp(
        `/programs\\?mode=management&program=${fixtures.scannerProgramId}&task=settings`,
        "u"
      )
    );
    await expect(
      page.getByRole("heading", { name: COPY.settingsBasics })
    ).toBeVisible();
    // Data correctness: the expired mutation never committed — the reloaded
    // workspace shows the original (empty) description, not the typed edit.
    await expect(description).toHaveValue("");
  });
});
