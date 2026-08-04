/**
 * api_getScannerEvents RPC tests (F5 Scanner Section Event picker, Option A).
 *
 * Server-side unit-contracts with sheet mocks per spec #93. Zero Google Sheets
 * mutation: every read is a fixture. Capability filtering is presentation
 * only - api_qrCheckIn re-checks - but the picker must still respect it so an
 * operator cannot target an Event outside their authority.
 *
 * Coverage:
 *   - Auth boundary (stale session -> AUTH_REQUIRED; mismatched userId).
 *   - Capability: STAFF/ADMIN see ALL active events; PL sees only events in
 *     programs they lead; MEMBER with no leadership -> FORBIDDEN.
 *   - Inactive/cancelled events excluded from the list.
 *   - Program name joined for display.
 *   - Empty list (PL with no active events in their programs) is SUCCESS, not
 *     an error.
 *   - Payload shape { eventId, eventName, programId, programName, eventDate,
 *     timeSlot }.
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { describe, test } from "vitest";

const GAS_DIR = path.join(import.meta.dirname, "..", "..", "src", "gas");

// ---------------------------------------------------------------------------
// Test harness (mirrors api-qr-check-in.test.js)
// ---------------------------------------------------------------------------

function buildContext({ salt = "test-salt" } = {}) {
  const sheets = {};
  const scriptProps = {
    EFCC_SESSION_SALT: salt,
    EFCC_SPREADSHEET_ID: "1bkRPQTCrNKu4MNDTRn-vkTTRMKgV6MEBNfierKDng3o",
  };
  const context = {
    console: { log: () => {}, error: () => {} },
    sheets,
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: (name) => sheets[name] || null,
      }),
      flush: () => {},
    },
    CacheService: {
      getScriptCache: () => ({
        get: () => null,
        put: () => {},
        remove: () => {},
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in scriptProps ? scriptProps[k] : null),
        setProperty: (k, v) => {
          scriptProps[k] = v;
        },
        deleteProperty: (k) => {
          // oxlint-disable-next-line typescript/no-dynamic-delete
          delete scriptProps[k];
        },
        getKeys: () => Object.keys(scriptProps),
      }),
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => {},
        releaseLock: () => {},
      }),
    },
    Utilities: {
      getUuid: (() => {
        let n = 0;
        return () => `uuid-${(n += 1)}`;
      })(),
      computeHmacSha256Signature: (value) => {
        const h = crypto.createHmac("sha256", salt);
        h.update(value);
        return new Uint8Array(h.digest());
      },
      formatDate: () => "2026-08-01 15:00:00",
    },
  };
  vm.createContext(context);
  return { context, sheets, scriptProps };
}

function loadAllGas(context) {
  for (const name of [
    "spreadsheet-access.gs",
    "rpc-envelope.gs",
    "users-repository.gs",
    "session.js.gs",
    "program-leaders-repository.gs",
    "programs-repository.gs",
    "events-repository.gs",
    "enrollments-repository.gs",
    "attendances-repository.gs",
    "audit-log.gs",
    "attendance-checkin.gs",
    "Code.gs",
  ]) {
    vm.runInContext(readFileSync(path.join(GAS_DIR, name), "utf-8"), context, {
      filename: name,
    });
  }
}

// ---------------------------------------------------------------------------
// Sheet fixture builders
// ---------------------------------------------------------------------------

function makeUsersSheet(rows) {
  const header = [
    "User_ID",
    "Name",
    "Username",
    "PIN_Code",
    "Phone",
    "Role",
    "Status",
    "QR_Code_String",
  ];
  const data = [header];
  for (const r of rows) {
    data.push([
      r.userId,
      r.name || "",
      r.username,
      r.pinCode,
      r.phone || "",
      r.role || "MEMBER",
      r.status || "Active",
      r.qrCodeString ?? r.userId,
    ]);
  }
  return data;
}

function makeProgramsSheet(rows) {
  const data = [["Program_ID", "Program_Name", "Type", "Description"]];
  for (const r of rows) {
    data.push([r.id, r.name, r.type || "", r.description || ""]);
  }
  return data;
}

function makeEventsSheet(rows) {
  const data = [
    [
      "Event_ID",
      "Program_ID",
      "Event_Date",
      "Time_Slot",
      "Event_Name",
      "Event_Type",
      "Recurrence_Tag",
      "Created_By",
      "Status",
    ],
  ];
  for (const r of rows) {
    data.push([
      r.eventId,
      r.programId,
      r.eventDate || "2026-08-01",
      r.timeSlot || "15:00",
      r.eventName || "Event",
      r.eventType || "WORSHIP",
      r.recurrenceTag || "NONE",
      r.createdBy || "",
      r.status || "Active",
    ]);
  }
  return data;
}

function makeProgramLeadersSheet(rows) {
  const data = [
    [
      "Assignment_ID",
      "Program_ID",
      "User_ID",
      "Assigned_By",
      "Assigned_Date",
      "Status",
    ],
  ];
  for (const r of rows) {
    data.push([
      r.assignmentId || `A-${r.programId}-${r.userId}`,
      r.programId,
      r.userId,
      r.assignedBy || "",
      r.assignedDate || "",
      r.status || "Active",
    ]);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Default fixtures
// ---------------------------------------------------------------------------

const DEFAULT_USERS = [
  {
    userId: "U-OP",
    name: "Alice",
    username: "alice",
    pinCode: "1234",
    role: "STAFF",
    status: "Active",
    qrCodeString: "GC-OP-0001",
  },
  {
    userId: "U-ADM",
    name: "Noah",
    username: "noah",
    pinCode: "6883",
    role: "ADMIN",
    status: "Active",
    qrCodeString: "GC-ADM-0001",
  },
  {
    userId: "U-PL",
    name: "Leader",
    username: "leader",
    pinCode: "1111",
    role: "MEMBER",
    status: "Active",
    qrCodeString: "GC-PL-0001",
  },
  {
    userId: "U-MEM",
    name: "張三",
    username: "member",
    pinCode: "2222",
    role: "MEMBER",
    status: "Active",
    qrCodeString: "GC-MEM-0001",
  },
];

const DEFAULT_PROGRAMS = [
  { id: "P-1", name: "青崇", type: "青少年崇拜", description: "Youth worship" },
  { id: "P-2", name: "成崇", type: "成人崇拜", description: "Adult worship" },
];

const DEFAULT_EVENTS = [
  {
    eventId: "EVT-1",
    programId: "P-1",
    eventName: "青崇 - 01/08",
    status: "Active",
  },
  {
    eventId: "EVT-2",
    programId: "P-2",
    eventName: "成崇 - 01/08",
    status: "Active",
  },
  {
    eventId: "EVT-3",
    programId: "P-1",
    eventName: "青崇 - 25/07",
    status: "Cancelled",
  },
];

const DEFAULT_LEADERS = [
  { programId: "P-1", userId: "U-PL", status: "Active" },
];

// ---------------------------------------------------------------------------
// Boot helper
// ---------------------------------------------------------------------------

function boot(options = {}) {
  const env = buildContext();

  const users = makeUsersSheet(options.users || DEFAULT_USERS);
  env.sheets.Users = { getDataRange: () => ({ getValues: () => users }) };
  const programs = makeProgramsSheet(options.programs || DEFAULT_PROGRAMS);
  env.sheets.Programs = { getDataRange: () => ({ getValues: () => programs }) };
  const events = makeEventsSheet(options.events || DEFAULT_EVENTS);
  env.sheets.Events = { getDataRange: () => ({ getValues: () => events }) };
  const leaders = makeProgramLeadersSheet(options.leaders || DEFAULT_LEADERS);
  env.sheets.Program_Leaders = {
    getDataRange: () => ({ getValues: () => leaders }),
  };

  loadAllGas(env.context);

  const { operator: op = { username: "alice", pin: "1234" } } = options;
  const login = env.context.api_loginUser(op.username, op.pin);
  assert.equal(
    login.success,
    true,
    `test setup: login must succeed (got ${JSON.stringify(login.error)})`
  );
  const { session } = login.data;

  return { env, session };
}

function getScannerEvents(env, session) {
  return env.context.api_getScannerEvents(
    session.userId,
    session.sessionId,
    session.sessionToken
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("api_getScannerEvents - Scanner Event picker (Option A)", () => {
  test("STAFF sees ALL active events (cancelled excluded), program names joined", () => {
    const { env, session } = boot();
    const res = getScannerEvents(env, session);
    assert.equal(res.success, true);
    assert.equal(res.data.length, 2);
    const ids = res.data.map((e) => e.eventId).sort();
    assert.equal(JSON.stringify(ids), JSON.stringify(["EVT-1", "EVT-2"]));
    const e1 = res.data.find((e) => e.eventId === "EVT-1");
    assert.equal(e1.programName, "青崇");
    assert.equal(e1.programId, "P-1");
    assert.equal(typeof e1.eventDate, "string");
    assert.equal(typeof e1.timeSlot, "string");
  });

  test("ADMIN sees ALL active events", () => {
    const { env, session } = boot({
      operator: { username: "noah", pin: "6883" },
    });
    const res = getScannerEvents(env, session);
    assert.equal(res.success, true);
    assert.equal(res.data.length, 2);
  });

  test("Program Leader sees only events in programs they lead", () => {
    const { env, session } = boot({
      operator: { username: "leader", pin: "1111" },
    });
    const res = getScannerEvents(env, session);
    assert.equal(res.success, true);
    assert.equal(res.data.length, 1);
    assert.equal(res.data[0].eventId, "EVT-1");
    assert.equal(res.data[0].programId, "P-1");
  });

  test("Program Leader with no active events in their programs gets an empty list (SUCCESS)", () => {
    const { env, session } = boot({
      events: [{ eventId: "EVT-2", programId: "P-2", status: "Active" }],
      operator: { username: "leader", pin: "1111" },
    });
    const res = getScannerEvents(env, session);
    assert.equal(res.success, true);
    assert.equal(res.data.length, 0);
  });

  test("MEMBER with no leadership assignment -> FORBIDDEN", () => {
    const { env, session } = boot({
      operator: { username: "member", pin: "2222" },
    });
    const res = getScannerEvents(env, session);
    assert.equal(res.success, false);
    assert.equal(res.error.code, "FORBIDDEN");
  });

  test("stale session -> AUTH_REQUIRED", () => {
    const { env, session } = boot();
    const res = env.context.api_getScannerEvents(
      session.userId,
      "stale-session-id",
      "stale-token"
    );
    assert.equal(res.success, false);
    assert.equal(res.error.code, "AUTH_REQUIRED");
  });

  test("mismatched userId on a valid session -> AUTH_REQUIRED", () => {
    const { env, session } = boot();
    const res = env.context.api_getScannerEvents(
      "someone-else",
      session.sessionId,
      session.sessionToken
    );
    assert.equal(res.success, false);
    assert.equal(res.error.code, "AUTH_REQUIRED");
  });

  test("inactive operator (deactivated since login) -> AUTH_REQUIRED", () => {
    const { env, session } = boot();
    const deactivated = makeUsersSheet(
      DEFAULT_USERS.map((u) =>
        u.userId === "U-OP" ? { ...u, status: "Inactive" } : u
      )
    );
    env.context.usersSetRowsForTesting_(deactivated);
    const res = getScannerEvents(env, session);
    assert.equal(res.success, false);
    assert.equal(res.error.code, "AUTH_REQUIRED");
  });

  test("cancelled and draft events are excluded", () => {
    const { env, session } = boot({
      events: [
        { eventId: "E-A", programId: "P-1", status: "Active" },
        { eventId: "E-B", programId: "P-1", status: "Cancelled" },
        { eventId: "E-C", programId: "P-1", status: "Draft" },
      ],
    });
    const res = getScannerEvents(env, session);
    assert.equal(res.success, true);
    assert.equal(res.data.length, 1);
    assert.equal(res.data[0].eventId, "E-A");
  });

  // Regression for the production DEV sheet, whose Events tab carries only
  // the 5 load-bearing columns (Event_ID, Program_ID, Event_Date, Time_Slot,
  // Event_Name) - no Status / Event_Type / Recurrence_Tag / Created_By. The
  // prior 9-required-columns model threw INTERNAL_ERROR here ("載入失敗").
  test("Events sheet with only the 5 required columns loads (no Status column -> defaults Active)", () => {
    const { env, session } = boot({
      operator: { username: "noah", pin: "6883" },
    });
    const fiveCol = [
      ["Event_ID", "Program_ID", "Event_Date", "Time_Slot", "Event_Name"],
      ["8198b7b4", "P-1", "2026/7/12", "15:00:00", "青崇 - 07/12/2026"],
    ];
    env.sheets.Events = {
      getDataRange: () => ({ getValues: () => fiveCol }),
    };
    const res = getScannerEvents(env, session);
    assert.equal(res.success, true, "must not throw on the 5-column sheet");
    assert.equal(res.data.length, 1);
    assert.equal(res.data[0].eventId, "8198b7b4");
    assert.equal(res.data[0].programId, "P-1");
    assert.equal(res.data[0].programName, "青崇");
    assert.equal(res.data[0].eventName, "青崇 - 07/12/2026");
  });

  test("a missing REQUIRED column (no Event_Name) still fails closed", () => {
    const { env, session } = boot({
      operator: { username: "noah", pin: "6883" },
    });
    const noName = [
      ["Event_ID", "Program_ID", "Event_Date", "Time_Slot"],
      ["8198b7b4", "P-1", "2026/7/12", "15:00:00"],
    ];
    env.sheets.Events = {
      getDataRange: () => ({ getValues: () => noName }),
    };
    const res = getScannerEvents(env, session);
    assert.equal(res.success, false);
    assert.equal(res.error.code, "INTERNAL_ERROR");
  });
});
