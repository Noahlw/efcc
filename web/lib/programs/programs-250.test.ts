import assert from "node:assert/strict";

import { env } from "cloudflare:workers";
import { beforeAll, describe, test } from "vitest";

import worker from "../../worker";
import type { Env } from "../../worker";
import { importLegacyUsers } from "../auth/accounts";
import { ACCESS_COOKIE_NAME } from "../auth/cookies";
import { applyMigrations, testDb } from "../auth/test-bootstrap";
import { completeCredentialUpgrade } from "../auth/upgrade";

const LEGACY_HEADER = [
  "User_ID",
  "Name",
  "Username",
  "PIN_Code",
  "System_Role",
  "Status",
];
const SECRET = "test-access-token-secret";
const HOST = "https://efcc.example";

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...(env as unknown as Env),
    EFCC_ACCESS_TOKEN_SECRET: SECRET,
    ...overrides,
  };
}

function request(
  path: string,
  init: { method?: string; cookie: string; body?: unknown }
): Request {
  return new Request(`${HOST}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Origin: HOST,
      Cookie: `${ACCESS_COOKIE_NAME}=${init.cookie}`,
      ...(init.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

async function access(username: string, password: string): Promise<string> {
  const response = await worker.fetch(
    new Request(`${HOST}/api/v1/auth/login`, {
      method: "POST",
      headers: { Origin: HOST, "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }),
    testEnv()
  );
  assert.equal(response.status, 200);
  const cookie = response.headers
    .getSetCookie()
    .find((value: string) => value.startsWith(`${ACCESS_COOKIE_NAME}=`));
  assert.ok(cookie);
  return cookie.split(";")[0].slice(ACCESS_COOKIE_NAME.length + 1);
}

async function createDepartment(cookie: string, code: string): Promise<string> {
  const response = await worker.fetch(
    request("/api/v1/programs/departments", {
      method: "POST",
      cookie,
      body: { code, name: code, lifecycle: "Draft" },
    }),
    testEnv()
  );
  assert.equal(response.status, 201);
  const body = (await response.json()) as {
    data: { department: { department_id: string } };
  };
  const departmentId = body.data.department.department_id;
  for (const moduleKey of ["program_catalog", "events", "enrollment"]) {
    const enabled = await worker.fetch(
      request(
        `/api/v1/programs/departments/${departmentId}/modules/${moduleKey}/enable`,
        {
          method: "POST",
          cookie,
        }
      ),
      testEnv()
    );
    assert.equal(enabled.status, 200);
  }
  return departmentId;
}

async function createProgram(
  cookie: string,
  departmentId: string,
  name: string,
  behaviorType: "Recurring" | "OneOff" = "OneOff"
): Promise<string> {
  const response = await worker.fetch(
    request(`/api/v1/programs/departments/${departmentId}/programs`, {
      method: "POST",
      cookie,
      body: {
        description: "測試目的",
        name,
        category: "E2E Category",
        behavior_type: behaviorType,
        lifecycle: "Active",
        discoverability: "Listed",
        enrollment_mode: "MemberRequest",
      },
    }),
    testEnv()
  );
  assert.equal(response.status, 201);
  const body = (await response.json()) as {
    data: { program: { program_id: string } };
  };
  return body.data.program.program_id;
}

describe("MUI-02: Program lifecycle and behavior", () => {
  beforeAll(async () => {
    await applyMigrations();
    await importLegacyUsers(testDb(), [
      LEGACY_HEADER,
      ["U001", "Alice Chan", "alice", "1234", "Admin", "Active"],
      ["U002", "Bob Lee", "bob", "5678", "Member", "Active"],
      ["U003", "Carol Ng", "carol", "4321", "Admin", "Active"],
    ]);
    await completeCredentialUpgrade(testDb(), {
      userId: "U001",
      legacyPin: "1234",
      newCredential: "alice-secret",
    });
    await completeCredentialUpgrade(testDb(), {
      userId: "U002",
      legacyPin: "5678",
      newCredential: "bob-secret",
    });
    await completeCredentialUpgrade(testDb(), {
      userId: "U003",
      legacyPin: "4321",
      newCredential: "carol-secret",
    });
    const adminRoleDefinitionId = "programs-250-admin";
    const seededAt = "2026-08-31T00:00:00.000Z";
    await testDb()
      .prepare(
        `INSERT OR IGNORE INTO role_definitions
          (role_definition_id, category_key, stable_key, label, description,
           scope_kind, scope_id, position, is_protected, is_archived,
           created_by, created_at, updated_by, updated_at)
         VALUES (?, 'Global', 'admin', '系統管理員',
                 '全教會唯一可改變授權政策、發佈首頁內容的身份。',
                 'Global', NULL, 0, 1, 0, NULL, ?, NULL, ?)`
      )
      .bind(adminRoleDefinitionId, seededAt, seededAt)
      .run();
    await testDb().batch(
      ["U001", "U003"].map((accountUserId) =>
        testDb()
          .prepare(
            `INSERT OR IGNORE INTO role_assignments
              (assignment_id, account_user_id, role_definition_id,
               granted_by, granted_at, revoked_by, revoked_at, revoke_reason,
               scope_kind, scope_id)
             VALUES (?, ?, ?, 'U001', ?, NULL, NULL, NULL, 'Global', NULL)`
          )
          .bind(
            `programs-250-admin-assignment-${accountUserId}`,
            accountUserId,
            adminRoleDefinitionId,
            seededAt
          )
      )
    );
  });

  test("OneOff accepts multiple independent manual Events", async () => {
    const admin = await access("alice", "alice-secret");
    const departmentId = await createDepartment(admin, `MUI250-${Date.now()}`);
    const programId = await createProgram(
      admin,
      departmentId,
      `OneOff-${Date.now()}`
    );
    for (const [starts_at, ends_at] of [
      ["2096-12-01T10:00:00.000Z", "2096-12-01T11:00:00.000Z"],
      ["2096-12-08T10:00:00.000Z", "2096-12-08T11:00:00.000Z"],
    ]) {
      const event = await worker.fetch(
        request(`/api/v1/programs/${programId}/events`, {
          method: "POST",
          cookie: admin,
          body: { starts_at, ends_at },
        }),
        testEnv()
      );
      assert.equal(event.status, 201);
    }
    const listed = await worker.fetch(
      request(`/api/v1/programs/${programId}/events`, { cookie: admin }),
      testEnv()
    );
    assert.equal(listed.status, 200);
    const body = (await listed.json()) as {
      data: { events: { starts_at: string }[] };
    };
    assert.equal(body.data.events.length, 2);
  });

  test("management directory exposes an empty permitted Department for creation", async () => {
    const admin = await access("alice", "alice-secret");
    const code = `MUI250-EMPTY-${Date.now()}`;
    const departmentId = await createDepartment(admin, code);
    const response = await worker.fetch(
      request("/api/v1/programs/management-directory", { cookie: admin }),
      testEnv()
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      data: {
        departments: { department_id: string }[];
        programs: { department_id?: string }[];
      };
    };
    assert.ok(
      body.data.departments.some(
        (department) => department.department_id === departmentId
      )
    );
    assert.equal(
      body.data.programs.filter(
        (program) => program.department_id === departmentId
      ).length,
      0
    );
  });

  test("archive rejects future Active Events and records a conflict audit", async () => {
    const admin = await access("alice", "alice-secret");
    const departmentId = await createDepartment(
      admin,
      `MUI250-A-${Date.now()}`
    );
    const programId = await createProgram(
      admin,
      departmentId,
      `Archive-${Date.now()}`
    );
    const event = await worker.fetch(
      request(`/api/v1/programs/${programId}/events`, {
        method: "POST",
        cookie: admin,
        body: {
          starts_at: "2099-12-01T10:00:00.000Z",
          ends_at: "2099-12-01T11:00:00.000Z",
        },
      }),
      testEnv()
    );
    assert.equal(event.status, 201);
    const archive = await worker.fetch(
      request(`/api/v1/programs/${programId}`, {
        method: "PATCH",
        cookie: admin,
        body: { lifecycle: "Archived" },
      }),
      testEnv()
    );
    assert.equal(archive.status, 409);
    const body = (await archive.json()) as { code: string; detail?: string };
    assert.equal(body.code, "PROGRAM_ARCHIVE_BLOCKED");
    // The commitment reason is machine-carried in detail so the client can
    // distinguish it from the cross-actor 'already_archived' block.
    assert.equal(body.detail, "future_active_event");
    const audit = await testDb()
      .prepare(
        "SELECT outcome FROM audit_events WHERE action = 'PROGRAM_ARCHIVE' AND entity_id = ? ORDER BY inserted_at DESC LIMIT 1"
      )
      .bind(programId)
      .first<{ outcome: string }>();
    assert.equal(audit?.outcome, "CONFLICT");
  });

  test("archive rejects a pending enrollment request", async () => {
    const admin = await access("alice", "alice-secret");
    const member = await access("bob", "bob-secret");
    const departmentId = await createDepartment(
      admin,
      `MUI250-P-${Date.now()}`
    );
    const programId = await createProgram(
      admin,
      departmentId,
      `Pending-${Date.now()}`
    );
    const requestResponse = await worker.fetch(
      request(`/api/v1/programs/${programId}/enrollment-requests`, {
        method: "POST",
        cookie: member,
        body: {},
      }),
      testEnv()
    );
    assert.equal(requestResponse.status, 201);
    const archive = await worker.fetch(
      request(`/api/v1/programs/${programId}`, {
        method: "PATCH",
        cookie: admin,
        body: { lifecycle: "Archived" },
      }),
      testEnv()
    );
    assert.equal(archive.status, 409);
  });

  test("create with lifecycle Archived is rejected with an honest validation message", async () => {
    const admin = await access("alice", "alice-secret");
    const departmentId = await createDepartment(
      admin,
      `MUI250-CREATE-${Date.now()}`
    );
    const created = await worker.fetch(
      request(`/api/v1/programs/departments/${departmentId}/programs`, {
        method: "POST",
        cookie: admin,
        body: {
          description: "已存檔課程不可直接建立",
          name: `NeverArchived-${Date.now()}`,
          category: "E2E Category",
          behavior_type: "OneOff",
          lifecycle: "Archived",
          discoverability: "Listed",
          enrollment_mode: "MemberRequest",
        },
      }),
      testEnv()
    );
    assert.equal(created.status, 422);
    const body = (await created.json()) as { code: string; detail?: string };
    assert.equal(body.code, "VALIDATION");
    assert.equal(
      body.detail,
      "Programs cannot be created directly in the Archived state."
    );
    assert.ok(
      !body.detail?.includes("transition"),
      "create-time rejection must not be framed as a lifecycle transition"
    );
  });

  test("cross-scope mutation is denied and leaves the Program unchanged", async () => {
    const admin = await access("alice", "alice-secret");
    const member = await access("bob", "bob-secret");
    const departmentId = await createDepartment(
      admin,
      `MUI250-S-${Date.now()}`
    );
    const originalName = `Scoped-${Date.now()}`;
    const programId = await createProgram(admin, departmentId, originalName);
    const denied = await worker.fetch(
      request(`/api/v1/programs/${programId}`, {
        method: "PATCH",
        cookie: member,
        body: { name: "Unauthorized rename" },
      }),
      testEnv()
    );
    assert.equal(denied.status, 403);
    const row = await testDb()
      .prepare("SELECT name FROM programs WHERE program_id = ?")
      .bind(programId)
      .first<{ name: string }>();
    assert.equal(row?.name, originalName);
  });

  test("archive preserves historical Event and Attendance evidence", async () => {
    const admin = await access("alice", "alice-secret");
    const departmentId = await createDepartment(
      admin,
      `MUI250-H-${Date.now()}`
    );
    const programName = `History-${Date.now()}`;
    const programId = await createProgram(admin, departmentId, programName);
    const event = await worker.fetch(
      request(`/api/v1/programs/${programId}/events`, {
        method: "POST",
        cookie: admin,
        body: {
          starts_at: "2020-12-01T10:00:00.000Z",
          ends_at: "2020-12-01T11:00:00.000Z",
        },
      }),
      testEnv()
    );
    assert.equal(event.status, 201);
    const eventBody = (await event.json()) as {
      data: { event: { event_id: string } };
    };
    const eventId = eventBody.data.event.event_id;
    const checkedInAt = "2020-12-01T10:15:00.000Z";
    await testDb()
      .prepare(
        `INSERT INTO attendances (
           attendance_id, event_id, member_user_id, method, status,
           checked_in_at
         ) VALUES (?, ?, 'U002', 'leader_manual_search', 'Active', ?)`
      )
      .bind(crypto.randomUUID(), eventId, checkedInAt)
      .run();
    const archive = await worker.fetch(
      request(`/api/v1/programs/${programId}`, {
        method: "PATCH",
        cookie: admin,
        body: { lifecycle: "Archived" },
      }),
      testEnv()
    );
    assert.equal(archive.status, 200);
    const audit = await testDb()
      .prepare(
        "SELECT action, outcome FROM audit_events WHERE entity_id = ? AND action = 'PROGRAM_ARCHIVE' ORDER BY inserted_at DESC LIMIT 1"
      )
      .bind(programId)
      .first<{ action: string; outcome: string }>();
    assert.deepEqual(audit, { action: "PROGRAM_ARCHIVE", outcome: "SUCCESS" });
    const program = await testDb()
      .prepare("SELECT lifecycle, name FROM programs WHERE program_id = ?")
      .bind(programId)
      .first<{ lifecycle: string; name: string }>();
    assert.deepEqual(program, { lifecycle: "Archived", name: programName });
    const evidence = await testDb()
      .prepare(
        `SELECT e.status AS event_status, a.status AS attendance_status,
                a.checked_in_at
           FROM events e
           JOIN attendances a ON a.event_id = e.event_id
          WHERE e.event_id = ?`
      )
      .bind(eventId)
      .first<{
        event_status: string;
        attendance_status: string;
        checked_in_at: string;
      }>();
    assert.deepEqual(evidence, {
      event_status: "Active",
      attendance_status: "Active",
      checked_in_at: checkedInAt,
    });
  });

  test("same-actor repeated archive is a quiet 200 with a DUPLICATE audit", async () => {
    const admin = await access("alice", "alice-secret");
    const departmentId = await createDepartment(
      admin,
      `MUI250-R-${Date.now()}`
    );
    const programId = await createProgram(
      admin,
      departmentId,
      `Repeat-${Date.now()}`
    );
    const archive = () =>
      worker.fetch(
        request(`/api/v1/programs/${programId}`, {
          method: "PATCH",
          cookie: admin,
          body: { lifecycle: "Archived" },
        }),
        testEnv()
      );
    assert.equal((await archive()).status, 200);
    assert.equal((await archive()).status, 200);
    const audits = await testDb()
      .prepare(
        "SELECT outcome FROM audit_events WHERE action = 'PROGRAM_ARCHIVE' AND entity_id = ? ORDER BY inserted_at ASC"
      )
      .bind(programId)
      .all<{ outcome: string }>();
    assert.deepEqual(
      audits.results?.map((row) => row.outcome),
      ["SUCCESS", "DUPLICATE"]
    );
  });

  test("cross-actor archive repeat is a 409 CONFLICT audit", async () => {
    const admin = await access("alice", "alice-secret");
    const otherAdmin = await access("carol", "carol-secret");
    const departmentId = await createDepartment(
      admin,
      `MUI250-C-${Date.now()}`
    );
    const programId = await createProgram(
      admin,
      departmentId,
      `Cross-${Date.now()}`
    );
    const archiveBy = (cookie: string) =>
      worker.fetch(
        request(`/api/v1/programs/${programId}`, {
          method: "PATCH",
          cookie,
          body: { lifecycle: "Archived" },
        }),
        testEnv()
      );
    assert.equal((await archiveBy(admin)).status, 200);
    const second = await archiveBy(otherAdmin);
    assert.equal(second.status, 409);
    const body = (await second.json()) as { code: string; detail?: string };
    assert.equal(body.code, "PROGRAM_ARCHIVE_BLOCKED");
    // Cross-actor repeat is 'already_archived', NOT an unresolved-commitment
    // block: the client must not show the future-commitment copy for it.
    assert.equal(body.detail, "already_archived");
    const audits = await testDb()
      .prepare(
        "SELECT outcome FROM audit_events WHERE action = 'PROGRAM_ARCHIVE' AND entity_id = ? ORDER BY inserted_at ASC"
      )
      .bind(programId)
      .all<{ outcome: string }>();
    assert.deepEqual(
      audits.results?.map((row) => row.outcome),
      ["SUCCESS", "CONFLICT"]
    );
  });

  test("editing an archived program still updates its metadata", async () => {
    const admin = await access("alice", "alice-secret");
    const departmentId = await createDepartment(
      admin,
      `MUI250-E-${Date.now()}`
    );
    const programId = await createProgram(
      admin,
      departmentId,
      `ArchivedEdit-${Date.now()}`
    );
    assert.equal(
      (
        await worker.fetch(
          request(`/api/v1/programs/${programId}`, {
            method: "PATCH",
            cookie: admin,
            body: { lifecycle: "Archived" },
          }),
          testEnv()
        )
      ).status,
      200
    );
    const edited = await worker.fetch(
      request(`/api/v1/programs/${programId}`, {
        method: "PATCH",
        cookie: admin,
        body: {
          name: "Renamed After Archive",
          category: "新類別",
          lifecycle: "Archived",
        },
      }),
      testEnv()
    );
    assert.equal(edited.status, 200);
    const row = await testDb()
      .prepare(
        "SELECT name, category, lifecycle FROM programs WHERE program_id = ?"
      )
      .bind(programId)
      .first<{ name: string; category: string; lifecycle: string }>();
    assert.deepEqual(row, {
      name: "Renamed After Archive",
      category: "新類別",
      lifecycle: "Archived",
    });
    const audit = await testDb()
      .prepare(
        "SELECT action, outcome FROM audit_events WHERE action = 'PROGRAM_UPDATE' AND entity_id = ? ORDER BY inserted_at DESC LIMIT 1"
      )
      .bind(programId)
      .first<{ action: string; outcome: string }>();
    assert.deepEqual(audit, { action: "PROGRAM_UPDATE", outcome: "SUCCESS" });
  });

  test("clearing category with null on update is accepted", async () => {
    const admin = await access("alice", "alice-secret");
    const departmentId = await createDepartment(
      admin,
      `MUI250-N-${Date.now()}`
    );
    const programId = await createProgram(
      admin,
      departmentId,
      `NullCategory-${Date.now()}`
    );
    const cleared = await worker.fetch(
      request(`/api/v1/programs/${programId}`, {
        method: "PATCH",
        cookie: admin,
        body: { category: null },
      }),
      testEnv()
    );
    assert.equal(cleared.status, 200);
    const row = await testDb()
      .prepare("SELECT category FROM programs WHERE program_id = ?")
      .bind(programId)
      .first<{ category: string | null }>();
    assert.equal(row?.category, null);
  });
});

describe("CFG-01: scope-owned Program Settings", () => {
  test("management read exposes attendance defaults and update is audited", async () => {
    const admin = await access("alice", "alice-secret");
    const departmentId = await createDepartment(
      admin,
      `CFG254-${Date.now()}`
    );
    const programId = await createProgram(
      admin,
      departmentId,
      `RecurringSettings-${Date.now()}`,
      "Recurring"
    );

    const management = await worker.fetch(
      request(`/api/v1/programs/${programId}/management`, { cookie: admin }),
      testEnv()
    );
    assert.equal(management.status, 200);
    const managementBody = (await management.json()) as {
      data: {
        program: {
          check_in_opens_at_minutes_before_start?: number;
          check_in_closes_at_minutes_after_end?: number;
          check_in_token?: string;
        };
      };
    };
    assert.equal(
      managementBody.data.program.check_in_opens_at_minutes_before_start,
      15
    );
    assert.equal(
      managementBody.data.program.check_in_closes_at_minutes_after_end,
      0
    );
    assert.equal("check_in_token" in managementBody.data.program, false);

    const updated = await worker.fetch(
      request(`/api/v1/programs/${programId}`, {
        method: "PATCH",
        cookie: admin,
        body: {
          check_in_opens_at_minutes_before_start: 30,
          check_in_closes_at_minutes_after_end: 10,
        },
      }),
      testEnv()
    );
    assert.equal(updated.status, 200);
    const updatedBody = (await updated.json()) as {
      data: {
        program: {
          check_in_opens_at_minutes_before_start: number;
          check_in_closes_at_minutes_after_end: number;
          check_in_token?: string;
        };
      };
    };
    assert.equal(
      updatedBody.data.program.check_in_opens_at_minutes_before_start,
      30
    );
    assert.equal(
      updatedBody.data.program.check_in_closes_at_minutes_after_end,
      10
    );
    assert.equal("check_in_token" in updatedBody.data.program, false);

    const row = await testDb()
      .prepare(
        "SELECT check_in_opens_at_minutes_before_start, check_in_closes_at_minutes_after_end FROM programs WHERE program_id = ?"
      )
      .bind(programId)
      .first<{
        check_in_opens_at_minutes_before_start: number;
        check_in_closes_at_minutes_after_end: number;
      }>();
    assert.deepEqual(row, {
      check_in_opens_at_minutes_before_start: 30,
      check_in_closes_at_minutes_after_end: 10,
    });
    const audit = await testDb()
      .prepare(
        "SELECT action, outcome FROM audit_events WHERE action = 'PROGRAM_UPDATE' AND entity_id = ? ORDER BY inserted_at DESC LIMIT 1"
      )
      .bind(programId)
      .first<{ action: string; outcome: string }>();
    assert.deepEqual(audit, { action: "PROGRAM_UPDATE", outcome: "SUCCESS" });
  });

  test("attendance defaults reject invalid values and member mutation stays forbidden", async () => {
    const admin = await access("alice", "alice-secret");
    const member = await access("bob", "bob-secret");
    const departmentId = await createDepartment(
      admin,
      `CFG254-VALIDATE-${Date.now()}`
    );
    const programId = await createProgram(
      admin,
      departmentId,
      `AttendanceSettings-${Date.now()}`,
      "Recurring"
    );

    const invalid = await worker.fetch(
      request(`/api/v1/programs/${programId}`, {
        method: "PATCH",
        cookie: admin,
        body: { check_in_opens_at_minutes_before_start: -1 },
      }),
      testEnv()
    );
    assert.equal(invalid.status, 422);

    const denied = await worker.fetch(
      request(`/api/v1/programs/${programId}`, {
        method: "PATCH",
        cookie: member,
        body: { check_in_closes_at_minutes_after_end: 20 },
      }),
      testEnv()
    );
    assert.equal(denied.status, 403);
    const deniedAudit = await testDb()
      .prepare(
        "SELECT action, outcome FROM audit_events WHERE action = 'PROGRAM_UPDATE' AND entity_id = ? ORDER BY inserted_at DESC LIMIT 1"
      )
      .bind(programId)
      .first<{ action: string; outcome: string }>();
    assert.deepEqual(deniedAudit, {
      action: "PROGRAM_UPDATE",
      outcome: "DENIED",
    });
  });
});
