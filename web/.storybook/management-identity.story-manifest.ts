import {
  AccountAccess,
  AccountDirectory,
  ApprovalDetail,
  ApprovalQueue,
  CheckinSettings,
  HomeCms,
  MemberDirectory,
  PermissionEditor,
  RoleHierarchy,
  SettingsHub,
  TimezoneSettings,
} from "./management-identity.stories";
import { MANAGEMENT_IDENTITY_PRESENTATION as PRESENTATION } from "./management-identity.story-contract";

export const managementIdentityStoryDeclarations = [
  {
    psn: PRESENTATION.accountDirectory.psn,
    state: "default",
    storyId: PRESENTATION.accountDirectory.storyId,
    story: AccountDirectory,
  },
  {
    psn: PRESENTATION.accountAccess.psn,
    state: "default",
    storyId: PRESENTATION.accountAccess.storyId,
    story: AccountAccess,
  },
  {
    psn: PRESENTATION.approvalQueue.psn,
    state: "default",
    storyId: PRESENTATION.approvalQueue.storyId,
    story: ApprovalQueue,
  },
  {
    psn: PRESENTATION.approvalDetail.psn,
    state: "default",
    storyId: PRESENTATION.approvalDetail.storyId,
    story: ApprovalDetail,
  },
  {
    psn: PRESENTATION.memberDirectory.psn,
    state: "default",
    storyId: PRESENTATION.memberDirectory.storyId,
    story: MemberDirectory,
  },
  {
    psn: PRESENTATION.homeCms.psn,
    state: "default",
    storyId: PRESENTATION.homeCms.storyId,
    story: HomeCms,
  },
  {
    psn: PRESENTATION.permissionEditor.psn,
    state: "default",
    storyId: PRESENTATION.permissionEditor.storyId,
    story: PermissionEditor,
  },
  {
    psn: PRESENTATION.roleHierarchy.psn,
    state: "default",
    storyId: PRESENTATION.roleHierarchy.storyId,
    story: RoleHierarchy,
  },
  {
    psn: PRESENTATION.settingsHub.psn,
    state: "default",
    storyId: PRESENTATION.settingsHub.storyId,
    story: SettingsHub,
  },
  {
    psn: PRESENTATION.checkinSettings.psn,
    state: "default",
    storyId: PRESENTATION.checkinSettings.storyId,
    story: CheckinSettings,
  },
  {
    psn: PRESENTATION.timezoneSettings.psn,
    state: "default",
    storyId: PRESENTATION.timezoneSettings.storyId,
    story: TimezoneSettings,
  },
] as const;
