import { MANAGEMENT_HUB_PRESENTATION } from "./management-hub.story-contract";
import { managementHubStoryDeclarations } from "./management-hub.story-manifest";
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

export const ALL_PRESENTATION_DECLARATIONS = [
  ...MANAGEMENT_HUB_PRESENTATION_DECLARATIONS,
  ...PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION_DECLARATIONS,
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
