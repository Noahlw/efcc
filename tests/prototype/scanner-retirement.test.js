/**
 * External scanner retirement guard (issue #682).
 *
 * The abandoned Apps Script-era external camera origin
 * (`prototype/scanner/` + its `scanner-core.js` bridge contract) was retired
 * after the in-app Worker/D1 Attendance flows proved the same accepted
 * check-in outcomes. This guard locks the retirement:
 *
 * - the external origin files stay absent (no `window.open` + `postMessage`
 *   bridge, no vendored `html5-qrcode`/`jsQR` decoder, no mock backend);
 * - the retained in-app owners stay present (`/scanner` route,
 *   `ScannerBoundary`, `useQrCamera` with BarcodeDetector native +
 *   ZXing ponyfill fallback, Worker/D1 Attendance handlers);
 * - Storybook synthetic scanner fixtures stay present (separate human/device
 *   gate owns hardware camera truth).
 *
 * Behavior parity lives in the focused suites, not here (adapted, not
 * imported, per #682 constraints; `@efcc/contracts` stays deferred):
 * - `web/lib/attendance-worker.test.ts` (resolve/self/guest, duplicate,
 *   ack-loss reconcile, void, denied/accepted, persisted state, audit);
 * - scanner component suites (`scanner-boundary`, `use-qr-camera`,
 *   `assisted-scanner-panel`, `self-check-in-panel`, `attendance-panel`,
 *   `attendance-operator-panel`, `attendance-roster`);
 * - `tests/e2e/attendance-d1.test.ts` ATT-04 browser matrix; #675 records
 *   its exact-head local Worker/D1 re-proof before scanner retirement approval.
 *
 * `web/app/prototype/` (redesign gallery with account surfaces) is
 * explicitly NOT retired here; its removal needs #683 account parity and
 * remains tracked there after #675 integration. Historical ADR/spec rationale
 * (ADR-0015, specs 070/072/073/074, research notes) is preserved untouched.
 */

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import nodePath from "node:path";

import { describe, test } from "vitest";

const repoRoot = nodePath.join(import.meta.dirname, "..", "..");
const path = (...parts) => nodePath.join(repoRoot, ...parts);

// Files removed by the #682 retirement (every entrypoint of the abandoned
// external origin, including the vendored decoders and mock backend).
const RETIRED_EXTERNAL_SCANNER_FILES = [
  "prototype/scanner/README.md",
  "prototype/scanner/scanner-core.js",
  "prototype/scanner/scanner.js",
  "prototype/scanner/check-in-ui.js",
  "prototype/scanner/mock-backend.js",
  "prototype/scanner/serve.mjs",
  "prototype/scanner/index.html",
  "prototype/scanner/opener.html",
  "prototype/scanner/prototype-index.html",
  "prototype/scanner/check-in.html",
  "prototype/scanner/guest-check-in.html",
  "prototype/scanner/event-manage.html",
  "prototype/scanner/showcase.html",
  "prototype/scanner/test-qr.html",
  "prototype/scanner/styles.css",
  "prototype/scanner/civic.css",
  "prototype/scanner/vendor/html5-qrcode.min.js",
  "prototype/scanner/vendor/jsQR.js",
  "prototype/scanner/vendor/qrcode-generator.min.js",
];

// Retained in-app owners that prove the same accepted check-in outcomes.
const RETAINED_IN_APP_OWNERS = [
  "web/app/scanner/page.tsx",
  "web/lib/scanner-boundary.tsx",
  "web/lib/scanner-intent.ts",
  "web/lib/use-qr-camera.ts",
  "web/lib/assisted-scanner-panel.tsx",
  "web/lib/self-check-in-panel.tsx",
  "web/lib/attendance.ts",
  "web/worker.ts",
];

// Storybook synthetic scanner fixtures (valid, deterministic, no hardware).
const RETAINED_STORYBOOK_FIXTURES = [
  "web/.storybook/attendance-scanner-guest-fixtures.ts",
  "web/.storybook/attendance-scanner-guest.story-manifest.ts",
];

describe("external scanner retirement (#682)", () => {
  test("abandoned external origin files stay absent", () => {
    for (const file of RETIRED_EXTERNAL_SCANNER_FILES) {
      assert.equal(
        existsSync(path(file)),
        false,
        `retired external scanner file must stay absent: ${file}`
      );
    }
    assert.equal(
      existsSync(path("prototype", "scanner")),
      false,
      "prototype/scanner/ directory must stay absent"
    );
  });

  test("in-app scanner and Attendance owners stay present", () => {
    for (const file of RETAINED_IN_APP_OWNERS) {
      assert.equal(
        existsSync(path(file)),
        true,
        `retained in-app owner must stay present: ${file}`
      );
    }
  });

  test("Storybook synthetic scanner fixtures stay valid", () => {
    for (const file of RETAINED_STORYBOOK_FIXTURES) {
      assert.equal(
        existsSync(path(file)),
        true,
        `Storybook scanner fixture must stay present: ${file}`
      );
    }
  });

  test("prototype export stays for #683 account parity (named follow-up)", () => {
    assert.equal(
      existsSync(path("web", "app", "prototype", "page.tsx")),
      true,
      "web/app/prototype/page.tsx stays until #683 retires it after account parity"
    );
  });
});
