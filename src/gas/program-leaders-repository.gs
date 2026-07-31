/**
 * EFCC 顯恩堂 — Program_Leaders sheet repository.
 * Column order is NOT FIXED — resolved by header-name matching
 * (case-insensitive), same as users-repository.gs and
 * programs-repository.gs.
 *
 * Expected headers (order independent):
 *   Assignment_ID | Program_ID | User_ID | Assigned_By | Assigned_Date | Status
 * This sheet is additive — it does not exist in the legacy production
 * spreadsheet. If the sheet is missing, every query returns empty (the
 * user has no active leadership assignments). This allows the app to
 * function before STAFF/ADMIN create the first assignment.
 *
 * Sheet access is centralized in efccSpreadsheet_().
 *   - Sheet.getDataRange().getValues():
 *     https://developers.google.com/apps-script/reference/spreadsheet/sheet#getDataRange()
 */

var PROGRAM_LEADERS_SHEET_NAME = "Program_Leaders";

var PROGRAM_LEADERS_COL_ = null;
var PROGRAM_LEADERS_CACHE_ = null;
var PROGRAM_LEADERS_LOADED_ = false;

/**
 * Candidate header names per logical field, tried in order,
 * case-insensitively. Same pattern as usersResolveColumns_().
 */
var PROGRAM_LEADERS_COL_CANDIDATES_ = {
  ASSIGNMENT_ID: ["assignment_id"],
  PROGRAM_ID: ["program_id"],
  USER_ID: ["user_id"],
  ASSIGNED_BY: ["assigned_by"],
  ASSIGNED_DATE: ["assigned_date"],
  STATUS: ["status"],
};

/**
 * Resolve column indexes by header name, order-independent.
 * Throws if a required header is missing.
 *
 * @param {Array<string>} headerRow
 * @returns {Object<string, number>}
 */
function programLeadersResolveColumns_(headerRow) {
  return resolveColumnsByCandidates_(headerRow, PROGRAM_LEADERS_COL_CANDIDATES_);
}
/**
 * Read the Program_Leaders sheet. Returns an empty 2D array (header
 * only) if the sheet does not exist — this is normal before the
 * first assignment.
 *
 * @returns {Array<Array<string>>} 2D array, row 0 = header.
 */
function programLeadersReadAll_() {
  if (PROGRAM_LEADERS_LOADED_) return PROGRAM_LEADERS_CACHE_;
  var ss = efccSpreadsheet_();
  var sheet = ss.getSheetByName(PROGRAM_LEADERS_SHEET_NAME);
  if (!sheet) {
    PROGRAM_LEADERS_COL_ = programLeadersResolveColumns_(
      [
        [
          "Assignment_ID",
          "Program_ID",
          "User_ID",
          "Assigned_By",
          "Assigned_Date",
          "Status",
        ],
      ][0]
    );
    PROGRAM_LEADERS_CACHE_ = [];
    PROGRAM_LEADERS_LOADED_ = true;
    return [];
  }
  var rows = sheet.getDataRange().getValues();
  PROGRAM_LEADERS_COL_ = programLeadersResolveColumns_(rows[0]);
  PROGRAM_LEADERS_CACHE_ = rows;
  PROGRAM_LEADERS_LOADED_ = true;
  return rows;
}

/**
 * Allow tests to inject fixture data without touching the sheet.
 */
function programLeadersSetRowsForTesting_(rows) {
  PROGRAM_LEADERS_CACHE_ = rows;
  PROGRAM_LEADERS_COL_ = rows ? programLeadersResolveColumns_(rows[0]) : null;
  PROGRAM_LEADERS_LOADED_ = rows != null;
}

/**
 * Return true if a user has at least one Active Program_Leaders row.
 * The assignment's Program_ID is not checked — this is a binary
 * "is this user a Program Leader anywhere?" gate used by the
 * bootstrap Sections calculator.
 *
 * @param {string} userId
 * @returns {boolean}
 */
function programLeadersHasActiveAssignment_(userId) {
  if (!userId) return false;
  var rows = programLeadersReadAll_();
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (
      String(row[PROGRAM_LEADERS_COL_.USER_ID]) === String(userId) &&
      String(row[PROGRAM_LEADERS_COL_.STATUS]).trim() === "Active"
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Return the set of Program_IDs for which this user has an Active
 * leadership assignment. Used by per-Program RPC authorization.
 *
 * @param {string} userId
 * @returns {Array<string>} Active program IDs (may be empty).
 */
function programLeadersActiveProgramIds_(userId) {
  if (!userId) return [];
  var rows = programLeadersReadAll_();
  var ids = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (
      String(row[PROGRAM_LEADERS_COL_.USER_ID]) === String(userId) &&
      String(row[PROGRAM_LEADERS_COL_.STATUS]).trim() === "Active"
    ) {
      ids.push(String(row[PROGRAM_LEADERS_COL_.PROGRAM_ID]));
    }
  }
  return ids;
}
