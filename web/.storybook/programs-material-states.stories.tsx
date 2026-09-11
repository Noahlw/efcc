import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect } from "react";
import { expect, userEvent, within } from "storybook/test";

import { COPY } from "@/lib/copy";
import { ParticipantDirectory as ParticipantDirectoryComponent } from "@/lib/programs/participant-directory";
import {
  clearAccessCache,
  clearCatalogCache,
} from "@/lib/programs/program-api";

import { getProgramsStoryScenario } from "./programs-fixtures";
import type { ProgramsMaterialScenarioName } from "./programs-fixtures";
import { assertProgramsScreen } from "./programs-presentation-contract";
import { ProgramsStoryHarness } from "./programs-story-harness";

const meta = {
  title: "T07.3/Programs Material States",
  component: ParticipantDirectoryComponent,
  decorators: [
    ((Story) => {
      clearAccessCache();
      clearCatalogCache();
      useEffect(
        () => () => {
          clearAccessCache();
          clearCatalogCache();
        },
        []
      );
      return <Story />;
    }) satisfies Decorator,
  ],
  parameters: { a11y: { test: "error" } },
} satisfies Meta<typeof ParticipantDirectoryComponent>;

export default meta;

type Story = StoryObj<typeof meta>;

const readinessFor = (name: ProgramsMaterialScenarioName) => {
  if (name === "participant-directory-member") {
    return {
      selector: "[data-program-name]",
      text: "Storybook Programs Workshop",
    };
  }
  if (
    name === "participant-program-detail-active" ||
    name === "participant-program-detail-pending" ||
    name === "participant-program-detail-rejected"
  ) {
    return {
      selector: "#program-detail-title",
      text: "Storybook Programs Workshop",
    };
  }
  if (
    name === "participant-event-detail-closed" ||
    name === "participant-event-detail-open" ||
    name === "participant-event-detail-ineligible"
  ) {
    return {
      selector: "#participant-event-title",
      text: "Storybook management event",
    };
  }
  if (
    name === "participant-directory-capable" ||
    name === "management-directory-mixed"
  ) {
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
      text: "Storybook Programs Workshop",
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
    decorators: [
      ((Story) => {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("efcc_auth_active", "1");
          window.sessionStorage.removeItem("efcc_session_expired");
        }
        return <Story />;
      }) satisfies Decorator,
    ],
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
