/* oxlint-disable vitest/prefer-importing-vitest-globals */
// ATT-04 (#216) — local/deployed D1 end-to-end proof of QR attendance
// (self / guest / assisted check-in, ATT-01/02/03 #213/#214/#215).
//
// Drives the real browser UI (Next.js static export served by the Worker
// ASSETS binding) plus same-origin `/api/v1/attendance/*` and
// `/api/v1/programs/*` RPCs at phone-375x667 and desktop-1280x720 widths
// against the local Worker/D1 by default, or an explicitly isolated remote
// target when `PROGRAMS_TARGET_URL` is supplied.
// Acceptance trace: docs/omp-plans/2026-08-07-att-04-ticket-216.md.
// Copy strings below mirror web/lib/copy.ts; the suite asserts observable
// DOM state and server responses (RFC 9457 problem codes), never
// client-side gating alone.
//
// Entry model (verified against web/lib/attendance.ts):
//   - a typed entry is ambiguous; the server tries the Event manual code
//     first (unique per Event, migration 0004: 8 uppercase hex chars), then
//     the Program check-in token (migration 0004: 32 lowercase hex chars).
//   - a member's personal `qr_code_string` (profile QR) is NOT a check-in
//     entry in the D1 worker — only program tokens / event manual codes
//     resolve. The seeded E2E-MEMBER-U-E2E-MEMBER value is exercised via
//     the operator member search (exact qr_code_string match) instead.
import { expect, test } from "@playwright/test";
import type {
  APIRequestContext,
  Page,
  PlaywrightWorkerArgs,
} from "@playwright/test";

import { DEV_ADMIN, DEV_MEMBER, DEV_STAFF } from "./dev-fixtures";

// @playwright/test does not export named `Playwright`/`StorageState` types;
// the helpers below only need the request-context surface and the cookie
// shape accepted by browser.newContext({ storageState }).
type RequestFactory = Pick<PlaywrightWorkerArgs["playwright"], "request">;

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

const TARGET_URL = process.env.PROGRAMS_TARGET_URL ?? "http://127.0.0.1:8787";

// Non-secret presence flag the shell requires before it re-verifies cookies
// (web/lib/session.ts AUTH_HINT_KEY). Login normally sets it in browser
// storage; the API-driven fixture logins here must mirror it in the
// storageState origins, or the shell cold-boots to the login surface.
const AUTH_HINT_KEY = "efcc_auth_active";

const configuredTarget = process.env.PROGRAMS_TARGET_URL;
const localTarget =
  !configuredTarget ||
  ["localhost", "127.0.0.1"].includes(new URL(configuredTarget).hostname);
const ADMIN_USER =
  process.env.PROGRAMS_ADMIN_USERNAME ??
  (localTarget ? DEV_ADMIN.username : undefined);
const ADMIN_CRED =
  process.env.PROGRAMS_ADMIN_CREDENTIAL ??
  (localTarget ? DEV_ADMIN.credential : undefined);
const STAFF_USER =
  process.env.PROGRAMS_STAFF_USERNAME ??
  (localTarget ? DEV_STAFF.username : undefined);
const STAFF_CRED =
  process.env.PROGRAMS_STAFF_CREDENTIAL ??
  (localTarget ? DEV_STAFF.credential : undefined);
const MEMBER_USER =
  process.env.PROGRAMS_MEMBER_USERNAME ??
  (localTarget ? DEV_MEMBER.username : undefined);
const MEMBER_CRED =
  process.env.PROGRAMS_MEMBER_CREDENTIAL ??
  (localTarget ? DEV_MEMBER.credential : undefined);

const COPY = {
  scannerTitle: "掃描簽到",
  assistedOpen: "開協助簽到",
  assistedMode: "協助簽到",
  assistedContext: "目前聚會",
  assistedContextStale: "此聚會已不再開放或你沒有權限，請重新選擇。",
  inputLabel: "課程 QR 代碼或聚會手動代碼",
  resolve: "查找聚會",
  chooseEvent: "選擇聚會",
  guestName: "姓名",
  guestPhone: "電話",
  guestSubmit: "送出訪客簽到",
  confirmHeader: "確認簽到",
  recognizedBadge: "已辨識",
  confirmTitle: "確認聚會",
  confirmLead: "請核對聚會資料，確認後才會記錄出席。",
  confirmSubmit: "確認簽到",
  notThisEvent: "不是這個聚會",
  resultTitle: "簽到結果",
  successTitle: "簽到完成",
  duplicateTitle: "已完成簽到",
  duplicateBody: "你已在此聚會簽到，無需重複。",
  backHome: "返回首頁",
  scanAgain: "再次簽到",
  submitFailure: "未能完成簽到，請重試一次。",
  offlineSubmit: "未能提交簽到。請重新連線後再次確認；系統不會自動重試。",
  retry: "重試簽到",
  success: "簽到成功。",
  guestDuplicate: "此電話已簽到。如需協助，請聯絡聚會負責人。",
  eventCancelled: "此聚會已取消，不能簽到。",
  loginForMember: "登入後以成員身份簽到",
  camera: "使用相機掃描 QR",
  invalidEntry: "請從有效的 QR 或聚會代碼進入簽到。",
  enrollmentRequired: "報名狀態不符合簽到條件。",
  notFound: "找不到請求的資料。",
  invalidPhoneDetail: "請輸入有效電話號碼。",
  memberSearch: "搜尋已報名成員",
  search: "搜尋",
  checkInMember: "替成員簽到",
  roster: "簽到名單",
  rosterTitle: "簽到名單",
  rosterStatusActive: "開放簽到",
  checkedInCount: (count: number, total: number) => `已簽到 ${count}/${total}`,
  statusActive: "有效",
  statusVoided: "已作廢",
  void: "作廢簽到",
  voidAttendance: "作廢簽到",
  voidReason: "作廢原因",
  voidLead: "作廢後會保留記錄，但不再計入出席進度。",
  voidConfirm: "確認作廢",
  voidSuccess: "簽到已作廢",
  correctGuest: "修正訪客資料",
  guestCorrection: "修正訪客資料",
  correctionReason: "姓名或電話",
  correctionLead: "輸入訪客的正確姓名或電話。",
  saveCorrection: "儲存修正",
  correctionSaved: "訪客資料已修正",
  printSheet: "列印簽到表",
  exportSheet: "匯出簽到表",
  scanTitle: "聚會簽到",
  scanLead: "掃描場地顯示的二維碼。",
  startScan: "開始掃描",
  cameraUnavailableTitle: "未能使用相機",
  cameraUnavailableHint:
    "你可以檢查瀏覽器權限，或改用下面的聚會代碼繼續 — 兩種方式同樣可靠。",
  manualEntryTitle: "輸入聚會代碼",
  manualEntryHint: "相機不可用時，輸入現場顯示的六位數代碼。",
  manualOnlyTitle: "只在你按下後使用相機",
  manualOnlyHint: "相機權限只會在開始掃描時請求。",
  scanMethodTitle: "簽到方式",
  invalidManualCode: "請輸入六位數聚會代碼。",
  chooseMeeting: "選擇要簽到的聚會",
  chooseMeetingHint: "此二維碼可用於多個聚會，請揀選你參加的那一個。",
  recognizedMultiple: "已辨識多個聚會",
  rescan: "重新掃描",
  outcomeHeader: "簽到狀態",
  outcomeWindowTitle: "簽到尚未開放",
  outcomeWindowBodyPrefix: "此聚會的簽到時段將於",
  outcomeWindowBodySuffix:
    "開始（聚會開始前 30 分鐘）。開放後可以重新掃描或輸入代碼簽到。",
  outcomeWindowBodySuffixWithoutOffset:
    "開始。開放後可以重新掃描或輸入代碼簽到。",
  outcomeCancelledTitle: "此聚會已取消",
  outcomeCancelledBody:
    "請留意教會通知，或聯絡負責同工了解最新安排。此聚會不會記錄出席。",
  outcomeNotEnrolledTitle: "你尚未報名此課程",
  outcomeNotEnrolledBody:
    "請先查看課程詳情並提交報名，或聯絡負責同工協助登記，之後即可掃描簽到。",
  viewProgramDetail: "查看課程詳情",
  backToScan: "返回掃描",
};

// Seeded fixture identities (tests/e2e/seed-dev-accounts.ts). The member QR
// string is deterministic: `E2E-${role.toUpperCase()}-${userId}`.
const MEMBER_USER_ID = "U-E2E-MEMBER";
const MEMBER_QR_STRING = "E2E-MEMBER-U-E2E-MEMBER";

interface AttendanceEventFixture {
  // Raw snake_case EventRow as returned by POST /api/v1/programs/:id/events
  // (web/lib/programs/workspace-store.ts EventRow).
  event_id: string;
  manual_check_in_code: string;
}

interface Fixtures {
  programId: string;
  checkInToken: string;
  eventA: AttendanceEventFixture;
  eventB: AttendanceEventFixture;
  cancelledEvent: AttendanceEventFixture;
  futureEvent: AttendanceEventFixture;
  unenrolledProgramId: string;
  unenrolledEvent: AttendanceEventFixture;
  adminState: StorageState;
  memberState: StorageState;
  staffState: StorageState;
}

let fixtures: Fixtures;

function required(name: string, value: string | null | undefined): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function fresh(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/** 8-digit HK mobile (normalizes to `hk:852...`). */
function freshPhone(): string {
  return String(10_000_000 + Math.floor(Math.random() * 89_999_999));
}

function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function loginApi(
  playwright: RequestFactory,
  username: string,
  credential: string
): Promise<{ api: APIRequestContext; storageState: StorageState }> {
  const loginContext = await playwright.request.newContext({
    baseURL: TARGET_URL,
  });
  const response = await loginContext.post("/api/v1/auth/login", {
    headers: { Origin: new URL(TARGET_URL).origin },
    data: { username, password: credential },
  });
  expect(response.status()).toBe(200);
  // APIRequestContext does not expose cookies(); derive both the browser
  // storageState and an explicit request Cookie header from Set-Cookie. The
  // explicit header keeps local HTTP runs equivalent to remote HTTPS runs
  // when the auth cookies carry the Secure attribute.
  const setCookieHeaders = response
    .headersArray()
    .filter(({ name }) => name.toLowerCase() === "set-cookie")
    .map(({ value }) => value);
  expect(
    setCookieHeaders.map((header) => header.split("=", 1)[0]).sort()
  ).toEqual(["efcc_access", "efcc_refresh"]);
  // Keep the cookie parser below the login flow for readability.
  // eslint-disable-next-line no-use-before-define
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
    } as const satisfies {
      name: string;

      value: string;
      domain: string;
      path: string;
      expires: number;
      httpOnly: boolean;
      secure: boolean;
      sameSite: "Lax" | "None" | "Strict";
    };
  });
  return { cookies, origins: [] };
}
function cookieHeaderFromStorageState(state: StorageState): string {
  return state.cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
}

/** Status messages render twice: the panel output and the app's sr-only
 *  live region (announce). Scope to the page's <main> so assertions are
 *  unambiguous. */
function statusText(page: Page, text: string) {
  return page.locator("main").getByText(text, { exact: true });
}

async function postJson(
  api: APIRequestContext,
  path: string,
  data?: unknown
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await api.post(path, { data });
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status(), body };
}

async function patchJson(
  api: APIRequestContext,
  path: string,
  data?: unknown
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await api.patch(path, { data });
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status(), body };
}

function guestCheckIn(
  api: APIRequestContext,
  eventId: string,
  manualCode: string,
  name: string,
  phone: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  return postJson(api, "/api/v1/attendance/guest", {
    event_id: eventId,
    method: "guest_manual_code",
    manual_code: manualCode,
    name,
    phone,
  });
}

/** Guest panel flow: type an entry, wait for resolve, submit name+phone. */
async function guestPanelCheckIn(
  page: Page,
  entry: string,
  name: string,
  phone: string
): Promise<void> {
  await page.goto("/guest-check-in");
  await page.locator("#attendance-code").fill(entry);
  await page.getByRole("button", { name: COPY.resolve }).click();
  await expect(page.locator("#guest-name")).toBeVisible();
  await page.locator("#guest-name").fill(name);
  await page.locator("#guest-phone").fill(phone);
  await page.getByRole("button", { name: COPY.guestSubmit }).click();
}

/** Resolve an entry that yields multiple open events; pick one chooser row. */
async function resolveAndChoose(
  page: Page,
  entry: string,
  index: number
): Promise<void> {
  const manualCard = page.getByRole("button", {
    name: new RegExp(COPY.manualEntryTitle),
  });
  if (
    (await manualCard.count()) > 0 &&
    !(await page.locator("#attendance-code").isVisible())
  ) {
    await manualCard.click();
  }
  await page.locator("#attendance-code").fill(entry);
  await page.getByRole("button", { name: COPY.resolve }).click();
  // Wait for the resolve to land: the guest panel renders an inline picker
  // (aria-pressed rows) while the self panel shows the chooser screen.
  const guestChooser = page.locator("button[aria-pressed]");
  const candidateRows = page.locator("section[class*='chooser'] ul button");
  await guestChooser.or(candidateRows).first().waitFor({ timeout: 10_000 });
  if ((await guestChooser.count()) > 0) {
    await expect(guestChooser).toHaveCount(2);
    await guestChooser.nth(index).click();
    await expect(guestChooser.nth(index)).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  } else {
    await expect(candidateRows).toHaveCount(2);
    await candidateRows.nth(index).click();
  }
}

/** Resolve a program token via the deep-link seam on the self panel (its
 *  manual input only accepts 6-digit codes) and pick one chooser row. */
async function resolveTokenAndChoose(
  page: Page,
  token: string,
  index: number
): Promise<void> {
  await page.goto(`/scanner?program_token=${encodeURIComponent(token)}`);
  const candidateRows = page.locator("section[class*='chooser'] ul button");
  await expect(candidateRows).toHaveCount(2);
  await candidateRows.nth(index).click();
}

test.beforeAll(async ({ playwright }) => {
  const adminUsername = required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER);
  const adminCredential = required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED);
  const staffUsername = required("PROGRAMS_STAFF_USERNAME", STAFF_USER);
  const staffCredential = required("PROGRAMS_STAFF_CREDENTIAL", STAFF_CRED);
  const memberUsername = required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER);
  const memberCredential = required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED);
  if (
    ![adminUsername, staffUsername, memberUsername].every((user) =>
      user.startsWith("E2E_")
    )
  ) {
    throw new Error(
      "PROGRAMS_*_USERNAME must start with E2E_; remote runs require disposable acceptance accounts"
    );
  }
  // Fixture build via API (no browser): fresh department + Recurring program
  // + WEEKLY rule + generated events + two overlapping open manual events +
  // one cancelled event; member enrollment request approved by admin.
  const admin = await loginApi(playwright, adminUsername, adminCredential);
  let member: Awaited<ReturnType<typeof loginApi>> | null = null;
  let staff: Awaited<ReturnType<typeof loginApi>> | null = null;
  try {
    const deptCode = fresh("E2E_ATT");
    const dept = await postJson(admin.api, "/api/v1/programs/departments", {
      code: deptCode,
      name: `E2E 出席部門 ${deptCode}`,
      lifecycle: "Active",
    });
    expect(dept.status).toBe(201);
    const departmentId = (
      dept.body.data as { department: { department_id: string } }
    ).department.department_id;

    for (const moduleKey of ["program_catalog", "events", "enrollment"]) {
      const module = await postJson(
        admin.api,
        `/api/v1/programs/departments/${departmentId}/modules/${moduleKey}/enable`
      );
      expect(module.status).toBe(200);
    }

    const program = await postJson(
      admin.api,
      `/api/v1/programs/departments/${departmentId}/programs`,
      {
        name: `E2E 出席課程 ${fresh("P")}`,
        category: "測試",
        behavior_type: "Recurring",
        lifecycle: "Active",
        discoverability: "Listed",
        enrollment_mode: "MemberRequest",
      }
    );
    expect(program.status).toBe(201);
    const programId = (program.body.data as { program: { program_id: string } })
      .program.program_id;
    const checkInToken = required(
      "program check-in token",
      (program.body.data as { program: { check_in_token: string | null } })
        .program.check_in_token
    );
    expect(checkInToken).toMatch(/^[0-9a-f]{32}$/u);

    const rule = await postJson(
      admin.api,
      `/api/v1/programs/${programId}/schedule-rules`,
      {
        recurrence: "WEEKLY",
        // A weekday that is never "today" (HK): a generated event whose
        // check-in window is live right now would join the chooser and break
        // the deterministic two-event resolution the suite asserts.
        day_of_week: (new Date(Date.now() + 8 * 3_600_000).getUTCDay() + 2) % 7,
        start_time: "10:00",
        end_time: "11:00",
      }
    );
    expect(rule.status).toBe(201);

    const preview = await postJson(
      admin.api,
      `/api/v1/programs/${programId}/events/preview`,
      { horizon_days: 14 }
    );
    expect(preview.status).toBe(200);
    const planId = (preview.body.data as { plan: { plan_id: string } }).plan
      .plan_id;
    const generated = await postJson(
      admin.api,
      `/api/v1/programs/${programId}/events/generate`,
      { plan_id: planId }
    );
    expect(generated.status).toBe(200);

    // Three manual events with check-in windows spanning "now": A and B stay
    // open for the whole suite run (windows close hours after creation).
    const createEvent = async (
      startsMinutes: number,
      endsMinutes: number
    ): Promise<AttendanceEventFixture> => {
      const created = await postJson(
        admin.api,
        `/api/v1/programs/${programId}/events`,
        {
          starts_at: minutesFromNow(startsMinutes),
          ends_at: minutesFromNow(endsMinutes),
          name: `E2E 聚會 ${startsMinutes}`,
          location: "主堂",
        }
      );
      expect(created.status).toBe(201);
      const { event } = created.body.data as { event: AttendanceEventFixture };
      expect(event.manual_check_in_code).toMatch(/^[0-9A-F]{8}$/u);
      return event;
    };
    const eventA = await createEvent(-60, 60);
    const eventB = await createEvent(-120, 60);

    const futureEvent = await createEvent(180, 240);

    const unenrolledProg = await postJson(
      admin.api,
      `/api/v1/programs/departments/${departmentId}/programs`,
      {
        name: `E2E 未報名課程 ${fresh("P")}`,
        category: "測試",
        behavior_type: "Recurring",
        lifecycle: "Active",
        discoverability: "Listed",
        enrollment_mode: "MemberRequest",
      }
    );
    expect(unenrolledProg.status).toBe(201);
    const unenrolledProgramId = (
      unenrolledProg.body.data as { program: { program_id: string } }
    ).program.program_id;
    const unenrolledCreated = await postJson(
      admin.api,
      `/api/v1/programs/${unenrolledProgramId}/events`,
      {
        starts_at: minutesFromNow(-60),
        ends_at: minutesFromNow(60),
        name: "E2E 未報名聚會",
        location: "副堂",
      }
    );
    expect(unenrolledCreated.status).toBe(201);
    const unenrolledEvent = (
      unenrolledCreated.body.data as { event: AttendanceEventFixture }
    ).event;
    expect(unenrolledEvent.manual_check_in_code).toMatch(/^[0-9A-F]{8}$/u);
    // Cancel the unenrolled program's only event: a cancelled code resolves
    // to `latest` with no open events, and the unenrolled member hits the
    // not-enrolled outcome (D6) instead of a live confirmation screen.
    const unenrolledCancelled = await patchJson(
      admin.api,
      `/api/v1/programs/${unenrolledProgramId}/events/${unenrolledEvent.event_id}`,
      { reason: "E2E 測試取消" }
    );
    expect(unenrolledCancelled.status).toBe(200);

    const cancelledEvent = await createEvent(-90, 90);
    // Seed one pre-cancellation check-in so the cancelled event's roster
    // stays readable for operators after the cancellation (J: the roster
    // heading must still render).
    const preCancel = await guestCheckIn(
      admin.api,
      cancelledEvent.event_id,
      cancelledEvent.manual_check_in_code,
      `E2E訪客 ${fresh("JC")}`,
      freshPhone()
    );
    expect(preCancel.status).toBe(201);
    const cancelled = await patchJson(
      admin.api,
      `/api/v1/programs/${programId}/events/${cancelledEvent.event_id}`,
      { reason: "E2E 測試取消" }
    );
    expect(cancelled.status).toBe(200);

    // Enroll the member (member self check-in requires an Active enrollment).
    const memberLogin = await loginApi(
      playwright,
      memberUsername,
      memberCredential
    );
    member = memberLogin;
    const requestResult = await postJson(
      memberLogin.api,
      `/api/v1/programs/${programId}/enrollment-requests`,
      {}
    );
    expect(requestResult.status).toBe(201);
    const requestId = (
      requestResult.body.data as { request: { request_id: string } }
    ).request.request_id;
    const decision = await postJson(
      admin.api,
      `/api/v1/programs/${programId}/enrollment-requests/${requestId}/decision`,
      { action: "Approved" }
    );
    expect(decision.status).toBe(200);

    const staffLogin = await loginApi(
      playwright,
      staffUsername,
      staffCredential
    );
    staff = staffLogin;
    fixtures = {
      programId,
      checkInToken,
      eventA,
      eventB,
      cancelledEvent,
      futureEvent,
      unenrolledProgramId,
      unenrolledEvent,
      adminState: admin.storageState,
      memberState: memberLogin.storageState,
      staffState: staffLogin.storageState,
    };
  } finally {
    await admin.api.dispose();
    await member?.api.dispose();
    await staff?.api.dispose();
  }
});

test.describe("ATT-04 QR attendance proof", () => {
  test("A guest check-in happy path: entry → chooser → name/phone → success", async ({
    page,
  }) => {
    await page.goto("/guest-check-in");
    await expect(page.getByLabel(COPY.inputLabel)).toBeVisible();
    // Program token resolves to the two overlapping open events (manual
    // codes never match the token, so this is unambiguously the QR path).
    await resolveAndChoose(page, fixtures.checkInToken, 0);
    await expect(page.locator("#guest-name")).toBeVisible();
    await expect(page.locator("#guest-phone")).toBeVisible();
    await expect(page.locator("#guest-phone")).toHaveAttribute(
      "inputMode",
      "tel"
    );

    const name = `E2E訪客 ${fresh("A")}`;
    const phone = freshPhone();
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/v1/attendance/guest"
    );
    await page.locator("#guest-name").fill(name);
    await page.locator("#guest-phone").fill(phone);
    await page.getByRole("button", { name: COPY.guestSubmit }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    const body = (await response.json()) as {
      data: { outcome: string; attendance_id: string };
    };
    expect(body.data.outcome).toBe("success");
    expect(body.data.attendance_id).toBeTruthy();
    await expect(statusText(page, COPY.success)).toBeVisible();
  });

  test("B guest same phone 200 {outcome duplicate} + neutral notice", async ({
    page,
    playwright,
  }) => {
    const api = await playwright.request.newContext({ baseURL: TARGET_URL });
    try {
      const name = `E2E訪客 ${fresh("B")}`;
      const phone = freshPhone();
      const first = await guestCheckIn(
        api,
        fixtures.eventA.event_id,
        fixtures.eventA.manual_check_in_code,
        name,
        phone
      );
      expect(first.status).toBe(201);
      expect((first.body.data as { outcome: string }).outcome).toBe("success");

      const second = await guestCheckIn(
        api,
        fixtures.eventA.event_id,
        fixtures.eventA.manual_check_in_code,
        name,
        phone
      );
      // Guests share the member duplicate shape (200 + outcome) instead
      // of the old 409 problem; the client renders an invariant
      // already-done notice rather than an error.
      expect(second.status).toBe(200);
      const duplicateData = second.body.data as { outcome: string };
      expect(duplicateData.outcome).toBe("duplicate");
      // Duplicate responses deliberately echo NO attendance id (Spec #244
      // dec 14): the existing record's id would be an identity oracle for
      // public guests. (worker contract: attendance-worker.test.ts)
      expect(Object.keys(duplicateData).sort()).toEqual(["outcome"]);

      // UI: same event manual code + same phone surfaces the neutral notice.
      await guestPanelCheckIn(
        page,
        fixtures.eventA.manual_check_in_code,
        name,
        phone
      );
      await expect(statusText(page, COPY.guestDuplicate)).toBeVisible();
      // …with the neutral tone of the panel output.
      await expect(page.locator("main output[data-tone='info']")).toContainText(
        COPY.guestDuplicate
      );
    } finally {
      await api.dispose();
    }
  });

  test("C guest void (with reason) then re-check-in succeeds (201)", async ({
    browser,
    playwright,
  }) => {
    const api = await playwright.request.newContext({ baseURL: TARGET_URL });
    try {
      const name = `E2E訪客 ${fresh("C")}`;
      const phone = freshPhone();
      const first = await guestCheckIn(
        api,
        fixtures.eventA.event_id,
        fixtures.eventA.manual_check_in_code,
        name,
        phone
      );
      expect(first.status).toBe(201);
      const attendanceId = (first.body.data as { attendance_id: string })
        .attendance_id;

      // Operator voids the guest row (with a reason) on /events.
      const adminContext = await browser.newContext({
        storageState: fixtures.adminState,
      });
      const adminPage = await adminContext.newPage();
      try {
        await adminPage.goto(
          `/events?eventId=${encodeURIComponent(fixtures.eventA.event_id)}`
        );
        const row = adminPage.locator("article").filter({
          has: adminPage.getByText(name, { exact: true }),
        });
        await expect(row).toBeVisible();
        await expect(row.getByText(COPY.voidReason)).toBeVisible();
        await row
          .locator(`#void-${attendanceId}`)
          .fill("E2E 重複簽到，作廢重簽");
        await row.getByRole("button", { name: COPY.void }).click();
        await expect(row.getByText(COPY.statusVoided)).toBeVisible();
        await expect(row.getByRole("button", { name: COPY.void })).toHaveCount(
          0
        );
      } finally {
        await adminContext.close();
      }

      // Voided row frees the partial unique index: same phone checks in again.
      const again = await guestCheckIn(
        api,
        fixtures.eventA.event_id,
        fixtures.eventA.manual_check_in_code,
        name,
        phone
      );
      expect(again.status).toBe(201);
      expect((again.body.data as { outcome: string }).outcome).toBe("success");
    } finally {
      await api.dispose();
    }
  });

  test("D member self check-in on /scanner: confirmation → success result → re-scan duplicate result", async ({
    browser,
    playwright,
  }) => {
    const memberContext = await browser.newContext({
      storageState: fixtures.memberState,
    });
    const page = await memberContext.newPage();
    try {
      await resolveTokenAndChoose(page, fixtures.checkInToken, 1);

      // Confirmation screen: the resolved event's identity shows before
      // any commit.
      await expect(
        page.getByRole("heading", { name: COPY.confirmTitle })
      ).toBeVisible();
      await expect(
        page.getByText(COPY.confirmHeader, { exact: true }).first()
      ).toBeVisible();
      await expect(
        page.getByText(COPY.recognizedBadge, { exact: true })
      ).toBeVisible();
      await expect(page.getByText(COPY.confirmLead)).toBeVisible();
      // Event identity card: program name + event title + location.
      await expect(page.getByText(/E2E 出席課程/u).first()).toBeVisible();
      await expect(page.getByText(/E2E 聚會 -/u).first()).toBeVisible();
      await expect(page.getByText(/主堂/u).first()).toBeVisible();

      // 確認簽到 commits → success result with identity + both actions.
      await page.getByRole("button", { name: COPY.confirmSubmit }).click();
      await expect(
        page.getByRole("heading", { name: COPY.successTitle })
      ).toBeVisible();
      await expect(
        page.getByText(COPY.resultTitle, { exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: COPY.backHome })
      ).toHaveAttribute("href", "/");
      const scanAgain = page.getByRole("button", { name: COPY.scanAgain });
      await expect(scanAgain).toBeVisible();

      // 再次簽到 → fresh scan; re-resolving the same event → confirmation →
      // quiet neutral duplicate result, never an error.
      await scanAgain.click();
      await expect(
        page.getByRole("heading", { name: COPY.scanTitle })
      ).toBeVisible();
      await resolveTokenAndChoose(page, fixtures.checkInToken, 1);
      await expect(
        page.getByRole("heading", { name: COPY.confirmTitle })
      ).toBeVisible();
      await page.getByRole("button", { name: COPY.confirmSubmit }).click();
      await expect(
        page.getByRole("heading", { name: COPY.duplicateTitle })
      ).toBeVisible();
      await expect(
        page.getByText(COPY.duplicateBody, { exact: true })
      ).toBeVisible();
      await expect(page.locator("main output[data-tone='error']")).toHaveCount(
        0
      );
      await expect(page.locator("main [role='alert']")).toHaveCount(0);
    } finally {
      await memberContext.close();
    }

    // Server contract on a second event of the same program: 201 then 200
    // duplicate outcome for the same member.
    const api = await playwright.request.newContext({
      baseURL: TARGET_URL,
      extraHTTPHeaders: {
        Cookie: cookieHeaderFromStorageState(fixtures.memberState),
      },
    });
    try {
      const selfCheckIn = (manualCode: string) =>
        api.post("/api/v1/attendance/self", {
          data: {
            event_id: fixtures.eventB.event_id,
            method: "self_manual_code",
            manual_code: manualCode,
          },
        });
      const first = await selfCheckIn(fixtures.eventB.manual_check_in_code);
      expect(first.status()).toBe(201);
      const again = await selfCheckIn(fixtures.eventB.manual_check_in_code);
      expect(again.status()).toBe(200);
      const body = (await again.json()) as { data: { outcome: string } };
      expect(body.data.outcome).toBe("duplicate");
    } finally {
      await api.dispose();
    }
  });

  test("D2 member Scanner is Self-only and multi-event choices include location", async ({
    browser,
  }) => {
    const memberContext = await browser.newContext({
      storageState: fixtures.memberState,
    });
    const page = await memberContext.newPage();
    try {
      await page.goto("/scanner");
      await expect(
        page.getByRole("heading", { name: COPY.scanTitle })
      ).toBeVisible();
      await expect(
        page.getByText(COPY.assistedOpen, { exact: true })
      ).toHaveCount(0);
      await expect(
        page.getByText(COPY.assistedMode, { exact: true })
      ).toHaveCount(0);
      await resolveTokenAndChoose(page, fixtures.checkInToken, 0);
      await expect(
        page.getByRole("heading", { name: COPY.confirmTitle })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: COPY.confirmSubmit })
      ).toBeVisible();
      await expect(page.getByText(/主堂/u).first()).toBeVisible();
    } finally {
      await memberContext.close();
    }
  });

  test("D4 member Scanner resolve via manual 6-digit code validation and inline errors", async ({
    browser,
  }) => {
    const memberContext = await browser.newContext({
      storageState: fixtures.memberState,
    });
    const page = await memberContext.newPage();
    try {
      await page.goto("/scanner");
      await expect(
        page.getByRole("heading", { name: COPY.scanTitle })
      ).toBeVisible();
      await expect(page.getByText(COPY.scanLead)).toBeVisible();
      await expect(
        page.getByRole("button", { name: COPY.startScan })
      ).toBeVisible();
      await expect(page.getByText(COPY.manualEntryTitle)).toBeVisible();
      await expect(page.getByText(COPY.manualOnlyTitle)).toBeVisible();

      // Open manual code entry
      await page
        .getByRole("button", { name: new RegExp(COPY.manualEntryTitle) })
        .click();
      const codeInput = page.locator("#attendance-code");
      await expect(codeInput).toBeVisible();
      await expect(codeInput).toBeFocused();

      // Fewer than 6 digits: client validation rejects without sending request
      await codeInput.fill("12345");
      await page.getByRole("button", { name: COPY.resolve }).click();
      await expect(statusText(page, COPY.invalidManualCode)).toBeVisible();
      await expect(codeInput).toBeFocused();

      // Unknown 6-digit code: server returns latest: null -> inline error with retry
      await codeInput.fill("999999");
      await page.getByRole("button", { name: COPY.resolve }).click();
      await expect(statusText(page, COPY.invalidEntry)).toBeVisible();
      await expect(
        page.locator("main output[data-tone='error']")
      ).toContainText(COPY.invalidEntry);
    } finally {
      await memberContext.close();
    }
  });

  test("D5 member Scanner chooser screen: candidate listing and 重新掃描 return", async ({
    browser,
  }) => {
    const memberContext = await browser.newContext({
      storageState: fixtures.memberState,
    });
    const page = await memberContext.newPage();
    try {
      // The self panel's manual input only accepts 6-digit codes, so the
      // multi-event chooser is reached through the program-token deep link.
      await page.goto(`/scanner?program_token=${fixtures.checkInToken}`);

      // Chooser view elements
      await expect(
        page.getByRole("heading", { name: COPY.chooseMeeting })
      ).toBeVisible();
      await expect(page.getByText(COPY.recognizedMultiple)).toBeVisible();
      await expect(page.getByText(COPY.chooseMeetingHint)).toBeVisible();

      // 重新掃描 button returns to main scan view
      await page.getByRole("button", { name: COPY.rescan }).click();
      await expect(
        page.getByRole("heading", { name: COPY.scanTitle })
      ).toBeVisible();

      // Re-resolve via the deep link and select a candidate
      await page.goto(`/scanner?program_token=${fixtures.checkInToken}`);

      const candidateRows = page.locator("section[class*='chooser'] ul button");
      await expect(candidateRows).toHaveCount(2);
      await candidateRows.nth(0).click();

      await expect(
        page.getByRole("heading", { name: COPY.confirmTitle })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: COPY.confirmSubmit })
      ).toBeVisible();
    } finally {
      await memberContext.close();
    }
  });

  test("D6 member Scanner outcome screens: window-not-open, cancelled, and not-enrolled", async ({
    browser,
  }) => {
    const memberContext = await browser.newContext({
      storageState: fixtures.memberState,
    });
    const page = await memberContext.newPage();
    try {
      // 1. Cancelled event outcome
      await page.goto(
        `/scanner?manual_code=${fixtures.cancelledEvent.manual_check_in_code}`
      );
      await expect(
        page.getByRole("heading", { name: COPY.outcomeCancelledTitle })
      ).toBeVisible();
      await expect(page.getByText(COPY.outcomeCancelledBody)).toBeVisible();
      await page.getByRole("button", { name: COPY.backToScan }).click();
      await expect(
        page.getByRole("heading", { name: COPY.scanTitle })
      ).toBeVisible();

      // 2. Not enrolled outcome with program detail CTA
      await page.goto(
        `/scanner?manual_code=${fixtures.unenrolledEvent.manual_check_in_code}`
      );
      await expect(
        page.getByRole("heading", { name: COPY.outcomeNotEnrolledTitle })
      ).toBeVisible();
      await expect(page.getByText(COPY.outcomeNotEnrolledBody)).toBeVisible();
      const detailLink = page.getByRole("link", {
        name: COPY.viewProgramDetail,
      });
      await expect(detailLink).toHaveAttribute(
        "href",
        `/programs?program=${fixtures.unenrolledProgramId}`
      );
      await page.getByRole("button", { name: COPY.backToScan }).click();
      await expect(
        page.getByRole("heading", { name: COPY.scanTitle })
      ).toBeVisible();

      // 3. Window not open outcome
      await page.goto(
        `/scanner?manual_code=${fixtures.futureEvent.manual_check_in_code}`
      );
      await expect(
        page.getByRole("heading", { name: COPY.outcomeWindowTitle })
      ).toBeVisible();
      await page.getByRole("button", { name: COPY.backToScan }).click();
      await expect(
        page.getByRole("heading", { name: COPY.scanTitle })
      ).toBeVisible();
    } finally {
      await memberContext.close();
    }
  });

  test("D7 member 不是這個聚會 escape returns to re-resolution and writes nothing", async ({
    browser,
    playwright,
  }) => {
    // Roster row count for the escaped event is the same before and after
    // the escape — proof the confirmation was never committed. The roster
    // endpoint is operator-only, so the reads use the admin session.
    const rosterUrl = `/api/v1/attendance/events/${fixtures.eventA.event_id}/roster`;
    const api = await playwright.request.newContext({
      baseURL: TARGET_URL,
      extraHTTPHeaders: {
        Cookie: cookieHeaderFromStorageState(fixtures.adminState),
      },
    });
    let beforeCount = 0;
    try {
      const before = await api.get(rosterUrl);
      expect(before.status()).toBe(200);
      beforeCount = (
        (await before.json()) as { data: { attendances: unknown[] } }
      ).data.attendances.length;

      const memberContext = await browser.newContext({
        storageState: fixtures.memberState,
      });
      const page = await memberContext.newPage();
      try {
        // Manual code deep link resolves to exactly one event → the
        // confirmation screen (the self panel's typed input only accepts
        // 6-digit codes, so the URL seam carries the 8-hex manual code).
        await page.goto(
          `/scanner?manual_code=${fixtures.eventA.manual_check_in_code}`
        );
        await expect(
          page.getByRole("heading", { name: COPY.confirmTitle })
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: COPY.confirmSubmit })
        ).toBeVisible();

        // 不是這個聚會 → single-event resolve returns to the scanner main
        // screen for re-resolution.
        await page.getByRole("button", { name: COPY.notThisEvent }).click();
        await expect(
          page.getByRole("heading", { name: COPY.scanTitle })
        ).toBeVisible();
        await expect(
          page.getByRole("button", {
            name: new RegExp(COPY.manualEntryTitle),
          })
        ).toBeVisible();
      } finally {
        await memberContext.close();
      }

      const after = await api.get(rosterUrl);
      expect(after.status()).toBe(200);
      const afterCount = (
        (await after.json()) as { data: { attendances: unknown[] } }
      ).data.attendances.length;
      expect(afterCount).toBe(beforeCount);
    } finally {
      await api.dispose();
    }
  });

  test("D8 member server submit failure shows inline error and retry re-attempts the same event", async ({
    browser,
  }) => {
    const memberContext = await browser.newContext({
      storageState: fixtures.memberState,
    });
    const page = await memberContext.newPage();
    try {
      await page.goto(
        `/scanner?manual_code=${fixtures.eventA.manual_check_in_code}`
      );
      await expect(
        page.getByRole("heading", { name: COPY.confirmTitle })
      ).toBeVisible();

      // Force one server-side submit failure (500) for the commit POST;
      // the retry passes through to the real Worker.
      let failedOnce = false;
      await page.route("**/api/v1/attendance/self", async (route) => {
        if (!failedOnce) {
          failedOnce = true;
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({
              status: 500,
              code: "INTERNAL_ERROR",
              title: "Upstream error",
              detail: "系統暫時無法處理請求，請稍後再試。",
            }),
          });
          return;
        }
        await route.continue();
      });
      await page.getByRole("button", { name: COPY.confirmSubmit }).click();
      await expect(page.locator("main [role='alert']")).toContainText(
        COPY.submitFailure
      );
      const retryButton = page.getByRole("button", { name: COPY.retry });
      await expect(retryButton).toBeVisible();

      // Retry re-attempts the same confirmation: the real server answers
      // "already checked in" (D ran first) → quiet duplicate result.
      await retryButton.click();
      await expect(
        page.getByRole("heading", { name: COPY.duplicateTitle })
      ).toBeVisible();
      await expect(
        page.getByText(COPY.duplicateBody, { exact: true })
      ).toBeVisible();
    } finally {
      await memberContext.close();
    }
  });

  test("D3 Admin switches to Assisted Scanner, pins context, searches, checks in, and does not enroll", async ({
    browser,
    playwright,
  }) => {
    const adminContext = await browser.newContext({
      storageState: fixtures.adminState,
    });
    const page = await adminContext.newPage();
    const api = await playwright.request.newContext({
      baseURL: TARGET_URL,
      extraHTTPHeaders: {
        Cookie: cookieHeaderFromStorageState(fixtures.adminState),
      },
    });
    try {
      const before = await api.get(
        `/api/v1/programs/${fixtures.programId}/enrollments`
      );
      expect(before.status()).toBe(200);
      const beforeBody = (await before.json()) as {
        data: { enrollments: unknown[] };
      };
      const enrollmentCount = beforeBody.data.enrollments.length;

      await page.goto(
        `/scanner?mode=assisted&event=${encodeURIComponent(
          fixtures.eventA.event_id
        )}`
      );
      await expect(
        page.getByRole("tab", { name: COPY.assistedMode })
      ).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("tab", { name: "本人簽到" })).toHaveAttribute(
        "aria-selected",
        "false"
      );
      await expect(page.locator("#event-id")).toHaveCount(0);
      await expect(page.locator("#assisted-event-context")).toHaveValue(
        fixtures.eventA.event_id
      );

      await page.locator("#assisted-member-search").fill("E2E Member");
      const searchResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname.endsWith("/members")
      );
      await page.getByRole("button", { name: COPY.search }).click();
      const search = await searchResponse;
      expect(search.status()).toBe(200);
      const result = page
        .locator("li")
        .filter({ has: page.getByText("E2E Member", { exact: true }) });
      await expect(
        result.getByRole("button", { name: COPY.checkInMember })
      ).toBeVisible();

      const checkInResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname.endsWith("/check-in")
      );
      await result.getByRole("button", { name: COPY.checkInMember }).click();
      const checkIn = await checkInResponse;
      expect([200, 201]).toContain(checkIn.status());
      await expect(
        page.locator("main output").filter({
          hasText: /簽到成功|已完成此聚會簽到/u,
        })
      ).toBeVisible();

      const after = await api.get(
        `/api/v1/programs/${fixtures.programId}/enrollments`
      );
      expect(after.status()).toBe(200);
      const afterBody = (await after.json()) as {
        data: { enrollments: unknown[] };
      };
      expect(afterBody.data.enrollments).toHaveLength(enrollmentCount);
    } finally {
      await api.dispose();
      await adminContext.close();
    }
  });

  test("D4 Assisted Event deep link revalidates stale or cancelled context", async ({
    browser,
  }) => {
    const adminContext = await browser.newContext({
      storageState: fixtures.adminState,
    });
    const page = await adminContext.newPage();
    try {
      await page.goto(
        `/scanner?mode=assisted&event=${encodeURIComponent(
          fixtures.cancelledEvent.event_id
        )}`
      );
      await expect(
        page.getByRole("tab", { name: COPY.assistedMode })
      ).toHaveAttribute("aria-selected", "true");
      await expect(page.locator("main").getByRole("alert")).toContainText(
        COPY.assistedContextStale
      );
      await expect(page.locator("#assisted-event-context")).toHaveValue("");
      await expect(page.locator("#assisted-member-search")).toHaveCount(0);
    } finally {
      await adminContext.close();
    }
  });

  test("E assisted check-in: member search (name + seeded QR) → 替成員簽到 → roster", async ({
    browser,
  }) => {
    const adminContext = await browser.newContext({
      storageState: fixtures.adminState,
    });
    const page = await adminContext.newPage();
    try {
      await page.goto("/events");
      // Operator chooser renders the manageable events.
      await expect(page.locator("#event-chooser")).toBeVisible();
      // The chooser is a convenience listing (server caps at the 50 most
      // recent events), so drive the precise event-id input + roster load
      // for this fixture event. The chooser-select → roster path is
      // covered deterministically by the operator-panel component tests.
      await page.locator("#event-id").fill(fixtures.eventB.event_id);
      const rosterLoad = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname.endsWith(
            `/${fixtures.eventB.event_id}/roster`
          )
      );
      await page.getByRole("button", { name: COPY.roster }).click();
      await rosterLoad;
      await expect(page.locator("#event-id")).toHaveValue(
        fixtures.eventB.event_id
      );

      // Search by enrolled member name.
      await page.locator("#member-search").fill("E2E Member");
      const nameSearch = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname.endsWith("/members")
      );
      await page.getByRole("button", { name: COPY.search }).click();
      await nameSearch;
      const memberResult = page
        .locator("li")
        .filter({ has: page.getByText("E2E Member", { exact: true }) });
      await expect(
        memberResult.getByRole("button", { name: COPY.checkInMember })
      ).toBeVisible();
      // The panel overwrites its status with the roster count right after a
      // successful assist (checkIn -> loadRoster), so assert the request
      // outcome instead of the transient success flash.
      const assisted = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname.endsWith("/check-in")
      );
      await memberResult
        .getByRole("button", { name: COPY.checkInMember })
        .click();
      const assistedResponse = await assisted;
      expect(assistedResponse.status()).toBeGreaterThanOrEqual(200);
      expect(assistedResponse.status()).toBeLessThan(300);

      // Search by the seeded member QR string (qr_code_string exact match).
      await page.locator("#member-search").fill(MEMBER_QR_STRING);
      const qrSearch = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname.endsWith("/members")
      );
      await page.getByRole("button", { name: COPY.search }).click();
      await qrSearch;
      await expect(
        page
          .locator("li")
          .filter({ has: page.getByText("E2E Member", { exact: true }) })
          .getByRole("button", { name: COPY.checkInMember })
      ).toBeVisible();

      // Roster now shows the member row (member_user_id for member rows).
      const memberRow = page.locator("article").filter({
        has: page.getByText(MEMBER_USER_ID, { exact: true }),
      });
      await expect(memberRow).toBeVisible();
      await expect(memberRow.getByText(COPY.statusActive)).toBeVisible();
      // The assisted check-in success notice stays visible: the roster
      // reload after checkIn is silent (ATT regression: it used to
      // overwrite the success flash with the roster count).
      await expect(statusText(page, COPY.success)).toBeVisible();
    } finally {
      await adminContext.close();
    }
  });

  test("F cancelled event: resolve reports latest.status Cancelled; commit rejects 410 EVENT_CANCELLED", async ({
    page,
    playwright,
  }) => {
    // The resolve contract (085-05 #308) reports cancelled state as
    // latest.status instead of a 410 at resolve; the 410 is enforced at the
    // commit boundary. The guest panel has no outcome screens, so the
    // cancelled code leaves the scan surface usable with nothing written
    // (the member-side outcome screen is covered by D6).
    await page.goto("/guest-check-in");
    await page
      .locator("#attendance-code")
      .fill(fixtures.cancelledEvent.manual_check_in_code);
    await page.getByRole("button", { name: COPY.resolve }).click();
    // No false resolution and no error: the input keeps the code and the
    // panel never shows a confirmation seam.
    await expect(page.locator("#attendance-code")).toHaveValue(
      fixtures.cancelledEvent.manual_check_in_code
    );
    await expect(
      page.getByRole("button", { name: COPY.confirmSubmit })
    ).toHaveCount(0);

    const api = await playwright.request.newContext({ baseURL: TARGET_URL });
    try {
      const resolved = await api.get(
        `/api/v1/attendance/resolve?manual_code=${fixtures.cancelledEvent.manual_check_in_code}`
      );
      expect(resolved.status()).toBe(200);
      const body = (await resolved.json()) as {
        data: { events: unknown[]; latest: { status: string } };
      };
      expect(body.data.events).toEqual([]);
      expect(body.data.latest.status).toBe("Cancelled");

      // Committing into the cancelled event is still rejected at the gate.
      const commit = await guestCheckIn(
        api,
        fixtures.cancelledEvent.event_id,
        fixtures.cancelledEvent.manual_check_in_code,
        `E2E訪客 ${fresh("F")}`,
        freshPhone()
      );
      expect(commit.status).toBe(410);
      expect((commit.body as { code: string }).code).toBe("EVENT_CANCELLED");
    } finally {
      await api.dispose();
    }
  });

  test("G unknown entry: UI inline error, check-in POST 403 INVALID_CHECK_IN_ENTRY", async ({
    page,
    playwright,
  }) => {
    // Resolve contract (085-05 #308): an unknown entry resolves to
    // latest:null → the panel shows the inline invalid-entry error.
    await page.goto("/guest-check-in");
    await page.locator("#attendance-code").fill("E2E-NOT-A-REAL-CODE");
    await page.getByRole("button", { name: COPY.resolve }).click();
    await expect(statusText(page, COPY.invalidEntry)).toBeVisible();
    await expect(page.locator("main output[data-tone='error']")).toContainText(
      COPY.invalidEntry
    );

    const api = await playwright.request.newContext({ baseURL: TARGET_URL });
    try {
      const wrong = await guestCheckIn(
        api,
        fixtures.eventA.event_id,
        "E2ENOPE1",
        "E2E訪客 G",
        freshPhone()
      );
      expect(wrong.status).toBe(403);
      expect((wrong.body as { code: string }).code).toBe(
        "INVALID_CHECK_IN_ENTRY"
      );
    } finally {
      await api.dispose();
    }
  });

  test("H member without enrollment: 403 ENROLLMENT_REQUIRED in UI and API", async ({
    browser,
    playwright,
  }) => {
    // Staff is authenticated but has no enrollment in the fixture program.
    const staffContext = await browser.newContext({
      storageState: fixtures.staffState,
    });
    const page = await staffContext.newPage();
    try {
      await page.goto("/scanner");
      await resolveTokenAndChoose(page, fixtures.checkInToken, 0);
      await page.getByRole("button", { name: COPY.confirmSubmit }).click();
      await expect(statusText(page, COPY.enrollmentRequired)).toBeVisible();
    } finally {
      await staffContext.close();
    }

    const api = await playwright.request.newContext({
      baseURL: TARGET_URL,
      extraHTTPHeaders: {
        Cookie: cookieHeaderFromStorageState(fixtures.staffState),
      },
    });
    try {
      const self = await api.post("/api/v1/attendance/self", {
        data: {
          event_id: fixtures.eventA.event_id,
          method: "self_manual_code",
          manual_code: fixtures.eventA.manual_check_in_code,
        },
      });
      expect(self.status()).toBe(403);
      expect(((await self.json()) as { code: string }).code).toBe(
        "ENROLLMENT_REQUIRED"
      );
    } finally {
      await api.dispose();
    }
  });

  test("I check-in sheet export controls render for the operator panel", async ({
    browser,
  }) => {
    const adminContext = await browser.newContext({
      storageState: fixtures.adminState,
    });
    const page = await adminContext.newPage();
    try {
      await page.goto(
        `/events?eventId=${encodeURIComponent(fixtures.eventA.event_id)}`
      );
      await expect(
        page.getByRole("button", { name: COPY.printSheet })
      ).toBeVisible();
    } finally {
      await adminContext.close();
    }
  });

  test("I2 roster correction and void flows require reasons and update live counts", async ({
    browser,
    playwright,
  }) => {
    const admin = await loginApi(
      playwright,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const guestName = `E2E_ROSTER_舊_${Date.now()}`;
    const correctedName = `E2E_ROSTER_新_${Date.now()}`;
    const guestPhone = freshPhone();
    const checkIn = await guestCheckIn(
      admin.api,
      fixtures.eventA.event_id,
      fixtures.eventA.manual_check_in_code,
      guestName,
      guestPhone
    );
    expect(checkIn.status).toBe(201);

    const adminContext = await browser.newContext({
      storageState: fixtures.adminState,
    });
    const page = await adminContext.newPage();
    try {
      await page.goto(
        `/events?eventId=${encodeURIComponent(fixtures.eventA.event_id)}`
      );
      await expect(
        page.getByText(guestName, { exact: true }).first()
      ).toBeVisible();
      await page
        .getByRole("button", { name: COPY.correctGuest })
        .last()
        .click();
      await page.getByLabel(COPY.guestName).last().fill(correctedName);
      await page.getByLabel(COPY.guestPhone).last().fill(guestPhone);
      await page
        .getByLabel(COPY.correctionReason)
        .last()
        .fill("客人提供新電話");
      await page
        .getByRole("button", { name: COPY.saveCorrection })
        .last()
        .click();
      await expect(
        page.getByText(COPY.correctionSaved, { exact: true }).first()
      ).toBeVisible();
      await expect(
        page.getByText(correctedName, { exact: true }).first()
      ).toBeVisible();

      await page
        .getByRole("button", { name: COPY.voidAttendance })
        .last()
        .click();
      await page.getByLabel(COPY.voidReason).last().fill("E2E 測試作廢");
      await page.getByRole("button", { name: COPY.voidConfirm }).last().click();
      await expect(
        page.getByText(COPY.voidSuccess, { exact: true }).first()
      ).toBeVisible();
      await expect(
        page.getByText(COPY.checkedInCount(0, 1), { exact: true })
      ).toBeVisible();
    } finally {
      await adminContext.close();
      await admin.api.dispose();
    }
  });
  test("J cancelled event on the operator panel: notice, readable roster, and no check-in controls", async ({
    browser,
  }) => {
    const adminContext = await browser.newContext({
      storageState: fixtures.adminState,
    });
    const page = await adminContext.newPage();
    try {
      await page.goto(
        `/events?eventId=${encodeURIComponent(fixtures.cancelledEvent.event_id)}`
      );
      // The deep link loads the cancelled event directly: the roster is
      // still readable (one pre-cancellation check-in was seeded in
      // beforeAll), the cancellation notice shows, and none of the
      // check-in tools apply. The chooser （已取消） suffix is covered by
      // the operator-panel component tests (the chooser itself only lists
      // the 50 most recent events on the shared worker).
      // The roster is still readable, so operators can see who had checked
      // in before the cancellation.
      await expect(
        page.getByRole("heading", { name: /E2E 聚會/u })
      ).toBeVisible();
      await expect(
        page.getByText(COPY.eventCancelled, { exact: true })
      ).toBeVisible();
      // None of the check-in tools apply to a cancelled event.
      await expect(page.getByRole("button", { name: COPY.camera })).toHaveCount(
        0
      );
      await expect(page.locator("#member-search")).toHaveCount(0);
      // The historical roster remains printable even though live check-in
      // controls are unavailable for a cancelled meeting.
    } finally {
      await adminContext.close();
    }
  });

  test("K empty guest submit: native validation blocks the request", async ({
    page,
  }) => {
    await page.goto("/guest-check-in");
    await page
      .locator("#attendance-code")
      .fill(fixtures.eventA.manual_check_in_code);
    await page.getByRole("button", { name: COPY.resolve }).click();
    await expect(page.locator("#guest-name")).toBeVisible();

    let guestPostCount = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/v1/attendance/guest"
      ) {
        guestPostCount += 1;
      }
    });
    await page.getByRole("button", { name: COPY.guestSubmit }).click();
    await page.waitForTimeout(300);
    expect(guestPostCount).toBe(0);
    // The required inputs keep their browser state; name caps at 80.
    await expect(page.locator("#guest-phone")).toBeVisible();
    await expect(page.locator("#guest-name")).toHaveAttribute(
      "maxlength",
      "80"
    );
  });

  test("L invalid phone surfaces the server VALIDATION detail with the error tone", async ({
    page,
  }) => {
    await page.goto("/guest-check-in");
    await page
      .locator("#attendance-code")
      .fill(fixtures.eventA.manual_check_in_code);
    await page.getByRole("button", { name: COPY.resolve }).click();
    await expect(page.locator("#guest-name")).toBeVisible();
    await page.locator("#guest-name").fill(`E2E訪客 ${fresh("L")}`);
    await page.locator("#guest-phone").fill("not-a-phone");
    await page.getByRole("button", { name: COPY.guestSubmit }).click();
    await expect(page.locator("main output[data-tone='error']")).toContainText(
      COPY.invalidPhoneDetail
    );
  });

  test("M guest login handoff: guest entry → member login link → login → /scanner prefilled with event", async ({
    page,
  }) => {
    await page.goto("/guest-check-in");
    await page
      .locator("#attendance-code")
      .fill(fixtures.eventA.manual_check_in_code);
    await page.getByRole("link", { name: COPY.loginForMember }).click();
    await expect(page).toHaveURL("/");
    await page
      .locator('input[autocomplete="username"]')
      .fill(required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER));
    await page
      .locator('input[autocomplete="current-password"]')
      .fill(required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED));
    await page.getByRole("button", { name: "登入" }).click();
    await expect(page).toHaveURL(
      new RegExp(
        `/scanner\\?manual_code=${fixtures.eventA.manual_check_in_code}`,
        "u"
      )
    );
    await expect(
      page.getByRole("heading", { name: COPY.confirmTitle })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: COPY.confirmSubmit })
    ).toBeVisible();
  });

  test("N guest login handoff with unenrolled account: prefilled event revalidates and rejects with ENROLLMENT_REQUIRED", async ({
    page,
  }) => {
    await page.goto("/guest-check-in");
    await page
      .locator("#attendance-code")
      .fill(fixtures.eventA.manual_check_in_code);
    await page.getByRole("link", { name: COPY.loginForMember }).click();
    await expect(page).toHaveURL("/");
    await page
      .locator('input[autocomplete="username"]')
      .fill(required("PROGRAMS_STAFF_USERNAME", STAFF_USER));
    await page
      .locator('input[autocomplete="current-password"]')
      .fill(required("PROGRAMS_STAFF_CREDENTIAL", STAFF_CRED));
    await page.getByRole("button", { name: "登入" }).click();
    await expect(page).toHaveURL(
      new RegExp(
        `/scanner\\?manual_code=${fixtures.eventA.manual_check_in_code}`,
        "u"
      )
    );
    await page.getByRole("button", { name: COPY.confirmSubmit }).click();
    await expect(statusText(page, COPY.enrollmentRequired)).toBeVisible();
  });
});
