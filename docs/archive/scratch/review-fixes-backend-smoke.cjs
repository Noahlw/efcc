const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("程式碼.js", "utf-8");
const context = {
  Array,
  Date,
  JSON,
  Math,
  Number,
  Object,
  String,
  console,
  isFinite,
  isNaN,
};
vm.createContext(context);
vm.runInContext(source, context, { filename: "程式碼.js" });

function range(values, onSet) {
  return {
    getValues: () => values,
    setValue: (value) => onSet && onSet(value),
  };
}

function sheet(data, options = {}) {
  return {
    appendRow: (row) => {
      data.push(row);
      if (options.appended) options.appended.push(row);
    },
    getDataRange: () => range(data),
    getLastColumn: () => data[0].length,
    getLastRow: () => data.length,
    getRange: (row, col, rowCount, colCount) => {
      const values = data
        .slice(row - 1, row - 1 + (rowCount || 1))
        .map((entry) => entry.slice(col - 1, col - 1 + (colCount || 1)));
      return range(values, (value) => {
        data[row - 1][col - 1] = value;
      });
    },
  };
}

const users = [
  [
    "User_ID",
    "Username",
    "PIN",
    "Name",
    "Role",
    "Status",
    "QR_Code_String",
    "Phone",
  ],
  ["USER-STAFF", "staff", "1111", "Staffer", "STAFF", "Active", "QR-STAFF", ""],
  [
    "USER-MEMBER-A",
    "membera",
    "2222",
    "Member A",
    "MEMBER",
    "Active",
    "QR-A",
    "",
  ],
  [
    "USER-MEMBER-B",
    "memberb",
    "3333",
    "Member B",
    "MEMBER",
    "Active",
    "QR-B",
    "",
  ],
];
const enrollments = [
  ["Enrollment_ID", "User_ID", "Program_ID", "Timestamp", "Status"],
  ["ENR-A0000001", "USER-MEMBER-A", "PROG-1", new Date("2026-01-01"), "Active"],
];
const events = [
  [
    "Event_ID",
    "Program_ID",
    "Event_Name",
    "Event_Date",
    "Time_Slot",
    "Event_Type",
    "Recurrence_Type",
    "Status",
    "Created_By",
    "Created_At",
  ],
  [
    "EVT-1",
    "PROG-1",
    "Sunday Service",
    "01/08/2026",
    "10:00",
    "REGULAR",
    "NONE",
    "Active",
    "USER-STAFF",
    "2026-01-01",
  ],
  [
    "EVT-2",
    "PROG-1",
    "Special Event",
    "02/08/2026",
    "10:00",
    "SPECIAL",
    "NONE",
    "Active",
    "USER-STAFF",
    "2026-01-01",
  ],
  [
    "EVT-CANCELLED",
    "PROG-1",
    "Cancelled Event",
    "03/08/2026",
    "10:00",
    "REGULAR",
    "NONE",
    "Cancelled",
    "USER-STAFF",
    "2026-01-01",
  ],
];
const attendance = [
  [
    "Attendance_ID",
    "Event_ID",
    "User_ID",
    "Check_In_Time",
    "Check_In_Method",
    "Check_In_By",
    "Status",
  ],
];

const appendedAtt = [];
const sheets = {
  Attendance: sheet(attendance, { appended: appendedAtt }),
  Enrollments: sheet(enrollments),
  Events: sheet(events),
  Users: sheet(users),
};
context.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({
    getSheetByName: (name) => sheets[name] || null,
  }),
};
context.CacheService = {
  getScriptCache: () => ({ get: () => null, put: () => {} }),
};
const scriptProps = {};
context.PropertiesService = {
  getScriptProperties: () => ({
    deleteProperty: (key) => {
      delete scriptProps[key];
    },
    getProperty: (key) =>
      key === "EFCC_SESSION_SALT" ? "test-salt" : (scriptProps[key] ?? null),
    setProperty: (key, value) => {
      scriptProps[key] = value;
    },
  }),
};
let lockHeld = false;
context.LockService = {
  getScriptLock: () => ({
    releaseLock: () => {
      lockHeld = false;
    },
    tryLock: () => {
      lockHeld = true;
      return true;
    },
  }),
};
context.Utilities = {
  computeHmacSha256Signature: (value) =>
    Array.from(Buffer.from(value)).slice(0, 32),
  formatDate: (value) => value.toISOString().slice(0, 10),
  getUuid: () => "abcdef12-3456-7890-abcd-ef1234567890",
};
context.Session = { getScriptTimeZone: () => "UTC" };

// --- 1. api_cancelEvent off-by-one fix ---
const staffToken = context.sha256Hmac_("USER-STAFF|1111|test-salt");
context.setSessionIssuedNow_("USER-STAFF");

const cancelRes = context.api_cancelEvent({
  __sessionToken: staffToken,
  cancelledBy: "USER-STAFF",
  eventId: "EVT-1",
});
if (!cancelRes.success)
  {throw new Error("cancelEvent should succeed: " + cancelRes.message);}
// EVT-1 is events[1] (row 2 of sheet incl header). Its status column must flip, NOT EVT-2's.
if (events[1][7] !== "Cancelled")
  {throw new Error(
    "api_cancelEvent did not cancel the TARGET row (off-by-one regression)"
  );}
if (events[2][7] !== "Active")
  {throw new Error(
    "api_cancelEvent corrupted the WRONG row (off-by-one bug present)"
  );}
console.log("PASS: api_cancelEvent writes to the correct row");

// --- 2. Session expiry + logout revocation ---
const memberAToken = context.sha256Hmac_("USER-MEMBER-A|2222|test-salt");
if (context.verifySessionToken_("USER-MEMBER-A", memberAToken)) {
  throw new Error(
    "verifySessionToken_ accepted a token with no issuedAt record"
  );
}
context.setSessionIssuedNow_("USER-MEMBER-A");
if (!context.verifySessionToken_("USER-MEMBER-A", memberAToken)) {
  throw new Error("verifySessionToken_ rejected a freshly issued token");
}
context.api_logoutUser("USER-MEMBER-A", memberAToken);
if (context.verifySessionToken_("USER-MEMBER-A", memberAToken)) {
  throw new Error(
    "verifySessionToken_ accepted a token after logout (revocation not enforced)"
  );
}
console.log("PASS: session expiry + logout revocation enforced");

// Re-issue for subsequent tests.
context.setSessionIssuedNow_("USER-MEMBER-A");

// --- 3. api_checkInMember eligibility + duplicate + success shape ---
const notEnrolledRes = context.api_checkInMember({
  eventId: "EVT-2",
  method: "MANUAL",
  sessionToken: staffToken,
  staffId: "USER-STAFF",
  userId: "USER-MEMBER-B", // not enrolled in PROG-1,
});
if (notEnrolledRes.success !== false || notEnrolledRes.notEnrolled !== true) {
  throw new Error(
    `api_checkInMember did not flag an unenrolled member: ${ 
      JSON.stringify(notEnrolledRes)}`
  );
}
if (notEnrolledRes.data.memberName !== "Member B") {
  throw new Error(
    "api_checkInMember did not resolve member name for notEnrolled response"
  );
}
console.log(
  "PASS: api_checkInMember rejects unenrolled member with notEnrolled flag"
);

const successRes = context.api_checkInMember({
  eventId: "EVT-2",
  method: "QR",
  sessionToken: staffToken,
  staffId: "USER-STAFF",
  userId: "USER-MEMBER-A", // enrolled in PROG-1,
});
if (!successRes.success || successRes.data.memberName !== "Member A") {
  throw new Error(
    `api_checkInMember did not succeed for an enrolled member: ${ 
      JSON.stringify(successRes)}`
  );
}
if (appendedAtt.length !== 1)
  {throw new Error(
    "api_checkInMember did not append exactly one attendance row"
  );}
console.log(
  "PASS: api_checkInMember succeeds for an enrolled member and returns memberName"
);

const dupRes = context.api_checkInMember({
  eventId: "EVT-2",
  method: "QR",
  sessionToken: staffToken,
  staffId: "USER-STAFF",
  userId: "USER-MEMBER-A",
});
if (!dupRes.duplicate || dupRes.data.memberName !== "Member A") {
  throw new Error(
    `api_checkInMember did not detect duplicate check-in: ${ 
      JSON.stringify(dupRes)}`
  );
}
console.log("PASS: api_checkInMember detects duplicate check-in");

const cancelledEventRes = context.api_checkInMember({
  eventId: "EVT-CANCELLED",
  method: "QR",
  sessionToken: staffToken,
  staffId: "USER-STAFF",
  userId: "USER-MEMBER-A",
});
if (cancelledEventRes.success !== false) {
  throw new Error("api_checkInMember allowed check-in on an inactive event");
}
console.log("PASS: api_checkInMember rejects check-in on an inactive event");

// --- 4. api_staffEnrollMember enrolls the SCANNED member, not the staff session ---
const staffEnrollRes = context.api_staffEnrollMember(
  "USER-STAFF",
  "USER-MEMBER-B",
  "PROG-1",
  staffToken
);
if (!staffEnrollRes.success)
  {throw new Error("api_staffEnrollMember failed: " + staffEnrollRes.message);}
const newEnrollment = enrollments.at(-1);
if (
  newEnrollment[1] !== "USER-MEMBER-B" ||
  newEnrollment[2] !== "PROG-1" ||
  newEnrollment[4] !== "Active"
) {
  throw new Error(
    `api_staffEnrollMember enrolled the wrong user: ${ 
      JSON.stringify(newEnrollment)}`
  );
}
console.log(
  "PASS: api_staffEnrollMember enrolls the scanned member, not the staff session holder"
);

// Member B should now pass the eligibility check that failed above.
const nowEligibleRes = context.api_checkInMember({
  eventId: "EVT-2",
  method: "MANUAL",
  sessionToken: staffToken,
  staffId: "USER-STAFF",
  userId: "USER-MEMBER-B",
});
if (!nowEligibleRes.success) {
  throw new Error(
    `Member B still rejected after staff-enrollment: ${ 
      JSON.stringify(nowEligibleRes)}`
  );
}
console.log(
  "PASS: quick-enrolled member passes the eligibility check on next check-in"
);

// --- 5. api_searchMembers ---
const searchRes = context.api_searchMembers("member", "USER-STAFF", staffToken);
if (!searchRes.success || searchRes.data.length !== 2) {
  throw new Error(
    `api_searchMembers did not return expected matches: ${ 
      JSON.stringify(searchRes)}`
  );
}
const memberDeniedSearch = context.api_searchMembers(
  "member",
  "USER-MEMBER-A",
  memberAToken
);
if (memberDeniedSearch.success !== false) {
  throw new Error("api_searchMembers allowed a MEMBER-role caller");
}
const staffLeakSearch = context.api_searchMembers(
  "staff",
  "USER-STAFF",
  staffToken
);
if (!staffLeakSearch.success || staffLeakSearch.data.length !== 0) {
  throw new Error(
    `api_searchMembers leaked a STAFF-role account into member search results: ${ 
      JSON.stringify(staffLeakSearch)}`
  );
}
console.log(
  "PASS: api_searchMembers finds matches, is role-gated, and excludes non-MEMBER accounts"
);

// --- 6. api_getEventAttendance auth + role gate ---
const attNoAuth = context.api_getEventAttendance("EVT-2", "", "");
if (attNoAuth.success !== false)
  {throw new Error("api_getEventAttendance allowed an unauthenticated read");}
const attMemberDenied = context.api_getEventAttendance(
  "EVT-2",
  "USER-MEMBER-A",
  memberAToken
);
if (attMemberDenied.success !== false)
  {throw new Error("api_getEventAttendance allowed a MEMBER-role read");}
const attAllowed = context.api_getEventAttendance(
  "EVT-2",
  "USER-STAFF",
  staffToken
);
if (!attAllowed.success || attAllowed.data.length !== 2) {
  throw new Error(
    `api_getEventAttendance did not return the granted user's roster: ${ 
      JSON.stringify(attAllowed)}`
  );
}
console.log("PASS: api_getEventAttendance enforces auth + role gate");

console.log("\nAll review-fix backend smoke checks: PASS");
