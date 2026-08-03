/**
 * EFCC 顯恩堂 - Attendances sheet repository (issue #101).
 *
 * Column model per docs/specs/006-attendance-tracking.md §2:
 *   Attendance_ID | Event_ID | User_ID | CheckIn_Time | CheckIn_Method |
 *   CheckIn_By | Status
 * Status is `Active` or `Voided` (retained correction, never a deleted
 * row). Column order is NOT fixed - resolved by header-name matching
 * (case-insensitive).
 *
 * Reads are FRESH on every call (no in-execution cache). The check-in
 * critical section re-reads active Attendance state under the caller-owned
 * lock per spec #006 §3 / #51 so a concurrent scan cannot slip past a
 * stale duplicate check. Writes use Sheet.appendRow.
 *
 * ADR-0013 documents a legacy `Attendances` shape (Member_Name, Event_Date,
 * ...); the rebuild (ADR-0008) adopts the spec 006 shape with the Status
 * column required for active/voided semantics. Production sheet creation
 * is a manual operator step (out of scope for #101's mock-based tests).
 *
 * Apps Script APIs used (per AGENTS.md docs-backed method rule):
 *   - Sheet.getDataRange().getValues():
 *     https://developers.google.com/apps-script/reference/spreadsheet/sheet#getDataRange()
 *   - Sheet.appendRow(rowContents):
 *     https://developers.google.com/apps-script/reference/spreadsheet/sheet#appendRow(Object)
 *     ("Appends a row to the bottom of the current data region in the
 *     sheet. rowContents - any[] ... Return type Sheet.")
 */

var ATTENDANCES_SHEET_NAME = "Attendances";

var ATTENDANCES_COL_CANDIDATES_ = {
  ATTENDANCE_ID: ["attendance_id"],
  EVENT_ID: ["event_id"],
  USER_ID: ["user_id"],
  CHECKIN_TIME: ["checkin_time", "check_in_time"],
  CHECKIN_METHOD: ["checkin_method", "check_in_method"],
  CHECKIN_BY: ["checkin_by", "check_in_by"],
  STATUS: ["status"],
};

/**
 * Resolve column indexes by header name, order-independent. Throws if a
 * required header is missing.
 *
 * @param {Array<string>} headerRow
 * @returns {Object<string, number>}
 */
function attendancesResolveColumns_(headerRow) {
  var normalized = [];
  for (var hi = 0; hi < headerRow.length; hi++) {
    normalized.push(String(headerRow[hi]).trim().toLowerCase());
  }
  var col = {};
  var keys = Object.keys(ATTENDANCES_COL_CANDIDATES_);
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k];
    var candidates = ATTENDANCES_COL_CANDIDATES_[key];
    var idx = -1;
    for (var c = 0; c < candidates.length; c++) {
      idx = normalized.indexOf(candidates[c]);
      if (idx !== -1) break;
    }
    if (idx === -1) {
      throw new Error(
        "Attendances sheet is missing a required column. Expected one of: " +
          candidates.join(" / ")
      );
    }
    col[key] = idx;
  }
  return col;
}

/**
 * Read the Attendances sheet fresh. Returns the raw 2D array or null if
 * the sheet does not exist.
 *
 * @returns {Array<Array<string>>|null}
 */
function attendancesReadAllRaw_() {
  var sheet = efccSpreadsheet_().getSheetByName(ATTENDANCES_SHEET_NAME);
  if (!sheet) return null;
  return sheet.getDataRange().getValues();
}

/**
 * Return the active Attendance DTO for (eventId, userId) or null. "Active"
 * means Status === "Active" (a Voided row does not block a later scan per
 * spec 006 §3.4). Reads fresh every call.
 *
 * @param {string} eventId
 * @param {string} userId
 * @returns {{attendanceId: string, eventId: string, userId: string,
 *           checkInTime: string, checkInMethod: string, checkInBy: string,
 *           status: string}|null}
 */
function attendancesFindActive_(eventId, userId) {
  if (!eventId || !userId) return null;
  var rows = attendancesReadAllRaw_();
  if (!rows || rows.length < 2) return null;
  var col = attendancesResolveColumns_(rows[0]);
  for (var i = 1; i < rows.length; i++) {
    if (
      String(rows[i][col.EVENT_ID] || "").trim() === String(eventId) &&
      String(rows[i][col.USER_ID] || "").trim() === String(userId) &&
      String(rows[i][col.STATUS] || "")
        .trim()
        .toLowerCase() === "active"
    ) {
      return {
        attendanceId: String(rows[i][col.ATTENDANCE_ID] || ""),
        eventId: String(rows[i][col.EVENT_ID] || ""),
        userId: String(rows[i][col.USER_ID] || ""),
        checkInTime: String(rows[i][col.CHECKIN_TIME] || ""),
        checkInMethod: String(rows[i][col.CHECKIN_METHOD] || ""),
        checkInBy: String(rows[i][col.CHECKIN_BY] || ""),
        status: String(rows[i][col.STATUS] || ""),
      };
    }
  }
  return null;
}

/**
 * Append one Attendance row. The caller MUST already hold the caller-owned
 * script lock (spec #006 §3); this helper acquires no nested lock. The row
 * is written in spec 006 column order.
 *
 * @param {{attendanceId: string, eventId: string, userId: string,
 *          checkInTime: string, checkInMethod: string, checkInBy: string,
 *          status: string}} record
 */
function attendancesAppend_(record) {
  var sheet = efccSpreadsheet_().getSheetByName(ATTENDANCES_SHEET_NAME);
  if (!sheet) {
    throw new Error(
      "Attendances sheet '" + ATTENDANCES_SHEET_NAME + "' is missing."
    );
  }
  sheet.appendRow([
    record.attendanceId,
    record.eventId,
    record.userId,
    record.checkInTime,
    record.checkInMethod,
    record.checkInBy,
    record.status,
  ]);
}
