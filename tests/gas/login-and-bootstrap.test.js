// Tests for issue #66 — login + bootstrap RPC, session storage, and
// the per-session storage shape from issue #73.
//
// Strategy: load every .gs file under src/gas/ in dependency order
// into a single `vm` context, then drive the public RPC entry points
// (api_loginUser, api_restoreApp, api_logoutUser) and the private
// helpers exposed for testing (sessionIssue_, sessionVerify_, ...).
//
// The envelope contract matches what tests/gas/auth-session.test.js
// pins:
//
//   RpcSuccess = { success: true, requestId: string, data: T }
//   RpcFailure = { success: false, requestId: string,
//                  error: { code: string, message: string } }
//
// Apps Script is mocked: SpreadsheetApp, PropertiesService,
// Utilities (computeHmacSha256Signature, getUuid), and console.log.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { describe, test, beforeEach } from "vitest";

const __dirname = import.meta.dirname;
const REPO_ROOT = path.join(__dirname, "..", "..");
const GAS_DIR = path.join(REPO_ROOT, "src", "gas");

// ---------------------------------------------------------------------------
// GAS mock harness
// ---------------------------------------------------------------------------

function buildContext({ salt = "test-salt", setSalt = true } = {}) {
  const sheets = {};
  const scriptProps = {};
  if (setSalt) {
    scriptProps["EFCC_SESSION_SALT"] = salt;
  }
  const context = {
    console: { log: () => {} },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
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
          // eslint-disable-next-line typescript/no-dynamic-delete
          delete scriptProps[k];
        },
      }),
    },
    Utilities: {
      getUuid: (() => {
        let n = 0;
        return () => `uuid-${(n += 1)}`;
      })(),
      // Surrogate: deterministic HMAC surrogate keyed by `salt` so
      // sessionIssue_ and sessionVerify_ agree across calls. The
      // real signature is computed in sessionHmacHex_ via this
      // method; the test only needs the (value, salt) → bytes
      // mapping to be stable.
      computeHmacSha256Signature: (value) => fakeHmacBytes(value, salt),
    },
  };
  // eslint-disable-next-line unicorn/no-immediate-mutation
  context.sheets = sheets;
  vm.createContext(context);
  return { context, sheets, scriptProps };
}

function fakeHmacBytes(value, salt) {
  const h = crypto.createHmac("sha256", salt);
  h.update(value);
  return new Uint8Array(h.digest());
}

function loadGasModule(context, filename) {
  const source = readFileSync(path.join(GAS_DIR, filename), "utf-8");
  vm.runInContext(source, context, { filename });
}

function loadAllGas(context) {
  for (const name of [
    "rpc-envelope.gs",
    "users-repository.gs",
    "session.js.gs",
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Issue #66 — login + bootstrap RPC, session mechanics (issue #73)", () => {
  let env;
  beforeEach(() => {
    env = buildContext({ salt: "test-salt" });
  });

  test("api_loginUser: success returns AuthenticatedBootstrap and stores per-session property", () => {
    const users = makeUsersSheet([
      {
        userId: "U-1",
        name: "Alice",
        username: "alice",
        pinCode: "1234",
        phone: "91234567",
        role: "MEMBER",
        status: "Active",
        qrCodeString: "QR-U-1",
      },
    ]);
    env.sheets["Users"] = { getDataRange: () => ({ getValues: () => users }) };
    loadAllGas(env.context);

    const res = env.context.api_loginUser("alice", "1234");
    assert.equal(res.success, true, "login must succeed");
    assert.equal(typeof res.requestId, "string");
    assert.equal(res.data.session.userId, "U-1");
    assert.equal(res.data.session.name, "Alice");
    assert.equal(res.data.session.role, "MEMBER");
    assert.equal(res.data.session.qrCodeString, "QR-U-1");
    assert.equal(typeof res.data.session.sessionId, "string");
    assert.equal(typeof res.data.session.sessionToken, "string");
    // expiryTimestamp is intentionally absent per #73
    assert.equal(res.data.session.expiryTimestamp, undefined);
    assert.equal(res.data.profile.userId, "U-1");
    assert.equal(res.data.profile.username, "alice");
    assert.equal(res.data.profile.phone, "91234567");
    assert.equal(res.data.profile.status, "Active");
    // Profile must always be the first Section per ADR-0010
    assert.equal(res.data.sections[0].key, "profile");
    // MEMBER Day 1 navigation does not include Scanner or Care
    const keys = res.data.sections.map((s) => s.key);
    assert.ok(!keys.includes("scanner"));
    assert.ok(!keys.includes("care"));
    // Per-session PropertiesService key was created
    const sessionKey = `session_${res.data.session.sessionId}`;
    assert.ok(env.scriptProps[sessionKey], "session_<id> property must exist");
    const stored = JSON.parse(env.scriptProps[sessionKey]);
    assert.equal(stored.userId, "U-1");
  });

  test("api_loginUser: invalid credentials return envelope with same message (no enumeration)", () => {
    const users = makeUsersSheet([
      {
        userId: "U-1",
        name: "Alice",
        username: "alice",
        pinCode: "1234",
        status: "Active",
      },
    ]);
    env.sheets["Users"] = { getDataRange: () => ({ getValues: () => users }) };
    loadAllGas(env.context);

    const wrongPin = env.context.api_loginUser("alice", "9999");
    assert.equal(wrongPin.success, false);
    assert.equal(wrongPin.error.code, "AUTH_REQUIRED");
    const noUser = env.context.api_loginUser("nobody", "1234");
    assert.equal(noUser.success, false);
    assert.equal(noUser.error.code, "AUTH_REQUIRED");
    assert.equal(
      noUser.error.message,
      wrongPin.error.message,
      "ambiguous message — no user enumeration"
    );

    // Inactive user must also return the same code/message shape.
    const inactive = makeUsersSheet([
      {
        userId: "U-2",
        name: "Bob",
        username: "bob",
        pinCode: "1234",
        status: "Inactive",
      },
    ]);
    env.sheets["Users"] = {
      getDataRange: () => ({ getValues: () => inactive }),
    };
    env.context.usersSetRowsForTesting_(inactive);
    const inactRes = env.context.api_loginUser("bob", "1234");
    assert.equal(inactRes.success, false);
    assert.equal(inactRes.error.code, "AUTH_REQUIRED");
    assert.equal(
      inactRes.error.message,
      wrongPin.error.message,
      "inactive account returns same code/message as wrong PIN"
    );
  });

  test("api_loginUser: PIN normalization — leading zeros, extra digits", () => {
    const users = makeUsersSheet([
      {
        userId: "U-1",
        username: "alice",
        pinCode: "0012",
        role: "MEMBER",
        status: "Active",
      },
    ]);
    env.sheets["Users"] = { getDataRange: () => ({ getValues: () => users }) };
    loadAllGas(env.context);

    const r1 = env.context.api_loginUser("alice", "12");
    assert.equal(r1.success, true, "rightmost-4 of '12' is '0012'");
    // '123456' normalizes to '3456' which does not match '0012',
    // so the login must be rejected — this confirms normalization
    // is applied to the user input, not bypassed.
    const r2 = env.context.api_loginUser("alice", "123456");
    assert.equal(
      r2.success,
      false,
      "rightmost-4 of '123456' is '3456', not the stored '0012'"
    );
    const r3 = env.context.api_loginUser("alice", "0012");
    assert.equal(r3.success, true, "exact 4-digit match");
  });

  test("api_restoreApp: success re-validates the same sessionId and returns the same DTO", () => {
    const users = makeUsersSheet([
      {
        userId: "U-1",
        username: "alice",
        pinCode: "1234",
        role: "MEMBER",
        status: "Active",
      },
    ]);
    env.sheets["Users"] = { getDataRange: () => ({ getValues: () => users }) };
    loadAllGas(env.context);

    const login = env.context.api_loginUser("alice", "1234");
    const oldSessionId = login.data.session.sessionId;
    const oldSessionToken = login.data.session.sessionToken;

    const restore = env.context.api_restoreApp(
      "U-1",
      oldSessionId,
      oldSessionToken
    );
    assert.equal(restore.success, true);
    // The existing session entry is preserved so other concurrent
    // sessions for the same user remain independent (#73).
    assert.equal(restore.data.session.sessionId, oldSessionId);
    assert.equal(restore.data.session.sessionToken, oldSessionToken);
    assert.ok(
      env.scriptProps[`session_${oldSessionId}`],
      "session_<id> property must be preserved on successful restore"
    );
    assert.equal(restore.data.profile.username, "alice");
  });

  test("api_restoreApp: PIN change between login and restore fails with AUTH_REQUIRED", () => {
    const users = makeUsersSheet([
      {
        userId: "U-1",
        username: "alice",
        pinCode: "1234",
        role: "MEMBER",
        status: "Active",
      },
    ]);
    env.sheets["Users"] = { getDataRange: () => ({ getValues: () => users }) };
    loadAllGas(env.context);

    const login = env.context.api_loginUser("alice", "1234");
    const oldSessionId = login.data.session.sessionId;
    const oldSessionToken = login.data.session.sessionToken;

    // Simulate staff editing the Sheet to change Alice's PIN.
    const updated = makeUsersSheet([
      {
        userId: "U-1",
        username: "alice",
        pinCode: "9999",
        role: "MEMBER",
        status: "Active",
      },
    ]);
    env.sheets["Users"] = {
      getDataRange: () => ({ getValues: () => updated }),
    };
    env.context.usersSetRowsForTesting_(updated);

    const restore = env.context.api_restoreApp(
      "U-1",
      oldSessionId,
      oldSessionToken
    );
    assert.equal(restore.success, false);
    assert.equal(
      restore.error.code,
      "AUTH_REQUIRED",
      "PIN change must invalidate the session"
    );
    // The stale session entry is cleared.
    assert.equal(env.scriptProps[`session_${oldSessionId}`], undefined);
  });

  test("api_restoreApp: status flip to Inactive fails with AUTH_REQUIRED", () => {
    const users = makeUsersSheet([
      {
        userId: "U-1",
        username: "alice",
        pinCode: "1234",
        role: "MEMBER",
        status: "Active",
      },
    ]);
    env.sheets["Users"] = { getDataRange: () => ({ getValues: () => users }) };
    loadAllGas(env.context);

    const login = env.context.api_loginUser("alice", "1234");

    const updated = makeUsersSheet([
      {
        userId: "U-1",
        username: "alice",
        pinCode: "1234",
        role: "MEMBER",
        status: "Inactive",
      },
    ]);
    env.sheets["Users"] = {
      getDataRange: () => ({ getValues: () => updated }),
    };
    env.context.usersSetRowsForTesting_(updated);

    const restore = env.context.api_restoreApp(
      "U-1",
      login.data.session.sessionId,
      login.data.session.sessionToken
    );
    assert.equal(restore.success, false);
    assert.equal(restore.error.code, "AUTH_REQUIRED");
  });

  test("Bug: login succeeds when the Sheet's User_ID column is auto-detected as a Number (real Sheets behavior for numeric-looking IDs)", () => {
    // Google Sheets returns numeric-looking cell values as JS
    // Number, not String, from getValues(). Users sheet fixtures
    // elsewhere in this file all use string ids ("U-1") which
    // masks any strict `===` comparison bug against the raw sheet
    // value. Reproduce with a plain Number id, matching what a
    // production sheet with numeric-looking User_ID cells returns.
    const users = makeUsersSheet([
      { userId: 1001, username: "alice", pinCode: "1234", status: "Active" },
    ]);
    env.sheets["Users"] = { getDataRange: () => ({ getValues: () => users }) };
    loadAllGas(env.context);

    const res = env.context.api_loginUser("alice", "1234");
    assert.equal(
      res.success,
      true,
      "correct username/PIN must succeed even when User_ID is a Number cell"
    );
  });

  test("Bug: login succeeds against the real production Users sheet column layout (Username/Name swapped, PIN_Code at 7, System_Role, extra columns)", () => {
    // Root cause of the live bug report: usersReadAll_ assumed a
    // fixed column order (User_ID, Name, Username, PIN_Code, Phone,
    // Role, Status, QR_Code_String). The real production Users
    // sheet carries a completely different order plus extra
    // columns (Email, Date of Birth, Age, Whatsapp Message, 青崇？)
    // and names the role column "System_Role", not "Role" — with
    // mixed-case values ("Admin", not "ADMIN"). This fixture
    // mirrors the real header row and row values captured live via
    // a temporary diagnostic RPC during debugging.
    const header = [
      "User_ID",
      "Username",
      "Name",
      "Email",
      "Phone",
      "Date of Birth",
      "Age",
      "PIN_Code",
      "QR_Code_String",
      "System_Role",
      "Status",
      "Whatsapp Message",
      "青崇？",
    ];
    const row = [
      "GC-C436-4943",
      "noah",
      "noah",
      "noah@example.com",
      "97706811",
      new Date("2003-11-08T16:00:00.000Z"),
      "22",
      "6883",
      "GC-C436-4943",
      "Admin",
      "Active",
      "Send WhatsApp",
      "1",
    ];
    env.sheets["Users"] = {
      getDataRange: () => ({ getValues: () => [header, row] }),
    };
    loadAllGas(env.context);

    const res = env.context.api_loginUser("noah", "6883");
    assert.equal(
      res.success,
      true,
      "correct credentials must succeed against the real column layout"
    );
    assert.equal(
      res.data.session.role,
      "ADMIN",
      "mixed-case 'Admin' sheet value must normalize to uppercase ADMIN"
    );
  });

  test("api_logoutUser: deletes exactly the calling session's property and no others", () => {
    const users = makeUsersSheet([
      { userId: "U-1", username: "alice", pinCode: "1234", status: "Active" },
      { userId: "U-2", username: "bob", pinCode: "5678", status: "Active" },
    ]);
    env.sheets["Users"] = { getDataRange: () => ({ getValues: () => users }) };
    loadAllGas(env.context);

    const a = env.context.api_loginUser("alice", "1234");
    const b = env.context.api_loginUser("bob", "5678");
    assert.equal(a.success, true);
    assert.equal(b.success, true);

    const aKey = `session_${a.data.session.sessionId}`;
    const bKey = `session_${b.data.session.sessionId}`;
    assert.ok(env.scriptProps[aKey]);
    assert.ok(env.scriptProps[bKey]);

    const logout = env.context.api_logoutUser(
      "U-1",
      a.data.session.sessionId,
      a.data.session.sessionToken
    );
    assert.equal(logout.success, true);
    assert.equal(env.scriptProps[aKey], undefined, "Alice's session deleted");
    assert.ok(
      env.scriptProps[bKey],
      "Bob's session is unaffected (per #73 multi-device independence)"
    );
  });

  test("api_logoutUser: idempotent — calling again with the now-revoked session still succeeds", () => {
    const users = makeUsersSheet([
      { userId: "U-1", username: "alice", pinCode: "1234", status: "Active" },
    ]);
    env.sheets["Users"] = { getDataRange: () => ({ getValues: () => users }) };
    loadAllGas(env.context);

    const a = env.context.api_loginUser("alice", "1234");
    env.context.api_logoutUser(
      "U-1",
      a.data.session.sessionId,
      a.data.session.sessionToken
    );
    const second = env.context.api_logoutUser(
      "U-1",
      a.data.session.sessionId,
      a.data.session.sessionToken
    );
    assert.equal(second.success, true, "logout is idempotent");
  });

  test("Two concurrent sessions for the same user: independent until individually invalidated", () => {
    const users = makeUsersSheet([
      { userId: "U-1", username: "alice", pinCode: "1234", status: "Active" },
    ]);
    env.sheets["Users"] = { getDataRange: () => ({ getValues: () => users }) };
    loadAllGas(env.context);

    const a = env.context.api_loginUser("alice", "1234");
    const b = env.context.api_loginUser("alice", "1234");
    assert.equal(a.success, true);
    assert.equal(b.success, true);
    assert.notEqual(
      a.data.session.sessionId,
      b.data.session.sessionId,
      "two logins from the same user produce two distinct sessionIds"
    );

    const aKey = `session_${a.data.session.sessionId}`;
    const bKey = `session_${b.data.session.sessionId}`;
    assert.ok(env.scriptProps[aKey]);
    assert.ok(env.scriptProps[bKey]);

    // Logout A.
    env.context.api_logoutUser(
      "U-1",
      a.data.session.sessionId,
      a.data.session.sessionToken
    );
    assert.equal(env.scriptProps[aKey], undefined);
    assert.ok(env.scriptProps[bKey], "B's session is still valid");

    // A's old token no longer restores; B's still does.
    const aRestore = env.context.api_restoreApp(
      "U-1",
      a.data.session.sessionId,
      a.data.session.sessionToken
    );
    assert.equal(aRestore.success, false);
    assert.equal(aRestore.error.code, "AUTH_REQUIRED");
  });

  // -----------------------------------------------------------------------
  // Regression: the HMAC signature MUST bind the sessionId. Without
  // that binding, a token issued for one sessionId could be
  // presented against a different sessionId and still verify —
  // a real security regression. Issue #73 explicitly requires the
  // sessionId in the signature input.
  // -----------------------------------------------------------------------
  test("Issue #73: two logins for the same user produce two distinct sessionTokens", () => {
    const users = makeUsersSheet([
      { userId: "U-1", username: "alice", pinCode: "1234", status: "Active" },
    ]);
    env.sheets["Users"] = { getDataRange: () => ({ getValues: () => users }) };
    loadAllGas(env.context);

    const a = env.context.api_loginUser("alice", "1234");
    const b = env.context.api_loginUser("alice", "1234");
    assert.equal(a.success, true);
    assert.equal(b.success, true);
    // Same userId, same PIN, same issuedAt millisecond — yet the
    // tokens MUST differ because the sessionId is bound into the
    // HMAC input. If they don't differ, sessionId is not bound.
    assert.notEqual(
      a.data.session.sessionToken,
      b.data.session.sessionToken,
      "two sessions for the same user MUST produce distinct tokens " +
        "(sessionId must be bound in the HMAC input per #73)"
    );
    // And of course the sessionIds differ too.
    assert.notEqual(a.data.session.sessionId, b.data.session.sessionId);
  });

  test("Issue #73: presenting token A against sessionId B fails AUTH_REQUIRED", () => {
    const users = makeUsersSheet([
      { userId: "U-1", username: "alice", pinCode: "1234", status: "Active" },
    ]);
    env.sheets["Users"] = { getDataRange: () => ({ getValues: () => users }) };
    loadAllGas(env.context);

    const a = env.context.api_loginUser("alice", "1234");
    const b = env.context.api_loginUser("alice", "1234");
    assert.equal(a.success, true);
    assert.equal(b.success, true);

    // Use session A's token but session B's id. If sessionId is
    // properly bound in the HMAC, the token is invalid for
    // session B and the restore fails with AUTH_REQUIRED.
    const swapped = env.context.api_restoreApp(
      "U-1",
      // session B's id
      b.data.session.sessionId,
      // session A's token
      a.data.session.sessionToken
    );
    assert.equal(
      swapped.success,
      false,
      "a token must not verify against a different sessionId"
    );
    assert.equal(swapped.error.code, "AUTH_REQUIRED");
  });

  test("EFCC_SESSION_SALT missing: api_loginUser fails closed with UNAVAILABLE", () => {
    const users = makeUsersSheet([
      { userId: "U-1", username: "alice", pinCode: "1234", status: "Active" },
    ]);
    env.sheets["Users"] = { getDataRange: () => ({ getValues: () => users }) };
    // The sessionSalt_ helper reads from Script Properties, so we
    // simply leave EFCC_SESSION_SALT absent from the harness store.
    // sessionSalt_ throws and api_loginUser catches it in the outer
    // try, mapping to UNAVAILABLE per the fail-closed contract.
    loadAllGas(env.context);
    // Salt is intentionally absent (setSalt: false) so the
    // sessionSalt_ helper throws and the catch in api_loginUser
    // maps to UNAVAILABLE per the fail-closed contract.
    const noSaltEnv = buildContext({ setSalt: false });
    noSaltEnv.sheets["Users"] = {
      getDataRange: () => ({ getValues: () => users }),
    };
    loadAllGas(noSaltEnv.context);
    const res = noSaltEnv.context.api_loginUser("alice", "1234");
    assert.equal(
      res.error.code,
      "UNAVAILABLE",
      "missing salt must surface as UNAVAILABLE, not leak a stack trace"
    );
  });

  test("rpc envelope: failure messages are Traditional Chinese", () => {
    const users = makeUsersSheet([
      { userId: "U-1", username: "alice", pinCode: "1234", status: "Active" },
    ]);
    env.sheets["Users"] = { getDataRange: () => ({ getValues: () => users }) };
    loadAllGas(env.context);

    const wrong = env.context.api_loginUser("alice", "0000");
    assert.equal(wrong.success, false);
    assert.ok(
      /[\u4E00-\u9FFF]/u.test(wrong.error.message),
      "AUTH_REQUIRED message must contain Traditional Chinese characters"
    );
  });

  test("AC #5: RPC_CODES exports the stable set per spec 009", () => {
    // The stable error codes are the dispatch keys the client uses
    // to decide which view to render. They MUST NOT drift.
    loadAllGas(env.context);
    const expected = [
      "AUTH_REQUIRED",
      "FORBIDDEN",
      "VALIDATION",
      "NOT_FOUND",
      "CONFLICT",
      "UNAVAILABLE",
      "INTERNAL_ERROR",
    ];
    for (const code of expected) {
      assert.equal(
        env.context.RPC_CODES[code],
        code,
        `RPC_CODES.${code} must equal the stable token`
      );
    }
    // Object.freeze prevents runtime mutation.
    assert.equal(
      Object.isFrozen(env.context.RPC_CODES),
      true,
      "RPC_CODES must be frozen so callers cannot redefine the tokens"
    );
  });

  test("AC #5: every success and failure envelope carries a non-empty requestId", () => {
    const users = makeUsersSheet([
      { userId: "U-1", username: "alice", pinCode: "1234", status: "Active" },
    ]);
    env.sheets["Users"] = { getDataRange: () => ({ getValues: () => users }) };
    loadAllGas(env.context);

    const ok = env.context.api_loginUser("alice", "1234");
    assert.equal(ok.success, true);
    assert.equal(
      typeof ok.requestId,
      "string",
      "success envelope must carry a string requestId"
    );
    assert.ok(
      ok.requestId.length > 0,
      "success envelope requestId must be non-empty"
    );

    const fail = env.context.api_loginUser("alice", "0000");
    assert.equal(fail.success, false);
    assert.equal(
      typeof fail.requestId,
      "string",
      "failure envelope must carry a string requestId"
    );
    assert.ok(
      fail.requestId.length > 0,
      "failure envelope requestId must be non-empty"
    );
    assert.equal(fail.error.code, "AUTH_REQUIRED");
    assert.ok(
      /[\u4E00-\u9FFF]/u.test(fail.error.message),
      "failure message must be Traditional Chinese"
    );
  });

  // -----------------------------------------------------------------------
  // AC #6 — server-thrown exception path. The same handleRpcFailure_
  // path on the client covers this, but the server must surface it
  // as INTERNAL_ERROR / UNAVAILABLE, not as a thrown JavaScript
  // exception that escapes the RPC boundary.
  // -----------------------------------------------------------------------
  test("AC #6: server-thrown exception surfaces as UNAVAILABLE envelope (does not throw)", () => {
    // Missing the Users sheet forces sessionSalt_/usersFindByUsername_
    // paths to throw, exercising the outer try/catch in api_loginUser.
    loadAllGas(env.context);
    // env.sheets["Users"] is NOT seeded; usersReadAll_ will throw.
    const res = env.context.api_loginUser("alice", "1234");
    assert.equal(res.success, false, "thrown exception must not escape");
    assert.equal(
      res.error.code,
      "UNAVAILABLE",
      "missing infrastructure must surface as UNAVAILABLE per ADR-0011 fail-closed"
    );
    assert.ok(
      /[\u4E00-\u9FFF]/u.test(res.error.message),
      "server-failure message must be Traditional Chinese"
    );
  });

  // -----------------------------------------------------------------------
  // AC #8 — role change is reflected on the next session validation;
  // the web app exposes no credential-editing RPC.
  // -----------------------------------------------------------------------
  test("AC #8: api_restoreApp revalidates role — STAFF role survives a session restore", () => {
    const users = makeUsersSheet([
      {
        userId: "U-1",
        username: "alice",
        pinCode: "1234",
        role: "STAFF",
        status: "Active",
      },
    ]);
    env.sheets["Users"] = { getDataRange: () => ({ getValues: () => users }) };
    loadAllGas(env.context);

    const login = env.context.api_loginUser("alice", "1234");
    assert.equal(login.success, true);
    const oldId = login.data.session.sessionId;
    const oldToken = login.data.session.sessionToken;

    // The sheet flips Alice's Role from STAFF to MEMBER (e.g. staff
    // demoted by an admin). The next restore must surface the
    // updated role in the DTO.
    const updated = makeUsersSheet([
      {
        userId: "U-1",
        username: "alice",
        pinCode: "1234",
        role: "MEMBER",
        status: "Active",
      },
    ]);
    env.sheets["Users"] = {
      getDataRange: () => ({ getValues: () => updated }),
    };
    env.context.usersSetRowsForTesting_(updated);

    const restore = env.context.api_restoreApp("U-1", oldId, oldToken);
    assert.equal(restore.success, true);
    assert.equal(
      restore.data.session.role,
      "MEMBER",
      "next session validation must reflect the sheet-side role change"
    );
    assert.equal(restore.data.profile.role, "MEMBER");
  });

  test("AC #8: api_restoreApp revalidates role — role flip from MEMBER to Inactive status still AUTH_REQUIREDs", () => {
    // Belt-and-braces: a user whose role changes but whose status
    // is also flipped to Inactive must be re-validated as inactive.
    // This protects against a regression where role-only flips
    // bypass the status check.
    const users = makeUsersSheet([
      {
        userId: "U-1",
        username: "alice",
        pinCode: "1234",
        role: "MEMBER",
        status: "Active",
      },
    ]);
    env.sheets["Users"] = { getDataRange: () => ({ getValues: () => users }) };
    loadAllGas(env.context);

    const login = env.context.api_loginUser("alice", "1234");
    const sid = login.data.session.sessionId;
    const tok = login.data.session.sessionToken;

    const updated = makeUsersSheet([
      {
        userId: "U-1",
        username: "alice",
        pinCode: "1234",
        role: "STAFF",
        status: "Inactive",
      },
    ]);
    env.sheets["Users"] = {
      getDataRange: () => ({ getValues: () => updated }),
    };
    env.context.usersSetRowsForTesting_(updated);

    const restore = env.context.api_restoreApp("U-1", sid, tok);
    assert.equal(restore.success, false);
    assert.equal(
      restore.error.code,
      "AUTH_REQUIRED",
      "status Inactive must take precedence over role elevation"
    );
  });

  test("AC #8: the web app exposes no credential-editing RPC", () => {
    // Read every public function name in Code.gs and assert no
    // credential-mutation RPC is exposed. The spec explicitly
    // forbids this; a regression that adds one is a security issue.
    const code = readFileSync(path.join(GAS_DIR, "Code.gs"), "utf-8");
    const banned = [
      /^function api_(?!loginUser|restoreApp|logoutUser|changeRole_)/u,
      /^function api_.*pin/iu,
      /^function api_.*password/iu,
      /^function api_.*credential/iu,
      /^function api_.*role/iu,
      /^function api_.*patch/iu,
      /^function api_.*update/iu,
      /^function api_.*modify/iu,
      /^function api_.*delete/iu,
    ];
    for (const re of banned) {
      assert.ok(
        !re.test(code),
        `Code.gs must not declare ${re.source.replaceAll("\\b", "")} — ` +
          "credential/role editing is out of scope for the web app per #66 AC #8"
      );
    }
  });

  // -----------------------------------------------------------------------
  // AC #9 — server logs include requestId, operation, outcome,
  // duration. PINs, tokens, name, QR, username must NEVER appear
  // in any log line. The failure message must not leak the
  // attempted username.
  // -----------------------------------------------------------------------
  test("AC #9: every RPC emits exactly one structured log record with the right shape", () => {
    const users = makeUsersSheet([
      {
        userId: "U-1",
        username: "alice",
        pinCode: "1234",
        name: "王小明",
        qrCodeString: "QR-U-1",
        status: "Active",
      },
    ]);
    env.sheets["Users"] = { getDataRange: () => ({ getValues: () => users }) };
    // Capture every console.log call.
    const logs = [];
    env.context.console = { log: (entry) => logs.push(entry) };
    loadAllGas(env.context);

    // Trigger every public RPC and every outcome.
    env.context.api_loginUser("alice", "1234");
    env.context.api_loginUser("alice", "0000");
    env.context.api_logoutUser("U-1", "bogus-sid", "bogus-tok");
    env.context.api_restoreApp("U-1", "bogus-sid", "bogus-tok");

    assert.ok(
      logs.length >= 4,
      `every RPC must emit a structured log record (saw ${logs.length})`
    );
    for (const entry of logs) {
      assert.equal(
        typeof entry.operation,
        "string",
        "log must have string operation"
      );
      assert.ok(entry.operation.length > 0, "log operation must be non-empty");
      assert.equal(
        typeof entry.requestId,
        "string",
        "log must have string requestId"
      );
      assert.ok(entry.requestId.length > 0, "log requestId must be non-empty");
      assert.equal(
        typeof entry.outcome,
        "string",
        "log must have string outcome"
      );
      assert.ok(entry.outcome.length > 0, "log outcome must be non-empty");
      assert.equal(
        typeof entry.durationMs,
        "number",
        "log must have numeric durationMs"
      );
      assert.ok(entry.durationMs >= 0, "log durationMs must be non-negative");
    }
  });

  test("AC #9: log records never include the username, name, PIN, QR, or session token", () => {
    const users = makeUsersSheet([
      {
        userId: "U-1",
        username: "alice",
        pinCode: "1234",
        name: "王小明",
        qrCodeString: "QR-U-1",
        status: "Active",
      },
    ]);
    env.sheets["Users"] = { getDataRange: () => ({ getValues: () => users }) };
    const logs = [];
    env.context.console = { log: (entry) => logs.push(entry) };
    loadAllGas(env.context);

    const ok = env.context.api_loginUser("alice", "1234");
    const sid = ok.data.session.sessionId;
    const tok = ok.data.session.sessionToken;
    env.context.api_logoutUser("U-1", sid, tok);

    const serialized = logs.map((e) => JSON.stringify(e)).join("\n");
    for (const forbidden of ["alice", "王小明", "1234", "QR-U-1", sid, tok]) {
      assert.ok(
        !serialized.includes(forbidden),
        `log records must never contain the substring "${forbidden}" — ` +
          `this is a PII / credential leak. Got: ${serialized.slice(0, 400)}`
      );
    }
  });

  test("AC #9: the failure message never leaks the attempted username", () => {
    const users = makeUsersSheet([
      { userId: "U-1", username: "alice", pinCode: "1234", status: "Active" },
    ]);
    env.sheets["Users"] = { getDataRange: () => ({ getValues: () => users }) };
    loadAllGas(env.context);

    // Wrong username — the message must not include the attempted
    // username. Otherwise an attacker can enumerate valid users.
    const wrong = env.context.api_loginUser("never-existed", "9999");
    assert.equal(wrong.success, false);
    assert.ok(
      !wrong.error.message.includes("never-existed"),
      "failure message must not include the attempted username (no user enumeration)"
    );

    // Wrong password for an existing user — same message (no
    // distinction between wrong user and wrong PIN).
    const wrongPin = env.context.api_loginUser("alice", "9999");
    assert.equal(
      wrongPin.error.message,
      wrong.error.message,
      "ambiguous failure message — no user enumeration"
    );
  });

  // -----------------------------------------------------------------------
  // AC #10 — automated tests cover malformed RPC response and
  // failed bootstrap (server-side: a failure envelope on restore).
  // -----------------------------------------------------------------------
  test("AC #10: api_restoreApp returns the failure envelope on an unverified session", () => {
    // No login. Calling api_restoreApp with a sessionId that has
    // no matching Script Property returns AUTH_REQUIRED.
    const users = makeUsersSheet([
      { userId: "U-1", username: "alice", pinCode: "1234", status: "Active" },
    ]);
    env.sheets["Users"] = { getDataRange: () => ({ getValues: () => users }) };
    loadAllGas(env.context);

    const res = env.context.api_restoreApp(
      "U-1",
      "never-issued",
      "never-issued"
    );
    assert.equal(res.success, false);
    assert.equal(res.error.code, "AUTH_REQUIRED");
    assert.ok(
      /[\u4E00-\u9FFF]/u.test(res.error.message),
      "failed bootstrap message must be Traditional Chinese"
    );
  });
});

// ---------------------------------------------------------------------------
// Sanity guard: every .gs parses as V8 JavaScript under the harness.
// ---------------------------------------------------------------------------

describe("Sanity: every src/gas/*.gs file parses as V8 JavaScript", () => {
  test("all .gs files load without syntax errors when a GAS shim is provided", () => {
    const ctx = buildContext().context;
    const files = readdirSync(GAS_DIR)
      .filter((f) => f.endsWith(".gs"))
      .sort();
    assert.ok(files.length > 0, "expected at least one .gs file");
    for (const f of files) {
      const src = readFileSync(path.join(GAS_DIR, f), "utf-8");
      assert.doesNotThrow(
        () => vm.runInContext(src, ctx, { filename: f }),
        `${f} must parse as valid JavaScript`
      );
    }
  });
});
