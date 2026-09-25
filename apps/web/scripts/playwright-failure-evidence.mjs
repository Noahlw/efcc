import { readFile } from "node:fs/promises";

function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : null;
}

function errorMessages(results) {
  return results
    .flatMap((result) => {
      const errors = Array.isArray(result.errors) ? result.errors : [];
      return errors
        .map((error) => record(error)?.message)
        .filter((message) => typeof message === "string");
    })
    .filter(Boolean);
}

export function collectPlaywrightFailureEvidence(
  report,
  viewportByProject = {},
  failureContext = {}
) {
  const root = record(report);
  const failures = [];

  function visit(suites, parents = []) {
    if (!Array.isArray(suites)) return;

    for (const suiteValue of suites) {
      const suite = record(suiteValue);
      if (suite === null) continue;
      const suiteTitle = typeof suite.title === "string" ? suite.title : "";
      const nextParents = suiteTitle ? [...parents, suiteTitle] : parents;

      if (Array.isArray(suite.specs)) {
        for (const specValue of suite.specs) {
          const spec = record(specValue);
          if (spec === null || !Array.isArray(spec.tests)) continue;
          const logicalScenario = [
            ...nextParents,
            typeof spec.title === "string" ? spec.title : "",
          ]
            .filter(Boolean)
            .join(" > ");

          for (const testValue of spec.tests) {
            const test = record(testValue);
            if (test === null) continue;
            const results = Array.isArray(test.results)
              ? test.results.map(record).filter(Boolean)
              : [];
            const failedResult = results.find(
              (result) => result.status !== "passed"
            );
            const unexpected =
              test.status !== undefined && test.status !== "expected";
            if (failedResult === undefined && !unexpected) continue;

            const project =
              typeof test.projectName === "string" ? test.projectName : null;
            failures.push({
              logicalScenario: logicalScenario || null,
              project,
              viewport: project ? (viewportByProject[project] ?? null) : null,
              route: failureContext.route ?? null,
              state: failureContext.state ?? null,
              location: typeof spec.file === "string" ? spec.file : null,
              observedSymptom:
                errorMessages(results).join("\n") ||
                `Playwright result status: ${String(test.status ?? "unknown")}`,
            });
          }
        }
      }

      visit(suite.suites, nextParents);
    }
  }

  visit(root?.suites);
  return failures;
}

export async function readPlaywrightFailureEvidence(
  reportPath,
  viewportByProject = {},
  failureContext = {}
) {
  try {
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    return collectPlaywrightFailureEvidence(
      report,
      viewportByProject,
      failureContext
    );
  } catch {
    return [];
  }
}
