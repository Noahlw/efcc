import { readFileSync } from "node:fs";
import path from "node:path";

import {
  ALL_PRESENTATION_DECLARATIONS,
  CONTROL_PRESENTATION_DECLARATIONS,
  FOUNDATION_PRESENTATION_DECLARATIONS,
  SCREEN_CATALOG,
  validateScreenCatalog,
} from "../.storybook/presentation-catalog";
import { T10_ORDINARY_STORY_IDS } from "../.storybook/t10-ordinary-story-ids";

interface StorybookIndex {
  readonly entries?: Record<string, unknown>;
}

const indexPath = path.resolve(
  process.cwd(),
  process.argv[2] ?? "storybook-static/index.json"
);
const index = JSON.parse(readFileSync(indexPath, "utf8")) as StorybookIndex;
const actualStoryIds = new Set(Object.keys(index.entries ?? {}));
const catalogErrors = validateScreenCatalog(
  SCREEN_CATALOG,
  ALL_PRESENTATION_DECLARATIONS
);
const expectedStoryIds = new Set(
  ALL_PRESENTATION_DECLARATIONS.map(({ storyId }) => storyId)
);
const ordinaryStoryIds: ReadonlySet<string> = new Set(T10_ORDINARY_STORY_IDS);
const missingStoryIds = [...expectedStoryIds].filter(
  (storyId) => !actualStoryIds.has(storyId)
);
const missingOrdinaryStoryIds = [...ordinaryStoryIds].filter(
  (storyId) => !actualStoryIds.has(storyId)
);
const unexpectedStoryIds = [...actualStoryIds].filter(
  (storyId) => !expectedStoryIds.has(storyId) && !ordinaryStoryIds.has(storyId)
);
const missingBaselineStories = SCREEN_CATALOG.flatMap((entry) => {
  const declaration = ALL_PRESENTATION_DECLARATIONS.find(
    ({ psn }) => psn === entry.primaryBaselinePsn
  );
  return declaration && actualStoryIds.has(declaration.storyId)
    ? []
    : [entry.screenId];
});

if (
  catalogErrors.length > 0 ||
  missingStoryIds.length > 0 ||
  missingOrdinaryStoryIds.length > 0 ||
  unexpectedStoryIds.length > 0 ||
  missingBaselineStories.length > 0
) {
  throw new Error(
    [
      catalogErrors.length > 0
        ? `presentation catalog errors: ${catalogErrors.join(" | ")}`
        : null,
      missingStoryIds.length > 0
        ? `missing Story index entries: ${missingStoryIds.join(", ")}`
        : null,
      missingOrdinaryStoryIds.length > 0
        ? `ordinary T10 Story index entries missing: ${missingOrdinaryStoryIds.join(", ")}`
        : null,
      unexpectedStoryIds.length > 0
        ? `unexpected Story index entries: ${unexpectedStoryIds.join(", ")}`
        : null,
      missingBaselineStories.length > 0
        ? `baseline Stories missing from actual index: ${missingBaselineStories.join(", ")}`
        : null,
    ]
      .filter((message): message is string => message !== null)
      .join("; ")
  );
}

console.log(
  `Storybook index reconciliation: ${actualStoryIds.size} Stories / ${SCREEN_CATALOG.length} Screen Catalog obligations / ${CONTROL_PRESENTATION_DECLARATIONS.length} control Stories / ${FOUNDATION_PRESENTATION_DECLARATIONS.length} foundation Stories / ${ordinaryStoryIds.size} ordinary T10 Stories; all baselines resolvable.`
);
