/**
 * EFCC 顯恩堂 - Enrollments sheet repository. READ-ONLY (issue #101).
 *
 * Column model per docs/specs/002-program-enrollment.md §2:
 *   Enrollment_ID | User_ID | Program_ID | Timestamp | Status
 * Status is `Active` or `Cancelled` (soft delete). Column order is NOT
 * fixed - resolved by header-name matching (case-insensitive).
 *
 * Reads are FRESH on every call (no in-execution cache) so the check-in
 * critical section can re-read active enrollment state under the
 * caller-owned lock per spec #006 §3 / #51. ADR-0013 does not yet map
 * this sheet; the schema follows draft spec 002 and production creation
 * is a manual operator step (out of scope for #101's mock-based tests).
 *
 * Apps Script APIs used (per AGENTS.md docs-backed method rule):
 *   - Sheet.getDataRange().getValues():
 *     https://developers.google.com/apps-script/reference/spreadsheet/sheet#getDataRange()
 */

var ENROLLMENTS_SHEET_NAME = "Enrollments";

var ENROLLMENTS_COL_CANDIDATES_ = {
  ENROLLMENT_ID: ["enrollment_id"],
  USER_ID: ["user_id"],
  PROGRAM_ID: ["program_id"],
  TIMESTAMP: ["timestamp"],
  STATUS: ["status"],
};

/**
 * Resolve column indexes by header name, order-independent. Throws if a
 * required header is missing.
 *
 * @param {Array<string>} headerRow
 * @returns {Object<string, number>}
 */
function enrollmentsResolveColumns_(headerRow) {
  var normalized = [];
  for (var hi = 0; hi < headerRow.length; hi++) {
    normalized.push(String(headerRow[hi]).trim().toLowerCase());
  }
  var col = {};
  var keys = Object.keys(ENROLLMENTS_COL_CANDIDATES_);
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k];
    var candidates = ENROLLMENTS_COL_CANDIDATES_[key];
    var idx = -1;
    for (var c = 0; c < candidates.length; c++) {
      idx = normalized.indexOf(candidates[c]);
      if (idx !== -1) break;
    }
    if (idx === -1) {
      throw new Error(
        "Enrollments sheet is missing a required column. Expected one of: " +
          candidates.join(" / ")
      );
    }
    col[key] = idx;
  }
  return col;
}

/**
 * Read the Enrollments sheet fresh. Returns the raw 2D array or null if
 * the sheet does not exist.
 *
 * @returns {Array<Array<string>>|null}
 */
function enrollmentsReadAllRaw_() {
  var sheet = efccSpreadsheet_().getSheetByName(ENROLLMENTS_SHEET_NAME);
  if (!sheet) return null;
  return sheet.getDataRange().getValues();
}

/**
 * Return true if `userId` has an Active enrollment in `programId`.
 * Reads fresh every call.
 *
 * @param {string} userId
 * @param {string} programId
 * @returns {boolean}
 */
function enrollmentsHasActive_(userId, programId) {
  if (!userId || !programId) return false;
  var rows = enrollmentsReadAllRaw_();
  if (!rows || rows.length < 2) return false;
  var col = enrollmentsResolveColumns_(rows[0]);
  for (var i = 1; i < rows.length; i++) {
    if (
      String(rows[i][col.USER_ID] || "").trim() === String(userId) &&
      String(rows[i][col.PROGRAM_ID] || "").trim() === String(programId) &&
      String(rows[i][col.STATUS] || "")
        .trim()
        .toLowerCase() === "active"
    ) {
      return true;
    }
  }
  return false;
}
