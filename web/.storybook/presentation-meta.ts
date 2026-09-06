export type PresentationLifecycle = "active" | "historical" | "planned";
export type PresentationBaseline = "primary" | "supporting";

export interface PresentationMetadata {
  readonly screenId: string;
  readonly productFamily: string;
  readonly lifecycle: PresentationLifecycle;
  readonly baseline: PresentationBaseline;
  readonly psn: string;
  readonly route: string;
  readonly intent: string | null;
  readonly state: string;
  readonly gap: string | null;
  readonly supersedes: readonly string[];
}

export interface PresentationStoryDeclaration extends PresentationMetadata {
  readonly storyId: string;
  readonly story: unknown;
}

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  return typeof value === "object" && value !== null
    ? (value as RecordValue)
    : null;
}

function storyIdPart(exportName: string): string {
  return exportName
    .replaceAll(/(?<lower>[a-z0-9])(?<upper>[A-Z])/gu, "$<lower>-$<upper>")
    .replaceAll(/(?<first>[A-Z])(?<rest>[A-Z][a-z])/gu, "$<first>-$<rest>")
    .replaceAll(/[_\s]+/gu, "-")
    .toLowerCase();
}

function readPresentation(
  story: unknown,
  storyId: string
): PresentationMetadata {
  const storyRecord = asRecord(story);
  const parameters = asRecord(storyRecord?.parameters);
  const presentation = asRecord(parameters?.presentation);
  if (!presentation) {
    throw new Error(`Story is missing presentation metadata: ${storyId}`);
  }

  const requiredStrings = [
    "screenId",
    "productFamily",
    "psn",
    "route",
    "state",
  ] as const;
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
  if (presentation.intent !== null && typeof presentation.intent !== "string") {
    throw new Error(`Story metadata intent is invalid: ${storyId}`);
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

  return presentation as unknown as PresentationMetadata;
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
