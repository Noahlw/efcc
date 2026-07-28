// =============================================================================
// events-svc.gs — Events: list, create, cancel (T03, ADR-0008 SPA rebuild)
//
// Per ADR-0008, this is a fresh reimplementation from docs/archieved-code/
// 程式碼.js (NOT a port of the previous multi-page build). Lives in the shared
// global scope of the GAS runtime; depends on normalize utilities in Code.gs
// (normalizeId_, findHeaderIndex_, normalizeHeader_) and the session / RBAC
// helpers in auth.gs (verifySessionToken_, getUserRole_, hasRoleAtLeast_,
// checkIsGrantedUser_, getUserEnrolledProgramIds_, getProgramsCatalog_).
//
// RBAC model (ADR-0006):
//   - List upcoming events for the member's enrolled programs: ANY
//     authenticated user (baseline view access; mirror of chrome access).
//   - Create / cancel events: STAFF or ADMIN for ANY program; otherwise
//     requires an `Active` Program_Leaders row for the SPECIFIC program
//     (NOT a global grant — per-program scoping per ADR-0006).
//   - The per-program check is server-authoritative. The client fragment
//     also re-checks role + grant in initEvents() as defense-in-depth
//     (ADR-0008 Architecture Summary §RBAC).
//
// Audit (ADR-0009): create and cancel are privileged mutations. Each one:
//   1. Verifies session and per-program authorization (returns failure
//      WITHOUT writing any ATTEMPT row if the caller is not allowed to start).
//   2. Writes the ATTEMPT row, capturing the returned Correlation_ID.
//   3. Performs the actual Sheets mutation inside a try block.
//   4. Writes SUCCESS on normal return, ERROR in catch — sharing one
//      Correlation_ID. The exception is rethrown so the client sees the
//      failure (per ADR-0009 — do NOT swallow).
//
// Setup note (from archive): `generateMonthlyRecurringEvents` should be
// attached to a time-driven trigger (month timer, 1st of the month) AFTER
// `clasp push`. This file is auto-loaded by GAS; no manifest entry needed.
// =============================================================================


// ---------------------------------------------------------------------------
// Per-program leader-grant check (ADR-0006 scope model)
// ---------------------------------------------------------------------------

/**
 * Returns true iff `userId` has an `Active` row in `Program_Leaders` for the
 * SPECIFIC `programId`. STAFF/ADMIN bypass (handled by callers, not here —
 * callers check role first so the leader-grant lookup is never wasted on
 * global staff). Used by api_createEvent / api_cancelEvent.
 */
function hasActiveLeaderGrantForProgram_(userId, programId) {
  var targetUserId = normalizeId_(userId);
  var targetProgramId = normalizeId_(programId);
  if (!targetUserId || !targetProgramId) return false;

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Program_Leaders");
  if (!sheet) return false;

  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return false;

  var headers = data[0];
  var userIdx = findHeaderIndex_(headers, [
    "user_id",
    "user id",
    "userid",
    "member_id",
    "member id",
  ]);
  var progIdx = findHeaderIndex_(headers, [
    "program_id",
    "program id",
    "programid",
  ]);
  var statusIdx = findHeaderIndex_(headers, ["status"]);
  if (userIdx === -1 || progIdx === -1) return false;

  for (var i = 1; i < data.length; i++) {
    if (normalizeId_(data[i][userIdx]) !== targetUserId) continue;
    if (normalizeId_(data[i][progIdx]) !== targetProgramId) continue;
    var status = statusIdx >= 0
      ? String(data[i][statusIdx] == null ? "" : data[i][statusIdx])
          .trim()
          .toLowerCase()
      : "active";
    if (!status || status === "active") return true;
    return false;
  }
  return false;
}

/**
 * Returns the set of Program_IDs the user is an Active leader of (no global
 * staff/admin bypass — that's the caller's job to add). Used to populate
 * the client-side create-event program picker for granted users.
 */
function getLeaderProgramIds_(userId) {
  var targetUserId = normalizeId_(userId);
  var result = {};
  if (!targetUserId) return result;

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Program_Leaders");
  if (!sheet) return result;

  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return result;

  var headers = data[0];
  var userIdx = findHeaderIndex_(headers, [
    "user_id",
    "user id",
    "userid",
    "member_id",
    "member id",
  ]);
  var progIdx = findHeaderIndex_(headers, [
    "program_id",
    "program id",
    "programid",
  ]);
  var statusIdx = findHeaderIndex_(headers, ["status"]);
  if (userIdx === -1 || progIdx === -1) return result;

  for (var i = 1; i < data.length; i++) {
    if (normalizeId_(data[i][userIdx]) !== targetUserId) continue;
    var status = statusIdx >= 0
      ? String(data[i][statusIdx] == null ? "" : data[i][statusIdx])
          .trim()
          .toLowerCase()
      : "active";
    if (status && status !== "active") continue;
    var pid = normalizeId_(data[i][progIdx]);
    if (pid) result[pid] = true;
  }
  return result;
}


// ---------------------------------------------------------------------------
// Internal: events-sheet reader
// ---------------------------------------------------------------------------

/**
 * Internal: reads Events sheet and returns a normalized array of events.
 * Sorted by eventDate ascending. Past events are excluded; cancelled
 * events are excluded from the default view (used by the member list).
 * Filters by an optional `allowedProgramIds` lookup; an empty/null filter
 * means "no events".
 */
function readEventsFromSheet_(allowedProgramIds, includeCancelled) {
  var out = [];
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Events");
  if (!sheet) return out;

  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return out;

  var headers = data[0];
  var eventIdCol = findHeaderIndex_(headers, ["event_id", "eventid"]);
  var progIdCol = findHeaderIndex_(headers, [
    "program_id",
    "program id",
    "programid",
  ]);
  var eventNameCol = findHeaderIndex_(headers, [
    "event_name",
    "event name",
    "eventname",
  ]);
  var eventDateCol = findHeaderIndex_(headers, [
    "event_date",
    "event date",
    "eventdate",
  ]);
  var timeSlotCol = findHeaderIndex_(headers, [
    "time_slot",
    "time slot",
    "timeslot",
  ]);
  var eventTypeCol = findHeaderIndex_(headers, ["event_type", "eventtype"]);
  var recurCol = findHeaderIndex_(headers, [
    "recurrence_type",
    "recurrence type",
    "recurrencetype",
    "recurrence",
  ]);
  var statusCol = findHeaderIndex_(headers, ["status"]);
  var createdByCol = findHeaderIndex_(headers, [
    "created_by",
    "createdby",
  ]);
  var createdAtCol = findHeaderIndex_(headers, [
    "created_at",
    "createdat",
  ]);

  if (eventIdCol === -1 || progIdCol === -1 || eventDateCol === -1) return out;

  var today = new Date();
  today.setHours(0, 0, 0, 0);

  for (var i = 1; i < data.length; i++) {
    var rawDate = data[i][eventDateCol];
    var eventDateStr = String(rawDate == null ? "" : rawDate).trim();
    if (!eventDateStr) continue;

    // Past-event filter: parse dd/MM/YYYY if possible; otherwise keep the row
    // (string dates we can't parse are not reliably comparable).
    var dateParts = eventDateStr.split("/");
    var isFuture = true;
    if (dateParts.length === 3) {
      var eventDate = new Date(
        parseInt(dateParts[2], 10),
        parseInt(dateParts[1], 10) - 1,
        parseInt(dateParts[0], 10)
      );
      if (!isNaN(eventDate.getTime()) && eventDate < today) isFuture = false;
    }

    var rowStatus = statusCol >= 0
      ? String(data[i][statusCol] == null ? "" : data[i][statusCol])
          .trim()
          .toLowerCase()
      : "active";
    var isCancelled = rowStatus && rowStatus !== "active";

    if (!includeCancelled && isCancelled) continue;
    if (!isFuture) continue;

    var programId = normalizeId_(data[i][progIdCol]);
    if (!programId) continue;
    if (
      allowedProgramIds &&
      Object.prototype.hasOwnProperty.call(allowedProgramIds, programId) === false
    ) {
      continue;
    }

    var eventType = eventTypeCol >= 0
      ? String(data[i][eventTypeCol] == null ? "" : data[i][eventTypeCol])
          .trim()
          .toUpperCase()
      : "REGULAR";
    if (eventType !== "REGULAR" && eventType !== "SPECIAL") eventType = "REGULAR";

    var recurrence = recurCol >= 0
      ? String(data[i][recurCol] == null ? "" : data[i][recurCol])
          .trim()
          .toUpperCase()
      : "NONE";
    if (recurrence !== "NONE" && recurrence !== "WEEKLY" && recurrence !== "MONTHLY") {
      recurrence = "NONE";
    }

    out.push({
      createdAt: createdAtCol >= 0 ? String(data[i][createdAtCol] || "").trim() : "",
      createdBy: createdByCol >= 0 ? String(data[i][createdByCol] || "").trim() : "",
      eventDate: eventDateStr,
      eventId: normalizeId_(data[i][eventIdCol]),
      eventName: eventNameCol >= 0 ? String(data[i][eventNameCol] || "").trim() : "",
      eventType: eventType,
      programId: programId,
      recurrence: recurrence,
      status: isCancelled ? "Cancelled" : "Active",
      timeSlot: timeSlotCol >= 0 ? String(data[i][timeSlotCol] || "").trim() : "",
    });
  }

  out.sort(function (a, b) {
    var da = a.eventDate.split("/");
    var db = b.eventDate.split("/");
    if (da.length === 3 && db.length === 3) {
      var dateA = new Date(
        parseInt(da[2], 10),
        parseInt(da[1], 10) - 1,
        parseInt(da[0], 10)
      );
      var dateB = new Date(
        parseInt(db[2], 10),
        parseInt(db[1], 10) - 1,
        parseInt(db[0], 10)
      );
      if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) return dateA - dateB;
    }
    return 0;
  });

  return out;
}


// ---------------------------------------------------------------------------
// Public RPCs (called from events.html via google.script.run)
// ---------------------------------------------------------------------------

/**
 * api_getMyEvents(userId, sessionToken)
 *
 * Read-access baseline (ADR-0006 / ADR-0008 §RBAC). Any authenticated
 * member gets the upcoming events for the programs they're enrolled in,
 * each enriched with its program name from the catalog. This is what the
 * "Events" tab shows to a MEMBER.
 */
function api_getMyEvents(userId, sessionToken) {
  if (!verifySessionToken_(userId, sessionToken)) {
    return { success: false, message: "Session invalid or expired.", data: [] };
  }
  var targetUserId = normalizeId_(userId);
  if (!targetUserId) {
    return { success: false, message: "Invalid user id.", data: [] };
  }

  var enrolledLookup = {};
  try {
    var enrolledIds = getUserEnrolledProgramIds_(targetUserId);
    for (var i = 0; i < enrolledIds.length; i++) {
      enrolledLookup[enrolledIds[i]] = true;
    }
  } catch (e) {
    return { success: false, message: e.message || "Failed to load enrollments.", data: [] };
  }

  var events;
  try {
    events = readEventsFromSheet_(enrolledLookup, /* includeCancelled */ false);
  } catch (e) {
    return { success: false, message: e.message || "Failed to read events.", data: [] };
  }

  // Enrich with programName from the catalog (catalog read is best-effort).
  var nameLookup = {};
  try {
    var catalog = getProgramsCatalog_();
    for (var c = 0; c < catalog.length; c++) {
      nameLookup[catalog[c].programId] = catalog[c].title;
    }
  } catch (_) {}

  for (var e = 0; e < events.length; e++) {
    events[e].programName = nameLookup[events[e].programId] || events[e].programId;
  }

  return { success: true, data: events };
}

/**
 * api_getEventsForLeader(userId, sessionToken)
 *
 * Privileged-read variant: returns ALL upcoming (Active) events for the
 * programs the user leads (per-program scope), OR for ALL programs if the
 * user is STAFF/ADMIN. Used by the events view to render the privileged
 * management list with create/cancel controls.
 *
 * Note: this is the leader's read scope. Write-side authorization (in
 * api_createEvent / api_cancelEvent) is a separate, server-side check on
 * each individual programId.
 */
function api_getEventsForLeader(userId, sessionToken) {
  if (!verifySessionToken_(userId, sessionToken)) {
    return { success: false, message: "Session invalid or expired.", data: [] };
  }
  var targetUserId = normalizeId_(userId);
  if (!targetUserId) {
    return { success: false, message: "Invalid user id.", data: [] };
  }

  var role = getUserRole_(userId);
  var isStaffOrAdmin = hasRoleAtLeast_(role, "STAFF");
  var scope = {};
  if (isStaffOrAdmin) {
    // All programs in the catalog.
    try {
      var catalog = getProgramsCatalog_();
      for (var c = 0; c < catalog.length; c++) scope[catalog[c].programId] = true;
    } catch (e) {
      return { success: false, message: e.message || "Failed to load catalog.", data: [] };
    }
  } else {
    // Programs the user is an Active leader of.
    scope = getLeaderProgramIds_(targetUserId);
    if (!scope || Object.keys(scope).length === 0) {
      return {
        success: false,
        message: "Forbidden: no active program leader grants found.",
        data: [],
      };
    }
  }

  var events;
  try {
    events = readEventsFromSheet_(scope, /* includeCancelled */ true);
  } catch (e) {
    return { success: false, message: e.message || "Failed to read events.", data: [] };
  }

  // Enrich with programName.
  var nameLookup = {};
  try {
    var catalog2 = getProgramsCatalog_();
    for (var n = 0; n < catalog2.length; n++) {
      nameLookup[catalog2[n].programId] = catalog2[n].title;
    }
  } catch (_) {}
  for (var k = 0; k < events.length; k++) {
    events[k].programName = nameLookup[events[k].programId] || events[k].programId;
  }

  return {
    success: true,
    data: events,
    isStaffOrAdmin: isStaffOrAdmin,
  };
}

/**
 * api_getLeaderProgramOptions(userId, sessionToken)
 *
 * Returns the programs the user can create events for: all catalog
 * programs if STAFF/ADMIN, otherwise the user's active Program_Leaders
 * rows only. Drives the create-event form's program <select>.
 */
function api_getLeaderProgramOptions(userId, sessionToken) {
  if (!verifySessionToken_(userId, sessionToken)) {
    return { success: false, message: "Session invalid or expired.", data: [] };
  }
  var targetUserId = normalizeId_(userId);
  if (!targetUserId) {
    return { success: false, message: "Invalid user id.", data: [] };
  }

  var role = getUserRole_(userId);
  var isStaffOrAdmin = hasRoleAtLeast_(role, "STAFF");

  var allPrograms = [];
  try {
    allPrograms = getProgramsCatalog_();
  } catch (e) {
    return { success: false, message: e.message || "Failed to load catalog.", data: [] };
  }

  var allowedIds = {};
  if (isStaffOrAdmin) {
    for (var a = 0; a < allPrograms.length; a++) {
      allowedIds[allPrograms[a].programId] = true;
    }
  } else {
    allowedIds = getLeaderProgramIds_(targetUserId);
  }

  var options = [];
  for (var i = 0; i < allPrograms.length; i++) {
    if (Object.prototype.hasOwnProperty.call(allowedIds, allPrograms[i].programId)) {
      options.push({
        programId: allPrograms[i].programId,
        title: allPrograms[i].title,
        type: allPrograms[i].type,
      });
    }
  }
  return { success: true, data: options };
}


/**
 * api_createEvent(payload)
 *
 * Privileged mutation. Payload shape (session token pulled from same
 * payload; conventional __sessionToken / sessionToken / _sessionToken
 * fallback chain mirrors the archive):
 *   {
 *     createdBy: <userId>,
 *     sessionToken: <token>,
 *     programId: <programId>,
 *     eventName: <string>,
 *     eventDate: <dd/MM/YYYY>,
 *     timeSlot: <string>,
 *     eventType: <"REGULAR" | "SPECIAL">  (optional; defaults REGULAR),
 *     recurrence: <"NONE" | "WEEKLY" | "MONTHLY">  (optional; defaults NONE),
 *   }
 *
 * Server-side authorization order (per ticket spec):
 *   1. Session verification.
 *   2. Per-program authorization — STAFF/ADMIN OR an Active
 *      Program_Leaders row for `payload.programId`. DENIED here returns
 *      a failure WITHOUT writing an ATTEMPT row (the caller is not
 *      allowed to start).
 *   3. writeAuditLog(..., 'ATTEMPT') — captures Correlation_ID.
 *   4. Sheet append.
 *   5. writeAuditLog(..., 'SUCCESS', correlationId).
 *   6. On any throw inside the try block: writeAuditLog(..., 'ERROR',
 *      correlationId) and rethrow so the client sees the failure.
 */
function api_createEvent(payload) {
  if (!payload) return { success: false, message: "Missing payload." };

  var userId = String(payload.createdBy == null ? "" : payload.createdBy).trim();
  var sessionToken = String(
    payload.__sessionToken || payload.sessionToken || payload._sessionToken || ""
  ).trim();
  var programId = String(payload.programId == null ? "" : payload.programId).trim();
  var eventName = String(payload.eventName == null ? "" : payload.eventName).trim();
  var eventDate = String(payload.eventDate == null ? "" : payload.eventDate).trim();
  var timeSlot = String(payload.timeSlot == null ? "" : payload.timeSlot).trim();

  if (!userId || !sessionToken) return { success: false, message: "Missing user session." };
  if (!verifySessionToken_(userId, sessionToken)) {
    return { success: false, message: "Session invalid or expired." };
  }
  if (!programId) return { success: false, message: "Program ID is required." };
  if (!eventName) return { success: false, message: "Event name is required." };
  if (!eventDate) return { success: false, message: "Event date is required." };
  if (!timeSlot) return { success: false, message: "Time slot is required." };

  var eventType = String(payload.eventType == null ? "" : payload.eventType)
    .trim()
    .toUpperCase();
  if (eventType !== "REGULAR" && eventType !== "SPECIAL") eventType = "REGULAR";

  var recurrence = String(payload.recurrence == null ? "" : payload.recurrence)
    .trim()
    .toUpperCase();
  if (recurrence !== "NONE" && recurrence !== "WEEKLY" && recurrence !== "MONTHLY") {
    recurrence = "NONE";
  }

  // -- Server-side per-program authorization (BEFORE ATTEMPT write) ---------
  var role = getUserRole_(userId);
  var isStaffOrAdmin = hasRoleAtLeast_(role, "STAFF");
  var isScopedLeader = !isStaffOrAdmin && hasActiveLeaderGrantForProgram_(userId, programId);
  if (!isStaffOrAdmin && !isScopedLeader) {
    return {
      success: false,
      message: "Forbidden: STAFF/ADMIN or active Program Leader grant on this program required.",
    };
  }

  // -- ATTEMPT audit write (locks Correlation_ID for the row pair) ----------
  var reason = "create event \"" + eventName + "\" on " + programId + " @ " + eventDate;
  var correlationId = writeAuditLog(
    userId,
    "EVENT_CREATE",
    programId,
    "",
    eventName,
    reason,
    "ATTEMPT"
  );

  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Events");
    if (!sheet) throw new Error("Events sheet missing.");

    var headers = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0];
    var eventIdCol = findHeaderIndex_(headers, ["event_id", "eventid"]);
    var progIdCol = findHeaderIndex_(headers, [
      "program_id",
      "program id",
      "programid",
    ]);
    var eventNameCol = findHeaderIndex_(headers, [
      "event_name",
      "event name",
      "eventname",
    ]);
    var eventDateCol = findHeaderIndex_(headers, [
      "event_date",
      "event date",
      "eventdate",
    ]);
    var timeSlotCol = findHeaderIndex_(headers, [
      "time_slot",
      "time slot",
      "timeslot",
    ]);
    var eventTypeCol = findHeaderIndex_(headers, ["event_type", "eventtype"]);
    var recurCol = findHeaderIndex_(headers, [
      "recurrence_type",
      "recurrence type",
      "recurrencetype",
      "recurrence",
    ]);
    var statusCol = findHeaderIndex_(headers, ["status"]);
    var createdByCol = findHeaderIndex_(headers, ["created_by", "createdby"]);
    var createdAtCol = findHeaderIndex_(headers, ["created_at", "createdat"]);

    var newId = "EVT-" + Utilities.getUuid().substring(0, 8).toUpperCase();
    var now = new Date();

    var row = new Array(headers.length).fill("");
    if (eventIdCol > -1) row[eventIdCol] = newId;
    if (progIdCol > -1) row[progIdCol] = programId;
    if (eventNameCol > -1) row[eventNameCol] = eventName;
    if (eventDateCol > -1) row[eventDateCol] = eventDate;
    if (timeSlotCol > -1) row[timeSlotCol] = timeSlot;
    if (eventTypeCol > -1) row[eventTypeCol] = eventType;
    if (recurCol > -1) row[recurCol] = recurrence;
    if (statusCol > -1) row[statusCol] = "Active";
    if (createdByCol > -1) row[createdByCol] = userId;
    if (createdAtCol > -1) row[createdAtCol] = now;

    sheet.appendRow(row);

    writeAuditLog(
      userId,
      "EVENT_CREATE",
      programId,
      "",
      eventName,
      reason,
      "SUCCESS",
      correlationId
    );

    return {
      success: true,
      data: {
        createdAt: now,
        createdBy: userId,
        eventDate: eventDate,
        eventId: newId,
        eventName: eventName,
        eventType: eventType,
        programId: programId,
        recurrence: recurrence,
        status: "Active",
        timeSlot: timeSlot,
      },
    };
  } catch (err) {
    writeAuditLog(
      userId,
      "EVENT_CREATE",
      programId,
      "",
      eventName,
      reason,
      "ERROR",
      correlationId
    );
    throw err;
  }
}


/**
 * api_cancelEvent(payload)
 *
 * Privileged mutation. Soft-deletes (Status = "Cancelled") an event.
 *
 * Payload: { cancelledBy: <userId>, sessionToken: <token>, eventId: <id> }
 *
 * Server-side authorization order:
 *   1. Session verification.
 *   2. Look up the event to find its programId (a leader can only cancel
 *      events on programs they lead — STAFF/ADMIN can cancel any).
 *   3. If not authorized → DENIED with no ATTEMPT row.
 *   4. ATTEMPT audit, mutation, SUCCESS/ERROR.
 */
function api_cancelEvent(payload) {
  if (!payload) return { success: false, message: "Missing payload." };

  var userId = String(payload.cancelledBy == null ? "" : payload.cancelledBy).trim();
  var sessionToken = String(
    payload.__sessionToken || payload.sessionToken || payload._sessionToken || ""
  ).trim();
  var eventId = String(payload.eventId == null ? "" : payload.eventId).trim();

  if (!eventId) return { success: false, message: "Event ID is required." };
  if (!userId || !sessionToken) return { success: false, message: "Missing user session." };
  if (!verifySessionToken_(userId, sessionToken)) {
    return { success: false, message: "Session invalid or expired." };
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Events");
  if (!sheet) return { success: false, message: "Events sheet missing." };

  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return { success: false, message: "No events found." };

  var headers = data[0];
  var eventIdCol = findHeaderIndex_(headers, ["event_id", "eventid"]);
  var progIdCol = findHeaderIndex_(headers, [
    "program_id",
    "program id",
    "programid",
  ]);
  var eventNameCol = findHeaderIndex_(headers, [
    "event_name",
    "event name",
    "eventname",
  ]);
  var statusCol = findHeaderIndex_(headers, ["status"]);
  if (eventIdCol === -1) return { success: false, message: "Event_ID column not found." };
  if (statusCol === -1) return { success: false, message: "Status column not found." };

  var targetId = normalizeId_(eventId);
  var foundRow = -1;
  var foundProgId = "";
  var foundEventName = "";
  var currentStatus = "";
  for (var r = 1; r < data.length; r++) {
    if (normalizeId_(data[r][eventIdCol]) !== targetId) continue;
    foundRow = r;
    foundProgId = progIdCol > -1 ? normalizeId_(data[r][progIdCol]) : "";
    foundEventName = eventNameCol > -1 ? String(data[r][eventNameCol] || "").trim() : "";
    currentStatus = String(data[r][statusCol] == null ? "" : data[r][statusCol])
      .trim()
      .toLowerCase();
    break;
  }
  if (foundRow === -1) return { success: false, message: "Event not found." };

  // -- Server-side per-program authorization (BEFORE ATTEMPT write) ---------
  var role = getUserRole_(userId);
  var isStaffOrAdmin = hasRoleAtLeast_(role, "STAFF");
  var isScopedLeader = !isStaffOrAdmin && hasActiveLeaderGrantForProgram_(userId, foundProgId);
  if (!isStaffOrAdmin && !isScopedLeader) {
    return {
      success: false,
      message: "Forbidden: STAFF/ADMIN or active Program Leader grant on this program required.",
    };
  }

  if (currentStatus && currentStatus !== "active") {
    // Already cancelled — treat as idempotent success but don't re-audit.
    return { success: true, message: "Event already cancelled." };
  }

  var reason = "cancel event \"" + foundEventName + "\" (" + eventId + ")";
  var correlationId = writeAuditLog(
    userId,
    "EVENT_CANCEL",
    eventId,
    "Active",
    "Cancelled",
    reason,
    "ATTEMPT"
  );

  try {
    sheet.getRange(foundRow + 1, statusCol + 1).setValue("Cancelled");

    writeAuditLog(
      userId,
      "EVENT_CANCEL",
      eventId,
      "Active",
      "Cancelled",
      reason,
      "SUCCESS",
      correlationId
    );

    return { success: true, message: "Event cancelled successfully." };
  } catch (err) {
    writeAuditLog(
      userId,
      "EVENT_CANCEL",
      eventId,
      "Active",
      "Cancelled",
      reason,
      "ERROR",
      correlationId
    );
    throw err;
  }
}


// ---------------------------------------------------------------------------
// Monthly recurring event generation (ADR-0004 / docs/specs/003)
// ---------------------------------------------------------------------------

/**
 * generateMonthlyRecurringEvents()
 *
 * Time-driven (recommend: monthly, 1st of month) or manual.
 * For each entry in `recurringPrograms`, creates an Events row on every
 * matching day-of-week of the NEXT calendar month. Bulk `setValues` write.
 *
 * Per ADR-0004 + docs/specs/003 §3: this runs unattended and is NOT gated
 * by a session — there is no actor. ADR-0009's two-phase audit is for
 * privileged user-driven mutations, so this function does not call
 * writeAuditLog.
 */
function generateMonthlyRecurringEvents() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var eventsSheet = ss.getSheetByName("Events");
  if (!eventsSheet) return;

  // 1. Recurring programs — hardcoded per docs/specs/003 §3.1.
  var recurringPrograms = [
    {
      programId: "dd646847",
      dayOfWeek: 0,
      startTime: "3:00 PM",
      namePrefix: "青崇",
    },
  ];

  // 2. Next-month target.
  var today = new Date();
  var targetYear = today.getFullYear();
  var targetMonth = today.getMonth() + 1;
  if (targetMonth > 11) {
    targetMonth = 0;
    targetYear++;
  }
  var daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

  // 3. Build rows.
  var newRows = [];
  for (var day = 1; day <= daysInMonth; day++) {
    var checkDate = new Date(targetYear, targetMonth, day);
    var currentDayOfWeek = checkDate.getDay();
    for (var p = 0; p < recurringPrograms.length; p++) {
      var prog = recurringPrograms[p];
      if (currentDayOfWeek !== prog.dayOfWeek) continue;
      var dateString = Utilities.formatDate(
        checkDate,
        Session.getScriptTimeZone(),
        "dd/MM/yyyy"
      );
      var timeSlot = prog.startTime;
      var eventName = prog.namePrefix + " - " + dateString;
      var eventId = Utilities.getUuid().substring(0, 8).toUpperCase();
      newRows.push([
        eventId,
        prog.programId,
        dateString,
        timeSlot,
        eventName,
      ]);
    }
  }

  // 4. Bulk write.
  if (newRows.length > 0) {
    var startRow = eventsSheet.getLastRow() + 1;
    eventsSheet
      .getRange(startRow, 1, newRows.length, newRows[0].length)
      .setValues(newRows);
  }
}