/**
 * EFCC 顯恩堂 - Events sheet repository. READ-ONLY (issue #101).
 *
 * Column model per docs/specs/005-dynamic-event-management.md §2:
 *   Event_ID | Program_ID | Event_Date | Time_Slot | Event_Name |
 *   Event_Type | Recurrence_Tag | Created_By | Status
 * Column order is NOT fixed - resolved by header-name matching
 * (case-insensitive), same as the other repositories. Extra columns are
 * silently ignored.
 *
 * Reads are FRESH on every call (no in-execution cache). The check-in
 * critical section re-reads Event status under the caller-owned lock per
 * spec #006 §3 / #51, so a cached read would risk a stale status after a
 * concurrent cancellation. ADR-0013 does not yet map this sheet; the
 * schema here follows draft spec 005 and production creation is a manual
 * operator step (out of scope for the mock-based unit contracts in #101).
 *
 * Apps Script APIs used (per AGENTS.md docs-backed method rule):
 *   - Sheet.getDataRange().getValues():
 *     https://developers.google.com/apps-script/reference/spreadsheet/sheet#getDataRange()
 */

var EVENTS_SHEET_NAME = "Events";

// Columns the Scanner picker and api_qrCheckIn actually read for identity,
// program link, and scheduling. A missing required header fails closed
// (throw) rather than misreading a load-bearing column. STATUS is NOT here:
// the production DEV sheet predates the status-tracking model, so STATUS is
// optional and defaults to "Active" (a sheet with no Status column has no
// cancellation concept; api_qrCheckIn re-validates under the lock and uses
// the real value when the column exists).
var EVENTS_COL_REQUIRED_ = {
  EVENT_ID: ["event_id"],
  PROGRAM_ID: ["program_id"],
  EVENT_DATE: ["event_date"],
  TIME_SLOT: ["time_slot"],
  EVENT_NAME: ["event_name"],
};

// Metadata + status columns the EFCC logic treats as optional. A sheet that
// omits them (the production DEV sheet does) still loads; eventsRowToDto_
// defaults these to "" (or "Active" for STATUS). This is what unblocks the
// Scanner against the real sheet, whose schema diverges from draft spec
// 005's 9-column model.
var EVENTS_COL_OPTIONAL_ = {
  EVENT_TYPE: ["event_type"],
  RECURRENCE_TAG: ["recurrence_tag"],
  CREATED_BY: ["created_by"],
  STATUS: ["status"],
};

/**
 * Resolve column indexes by header name, order-independent. Required headers
 * throw on absence (fail closed rather than misreading a load-bearing column);
 * optional metadata columns resolve to -1 and default to "" / "Active" in
 * eventsRowToDto_.
 *
 * @param {Array<string>} headerRow
 * @returns {Object<string, number>}
 */
function eventsResolveColumns_(headerRow) {
  var normalized = [];
  for (var hi = 0; hi < headerRow.length; hi++) {
    normalized.push(String(headerRow[hi]).trim().toLowerCase());
  }
  var col = {};

  function resolveSet(set, required) {
    var keys = Object.keys(set);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var candidates = set[key];
      var idx = -1;
      for (var c = 0; c < candidates.length; c++) {
        idx = normalized.indexOf(candidates[c]);
        if (idx !== -1) break;
      }
      if (idx === -1 && required) {
        throw new Error(
          "Events sheet is missing a required column. Expected one of: " +
            candidates.join(" / ")
        );
      }
      col[key] = idx;
    }
  }

  resolveSet(EVENTS_COL_REQUIRED_, true);
  resolveSet(EVENTS_COL_OPTIONAL_, false);
  return col;
}

/**
 * Read the Events sheet fresh. Returns the raw 2D array (header + rows) or
 * null if the sheet does not exist.
 *
 * @returns {Array<Array<string>>|null}
 */
function eventsReadAllRaw_() {
  var sheet = efccSpreadsheet_().getSheetByName(EVENTS_SHEET_NAME);
  if (!sheet) return null;
  return sheet.getDataRange().getValues();
}

/**
 * Convert one Events row to a plain DTO.
 *
 * @param {Array} row
 * @param {Object<string, number>} col
 * @returns {{eventId: string, programId: string, eventDate: string,
 *           timeSlot: string, eventName: string, eventType: string,
 *           recurrenceTag: string, createdBy: string, status: string}}
 */
function eventsRowToDto_(row, col) {
  // Optional columns resolve to -1 when the header is absent; row[-1] is
  // undefined, so String(row[-1] || "") -> "". STATUS is special: a missing
  // Status column means the sheet has no cancellation concept, so the event
  // is treated as Active (the check-in RPC re-validates under the lock and
  // uses the real value when the column exists).
  var status =
    col.STATUS >= 0 ? String(row[col.STATUS] || "").trim() : "Active";
  return {
    eventId: String(row[col.EVENT_ID] || "").trim(),
    programId: String(row[col.PROGRAM_ID] || "").trim(),
    eventDate: String(row[col.EVENT_DATE] || ""),
    timeSlot: String(row[col.TIME_SLOT] || ""),
    eventName: String(row[col.EVENT_NAME] || ""),
    eventType: String(row[col.EVENT_TYPE] || ""),
    recurrenceTag: String(row[col.RECURRENCE_TAG] || ""),
    createdBy: String(row[col.CREATED_BY] || ""),
    status: status,
  };
}

/**
 * Return the Event DTO for a given Event_ID or null. Reads fresh every call.
 *
 * @param {string} eventId
 * @returns {Object|null}
 */
function eventsFindById_(eventId) {
  if (!eventId) return null;
  var rows = eventsReadAllRaw_();
  if (!rows || rows.length < 2) return null;
  var col = eventsResolveColumns_(rows[0]);
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][col.EVENT_ID] || "").trim() === String(eventId)) {
      return eventsRowToDto_(rows[i], col);
    }
  }
  return null;
}

/**
 * Return all Event DTOs whose Status is "Active" (case-insensitive). Reads
 * fresh every call. Used by the Scanner Section's Event picker
 * (api_getScannerEvents). Inactive / cancelled / draft events are excluded so
 * the operator can only target a scannable Gathering occurrence (spec #93
 * US 1). The check-in RPC re-reads and re-checks Event status under the lock,
 * so a stale list cannot cause an Attendance write against a since-cancelled
 * Event.
 *
 * @returns {Array<Object>} Active event DTOs (may be empty).
 */
function eventsListActive_() {
  var rows = eventsReadAllRaw_();
  if (!rows || rows.length < 2) return [];
  var col = eventsResolveColumns_(rows[0]);
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var dto = eventsRowToDto_(rows[i], col);
    if (String(dto.status || "").toLowerCase() === "active") {
      out.push(dto);
    }
  }
  return out;
}
