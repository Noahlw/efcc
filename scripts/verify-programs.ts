import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(import.meta.dirname, "..");

type PromotionStage = {
  name: string;
  args: readonly string[];
  report?: string;
  expectedTests?: number;
};

type PromotionStageResult = {
  name: string;
  status: "running" | "passed" | "failed" | "not_run";
  artifacts: string[];
  failure?: string;
};

export const PROMOTION_STAGES: readonly PromotionStage[] = [
  { name: "worker-contract", args: ["test:programs:contract"] },
  { name: "runtime-canary", args: ["test:programs:canary"] },
  {
    name: "browser-acceptance",
    args: ["test:programs:browser"],
    report: "browser-results.json",
    expectedTests: 2,
  },
  {
    name: "responsive-matrix",
    args: ["test:programs:responsive"],
    report: "responsive-results.json",
    expectedTests: 6,
  },
  { name: "non-browser-precommit", args: ["verify:precommit"] },
];

type JsonRecord = Record<string, unknown>;
const EXPECTED_CANARY_WINDOW_MS = 5 * 60 * 1000;
const EXPECTED_CANARY_RETRIES = 0;

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function numberField(record: JsonRecord | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === "number" ? value : null;
}

function reportStatuses(
  report: unknown
): { status: string; retry: number | null }[] {
  const root = asRecord(report);
  const found: { status: string; retry: number | null }[] = [];
  const visit = (suites: unknown): void => {
    if (!Array.isArray(suites)) {
      return;
    }
    for (const suiteValue of suites) {
      const suite = asRecord(suiteValue);
      if (!suite) {
        continue;
      }
      if (Array.isArray(suite.specs)) {
        for (const specValue of suite.specs) {
          const spec = asRecord(specValue);
          if (!Array.isArray(spec?.tests)) {
            continue;
          }
          for (const testValue of spec.tests) {
            const test = asRecord(testValue);
            if (!Array.isArray(test?.results)) {
              continue;
            }
            for (const resultValue of test.results) {
              const result = asRecord(resultValue);
              if (!result) {
                continue;
              }
              found.push({
                status: typeof result.status === "string" ? result.status : "",
                retry: numberField(result, "retry"),
              });
            }
          }
        }
      }
      visit(suite.suites);
    }
  };
  visit(root?.suites);
  return found;
}

export function assertPlaywrightReportGreen(
  report: unknown,
  expectedTests: number
): void {
  const stats = asRecord(asRecord(report)?.stats);
  const expected = numberField(stats, "expected");
  const skipped = numberField(stats, "skipped");
  const unexpected = numberField(stats, "unexpected");
  const flaky = numberField(stats, "flaky");
  if (
    expected !== expectedTests ||
    skipped !== 0 ||
    unexpected !== 0 ||
    flaky !== 0
  ) {
    throw new Error(
      `Playwright report is not Green: expected=${String(expected)}, skipped=${String(skipped)}, unexpected=${String(unexpected)}, flaky=${String(flaky)}`
    );
  }
  const statuses = reportStatuses(report);
  if (statuses.length !== expectedTests) {
    throw new Error(
      `Playwright report result count mismatch: results=${statuses.length}, expected=${expectedTests}`
    );
  }
  const invalid = statuses.find(
    ({ status, retry }) => status !== "passed" || retry !== 0
  );
  if (invalid) {
    throw new Error(
      `Playwright report contains a non-zero retry or non-passed result: status=${invalid.status}, retry=${invalid.retry}`
    );
  }
}

export function isCleanWorktreeStatus(status: string): boolean {
  return status.trim() === "";
}

export function assertLocalPromotionTarget(raw: string): URL {
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    throw new Error(
      "T05.7 canonical promotion requires a loopback HTTP target"
    );
  }
  if (
    target.protocol !== "http:" ||
    target.username ||
    target.password ||
    !["localhost", "127.0.0.1"].includes(target.hostname)
  ) {
    throw new Error(
      "T05.7 canonical promotion requires a loopback HTTP target; deployed targets are diagnostic-only"
    );
  }
  return target;
}

function runId(): string {
  return new Date()
    .toISOString()
    .replaceAll(/[^0-9a-z]/giu, "")
    .toLowerCase();
}

async function writeJson(filename: string, value: unknown): Promise<void> {
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function currentRevision(): Promise<string> {
  const result = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: REPO_ROOT,
  });
  return result.stdout.trim();
}

async function readReport(filename: string): Promise<unknown> {
  return JSON.parse(await readFile(filename, "utf8"));
}

export function stageArtifactPath(
  stage: PromotionStage,
  artifactDirectory: string
): string {
  if (stage.name === "runtime-canary") {
    return path.join(artifactDirectory, "runtime-canary");
  }
  if (stage.report !== undefined) {
    return path.join(artifactDirectory, stage.report);
  }
  return path.join(artifactDirectory, `${stage.name}.log`);
}

function timestamp(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isCanaryArtifactGreen(
  manifest: JsonRecord | null,
  expectedRevision: string
): boolean {
  const setupStartedAt = timestamp(manifest?.setupStartedAt);
  const startedAt = timestamp(manifest?.startedAt);
  const finishedAt = timestamp(manifest?.finishedAt);
  const scenariosCompleted = manifest?.scenariosCompleted;
  return (
    manifest?.status === "passed" &&
    manifest.revision === expectedRevision &&
    manifest.runtime === "createTestHarness" &&
    manifest.config === "web/wrangler.jsonc" &&
    manifest.windowMs === EXPECTED_CANARY_WINDOW_MS &&
    manifest.retries === EXPECTED_CANARY_RETRIES &&
    setupStartedAt !== null &&
    startedAt !== null &&
    finishedAt !== null &&
    setupStartedAt <= startedAt &&
    finishedAt - startedAt >= EXPECTED_CANARY_WINDOW_MS &&
    Array.isArray(manifest.failures) &&
    manifest.failures.length === 0 &&
    typeof scenariosCompleted === "number" &&
    Number.isInteger(scenariosCompleted) &&
    scenariosCompleted > 0
  );
}

async function readCanaryRun(filename: string): Promise<JsonRecord | null> {
  try {
    return asRecord(JSON.parse(await readFile(filename, "utf8")));
  } catch {
    return null;
  }
}

function commandOutput(error: unknown): string {
  const record = asRecord(error);
  return `${typeof record?.stdout === "string" ? record.stdout : ""}${typeof record?.stderr === "string" ? record.stderr : ""}`;
}

async function runStage(
  stage: PromotionStage,
  artifactDirectory: string
): Promise<string[]> {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    PROGRAMS_PROMOTION_RUN_ID: path.basename(artifactDirectory),
  };
  const stageArtifact = stageArtifactPath(stage, artifactDirectory);
  const stageLog = path.join(artifactDirectory, `${stage.name}.log`);
  if (stage.name === "browser-acceptance") {
    environment.PROGRAMS_BROWSER_RESULTS_FILE = path.join(
      artifactDirectory,
      stage.report ?? "browser-results.json"
    );
    environment.PROGRAMS_BROWSER_ARTIFACT_DIRECTORY = path.join(
      artifactDirectory,
      "browser-acceptance"
    );
  }
  if (stage.name === "responsive-matrix") {
    environment.PROGRAMS_RESPONSIVE_RESULTS_FILE = path.join(
      artifactDirectory,
      stage.report ?? "responsive-results.json"
    );
    environment.PROGRAMS_RESPONSIVE_ARTIFACT_DIRECTORY = path.join(
      artifactDirectory,
      "responsive-matrix"
    );
  }
  if (stage.name === "runtime-canary") {
    environment.PROGRAMS_CANARY_ARTIFACT_DIRECTORY = stageArtifact;
  }
  console.log(`T05.7 ${stage.name} started`);
  try {
    const result = await execFileAsync("pnpm", [...stage.args], {
      cwd: REPO_ROOT,
      env: environment,
      maxBuffer: 16 * 1024 * 1024,
    });
    await writeFile(stageLog, `${result.stdout}${result.stderr}`, "utf8");
  } catch (error) {
    await writeFile(stageLog, commandOutput(error), "utf8");
    throw new Error(
      `T05.7 ${stage.name} failed; see ${path.relative(REPO_ROOT, path.join(artifactDirectory, `${stage.name}.log`))}`,
      { cause: error }
    );
  }
  if (stage.report && stage.expectedTests !== undefined) {
    const reportPath = path.join(artifactDirectory, stage.report);
    try {
      assertPlaywrightReportGreen(
        await readReport(reportPath),
        stage.expectedTests
      );
    } catch (error) {
      throw new Error(
        `T05.7 ${stage.name} report failed Green validation: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  if (stage.name === "runtime-canary") {
    const canaryManifestPath = path.join(stageArtifact, "run.json");
    const canary = await readCanaryRun(canaryManifestPath);
    if (
      canary === null ||
      !isCanaryArtifactGreen(canary, await currentRevision())
    ) {
      throw new Error(
        `T05.7 runtime-canary did not leave a passed current-run five-minute artifact at ${path.relative(REPO_ROOT, canaryManifestPath)}`
      );
    }
  }
  console.log(`T05.7 ${stage.name} passed`);
  return [
    ...new Set(
      [stageArtifact, stageLog].map((filename) =>
        path.relative(REPO_ROOT, filename)
      )
    ),
  ];
}

async function main(): Promise<void> {
  const artifactDirectory = path.join(
    REPO_ROOT,
    "test-results",
    "programs-promotion",
    runId()
  );
  await mkdir(artifactDirectory, { recursive: true });
  const revision = await currentRevision();
  const manifest: {
    schemaVersion: number;
    authority: string;
    runId: string;
    revision: string;
    status: string;
    startedAt: string;
    finishedAt?: string;
    stages: string[];
    stageResults: PromotionStageResult[];
    failure?: string;
    artifacts: string;
  } = {
    schemaVersion: 1,
    authority: "T05.7 layered Programs promotion gate",
    runId: path.basename(artifactDirectory),
    revision,
    status: "running",
    startedAt: new Date().toISOString(),
    stages: [],
    stageResults: [],
    artifacts: path.relative(REPO_ROOT, artifactDirectory),
  };
  await writeJson(path.join(artifactDirectory, "promotion.json"), manifest);

  try {
    const promotionTarget = assertLocalPromotionTarget(
      process.env.PROGRAMS_TARGET_URL ?? "http://127.0.0.1:8787"
    );
    const status = await execFileAsync("git", ["status", "--porcelain"], {
      cwd: REPO_ROOT,
    });
    if (!isCleanWorktreeStatus(status.stdout)) {
      throw new Error(
        "T05.7 requires a clean worktree before promotion qualification"
      );
    }
    for (const stage of PROMOTION_STAGES) {
      const stageResult: PromotionStageResult = {
        name: stage.name,
        status: "running",
        artifacts: [
          path.relative(REPO_ROOT, stageArtifactPath(stage, artifactDirectory)),
          path.relative(
            REPO_ROOT,
            path.join(artifactDirectory, `${stage.name}.log`)
          ),
        ].filter((value, index, values) => values.indexOf(value) === index),
      };
      manifest.stageResults.push(stageResult);
      await writeJson(path.join(artifactDirectory, "promotion.json"), manifest);
      try {
        process.env.PROGRAMS_TARGET_URL = promotionTarget.origin;
        stageResult.artifacts = await runStage(stage, artifactDirectory);
        stageResult.status = "passed";
        manifest.stages.push(stage.name);
      } catch (error) {
        stageResult.status = "failed";
        stageResult.failure =
          error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        await writeJson(
          path.join(artifactDirectory, "promotion.json"),
          manifest
        );
      }
    }
    manifest.status = "STACK_GREEN";
  } catch (error) {
    manifest.status = "failed";
    manifest.failure = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
    process.stderr.write(`${manifest.failure}\n`);
  } finally {
    const recordedStages = new Set(
      manifest.stageResults.map(({ name }) => name)
    );
    for (const stage of PROMOTION_STAGES) {
      if (recordedStages.has(stage.name)) {
        continue;
      }
      manifest.stageResults.push({
        name: stage.name,
        status: "not_run",
        artifacts: [
          path.relative(REPO_ROOT, stageArtifactPath(stage, artifactDirectory)),
          path.relative(
            REPO_ROOT,
            path.join(artifactDirectory, `${stage.name}.log`)
          ),
        ].filter((value, index, values) => values.indexOf(value) === index),
      });
    }
    manifest.finishedAt = new Date().toISOString();
    await writeJson(path.join(artifactDirectory, "promotion.json"), manifest);
    console.log(
      JSON.stringify({
        status: manifest.status,
        revision: manifest.revision,
        stages: manifest.stages,
        artifacts: manifest.artifacts,
      })
    );
  }
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
