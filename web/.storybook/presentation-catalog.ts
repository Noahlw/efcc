import { MANAGEMENT_HUB_PRESENTATION } from "./management-hub.story-contract";
import { managementHubStoryDeclarations } from "./management-hub.story-manifest";

export interface PresentationStoryDeclaration {
  readonly psn: string;
  readonly storyId: string;
  readonly state: string;
}

type OwnedStoryDeclaration = (typeof managementHubStoryDeclarations)[number];

/** Discover PSNs and Story IDs from the exported owning Stories. */
export function discoverPresentationDeclarations(
  stories: readonly OwnedStoryDeclaration[]
): readonly PresentationStoryDeclaration[] {
  return stories.map(({ story: ownedStory, ...declaration }) => {
    if (!ownedStory) {
      throw new Error(`Presentation Story is missing: ${declaration.storyId}`);
    }
    return declaration;
  });
}

export const MANAGEMENT_HUB_PRESENTATION_DECLARATIONS =
  discoverPresentationDeclarations(managementHubStoryDeclarations);

export interface ScreenCatalogEntry {
  readonly screenId: string;
  readonly route: string;
  readonly primaryPsn: string;
  readonly psns: readonly string[];
  readonly storyIds: readonly string[];
}

/**
 * Thin catalog index derived from owning Story declarations.
 * It does not own Story args, fixtures, contracts, or approval state.
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

  for (const entry of catalog) {
    if (!entry.primaryPsn.startsWith("PSN-")) {
      errors.push(`Invalid primary PSN: ${entry.primaryPsn}`);
    }

    for (const psn of entry.psns) {
      if (!psns.has(psn)) {
        errors.push(`${entry.screenId} references undeclared PSN: ${psn}`);
      }
    }

    for (const storyId of entry.storyIds) {
      if (!storyIds.has(storyId)) {
        errors.push(
          `${entry.screenId} references undeclared Story: ${storyId}`
        );
      }
    }

    if (!entry.psns.includes(entry.primaryPsn)) {
      errors.push(`${entry.screenId} primary PSN is not in its PSN set`);
    }
  }

  return errors;
}
