// @vitest-environment node
//
// Tests for service-envelope.ts — canonical serialization, HMAC signing,
// and verification across the Worker <-> Apps Script trust boundary
// (CF1-01 / #151).
//
// These tests run in the default node environment (no pool-workers needed
// for pure logic). The same deterministic vectors are shared with the
// GAS-side tests in tests/gas/service-envelope.test.js.

import assert from "node:assert/strict";
import crypto from "node:crypto";

import { describe, test } from "vitest";

import {
  canonicalJson,
  canonicalJsonExcept,
  hmacSha256Hex,
  signServiceEnvelope,
  verifyServiceEnvelope,
} from "./service-envelope";
import type { ServiceEnvelope } from "./service-envelope";

// Deterministic vectors -- shared across Worker and GAS tests.
const TEST_SECRET = "efcc-test-secret-2026";

// ---------------------------------------------------------------------------
// Canonical JSON
// ---------------------------------------------------------------------------

describe(canonicalJson, () => {
  test("sorts object keys recursively", () => {
    const result = canonicalJson({ z: 1, a: { c: 3, b: 2 } });
    assert.equal(result, `{"a":{"b":2,"c":3},"z":1}`);
  });

  test("handles null, string, number, boolean", () => {
    assert.equal(canonicalJson(null), "null");
    assert.equal(canonicalJson("hello"), `"hello"`);
    assert.equal(canonicalJson(42), "42");
    assert.equal(canonicalJson(true), "true");
    assert.equal(canonicalJson(false), "false");
  });

  test("handles arrays preserving order", () => {
    assert.equal(canonicalJson([3, 1, 2]), "[3,1,2]");
  });

  test("drops undefined values", () => {
    assert.equal(canonicalJson({ a: 1, b: undefined, c: 3 }), `{"a":1,"c":3}`);
  });

  test("empty object", () => {
    assert.equal(canonicalJson({}), "{}");
  });

  test("empty array", () => {
    assert.equal(canonicalJson([]), "[]");
  });

  test("nested arrays", () => {
    assert.equal(canonicalJson({ a: [3, { b: 1 }] }), `{"a":[3,{"b":1}]}`);
  });
});

describe(canonicalJsonExcept, () => {
  test("excludes one top-level key", () => {
    const obj = { a: 1, b: 2, signature: "xyz" };
    assert.equal(canonicalJsonExcept(obj, "signature"), `{"a":1,"b":2}`);
  });

  test("returns empty object when only excluded key remains", () => {
    assert.equal(canonicalJsonExcept({ signature: "x" }, "signature"), "{}");
  });
});

// ---------------------------------------------------------------------------
// HMAC hex
// ---------------------------------------------------------------------------

describe(hmacSha256Hex, () => {
  test("produces hex string matching Node crypto", async () => {
    const data = `{"a":1,"b":2}`;
    const result = await hmacSha256Hex(TEST_SECRET, data);
    const expected = crypto
      .createHmac("sha256", TEST_SECRET)
      .update(data)
      .digest("hex");
    assert.equal(result, expected);
  });

  test("produces 64-char hex string", async () => {
    const result = await hmacSha256Hex(TEST_SECRET, `{"a":1}`);
    assert.equal(result.length, 64);
    assert.ok(/^[0-9a-f]{64}$/u.test(result));
  });
});

// ---------------------------------------------------------------------------
// Sign and verify
// ---------------------------------------------------------------------------

describe(signServiceEnvelope, () => {
  test("produces a valid envelope with all fields", async () => {
    const envelope = await signServiceEnvelope(TEST_SECRET, {
      action: "restoreApp",
      params: { userId: "U-1" },
      sessionId: "sess-1",
      authorization: "Bearer token-abc",
    });
    assert.equal(envelope.version, 1);
    assert.equal(envelope.keyId, "k1");
    assert.equal(typeof envelope.timestamp, "number");
    assert.equal(typeof envelope.nonce, "string");
    assert.equal(typeof envelope.attemptGroup, "string");
    assert.equal(envelope.attemptId, 1);
    assert.equal(envelope.request.action, "restoreApp");
    assert.equal(envelope.request.params.userId, "U-1");
    assert.equal(envelope.request.sessionId, "sess-1");
    assert.equal(envelope.request.authorization, "Bearer token-abc");
    assert.equal(typeof envelope.signature, "string");
    assert.equal(envelope.signature.length, 64);
  });

  test("accepts override options", async () => {
    const envelope = await signServiceEnvelope(
      TEST_SECRET,
      { action: "loginUser", params: {} },
      {
        keyId: "k2",
        nonce: "00000000-0000-0000-0000-000000000001",
        attemptGroup: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      }
    );
    assert.equal(envelope.keyId, "k2");
    assert.equal(envelope.nonce, "00000000-0000-0000-0000-000000000001");
    assert.equal(envelope.attemptGroup, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  });
});

describe(verifyServiceEnvelope, () => {
  test("verifies a validly signed envelope", async () => {
    const envelope = await signServiceEnvelope(TEST_SECRET, {
      action: "restoreApp",
      params: { userId: "U-1" },
    });
    const ok = await verifyServiceEnvelope(TEST_SECRET, envelope);
    assert.equal(ok, true);
  });

  test("rejects a tampered signature", async () => {
    const envelope = await signServiceEnvelope(TEST_SECRET, {
      action: "restoreApp",
      params: { userId: "U-1" },
    });
    const bad = { ...envelope, signature: "f".repeat(64) };
    const ok = await verifyServiceEnvelope(TEST_SECRET, bad);
    assert.equal(ok, false);
  });

  test("rejects a tampered request body", async () => {
    const envelope = await signServiceEnvelope(TEST_SECRET, {
      action: "restoreApp",
      params: { userId: "U-1" },
    });
    const tampered: ServiceEnvelope = {
      ...envelope,
      request: { ...envelope.request, params: { userId: "U-2" } },
    };
    const ok = await verifyServiceEnvelope(TEST_SECRET, tampered);
    assert.equal(ok, false);
  });

  test("rejects with wrong secret", async () => {
    const envelope = await signServiceEnvelope(TEST_SECRET, {
      action: "restoreApp",
      params: {},
    });
    const ok = await verifyServiceEnvelope("wrong-secret", envelope);
    assert.equal(ok, false);
  });
});

// ---------------------------------------------------------------------------
// Deterministic shared vector -- both Worker and GAS must agree on this.
// ---------------------------------------------------------------------------

describe("deterministic vector (shared with GAS)", () => {
  test("pinned canonical JSON and signature", async () => {
    const envelope = await signServiceEnvelope(TEST_SECRET, {
      action: "restoreApp",
      params: {},
      sessionId: "sess-test",
      authorization: "Bearer tok-test",
    });
    const payload = canonicalJsonExcept(
      envelope as unknown as Record<string, unknown>,
      "signature"
    );
    const parsed = JSON.parse(payload);
    assert.equal(parsed.version, 1);
    assert.equal(parsed.request.action, "restoreApp");
    const ok = await verifyServiceEnvelope(TEST_SECRET, envelope);
    assert.equal(ok, true);
  });

  test("pinned gold canonical string — exact byte match with GAS", () => {
    // The same fixed envelope the GAS-side test serializes. Both runtimes
    // must produce this exact canonical string, or the HMAC diverges.
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
    assert.equal(
      canonicalJson(envelope),
      expected,
      "Worker canonical JSON must match the GAS-side pinned vector"
    );
  });

  test("pinned gold signature — exact HMAC hex with GAS", async () => {
    // The HMAC-SHA256 over the pinned canonical payload with TEST_SECRET.
    // The GAS-side test pins the same value (via Node crypto), proving
    // the Web Crypto result and the GAS verifier agree.
    const payload =
      '{"attemptGroup":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","attemptId":1,"keyId":"k1","metadata":{},"nonce":"00000000-0000-0000-0000-000000000001","request":{"action":"restoreApp","authorization":"Bearer tok-test","params":{},"sessionId":"sess-test"},"timestamp":1755000000000,"version":1}';
    const signature = await hmacSha256Hex(TEST_SECRET, payload);
    assert.equal(
      signature,
      "fd52c782ee8ed39101f50bdb59dd4925238165aab41d15f33ec3bc1e3a192765",
      "Worker HMAC must match the GAS-side pinned vector"
    );
  });
});

// ---------------------------------------------------------------------------
// Round-trip: GAS-style HMAC (Node crypto) produces same result as
// Web Crypto API. This is the compatibility assertion.
// ---------------------------------------------------------------------------

describe("HMAC compatibility with Node crypto (GAS surrogate)", () => {
  test("Web Crypto and Node crypto produce identical HMAC for same input", async () => {
    const data = `{"a":1,"b":2}`;
    const webCryptoResult = await hmacSha256Hex(TEST_SECRET, data);
    const nodeResult = crypto
      .createHmac("sha256", TEST_SECRET)
      .update(data)
      .digest("hex");
    assert.equal(webCryptoResult, nodeResult);
  });
});
