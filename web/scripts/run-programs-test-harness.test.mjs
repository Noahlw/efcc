import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  assertProgramsReportComplete,
  assertProgramsReportDiagnosticComplete,
  failedProgramsTests,
  programsPlaywrightArgs,
  readProgramsReport,
} from "./run-programs-test-harness.mjs";

const temporaryDirectories = [];

function completeReport(stats = {}) {
  return {
    config: {},
    suites: [],
    errors: [],
    stats: {
      expected: 201,
      skipped: 0,
      unexpected: 0,
      flaky: 0,
      ...stats,
    },
  };
}

function reportFile(report) {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), "efcc-programs-harness-report-")
  );
  temporaryDirectories.push(directory);
  const reportPath = path.join(directory, "programs-d1-results.json");
  writeFileSync(reportPath, JSON.stringify(report), "utf8");
  return reportPath;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Programs Test Harness report helpers", () => {
  test("accepts the complete required Programs report", () => {
    const report = readProgramsReport(reportFile(completeReport()));

    expect(report.stats).toMatchObject({
      expected: 201,
      skipped: 0,
      unexpected: 0,
      flaky: 0,
    });
    expect(() => assertProgramsReportComplete(report)).not.toThrow();
  });

  test("adds an exact grep only for diagnostic row reproduction", () => {
    expect(programsPlaywrightArgs()).toEqual([
      "exec",
      "playwright",
      "test",
      "-c",
      "tests/e2e/programs-d1.config.ts",
    ]);
    expect(programsPlaywrightArgs("NTF-01 management attention")).toEqual([
      "exec",
      "playwright",
      "test",
      "-c",
      "tests/e2e/programs-d1.config.ts",
      "--grep",
      "NTF-01 management attention",
    ]);
    expect(
      programsPlaywrightArgs("NTF-01 management attention", "phone-320")
    ).toEqual([
      "exec",
      "playwright",
      "test",
      "-c",
      "tests/e2e/programs-d1.config.ts",
      "--grep",
      "NTF-01 management attention",
      "--project",
      "phone-320",
    ]);
  });

  test("accepts a clean filtered report only as diagnostic evidence", () => {
    const report = readProgramsReport(
      reportFile(completeReport({ expected: 1 }))
    );

    expect(() => assertProgramsReportDiagnosticComplete(report)).not.toThrow();
    expect(() => assertProgramsReportComplete(report)).toThrow(/expected=1/u);
  });

  test.each([
    ["expected", { expected: 200 }, "expected=200"],
    ["skipped", { skipped: 1 }, "skipped=1"],
    ["unexpected", { unexpected: 1 }, "unexpected=1"],
    ["flaky", { flaky: 1 }, "flaky=1"],
  ])(
    "rejects a report with non-zero/incomplete %s count",
    (_name, stats, message) => {
      const report = readProgramsReport(reportFile(completeReport(stats)));

      expect(() => assertProgramsReportComplete(report)).toThrow(message);
    }
  );

  test.each([
    ["missing stats", {}],
    ["null stats", { stats: null }],
    [
      "invalid expected count",
      { stats: { expected: "201", skipped: 0, unexpected: 0, flaky: 0 } },
    ],
  ])("rejects %s", (_name, report) => {
    const parsed = readProgramsReport(reportFile(report));

    expect(() => assertProgramsReportComplete(parsed)).toThrow(
      /stats|expected/u
    );
  });

  test("extracts the complete identity of an unexpected row", () => {
    const report = completeReport({ expected: 200, unexpected: 1 });
    report.suites = [
      {
        title: "programs-d1.test.ts",
        file: "programs-d1.test.ts",
        specs: [
          {
            title: "participant detail stays available after approval",
            file: "programs-d1.test.ts",
            line: 2282,
            column: 3,
            tests: [
              {
                expectedStatus: "passed",
                projectId: "phone-390",
                projectName: "phone-390",
                results: [
                  {
                    retry: 0,
                    status: "failed",
                    error: { message: "participant detail returned HTTP 500" },
                    attachments: [
                      {
                        name: "screenshot",
                        contentType: "image/png",
                        path: "/tmp/failure.png",
                      },
                    ],
                  },
                ],
                status: "unexpected",
              },
            ],
          },
          {
            title: "a required row is not skipped",
            file: "programs-d1.test.ts",
            line: 2300,
            column: 3,
            tests: [
              {
                expectedStatus: "passed",
                projectId: "desktop",
                projectName: "desktop",
                results: [
                  {
                    retry: 0,
                    status: "skipped",
                    attachments: [
                      {
                        name: "skip-context",
                        contentType: "text/plain",
                        path: "/tmp/skip-context.txt",
                      },
                    ],
                  },
                ],
                status: "skipped",
              },
            ],
          },
        ],
      },
    ];

    const failures = failedProgramsTests(report);
    const [failure] = failures;

    expect(failure).toMatchObject({
      title:
        "programs-d1.test.ts > participant detail stays available after approval",
      fullTitle:
        "programs-d1.test.ts > participant detail stays available after approval",
      suitePath: ["programs-d1.test.ts"],
      specTitle: "participant detail stays available after approval",
      file: "programs-d1.test.ts",
      line: 2282,
      column: 3,
      projectId: "phone-390",
      projectName: "phone-390",
      status: "unexpected",
      resultStatuses: ["failed"],
      attachments: [
        {
          name: "screenshot",
          contentType: "image/png",
          path: "/tmp/failure.png",
        },
      ],
    });
    expect(failure.errorMessages).toEqual([
      "participant detail returned HTTP 500",
    ]);
    expect(failures).toHaveLength(2);
    expect(failures[1]).toMatchObject({
      fullTitle: "programs-d1.test.ts > a required row is not skipped",
      status: "skipped",
      projectName: "desktop",
      attachments: [
        {
          name: "skip-context",
          contentType: "text/plain",
          path: "/tmp/skip-context.txt",
        },
      ],
    });
  });
});
