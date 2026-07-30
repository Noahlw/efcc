import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { beforeEach, describe, test } from "vitest";

const GAS_DIR = path.join(import.meta.dirname, "..", "..", "src", "gas");

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
        get: () => null,
        put: () => {},
        remove: () => {},
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
  return { context, sheets, scriptProps };
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
    vm.runInContext(readFileSync(path.join(GAS_DIR, name), "utf-8"), context, {
      filename: name,
    });
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

describe("api_authorizedNavigate - issue #69 AC #7", () => {
  let env;

  beforeEach(() => {
    env = buildContext({ salt: "test-salt" });
  });

  function loginAs(role) {
    const users = makeUsersSheet([
      {
        userId: "U-1",
        name: "Alice",
        username: "alice",
        pinCode: "1234",
        role,
        status: "Active",
      },
      {
        userId: "U-2",
        name: "Bob",
        username: "bob",
        pinCode: "5678",
        role: "STAFF",
        status: "Active",
      },
    ]);
    env.sheets.Users = { getDataRange: () => ({ getValues: () => users }) };
    loadAllGas(env.context);
    const login = env.context.api_loginUser("alice", "1234");
    assert.equal(login.success, true, "test setup: login must succeed");
    return login.data.session;
  }

  test("returns rpcSuccess for a member-accessible section (profile)", () => {
    const session = loginAs("MEMBER");
    const res = env.context.api_authorizedNavigate(
      session.userId,
      session.sessionId,
      session.sessionToken,
      "profile"
    );
    assert.equal(res.success, true);
    assert.equal(res.data.authorized, true);
  });

  test("returns FORBIDDEN for a guarded section when MEMBER requests care", () => {
    const session = loginAs("MEMBER");
    const res = env.context.api_authorizedNavigate(
      session.userId,
      session.sessionId,
      session.sessionToken,
      "care"
    );
    assert.equal(res.success, false);
    assert.equal(res.error.code, "FORBIDDEN");
  });

  test("returns FORBIDDEN for a guarded section when MEMBER requests permissions", () => {
    const session = loginAs("MEMBER");
    const res = env.context.api_authorizedNavigate(
      session.userId,
      session.sessionId,
      session.sessionToken,
      "permissions"
    );
    assert.equal(res.success, false);
    assert.equal(res.error.code, "FORBIDDEN");
  });

  test("returns rpcSuccess for STAFF requesting care (guarded section)", () => {
    const session = loginAs("STAFF");
    const res = env.context.api_authorizedNavigate(
      session.userId,
      session.sessionId,
      session.sessionToken,
      "care"
    );
    assert.equal(res.success, true);
    assert.equal(res.data.authorized, true);
  });

  test("returns AUTH_REQUIRED for invalid session", () => {
    loginAs("MEMBER");
    const res = env.context.api_authorizedNavigate(
      "U-1",
      "fake-session-id",
      "fake-token",
      "profile"
    );
    assert.equal(res.success, false);
    assert.equal(res.error.code, "AUTH_REQUIRED");
  });

  test("returns AUTH_REQUIRED for userId mismatch", () => {
    const session = loginAs("MEMBER");
    const res = env.context.api_authorizedNavigate(
      "U-999",
      session.sessionId,
      session.sessionToken,
      "profile"
    );
    assert.equal(res.success, false);
    assert.equal(res.error.code, "AUTH_REQUIRED");
  });
});

describe("bootstrapSectionsForRole_ - requiresServerAuth flag (#69 tiered auth)", () => {
  let env;

  beforeEach(() => {
    env = buildContext({ salt: "test-salt" });
    const users = makeUsersSheet([
      {
        userId: "U-1",
        name: "Alice",
        username: "alice",
        pinCode: "1234",
        role: "MEMBER",
        status: "Active",
      },
    ]);
    env.sheets.Users = { getDataRange: () => ({ getValues: () => users }) };
    loadAllGas(env.context);
  });

  test("member-accessible sections (profile, programs, events) have requiresServerAuth=false", () => {
    const sections = env.context.bootstrapSectionsForRole_("MEMBER", "U-1");
    for (const s of sections) {
      assert.equal(
        s.requiresServerAuth,
        false,
        `section ${s.key} should have requiresServerAuth=false for MEMBER`
      );
    }
  });

  test("guarded sections (scanner, care, permissions) have requiresServerAuth=true", () => {
    const sections = env.context.bootstrapSectionsForRole_("STAFF", "U-1");
    const guarded = sections.filter((s) => s.requiresServerAuth === true);
    const guardedKeys = guarded.map((s) => s.key).sort();
    assert.ok(guardedKeys.includes("care"), "care should be guarded");
    assert.ok(
      guardedKeys.includes("permissions"),
      "permissions should be guarded"
    );
    assert.ok(guardedKeys.includes("scanner"), "scanner should be guarded");
    assert.equal(guardedKeys.length, 3, "exactly 3 guarded sections for STAFF");
  });
});
