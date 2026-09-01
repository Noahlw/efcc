/* oxlint-disable vitest/prefer-importing-vitest-globals -- this is a Playwright suite. */
import { expect, test } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";

import { DEV_ADMIN, DEV_MEMBER } from "./dev-fixtures";
import { attachNumericEvidence } from "./numeric-evidence";

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
async function firstEventId(page: Page): Promise<string> {
  const payload = (await page.evaluate(async () => {
    const response = await fetch("/api/v1/attendance/scanner-events");
    return response.json();
  })) as { data?: { events?: { event_id?: string }[] } };
  return required("PHASE_E_EVENT_ID", payload.data?.events?.[0]?.event_id);
}
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

async function assertAttendanceGeometry(
  page: Page,
  options: { finalSelector: string; requireShell?: boolean },
  testInfo?: TestInfo
): Promise<void> {
  const result = await page.evaluate(({ finalSelector }) => {
    const root = document.documentElement;
    const elements = [
      ...document.querySelectorAll<HTMLElement>(
        "a,button,input,select,textarea"
      ),
    ].filter((element) => {
      const style = getComputedStyle(element);
      return (
        element.getAttribute("aria-hidden") !== "true" &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        element.getClientRects().length > 0
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
        label:
          element.getAttribute("aria-label") ??
          element.textContent?.trim() ??
          "",
      };
    });
    const finalElement = document.querySelector<HTMLElement>(finalSelector);
    const shell = document.querySelector<HTMLElement>("#shell-content");
    const dock = document.querySelector<HTMLElement>("#main-navigation");
    const shellPaddingBottom = shell
      ? getComputedStyle(shell).paddingBottom
      : "";
    if (!finalElement) {
      return {
        overflow: root.scrollWidth > root.clientWidth + 1,
        undersized: rects.filter((item) => item.width < 44 || item.height < 44),
        overflowing: rects.filter(
          (item) => item.left < -1 || item.right > window.innerWidth + 1
        ),
        finalPresent: false,
        finalReachable: false,
        shellPaddingBottom,
        dockClearance: false,
        hasShell: Boolean(shell),
        isPhone: window.innerWidth < 800,
      };
    }
    finalElement.scrollIntoView({ block: "center", inline: "nearest" });
    const finalRect = finalElement.getBoundingClientRect();
    const dockRect = dock?.getBoundingClientRect() ?? null;
    return {
      overflow: root.scrollWidth > root.clientWidth + 1,
      undersized: rects.filter((item) => item.width < 44 || item.height < 44),
      overflowing: rects.filter(
        (item) => item.left < -1 || item.right > window.innerWidth + 1
      ),
      finalPresent: true,
      finalReachable:
        finalRect.top >= -1 && finalRect.bottom <= window.innerHeight + 1,
      shellPaddingBottom,
      dockClearance: !dockRect || finalRect.bottom <= dockRect.top + 1,
      hasShell: Boolean(shell),
      isPhone: window.innerWidth < 800,
    };
  }, options);
  if (testInfo) {
    await attachNumericEvidence(testInfo, "attendance-geometry", result);
  }
  expect(result.overflow).toBe(false);
  expect(result.overflowing, JSON.stringify(result.overflowing)).toHaveLength(
    0
  );
  expect(result.undersized, JSON.stringify(result.undersized)).toHaveLength(0);
  expect(result.finalPresent).toBe(true);
  expect(result.finalReachable).toBe(true);
  if (options.requireShell) {
    expect(result.hasShell).toBe(true);
    if (result.isPhone) {
      expect(result.shellPaddingBottom).not.toBe("0px");
      expect(result.dockClearance).toBe(true);
    }
  }
}

test.describe("Phase E Attendance Geometry (E-491-05)", () => {
  test("Guest page contains long CJK/unbroken content and all controls", async ({
    page,
  }, testInfo) => {
    await page.goto(appPath("/guest-check-in"));
    await page.waitForSelector("form");
    await page.evaluate(() => {
      const node = document.createElement("p");
      node.dataset.geometryLongContent = "true";
      node.className = "min-w-0 whitespace-normal [overflow-wrap:anywhere]";
      node.textContent = "超長中文內容與unbroken-content-".repeat(24);
      document.querySelector("form")?.append(node);
    });
    await assertAttendanceGeometry(
      page,
      {
        finalSelector: "button[type='submit']",
      },
      testInfo
    );
    const long = page.locator('[data-geometry-long-content="true"]');
    expect(await long.evaluate((node) => node.scrollWidth)).toBeLessThanOrEqual(
      await long.evaluate((node) => node.clientWidth + 1)
    );
  });

  test("Self scanner has explicit 799/800 transition and short-height clearance", async ({
    page,
  }, testInfo) => {
    await loginAs(
      page,
      required("PROGRAMS_MEMBER_USERNAME", memberUsername),
      required("PROGRAMS_MEMBER_CREDENTIAL", memberCredential)
    );
    await page.goto(appPath("/scanner"));
    const width = page.viewportSize()?.width ?? 0;
    const finalSelector =
      width >= 800
        ? "#attendance-code"
        : "[data-testid='scanner-camera-stage'] button";
    await page.waitForSelector(finalSelector);
    await assertAttendanceGeometry(
      page,
      {
        finalSelector,
        requireShell: true,
      },
      testInfo
    );
    await expect(
      page.locator(
        width >= 800
          ? '[data-scanner-state="desktop-manual"]'
          : '[data-testid="scanner-camera-stage"]'
      )
    ).toBeVisible();
    const stage = page.locator('[data-testid="scanner-camera-stage"]');
    if (await stage.count()) {
      const box = await stage.boundingBox();
      const bottom = box ? box.y + box.height : 0;
      expect(bottom).toBeLessThanOrEqual(
        (page.viewportSize()?.height ?? 0) + 1
      );
    }
  });

  test("Assisted scanner operator geometry is contained", async ({
    page,
  }, testInfo) => {
    await loginAs(
      page,
      required("PROGRAMS_ADMIN_USERNAME", adminUsername),
      required("PROGRAMS_ADMIN_CREDENTIAL", adminCredential)
    );
    const selectedEventId = await firstEventId(page);
    await page.goto(
      appPath(
        `/scanner?mode=assisted&event=${encodeURIComponent(selectedEventId)}`
      )
    );
    await page.waitForSelector("#assisted-event-context");
    await assertAttendanceGeometry(
      page,
      {
        finalSelector: "#assisted-event-context",
        requireShell: true,
      },
      testInfo
    );
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
    const selectedEventId = await firstEventId(page);
    await page.goto(
      appPath(`/events?eventId=${encodeURIComponent(selectedEventId)}`)
    );
    await page.waitForSelector('[aria-label="列印簽到表"]', {
      state: "attached",
    });
    await page.emulateMedia({ media: "print" });
    await expect(page.locator('[aria-label="列印簽到表"]')).toBeVisible();
    for (const element of await page.locator(".print\\:hidden").all()) {
      await expect(element).toBeHidden();
    }
    await assertAttendanceGeometry(
      page,
      {
        finalSelector: "[aria-label='列印簽到表']",
        requireShell: false,
      },
      testInfo
    );
  });
});
