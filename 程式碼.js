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
  if (idIdx === -1 || pinIdx === -1) return false;

  var targetId = normalizeId_(userId);
  for (var i = 1; i < data.length; i++) {
    if (normalizeId_(data[i][idIdx]) !== targetId) continue;
    var pinHash = String(data[i][pinIdx] == null ? '' : data[i][pinIdx]).trim();
    var expected = sha256Hmac_(targetId + '|' + pinHash + '|' + getSessionSalt_());
    return expected === String(sessionToken);
  }
  return false;
}

function api_loginUser(username, pin) {
  var matched = lookupUserByCredentials_(username, pin);
  if (!matched.ok) return { success: false, message: matched.message };
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
        expiryTimestamp: Date.now() + SESSION_TTL_MS_
      }
    };
  }
  return { success: false, message: 'User not found.' };
}

function api_logoutUser() {
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