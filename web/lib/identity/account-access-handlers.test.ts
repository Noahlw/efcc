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

beforeAll(async () => {
  await applyMigrations();
  await seedDisposableIdentity(testDb(), {
    databaseName: "E2E_account-access-handlers",
  });
  adminCookie = await cookieFor(ADMIN);
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
});
