/**
 * 087-03 #320 — Account Permissions real matrix Worker contract.
 *
 * Acceptance (trace `087-03-permissions-matrix.md`): the Admin/Staff-only
 * endpoint projects every elevated account (Admin / Staff-with-DM-grant /
 * Staff) with name, role, and department context, plus the fixed three role
 * definitions with assignment states computed from real data. Department
 * Manager-only and Member actors are denied server-side (403/FORBIDDEN) —
 * explicit response assertions, not client-side hiding.
 */
import assert from "node:assert/strict";

import { env } from "cloudflare:workers";
import { beforeAll, describe, test } from "vitest";

import worker from "../../worker";
import type { Env } from "../../worker";
import { importLegacyUsers } from "../auth/accounts";
import { ACCESS_COOKIE_NAME } from "../auth/cookies";
import { applyMigrations, testDb } from "../auth/test-bootstrap";
import { completeCredentialUpgrade } from "../auth/upgrade";
import { COPY } from "../copy";

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

async function createDepartment(access: string): Promise<string> {
  const response = await worker.fetch(
    request("/api/v1/programs/departments", access, {
      method: "POST",
      body: {
        code: `PERM-${crypto.randomUUID().slice(0, 8)}`,
        name: "培育部",
        lifecycle: "Draft",
      },
    }),
    testEnv()
  );
  assert.strictEqual(response.status, 201);
  const body = (await response.json()) as {
    data: { department: { department_id: string } };
  };
  return body.data.department.department_id;
}

async function assignManager(
  access: string,
  departmentId: string,
  userId: string
): Promise<void> {
  const response = await worker.fetch(
    request(`/api/v1/programs/departments/${departmentId}/managers`, access, {
      method: "POST",
      body: { user_id: userId },
    }),
    testEnv()
  );
  assert.strictEqual(response.status, 200);
}

interface AccountPermissionsBody {
  requestId: string;
  data: {
    accounts: Array<{
      userId: string;
      name: string;
      role: "admin" | "department-manager" | "staff";
      departments: Array<{ id: string; name: string }>;
    }>;
    roles: Array<{
      key: "admin" | "department-manager" | "staff";
      label: string;
      scope: string;
      assignmentState: "assigned" | "assignable";
    }>;
  };
}

async function fetchPermissions(
  access: string
): Promise<{ status: number; body: AccountPermissionsBody }> {
  const response = await worker.fetch(
    request("/api/v1/programs/account-permissions", access),
    testEnv()
  );
  const body = (await response.json()) as AccountPermissionsBody;
  assert.strictEqual(
    body.requestId,
    response.headers.get("X-Request-Id"),
    "body requestId must equal X-Request-Id"
  );
  return { status: response.status, body };
}

describe("087-03: Account Permissions matrix", () => {
  let adminAccess: string;
  let staffAccess: string;
  let dmAccess: string;
  let memberAccess: string;
  let departmentId: string;

  beforeAll(async () => {
    await applyMigrations();
    await importLegacyUsers(testDb(), [
      HEADER,
      ["A001", "Admin One", "perm-admin", "1111", "Admin", "Active"],
      ["A002", "Staff One", "perm-staff", "2222", "Staff", "Active"],
      ["A003", "Staff Manager", "perm-staff-dm", "3333", "Staff", "Active"],
      ["A004", "Member One", "perm-member", "4444", "Member", "Active"],
      ["A005", "Member Manager", "perm-member-dm", "5555", "Member", "Active"],
    ]);
    await Promise.all(
      (
        [
          ["A001", "1111", "admin-secret"],
          ["A002", "2222", "staff-secret"],
          ["A003", "3333", "staff-dm-secret"],
          ["A004", "4444", "member-secret"],
          ["A005", "5555", "member-dm-secret"],
        ] as const
      ).map(([userId, legacyPin, newCredential]) =>
        completeCredentialUpgrade(testDb(), {
          userId,
          legacyPin,
          newCredential,
        })
      )
    );
    adminAccess = await login("perm-admin", "admin-secret");
    staffAccess = await login("perm-staff", "staff-secret");
    dmAccess = await login("perm-member-dm", "member-dm-secret");
    memberAccess = await login("perm-member", "member-secret");
    departmentId = await createDepartment(adminAccess);
    await assignManager(adminAccess, departmentId, "A003");
    await assignManager(adminAccess, departmentId, "A005");
  });

  test("Admin sees the full elevated-account projection with department context", async () => {
    const { status, body } = await fetchPermissions(adminAccess);
    assert.strictEqual(status, 200);

    const byUser = new Map(
      body.data.accounts.map((account) => [account.userId, account])
    );
    // Every admin-capable account: Admin, plain Staff, and
    // Staff-with-DM-grant. A Member with a Department Manager grant remains
    // scoped access and is intentionally not part of this church-wide matrix.
    assert.deepStrictEqual(
      [...byUser.keys()].sort(),
      ["A001", "A002", "A003"]
    );
    assert.deepStrictEqual(byUser.get("A001"), {
      userId: "A001",
      name: "Admin One",
      role: "admin",
      departments: [],
    });
    assert.deepStrictEqual(byUser.get("A002"), {
      userId: "A002",
      name: "Staff One",
      role: "staff",
      departments: [],
    });
    // Staff-with-DM-grant projects as department-manager with real context.
    const staffDm = byUser.get("A003");
    assert.strictEqual(staffDm?.role, "department-manager");
    assert.strictEqual(staffDm?.departments.length, 1);
    assert.strictEqual(staffDm?.departments[0].id, departmentId);
    assert.strictEqual(staffDm?.departments[0].name, "培育部");

    // Plain Members and Member-only Department Managers never appear.
    assert.ok(!byUser.has("A004"));
    assert.ok(!byUser.has("A005"));
  });

  test("roles carry the fixed reference vocabulary with real assignment states", async () => {
    const { body } = await fetchPermissions(adminAccess);
    assert.deepStrictEqual(
      body.data.roles.map((role) => role.key),
      ["admin", "department-manager", "staff"]
    );
    assert.deepStrictEqual(
      body.data.roles.map((role) => role.label),
      [
        COPY.permissions.roleAdmin,
        COPY.permissions.roleDepartmentManager,
        COPY.permissions.roleStaff,
      ]
    );
    assert.deepStrictEqual(
      body.data.roles.map((role) => role.scope),
      [
        COPY.permissions.roleAdminScope,
        COPY.permissions.roleDepartmentManagerScope,
        COPY.permissions.roleStaffScope,
      ]
    );
    assert.deepStrictEqual(
      body.data.roles.map((role) => role.assignmentState),
      ["assigned", "assigned", "assigned"]
    );
  });

  test("Staff sees the same full projection", async () => {
    const { status, body } = await fetchPermissions(staffAccess);
    assert.strictEqual(status, 200);
    const adminView = await fetchPermissions(adminAccess);
    assert.deepStrictEqual(body.data, adminView.body.data);
  });

  test("a role with no holder projects as 可指派 (assignable)", async () => {
    // Demote the only plain Staff account so the 同工 role has no holder;
    // the projection must reflect the change immediately.
    await testDb()
      .prepare("UPDATE accounts SET role = 'Member' WHERE user_id = 'A002'")
      .run();
    try {
      const { body } = await fetchPermissions(adminAccess);
      const byUser = new Map(
        body.data.accounts.map((account) => [account.userId, account])
      );
      assert.ok(!byUser.has("A002"));
      const staffRole = body.data.roles.find((role) => role.key === "staff");
      assert.strictEqual(staffRole?.assignmentState, "assignable");
      const adminRole = body.data.roles.find((role) => role.key === "admin");
      assert.strictEqual(adminRole?.assignmentState, "assigned");
      const dmRole = body.data.roles.find(
        (role) => role.key === "department-manager"
      );
      assert.strictEqual(dmRole?.assignmentState, "assigned");
    } finally {
      await testDb()
        .prepare("UPDATE accounts SET role = 'Staff' WHERE user_id = 'A002'")
        .run();
    }
  });

  test("Department-Manager-only actor is denied server-side with 403 FORBIDDEN", async () => {
    const response = await worker.fetch(
      request("/api/v1/programs/account-permissions", dmAccess),
      testEnv()
    );
    assert.strictEqual(response.status, 403);
    assert.strictEqual(
      response.headers.get("Content-Type"),
      "application/problem+json"
    );
    const body = (await response.json()) as {
      code: string;
      status: number;
      title: string;
      requestId: string;
    };
    assert.strictEqual(body.code, "FORBIDDEN");
    assert.strictEqual(body.status, 403);
    assert.strictEqual(body.title, "Forbidden");
    assert.strictEqual(body.requestId, response.headers.get("X-Request-Id"));
  });

  test("plain Member is denied server-side with 403 FORBIDDEN", async () => {
    const response = await worker.fetch(
      request("/api/v1/programs/account-permissions", memberAccess),
      testEnv()
    );
    assert.strictEqual(response.status, 403);
    assert.strictEqual(
      response.headers.get("Content-Type"),
      "application/problem+json"
    );
    const body = (await response.json()) as {
      code: string;
      status: number;
      requestId: string;
    };
    assert.strictEqual(body.code, "FORBIDDEN");
    assert.strictEqual(body.status, 403);
    assert.strictEqual(body.requestId, response.headers.get("X-Request-Id"));
  });
});
