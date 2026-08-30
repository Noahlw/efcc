import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, test } from "vitest";

import worker from "../../worker";
import type { Env } from "../../worker";
import { ACCESS_COOKIE_NAME } from "../auth/cookies";
import { signAccessToken } from "../auth/sessions";
import { applyMigrations, testDb } from "../auth/test-bootstrap";
import { seedDisposableIdentity } from "./index";

const SECRET = "account-access-handler-test-secret";
const HOST = "https://efcc.example";
const ADMIN = "E2E_DISPOSABLE_ADMIN";
const STAFF = "E2E_DISPOSABLE_STAFF";
const DEPARTMENT_ROLE = "018f3b8a-0000-7000-8000-100000000001";
const PROGRAM_ROLE = "018f3b8a-0000-7000-8000-100000000002";

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...(env as unknown as Env),
    EFCC_ACCESS_TOKEN_SECRET: SECRET,
    ...overrides,
  };
}

function request(
  path: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {}
): Request {
  return new Request(`${HOST}${path}`, {
    method: init.method ?? "GET",
    headers: init.headers ?? {},
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

async function cookieFor(userId: string): Promise<string> {
  return signAccessToken(SECRET, {
    sid: `account-access-${userId}`,
    uid: userId,
    iat: Date.now(),
  });
}

async function revision(): Promise<number> {
  const row = await testDb()
    .prepare("SELECT revision FROM role_policy_revisions WHERE id = 1")
    .first<{ revision: number }>();
  return row?.revision ?? 1;
}

async function problem(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

let adminCookie = "";
let memberCookie = "";

beforeAll(async () => {
  await applyMigrations();
  await seedDisposableIdentity(testDb(), {
    databaseName: "E2E_account-access-handlers",
  });
  adminCookie = await cookieFor(ADMIN);
  memberCookie = await cookieFor("E2E_DISPOSABLE_MEMBER");
});

describe("#486 Account Access handlers", () => {
  test("all routes require the cookie-only actor", async () => {
    const responses = await Promise.all([
      worker.fetch(request("/api/v1/identity/accounts"), testEnv()),
      worker.fetch(
        request(`/api/v1/identity/accounts/${STAFF}/assignments`),
        testEnv()
      ),
      worker.fetch(
        request(`/api/v1/identity/accounts/${STAFF}/assignments`, {
          method: "POST",
        }),
        testEnv()
      ),
      worker.fetch(
        request(`/api/v1/identity/role-definitions/${PROGRAM_ROLE}/lifecycle`, {
          method: "POST",
        }),
        testEnv()
      ),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.headers.get("X-Request-Id")).toBeTruthy();
      expect(response.headers.get("Content-Type")).toContain("problem+json");
    }
  });

  test("searches and reads with the exact safe response envelope", async () => {
    const headers = { Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}` };
    const search = await worker.fetch(
      request("/api/v1/identity/accounts?q=Disposable&offset=0&limit=20", {
        headers,
      }),
      testEnv()
    );
    expect(search.status).toBe(200);
    const searchBody = (await search.json()) as {
      requestId: string;
      data: { accounts: unknown[]; nextOffset: number | null };
    };
    expect(searchBody.requestId).toBe(search.headers.get("X-Request-Id"));
    expect(Array.isArray(searchBody.data.accounts)).toBe(true);
    expect(JSON.stringify(searchBody)).not.toMatch(
      /credential|phone|attendance|pastoral/i
    );

    const detail = await worker.fetch(
      request(`/api/v1/identity/accounts/${STAFF}/assignments`, { headers }),
      testEnv()
    );
    expect(detail.status).toBe(200);
    const detailBody = (await detail.json()) as {
      requestId: string;
      data: { account: { userId: string; status: string }; revision: number };
    };
    expect(detailBody.requestId).toBe(detail.headers.get("X-Request-Id"));
    expect(detailBody.data.account).toMatchObject({
      userId: STAFF,
      status: "Active",
    });
    expect(typeof detailBody.data.revision).toBe("number");
  });

  test("rejects ambiguous empty grant body and accepts the explicit revoke route", async () => {
    const headers = {
      Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "account-access-handler-empty",
    };
    const empty = await worker.fetch(
      request(`/api/v1/identity/accounts/${STAFF}/assignments`, {
        method: "POST",
        headers,
        body: { base_revision: await revision(), role_definition_ids: [] },
      }),
      testEnv()
    );
    expect(empty.status).toBe(422);
    expect((await problem(empty)).code).toBe("ROLE_INVALID_TARGET");
  });
  test("rejects oversized assignment arrays with canonical validation", async () => {
    const response = await worker.fetch(
      request(`/api/v1/identity/accounts/${STAFF}/assignments`, {
        method: "POST",
        headers: {
          Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
          "Content-Type": "application/json",
          "Idempotency-Key": "account-access-handler-too-many-roles",
        },
        body: {
          base_revision: await revision(),
          role_definition_ids: Array.from(
            { length: 51 },
            (_, index) => `unknown-role-${index}`
          ),
        },
      }),
      testEnv()
    );
    expect(response.status).toBe(422);
    const body = await problem(response);
    expect(body.code).toBe("VALIDATION");
    expect(body.detail).toBe(
      "role_definition_ids must contain at most 50 identities。"
    );
  });
  test("commits add and explicit revoke on one account with one envelope each", async () => {
    const cookieHeaders = {
      Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
      "Content-Type": "application/json",
    };
    const add = await worker.fetch(
      request(`/api/v1/identity/accounts/${STAFF}/assignments`, {
        method: "POST",
        headers: {
          ...cookieHeaders,
          "Idempotency-Key": "account-access-handler-add",
        },
        body: {
          base_revision: await revision(),
          role_definition_ids: [DEPARTMENT_ROLE],
        },
      }),
      testEnv()
    );
    expect(add.status).toBe(200);
    const addBody = (await add.json()) as {
      requestId: string;
      data: {
        revision: number;
        activeAssignments: { roleDefinitionId: string }[];
      };
    };
    expect(addBody.requestId).toBe(add.headers.get("X-Request-Id"));
    expect(
      addBody.data.activeAssignments.some(
        (item) => item.roleDefinitionId === DEPARTMENT_ROLE
      )
    ).toBe(true);

    const revoke = await worker.fetch(
      request(`/api/v1/identity/accounts/${STAFF}/assignments/revoke`, {
        method: "POST",
        headers: {
          ...cookieHeaders,
          "Idempotency-Key": "account-access-handler-revoke",
        },
        body: {
          base_revision: await revision(),
          role_definition_ids: [DEPARTMENT_ROLE],
        },
      }),
      testEnv()
    );
    expect(revoke.status).toBe(200);
    const revokeBody = (await revoke.json()) as {
      requestId: string;
      data: {
        activeAssignments: { roleDefinitionId: string }[];
        revokedAssignments: { roleDefinitionId: string }[];
      };
    };
    expect(revokeBody.requestId).toBe(revoke.headers.get("X-Request-Id"));
    expect(
      revokeBody.data.activeAssignments.some(
        (item) => item.roleDefinitionId === DEPARTMENT_ROLE
      )
    ).toBe(false);
    expect(
      revokeBody.data.revokedAssignments.some(
        (item) => item.roleDefinitionId === DEPARTMENT_ROLE
      )
    ).toBe(true);
  });

  test("authorizes before revealing unknown targets or lifecycle state", async () => {
    const headers = {
      Cookie: `${ACCESS_COOKIE_NAME}=${memberCookie}`,
      "Content-Type": "application/json",
    };
    const accountRead = await worker.fetch(
      request("/api/v1/identity/accounts/unknown-account/assignments", {
        headers,
      }),
      testEnv()
    );
    expect(accountRead.status).toBe(403);
    expect((await problem(accountRead)).code).toBe("ROLE_FORBIDDEN");

    const accountWrite = await worker.fetch(
      request("/api/v1/identity/accounts/unknown-account/assignments", {
        method: "POST",
        headers: { ...headers, "Idempotency-Key": "authorize-first-write" },
        body: {
          base_revision: await revision(),
          role_definition_ids: [DEPARTMENT_ROLE],
        },
      }),
      testEnv()
    );
    expect(accountWrite.status).toBe(403);
    expect((await problem(accountWrite)).code).toBe("ROLE_FORBIDDEN");

    const lifecycle = await worker.fetch(
      request(
        "/api/v1/identity/role-definitions/unknown-role-definition/lifecycle",
        {
          method: "POST",
          headers: {
            ...headers,
            "Idempotency-Key": "authorize-first-lifecycle",
          },
          body: { action: "archive", base_revision: await revision() },
        }
      ),
      testEnv()
    );
    expect(lifecycle.status).toBe(403);
    expect((await problem(lifecycle)).code).toBe("ROLE_FORBIDDEN");
  });

  test("returns ROLE_FORBIDDEN for self-targeting a lower identity", async () => {
    const response = await worker.fetch(
      request(`/api/v1/identity/accounts/${ADMIN}/assignments`, {
        method: "POST",
        headers: {
          Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
          "Content-Type": "application/json",
          "Idempotency-Key": "self-lower-role",
        },
        body: {
          base_revision: await revision(),
          role_definition_ids: [PROGRAM_ROLE],
        },
      }),
      testEnv()
    );
    expect(response.status).toBe(403);
    expect((await problem(response)).code).toBe("ROLE_FORBIDDEN");
  });

  test("previews lifecycle impact through the identity route", async () => {
    const response = await worker.fetch(
      request(
        `/api/v1/identity/role-definitions/${PROGRAM_ROLE}/lifecycle?action=archive`,
        { headers: { Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}` } }
      ),
      testEnv()
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      requestId: string;
      data: {
        action: string;
        impact: { lost: { Global: unknown[] } }[];
      };
    };
    expect(body.requestId).toBe(response.headers.get("X-Request-Id"));
    expect(body.data.action).toBe("archive");
    expect(body.data.impact.length).toBeGreaterThan(0);
  });

  test("archives and restores through the lifecycle route with revision-bound envelopes", async () => {
    const headers = () => ({
      Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
      "Content-Type": "application/json",
    });
    const archive = await worker.fetch(
      request(`/api/v1/identity/role-definitions/${PROGRAM_ROLE}/lifecycle`, {
        method: "POST",
        headers: {
          ...headers(),
          "Idempotency-Key": "account-access-handler-archive",
        },
        body: {
          action: "archive",
          base_revision: await revision(),
          reason: "retire",
        },
      }),
      testEnv()
    );
    expect(archive.status).toBe(200);
    const archiveBody = (await archive.json()) as {
      requestId: string;
      data: { isArchived: boolean; revision: number };
    };
    expect(archiveBody.requestId).toBe(archive.headers.get("X-Request-Id"));
    expect(archiveBody.data.isArchived).toBe(true);
    const archivedAttempt = await worker.fetch(
      request(`/api/v1/identity/accounts/${STAFF}/assignments`, {
        method: "POST",
        headers: {
          ...headers(),
          "Idempotency-Key": "account-access-handler-archived-assignment",
        },
        body: {
          base_revision: archiveBody.data.revision,
          role_definition_ids: [PROGRAM_ROLE],
        },
      }),
      testEnv()
    );
    expect(archivedAttempt.status).toBe(403);
    expect((await problem(archivedAttempt)).code).toBe("ROLE_ARCHIVED");
    const restore = await worker.fetch(
      request(`/api/v1/identity/role-definitions/${PROGRAM_ROLE}/lifecycle`, {
        method: "POST",
        headers: {
          ...headers(),
          "Idempotency-Key": "account-access-handler-restore",
        },
        body: { action: "restore", base_revision: await revision() },
      }),
      testEnv()
    );
    expect(restore.status).toBe(200);
    const restoreBody = (await restore.json()) as {
      requestId: string;
      data: { isArchived: boolean };
    };
    expect(restoreBody.requestId).toBe(restore.headers.get("X-Request-Id"));
    expect(restoreBody.data.isArchived).toBe(false);
  });
  test("replays original request IDs for success, denied, and conflict terminals", async () => {
    const adminHeaders = {
      Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
      "Content-Type": "application/json",
    };
    const successBody = {
      base_revision: await revision(),
      role_definition_ids: [DEPARTMENT_ROLE],
    };
    const success = await worker.fetch(
      request(`/api/v1/identity/accounts/${STAFF}/assignments`, {
        method: "POST",
        headers: {
          ...adminHeaders,
          "Idempotency-Key": "account-access-handler-replay-success",
        },
        body: successBody,
      }),
      testEnv()
    );
    expect(success.status).toBe(200);
    const successJson = (await success.json()) as {
      requestId: string;
      data: unknown;
    };
    const successReplay = await worker.fetch(
      request(`/api/v1/identity/accounts/${STAFF}/assignments`, {
        method: "POST",
        headers: {
          ...adminHeaders,
          "Idempotency-Key": "account-access-handler-replay-success",
        },
        body: successBody,
      }),
      testEnv()
    );
    expect(successReplay.status).toBe(200);
    const successReplayJson = (await successReplay.json()) as {
      requestId: string;
      data: unknown;
    };
    expect(successReplayJson.requestId).toBe(successJson.requestId);
    expect(successReplayJson.requestId).toBe(
      success.headers.get("X-Request-Id")
    );
    const successAudits = await testDb()
      .prepare(
        `SELECT COUNT(*) AS count FROM role_audit_events
          WHERE correlation_id IN (?, ?)`
      )
      .bind(successJson.requestId, successReplayJson.requestId)
      .first<{ count: number }>();
    expect(successAudits?.count).toBe(1);

    const memberHeaders = {
      Cookie: `${ACCESS_COOKIE_NAME}=${memberCookie}`,
      "Content-Type": "application/json",
    };
    const deniedBody = {
      base_revision: await revision(),
      role_definition_ids: [PROGRAM_ROLE],
    };
    const denied = await worker.fetch(
      request(`/api/v1/identity/accounts/${STAFF}/assignments`, {
        method: "POST",
        headers: {
          ...memberHeaders,
          "Idempotency-Key": "account-access-handler-replay-denied",
        },
        body: deniedBody,
      }),
      testEnv()
    );
    expect(denied.status).toBe(403);
    const deniedJson = await problem(denied);
    const deniedReplay = await worker.fetch(
      request(`/api/v1/identity/accounts/${STAFF}/assignments`, {
        method: "POST",
        headers: {
          ...memberHeaders,
          "Idempotency-Key": "account-access-handler-replay-denied",
        },
        body: deniedBody,
      }),
      testEnv()
    );
    expect(deniedReplay.status).toBe(403);
    const deniedReplayJson = await problem(deniedReplay);
    expect(deniedReplayJson.requestId).toBe(deniedJson.requestId);
    expect(deniedReplay.headers.get("X-Request-Id")).toBe(
      denied.headers.get("X-Request-Id")
    );

    const conflictBody = {
      base_revision: (await revision()) - 1,
      role_definition_ids: [PROGRAM_ROLE],
    };
    const conflict = await worker.fetch(
      request(`/api/v1/identity/accounts/${STAFF}/assignments`, {
        method: "POST",
        headers: {
          ...adminHeaders,
          "Idempotency-Key": "account-access-handler-replay-conflict",
        },
        body: conflictBody,
      }),
      testEnv()
    );
    expect(conflict.status).toBe(409);
    const conflictJson = await problem(conflict);
    const conflictReplay = await worker.fetch(
      request(`/api/v1/identity/accounts/${STAFF}/assignments`, {
        method: "POST",
        headers: {
          ...adminHeaders,
          "Idempotency-Key": "account-access-handler-replay-conflict",
        },
        body: conflictBody,
      }),
      testEnv()
    );
    expect(conflictReplay.status).toBe(409);
    const conflictReplayJson = await problem(conflictReplay);
    expect(conflictReplayJson.requestId).toBe(conflictJson.requestId);
    expect(conflictReplay.headers.get("X-Request-Id")).toBe(
      conflict.headers.get("X-Request-Id")
    );
    const lifecycleBody = {
      action: "archive",
      base_revision: await revision(),
      reason: "replay envelope",
    };
    const lifecycle = await worker.fetch(
      request(`/api/v1/identity/role-definitions/${PROGRAM_ROLE}/lifecycle`, {
        method: "POST",
        headers: {
          ...adminHeaders,
          "Idempotency-Key": "account-access-handler-replay-lifecycle",
        },
        body: lifecycleBody,
      }),
      testEnv()
    );
    expect(lifecycle.status).toBe(200);
    const lifecycleJson = (await lifecycle.json()) as {
      requestId: string;
      data: unknown;
    };
    const lifecycleReplay = await worker.fetch(
      request(`/api/v1/identity/role-definitions/${PROGRAM_ROLE}/lifecycle`, {
        method: "POST",
        headers: {
          ...adminHeaders,
          "Idempotency-Key": "account-access-handler-replay-lifecycle",
        },
        body: lifecycleBody,
      }),
      testEnv()
    );
    expect(lifecycleReplay.status).toBe(200);
    const lifecycleReplayJson = (await lifecycleReplay.json()) as {
      requestId: string;
      data: unknown;
    };
    expect(lifecycleReplayJson.requestId).toBe(lifecycleJson.requestId);
    expect(lifecycleReplay.headers.get("X-Request-Id")).toBe(
      lifecycle.headers.get("X-Request-Id")
    );
    const restore = await worker.fetch(
      request(`/api/v1/identity/role-definitions/${PROGRAM_ROLE}/lifecycle`, {
        method: "POST",
        headers: {
          ...adminHeaders,
          "Idempotency-Key": "account-access-handler-replay-lifecycle-restore",
        },
        body: { action: "restore", base_revision: await revision() },
      }),
      testEnv()
    );
    expect(restore.status).toBe(200);
  });
});
