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
import type { APIRequestContext, Browser, Page } from "@playwright/test";

import { DEV_ADMIN, DEV_MEMBER, DEV_STAFF } from "./dev-fixtures";

// @playwright/test does not export named `Playwright`/`StorageState` types;
// the helpers below only need the request-context surface and the cookie
// shape accepted by browser.newContext({ storageState }).
interface RequestFactory {
  request: {
    newContext(options?: {
      baseURL?: string;
      storageState?: unknown;
      extraHTTPHeaders?: Record<string, string>;
    }): Promise<APIRequestContext>;
  };
}

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
    localStorage: Array<{ name: string; value: string }>;
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

// Copy strings mirrored from web/lib/copy.ts (asserted as observable DOM).
const COPY = {
  inputLabel: "課程 QR 代碼或聚會手動代碼",
  resolve: "查找聚會",
  chooseEvent: "選擇聚會",
  guestName: "姓名",
  guestPhone: "電話",
  guestSubmit: "送出訪客簽到",
  memberSubmit: "確認簽到",
  success: "簽到成功。",
  memberDuplicate: "你已完成此聚會簽到。",
  guestDuplicate: "此電話已簽到。如需協助，請聯絡聚會負責人。",
  eventCancelled: "此聚會已取消，不能簽到。",
  camera: "使用相機掃描 QR",
  invalidEntry: "請從有效的 QR 或聚會代碼進入簽到。",
  enrollmentRequired: "報名狀態不符合簽到條件。",
  notFound: "找不到請求的資料。",
  invalidPhoneDetail: "請輸入有效電話號碼。",
  memberSearch: "搜尋已報名成員",
  search: "搜尋",
  checkInMember: "替成員簽到",
  roster: "簽到名單",
  void: "取消簽到",
  voidReason: "取消原因",
  statusActive: "有效",
  statusVoided: "已作廢",
  printSheet: "列印聚會簽到表",
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
  checkInToken: string;
  eventA: AttendanceEventFixture;
  eventB: AttendanceEventFixture;
  cancelledEvent: AttendanceEventFixture;
  adminState: StorageState;
  memberState: StorageState;
  staffState: StorageState;
}

let fixtures: Fixtures;

function required(name: string, value: string | undefined): string {
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

async function guestCheckIn(
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
  await page.locator("#attendance-code").fill(entry);
  await page.getByRole("button", { name: COPY.resolve }).click();
  const chooser = page.locator("button[aria-pressed]");
  await expect(chooser).toHaveCount(2);
  await chooser.nth(index).click();
  await expect(chooser.nth(index)).toHaveAttribute("aria-pressed", "true");
}

test.beforeAll(async ({ playwright }) => {
  for (const [name, value] of [
    ["PROGRAMS_ADMIN_USERNAME", ADMIN_USER],
    ["PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED],
    ["PROGRAMS_STAFF_USERNAME", STAFF_USER],
    ["PROGRAMS_STAFF_CREDENTIAL", STAFF_CRED],
    ["PROGRAMS_MEMBER_USERNAME", MEMBER_USER],
    ["PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED],
  ]) {
    if (!value) {
      throw new Error(`${name} is required`);
    }
  }
  if (
    ![ADMIN_USER, STAFF_USER, MEMBER_USER].every((user) =>
      user?.startsWith("E2E_")
    )
  ) {
    throw new Error(
      "PROGRAMS_*_USERNAME must start with E2E_; remote runs require disposable acceptance accounts"
    );
  }

  // Fixture build via API (no browser): fresh department + Recurring program
  // + WEEKLY rule + generated events + two overlapping open manual events +
  // one cancelled event; member enrollment request approved by admin.
  const admin = await loginApi(playwright, ADMIN_USER!, ADMIN_CRED!);
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
    const checkInToken = (
      program.body.data as { program: { check_in_token: string | null } }
    ).program.check_in_token;
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
        }
      );
      expect(created.status).toBe(201);
      const {event} = (created.body.data as { event: AttendanceEventFixture });
      expect(event.manual_check_in_code).toMatch(/^[0-9A-F]{8}$/u);
      return event;
    };
    const eventA = await createEvent(-60, 60);
    const eventB = await createEvent(-120, 60);

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
    member = await loginApi(playwright, MEMBER_USER!, MEMBER_CRED!);
    const requestResult = await postJson(
      member!.api,
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

    staff = await loginApi(playwright, STAFF_USER!, STAFF_CRED!);
    fixtures = {
      checkInToken: checkInToken!,
      eventA,
      eventB,
      cancelledEvent,
      adminState: admin.storageState,
      memberState: member.storageState,
      staffState: staff.storageState,
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
    const member: Awaited<ReturnType<typeof loginApi>> | null = null;
    const staff: Awaited<ReturnType<typeof loginApi>> | null = null;
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
      const firstId = (first.body.data as { attendance_id: string })
        .attendance_id;

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
      const duplicateData = second.body.data as {
        outcome: string;
        attendance_id: string;
      };
      expect(duplicateData.outcome).toBe("duplicate");
      // The duplicate points at the ORIGINAL row, not a fresh insert.
      expect(duplicateData.attendance_id).toBe(firstId);

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

  test("D member self check-in on /scanner: success then quiet duplicate", async ({
    browser,
    playwright,
  }) => {
    const memberContext = await browser.newContext({
      storageState: fixtures.memberState,
    });
    const page = await memberContext.newPage();
    try {
      await page.goto("/scanner");
      await resolveAndChoose(page, fixtures.checkInToken, 1);
      await page.getByRole("button", { name: COPY.memberSubmit }).click();
      await expect(statusText(page, COPY.success)).toBeVisible();
      await page.getByRole("button", { name: COPY.memberSubmit }).click();
      await expect(statusText(page, COPY.memberDuplicate)).toBeVisible();
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

  test("F cancelled event: resolve surfaces 410 EVENT_CANCELLED in UI and API", async ({
    page,
    playwright,
  }) => {
    await page.goto("/guest-check-in");
    await page
      .locator("#attendance-code")
      .fill(fixtures.cancelledEvent.manual_check_in_code);
    await page.getByRole("button", { name: COPY.resolve }).click();
    await expect(statusText(page, COPY.eventCancelled)).toBeVisible();

    const api = await playwright.request.newContext({ baseURL: TARGET_URL });
    try {
      const resolved = await api.get(
        `/api/v1/attendance/resolve?manual_code=${fixtures.cancelledEvent.manual_check_in_code}`
      );
      expect(resolved.status()).toBe(410);
      expect(((await resolved.json()) as { code: string }).code).toBe(
        "EVENT_CANCELLED"
      );
    } finally {
      await api.dispose();
    }
  });

  test("G unknown entry: UI 404 surface, check-in POST 403 INVALID_CHECK_IN_ENTRY", async ({
    page,
    playwright,
  }) => {
    await page.goto("/guest-check-in");
    await page.locator("#attendance-code").fill("E2E-NOT-A-REAL-CODE");
    await page.getByRole("button", { name: COPY.resolve }).click();
    await expect(statusText(page, COPY.notFound)).toBeVisible();

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
      await resolveAndChoose(page, fixtures.checkInToken, 0);
      await page.getByRole("button", { name: COPY.memberSubmit }).click();
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
        page.getByRole("heading", { name: COPY.roster })
      ).toBeVisible();
      await expect(
        page.getByText(COPY.eventCancelled, { exact: true })
      ).toBeVisible();
      // None of the check-in tools apply to a cancelled event.
      await expect(page.getByRole("button", { name: COPY.camera })).toHaveCount(
        0
      );
      await expect(page.locator("#member-search")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: COPY.printSheet })
      ).toHaveCount(0);
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
});
