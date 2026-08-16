/** AUTH-01 #255 — Department Manager scoped authority contract. */
import assert from "node:assert/strict";

import { env } from "cloudflare:workers";
import { beforeAll, describe, test } from "vitest";

import worker from "../../worker";
import type { Env } from "../../worker";
import { importLegacyUsers } from "../auth/accounts";
import { ACCESS_COOKIE_NAME } from "../auth/cookies";
import { applyMigrations, testDb } from "../auth/test-bootstrap";
import { completeCredentialUpgrade } from "../auth/upgrade";
import { CAPABILITY } from "./capabilities";
import { D1CapabilityAuthorizer } from "./capability-authorizer";
import { D1WorkspaceStore } from "./d1-workspace-store";
import { DepartmentWorkspace } from "./department-workspace";

const SECRET = "test-access-token-secret";
const HOST = "https://efcc.example";
const HEADER = [
  "User_ID",
  "Name",
  "Username",
  "PIN_Code",
  "System_Role",
  "Status",
];

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...(env as unknown as Env),
    EFCC_ACCESS_TOKEN_SECRET: SECRET,
    ...overrides,
  };
}

function request(
  path: string,
  access: string,
  init: { method?: string; body?: unknown } = {}
): Request {
  const headers: Record<string, string> = {
    Origin: HOST,
    Cookie: `${ACCESS_COOKIE_NAME}=${access}`,
  };
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  return new Request(`${HOST}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

async function login(username: string, password: string): Promise<string> {
  const response = await worker.fetch(
    new Request(`${HOST}/api/v1/auth/login`, {
      method: "POST",
      headers: { Origin: HOST, "Content-Type": "application/json" },
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

async function createDepartment(access: string, code: string): Promise<string> {
  const response = await worker.fetch(
    request("/api/v1/programs/departments", access, {
      method: "POST",
      body: { code, name: `${code} Department`, lifecycle: "Draft" },
    }),
    testEnv()
  );
  assert.strictEqual(response.status, 201);
  const body = (await response.json()) as {
    data: { department: { department_id: string } };
  };
  const departmentId = body.data.department.department_id;
  const moduleResponses = await Promise.all(
    ["program_catalog", "events", "enrollment"].map((moduleKey) =>
      worker.fetch(
        request(
          `/api/v1/programs/departments/${departmentId}/modules/${moduleKey}/enable`,
          access,
          { method: "POST" }
        ),
        testEnv()
      )
    )
  );
  for (const moduleResponse of moduleResponses) {
    assert.strictEqual(moduleResponse.status, 200);
  }
  return departmentId;
}

async function createProgram(
  access: string,
  departmentId: string,
  name: string
): Promise<string> {
  const response = await worker.fetch(
    request(`/api/v1/programs/departments/${departmentId}/programs`, access, {
      method: "POST",
      body: {
        name,
        category: "測試",
        behavior_type: "OneOff",
        lifecycle: "Draft",
        discoverability: "Unlisted",
        enrollment_mode: "ManagerOnly",
      },
    }),
    testEnv()
  );
  assert.strictEqual(response.status, 201);
  const body = (await response.json()) as {
    data: { program: { program_id: string } };
  };
  return body.data.program.program_id;
}

async function auditOutcome(
  action: string,
  entityId: string,
  outcome: string
): Promise<boolean> {
  const row = await testDb()
    .prepare(
      `SELECT 1 AS present FROM audit_events
        WHERE action = ? AND entity_id = ? AND outcome = ?
        ORDER BY inserted_at DESC LIMIT 1`
    )
    .bind(action, entityId, outcome)
    .first<{ present: number }>();
  return row !== null;
}

describe("AUTH-01: Department Manager scope", () => {
  beforeAll(async () => {
    await applyMigrations();
    await importLegacyUsers(testDb(), [
      HEADER,
      ["U001", "Alice Chan", "alice", "1234", "Admin", "Active"],
      ["U002", "Bob Lee", "bob", "5678", "Member", "Active"],
      ["U003", "Carol Wong", "carol", "9012", "Member", "Active"],
      ["U004", "Dana Pending", "dana", "9999", "Member", "Pending"],
      ["U005", "Staff User", "staff", "2468", "Staff", "Active"],
    ]);
    await Promise.all(
      (
        [
          ["U001", "1234", "alice-secret"],
          ["U002", "5678", "bob-secret"],
          ["U003", "9012", "carol-secret"],
          ["U005", "2468", "staff-secret"],
        ] as const
      ).map(([userId, legacyPin, newCredential]) =>
        completeCredentialUpgrade(testDb(), {
          userId,
          legacyPin,
          newCredential,
        })
      )
    );
  });

  test("inherits assigned Department capabilities across current/future Programs", async () => {
    const admin = await login("alice", "alice-secret");
    const manager = await login("bob", "bob-secret");
    const departmentId = await createDepartment(
      admin,
      `AUTH255-A-${crypto.randomUUID().slice(0, 8)}`
    );
    const firstProgramId = await createProgram(
      admin,
      departmentId,
      `First-${crypto.randomUUID().slice(0, 8)}`
    );

    const grant = await worker.fetch(
      request(`/api/v1/programs/departments/${departmentId}/managers`, admin, {
        method: "POST",
        body: { user_id: "U002" },
      }),
      testEnv()
    );
    assert.strictEqual(grant.status, 200);
    const managerDepartment = await worker.fetch(
      request(`/api/v1/programs/departments/${departmentId}`, manager),
      testEnv()
    );
    assert.strictEqual(managerDepartment.status, 200);
    const managerDepartmentBody = (await managerDepartment.json()) as {
      data: {
        department: Record<string, unknown>;
        modules: Record<string, unknown>[];
      };
    };
    assert.strictEqual(managerDepartmentBody.data.modules.length, 5);
    assert.ok(
      managerDepartmentBody.data.modules.every(
        (module) => !("enabled_by" in module)
      )
    );
    assert.ok(!("created_by" in managerDepartmentBody.data.department));
    assert.ok(!("updated_by" in managerDepartmentBody.data.department));
    const managerList = await worker.fetch(
      request(`/api/v1/programs/departments/${departmentId}/managers`, manager),
      testEnv()
    );
    assert.strictEqual(managerList.status, 404);

    const store = new D1WorkspaceStore(testDb());
    const authorizer = new D1CapabilityAuthorizer(store);
    assert.strictEqual(
      await authorizer.can(
        { actorUserId: "U002", actorRole: "Member" },
        CAPABILITY.DEPARTMENT_MANAGE,
        { departmentId }
      ),
      true
    );
    assert.strictEqual(
      await authorizer.can(
        { actorUserId: "U002", actorRole: "Member" },
        CAPABILITY.PROGRAM_LEADER_ASSIGN,
        { departmentId, programId: firstProgramId }
      ),
      true
    );
    const leadersBefore = await testDb()
      .prepare(
        "SELECT COUNT(*) AS count FROM program_leaders WHERE program_id = ?"
      )
      .bind(firstProgramId)
      .first<{ count: number }>();
    assert.strictEqual(leadersBefore?.count, 0);

    const futureProgramId = await createProgram(
      manager,
      departmentId,
      `Future-${crypto.randomUUID().slice(0, 8)}`
    );
    const directoryResponse = await worker.fetch(
      request("/api/v1/programs/management-directory", manager),
      testEnv()
    );
    assert.strictEqual(directoryResponse.status, 200);
    const directory = (await directoryResponse.json()) as {
      data: {
        departments: { department_id: string }[];
        programs: { program_id: string }[];
      };
    };
    assert.deepStrictEqual(
      directory.data.departments.map(({ department_id }) => department_id),
      [departmentId]
    );
    assert.deepStrictEqual(
      new Set(directory.data.programs.map(({ program_id }) => program_id)),
      new Set([firstProgramId, futureProgramId])
    );

    const leaderGrant = await worker.fetch(
      request(`/api/v1/programs/${futureProgramId}/leaders`, manager, {
        method: "POST",
        body: { user_id: "U003" },
      }),
      testEnv()
    );
    assert.strictEqual(leaderGrant.status, 200);
    const leaderRows = await testDb()
      .prepare("SELECT user_id FROM program_leaders WHERE program_id = ?")
      .bind(futureProgramId)
      .all<{ user_id: string }>();
    assert.deepStrictEqual(
      (leaderRows.results ?? []).map(({ user_id }) => user_id),
      ["U003"]
    );
  });

  test("denies cross-Department operations and Manager self/peer assignment", async () => {
    const admin = await login("alice", "alice-secret");
    const manager = await login("bob", "bob-secret");
    const departmentA = await createDepartment(
      admin,
      `AUTH255-B-${crypto.randomUUID().slice(0, 8)}`
    );
    const departmentB = await createDepartment(
      admin,
      `AUTH255-C-${crypto.randomUUID().slice(0, 8)}`
    );
    const programB = await createProgram(
      admin,
      departmentB,
      `Other-${crypto.randomUUID().slice(0, 8)}`
    );
    const grant = await worker.fetch(
      request(`/api/v1/programs/departments/${departmentA}/managers`, admin, {
        method: "POST",
        body: { user_id: "U002" },
      }),
      testEnv()
    );
    assert.strictEqual(grant.status, 200);

    const crossDepartment = await worker.fetch(
      request(`/api/v1/programs/departments/${departmentB}`, manager),
      testEnv()
    );
    assert.strictEqual(crossDepartment.status, 404);
    const crossCreate = await worker.fetch(
      request(`/api/v1/programs/departments/${departmentB}/programs`, manager, {
        method: "POST",
        body: {
          name: "Denied",
          category: "測試",
          behavior_type: "OneOff",
          lifecycle: "Draft",
          discoverability: "Unlisted",
          enrollment_mode: "ManagerOnly",
        },
      }),
      testEnv()
    );
    assert.strictEqual(crossCreate.status, 403);
    const crossModule = await worker.fetch(
      request(
        `/api/v1/programs/departments/${departmentB}/modules/events/disable`,
        manager,
        { method: "POST" }
      ),
      testEnv()
    );
    assert.strictEqual(crossModule.status, 403);
    const crossLeader = await worker.fetch(
      request(`/api/v1/programs/${programB}/leaders`, manager, {
        method: "POST",
        body: { user_id: "U003" },
      }),
      testEnv()
    );
    assert.strictEqual(crossLeader.status, 403);

    await Promise.all(
      ["U002", "U003"].map(async (target) => {
        const selfOrPeer = await worker.fetch(
          request(
            `/api/v1/programs/departments/${departmentA}/managers`,
            manager,
            {
              method: "POST",
              body: { user_id: target },
            }
          ),
          testEnv()
        );
        assert.strictEqual(selfOrPeer.status, 403);
      })
    );
    const memberSearch = await worker.fetch(
      request(
        `/api/v1/programs/departments/${departmentA}/member-options?q=alice`,
        manager
      ),
      testEnv()
    );
    assert.strictEqual(memberSearch.status, 404);
    const rows = await testDb()
      .prepare(
        "SELECT user_id FROM department_managers WHERE department_id = ? AND revoked_at IS NULL"
      )
      .bind(departmentA)
      .all<{ user_id: string }>();
    assert.deepStrictEqual(
      (rows.results ?? []).map(({ user_id }) => user_id),
      ["U002"]
    );
  });

  test("audits duplicate, conflict, inactive, and revoked-actor outcomes", async () => {
    const admin = await login("alice", "alice-secret");
    const staff = await login("staff", "staff-secret");
    const departmentId = await createDepartment(
      admin,
      `AUTH255-D-${crypto.randomUUID().slice(0, 8)}`
    );
    const entityId = `${departmentId}:U003`;
    const selfGrant = await worker.fetch(
      request(`/api/v1/programs/departments/${departmentId}/managers`, admin, {
        method: "POST",
        body: { user_id: "U001" },
      }),
      testEnv()
    );
    assert.strictEqual(selfGrant.status, 403);
    assert.strictEqual(
      await auditOutcome(
        "DEPARTMENT_MANAGER_GRANT",
        `${departmentId}:U001`,
        "DENIED"
      ),
      true
    );

    const firstGrant = await worker.fetch(
      request(`/api/v1/programs/departments/${departmentId}/managers`, admin, {
        method: "POST",
        body: { user_id: "U003" },
      }),
      testEnv()
    );
    assert.strictEqual(firstGrant.status, 200);
    const duplicateGrant = await worker.fetch(
      request(`/api/v1/programs/departments/${departmentId}/managers`, admin, {
        method: "POST",
        body: { user_id: "U003" },
      }),
      testEnv()
    );
    assert.strictEqual(duplicateGrant.status, 200);
    assert.strictEqual(
      await auditOutcome("DEPARTMENT_MANAGER_GRANT", entityId, "DUPLICATE"),
      true
    );
    const conflictGrant = await worker.fetch(
      request(`/api/v1/programs/departments/${departmentId}/managers`, staff, {
        method: "POST",
        body: { user_id: "U003" },
      }),
      testEnv()
    );
    assert.strictEqual(conflictGrant.status, 409);
    assert.strictEqual(
      await auditOutcome("DEPARTMENT_MANAGER_GRANT", entityId, "CONFLICT"),
      true
    );

    const revoke = await worker.fetch(
      request(
        `/api/v1/programs/departments/${departmentId}/managers/U003/revoke`,
        admin,
        { method: "POST" }
      ),
      testEnv()
    );
    assert.strictEqual(revoke.status, 200);
    const duplicateRevoke = await worker.fetch(
      request(
        `/api/v1/programs/departments/${departmentId}/managers/U003/revoke`,
        admin,
        { method: "POST" }
      ),
      testEnv()
    );
    assert.strictEqual(duplicateRevoke.status, 200);
    assert.strictEqual(
      await auditOutcome("DEPARTMENT_MANAGER_REVOKE", entityId, "DUPLICATE"),
      true
    );
    const otherActorRevoke = await worker.fetch(
      request(
        `/api/v1/programs/departments/${departmentId}/managers/U003/revoke`,
        staff,
        { method: "POST" }
      ),
      testEnv()
    );
    assert.strictEqual(otherActorRevoke.status, 409);
    assert.strictEqual(
      await auditOutcome("DEPARTMENT_MANAGER_REVOKE", entityId, "CONFLICT"),
      true
    );

    const inactive = await worker.fetch(
      request(`/api/v1/programs/departments/${departmentId}/managers`, admin, {
        method: "POST",
        body: { user_id: "U004" },
      }),
      testEnv()
    );
    assert.strictEqual(inactive.status, 422);
    assert.strictEqual(
      await auditOutcome(
        "DEPARTMENT_MANAGER_GRANT",
        `${departmentId}:U004`,
        "DENIED"
      ),
      true
    );

    const revokeNeverAssigned = await worker.fetch(
      request(
        `/api/v1/programs/departments/${departmentId}/managers/U005/revoke`,
        admin,
        { method: "POST" }
      ),
      testEnv()
    );
    assert.strictEqual(revokeNeverAssigned.status, 404);
    assert.strictEqual(
      await auditOutcome(
        "DEPARTMENT_MANAGER_REVOKE",
        `${departmentId}:U005`,
        "DENIED"
      ),
      true,
      "revoke of a never-assigned manager must write a DENIED audit row (ADR-0027)"
    );
  });

  test("concurrent grants of a brand-new pair yield one SUCCESS and one CONFLICT", async () => {
    const admin = await login("alice", "alice-secret");
    const staff = await login("staff", "staff-secret");
    const departmentId = await createDepartment(
      admin,
      `AUTH255-E-${crypto.randomUUID().slice(0, 8)}`
    );
    const entityId = `${departmentId}:U003`;
    const results = await Promise.all([
      worker.fetch(
        request(
          `/api/v1/programs/departments/${departmentId}/managers`,
          admin,
          {
            method: "POST",
            body: { user_id: "U003" },
          }
        ),
        testEnv()
      ),
      worker.fetch(
        request(
          `/api/v1/programs/departments/${departmentId}/managers`,
          staff,
          {
            method: "POST",
            body: { user_id: "U003" },
          }
        ),
        testEnv()
      ),
    ]);
    const statuses = results.map((result) => result.status).sort();
    assert.deepStrictEqual(
      statuses,
      [200, 409],
      "one concurrent grant wins, the other conflicts"
    );
    const active = await testDb()
      .prepare(
        `SELECT user_id FROM department_managers
         WHERE department_id = ? AND revoked_at IS NULL`
      )
      .bind(departmentId)
      .all<{ user_id: string }>();
    assert.deepStrictEqual(
      (active.results ?? []).map(({ user_id }) => user_id),
      ["U003"],
      "exactly one active manager row"
    );
    assert.strictEqual(
      await auditOutcome("DEPARTMENT_MANAGER_GRANT", entityId, "SUCCESS"),
      true
    );
    assert.strictEqual(
      await auditOutcome("DEPARTMENT_MANAGER_GRANT", entityId, "CONFLICT"),
      true
    );
  });

  test("store failures audit FAILED and propagate", async () => {
    const admin = await login("alice", "alice-secret");
    const departmentId = await createDepartment(
      admin,
      `AUTH255-F-${crypto.randomUUID().slice(0, 8)}`
    );
    class ThrowingStore extends D1WorkspaceStore {
      private readonly outage = new Error("simulated D1 outage");

      override assignDepartmentManager(): Promise<never> {
        throw this.outage;
      }
    }
    const store = new ThrowingStore(testDb());
    const workspace = new DepartmentWorkspace(
      store,
      new D1CapabilityAuthorizer(store)
    );
    await assert.rejects(
      workspace.assignDepartmentManager(
        { actorUserId: "U001", actorRole: "Admin" },
        departmentId,
        "U003",
        null
      ),
      /simulated D1 outage/u
    );
    assert.strictEqual(
      await auditOutcome(
        "DEPARTMENT_MANAGER_GRANT",
        `${departmentId}:U003`,
        "FAILED"
      ),
      true
    );
  });

  test("management member directory scopes Department Managers to assigned-department enrollments", async () => {
    const admin = await login("alice", "alice-secret");
    const staff = await login("staff", "staff-secret");
    const manager = await login("bob", "bob-secret");
    const departmentA = await createDepartment(
      admin,
      `MGMT-A-${crypto.randomUUID().slice(0, 8)}`
    );
    const programA = await createProgram(
      admin,
      departmentA,
      `Alpha-${crypto.randomUUID().slice(0, 8)}`
    );
    const departmentB = await createDepartment(
      admin,
      `MGMT-B-${crypto.randomUUID().slice(0, 8)}`
    );
    const programB = await createProgram(
      admin,
      departmentB,
      `Beta-${crypto.randomUUID().slice(0, 8)}`
    );
    const grant = await worker.fetch(
      request(`/api/v1/programs/departments/${departmentA}/managers`, admin, {
        method: "POST",
        body: { user_id: "U002" },
      }),
      testEnv()
    );
    assert.strictEqual(grant.status, 200);

    // carol (U003) is enrolled in departmentA; staff (U005) only in the
    // unrelated departmentB.
    const now = new Date().toISOString();
    await testDb()
      .prepare(
        `INSERT INTO enrollments (
           enrollment_id, program_id, member_user_id, status, enrolled_at, created_at
         ) VALUES (?, ?, ?, 'Active', ?, ?)`
      )
      .bind(crypto.randomUUID(), programA, "U003", now, now)
      .run();
    await testDb()
      .prepare(
        `INSERT INTO enrollments (
           enrollment_id, program_id, member_user_id, status, enrolled_at, created_at
         ) VALUES (?, ?, ?, 'Active', ?, ?)`
      )
      .bind(crypto.randomUUID(), programB, "U005", now, now)
      .run();

    async function memberIds(access: string, q: string): Promise<string[]> {
      const res = await worker.fetch(
        request(`/api/v1/management/members?q=${q}`, access),
        testEnv()
      );
      assert.strictEqual(res.status, 200, `${q} search must succeed`);
      const body = (await res.json()) as {
        data: { members: { user_id: string }[] };
      };
      return body.data.members.map(({ user_id }) => user_id);
    }

    // Admin and Staff resolve church-wide: both enrolled members are visible.
    assert.deepStrictEqual(await memberIds(admin, "carol"), ["U003"]);
    assert.deepStrictEqual(await memberIds(admin, "staff"), ["U005"]);
    assert.deepStrictEqual(await memberIds(staff, "staff"), ["U005"]);

    // The departmentA manager sees carol (enrolled in A) but never staff,
    // who is enrolled only in the unrelated departmentB.
    assert.deepStrictEqual(await memberIds(manager, "carol"), ["U003"]);
    assert.deepStrictEqual(
      await memberIds(manager, "staff"),
      [],
      "unrelated department's enrolled members must not be visible"
    );
    assert.deepStrictEqual(
      await memberIds(manager, "alice"),
      [],
      "a member not enrolled in an assigned department is not visible"
    );
  });

  test("management member directory requires a 2+ character query (422)", async () => {
    const admin = await login("alice", "alice-secret");
    const res = await worker.fetch(
      request("/api/v1/management/members?q=a", admin),
      testEnv()
    );
    assert.strictEqual(res.status, 422);
    const problem = (await res.json()) as { code: string };
    assert.strictEqual(problem.code, "VALIDATION");
  });

  test("management member directory denies a Member with no manager grant (403)", async () => {
    const admin = await login("alice", "alice-secret");
    // A fresh Member who has never been granted any department.
    const username = `plain-${crypto.randomUUID().slice(0, 8)}`;
    const reg = await worker.fetch(
      new Request(`${HOST}/api/v1/auth/register`, {
        method: "POST",
        headers: {
          Origin: HOST,
          "Content-Type": "application/json",
          "Idempotency-Key": `idem-plain-${username}`,
        },
        body: JSON.stringify({
          username,
          password: "plain-password-1",
          name: "Plain Member",
        }),
      }),
      testEnv()
    );
    assert.strictEqual(reg.status, 200);
    const requestRow = await testDb()
      .prepare(
        "SELECT request_id FROM registration_requests WHERE username_normalized = ?"
      )
      .bind(username)
      .first<{ request_id: string }>();
    assert.ok(requestRow);
    const approve = await worker.fetch(
      new Request(
        `${HOST}/api/v1/auth/registrations/${requestRow?.request_id ?? ""}/approve`,
        {
          method: "POST",
          headers: {
            Origin: HOST,
            Cookie: `${ACCESS_COOKIE_NAME}=${admin}`,
            "Idempotency-Key": `idem-approve-${username}`,
          },
        }
      ),
      testEnv()
    );
    assert.strictEqual(approve.status, 200);
    const member = await login(username, "plain-password-1");
    const res = await worker.fetch(
      request("/api/v1/management/members?q=alice", member),
      testEnv()
    );
    assert.strictEqual(res.status, 403);
    const problem = (await res.json()) as { code: string };
    assert.strictEqual(problem.code, "FORBIDDEN");
  });
});
