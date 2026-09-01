/**
 * EFCC Phase F numeric release evidence renderer.
 *
 * Reads Playwright JSON test report files from an input directory,
 * validates target URLs (loopback only) and attachments (strictly no images),
 * preserves test/project/viewport/status/skipReason and numeric JSON attachments,
 * and outputs deterministic JSON and accessible HTML evidence tables.
 *
 * Standard library only (no external runtime dependencies).
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export interface PlaywrightAttachment {
  name: string;
  contentType: string;
  path?: string;
  body?: string;
}

export interface PlaywrightTestResult {
  workerIndex?: number;
  status: "passed" | "failed" | "timedOut" | "skipped" | "interrupted" | string;
  duration?: number;
  errors?: { message?: string }[];
  attachments?: PlaywrightAttachment[];
}

export interface PlaywrightAnnotation {
  type: string;
  description?: string;
}

export interface PlaywrightTest {
  projectName?: string;
  status?: string;
  results?: PlaywrightTestResult[];
  annotations?: PlaywrightAnnotation[];
}

export interface PlaywrightSpec {
  title: string;
  ok?: boolean;
  tests?: PlaywrightTest[];
}

export interface PlaywrightSuite {
  title: string;
  file?: string;
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
}

export interface PlaywrightProjectConfig {
  name: string;
  use?: {
    baseURL?: string;
    viewport?: { width: number; height: number };
    [key: string]: unknown;
  };
}

export interface PlaywrightJsonReport {
  config?: {
    rootDir?: string;
    use?: { baseURL?: string };
    projects?: PlaywrightProjectConfig[];
  };
  suites?: PlaywrightSuite[];
  errors?: unknown[];
}

export interface TestEvidenceItem {
  suite: string;
  file: string;
  title: string;
  project: string;
  viewport?: { width: number; height: number };
  state: string;
  status: "passed" | "failed" | "timedOut" | "skipped" | "interrupted";
  skipReason?: string;
  duration: number;
  numericAttachments: Record<string, unknown>;
}

export interface AggregatedEvidence {
  schemaVersion: "1.0.0";
  generatedAt: string;
  total: number;
  passed: number;
  skipped: number;
  failed: number;
  suites: Record<
    string,
    {
      total: number;
      passed: number;
      skipped: number;
      failed: number;
    }
  >;
  items: TestEvidenceItem[];
}

const DEFAULT_DETERMINISTIC_TIMESTAMP = "2026-09-01T00:00:00.000Z";

/**
 * Validates that a given URL is a local loopback URL (http(s)://127.0.0.1:* or http(s)://localhost:*).
 * Rejects remote / external URLs.
 */
export function validateLoopbackUrl(urlStr: string | undefined): void {
  if (!urlStr) {
    return;
  }
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error(
      `Non-loopback target URL rejected (invalid URL): ${urlStr}`
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Non-loopback target URL rejected (invalid protocol): ${urlStr}`
    );
  }

  if (parsed.username || parsed.password) {
    throw new Error(
      `Non-loopback target URL rejected (credentials forbidden): ${urlStr}`
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(
      `Non-loopback target URL rejected: ${urlStr}. Only 127.0.0.1 and localhost loopback URLs are permitted.`
    );
  }
}

/**
 * Validates attachment metadata to ensure no screenshot/image attachments are present.
 */
export function validateAttachment(attachment: PlaywrightAttachment): void {
  if (/^image\//iu.test(attachment.contentType)) {
    throw new Error(
      `Image attachment rejected: ${attachment.name} (${attachment.contentType}). Only numeric JSON evidence is permitted.`
    );
  }
  if (
    attachment.path &&
    /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/iu.test(attachment.path)
  ) {
    throw new Error(
      `Image attachment path rejected: ${attachment.path}. Images are strictly prohibited in release evidence.`
    );
  }
  if (
    /^(screenshot|image|snapshot)/iu.test(attachment.name) &&
    attachment.contentType !== "application/json"
  ) {
    throw new Error(
      `Image attachment rejected by name: ${attachment.name}. Release evidence must be numeric JSON only.`
    );
  }
}

function resolveAttachmentPath(
  attachmentPath: string,
  sourcePath?: string
): string | null {
  if (existsSync(attachmentPath)) {
    return attachmentPath;
  }
  if (sourcePath) {
    const fromSource = path.resolve(path.dirname(sourcePath), attachmentPath);
    if (existsSync(fromSource)) {
      return fromSource;
    }
  }
  return null;
}

function parseJsonAttachmentBody(
  attachment: PlaywrightAttachment,
  sourcePath?: string
): unknown {
  if (attachment.body) {
    try {
      return JSON.parse(attachment.body);
    } catch {
      try {
        const decoded = Buffer.from(attachment.body, "base64").toString(
          "utf-8"
        );
        return JSON.parse(decoded);
      } catch {
        return attachment.body;
      }
    }
  }

  if (attachment.path) {
    const resolvedPath = resolveAttachmentPath(attachment.path, sourcePath);
    if (resolvedPath) {
      try {
        const content = readFileSync(resolvedPath, "utf-8");
        return JSON.parse(content);
      } catch {
        return null;
      }
    }
  }

  return null;
}

/**
 * Infer viewport dimensions from project name or project config.
 */
function inferViewport(
  projectName: string,
  projectConfigMap: Record<string, PlaywrightProjectConfig>
): { width: number; height: number } | undefined {
  const projectConfig = projectConfigMap[projectName];
  if (projectConfig?.use?.viewport) {
    return projectConfig.use.viewport;
  }

  const match = /(?:w|phone|tablet|desktop|mobile)-(\d+)(?:x(\d+))?/u.exec(
    projectName
  );
  if (match) {
    const width = Number.parseInt(match[1], 10);
    const height = match[2]
      ? Number.parseInt(match[2], 10)
      : width < 800
        ? 844
        : 900;
    return { width, height };
  }

  return undefined;
}

function resolveTestStatus(
  rawStatus: string | undefined
): TestEvidenceItem["status"] {
  if (rawStatus === "passed") {
    return "passed";
  }
  if (rawStatus === "skipped") {
    return "skipped";
  }
  if (rawStatus === "timedOut") {
    return "timedOut";
  }
  if (rawStatus === "interrupted") {
    return "interrupted";
  }
  return "failed";
}

function resolveSkipReason(
  status: TestEvidenceItem["status"],
  test: PlaywrightTest,
  lastResult: PlaywrightTestResult | undefined
): string | undefined {
  if (status !== "skipped") {
    return undefined;
  }
  const skipAnnotation = test.annotations?.find(
    (a) => a.type === "skip" || a.type === "fixme"
  );
  return (
    skipAnnotation?.description ||
    lastResult?.errors?.[0]?.message ||
    "Skipped by test configuration"
  );
}

function collectNumericAttachments(
  results: PlaywrightTestResult[],
  sourcePath?: string
): Record<string, unknown> {
  const attachments: Record<string, unknown> = {};
  for (const res of results) {
    for (const attachment of res.attachments ?? []) {
      validateAttachment(attachment);
      if (
        attachment.contentType === "application/json" ||
        attachment.name.endsWith(".json")
      ) {
        attachments[attachment.name] = parseJsonAttachmentBody(
          attachment,
          sourcePath
        );
      }
    }
  }
  return attachments;
}

function parseTestItem(
  spec: PlaywrightSpec,
  test: PlaywrightTest,
  suiteTitle: string,
  currentFile: string,
  projectConfigMap: Record<string, PlaywrightProjectConfig>,
  sourcePath?: string
): TestEvidenceItem {
  const projectName = test.projectName || "default";
  const viewport = inferViewport(projectName, projectConfigMap);
  const results = test.results ?? [];
  const lastResult = results.at(-1);
  const status = resolveTestStatus(lastResult?.status);
  const state = test.status || (status === "passed" ? "expected" : status);
  const skipReason = resolveSkipReason(status, test, lastResult);
  const duration = results.reduce((acc, r) => acc + (r.duration ?? 0), 0);
  const numericAttachments = collectNumericAttachments(results, sourcePath);

  return {
    suite: suiteTitle,
    file: currentFile,
    title: spec.title,
    project: projectName,
    viewport,
    state,
    status,
    skipReason,
    duration,
    numericAttachments,
  };
}

/**
 * Parses a Playwright JSON report object, validating target URLs and attachments,
 * and extracting structured test evidence items.
 */
export function parsePlaywrightJsonReport(
  reportInput: PlaywrightJsonReport | string,
  sourcePath?: string
): TestEvidenceItem[] {
  const report: PlaywrightJsonReport =
    typeof reportInput === "string" ? JSON.parse(reportInput) : reportInput;

  if (report.config?.use?.baseURL) {
    validateLoopbackUrl(report.config.use.baseURL);
  }

  const projectConfigMap: Record<string, PlaywrightProjectConfig> = {};
  if (report.config?.projects) {
    for (const proj of report.config.projects) {
      if (proj.name) {
        projectConfigMap[proj.name] = proj;
        if (proj.use?.baseURL) {
          validateLoopbackUrl(proj.use.baseURL);
        }
      }
    }
  }

  const items: TestEvidenceItem[] = [];

  const walkSuite = (
    suite: PlaywrightSuite,
    parentSuiteTitle = "",
    file = ""
  ): void => {
    const currentFile = suite.file || file || sourcePath || "";
    const suiteTitle = parentSuiteTitle
      ? `${parentSuiteTitle} > ${suite.title}`
      : suite.title || "";

    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        items.push(
          parseTestItem(
            spec,
            test,
            suiteTitle,
            currentFile,
            projectConfigMap,
            sourcePath
          )
        );
      }
    }

    for (const childSuite of suite.suites ?? []) {
      walkSuite(childSuite, suiteTitle, currentFile);
    }
  };

  for (const topSuite of report.suites ?? []) {
    walkSuite(topSuite, "", topSuite.file || "");
  }

  return items;
}

/**
 * Sorts evidence items deterministically.
 */
export function sortEvidenceItems(
  items: TestEvidenceItem[]
): TestEvidenceItem[] {
  return [...items].sort((a, b) => {
    const fileCmp = a.file.localeCompare(b.file);
    if (fileCmp !== 0) {
      return fileCmp;
    }
    const suiteCmp = a.suite.localeCompare(b.suite);
    if (suiteCmp !== 0) {
      return suiteCmp;
    }
    const titleCmp = a.title.localeCompare(b.title);
    if (titleCmp !== 0) {
      return titleCmp;
    }
    return a.project.localeCompare(b.project);
  });
}

/**
 * Aggregates structured test evidence items into an aggregated report.
 */
export function aggregateEvidence(
  items: TestEvidenceItem[],
  options?: { generatedAt?: string }
): AggregatedEvidence {
  const sorted = sortEvidenceItems(items);
  const suites: AggregatedEvidence["suites"] = {};

  let passed = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of sorted) {
    const suiteKey = item.file || item.suite || "default";
    if (!suites[suiteKey]) {
      suites[suiteKey] = { total: 0, passed: 0, skipped: 0, failed: 0 };
    }
    suites[suiteKey].total += 1;

    if (item.status === "passed") {
      passed += 1;
      suites[suiteKey].passed += 1;
    } else if (item.status === "skipped") {
      skipped += 1;
      suites[suiteKey].skipped += 1;
    } else {
      failed += 1;
      suites[suiteKey].failed += 1;
    }
  }

  return {
    schemaVersion: "1.0.0",
    generatedAt: options?.generatedAt ?? DEFAULT_DETERMINISTIC_TIMESTAMP,
    total: sorted.length,
    passed,
    skipped,
    failed,
    suites,
    items: sorted,
  };
}

/**
 * Emits deterministic JSON evidence.
 */
export function renderEvidenceJson(
  items: TestEvidenceItem[],
  options?: { generatedAt?: string }
): string {
  const aggregated = aggregateEvidence(items, options);
  return `${JSON.stringify(aggregated, null, 2)}\n`;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderItemRow(item: TestEvidenceItem, index: number): string {
  const statusClass =
    item.status === "passed"
      ? "status pass"
      : item.status === "skipped"
        ? "status skip"
        : "status fail";

  const statusText =
    item.status === "passed"
      ? "PASS"
      : item.status === "skipped"
        ? "SKIP"
        : "FAIL";

  const viewportText = item.viewport
    ? `${item.viewport.width} × ${item.viewport.height}`
    : "—";

  const attachmentKeys = Object.keys(item.numericAttachments);
  const attachmentsHtml =
    attachmentKeys.length > 0
      ? attachmentKeys
          .map((name) => {
            const val = item.numericAttachments[name];
            return `<details class="attachment-detail">
              <summary><span class="badge">JSON</span> <code>${escapeHtml(
                name
              )}</code></summary>
              <pre><code>${escapeHtml(JSON.stringify(val, null, 2))}</code></pre>
            </details>`;
          })
          .join("\n")
      : '<span class="text-muted">None</span>';

  const skipReasonHtml = item.skipReason
    ? `<div class="skip-reason"><span class="badge skip">Reason</span> ${escapeHtml(
        item.skipReason
      )}</div>`
    : "";

  return `<tr>
    <th scope="row" class="cell-index">${index + 1}</th>
    <td class="cell-file"><code>${escapeHtml(item.file || item.suite)}</code></td>
    <td class="cell-title">
      <strong>${escapeHtml(item.title)}</strong>
      ${skipReasonHtml}
    </td>
    <td class="cell-project"><code>${escapeHtml(item.project)}</code></td>
    <td class="cell-viewport">${escapeHtml(viewportText)}</td>
    <td class="cell-status"><span class="${statusClass}">${statusText}</span> <span class="badge">${escapeHtml(item.state)}</span></td>
    <td class="cell-evidence">${attachmentsHtml}</td>
  </tr>`;
}

/**
 * Emits accessible HTML tables summarizing evidence and numeric measurements.
 */
export function renderEvidenceHtml(
  items: TestEvidenceItem[],
  options?: { generatedAt?: string; title?: string }
): string {
  const aggregated = aggregateEvidence(items, options);
  const title = options?.title ?? "EFCC S4 Phase F Release Evidence";
  const rowsHtml = aggregated.items
    .map((item, index) => renderItemRow(item, index))
    .join("\n");

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --canvas: #f6f8fa;
      --surface: #ffffff;
      --ink: #1f2328;
      --muted: #656d76;
      --line: #d0d7de;
      --line-subtle: #eaeef2;
      --accent: #0969da;
      --success: #1a7f37;
      --success-surface: #dafbe1;
      --warning: #9a6700;
      --warning-surface: #fff8c5;
      --error: #cf222e;
      --error-surface: #ffebe9;
      --radius: 8px;
    }
    * { box-sizing: border-box; }
    html {
      color: var(--ink);
      background: var(--canvas);
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", Helvetica, Arial, sans-serif;
    }
    body {
      max-width: 1400px;
      margin: 0 auto;
      padding: 24px clamp(16px, 3vw, 40px) 64px;
    }
    header.hero {
      padding: 24px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--surface);
      margin-bottom: 24px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 1.75rem;
      letter-spacing: -0.02em;
    }
    .meta {
      color: var(--muted);
      font-size: 0.875rem;
      margin-bottom: 16px;
    }
    .stats {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .stat-card {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--surface);
      font-weight: 600;
    }
    .status {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 700;
    }
    .status.pass { background: var(--success-surface); color: var(--success); }
    .status.skip { background: var(--warning-surface); color: var(--warning); }
    .status.fail { background: var(--error-surface); color: var(--error); }
    .table-container {
      overflow-x: auto;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--surface);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    caption {
      text-align: left;
      padding: 16px;
      font-weight: 700;
      font-size: 1rem;
      border-bottom: 1px solid var(--line);
    }
    th, td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--line-subtle);
      vertical-align: top;
    }
    th {
      background: var(--canvas);
      color: var(--muted);
      font-weight: 600;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    tr:last-child td { border-bottom: 0; }
    code {
      padding: 2px 5px;
      border-radius: 4px;
      background: var(--canvas);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.85em;
    }
    pre {
      margin: 8px 0 0;
      padding: 8px;
      border-radius: 4px;
      background: var(--canvas);
      overflow-x: auto;
      max-height: 240px;
    }
    pre code {
      padding: 0;
      background: transparent;
    }
    details summary {
      cursor: pointer;
      font-weight: 600;
      color: var(--accent);
    }
    details summary:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    .badge {
      display: inline-block;
      padding: 1px 5px;
      font-size: 0.7rem;
      font-weight: 700;
      border-radius: 4px;
      background: var(--line);
      color: var(--ink);
    }
    .badge.skip {
      background: var(--warning-surface);
      color: var(--warning);
    }
    .skip-reason {
      margin-top: 6px;
      font-size: 0.85rem;
      color: var(--muted);
    }
    .text-muted { color: var(--muted); }
  </style>
</head>
<body>
  <header class="hero">
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">Generated: <code>${escapeHtml(
      aggregated.generatedAt
    )}</code> · Target constraint: <code>Loopback Only</code> · Evidence: <code>Numeric JSON Only</code></div>
    <div class="stats">
      <div class="stat-card">Total: <strong>${aggregated.total}</strong></div>
      <div class="stat-card" style="color: var(--success);">Passed: <strong>${
        aggregated.passed
      }</strong></div>
      <div class="stat-card" style="color: var(--warning);">Skipped: <strong>${
        aggregated.skipped
      }</strong></div>
      <div class="stat-card" style="color: var(--error);">Failed: <strong>${
        aggregated.failed
      }</strong></div>
    </div>
  </header>

  <main>
    <div class="table-container">
      <table>
        <caption>Playwright Automated Geometry &amp; Hardening Evidence Matrix</caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">File / Suite</th>
            <th scope="col">Test Spec</th>
            <th scope="col">Project</th>
            <th scope="col">Viewport (px)</th>
            <th scope="col">State / Status</th>
            <th scope="col">Numeric Evidence Attachments</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  </main>
</body>
</html>\n`;
}

/**
 * Finds all JSON files recursively inside a directory.
 */
async function findJsonFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findJsonFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

/**
 * Runs the full evidence rendering pipeline from input directory to output files.
 */
export async function runEvidenceRenderer(options: {
  inputDir: string;
  jsonOutput: string;
  htmlOutput: string;
  generatedAt?: string;
}): Promise<AggregatedEvidence> {
  const jsonFiles = await findJsonFiles(options.inputDir);
  const allItems: TestEvidenceItem[] = [];

  for (const file of jsonFiles) {
    const content = await readFile(file, "utf-8");
    const relativePath = path.relative(options.inputDir, file);
    const items = parsePlaywrightJsonReport(content, relativePath);
    allItems.push(...items);
  }

  const generatedAt = options.generatedAt ?? DEFAULT_DETERMINISTIC_TIMESTAMP;
  const aggregated = aggregateEvidence(allItems, { generatedAt });

  const jsonContent = renderEvidenceJson(allItems, { generatedAt });
  const htmlContent = renderEvidenceHtml(allItems, { generatedAt });

  await mkdir(path.dirname(options.jsonOutput), { recursive: true });
  await writeFile(options.jsonOutput, jsonContent, "utf-8");

  await mkdir(path.dirname(options.htmlOutput), { recursive: true });
  await writeFile(options.htmlOutput, htmlContent, "utf-8");

  return aggregated;
}

function parseCliArgs(argv: string[]): {
  inputDir: string;
  jsonOutput: string;
  htmlOutput: string;
} {
  const args: string[] = [];
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--") && raw.includes("=")) {
      const eq = raw.indexOf("=");
      args.push(raw.slice(0, eq), raw.slice(eq + 1));
    } else {
      args.push(raw);
    }
  }

  let inputDir = "";
  let jsonOutput = "";
  let htmlOutput = "";

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--input" && i + 1 < args.length) {
      i += 1;
      inputDir = args[i];
    } else if (a === "--json" && i + 1 < args.length) {
      i += 1;
      jsonOutput = args[i];
    } else if (a === "--html" && i + 1 < args.length) {
      i += 1;
      htmlOutput = args[i];
    } else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "usage: tsx tests/e2e/render-phase-f-evidence.ts --input <dir> --json <path> --html <path>\n"
      );
      process.exit(0);
    }
  }

  if (!inputDir || !jsonOutput || !htmlOutput) {
    process.stderr.write(
      "error: --input, --json, and --html are all required arguments.\n"
    );
    process.exit(1);
  }

  return { inputDir, jsonOutput, htmlOutput };
}

async function main(): Promise<void> {
  const isMain =
    process.argv[1] &&
    (import.meta.filename === path.resolve(process.argv[1]) ||
      process.argv[1].endsWith("render-phase-f-evidence.ts"));

  if (!isMain) {
    return;
  }

  const cli = parseCliArgs(process.argv);
  try {
    const result = await runEvidenceRenderer(cli);
    process.stdout.write(
      `Evidence rendered successfully: ${result.total} tests (${result.passed} passed, ${result.skipped} skipped, ${result.failed} failed).\n` +
        `JSON output: ${cli.jsonOutput}\n` +
        `HTML output: ${cli.htmlOutput}\n`
    );
  } catch (error) {
    process.stderr.write(
      `error rendering evidence: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  }
}

main();
