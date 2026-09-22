import { describe, expect, test } from "vitest";

import {
  PROGRAMS_BROWSER_VIEWPORTS,
  resolveBrowserReportPath,
} from "./run-programs-browser-acceptance.mjs";

describe("T05 Browser Acceptance runner", () => {
  test("honors an explicit report destination outside its default artifact directory", () => {
    expect(
      resolveBrowserReportPath(
        "/tmp/t05-browser-results.json",
        "/tmp/t05-default-artifacts"
      )
    ).toBe("/tmp/t05-browser-results.json");
  });

  test("uses the runner artifact directory when no destination is supplied", () => {
    expect(
      resolveBrowserReportPath(undefined, "/tmp/t05-default-artifacts")
    ).toBe("/tmp/t05-default-artifacts/browser-results.json");
  });

  test("keeps failure evidence aligned with all browser acceptance projects", () => {
    expect(PROGRAMS_BROWSER_VIEWPORTS).toStrictEqual({
      "phone-360": { width: 360, height: 800 },
      "phone-390": { width: 390, height: 844 },
      "phone-402": { width: 402, height: 874 },
    });
  });
});
