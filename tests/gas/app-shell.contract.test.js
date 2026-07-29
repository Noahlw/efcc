// Contract test for the stable App Document shell per ADR-0010 and
// docs/specs/009-phone-first-shell-navigation.md.
//
// This file does NOT touch src/gas/. It reads the shell files from disk
// at test-run time and asserts the contract that the shell-builder
// task agreed to.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, test } from "vitest";

const __dirname = import.meta.dirname;
const REPO_ROOT = path.join(__dirname, "..", "..");
const GAS_DIR = path.join(REPO_ROOT, "src", "gas");

function readGas(filename) {
  return readFileSync(path.join(GAS_DIR, filename), "utf-8");
}

// Browser-replacement / navigation primitives that must NEVER appear in
// the static shell. These are checked per-file and again as a whole-repo
// guard at the bottom of the file.
const FORBIDDEN_BROWSER = [
  "document.write(",
  "document.open(",
  "document.close(",
  "window.top.location",
  "location.href =",
  "location.replace(",
  '<meta http-equiv="refresh"',
];

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// Return the substring of `html` from the `<` that opens the tag carrying
// `id="<id>"` up to and including the matching `>` of that same tag.
// Returns null if the id attribute is not present.
function findOpeningTagWithId(html, id) {
  const needle = `id="${id}"`;
  const idPos = html.indexOf(needle);
  if (idPos === -1) {
    return null;
  }

  let openStart = idPos;
  while (openStart > 0 && html[openStart] !== "<") {
    openStart -= 1;
  }
  if (openStart < 0 || html[openStart] !== "<") {
    return null;
  }

  let openEnd = idPos;
  while (openEnd < html.length && html[openEnd] !== ">") {
    openEnd += 1;
  }
  if (openEnd >= html.length) {
    return null;
  }

  return html.slice(openStart, openEnd + 1);
}

// Return the slice of `html` starting at `id="<startId>"` and ending just
// before the first occurrence of any of the `endIds` (or </body> as a
// fallback). Returns null if `startId` is not present.
function findRegionAfterId(html, startId, endIds) {
  const startIdx = html.indexOf(`id="${startId}"`);
  if (startIdx === -1) {
    return null;
  }

  let endIdx = -1;
  for (const endId of endIds) {
    const i = html.indexOf(`id="${endId}"`, startIdx + 1);
    if (i !== -1 && (endIdx === -1 || i < endIdx)) {
      endIdx = i;
    }
  }
  if (endIdx === -1) {
    const bodyClose = html.indexOf("</body>", startIdx);
    endIdx = bodyClose === -1 ? html.length : bodyClose;
  }
  return html.slice(startIdx, endIdx);
}

describe("App Document shell contract (issue #65, ADR-0010)", () => {
  // -------------------------------------------------------------------------
  // Code.gs
  // -------------------------------------------------------------------------

  test("Code.gs: serves the App template and declares the viewport meta tag", () => {
    const src = readGas("Code.gs");
    assert.ok(
      src.includes('createTemplateFromFile("App")'),
      'Code.gs must call HtmlService.createTemplateFromFile("App")'
    );
    assert.ok(
      src.includes("addMetaTag") && src.includes('"viewport"'),
      'Code.gs must call .addMetaTag("viewport", ...) — the viewport meta tag must NOT be inlined in App.html'
    );
  });

  test("Code.gs: doGet must not branch on e.parameter or touch data/session services", () => {
    const src = readGas("Code.gs");
    assert.ok(
      !src.includes("e.parameter"),
      "Code.gs must not reference e.parameter (no query-string routing)"
    );
    assert.ok(
      !src.includes("SpreadsheetApp"),
      "Code.gs must not touch SpreadsheetApp at bootstrap"
    );
    assert.ok(
      !src.includes("LockService"),
      "Code.gs must not acquire locks at bootstrap"
    );
    assert.ok(
      !src.includes("Session."),
      "Code.gs must not access Session at bootstrap"
    );
  });

  // -------------------------------------------------------------------------
  // App.html
  // -------------------------------------------------------------------------

  test("App.html: starts with <!doctype html> and contains </html>", () => {
    const src = readGas("App.html");
    const head = src.trimStart().slice(0, 64).toLowerCase();
    assert.ok(
      head.startsWith("<!doctype html>"),
      `App.html must start with <!doctype html>; saw leading: ${JSON.stringify(head.slice(0, 32))}`
    );
    assert.ok(src.includes("</html>"), "App.html must contain </html>");
  });

  test("App.html: every persistent shell region id is present", () => {
    const src = readGas("App.html");
    const required = [
      "app",
      "app-header",
      "app-status",
      "app-content",
      "app-nav-phone",
      "app-nav-desktop",
    ];
    for (const id of required) {
      assert.ok(src.includes(`id="${id}"`), `App.html must contain id="${id}"`);
    }
  });

  test("App.html: initial app-state is BOOTING (server-rendered)", () => {
    const src = readGas("App.html");
    assert.ok(
      src.includes('data-app-state="BOOTING"'),
      'App.html must set data-app-state="BOOTING" as the initial value on #app'
    );
  });

  test("App.html: view-login fragment is included inside the app-content region", () => {
    const src = readGas("App.html");
    const region = findRegionAfterId(src, "app-content", [
      "app-nav-phone",
      "app-nav-desktop",
    ]);
    assert.ok(region !== null, 'App.html must contain id="app-content"');
    const singleQuoted = region.includes(`<?!= include('view-login'); ?>`);
    const doubleQuoted = region.includes(`<?!= include("view-login"); ?>`);
    assert.ok(
      singleQuoted || doubleQuoted,
      "app-content region must include the view-login fragment via include(...)"
    );
  });

  test("App.html: shell.js module is included once", () => {
    const src = readGas("App.html");
    const singleQuoted = src.includes(`<?!= include('shell.js'); ?>`);
    const doubleQuoted = src.includes(`<?!= include("shell.js"); ?>`);
    assert.ok(
      singleQuoted || doubleQuoted,
      'App.html must include the shell module via include("shell.js")'
    );
  });

  test('App.html: no inline <meta name="viewport" tag', () => {
    const src = readGas("App.html");
    assert.ok(
      !src.includes('<meta name="viewport'),
      "viewport meta tag must come ONLY from Code.gs addMetaTag() — no inline meta in App.html"
    );
  });

  test("App.html: contains no forbidden browser-replacement / navigation primitives", () => {
    const src = readGas("App.html");
    for (const bad of FORBIDDEN_BROWSER) {
      assert.ok(!src.includes(bad), `App.html must not contain ${bad}`);
    }
    assert.ok(
      !src.includes("e.parameter"),
      "App.html must not contain e.parameter"
    );
  });

  test("App.html: nav regions start in the hidden state", () => {
    const src = readGas("App.html");
    for (const id of ["app-nav-phone", "app-nav-desktop"]) {
      const tag = findOpeningTagWithId(src, id);
      assert.ok(
        tag !== null,
        `must be able to locate the opening tag of #${id}`
      );
      assert.ok(
        /\bhidden(?:\s*=|\s|>|\/)/u.test(tag),
        `#${id} opening tag must carry the native hidden attribute (saw: ${tag})`
      );
    }
  });

  // -------------------------------------------------------------------------
  // view-login.html
  // -------------------------------------------------------------------------

  test("view-login.html: contract — form ids present, no scripts, has CJK copy", () => {
    const src = readGas("view-login.html");
    assert.ok(
      !src.includes("<script"),
      "view-login.html must not contain <script>"
    );
    assert.ok(
      src.includes('id="login-form"'),
      'view-login.html must contain id="login-form"'
    );
    assert.ok(
      src.includes('id="login-username"'),
      'view-login.html must contain id="login-username"'
    );
    assert.ok(
      src.includes('id="login-pin"'),
      'view-login.html must contain id="login-pin"'
    );
    assert.ok(
      /[\u4E00-\u9FFF]/u.test(src),
      "view-login.html must contain at least one CJK (Traditional Chinese) character"
    );
  });

  // -------------------------------------------------------------------------
  // shell.js.html
  // -------------------------------------------------------------------------

  test("shell.js.html: hooks DOMContentLoaded and flips app-state to SIGNED_OUT", () => {
    const src = readGas("shell.js.html");
    assert.ok(
      src.includes("DOMContentLoaded"),
      "shell.js.html must hook DOMContentLoaded"
    );
    assert.ok(
      src.includes("SIGNED_OUT"),
      "shell.js.html must set app-state to SIGNED_OUT after mount"
    );
  });

  test("shell.js.html: login form submit handler calls preventDefault", () => {
    const src = readGas("shell.js.html");
    assert.ok(
      src.includes("preventDefault"),
      "shell.js.html must call preventDefault() on the login-form submit handler"
    );
  });

  test("shell.js.html: contains no RPC calls or forbidden browser primitives", () => {
    const src = readGas("shell.js.html");
    const forbidden = [
      "google.script.run",
      "document.write(",
      "document.open(",
      "location.href =",
      "location.replace(",
      "window.top.location",
    ];
    for (const bad of forbidden) {
      assert.ok(!src.includes(bad), `shell.js.html must not contain ${bad}`);
    }
  });

  // -------------------------------------------------------------------------
  // styles.html
  // -------------------------------------------------------------------------

  test("styles.html: declares the 768px desktop breakpoint", () => {
    const src = readGas("styles.html");
    assert.ok(
      src.includes("768px"),
      'styles.html must contain the literal "768px" for the desktop breakpoint'
    );
  });

  test("styles.html: styles both nav regions", () => {
    const src = readGas("styles.html");
    assert.ok(
      src.includes(".app-nav-phone"),
      "styles.html must contain .app-nav-phone"
    );
    assert.ok(
      src.includes(".app-nav-desktop"),
      "styles.html must contain .app-nav-desktop"
    );
  });

  test("styles.html: defines a [hidden] rule that covers the nav regions", () => {
    const src = readGas("styles.html");

    // Strongest acceptable form: a [hidden] selector whose rule body
    // contains `display: none`.
    const hiddenDisplayNone =
      /\[hidden\][^{}]*\{[^}]*display\s*:\s*none/iu.test(src);

    // Minimum acceptable form: a CSS rule that combines [hidden] with
    // either .app-nav-phone or .app-nav-desktop.
    const combinedRule = new RegExp(
      [
        "\\.app-nav-phone\\s*\\[[^\\]]*hidden[^\\]]*\\]",
        "\\.app-nav-desktop\\s*\\[[^\\]]*hidden[^\\]]*\\]",
        "\\[hidden\\][^}]*\\.app-nav-phone",
        "\\[hidden\\][^}]*\\.app-nav-desktop",
      ].join("|"),
      "u"
    ).test(src);

    assert.ok(
      hiddenDisplayNone || combinedRule,
      "styles.html must define a [hidden] rule (with display:none) or combine [hidden] with .app-nav-phone / .app-nav-desktop"
    );
  });

  // -------------------------------------------------------------------------
  // Whole-repo guard — defense in depth across every top-level src/gas/*.gs
  // and src/gas/*.html file (template-reference/ is excluded by design).
  // -------------------------------------------------------------------------

  test("src/gas/*.gs + src/gas/*.html: zero document.open/write/close anywhere (defense in depth)", () => {
    const entries = readdirSync(GAS_DIR, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && /\.(?:gs|html)$/u.test(e.name))
      .map((e) => e.name)
      .sort();

    assert.ok(
      files.length > 0,
      "expected at least one .gs or .html file at the top level of src/gas/"
    );

    const banned = ["document.write(", "document.open(", "document.close("];
    const offenders = [];

    for (const name of files) {
      const src = readFileSync(path.join(GAS_DIR, name), "utf-8");
      for (const bad of banned) {
        if (src.includes(bad)) {
          offenders.push(`${name}: ${bad}`);
        }
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `forbidden browser-replacement primitives found in src/gas/:\n  ${offenders.join("\n  ")}`
    );
  });
});
