/**
 * EFCC 顯恩堂 — Users sheet repository.
 *
 * Reads from the `Users` sheet defined in CONTEXT.md:
 *   User_ID | Name | Username | PIN_Code | Phone | Role | Status | QR_Code_String
 *    (0)      (1)     (2)       (3)       (4)     (5)    (6)       (7)
 *
 * Sheet access follows the existing repo convention
 * (efccSpreadsheet_().getSheetByName(...)). All
 * Sheets reads return JSON-safe plain objects — no Date / Range ever
 * crosses an RPC boundary.
 *
 * Apps Script APIs used (per AGENTS.md docs-backed method rule):
 *   - Sheet.getDataRange().getValues():
 *     https://developers.google.com/apps-script/reference/spreadsheet/sheet#getDataRange()
 *
 * Lookup is case-insensitive on `Username` per ADR-0002.
 */

var USERS_SHEET_NAME = "Users";

/**
 * Resolved lazily from the sheet's actual header row by
 * usersReadAll_ / usersSetRowsForTesting_. Do NOT assume a fixed
 * column order — the production Users sheet has been observed to
 * carry extra columns (Email, Date of Birth, Age, Whatsapp
 * Message, etc.) in a different order than the columns documented
 * in CONTEXT.md. Resolving by header name (matching the pre-rebuild
 * implementation's approach) keeps column reads correct regardless
 * of sheet column order/additions.
 */
var USERS_COL = null;

/**
 * Candidate header names per logical field, tried in order,
 * case-insensitively. ROLE accepts both the documented "Role" and
 * the production sheet's actual "System_Role" header.
 */
var USERS_COL_CANDIDATES_ = {
  USER_ID: ["User_ID"],
  NAME: ["Name"],
  USERNAME: ["Username"],
  PIN_CODE: ["PIN_Code"],
  PHONE: ["Phone"],
  ROLE: ["Role", "System_Role"],
  STATUS: ["Status"],
  QR_CODE_STRING: ["QR_Code_String"],
};

/**
 * Resolve the required USERS_COL indices from an actual header
 * row. Throws if any required logical field has no matching header
 * — fail closed rather than silently misreading columns.
 *
 * @param {Array<string>} headerRow
 * @returns {Object<string, number>}
 */
function usersResolveColumns_(headerRow) {
  var normalized = headerRow.map(function (h) {
    return String(h).trim().toLowerCase();
  });
  var col = {};
  var keys = Object.keys(USERS_COL_CANDIDATES_);
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k];
    var candidates = USERS_COL_CANDIDATES_[key];
    var idx = -1;
    for (var c = 0; c < candidates.length; c++) {
      idx = normalized.indexOf(candidates[c].toLowerCase());
      if (idx !== -1) break;
    }
    if (idx === -1) {
      throw new Error(
        "Users sheet is missing a required column. Expected one of: " +
          candidates.join(" / ")
      );
    }
    col[key] = idx;
  }
  return col;
}

var USERS_ROW_CACHE_ = null;

/**
 * Read the Users sheet once per execution. Apps Script quotas make
 * repeated getValues() calls expensive; this is a tiny in-execution
 * memoization, not a cross-execution cache. Also resolves USERS_COL
 * from the actual header row on first read.
 *
 * @returns {Array<Array<string>>} 2D array, row 0 = header.
 */
function usersReadAll_() {
  if (USERS_ROW_CACHE_) return USERS_ROW_CACHE_;
  var sheet = efccSpreadsheet_().getSheetByName(USERS_SHEET_NAME);
  if (!sheet) {
    throw new Error(
      "Users sheet '" +
        USERS_SHEET_NAME +
        "' is missing. " +
        "Seed it per CONTEXT.md before deploying."
    );
  }
  USERS_ROW_CACHE_ = sheet.getDataRange().getValues();
  USERS_COL = usersResolveColumns_(USERS_ROW_CACHE_[0]);
  return USERS_ROW_CACHE_;
}

/**
 * Allow tests to inject fixture data without touching the sheet.
 * Also resolves USERS_COL from the fixture's header row so direct
 * fixture injection behaves like the real sheet path.
 * @param {Array<Array<string>>|null} rows Pass null to clear.
 */
function usersSetRowsForTesting_(rows) {
  USERS_ROW_CACHE_ = rows;
  USERS_COL = rows ? usersResolveColumns_(rows[0]) : null;
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
    if (String(rows[i][USERS_COL.USER_ID]) === String(userId)) {
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
    if (String(rows[i][USERS_COL.USER_ID]) === String(userId)) {
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
    role: String(row[USERS_COL.ROLE] || "MEMBER")
      .trim()
      .toUpperCase(),
    status: String(row[USERS_COL.STATUS] || ""),
    qrCodeString: String(row[USERS_COL.QR_CODE_STRING] || ""),
    __sheetRow: sheetRow,
  };
}
