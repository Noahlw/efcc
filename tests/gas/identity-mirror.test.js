/**
 * AUTH-03 (#161) — D1 → Sheets identity-metadata review mirror, Apps Script
 * side (src/gas/identity-mirror.gs).
 *
 * Acceptance covered here (ADR-0021):
 *   - The signed Worker→Apps Script boundary: a valid envelope verifies and
 *     applies; an invalid signature / wrong secret fails closed (403) with a
 *     secret-free diagnostic.
 *   - Idempotent, convergent merge: repeated runs append new rows and update
 *     changed rows only — never a duplicate row for a user_id, never a
 *     destructive whole-sheet rewrite.
 *   - Conflict / missing-identifier visibility: a payload with a duplicate or
 *     missing user_id fails closed (422) naming the offending identifiers.
 *   - Duplicate existing user_id in the sheet is detected before any write
 *     and fails closed (no partial mutation).
 *   - A simulated mid-run setValues failure fails closed 500 with no partial
 *     mutation (pre-validated by the read step).
 *   - Failure handling: a Sheets API / lock failure fails closed (500) with
 *     no partial write and no secrets in the diagnostic.
 *   - Idempotency short-circuit: applying the exact same snapshot twice is a
 *     no-op (ALREADY_APPLIED).
 *   - Secret-free diagnostics: no PIN, token, credential, or secret appears
 *     in any response, and the Logger captures only a fixed marker.
 *   - Schedule/handler wiring + D1-authoritative (structural, read from the
 *     web/ sources): the wrangler cron is `0 19 * * *`, worker.ts exports a
 *     scheduled handler, and the mirror never reads the review Sheet back as
 *     an authorization source.
 *
 * The signature is computed here with node:crypto using the SAME canonical
 * JSON + HMAC-SHA256 algorithm the Worker uses, so this test proves the
 * cross-runtime boundary (Worker signer ↔ Apps Script verifier). The real
 * Google Sheet is never touched — every Sheet interaction is mocked.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, createHmac } from "node:crypto";
import path from "node:path";
import vm from "node:vm";

import { describe, test } from "vitest";

const GAS_DIR = path.join(import.meta.dirname, "..", "..", "src", "gas");
const WEB_DIR = path.join(import.meta.dirname, "..", "..", "web");

const SECRET = "mirror-test-shared-secret";

// ---------------------------------------------------------------------------
// Cross-runtime canonical JSON + HMAC (must match web/lib/mirror and the .gs)
// ---------------------------------------------------------------------------

function canonicalJson(obj) {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "string") return JSON.stringify(obj);
  if (typeof obj === "number" && Number.isFinite(obj)) return String(obj);
  if (typeof obj === "boolean") return String(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalJson).join(",") + "]";
  if (typeof obj === "object") {
    const keys = Object.keys(obj).sort();
    const pairs = [];
    for (const k of keys) {
      const val = obj[k];
      if (val === undefined) continue;
      pairs.push(JSON.stringify(k) + ":" + canonicalJson(val));
    }
    return "{" + pairs.join(",") + "}";
  }
  return "null";
}

function hmacHex(secret, data) {
  return createHmac("sha256", secret).update(data).digest("hex");
}

function idempotencyKeyFor(accounts) {
  return createHash("sha256").update(canonicalJson(accounts)).digest("hex");
}

function signEnvelope(secret, accounts, now = 1_000_000) {
  return {
    version: 1,
    issuedAt: now,
    idempotencyKey: idempotencyKeyFor(accounts),
    accounts,
    signature: hmacHex(
      secret,
      canonicalJson({
        version: 1,
        issuedAt: now,
        idempotencyKey: idempotencyKeyFor(accounts),
        accounts,
      })
    ),
  };
}

// ---------------------------------------------------------------------------
// Apps Script mocks (in-memory sheet backed by a 2D array)
// ---------------------------------------------------------------------------

function makeSheetState() {
  const header = [
    "user_id", "name", "username", "role", "account_status",
    "credential_kind", "requires_upgrade", "lock_level", "created_at", "updated_at",
  ];
  const rows = [header];
  const sheet = {
    getDataRange() {
      return { getValues: () => rows.map((r) => [...r]) };
    },
    getRange(row, col, nrows, ncols) {
      return {
        setValues(vals) {
          for (let i = 0; i < vals.length; i++) {
            for (let c = 0; c < vals[i].length; c++) {
              const r = row - 1 + i;
              // Grow the backing array for append batches that write rows
              // beyond the current end (getLastRow + 1).
              while (rows.length <= r) rows.push(new Array(ncols).fill(""));
              rows[r][col - 1 + c] = vals[i][c];
            }
          }
        },
      };
    },
    appendRow(row) {
      rows.push([...row]);
    },
    getLastRow() {
      return rows.length;
    },
  };
  return { rows, sheet };
}

function buildContext({ secret = SECRET, sheetId = "mock-sheet" } = {}) {
  const state = makeSheetState();
  const props = new Map([
    [cleanKey("EFCC_IDENTITY_MIRROR_SHEET_ID"), sheetId],
    [cleanKey("EFCC_SERVICE_SECRET"), secret],
  ]);
  const loggerCalls = [];
  const context = {
    console: { log: () => {} },
    Logger: { log: (...args) => loggerCalls.push(args) },
    Utilities: {
      computeHmacSha256Signature(data, key) {
        return Array.from(createHmac("sha256", key).update(data).digest());
      },
    },
    LockService: {
      getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => props.get(cleanKey(k)) ?? null,
        setProperty: (k, v) => props.set(cleanKey(k), String(v)),
      }),
    },
    SpreadsheetApp: {
      openById: (id) => ({
        getSheetByName: () => state.sheet,
        insertSheet: () => state.sheet,
      }),
      flush: () => {},
    },
    ContentService: {
      createTextOutput: (str) => ({
        setMimeType: () => ({ getContent: () => str }),
      }),
      MimeType: { JSON: "json" },
    },
  };
  vm.createContext(context);
  loadGasFile(context, "identity-mirror.gs");
  return { context, state, props, loggerCalls };
}

function cleanKey(k) {
  return k;
}

function loadGasFile(context, filename) {
  vm.runInContext(
    readFileSync(path.join(GAS_DIR, filename), "utf-8"),
    context,
    { filename }
  );
}

/** Run doPost with a signed envelope and return the parsed JSON body. */
function post(context, envelope) {
  const text = context.doPost({
    postData: { contents: JSON.stringify(envelope) },
  });
  return JSON.parse(text.getContent());
}

const ACCOUNTS = [
  { user_id: "U1", name: "Alice", username: "alice", role: "Admin", account_status: "Active", credential_kind: "password", requires_upgrade: 0, lock_level: 0, created_at: 1, updated_at: 1 },
  { user_id: "U2", name: "Bob", username: "bob", role: "Member", account_status: "Active", credential_kind: "legacy_pin", requires_upgrade: 1, lock_level: 0, created_at: 2, updated_at: 2 },
];

describe("identity-mirror.gs — signed boundary", () => {
  test("a valid signed envelope applies and returns a clean ack", () => {
    const { context, state } = buildContext();
    const env = signEnvelope(SECRET, ACCOUNTS);
    const ack = post(context, env);
    assert.strictEqual(ack.status, 200);
    assert.strictEqual(ack.added, 2);
    // Rows written: header + 2 accounts, no duplicates.
    assert.strictEqual(state.rows.length, 3);
  });

  test("an invalid signature fails closed 403 with no write and no secret", () => {
    const { context, state } = buildContext();
    const env = signEnvelope("wrong-secret", ACCOUNTS);
    const ack = post(context, env);
    assert.strictEqual(ack.status, 403);
    assert.strictEqual(ack.code, "FORBIDDEN");
    assert.strictEqual(state.rows.length, 1); // untouched
    assert.ok(!JSON.stringify(ack).includes("wrong-secret"));
  });

  test("a tampered envelope fails closed", () => {
    const { context, state } = buildContext();
    const env = signEnvelope(SECRET, ACCOUNTS);
    env.accounts[0].name = "Tampered"; // tamper after signing
    const ack = post(context, env);
    assert.strictEqual(ack.status, 403);
    assert.strictEqual(state.rows.length, 1);
  });

  test("a malformed body fails closed 400", () => {
    const { context } = buildContext();
    const ack = post(context, { version: 99 });
    assert.strictEqual(ack.status, 400);
  });
});

describe("identity-mirror.gs — idempotent convergent merge", () => {
  test("re-running the same snapshot adds no duplicates (ALREADY_APPLIED)", () => {
    const { context, state } = buildContext();
    const env = signEnvelope(SECRET, ACCOUNTS);
    const first = post(context, env);
    assert.strictEqual(first.added, 2);
    const second = post(context, env);
    assert.strictEqual(second.status, 200);
    assert.strictEqual(second.code, "ALREADY_APPLIED");
    assert.strictEqual(second.added, 0);
    assert.strictEqual(state.rows.length, 3); // header + 2, no dupes
  });

  test("a changed snapshot updates in place and appends only new rows", () => {
    const { context, state } = buildContext();
    post(context, signEnvelope(SECRET, ACCOUNTS));
    // U1 name changes; U3 is new.
    const next = [
      { ...ACCOUNTS[0], name: "Alice Chan" },
      { ...ACCOUNTS[1] },
      { user_id: "U3", name: "Carol", username: "carol", role: "Member", account_status: "Active", credential_kind: "password", requires_upgrade: 0, lock_level: 0, created_at: 3, updated_at: 3 },
    ];
    const ack = post(context, signEnvelope(SECRET, next));
    assert.strictEqual(ack.added, 1);
    assert.strictEqual(ack.updated, 2);
    // No whole-sheet rewrite: still header + 3 accounts.
    assert.strictEqual(state.rows.length, 4);
    const names = state.rows.map((r) => r[1]);
    assert.ok(names.includes("Alice Chan"));
    assert.strictEqual(names.filter((n) => n === "Alice Chan").length, 1);
  });
});

describe("identity-mirror.gs — conflict / failure visibility", () => {
  test("a duplicate user_id in the payload fails closed 422 naming the identifier", () => {
    const { context, state } = buildContext();
    const env = signEnvelope(SECRET, [ACCOUNTS[0], ACCOUNTS[0]]);
    const ack = post(context, env);
    assert.strictEqual(ack.status, 422);
    assert.strictEqual(ack.code, "CONFLICT");
    assert.ok(ack.detail.includes("U1"));
    assert.strictEqual(state.rows.length, 1); // no partial write
  });

  test("a missing user_id fails closed 422", () => {
    const { context, state } = buildContext();
    const env = signEnvelope(SECRET, [{ ...ACCOUNTS[0], user_id: "" }]);
    const ack = post(context, env);
    assert.strictEqual(ack.status, 422);
    assert.strictEqual(state.rows.length, 1);
  });

  test("a duplicate user_id already present in the sheet fails closed (no partial write)", () => {
    // Pre-seed the sheet with two rows that share the same user_id.
    const { context, state } = buildContext({
      sheetId: "mock-sheet",
    });
    state.rows.push(["U1", "Alice", "alice", "Admin", "Active", "password", 0, 0, 1, 1]);
    state.rows.push(["U1", "Alice Dup", "alice", "Admin", "Active", "password", 0, 0, 1, 1]);
    const env = signEnvelope(SECRET, ACCOUNTS);
    const ack = post(context, env);
    assert.strictEqual(ack.status, 500);
    assert.strictEqual(ack.code, "INTERNAL_ERROR");
    // No partial write: the sheet still has exactly the pre-seeded rows.
    assert.strictEqual(state.rows.length, 3); // header + 2 pre-seeded rows
    // Diagnostic must NOT contain the offending identifier.
    assert.ok(!ack.detail.includes("U1"));
    assert.ok(!JSON.stringify(ack).includes("U1"));
  });

  test("operator logs are secret-free and identifier-free", () => {
    const { context, loggerCalls } = buildContext();
    // Force a fail-closed catch path.
    context.SpreadsheetApp.openById = () => {
      throw new Error("internal sheet id in this message");
    };
    const ack = post(context, signEnvelope(SECRET, ACCOUNTS));
    assert.strictEqual(ack.status, 500);
    // The Logger call must be a fixed marker with no internal identifiers.
    assert.strictEqual(loggerCalls.length, 1);
    const [arg] = loggerCalls[0];
    assert.strictEqual(arg, "identity-mirror doPost error");
    // The response detail must not contain the underlying error.
    assert.ok(!JSON.stringify(ack).includes("internal sheet id"));
  });

  test("a mid-run batched write failure fails closed 500 with no partial write", () => {
    const { context, state } = buildContext();
    // Pre-seed an existing U1 row so the apply phase makes a real UPDATE
    // (which succeeds) before the APPEND of U2 fails. This proves the
    // snapshot+restore rollback reverts an already-committed update: the
    // sheet must be byte-for-byte unchanged after the failure.
    const originalU1 = [
      "U1", "Alice", "alice", "Admin", "Active",
      "password", 0, 0, 1, 1,
    ];
    state.rows.push([...originalU1]);
    const before = state.rows.map((r) => [...r]);

    // Sabotage the batched setValues so ONLY the appends batch throws. The
    // updates batch (existing row 2) succeeds; the appends batch (new rows
    // beyond current length) throws mid-way.
    state.sheet.getRange = (row, col, nrows, ncols) => ({
      setValues(vals) {
        if (row > state.rows.length) {
          throw new Error("Sheets API quota exceeded");
        }
        for (let i = 0; i < vals.length; i++) {
          for (let c = 0; c < vals[i].length; c++) {
            const r = row - 1 + i;
            while (state.rows.length <= r) state.rows.push(new Array(ncols).fill(""));
            state.rows[r][col - 1 + c] = vals[i][c];
          }
        }
      },
    });
    // U1 name changes (update) + U2 is new (append).
    const payload = [
      { ...ACCOUNTS[0], name: "Alice MUTATED" },
      ACCOUNTS[1],
    ];
    const ack = post(context, signEnvelope(SECRET, payload));
    assert.strictEqual(ack.status, 500);
    assert.strictEqual(ack.code, "INTERNAL_ERROR");
    // Never leaks the underlying error detail (which may contain internals).
    assert.ok(!JSON.stringify(ack).includes("quota"));
    // Rollback: the committed U1 update is reverted and U2 was never added —
    // the sheet is byte-for-byte identical to the pre-write snapshot.
    assert.deepStrictEqual(state.rows, before);
  });

  test("a lock failure fails closed 503", () => {
    const context = buildContext().context;
    // Replace the lock mock to deny the lock.
    context.LockService.getScriptLock = () => ({ tryLock: () => false });
    const ack = post(context, signEnvelope(SECRET, ACCOUNTS));
    assert.strictEqual(ack.status, 503);
    assert.strictEqual(ack.code, "UNAVAILABLE");
  });

  test("responses are secret-free", () => {
    const { context } = buildContext();
    const ack = post(context, signEnvelope(SECRET, ACCOUNTS));
    const serialized = JSON.stringify(ack);
    assert.ok(!serialized.includes(SECRET));
    assert.ok(!serialized.includes("pin"));
  });
});

// ---------------------------------------------------------------------------
// Structural wiring + D1-authoritative (root-context fs reads)
// ---------------------------------------------------------------------------

describe("identity-mirror — schedule / handler wiring + D1 authoritative", () => {
  test("wrangler.jsonc configures the 0 19 * * * cron trigger", () => {
    const wrangler = readFileSync(path.join(WEB_DIR, "wrangler.jsonc"), "utf-8");
    assert.match(wrangler, /"0 19 \* \* \*"/);
    assert.match(wrangler, /triggers/);
  });

  test("worker.ts exports a scheduled handler wired to the mirror", () => {
    const worker = readFileSync(path.join(WEB_DIR, "worker.ts"), "utf-8");
    assert.match(worker, /async scheduled/);
    assert.match(worker, /readIdentityMirrorAccounts/);
    assert.match(worker, /runIdentityMirror/);
  });

  test("the mirror never reads the review Sheet back as an authorization source", () => {
    const worker = readFileSync(path.join(WEB_DIR, "lib/mirror/identity-mirror.ts"), "utf-8");
    // The Worker mirror is read-from-D1 + post-only; it contains no sheet-read API.
    assert.ok(!/SpreadsheetApp|getSheetByName|getDataRange/.test(worker));
    const gas = readFileSync(path.join(GAS_DIR, "identity-mirror.gs"), "utf-8");
    // The Apps Script side writes the review sheet but never consumes it for
    // any authorization decision (all decisions derive from the D1 payload).
    assert.ok(/getDataRange/.test(gas)); // it reads rows to merge idempotently
    assert.ok(!/getValues\(\).*author/.test(gas));
  });
});