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

type StorybookMswContext = {
  msw?: {
    resetHandlers: () => void;
    use: (...handlers: RequestHandler[]) => void;
  };
};

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
  link.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      activatedHref = (event.currentTarget as HTMLAnchorElement).getAttribute(
        "href"
      );
    },
    { capture: true, once: true }
  );
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
  "workspace-events-mixed"
);
export const WorkspaceParticipantsPending: Story = materialStory(
  "workspace-participants-pending"
);
export const WorkspaceSettingsDirty: Story = materialStory(
  "workspace-settings-dirty"
);
export const WorkspaceSettingsConflict: Story = materialStory(
  "workspace-settings-conflict"
);
export const WorkspaceScheduleFocused: Story = materialStory(
  "workspace-schedule-focused",
  async ({ canvasElement }) => {
    await assertProgramsScreen(
      canvasElement,
      readinessFor("workspace-schedule-focused")
    );
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: COPY.programs.addRule })
    );
    await expect(
      canvas.getByRole("heading", { name: COPY.programs.addRule })
    ).toBeVisible();
  }
);
export const WorkspaceScheduleStale: Story = materialStory(
  "workspace-schedule-stale"
);
export const WorkspaceSchedulePartialResume: Story = materialStory(
  "workspace-schedule-partial-resume"
);
export const NotificationsUnread: Story = materialStory("notifications-unread");
export const NotificationsEmptyRecoverable: Story = materialStory(
  "notifications-empty-recoverable"
);
