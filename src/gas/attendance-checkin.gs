/**
 * EFCC 顯恩堂 - shared Attendance check-in RPC (issue #101).
 *
 * The first shared check-in service contract (spec #51 authority; spec #93
 * Seam 1). F5's QR Scanner consumes this later; F6's manual path will reuse
 * the same eligibility/lock/quiet-duplicate/NOT_ENROLLED authority.
 *
 * Request (QR path, spec #93 US 35):
 *   api_qrCheckIn(userId, sessionId, sessionToken, eventId, scannedCode, method)
 *   - `method` is a UI source label only (conventionally "QR_SCAN"); it is
 *     recorded on the Attendance/Audit rows but NEVER grants authority.
 *   - The client never supplies Member identity; the server resolves the
 *     Member from `scannedCode` only (spec #93 US 34).
 *
 * Validation order (auth first; capability before any Member info is
 * revealed; then Event state; then Member; then Enrollment):
 *   session -> scannedCode syntax -> Event fetch -> capability ->
 *   Event active -> resolve Member -> Member active -> Enrollment.
 *
 * One caller-owned script lock (spec #006 §3 / #51) wraps the FINAL
 * rechecks (Event still active, Enrollment still active, duplicate
 * Attendance), the Attendance append, and the audit append. Helpers used
 * inside the critical section (attendancesAppend_, auditAppend_) acquire
 * NO nested lock - Apps Script does not document script locks as
 * re-entrant. Duplicate active Attendance returns quiet success
 * (`created: false`) with the existing identity and writes nothing.
 *
 * Success response carries `created`, `attendanceId`, and the
 * server-derived `memberName` - it NEVER echoes `scannedCode` (spec #93
 * US 36). Typed `error.code` keys are English; operator copy is
 * Traditional Chinese (spec #93 US 50).
 *
 * Apps Script APIs used (per AGENTS.md docs-backed method rule):
 *   - LockService.getScriptLock().waitLock(ms) / releaseLock():
 *     https://developers.google.com/apps-script/reference/lock/lock
 *     releaseLock(): "if you are working with a spreadsheet, you should
 *     call SpreadsheetApp.flush() prior to releasing the lock, to commit
 *     all pending changes ... while you still have exclusive access."
 *   - SpreadsheetApp.flush():
 *     https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet-app#flush()
 *   - Utilities.getUuid():
 *     https://developers.google.com/apps-script/reference/utilities/utilities#getUuid()
 *   - Utilities.formatDate(date, timeZone, format):
 *     https://developers.google.com/apps-script/reference/utilities/utilities#formatDate(Date,String,String)
 *     ("Formats a date according to the Java SE SimpleDateFormat
 *     specification. date - Date, timeZone - String, format - String,
 *     Return String.")
 */

var CHECKIN_SCANNED_CODE_MAX_LENGTH_ = 64;
var CHECKIN_LOCK_TIMEOUT_MS_ = 30000;
var CHECKIN_TIMEZONE_ = "Asia/Hong_Kong";
var CHECKIN_TIME_FORMAT_ = "yyyy-MM-dd HH:mm:ss";

/**
 * Trim a raw scanned code. Returns "" for null/undefined.
 *
 * @param {string} raw
 * @returns {string}
 */
function checkinTrimScannedCode_(raw) {
  if (raw === null || raw === undefined) return "";
  return String(raw).trim();
}

/**
 * True if a trimmed scanned code is syntactically acceptable (non-empty
 * and not over max). Does not prove it resolves to a Member.
 *
 * @param {string} trimmed
 * @returns {boolean}
 */
function checkinScannedCodeIsValid_(trimmed) {
  return trimmed !== "" && trimmed.length <= CHECKIN_SCANNED_CODE_MAX_LENGTH_;
}

/**
 * True if the verified operator may check in for this Event's Program.
 * STAFF/ADMIN are global; any other role must be an active Program Leader
 * for the Event's EXACT Program (spec #51 / spec 005).
 *
 * @param {{userId: string, role: string}} user Operator DTO.
 * @param {{programId: string}} event Event DTO.
 * @returns {boolean}
 */
function checkinCallerHasCapability_(user, event) {
  var role = String(user.role || "").toUpperCase();
  if (role === "STAFF" || role === "ADMIN") return true;
  var ledIds = programLeadersActiveProgramIds_(user.userId);
  for (var i = 0; i < ledIds.length; i++) {
    if (ledIds[i] === event.programId) return true;
  }
  return false;
}

/**
 * Return the display name of a Program by ID, falling back to the ID if
 * the catalog has no matching row. Used to name the Program in the
 * NOT_ENROLLED message (spec #51 / spec #93 US 20).
 *
 * @param {string} programId
 * @returns {string}
 */
function checkinProgramNameById_(programId) {
  var programs = programsList_();
  for (var i = 0; i < programs.length; i++) {
    if (programs[i].id === programId) return programs[i].name;
  }
  return programId;
}

/**
 * api_qrCheckIn - shared Attendance check-in RPC (issue #101).
 *
 * @param {string} userId Operator User_ID (re-verified against session).
 * @param {string} sessionId
 * @param {string} sessionToken
 * @param {string} eventId Target active Event.
 * @param {string} scannedCode Raw scanned code; server trims + resolves.
 * @param {string} method UI source label only (e.g. "QR_SCAN").
 * @returns {RpcSuccess<{created: boolean, attendanceId: string,
 *                       memberName: string}>|RpcFailure}
 */
function api_qrCheckIn(
  userId,
  sessionId,
  sessionToken,
  eventId,
  scannedCode,
  method
) {
  var op = "api_qrCheckIn";
  var requestId = rpcRequestId_();
  var t0 = Date.now();
  try {
    // --- Auth boundary (mirrors api_getPrograms) ---
    var verification = sessionVerify_(sessionId, sessionToken);
    if (!verification.ok) {
      rpcLog_(
        op,
        requestId,
        verification.reason || "AUTH_REQUIRED",
        Date.now() - t0
      );
      sessionRevoke_(sessionId);
      return rpcFailure_(
        requestId,
        RPC_CODES.AUTH_REQUIRED,
        "工作階段已過期，請重新登入"
      );
    }
    if (verification.userId !== userId) {
      // Mismatched userId on a valid session - fail WITHOUT revoking
      // (see api_getPrograms SECURITY NOTE: revoking on mismatch would let
      // anyone who observes a sessionId force-log-out an unrelated session).
      rpcLog_(op, requestId, "AUTH_REQUIRED", Date.now() - t0);
      return rpcFailure_(
        requestId,
        RPC_CODES.AUTH_REQUIRED,
        "工作階段已過期，請重新登入"
      );
    }
    var user = usersFindById_(verification.userId);
    if (!user || String(user.status).toLowerCase() !== "active") {
      rpcLog_(op, requestId, "FORBIDDEN", Date.now() - t0);
      sessionRevoke_(sessionId);
      return rpcFailure_(
        requestId,
        RPC_CODES.AUTH_REQUIRED,
        "工作階段已過期，請重新登入"
      );
    }

    // --- scannedCode syntax validation (no Member info revealed yet) ---
    var trimmed = checkinTrimScannedCode_(scannedCode);
    if (!checkinScannedCodeIsValid_(trimmed)) {
      rpcLog_(op, requestId, "VALIDATION", Date.now() - t0);
      return rpcFailure_(
        requestId,
        RPC_CODES.VALIDATION,
        "QR 碼格式不正確，請重新掃描"
      );
    }

    // --- Event fetch (prerequisite for capability) ---
    var event = eventsFindById_(eventId);
    if (!event) {
      rpcLog_(op, requestId, "EVENT_NOT_FOUND", Date.now() - t0);
      return rpcFailure_(requestId, RPC_CODES.EVENT_NOT_FOUND, "查無此聚會");
    }

    // --- Capability (before revealing any Member info) ---
    if (!checkinCallerHasCapability_(user, event)) {
      rpcLog_(op, requestId, "FORBIDDEN", Date.now() - t0);
      return rpcFailure_(
        requestId,
        RPC_CODES.FORBIDDEN,
        "你沒有權限為此聚會簽到"
      );
    }

    // --- Event active/not cancelled ---
    if (String(event.status).toLowerCase() !== "active") {
      rpcLog_(op, requestId, "EVENT_NOT_ACTIVE", Date.now() - t0);
      return rpcFailure_(
        requestId,
        RPC_CODES.EVENT_NOT_ACTIVE,
        "此聚會目前無法簽到"
      );
    }

    // --- Resolve Member from scannedCode (server-side only) ---
    var member = usersFindByScannedCode_(trimmed);
    if (!member) {
      rpcLog_(op, requestId, "MEMBER_NOT_FOUND", Date.now() - t0);
      return rpcFailure_(
        requestId,
        RPC_CODES.MEMBER_NOT_FOUND,
        "查無此會員，請確認後再試"
      );
    }
    if (String(member.status).toLowerCase() !== "active") {
      rpcLog_(op, requestId, "MEMBER_INACTIVE", Date.now() - t0);
      return rpcFailure_(
        requestId,
        RPC_CODES.MEMBER_INACTIVE,
        "此會員已停用，無法簽到"
      );
    }

    // --- Active Program Enrollment (NOT_ENROLLED names the Program) ---
    if (!enrollmentsHasActive_(member.userId, event.programId)) {
      var programName = checkinProgramNameById_(event.programId);
      rpcLog_(op, requestId, "NOT_ENROLLED", Date.now() - t0);
      return rpcFailure_(
        requestId,
        RPC_CODES.NOT_ENROLLED,
        "此會員未報名此聚會的課程（" + programName + "）"
      );
    }

    // --- Critical section: one caller-owned lock, no nested locks ---
    var methodLabel = method || "QR_SCAN";
    var lock = LockService.getScriptLock();
    lock.waitLock(CHECKIN_LOCK_TIMEOUT_MS_);
    try {
      // Final rechecks: state that can change between the pre-lock reads and
      // this critical section. Event status and Enrollment are re-read FRESH
      // (events/enrollments repositories do not cache). Member-active is
      // validated pre-lock above (member resolution is a read that spec #006
      // §3 places outside the lock); a fresh in-lock Member-status recheck is
      // a documented future hardening candidate - it is blocked on a
      // users-repository fresh-read primitive, because usersReadAll_ caches
      // per-execution and a cached recheck here would be dead code. The
      // primary concurrency concern (duplicate scans) IS rechecked fresh
      // below via attendancesFindActive_.
      var eventNow = eventsFindById_(eventId);
      if (!eventNow || String(eventNow.status).toLowerCase() !== "active") {
        rpcLog_(op, requestId, "EVENT_NOT_ACTIVE", Date.now() - t0);
        return rpcFailure_(
          requestId,
          RPC_CODES.EVENT_NOT_ACTIVE,
          "此聚會目前無法簽到"
        );
      }
      if (!enrollmentsHasActive_(member.userId, eventNow.programId)) {
        var pn = checkinProgramNameById_(eventNow.programId);
        rpcLog_(op, requestId, "NOT_ENROLLED", Date.now() - t0);
        return rpcFailure_(
          requestId,
          RPC_CODES.NOT_ENROLLED,
          "此會員未報名此聚會的課程（" + pn + "）"
        );
      }

      // Duplicate recheck (fresh read under the lock).
      var existing = attendancesFindActive_(eventId, member.userId);
      if (existing) {
        // Quiet success: no second row, no audit, no error tone (spec #51).
        rpcLog_(op, requestId, "SUCCESS", Date.now() - t0);
        return rpcSuccess_(requestId, {
          created: false,
          attendanceId: existing.attendanceId,
          memberName: member.name,
        });
      }

      // First valid scan: exactly one active Attendance row + one audit row.
      var attendanceId =
        "ATT-" + Utilities.getUuid().substring(0, 8).toUpperCase();
      var checkInTime = Utilities.formatDate(
        new Date(),
        CHECKIN_TIMEZONE_,
        CHECKIN_TIME_FORMAT_
      );
      attendancesAppend_({
        attendanceId: attendanceId,
        eventId: eventId,
        userId: member.userId,
        checkInTime: checkInTime,
        checkInMethod: methodLabel,
        checkInBy: user.userId,
        status: "Active",
      });
      auditAppend_({
        actorUserId: user.userId,
        actionType: "ATTENDANCE_CHECKIN",
        targetUserId: member.userId,
        oldValue: "",
        newValue: attendanceId,
        reason: methodLabel,
        outcome: "SUCCESS",
        correlationId: requestId,
        actorSessionKey: sessionId,
      });
      // Commit pending writes while exclusive access is still held, per the
      // official releaseLock() documentation.
      SpreadsheetApp.flush();

      rpcLog_(op, requestId, "SUCCESS", Date.now() - t0);
      return rpcSuccess_(requestId, {
        created: true,
        attendanceId: attendanceId,
        memberName: member.name,
      });
    } finally {
      lock.releaseLock();
    }
  } catch (e) {
    console.error(e);
    rpcLog_(op, requestId, "INTERNAL_ERROR", Date.now() - t0);
    return rpcFailure_(
      requestId,
      RPC_CODES.INTERNAL_ERROR,
      "系統發生錯誤，請稍後再試。"
    );
  }
}

/**
 * scannerEventsForUser_ - capability-filtered active Events for the Scanner
 * Section's Event picker (spec #93 US 1-3). STAFF/ADMIN may scan for any
 * active Event; a Program Leader may scan only for active Events in Programs
 * they lead. A Program Leader whose programs have no active Events gets an
 * empty list (SUCCESS, not an error). NOTE: a MEMBER with no leadership
 * assignment never reaches this function - api_getScannerEvents returns
 * FORBIDDEN first (the Scanner is not in their nav). The check-in RPC
 * re-validates capability server-side, so this list is presentation only.
 *
 * @param {{userId: string, role: string}} user Operator DTO.
 * @returns {Array<{eventId: string, eventName: string, programId: string,
 *           programName: string, eventDate: string, timeSlot: string}>}
 */
function scannerEventsForUser_(user) {
  var role = String(user.role || "").toUpperCase();
  var events = eventsListActive_();
  var isStaffOrAbove = role === "STAFF" || role === "ADMIN";
  var ledIds = isStaffOrAbove
    ? []
    : programLeadersActiveProgramIds_(user.userId);
  var ledSet = {};
  for (var li = 0; li < ledIds.length; li++) {
    ledSet[ledIds[li]] = true;
  }
  var out = [];
  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    if (!isStaffOrAbove && !ledSet[ev.programId]) {
      continue;
    }
    out.push({
      eventId: ev.eventId,
      eventName: ev.eventName,
      programId: ev.programId,
      programName: checkinProgramNameById_(ev.programId),
      eventDate: ev.eventDate,
      timeSlot: ev.timeSlot,
    });
  }
  return out;
}

/**
 * api_getScannerEvents - active Events the operator may scan for (F5 Scanner
 * Section Event picker, external-origin Option A). Auth boundary mirrors
 * api_qrCheckIn; capability filtering is presentation only (api_qrCheckIn
 * re-checks). Returns an empty list for a Program Leader with no active
 * Events in their Programs (not an error).
 *
 * @param {string} userId
 * @param {string} sessionId
 * @param {string} sessionToken
 * @returns {RpcSuccess<Array<{eventId: string, eventName: string,
 *           programId: string, programName: string, eventDate: string,
 *           timeSlot: string}>>|RpcFailure}
 */
function api_getScannerEvents(userId, sessionId, sessionToken) {
  var op = "api_getScannerEvents";
  var requestId = rpcRequestId_();
  var t0 = Date.now();
  try {
    var verification = sessionVerify_(sessionId, sessionToken);
    if (!verification.ok) {
      rpcLog_(
        op,
        requestId,
        verification.reason || "AUTH_REQUIRED",
        Date.now() - t0
      );
      sessionRevoke_(sessionId);
      return rpcFailure_(
        requestId,
        RPC_CODES.AUTH_REQUIRED,
        "工作階段已過期，請重新登入"
      );
    }
    if (verification.userId !== userId) {
      rpcLog_(op, requestId, "AUTH_REQUIRED", Date.now() - t0);
      return rpcFailure_(
        requestId,
        RPC_CODES.AUTH_REQUIRED,
        "工作階段已過期，請重新登入"
      );
    }
    var user = usersFindById_(verification.userId);
    if (!user || String(user.status).toLowerCase() !== "active") {
      rpcLog_(op, requestId, "FORBIDDEN", Date.now() - t0);
      sessionRevoke_(sessionId);
      return rpcFailure_(
        requestId,
        RPC_CODES.AUTH_REQUIRED,
        "工作階段已過期，請重新登入"
      );
    }
    // Scanner capability: STAFF/ADMIN, or an active Program Leader. A MEMBER
    // with no leadership has no Scanner nav entry; fail closed if called.
    var role = String(user.role || "").toUpperCase();
    var hasScannerCapability =
      role === "STAFF" ||
      role === "ADMIN" ||
      programLeadersHasActiveAssignment_(user.userId);
    if (!hasScannerCapability) {
      rpcLog_(op, requestId, "FORBIDDEN", Date.now() - t0);
      return rpcFailure_(
        requestId,
        RPC_CODES.FORBIDDEN,
        "你沒有權限使用掃描功能"
      );
    }
    var events = scannerEventsForUser_(user);
    rpcLog_(op, requestId, "SUCCESS", Date.now() - t0);
    return rpcSuccess_(requestId, events);
  } catch (e) {
    console.error(e);
    rpcLog_(op, requestId, "INTERNAL_ERROR", Date.now() - t0);
    return rpcFailure_(
      requestId,
      RPC_CODES.INTERNAL_ERROR,
      "系統發生錯誤，請稍後再試。"
    );
  }
}
