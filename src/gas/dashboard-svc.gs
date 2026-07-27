// =============================================================================
// dashboard.gs — Pastoral Care Dashboard RPC Endpoints
// Ported verbatim from 程式碼.js: api_getUserActivityProfile, api_getCareDashboard.
// =============================================================================

/**
 * Return full ActivityProfile for a given member.
 * Role gate: caller must be STAFF or ADMIN.
 */
function api_getUserActivityProfile(userId, sessionToken) {
  var callerId = resolveSessionUser_(sessionToken);
  if (!callerId) { return null; }
  var role = checkRoleAtLeast_(callerId, "STAFF");
  if (role !== "STAFF" && role !== "ADMIN") { return null; }

  var targetUid = normalizeId_(userId);
  if (!targetUid) { return null; }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var usersSheet = ss.getSheetByName("Users");
  if (!usersSheet) { return null; }
  var usersData = usersSheet.getDataRange().getValues();
  if (!usersData || usersData.length < 2) { return null; }
  var uHeaders = usersData[0].map(function (h) {
    return String(h).trim().toLowerCase();
  });
  function uCol(name) {
    return uHeaders.indexOf(name);
  }
  var uidIdx = uCol("user_id");
  if (uidIdx === -1) { uidIdx = uCol("user id"); }
  var uNameIdx = uCol("name");
  if (uNameIdx === -1) { uNameIdx = uCol("full name"); }
  var uPhoneIdx = uCol("phone");
  if (uidIdx === -1 || uNameIdx === -1) { return null; }

  var targetName = "";
  var targetPhone = "";
  for (var i = 1; i < usersData.length; i++) {
    if (normalizeId_(usersData[i][uidIdx]) !== targetUid) { continue; }
    targetName = String(usersData[i][uNameIdx] || "").trim();
    targetPhone = uPhoneIdx > -1 ? String(usersData[i][uPhoneIdx] || "").trim() : "";
    break;
  }
  if (!targetName) { return null; }

  // Get enrolled programs
  var progCatalog = getProgramsCatalog_();
  var progLookup = {};
  for (var p = 0; p < progCatalog.length; p++) {
    progLookup[progCatalog[p].programId] = progCatalog[p];
  }

  var enrolledIds = getUserEnrolledProgramIds_(targetUid);
  var enrolledPrograms = [];
  for (var ep = 0; ep < enrolledIds.length; ep++) {
    if (progLookup[enrolledIds[ep]]) {
      enrolledPrograms.push(progLookup[enrolledIds[ep]]);
    }
  }

  // Get attendance records
  var attSheet = ss.getSheetByName("Attendance");
  var attendance = [];
  var lastCheckInAt = null;

  if (attSheet) {
    var attData = attSheet.getDataRange().getValues();
    if (attData && attData.length > 1) {
      var aHeaders = attData[0];
      var aNorm = aHeaders.map(function (h) {
        return String(h).trim().toLowerCase().replace(/[\s_]+/g, "");
      });
      function aCol(names) {
        for (var n = 0; n < names.length; n++) {
          var idx = aNorm.indexOf(names[n].toLowerCase().replace(/[\s_]+/g, ""));
          if (idx !== -1) { return idx; }
        }
        return -1;
      }
      var aIdIdx = aCol(["attendance_id", "attendanceid"]);
      var aEventIdx = aCol(["event_id", "eventid"]);
      var aMemberIdx = aCol(["user_id", "userid", "member_id", "memberid"]);
      var aTimeIdx = aCol(["check_in_time", "checkintime"]);
      var aMethodIdx = aCol(["check_in_method", "checkinmethod", "source"]);
      var aByIdx = aCol(["check_in_by", "checkinby"]);
      var aStatusIdx = aCol(["status"]);

      for (var r = 1; r < attData.length; r++) {
        if (normalizeId_(attData[r][aMemberIdx]) !== targetUid) { continue; }
        var ckTime = aTimeIdx > -1 ? String(attData[r][aTimeIdx] || "").trim() : "";
        attendance.push({
          attendanceId: aIdIdx > -1 ? String(attData[r][aIdIdx] || "").trim() : "",
          checkInBy: aByIdx > -1 ? String(attData[r][aByIdx] || "").trim() : "",
          checkInMethod: aMethodIdx > -1 ? String(attData[r][aMethodIdx] || "").trim() : "",
          checkInTime: ckTime,
          eventId: aEventIdx > -1 ? normalizeId_(attData[r][aEventIdx]) : "",
          status: aStatusIdx > -1 ? String(attData[r][aStatusIdx] || "").trim().toUpperCase() : "PRESENT",
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
 */
function api_getCareDashboard(thresholdDays, sessionToken) {
  var callerId = resolveSessionUser_(sessionToken);
  if (!callerId) { return null; }
  var role = checkRoleAtLeast_(callerId, "STAFF");
  if (role !== "STAFF" && role !== "ADMIN") { return null; }

  if (!thresholdDays || thresholdDays < 1) { thresholdDays = 30; }
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Read Users sheet
  var usersSheet = ss.getSheetByName("Users");
  if (!usersSheet) { return null; }
  var usersData = usersSheet.getDataRange().getValues();
  if (!usersData || usersData.length < 2) { return null; }
  var uHeaders = usersData[0].map(function (h) {
    return String(h).trim().toLowerCase();
  });
  function uCol(name) {
    return uHeaders.indexOf(name);
  }
  var uidIdx = uCol("user_id");
  if (uidIdx === -1) { uidIdx = uCol("user id"); }
  var uNameIdx = uCol("name");
  if (uNameIdx === -1) { uNameIdx = uCol("full name"); }
  var uPhoneIdx = uCol("phone");
  var uRoleIdx = uCol("role");
  var uStatusIdx = uCol("status");
  if (uidIdx === -1 || uNameIdx === -1) { return null; }

  // Read Attendance — build latest check-in per member
  var attMap = {}; // userId -> latest checkInTime (ISO string)
  var attCount = {}; // userId -> total check-in count
  var attSheet = ss.getSheetByName("Attendance");
  if (attSheet) {
    var attData = attSheet.getDataRange().getValues();
    if (attData && attData.length > 1) {
      var aHeaders = attData[0];
      var aNorm = aHeaders.map(function (h) {
        return String(h).trim().toLowerCase().replace(/[\s_]+/g, "");
      });
      function aCol(names) {
        for (var n = 0; n < names.length; n++) {
          var idx = aNorm.indexOf(names[n].toLowerCase().replace(/[\s_]+/g, ""));
          if (idx !== -1) { return idx; }
        }
        return -1;
      }
      var aMemberIdx = aCol(["user_id", "userid", "member_id", "memberid"]);
      var aTimeIdx = aCol(["check_in_time", "checkintime"]);

      for (var r = 1; r < attData.length; r++) {
        var memberId = normalizeId_(attData[r][aMemberIdx]);
        if (!memberId) { continue; }
        var ckTime = aTimeIdx > -1 ? String(attData[r][aTimeIdx] || "").trim() : "";
        if (ckTime && (!attMap[memberId] || ckTime > attMap[memberId])) {
          attMap[memberId] = ckTime;
        }
        if (ckTime) {
          attCount[memberId] = (attCount[memberId] || 0) + 1;
        }
      }
    }
  }

  // Read Enrollments — count active programs per member
  var enrCount = {}; // userId -> number of active enrolled programs
  var enrProgramIds = {}; // userId -> [programId, ...]
  var enrSheet = ss.getSheetByName("Enrollments");
  if (enrSheet) {
    var enrData = enrSheet.getDataRange().getValues();
    if (enrData && enrData.length > 1) {
      var eHeaders = enrData[0].map(function (h) {
        return String(h).trim().toLowerCase();
      });
      function eCol(name) {
        return eHeaders.indexOf(name);
      }
      var eUserIdx = eCol("user_id");
      if (eUserIdx === -1) { eUserIdx = eCol("user id"); }
      var eProgIdx = eCol("program_id");
      if (eProgIdx === -1) { eProgIdx = eCol("program id"); }
      var eStatusIdx = eCol("status");

      for (var r = 1; r < enrData.length; r++) {
        var eUid = normalizeId_(enrData[r][eUserIdx]);
        if (!eUid) { continue; }
        if (eStatusIdx > -1 && !isActiveStatus_(enrData[r][eStatusIdx])) { continue; }
        var ePid = eProgIdx > -1 ? normalizeId_(enrData[r][eProgIdx]) : "";
        if (!ePid) { continue; }
        if (!enrCount[eUid]) {
          enrCount[eUid] = 0;
          enrProgramIds[eUid] = [];
        }
        enrCount[eUid]++;
        enrProgramIds[eUid].push(ePid);
      }
    }
  }

  // Read Programs catalog for name lookups
  var progCatalog = getProgramsCatalog_();
  var progLookup = {};
  for (var p = 0; p < progCatalog.length; p++) {
    progLookup[progCatalog[p].programId] = progCatalog[p];
  }

  var nowMs = Date.now();
  var totalEnrolled = 0;
  var activeCount = 0;
  var inactiveMembers = [];

  for (var i = 1; i < usersData.length; i++) {
    var roleVal = uRoleIdx > -1
      ? String(usersData[i][uRoleIdx] || "").trim().toUpperCase()
      : "MEMBER";
    if (roleVal !== "MEMBER") { continue; }

    var statusVal = uStatusIdx > -1
      ? String(usersData[i][uStatusIdx] || "").trim().toLowerCase()
      : "active";
    if (statusVal !== "active") { continue; }

    var memberId = normalizeId_(usersData[i][uidIdx]);
    if (!memberId) { continue; }

    // Only include members enrolled in at least 1 program
    if (!enrCount[memberId] || enrCount[memberId] === 0) { continue; }

    totalEnrolled++;

    var lastCheckIn = attMap[memberId] || null;
    var daysInactive = lastCheckIn
      ? Math.floor((nowMs - new Date(lastCheckIn).getTime()) / (24 * 60 * 60 * 1000))
      : null;

    if (lastCheckIn && daysInactive <= thresholdDays) {
      activeCount++;
    } else {
      inactiveMembers.push({
        daysInactive: daysInactive !== null ? daysInactive : null,
        enrolledPrograms: (enrProgramIds[memberId] || []).map(function (pid) {
          var p = progLookup[pid];
          return p ? { programId: p.programId, title: p.title, type: p.type } : null;
        }).filter(function (x) { return !!x; }),
        lastCheckInAt: lastCheckIn || undefined,
        name: String(usersData[i][uNameIdx] || "").trim(),
        phone: uPhoneIdx > -1 && usersData[i][uPhoneIdx]
          ? String(usersData[i][uPhoneIdx]).trim()
          : undefined,
        totalCheckIns: attCount[memberId] || 0,
        userId: memberId,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    thresholdDays: thresholdDays,
    totalEnrolled: totalEnrolled,
    activeCount: activeCount,
    inactiveCount: inactiveMembers.length,
    inactiveMembers: inactiveMembers,
  };
}
