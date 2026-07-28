// =============================================================================
// attendance.gs — Attendance Scanner & Check-in (T04, ADR-0008 SPA rebuild)
//
// Per ADR-0008, this is a fresh reimplementation from docs/archieved-code/
// 程式碼.js (NOT a port of the previous multi-page build). Lives in the shared
// global scope of the GAS runtime; depends on normalize utilities in Code.gs
// (normalizeId_, findHeaderIndex_, normalizeHeader_), session / RBAC helpers
// in auth.gs (verifySessionToken_, getUserRole_, hasRoleAtLeast_,
// getUserEnrolledProgramIds_), the per-program grant helper in events-svc.gs
// (hasActiveLeaderGrantForProgram_), and the audit helper in audit.gs
// (writeAuditLog). members.gs owns api_searchMembers — we do NOT redefine it.
//
// RBAC model (ADR-0006 / T03 aligned):
//   - Check-in: STAFF / ADMIN can check in members for ANY program. A
//     Program Leader can check in members ONLY for a program they hold an
//     Active Program_Leaders grant on. MEMBER-role accounts are rejected.
//   - The per-program check is server-authoritative; the client fragment
//     re-checks role + grant in initScanner() as defense-in-depth
//     (ADR-0008 Architecture Summary §RBAC).
//
// Audit (ADR-0009):
//   - Check-in is a privileged mutation. The two-phase row pattern is:
//     1. Verify session.
//     2. Per-program authorization (returns failure WITHOUT writing any
//        ATTEMPT row if the caller is not allowed to start).
//     3. writeAuditLog(..., 'ATTEMPT') — captures Correlation_ID.
//     4. Inside LockService.getScriptLock(): duplicate check → insert row.
//     5. writeAuditLog(..., 'SUCCESS', correlationId) on clean insert.
//     6. On mutation throw: writeAuditLog(..., 'ERROR', correlationId) and
//        rethrow so the client sees the failure.
//   - Duplicate check-in attempts are a separate, distinct outcome — they
//     are NOT errors (the request was authorized), but they are NOT
//     successes either (the state was not changed). They write a single
//     audit row with Outcome = 'DENIED' (per ADR-0009's Outcome enum:
//     'ATTEMPT' | 'SUCCESS' | 'ERROR' | 'DENIED'). The Correlation_ID is
//     shared with the ATTEMPT row so the pair is reconstructable.
//
// Race protection (the reason for the in-method LockService):
//   - Sheets has no row-level lock. Two concurrent check-in requests for
//     the same (event, member) pair could both pass the duplicate check
//     before either writes the row. LockService.getScriptLock() serializes
//     the duplicate-check-then-insert sequence so only one writer wins.
//   - writeAuditLog already takes its own script lock internally; nested
//     lock acquisition is allowed by GAS (re-entrant for the same script
//     invocation only — but in this method all writes happen sequentially,
//     so the outer lock is acquired first, the inner one is then
//     re-entered, and both are released on the way out in the matching
//     `finally` blocks).
//   - Per ADR-0009: serialize the duplicate check + insert around the
//     script lock just like the privileged mutations around it. The same
//     pattern that closes the audit-write race closes this one.
// =============================================================================


// ---------------------------------------------------------------------------
// api_checkInMember(payload) — privileged mutation
// ---------------------------------------------------------------------------

/**
 * Privileged mutation: check a member into an event (QR scan or manual).
 *
 * Payload shape:
 *   {
 *     staffId: <userId>         // the staff/leader performing the check-in
 *     sessionToken: <token>,
 *     eventId: <id>,
 *     userId: <id>              // the member being checked in
 *     method: "QR_SCAN" | "MANUAL_SEARCH"
 *   }
 *
 * Authorization order (matches api_createEvent / api_cancelEvent):
 *   1. Session verification.
 *   2. Per-program authorization (STAFF/ADMIN, or active Program_Leaders
 *      grant on the event's program). DENIED here returns WITHOUT writing
 *      any ATTEMPT row.
 *   3. writeAuditLog(..., 'ATTEMPT') — captures Correlation_ID.
 *   4. LockService.getScriptLock() around duplicate check + insert.
 *   5. Duplicate check → if found, writeAuditLog(..., 'DENIED') inside the
 *      lock and return a structured duplicate response.
 *   6. Insert row → writeAuditLog(..., 'SUCCESS', correlationId).
 *   7. On mutation throw: writeAuditLog(..., 'ERROR', correlationId) and
 *      rethrow.
 *
 * Race semantics: two concurrent calls for the same (event, member) pair
 * are serialized by the script lock; the second one sees the first's
 * inserted row and returns DENIED.
 */
function api_checkInMember(payload) {
  if (!payload) {
    return { success: false, message: "Missing payload." };
  }

  var staffId = String(payload.staffId == null ? "" : payload.staffId).trim();
  var sessionToken = String(
    payload.__sessionToken || payload.sessionToken || payload._sessionToken || ""
  ).trim();
  var eventId = String(payload.eventId == null ? "" : payload.eventId).trim();
  var memberId = String(payload.userId == null ? "" : payload.userId).trim();
  var rawMethod = String(payload.method == null ? "" : payload.method).trim();
  // Normalize to the two values the sheet expects. Anything else → "MANUAL_SEARCH".
  var method = rawMethod === "QR_SCAN" ? "QR_SCAN" : "MANUAL_SEARCH";

  if (!staffId || !sessionToken) {
    return { success: false, message: "Missing user session." };
  }
  if (!verifySessionToken_(staffId, sessionToken)) {
    return { success: false, message: "Session invalid or expired." };
  }
  if (!eventId) {
    return { success: false, message: "Event ID is required." };
  }
  if (!memberId) {
    return { success: false, message: "Member ID is required." };
  }

  var targetEventId = normalizeId_(eventId);
  var targetMemberId = normalizeId_(memberId);

  // ------------------------------------------------------------------
  // Read the event to find its programId + verify it is active.
  // (Must happen BEFORE the per-program authorization check, because the
  // grant is on the event's program — we don't know which programId to
  // check until we look the event up.)
  // ------------------------------------------------------------------
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var eventsSheet = ss.getSheetByName("Events");
  if (!eventsSheet) return { success: false, message: "Events sheet missing." };

  var evData = eventsSheet.getDataRange().getValues();
  if (!evData || evData.length < 2) {
    return { success: false, message: "No events found." };
  }
  var evHeaders = evData[0];
  var evIdCol = findHeaderIndex_(evHeaders, ["event_id", "eventid"]);
  var evProgCol = findHeaderIndex_(evHeaders, [
    "program_id",
    "program id",
    "programid",
  ]);
  var evStatusCol = findHeaderIndex_(evHeaders, ["status"]);
  if (evIdCol === -1) {
    return { success: false, message: "Event_ID column not found." };
  }

  var eventProgramId = "";
  var eventFound = false;
  var eventActive = true;
  for (var e = 1; e < evData.length; e++) {
    if (normalizeId_(evData[e][evIdCol]) !== targetEventId) continue;
    eventFound = true;
    if (evProgCol > -1) eventProgramId = normalizeId_(evData[e][evProgCol]);
    if (evStatusCol > -1) {
      var evStatus = String(
        evData[e][evStatusCol] == null ? "" : evData[e][evStatusCol]
      )
        .trim()
        .toLowerCase();
      // Cancelled / anything non-active rejects the check-in.
      if (evStatus && evStatus !== "active") eventActive = false;
    }
    break;
  }
  if (!eventFound) return { success: false, message: "Event not found." };
  if (!eventActive) {
    return { success: false, message: "This event is not active." };
  }

  // ------------------------------------------------------------------
  // Server-side per-program authorization (BEFORE ATTEMPT write).
  // Same pattern as api_createEvent / api_cancelEvent: STAFF/ADMIN bypass,
  // otherwise the caller must hold an Active Program_Leaders grant on the
  // SPECIFIC program the event belongs to. Per-program scoping per ADR-0006.
  // ------------------------------------------------------------------
  var role = getUserRole_(staffId);
  var isStaffOrAdmin = hasRoleAtLeast_(role, "STAFF");
  var isScopedLeader =
    !isStaffOrAdmin && hasActiveLeaderGrantForProgram_(staffId, eventProgramId);
  if (!isStaffOrAdmin && !isScopedLeader) {
    return {
      success: false,
      message:
        "Forbidden: STAFF/ADMIN or active Program Leader grant on this program required.",
    };
  }

  // ------------------------------------------------------------------
  // Resolve the member's display name (used in the audit message + the
  // duplicate response). The member must exist in Users (Status = Active).
  // ------------------------------------------------------------------
  var memberName = targetMemberId;
  var memberFound = false;
  var usersSheet = ss.getSheetByName("Users");
  if (usersSheet) {
    var uData = usersSheet.getDataRange().getValues();
    if (uData && uData.length > 1) {
      var uHeaders = uData[0];
      var uIdCol = findHeaderIndex_(uHeaders, ["user_id", "user id", "userid"]);
      var uNameCol = findHeaderIndex_(uHeaders, ["name", "full name"]);
      if (uIdCol > -1) {
        for (var u = 1; u < uData.length; u++) {
          if (normalizeId_(uData[u][uIdCol]) !== targetMemberId) continue;
          memberFound = true;
          if (uNameCol > -1) {
            memberName = String(uData[u][uNameCol] || "").trim() || targetMemberId;
          }
          break;
        }
      }
    }
  }
  if (!memberFound) {
    return { success: false, message: "Member not found." };
  }

  // ------------------------------------------------------------------
  // Enrollment eligibility — member must be actively enrolled in the
  // event's program. (If the event has no programId we skip the check —
  // the event lookup would have failed otherwise.)
  // ------------------------------------------------------------------
  if (eventProgramId) {
    var enrolledIds = getUserEnrolledProgramIds_(targetMemberId);
    var isEnrolled = false;
    for (var x = 0; x < enrolledIds.length; x++) {
      if (enrolledIds[x] === eventProgramId) {
        isEnrolled = true;
        break;
      }
    }
    if (!isEnrolled) {
      return {
        success: false,
        notEnrolled: true,
        message: memberName + " is not enrolled in this program.",
        data: { memberId: targetMemberId, programId: eventProgramId },
      };
    }
  }

  // ------------------------------------------------------------------
  // ATTEMPT audit — capture Correlation_ID for the row pair.
  // ------------------------------------------------------------------
  var reason =
    "check in " + memberName + " (" + targetMemberId + ") into " +
    targetEventId + " via " + method;
  var oldVal = "NotCheckedIn";
  var newVal = "CheckedIn";
  var correlationId = writeAuditLog(
    staffId,
    "ATTENDANCE_CHECKIN",
    targetMemberId,
    oldVal,
    newVal,
    reason,
    "ATTEMPT"
  );

  try {
    // ------------------------------------------------------------------
    // Lock around the duplicate-check-then-insert sequence. ADR-0009
    // also takes its own lock inside writeAuditLog — nested acquires
    // are safe here because the outer lock is held for the whole
    // critical section, and we only call writeAuditLog while holding it.
    // ------------------------------------------------------------------
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) {
      // System busy — write ERROR so the attempt is reconstructable.
      writeAuditLog(
        staffId,
        "ATTENDANCE_CHECKIN",
        targetMemberId,
        oldVal,
        newVal,
        reason,
        "ERROR",
        correlationId
      );
      return { success: false, message: "System busy. Please try again." };
    }

    try {
      var attSheet = ss.getSheetByName("Attendance");
      if (!attSheet) {
        // Auto-create Attendance with the canonical spec headers —
        // matches docs/specs/006-attendance-tracking.md §2. This is the
        // historic behavior; a fresh project might miss the sheet.
        attSheet = ss.insertSheet("Attendance");
        attSheet.appendRow([
          "Attendance_ID",
          "Event_ID",
          "User_ID",
          "CheckIn_Time",
          "CheckIn_Method",
          "CheckIn_By",
          "Status",
        ]);
      }

      var attData = attSheet.getDataRange().getValues();
      var attHeaders = attData.length > 0 ? attData[0] : [];
      var attEventCol = findHeaderIndex_(attHeaders, [
        "event_id",
        "eventid",
      ]);
      var attUserCol = findHeaderIndex_(attHeaders, [
        "user_id",
        "userid",
        "member_id",
        "memberid",
      ]);
      var attStatusCol = findHeaderIndex_(attHeaders, ["status"]);

      // ----- Duplicate check (Active row for this event + member) ----
      if (attData.length > 1 && attEventCol > -1 && attUserCol > -1) {
        for (var i = 1; i < attData.length; i++) {
          var eId = normalizeId_(attData[i][attEventCol]);
          var mId = normalizeId_(attData[i][attUserCol]);
          if (eId !== targetEventId || mId !== targetMemberId) continue;
          var rowStatus =
            attStatusCol > -1
              ? String(
                  attData[i][attStatusCol] == null
                    ? ""
                    : attData[i][attStatusCol]
                )
                  .trim()
                  .toLowerCase()
              : "";
          // Empty status or "active" both count as already checked in.
          if (rowStatus === "" || rowStatus === "active") {
            // ----- DUPLICATE — write DENIED audit, return structured dup -----
            writeAuditLog(
              staffId,
              "ATTENDANCE_CHECKIN",
              targetMemberId,
              oldVal,
              newVal,
              reason,
              "DENIED",
              correlationId
            );
            return {
              success: false,
              duplicate: true,
              message: memberName + " is already checked in.",
              data: { memberName: memberName, userId: targetMemberId },
            };
          }
        }
      }

      // ----- Insert new attendance row -----
      var freshHeaders = attSheet
        .getRange(1, 1, 1, attSheet.getLastColumn())
        .getValues()[0];
      var newId = "ATT-" + Utilities.getUuid().substring(0, 8).toUpperCase();
      var now = new Date();
      var checkInTimeStr = Utilities.formatDate(
        now,
        Session.getScriptTimeZone(),
        "yyyy/MM/dd HH:mm:ss"
      );

      var idCol = findHeaderIndex_(freshHeaders, [
        "attendance_id",
        "attendanceid",
      ]);
      var eventCol = findHeaderIndex_(freshHeaders, [
        "event_id",
        "eventid",
      ]);
      var userCol = findHeaderIndex_(freshHeaders, [
        "user_id",
        "userid",
        "member_id",
        "memberid",
      ]);
      var timeCol = findHeaderIndex_(freshHeaders, [
        "check_in_time",
        "checkintime",
      ]);
      var methodCol = findHeaderIndex_(freshHeaders, [
        "check_in_method",
        "checkinmethod",
        "source",
      ]);
      var byCol = findHeaderIndex_(freshHeaders, [
        "check_in_by",
        "checkinby",
      ]);
      var statusCol = findHeaderIndex_(freshHeaders, ["status"]);

      var row = new Array(freshHeaders.length).fill("");
      if (idCol > -1) row[idCol] = newId;
      if (eventCol > -1) row[eventCol] = targetEventId;
      if (userCol > -1) row[userCol] = targetMemberId;
      if (timeCol > -1) row[timeCol] = checkInTimeStr;
      if (methodCol > -1) row[methodCol] = method;
      if (byCol > -1) row[byCol] = staffId;
      if (statusCol > -1) row[statusCol] = "Active";

      attSheet.appendRow(row);

      // ----- SUCCESS audit (inside the lock, paired with ATTEMPT) -----
      writeAuditLog(
        staffId,
        "ATTENDANCE_CHECKIN",
        targetMemberId,
        oldVal,
        newVal,
        reason,
        "SUCCESS",
        correlationId
      );

      return {
        success: true,
        data: {
          attendanceId: newId,
          checkInTime: checkInTimeStr,
          memberName: memberName,
          method: method,
          userId: targetMemberId,
        },
      };
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    // Mutation threw — write ERROR and rethrow so the client sees the
    // failure (per ADR-0009: do NOT swallow).
    writeAuditLog(
      staffId,
      "ATTENDANCE_CHECKIN",
      targetMemberId,
      oldVal,
      newVal,
      reason,
      "ERROR",
      correlationId
    );
    throw err;
  }
}


// ---------------------------------------------------------------------------
// api_getEventAttendance(eventId, viewerId, sessionToken) — read RPC
// ---------------------------------------------------------------------------

/**
 * Returns the attendance roster for one event. Authorization:
 *   1. Session verification.
 *   2. Staff/Admin: allowed.
 *   3. Program Leader: allowed only if they hold an Active Program_Leaders
 *      grant on the event's program.
 *   4. Everyone else: rejected.
 *
 * Same per-program scoping as the write side — a leader cannot view
 * attendance for a program they don't lead.
 */
function api_getEventAttendance(eventId, viewerId, sessionToken) {
  if (!viewerId || !sessionToken) {
    return { success: false, message: "Missing user session.", data: [] };
  }
  if (!eventId) {
    return { success: false, message: "Event ID is required.", data: [] };
  }
  if (!verifySessionToken_(viewerId, sessionToken)) {
    return { success: false, message: "Session invalid or expired.", data: [] };
  }

  var targetEventId = normalizeId_(eventId);
  var targetViewerId = normalizeId_(viewerId);

  // Resolve the event's programId so we can apply per-program scoping.
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var eventsSheet = ss.getSheetByName("Events");
  var eventProgramId = "";
  if (eventsSheet) {
    var evData = eventsSheet.getDataRange().getValues();
    if (evData && evData.length > 1) {
      var evHeaders = evData[0];
      var evIdCol = findHeaderIndex_(evHeaders, ["event_id", "eventid"]);
      var evProgCol = findHeaderIndex_(evHeaders, [
        "program_id",
        "program id",
        "programid",
      ]);
      if (evIdCol > -1) {
        for (var e = 1; e < evData.length; e++) {
          if (normalizeId_(evData[e][evIdCol]) !== targetEventId) continue;
          if (evProgCol > -1) eventProgramId = normalizeId_(evData[e][evProgCol]);
          break;
        }
      }
    }
  }

  // Server-side per-program authorization (mirror of the write side).
  var role = getUserRole_(targetViewerId);
  var isStaffOrAdmin = hasRoleAtLeast_(role, "STAFF");
  var isScopedLeader =
    !isStaffOrAdmin &&
    eventProgramId &&
    hasActiveLeaderGrantForProgram_(targetViewerId, eventProgramId);
  if (!isStaffOrAdmin && !isScopedLeader) {
    return {
      success: false,
      message:
        "Forbidden: STAFF/ADMIN or active Program Leader grant on this program required.",
      data: [],
    };
  }

  var attSheet = ss.getSheetByName("Attendance");
  if (!attSheet) return { success: true, data: [] };

  var attData = attSheet.getDataRange().getValues();
  if (!attData || attData.length < 2) return { success: true, data: [] };

  var attHeaders = attData[0];
  var attIdCol = findHeaderIndex_(attHeaders, [
    "attendance_id",
    "attendanceid",
  ]);
  var attEvCol = findHeaderIndex_(attHeaders, ["event_id", "eventid"]);
  var attUsrCol = findHeaderIndex_(attHeaders, [
    "user_id",
    "userid",
    "member_id",
    "memberid",
  ]);
  var attTimeCol = findHeaderIndex_(attHeaders, [
    "check_in_time",
    "checkintime",
  ]);
  var attMethodCol = findHeaderIndex_(attHeaders, [
    "check_in_method",
    "checkinmethod",
    "source",
  ]);
  var attByCol = findHeaderIndex_(attHeaders, [
    "check_in_by",
    "checkinby",
  ]);
  var attStatusCol = findHeaderIndex_(attHeaders, ["status"]);

  if (attEvCol === -1 || attUsrCol === -1) {
    return { success: true, data: [] };
  }

  // Build a user-id → display-name lookup so we can show member names.
  var userNameMap = {};
  var usersSheet = ss.getSheetByName("Users");
  if (usersSheet) {
    var uData = usersSheet.getDataRange().getValues();
    if (uData && uData.length > 1) {
      var uHeaders = uData[0];
      var uIdCol = findHeaderIndex_(uHeaders, ["user_id", "user id", "userid"]);
      var uNameCol = findHeaderIndex_(uHeaders, ["name", "full name"]);
      if (uIdCol > -1) {
        for (var u = 1; u < uData.length; u++) {
          var uid = normalizeId_(uData[u][uIdCol]);
          if (!uid) continue;
          var uname =
            uNameCol > -1
              ? String(uData[u][uNameCol] == null ? "" : uData[u][uNameCol]).trim()
              : "";
          userNameMap[uid] = uname || uid;
        }
      }
    }
  }

  var results = [];
  for (var i = 1; i < attData.length; i++) {
    if (normalizeId_(attData[i][attEvCol]) !== targetEventId) continue;
    var rowStatus =
      attStatusCol > -1
        ? String(
            attData[i][attStatusCol] == null ? "" : attData[i][attStatusCol]
          )
            .trim()
            .toLowerCase()
        : "active";
    if (rowStatus && rowStatus !== "active") continue;
    var attUserId = normalizeId_(attData[i][attUsrCol]);
    results.push({
      attendanceId:
        attIdCol > -1
          ? String(attData[i][attIdCol] == null ? "" : attData[i][attIdCol]).trim()
          : "",
      checkInBy:
        attByCol > -1
          ? String(attData[i][attByCol] == null ? "" : attData[i][attByCol]).trim()
          : "",
      checkInMethod:
        attMethodCol > -1
          ? String(
              attData[i][attMethodCol] == null ? "" : attData[i][attMethodCol]
            ).trim()
          : "",
      checkInTime:
        attTimeCol > -1
          ? String(
              attData[i][attTimeCol] == null ? "" : attData[i][attTimeCol]
            ).trim()
          : "",
      eventId: targetEventId,
      userId: attUserId,
      userName: userNameMap[attUserId] || attUserId,
    });
  }

  // Most recent check-in first.
  results.sort(function (a, b) {
    if (a.checkInTime < b.checkInTime) return 1;
    if (a.checkInTime > b.checkInTime) return -1;
    return 0;
  });

  return { success: true, data: results };
}
