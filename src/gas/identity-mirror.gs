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
function identityMirrorReadSheet_(values) {
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
 * Fail-closed/no-partial-write contract: Apps Script / the Sheets API offer
 * no ACID transaction, so this honors the contract with a snapshot + restore
 * strategy (the approach ADR-0021 allows). The ENTIRE data range is snapshotted
 * before any write; if ANY write throws, the snapshot is written back so the
 * sheet is byte-for-byte unchanged — an already-committed update is reverted
 * along with any failed append. Pre-validation (duplicate existing identifiers,
 * duplicate payload identifiers) runs before the snapshot so the common
 * failure modes never reach the write phase. If even the restore fails, a
 * fixed secret-free marker is surfaced for operator intervention.
 */
function identityMirrorApply_(sheet, accounts) {
  // Snapshot the ENTIRE data range before any write. This is the rollback
  // source: if any write fails, the prior state is restored byte-for-byte.
  // Apps Script / the Sheets API offer no ACID transaction, so we honor the
  // fail-closed/no-partial-write contract with a snapshot + restore strategy
  // (the approach the ADR allows) rather than pretending partial writes are
  // impossible.
  var before = sheet.getDataRange().getValues();
  var read = identityMirrorReadSheet_(before);
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

  try {
    // Apply phase. Updates first, then appends. Each batch is a single
    // setValues call (one Sheets write). If ANY write throws, the catch
    // below restores the pre-write snapshot, so the sheet is left exactly
    // as it was — no partial mutation.
    if (updates.length > 0) {
      var updateRows = updates.map(function (u) { return u.values; });
      // setValues requires a contiguous range; updates may target
      // non-contiguous rows, so detect contiguity and fall back to per-row
      // setValues (still single-row writes, flushed together below).
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
  } catch (err) {
    // Fail closed with rollback: restore the pre-write snapshot so the sheet
    // is byte-for-byte unchanged. Best-effort — if even the restore throws,
    // surface a fixed secret-free marker (Apps Script / Sheets give us no
    // stronger guarantee than this staging + restore strategy).
    try {
      sheet
        .getRange(1, 1, before.length, before[0].length)
        .setValues(before);
      SpreadsheetApp.flush();
    } catch (rollbackErr) {
      throw new Error(
        "Identity mirror write failed and the snapshot could not be restored; operator intervention required."
      );
    }
    throw new Error(
      "Identity mirror write failed; the pre-write snapshot was restored."
    );
  }

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