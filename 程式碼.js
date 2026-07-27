function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Church Member Portal')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1');
}

function verifyLogin(username, pin) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  if (!sheet) return { success: false, message: "System error: Users sheet missing." };

  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return { success: false, message: "System error: Users sheet empty." };
  
  function normalizePin(value) {
    var s = String(value).trim().replace(/\D/g, '');
    if (!s) return '';
    if (s.length > 4) s = s.substring(s.length - 4);
    while (s.length < 4) s = '0' + s;
    return s;
  }
  
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
  
  var userIndex = headers.indexOf('username');
  if (userIndex === -1) userIndex = headers.indexOf('user name');
  var pinIndex = headers.indexOf('pin_code');
  if (pinIndex === -1) pinIndex = headers.indexOf('pin');
  var userIdIndex = headers.indexOf('user_id');
  if (userIdIndex === -1) userIdIndex = headers.indexOf('user id');
  var nameIndex = headers.indexOf('name');
  if (nameIndex === -1) nameIndex = headers.indexOf('full name');
  
  var statusIndex = headers.indexOf('status');
  var qrIndex = headers.indexOf('qr_code_string');
  if (qrIndex === -1) qrIndex = headers.indexOf('qr code string');

  if (userIndex === -1 || pinIndex === -1 || userIdIndex === -1 || qrIndex === -1) {
    return { success: false, message: "System error: Required columns missing." };
  }

  var inputUser = String(username).trim().toLowerCase();
  var inputPin = normalizePin(pin);

  var sawUsername = false;
  for (var i = 1; i < data.length; i++) {
    if (!data[i][userIndex]) continue;
    
    var rowUser = String(data[i][userIndex]).trim().toLowerCase();
    var rowPin = normalizePin(data[i][pinIndex]);
    
    if (rowUser === inputUser) sawUsername = true;
    
    if (rowUser === inputUser && rowPin === inputPin) {
      var statusRaw = statusIndex !== -1 ? String(data[i][statusIndex]).trim().toLowerCase() : "active";
      if (statusRaw === "pending") return { success: false, message: "Account pending approval." };
      if (statusRaw && statusRaw !== "active" && statusRaw !== "pending") return { success: false, message: "Account not active." };
      
      var loggedInUserId = normalizeId_(data[i][userIdIndex]);
      return {
        success: true,
        userId: loggedInUserId,
        name: nameIndex !== -1 ? String(data[i][nameIndex]).trim() : "Member",
        qrString: String(data[i][qrIndex]).trim(),
        username: rowUser,
        enrolledProgramIds: getUserEnrolledProgramIds_(loggedInUserId)
      };
    }
  }
  
  if (sawUsername) return { success: false, message: "PIN incorrect." };
  return { success: false, message: "Invalid Username or PIN." }; 
}

function normalizeHeader_(h) {
  return String(h).trim().toLowerCase().replace(/[\s_]+/g, '');
}

function findHeaderIndex_(headers, names) {
  var normalized = headers.map(normalizeHeader_);
  for (var n = 0; n < names.length; n++) {
    var idx = normalized.indexOf(normalizeHeader_(names[n]));
    if (idx !== -1) return idx;
  }
  return -1;
}

function normalizeId_(value) {
  if (value === null || value === undefined) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  // Sheets often stores numeric IDs as numbers; avoid "1234.0"
  if (typeof value === 'number' && isFinite(value)) {
    return String(Math.round(value));
  }
  return String(value).trim();
}

function isActiveStatus_(raw) {
  var s = String(raw == null ? '' : raw).trim().toLowerCase();
  // Empty status = active (common when Status col exists but older rows blank)
  return !s || s === 'active';
}

var PROGRAMS_CACHE_KEY_ = 'programs_catalog_v2';
var PROGRAMS_CACHE_TTL_SEC_ = 300;

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

  var enrSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Enrollments');
  if (!enrSheet) throw new Error('Enrollments sheet missing.');

  var lastRow = enrSheet.getLastRow();
  if (lastRow < 2) return result;

  var headers = enrSheet.getRange(1, 1, 1, enrSheet.getLastColumn()).getValues()[0];
  var enrProgIdx = findHeaderIndex_(headers, ['program_id', 'program id', 'programid']);
  var enrUserIdx = findHeaderIndex_(headers, ['user_id', 'user id', 'userid', 'member_id', 'member id']);
  var enrStatusIdx = findHeaderIndex_(headers, ['status', 'enrollment_status', 'enrollment status']);
  if (enrProgIdx === -1 || enrUserIdx === -1) {
    throw new Error('Enrollments missing User_ID or Program_ID column.');
  }

  var minCol = Math.min(enrUserIdx, enrProgIdx, enrStatusIdx === -1 ? enrUserIdx : enrStatusIdx) + 1;
  var maxCol = Math.max(enrUserIdx, enrProgIdx, enrStatusIdx === -1 ? enrProgIdx : enrStatusIdx) + 1;
  var rows = enrSheet.getRange(2, minCol, lastRow, maxCol).getValues();
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

function getProgramsCatalog_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(PROGRAMS_CACHE_KEY_);
  if (cached) return JSON.parse(cached);

  var progSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Programs');
  if (!progSheet) throw new Error('Programs sheet missing.');

  var data = progSheet.getDataRange().getValues();
  if (!data || data.length < 1) throw new Error('Programs sheet empty.');

  var headers = data[0];
  var idIdx = findHeaderIndex_(headers, ['program_id', 'program id', 'programid']);
  var nameIdx = findHeaderIndex_(headers, ['program_name', 'program name', 'name']);
  var typeIdx = findHeaderIndex_(headers, ['type']);
  var descIdx = findHeaderIndex_(headers, ['description', 'program_description', 'program description']);
  if (idIdx === -1 || nameIdx === -1) {
    throw new Error('Programs missing Program_ID or Program_Name column.');
  }

  var programs = [];
  for (var i = 1; i < data.length; i++) {
    var pId = idIdx !== -1 ? normalizeId_(data[i][idIdx]) : '';
    if (!pId) continue;
    programs.push({
      programId: pId,
      title: nameIdx !== -1 ? String(data[i][nameIdx] || '').trim() : 'Unnamed',
      type: typeIdx !== -1 ? String(data[i][typeIdx] || '').trim() : '',
      description: descIdx !== -1 ? String(data[i][descIdx] || '').trim() : ''
    });
  }

  try {
    cache.put(PROGRAMS_CACHE_KEY_, JSON.stringify(programs), PROGRAMS_CACHE_TTL_SEC_);
  } catch (e) {}
  return programs;
}

function getProgramsCatalog() {
  return getProgramsCatalog_();
}

function getUserEnrolledProgramIds(userId) {
  try {
    return getUserEnrolledProgramIds_(userId);
  } catch (error) {
    return [];
  }
}

function getAvailablePrograms(userId) {
  var programs = getProgramsCatalog_();
  var enrolledLookup = getUserEnrolledProgramLookup_(userId);
  return programs.map(function(prog) {
    return {
      programId: prog.programId,
      title: prog.title,
      type: prog.type,
      description: prog.description,
      isEnrolled: enrolledLookup.hasOwnProperty(prog.programId)
    };
  });
}

function enrollUser(userId, programId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var enrSheet = ss.getSheetByName("Enrollments");
  var eventsSheet = ss.getSheetByName("Events");
  
  if (!enrSheet || !eventsSheet) return { success: false, message: "System error: Database sheets missing." };

  var targetUserId = normalizeId_(userId);
  var targetProgramId = normalizeId_(programId);
  if (!targetUserId || !targetProgramId) {
    return { success: false, message: "Missing user or program id." };
  }
  
  // 1. Get User's Active Program Enrollments (only this user's rows)
  var enrolledLookup = getUserEnrolledProgramLookup_(targetUserId);
  var activeProgramIds = [];
  for (var enrolledId in enrolledLookup) {
    if (enrolledLookup.hasOwnProperty(enrolledId)) activeProgramIds.push(enrolledId);
  }

  // 2. Map all Events to check for exact clashes
  var evData = eventsSheet.getDataRange().getValues();
  if (!evData || evData.length < 1) {
    return { success: false, message: 'System error: Events sheet empty.' };
  }
  var evHeaders = evData[0];
  var evProgIdx = findHeaderIndex_(evHeaders, ['program_id', 'program id', 'programid']);
  var evDateIdx = findHeaderIndex_(evHeaders, ['event_date', 'event date', 'eventdate']);
  var evTimeIdx = findHeaderIndex_(evHeaders, ['time_slot', 'time slot', 'timeslot']);
  var evNameIdx = findHeaderIndex_(evHeaders, ['event_name', 'event name', 'eventname']);
  if (evProgIdx === -1 || evDateIdx === -1 || evTimeIdx === -1 || evNameIdx === -1) {
    return { success: false, message: 'System error: Events missing required schedule columns.' };
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
    var eName = evNameIdx !== -1 ? String(evData[e][evNameIdx]).trim() : "Unnamed Event";

    if (activeProgramIds.indexOf(eProgId) !== -1) {
      bookedSlots.push(slotKey); 
    }
    if (eProgId === targetProgramId) {
      targetEvents.push({ name: eName, key: slotKey, time: eTime });
    }
  }

  // 3. Compare Target Events against Booked Slots
  for (var t = 0; t < targetEvents.length; t++) {
    if (bookedSlots.indexOf(targetEvents[t].key) !== -1) {
      return {
        success: false,
        message: targetEvents[t].name + " at " + targetEvents[t].time
      };
    }
  }

  // 4. Process the enrollment
  var headers = enrSheet.getRange(1, 1, 1, enrSheet.getLastColumn()).getValues()[0];
  var enrollId = 'ENR-' + Utilities.getUuid().substring(0, 8).toUpperCase();
  var newRow = new Array(headers.length).fill("");
  
  var idIdx = findHeaderIndex_(headers, ['enrollment_id', 'enrollment id', 'enrollmentid']);
  var progIdx = findHeaderIndex_(headers, ['program_id', 'program id', 'programid']);
  var userIdx = findHeaderIndex_(headers, ['user_id', 'user id', 'userid', 'member_id', 'member id']);
  var dateIdx = findHeaderIndex_(headers, ['timestamp', 'enrollment_date', 'enrollment date', 'date']);
  var statusIdx = findHeaderIndex_(headers, ['status', 'enrollment_status', 'enrollment status']);

  if (progIdx === -1 || userIdx === -1) {
    return { success: false, message: "System error: Enrollments missing User_ID or Program_ID column." };
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
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
  
  var userIdx = headers.indexOf('user_id');
  var progIdx = headers.indexOf('program_id');
  var statusIdx = headers.indexOf('status');
  
  if (userIdx === -1 || progIdx === -1 || statusIdx === -1) {
    return { success: false, message: "System error: Missing Status column in Enrollments." };
  }
  
  // Find the exact active enrollment and change it to Cancelled
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][userIdx]).trim() === String(userId).trim() && 
        String(data[i][progIdx]).trim() === String(programId).trim() &&
        String(data[i][statusIdx]).trim().toLowerCase() === "active") {
        
        sheet.getRange(i + 1, statusIdx + 1).setValue("Cancelled");
        return { success: true };
    }
  }
  return { success: false, message: "Active enrollment record not found." };
}

function updateCredentials(userId, newUsername, newPin) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
  
  var userIndex = headers.indexOf('username');
  var pinIndex = headers.indexOf('pin_code');
  if (pinIndex === -1) pinIndex = headers.indexOf('pin');
  var idIndex = headers.indexOf('user_id');
  
  var cleanNewUser = String(newUsername).trim().toLowerCase();
  var cleanNewPin = String(newPin).trim().replace(/\D/g, '');
  if (cleanNewPin.length !== 4) return { success: false, message: "PIN must be exactly 4 digits." };
  
  // Check for duplicates
  for (var i = 1; i < data.length; i++) {
    var checkId = String(data[i][idIndex]).trim();
    var checkUser = String(data[i][userIndex]).trim().toLowerCase();
    if (checkId !== userId && checkUser === cleanNewUser) {
      return { success: false, message: "Username is already taken." };
    }
  }
  
  // Apply update
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][idIndex]).trim() === userId) {
      sheet.getRange(r + 1, userIndex + 1).setValue(cleanNewUser);
      sheet.getRange(r + 1, pinIndex + 1).setValue(cleanNewPin);
      return { success: true };
    }
  }
  return { success: false, message: "User not found." };
}

function registerNewMember(name, phone) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  
  var hex1 = Math.floor(Math.random() * (65535 - 4096 + 1) + 4096).toString(16).toUpperCase();
  var hex2 = Math.floor(Math.random() * (65535 - 4096 + 1) + 4096).toString(16).toUpperCase();
  var newHexId = "GC-" + hex1 + "-" + hex2;
  var newPin = Math.floor(Math.random() * (9999 - 1000 + 1) + 1000);
  
  // Smart Username Generation
  var usernameIdx = headers.map(function(h) { return String(h).trim().toLowerCase(); }).indexOf('username');
  var baseUser = String(name).replace(/\s+/g, '').toLowerCase();
  var simpleUsername = baseUser;
  var counter = 1;
  
  var existingUsers = [];
  for(var i=1; i<data.length; i++) {
    if(usernameIdx > -1 && data[i][usernameIdx]) existingUsers.push(String(data[i][usernameIdx]).trim().toLowerCase());
  }
  while(existingUsers.indexOf(simpleUsername) !== -1) {
    simpleUsername = baseUser + counter;
    counter++;
  }
  
  var newRow = new Array(headers.length).fill("");
  var idIndex = headers.map(function(h) { return String(h).trim().toLowerCase(); }).indexOf('user_id');
  var nameIndex = headers.map(function(h) { return String(h).trim().toLowerCase(); }).indexOf('name');
  var pinIndex = headers.map(function(h) { return String(h).trim().toLowerCase(); }).indexOf('pin_code');
  if (pinIndex === -1) pinIndex = headers.map(function(h) { return String(h).trim().toLowerCase(); }).indexOf('pin');
  var phoneIndex = headers.map(function(h) { return String(h).trim().toLowerCase(); }).indexOf('phone');
  var qrIndex = headers.map(function(h) { return String(h).trim().toLowerCase(); }).indexOf('qr_code_string');
  var roleIndex = headers.map(function(h) { return String(h).trim().toLowerCase(); }).indexOf('role');
  var statusIndex = headers.map(function(h) { return String(h).trim().toLowerCase(); }).indexOf('status');

  if(idIndex > -1) newRow[idIndex] = newHexId;
  if(nameIndex > -1) newRow[nameIndex] = String(name).trim();
  if(usernameIdx > -1) newRow[usernameIdx] = simpleUsername;
  if(pinIndex > -1) newRow[pinIndex] = newPin;
  if(phoneIndex > -1) newRow[phoneIndex] = String(phone).trim();
  if(qrIndex > -1) newRow[qrIndex] = newHexId;
  if(roleIndex > -1) newRow[roleIndex] = "Member"; 
  if(statusIndex > -1) newRow[statusIndex] = "Active";

  sheet.appendRow(newRow);
  
  return { Username: simpleUsername, PIN: newPin, Name: name };
}

function onEdit(e) {
  var sheet = e.source.getActiveSheet();
  if (sheet.getName() !== "Users") return;
  var range = e.range;
  var rowStart = range.getRow();
  var rowEnd = range.getLastRow();
  
  if (rowStart === 1 && rowEnd === 1) return;
  
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idCol = headers.indexOf('User_ID') + 1;
  var nameCol = headers.indexOf('Name') + 1;
  var pinCol = headers.indexOf('PIN_Code') + 1;
  var qrCol = headers.indexOf('QR_Code_String') + 1;
  
  for (var i = rowStart; i <= rowEnd; i++) {
    var nameValue = sheet.getRange(i, nameCol).getValue();
    var idValue = sheet.getRange(i, idCol).getValue();
    
    if (nameValue && !idValue) {
      var hex1 = Math.floor(Math.random() * (65535 - 4096 + 1) + 4096).toString(16).toUpperCase();
      var hex2 = Math.floor(Math.random() * (65535 - 4096 + 1) + 4096).toString(16).toUpperCase();
      var newHexId = "GC-" + hex1 + "-" + hex2;
      var newPin = Math.floor(Math.random() * (9999 - 1000 + 1) + 1000);
      
      sheet.getRange(i, idCol).setValue(newHexId);
      sheet.getRange(i, pinCol).setValue(newPin);
      sheet.getRange(i, qrCol).setValue(newHexId);
    }
  }
}


// Auto Generate Events 
function generateMonthlyRecurringEvents() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var eventsSheet = ss.getSheetByName('Events');
  if (!eventsSheet) return;

  // 1. DEFINE YOUR RECURRING PROGRAMS HERE
  // dayOfWeek: 0 = Sunday, 1 = Monday, 2 = Tuesday, etc.
  var recurringPrograms = [
    { 
      programId: "dd646847", // Replace with your actual Program_ID
      dayOfWeek: 0,               // Sunday
      startTime: "3:00 PM",
      // endTime: "4:00 PM",
      namePrefix: "青崇"
    },
    // { 
    //   programId: "PRG-WEDNESDAY", // Replace with your actual Program_ID
    //   dayOfWeek: 3,               // Wednesday
    //   startTime: "07:30 PM",
    //   endTime: "09:00 PM",
    //   namePrefix: "Wednesday Bible Study"
    // }
  ];

  // 2. CALCULATE THE TARGET MONTH (Next Month)
  var today = new Date();
  var targetYear = today.getFullYear();
  var targetMonth = today.getMonth() + 1; // +1 gets us to next month
  
  if (targetMonth > 11) { // If it's December, roll over to January of next year
    targetMonth = 0;
    targetYear++;
  }

  // Get the total number of days in the target month
  var daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

  // 3. GENERATE THE EVENTS
  var newRows = [];
  
  // Loop through every day of the target month
  for (var day = 1; day <= daysInMonth; day++) {
    var checkDate = new Date(targetYear, targetMonth, day);
    var currentDayOfWeek = checkDate.getDay();
    
    // Check if this day matches any of our recurring programs
    for (var p = 0; p < recurringPrograms.length; p++) {
      var prog = recurringPrograms[p];
      
      if (currentDayOfWeek === prog.dayOfWeek) {
        var dateString = Utilities.formatDate(checkDate, Session.getScriptTimeZone(), 'dd/MM/YYYY');
        // var timeSlot = prog.startTime + " - " + prog.endTime;
        var timeSlot = prog.startTime;
        var eventName = prog.namePrefix + " - " + dateString;
        var eventId = Utilities.getUuid().substring(0, 8).toUpperCase();
        
        // Push the new event to our array (Make sure this order matches your Events sheet columns)
        newRows.push([
          eventId,         // Event_ID
          prog.programId,  // Program_ID
          dateString,      // Event_Date
          timeSlot,         // Time_Slot
          eventName       // Event_Name
        ]);
      }
    }
  }

  // 4. WRITE TO SPREADSHEET (Bulk insert for performance)
  if (newRows.length > 0) {
    var startRow = eventsSheet.getLastRow() + 1;
    eventsSheet.getRange(startRow, 1, newRows.length, newRows[0].length).setValues(newRows);
  }
}

// =============================================================================
// Task 2 — Member PIN Auth, Persistent Session & Profile Pass View
// New RPC entry points: api_loginUser, api_registerUser, api_logoutUser,
// api_getCurrentSession. Helpers: SESSION_SALT_, sha256Hmac_, verifySessionToken_.
// Per ADR-0005: server is authoritative for `role`; client localStorage is cache only.
// =============================================================================

var SESSION_TTL_MS_ = 30 * 24 * 60 * 60 * 1000; // 30-day rolling session
var DEFAULT_DEV_SALT_ = 'static-dev-salt-change-me';

function getSessionSalt_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var stored = props.getProperty('EFCC_SESSION_SALT');
    if (stored) return stored;
  } catch (e) {}
  return DEFAULT_DEV_SALT_;
}

function sha256Hmac_(input) {
  var raw = String(input == null ? '' : input);
  var digest = Utilities.computeHmacSha256Signature(raw, getSessionSalt_());
  var bytes = [];
  for (var i = 0; i < digest.length; i++) {
    var hex = (digest[i] & 0xFF).toString(16);
    if (hex.length === 1) hex = '0' + hex;
    bytes.push(hex);
  }
  return bytes.join('');
}

function getSessionIssuedAt_(userId) {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('session_issued_' + normalizeId_(userId));
  return raw ? Number(raw) : 0;
}

function setSessionIssuedNow_(userId) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('session_issued_' + normalizeId_(userId), String(Date.now()));
}

function clearSessionIssued_(userId) {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('session_issued_' + normalizeId_(userId));
}

// True only if a login issued this user's current token within SESSION_TTL_MS_
// and no logout has revoked it since. Deterministic tokens (userId|pinHash|salt)
// stay constant across logins, so expiry/revocation must be tracked separately.
function isSessionActiveForUser_(userId) {
  var issuedAt = getSessionIssuedAt_(userId);
  if (!issuedAt) return false;
  return (Date.now() - issuedAt) <= SESSION_TTL_MS_;
}

function lookupUserByCredentials_(username, pin) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  if (!sheet) return { ok: false, message: "System error: Users sheet missing." };

  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return { ok: false, message: "System error: Users sheet empty." };

  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
  function col(name) { return headers.indexOf(name); }
  var userIdx = col('username'); if (userIdx === -1) userIdx = col('user name');
  var pinIdx = col('pin_code'); if (pinIdx === -1) pinIdx = col('pin');
  var idIdx = col('user_id'); if (idIdx === -1) idIdx = col('user id');
  var nameIdx = col('name'); if (nameIdx === -1) nameIdx = col('full name');
  var qrIdx = col('qr_code_string'); if (qrIdx === -1) qrIdx = col('qr code string');
  var roleIdx = col('role');
  var statusIdx = col('status');

  if (userIdx === -1 || pinIdx === -1 || idIdx === -1 || qrIdx === -1) {
    return { ok: false, message: "System error: Required columns missing." };
  }

  function normalizePin(value) {
    var s = String(value == null ? '' : value).trim().replace(/\D/g, '');
    if (!s) return '';
    if (s.length > 4) s = s.substring(s.length - 4);
    while (s.length < 4) s = '0' + s;
    return s;
  }

  var inputUser = String(username == null ? '' : username).trim().toLowerCase();
  var inputPin = normalizePin(pin);

  var sawUsername = false;
  for (var i = 1; i < data.length; i++) {
    if (!data[i][userIdx]) continue;
    var rowUser = String(data[i][userIdx]).trim().toLowerCase();
    var rowPin = normalizePin(data[i][pinIdx]);
    if (rowUser === inputUser) sawUsername = true;
    if (rowUser !== inputUser || rowPin !== inputPin) continue;

    var statusRaw = statusIdx !== -1 ? String(data[i][statusIdx]).trim().toLowerCase() : 'active';
    if (statusRaw === 'pending') return { ok: false, message: 'Account pending approval.' };
    if (statusRaw && statusRaw !== 'active') return { ok: false, message: 'Account not active.' };

    var userId = normalizeId_(data[i][idIdx]);
    var role = roleIdx !== -1 && data[i][roleIdx]
      ? String(data[i][roleIdx]).trim().toUpperCase()
      : 'MEMBER';
    if (role !== 'ADMIN' && role !== 'STAFF' && role !== 'EVENT_LEADER' && role !== 'MEMBER') {
      role = 'MEMBER';
    }
    return {
      ok: true,
      userId: userId,
      name: nameIdx !== -1 ? String(data[i][nameIdx]).trim() : 'Member',
      role: role,
      qrCodeString: String(data[i][qrIdx]).trim(),
      pinHash: rowPin
    };
  }
  if (sawUsername) return { ok: false, message: 'PIN incorrect.' };
  return { ok: false, message: 'Invalid Username or PIN.' };
}

function verifySessionToken_(userId, sessionToken) {
  if (!userId || !sessionToken) return false;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  if (!sheet) return false;
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return false;
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var idIdx = headers.indexOf('user_id');
  if (idIdx === -1) idIdx = headers.indexOf('user id');
  var pinIdx = headers.indexOf('pin_code');
  if (pinIdx === -1) pinIdx = headers.indexOf('pin');
  var statusIdx = headers.indexOf('status');
  if (idIdx === -1 || pinIdx === -1) return false;

  var targetId = normalizeId_(userId);
  for (var i = 1; i < data.length; i++) {
    if (normalizeId_(data[i][idIdx]) !== targetId) continue;
    var statusRaw = statusIdx !== -1 ? String(data[i][statusIdx] == null ? '' : data[i][statusIdx]).trim().toLowerCase() : 'active';
    if (statusRaw && statusRaw !== 'active') return false;
    var pinHash = String(data[i][pinIdx] == null ? '' : data[i][pinIdx]).trim();
    var expected = sha256Hmac_(targetId + '|' + pinHash + '|' + getSessionSalt_());
    if (expected !== String(sessionToken)) return false;
    return isSessionActiveForUser_(targetId);
  }
  return false;
}

function api_loginUser(username, pin) {
  var matched = lookupUserByCredentials_(username, pin);
  if (!matched.ok) return { success: false, message: matched.message };
  setSessionIssuedNow_(matched.userId);
  var expiry = Date.now() + SESSION_TTL_MS_;
  var token = sha256Hmac_(matched.userId + '|' + matched.pinHash + '|' + getSessionSalt_());
  return {
    success: true,
    data: {
      userId: matched.userId,
      name: matched.name,
      role: matched.role,
      sessionToken: token,
      qrCodeString: matched.qrCodeString,
      expiryTimestamp: expiry
    }
  };
}

function api_getCurrentSession(userId, sessionToken) {
  if (!verifySessionToken_(userId, sessionToken)) {
    return { success: false, message: 'Session invalid or expired.' };
  }
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  if (!sheet) return { success: false, message: 'Users sheet missing.' };
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return { success: false, message: 'Users sheet empty.' };
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var idIdx = headers.indexOf('user_id'); if (idIdx === -1) idIdx = headers.indexOf('user id');
  var nameIdx = headers.indexOf('name'); if (nameIdx === -1) nameIdx = headers.indexOf('full name');
  var qrIdx = headers.indexOf('qr_code_string'); if (qrIdx === -1) qrIdx = headers.indexOf('qr code string');
  var roleIdx = headers.indexOf('role');
  var targetId = normalizeId_(userId);
  for (var i = 1; i < data.length; i++) {
    if (normalizeId_(data[i][idIdx]) !== targetId) continue;
    var role = roleIdx !== -1 && data[i][roleIdx]
      ? String(data[i][roleIdx]).trim().toUpperCase()
      : 'MEMBER';
    if (role !== 'ADMIN' && role !== 'STAFF' && role !== 'EVENT_LEADER' && role !== 'MEMBER') {
      role = 'MEMBER';
    }
    return {
      success: true,
      data: {
        userId: targetId,
        name: nameIdx !== -1 ? String(data[i][nameIdx]).trim() : 'Member',
        role: role,
        sessionToken: String(sessionToken),
        qrCodeString: qrIdx !== -1 ? String(data[i][qrIdx]).trim() : targetId,
        expiryTimestamp: getSessionIssuedAt_(targetId) + SESSION_TTL_MS_
      }
    };
  }
  return { success: false, message: 'User not found.' };
}

function api_logoutUser(userId, sessionToken) {
  if (userId && sessionToken && verifySessionToken_(userId, sessionToken)) {
    clearSessionIssued_(userId);
  }
  return { success: true };
}

function api_registerUser(payload) {
  if (!payload) return { success: false, message: 'Missing registration payload.' };
  var name = String(payload.name == null ? '' : payload.name).trim();
  var username = String(payload.username == null ? '' : payload.username).trim().toLowerCase();
  var pin = String(payload.pin == null ? '' : payload.pin).trim().replace(/\D/g, '');
  var phone = String(payload.phone == null ? '' : payload.phone).trim();
  var address = String(payload.address == null ? '' : payload.address).trim();

  if (!name) return { success: false, message: 'Name is required.' };
  if (!username) return { success: false, message: 'Username is required.' };
  if (!/^\d{4}$/.test(pin)) return { success: false, message: 'PIN must be exactly 4 digits.' };

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  if (!sheet) return { success: false, message: 'Users sheet missing.' };
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 1) return { success: false, message: 'Users sheet empty.' };
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });

  function col(name) { return headers.indexOf(name); }
  var userIdx = col('username'); if (userIdx === -1) userIdx = col('user name');
  if (userIdx === -1) return { success: false, message: 'Username column missing.' };

  // Reject duplicate usernames (case-insensitive).
  for (var r = 1; r < data.length; r++) {
    if (!data[r][userIdx]) continue;
    if (String(data[r][userIdx]).trim().toLowerCase() === username) {
      return { success: false, message: 'Username already taken.' };
    }
  }

  function pickCol(names) {
    for (var n = 0; n < names.length; n++) {
      var idx = col(names[n]);
      if (idx !== -1) return idx;
    }
    return -1;
  }

  var idIdx = pickCol(['user_id', 'user id']);
  var nameIdx = pickCol(['name', 'full name']);
  var pinIdx = pickCol(['pin_code', 'pin']);
  var phoneIdx = col('phone');
  var addressIdx = col('address');
  var qrIdx = pickCol(['qr_code_string', 'qr code string']);
  var roleIdx = col('role');
  var statusIdx = col('status');

  var newHex1 = Math.floor(Math.random() * (65535 - 4096 + 1) + 4096).toString(16).toUpperCase();
  var newHex2 = Math.floor(Math.random() * (65535 - 4096 + 1) + 4096).toString(16).toUpperCase();
  var newHexId = 'GC-' + newHex1 + '-' + newHex2;

  var row = new Array(headers.length).fill('');
  if (idIdx > -1) row[idIdx] = newHexId;
  if (nameIdx > -1) row[nameIdx] = name;
  if (userIdx > -1) row[userIdx] = username;
  if (pinIdx > -1) row[pinIdx] = pin;
  if (phoneIdx > -1) row[phoneIdx] = phone;
  if (addressIdx > -1) row[addressIdx] = address;
  if (qrIdx > -1) row[qrIdx] = newHexId;
  if (roleIdx > -1) row[roleIdx] = 'MEMBER';
  if (statusIdx > -1) row[statusIdx] = 'Active';

  sheet.appendRow(row);
  return {
    success: true,
    data: { userId: newHexId, name: name, role: 'MEMBER' }
  };
}

// Task 3 authenticated program catalog and enrollment RPCs.
function api_getProgramsCatalog(userId, sessionToken) {
  if (!verifySessionToken_(userId, sessionToken)) {
    throw new Error('Session invalid or expired.');
  }
  return getProgramsCatalog();
}

function api_getAvailablePrograms(userId, sessionToken) {
  if (!verifySessionToken_(userId, sessionToken)) {
    throw new Error('Session invalid or expired.');
  }
  return getAvailablePrograms(userId);
}

function api_enrollUser(userId, programId, sessionToken) {
  if (!verifySessionToken_(userId, sessionToken)) {
    return { success: false, message: 'Session invalid or expired.' };
  }
  return enrollUser(userId, programId);
}

function api_cancelEnrollment(userId, programId, sessionToken) {
  if (!verifySessionToken_(userId, sessionToken)) {
    return { success: false, message: 'Session invalid or expired.' };
  }
  return cancelEnrollment(userId, programId);
}

// Granted-user enrollment on behalf of a scanned member (Task 5 Quick Enroll).
// The caller's own session must be a granted user; the enrollment itself
// targets memberId, not the caller — this is deliberate staff-assisted enrollment.
function api_staffEnrollMember(grantedUserId, memberId, programId, sessionToken) {
  if (!grantedUserId || !sessionToken) return { success: false, message: 'Missing user session.' };
  var check = checkIsGrantedUser_(grantedUserId, sessionToken);
  if (!check.granted) return { success: false, message: check.message };
  if (!memberId) return { success: false, message: 'Member ID is required.' };
  if (!programId) return { success: false, message: 'Program ID is required.' };
  return enrollUser(memberId, programId);
}

// =============================================================================
// Task 4 — Granted User Dynamic Event Creation & Management
// Per ADR-0005: server-authoritative role check on every RPC.
// =============================================================================

function checkRoleAtLeast_(userId, requiredRole) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  if (!sheet) return 'MEMBER';
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return 'MEMBER';
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var idIdx = headers.indexOf('user_id');
  if (idIdx === -1) idIdx = headers.indexOf('user id');
  var roleIdx = headers.indexOf('role');
  if (idIdx === -1) return 'MEMBER';
  var targetId = normalizeId_(userId);
  for (var i = 1; i < data.length; i++) {
    if (normalizeId_(data[i][idIdx]) !== targetId) continue;
    var role = roleIdx !== -1 && data[i][roleIdx]
      ? String(data[i][roleIdx]).trim().toUpperCase()
      : 'MEMBER';
    if (role !== 'ADMIN' && role !== 'STAFF' && role !== 'EVENT_LEADER' && role !== 'MEMBER') {
      role = 'MEMBER';
    }
    return role;
  }
  return 'MEMBER';
}

function checkIsGrantedUser_(userId, sessionToken) {
  if (!verifySessionToken_(userId, sessionToken)) {
    return { granted: false, message: 'Session invalid or expired.' };
  }
  var role = checkRoleAtLeast_(userId, 'EVENT_LEADER');
  if (role === 'MEMBER') {
    return { granted: false, message: 'Permission denied. Only granted users can create events.' };
  }
  return { granted: true, role: role };
}

function api_createEvent(payload) {
  if (!payload) return { success: false, message: 'Missing payload.' };
  var userId = String(payload.createdBy == null ? '' : payload.createdBy).trim();
  var sessionToken = String(payload.__sessionToken || payload.sessionToken || payload._sessionToken || '').trim();
  if (!userId || !sessionToken) return { success: false, message: 'Missing user session.' };
  var check = checkIsGrantedUser_(userId, sessionToken);
  if (!check.granted) return { success: false, message: check.message };
  var role = check.role;

  if (role === 'MEMBER') {
    return { success: false, message: 'Permission denied. Only granted users can create events.' };
  }

  var eventName = String(payload.eventName == null ? '' : payload.eventName).trim();
  var eventDate = String(payload.eventDate == null ? '' : payload.eventDate).trim();
  var timeSlot = String(payload.timeSlot == null ? '' : payload.timeSlot).trim();
  var programId = String(payload.programId == null ? '' : payload.programId).trim();
  var eventType = String(payload.eventType == null ? '' : payload.eventType).trim().toUpperCase();
  if (eventType !== 'REGULAR' && eventType !== 'SPECIAL') eventType = 'REGULAR';
  var recurrence = String(payload.recurrence == null ? '' : payload.recurrence).trim().toUpperCase();
  if (recurrence !== 'NONE' && recurrence !== 'WEEKLY' && recurrence !== 'MONTHLY') recurrence = 'NONE';

  if (!eventName) return { success: false, message: 'Event name is required.' };
  if (!eventDate) return { success: false, message: 'Event date is required.' };
  if (!timeSlot) return { success: false, message: 'Time slot is required.' };
  if (!programId) return { success: false, message: 'Program ID is required.' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var eventsSheet = ss.getSheetByName('Events');
  if (!eventsSheet) return { success: false, message: 'Events sheet missing.' };

  var headers = eventsSheet.getRange(1, 1, 1, eventsSheet.getLastColumn()).getValues()[0];
  var mappedHeaders = headers.map(function(h) { return String(h).trim().toLowerCase().replace(/[\s_]+/g, ''); });

  function colIdx(names) {
    for (var n = 0; n < names.length; n++) {
      var idx = mappedHeaders.indexOf(names[n].toLowerCase().replace(/[\s_]+/g, ''));
      if (idx !== -1) return idx;
    }
    return -1;
  }

  var eventIdCol = colIdx(['Event_ID', 'EventID']);
  var progIdCol = colIdx(['Program_ID', 'ProgramID']);
  var eventNameCol = colIdx(['Event_Name', 'EventName']);
  var eventDateCol = colIdx(['Event_Date', 'EventDate']);
  var timeSlotCol = colIdx(['Time_Slot', 'TimeSlot']);
  var eventTypeCol = colIdx(['Event_Type', 'EventType']);
  var recurCol = colIdx(['Recurrence_Type', 'RecurrenceType', 'Recurrence']);
  var statusCol = colIdx(['Status']);
  var createdByCol = colIdx(['Created_By', 'CreatedBy']);
  var createdAtCol = colIdx(['Created_At', 'CreatedAt']);

  var newId = 'EVT-' + Utilities.getUuid().substring(0, 8).toUpperCase();
  var now = new Date().toISOString();

  var row = new Array(headers.length).fill('');
  if (eventIdCol > -1) row[eventIdCol] = newId;
  if (progIdCol > -1) row[progIdCol] = programId;
  if (eventNameCol > -1) row[eventNameCol] = eventName;
  if (eventDateCol > -1) row[eventDateCol] = eventDate;
  if (timeSlotCol > -1) row[timeSlotCol] = timeSlot;
  if (eventTypeCol > -1) row[eventTypeCol] = eventType;
  if (recurCol > -1) row[recurCol] = recurrence;
  if (statusCol > -1) row[statusCol] = 'Active';
  if (createdByCol > -1) row[createdByCol] = userId;
  if (createdAtCol > -1) row[createdAtCol] = now;

  eventsSheet.appendRow(row);

  return {
    success: true,
    data: {
      eventId: newId,
      programId: programId,
      eventName: eventName,
      eventDate: eventDate,
      timeSlot: timeSlot,
      eventType: eventType,
      recurrence: recurrence,
      status: 'ACTIVE',
      createdBy: userId,
      createdAt: now,
    }
  };
}

function api_cancelEvent(payload) {
  if (!payload) return { success: false, message: 'Missing payload.' };
  var eventId = String(payload.eventId == null ? '' : payload.eventId).trim();
  var userId = String(payload.cancelledBy == null ? '' : payload.cancelledBy).trim();
  var sessionToken = String(payload.__sessionToken || payload.sessionToken || payload._sessionToken || '').trim();
  if (!eventId) return { success: false, message: 'Event ID is required.' };
  if (!userId || !sessionToken) return { success: false, message: 'Missing user session.' };
  var check = checkIsGrantedUser_(userId, sessionToken);
  if (!check.granted) return { success: false, message: check.message };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var eventsSheet = ss.getSheetByName('Events');
  if (!eventsSheet) return { success: false, message: 'Events sheet missing.' };

  var data = eventsSheet.getDataRange().getValues();
  if (!data || data.length < 2) return { success: false, message: 'No events found.' };
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase().replace(/[\s_]+/g, ''); });

  function colIdx(names) {
    for (var n = 0; n < names.length; n++) {
      var idx = headers.indexOf(names[n].toLowerCase().replace(/[\s_]+/g, ''));
      if (idx !== -1) return idx;
    }
    return -1;
  }

  var eventIdCol = colIdx(['Event_ID', 'EventID']);
  var statusCol = colIdx(['Status']);
  if (eventIdCol === -1) return { success: false, message: 'Event_ID column not found.' };
  if (statusCol === -1) return { success: false, message: 'Status column not found.' };

  var targetId = normalizeId_(eventId);
  for (var i = 1; i < data.length; i++) {
    if (normalizeId_(data[i][eventIdCol]) !== targetId) continue;
    var rowNum = i + 1;
    eventsSheet.getRange(rowNum, statusCol + 1).setValue('Cancelled');
    return { success: true, message: 'Event cancelled successfully.' };
  }
  return { success: false, message: 'Event not found.' };
}

function api_getGrantedUserEvents(grantedUserId, sessionToken) {
  if (!grantedUserId || !sessionToken) {
    return { success: false, message: 'Missing user session.' };
  }
  var check = checkIsGrantedUser_(grantedUserId, sessionToken);
  if (!check.granted) return { success: false, message: check.message };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var eventsSheet = ss.getSheetByName('Events');
  if (!eventsSheet) return { success: false, message: 'Events sheet missing.' };

  var data = eventsSheet.getDataRange().getValues();
  if (!data || data.length < 2) return { success: true, data: [] };
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase().replace(/[\s_]+/g, ''); });

  function colIdx(names) {
    for (var n = 0; n < names.length; n++) {
      var idx = headers.indexOf(names[n].toLowerCase().replace(/[\s_]+/g, ''));
      if (idx !== -1) return idx;
    }
    return -1;
  }

  var eventIdCol = colIdx(['Event_ID', 'EventID']);
  var progIdCol = colIdx(['Program_ID', 'ProgramID']);
  var eventNameCol = colIdx(['Event_Name', 'EventName']);
  var eventDateCol = colIdx(['Event_Date', 'EventDate']);
  var timeSlotCol = colIdx(['Time_Slot', 'TimeSlot']);
  var eventTypeCol = colIdx(['Event_Type', 'EventType']);
  var recurCol = colIdx(['Recurrence_Type', 'RecurrenceType', 'Recurrence']);
  var statusCol = colIdx(['Status']);
  var createdByCol = colIdx(['Created_By', 'CreatedBy']);
  var createdAtCol = colIdx(['Created_At', 'CreatedAt']);

  var today = new Date();
  today.setHours(0, 0, 0, 0);

  var events = [];
  for (var i = 1; i < data.length; i++) {
    var rowStatus = statusCol > -1 ? String(data[i][statusCol] == null ? '' : data[i][statusCol]).trim().toLowerCase() : '';
    if (rowStatus !== '' && rowStatus !== 'active') continue;

    var rawDate = data[i][eventDateCol];
    var eventDateStr = String(rawDate == null ? '' : rawDate).trim();
    if (!eventDateStr) continue;

    // Parse dd/MM/YYYY format (existing convention)
    var dateParts = eventDateStr.split('/');
    if (dateParts.length === 3) {
      var eventDate = new Date(parseInt(dateParts[2], 10), parseInt(dateParts[1], 10) - 1, parseInt(dateParts[0], 10));
      if (eventDate < today) continue;
    }

    var createdBy = createdByCol > -1 ? String(data[i][createdByCol] == null ? '' : data[i][createdByCol]).trim() : '';
    var createdAt = createdAtCol > -1 ? String(data[i][createdAtCol] == null ? '' : data[i][createdAtCol]).trim() : '';
    var eventType = eventTypeCol > -1 ? String(data[i][eventTypeCol] == null ? '' : data[i][eventTypeCol]).trim().toUpperCase() : 'REGULAR';
    if (eventType !== 'REGULAR' && eventType !== 'SPECIAL') eventType = 'REGULAR';
    var recurrence = recurCol > -1 ? String(data[i][recurCol] == null ? '' : data[i][recurCol]).trim().toUpperCase() : 'NONE';
    if (recurrence !== 'NONE' && recurrence !== 'WEEKLY' && recurrence !== 'MONTHLY') recurrence = 'NONE';

    events.push({
      eventId: eventIdCol > -1 ? normalizeId_(data[i][eventIdCol]) : '',
      programId: progIdCol > -1 ? normalizeId_(data[i][progIdCol]) : '',
      programName: '',
      eventName: eventNameCol > -1 ? String(data[i][eventNameCol] == null ? '' : data[i][eventNameCol]).trim() : '',
      eventDate: eventDateStr,
      timeSlot: timeSlotCol > -1 ? String(data[i][timeSlotCol] == null ? '' : data[i][timeSlotCol]).trim() : '',
      eventType: eventType,
      recurrence: recurrence,
      status: 'ACTIVE',
      createdBy: createdBy || undefined,
      createdAt: createdAt || undefined,
    });
  }

  // Sort by eventDate ascending
  events.sort(function(a, b) {
    var da = a.eventDate.split('/');
    var db = b.eventDate.split('/');
    if (da.length === 3 && db.length === 3) {
      var dateA = new Date(parseInt(da[2], 10), parseInt(da[1], 10) - 1, parseInt(da[0], 10));
      var dateB = new Date(parseInt(db[2], 10), parseInt(db[1], 10) - 1, parseInt(db[0], 10));
      return dateA - dateB;
    }
    return 0;
  });

  return { success: true, data: events };
}
// =============================================================================
// Task 5 — Attendance QR Scanner & Manual Check-In
// Per ADR-0005: server-authoritative role gate (MEMBER cannot check in).
// LockService atomic duplicate check + append.
// =============================================================================

// Real member search for manual attendance check-in (Task 5).
// Role-gated: only granted users may search the member roster.
function api_searchMembers(query, grantedUserId, sessionToken) {
  if (!grantedUserId || !sessionToken) return { success: false, message: 'Missing user session.', data: [] };
  var check = checkIsGrantedUser_(grantedUserId, sessionToken);
  if (!check.granted) return { success: false, message: check.message, data: [] };

  var q = String(query == null ? '' : query).trim().toLowerCase();
  if (!q) return { success: true, data: [] };

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  if (!sheet) return { success: false, message: 'Users sheet missing.', data: [] };
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return { success: true, data: [] };
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var idIdx = headers.indexOf('user_id'); if (idIdx === -1) idIdx = headers.indexOf('user id');
  var nameIdx = headers.indexOf('name'); if (nameIdx === -1) nameIdx = headers.indexOf('full name');
  var phoneIdx = headers.indexOf('phone');
  var statusIdx = headers.indexOf('status');
  var roleIdx = headers.indexOf('role');
  if (idIdx === -1) return { success: true, data: [] };

  var results = [];
  for (var i = 1; i < data.length && results.length < 10; i++) {
    var statusRaw = statusIdx > -1 ? String(data[i][statusIdx] == null ? '' : data[i][statusIdx]).trim().toLowerCase() : 'active';
    if (statusRaw && statusRaw !== 'active') continue;
    var roleRaw = roleIdx > -1 && data[i][roleIdx]
      ? String(data[i][roleIdx]).trim().toUpperCase()
      : 'MEMBER';
    if (roleRaw !== 'MEMBER') continue;
    var uid = normalizeId_(data[i][idIdx]);
    if (!uid) continue;
    var name = nameIdx > -1 ? String(data[i][nameIdx] == null ? '' : data[i][nameIdx]).trim() : '';
    var phone = phoneIdx > -1 ? String(data[i][phoneIdx] == null ? '' : data[i][phoneIdx]).trim() : '';
    var haystack = (name + ' ' + uid + ' ' + phone).toLowerCase();
    if (haystack.indexOf(q) === -1) continue;
    results.push({ userId: uid, name: name || uid, phone: phone || undefined });
  }
  return { success: true, data: results };
}

function api_checkInMember(payload) {
  if (!payload) return { success: false, message: 'Missing payload.' };

  var staffId = String(payload.staffId || '').trim();
  var sessionToken = String(payload.sessionToken || '').trim();
  if (!staffId || !sessionToken) return { success: false, message: 'Missing user session.' };

  // 1. Verify session
  if (!verifySessionToken_(staffId, sessionToken)) {
    return { success: false, message: 'Session invalid or expired.' };
  }

  // 2. Role gate — MEMBER cannot check in
  var role = checkRoleAtLeast_(staffId, 'EVENT_LEADER');
  if (role === 'MEMBER') {
    return { success: false, message: 'Permission denied. Only granted users can check in members.' };
  }

  var eventId = normalizeId_(String(payload.eventId || '').trim());
  var memberId = normalizeId_(String(payload.userId || '').trim()); // member being checked in
  var method = String(payload.method || '').trim();
  if (!eventId) return { success: false, message: 'Event ID is required.' };
  if (!memberId) return { success: false, message: 'Member ID is required.' };

  // Look up the event's program and confirm it is active.
  var eventsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Events');
  if (!eventsSheet) return { success: false, message: 'Events sheet missing.' };
  var evData = eventsSheet.getDataRange().getValues();
  var evHeaders = evData.length > 0 ? evData[0].map(function(h) { return String(h).trim().toLowerCase().replace(/[\s_]+/g, ''); }) : [];
  function evColIdx(names) {
    for (var n = 0; n < names.length; n++) {
      var idx = evHeaders.indexOf(names[n].toLowerCase().replace(/[\s_]+/g, ''));
      if (idx !== -1) return idx;
    }
    return -1;
  }
  var evIdCol = evColIdx(['event_id', 'eventid']);
  var evProgCol = evColIdx(['program_id', 'programid']);
  var evStatusCol = evColIdx(['status']);
  var eventProgramId = '';
  var eventFound = false;
  for (var e = 1; e < evData.length; e++) {
    if (evIdCol === -1 || normalizeId_(evData[e][evIdCol]) !== eventId) continue;
    eventFound = true;
    var evStatus = evStatusCol > -1 ? String(evData[e][evStatusCol] == null ? '' : evData[e][evStatusCol]).trim().toLowerCase() : 'active';
    if (evStatus && evStatus !== 'active') {
      return { success: false, message: 'This event is not active.' };
    }
    eventProgramId = evProgCol > -1 ? normalizeId_(evData[e][evProgCol]) : '';
    break;
  }
  if (!eventFound) return { success: false, message: 'Event not found.' };

  // Look up the member's display name and confirm the account exists.
  var usersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  var memberName = memberId;
  var memberFound = false;
  if (usersSheet) {
    var uData = usersSheet.getDataRange().getValues();
    if (uData && uData.length > 1) {
      var uHeaders = uData[0].map(function(h) { return String(h).trim().toLowerCase(); });
      var uIdIdx = uHeaders.indexOf('user_id'); if (uIdIdx === -1) uIdIdx = uHeaders.indexOf('user id');
      var uNameIdx = uHeaders.indexOf('name'); if (uNameIdx === -1) uNameIdx = uHeaders.indexOf('full name');
      if (uIdIdx > -1) {
        for (var u = 1; u < uData.length; u++) {
          if (normalizeId_(uData[u][uIdIdx]) !== memberId) continue;
          memberFound = true;
          memberName = uNameIdx > -1 ? (String(uData[u][uNameIdx] || '').trim() || memberId) : memberId;
          break;
        }
      }
    }
  }
  if (!memberFound) return { success: false, message: 'Member not found.' };

  // Enrollment eligibility — member must be actively enrolled in the event's program.
  if (eventProgramId) {
    var enrolledIds = getUserEnrolledProgramIds_(memberId);
    if (enrolledIds.indexOf(eventProgramId) === -1) {
      return {
        success: false,
        notEnrolled: true,
        data: { memberId: memberId, memberName: memberName },
        message: memberName + ' is not enrolled in this program.'
      };
    }
  }

  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(5000)) {
      return { success: false, message: 'System busy. Please try again.' };
    }

    var attSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Attendance');
    if (!attSheet) {
      lock.releaseLock();
      return { success: false, message: 'Attendance sheet missing.' };
    }

    var attData = attSheet.getDataRange().getValues();
    var headers = attData.length > 0 ? attData[0] : [];
    var normHeaders = headers.map(function(h) { return String(h).trim().toLowerCase().replace(/[\s_]+/g, ''); });

    function colIdx(names) {
      for (var n = 0; n < names.length; n++) {
        var idx = normHeaders.indexOf(names[n].toLowerCase().replace(/[\s_]+/g, ''));
        if (idx !== -1) return idx;
      }
      return -1;
    }

    var attEventIdx = colIdx(['event_id', 'eventid']);
    var attMemberIdx = colIdx(['user_id', 'userid', 'member_id', 'memberid']);
    var attStatusIdx = colIdx(['status']);
    var attTimeIdx = colIdx(['check_in_time', 'checkintime']);

    // Duplicate check — look for existing Active row for this event + member
    if (attData.length > 1 && attEventIdx > -1 && attMemberIdx > -1) {
      for (var i = 1; i < attData.length; i++) {
        var eId = normalizeId_(attData[i][attEventIdx]);
        var mId = normalizeId_(attData[i][attMemberIdx]);
        if (eId !== eventId || mId !== memberId) continue;
        var status = attStatusIdx > -1 ? String(attData[i][attStatusIdx] == null ? '' : attData[i][attStatusIdx]).trim().toLowerCase() : '';
        if (status === '' || status === 'active') {
          var existingTime = attTimeIdx > -1 ? String(attData[i][attTimeIdx] == null ? '' : attData[i][attTimeIdx]).trim() : '';
          lock.releaseLock();
          return {
            success: false,
            duplicate: true,
            data: { checkInTime: existingTime, memberName: memberName },
            message: memberName + ' is already checked in.'
          };
        }
      }
    }

    // Append new attendance row
    var newId = 'ATT-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    var now = new Date().toISOString();

    // Re-fetch fresh headers for column mapping
    var freshHeaders = attSheet.getRange(1, 1, 1, attSheet.getLastColumn()).getValues()[0];
    var freshNorm = freshHeaders.map(function(h) { return String(h).trim().toLowerCase().replace(/[\s_]+/g, ''); });

    function freshColIdx(names) {
      for (var n = 0; n < names.length; n++) {
        var idx = freshNorm.indexOf(names[n].toLowerCase().replace(/[\s_]+/g, ''));
        if (idx !== -1) return idx;
      }
      return -1;
    }

    var row = new Array(freshHeaders.length).fill('');
    var idCol = freshColIdx(['attendance_id', 'attendanceid']);
    var eventCol = freshColIdx(['event_id', 'eventid']);
    var userCol = freshColIdx(['user_id', 'userid', 'member_id', 'memberid']);
    var timeCol = freshColIdx(['check_in_time', 'checkintime']);
    var sourceCol = freshColIdx(['check_in_method', 'checkinmethod', 'source']);
    var byCol = freshColIdx(['check_in_by', 'checkinby']);
    var statusCol = freshColIdx(['status']);

    if (idCol > -1) row[idCol] = newId;
    if (eventCol > -1) row[eventCol] = eventId;
    if (userCol > -1) row[userCol] = memberId;
    if (timeCol > -1) row[timeCol] = now;
    if (sourceCol > -1) row[sourceCol] = method;
    if (byCol > -1) row[byCol] = staffId;
    if (statusCol > -1) row[statusCol] = 'Active';

    attSheet.appendRow(row);
    lock.releaseLock();

    return {
      success: true,
      data: { checkInTime: now, memberName: memberName }
    };
  } catch (e) {
    lock.releaseLock();
    return { success: false, message: 'Error during check-in: ' + e.message };
  }
}

function api_getEventAttendance(eventId, viewerId, sessionToken) {
  if (!eventId) return { success: false, message: 'Event ID is required.', data: [] };
  if (!viewerId || !sessionToken) return { success: false, message: 'Missing user session.', data: [] };
  if (!verifySessionToken_(viewerId, sessionToken)) {
    return { success: false, message: 'Session invalid or expired.', data: [] };
  }
  var role = checkRoleAtLeast_(viewerId, 'EVENT_LEADER');
  if (role === 'MEMBER') {
    return { success: false, message: 'Permission denied. Only granted users can view attendance.', data: [] };
  }

  var attSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Attendance');
  if (!attSheet) return { success: true, data: [] };

  var attData = attSheet.getDataRange().getValues();
  if (!attData || attData.length < 2) return { success: true, data: [] };

  var headers = attData[0];
  var normHeaders = headers.map(function(h) { return String(h).trim().toLowerCase().replace(/[\s_]+/g, ''); });

  function colIdx(names) {
    for (var n = 0; n < names.length; n++) {
      var idx = normHeaders.indexOf(names[n].toLowerCase().replace(/[\s_]+/g, ''));
      if (idx !== -1) return idx;
    }
    return -1;
  }

  var attEventIdx = colIdx(['event_id', 'eventid']);
  var attMemberIdx = colIdx(['user_id', 'userid', 'member_id', 'memberid']);
  var attTimeIdx = colIdx(['check_in_time', 'checkintime']);
  var attSourceIdx = colIdx(['check_in_method', 'checkinmethod', 'source']);
  var attByIdx = colIdx(['check_in_by', 'checkinby']);
  var attIdIdx = colIdx(['attendance_id', 'attendanceid']);

  var usersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  var nameLookup = {};
  if (usersSheet) {
    var uData = usersSheet.getDataRange().getValues();
    if (uData && uData.length > 1) {
      var uHeaders = uData[0].map(function(h) { return String(h).trim().toLowerCase(); });
      var uIdIdx = uHeaders.indexOf('user_id'); if (uIdIdx === -1) uIdIdx = uHeaders.indexOf('user id');
      var uNameIdx = uHeaders.indexOf('name'); if (uNameIdx === -1) uNameIdx = uHeaders.indexOf('full name');
      if (uIdIdx > -1 && uNameIdx > -1) {
        for (var u = 1; u < uData.length; u++) {
          var uid = normalizeId_(uData[u][uIdIdx]);
          if (!uid) continue;
          nameLookup[uid] = String(uData[u][uNameIdx] || '').trim();
        }
      }
    }
  }

  var result = [];
  var targetEventId = normalizeId_(eventId);
  for (var i = 1; i < attData.length; i++) {
    var eId = normalizeId_(attData[i][attEventIdx]);
    if (eId !== targetEventId) continue;
    var memberUid = attMemberIdx > -1 ? normalizeId_(attData[i][attMemberIdx]) : '';
    result.push({
      attendanceId: attIdIdx > -1 ? String(attData[i][attIdIdx] == null ? '' : attData[i][attIdIdx]).trim() : '',
      eventId: eId,
      userId: memberUid,
      userName: nameLookup[memberUid] || '',
      checkInTime: attTimeIdx > -1 ? String(attData[i][attTimeIdx] == null ? '' : attData[i][attTimeIdx]).trim() : '',
      checkInMethod: attSourceIdx > -1 ? String(attData[i][attSourceIdx] == null ? '' : attData[i][attSourceIdx]).trim() : '',
      checkInBy: attByIdx > -1 ? String(attData[i][attByIdx] == null ? '' : attData[i][attByIdx]).trim() : ''
    });
  }

  return { success: true, data: result };
}

// =============================================================================
// Task 6 — Inactive Member Pastoral Care Dashboard
// Role-gated endpoints for STAFF/ADMIN to view member activity and dashboard.
// =============================================================================

/**
 * Resolve sessionToken to userId by scanning Users sheet.
 * Returns userId string or null if not found.
 */
function resolveSessionUser_(sessionToken) {
  if (!sessionToken) return null;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return null;
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var idIdx = headers.indexOf('user_id');
  if (idIdx === -1) idIdx = headers.indexOf('user id');
  var pinIdx = headers.indexOf('pin_code');
  if (pinIdx === -1) pinIdx = headers.indexOf('pin');
  var statusIdx = headers.indexOf('status');
  if (idIdx === -1 || pinIdx === -1) return null;
  var salt = getSessionSalt_();
  for (var i = 1; i < data.length; i++) {
    var uid = normalizeId_(data[i][idIdx]);
    if (!uid) continue;
    var pinHash = String(data[i][pinIdx] == null ? '' : data[i][pinIdx]).trim();
    var expected = sha256Hmac_(uid + '|' + pinHash + '|' + salt);
    if (expected !== String(sessionToken)) continue;
    var statusRaw = statusIdx !== -1 ? String(data[i][statusIdx] == null ? '' : data[i][statusIdx]).trim().toLowerCase() : 'active';
    if (statusRaw && statusRaw !== 'active') return null;
    if (!isSessionActiveForUser_(uid)) return null;
    return uid;
  }
  return null;
}

/**
 * Return full ActivityProfile for a given member.
 * Role gate: caller must be STAFF or ADMIN.
 */
function api_getUserActivityProfile(userId, sessionToken) {
  var callerId = resolveSessionUser_(sessionToken);
  if (!callerId) return null;
  var role = checkRoleAtLeast_(callerId, 'STAFF');
  if (role !== 'STAFF' && role !== 'ADMIN') return null;

  var targetUid = normalizeId_(userId);
  if (!targetUid) return null;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var usersSheet = ss.getSheetByName('Users');
  if (!usersSheet) return null;
  var usersData = usersSheet.getDataRange().getValues();
  if (!usersData || usersData.length < 2) return null;
  var uHeaders = usersData[0].map(function(h) { return String(h).trim().toLowerCase(); });
  function uCol(name) { return uHeaders.indexOf(name); }
  var uidIdx = uCol('user_id'); if (uidIdx === -1) uidIdx = uCol('user id');
  var uNameIdx = uCol('name'); if (uNameIdx === -1) uNameIdx = uCol('full name');
  var uPhoneIdx = uCol('phone');
  if (uidIdx === -1 || uNameIdx === -1) return null;

  var targetName = '';
  var targetPhone = '';
  for (var i = 1; i < usersData.length; i++) {
    if (normalizeId_(usersData[i][uidIdx]) !== targetUid) continue;
    targetName = String(usersData[i][uNameIdx] || '').trim();
    targetPhone = uPhoneIdx > -1 ? String(usersData[i][uPhoneIdx] || '').trim() : '';
    break;
  }
  if (!targetName) return null;

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
  var attSheet = ss.getSheetByName('Attendance');
  var attendance = [];
  var lastCheckInAt = null;

  if (attSheet) {
    var attData = attSheet.getDataRange().getValues();
    if (attData && attData.length > 1) {
      var aHeaders = attData[0];
      var aNorm = aHeaders.map(function(h) { return String(h).trim().toLowerCase().replace(/[\s_]+/g, ''); });
      function aCol(names) {
        for (var n = 0; n < names.length; n++) {
          var idx = aNorm.indexOf(names[n].toLowerCase().replace(/[\s_]+/g, ''));
          if (idx !== -1) return idx;
        }
        return -1;
      }
      var aIdIdx = aCol(['attendance_id', 'attendanceid']);
      var aEventIdx = aCol(['event_id', 'eventid']);
      var aMemberIdx = aCol(['user_id', 'userid', 'member_id', 'memberid']);
      var aTimeIdx = aCol(['check_in_time', 'checkintime']);
      var aMethodIdx = aCol(['check_in_method', 'checkinmethod', 'source']);
      var aByIdx = aCol(['check_in_by', 'checkinby']);
      var aStatusIdx = aCol(['status']);

      for (var r = 1; r < attData.length; r++) {
        if (normalizeId_(attData[r][aMemberIdx]) !== targetUid) continue;
        var ckTime = aTimeIdx > -1 ? String(attData[r][aTimeIdx] || '').trim() : '';
        attendance.push({
          attendanceId: aIdIdx > -1 ? String(attData[r][aIdIdx] || '').trim() : '',
          eventId: aEventIdx > -1 ? normalizeId_(attData[r][aEventIdx]) : '',
          userId: targetUid,
          checkInTime: ckTime,
          checkInMethod: aMethodIdx > -1 ? String(attData[r][aMethodIdx] || '').trim() : '',
          checkInBy: aByIdx > -1 ? String(attData[r][aByIdx] || '').trim() : '',
          status: aStatusIdx > -1 ? String(attData[r][aStatusIdx] || '').trim().toUpperCase() : 'PRESENT'
        });
        if (ckTime && (!lastCheckInAt || ckTime > lastCheckInAt)) {
          lastCheckInAt = ckTime;
        }
      }
    }
  }

  return {
    userId: targetUid,
    name: targetName,
    phone: targetPhone || undefined,
    lastCheckInAt: lastCheckInAt || undefined,
    totalCheckIns: attendance.length,
    enrolledPrograms: enrolledPrograms,
    attendance: attendance
  };
}

/**
 * Return CareDashboardData with inactive members list.
 * Role gate: caller must be STAFF or ADMIN.
 */
function api_getCareDashboard(thresholdDays, sessionToken) {
  var callerId = resolveSessionUser_(sessionToken);
  if (!callerId) return null;
  var role = checkRoleAtLeast_(callerId, 'STAFF');
  if (role !== 'STAFF' && role !== 'ADMIN') return null;

  if (!thresholdDays || thresholdDays < 1) thresholdDays = 30;
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Read Users sheet
  var usersSheet = ss.getSheetByName('Users');
  if (!usersSheet) return null;
  var usersData = usersSheet.getDataRange().getValues();
  if (!usersData || usersData.length < 2) return null;
  var uHeaders = usersData[0].map(function(h) { return String(h).trim().toLowerCase(); });
  function uCol(name) { return uHeaders.indexOf(name); }
  var uidIdx = uCol('user_id'); if (uidIdx === -1) uidIdx = uCol('user id');
  var uNameIdx = uCol('name'); if (uNameIdx === -1) uNameIdx = uCol('full name');
  var uPhoneIdx = uCol('phone');
  var uRoleIdx = uCol('role');
  var uStatusIdx = uCol('status');
  if (uidIdx === -1 || uNameIdx === -1) return null;

  // Read Attendance — build latest check-in per member
  var attMap = {}; // userId -> latest checkInTime (ISO string)
  var attCount = {}; // userId -> total check-in count
  var attSheet = ss.getSheetByName('Attendance');
  if (attSheet) {
    var attData = attSheet.getDataRange().getValues();
    if (attData && attData.length > 1) {
      var aHeaders = attData[0];
      var aNorm = aHeaders.map(function(h) { return String(h).trim().toLowerCase().replace(/[\s_]+/g, ''); });
      function aCol(names) {
        for (var n = 0; n < names.length; n++) {
          var idx = aNorm.indexOf(names[n].toLowerCase().replace(/[\s_]+/g, ''));
          if (idx !== -1) return idx;
        }
        return -1;
      }
      var aMemberIdx = aCol(['user_id', 'userid', 'member_id', 'memberid']);
      var aTimeIdx = aCol(['check_in_time', 'checkintime']);

      for (var r = 1; r < attData.length; r++) {
        var memberId = normalizeId_(attData[r][aMemberIdx]);
        if (!memberId) continue;
        var ckTime = aTimeIdx > -1 ? String(attData[r][aTimeIdx] || '').trim() : '';
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
  var enrSheet = ss.getSheetByName('Enrollments');
  if (enrSheet) {
    var enrData = enrSheet.getDataRange().getValues();
    if (enrData && enrData.length > 1) {
      var eHeaders = enrData[0].map(function(h) { return String(h).trim().toLowerCase(); });
      function eCol(name) { return eHeaders.indexOf(name); }
      var eUserIdx = eCol('user_id'); if (eUserIdx === -1) eUserIdx = eCol('user id');
      var eProgIdx = eCol('program_id'); if (eProgIdx === -1) eProgIdx = eCol('program id');
      var eStatusIdx = eCol('status');

      for (var r = 1; r < enrData.length; r++) {
        var eUid = normalizeId_(enrData[r][eUserIdx]);
        if (!eUid) continue;
        if (eStatusIdx > -1 && !isActiveStatus_(enrData[r][eStatusIdx])) continue;
        var ePid = (eProgIdx > -1) ? normalizeId_(enrData[r][eProgIdx]) : '';
        if (!ePid) continue;
        if (!enrCount[eUid]) { enrCount[eUid] = 0; enrProgramIds[eUid] = []; }
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
  var inactiveMembers = [];

  for (var i = 1; i < usersData.length; i++) {
    var roleVal = uRoleIdx > -1 ? String(usersData[i][uRoleIdx] || '').trim().toUpperCase() : 'MEMBER';
    if (roleVal !== 'MEMBER') continue;

    var statusVal = uStatusIdx > -1 ? String(usersData[i][uStatusIdx] || '').trim().toLowerCase() : 'active';
    if (statusVal !== 'active') continue;

    var memberId = normalizeId_(usersData[i][uidIdx]);
    if (!memberId) continue;

    // Only include members enrolled in at least 1 program
    if (!enrCount[memberId] || enrCount[memberId] === 0) continue;

    var lastCheckIn = attMap[memberId] || null;
    var daysInactive = lastCheckIn
      ? Math.floor((nowMs - new Date(lastCheckIn).getTime()) / (24 * 60 * 60 * 1000))
      : thresholdDays + 1;

    if (lastCheckIn && daysInactive <= thresholdDays) continue;

    inactiveMembers.push({
      userId: memberId,
      name: String(usersData[i][uNameIdx] || '').trim(),
      phone: (uPhoneIdx > -1 && usersData[i][uPhoneIdx]) ? String(usersData[i][uPhoneIdx]).trim() : undefined,
      lastCheckInAt: lastCheckIn || undefined,
      totalCheckIns: attCount[memberId] || 0,
      enrolledPrograms: (enrProgramIds[memberId] || []).map(function(pid) { return progLookup[pid]; }).filter(function(p) { return !!p; }),
      attendance: []
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    thresholdDays: thresholdDays,
    inactiveMembers: inactiveMembers
  };
}