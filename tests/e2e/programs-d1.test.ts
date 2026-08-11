/* oxlint-disable vitest/prefer-importing-vitest-globals */
// PUI-01 / Issue #245 — bounded deployed proof for the Programs entry boundary.
//
// This reuses the standing programs-d1 Playwright configuration and its
// disposable E2E_* fixtures. The former PRG-05 suite drove the nested
// Department -> Program -> Events/Enrollment/Leaders manager, which is not
// rendered by Issue #245 and is intentionally covered by later tickets.
// These checks assert only observable boundary DOM, URL state, accessibility,
// and server-shaped capability outcomes.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { DEV_ADMIN, DEV_MEMBER, DEV_STAFF } from "./dev-fixtures";

const ADMIN_USER = process.env.PROGRAMS_ADMIN_USERNAME ?? DEV_ADMIN.username;
const ADMIN_CRED = process.env.PROGRAMS_ADMIN_CREDENTIAL ?? DEV_ADMIN.credential;
const STAFF_USER = process.env.PROGRAMS_STAFF_USERNAME ?? DEV_STAFF.username;
const STAFF_CRED = process.env.PROGRAMS_STAFF_CREDENTIAL ?? DEV_STAFF.credential;
const MEMBER_USER = process.env.PROGRAMS_MEMBER_USERNAME ?? DEV_MEMBER.username;
const MEMBER_CRED = process.env.PROGRAMS_MEMBER_CREDENTIAL ?? DEV_MEMBER.credential;

const COPY = {
  login: "登入",
  pageTitle: "課程與活動",
  pageLead: "課程與活動集中於此，先了解適合你的下一步。",
  participantMode: "參與者模式",
  managementMode: "管理模式",
  enterManagement: "進入管理模式",
  malformedIntent: "連結資料無效",
  directProgramIntent: "已保留活動連結",
};

type Capability = {
  manage: boolean;
  publish: boolean;
  module_configure?: boolean;
  leader_assign?: boolean;
};

type DepartmentScope = {
  department_id: string;
  capabilities: Capability;
};

type ProgramScope = {
  capabilities: Capability;
};

async function hasProjectedManagementCapability(page: Page): Promise<boolean> {
  const departmentsResponse = await page.request.get(
    "/api/v1/programs/departments"
  );
  expect(departmentsResponse.status()).toBe(200);
  const departmentsBody = (await departmentsResponse.json()) as {
    data: { departments: DepartmentScope[] };
  };
  const departments = departmentsBody.data.departments;
  if (
    departments.some(
      ({ capabilities }) =>
        capabilities.manage ||
        capabilities.publish ||
        capabilities.module_configure === true
    )
  ) {
    return true;
  }

  for (const { department_id } of departments) {
    const programsResponse = await page.request.get(
      `/api/v1/programs/departments/${encodeURIComponent(department_id)}/programs`
    );
    expect(programsResponse.status()).toBe(200);
    const programsBody = (await programsResponse.json()) as {
      data: { programs: ProgramScope[] };
    };
    if (
      programsBody.data.programs.some(
        ({ capabilities }) =>
          capabilities.manage ||
          capabilities.publish ||
          capabilities.leader_assign === true
      )
    ) {
      return true;
    }
  }
  return false;
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

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
  await page.goto("/programs");
  await expect(
    page.getByRole("heading", { name: COPY.pageTitle })
  ).toBeVisible();
}

test.beforeAll(() => {
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
  if (![ADMIN_USER, STAFF_USER, MEMBER_USER].every((user) => user?.startsWith("E2E_"))) {
    throw new Error(
      "PROGRAMS_*_USERNAME must start with E2E_; deployed suites require disposable acceptance accounts"
    );
  }
});

test.describe("PUI-01 deployed Programs boundary", () => {
  test("admin enters Participant mode with capability-shaped Management entry", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );

    await expect(
      page.getByRole("heading", { name: COPY.participantMode })
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: COPY.participantMode })
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText(COPY.pageLead)).toBeVisible();
    const hasManagement = await hasProjectedManagementCapability(page);
    const managementButton = page.getByRole("button", {
      name: COPY.enterManagement,
    });
    if (hasManagement) {
      await expect(managementButton).toBeVisible();
      await expect(
        page.getByText(COPY.managementMode, { exact: true })
      ).toBeVisible();
    } else {
      await expect(managementButton).toHaveCount(0);
    }
  });

  test("staff also enters Participant mode before any management action", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_STAFF_USERNAME", STAFF_USER),
      required("PROGRAMS_STAFF_CREDENTIAL", STAFF_CRED)
    );

    await expect(
      page.getByRole("heading", { name: COPY.participantMode })
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: COPY.participantMode })
    ).toHaveAttribute("aria-selected", "true");
  });

  test("member enters Participant mode without a management gateway", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
      required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
    );

    await expect(
      page.getByRole("heading", { name: COPY.participantMode })
    ).toBeVisible();
    const hasManagement = await hasProjectedManagementCapability(page);
    const managementButton = page.getByRole("button", {
      name: COPY.enterManagement,
    });
    await expect(managementButton).toHaveCount(hasManagement ? 1 : 0);
  });

  test("mode switching preserves a valid Program intent and exposes tabpanel semantics", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    const hasManagement = await hasProjectedManagementCapability(page);
    test.skip(!hasManagement, "fixture has no projected management scope");
    await page.goto("/programs?program=e2e-intent#overview");

    await expect(
      page.getByRole("status").getByText(COPY.directProgramIntent)
    ).toBeVisible();
    const panel = page.getByRole("tabpanel");
    await expect(panel).toHaveAttribute(
      "aria-labelledby",
      "programs-participant-tab"
    );

    await page.getByRole("button", { name: COPY.enterManagement }).click();
    await expect(page).toHaveURL(
      /\/programs\?mode=management&program=e2e-intent#overview$/u
    );
    await expect(
      page.getByRole("tab", { name: COPY.managementMode })
    ).toHaveAttribute("aria-selected", "true");
    await expect(panel).toHaveAttribute(
      "aria-labelledby",
      "programs-management-tab"
    );

    await page.getByRole("tab", { name: COPY.participantMode }).click();
    await expect(page).toHaveURL(/\/programs\?program=e2e-intent#overview$/u);
    await expect(
      page.getByRole("heading", { name: COPY.participantMode })
    ).toBeVisible();
  });

  test("malformed direct intent stays recoverable inside Programs", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
      required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
    );
    await page.goto("/programs?mode=sideways#overview");

    await expect(
      page.getByRole("heading", { name: COPY.malformedIntent })
    ).toBeVisible();
    await expect(page).toHaveURL(/\/programs\?mode=sideways#overview$/u);
    await expect(page.getByRole("link", { name: "返回首頁" })).toHaveCount(0);
  });
});
