import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(import.meta.dirname, "..");

interface PromotionStage {
  name: string;
  args: readonly string[];
  report?: string;
  expectedTests?: number;
}

interface PromotionStageResult {
  name: string;
  status: "running" | "passed" | "failed" | "not_run";
  artifacts: string[];
  failure?: string;
}

export const PROMOTION_STAGES: readonly PromotionStage[] = [
  { name: "worker-contract", args: ["test:programs:contract"] },
  {
    name: "browser-acceptance",
    args: ["test:programs:browser"],
    report: "browser-results.json",
    expectedTests: 48,
  },
  {
    name: "home-browser-acceptance",
    args: ["test:programs:home"],
    report: "home-results.json",
    expectedTests: 5,
  },
  {
    name: "responsive-matrix",
    args: ["test:programs:responsive"],
    report: "responsive-results.json",
    expectedTests: 21,
  },
];

// Case numbers 64–68 are the five PUI-05 Home rows in the 2026-09-23 parity CSV.
export const PUI05_HOME_ACCEPTANCE_MAPPINGS = [
  {
    oldId: "PUI-05:64",
    oldTitle: "Home long Explore copy wraps without horizontal overflow",
    replacementTest:
      "PUI-05 case 64: Home cards and announcement detail keep long copy inside the viewport",
    replacementFile: "tests/e2e/programs-home-acceptance.test.ts",
  },
  {
    oldId: "PUI-05:65",
    oldTitle: "Home announcement Back consumes only the overlay history entry",
    replacementTest:
      "PUI-05 case 65: native Back closes only the announcement overlay and restores the previous route",
    replacementFile: "tests/e2e/programs-home-acceptance.test.ts",
  },
  {
    oldId: "PUI-05:66",
    oldTitle:
      "Notices and Messages keep long feed copy inside the W7 viewport seams",
    replacementTest:
      "PUI-05 case 66: Notices and Messages keep seeded long copy inside the viewport",
    replacementFile: "tests/e2e/programs-home-acceptance.test.ts",
  },
  {
    oldId: "PUI-05:67",
    oldTitle:
      "Home next-event card opens event detail with 可簽到 and back-nav",
    replacementTest:
      "PUI-05 case 67: Home next-event opens the selected Event Detail with 可簽到 and returns Home",
    replacementFile: "tests/e2e/programs-home-acceptance.test.ts",
  },
  {
    oldId: "PUI-05:68",
    oldTitle: "Home Explore opens Program Detail and returns Home",
    replacementTest:
      "PUI-05 case 68: Home Explore opens the selected Program Detail and returns Home",
    replacementFile: "tests/e2e/programs-home-acceptance.test.ts",
  },
] as const;

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

interface MigrationLedgerSummary {
  participantRows: number;
  managementRows: number;
  executableMappings: string[];
}

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
      !/(?<stage>Worker Contract|Browser Acceptance|Responsive UI Matrix)/u.test(
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

export function assertHomeParityMappings(value: unknown): void {
  if (!Array.isArray(value)) {
    throw new TypeError(
      "Promotion manifest is missing the PUI-05 Home mappings"
    );
  }
  if (value.length !== PUI05_HOME_ACCEPTANCE_MAPPINGS.length) {
    throw new Error(
      `PUI-05 Home mapping count mismatch: got=${value.length}, expected=${PUI05_HOME_ACCEPTANCE_MAPPINGS.length}`
    );
  }

  const expectedById = new Map<
    string,
    (typeof PUI05_HOME_ACCEPTANCE_MAPPINGS)[number]
  >(PUI05_HOME_ACCEPTANCE_MAPPINGS.map((mapping) => [mapping.oldId, mapping]));
  const seenIds = new Set<string>();
  const seenTests = new Set<string>();
  for (const item of value) {
    const mapping = asRecord(item);
    if (mapping === null) {
      throw new TypeError("PUI-05 Home mappings must be objects");
    }
    const { oldId, oldTitle, replacementTest, replacementFile } = mapping;
    if (
      typeof oldId !== "string" ||
      typeof oldTitle !== "string" ||
      typeof replacementTest !== "string" ||
      typeof replacementFile !== "string"
    ) {
      throw new TypeError(
        "PUI-05 Home mappings must name an old ID, test, and file"
      );
    }
    if (
      Object.keys(mapping).sort().join(",") !==
      "oldId,oldTitle,replacementFile,replacementTest"
    ) {
      throw new Error(`PUI-05 Home mapping ${oldId} has unrecognized fields`);
    }
    if (!expectedById.has(oldId)) {
      throw new Error(
        `PUI-05 Home mapping contains unrecognized old ID ${oldId}`
      );
    }
    if (seenIds.has(oldId)) {
      throw new Error(`PUI-05 Home mapping duplicates old ID ${oldId}`);
    }
    if (seenTests.has(replacementTest)) {
      throw new Error(
        `PUI-05 Home mapping duplicates replacement test ${replacementTest}`
      );
    }
    seenIds.add(oldId);
    seenTests.add(replacementTest);
    const expected = expectedById.get(oldId);
    if (!expected) {
      throw new Error(
        `PUI-05 Home mapping contains unrecognized old ID ${oldId}`
      );
    }
    if (
      replacementTest !== expected.replacementTest ||
      oldTitle !== expected.oldTitle ||
      replacementFile !== expected.replacementFile
    ) {
      throw new Error(
        `PUI-05 Home mapping ${oldId} does not match its approved replacement`
      );
    }
  }

  const missing = PUI05_HOME_ACCEPTANCE_MAPPINGS.find(
    ({ oldId }) => !seenIds.has(oldId)
  );
  if (missing) {
    throw new Error(`PUI-05 Home mapping is missing old ID ${missing.oldId}`);
  }
}

function playwrightSpecs(report: unknown): { title: string; file: string }[] {
  const root = asRecord(report);
  const found: { title: string; file: string }[] = [];
  const visit = (suiteValue: unknown, inheritedFile = ""): void => {
    const suite = asRecord(suiteValue);
    if (!suite) {
      return;
    }
    const file = typeof suite.file === "string" ? suite.file : inheritedFile;
    if (Array.isArray(suite.specs)) {
      for (const specValue of suite.specs) {
        const spec = asRecord(specValue);
        if (typeof spec?.title === "string") {
          found.push({
            title: spec.title,
            file: typeof spec.file === "string" ? spec.file : file,
          });
        }
      }
    }
    if (Array.isArray(suite.suites)) {
      for (const child of suite.suites) {
        visit(child, file);
      }
    }
  };
  if (Array.isArray(root?.suites)) {
    for (const suite of root.suites) {
      visit(suite);
    }
  }
  return found;
}

function hasExactHomeParityMappings(value: unknown): boolean {
  try {
    assertHomeParityMappings(value);
    return true;
  } catch {
    return false;
  }
}

function hasB003Disclosure(manifest: JsonRecord | null): boolean {
  const riskDisclosure = asRecord(manifest?.riskDisclosure);
  const diagnostic = asRecord(asRecord(manifest?.diagnostic)?.runtimeCanary);
  return (
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
    (diagnostic.status === "not_run"
      ? diagnostic.artifact === null
      : typeof diagnostic.artifact === "string")
  );
}

function hasCompleteMigrationLedger(manifest: JsonRecord | null): boolean {
  const migrationLedger = asRecord(manifest?.migrationLedger);
  const executableMappings = Array.isArray(migrationLedger?.executableMappings)
    ? migrationLedger.executableMappings.filter(
        (mapping): mapping is string => typeof mapping === "string"
      )
    : [];
  return (
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
    ].every((mapping) => executableMappings.includes(mapping))
  );
}

function hasPassedStages(manifest: JsonRecord | null): boolean {
  const stageResults = Array.isArray(manifest?.stageResults)
    ? manifest.stageResults
        .map(asRecord)
        .filter((result): result is JsonRecord => result !== null)
    : [];
  return PROMOTION_STAGES.every(({ name }) =>
    stageResults.some(
      (result) => result.name === name && result.status === "passed"
    )
  );
}

export function isFunctionalPromotionManifest(value: unknown): boolean {
  const manifest = asRecord(value);
  return (
    manifest?.status === "functional-passed" &&
    hasExactHomeParityMappings(manifest?.homeParityMappings) &&
    hasB003Disclosure(manifest) &&
    hasCompleteMigrationLedger(manifest) &&
    hasPassedStages(manifest)
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

export function assertHomeAcceptanceReportMatchesMappings(
  report: unknown
): void {
  assertPlaywrightReportGreen(report, PUI05_HOME_ACCEPTANCE_MAPPINGS.length);
  const specs = playwrightSpecs(report);
  if (specs.length !== PUI05_HOME_ACCEPTANCE_MAPPINGS.length) {
    throw new Error(
      `PUI-05 Home report test count mismatch: got=${specs.length}, expected=${PUI05_HOME_ACCEPTANCE_MAPPINGS.length}`
    );
  }
  const reportConfig = asRecord(asRecord(report)?.config);
  const rootDir = reportConfig?.rootDir;
  if (typeof rootDir !== "string") {
    throw new Error("PUI-05 Home report is missing Playwright rootDir");
  }
  const reportRootDir = path.resolve(rootDir);
  const repositoryRelativeRoot = path
    .relative(REPO_ROOT, reportRootDir)
    .split(path.sep)
    .join("/");
  if (repositoryRelativeRoot !== "tests/e2e") {
    throw new Error(`PUI-05 Home report has unexpected rootDir ${rootDir}`);
  }
  const expectedTests = new Map<string, string>(
    PUI05_HOME_ACCEPTANCE_MAPPINGS.map((mapping) => [
      mapping.replacementTest,
      mapping.replacementFile,
    ])
  );
  const seen = new Set<string>();
  for (const spec of specs) {
    const expectedFile = expectedTests.get(spec.title);
    if (expectedFile === undefined) {
      throw new Error(
        `PUI-05 Home report contains unrecognized test ${spec.title}`
      );
    }
    if (seen.has(spec.title)) {
      throw new Error(`PUI-05 Home report duplicates test ${spec.title}`);
    }
    seen.add(spec.title);
    const reportedFile = path.resolve(
      reportRootDir,
      spec.file.replaceAll("\\", "/")
    );
    const pathFromRoot = path.relative(reportRootDir, reportedFile);
    if (
      pathFromRoot === ".." ||
      pathFromRoot.startsWith(`..${path.sep}`) ||
      path.isAbsolute(pathFromRoot)
    ) {
      throw new Error(
        `PUI-05 Home report test ${spec.title} escapes Playwright rootDir`
      );
    }
    const normalizedFile = path
      .relative(REPO_ROOT, reportedFile)
      .split(path.sep)
      .join("/");
    if (normalizedFile !== expectedFile) {
      throw new Error(
        `PUI-05 Home report test ${spec.title} came from ${spec.file}`
      );
    }
  }
  const missing = PUI05_HOME_ACCEPTANCE_MAPPINGS.find(
    ({ replacementTest }) => !seen.has(replacementTest)
  );
  if (missing) {
    throw new Error(
      `PUI-05 Home report is missing replacement test ${missing.replacementTest}`
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

export function isHomeAcceptanceRunGreen(
  value: unknown,
  expectedRevision: string,
  expectedReportPath: string,
  expectedPromotionRunId: string
): boolean {
  const manifest = asRecord(value);
  if (
    manifest?.status !== "passed" ||
    manifest.runtime !== "createTestHarness" ||
    manifest.config !== "web/wrangler.jsonc" ||
    manifest.suite !== "tests/e2e/programs-home-acceptance.config.ts" ||
    manifest.revision !== expectedRevision ||
    manifest.layer !== "home-browser-acceptance" ||
    manifest.retries !== 0 ||
    manifest.reportPath !== expectedReportPath ||
    manifest.promotionRunId !== expectedPromotionRunId ||
    typeof manifest.target !== "string"
  ) {
    return false;
  }
  try {
    assertLocalPromotionTarget(manifest.target);
  } catch {
    return false;
  }
  return true;
}

function runId(): string {
  return new Date()
    .toISOString()
    .replaceAll(/[^0-9a-z]/giu, "")
    .toLowerCase();
}

async function writeJson(filename: string, value: unknown): Promise<void> {
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

async function currentRevision(): Promise<string> {
  const result = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: REPO_ROOT,
  });
  return result.stdout.trim();
}

async function readReport(filename: string): Promise<unknown> {
  return JSON.parse(await readFile(filename, "utf-8"));
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

function hasCanaryIdentity(
  manifest: JsonRecord | null,
  expectedRevision: string
): boolean {
  return (
    manifest?.status === "passed" &&
    manifest.revision === expectedRevision &&
    manifest.runtime === "createTestHarness" &&
    manifest.config === "web/wrangler.jsonc" &&
    manifest.windowMs === EXPECTED_CANARY_WINDOW_MS &&
    manifest.retries === EXPECTED_CANARY_RETRIES
  );
}

function hasCanaryWindow(manifest: JsonRecord | null): boolean {
  const setupStartedAt = timestamp(manifest?.setupStartedAt);
  const startedAt = timestamp(manifest?.startedAt);
  const finishedAt = timestamp(manifest?.finishedAt);
  return (
    setupStartedAt !== null &&
    startedAt !== null &&
    finishedAt !== null &&
    setupStartedAt <= startedAt &&
    finishedAt - startedAt >= EXPECTED_CANARY_WINDOW_MS
  );
}

function hasNoCanaryFailures(manifest: JsonRecord | null): boolean {
  return Array.isArray(manifest?.failures) && manifest.failures.length === 0;
}

function hasCompletedCanaryScenario(manifest: JsonRecord | null): boolean {
  const scenariosCompleted = manifest?.scenariosCompleted;
  return (
    typeof scenariosCompleted === "number" &&
    Number.isInteger(scenariosCompleted) &&
    scenariosCompleted > 0
  );
}

export function isCanaryArtifactGreen(
  manifest: JsonRecord | null,
  expectedRevision: string
): boolean {
  return (
    hasCanaryIdentity(manifest, expectedRevision) &&
    hasCanaryWindow(manifest) &&
    hasNoCanaryFailures(manifest) &&
    hasCompletedCanaryScenario(manifest)
  );
}

async function readCanaryRun(filename: string): Promise<JsonRecord | null> {
  try {
    return asRecord(JSON.parse(await readFile(filename, "utf-8")));
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
  if (stage.name === "home-browser-acceptance") {
    environment.PROGRAMS_HOME_RESULTS_FILE = path.join(
      artifactDirectory,
      stage.report ?? "home-results.json"
    );
    environment.PROGRAMS_HOME_ARTIFACT_DIRECTORY = path.join(
      artifactDirectory,
      "home-browser-acceptance"
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
    await writeFile(stageLog, `${result.stdout}${result.stderr}`, "utf-8");
  } catch (error) {
    await writeFile(stageLog, commandOutput(error), "utf-8");
    throw new Error(
      `T05.7 ${stage.name} failed; see ${path.relative(REPO_ROOT, path.join(artifactDirectory, `${stage.name}.log`))}`,
      { cause: error }
    );
  }
  if (stage.report && stage.expectedTests !== undefined) {
    const reportPath = path.join(artifactDirectory, stage.report);
    try {
      const report = await readReport(reportPath);
      assertPlaywrightReportGreen(report, stage.expectedTests);
      if (stage.name === "home-browser-acceptance") {
        assertHomeAcceptanceReportMatchesMappings(report);
        const runManifestPath = path.join(
          artifactDirectory,
          "home-browser-acceptance",
          "run.json"
        );
        if (
          !isHomeAcceptanceRunGreen(
            await readReport(runManifestPath),
            await currentRevision(),
            path.relative(REPO_ROOT, reportPath),
            path.basename(artifactDirectory)
          )
        ) {
          throw new Error(
            `Home acceptance run manifest is missing or not pinned to ${path.basename(artifactDirectory)}`
          );
        }
      }
    } catch (error) {
      throw new Error(
        `T05.7 ${stage.name} report failed Green validation: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
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
      [
        stageArtifact,
        stageLog,
        ...(stage.name === "home-browser-acceptance"
          ? [
              path.join(
                artifactDirectory,
                "home-browser-acceptance",
                "run.json"
              ),
            ]
          : []),
      ].map((filename) => path.relative(REPO_ROOT, filename))
    ),
  ];
}

interface PromotionManifest {
  stageResults: PromotionStageResult[];
  stages: string[];
}

async function runPromotionStage(
  stage: PromotionStage,
  artifactDirectory: string,
  promotionTarget: URL,
  manifest: Pick<PromotionManifest, "stageResults" | "stages">
): Promise<void> {
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
    await writeJson(path.join(artifactDirectory, "promotion.json"), manifest);
  }
}

async function runPromotionStages(
  artifactDirectory: string,
  promotionTarget: URL,
  manifest: Pick<PromotionManifest, "stageResults" | "stages">
): Promise<void> {
  async function runAt(index: number): Promise<void> {
    const stage = PROMOTION_STAGES[index];
    if (stage === undefined) {
      return;
    }
    await runPromotionStage(
      stage,
      artifactDirectory,
      promotionTarget,
      manifest
    );
    await runAt(index + 1);
  }

  await runAt(0);
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
  const manifest: PromotionManifest & {
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
    homeParityMappings: typeof PUI05_HOME_ACCEPTANCE_MAPPINGS;
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
    homeParityMappings: PUI05_HOME_ACCEPTANCE_MAPPINGS,
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
        "utf-8"
      ),
      await readFile(
        path.join(
          REPO_ROOT,
          "docs/implementation/t05-management-migration-ledger.md"
        ),
        "utf-8"
      )
    );
    manifest.diagnostic.runtimeCanary = await readCanaryDiagnostic(revision);
    await writeJson(path.join(artifactDirectory, "promotion.json"), manifest);
    await runPromotionStages(artifactDirectory, promotionTarget, manifest);
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
  path.resolve(process.argv[1]) === import.meta.filename
) {
  await main();
}
