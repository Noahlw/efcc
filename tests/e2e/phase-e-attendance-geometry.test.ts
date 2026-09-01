/* oxlint-disable vitest/prefer-importing-vitest-globals -- this is a Playwright suite. */
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { DEV_ADMIN, DEV_MEMBER } from "./dev-fixtures";

const targetUrl =
  process.env.PHASE_E_TARGET_URL ??
  process.env.PROGRAMS_TARGET_URL ??
  "http://127.0.0.1:8787";
const parsedTarget = new URL(targetUrl);
const targetPath = parsedTarget.pathname.replace(/\/$/u, "");
const localTarget = ["localhost", "127.0.0.1"].includes(parsedTarget.hostname);

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is required for attendance geometry evidence`);
  }
  return value;
}

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
const eventId = required("PHASE_E_EVENT_ID", process.env.PHASE_E_EVENT_ID);

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
    const root = document.documentElement;
    const elements = [
      ...document.querySelectorAll<HTMLElement>(
        "a,button,input,select,textarea"
      ),
    ].filter((element) => {
      const style = getComputedStyle(element);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        element.getClientRects().length > 0 &&
        element.getAttribute("aria-hidden") !== "true"
      );
    });
    const rects = elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName,
        width: rect.width,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        label:
          element.getAttribute("aria-label") ??
          element.textContent?.trim() ??
          "",
      };
    });
    const final = rects.at(-1);
    const pageStyle = getComputedStyle(document.body);
    const dock = document.querySelector(
      "[data-shell-bottom-nav], nav[aria-label]"
    );
    const dockRect = dock?.getBoundingClientRect();
    return {
      overflow: root.scrollWidth > root.clientWidth + 1,
      undersized: rects.filter((item) => item.width < 44 || item.height < 44),
      finalReachable:
        !final ||
        final.bottom <= Math.max(window.innerHeight, root.scrollHeight) + 1,
      safeAreaPadding: pageStyle.paddingBottom,
      dockClearance: !dockRect || !final || final.bottom <= dockRect.top + 1,
    };
  });
  expect(result.overflow).toBe(false);
  expect(result.undersized, JSON.stringify(result.undersized)).toHaveLength(0);
  expect(result.finalReachable).toBe(true);
  expect(result.safeAreaPadding).toBeTruthy();
  expect(result.dockClearance).toBe(true);
}

test.describe("Phase E Attendance Geometry (E-491-05)", () => {
  test("Guest page contains long CJK/unbroken content and all controls", async ({
    page,
  }) => {
    await page.goto(appPath("/guest-check-in"));
    await page.waitForSelector("form");
    await page.evaluate(() => {
      const node = document.createElement("p");
      node.dataset.geometryLongContent = "true";
      node.className = "min-w-0 whitespace-normal [overflow-wrap:anywhere]";
      node.textContent = "超長中文內容與unbroken-content-".repeat(24);
      document.querySelector("form")?.append(node);
    });
    await assertAttendanceGeometry(page);
    const long = page.locator('[data-geometry-long-content="true"]');
    expect(await long.evaluate((node) => node.scrollWidth)).toBeLessThanOrEqual(
      await long.evaluate((node) => node.clientWidth + 1)
    );
  });

  test("Self scanner has explicit 799/800 transition and short-height clearance", async ({
    page,
  }) => {
    await loginAs(
      page,
      required("PROGRAMS_MEMBER_USERNAME", memberUsername),
      required("PROGRAMS_MEMBER_CREDENTIAL", memberCredential)
    );
    await page.goto(appPath("/scanner"));
    await assertAttendanceGeometry(page);
    const width = page.viewportSize()?.width ?? 0;
    if (width >= 800) {
      await expect(
        page.locator('[data-scanner-state="desktop-manual"]')
      ).toBeVisible();
    } else {
      await expect(
        page.locator('[data-testid="scanner-camera-stage"]')
      ).toBeVisible();
    }
    const stage = page.locator('[data-testid="scanner-camera-stage"]');
    if (await stage.count()) {
      const box = await stage.boundingBox();
      const bottom = box ? box.y + box.height : 0;
      expect(bottom).toBeLessThanOrEqual(
        (page.viewportSize()?.height ?? 0) + 1
      );
    }
  });

  test("Assisted scanner operator geometry is contained", async ({ page }) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", adminUsername),
      required("PROGRAMS_ADMIN_CREDENTIAL", adminCredential)
    );
    await page.goto(appPath("/scanner?mode=assisted"));
    await assertAttendanceGeometry(page);
  });

  test("Events operator roster print sheet hides screen chrome", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "print-media");
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", adminUsername),
      required("PROGRAMS_ADMIN_CREDENTIAL", adminCredential)
    );
    await page.goto(appPath(`/events?eventId=${encodeURIComponent(eventId)}`));
    await page.waitForSelector('[aria-label="列印簽到表"]');
    await page.emulateMedia({ media: "print" });
    await expect(page.locator('[aria-label="列印簽到表"]')).toBeVisible();
    for (const element of await page.locator(".print\\:hidden").all()) {
      await expect(element).toBeHidden();
    }
    await assertAttendanceGeometry(page);
  });
});
