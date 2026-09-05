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

export const RUNTIME_CANARY_STAGE: PromotionStage = {
  name: "runtime-canary",
  args: ["test:programs:canary"],
};

export const B003_RESIDUAL_RISK = {
  id: "B-003",
  status: "open",
  disposition: "accepted-rescue-development-risk",
  scope: "rescue-development only",
  ownerApprovalReference:
    "https://github.com/Noahlw/efcc/issues/505#issuecomment-5550498028",
  diagnosticCommand: "pnpm test:programs:canary",
  summary:
    "The unchanged five-minute sustained-runtime canary remains unresolved diagnostic evidence; this is not a runtime-fix or production-release approval.",
} as const;

const MANIFEST_STAGES: readonly PromotionStage[] = [
  ...PROMOTION_STAGES,
  RUNTIME_CANARY_STAGE,
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

type MigrationLedgerSummary = {
  participantRows: number;
  managementRows: number;
  executableMappings: string[];
};

function ledgerRows(source: string, label: string): string[][] {
  const scenarioStart = source.indexOf("## Scenario inventory");
  const scenarioSource =
    scenarioStart === -1
      ? ""
      : source.slice(scenarioStart + "## Scenario inventory".length);
  const nextSection = scenarioSource.search(/\n##\s/u);
  const scenarioSection =
    nextSection === -1 ? scenarioSource : scenarioSource.slice(0, nextSection);
  const rows = scenarioSection
    .split(/\r?\n/u)
    .filter(
      (line) => line.trim().startsWith("|") && !/^\|\s*-{3,}/u.test(line.trim())
    )
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim())
    );

  if (rows.length < 2) {
    throw new Error(`T05.7 ${label} migration ledger has no scenario rows`);
  }

  const dataRows = rows.slice(1);
  for (const [index, row] of dataRows.entries()) {
    if (
      row.length < 4 ||
      row.slice(0, 4).some((cell) => cell.length === 0) ||
      !/(Worker Contract|Browser Acceptance|Responsive UI Matrix)/u.test(
        row[2] ?? ""
      )
    ) {
      throw new Error(
        `T05.7 ${label} migration ledger row ${index + 1} is incomplete`
      );
    }
  }

  return dataRows;
}

function assertLedgerMappings(
  source: string,
  label: string,
  mappings: readonly string[]
): number {
  const rows = ledgerRows(source, label);
  for (const mapping of mappings) {
    if (!source.includes(mapping)) {
      throw new Error(
        `T05.7 ${label} migration ledger is missing executable mapping ${mapping}`
      );
    }
  }
  return rows.length;
}

export function assertMigrationLedgersComplete(
  participantSource: string,
  managementSource: string
): MigrationLedgerSummary {
  const participantRows = assertLedgerMappings(
    participantSource,
    "participant",
    [
      "web/lib/programs/programs-contract.test.ts",
      "tests/e2e/programs-participant-acceptance.test.ts",
      "tests/e2e/programs-responsive-matrix.test.ts",
    ]
  );
  const managementRows = assertLedgerMappings(managementSource, "management", [
    "web/lib/programs/programs-contract.test.ts",
    "tests/e2e/programs-management-acceptance.test.ts",
    "tests/e2e/programs-responsive-matrix.test.ts",
  ]);

  return {
    participantRows,
    managementRows,
    executableMappings: [
      "web/lib/programs/programs-contract.test.ts",
      "tests/e2e/programs-participant-acceptance.test.ts",
      "tests/e2e/programs-management-acceptance.test.ts",
      "tests/e2e/programs-responsive-matrix.test.ts",
    ],
  };
}

export function isFunctionalPromotionManifest(value: unknown): boolean {
  const manifest = asRecord(value);
  const riskDisclosure = asRecord(manifest?.riskDisclosure);
  const diagnostic = asRecord(asRecord(manifest?.diagnostic)?.runtimeCanary);
  const migrationLedger = asRecord(manifest?.migrationLedger);
  const executableMappings = Array.isArray(migrationLedger?.executableMappings)
    ? migrationLedger.executableMappings.filter(
        (mapping): mapping is string => typeof mapping === "string"
      )
    : [];
  const stageResults = Array.isArray(manifest?.stageResults)
    ? manifest.stageResults
        .map(asRecord)
        .filter((result): result is JsonRecord => result !== null)
    : [];

  return (
    manifest?.status === "functional-passed" &&
    riskDisclosure?.id === B003_RESIDUAL_RISK.id &&
    riskDisclosure.status === B003_RESIDUAL_RISK.status &&
    riskDisclosure.disposition === B003_RESIDUAL_RISK.disposition &&
    riskDisclosure.scope === B003_RESIDUAL_RISK.scope &&
    riskDisclosure.ownerApprovalReference ===
      B003_RESIDUAL_RISK.ownerApprovalReference &&
    riskDisclosure.diagnosticCommand === B003_RESIDUAL_RISK.diagnosticCommand &&
    diagnostic?.command === B003_RESIDUAL_RISK.diagnosticCommand &&
    ["passed", "failed", "not_run"].includes(String(diagnostic?.status)) &&
    typeof diagnostic?.revision === "string" &&
    (diagnostic?.status === "not_run"
      ? diagnostic.artifact === null
      : typeof diagnostic.artifact === "string") &&
    typeof migrationLedger?.participantRows === "number" &&
    Number.isInteger(migrationLedger.participantRows) &&
    migrationLedger.participantRows > 0 &&
    typeof migrationLedger?.managementRows === "number" &&
    Number.isInteger(migrationLedger.managementRows) &&
    migrationLedger.managementRows > 0 &&
    Array.isArray(migrationLedger?.executableMappings) &&
    [
      "web/lib/programs/programs-contract.test.ts",
      "tests/e2e/programs-participant-acceptance.test.ts",
      "tests/e2e/programs-management-acceptance.test.ts",
      "tests/e2e/programs-responsive-matrix.test.ts",
    ].every((mapping) => executableMappings.includes(mapping)) &&
    PROMOTION_STAGES.every(({ name }) =>
      stageResults.some(
        (result) => result.name === name && result.status === "passed"
      )
    )
  );
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

async function readCanaryDiagnostic(expectedRevision: string): Promise<{
  command: string;
  status: "passed" | "failed" | "not_run";
  revision: string;
  artifact: string | null;
}> {
  const filename = process.env.PROGRAMS_CANARY_RUN_FILE;
  if (filename === undefined) {
    return {
      command: B003_RESIDUAL_RISK.diagnosticCommand,
      status: "not_run",
      revision: expectedRevision,
      artifact: null,
    };
  }

  const resolvedFilename = path.resolve(REPO_ROOT, filename);
  const canary = await readCanaryRun(resolvedFilename);
  const status = canary?.status;
  const revision = canary?.revision;
  if (
    (status !== "passed" && status !== "failed" && status !== "not_run") ||
    typeof revision !== "string"
  ) {
    throw new Error(
      `T05.7 referenced canary diagnostic is invalid or missing revision: ${filename}`
    );
  }

  return {
    command: B003_RESIDUAL_RISK.diagnosticCommand,
    status,
    revision,
    artifact: path.relative(REPO_ROOT, resolvedFilename),
  };
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
    riskDisclosure: typeof B003_RESIDUAL_RISK;
    diagnostic: {
      runtimeCanary: {
        command: string;
        status: "passed" | "failed" | "not_run";
        revision: string;
        artifact: string | null;
      };
    };
    migrationLedger: MigrationLedgerSummary;
    failure?: string;
    artifacts: string;
  } = {
    schemaVersion: 1,
    authority:
      "T05.7 layered Programs finite promotion gate; sustained runtime canary is independent diagnostic evidence",
    runId: path.basename(artifactDirectory),
    revision,
    status: "running",
    startedAt: new Date().toISOString(),
    stages: [],
    stageResults: [],
    riskDisclosure: B003_RESIDUAL_RISK,
    diagnostic: {
      runtimeCanary: {
        command: B003_RESIDUAL_RISK.diagnosticCommand,
        status: "not_run",
        revision,
        artifact: null,
      },
    },
    migrationLedger: {
      participantRows: 0,
      managementRows: 0,
      executableMappings: [],
    },
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
    manifest.migrationLedger = assertMigrationLedgersComplete(
      await readFile(
        path.join(
          REPO_ROOT,
          "docs/implementation/t05-participant-migration-ledger.md"
        ),
        "utf8"
      ),
      await readFile(
        path.join(
          REPO_ROOT,
          "docs/implementation/t05-management-migration-ledger.md"
        ),
        "utf8"
      )
    );
    manifest.diagnostic.runtimeCanary = await readCanaryDiagnostic(revision);
    await writeJson(path.join(artifactDirectory, "promotion.json"), manifest);
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
    manifest.status = "functional-passed";
    if (!isFunctionalPromotionManifest(manifest)) {
      throw new Error(
        "T05.7 functional promotion is missing required finite-stage or B-003 risk evidence"
      );
    }
  } catch (error) {
    manifest.status = "failed";
    manifest.failure = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
    process.stderr.write(`${manifest.failure}\n`);
  } finally {
    const recordedStages = new Set(
      manifest.stageResults.map(({ name }) => name)
    );
    for (const stage of MANIFEST_STAGES) {
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
