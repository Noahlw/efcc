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
  "Status",
];

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...(env as unknown as Env),
    EFCC_ACCESS_TOKEN_SECRET: SECRET,
    ...overrides,
  };
}

function request(path: string, access: string): Request {
  return new Request(`${HOST}${path}`, {
    headers: {
      Origin: HOST,
      Cookie: `${ACCESS_COOKIE_NAME}=${access}`,
    },
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
    .find((value: string) => value.startsWith(`${ACCESS_COOKIE_NAME}=`));
  assert.ok(cookie);
  return cookie.split(";")[0].slice(ACCESS_COOKIE_NAME.length + 1);
}
async function ensureIdentity(
  stableKey: "admin" | "staff",
  accountUserId: string
): Promise<void> {
  const roleDefinitionId = `account-directory-${stableKey}`;
  const now = new Date().toISOString();
  await testDb()
    .prepare(
      `INSERT OR IGNORE INTO role_definitions
        (role_definition_id, category_key, stable_key, label, description,
         scope_kind, scope_id, position, is_protected, is_archived,
         created_by, created_at, updated_by, updated_at)
       VALUES (?, 'Global', ?, ?, 'Account Directory test identity',
               'Global', NULL, ?, ?, 0, NULL, ?, NULL, ?)`
    )
    .bind(
      roleDefinitionId,
      stableKey,
      stableKey === "admin" ? "系統管理員" : "同工",
      stableKey === "admin" ? 0 : 1,
      stableKey === "admin" ? 1 : 0,
      now,
      now
    )
    .run();
  if (stableKey === "staff") {
    await testDb()
      .prepare(
        `INSERT OR IGNORE INTO role_definition_grants
          (role_definition_id, capability, granted_by, granted_at)
         VALUES (?, 'account.directory.read', NULL, ?)`
      )
      .bind(roleDefinitionId, now)
      .run();
  }
  await testDb()
    .prepare(
      `INSERT OR IGNORE INTO role_assignments
        (assignment_id, account_user_id, role_definition_id, granted_by,
         granted_at, scope_kind, scope_id)
       SELECT ?, ?, role_definition_id, 'AD001', ?, scope_kind, scope_id
         FROM role_definitions
        WHERE role_definition_id = ?`
    )
    .bind(
      `account-directory-assignment-${stableKey}`,
      accountUserId,
      now,
      roleDefinitionId
    )
    .run();
}

interface AccountRow {
  userId: string;
  name: string;
  username: string | null;
  phone: string | null;
  identities: { label: string; scopeKind: string; scopeLabel: string | null }[];
  status: string;
  departments: { id: string; name: string }[];
  canOpenAccess: boolean;
}

interface AccountBody {
  requestId: string;
  data: {
    accounts: AccountRow[];
    nextCursor: string | null;
    summary: {
      total: number;
      active: number;
      elevated: number;
      pending: number;
    };
  };
}

describe("S4-02: Account Directory contract", () => {
  let adminAccess: string;
  let staffAccess: string;
  let memberAccess: string;

  beforeAll(async () => {
    await applyMigrations();
    await importLegacyUsers(testDb(), [
      HEADER,
      ["AD001", "Directory Admin", "ad-admin", "1111", "Active"],
      ["AD002", "Directory Staff", "ad-staff", "2222", "Active"],
      ["AD003", "Directory Member", "ad-member", "3333", "Active"],
      ["AD004", "Directory Pending", "ad-pending", "4444", "Pending"],
    ]);
    await ensureIdentity("admin", "AD001");
    await ensureIdentity("staff", "AD002");
    await Promise.all(
      (
        [
          ["AD001", "1111", "ad-admin-secret"],
          ["AD002", "2222", "ad-staff-secret"],
          ["AD003", "3333", "ad-member-secret"],
        ] as const
      ).map(([userId, legacyPin, newCredential]) =>
        completeCredentialUpgrade(testDb(), {
          userId,
          legacyPin,
          newCredential,
        })
      )
    );
    await testDb()
      .prepare("UPDATE accounts SET phone = ? WHERE user_id = ?")
      .bind("9123 4567", "AD001")
      .run();
    adminAccess = await login("ad-admin", "ad-admin-secret");
    staffAccess = await login("ad-staff", "ad-staff-secret");
    memberAccess = await login("ad-member", "ad-member-secret");
  });

  test("opens with a bounded default page and deterministic cursor", async () => {
    const firstResponse = await worker.fetch(
      request("/api/v1/programs/accounts?limit=2", adminAccess),
      testEnv()
    );
    assert.strictEqual(firstResponse.status, 200);
    const first = (await firstResponse.json()) as AccountBody;
    assert.deepStrictEqual(
      first.data.accounts.map((account) => account.userId),
      ["AD001", "AD003"]
    );
    assert.strictEqual(first.data.nextCursor, "2");
    assert.strictEqual(first.data.summary.total, 4);

    const secondResponse = await worker.fetch(
      request(
        `/api/v1/programs/accounts?limit=2&cursor=${first.data.nextCursor}`,
        adminAccess
      ),
      testEnv()
    );
    assert.strictEqual(secondResponse.status, 200);
    const second = (await secondResponse.json()) as AccountBody;
    assert.deepStrictEqual(
      second.data.accounts.map((account) => account.userId),
      ["AD004", "AD002"]
    );
    assert.strictEqual(second.data.nextCursor, null);
  });

  test("rejects malformed Account Directory cursors", async () => {
    const response = await worker.fetch(
      request("/api/v1/programs/accounts?cursor=not-a-cursor", adminAccess),
      testEnv()
    );
    assert.strictEqual(response.status, 422);
  });

  test("Admin sees active and pending Accounts with real summary counts", async () => {
    const response = await worker.fetch(
      request("/api/v1/programs/accounts?q=Directory", adminAccess),
      testEnv()
    );
    assert.strictEqual(response.status, 200);
    const body = (await response.json()) as AccountBody;
    assert.strictEqual(body.requestId, response.headers.get("X-Request-Id"));
    assert.strictEqual(body.data.summary.total, 4);
    assert.strictEqual(body.data.summary.active, 3);
    assert.strictEqual(body.data.summary.elevated, 2);
    assert.strictEqual(body.data.summary.pending, 1);
    assert.ok(
      body.data.accounts.some((account) => account.status === "Pending")
    );
    assert.strictEqual(body.data.accounts[0]?.username, "ad-admin");
    assert.strictEqual(body.data.accounts[0]?.canOpenAccess, false);
    assert.strictEqual(
      body.data.accounts.find((account) => account.userId === "AD002")
        ?.canOpenAccess,
      true
    );

    const detail = await worker.fetch(
      request("/api/v1/programs/accounts/AD004", adminAccess),
      testEnv()
    );
    assert.strictEqual(detail.status, 200);
    const detailBody = (await detail.json()) as {
      data: {
        userId: string;
        name: string;
        username: string;
        phone: string | null;
        status: string;
        identities: {
          id: string;
          label: string;
          stableKey: string;
          scopeKind: "Global" | "Department" | "Program";
          scopeId: string | null;
        }[];
        departments: { id: string; name: string }[];
        canOpenAccess: boolean;
      };
    };
    assert.deepStrictEqual(detailBody.data, {
      userId: "AD004",
      name: "Directory Pending",
      username: "ad-pending",
      phone: null,
      identities: [],
      status: "Pending",
      canOpenAccess: false,
      departments: [],
    });
  });

  test("Staff can filter the Account Directory by status", async () => {
    const response = await worker.fetch(
      request(
        "/api/v1/programs/accounts?q=Directory&status=Active",
        staffAccess
      ),
      testEnv()
    );
    assert.strictEqual(response.status, 200);
    const body = (await response.json()) as AccountBody;
    assert.ok(body.data.accounts.some((a) => a.userId === "AD002"));
    assert.ok(body.data.accounts.every((a) => a.status === "Active"));
    const staff = body.data.accounts.find((a) => a.userId === "AD002");
    assert.strictEqual(staff?.canOpenAccess, false);
  });
  test("Member baseline access is included in active Directory results", async () => {
    const response = await worker.fetch(
      request(
        "/api/v1/programs/accounts?q=Directory&status=Active",
        staffAccess
      ),
      testEnv()
    );
    assert.strictEqual(response.status, 200);
    const body = (await response.json()) as AccountBody;
    assert.ok(body.data.accounts.some((a) => a.userId === "AD003"));
    const member = body.data.accounts.find((a) => a.userId === "AD003");
    assert.ok(member);
    assert.ok(Array.isArray(member.identities));
  });

  test("filters the Account Directory without requiring a search term", async () => {
    const response = await worker.fetch(
      request("/api/v1/programs/accounts?status=Active", staffAccess),
      testEnv()
    );
    assert.strictEqual(response.status, 200);
    const body = (await response.json()) as AccountBody;
    assert.ok(body.data.accounts.some((a) => a.userId === "AD002"));
    assert.ok(body.data.accounts.every((a) => a.status === "Active"));
  });

  test("Member is forbidden from the church-wide Account Directory", async () => {
    const response = await worker.fetch(
      request("/api/v1/programs/accounts?q=Directory", memberAccess),
      testEnv()
    );
    assert.strictEqual(response.status, 403);
  });
});
