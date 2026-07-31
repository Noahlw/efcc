/**
 * EFCC 顯恩堂 — per-session, non-expiring token storage and revocation.
 *
 * Implements issue #73. The signature input format and keying follow
 * the in-repo acceptance test tests/gas/auth-session.test.js, which
 * pins the wire format:
 *
 *   HMAC value: "|" + userId + "|" + normalizedPin + "|" + issuedAt
 *   HMAC key:   EFCC_SESSION_SALT (read from Script Properties)
 *
 * Session storage uses one `session_<sessionId>` Script Property per
 * active session. The Users sheet is the source of truth for the
 * current PIN (re-read on every verification, so a Sheet-side PIN
 * change self-invalidates) and the live Status (re-checked on every
 * verification, so a flip to Inactive ends the session on the next
 * protected RPC).
 *
 * Apps Script APIs used (per AGENTS.md docs-backed method rule):
 *   - PropertiesService.getScriptProperties():
 *     https://developers.google.com/apps-script/reference/properties/properties-service#getScriptProperties()
 *   - Utilities.computeHmacSha256Signature(value, key):
 *     https://developers.google.com/apps-script/reference/utilities/utilities#computeHmacSha256SignatureValue_Key
 *   - Utilities.getUuid():
 *     https://developers.google.com/apps-script/reference/utilities/utilities#getUuid()
 *
 * The session salt is read from Script Properties and must be
 * configured before deployment. If absent, sessionSalt_ throws and
 * the public RPCs surface a UNAVAILABLE failure envelope (fail
 * closed per ADR-0011).
 */

var EFCC_SESSION_SALT_KEY = "EFCC_SESSION_SALT";
var EFCC_SESSION_PROPERTY_PREFIX = "session_";
var SESSION_DELIMITER = "|";

/**
 * @returns {string} The deployment secret. Throws if absent.
 */
function sessionSalt_() {
  var salt = PropertiesService.getScriptProperties().getProperty(
    EFCC_SESSION_SALT_KEY
  );
  if (!salt) {
    throw new Error(
      "EFCC_SESSION_SALT missing from Script Properties. " +
        "Set it before deploying; fail-closed per ADR-0011."
    );
  }
  return salt;
}

/**
 * Normalize a 4-digit numeric PIN per ADR-0002:
 * strip non-digits, take rightmost 4 digits, zero-pad left to 4.
 *
 * @param {string} raw
 * @returns {string} 4-digit normalized PIN, or "" if no digits.
 */
function sessionNormalizePin_(raw) {
  if (raw === null || raw === undefined) return "";
  var digits = String(raw).replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.length <= 4) {
    while (digits.length < 4) digits = "0" + digits;
    return digits;
  }
  return digits.slice(-4);
}

/**
 * Build the signature input. Per issue #73 the input MUST bind
 * sessionId so that two sessions for the same user produce two
 * distinct tokens, and a token presented against a different
 * sessionId is rejected. The salt is passed as the HMAC key
 * (not appended to the value).
 *
 *   value = "|" + sessionId + "|" + userId + "|" + currentPin + "|" + issuedAt
 *
 * @param {string} sessionId
 * @param {string} userId
 * @param {string} currentPin Normalized 4-digit PIN from the Sheet.
 * @param {number|string} issuedAt Epoch millis or numeric timestamp.
 * @returns {string}
 */
function sessionSignatureValue_(sessionId, userId, currentPin, issuedAt) {
  return (
    SESSION_DELIMITER +
    [sessionId, userId, currentPin, issuedAt].join(SESSION_DELIMITER)
  );
}

/**
 * Compute the HMAC-SHA256 signature using the deployment salt as
 * the key. Returns a lowercase hex string — 64 characters.
 *
 * @param {string} value
 * @param {string} salt
 * @returns {string}
 */
function sessionHmacHex_(value, salt) {
  var bytes = Utilities.computeHmacSha256Signature(value, salt);
  var hex = "";
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] & 0xff;
    hex += (b < 16 ? "0" : "") + b.toString(16);
  }
  return hex;
}

/**
 * Issue a new session for a known user with a known current PIN.
 * Persists the session_<sessionId> entry and returns the public
 * session fields the browser stores.
 *
 * @param {string} userId
 * @param {string} currentPin Already-normalized 4-digit PIN.
 * @returns {{sessionId: string, sessionToken: string, issuedAt: number}}
 */
function sessionIssue_(userId, currentPin) {
  var sessionId = Utilities.getUuid();
  var issuedAt = Date.now();
  var salt = sessionSalt_();
  var token = sessionHmacHex_(
    sessionSignatureValue_(sessionId, userId, currentPin, issuedAt),
    salt
  );
  PropertiesService.getScriptProperties().setProperty(
    EFCC_SESSION_PROPERTY_PREFIX + sessionId,
    JSON.stringify({ userId: userId, issuedAt: issuedAt })
  );
  return { sessionId: sessionId, sessionToken: token, issuedAt: issuedAt };
}

/**
 * Look up a session by its ID. Returns the stored payload or null.
 *
 * @param {string} sessionId
 * @returns {{userId: string, issuedAt: number}|null}
 */
function sessionLookup_(sessionId) {
  if (!sessionId) return null;
  var raw = PropertiesService.getScriptProperties().getProperty(
    EFCC_SESSION_PROPERTY_PREFIX + sessionId
  );
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

/**
 * Delete the session entry. Used by api_logoutUser and on
 * AUTH_REQUIRED restore. Deleting a non-existent key is not an
 * error.
 *
 * @param {string} sessionId
 */
function sessionRevoke_(sessionId) {
  if (!sessionId) return;
  PropertiesService.getScriptProperties().deleteProperty(
    EFCC_SESSION_PROPERTY_PREFIX + sessionId
  );
}

/**
 * Constant-time-ish string equality. Apps Script strings are
 * JavaScript strings; this avoids the early-exit timing channel of
 * plain `===` for token comparison. Not a substitute for a real
 * constant-time primitive, but a meaningful reduction in signal.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function sessionStringEquals_(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  var mismatch = 0;
  for (var i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Verify a presented (sessionId, sessionToken) pair against the
 * stored session and the current Sheet PIN. Returns one of:
 *   { ok: true,  userId, issuedAt } — caller proceeds.
 *   { ok: false, reason: "AUTH_REQUIRED" | "FORBIDDEN" } — caller
 *     maps to the canonical envelope.
 *
 * @param {string} sessionId
 * @param {string} sessionToken
 * @returns {{ok: boolean, reason?: string, userId?: string, issuedAt?: number}}
 */
function sessionVerify_(sessionId, sessionToken) {
  if (!sessionId || !sessionToken) {
    return { ok: false, reason: "AUTH_REQUIRED" };
  }
  var stored = sessionLookup_(sessionId);
  if (!stored) {
    return { ok: false, reason: "AUTH_REQUIRED" };
  }
  var userId = stored.userId;
  var issuedAt = stored.issuedAt;

  // Re-read current PIN from the Sheet so a PIN change
  // self-invalidates.
  var currentPin = usersCurrentPinById_(userId);
  if (!currentPin) {
    return { ok: false, reason: "AUTH_REQUIRED" };
  }

  var salt = sessionSalt_();
  var expected = sessionHmacHex_(
    sessionSignatureValue_(sessionId, userId, currentPin, issuedAt),
    salt
  );
  if (!sessionStringEquals_(expected, sessionToken)) {
    return { ok: false, reason: "AUTH_REQUIRED" };
  }

  // Live status check — covers account deactivation.
  var status = usersStatusById_(userId);
  if (String(status).toLowerCase() !== "active") {
    return { ok: false, reason: "FORBIDDEN" };
  }

  return { ok: true, userId: userId, issuedAt: issuedAt };
}

/**
 * Auth boundary used by every RPC that needs an active session
 * (api_restoreApp, api_getPrograms, api_authorizedNavigate,
 * api_submitDemoTaskForm). Centralises the verify -> userId-mismatch
 * -> active-user guard so the per-RPC bodies stay focused on their
 * business logic.
 *
 * @param {string} op RPC operation name (for logging).
 * @param {string} requestId Request id (for log correlation).
 * @param {number} t0 Epoch ms when the RPC started.
 * @param {string} userId The claimed userId from the caller.
 * @param {string} sessionId
 * @param {string} sessionToken
 * @param {{ revokeOnUserIdMismatch: boolean }} opts
 *   `revokeOnUserIdMismatch: true` only for api_restoreApp (the
 *   session-restoring RPC). The other 3 callers keep `false` per
 *   the SECURITY NOTE in Code.gs: revoking on a userId mismatch
 *   would let an observer of a sessionId force-logout a legitimate
 *   session that happens to have a different sessionId.
 *
 * @returns {
 *   { ok: true, user: Object } |
 *   { ok: false, failure: RpcFailure }
 * }
 *   All three failure branches return the SAME RpcFailure shape
 *   (AUTH_REQUIRED + "工作階段已過期，請重新登入") so the caller
 *   can `return guard.failure;` directly.
 *
 * Does NOT try/catch — exceptions (e.g. sessionSalt_ missing) propagate
 * to the caller's existing catch block, preserving per-RPC catch codes.
 */
function requireActiveSession_(op, requestId, t0, userId, sessionId, sessionToken, opts) {
  var verification = sessionVerify_(sessionId, sessionToken);
  if (!verification.ok) {
    rpcLog_(op, requestId, verification.reason || "AUTH_REQUIRED", Date.now() - t0);
    sessionRevoke_(sessionId);
    return {
      ok: false,
      failure: rpcFailure_(requestId, RPC_CODES.AUTH_REQUIRED, "工作階段已過期，請重新登入"),
    };
  }
  if (verification.userId !== userId) {
    rpcLog_(op, requestId, "AUTH_REQUIRED", Date.now() - t0);
    if (opts && opts.revokeOnUserIdMismatch) {
      sessionRevoke_(sessionId);
    }
    return {
      ok: false,
      failure: rpcFailure_(requestId, RPC_CODES.AUTH_REQUIRED, "工作階段已過期，請重新登入"),
    };
  }
  var user = usersFindById_(verification.userId);
  if (!user || user.status !== "Active") {
    rpcLog_(op, requestId, "FORBIDDEN", Date.now() - t0);
    sessionRevoke_(sessionId);
    return {
      ok: false,
      failure: rpcFailure_(requestId, RPC_CODES.AUTH_REQUIRED, "工作階段已過期，請重新登入"),
    };
  }
  return { ok: true, user: user };
}
