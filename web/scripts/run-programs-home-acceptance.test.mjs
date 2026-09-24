import { describe, expect, test } from "vitest";

import {
  HOME_ACCEPTANCE_VIEWPORTS,
  resolveHomeReportPath,
} from "./run-programs-home-acceptance.mjs";

describe("Home Browser Acceptance runner", () => {
  test("honors the promotion report destination", () => {
    expect(
      resolveHomeReportPath(
        "/tmp/home-acceptance-results.json",
        "/tmp/home-default-artifacts"
      )
    ).toBe("/tmp/home-acceptance-results.json");
  });

  test("defaults the report inside its run artifact directory", () => {
    expect(
      resolveHomeReportPath(undefined, "/tmp/home-default-artifacts")
    ).toBe("/tmp/home-default-artifacts/home-results.json");
  });

  test("aligns failure evidence with its one acceptance viewport", () => {
    expect(HOME_ACCEPTANCE_VIEWPORTS).toStrictEqual({
      "phone-390": { width: 390, height: 844 },
    });
  });
});
