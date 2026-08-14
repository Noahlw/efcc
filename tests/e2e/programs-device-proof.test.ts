/* oxlint-disable vitest/prefer-importing-vitest-globals */
import { expect, test } from "@playwright/test";
import type { APIRequestContext, PlaywrightWorkerArgs } from "@playwright/test";

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

const COPY = {
  camera: "使用相機掃描 QR",
  eventAvailabilityDeactivate: "暫停聚會",
  eventAvailabilityConfirmBody:
    "暫停後，此聚會將停止開放簽到（{count} 項進行中的操作會受影響）。",
  eventAvailabilityConfirmProceed: "確定暫停",
  eventAvailabilityNotice: "聚會已暫停開放。",
  eventAvailabilityRestoredNotice: "聚會已恢復開放。",
  eventAvailabilityUndo: "復原",
  eventDetailTitle: "聚會詳情",
  eventEditTitle: "編輯聚會資料",
};

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
  const storageState = storageStateFromCookies(
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

function fresh(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function recordValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Expected ${label} to be an object`);
  }
  // The shape check above establishes the object boundary for API payloads.
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected ${label} to be a non-empty string`);
  }
  return value;
}

let memberStorageState: StorageState;
let adminStorageState: StorageState;
let proofProgramId: string;
let proofEventId: string;

test.beforeAll(async ({ playwright }) => {
  const adminLogin = await loginApi(
    playwright,
    DEV_ADMIN.username,
    DEV_ADMIN.credential
  );
  const memberLogin = await loginApi(
    playwright,
    DEV_MEMBER.username,
    DEV_MEMBER.credential
  );

  adminStorageState = adminLogin.storageState;
  memberStorageState = memberLogin.storageState;

  try {
    const departmentResponse = await postJson(
      adminLogin.api,
      "/api/v1/programs/departments",
      {
        code: fresh("DEPT_DEVICE_PROOF"),
        name: fresh("Device Proof Department"),
        lifecycle: "Active",
      }
    );
    expect(departmentResponse.status).toBe(201);
    const departmentData = recordValue(
      departmentResponse.body.data,
      "department response data"
    );
    const department = recordValue(
      departmentData.department,
      "department response"
    );
    const departmentId = stringValue(department.department_id, "department_id");

    for (const moduleKey of [
      "program_catalog",
      "events",
      "enrollment",
      "attendance",
    ] as const) {
      const moduleResponse = await adminLogin.api.post(
        `/api/v1/programs/departments/${departmentId}/modules/${moduleKey}/enable`
      );
      expect(moduleResponse.status()).toBe(200);
    }

    const programResponse = await postJson(
      adminLogin.api,
      `/api/v1/programs/departments/${departmentId}/programs`,
      {
        name: fresh("DEVICE_PROOF_PROGRAM"),
        category: "測試",
        behavior_type: "Recurring",
        lifecycle: "Active",
        discoverability: "Listed",
        enrollment_mode: "ManagerOnly",
      }
    );
    expect(programResponse.status).toBe(201);
    const programData = recordValue(
      programResponse.body.data,
      "program response data"
    );
    const program = recordValue(programData.program, "program response");
    proofProgramId = stringValue(program.program_id, "program_id");

    const now = Date.now();
    const eventResponse = await postJson(
      adminLogin.api,
      `/api/v1/programs/${proofProgramId}/events`,
      {
        name: fresh("DEVICE_PROOF_EVENT"),
        location: "測試場地",
        starts_at: new Date(now - 30 * 60_000).toISOString(),
        ends_at: new Date(now + 60 * 60_000).toISOString(),
      }
    );
    expect(eventResponse.status).toBe(201);
    const eventData = recordValue(
      eventResponse.body.data,
      "event response data"
    );
    const event = recordValue(eventData.event, "event response");
    proofEventId = stringValue(event.event_id, "event_id");
  } finally {
    await adminLogin.api.dispose();
    await memberLogin.api.dispose();
  }
});

test("granted camera permission binds a live playing stream to the Self Check-In video element", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: TARGET_URL,
    permissions: ["camera"],
    storageState: memberStorageState,
  });
  const page = await context.newPage();

  try {
    await page.goto("/scanner");
    const cameraButton = page.getByRole("button", { name: COPY.camera });
    await expect(cameraButton).toBeVisible();
    await cameraButton.click();

    const video = page.locator("video");
    await expect(video).toBeVisible();
    await expect
      .poll(
        async () => {
          const state = await video.evaluate((element: HTMLVideoElement) => ({
            readyState: element.readyState,
            videoWidth: element.videoWidth,
            videoHeight: element.videoHeight,
            paused: element.paused,
          }));
          return (
            state.readyState >= 2 &&
            state.videoWidth > 0 &&
            state.videoHeight > 0 &&
            !state.paused
          );
        },
        { timeout: 15_000 }
      )
      .toBe(true);

    const videoState = await video.evaluate((element: HTMLVideoElement) => ({
      readyState: element.readyState,
      videoWidth: element.videoWidth,
      videoHeight: element.videoHeight,
      paused: element.paused,
    }));
    expect(videoState.readyState).toBeGreaterThanOrEqual(2);
    expect(videoState.videoWidth).toBeGreaterThan(0);
    expect(videoState.videoHeight).toBeGreaterThan(0);
    expect(videoState.paused).toBe(false);
  } finally {
    await context.close();
  }
});

test("reduced motion is honored for the Event availability Undo control", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: TARGET_URL,
    storageState: adminStorageState,
  });
  const page = await context.newPage();

  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(
      `/programs?mode=management&program=${encodeURIComponent(
        proofProgramId
      )}&task=events&event=${encodeURIComponent(proofEventId)}`
    );

    const eventDetail = page.getByRole("region", {
      name: COPY.eventDetailTitle,
    });
    await expect(eventDetail).toBeVisible();
    const deactivate = page.getByRole("button", {
      name: COPY.eventAvailabilityDeactivate,
    });
    await expect(deactivate).toBeVisible();
    await deactivate.click();
    // This event has an open check-in window (per beforeAll's
    // starts_at/ends_at), so a single click triggers a 409
    // CONFIRMATION_REQUIRED and an inline confirm step (impactCount 1
    // for the open window itself), mirroring programs-d1.test.ts's
    // "a currently open check-in window ... requires confirmation".
    const confirmBody = COPY.eventAvailabilityConfirmBody.replace(
      "{count}",
      "1"
    );
    const confirmAlert = page
      .getByRole("alert")
      .filter({ hasText: confirmBody });
    await expect(confirmAlert).toBeVisible();
    await confirmAlert
      .getByRole("button", { name: COPY.eventAvailabilityConfirmProceed })
      .click();
    await expect(
      eventDetail.getByText(COPY.eventAvailabilityNotice, { exact: true })
    ).toBeVisible();

    const undo = page.getByRole("button", {
      name: COPY.eventAvailabilityUndo,
    });
    await expect(undo).toBeVisible();
    await undo.click();
    await expect(
      eventDetail
        .getByText(COPY.eventAvailabilityRestoredNotice, { exact: true })
        .first()
    ).toBeVisible();
    await expect(deactivate).toBeVisible();

    await page.getByRole("button", { name: COPY.eventEditTitle }).click();
    const actionButton = page
      .locator(".actionButton, button[class*='actionButton']")
      .first();
    await expect(actionButton).toBeVisible();
    const motionState = await page.evaluate(() => {
      const element = document.querySelector<HTMLElement>(
        ".actionButton, button[class*='actionButton']"
      );
      return {
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
          .matches,
        transitionDuration: element
          ? getComputedStyle(element).transitionDuration
          : null,
      };
    });
    expect(motionState.reducedMotion).toBe(true);
    expect(motionState.transitionDuration).toBe("0s");
  } finally {
    await context.close();
  }
});
