import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";

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
    parameters: {
      msw: scenario.handlers,
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

export const ParticipantDirectoryMember: Story = materialStory(
  "participant-directory-member"
);
export const ParticipantDirectoryCapable: Story = materialStory(
  "participant-directory-capable"
);
export const ParticipantProgramDetailActive: Story = materialStory(
  "participant-program-detail-active"
);
export const ParticipantProgramDetailPending: Story = materialStory(
  "participant-program-detail-pending"
);
export const ParticipantProgramDetailRejected: Story = materialStory(
  "participant-program-detail-rejected"
);
export const ParticipantEventDetailClosed: Story = materialStory(
  "participant-event-detail-closed"
);
export const ParticipantEventDetailOpen: Story = materialStory(
  "participant-event-detail-open"
);
export const ParticipantEventDetailIneligible: Story = materialStory(
  "participant-event-detail-ineligible"
);
export const ManagementDirectoryMixed: Story = materialStory(
  "management-directory-mixed"
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
