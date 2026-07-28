// =============================================================================
// programs-svc.gs — Program Catalog & Enrollment Functions (T02)
// Reimplemented from 程式碼.js (archive) against the Programs/Enrollments sheet
// schema in CONTEXT.md. Lives in the shared global scope of the GAS runtime;
// depends on normalize utilities in Code.gs (normalizeId_, findHeaderIndex_,
// isActiveStatus_, normalizeHeader_) and the session infrastructure in
// auth.gs (verifySessionToken_). Constants PROGRAMS_CACHE_KEY_ and
// PROGRAMS_CACHE_TTL_SEC_ are declared in Code.gs.
//
// AUDIT NOTE (T02 / ADR-0009): a member self-enrolling or self-cancelling is
// not a privileged mutation per ADR-0006's capability matrix — any active
// member can do it; no role/approval boundary is crossed. Per ADR-0009 §Decision
// the two-phase writeAuditLog pattern is for "privileged mutations" (role
// change, member approval, event cancellation). We therefore do NOT call
// writeAuditLog from enrollUser / cancelEnrollment. If a future STAFF-on-behalf
// "quick enroll" path is added (api_staffEnrollMember in the archive), that
// IS a privileged mutation acting on another user and SHOULD be audited — but
// that endpoint is owned by the Scanner/Quick-Enroll ticket, not T02.
// =============================================================================

// --- Internal: per-user enrolled program lookup ------------------------------

function getUserEnrolledProgramIds_(userId) {
  var ids = [];
  var lookup = getUserEnrolledProgramLookup_(userId);
  for (var id in lookup) {
    if (lookup.hasOwnProperty(id)) ids.push(id);
  }
  return ids;
}

function getUserEnrolledProgramLookup_(userId) {
  var result = {};
  var targetUserId = normalizeId_(userId);
  if (!targetUserId) return result;

  var enrSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Enrollments");
  if (!enrSheet) throw new Error("Enrollments sheet missing.");

  var lastRow = enrSheet.getLastRow();
  if (lastRow < 2) return result;

  var headers = enrSheet
    .getRange(1, 1, 1, enrSheet.getLastColumn())
    .getValues()[0];
  var enrProgIdx = findHeaderIndex_(headers, [
    "program_id",
    "program id",
    "programid",
  ]);
  var enrUserIdx = findHeaderIndex_(headers, [
    "user_id",
    "user id",
    "userid",
    "member_id",
    "member id",
  ]);
  var enrStatusIdx = findHeaderIndex_(headers, [
    "status",
    "enrollment_status",
    "enrollment status",
  ]);
  if (enrProgIdx === -1 || enrUserIdx === -1) {
    throw new Error("Enrollments missing User_ID or Program_ID column.");
  }

  var minCol =
    Math.min(
      enrUserIdx,
      enrProgIdx,
      enrStatusIdx === -1 ? enrUserIdx : enrStatusIdx
    ) + 1;
  var maxCol =
    Math.max(
      enrUserIdx,
      enrProgIdx,
      enrStatusIdx === -1 ? enrProgIdx : enrStatusIdx
    ) + 1;
  var rows = enrSheet.getRange(2, minCol, lastRow, maxCol - minCol + 1).getValues();
  var relUserIdx = enrUserIdx + 1 - minCol;
  var relProgIdx = enrProgIdx + 1 - minCol;
  var relStatusIdx = enrStatusIdx === -1 ? -1 : enrStatusIdx + 1 - minCol;

  for (var i = 0; i < rows.length; i++) {
    if (normalizeId_(rows[i][relUserIdx]) !== targetUserId) continue;
    if (relStatusIdx !== -1 && !isActiveStatus_(rows[i][relStatusIdx])) continue;
    var enrolledProgId = normalizeId_(rows[i][relProgIdx]);
    if (enrolledProgId) result[enrolledProgId] = true;
  }
  return result;
}

// --- Catalog reader (cached) --------------------------------------------------

function getProgramsCatalog_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(PROGRAMS_CACHE_KEY_);
  if (cached) return JSON.parse(cached);

  var progSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Programs");
  if (!progSheet) throw new Error("Programs sheet missing.");

  var data = progSheet.getDataRange().getValues();
  if (!data || data.length < 1) throw new Error("Programs sheet empty.");

  var headers = data[0];
  var idIdx = findHeaderIndex_(headers, [
    "program_id",
    "program id",
    "programid",
  ]);
  var nameIdx = findHeaderIndex_(headers, [
    "program_name",
    "program name",
    "name",
  ]);
  var typeIdx = findHeaderIndex_(headers, ["type"]);
  var descIdx = findHeaderIndex_(headers, [
    "description",
    "program_description",
    "program description",
  ]);
  if (idIdx === -1 || nameIdx === -1) {
    throw new Error("Programs missing Program_ID or Program_Name column.");
  }

  var programs = [];
  for (var i = 1; i < data.length; i++) {
    var pId = idIdx !== -1 ? normalizeId_(data[i][idIdx]) : "";
    if (!pId) continue;
    programs.push({
      description: descIdx !== -1 ? String(data[i][descIdx] || "").trim() : "",
      programId: pId,
      title: nameIdx !== -1 ? String(data[i][nameIdx] || "").trim() : "Unnamed",
      type: typeIdx !== -1 ? String(data[i][typeIdx] || "").trim() : "",
    });
  }

  try {
    cache.put(
      PROGRAMS_CACHE_KEY_,
      JSON.stringify(programs),
      PROGRAMS_CACHE_TTL_SEC_
    );
  } catch (_) {}
  return programs;
}

function getProgramsCatalog() {
  return getProgramsCatalog_();
}

function getUserEnrolledProgramIds(userId) {
  try {
    return getUserEnrolledProgramIds_(userId);
  } catch (_) {
    return [];
  }
}

function getAvailablePrograms(userId) {
  var programs = getProgramsCatalog_();
  var enrolledLookup = getUserEnrolledProgramLookup_(userId);
  return programs.map(function (prog) {
    return {
      programId: prog.programId,
      title: prog.title,
      type: prog.type,
      description: prog.description,
      isEnrolled: enrolledLookup.hasOwnProperty(prog.programId),
    };
  });
}

// --- Self-enroll / cancel (no audit, per ADR-0009 note above) ---------------

function enrollUser(userId, programId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var enrSheet = ss.getSheetByName("Enrollments");
  var eventsSheet = ss.getSheetByName("Events");

  if (!enrSheet || !eventsSheet) {
    return { success: false, message: "System error: Database sheets missing." };
  }

  var targetUserId = normalizeId_(userId);
  var targetProgramId = normalizeId_(programId);
  if (!targetUserId || !targetProgramId) {
    return { success: false, message: "Missing user or program id." };
  }

  // 1. Get user's already-active program enrollments (clash candidates).
  var enrolledLookup = getUserEnrolledProgramLookup_(targetUserId);
  var activeProgramIds = [];
  for (var enrolledId in enrolledLookup) {
    if (enrolledLookup.hasOwnProperty(enrolledId)) activeProgramIds.push(enrolledId);
  }

  // 2. Map all events to detect same-time-same-date clashes.
  var evData = eventsSheet.getDataRange().getValues();
  if (!evData || evData.length < 1) {
    return { success: false, message: "System error: Events sheet empty." };
  }
  var evHeaders = evData[0];
  var evProgIdx = findHeaderIndex_(evHeaders, [
    "program_id",
    "program id",
    "programid",
  ]);
  var evDateIdx = findHeaderIndex_(evHeaders, [
    "event_date",
    "event date",
    "eventdate",
  ]);
  var evTimeIdx = findHeaderIndex_(evHeaders, [
    "time_slot",
    "time slot",
    "timeslot",
  ]);
  var evNameIdx = findHeaderIndex_(evHeaders, [
    "event_name",
    "event name",
    "eventname",
  ]);
  if (evProgIdx === -1 || evDateIdx === -1 || evTimeIdx === -1 || evNameIdx === -1) {
    return {
      success: false,
      message: "System error: Events missing required schedule columns.",
    };
  }

  var bookedSlots = [];
  var targetEvents = [];

  for (var e = 1; e < evData.length; e++) {
    var eProgId = normalizeId_(evData[e][evProgIdx]);
    if (!eProgId) continue;

    var eDate = evDateIdx !== -1 ? normalizeId_(evData[e][evDateIdx]) : "";
    var eTime = evTimeIdx !== -1 ? String(evData[e][evTimeIdx]).trim() : "";
    var slotKey = eDate + "|" + eTime;

    if (slotKey === "|") continue;
    var eName =
      evNameIdx !== -1 ? String(evData[e][evNameIdx]).trim() : "Unnamed Event";

    if (activeProgramIds.indexOf(eProgId) !== -1) bookedSlots.push(slotKey);
    if (eProgId === targetProgramId) {
      targetEvents.push({ key: slotKey, name: eName, time: eTime });
    }
  }

  // 3. Any clash with a current enrollment fails this enrollment.
  for (var t = 0; t < targetEvents.length; t++) {
    if (bookedSlots.indexOf(targetEvents[t].key) !== -1) {
      return {
        success: false,
        message: targetEvents[t].name + " at " + targetEvents[t].time,
      };
    }
  }

  // 4. Write the new active enrollment row.
  var headers = enrSheet
    .getRange(1, 1, 1, enrSheet.getLastColumn())
    .getValues()[0];
  var enrollId = "ENR-" + Utilities.getUuid().substring(0, 8).toUpperCase();
  var newRow = new Array(headers.length).fill("");

  var idIdx = findHeaderIndex_(headers, [
    "enrollment_id",
    "enrollment id",
    "enrollmentid",
  ]);
  var progIdx = findHeaderIndex_(headers, [
    "program_id",
    "program id",
    "programid",
  ]);
  var userIdx = findHeaderIndex_(headers, [
    "user_id",
    "user id",
    "userid",
    "member_id",
    "member id",
  ]);
  var dateIdx = findHeaderIndex_(headers, [
    "timestamp",
    "enrollment_date",
    "enrollment date",
    "date",
  ]);
  var statusIdx = findHeaderIndex_(headers, [
    "status",
    "enrollment_status",
    "enrollment status",
  ]);

  if (progIdx === -1 || userIdx === -1) {
    return {
      success: false,
      message: "System error: Enrollments missing User_ID or Program_ID column.",
    };
  }

  if (idIdx > -1) newRow[idIdx] = enrollId;
  newRow[progIdx] = targetProgramId;
  newRow[userIdx] = targetUserId;
  if (dateIdx > -1) newRow[dateIdx] = new Date();
  if (statusIdx > -1) newRow[statusIdx] = "Active";

  enrSheet.appendRow(newRow);
  return { success: true };
}

function cancelEnrollment(userId, programId) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Enrollments");
  if (!sheet) return { success: false, message: "Enrollments sheet missing." };

  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function (h) {
    return String(h).trim().toLowerCase();
  });

  var userIdx = headers.indexOf("user_id");
  var progIdx = headers.indexOf("program_id");
  var statusIdx = headers.indexOf("status");

  if (userIdx === -1 || progIdx === -1 || statusIdx === -1) {
    return {
      success: false,
      message: "System error: Missing Status column in Enrollments.",
    };
  }

  // Find the exact active enrollment and change it to Cancelled.
  for (var i = 1; i < data.length; i++) {
    if (
      String(data[i][userIdx]).trim() === String(userId).trim() &&
      String(data[i][progIdx]).trim() === String(programId).trim() &&
      String(data[i][statusIdx]).trim().toLowerCase() === "active"
    ) {
      sheet.getRange(i + 1, statusIdx + 1).setValue("Cancelled");
      return { success: true };
    }
  }
  return { success: false, message: "Active enrollment record not found." };
}

// --- Authenticated RPC endpoints (SPA shell callers) -------------------------

function api_getProgramsCatalog(userId, sessionToken) {
  if (!verifySessionToken_(userId, sessionToken)) {
    return { success: false, message: "Session invalid or expired.", data: [] };
  }
  try {
    return { success: true, data: getProgramsCatalog() };
  } catch (e) {
    return { success: false, message: e.message, data: [] };
  }
}

function api_getAvailablePrograms(userId, sessionToken) {
  if (!verifySessionToken_(userId, sessionToken)) {
    return { success: false, message: "Session invalid or expired.", data: [] };
  }
  try {
    return { success: true, data: getAvailablePrograms(userId) };
  } catch (e) {
    return { success: false, message: e.message, data: [] };
  }
}

function api_enrollUser(userId, programId, sessionToken) {
  if (!verifySessionToken_(userId, sessionToken)) {
    return { success: false, message: "Session invalid or expired." };
  }
  return enrollUser(userId, programId);
}

function api_cancelEnrollment(userId, programId, sessionToken) {
  if (!verifySessionToken_(userId, sessionToken)) {
    return { success: false, message: "Session invalid or expired." };
  }
  return cancelEnrollment(userId, programId);
}

/**
 * api_getMyEnrollments(userId, sessionToken)
 * Used by the Profile fragment to render the member's enrollments.
 * Returns an array of `{ programId, title, type, status, timestamp, enrollmentId }`
 * rows for both Active and Cancelled records (the Profile filters for "Active",
 * but having status available avoids a second server round-trip later).
 */
function api_getMyEnrollments(userId, sessionToken) {
  if (!verifySessionToken_(userId, sessionToken)) {
    return { success: false, message: "Session invalid or expired.", data: [] };
  }
  var targetUserId = normalizeId_(userId);
  if (!targetUserId) return { success: false, message: "Invalid user id.", data: [] };

  var enrSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Enrollments");
  if (!enrSheet) return { success: false, message: "Enrollments sheet missing.", data: [] };

  var lastRow = enrSheet.getLastRow();
  if (lastRow < 2) return { success: true, data: [] };

  var headers = enrSheet
    .getRange(1, 1, 1, enrSheet.getLastColumn())
    .getValues()[0];
  var enrIdIdx = findHeaderIndex_(headers, [
    "enrollment_id",
    "enrollment id",
    "enrollmentid",
  ]);
  var enrUserIdx = findHeaderIndex_(headers, [
    "user_id",
    "user id",
    "userid",
    "member_id",
    "member id",
  ]);
  var enrProgIdx = findHeaderIndex_(headers, [
    "program_id",
    "program id",
    "programid",
  ]);
  var enrDateIdx = findHeaderIndex_(headers, [
    "timestamp",
    "enrollment_date",
    "enrollment date",
    "date",
  ]);
  var enrStatusIdx = findHeaderIndex_(headers, [
    "status",
    "enrollment_status",
    "enrollment status",
  ]);
  if (enrUserIdx === -1 || enrProgIdx === -1) {
    return { success: false, message: "Enrollments missing required columns.", data: [] };
  }

  // Build programId -> {title, type} lookup from the cached catalog.
  // Read failure is non-fatal — fall back to rendering bare programId.
  var catalogLookup = {};
  try {
    var catalog = getProgramsCatalog_();
    for (var c = 0; c < catalog.length; c++) {
      catalogLookup[catalog[c].programId] = {
        title: catalog[c].title,
        type: catalog[c].type,
      };
    }
  } catch (_) {}

  // Compute min/max column window over ONLY the columns we found, so that a
  // missing (-1) column does not poison Math.min/max. minCol/maxCol are 1-based.
  var presentIdx = [enrIdIdx, enrUserIdx, enrProgIdx, enrDateIdx, enrStatusIdx].filter(function (x) {
    return x >= 0;
  });
  var minCol = Math.min.apply(null, presentIdx) + 1;
  var maxCol = Math.max.apply(null, presentIdx) + 1;
  var numRows = lastRow - 1; // header is row 1
  var numCols = maxCol - minCol + 1;
  var rows = enrSheet.getRange(2, minCol, numRows, numCols).getValues();

  // Translate each absolute index to its offset within the returned window.
  // Same shape as the archive's getUserEnrolledProgramLookup_ pattern.
  function rel(absIdx) {
    return absIdx < 0 ? -1 : absIdx + 1 - minCol;
  }
  var relId = rel(enrIdIdx);
  var relUser = rel(enrUserIdx);
  var relProg = rel(enrProgIdx);
  var relDate = rel(enrDateIdx);
  var relStatus = rel(enrStatusIdx);

  var out = [];
  for (var i = 0; i < rows.length; i++) {
    if (normalizeId_(rows[i][relUser]) !== targetUserId) continue;
    var progId = normalizeId_(rows[i][relProg]);
    if (!progId) continue;
    var meta = catalogLookup[progId] || { title: progId, type: "" };
    var statusRaw = relStatus >= 0 ? String(rows[i][relStatus] || "").trim().toLowerCase() : "";
    var status = statusRaw ? statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1) : "Active";
    out.push({
      enrollmentId: relId >= 0 ? String(rows[i][relId] || "").trim() : "",
      programId: progId,
      status: status,
      timestamp: relDate >= 0 ? String(rows[i][relDate] || "").trim() : "",
      title: meta.title,
      type: meta.type,
    });
  }
  // Newest first by timestamp (lexicographic — ISO strings and serialised
  // getValues() Date strings both sort the same direction).
  out.sort(function (a, b) {
    if (a.timestamp < b.timestamp) return 1;
    if (a.timestamp > b.timestamp) return -1;
    return 0;
  });
  return { success: true, data: out };
}
