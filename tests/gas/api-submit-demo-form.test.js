/**
 * api_submitDemoTaskForm RPC tests (issue #70 / #64 — form protection).
 *
 * Reuses the same auth-boundary harness as api_getPrograms
 * (sessionVerify_, userId match check without revoke, Active status
 * check). Validation and idempotency are tested after the auth
 * boundary per the contract (auth failures take precedence).
 *
 * This RPC does NOT read or write any Google Sheet — it is a pure
 * in-memory/CacheService demonstration.
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
    EFCC_SPREADSHEET_ID: "test-spreadsheet-id",
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
      formatDate: () => "2026-01-15 14:30:00",
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
    "rpc-envelope.gs",
    "spreadsheet-access.gs",
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

describe("api_submitDemoTaskForm — issue #70 form protection", () => {
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

  function submitForm(session, requestKey, fieldValue) {
    return env.context.api_submitDemoTaskForm(
      session.userId,
      session.sessionId,
      session.sessionToken,
      requestKey,
      fieldValue
    );
  }

  test("AUTH_REQUIRED for a bogus session", () => {
    loginAndGetSession();
    const res = env.context.api_submitDemoTaskForm(
      "U-1",
      "bogus-session-id",
      "bogus-token",
      "key-1",
      "hello"
    );
    assert.equal(res.success, false);
    assert.equal(res.error.code, "AUTH_REQUIRED");
  });

  test("AUTH_REQUIRED when userId does not match the verified session", () => {
    const session = loginAndGetSession();
    const res = env.context.api_submitDemoTaskForm(
      "someone-else",
      session.sessionId,
      session.sessionToken,
      "key-1",
      "hello"
    );
    assert.equal(res.success, false);
    assert.equal(res.error.code, "AUTH_REQUIRED");
  });

  test(
    "a mismatched-userId call does NOT revoke the legitimate session — " +
      "a subsequent valid call still succeeds",
    () => {
      const session = loginAndGetSession();
      // Attack / buggy-client call with forged userId but real session.
      const attack = env.context.api_submitDemoTaskForm(
        "someone-else",
        session.sessionId,
        session.sessionToken,
        "key-1",
        "hello"
      );
      assert.equal(attack.success, false);
      assert.equal(attack.error.code, "AUTH_REQUIRED");
      // The legitimate owner's subsequent call must still succeed,
      // proving the session was not revoked on mismatch.
      const legitimate = submitForm(session, "key-2", "hello");
      assert.equal(
        legitimate.success,
        true,
        "legitimate session must survive an unrelated userId-mismatch call"
      );
    }
  );

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
    const res = env.context.api_submitDemoTaskForm(
      session.userId,
      session.sessionId,
      session.sessionToken,
      "key-1",
      "hello"
    );
    assert.equal(res.success, false);
    assert.equal(res.error.code, "AUTH_REQUIRED");
  });

  test("VALIDATION for empty / whitespace-only fieldValue", () => {
    const session = loginAndGetSession();
    const res1 = submitForm(session, "key-1", "");
    assert.equal(res1.success, false);
    assert.equal(res1.error.code, "VALIDATION");
    assert.equal(res1.error.message, "請輸入範例欄位內容（1–200 字元）。");
    const res2 = submitForm(session, "key-2", "   ");
    assert.equal(res2.success, false);
    assert.equal(res2.error.code, "VALIDATION");
  });

  test("VALIDATION for fieldValue over 200 characters", () => {
    const session = loginAndGetSession();
    const long = "a".repeat(201);
    const res = submitForm(session, "key-1", long);
    assert.equal(res.success, false);
    assert.equal(res.error.code, "VALIDATION");
  });

  test("valid submission returns success with echoedValue trimmed and idempotent:false", () => {
    const session = loginAndGetSession();
    const res = submitForm(session, "key-1", "  hello world  ");
    assert.equal(res.success, true);
    assert.equal(typeof res.requestId, "string");
    // fieldValue should be trimmed.
    assert.equal(res.data.echoedValue, "hello world");
    // submittedAt is the fake date from the test Utilities stub.
    assert.equal(res.data.submittedAt, "2026-01-15 14:30:00");
    assert.equal(res.data.idempotent, false);
  });

  test(
    "a second call with the SAME requestKey and a different fieldValue " +
      "returns the original cached echoedValue with idempotent:true",
    () => {
      const session = loginAndGetSession();
      // First submission with "hello".
      const first = submitForm(session, "dup-key", "hello");
      assert.equal(first.success, true);
      assert.equal(first.data.echoedValue, "hello");
      assert.equal(first.data.idempotent, false);
      // Second submission with a DIFFERENT fieldValue but SAME key.
      const second = submitForm(session, "dup-key", "world");
      assert.equal(second.success, true);
      // Must return the ORIGINAL echoedValue, not "world".
      assert.equal(
        second.data.echoedValue,
        "hello",
        "idempotency must preserve the original echoedValue"
      );
      assert.equal(second.data.submittedAt, "2026-01-15 14:30:00");
      // Must be marked as idempotent (deduplicated).
      assert.equal(second.data.idempotent, true);
    }
  );

  test(
    "a call with a DIFFERENT requestKey executes fresh and is not " +
      "blocked by an unrelated cache entry",
    () => {
      const session = loginAndGetSession();
      // Submit with key "alpha".
      const alpha = submitForm(session, "alpha", "first-value");
      assert.equal(alpha.success, true);
      assert.equal(alpha.data.echoedValue, "first-value");
      assert.equal(alpha.data.idempotent, false);
      // Submit with a DIFFERENT key "beta".
      const beta = submitForm(session, "beta", "second-value");
      assert.equal(beta.success, true);
      assert.equal(beta.data.echoedValue, "second-value");
      // Must NOT be idempotent — it executed fresh against a
      // different cache key.
      assert.equal(beta.data.idempotent, false);
    }
  );

  test("INTERNAL_ERROR on an unexpected exception", () => {
    const session = loginAndGetSession();
    // Break CacheService to trigger an unexpected exception in the
    // idempotency-read path.
    env.context.CacheService.getScriptCache = () => {
      throw new Error("Simulated cache failure");
    };
    const res = submitForm(session, "key-1", "hello");
    assert.equal(res.success, false);
    assert.equal(res.error.code, "INTERNAL_ERROR");
    // Never expose the raw exception message to the user.
    assert.notEqual(res.error.message, "Simulated cache failure");
  });
});
