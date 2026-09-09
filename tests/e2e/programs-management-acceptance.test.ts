import { expect, test, type Page } from "@playwright/test";

const ADMIN = {
  username: process.env.PROGRAMS_ADMIN_USERNAME ?? "E2E_admin",
  credential: process.env.PROGRAMS_ADMIN_CREDENTIAL ?? "E2E_admin!dev",
};

const COPY = {
  login: "登入",
  directoryTitle: "管理課程目錄",
  directorySearch: "搜尋可管理課程",
  directoryList: "可管理課程",
  settings: "課程設定",
  programName: "課程名稱",
  programDescription: "課程簡介",
  saveBasics: "儲存基本資料",
  saved: "課程設定已儲存。",
};

type Fixture = {
  departmentId: string;
  programId: string;
  programName: string;
  description: string;
};

async function loginAs(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator('input[autocomplete="username"]').fill(ADMIN.username);
  await page
    .locator('input[autocomplete="current-password"]')
    .fill(ADMIN.credential);
  await page.getByRole("button", { name: COPY.login }).click();
  await page.waitForURL((url) => url.pathname !== "/");
}

async function createFixture(page: Page, suffix: string): Promise<Fixture> {
  const fixture = await page.evaluate(async (value) => {
    async function post(path: string, data?: unknown) {
      const response = await fetch(path, {
        method: "POST",
        headers:
          data === undefined ? {} : { "Content-Type": "application/json" },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      return { status: response.status, body: await response.json() };
    }

    const department = await post("/api/v1/programs/departments", {
      code: `E2E_T05M_${value}`,
      name: `E2E_T05M Management ${value}`,
      lifecycle: "Active",
    });
    if (department.status !== 201) {
      throw new Error(`department fixture returned HTTP ${department.status}`);
    }
    const departmentId = (
      department.body as { data: { department: { department_id: string } } }
    ).data.department.department_id;
    for (const moduleKey of ["program_catalog", "events", "enrollment"]) {
      const module = await post(
        `/api/v1/programs/departments/${departmentId}/modules/${moduleKey}/enable`
      );
      if (module.status !== 200) {
        throw new Error(`${moduleKey} fixture returned HTTP ${module.status}`);
      }
    }
    const programName = `E2E_T05M Program ${value}`;
    const description = "Disposable management Browser Acceptance fixture.";
    const program = await post(
      `/api/v1/programs/departments/${departmentId}/programs`,
      {
        name: programName,
        description,
        category: "T05",
        behavior_type: "Recurring",
        lifecycle: "Active",
        discoverability: "Listed",
        enrollment_mode: "MemberRequest",
      }
    );
    if (program.status !== 201) {
      throw new Error(`program fixture returned HTTP ${program.status}`);
    }
    return {
      departmentId,
      programId: (program.body as { data: { program: { program_id: string } } })
        .data.program.program_id,
      programName,
      description,
    };
  }, suffix);
  return fixture as Fixture;
}

async function restoreFixture(page: Page, fixture: Fixture): Promise<void> {
  await page.evaluate(async ({ programId, programName, description }) => {
    const response = await fetch(`/api/v1/programs/${programId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: programName, description, category: "T05" }),
    });
    if (!response.ok) {
      throw new Error(
        `management fixture restore returned HTTP ${response.status}`
      );
    }
  }, fixture);
}

test.describe("T05.5 management Browser Acceptance", () => {
  test("admin opens a scoped Program, saves management data, and reads it back", async ({
    page,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    try {
      await page.goto("/programs?mode=management");
      await expect(
        page.getByRole("heading", { name: COPY.directoryTitle })
      ).toBeVisible();
      const search = page.getByRole("searchbox", {
        name: COPY.directorySearch,
      });
      await search.fill(fixture.programName);
      const programLink = page
        .getByRole("list", { name: COPY.directoryList })
        .getByRole("link", { name: fixture.programName });
      await expect(programLink).toBeVisible();
      await programLink.click();
      await expect(page).toHaveURL(
        new RegExp(
          `/programs\\?mode=management&program=${fixture.programId}$`,
          "u"
        )
      );

      await page.goto(
        `/programs?mode=management&program=${fixture.programId}&task=settings`
      );
      await expect(
        page.getByRole("heading", { name: COPY.settings })
      ).toBeVisible();
      const nameInput = page.getByRole("textbox", { name: COPY.programName });
      const descriptionInput = page.getByRole("textbox", {
        name: COPY.programDescription,
      });
      await expect(nameInput).toHaveValue(fixture.programName);
      await expect(descriptionInput).toHaveValue(fixture.description);

      const updatedName = `${fixture.programName} Updated`;
      const updatedDescription = `${fixture.description} Updated`;
      await nameInput.fill(updatedName);
      await descriptionInput.fill(updatedDescription);
      await page.getByRole("button", { name: COPY.saveBasics }).click();
      await expect(
        page.getByText(COPY.saved, { exact: true }).first()
      ).toBeVisible();
      await expect(nameInput).toHaveValue(updatedName);
      await expect(descriptionInput).toHaveValue(updatedDescription);

      await page.reload();
      await expect(
        page.getByRole("textbox", { name: COPY.programName })
      ).toHaveValue(updatedName);
      await expect(
        page.getByRole("textbox", { name: COPY.programDescription })
      ).toHaveValue(updatedDescription);
    } finally {
      await restoreFixture(page, fixture);
    }
  });
});
