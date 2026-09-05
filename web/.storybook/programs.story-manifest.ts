import {
  ManagementDirectory,
  ParticipantDirectory,
  ParticipantEventDetail,
  ParticipantProgramDetail,
  WorkspaceEvents,
  WorkspaceNotifications,
  WorkspaceOverview,
  WorkspaceParticipants,
  WorkspaceSettings,
} from "./programs.stories";
import { PROGRAMS_PRESENTATION as PRESENTATION } from "./programs.story-contract";

export const programsStoryDeclarations = [
  {
    psn: PRESENTATION.participantDirectory.psn,
    state: "default",
    storyId: PRESENTATION.participantDirectory.storyId,
    story: ParticipantDirectory,
  },
  {
    psn: PRESENTATION.participantProgramDetail.psn,
    state: "default",
    storyId: PRESENTATION.participantProgramDetail.storyId,
    story: ParticipantProgramDetail,
  },
  {
    psn: PRESENTATION.participantEventDetail.psn,
    state: "default",
    storyId: PRESENTATION.participantEventDetail.storyId,
    story: ParticipantEventDetail,
  },
  {
    psn: PRESENTATION.managementDirectory.psn,
    state: "default",
    storyId: PRESENTATION.managementDirectory.storyId,
    story: ManagementDirectory,
  },
  {
    psn: PRESENTATION.workspaceOverview.psn,
    state: "default",
    storyId: PRESENTATION.workspaceOverview.storyId,
    story: WorkspaceOverview,
  },
  {
    psn: PRESENTATION.workspaceEvents.psn,
    state: "default",
    storyId: PRESENTATION.workspaceEvents.storyId,
    story: WorkspaceEvents,
  },
  {
    psn: PRESENTATION.workspaceParticipants.psn,
    state: "default",
    storyId: PRESENTATION.workspaceParticipants.storyId,
    story: WorkspaceParticipants,
  },
  {
    psn: PRESENTATION.workspaceSettings.psn,
    state: "default",
    storyId: PRESENTATION.workspaceSettings.storyId,
    story: WorkspaceSettings,
  },
  {
    psn: PRESENTATION.workspaceNotifications.psn,
    state: "default",
    storyId: PRESENTATION.workspaceNotifications.storyId,
    story: WorkspaceNotifications,
  },
] as const;
