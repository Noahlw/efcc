/**
 * 087-04 (#321) — Member Directory Worker contract (Spec 087 US 13-15).
 *
 * Acceptance (trace `087-04-member-directory.md`): Admin/Staff search is
 * church-wide across Active accounts (enrolled or not); Department Manager
 * search is scoped server-side to members with Active enrollments in
 * programs under their assigned departments — with an explicit exclusion
 * assertion; the member detail projection (contact, role, department
 * memberships) ships inside each search result, so the browser needs no
 * separate detail fetch or commit step.
 *
 * Wire contract (locked with backend): GET /api/v1/programs/members?q=...
 * &limit=<n>; q required and >= 2 chars (422 VALIDATION); limit optional,
 * default 20, clamped 1-50; success `{ requestId, data: { members } }` with
 * X-Request-Id correlation; members are
 * `{ userId, name, phone: string|null, role, status: "Active",
 *    departments: [{ id, name }] }` ordered by name, username; a non-
 * Admin/Staff actor with zero active department grants is denied 403.
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

async function createDepartment(
  access: string,
  code: string,
  name: string
): Promise<{ department_id: string; code: string; name: string }> {
  const response = await worker.fetch(
    request("/api/v1/programs/departments", access, {
      method: "POST",
      body: { code, name, lifecycle: "Draft" },
    }),
    testEnv()
  );
  assert.strictEqual(response.status, 201);
  const body = (await response.json()) as {
    data: { department: { department_id: string; code: string; name: string } };
  };
  const department = body.data.department;
  // Enable the modules a managed program needs so API-side creation works.
  await Promise.all(
    ["program_catalog", "events", "enrollment"].map(async (moduleKey) => {
      const moduleRes = await worker.fetch(
        request(
          `/api/v1/programs/departments/${department.department_id}/modules/${moduleKey}/enable`,
          access,
          { method: "POST" }
        ),
        testEnv()
      );
      assert.strictEqual(moduleRes.status, 200);
    })
  );
  return department;
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
        description: "測試目的",
        category: "測試類別",
        behavior_type: "OneOff",
        lifecycle: "Active",
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

/** Seed one Active enrollment directly (existing D1 contract shape). */
async function enroll(programId: string, memberUserId: string): Promise<void> {
  await testDb()
    .prepare(
      `INSERT INTO enrollments (enrollment_id, program_id, member_user_id, status, enrolled_at, created_by, created_at)
       VALUES (?, ?, ?, 'Active', datetime('now'), 'A001', datetime('now'))`
    )
    .bind(crypto.randomUUID(), programId, memberUserId)
    .run();
}

async function setPhone(userId: string, phone: string | null): Promise<void> {
  await testDb()
    .prepare("UPDATE accounts SET phone = ? WHERE user_id = ?")
    .bind(phone, userId)
    .run();
}

interface MemberRow {
  userId: string;
  name: string;
  phone: string | null;
  role: "Admin" | "Staff" | "Member";
  status: string;
  departments: Array<{ id: string; name: string }>;
}

interface MembersBody {
  requestId: string;
  data: { members: MemberRow[] };
}

async function searchMembers(
  access: string,
  query: string,
  limit?: number
): Promise<{ status: number; body: MembersBody }> {
  const queryString = new URLSearchParams({ q: query });
  if (limit !== undefined) {
    queryString.set("limit", String(limit));
  }
  const response = await worker.fetch(
    request(`/api/v1/programs/members?${queryString.toString()}`, access),
    testEnv()
  );
  const body = (await response.json()) as MembersBody;
  assert.strictEqual(
    body.requestId,
    response.headers.get("X-Request-Id"),
    "body requestId must equal X-Request-Id"
  );
  return { status: response.status, body };
}

describe("087-04: Member Directory search scope boundary", () => {
  let adminAccess: string;
  let staffAccess: string;
  let dmAccess: string;
  let plainMemberAccess: string;
  let deptXId: string;
  let deptYId: string;
  let programXId: string;
  let programYId: string;

  beforeAll(async () => {
    await applyMigrations();
    await importLegacyUsers(testDb(), [
      HEADER,
      ["A001", "Admin One", "root-admin", "1111", "Admin", "Active"],
      ["A002", "Staff One", "root-staff", "2222", "Staff", "Active"],
      ["A003", "Member Manager", "md-member-dm", "3333", "Member", "Active"],
      ["A004", "Plain Member", "md-plain", "4444", "Member", "Active"],
      ["A005", "Dana X", "md-dana-x", "5555", "Member", "Active"],
      ["A006", "Evan Y", "md-evan-y", "6666", "Member", "Active"],
      ["A007", "Fay None", "md-fay-none", "7777", "Member", "Active"],
      ["A008", "Grace Pending", "md-grace-p", "8888", "Member", "Pending"],
    ]);
    await Promise.all(
      (
        [
          ["A001", "1111", "admin-secret"],
          ["A002", "2222", "staff-secret"],
          ["A003", "3333", "dm-secret"],
          ["A004", "4444", "plain-secret"],
        ] as const
      ).map(([userId, legacyPin, newCredential]) =>
        completeCredentialUpgrade(testDb(), {
          userId,
          legacyPin,
          newCredential,
        })
      )
    );
    adminAccess = await login("root-admin", "admin-secret");
    staffAccess = await login("root-staff", "staff-secret");
    dmAccess = await login("md-member-dm", "dm-secret");
    plainMemberAccess = await login("md-plain", "plain-secret");

    const deptX = await createDepartment(adminAccess, "MDX", "培育部");
    const deptY = await createDepartment(adminAccess, "MDY", "崇拜部");
    deptXId = deptX.department_id;
    deptYId = deptY.department_id;
    // A003 is Department Manager of 培育部 (Dept X) only.
    await assignManager(adminAccess, deptXId, "A003");

    programXId = await createProgram(adminAccess, deptXId, "門徒訓練");
    programYId = await createProgram(adminAccess, deptYId, "詩班練習");

    // Dana (A005) is enrolled in BOTH departments; Evan (A006) only in 崇拜部;
    // Grace (A008) is enrolled but her account is Pending; Fay (A007) is
    // Active but not enrolled anywhere.
    await enroll(programXId, "A005");
    await enroll(programYId, "A005");
    await enroll(programYId, "A006");
    await enroll(programXId, "A008");

    await setPhone("A005", "9123 4567");
    await setPhone("A006", "6565 4321");
    await setPhone("A007", "7777 8888");
  });

  test("query validation: missing/short q is 422 VALIDATION with correlation", async () => {
    for (const query of ["", "x"]) {
      const response = await worker.fetch(
        request(`/api/v1/programs/members?q=${encodeURIComponent(query)}`, adminAccess),
        testEnv()
      );
      assert.strictEqual(response.status, 422);
      assert.strictEqual(
        response.headers.get("Content-Type"),
        "application/problem+json"
      );
      const body = (await response.json()) as {
        code: string;
        status: number;
        title: string;
        detail: string;
        requestId: string;
      };
      assert.strictEqual(body.code, "VALIDATION");
      assert.strictEqual(body.status, 422);
      assert.strictEqual(body.detail, "Search requires at least two characters.");
      assert.strictEqual(body.requestId, response.headers.get("X-Request-Id"));
    }
  });

  test("Admin search is church-wide across Active accounts, enrolled or not", async () => {
    const { status, body } = await searchMembers(adminAccess, "md-");
    assert.strictEqual(status, 200);
    const byUser: Record<string, MemberRow> = Object.fromEntries(
      body.data.members.map((member) => [member.userId, member])
    );
    // Every Active account whose name/username/phone matches — enrolled or
    // not — except the Pending account (A008) and the two roles whose
    // usernames do not match this query (A001/A002).
    assert.deepStrictEqual(
      Object.keys(byUser).sort(),
      ["A003", "A004", "A005", "A006", "A007"]
    );
    // Detail projection ships inside the search result: contact, role,
    // status, department memberships — no separate detail fetch needed.
    const dana = byUser["A005"];
    assert.deepStrictEqual(dana, {
      userId: "A005",
      name: "Dana X",
      phone: "9123 4567",
      role: "Member",
      status: "Active",
      departments: [
        { id: deptXId, name: "培育部" },
        { id: deptYId, name: "崇拜部" },
      ],
    });
    // Not-enrolled members still appear church-wide, with no memberships.
    const fay = byUser["A007"];
    assert.strictEqual(fay?.phone, "7777 8888");
    assert.deepStrictEqual(fay?.departments, []);
    // Order is by name, username.
    assert.deepStrictEqual(
      body.data.members.map((member) => member.name),
      ["Dana X", "Evan Y", "Fay None", "Member Manager", "Plain Member"]
    );
  });

  test("Staff sees the same church-wide projection as Admin", async () => {
    const staffView = await searchMembers(staffAccess, "md-");
    const adminView = await searchMembers(adminAccess, "md-");
    assert.strictEqual(staffView.status, 200);
    assert.deepStrictEqual(staffView.body.data, adminView.body.data);
  });

  test("phone and name fields match the query", async () => {
    const byPhone = await searchMembers(adminAccess, "9123");
    assert.strictEqual(byPhone.status, 200);
    assert.deepStrictEqual(
      byPhone.body.data.members.map((member) => member.userId),
      ["A005"]
    );
    const byName = await searchMembers(adminAccess, "Dana");
    assert.strictEqual(byName.status, 200);
    assert.deepStrictEqual(
      byName.body.data.members.map((member) => member.userId),
      ["A005"]
    );
  });

  test("limit clamps the result count", async () => {
    const one = await searchMembers(adminAccess, "md-", 1);
    assert.strictEqual(one.status, 200);
    assert.strictEqual(one.body.data.members.length, 1);
    const wide = await searchMembers(adminAccess, "md-", 999);
    assert.strictEqual(wide.status, 200);
    assert.strictEqual(wide.body.data.members.length, 5);
  });

  test("Department Manager search is scoped to managed departments with explicit exclusion", async () => {
    const { status, body } = await searchMembers(dmAccess, "md-");
    assert.strictEqual(status, 200);
    const byUser: Record<string, MemberRow> = Object.fromEntries(
      body.data.members.map((member) => [member.userId, member])
    );
    // Only Dana (A005): she holds an Active enrollment in a program under
    // Dept X (培育部). Her 崇拜部 enrollment is out of scope and the
    // departments array is restricted to the managed department.
    assert.deepStrictEqual(Object.keys(byUser), ["A005"]);
    assert.deepStrictEqual(byUser["A005"]?.departments, [
      { id: deptXId, name: "培育部" },
    ]);
    // Explicit exclusions: Evan (enrolled only in 崇拜部), Fay (not
    // enrolled), the DM themselves (not enrolled), and Plain Member.
    for (const excluded of ["A006", "A007", "A003", "A004"]) {
      assert.ok(byUser[excluded] === undefined, `${excluded} must be excluded`);
    }
  });

  test("Department Manager never sees members outside their scope by name", async () => {
    const { status, body } = await searchMembers(dmAccess, "Evan");
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(body.data.members, []);
  });

  test("Pending accounts never appear, even when enrolled and in scope", async () => {
    const adminView = await searchMembers(adminAccess, "Grace");
    assert.deepStrictEqual(adminView.body.data.members, []);
    const dmView = await searchMembers(dmAccess, "Grace");
    assert.deepStrictEqual(dmView.body.data.members, []);
  });

  test("a non-Admin/Staff actor with no active department grants is denied 403", async () => {
    const response = await worker.fetch(
      request("/api/v1/programs/members?q=md-", plainMemberAccess),
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
});
