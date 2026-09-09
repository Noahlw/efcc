import { PRESENTATION_SCREEN_CATALOG } from "@/lib/governance/presentation-screen-catalog";
import type { PresentationScreenCatalogEntry } from "@/lib/governance/presentation-screen-catalog";

import { attendanceScannerGuestStoryDeclarations } from "./attendance-scanner-guest.story-manifest";
import { controlStoryDeclarations } from "./controls.story-manifest";
import { managementHubStoryDeclarations } from "./management-hub.story-manifest";
import { managementIdentityStoryDeclarations } from "./management-identity.story-manifest";
import type { PresentationStoryDeclaration } from "./presentation-meta";
import { programsStoryDeclarations } from "./programs.story-manifest";
import { publicAuthMemberCommunicationsStoryDeclarations } from "./public-auth-member-communications.story-manifest";

export type {
  PresentationMetadata,
  PresentationStoryDeclaration,
} from "./presentation-meta";

export type PresentationDeclaration =
  | Omit<Extract<PresentationStoryDeclaration, { subject: "screen" }>, "story">
  | Omit<
      Extract<PresentationStoryDeclaration, { subject: "control" }>,
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
export const CONTROL_PRESENTATION_DECLARATIONS =
  discoverPresentationDeclarations(controlStoryDeclarations);

/** All real CSF declarations; screen cataloging remains a separate join. */
export const ALL_PRESENTATION_DECLARATIONS = [
  ...MANAGEMENT_HUB_PRESENTATION_DECLARATIONS,
  ...PUBLIC_AUTH_MEMBER_COMMUNICATIONS_PRESENTATION_DECLARATIONS,
  ...PROGRAMS_PRESENTATION_DECLARATIONS,
  ...MANAGEMENT_IDENTITY_PRESENTATION_DECLARATIONS,
  ...ATTENDANCE_SCANNER_GUEST_PRESENTATION_DECLARATIONS,
  ...CONTROL_PRESENTATION_DECLARATIONS,
] as const;

export const SCREEN_PRESENTATION_DECLARATIONS =
  ALL_PRESENTATION_DECLARATIONS.filter(
    (declaration) => declaration.subject === "screen"
  );

export interface ScreenCatalogEntry extends PresentationScreenCatalogEntry {
  readonly psns: readonly string[];
  readonly storyIds: readonly string[];
}

export function createScreenCatalog(
  declarations: readonly PresentationDeclaration[],
  obligations: readonly PresentationScreenCatalogEntry[] = PRESENTATION_SCREEN_CATALOG
): readonly ScreenCatalogEntry[] {
  const declarationsByScreen = new Map<
    string,
    readonly PresentationDeclaration[]
  >();

  for (const declaration of declarations) {
    if (declaration.subject !== "screen") {
      continue;
    }
    declarationsByScreen.set(declaration.screenId, [
      ...(declarationsByScreen.get(declaration.screenId) ?? []),
      declaration,
    ]);
  }

  return obligations.map((obligation) => {
    const screenDeclarations =
      declarationsByScreen.get(obligation.screenId) ?? [];
    return {
      ...obligation,
      psns: screenDeclarations.map(({ psn }) => psn),
      storyIds: screenDeclarations.map(({ storyId }) => storyId),
    };
  });
}

export const SCREEN_CATALOG = createScreenCatalog(
  ALL_PRESENTATION_DECLARATIONS,
  PRESENTATION_SCREEN_CATALOG
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
  declarations: readonly PresentationDeclaration[],
  obligations: readonly PresentationScreenCatalogEntry[] = PRESENTATION_SCREEN_CATALOG
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

    if (declaration.subject === "screen") {
      if (declaration.route !== null && !declaration.route.startsWith("/")) {
        errors.push(
          `Invalid route for ${declaration.screenId}: ${declaration.route}`
        );
      }
      const screenDeclarations =
        declarationsByScreen.get(declaration.screenId) ?? [];
      screenDeclarations.push(declaration);
      declarationsByScreen.set(declaration.screenId, screenDeclarations);
    } else {
      if (!declaration.controlId.trim()) {
        errors.push(
          `Control Story has an empty controlId: ${declaration.storyId}`
        );
      }
      if ((declaration.route as string | null) !== null) {
        errors.push(`Control Story route must be null: ${declaration.storyId}`);
      }
      if ((declaration.intent as string | null) !== null) {
        errors.push(
          `Control Story intent must be null: ${declaration.storyId}`
        );
      }
      if (Object.hasOwn(declaration, "screenId")) {
        errors.push(
          `Control Story must not declare screenId: ${declaration.storyId}`
        );
      }
    }
  }

  const knownSupersessionTargets = new Set([
    ...obligations.map(({ screenId }) => screenId),
    ...declarations.map(({ psn }) => psn),
  ]);
  for (const declaration of declarations) {
    for (const target of declaration.supersedes) {
      if (target === declaration.psn || !knownSupersessionTargets.has(target)) {
        errors.push(
          `${declaration.storyId} has an invalid supersession target: ${target}`
        );
      }
    }
  }

  const catalogScreenIds = new Set<string>();
  const catalogPsnRefs = new Set<string>();
  const catalogStoryRefs = new Set<string>();
  const obligationByScreen = new Map<string, PresentationScreenCatalogEntry>();

  for (const obligation of obligations) {
    if (obligationByScreen.has(obligation.screenId)) {
      errors.push(
        `Duplicate Screen Catalog obligation: ${obligation.screenId}`
      );
    }
    obligationByScreen.set(obligation.screenId, obligation);
    if (
      obligation.lifecycle === "active" &&
      obligation.gap !== null &&
      !obligation.gap.startsWith("APV-")
    ) {
      errors.push(
        `${obligation.screenId} gap must reference an owner approval package`
      );
    }
  }

  for (const entry of catalog) {
    if (catalogScreenIds.has(entry.screenId)) {
      errors.push(`Duplicate Screen Catalog entry: ${entry.screenId}`);
    }
    catalogScreenIds.add(entry.screenId);

    const obligation = obligationByScreen.get(entry.screenId);
    if (obligation) {
      for (const field of [
        "productFamily",
        "lifecycle",
        "primaryBaselinePsn",
        "route",
        "intent",
        "gap",
      ] as const) {
        if (entry[field] !== obligation[field]) {
          errors.push(
            `${entry.screenId} ${field} does not match its independent obligation`
          );
        }
      }
      if (!sameStrings(entry.supersedes, obligation.supersedes)) {
        errors.push(
          `${entry.screenId} supersession metadata does not match its independent obligation`
        );
      }
    } else {
      errors.push(`Unknown Screen Catalog screen: ${entry.screenId}`);
    }

    const screenDeclarations = declarationsByScreen.get(entry.screenId);
    if (!screenDeclarations || screenDeclarations.length === 0) {
      if (obligation?.gap === null) {
        errors.push(
          `Missing baseline Story for active screen: ${entry.screenId}`
        );
      }
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

    if (
      primaryDeclarations.length === 1 &&
      entry.primaryBaselinePsn !== primary.psn
    ) {
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
      if (primaryDeclarations.length === 1 && entry[field] !== primary[field]) {
        errors.push(
          `${entry.screenId} ${field} does not match its Story metadata`
        );
      }
    }
    if (
      primaryDeclarations.length === 1 &&
      !sameStrings(entry.supersedes, primary.supersedes)
    ) {
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

    for (const target of entry.supersedes) {
      if (
        target === entry.screenId ||
        target === entry.primaryBaselinePsn ||
        !knownSupersessionTargets.has(target)
      ) {
        errors.push(
          `${entry.screenId} has an invalid supersession target: ${target}`
        );
      }
    }
  }

  for (const obligation of obligations) {
    if (!catalogScreenIds.has(obligation.screenId)) {
      errors.push(`Missing Screen Catalog obligation: ${obligation.screenId}`);
    }
  }

  for (const declaration of declarations) {
    if (declaration.subject !== "screen") {
      continue;
    }
    if (!obligationByScreen.has(declaration.screenId)) {
      errors.push(
        `Story declaration has no Screen Catalog obligation: ${declaration.screenId}`
      );
    }
    if (!catalogPsnRefs.has(declaration.psn)) {
      errors.push(`Uncataloged PSN declaration: ${declaration.psn}`);
    }
    if (!catalogStoryRefs.has(declaration.storyId)) {
      errors.push(`Uncataloged Story declaration: ${declaration.storyId}`);
    }
  }

  return errors;
}
