// =========== members.gs — Member Registration & Search ===========

function generateNewUserId_() {
  var hex1 = Math.floor(Math.random() * (65535 - 4096 + 1) + 4096).toString(16).toUpperCase();
  var hex2 = Math.floor(Math.random() * (65535 - 4096 + 1) + 4096).toString(16).toUpperCase();
  return "GC-" + hex1 + "-" + hex2;
}

function registerNewMember(name, phone) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  if (!sheet) {throw new Error("Users sheet missing.");}
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 1) {throw new Error("Users sheet empty.");}
  var headers = data[0];

  var newHexId = generateNewUserId_();
  var newPin = Math.floor(Math.random() * 9000) + 1000;

  var baseUser = String(name == null ? "" : name).replace(/\s+/g, "").toLowerCase();
  var simpleUsername = baseUser;
  var counter = 1;

  var usernameIdx = findHeaderIndex_(headers, ["username"]);
  var existingUsers = [];
  for (var i = 1; i < data.length; i++) {
    if (usernameIdx > -1 && data[i][usernameIdx])
      {existingUsers.push(String(data[i][usernameIdx]).trim().toLowerCase());}
  }
  while (existingUsers.indexOf(simpleUsername) !== -1) {
    simpleUsername = baseUser + counter;
    counter++;
  }

  var newRow = new Array(headers.length).fill("");
  var idIndex = findHeaderIndex_(headers, ["user_id"]);
  var nameIndex = findHeaderIndex_(headers, ["name"]);
  var pinIndex = findHeaderIndex_(headers, ["pin_code", "pin"]);
  var phoneIndex = findHeaderIndex_(headers, ["phone"]);
  var qrIndex = findHeaderIndex_(headers, ["qr_code_string"]);
  var roleIndex = findHeaderIndex_(headers, ["role"]);
  var statusIndex = findHeaderIndex_(headers, ["status"]);

  if (idIndex > -1) {newRow[idIndex] = newHexId;}
  if (nameIndex > -1) {newRow[nameIndex] = String(name == null ? "" : name).trim();}
  if (usernameIdx > -1) {newRow[usernameIdx] = simpleUsername;}
  if (pinIndex > -1) {newRow[pinIndex] = newPin;}
  if (phoneIndex > -1) {newRow[phoneIndex] = String(phone == null ? "" : phone).trim();}
  if (qrIndex > -1) {newRow[qrIndex] = newHexId;}
  if (roleIndex > -1) {newRow[roleIndex] = "MEMBER";}
  if (statusIndex > -1) {newRow[statusIndex] = "Pending";}

  sheet.appendRow(newRow);

  return { Name: name, PIN: newPin, Username: simpleUsername };
}

function api_registerUser(payload) {
  payload = payload || {};
  var name = String(payload.name == null ? "" : payload.name).trim();
  var username = String(payload.username == null ? "" : payload.username).trim().toLowerCase();
  var phone = String(payload.phone == null ? "" : payload.phone).trim();
  var pin = normalizePin_(payload.pin);

  if (!name) {return { success: false, message: "Name is required." };}
  if (!username) {return { success: false, message: "Username is required." };}
  if (!phone) {return { success: false, message: "Phone is required." };}
  if (pin.length !== 4) {return { success: false, message: "PIN must be exactly 4 digits." };}

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  if (!sheet) {return { success: false, message: "Users sheet missing." };}
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 1) {return { success: false, message: "Users sheet empty." };}
  var headers = data[0];

  var usernameIdx = findHeaderIndex_(headers, ["username"]);
  if (usernameIdx < 0) {return { success: false, message: "Username column missing." };}

  for (var i = 1; i < data.length; i++) {
    var rowUser = String(data[i][usernameIdx] == null ? "" : data[i][usernameIdx]).trim().toLowerCase();
    if (rowUser && rowUser === username)
      {return { success: false, message: "Username already exists." };}
  }

  var newHexId = generateNewUserId_();

  var newRow = new Array(headers.length).fill("");
  var idIndex = findHeaderIndex_(headers, ["user_id"]);
  var nameIndex = findHeaderIndex_(headers, ["name"]);
  var pinIndex = findHeaderIndex_(headers, ["pin_code", "pin"]);
  var phoneIndex = findHeaderIndex_(headers, ["phone"]);
  var qrIndex = findHeaderIndex_(headers, ["qr_code_string"]);
  var roleIndex = findHeaderIndex_(headers, ["role"]);
  var statusIndex = findHeaderIndex_(headers, ["status"]);

  if (idIndex > -1) {newRow[idIndex] = newHexId;}
  if (nameIndex > -1) {newRow[nameIndex] = name;}
  if (usernameIdx > -1) {newRow[usernameIdx] = username;}
  if (pinIndex > -1) {newRow[pinIndex] = pin;}
  if (phoneIndex > -1) {newRow[phoneIndex] = phone;}
  if (qrIndex > -1) {newRow[qrIndex] = newHexId;}
  if (roleIndex > -1) {newRow[roleIndex] = "MEMBER";}
  if (statusIndex > -1) {newRow[statusIndex] = "Pending";}

  sheet.appendRow(newRow);

  return {
    success: true,
    data: {
      name: name,
      role: "MEMBER",
      userId: newHexId,
      status: "Pending"
    }
  };
}

function api_listPendingRegistrations(actorId, sessionToken) {
  if (!verifySessionToken_(actorId, sessionToken))
    {return { success: false, message: "Session invalid or expired." };}
  var actorRole = getUserRole_(actorId);
  if (!hasRoleAtLeast_(actorRole, "STAFF"))
    {return { success: false, message: "Forbidden: STAFF or ADMIN required." };}

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  if (!sheet) {return { success: false, message: "Users sheet missing." };}
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) {return { success: true, data: [] };}
  var headers = data[0];

  var idIdx = findHeaderIndex_(headers, ["user_id", "user id"]);
  var nameIdx = findHeaderIndex_(headers, ["name", "full name"]);
  var phoneIdx = findHeaderIndex_(headers, ["phone"]);
  var usernameIdx = findHeaderIndex_(headers, ["username"]);
  var statusIdx = findHeaderIndex_(headers, ["status"]);

  if (idIdx < 0 || statusIdx < 0)
    {return { success: false, message: "Required columns missing." };}

  var results = [];
  for (var r = 1; r < data.length && results.length < 50; r++) {
    var status = String(data[r][statusIdx] == null ? "" : data[r][statusIdx]).trim().toLowerCase();
    if (status !== "pending") {continue;}
    results.push({
      userId: normalizeId_(data[r][idIdx]),
      name: nameIdx >= 0 ? String(data[r][nameIdx] == null ? "" : data[r][nameIdx]).trim() : "",
      phone: phoneIdx >= 0 ? String(data[r][phoneIdx] == null ? "" : data[r][phoneIdx]).trim() : "",
      username: usernameIdx >= 0 ? String(data[r][usernameIdx] == null ? "" : data[r][usernameIdx]).trim() : "",
      status: "Pending"
    });
  }
  return { success: true, data: results };
}

function api_approveRegistration(actorId, sessionToken, targetUserId, reason) {
  if (!verifySessionToken_(actorId, sessionToken))
    {return { success: false, message: "Session invalid or expired." };}
  var actorRole = getUserRole_(actorId);
  if (!hasRoleAtLeast_(actorRole, "STAFF"))
    {return { success: false, message: "Forbidden: STAFF or ADMIN required." };}

  var target = normalizeId_(targetUserId);
  if (!target) {return { success: false, message: "Target user id is required." };}

  var correlationId = writeAuditLog(
    actorId,
    "REGISTRATION_APPROVED",
    target,
    "Pending",
    "Active",
    reason,
    "ATTEMPT"
  );

  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
    if (!sheet) {throw new Error("Users sheet missing.");}
    var data = sheet.getDataRange().getValues();
    if (!data || data.length < 2) {throw new Error("Users sheet empty.");}
    var headers = data[0];
    var idIdx = findHeaderIndex_(headers, ["user_id", "user id"]);
    var statusIdx = findHeaderIndex_(headers, ["status"]);
    if (idIdx < 0 || statusIdx < 0) {throw new Error("Required columns missing.");}

    var targetRow = -1;
    for (var r = 1; r < data.length; r++) {
      if (normalizeId_(data[r][idIdx]) === target) {targetRow = r; break;}
    }
    if (targetRow < 0) {throw new Error("Target user not found.");}

    var currentStatus = String(data[targetRow][statusIdx] == null ? "" : data[targetRow][statusIdx]).trim().toLowerCase();
    if (currentStatus !== "pending")
      {throw new Error("Target user is not pending approval.");}

    sheet.getRange(targetRow + 1, statusIdx + 1).setValue("Active");

    writeAuditLog(actorId, "REGISTRATION_APPROVED", target, "Pending", "Active", reason, "SUCCESS", correlationId);

    return { success: true, data: { userId: target, status: "Active" } };
  } catch (err) {
    writeAuditLog(actorId, "REGISTRATION_APPROVED", target, "Pending", "Active", reason, "ERROR", correlationId);
    throw err;
  }
}

// "Rejected" is used as the terminal state for rejected registrations rather than
// "Inactive". Rationale: "Inactive" is also used for accounts that are temporarily
// disabled by staff (e.g., manual deactivation), and conflating it with a rejected
// application would muddy the audit history. "Rejected" is a one-way terminal
// state, distinct from both "Pending" (awaiting review) and "Inactive" (soft-disabled).
function api_rejectRegistration(actorId, sessionToken, targetUserId, reason) {
  if (!verifySessionToken_(actorId, sessionToken))
    {return { success: false, message: "Session invalid or expired." };}
  var actorRole = getUserRole_(actorId);
  if (!hasRoleAtLeast_(actorRole, "STAFF"))
    {return { success: false, message: "Forbidden: STAFF or ADMIN required." };}

  var reasonText = String(reason == null ? "" : reason).trim();
  if (reasonText.length < 3)
    {return { success: false, message: "A reason is required when rejecting a registration." };}

  var target = normalizeId_(targetUserId);
  if (!target) {return { success: false, message: "Target user id is required." };}

  var correlationId = writeAuditLog(
    actorId,
    "REGISTRATION_REJECTED",
    target,
    "Pending",
    "Rejected",
    reasonText,
    "ATTEMPT"
  );

  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
    if (!sheet) {throw new Error("Users sheet missing.");}
    var data = sheet.getDataRange().getValues();
    if (!data || data.length < 2) {throw new Error("Users sheet empty.");}
    var headers = data[0];
    var idIdx = findHeaderIndex_(headers, ["user_id", "user id"]);
    var statusIdx = findHeaderIndex_(headers, ["status"]);
    if (idIdx < 0 || statusIdx < 0) {throw new Error("Required columns missing.");}

    var targetRow = -1;
    for (var r = 1; r < data.length; r++) {
      if (normalizeId_(data[r][idIdx]) === target) {targetRow = r; break;}
    }
    if (targetRow < 0) {throw new Error("Target user not found.");}

    var currentStatus = String(data[targetRow][statusIdx] == null ? "" : data[targetRow][statusIdx]).trim().toLowerCase();
    if (currentStatus !== "pending")
      {throw new Error("Target user is not pending approval.");}

    sheet.getRange(targetRow + 1, statusIdx + 1).setValue("Rejected");

    writeAuditLog(actorId, "REGISTRATION_REJECTED", target, "Pending", "Rejected", reasonText, "SUCCESS", correlationId);

    return { success: true, data: { userId: target, status: "Rejected" } };
  } catch (err) {
    writeAuditLog(actorId, "REGISTRATION_REJECTED", target, "Pending", "Rejected", reasonText, "ERROR", correlationId);
    throw err;
  }
}

// Real member search for manual attendance check-in (Task 5).
// Role-gated: only granted users may search the member roster.
function api_searchMembers(query, grantedUserId, sessionToken) {
  if (!grantedUserId || !sessionToken)
    {return { success: false, message: "Missing user session.", data: [] };}
  const check = checkIsGrantedUser_(grantedUserId, sessionToken);
  if (!check.granted)
    {return { success: false, message: check.message, data: [] };}

  const q = String(query == null ? "" : query)
    .trim()
    .toLowerCase();
  if (!q) {return { success: true, data: [] };}

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  if (!sheet)
    {return { success: false, message: "Users sheet missing.", data: [] };}
  const data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) {return { success: true, data: [] };}
  const headers = data[0].map(function (h) {
    return String(h).trim().toLowerCase();
  });
  let idIdx = headers.indexOf("user_id");
  if (idIdx === -1) {idIdx = headers.indexOf("user id");}
  let nameIdx = headers.indexOf("name");
  if (nameIdx === -1) {nameIdx = headers.indexOf("full name");}
  const phoneIdx = headers.indexOf("phone");
  const statusIdx = headers.indexOf("status");
  const roleIdx = headers.indexOf("role");
  if (idIdx === -1) {return { success: true, data: [] };}

  const results = [];
  for (let i = 1; i < data.length && results.length < 10; i++) {
    const statusRaw =
      statusIdx > -1
        ? String(data[i][statusIdx] == null ? "" : data[i][statusIdx])
            .trim()
            .toLowerCase()
        : "active";
    if (statusRaw && statusRaw !== "active") {continue;}
    const roleRaw =
      roleIdx > -1 && data[i][roleIdx]
        ? String(data[i][roleIdx]).trim().toUpperCase()
        : "MEMBER";
    if (roleRaw !== "MEMBER") {continue;}
    const uid = normalizeId_(data[i][idIdx]);
    if (!uid) {continue;}
    const name =
      nameIdx > -1
        ? String(data[i][nameIdx] == null ? "" : data[i][nameIdx]).trim()
        : "";
    const phone =
      phoneIdx > -1
        ? String(data[i][phoneIdx] == null ? "" : data[i][phoneIdx]).trim()
        : "";
    const haystack = (name + " " + uid + " " + phone).toLowerCase();
    if (haystack.indexOf(q) === -1) {continue;}
    results.push({ name: name || uid, phone: phone || undefined, userId: uid });
  }
  return { data: results, success: true };
}
