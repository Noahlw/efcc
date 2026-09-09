import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

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
import { assertProgramsScreen } from "./programs-presentation-contract";

const noop = () => {};

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
  args: {
    programId: null,
    canManage: false,
    managementHref: "/programs?mode=management",
    programHref: (programId) => `/programs?program=${programId}`,
    homeHref: "/home",
  },
  parameters: { a11y: { test: "error" } },
} satisfies Meta<typeof ParticipantDirectoryComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

const PROGRAMS_WORKSHOP_NAME = "Storybook Programs Workshop";

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
      psn: "PSN-PROGRAMS-PARTICIPANT-DIRECTORY",
      productFamily: "programs",
      lifecycle: "active",
      baseline: "primary",
      route: "/programs",
      intent: null,
      state: "default",
      gap: null,
      supersedes: [],
    },
    msw: programsParticipantHandlers,
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/programs", query: {} },
    },
  },
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "[data-program-name]",
      text: PROGRAMS_WORKSHOP_NAME,
    }),
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
      psn: "PSN-PROGRAMS-PARTICIPANT-PROGRAM-DETAIL",
      productFamily: "programs",
      lifecycle: "active",
      baseline: "primary",
      route: "/programs",
      intent: "program=t07-3-program",
      state: "default",
      gap: null,
      supersedes: [],
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
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "#program-detail-title",
      text: PROGRAMS_WORKSHOP_NAME,
    }),
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
      psn: "PSN-PROGRAMS-PARTICIPANT-EVENT-DETAIL",
      productFamily: "programs",
      lifecycle: "active",
      baseline: "primary",
      route: "/programs",
      intent: "program=t07-3-program&event=t07-3-event",
      state: "default",
      gap: null,
      supersedes: [],
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
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "#participant-event-title",
      text: "Storybook management event",
    }),
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
      psn: "PSN-PROGRAMS-MANAGEMENT-DIRECTORY",
      productFamily: "programs",
      lifecycle: "active",
      baseline: "primary",
      route: "/programs",
      intent: "mode=management",
      state: "default",
      gap: null,
      supersedes: [],
    },
    msw: programsManagementHandlers,
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/programs", query: { mode: "management" } },
    },
  },
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "#programs-management-directory-title",
      text: "管理課程目錄",
    }),
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
      psn: "PSN-PROGRAMS-WORKSPACE-OVERVIEW",
      productFamily: "programs",
      lifecycle: "active",
      baseline: "primary",
      route: "/programs",
      intent: "mode=management&program=t07-3-program",
      state: "default",
      gap: null,
      supersedes: [],
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
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "#programs-workspace-title",
      text: PROGRAMS_WORKSHOP_NAME,
    }),
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
      psn: "PSN-PROGRAMS-WORKSPACE-EVENTS",
      productFamily: "programs",
      lifecycle: "active",
      baseline: "primary",
      route: "/programs",
      intent: "mode=management&program=t07-3-program&task=events",
      state: "default",
      gap: null,
      supersedes: [],
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
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "#programs-workspace-events-title",
      text: "聚會",
    }),
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
      psn: "PSN-PROGRAMS-WORKSPACE-PARTICIPANTS",
      productFamily: "programs",
      lifecycle: "active",
      baseline: "primary",
      route: "/programs",
      intent: "mode=management&program=t07-3-program&task=participants",
      state: "default",
      gap: null,
      supersedes: [],
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
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "#programs-workspace-participants-title",
      text: "參與者",
    }),
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
      psn: "PSN-PROGRAMS-WORKSPACE-SETTINGS",
      productFamily: "programs",
      lifecycle: "active",
      baseline: "primary",
      route: "/programs",
      intent: "mode=management&program=t07-3-program&task=settings",
      state: "default",
      gap: null,
      supersedes: [],
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
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "#program-settings-title",
      text: "課程設定",
    }),
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
      psn: "PSN-PROGRAMS-WORKSPACE-NOTIFICATIONS",
      productFamily: "programs",
      lifecycle: "active",
      baseline: "primary",
      route: "/programs",
      intent: "mode=management&task=notifications",
      state: "default",
      gap: null,
      supersedes: [],
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
  play: ({ canvasElement }) =>
    assertProgramsScreen(canvasElement, {
      selector: "#programs-notifications-title",
      text: "管理通知",
    }),
};
