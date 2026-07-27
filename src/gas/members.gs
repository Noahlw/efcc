// =========== members.gs — Member Registration & Search ===========

function registerNewMember(name, phone) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const hex1 = Math.floor(Math.random() * (65535 - 4096 + 1) + 4096)
    .toString(16)
    .toUpperCase();
  const hex2 = Math.floor(Math.random() * (65535 - 4096 + 1) + 4096)
    .toString(16)
    .toUpperCase();
  const newHexId = "GC-" + hex1 + "-" + hex2;
  const newPin = Math.floor(Math.random() * (9999 - 1000 + 1) + 1000);

  // Smart Username Generation
  const usernameIdx = headers
    .map(function (h) {
      return String(h).trim().toLowerCase();
    })
    .indexOf("username");
  const baseUser = String(name).replace(/\s+/g, "").toLowerCase();
  let simpleUsername = baseUser;
  let counter = 1;

  const existingUsers = [];
  for (let i = 1; i < data.length; i++) {
    if (usernameIdx > -1 && data[i][usernameIdx])
      {existingUsers.push(String(data[i][usernameIdx]).trim().toLowerCase());}
  }
  while (existingUsers.indexOf(simpleUsername) !== -1) {
    simpleUsername = baseUser + counter;
    counter++;
  }

  const newRow = new Array(headers.length).fill("");
  const idIndex = headers
    .map(function (h) {
      return String(h).trim().toLowerCase();
    })
    .indexOf("user_id");
  const nameIndex = headers
    .map(function (h) {
      return String(h).trim().toLowerCase();
    })
    .indexOf("name");
  let pinIndex = headers
    .map(function (h) {
      return String(h).trim().toLowerCase();
    })
    .indexOf("pin_code");
  if (pinIndex === -1)
    {pinIndex = headers
      .map(function (h) {
        return String(h).trim().toLowerCase();
      })
      .indexOf("pin");}
  const phoneIndex = headers
    .map(function (h) {
      return String(h).trim().toLowerCase();
    })
    .indexOf("phone");
  const qrIndex = headers
    .map(function (h) {
      return String(h).trim().toLowerCase();
    })
    .indexOf("qr_code_string");
  const roleIndex = headers
    .map(function (h) {
      return String(h).trim().toLowerCase();
    })
    .indexOf("role");
  const statusIndex = headers
    .map(function (h) {
      return String(h).trim().toLowerCase();
    })
    .indexOf("status");

  if (idIndex > -1) {newRow[idIndex] = newHexId;}
  if (nameIndex > -1) {newRow[nameIndex] = String(name).trim();}
  if (usernameIdx > -1) {newRow[usernameIdx] = simpleUsername;}
  if (pinIndex > -1) {newRow[pinIndex] = newPin;}
  if (phoneIndex > -1) {newRow[phoneIndex] = String(phone).trim();}
  if (qrIndex > -1) {newRow[qrIndex] = newHexId;}
  if (roleIndex > -1) {newRow[roleIndex] = "Member";}
  if (statusIndex > -1) {newRow[statusIndex] = "Active";}

  sheet.appendRow(newRow);

  return { Name: name, PIN: newPin, Username: simpleUsername };
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
