// =============================================================================
// auth.gs — Authentication, sessions, and RBAC for the SPA vertical slice.
// User credentials and session semantics are reimplemented from the archived
// 程式碼.js reference; registration is intentionally owned by T07 elsewhere.
// Depends on shared helpers in Code.gs (normalization + HMAC session storage).
// =============================================================================

var EFCC_ROLE_RANKS_ = Object.freeze({ MEMBER: 1, STAFF: 2, ADMIN: 3 });
var EFCC_MENU_PAGES_ = Object.freeze([
  "profile",
  "programs",
  "events",
  "scanner",
  "dashboard",
  "care",
]);

function normalizePin_(value) {
  var pin = String(value == null ? "" : value).trim().replace(/\D/g, "");
  if (!pin) return "";
  if (pin.length > 4) pin = pin.substring(pin.length - 4);
  while (pin.length < 4) pin = "0" + pin;
  return pin;
}

function userSheetRecord_(userId) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  if (!sheet) return null;
  var rows = sheet.getDataRange().getValues();
  if (!rows || rows.length < 2) return null;
  var headers = rows[0].map(normalizeHeader_);
  var idIdx = findHeaderIndex_(headers, ["user_id", "user id"]);
  if (idIdx < 0) return null;
  var target = normalizeId_(userId);
  for (var r = 1; r < rows.length; r++) {
    if (normalizeId_(rows[r][idIdx]) !== target) continue;
    return { headers: headers, row: rows[r] };
  }
  return null;
}

function getUserRole_(userId) {
  var record = userSheetRecord_(userId);
  if (!record) return "MEMBER";
  var idx = findHeaderIndex_(record.headers, ["role"]);
  var role = idx >= 0 ? String(record.row[idx] || "").trim().toUpperCase() : "MEMBER";
  return Object.prototype.hasOwnProperty.call(EFCC_ROLE_RANKS_, role) ? role : "MEMBER";
}

/** Correct three-tier hierarchy: ADMIN > STAFF > MEMBER. */
function hasRoleAtLeast_(userRole, requiredRole) {
  var actual = String(userRole == null ? "" : userRole).trim().toUpperCase();
  var required = String(requiredRole == null ? "" : requiredRole).trim().toUpperCase();
  return !!EFCC_ROLE_RANKS_[actual] && !!EFCC_ROLE_RANKS_[required] &&
    EFCC_ROLE_RANKS_[actual] >= EFCC_ROLE_RANKS_[required];
}

/** Server-authoritative user-id form retained for callers of the old guard name. */
function checkRoleAtLeast_(userId, requiredRole) {
  return hasRoleAtLeast_(getUserRole_(userId), requiredRole);
}

function lookupUserByCredentials_(username, pin) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  if (!sheet) return { ok: false, message: "System error: Users sheet missing." };
  var rows = sheet.getDataRange().getValues();
  if (!rows || rows.length < 2) return { ok: false, message: "System error: Users sheet empty." };
  var headers = rows[0].map(normalizeHeader_);
  var userIdx = findHeaderIndex_(headers, ["username", "user name"]);
  var pinIdx = findHeaderIndex_(headers, ["pin_code", "pin"]);
  var idIdx = findHeaderIndex_(headers, ["user_id", "user id"]);
  var nameIdx = findHeaderIndex_(headers, ["name", "full name"]);
  var qrIdx = findHeaderIndex_(headers, ["qr_code_string", "qr code string"]);
  var roleIdx = findHeaderIndex_(headers, ["role"]);
  var statusIdx = findHeaderIndex_(headers, ["status"]);
  if (userIdx < 0 || pinIdx < 0 || idIdx < 0) {
    return { ok: false, message: "System error: Required columns missing." };
  }
  var wantedUser = String(username == null ? "" : username).trim().toLowerCase();
  var wantedPin = normalizePin_(pin);
  var sawUsername = false;
  for (var r = 1; r < rows.length; r++) {
    var rowUser = String(rows[r][userIdx] == null ? "" : rows[r][userIdx]).trim().toLowerCase();
    if (!rowUser) continue;
    if (rowUser === wantedUser) sawUsername = true;
    if (rowUser !== wantedUser || normalizePin_(rows[r][pinIdx]) !== wantedPin) continue;
    var status = statusIdx >= 0 ? String(rows[r][statusIdx] || "").trim().toLowerCase() : "active";
    if (status === "pending") return { ok: false, message: "Account pending approval." };
    if (status && status !== "active") return { ok: false, message: "Account not active." };
    var role = roleIdx >= 0 ? String(rows[r][roleIdx] || "").trim().toUpperCase() : "MEMBER";
    if (!EFCC_ROLE_RANKS_[role]) role = "MEMBER";
    return {
      ok: true,
      userId: normalizeId_(rows[r][idIdx]),
      name: nameIdx >= 0 ? String(rows[r][nameIdx] || "").trim() || "Member" : "Member",
      qrCodeString: qrIdx >= 0 ? String(rows[r][qrIdx] || "").trim() || normalizeId_(rows[r][idIdx]) : normalizeId_(rows[r][idIdx]),
      role: role,
      pinHash: normalizePin_(rows[r][pinIdx]),
    };
  }
  return { ok: false, message: sawUsername ? "PIN incorrect." : "Invalid Username or PIN." };
}

function verifyLogin(username, pin) {
  var matched = lookupUserByCredentials_(username, pin);
  if (!matched.ok) return { success: false, message: matched.message };
  return {
    success: true,
    userId: matched.userId,
    username: String(username || "").trim().toLowerCase(),
    name: matched.name,
    role: matched.role,
    qrString: matched.qrCodeString,
  };
}

function verifySessionToken_(userId, sessionToken) {
  if (!userId || !sessionToken) return false;
  var record = userSheetRecord_(userId);
  if (!record) return false;
  var idIdx = findHeaderIndex_(record.headers, ["user_id", "user id"]);
  var pinIdx = findHeaderIndex_(record.headers, ["pin_code", "pin"]);
  var statusIdx = findHeaderIndex_(record.headers, ["status"]);
  if (idIdx < 0 || pinIdx < 0) return false;
  var status = statusIdx >= 0 ? String(record.row[statusIdx] || "").trim().toLowerCase() : "active";
  if (status && status !== "active") return false;
  var target = normalizeId_(record.row[idIdx]);
  var expected = sha256Hmac_(target + "|" + normalizePin_(record.row[pinIdx]) + "|" + getSessionSalt_());
  return expected === String(sessionToken) && isSessionActiveForUser_(target);
}

function api_loginUser(username, pin) {
  var matched = lookupUserByCredentials_(username, pin);
  if (!matched.ok) return { success: false, message: matched.message };
  setSessionIssuedNow_(matched.userId);
  return {
    success: true,
    data: {
      expiryTimestamp: Date.now() + SESSION_TTL_MS_,
      name: matched.name,
      qrCodeString: matched.qrCodeString,
      role: matched.role,
      sessionToken: sha256Hmac_(matched.userId + "|" + matched.pinHash + "|" + getSessionSalt_()),
      userId: matched.userId,
    },
  };
}

function api_getCurrentSession(userId, sessionToken) {
  if (!verifySessionToken_(userId, sessionToken)) return { success: false, message: "Session invalid or expired." };
  var record = userSheetRecord_(userId);
  if (!record) return { success: false, message: "User not found." };
  var idIdx = findHeaderIndex_(record.headers, ["user_id", "user id"]);
  var nameIdx = findHeaderIndex_(record.headers, ["name", "full name"]);
  var qrIdx = findHeaderIndex_(record.headers, ["qr_code_string", "qr code string"]);
  return {
    success: true,
    data: {
      expiryTimestamp: getSessionIssuedAt_(normalizeId_(record.row[idIdx])) + SESSION_TTL_MS_,
      name: nameIdx >= 0 ? String(record.row[nameIdx] || "").trim() || "Member" : "Member",
      qrCodeString: qrIdx >= 0 ? String(record.row[qrIdx] || "").trim() || normalizeId_(userId) : normalizeId_(userId),
      role: getUserRole_(userId),
      sessionToken: String(sessionToken),
      userId: normalizeId_(userId),
    },
  };
}

function api_logoutUser(userId, sessionToken) {
  if (userId && sessionToken && verifySessionToken_(userId, sessionToken)) clearSessionIssued_(userId);
  return { success: true };
}

function resolveSessionUser_(sessionToken) {
  if (!sessionToken) return null;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  if (!sheet) return null;
  var rows = sheet.getDataRange().getValues();
  if (!rows || rows.length < 2) return null;
  var headers = rows[0].map(normalizeHeader_);
  var idIdx = findHeaderIndex_(headers, ["user_id", "user id"]);
  var pinIdx = findHeaderIndex_(headers, ["pin_code", "pin"]);
  if (idIdx < 0 || pinIdx < 0) return null;
  for (var r = 1; r < rows.length; r++) {
    var uid = normalizeId_(rows[r][idIdx]);
    if (uid && verifySessionToken_(uid, sessionToken)) return uid;
  }
  return null;
}

function hasActiveProgramLeaderGrant_(userId) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Program_Leaders");
  if (!sheet) return false;
  var rows = sheet.getDataRange().getValues();
  if (!rows || rows.length < 2) return false;
  var headers = rows[0].map(normalizeHeader_);
  var userIdx = findHeaderIndex_(headers, ["user_id", "user id"]);
  var statusIdx = findHeaderIndex_(headers, ["status"]);
  if (userIdx < 0) return false;
  var target = normalizeId_(userId);
  for (var r = 1; r < rows.length; r++) {
    if (normalizeId_(rows[r][userIdx]) !== target) continue;
    var status = statusIdx >= 0 ? String(rows[r][statusIdx] || "").trim().toLowerCase() : "active";
    if (!status || status === "active") return true;
  }
  return false;
}

function getAccessiblePages_(userId) {
  var role = getUserRole_(userId);
  if (hasRoleAtLeast_(role, "STAFF")) return EFCC_MENU_PAGES_.slice();
  var pages = ["profile", "programs", "events"];
  if (hasActiveProgramLeaderGrant_(userId)) pages.push("scanner");
  return pages;
}

function api_getAccessiblePages(userId, sessionToken) {
  if (!verifySessionToken_(userId, sessionToken)) return { success: false, message: "Session invalid or expired.", data: [] };
  return { success: true, data: getAccessiblePages_(userId) };
}

function checkIsGrantedUser_(userId, sessionToken) {
  if (!verifySessionToken_(userId, sessionToken)) return { granted: false, message: "Session invalid or expired." };
  var role = getUserRole_(userId);
  if (hasRoleAtLeast_(role, "STAFF")) return { granted: true, role: role };
  if (hasActiveProgramLeaderGrant_(userId)) return { granted: true, role: role };
  return { granted: false, role: role, message: "Permission denied. Only granted users can perform this action." };
}

function loadMainShell_() {
  return HtmlService.createTemplateFromFile("main").evaluate().getContent();
}

function loadLoginShell_() {
  return HtmlService.createTemplateFromFile("login").evaluate().getContent();
}

function loadRegisterPage_() {
  return HtmlService.createTemplateFromFile("register").evaluate().getContent();
}
