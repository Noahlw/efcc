/**
 * Programs repository tests (issue #69 prerequisite slice of #53).
 *
 * Scope: a minimal READ-ONLY Programs list. Per the grilled decision,
 * this repository does NOT read Enrollments and does NOT compute
 * isEnrolled — that is explicit #53 scope, not #69's. This file only
 * covers column resolution, empty-sheet handling, missing-Program_ID
 * row skipping, and the script-cache read-through per spec 004 §3/§5.
 *
 * Apps Script APIs exercised (see programs-repository.gs header for
 * citations): SpreadsheetApp.getActiveSpreadsheet(),
 * Sheet.getDataRange().getValues(), CacheService.getScriptCache().
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { describe, test, beforeEach } from "vitest";

const __dirname = import.meta.dirname;
const REPO_ROOT = path.join(__dirname, "..", "..");
const GAS_DIR = path.join(REPO_ROOT, "src", "gas");

function loadGasModule(context, filename) {
  const source = readFileSync(path.join(GAS_DIR, filename), "utf-8");
  vm.runInContext(source, context, { filename });
}

// Bridge the vm realm: vm.createContext() gives objects/arrays their
// own [[Prototype]] distinct from the outer Node realm's Object/Array
// prototypes, which makes node:assert/strict's deepEqual (aliased to
// deepStrictEqual) report "same structure but are not reference-equal"
// even when every field matches. A JSON round-trip produces fresh
// Node-realm objects for comparison. Same pattern as
// role-navigation.test.js's sectionsToKeys().
function toPlain(value) {
  return structuredClone(value);
}

function buildContext() {
  const sheets = {};
  const cacheStore = new Map();
  const cachePutCalls = [];
  const context = {
    sheets,
    console: { log: () => {} },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (name) => sheets[name] || null,
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (key) => (cacheStore.has(key) ? cacheStore.get(key) : null),
        put: (key, value, ttlSeconds) => {
          cacheStore.set(key, value);
          cachePutCalls.push({ key, value, ttlSeconds });
        },
        remove: (key) => {
          cacheStore.delete(key);
        },
      }),
    },
  };
  vm.createContext(context);
  return { context, sheets, cacheStore, cachePutCalls };
}

function makeProgramsSheet(rows) {
  return {
    getDataRange: () => ({
      getValues: () => [
        ["Program_ID", "Program_Name", "Type", "Description"],
        ...rows,
      ],
    }),
  };
}

describe("programs-repository.gs — issue #69 prerequisite slice of #53", () => {
  let ctx;
  let sheets;
  let cacheStore;
  let cachePutCalls;

  beforeEach(() => {
    const env = buildContext();
    ctx = env.context;
    ({ sheets, cacheStore, cachePutCalls } = env);
    loadGasModule(ctx, "programs-repository.gs");
    // Reset the in-memory cache guard the repository keeps to avoid
    // cross-test leakage of the CacheService.getScriptCache() read-through.
    ctx.programsResetForTesting_?.();
  });

  test("parses rows into id/name/type/description objects", () => {
    sheets.Programs = makeProgramsSheet([
      ["dd646847", "青崇", "Youth", "Youth worship service every Sunday 3pm"],
      ["ab123456", "查經班", "Bible Study", "Wednesday evening Bible study"],
    ]);
    const list = ctx.programsList_();
    assert.equal(list.length, 2);
    assert.deepEqual(toPlain(list[0]), {
      id: "dd646847",
      name: "青崇",
      type: "Youth",
      description: "Youth worship service every Sunday 3pm",
    });
    assert.deepEqual(toPlain(list[1]), {
      id: "ab123456",
      name: "查經班",
      type: "Bible Study",
      description: "Wednesday evening Bible study",
    });
  });

  test("skips rows with missing Program_ID", () => {
    sheets.Programs = makeProgramsSheet([
      ["dd646847", "青崇", "Youth", "desc"],
      ["", "Missing ID", "Youth", "desc"],
      ["ab123456", "查經班", "Bible Study", "desc"],
    ]);
    const list = ctx.programsList_();
    assert.equal(list.length, 2);
    assert.equal(list[0].id, "dd646847");
    assert.equal(list[1].id, "ab123456");
  });

  test("returns empty array when Programs sheet is missing", () => {
    // No sheets.Programs assigned.
    const list = ctx.programsList_();
    assert.deepEqual(toPlain(list), []);
  });

  test("returns empty array when sheet has header but no data rows", () => {
    sheets.Programs = makeProgramsSheet([]);
    const list = ctx.programsList_();
    assert.deepEqual(toPlain(list), []);
  });

  test("column resolution is header-name-based, order independent", () => {
    // Header order: Description, Program_ID, Program_Name, Type.
    // Row values are positioned to match THAT order, not the
    // canonical Program_ID-first order, so this test actually
    // exercises header-name resolution rather than accidentally
    // passing via positional coincidence.
    sheets.Programs = {
      getDataRange: () => ({
        getValues: () => [
          ["Description", "Program_ID", "Program_Name", "Type"],
          ["desc-text", "dd646847", "青崇", "Youth"],
        ],
      }),
    };
    const list = ctx.programsList_();
    assert.equal(list.length, 1);
    assert.deepEqual(toPlain(list[0]), {
      id: "dd646847",
      description: "desc-text",
      name: "青崇",
      type: "Youth",
    });
  });

  test("caches the parsed result via CacheService.getScriptCache() with a 300s TTL", () => {
    let getDataRangeCalls = 0;
    sheets.Programs = {
      getDataRange: () => {
        getDataRangeCalls += 1;
        return {
          getValues: () => [
            ["Program_ID", "Program_Name", "Type", "Description"],
            ["dd646847", "青崇", "Youth", "desc"],
          ],
        };
      },
    };
    const first = ctx.programsList_();
    assert.equal(first.length, 1);
    assert.equal(getDataRangeCalls, 1, "first call must read the sheet");
    // Cache should now hold the serialized result under the spec's key,
    // written with the spec-mandated 300-second TTL.
    assert.ok(cacheStore.has("programs_catalog_v1"));
    assert.equal(cachePutCalls.length, 1);
    assert.equal(cachePutCalls[0].key, "programs_catalog_v1");
    assert.equal(cachePutCalls[0].ttlSeconds, 300);

    // Reset the in-process memo (simulating a fresh Apps Script
    // execution/request) so the second call must go through
    // CacheService.get() rather than the in-memory guard. Do NOT
    // clear cacheStore — the cache entry must persist across
    // executions, which is the entire point of CacheService.
    ctx.programsResetForTesting_();

    // Mutate the sheet so a cache MISS would return a different
    // result. A cache HIT must return the OLD cached value and must
    // NOT call getDataRange again.
    sheets.Programs = makeProgramsSheet([]);
    const second = ctx.programsList_();
    assert.equal(
      second.length,
      1,
      "cache hit should return stale-but-cached data"
    );
    assert.equal(getDataRangeCalls, 1, "cache hit must not re-read the sheet");
    // The second call was a cache hit — no additional put.
    assert.equal(
      cachePutCalls.length,
      1,
      "cache hit must not re-write the cache"
    );
  });

  test("a corrupt cache entry falls back to a fresh sheet read", () => {
    sheets.Programs = makeProgramsSheet([
      ["dd646847", "青崇", "Youth", "desc"],
    ]);
    cacheStore.set("programs_catalog_v1", "{not valid json");
    const list = ctx.programsList_();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, "dd646847");
  });

  test("unexpected exception during sheet read propagates to the caller", () => {
    sheets.Programs = {
      getDataRange: () => {
        throw new Error("Simulated Sheets API failure");
      },
    };
    assert.throws(() => ctx.programsList_(), /Simulated Sheets API failure/u);
  });
});
