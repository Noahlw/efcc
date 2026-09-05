import { ATTENDANCE_SCANNER_GUEST_PRESENTATION } from "./attendance-scanner-guest.story-contract";
import { attendanceScannerGuestStoryDeclarations } from "./attendance-scanner-guest.story-manifest";
import { MANAGEMENT_HUB_PRESENTATION } from "./management-hub.story-contract";
import { managementHubStoryDeclarations } from "./management-hub.story-manifest";
import { MANAGEMENT_IDENTITY_PRESENTATION } from "./management-identity.story-contract";
import { managementIdentityStoryDeclarations } from "./management-identity.story-manifest";
import { PROGRAMS_PRESENTATION } from "./programs.story-contract";
import { programsStoryDeclarations } from "./programs.story-manifest";
import { PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION } from "./public-auth-member-communications.story-contract";
import { publicAuthMemberCommunicationsStoryDeclarations } from "./public-auth-member-communications.story-manifest";

export interface PresentationStoryDeclaration {
  readonly psn: string;
  readonly storyId: string;
  readonly state: string;
}

interface OwnedStoryDeclaration extends PresentationStoryDeclaration {
  readonly story: unknown;
}

/** Discover PSNs and Story IDs from the Stories that own their presentation state. */
export function discoverPresentationDeclarations(
  stories: readonly OwnedStoryDeclaration[]
): readonly PresentationStoryDeclaration[] {
  return stories.map(({ story, ...declaration }) => {
    if (!story) {
      throw new Error(`Presentation Story is missing: ${declaration.storyId}`);
    }
    return declaration;
  });
}

export const MANAGEMENT_HUB_PRESENTATION_DECLARATIONS =
  discoverPresentationDeclarations(managementHubStoryDeclarations);

export const PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION_DECLARATIONS =
  discoverPresentationDeclarations(
    publicAuthMemberCommunicationsStoryDeclarations
  );

export const PROGRAMS_PRESENTATION_DECLARATIONS =
  discoverPresentationDeclarations(programsStoryDeclarations);

export const MANAGEMENT_IDENTITY_PRESENTATION_DECLARATIONS =
  discoverPresentationDeclarations(managementIdentityStoryDeclarations);

export const ATTENDANCE_SCANNER_GUEST_PRESENTATION_DECLARATIONS =
  discoverPresentationDeclarations(attendanceScannerGuestStoryDeclarations);

export const ALL_PRESENTATION_DECLARATIONS = [
  ...MANAGEMENT_HUB_PRESENTATION_DECLARATIONS,
  ...PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION_DECLARATIONS,
  ...PROGRAMS_PRESENTATION_DECLARATIONS,
  ...MANAGEMENT_IDENTITY_PRESENTATION_DECLARATIONS,
  ...ATTENDANCE_SCANNER_GUEST_PRESENTATION_DECLARATIONS,
] as const;

export interface ScreenCatalogEntry {
  readonly screenId: string;
  readonly route: string;
  readonly primaryPsn: string;
  readonly psns: readonly string[];
  readonly storyIds: readonly string[];
}

/**
 * Thin catalog index derived from owning Story declarations.
 * It does not own Story args, fixtures, contracts, approval state, or viewport matrices.
 */
export const SCREEN_CATALOG: readonly ScreenCatalogEntry[] = [
  {
    screenId: "management-hub",
    route: "/management",
    primaryPsn: MANAGEMENT_HUB_PRESENTATION.default.psn,
    psns: MANAGEMENT_HUB_PRESENTATION_DECLARATIONS.map(({ psn }) => psn),
    storyIds: MANAGEMENT_HUB_PRESENTATION_DECLARATIONS.map(
      ({ storyId }) => storyId
    ),
  },
  {
    screenId: "auth-sign-in",
    route: "/",
    primaryPsn: PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.signIn.psn,
    psns: [PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.signIn.psn],
    storyIds: [PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.signIn.storyId],
  },
  {
    screenId: "auth-register",
    route: "/register",
    primaryPsn: PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.register.psn,
    psns: [PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.register.psn],
    storyIds: [PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.register.storyId],
  },
  {
    screenId: "member-home",
    route: "/home",
    primaryPsn: PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.home.psn,
    psns: [PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.home.psn],
    storyIds: [PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.home.storyId],
  },
  {
    screenId: "member-profile",
    route: "/profile",
    primaryPsn: PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.profile.psn,
    psns: [PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.profile.psn],
    storyIds: [PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.profile.storyId],
  },
  {
    screenId: "member-account-settings",
    route: "/profile/settings",
    primaryPsn:
      PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.accountSettings.psn,
    psns: [PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.accountSettings.psn],
    storyIds: [
      PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.accountSettings.storyId,
    ],
  },
  {
    screenId: "communications-notices",
    route: "/notices",
    primaryPsn: PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.notices.psn,
    psns: [PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.notices.psn],
    storyIds: [PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.notices.storyId],
  },
  {
    screenId: "communications-messages",
    route: "/messages",
    primaryPsn: PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.messages.psn,
    psns: [PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.messages.psn],
    storyIds: [PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.messages.storyId],
  },
  {
    screenId: "public-not-found",
    route: "/not-found",
    primaryPsn: PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.notFound.psn,
    psns: [PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.notFound.psn],
    storyIds: [PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION.notFound.storyId],
  },
  {
    screenId: "programs-participant-directory",
    route: "/programs",
    primaryPsn: PROGRAMS_PRESENTATION.participantDirectory.psn,
    psns: [PROGRAMS_PRESENTATION.participantDirectory.psn],
    storyIds: [PROGRAMS_PRESENTATION.participantDirectory.storyId],
  },
  {
    screenId: "programs-participant-program-detail",
    route: "/programs",
    primaryPsn: PROGRAMS_PRESENTATION.participantProgramDetail.psn,
    psns: [PROGRAMS_PRESENTATION.participantProgramDetail.psn],
    storyIds: [PROGRAMS_PRESENTATION.participantProgramDetail.storyId],
  },
  {
    screenId: "programs-participant-event-detail",
    route: "/programs",
    primaryPsn: PROGRAMS_PRESENTATION.participantEventDetail.psn,
    psns: [PROGRAMS_PRESENTATION.participantEventDetail.psn],
    storyIds: [PROGRAMS_PRESENTATION.participantEventDetail.storyId],
  },
  {
    screenId: "programs-management-directory",
    route: "/programs",
    primaryPsn: PROGRAMS_PRESENTATION.managementDirectory.psn,
    psns: [PROGRAMS_PRESENTATION.managementDirectory.psn],
    storyIds: [PROGRAMS_PRESENTATION.managementDirectory.storyId],
  },
  {
    screenId: "programs-workspace-overview",
    route: "/programs",
    primaryPsn: PROGRAMS_PRESENTATION.workspaceOverview.psn,
    psns: [PROGRAMS_PRESENTATION.workspaceOverview.psn],
    storyIds: [PROGRAMS_PRESENTATION.workspaceOverview.storyId],
  },
  {
    screenId: "programs-workspace-events",
    route: "/programs",
    primaryPsn: PROGRAMS_PRESENTATION.workspaceEvents.psn,
    psns: [PROGRAMS_PRESENTATION.workspaceEvents.psn],
    storyIds: [PROGRAMS_PRESENTATION.workspaceEvents.storyId],
  },
  {
    screenId: "programs-workspace-participants",
    route: "/programs",
    primaryPsn: PROGRAMS_PRESENTATION.workspaceParticipants.psn,
    psns: [PROGRAMS_PRESENTATION.workspaceParticipants.psn],
    storyIds: [PROGRAMS_PRESENTATION.workspaceParticipants.storyId],
  },
  {
    screenId: "programs-workspace-settings",
    route: "/programs",
    primaryPsn: PROGRAMS_PRESENTATION.workspaceSettings.psn,
    psns: [PROGRAMS_PRESENTATION.workspaceSettings.psn],
    storyIds: [PROGRAMS_PRESENTATION.workspaceSettings.storyId],
  },
  {
    screenId: "programs-workspace-notifications",
    route: "/programs",
    primaryPsn: PROGRAMS_PRESENTATION.workspaceNotifications.psn,
    psns: [PROGRAMS_PRESENTATION.workspaceNotifications.psn],
    storyIds: [PROGRAMS_PRESENTATION.workspaceNotifications.storyId],
  },
  {
    screenId: "management-account-directory",
    route: "/management",
    primaryPsn: MANAGEMENT_IDENTITY_PRESENTATION.accountDirectory.psn,
    psns: [MANAGEMENT_IDENTITY_PRESENTATION.accountDirectory.psn],
    storyIds: [MANAGEMENT_IDENTITY_PRESENTATION.accountDirectory.storyId],
  },
  {
    screenId: "management-account-access",
    route: "/management",
    primaryPsn: MANAGEMENT_IDENTITY_PRESENTATION.accountAccess.psn,
    psns: [MANAGEMENT_IDENTITY_PRESENTATION.accountAccess.psn],
    storyIds: [MANAGEMENT_IDENTITY_PRESENTATION.accountAccess.storyId],
  },
  {
    screenId: "management-approval-queue",
    route: "/management",
    primaryPsn: MANAGEMENT_IDENTITY_PRESENTATION.approvalQueue.psn,
    psns: [MANAGEMENT_IDENTITY_PRESENTATION.approvalQueue.psn],
    storyIds: [MANAGEMENT_IDENTITY_PRESENTATION.approvalQueue.storyId],
  },
  {
    screenId: "management-approval-detail",
    route: "/management",
    primaryPsn: MANAGEMENT_IDENTITY_PRESENTATION.approvalDetail.psn,
    psns: [MANAGEMENT_IDENTITY_PRESENTATION.approvalDetail.psn],
    storyIds: [MANAGEMENT_IDENTITY_PRESENTATION.approvalDetail.storyId],
  },
  {
    screenId: "management-member-directory",
    route: "/management",
    primaryPsn: MANAGEMENT_IDENTITY_PRESENTATION.memberDirectory.psn,
    psns: [MANAGEMENT_IDENTITY_PRESENTATION.memberDirectory.psn],
    storyIds: [MANAGEMENT_IDENTITY_PRESENTATION.memberDirectory.storyId],
  },
  {
    screenId: "management-home-cms",
    route: "/management",
    primaryPsn: MANAGEMENT_IDENTITY_PRESENTATION.homeCms.psn,
    psns: [MANAGEMENT_IDENTITY_PRESENTATION.homeCms.psn],
    storyIds: [MANAGEMENT_IDENTITY_PRESENTATION.homeCms.storyId],
  },
  {
    screenId: "identity-permission-editor",
    route: "/management",
    primaryPsn: MANAGEMENT_IDENTITY_PRESENTATION.permissionEditor.psn,
    psns: [MANAGEMENT_IDENTITY_PRESENTATION.permissionEditor.psn],
    storyIds: [MANAGEMENT_IDENTITY_PRESENTATION.permissionEditor.storyId],
  },
  {
    screenId: "identity-role-hierarchy",
    route: "/management",
    primaryPsn: MANAGEMENT_IDENTITY_PRESENTATION.roleHierarchy.psn,
    psns: [MANAGEMENT_IDENTITY_PRESENTATION.roleHierarchy.psn],
    storyIds: [MANAGEMENT_IDENTITY_PRESENTATION.roleHierarchy.storyId],
  },
  {
    screenId: "management-settings-hub",
    route: "/management",
    primaryPsn: MANAGEMENT_IDENTITY_PRESENTATION.settingsHub.psn,
    psns: [MANAGEMENT_IDENTITY_PRESENTATION.settingsHub.psn],
    storyIds: [MANAGEMENT_IDENTITY_PRESENTATION.settingsHub.storyId],
  },
  {
    screenId: "management-checkin-settings",
    route: "/management",
    primaryPsn: MANAGEMENT_IDENTITY_PRESENTATION.checkinSettings.psn,
    psns: [MANAGEMENT_IDENTITY_PRESENTATION.checkinSettings.psn],
    storyIds: [MANAGEMENT_IDENTITY_PRESENTATION.checkinSettings.storyId],
  },
  {
    screenId: "management-timezone-settings",
    route: "/management",
    primaryPsn: MANAGEMENT_IDENTITY_PRESENTATION.timezoneSettings.psn,
    psns: [MANAGEMENT_IDENTITY_PRESENTATION.timezoneSettings.psn],
    storyIds: [MANAGEMENT_IDENTITY_PRESENTATION.timezoneSettings.storyId],
  },
  {
    screenId: "attendance-guest-check-in",
    route: "/guest-check-in",
    primaryPsn: ATTENDANCE_SCANNER_GUEST_PRESENTATION.guestCheckIn.psn,
    psns: [ATTENDANCE_SCANNER_GUEST_PRESENTATION.guestCheckIn.psn],
    storyIds: [ATTENDANCE_SCANNER_GUEST_PRESENTATION.guestCheckIn.storyId],
  },
  {
    screenId: "attendance-scanner-boundary",
    route: "/scanner",
    primaryPsn: ATTENDANCE_SCANNER_GUEST_PRESENTATION.scannerBoundary.psn,
    psns: [ATTENDANCE_SCANNER_GUEST_PRESENTATION.scannerBoundary.psn],
    storyIds: [ATTENDANCE_SCANNER_GUEST_PRESENTATION.scannerBoundary.storyId],
  },
  {
    screenId: "attendance-assisted-check-in",
    route: "/scanner",
    primaryPsn: ATTENDANCE_SCANNER_GUEST_PRESENTATION.assistedCheckIn.psn,
    psns: [ATTENDANCE_SCANNER_GUEST_PRESENTATION.assistedCheckIn.psn],
    storyIds: [ATTENDANCE_SCANNER_GUEST_PRESENTATION.assistedCheckIn.storyId],
  },
  {
    screenId: "attendance-operator",
    route: "/events",
    primaryPsn: ATTENDANCE_SCANNER_GUEST_PRESENTATION.operator.psn,
    psns: [ATTENDANCE_SCANNER_GUEST_PRESENTATION.operator.psn],
    storyIds: [ATTENDANCE_SCANNER_GUEST_PRESENTATION.operator.storyId],
  },
  {
    screenId: "attendance-operator-roster",
    route: "/events",
    primaryPsn: ATTENDANCE_SCANNER_GUEST_PRESENTATION.operatorRoster.psn,
    psns: [ATTENDANCE_SCANNER_GUEST_PRESENTATION.operatorRoster.psn],
    storyIds: [ATTENDANCE_SCANNER_GUEST_PRESENTATION.operatorRoster.storyId],
  },
];

export function validateScreenCatalog(
  catalog: readonly ScreenCatalogEntry[],
  declarations: readonly PresentationStoryDeclaration[]
): string[] {
  const errors: string[] = [];
  const psns = new Set<string>();
  const storyIds = new Set<string>();

  for (const declaration of declarations) {
    if (psns.has(declaration.psn)) {
      errors.push(`Duplicate PSN declaration: ${declaration.psn}`);
    }
    psns.add(declaration.psn);

    if (storyIds.has(declaration.storyId)) {
      errors.push(`Duplicate Story declaration: ${declaration.storyId}`);
    }
    storyIds.add(declaration.storyId);
  }

  const catalogScreenIds = new Set<string>();
  const catalogPsnRefs = new Set<string>();
  const catalogStoryRefs = new Set<string>();

  for (const entry of catalog) {
    if (catalogScreenIds.has(entry.screenId)) {
      errors.push(`Duplicate Screen Catalog entry: ${entry.screenId}`);
    }
    catalogScreenIds.add(entry.screenId);

    if (!entry.primaryPsn.startsWith("PSN-")) {
      errors.push(`Invalid primary PSN: ${entry.primaryPsn}`);
    }
    if (!psns.has(entry.primaryPsn)) {
      errors.push(
        `${entry.screenId} references unknown primary PSN: ${entry.primaryPsn}`
      );
    }

    for (const psn of entry.psns) {
      if (!psns.has(psn)) {
        errors.push(`${entry.screenId} references unknown PSN: ${psn}`);
      }
      if (catalogPsnRefs.has(psn)) {
        errors.push(`PSN is cataloged more than once: ${psn}`);
      }
      catalogPsnRefs.add(psn);
    }

    for (const storyId of entry.storyIds) {
      if (!storyIds.has(storyId)) {
        errors.push(`${entry.screenId} references unknown Story: ${storyId}`);
      }
      if (catalogStoryRefs.has(storyId)) {
        errors.push(`Story is cataloged more than once: ${storyId}`);
      }
      catalogStoryRefs.add(storyId);
    }

    if (!entry.psns.includes(entry.primaryPsn)) {
      errors.push(`${entry.screenId} primary PSN is not in its PSN set`);
    }
  }

  for (const declaration of declarations) {
    if (!catalogPsnRefs.has(declaration.psn)) {
      errors.push(`Uncataloged PSN declaration: ${declaration.psn}`);
    }
    if (!catalogStoryRefs.has(declaration.storyId)) {
      errors.push(`Uncataloged Story declaration: ${declaration.storyId}`);
    }
  }

  return errors;
}
