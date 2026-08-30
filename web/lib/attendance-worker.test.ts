import assert from "node:assert/strict";

import { env } from "cloudflare:workers";
import { beforeAll, describe, test, vi } from "vitest";

import worker from "../worker";
import type { Env } from "../worker";
import { importLegacyUsers } from "./auth/accounts";
import { ACCESS_COOKIE_NAME } from "./auth/cookies";
import { applyMigrations, testDb } from "./auth/test-bootstrap";
import { completeCredentialUpgrade } from "./auth/upgrade";

const HOST = "https://efcc.example";
const SECRET = "test-access-token-secret";
const PROGRAM = "ATT-PROGRAM";
const PROGRAM2 = "ATT-PROGRAM-2";
const EMPTY_PROGRAM = "ATT-PROGRAM-EMPTY";
const EVENT = "ATT-EVENT";
const CANCELLED_EVENT = "ATT-EVENT-CANCELLED";
const QR_EVENT = "ATT-EVENT-QR";
const CLOSED_EVENT = "ATT-EVENT-CLOSED";
const INACTIVE_EVENT = "ATT-EVENT-INACTIVE";
const LONG_CODE_EVENT = "ATT-EVENT-LONGCODE";
const BOUNDARY_EVENT = "ATT-EVENT-BOUNDARY";
const PROGRAM_IDENTITY = "ATT-PROGRAM-IDENTITY";
const DEPARTMENT_IDENTITY = "ATT-DEPARTMENT-IDENTITY";

function testEnv(): Env {
  return {
    ...(env as unknown as Env),
    EFCC_ACCESS_TOKEN_SECRET: SECRET,
  };
}

function request(path: string, init: RequestInit = {}): Request {
  return new Request(`${HOST}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

async function accessCookieFor(
  username: string,
  password: string
): Promise<string> {
  const response = await worker.fetch(
    request("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
    testEnv()
  );
  assert.strictEqual(response.status, 200);
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith(`${ACCESS_COOKIE_NAME}=`));
  assert.ok(cookie);
  return cookie.split(";")[0].slice(ACCESS_COOKIE_NAME.length + 1);
}

async function assignIdentity(
  roleDefinitionId: string,
  accountUserId: string,
  assignmentId = crypto.randomUUID(),
  revokedAt: string | null = null
): Promise<void> {
  const now = new Date().toISOString();
  await testDb()
    .prepare(
      `INSERT OR IGNORE INTO role_assignments
        (assignment_id, account_user_id, role_definition_id, granted_by,
         granted_at, scope_kind, scope_id, revoked_by, revoked_at, revoke_reason)
       SELECT ?, ?, role_definition_id, 'ATT-ADMIN', ?, scope_kind, scope_id,
              CASE WHEN ? IS NULL THEN NULL ELSE 'ATT-ADMIN' END, ?, NULL
         FROM role_definitions
        WHERE role_definition_id = ?`
    )
    .bind(
      assignmentId,
      accountUserId,
      now,
      revokedAt,
      revokedAt,
      roleDefinitionId
    )
    .run();
}

async function ensureAdminIdentity(): Promise<void> {
  const now = new Date().toISOString();
  await testDb()
    .prepare(
      `INSERT OR IGNORE INTO role_definitions
        (role_definition_id, category_key, stable_key, label, description,
         scope_kind, scope_id, position, is_protected, is_archived,
         created_by, created_at, updated_by, updated_at)
       VALUES ('ATT-ADMIN-IDENTITY', 'Global', 'admin', '系統管理員',
               'Attendance test administrator', 'Global', NULL, 0, 1, 0,
               NULL, ?, NULL, ?)`
    )
    .bind(now, now)
    .run();
  await assignIdentity(
    "ATT-ADMIN-IDENTITY",
    "ATT-ADMIN",
    "ATT-ADMIN-ASSIGNMENT"
  );
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function assertNoGuestLeakage(body: Record<string, unknown>): void {
  assert.strictEqual("attendances" in body, false);
  assert.strictEqual("guest_name" in body, false);
  assert.strictEqual("guest_phone" in body, false);
  assert.strictEqual("guest_phone_normalized" in body, false);
}

describe("attendance Worker routes", () => {
  beforeAll(async () => {
    await applyMigrations();
    await importLegacyUsers(testDb(), [
      ["User_ID", "Name", "Username", "PIN_Code", "System_Role", "Status"],
      ["ATT-ADMIN", "Attendance Admin", "att-admin", "1234", "Admin", "Active"],
      [
        "ATT-MEMBER",
        "Attendance Member",
        "att-member",
        "5678",
        "Member",
        "Active",
      ],
      [
        "ATT-INACTIVE",
        "Inactive Member",
        "att-inactive",
        "9999",
        "Member",
        "Deactivated",
      ],
    ]);
    await ensureAdminIdentity();
    await completeCredentialUpgrade(testDb(), {
      userId: "ATT-ADMIN",
      legacyPin: "1234",
      newCredential: "att-admin-password",
    });
    await completeCredentialUpgrade(testDb(), {
      userId: "ATT-MEMBER",
      legacyPin: "5678",
      newCredential: "att-member-password",
    });
    await testDb()
      .prepare(`UPDATE accounts SET qr_code_string = ? WHERE user_id = ?`)
      .bind("ATT-MEMBER-QR", "ATT-MEMBER")
      .run();
    const now = new Date();
    const start = new Date(now.getTime() - 30 * 60_000).toISOString();
    const end = new Date(now.getTime() + 30 * 60_000).toISOString();
    await testDb()
      .prepare(
        `INSERT INTO programs
        (program_id, department_id, name, behavior_type, lifecycle, discoverability,
         enrollment_mode, check_in_token, created_at, updated_at)
       VALUES (?, ?, ?, 'OneOff', 'Active', 'Listed', 'MemberRequest', ?, ?, ?)`
      )
      .bind(
        PROGRAM,
        "018f3b8a-0000-7000-8000-000000000001",
        "Attendance Test",
        "ATTENDANCE-PROGRAM-TOKEN",
        now.toISOString(),
        now.toISOString()
      )
      .run();
    await testDb()
      .prepare(
        `INSERT INTO events
        (event_id, program_id, starts_at, ends_at, status, source,
         manual_check_in_code, check_in_window_opens_at, check_in_window_closes_at,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Active', 'MANUAL', ?, ?, ?, ?, ?)`
      )
      .bind(
        EVENT,
        PROGRAM,
        start,
        end,
        "ATT1234",
        new Date(now.getTime() - 60 * 60_000).toISOString(),
        new Date(now.getTime() + 60 * 60_000).toISOString(),
        now.toISOString(),
        now.toISOString()
      )
      .run();
    await testDb()
      .prepare(`UPDATE events SET name = ?, location = ? WHERE event_id = ?`)
      .bind("週六團契", "主堂", EVENT)
      .run();
    await testDb()
      .prepare(
        `INSERT INTO events
        (event_id, program_id, starts_at, ends_at, status, availability, source,
         manual_check_in_code, check_in_window_opens_at, check_in_window_closes_at,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Active', 'Inactive', 'MANUAL', ?, ?, ?, ?, ?)`
      )
      .bind(
        INACTIVE_EVENT,
        PROGRAM,
        new Date(now.getTime() - 15 * 60_000).toISOString(),
        new Date(now.getTime() + 45 * 60_000).toISOString(),
        "ATTINACTIVE",
        new Date(now.getTime() - 60 * 60_000).toISOString(),
        new Date(now.getTime() + 60 * 60_000).toISOString(),
        now.toISOString(),
        now.toISOString()
      )
      .run();
    await testDb()
      .prepare(
        `INSERT INTO events
        (event_id, program_id, starts_at, ends_at, status, source,
         manual_check_in_code, check_in_window_opens_at, check_in_window_closes_at,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Cancelled', 'MANUAL', ?, ?, ?, ?, ?)`
      )
      .bind(
        CANCELLED_EVENT,
        PROGRAM,
        new Date(now.getTime() - 90 * 60_000).toISOString(),
        new Date(now.getTime() - 30 * 60_000).toISOString(),
        "ATTCANCEL",
        new Date(now.getTime() - 150 * 60_000).toISOString(),
        new Date(now.getTime() - 30 * 60_000).toISOString(),
        now.toISOString(),
        now.toISOString()
      )
      .run();
    await testDb()
      .prepare(
        `INSERT INTO events
        (event_id, program_id, starts_at, ends_at, status, source,
         manual_check_in_code, check_in_window_opens_at, check_in_window_closes_at,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Active', 'MANUAL', ?, ?, ?, ?, ?)`
      )
      .bind(
        QR_EVENT,
        PROGRAM,
        new Date(now.getTime() - 60 * 60_000).toISOString(),
        new Date(now.getTime() + 30 * 60_000).toISOString(),
        "ATTQRCODE",
        new Date(now.getTime() - 120 * 60_000).toISOString(),
        new Date(now.getTime() + 30 * 60_000).toISOString(),
        now.toISOString(),
        now.toISOString()
      )
      .run();
    await testDb()
      .prepare(
        `INSERT INTO events
        (event_id, program_id, starts_at, ends_at, status, source,
         manual_check_in_code, check_in_window_opens_at, check_in_window_closes_at,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Active', 'MANUAL', ?, ?, ?, ?, ?)`
      )
      .bind(
        CLOSED_EVENT,
        PROGRAM,
        new Date(now.getTime() - 150 * 60_000).toISOString(),
        new Date(now.getTime() - 120 * 60_000).toISOString(),
        "ATTCLOSED",
        new Date(now.getTime() - 180 * 60_000).toISOString(),
        new Date(now.getTime() - 120 * 60_000).toISOString(),
        now.toISOString(),
        now.toISOString()
      )
      .run();
    await testDb()
      .prepare(
        `INSERT INTO events
        (event_id, program_id, starts_at, ends_at, status, source,
         manual_check_in_code, check_in_window_opens_at, check_in_window_closes_at,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Active', 'MANUAL', ?, ?, ?, ?, ?)`
      )
      .bind(
        LONG_CODE_EVENT,
        PROGRAM,
        new Date(now.getTime() - 45 * 60_000).toISOString(),
        new Date(now.getTime() + 60 * 60_000).toISOString(),
        "ATTLONGCODE",
        new Date(now.getTime() - 60 * 60_000).toISOString(),
        new Date(now.getTime() + 90 * 60_000).toISOString(),
        now.toISOString(),
        now.toISOString()
      )
      .run();
    await testDb()
      .prepare(
        `INSERT INTO programs
        (program_id, department_id, name, behavior_type, lifecycle, discoverability,
         enrollment_mode, check_in_token, created_at, updated_at)
       VALUES (?, ?, ?, 'OneOff', 'Active', 'Listed', 'MemberRequest', ?, ?, ?)`
      )
      .bind(
        PROGRAM2,
        "018f3b8a-0000-7000-8000-000000000002",
        "Attendance Test Two",
        "ATTENDANCE-PROGRAM-TOKEN-2",
        now.toISOString(),
        now.toISOString()
      )
      .run();
    await testDb()
      .prepare(
        `INSERT INTO programs
        (program_id, department_id, name, behavior_type, lifecycle, discoverability,
         enrollment_mode, check_in_token, created_at, updated_at)
       VALUES (?, ?, ?, 'OneOff', 'Active', 'Listed', 'MemberRequest', ?, ?, ?)`
      )
      .bind(
        EMPTY_PROGRAM,
        "018f3b8a-0000-7000-8000-000000000003",
        "Attendance Test Empty",
        "ATTENDANCE-PROGRAM-TOKEN-EMPTY",
        now.toISOString(),
        now.toISOString()
      )
      .run();
    await testDb()
      .prepare(
        `INSERT INTO events
        (event_id, program_id, starts_at, ends_at, status, source,
         manual_check_in_code, check_in_window_opens_at, check_in_window_closes_at,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Active', 'MANUAL', ?, ?, ?, ?, ?)`
      )
      .bind(
        "ATT-P2-ACTIVE-CLOSED",
        PROGRAM2,
        new Date(now.getTime() - 150 * 60_000).toISOString(),
        new Date(now.getTime() - 120 * 60_000).toISOString(),
        "ATTP2A",
        new Date(now.getTime() - 180 * 60_000).toISOString(),
        new Date(now.getTime() - 120 * 60_000).toISOString(),
        now.toISOString(),
        now.toISOString()
      )
      .run();
    await testDb()
      .prepare(
        `INSERT INTO events
        (event_id, program_id, starts_at, ends_at, status, source,
         manual_check_in_code, check_in_window_opens_at, check_in_window_closes_at,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Cancelled', 'MANUAL', ?, ?, ?, ?, ?)`
      )
      .bind(
        "ATT-P2-CANCELLED",
        PROGRAM2,
        new Date(now.getTime() - 90 * 60_000).toISOString(),
        new Date(now.getTime() - 60 * 60_000).toISOString(),
        "ATTP2B",
        new Date(now.getTime() - 120 * 60_000).toISOString(),
        new Date(now.getTime() - 60 * 60_000).toISOString(),
        now.toISOString(),
        now.toISOString()
      )
      .run();
    await testDb()
      .prepare(
        `INSERT INTO enrollments
        (enrollment_id, program_id, member_user_id, status, enrolled_at, created_at)
       VALUES (?, ?, ?, 'Active', ?, ?)`
      )
      .bind(
        "ATT-ENROLLMENT",
        PROGRAM,
        "ATT-MEMBER",
        now.toISOString(),
        now.toISOString()
      )
      .run();
    await testDb()
      .prepare(
        `INSERT INTO enrollments
        (enrollment_id, program_id, member_user_id, status, enrolled_at, created_at)
       VALUES (?, ?, ?, 'Active', ?, ?)`
      )
      .bind(
        "ATT-INACTIVE-ENROLLMENT",
        PROGRAM,
        "ATT-INACTIVE",
        now.toISOString(),
        now.toISOString()
      )
      .run();
    await testDb().batch([
      testDb()
        .prepare(
          `INSERT OR IGNORE INTO role_definitions
            (role_definition_id, category_key, stable_key, label, description,
             scope_kind, scope_id, position, is_protected, is_archived,
             created_by, created_at, updated_by, updated_at)
           VALUES (?, 'Program', ?, ?, ?, 'Program', ?, 30, 0, 0, NULL, ?, NULL, ?)`
        )
        .bind(
          PROGRAM_IDENTITY,
          "test.attendance.program",
          "Attendance Program Operator",
          "Attendance test operator",
          PROGRAM,
          new Date().toISOString(),
          new Date().toISOString()
        ),
      testDb()
        .prepare(
          `INSERT OR IGNORE INTO role_definitions
            (role_definition_id, category_key, stable_key, label, description,
             scope_kind, scope_id, position, is_protected, is_archived,
             created_by, created_at, updated_by, updated_at)
           VALUES (?, 'Department', ?, ?, ?, 'Department', ?, 31, 0, 0, NULL, ?, NULL, ?)`
        )
        .bind(
          DEPARTMENT_IDENTITY,
          "test.attendance.department",
          "Attendance Department Operator",
          "Attendance test department operator",
          "018f3b8a-0000-7000-8000-000000000001",
          new Date().toISOString(),
          new Date().toISOString()
        ),
      testDb()
        .prepare(
          `INSERT OR IGNORE INTO role_definition_grants
            (role_definition_id, capability, granted_by, granted_at)
           VALUES (?, 'program.manage', 'ATT-ADMIN', ?)`
        )
        .bind(PROGRAM_IDENTITY, new Date().toISOString()),
      testDb()
        .prepare(
          `INSERT OR IGNORE INTO role_definition_grants
            (role_definition_id, capability, granted_by, granted_at)
           VALUES (?, 'program.manage', 'ATT-ADMIN', ?)`
        )
        .bind(DEPARTMENT_IDENTITY, new Date().toISOString()),
    ]);
  });

  test("resolves both permanent Program QR token and Event manual code", async () => {
    const qr = await worker.fetch(
      request(
        "/api/v1/attendance/resolve?program_token=ATTENDANCE-PROGRAM-TOKEN"
      ),
      testEnv()
    );
    assert.strictEqual(qr.status, 200);
    const qrBody = await json(qr);
    const qrBodyData = qrBody.data as {
      events: {
        event_id: string;
        name: string | null;
        location: string | null;
      }[];
    };
    assert.ok(qrBodyData.events.length >= 1);
    const namedEvent = qrBodyData.events.find(
      (event) => event.event_id === EVENT
    );
    assert.strictEqual(namedEvent?.name, "週六團契");
    assert.strictEqual(namedEvent?.location, "主堂");

    const manual = await worker.fetch(
      request("/api/v1/attendance/resolve?manual_code=ATT1234"),
      testEnv()
    );
    assert.strictEqual(manual.status, 200);
  });

  test("valid Program token with no Events resolves to an empty eligible list", async () => {
    const response = await worker.fetch(
      request(
        "/api/v1/attendance/resolve?program_token=ATTENDANCE-PROGRAM-TOKEN-EMPTY"
      ),
      testEnv()
    );
    assert.strictEqual(response.status, 200);
    const body = await json(response);
    assert.deepStrictEqual((body.data as { events: unknown[] }).events, []);
  });

  test("self check-in is enrolled-only and idempotent", async () => {
    const access = await accessCookieFor("att-member", "att-member-password");
    const init = {
      method: "POST",
      headers: { Cookie: `${ACCESS_COOKIE_NAME}=${access}` },
      body: JSON.stringify({
        event_id: EVENT,
        method: "self_manual_code",
        manual_code: "ATT1234",
      }),
    };
    const first = await worker.fetch(
      request("/api/v1/attendance/self", init),
      testEnv()
    );
    assert.strictEqual(first.status, 201);
    const firstBody = await json(first);
    const second = await worker.fetch(
      request("/api/v1/attendance/self", init),
      testEnv()
    );
    assert.strictEqual(second.status, 200);
    const secondBody = await json(second);
    const firstData = firstBody.data as { attendance_id: string };
    const secondData = secondBody.data as Record<string, unknown>;
    // The duplicate shape carries only the neutral outcome; the original
    // record's id is never echoed back (Spec #244 dec 14).
    assert.strictEqual(secondData.outcome, "duplicate");
    assert.deepStrictEqual(Object.keys(secondData).sort(), ["outcome"]);
    assert.ok(firstData.attendance_id);
  });

  test("guest phone forms share a duplicate guard, then void releases it", async () => {
    const payload = {
      event_id: EVENT,
      method: "guest_manual_code",
      manual_code: "ATT1234",
      name: "訪客一",
      phone: "9123 4567",
    };
    const beforeAccounts = await testDb()
      .prepare("SELECT COUNT(*) AS count FROM accounts")
      .first<{ count: number }>();
    const beforeEnrollments = await testDb()
      .prepare("SELECT COUNT(*) AS count FROM enrollments")
      .first<{ count: number }>();

    const first = await worker.fetch(
      request("/api/v1/attendance/guest", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
      testEnv()
    );
    assert.strictEqual(first.status, 201);
    const firstBody = await json(first);
    const attendanceId = (firstBody.data as { attendance_id: string })
      .attendance_id;

    const attendanceRow = await testDb()
      .prepare(
        "SELECT member_user_id, guest_name, guest_phone, guest_phone_normalized FROM attendances WHERE attendance_id = ?"
      )
      .bind(attendanceId)
      .first<{
        member_user_id: string | null;
        guest_name: string;
        guest_phone: string;
        guest_phone_normalized: string;
      }>();
    assert.strictEqual(attendanceRow?.member_user_id, null);
    assert.strictEqual(attendanceRow?.guest_name, "訪客一");
    assert.strictEqual(attendanceRow?.guest_phone_normalized, "hk:85291234567");

    const afterAccounts = await testDb()
      .prepare("SELECT COUNT(*) AS count FROM accounts")
      .first<{ count: number }>();
    const afterEnrollments = await testDb()
      .prepare("SELECT COUNT(*) AS count FROM enrollments")
      .first<{ count: number }>();
    assert.strictEqual(afterAccounts?.count, beforeAccounts?.count);
    assert.strictEqual(afterEnrollments?.count, beforeEnrollments?.count);
    const duplicate = await worker.fetch(
      request("/api/v1/attendance/guest", {
        method: "POST",
        body: JSON.stringify({ ...payload, phone: "+852 9123-4567" }),
      }),
      testEnv()
    );
    // Guests share the member duplicate shape (200 + outcome) so the panel
    // renders the neutral already-done notice, not an error (regression:
    // the guest path used to throw 409 DUPLICATE_ATTENDANCE).
    assert.strictEqual(duplicate.status, 200);
    const duplicateBody = await json(duplicate);
    const duplicateData = duplicateBody.data as Record<string, unknown>;
    assert.strictEqual(duplicateData.outcome, "duplicate");
    // Duplicate response reveals no attendee identity, submission time, or
    // the existing record's id (Spec #244 dec 14 / #259 AC4). The void below
    // targets the id captured from the FIRST (201) response instead.
    assert.deepStrictEqual(Object.keys(duplicateData).sort(), ["outcome"]);
    const unrelatedRowId = "ATT-UNRELATED-ATTENDANCE-PRESERVED";
    const now = new Date().toISOString();
    await testDb()
      .prepare(
        `INSERT INTO attendances
          (attendance_id, event_id, member_user_id, guest_name, guest_phone,
           guest_phone_normalized, method, status, checked_in_at, checked_in_by)
         VALUES (?, ?, NULL, '無關出席紀錄', '6123 9999', 'hk:85261239999', 'guest_manual_code', 'Active', ?, NULL)`
      )
      .bind(unrelatedRowId, EVENT, now)
      .run();

    try {
      const beforeVoidEnrollments = await testDb()
        .prepare("SELECT * FROM enrollments ORDER BY enrollment_id ASC")
        .all();
      const admin = await accessCookieFor("att-admin", "att-admin-password");
      const voided = await worker.fetch(
        request(`/api/v1/attendance/${attendanceId}/void`, {
          method: "POST",
          headers: { Cookie: `${ACCESS_COOKIE_NAME}=${admin}` },
          body: JSON.stringify({ reason: "輸入錯誤" }),
        }),
        testEnv()
      );
      assert.strictEqual(voided.status, 200);
      const afterVoidEnrollments = await testDb()
        .prepare("SELECT * FROM enrollments ORDER BY enrollment_id ASC")
        .all();
      assert.deepStrictEqual(
        afterVoidEnrollments.results,
        beforeVoidEnrollments.results
      );
      const unrelatedRow = await testDb()
        .prepare(
          "SELECT status, guest_name, guest_phone FROM attendances WHERE attendance_id = ?"
        )
        .bind(unrelatedRowId)
        .first<{ status: string; guest_name: string; guest_phone: string }>();
      assert.strictEqual(unrelatedRow?.status, "Active");
      assert.strictEqual(unrelatedRow?.guest_name, "無關出席紀錄");
      assert.strictEqual(unrelatedRow?.guest_phone, "6123 9999");

      const retry = await worker.fetch(
        request("/api/v1/attendance/guest", {
          method: "POST",
          body: JSON.stringify({ ...payload, phone: "+852 9123-4567" }),
        }),
        testEnv()
      );
      assert.strictEqual(retry.status, 201);
    } finally {
      await testDb()
        .prepare("DELETE FROM attendances WHERE attendance_id = ?")
        .bind(unrelatedRowId)
        .run();
    }
  });

  test("guest check-in respects rate limiting when limiter rejects", async () => {
    const customEnv: Env = {
      ...testEnv(),
      RPC_RATE_LIMITER: {
        limit: () => Promise.resolve({ success: false }),
      } as unknown as Env["RPC_RATE_LIMITER"],
    };
    const response = await worker.fetch(
      request("/api/v1/attendance/guest", {
        method: "POST",
        body: JSON.stringify({
          event_id: EVENT,
          method: "guest_manual_code",
          manual_code: "ATT1234",
          name: "訪客限流",
          phone: "9111 2222",
        }),
      }),
      customEnv
    );
    assert.strictEqual(response.status, 429);
    const body = await json(response);
    assert.strictEqual(body.code, "RATE_LIMITED");
  });

  test("resolve reports a cancelled Event as latest.status Cancelled", async () => {
    const response = await worker.fetch(
      request("/api/v1/attendance/resolve?manual_code=ATTCANCEL"),
      testEnv()
    );
    assert.strictEqual(response.status, 200);
    const body = await json(response);
    const data = body.data as {
      events: unknown[];
      latest: { status: string; program_id: string; program_name: string };
      enrolled: boolean;
    };
    assert.deepStrictEqual(data.events, []);
    assert.strictEqual(data.latest.status, "Cancelled");
    assert.strictEqual(data.latest.program_id, PROGRAM);
  });

  test("check-in into a cancelled Event is rejected with 410 EVENT_CANCELLED", async () => {
    const response = await worker.fetch(
      request("/api/v1/attendance/guest", {
        method: "POST",
        body: JSON.stringify({
          event_id: CANCELLED_EVENT,
          method: "guest_manual_code",
          manual_code: "ATTCANCEL",
          name: "訪客二",
          phone: "6111 1111",
        }),
      }),
      testEnv()
    );
    assert.strictEqual(response.status, 410);
    const body = await json(response);
    assert.strictEqual(body.code, "EVENT_CANCELLED");
  });

  test("inactive Event is unavailable at resolve and self check-in", async () => {
    const resolved = await worker.fetch(
      request("/api/v1/attendance/resolve?manual_code=ATTINACTIVE"),
      testEnv()
    );
    assert.strictEqual(resolved.status, 200);
    const resolvedBody = await json(resolved);
    const data = resolvedBody.data as {
      events: unknown[];
      latest: { availability: string };
    };
    assert.deepStrictEqual(data.events, []);
    assert.strictEqual(data.latest.availability, "Inactive");

    const member = await accessCookieFor("att-member", "att-member-password");
    const checkIn = await worker.fetch(
      request("/api/v1/attendance/self", {
        method: "POST",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${member}` },
        body: JSON.stringify({
          event_id: INACTIVE_EVENT,
          method: "self_manual_code",
          manual_code: "ATTINACTIVE",
        }),
      }),
      testEnv()
    );
    assert.strictEqual(checkIn.status, 409);
    const checkInBody = await json(checkIn);
    assert.strictEqual(checkInBody.code, "EVENT_UNAVAILABLE");
  });

  test("assisted search and check-in reject inactive and cancelled Events", async () => {
    const admin = await accessCookieFor("att-admin", "att-admin-password");
    const beforeEnrollments = await testDb()
      .prepare("SELECT COUNT(*) AS count FROM enrollments WHERE program_id = ?")
      .bind(PROGRAM)
      .first<{ count: number }>();
    const beforeInactiveAttendances = await testDb()
      .prepare(
        "SELECT COUNT(*) AS count FROM attendances WHERE event_id = ? AND status = 'Active'"
      )
      .bind(INACTIVE_EVENT)
      .first<{ count: number }>();
    const inactiveSearch = await worker.fetch(
      request(
        `/api/v1/attendance/events/${INACTIVE_EVENT}/members?q=ATT-MEMBER-QR`,
        {
          headers: { Cookie: `${ACCESS_COOKIE_NAME}=${admin}` },
        }
      ),
      testEnv()
    );
    assert.strictEqual(inactiveSearch.status, 409);
    const inactiveSearchBody = await json(inactiveSearch);
    assert.strictEqual(inactiveSearchBody.code, "EVENT_UNAVAILABLE");
    const inactiveSearchAudit = await testDb()
      .prepare(
        "SELECT outcome, reason FROM audit_events WHERE correlation_id = ?"
      )
      .bind(inactiveSearchBody.requestId)
      .first<{ outcome: string; reason: string }>();
    assert.strictEqual(inactiveSearchAudit?.outcome, "DENIED");
    assert.strictEqual(inactiveSearchAudit?.reason, "EVENT_UNAVAILABLE");

    const inactiveCheckIn = await worker.fetch(
      request(`/api/v1/attendance/events/${INACTIVE_EVENT}/check-in`, {
        method: "POST",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${admin}` },
        body: JSON.stringify({
          member_user_id: "ATT-MEMBER",
          method: "leader_manual_search",
        }),
      }),
      testEnv()
    );
    assert.strictEqual(inactiveCheckIn.status, 409);
    const inactiveCheckInBody = await json(inactiveCheckIn);
    assert.strictEqual(inactiveCheckInBody.code, "EVENT_UNAVAILABLE");
    const inactiveCheckInAudit = await testDb()
      .prepare(
        "SELECT outcome, reason FROM audit_events WHERE correlation_id = ?"
      )
      .bind(inactiveCheckInBody.requestId)
      .first<{ outcome: string; reason: string }>();
    assert.strictEqual(inactiveCheckInAudit?.outcome, "DENIED");
    assert.strictEqual(inactiveCheckInAudit?.reason, "EVENT_UNAVAILABLE");

    const afterInactiveAttendances = await testDb()
      .prepare(
        "SELECT COUNT(*) AS count FROM attendances WHERE event_id = ? AND status = 'Active'"
      )
      .bind(INACTIVE_EVENT)
      .first<{ count: number }>();
    assert.strictEqual(
      afterInactiveAttendances?.count,
      beforeInactiveAttendances?.count
    );

    const beforeCancelledAttendances = await testDb()
      .prepare(
        "SELECT COUNT(*) AS count FROM attendances WHERE event_id = ? AND status = 'Active'"
      )
      .bind(CANCELLED_EVENT)
      .first<{ count: number }>();
    const cancelledSearch = await worker.fetch(
      request(
        `/api/v1/attendance/events/${CANCELLED_EVENT}/members?q=ATT-MEMBER-QR`,
        {
          headers: { Cookie: `${ACCESS_COOKIE_NAME}=${admin}` },
        }
      ),
      testEnv()
    );
    assert.strictEqual(cancelledSearch.status, 410);
    const cancelledSearchBody = await json(cancelledSearch);
    assert.strictEqual(cancelledSearchBody.code, "EVENT_CANCELLED");
    const cancelledSearchAudit = await testDb()
      .prepare(
        "SELECT outcome, reason FROM audit_events WHERE correlation_id = ?"
      )
      .bind(cancelledSearchBody.requestId)
      .first<{ outcome: string; reason: string }>();
    assert.strictEqual(cancelledSearchAudit?.outcome, "DENIED");
    assert.strictEqual(cancelledSearchAudit?.reason, "EVENT_CANCELLED");

    const cancelledCheckIn = await worker.fetch(
      request(`/api/v1/attendance/events/${CANCELLED_EVENT}/check-in`, {
        method: "POST",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${admin}` },
        body: JSON.stringify({
          member_user_id: "ATT-MEMBER",
          method: "leader_manual_search",
        }),
      }),
      testEnv()
    );
    assert.strictEqual(cancelledCheckIn.status, 410);
    const cancelledCheckInBody = await json(cancelledCheckIn);
    assert.strictEqual(cancelledCheckInBody.code, "EVENT_CANCELLED");
    const cancelledCheckInAudit = await testDb()
      .prepare(
        "SELECT outcome, reason FROM audit_events WHERE correlation_id = ?"
      )
      .bind(cancelledCheckInBody.requestId)
      .first<{ outcome: string; reason: string }>();
    assert.strictEqual(cancelledCheckInAudit?.outcome, "DENIED");
    assert.strictEqual(cancelledCheckInAudit?.reason, "EVENT_CANCELLED");

    const afterCancelledAttendances = await testDb()
      .prepare(
        "SELECT COUNT(*) AS count FROM attendances WHERE event_id = ? AND status = 'Active'"
      )
      .bind(CANCELLED_EVENT)
      .first<{ count: number }>();
    assert.strictEqual(
      afterCancelledAttendances?.count,
      beforeCancelledAttendances?.count
    );

    const afterEnrollments = await testDb()
      .prepare("SELECT COUNT(*) AS count FROM enrollments WHERE program_id = ?")
      .bind(PROGRAM)
      .first<{ count: number }>();
    assert.strictEqual(afterEnrollments?.count, beforeEnrollments?.count);
  });

  test("assisted check-in rejects an enrolled but inactive account", async () => {
    const admin = await accessCookieFor("att-admin", "att-admin-password");
    const response = await worker.fetch(
      request(`/api/v1/attendance/events/${EVENT}/check-in`, {
        method: "POST",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${admin}` },
        body: JSON.stringify({
          member_user_id: "ATT-INACTIVE",
          method: "leader_manual_search",
        }),
      }),
      testEnv()
    );
    assert.strictEqual(response.status, 403);
    const body = await json(response);
    assert.strictEqual(body.code, "FORBIDDEN");
    const row = await testDb()
      .prepare(
        `SELECT 1 FROM attendances WHERE event_id = ? AND member_user_id = ?`
      )
      .bind(EVENT, "ATT-INACTIVE")
      .first();
    assert.strictEqual(row, null);
    const audit = await testDb()
      .prepare(
        "SELECT outcome, reason FROM audit_events WHERE correlation_id = ?"
      )
      .bind(body.requestId)
      .first<{ outcome: string; reason: string }>();
    assert.strictEqual(audit?.outcome, "DENIED");
    assert.strictEqual(audit?.reason, "ACCOUNT_NOT_ACTIVE");
  });

  test("assisted check-in rejects an operator outside the Event Program scope", async () => {
    const member = await accessCookieFor("att-member", "att-member-password");
    const response = await worker.fetch(
      request("/api/v1/attendance/events/ATT-P2-ACTIVE-CLOSED/check-in", {
        method: "POST",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${member}` },
        body: JSON.stringify({
          member_user_id: "ATT-MEMBER",
          method: "leader_manual_search",
        }),
      }),
      testEnv()
    );
    assert.strictEqual(response.status, 403);
    const body = await json(response);
    assert.strictEqual(body.code, "FORBIDDEN");
    const audit = await testDb()
      .prepare(
        "SELECT outcome, reason FROM audit_events WHERE correlation_id = ?"
      )
      .bind(body.requestId)
      .first<{ outcome: string; reason: string }>();
    assert.strictEqual(audit?.outcome, "DENIED");
    assert.strictEqual(audit?.reason, "OUT_OF_SCOPE");
  });

  test("assisted check-in audits an unenrolled member denial", async () => {
    const admin = await accessCookieFor("att-admin", "att-admin-password");
    const response = await worker.fetch(
      request(`/api/v1/attendance/events/${EVENT}/check-in`, {
        method: "POST",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${admin}` },
        body: JSON.stringify({
          member_user_id: "ATT-ADMIN",
          method: "leader_manual_search",
        }),
      }),
      testEnv()
    );
    assert.strictEqual(response.status, 403);
    const body = await json(response);
    assert.strictEqual(body.code, "ENROLLMENT_REQUIRED");
    const audit = await testDb()
      .prepare(
        "SELECT outcome, reason FROM audit_events WHERE correlation_id = ?"
      )
      .bind(body.requestId)
      .first<{ outcome: string; reason: string }>();
    assert.strictEqual(audit?.outcome, "DENIED");
    assert.strictEqual(audit?.reason, "ACTIVE_ENROLLMENT_REQUIRED");
  });

  test("assisted check-in records Attendance without creating Enrollment", async () => {
    const admin = await accessCookieFor("att-admin", "att-admin-password");
    const before = await testDb()
      .prepare("SELECT COUNT(*) AS count FROM enrollments WHERE program_id = ?")
      .bind(PROGRAM)
      .first<{ count: number }>();
    const search = await worker.fetch(
      request(`/api/v1/attendance/events/${QR_EVENT}/members?q=ATT-MEMBER-QR`, {
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${admin}` },
      }),
      testEnv()
    );
    assert.strictEqual(search.status, 200);
    const searchBody = await json(search);
    const { members } = searchBody.data as { members: { user_id: string }[] };
    assert.strictEqual(members.length, 1);
    assert.strictEqual(members[0].user_id, "ATT-MEMBER");
    const checkIn = await worker.fetch(
      request(`/api/v1/attendance/events/${QR_EVENT}/check-in`, {
        method: "POST",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${admin}` },
        body: JSON.stringify({
          member_user_id: "ATT-MEMBER",
          method: "leader_qr_scan",
        }),
      }),
      testEnv()
    );
    assert.strictEqual(checkIn.status, 201);
    const checkInBody = await json(checkIn);
    const assistedId = (checkInBody.data as { attendance_id: string })
      .attendance_id;
    assert.match(
      assistedId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u
    );
    const after = await testDb()
      .prepare("SELECT COUNT(*) AS count FROM enrollments WHERE program_id = ?")
      .bind(PROGRAM)
      .first<{ count: number }>();
    assert.strictEqual(after?.count, before?.count);
  });

  test("assisted member search stays available after the window closes (US 25 recovery)", async () => {
    const admin = await accessCookieFor("att-admin", "att-admin-password");
    const response = await worker.fetch(
      request(
        `/api/v1/attendance/events/${CLOSED_EVENT}/members?q=ATT-MEMBER-QR`,
        {
          headers: { Cookie: `${ACCESS_COOKIE_NAME}=${admin}` },
        }
      ),
      testEnv()
    );
    // Assisted check-in is capability-gated only (Spec 081 L88), so the
    // operator must still be able to find the member for a post-window
    // recording.
    assert.strictEqual(response.status, 200);
    const body = await json(response);
    const { members } = body.data as { members: { user_id: string }[] };
    assert.strictEqual(members.length, 1);
    assert.strictEqual(members[0].user_id, "ATT-MEMBER");
  });

  test("assisted check-in still records attendance after the window closes (US 25 recovery)", async () => {
    const admin = await accessCookieFor("att-admin", "att-admin-password");
    const before = await testDb()
      .prepare(
        "SELECT COUNT(*) AS count FROM attendances WHERE event_id = ? AND status = 'Active'"
      )
      .bind(CLOSED_EVENT)
      .first<{ count: number }>();
    const response = await worker.fetch(
      request(`/api/v1/attendance/events/${CLOSED_EVENT}/check-in`, {
        method: "POST",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${admin}` },
        body: JSON.stringify({
          member_user_id: "ATT-MEMBER",
          method: "leader_manual_search",
        }),
      }),
      testEnv()
    );
    // Assisted check-in is capability-gated only (Spec 081 L88): an operator
    // may record attendance after the window closes (US 25 recovery). This is
    // the regression test for that path — it must record, not reject.
    assert.strictEqual(response.status, 201);
    const after = await testDb()
      .prepare(
        "SELECT COUNT(*) AS count FROM attendances WHERE event_id = ? AND status = 'Active'"
      )
      .bind(CLOSED_EVENT)
      .first<{ count: number }>();
    assert.strictEqual(after?.count, (before?.count ?? 0) + 1);
  });

  test("assisted check-in revalidates the active Program boundary", async () => {
    const admin = await accessCookieFor("att-admin", "att-admin-password");
    await testDb()
      .prepare(
        "UPDATE programs SET lifecycle = 'Archived' WHERE program_id = ?"
      )
      .bind(PROGRAM)
      .run();
    try {
      const response = await worker.fetch(
        request(`/api/v1/attendance/events/${EVENT}/check-in`, {
          method: "POST",
          headers: { Cookie: `${ACCESS_COOKIE_NAME}=${admin}` },
          body: JSON.stringify({
            member_user_id: "ATT-MEMBER",
            method: "leader_manual_search",
          }),
        }),
        testEnv()
      );
      assert.strictEqual(response.status, 403);
      const body = await json(response);
      assert.strictEqual(body.code, "FORBIDDEN");
      const audit = await testDb()
        .prepare(
          "SELECT outcome, reason FROM audit_events WHERE correlation_id = ?"
        )
        .bind(body.requestId)
        .first<{ outcome: string; reason: string }>();
      assert.strictEqual(audit?.outcome, "DENIED");
      assert.strictEqual(audit?.reason, "PROGRAM_INACTIVE");
    } finally {
      await testDb()
        .prepare(
          "UPDATE programs SET lifecycle = 'Active' WHERE program_id = ?"
        )
        .bind(PROGRAM)
        .run();
    }
  });

  test("resolve reports cancelled state deterministically when a token matches mixed-status events", async () => {
    const response = await worker.fetch(
      request(
        "/api/v1/attendance/resolve?program_token=ATTENDANCE-PROGRAM-TOKEN-2"
      ),
      testEnv()
    );
    assert.strictEqual(response.status, 200);
    const body = await json(response);
    const data = body.data as {
      events: unknown[];
      latest: { status: string; program_id: string };
    };
    assert.deepStrictEqual(data.events, []);
    assert.strictEqual(data.latest.status, "Cancelled");
    assert.strictEqual(data.latest.program_id, PROGRAM2);
  });

  test("resolve disambiguates an ambiguous entry server-side, no length heuristic", async () => {
    const response = await worker.fetch(
      request("/api/v1/attendance/resolve?entry=ATTLONGCODE"),
      testEnv()
    );
    assert.strictEqual(response.status, 200);
    const body = await json(response);
    const { events } = body.data as { events: { event_id: string }[] };
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].event_id, LONG_CODE_EVENT);
  });

  test("legacy event chooser preserves historical events for operators", async () => {
    const admin = await accessCookieFor("att-admin", "att-admin-password");
    const response = await worker.fetch(
      request("/api/v1/attendance/events", {
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${admin}` },
      }),
      testEnv()
    );
    assert.strictEqual(response.status, 200);
    const body = await json(response);
    const { events } = body.data as {
      events: { event_id: string }[];
    };
    const ids = events.map((event) => event.event_id);
    assert.ok(ids.includes(EVENT));
    assert.ok(ids.includes(CANCELLED_EVENT));
    assert.ok(ids.includes(CLOSED_EVENT));
    assert.ok(
      events.every((event) => !("manual_check_in_code" in (event as object)))
    );
  });

  test("Scanner event projection returns only open eligible events for admins", async () => {
    const admin = await accessCookieFor("att-admin", "att-admin-password");
    const response = await worker.fetch(
      request("/api/v1/attendance/scanner-events", {
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${admin}` },
      }),
      testEnv()
    );
    assert.strictEqual(response.status, 200);
    const body = await json(response);
    const { events } = body.data as {
      events: {
        event_id: string;
        program_name: string;
        name: string | null;
        location: string | null;
        starts_at: string;
        ends_at: string;
        availability: string;
        status: string;
        check_in_window_opens_at: string;
        check_in_window_closes_at: string;
      }[];
    };
    const eventWithChooserDetails = events.find(
      (event) => event.event_id === EVENT
    );
    assert.ok(eventWithChooserDetails);
    assert.strictEqual(eventWithChooserDetails.program_name, "Attendance Test");
    assert.strictEqual(eventWithChooserDetails.name, "週六團契");
    assert.strictEqual(eventWithChooserDetails.location, "主堂");
    assert.ok(eventWithChooserDetails.starts_at);
    assert.ok(eventWithChooserDetails.ends_at);
    assert.ok(events.some((event) => event.event_id === EVENT));
    assert.ok(events.some((event) => event.program_name === "Attendance Test"));
    assert.ok(
      events.every(
        (event) =>
          event.status === "Active" &&
          event.availability === "Active" &&
          Date.parse(event.check_in_window_opens_at) <= Date.now() &&
          Date.parse(event.check_in_window_closes_at) >= Date.now()
      )
    );
    const ids = events.map((event) => event.event_id);
    assert.ok(!ids.includes(CANCELLED_EVENT));
    assert.ok(!ids.includes(INACTIVE_EVENT));
    assert.ok(
      events.every((event) => !("manual_check_in_code" in (event as object)))
    );
    assert.ok(!ids.includes(CLOSED_EVENT));
  });

  test("operator event chooser includes exact UTC window boundaries", async () => {
    const boundary = new Date("2026-08-14T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(boundary);
    try {
      const timestamp = boundary.toISOString();
      await testDb()
        .prepare(
          `INSERT INTO events
            (event_id, program_id, starts_at, ends_at, status, availability,
             source, manual_check_in_code, check_in_window_opens_at,
             check_in_window_closes_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'Active', 'Active', 'MANUAL', ?, ?, ?, ?, ?)`
        )
        .bind(
          BOUNDARY_EVENT,
          PROGRAM,
          new Date(boundary.getTime() - 3_600_000).toISOString(),
          new Date(boundary.getTime() + 3_600_000).toISOString(),
          "ATTBOUNDARY",
          timestamp,
          timestamp,
          timestamp,
          timestamp
        )
        .run();
      const admin = await accessCookieFor("att-admin", "att-admin-password");
      const response = await worker.fetch(
        request("/api/v1/attendance/scanner-events", {
          headers: { Cookie: `${ACCESS_COOKIE_NAME}=${admin}` },
        }),
        testEnv()
      );
      assert.strictEqual(response.status, 200);
      const body = await json(response);
      const { events } = body.data as { events: { event_id: string }[] };
      assert.ok(events.some((event) => event.event_id === BOUNDARY_EVENT));
    } finally {
      await testDb()
        .prepare("DELETE FROM events WHERE event_id = ?")
        .bind(BOUNDARY_EVENT)
        .run();
      vi.useRealTimers();
    }
  });

  test("operator event chooser is empty for a member without a leader grant", async () => {
    const member = await accessCookieFor("att-member", "att-member-password");
    const response = await worker.fetch(
      request("/api/v1/attendance/scanner-events", {
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${member}` },
      }),
      testEnv()
    );
    assert.strictEqual(response.status, 200);
    const body = await json(response);
    assert.strictEqual((body.data as { events: unknown[] }).events.length, 0);
  });

  test("operator chooser honors an active Program Leader scope", async () => {
    const member = await accessCookieFor("att-member", "att-member-password");
    await assignIdentity(
      PROGRAM_IDENTITY,
      "ATT-MEMBER",
      "ATT-PROGRAM-ACTIVE-ASSIGNMENT"
    );
    try {
      const response = await worker.fetch(
        request("/api/v1/attendance/scanner-events", {
          headers: { Cookie: `${ACCESS_COOKIE_NAME}=${member}` },
        }),
        testEnv()
      );
      assert.strictEqual(response.status, 200);
      const body = await json(response);
      const { data } = body;
      assert.ok(data && typeof data === "object" && "events" in data);
      const { events } = data;
      assert.ok(Array.isArray(events));
      assert.ok(
        events.some((event) => {
          if (!(event && typeof event === "object" && "event_id" in event)) {
            return false;
          }
          const { event_id: eventId } = event;
          return eventId === EVENT;
        })
      );
    } finally {
      await testDb()
        .prepare("DELETE FROM role_assignments WHERE assignment_id = ?")
        .bind("ATT-PROGRAM-ACTIVE-ASSIGNMENT")
        .run();
    }
  });

  test("operator chooser honors an active Department Manager scope", async () => {
    const member = await accessCookieFor("att-member", "att-member-password");
    await assignIdentity(
      DEPARTMENT_IDENTITY,
      "ATT-MEMBER",
      "ATT-DEPARTMENT-ACTIVE-ASSIGNMENT"
    );
    try {
      const response = await worker.fetch(
        request("/api/v1/attendance/scanner-events", {
          headers: { Cookie: `${ACCESS_COOKIE_NAME}=${member}` },
        }),
        testEnv()
      );
      assert.strictEqual(response.status, 200);
      const body = await json(response);
      const { data } = body;
      assert.ok(data && typeof data === "object" && "events" in data);
      const { events } = data;
      assert.ok(Array.isArray(events));
      assert.ok(
        events.some((event) => {
          if (!(event && typeof event === "object" && "event_id" in event)) {
            return false;
          }
          const { event_id: eventId } = event;
          return eventId === EVENT;
        })
      );
    } finally {
      await testDb()
        .prepare("DELETE FROM role_assignments WHERE assignment_id = ?")
        .bind("ATT-DEPARTMENT-ACTIVE-ASSIGNMENT")
        .run();
    }
  });
  test("operator chooser filters authorization before applying result limit", async () => {
    const member = await accessCookieFor("att-member", "att-member-password");
    await assignIdentity(
      PROGRAM_IDENTITY,
      "ATT-MEMBER",
      "ATT-PROGRAM-LIMIT-ASSIGNMENT"
    );
    await testDb()
      .prepare(
        `WITH RECURSIVE event_numbers(value) AS (
           SELECT 1
           UNION ALL
           SELECT value + 1 FROM event_numbers WHERE value < 250
         )
         INSERT INTO events
           (event_id, program_id, starts_at, ends_at, status, source,
            manual_check_in_code, check_in_window_opens_at,
            check_in_window_closes_at, created_at, updated_at)
         SELECT
           'ATT-LIMIT-' || value,
           ?,
           datetime('2030-01-01T00:00:00Z', printf('+%d minutes', value)),
           datetime('2030-01-01T00:30:00Z', printf('+%d minutes', value)),
           'Active',
           'MANUAL',
           'ATT-LIMIT-CODE-' || value,
           datetime('2029-12-31T23:00:00Z', printf('+%d minutes', value)),
           datetime('2030-01-01T01:00:00Z', printf('+%d minutes', value)),
           datetime('2026-01-01T00:00:00Z'),
           datetime('2026-01-01T00:00:00Z')
         FROM event_numbers`
      )
      .bind(PROGRAM2)
      .run();
    try {
      const response = await worker.fetch(
        request("/api/v1/attendance/events", {
          headers: { Cookie: `${ACCESS_COOKIE_NAME}=${member}` },
        }),
        testEnv()
      );
      assert.strictEqual(response.status, 200);
      const body = await json(response);
      const data = body.data;
      assert.ok(
        data &&
          typeof data === "object" &&
          "events" in data &&
          Array.isArray(data.events)
      );
      if (!data || typeof data !== "object" || !("events" in data)) {
        throw new Error("expected events projection");
      }
      const { events } = data;
      assert.ok(
        events.some((event) => {
          if (!event || typeof event !== "object" || !("event_id" in event)) {
            return false;
          }
          return event.event_id === EVENT;
        })
      );
    } finally {
      await testDb()
        .prepare("DELETE FROM events WHERE event_id LIKE 'ATT-LIMIT-%'")
        .run();
      await testDb()
        .prepare("DELETE FROM role_assignments WHERE assignment_id = ?")
        .bind("ATT-PROGRAM-LIMIT-ASSIGNMENT")
        .run();
    }
  });

  test("scanner projection excludes revoked scoped grants", async () => {
    const member = await accessCookieFor("att-member", "att-member-password");
    const revokedAt = new Date().toISOString();
    await assignIdentity(
      PROGRAM_IDENTITY,
      "ATT-MEMBER",
      "ATT-PROGRAM-REVOKED-ASSIGNMENT",
      revokedAt
    );
    await assignIdentity(
      DEPARTMENT_IDENTITY,
      "ATT-MEMBER",
      "ATT-DEPARTMENT-REVOKED-ASSIGNMENT",
      revokedAt
    );
    const response = await worker.fetch(
      request("/api/v1/attendance/scanner-events", {
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${member}` },
      }),
      testEnv()
    );
    assert.strictEqual(response.status, 200);
    const body = await json(response);
    const { data } = body;
    assert.ok(data && typeof data === "object" && "events" in data);
    assert.ok(Array.isArray(data.events));
    assert.strictEqual(data.events.length, 0);
  });

  test("guest entry that does not match the Event is rejected before check-in", async () => {
    const response = await worker.fetch(
      request("/api/v1/attendance/guest", {
        method: "POST",
        body: JSON.stringify({
          event_id: EVENT,
          method: "guest_manual_code",
          manual_code: "WRONGCODE",
          name: "訪客三",
          phone: "6222 2222",
        }),
      }),
      testEnv()
    );
    assert.strictEqual(response.status, 403);
    const body = await json(response);
    assert.strictEqual(body.code, "INVALID_CHECK_IN_ENTRY");
  });

  test("bare typed entry resolves and checks in (self + guest), wrong entry 403s", async () => {
    // The panel sends the ambiguous typed value as `entry` with no explicit
    // manual_code/program_token: the server must resolve it against this
    // Event and use the resolved credential, not reject it (regression:
    // entry-only submits used to 403 INVALID_CHECK_IN_ENTRY).
    const member = await accessCookieFor("att-member", "att-member-password");
    const self = await worker.fetch(
      request("/api/v1/attendance/self", {
        method: "POST",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${member}` },
        body: JSON.stringify({
          event_id: LONG_CODE_EVENT,
          method: "self_manual_code",
          entry: "ATTLONGCODE",
        }),
      }),
      testEnv()
    );
    assert.strictEqual(self.status, 201);

    const guest = await worker.fetch(
      request("/api/v1/attendance/guest", {
        method: "POST",
        body: JSON.stringify({
          event_id: EVENT,
          method: "guest_manual_code",
          entry: "ATT1234",
          name: "訪客四",
          phone: "6333 3333",
        }),
      }),
      testEnv()
    );
    assert.strictEqual(guest.status, 201);

    const wrong = await worker.fetch(
      request("/api/v1/attendance/self", {
        method: "POST",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${member}` },
        body: JSON.stringify({
          event_id: EVENT,
          method: "self_manual_code",
          entry: "WRONGCODE",
        }),
      }),
      testEnv()
    );
    assert.strictEqual(wrong.status, 403);
    const wrongBody = await json(wrong);
    assert.strictEqual(wrongBody.code, "INVALID_CHECK_IN_ENTRY");
  });

  test("entry status lookup: cancelled manual code returns Cancelled, closed manual code returns Active with window", async () => {
    // A typed entry that matches a cancelled/closed Event's manual code surfaces
    // that Event's latest state.
    const cancelled = await worker.fetch(
      request("/api/v1/attendance/resolve?entry=ATTCANCEL"),
      testEnv()
    );
    assert.strictEqual(cancelled.status, 200);
    const cancelledBody = await json(cancelled);
    const cancelledData = cancelledBody.data as {
      events: unknown[];
      latest: { status: string };
    };
    assert.deepStrictEqual(cancelledData.events, []);
    assert.strictEqual(cancelledData.latest.status, "Cancelled");

    const closed = await worker.fetch(
      request("/api/v1/attendance/resolve?entry=ATTCLOSED"),
      testEnv()
    );
    assert.strictEqual(closed.status, 200);
    const closedBody = await json(closed);
    const closedData = closedBody.data as {
      events: unknown[];
      latest: { status: string; check_in_window_opens_at: string | null };
    };
    assert.deepStrictEqual(closedData.events, []);
    assert.strictEqual(closedData.latest.status, "Active");
    assert.ok(closedData.latest.check_in_window_opens_at);
  });

  test("guest correction updates the row; a phone already active on the Event conflicts", async () => {
    const admin = await accessCookieFor("att-admin", "att-admin-password");
    const phoneA = "6555 5555";
    const phoneB = "6666 6666";
    const phoneC = "6777 7777";
    const guest = async (name: string, phone: string) => {
      const response = await worker.fetch(
        request("/api/v1/attendance/guest", {
          method: "POST",
          body: JSON.stringify({
            event_id: EVENT,
            method: "guest_manual_code",
            manual_code: "ATT1234",
            name,
            phone,
          }),
        }),
        testEnv()
      );
      assert.strictEqual(response.status, 201);
      const body = await json(response);
      return body.data as { attendance_id: string };
    };
    const rowA = await guest("訪客更正甲", phoneA);
    await guest("訪客更正乙", phoneB);
    const header = { Cookie: `${ACCESS_COOKIE_NAME}=${admin}` };

    // Correcting A onto B's phone collides with the active-guest unique
    // index and must surface as a 409, not a 500.
    const conflict = await worker.fetch(
      request(`/api/v1/attendance/${rowA.attendance_id}/guest-correction`, {
        method: "PATCH",
        headers: header,
        body: JSON.stringify({
          name: "訪客更正甲",
          phone: "+852 6666-6666",
          reason: "電話更正測試",
        }),
      }),
      testEnv()
    );
    assert.strictEqual(conflict.status, 409);
    const conflictBody = await json(conflict);
    assert.strictEqual(conflictBody.code, "DUPLICATE_ATTENDANCE");

    // A fresh phone corrects cleanly and the roster reflects the edit.
    const corrected = await worker.fetch(
      request(`/api/v1/attendance/${rowA.attendance_id}/guest-correction`, {
        method: "PATCH",
        headers: header,
        body: JSON.stringify({
          name: "訪客更正甲改",
          phone: phoneC,
          reason: "電話更正測試",
        }),
      }),
      testEnv()
    );
    assert.strictEqual(corrected.status, 200);
    const correctedBody = await json(corrected);
    assert.strictEqual(
      (correctedBody.data as { outcome: string }).outcome,
      "corrected"
    );

    const roster = await worker.fetch(
      request(`/api/v1/attendance/events/${EVENT}/roster`, {
        headers: header,
      }),
      testEnv()
    );
    assert.strictEqual(roster.status, 200);
    const rosterBody = await json(roster);
    const rows = rosterBody.data as {
      attendances: {
        attendance_id: string;
        guest_name: string;
        guest_phone: string;
      }[];
    };
    const row = rows.attendances.find(
      (candidate) => candidate.attendance_id === rowA.attendance_id
    );
    assert.ok(row, "corrected row must remain on the roster");
    assert.strictEqual(row.guest_name, "訪客更正甲改");
    assert.strictEqual(row.guest_phone, phoneC);

    const dbRow = await testDb()
      .prepare(
        "SELECT guest_name, guest_phone, guest_phone_normalized FROM attendances WHERE attendance_id = ?"
      )
      .bind(rowA.attendance_id)
      .first<{
        guest_name: string;
        guest_phone: string;
        guest_phone_normalized: string;
      }>();
    assert.strictEqual(dbRow?.guest_name, "訪客更正甲改");
    assert.strictEqual(dbRow?.guest_phone, phoneC);
    assert.strictEqual(dbRow?.guest_phone_normalized, "hk:85267777777");

    const audit = await testDb()
      .prepare("SELECT * FROM audit_events WHERE correlation_id = ?")
      .bind(correctedBody.requestId)
      .first<{
        action: string;
        outcome: string;
        actor_user_id: string;
        entity_type: string;
        entity_id: string;
        old_value_json: string;
        new_value_json: string;
        reason: string;
      }>();
    assert.strictEqual(audit?.action, "attendance.guest_correct");
    assert.strictEqual(audit?.outcome, "SUCCESS");
    assert.strictEqual(audit?.actor_user_id, "ATT-ADMIN");
    assert.strictEqual(audit?.entity_id, rowA.attendance_id);
    assert.strictEqual(audit?.reason, "電話更正測試");
    assert.deepStrictEqual(JSON.parse(audit?.old_value_json ?? "{}"), {
      name: "訪客更正甲",
      phone: phoneA,
    });
    assert.deepStrictEqual(JSON.parse(audit?.new_value_json ?? "{}"), {
      name: "訪客更正甲改",
      phone: phoneC,
    });
  });

  test("guest correction requires a non-blank reason (422 VALIDATION)", async () => {
    const admin = await accessCookieFor("att-admin", "att-admin-password");
    const checkIn = await worker.fetch(
      request("/api/v1/attendance/guest", {
        method: "POST",
        body: JSON.stringify({
          event_id: EVENT,
          method: "guest_manual_code",
          manual_code: "ATT1234",
          name: "訪客更正原因測試",
          phone: "6222 9001",
        }),
      }),
      testEnv()
    );
    assert.strictEqual(checkIn.status, 201);
    const checkInBody = await json(checkIn);
    const { attendance_id } = checkInBody.data as { attendance_id: string };

    const response = await worker.fetch(
      request(`/api/v1/attendance/${attendance_id}/guest-correction`, {
        method: "PATCH",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${admin}` },
        body: JSON.stringify({
          name: "訪客更正原因測試改",
          phone: "6222 9002",
          reason: "   ",
        }),
      }),
      testEnv()
    );
    assert.strictEqual(response.status, 422);
    const responseBody = await json(response);
    assert.strictEqual(responseBody.code, "VALIDATION");

    const row = await testDb()
      .prepare(
        "SELECT guest_name, guest_phone FROM attendances WHERE attendance_id = ?"
      )
      .bind(attendance_id)
      .first<{ guest_name: string; guest_phone: string }>();
    assert.deepStrictEqual(row, {
      guest_name: "訪客更正原因測試",
      guest_phone: "6222 9001",
    });
  });

  test("void requires a non-blank reason (422 VALIDATION)", async () => {
    const admin = await accessCookieFor("att-admin", "att-admin-password");
    const checkIn = await worker.fetch(
      request("/api/v1/attendance/guest", {
        method: "POST",
        body: JSON.stringify({
          event_id: EVENT,
          method: "guest_manual_code",
          manual_code: "ATT1234",
          name: "訪客作廢測試",
          phone: "6888 8888",
        }),
      }),
      testEnv()
    );
    assert.strictEqual(checkIn.status, 201);
    const checkInBody = await json(checkIn);
    const { attendance_id } = checkInBody.data as { attendance_id: string };
    const response = await worker.fetch(
      request(`/api/v1/attendance/${attendance_id}/void`, {
        method: "POST",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${admin}` },
        body: JSON.stringify({ reason: "   " }),
      }),
      testEnv()
    );
    assert.strictEqual(response.status, 422);
    const body = await json(response);
    assert.strictEqual(body.code, "VALIDATION");
    const row = await testDb()
      .prepare(`SELECT status FROM attendances WHERE attendance_id = ?`)
      .bind(attendance_id)
      .first<{ status: string }>();
    assert.strictEqual(row?.status, "Active");
  });

  test("guest check-in name over 80 chars is rejected (422 VALIDATION)", async () => {
    const response = await worker.fetch(
      request("/api/v1/attendance/guest", {
        method: "POST",
        body: JSON.stringify({
          event_id: EVENT,
          method: "guest_manual_code",
          manual_code: "ATT1234",
          name: "訪".repeat(81),
          phone: "6999 9999",
        }),
      }),
      testEnv()
    );
    assert.strictEqual(response.status, 422);
    const body = await json(response);
    assert.strictEqual(body.code, "VALIDATION");
    assert.match(String(body.detail), /80/u);
    const row = await testDb()
      .prepare(
        `SELECT 1 FROM attendances WHERE event_id = ? AND guest_phone_normalized = ?`
      )
      .bind(EVENT, "hk:85269999999")
      .first();
    assert.strictEqual(row, null);
  });

  test("guest correction name over 80 chars is rejected (422 VALIDATION)", async () => {
    const admin = await accessCookieFor("att-admin", "att-admin-password");
    const checkIn = await worker.fetch(
      request("/api/v1/attendance/guest", {
        method: "POST",
        body: JSON.stringify({
          event_id: EVENT,
          method: "guest_manual_code",
          manual_code: "ATT1234",
          name: "訪客更正上限",
          phone: "6888 8887",
        }),
      }),
      testEnv()
    );
    assert.strictEqual(checkIn.status, 201);
    const checkInBody = await json(checkIn);
    const { attendance_id } = checkInBody.data as {
      attendance_id: string;
    };
    const corrected = await worker.fetch(
      request(`/api/v1/attendance/${attendance_id}/guest-correction`, {
        method: "PATCH",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${admin}` },
        body: JSON.stringify({
          name: "超".repeat(81),
          phone: "6888 8887",
          reason: "更正測試",
        }),
      }),
      testEnv()
    );
    assert.strictEqual(corrected.status, 422);
    const body = await json(corrected);
    assert.strictEqual(body.code, "VALIDATION");
  });

  test("repeat void on an already voided record returns 200 already_voided and logs DUPLICATE audit event", async () => {
    const admin = await accessCookieFor("att-admin", "att-admin-password");
    const checkIn = await worker.fetch(
      request("/api/v1/attendance/guest", {
        method: "POST",
        body: JSON.stringify({
          event_id: EVENT,
          method: "guest_manual_code",
          manual_code: "ATT1234",
          name: "訪客重複作廢測試",
          phone: "6777 0001",
        }),
      }),
      testEnv()
    );
    assert.strictEqual(checkIn.status, 201);
    const checkInBody = await json(checkIn);
    const { attendance_id } = checkInBody.data as { attendance_id: string };
    const beforeRoster = await worker.fetch(
      request(`/api/v1/attendance/events/${EVENT}/roster`, {
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${admin}` },
      }),
      testEnv()
    );
    assert.strictEqual(beforeRoster.status, 200);
    const beforeRosterBody = await json(beforeRoster);
    const beforeRosterData = beforeRosterBody.data as {
      attendances: { attendance_id: string; status: string }[];
    };
    const beforeRows = beforeRosterData.attendances;
    const beforeLiveCount = beforeRows.filter(
      (row) => row.status === "Active"
    ).length;

    const firstVoid = await worker.fetch(
      request(`/api/v1/attendance/${attendance_id}/void`, {
        method: "POST",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${admin}` },
        body: JSON.stringify({ reason: "初次作廢" }),
      }),
      testEnv()
    );
    assert.strictEqual(firstVoid.status, 200);
    const firstVoidBody = await json(firstVoid);
    assert.strictEqual(
      (firstVoidBody.data as { outcome: string }).outcome,
      "voided"
    );
    const afterRoster = await worker.fetch(
      request(`/api/v1/attendance/events/${EVENT}/roster`, {
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${admin}` },
      }),
      testEnv()
    );
    assert.strictEqual(afterRoster.status, 200);
    const afterRosterBody = await json(afterRoster);
    const afterRosterData = afterRosterBody.data as {
      attendances: { attendance_id: string; status: string }[];
    };
    const afterRows = afterRosterData.attendances;
    assert.strictEqual(afterRows.length, beforeRows.length);
    assert.strictEqual(
      afterRows.filter((row) => row.status === "Active").length,
      beforeLiveCount - 1
    );
    const preservedRow = afterRows.find(
      (row) => row.attendance_id === attendance_id
    );
    assert.ok(preservedRow, "voided attendance remains in the roster");
    assert.strictEqual(preservedRow.status, "Voided");

    const voidRow = await testDb()
      .prepare(
        "SELECT status, void_reason, voided_by, voided_at FROM attendances WHERE attendance_id = ?"
      )
      .bind(attendance_id)
      .first<{
        status: string;
        void_reason: string;
        voided_by: string;
        voided_at: string;
      }>();
    assert.strictEqual(voidRow?.status, "Voided");
    assert.strictEqual(voidRow?.void_reason, "初次作廢");
    assert.strictEqual(voidRow?.voided_by, "ATT-ADMIN");
    assert.ok(voidRow?.voided_at);

    const firstAudit = await testDb()
      .prepare(
        "SELECT action, outcome, reason, actor_user_id FROM audit_events WHERE correlation_id = ?"
      )
      .bind(firstVoidBody.requestId)
      .first<{
        action: string;
        outcome: string;
        reason: string;
        actor_user_id: string;
      }>();
    assert.strictEqual(firstAudit?.action, "attendance.void");
    assert.strictEqual(firstAudit?.outcome, "SUCCESS");
    assert.strictEqual(firstAudit?.reason, "初次作廢");
    assert.strictEqual(firstAudit?.actor_user_id, "ATT-ADMIN");
    const secondVoid = await worker.fetch(
      request(`/api/v1/attendance/${attendance_id}/void`, {
        method: "POST",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${admin}` },
        body: JSON.stringify({ reason: "再次作廢" }),
      }),
      testEnv()
    );
    assert.strictEqual(secondVoid.status, 200);
    const secondVoidBody = await json(secondVoid);
    assert.strictEqual(
      (secondVoidBody.data as { outcome: string }).outcome,
      "already_voided"
    );

    const audit = await testDb()
      .prepare(
        "SELECT outcome, reason FROM audit_events WHERE correlation_id = ?"
      )
      .bind(secondVoidBody.requestId)
      .first<{ outcome: string; reason: string }>();
    assert.strictEqual(audit?.outcome, "DUPLICATE");
    assert.strictEqual(audit?.reason, "ALREADY_VOIDED");
  });

  test("cross-scope operator and ordinary member are denied on roster, void, and guest correction (403 FORBIDDEN)", async () => {
    const member = await accessCookieFor("att-member", "att-member-password");
    const attendanceId = "ATT-P2-GUEST-CROSS-SCOPE";
    const now = new Date().toISOString();
    // Give the member one Program-scoped identity for PROGRAM so the
    // cross-scope denial against PROGRAM2 is exercised.
    await assignIdentity(
      PROGRAM_IDENTITY,
      "ATT-MEMBER",
      "ATT-CROSS-SCOPE-ASSIGNMENT"
    );

    await testDb()
      .prepare(
        `INSERT INTO attendances
          (attendance_id, event_id, member_user_id, guest_name, guest_phone,
           guest_phone_normalized, method, status, checked_in_at, checked_in_by)
         VALUES (?, 'ATT-P2-ACTIVE-CLOSED', NULL, '跨範圍訪客', '6666 1111', 'hk:85266661111', 'guest_manual_code', 'Active', ?, NULL)`
      )
      .bind(attendanceId, now)
      .run();

    try {
      const roster = await worker.fetch(
        request("/api/v1/attendance/events/ATT-P2-ACTIVE-CLOSED/roster", {
          headers: { Cookie: `${ACCESS_COOKIE_NAME}=${member}` },
        }),
        testEnv()
      );
      assert.strictEqual(roster.status, 403);
      const rosterBody = await json(roster);
      assert.strictEqual(rosterBody.code, "FORBIDDEN");
      assertNoGuestLeakage(rosterBody);
      const voidAttempt = await worker.fetch(
        request(`/api/v1/attendance/${attendanceId}/void`, {
          method: "POST",
          headers: { Cookie: `${ACCESS_COOKIE_NAME}=${member}` },
          body: JSON.stringify({ reason: "未授權作廢" }),
        }),
        testEnv()
      );
      assert.strictEqual(voidAttempt.status, 403);
      const voidBody = await json(voidAttempt);
      assert.strictEqual(voidBody.code, "FORBIDDEN");
      assertNoGuestLeakage(voidBody);
      const correctionAttempt = await worker.fetch(
        request(`/api/v1/attendance/${attendanceId}/guest-correction`, {
          method: "PATCH",
          headers: { Cookie: `${ACCESS_COOKIE_NAME}=${member}` },
          body: JSON.stringify({
            name: "改名",
            phone: "6666 2222",
            reason: "未授權更正",
          }),
        }),
        testEnv()
      );
      assert.strictEqual(correctionAttempt.status, 403);
      const correctionBody = await json(correctionAttempt);
      assert.strictEqual(correctionBody.code, "FORBIDDEN");
      assertNoGuestLeakage(correctionBody);
      const row = await testDb()
        .prepare(
          "SELECT guest_name, guest_phone, status FROM attendances WHERE attendance_id = ?"
        )
        .bind(attendanceId)
        .first<{ guest_name: string; guest_phone: string; status: string }>();
      assert.strictEqual(row?.guest_name, "跨範圍訪客");
      assert.strictEqual(row?.guest_phone, "6666 1111");
      assert.strictEqual(row?.status, "Active");
    } finally {
      await testDb()
        .prepare("DELETE FROM role_assignments WHERE assignment_id = ?")
        .bind("ATT-CROSS-SCOPE-ASSIGNMENT")
        .run();
      await testDb()
        .prepare("DELETE FROM attendances WHERE attendance_id = ?")
        .bind(attendanceId)
        .run();
    }
  });

  test("plain ordinary member without any operator grants is denied on roster, void, and guest correction (403 FORBIDDEN)", async () => {
    const plainMember = await accessCookieFor(
      "att-member",
      "att-member-password"
    );
    const attendanceId = "ATT-PLAIN-MEMBER-DENIED-ROW";
    const now = new Date().toISOString();
    await testDb()
      .prepare(
        `INSERT INTO attendances
          (attendance_id, event_id, member_user_id, guest_name, guest_phone,
           guest_phone_normalized, method, status, checked_in_at, checked_in_by)
         VALUES (?, ?, NULL, '普通成員拒絕測試', '6999 1234', 'hk:85269991234', 'guest_manual_code', 'Active', ?, NULL)`
      )
      .bind(attendanceId, EVENT, now)
      .run();

    try {
      const roster = await worker.fetch(
        request(`/api/v1/attendance/events/${EVENT}/roster`, {
          headers: { Cookie: `${ACCESS_COOKIE_NAME}=${plainMember}` },
        }),
        testEnv()
      );
      assert.strictEqual(roster.status, 403);
      const rosterBody = await json(roster);
      assert.strictEqual(rosterBody.code, "FORBIDDEN");
      assertNoGuestLeakage(rosterBody);

      const voidAttempt = await worker.fetch(
        request(`/api/v1/attendance/${attendanceId}/void`, {
          method: "POST",
          headers: { Cookie: `${ACCESS_COOKIE_NAME}=${plainMember}` },
          body: JSON.stringify({ reason: "普通成員嘗試作廢" }),
        }),
        testEnv()
      );
      assert.strictEqual(voidAttempt.status, 403);
      const voidBody = await json(voidAttempt);
      assert.strictEqual(voidBody.code, "FORBIDDEN");
      assertNoGuestLeakage(voidBody);

      const correctionAttempt = await worker.fetch(
        request(`/api/v1/attendance/${attendanceId}/guest-correction`, {
          method: "PATCH",
          headers: { Cookie: `${ACCESS_COOKIE_NAME}=${plainMember}` },
          body: JSON.stringify({
            name: "普通成員嘗試改名",
            phone: "6999 4321",
            reason: "無權限更正",
          }),
        }),
        testEnv()
      );
      assert.strictEqual(correctionAttempt.status, 403);
      const correctionBody = await json(correctionAttempt);
      assert.strictEqual(correctionBody.code, "FORBIDDEN");
      assertNoGuestLeakage(correctionBody);
      const dbRow = await testDb()
        .prepare(
          "SELECT guest_name, guest_phone, status FROM attendances WHERE attendance_id = ?"
        )
        .bind(attendanceId)
        .first<{ guest_name: string; guest_phone: string; status: string }>();
      assert.strictEqual(dbRow?.guest_name, "普通成員拒絕測試");
      assert.strictEqual(dbRow?.guest_phone, "6999 1234");
      assert.strictEqual(dbRow?.status, "Active");
    } finally {
      await testDb()
        .prepare("DELETE FROM attendances WHERE attendance_id = ?")
        .bind(attendanceId)
        .run();
    }
  });

  test("correcting a member record via guest correction returns 404 NOT_FOUND", async () => {
    const admin = await accessCookieFor("att-admin", "att-admin-password");
    const memberCheckIn = await worker.fetch(
      request(`/api/v1/attendance/events/${QR_EVENT}/check-in`, {
        method: "POST",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${admin}` },
        body: JSON.stringify({
          member_user_id: "ATT-MEMBER",
          method: "leader_qr_scan",
        }),
      }),
      testEnv()
    );
    assert.ok(memberCheckIn.status === 200 || memberCheckIn.status === 201);
    const memberCheckInBody = await json(memberCheckIn);
    const { attendance_id } = memberCheckInBody.data as {
      attendance_id: string;
    };

    const correction = await worker.fetch(
      request(`/api/v1/attendance/${attendance_id}/guest-correction`, {
        method: "PATCH",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${admin}` },
        body: JSON.stringify({
          name: "嘗試更正成員",
          phone: "9123 4567",
          reason: "測試",
        }),
      }),
      testEnv()
    );
    assert.strictEqual(correction.status, 404);
    const correctionBody = await json(correction);
    assert.strictEqual(correctionBody.code, "NOT_FOUND");
  });

  test("resolve contract: future check-in window returns latest.status Active and check_in_window_opens_at", async () => {
    const response = await worker.fetch(
      request("/api/v1/attendance/resolve?manual_code=ATTCLOSED"),
      testEnv()
    );
    assert.strictEqual(response.status, 200);
    const body = await json(response);
    const data = body.data as {
      events: unknown[];
      latest: {
        status: string;
        availability: string;
        starts_at: string | null;
        check_in_window_opens_at: string | null;
        program_id: string;
        program_name: string;
      } | null;
      enrolled: boolean;
    };
    assert.deepStrictEqual(data.events, []);
    assert.ok(data.latest);
    assert.strictEqual(data.latest.status, "Active");
    assert.strictEqual(data.latest.availability, "Active");
    assert.ok(data.latest.starts_at);
    assert.ok(data.latest.check_in_window_opens_at);
    assert.strictEqual(data.latest.program_id, PROGRAM);
    assert.strictEqual(data.latest.program_name, "Attendance Test");
    assert.strictEqual(data.enrolled, false); // unauthenticated
  });

  test("resolve contract: cancelled event returns latest.status Cancelled", async () => {
    const response = await worker.fetch(
      request("/api/v1/attendance/resolve?manual_code=ATTCANCEL"),
      testEnv()
    );
    assert.strictEqual(response.status, 200);
    const body = await json(response);
    const data = body.data as {
      events: unknown[];
      latest: {
        status: string;
        availability: string;
        check_in_window_opens_at: string | null;
        program_id: string;
        program_name: string;
      } | null;
      enrolled: boolean;
    };
    assert.deepStrictEqual(data.events, []);
    assert.ok(data.latest);
    assert.strictEqual(data.latest.status, "Cancelled");
    assert.strictEqual(data.latest.program_id, PROGRAM);
    assert.strictEqual(data.latest.program_name, "Attendance Test");
  });

  test("resolve contract: member enrollment determination (enrolled=true vs enrolled=false)", async () => {
    const memberCookie = await accessCookieFor(
      "att-member",
      "att-member-password"
    );
    const adminCookie = await accessCookieFor(
      "att-admin",
      "att-admin-password"
    );

    // ATT-MEMBER has active enrollment in PROGRAM
    const enrolledResp = await worker.fetch(
      request("/api/v1/attendance/resolve?manual_code=ATTCLOSED", {
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${memberCookie}` },
      }),
      testEnv()
    );
    assert.strictEqual(enrolledResp.status, 200);
    const enrolledBody = await json(enrolledResp);
    const enrolledData = enrolledBody.data as {
      events: unknown[];
      latest: { program_id: string };
      enrolled: boolean;
    };
    assert.strictEqual(enrolledData.latest.program_id, PROGRAM);
    assert.strictEqual(enrolledData.enrolled, true);

    // ATT-ADMIN does not have enrollment in PROGRAM
    const notEnrolledResp = await worker.fetch(
      request("/api/v1/attendance/resolve?manual_code=ATTCLOSED", {
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}` },
      }),
      testEnv()
    );
    assert.strictEqual(notEnrolledResp.status, 200);
    const notEnrolledBody = await json(notEnrolledResp);
    const notEnrolledData = notEnrolledBody.data as {
      events: unknown[];
      latest: { program_id: string };
      enrolled: boolean;
    };
    assert.strictEqual(notEnrolledData.latest.program_id, PROGRAM);
    assert.strictEqual(notEnrolledData.enrolled, false);

    // ATT-MEMBER is NOT enrolled in PROGRAM2 (which has ATTENDANCE-PROGRAM-TOKEN-2)
    const p2Resp = await worker.fetch(
      request(
        "/api/v1/attendance/resolve?program_token=ATTENDANCE-PROGRAM-TOKEN-2",
        {
          headers: { Cookie: `${ACCESS_COOKIE_NAME}=${memberCookie}` },
        }
      ),
      testEnv()
    );
    assert.strictEqual(p2Resp.status, 200);
    const p2Body = await json(p2Resp);
    const p2Data = p2Body.data as {
      events: unknown[];
      latest: { program_id: string };
      enrolled: boolean;
    };
    assert.strictEqual(p2Data.latest.program_id, PROGRAM2);
    assert.strictEqual(p2Data.enrolled, false);
  });

  test("resolve contract: unknown code returns latest: null and enrolled: false", async () => {
    const response = await worker.fetch(
      request("/api/v1/attendance/resolve?manual_code=999999"),
      testEnv()
    );
    assert.strictEqual(response.status, 200);
    const body = await json(response);
    const data = body.data as {
      events: unknown[];
      latest: unknown;
      enrolled: boolean;
    };
    assert.deepStrictEqual(data.events, []);
    assert.strictEqual(data.latest, null);
    assert.strictEqual(data.enrolled, false);

    const entryResp = await worker.fetch(
      request("/api/v1/attendance/resolve?entry=UNKNOWNTOKEN"),
      testEnv()
    );
    assert.strictEqual(entryResp.status, 200);
    const entryBody = await json(entryResp);
    const entryData = entryBody.data as {
      events: unknown[];
      latest: unknown;
      enrolled: boolean;
    };
    assert.deepStrictEqual(entryData.events, []);
    assert.strictEqual(entryData.latest, null);
    assert.strictEqual(entryData.enrolled, false);
  });

  test("resolve with ?event=<id> deep-link returns the matching event pre-selected", async () => {
    const openResp = await worker.fetch(
      request(`/api/v1/attendance/resolve?event=${encodeURIComponent(EVENT)}`),
      testEnv()
    );
    assert.strictEqual(openResp.status, 200);
    const openBody = await json(openResp);
    const openData = openBody.data as {
      events: {
        event_id: string;
        name: string | null;
        location: string | null;
        status: "Active" | "Cancelled";
        availability: "Active" | "Inactive";
      }[];
    };
    assert.strictEqual(openData.events.length, 1);
    assert.strictEqual(openData.events[0]?.event_id, EVENT);
    assert.strictEqual(openData.events[0]?.name, "週六團契");
    assert.strictEqual(openData.events[0]?.location, "主堂");

    // Closed event falls through to `latest` so the UI renders the existing
    // window-not-open / cancelled outcome views; it is never auto-selected.
    const closedResp = await worker.fetch(
      request(
        `/api/v1/attendance/resolve?event=${encodeURIComponent(CLOSED_EVENT)}`
      ),
      testEnv()
    );
    assert.strictEqual(closedResp.status, 200);
    const closedBody = await json(closedResp);
    const closedData = closedBody.data as {
      events: unknown[];
      latest: {
        status: "Active" | "Cancelled";
        availability: "Active" | "Inactive";
      } | null;
    };
    assert.deepStrictEqual(closedData.events, []);
    assert.strictEqual(closedData.latest?.status, "Active");
    assert.strictEqual(closedData.latest?.availability, "Active");

    // Cancelled event mirrors the same shape; status is surfaced for the
    // outcome view.
    const cancelledResp = await worker.fetch(
      request(
        `/api/v1/attendance/resolve?event=${encodeURIComponent(CANCELLED_EVENT)}`
      ),
      testEnv()
    );
    assert.strictEqual(cancelledResp.status, 200);
    const cancelledBody = await json(cancelledResp);
    const cancelledData = cancelledBody.data as {
      events: unknown[];
      latest: { status: "Active" | "Cancelled" } | null;
    };
    assert.deepStrictEqual(cancelledData.events, []);
    assert.strictEqual(cancelledData.latest?.status, "Cancelled");

    // Unknown event id returns the same empty shape as the other not-found
    // resolve paths.
    const unknownResp = await worker.fetch(
      request(
        `/api/v1/attendance/resolve?event=${encodeURIComponent("does-not-exist")}`
      ),
      testEnv()
    );
    assert.strictEqual(unknownResp.status, 200);
    const unknownBody = await json(unknownResp);
    const unknownData = unknownBody.data as {
      events: unknown[];
      latest: unknown;
    };
    assert.deepStrictEqual(unknownData.events, []);
    assert.strictEqual(unknownData.latest, null);

    // ?event with another explicit credential is rejected as ambiguous.
    const conflictResp = await worker.fetch(
      request(
        `/api/v1/attendance/resolve?event=${encodeURIComponent(EVENT)}&manual_code=ATT1234`
      ),
      testEnv()
    );
    assert.strictEqual(conflictResp.status, 422);
    const conflictBody = await json(conflictResp);
    assert.strictEqual(conflictBody.code, "VALIDATION");
  });
});
