export type PresentationLifecycle = "active" | "historical" | "planned";
export type PresentationBaseline = "primary" | "supporting";

interface PresentationMetadataCommon {
  readonly productFamily: string;
  readonly lifecycle: PresentationLifecycle;
  readonly baseline: PresentationBaseline;
  readonly psn: string;
  readonly state: string;
  readonly gap: string | null;
  readonly supersedes: readonly string[];
}

/** Legacy screen metadata may omit subject; discovery normalizes it to screen. */
export interface ScreenPresentationMetadata extends PresentationMetadataCommon {
  readonly subject?: "screen";
  readonly screenId: string;
  readonly route: string | null;
  readonly intent: string | null;
}

export interface ControlPresentationMetadata extends PresentationMetadataCommon {
  readonly subject: "control";
  readonly controlId: string;
  readonly route: null;
  readonly intent: null;
}

export type PresentationMetadata =
  | ScreenPresentationMetadata
  | ControlPresentationMetadata;

export type ResolvedScreenPresentationMetadata = Omit<
  ScreenPresentationMetadata,
  "subject"
> & { readonly subject: "screen" };

export type ResolvedPresentationMetadata =
  | ResolvedScreenPresentationMetadata
  | ControlPresentationMetadata;

export type PresentationStoryDeclaration =
  | (ResolvedScreenPresentationMetadata & {
      readonly storyId: string;
      readonly story: unknown;
    })
  | (ControlPresentationMetadata & {
      readonly storyId: string;
      readonly story: unknown;
    });

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  return typeof value === "object" && value !== null
    ? (value as RecordValue)
    : null;
}

function storyIdPart(exportName: string): string {
  return exportName
    .replaceAll(/([a-z0-9])([A-Z])/gu, "$1-$2")
    .replaceAll(/([A-Z])([A-Z][a-z])/gu, "$1-$2")
    .replaceAll(/[_\s]+/gu, "-")
    .toLowerCase();
}

function readCommonPresentation(
  presentation: RecordValue,
  storyId: string
): PresentationMetadataCommon {
  const requiredStrings = ["productFamily", "psn", "state"] as const;
  for (const field of requiredStrings) {
    if (typeof presentation[field] !== "string" || presentation[field] === "") {
      throw new Error(`Story metadata ${field} is invalid: ${storyId}`);
    }
  }
  if (
    presentation.lifecycle !== "active" &&
    presentation.lifecycle !== "historical" &&
    presentation.lifecycle !== "planned"
  ) {
    throw new Error(`Story metadata lifecycle is invalid: ${storyId}`);
  }
  if (
    presentation.baseline !== "primary" &&
    presentation.baseline !== "supporting"
  ) {
    throw new Error(`Story metadata baseline is invalid: ${storyId}`);
  }
  if (presentation.gap !== null && typeof presentation.gap !== "string") {
    throw new Error(`Story metadata gap is invalid: ${storyId}`);
  }
  if (
    !Array.isArray(presentation.supersedes) ||
    presentation.supersedes.some((value) => typeof value !== "string")
  ) {
    throw new Error(`Story metadata supersedes is invalid: ${storyId}`);
  }

  return {
    productFamily: presentation.productFamily as string,
    lifecycle: presentation.lifecycle as PresentationLifecycle,
    baseline: presentation.baseline as PresentationBaseline,
    psn: presentation.psn as string,
    state: presentation.state as string,
    gap: presentation.gap as string | null,
    supersedes: presentation.supersedes as string[],
  };
}

function readScreenPresentation(
  presentation: RecordValue,
  storyId: string,
  common: PresentationMetadataCommon
): ResolvedScreenPresentationMetadata {
  if (
    typeof presentation.screenId !== "string" ||
    presentation.screenId === ""
  ) {
    throw new Error(`Story metadata screenId is invalid: ${storyId}`);
  }
  if (presentation.route !== null && typeof presentation.route !== "string") {
    throw new Error(`Story metadata route is invalid: ${storyId}`);
  }
  if (presentation.intent !== null && typeof presentation.intent !== "string") {
    throw new Error(`Story metadata intent is invalid: ${storyId}`);
  }

  return {
    ...common,
    subject: "screen",
    screenId: presentation.screenId,
    route: presentation.route as string | null,
    intent: presentation.intent as string | null,
  };
}

function readControlPresentation(
  presentation: RecordValue,
  storyId: string,
  common: PresentationMetadataCommon
): ControlPresentationMetadata {
  if (
    Object.hasOwn(presentation, "screenId") ||
    typeof presentation.controlId !== "string" ||
    presentation.controlId === ""
  ) {
    throw new Error(`Story metadata controlId is invalid: ${storyId}`);
  }
  if (presentation.route !== null) {
    throw new Error(`Control Story route must be null: ${storyId}`);
  }
  if (presentation.intent !== null) {
    throw new Error(`Control Story intent must be null: ${storyId}`);
  }
  return {
    ...common,
    subject: "control",
    controlId: presentation.controlId,
    route: null,
    intent: null,
  };
}

function readPresentation(
  story: unknown,
  storyId: string
): ResolvedPresentationMetadata {
  const storyRecord = asRecord(story);
  const parameters = asRecord(storyRecord?.parameters);
  const presentation = asRecord(parameters?.presentation);
  if (!presentation) {
    throw new Error(`Story is missing presentation metadata: ${storyId}`);
  }

  const subject = presentation.subject ?? "screen";
  if (subject !== "screen" && subject !== "control") {
    throw new Error(`Story metadata subject is invalid: ${storyId}`);
  }
  const common = readCommonPresentation(presentation, storyId);
  return subject === "screen"
    ? readScreenPresentation(presentation, storyId, common)
    : readControlPresentation(presentation, storyId, common);
}

/** Derive declarations from the actual exported CSF Story objects. */
export function discoverStoryDeclarations(
  storyModule: Record<string, unknown>
): readonly PresentationStoryDeclaration[] {
  const meta = asRecord(storyModule.default);
  const metaId = meta?.id;
  if (typeof metaId !== "string" || metaId === "") {
    throw new Error("Story module default export is missing a stable id");
  }

  return Object.entries(storyModule)
    .filter(([exportName]) => exportName !== "default")
    .map(([exportName, story]) => {
      const storyId = `${metaId}--${storyIdPart(exportName)}`;
      return {
        ...readPresentation(story, storyId),
        storyId,
        story,
      };
    });
}
