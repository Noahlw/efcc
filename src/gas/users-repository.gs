/**
 * EFCC 顯恩堂 — Users sheet repository.
 *
 * Reads from the `Users` sheet defined in CONTEXT.md:
 *   User_ID | Name | Username | PIN_Code | Phone | Role | Status | QR_Code_String
 *    (0)      (1)     (2)       (3)       (4)     (5)    (6)       (7)
 *
 * Sheet access follows the existing repo convention
 * (SpreadsheetApp.getActiveSpreadsheet().getSheetByName(...)). All
 * Sheets reads return JSON-safe plain objects — no Date / Range ever
 * crosses an RPC boundary.
 *
 * Apps Script APIs used (per AGENTS.md docs-backed method rule):
 *   - SpreadsheetApp.getActiveSpreadsheet():
 *     https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet-app#getActiveSpreadsheet()
 *   - Sheet.getDataRange().getValues():
 *     https://developers.google.com/apps-script/reference/spreadsheet/sheet#getDataRange()
 *
 * Lookup is case-insensitive on `Username` per ADR-0002.
 */

var USERS_SHEET_NAME = "Users";
var USERS_COL = {
  USER_ID: 0,
  NAME: 1,
  USERNAME: 2,
  PIN_CODE: 3,
  PHONE: 4,
  ROLE: 5,
  STATUS: 6,
  QR_CODE_STRING: 7,
};

var USERS_ROW_CACHE_ = null;

/**
 * Read the Users sheet once per execution. Apps Script quotas make
 * repeated getValues() calls expensive; this is a tiny in-execution
 * memoization, not a cross-execution cache.
 *
 * @returns {Array<Array<string>>} 2D array, row 0 = header.
 */
function usersReadAll_() {
  if (USERS_ROW_CACHE_) return USERS_ROW_CACHE_;
  var sheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(USERS_SHEET_NAME);
  if (!sheet) {
    throw new Error(
      "Users sheet '" +
        USERS_SHEET_NAME +
        "' is missing. " +
        "Seed it per CONTEXT.md before deploying."
    );
  }
  USERS_ROW_CACHE_ = sheet.getDataRange().getValues();
  return USERS_ROW_CACHE_;
}

/**
 * Allow tests to inject fixture data without touching the sheet.
 * @param {Array<Array<string>>|null} rows Pass null to clear.
 */
function usersSetRowsForTesting_(rows) {
  USERS_ROW_CACHE_ = rows;
}

/**
 * Lowercase, trim, and strip a username for lookup. Returns "" if
 * the result is empty.
 *
 * @param {string} raw
 * @returns {string}
 */
function usersNormalizeUsername_(raw) {
  if (raw === null || raw === undefined) return "";
  return String(raw).trim().toLowerCase();
}

/**
 * Return the user row for a given username (case-insensitive) or
 * null. The row is returned as a plain object with all 8 columns
 * plus a `__row` field for tests/debugging.
 *
 * @param {string} username
 * @returns {Object|null}
 */
function usersFindByUsername_(username) {
  var normalized = usersNormalizeUsername_(username);
  if (!normalized) return null;
  var rows = usersReadAll_();
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var u = usersNormalizeUsername_(row[USERS_COL.USERNAME]);
    if (u === normalized) {
      return usersRowToDto_(row, i + 1);
    }
  }
  return null;
}

/**
 * Return the user row for a given User_ID or null.
 *
 * @param {string} userId
 * @returns {Object|null}
 */
function usersFindById_(userId) {
  if (!userId) return null;
  var rows = usersReadAll_();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][USERS_COL.USER_ID] === userId) {
      return usersRowToDto_(rows[i], i + 1);
    }
  }
  return null;
}

/**
 * Return just the current normalized PIN for a user, or "" if the
 * user does not exist. Used by sessionVerify_ to recompute the
 * signature on every protected RPC.
 *
 * @param {string} userId
 * @returns {string}
 */
function usersCurrentPinById_(userId) {
  if (!userId) return "";
  var rows = usersReadAll_();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][USERS_COL.USER_ID] === userId) {
      return sessionNormalizePin_(rows[i][USERS_COL.PIN_CODE]);
    }
  }
  return "";
}

/**
 * Return the current Status for a user, or "" if the user does not
 * exist. Used by sessionVerify_ to enforce the live Active check.
 *
 * @param {string} userId
 * @returns {string}
 */
function usersStatusById_(userId) {
  var user = usersFindById_(userId);
  if (!user) return "";
  return user.status;
}

/**
 * Convert one Users row to the public DTO shape that crosses the
 * google.script.run boundary. PIN is intentionally omitted; the
 * caller can call usersCurrentPinById_ separately when needed.
 *
 * @param {Array<string>} row
 * @param {number} sheetRow 1-indexed, for diagnostics only.
 * @returns {{
 *   userId: string,
 *   name: string,
 *   username: string,
 *   role: string,
 *   status: string,
 *   qrCodeString: string
 * }}
 */
function usersRowToDto_(row, sheetRow) {
  return {
    userId: String(row[USERS_COL.USER_ID] || ""),
    name: String(row[USERS_COL.NAME] || ""),
    username: String(row[USERS_COL.USERNAME] || ""),
    phone: String(row[USERS_COL.PHONE] || ""),
    role: String(row[USERS_COL.ROLE] || "MEMBER"),
    status: String(row[USERS_COL.STATUS] || ""),
    qrCodeString: String(row[USERS_COL.QR_CODE_STRING] || ""),
    __sheetRow: sheetRow,
  };
}
