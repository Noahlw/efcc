/**
 * Role-matrix navigation tests for issue #67.
 *
 * Covers:
 *   - Server-side capability computation for every role class.
 *   - Section ordering matches the agreed navigation matrix.
 *   - Program Leader detection from Program_Leaders sheet.
 *   - Combined-role union (STAFF + Program Leader) without duplicates.
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { describe, test, beforeEach } from "vitest";

const __dirname = import.meta.dirname;
const REPO_ROOT = path.join(__dirname, "..", "..");
const GAS_DIR = path.join(REPO_ROOT, "src", "gas");

// ---------------------------------------------------------------------------
// GAS mock harness (same pattern as login-and-bootstrap.test.js)
// ---------------------------------------------------------------------------

function fakeHmacBytes(value, salt) {
  const hmac = crypto.createHmac("sha256", salt);
  hmac.update(value);
  return [...hmac.digest()];
}

function buildContext({ salt = "test-salt" } = {}) {
  const sheets = {};
  const scriptProps = {
    EFCC_SESSION_SALT: salt,
    EFCC_SPREADSHEET_ID: "1bkRPQTCrNKu4MNDTRn-vkTTRMKgV6MEBNfierKDng3o",
  };

  const context = {
    sheets,
    console: { log: () => {} },
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: (name) => sheets[name] || null,
      }),
    },
    HtmlService: {
      createTemplateFromFile: () => ({
        evaluate: () => ({
          setTitle: () => ({}),
          addMetaTag: () => ({}),
          setXFrameOptionsMode: () => ({}),
        }),
      }),
      createHtmlOutputFromFile: () => ({ getContent: () => "" }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in scriptProps ? scriptProps[k] : null),
        setProperty: (k, v) => {
          scriptProps[k] = v;
        },
        deleteProperty: (k) => {
          // oxlint-disable-next-line typescript/no-dynamic-delete
          delete scriptProps[k];
        },
      }),
    },
    Utilities: {
      getUuid: (() => {
        let n = 0;
        return () => `uuid-${(n += 1)}`;
      })(),
      computeHmacSha256Signature: (value) => fakeHmacBytes(value, salt),
    },
  };

  vm.createContext(context);
  return { context, sheets, scriptProps };
}

function loadGasModule(context, filename) {
  const source = readFileSync(path.join(GAS_DIR, filename), "utf-8");
  vm.runInContext(source, context, { filename });
}

function loadAllGas(context) {
  for (const name of [
    "spreadsheet-access.gs",
    "rpc-envelope.gs",
    "users-repository.gs",
    "session.js.gs",
    "program-leaders-repository.gs",
    "Code.gs",
  ]) {
    loadGasModule(context, name);
  }
}

// ----------- helpers -----------

function makeUsersSheet(rows) {
  return [
    [
      "User_ID",
      "Name",
      "Username",
      "PIN_Code",
      "Phone",
      "Role",
      "Status",
      "QR_Code_String",
    ],
    ...rows,
  ];
}

function makeProgramLeadersSheet(rows) {
  return [
    [
      "Assignment_ID",
      "Program_ID",
      "User_ID",
      "Assigned_By",
      "Assigned_Date",
      "Status",
    ],
    ...rows,
  ];
}

function userRow(id, name, username, role, status = "Active") {
  return [id, name, username, "1234", "0000-0000", role, status, `QR-${id}`];
}

function sectionsToKeys(sections) {
  // Bridge the vm realm: convert to plain JS array so
  // assert.deepEqual works across the Node/vm boundary.
  const keys = [];
  for (const s of sections) {
    keys.push(String(s.key));
  }
  return keys;
}

// ----------- tests -----------

describe("Issue #67 — server-side capability computation", () => {
  let ctx;

  beforeEach(() => {
    const env = buildContext();
    ctx = env.context;
    loadAllGas(ctx);
  });

  // ----------------------------------------------------------------
  describe("MEMBER role", () => {
    test("returns Profile, Programs, Events only", () => {
      ctx.sheets["Users"] = {
        getDataRange: () => ({
          getValues: () =>
            makeUsersSheet([userRow("U-1", "Alice", "alice", "MEMBER")]),
        }),
      };
      const keys = sectionsToKeys(
        ctx.bootstrapSectionsForRole_("MEMBER", "U-1")
      );
      assert.deepEqual(keys, ["profile", "programs", "events"]);
    });

    test("does not include Scanner, Care, or Permissions", () => {
      ctx.sheets["Users"] = {
        getDataRange: () => ({
          getValues: () =>
            makeUsersSheet([userRow("U-1", "Alice", "alice", "MEMBER")]),
        }),
      };
      const keys = sectionsToKeys(
        ctx.bootstrapSectionsForRole_("MEMBER", "U-1")
      );
      assert.ok(!keys.includes("scanner"));
      assert.ok(!keys.includes("care"));
      assert.ok(!keys.includes("permissions"));
    });
  });

  // ----------------------------------------------------------------
  describe("Program Leader role", () => {
    test("active Program_Leaders → Profile, Programs, Events, Scanner", () => {
      ctx.sheets["Users"] = {
        getDataRange: () => ({
          getValues: () =>
            makeUsersSheet([userRow("U-1", "Bob", "bob", "MEMBER")]),
        }),
      };
      ctx.sheets["Program_Leaders"] = {
        getDataRange: () => ({
          getValues: () =>
            makeProgramLeadersSheet([
              ["A-1", "P-1", "U-1", "U-99", "2026-01-01", "Active"],
            ]),
        }),
      };
      const keys = sectionsToKeys(
        ctx.bootstrapSectionsForRole_("MEMBER", "U-1")
      );
      assert.deepEqual(keys, ["profile", "programs", "events", "scanner"]);
    });

    test("no Program_Leaders sheet → MEMBER sections", () => {
      ctx.sheets["Users"] = {
        getDataRange: () => ({
          getValues: () =>
            makeUsersSheet([userRow("U-1", "Bob", "bob", "MEMBER")]),
        }),
      };
      const keys = sectionsToKeys(
        ctx.bootstrapSectionsForRole_("MEMBER", "U-1")
      );
      assert.deepEqual(keys, ["profile", "programs", "events"]);
    });

    test("Revoked assignments only → MEMBER sections", () => {
      ctx.sheets["Users"] = {
        getDataRange: () => ({
          getValues: () =>
            makeUsersSheet([userRow("U-1", "Bob", "bob", "MEMBER")]),
        }),
      };
      ctx.sheets["Program_Leaders"] = {
        getDataRange: () => ({
          getValues: () =>
            makeProgramLeadersSheet([
              ["A-1", "P-1", "U-1", "U-99", "2026-01-01", "Revoked"],
            ]),
        }),
      };
      const keys = sectionsToKeys(
        ctx.bootstrapSectionsForRole_("MEMBER", "U-1")
      );
      assert.deepEqual(keys, ["profile", "programs", "events"]);
    });

    test("does not include Care or Permissions", () => {
      ctx.sheets["Users"] = {
        getDataRange: () => ({
          getValues: () =>
            makeUsersSheet([userRow("U-1", "Bob", "bob", "MEMBER")]),
        }),
      };
      ctx.sheets["Program_Leaders"] = {
        getDataRange: () => ({
          getValues: () =>
            makeProgramLeadersSheet([
              ["A-1", "P-1", "U-1", "U-99", "2026-01-01", "Active"],
            ]),
        }),
      };
      const keys = sectionsToKeys(
        ctx.bootstrapSectionsForRole_("MEMBER", "U-1")
      );
      assert.ok(!keys.includes("care"));
      assert.ok(!keys.includes("permissions"));
    });
  });

  // ----------------------------------------------------------------
  describe("STAFF role", () => {
    test("returns profile, programs, scanner, events, care, permissions", () => {
      ctx.sheets["Users"] = {
        getDataRange: () => ({
          getValues: () =>
            makeUsersSheet([userRow("U-1", "Carol", "carol", "STAFF")]),
        }),
      };
      const keys = sectionsToKeys(
        ctx.bootstrapSectionsForRole_("STAFF", "U-1")
      );
      assert.deepEqual(keys, [
        "profile",
        "programs",
        "scanner",
        "events",
        "care",
        "permissions",
      ]);
    });

    test("has no duplicate sections", () => {
      ctx.sheets["Users"] = {
        getDataRange: () => ({
          getValues: () =>
            makeUsersSheet([userRow("U-1", "Carol", "carol", "STAFF")]),
        }),
      };
      const keys = sectionsToKeys(
        ctx.bootstrapSectionsForRole_("STAFF", "U-1")
      );
      assert.equal(keys.length, new Set(keys).size);
    });
  });

  // ----------------------------------------------------------------
  describe("ADMIN role", () => {
    test("returns same sections as STAFF", () => {
      ctx.sheets["Users"] = {
        getDataRange: () => ({
          getValues: () =>
            makeUsersSheet([userRow("U-1", "Dave", "dave", "ADMIN")]),
        }),
      };
      const keys = sectionsToKeys(
        ctx.bootstrapSectionsForRole_("ADMIN", "U-1")
      );
      assert.deepEqual(keys, [
        "profile",
        "programs",
        "scanner",
        "events",
        "care",
        "permissions",
      ]);
    });
  });

  // ----------------------------------------------------------------
  describe("Combined roles (STAFF + Program Leader)", () => {
    test("STAFF + active Program_Leaders → no duplicate Scanner", () => {
      ctx.sheets["Users"] = {
        getDataRange: () => ({
          getValues: () =>
            makeUsersSheet([userRow("U-1", "Eve", "eve", "STAFF")]),
        }),
      };
      ctx.sheets["Program_Leaders"] = {
        getDataRange: () => ({
          getValues: () =>
            makeProgramLeadersSheet([
              ["A-1", "P-1", "U-1", "U-99", "2026-01-01", "Active"],
            ]),
        }),
      };
      const keys = sectionsToKeys(
        ctx.bootstrapSectionsForRole_("STAFF", "U-1")
      );
      assert.equal(
        keys.length,
        new Set(keys).size,
        "no duplicate sections for STAFF + PL"
      );
      assert.deepEqual(keys, [
        "profile",
        "programs",
        "scanner",
        "events",
        "care",
        "permissions",
      ]);
    });
  });

  // ----------------------------------------------------------------
  describe("Legacy / edge cases", () => {
    test("blank role → MEMBER sections", () => {
      ctx.sheets["Users"] = {
        getDataRange: () => ({
          getValues: () =>
            makeUsersSheet([userRow("U-1", "Frank", "frank", "")]),
        }),
      };
      const keys = sectionsToKeys(ctx.bootstrapSectionsForRole_("", "U-1"));
      assert.deepEqual(keys, ["profile", "programs", "events"]);
    });

    test("EVENT_LEADER role → MEMBER sections (legacy)", () => {
      ctx.sheets["Users"] = {
        getDataRange: () => ({
          getValues: () =>
            makeUsersSheet([userRow("U-1", "Grace", "grace", "EVENT_LEADER")]),
        }),
      };
      const keys = sectionsToKeys(
        ctx.bootstrapSectionsForRole_("EVENT_LEADER", "U-1")
      );
      assert.deepEqual(keys, ["profile", "programs", "events"]);
    });

    test("section objects have required key/label/capability fields", () => {
      ctx.sheets["Users"] = {
        getDataRange: () => ({
          getValues: () =>
            makeUsersSheet([userRow("U-1", "Alice", "alice", "STAFF")]),
        }),
      };
      const sections = ctx.bootstrapSectionsForRole_("STAFF", "U-1");
      for (const s of sections) {
        assert.ok(typeof s.key === "string" && s.key.length > 0);
        assert.ok(typeof s.label === "string" && s.label.length > 0);
        assert.ok(typeof s.capability === "string" && s.capability.length > 0);
      }
    });
  });
});
