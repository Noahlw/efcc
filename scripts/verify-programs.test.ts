import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  B003_RESIDUAL_RISK,
  PROMOTION_STAGES,
  RUNTIME_CANARY_STAGE,
  assertLocalPromotionTarget,
  isCanaryArtifactGreen,
  isFunctionalPromotionManifest,
  assertPlaywrightReportGreen,
  isCleanWorktreeStatus,
  stageArtifactPath,
} from "./verify-programs";

const repoRoot = path.resolve(import.meta.dirname, "..");

describe("T05.7 Programs promotion gate", () => {
  test("aggregates the independent layers in dependency order", () => {
    expect(PROMOTION_STAGES.map(({ name }) => name)).toEqual([
      "worker-contract",
      "browser-acceptance",
      "responsive-matrix",
      "non-browser-precommit",
    ]);
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
        stageResults: [
          ...finiteResults,
          { name: "runtime-canary", status: "failed" },
        ],
      })
    ).toBe(true);
    expect(
      isFunctionalPromotionManifest({
        status: "functional-passed",
        stageResults: finiteResults,
      })
    ).toBe(false);
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
    expect(isCanaryArtifactGreen(artifact, "rev-1")).toBe(true);
    expect(isCanaryArtifactGreen({ ...artifact, windowMs: 1 }, "rev-1")).toBe(
      false
    );
    expect(
      isCanaryArtifactGreen(
        { ...artifact, failures: [{ message: "boom" }] },
        "rev-1"
      )
    ).toBe(false);
  });

  test("treats the worktree and every historical Programs group as gate inputs", () => {
    expect(isCleanWorktreeStatus("")).toBe(true);
    expect(isCleanWorktreeStatus(" M tests/e2e/programs-d1.test.ts")).toBe(
      false
    );

    const ledgers = [
      readFileSync(
        path.join(
          repoRoot,
          "docs/implementation/t05-participant-migration-ledger.md"
        ),
        "utf8"
      ),
      readFileSync(
        path.join(
          repoRoot,
          "docs/implementation/t05-management-migration-ledger.md"
        ),
        "utf8"
      ),
    ].join("\n");
    const historicalConfig = readFileSync(
      path.join(repoRoot, "tests/e2e/programs-d1.config.ts"),
      "utf8"
    );
    const governanceWorkflow = readFileSync(
      path.join(repoRoot, ".github/workflows/ui-governance.yml"),
      "utf8"
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
    expect(governanceWorkflow).toContain("workflow_dispatch:");
    expect(governanceWorkflow).not.toMatch(
      /^\s+(push|pull_request|schedule):/mu
    );
  });
});
