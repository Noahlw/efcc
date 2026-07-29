/**
 * EFCC acceptance-plan appender (ADR-0012 §Decision-4).
 *
 * Reads the JSON reporter artifact written by Playwright at
 * `test-results/e2e-results.json` and appends (or replaces) a
 * `## Executed results` section in the configured acceptance plan
 * markdown doc with a per-assertion pass/fail table.
 *
 * Wired as an npm `posttest:e2e` script (see package.json) so:
 *   - no `globalTeardown` field needs to be added to
 *     `tests/e2e/playwright.config.ts` (that file's baseline was
 *     locked in Wave 1 and we keep it touch-free);
 *   - the appender runs as a plain tsx script with no Playwright
 *     test-runner coupling, which makes it independently debuggable
 *     (`npx tsx tests/e2e/plan-doc-appender.ts --plan=…`).
 *
 * Output target and JSON input are CLI-configurable so future tickets
 * can reuse the same utility against their own plan docs without code
 * changes here.
 *
 * Match the import style of sibling `auth.ts` (node: protocol, no
 * `@types/node` dependency in this repo's baseline).
 */
import { readFile, writeFile } from "node:fs/promises";
import { argv, env } from "node:process";

/** Default target per ADR-0012 §Decision-4 and the current ticket. */
const DEFAULT_PLAN_DOC = "docs/specs/067-role-nav-acceptance-plan.md";
const DEFAULT_RESULTS_JSON = "test-results/e2e-results.json";
const SECTION_HEADER = "## Executed results";

interface JsonReporterSpec {
  title?: string;
  suites?: JsonReporterSpec[];
  tests?: {
    projectName?: string;
    title?: string;
    results?: {
      status?: string;
      errors?: { message?: string }[];
    }[];
  }[];
}

interface JsonReporterRoot {
  config?: { projects?: { name?: string }[] };
  suites?: JsonReporterSpec[];
}

interface FlatRow {
  role: string;
  assertion: string;
  pass: boolean;
  detail?: string;
}

function die(message: string, code = 1): never {
  process.stderr.write(`error: ${message}\n`);
  process.exit(code);
}

function parseArgs(): {
  planDoc: string;
  resultsJson: string;
  targetUrl: string | undefined;
} {
  const args = argv.slice(2);
  let planDoc = DEFAULT_PLAN_DOC;
  let resultsJson = DEFAULT_RESULTS_JSON;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--plan" && i + 1 < args.length) {
      i += 1;
      planDoc = args[i];
    } else if (a === "--results" && i + 1 < args.length) {
      i += 1;
      resultsJson = args[i];
    } else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "usage: tsx tests/e2e/plan-doc-appender.ts " +
          "[--plan <plan.md>] [--results <e2e-results.json>]\n"
      );
      process.exit(0);
    } else {
      die(`unrecognized argument: ${a}`);
    }
  }
  return { planDoc, resultsJson, targetUrl: env.E2E_TARGET_URL };
}

/**
 * Walk the nested Playwright JSON reporter structure and flatten to
 * (role, assertion, pass) rows. The reporter emits `suites` as a tree;
 * leaf specs carry `tests` whose `results[].status` is one of
 * `passed` | `failed` | `timedOut` | `skipped` | `interrupted`. We
 * treat anything other than `passed` as a fail with the first error
 * message captured into `detail`.
 */
function flattenResults(root: JsonReporterRoot): FlatRow[] {
  const rows: FlatRow[] = [];
  const walkSpec = (spec: JsonReporterSpec): void => {
    for (const t of spec.tests ?? []) {
      const role = t.projectName ?? "<unknown>";
      const assertion = t.title ?? spec.title ?? "<untitled>";
      const results = t.results ?? [];
      const last = results.at(-1);
      const status = last?.status ?? "unknown";
      const pass = status === "passed";
      const detail = pass ? undefined : (last?.errors?.[0]?.message ?? status);
      rows.push({ role, assertion, pass, detail });
    }
  };
  const walkSuite = (suite: JsonReporterSpec): void => {
    walkSpec(suite);
    for (const child of suite.suites ?? []) {
      walkSuite(child);
    }
  };
  for (const top of root.suites ?? []) {
    walkSuite(top);
  }
  return rows;
}

function renderSection(
  rows: FlatRow[],
  targetUrl: string | undefined,
  timestamp: string
): string {
  const total = rows.length;
  const passed = rows.filter((r) => r.pass).length;
  const failed = total - passed;
  const header = [
    SECTION_HEADER,
    "",
    `- Generated: ${timestamp}`,
    targetUrl ? `- Target: ${targetUrl}` : "- Target: <not recorded>",
    `- Total assertions: ${total} | Passed: ${passed} | Failed: ${failed}`,
    "",
  ];
  if (total === 0) {
    return [
      ...header,
      "_No test rows were found in the JSON reporter artifact._",
      "",
    ].join("\n");
  }
  const tableHeader = [
    "| Role | Assertion | Result | Detail |",
    "|------|-----------|--------|--------|",
  ];
  const tableRows = rows.map((r) => {
    const result = r.pass ? "PASS" : "FAIL";
    const detail = (r.detail ?? "")
      .replaceAll("|", "\\|")
      .replaceAll("\n", " ");
    return `| ${r.role} | ${r.assertion} | ${result} | ${detail} |`;
  });
  return [...header, ...tableHeader, ...tableRows, ""].join("\n");
}

/** Replace an existing `## Executed results` block, or append a new one. */
function upsertSection(doc: string, section: string): string {
  const lines = doc.split(/\r?\n/u);
  const startIdx = lines.findIndex((l) => l.trim() === SECTION_HEADER);
  if (startIdx === -1) {
    const sep = doc.endsWith("\n") || doc.length === 0 ? "" : "\n";
    return `${doc}${sep}\n${section}\n`;
  }
  // The next same-or-higher-level heading terminates this section.
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    if (/^#{1,2}\s/u.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  const before = lines.slice(0, startIdx).join("\n").replace(/\s+$/u, "");
  const after = lines.slice(endIdx).join("\n");
  const leadingAfter = after.startsWith("\n") ? after : `\n${after}`;
  return `${before}\n\n${section}${leadingAfter}`;
}

async function main(): Promise<void> {
  const { planDoc, resultsJson, targetUrl } = parseArgs();
  const timestamp = new Date().toISOString();

  let rawResults: string;
  try {
    rawResults = await readFile(resultsJson, "utf-8");
  } catch (error) {
    die(
      `failed to read JSON reporter artifact at ${resultsJson}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  let parsed: JsonReporterRoot;
  try {
    parsed = JSON.parse(rawResults) as JsonReporterRoot;
  } catch (error) {
    die(
      `failed to parse ${resultsJson} as JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const rows = flattenResults(parsed);
  const section = renderSection(rows, targetUrl, timestamp);

  let doc: string;
  try {
    doc = await readFile(planDoc, "utf-8");
  } catch (error) {
    die(
      `failed to read plan doc at ${planDoc}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const updated = upsertSection(doc, section);
  if (updated === doc) {
    process.stderr.write(
      `warn: ${planDoc} unchanged (append produced identical content)\n`
    );
    return;
  }
  try {
    await writeFile(planDoc, updated, "utf-8");
  } catch (error) {
    die(
      `failed to write ${planDoc}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  process.stdout.write(
    `appended ${rows.length} assertion row(s) to ${planDoc}\n`
  );
}

main();
