// =============================================================================
// programs.gs — Program Catalog & Enrollment Functions
// Ported verbatim from 程式碼.js. Depends on utilities in Code.gs (shared scope).
// =============================================================================

function getUserEnrolledProgramIds_(userId) {
  const ids = [];
  const lookup = getUserEnrolledProgramLookup_(userId);
  for (let id in lookup) {
    if (lookup.hasOwnProperty(id)) {ids.push(id);}
  }
  return ids;
}

function getUserEnrolledProgramLookup_(userId) {
  const result = {};
  const targetUserId = normalizeId_(userId);
  if (!targetUserId) {return result;}

  const enrSheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Enrollments");
  if (!enrSheet) {throw new Error("Enrollments sheet missing.");}

  const lastRow = enrSheet.getLastRow();
  if (lastRow < 2) {return result;}

  const headers = enrSheet
    .getRange(1, 1, 1, enrSheet.getLastColumn())
    .getValues()[0];
  const enrProgIdx = findHeaderIndex_(headers, [
    "program_id",
    "program id",
    "programid",
  ]);
  const enrUserIdx = findHeaderIndex_(headers, [
    "user_id",
    "user id",
    "userid",
    "member_id",
    "member id",
  ]);
  const enrStatusIdx = findHeaderIndex_(headers, [
    "status",
    "enrollment_status",
    "enrollment status",
  ]);
  if (enrProgIdx === -1 || enrUserIdx === -1) {
    throw new Error("Enrollments missing User_ID or Program_ID column.");
  }

  const minCol =
    Math.min(
      enrUserIdx,
      enrProgIdx,
      enrStatusIdx === -1 ? enrUserIdx : enrStatusIdx
    ) + 1;
  const maxCol =
    Math.max(
      enrUserIdx,
      enrProgIdx,
      enrStatusIdx === -1 ? enrProgIdx : enrStatusIdx
    ) + 1;
  const rows = enrSheet.getRange(2, minCol, lastRow, maxCol).getValues();
  const relUserIdx = enrUserIdx + 1 - minCol;
  const relProgIdx = enrProgIdx + 1 - minCol;
  const relStatusIdx = enrStatusIdx === -1 ? -1 : enrStatusIdx + 1 - minCol;

  for (let i = 0; i < rows.length; i++) {
    if (normalizeId_(rows[i][relUserIdx]) !== targetUserId) {continue;}
    if (relStatusIdx !== -1 && !isActiveStatus_(rows[i][relStatusIdx]))
      {continue;}
    const enrolledProgId = normalizeId_(rows[i][relProgIdx]);
    if (enrolledProgId) {result[enrolledProgId] = true;}
  }
  return result;
}

function getProgramsCatalog_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(PROGRAMS_CACHE_KEY_);
  if (cached) {return JSON.parse(cached);}

  const progSheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Programs");
  if (!progSheet) {throw new Error("Programs sheet missing.");}

  const data = progSheet.getDataRange().getValues();
  if (!data || data.length < 1) {throw new Error("Programs sheet empty.");}

  const headers = data[0];
  const idIdx = findHeaderIndex_(headers, [
    "program_id",
    "program id",
    "programid",
  ]);
  const nameIdx = findHeaderIndex_(headers, [
    "program_name",
    "program name",
    "name",
  ]);
  const typeIdx = findHeaderIndex_(headers, ["type"]);
  const descIdx = findHeaderIndex_(headers, [
    "description",
    "program_description",
    "program description",
  ]);
  const dayIdx = findHeaderIndex_(headers, ["day", "day_of_week", "day of week", "dayofweek"]);
  const startIdx = findHeaderIndex_(headers, ["start_time", "start time", "starttime", "time_start", "time start"]);
  const endIdx = findHeaderIndex_(headers, ["end_time", "end time", "endtime", "time_end", "time end"]);
  if (idIdx === -1 || nameIdx === -1) {
    throw new Error("Programs missing Program_ID or Program_Name column.");
  }

  const programs = [];
  for (let i = 1; i < data.length; i++) {
    const pId = idIdx !== -1 ? normalizeId_(data[i][idIdx]) : "";
    if (!pId) {continue;}
    programs.push({
      dayOfWeek: dayIdx !== -1 ? String(data[i][dayIdx] || "").trim() : "",
      description: descIdx !== -1 ? String(data[i][descIdx] || "").trim() : "",
      endTime: endIdx !== -1 ? String(data[i][endIdx] || "").trim() : "",
      programId: pId,
      startTime: startIdx !== -1 ? String(data[i][startIdx] || "").trim() : "",
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
  } catch {}
  return programs;
}

function getProgramsCatalog() {
  return getProgramsCatalog_();
}

function getUserEnrolledProgramIds(userId) {
  try {
    return getUserEnrolledProgramIds_(userId);
  } catch {
    return [];
  }
}

function getAvailablePrograms(userId) {
  const programs = getProgramsCatalog_();
  const enrolledLookup = getUserEnrolledProgramLookup_(userId);
  return programs.map((prog) => {
    return {
      programId: prog.programId,
      title: prog.title,
      type: prog.type,
      description: prog.description,
      isEnrolled: enrolledLookup.hasOwnProperty(prog.programId),
    };
  });
}

function enrollUser(userId, programId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const enrSheet = ss.getSheetByName("Enrollments");
  const eventsSheet = ss.getSheetByName("Events");

  if (!enrSheet || !eventsSheet)
    {return {
      success: false,
      message: "System error: Database sheets missing.",
    };}

  const targetUserId = normalizeId_(userId);
  const targetProgramId = normalizeId_(programId);
  if (!targetUserId || !targetProgramId) {
    return { message: "Missing user or program id.", success: false };
  }

  // 1. Get User's Active Program Enrollments (only this user's rows)
  const enrolledLookup = getUserEnrolledProgramLookup_(targetUserId);
  const activeProgramIds = [];
  for (let enrolledId in enrolledLookup) {
    if (enrolledLookup.hasOwnProperty(enrolledId))
      {activeProgramIds.push(enrolledId);}
  }

  // 2. Map all Events to check for exact clashes
  const evData = eventsSheet.getDataRange().getValues();
  if (!evData || evData.length < 1) {
    return { message: "System error: Events sheet empty.", success: false };
  }
  const evHeaders = evData[0];
  const evProgIdx = findHeaderIndex_(evHeaders, [
    "program_id",
    "program id",
    "programid",
  ]);
  const evDateIdx = findHeaderIndex_(evHeaders, [
    "event_date",
    "event date",
    "eventdate",
  ]);
  const evTimeIdx = findHeaderIndex_(evHeaders, [
    "time_slot",
    "time slot",
    "timeslot",
  ]);
  const evNameIdx = findHeaderIndex_(evHeaders, [
    "event_name",
    "event name",
    "eventname",
  ]);
  if (
    evProgIdx === -1 ||
    evDateIdx === -1 ||
    evTimeIdx === -1 ||
    evNameIdx === -1
  ) {
    return {
      message: "System error: Events missing required schedule columns.",
      success: false,
    };
  }

  const bookedSlots = [];
  const targetEvents = [];

  for (let e = 1; e < evData.length; e++) {
    const eProgId = normalizeId_(evData[e][evProgIdx]);
    if (!eProgId) {continue;}

    const eDate = evDateIdx !== -1 ? normalizeId_(evData[e][evDateIdx]) : "";
    const eTime = evTimeIdx !== -1 ? String(evData[e][evTimeIdx]).trim() : "";
    const slotKey = eDate + "|" + eTime;

    if (slotKey === "|") {continue;}
    const eName =
      evNameIdx !== -1 ? String(evData[e][evNameIdx]).trim() : "Unnamed Event";

    if (activeProgramIds.indexOf(eProgId) !== -1) {
      bookedSlots.push(slotKey);
    }
    if (eProgId === targetProgramId) {
      targetEvents.push({ key: slotKey, name: eName, time: eTime });
    }
  }

  // 3. Compare Target Events against Booked Slots
  for (let t = 0; t < targetEvents.length; t++) {
    if (bookedSlots.indexOf(targetEvents[t].key) !== -1) {
      return {
        message: targetEvents[t].name + " at " + targetEvents[t].time,
        success: false,
      };
    }
  }

  // 4. Process the enrollment
  const headers = enrSheet
    .getRange(1, 1, 1, enrSheet.getLastColumn())
    .getValues()[0];
  const enrollId = "ENR-" + Utilities.getUuid().substring(0, 8).toUpperCase();
  const newRow = new Array(headers.length).fill("");

  const idIdx = findHeaderIndex_(headers, [
    "enrollment_id",
    "enrollment id",
    "enrollmentid",
  ]);
  const progIdx = findHeaderIndex_(headers, [
    "program_id",
    "program id",
    "programid",
  ]);
  const userIdx = findHeaderIndex_(headers, [
    "user_id",
    "user id",
    "userid",
    "member_id",
    "member id",
  ]);
  const dateIdx = findHeaderIndex_(headers, [
    "timestamp",
    "enrollment_date",
    "enrollment date",
    "date",
  ]);
  const statusIdx = findHeaderIndex_(headers, [
    "status",
    "enrollment_status",
    "enrollment status",
  ]);

  if (progIdx === -1 || userIdx === -1) {
    return {
      message:
        "System error: Enrollments missing User_ID or Program_ID column.",
      success: false,
    };
  }

  if (idIdx > -1) {newRow[idIdx] = enrollId;}
  newRow[progIdx] = targetProgramId;
  newRow[userIdx] = targetUserId;
  if (dateIdx > -1) {newRow[dateIdx] = new Date();}
  if (statusIdx > -1) {newRow[statusIdx] = "Active";}

  enrSheet.appendRow(newRow);
  return { success: true };
}

function cancelEnrollment(userId, programId) {
  const sheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Enrollments");
  if (!sheet) {return { success: false, message: "Enrollments sheet missing." };}

  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(function (h) {
    return String(h).trim().toLowerCase();
  });

  const userIdx = headers.indexOf("user_id");
  const progIdx = headers.indexOf("program_id");
  const statusIdx = headers.indexOf("status");

  if (userIdx === -1 || progIdx === -1 || statusIdx === -1) {
    return {
      message: "System error: Missing Status column in Enrollments.",
      success: false,
    };
  }

  // Find the exact active enrollment and change it to Cancelled
  for (let i = 1; i < data.length; i++) {
    if (
      String(data[i][userIdx]).trim() === String(userId).trim() &&
      String(data[i][progIdx]).trim() === String(programId).trim() &&
      String(data[i][statusIdx]).trim().toLowerCase() === "active"
    ) {
      sheet.getRange(i + 1, statusIdx + 1).setValue("Cancelled");
      return { success: true };
    }
  }
  return { message: "Active enrollment record not found.", success: false };
}

// --- Authenticated RPC Endpoints ---------------------------------------------

function api_getProgramsCatalog(userId, sessionToken) {
  if (!verifySessionToken_(userId, sessionToken)) {
    return { message: "Session invalid or expired.", success: false, data: [] };
  }
  try {
    return { data: getProgramsCatalog(), success: true };
  } catch (e) {
    return { message: e.message, success: false, data: [] };
  }
}

function api_getAvailablePrograms(userId, sessionToken) {
  if (!verifySessionToken_(userId, sessionToken)) {
    return { message: "Session invalid or expired.", success: false, data: [] };
  }
  try {
    return { data: getAvailablePrograms(userId), success: true };
  } catch (e) {
    return { message: e.message, success: false, data: [] };
  }
}

function api_enrollUser(userId, programId, sessionToken) {
  if (!verifySessionToken_(userId, sessionToken)) {
    return { message: "Session invalid or expired.", success: false };
  }
  return enrollUser(userId, programId);
}

function api_cancelEnrollment(userId, programId, sessionToken) {
  if (!verifySessionToken_(userId, sessionToken)) {
    return { message: "Session invalid or expired.", success: false };
  }
  return cancelEnrollment(userId, programId);
}

function api_staffEnrollMember(
  grantedUserId,
  memberId,
  programId,
  sessionToken
) {
  if (!grantedUserId || !sessionToken)
    return { success: false, message: "Missing user session." };
  var check = checkIsGrantedUser_(grantedUserId, sessionToken);
  if (!check.granted) return { success: false, message: check.message };
  if (!memberId) return { success: false, message: "Member ID is required." };
  if (!programId) return { success: false, message: "Program ID is required." };
  return enrollUser(memberId, programId);
}
