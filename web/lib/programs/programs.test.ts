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

import type { D1Database } from "@cloudflare/workers-types";
import { env } from "cloudflare:workers";
import { beforeAll, describe, test } from "vitest";
/* oxlint-disable vitest/require-top-level-describe -- shared workerd/D1 fixture spans the suites. */

import worker from "../../worker";
import type { Env } from "../../worker";
import { importLegacyUsers } from "../auth/accounts";
import { ACCESS_COOKIE_NAME } from "../auth/cookies";
import { applyMigrations, testDb } from "../auth/test-bootstrap";
import { completeCredentialUpgrade } from "../auth/upgrade";
import { D1CapabilityAuthorizer } from "./capability-authorizer";
import { D1WorkspaceStore } from "./d1-workspace-store";
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
): Promise<{
  code: string;
  status: number;
  requestId: string;
  open_operations?: number;
}> {
  assert.strictEqual(
    res.headers.get("Content-Type"),
    "application/problem+json"
  );
  const body = (await res.json()) as {
    code: string;
    status: number;
    requestId: string;
    open_operations?: number;
  };
  assert.strictEqual(body.requestId, res.headers.get("X-Request-Id"));
  return body;
}

async function createDepartment(
  access: string,
  body: { code: string; name: string; lifecycle?: string },
  options: { enableModules?: boolean } = {}
): Promise<{ department_id: string; code: string; name: string }> {
  const res = await worker.fetch(
    programsRequest("/api/v1/programs/departments", {
      method: "POST",
      headers: {
        Origin: HOST,
        Cookie: `${ACCESS_COOKIE_NAME}=${access}`,
        "Content-Type": "application/json",
      },
      body: { ...body, lifecycle: body.lifecycle ?? "Draft" },
    }),
    testEnv()
  );
  assert.strictEqual(res.status, 201);
  const result = (await assertCorrelated(res)) as {
    data: { department: { department_id: string; code: string; name: string } };
  };
  if (options.enableModules !== false) {
    await Promise.all(
      ["program_catalog", "events", "enrollment"].map(async (moduleKey) => {
        const moduleRes = await worker.fetch(
          programsRequest(
            `/api/v1/programs/departments/${result.data.department.department_id}/modules/${moduleKey}/enable`,
            {
              method: "POST",
              headers: {
                Origin: HOST,
                Cookie: `${ACCESS_COOKIE_NAME}=${access}`,
              },
            }
          ),
          testEnv()
        );
        assert.strictEqual(moduleRes.status, 200);
      })
    );
  }
  return result.data.department;
}

async function createProgram(
  access: string,
  departmentId: string,
  body: {
    name: string;
    category?: string;
    behavior_type: "Recurring" | "OneOff";
    lifecycle?: "Draft" | "Active" | "Archived";
    discoverability?: "Listed" | "Unlisted";
    enrollment_mode?: "MemberRequest" | "ManagerOnly";
  }
): Promise<{
  program_id: string;
  name: string;
  check_in_token: string | null;
}> {
  const res = await worker.fetch(
    programsRequest(`/api/v1/programs/departments/${departmentId}/programs`, {
      method: "POST",
      headers: {
        Origin: HOST,
        Cookie: `${ACCESS_COOKIE_NAME}=${access}`,
        "Content-Type": "application/json",
      },
      body: {
        ...body,
        category: body.category ?? "測試類別",
        lifecycle: body.lifecycle ?? "Draft",
        discoverability: body.discoverability ?? "Unlisted",
        enrollment_mode: body.enrollment_mode ?? "MemberRequest",
      },
    }),
    testEnv()
  );
  assert.strictEqual(res.status, 201);
  const result = (await assertCorrelated(res)) as {
    data: {
      program: {
        program_id: string;
        name: string;
        check_in_token: string | null;
      };
    };
  };
  return result.data.program;
}

beforeAll(async () => {
  await applyMigrations();
  await importLegacyUsers(testDb(), [
    HEADER,
    ["U001", "Alice Chan", "alice", "1234", "Admin", "Active"],
    ["U002", "Bob Lee", "bob", "5678", "Member", "Active"],
    ["U004", "Dana Pending", "dana", "9999", "Member", "Pending"],
    ["U005", "Staff User", "staff", "2468", "Staff", "Active"],
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
    userId: "U005",
    legacyPin: "2468",
    newCredential: "staff-secret",
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

  test("Programs access returns a capability-only projection", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const dept = await createDepartment(adminAccess, {
      code: "PUI-01-ACCESS",
      name: "Programs Access Dept",
    });
    const program = await createProgram(adminAccess, dept.department_id, {
      name: "Programs Access Program",
      behavior_type: "Recurring",
      discoverability: "Listed",
    });

    const memberAccess = await accessCookieFor("bob", "bob-secret");
    const memberResponse = await worker.fetch(
      programsRequest("/api/v1/programs/access", {
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${memberAccess}`,
        },
      }),
      testEnv()
    );
    assert.strictEqual(memberResponse.status, 200);
    const memberBody = (await assertCorrelated(memberResponse)) as {
      data: Record<string, unknown>;
    };
    assert.deepStrictEqual(Object.keys(memberBody.data).sort(), [
      "departmentScopes",
      "hasManagementCapability",
      "programScopes",
    ]);
    assert.strictEqual(memberBody.data.hasManagementCapability, false);
    assert.ok(!("check_in_token" in memberBody.data));

    const adminResponse = await worker.fetch(
      programsRequest("/api/v1/programs/access", {
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
        },
      }),
      testEnv()
    );
    assert.strictEqual(adminResponse.status, 200);
    const adminBody = (await assertCorrelated(adminResponse)) as {
      data: {
        hasManagementCapability: boolean;
        departmentScopes: number;
        programScopes: number;
      };
    };
    assert.strictEqual(adminBody.data.hasManagementCapability, true);
    assert.ok(adminBody.data.departmentScopes >= 1);

    const grantLeader = await worker.fetch(
      programsRequest(`/api/v1/programs/${program.program_id}/leaders`, {
        method: "POST",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: { user_id: "U002" },
      }),
      testEnv()
    );
    assert.strictEqual(grantLeader.status, 200);

    const leaderResponse = await worker.fetch(
      programsRequest("/api/v1/programs/access", {
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${memberAccess}`,
        },
      }),
      testEnv()
    );
    assert.strictEqual(leaderResponse.status, 200);
    const leaderBody = (await assertCorrelated(leaderResponse)) as {
      data: { hasManagementCapability: boolean; programScopes: number };
    };
    assert.strictEqual(leaderBody.data.hasManagementCapability, true);
    assert.ok(leaderBody.data.programScopes >= 1);
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
        body: { code: "DUPLICATE", name: "Second", lifecycle: "Draft" },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 409);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "CONFLICT");
  });

  test("department create rejects invalid or missing lifecycle and bad display_order", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");

    const invalidLifecycle = await worker.fetch(
      programsRequest("/api/v1/programs/departments", {
        method: "POST",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: {
          code: "STRICT-DEPT-1",
          name: "Strict Dept",
          lifecycle: "Published",
        },
      }),
      testEnv()
    );
    assert.strictEqual(invalidLifecycle.status, 422);
    const invalidLifecycleBody = await problemOf(invalidLifecycle);
    assert.strictEqual(invalidLifecycleBody.code, "VALIDATION");

    const missingLifecycle = await worker.fetch(
      programsRequest("/api/v1/programs/departments", {
        method: "POST",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: { code: "STRICT-DEPT-2", name: "Strict Dept" },
      }),
      testEnv()
    );
    assert.strictEqual(missingLifecycle.status, 422);
    const missingLifecycleBody = await problemOf(missingLifecycle);
    assert.strictEqual(missingLifecycleBody.code, "VALIDATION");

    const stringDisplayOrder = await worker.fetch(
      programsRequest("/api/v1/programs/departments", {
        method: "POST",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: {
          code: "STRICT-DEPT-3",
          name: "Strict Dept",
          lifecycle: "Active",
          display_order: "1",
        },
      }),
      testEnv()
    );
    assert.strictEqual(stringDisplayOrder.status, 422);
    const stringDisplayOrderBody = await problemOf(stringDisplayOrder);
    assert.strictEqual(stringDisplayOrderBody.code, "VALIDATION");

    const valid = await worker.fetch(
      programsRequest("/api/v1/programs/departments", {
        method: "POST",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: {
          code: "STRICT-DEPT-4",
          name: "Strict Dept",
          lifecycle: "Active",
          display_order: 3,
        },
      }),
      testEnv()
    );
    assert.strictEqual(valid.status, 201);
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
        body: { code: "MEMBER", name: "Member Dept", lifecycle: "Draft" },
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

  test("department PATCH rejects invalid provided values with 422", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const dept = await createDepartment(adminAccess, {
      code: "PATCH-STRICT",
      name: "Patch Strict",
    });
    const invalidBodies = [
      { lifecycle: "Published" },
      { name: 42 },
      { display_order: "1" },
      { description: 7 },
    ];
    const results = await Promise.all(
      invalidBodies.map((body) =>
        worker.fetch(
          programsRequest(
            `/api/v1/programs/departments/${dept.department_id}`,
            {
              method: "PATCH",
              headers: {
                Origin: HOST,
                Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
                "Content-Type": "application/json",
              },
              body,
            }
          ),
          testEnv()
        )
      )
    );
    for (const [index, res] of results.entries()) {
      assert.strictEqual(res.status, 422, JSON.stringify(invalidBodies[index]));
    }
    const problems = await Promise.all(results.map((res) => problemOf(res)));
    for (const problem of problems) {
      assert.strictEqual(problem.code, "VALIDATION");
    }
    // A valid partial PATCH still succeeds.
    const valid = await worker.fetch(
      programsRequest(`/api/v1/programs/departments/${dept.department_id}`, {
        method: "PATCH",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: { description: "新描述" },
      }),
      testEnv()
    );
    assert.strictEqual(valid.status, 200);
  });
});

describe("MUI-01: capability-aware management reads", () => {
  test("directory filters to current scope and redacts manager secrets", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const department = await createDepartment(adminAccess, {
      code: "MUI-01-DIRECTORY",
      name: "MUI Directory Department",
    });
    const assigned = await createProgram(
      adminAccess,
      department.department_id,
      {
        name: "MUI Assigned Program",
        behavior_type: "Recurring",
        lifecycle: "Active",
        discoverability: "Listed",
      }
    );
    const unassigned = await createProgram(
      adminAccess,
      department.department_id,
      {
        name: "MUI Unassigned Program",
        behavior_type: "OneOff",
        lifecycle: "Active",
        discoverability: "Listed",
      }
    );
    assert.ok(assigned.check_in_token);
    assert.ok(unassigned.check_in_token);

    const memberAccess = await accessCookieFor("bob", "bob-secret");
    const memberResponse = await worker.fetch(
      programsRequest("/api/v1/programs/management-directory", {
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${memberAccess}`,
        },
      }),
      testEnv()
    );
    assert.strictEqual(memberResponse.status, 200);
    const memberBody = (await assertCorrelated(memberResponse)) as {
      data: {
        departments: { department_id: string }[];
        programs: { program_id: string }[];
      };
    };
    assert.ok(
      !memberBody.data.programs.some(
        ({ program_id }) =>
          program_id === assigned.program_id ||
          program_id === unassigned.program_id
      )
    );
    const publicProgramResponse = await worker.fetch(
      programsRequest(`/api/v1/programs/${unassigned.program_id}`, {
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${memberAccess}`,
        },
      }),
      testEnv()
    );
    assert.strictEqual(publicProgramResponse.status, 200);
    const publicProgramBody = (await assertCorrelated(
      publicProgramResponse
    )) as { data: { program: Record<string, unknown> } };
    assert.ok(!("check_in_token" in publicProgramBody.data.program));

    assert.ok(
      !memberBody.data.departments.some(
        ({ department_id }) => department_id === department.department_id
      )
    );

    const grantLeader = await worker.fetch(
      programsRequest(`/api/v1/programs/${assigned.program_id}/leaders`, {
        method: "POST",
        headers: {
          Origin: HOST,
          "Content-Type": "application/json",
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
        },
        body: { user_id: "U002" },
      }),
      testEnv()
    );
    assert.strictEqual(grantLeader.status, 200);

    const leaderResponse = await worker.fetch(
      programsRequest("/api/v1/programs/management-directory", {
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${memberAccess}`,
        },
      }),
      testEnv()
    );
    assert.strictEqual(leaderResponse.status, 200);
    const leaderBody = (await assertCorrelated(leaderResponse)) as {
      data: {
        departments: Record<string, unknown>[];
        programs: Record<string, unknown>[];
      };
    };
    assert.ok(
      leaderBody.data.departments.every(
        (row) => !("created_by" in row) && !("updated_by" in row)
      )
    );
    const assignedRows = leaderBody.data.programs.filter(
      (row) => row.program_id === assigned.program_id
    );
    assert.strictEqual(assignedRows.length, 1);
    assert.ok(
      !leaderBody.data.programs.some(
        (row) => row.program_id === unassigned.program_id
      )
    );
    const raw = JSON.stringify(leaderBody.data);
    assert.ok(!raw.includes(assigned.check_in_token));
    assert.ok(!raw.includes("check_in_opens_at_minutes_before_start"));
    assert.ok(!raw.includes("check_in_closes_at_minutes_after_end"));
    const future = await createProgram(adminAccess, department.department_id, {
      name: "MUI Future Department Program",
      behavior_type: "OneOff",
      lifecycle: "Active",
      discoverability: "Listed",
    });
    const futureDirectory = await worker.fetch(
      programsRequest("/api/v1/programs/management-directory", {
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
        },
      }),
      testEnv()
    );
    assert.strictEqual(futureDirectory.status, 200);
    const futureBody = (await assertCorrelated(futureDirectory)) as {
      data: { programs: { program_id: string }[] };
    };
    assert.strictEqual(
      futureBody.data.programs.filter(
        ({ program_id }) => program_id === future.program_id
      ).length,
      1
    );
  });

  test("direct workspace reads reauthorize scope without leaking revoked records", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const department = await createDepartment(adminAccess, {
      code: "MUI-01-WORKSPACE",
      name: "MUI Workspace Department",
    });
    const program = await createProgram(adminAccess, department.department_id, {
      name: "MUI Workspace Program",
      behavior_type: "Recurring",
      lifecycle: "Active",
      discoverability: "Listed",
    });
    assert.ok(program.check_in_token);

    const memberAccess = await accessCookieFor("bob", "bob-secret");
    const denied = await worker.fetch(
      programsRequest(`/api/v1/programs/${program.program_id}/management`, {
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${memberAccess}`,
        },
      }),
      testEnv()
    );
    assert.strictEqual(denied.status, 404);
    const deniedProblem = await problemOf(denied);
    assert.strictEqual(deniedProblem.code, "NOT_FOUND");

    const allowed = await worker.fetch(
      programsRequest(`/api/v1/programs/${program.program_id}/management`, {
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
        },
      }),
      testEnv()
    );
    assert.strictEqual(allowed.status, 200);
    const body = (await assertCorrelated(allowed)) as {
      data: {
        program: Record<string, unknown>;
        modules: { module_key: string; enabled: number }[];
      };
    };
    assert.strictEqual(body.data.program.program_id, program.program_id);
    assert.ok(!("check_in_token" in body.data.program));
    assert.ok(body.data.modules.every((module) => !("enabled_by" in module)));
    assert.ok(
      body.data.modules.some(
        ({ module_key, enabled }) => module_key === "events" && enabled === 1
      )
    );
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

  test("program creation rejects invalid required settings", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const dept = await createDepartment(adminAccess, {
      code: "STRICT-PROG-DEPT",
      name: "Strict Program Dept",
    });
    const res = await worker.fetch(
      programsRequest(
        `/api/v1/programs/departments/${dept.department_id}/programs`,
        {
          method: "POST",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: {
            name: "Strict Program",
            category: "測試類別",
            behavior_type: "Recurring",
            lifecycle: "Published",
            discoverability: "Listed",
            enrollment_mode: "MemberRequest",
          },
        }
      ),
      testEnv()
    );
    assert.strictEqual(res.status, 422);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "VALIDATION");

    const archivedCreate = await worker.fetch(
      programsRequest(
        `/api/v1/programs/departments/${dept.department_id}/programs`,
        {
          method: "POST",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: {
            name: "Archived Program",
            category: "測試類別",
            behavior_type: "Recurring",
            lifecycle: "Archived",
            discoverability: "Listed",
            enrollment_mode: "MemberRequest",
          },
        }
      ),
      testEnv()
    );
    assert.strictEqual(archivedCreate.status, 422);
    const archivedBody = (await archivedCreate.json()) as {
      code: string;
      detail?: string;
    };
    assert.strictEqual(archivedBody.code, "VALIDATION");
    assert.strictEqual(
      archivedBody.detail,
      "Programs cannot be created directly in the Archived state."
    );

    await Promise.all(
      [
        {},
        {
          behavior_type: "Recurring",
          lifecycle: "Draft",
          discoverability: "Listed",
          enrollment_mode: "MemberRequest",
        },
        {
          name: "No Type",
          lifecycle: "Draft",
          discoverability: "Listed",
          enrollment_mode: "MemberRequest",
        },
        {
          name: "No Lifecycle",
          behavior_type: "Recurring",
          discoverability: "Listed",
          enrollment_mode: "MemberRequest",
        },
        {
          name: "Whitespace Category",
          category: "   ",
          behavior_type: "Recurring",
          lifecycle: "Draft",
          discoverability: "Listed",
          enrollment_mode: "MemberRequest",
        },
      ].map(async (incompleteBody) => {
        const missingField = await worker.fetch(
          programsRequest(
            `/api/v1/programs/departments/${dept.department_id}/programs`,
            {
              method: "POST",
              headers: {
                Origin: HOST,
                Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
                "Content-Type": "application/json",
              },
              body: incompleteBody,
            }
          ),
          testEnv()
        );
        assert.strictEqual(
          missingField.status,
          422,
          `expected 422 for body ${JSON.stringify(incompleteBody)}`
        );
      })
    );
  });

  test("program create defaults discoverability/enrollment_mode/display_order", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const dept = await createDepartment(adminAccess, {
      code: "DEFAULT-PROG-DEPT",
      name: "Default Program Dept",
    });

    const res = await worker.fetch(
      programsRequest(
        `/api/v1/programs/departments/${dept.department_id}/programs`,
        {
          method: "POST",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: {
            name: "Defaulted Program",
            category: "測試類別",
            behavior_type: "Recurring",
            lifecycle: "Draft",
          },
        }
      ),
      testEnv()
    );
    assert.strictEqual(res.status, 201);
    const result = (await assertCorrelated(res)) as {
      data: {
        program: {
          discoverability: string;
          enrollment_mode: string;
          display_order: number;
        };
      };
    };
    assert.strictEqual(result.data.program.discoverability, "Listed");
    assert.strictEqual(result.data.program.enrollment_mode, "MemberRequest");
    assert.strictEqual(result.data.program.display_order, 0);

    const badEnum = await worker.fetch(
      programsRequest(
        `/api/v1/programs/departments/${dept.department_id}/programs`,
        {
          method: "POST",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: {
            name: "Bad Enum Program",
            behavior_type: "Recurring",
            lifecycle: "Draft",
            discoverability: "Public",
          },
        }
      ),
      testEnv()
    );
    assert.strictEqual(badEnum.status, 422);
  });

  test("program update rejects invalid fields and archives permanently", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const dept = await createDepartment(adminAccess, {
      code: "LIFECYCLE-DEPT",
      name: "Lifecycle Dept",
    });
    const program = await createProgram(adminAccess, dept.department_id, {
      name: "Lifecycle Program",
      behavior_type: "Recurring",
      lifecycle: "Draft",
      discoverability: "Listed",
      enrollment_mode: "MemberRequest",
    });

    const invalid = await worker.fetch(
      programsRequest(`/api/v1/programs/${program.program_id}`, {
        method: "PATCH",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: { name: "", lifecycle: "Published" },
      }),
      testEnv()
    );
    assert.strictEqual(invalid.status, 422);

    const invalidType = await worker.fetch(
      programsRequest(`/api/v1/programs/${program.program_id}`, {
        method: "PATCH",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: { display_order: "1" },
      }),
      testEnv()
    );
    assert.strictEqual(invalidType.status, 422);

    const unknownField = await worker.fetch(
      programsRequest(`/api/v1/programs/${program.program_id}`, {
        method: "PATCH",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: { unsupported: true },
      }),
      testEnv()
    );
    assert.strictEqual(unknownField.status, 422);

    const activate = await worker.fetch(
      programsRequest(`/api/v1/programs/${program.program_id}`, {
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
    assert.strictEqual(activate.status, 200);

    const archive = await worker.fetch(
      programsRequest(`/api/v1/programs/${program.program_id}`, {
        method: "PATCH",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: { lifecycle: "Archived" },
      }),
      testEnv()
    );
    assert.strictEqual(archive.status, 200);

    const reopen = await worker.fetch(
      programsRequest(`/api/v1/programs/${program.program_id}`, {
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
    assert.strictEqual(reopen.status, 422);
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

  test("manager can search active members", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const dept = await createDepartment(adminAccess, {
      code: "MEMBER-SEARCH-DEPT",
      name: "Member Search Dept",
    });
    const program = await createProgram(adminAccess, dept.department_id, {
      name: "Member Search Program",
      behavior_type: "OneOff",
      lifecycle: "Draft",
      discoverability: "Unlisted",
      enrollment_mode: "ManagerOnly",
    });
    const search = async (
      q: string
    ): Promise<{ user_id: string; name: string; username: string }[]> => {
      const res = await worker.fetch(
        programsRequest(
          `/api/v1/programs/${program.program_id}/member-options?q=${q}`,
          {
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
        data: {
          members: { user_id: string; name: string; username: string }[];
        };
      };
      return body.data.members;
    };

    assert.deepStrictEqual(await search("Alice"), [
      { user_id: "U001", name: "Alice Chan", username: "alice" },
    ]);
    assert.deepStrictEqual(await search("Bob"), [
      { user_id: "U002", name: "Bob Lee", username: "bob" },
    ]);
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
          body: {
            name: "Member Program",
            category: "測試類別",
            behavior_type: "OneOff",
            lifecycle: "Draft",
            discoverability: "Listed",
            enrollment_mode: "MemberRequest",
          },
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
    const dept = await createDepartment(
      adminAccess,
      {
        code: "MOD-DEPT",
        name: "Module Dept",
      },
      { enableModules: false }
    );
    const initialRes = await worker.fetch(
      programsRequest(`/api/v1/programs/departments/${dept.department_id}`, {
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
        },
      }),
      testEnv()
    );
    const initialBody = (await assertCorrelated(initialRes)) as {
      data: { modules: { enabled: number }[] };
    };
    assert.strictEqual(initialBody.data.modules.length, 5);
    assert.ok(initialBody.data.modules.every((module) => module.enabled === 0));
    const blockedCreate = await worker.fetch(
      programsRequest(
        `/api/v1/programs/departments/${dept.department_id}/programs`,
        {
          method: "POST",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: {
            name: "Blocked Program",
            category: "測試類別",
            behavior_type: "Recurring",
            lifecycle: "Draft",
            discoverability: "Listed",
            enrollment_mode: "MemberRequest",
          },
        }
      ),
      testEnv()
    );
    assert.strictEqual(blockedCreate.status, 403);
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
      data: { module: { module_key: string; enabled: number } };
    };
    assert.strictEqual(body.data.module.module_key, "program_catalog");
    assert.strictEqual(body.data.module.enabled, 1);

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
      data: {
        modules: { module_key: string; enabled: number }[];
      };
    };
    assert.ok(
      getBody.data.modules.some(
        (module) =>
          module.module_key === "program_catalog" && module.enabled === 1
      ),
      "module must be listed"
    );
    assert.deepStrictEqual(
      getBody.data.modules.map((module) => module.module_key),
      ["attendance", "custom_forms", "enrollment", "events", "program_catalog"]
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

  test("mutations correlate audits to the client Idempotency-Key", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const dept = await createDepartment(adminAccess, {
      code: `IDEM-${Date.now()}`,
      name: "Idempotency Dept",
    });
    const res = await worker.fetch(
      programsRequest(
        `/api/v1/programs/departments/${dept.department_id}/programs`,
        {
          method: "POST",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
            "Idempotency-Key": "client-key-abc",
          },
          body: {
            name: "Idempotency Program",
            category: "測試類別",
            behavior_type: "Recurring",
            lifecycle: "Draft",
          },
        }
      ),
      testEnv()
    );
    assert.strictEqual(res.status, 201);
    const audit = await testDb()
      .prepare(
        "SELECT correlation_id FROM audit_events WHERE action = 'PROGRAM_CREATE' AND correlation_id = ?"
      )
      .bind("client-key-abc")
      .first<{ correlation_id: string }>();
    assert.ok(audit, "audit must carry the client Idempotency-Key");
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
    data: {
      generated: { created: number; skipped: number; rule_count: number };
    };
  };
  return result.data.generated;
}

async function listEventsFor(
  access: string,
  programId: string
): Promise<
  {
    event_id: string;
    starts_at: string;
    exception: {
      exception_id: string;
      rule_id: string;
      override_date: string;
      action: string;
      new_start_time: string | null;
      new_end_time: string | null;
    } | null;
    ends_at: string;
    status: string;
    source: string;
    manual_check_in_code: string | null;
    check_in_window_opens_at: string | null;
    check_in_window_closes_at: string | null;
  }[]
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
      events: {
        event_id: string;
        starts_at: string;
        ends_at: string;
        status: string;
        source: string;
        exception: {
          exception_id: string;
          rule_id: string;
          override_date: string;
          action: string;
          new_start_time: string | null;
          new_end_time: string | null;
        } | null;
        manual_check_in_code: string | null;
        check_in_window_opens_at: string | null;
        check_in_window_closes_at: string | null;
      }[];
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
      {
        recurrence: "DAILY",
        day_of_week: 1,
        start_time: "19:30",
        end_time: "21:00",
      },
      { recurrence: "WEEKLY", start_time: "19:30", end_time: "21:00" },
      {
        recurrence: "WEEKLY",
        day_of_week: 1,
        start_time: "25:00",
        end_time: "21:00",
      },
      {
        recurrence: "WEEKLY",
        day_of_week: 1,
        start_time: "21:00",
        end_time: "19:30",
      },
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
      .all<{
        action: string;
        entity_type: string;
        entity_id: string;
        outcome: string;
      }>();
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
      .all<{
        event_id: string;
        starts_at: string;
        ends_at: string;
        status: string;
      }>();

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
      .all<{
        event_id: string;
        starts_at: string;
        ends_at: string;
        status: string;
      }>();
    assert.strictEqual(after.results?.length, before.results?.length);
    for (const [index, row] of (after.results ?? []).entries()) {
      assert.deepStrictEqual(row, (before.results ?? [])[index]);
    }
  });

  test("PATCH rule enforces recurrence cross-field invariants", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const weekly = await createRule(adminAccess, recurringId, {
      recurrence: "WEEKLY",
      day_of_week: 2,
      start_time: "19:30",
      end_time: "21:00",
    });
    const patch = async (body: Record<string, unknown>) => {
      const res = await worker.fetch(
        programsRequest(
          `/api/v1/programs/${recurringId}/schedule-rules/${weekly.rule_id}`,
          {
            method: "PATCH",
            headers: {
              Origin: HOST,
              Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
              "Content-Type": "application/json",
            },
            body,
          }
        ),
        testEnv()
      );
      return res.status;
    };
    // Switching to MONTHLY without a month_day would leave a rule that
    // generates nothing — rejected like create would.
    assert.strictEqual(await patch({ recurrence: "MONTHLY" }), 422);
    // Out-of-range values for a provided field must not silently no-op.
    assert.strictEqual(await patch({ day_of_week: 9 }), 422);
    assert.strictEqual(await patch({ month_day: 32 }), 422);
    // A complete, valid transition still succeeds.
    assert.strictEqual(
      await patch({ recurrence: "MONTHLY", month_day: 15 }),
      200
    );
    // And a valid day_of_week-only change on a WEEKLY rule succeeds.
    const another = await createRule(adminAccess, recurringId, {
      recurrence: "WEEKLY",
      day_of_week: 3,
      start_time: "18:00",
      end_time: "19:00",
    });
    const dayPatch = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${recurringId}/schedule-rules/${another.rule_id}`,
        {
          method: "PATCH",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: { day_of_week: 1 },
        }
      ),
      testEnv()
    );
    assert.strictEqual(dayPatch.status, 200);
    const rule = (await assertCorrelated(dayPatch)) as {
      data: { rule: { recurrence: string; day_of_week: number | null } };
    };
    assert.strictEqual(rule.data.rule.recurrence, "WEEKLY");
    assert.strictEqual(rule.data.rule.day_of_week, 1);
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
    // Attendance readiness (0004): created Programs mint a 32-hex
    // check-in token (the sheet QR embeds it as program_token).
    assert.match(program.check_in_token ?? "", /^[0-9a-f]{32}$/u);
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
      assert.strictEqual(
        event.starts_at,
        `${expectedDates[index]}T11:30:00.000Z`
      );
    }
    // Attendance readiness (0004): generated Events carry a never-reused
    // 8-hex manual code and a window derived from the Program's minutes.
    for (const event of events) {
      assert.match(event.manual_check_in_code ?? "", /^[0-9A-F]{8}$/u);
      assert.ok(
        event.check_in_window_opens_at &&
          event.check_in_window_opens_at < event.starts_at
      );
      assert.ok(
        event.check_in_window_closes_at &&
          event.check_in_window_closes_at > event.ends_at
      );
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
    assert.strictEqual(
      regenerated.created,
      1,
      "rule-time occurrence regenerates after exception removal"
    );
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

  test("RESCHEDULE exception with backwards new times returns 422", async () => {
    const programId = await freshProgram("RESCHEDULE Backwards Program");
    const rule = await createRule(adminAccess, programId, {
      recurrence: "WEEKLY",
      day_of_week: 4,
      start_time: "19:30",
      end_time: "21:00",
    });
    const today = hkTodayWallDate();
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
          body: {
            override_date: today,
            action: "RESCHEDULE",
            new_start_time: "22:00",
            new_end_time: "20:30",
          },
        }
      ),
      testEnv()
    );
    assert.strictEqual(res.status, 422);
    const problem = await problemOf(res);
    assert.strictEqual(problem.code, "VALIDATION");
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
      .prepare(
        "SELECT action, outcome FROM audit_events WHERE action = 'EVENT_GENERATE'"
      )
      .all<{ action: string; outcome: string }>();
    const row = rows.results?.find((r) => r.outcome === "SUCCESS");
    assert.ok(row, "EVENT_GENERATE audit row must exist");
  });

  test("generation on a program with no schedule rules returns 422 with a FAILED audit row", async () => {
    const noRules = await createProgram(adminAccess, deptId, {
      name: "Generation No Rules",
      behavior_type: "Recurring",
    });
    const res = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${noRules.program_id}/events/generate`,
        {
          method: "POST",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: {},
        }
      ),
      testEnv()
    );
    assert.strictEqual(res.status, 422);
    const audit = await testDb()
      .prepare(
        `SELECT outcome FROM audit_events
         WHERE action = 'EVENT_GENERATE' AND outcome = 'FAILED'
           AND entity_id = ?`
      )
      .bind(noRules.program_id)
      .first<{ outcome: string }>();
    assert.ok(audit, "zero-rule generation must write a FAILED audit row");
  });

  test("exception created after materialization is attached to the event row", async () => {
    const programId = await freshProgram("Late Exception Program");
    const rule = await createRule(adminAccess, programId, {
      recurrence: "WEEKLY",
      day_of_week: 2,
      start_time: "19:30",
      end_time: "21:00",
    });
    const result = await generate(adminAccess, programId, 14);
    assert.strictEqual(result.created, 2);

    const before = await listEventsFor(adminAccess, programId);
    assert.strictEqual(before.length, 2);
    for (const event of before) {
      assert.strictEqual(event.exception, null, "no exception yet");
    }
    const targetDate = before[0].starts_at.slice(0, 10);

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
          body: {
            override_date: targetDate,
            action: "RESCHEDULE",
            new_start_time: "08:30",
            new_end_time: "10:00",
          },
        }
      ),
      testEnv()
    );
    assert.strictEqual(res.status, 201);

    const after = await listEventsFor(adminAccess, programId);
    const hit = after.find((e) => e.starts_at === before[0].starts_at);
    assert.ok(hit, "materialized event must still be listed");
    assert.strictEqual(hit.exception?.action, "RESCHEDULE");
    assert.strictEqual(hit.exception?.new_start_time, "08:30");
    const miss = after.find((e) => e.starts_at !== before[0].starts_at);
    assert.ok(miss, "second materialized event must still be listed");
    assert.strictEqual(
      miss.exception,
      null,
      "unrelated event carries no exception"
    );
  });

  test("duplicate schedule exception returns 409 CONFLICT", async () => {
    const programId = await freshProgram("Duplicate Exception Program");
    const rule = await createRule(adminAccess, programId, {
      recurrence: "WEEKLY",
      day_of_week: 2,
      start_time: "19:30",
      end_time: "21:00",
    });
    const targetDate = addWallDays(hkTodayWallDate(), 3);

    const post = (body: Record<string, unknown>) =>
      worker.fetch(
        programsRequest(
          `/api/v1/programs/${programId}/schedule-rules/${rule.rule_id}/exceptions`,
          {
            method: "POST",
            headers: {
              Origin: HOST,
              Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
              "Content-Type": "application/json",
            },
            body,
          }
        ),
        testEnv()
      );

    const first = await post({ override_date: targetDate, action: "CANCEL" });
    assert.strictEqual(first.status, 201);

    const second = await post({ override_date: targetDate, action: "CANCEL" });
    assert.strictEqual(second.status, 409);
    const body = await problemOf(second);
    assert.strictEqual(body.code, "CONFLICT");
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
    const dupBody = await problemOf(duplicate);
    assert.strictEqual(dupBody.code, "CONFLICT");
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
      programsRequest(
        `/api/v1/programs/${programId}/events/${event.event_id}`,
        {
          method: "PATCH",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: { reason: "惡劣天氣" },
        }
      ),
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
    assert.strictEqual(
      memberView.length,
      activeCount,
      "Member must not see Cancelled events"
    );
    const adminView = await listEventsFor(adminAccess, programId);
    assert.ok(
      adminView.some((e) => e.status === "Cancelled"),
      "Admin sees Cancelled events"
    );
  });

  test("cancel requires a reason; unknown event 404; empty reason 422", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const noReason = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${programId}/events/${crypto.randomUUID()}`,
        {
          method: "PATCH",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: { reason: "" },
        }
      ),
      testEnv()
    );
    assert.strictEqual(noReason.status, 422);

    const unknown = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${programId}/events/${crypto.randomUUID()}`,
        {
          method: "PATCH",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: { reason: "測試" },
        }
      ),
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
      programsRequest(
        `/api/v1/programs/${programId}/events/${event.event_id}`,
        {
          method: "PATCH",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: { reason: "審計測試" },
        }
      ),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.ok(
      !/password|credential_hash|legacy_pin_hash|access_token|session_token/iu.test(
        text
      )
    );

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
    assert.ok(
      !/password|credential_hash|legacy_pin_hash|access_token|session_token/iu.test(
        listedText
      )
    );
  });
});

// ---------------------------------------------------------------------------
// EVT-01 (#251): event operations — operator identity fields, independent
// availability, event detail projection, edit/availability/cancel APIs.
// ---------------------------------------------------------------------------

async function createEventFor(
  access: string,
  programId: string,
  body: Record<string, unknown>
): Promise<{
  event_id: string;
  status: string;
  availability: string;
  source: string;
  name: string | null;
  location: string | null;
  manual_check_in_code: string | null;
}> {
  const res = await worker.fetch(
    programsRequest(`/api/v1/programs/${programId}/events`, {
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
    data: { event: Record<string, unknown> };
  };
  return result.data.event as {
    event_id: string;
    status: string;
    availability: string;
    source: string;
    name: string | null;
    location: string | null;
    manual_check_in_code: string | null;
  };
}

describe("EVT-01: event operations (#251)", () => {
  let adminAccess = "";
  let memberAccess = "";
  let programId = "";

  beforeAll(async () => {
    adminAccess = await accessCookieFor("alice", "alice-secret");
    memberAccess = await accessCookieFor("bob", "bob-secret");
    const dept = await createDepartment(adminAccess, {
      code: "PRG-02-EVT251",
      name: "Event Ops Test Department",
    });
    const program = await createProgram(adminAccess, dept.department_id, {
      name: "Event Ops Program",
      behavior_type: "OneOff",
      discoverability: "Listed",
    });
    programId = program.program_id;
  });

  test("create carries operator identity fields defaulting to availability Active", async () => {
    const event = await createEventFor(adminAccess, programId, {
      starts_at: "2026-09-10T10:00:00.000Z",
      ends_at: "2026-09-10T11:30:00.000Z",
      name: "迎新聚會",
      location: "教會禮堂",
      check_in_window_opens_at: "2026-09-10T09:30:00.000Z",
      check_in_window_closes_at: "2026-09-10T12:00:00.000Z",
    });
    assert.strictEqual(event.status, "Active");
    assert.strictEqual(event.availability, "Active");
    assert.strictEqual(event.source, "MANUAL");
    assert.strictEqual(event.name, "迎新聚會");
    assert.strictEqual(event.location, "教會禮堂");
    assert.ok(event.manual_check_in_code, "event carries a check-in code");
  });

  test("GET detail projects leaders and participant summary; member 403; unknown 404", async () => {
    const event = await createEventFor(adminAccess, programId, {
      starts_at: "2026-09-11T10:00:00.000Z",
      ends_at: "2026-09-11T11:00:00.000Z",
    });
    await testDb()
      .prepare(
        "INSERT INTO enrollments (enrollment_id, program_id, member_user_id, status, enrolled_at, created_by, created_at) VALUES (?, ?, 'U002', 'Active', ?, 'U001', ?)"
      )
      .bind(
        crypto.randomUUID(),
        programId,
        new Date().toISOString(),
        new Date().toISOString()
      )
      .run();
    await testDb()
      .prepare(
        "INSERT INTO attendances (attendance_id, event_id, member_user_id, status, checked_in_at) VALUES (?, ?, 'U002', 'Active', ?)"
      )
      .bind(crypto.randomUUID(), event.event_id, new Date().toISOString())
      .run();

    const res = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${programId}/events/${event.event_id}`,
        {
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          },
        }
      ),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    const result = (await assertCorrelated(res)) as {
      data: {
        event: { event_id: string; program_id: string; availability: string };
        leaders: unknown[];
        participant_summary: { active_enrollments: number; checked_in: number };
      };
    };
    assert.strictEqual(result.data.event.event_id, event.event_id);
    assert.strictEqual(result.data.event.program_id, programId);
    assert.strictEqual(result.data.event.availability, "Active");
    assert.ok(Array.isArray(result.data.leaders));
    assert.strictEqual(result.data.participant_summary.active_enrollments, 1);
    assert.strictEqual(result.data.participant_summary.checked_in, 1);

    const denied = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${programId}/events/${event.event_id}`,
        {
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${memberAccess}`,
          },
        }
      ),
      testEnv()
    );
    assert.strictEqual(denied.status, 403);

    const unknown = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${programId}/events/${crypto.randomUUID()}`,
        {
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          },
        }
      ),
      testEnv()
    );
    assert.strictEqual(unknown.status, 404);

    // Teardown: leave the shared Program without participant state so later
    // tests control their own fixtures.
    await testDb()
      .prepare(
        "DELETE FROM enrollments WHERE program_id = ? AND member_user_id = 'U002' AND status = 'Active'"
      )
      .bind(programId)
      .run();
    await testDb()
      .prepare("DELETE FROM attendances WHERE event_id = ?")
      .bind(event.event_id)
      .run();
  });

  test("PATCH edits identity/schedule/window, audits SUCCESS, and conflicts on duplicate start", async () => {
    const event = await createEventFor(adminAccess, programId, {
      starts_at: "2026-09-12T10:00:00.000Z",
      ends_at: "2026-09-12T11:00:00.000Z",
    });
    const res = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${programId}/events/${event.event_id}`,
        {
          method: "PATCH",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: {
            name: "改名聚會",
            location: "副堂",
            starts_at: "2026-09-12T09:00:00.000Z",
            check_in_window_opens_at: "2026-09-12T08:30:00.000Z",
          },
        }
      ),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    const result = (await assertCorrelated(res)) as {
      data: { event: Record<string, unknown> };
    };
    assert.strictEqual(result.data.event.name, "改名聚會");
    assert.strictEqual(result.data.event.location, "副堂");
    assert.strictEqual(result.data.event.starts_at, "2026-09-12T09:00:00.000Z");
    assert.strictEqual(
      result.data.event.check_in_window_opens_at,
      "2026-09-12T08:30:00.000Z"
    );

    const audit = await testDb()
      .prepare(
        "SELECT action, outcome FROM audit_events WHERE entity_id = ? AND action = 'EVENT_UPDATE' ORDER BY inserted_at DESC LIMIT 1"
      )
      .bind(event.event_id)
      .first<{ action: string; outcome: string }>();
    assert.ok(audit, "EVENT_UPDATE audit row must exist");
    assert.strictEqual(audit.outcome, "SUCCESS");

    // Second event at the old start so a move onto it conflicts.
    const other = await createEventFor(adminAccess, programId, {
      starts_at: "2026-09-13T10:00:00.000Z",
      ends_at: "2026-09-13T11:00:00.000Z",
    });
    const conflict = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${programId}/events/${other.event_id}`,
        {
          method: "PATCH",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: { starts_at: "2026-09-12T09:00:00.000Z" },
        }
      ),
      testEnv()
    );
    assert.strictEqual(conflict.status, 409);
    const conflictBody = await problemOf(conflict);
    assert.strictEqual(conflictBody.code, "CONFLICT");
  });

  test("PATCH absent window fields preserve the window; explicit null clears it", async () => {
    const event = await createEventFor(adminAccess, programId, {
      starts_at: "2026-09-20T10:00:00.000Z",
      ends_at: "2026-09-20T11:00:00.000Z",
    });
    const before = await testDb()
      .prepare(
        "SELECT check_in_window_opens_at, check_in_window_closes_at FROM events WHERE event_id = ?"
      )
      .bind(event.event_id)
      .first<{
        check_in_window_opens_at: string;
        check_in_window_closes_at: string;
      }>();
    assert.ok(before);
    assert.ok(
      before.check_in_window_opens_at,
      "created events derive a check-in window"
    );

    // Fields absent from the payload must keep the existing window.
    const identityOnly = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${programId}/events/${event.event_id}`,
        {
          method: "PATCH",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: { name: "僅改名" },
        }
      ),
      testEnv()
    );
    assert.strictEqual(identityOnly.status, 200);
    const kept = (await assertCorrelated(identityOnly)) as {
      data: {
        event: {
          check_in_window_opens_at: string | null;
          check_in_window_closes_at: string | null;
        };
      };
    };
    assert.strictEqual(
      kept.data.event.check_in_window_opens_at,
      before.check_in_window_opens_at
    );
    assert.strictEqual(
      kept.data.event.check_in_window_closes_at,
      before.check_in_window_closes_at
    );

    // An explicit null must clear the window, not silently keep it.
    const cleared = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${programId}/events/${event.event_id}`,
        {
          method: "PATCH",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: {
            check_in_window_opens_at: null,
            check_in_window_closes_at: null,
          },
        }
      ),
      testEnv()
    );
    assert.strictEqual(cleared.status, 200);
    const result = (await assertCorrelated(cleared)) as {
      data: {
        event: {
          check_in_window_opens_at: string | null;
          check_in_window_closes_at: string | null;
        };
      };
    };
    assert.strictEqual(result.data.event.check_in_window_opens_at, null);
    assert.strictEqual(result.data.event.check_in_window_closes_at, null);

    const after = await testDb()
      .prepare(
        "SELECT check_in_window_opens_at, check_in_window_closes_at FROM events WHERE event_id = ?"
      )
      .bind(event.event_id)
      .first<{
        check_in_window_opens_at: string | null;
        check_in_window_closes_at: string | null;
      }>();
    assert.strictEqual(after?.check_in_window_opens_at, null);
    assert.strictEqual(after?.check_in_window_closes_at, null);
  });

  test("availability: deactivation with event check-ins requires confirmation; confirmed toggle audits SUCCESS", async () => {
    const event = await createEventFor(adminAccess, programId, {
      starts_at: "2026-09-14T10:00:00.000Z",
      ends_at: "2026-09-14T11:00:00.000Z",
    });
    await testDb()
      .prepare(
        "INSERT INTO attendances (attendance_id, event_id, member_user_id, status, checked_in_at) VALUES (?, ?, 'U002', 'Active', ?)"
      )
      .bind(crypto.randomUUID(), event.event_id, new Date().toISOString())
      .run();

    const unconfirmed = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${programId}/events/${event.event_id}`,
        {
          method: "PATCH",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: { availability: "Inactive" },
        }
      ),
      testEnv()
    );
    assert.strictEqual(unconfirmed.status, 409);
    const required = await problemOf(unconfirmed);
    assert.strictEqual(required.code, "CONFIRMATION_REQUIRED");
    assert.strictEqual(
      required.open_operations,
      1,
      "the refusal carries the server's fresh open-operation count"
    );
    const deniedAudit = await testDb()
      .prepare(
        "SELECT outcome FROM audit_events WHERE entity_id = ? AND action = 'EVENT_AVAILABILITY' ORDER BY inserted_at DESC LIMIT 1"
      )
      .bind(event.event_id)
      .first<{ outcome: string }>();
    assert.strictEqual(
      deniedAudit?.outcome,
      "DENIED",
      "confirmation-required deactivation must be audited"
    );

    const confirmed = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${programId}/events/${event.event_id}`,
        {
          method: "PATCH",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: { availability: "Inactive", confirm: true },
        }
      ),
      testEnv()
    );
    assert.strictEqual(confirmed.status, 200);
    const result = (await assertCorrelated(confirmed)) as {
      data: { event: { availability: string } };
    };
    assert.strictEqual(result.data.event.availability, "Inactive");

    const audit = await testDb()
      .prepare(
        "SELECT outcome FROM audit_events WHERE entity_id = ? AND action = 'EVENT_AVAILABILITY' ORDER BY inserted_at DESC LIMIT 1"
      )
      .bind(event.event_id)
      .first<{ outcome: string }>();
    assert.strictEqual(audit?.outcome, "SUCCESS");

    // Teardown: remove the seeded attendance so later tests can deactivate
    // without tripping the confirmation gate.
    await testDb()
      .prepare("DELETE FROM attendances WHERE event_id = ?")
      .bind(event.event_id)
      .run();
  });

  test("availability: program-wide enrollments alone do not gate this event's deactivation", async () => {
    const event = await createEventFor(adminAccess, programId, {
      starts_at: "2026-09-14T12:00:00.000Z",
      ends_at: "2026-09-14T13:00:00.000Z",
    });
    await testDb()
      .prepare(
        "INSERT INTO enrollments (enrollment_id, program_id, member_user_id, status, enrolled_at, created_by, created_at) VALUES (?, ?, 'U002', 'Active', ?, 'U001', ?)"
      )
      .bind(
        crypto.randomUUID(),
        programId,
        new Date().toISOString(),
        new Date().toISOString()
      )
      .run();
    try {
      const deactivate = await worker.fetch(
        programsRequest(
          `/api/v1/programs/${programId}/events/${event.event_id}`,
          {
            method: "PATCH",
            headers: {
              Origin: HOST,
              Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
              "Content-Type": "application/json",
            },
            body: { availability: "Inactive" },
          }
        ),
        testEnv()
      );
      assert.strictEqual(
        deactivate.status,
        200,
        "unrelated Program enrollments must not demand confirmation for this Event"
      );
      const result = (await assertCorrelated(deactivate)) as {
        data: { event: { availability: string } };
      };
      assert.strictEqual(result.data.event.availability, "Inactive");
      const audit = await testDb()
        .prepare(
          "SELECT outcome FROM audit_events WHERE entity_id = ? AND action = 'EVENT_AVAILABILITY' ORDER BY inserted_at DESC LIMIT 1"
        )
        .bind(event.event_id)
        .first<{ outcome: string }>();
      assert.strictEqual(audit?.outcome, "SUCCESS");
    } finally {
      await testDb()
        .prepare(
          "DELETE FROM enrollments WHERE program_id = ? AND member_user_id = 'U002' AND status = 'Active'"
        )
        .bind(programId)
        .run();
    }
  });

  test("availability: member listing hides Inactive events; repeat toggle is a quiet DUPLICATE", async () => {
    const event = await createEventFor(adminAccess, programId, {
      starts_at: "2026-09-15T10:00:00.000Z",
      ends_at: "2026-09-15T11:00:00.000Z",
    });
    const deactivate = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${programId}/events/${event.event_id}`,
        {
          method: "PATCH",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: { availability: "Inactive", confirm: true },
        }
      ),
      testEnv()
    );
    assert.strictEqual(deactivate.status, 200);

    const memberView = await listEventsFor(memberAccess, programId);
    assert.ok(
      !memberView.some((e) => e.event_id === event.event_id),
      "Member must not see Inactive events"
    );

    const repeat = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${programId}/events/${event.event_id}`,
        {
          method: "PATCH",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: { availability: "Inactive", confirm: true },
        }
      ),
      testEnv()
    );
    assert.strictEqual(repeat.status, 200);
    const duplicate = await testDb()
      .prepare(
        "SELECT outcome FROM audit_events WHERE entity_id = ? AND action = 'EVENT_AVAILABILITY' ORDER BY inserted_at DESC LIMIT 1"
      )
      .bind(event.event_id)
      .first<{ outcome: string }>();
    assert.strictEqual(duplicate?.outcome, "DUPLICATE");
  });

  test("attendance resolve and check-in deny an Inactive event with EVENT_UNAVAILABLE", async () => {
    const event = await createEventFor(adminAccess, programId, {
      starts_at: "2026-09-16T10:00:00.000Z",
      ends_at: "2026-09-16T11:00:00.000Z",
      check_in_window_opens_at: "2026-09-16T09:00:00.000Z",
      check_in_window_closes_at: "2026-09-16T12:00:00.000Z",
    });
    assert.ok(event.manual_check_in_code, "manual code required for resolve");
    await testDb()
      .prepare(
        "INSERT INTO enrollments (enrollment_id, program_id, member_user_id, status, enrolled_at, created_by, created_at) VALUES (?, ?, 'U002', 'Active', ?, 'U001', ?)"
      )
      .bind(
        crypto.randomUUID(),
        programId,
        new Date().toISOString(),
        new Date().toISOString()
      )
      .run();
    const deactivate = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${programId}/events/${event.event_id}`,
        {
          method: "PATCH",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: { availability: "Inactive", confirm: true },
        }
      ),
      testEnv()
    );
    assert.strictEqual(deactivate.status, 200);

    const resolve = await worker.fetch(
      programsRequest(
        `/api/v1/attendance/resolve?manual_code=${encodeURIComponent(event.manual_check_in_code)}`,
        {
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${memberAccess}`,
          },
        }
      ),
      testEnv()
    );
    assert.strictEqual(resolve.status, 409);
    const body = await problemOf(resolve);
    assert.strictEqual(body.code, "EVENT_UNAVAILABLE");

    const checkIn = await worker.fetch(
      programsRequest(`/api/v1/attendance/self`, {
        method: "POST",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${memberAccess}`,
          "Content-Type": "application/json",
        },
        body: {
          event_id: event.event_id,
          method: "self_manual_code",
          manual_code: event.manual_check_in_code,
        },
      }),
      testEnv()
    );
    assert.strictEqual(checkIn.status, 409);
    const checkInBody = await problemOf(checkIn);
    assert.strictEqual(checkInBody.code, "EVENT_UNAVAILABLE");

    const audit = await testDb()
      .prepare(
        "SELECT reason FROM audit_events WHERE action = 'attendance.check_in' AND entity_id = ? AND outcome = 'DENIED' ORDER BY inserted_at DESC LIMIT 1"
      )
      .bind(event.event_id)
      .first<{ reason: string }>();
    assert.strictEqual(audit?.reason, "EVENT_UNAVAILABLE");
  });
});

// ---------------------------------------------------------------------------
// PRG-03 (#199): enrollment requests and enrollments.
// ---------------------------------------------------------------------------

async function submitRequest(
  access: string,
  programId: string
): Promise<{ request_id: string; status: string }> {
  const res = await worker.fetch(
    programsRequest(`/api/v1/programs/${programId}/enrollment-requests`, {
      method: "POST",
      headers: {
        Origin: HOST,
        Cookie: `${ACCESS_COOKIE_NAME}=${access}`,
        "Content-Type": "application/json",
      },
      body: {},
    }),
    testEnv()
  );
  assert.strictEqual(res.status, 201);
  const result = (await assertCorrelated(res)) as {
    data: { request: { request_id: string; status: string } };
  };
  return result.data.request;
}

function decideRequest(
  access: string,
  programId: string,
  requestId: string,
  action: "Approved" | "Rejected"
): Promise<Response> {
  return worker.fetch(
    programsRequest(
      `/api/v1/programs/${programId}/enrollment-requests/${requestId}/decision`,
      {
        method: "POST",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${access}`,
          "Content-Type": "application/json",
        },
        body: { action },
      }
    ),
    testEnv()
  );
}

function assistedEnrollFor(
  access: string,
  programId: string,
  memberUserId: string
): Promise<Response> {
  return worker.fetch(
    programsRequest(`/api/v1/programs/${programId}/enrollments`, {
      method: "POST",
      headers: {
        Origin: HOST,
        Cookie: `${ACCESS_COOKIE_NAME}=${access}`,
        "Content-Type": "application/json",
      },
      body: { member_user_id: memberUserId },
    }),
    testEnv()
  );
}

async function listRequestsFor(
  access: string,
  programId: string
): Promise<{ request_id: string; member_user_id: string; status: string }[]> {
  const res = await worker.fetch(
    programsRequest(`/api/v1/programs/${programId}/enrollment-requests`, {
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
      requests: {
        request_id: string;
        member_user_id: string;
        status: string;
      }[];
    };
  };
  return result.data.requests;
}

async function listEnrollmentsFor(
  access: string,
  programId: string
): Promise<
  { enrollment_id: string; member_user_id: string; status: string }[]
> {
  const res = await worker.fetch(
    programsRequest(`/api/v1/programs/${programId}/enrollments`, {
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
      enrollments: {
        enrollment_id: string;
        member_user_id: string;
        status: string;
      }[];
    };
  };
  return result.data.enrollments;
}

function cancelEnrollmentFor(
  access: string,
  programId: string,
  enrollmentId: string
): Promise<Response> {
  return worker.fetch(
    programsRequest(
      `/api/v1/programs/${programId}/enrollments/${enrollmentId}/cancel`,
      {
        method: "POST",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${access}`,
          "Content-Type": "application/json",
        },
        body: {},
      }
    ),
    testEnv()
  );
}

describe("PRG-03: enrollment requests", () => {
  let adminAccess = "";
  let memberAccess = "";
  let carolAccess = "";
  let deptId = "";
  let requestProgramId = "";
  let managerOnlyId = "";

  beforeAll(async () => {
    await importLegacyUsers(testDb(), [
      HEADER,
      ["U003", "Carol Wong", "carol", "9012", "Member", "Active"],
    ]);
    await completeCredentialUpgrade(testDb(), {
      userId: "U003",
      legacyPin: "9012",
      newCredential: "carol-secret",
    });
    adminAccess = await accessCookieFor("alice", "alice-secret");
    memberAccess = await accessCookieFor("bob", "bob-secret");
    carolAccess = await accessCookieFor("carol", "carol-secret");
    const dept = await createDepartment(adminAccess, {
      code: "PRG-03",
      name: "Enrollment Test Department",
    });
    deptId = dept.department_id;
    const requestProgram = await createProgram(adminAccess, deptId, {
      name: "Request Enrollment Program",
      behavior_type: "Recurring",
      discoverability: "Listed",
      enrollment_mode: "MemberRequest",
    });
    requestProgramId = requestProgram.program_id;
    const managerOnly = await createProgram(adminAccess, deptId, {
      name: "Managed Enrollment Program",
      behavior_type: "Recurring",
      discoverability: "Listed",
      enrollment_mode: "ManagerOnly",
    });
    managerOnlyId = managerOnly.program_id;
  });

  async function freshRequestProgram(name: string): Promise<string> {
    const program = await createProgram(adminAccess, deptId, {
      name,
      behavior_type: "Recurring",
      discoverability: "Listed",
      enrollment_mode: "MemberRequest",
    });
    return program.program_id;
  }

  test("REQ-1/2 a member submits a Pending request; ManagerOnly and unknown programs are rejected", async () => {
    const request = await submitRequest(memberAccess, requestProgramId);
    assert.strictEqual(request.status, "Pending");

    const row = await testDb()
      .prepare(
        "SELECT status, request_version FROM enrollment_requests WHERE request_id = ?"
      )
      .bind(request.request_id)
      .first<{ status: string; request_version: number }>();
    assert.strictEqual(row?.status, "Pending");
    assert.strictEqual(row?.request_version, 1);

    const managerOnly = await worker.fetch(
      programsRequest(`/api/v1/programs/${managerOnlyId}/enrollment-requests`, {
        method: "POST",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${memberAccess}`,
          "Content-Type": "application/json",
        },
        body: {},
      }),
      testEnv()
    );
    assert.strictEqual(managerOnly.status, 422);

    const unknown = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${crypto.randomUUID()}/enrollment-requests`,
        {
          method: "POST",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${memberAccess}`,
            "Content-Type": "application/json",
          },
          body: {},
        }
      ),
      testEnv()
    );
    assert.strictEqual(unknown.status, 404);
  });

  test("REQ-2 an Admin actor without program.enroll is denied 403", async () => {
    const res = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${requestProgramId}/enrollment-requests`,
        {
          method: "POST",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: {},
        }
      ),
      testEnv()
    );
    assert.strictEqual(res.status, 403);
  });

  test("child enrollment routes reject a mismatched parent program", async () => {
    const programId = await freshRequestProgram("REQ-2A Scoped Program");
    const request = await submitRequest(memberAccess, programId);
    const mismatched = await decideRequest(
      adminAccess,
      managerOnlyId,
      request.request_id,
      "Approved"
    );
    assert.strictEqual(mismatched.status, 404);
    const row = await testDb()
      .prepare("SELECT status FROM enrollment_requests WHERE request_id = ?")
      .bind(request.request_id)
      .first<{ status: string }>();
    assert.strictEqual(row?.status, "Pending");
  });

  test("REQ-3 duplicate Pending request and existing Active enrollment are 409", async () => {
    const programId = await freshRequestProgram("REQ-3 Program");
    const first = await submitRequest(carolAccess, programId);
    const duplicate = await worker.fetch(
      programsRequest(`/api/v1/programs/${programId}/enrollment-requests`, {
        method: "POST",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${carolAccess}`,
          "Content-Type": "application/json",
        },
        body: {},
      }),
      testEnv()
    );
    assert.strictEqual(duplicate.status, 409);
    const dupBody = await problemOf(duplicate);
    assert.strictEqual(dupBody.code, "ENROLLMENT_DUPLICATE");

    const approved = await decideRequest(
      adminAccess,
      programId,
      first.request_id,
      "Approved"
    );
    assert.strictEqual(approved.status, 200);

    const afterActive = await worker.fetch(
      programsRequest(`/api/v1/programs/${programId}/enrollment-requests`, {
        method: "POST",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${carolAccess}`,
          "Content-Type": "application/json",
        },
        body: {},
      }),
      testEnv()
    );
    assert.strictEqual(afterActive.status, 409);
    const afterActiveBody = await problemOf(afterActive);
    assert.strictEqual(afterActiveBody.code, "ENROLLMENT_DUPLICATE");

    const duplicateAudit = await testDb()
      .prepare(
        "SELECT outcome FROM audit_events WHERE action = 'ENROLLMENT_REQUEST_CREATE' AND outcome = 'DUPLICATE'"
      )
      .all<{ outcome: string }>();
    assert.ok(
      duplicateAudit.results && duplicateAudit.results.length > 0,
      "same-actor repeat submissions audit DUPLICATE (ADR-0023)"
    );
  });

  test("REQ-4 approval creates an Active enrollment tied to the request", async () => {
    const programId = await freshRequestProgram("REQ-4 Program");
    const request = await submitRequest(memberAccess, programId);
    const res = await decideRequest(
      adminAccess,
      programId,
      request.request_id,
      "Approved"
    );
    assert.strictEqual(res.status, 200);

    const requestRow = await testDb()
      .prepare(
        "SELECT status, decided_by, decided_at FROM enrollment_requests WHERE request_id = ?"
      )
      .bind(request.request_id)
      .first<{ status: string; decided_by: string; decided_at: string }>();
    assert.strictEqual(requestRow?.status, "Approved");
    assert.strictEqual(requestRow?.decided_by, "U001");
    assert.ok(requestRow?.decided_at);

    const enrollmentRow = await testDb()
      .prepare(
        "SELECT enrollment_id, member_user_id, request_id, status FROM enrollments WHERE request_id = ?"
      )
      .bind(request.request_id)
      .first<{
        enrollment_id: string;
        member_user_id: string;
        request_id: string;
        status: string;
      }>();
    assert.strictEqual(enrollmentRow?.status, "Active");
    assert.strictEqual(enrollmentRow?.member_user_id, "U002");
    assert.strictEqual(enrollmentRow?.request_id, request.request_id);

    const audits = await testDb()
      .prepare(
        "SELECT action FROM audit_events WHERE action IN ('ENROLLMENT_REQUEST_DECIDE', 'ENROLLMENT_CREATE')"
      )
      .all<{ action: string }>();
    const actions = new Set((audits.results ?? []).map((r) => r.action));
    assert.ok(actions.has("ENROLLMENT_REQUEST_DECIDE"));
    assert.ok(actions.has("ENROLLMENT_CREATE"));
  });

  test("REQ-5 rejection leaves the request Rejected and no enrollment", async () => {
    const programId = await freshRequestProgram("REQ-5 Program");
    const request = await submitRequest(carolAccess, programId);
    const res = await decideRequest(
      adminAccess,
      programId,
      request.request_id,
      "Rejected"
    );
    assert.strictEqual(res.status, 200);
    const row = await testDb()
      .prepare("SELECT status FROM enrollment_requests WHERE request_id = ?")
      .bind(request.request_id)
      .first<{ status: string }>();
    assert.strictEqual(row?.status, "Rejected");
    const enrollments = await testDb()
      .prepare("SELECT enrollment_id FROM enrollments WHERE request_id = ?")
      .bind(request.request_id)
      .all<{ enrollment_id: string }>();
    assert.strictEqual(enrollments.results?.length, 0);
  });

  test("REQ-6 withdrawal is self-service, only while Pending", async () => {
    const programId = await freshRequestProgram("REQ-6 Program");
    const request = await submitRequest(memberAccess, programId);
    const withdrawn = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${programId}/enrollment-requests/${request.request_id}/withdraw`,
        {
          method: "POST",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${memberAccess}`,
            "Content-Type": "application/json",
          },
          body: {},
        }
      ),
      testEnv()
    );
    assert.strictEqual(withdrawn.status, 200);
    const row = await testDb()
      .prepare("SELECT status FROM enrollment_requests WHERE request_id = ?")
      .bind(request.request_id)
      .first<{ status: string }>();
    assert.strictEqual(row?.status, "Withdrawn");

    const afterWithdraw = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${programId}/enrollment-requests/${request.request_id}/withdraw`,
        {
          method: "POST",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${memberAccess}`,
            "Content-Type": "application/json",
          },
          body: {},
        }
      ),
      testEnv()
    );
    assert.strictEqual(afterWithdraw.status, 200);

    const carolRequest = await submitRequest(carolAccess, programId);
    const crossActor = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${programId}/enrollment-requests/${carolRequest.request_id}/withdraw`,
        {
          method: "POST",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${memberAccess}`,
            "Content-Type": "application/json",
          },
          body: {},
        }
      ),
      testEnv()
    );
    assert.strictEqual(crossActor.status, 403);
  });

  test("REQ-7 concurrent decisions yield one success and exactly one enrollment", async () => {
    const programId = await freshRequestProgram("REQ-7 Program");
    const request = await submitRequest(memberAccess, programId);
    const [first, second] = await Promise.all([
      decideRequest(adminAccess, programId, request.request_id, "Approved"),
      decideRequest(adminAccess, programId, request.request_id, "Approved"),
    ]);
    const statuses = [first.status, second.status].sort();
    assert.deepStrictEqual(statuses, [200, 200]);
    const enrollments = await testDb()
      .prepare(
        "SELECT enrollment_id FROM enrollments WHERE request_id = ? AND status = 'Active'"
      )
      .bind(request.request_id)
      .all<{ enrollment_id: string }>();
    assert.strictEqual(enrollments.results?.length, 1);

    const orphans = await testDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM enrollment_requests r
         LEFT JOIN enrollments e ON e.request_id = r.request_id
         WHERE r.status = 'Approved' AND e.enrollment_id IS NULL`
      )
      .first<{ n: number }>();
    assert.strictEqual(
      orphans?.n,
      0,
      "no Approved request may exist without an Enrollment (terminal evidence)"
    );

    const decides = await testDb()
      .prepare(
        `SELECT outcome, COUNT(*) AS n FROM audit_events
         WHERE action = 'ENROLLMENT_REQUEST_DECIDE' AND entity_id = ?
         GROUP BY outcome`
      )
      .bind(request.request_id)
      .all<{ outcome: string; n: number }>();
    const byOutcome = new Map(
      (decides.results ?? []).map((r) => [r.outcome, r.n])
    );
    assert.strictEqual(byOutcome.get("SUCCESS"), 1, "one committed decision");
    assert.strictEqual(
      byOutcome.get("DUPLICATE"),
      1,
      "repeat decision audits DUPLICATE"
    );
  });

  test("REQ-9 approval race loser audits CONFLICT against the existing enrollment", async () => {
    const programId = await freshRequestProgram("REQ-9 Program");
    const request = await submitRequest(carolAccess, programId);
    const now = new Date().toISOString();
    const otherRequestId = crypto.randomUUID();
    await testDb()
      .prepare(
        `INSERT INTO enrollment_requests (request_id, program_id, member_user_id,
           status, submitted_at, request_version)
         VALUES (?, ?, 'U003', 'Rejected', ?, 1)`
      )
      .bind(otherRequestId, programId, now)
      .run();
    await testDb()
      .prepare(
        `INSERT INTO enrollments (enrollment_id, program_id, member_user_id,
           request_id, status, enrolled_at, created_by, created_at)
         VALUES (?, ?, 'U003', ?, 'Active', ?, ?, ?)`
      )
      .bind(crypto.randomUUID(), programId, otherRequestId, now, "U002", now)
      .run();
    const res = await decideRequest(
      adminAccess,
      programId,
      request.request_id,
      "Approved"
    );
    assert.strictEqual(res.status, 409);
    const raceBody = await problemOf(res);
    assert.strictEqual(raceBody.code, "ENROLLMENT_DUPLICATE");
    const conflictAudit = await testDb()
      .prepare(
        "SELECT outcome FROM audit_events WHERE action = 'ENROLLMENT_REQUEST_DECIDE' AND outcome = 'CONFLICT' AND entity_id = ?"
      )
      .bind(request.request_id)
      .all<{ outcome: string }>();
    assert.ok(
      conflictAudit.results && conflictAudit.results.length > 0,
      "race loser audits CONFLICT (ADR-0027)"
    );
  });

  test("REQ-8 no credential material leaks in request responses", async () => {
    const res = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${requestProgramId}/enrollment-requests`,
        {
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          },
        }
      ),
      testEnv()
    );
    const text = await res.text();
    assert.ok(
      !/password|credential_hash|legacy_pin_hash|access_token|session_token/iu.test(
        text
      )
    );
  });

  test("REQ-10 X-Request-Id is a fresh per-request id, never the Idempotency-Key", async () => {
    const programId = await freshRequestProgram("REQ-10 Program");
    const request = await submitRequest(memberAccess, programId);
    const idempotencyKey = "idem-key-req10";
    const res = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${programId}/enrollment-requests/${request.request_id}/decision`,
        {
          method: "POST",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: { action: "Approved" },
        }
      ),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    const header = res.headers.get("X-Request-Id");
    assert.ok(header);
    assert.notStrictEqual(
      header,
      idempotencyKey,
      "X-Request-Id must not echo the caller-supplied Idempotency-Key"
    );
    const body = (await res.json()) as { requestId?: string };
    assert.strictEqual(body.requestId, header);
  });
});

describe("PRG-03: enrollments", () => {
  let adminAccess = "";
  let memberAccess = "";
  let deptId = "";
  let requestProgramId = "";
  let managerOnlyId = "";
  let unlistedId = "";

  beforeAll(async () => {
    adminAccess = await accessCookieFor("alice", "alice-secret");
    memberAccess = await accessCookieFor("bob", "bob-secret");
    const dept = await createDepartment(adminAccess, {
      code: "PRG-03-ENR",
      name: "Enrollment State Department",
    });
    deptId = dept.department_id;
    const requestProgram = await createProgram(adminAccess, deptId, {
      name: "Enrollment State Request Program",
      behavior_type: "Recurring",
      discoverability: "Listed",
      enrollment_mode: "MemberRequest",
    });
    requestProgramId = requestProgram.program_id;
    const managerOnly = await createProgram(adminAccess, deptId, {
      name: "Enrollment State Managed Program",
      behavior_type: "Recurring",
      discoverability: "Listed",
      enrollment_mode: "ManagerOnly",
    });
    managerOnlyId = managerOnly.program_id;
    const unlisted = await createProgram(adminAccess, deptId, {
      name: "Enrollment State Unlisted Program",
      behavior_type: "Recurring",
      discoverability: "Unlisted",
      enrollment_mode: "MemberRequest",
    });
    unlistedId = unlisted.program_id;
  });

  test("ENR-1 assisted enrollment creates an Active record with no fake request", async () => {
    const res = await assistedEnrollFor(adminAccess, managerOnlyId, "U002");
    assert.strictEqual(res.status, 201);
    const result = (await assertCorrelated(res)) as {
      data: {
        enrollment: {
          enrollment_id: string;
          request_id: string | null;
          status: string;
        };
      };
    };
    assert.strictEqual(result.data.enrollment.status, "Active");
    assert.strictEqual(result.data.enrollment.request_id, null);

    const requests = await testDb()
      .prepare(
        "SELECT request_id FROM enrollment_requests WHERE program_id = ?"
      )
      .bind(managerOnlyId)
      .all<{ request_id: string }>();
    assert.strictEqual(requests.results?.length, 0, "no fake request row");

    const wrongMode = await assistedEnrollFor(
      adminAccess,
      requestProgramId,
      "U002"
    );
    assert.strictEqual(wrongMode.status, 422);
  });

  test("ENR-2 assisted enrollment for an unknown member is 422", async () => {
    const res = await assistedEnrollFor(
      adminAccess,
      managerOnlyId,
      crypto.randomUUID()
    );
    assert.strictEqual(res.status, 422);
  });

  test("ENR-3 concurrent assisted enrollment yields at most one Active row", async () => {
    const [first, second] = await Promise.all([
      assistedEnrollFor(adminAccess, managerOnlyId, "U003"),
      assistedEnrollFor(adminAccess, managerOnlyId, "U003"),
    ]);
    const statuses = [first.status, second.status].sort();
    assert.deepStrictEqual(statuses, [201, 409]);
    const rows = await testDb()
      .prepare(
        "SELECT enrollment_id FROM enrollments WHERE program_id = ? AND member_user_id = 'U003' AND status = 'Active'"
      )
      .bind(managerOnlyId)
      .all<{ enrollment_id: string }>();
    assert.strictEqual(rows.results?.length, 1);
  });

  test("ENR-4 members cancel their own enrollment; managers cancel in scope; cross-member is 403", async () => {
    const res = await assistedEnrollFor(adminAccess, managerOnlyId, "U002");
    assert.strictEqual(res.status, 409, "U002 already active from ENR-1");
    const dupEnrollBody = await problemOf(res);
    assert.strictEqual(dupEnrollBody.code, "ENROLLMENT_DUPLICATE");
    const bobEnrollment = await testDb()
      .prepare(
        "SELECT enrollment_id FROM enrollments WHERE program_id = ? AND member_user_id = 'U002' AND status = 'Active'"
      )
      .bind(managerOnlyId)
      .first<{ enrollment_id: string }>();
    assert.ok(bobEnrollment);

    const ownCancel = await cancelEnrollmentFor(
      memberAccess,
      managerOnlyId,
      bobEnrollment.enrollment_id
    );
    assert.strictEqual(ownCancel.status, 200);
    const cancelled = (await assertCorrelated(ownCancel)) as {
      data: {
        enrollment: {
          status: string;
          cancelled_by: string;
          cancelled_at: string;
        };
      };
    };
    assert.strictEqual(cancelled.data.enrollment.status, "Cancelled");
    assert.strictEqual(cancelled.data.enrollment.cancelled_by, "U002");
    assert.ok(cancelled.data.enrollment.cancelled_at);

    const thirdParty = await assistedEnrollFor(
      adminAccess,
      managerOnlyId,
      "U003"
    );
    assert.strictEqual(thirdParty.status, 409, "U003 active from ENR-3");
    const carolEnrollment = await testDb()
      .prepare(
        "SELECT enrollment_id FROM enrollments WHERE program_id = ? AND member_user_id = 'U003' AND status = 'Active'"
      )
      .bind(managerOnlyId)
      .first<{ enrollment_id: string }>();
    assert.ok(carolEnrollment);
    const crossMember = await cancelEnrollmentFor(
      memberAccess,
      managerOnlyId,
      carolEnrollment.enrollment_id
    );
    assert.strictEqual(crossMember.status, 403);

    const managerCancel = await cancelEnrollmentFor(
      adminAccess,
      managerOnlyId,
      carolEnrollment.enrollment_id
    );
    assert.strictEqual(managerCancel.status, 200);
  });

  test("ENR-5 cancellation never reopens; re-enrollment creates a new record", async () => {
    const rows = await testDb()
      .prepare(
        "SELECT enrollment_id FROM enrollments WHERE program_id = ? AND member_user_id = 'U002' ORDER BY created_at ASC"
      )
      .bind(managerOnlyId)
      .all<{ enrollment_id: string }>();
    assert.strictEqual(rows.results?.length, 1);
    const cancelledId = rows.results?.[0]?.enrollment_id;
    assert.ok(cancelledId);

    const secondCancel = await cancelEnrollmentFor(
      adminAccess,
      managerOnlyId,
      cancelledId
    );
    assert.strictEqual(secondCancel.status, 200);

    const reenroll = await assistedEnrollFor(
      adminAccess,
      managerOnlyId,
      "U002"
    );
    assert.strictEqual(reenroll.status, 201);
    const reenrolled = (await assertCorrelated(reenroll)) as {
      data: { enrollment: { enrollment_id: string; status: string } };
    };
    assert.notStrictEqual(
      reenrolled.data.enrollment.enrollment_id,
      cancelledId
    );

    const oldRow = await testDb()
      .prepare("SELECT status FROM enrollments WHERE enrollment_id = ?")
      .bind(cancelledId)
      .first<{ status: string }>();
    assert.strictEqual(oldRow?.status, "Cancelled", "old record never reopens");
  });

  test("ENR-6 members see their own rows; managers see all; Unlisted is invisible to members", async () => {
    const memberRequests = await listRequestsFor(
      memberAccess,
      requestProgramId
    );
    const otherMemberSeen = memberRequests.some(
      (r) => r.member_user_id !== "U002"
    );
    assert.ok(!otherMemberSeen, "member must only see own requests");

    const adminRequests = await listRequestsFor(adminAccess, requestProgramId);
    assert.ok(adminRequests.length >= memberRequests.length);

    const memberEnrollments = await listEnrollmentsFor(
      memberAccess,
      requestProgramId
    );
    const otherSeen = memberEnrollments.some(
      (e) => e.member_user_id !== "U002"
    );
    assert.ok(!otherSeen, "member must only see own enrollments");

    const unlisted = await worker.fetch(
      programsRequest(`/api/v1/programs/${unlistedId}/enrollment-requests`, {
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${memberAccess}`,
        },
      }),
      testEnv()
    );
    assert.strictEqual(unlisted.status, 404);
  });

  test("ENR-7 enrollment lifecycle is fully audited", async () => {
    const actions = await testDb()
      .prepare(
        "SELECT action FROM audit_events WHERE action IN ('ENROLLMENT_REQUEST_CREATE', 'ENROLLMENT_REQUEST_DECIDE', 'ENROLLMENT_REQUEST_WITHDRAW', 'ENROLLMENT_CREATE', 'ENROLLMENT_CANCEL')"
      )
      .all<{ action: string }>();
    const found = new Set((actions.results ?? []).map((r) => r.action));
    for (const expected of [
      "ENROLLMENT_REQUEST_CREATE",
      "ENROLLMENT_REQUEST_DECIDE",
      "ENROLLMENT_REQUEST_WITHDRAW",
      "ENROLLMENT_CREATE",
      "ENROLLMENT_CANCEL",
    ]) {
      assert.ok(found.has(expected), `${expected} audit row must exist`);
    }
  });

  test("ENR-8 no credential material leaks in enrollment responses", async () => {
    const res = await worker.fetch(
      programsRequest(`/api/v1/programs/${managerOnlyId}/enrollments`, {
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
        },
      }),
      testEnv()
    );
    const text = await res.text();
    assert.ok(
      !/password|credential_hash|legacy_pin_hash|access_token|session_token/iu.test(
        text
      )
    );
  });

  test("REQ-9 decide-on-decided is a quiet 200 with a DUPLICATE audit row", async () => {
    const programId = (
      await createProgram(adminAccess, deptId, {
        name: "Decide Repeat Program",
        behavior_type: "Recurring",
        discoverability: "Listed",
        enrollment_mode: "MemberRequest",
      })
    ).program_id;
    const request = await submitRequest(memberAccess, programId);
    const first = await decideRequest(
      adminAccess,
      programId,
      request.request_id,
      "Approved"
    );
    assert.strictEqual(first.status, 200);
    const again = await decideRequest(
      adminAccess,
      programId,
      request.request_id,
      "Approved"
    );
    assert.strictEqual(again.status, 200);
    const row = await testDb()
      .prepare("SELECT status FROM enrollment_requests WHERE request_id = ?")
      .bind(request.request_id)
      .first<{ status: string }>();
    assert.strictEqual(
      row?.status,
      "Approved",
      "request state must not change"
    );
    const audit = await testDb()
      .prepare(
        `SELECT outcome FROM audit_events
         WHERE action = 'ENROLLMENT_REQUEST_DECIDE' AND outcome = 'DUPLICATE'
           AND entity_id = ?`
      )
      .bind(request.request_id)
      .first<{ outcome: string }>();
    assert.ok(audit, "decide-on-decided must write a DUPLICATE audit row");
  });

  test("REQ-10 withdraw-on-withdrawn is a quiet 200 with a DUPLICATE audit row", async () => {
    const programId = (
      await createProgram(adminAccess, deptId, {
        name: "Withdraw Repeat Program",
        behavior_type: "Recurring",
        discoverability: "Listed",
        enrollment_mode: "MemberRequest",
      })
    ).program_id;
    const request = await submitRequest(memberAccess, programId);
    const first = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${programId}/enrollment-requests/${request.request_id}/withdraw`,
        {
          method: "POST",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${memberAccess}`,
            "Content-Type": "application/json",
          },
          body: {},
        }
      ),
      testEnv()
    );
    assert.strictEqual(first.status, 200);
    const again = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${programId}/enrollment-requests/${request.request_id}/withdraw`,
        {
          method: "POST",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${memberAccess}`,
            "Content-Type": "application/json",
          },
          body: {},
        }
      ),
      testEnv()
    );
    assert.strictEqual(again.status, 200);
    const row = await testDb()
      .prepare("SELECT status FROM enrollment_requests WHERE request_id = ?")
      .bind(request.request_id)
      .first<{ status: string }>();
    assert.strictEqual(
      row?.status,
      "Withdrawn",
      "request state must not change"
    );
    const audit = await testDb()
      .prepare(
        `SELECT outcome FROM audit_events
         WHERE action = 'ENROLLMENT_REQUEST_WITHDRAW' AND outcome = 'DUPLICATE'
           AND entity_id = ?`
      )
      .bind(request.request_id)
      .first<{ outcome: string }>();
    assert.ok(audit, "withdraw-on-withdrawn must write a DUPLICATE audit row");
  });

  test("EVT-9 cancel-on-cancelled is a quiet 200 with a DUPLICATE audit row", async () => {
    const programId = (
      await createProgram(adminAccess, deptId, {
        name: "Cancel Repeat Program",
        behavior_type: "Recurring",
        discoverability: "Listed",
      })
    ).program_id;
    const created = await worker.fetch(
      programsRequest(`/api/v1/programs/${programId}/events`, {
        method: "POST",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: {
          starts_at: "2026-12-01T10:00:00.000Z",
          ends_at: "2026-12-01T11:00:00.000Z",
        },
      }),
      testEnv()
    );
    assert.strictEqual(created.status, 201);
    const {
      data: { event },
    } = (await assertCorrelated(created)) as {
      data: { event: { event_id: string; status: string } };
    };
    assert.strictEqual(event.status, "Active");
    const first = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${programId}/events/${event.event_id}`,
        {
          method: "PATCH",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: { reason: "repeat-cancel" },
        }
      ),
      testEnv()
    );
    assert.strictEqual(first.status, 200);
    const again = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${programId}/events/${event.event_id}`,
        {
          method: "PATCH",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: { reason: "repeat-cancel" },
        }
      ),
      testEnv()
    );
    assert.strictEqual(again.status, 200);
    const audit = await testDb()
      .prepare(
        `SELECT outcome FROM audit_events
         WHERE action = 'EVENT_CANCEL' AND outcome = 'DUPLICATE'
           AND entity_id = ?`
      )
      .bind(event.event_id)
      .first<{ outcome: string }>();
    assert.ok(audit, "cancel-on-cancelled must write a DUPLICATE audit row");
    const listed = await worker.fetch(
      programsRequest(`/api/v1/programs/${programId}/events`, {
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
        },
      }),
      testEnv()
    );
    assert.strictEqual(listed.status, 200);
    const listedBody = (await assertCorrelated(listed)) as {
      data: {
        events: {
          event_id: string;
          status: string;
          cancel_reason: string | null;
        }[];
      };
    };
    const stored = listedBody.data.events.find(
      (e) => e.event_id === event.event_id
    );
    assert.strictEqual(stored?.status, "Cancelled");
    assert.strictEqual(stored?.cancel_reason, "repeat-cancel");
  });

  test("REQ-11 cancel-on-cancelled enrollment is a quiet 200 with a DUPLICATE audit row", async () => {
    const programId = (
      await createProgram(adminAccess, deptId, {
        name: "Enrollment Cancel Repeat Program",
        behavior_type: "Recurring",
        discoverability: "Listed",
        enrollment_mode: "MemberRequest",
      })
    ).program_id;
    const request = await submitRequest(memberAccess, programId);
    const decided = await decideRequest(
      adminAccess,
      programId,
      request.request_id,
      "Approved"
    );
    assert.strictEqual(decided.status, 200);
    const enrollment = await testDb()
      .prepare(
        "SELECT enrollment_id, status FROM enrollments WHERE request_id = ?"
      )
      .bind(request.request_id)
      .first<{ enrollment_id: string; status: string }>();
    assert.ok(enrollment, "approved request must produce an enrollment");
    assert.strictEqual(enrollment.status, "Active");
    const first = await cancelEnrollmentFor(
      memberAccess,
      programId,
      enrollment.enrollment_id
    );
    assert.strictEqual(first.status, 200);
    const again = await cancelEnrollmentFor(
      memberAccess,
      programId,
      enrollment.enrollment_id
    );
    assert.strictEqual(again.status, 200);
    const audit = await testDb()
      .prepare(
        `SELECT outcome FROM audit_events
         WHERE action = 'ENROLLMENT_CANCEL' AND outcome = 'DUPLICATE'
           AND entity_id = ?`
      )
      .bind(enrollment.enrollment_id)
      .first<{ outcome: string }>();
    assert.ok(audit, "cancel-on-cancelled must write a DUPLICATE audit row");
    const stored = await testDb()
      .prepare("SELECT status FROM enrollments WHERE enrollment_id = ?")
      .bind(enrollment.enrollment_id)
      .first<{ status: string }>();
    assert.strictEqual(stored?.status, "Cancelled", "state must not change");
  });
});

// ---------------------------------------------------------------------------
// PRG-04 (#200): Program Leader & delegation.
// ---------------------------------------------------------------------------

function assignLeader(
  access: string,
  programId: string,
  userId: string
): Promise<Response> {
  return worker.fetch(
    programsRequest(`/api/v1/programs/${programId}/leaders`, {
      method: "POST",
      headers: {
        Origin: HOST,
        Cookie: `${ACCESS_COOKIE_NAME}=${access}`,
        "Content-Type": "application/json",
      },
      body: { user_id: userId },
    }),
    testEnv()
  );
}

function revokeLeader(
  access: string,
  programId: string,
  userId: string
): Promise<Response> {
  return worker.fetch(
    programsRequest(`/api/v1/programs/${programId}/leaders/${userId}/revoke`, {
      method: "POST",
      headers: {
        Origin: HOST,
        Cookie: `${ACCESS_COOKIE_NAME}=${access}`,
        "Content-Type": "application/json",
      },
      body: {},
    }),
    testEnv()
  );
}

async function listLeadersFor(
  access: string,
  programId: string
): Promise<{ user_id: string; revoked_at: string | null }[]> {
  const res = await worker.fetch(
    programsRequest(`/api/v1/programs/${programId}/leaders`, {
      headers: {
        Origin: HOST,
        Cookie: `${ACCESS_COOKIE_NAME}=${access}`,
      },
    }),
    testEnv()
  );
  assert.strictEqual(res.status, 200);
  const body = (await assertCorrelated(res)) as {
    data: { leaders: { user_id: string; revoked_at: string | null }[] };
  };
  return body.data.leaders;
}

async function countLeaderAudits(): Promise<number> {
  const row = await testDb()
    .prepare(
      "SELECT COUNT(*) AS n FROM audit_events WHERE action IN ('PROGRAM_LEADER_GRANT', 'PROGRAM_LEADER_REVOKE')"
    )
    .first<{ n: number }>();
  return row?.n ?? 0;
}

function getStoreFor(db: D1Database) {
  return new D1WorkspaceStore(db);
}

describe("PRG-04: program leaders", () => {
  let adminAccess = "";
  let memberAccess = "";
  let carolAccess = "";
  let leaderDeptId = "";
  let leaderProgramId = "";
  let otherProgramId = "";

  beforeAll(async () => {
    adminAccess = await accessCookieFor("alice", "alice-secret");
    memberAccess = await accessCookieFor("bob", "bob-secret");
    carolAccess = await accessCookieFor("carol", "carol-secret");
    const dept = await createDepartment(adminAccess, {
      code: "PRG-04",
      name: "Leader Test Department",
    });
    leaderDeptId = dept.department_id;
    const program = await createProgram(adminAccess, leaderDeptId, {
      name: "Leader Test Program",
      behavior_type: "Recurring",
      discoverability: "Listed",
    });
    leaderProgramId = program.program_id;
    const other = await createProgram(adminAccess, leaderDeptId, {
      name: "Leader Other Program",
      behavior_type: "Recurring",
      discoverability: "Listed",
    });
    otherProgramId = other.program_id;
  });

  test("AUTH-1 leader.assign capability is Admin/Staff only", async () => {
    const rows = await testDb()
      .prepare(
        "SELECT role FROM role_capabilities WHERE capability = 'program.leader.assign'"
      )
      .all<{ role: string }>();
    const roles = new Set((rows.results ?? []).map((r) => r.role));
    assert.ok(roles.has("Admin"), "Admin must hold leader.assign");
    assert.ok(roles.has("Staff"), "Staff must hold leader.assign");
    assert.ok(!roles.has("Member"), "Member must not hold leader.assign");
  });

  test("DLG-1 staff assigns an active leader with grant audit", async () => {
    const res = await assignLeader(adminAccess, leaderProgramId, "U002");
    assert.strictEqual(res.status, 200);
    const body = (await assertCorrelated(res)) as {
      data: { leader: { user_id: string; revoked_at: string | null } };
    };
    assert.strictEqual(body.data.leader.user_id, "U002");
    assert.strictEqual(body.data.leader.revoked_at, null);

    const audit = await testDb()
      .prepare(
        `SELECT actor_user_id, entity_id, new_value_json, correlation_id
         FROM audit_events WHERE action = 'PROGRAM_LEADER_GRANT'
         ORDER BY inserted_at DESC LIMIT 1`
      )
      .first<{
        actor_user_id: string;
        entity_id: string;
        new_value_json: string;
        correlation_id: string;
      }>();
    assert.ok(audit, "grant audit row must exist");
    assert.strictEqual(audit.actor_user_id, "U001");
    assert.strictEqual(audit.entity_id, leaderProgramId);
    assert.ok(audit.correlation_id, "correlation id must be present");
    const value = JSON.parse(audit.new_value_json) as { user_id?: string };
    assert.strictEqual(value.user_id, "U002");
  });

  test("DLG-2 re-assigning an active pair is idempotent (one active row)", async () => {
    const res = await assignLeader(adminAccess, leaderProgramId, "U002");
    assert.strictEqual(res.status, 200);
    const leaders = await listLeadersFor(adminAccess, leaderProgramId);
    const active = leaders.filter((l) => l.user_id === "U002");
    assert.strictEqual(active.length, 1, "exactly one active U002 row");
    const dupAudit = await testDb()
      .prepare(
        `SELECT outcome FROM audit_events
         WHERE action = 'PROGRAM_LEADER_GRANT' AND outcome = 'DUPLICATE'
         ORDER BY inserted_at DESC LIMIT 1`
      )
      .first<{ outcome: string }>();
    assert.ok(dupAudit, "duplicate grant must be audited as DUPLICATE");
  });

  test("DLG-3 partial unique index forbids duplicate active pairs", async () => {
    await assert.rejects(
      testDb()
        .prepare(
          `INSERT INTO program_leaders (program_id, user_id, granted_by, granted_at)
           VALUES (?, ?, 'U001', '2026-08-06T00:00:00Z')`
        )
        .bind(leaderProgramId, "U002")
        .run(),
      /UNIQUE constraint failed/u
    );
  });

  test("DLG-4 revoke then re-assign reactivates the pair", async () => {
    const revoke = await revokeLeader(adminAccess, leaderProgramId, "U002");
    assert.strictEqual(revoke.status, 200);
    const revokedBody = (await assertCorrelated(revoke)) as {
      data: { leader: { revoked_at: string | null } };
    };
    assert.ok(revokedBody.data.leader.revoked_at, "revoked_at must be set");

    const reAssign = await assignLeader(adminAccess, leaderProgramId, "U002");
    assert.strictEqual(reAssign.status, 200);
    const body = (await assertCorrelated(reAssign)) as {
      data: { leader: { revoked_at: string | null } };
    };
    assert.strictEqual(body.data.leader.revoked_at, null);
    const history = await testDb()
      .prepare(
        `SELECT user_id FROM program_leaders WHERE program_id = ? AND user_id = 'U002'`
      )
      .bind(leaderProgramId)
      .all();
    assert.strictEqual(
      (history.results ?? []).length,
      1,
      "single persisted row"
    );
  });

  test("DLG-5 unknown target user is rejected with no audit", async () => {
    const before = await countLeaderAudits();
    const res = await assignLeader(adminAccess, leaderProgramId, "ghost-user");
    assert.strictEqual(res.status, 422);
    const after = await countLeaderAudits();
    assert.strictEqual(after, before, "no grant audit for unknown target");
    const rows = await testDb()
      .prepare("SELECT 1 FROM program_leaders WHERE user_id = 'ghost-user'")
      .all();
    assert.strictEqual((rows.results ?? []).length, 0);
  });

  test("DLG-4b revoke-on-revoked is a quiet 200 with a DUPLICATE audit row", async () => {
    const revoke = await revokeLeader(adminAccess, leaderProgramId, "U002");
    assert.strictEqual(revoke.status, 200);
    const again = await revokeLeader(adminAccess, leaderProgramId, "U002");
    assert.strictEqual(again.status, 200);
    const body = (await assertCorrelated(again)) as {
      data: { leader: { revoked_at: string | null } };
    };
    assert.ok(body.data.leader.revoked_at, "row stays revoked");
    const audit = await testDb()
      .prepare(
        `SELECT outcome FROM audit_events
         WHERE action = 'PROGRAM_LEADER_REVOKE' AND outcome = 'DUPLICATE'
           AND entity_id = ?`
      )
      .bind(leaderProgramId)
      .first<{ outcome: string }>();
    assert.ok(audit, "revoke-revoked must write a DUPLICATE audit row");
  });

  test("DLG-1b Pending target account is rejected with 422 and a DENIED audit row", async () => {
    const res = await assignLeader(adminAccess, leaderProgramId, "U004");
    assert.strictEqual(res.status, 422);
    const inactiveBody = await problemOf(res);
    assert.strictEqual(inactiveBody.code, "ACCOUNT_INACTIVE");
    const rows = await testDb()
      .prepare("SELECT 1 FROM program_leaders WHERE user_id = 'U004'")
      .all();
    assert.strictEqual((rows.results ?? []).length, 0);
    const audit = await testDb()
      .prepare(
        `SELECT outcome FROM audit_events
         WHERE action = 'PROGRAM_LEADER_GRANT' AND outcome = 'DENIED'
           AND entity_id = ?`
      )
      .bind(leaderProgramId)
      .first<{ outcome: string }>();
    assert.ok(audit, "inactive target must write a DENIED grant audit row");
  });

  test("DLG-6 unknown program does not leak existence (403)", async () => {
    const res = await assignLeader(adminAccess, "no-such-program", "U002");
    assert.strictEqual(res.status, 403);
  });

  test("DLG-7 member cannot assign leaders", async () => {
    const res = await assignLeader(memberAccess, leaderProgramId, "U003");
    assert.strictEqual(res.status, 403);
    const rows = await testDb()
      .prepare(
        "SELECT 1 FROM program_leaders WHERE program_id = ? AND user_id = 'U003'"
      )
      .bind(leaderProgramId)
      .all();
    assert.strictEqual((rows.results ?? []).length, 0);
  });

  test("DLG-8 scoped program leader cannot assign (leadership never implies delegation)", async () => {
    const grant = await assignLeader(adminAccess, leaderProgramId, "U003");
    assert.strictEqual(grant.status, 200);
    const res = await assignLeader(carolAccess, leaderProgramId, "U002");
    assert.strictEqual(res.status, 403, "leader must not hold leader.assign");
  });

  test("DLG-9 caller cannot self-grant", async () => {
    const res = await assignLeader(adminAccess, leaderProgramId, "U001");
    assert.strictEqual(res.status, 403);
  });

  test("DLG-10 leader of A cannot delegate into B", async () => {
    const res = await assignLeader(carolAccess, otherProgramId, "U002");
    assert.strictEqual(res.status, 403);
  });

  test("DLG-11 revoke removes operational grants (leader loses manage)", async () => {
    const grant = await assignLeader(adminAccess, leaderProgramId, "U003");
    assert.strictEqual(grant.status, 200);
    const revoke = await revokeLeader(adminAccess, leaderProgramId, "U003");
    assert.strictEqual(revoke.status, 200);
    const audit = await testDb()
      .prepare(
        `SELECT actor_user_id, new_value_json, correlation_id
         FROM audit_events WHERE action = 'PROGRAM_LEADER_REVOKE'
         ORDER BY inserted_at DESC LIMIT 1`
      )
      .first<{
        actor_user_id: string;
        new_value_json: string;
        correlation_id: string;
      }>();
    assert.ok(audit, "revoke audit row must exist");
    assert.strictEqual(audit.actor_user_id, "U001");
    const value = JSON.parse(audit.new_value_json) as {
      user_id?: string;
      revoked_at?: string;
    };
    assert.strictEqual(value.user_id, "U003");
    assert.ok(value.revoked_at, "revoked_at must be audited");

    const rule = await worker.fetch(
      programsRequest(`/api/v1/programs/${leaderProgramId}/schedule-rules`, {
        method: "POST",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${carolAccess}`,
          "Content-Type": "application/json",
        },
        body: {
          recurrence: "WEEKLY",
          day_of_week: 2,
          month_day: null,
          start_time: "19:30",
          end_time: "21:00",
        },
      }),
      testEnv()
    );
    assert.strictEqual(rule.status, 403, "revoked leader must lose manage");
  });

  test("DLG-12 revoking a user who was never a leader is 404 with a DENIED audit row", async () => {
    const res = await revokeLeader(adminAccess, leaderProgramId, "U001");
    assert.strictEqual(res.status, 404);
    const audit = await testDb()
      .prepare(
        `SELECT outcome FROM audit_events
         WHERE action = 'PROGRAM_LEADER_REVOKE' AND outcome = 'DENIED'
           AND entity_id = ?`
      )
      .bind(leaderProgramId)
      .first<{ outcome: string }>();
    assert.ok(
      audit,
      "revoke of a never-assigned leader must write a DENIED audit row (ADR-0027)"
    );
  });

  test("DLG-13 revoking an already-revoked pair is a quiet 200 that audits DUPLICATE", async () => {
    const grant = await assignLeader(adminAccess, leaderProgramId, "U003");
    assert.strictEqual(grant.status, 200);
    const first = await revokeLeader(adminAccess, leaderProgramId, "U003");
    assert.strictEqual(first.status, 200);
    const second = await revokeLeader(adminAccess, leaderProgramId, "U003");
    assert.strictEqual(second.status, 200);
    const body = (await assertCorrelated(second)) as {
      data: { leader: { revoked_at: string | null } };
    };
    assert.ok(body.data.leader.revoked_at, "row stays revoked");
    const dup = await testDb()
      .prepare(
        `SELECT outcome FROM audit_events
         WHERE action = 'PROGRAM_LEADER_REVOKE' AND outcome = 'DUPLICATE'
           AND entity_id = ?`
      )
      .bind(leaderProgramId)
      .first<{ outcome: string }>();
    assert.ok(dup, "revoke-revoked writes a DUPLICATE audit row (ADR-0027)");
  });

  test("DLG-14 member and scoped leader cannot revoke", async () => {
    const grant = await assignLeader(adminAccess, leaderProgramId, "U003");
    assert.strictEqual(grant.status, 200);
    const byMember = await revokeLeader(memberAccess, leaderProgramId, "U003");
    assert.strictEqual(byMember.status, 403);
    const byLeader = await revokeLeader(carolAccess, leaderProgramId, "U002");
    assert.strictEqual(byLeader.status, 403);
  });

  test("DLG-15 revocation persists and audit rows are immutable", async () => {
    const audit = await testDb()
      .prepare(
        `SELECT audit_id FROM audit_events WHERE action = 'PROGRAM_LEADER_REVOKE'
         ORDER BY inserted_at DESC LIMIT 1`
      )
      .first<{ audit_id: string }>();
    assert.ok(audit, "revoke audit row must exist");
    await assert.rejects(
      testDb()
        .prepare("DELETE FROM audit_events WHERE audit_id = ?")
        .bind(audit.audit_id)
        .run(),
      /audit_events is immutable/u
    );
  });

  test("DLG-16 list returns active leaders only", async () => {
    const leaders = await listLeadersFor(adminAccess, leaderProgramId);
    for (const leader of leaders) {
      assert.strictEqual(leader.revoked_at, null);
    }
  });

  test("DLG-17 scoped leader can view their own program's leaders", async () => {
    const grant = await assignLeader(adminAccess, leaderProgramId, "U003");
    assert.strictEqual(grant.status, 200);
    const leaders = await listLeadersFor(carolAccess, leaderProgramId);
    assert.ok(leaders.length > 0);
  });

  test("scoped leader sees their own Unlisted Program with projected capabilities", async () => {
    const own = await createProgram(adminAccess, leaderDeptId, {
      name: "Leader Unlisted Program",
      behavior_type: "Recurring",
      discoverability: "Unlisted",
    });
    const other = await createProgram(adminAccess, leaderDeptId, {
      name: "Other Unlisted Program",
      behavior_type: "Recurring",
      discoverability: "Unlisted",
    });
    const grant = await assignLeader(adminAccess, own.program_id, "U003");
    assert.strictEqual(grant.status, 200);
    const res = await worker.fetch(
      programsRequest(`/api/v1/programs/departments/${leaderDeptId}/programs`, {
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${carolAccess}`,
        },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    const body = (await assertCorrelated(res)) as {
      data: {
        programs: {
          program_id: string;
          name: string;
          capabilities: { manage: boolean; publish: boolean };
        }[];
      };
    };
    const names = body.data.programs.map((program) => program.name);
    assert.ok(names.includes(own.name));
    assert.ok(!names.includes(other.name));
    const ownView = body.data.programs.find(
      (program) => program.program_id === own.program_id
    );
    assert.ok(ownView?.capabilities.manage);
    assert.ok(ownView?.capabilities.publish);
  });

  test("DLG-18 member and cross-program leader are denied listing (404 masks)", async () => {
    const undo = await revokeLeader(adminAccess, leaderProgramId, "U002");
    assert.strictEqual(
      undo.status,
      200,
      "teardown: U002 must not remain a leader"
    );
    const byMember = await worker.fetch(
      programsRequest(`/api/v1/programs/${leaderProgramId}/leaders`, {
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${memberAccess}`,
        },
      }),
      testEnv()
    );
    assert.strictEqual(byMember.status, 404);
    const byCrossLeader = await worker.fetch(
      programsRequest(`/api/v1/programs/${otherProgramId}/leaders`, {
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${carolAccess}`,
        },
      }),
      testEnv()
    );
    assert.strictEqual(byCrossLeader.status, 404);
  });

  test("AUTH-2 leadership grants operational but never delegation capability", async () => {
    const grant = await assignLeader(adminAccess, leaderProgramId, "U003");
    assert.strictEqual(grant.status, 200);
    const can = await new D1CapabilityAuthorizer(getStoreFor(testDb())).can(
      { actorUserId: "U003", actorRole: "Member" },
      "program.leader.assign" as never,
      { programId: leaderProgramId }
    );
    assert.strictEqual(can, false, "leadership must not imply delegation");
  });

  test("AUTH-3 leader remains operational on their own program", async () => {
    const grant = await assignLeader(adminAccess, leaderProgramId, "U003");
    assert.strictEqual(grant.status, 200);
    const rule = await worker.fetch(
      programsRequest(`/api/v1/programs/${leaderProgramId}/schedule-rules`, {
        method: "POST",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${carolAccess}`,
          "Content-Type": "application/json",
        },
        body: {
          recurrence: "WEEKLY",
          day_of_week: 2,
          month_day: null,
          start_time: "19:30",
          end_time: "21:00",
        },
      }),
      testEnv()
    );
    assert.strictEqual(rule.status, 201, "leader must manage own program");
  });

  test("DLG-19 concurrent grants of a brand-new pair yield one SUCCESS and one CONFLICT", async () => {
    const staffAccess = await accessCookieFor("staff", "staff-secret");
    const fresh = await createProgram(adminAccess, leaderDeptId, {
      name: "Leader Race Program",
      behavior_type: "Recurring",
      discoverability: "Listed",
    });
    const results = await Promise.all([
      assignLeader(adminAccess, fresh.program_id, "U003"),
      assignLeader(staffAccess, fresh.program_id, "U003"),
    ]);
    const statuses = results.map((result) => result.status).sort();
    assert.deepStrictEqual(
      statuses,
      [200, 409],
      "one concurrent grant wins, the other conflicts"
    );
    const active = await testDb()
      .prepare(
        `SELECT user_id FROM program_leaders
         WHERE program_id = ? AND revoked_at IS NULL`
      )
      .bind(fresh.program_id)
      .all<{ user_id: string }>();
    assert.deepStrictEqual(
      (active.results ?? []).map(({ user_id }) => user_id),
      ["U003"],
      "exactly one active leader row"
    );
    const outcomes = await testDb()
      .prepare(
        `SELECT DISTINCT outcome FROM audit_events
         WHERE action = 'PROGRAM_LEADER_GRANT' AND entity_id = ?`
      )
      .bind(fresh.program_id)
      .all<{ outcome: string }>();
    const seen = new Set(
      (outcomes.results ?? []).map(({ outcome }) => outcome)
    );
    assert.ok(seen.has("SUCCESS"), "winner audited SUCCESS");
    assert.ok(seen.has("CONFLICT"), "loser audited CONFLICT");
  });

  test("AUD-2 no credential material enters leader audit records", async () => {
    const rows = await testDb()
      .prepare(
        `SELECT old_value_json, new_value_json FROM audit_events
         WHERE action IN ('PROGRAM_LEADER_GRANT', 'PROGRAM_LEADER_REVOKE')`
      )
      .all<{ old_value_json: string | null; new_value_json: string | null }>();
    for (const row of rows.results ?? []) {
      for (const json of [row.old_value_json, row.new_value_json]) {
        if (json === null) {
          continue;
        }
        const text = JSON.stringify(JSON.parse(json));
        assert.ok(
          !/password|credential_hash|legacy_pin_hash|access_token|session_token/iu.test(
            text
          ),
          "no credential material in audit JSON"
        );
      }
    }
  });
});

describe("PUI-02: participant catalog", () => {
  const catalogRequest = (access: string) =>
    worker.fetch(
      programsRequest("/api/v1/programs/catalog", {
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${access}`,
        },
      }),
      testEnv()
    );

  interface CatalogEntry {
    department: { department_id: string };
    programs: {
      program_id: string;
      name: string;
      lifecycle: string;
      discoverability: string;
    }[];
  }

  const catalogOf = async (
    access: string
  ): Promise<{ data: { catalog: CatalogEntry[] } }> => {
    const res = await catalogRequest(access);
    assert.strictEqual(res.status, 200);
    return (await assertCorrelated(res)) as {
      data: { catalog: CatalogEntry[] };
    };
  };

  test("requires a cookie-authenticated session", async () => {
    const res = await worker.fetch(
      programsRequest("/api/v1/programs/catalog", {
        headers: { Origin: HOST },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 401);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "AUTH_REQUIRED");
  });

  test("member sees Listed rows across lifecycles as status, never Unlisted; no check-in secrets or DTO breadth", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const dept = await createDepartment(adminAccess, {
      code: "PUI-02-LISTED",
      name: "PUI-02 Listed Dept",
    });
    await createProgram(adminAccess, dept.department_id, {
      name: "PUI-02 Draft Listed",
      behavior_type: "Recurring",
      discoverability: "Listed",
    });
    await createProgram(adminAccess, dept.department_id, {
      name: "PUI-02 Active Listed",
      behavior_type: "Recurring",
      lifecycle: "Active",
      discoverability: "Listed",
    });
    const archived = await createProgram(adminAccess, dept.department_id, {
      name: "PUI-02 Archived Listed",
      behavior_type: "Recurring",
      discoverability: "Listed",
    });
    const promote = await worker.fetch(
      programsRequest(`/api/v1/programs/${archived.program_id}`, {
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
    assert.strictEqual(promote.status, 200);
    const archive = await worker.fetch(
      programsRequest(`/api/v1/programs/${archived.program_id}`, {
        method: "PATCH",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: { lifecycle: "Archived" },
      }),
      testEnv()
    );
    assert.strictEqual(archive.status, 200);
    await createProgram(adminAccess, dept.department_id, {
      name: "PUI-02 Unlisted Hidden",
      behavior_type: "Recurring",
      discoverability: "Unlisted",
    });

    const memberAccess = await accessCookieFor("bob", "bob-secret");
    const body = await catalogOf(memberAccess);
    const entry = body.data.catalog.find(
      (candidate) => candidate.department.department_id === dept.department_id
    );
    assert.ok(entry, "department with visible Programs must appear");
    const names = entry.programs.map((program) => program.name);
    assert.ok(names.includes("PUI-02 Draft Listed"));
    assert.ok(names.includes("PUI-02 Active Listed"));
    assert.ok(names.includes("PUI-02 Archived Listed"));
    assert.ok(!names.includes("PUI-02 Unlisted Hidden"));
    const byName = new Map(
      entry.programs.map((program) => [program.name, program.lifecycle])
    );
    assert.strictEqual(byName.get("PUI-02 Draft Listed"), "Draft");
    assert.strictEqual(byName.get("PUI-02 Active Listed"), "Active");
    assert.strictEqual(byName.get("PUI-02 Archived Listed"), "Archived");
    const raw = JSON.stringify(body.data);
    assert.ok(
      !raw.includes("check_in_token"),
      "check-in token must be stripped"
    );
    assert.ok(
      !raw.includes("check_in_opens_at_minutes_before_start"),
      "check-in window secret must be stripped"
    );
    assert.ok(
      !raw.includes("check_in_closes_at_minutes_after_end"),
      "check-in window secret must be stripped"
    );
    assert.ok(
      !raw.includes("capabilities"),
      "capability DTO breadth must be stripped"
    );
  });

  test("Unlisted rows appear only through scoped program.manage effective access", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const dept = await createDepartment(adminAccess, {
      code: "PUI-02-UNLISTED",
      name: "PUI-02 Unlisted Dept",
    });
    await createProgram(adminAccess, dept.department_id, {
      name: "PUI-02 Listed",
      behavior_type: "Recurring",
      lifecycle: "Active",
      discoverability: "Listed",
    });
    const unlisted = await createProgram(adminAccess, dept.department_id, {
      name: "PUI-02 Unlisted",
      behavior_type: "Recurring",
      discoverability: "Unlisted",
    });

    const memberAccess = await accessCookieFor("bob", "bob-secret");
    const memberBody = await catalogOf(memberAccess);
    const memberEntry = memberBody.data.catalog.find(
      (candidate) => candidate.department.department_id === dept.department_id
    );
    assert.ok(
      memberEntry,
      "department with a visible Listed Program must appear"
    );
    const memberNames = memberEntry.programs.map((program) => program.name);
    assert.ok(memberNames.includes("PUI-02 Listed"));
    assert.ok(!memberNames.includes("PUI-02 Unlisted"));

    const grant = await assignLeader(adminAccess, unlisted.program_id, "U002");
    assert.strictEqual(grant.status, 200);
    const leaderBody = await catalogOf(memberAccess);
    const leaderEntry = leaderBody.data.catalog.find(
      (candidate) => candidate.department.department_id === dept.department_id
    );
    assert.ok(
      leaderEntry,
      "department must remain visible for the scoped leader"
    );
    const leaderNames = leaderEntry.programs.map((program) => program.name);
    assert.ok(
      leaderNames.includes("PUI-02 Unlisted"),
      "scoped program.manage must expose the Unlisted row"
    );
    assert.ok(leaderNames.includes("PUI-02 Listed"));
  });

  test("module-disabled Departments are excluded from the catalog", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const dept = await createDepartment(adminAccess, {
      code: "PUI-02-DISABLED",
      name: "PUI-02 Disabled Dept",
    });
    await createProgram(adminAccess, dept.department_id, {
      name: "PUI-02 Disabled Program",
      behavior_type: "Recurring",
      discoverability: "Listed",
    });
    const disable = await worker.fetch(
      programsRequest(
        `/api/v1/programs/departments/${dept.department_id}/modules/program_catalog/disable`,
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
    assert.strictEqual(disable.status, 200);

    const memberAccess = await accessCookieFor("bob", "bob-secret");
    const body = await catalogOf(memberAccess);
    assert.ok(
      !body.data.catalog.some(
        (candidate) => candidate.department.department_id === dept.department_id
      ),
      "module-disabled Department must be omitted"
    );
  });
});
describe("PUI-03: participant Program detail", () => {
  interface ParticipantDetailResponse {
    data: {
      detail: {
        program: {
          program_id: string;
          name: string;
          behavior_type: string;
          lifecycle: string;
          enrollment_mode: string;
          check_in_token?: string;
          capabilities?: unknown;
        };
        department: { name: string };
        schedule_rules: {
          recurrence: string;
          start_time: string;
          end_time: string;
        }[];
        events: {
          event_id: string;
          starts_at: string;
          ends_at: string;
          status: string;
          source: string;
          manual_check_in_code?: unknown;
          check_in_window_opens_at?: unknown;
          check_in_window_closes_at?: unknown;
        }[];
        enrollment: {
          requests: {
            request_id: string;
            status: string;
            submitted_at: string;
            decided_at: string | null;
          }[];
          enrollments: {
            enrollment_id: string;
            status: string;
            enrolled_at: string;
            cancelled_at: string | null;
          }[];
        } | null;
        enrollment_access: string;
      };
    };
  }

  const detailOf = async (
    access: string,
    programId: string
  ): Promise<ParticipantDetailResponse> => {
    const res = await worker.fetch(
      programsRequest(`/api/v1/programs/${programId}/participant-detail`, {
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${access}`,
        },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    return (await assertCorrelated(res)) as ParticipantDetailResponse;
  };

  test("requires a cookie-authenticated session", async () => {
    const res = await worker.fetch(
      programsRequest("/api/v1/programs/program-missing/participant-detail", {
        headers: { Origin: HOST },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 401);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "AUTH_REQUIRED");
  });

  test("returns narrow participant detail with recurring schedule and active events", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const dept = await createDepartment(adminAccess, {
      code: "PUI-03-DETAIL",
      name: "PUI-03 Detail Dept",
    });
    const created = await createProgram(adminAccess, dept.department_id, {
      name: "PUI-03 Detail Program",
      behavior_type: "Recurring",
      lifecycle: "Active",
      discoverability: "Listed",
      enrollment_mode: "MemberRequest",
    });
    await createRule(adminAccess, created.program_id, {
      recurrence: "WEEKLY",
      day_of_week: 3,
      start_time: "19:30",
      end_time: "21:00",
    });
    const event = await worker.fetch(
      programsRequest(`/api/v1/programs/${created.program_id}/events`, {
        method: "POST",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: {
          starts_at: "2099-03-04T11:30:00.000Z",
          ends_at: "2099-03-04T13:00:00.000Z",
        },
      }),
      testEnv()
    );
    assert.strictEqual(event.status, 201);

    const memberAccess = await accessCookieFor("bob", "bob-secret");
    const body = await detailOf(memberAccess, created.program_id);
    const { detail } = body.data;
    assert.strictEqual(detail.program.name, "PUI-03 Detail Program");
    assert.strictEqual(detail.program.behavior_type, "Recurring");
    assert.strictEqual(detail.program.lifecycle, "Active");
    assert.strictEqual(detail.program.enrollment_mode, "MemberRequest");
    assert.strictEqual(detail.department.name, "PUI-03 Detail Dept");
    assert.strictEqual(detail.enrollment_access, "Eligible");
    assert.strictEqual(detail.schedule_rules[0]?.start_time, "19:30");
    assert.strictEqual(detail.events.length, 1);
    assert.strictEqual(detail.events[0]?.status, "Active");
    const raw = JSON.stringify(detail);
    assert.ok(!raw.includes("check_in_token"));
    assert.ok(!raw.includes("manual_check_in_code"));
    assert.ok(!raw.includes("capabilities"));
  });

  test("keeps multiple active events for a OneOff participant detail", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const dept = await createDepartment(adminAccess, {
      code: "PUI-03-ONEOFF",
      name: "PUI-03 OneOff Dept",
    });
    const created = await createProgram(adminAccess, dept.department_id, {
      name: "PUI-03 OneOff Program",
      behavior_type: "OneOff",
      lifecycle: "Active",
      discoverability: "Listed",
      enrollment_mode: "ManagerOnly",
    });
    for (const [starts_at, ends_at] of [
      ["2099-04-01T10:00:00.000Z", "2099-04-01T11:00:00.000Z"],
      ["2099-04-08T10:00:00.000Z", "2099-04-08T11:00:00.000Z"],
    ]) {
      const event = await worker.fetch(
        programsRequest(`/api/v1/programs/${created.program_id}/events`, {
          method: "POST",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
            "Content-Type": "application/json",
          },
          body: { starts_at, ends_at },
        }),
        testEnv()
      );
      assert.strictEqual(event.status, 201);
    }

    const memberAccess = await accessCookieFor("bob", "bob-secret");
    const body = await detailOf(memberAccess, created.program_id);
    assert.strictEqual(body.data.detail.program.behavior_type, "OneOff");
    assert.strictEqual(body.data.detail.events.length, 2);
    assert.ok(
      body.data.detail.events.every((event) => event.status === "Active")
    );
  });

  test("keeps hidden Program existence private", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const dept = await createDepartment(adminAccess, {
      code: "PUI-03-HIDDEN",
      name: "PUI-03 Hidden Dept",
    });
    const hidden = await createProgram(adminAccess, dept.department_id, {
      name: "PUI-03 Hidden Program",
      behavior_type: "OneOff",
      lifecycle: "Draft",
      discoverability: "Unlisted",
    });
    const memberAccess = await accessCookieFor("bob", "bob-secret");
    const res = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${hidden.program_id}/participant-detail`,
        {
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${memberAccess}`,
          },
        }
      ),
      testEnv()
    );
    assert.strictEqual(res.status, 404);
    const body = await problemOf(res);
    assert.strictEqual(body.code, "NOT_FOUND");
    assert.ok(!JSON.stringify(body).includes("PUI-03 Hidden Program"));
  });
});

describe("PUI-04: participant Enrollment lifecycle", () => {
  interface ParticipantEnrollmentDetailResponse {
    data: {
      detail: {
        enrollment: {
          requests: {
            request_id: string;
            status: string;
            submitted_at: string;
            decided_at: string | null;
          }[];
          enrollments: {
            enrollment_id: string;
            status: string;
            enrolled_at: string;
            cancelled_at: string | null;
          }[];
        } | null;
        enrollment_access: string;
      };
    };
  }

  const detailWithEnrollment = async (
    access: string,
    programId: string
  ): Promise<ParticipantEnrollmentDetailResponse> => {
    const res = await worker.fetch(
      programsRequest(`/api/v1/programs/${programId}/participant-detail`, {
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${access}`,
        },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    return (await assertCorrelated(res)) as ParticipantEnrollmentDetailResponse;
  };

  test("projects actor state and guards concurrent Pending requests", async () => {
    const adminAccess = await accessCookieFor("alice", "alice-secret");
    const dept = await createDepartment(adminAccess, {
      code: "PUI-04-REQUEST",
      name: "PUI-04 Request Dept",
    });
    const created = await createProgram(adminAccess, dept.department_id, {
      name: "PUI-04 Request Program",
      behavior_type: "Recurring",
      lifecycle: "Active",
      discoverability: "Listed",
      enrollment_mode: "MemberRequest",
    });
    const memberAccess = await accessCookieFor("bob", "bob-secret");
    const before = await detailWithEnrollment(memberAccess, created.program_id);
    assert.deepStrictEqual(before.data.detail.enrollment, {
      requests: [],
      enrollments: [],
    });

    const responses = await Promise.all(
      [0, 1].map(() =>
        worker.fetch(
          programsRequest(
            `/api/v1/programs/${created.program_id}/enrollment-requests`,
            {
              method: "POST",
              headers: {
                Origin: HOST,
                Cookie: `${ACCESS_COOKIE_NAME}=${memberAccess}`,
                "Content-Type": "application/json",
                "Idempotency-Key": crypto.randomUUID(),
              },
              body: {},
            }
          ),
          testEnv()
        )
      )
    );
    assert.deepStrictEqual(
      responses.map((response) => response.status).sort((a, b) => a - b),
      [201, 409]
    );

    const duplicate = responses.find((response) => response.status === 409);
    assert.ok(duplicate, "one concurrent request must be rejected");
    const duplicateBody = await problemOf(duplicate);
    assert.strictEqual(duplicateBody.code, "ENROLLMENT_DUPLICATE");
    assert.ok(duplicateBody.requestId);
    assert.strictEqual(
      duplicateBody.requestId,
      duplicate.headers.get("X-Request-Id")
    );
    const list = await worker.fetch(
      programsRequest(
        `/api/v1/programs/${created.program_id}/enrollment-requests`,
        {
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${memberAccess}`,
          },
        }
      ),
      testEnv()
    );
    assert.strictEqual(list.status, 200);
    const listBody = (await assertCorrelated(list)) as {
      data: {
        requests: {
          request_id: string;
          status: string;
          submitted_at: string;
          decided_at: string | null;
        }[];
      };
    };
    assert.strictEqual(listBody.data.requests.length, 1);
    assert.strictEqual(listBody.data.requests[0]?.status, "Pending");

    const after = await detailWithEnrollment(memberAccess, created.program_id);
    const pending = after.data.detail.enrollment?.requests[0];
    assert.ok(pending);
    assert.strictEqual(pending.status, "Pending");
    assert.strictEqual(after.data.detail.enrollment?.requests.length, 1);
    assert.strictEqual(after.data.detail.enrollment?.enrollments.length, 0);
    assert.ok(!JSON.stringify(after.data.detail).includes("member_user_id"));

    const requestId = listBody.data.requests[0]?.request_id;
    assert.ok(requestId);
    const decision = await decideRequest(
      adminAccess,
      created.program_id,
      requestId,
      "Approved"
    );
    assert.strictEqual(decision.status, 200);
    const approved = await detailWithEnrollment(
      memberAccess,
      created.program_id
    );
    assert.strictEqual(approved.data.detail.enrollment_access, "Eligible");
    assert.strictEqual(
      approved.data.detail.enrollment?.requests[0]?.status,
      "Approved"
    );
    assert.strictEqual(
      approved.data.detail.enrollment?.enrollments[0]?.status,
      "Active"
    );
    assert.ok(!JSON.stringify(approved.data.detail).includes("member_user_id"));
  });
});
