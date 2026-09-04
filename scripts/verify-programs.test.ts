import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  PROMOTION_STAGES,
  assertLocalPromotionTarget,
  assertPlaywrightReportGreen,
  isCleanWorktreeStatus,
} from "./verify-programs";

const repoRoot = path.resolve(import.meta.dirname, "..");

describe("T05.7 Programs promotion gate", () => {
  test("aggregates the independent layers in dependency order", () => {
    expect(PROMOTION_STAGES.map(({ name }) => name)).toEqual([
      "worker-contract",
      "runtime-canary",
      "browser-acceptance",
      "responsive-matrix",
      "non-browser-precommit",
    ]);
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
