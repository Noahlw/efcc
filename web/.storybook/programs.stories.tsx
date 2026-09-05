import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { AppShell } from "@/lib/app-shell";
import { ManagementDirectory as ManagementDirectoryComponent } from "@/lib/programs/management-directory";
import { ParticipantDirectory as ParticipantDirectoryComponent } from "@/lib/programs/participant-directory";
import { ParticipantEventDetailPage as ParticipantEventDetailPageComponent } from "@/lib/programs/participant-event-detail-page";
import { ParticipantProgramDetail as ParticipantProgramDetailComponent } from "@/lib/programs/participant-program-detail";
import { ProgramWorkspace as ProgramWorkspaceComponent } from "@/lib/programs/program-workspace";
import { ProgramsNotifications as ProgramsNotificationsComponent } from "@/lib/programs/programs-notifications";
import { WorkspaceRouteProvider } from "@/lib/programs/workspace-context";

import {
  programsManagementHandlers,
  programsParticipantHandlers,
} from "./programs-fixtures";
import { PROGRAMS_PRESENTATION as PRESENTATION } from "./programs.story-contract";

const noop = () => null;

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

const meta = {
  id: "t07-3-programs",
  title: "T07.3/Programs",
  component: ParticipantDirectoryComponent,
  parameters: { a11y: { test: "error" } },
} satisfies Meta<typeof ParticipantDirectoryComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

const assertProgramsScreen = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await expect(canvas.findByRole("main")).resolves.toBeVisible();
};

const workspace = (children: React.ReactNode) => (
  <AppShell>
    <WorkspaceRouteProvider
      value={{ departmentId: "t07-3-department", hash: null }}
    >
      {children}
    </WorkspaceRouteProvider>
  </AppShell>
);

export const ParticipantDirectory: Story = {
  decorators: [withMemberIdentity],
  render: () => (
    <AppShell>
      <ParticipantDirectoryComponent
        programId={null}
        canManage={false}
        managementHref="/programs?mode=management"
        programHref={(programId) => `/programs?program=${programId}`}
        homeHref="/home"
      />
    </AppShell>
  ),
  parameters: {
    presentation: {
      screenId: "programs-participant-directory",
      psn: PRESENTATION.participantDirectory.psn,
    },
    msw: programsParticipantHandlers,
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/programs", query: {} },
    },
  },
  play: ({ canvasElement }) => assertProgramsScreen(canvasElement),
};

export const ParticipantProgramDetail: Story = {
  decorators: [withMemberIdentity],
  render: () => (
    <AppShell>
      <ParticipantProgramDetailComponent
        programId="t07-3-program"
        backHref="/programs"
        canManage={false}
        managementHref="/programs?mode=management&program=t07-3-program"
        eventHref={(eventId) =>
          `/programs?program=t07-3-program&event=${eventId}`
        }
      />
    </AppShell>
  ),
  parameters: {
    presentation: {
      screenId: "programs-participant-program-detail",
      psn: PRESENTATION.participantProgramDetail.psn,
    },
    msw: programsParticipantHandlers,
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/programs",
        query: { program: "t07-3-program" },
      },
    },
  },
  play: ({ canvasElement }) => assertProgramsScreen(canvasElement),
};

export const ParticipantEventDetail: Story = {
  decorators: [withMemberIdentity],
  render: () => (
    <AppShell>
      <ParticipantEventDetailPageComponent
        programId="t07-3-program"
        eventId="t07-3-event"
        origin="programs"
      />
    </AppShell>
  ),
  parameters: {
    presentation: {
      screenId: "programs-participant-event-detail",
      psn: PRESENTATION.participantEventDetail.psn,
    },
    msw: programsParticipantHandlers,
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/programs",
        query: { program: "t07-3-program", event: "t07-3-event" },
      },
    },
  },
  play: ({ canvasElement }) => assertProgramsScreen(canvasElement),
};

export const ManagementDirectory: Story = {
  decorators: [withManagerIdentity],
  render: () => (
    <AppShell>
      <ManagementDirectoryComponent onOpenProgram={noop} />
    </AppShell>
  ),
  parameters: {
    presentation: {
      screenId: "programs-management-directory",
      psn: PRESENTATION.managementDirectory.psn,
    },
    msw: programsManagementHandlers,
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/programs", query: { mode: "management" } },
    },
  },
  play: ({ canvasElement }) => assertProgramsScreen(canvasElement),
};

export const WorkspaceOverview: Story = {
  decorators: [withManagerIdentity],
  render: () =>
    workspace(
      <ProgramWorkspaceComponent
        programId="t07-3-program"
        onBack={noop}
        onTaskChange={noop}
        onEventChange={noop}
      />
    ),
  parameters: {
    presentation: {
      screenId: "programs-workspace-overview",
      psn: PRESENTATION.workspaceOverview.psn,
    },
    msw: programsManagementHandlers,
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/programs",
        query: { mode: "management", program: "t07-3-program" },
      },
    },
  },
  play: ({ canvasElement }) => assertProgramsScreen(canvasElement),
};

export const WorkspaceEvents: Story = {
  decorators: [withManagerIdentity],
  render: () =>
    workspace(
      <ProgramWorkspaceComponent
        programId="t07-3-program"
        task="events"
        onBack={noop}
        onTaskChange={noop}
        onEventChange={noop}
      />
    ),
  parameters: {
    presentation: {
      screenId: "programs-workspace-events",
      psn: PRESENTATION.workspaceEvents.psn,
    },
    msw: programsManagementHandlers,
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/programs",
        query: { mode: "management", program: "t07-3-program", task: "events" },
      },
    },
  },
  play: ({ canvasElement }) => assertProgramsScreen(canvasElement),
};

export const WorkspaceParticipants: Story = {
  decorators: [withManagerIdentity],
  render: () =>
    workspace(
      <ProgramWorkspaceComponent
        programId="t07-3-program"
        task="participants"
        onBack={noop}
        onTaskChange={noop}
        onEventChange={noop}
      />
    ),
  parameters: {
    presentation: {
      screenId: "programs-workspace-participants",
      psn: PRESENTATION.workspaceParticipants.psn,
    },
    msw: programsManagementHandlers,
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/programs",
        query: {
          mode: "management",
          program: "t07-3-program",
          task: "participants",
        },
      },
    },
  },
  play: ({ canvasElement }) => assertProgramsScreen(canvasElement),
};

export const WorkspaceSettings: Story = {
  decorators: [withManagerIdentity],
  render: () =>
    workspace(
      <ProgramWorkspaceComponent
        programId="t07-3-program"
        task="settings"
        onBack={noop}
        onTaskChange={noop}
        onEventChange={noop}
      />
    ),
  parameters: {
    presentation: {
      screenId: "programs-workspace-settings",
      psn: PRESENTATION.workspaceSettings.psn,
    },
    msw: programsManagementHandlers,
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/programs",
        query: {
          mode: "management",
          program: "t07-3-program",
          task: "settings",
        },
      },
    },
  },
  play: ({ canvasElement }) => assertProgramsScreen(canvasElement),
};

export const WorkspaceNotifications: Story = {
  decorators: [withManagerIdentity],
  render: () => (
    <AppShell>
      <ProgramsNotificationsComponent
        state={{
          kind: "ready",
          notifications: { items: [], unread_count: 0, has_more: false },
        }}
        status="ready"
        onRetry={noop}
        onMarkRead={noop}
        full
      />
    </AppShell>
  ),
  parameters: {
    presentation: {
      screenId: "programs-workspace-notifications",
      psn: PRESENTATION.workspaceNotifications.psn,
    },
    msw: programsManagementHandlers,
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/programs",
        query: { mode: "management", task: "notifications" },
      },
    },
  },
  play: ({ canvasElement }) => assertProgramsScreen(canvasElement),
};
