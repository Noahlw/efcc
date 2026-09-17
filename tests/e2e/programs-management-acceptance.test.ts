import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const ADMIN = {
  username: process.env.PROGRAMS_ADMIN_USERNAME ?? "E2E_admin",
  credential: process.env.PROGRAMS_ADMIN_CREDENTIAL ?? "E2E_admin!dev",
};

const COPY = {
  login: "登入",
  directoryTitle: "管理課程",
  directorySearch: "搜尋可管理課程",
  directoryList: "可管理課程",
  settings: "課程設定",
  settingsBasics: "課程基本資料",
  settingsBasicsHeading: "基本資料",
  settingsBack: "返回設定",
  settingsUnsaved: "有未儲存變更。",
  settingsContinueEditing: "繼續編輯",
  settingsDiscard: "捨棄變更",
  programName: "課程名稱",
  programDescription: "課程簡介",
  saveBasics: "儲存基本資料",
  saved: "課程設定已儲存。",
  workspaceSavedStale:
    "操作已完成，但最新課程資料暫時未能更新。請按「重試更新」確認目前狀態。",
  workspaceRetryRefresh: "重試更新課程工作區",
  workspaceOverview: "概覽",
  workspaceEvents: "聚會",
  workspaceParticipants: "參與者",
  eventFilterPast: "過往",
  eventDetailBack: "返回聚會列表",
  eventCreateCancel: "取消",
  enroll: "報名",
  createMeeting: "建立聚會",
  createMeetingValidation: "請輸入日期、時間及聚會名稱。",
  eventDate: "日期",
  eventTime: "時間",
  eventName: "聚會名稱",
  eventType: "類型",
  eventTypeTraining: "訓練",
  eventCreatedNotice: "聚會已建立。",
  approve: "核准",
  decisionMade: "已處理申請。",
  pendingCount: "待審批",
  activeParticipants: "活躍參與者",
  enterManagement: "進入管理模式",
  enterParticipant: "返回參與者模式",
  participantDirectory: "課程",
  notificationsTitle: "通知",
  notificationsReadError: "通知狀態未能更新，請重試。",
  notificationsRetry: "重試載入通知",
};

interface Fixture {
  departmentId: string;
  programId: string;
  programName: string;
  description: string;
}

async function loginAs(
  page: Page,
  username = ADMIN.username,
  credential = ADMIN.credential
): Promise<void> {
  await page.goto("/");
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[autocomplete="current-password"]').fill(credential);
  await page.getByRole("button", { name: COPY.login }).click();
  await page.waitForURL((url) => url.pathname !== "/");
}

async function chooseSelectOption(
  page: Page,
  label: string,
  option: string
): Promise<void> {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

function localDateValue(date: Date): string {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) =>
      index === 0 ? String(part) : String(part).padStart(2, "0")
    )
    .join("-");
}

async function chooseDate(
  page: Page,
  label: string,
  date: Date
): Promise<void> {
  const value = localDateValue(date);
  await page.getByRole("button", { name: label }).click();
  const day = page.locator(`[data-day="${value}"]`);
  const dayButton = day.getByRole("button");
  await ((await dayButton.count()) > 0 ? dayButton : day).click();
}

async function createFixture(page: Page, suffix: string): Promise<Fixture> {
  const fixture = await page.evaluate(async (value) => {
    async function post(
      path: string,
      data?: unknown,
      method: "POST" | "PATCH" = "POST"
    ) {
      const response = await fetch(path, {
        method,
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
    const programId = (
      program.body as { data: { program: { program_id: string } } }
    ).data.program.program_id;
    const published = await post(
      `/api/v1/programs/${programId}`,
      {
        lifecycle: "Active",
        discoverability: "Listed",
      },
      "PATCH"
    );
    if (published.status !== 200) {
      throw new Error(
        `program fixture publish returned HTTP ${published.status}`
      );
    }
    return {
      departmentId,
      programId,
      programName,
      description,
    };
  }, suffix);
  return fixture as Fixture;
}
async function createEventFixture(
  page: Page,
  fixture: Fixture,
  name: string,
  startsAt: string,
  endsAt: string
): Promise<string> {
  const event = await page.evaluate(
    async ({ programId, name: eventName, startsAt: start, endsAt: end }) => {
      const response = await fetch(
        `/api/v1/programs/${encodeURIComponent(programId)}/events`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            starts_at: start,
            ends_at: end,
            name: eventName,
            event_type: "訓練",
          }),
        }
      );
      const body = (await response.json()) as {
        data?: { event?: { event_id?: string } };
      };
      return {
        status: response.status,
        eventId: body.data?.event?.event_id ?? "",
      };
    },
    {
      programId: fixture.programId,
      name,
      startsAt,
      endsAt,
    }
  );
  if (event.status !== 201 || !event.eventId) {
    throw new Error(
      `event fixture returned HTTP ${event.status} without an event id`
    );
  }
  return event.eventId;
}

async function restoreFixture(page: Page, fixture: Fixture): Promise<void> {
  if (page.isClosed()) {
    return;
  }
  await page.evaluate(async ({ programId, programName, description }) => {
    const response = await fetch(`/api/v1/programs/${programId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: programName,
        description,
        category: "T05",
        lifecycle: "Active",
        discoverability: "Listed",
      }),
    });
    if (!response.ok) {
      throw new Error(
        `management fixture restore returned HTTP ${response.status}`
      );
    }
  }, fixture);
}

test.describe("T05.5 management Browser Acceptance", () => {
  test("cold management load makes one access request", async ({ page }) => {
    await loginAs(page);
    const accessRequests: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "GET" &&
        new URL(request.url()).pathname === "/api/v1/programs/access"
      ) {
        accessRequests.push(request.url());
      }
    });

    await page.goto("/programs?mode=management");
    // oxlint-disable-next-line vitest/prefer-importing-vitest-globals -- Playwright's expect is intentionally used in this browser suite.
    await expect(
      page.getByRole("heading", { name: COPY.directoryTitle })
    ).toBeVisible();
    await expect
      .poll(() => accessRequests.length, { timeout: 5000 })
      .toBeGreaterThan(0);
    await page.waitForTimeout(100);

    expect(accessRequests).toHaveLength(1);
  });

  test("shares a pending Home access prefetch with the Programs route", async ({
    page,
  }) => {
    let releaseAccess!: () => void;
    // The E2E config targets ES2022, so Promise.withResolvers is unavailable.
    // oxlint-disable-next-line promise/avoid-new -- a manually released request gate is required for this race proof
    const accessReleased = new Promise<void>((resolve) => {
      releaseAccess = resolve;
    });
    let accessRequests = 0;
    const accessRoute = "**/api/v1/programs/access";

    await page.route(accessRoute, async (route) => {
      accessRequests += 1;
      if (accessRequests === 1) {
        await accessReleased;
      }
      await route.continue();
    });

    try {
      await loginAs(page);
      await page.goto("/home");
      const programsLink = page.locator('a[href="/programs"]').first();
      await expect(programsLink).toBeVisible();
      await expect.poll(() => accessRequests).toBe(1);

      await programsLink.click();
      await page.waitForURL((url) => url.pathname === "/programs");
      await page.waitForTimeout(100);

      expect(accessRequests).toBe(1);
      releaseAccess();
      await expect(
        page.getByRole("heading", { name: COPY.participantDirectory })
      ).toBeVisible();
    } finally {
      releaseAccess();
      await page.unroute(accessRoute);
    }
  });

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
      await page
        .getByRole("button", { name: new RegExp(COPY.settingsBasics, "u") })
        .click();
      await expect(
        page.getByRole("heading", { name: COPY.settingsBasicsHeading })
      ).toBeVisible();
      const nameInput = page.getByRole("textbox", { name: COPY.programName });
      const descriptionInput = page.getByRole("textbox", {
        name: COPY.programDescription,
      });
      await expect(nameInput).toHaveValue(fixture.programName);
      await expect(descriptionInput).toHaveValue(fixture.description);

      const draftName = `${fixture.programName} Draft`;
      await nameInput.fill(draftName);
      const dirtySettingsUrl = page.url();
      await page.getByRole("link", { name: COPY.enterParticipant }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: COPY.settingsContinueEditing })
        .click();
      await expect(page.getByRole("alertdialog")).not.toBeVisible();
      await expect(page).toHaveURL(dirtySettingsUrl);
      await expect(nameInput).toHaveValue(draftName);
      await expect(
        page.locator('[data-screen-settings-dirty="true"]')
      ).toContainText(COPY.settingsUnsaved);
      await expect(
        page.getByRole("button", { name: COPY.saveBasics })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: COPY.settingsDiscard })
      ).toBeVisible();
      const dirtyActionGeometry = await page.evaluate(() => {
        const action = document.querySelector<HTMLElement>(
          "[data-testid=program-settings-dirty-actions]"
        );
        const form = document.querySelector<HTMLElement>(
          "#program-settings-basics-form"
        );
        const fields = form
          ? [
              ...form.querySelectorAll<HTMLElement>(
                "input, textarea, [role=combobox]"
              ),
            ].filter((field) => {
              const box = field.getBoundingClientRect();
              return box.width > 0 && box.height > 0;
            })
          : [];
        const actionBox = action?.getBoundingClientRect();
        const targets = [
          ...(action?.querySelectorAll<HTMLElement>("button") ?? []),
        ].map((target) => target.getBoundingClientRect());

        return {
          actionTop: actionBox?.top ?? Number.NEGATIVE_INFINITY,
          fieldBottom: Math.max(
            ...fields.map((field) => field.getBoundingClientRect().bottom),
            Number.NEGATIVE_INFINITY
          ),
          minimumTarget: Math.min(
            ...targets.map((box) => Math.min(box.width, box.height))
          ),
          overflow:
            Math.max(
              document.documentElement.scrollWidth,
              document.body.scrollWidth
            ) - window.innerWidth,
          position: action ? getComputedStyle(action).position : null,
          bottom: action ? getComputedStyle(action).bottom : null,
        };
      });
      expect(dirtyActionGeometry.position).toBe("static");
      expect(dirtyActionGeometry.bottom).toBe("auto");
      expect(dirtyActionGeometry.actionTop).toBeGreaterThanOrEqual(
        dirtyActionGeometry.fieldBottom - 1
      );
      expect(dirtyActionGeometry.minimumTarget).toBeGreaterThanOrEqual(44);
      expect(dirtyActionGeometry.overflow).toBeLessThanOrEqual(1);

      await page.getByRole("link", { name: COPY.settingsBack }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: COPY.settingsContinueEditing })
        .click();
      await expect(
        page.getByRole("heading", { name: COPY.settingsBasicsHeading })
      ).toBeVisible();
      await expect(nameInput).toHaveValue(draftName);

      await page.getByRole("link", { name: COPY.workspaceOverview }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: COPY.settingsContinueEditing })
        .click();
      await expect(nameInput).toHaveValue(draftName);
      await expect(
        page.locator('[data-screen-settings-dirty="true"]')
      ).toContainText(COPY.settingsUnsaved);
      await expect(
        page.getByRole("button", { name: COPY.settingsDiscard })
      ).toBeVisible();

      await page.getByRole("button", { name: COPY.settingsDiscard }).click();
      await expect(nameInput).toHaveValue(fixture.programName);
      await expect(
        page.locator('[data-screen-settings-dirty="true"]')
      ).toHaveCount(0);
      await page.getByRole("link", { name: COPY.settingsBack }).click();
      await expect(
        page.getByRole("heading", { name: COPY.settings })
      ).toBeVisible();

      await page
        .getByRole("button", { name: new RegExp(COPY.settingsBasics, "u") })
        .click();
      await page.getByRole("link", { name: COPY.settingsBack }).click();
      await expect(
        page.getByRole("heading", { name: COPY.settings })
      ).toBeVisible();

      await page
        .getByRole("button", { name: new RegExp(COPY.settingsBasics, "u") })
        .click();
      await expect(nameInput).toHaveValue(fixture.programName);

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

      // R42/AC41: the saved authoritative Program is visible in Overview
      // without a full-page reload or remount from the old directory props.
      await page.getByRole("link", { name: COPY.workspaceOverview }).click();
      await expect(page).toHaveURL(
        new RegExp(
          `/programs\\?mode=management&program=${fixture.programId}$`,
          "u"
        )
      );
      await expect(
        page.getByRole("heading", { name: updatedName, exact: true })
      ).toBeVisible();

      await page.reload();
      await page.goto(
        `/programs?mode=management&program=${fixture.programId}&task=settings`
      );
      await page
        .getByRole("button", { name: new RegExp(COPY.settingsBasics, "u") })
        .click();
      await expect(
        page.getByRole("textbox", { name: COPY.programName })
      ).toHaveValue(updatedName);
      await expect(
        page.getByRole("textbox", { name: COPY.programDescription })
      ).toHaveValue(updatedDescription);

      await page.goto(
        `/programs?mode=management&program=${fixture.programId}&task=settings`
      );
      await expect(
        page.getByRole("heading", { name: COPY.settings })
      ).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 480));
      await page.getByRole("link", { name: COPY.enterParticipant }).click();
      await expect(page).toHaveURL(/\/programs$/u);
      await expect(
        page.getByRole("heading", {
          name: COPY.participantDirectory,
          exact: true,
        })
      ).toBeVisible();

      await page.evaluate(() => window.scrollTo(0, 480));
      await page.getByRole("link", { name: COPY.enterManagement }).click();
      await expect(page).toHaveURL(/\/programs\?mode=management$/u);
      await expect(
        page.getByRole("heading", { name: COPY.directoryTitle, exact: true })
      ).toBeVisible();
    } finally {
      await restoreFixture(page, fixture);
    }
  });

  test("keeps a successful Settings write distinct from a failed workspace readback", async ({
    page,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    const managementRoute = `**/api/v1/programs/${fixture.programId}/management`;
    let managementReads = 0;
    try {
      await page.goto(
        `/programs?mode=management&program=${fixture.programId}&task=settings`
      );
      await expect(
        page.getByRole("heading", { name: COPY.settings })
      ).toBeVisible();
      await page
        .getByRole("button", { name: new RegExp(COPY.settingsBasics, "u") })
        .click();
      const nameInput = page.getByRole("textbox", { name: COPY.programName });
      await expect(nameInput).toHaveValue(fixture.programName);

      await page.route(managementRoute, async (route) => {
        if (route.request().method() !== "GET") {
          await route.continue();
          return;
        }
        managementReads += 1;
        if (managementReads === 1) {
          await route.fulfill({
            status: 503,
            contentType: "application/problem+json",
            body: JSON.stringify({
              status: 503,
              code: "UNAVAILABLE",
              title: "Unavailable",
              detail: "測試中的 workspace readback failure",
            }),
          });
          return;
        }
        await route.continue();
      });

      const updatedName = `${fixture.programName} Readback`;
      await nameInput.fill(updatedName);
      await page.getByRole("button", { name: COPY.saveBasics }).click();
      await expect(
        page.getByText(COPY.saved, { exact: true }).first()
      ).toBeVisible();
      await expect(
        page
          .getByTestId("program-workspace-freshness")
          .getByText(COPY.workspaceSavedStale)
      ).toBeVisible();
      await expect(
        page
          .getByTestId("program-workspace-freshness")
          .getByRole("button", { name: COPY.workspaceRetryRefresh })
      ).toBeVisible();
      expect(managementReads).toBe(1);

      await page
        .getByTestId("program-workspace-freshness")
        .getByRole("button", { name: COPY.workspaceRetryRefresh })
        .click();
      await expect(page.getByTestId("program-workspace-freshness")).toHaveCount(
        0
      );
      await expect(nameInput).toHaveValue(updatedName);
      expect(managementReads).toBe(2);
    } finally {
      await page.unroute(managementRoute).catch(() => {});
      await restoreFixture(page, fixture);
    }
  });

  test("consumes one-shot Event create intent and keeps Cancel closed", async ({
    page,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    try {
      await page.goto(
        `/programs?mode=management&program=${encodeURIComponent(fixture.programId)}&task=events#create-event`
      );
      const createForm = page.getByRole("form", { name: COPY.createMeeting });
      await expect(createForm).toBeVisible();
      await expect.poll(() => new URL(page.url()).hash).toBe("");

      await createForm
        .getByRole("button", { name: COPY.eventCreateCancel })
        .click();
      await expect(createForm).toHaveCount(0);

      const headerCreate = page.getByRole("button", {
        name: COPY.createMeeting,
        exact: true,
      });
      await expect(headerCreate).toHaveCount(1);
      await expect(headerCreate).not.toHaveAttribute("aria-expanded");
      await expect(headerCreate).not.toHaveAttribute("aria-pressed");
      await headerCreate.click();
      await expect(createForm).toBeVisible();
      await createForm
        .getByRole("button", { name: COPY.eventCreateCancel })
        .click();
      await expect(createForm).toHaveCount(0);

      await page.reload();
      await expect(
        page.getByRole("form", { name: COPY.createMeeting })
      ).toHaveCount(0);
    } finally {
      await restoreFixture(page, fixture);
    }
  });

  test("restores the Events filter and list position after browser Back from a focused Event", async ({
    page,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    const eventName = `E2E_626_Past Event ${fixture.programId.slice(-8)}`;
    const startsAt = new Date(Date.now() - 2 * 24 * 60 * 60_000);
    let eventId = "";
    try {
      eventId = await createEventFixture(
        page,
        fixture,
        eventName,
        startsAt.toISOString(),
        new Date(startsAt.getTime() + 60 * 60_000).toISOString()
      );
      // Enough rows that the past list overflows the phone viewport, so the
      // restored shell position is a real assertion rather than a no-op.
      for (let index = 1; index <= 12; index += 1) {
        const fillerStart = new Date(
          startsAt.getTime() - index * 24 * 60 * 60_000
        );
        await createEventFixture(
          page,
          fixture,
          `E2E_626_Filler ${index} ${fixture.programId.slice(-8)}`,
          fillerStart.toISOString(),
          new Date(fillerStart.getTime() + 60 * 60_000).toISOString()
        );
      }
      await page.goto(
        `/programs?mode=management&program=${encodeURIComponent(fixture.programId)}&task=events`
      );
      await expect(
        page.getByRole("heading", { name: COPY.workspaceEvents, exact: true })
      ).toBeVisible();
      const pastTab = page.getByRole("tab", { name: COPY.eventFilterPast });
      await pastTab.click();
      await expect
        .poll(() => new URL(page.url()).searchParams.get("eventFilter"))
        .toBe("past");
      await expect(pastTab).toHaveAttribute("aria-selected", "true");

      const eventRow = page.locator(`[data-event-id="${eventId}"]`);
      await expect(eventRow).toBeVisible();
      await page.evaluate(() => {
        const scroller = document.getElementById("shell-content");
        scroller?.scrollTo(0, scroller.scrollHeight);
      });
      const scrolledTo = await page.evaluate(() => {
        const scroller = document.getElementById("shell-content");
        return scroller?.scrollTop ?? 0;
      });
      expect(scrolledTo).toBeGreaterThan(0);

      await eventRow.getByRole("link").first().click();
      await expect
        .poll(() => new URL(page.url()).searchParams.get("event"))
        .toBe(eventId);
      await expect(
        page.getByRole("heading", { name: eventName })
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: COPY.eventDetailBack })
      ).toBeVisible();

      await page.goBack();
      await expect
        .poll(() => new URL(page.url()).searchParams.get("event"))
        .toBeNull();
      await expect
        .poll(() => new URL(page.url()).searchParams.get("eventFilter"))
        .toBe("past");
      await expect(pastTab).toHaveAttribute("aria-selected", "true");
      await expect(eventRow).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(() => {
            const scroller = document.getElementById("shell-content");
            return scroller?.scrollTop ?? 0;
          })
        )
        .toBe(scrolledTo);
    } finally {
      await restoreFixture(page, fixture);
    }
  });

  test("restores the Participants list position after returning from Overview", async ({
    page,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    try {
      for (let index = 0; index < 14; index += 1) {
        const created = await page.evaluate(async (programId) => {
          const response = await fetch(
            `/api/v1/programs/${encodeURIComponent(programId)}/enrollments`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ member_user_id: "U-E2E-MEMBER" }),
            }
          );
          return {
            status: response.status,
            body: (await response.json()) as {
              data?: { enrollment?: { enrollment_id?: string } };
            },
          };
        }, fixture.programId);
        expect(created.status).toBe(201);
        const enrollmentId = created.body.data?.enrollment?.enrollment_id;
        expect(enrollmentId).toBeTruthy();
        const cancelled = await page.evaluate(
          async ({ programId, enrollmentId }) => {
            const response = await fetch(
              `/api/v1/programs/${encodeURIComponent(programId)}/enrollments/${encodeURIComponent(enrollmentId ?? "")}/cancel`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: "滾動位置測試" }),
              }
            );
            return response.status;
          },
          { programId: fixture.programId, enrollmentId }
        );
        expect(cancelled).toBe(200);
      }

      await page.goto(
        `/programs?mode=management&program=${encodeURIComponent(fixture.programId)}&task=participants&participantTab=history`
      );
      await expect(
        page.getByRole("heading", { name: COPY.workspaceParticipants })
      ).toBeVisible();
      await expect
        .poll(() => page.locator("#participants-history-panel li").count())
        .toBeGreaterThan(10);
      await page.evaluate(() => {
        const scroller = document.getElementById("shell-content");
        scroller?.scrollTo(0, scroller.scrollHeight);
      });
      const scrolledTo = await page.evaluate(
        () => document.getElementById("shell-content")?.scrollTop ?? 0
      );
      expect(scrolledTo).toBeGreaterThan(0);

      await page.getByRole("link", { name: COPY.workspaceOverview }).click();
      await expect(
        page.getByRole("heading", { name: fixture.programName })
      ).toBeVisible();
      await page
        .getByRole("link", { name: COPY.workspaceParticipants })
        .click();
      await expect
        .poll(() => new URL(page.url()).searchParams.get("task"))
        .toBe("participants");
      await expect
        .poll(() =>
          page.evaluate(
            () => document.getElementById("shell-content")?.scrollTop ?? 0
          )
        )
        .toBe(scrolledTo);
    } finally {
      await restoreFixture(page, fixture);
    }
  });

  test("keeps modifier-key notification navigation independent from read failures", async ({
    page,
    browser,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    let linkedPage: Page | null = null;
    const readRoute = "**/api/v1/programs/notifications/read";
    let readAttempts = 0;
    try {
      const memberContext = await browser.newContext();
      try {
        const memberPage = await memberContext.newPage();
        await loginAs(memberPage, "E2E_member", "E2E_member!dev");
        const requestStatus = await memberPage.evaluate(async (programId) => {
          const response = await fetch(
            `/api/v1/programs/${encodeURIComponent(programId)}/enrollment-requests`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            }
          );
          return response.status;
        }, fixture.programId);
        expect([200, 201]).toContain(requestStatus);
      } finally {
        await memberContext.close();
      }

      await page.route(readRoute, async (route) => {
        readAttempts += 1;
        await route.fulfill({
          status: 503,
          contentType: "application/problem+json",
          body: JSON.stringify({
            status: 503,
            code: "UNAVAILABLE",
            title: "Unavailable",
            detail: "測試中的通知讀取失敗",
          }),
        });
      });
      await page.goto("/programs?mode=management&task=notifications");
      await expect(
        page.getByRole("heading", {
          name: COPY.notificationsTitle,
          exact: true,
        })
      ).toBeVisible();
      const notificationLink = page
        .locator(
          `a[href*="program=${encodeURIComponent(fixture.programId)}"][href*="task=participants"]`
        )
        .first();
      await expect(notificationLink).toBeVisible();

      const newTabModifier = process.platform === "darwin" ? "Meta" : "Control";
      const linkedPagePromise = page.context().waitForEvent("page");
      await notificationLink.click({ modifiers: [newTabModifier] });
      linkedPage = await linkedPagePromise;
      await expect
        .poll(() => new URL(linkedPage!.url()).searchParams.get("program"))
        .toBe(fixture.programId);
      await expect
        .poll(() => new URL(linkedPage!.url()).searchParams.get("task"))
        .toBe("participants");
      await expect(
        linkedPage.getByRole("heading", { name: fixture.programName })
      ).toBeVisible();
      await expect.poll(() => readAttempts).toBe(1);
      await expect(
        page.getByText(COPY.notificationsReadError, { exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: COPY.notificationsRetry })
      ).toBeVisible();
    } finally {
      await page.unroute(readRoute).catch(() => {});
      await linkedPage?.close().catch(() => {});
      await restoreFixture(page, fixture);
    }
  });

  test("keeps a normal notification click on the real task while mark-read fails", async ({
    page,
    browser,
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    const readRoute = "**/api/v1/programs/notifications/read";
    let readAttempts = 0;
    try {
      const memberContext = await browser.newContext();
      try {
        const memberPage = await memberContext.newPage();
        await loginAs(memberPage, "E2E_member", "E2E_member!dev");
        const requestStatus = await memberPage.evaluate(async (programId) => {
          const response = await fetch(
            `/api/v1/programs/${encodeURIComponent(programId)}/enrollment-requests`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            }
          );
          return response.status;
        }, fixture.programId);
        expect([200, 201]).toContain(requestStatus);
      } finally {
        await memberContext.close();
      }

      await page.route(readRoute, async (route) => {
        readAttempts += 1;
        await route.fulfill({
          status: 503,
          contentType: "application/problem+json",
          body: JSON.stringify({
            status: 503,
            code: "UNAVAILABLE",
            title: "Unavailable",
            detail: "測試中的通知讀取失敗",
          }),
        });
      });
      await page.goto("/programs?mode=management&task=notifications");
      await expect(
        page.getByRole("heading", {
          name: COPY.notificationsTitle,
          exact: true,
        })
      ).toBeVisible();
      const notificationLink = page
        .locator(
          `a[href*="program=${encodeURIComponent(fixture.programId)}"][href*="task=participants"]`
        )
        .first();
      await expect(notificationLink).toBeVisible();

      await notificationLink.click();

      await expect
        .poll(() => new URL(page.url()).searchParams.get("task"))
        .toBe("participants");
      await expect
        .poll(() => new URL(page.url()).searchParams.get("program"))
        .toBe(fixture.programId);
      await expect.poll(() => readAttempts).toBe(1);
      await expect(
        page.getByRole("heading", { name: fixture.programName })
      ).toBeVisible();
    } finally {
      await page.unroute(readRoute).catch(() => {});
      await restoreFixture(page, fixture);
    }
  });

  test("settings, Event, and Enrollment mutations converge in Overview without reload", async ({
    page,
  }: {
    page: Page;
  }) => {
    await loginAs(page);
    const fixture = await createFixture(page, crypto.randomUUID().slice(0, 8));
    let eventId = "";
    try {
      await page.context().clearCookies();
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await loginAs(page, "E2E_member", "E2E_member!dev");
      await page.goto(`/programs?program=${fixture.programId}`);
      await page.getByRole("button", { name: COPY.enroll }).click();
      await expect(
        page.getByText("報名申請已提交", { exact: true })
      ).toBeVisible();

      await page.context().clearCookies();
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await loginAs(page);
      await page.goto(`/programs?mode=management&program=${fixture.programId}`);
      await expect(
        page.getByRole("heading", { name: fixture.programName })
      ).toBeVisible();

      await page
        .getByRole("link", { name: COPY.workspaceEvents, exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: COPY.workspaceEvents, exact: true })
      ).toBeVisible();
      await page
        .getByRole("button", { name: COPY.createMeeting })
        .first()
        .click();
      const createForm = page.getByRole("form", {
        name: COPY.createMeeting,
      });
      await chooseDate(
        page,
        COPY.eventDate,
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      );
      await createForm.locator("#programs-event-time").fill("10:00");
      await createForm
        .getByLabel(COPY.eventName)
        .fill("E2E_622_Overview Event");
      await chooseSelectOption(page, COPY.eventType, COPY.eventTypeTraining);
      await createForm
        .getByRole("button", { name: COPY.createMeeting })
        .click();
      await expect(
        page.getByRole("heading", { name: "E2E_622_Overview Event" })
      ).toBeVisible({ timeout: 15_000 });
      eventId = new URL(page.url()).searchParams.get("event") ?? "";
      expect(eventId).toBeTruthy();

      await page.getByRole("link", { name: COPY.workspaceOverview }).click();
      await expect(
        page.getByRole("heading", { name: fixture.programName })
      ).toBeVisible();
      await expect(page.getByText("E2E_622_Overview Event")).toBeVisible();
      await expect(page.getByText(/1 個聚會/u).first()).toBeVisible();

      await page.goto(
        `/programs?mode=management&program=${fixture.programId}&task=participants`
      );
      await expect(
        page.getByRole("heading", { name: COPY.workspaceParticipants })
      ).toBeVisible();
      const pendingRow = page
        .getByRole("listitem")
        .filter({ hasText: "E2E Member" });
      await pendingRow.getByRole("button", { name: COPY.approve }).click();
      await expect(
        page.getByLabel(fixture.programName).getByText(COPY.decisionMade, {
          exact: true,
        })
      ).toBeVisible();

      await page.getByRole("link", { name: COPY.workspaceOverview }).click();
      await expect(
        page.getByText(COPY.pendingCount, { exact: true }).locator("..")
      ).toContainText("0");
      await expect(
        page.getByText(COPY.activeParticipants, { exact: true }).locator("..")
      ).toContainText("1");
    } finally {
      if (!page.isClosed()) {
        await page.evaluate(
          async ({ programId, eventId }) => {
            const enrollmentsResponse = await fetch(
              `/api/v1/programs/${encodeURIComponent(programId)}/enrollments`
            );
            const enrollmentsBody = (await enrollmentsResponse.json()) as {
              data?: {
                enrollments?: {
                  enrollment_id: string;
                  member_user_id: string;
                  status: string;
                }[];
              };
            };
            const active = enrollmentsBody.data?.enrollments?.find(
              (item) =>
                item.member_user_id === "U-E2E-MEMBER" &&
                item.status === "Active"
            );
            if (active) {
              await fetch(
                `/api/v1/programs/${encodeURIComponent(programId)}/enrollments/${encodeURIComponent(active.enrollment_id)}/cancel`,
                { method: "POST", body: "{}" }
              );
            }
            if (eventId) {
              await fetch(
                `/api/v1/programs/${encodeURIComponent(programId)}/events/${encodeURIComponent(eventId)}`,
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    status: "Cancelled",
                    cancel_reason: "測試清理",
                  }),
                }
              );
            }
          },
          { programId: fixture.programId, eventId }
        );
        await restoreFixture(page, fixture);
      }
    }
  });
});
