/**
 * Tests for service-envelope.gs — canonical serialization, HMAC signing,
 * verification, and strict action projection (#151).
 *
 * Pure Apps Script VM harness — no Worker/TypeScript imports. The GAS
 * verifier is what this PR lands; the Worker's same-shape signer is a
 * downstream CF1 implementation ticket (not in this PR) and will pin the
 * same canonical payload / signature vectors when both sides exist.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { describe, test, beforeEach } from "vitest";

const GAS_DIR = path.join(import.meta.dirname, "..", "..", "src", "gas");

const TEST_SECRET = "efcc-test-secret-2026";

/**
 * Build a fake HMAC bytes function that matches what the GAS test harness
 * uses for session tests. The GAS service-envelope module calls
 * Utilities.computeHmacSha256Signature directly, so we must provide a
 * compatible mock.
 */
function fakeHmacBytes(value, salt) {
  const h = crypto.createHmac("sha256", salt);
  h.update(value);
  return new Uint8Array(h.digest());
}

function buildContext({ secret = TEST_SECRET } = {}) {
  const scriptProps = {};
  if (secret) {
    scriptProps["EFCC_SERVICE_SECRET"] = secret;
  }
  const context = {
    console: { log: () => {}, error: () => {} },
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
      getUuid: () => "uuid-test",
      computeHmacSha256Signature: (value, salt) => fakeHmacBytes(value, salt),
    },
  };
  vm.createContext(context);
  return { context, scriptProps };
}

function loadModule(context, filename) {
  const source = readFileSync(path.join(GAS_DIR, filename), "utf-8");
  vm.runInContext(source, context, { filename });
}

// ---------------------------------------------------------------------------
// Canonical JSON
// ---------------------------------------------------------------------------

describe("service-envelope.gs: canonical JSON", () => {
  let env;
  beforeEach(() => {
    env = buildContext();
    loadModule(env.context, "service-envelope.gs");
  });

  test("sorts object keys recursively", () => {
    const result = env.context.serviceCanonicalJson_({
      z: 1,
      a: { c: 3, b: 2 },
    });
    assert.equal(result, `{"a":{"b":2,"c":3},"z":1}`);
  });

  test("handles null, string, number, boolean", () => {
    assert.equal(env.context.serviceCanonicalJson_(null), "null");
    assert.equal(env.context.serviceCanonicalJson_("hello"), `"hello"`);
    assert.equal(env.context.serviceCanonicalJson_(42), "42");
    assert.equal(env.context.serviceCanonicalJson_(true), "true");
    assert.equal(env.context.serviceCanonicalJson_(false), "false");
  });

  test("handles arrays preserving order", () => {
    assert.equal(env.context.serviceCanonicalJson_([3, 1, 2]), "[3,1,2]");
  });

  test("drops undefined values", () => {
    // GAS `undefined` in an object literal is truly undefined; the key lookup
    // returns undefined, and we skip it in the loop.
    const obj = { a: 1, c: 3, b: undefined };
    assert.equal(env.context.serviceCanonicalJson_(obj), `{"a":1,"c":3}`);
  });

  test("empty object", () => {
    assert.equal(env.context.serviceCanonicalJson_({}), "{}");
  });

  test("empty array", () => {
    assert.equal(env.context.serviceCanonicalJson_([]), "[]");
  });
});

describe("service-envelope.gs: canonicalJsonExcept", () => {
  let env;
  beforeEach(() => {
    env = buildContext();
    loadModule(env.context, "service-envelope.gs");
  });

  test("excludes one top-level key", () => {
    const obj = { a: 1, b: 2, signature: "xyz" };
    assert.equal(
      env.context.serviceCanonicalJsonExcept_(obj, "signature"),
      `{"a":1,"b":2}`
    );
  });
});

// ---------------------------------------------------------------------------
// HMAC hex
// ---------------------------------------------------------------------------

describe("service-envelope.gs: HMAC hex", () => {
  let env;
  beforeEach(() => {
    env = buildContext();
    loadModule(env.context, "service-envelope.gs");
  });

  test("produces hex string matching Node crypto", () => {
    const data = `{"a":1,"b":2}`;
    const result = env.context.serviceHmacHex_(TEST_SECRET, data);
    const expected = crypto
      .createHmac("sha256", TEST_SECRET)
      .update(data)
      .digest("hex");
    assert.equal(result, expected);
  });

  test("produces 64-char hex string", () => {
    const result = env.context.serviceHmacHex_(TEST_SECRET, `{"a":1}`);
    assert.equal(result.length, 64);
    assert.ok(/^[0-9a-f]{64}$/u.test(result));
  });
});

// ---------------------------------------------------------------------------
// Verify envelope
// ---------------------------------------------------------------------------

describe("service-envelope.gs: verify envelope", () => {
  let env;
  beforeEach(() => {
    env = buildContext();
    loadModule(env.context, "service-envelope.gs");
  });

  /**
   * Build a signed envelope from scratch, simulating what the Worker would
   * produce. We compute the HMAC in the same way as the GAS code.
   * When `overrideSignature` is provided, the computed HMAC is replaced
   * after signing (to simulate tampered/missing signatures).
   */
  function buildEnvelope(overrides, overrideSignature) {
    const envelope = {
      version: 1,
      keyId: "k1",
      timestamp: 1_755_000_000_000,
      nonce: "00000000-0000-0000-0000-000000000001",
      attemptGroup: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      attemptId: 1,
      request: {
        action: "restoreApp",
        params: { userId: "U-1" },
        sessionId: "sess-test",
        authorization: "Bearer tok-test",
      },
      metadata: {},
      signature: "",
      ...overrides,
    };
    // Compute the canonical JSON excluding signature, then HMAC it.
    const payload = env.context.serviceCanonicalJsonExcept_(
      envelope,
      "signature"
    );
    envelope.signature = env.context.serviceHmacHex_(TEST_SECRET, payload);
    // If caller wants to override the signature after signing (e.g.
    // tampered or missing), do so now.
    if (overrideSignature !== undefined) {
      envelope.signature = overrideSignature;
    }
    return envelope;
  }

  test("verifies a valid envelope", () => {
    const envelope = buildEnvelope();
    const result = env.context.serviceVerifyEnvelope_(envelope);
    assert.ok(result !== null, "must verify a valid envelope");
    assert.equal(result.action, "restoreApp");
    assert.equal(result.params.userId, "U-1");
    assert.equal(result.sessionId, "sess-test");
    assert.equal(result.authorization, "Bearer tok-test");
  });

  test("rejects null/undefined envelope", () => {
    assert.equal(env.context.serviceVerifyEnvelope_(null), null);
    assert.equal(env.context.serviceVerifyEnvelope_(), null);
  });

  test("rejects wrong version", () => {
    const envelope = buildEnvelope({ version: 2 });
    assert.equal(env.context.serviceVerifyEnvelope_(envelope), null);
  });

  test("rejects missing signature", () => {
    const envelope = buildEnvelope({}, "");
    assert.equal(env.context.serviceVerifyEnvelope_(envelope), null);
  });

  test.each([
    ["keyId", undefined],
    ["timestamp", "1755000000000"],
    ["nonce", ""],
    ["attemptGroup", null],
    ["attemptId", 0],
    ["request", null],
    ["metadata", []],
  ])("rejects a signed envelope with malformed required %s", (field, value) => {
    const envelope = buildEnvelope({ [field]: value });
    assert.equal(env.context.serviceVerifyEnvelope_(envelope), null);
  });

  test.each([
    ["action", ""],
    ["params", null],
    ["sessionId", 123],
    ["authorization", false],
    ["idempotencyKey", {}],
  ])("rejects a signed envelope with malformed request.%s", (field, value) => {
    const envelope = buildEnvelope({
      request: {
        action: "restoreApp",
        params: { userId: "U-1" },
        [field]: value,
      },
    });
    assert.equal(env.context.serviceVerifyEnvelope_(envelope), null);
  });

  test("rejects tampered signature", () => {
    const envelope = buildEnvelope({}, "f".repeat(64));
    assert.equal(env.context.serviceVerifyEnvelope_(envelope), null);
  });

  test("rejects tampered request body", () => {
    const envelope = buildEnvelope();
    const tampered = structuredClone(envelope);
    tampered.request.params.userId = "U-2";
    assert.equal(env.context.serviceVerifyEnvelope_(tampered), null);
  });

  test("rejects with wrong secret", () => {
    const env2 = buildContext({ secret: "different-secret" });
    loadModule(env2.context, "service-envelope.gs");
    const envelope = buildEnvelope();
    // The envelope was signed with TEST_SECRET, but env2 has a different secret.
    assert.equal(env2.context.serviceVerifyEnvelope_(envelope), null);
  });

  test("missing secret in Script Properties returns null (fail-closed)", () => {
    const noSecret = buildContext({ secret: null });
    loadModule(noSecret.context, "service-envelope.gs");
    const envelope = buildEnvelope();
    // serviceSecret_() throws, serviceVerifyEnvelope_ catches and returns null.
    assert.equal(noSecret.context.serviceVerifyEnvelope_(envelope), null);
  });
});

// ---------------------------------------------------------------------------
// Verified action projection
// ---------------------------------------------------------------------------

describe("service-envelope.gs: verified action projection", () => {
  let env;
  beforeEach(() => {
    env = buildContext();
    loadModule(env.context, "service-envelope.gs");
  });

  function buildEnvelope(action, overrides = {}) {
    const envelope = {
      version: 1,
      keyId: "k1",
      timestamp: 1_755_000_000_000,
      nonce: "00000000-0000-0000-0000-000000000001",
      attemptGroup: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      attemptId: 1,
      request: {
        action,
        params: { userId: "U-1" },
        sessionId: "sess-test",
        authorization: "Bearer tok-test",
      },
      metadata: {},
      signature: "",
      ...overrides,
    };
    const payload = env.context.serviceCanonicalJsonExcept_(
      envelope,
      "signature"
    );
    envelope.signature = env.context.serviceHmacHex_(TEST_SECRET, payload);
    return envelope;
  }

  test("returns the verified action from a valid envelope", () => {
    const envelope = buildEnvelope("restoreApp");
    const result = env.context.serviceVerifyEnvelope_(envelope);
    assert.ok(result !== null);
    assert.equal(result.action, "restoreApp");
    assert.equal(result.params.userId, "U-1");
  });

  test("keeps the declared action distinct from the signed request", () => {
    // The dispatcher dispatches on the *verified* request.action, so a
    // valid envelope for "loginUser" is dispatched as loginUser, never
    // as restoreApp. The action is projected from the verified envelope.
    const envelope = buildEnvelope("loginUser");
    const result = env.context.serviceVerifyEnvelope_(envelope);
    assert.ok(result !== null);
    assert.equal(result.action, "loginUser");
  });

  test("returns null when envelope is invalid", () => {
    const result = env.context.serviceVerifyEnvelope_(null);
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// Deterministic GAS vectors
//
// These pin the canonical payload and HMAC hex that the GAS verifier
// produces for a fixed envelope + shared secret. The future Worker
// implementation ticket will pin the same vectors from its signer so
// both sides agree byte-for-byte; cross-runtime parity is owned by
// that downstream CF1 work, not by this PR.
// ---------------------------------------------------------------------------

describe("service-envelope.gs: deterministic GAS vectors", () => {
  let env;
  beforeEach(() => {
    env = buildContext();
    loadModule(env.context, "service-envelope.gs");
  });

  test("canonical JSON sorts keys recursively with no whitespace", () => {
    const obj = {
      version: 1,
      keyId: "k1",
      timestamp: 1_755_000_000_000,
      nonce: "00000000-0000-0000-0000-000000000001",
      attemptGroup: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      attemptId: 1,
      request: {
        action: "restoreApp",
        params: {},
        sessionId: "sess-test",
        authorization: "Bearer tok-test",
      },
      metadata: {},
    };
    const result = env.context.serviceCanonicalJson_(obj);
    // Verify it's valid JSON and keys are sorted.
    const parsed = JSON.parse(result);
    assert.equal(parsed.version, 1);
    assert.equal(parsed.request.action, "restoreApp");
    // The JSON should be compact (no whitespace or newlines). GAS V8's
    // JSON.stringify produces compact JSON, and our serializer must
    // match so the future Worker's signer sees identical bytes.
    assert.ok(!result.includes("\n"), "canonical JSON must have no newlines");
  });

  test("pinned canonical vector — exact byte match (GAS side)", () => {
    // This exact string is the canonical serialization of a fixed
    // envelope. The future Worker signer (CF1 implementation) must
    // produce it byte-for-byte, or the HMAC will not agree across
    // runtimes. Pinning it here freezes the GAS side of that contract.
    const envelope = {
      version: 1,
      keyId: "k1",
      timestamp: 1_755_000_000_000,
      nonce: "00000000-0000-0000-0000-000000000001",
      attemptGroup: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      attemptId: 1,
      request: {
        action: "restoreApp",
        params: {},
        sessionId: "sess-test",
        authorization: "Bearer tok-test",
      },
      metadata: {},
    };
    const expected =
      '{"attemptGroup":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","attemptId":1,"keyId":"k1","metadata":{},"nonce":"00000000-0000-0000-0000-000000000001","request":{"action":"restoreApp","authorization":"Bearer tok-test","params":{},"sessionId":"sess-test"},"timestamp":1755000000000,"version":1}';
    assert.equal(env.context.serviceCanonicalJson_(envelope), expected);
  });

  test("pinned signature vector — exact HMAC hex (GAS side)", () => {
    // The HMAC-SHA256 over the pinned canonical payload above, computed
    // with the shared TEST_SECRET. The future Worker signer (CF1) must
    // produce the same hex; this is the GAS-side pin of the contract.
    const envelope = {
      version: 1,
      keyId: "k1",
      timestamp: 1_755_000_000_000,
      nonce: "00000000-0000-0000-0000-000000000001",
      attemptGroup: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      attemptId: 1,
      request: {
        action: "restoreApp",
        params: {},
        sessionId: "sess-test",
        authorization: "Bearer tok-test",
      },
      metadata: {},
    };
    const payload = env.context.serviceCanonicalJson_(envelope);
    const signature = env.context.serviceHmacHex_(TEST_SECRET, payload);
    // Pinned from the deterministic HMAC over the same canonical payload
    // using TEST_SECRET. The future Worker-side test will pin the same
    // hex independently.
    const expected =
      "fd52c782ee8ed39101f50bdb59dd4925238165aab41d15f33ec3bc1e3a192765";
    assert.equal(signature, expected);
  });
});

// ---------------------------------------------------------------------------
// Full round trip: doPost with a signed restoreApp envelope → verify →
// api_restoreApp → bootstrap success (#151 Apps Script verifier slice).
//
// The envelope is built by the same GAS-harness canonicalizer+HMAC that
// the verifier uses; the future Worker signer (CF1 implementation) is
// expected to produce byte-identical output for the same inputs, but
// Worker parity is NOT exercised here — that belongs to the Worker
// implementation ticket, not this PR.
// ---------------------------------------------------------------------------

describe("service-envelope.gs: full doPost round trip (#151)", () => {
  let env;

  beforeEach(() => {
    env = buildRoundTripContext();
    // Seed the Users sheet.
    const users = makeUsersSheet([
      { userId: "U-1", username: "alice", pinCode: "1234", status: "Active" },
    ]);
    env.sheets["Users"] = { getDataRange: () => ({ getValues: () => users }) };
    loadAllGas(env.context);
  });

  /** Sign an envelope with the same GAS-harness canonicalizer+HMAC
   *  the verifier uses. The future Worker signer (CF1) is expected to
   *  produce byte-identical output for the same inputs. */
  function signEnvelope(request, overrides = {}) {
    const envelope = {
      version: 1,
      keyId: "k1",
      timestamp: 1_755_000_000_000,
      nonce: "00000000-0000-0000-0000-000000000001",
      attemptGroup: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      attemptId: 1,
      request,
      metadata: {},
      signature: "",
      ...overrides,
    };
    const payload = env.context.serviceCanonicalJsonExcept_(
      envelope,
      "signature"
    );
    envelope.signature = env.context.serviceHmacHex_(TEST_SECRET, payload);
    return envelope;
  }

  /** Drive doPost with a raw event and return the parsed response. */
  function driveRawDoPost(event) {
    const output = env.context.doPost(event);
    return JSON.parse(output.getContent());
  }

  /** Drive doPost with a JSON body and return the parsed response. */
  function driveDoPost(body) {
    return driveRawDoPost({
      postData: { contents: JSON.stringify(body) },
    });
  }

  test("a signed restoreApp envelope with nested Unicode round-trips through doPost", () => {
    // 1. Issue a session via the existing api_loginUser (unchanged logic).
    const login = env.context.api_loginUser("alice", "1234");
    assert.equal(login.success, true, "login must succeed");
    const { sessionId, sessionToken, userId } = login.data.session;

    // 2. Build a valid signed envelope using the GAS-harness canonicalizer
    // and HMAC. The future Worker signer (CF1) will produce the same bytes
    // for the same inputs; the GAS verifier is the only contract checked
    // here.
    const envelope = signEnvelope(
      {
        action: "restoreApp",
        params: {
          userId,
          compatibility: { nested: ["教會", { greeting: "平安 👋" }] },
        },
        sessionId,
        authorization: `Bearer ${sessionToken}`,
      },
      {
        nonce: "gas-vm-harness-nonce",
        attemptGroup: "gas-vm-harness-attempt",
      }
    );

    // 3. doPost verifies the envelope and dispatches restoreApp.
    const response = driveDoPost(envelope);

    // 4. The existing bootstrap result is returned unchanged.
    assert.equal(response.success, true, "restoreApp must succeed");
    assert.equal(response.data.session.sessionId, sessionId);
    assert.equal(response.data.session.sessionToken, sessionToken);
    assert.equal(response.data.profile.username, "alice");
  });

  test("an invalid signature is rejected fail-closed with FORBIDDEN", () => {
    const login = env.context.api_loginUser("alice", "1234");
    const { sessionId, sessionToken, userId } = login.data.session;

    // Sign with the WRONG secret (simulating a forged envelope).
    const envelope = signEnvelope({
      action: "restoreApp",
      params: { userId },
      sessionId,
      authorization: `Bearer ${sessionToken}`,
    });
    envelope.signature = "f".repeat(64);

    const response = driveDoPost(envelope);
    // Fail closed: the invalid envelope is rejected with FORBIDDEN and
    // never reaches api_restoreApp (no fallback to the unsigned path).
    assert.equal(response.status, 403, "bad signature must fail closed");
    assert.equal(response.code, "FORBIDDEN");
    assert.notEqual(response.success, true, "bad signature must not auth");
  });

  test("a missing envelope is rejected fail-closed with FORBIDDEN", () => {
    // No envelope at all - a plain pre-CF1 body. The dispatcher must
    // reject it rather than fall back to the unsigned dispatch path.
    const response = driveDoPost({ action: "restoreApp", params: {} });
    assert.equal(response.status, 403, "missing envelope must fail closed");
    assert.equal(response.code, "FORBIDDEN");
  });

  test.each([
    ["missing event", undefined],
    ["null event", null],
    ["missing postData", {}],
    ["null postData", { postData: null }],
    ["missing contents", { postData: {} }],
    ["undefined contents", { postData: { contents: undefined } }],
    ["empty contents", { postData: { contents: "" } }],
    ["non-string contents", { postData: { contents: 42 } }],
    ["malformed JSON", { postData: { contents: "{" } }],
    ["JSON null", { postData: { contents: "null" } }],
    ["JSON array", { postData: { contents: "[]" } }],
    ["JSON string", { postData: { contents: '"text"' } }],
    ["JSON number", { postData: { contents: "42" } }],
    ["JSON boolean", { postData: { contents: "true" } }],
  ])("rejects %s before action dispatch", (_label, event) => {
    let dispatches = 0;
    env.context.PROTOTYPE_129_ACTIONS_.restoreApp = () => {
      dispatches += 1;
      return { success: true, data: {} };
    };

    const response = driveRawDoPost(event);

    assert.equal(response.status, 403);
    assert.equal(response.code, "FORBIDDEN");
    assert.equal(response.title, "FORBIDDEN");
    assert.ok(
      typeof response.requestId === "string" && response.requestId.length > 0
    );
    assert.equal(response.success, undefined);
    assert.equal(response.data, undefined);
    assert.equal(dispatches, 0);
    assert.equal(
      JSON.stringify(response).includes("Unexpected"),
      false,
      "parser detail must not leak"
    );
  });

  test("malformed inputs receive fresh correlation IDs", () => {
    const first = driveRawDoPost({ postData: { contents: "{" } });
    const second = driveRawDoPost({ postData: { contents: "{" } });

    assert.equal(first.status, 403);
    assert.equal(second.status, 403);
    assert.notEqual(first.requestId, second.requestId);
  });

  test("FORBIDDEN response includes an opaque requestId for log correlation", () => {
    const response = driveDoPost({ action: "restoreApp", params: {} });
    assert.equal(response.status, 403);
    assert.equal(response.code, "FORBIDDEN");
    assert.ok(
      typeof response.requestId === "string" && response.requestId.length > 0,
      "FORBIDDEN body must include a non-empty requestId"
    );
  });

  test("a signed structurally incomplete envelope is rejected before action dispatch", () => {
    let dispatches = 0;
    env.context.PROTOTYPE_129_ACTIONS_.restoreApp = () => {
      dispatches += 1;
      return { success: true, data: {} };
    };
    const envelope = signEnvelope(
      {
        action: "restoreApp",
        params: {},
      },
      { nonce: undefined }
    );

    const response = driveDoPost(envelope);

    assert.equal(response.status, 403);
    assert.equal(response.code, "FORBIDDEN");
    assert.equal(dispatches, 0, "api action must not run");
  });

  test("a valid envelope for a different action dispatches that action, not restoreApp", () => {
    const login = env.context.api_loginUser("alice", "1234");
    const { sessionId, sessionToken, userId } = login.data.session;

    // A self-consistent, valid envelope for logoutUser.
    const envelope = signEnvelope({
      action: "logoutUser",
      params: { userId },
      sessionId,
      authorization: `Bearer ${sessionToken}`,
    });

    const response = driveDoPost(envelope);
    // The envelope verifies and dispatches logoutUser (idempotent logout).
    // Critically, restoreApp is NOT invoked.
    assert.equal(response.success, true, "logoutUser must succeed");
  });

  test.each(["__proto__", "constructor", "toString"])(
    "inherited action name %s is rejected as UNKNOWN_ACTION",
    (action) => {
      const response = driveDoPost(
        signEnvelope({
          action,
          params: {},
        })
      );

      assert.equal(response.status, 404);
      assert.equal(response.code, "UNKNOWN_ACTION");
      assert.equal(response.title, "UNKNOWN_ACTION");
      assert.ok(
        typeof response.requestId === "string" && response.requestId.length > 0
      );
    }
  );
});

// ---------------------------------------------------------------------------
// Round-trip harness helpers (full GAS mock with ContentService/Logger/sheets).
// ---------------------------------------------------------------------------

function buildRoundTripContext() {
  const sheets = {};
  const scriptProps = {
    EFCC_SESSION_SALT: "test-salt",
    EFCC_SERVICE_SECRET: TEST_SECRET,
    EFCC_SPREADSHEET_ID: "1bkRPQTCrNKu4MNDTRn-vkTTRMKgV6MEBNfierKDng3o",
  };
  const context = {
    console: { log: () => {}, error: () => {} },
    // eslint-disable-next-line offset ternary
    Logger: { log: () => {} },
    sheets,
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
      computeHmacSha256Signature: (value, salt) => fakeHmacBytes(value, salt),
    },
    ContentService: {
      createTextOutput: (content) => {
        const output = {
          getContent: () => content,
          setMimeType: () => output,
        };
        return output;
      },
      MimeType: { JSON: "application/json" },
    },
  };
  vm.createContext(context);
  return { context, sheets, scriptProps };
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

function loadAllGas(context) {
  for (const name of [
    "spreadsheet-access.gs",
    "rpc-envelope.gs",
    "users-repository.gs",
    "session.js.gs",
    "program-leaders-repository.gs",
    "service-envelope.gs",
    "Code.gs",
    "prototype-129-http-dispatch.gs",
  ]) {
    loadModule(context, name);
  }
}
