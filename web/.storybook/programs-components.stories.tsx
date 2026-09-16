import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";

import { AppShell } from "@/lib/app-shell";
import { EventDetail as EventDetailComponent } from "@/lib/programs/event-detail";
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

const noop = () => {
  // Component-only Story callbacks intentionally have no side effect.
};

const withMemberIdentity: Decorator = (Story) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("efcc_auth_active", "1");
    window.sessionStorage.removeItem("efcc_session_expired");
  }
  return <Story />;
};

const withManagerIdentity: Decorator = withMemberIdentity;

const meta = {
  id: "t07-3-program-components",
  title: "T07.3/Programs/Components",
  component: ParticipantDirectoryComponent,
  parameters: {
    a11y: { test: "error" },
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/programs", query: {} },
    },
  },
} satisfies Meta<typeof ParticipantDirectoryComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

const workspace = (children: React.ReactNode) => (
  <AppShell>
    <WorkspaceRouteProvider
      value={{ departmentId: "t07-3-department", hash: null }}
    >
      {children}
    </WorkspaceRouteProvider>
  </AppShell>
);

export const ParticipantDirectoryLeaf: Story = {
  tags: ["component-only"],
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
  parameters: { msw: programsParticipantHandlers },
};

export const ParticipantProgramDetailLeaf: Story = {
  tags: ["component-only"],
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
  parameters: { msw: programsParticipantHandlers },
};

export const ParticipantEventDetailLeaf: Story = {
  tags: ["component-only"],
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
  parameters: { msw: programsParticipantHandlers },
};

export const ManagerEventDetailLeaf: Story = {
  tags: ["component-only"],
  decorators: [withManagerIdentity],
  render: () => (
    <AppShell>
      <EventDetailComponent
        programId="t07-3-program"
        eventId="t07-3-event"
        canManage
        departmentId="t07-3-department"
        backHref="/programs?mode=management&program=t07-3-program&task=events"
      />
    </AppShell>
  ),
  parameters: { msw: programsManagementHandlers },
};

export const ManagementDirectoryLeaf: Story = {
  tags: ["component-only"],
  decorators: [withManagerIdentity],
  render: () => (
    <AppShell>
      <ManagementDirectoryComponent onOpenProgram={noop} />
    </AppShell>
  ),
  parameters: { msw: programsManagementHandlers },
};

export const WorkspaceOverviewLeaf: Story = {
  tags: ["component-only"],
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
  parameters: { msw: programsManagementHandlers },
};

export const WorkspaceEventsLeaf: Story = {
  tags: ["component-only"],
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
  parameters: { msw: programsManagementHandlers },
};

export const WorkspaceParticipantsLeaf: Story = {
  tags: ["component-only"],
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
  parameters: { msw: programsManagementHandlers },
};

export const WorkspaceSettingsLeaf: Story = {
  tags: ["component-only"],
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
  parameters: { msw: programsManagementHandlers },
};

export const WorkspaceScheduleLeaf: Story = {
  tags: ["component-only"],
  decorators: [withManagerIdentity],
  render: () =>
    workspace(
      <ProgramWorkspaceComponent
        programId="t07-3-program"
        task="schedule"
        onBack={noop}
        onTaskChange={noop}
        onEventChange={noop}
      />
    ),
  parameters: { msw: programsManagementHandlers },
};

export const WorkspaceNotificationsLeaf: Story = {
  tags: ["component-only"],
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
  parameters: { msw: programsManagementHandlers },
};
