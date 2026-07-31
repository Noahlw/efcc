import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { describe, test } from "vitest";

const GAS_DIR = path.join(import.meta.dirname, "..", "..", "src", "gas");
const DEV_SPREADSHEET_ID = "1bkRPQTCrNKu4MNDTRn-vkTTRMKgV6MEBNfierKDng3o";

function loadGasFile(context, filename) {
  vm.createContext(context);
  vm.runInContext(
    readFileSync(path.join(GAS_DIR, filename), "utf-8"),
    context,
    { filename }
  );
}

function makeMockContext(spreadsheetId) {
  const openedIds = [];
  const openedSpreadsheet = { marker: "DEV spreadsheet" };
  const context = {
    SpreadsheetApp: {
      openById: (id) => {
        openedIds.push(id);
        return openedSpreadsheet;
      },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => {
          if (key === "EFCC_SPREADSHEET_ID") {return spreadsheetId;}
          return null;
        },
      }),
    },
  };
  return { context, openedIds, openedSpreadsheet };
}

describe("spreadsheet-access.gs", () => {
  test("reads EFCC_SPREADSHEET_ID from Script Properties and opens by ID", () => {
    const { context, openedIds, openedSpreadsheet } =
      makeMockContext(DEV_SPREADSHEET_ID);
    loadGasFile(context, "spreadsheet-access.gs");

    assert.equal(context.efccSpreadsheet_(), openedSpreadsheet);
    assert.deepEqual(openedIds, [DEV_SPREADSHEET_ID]);
  });

  test("throws a clear error with setup instructions when Script Property is absent", () => {
    const { context } = makeMockContext(null);
    loadGasFile(context, "spreadsheet-access.gs");

    assert.throws(() => context.efccSpreadsheet_(), /EFCC_SPREADSHEET_ID/u);
  });

  test("throws when Script Property is empty string", () => {
    const { context } = makeMockContext("");
    loadGasFile(context, "spreadsheet-access.gs");

    assert.throws(() => context.efccSpreadsheet_(), /EFCC_SPREADSHEET_ID/u);
  });
});

describe("resolveColumnsByCandidates_", () => {
  function loadFresh(spreadsheetId = DEV_SPREADSHEET_ID) {
    const { context } = makeMockContext(spreadsheetId);
    loadGasFile(context, "spreadsheet-access.gs");
    return context;
  }

  test("matches header exactly and returns {key: index} map", () => {
    const context = loadFresh();
    const result = context.resolveColumnsByCandidates_(
      ["User_ID", "Name"],
      { ID: ["User_ID"], NAME: ["Name"] }
    );
    assert.equal(result.ID, 0);
    assert.equal(result.NAME, 1);
  });

  test("matches case-insensitively and accepts the first matching candidate", () => {
    const context = loadFresh();
    const result = context.resolveColumnsByCandidates_(
      ["user_id"],
      { ID: ["User_ID", "UserID"] }
    );
    assert.equal(result.ID, 0);
  });

  test("throws with a message listing candidates when a key has no match", () => {
    const context = loadFresh();
    assert.throws(
      () =>
        context.resolveColumnsByCandidates_(
          ["x"],
          { ID: ["User_ID", "UserID"] }
        ),
      /Expected one of: User_ID \/ UserID/u
    );
  });

  test("returns a plain object (not array)", () => {
    const context = loadFresh();
    const result = context.resolveColumnsByCandidates_(
      ["A"],
      { K: ["A"] }
    );
    assert.equal(Array.isArray(result), false);
    assert.equal(typeof result, "object");
  });
});
