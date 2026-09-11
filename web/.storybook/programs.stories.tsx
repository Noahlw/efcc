import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect } from "react";

import { ParticipantDirectory as ParticipantDirectoryComponent } from "@/lib/programs/participant-directory";
import {
  clearAccessCache,
  clearCatalogCache,
} from "@/lib/programs/program-api";

import {
  programsManagementHandlers,
  programsParticipantHandlers,
} from "./programs-fixtures";
import { assertProgramsScreen } from "./programs-presentation-contract";
import { ProgramsStoryHarness } from "./programs-story-harness";

const withMemberIdentity: Decorator = (Story) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("efcc_auth_active", "1");
    window.sessionStorage.removeItem("efcc_session_expired");
  }
  return <Story />;
};

const withManagerIdentity: Decorator = (Story) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("efcc_auth_active", "1");
    window.sessionStorage.removeItem("efcc_session_expired");
  }
  return <Story />;
};

const withProgramsFixtureIsolation: Decorator = (Story) => {
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
};

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

const PROGRAMS_WORKSHOP_NAME = "Storybook Programs Workshop";

const routeStory = (query: Record<string, string>) => (
  <ProgramsStoryHarness query={query} />
);

const routeParameters = (
  screenId: string,
  psn: string,
  intent: string | null,
  query: Record<string, string>,
  handlers: typeof programsParticipantHandlers
) => ({
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
  msw: handlers,
  nextjs: {
    appDirectory: true,
    navigation: { pathname: "/programs", query },
  },
});

export const ParticipantDirectory: Story = {
  decorators: [withMemberIdentity],
  render: () => routeStory({}),
  parameters: routeParameters(
    "programs-participant-directory",
    "PSN-PROGRAMS-PARTICIPANT-DIRECTORY",
    null,
    {},
    programsParticipantHandlers
  ),
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "[data-program-name]",
      text: PROGRAMS_WORKSHOP_NAME,
    }),
};

export const ParticipantProgramDetail: Story = {
  decorators: [withMemberIdentity],
  render: () => routeStory({ program: "t07-3-program" }),
  parameters: routeParameters(
    "programs-participant-program-detail",
    "PSN-PROGRAMS-PARTICIPANT-PROGRAM-DETAIL",
    "program=t07-3-program",
    { program: "t07-3-program" },
    programsParticipantHandlers
  ),
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "#program-detail-title",
      text: PROGRAMS_WORKSHOP_NAME,
    }),
};

export const ParticipantEventDetail: Story = {
  decorators: [withMemberIdentity],
  render: () => routeStory({ program: "t07-3-program", event: "t07-3-event" }),
  parameters: routeParameters(
    "programs-participant-event-detail",
    "PSN-PROGRAMS-PARTICIPANT-EVENT-DETAIL",
    "program=t07-3-program&event=t07-3-event",
    { program: "t07-3-program", event: "t07-3-event" },
    programsParticipantHandlers
  ),
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "#participant-event-title",
      text: "Storybook management event",
    }),
};

export const ManagementDirectory: Story = {
  decorators: [withManagerIdentity],
  render: () => routeStory({ mode: "management" }),
  parameters: routeParameters(
    "programs-management-directory",
    "PSN-PROGRAMS-MANAGEMENT-DIRECTORY",
    "mode=management",
    { mode: "management" },
    programsManagementHandlers
  ),
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "#programs-management-directory-title",
      text: "管理課程",
    }),
};

export const WorkspaceOverview: Story = {
  decorators: [withManagerIdentity],
  render: () => routeStory({ mode: "management", program: "t07-3-program" }),
  parameters: routeParameters(
    "programs-workspace-overview",
    "PSN-PROGRAMS-WORKSPACE-OVERVIEW",
    "mode=management&program=t07-3-program",
    { mode: "management", program: "t07-3-program" },
    programsManagementHandlers
  ),
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "#programs-workspace-title",
      text: PROGRAMS_WORKSHOP_NAME,
    }),
};

export const WorkspaceEvents: Story = {
  decorators: [withManagerIdentity],
  render: () =>
    routeStory({
      mode: "management",
      program: "t07-3-program",
      task: "events",
    }),
  parameters: routeParameters(
    "programs-workspace-events",
    "PSN-PROGRAMS-WORKSPACE-EVENTS",
    "mode=management&program=t07-3-program&task=events",
    {
      mode: "management",
      program: "t07-3-program",
      task: "events",
    },
    programsManagementHandlers
  ),
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "#programs-workspace-events-title",
      text: "聚會",
    }),
};

export const WorkspaceParticipants: Story = {
  decorators: [withManagerIdentity],
  render: () =>
    routeStory({
      mode: "management",
      program: "t07-3-program",
      task: "participants",
    }),
  parameters: routeParameters(
    "programs-workspace-participants",
    "PSN-PROGRAMS-WORKSPACE-PARTICIPANTS",
    "mode=management&program=t07-3-program&task=participants",
    {
      mode: "management",
      program: "t07-3-program",
      task: "participants",
    },
    programsManagementHandlers
  ),
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "#programs-workspace-participants-title",
      text: "參與者",
    }),
};

export const WorkspaceSettings: Story = {
  decorators: [withManagerIdentity],
  render: () =>
    routeStory({
      mode: "management",
      program: "t07-3-program",
      task: "settings",
    }),
  parameters: routeParameters(
    "programs-workspace-settings",
    "PSN-PROGRAMS-WORKSPACE-SETTINGS",
    "mode=management&program=t07-3-program&task=settings",
    {
      mode: "management",
      program: "t07-3-program",
      task: "settings",
    },
    programsManagementHandlers
  ),
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "#program-settings-title",
      text: "課程設定",
    }),
};

export const WorkspaceSchedule: Story = {
  decorators: [withManagerIdentity],
  render: () =>
    routeStory({
      mode: "management",
      program: "t07-3-program",
      task: "schedule",
    }),
  parameters: routeParameters(
    "programs-workspace-schedule",
    "PSN-PROGRAMS-WORKSPACE-SCHEDULE",
    "mode=management&program=t07-3-program&task=schedule",
    {
      mode: "management",
      program: "t07-3-program",
      task: "schedule",
    },
    programsManagementHandlers
  ),
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "#programs-workspace-title",
      text: "聚會排程",
    }),
};

export const WorkspaceNotifications: Story = {
  decorators: [withManagerIdentity],
  render: () => routeStory({ mode: "management", task: "notifications" }),
  parameters: routeParameters(
    "programs-workspace-notifications",
    "PSN-PROGRAMS-WORKSPACE-NOTIFICATIONS",
    "mode=management&task=notifications",
    { mode: "management", task: "notifications" },
    programsManagementHandlers
  ),
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "#programs-notifications-title",
      text: "通知",
    }),
};
