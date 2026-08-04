/**
 * EFCC 顯恩堂 — shared RPC response envelope helpers.
 *
 * Per docs/specs/009-phone-first-shell-navigation.md (RPC contract),
 * issue #50 (authentication boundary), and the in-repo acceptance
 * test tests/gas/auth-session.test.js. Every browser-callable
 * server function returns one of these shapes.
 *
 * Envelope shape (must remain stable; the test asserts these field
 * names exactly):
 *
 *   RpcSuccess<T> = { success: true, requestId: string, data: T }
 *   RpcFailure    = {
 *     success: false,
 *     requestId: string,
 *     error: { code: string, message: string }
 *   }
 *
 * Codes are stable English tokens; `message` is Traditional Chinese
 * and is what the user sees. `requestId` is opaque and used to
 * correlate client requests with server log lines.
 *
 * Apps Script APIs used (per AGENTS.md docs-backed method rule):
 *   - Utilities.getUuid():
 *     https://developers.google.com/apps-script/reference/utilities/utilities#getUuid()
 */

var RPC_CODES = Object.freeze({
  AUTH_REQUIRED: "AUTH_REQUIRED",
  FORBIDDEN: "FORBIDDEN",
  VALIDATION: "VALIDATION",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  UNAVAILABLE: "UNAVAILABLE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  // Check-in business outcomes (issue #101). English code keys only; all
  // operator-visible copy stays Traditional Chinese per spec #93 US 50.
  NOT_ENROLLED: "NOT_ENROLLED",
  MEMBER_NOT_FOUND: "MEMBER_NOT_FOUND",
  MEMBER_INACTIVE: "MEMBER_INACTIVE",
  EVENT_NOT_FOUND: "EVENT_NOT_FOUND",
  EVENT_NOT_ACTIVE: "EVENT_NOT_ACTIVE",
});

/**
 * Build a successful envelope.
 * @param {string} requestId
 * @param {Object} data
 * @returns {{success: true, requestId: string, data: Object}}
 */
function rpcSuccess_(requestId, data) {
  return { success: true, requestId: requestId, data: data || {} };
}

/**
 * Build a failure envelope.
 * @param {string} requestId
 * @param {string} code One of RPC_CODES.
 * @param {string} message Traditional Chinese user message.
 * @returns {{success: false, requestId: string, error: {code: string, message: string}}}
 */
function rpcFailure_(requestId, code, message) {
  return {
    success: false,
    requestId: requestId,
    error: { code: code, message: message },
  };
}

/**
 * Return a request ID for the in-flight RPC. The same value is
 * returned in the envelope and in the diagnostic log line so the
 * client request can be correlated to the server execution.
 * @returns {string}
 */
function rpcRequestId_() {
  return Utilities.getUuid();
}

/**
 * Emit a structured diagnostic record. Never log PINs, session
 * tokens, or sensitive personal data — the assertion in
 * tests/gas/auth-session.test.js enforces that the username,
 * name, PIN, and QR string never appear in any log line.
 *
 * @param {string} operation RPC name.
 * @param {string} requestId
 * @param {string} outcome "SUCCESS" or a RPC_CODES value.
 * @param {number} durationMs
 */
function rpcLog_(operation, requestId, outcome, durationMs) {
  console.log({
    operation: operation,
    requestId: requestId,
    outcome: outcome,
    durationMs: durationMs | 0,
  });
}
