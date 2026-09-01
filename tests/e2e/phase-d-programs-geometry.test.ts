/* oxlint-disable vitest/prefer-importing-vitest-globals -- this is a Playwright suite. */
import { expect, test } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";

import { DEV_ADMIN, DEV_MEMBER } from "./dev-fixtures";
import { attachNumericEvidence } from "./numeric-evidence";

const configuredTarget = process.env.PROGRAMS_TARGET_URL;
const localTarget =
  !configuredTarget ||
  ["localhost", "127.0.0.1"].includes(new URL(configuredTarget).hostname);
const targetPath = configuredTarget
  ? new URL(configuredTarget).pathname.replace(/\/$/u, "")
  : "";
const adminUsername =
  process.env.PROGRAMS_ADMIN_USERNAME ??
  (localTarget ? DEV_ADMIN.username : undefined);
const adminCredential =
  process.env.PROGRAMS_ADMIN_CREDENTIAL ??
  (localTarget ? DEV_ADMIN.credential : undefined);
const memberUsername =
  process.env.PROGRAMS_MEMBER_USERNAME ??
  (localTarget ? DEV_MEMBER.username : undefined);
const memberCredential =
  process.env.PROGRAMS_MEMBER_CREDENTIAL ??
  (localTarget ? DEV_MEMBER.credential : undefined);

function appPath(pathname: string): string {
  return `${targetPath}${pathname}` || "/";
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
  credential: string
): Promise<void> {
  await page.goto(appPath("/"));
  await page.getByLabel("用戶名稱").fill(username);
  await page.getByLabel("密碼").fill(credential);
  await page.getByRole("button", { name: "登入" }).click();
  await page.waitForURL((url) => url.pathname !== appPath("/"));
}

async function assertProgramsGeometry(
  page: Page,
  expectedFocusSelector?: string,
  testInfo?: TestInfo
): Promise<void> {
  const geometry = await page.evaluate((focusSelector) => {
    const box = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const interactive = [
      ...document.querySelectorAll<HTMLElement>(
        "a, button, input, select, textarea"
      ),
    ]
      .filter((element) => element.getAttribute("aria-hidden") !== "true")
      .map((element) => ({ element, rect: box(element) }))
      .filter(({ rect }) => rect !== null && rect.width > 0 && rect.height > 0)
      .map(({ element, rect }) => ({
        tag: element.tagName.toLowerCase(),
        text: element.textContent?.trim() ?? "",
        rect,
      }));
    const focusedElement = document.activeElement;
    const navigationElement =
      document.querySelector<HTMLElement>("#main-navigation");
    const shellContent = document.querySelector<HTMLElement>("#shell-content");
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      overflow:
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth
        ) - window.innerWidth,
      interactive,
      focused: box(focusedElement),
      focusedIsDocument:
        focusedElement === document.body ||
        focusedElement === document.documentElement,
      focusedInNavigation:
        focusedElement instanceof Node &&
        navigationElement?.contains(focusedElement) === true,
      focusedMatches:
        focusSelector === undefined
          ? null
          : (focusedElement?.matches(focusSelector) ?? false),
      navigation: box(navigationElement),
      navigationPosition: navigationElement
        ? getComputedStyle(navigationElement).position
        : null,
      shellContentClientWidth: shellContent?.clientWidth ?? null,
      shellContentScrollWidth: shellContent?.scrollWidth ?? null,
      contentPaddingBottom: shellContent
        ? getComputedStyle(shellContent).paddingBottom
        : null,
    };
  }, expectedFocusSelector);

  if (testInfo) {
    await attachNumericEvidence(testInfo, "programs-geometry", geometry);
  }

  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(geometry.shellContentClientWidth).not.toBeNull();
  expect(geometry.shellContentScrollWidth).not.toBeNull();
  expect(geometry.shellContentScrollWidth).toBeLessThanOrEqual(
    (geometry.shellContentClientWidth ?? 0) + 1
  );
  for (const control of geometry.interactive) {
    expect(
      control.rect?.width ?? 0,
      `${control.tag} ${control.text}`
    ).toBeGreaterThanOrEqual(44);
    expect(
      control.rect?.height ?? 0,
      `${control.tag} ${control.text}`
    ).toBeGreaterThanOrEqual(44);
  }
  expect(geometry.navigation).not.toBeNull();
  expect(geometry.focused).not.toBeNull();
  expect(geometry.focused?.left).toBeGreaterThanOrEqual(0);
  expect(geometry.focused?.right).toBeLessThanOrEqual(
    geometry.viewportWidth + 1
  );
  expect(geometry.focused?.top).toBeGreaterThanOrEqual(0);
  expect(geometry.focused?.bottom).toBeLessThanOrEqual(
    geometry.viewportHeight + 1
  );
  if (expectedFocusSelector !== undefined) {
    expect(
      geometry.focusedMatches,
      `expected focus: ${expectedFocusSelector}`
    ).toBe(true);
  }
  if (geometry.viewportWidth < 800) {
    expect(geometry.navigationPosition).toBe("fixed");
    expect(geometry.contentPaddingBottom).toMatch(/84px/);
    if (
      !geometry.focusedIsDocument &&
      !geometry.focusedInNavigation &&
      geometry.focused &&
      geometry.navigation
    ) {
      expect(geometry.focused.bottom).toBeLessThanOrEqual(
        geometry.navigation.top + 1
      );
    }
  } else {
    expect(geometry.navigationPosition).toBe("sticky");
  }
}

test.beforeAll(() => {
  for (const [name, value] of [
    ["PROGRAMS_ADMIN_USERNAME", adminUsername],
    ["PROGRAMS_ADMIN_CREDENTIAL", adminCredential],
    ["PROGRAMS_MEMBER_USERNAME", memberUsername],
    ["PROGRAMS_MEMBER_CREDENTIAL", memberCredential],
  ] as const) {
    required(name, value);
  }
});

test("participant material states remain contained", async ({
  page,
}, testInfo) => {
  await loginAs(
    page,
    required("PROGRAMS_MEMBER_USERNAME", memberUsername),
    required("PROGRAMS_MEMBER_CREDENTIAL", memberCredential)
  );
  await page.goto(appPath("/programs"));
  await expect(page.getByRole("heading", { name: "課程" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "搜尋課程" })).toBeVisible();
  await assertProgramsGeometry(page, undefined, testInfo);

  const programLink = page.getByRole("link", { name: /E2E_DEMO_/u }).first();
  await expect(programLink).toBeVisible();
  await programLink.click();
  await expect(page).toHaveURL(/\/programs\?program=/u);
  await expect(page.locator("#program-detail-title")).toBeVisible();
  await expect(
    page
      .locator("#shell-content")
      .getByRole("link", { name: "課程", exact: true })
  ).toHaveAttribute("href", /\/programs/u);
  const eventList = page.getByRole("list", { name: "即將舉行" });
  await expect(eventList.getByRole("listitem")).toHaveCount(
    (page.viewportSize()?.width ?? 0) < 800 ? 4 : 8
  );
  await assertProgramsGeometry(page, "#program-detail-title", testInfo);

  let mutatedProgramId: string | null = null;
  try {
    await page.context().clearCookies();
    await page.goto(appPath("/"));
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", adminUsername),
      required("PROGRAMS_ADMIN_CREDENTIAL", adminCredential)
    );
    const departmentId = await page.evaluate(async () => {
      const response = await fetch("/api/v1/programs/catalog");
      const body = (await response.json()) as {
        data?: { catalog?: { department?: { department_id?: string } }[] };
      };
      return body.data?.catalog?.[0]?.department?.department_id;
    });
    const id = required("participant dialog department id", departmentId);
    const programName = `E2E_GEOMETRY_${Date.now()}`;
    const created = await page.evaluate(
      async ({ departmentId: targetDepartmentId, name }) => {
        const response = await fetch(
          `/api/v1/programs/departments/${encodeURIComponent(targetDepartmentId)}/programs`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              description: "Phase D geometry fixture",
              category: "Phase D",
              behavior_type: "OneOff",
              lifecycle: "Active",
              discoverability: "Listed",
              enrollment_mode: "MemberRequest",
              display_order: 0,
            }),
          }
        );
        const body = (await response.json()) as {
          data?: { program?: { program_id?: string } };
        };
        return {
          id: body.data?.program?.program_id,
          status: response.status,
        };
      },
      { departmentId: id, name: programName }
    );
    expect(created.status).toBe(201);
    const programId = required("participant dialog program id", created.id);
    mutatedProgramId = programId;
    const enrollmentStatus = await page.evaluate(async (targetId) => {
      const response = await fetch(
        `/api/v1/programs/${encodeURIComponent(targetId)}/enrollments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": `phase-d-geometry-${Date.now()}`,
          },
          body: JSON.stringify({ member_user_id: "U-E2E-MEMBER" }),
        }
      );
      return response.status;
    }, programId);
    expect(enrollmentStatus).toBe(201);

    await page.context().clearCookies();
    await page.goto(appPath("/"));
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await loginAs(
      page,
      required("PROGRAMS_MEMBER_USERNAME", memberUsername),
      required("PROGRAMS_MEMBER_CREDENTIAL", memberCredential)
    );
    await page.goto(
      appPath(`/programs?program=${encodeURIComponent(programId)}#overview`)
    );
    await expect(page.locator("#program-detail-title")).toBeVisible();
    const enrollment = page.locator("[data-enrollment-panel]");
    const cancel = enrollment.getByRole("button", {
      name: "退出課程",
      exact: true,
    });
    await expect(cancel).toBeVisible();
    await cancel.click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(300);
    await assertProgramsGeometry(page, '[role="alertdialog"] button', testInfo);
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  } finally {
    if (mutatedProgramId) {
      await page.context().clearCookies();
      await page.goto(appPath("/"));
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await loginAs(
        page,
        required("PROGRAMS_ADMIN_USERNAME", adminUsername),
        required("PROGRAMS_ADMIN_CREDENTIAL", adminCredential)
      );
      const cleanup = await page.evaluate(async (targetId) => {
        const enrollmentsResponse = await fetch(
          `/api/v1/programs/${encodeURIComponent(targetId)}/enrollments`
        );
        const body = (await enrollmentsResponse.json()) as {
          data?: {
            enrollments?: {
              enrollment_id?: string;
              member_user_id?: string;
              status?: string;
            }[];
          };
        };
        const active = body.data?.enrollments?.find(
          (item) =>
            item.member_user_id === "U-E2E-MEMBER" &&
            item.status === "Active" &&
            item.enrollment_id
        );
        let cancelStatus: number | null = null;
        if (active?.enrollment_id) {
          const response = await fetch(
            `/api/v1/programs/${encodeURIComponent(targetId)}/enrollments/${encodeURIComponent(active.enrollment_id)}/cancel`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            }
          );
          cancelStatus = response.status;
        }
        const archiveResponse = await fetch(
          `/api/v1/programs/${encodeURIComponent(targetId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lifecycle: "Archived" }),
          }
        );
        return {
          archiveStatus: archiveResponse.status,
          cancelStatus,
          listStatus: enrollmentsResponse.status,
        };
      }, mutatedProgramId);
      expect(cleanup.listStatus).toBe(200);
      expect(
        cleanup.cancelStatus === null || cleanup.cancelStatus === 200
      ).toBe(true);
      expect(cleanup.archiveStatus).toBe(200);
    }
  }
});

test("participant Event Detail and recovery states remain contained", async ({
  page,
}, testInfo) => {
  await loginAs(
    page,
    required("PROGRAMS_ADMIN_USERNAME", adminUsername),
    required("PROGRAMS_ADMIN_CREDENTIAL", adminCredential)
  );
  await page.goto(appPath("/programs"));
  const programLink = page.getByRole("link", { name: /E2E_DEMO_成人查經/u });
  await expect(programLink).toBeVisible();
  await programLink.click();
  await expect(page.locator("#program-detail-title")).toBeVisible();
  const eventLink = page.getByRole("link", { name: "查看聚會詳情" }).first();
  await expect(eventLink).toBeVisible();
  await eventLink.click();
  await expect(page.locator("#participant-event-title")).toBeVisible();
  await assertProgramsGeometry(page, "#participant-event-title", testInfo);

  const programId = new URL(page.url()).searchParams.get("program");
  if (!programId) {
    throw new Error("participant event geometry fixture has no program id");
  }
  await page.goto(
    appPath(
      `/programs?program=${encodeURIComponent(programId)}&event=E2E-MISSING-EVENT&from=programs`
    )
  );
  await expect(
    page.getByRole("heading", { name: "無法開啟這個聚會" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "重試" })).toBeVisible();
  await assertProgramsGeometry(
    page,
    'section[aria-label="聚會詳情"] h1',
    testInfo
  );
});

test("management directory and workspace remain contained", async ({
  page,
}, testInfo) => {
  await loginAs(
    page,
    required("PROGRAMS_ADMIN_USERNAME", adminUsername),
    required("PROGRAMS_ADMIN_CREDENTIAL", adminCredential)
  );
  await page.goto(appPath("/programs?mode=management"));
  await expect(page.getByRole("heading", { name: "管理模式" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "管理課程目錄" })
  ).toBeVisible();
  await assertProgramsGeometry(page, undefined, testInfo);
  const notificationButton = page.getByRole("button", {
    name: "開啟管理通知",
  });
  await expect(notificationButton).toBeVisible();
  await notificationButton.click();
  await expect(page.getByRole("dialog", { name: "管理通知" })).toBeVisible();
  await assertProgramsGeometry(page, undefined, testInfo);
  await notificationButton.click();

  const programLink = page
    .getByRole("link")
    .filter({ hasText: "E2E_DEMO_成人查經" })
    .first();
  await expect(programLink).toBeVisible();
  await programLink.click();
  await expect(page).toHaveURL(/\/programs\?mode=management&program=/u);
  await expect(
    page.getByRole("heading", { name: "E2E_DEMO_成人查經", exact: true })
  ).toBeVisible();
  await assertProgramsGeometry(page, undefined, testInfo);

  await page
    .getByRole("link", { name: /^聚會/u })
    .first()
    .click();
  await expect(page).toHaveURL(/task=events/u);
  const eventRow = page
    .locator("li[data-event-id]")
    .filter({ hasText: "進行" })
    .first();
  await expect(eventRow).toBeVisible({ timeout: 15_000 });
  const eventDetailLink = eventRow.getByRole("link", {
    name: "詳情",
    exact: true,
  });
  await eventDetailLink.click();
  await expect(page.getByRole("region", { name: "聚會詳情" })).toBeVisible();
  await page.getByRole("button", { name: "編輯聚會資料" }).click();
  await expect(page.locator("form input").first()).toBeFocused();
  await assertProgramsGeometry(page, "form input", testInfo);
  const participantsLink = page.getByRole("link", {
    name: "參與者",
    exact: true,
  });
  await participantsLink.click();
  await expect(page).toHaveURL(/task=participants/u);
  await expect(
    page.getByRole("heading", { name: "參與者", exact: true }).last()
  ).toBeVisible();
  await assertProgramsGeometry(page, undefined, testInfo);

  const settingsLink = page.getByRole("link", {
    name: "課程設定",
    exact: true,
  });
  await settingsLink.click();
  await expect(page).toHaveURL(/task=settings/u);
  await expect(
    page.getByRole("heading", { name: "課程設定", exact: true }).last()
  ).toBeVisible();
  await assertProgramsGeometry(page, undefined, testInfo);

  await page.goto(appPath("/programs?mode=management&task=notifications"));
  await expect(
    page.getByRole("heading", { name: "管理通知", exact: true })
  ).toBeVisible();
  await assertProgramsGeometry(page, undefined, testInfo);
});
