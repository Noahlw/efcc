import assert from "node:assert/strict";

import { env } from "cloudflare:workers";
import { beforeAll, describe, test } from "vitest";
/* oxlint-disable vitest/require-top-level-describe -- workerd/D1 fixture setup is shared by the contract file. */

import worker from "../../worker";
import type { Env } from "../../worker";
import { importLegacyUsers } from "./accounts";
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from "./cookies";
import { applyMigrations, testDb } from "./test-bootstrap";
import { completeCredentialUpgrade } from "./upgrade";

const SECRET = "test-batch-access-token-secret";
const HOST = "https://efcc.example";

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...(env as unknown as Env),
    EFCC_ACCESS_TOKEN_SECRET: SECRET,
    ...overrides,
  };
}

function authRequest(
  path: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {}
): Request {
  return new Request(`${HOST}${path}`, {
    method: init.method ?? "POST",
    headers: init.headers ?? {},
    body:
      init.body === undefined
        ? undefined
        : typeof init.body === "string"
          ? init.body
          : JSON.stringify(init.body),
  });
}

function cookieValue(raw: string | null): string {
  assert.ok(raw);
  return raw.split(";")[0].split("=").slice(1).join("=");
}

async function accessCookieFor(
  username: string,
  password: string
): Promise<string> {
  const response = await worker.fetch(
    authRequest("/api/v1/auth/login", {
      headers: { Origin: HOST, "Content-Type": "application/json" },
      body: { username, password },
    }),
    testEnv()
  );
  assert.strictEqual(response.status, 200);
  const cookies = response.headers.getSetCookie();
  const access = cookies.find((value) =>
    value.startsWith(`${ACCESS_COOKIE_NAME}=`)
  );
  assert.ok(access);
  assert.ok(
    cookies.some((value) => value.startsWith(`${REFRESH_COOKIE_NAME}=`))
  );
  return cookieValue(access);
}

async function registrationIdFor(username: string): Promise<string> {
  const row = await testDb()
    .prepare(
      "SELECT request_id FROM registration_requests WHERE username_normalized = ?"
    )
    .bind(username.trim().toLowerCase())
    .first<{ request_id: string }>();
  assert.ok(row);
  return row.request_id;
}

async function registerFor(
  username: string,
  password: string,
  name: string
): Promise<string> {
  const response = await worker.fetch(
    authRequest("/api/v1/auth/register", {
      headers: { Origin: HOST, "Idempotency-Key": `register-${username}` },
      body: { username, password, name, phone: "9123 4000" },
    }),
    testEnv()
  );
  assert.strictEqual(response.status, 200);
  return registrationIdFor(username);
}

async function problemCode(response: Response): Promise<string> {
  const body = (await response.json()) as { code: string };
  return body.code;
}

let adminAccess = "";

beforeAll(async () => {
  await applyMigrations();
  await importLegacyUsers(testDb(), [
    ["User_ID", "Name", "Username", "PIN_Code", "System_Role", "Status"],
    ["BATCH-ADMIN", "Batch Admin", "batch-admin", "8888", "Admin", "Active"],
  ]);
  await completeCredentialUpgrade(testDb(), {
    userId: "BATCH-ADMIN",
    legacyPin: "8888",
    newCredential: "batch-admin-secret",
  });
  const db = testDb();
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO role_definitions
          (role_definition_id, category_key, stable_key, label, description,
           scope_kind, scope_id, position, is_protected, is_archived,
           created_by, created_at, updated_by, updated_at)
         VALUES ('batch-registration-approval-role', 'Global',
                 'batch-registration-approval', '批次審批身份組',
                 'Global registration approval fixture',
                 'Global', NULL, 1, 0, 0, NULL, ?, NULL, ?)`
      )
      .bind(now, now),
    db
      .prepare(
        `INSERT OR IGNORE INTO role_definition_grants
          (role_definition_id, capability, granted_by, granted_at)
         VALUES ('batch-registration-approval-role',
                 'registration.approval.manage', NULL, ?)`
      )
      .bind(now),
    db
      .prepare(
        `INSERT OR IGNORE INTO role_assignments
          (assignment_id, account_user_id, role_definition_id, granted_by,
           granted_at, scope_kind, scope_id)
         VALUES ('batch-registration-approval-assignment', 'BATCH-ADMIN',
                 'batch-registration-approval-role', 'BATCH-ADMIN', ?,
                 'Global', NULL)`
      )
      .bind(now),
  ]);
  adminAccess = await accessCookieFor("batch-admin", "batch-admin-secret");
});

describe("S4H-04: atomic registration batch approval", () => {
  test("migration creates the durable batch idempotency table", async () => {
    const row = await testDb()
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'registration_batch_idempotency'"
      )
      .first<{ name: string }>();
    assert.strictEqual(row?.name, "registration_batch_idempotency");
  });

  test("approves a selected set atomically with one audit per request", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const ids = await Promise.all([
      registerFor(`batch-a-${suffix}`, "batch-a-password", "批次甲"),
      registerFor(`batch-b-${suffix}`, "batch-b-password", "批次乙"),
    ]);
    const response = await worker.fetch(
      authRequest("/api/v1/auth/registrations/approve-batch", {
        headers: {
          Origin: HOST,
          Cookie: `efcc_access=${adminAccess}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `batch-${suffix}`,
        },
        body: { requestIds: ids },
      }),
      testEnv()
    );
    assert.strictEqual(response.status, 200);
    const body = (await response.json()) as {
      data: { approvedCount: number; accountStatus: string };
    };
    assert.deepStrictEqual(body.data, {
      accountStatus: "active",
      approvedCount: 2,
    });
    const pending = await testDb()
      .prepare(
        "SELECT COUNT(*) AS count FROM registration_requests WHERE request_id IN (?, ?) AND account_status = 'Pending'"
      )
      .bind(...ids)
      .first<{ count: number }>();
    assert.strictEqual(Number(pending?.count ?? 0), 0);
    const accounts = await testDb()
      .prepare(
        "SELECT COUNT(*) AS count FROM accounts WHERE user_id IN (SELECT user_id FROM registration_requests WHERE request_id IN (?, ?))"
      )
      .bind(...ids)
      .first<{ count: number }>();
    assert.strictEqual(Number(accounts?.count ?? 0), 2);
    const audits = await testDb()
      .prepare(
        "SELECT COUNT(*) AS count FROM audit_events WHERE action = 'REGISTRATION_BATCH_APPROVE' AND entity_type = 'registration' AND entity_id IN (?, ?) AND outcome = 'SUCCESS'"
      )
      .bind(...ids)
      .first<{ count: number }>();
    assert.strictEqual(Number(audits?.count ?? 0), 2);
  });

  test("replays the same key without duplicate accounts or audit rows", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const ids = await Promise.all([
      registerFor(
        `batch-replay-a-${suffix}`,
        "batch-replay-a-password",
        "重播甲"
      ),
      registerFor(
        `batch-replay-b-${suffix}`,
        "batch-replay-b-password",
        "重播乙"
      ),
    ]);
    const headers = {
      Origin: HOST,
      Cookie: `efcc_access=${adminAccess}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `batch-replay-${suffix}`,
    };
    const first = await worker.fetch(
      authRequest("/api/v1/auth/registrations/approve-batch", {
        headers,
        body: { requestIds: ids },
      }),
      testEnv()
    );
    const second = await worker.fetch(
      authRequest("/api/v1/auth/registrations/approve-batch", {
        headers,
        body: { requestIds: [ids[1], ids[0]] },
      }),
      testEnv()
    );
    assert.strictEqual(first.status, 200);
    assert.strictEqual(second.status, 200);
    const stored = await testDb()
      .prepare(
        "SELECT COUNT(*) AS count FROM registration_batch_idempotency WHERE actor_user_id = 'BATCH-ADMIN' AND idempotency_key = ?"
      )
      .bind(`batch-replay-${suffix}`)
      .first<{ count: number }>();
    assert.strictEqual(Number(stored?.count ?? 0), 1);
    const audits = await testDb()
      .prepare(
        "SELECT COUNT(*) AS count FROM audit_events WHERE action = 'REGISTRATION_BATCH_APPROVE' AND entity_id IN (?, ?)"
      )
      .bind(...ids)
      .first<{ count: number }>();
    assert.strictEqual(Number(audits?.count ?? 0), 2);
  });

  test("a stale selected request rolls back the entire batch", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const ids = await Promise.all([
      registerFor(
        `batch-stale-a-${suffix}`,
        "batch-stale-a-password",
        "過期甲"
      ),
      registerFor(
        `batch-stale-b-${suffix}`,
        "batch-stale-b-password",
        "過期乙"
      ),
    ]);
    const single = await worker.fetch(
      authRequest(`/api/v1/auth/registrations/${ids[0]}/approve`, {
        headers: {
          Origin: HOST,
          Cookie: `efcc_access=${adminAccess}`,
          "Idempotency-Key": `single-before-batch-${suffix}`,
        },
      }),
      testEnv()
    );
    assert.strictEqual(single.status, 200);
    const batch = await worker.fetch(
      authRequest("/api/v1/auth/registrations/approve-batch", {
        headers: {
          Origin: HOST,
          Cookie: `efcc_access=${adminAccess}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `batch-stale-${suffix}`,
        },
        body: { requestIds: ids },
      }),
      testEnv()
    );
    assert.strictEqual(batch.status, 409);
    assert.strictEqual(await problemCode(batch), "CONFLICT");
    const pending = await testDb()
      .prepare(
        "SELECT account_status FROM registration_requests WHERE request_id = ?"
      )
      .bind(ids[1])
      .first<{ account_status: string }>();
    assert.strictEqual(pending?.account_status, "Pending");
    const account = await testDb()
      .prepare(
        "SELECT user_id FROM accounts WHERE user_id = (SELECT user_id FROM registration_requests WHERE request_id = ?)"
      )
      .bind(ids[1])
      .first<{ user_id: string }>();
    assert.strictEqual(account, null);
  });

  test("rejects duplicate IDs before any write", async () => {
    const id = await registerFor(
      `batch-duplicate-${crypto.randomUUID().slice(0, 8)}`,
      "batch-duplicate-password",
      "重複選取"
    );
    const response = await worker.fetch(
      authRequest("/api/v1/auth/registrations/approve-batch", {
        headers: {
          Origin: HOST,
          Cookie: `efcc_access=${adminAccess}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `batch-duplicate-${id}`,
        },
        body: { requestIds: [id, id] },
      }),
      testEnv()
    );
    assert.strictEqual(response.status, 422);
    assert.strictEqual(await problemCode(response), "VALIDATION");
  });

  test("lists processed requests without exposing credential material", async () => {
    const response = await worker.fetch(
      authRequest("/api/v1/auth/registrations?status=Processed", {
        method: "GET",
        headers: { Origin: HOST, Cookie: `efcc_access=${adminAccess}` },
      }),
      testEnv()
    );
    assert.strictEqual(response.status, 200);
    const body = (await response.json()) as {
      data: { status: string; registrations: Record<string, unknown>[] };
    };
    assert.strictEqual(body.data.status, "Processed");
    assert.ok(body.data.registrations.length > 0);
    for (const registration of body.data.registrations) {
      assert.equal("credentialHash" in registration, false);
      assert.equal("userId" in registration, false);
    }
  });
});
