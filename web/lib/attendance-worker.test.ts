import assert from "node:assert/strict";

import { env } from "cloudflare:workers";
import { beforeAll, describe, test } from "vitest";

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
const EVENT = "ATT-EVENT";
const CANCELLED_EVENT = "ATT-EVENT-CANCELLED";
const QR_EVENT = "ATT-EVENT-QR";
const CLOSED_EVENT = "ATT-EVENT-CLOSED";
const LONG_CODE_EVENT = "ATT-EVENT-LONGCODE";

function testEnv(): Env {
  return {
    ...(env as unknown as Env),
    APPS_SCRIPT_EXEC_URL: "https://script.google.com/macros/s/fake/exec",
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

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
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
    assert.ok((qrBody.data as { events: unknown[] }).events.length >= 1);

    const manual = await worker.fetch(
      request("/api/v1/attendance/resolve?manual_code=ATT1234"),
      testEnv()
    );
    assert.strictEqual(manual.status, 200);
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
    const secondData = secondBody.data as { attendance_id: string };
    assert.strictEqual(secondData.attendance_id, firstData.attendance_id);
  });

  test("guest phone forms share a duplicate guard, then void releases it", async () => {
    const payload = {
      event_id: EVENT,
      method: "guest_manual_code",
      manual_code: "ATT1234",
      name: "訪客一",
      phone: "9123 4567",
    };
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
    const duplicateData = duplicateBody.data as {
      outcome: string;
      attendance_id: string;
    };
    assert.strictEqual(duplicateData.outcome, "duplicate");
    // The duplicate points at the original row, so voiding it releases the
    // phone for a genuine re-check-in below.
    assert.strictEqual(duplicateData.attendance_id, attendanceId);

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
    const retry = await worker.fetch(
      request("/api/v1/attendance/guest", {
        method: "POST",
        body: JSON.stringify({ ...payload, phone: "+852 9123-4567" }),
      }),
      testEnv()
    );
    assert.strictEqual(retry.status, 201);
  });

  test("resolve reports a cancelled Event as 410 EVENT_CANCELLED", async () => {
    const response = await worker.fetch(
      request("/api/v1/attendance/resolve?manual_code=ATTCANCEL"),
      testEnv()
    );
    assert.strictEqual(response.status, 410);
    const body = await json(response);
    assert.strictEqual(body.code, "EVENT_CANCELLED");
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
  });

  test("assisted check-in works for an active enrolled member via QR scan", async () => {
    const admin = await accessCookieFor("att-admin", "att-admin-password");
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
  });

  test("assisted check-in is capability-gated, not window-gated (US 25 recovery)", async () => {
    const admin = await accessCookieFor("att-admin", "att-admin-password");
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
    assert.strictEqual(response.status, 201);
  });

  test("resolve reports cancelled state deterministically when a token matches mixed-status events", async () => {
    const response = await worker.fetch(
      request(
        "/api/v1/attendance/resolve?program_token=ATTENDANCE-PROGRAM-TOKEN-2"
      ),
      testEnv()
    );
    assert.strictEqual(response.status, 410);
    const body = await json(response);
    assert.strictEqual(body.code, "EVENT_CANCELLED");
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

  test("operator event chooser lists manageable events for admins", async () => {
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
      events: {
        event_id: string;
        program_name: string;
        availability: string;
      }[];
    };
    assert.strictEqual(
      events.find((e) => e.event_id === EVENT)?.availability,
      "Active"
    );
    const ids = events.map((e) => e.event_id);
    assert.ok(ids.includes(EVENT));
    assert.ok(ids.includes(CANCELLED_EVENT));
    assert.ok(events.some((e) => e.program_name === "Attendance Test"));
  });

  test("operator event chooser is empty for a member without a leader grant", async () => {
    const member = await accessCookieFor("att-member", "att-member-password");
    const response = await worker.fetch(
      request("/api/v1/attendance/events", {
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${member}` },
      }),
      testEnv()
    );
    assert.strictEqual(response.status, 200);
    const body = await json(response);
    assert.strictEqual((body.data as { events: unknown[] }).events.length, 0);
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

  test("entry status lookup: cancelled manual code 410s, closed manual code 409s", async () => {
    // A typed entry that matches a cancelled/closed Event's manual code must
    // surface that Event's status (regression: the token-column fallback
    // used to 404 a cancelled manual code instead of 410).
    const cancelled = await worker.fetch(
      request("/api/v1/attendance/resolve?entry=ATTCANCEL"),
      testEnv()
    );
    assert.strictEqual(cancelled.status, 410);
    const cancelledBody = await json(cancelled);
    assert.strictEqual(cancelledBody.code, "EVENT_CANCELLED");

    const closed = await worker.fetch(
      request("/api/v1/attendance/resolve?entry=ATTCLOSED"),
      testEnv()
    );
    assert.strictEqual(closed.status, 409);
    const closedBody = await json(closed);
    assert.strictEqual(closedBody.code, "CHECK_IN_CLOSED");
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
          phone: phoneB,
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
    const { attendance_id } = (await json(checkIn)).data as {
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
});
