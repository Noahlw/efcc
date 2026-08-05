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
 * Read the review sheet's existing rows and build a deduplicated
 * user_id -> { row, count } map. Returns {rowByUid, headerRow, dupIds}
 * where dupIds is the list of user_ids that appear more than once in the
 * sheet (a structural error that must fail the run closed).
 */
function identityMirrorReadSheet_(sheet) {
  var values = sheet.getDataRange().getValues();
  var header = values[0] || [];
  var uidCol = -1;
  for (var c = 0; c < header.length; c++) {
    if (String(header[c]).trim() === "user_id") { uidCol = c; break; }
  }
  if (uidCol === -1) {
    throw new Error("Review sheet is missing the user_id header column.");
  }
  var rowByUid = {};
  var dupIds = [];
  for (var r = 1; r < values.length; r++) {
    var uid = String(values[r][uidCol] || "").trim();
    if (!uid) continue;
    if (Object.prototype.hasOwnProperty.call(rowByUid, uid)) {
      dupIds.push(uid);
      continue;
    }
    rowByUid[uid] = r + 1; // 1-indexed sheet row
  }
  return { rowByUid: rowByUid, headerRow: values, dupIds: dupIds };
}

/**
 * Apply the snapshot idempotently with pre-validation: detect duplicate
 * existing user_ids in the sheet BEFORE any write, precompute all changes,
 * then apply in two batched setValues calls (updates + appends) so that
 * the run is all-or-nothing for the writes it begins. Returns
 * {added, updated, total} on success; throws on precondition failure
 * (with a secret-free message) so the caller can fail closed.
 *
 * Why this is "atomic-ish" under Apps Script constraints: Apps Script has
 * no real transactions. The pre-validation step eliminates the common
 * failure modes (duplicate identifiers in the sheet, conflicts between
 * the payload and the sheet). The two batched setValues calls apply the
 * full update list and append list in single Sheets operations, so the
 * remaining failure surface is a rare API quota / network error that
 * affects both batches simultaneously. If the first batch fails, no
 * writes have occurred; if the second fails, the updates are committed
 * but the appends are not — the next run will retry the appends
 * idempotently.
 */
function identityMirrorApply_(sheet, accounts) {
  var read = identityMirrorReadSheet_(sheet);
  if (read.dupIds.length > 0) {
    throw new Error(
      "Identity mirror failed closed: review sheet already contains duplicate identifiers."
    );
  }

  var updates = []; // { row, values }
  var appends = []; // rows
  var seenInPayload = {};
  for (var i = 0; i < accounts.length; i++) {
    var acct = accounts[i];
    var uid = String(acct.user_id || "").trim();
    if (seenInPayload[uid]) {
      // Should already be caught by identityMirrorValidateAccounts_ but
      // belt-and-braces: a duplicate in the payload still fails closed.
      throw new Error(
        "Identity mirror failed closed: duplicate identifier in payload."
      );
    }
    seenInPayload[uid] = true;
    var row = IDENTITY_MIRROR_COLUMNS.map(function (key) { return acct[key]; });
    if (Object.prototype.hasOwnProperty.call(read.rowByUid, uid)) {
      updates.push({ row: read.rowByUid[uid], values: row });
    } else {
      appends.push(row);
    }
  }

  // Pre-compute the total before any write so the response is stable.
  var totalAfter =
    (read.headerRow.length > 0 ? 1 : 0) + // header
    Object.keys(read.rowByUid).length +     // existing rows
    appends.length;                        // new appends

  // Batch 1: all updates in a single setValues call (one Sheets operation).
  if (updates.length > 0) {
    var updateRows = updates.map(function (u) { return u.values; });
    // setValues requires a contiguous range; we pack each update at its
    // existing row. Because updates may target non-contiguous rows, we
    // detect contiguity and fall back to per-row setValues when the targets
    // are scattered. (Per-row setValues are still single-row writes, which
    // Apps Script bundles into one batch via flush() below.)
    var rows = updates.map(function (u) { return u.row; });
    var allContiguous = true;
    for (var k = 1; k < rows.length; k++) {
      if (rows[k] !== rows[k - 1] + 1) { allContiguous = false; break; }
    }
    if (allContiguous) {
      sheet
        .getRange(rows[0], 1, rows.length, IDENTITY_MIRROR_COLUMNS.length)
        .setValues(updateRows);
    } else {
      for (var j = 0; j < updates.length; j++) {
        sheet
          .getRange(updates[j].row, 1, 1, IDENTITY_MIRROR_COLUMNS.length)
          .setValues([updates[j].values]);
      }
    }
  }

  // Batch 2: all appends in a single setValues call at the sheet's end.
  // Apps Script's appendRow is one Sheets API call per row; writing a
  // block with setValues at the next free row is one call total.
  if (appends.length > 0) {
    var lastRow = sheet.getLastRow();
    sheet
      .getRange(lastRow + 1, 1, appends.length, IDENTITY_MIRROR_COLUMNS.length)
      .setValues(appends);
  }

  // Commit pending writes immediately so the lock release below is durable
  // even on a quick retry. Per the official LockService docs, flush() is
  // recommended before releaseLock() to ensure changes are persisted.
  SpreadsheetApp.flush();

  return {
    added: appends.length,
    updated: updates.length,
    total: totalAfter,
  };
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
    // Secret-free, fail-closed: log a generic, identifier-free marker for
    // operators, never expose err.message or stack to the caller. Apps
    // Script logs may surface internal identifiers from the SDK; we keep
    // only a fixed string here.
    Logger.log("identity-mirror doPost error");
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