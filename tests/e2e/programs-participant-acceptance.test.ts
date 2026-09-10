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
  catalogSearch: "搜尋課程",
  catalogClearSearch: "清除搜尋",
  catalogClearFilters: "清除搜尋與篩選",
  catalogEmpty: "找不到相關課程",
  catalogList: "課程目錄",
  filterGroup: "課程篩選",
  filterAll: "全部",
  filterEligible: "可報名",
  enterManagement: "進入管理模式",
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
  departmentCode: string;
  departmentId: string;
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
  const departmentCode = `E2E_T05P_${suffix}`;
  const programName = `E2E_T05P Program ${suffix}`;
  // Record unique fixture identity before any response parsing so afterAll can
  // recover a partially-created Department if setup fails after creation.
  fixture = { departmentCode, departmentId: "", programId: "", programName };
  const departmentResponse = await adminApi.post(
    "/api/v1/programs/departments",
    {
      data: {
        code: departmentCode,
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
  fixture.departmentId = departmentId;
  for (const moduleKey of ["program_catalog", "events", "enrollment"]) {
    const moduleResponse = await adminApi.post(
      `/api/v1/programs/departments/${departmentId}/modules/${moduleKey}/enable`
    );
    expect(moduleResponse.status()).toBe(200);
  }
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
  fixture.programId = programBody.data.program.program_id;
});

async function cleanupParticipantFixture(): Promise<void> {
  const currentFixture = fixture;
  const api = adminApi;
  if (currentFixture === null || api === null) {
    return;
  }

  const failures: string[] = [];
  const attempt = async (
    step: string,
    action: () => Promise<void>
  ): Promise<void> => {
    try {
      await action();
    } catch (error) {
      failures.push(
        `${step}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  const { departmentCode, programName } = currentFixture;
  let departmentId = currentFixture.departmentId;
  if (departmentId === "") {
    await attempt("fixture cleanup Department lookup", async () => {
      const departmentsResponse = await api.get("/api/v1/programs/departments");
      expect(
        departmentsResponse.status(),
        "fixture cleanup Department lookup"
      ).toBe(200);
      const departmentsBody = (await departmentsResponse.json()) as {
        data?: {
          departments?: Array<{
            department_id?: string;
            code?: string;
          }>;
        };
      };
      const matchedDepartment = departmentsBody.data?.departments?.find(
        (department) =>
          department.code === departmentCode && department.department_id
      );
      if (!matchedDepartment?.department_id) {
        throw new Error("created Department was not found by its unique code");
      }
      departmentId = matchedDepartment.department_id;
    });
  }

  let programId = currentFixture.programId;
  if (departmentId !== "" && programId === "") {
    await attempt("fixture cleanup Program lookup", async () => {
      const programsResponse = await api.get(
        `/api/v1/programs/departments/${departmentId}/programs`
      );
      expect(programsResponse.status(), "fixture cleanup Program lookup").toBe(
        200
      );
      const programsBody = (await programsResponse.json()) as {
        data?: {
          programs?: Array<{ program_id?: string; name?: string }>;
        };
      };
      const matchedProgram = programsBody.data?.programs?.find(
        (program) => program.name === programName && program.program_id
      );
      if (!matchedProgram?.program_id) {
        throw new Error("created Program was not found by its unique name");
      }
      programId = matchedProgram.program_id;
    });
  }

  if (programId !== "") {
    let requests: Array<{ request_id?: string; status?: string }> = [];
    await attempt("fixture cleanup request listing", async () => {
      const requestsResponse = await api.get(
        `/api/v1/programs/${programId}/enrollment-requests`
      );
      expect(requestsResponse.status(), "fixture cleanup request listing").toBe(
        200
      );
      const requestsBody = (await requestsResponse.json()) as {
        data?: {
          requests?: Array<{ request_id?: string; status?: string }>;
        };
      };
      requests = requestsBody.data?.requests ?? [];
    });
    for (const request of requests) {
      if (request.status !== "Pending" || !request.request_id) {
        continue;
      }
      await attempt(
        `fixture cleanup pending request ${request.request_id}`,
        async () => {
          const decisionResponse = await api.post(
            `/api/v1/programs/${programId}/enrollment-requests/${request.request_id}/decision`,
            {
              headers: {
                "Idempotency-Key": `t12-cleanup-${crypto.randomUUID()}`,
              },
              data: { action: "Rejected" },
            }
          );
          expect(
            decisionResponse.status(),
            "fixture cleanup pending request resolution"
          ).toBe(200);
        }
      );
    }

    let enrollments: Array<{
      enrollment_id?: string;
      status?: string;
    }> = [];
    await attempt("fixture cleanup enrollment listing", async () => {
      const enrollmentsResponse = await api.get(
        `/api/v1/programs/${programId}/enrollments`
      );
      expect(
        enrollmentsResponse.status(),
        "fixture cleanup enrollment listing"
      ).toBe(200);
      const enrollmentsBody = (await enrollmentsResponse.json()) as {
        data?: {
          enrollments?: Array<{ enrollment_id?: string; status?: string }>;
        };
      };
      enrollments = enrollmentsBody.data?.enrollments ?? [];
    });
    for (const enrollment of enrollments) {
      if (enrollment.status !== "Active" || !enrollment.enrollment_id) {
        continue;
      }
      await attempt(
        `fixture cleanup enrollment ${enrollment.enrollment_id}`,
        async () => {
          const cancelResponse = await api.post(
            `/api/v1/programs/${programId}/enrollments/${enrollment.enrollment_id}/cancel`,
            {
              headers: {
                "Idempotency-Key": `t12-cleanup-${crypto.randomUUID()}`,
              },
              data: {},
            }
          );
          expect(
            cancelResponse.status(),
            "fixture cleanup active enrollment cancellation"
          ).toBe(200);
        }
      );
    }

    await attempt("fixture cleanup Program archive", async () => {
      const archiveProgramResponse = await api.patch(
        `/api/v1/programs/${programId}`,
        {
          headers: {
            "Idempotency-Key": `t12-cleanup-${crypto.randomUUID()}`,
          },
          data: { lifecycle: "Archived" },
        }
      );
      expect(
        archiveProgramResponse.status(),
        "fixture cleanup Program archive"
      ).toBe(200);
    });
  }

  if (departmentId !== "") {
    await attempt("fixture cleanup Department archive", async () => {
      const archiveDepartmentResponse = await api.patch(
        `/api/v1/programs/departments/${departmentId}`,
        {
          headers: {
            "Idempotency-Key": `t12-cleanup-${crypto.randomUUID()}`,
          },
          data: { lifecycle: "Archived" },
        }
      );
      expect(
        archiveDepartmentResponse.status(),
        "fixture cleanup Department archive"
      ).toBe(200);
    });
  }

  if (failures.length > 0) {
    throw new Error(failures.join("; "));
  }
}

test.afterAll(async () => {
  try {
    await cleanupParticipantFixture();
  } finally {
    await adminApi?.dispose();
    adminApi = null;
  }
});

test.describe("T12 participant Programs tracer", () => {
  test("member submits, gets approved, reads back, and exits a Program", async ({
    page,
  }) => {
    expect(fixture).not.toBeNull();
    const { programId, programName } = fixture!;
    await loginAs(page);

    const accessResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response.url().endsWith("/api/v1/programs/access")
    );
    await page.goto("/programs");

    const accessResponse = await accessResponsePromise;
    expect(accessResponse.status()).toBe(200);
    const accessBody = (await accessResponse.json()) as {
      data: { hasManagementCapability: boolean };
    };
    expect(accessBody.data.hasManagementCapability).toBe(false);
    await expect(
      page.getByRole("link", { name: COPY.enterManagement, exact: true })
    ).toHaveCount(0);

    const search = page.getByRole("searchbox", {
      name: COPY.catalogSearch,
    });
    await expect(search).toBeVisible();
    await expect(
      page.getByRole("group", { name: COPY.filterGroup })
    ).toBeVisible();

    const impossibleQuery = `T12-no-match-${crypto.randomUUID()}`;
    await search.fill(impossibleQuery);
    await expect(
      page.getByRole("heading", { name: COPY.catalogEmpty })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: programName })).toHaveCount(0);
    await page
      .getByRole("button", { name: COPY.catalogClearFilters, exact: true })
      .click();
    await expect(search).toHaveValue("");

    const filterGroup = page.getByRole("group", { name: COPY.filterGroup });
    const allFilter = filterGroup.getByRole("button", {
      name: COPY.filterAll,
      exact: true,
    });
    const eligibleFilter = filterGroup.getByRole("button", {
      name: COPY.filterEligible,
      exact: true,
    });
    await expect(allFilter).toHaveAttribute("aria-pressed", "true");
    await eligibleFilter.click();
    await expect(eligibleFilter).toHaveAttribute("aria-pressed", "true");
    await expect(allFilter).toHaveAttribute("aria-pressed", "false");

    await search.fill(programName);
    const eligibleProgramLink = page
      .getByRole("list", { name: COPY.catalogList })
      .getByRole("link", {
        name: new RegExp(`${COPY.filterEligible}.*${programName}`, "u"),
      });
    await expect(eligibleProgramLink).toBeVisible();
    await page
      .getByRole("button", { name: COPY.catalogClearSearch, exact: true })
      .click();
    await expect(search).toHaveValue("");
    await expect(eligibleProgramLink).toBeVisible();

    const programLink = page.getByRole("link", { name: programName });
    await expect(programLink).toBeVisible();
    const canonicalHref = `/programs?program=${encodeURIComponent(programId)}&from=programs`;
    // The directory-origin marker is part of the current canonical intent so
    // Program Detail can return to this directory. Pin the full href so a
    // hash, omitted origin, or alternate query is not silently accepted.
    await expect(programLink).toHaveAttribute("href", canonicalHref);
    await programLink.click();
    await expect(page).toHaveURL(new URL(canonicalHref, TARGET_ORIGIN).href);
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
