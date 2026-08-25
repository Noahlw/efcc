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

interface AccountRow {
  userId: string;
  name: string;
  username: string | null;
  phone: string | null;
  role: string;
  status: string;
  departments: { id: string; name: string }[];
}

interface AccountBody {
  requestId: string;
  data: {
    accounts: AccountRow[];
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
      ["AD001", "Directory Admin", "ad-admin", "1111", "Admin", "Active"],
      ["AD002", "Directory Staff", "ad-staff", "2222", "Staff", "Active"],
      ["AD003", "Directory Member", "ad-member", "3333", "Member", "Active"],
      ["AD004", "Directory Pending", "ad-pending", "4444", "Member", "Pending"],
    ]);
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
  });

  test("Staff can filter the Account Directory by role and status", async () => {
    const response = await worker.fetch(
      request(
        "/api/v1/programs/accounts?q=Directory&role=Staff&status=Active",
        staffAccess
      ),
      testEnv()
    );
    assert.strictEqual(response.status, 200);
    const body = (await response.json()) as AccountBody;
    assert.deepStrictEqual(
      body.data.accounts.map((account) => account.userId),
      ["AD002"]
    );
  });

  test("Member is forbidden from the church-wide Account Directory", async () => {
    const response = await worker.fetch(
      request("/api/v1/programs/accounts?q=Directory", memberAccess),
      testEnv()
    );
    assert.strictEqual(response.status, 403);
  });
});
