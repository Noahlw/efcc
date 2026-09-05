import { describe, expect, test } from "vitest";

import { collectPlaywrightFailureEvidence } from "./playwright-failure-evidence.mjs";
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

  test("captures failed scenario and project viewport from a Playwright report", () => {
    expect(
      collectPlaywrightFailureEvidence(
        {
          suites: [
            {
              title: "T05.6 responsive Programs UI matrix",
              specs: [
                {
                  title: "management settings keeps composition usable",
                  file: "tests/e2e/programs-responsive-matrix.test.ts",
                  tests: [
                    {
                      projectName: "phone-320",
                      status: "unexpected",
                      results: [
                        {
                          status: "failed",
                          errors: [{ message: "viewport assertion failed" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        { "phone-320": { width: 320, height: 812 } },
        {
          route: "/programs",
          state: "responsive state",
        }
      )
    ).toEqual([
      {
        logicalScenario:
          "T05.6 responsive Programs UI matrix > management settings keeps composition usable",
        project: "phone-320",
        viewport: { width: 320, height: 812 },
        route: "/programs",
        state: "responsive state",
        location: "tests/e2e/programs-responsive-matrix.test.ts",
        observedSymptom: "viewport assertion failed",
      },
    ]);
  });
});
