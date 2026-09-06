import { attendanceScannerGuestStoryDeclarations } from "./attendance-scanner-guest.story-manifest";
import { managementHubStoryDeclarations } from "./management-hub.story-manifest";
import { managementIdentityStoryDeclarations } from "./management-identity.story-manifest";
import type {
  PresentationMetadata,
  PresentationStoryDeclaration,
} from "./presentation-meta";
import { programsStoryDeclarations } from "./programs.story-manifest";
import { publicAuthMemberCommunicationsStoryDeclarations } from "./public-auth-member-communications.story-manifest";

export type {
  PresentationMetadata,
  PresentationStoryDeclaration,
} from "./presentation-meta";

export type PresentationDeclaration = Omit<
  PresentationStoryDeclaration,
  "story"
>;

export function discoverPresentationDeclarations(
  stories: readonly PresentationStoryDeclaration[]
): readonly PresentationDeclaration[] {
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
  readonly productFamily: string;
  readonly lifecycle: PresentationMetadata["lifecycle"];
  readonly primaryBaselinePsn: string;
  readonly route: string;
  readonly intent: string | null;
  readonly gap: string | null;
  readonly supersedes: readonly string[];
  readonly psns: readonly string[];
  readonly storyIds: readonly string[];
}

type MutableScreenCatalogEntry = Omit<
  ScreenCatalogEntry,
  "psns" | "storyIds" | "primaryBaselinePsn"
> & {
  primaryBaselinePsn: string;
  psns: string[];
  storyIds: string[];
};

export function createScreenCatalog(
  declarations: readonly PresentationDeclaration[]
): readonly ScreenCatalogEntry[] {
  const entries = new Map<string, MutableScreenCatalogEntry>();

  for (const declaration of declarations) {
    const current = entries.get(declaration.screenId);
    if (!current) {
      entries.set(declaration.screenId, {
        screenId: declaration.screenId,
        productFamily: declaration.productFamily,
        lifecycle: declaration.lifecycle,
        primaryBaselinePsn:
          declaration.baseline === "primary" ? declaration.psn : "",
        route: declaration.route,
        intent: declaration.intent,
        gap: declaration.gap,
        supersedes: [...declaration.supersedes],
        psns: [declaration.psn],
        storyIds: [declaration.storyId],
      });
      continue;
    }

    if (declaration.baseline === "primary") {
      current.primaryBaselinePsn = declaration.psn;
    }
    current.psns.push(declaration.psn);
    current.storyIds.push(declaration.storyId);
  }

  return [...entries.values()];
}

export const SCREEN_CATALOG = createScreenCatalog(
  ALL_PRESENTATION_DECLARATIONS
);

function sameStrings(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

// eslint-disable-next-line complexity -- one validator keeps catalog invariants atomic.
export function validateScreenCatalog(
  catalog: readonly ScreenCatalogEntry[],
  declarations: readonly PresentationDeclaration[]
): string[] {
  const errors: string[] = [];
  const psns = new Set<string>();
  const storyIds = new Set<string>();
  const declarationsByScreen = new Map<string, PresentationDeclaration[]>();

  for (const declaration of declarations) {
    if (psns.has(declaration.psn)) {
      errors.push(`Duplicate PSN declaration: ${declaration.psn}`);
    }
    psns.add(declaration.psn);

    if (storyIds.has(declaration.storyId)) {
      errors.push(`Duplicate Story declaration: ${declaration.storyId}`);
    }
    storyIds.add(declaration.storyId);

    if (!declaration.psn.startsWith("PSN-")) {
      errors.push(`Invalid PSN declaration: ${declaration.psn}`);
    }
    if (!declaration.route.startsWith("/")) {
      errors.push(
        `Invalid route for ${declaration.screenId}: ${declaration.route}`
      );
    }

    const screenDeclarations =
      declarationsByScreen.get(declaration.screenId) ?? [];
    screenDeclarations.push(declaration);
    declarationsByScreen.set(declaration.screenId, screenDeclarations);
  }

  const catalogScreenIds = new Set<string>();
  const catalogPsnRefs = new Set<string>();
  const catalogStoryRefs = new Set<string>();

  for (const entry of catalog) {
    if (catalogScreenIds.has(entry.screenId)) {
      errors.push(`Duplicate Screen Catalog entry: ${entry.screenId}`);
    }
    catalogScreenIds.add(entry.screenId);

    const screenDeclarations = declarationsByScreen.get(entry.screenId);
    if (!screenDeclarations || screenDeclarations.length === 0) {
      errors.push(`Unknown Screen Catalog screen: ${entry.screenId}`);
      continue;
    }

    const primaryDeclarations = screenDeclarations.filter(
      ({ baseline }) => baseline === "primary"
    );
    if (primaryDeclarations.length !== 1) {
      errors.push(
        `${entry.screenId} must have exactly one primary baseline Story`
      );
    }
    const primary = primaryDeclarations[0] ?? screenDeclarations[0];

    if (entry.primaryBaselinePsn !== primary.psn) {
      errors.push(
        `${entry.screenId} primary baseline PSN does not match its Story metadata`
      );
    }
    for (const field of [
      "productFamily",
      "lifecycle",
      "route",
      "intent",
      "gap",
    ] as const) {
      if (entry[field] !== primary[field]) {
        errors.push(
          `${entry.screenId} ${field} does not match its Story metadata`
        );
      }
    }
    if (!sameStrings(entry.supersedes, primary.supersedes)) {
      errors.push(
        `${entry.screenId} supersession metadata does not match its Story metadata`
      );
    }

    if (!entry.primaryBaselinePsn.startsWith("PSN-")) {
      errors.push(`Invalid primary baseline PSN: ${entry.primaryBaselinePsn}`);
    }
    if (!psns.has(entry.primaryBaselinePsn)) {
      errors.push(
        `${entry.screenId} references unknown primary baseline PSN: ${entry.primaryBaselinePsn}`
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

    if (!entry.psns.includes(entry.primaryBaselinePsn)) {
      errors.push(
        `${entry.screenId} primary baseline PSN is not in its PSN set`
      );
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
