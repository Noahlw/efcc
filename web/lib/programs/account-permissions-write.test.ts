/**
 * S4-05 #454 — Permission Policy mutation Worker/D1 contract.
 *
 * These tests deliberately exercise the real Worker boundary and disposable
 * D1 binding. They are the red slice for the atomic versioned change set:
 * authorization, stale-revision CAS, idempotency, safety invariants, and audit.
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
  access: string,
  init: {
    method?: string;
    body?: unknown;
    idempotencyKey?: string;
  } = {}
): Request {
  const headers: Record<string, string> = {
    Origin: HOST,
    Cookie: `${ACCESS_COOKIE_NAME}=${access}`,
  };
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (init.idempotencyKey !== undefined) {
    headers["Idempotency-Key"] = init.idempotencyKey;
  }
  return new Request(`${HOST}/api/v1/programs/account-permissions`, {
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

async function readPolicy(access: string) {
  const response = await worker.fetch(request(access), testEnv());
  assert.strictEqual(response.status, 200);
  return (await response.json()) as {
    data: {
      policy: {
        revision: number;
        capabilities: Array<{
          key: string;
          roles: Record<string, { value: boolean }>;
        }>;
      };
    };
  };
}

describe("S4-05: Permission Policy atomic write", () => {
  let adminAccess: string;
  let staffAccess: string;

  beforeAll(async () => {
    await applyMigrations();
    await importLegacyUsers(testDb(), [
      HEADER,
      ["S405-A001", "S4-05 Admin", "s405-admin", "1111", "Admin", "Active"],
      ["S405-A002", "S4-05 Staff", "s405-staff", "2222", "Staff", "Active"],
    ]);
    await Promise.all(
      ([
        ["S405-A001", "1111", "s405-admin-password"],
        ["S405-A002", "2222", "s405-staff-password"],
      ] as const).map(([userId, legacyPin, newCredential]) =>
        completeCredentialUpgrade(testDb(), {
          userId,
          legacyPin,
          newCredential,
        })
      )
    );
    adminAccess = await login("s405-admin", "s405-admin-password");
    staffAccess = await login("s405-staff", "s405-staff-password");
  });

  test("Admin commits one versioned change set and replays it idempotently", async () => {
    const before = await readPolicy(adminAccess);
    const key = "s405-atomic-success-1";
    const body = {
      baseRevision: before.data.policy.revision,
      changes: [
        {
          role: "staff",
          capability: "account.directory.read",
          value: false,
        },
      ],
    };

    const first = await worker.fetch(
      request(adminAccess, { method: "POST", body, idempotencyKey: key }),
      testEnv()
    );
    assert.strictEqual(first.status, 200);
    const firstBody = (await first.json()) as {
      data: {
        mutation: { idempotent: boolean; revision: number };
        policy: { revision: number };
      };
    };
    assert.strictEqual(firstBody.data.mutation.idempotent, false);
    assert.strictEqual(
      firstBody.data.policy.revision,
      before.data.policy.revision + 1
    );

    const replay = await worker.fetch(
      request(adminAccess, { method: "POST", body, idempotencyKey: key }),
      testEnv()
    );
    assert.strictEqual(replay.status, 200);
    const replayBody = (await replay.json()) as {
      data: {
        mutation: { idempotent: boolean; revision: number };
        policy: { revision: number };
      };
    };
    assert.strictEqual(replayBody.data.mutation.idempotent, true);
    assert.strictEqual(
      replayBody.data.policy.revision,
      firstBody.data.policy.revision
    );

    const row = await testDb()
      .prepare(
        "SELECT COUNT(*) AS count FROM role_capabilities WHERE role = 'Staff' AND capability = 'account.directory.read'"
      )
      .first<{ count: number }>();
    assert.strictEqual(row?.count, 0);
  });

  test("stale revision returns 409 and leaves the whole policy unchanged", async () => {
    const before = await readPolicy(adminAccess);
    const staleRevision = before.data.policy.revision - 1;
    const response = await worker.fetch(
      request(adminAccess, {
        method: "POST",
        idempotencyKey: "s405-stale-1",
        body: {
          baseRevision: staleRevision,
          changes: [
            {
              role: "staff",
              capability: "registration.approval.manage",
              value: false,
            },
          ],
        },
      }),
      testEnv()
    );
    assert.strictEqual(response.status, 409);
    const problem = (await response.json()) as {
      code: string;
      currentRevision: number;
    };
    assert.strictEqual(problem.code, "POLICY_REVISION_CONFLICT");
    assert.strictEqual(problem.currentRevision, before.data.policy.revision);

    const after = await readPolicy(adminAccess);
    assert.deepStrictEqual(after.data.policy, before.data.policy);
    const audit = await testDb()
      .prepare(
        `SELECT outcome FROM audit_events
          WHERE action = 'PERMISSION_POLICY_UPDATE'
            AND correlation_id = 's405-stale-1'
          ORDER BY inserted_at DESC LIMIT 1`
      )
      .first<{ outcome: string }>();
    assert.strictEqual(audit?.outcome, "CONFLICT");
  });

  test("reusing a key for another payload is rejected without a second write", async () => {
    const before = await readPolicy(adminAccess);
    const response = await worker.fetch(
      request(adminAccess, {
        method: "POST",
        idempotencyKey: "s405-atomic-success-1",
        body: {
          baseRevision: before.data.policy.revision,
          changes: [
            {
              role: "staff",
              capability: "registration.approval.manage",
              value: false,
            },
          ],
        },
      }),
      testEnv()
    );
    assert.strictEqual(response.status, 409);
    const problem = (await response.json()) as { code: string };
    assert.strictEqual(problem.code, "IDEMPOTENCY_CONFLICT");
    const after = await readPolicy(adminAccess);
    assert.deepStrictEqual(after.data.policy, before.data.policy);
    const audit = await testDb()
      .prepare(
        `SELECT outcome FROM audit_events
          WHERE action = 'PERMISSION_POLICY_UPDATE'
            AND correlation_id = 's405-atomic-success-1'
            AND outcome = 'CONFLICT'
          ORDER BY inserted_at DESC LIMIT 1`
      )
      .first<{ outcome: string }>();
    assert.strictEqual(audit?.outcome, "CONFLICT");
  });

  test("server rejects safety invariant changes without partial writes", async () => {
    const before = await readPolicy(adminAccess);
    const response = await worker.fetch(
      request(adminAccess, {
        method: "POST",
        idempotencyKey: "s405-safety-1",
        body: {
          baseRevision: before.data.policy.revision,
          changes: [
            {
              role: "staff",
              capability: "registration.approval.manage",
              value: false,
            },
            {
              role: "member",
              capability: "department.manage",
              value: true,
            },
          ],
        },
      }),
      testEnv()
    );
    assert.strictEqual(response.status, 422);
    const problem = (await response.json()) as { code: string };
    assert.strictEqual(problem.code, "POLICY_SAFETY_VIOLATION");
    const after = await readPolicy(adminAccess);
    assert.deepStrictEqual(after.data.policy, before.data.policy);
  });

  test("Staff is denied by the server and the attempted mutation is audited", async () => {
    const before = await readPolicy(adminAccess);
    const response = await worker.fetch(
      request(staffAccess, {
        method: "POST",
        idempotencyKey: "s405-denied-1",
        body: {
          baseRevision: before.data.policy.revision,
          changes: [
            {
              role: "staff",
              capability: "registration.approval.manage",
              value: false,
            },
          ],
        },
      }),
      testEnv()
    );
    assert.strictEqual(response.status, 403);
    const problem = (await response.json()) as { code: string };
    assert.strictEqual(problem.code, "FORBIDDEN");
    const audit = await testDb()
      .prepare(
        `SELECT outcome FROM audit_events
          WHERE action = 'PERMISSION_POLICY_UPDATE'
            AND correlation_id = 's405-denied-1'
          ORDER BY inserted_at DESC LIMIT 1`
      )
      .first<{ outcome: string }>();
    assert.strictEqual(audit?.outcome, "DENIED");
  });
});
