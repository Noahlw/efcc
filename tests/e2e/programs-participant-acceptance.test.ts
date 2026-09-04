import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const TARGET_URL = process.env.PROGRAMS_TARGET_URL ?? "http://127.0.0.1:8787";
const TARGET_ORIGIN = new URL(TARGET_URL).origin;
const ADMIN = {
  username: process.env.PROGRAMS_ADMIN_USERNAME ?? "E2E_admin",
  credential: process.env.PROGRAMS_ADMIN_CREDENTIAL ?? "E2E_admin!dev",
};
const MEMBER = {
  username: process.env.PROGRAMS_MEMBER_USERNAME ?? "E2E_member",
  credential: process.env.PROGRAMS_MEMBER_CREDENTIAL ?? "E2E_member!dev",
};

const COPY = {
  login: "登入",
  enrollment: "報名",
  requestEnroll: "報名",
  requestPendingHint: "申請已送出，等待課程負責人處理。",
  enrollmentActiveHint: "你目前已加入此課程。",
  cancelEnrollment: "退出課程",
  cancelConfirmTitle: "退出課程？",
  cancelConfirmAccept: "退出課程",
  enrollmentCancelledNotice: "已退出課程",
};

type LoginResult = {
  api: APIRequestContext;
  cookie: string;
};

type ParticipantFixture = {
  programId: string;
  programName: string;
};

let adminApi: APIRequestContext | null = null;
let fixture: ParticipantFixture | null = null;

async function loginWithPlaywright(
  playwright: {
    request: { newContext(options?: object): Promise<APIRequestContext> };
  },
  identity: { username: string; credential: string }
): Promise<LoginResult> {
  const loginContext = await playwright.request.newContext({
    baseURL: TARGET_URL,
  });
  const response = await loginContext.post("/api/v1/auth/login", {
    headers: { Origin: TARGET_ORIGIN },
    data: { username: identity.username, password: identity.credential },
  });
  expect(response.status()).toBe(200);
  const cookie = response
    .headersArray()
    .filter(({ name }) => name.toLowerCase() === "set-cookie")
    .map(({ value }) => value.split(";", 1)[0])
    .join("; ");
  expect(cookie).not.toBe("");
  await loginContext.dispose();
  const api = await playwright.request.newContext({
    baseURL: TARGET_URL,
    extraHTTPHeaders: { Cookie: cookie, Origin: TARGET_ORIGIN },
  });
  return { api, cookie };
}

async function loginAs(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator('input[autocomplete="username"]').fill(MEMBER.username);
  await page
    .locator('input[autocomplete="current-password"]')
    .fill(MEMBER.credential);
  await page.getByRole("button", { name: COPY.login }).click();
  await page.waitForURL((url) => url.pathname !== "/");
}

function jsonBody(
  response: Awaited<ReturnType<APIRequestContext["post"]>>
): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

test.beforeAll(async ({ playwright }) => {
  const admin = await loginWithPlaywright(playwright, ADMIN);
  adminApi = admin.api;
  const suffix = crypto.randomUUID().slice(0, 8);
  const departmentResponse = await adminApi.post(
    "/api/v1/programs/departments",
    {
      data: {
        code: `E2E_T05P_${suffix}`,
        name: `E2E_T05P Participant ${suffix}`,
        lifecycle: "Active",
      },
    }
  );
  expect(departmentResponse.status()).toBe(201);
  const departmentBody = (await jsonBody(departmentResponse)) as {
    data: { department: { department_id: string } };
  };
  const departmentId = departmentBody.data.department.department_id;
  for (const moduleKey of ["program_catalog", "events", "enrollment"]) {
    const moduleResponse = await adminApi.post(
      `/api/v1/programs/departments/${departmentId}/modules/${moduleKey}/enable`
    );
    expect(moduleResponse.status()).toBe(200);
  }
  const programName = `E2E_T05P Program ${suffix}`;
  const programResponse = await adminApi.post(
    `/api/v1/programs/departments/${departmentId}/programs`,
    {
      data: {
        name: programName,
        description: "Disposable participant Browser Acceptance fixture.",
        category: "T05",
        behavior_type: "Recurring",
        lifecycle: "Active",
        discoverability: "Listed",
        enrollment_mode: "MemberRequest",
      },
    }
  );
  expect(programResponse.status()).toBe(201);
  const programBody = (await jsonBody(programResponse)) as {
    data: { program: { program_id: string } };
  };
  fixture = {
    programId: programBody.data.program.program_id,
    programName,
  };
});

test.afterAll(async () => {
  await adminApi?.dispose();
});

test.describe("T05.4 participant Browser Acceptance", () => {
  test("member submits, gets approved, reads back, and exits a Program", async ({
    page,
  }) => {
    expect(fixture).not.toBeNull();
    const { programId, programName } = fixture!;
    await loginAs(page);
    await page.goto("/programs");
    const programLink = page.getByRole("link", { name: programName });
    await expect(programLink).toBeVisible();
    await programLink.click();
    await expect(page).toHaveURL(
      new RegExp(
        `/programs\\?program=${programId}(?:&from=programs)?(?:#overview)?$`,
        "u"
      )
    );
    await expect(page.locator("#program-detail-title")).toBeVisible();

    const enrollmentPanel = page.getByRole("region", {
      name: new RegExp(`^${COPY.enrollment}$`, "u"),
    });
    const requestButton = enrollmentPanel.getByRole("button", {
      name: COPY.requestEnroll,
    });
    await expect(requestButton).toBeVisible();
    const requestResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response
          .url()
          .includes(`/api/v1/programs/${programId}/enrollment-requests`)
    );
    await requestButton.click();
    const requestResponse = await requestResponsePromise;
    expect(requestResponse.status()).toBe(201);
    const requestBody = (await requestResponse.json()) as {
      data: { request: { request_id: string } };
    };
    const requestId = requestBody.data.request.request_id;
    await expect(
      enrollmentPanel.getByText(COPY.requestPendingHint)
    ).toBeVisible();

    const decisionResponse = await adminApi!.post(
      `/api/v1/programs/${programId}/enrollment-requests/${requestId}/decision`,
      {
        headers: {
          "Idempotency-Key": `t05-participant-${crypto.randomUUID()}`,
        },
        data: { action: "Approved" },
      }
    );
    expect(decisionResponse.status()).toBe(200);

    await page.reload();
    await expect(
      enrollmentPanel.getByText(COPY.enrollmentActiveHint)
    ).toBeVisible();
    await expect(page.locator("#program-detail-title")).toHaveText(programName);

    await enrollmentPanel
      .getByRole("button", { name: COPY.cancelEnrollment })
      .click();
    const cancelDialog = page.getByRole("alertdialog", {
      name: COPY.cancelConfirmTitle,
    });
    await expect(cancelDialog).toBeVisible();
    await cancelDialog
      .getByRole("button", {
        name: new RegExp(`^${COPY.cancelConfirmAccept}$`, "u"),
      })
      .click();
    await expect(
      enrollmentPanel.getByText(COPY.enrollmentCancelledNotice)
    ).toBeVisible();
  });
});
