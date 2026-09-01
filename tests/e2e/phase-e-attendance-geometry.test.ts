/* oxlint-disable vitest/prefer-importing-vitest-globals -- this is a Playwright suite. */
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { DEV_ADMIN, DEV_MEMBER } from "./dev-fixtures";

const configuredTarget =
  process.env.PHASE_E_TARGET_URL ?? process.env.PROGRAMS_TARGET_URL;
const localTarget =
  !configuredTarget ||
  ["localhost", "127.0.0.1"].includes(new URL(configuredTarget).hostname);
const targetPath = configuredTarget
  ? new URL(configuredTarget).pathname.replace(/\/$/u, "")
  : "";
const memberUsername =
  process.env.PROGRAMS_MEMBER_USERNAME ??
  (localTarget ? DEV_MEMBER.username : undefined);
const memberCredential =
  process.env.PROGRAMS_MEMBER_CREDENTIAL ??
  (localTarget ? DEV_MEMBER.credential : undefined);
const adminUsername =
  process.env.PROGRAMS_ADMIN_USERNAME ??
  (localTarget ? DEV_ADMIN.username : undefined);
const adminCredential =
  process.env.PROGRAMS_ADMIN_CREDENTIAL ??
  (localTarget ? DEV_ADMIN.credential : undefined);

function appPath(pathname: string): string {
  return `${targetPath}${pathname}` || "/";
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

async function assertAttendanceGeometry(page: Page): Promise<void> {
  const result = await page.evaluate(() => {
    const docWidth = document.documentElement.scrollWidth;
    const winWidth = window.innerWidth;
    const hasHorizontalOverflow = docWidth > winWidth + 1;

    const interactive = [
      ...document.querySelectorAll<HTMLElement>(
        "a, button, input, select, textarea"
      ),
    ]
      .filter(
        (el) =>
          el.getAttribute("aria-hidden") !== "true" && el.offsetParent !== null
      )
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          width: rect.width,
          height: rect.height,
          left: rect.left,
          top: rect.top,
          text: el.textContent?.slice(0, 30) ?? "",
        };
      });

    // Check for undersized primary action controls (buttons, inputs)
    const undersized = interactive.filter(
      (item) =>
        (item.tag === "BUTTON" || item.tag === "INPUT") &&
        (item.width < 40 || item.height < 40)
    );

    return {
      hasHorizontalOverflow,
      docWidth,
      winWidth,
      undersized,
    };
  });

  expect(
    result.hasHorizontalOverflow,
    `Page has horizontal overflow: docWidth=${result.docWidth}, winWidth=${result.winWidth}`
  ).toBe(false);
  expect(
    result.undersized,
    `Interactive controls below minimum touch target size: ${JSON.stringify(result.undersized)}`
  ).toHaveLength(0);
}

test.describe("Phase E Attendance Geometry (E-491-05)", () => {
  test("Guest check-in page satisfies responsive geometry and touch targets", async ({
    page,
  }) => {
    await page.goto(appPath("/guest-check-in"));
    await page.waitForSelector("form");
    await assertAttendanceGeometry(page);
  });

  test("Self check-in scanner satisfies responsive geometry without horizontal overflow", async ({
    page,
  }) => {
    if (memberUsername && memberCredential) {
      await loginAs(page, memberUsername, memberCredential);
    }
    await page.goto(appPath("/scanner"));
    await assertAttendanceGeometry(page);
  });

  test("Assisted scanner mode satisfies responsive geometry for operators", async ({
    page,
  }) => {
    if (adminUsername && adminCredential) {
      await loginAs(page, adminUsername, adminCredential);
    }
    await page.goto(appPath("/scanner?mode=assisted"));
    await assertAttendanceGeometry(page);
  });

  test("Print layout preserves printable roster and hides interactive chrome", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "print-media") {
      test.skip();
    }
    if (adminUsername && adminCredential) {
      await loginAs(page, adminUsername, adminCredential);
    }
    await page.goto(appPath("/scanner?mode=assisted"));
    await page.emulateMedia({ media: "print" });
    await assertAttendanceGeometry(page);
  });
});
