// =============================================================================
// dashboard-svc.gs — Care / Inactive-Member Pastoral Dashboard RPCs.
//
// Owned by issue://47 (T06 — Care). Reimplements two read-only endpoints from
// the archived canonical source 程式碼.js:
//
//   - api_getUserActivityProfile(userId, sessionToken)
//   - api_getCareDashboard(thresholdDays, sessionToken)
//
// The file is named dashboard-svc.gs deliberately to reuse the basename that
// the old multi-page build left behind; ADR-0008 retires the old filename at
// the final cutover, but the basename itself is unowned and not worth
// changing now. The care feature has no separate "dashboard" page (see
// Code.gs's SPA_FRAGMENT_ALLOWLIST_ note).
//
// Self-containment rationale (GAS parallel-ticket hazard):
//   T02 (programs-svc.gs) defines getProgramsCatalog_() and
//   getUserEnrolledProgramIds_() as private helpers. Declaring those names in
//   this file would collide at GAS parse/load time even behind a runtime
//   guard, so this file inlines the Programs + Enrollments sheet reads it
//   needs directly into the two RPCs. Each function stays independently
//   runnable; T02's helpers remain the canonical implementations for the
//   Programs feature surface.
//
// Both functions are read-only — no Audit_Log write, no LockService.
// =============================================================================

/**
 * Return full ActivityProfile for a given member.
 * Role gate: caller must be STAFF or ADMIN.
 *
 * Faithful port of 程式碼.js#api_getUserActivityProfile (lines 1969-2090).
 * See docs/specs/007 §3.1 for the high-level contract; the canonical
 * response shape follows the reference implementation, not the spec's
 * illustrative JSON (ADR-0008 Domain Sources mandates 程式碼.js as source
 * of truth for function shape).
 */
function api_getUserActivityProfile(userId, sessionToken) {
  var callerId = resolveSessionUser_(sessionToken);
  if (!callerId) {return null;}
  var role = checkRoleAtLeast_(callerId, "STAFF");
  if (role !== "STAFF" && role !== "ADMIN") {return null;}

  var targetUid = normalizeId_(userId);
  if (!targetUid) {return null;}

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ---- Locate target member in Users ----
  var usersSheet = ss.getSheetByName("Users");
  if (!usersSheet) {return null;}
  var usersData = usersSheet.getDataRange().getValues();
  if (!usersData || usersData.length < 2) {return null;}
  var uHeaders = usersData[0].map(normalizeHeader_);
  var uidIdx = findHeaderIndex_(uHeaders, ["user_id", "user id"]);
  var uNameIdx = findHeaderIndex_(uHeaders, ["name", "full name"]);
  var uPhoneIdx = findHeaderIndex_(uHeaders, ["phone"]);
  if (uidIdx === -1 || uNameIdx === -1) {return null;}

  var targetName = "";
  var targetPhone = "";
  for (var i = 1; i < usersData.length; i++) {
    if (normalizeId_(usersData[i][uidIdx]) !== targetUid) {continue;}
    targetName = String(usersData[i][uNameIdx] || "").trim();
    targetPhone = uPhoneIdx >= 0 ? String(usersData[i][uPhoneIdx] || "").trim() : "";
    break;
  }
  if (!targetName) {return null;}

  // ---- Read Programs catalog (inlined — see file header rationale) ----
  var progLookup = {};
  var progSheet = ss.getSheetByName("Programs");
  if (progSheet) {
    var progData = progSheet.getDataRange().getValues();
    if (progData && progData.length > 1) {
      var pHeaders = progData[0].map(normalizeHeader_);
      var pIdIdx = findHeaderIndex_(pHeaders, ["program_id", "program id", "programid"]);
      var pNameIdx = findHeaderIndex_(pHeaders, ["program_name", "program name", "name"]);
      var pTypeIdx = findHeaderIndex_(pHeaders, ["type"]);
      var pDescIdx = findHeaderIndex_(pHeaders, ["description", "desc"]);
      var pStatusIdx = findHeaderIndex_(pHeaders, ["status"]);
      for (var p = 1; p < progData.length; p++) {
        var pid = normalizeId_(progData[p][pIdIdx]);
        if (!pid) {continue;}
        if (pStatusIdx >= 0 && !isActiveStatus_(progData[p][pStatusIdx])) {continue;}
        progLookup[pid] = {
          programId: pid,
          title: pNameIdx >= 0 ? String(progData[p][pNameIdx] || "").trim() : "",
          type: pTypeIdx >= 0 ? String(progData[p][pTypeIdx] || "").trim() : "",
          description: pDescIdx >= 0 ? String(progData[p][pDescIdx] || "").trim() : "",
        };
      }
    }
  }

  // ---- Read Enrollments for target member (inlined) ----
  var enrolledIds = [];
  var enrSheet = ss.getSheetByName("Enrollments");
  if (enrSheet) {
    var enrData = enrSheet.getDataRange().getValues();
    if (enrData && enrData.length > 1) {
      var eHeaders = enrData[0].map(normalizeHeader_);
      var eUserIdx = findHeaderIndex_(eHeaders, ["user_id", "user id", "userid", "member_id", "member id"]);
      var eProgIdx = findHeaderIndex_(eHeaders, ["program_id", "program id", "programid"]);
      var eStatusIdx = findHeaderIndex_(eHeaders, ["status", "enrollment_status", "enrollment status"]);
      for (var e = 1; e < enrData.length; e++) {
        if (normalizeId_(enrData[e][eUserIdx]) !== targetUid) {continue;}
        if (eStatusIdx >= 0 && !isActiveStatus_(enrData[e][eStatusIdx])) {continue;}
        var ePid = normalizeId_(enrData[e][eProgIdx]);
        if (ePid) {enrolledIds.push(ePid);}
      }
    }
  }

  var enrolledPrograms = [];
  for (var ep = 0; ep < enrolledIds.length; ep++) {
    if (progLookup[enrolledIds[ep]]) {enrolledPrograms.push(progLookup[enrolledIds[ep]]);}
  }

  // ---- Read Attendance records for target member ----
  var attendance = [];
  var lastCheckInAt = null;
  var attSheet = ss.getSheetByName("Attendance");
  if (attSheet) {
    var attData = attSheet.getDataRange().getValues();
    if (attData && attData.length > 1) {
      var aHeaders = attData[0].map(normalizeHeader_);
      var aIdIdx = findHeaderIndex_(aHeaders, ["attendance_id", "attendanceid"]);
      var aEventIdx = findHeaderIndex_(aHeaders, ["event_id", "eventid"]);
      var aMemberIdx = findHeaderIndex_(aHeaders, ["user_id", "userid", "member_id", "memberid"]);
      var aTimeIdx = findHeaderIndex_(aHeaders, ["check_in_time", "checkintime"]);
      var aMethodIdx = findHeaderIndex_(aHeaders, ["check_in_method", "checkinmethod", "source"]);
      var aByIdx = findHeaderIndex_(aHeaders, ["check_in_by", "checkinby"]);
      var aStatusIdx = findHeaderIndex_(aHeaders, ["status"]);

      for (var r = 1; r < attData.length; r++) {
        if (normalizeId_(attData[r][aMemberIdx]) !== targetUid) {continue;}
        var ckTime = aTimeIdx >= 0 ? String(attData[r][aTimeIdx] || "").trim() : "";
        attendance.push({
          attendanceId: aIdIdx >= 0 ? String(attData[r][aIdIdx] || "").trim() : "",
          checkInBy: aByIdx >= 0 ? String(attData[r][aByIdx] || "").trim() : "",
          checkInMethod: aMethodIdx >= 0 ? String(attData[r][aMethodIdx] || "").trim() : "",
          checkInTime: ckTime,
          eventId: aEventIdx >= 0 ? normalizeId_(attData[r][aEventIdx]) : "",
          status: aStatusIdx >= 0 ? String(attData[r][aStatusIdx] || "").trim().toUpperCase() : "PRESENT",
          userId: targetUid,
        });
        if (ckTime && (!lastCheckInAt || ckTime > lastCheckInAt)) {
          lastCheckInAt = ckTime;
        }
      }
    }
  }

  return {
    attendance: attendance,
    enrolledPrograms: enrolledPrograms,
    lastCheckInAt: lastCheckInAt || undefined,
    name: targetName,
    phone: targetPhone || undefined,
    totalCheckIns: attendance.length,
    userId: targetUid,
  };
}

/**
 * Return CareDashboardData with inactive members list.
 * Role gate: caller must be STAFF or ADMIN.
 *
 * Inactivity rule (matches docs/specs/007 §2 exactly):
 *   1. Users.Status == "Active"
 *   2. enrolled in >= 1 active program (Enrollments.Status == "Active")
 *   3. zero check-ins in the Attendance sheet within the configured window
 *      (default 30 days; payload thresholdDays 14/30/60/90).
 * Plus an additional STAFF/ADMIN-role exclusion from 程式碼.js (only MEMBER
 * role appears in the pastoral-care list — staff have their own workflow).
 *
 * Faithful port of 程式碼.js#api_getCareDashboard (lines 2096-2269).
 */
function api_getCareDashboard(thresholdDays, sessionToken) {
  var callerId = resolveSessionUser_(sessionToken);
  if (!callerId) {return null;}
  var role = checkRoleAtLeast_(callerId, "STAFF");
  if (role !== "STAFF" && role !== "ADMIN") {return null;}

  if (!thresholdDays || thresholdDays < 1) {thresholdDays = 30;}
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ---- Read Users ----
  var usersSheet = ss.getSheetByName("Users");
  if (!usersSheet) {return null;}
  var usersData = usersSheet.getDataRange().getValues();
  if (!usersData || usersData.length < 2) {return null;}
  var uHeaders = usersData[0].map(normalizeHeader_);
  var uidIdx = findHeaderIndex_(uHeaders, ["user_id", "user id"]);
  var uNameIdx = findHeaderIndex_(uHeaders, ["name", "full name"]);
  var uPhoneIdx = findHeaderIndex_(uHeaders, ["phone"]);
  var uRoleIdx = findHeaderIndex_(uHeaders, ["role"]);
  var uStatusIdx = findHeaderIndex_(uHeaders, ["status"]);
  if (uidIdx === -1 || uNameIdx === -1) {return null;}

  // ---- Attendance: latest check-in per member + total count per member ----
  var attMap = {};
  var attCount = {};
  var attSheet = ss.getSheetByName("Attendance");
  if (attSheet) {
    var attData = attSheet.getDataRange().getValues();
    if (attData && attData.length > 1) {
      var aHeaders = attData[0].map(normalizeHeader_);
      var aMemberIdx = findHeaderIndex_(aHeaders, ["user_id", "userid", "member_id", "memberid"]);
      var aTimeIdx = findHeaderIndex_(aHeaders, ["check_in_time", "checkintime"]);
      for (var r = 1; r < attData.length; r++) {
        var memberId = normalizeId_(attData[r][aMemberIdx]);
        if (!memberId) {continue;}
        var ckTime = aTimeIdx >= 0 ? String(attData[r][aTimeIdx] || "").trim() : "";
        if (ckTime && (!attMap[memberId] || ckTime > attMap[memberId])) {
          attMap[memberId] = ckTime;
        }
        if (ckTime) {attCount[memberId] = (attCount[memberId] || 0) + 1;}
      }
    }
  }

  // ---- Enrollments: count active programs per member + their program IDs ----
  var enrCount = {};
  var enrProgramIds = {};
  var enrSheet = ss.getSheetByName("Enrollments");
  if (enrSheet) {
    var enrData = enrSheet.getDataRange().getValues();
    if (enrData && enrData.length > 1) {
      var eHeaders = enrData[0].map(normalizeHeader_);
      var eUserIdx = findHeaderIndex_(eHeaders, ["user_id", "user id", "userid", "member_id", "member id"]);
      var eProgIdx = findHeaderIndex_(eHeaders, ["program_id", "program id", "programid"]);
      var eStatusIdx = findHeaderIndex_(eHeaders, ["status", "enrollment_status", "enrollment status"]);
      for (var r2 = 1; r2 < enrData.length; r2++) {
        var eUid = normalizeId_(enrData[r2][eUserIdx]);
        if (!eUid) {continue;}
        if (eStatusIdx >= 0 && !isActiveStatus_(enrData[r2][eStatusIdx])) {continue;}
        var ePid = eProgIdx >= 0 ? normalizeId_(enrData[r2][eProgIdx]) : "";
        if (!ePid) {continue;}
        if (!enrCount[eUid]) {
          enrCount[eUid] = 0;
          enrProgramIds[eUid] = [];
        }
        enrCount[eUid]++;
        enrProgramIds[eUid].push(ePid);
      }
    }
  }

  // ---- Programs catalog for name lookups (inlined) ----
  var progLookup = {};
  var progSheet = ss.getSheetByName("Programs");
  if (progSheet) {
    var progData = progSheet.getDataRange().getValues();
    if (progData && progData.length > 1) {
      var pHeaders = progData[0].map(normalizeHeader_);
      var pIdIdx = findHeaderIndex_(pHeaders, ["program_id", "program id", "programid"]);
      var pNameIdx = findHeaderIndex_(pHeaders, ["program_name", "program name", "name"]);
      var pTypeIdx = findHeaderIndex_(pHeaders, ["type"]);
      for (var p2 = 1; p2 < progData.length; p2++) {
        var pid = normalizeId_(progData[p2][pIdIdx]);
        if (!pid) {continue;}
        progLookup[pid] = {
          programId: pid,
          title: pNameIdx >= 0 ? String(progData[p2][pNameIdx] || "").trim() : "",
          type: pTypeIdx >= 0 ? String(progData[p2][pTypeIdx] || "").trim() : "",
        };
      }
    }
  }

  // ---- Apply inactivity rule per user ----
  var nowMs = Date.now();
  var inactiveMembers = [];

  for (var i = 1; i < usersData.length; i++) {
    var roleVal = uRoleIdx >= 0
      ? String(usersData[i][uRoleIdx] || "").trim().toUpperCase()
      : "MEMBER";
    if (roleVal !== "MEMBER") {continue;}

    var statusVal = uStatusIdx >= 0
      ? String(usersData[i][uStatusIdx] || "").trim().toLowerCase()
      : "active";
    if (statusVal !== "active") {continue;}

    var memberId = normalizeId_(usersData[i][uidIdx]);
    if (!memberId) {continue;}

    // Rule #2: must be enrolled in >= 1 active program.
    if (!enrCount[memberId] || enrCount[memberId] === 0) {continue;}

    var lastCheckIn = attMap[memberId] || null;
    var daysInactive = lastCheckIn
      ? Math.floor((nowMs - new Date(lastCheckIn).getTime()) / (24 * 60 * 60 * 1000))
      : thresholdDays + 1;

    // Rule #3: zero check-ins within the configured window. Members who have
    // never checked in have lastCheckIn === null, which falls through (they're
    // treated as past the window — pastoral-care list inclusion).
    if (lastCheckIn && daysInactive <= thresholdDays) {continue;}

    inactiveMembers.push({
      attendance: [],
      enrolledPrograms: (enrProgramIds[memberId] || [])
        .map(function (pid) { return progLookup[pid]; })
        .filter(function (p) { return !!p; }),
      lastCheckInAt: lastCheckIn || undefined,
      name: String(usersData[i][uNameIdx] || "").trim(),
      phone: uPhoneIdx >= 0 && usersData[i][uPhoneIdx]
        ? String(usersData[i][uPhoneIdx]).trim()
        : undefined,
      totalCheckIns: attCount[memberId] || 0,
      userId: memberId,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    inactiveMembers: inactiveMembers,
    thresholdDays: thresholdDays,
  };
}