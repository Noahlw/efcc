import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { RequestHandler } from "msw";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { COPY } from "@/lib/copy";
import { ParticipantDirectory as ParticipantDirectoryComponent } from "@/lib/programs/participant-directory";

import { getProgramsStoryScenario } from "./programs-fixtures";
import type { ProgramsMaterialScenarioName } from "./programs-fixtures";
import { assertProgramsScreen } from "./programs-presentation-contract";
import {
  ProgramsStoryHarness,
  withProgramsFixtureIsolation,
} from "./programs-story-harness";

const meta = {
  title: "T07.3/Programs Material States",
  component: ParticipantDirectoryComponent,
  decorators: [withProgramsFixtureIsolation],
  parameters: { a11y: { test: "error" } },
} satisfies Meta<typeof ParticipantDirectoryComponent>;

export default meta;

type Story = StoryObj<typeof meta>;

interface StorybookMswContext {
  msw?: {
    resetHandlers: () => void;
    use: (...handlers: RequestHandler[]) => void;
  };
}

const readinessFor = (name: ProgramsMaterialScenarioName) => {
  if (name === "participant-directory-member") {
    return {
      selector: "[data-program-name]",
      text: "門徒訓練基礎課",
    };
  }
  if (
    name === "participant-program-detail-active" ||
    name === "participant-program-detail-eligible" ||
    name === "participant-program-detail-pending" ||
    name === "participant-program-detail-rejected"
  ) {
    return {
      selector: "#program-detail-title",
      text:
        name === "participant-program-detail-eligible"
          ? "同行成長小組"
          : "門徒訓練基礎課",
    };
  }
  if (
    name === "participant-event-detail-closed" ||
    name === "participant-event-detail-open"
  ) {
    return {
      selector: "#participant-event-title",
      text: "門徒訓練週會",
    };
  }
  if (name === "participant-event-detail-ineligible") {
    return {
      selector: '[data-screen-foundation="state"][data-screen-state="error"]',
      text: COPY.programs.eventDetailRecoveryTitle,
    };
  }
  if (name === "participant-directory-capable") {
    return {
      selector: "[data-program-name]",
      text: "門徒訓練基礎課",
    };
  }
  if (name === "management-directory-mixed") {
    return {
      selector: "#programs-management-directory-title",
      text: "管理課程",
    };
  }
  if (
    name === "workspace-overview-populated" ||
    name === "workspace-overview-zero"
  ) {
    return {
      selector: "#programs-workspace-title",
      text: "門徒訓練基礎課",
    };
  }
  if (name === "workspace-events-mixed") {
    return { selector: "#programs-workspace-events-title", text: "聚會" };
  }
  if (name === "workspace-participants-pending") {
    return {
      selector: "#programs-workspace-participants-title",
      text: "參與者",
    };
  }
  if (
    name === "workspace-settings-dirty" ||
    name === "workspace-settings-conflict"
  ) {
    return { selector: "#program-settings-title", text: "課程設定" };
  }
  if (
    name === "workspace-schedule-focused" ||
    name === "workspace-schedule-stale" ||
    name === "workspace-schedule-partial-resume"
  ) {
    return { selector: "#programs-workspace-title", text: "聚會排程" };
  }
  return { selector: "#programs-notifications-title", text: "通知" };
};

const materialStory = (
  name: ProgramsMaterialScenarioName,
  play?: Story["play"]
): Story => {
  const scenario = getProgramsStoryScenario(name);
  const readiness = readinessFor(name);
  return {
    render: () => <ProgramsStoryHarness query={{ ...scenario.query }} />,
    loaders: [
      async (context) => {
        const worker = (context as StorybookMswContext).msw;
        if (!worker) {
          throw new Error("Programs Storybook MSW worker is not initialized");
        }
        worker.resetHandlers();
        worker.use(...getProgramsStoryScenario(name).handlers);
        return {};
      },
    ],
    parameters: {
      nextjs: {
        appDirectory: true,
        navigation: {
          pathname: scenario.pathname,
          query: { ...scenario.query },
        },
      },
    },
    play:
      play ??
      (({ canvasElement }) => assertProgramsScreen(canvasElement, readiness)),
  };
};

const expectDetailStatus = async (
  canvasElement: HTMLElement,
  status: string
) => {
  const marker = await within(canvasElement).findByText(status, {
    exact: true,
    selector: "[data-screen-status]",
  });
  await expect(marker).toBeVisible();
};

const clickAndCaptureHref = async (link: HTMLElement, href: string) => {
  let activatedHref: string | null = null;
  const document = link.ownerDocument;
  const handleClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest("a") !== link) {
      return;
    }
    event.preventDefault();
    activatedHref = link.getAttribute("href");
    document.removeEventListener("click", handleClick, true);
  };
  document.addEventListener("click", handleClick, true);
  await userEvent.click(link);
  await expect(activatedHref).toBe(href);
};

const waitForConfirmationDismissal = async (canvasElement: HTMLElement) => {
  await waitFor(() => {
    const canvasHidden =
      canvasElement.matches('[data-aria-hidden="true"]') ||
      canvasElement.querySelector('[data-aria-hidden="true"]');
    if (
      canvasElement.ownerDocument.body.querySelector("[data-confirm-dialog]") ||
      canvasHidden
    ) {
      throw new Error("Participant confirmation dialog is still open");
    }
  });
};

const participantDirectoryCapablePlay: Story["play"] = async ({
  canvasElement,
}) => {
  await assertProgramsScreen(
    canvasElement,
    readinessFor("participant-directory-capable")
  );
  const canvas = within(canvasElement);
  const modeLink = canvas.getByRole("link", {
    name: COPY.programs.enterManagement,
  });
  await clickAndCaptureHref(modeLink, "/programs?mode=management");
};

const participantProgramDetailEligiblePlay: Story["play"] = async ({
  canvasElement,
}) => {
  await assertProgramsScreen(
    canvasElement,
    readinessFor("participant-program-detail-eligible")
  );
  const canvas = within(canvasElement);
  await expectDetailStatus(canvasElement, COPY.programs.statusEligible);
  const enroll = canvas.getByRole("button", { name: COPY.programs.enroll });
  await expect(enroll).toBeVisible();
  await userEvent.click(enroll);
  await expect(
    await canvas.findByText(COPY.programs.requestSubmitted, {
      exact: true,
      selector: "[data-enrollment-notice]",
    })
  ).toBeVisible();
  await expectDetailStatus(canvasElement, COPY.programs.statusPending);
  await expect(
    canvas.getByRole("button", { name: COPY.programs.withdrawRequest })
  ).toBeVisible();
  await expect(
    canvas.queryByRole("button", { name: COPY.programs.enroll })
  ).toBeNull();
};

const participantProgramDetailActivePlay: Story["play"] = async ({
  canvasElement,
}) => {
  await assertProgramsScreen(
    canvasElement,
    readinessFor("participant-program-detail-active")
  );
  const canvas = within(canvasElement);
  await expectDetailStatus(canvasElement, COPY.programs.statusActive);
  await userEvent.click(
    canvas.getByRole("button", { name: COPY.programs.cancelEnrollment })
  );
  const body = within(canvasElement.ownerDocument.body);
  await expect(
    body.getByRole("alertdialog", {
      name: COPY.programs.cancelConfirmTitle,
    })
  ).toBeInTheDocument();
  await userEvent.click(
    body.getByRole("button", { name: COPY.programs.cancelConfirmAccept })
  );
  await expect(
    await canvas.findByText(COPY.programs.enrollmentCancelledNotice, {
      exact: true,
      selector: "[data-enrollment-notice]",
    })
  ).toBeVisible();
  await waitForConfirmationDismissal(canvasElement);
  await expectDetailStatus(canvasElement, COPY.programs.statusCancelled);
  await expect(
    canvas.getByRole("button", { name: COPY.programs.reEnroll })
  ).toBeVisible();
  await expect(
    canvas.queryByRole("button", { name: COPY.programs.cancelEnrollment })
  ).toBeNull();
};

const participantProgramDetailPendingPlay: Story["play"] = async ({
  canvasElement,
}) => {
  await assertProgramsScreen(
    canvasElement,
    readinessFor("participant-program-detail-pending")
  );
  const canvas = within(canvasElement);
  await expectDetailStatus(canvasElement, COPY.programs.statusPending);
  await userEvent.click(
    canvas.getByRole("button", { name: COPY.programs.withdrawRequest })
  );
  const body = within(canvasElement.ownerDocument.body);
  await expect(
    body.getByRole("alertdialog", {
      name: COPY.programs.withdrawConfirmTitle,
    })
  ).toBeInTheDocument();
  await userEvent.click(
    body.getByRole("button", { name: COPY.programs.withdrawConfirmAccept })
  );
  await expect(
    await canvas.findByText(COPY.programs.requestWithdrawnNotice, {
      exact: true,
      selector: "[data-enrollment-notice]",
    })
  ).toBeVisible();
  await waitForConfirmationDismissal(canvasElement);
  await expectDetailStatus(canvasElement, COPY.programs.statusWithdrawn);
  await expect(
    canvas.getByRole("button", { name: COPY.programs.reEnroll })
  ).toBeVisible();
  await expect(
    canvas.queryByRole("button", { name: COPY.programs.withdrawRequest })
  ).toBeNull();
};

const participantProgramDetailRejectedPlay: Story["play"] = async ({
  canvasElement,
}) => {
  await assertProgramsScreen(
    canvasElement,
    readinessFor("participant-program-detail-rejected")
  );
  const canvas = within(canvasElement);
  await expectDetailStatus(canvasElement, COPY.programs.statusRejected);
  await userEvent.click(
    canvas.getByRole("button", { name: COPY.programs.reEnroll })
  );
  await expect(
    await canvas.findByText(COPY.programs.requestSubmitted, {
      exact: true,
      selector: "[data-enrollment-notice]",
    })
  ).toBeVisible();
  await expectDetailStatus(canvasElement, COPY.programs.statusPending);
  await expect(
    canvas.getByRole("button", { name: COPY.programs.withdrawRequest })
  ).toBeVisible();
  await expect(
    canvas.queryByRole("button", { name: COPY.programs.reEnroll })
  ).toBeNull();
  const back = canvas.getByRole("link", { name: COPY.programs.detailBack });
  await clickAndCaptureHref(back, "/programs");
};

const participantEventDetailClosedPlay: Story["play"] = async ({
  canvasElement,
}) => {
  await assertProgramsScreen(
    canvasElement,
    readinessFor("participant-event-detail-closed")
  );
  const canvas = within(canvasElement);
  await expect(
    canvas.queryByRole("link", { name: COPY.programs.goToScan })
  ).toBeNull();
  const back = canvas.getByRole("link", { name: COPY.programs.backToOrigin });
  await clickAndCaptureHref(
    back,
    "/programs?program=t07-3-program&from=programs"
  );
};

const participantEventDetailOpenPlay: Story["play"] = async ({
  canvasElement,
}) => {
  await assertProgramsScreen(
    canvasElement,
    readinessFor("participant-event-detail-open")
  );
  const canvas = within(canvasElement);
  const scanLinks = canvas.getAllByRole("link", {
    name: COPY.programs.goToScan,
  });
  await expect(scanLinks).toHaveLength(1);
  await expect(scanLinks[0]).toHaveAttribute(
    "href",
    "/scanner?event=t07-3-event"
  );
};

const participantEventDetailIneligiblePlay: Story["play"] = async ({
  canvasElement,
}) => {
  await assertProgramsScreen(
    canvasElement,
    readinessFor("participant-event-detail-ineligible")
  );
  const canvas = within(canvasElement);
  await expect(
    canvas.getByText(COPY.programs.eventDetailRecoveryTitle, { exact: true })
  ).toBeVisible();
  await expect(
    canvas.queryByRole("link", { name: COPY.programs.goToScan })
  ).toBeNull();
  await expect(
    canvas.getByRole("link", { name: COPY.programs.eventDetailViewProgram })
  ).toHaveAttribute("href", "/programs?program=t07-3-program");
};

const managementDirectoryMixedPlay: Story["play"] = async ({
  canvasElement,
}) => {
  await assertProgramsScreen(
    canvasElement,
    readinessFor("management-directory-mixed")
  );
  const canvas = within(canvasElement);
  const trigger = canvas.getByRole("button", {
    name: COPY.programs.departmentSettings,
  });
  await userEvent.click(trigger);
  const picker = canvas.getByRole("dialog", {
    name: COPY.programs.departmentSettings,
  });
  await expect(picker).toHaveFocus();
  await userEvent.click(within(picker).getByRole("button", { name: "牧養部" }));
  await expect(
    canvas.getByRole("heading", { name: "部門設定: 牧養部" })
  ).toBeVisible();
  await userEvent.click(
    canvas.getByRole("button", { name: COPY.programs.collapse })
  );
  await expect(trigger).toHaveFocus();
};

const workspaceEventsMixedPlay: Story["play"] = async ({ canvasElement }) => {
  await assertProgramsScreen(
    canvasElement,
    readinessFor("workspace-events-mixed")
  );
  const canvas = within(canvasElement);
  await expect(
    canvas.getAllByRole("link", { name: COPY.programs.eventDetailOpen })
  ).toHaveLength(3);
  const scheduleLink = canvas.getByRole("link", {
    name: new RegExp(COPY.programs.settingsScheduleEventsLink, "u"),
  });
  await clickAndCaptureHref(
    scheduleLink,
    "/programs?mode=management&program=t07-3-program&task=schedule"
  );
};

const workspaceScheduleFocusedPlay: Story["play"] = async ({
  canvasElement,
}) => {
  await assertProgramsScreen(
    canvasElement,
    readinessFor("workspace-schedule-focused")
  );
  const canvas = within(canvasElement);
  await expect(
    canvas.getByRole("heading", { name: COPY.programs.scheduleRulesTitle })
  ).toBeVisible();
  await expect(
    canvas.findByText("2026-09-26", { exact: false })
  ).resolves.toBeVisible();
  await expect(
    canvas.getByRole("button", { name: COPY.programs.previewEvents })
  ).toBeVisible();

  await userEvent.click(
    canvas.getByRole("button", { name: COPY.programs.addRule })
  );
  await expect(
    canvas.getByRole("heading", { name: COPY.programs.addRule })
  ).toBeVisible();
  await expect(
    canvas.queryByRole("heading", { name: COPY.programs.scheduleRulesTitle })
  ).toBeNull();
  await expect(
    canvas.queryByRole("button", { name: COPY.programs.previewEvents })
  ).toBeNull();

  const back = canvas.getByRole("link", { name: COPY.programs.backToOverview });
  await expect(back).toHaveAttribute(
    "href",
    "/programs?mode=management&program=t07-3-program&task=schedule"
  );
  await userEvent.click(
    canvas.getByRole("button", { name: COPY.programs.settingsRuleCancel })
  );
  await expect(
    canvas.getByRole("heading", { name: COPY.programs.scheduleRulesTitle })
  ).toBeVisible();
  await expect(
    canvas.getByRole("button", { name: COPY.programs.addRule })
  ).toBeVisible();
};

const workspaceScheduleStalePlay: Story["play"] = async ({ canvasElement }) => {
  await assertProgramsScreen(
    canvasElement,
    readinessFor("workspace-schedule-stale")
  );
  const canvas = within(canvasElement);

  await userEvent.click(
    canvas.getByRole("button", { name: COPY.programs.previewEvents })
  );
  await expect(
    canvas.findByRole("heading", { name: COPY.programs.schedulePreviewTitle })
  ).resolves.toBeVisible();

  await userEvent.click(
    canvas.getByRole("button", { name: COPY.programs.generateEvents })
  );
  await expect(
    canvas.findByText(COPY.programs.previewChanged, { exact: true })
  ).resolves.toBeVisible();
  await expect(
    canvas.queryByRole("button", { name: COPY.programs.generateEvents })
  ).toBeNull();

  await userEvent.click(
    canvas.getByRole("button", { name: COPY.programs.previewEvents })
  );
  await expect(
    canvas.findByRole("heading", { name: COPY.programs.schedulePreviewTitle })
  ).resolves.toBeVisible();
  await expect(
    canvas.getByRole("button", { name: COPY.programs.generateEvents })
  ).toBeVisible();

  await userEvent.click(
    canvas.getByRole("button", { name: COPY.programs.generateEvents })
  );
  await expect(
    canvas.findByText(
      COPY.programs.generated
        .replace("{created}", "2")
        .replace("{skipped}", "0"),
      { exact: true }
    )
  ).resolves.toBeVisible();
};

const workspaceSchedulePartialResumePlay: Story["play"] = async ({
  canvasElement,
}) => {
  await assertProgramsScreen(
    canvasElement,
    readinessFor("workspace-schedule-partial-resume")
  );
  const canvas = within(canvasElement);

  await userEvent.click(
    canvas.getByRole("button", { name: COPY.programs.previewEvents })
  );
  await expect(
    canvas.findByRole("heading", { name: COPY.programs.schedulePreviewTitle })
  ).resolves.toBeVisible();
  await userEvent.click(
    canvas.getByRole("button", { name: COPY.programs.generateEvents })
  );
  const partialCopy = COPY.programs.generatedPartial
    .replace("{created}", "1")
    .replace("{skipped}", "0")
    .replace("{failed}", "1");
  await expect(
    canvas.findByText(partialCopy, { exact: true })
  ).resolves.toBeVisible();
  const partialResult = canvasElement.querySelector<HTMLElement>(
    '[data-generation-result="true"]'
  );
  expect(partialResult).not.toBeNull();
  const partialRunId = partialResult?.dataset.generationRunId;
  const partialPlanId = partialResult?.dataset.generationPlanId;
  expect(partialRunId).toBe("t07-3-partial-run");
  expect(partialPlanId).toBe("t07-3-plan");
  await expect(
    canvas.getByRole("button", { name: COPY.programs.generateEvents })
  ).toBeEnabled();

  await userEvent.click(
    canvas.getByRole("button", { name: COPY.programs.generateEvents })
  );
  const resumedCopy = COPY.programs.generatedResumed
    .replace("{created}", "0")
    .replace("{skipped}", "1");
  await expect(
    canvas.findByText(resumedCopy, { exact: true })
  ).resolves.toBeVisible();
  await expect(canvas.queryByText(partialCopy, { exact: true })).toBeNull();
  const resumedResult = canvasElement.querySelector<HTMLElement>(
    '[data-generation-result="true"]'
  );
  expect(resumedResult?.dataset.generationRunId).toBe(partialRunId);
  expect(resumedResult?.dataset.generationPlanId).toBe(partialPlanId);
  expect(
    canvasElement.ownerDocument.body.dataset.programsScheduleGenerateRequests
  ).toBe(
    JSON.stringify([
      {
        requestPlanId: partialPlanId,
        responsePlanId: partialPlanId,
        responseRunId: "t07-3-partial-run",
      },
      {
        requestPlanId: partialPlanId,
        responsePlanId: partialPlanId,
        responseRunId: "t07-3-partial-run",
      },
    ])
  );
  expect(
    canvasElement.querySelectorAll('[data-generation-result="true"]')
  ).toHaveLength(1);
};

const workspaceSettingsDirtyPlay: Story["play"] = async ({ canvasElement }) => {
  await assertProgramsScreen(
    canvasElement,
    readinessFor("workspace-settings-dirty")
  );
  const canvas = within(canvasElement);
  const basicsRow = canvas.getByRole("button", {
    name: /課程基本資料\s+名稱、描述同分類/u,
  });
  await userEvent.click(basicsRow);
  await expect(
    canvas.getByRole("heading", { name: COPY.programs.settingsBasics })
  ).toBeVisible();

  const name = canvas.getByRole("textbox", {
    name: COPY.programs.programName,
  });
  await userEvent.clear(name);
  await userEvent.type(name, "未儲存課程名稱");
  await expect(
    canvas.findByText(COPY.programs.settingsUnsaved, { exact: true })
  ).resolves.toBeVisible();
  expect(
    canvasElement.querySelector('[data-screen-settings-dirty="true"]')
  ).not.toBeNull();

  await userEvent.click(
    canvas.getByRole("link", { name: COPY.programs.settingsBackToHub })
  );
  await expect(
    canvas.getByRole("heading", { name: COPY.programs.settingsHubTitle })
  ).toBeVisible();
  await userEvent.click(
    canvas.getByRole("button", {
      name: /課程基本資料\s+名稱、描述同分類/u,
    })
  );
  await expect(
    canvas.getByRole("textbox", { name: COPY.programs.programName })
  ).toHaveValue("門徒訓練基礎課");
  const reopenedName = canvas.getByRole("textbox", {
    name: COPY.programs.programName,
  });
  await userEvent.clear(reopenedName);
  await userEvent.type(reopenedName, "再次未儲存課程名稱");
  await userEvent.click(
    canvas.getByRole("button", { name: COPY.programs.settingsDiscard })
  );
  await expect(reopenedName).toHaveValue("門徒訓練基礎課");
};

const workspaceSettingsConflictPlay: Story["play"] = async ({
  canvasElement,
}) => {
  await assertProgramsScreen(
    canvasElement,
    readinessFor("workspace-settings-conflict")
  );
  const canvas = within(canvasElement);
  const openBasics = async () => {
    await userEvent.click(
      canvas.getByRole("button", {
        name: /課程基本資料\s+名稱、描述同分類/u,
      })
    );
    await expect(
      canvas.getByRole("heading", { name: COPY.programs.settingsBasics })
    ).toBeVisible();
  };

  await openBasics();
  let name = canvas.getByRole("textbox", { name: COPY.programs.programName });
  await userEvent.clear(name);
  await userEvent.type(name, "衝突後草稿");
  await userEvent.click(
    canvas.getByRole("button", { name: COPY.programs.settingsSaveBasics })
  );
  await expect(
    canvas.findByText(COPY.programs.programConflict, { exact: true })
  ).resolves.toBeVisible();
  await expect(name).toHaveValue("衝突後草稿");
  await expect(
    canvas.getByRole("link", { name: COPY.programs.settingsBackToHub })
  ).toHaveAttribute(
    "href",
    "/programs?mode=management&program=t07-3-program&task=settings"
  );

  await userEvent.click(
    canvas.getByRole("link", { name: COPY.programs.settingsBackToHub })
  );
  await expect(
    canvas.getByRole("heading", { name: COPY.programs.settingsHubTitle })
  ).toBeVisible();
  await openBasics();
  name = canvas.getByRole("textbox", { name: COPY.programs.programName });
  await expect(name).toHaveValue("門徒訓練基礎課");
  await userEvent.clear(name);
  await userEvent.type(name, "衝突後草稿");
  await userEvent.click(
    canvas.getByRole("button", { name: COPY.programs.settingsSaveBasics })
  );
  await expect(
    canvas.findByText(COPY.programs.settingsSaved, { exact: true })
  ).resolves.toBeVisible();
  expect(
    canvasElement.ownerDocument.body.dataset.programsSettingsPatchAttempts
  ).toBe("2");
};

const notificationsUnreadPlay: Story["play"] = async ({ canvasElement }) => {
  await assertProgramsScreen(
    canvasElement,
    readinessFor("notifications-unread")
  );
  const canvas = within(canvasElement);
  await expect(
    canvas.getByRole("heading", {
      name: COPY.programs.notificationsUnreadSection,
    })
  ).toBeVisible();
  await expect(
    canvas.findByText("3", { exact: true, selector: "[data-screen-status]" })
  ).resolves.toBeVisible();
  expect(
    canvas.queryAllByRole("button", {
      name: COPY.programs.notificationBellTitle,
    })
  ).toHaveLength(0);
  await expect(
    canvas.getByRole("heading", {
      name: COPY.programs.notificationsEarlierSection,
    })
  ).toBeVisible();
  const eventNotification = canvas.getByRole("link", {
    name: new RegExp(
      `${COPY.programs.notificationsEventLabel}.*門徒訓練基礎課`,
      "u"
    ),
  });
  const unreadSection = eventNotification.closest<HTMLElement>("section");
  if (!unreadSection) {
    throw new Error("notification event row is not inside the unread section");
  }
  await clickAndCaptureHref(
    eventNotification,
    "/programs?mode=management&department=t07-3-department&program=t07-3-program&task=events&event=t07-3-manual-event"
  );
  await expect(
    canvas.findByText("2", { exact: true, selector: "[data-screen-status]" })
  ).resolves.toBeVisible();
  await expect(
    canvas.findByRole("heading", {
      name: COPY.programs.notificationsEarlierSection,
    })
  ).resolves.toBeVisible();
  const earlierSection = canvas
    .getByRole("heading", { name: COPY.programs.notificationsEarlierSection })
    .closest<HTMLElement>("section");
  if (!earlierSection) {
    throw new Error("notification earlier section is missing");
  }
  await expect(
    within(earlierSection).findByRole("link", {
      name: new RegExp(
        `${COPY.programs.notificationsEventLabel}.*門徒訓練基礎課`,
        "u"
      ),
    })
  ).resolves.toBeVisible();
  expect(
    within(unreadSection).queryByRole("link", {
      name: new RegExp(
        `${COPY.programs.notificationsEventLabel}.*門徒訓練基礎課`,
        "u"
      ),
    })
  ).toBeNull();
  expect(
    canvasElement.ownerDocument.body.dataset.programsNotificationsReadPayload
  ).toBe(
    JSON.stringify([
      { source_key: "t07-3-notification-2", source_revision: "1" },
    ])
  );
  expect(
    canvas.queryByText("3", {
      exact: true,
      selector: "[data-screen-status]",
    })
  ).toBeNull();
};

const notificationsEmptyRecoverablePlay: Story["play"] = async ({
  canvasElement,
}) => {
  await assertProgramsScreen(
    canvasElement,
    readinessFor("notifications-empty-recoverable")
  );
  const canvas = within(canvasElement);
  await expect(
    canvas.findByRole("button", { name: COPY.programs.notificationsRetry })
  ).resolves.toBeVisible();
  await userEvent.click(
    canvas.getByRole("button", { name: COPY.programs.notificationsRetry })
  );
  await expect(
    canvas.findByText(COPY.programs.notificationsEmpty, { exact: true })
  ).resolves.toBeVisible();
  await expect(
    canvas.queryByRole("button", {
      name: COPY.programs.notificationBellTitle,
    })
  ).toBeNull();
};

export const ParticipantDirectoryMember: Story = materialStory(
  "participant-directory-member"
);
export const ParticipantDirectoryCapable: Story = materialStory(
  "participant-directory-capable",
  participantDirectoryCapablePlay
);
export const ParticipantProgramDetailEligible: Story = materialStory(
  "participant-program-detail-eligible",
  participantProgramDetailEligiblePlay
);
export const ParticipantProgramDetailActive: Story = materialStory(
  "participant-program-detail-active",
  participantProgramDetailActivePlay
);
export const ParticipantProgramDetailPending: Story = materialStory(
  "participant-program-detail-pending",
  participantProgramDetailPendingPlay
);
export const ParticipantProgramDetailRejected: Story = materialStory(
  "participant-program-detail-rejected",
  participantProgramDetailRejectedPlay
);
export const ParticipantEventDetailClosed: Story = materialStory(
  "participant-event-detail-closed",
  participantEventDetailClosedPlay
);
export const ParticipantEventDetailOpen: Story = materialStory(
  "participant-event-detail-open",
  participantEventDetailOpenPlay
);
export const ParticipantEventDetailIneligible: Story = materialStory(
  "participant-event-detail-ineligible",
  participantEventDetailIneligiblePlay
);
export const ManagementDirectoryMixed: Story = materialStory(
  "management-directory-mixed",
  managementDirectoryMixedPlay
);
export const WorkspaceOverviewPopulated: Story = materialStory(
  "workspace-overview-populated"
);
export const WorkspaceOverviewZero: Story = materialStory(
  "workspace-overview-zero"
);
export const WorkspaceEventsMixed: Story = materialStory(
  "workspace-events-mixed",
  workspaceEventsMixedPlay
);
export const WorkspaceParticipantsPending: Story = materialStory(
  "workspace-participants-pending"
);
export const WorkspaceSettingsDirty: Story = materialStory(
  "workspace-settings-dirty",
  workspaceSettingsDirtyPlay
);
export const WorkspaceSettingsConflict: Story = materialStory(
  "workspace-settings-conflict",
  workspaceSettingsConflictPlay
);
export const WorkspaceScheduleFocused: Story = materialStory(
  "workspace-schedule-focused",
  workspaceScheduleFocusedPlay
);
export const WorkspaceScheduleStale: Story = materialStory(
  "workspace-schedule-stale",
  workspaceScheduleStalePlay
);
export const WorkspaceSchedulePartialResume: Story = materialStory(
  "workspace-schedule-partial-resume",
  workspaceSchedulePartialResumePlay
);
export const NotificationsUnread: Story = materialStory(
  "notifications-unread",
  notificationsUnreadPlay
);
export const NotificationsEmptyRecoverable: Story = materialStory(
  "notifications-empty-recoverable",
  notificationsEmptyRecoverablePlay
);
