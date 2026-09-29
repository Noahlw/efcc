/**
 * Account import/upgrade preservation guard (issue #683).
 *
 * The Google Sheets Users/PIN one-time import (`importLegacyUsers`) and the
 * forced credential-upgrade path (`completeCredentialUpgrade` /
 * `verifyLegacyPinForLogin` + lockout ladder + `/api/v1/auth/upgrade` +
 * `/api/v1/auth/admin-unlock` + login `requires_upgrade` gate) stay LIVE.
 * #644's mixed commit `432b36c6` deleted them wholesale alongside the root
 * workspace consolidation; this worktree compared each deletion against
 * current callers and migration history and found every entrypoint still has
 * live owners and an irreplaceable historical data responsibility:
 *
 * | Entrypoint (candidate deletion)            | Live callers (current head)                                  | Why no D1 replacement yet                                 |
 * | ------------------------------------------ | ------------------------------------------------------------ | --------------------------------------------------------- |
 * | `upgrade.ts` complete/verify               | `handlers.ts` login gate + `handleUpgrade`; 6 test files; `worker.auth` U003 fixture | Only path that clears `requires_upgrade=1` for Sheets-migrated rows |
 * | `lockout.ts` ladder + `adminUnlock*`       | `upgrade.ts`, `handlers.ts` (`handleAdminUnlock`, 423 gate); `lockout.test.ts` | 4-digit legacy key space needs the escalation ladder; password flow has none |
 * | `accounts.ts` `importLegacyUsers`          | `identity/seeds.ts` disposable rows; 7 test files             | User_ID-immutable idempotent Sheets-row migration; registrations mint fresh uuids |
 * | `credentials.ts` `normalizePin`            | `upgrade.ts` (sole live importer; mirrors Apps Script `sessionNormalizePin_`) | Transitively live via the upgrade path (ADR-0002)         |
 * | `handleUpgrade`/`handleAdminUnlock`/gate   | `worker.ts` routes; `api.ts` client; `app/page.tsx` UPGRADE view; E2E `auth-d1` smoke | Only session-issuing path for legacy accounts             |
 * | `worker.ts` `/upgrade` + `/admin-unlock`   | E2E `auth-d1.test.ts` legacy smoke; live frontend via `api.ts` | Same as above                                             |
 * | `api.ts` `authUpgrade`, UPGRADE view/copy  | `app.test.tsx` U1-U7 (Spec 077 acceptance); Worker contract   | Spec 077 U1-U8 owns this flow                             |
 * | Tests/E2E (`lockout`/`accounts`/upgrade blocks, `DEV_LEGACY`, `--reset-legacy`) | Cover live behavior (AUTH-01/AUTH-06); seed sibling suites | Deleting them weakens assertions (forbidden)              |
 * | Schema `legacy_pin_hash`/`requires_upgrade`/`lock_*` (`0000_init.sql`) | Read/written by live handlers/upgrade/seeds | Constraint: no schema changes                             |
 * | Docs (Spec 077, ADR-0020 S4, ADR-0002)     | 077 is the acceptance plan for the LIVE flow; Storybook catalog still lists `credential-upgrade` (so #663 `2d008260` wording is contradicted here); DEV_LEGACY/U003 fixtures contradict #644's "no old accounts need migration" | Historical rationale stays |
 *
 * Current D1 registration/account/role/audit journeys (the parity owners)
 * cover NEW password accounts, not the one-time Sheets migration, so they do
 * not obsolete the paths above. Parity references are adapted from #664
 * (role/grant/account contracts, browser traces) WITHOUT importing
 * `@efcc/contracts` (deferred to the runtime decision).
 *
 * Sheets-immutable rule: the importer consumes caller-supplied 2D rows and
 * never touches the sheet; no Apps Script/Sheets mutation may exist in the
 * shipped Worker/Next runtime (`web/worker.ts`, `web/app`, `web/components`,
 * `web/lib`). Build/test scripts and historical SQL migrations are not
 * shipped request handlers.
 *
 * `web/app/prototype/` (redesign gallery with account mocks) is explicitly
 * NOT retired here; its removal needs Storybook/waiver reconciliation and
 * belongs to the #675 integration (same deferral as #682).
 *
 * #675 may retire these paths only with proof (zero `requires_upgrade=1`
 * rows in every real D1, seed/test migration to direct-SQL fixtures,
 * replacement E2E decision) by updating this guard — never by silent
 * deletion.
 */

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import nodePath from "node:path";

import { describe, test } from "vitest";

const repoRoot = nodePath.join(import.meta.dirname, "..", "..");
const path = (...parts) => nodePath.join(repoRoot, ...parts);
const read = (rel) => readFileSync(path(rel), "utf-8");

// Every live file of the import/upgrade surface. Presence here is the
// #683 decision: each file still has callers (see table above).
const RETAINED_LEGACY_FILES = [
  "web/lib/auth/upgrade.ts",
  "web/lib/auth/lockout.ts",
  "web/lib/auth/lockout.test.ts",
  "web/lib/auth/accounts.ts",
  "web/lib/auth/accounts.test.ts",
  "web/lib/auth/credentials.ts",
  "web/lib/auth/handlers.ts",
  "web/lib/api.ts",
  "web/app/page.tsx",
  "web/lib/app.test.tsx",
  "web/worker.ts",
  "web/worker.auth.test.ts",
  "web/lib/identity/seeds.ts",
  "web/migrations/0000_init.sql",
  "tests/e2e/dev-fixtures.ts",
  "tests/e2e/auth-d1.test.ts",
  "tests/e2e/seed-dev-accounts.ts",
  "docs/specs/077-legacy-credential-upgrade-acceptance-plan.md",
];

// Marker per file proving the entrypoint is still wired (not a dead shell).
const RETAINED_WIRING = [
  ["web/lib/auth/accounts.ts", "export async function importLegacyUsers"],
  [
    "web/lib/auth/upgrade.ts",
    "export async function completeCredentialUpgrade",
  ],
  ["web/lib/auth/upgrade.ts", "export async function verifyLegacyPinForLogin"],
  ["web/lib/auth/lockout.ts", "export async function adminUnlockLegacyUpgrade"],
  ["web/lib/auth/lockout.ts", "class LegacyUpgradeLockedError"],
  ["web/lib/auth/credentials.ts", "export function normalizePin"],
  ["web/lib/auth/handlers.ts", "export async function handleUpgrade"],
  ["web/lib/auth/handlers.ts", "export async function handleAdminUnlock"],
  ["web/lib/auth/handlers.ts", "requires_upgrade"],
  ["web/lib/auth/handlers.ts", "mustSetNewCredential"],
  ["web/worker.ts", "/api/v1/auth/upgrade"],
  ["web/worker.ts", "/api/v1/auth/admin-unlock"],
  ["web/lib/api.ts", "/api/v1/auth/upgrade"],
  ["web/app/page.tsx", "mustSetNewCredential"],
  ["web/lib/app.test.tsx", "forced-upgrade"],
  ["web/worker.auth.test.ts", "mustSetNewCredential"],
  ["web/worker.auth.test.ts", "/api/v1/auth/upgrade"],
  ["web/lib/identity/seeds.ts", "importLegacyUsers"],
  ["web/migrations/0000_init.sql", "legacy_pin_hash"],
  ["web/migrations/0000_init.sql", "requires_upgrade"],
  ["tests/e2e/dev-fixtures.ts", "DEV_LEGACY"],
  ["tests/e2e/auth-d1.test.ts", "/api/v1/auth/upgrade"],
  ["tests/e2e/seed-dev-accounts.ts", "requires_upgrade"],
  ["tests/e2e/seed-dev-accounts.ts", "reset-legacy"],
];

// Current D1 owners proving the accepted replacement journeys (adapted #664
// parity references; `@efcc/contracts` stays out of the tree).
const RETAINED_CURRENT_OWNERS = [
  [
    "web/lib/auth/registrations.ts",
    "export async function createRegistrationRequest",
  ],
  [
    "web/lib/auth/registrations.ts",
    "export async function approveRegistration",
  ],
  ["web/lib/auth/registrations.ts", "export async function rejectRegistration"],
  ["web/lib/auth/registrations.ts", "REGISTRATION_APPROVE"],
  ["web/lib/auth/registrations.test.ts", "registrations"],
  [
    "web/lib/identity/account-access.ts",
    "export async function loadAccountAccess",
  ],
  [
    "web/lib/identity/account-access-handlers.ts",
    "handleMutateAccountAssignments",
  ],
  ["web/lib/identity/role-hierarchy.test.ts", "Staff"],
  [
    "web/lib/identity/permission-editor-handlers.ts",
    "handleUpdateRoleDefinitionGrants",
  ],
  ["web/worker.ts", "/api/v1/auth/register"],
  ["web/worker.ts", "/api/v1/auth/login"],
  ["web/worker.ts", "/api/v1/auth/refresh"],
];

// Sheets-mutating markers that must never appear in the shipped web surface.
// The legacy importer takes caller-supplied 2D rows; it never calls Sheets.
const SHEETS_MUTATION_MARKERS = [
  "googleapis",
  "SpreadsheetApp",
  "ScriptApp",
  "spreadsheets.values.update",
  "spreadsheets.values.append",
  "spreadsheets.values.clear",
  "spreadsheets.values.batchUpdate",
];

function shippedSourceFiles(directory) {
  return readdirSync(path(directory), { withFileTypes: true }).flatMap(
    (entry) => {
      const file = nodePath.join(directory, entry.name);
      if (entry.isDirectory()) {
        return shippedSourceFiles(file);
      }
      return /\.[cm]?[jt]sx?$/u.test(entry.name) &&
        !/\.(?:test|stories|d)\.[jt]sx?$/u.test(entry.name)
        ? [file]
        : [];
    }
  );
}

const SHEETS_SCAN_FILES = [
  nodePath.join("web", "worker.ts"),
  ...["app", "components", "lib"].flatMap((directory) =>
    shippedSourceFiles(nodePath.join("web", directory))
  ),
];

describe("account import/upgrade preservation (#683)", () => {
  test("legacy import/upgrade entrypoints stay present", () => {
    for (const file of RETAINED_LEGACY_FILES) {
      assert.equal(
        existsSync(path(file)),
        true,
        `preserved legacy entrypoint must stay present: ${file}`
      );
    }
  });

  test("legacy wiring markers stay intact (no dead shells)", () => {
    for (const [file, marker] of RETAINED_WIRING) {
      assert.ok(
        read(file).includes(marker),
        `preserved legacy wiring must stay intact: ${file} contains ${marker}`
      );
    }
  });

  test("current D1 registration/account/role/audit owners stay present", () => {
    for (const [file, marker] of RETAINED_CURRENT_OWNERS) {
      assert.equal(
        existsSync(path(file)),
        true,
        `current D1 owner must stay present: ${file}`
      );
      assert.ok(
        read(file).includes(marker),
        `current D1 owner must stay wired: ${file} contains ${marker}`
      );
    }
  });

  test("no Sheets mutation surface and no contracts import in web/", () => {
    for (const file of SHEETS_SCAN_FILES) {
      const content = readFileSync(path(file), "utf-8");
      for (const marker of SHEETS_MUTATION_MARKERS) {
        assert.equal(
          content.includes(marker),
          false,
          `Sheets-immutable violation: ${file} contains ${marker}`
        );
      }
    }
    for (const manifest of ["package.json", "web/package.json"]) {
      assert.equal(
        read(manifest).includes("@efcc/contracts"),
        false,
        `@efcc/contracts stays deferred (not a dependency): ${manifest}`
      );
    }
    for (const file of ["web/worker.ts", "web/lib/auth/handlers.ts"]) {
      assert.equal(
        read(file).includes("@efcc/contracts"),
        false,
        `@efcc/contracts stays deferred (not imported): ${file}`
      );
    }
  });

  test("prototype gallery stays for #675 account-surface retirement (named follow-up)", () => {
    assert.equal(
      existsSync(path("web", "app", "prototype", "page.tsx")),
      true,
      "web/app/prototype/page.tsx stays until #675 retires it after account parity"
    );
  });
});
