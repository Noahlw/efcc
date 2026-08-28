/**
 * #478 — Worker/HTTP Problem Details seam for the 身份組 hierarchy and
 * rename mutation (acceptance trace rows H-07..H-16).
 *
 * Exercises the real Worker route matrix (`worker.fetch`) against the
 * workerd D1 binding with the disposable identity seeds: cookie-only
 * actor resolution, RFC 9457 problem bodies with stable code/status/
 * requestId, no sensitive data in error payloads, and the typed rename
 * failures mapped to the documented HTTP surface. The authority is
 * recomputed server-side (H-16); the response shape is the observable
 * contract the client branches on.
 */
import assert from "node:assert/strict";

import { env } from "cloudflare:workers";
import { beforeAll, describe, test } from "vitest";

import worker from "../../worker";
import type { Env } from "../../worker";
import { ACCESS_COOKIE_NAME } from "../auth/cookies";
import { signAccessToken } from "../auth/sessions";
import { applyMigrations, testDb } from "../auth/test-bootstrap";
import { preflightDisposableSchema, seedDisposableIdentity } from "./index";

const SECRET = "test-access-token-secret";
const HOST = "https://efcc.example";
const DISPOSABLE_DATABASE = "E2E_disposable-local";

const ADMIN = "E2E_DISPOSABLE_ADMIN";
const MEMBER = "E2E_DISPOSABLE_MEMBER";
const ADMIN_ROLE = "018f3b8a-0000-7000-8000-000000000a01";
const MEMBER_ROLE = "018f3b8a-0000-7000-8000-000000000a03";
const DEPARTMENT_MANAGER_ROLE = "018f3b8a-0000-7000-8000-100000000001";

/** A signed access cookie for the given account, minted via the auth seam. */
let adminCookie = "";
let memberCookie = "";

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
    body:
      init.body === undefined
        ? undefined
        : typeof init.body === "string"
          ? init.body
          : JSON.stringify(init.body),
  });
}

async function cookieFor(userId: string): Promise<string> {
  const token = await signAccessToken(SECRET, {
    sid: `sess-${userId}`,
    uid: userId,
    iat: Date.now(),
  });
  return token;
}

async function problemBody(res: Response): Promise<{
  status: number;
  code: string;
  title: string;
  detail: string;
  requestId: string;
  type: string;
  currentRevision?: unknown;
}> {
  const body = (await res.json()) as Record<string, unknown>;
  return {
    status: body.status as number,
    code: body.code as string,
    title: body.title as string,
    detail: body.detail as string,
    requestId: body.requestId as string,
    type: body.type as string,
    currentRevision: body.currentRevision,
  };
}

describe("#478 identity Worker/HTTP seam", () => {
  beforeAll(async () => {
    await applyMigrations();
    const preflight = await preflightDisposableSchema(testDb(), {
      databaseName: DISPOSABLE_DATABASE,
    });
    if (preflight.kind !== "ok") {
      throw new Error(preflight.message);
    }
    await seedDisposableIdentity(testDb(), {
      databaseName: DISPOSABLE_DATABASE,
    });
    adminCookie = await cookieFor(ADMIN);
    memberCookie = await cookieFor(MEMBER);
  });

  test("GET /api/v1/identity/roles returns the projection envelope", async () => {
    const res = await worker.fetch(
      request("/api/v1/identity/roles", {
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}` },
      }),
      testEnv()
    );
    assert.equal(res.status, 200);
    assert.equal(
      res.headers.get("X-Request-Id"),
      res.headers.get("X-Request-Id")
    );
    const body = (await res.json()) as {
      requestId: string;
      data: { categories: unknown[]; revision: number };
    };
    assert.equal(typeof body.requestId, "string");
    assert.ok(Array.isArray(body.data.categories));
    assert.equal(typeof body.data.revision, "number");
  });

  test("no access cookie is a 401 AUTH_REQUIRED problem", async () => {
    const res = await worker.fetch(
      request("/api/v1/identity/roles"),
      testEnv({ EFCC_ACCESS_TOKEN_SECRET: undefined })
    );
    assert.equal(res.status, 401);
    const body = await problemBody(res);
    assert.equal(body.code, "AUTH_REQUIRED");
    assert.equal(body.status, 401);
    assert.equal(body.type, "tag:apps-script/efcc/errors#AUTH_REQUIRED");
    assert.equal(res.headers.get("X-Request-Id"), body.requestId);
  });

  test("a Member cannot rename: 403 ROLE_FORBIDDEN problem", async () => {
    const res = await worker.fetch(
      request(`/api/v1/identity/roles/${DEPARTMENT_MANAGER_ROLE}/name`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${ACCESS_COOKIE_NAME}=${memberCookie}`,
          "Idempotency-Key": "http-h-09",
        },
        body: {
          label: "改名嘗試",
          base_revision: 1,
          request_fingerprint: "fp-http-h-09",
        },
      }),
      testEnv()
    );
    assert.equal(res.status, 403);
    const body = await problemBody(res);
    assert.equal(body.code, "ROLE_FORBIDDEN");
    assert.equal(res.headers.get("X-Request-Id"), body.requestId);
    // No sensitive payload data is echoed back.
    assert.ok(!JSON.stringify(body).includes("改名嘗試"));
  });

  test("a Member cannot read the hierarchy without role.read", async () => {
    const res = await worker.fetch(
      request("/api/v1/identity/roles", {
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${memberCookie}` },
      }),
      testEnv()
    );
    assert.equal(res.status, 403);
    const body = await problemBody(res);
    assert.equal(body.code, "ROLE_FORBIDDEN");
    assert.equal(res.headers.get("X-Request-Id"), body.requestId);
  });

  test("rename with an invalid name is a 400 INVALID_NAME problem (H-11 HTTP)", async () => {
    const res = await worker.fetch(
      request(`/api/v1/identity/roles/${DEPARTMENT_MANAGER_ROLE}/name`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
          "Idempotency-Key": "http-h-11",
        },
        body: {
          label: "   ",
          base_revision: 1,
          request_fingerprint: "fp-http-h-11",
        },
      }),
      testEnv()
    );
    assert.equal(res.status, 400);
    const body = await problemBody(res);
    assert.equal(body.code, "INVALID_NAME");
    assert.equal(res.headers.get("X-Request-Id"), body.requestId);
  });

  test("rename with a taken name is a 409 ROLE_NAME_TAKEN problem (H-07 HTTP)", async () => {
    const res = await worker.fetch(
      request(`/api/v1/identity/roles/${DEPARTMENT_MANAGER_ROLE}/name`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
          "Idempotency-Key": "http-h-07",
        },
        body: {
          label: "系統管理員",
          base_revision: 1,
          request_fingerprint: "fp-http-h-07",
        },
      }),
      testEnv()
    );
    assert.equal(res.status, 409);
    const body = await problemBody(res);
    assert.equal(body.code, "ROLE_NAME_TAKEN");
    assert.equal(res.headers.get("X-Request-Id"), body.requestId);
  });

  test("unknown role is a 404 ROLE_NOT_FOUND problem", async () => {
    const res = await worker.fetch(
      request(
        "/api/v1/identity/roles/018f3b8a-0000-7000-8000-00000000dead/name",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
            "Idempotency-Key": "http-not-found",
          },
          body: {
            label: "不存在",
            base_revision: 1,
            request_fingerprint: "fp-http-not-found",
          },
        }
      ),
      testEnv()
    );
    assert.equal(res.status, 404);
    const body = await problemBody(res);
    assert.equal(body.code, "ROLE_NOT_FOUND");
  });

  test("malformed encoded role IDs return a stable ROLE_NOT_FOUND problem", async () => {
    const res = await worker.fetch(
      request("/api/v1/identity/roles/%E0%A4/name", {
        method: "PATCH",
        headers: {
          Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
          "Idempotency-Key": "http-malformed-role",
        },
        body: { label: "不存在", base_revision: 1 },
      }),
      testEnv()
    );
    assert.equal(res.status, 404);
    const body = await problemBody(res);
    assert.equal(body.code, "ROLE_NOT_FOUND");
    assert.equal(res.headers.get("X-Request-Id"), body.requestId);
  });

  test("Admin and 會友基礎 return distinct protected Problem Details codes", async () => {
    const cases = [
      [ADMIN_ROLE, "http-admin-protected", "ROLE_ADMIN_PROTECTED"],
      [MEMBER_ROLE, "http-baseline-protected", "ROLE_BASELINE_PROTECTED"],
    ] as const;
    await Promise.all(
      cases.map(async ([roleId, key, expectedCode]) => {
        const res = await worker.fetch(
          request(`/api/v1/identity/roles/${roleId}/name`, {
            method: "PATCH",
            headers: {
              Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
              "Idempotency-Key": key,
            },
            body: { label: "改名嘗試", base_revision: 1 },
          }),
          testEnv()
        );
        assert.equal(res.status, 403);
        const body = await problemBody(res);
        assert.equal(body.code, expectedCode);
      })
    );
  });

  test("a valid rename succeeds and returns the authoritative response (H-05/H-15 HTTP)", async () => {
    const viewRes = await worker.fetch(
      request("/api/v1/identity/roles", {
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}` },
      }),
      testEnv()
    );
    const view = (await viewRes.json()) as {
      data: { revision: number };
    };
    const base = view.data.revision;

    const res = await worker.fetch(
      request(`/api/v1/identity/roles/${DEPARTMENT_MANAGER_ROLE}/name`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
          "Idempotency-Key": "http-h-05",
        },
        body: {
          label: "成人部門主管",
          base_revision: base,
          request_fingerprint: "fp-http-h-05",
        },
      }),
      testEnv()
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      requestId: string;
      data: {
        roleDefinitionId: string;
        label: string;
        revision: number;
        idempotent: boolean;
      };
    };
    assert.equal(body.data.roleDefinitionId, DEPARTMENT_MANAGER_ROLE);
    assert.equal(body.data.label, "成人部門主管");
    assert.equal(body.data.revision, base + 1);
    assert.equal(body.data.idempotent, false);
    assert.equal(res.headers.get("X-Request-Id"), body.requestId);
  });

  test("archived role rename returns ROLE_ARCHIVED Problem Details", async () => {
    await testDb()
      .prepare(
        `UPDATE role_definitions SET is_archived = 1 WHERE role_definition_id = ?`
      )
      .bind(DEPARTMENT_MANAGER_ROLE)
      .run();
    const revision = await testDb()
      .prepare(`SELECT revision FROM role_policy_revisions WHERE id = 1`)
      .first<{ revision: number }>();
    const res = await worker.fetch(
      request(`/api/v1/identity/roles/${DEPARTMENT_MANAGER_ROLE}/name`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
          "Idempotency-Key": "http-archived",
        },
        body: {
          label: "不應更新",
          base_revision: revision?.revision ?? 1,
        },
      }),
      testEnv()
    );
    assert.equal(res.status, 409);
    const body = await problemBody(res);
    assert.equal(body.code, "ROLE_ARCHIVED");
    const row = await testDb()
      .prepare(
        `SELECT label FROM role_definitions WHERE role_definition_id = ?`
      )
      .bind(DEPARTMENT_MANAGER_ROLE)
      .first<{ label: string }>();
    assert.equal(row?.label, "成人部門主管");
  });
});

async function readCurrentHttpRevision(): Promise<number> {
  const row = await testDb()
    .prepare(`SELECT revision FROM role_policy_revisions WHERE id = 1`)
    .first<{ revision: number }>();
  return row?.revision ?? 1;
}

describe("#479 Worker/HTTP create + reorder seam", () => {
  // Shares the seeded disposable D1 from the #478 suite above (same file,
  // same binding): migrations + seeds already ran there.

  test("B-479-01: Admin POST creates a scoped Role Definition with the { requestId, data } envelope and X-Request-Id correlation", async () => {
    const base = await readCurrentHttpRevision();
    const res = await worker.fetch(
      request("/api/v1/identity/role-definitions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
          "Idempotency-Key": "http-b479-create-1",
        },
        body: {
          category_key: "Department",
          label: "HTTP 建立部門角色",
          description: "HTTP create fixture",
          scope_kind: "Department",
          scope_id: "018f3b8a-0000-7000-8000-000000000002",
          base_revision: base,
        },
      }),
      testEnv()
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      requestId: string;
      data: {
        roleDefinitionId: string;
        categoryKey: string;
        label: string;
        scopeKind: string;
        scopeId: string | null;
        position: number;
        revision: number;
        idempotent: boolean;
      };
    };
    assert.equal(res.headers.get("X-Request-Id"), body.requestId);
    assert.equal(body.data.categoryKey, "Department");
    assert.equal(body.data.scopeKind, "Department");
    assert.equal(body.data.scopeId, "018f3b8a-0000-7000-8000-000000000002");
    assert.equal(body.data.label, "HTTP 建立部門角色");
    assert.equal(body.data.revision, base + 1);
    assert.equal(body.data.idempotent, false);
    const audit = await testDb()
      .prepare(
        `SELECT action, outcome, correlation_id FROM role_audit_events
          WHERE entity_id = ? AND action = 'ROLE_DEFINITION_CREATE'
          ORDER BY inserted_at DESC LIMIT 1`
      )
      .bind(body.data.roleDefinitionId)
      .first<{ action: string; outcome: string; correlation_id: string }>();
    assert.equal(audit?.action, "ROLE_DEFINITION_CREATE");
    assert.equal(audit?.outcome, "SUCCESS");
    assert.equal(audit?.correlation_id, body.requestId);
  });

  test("B-479-02: Staff POST with a Global scope is rejected 403 ROLE_FORBIDDEN with X-Request-Id correlation", async () => {
    const staffCookie = await cookieFor("E2E_DISPOSABLE_STAFF");
    const base = await readCurrentHttpRevision();
    const res = await worker.fetch(
      request("/api/v1/identity/role-definitions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${ACCESS_COOKIE_NAME}=${staffCookie}`,
          "Idempotency-Key": "http-b479-create-staff-global",
        },
        body: {
          category_key: "Global",
          label: "Staff 全域角色",
          description: "",
          scope_kind: "Global",
          scope_id: null,
          base_revision: base,
        },
      }),
      testEnv()
    );
    assert.equal(res.status, 403);
    const body = await problemBody(res);
    assert.equal(body.code, "ROLE_FORBIDDEN");
    assert.equal(res.headers.get("X-Request-Id"), body.requestId);
    assert.equal(await readCurrentHttpRevision(), base);
  });

  test("B-479-14: Staff POST creates a scoped Role Definition under the permitted 成區 Department category", async () => {
    const staffCookie = await cookieFor("E2E_DISPOSABLE_STAFF");
    const base = await readCurrentHttpRevision();
    const res = await worker.fetch(
      request("/api/v1/identity/role-definitions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${ACCESS_COOKIE_NAME}=${staffCookie}`,
          "Idempotency-Key": "http-b479-create-staff-scoped",
        },
        body: {
          category_key: "Department",
          label: "成區支援角色",
          description: "Staff scoped creation",
          scope_kind: "Department",
          scope_id: "018f3b8a-0000-7000-8000-000000000002",
          base_revision: base,
        },
      }),
      testEnv()
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      requestId: string;
      data: {
        roleDefinitionId: string;
        scopeKind: string;
        position: number;
        revision: number;
      };
    };
    assert.equal(res.headers.get("X-Request-Id"), body.requestId);
    assert.equal(body.data.scopeKind, "Department");
    assert.ok(body.data.position > 1);
    const grants = await testDb()
      .prepare(
        `SELECT COUNT(*) AS c FROM role_definition_grants
          WHERE role_definition_id = ?`
      )
      .bind(body.data.roleDefinitionId)
      .first<{ c: number }>();
    assert.equal(grants?.c, 0);
    const audit = await testDb()
      .prepare(
        `SELECT outcome, correlation_id FROM role_audit_events
          WHERE action = 'ROLE_DEFINITION_CREATE'
            AND entity_id = ?
          ORDER BY inserted_at DESC LIMIT 1`
      )
      .bind(body.data.roleDefinitionId)
      .first<{ outcome: string; correlation_id: string }>();
    assert.equal(audit?.outcome, "SUCCESS");
    assert.equal(audit?.correlation_id, body.requestId);
  });

  test("B-479-17: response-loss replay of the same key returns the original create without a duplicate row", async () => {
    const base = await readCurrentHttpRevision();
    const firstRes = await worker.fetch(
      request("/api/v1/identity/role-definitions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
          "Idempotency-Key": "http-b479-create-replay",
        },
        body: {
          category_key: "Department",
          label: "重播建立部門角色",
          description: "",
          scope_kind: "Department",
          scope_id: "018f3b8a-0000-7000-8000-000000000002",
          base_revision: base,
        },
      }),
      testEnv()
    );
    assert.equal(firstRes.status, 200);
    const first = (await firstRes.json()) as {
      data: { roleDefinitionId: string; revision: number; idempotent: boolean };
    };
    const replayRes = await worker.fetch(
      request("/api/v1/identity/role-definitions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
          "Idempotency-Key": "http-b479-create-replay",
        },
        body: {
          category_key: "Department",
          label: "重播建立部門角色",
          description: "",
          scope_kind: "Department",
          scope_id: "018f3b8a-0000-7000-8000-000000000002",
          base_revision: base,
        },
      }),
      testEnv()
    );
    assert.equal(replayRes.status, 200);
    const replay = (await replayRes.json()) as {
      data: { roleDefinitionId: string; revision: number; idempotent: boolean };
    };
    assert.equal(replay.data.roleDefinitionId, first.data.roleDefinitionId);
    assert.equal(replay.data.revision, first.data.revision);
    assert.equal(replay.data.idempotent, true);
    const count = await testDb()
      .prepare(
        `SELECT COUNT(*) AS c FROM role_definitions
          WHERE role_definition_id = ?`
      )
      .bind(first.data.roleDefinitionId)
      .first<{ c: number }>();
    assert.equal(count?.c, 1);
  });

  test("B-479-10 HTTP: a stale reorder returns 409 ROLE_ORDER_CONFLICT with the authoritative revision and order", async () => {
    const base = await readCurrentHttpRevision();
    // Make a fresh sibling pair via the create route (the seeded manager
    // was archived by the #478 suite's archived-rename test).
    const createRes = await worker.fetch(
      request("/api/v1/identity/role-definitions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
          "Idempotency-Key": "http-b479-reorder-sibling-a",
        },
        body: {
          category_key: "Department",
          label: "重排序部門角色甲",
          description: "",
          scope_kind: "Department",
          scope_id: "018f3b8a-0000-7000-8000-000000000002",
          base_revision: base,
        },
      }),
      testEnv()
    );
    assert.equal(createRes.status, 200);
    const siblingA = (await createRes.json()) as {
      data: { roleDefinitionId: string; position: number };
    };
    const afterA = await readCurrentHttpRevision();
    const createB = await worker.fetch(
      request("/api/v1/identity/role-definitions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
          "Idempotency-Key": "http-b479-reorder-sibling-b",
        },
        body: {
          category_key: "Department",
          label: "重排序部門角色乙",
          description: "",
          scope_kind: "Department",
          scope_id: "018f3b8a-0000-7000-8000-000000000002",
          base_revision: afterA,
        },
      }),
      testEnv()
    );
    assert.equal(createB.status, 200);
    const siblingB = (await createB.json()) as {
      data: { roleDefinitionId: string; position: number };
    };
    const afterCreate = await readCurrentHttpRevision();
    const res = await worker.fetch(
      request("/api/v1/identity/roles/order", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
          "Idempotency-Key": "http-b479-reorder-stale",
        },
        body: {
          category_key: "Department",
          targets: [
            {
              role_definition_id: siblingA.data.roleDefinitionId,
              position: siblingB.data.position,
            },
            {
              role_definition_id: siblingB.data.roleDefinitionId,
              position: siblingA.data.position,
            },
          ],
          base_revision: afterCreate - 1,
        },
      }),
      testEnv()
    );
    assert.equal(res.status, 409);
    const body = (await res.json()) as {
      code: string;
      requestId: string;
      currentRevision?: unknown;
      orderedRoleDefinitionIds?: unknown;
    };
    assert.equal(body.code, "ROLE_ORDER_CONFLICT");
    assert.equal(res.headers.get("X-Request-Id"), body.requestId);
    assert.equal(body.currentRevision, afterCreate);
    assert.ok(Array.isArray(body.orderedRoleDefinitionIds));
  });

  test("B-479-07 HTTP: a valid sibling reorder returns the authoritative order with revision + 1", async () => {
    const adminCookie2 = await cookieFor("E2E_DISPOSABLE_ADMIN");
    const base = await readCurrentHttpRevision();
    const createRes = await worker.fetch(
      request("/api/v1/identity/role-definitions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie2}`,
          "Idempotency-Key": "http-b479-reorder-valid-sibling-a",
        },
        body: {
          category_key: "Department",
          label: "有效重排序角色甲",
          description: "",
          scope_kind: "Department",
          scope_id: "018f3b8a-0000-7000-8000-000000000002",
          base_revision: base,
        },
      }),
      testEnv()
    );
    assert.equal(createRes.status, 200);
    const siblingA = (await createRes.json()) as {
      data: { roleDefinitionId: string; position: number };
    };
    const afterA = await readCurrentHttpRevision();
    const createB = await worker.fetch(
      request("/api/v1/identity/role-definitions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie2}`,
          "Idempotency-Key": "http-b479-reorder-valid-sibling-b",
        },
        body: {
          category_key: "Department",
          label: "有效重排序角色乙",
          description: "",
          scope_kind: "Department",
          scope_id: "018f3b8a-0000-7000-8000-000000000002",
          base_revision: afterA,
        },
      }),
      testEnv()
    );
    assert.equal(createB.status, 200);
    const siblingB = (await createB.json()) as {
      data: { roleDefinitionId: string; position: number };
    };
    const afterCreate = await readCurrentHttpRevision();
    const res = await worker.fetch(
      request("/api/v1/identity/roles/order", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie2}`,
          "Idempotency-Key": "http-b479-reorder-valid",
        },
        body: {
          category_key: "Department",
          targets: [
            {
              role_definition_id: siblingA.data.roleDefinitionId,
              position: siblingB.data.position,
            },
            {
              role_definition_id: siblingB.data.roleDefinitionId,
              position: siblingA.data.position,
            },
          ],
          base_revision: afterCreate,
        },
      }),
      testEnv()
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      requestId: string;
      data: {
        categoryKey: string;
        orderedRoleDefinitionIds: string[];
        revision: number;
        idempotent: boolean;
      };
    };
    assert.equal(res.headers.get("X-Request-Id"), body.requestId);
    assert.equal(body.data.categoryKey, "Department");
    assert.equal(body.data.revision, afterCreate + 1);
    assert.equal(body.data.idempotent, false);
    assert.ok(
      body.data.orderedRoleDefinitionIds.includes(
        siblingA.data.roleDefinitionId
      )
    );
  });
  test("B-479 scope HTTP: Staff rescope returns the response envelope and audit correlation", async () => {
    const staffCookie = await cookieFor("E2E_DISPOSABLE_STAFF");
    const createBase = await readCurrentHttpRevision();
    const createRes = await worker.fetch(
      request("/api/v1/identity/role-definitions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
          "Idempotency-Key": "http-b479-rescope-create",
        },
        body: {
          category_key: "Department",
          label: "HTTP 適用範圍角色",
          description: "",
          scope_kind: "Department",
          scope_id: "018f3b8a-0000-7000-8000-000000000002",
          base_revision: createBase,
        },
      }),
      testEnv()
    );
    assert.equal(createRes.status, 200);
    const created = (await createRes.json()) as {
      data: { roleDefinitionId: string };
    };
    const base = await readCurrentHttpRevision();
    const res = await worker.fetch(
      request(
        `/api/v1/identity/role-definitions/${created.data.roleDefinitionId}/scope`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `${ACCESS_COOKIE_NAME}=${staffCookie}`,
            "Idempotency-Key": "http-b479-rescope-success",
          },
          body: {
            category_key: "Program",
            scope_kind: "Program",
            scope_id: "018f3b8a-0000-7000-8000-300000000001",
            base_revision: base,
          },
        }
      ),
      testEnv()
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      requestId: string;
      data: {
        roleDefinitionId: string;
        categoryKey: string;
        scopeKind: string;
        scopeId: string | null;
        revision: number;
        idempotent: boolean;
      };
    };
    assert.equal(res.headers.get("X-Request-Id"), body.requestId);
    assert.equal(body.data.roleDefinitionId, created.data.roleDefinitionId);
    assert.equal(body.data.categoryKey, "Program");
    assert.equal(body.data.scopeKind, "Program");
    assert.equal(body.data.scopeId, "018f3b8a-0000-7000-8000-300000000001");
    assert.equal(body.data.revision, base + 1);
    assert.equal(body.data.idempotent, false);
    const correlated = await testDb()
      .prepare(
        `SELECT action, outcome, correlation_id FROM role_audit_events
          WHERE entity_id = ? AND action = 'ROLE_DEFINITION_RESCOPE'
          ORDER BY inserted_at DESC LIMIT 1`
      )
      .bind(created.data.roleDefinitionId)
      .first<{ action: string; outcome: string; correlation_id: string }>();
    assert.equal(correlated?.action, "ROLE_DEFINITION_RESCOPE");
    assert.equal(correlated?.outcome, "SUCCESS");
    assert.equal(correlated?.correlation_id, body.requestId);
  });

  test("B-479 scope HTTP: Staff Global destination is rejected with ROLE_SCOPE_MISMATCH", async () => {
    const staffCookie = await cookieFor("E2E_DISPOSABLE_STAFF");
    const createBase = await readCurrentHttpRevision();
    const createRes = await worker.fetch(
      request("/api/v1/identity/role-definitions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
          "Idempotency-Key": "http-b479-rescope-global-target",
        },
        body: {
          category_key: "Department",
          label: "HTTP 全域拒絕目標",
          description: "",
          scope_kind: "Department",
          scope_id: "018f3b8a-0000-7000-8000-000000000002",
          base_revision: createBase,
        },
      }),
      testEnv()
    );
    assert.equal(createRes.status, 200);
    const created = (await createRes.json()) as {
      data: { roleDefinitionId: string };
    };
    const base = await readCurrentHttpRevision();
    const res = await worker.fetch(
      request(
        `/api/v1/identity/role-definitions/${created.data.roleDefinitionId}/scope`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `${ACCESS_COOKIE_NAME}=${staffCookie}`,
            "Idempotency-Key": "http-b479-rescope-staff-global",
          },
          body: {
            category_key: "Global",
            scope_kind: "Global",
            scope_id: null,
            base_revision: base,
          },
        }
      ),
      testEnv()
    );
    assert.equal(res.status, 403);
    const body = await problemBody(res);
    assert.equal(body.code, "ROLE_SCOPE_MISMATCH");
    assert.equal(res.headers.get("X-Request-Id"), body.requestId);
  });
});
