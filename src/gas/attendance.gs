// =============================================================================
// attendance.gs — Attendance Scanner & Check-in
// Ported from 程式碼.js. Depends on shared global scope (Code.gs, auth.gs,
// programs-svc.gs). Functions: api_checkInMember, api_getEventAttendance.
// =============================================================================

// --- Check-in ---------------------------------------------------------------

function api_checkInMember(payload) {
  if (!payload) { return { success: false, message: "Missing payload." }; }

  var staffId = String(payload.staffId == null ? "" : payload.staffId).trim();
  var sessionToken = String(payload.sessionToken == null ? "" : payload.sessionToken).trim();
  var eventId = String(payload.eventId == null ? "" : payload.eventId).trim();
  var userId = String(payload.userId == null ? "" : payload.userId).trim();
  var method = String(payload.method == null ? "Manual" : payload.method).trim();

  if (!staffId || !sessionToken) {
    return { success: false, message: "Missing staff session." };
  }
  if (!eventId) {
    return { success: false, message: "Event ID is required." };
  }
  if (!userId) {
    return { success: false, message: "Member ID is required." };
  }

  // --- Auth guard ---
  var check = checkIsGrantedUser_(staffId, sessionToken);
  if (!check.granted) {
    return { success: false, message: check.message };
  }

  // --- Parse event date for readable format ---
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var eventsSheet = ss.getSheetByName("Events");
  if (!eventsSheet) { return { success: false, message: "Events sheet missing." }; }

  var evData = eventsSheet.getDataRange().getValues();
  if (!evData || evData.length < 2) { return { success: false, message: "No events found." }; }
  var evHeaders = evData[0].map(function (h) {
    return String(h).trim().toLowerCase().replace(/[\s_]+/g, "");
  });

  function evColIdx(names) {
    for (var n = 0; n < names.length; n++) {
      var idx = evHeaders.indexOf(names[n].toLowerCase().replace(/[\s_]+/g, ""));
      if (idx !== -1) return idx;
    }
    return -1;
  }

  var evIdCol = evColIdx(["Event_ID", "EventID"]);
  var evProgCol = evColIdx(["Program_ID", "ProgramID"]);
  var evDateCol = evColIdx(["Event_Date", "EventDate"]);
  if (evIdCol === -1) { return { success: false, message: "Event_ID column not found." }; }

  var targetEventId = normalizeId_(eventId);
  var eventProgramId = "";
  var eventDateStr = "";
  for (var ei = 1; ei < evData.length; ei++) {
    if (normalizeId_(evData[ei][evIdCol]) !== targetEventId) continue;
    if (evProgCol > -1) {
      eventProgramId = normalizeId_(evData[ei][evProgCol]);
    }
    if (evDateCol > -1) {
      eventDateStr = String(evData[ei][evDateCol] == null ? "" : evData[ei][evDateCol]).trim();
    }
    break;
  }

  if (!eventProgramId) {
    return { success: false, message: "Event not found or missing program." };
  }

  // --- Resolve member name ---
  var memberName = "";
  var memberFound = false;
  var usersSheet = ss.getSheetByName("Users");
  if (usersSheet) {
    var uData = usersSheet.getDataRange().getValues();
    if (uData && uData.length > 1) {
      var uHeaders = uData[0].map(function (h) {
        return String(h).trim().toLowerCase().replace(/[\s_]+/g, "");
      });
      var uIdCol = uHeaders.indexOf("user_id");
      if (uIdCol === -1) uIdCol = uHeaders.indexOf("userid");
      var uNameCol = uHeaders.indexOf("name");
      if (uNameCol === -1) uNameCol = uHeaders.indexOf("fullname");

      var targetUserId = normalizeId_(userId);
      for (var ui = 1; ui < uData.length; ui++) {
        if (normalizeId_(uData[ui][uIdCol]) !== targetUserId) continue;
        memberFound = true;
        if (uNameCol > -1) {
          memberName = String(uData[ui][uNameCol] == null ? "" : uData[ui][uNameCol]).trim();
        }
        if (!memberName) memberName = targetUserId;
        break;
      }
    }
  }

  if (!memberFound) {
    return { success: false, message: "Member not found." };
  }

  // --- Lock-based duplicate check ---
  var lockKey = "att_" + targetEventId + "_" + targetUserId;
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (_) {
    return { success: false, message: "System busy — please try again." };
  }

  try {
    var attSheet = ss.getSheetByName("Attendance");
    if (!attSheet) {
      // Auto-create Attendance sheet
      attSheet = ss.insertSheet("Attendance");
      attSheet.appendRow(["Attendance_ID", "Event_ID", "User_ID", "CheckIn_Time", "CheckIn_Method", "CheckIn_By"]);
    }

    var attData = attSheet.getDataRange().getValues();
    var attHeaders = attData[0].map(function (h) {
      return String(h).trim().toLowerCase().replace(/[\s_]+/g, "");
    });

    function attColIdx(names) {
      for (var n = 0; n < names.length; n++) {
        var idx = attHeaders.indexOf(names[n].toLowerCase().replace(/[\s_]+/g, ""));
        if (idx !== -1) return idx;
      }
      return -1;
    }

    var attEvCol = attColIdx(["Event_ID", "EventID"]);
    var attUsrCol = attColIdx(["User_ID", "UserID"]);
    var attTimeCol = attColIdx(["CheckIn_Time", "CheckInTime", "CheckinTime"]);

    // Check for existing check-in
    var existingTime = "";
    if (attEvCol > -1 && attUsrCol > -1) {
      for (var ai = 1; ai < attData.length; ai++) {
        if (
          normalizeId_(attData[ai][attEvCol]) === targetEventId &&
          normalizeId_(attData[ai][attUsrCol]) === targetUserId
        ) {
          if (attTimeCol > -1) {
            existingTime = String(attData[ai][attTimeCol] == null ? "" : attData[ai][attTimeCol]).trim();
          }
          break;
        }
      }
    }

    if (existingTime) {
      return {
        duplicate: true,
        message: memberName + " is already checked in at " + existingTime,
        data: { checkInTime: existingTime, memberName: memberName },
      };
    }

    // --- Enrollment check ---
    var enrolledIds = getUserEnrolledProgramIds_(targetUserId);
    var isEnrolled = false;
    for (var eidx = 0; eidx < enrolledIds.length; eidx++) {
      if (enrolledIds[eidx] === eventProgramId) {
        isEnrolled = true;
        break;
      }
    }

    if (!isEnrolled) {
      return {
        notEnrolled: true,
        message: memberName + " is not enrolled in this program",
        data: { programId: eventProgramId, memberId: targetUserId },
      };
    }

    // --- Record check-in ---
    var attIdIdx = attColIdx(["Attendance_ID", "AttendanceID"]);
    var attMethodCol = attColIdx(["CheckIn_Method", "CheckInMethod"]);
    var attByCol = attColIdx(["CheckIn_By", "CheckInBy"]);

    var newId = "ATT-" + Utilities.getUuid().substring(0, 8).toUpperCase();
    var now = new Date();
    var checkInTimeStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy/MM/dd HH:mm:ss");

    var row = new Array(attHeaders.length).fill("");
    if (attIdIdx > -1) row[attIdIdx] = newId;
    if (attEvCol > -1) row[attEvCol] = targetEventId;
    if (attUsrCol > -1) row[attUsrCol] = targetUserId;
    if (attTimeCol > -1) row[attTimeCol] = checkInTimeStr;
    if (attMethodCol > -1) row[attMethodCol] = method;
    if (attByCol > -1) row[attByCol] = staffId;

    attSheet.appendRow(row);

    return {
      success: true,
      data: { checkInTime: checkInTimeStr, memberName: memberName },
    };
  } finally {
    lock.releaseLock();
  }
}

// --- Get Event Attendance ---------------------------------------------------

function api_getEventAttendance(eventId, viewerId, sessionToken) {
  if (!viewerId || !sessionToken) {
    return { success: false, message: "Missing user session.", data: [] };
  }
  if (!eventId) {
    return { success: false, message: "Event ID is required.", data: [] };
  }

  var check = checkIsGrantedUser_(viewerId, sessionToken);
  if (!check.granted) {
    return { success: false, message: check.message, data: [] };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var attSheet = ss.getSheetByName("Attendance");
  if (!attSheet) {
    return { success: true, data: [] };
  }

  var attData = attSheet.getDataRange().getValues();
  if (!attData || attData.length < 2) {
    return { success: true, data: [] };
  }

  var attHeaders = attData[0].map(function (h) {
    return String(h).trim().toLowerCase().replace(/[\s_]+/g, "");
  });

  function attColIdx(names) {
    for (var n = 0; n < names.length; n++) {
      var idx = attHeaders.indexOf(names[n].toLowerCase().replace(/[\s_]+/g, ""));
      if (idx !== -1) return idx;
    }
    return -1;
  }

  var attIdIdx = attColIdx(["Attendance_ID", "AttendanceID"]);
  var attEvCol = attColIdx(["Event_ID", "EventID"]);
  var attUsrCol = attColIdx(["User_ID", "UserID"]);
  var attTimeCol = attColIdx(["CheckIn_Time", "CheckInTime", "CheckinTime"]);
  var attMethodCol = attColIdx(["CheckIn_Method", "CheckInMethod"]);
  var attByCol = attColIdx(["CheckIn_By", "CheckInBy"]);

  if (attEvCol === -1 || attUsrCol === -1) {
    return { success: true, data: [] };
  }

  // Build user name lookup
  var userNameMap = {};
  var usersSheet = ss.getSheetByName("Users");
  if (usersSheet) {
    var uData = usersSheet.getDataRange().getValues();
    if (uData && uData.length > 1) {
      var uHeaders = uData[0].map(function (h) {
        return String(h).trim().toLowerCase().replace(/[\s_]+/g, "");
      });
      var uIdCol = uHeaders.indexOf("user_id");
      if (uIdCol === -1) uIdCol = uHeaders.indexOf("userid");
      var uNameCol = uHeaders.indexOf("name");
      if (uNameCol === -1) uNameCol = uHeaders.indexOf("fullname");

      if (uIdCol > -1) {
        for (var ui = 1; ui < uData.length; ui++) {
          var uid = normalizeId_(uData[ui][uIdCol]);
          if (!uid) continue;
          var uname = uNameCol > -1
            ? String(uData[ui][uNameCol] == null ? "" : uData[ui][uNameCol]).trim()
            : uid;
          if (!uname) uname = uid;
          userNameMap[uid] = uname;
        }
      }
    }
  }

  var targetEventId = normalizeId_(eventId);
  var results = [];

  for (var ai = 1; ai < attData.length; ai++) {
    if (normalizeId_(attData[ai][attEvCol]) !== targetEventId) continue;

    var attUserId = normalizeId_(attData[ai][attUsrCol]);
    var record = {
      attendanceId: attIdIdx > -1 ? String(attData[ai][attIdIdx] == null ? "" : attData[ai][attIdIdx]).trim() : "",
      eventId: targetEventId,
      userId: attUserId,
      userName: userNameMap[attUserId] || attUserId,
      checkInTime: attTimeCol > -1 ? String(attData[ai][attTimeCol] == null ? "" : attData[ai][attTimeCol]).trim() : "",
      checkInMethod: attMethodCol > -1 ? String(attData[ai][attMethodCol] == null ? "" : attData[ai][attMethodCol]).trim() : "",
      checkInBy: attByCol > -1 ? String(attData[ai][attByCol] == null ? "" : attData[ai][attByCol]).trim() : "",
    };
    results.push(record);
  }

  // Sort by checkInTime descending (most recent first)
  results.sort(function (a, b) {
    if (a.checkInTime < b.checkInTime) return 1;
    if (a.checkInTime > b.checkInTime) return -1;
    return 0;
  });

  return { success: true, data: results };
}
