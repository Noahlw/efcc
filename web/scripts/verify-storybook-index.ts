import { readFileSync } from "node:fs";
import path from "node:path";

import {
  ALL_PRESENTATION_DECLARATIONS,
  SCREEN_CATALOG,
} from "../.storybook/presentation-catalog";

interface StorybookIndex {
  readonly entries?: Record<string, unknown>;
}

const indexPath = path.resolve(
  process.cwd(),
  process.argv[2] ?? "storybook-static/index.json"
);
const index = JSON.parse(readFileSync(indexPath, "utf8")) as StorybookIndex;
const actualStoryIds = new Set(Object.keys(index.entries ?? {}));
const expectedStoryIds = new Set(
  ALL_PRESENTATION_DECLARATIONS.map(({ storyId }) => storyId)
);
const missingStoryIds = [...expectedStoryIds].filter(
  (storyId) => !actualStoryIds.has(storyId)
);
const unexpectedStoryIds = [...actualStoryIds].filter(
  (storyId) => !expectedStoryIds.has(storyId)
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
  missingStoryIds.length > 0 ||
  unexpectedStoryIds.length > 0 ||
  missingBaselineStories.length > 0
) {
  throw new Error(
    [
      missingStoryIds.length > 0
        ? `missing Story index entries: ${missingStoryIds.join(", ")}`
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
  `Storybook index reconciliation: ${actualStoryIds.size} Stories / ${SCREEN_CATALOG.length} Screen Catalog obligations; all baselines resolvable.`
);
