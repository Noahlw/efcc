import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ParticipantDirectory as ParticipantDirectoryComponent } from "@/lib/programs/participant-directory";

import { getProgramsStoryScenario } from "./programs-fixtures";
import type { ProgramsMaterialScenarioName } from "./programs-fixtures";
import { assertProgramsScreen } from "./programs-presentation-contract";
import {
  ProgramsStoryHarness,
  withProgramsFixtureIsolation,
} from "./programs-story-harness";

const meta = {
  id: "t07-3-programs",
  title: "T07.3/Programs",
  component: ParticipantDirectoryComponent,
  args: {
    programId: null,
    canManage: false,
    managementHref: "/programs?mode=management",
    programHref: (programId) => "/programs?program=" + programId,
    homeHref: "/home",
  },
  decorators: [withProgramsFixtureIsolation],
  parameters: { a11y: { test: "error" } },
} satisfies Meta<typeof ParticipantDirectoryComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

const PROGRAMS_WORKSHOP_NAME = "門徒訓練基礎課";

const routeStory = (scenarioName: ProgramsMaterialScenarioName) => {
  const scenario = getProgramsStoryScenario(scenarioName);
  return <ProgramsStoryHarness query={{ ...scenario.query }} />;
};

const routeParameters = (
  screenId: string,
  psn: string,
  intent: string | null,
  query: Record<string, string>,
  scenarioName: ProgramsMaterialScenarioName
) => {
  const scenario = getProgramsStoryScenario(scenarioName);
  return {
    presentation: {
      screenId,
      psn,
      productFamily: "programs",
      lifecycle: "active" as const,
      baseline: "primary" as const,
      route: "/programs",
      intent,
      state: "default",
      gap: "ISSUE-#601",
      supersedes: [],
    },
    programsScenario: scenarioName,
    msw: scenario.handlers,
    nextjs: {
      appDirectory: true,
      navigation: { pathname: scenario.pathname, query },
    },
  };
};

export const ParticipantDirectory: Story = {
  render: () => routeStory("participant-directory-member"),
  parameters: routeParameters(
    "programs-participant-directory",
    "PSN-PROGRAMS-PARTICIPANT-DIRECTORY",
    null,
    {},
    "participant-directory-member"
  ),
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "[data-program-name]",
      text: PROGRAMS_WORKSHOP_NAME,
    }),
};

export const ParticipantProgramDetail: Story = {
  render: () => routeStory("participant-program-detail-active"),
  parameters: routeParameters(
    "programs-participant-program-detail",
    "PSN-PROGRAMS-PARTICIPANT-PROGRAM-DETAIL",
    "program=t07-3-program",
    { program: "t07-3-program" },
    "participant-program-detail-active"
  ),
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "#program-detail-title",
      text: PROGRAMS_WORKSHOP_NAME,
    }),
};

export const ParticipantEventDetail: Story = {
  render: () => routeStory("participant-event-detail-closed"),
  parameters: routeParameters(
    "programs-participant-event-detail",
    "PSN-PROGRAMS-PARTICIPANT-EVENT-DETAIL",
    "program=t07-3-program&event=t07-3-event",
    { program: "t07-3-program", event: "t07-3-event" },
    "participant-event-detail-closed"
  ),
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "#participant-event-title",
      text: "門徒訓練週會",
    }),
};

export const ManagementDirectory: Story = {
  render: () => routeStory("management-directory-mixed"),
  parameters: routeParameters(
    "programs-management-directory",
    "PSN-PROGRAMS-MANAGEMENT-DIRECTORY",
    "mode=management",
    { mode: "management" },
    "management-directory-mixed"
  ),
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "#programs-management-directory-title",
      text: "管理課程",
    }),
};

export const WorkspaceOverview: Story = {
  render: () => routeStory("workspace-overview-populated"),
  parameters: routeParameters(
    "programs-workspace-overview",
    "PSN-PROGRAMS-WORKSPACE-OVERVIEW",
    "mode=management&program=t07-3-program",
    { mode: "management", program: "t07-3-program" },
    "workspace-overview-populated"
  ),
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "#programs-workspace-title",
      text: PROGRAMS_WORKSHOP_NAME,
    }),
};

export const WorkspaceEvents: Story = {
  render: () => routeStory("workspace-events-mixed"),
  parameters: routeParameters(
    "programs-workspace-events",
    "PSN-PROGRAMS-WORKSPACE-EVENTS",
    "mode=management&program=t07-3-program&task=events",
    {
      mode: "management",
      program: "t07-3-program",
      task: "events",
    },
    "workspace-events-mixed"
  ),
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "#programs-workspace-events-title",
      text: "聚會",
    }),
};

export const WorkspaceParticipants: Story = {
  render: () => routeStory("workspace-participants-pending"),
  parameters: routeParameters(
    "programs-workspace-participants",
    "PSN-PROGRAMS-WORKSPACE-PARTICIPANTS",
    "mode=management&program=t07-3-program&task=participants",
    {
      mode: "management",
      program: "t07-3-program",
      task: "participants",
    },
    "workspace-participants-pending"
  ),
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "#programs-workspace-participants-title",
      text: "參與者",
    }),
};

export const WorkspaceSettings: Story = {
  render: () => routeStory("workspace-settings-dirty"),
  parameters: routeParameters(
    "programs-workspace-settings",
    "PSN-PROGRAMS-WORKSPACE-SETTINGS",
    "mode=management&program=t07-3-program&task=settings",
    {
      mode: "management",
      program: "t07-3-program",
      task: "settings",
    },
    "workspace-settings-dirty"
  ),
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "#program-settings-title",
      text: "課程設定",
    }),
};

export const WorkspaceSchedule: Story = {
  render: () => routeStory("workspace-schedule-focused"),
  parameters: routeParameters(
    "programs-workspace-schedule",
    "PSN-PROGRAMS-WORKSPACE-SCHEDULE",
    "mode=management&program=t07-3-program&task=schedule",
    {
      mode: "management",
      program: "t07-3-program",
      task: "schedule",
    },
    "workspace-schedule-focused"
  ),
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "#programs-workspace-title",
      text: "聚會排程",
    }),
};

export const WorkspaceNotifications: Story = {
  render: () => routeStory("notifications-unread"),
  parameters: routeParameters(
    "programs-workspace-notifications",
    "PSN-PROGRAMS-WORKSPACE-NOTIFICATIONS",
    "mode=management&task=notifications",
    { mode: "management", task: "notifications" },
    "notifications-unread"
  ),
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "#programs-notifications-title",
      text: "通知",
    }),
};
