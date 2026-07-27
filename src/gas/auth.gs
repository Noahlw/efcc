// =============================================================================
// auth.gs — Authentication, Session & Role Guards
// Ported from 程式碼.js. Depends on utilities in Code.gs (shared global scope).
// =============================================================================

// --- Legacy login (used by old HTML frontend; kept for backwards compat) -----

function verifyLogin(username, pin) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  if (!sheet)
    {return { success: false, message: "System error: Users sheet missing." };}

  const data = sheet.getDataRange().getValues();
  if (!data || data.length < 2)
    {return { success: false, message: "System error: Users sheet empty." };}

  function normalizePin(value) {
    let s = String(value).trim().replace(/\D/g, "");
    if (!s) {return "";}
    if (s.length > 4) {s = s.substring(s.length - 4);}
    while (s.length < 4) {s = "0" + s;}
    return s;
  }

  const headers = data[0].map(function (h) {
    return String(h).trim().toLowerCase();
  });

  let userIndex = headers.indexOf("username");
  if (userIndex === -1) {userIndex = headers.indexOf("user name");}
  let pinIndex = headers.indexOf("pin_code");
  if (pinIndex === -1) {pinIndex = headers.indexOf("pin");}
  let userIdIndex = headers.indexOf("user_id");
  if (userIdIndex === -1) {userIdIndex = headers.indexOf("user id");}
  let nameIndex = headers.indexOf("name");
  if (nameIndex === -1) {nameIndex = headers.indexOf("full name");}

  const statusIndex = headers.indexOf("status");
  let qrIndex = headers.indexOf("qr_code_string");
  if (qrIndex === -1) {qrIndex = headers.indexOf("qr code string");}

  if (
    userIndex === -1 ||
    pinIndex === -1 ||
    userIdIndex === -1 ||
    qrIndex === -1
  ) {
    return {
      message: "System error: Required columns missing.",
      success: false,
    };
  }

  const inputUser = String(username).trim().toLowerCase();
  const inputPin = normalizePin(pin);

  let sawUsername = false;
  for (let i = 1; i < data.length; i++) {
    if (!data[i][userIndex]) {continue;}

    const rowUser = String(data[i][userIndex]).trim().toLowerCase();
    const rowPin = normalizePin(data[i][pinIndex]);

    if (rowUser === inputUser) {sawUsername = true;}

    if (rowUser === inputUser && rowPin === inputPin) {
      const statusRaw =
        statusIndex !== -1
          ? String(data[i][statusIndex]).trim().toLowerCase()
          : "active";
      if (statusRaw === "pending")
        {return { success: false, message: "Account pending approval." };}
      if (statusRaw && statusRaw !== "active" && statusRaw !== "pending")
        {return { success: false, message: "Account not active." };}

      const loggedInUserId = normalizeId_(data[i][userIdIndex]);
      return {
        enrolledProgramIds: getUserEnrolledProgramIds_(loggedInUserId),
        name: nameIndex !== -1 ? String(data[i][nameIndex]).trim() : "Member",
        qrString: String(data[i][qrIndex]).trim(),
        success: true,
        userId: loggedInUserId,
        username: rowUser,
      };
    }
  }

  if (sawUsername) {return { success: false, message: "PIN incorrect." };}
  return { message: "Invalid Username or PIN.", success: false };
}

// --- Credential Update ------------------------------------------------------

function updateCredentials(userId, newUsername, newPin) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(function (h) {
    return String(h).trim().toLowerCase();
  });

  const userIndex = headers.indexOf("username");
  let pinIndex = headers.indexOf("pin_code");
  if (pinIndex === -1) {pinIndex = headers.indexOf("pin");}
  const idIndex = headers.indexOf("user_id");

  const cleanNewUser = String(newUsername).trim().toLowerCase();
  const cleanNewPin = String(newPin).trim().replace(/\D/g, "");
  if (cleanNewPin.length !== 4)
    {return { success: false, message: "PIN must be exactly 4 digits." };}

  // Check for duplicates
  for (let i = 1; i < data.length; i++) {
    const checkId = String(data[i][idIndex]).trim();
    const checkUser = String(data[i][userIndex]).trim().toLowerCase();
    if (checkId !== userId && checkUser === cleanNewUser) {
      return { message: "Username is already taken.", success: false };
    }
  }

  // Apply update
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][idIndex]).trim() === userId) {
      sheet.getRange(r + 1, userIndex + 1).setValue(cleanNewUser);
      sheet.getRange(r + 1, pinIndex + 1).setValue(cleanNewPin);
      return { success: true };
    }
  }
  return { message: "User not found.", success: false };
}

// --- Session Token Verification ---------------------------------------------

function lookupUserByCredentials_(username, pin) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  if (!sheet)
    {return { ok: false, message: "System error: Users sheet missing." };}

  const data = sheet.getDataRange().getValues();
  if (!data || data.length < 2)
    {return { ok: false, message: "System error: Users sheet empty." };}

  const headers = data[0].map(function (h) {
    return String(h).trim().toLowerCase();
  });
  function col(name) {
    return headers.indexOf(name);
  }
  let userIdx = col("username");
  if (userIdx === -1) {userIdx = col("user name");}
  let pinIdx = col("pin_code");
  if (pinIdx === -1) {pinIdx = col("pin");}
  let idIdx = col("user_id");
  if (idIdx === -1) {idIdx = col("user id");}
  let nameIdx = col("name");
  if (nameIdx === -1) {nameIdx = col("full name");}
  let qrIdx = col("qr_code_string");
  if (qrIdx === -1) {qrIdx = col("qr code string");}
  const roleIdx = col("role");
  const statusIdx = col("status");

  if (userIdx === -1 || pinIdx === -1 || idIdx === -1 || qrIdx === -1) {
    return { message: "System error: Required columns missing.", ok: false };
  }

  function normalizePin(value) {
    let s = String(value == null ? "" : value)
      .trim()
      .replace(/\D/g, "");
    if (!s) {return "";}
    if (s.length > 4) {s = s.substring(s.length - 4);}
    while (s.length < 4) {s = "0" + s;}
    return s;
  }

  const inputUser = String(username == null ? "" : username)
    .trim()
    .toLowerCase();
  const inputPin = normalizePin(pin);

  let sawUsername = false;
  for (let i = 1; i < data.length; i++) {
    if (!data[i][userIdx]) {continue;}
    const rowUser = String(data[i][userIdx]).trim().toLowerCase();
    const rowPin = normalizePin(data[i][pinIdx]);
    if (rowUser === inputUser) {sawUsername = true;}
    if (rowUser !== inputUser || rowPin !== inputPin) {continue;}

    const statusRaw =
      statusIdx !== -1
        ? String(data[i][statusIdx]).trim().toLowerCase()
        : "active";
    if (statusRaw === "pending")
      {return { ok: false, message: "Account pending approval." };}
    if (statusRaw && statusRaw !== "active")
      {return { ok: false, message: "Account not active." };}

    const userId = normalizeId_(data[i][idIdx]);
    let role =
      roleIdx !== -1 && data[i][roleIdx]
        ? String(data[i][roleIdx]).trim().toUpperCase()
        : "MEMBER";
    if (
      role !== "ADMIN" &&
      role !== "STAFF" &&
      role !== "EVENT_LEADER" &&
      role !== "MEMBER"
    ) {
      role = "MEMBER";
    }
    return {
      name: nameIdx !== -1 ? String(data[i][nameIdx]).trim() : "Member",
      ok: true,
      pinHash: rowPin,
      qrCodeString: String(data[i][qrIdx]).trim(),
      role: role,
      userId: userId,
    };
  }
  if (sawUsername) {return { ok: false, message: "PIN incorrect." };}
  return { message: "Invalid Username or PIN.", ok: false };
}

function verifySessionToken_(userId, sessionToken) {
  if (!userId || !sessionToken) {return false;}
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  if (!sheet) {return false;}
  const data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) {return false;}
  const headers = data[0].map(function (h) {
    return String(h).trim().toLowerCase();
  });
  let idIdx = headers.indexOf("user_id");
  if (idIdx === -1) {idIdx = headers.indexOf("user id");}
  let pinIdx = headers.indexOf("pin_code");
  if (pinIdx === -1) {pinIdx = headers.indexOf("pin");}
  const statusIdx = headers.indexOf("status");
  if (idIdx === -1 || pinIdx === -1) {return false;}

  const targetId = normalizeId_(userId);
  for (let i = 1; i < data.length; i++) {
    if (normalizeId_(data[i][idIdx]) !== targetId) {continue;}
    const statusRaw =
      statusIdx !== -1
        ? String(data[i][statusIdx] == null ? "" : data[i][statusIdx])
            .trim()
            .toLowerCase()
        : "active";
    if (statusRaw && statusRaw !== "active") {return false;}
    const pinHash = String(data[i][pinIdx] == null ? "" : data[i][pinIdx]).trim();
    const expected = sha256Hmac_(
      targetId + "|" + pinHash + "|" + getSessionSalt_()
    );
    if (expected !== String(sessionToken)) {return false;}
    return isSessionActiveForUser_(targetId);
  }
  return false;
}

// --- Public RPC Endpoints ---------------------------------------------------

function api_loginUser(username, pin) {
  const matched = lookupUserByCredentials_(username, pin);
  if (!matched.ok) {return { success: false, message: matched.message };}
  setSessionIssuedNow_(matched.userId);
  const expiry = Date.now() + SESSION_TTL_MS_;
  const token = sha256Hmac_(
    matched.userId + "|" + matched.pinHash + "|" + getSessionSalt_()
  );
  return {
    data: {
      expiryTimestamp: expiry,
      name: matched.name,
      qrCodeString: matched.qrCodeString,
      role: matched.role,
      sessionToken: token,
      userId: matched.userId,
    },
    success: true,
  };
}

function api_getCurrentSession(userId, sessionToken) {
  if (!verifySessionToken_(userId, sessionToken)) {
    return { message: "Session invalid or expired.", success: false };
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  if (!sheet) {return { success: false, message: "Users sheet missing." };}
  const data = sheet.getDataRange().getValues();
  if (!data || data.length < 2)
    {return { success: false, message: "Users sheet empty." };}
  const headers = data[0].map(function (h) {
    return String(h).trim().toLowerCase();
  });
  let idIdx = headers.indexOf("user_id");
  if (idIdx === -1) {idIdx = headers.indexOf("user id");}
  let nameIdx = headers.indexOf("name");
  if (nameIdx === -1) {nameIdx = headers.indexOf("full name");}
  let qrIdx = headers.indexOf("qr_code_string");
  if (qrIdx === -1) {qrIdx = headers.indexOf("qr code string");}
  const roleIdx = headers.indexOf("role");
  const targetId = normalizeId_(userId);
  for (let i = 1; i < data.length; i++) {
    if (normalizeId_(data[i][idIdx]) !== targetId) {continue;}
    let role =
      roleIdx !== -1 && data[i][roleIdx]
        ? String(data[i][roleIdx]).trim().toUpperCase()
        : "MEMBER";
    if (
      role !== "ADMIN" &&
      role !== "STAFF" &&
      role !== "EVENT_LEADER" &&
      role !== "MEMBER"
    ) {
      role = "MEMBER";
    }
    return {
      data: {
        expiryTimestamp: getSessionIssuedAt_(targetId) + SESSION_TTL_MS_,
        name: nameIdx !== -1 ? String(data[i][nameIdx]).trim() : "Member",
        qrCodeString: qrIdx !== -1 ? String(data[i][qrIdx]).trim() : targetId,
        role: role,
        sessionToken: String(sessionToken),
        userId: targetId,
      },
      success: true,
    };
  }
  return { message: "User not found.", success: false };
}

function api_logoutUser(userId, sessionToken) {
  if (userId && sessionToken && verifySessionToken_(userId, sessionToken)) {
    clearSessionIssued_(userId);
  }
  return { success: true };
}

function api_registerUser(payload) {
  if (!payload)
    {return { success: false, message: "Missing registration payload." };}
  const name = String(payload.name == null ? "" : payload.name).trim();
  const username = String(payload.username == null ? "" : payload.username)
    .trim()
    .toLowerCase();
  const pin = String(payload.pin == null ? "" : payload.pin)
    .trim()
    .replace(/\D/g, "");
  const phone = String(payload.phone == null ? "" : payload.phone).trim();
  const address = String(payload.address == null ? "" : payload.address).trim();

  if (!name) {return { success: false, message: "Name is required." };}
  if (!username) {return { success: false, message: "Username is required." };}
  if (!/^\d{4}$/.test(pin))
    {return { success: false, message: "PIN must be exactly 4 digits." };}

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  if (!sheet) {return { success: false, message: "Users sheet missing." };}
  const data = sheet.getDataRange().getValues();
  if (!data || data.length < 1)
    {return { success: false, message: "Users sheet empty." };}
  const headers = data[0].map(function (h) {
    return String(h).trim().toLowerCase();
  });

  function col(name) {
    return headers.indexOf(name);
  }
  let userIdx = col("username");
  if (userIdx === -1) {userIdx = col("user name");}
  if (userIdx === -1)
    {return { success: false, message: "Username column missing." };}

  // Reject duplicate usernames
  for (let r = 1; r < data.length; r++) {
    if (!data[r][userIdx]) {continue;}
    if (String(data[r][userIdx]).trim().toLowerCase() === username) {
      return { message: "Username already taken.", success: false };
    }
  }

  function pickCol(names) {
    for (let n = 0; n < names.length; n++) {
      const idx = col(names[n]);
      if (idx !== -1) {return idx;}
    }
    return -1;
  }

  const idIdx = pickCol(["user_id", "user id"]);
  const nameIdx = pickCol(["name", "full name"]);
  const pinIdx = pickCol(["pin_code", "pin"]);
  const phoneIdx = col("phone");
  const addressIdx = col("address");
  const qrIdx = pickCol(["qr_code_string", "qr code string"]);
  const roleIdx = col("role");
  const statusIdx = col("status");

  const newHex1 = Math.floor(Math.random() * (65535 - 4096 + 1) + 4096)
    .toString(16)
    .toUpperCase();
  const newHex2 = Math.floor(Math.random() * (65535 - 4096 + 1) + 4096)
    .toString(16)
    .toUpperCase();
  const newHexId = "GC-" + newHex1 + "-" + newHex2;

  const row = new Array(headers.length).fill("");
  if (idIdx > -1) {row[idIdx] = newHexId;}
  if (nameIdx > -1) {row[nameIdx] = name;}
  if (userIdx > -1) {row[userIdx] = username;}
  if (pinIdx > -1) {row[pinIdx] = pin;}
  if (phoneIdx > -1) {row[phoneIdx] = phone;}
  if (addressIdx > -1) {row[addressIdx] = address;}
  if (qrIdx > -1) {row[qrIdx] = newHexId;}
  if (roleIdx > -1) {row[roleIdx] = "MEMBER";}
  if (statusIdx > -1) {row[statusIdx] = "Active";}

  sheet.appendRow(row);
  return {
    data: { name: name, role: "MEMBER", userId: newHexId },
    success: true,
  };
}

// --- Role Guards ------------------------------------------------------------

function checkRoleAtLeast_(userId, requiredRole) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  if (!sheet) {return "MEMBER";}
  const data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) {return "MEMBER";}
  const headers = data[0].map(function (h) {
    return String(h).trim().toLowerCase();
  });
  let idIdx = headers.indexOf("user_id");
  if (idIdx === -1) {idIdx = headers.indexOf("user id");}
  const roleIdx = headers.indexOf("role");
  if (idIdx === -1) {return "MEMBER";}
  const targetId = normalizeId_(userId);
  for (let i = 1; i < data.length; i++) {
    if (normalizeId_(data[i][idIdx]) !== targetId) {continue;}
    let role =
      roleIdx !== -1 && data[i][roleIdx]
        ? String(data[i][roleIdx]).trim().toUpperCase()
        : "MEMBER";
    if (
      role !== "ADMIN" &&
      role !== "STAFF" &&
      role !== "EVENT_LEADER" &&
      role !== "MEMBER"
    ) {
      role = "MEMBER";
    }
    return role;
  }
  return "MEMBER";
}

function checkIsGrantedUser_(userId, sessionToken) {
  if (!verifySessionToken_(userId, sessionToken)) {
    return { granted: false, message: "Session invalid or expired." };
  }
  const role = checkRoleAtLeast_(userId, "EVENT_LEADER");
  if (role === "MEMBER") {
    return {
      granted: false,
      message: "Permission denied. Only granted users can create events.",
    };
  }
  return { granted: true, role };
}

function resolveSessionUser_(sessionToken) {
  if (!sessionToken) {return null;}
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  if (!sheet) {return null;}
  const data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) {return null;}
  const headers = data[0].map(function (h) {
    return String(h).trim().toLowerCase();
  });
  let idIdx = headers.indexOf("user_id");
  if (idIdx === -1) {idIdx = headers.indexOf("user id");}
  let pinIdx = headers.indexOf("pin_code");
  if (pinIdx === -1) {pinIdx = headers.indexOf("pin");}
  const statusIdx = headers.indexOf("status");
  if (idIdx === -1 || pinIdx === -1) {return null;}
  const salt = getSessionSalt_();
  for (let i = 1; i < data.length; i++) {
    const uid = normalizeId_(data[i][idIdx]);
    if (!uid) {continue;}
    const pinHash = String(data[i][pinIdx] == null ? "" : data[i][pinIdx]).trim();
    const expected = sha256Hmac_(uid + "|" + pinHash + "|" + salt);
    if (expected !== String(sessionToken)) {continue;}
    const statusRaw =
      statusIdx !== -1
        ? String(data[i][statusIdx] == null ? "" : data[i][statusIdx])
            .trim()
            .toLowerCase()
        : "active";
    if (statusRaw && statusRaw !== "active") {return null;}
    if (!isSessionActiveForUser_(uid)) {return null;}
    return uid;
  }
  return null;
}
