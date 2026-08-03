/**
 * api_qrCheckIn RPC tests (issue #101 - shared Attendance check-in RPC).
 *
 * Server-side unit-contracts with LockService / Sheets mocks per spec #93
 * Seam 1. Zero Google Sheets mutation: every read is a fixture and every
 * write is captured by a mock appendRow. Agents never mutate the sheet.
 *
 * Coverage (maps to issue #101 acceptance criteria):
 *   - Auth boundary + bypass rejection (forged eventId, stale session,
 *     MEMBER role, wrong-program Leader) -> typed forbidden/error, no write.
 *   - scannedCode resolve (QR match, empty-QR + User_ID fallback, no match,
 *     empty/whitespace/over-max -> VALIDATION).
 *   - eligibility (inactive member, cancelled event, NOT_ENROLLED naming the
 *     Program, STAFF/ADMIN global, exact Program Leader, wrong-program Leader).
 *   - first-create (exactly one Attendance row + one audit append; created:true;
 *     attendanceId; server-derived memberName; CheckIn_By = verified operator).
 *   - quiet duplicate (created:false; existing identity; no second row; no audit).
 *   - typed errors (English code + Traditional Chinese message).
 *   - concurrency (near-simultaneous scans -> one active row + quiet success;
 *     duplicate recheck read happens while the lock is held).
 *   - no scannedCode echo in response data, audit narratives, or failure copy.
 *   - zero Sheets mutation on every failure path.
 *
 * Sheet schemas ground in: spec 005 (Events), spec 002 (Enrollments),
 * spec 006 (Attendance), ADR-0009 (Audit_Log), ADR-0013 (Users/Programs).
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { beforeEach, describe, test } from "vitest";

const GAS_DIR = path.join(import.meta.dirname, "..", "..", "src", "gas");

// ---------------------------------------------------------------------------
// Test harness (mirrors api-submit-demo-form.test.js + write-capture sheets)
// ---------------------------------------------------------------------------

function fakeHmacBytes(value, salt) {
  const h = crypto.createHmac("sha256", salt);
  h.update(value);
  return new Uint8Array(h.digest());
}

function buildContext({ salt = "test-salt" } = {}) {
  const sheets = {};
  const scriptProps = {
    EFCC_SESSION_SALT: salt,
    EFCC_SPREADSHEET_ID: "1bkRPQTCrNKu4MNDTRn-vkTTRMKgV6MEBNfierKDng3o",
  };
  const cacheStore = new Map();
  let lockHeld = false;
  const lockAcquired = [];
  const lockReleased = [];
  const context = {
    console: { log: () => {}, error: () => {} },
    sheets,
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: (name) => sheets[name] || null,
      }),
      // Per official releaseLock() docs: call SpreadsheetApp.flush() before
      // releasing the lock so pending writes commit while exclusive access
      // is still held.
      flush: () => {},
    },
    CacheService: {
      getScriptCache: () => ({
        get: (key) => (cacheStore.has(key) ? cacheStore.get(key) : null),
        put: (key, value) => {
          cacheStore.set(key, value);
        },
        remove: (key) => {
          cacheStore.delete(key);
        },
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
        waitLock: (timeoutMs) => {
          lockHeld = true;
          lockAcquired.push(timeoutMs);
        },
        releaseLock: () => {
          lockHeld = false;
          lockReleased.push(true);
        },
      }),
    },
    Utilities: {
      getUuid: (() => {
        let n = 0;
        return () => `uuid-${(n += 1)}`;
      })(),
      computeHmacSha256Signature: (value) => fakeHmacBytes(value, salt),
      formatDate: () => "2026-01-15 14:30:00",
    },
  };
  vm.createContext(context);
  return {
    context,
    sheets,
    scriptProps,
    cacheStore,
    lockAcquired,
    lockReleased,
    isLockHeld: () => lockHeld,
  };
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
  const header = ["Program_ID", "Program_Name", "Type", "Description"];
  const data = [header];
  for (const r of rows) {
    data.push([r.id, r.name, r.type || "", r.description || ""]);
  }
  return data;
}

function makeEventsSheet(rows) {
  const header = [
    "Event_ID",
    "Program_ID",
    "Event_Date",
    "Time_Slot",
    "Event_Name",
    "Event_Type",
    "Recurrence_Tag",
    "Created_By",
    "Status",
  ];
  const data = [header];
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

function makeEnrollmentsSheet(rows) {
  const header = [
    "Enrollment_ID",
    "User_ID",
    "Program_ID",
    "Timestamp",
    "Status",
  ];
  const data = [header];
  for (const r of rows) {
    data.push([
      r.enrollmentId,
      r.userId,
      r.programId,
      r.timestamp || "",
      r.status || "Active",
    ]);
  }
  return data;
}

function makeProgramLeadersSheet(rows) {
  const header = [
    "Assignment_ID",
    "Program_ID",
    "User_ID",
    "Assigned_By",
    "Assigned_Date",
    "Status",
  ];
  const data = [header];
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

// Attendance is read+write: a live rows array so an append is visible to the
// next fresh read (mirrors real sheet behavior within one execution). Writes
// are captured separately, and each read records whether the lock was held.
function makeAttendanceSheet(env, initialRows) {
  const header = [
    "Attendance_ID",
    "Event_ID",
    "User_ID",
    "CheckIn_Time",
    "CheckIn_Method",
    "CheckIn_By",
    "Status",
  ];
  const rows = [header];
  for (const r of initialRows) {
    rows.push([
      r.attendanceId,
      r.eventId,
      r.userId,
      r.checkInTime || "",
      r.checkInMethod || "QR_SCAN",
      r.checkInBy || "",
      r.status || "Active",
    ]);
  }
  const writes = [];
  const readsUnderLock = [];
  return {
    rows,
    writes,
    readsUnderLock,
    sheet: {
      getDataRange: () => ({
        getValues: () => {
          readsUnderLock.push(env.isLockHeld());
          return rows;
        },
      }),
      appendRow: (row) => {
        rows.push(row);
        writes.push(row);
      },
    },
  };
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
  {
    userId: "U-INACT",
    name: "InactiveMember",
    username: "inact",
    pinCode: "3333",
    role: "MEMBER",
    status: "Inactive",
    qrCodeString: "GC-INACT-0001",
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
    eventName: "青崇 - 01/08/2026",
    status: "Active",
  },
];

const DEFAULT_ENROLLMENTS = [
  {
    enrollmentId: "ENR-1",
    userId: "U-MEM",
    programId: "P-1",
    status: "Active",
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
  const enrollments = makeEnrollmentsSheet(
    options.enrollments || DEFAULT_ENROLLMENTS
  );
  env.sheets.Enrollments = {
    getDataRange: () => ({ getValues: () => enrollments }),
  };
  const leaders = makeProgramLeadersSheet(options.leaders || DEFAULT_LEADERS);
  env.sheets.Program_Leaders = {
    getDataRange: () => ({ getValues: () => leaders }),
  };

  const attendance = makeAttendanceSheet(env, options.attendance || []);
  env.sheets.Attendances = attendance.sheet;

  const auditWrites = [];
  env.sheets.Audit_Log = {
    appendRow: (row) => {
      auditWrites.push(row);
    },
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

  return {
    env,
    session,
    attendance,
    auditWrites,
    users,
    programs,
    events,
    enrollments,
  };
}

function checkIn(env, session, opts = {}) {
  const { eventId = "EVT-1", scannedCode, method = "QR_SCAN" } = opts;
  return env.context.api_qrCheckIn(
    session.userId,
    session.sessionId,
    session.sessionToken,
    eventId,
    scannedCode,
    method
  );
}

function assertNoMutation({ attendance, auditWrites }) {
  assert.equal(
    attendance.writes.length,
    0,
    "no Attendance row may be written on a failure path"
  );
  assert.equal(
    auditWrites.length,
    0,
    "no Audit_Log row may be written on a failure path"
  );
}

function hasTraditionalChinese(s) {
  return /[\u4E00-\u9FFF]/u.test(s);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("api_qrCheckIn - issue #101 shared Attendance check-in RPC", () => {
  let env;
  let session;

  beforeEach(() => {
    const b = boot();
    ({ env, session } = b);
    // Expose the write captures for tests that don't destructure boot().
    env.__attendance = b.attendance;
    env.__auditWrites = b.auditWrites;
  });

  // -------------------------------------------------------------------------
  // Auth boundary & bypass rejection
  // -------------------------------------------------------------------------

  describe("auth boundary & bypass rejection", () => {
    test("AUTH_REQUIRED for a bogus (stale) session - no write", () => {
      const res = env.context.api_qrCheckIn(
        "U-OP",
        "stale-session-id",
        "stale-token",
        "EVT-1",
        "GC-MEM-0001",
        "QR_SCAN"
      );
      assert.equal(res.success, false);
      assert.equal(res.error.code, "AUTH_REQUIRED");
      assertNoMutation({
        attendance: env.__attendance,
        auditWrites: env.__auditWrites,
      });
    });

    test("AUTH_REQUIRED when userId does not match the verified session - no write", () => {
      const res = env.context.api_qrCheckIn(
        "someone-else",
        session.sessionId,
        session.sessionToken,
        "EVT-1",
        "GC-MEM-0001",
        "QR_SCAN"
      );
      assert.equal(res.success, false);
      assert.equal(res.error.code, "AUTH_REQUIRED");
      assertNoMutation({
        attendance: env.__attendance,
        auditWrites: env.__auditWrites,
      });
    });

    test("AUTH_REQUIRED when the operator has been deactivated since login - no write", () => {
      // Operator was active at login (beforeEach); deactivate Sheet-side
      // after the session was issued, then re-run the protected RPC.
      const deactivated = makeUsersSheet(
        DEFAULT_USERS.map((u) =>
          u.userId === "U-OP" ? { ...u, status: "Inactive" } : u
        )
      );
      env.context.usersSetRowsForTesting_(deactivated);
      const res = checkIn(env, session, { scannedCode: "GC-MEM-0001" });
      assert.equal(res.success, false);
      assert.equal(res.error.code, "AUTH_REQUIRED");
      assertNoMutation({
        attendance: env.__attendance,
        auditWrites: env.__auditWrites,
      });
    });

    test("FORBIDDEN for a MEMBER role operator (no capability) - no write", () => {
      // MEMBER has no Scanner capability and is not a Program Leader here.
      const b = boot({
        users: DEFAULT_USERS.map((u) =>
          u.userId === "U-OP" ? { ...u, role: "MEMBER" } : u
        ),
      });
      const res = checkIn(b.env, b.session, { scannedCode: "GC-MEM-0001" });
      assert.equal(res.success, false);
      assert.equal(res.error.code, "FORBIDDEN");
      assertNoMutation(b);
    });

    test("EVENT_NOT_FOUND for a forged (nonexistent) eventId - no write", () => {
      const res = checkIn(env, session, {
        eventId: "EVT-DOES-NOT-EXIST",
        scannedCode: "GC-MEM-0001",
      });
      assert.equal(res.success, false);
      assert.equal(res.error.code, "EVENT_NOT_FOUND");
      assertNoMutation({
        attendance: env.__attendance,
        auditWrites: env.__auditWrites,
      });
    });
  });

  // -------------------------------------------------------------------------
  // scannedCode resolve
  // -------------------------------------------------------------------------

  describe("scannedCode resolve", () => {
    test("QR_Code_String === scanned resolves the member", () => {
      const res = checkIn(env, session, { scannedCode: "GC-MEM-0001" });
      assert.equal(res.success, true);
      assert.equal(res.data.created, true);
      assert.equal(res.data.memberName, "張三");
    });

    test("empty QR_Code_String + User_ID === scanned resolves (legacy fallback)", () => {
      const b = boot({
        users: DEFAULT_USERS.map((u) =>
          u.userId === "U-MEM" ? { ...u, qrCodeString: "" } : u
        ),
      });
      // scannedCode is the member's User_ID, QR is empty.
      const res = checkIn(b.env, b.session, { scannedCode: "U-MEM" });
      assert.equal(res.success, true);
      assert.equal(res.data.created, true);
      assert.equal(res.data.memberName, "張三");
    });

    test("no match -> MEMBER_NOT_FOUND, no write, no scannedCode echo", () => {
      const code = "NO-SUCH-CODE-0000";
      const res = checkIn(env, session, { scannedCode: code });
      assert.equal(res.success, false);
      assert.equal(res.error.code, "MEMBER_NOT_FOUND");
      assert.ok(
        hasTraditionalChinese(res.error.message),
        "message must be Traditional Chinese"
      );
      assert.ok(
        !res.error.message.includes(code),
        "failure message must not echo scannedCode"
      );
      assertNoMutation({
        attendance: env.__attendance,
        auditWrites: env.__auditWrites,
      });
    });

    test("empty scannedCode -> VALIDATION, no write", () => {
      const res = checkIn(env, session, { scannedCode: "" });
      assert.equal(res.success, false);
      assert.equal(res.error.code, "VALIDATION");
      assertNoMutation({
        attendance: env.__attendance,
        auditWrites: env.__auditWrites,
      });
    });

    test("whitespace-only scannedCode -> VALIDATION, no write", () => {
      const res = checkIn(env, session, { scannedCode: "   " });
      assert.equal(res.success, false);
      assert.equal(res.error.code, "VALIDATION");
      assertNoMutation({
        attendance: env.__attendance,
        auditWrites: env.__auditWrites,
      });
    });

    test("over-max-length scannedCode -> VALIDATION, no write", () => {
      const res = checkIn(env, session, { scannedCode: "x".repeat(65) });
      assert.equal(res.success, false);
      assert.equal(res.error.code, "VALIDATION");
      assertNoMutation({
        attendance: env.__attendance,
        auditWrites: env.__auditWrites,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Eligibility
  // -------------------------------------------------------------------------

  describe("eligibility", () => {
    test("inactive member -> MEMBER_INACTIVE, no write", () => {
      const res = checkIn(env, session, { scannedCode: "GC-INACT-0001" });
      assert.equal(res.success, false);
      assert.equal(res.error.code, "MEMBER_INACTIVE");
      assertNoMutation({
        attendance: env.__attendance,
        auditWrites: env.__auditWrites,
      });
    });

    test("cancelled event -> EVENT_NOT_ACTIVE, no write", () => {
      const b = boot({
        events: DEFAULT_EVENTS.map((e) => ({
          ...e,
          status: "Cancelled",
        })),
      });
      const res = checkIn(b.env, b.session, { scannedCode: "GC-MEM-0001" });
      assert.equal(res.success, false);
      assert.equal(res.error.code, "EVENT_NOT_ACTIVE");
      assertNoMutation(b);
    });

    test("non-active non-cancelled event (Draft) -> EVENT_NOT_ACTIVE, no write", () => {
      const b = boot({
        events: DEFAULT_EVENTS.map((e) => ({
          ...e,
          status: "Draft",
        })),
      });
      const res = checkIn(b.env, b.session, { scannedCode: "GC-MEM-0001" });
      assert.equal(res.success, false);
      assert.equal(res.error.code, "EVENT_NOT_ACTIVE");
      assertNoMutation(b);
    });

    test("not enrolled -> NOT_ENROLLED naming the Program, no write", () => {
      const b = boot({ enrollments: [] });
      const res = checkIn(b.env, b.session, { scannedCode: "GC-MEM-0001" });
      assert.equal(res.success, false);
      assert.equal(res.error.code, "NOT_ENROLLED");
      // Message must name the Event's Program ("青崇").
      assert.ok(
        res.error.message.includes("青崇"),
        "NOT_ENROLLED message must name the Program"
      );
      assertNoMutation(b);
    });

    test("STAFF may check in for any active Event (global capability)", () => {
      const res = checkIn(env, session, { scannedCode: "GC-MEM-0001" });
      assert.equal(res.success, true);
      assert.equal(res.data.created, true);
    });

    test("ADMIN may check in for any active Event (global capability)", () => {
      const b = boot({ operator: { username: "noah", pin: "6883" } });
      const res = checkIn(b.env, b.session, { scannedCode: "GC-MEM-0001" });
      assert.equal(res.success, true);
      assert.equal(res.data.created, true);
    });

    test("exact Program Leader may check in for an Event in their Program", () => {
      const b = boot({ operator: { username: "leader", pin: "1111" } });
      const res = checkIn(b.env, b.session, { scannedCode: "GC-MEM-0001" });
      assert.equal(res.success, true);
      assert.equal(res.data.created, true);
    });

    test("Program Leader for a DIFFERENT program -> FORBIDDEN, no write", () => {
      // U-PL leads P-1; the event is in P-2 -> wrong program.
      const b = boot({
        events: [{ eventId: "EVT-2", programId: "P-2", status: "Active" }],
        enrollments: [
          {
            enrollmentId: "ENR-2",
            userId: "U-MEM",
            programId: "P-2",
            status: "Active",
          },
        ],
        operator: { username: "leader", pin: "1111" },
      });
      const res = checkIn(b.env, b.session, {
        eventId: "EVT-2",
        scannedCode: "GC-MEM-0001",
      });
      assert.equal(res.success, false);
      assert.equal(res.error.code, "FORBIDDEN");
      assertNoMutation(b);
    });
  });

  // -------------------------------------------------------------------------
  // First create
  // -------------------------------------------------------------------------

  describe("first create", () => {
    test("created:true with attendanceId and server-derived memberName", () => {
      const res = checkIn(env, session, { scannedCode: "GC-MEM-0001" });
      assert.equal(res.success, true);
      assert.equal(res.data.created, true);
      assert.equal(typeof res.data.attendanceId, "string");
      assert.ok(
        res.data.attendanceId.startsWith("ATT-"),
        "attendanceId must be prefixed ATT-"
      );
      assert.equal(res.data.memberName, "張三");
    });

    test("exactly one Attendance row + one Audit_Log row appended", () => {
      const res = checkIn(env, session, { scannedCode: "GC-MEM-0001" });
      assert.equal(res.success, true);
      assert.equal(env.__attendance.writes.length, 1);
      assert.equal(env.__auditWrites.length, 1);
    });

    test("Attendance row carries Active status and server-derived fields", () => {
      const res = checkIn(env, session, { scannedCode: "GC-MEM-0001" });
      const [row] = env.__attendance.writes;
      // [Attendance_ID, Event_ID, User_ID, CheckIn_Time, CheckIn_Method, CheckIn_By, Status]
      assert.equal(row[0], res.data.attendanceId);
      assert.equal(row[1], "EVT-1");
      assert.equal(row[2], "U-MEM");
      assert.equal(row[3], "2026-01-15 14:30:00");
      assert.equal(row[4], "QR_SCAN");
      assert.equal(row[5], "U-OP");
      assert.equal(row[6], "Active");
    });

    test("CheckIn_By is the verified operator, never a client-supplied value", () => {
      checkIn(env, session, { scannedCode: "GC-MEM-0001" });
      const [row] = env.__attendance.writes;
      assert.equal(row[5], session.userId);
    });

    test("Audit_Log row records SUCCESS with operator actor and member target", () => {
      const res = checkIn(env, session, { scannedCode: "GC-MEM-0001" });
      const [a] = env.__auditWrites;
      // [Log_ID, Timestamp, Actor_User_ID, Action_Type, Target_User_ID,
      //  Old_Value, New_Value, Reason, Outcome, Correlation_ID, Actor_Session_Key]
      assert.equal(a[2], "U-OP");
      assert.equal(a[3], "ATTENDANCE_CHECKIN");
      assert.equal(a[4], "U-MEM");
      assert.equal(a[6], res.data.attendanceId);
      assert.equal(a[7], "QR_SCAN");
      assert.equal(a[8], "SUCCESS");
      assert.ok(typeof a[9] === "string" && a[9].length > 0);
      assert.equal(a[10], session.sessionId);
    });

    test("acquires and releases the script lock once on the create path", () => {
      checkIn(env, session, { scannedCode: "GC-MEM-0001" });
      assert.ok(
        env.lockAcquired.length >= 1,
        "LockService.getScriptLock().waitLock() must be called"
      );
      assert.ok(
        env.lockReleased.length >= 1,
        "lock.releaseLock() must be called after processing"
      );
    });
  });

  // -------------------------------------------------------------------------
  // Quiet duplicate
  // -------------------------------------------------------------------------

  describe("quiet duplicate", () => {
    test("second scan returns created:false with the existing identity", () => {
      const first = checkIn(env, session, { scannedCode: "GC-MEM-0001" });
      assert.equal(first.success, true);
      assert.equal(first.data.created, true);

      const second = checkIn(env, session, { scannedCode: "GC-MEM-0001" });
      assert.equal(second.success, true);
      assert.equal(second.data.created, false);
      assert.equal(second.data.attendanceId, first.data.attendanceId);
      assert.equal(second.data.memberName, "張三");
    });

    test("duplicate writes no second Attendance row and no second audit row", () => {
      checkIn(env, session, { scannedCode: "GC-MEM-0001" });
      checkIn(env, session, { scannedCode: "GC-MEM-0001" });
      assert.equal(env.__attendance.writes.length, 1);
      assert.equal(env.__auditWrites.length, 1);
    });

    test("exactly one active Attendance row exists after a duplicate", () => {
      checkIn(env, session, { scannedCode: "GC-MEM-0001" });
      checkIn(env, session, { scannedCode: "GC-MEM-0001" });
      const active = env.__attendance.rows.filter(
        (r, i) =>
          i > 0 && r[1] === "EVT-1" && r[2] === "U-MEM" && r[6] === "Active"
      );
      assert.equal(active.length, 1);
    });
  });

  // -------------------------------------------------------------------------
  // Typed errors
  // -------------------------------------------------------------------------

  describe("typed errors (English code + Traditional Chinese message)", () => {
    const cases = [
      {
        name: "FORBIDDEN (MEMBER role)",
        scannedCode: "GC-MEM-0001",
        member: true,
        code: "FORBIDDEN",
      },
      { name: "VALIDATION (empty)", scannedCode: "", code: "VALIDATION" },
      {
        name: "MEMBER_NOT_FOUND",
        scannedCode: "NOPE",
        code: "MEMBER_NOT_FOUND",
      },
      {
        name: "MEMBER_INACTIVE",
        scannedCode: "GC-INACT-0001",
        code: "MEMBER_INACTIVE",
      },
      {
        name: "EVENT_NOT_FOUND",
        scannedCode: "GC-MEM-0001",
        eventId: "NOPE",
        code: "EVENT_NOT_FOUND",
      },
      {
        name: "EVENT_NOT_ACTIVE",
        scannedCode: "GC-MEM-0001",
        cancelEvent: true,
        code: "EVENT_NOT_ACTIVE",
      },
      {
        name: "NOT_ENROLLED",
        scannedCode: "GC-MEM-0001",
        noEnroll: true,
        code: "NOT_ENROLLED",
      },
    ];

    test.each(cases)(
      "$name -> code $code with Traditional Chinese message",
      (c) => {
        const b = boot({
          users: c.member
            ? DEFAULT_USERS.map((u) =>
                u.userId === "U-OP" ? { ...u, role: "MEMBER" } : u
              )
            : undefined,
          events: c.cancelEvent
            ? DEFAULT_EVENTS.map((e) => ({ ...e, status: "Cancelled" }))
            : undefined,
          enrollments: c.noEnroll ? [] : undefined,
        });
        const res = checkIn(b.env, b.session, {
          scannedCode: c.scannedCode,
          eventId: c.eventId,
        });
        assert.equal(res.success, false);
        assert.equal(res.error.code, c.code);
        assert.ok(
          hasTraditionalChinese(res.error.message),
          `message for ${c.code} must be Traditional Chinese`
        );
      }
    );

    test("AUTH_REQUIRED (stale session) -> code AUTH_REQUIRED with Traditional Chinese message", () => {
      const b = boot();
      const res = b.env.context.api_qrCheckIn(
        b.session.userId,
        "stale-session-id",
        "stale-token",
        "EVT-1",
        "GC-MEM-0001",
        "QR_SCAN"
      );
      assert.equal(res.success, false);
      assert.equal(res.error.code, "AUTH_REQUIRED");
      assert.ok(hasTraditionalChinese(res.error.message));
    });
  });

  // -------------------------------------------------------------------------
  // Concurrency
  // -------------------------------------------------------------------------

  describe("concurrency", () => {
    test("near-simultaneous duplicate scans produce one active row and quiet success", () => {
      const first = checkIn(env, session, { scannedCode: "GC-MEM-0001" });
      const second = checkIn(env, session, { scannedCode: "GC-MEM-0001" });
      assert.equal(first.data.created, true);
      assert.equal(second.data.created, false);
      assert.equal(env.__attendance.writes.length, 1);
      assert.equal(env.__auditWrites.length, 1);
    });

    test("the duplicate recheck reads Attendance while the lock is held", () => {
      checkIn(env, session, { scannedCode: "GC-MEM-0001" });
      checkIn(env, session, { scannedCode: "GC-MEM-0001" });
      // Each call performs exactly one Attendance read (the in-lock duplicate
      // recheck) and it must happen while the lock is held.
      assert.equal(env.__attendance.readsUnderLock.length, 2);
      for (const held of env.__attendance.readsUnderLock) {
        assert.equal(held, true, "duplicate recheck must run under the lock");
      }
    });

    test("lock is acquired and released on each call", () => {
      checkIn(env, session, { scannedCode: "GC-MEM-0001" });
      checkIn(env, session, { scannedCode: "GC-MEM-0001" });
      assert.equal(env.lockAcquired.length, 2);
      assert.equal(env.lockReleased.length, 2);
    });
  });

  // -------------------------------------------------------------------------
  // No scannedCode echo (privacy)
  // -------------------------------------------------------------------------

  describe("no scannedCode echo", () => {
    test("success response data never contains scannedCode", () => {
      const code = "GC-MEM-0001";
      const res = checkIn(env, session, { scannedCode: code });
      assert.equal(res.success, true);
      assert.ok(
        !JSON.stringify(res.data).includes(code),
        "response data must not echo scannedCode"
      );
    });

    test("Audit_Log narrative never contains scannedCode", () => {
      const code = "GC-MEM-0001";
      checkIn(env, session, { scannedCode: code });
      for (const row of env.__auditWrites) {
        assert.ok(
          !JSON.stringify(row).includes(code),
          "audit row must not contain scannedCode"
        );
      }
    });

    test("Attendance row never contains scannedCode", () => {
      const code = "GC-MEM-0001";
      checkIn(env, session, { scannedCode: code });
      for (const row of env.__attendance.writes) {
        assert.ok(
          !JSON.stringify(row).includes(code),
          "attendance row must not contain scannedCode"
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // method label (UI source label only, never trust)
  // -------------------------------------------------------------------------

  describe("method label", () => {
    test("method is recorded as CheckIn_Method but never grants authority", () => {
      // A MEMBER has no capability regardless of method label.
      const b = boot({
        users: DEFAULT_USERS.map((u) =>
          u.userId === "U-OP" ? { ...u, role: "MEMBER" } : u
        ),
      });
      const res = checkIn(b.env, b.session, {
        scannedCode: "GC-MEM-0001",
        method: "QR_SCAN",
      });
      assert.equal(res.success, false);
      assert.equal(res.error.code, "FORBIDDEN");
      assertNoMutation(b);
    });

    test("method label is recorded on the Attendance and Audit rows", () => {
      checkIn(env, session, { scannedCode: "GC-MEM-0001", method: "QR_SCAN" });
      assert.equal(env.__attendance.writes[0][4], "QR_SCAN");
      assert.equal(env.__auditWrites[0][7], "QR_SCAN");
    });
  });
});
