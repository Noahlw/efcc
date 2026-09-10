import { expect, test, type Page } from "@playwright/test";

const ADMIN = {
  username: process.env.PROGRAMS_ADMIN_USERNAME ?? "E2E_admin",
  credential: process.env.PROGRAMS_ADMIN_CREDENTIAL ?? "E2E_admin!dev",
};

const COPY = {
  login: "登入",
  enterManagement: "進入管理模式",
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

type FixtureSetupResult =
  | { ok: true; fixture: Fixture }
  | { ok: false; fixture: Fixture; error: string };

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
  const result = (await page.evaluate(async (value) => {
    const fixture: Fixture = {
      departmentId: "",
      programId: "",
      programName: `E2E_T05M Program ${value}`,
      description: "Disposable management Browser Acceptance fixture.",
    };

    async function post(path: string, data?: unknown) {
      const response = await fetch(path, {
        method: "POST",
        headers:
          data === undefined ? {} : { "Content-Type": "application/json" },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      return { status: response.status, body: await response.json() };
    }

    try {
      const department = await post("/api/v1/programs/departments", {
        code: `E2E_T05M_${value}`,
        name: `E2E_T05M Management ${value}`,
        lifecycle: "Active",
      });
      if (department.status !== 201) {
        throw new Error(
          `department fixture returned HTTP ${department.status}`
        );
      }
      fixture.departmentId = (
        department.body as {
          data: { department: { department_id: string } };
        }
      ).data.department.department_id;
      for (const moduleKey of ["program_catalog", "events", "enrollment"]) {
        const module = await post(
          `/api/v1/programs/departments/${fixture.departmentId}/modules/${moduleKey}/enable`
        );
        if (module.status !== 200) {
          throw new Error(
            `${moduleKey} fixture returned HTTP ${module.status}`
          );
        }
      }
      const program = await post(
        `/api/v1/programs/departments/${fixture.departmentId}/programs`,
        {
          name: fixture.programName,
          description: fixture.description,
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
      fixture.programId = (
        program.body as { data: { program: { program_id: string } } }
      ).data.program.program_id;
      return { ok: true, fixture };
    } catch (error) {
      return {
        ok: false,
        fixture,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, suffix)) as FixtureSetupResult;
  if (!result.ok) {
    try {
      await archivePartialFixture(page, result.fixture);
    } catch (cleanupError) {
      throw new Error(
        `${result.error}; fixture cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        { cause: cleanupError }
      );
    }
    throw new Error(result.error);
  }
  return result.fixture;
}

async function archivePartialFixture(
  page: Page,
  fixture: Fixture
): Promise<void> {
  if (fixture.departmentId === "") {
    return;
  }
  await page.evaluate(async (currentFixture) => {
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
    let programId = currentFixture.programId;
    if (programId === "") {
      await attempt("Program lookup", async () => {
        const response = await fetch(
          `/api/v1/programs/departments/${encodeURIComponent(currentFixture.departmentId)}/programs`
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const body = (await response.json()) as {
          data?: {
            programs?: Array<{ program_id?: string; name?: string }>;
          };
        };
        const match = body.data?.programs?.find(
          (program) =>
            program.name === currentFixture.programName && program.program_id
        );
        if (!match?.program_id) {
          throw new Error("created Program was not found by its unique name");
        }
        programId = match.program_id;
      });
    }
    if (programId !== "") {
      await attempt("Program archive", async () => {
        const response = await fetch(
          `/api/v1/programs/${encodeURIComponent(programId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lifecycle: "Archived" }),
          }
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
      });
    }
    await attempt("Department archive", async () => {
      const response = await fetch(
        `/api/v1/programs/departments/${encodeURIComponent(currentFixture.departmentId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lifecycle: "Archived" }),
        }
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    });
    if (failures.length > 0) {
      throw new Error(failures.join("; "));
    }
  }, fixture);
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

test.describe("T12 management Programs tracer", () => {
  test("admin opens a scoped Program, saves management data, and reads it back", async ({
    page,
  }) => {
    await loginAs(page);
    let fixture: Fixture | null = null;
    try {
      fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
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
      expect(accessBody.data.hasManagementCapability).toBe(true);
      const managementEntry = page.getByRole("link", {
        name: COPY.enterManagement,
        exact: true,
      });
      await expect(managementEntry).toBeVisible();
      await managementEntry.click();
      await expect(page).toHaveURL(/\/programs\?mode=management$/u);
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
      if (fixture !== null) {
        await restoreFixture(page, fixture);
      }
    }
  });
});
