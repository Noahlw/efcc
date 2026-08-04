/**
 * App.html include() directive guard (regression for the deployed
 * "No HTML file named jsqr was found" exception - now a general guard).
 *
 * clasp pushes a disk file `<name>.html` to an Apps Script HTML file named
 * `<name>` (it strips only the trailing `.html`), so a disk file
 * `shell-session.js.html` becomes the Apps Script file `shell-session.js`
 * and must be referenced as include('shell-session.js'). The deployed runtime
 * is the only place that exercises HtmlService.createHtmlOutputFromFile, so
 * this static guard is the correct local seam: it asserts every include('X')
 * in App.html has a matching src/gas/X.html on disk.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, test } from "vitest";

const GAS_DIR = path.join(import.meta.dirname, "..", "..", "src", "gas");

const appHtml = readFileSync(path.join(GAS_DIR, "App.html"), "utf-8");
const includeNames = [
  ...appHtml.matchAll(/include\(\s*['"](?<name>[^'"]+)['"]\s*\)/gu),
].map((m) => m.groups.name);

describe("App.html include() directives resolve to real files", () => {
  test("App.html references at least one include", () => {
    assert.ok(
      includeNames.length > 0,
      "App.html must include client scripts via include()"
    );
  });

  test.each(includeNames)("include('%s') -> src/gas/%s.html exists", (name) => {
    const file = path.join(GAS_DIR, `${name}.html`);
    assert.ok(
      existsSync(file),
      `include('${name}') has no matching file: expected src/gas/${name}.html. ` +
        "clasp strips only the trailing .html, so the include name must equal " +
        "the file basename (shell-session.js.html -> include('shell-session.js'))."
    );
  });
});
