/**
 * EFCC signed service envelope verifier (CF1-01 / #151).
 *
 * Verifies the versioned HMAC-SHA-256 service envelope constructed by the
 * Worker. The canonical JSON serialization must match the Worker's
 * precisely — both sides must produce identical byte-for-byte JSON for
 * the HMAC to verify.
 *
 * This module is read-only: it verifies, it does not sign. The Worker
 * constructs the envelope; Apps Script only verifies it.
 *
 * Apps Script APIs used:
 *   - Utilities.computeHmacSha256Signature(value, key):
 *     https://developers.google.com/apps-script/reference/utilities/utilities#computeHmacSha256SignatureValue_Key
 *   - Utilities.getUuid():
 *     https://developers.google.com/apps-script/reference/utilities/utilities#getUuid()
 */

/**
 * The service shared secret key name in Script Properties.
 * Must match what the Worker uses (set via EFCC_SERVICE_SECRET env var).
 */
var EFCC_SERVICE_SECRET_KEY = "EFCC_SERVICE_SECRET";

/**
 * @returns {string} The service secret. Throws if absent.
 */
function serviceSecret_() {
  var secret = PropertiesService.getScriptProperties().getProperty(
    EFCC_SERVICE_SECRET_KEY
  );
  if (!secret) {
    throw new Error(
      EFCC_SERVICE_SECRET_KEY +
        " missing from Script Properties. Fail-closed per ADR-0018."
    );
  }
  return secret;
}

/**
 * Recursively sort object keys and produce compact JSON.
 * Must match canonicalJson() in web/lib/service-envelope.ts exactly.
 *
 * @param {*} obj
 * @returns {string}
 */
function serviceCanonicalJson_(obj) {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "string") return JSON.stringify(obj);
  if (typeof obj === "number" && isFinite(obj)) return String(obj);
  if (typeof obj === "boolean") return String(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map(serviceCanonicalJson_).join(",") + "]";
  }
  if (typeof obj === "object") {
    var keys = Object.keys(obj).sort();
    var pairs = [];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var val = obj[k];
      if (val === undefined) continue;
      pairs.push(JSON.stringify(k) + ":" + serviceCanonicalJson_(val));
    }
    return "{" + pairs.join(",") + "}";
  }
  return "null";
}

/**
 * Canonical JSON of an object with one top-level key excluded.
 *
 * @param {Object} obj
 * @param {string} excludeKey
 * @returns {string}
 */
function serviceCanonicalJsonExcept_(obj, excludeKey) {
  var keys = Object.keys(obj)
    .filter(function (k) {
      return k !== excludeKey;
    })
    .sort();
  var pairs = [];
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var val = obj[k];
    if (val === undefined) continue;
    pairs.push(JSON.stringify(k) + ":" + serviceCanonicalJson_(val));
  }
  return "{" + pairs.join(",") + "}";
}

/**
 * Compute HMAC-SHA256 hex string, matching the Worker's Web Crypto API.
 *
 * @param {string} secret
 * @param {string} data
 * @returns {string}
 */
function serviceHmacHex_(secret, data) {
  var bytes = Utilities.computeHmacSha256Signature(data, secret);
  var hex = "";
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] & 0xff;
    hex += (b < 16 ? "0" : "") + b.toString(16);
  }
  return hex;
}

/**
 * Constant-time string comparison.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function serviceStringEquals_(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  var mismatch = 0;
  for (var i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Verify a service envelope. Returns the verified request on success,
 * or null on failure.
 *
 * @param {Object} envelope The parsed service envelope from the Worker.
 * @returns {{action: string, params: Object, sessionId: string|null, authorization: string|null, idempotencyKey: string|null}|null}
 */
function serviceVerifyEnvelope_(envelope) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope))
    return null;
  if (envelope.version !== 1) return null;
  if (typeof envelope.keyId !== "string" || envelope.keyId.length === 0)
    return null;
  if (typeof envelope.timestamp !== "number" || !isFinite(envelope.timestamp))
    return null;
  if (typeof envelope.nonce !== "string" || envelope.nonce.length === 0)
    return null;
  if (
    typeof envelope.attemptGroup !== "string" ||
    envelope.attemptGroup.length === 0
  )
    return null;
  if (
    typeof envelope.attemptId !== "number" ||
    !isFinite(envelope.attemptId) ||
    envelope.attemptId < 1 ||
    Math.floor(envelope.attemptId) !== envelope.attemptId
  )
    return null;
  if (
    !envelope.request ||
    typeof envelope.request !== "object" ||
    Array.isArray(envelope.request)
  )
    return null;
  if (
    typeof envelope.request.action !== "string" ||
    envelope.request.action.length === 0
  )
    return null;
  if (
    !envelope.request.params ||
    typeof envelope.request.params !== "object" ||
    Array.isArray(envelope.request.params)
  )
    return null;
  if (
    envelope.request.sessionId !== undefined &&
    typeof envelope.request.sessionId !== "string"
  )
    return null;
  if (
    envelope.request.authorization !== undefined &&
    typeof envelope.request.authorization !== "string"
  )
    return null;
  if (
    envelope.request.idempotencyKey !== undefined &&
    typeof envelope.request.idempotencyKey !== "string"
  )
    return null;
  if (
    !envelope.metadata ||
    typeof envelope.metadata !== "object" ||
    Array.isArray(envelope.metadata)
  )
    return null;
  if (typeof envelope.signature !== "string" || envelope.signature.length === 0)
    return null;

  var secret;
  try {
    secret = serviceSecret_();
  } catch (e) {
    return null;
  }

  var payload = serviceCanonicalJsonExcept_(envelope, "signature");
  var expected = serviceHmacHex_(secret, payload);

  if (!serviceStringEquals_(expected, envelope.signature)) return null;

  // Extract the verified request.
  var req = envelope.request;
  return {
    action: req.action,
    params: req.params,
    sessionId: typeof req.sessionId === "string" ? req.sessionId : null,
    authorization:
      typeof req.authorization === "string" ? req.authorization : null,
    idempotencyKey:
      typeof req.idempotencyKey === "string" ? req.idempotencyKey : null,
  };
}
