import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  B003_RESIDUAL_RISK,
  PUI05_HOME_ACCEPTANCE_MAPPINGS,
  PROGRAMS_FEED_ACCEPTANCE_MAPPINGS,
  PROGRAMS_BROWSER_EXPECTED_TESTS,
  PROGRAMS_MANAGEMENT_PARITY_MAPPINGS,
  PROGRAMS_NAVIGATION_PARITY_MAPPINGS,
  PROGRAMS_PARTICIPANT_PARITY_MAPPINGS,
  PROGRAMS_RESPONSIVE_EXPECTED_TESTS,
  PROGRAMS_RESPONSIVE_PARITY_MAPPINGS,
  PROMOTION_STAGES,
  RUNTIME_CANARY_STAGE,
  assertFeedAcceptanceReportMatchesMappings,
  assertFeedParityMappings,
  assertHomeAcceptanceReportMatchesMappings,
  assertHomeParityMappings,
  assertProgramsManagementBrowserReportMatchesMappings,
  assertProgramsManagementParityMappings,
  assertProgramsNavigationBrowserReportMatchesMappings,
  assertProgramsNavigationParityMappings,
  assertProgramsParticipantBrowserReportMatchesMappings,
  assertProgramsParticipantParityMappings,
  assertProgramsResponsiveParityMappings,
  assertProgramsResponsiveReportMatchesMappings,
  assertMigrationLedgersComplete,
  assertLocalPromotionTarget,
  isBrowserAcceptanceRunGreen,
  isResponsiveAcceptanceRunGreen,
  isCanaryArtifactGreen,
  isFunctionalPromotionManifest,
  isFeedAcceptanceRunGreen,
  isHomeAcceptanceRunGreen,
  assertPlaywrightReportGreen,
  isCleanWorktreeStatus,
  stageArtifactPath,
} from "./verify-programs";

const repoRoot = path.resolve(import.meta.dirname, "..");

function syntheticPlaywrightReport(
  specs: { title: string; file: string; projectName: string }[],
  expectedTests: number
) {
  const fillers = Array.from(
    { length: Math.max(0, expectedTests - specs.length) },
    (_, index) => ({
      title: `unmapped passing fixture ${index + 1}`,
      file: "programs-participant-acceptance.test.ts",
      projectName: "phone-390",
    })
  );
  const tests = [...specs, ...fillers].map(({ title, file, projectName }) => ({
    title,
    file,
    tests: [
      {
        projectName,
        results: [{ status: "passed", retry: 0 }],
      },
    ],
  }));
  return {
    config: { rootDir: path.join(repoRoot, "tests/e2e") },
    stats: { expected: expectedTests, skipped: 0, unexpected: 0, flaky: 0 },
    suites: [{ specs: tests }],
  };
}

describe("T05.7 Programs promotion gate", () => {
  test("aggregates the independent layers in dependency order", () => {
    expect(PROMOTION_STAGES.map(({ name }) => name)).toStrictEqual([
      "worker-contract",
      "browser-acceptance",
      "home-browser-acceptance",
      "responsive-matrix",
      "feed-browser-acceptance",
      "non-browser-precommit",
    ]);
    expect(
      PROMOTION_STAGES.map(({ name, expectedTests }) => [name, expectedTests])
    ).toStrictEqual([
      ["worker-contract", undefined],
      ["browser-acceptance", 70],
      ["home-browser-acceptance", 5],
      ["responsive-matrix", 21],
      ["feed-browser-acceptance", 7],
      ["non-browser-precommit", undefined],
    ]);
  });

  test("requires all five exact PUI-05 Home mapping rows", () => {
    expect(() =>
      assertHomeParityMappings(PUI05_HOME_ACCEPTANCE_MAPPINGS)
    ).not.toThrow();
    expect(() => assertHomeParityMappings(null)).toThrow(/missing/u);
    expect(() =>
      assertHomeParityMappings(PUI05_HOME_ACCEPTANCE_MAPPINGS.slice(0, 4))
    ).toThrow(/count mismatch/u);
  });

  test("requires exact Programs feed mappings for old cases 18–24", () => {
    expect(() =>
      assertFeedParityMappings(PROGRAMS_FEED_ACCEPTANCE_MAPPINGS)
    ).not.toThrow();
    expect(() => assertFeedParityMappings(null)).toThrow(/missing/u);
    expect(() =>
      assertFeedParityMappings(PROGRAMS_FEED_ACCEPTANCE_MAPPINGS.slice(0, 6))
    ).toThrow(/count mismatch/u);
    expect(() =>
      assertFeedParityMappings([
        ...PROGRAMS_FEED_ACCEPTANCE_MAPPINGS.slice(0, 6),
        { ...PROGRAMS_FEED_ACCEPTANCE_MAPPINGS[6], oldId: "programs-d1:99" },
      ])
    ).toThrow(/unrecognized old ID/u);
    expect(() =>
      assertFeedParityMappings([
        ...PROGRAMS_FEED_ACCEPTANCE_MAPPINGS.slice(0, 6),
        {
          ...PROGRAMS_FEED_ACCEPTANCE_MAPPINGS[6],
          replacementTest: PROGRAMS_FEED_ACCEPTANCE_MAPPINGS[0].replacementTest,
        },
      ])
    ).toThrow(/duplicates replacement test/u);
  });

  test("requires exact mappings and labels superseded tab semantics as presentation-only", () => {
    expect(() =>
      assertProgramsNavigationParityMappings(
        PROGRAMS_NAVIGATION_PARITY_MAPPINGS
      )
    ).not.toThrow();
    expect(PROGRAMS_NAVIGATION_PARITY_MAPPINGS).toHaveLength(23);
    expect(
      PROGRAMS_NAVIGATION_PARITY_MAPPINGS.find(
        ({ oldId }) => oldId === "programs-d1:4"
      )?.evidenceLevel
    ).toBe("presentation-only");
    expect(PROGRAMS_NAVIGATION_PARITY_MAPPINGS[7]?.evidenceLevel).toBe(
      "presentation-only"
    );
    expect(() => assertProgramsNavigationParityMappings(null)).toThrow(
      /missing/u
    );
  });

  test("rejects incomplete or unapproved navigation mappings", () => {
    expect(() =>
      assertProgramsNavigationParityMappings(
        PROGRAMS_NAVIGATION_PARITY_MAPPINGS.slice(0, 22)
      )
    ).toThrow(/count mismatch/u);
    expect(() =>
      assertProgramsNavigationParityMappings(
        PROGRAMS_NAVIGATION_PARITY_MAPPINGS.map((mapping, index) =>
          index === 7 ? { ...mapping, evidenceLevel: "worker-d1" } : mapping
        )
      )
    ).toThrow(/approved replacement/u);
    expect(() =>
      assertProgramsNavigationParityMappings(
        PROGRAMS_NAVIGATION_PARITY_MAPPINGS.map((mapping) =>
          mapping.oldId === "programs-d1:4"
            ? { ...mapping, evidenceLevel: "worker-d1" }
            : mapping
        )
      )
    ).toThrow(/approved replacement/u);
  });

  test("requires exact mappings for uncovered Programs management cases", () => {
    expect(() =>
      assertProgramsManagementParityMappings(
        PROGRAMS_MANAGEMENT_PARITY_MAPPINGS
      )
    ).not.toThrow();
    expect(PROGRAMS_MANAGEMENT_PARITY_MAPPINGS).toHaveLength(28);
    expect(
      PROGRAMS_MANAGEMENT_PARITY_MAPPINGS.filter(
        ({ replacementFile }) =>
          replacementFile === "tests/e2e/programs-management-acceptance.test.ts"
      )
    ).toHaveLength(25);
    expect(() => assertProgramsManagementParityMappings(null)).toThrow(
      /missing/u
    );
  });

  test("rejects incomplete or altered management mappings", () => {
    expect(() =>
      assertProgramsManagementParityMappings(
        PROGRAMS_MANAGEMENT_PARITY_MAPPINGS.slice(0, 27)
      )
    ).toThrow(/count mismatch/u);
    expect(() =>
      assertProgramsManagementParityMappings(
        PROGRAMS_MANAGEMENT_PARITY_MAPPINGS.map((mapping) =>
          mapping.oldId === "programs-d1:50"
            ? { ...mapping, replacementFile: "tests/e2e/other.test.ts" }
            : mapping
        )
      )
    ).toThrow(/approved replacement/u);
  });

  test("requires exact participant parity mappings for cases 14, 25, and 26", () => {
    expect(() =>
      assertProgramsParticipantParityMappings(
        PROGRAMS_PARTICIPANT_PARITY_MAPPINGS
      )
    ).not.toThrow();
    expect(PROGRAMS_PARTICIPANT_PARITY_MAPPINGS).toHaveLength(3);
    expect(() =>
      assertProgramsParticipantParityMappings(
        PROGRAMS_PARTICIPANT_PARITY_MAPPINGS.slice(0, 2)
      )
    ).toThrow(/count mismatch/u);
  });

  test("requires exact responsive parity mappings for cases 9 and 35", () => {
    expect(() =>
      assertProgramsResponsiveParityMappings(
        PROGRAMS_RESPONSIVE_PARITY_MAPPINGS
      )
    ).not.toThrow();
    expect(PROGRAMS_RESPONSIVE_PARITY_MAPPINGS).toHaveLength(2);
    expect(() =>
      assertProgramsResponsiveParityMappings(
        PROGRAMS_RESPONSIVE_PARITY_MAPPINGS.slice(0, 1)
      )
    ).toThrow(/count mismatch/u);
  });

  test("requires each navigation replacement once in phone-390", () => {
    const mappedSpecs = PROGRAMS_NAVIGATION_PARITY_MAPPINGS.map(
      ({ replacementTest, replacementFile }) => ({
        title: replacementTest,
        file: path.basename(replacementFile),
        tests: [
          {
            projectName: "phone-390",
            results: [{ status: "passed", retry: 0 }],
          },
        ],
      })
    );
    const existingSpecs = Array.from({ length: 47 }, (_, index) => ({
      title: `existing Browser test ${index + 1}`,
      file: "programs-participant-acceptance.test.ts",
      tests: [
        {
          projectName: "phone-390",
          results: [{ status: "passed", retry: 0 }],
        },
      ],
    }));
    const report = {
      config: { rootDir: path.join(repoRoot, "tests/e2e") },
      stats: {
        expected: PROGRAMS_BROWSER_EXPECTED_TESTS,
        skipped: 0,
        unexpected: 0,
        flaky: 0,
      },
      suites: [
        { file: "programs-navigation-parity.test.ts", specs: mappedSpecs },
        {
          file: "programs-participant-acceptance.test.ts",
          specs: existingSpecs,
        },
      ],
    };
    expect(() =>
      assertProgramsNavigationBrowserReportMatchesMappings(report)
    ).not.toThrow();

    const missingOneProject = {
      ...report,
      suites: [
        {
          file: "programs-navigation-parity.test.ts",
          specs: [
            ...mappedSpecs.slice(1),
            {
              title: "existing replacement count filler",
              file: "programs-participant-acceptance.test.ts",
              tests: [
                {
                  projectName: "phone-390",
                  results: [{ status: "passed", retry: 0 }],
                },
              ],
            },
          ],
        },
        {
          file: "programs-participant-acceptance.test.ts",
          specs: existingSpecs,
        },
      ],
    };
    expect(() =>
      assertProgramsNavigationBrowserReportMatchesMappings(missingOneProject)
    ).toThrow(/once in phone-390/u);

    const wrongProject = {
      ...report,
      suites: [
        {
          file: "programs-navigation-parity.test.ts",
          specs: mappedSpecs.map((spec, index) =>
            index === 0
              ? {
                  ...spec,
                  tests: [
                    {
                      projectName: "phone-360",
                      results: [{ status: "passed", retry: 0 }],
                    },
                  ],
                }
              : spec
          ),
        },
        {
          file: "programs-participant-acceptance.test.ts",
          specs: existingSpecs,
        },
      ],
    };
    expect(() =>
      assertProgramsNavigationBrowserReportMatchesMappings(wrongProject)
    ).toThrow(/unexpected Browser project phone-360/u);

    const wrongFile = {
      ...report,
      suites: [
        {
          file: "programs-navigation-parity.test.ts",
          specs: mappedSpecs.map((spec, index) =>
            index === 0 ? { ...spec, file: "other.test.ts" } : spec
          ),
        },
        {
          file: "programs-participant-acceptance.test.ts",
          specs: existingSpecs,
        },
      ],
    };
    expect(() =>
      assertProgramsNavigationBrowserReportMatchesMappings(wrongFile)
    ).toThrow(/came from/u);
  });

  test("requires every management replacement once in phone-390", () => {
    const browserMappings = PROGRAMS_MANAGEMENT_PARITY_MAPPINGS.filter(
      ({ replacementFile }) =>
        replacementFile === "tests/e2e/programs-management-acceptance.test.ts"
    );
    const projects = ["phone-390"];
    const managementSpecs = browserMappings.flatMap(({ replacementTest }) =>
      projects.map((projectName) => ({
        title: replacementTest,
        file: "programs-management-acceptance.test.ts",
        tests: [{ projectName, results: [{ status: "passed", retry: 0 }] }],
      }))
    );
    const navigationSpecs = PROGRAMS_NAVIGATION_PARITY_MAPPINGS.map(
      ({ replacementTest }) => ({
        title: replacementTest,
        file: "programs-navigation-parity.test.ts",
        tests: [
          {
            projectName: "phone-390",
            results: [{ status: "passed", retry: 0 }],
          },
        ],
      })
    );
    const existingSpecs = Array.from({ length: 22 }, (_, index) => ({
      title: `existing Browser test ${index + 1}`,
      file: "programs-participant-acceptance.test.ts",
      tests: [
        {
          projectName: "phone-390",
          results: [{ status: "passed", retry: 0 }],
        },
      ],
    }));
    const report = {
      config: { rootDir: path.join(repoRoot, "tests/e2e") },
      stats: {
        expected: PROGRAMS_BROWSER_EXPECTED_TESTS,
        skipped: 0,
        unexpected: 0,
        flaky: 0,
      },
      suites: [
        {
          file: "programs-management-acceptance.test.ts",
          specs: managementSpecs,
        },
        { file: "programs-navigation-parity.test.ts", specs: navigationSpecs },
        {
          file: "programs-participant-acceptance.test.ts",
          specs: existingSpecs,
        },
      ],
    };
    expect(() =>
      assertProgramsManagementBrowserReportMatchesMappings(report)
    ).not.toThrow();

    const missingOneViewport = {
      ...report,
      suites: [
        {
          file: "programs-management-acceptance.test.ts",
          specs: managementSpecs.slice(1),
        },
        { file: "programs-navigation-parity.test.ts", specs: navigationSpecs },
        {
          file: "programs-participant-acceptance.test.ts",
          specs: [
            ...existingSpecs,
            {
              title: "existing Browser count filler",
              file: "programs-participant-acceptance.test.ts",
              tests: [
                {
                  projectName: "phone-390",
                  results: [{ status: "passed", retry: 0 }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(() =>
      assertProgramsManagementBrowserReportMatchesMappings(missingOneViewport)
    ).toThrow(/once in phone-360|once in phone-390|once in phone-402/u);

    const wrongFile = {
      ...report,
      suites: [
        {
          file: "programs-management-acceptance.test.ts",
          specs: managementSpecs.map((spec, index) =>
            index === 0 ? { ...spec, file: "other.test.ts" } : spec
          ),
        },
        { file: "programs-navigation-parity.test.ts", specs: navigationSpecs },
        {
          file: "programs-participant-acceptance.test.ts",
          specs: existingSpecs,
        },
      ],
    };
    expect(() =>
      assertProgramsManagementBrowserReportMatchesMappings(wrongFile)
    ).toThrow(/came from/u);
  });

  test("requires participant parity journeys in all three phone projects", () => {
    const projects = ["phone-360", "phone-390", "phone-402"];
    const mappedSpecs = PROGRAMS_PARTICIPANT_PARITY_MAPPINGS.flatMap(
      ({ replacementTest, replacementFile }) =>
        projects.map((projectName) => ({
          title: replacementTest,
          file: path.basename(replacementFile),
          projectName,
        }))
    );
    expect(() =>
      assertProgramsParticipantBrowserReportMatchesMappings(
        syntheticPlaywrightReport(mappedSpecs, PROGRAMS_BROWSER_EXPECTED_TESTS)
      )
    ).not.toThrow();

    const missingPhone = mappedSpecs.map((spec) =>
      spec.title === PROGRAMS_PARTICIPANT_PARITY_MAPPINGS[0]?.replacementTest &&
      spec.projectName === "phone-360"
        ? { ...spec, projectName: "phone-402" }
        : spec
    );
    expect(() =>
      assertProgramsParticipantBrowserReportMatchesMappings(
        syntheticPlaywrightReport(missingPhone, PROGRAMS_BROWSER_EXPECTED_TESTS)
      )
    ).toThrow(/once in phone-360/u);
  });

  test("requires the responsive parity journeys at their reviewed widths", () => {
    const responsiveProjects = [
      "phone-320",
      "phone-360",
      "phone-390",
      "phone-402",
      "phone-600",
      "phone-799",
      "desktop-800",
      "desktop-1024",
      "desktop-1440",
    ];
    const mappedSpecs = PROGRAMS_RESPONSIVE_PARITY_MAPPINGS.flatMap(
      ({ oldId, replacementTest, replacementFile }) =>
        (oldId === "programs-d1:9" ? ["phone-320"] : responsiveProjects).map(
          (projectName) => ({
            title: replacementTest,
            file: path.basename(replacementFile),
            projectName,
          })
        )
    );
    expect(() =>
      assertProgramsResponsiveReportMatchesMappings(
        syntheticPlaywrightReport(
          mappedSpecs,
          PROGRAMS_RESPONSIVE_EXPECTED_TESTS
        )
      )
    ).not.toThrow();

    const wrongWidth = mappedSpecs.map((spec) =>
      spec.title === PROGRAMS_RESPONSIVE_PARITY_MAPPINGS[0]?.replacementTest
        ? { ...spec, projectName: "phone-390" }
        : spec
    );
    expect(() =>
      assertProgramsResponsiveReportMatchesMappings(
        syntheticPlaywrightReport(
          wrongWidth,
          PROGRAMS_RESPONSIVE_EXPECTED_TESTS
        )
      )
    ).toThrow(/once in phone-320/u);
  });

  test("matches all seven feed reports to their named Playwright specs", () => {
    const report = {
      config: { rootDir: path.join(repoRoot, "tests/e2e") },
      stats: { expected: 7, skipped: 0, unexpected: 0, flaky: 0 },
      suites: [
        {
          file: "programs-home-acceptance.test.ts",
          specs: PROGRAMS_FEED_ACCEPTANCE_MAPPINGS.map(
            ({ replacementTest }) => ({
              title: replacementTest,
              tests: [{ results: [{ status: "passed", retry: 0 }] }],
            })
          ),
        },
      ],
    };
    expect(() =>
      assertFeedAcceptanceReportMatchesMappings(report)
    ).not.toThrow();
    expect(() =>
      assertFeedAcceptanceReportMatchesMappings({
        ...report,
        suites: [
          {
            ...report.suites[0],
            specs: [
              ...report.suites[0].specs.slice(0, 6),
              { ...report.suites[0].specs[6], title: "unrecognized feed test" },
            ],
          },
        ],
      })
    ).toThrow(/unrecognized test/u);
  });

  test("rejects missing or unrecognized PUI-05 Home case IDs", () => {
    expect(() =>
      assertHomeParityMappings([
        ...PUI05_HOME_ACCEPTANCE_MAPPINGS.slice(0, 4),
        PUI05_HOME_ACCEPTANCE_MAPPINGS[0],
      ])
    ).toThrow(/duplicates old ID/u);
    expect(() =>
      assertHomeParityMappings([
        ...PUI05_HOME_ACCEPTANCE_MAPPINGS.slice(0, 4),
        {
          ...PUI05_HOME_ACCEPTANCE_MAPPINGS[4],
          oldId: "PUI-05:999",
        },
      ])
    ).toThrow(/unrecognized old ID/u);
  });

  test("binds each historical PUI-05 row to its exact replacement", () => {
    expect(() =>
      assertHomeParityMappings([
        ...PUI05_HOME_ACCEPTANCE_MAPPINGS.slice(0, 3),
        {
          ...PUI05_HOME_ACCEPTANCE_MAPPINGS[3],
          oldTitle: "a different historical case",
        },
        PUI05_HOME_ACCEPTANCE_MAPPINGS[4],
      ])
    ).toThrow(/approved replacement/u);
    expect(() =>
      assertHomeParityMappings([
        ...PUI05_HOME_ACCEPTANCE_MAPPINGS.slice(0, 3),
        {
          ...PUI05_HOME_ACCEPTANCE_MAPPINGS[3],
          replacementTest: "different replacement test",
        },
        PUI05_HOME_ACCEPTANCE_MAPPINGS[4],
      ])
    ).toThrow(/approved replacement/u);
    expect(() =>
      assertHomeParityMappings([
        ...PUI05_HOME_ACCEPTANCE_MAPPINGS.slice(0, 3),
        {
          ...PUI05_HOME_ACCEPTANCE_MAPPINGS[3],
          replacementFile: "tests/e2e/other.test.ts",
        },
        PUI05_HOME_ACCEPTANCE_MAPPINGS[4],
      ])
    ).toThrow(/approved replacement/u);
  });

  test("rejects duplicate replacement tests", () => {
    expect(() =>
      assertHomeParityMappings([
        PUI05_HOME_ACCEPTANCE_MAPPINGS[0],
        {
          ...PUI05_HOME_ACCEPTANCE_MAPPINGS[1],
          replacementTest: PUI05_HOME_ACCEPTANCE_MAPPINGS[0].replacementTest,
        },
        ...PUI05_HOME_ACCEPTANCE_MAPPINGS.slice(2),
      ])
    ).toThrow(/duplicates replacement test/u);
  });

  test("matches every Home report case to its named Playwright spec", () => {
    const report = {
      config: { rootDir: path.join(repoRoot, "tests/e2e") },
      stats: { expected: 5, skipped: 0, unexpected: 0, flaky: 0 },
      suites: [
        {
          file: "programs-home-acceptance.test.ts",
          specs: PUI05_HOME_ACCEPTANCE_MAPPINGS.map(({ replacementTest }) => ({
            title: replacementTest,
            tests: [{ results: [{ status: "passed", retry: 0 }] }],
          })),
        },
      ],
    };
    expect(() =>
      assertHomeAcceptanceReportMatchesMappings(report)
    ).not.toThrow();
    expect(() =>
      assertHomeAcceptanceReportMatchesMappings({
        ...report,
        suites: [
          {
            ...report.suites[0],
            specs: [
              ...report.suites[0].specs.slice(0, 4),
              {
                ...report.suites[0].specs[4],
                title: "unrecognized Home test",
              },
            ],
          },
        ],
      })
    ).toThrow(/unrecognized test/u);
    expect(() =>
      assertHomeAcceptanceReportMatchesMappings({
        ...report,
        suites: [
          {
            ...report.suites[0],
            file: "home.test.ts",
          },
        ],
      })
    ).toThrow(/came from/u);
  });

  test("keeps the sustained canary separate and discloses B-003", () => {
    expect(PROMOTION_STAGES.map(({ name }) => name)).not.toContain(
      RUNTIME_CANARY_STAGE.name
    );
    expect(B003_RESIDUAL_RISK).toMatchObject({
      id: "B-003",
      status: "open",
      disposition: "accepted-rescue-development-risk",
      scope: "rescue-development only",
      ownerApprovalReference:
        "https://github.com/Noahlw/efcc/issues/505#issuecomment-5550498028",
      diagnosticCommand: "pnpm test:programs:canary",
    });
  });

  test("qualifies finite stages without hiding an independent red canary", () => {
    const finiteResults = PROMOTION_STAGES.map(({ name }) => ({
      name,
      status: "passed",
    }));

    expect(
      isFunctionalPromotionManifest({
        status: "functional-passed",
        riskDisclosure: B003_RESIDUAL_RISK,
        diagnostic: {
          runtimeCanary: {
            command: "pnpm test:programs:canary",
            status: "failed",
            revision: "rev-1",
            artifact: "test-results/programs-runtime-canary/run.json",
          },
        },
        migrationLedger: {
          participantRows: 1,
          managementRows: 1,
          executableMappings: [
            "web/lib/programs/programs-contract.test.ts",
            "tests/e2e/programs-participant-acceptance.test.ts",
            "tests/e2e/programs-management-acceptance.test.ts",
            "tests/e2e/programs-responsive-matrix.test.ts",
          ],
        },
        homeParityMappings: PUI05_HOME_ACCEPTANCE_MAPPINGS,
        feedParityMappings: PROGRAMS_FEED_ACCEPTANCE_MAPPINGS,
        programsNavigationParityMappings: PROGRAMS_NAVIGATION_PARITY_MAPPINGS,
        programsManagementParityMappings: PROGRAMS_MANAGEMENT_PARITY_MAPPINGS,
        programsParticipantParityMappings: PROGRAMS_PARTICIPANT_PARITY_MAPPINGS,
        programsResponsiveParityMappings: PROGRAMS_RESPONSIVE_PARITY_MAPPINGS,
        stageResults: [
          ...finiteResults,
          { name: "runtime-canary", status: "failed" },
        ],
      })
    ).toBeTruthy();
    expect(
      isFunctionalPromotionManifest({
        status: "functional-passed",
        homeParityMappings: PUI05_HOME_ACCEPTANCE_MAPPINGS,
        stageResults: finiteResults,
      })
    ).toBeFalsy();
  });

  test("requires complete migration ledgers and executable mappings", () => {
    const participantLedger = readFileSync(
      path.join(
        repoRoot,
        "docs/implementation/t05-participant-migration-ledger.md"
      ),
      "utf-8"
    );
    const managementLedger = readFileSync(
      path.join(
        repoRoot,
        "docs/implementation/t05-management-migration-ledger.md"
      ),
      "utf-8"
    );

    expect(
      assertMigrationLedgersComplete(participantLedger, managementLedger)
    ).toMatchObject({
      participantRows: expect.any(Number),
      managementRows: expect.any(Number),
      executableMappings: expect.arrayContaining([
        "web/lib/programs/programs-contract.test.ts",
        "tests/e2e/programs-participant-acceptance.test.ts",
        "tests/e2e/programs-management-acceptance.test.ts",
        "tests/e2e/programs-responsive-matrix.test.ts",
      ]),
    });
    expect(() =>
      assertMigrationLedgersComplete(
        participantLedger.replace(
          /\| PUI-01 admin participant[^\n]*/u,
          "| PUI-01 | | | |"
        ),
        managementLedger
      )
    ).toThrow(/ledger row/u);
  });

  test("accepts only a complete zero-retry Playwright report", () => {
    const report = {
      stats: { expected: 2, skipped: 0, unexpected: 0, flaky: 0 },
      suites: [
        {
          specs: [
            {
              tests: [{ results: [{ status: "passed", retry: 0 }] }],
            },
            {
              tests: [{ results: [{ status: "passed", retry: 0 }] }],
            },
          ],
        },
      ],
    };

    expect(() => assertPlaywrightReportGreen(report, 2)).not.toThrow();
    expect(() =>
      assertPlaywrightReportGreen(
        { ...report, stats: { ...report.stats, skipped: 1 } },
        2
      )
    ).toThrow(/skipped=1/u);
    expect(() =>
      assertPlaywrightReportGreen(
        {
          ...report,
          suites: [
            {
              specs: [
                { tests: [{ results: [{ status: "passed", retry: 1 }] }] },
                { tests: [{ results: [{ status: "passed", retry: 0 }] }] },
              ],
            },
          ],
        },
        2
      )
    ).toThrow(/retry/u);
    expect(() =>
      assertPlaywrightReportGreen(
        {
          stats: { expected: 2, skipped: 0, unexpected: 0, flaky: 0 },
          suites: [],
        },
        2
      )
    ).toThrow(/result count/u);
    expect(() =>
      assertPlaywrightReportGreen(
        {
          ...report,
          suites: [
            {
              specs: [
                { tests: [{ results: [{ status: "passed" }] }] },
                { tests: [{ results: [{ status: "passed", retry: 0 }] }] },
              ],
            },
          ],
        },
        2
      )
    ).toThrow(/retry/u);
  });

  test("accepts only a loopback target for canonical promotion", () => {
    expect(assertLocalPromotionTarget("http://127.0.0.1:8788/").origin).toBe(
      "http://127.0.0.1:8788"
    );
    expect(() =>
      assertLocalPromotionTarget(
        "https://efcc-dev-example.efcc-ggc.workers.dev"
      )
    ).toThrow(/loopback/u);
  });

  test("pins each stage artifact to the current promotion run", () => {
    const artifactDirectory = "/tmp/t05-promotion/run-1";
    expect(stageArtifactPath(PROMOTION_STAGES[0], artifactDirectory)).toBe(
      "/tmp/t05-promotion/run-1/worker-contract.log"
    );
    expect(stageArtifactPath(PROMOTION_STAGES[1], artifactDirectory)).toBe(
      "/tmp/t05-promotion/run-1/browser-results.json"
    );
    expect(stageArtifactPath(PROMOTION_STAGES[2], artifactDirectory)).toBe(
      "/tmp/t05-promotion/run-1/home-results.json"
    );
    expect(stageArtifactPath(PROMOTION_STAGES[3], artifactDirectory)).toBe(
      "/tmp/t05-promotion/run-1/responsive-results.json"
    );
    expect(stageArtifactPath(PROMOTION_STAGES[4], artifactDirectory)).toBe(
      "/tmp/t05-promotion/run-1/feed-results.json"
    );
  });

  test("pins the runtime canary artifact path", () => {
    const artifactDirectory = "/tmp/t05-promotion/run-1";
    expect(stageArtifactPath(RUNTIME_CANARY_STAGE, artifactDirectory)).toBe(
      "/tmp/t05-promotion/run-1/runtime-canary"
    );
  });

  test("accepts only a complete current-revision canary artifact", () => {
    const artifact = {
      status: "passed",
      revision: "rev-1",
      runtime: "wrangler-dev-local",
      config: "web/wrangler.jsonc",
      windowMs: 5 * 60 * 1000,
      retries: 0,
      setupStartedAt: "2026-09-05T00:00:00.000Z",
      startedAt: "2026-09-05T00:01:00.000Z",
      finishedAt: "2026-09-05T00:06:00.000Z",
      scenariosCompleted: 1,
      failures: [],
    };
    expect(isCanaryArtifactGreen(artifact, "rev-1")).toBeTruthy();
    expect(
      isCanaryArtifactGreen({ ...artifact, windowMs: 1 }, "rev-1")
    ).toBeFalsy();
    expect(
      isCanaryArtifactGreen(
        { ...artifact, failures: [{ message: "boom" }] },
        "rev-1"
      )
    ).toBeFalsy();
    expect(
      isCanaryArtifactGreen(
        { ...artifact, runtime: "createTestHarness" },
        "rev-1"
      )
    ).toBeFalsy();
  });

  test("accepts only a current-run Home manifest with zero retries", () => {
    const manifest = {
      status: "passed",
      runtime: "wrangler-dev-local",
      config: "web/wrangler.jsonc",
      suite: "tests/e2e/programs-home-acceptance.config.ts",
      revision: "rev-1",
      layer: "home-browser-acceptance",
      retries: 0,
      target: "http://127.0.0.1:8787",
      reportPath: "test-results/programs-promotion/run-1/home-results.json",
      promotionRunId: "run-1",
    };
    expect(
      isHomeAcceptanceRunGreen(manifest, "rev-1", manifest.reportPath, "run-1")
    ).toBeTruthy();
    expect(
      isHomeAcceptanceRunGreen(
        { ...manifest, retries: 1 },
        "rev-1",
        manifest.reportPath,
        "run-1"
      )
    ).toBeFalsy();
    expect(
      isHomeAcceptanceRunGreen(
        { ...manifest, revision: "old-revision" },
        "rev-1",
        manifest.reportPath,
        "run-1"
      )
    ).toBeFalsy();
    expect(
      isHomeAcceptanceRunGreen(
        { ...manifest, runtime: "createTestHarness" },
        "rev-1",
        manifest.reportPath,
        "run-1"
      )
    ).toBeFalsy();
  });

  test("accepts only current-run local Browser and Responsive manifests", () => {
    const browserManifest = {
      status: "passed",
      runtime: "wrangler-dev-local",
      config: "web/wrangler.jsonc",
      suite: "tests/e2e/programs-participant-acceptance.config.ts",
      revision: "rev-1",
      layer: "browser-acceptance",
      retries: 0,
      target: "http://127.0.0.1:8787",
      reportPath: "test-results/programs-promotion/run-1/browser-results.json",
      promotionRunId: "run-1",
    };
    expect(
      isBrowserAcceptanceRunGreen(
        browserManifest,
        "rev-1",
        browserManifest.reportPath,
        "run-1"
      )
    ).toBeTruthy();
    expect(
      isBrowserAcceptanceRunGreen(
        { ...browserManifest, target: "https://example.com" },
        "rev-1",
        browserManifest.reportPath,
        "run-1"
      )
    ).toBeFalsy();
    expect(
      isBrowserAcceptanceRunGreen(
        { ...browserManifest, promotionRunId: "old-run" },
        "rev-1",
        browserManifest.reportPath,
        "run-1"
      )
    ).toBeFalsy();

    const responsiveManifest = {
      ...browserManifest,
      suite: "tests/e2e/programs-responsive-matrix.config.ts",
      layer: "responsive-matrix",
      reportPath:
        "test-results/programs-promotion/run-1/responsive-results.json",
    };
    expect(
      isResponsiveAcceptanceRunGreen(
        responsiveManifest,
        "rev-1",
        responsiveManifest.reportPath,
        "run-1"
      )
    ).toBeTruthy();
    expect(
      isResponsiveAcceptanceRunGreen(
        { ...responsiveManifest, retries: 1 },
        "rev-1",
        responsiveManifest.reportPath,
        "run-1"
      )
    ).toBeFalsy();
  });

  test("accepts only a current-run Feed manifest with zero retries", () => {
    const manifest = {
      status: "passed",
      runtime: "wrangler-dev-local",
      config: "web/wrangler.jsonc",
      suite: "tests/e2e/programs-feed-acceptance.config.ts",
      revision: "rev-1",
      layer: "feed-browser-acceptance",
      retries: 0,
      target: "http://127.0.0.1:8787",
      reportPath: "test-results/programs-promotion/run-1/feed-results.json",
      promotionRunId: "run-1",
    };
    expect(
      isFeedAcceptanceRunGreen(manifest, "rev-1", manifest.reportPath, "run-1")
    ).toBeTruthy();
    expect(
      isFeedAcceptanceRunGreen(
        { ...manifest, retries: 1 },
        "rev-1",
        manifest.reportPath,
        "run-1"
      )
    ).toBeFalsy();
    expect(
      isFeedAcceptanceRunGreen(
        { ...manifest, revision: "old-revision" },
        "rev-1",
        manifest.reportPath,
        "run-1"
      )
    ).toBeFalsy();
  });

  test("treats the worktree and every historical Programs group as gate inputs", () => {
    expect(isCleanWorktreeStatus("")).toBeTruthy();
    expect(
      isCleanWorktreeStatus(
        " M tests/e2e/programs-management-acceptance.test.ts"
      )
    ).toBeFalsy();

    const ledgers = [
      readFileSync(
        path.join(
          repoRoot,
          "docs/implementation/t05-participant-migration-ledger.md"
        ),
        "utf-8"
      ),
      readFileSync(
        path.join(
          repoRoot,
          "docs/implementation/t05-management-migration-ledger.md"
        ),
        "utf-8"
      ),
    ].join("\n");
    const packageJson = JSON.parse(
      readFileSync(path.join(repoRoot, "package.json"), "utf-8")
    ) as { scripts: Record<string, string> };
    for (const group of [
      "PUI-01",
      "PUI-02",
      "PUI-03",
      "PUI-04",
      "PUI-05",
      "MSG-01",
      "NTC-01",
      "MUI-01",
      "MUI-02",
      "CFG-01",
      "086-06",
      "EVT-01",
      "EVT-02",
      "NTF-01",
      "HUB-01",
    ]) {
      expect(ledgers, `${group} must be in a migration ledger`).toContain(
        group
      );
    }
    expect(packageJson.scripts["verify:programs"]).toContain(
      "scripts/verify-programs.ts"
    );
  });
});
