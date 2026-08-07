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
    behavior_type: "Recurring" | "OneOff";
    lifecycle?: "Draft" | "Active" | "Archived";
    discoverability?: "Listed" | "Unlisted";
    enrollment_mode?: "MemberRequest" | "ManagerOnly";
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
      body: {
        ...body,
        lifecycle: body.lifecycle ?? "Draft",
        discoverability: body.discoverability ?? "Unlisted",
        enrollment_mode: body.enrollment_mode ?? "MemberRequest",
      },
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
    ["U004", "Dana Pending", "dana", "9999", "Member", "Pending"],
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
        body: { code: "STRICT-DEPT-1", name: "Strict Dept", lifecycle: "Published" },
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
      events: {
        event_id: string;
        starts_at: string;
        status: string;
        source: string;
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
      assert.strictEqual(
        event.starts_at,
        `${expectedDates[index]}T11:30:00.000Z`
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
      .bind(
        crypto.randomUUID(),
        programId,
        otherRequestId,
        now,
        "U002",
        now
      )
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
    const programId = (await createProgram(adminAccess, deptId, {
      name: "Decide Repeat Program",
      behavior_type: "Recurring",
      discoverability: "Listed",
      enrollment_mode: "MemberRequest",
    })).program_id;
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
    assert.strictEqual(row?.status, "Approved", "request state must not change");
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
    const programId = (await createProgram(adminAccess, deptId, {
      name: "Withdraw Repeat Program",
      behavior_type: "Recurring",
      discoverability: "Listed",
      enrollment_mode: "MemberRequest",
    })).program_id;
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
    const programId = (await createProgram(adminAccess, deptId, {
      name: "Cancel Repeat Program",
      behavior_type: "Recurring",
      discoverability: "Listed",
    })).program_id;
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
      programsRequest(`/api/v1/programs/${programId}/events/${event.event_id}`, {
        method: "PATCH",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: { reason: "repeat-cancel" },
      }),
      testEnv()
    );
    assert.strictEqual(first.status, 200);
    const again = await worker.fetch(
      programsRequest(`/api/v1/programs/${programId}/events/${event.event_id}`, {
        method: "PATCH",
        headers: {
          Origin: HOST,
          Cookie: `${ACCESS_COOKIE_NAME}=${adminAccess}`,
          "Content-Type": "application/json",
        },
        body: { reason: "repeat-cancel" },
      }),
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
    const programId = (await createProgram(adminAccess, deptId, {
      name: "Enrollment Cancel Repeat Program",
      behavior_type: "Recurring",
      discoverability: "Listed",
      enrollment_mode: "MemberRequest",
    })).program_id;
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

  test("DLG-1b Pending target account is rejected with 422 and a FAILED audit row", async () => {
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
         WHERE action = 'PROGRAM_LEADER_GRANT' AND outcome = 'FAILED'
           AND entity_id = ?`
      )
      .bind(leaderProgramId)
      .first<{ outcome: string }>();
    assert.ok(audit, "inactive target must write a FAILED grant audit row");
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

  test("DLG-12 revoking a user who was never a leader is 404", async () => {
    const res = await revokeLeader(adminAccess, leaderProgramId, "U001");
    assert.strictEqual(res.status, 404);
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
