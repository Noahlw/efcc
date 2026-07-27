const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("程式碼.js", "utf8");
const context = {
  console,
  Date,
  Math,
  JSON,
  Object,
  Array,
  String,
  Number,
  isNaN,
  isFinite,
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
    getDataRange: () => range(data),
    getLastRow: () => data.length,
    getLastColumn: () => data[0].length,
    getRange: (row, col, rowCount, colCount) => {
      const values = data
        .slice(row - 1, row - 1 + (rowCount || 1))
        .map((entry) => entry.slice(col - 1, col - 1 + (colCount || 1)));
      return range(values, (value) => {
        data[row - 1][col - 1] = value;
      });
    },
    appendRow: (row) => {
      data.push(row);
      if (options.appended) options.appended.push(row);
    },
  };
}

const users = [
  ["User_ID", "PIN"],
  ["USER-1", "1234"],
];
const enrollments = [
  ["Enrollment_ID", "User_ID", "Program_ID", "Timestamp", "Status"],
  ["ENR-OLD0001", "USER-1", "PROG-OLD", new Date("2026-01-01"), "Active"],
];
const events = [
  ["Program_ID", "Event_Date", "Time_Slot", "Event_Name"],
  ["PROG-OLD", "2026-08-01", "3:00 PM", "Existing Worship"],
  ["PROG-TARGET", "2026-08-01", "3:00 PM", "Youth Worship"],
  ["PROG-FREE", "2026-08-02", "4:00 PM", "Bible Study"],
];
const programs = [
  ["Program_ID", "Program_Name", "Type", "Description"],
  ["PROG-TARGET", "Youth Worship", "Youth", "Youth gathering"],
  ["PROG-FREE", "Bible Study", "Class", "Study together"],
];
const appended = [];
const puts = [];
let cacheValue = null;
const sheets = {
  Users: sheet(users),
  Enrollments: sheet(enrollments, { appended }),
  Events: sheet(events),
  Programs: sheet(programs),
};
context.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({
    getSheetByName: (name) => sheets[name] || null,
  }),
};
context.CacheService = {
  getScriptCache: () => ({
    get: () => cacheValue,
    put: (key, value, ttl) => {
      puts.push({ key, ttl });
      cacheValue = value;
    },
  }),
};
context.PropertiesService = {
  getScriptProperties: () => ({ getProperty: () => "test-salt" }),
};
context.Utilities = {
  computeHmacSha256Signature: (value) =>
    Array.from(Buffer.from(value)).slice(0, 32),
  getUuid: () => "abcdef12-3456-7890-abcd-ef1234567890",
  formatDate: (value) => value.toISOString().slice(0, 10),
};
context.Session = { getScriptTimeZone: () => "UTC" };

const token = context.sha256Hmac_("USER-1|1234|test-salt");
const catalog = context.api_getProgramsCatalog("USER-1", token);
if (
  catalog.length !== 2 ||
  catalog[0].programId !== "PROG-TARGET" ||
  catalog[0].title !== "Youth Worship"
) {
  throw new Error("Catalog RPC returned the wrong Program shape");
}
if (puts.length !== 1 || puts[0].ttl !== 300)
  throw new Error("Catalog cache TTL is not 300 seconds");
context.api_getProgramsCatalog("USER-1", token);
if (puts.length !== 1) throw new Error("Catalog did not reuse cache");

const available = context.api_getAvailablePrograms("USER-1", token);
if (available.length !== 2 || available.some((program) => program.isEnrolled)) {
  throw new Error("Available program enrollment badges are incorrect");
}

const invalid = context.api_enrollUser("USER-1", "PROG-FREE", "bad-token");
if (invalid.success !== false || appended.length !== 0)
  throw new Error("Invalid session was not rejected");

const conflict = context.api_enrollUser("USER-1", "PROG-TARGET", token);
if (
  conflict.success !== false ||
  conflict.message !== "Youth Worship at 3:00 PM" ||
  appended.length !== 0
) {
  throw new Error("Schedule conflict behavior changed");
}

const enrolled = context.api_enrollUser("USER-1", "PROG-FREE", token);
if (!enrolled.success || appended.length !== 1)
  throw new Error("Valid enrollment was not appended");
if (
  !/^ENR-[A-F0-9]{8}$/.test(appended[0][0]) ||
  appended[0][1] !== "USER-1" ||
  appended[0][2] !== "PROG-FREE" ||
  appended[0][4] !== "Active"
) {
  throw new Error("Enrollment row contract is incorrect");
}

const cancelled = context.api_cancelEnrollment("USER-1", "PROG-FREE", token);
if (!cancelled.success || enrollments[2][4] !== "Cancelled")
  throw new Error("Cancellation did not soft-delete");
const missing = context.api_cancelEnrollment("USER-1", "PROG-FREE", token);
if (
  missing.success !== false ||
  missing.message !== "Active enrollment record not found."
) {
  throw new Error("Missing active enrollment response is incorrect");
}

console.log("Backend program RPC smoke: PASS");
console.log(
  `Catalog=${catalog.length}; cacheTTL=${puts[0].ttl}; conflict=${conflict.message}; enrollment=${appended[0][0]}; cancelled=${enrollments[2][4]}`
);
