/* oxlint-disable vitest/prefer-importing-vitest-globals --
 * Playwright spec (uses @playwright/test's `test`/`expect`), not a Vitest
 * test file. oxlint's vitest plugin unconditionally matches **\\/*.test.ts.
 */
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { COPY } from "../../web/lib/copy";

const story = (id: string) => `/iframe.html?id=${id}&viewMode=story`;

async function clickAndAssertHref(link: Locator, href: string) {
  await link.evaluate((element) => {
    const anchor = element as HTMLAnchorElement;
    const document = anchor.ownerDocument;
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest("a") !== anchor) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      anchor.dataset.t11ActivatedHref = anchor.getAttribute("href") ?? "";
      document.removeEventListener("click", handleClick, true);
    };
    document.addEventListener("click", handleClick, true);
  });
  // DOM activation keeps the route-target assertion deterministic at the
  // narrowest W7 width, where the compact header status can overlap the icon.
  await link.evaluate((element) => (element as HTMLAnchorElement).click());
  await expect(link).toHaveAttribute("data-t11-activated-href", href);
}

const STORIES = {
  home: "t07-2-public-auth-member-communications--home",
  notices: "t07-2-public-auth-member-communications--notices",
  messages: "t07-2-public-auth-member-communications--messages",
  accountDirectory: "t07-4-management-identity--account-directory",
  programsParticipant: "t07-3-programs--participant-directory",
  programsParticipantDetail: "t07-3-programs--participant-program-detail",
  programsManagement: "t07-3-programs--management-directory",
  scannerBoundary: "t07-5-attendance-scanner-guest--scanner-boundary",
} as const;

const PROGRAMS_BASELINE_STORIES = [
  "t07-3-programs--participant-directory",
  "t07-3-programs--participant-program-detail",
  "t07-3-programs--participant-event-detail",
  "t07-3-programs--management-directory",
  "t07-3-programs--workspace-overview",
  "t07-3-programs--workspace-events",
  "t07-3-programs--workspace-participants",
  "t07-3-programs--workspace-settings",
  "t07-3-programs--workspace-schedule",
  "t07-3-programs--workspace-notifications",
] as const;

const PROGRAMS_R4_MATERIAL_STORIES = [
  "t07-3-programs-material-states--participant-directory-capable",
  "t07-3-programs-material-states--participant-program-detail-eligible",
  "t07-3-programs-material-states--participant-program-detail-active",
  "t07-3-programs-material-states--participant-program-detail-pending",
  "t07-3-programs-material-states--participant-program-detail-rejected",
  "t07-3-programs-material-states--participant-event-detail-closed",
  "t07-3-programs-material-states--participant-event-detail-open",
  "t07-3-programs-material-states--participant-event-detail-ineligible",
  "t07-3-programs-material-states--management-directory-mixed",
] as const;

const PROGRAMS_R5_MATERIAL_STORIES = [
  "t07-3-programs-material-states--workspace-events-mixed",
  "t07-3-programs-material-states--workspace-schedule-focused",
  "t07-3-programs-material-states--workspace-schedule-stale",
  "t07-3-programs-material-states--workspace-schedule-partial-resume",
] as const;

const PROGRAMS_R6_MATERIAL_STORIES = [
  "t07-3-programs-material-states--workspace-settings-dirty",
  "t07-3-programs-material-states--workspace-settings-conflict",
  "t07-3-programs-material-states--notifications-unread",
  "t07-3-programs-material-states--notifications-empty-recoverable",
] as const;

async function expectShellFrame(page: Page) {
  const nav = page.locator("nav#main-navigation");
  const main = page.locator("main#shell-content");
  // Management baselines can finish their MSW-backed first render after the
  // default assertion timeout at the narrowest viewport.
  await expect(main).toHaveCount(1, { timeout: 30_000 });
  await expect(nav).toHaveCount(1, { timeout: 30_000 });
  await expect(nav).toBeVisible();
  await expect(main).toBeVisible();

  const geometry = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const doc = document.documentElement;
    const body = document.body;
    const main = document.querySelector<HTMLElement>("main#shell-content");
    const mainBox = main?.getBoundingClientRect();

    return {
      horizontalOverflow:
        Math.max(doc.scrollWidth, body.scrollWidth) - viewportWidth,
      mainContentOverflow: main
        ? main.scrollWidth - main.clientWidth
        : Number.POSITIVE_INFINITY,
      mainLeft: mainBox?.left ?? Number.NEGATIVE_INFINITY,
      mainRight: mainBox?.right ?? Number.POSITIVE_INFINITY,
      viewportWidth,
      headerHeight:
        document
          .querySelector<HTMLElement>("header[data-shell-header]")
          ?.getBoundingClientRect().height ?? null,
      navHeight:
        document
          .querySelector<HTMLElement>("nav#main-navigation")
          ?.getBoundingClientRect().height ?? null,
    };
  });

  expect(geometry.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(geometry.mainContentOverflow).toBeLessThanOrEqual(1);
  expect(geometry.mainLeft).toBeGreaterThanOrEqual(-1);
  expect(geometry.mainRight).toBeLessThanOrEqual(geometry.viewportWidth + 1);

  const width = Number.parseInt(test.info().project.name.slice(2), 10);
  if (geometry.headerHeight !== null) {
    expect(geometry.headerHeight).toBeGreaterThanOrEqual(56);
  }
  if (width < 800 && geometry.navHeight !== null) {
    expect(geometry.navHeight).toBeGreaterThanOrEqual(72);
  }
  await expect(nav).toHaveCSS("position", width < 800 ? "fixed" : "sticky");
}

async function expectMemberBrand(page: Page) {
  const header = page.locator("header[data-shell-header]");
  await expect(header).toBeVisible();
  await expect(
    header.getByText(COPY.shell.shortMark, { exact: true })
  ).toBeVisible();
}

test("Storybook Home keeps the member shell truthful across W7", async ({
  page,
}) => {
  await page.goto(story(STORIES.home));
  await expectShellFrame(page);
  await expectMemberBrand(page);
});

test("Screen Foundations Playground keeps shared geometry across W7", async ({
  page,
}) => {
  await page.goto(story("foundations--screen-foundations-playground"));

  const frame = page.locator('[data-screen-foundation="page-frame"]');
  const heading = frame.locator('[data-screen-heading="root"]');
  const rows = frame.locator("[data-screen-row]");
  const tabs = frame.locator('[data-screen-foundation="tabs"]');
  const stickyActions = frame.locator(
    '[data-screen-foundation="sticky-actions"]'
  );

  await expect(frame).toBeVisible();
  await expect(heading).toBeVisible();
  await expect(rows).toHaveCount(2);
  await expect(tabs).toBeVisible();
  await expect(stickyActions).toBeVisible();

  const geometry = await frame.evaluate((element) => {
    const frameElement = element as HTMLElement;
    const headingElement = frameElement.querySelector<HTMLElement>(
      '[data-screen-heading="root"]'
    );
    const tabElement = frameElement.querySelector<HTMLElement>(
      '[data-screen-foundation="tabs"]'
    );
    const stickyElement = frameElement.querySelector<HTMLElement>(
      '[data-screen-foundation="sticky-actions"]'
    );
    const targets = [
      ...frameElement.querySelectorAll<HTMLElement>(
        'a[href], button, input, textarea, [role="button"]'
      ),
    ].filter((target) => {
      const box = target.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    const boxes = targets.map((target) => target.getBoundingClientRect());
    const frameStyle = getComputedStyle(frameElement);
    const headingStyle = headingElement
      ? getComputedStyle(headingElement)
      : null;
    const viewportWidth = window.innerWidth;

    return {
      frame: frameElement.getBoundingClientRect().toJSON(),
      framePaddingLeft: Number.parseFloat(frameStyle.paddingLeft),
      framePaddingRight: Number.parseFloat(frameStyle.paddingRight),
      heading: headingStyle
        ? {
            fontSize: headingStyle.fontSize,
            lineHeight: headingStyle.lineHeight,
          }
        : null,
      minimumTarget: Math.min(
        ...boxes.map((box) => Math.min(box.width, box.height))
      ),
      rowHeights: [
        ...frameElement.querySelectorAll<HTMLElement>("[data-screen-row]"),
      ].map((row) => row.getBoundingClientRect().height),
      tabHeight: tabElement?.getBoundingClientRect().height ?? 0,
      stickyBottom: stickyElement?.getBoundingClientRect().bottom ?? 0,
      viewportWidth,
      overflow:
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth
        ) - viewportWidth,
    };
  });

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(geometry.frame.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.frame.right).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
  expect(geometry.framePaddingLeft).toBeGreaterThan(0);
  expect(geometry.framePaddingRight).toBe(geometry.framePaddingLeft);
  expect(geometry.heading).toStrictEqual({
    fontSize: "28px",
    lineHeight: "34px",
  });
  expect(geometry.minimumTarget).toBeGreaterThanOrEqual(44);
  expect(geometry.rowHeights[0]).toBeGreaterThanOrEqual(64);
  expect(geometry.rowHeights[1]).toBeGreaterThanOrEqual(64);
  expect(geometry.tabHeight).toBeGreaterThanOrEqual(44);
  expect(geometry.overflow).toBeLessThanOrEqual(1);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const stickyClearance = await stickyActions.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return window.innerHeight - box.bottom;
  });
  expect(stickyClearance).toBeGreaterThanOrEqual(
    (viewport?.width ?? 0) < 800 ? 71 : -1
  );
});

test("Programs participant shell keeps the brand-first header and no mode control", async ({
  page,
}) => {
  await page.goto(story(STORIES.programsParticipant));
  await expectShellFrame(page);
  await expectMemberBrand(page);
  await expect(
    page
      .locator("header[data-shell-header]")
      .getByRole("link", { name: COPY.programs.enterManagement })
  ).toHaveCount(0);
});

test("Programs management shell exposes one canonical home mode control", async ({
  page,
}) => {
  await page.goto(story(STORIES.programsManagement));
  await expectShellFrame(page);
  await expectMemberBrand(page);

  const header = page.locator("header[data-shell-header]");
  const modeLink = header.getByRole("link", {
    name: COPY.programs.enterParticipant,
  });
  await expect(modeLink).toHaveCount(1);
  await expect(modeLink).toHaveAttribute("href", "/programs");
  await expect(modeLink).toHaveAttribute("data-screen-icon-button", "true");
  await expect(modeLink).toHaveText("");
});

test("Programs detail uses a route-owned icon-only Back control", async ({
  page,
}) => {
  await page.goto(story(STORIES.programsParticipantDetail));
  await expectShellFrame(page);

  const back = page.locator(
    '[data-screen-foundation="header"] [data-screen-icon-button]'
  );
  await expect(back).toHaveCount(1);
  await expect(back).toHaveAttribute("href", "/programs");
  await expect(back).toHaveAttribute("aria-label", COPY.programs.detailBack);
  await expect(back).toHaveText("");
});

test("Programs R4 material Stories execute route-backed behavior Plays", async ({
  page,
}) => {
  for (const storyId of PROGRAMS_R4_MATERIAL_STORIES) {
    await page.goto(story(storyId));
    await expectShellFrame(page);
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  }

  await page.goto(
    story("t07-3-programs-material-states--participant-directory-capable")
  );
  await clickAndAssertHref(
    page.getByRole("link", { name: COPY.programs.enterManagement }),
    "/programs?mode=management"
  );

  await page.goto(
    story("t07-3-programs-material-states--participant-program-detail-eligible")
  );
  await expect(
    page
      .locator('[data-enrollment-notice="true"]')
      .filter({ hasText: COPY.programs.requestSubmitted })
  ).toBeVisible();
  await expect(
    page
      .locator('[data-screen-status="true"]')
      .filter({ hasText: COPY.programs.statusPending })
  ).toBeVisible();

  await page.goto(
    story("t07-3-programs-material-states--participant-program-detail-active")
  );
  await expect(
    page
      .locator('[data-enrollment-notice="true"]')
      .filter({ hasText: COPY.programs.enrollmentCancelledNotice })
  ).toBeVisible();
  await expect(
    page
      .locator('[data-screen-status="true"]')
      .filter({ hasText: COPY.programs.statusCancelled })
  ).toBeVisible();

  await page.goto(
    story("t07-3-programs-material-states--participant-program-detail-pending")
  );
  await expect(
    page
      .locator('[data-enrollment-notice="true"]')
      .filter({ hasText: COPY.programs.requestWithdrawnNotice })
  ).toBeVisible();
  await expect(
    page
      .locator('[data-screen-status="true"]')
      .filter({ hasText: COPY.programs.statusWithdrawn })
  ).toBeVisible();

  await page.goto(
    story("t07-3-programs-material-states--participant-program-detail-rejected")
  );
  await clickAndAssertHref(
    page.locator('[data-screen-foundation="header"] [data-screen-icon-button]'),
    "/programs"
  );

  await page.goto(
    story("t07-3-programs-material-states--participant-event-detail-closed")
  );
  await expect(
    page.getByRole("link", { name: COPY.programs.goToScan })
  ).toHaveCount(0);
  await clickAndAssertHref(
    page.locator('[data-screen-foundation="header"] [data-screen-icon-button]'),
    "/programs?program=t07-3-program&from=programs"
  );

  await page.goto(
    story("t07-3-programs-material-states--participant-event-detail-open")
  );
  await expect(
    page.getByRole("link", { name: COPY.programs.goToScan })
  ).toHaveCount(1);
  await expect(
    page.getByRole("link", { name: COPY.programs.goToScan })
  ).toHaveAttribute("href", "/scanner?event=t07-3-event");

  await page.goto(
    story("t07-3-programs-material-states--participant-event-detail-ineligible")
  );
  await expect(
    page.getByText(COPY.programs.eventDetailRecoveryTitle, { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: COPY.programs.goToScan })
  ).toHaveCount(0);

  await page.goto(
    story("t07-3-programs-material-states--management-directory-mixed")
  );
  const settings = page.getByRole("button", {
    name: COPY.programs.departmentSettings,
  });
  await expect(settings).toBeFocused();
});

test("Programs R5 material Stories execute Schedule recovery Plays", async ({
  page,
}) => {
  for (const storyId of PROGRAMS_R5_MATERIAL_STORIES) {
    await page.goto(story(storyId));
    await expectShellFrame(page);
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  }

  await page.goto(
    story("t07-3-programs-material-states--workspace-events-mixed")
  );
  await expect(
    page.getByRole("link", { name: COPY.programs.eventDetailOpen })
  ).toHaveCount(3);
  await expect(
    page.getByRole("link", {
      name: new RegExp(COPY.programs.settingsScheduleEventsLink, "u"),
    })
  ).toHaveAttribute(
    "href",
    "/programs?mode=management&program=t07-3-program&task=schedule&scheduleOrigin=events"
  );

  await page.goto(
    story("t07-3-programs-material-states--workspace-schedule-focused")
  );
  await expect(
    page.getByRole("heading", { name: COPY.programs.scheduleRulesTitle })
  ).toBeVisible();
  await expect(page.getByText("2026-09-26", { exact: false })).toBeVisible();
  await expect(
    page.getByRole("button", { name: COPY.programs.previewEvents })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: COPY.programs.addRule })
  ).toBeVisible();

  await page.goto(
    story("t07-3-programs-material-states--workspace-schedule-stale")
  );
  await expect(
    page.getByText(
      COPY.programs.generated
        .replace("{created}", "2")
        .replace("{skipped}", "0"),
      { exact: true }
    )
  ).toBeVisible();

  await page.goto(
    story("t07-3-programs-material-states--workspace-schedule-partial-resume")
  );
  const partialCopy = COPY.programs.generatedPartial
    .replace("{created}", "1")
    .replace("{skipped}", "0")
    .replace("{failed}", "1");
  const resumedCopy = COPY.programs.generatedResumed
    .replace("{created}", "0")
    .replace("{skipped}", "1");
  await expect(page.getByText(resumedCopy, { exact: true })).toBeVisible();
  await expect(page.getByText(partialCopy, { exact: true })).toHaveCount(0);
});

test("Programs R6 material Stories execute Settings and Notifications Plays", async ({
  page,
}) => {
  for (const storyId of PROGRAMS_R6_MATERIAL_STORIES) {
    await page.goto(story(storyId));
    await expectShellFrame(page);
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  }

  await page.goto(
    story("t07-3-programs-material-states--workspace-settings-dirty")
  );
  await expect(
    page.getByRole("textbox", { name: COPY.programs.programName })
  ).toHaveValue("未儲存課程名稱");
  await expect(
    page.locator('[data-screen-settings-dirty="true"]')
  ).toContainText(COPY.programs.settingsUnsaved);
  await expect(
    page.getByRole("button", { name: COPY.programs.settingsSaveBasics })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: COPY.programs.settingsDiscard })
  ).toBeVisible();

  const dirtyActions = page.locator(
    '[data-testid="program-settings-dirty-actions"]'
  );
  await expect(dirtyActions).toBeVisible();
  const dirtyGeometry = await dirtyActions.evaluate((element) => {
    const actionElement = element as HTMLElement;
    const settingsSection = actionElement.closest<HTMLElement>(
      'section[aria-labelledby="program-settings-focused-title"]'
    );
    const form = settingsSection?.querySelector<HTMLElement>(
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
    const actionBox = actionElement.getBoundingClientRect();
    const fieldBottom = Math.max(
      ...fields.map((field) => field.getBoundingClientRect().bottom),
      Number.NEGATIVE_INFINITY
    );
    const targets = [
      ...actionElement.querySelectorAll<HTMLElement>("button"),
    ].map((target) => target.getBoundingClientRect());
    const scroller = actionElement.closest<HTMLElement>("#shell-content");

    return {
      actionBottom: actionBox.bottom,
      actionTop: actionBox.top,
      fieldBottom,
      minimumTarget: Math.min(
        ...targets.map((box) => Math.min(box.width, box.height))
      ),
      overflow:
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth
        ) - window.innerWidth,
      position: getComputedStyle(actionElement).position,
      bottom: getComputedStyle(actionElement).bottom,
      scrollerHeight: scroller?.scrollHeight ?? 0,
      scrollerClientHeight: scroller?.clientHeight ?? 0,
    };
  });
  expect(dirtyGeometry.position).toBe("static");
  expect(dirtyGeometry.bottom).toBe("auto");
  expect(dirtyGeometry.actionTop).toBeGreaterThanOrEqual(
    dirtyGeometry.fieldBottom - 1
  );
  expect(dirtyGeometry.minimumTarget).toBeGreaterThanOrEqual(44);
  expect(dirtyGeometry.overflow).toBeLessThanOrEqual(1);
  expect(dirtyGeometry.scrollerHeight).toBeGreaterThanOrEqual(
    dirtyGeometry.scrollerClientHeight
  );

  await page.locator("#shell-content").evaluate((element) => {
    element.scrollTo(0, element.scrollHeight);
  });
  const endGeometry = await page.evaluate(() => {
    const action = document.querySelector<HTMLElement>(
      "[data-testid=program-settings-dirty-actions]"
    );
    const output = document.querySelector<HTMLElement>(
      "[data-screen-settings-dirty=true]"
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
    const navBox = document
      .querySelector<HTMLElement>("#main-navigation")
      ?.getBoundingClientRect();

    return {
      actionBottom: actionBox?.bottom ?? Number.POSITIVE_INFINITY,
      actionTop: actionBox?.top ?? Number.NEGATIVE_INFINITY,
      fieldBottom: Math.max(
        ...fields.map((field) => field.getBoundingClientRect().bottom),
        Number.NEGATIVE_INFINITY
      ),
      navTop: navBox?.top ?? Number.POSITIVE_INFINITY,
      outputBottom:
        output?.getBoundingClientRect().bottom ?? Number.NEGATIVE_INFINITY,
    };
  });
  expect(endGeometry.fieldBottom).toBeLessThanOrEqual(
    endGeometry.actionTop + 1
  );
  expect(endGeometry.outputBottom).toBeLessThanOrEqual(
    endGeometry.actionTop + 1
  );
  if ((page.viewportSize()?.width ?? 0) < 800) {
    expect(endGeometry.actionBottom).toBeLessThanOrEqual(
      endGeometry.navTop + 1
    );
  }

  await page
    .getByRole("button", { name: COPY.programs.settingsDiscard })
    .click();
  await expect(
    page.getByRole("textbox", { name: COPY.programs.programName })
  ).toHaveValue("門徒訓練基礎課");
  await expect(page.locator('[data-screen-settings-dirty="true"]')).toHaveCount(
    0
  );

  await page.goto(
    story("t07-3-programs-material-states--workspace-settings-conflict")
  );
  await expect(
    page.getByText(COPY.programs.settingsSaved, { exact: true })
  ).toBeVisible();

  await page.goto(
    story("t07-3-programs-material-states--notifications-unread")
  );
  await expect(
    page.locator('[data-screen-status="true"]').filter({ hasText: /^2$/u })
  ).toBeVisible();

  await page.goto(
    story("t07-3-programs-material-states--notifications-empty-recoverable")
  );
  await expect(
    page.getByText(COPY.programs.notificationsEmpty, { exact: true })
  ).toBeVisible();
});

test("all retained Programs baselines use one settled production route composition", async ({
  page,
}) => {
  for (const storyId of PROGRAMS_BASELINE_STORIES) {
    await page.goto(story(storyId));
    await expectShellFrame(page);
    const frame = page.locator(
      '[data-screen-foundation="page-frame"][data-screen-route="programs"]'
    );
    await expect(frame).toHaveCount(1);
    await expect(frame).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  }
});

test("Programs baselines expose dense Cantonese 2026 server-shaped fixtures", async ({
  page,
}) => {
  await page.goto(story(STORIES.programsParticipant));
  await expectShellFrame(page);
  const frame = page.locator(
    '[data-screen-foundation="page-frame"][data-screen-route="programs"]'
  );
  await expect(frame.locator("[data-program-name]")).toHaveCount(5);
  for (const name of [
    "門徒訓練基礎課",
    "同行成長小組",
    "信仰探索班",
    "家庭同行系列",
    "青年領袖培訓",
  ]) {
    await expect(frame.getByText(name, { exact: true })).toBeVisible();
  }
  for (const status of ["可報名", "待審批", "已封存"]) {
    await expect(
      frame.locator('[data-screen-status="true"]').filter({ hasText: status })
    ).toBeVisible();
  }

  await page.goto(story(STORIES.programsManagement));
  await expectShellFrame(page);
  const managementFrame = page.locator(
    '[data-screen-foundation="page-frame"][data-screen-route="programs"]'
  );
  for (const department of [
    "培育部",
    "牧養部",
    "福音部",
    "家庭事工",
    "青年部",
  ]) {
    await expect(managementFrame).toContainText(department);
  }
  await expect(managementFrame).toContainText("啟用");
  await expect(managementFrame).toContainText("草稿");
  await expect(managementFrame).toContainText("已存檔");

  await page.goto(story("t07-3-programs--workspace-overview"));
  await expectShellFrame(page);
  const overviewFrame = page.locator(
    '[data-screen-foundation="page-frame"][data-screen-route="programs"]'
  );
  await expect(
    overviewFrame.getByText("12 個聚會", { exact: true })
  ).toBeVisible();
  await expect(
    overviewFrame.getByText("待審批報名 ×2", { exact: true })
  ).toBeVisible();

  await page.goto(story("t07-3-programs--workspace-events"));
  await expectShellFrame(page);
  const eventsFrame = page.locator(
    '[data-screen-foundation="page-frame"][data-screen-route="programs"]'
  );
  for (const eventName of [
    "門徒訓練週會",
    "門徒分享聚會",
    "家庭同行特別聚會",
  ]) {
    await expect(
      eventsFrame.getByText(eventName, { exact: true })
    ).toBeVisible();
  }

  await page.goto(story("t07-3-programs--workspace-participants"));
  await expectShellFrame(page);
  const participantsFrame = page.locator(
    '[data-screen-foundation="page-frame"][data-screen-route="programs"]'
  );
  await expect(
    participantsFrame.getByText("陳小明", { exact: true })
  ).toBeVisible();
  await expect(
    participantsFrame.getByText("李欣怡", { exact: true })
  ).toBeVisible();
  await participantsFrame.getByRole("tab", { name: /使用中/u }).click();
  await expect(
    participantsFrame.getByText("王恩慈", { exact: true })
  ).toBeVisible();
  await participantsFrame.getByRole("tab", { name: /歷史/u }).click();
  await expect(
    participantsFrame.getByText("黃志成", { exact: true })
  ).toBeVisible();

  await page.goto(story("t07-3-programs--workspace-notifications"));
  await expectShellFrame(page);
  const notificationsFrame = page.locator(
    '[data-screen-foundation="page-frame"][data-screen-route="programs"]'
  );
  await expect(
    notificationsFrame.getByText("較早通知", { exact: true })
  ).toBeVisible();
  await expect(notificationsFrame.locator("[data-screen-row]")).toHaveCount(4);
  for (const notification of [
    "門徒訓練基礎課",
    "門徒分享聚會",
    "家庭同行特別聚會",
    "同行成長小組",
  ]) {
    await expect(
      notificationsFrame
        .locator("[data-screen-row]")
        .filter({ hasText: notification })
        .first()
    ).toBeVisible();
  }
});

test("Storybook Notices keeps global brand and local H1 across W7", async ({
  page,
}) => {
  await page.goto(story(STORIES.notices));
  await expectShellFrame(page);
  await expectMemberBrand(page);

  const heading = page.getByRole("heading", {
    level: 1,
    name: COPY.sections.notices,
  });
  await expect(heading).toBeVisible();
  await expect(
    page.locator("header[data-shell-header]").getByText(COPY.sections.notices, {
      exact: true,
    })
  ).toHaveCount(0);
});

test("Storybook Messages keeps global brand and local H1 across W7", async ({
  page,
}) => {
  await page.goto(story(STORIES.messages));
  await expectShellFrame(page);
  await expectMemberBrand(page);

  const heading = page.getByRole("heading", {
    level: 1,
    name: COPY.home.churchNews,
  });
  await expect(heading).toBeVisible();
  await expect(
    page.locator("header[data-shell-header]").getByText(COPY.home.churchNews, {
      exact: true,
    })
  ).toHaveCount(0);
});

test("Storybook management Account Directory keeps brand and attention chrome across W7", async ({
  page,
}) => {
  await page.goto(story(STORIES.accountDirectory));
  await expectShellFrame(page);

  const header = page.locator("header[data-shell-header]");
  await expect(header).toBeVisible();
  await expect(
    header.getByText(COPY.shell.shortMark, { exact: true })
  ).toBeVisible();
  await expect(
    header.getByText("T07.1 Storybook Manager", { exact: true })
  ).toHaveCount(0);
  await expect(
    header.getByText("T07.1 synthetic manager", { exact: true })
  ).toHaveCount(0);
  const attentionButton = header.locator('button[aria-haspopup="dialog"]');
  await expect(attentionButton).toHaveCount(1);
  await expect(attentionButton).toBeVisible();
});

test("Storybook Scanner Boundary keeps navigation while suppressing the top header across W7", async ({
  page,
}) => {
  await page.goto(story(STORIES.scannerBoundary));
  await expectShellFrame(page);
  await expect(page.locator("header[data-shell-header]")).toHaveCount(0);
});
