import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { describe, test } from "vitest";

const GAS_DIR = path.join(import.meta.dirname, "..", "..", "src", "gas");

function loadGasFile(context, filename) {
  vm.runInContext(
    readFileSync(path.join(GAS_DIR, filename), "utf-8"),
    context,
    { filename }
  );
}

describe("program-leaders-repository.gs - cache behavior", () => {
  test("caches missing-sheet result so spreadsheet is opened only once", () => {
    const openByIdCalls = [];
    const context = {
      console: { log: () => {} },
      SpreadsheetApp: {
        openById: () => {
          openByIdCalls.push(Date.now());
          return {
            getSheetByName: () => null,
          };
        },
      },
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (k) =>
            k === "EFCC_SPREADSHEET_ID"
              ? "1bkRPQTCrNKu4MNDTRn-vkTTRMKgV6MEBNfierKDng3o"
              : null,
        }),
      },
    };
    vm.createContext(context);
    loadGasFile(context, "spreadsheet-access.gs");
    loadGasFile(context, "program-leaders-repository.gs");

    const firstResult = context.programLeadersReadAll_();
    const secondResult = context.programLeadersReadAll_();

    assert.ok(Array.isArray(firstResult), "first result should be an array");
    assert.ok(Array.isArray(secondResult), "second result should be an array");
    assert.strictEqual(firstResult.length, 0, "first result should be empty");
    assert.strictEqual(secondResult.length, 0, "second result should be empty");
    assert.equal(
      openByIdCalls.length,
      1,
      "spreadsheet should be opened only once when sheet is missing (cache should prevent re-open)"
    );
  });
});
