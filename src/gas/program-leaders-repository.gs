/**
 * EFCC 顯恩堂 — Program_Leaders sheet repository.
 *
 * Reads from the Program_Leaders sheet per ADR-0006 / issue #63:
 *   Assignment_ID | Program_ID | User_ID | Assigned_By | Assigned_Date | Status
 *        (0)           (1)        (2)        (3)           (4)          (5)
 *
 * This sheet is additive — it does not exist in the legacy production
 * spreadsheet. If the sheet is missing, every query returns empty (the
 * user has no active leadership assignments). This allows the app to
 * function before STAFF/ADMIN create the first assignment.
 *
 * Apps Script APIs used (per AGENTS.md docs-backed method rule):
 *   - SpreadsheetApp.getActiveSpreadsheet():
 *     https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet-app#getActiveSpreadsheet()
 *   - Sheet.getDataRange().getValues():
 *     https://developers.google.com/apps-script/reference/spreadsheet/sheet#getDataRange()
 */

var PROGRAM_LEADERS_SHEET_NAME = "Program_Leaders";

var PROGRAM_LEADERS_CACHE_ = null;

/**
 * Read the Program_Leaders sheet. Returns an empty 2D array (header
 * only) if the sheet does not exist — this is normal before the
 * first assignment.
 *
 * @returns {Array<Array<string>>} 2D array, row 0 = header.
 */
function programLeadersReadAll_() {
  if (PROGRAM_LEADERS_CACHE_) return PROGRAM_LEADERS_CACHE_;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(PROGRAM_LEADERS_SHEET_NAME);
  if (!sheet) {
    // Sheet doesn't exist yet — no assignments. Return a minimal
    // header row so callers always get a valid 2D array.
    PROGRAM_LEADERS_CACHE_ = [
      [
        "Assignment_ID",
        "Program_ID",
        "User_ID",
        "Assigned_By",
        "Assigned_Date",
        "Status",
      ],
    ];
    return PROGRAM_LEADERS_CACHE_;
  }
  PROGRAM_LEADERS_CACHE_ = sheet.getDataRange().getValues();
  return PROGRAM_LEADERS_CACHE_;
}

/**
 * Allow tests to inject fixture data without touching the sheet.
 * @param {Array<Array<string>>|null} rows Pass null to clear.
 */
function programLeadersSetRowsForTesting_(rows) {
  PROGRAM_LEADERS_CACHE_ = rows;
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
      String(row[2]) === String(userId) &&
      String(row[5]).trim() === "Active"
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
      String(row[2]) === String(userId) &&
      String(row[5]).trim() === "Active"
    ) {
      ids.push(String(row[1]));
    }
  }
  return ids;
}
