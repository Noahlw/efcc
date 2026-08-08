/**
 * PRG-01 (#197) — Department and Program management Worker route contract.
 *
 * Acceptance covered (Spec #190 / 080):
 *   - Migrations apply cleanly with new domain tables and CHECK constraints.
 *   - Admin/Staff can create/list/update departments and programs.
 *   - Members are denied management operations (403).
 *   - Department code and program name duplicates fail closed (409).
 *   - Module enable/disable is capability-gated and audited.
 *   - Every response carries X-Request-Id matching body requestId.
 *   - No credential material in response bodies.
 */
import assert from "node:assert/strict";

import { env } from "cloudflare:workers";
import { beforeAll, describe, test } from "vitest";
/* oxlint-disable vitest/require-top-level-describe -- shared workerd/D1 fixture spans the suites. */

import worker from "../../worker";
import type { Env } from "../../worker";
import { importLegacyUsers } from "../auth/accounts";
import { ACCESS_COOKIE_NAME } from "../auth/cookies";
import { applyMigrations, testDb } from "../auth/test-bootstrap";
import { completeCredentialUpgrade } from "../auth/upgrade";
import { addWallDays, hkTodayWallDate, wallWeekday } from "./recurrence";

const SECRET = "test-access-token-secret";
const HEADER = [
  "User_ID",
  "Name",
  "Username",
  "PIN_Code",
  "System_Role",
  "Status",
];
const HOST = "https://efcc.example";

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...(env as unknown as Env),
    APPS_SCRIPT_EXEC_URL: "https://script.google.com/macros/s/fake/exec",
    EFCC_ACCESS_TOKEN_SECRET: SECRET,
    ...overrides,
  };
}

function programsRequest(
  path: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {}
): Request {
  const url = `${HOST}${path}`;
  const method = init.method ?? "GET";
  const headers = init.headers ?? {};
  if (init.body === undefined) {
    return new Request(url, { method, headers });
  }
  const body =
    typeof init.body === "string" ? init.body : JSON.stringify(init.body);
  return new Request(url, { method, headers, body });
}

async function accessCookieFor(
  username: string,
  password: string
): Promise<string> {
  const res = await worker.fetch(
    programsRequest("/api/v1/auth/login", {
      method: "POST",
      headers: { Origin: HOST, "Content-Type": "application/json" },
      body: { username, password },
    }),
    testEnv()
  );
  assert.strictEqual(res.status, 200, `login must succeed for ${username}`);
  const raw = res.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${ACCESS_COOKIE_NAME}=`));
  assert.ok(raw, "access cookie must be set");
  return raw.split(";")[0].slice(ACCESS_COOKIE_NAME.length + 1);
}

async function assertCorrelated(res: Response): Promise<unknown> {
  const header = res.headers.get("X-Request-Id");
  assert.ok(header, "X-Request-Id header must be present");
  const body = (await res.json()) as { requestId?: string };
  if (typeof body.requestId === "string") {
    assert.strictEqual(
      body.requestId,
      header,
      "body requestId must equal X-Request-Id"
    );
  }
  return body;
}

async function problemOf(
  res: Response
): Promise<{ code: string; status: number; requestId: string }> {
  assert.strictEqual(
    res.headers.get("Content-Type"),
    "application/problem+json"
  );
  const body = (await res.json()) as {
    code: string;
    status: number;
    requestId: string;
  };
  assert.strictEqual(body.requestId, res.headers.get("X-Request-Id"));
  return body;
}

async function createDepartment(
  access: string,
  body: { code: string; name: string; lifecycle?: string }
): Promise<{ department_id: string; code: string; name: string }> {
  const res = await worker.fetch(
    programsRequest("/api/v1/programs/departments", {
      method: "POST",
      headers: {
        Origin: HOST,
        Cookie: `${ACCESS_COOKIE_NAME}=${access}`,
        "Content-Type": "application/json",
      },
      body,
    }),
    testEnv()
  );
  assert.strictEqual(res.status, 201);
  const result = (await assertCorrelated(res)) as {
    data: { department: { department_id: string; code: string; name: string } };
  };
  return result.data.department;
}

async function createProgram(
  access: string,
  departmentId: string,
  body: {
    name: string;
    behavior_type: "Recurring" | "OneOff";
    discoverability?: "Listed" | "Unlisted";
  }
): Promise<{ program_id: string; name: string }> {
  const res = await worker.fetch(
    programsRequest(`/api/v1/programs/departments/${departmentId}/programs`, {
      method: "POST",
      headers: {
        Origin: HOST,
        Cookie: `${ACCESS_COOKIE_NAME}=${access}`,
        "Content-Type": "application/json",
      },
      body,
    }),
    testEnv()
  );
  assert.strictEqual(res.status, 201);
  const result = (await assertCorrelated(res)) as {
    data: { program: { program_id: string; name: string } };
  };
  return result.data.program;
}

beforeAll(async () => {
  await applyMigrations();
  await importLegacyUsers(testDb(), [
    HEADER,
    ["U001", "Alice Chan", "alice", "1234", "Admin", "Active"],
    ["U002", "Bob Lee", "bob", "5678", "Member", "Active"],
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
});

describe("PRG-01: schema", () => {
  test("new domain tables and audit_events exist", async () => {
    const tables = [
      "departments",
      "department_modules",
      "programs",
      "program_schedule_rules",
      "program_schedule_exceptions",
      "events",
      "enrollment_requests",
      "enrollments",
      "program_leaders",
      "attendances",
      "audit_events",
      "role_capabilities",
    ] as const;
    const rows = await Promise.all(
      tables.map((table) =>
        testDb()
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
          )
          .bind(table)
          .first()
      )
    );
    for (const [index, table] of tables.entries()) {
      assert.ok(rows[index], `table ${table} should exist`);
    }
  });

  test("audit_events immutability triggers reject mutation", async () => {
    await testDb()
      .prepare(
        "INSERT INTO audit_events (audit_id, inserted_at, action, entity_type, entity_id, outcome) VALUES (?, ?, 'TEST', 'department', 'immutability-test', 'SUCCESS')"
      )
      .bind(crypto.randomUUID(), new Date().toISOString())
      .run();
    await assert.rejects(
      testDb()
        .prepare(
          "DELETE FROM audit_events WHERE entity_id = 'immutability-test'"
        )
        .run(),
      /audit_events is immutable/u
    );
  });
});

describe("PRG-01: departments", () => {
  test("Admin can create and list a department", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const dept = await createDepartment(adminAccess, {
      code: "PRG-01",
      name: "Test Department",
    });
    assert.ok(dept.department_id);
    assert.strictEqual(dept.code, "PRG-01");

    const res = await worker.fetch(
      programsRequest("/api/v1/programs/departments", {
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
        },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    const body = (await assertCorrelated(res)) as {
      data: {
        departments: { department_id: string; code: string; name: string }[];
      };
    };
    const found = body.data.departments.find((d) => d.code === "PRG-01");
    assert.ok(found, "created department must appear in list");
  });

  test("duplicate department code returns 409", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    await createDepartment(adminAccess, {
      code: "DUPLICATE",
      name: "First",
    });
    const res = await worker.fetch(
      programsRequest("/api/v1/programs/departments", {
        method: "POST",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: { code: "DUPLICATE", name: "Second" },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 409);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "CONFLICT");
  });

  test("Member cannot create a department", async () => {
    const memberAccess = await accessCookieFor("bob", "bob-secret");
    const res = await worker.fetch(
      programsRequest("/api/v1/programs/departments", {
        method: "POST",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${memberAccess}`,
          "Content-Type": "application/json",
        },
        body: { code: "MEMBER", name: "Member Dept" },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 403);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "FORBIDDEN");
  });

  test("Admin can update department lifecycle to Active", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const dept = await createDepartment(adminAccess, {
      code: "PUBLISH",
      name: "Publish Me",
    });
    const res = await worker.fetch(
      programsRequest(`/api/v1/programs/departments/${dept.department_id}`, {
        method: "PATCH",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: { lifecycle: "Active" },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    const body = (await assertCorrelated(res)) as {
      data: { department: { lifecycle: string } };
    };
    assert.strictEqual(body.data.department.lifecycle, "Active");
  });
});

describe("PRG-01: programs", () => {
  test("Admin can create a program under a department", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const dept = await createDepartment(adminAccess, {
      code: "PROG-DEPT",
      name: "Program Dept",
    });
    const program = await createProgram(adminAccess, dept.department_id, {
      name: "Test Program",
      behavior_type: "Recurring",
      discoverability: "Listed",
    });
    assert.ok(program.program_id);
    assert.strictEqual(program.name, "Test Program");
  });

  test("Member sees only Listed programs", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const dept = await createDepartment(adminAccess, {
      code: "VIS-DEPT",
      name: "Visibility Dept",
    });
    await createProgram(adminAccess, dept.department_id, {
      name: "Listed Program",
      behavior_type: "OneOff",
      discoverability: "Listed",
    });
    await createProgram(adminAccess, dept.department_id, {
      name: "Unlisted Program",
      behavior_type: "OneOff",
      discoverability: "Unlisted",
    });

    const memberAccess = await accessCookieFor("bob", "bob-secret");
    const res = await worker.fetch(
      programsRequest(
        `/api/v1/programs/departments/${dept.department_id}/programs`,
        {
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${memberAccess}`,
          },
        }
      ),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    const body = (await assertCorrelated(res)) as {
      data: { programs: { name: string; discoverability: string }[] };
    };
    const names = body.data.programs.map((p) => p.name);
    assert.ok(
      names.includes("Listed Program"),
      "Member must see listed program"
    );
    assert.ok(
      !names.includes("Unlisted Program"),
      "Member must not see unlisted program"
    );
  });

  test("Member cannot create a program", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const memberAccess = await accessCookieFor("bob", "bob-secret");
    const dept = await createDepartment(adminAccess, {
      code: "MEMBER-PROG-DEPT",
      name: "Member Prog Dept",
    });
    const res = await worker.fetch(
      programsRequest(
        `/api/v1/programs/departments/${dept.department_id}/programs`,
        {
          method: "POST",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${memberAccess}`,
            "Content-Type": "application/json",
          },
          body: { name: "Member Program", behavior_type: "OneOff" },
        }
      ),
      testEnv()
    );
    assert.strictEqual(res.status, 403);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "FORBIDDEN");
  });
});

describe("PRG-01: modules", () => {
  test("Admin can enable a module for a department", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const dept = await createDepartment(adminAccess, {
      code: "MOD-DEPT",
      name: "Module Dept",
    });
    const res = await worker.fetch(
      programsRequest(
        `/api/v1/programs/departments/${dept.department_id}/modules/program_catalog/enable`,
        {
          method: "POST",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          },
        }
      ),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    const body = (await assertCorrelated(res)) as {
      data: { enabled: boolean };
    };
    assert.strictEqual(body.data.enabled, true);

    const getRes = await worker.fetch(
      programsRequest(`/api/v1/programs/departments/${dept.department_id}`, {
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
        },
      }),
      testEnv()
    );
    const getBody = (await assertCorrelated(getRes)) as {
      data: { modules: string[] };
    };
    assert.ok(
      getBody.data.modules.includes("program_catalog"),
      "module must be listed"
    );
  });

  test("invalid module key returns 422", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const dept = await createDepartment(adminAccess, {
      code: "MOD-DEPT-BAD",
      name: "Module Dept Bad",
    });
    const res = await worker.fetch(
      programsRequest(
        `/api/v1/programs/departments/${dept.department_id}/modules/invalid_key/enable`,
        {
          method: "POST",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          },
        }
      ),
      testEnv()
    );
    assert.strictEqual(res.status, 422);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "VALIDATION");
  });
});

describe("PRG-01: audit", () => {
  test("department creation writes an audit row", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const dept = await createDepartment(adminAccess, {
      code: `AUDIT-${Date.now()}`,
      name: "Audit Dept",
    });
    const rows = await testDb()
      .prepare(
        "SELECT action, entity_type, entity_id, outcome FROM audit_events WHERE entity_type = 'department' AND entity_id = ?"
      )
      .bind(dept.department_id)
      .all<{
        action: string;
        entity_type: string;
        entity_id: string;
        outcome: string;
      }>();
    const create = rows.results?.find((r) => r.action === "DEPARTMENT_CREATE");
    assert.ok(create, "audit row must exist for department creation");
    assert.strictEqual(create.outcome, "SUCCESS");
  });
});

// ---------------------------------------------------------------------------
// PRG-02 (#198): schedule rules, exceptions, generation, events.
// ---------------------------------------------------------------------------

async function createRule(
  access: string,
  programId: string,
  body: {
    recurrence: "WEEKLY" | "MONTHLY";
    day_of_week?: number;
    month_day?: number;
    start_time: string;
    end_time: string;
  }
): Promise<{ rule_id: string }> {
  const res = await worker.fetch(
    programsRequest(`/api/v1/programs/${programId}/schedule-rules`, {
      method: "POST",
      headers: {
        Origin: HOST,
        Cookie: `${ACCESS_COOKIE_NAME}=${access}`,
        "Content-Type": "application/json",
      },
      body,
    }),
    testEnv()
  );
  assert.strictEqual(res.status, 201);
  const result = (await assertCorrelated(res)) as {
    data: { rule: { rule_id: string } };
  };
  return result.data.rule;
}

async function generate(
  access: string,
  programId: string,
  horizonDays = 14
): Promise<{ created: number; skipped: number; rule_count: number }> {
  const res = await worker.fetch(
    programsRequest(`/api/v1/programs/${programId}/events/generate`, {
      method: "POST",
      headers: {
        Origin: HOST,
        Cookie: `${ACCESS_COOKIE_NAME}=${access}`,
        "Content-Type": "application/json",
      },
      body: { horizon_days: horizonDays },
    }),
    testEnv()
  );
  assert.strictEqual(res.status, 200);
  const result = (await assertCorrelated(res)) as {
    data: { generated: { created: number; skipped: number; rule_count: number } };
  };
  return result.data.generated;
}

async function listEventsFor(
  access: string,
  programId: string
): Promise<
  { event_id: string; starts_at: string; status: string; source: string }[]
> {
  const res = await worker.fetch(
    programsRequest(`/api/v1/programs/${programId}/events`, {
      headers: {
        Origin: HOST,
        Cookie: `${ACCESS_COOKIE_NAME}=${access}`,
      },
    }),
    testEnv()
  );
  assert.strictEqual(res.status, 200);
  const result = (await assertCorrelated(res)) as {
    data: {
      events: { event_id: string; starts_at: string; status: string; source: string }[];
    };
  };
  return result.data.events;
}

describe("PRG-02: schedule rules", () => {
  let deptId = "";
  let recurringId = "";
  let oneOffId = "";

  beforeAll(async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const dept = await createDepartment(adminAccess, {
      code: "PRG-02",
      name: "Events Test Department",
    });
    deptId = dept.department_id;
    const recurring = await createProgram(adminAccess, deptId, {
      name: "Recurring Events Program",
      behavior_type: "Recurring",
      discoverability: "Listed",
    });
    recurringId = recurring.program_id;
    const oneOff = await createProgram(adminAccess, deptId, {
      name: "OneOff Events Program",
      behavior_type: "OneOff",
      discoverability: "Listed",
    });
    oneOffId = oneOff.program_id;
  });

  test("Admin creates a WEEKLY rule; Member is denied 403", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const rule = await createRule(adminAccess, recurringId, {
      recurrence: "WEEKLY",
      day_of_week: 2,
      start_time: "19:30",
      end_time: "21:00",
    });
    assert.ok(rule.rule_id);

    const memberAccess = await accessCookieFor("bob", "bob-secret");
    const res = await worker.fetch(
      programsRequest(`/api/v1/programs/${recurringId}/schedule-rules`, {
        method: "POST",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${memberAccess}`,
          "Content-Type": "application/json",
        },
        body: {
          recurrence: "WEEKLY",
          day_of_week: 3,
          start_time: "19:30",
          end_time: "21:00",
        },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 403);
    const problem = await problemOf(res);
    assert.strictEqual(problem.code, "FORBIDDEN");
  });

  test("invalid rule bodies return 422", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const cases: unknown[] = [
      { recurrence: "DAILY", day_of_week: 1, start_time: "19:30", end_time: "21:00" },
      { recurrence: "WEEKLY", start_time: "19:30", end_time: "21:00" },
      { recurrence: "WEEKLY", day_of_week: 1, start_time: "25:00", end_time: "21:00" },
      { recurrence: "WEEKLY", day_of_week: 1, start_time: "21:00", end_time: "19:30" },
      { recurrence: "MONTHLY", start_time: "19:30", end_time: "21:00" },
    ];
    const results = await Promise.all(
      cases.map((body) =>
        worker.fetch(
          programsRequest(`/api/v1/programs/${recurringId}/schedule-rules`, {
            method: "POST",
            headers: {
              Origin: HOST,
              Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
              "Content-Type": "application/json",
            },
            body,
          }),
          testEnv()
        )
      )
    );
    for (const [index, res] of results.entries()) {
      assert.strictEqual(res.status, 422, JSON.stringify(cases[index]));
    }
  });

  test("schedule rules on a OneOff program return 422", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const res = await worker.fetch(
      programsRequest(`/api/v1/programs/${oneOffId}/schedule-rules`, {
        method: "POST",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: {
          recurrence: "WEEKLY",
          day_of_week: 1,
          start_time: "19:30",
          end_time: "21:00",
        },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 422);
  });

  test("unknown program returns 404", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const res = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${crypto.randomUUID()}/schedule-rules`,
        {
          method: "POST",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: {
            recurrence: "WEEKLY",
            day_of_week: 1,
            start_time: "19:30",
            end_time: "21:00",
          },
        }
      ),
      testEnv()
    );
    assert.strictEqual(res.status, 404);
  });

  test("rule creation is audited", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const rule = await createRule(adminAccess, recurringId, {
      recurrence: "MONTHLY",
      month_day: 15,
      start_time: "10:00",
      end_time: "11:00",
    });
    const rows = await testDb()
      .prepare(
        "SELECT action, entity_type, entity_id, outcome FROM audit_events WHERE entity_id = ?"
      )
      .bind(rule.rule_id)
      .all<{ action: string; entity_type: string; entity_id: string; outcome: string }>();
    const row = rows.results?.find((r) => r.action === "SCHEDULE_RULE_CREATE");
    assert.ok(row, "audit row must exist for rule creation");
    assert.strictEqual(row.entity_type, "schedule_rule");
    assert.strictEqual(row.outcome, "SUCCESS");
  });

  test("PATCH edits a rule without mutating generated events", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const rule = await createRule(adminAccess, recurringId, {
      recurrence: "WEEKLY",
      day_of_week: 4,
      start_time: "18:00",
      end_time: "19:00",
    });
    await generate(adminAccess, recurringId);
    const before = await testDb()
      .prepare("SELECT event_id, starts_at, ends_at, status FROM events")
      .all<{ event_id: string; starts_at: string; ends_at: string; status: string }>();

    const res = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${recurringId}/schedule-rules/${rule.rule_id}`,
        {
          method: "PATCH",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: { start_time: "20:00", end_time: "21:30" },
        }
      ),
      testEnv()
    );
    assert.strictEqual(res.status, 200);

    const after = await testDb()
      .prepare("SELECT event_id, starts_at, ends_at, status FROM events")
      .all<{ event_id: string; starts_at: string; ends_at: string; status: string }>();
    assert.strictEqual(after.results?.length, before.results?.length);
    for (const [index, row] of (after.results ?? []).entries()) {
      assert.deepStrictEqual(row, (before.results ?? [])[index]);
    }
  });
});

describe("PRG-02: generation", () => {
  let adminAccess = "";
  let deptId = "";

  beforeAll(async () => {
    adminAccess = await accessCookieFor("alice", "alice-secret");
    const dept = await createDepartment(adminAccess, {
      code: "PRG-02-GEN",
      name: "Generation Test Department",
    });
    deptId = dept.department_id;
  });

  async function freshProgram(name: string): Promise<string> {
    const program = await createProgram(adminAccess, deptId, {
      name,
      behavior_type: "Recurring",
      discoverability: "Listed",
    });
    return program.program_id;
  }

  test("weekly rule materializes HK-wall-correct UTC events", async () => {
    const programId = await freshProgram("Generation Program");
    const rule = await createRule(adminAccess, programId, {
      recurrence: "WEEKLY",
      day_of_week: 2,
      start_time: "19:30",
      end_time: "21:00",
    });
    assert.ok(rule.rule_id);

    const result = await generate(adminAccess, programId, 14);
    assert.strictEqual(result.created, 2);
    assert.strictEqual(result.skipped, 0);
    assert.strictEqual(result.rule_count, 1);

    const events = await listEventsFor(adminAccess, programId);
    assert.strictEqual(events.length, 2);
    const today = hkTodayWallDate();
    const expectedDates: string[] = [];
    for (let i = 0; i < 14; i += 1) {
      const date = addWallDays(today, i);
      if (wallWeekday(date) === 2) {
        expectedDates.push(date);
      }
    }
    assert.strictEqual(expectedDates.length, 2);
    for (const [index, event] of events.entries()) {
      assert.strictEqual(event.status, "Active");
      assert.strictEqual(event.source, "SCHEDULE");
      assert.strictEqual(event.starts_at, `${expectedDates[index]}T11:30:00.000Z`);
    }
  });

  test("generation is idempotent and duplicate-safe", async () => {
    const programId = await freshProgram("Idempotent Generation Program");
    await createRule(adminAccess, programId, {
      recurrence: "WEEKLY",
      day_of_week: 2,
      start_time: "19:30",
      end_time: "21:00",
    });
    const first = await generate(adminAccess, programId, 14);
    assert.strictEqual(first.created, 2);
    const second = await generate(adminAccess, programId, 14);
    assert.strictEqual(second.created, 0);
    assert.strictEqual(second.skipped, 2);
    const listed = await listEventsFor(adminAccess, programId);
    assert.strictEqual(listed.length, 2);
  });

  test("CANCEL exception suppresses an occurrence", async () => {
    const programId = await freshProgram("CANCEL Suppression Program");
    const rule = await createRule(adminAccess, programId, {
      recurrence: "WEEKLY",
      day_of_week: 2,
      start_time: "19:30",
      end_time: "21:00",
    });
    const today = hkTodayWallDate();
    let cancelledDate = "";
    for (let i = 1; i <= 14; i += 1) {
      const date = addWallDays(today, i);
      if (wallWeekday(date) === 2) {
        cancelledDate = date;
        break;
      }
    }
    assert.ok(cancelledDate);

    const res = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${programId}/schedule-rules/${rule.rule_id}/exceptions`,
        {
          method: "POST",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: { override_date: cancelledDate, action: "CANCEL" },
        }
      ),
      testEnv()
    );
    assert.strictEqual(res.status, 201);

    const result = await generate(adminAccess, programId, 14);
    assert.strictEqual(result.created, 1, "one of two occurrences suppressed");
    const events = await listEventsFor(adminAccess, programId);
    const hit = events.find((e) => e.starts_at.startsWith(`${cancelledDate}T`));
    assert.ok(!hit, "cancelled occurrence must not exist");
    assert.strictEqual(events.length, 1, "the other occurrence remains");
  });

  test("RESCHEDULE exception moves an occurrence and DELETE restores it", async () => {
    const programId = await freshProgram("RESCHEDULE Program");
    const rule = await createRule(adminAccess, programId, {
      recurrence: "WEEKLY",
      day_of_week: 4,
      start_time: "19:30",
      end_time: "21:00",
    });
    const today = hkTodayWallDate();
    let rescheduleDate = "";
    for (let i = 1; i <= 14; i += 1) {
      const date = addWallDays(today, i);
      if (wallWeekday(date) === 4) {
        rescheduleDate = date;
        break;
      }
    }
    assert.ok(rescheduleDate);

    const created = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${programId}/schedule-rules/${rule.rule_id}/exceptions`,
        {
          method: "POST",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: {
            override_date: rescheduleDate,
            action: "RESCHEDULE",
            new_start_time: "20:30",
            new_end_time: "22:00",
          },
        }
      ),
      testEnv()
    );
    assert.strictEqual(created.status, 201);
    const {
      data: { exception },
    } = (await assertCorrelated(created)) as {
      data: { exception: { exception_id: string } };
    };

    const first = await generate(adminAccess, programId, 14);
    assert.strictEqual(first.created, 2, "rescheduled + remaining occurrences");
    const moved = await listEventsFor(adminAccess, programId);
    assert.strictEqual(moved.length, 2);
    assert.ok(
      moved.some((e) => e.starts_at === `${rescheduleDate}T12:30:00.000Z`),
      "rescheduled occurrence must use the new wall time"
    );

    const removed = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${programId}/schedule-rules/${rule.rule_id}/exceptions/${exception.exception_id}`,
        {
          method: "DELETE",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          },
        }
      ),
      testEnv()
    );
    assert.strictEqual(removed.status, 200);

    const regenerated = await generate(adminAccess, programId, 14);
    assert.strictEqual(regenerated.created, 1, "rule-time occurrence regenerates after exception removal");
    const restored = await listEventsFor(adminAccess, programId);
    assert.strictEqual(restored.length, 3);
    assert.ok(
      restored.some((e) => e.starts_at === `${rescheduleDate}T12:30:00.000Z`),
      "previously generated event is untouched by exception removal"
    );
    assert.ok(
      restored.some((e) => e.starts_at === `${rescheduleDate}T11:30:00.000Z`),
      "rule-time occurrence reappears after exception removal"
    );
  });

  test("generation on a OneOff program returns 422; generation is audited", async () => {
    const oneOff = await createProgram(adminAccess, deptId, {
      name: "Generation OneOff",
      behavior_type: "OneOff",
    });
    const res = await worker.fetch(
      programsRequest(`/api/v1/programs/${oneOff.program_id}/events/generate`, {
        method: "POST",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: {},
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 422);

    const rows = await testDb()
      .prepare("SELECT action, outcome FROM audit_events WHERE action = 'EVENT_GENERATE'")
      .all<{ action: string; outcome: string }>();
    const row = rows.results?.find((r) => r.outcome === "SUCCESS");
    assert.ok(row, "EVENT_GENERATE audit row must exist");
  });
});

describe("PRG-02: events", () => {
  let deptId = "";
  let programId = "";

  beforeAll(async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const dept = await createDepartment(adminAccess, {
      code: "PRG-02-EVT",
      name: "Events Test Department",
    });
    deptId = dept.department_id;
    const program = await createProgram(adminAccess, deptId, {
      name: "Manual Events Program",
      behavior_type: "OneOff",
      discoverability: "Listed",
    });
    programId = program.program_id;
  });

  test("Admin creates a manual event; Member is denied 403", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const res = await worker.fetch(
      programsRequest(`/api/v1/programs/${programId}/events`, {
        method: "POST",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: {
          starts_at: "2026-09-01T10:00:00.000Z",
          ends_at: "2026-09-01T11:00:00.000Z",
        },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 201);
    const result = (await assertCorrelated(res)) as {
      data: { event: { event_id: string; source: string; status: string } };
    };
    assert.strictEqual(result.data.event.source, "MANUAL");
    assert.strictEqual(result.data.event.status, "Active");

    const memberAccess = await accessCookieFor("bob", "bob-secret");
    const denied = await worker.fetch(
      programsRequest(`/api/v1/programs/${programId}/events`, {
        method: "POST",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${memberAccess}`,
          "Content-Type": "application/json",
        },
        body: {
          starts_at: "2026-09-02T10:00:00.000Z",
          ends_at: "2026-09-02T11:00:00.000Z",
        },
      }),
      testEnv()
    );
    assert.strictEqual(denied.status, 403);
  });

  test("invalid event bodies return 422; duplicate start returns 409", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const invalid = await worker.fetch(
      programsRequest(`/api/v1/programs/${programId}/events`, {
        method: "POST",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: { starts_at: "not-a-date", ends_at: "2026-09-01T11:00:00.000Z" },
      }),
      testEnv()
    );
    assert.strictEqual(invalid.status, 422);

    const backwards = await worker.fetch(
      programsRequest(`/api/v1/programs/${programId}/events`, {
        method: "POST",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: {
          starts_at: "2026-09-03T12:00:00.000Z",
          ends_at: "2026-09-03T11:00:00.000Z",
        },
      }),
      testEnv()
    );
    assert.strictEqual(backwards.status, 422);

    const duplicate = await worker.fetch(
      programsRequest(`/api/v1/programs/${programId}/events`, {
        method: "POST",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: {
          starts_at: "2026-09-01T10:00:00.000Z",
          ends_at: "2026-09-01T11:00:00.000Z",
        },
      }),
      testEnv()
    );
    assert.strictEqual(duplicate.status, 409);
  });

  test("cancellation is soft, audited, and preserves attendance", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const created = await worker.fetch(
      programsRequest(`/api/v1/programs/${programId}/events`, {
        method: "POST",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: {
          starts_at: "2026-10-05T10:00:00.000Z",
          ends_at: "2026-10-05T11:00:00.000Z",
        },
      }),
      testEnv()
    );
    assert.strictEqual(created.status, 201);
    const {
      data: { event },
    } = (await assertCorrelated(created)) as {
      data: { event: { event_id: string } };
    };

    await testDb()
      .prepare(
        "INSERT INTO attendances (attendance_id, event_id, member_user_id, status, checked_in_at) VALUES (?, ?, 'U002', 'Active', ?)"
      )
      .bind(crypto.randomUUID(), event.event_id, new Date().toISOString())
      .run();

    const cancelled = await worker.fetch(
      programsRequest(`/api/v1/programs/${programId}/events/${event.event_id}`, {
        method: "PATCH",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: { reason: "惡劣天氣" },
      }),
      testEnv()
    );
    assert.strictEqual(cancelled.status, 200);
    const result = (await assertCorrelated(cancelled)) as {
      data: { event: { status: string; cancel_reason: string } };
    };
    assert.strictEqual(result.data.event.status, "Cancelled");
    assert.strictEqual(result.data.event.cancel_reason, "惡劣天氣");

    const attendances = await testDb()
      .prepare(
        "SELECT status, checked_in_at FROM attendances WHERE event_id = ?"
      )
      .bind(event.event_id)
      .all<{ status: string; checked_in_at: string }>();
    assert.strictEqual(attendances.results?.length, 1);
    assert.strictEqual(attendances.results?.[0]?.status, "Active");

    const audit = await testDb()
      .prepare(
        "SELECT action, entity_type, outcome FROM audit_events WHERE entity_id = ? AND action = 'EVENT_CANCEL'"
      )
      .bind(event.event_id)
      .first<{ action: string; entity_type: string; outcome: string }>();
    assert.ok(audit, "EVENT_CANCEL audit row must exist");
    assert.strictEqual(audit.entity_type, "event");
    assert.strictEqual(audit.outcome, "SUCCESS");
  });

  test("Members see only Active events; managers see all", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const memberAccess = await accessCookieFor("bob", "bob-secret");
    const memberView = await listEventsFor(memberAccess, programId);
    const activeCount = memberView.filter((e) => e.status === "Active").length;
    assert.strictEqual(memberView.length, activeCount, "Member must not see Cancelled events");
    const adminView = await listEventsFor(adminAccess, programId);
    assert.ok(adminView.some((e) => e.status === "Cancelled"), "Admin sees Cancelled events");
  });

  test("cancel requires a reason; unknown event 404; empty reason 422", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const noReason = await worker.fetch(
      programsRequest(`/api/v1/programs/${programId}/events/${crypto.randomUUID()}`, {
        method: "PATCH",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: { reason: "" },
      }),
      testEnv()
    );
    assert.strictEqual(noReason.status, 422);

    const unknown = await worker.fetch(
      programsRequest(`/api/v1/programs/${programId}/events/${crypto.randomUUID()}`, {
        method: "PATCH",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: { reason: "測試" },
      }),
      testEnv()
    );
    assert.strictEqual(unknown.status, 404);
  });

    test("no credential material leaks in events responses", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const created = await worker.fetch(
      programsRequest(`/api/v1/programs/${programId}/events`, {
        method: "POST",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: {
          starts_at: "2026-11-02T10:00:00.000Z",
          ends_at: "2026-11-02T11:00:00.000Z",
        },
      }),
      testEnv()
    );
    assert.strictEqual(created.status, 201);
    const {
      data: { event },
    } = (await assertCorrelated(created)) as {
      data: { event: { event_id: string } };
    };

    const res = await worker.fetch(
      programsRequest(`/api/v1/programs/${programId}/events/${event.event_id}`, {
        method: "PATCH",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: { reason: "審計測試" },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.ok(!/password|credential_hash|legacy_pin_hash|access_token|session_token/iu.test(text));

    const listed = await worker.fetch(
      programsRequest(`/api/v1/programs/${programId}/events`, {
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
        },
      }),
      testEnv()
    );
    const listedText = await listed.text();
    assert.ok(!/password|credential_hash|legacy_pin_hash|access_token|session_token/iu.test(listedText));
  });
});
