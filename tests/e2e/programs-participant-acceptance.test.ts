import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import { resetParticipantEnrollment } from "./participant-enrollment-cleanup";

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
  detailBack: "課程",
  enrollment: "報名",
  enroll: "報名",
  requestEnroll: "報名",
  requestPendingHint: "申請已送出，等待課程負責人處理。",
  requestPending: "待處理",
  requestWithdrawn: "已撤回",
  enrollmentActiveHint: "你目前已加入此課程。",
  enrollmentHistory: "你的報名紀錄",
  enrollmentScheduleAdvisory:
    "申請前請確認時間是否適合；系統只提供提示，不會因時間重疊自動阻擋。",
  cancelEnrollment: "退出課程",
  cancelConfirmTitle: "退出課程？",
  cancelConfirmBody: "退出後如需再參加，需重新報名。",
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
  approve: "核准",
  decisionMade: "已處理申請。",
  workspaceTaskParticipants: "參與者",
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
  const eventStart = Date.now() + 60 * 60_000;
  const eventResponse = await adminApi.post(
    `/api/v1/programs/${programBody.data.program.program_id}/events`,
    {
      data: {
        starts_at: new Date(eventStart).toISOString(),
        ends_at: new Date(eventStart + 90 * 60_000).toISOString(),
        name: `E2E_T05P Event ${suffix}`,
        location: "E2E Participant Hall",
        event_type: "訓練",
      },
    }
  );
  expect(eventResponse.status()).toBe(201);
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
  test("programs-d1 #14: catalog selection uses the canonical from=programs URL and Back returns to the row", async ({
    page,
  }) => {
    expect(fixture).not.toBeNull();
    const { programId, programName } = fixture!;
    await loginAs(page);
    await page.goto("/programs");

    const programLink = page.getByRole("link", { name: programName });
    await expect(programLink).toBeVisible();
    await programLink.focus();
    await programLink.click();
    await expect(page).toHaveURL(
      new RegExp(
        `/programs\\?program=${encodeURIComponent(programId)}&from=programs$`,
        "u"
      )
    );
    await expect(page.locator("#program-detail-title")).toHaveText(programName);

    await page
      .locator('article[aria-labelledby="program-detail-title"]')
      .getByRole("link", { name: COPY.detailBack, exact: true })
      .click();
    await expect(page).toHaveURL(/\/programs$/u);
    await expect(programLink).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.activeElement instanceof HTMLElement
            ? (document.activeElement.dataset.programId ?? null)
            : null
        )
      )
      .toBe(programId);
  });

  test("programs-d1 #26: member exits an approved enrollment and re-enrolls", async ({
    page,
    browser,
  }) => {
    expect(fixture).not.toBeNull();
    const { programId, programName } = fixture!;
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    try {
      await loginAs(memberPage);
      await memberPage.goto(`/programs?program=${programId}#overview`);
      await expect(memberPage.locator("#program-detail-title")).toHaveText(
        programName
      );
      const enrollmentPanel = memberPage.getByRole("region", {
        name: new RegExp(`^${COPY.enrollment}$`, "u"),
      });
      await resetParticipantEnrollment(memberPage, enrollmentPanel, COPY);
      const requestButton = enrollmentPanel.getByRole("button", {
        name: new RegExp(`^(${COPY.enroll}|${COPY.reEnroll})$`, "u"),
      });
      const requestResponsePromise = memberPage.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response
            .url()
            .includes(`/api/v1/programs/${programId}/enrollment-requests`)
      );
      await requestButton.click();
      expect((await requestResponsePromise).status()).toBe(201);
      await expect(
        enrollmentPanel.getByText(COPY.requestPendingHint)
      ).toBeVisible();

      const memberName = await memberPage.evaluate(async () => {
        const response = await fetch("/api/v1/auth/me");
        const body = (await response.json()) as {
          data?: { user?: { name?: string } };
        };
        return body.data?.user?.name ?? "";
      });
      expect(memberName).toBeTruthy();

      await loginAsAdmin(page);
      await page.goto(
        `/programs?mode=management&program=${encodeURIComponent(programId)}&task=participants`
      );
      const participantPanel = page.getByRole("region", {
        name: COPY.workspaceTaskParticipants,
      });
      const requestRow = participantPanel
        .getByRole("listitem")
        .filter({ hasText: memberName })
        .first();
      await expect(
        requestRow.getByRole("button", { name: COPY.approve })
      ).toBeVisible();
      await requestRow.getByRole("button", { name: COPY.approve }).click();
      await expect(
        participantPanel.getByText(COPY.decisionMade, { exact: true })
      ).toBeVisible();

      await memberPage.reload();
      await expect(
        enrollmentPanel.getByText(COPY.enrollmentActiveHint)
      ).toBeVisible();

      await enrollmentPanel
        .getByRole("button", { name: COPY.cancelEnrollment })
        .click();
      const cancelDialog = memberPage.getByRole("alertdialog", {
        name: COPY.cancelConfirmTitle,
      });
      await expect(cancelDialog).toBeVisible();
      await expect(
        cancelDialog.getByText(COPY.cancelConfirmBody)
      ).toBeVisible();
      await cancelDialog
        .getByRole("button", {
          name: new RegExp(`^${COPY.cancelRevoke}$`, "u"),
        })
        .click();
      await expect(
        memberPage.getByRole("alertdialog", { name: COPY.cancelConfirmTitle })
      ).toHaveCount(0);
      await expect(
        enrollmentPanel.getByText(COPY.enrollmentActiveHint)
      ).toBeVisible();

      await enrollmentPanel
        .getByRole("button", { name: COPY.cancelEnrollment })
        .click();
      const confirmedCancel = memberPage.getByRole("alertdialog", {
        name: COPY.cancelConfirmTitle,
      });
      const cancelResponsePromise = memberPage.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes(`/api/v1/programs/${programId}/enrollments/`)
      );
      await confirmedCancel
        .getByRole("button", {
          name: new RegExp(`^${COPY.cancelConfirmAccept}$`, "u"),
        })
        .click();
      expect((await cancelResponsePromise).status()).toBe(200);
      await expect(
        enrollmentPanel.getByText(COPY.enrollmentCancelledNotice)
      ).toBeVisible();
      await expect(
        enrollmentPanel.getByRole("button", { name: COPY.reEnroll })
      ).toBeVisible();
    } finally {
      await memberContext.close();
    }
  });

  test("programs-d1 #25: schedule advisory and Pending history remain visible through confirmation", async ({
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
    await resetParticipantEnrollment(page, enrollmentPanel, COPY);
    await expect(
      enrollmentPanel.getByText(COPY.enrollmentScheduleAdvisory, {
        exact: true,
      })
    ).toBeVisible();
    const requestResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response
          .url()
          .includes(`/api/v1/programs/${programId}/enrollment-requests`)
    );
    await enrollmentPanel
      .getByRole("button", {
        name: new RegExp(`^(${COPY.enroll}|${COPY.reEnroll})$`, "u"),
      })
      .click();
    expect((await requestResponsePromise).status()).toBe(201);
    await expect(
      enrollmentPanel.getByText(COPY.requestPendingHint)
    ).toBeVisible();
    const history = page.getByRole("list", {
      name: COPY.enrollmentHistory,
    });
    await expect(history).toBeVisible();
    await expect(history).toContainText(COPY.requestPending);

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
    await expect(history).toContainText(COPY.requestPending);

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
    await expect(history).toContainText(COPY.requestWithdrawn);
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
