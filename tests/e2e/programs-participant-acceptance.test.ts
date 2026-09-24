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
  withdrawRequest: "取消申請",
  withdrawConfirmTitle: "取消報名申請？",
  withdrawConfirmBody: "你仍可在課程接受報名期間重新提交。",
  withdrawConfirmAccept: "取消申請",
  requestWithdrawnNotice: "已取消申請",
  cancelRevoke: "取消",
  reEnroll: "重新報名",
  requestWithdrawPath: "enrollment-requests/",
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
let memberApi: APIRequestContext | null = null;
let staffApi: APIRequestContext | null = null;
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
  await loginAsIdentity(page, MEMBER);
}

async function loginAsIdentity(
  page: Page,
  identity: { username: string; credential: string }
): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/");
  await page.locator('input[autocomplete="username"]').fill(identity.username);
  await page
    .locator('input[autocomplete="current-password"]')
    .fill(identity.credential);
  await page.getByRole("button", { name: COPY.login }).click();
  await page.waitForURL((url) => url.pathname !== "/");
}

async function loginAsAdmin(page: Page): Promise<void> {
  await loginAsIdentity(page, ADMIN);
}

function jsonBody(
  response: Awaited<ReturnType<APIRequestContext["post"]>>
): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

test.beforeAll(async ({ playwright }) => {
  const admin = await loginWithPlaywright(playwright, ADMIN);
  adminApi = admin.api;
  const member = await loginWithPlaywright(playwright, MEMBER);
  memberApi = member.api;
  const staff = await loginWithPlaywright(playwright, {
    username: "E2E_staff",
    credential: "E2E_staff!dev",
  });
  staffApi = staff.api;
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
  const promotionResponse = await adminApi.patch(
    `/api/v1/programs/${programBody.data.program.program_id}`,
    {
      data: { lifecycle: "Active", discoverability: "Listed" },
    }
  );
  expect(promotionResponse.status()).toBe(200);
  fixture = {
    programId: programBody.data.program.program_id,
    programName,
  };
});

test.afterAll(async () => {
  await adminApi?.dispose();
  await memberApi?.dispose();
  await staffApi?.dispose();
});

test.describe("T05.4 participant Browser Acceptance", () => {
  test("programs-d1 #26: member exits an approved enrollment and re-enrolls", async ({
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

    const reenrollResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response
          .url()
          .includes(`/api/v1/programs/${programId}/enrollment-requests`)
    );
    await enrollmentPanel.getByRole("button", { name: COPY.reEnroll }).click();
    expect((await reenrollResponsePromise).status()).toBe(201);
    await expect(
      enrollmentPanel.getByText(COPY.requestPendingHint)
    ).toBeVisible();

    await enrollmentPanel
      .getByRole("button", { name: COPY.withdrawRequest })
      .click();
    const reenrollDialog = page.getByRole("alertdialog", {
      name: COPY.withdrawConfirmTitle,
    });
    await expect(reenrollDialog).toBeVisible();
    const withdrawResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes(COPY.requestWithdrawPath)
    );
    await reenrollDialog
      .getByRole("button", {
        name: new RegExp(`^${COPY.withdrawConfirmAccept}$`, "u"),
      })
      .click();
    expect((await withdrawResponsePromise).status()).toBe(200);
  });

  test("member withdraws a Pending request only after confirmation", async ({
    page,
  }) => {
    expect(fixture).not.toBeNull();
    const { programId, programName } = fixture!;
    await loginAs(page);
    await page.goto(`/programs?program=${programId}`);
    await expect(page.locator("#program-detail-title")).toHaveText(programName);

    const enrollmentPanel = page.getByRole("region", {
      name: new RegExp(`^${COPY.enrollment}$`, "u"),
    });
    const requestResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response
          .url()
          .includes(`/api/v1/programs/${programId}/enrollment-requests`)
    );
    await enrollmentPanel
      .getByRole("button", { name: COPY.requestEnroll })
      .click();
    expect((await requestResponsePromise).status()).toBe(201);
    await expect(
      enrollmentPanel.getByText(COPY.requestPendingHint)
    ).toBeVisible();

    const withdrawButton = enrollmentPanel.getByRole("button", {
      name: COPY.withdrawRequest,
    });
    await withdrawButton.click();
    const dialog = page.getByRole("alertdialog", {
      name: COPY.withdrawConfirmTitle,
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(COPY.withdrawConfirmBody)).toBeVisible();
    await dialog
      .getByRole("button", { name: new RegExp(`^${COPY.cancelRevoke}$`, "u") })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(
      enrollmentPanel.getByText(COPY.requestPendingHint)
    ).toBeVisible();

    await withdrawButton.click();
    const confirmDialog = page.getByRole("alertdialog", {
      name: COPY.withdrawConfirmTitle,
    });
    const withdrawResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes(COPY.requestWithdrawPath)
    );
    await confirmDialog
      .getByRole("button", {
        name: new RegExp(`^${COPY.withdrawConfirmAccept}$`, "u"),
      })
      .click();
    expect((await withdrawResponsePromise).status()).toBe(200);
    await expect(
      enrollmentPanel.getByText(COPY.requestWithdrawnNotice)
    ).toBeVisible();
    await expect(
      enrollmentPanel.getByRole("button", { name: COPY.reEnroll })
    ).toBeVisible();
  });

  test("manager recovers an interrupted Approval Run after reload and continues explicitly", async ({
    page,
  }) => {
    expect(fixture).not.toBeNull();
    expect(memberApi).not.toBeNull();
    const { programId, programName } = fixture!;
    const memberRequestResponse = await memberApi!.post(
      `/api/v1/programs/${programId}/enrollment-requests`,
      { data: {} }
    );
    expect(memberRequestResponse.status()).toBe(201);
    const memberRequestBody = (await jsonBody(memberRequestResponse)) as {
      data: { request: { request_id: string } };
    };
    const memberRequestId = memberRequestBody.data.request.request_id;
    const staffRequestResponse = await staffApi!.post(
      `/api/v1/programs/${programId}/enrollment-requests`,
      { data: {} }
    );
    expect(staffRequestResponse.status()).toBe(201);
    const staffRequestBody = (await jsonBody(staffRequestResponse)) as {
      data: { request: { request_id: string } };
    };
    const staffRequestId = staffRequestBody.data.request.request_id;

    await loginAsAdmin(page);
    await page.goto(
      `/programs?mode=management&program=${encodeURIComponent(programId)}&task=participants`
    );
    await expect(
      page.getByRole("heading", { name: programName })
    ).toBeVisible();
    const participantPanel = page.getByRole("region", {
      name: "參與者",
    });
    await expect(
      participantPanel.getByRole("tab", { name: /待審批 \(2\)/u })
    ).toBeVisible();

    let continueRequests = 0;
    let reconcileRequests = 0;
    const reconcilePath = `**/api/v1/programs/${programId}/enrollment-approval-runs/*/reconcile`;
    await page.route(reconcilePath, async (route) => {
      reconcileRequests += 1;
      await route.continue();
    });
    await page.route(
      `**/api/v1/programs/${programId}/enrollment-approval-runs/*/continue`,
      async (route) => {
        continueRequests += 1;
        if (continueRequests === 1) {
          const committedResponse = await route.fetch();
          expect(committedResponse.status()).toBe(200);
          await route.abort("failed");
          return;
        }
        await route.continue();
      }
    );
    await participantPanel
      .getByRole("checkbox", { name: "選取目前顯示的待審批報名" })
      .click();
    await participantPanel.getByRole("button", { name: "檢視所選" }).click();
    const firstReconcileResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/enrollment-approval-runs/") &&
        response.url().endsWith("/reconcile")
    );
    await page
      .getByRole("alertdialog", { name: "確認核准所選報名" })
      .getByRole("button", { name: "確認核准" })
      .click();
    const continueButton = participantPanel.getByRole("button", {
      name: "繼續處理餘下項目",
    });
    await expect(continueButton).toBeEnabled();
    expect((await firstReconcileResponse).status()).toBe(200);
    expect(continueRequests).toBe(1);
    expect(reconcileRequests).toBeGreaterThanOrEqual(1);

    const reloadReconcileResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/enrollment-approval-runs/") &&
        response.url().endsWith("/reconcile")
    );
    await page.reload();
    await expect(
      participantPanel.getByRole("button", {
        name: "繼續處理餘下項目",
      })
    ).toBeVisible();
    expect((await reloadReconcileResponse).status()).toBe(200);
    await expect(continueButton).toBeEnabled();
    expect(continueRequests).toBe(1);
    expect(reconcileRequests).toBeGreaterThanOrEqual(2);

    await participantPanel
      .getByRole("button", { name: "繼續處理餘下項目" })
      .click();
    await expect(participantPanel.getByText("已核准")).toBeVisible();
    await expect(participantPanel.getByText("全部完成").first()).toBeVisible();
    expect(continueRequests).toBe(2);
    const snapshotResponse = await adminApi!.get(
      `/api/v1/programs/${programId}/enrollment-snapshot`
    );
    expect(snapshotResponse.status()).toBe(200);
    const snapshotBody = (await jsonBody(snapshotResponse)) as {
      data: {
        requests: { request_id: string; status: string }[];
        enrollments: { request_id: string | null; status: string }[];
      };
    };
    for (const requestId of [memberRequestId, staffRequestId]) {
      expect(
        snapshotBody.data.requests.find(
          (request) => request.request_id === requestId
        )?.status
      ).toBe("Approved");
      expect(
        snapshotBody.data.enrollments.filter(
          (enrollment) =>
            enrollment.request_id === requestId &&
            enrollment.status === "Active"
        )
      ).toHaveLength(1);
    }
    await page.unroute(
      `**/api/v1/programs/${programId}/enrollment-approval-runs/*/continue`
    );
    await page.unroute(reconcilePath);
  });
});
