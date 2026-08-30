import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { DEV_ADMIN, DEV_MEMBER, DEV_STAFF } from "./dev-fixtures";

const LOGIN = "登入";
const PROGRAMS_TITLE = "課程";
const DIRECTORY_TITLE = "參與者";
const SEARCH_LABEL = "搜尋會員";
const DETAIL_TITLE = "參與者資料";
const MEMBER_CONTACT = "聯絡";
const DETAIL_UNAVAILABLE = "未提供";
const MEMBER_ROLE = "角色";
const MEMBER_DEPARTMENTS = "部門";
const BACK_TO_MANAGEMENT = "返回管理工作";
const SEEDED_DEPARTMENT_ID = "018f3b8a-0000-7000-8000-000000000002";
const SEEDED_DEPARTMENT_NAME = "成區";
const SEEDED_DEPARTMENT_ROLE_ID = "018f3b8a-0000-7000-8000-100000000001";

const configuredTarget = process.env.PROGRAMS_TARGET_URL;
const localTarget =
  !configuredTarget ||
  ["localhost", "127.0.0.1"].includes(new URL(configuredTarget).hostname);
const ADMIN_USER =
  process.env.PROGRAMS_ADMIN_USERNAME ??
  (localTarget ? DEV_ADMIN.username : undefined);
const ADMIN_CREDENTIAL =
  process.env.PROGRAMS_ADMIN_CREDENTIAL ??
  (localTarget ? DEV_ADMIN.credential : undefined);
const STAFF_USER =
  process.env.PROGRAMS_STAFF_USERNAME ??
  (localTarget ? DEV_STAFF.username : undefined);
const STAFF_CREDENTIAL =
  process.env.PROGRAMS_STAFF_CREDENTIAL ??
  (localTarget ? DEV_STAFF.credential : undefined);
const MEMBER_USER =
  process.env.PROGRAMS_MEMBER_USERNAME ??
  (localTarget ? DEV_MEMBER.username : undefined);
const MEMBER_CREDENTIAL =
  process.env.PROGRAMS_MEMBER_CREDENTIAL ??
  (localTarget ? DEV_MEMBER.credential : undefined);

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is required for the member-directory E2E proof`);
  }
  return value;
}

async function clearSession(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.removeItem("efcc_auth_active");
  });
}

async function loginAs(
  page: Page,
  username: string,
  password: string
): Promise<void> {
  await page.goto("/");
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole("button", { name: LOGIN }).click();
  await page.waitForURL((url) => url.pathname !== "/");
  await page.goto("/programs");
  await expect(
    page.getByRole("heading", { name: PROGRAMS_TITLE })
  ).toBeVisible();
}

interface ApiResult {
  status: number;
  body: { data?: Record<string, unknown>; [key: string]: unknown };
}

async function api(
  page: Page,
  path: string,
  init: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Promise<ApiResult> {
  return page.evaluate(
    async ({ path: requestPath, method, body, headers }) => {
      const response = await fetch(requestPath, {
        method,
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(headers ?? {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    },
    {
      path,
      method: init.method ?? "GET",
      body: init.body,
      headers: init.headers,
    }
  );
}

async function enableDepartmentModules(
  page: Page,
  departmentId: string
): Promise<void> {
  for (const moduleKey of ["program_catalog", "events", "enrollment"]) {
    const enabled = await api(
      page,
      `/api/v1/programs/departments/${departmentId}/modules/${moduleKey}/enable`,
      { method: "POST" }
    );
    expect(enabled.status).toBe(200);
  }
}

async function createDepartment(
  page: Page,
  code: string,
  name: string
): Promise<string> {
  const created = await api(page, "/api/v1/programs/departments", {
    method: "POST",
    body: { code, name, lifecycle: "Draft" },
  });
  expect(created.status).toBe(201);
  const department = created.body.data?.department as {
    department_id: string;
  };
  await enableDepartmentModules(page, department.department_id);

  return department.department_id;
}

async function createProgram(
  page: Page,
  departmentId: string,
  name: string
): Promise<string> {
  const created = await api(
    page,
    `/api/v1/programs/departments/${departmentId}/programs`,
    {
      method: "POST",
      body: {
        name,
        description: "087-04 member directory E2E fixture",
        category: "測試",
        behavior_type: "OneOff",
        lifecycle: "Active",
        discoverability: "Unlisted",
        enrollment_mode: "ManagerOnly",
      },
    }
  );
  expect(created.status).toBe(201);
  return (created.body.data?.program as { program_id: string }).program_id;
}

async function enroll(
  page: Page,
  programId: string,
  memberUserId: string
): Promise<void> {
  const result = await api(page, `/api/v1/programs/${programId}/enrollments`, {
    method: "POST",
    body: { member_user_id: memberUserId },
  });
  expect(result.status).toBe(201);
}

async function currentAssignmentRevision(
  page: Page,
  accountUserId: string
): Promise<number> {
  const result = await api(
    page,
    `/api/v1/identity/accounts/${encodeURIComponent(accountUserId)}/assignments`
  );
  expect(result.status).toBe(200);
  const revision = result.body.data?.revision;
  expect(typeof revision).toBe("number");
  return revision as number;
}

async function assignDepartmentIdentity(
  page: Page,
  accountUserId: string,
  suffix: string
): Promise<void> {
  const result = await api(
    page,
    `/api/v1/identity/accounts/${encodeURIComponent(accountUserId)}/assignments`,
    {
      method: "POST",
      headers: { "Idempotency-Key": `member-directory-assign-${suffix}` },
      body: {
        base_revision: await currentAssignmentRevision(page, accountUserId),
        role_definition_ids: [SEEDED_DEPARTMENT_ROLE_ID],
      },
    }
  );
  expect(result.status).toBe(200);
  expect(result.body.data?.activeAssignments).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        roleDefinitionId: SEEDED_DEPARTMENT_ROLE_ID,
        scopeKind: "Department",
        scopeId: SEEDED_DEPARTMENT_ID,
      }),
    ])
  );
}

async function revokeDepartmentIdentity(
  page: Page,
  accountUserId: string,
  suffix: string
): Promise<void> {
  const result = await api(
    page,
    `/api/v1/identity/accounts/${encodeURIComponent(accountUserId)}/assignments/revoke`,
    {
      method: "POST",
      headers: { "Idempotency-Key": `member-directory-revoke-${suffix}` },
      body: {
        base_revision: await currentAssignmentRevision(page, accountUserId),
        role_definition_ids: [SEEDED_DEPARTMENT_ROLE_ID],
      },
    }
  );
  expect(result.status).toBe(200);
  expect(
    (
      result.body.data?.activeAssignments as
        | { roleDefinitionId?: unknown }[]
        | undefined
    )?.some(
      (assignment) => assignment.roleDefinitionId === SEEDED_DEPARTMENT_ROLE_ID
    )
  ).toBe(false);
}

test.describe("087-04 Member Directory", () => {
  test("Admin/Staff are church-wide; Department Manager is scoped; detail is inline", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CREDENTIAL)
    );

    const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const scopedDepartmentId = SEEDED_DEPARTMENT_ID;
    await enableDepartmentModules(page, scopedDepartmentId);
    const outsideDepartmentId = await createDepartment(
      page,
      `E2E_MD_Y_${suffix}`,
      `E2E_MD_崇拜部_${suffix}`
    );

    const scopedProgramId = await createProgram(
      page,
      scopedDepartmentId,
      `E2E_MD_X_${suffix}`
    );
    const outsideProgramId = await createProgram(
      page,
      outsideDepartmentId,
      `E2E_MD_Y_${suffix}`
    );

    // E2E Admin and E2E Member are in the DM's department; E2E Staff is
    // enrolled only outside it and is the explicit exclusion target.
    await enroll(page, scopedProgramId, DEV_ADMIN.userId);
    await enroll(page, scopedProgramId, DEV_MEMBER.userId);
    await enroll(page, outsideProgramId, DEV_STAFF.userId);
    await assignDepartmentIdentity(page, DEV_MEMBER.userId, suffix);

    try {
      // Admin: church-wide search sees all three Active fixture accounts.
      await page.goto("/management?module=members");
      await expect(
        page.getByRole("heading", { name: DIRECTORY_TITLE })
      ).toBeVisible();
      const adminSearch = page.getByLabel(SEARCH_LABEL);
      await adminSearch.fill("E2E");
      await expect(
        page.getByRole("button", { name: "E2E Admin", exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "E2E Staff", exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "E2E Member", exact: true })
      ).toBeVisible();

      // Staff has the same church-wide role-global scope.
      await clearSession(page);
      await loginAs(
        page,
        required("PROGRAMS_STAFF_USERNAME", STAFF_USER),
        required("PROGRAMS_STAFF_CREDENTIAL", STAFF_CREDENTIAL)
      );
      await page.goto("/management?module=members");
      await page.getByLabel(SEARCH_LABEL).fill("E2E");
      await expect(
        page.getByRole("button", { name: "E2E Admin", exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "E2E Staff", exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "E2E Member", exact: true })
      ).toBeVisible();

      // Department Manager: only the two members enrolled in the managed
      // department appear; E2E Staff is enrolled solely outside the scope.
      await clearSession(page);
      await loginAs(
        page,
        required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
        required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CREDENTIAL)
      );
      await page.goto("/management?module=members");
      await page.getByLabel(SEARCH_LABEL).fill("E2E");
      await expect(
        page.getByRole("button", { name: "E2E Admin", exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "E2E Member", exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "E2E Staff", exact: true })
      ).toHaveCount(0);

      // Selecting a result renders contact/role/departments inline. There is
      // no save/confirm/submit commit action for this read-only detail.
      await page
        .getByRole("button", { name: "E2E Admin", exact: true })
        .click();
      const detail = page.getByRole("article", { name: DETAIL_TITLE });
      await expect(detail).toBeVisible();
      await expect(
        detail.getByRole("heading", { name: DETAIL_TITLE })
      ).toBeVisible();
      await expect(detail.getByText(MEMBER_CONTACT)).toBeVisible();
      await expect(detail.getByText(DETAIL_UNAVAILABLE)).toBeVisible();
      await expect(detail.getByText(MEMBER_ROLE)).toBeVisible();
      await expect(detail.getByText("Admin", { exact: true })).toBeVisible();
      await expect(detail.getByText(MEMBER_DEPARTMENTS)).toBeVisible();
      await expect(
        detail.getByText(SEEDED_DEPARTMENT_NAME, { exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /儲存|確認|提交/u })
      ).toHaveCount(0);
      await expect(page.getByLabel(SEARCH_LABEL)).toBeVisible();
      await expect(
        page.getByRole("link", { name: BACK_TO_MANAGEMENT })
      ).toBeVisible();
    } finally {
      await clearSession(page);
      await loginAs(
        page,
        required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
        required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CREDENTIAL)
      );
      await revokeDepartmentIdentity(page, DEV_MEMBER.userId, suffix);
      await clearSession(page);
    }
  });
});
