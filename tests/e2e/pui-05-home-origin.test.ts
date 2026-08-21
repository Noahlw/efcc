/* oxlint-disable vitest/prefer-importing-vitest-globals */
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { DEV_ADMIN, DEV_MEMBER } from "./dev-fixtures";
import { resetParticipantEnrollment } from "./participant-enrollment-cleanup";

const ADMIN_USER = process.env.PROGRAMS_ADMIN_USERNAME ?? DEV_ADMIN.username;
const ADMIN_CRED =
  process.env.PROGRAMS_ADMIN_CREDENTIAL ?? DEV_ADMIN.credential;
const MEMBER_USER = process.env.PROGRAMS_MEMBER_USERNAME ?? DEV_MEMBER.username;
const MEMBER_CRED =
  process.env.PROGRAMS_MEMBER_CREDENTIAL ?? DEV_MEMBER.credential;

const COPY = {
  login: "登入",
  pageTitle: "課程與活動",
  detailPurpose: "課程簡介",
  approve: "核准",
  decisionMade: "已處理申請。",
  workspaceTaskParticipants: "參與者",
  requestPendingHint: "申請已送出，等待課程負責人處理。",
  enrollmentActiveHint: "你目前已加入此課程。",
  enroll: "報名",
  reEnroll: "重新報名",
  enrollment: "報名",
  cancelEnrollment: "退出課程",
  cancelConfirmTitle: "退出課程？",
  cancelConfirmAccept: "退出課程",
  withdrawRequest: "取消申請",
  withdrawConfirmTitle: "取消報名申請？",
  withdrawConfirmAccept: "取消申請",
  homeViewEvent: "查看聚會",
  checkInAvailable: "可簽到",
  eventInstructions: "請於簽到時間內前往掃描，確認聚會後完成簽到。",
  backToOrigin: "返回",
};

interface CatalogEntry {
  programs: { program_id: string; name: string }[];
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
}

async function catalogProgramIds(
  page: Page,
  namePrefix: string
): Promise<string[]> {
  const response = await page.evaluate(async () => {
    const catalogResponse = await fetch("/api/v1/programs/catalog");
    return {
      status: catalogResponse.status,
      body: await catalogResponse.json(),
    };
  });
  expect(response.status).toBe(200);
  const body = response.body as { data: { catalog: CatalogEntry[] } };
  return body.data.catalog
    .flatMap((entry) => entry.programs)
    .filter((program) => program.name.startsWith(namePrefix))
    .map((program) => program.program_id);
}

function enrollmentPanelOf(page: Page): Locator {
  return page.getByRole("region", {
    name: new RegExp(`^${COPY.enrollment}$`, "u"),
  });
}

function submitActionButton(panel: Locator) {
  return panel.getByRole("button", {
    name: new RegExp(`^(${COPY.enroll}|${COPY.reEnroll})$`, "u"),
  });
}

async function ensureActiveEnrollment(
  memberPage: Page,
  adminPage: Page,
  programId: string
): Promise<void> {
  await memberPage.goto(`/programs?program=${programId}#overview`);
  const enrollmentPanel = enrollmentPanelOf(memberPage);
  // The enrollment projection loads async; wait for the panel itself
  // before inspecting state, or the .or() below races the fetch.
  await expect(enrollmentPanel).toBeVisible();
  const pendingHint = enrollmentPanel.getByText(COPY.requestPendingHint, {
    exact: true,
  });
  const activeHint = enrollmentPanel.getByText(COPY.enrollmentActiveHint);
  await expect(
    submitActionButton(enrollmentPanel).or(pendingHint).or(activeHint)
  ).toBeVisible({ timeout: 15_000 });
  const needsApproval = !(await activeHint.isVisible().catch(() => false));
  if (needsApproval && !(await pendingHint.isVisible().catch(() => false))) {
    await submitActionButton(enrollmentPanel).click();
    await expect(pendingHint).toBeVisible();
  }
  if (!needsApproval) {
    return;
  }
  await loginAs(adminPage, ADMIN_USER, ADMIN_CRED);
  const memberName = await memberPage.evaluate(async () => {
    const response = await fetch("/api/v1/auth/me");
    if (!response.ok) {
      return "";
    }
    const body = (await response.json()) as {
      data?: { user?: { name?: string } };
    };
    return body.data?.user?.name ?? "";
  });
  expect(memberName).toBeTruthy();
  await adminPage.goto(
    `/programs?mode=management&program=${encodeURIComponent(programId)}&task=participants`
  );
  const requestRow = adminPage
    .getByRole("listitem")
    .filter({ hasText: memberName });
  await requestRow.getByRole("button", { name: COPY.approve }).click();
  await expect(
    adminPage
      .getByRole("region", { name: COPY.workspaceTaskParticipants })
      .getByText(COPY.decisionMade, { exact: true })
  ).toBeVisible({ timeout: 15_000 });
  await memberPage.reload();
  // The approve response must leave an Active enrollment; assert it so a
  // silent Pending (e.g. approval racing the member's reload) fails here
  // instead of downstream at the home card.
  const enrollmentPanelAfter = enrollmentPanelOf(memberPage);
  await expect(
    enrollmentPanelAfter.getByText(COPY.enrollmentActiveHint)
  ).toBeVisible();
}

async function openNextEventCheckInWindow(
  adminPage: Page,
  programId: string
): Promise<string | null> {
  if (adminPage.url() === "about:blank") {
    await loginAs(adminPage, ADMIN_USER, ADMIN_CRED);
  }
  return await adminPage.evaluate(async (targetProgramId) => {
    const origin = window.location.origin;
    const listResponse = await fetch(
      `${origin}/api/v1/programs/${encodeURIComponent(targetProgramId)}/events`
    );
    const listBody = (await listResponse.json()) as {
      data?: {
        events?: {
          event_id: string;
          starts_at: string;
          status: string;
          availability: string;
        }[];
      };
    };
    const nowIso = new Date().toISOString();
    const [nextEvent] = [...(listBody.data?.events ?? [])]
      .filter(
        (event) =>
          event.status === "Active" &&
          event.availability === "Active" &&
          event.starts_at >= nowIso
      )
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    if (!nextEvent) {
      return null;
    }
    const now = Date.now();
    const patchResponse = await fetch(
      `${origin}/api/v1/programs/${encodeURIComponent(targetProgramId)}/events/${encodeURIComponent(nextEvent.event_id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          check_in_window_opens_at: new Date(now - 15 * 60_000).toISOString(),
          check_in_window_closes_at: new Date(now + 45 * 60_000).toISOString(),
        }),
      }
    );
    return patchResponse.ok ? nextEvent.event_id : null;
  }, programId);
}

test.describe("PUI-05 Home origin supplement", () => {
  test("Home next-event card opens event detail with 可簽到 and back-nav", async ({
    page,
    browser,
  }) => {
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    let programId = "";
    try {
      await loginAs(memberPage, MEMBER_USER, MEMBER_CRED);
      programId =
        (await catalogProgramIds(memberPage, "E2E_DEMO_成人查經"))[0] ?? "";
      expect(programId).toBeTruthy();
      await ensureActiveEnrollment(memberPage, page, programId);
      const expectedEventId = await openNextEventCheckInWindow(page, programId);
      expect(expectedEventId).toBeTruthy();

      await memberPage.goto("/home");
      const homeEventCard = memberPage.getByTestId("next-event-card");
      await expect(homeEventCard).toBeVisible({ timeout: 15_000 });
      const eventLink = homeEventCard.getByRole("link", {
        name: COPY.homeViewEvent,
      });
      const eventHref = await eventLink.getAttribute("href");
      expect(eventHref).toMatch(
        new RegExp(
          `/programs\\?program=${encodeURIComponent(programId)}&from=home&event=${encodeURIComponent(expectedEventId ?? "")}$`,
          "u"
        )
      );
      const expectedEventUrl = new URL(
        eventHref ?? "",
        memberPage.url()
      ).toString();
      await eventLink.click();
      await expect(memberPage).toHaveURL(expectedEventUrl);
      await expect(
        memberPage.locator("#participant-event-title")
      ).toBeVisible();
      await expect(memberPage.getByText(COPY.eventInstructions)).toBeVisible();
      await expect(memberPage.getByText(COPY.checkInAvailable)).toBeVisible();
      await memberPage.getByRole("button", { name: COPY.backToOrigin }).click();
      await expect(memberPage).toHaveURL(/\/home$/u);
    } finally {
      try {
        if (programId) {
          await memberPage.goto(`/programs?program=${programId}#overview`);
          await resetParticipantEnrollment(
            memberPage,
            enrollmentPanelOf(memberPage),
            COPY
          );
        }
      } finally {
        await memberContext.close();
      }
    }
  });

  test("Home Explore opens Program Detail and returns Home", async ({
    page,
  }) => {
    await loginAs(page, MEMBER_USER, MEMBER_CRED);
    await page.goto("/home");
    const exploreCard = page.getByTestId("explore-card");
    await expect(exploreCard).toBeVisible({ timeout: 15_000 });
    await expect(exploreCard).toHaveAttribute(
      "href",
      /\/programs\?program=[^&]+&from=home/u
    );
    const exploreHref = await exploreCard.getAttribute("href");
    const exploreProgramId = new URL(
      exploreHref ?? "",
      "http://127.0.0.1"
    ).searchParams.get("program");
    expect(exploreProgramId).toBeTruthy();
    const expectedExploreUrl = new URL(
      exploreHref ?? "",
      page.url()
    ).toString();
    await exploreCard.click();
    await expect(page).toHaveURL(expectedExploreUrl);
    await expect(
      page.getByRole("heading", { name: /E2E_DEMO_/u })
    ).toBeVisible();
    await page.getByRole("button", { name: "課程", exact: true }).click();
    await expect(page).toHaveURL(/\/home$/u);
  });
});
