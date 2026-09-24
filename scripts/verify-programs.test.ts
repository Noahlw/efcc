import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  B003_RESIDUAL_RISK,
  PUI05_HOME_ACCEPTANCE_MAPPINGS,
  PROMOTION_STAGES,
  RUNTIME_CANARY_STAGE,
  assertHomeAcceptanceReportMatchesMappings,
  assertHomeParityMappings,
  assertMigrationLedgersComplete,
  assertLocalPromotionTarget,
  isCanaryArtifactGreen,
  isFunctionalPromotionManifest,
  isHomeAcceptanceRunGreen,
  assertPlaywrightReportGreen,
  isCleanWorktreeStatus,
  stageArtifactPath,
} from "./verify-programs";

const repoRoot = path.resolve(import.meta.dirname, "..");

describe("T05.7 Programs promotion gate", () => {
  test("aggregates the independent layers in dependency order", () => {
    expect(PROMOTION_STAGES.map(({ name }) => name)).toStrictEqual([
      "worker-contract",
      "browser-acceptance",
      "home-browser-acceptance",
      "responsive-matrix",
    ]);
    expect(
      PROMOTION_STAGES.map(({ name, expectedTests }) => [name, expectedTests])
    ).toStrictEqual([
      ["worker-contract", undefined],
      ["browser-acceptance", 48],
      ["home-browser-acceptance", 5],
      ["responsive-matrix", 21],
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
      stats: { expected: 5, skipped: 0, unexpected: 0, flaky: 0 },
      suites: [
        {
          file: "tests/e2e/programs-home-acceptance.test.ts",
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
            file: "tests/e2e/home.test.ts",
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
    expect(stageArtifactPath(RUNTIME_CANARY_STAGE, artifactDirectory)).toBe(
      "/tmp/t05-promotion/run-1/runtime-canary"
    );
  });

  test("accepts only a complete current-revision canary artifact", () => {
    const artifact = {
      status: "passed",
      revision: "rev-1",
      runtime: "createTestHarness",
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
  });

  test("accepts only a current-run Home manifest with zero retries", () => {
    const manifest = {
      status: "passed",
      runtime: "createTestHarness",
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
  });

  test("treats the worktree and every historical Programs group as gate inputs", () => {
    expect(isCleanWorktreeStatus("")).toBeTruthy();
    expect(
      isCleanWorktreeStatus(" M tests/e2e/programs-d1.test.ts")
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
    const historicalConfig = readFileSync(
      path.join(repoRoot, "tests/e2e/programs-d1.config.ts"),
      "utf-8"
    );
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
    expect(historicalConfig).toMatch(
      /diagnostic[\s\S]*not promotion authority/iu
    );
  });
});
