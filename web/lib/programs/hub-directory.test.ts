/**
 * HUB-01 (#310 / spec 087 US 1-3, 22) — Management Hub directory projection
 * (`GET /api/v1/programs/hub`).
 *
 * The projection is server-filtered: ungranted rows and empty groups are
 * omitted entirely, never shown disabled; role gates reuse the canonical
 * role vocabulary and scope gates reuse the capability authorizer. No Care
 * row exists in any response (spec 084 removal, spec 087 US 22 regression).
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
import type {
  ManagementHubGroup,
  ManagementHubRow,
  ManagementHubView,
} from "./department-workspace";

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

/** Create a department with program_catalog + attendance enabled. */
async function createDepartment(
  access: string,
  code: string,
  options: { attendance?: boolean } = {}
): Promise<string> {
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
  const moduleKeys = options.attendance === false
    ? ["program_catalog"]
    : ["program_catalog", "attendance"];
  const moduleResponses = await Promise.all(
    moduleKeys.map((moduleKey) =>
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
): Promise<void> {
  const response = await worker.fetch(
    request(`/api/v1/programs/departments/${departmentId}/programs`, access, {
      method: "POST",
      body: {
        description: "測試目的",
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
}

async function hubProjection(access: string): Promise<ManagementHubView> {
  const response = await worker.fetch(
    request("/api/v1/programs/hub", access),
    testEnv()
  );
  assert.strictEqual(response.status, 200);
  assert.strictEqual(
    response.headers.get("Content-Type"),
    "application/json"
  );
  const body = (await response.json()) as {
    requestId: string;
    data: ManagementHubView;
  };
  assert.strictEqual(body.requestId, response.headers.get("X-Request-Id"));
  return body.data;
}

function rowKeys(group: ManagementHubGroup): string[] {
  return group.rows.map((row) => row.key);
}

function allRows(view: ManagementHubView): ManagementHubRow[] {
  return view.groups.flatMap((group) => group.rows);
}

/** Spec 084 removal / spec 087 US 22: Care must not reappear anywhere. */
function assertNoCareRow(view: ManagementHubView): void {
  for (const row of allRows(view)) {
    assert.ok(
      !row.key.toLowerCase().includes("care"),
      `Care key leaked into the projection: ${row.key}`
    );
    assert.ok(
      !/care|關懷/u.test(`${row.label}${row.description}`),
      `Care copy leaked into the projection: ${row.label}`
    );
  }
  if (view.entryCard) {
    assert.ok(
      !/care|關懷/u.test(`${view.entryCard.label}${view.entryCard.description}`),
      "Care copy leaked into the entry card"
    );
  }
}

const EXPECTED_GROUP_ORDER = [
  { key: "members-and-permissions", label: "會員與權限" },
  { key: "ministry-operations", label: "事工營運" },
  { key: "content-and-system", label: "內容與系統" },
];

describe("HUB-01: Management Hub directory projection", () => {
  beforeAll(async () => {
    await applyMigrations();
    await importLegacyUsers(testDb(), [
      HEADER,
      ["U001", "Alice Chan", "alice", "1234", "Admin", "Active"],
      ["U002", "Bob Lee", "bob", "5678", "Member", "Active"],
      ["U003", "Carol Wong", "carol", "9012", "Member", "Active"],
      ["U005", "Staff User", "staff", "2468", "Staff", "Active"],
      // U007 stays grant-free until the module-gate test grants it exactly
      // one department (shared-DB isolation for the attendance gate).
      ["U007", "Dora Grant", "dora", "1357", "Member", "Active"],
    ]);
    await Promise.all(
      (
        [
          ["U001", "1234", "alice-secret"],
          ["U002", "5678", "bob-secret"],
          ["U003", "9012", "carol-secret"],
          ["U005", "2468", "staff-secret"],
          ["U007", "1357", "dora-secret"],
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

  test("Admin sees the full projection: 3 fixed groups, 6 rows, entry card", async () => {
    const admin = await login("alice", "alice-secret");
    const suffix = crypto.randomUUID().slice(0, 8);
    const departmentId = await createDepartment(admin, `HUB-ADMIN-${suffix}`);
    await createProgram(admin, departmentId, `Full-${suffix}`);

    const view = await hubProjection(admin);
    assertNoCareRow(view);

    assert.deepStrictEqual(
      view.groups.map(({ key, label }) => ({ key, label })),
      EXPECTED_GROUP_ORDER
    );
    assert.deepStrictEqual(
      view.groups.map(rowKeys),
      [
        ["approvals", "permissions"],
        ["departments", "attendance", "members"],
        ["home-content"],
      ]
    );

    const rows = allRows(view);
    assert.strictEqual(rows.length, 6);
    const byKey = new Map(rows.map((row) => [row.key, row]));
    assert.deepStrictEqual(
      {
        approvals: byKey.get("approvals"),
        permissions: byKey.get("permissions"),
        departments: byKey.get("departments"),
        attendance: byKey.get("attendance"),
        members: byKey.get("members"),
        "home-content": byKey.get("home-content"),
      },
      {
        approvals: {
          key: "approvals",
          label: "註冊審批",
          description: "核准或拒絕會員申請",
          href: "/management?module=approvals",
        },
        permissions: {
          key: "permissions",
          label: "帳戶與權限",
          description: "管理員帳戶及角色",
          href: "/management?module=permissions",
        },
        departments: {
          key: "departments",
          label: "部門設定",
          description: "部門開關、管理者及建立課程",
          href: "/management?module=departments",
        },
        attendance: {
          key: "attendance",
          label: "聚會／出席",
          description: "出席點名、代簽及修正",
          href: "/management?module=attendance",
        },
        members: {
          key: "members",
          label: "參與者",
          description: "搜尋並查看會員資料",
          href: "/management?module=members",
        },
        "home-content": {
          key: "home-content",
          label: "首頁內容",
          description: "版面 A／B 編輯及發佈",
          href: "/management?module=home-content",
        },
      }
    );

    // 另一個工作入口 card (course management), present for any management
    // capability; canonical entry URL.
    assert.deepStrictEqual(view.entryCard, {
      key: "course-management",
      label: "前往課程管理",
      description: "課程 tab 內以管理模式選擇課程，再進入 Course Cockpit。",
      href: "/programs?mode=management",
    });
  });

  test("Staff without home.publish sees 5 rows; 內容與系統 omitted entirely", async () => {
    const admin = await login("alice", "alice-secret");
    const staff = await login("staff", "staff-secret");
    const suffix = crypto.randomUUID().slice(0, 8);
    const departmentId = await createDepartment(admin, `HUB-STAFF-${suffix}`);
    await createProgram(admin, departmentId, `Staff-${suffix}`);

    const view = await hubProjection(staff);
    assertNoCareRow(view);

    // Staff holds every row via role except home.publish (Admin-only seed);
    // the 內容與系統 group holds only home-content, so it is omitted whole.
    assert.deepStrictEqual(
      view.groups.map(({ key, label }) => ({ key, label })),
      EXPECTED_GROUP_ORDER.slice(0, 2)
    );
    assert.deepStrictEqual(
      view.groups.map(rowKeys),
      [
        ["approvals", "permissions"],
        ["departments", "attendance", "members"],
      ]
    );
    assert.ok(view.entryCard, "Staff keeps the course-management entry card");
  });

  test("department-scoped Member sees only granted rows (departments, members, attendance)", async () => {
    const admin = await login("alice", "alice-secret");
    const manager = await login("carol", "carol-secret");
    const suffix = crypto.randomUUID().slice(0, 8);
    const departmentId = await createDepartment(admin, `HUB-GRANT-${suffix}`);
    await createProgram(admin, departmentId, `Grant-${suffix}`);

    const grant = await worker.fetch(
      request(`/api/v1/programs/departments/${departmentId}/managers`, admin, {
        method: "POST",
        body: { user_id: "U003" },
      }),
      testEnv()
    );
    assert.strictEqual(grant.status, 200);

    const view = await hubProjection(manager);
    assertNoCareRow(view);

    // Member role grants nothing; the department grant exposes the
    // department.manage surface (departments + members) and effective
    // program.manage over the attendance-enabled department's program.
    assert.deepStrictEqual(
      view.groups.map(({ key, label }) => ({ key, label })),
      [{ key: "ministry-operations", label: "事工營運" }]
    );
    assert.deepStrictEqual(view.groups.map(rowKeys), [
      ["departments", "attendance", "members"],
    ]);
    assert.ok(view.entryCard, "department scope keeps the entry card");
  });

  test("attendance row requires an attendance-enabled module", async () => {
    const admin = await login("alice", "alice-secret");
    const dora = await login("dora", "dora-secret");
    const suffix = crypto.randomUUID().slice(0, 8);
    // program_catalog only — no attendance module. Dora holds no other grant
    // in the shared test DB, so her effective scope is exactly this
    // department (role grants nothing for a Member).
    const departmentId = await createDepartment(admin, `HUB-NOATT-${suffix}`, {
      attendance: false,
    });
    await createProgram(admin, departmentId, `NoAtt-${suffix}`);
    const grant = await worker.fetch(
      request(`/api/v1/programs/departments/${departmentId}/managers`, admin, {
        method: "POST",
        body: { user_id: "U007" },
      }),
      testEnv()
    );
    assert.strictEqual(grant.status, 200);

    const view = await hubProjection(dora);
    assertNoCareRow(view);

    // department.manage scope exposes departments + members; the attendance
    // row stays absent because no program in an attendance-enabled department
    // is within Dora's effective program.manage scope.
    assert.deepStrictEqual(
      view.groups.map(({ key, label }) => ({ key, label })),
      [{ key: "ministry-operations", label: "事工營運" }]
    );
    assert.deepStrictEqual(view.groups.map(rowKeys), [
      ["departments", "members"],
    ]);
    assert.ok(view.entryCard, "department scope keeps the entry card");
  });

  test("plain Member (no management access) gets an empty projection", async () => {
    const member = await login("bob", "bob-secret");
    const view = await hubProjection(member);
    assertNoCareRow(view);
    assert.deepStrictEqual(view.groups, []);
    assert.strictEqual(view.entryCard, null);
  });
});
