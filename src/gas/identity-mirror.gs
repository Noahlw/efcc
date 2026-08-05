/**
 * EFCC D1 → Sheets identity-metadata review mirror (AUTH-03 #161, ADR-0021).
 *
 * Operator-controlled, one-directional mirror endpoint. The Worker signs a
 * non-secret identity META-data snapshot (canonical JSON + HMAC-SHA256) and
 * POSTs it here; D1 remains the sole system of record and the ONLY
 * authorization source. This script writes the review rows into a human
 * read-only Google Sheet and NEVER reads the sheet back as any kind of
 * authorization input.
 *
 * Correctness contract (ADR-0021):
 *   * Idempotent + convergent: repeated runs append new rows and update
 *     changed rows only — never a destructive whole-sheet clear/rewrite, and
 *     never a duplicate row for the same user_id.
 *   * Fail closed: an invalid signature, missing/duplicate user identifiers,
 *     a script-lock failure, or any Sheets API failure aborts the run with a
 *     secret-free diagnostic and no partial write.
 *   * No secrets: the payload carries only review metadata — never credential
 *     hashes, legacy-PIN hashes, or session values.
 *
 * Apps Script APIs used (official docs):
 *   - ContentService / doPost web-app hook:
 *     https://developers.google.com/apps-script/guides/web
 *   - Utilities.computeHmacSha256Signature(value, key):
 *     https://developers.google.com/apps-script/reference/utilities/utilities
 *   - SpreadsheetApp, LockService, PropertiesService (Script Properties).
 */

var IDENTITY_MIRROR_SHEET_ID_KEY = "EFCC_IDENTITY_MIRROR_SHEET_ID";
var IDENTITY_MIRROR_SECRET_KEY = "EFCC_SERVICE_SECRET";
var IDENTITY_MIRROR_SHEET_NAME = "IdentityReview";
var IDENTITY_MIRROR_LAST_KEY = "lastIdentityMirrorIdempotencyKey";
var IDENTITY_MIRROR_VERSION = 1;

/** Column order of the review sheet (index 0 = user_id). */
var IDENTITY_MIRROR_COLUMNS = [
  "user_id",
  "name",
  "username",
  "role",
  "account_status",
  "credential_kind",
  "requires_upgrade",
  "lock_level",
  "created_at",
  "updated_at",
];

/**
 * @returns {string} the shared Worker↔Apps Script service secret; throws if
 *   absent (fail closed).
 */
function identityMirrorSecret_() {
  var secret = PropertiesService
    .getScriptProperties()
    .getProperty(IDENTITY_MIRROR_SECRET_KEY);
  if (!secret) {
    throw new Error(IDENTITY_MIRROR_SECRET_KEY + " missing from Script Properties.");
  }
  return secret;
}

/** Recursively sort keys and produce compact JSON (must match the Worker). */
function identityMirrorCanonicalJson_(obj) {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "string") return JSON.stringify(obj);
  if (typeof obj === "number" && isFinite(obj)) return String(obj);
  if (typeof obj === "boolean") return String(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map(identityMirrorCanonicalJson_).join(",") + "]";
  }
  if (typeof obj === "object") {
    var keys = Object.keys(obj).sort();
    var pairs = [];
    for (var i = 0; i < keys.length; i++) {
      var val = obj[keys[i]];
      if (val === undefined) continue;
      pairs.push(JSON.stringify(keys[i]) + ":" + identityMirrorCanonicalJson_(val));
    }
    return "{" + pairs.join(",") + "}";
  }
  return "null";
}

/** HMAC-SHA256 hex string, matching the Worker's Web Crypto signing. */
function identityMirrorHmacHex_(secret, data) {
  var bytes = Utilities.computeHmacSha256Signature(data, secret);
  var hex = "";
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] & 0xff;
    hex += (b < 16 ? "0" : "") + b.toString(16);
  }
  return hex;
}

/**
 * Verify the signed envelope. Returns the verified accounts array, or an
 * {error: {status, code, detail}} fail-closed object when invalid.
 */
function identityMirrorVerifyEnvelope_(envelope) {
  if (!envelope || typeof envelope !== "object") {
    return { error: { status: 400, code: "BAD_REQUEST", detail: "Body is not a mirror envelope." } };
  }
  if (envelope.version !== IDENTITY_MIRROR_VERSION) {
    return { error: { status: 400, code: "BAD_REQUEST", detail: "Unsupported envelope version." } };
  }
  if (typeof envelope.signature !== "string" || envelope.signature.length === 0) {
    return { error: { status: 400, code: "BAD_REQUEST", detail: "Missing signature." } };
  }
  if (!Array.isArray(envelope.accounts)) {
    return { error: { status: 400, code: "BAD_REQUEST", detail: "Missing accounts payload." } };
  }

  var secret;
  try {
    secret = identityMirrorSecret_();
  } catch (e) {
    return { error: { status: 500, code: "UNAVAILABLE", detail: "Mirror not configured." } };
  }

  // Signature payload excludes the signature field itself.
  var payload = identityMirrorCanonicalJson_({
    version: envelope.version,
    issuedAt: envelope.issuedAt,
    idempotencyKey: envelope.idempotencyKey,
    accounts: envelope.accounts,
  });
  var expected = identityMirrorHmacHex_(secret, payload);
  if (expected !== envelope.signature) {
    return { error: { status: 403, code: "FORBIDDEN", detail: "Invalid signature." } };
  }
  return { accounts: envelope.accounts, idempotencyKey: envelope.idempotencyKey };
}

/**
 * Validate the review payload: every account has a non-empty user_id and no
 * user_id is duplicated. Returns a fail-closed validation error otherwise.
 */
function identityMirrorValidateAccounts_(accounts) {
  var seen = {};
  var problems = [];
  for (var i = 0; i < accounts.length; i++) {
    var acct = accounts[i];
    var uid = acct && typeof acct.user_id === "string" ? acct.user_id.trim() : "";
    if (!uid) {
      problems.push("account index " + i + " is missing user_id");
    } else if (seen[uid]) {
      problems.push("duplicate user_id '" + uid + "'");
    }
    seen[uid] = true;
  }
  if (problems.length > 0) {
    return { error: { status: 422, code: "CONFLICT", detail: problems.join("; ") } };
  }
  return null;
}

/** Open (or create) the review sheet. Throws on misconfiguration. */
function identityMirrorSheet_() {
  var sheetId = PropertiesService
    .getScriptProperties()
    .getProperty(IDENTITY_MIRROR_SHEET_ID_KEY);
  if (!sheetId) {
    throw new Error(IDENTITY_MIRROR_SHEET_ID_KEY + " missing from Script Properties.");
  }
  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(IDENTITY_MIRROR_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(IDENTITY_MIRROR_SHEET_NAME);
    sheet.appendRow(IDENTITY_MIRROR_COLUMNS);
  }
  return sheet;
}

/**
 * Apply the snapshot idempotently: append new rows, update changed rows in
 * place, never clear the sheet and never duplicate a user_id. Returns
 * {added, updated, total}.
 */
function identityMirrorApply_(sheet, accounts) {
  var values = sheet.getDataRange().getValues();
  var header = values[0] || [];
  // Locate the user_id column by header name (tolerant of reordered columns,
  // fail closed if the header is missing).
  var uidCol = -1;
  for (var c = 0; c < header.length; c++) {
    if (String(header[c]).trim() === "user_id") { uidCol = c; break; }
  }
  if (uidCol === -1) {
    throw new Error("Review sheet is missing the user_id header column.");
  }

  var rowByUid = {};
  for (var r = 1; r < values.length; r++) {
    var uid = String(values[r][uidCol] || "").trim();
    if (uid) rowByUid[uid] = r + 1; // 1-indexed sheet row
  }

  var added = 0;
  var updated = 0;
  for (var i = 0; i < accounts.length; i++) {
    var acct = accounts[i];
    var row = IDENTITY_MIRROR_COLUMNS.map(function (key) { return acct[key]; });
    var existing = rowByUid[String(acct.user_id).trim()];
    if (existing) {
      // Update the existing row in place (no duplicate).
      sheet
        .getRange(existing, 1, 1, IDENTITY_MIRROR_COLUMNS.length)
        .setValues([row]);
      updated++;
    } else {
      sheet.appendRow(row);
      added++;
    }
  }
  return { added: added, updated: updated, total: values.length - 1 + added };
}

/**
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  var status = 200;
  var responseBody;

  try {
    var body = JSON.parse(e.postData.contents || "null");
    var verified = identityMirrorVerifyEnvelope_(body);
    if (verified.error) {
      status = verified.error.status;
      responseBody = {
        status: status,
        code: verified.error.code,
        detail: verified.error.detail,
        added: 0,
        updated: 0,
        total: 0,
      };
    } else {
      var validation = identityMirrorValidateAccounts_(verified.accounts);
      if (validation) {
        status = validation.error.status;
        responseBody = {
          status: status,
          code: validation.error.code,
          detail: validation.error.detail,
          added: 0,
          updated: 0,
          total: 0,
        };
      } else {
        // Serialize concurrent mirror runs so appends never interleave.
        var lock = LockService.getScriptLock();
        var locked = lock.tryLock(10_000);
        if (!locked) {
          status = 503;
          responseBody = {
            status: status,
            code: "UNAVAILABLE",
            detail: "Another mirror run is in progress.",
            added: 0,
            updated: 0,
            total: 0,
          };
        } else {
          try {
            var props = PropertiesService.getScriptProperties();
            var lastKey = props.getProperty(IDENTITY_MIRROR_LAST_KEY);
            if (lastKey === verified.idempotencyKey) {
              // Exact same snapshot already applied -> no-op, convergent.
              responseBody = {
                status: 200,
                code: "ALREADY_APPLIED",
                added: 0,
                updated: 0,
                total: 0,
              };
            } else {
              var sheet = identityMirrorSheet_();
              var summary = identityMirrorApply_(sheet, verified.accounts);
              props.setProperty(
                IDENTITY_MIRROR_LAST_KEY,
                verified.idempotencyKey
              );
              responseBody = {
                status: 200,
                added: summary.added,
                updated: summary.updated,
                total: summary.total,
              };
            }
          } finally {
            lock.releaseLock();
          }
        }
      }
    }
  } catch (err) {
    // Secret-free, fail-closed: log the raw error for operators, never expose
    // err.message/stack/sheet ids to the caller.
    Logger.log(
      "identity-mirror doPost error: " + (err && err.stack ? err.stack : err)
    );
    status = 500;
    responseBody = {
      status: 500,
      code: "INTERNAL_ERROR",
      detail: "Mirror run failed. No partial write was applied.",
      added: 0,
      updated: 0,
      total: 0,
    };
  }

  return ContentService.createTextOutput(
    JSON.stringify(responseBody)
  ).setMimeType(ContentService.MimeType.JSON);
}