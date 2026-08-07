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
 * Output target, JSON input, the markdown section heading, and the
 * recorded target URL are CLI-configurable so future tickets can reuse the
 * same utility against their own plan docs / evidence sections without
 * code changes here. `--heading` lets two acceptance runs (for example the
 * legacy `/exec` gate and the rebuilt Next UI gate) append their results to
 * the same plan doc under distinct headings so one run cannot overwrite the
 * other's evidence; `--target-url` records the deployment under test.
 *
 * Defaults preserve the Wave-1 behavior: `--plan` and `--results` alone
 * append a `## Executed results` section and read the target URL from the
 * `E2E_TARGET_URL` environment variable.
 *
 * Match the import style of sibling `auth.ts` (node: protocol, no
 * `@types/node` dependency in this repo's baseline).
 */
import { readFile, writeFile } from "node:fs/promises";
import { argv, env } from "node:process";

/** Defaults per ADR-0012 §Decision-4 and the current ticket. */
const DEFAULT_PLAN_DOC = "docs/specs/067-role-nav-acceptance-plan.md";
const DEFAULT_RESULTS_JSON = "test-results/e2e-results.json";
const DEFAULT_SECTION_HEADER = "## Executed results";

interface JsonReporterSpec {
  title?: string;
  specs?: JsonReporterSpec[];
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
  heading: string;
} {
  // Accept both `--name value` and `--name=value` spellings (the runbook
  // documents the equals form). Splitting on the first `=` normalizes every
  // `--x=y` token into two tokens so the exact-match logic below covers both.
  const args: string[] = [];
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--") && raw.includes("=")) {
      const eq = raw.indexOf("=");
      args.push(raw.slice(0, eq), raw.slice(eq + 1));
    } else {
      args.push(raw);
    }
  }
  let planDoc = DEFAULT_PLAN_DOC;
  let resultsJson = DEFAULT_RESULTS_JSON;
  let heading = DEFAULT_SECTION_HEADER;
  let targetUrl = env.E2E_TARGET_URL;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--plan" && i + 1 < args.length) {
      i += 1;
      planDoc = args[i];
    } else if (a === "--results" && i + 1 < args.length) {
      i += 1;
      resultsJson = args[i];
    } else if (a === "--heading" && i + 1 < args.length) {
      i += 1;
      heading = args[i];
    } else if (a === "--target-url" && i + 1 < args.length) {
      i += 1;
      targetUrl = args[i];
    } else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "usage: tsx tests/e2e/plan-doc-appender.ts " +
          "[--plan <plan.md>] [--results <e2e-results.json>] " +
          "[--heading <\"## Executed results\">] [--target-url <url>]\n"
      );
      process.exit(0);
    } else {
      die(`unrecognized argument: ${a}`);
    }
  }
  return { planDoc, resultsJson, targetUrl, heading };
}

/** Keep credentials and query-string tokens out of committed evidence. */
function sanitizeTargetUrl(targetUrl: string | undefined): string | undefined {
  if (!targetUrl) {
    return undefined;
  }
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    die(`target URL must be an absolute http(s) URL: ${targetUrl}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    die(`target URL must be an absolute http(s) URL: ${targetUrl}`);
  }
  if (parsed.username || parsed.password) {
    die("target URL must not contain userinfo credentials");
  }
  return `${parsed.origin}${parsed.pathname}`;
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
    for (const spec of suite.specs ?? []) {
      walkSpec(spec);
    }
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
  timestamp: string,
  heading: string
): string {
  const total = rows.length;
  const passed = rows.filter((r) => r.pass).length;
  const failed = total - passed;
  const header = [
    heading,
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

/**
 * The markdown heading level of `line` (1-6), or 0 when it is not a heading.
 */
function headingLevel(line: string): number {
  const m = /^(#{1,6})\s/u.exec(line.trim());
  return m ? m[1].length : 0;
}

/**
 * Replace an existing block headed by `heading`, or append a new one. The
 * block is terminated by the next heading of the same or higher level.
 */
function upsertSection(
  doc: string,
  section: string,
  heading: string
): string {
  const lines = doc.split(/\r?\n/u);
  const startIdx = lines.findIndex((l) => l.trim() === heading);
  if (startIdx === -1) {
    const sep = doc.endsWith("\n") || doc.length === 0 ? "" : "\n";
    return `${doc}${sep}\n${section}\n`;
  }
  const sectionLevel = headingLevel(heading);
  // The next same-or-higher-level heading terminates this section.
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const level = headingLevel(lines[i]);
    if (level > 0 && level <= sectionLevel) {
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
  const { planDoc, resultsJson, targetUrl: rawTargetUrl, heading } = parseArgs();
  const targetUrl = sanitizeTargetUrl(rawTargetUrl);
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
  const section = renderSection(rows, targetUrl, timestamp, heading);

  let doc: string;
  try {
    doc = await readFile(planDoc, "utf-8");
  } catch (error) {
    die(
      `failed to read plan doc at ${planDoc}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const updated = upsertSection(doc, section, heading);
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
