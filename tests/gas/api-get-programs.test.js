/**
 * api_getPrograms RPC tests (issue #69, prerequisite slice of #53).
 *
 * Scope: this RPC is a minimal READ-ONLY Programs list. It reuses the
 * same authenticated boundary as api_restoreApp/api_logoutUser —
 * (userId, sessionId, sessionToken) — because a bare userId parameter
 * could be forged from the browser. It returns
 * rpcSuccess_/rpcFailure_ per ADR-0003's accepted-in-principle
 * amendment (every existing public RPC already uses this envelope).
 *
 * Per the grilled decision, unexpected exceptions here return
 * RPC_CODES.INTERNAL_ERROR (not UNAVAILABLE, diverging deliberately
 * from api_loginUser/api_restoreApp/api_logoutUser's convention).
 *
 * This RPC does NOT read Enrollments and does NOT compute isEnrolled
 * — that is issue #53's scope.
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

function fakeHmacBytes(value, salt) {
  const h = crypto.createHmac("sha256", salt);
  h.update(value);
  return new Uint8Array(h.digest());
}

function buildContext({ salt = "test-salt" } = {}) {
  const sheets = {};
  const scriptProps = {
    EFCC_SESSION_SALT: salt,
    EFCC_SPREADSHEET_ID: "1bkRPQTCrNKu4MNDTRn-vkTTRMKgV6MEBNfierKDng3o",
  };
  const cacheStore = new Map();
  const context = {
    console: { log: () => {} },
    sheets,
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: (name) => sheets[name] || null,
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (key) => (cacheStore.has(key) ? cacheStore.get(key) : null),
        put: (key, value) => {
          cacheStore.set(key, value);
        },
        remove: (key) => {
          cacheStore.delete(key);
        },
      }),
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
  return { context, sheets, scriptProps, cacheStore };
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
    "programs-repository.gs",
    "Code.gs",
  ]) {
    loadGasModule(context, name);
  }
}

function makeUsersSheet(rows) {
  const header = [
    "User_ID",
    "Name",
    "Username",
    "PIN_Code",
    "Phone",
    "Role",
    "Status",
    "QR_Code_String",
  ];
  const data = [header];
  for (const r of rows) {
    data.push([
      r.userId,
      r.name || "",
      r.username,
      r.pinCode,
      r.phone || "",
      r.role || "MEMBER",
      r.status || "Active",
      r.qrCodeString || r.userId,
    ]);
  }
  return data;
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

describe("api_getPrograms — issue #69 prerequisite slice of #53", () => {
  let env;

  beforeEach(() => {
    env = buildContext({ salt: "test-salt" });
  });

  function loginAndGetSession(role = "MEMBER") {
    const users = makeUsersSheet([
      {
        userId: "U-1",
        name: "Alice",
        username: "alice",
        pinCode: "1234",
        role,
        status: "Active",
      },
    ]);
    env.sheets.Users = { getDataRange: () => ({ getValues: () => users }) };
    loadAllGas(env.context);
    const login = env.context.api_loginUser("alice", "1234");
    assert.equal(login.success, true, "test setup: login must succeed");
    return login.data.session;
  }

  test("returns rpcSuccess envelope with Programs list for a valid session", () => {
    const session = loginAndGetSession();
    env.sheets.Programs = makeProgramsSheet([
      ["dd646847", "青崇", "Youth", "Youth worship service"],
    ]);
    const res = env.context.api_getPrograms(
      session.userId,
      session.sessionId,
      session.sessionToken
    );
    assert.equal(res.success, true);
    assert.equal(typeof res.requestId, "string");
    assert.equal(res.data.length, 1);
    assert.equal(res.data[0].id, "dd646847");
    assert.equal(res.data[0].name, "青崇");
  });

  test("available to every active authenticated role (MEMBER/STAFF/ADMIN)", () => {
    for (const role of ["MEMBER", "STAFF", "ADMIN"]) {
      env = buildContext({ salt: "test-salt" });
      const session = loginAndGetSession(role);
      env.sheets.Programs = makeProgramsSheet([
        ["dd646847", "青崇", "Youth", "desc"],
      ]);
      const res = env.context.api_getPrograms(
        session.userId,
        session.sessionId,
        session.sessionToken
      );
      assert.equal(
        res.success,
        true,
        `role ${role} must be able to read Programs`
      );
    }
  });

  test("returns empty array success (not a failure) when Programs sheet has no rows", () => {
    const session = loginAndGetSession();
    env.sheets.Programs = makeProgramsSheet([]);
    const res = env.context.api_getPrograms(
      session.userId,
      session.sessionId,
      session.sessionToken
    );
    assert.equal(res.success, true);
    assert.deepEqual(structuredClone(res.data), []);
  });

  test("AUTH_REQUIRED for a bogus session", () => {
    loginAndGetSession();
    const res = env.context.api_getPrograms(
      "U-1",
      "bogus-session-id",
      "bogus-token"
    );
    assert.equal(res.success, false);
    assert.equal(res.error.code, "AUTH_REQUIRED");
  });

  test("AUTH_REQUIRED when userId does not match the verified session", () => {
    const session = loginAndGetSession();
    const res = env.context.api_getPrograms(
      "someone-else",
      session.sessionId,
      session.sessionToken
    );
    assert.equal(res.success, false);
    assert.equal(res.error.code, "AUTH_REQUIRED");
  });

  test("a mismatched-userId call does NOT revoke the legitimate session — a subsequent valid call still succeeds", () => {
    const session = loginAndGetSession();
    env.sheets.Programs = makeProgramsSheet([
      ["dd646847", "青崇", "Youth", "desc"],
    ]);
    // Attacker/buggy-client call with a forged userId but the real
    // sessionId + sessionToken. Per the SECURITY NOTE in Code.gs,
    // this must fail WITHOUT revoking the underlying session.
    const attack = env.context.api_getPrograms(
      "someone-else",
      session.sessionId,
      session.sessionToken
    );
    assert.equal(attack.success, false);
    assert.equal(attack.error.code, "AUTH_REQUIRED");
    // The legitimate owner's subsequent call with the SAME session
    // must still succeed — proving the session was not revoked.
    const legitimate = env.context.api_getPrograms(
      session.userId,
      session.sessionId,
      session.sessionToken
    );
    assert.equal(
      legitimate.success,
      true,
      "legitimate session must survive an unrelated userId-mismatch call"
    );
  });

  test("AUTH_REQUIRED when the user has been deactivated since the session was issued", () => {
    const session = loginAndGetSession();
    // Deactivate the user Sheet-side.
    const users = makeUsersSheet([
      {
        userId: "U-1",
        name: "Alice",
        username: "alice",
        pinCode: "1234",
        role: "MEMBER",
        status: "Inactive",
      },
    ]);
    env.sheets.Users = { getDataRange: () => ({ getValues: () => users }) };
    env.context.usersSetRowsForTesting_(users);
    const res = env.context.api_getPrograms(
      session.userId,
      session.sessionId,
      session.sessionToken
    );
    assert.equal(res.success, false);
    assert.equal(res.error.code, "AUTH_REQUIRED");
  });

  test("INTERNAL_ERROR (not UNAVAILABLE) on an unexpected repository exception", () => {
    const session = loginAndGetSession();
    env.sheets.Programs = {
      getDataRange: () => {
        throw new Error("Simulated Sheets API failure");
      },
    };
    const res = env.context.api_getPrograms(
      session.userId,
      session.sessionId,
      session.sessionToken
    );
    assert.equal(res.success, false);
    assert.equal(
      res.error.code,
      "INTERNAL_ERROR",
      "must use INTERNAL_ERROR per the grilled decision, not UNAVAILABLE"
    );
    // Never expose the raw exception message to the user.
    assert.notEqual(res.error.message, "Simulated Sheets API failure");
  });

  test("does not touch the Enrollments sheet or return isEnrolled", () => {
    const session = loginAndGetSession();
    env.sheets.Programs = makeProgramsSheet([
      ["dd646847", "青崇", "Youth", "desc"],
    ]);
    // Deliberately leave Enrollments undefined/unset to prove this
    // RPC never reads it.
    const res = env.context.api_getPrograms(
      session.userId,
      session.sessionId,
      session.sessionToken
    );
    assert.equal(res.success, true);
    assert.equal(Object.hasOwn(res.data[0], "isEnrolled"), false);
  });
});
