import { describe, expect, test } from "vitest";

import { resolveResponsiveReportPath } from "./run-programs-responsive-matrix.mjs";

describe("T05 Responsive Matrix runner", () => {
  test("honors an explicit report destination outside its default artifact directory", () => {
    expect(
      resolveResponsiveReportPath(
        "/tmp/t05-responsive-results.json",
        "/tmp/t05-default-artifacts"
      )
    ).toBe("/tmp/t05-responsive-results.json");
  });

  test("uses the runner artifact directory when no destination is supplied", () => {
    expect(
      resolveResponsiveReportPath(undefined, "/tmp/t05-default-artifacts")
    ).toBe("/tmp/t05-default-artifacts/responsive-results.json");
  });
});
