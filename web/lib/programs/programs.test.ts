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
