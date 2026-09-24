import { defineConfig } from "@playwright/test";

import homeAcceptance from "./programs-home-acceptance.config";

export default defineConfig({
  ...homeAcceptance,
  grep: /programs-d1 #(?:18|19|20|21|22|23|24):/u,
  reporter: [
    ["line"],
    [
      "json",
      {
        outputFile:
          process.env.PROGRAMS_FEED_RESULTS_FILE ??
          "test-results/programs-feed-results.json",
      },
    ],
  ],
  outputDir:
    process.env.PROGRAMS_FEED_OUTPUT_DIR ??
    "test-results/programs-feed-acceptance",
});
