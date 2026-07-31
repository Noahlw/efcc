/**
 * requireActiveSession_ unit tests.
 *
 * Per docs/superpowers/plans/2026-07-31-overengineering-cuts.md Task 3:
 * the helper centralises the 3-branch auth boundary
 * (verify -> userId-mismatch -> active-user) shared by api_restoreApp,
 * api_getPrograms, api_authorizedNavigate, api_submitDemoTaskForm.
 *
 * Deliberate behavior to preserve:
 *   - All three failure branches return the SAME RpcFailure
 *     (AUTH_REQUIRED / "工作階段已過期，請重新登入").
 *   - `revokeOnUserIdMismatch: true` -> sessionRevoke_ IS called on
 *     userId mismatch (api_restoreApp).
 *   - `revokeOnUserIdMismatch: false` -> sessionRevoke_ is NOT called
 *     on userId mismatch (api_getPrograms / api_authorizedNavigate /
 *     api_submitDemoTaskForm) — see SECURITY NOTE in Code.gs.
 *   - sessionRevoke_ IS called on !verification.ok and on inactive
 *     user in all variants.
 *   - The helper does NOT try/catch — exceptions propagate.
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

function buildContext() {
  const context = {
    console: { log: () => {}, error: () => {} },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => null }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: () => null,
        setProperty: () => {},
        deleteProperty: () => {},
      }),
    },
    Utilities: { getUuid: () => "uuid-test", computeHmacSha256Signature: () => new Uint8Array(32) },
  };
  vm.createContext(context);
  return context;
}

function makeSpies() {
  return {
    sessionVerify_: () => ({ ok: true, userId: "u1", issuedAt: 0 }),
    usersFindById_: () => ({ userId: "u1", status: "Active" }),
    sessionRevoke_: () => {},
    rpcLogCalls_: [],
  };
}

function installSpies(context, spies) {
  context.rpcLog_ = (op, requestId, outcome, durationMs) => {
    spies.rpcLogCalls_.push({ op, requestId, outcome, durationMs });
  };
  context.sessionVerify_ = spies.sessionVerify_;
  context.usersFindById_ = spies.usersFindById_;
  context.sessionRevoke_ = spies.sessionRevoke_;
}

describe("requireActiveSession_", () => {
  let context;
  let spies;

  beforeEach(() => {
    context = buildContext();
    loadGasModule(context, "rpc-envelope.gs");
    loadGasModule(context, "session.js.gs");
    spies = makeSpies();
    installSpies(context, spies);
  });

  test("verify ok + active user -> returns {ok:true, user}; no revoke; no log", () => {
    const result = context.requireActiveSession_(
      "api_x",
      "rid-1",
      100,
      "u1",
      "sid",
      "tok",
      { revokeOnUserIdMismatch: false }
    );
    assert.equal(result.ok, true);
    assert.equal(result.user.userId, "u1");
    assert.equal(result.user.status, "Active");
    assert.equal(spies.rpcLogCalls_.length, 0, "helper must not log on the success path");
  });

  test("verify !ok -> {ok:false, AUTH_REQUIRED, msg}; revoke called once", () => {
    let revokeCalls = 0;
    spies.sessionVerify_ = () => ({ ok: false, reason: "BAD_TOKEN" });
    spies.sessionRevoke_ = () => { revokeCalls += 1; };
    installSpies(context, spies);
    const result = context.requireActiveSession_(
      "api_x",
      "rid-2",
      100,
      "u1",
      "sid",
      "tok",
      { revokeOnUserIdMismatch: false }
    );
    assert.equal(result.ok, false);
    assert.equal(result.failure.success, false);
    assert.equal(result.failure.error.code, "AUTH_REQUIRED");
    assert.equal(result.failure.error.message, "工作階段已過期，請重新登入");
    assert.equal(revokeCalls, 1);
    const badLog = spies.rpcLogCalls_.find((l) => l.outcome === "BAD_TOKEN");
    assert.ok(badLog, "expected a BAD_TOKEN log line");
  });

  test("userId mismatch + revokeOnUserIdMismatch:true -> revoke called once; AUTH_REQUIRED", () => {
    let revokeCalls = 0;
    spies.sessionVerify_ = () => ({ ok: true, userId: "u-actual", issuedAt: 0 });
    spies.sessionRevoke_ = () => { revokeCalls += 1; };
    installSpies(context, spies);
    const result = context.requireActiveSession_(
      "api_restoreApp",
      "rid-3",
      100,
      "u-claimed",
      "sid",
      "tok",
      { revokeOnUserIdMismatch: true }
    );
    assert.equal(result.ok, false);
    assert.equal(result.failure.error.code, "AUTH_REQUIRED");
    assert.equal(revokeCalls, 1, "revoke must be called on mismatch when flag is true");
  });

  test("userId mismatch + revokeOnUserIdMismatch:false -> revoke NOT called; AUTH_REQUIRED", () => {
    let revokeCalls = 0;
    spies.sessionVerify_ = () => ({ ok: true, userId: "u-actual", issuedAt: 0 });
    spies.sessionRevoke_ = () => { revokeCalls += 1; };
    installSpies(context, spies);
    const result = context.requireActiveSession_(
      "api_getPrograms",
      "rid-4",
      100,
      "u-claimed",
      "sid",
      "tok",
      { revokeOnUserIdMismatch: false }
    );
    assert.equal(result.ok, false);
    assert.equal(result.failure.error.code, "AUTH_REQUIRED");
    assert.equal(result.failure.error.message, "工作階段已過期，請重新登入");
    assert.equal(revokeCalls, 0, "revoke must NOT be called on mismatch when flag is false");
  });

  test("inactive user -> revoke called once; AUTH_REQUIRED; FORBIDDEN log", () => {
    let revokeCalls = 0;
    spies.usersFindById_ = () => ({ userId: "u1", status: "Inactive" });
    spies.sessionRevoke_ = () => { revokeCalls += 1; };
    installSpies(context, spies);
    const result = context.requireActiveSession_(
      "api_x",
      "rid-5",
      100,
      "u1",
      "sid",
      "tok",
      { revokeOnUserIdMismatch: false }
    );
    assert.equal(result.ok, false);
    assert.equal(result.failure.error.code, "AUTH_REQUIRED");
    assert.equal(result.failure.error.message, "工作階段已過期，請重新登入");
    assert.equal(revokeCalls, 1);
    const forbiddenLog = spies.rpcLogCalls_.find((l) => l.outcome === "FORBIDDEN");
    assert.ok(forbiddenLog, "expected a FORBIDDEN log line for inactive user");
  });
});
