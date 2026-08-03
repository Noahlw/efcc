/**
 * Scanner prototype pure-core unit tests (issue #100 - Seam 4 Shared Prototype).
 *
 * The external camera page's testable seams are the pure, browser-agnostic
 * pieces: scannedCode normalization (mirrors the #101 server contract),
 * postMessage payload shape, secure-origin targeting (never `*`), and
 * MediaStream teardown. Real camera/decode/backgrounding proof is the
 * real-device matrix (see prototype/scanner/README.md) and is out of CI scope
 * per spec #93 Seam 4.
 */

import assert from "node:assert/strict";

import { describe, test } from "vitest";

import {
  MAX_CODE_LENGTH,
  RESULT_MESSAGE_TYPE,
  SCAN_MESSAGE_TYPE,
  buildHandshakePayload,
  buildResultPayload,
  buildScanPayload,
  isSecureOrigin,
  normalizeScannedCode,
  parseResultMessage,
  postScannedCodeToOpener,
  stopStreamTracks,
} from "../../prototype/scanner/scanner-core.js";

// Module-scope test helpers (do not capture parent scope - oxlint scoping rule).

function makeOpener() {
  const calls = [];
  return {
    calls,
    opener: {
      postMessage: (payload, targetOrigin) => {
        calls.push({ payload, targetOrigin });
      },
      closed: false,
    },
  };
}

function makeTrack() {
  return {
    stopped: false,
    stop() {
      this.stopped = true;
    },
  };
}

function makeStream(tracks) {
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
    getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
  };
}

// ---------------------------------------------------------------------------
// scannedCode normalization
// ---------------------------------------------------------------------------

describe("scannedCode normalization", () => {
  test("trims surrounding whitespace", () => {
    assert.equal(normalizeScannedCode("  GC-0001-0002  "), "GC-0001-0002");
  });

  test("collapses nothing internal - only leading/trailing trim", () => {
    assert.equal(normalizeScannedCode("GC 0001"), "GC 0001");
  });

  test("returns null for empty string", () => {
    assert.equal(normalizeScannedCode(""), null);
  });

  test("returns null for whitespace-only string", () => {
    assert.equal(normalizeScannedCode("   \t\n  "), null);
  });

  test("returns null for over-max-length string", () => {
    assert.equal(normalizeScannedCode("x".repeat(MAX_CODE_LENGTH + 1)), null);
  });

  test("accepts a string exactly at the max length", () => {
    const code = "x".repeat(MAX_CODE_LENGTH);
    assert.equal(normalizeScannedCode(code), code);
  });

  test("returns null for non-string input", () => {
    assert.equal(normalizeScannedCode(null), null);
    // Calling with no argument passes `undefined` (the non-string path).
    assert.equal(normalizeScannedCode(), null);
    assert.equal(normalizeScannedCode(1234), null);
    assert.equal(normalizeScannedCode({ text: "GC-1" }), null);
  });

  test("handles a realistic GC-XXXX-XXXX member code", () => {
    assert.equal(normalizeScannedCode("GC-MEM-0001"), "GC-MEM-0001");
  });
});

// ---------------------------------------------------------------------------
// scan payload (bridge contract)
// ---------------------------------------------------------------------------

describe("scan payload (bridge contract)", () => {
  test("produces the bridge contract shape { type, scannedCode }", () => {
    assert.deepEqual(buildScanPayload("GC-MEM-0001"), {
      type: SCAN_MESSAGE_TYPE,
      scannedCode: "GC-MEM-0001",
    });
  });

  test("uses the stable EFCC_QR_SCAN message type", () => {
    assert.equal(SCAN_MESSAGE_TYPE, "EFCC_QR_SCAN");
  });

  test("carries the already-normalized code verbatim", () => {
    const payload = buildScanPayload("GC-ABC-1234");
    assert.equal(payload.scannedCode, "GC-ABC-1234");
    assert.equal(typeof payload.scannedCode, "string");
  });

  test("never carries a userId or member DTO field", () => {
    const payload = buildScanPayload("GC-MEM-0001");
    assert.ok(!("userId" in payload), "payload must not carry userId");
    assert.ok(!("member" in payload), "payload must not carry a member DTO");
    assert.ok(!("name" in payload), "payload must not carry a name");
  });
});

// ---------------------------------------------------------------------------
// secure origin validation
// ---------------------------------------------------------------------------

describe("secure origin validation", () => {
  test("accepts an https origin without a path", () => {
    assert.equal(isSecureOrigin("https://noahlw.github.io"), true);
  });

  test("accepts an https origin with a non-default port", () => {
    assert.equal(isSecureOrigin("https://scanner.example:8443"), true);
  });

  test("rejects http origins (camera/postMessage need secure context)", () => {
    assert.equal(isSecureOrigin("http://noahlw.github.io"), false);
  });

  test("rejects the wildcard target origin", () => {
    assert.equal(isSecureOrigin("*"), false);
  });

  test("rejects empty / whitespace strings", () => {
    assert.equal(isSecureOrigin(""), false);
    assert.equal(isSecureOrigin("   "), false);
  });

  test("rejects origins that include a path (origin is scheme+host[:port] only)", () => {
    // An opener origin with a trailing path is malformed for postMessage
    // targeting; flag it so the caller never posts to a bad target.
    assert.equal(isSecureOrigin("https://noahlw.github.io/repo"), false);
  });

  test("rejects origins that include a query string", () => {
    assert.equal(isSecureOrigin("https://noahlw.github.io?x=1"), false);
  });
});

// ---------------------------------------------------------------------------
// post scannedCode to opener
// ---------------------------------------------------------------------------

describe("post scannedCode to opener", () => {
  test("posts the normalized payload with the exact opener origin (never *)", () => {
    const { calls, opener } = makeOpener();
    const ok = postScannedCodeToOpener(
      opener,
      "GC-MEM-0001",
      "https://noahlw.github.io"
    );
    assert.equal(ok, true);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].payload, {
      type: SCAN_MESSAGE_TYPE,
      scannedCode: "GC-MEM-0001",
    });
    assert.equal(calls[0].targetOrigin, "https://noahlw.github.io");
    assert.notEqual(calls[0].targetOrigin, "*");
  });

  test("returns false and posts nothing when opener is null", () => {
    const { calls, opener } = makeOpener();
    const ok = postScannedCodeToOpener(
      null,
      "GC-MEM-0001",
      "https://noahlw.github.io"
    );
    assert.equal(ok, false);
    assert.equal(calls.length, 0);
    // opener unused but referenced to keep the harness honest
    assert.ok(opener);
  });

  test("returns false and posts nothing when opener.closed is true", () => {
    const { calls, opener } = makeOpener();
    opener.closed = true;
    const ok = postScannedCodeToOpener(
      opener,
      "GC-MEM-0001",
      "https://noahlw.github.io"
    );
    assert.equal(ok, false);
    assert.equal(calls.length, 0);
  });

  test("returns false and posts nothing for a non-secure target origin", () => {
    const { calls, opener } = makeOpener();
    const ok = postScannedCodeToOpener(opener, "GC-MEM-0001", "*");
    assert.equal(ok, false);
    assert.equal(calls.length, 0);
  });

  test("returns false and posts nothing for an empty target origin", () => {
    const { calls, opener } = makeOpener();
    const ok = postScannedCodeToOpener(opener, "GC-MEM-0001", "");
    assert.equal(ok, false);
    assert.equal(calls.length, 0);
  });

  test("posts at most once per call (no duplicate frames)", () => {
    const { calls, opener } = makeOpener();
    postScannedCodeToOpener(opener, "GC-MEM-0001", "https://app.example");
    postScannedCodeToOpener(opener, "GC-MEM-0001", "https://app.example");
    assert.equal(calls.length, 2);
    // Each call is one post; the prototype's caller-side guard suppresses
    // repeats, but the core itself never double-posts a single decode.
  });
});

// ---------------------------------------------------------------------------
// stream track teardown
// ---------------------------------------------------------------------------

describe("stream track teardown", () => {
  test("stops every track on the stream", () => {
    const a = makeTrack();
    const b = makeTrack();
    const count = stopStreamTracks(makeStream([a, b]));
    assert.equal(count, 2);
    assert.equal(a.stopped, true);
    assert.equal(b.stopped, true);
  });

  test("returns 0 and is null-safe for a missing stream", () => {
    assert.equal(stopStreamTracks(null), 0);
    // Calling with no argument passes `undefined` (the missing-stream path).
    assert.equal(stopStreamTracks(), 0);
  });

  test("is idempotent - calling twice does not throw", () => {
    const t = makeTrack();
    const stream = makeStream([t]);
    stopStreamTracks(stream);
    assert.doesNotThrow(() => stopStreamTracks(stream));
  });

  test("a track whose stop() throws is swallowed (teardown must be best-effort)", () => {
    const boom = {
      stop() {
        throw new Error("already stopped");
      },
    };
    const good = makeTrack();
    const count = stopStreamTracks(makeStream([boom, good]));
    assert.equal(count, 2);
    assert.equal(good.stopped, true);
  });
});

// ---------------------------------------------------------------------------
// Bidirectional bridge contract: handshake + result (return leg). The scanner
// learns the opener origin from the handshake event.origin, and the App
// Document posts the check-in result back so the scanner can show inline
// ✓/✗ feedback.
// ---------------------------------------------------------------------------

describe("handshake payload (bridge contract)", () => {
  test("carries the type and the event name for the scanner top bar", () => {
    const p = buildHandshakePayload({ eventName: "青崇 - 07/12/2026" });
    assert.equal(p.type, "EFCC_QR_HANDSHAKE");
    assert.equal(p.eventName, "青崇 - 07/12/2026");
  });

  test("defaults the event name to empty when context is absent", () => {
    const p = buildHandshakePayload();
    assert.equal(p.type, "EFCC_QR_HANDSHAKE");
    assert.equal(p.eventName, "");
  });
});

describe("result payload (return-leg contract)", () => {
  test("shapes a success result for the scanner overlay", () => {
    const p = buildResultPayload({
      tone: "success",
      message: "張三 已簽到",
    });
    assert.equal(p.type, RESULT_MESSAGE_TYPE);
    assert.equal(p.tone, "success");
    assert.equal(p.message, "張三 已簽到");
    assert.equal(p.action, "resume");
  });

  test("shapes an error result", () => {
    const p = buildResultPayload({
      tone: "error",
      message: "找不到此會員",
    });
    assert.equal(p.tone, "error");
    assert.equal(p.message, "找不到此會員");
    assert.equal(p.action, "resume");
  });
});

describe("result message parsing", () => {
  test("accepts a well-shaped result", () => {
    const r = parseResultMessage({
      type: RESULT_MESSAGE_TYPE,
      tone: "success",
      message: "張三 已簽到",
    });
    assert.deepEqual(r, {
      tone: "success",
      message: "張三 已簽到",
      action: "resume",
    });
  });

  test("rejects a scan message (wrong type)", () => {
    assert.equal(
      parseResultMessage({ type: SCAN_MESSAGE_TYPE, scannedCode: "GC-1" }),
      null
    );
  });

  test("rejects an unknown tone", () => {
    assert.equal(
      parseResultMessage({
        type: RESULT_MESSAGE_TYPE,
        tone: "boom",
        message: "x",
      }),
      null
    );
  });

  test("rejects an empty / non-string message", () => {
    assert.equal(
      parseResultMessage({
        type: RESULT_MESSAGE_TYPE,
        tone: "success",
        message: "   ",
      }),
      null
    );
    assert.equal(
      parseResultMessage({
        type: RESULT_MESSAGE_TYPE,
        tone: "success",
        message: 42,
      }),
      null
    );
  });

  test("rejects non-object input", () => {
    assert.equal(parseResultMessage(null), null);
    assert.equal(parseResultMessage("EFCC_QR_RESULT"), null);
    assert.equal(parseResultMessage(), null);
  });
});
