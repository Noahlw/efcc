// @vitest-environment workers
/** #485 — Permission Editor Worker transport and recovery seam. */
import assert from "node:assert/strict";

import { env } from "cloudflare:workers";
import { beforeAll, describe, test } from "vitest";

import worker from "../../worker";
import type { Env } from "../../worker";
import { ACCESS_COOKIE_NAME } from "../auth/cookies";
import { signAccessToken } from "../auth/sessions";
import { applyMigrations, testDb } from "../auth/test-bootstrap";
import { CAPABILITY_CATALOG } from "./capability-catalog";
import { preflightDisposableSchema, seedDisposableIdentity } from "./index";

const SECRET = "test-access-token-secret";
const HOST = "https://efcc.example";
const DATABASE = "E2E_disposable-local";
const ADMIN = "E2E_DISPOSABLE_ADMIN";
const MEMBER = "E2E_DISPOSABLE_MEMBER";
const STAFF_ROLE = "018f3b8a-0000-7000-8000-000000000a02";
const PROGRAM_LEADER_ROLE = "018f3b8a-0000-7000-8000-100000000002";

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
    sid: `permission-editor-${userId}`,
    uid: userId,
    iat: Date.now(),
  });
}

async function currentRevision(): Promise<number> {
  const row = await testDb()
    .prepare("SELECT revision FROM role_policy_revisions WHERE id = 1")
    .first<{ revision: number }>();
  return row?.revision ?? 1;
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("#485 Permission Editor Worker seam", () => {
  let adminCookie = "";
  let memberCookie = "";

  beforeAll(async () => {
    await applyMigrations();
    const preflight = await preflightDisposableSchema(testDb(), {
      databaseName: DATABASE,
    });
    assert.equal(preflight.kind, "ok");
    await seedDisposableIdentity(testDb(), { databaseName: DATABASE });
    adminCookie = await cookieFor(ADMIN);
    memberCookie = await cookieFor(MEMBER);
  });

  test("GET detail returns the normalized envelope and complete catalog", async () => {
    const response = await worker.fetch(
      request(`/api/v1/identity/role-definitions/${STAFF_ROLE}`, {
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}` },
      }),
      testEnv()
    );
    assert.equal(response.status, 200);
    const body = await bodyOf(response);
    assert.equal(response.headers.get("X-Request-Id"), body.requestId);
    const data = body.data as {
      permissions: readonly unknown[];
      caller: { userId: string; canRead: boolean; canWrite: boolean };
      revision: number;
    };
    assert.equal(data.permissions.length, CAPABILITY_CATALOG.length);
    assert.deepEqual(data.caller, {
      userId: ADMIN,
      canRead: true,
      canWrite: true,
    });
    assert.equal(typeof data.revision, "number");
  });

  test("PATCH rejects a body actor and keeps the exact cookie-only request shape", async () => {
    const before = await currentRevision();
    const response = await worker.fetch(
      request(
        `/api/v1/identity/role-definitions/${PROGRAM_LEADER_ROLE}/grants`,
        {
          method: "PATCH",
          headers: {
            Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
            "Content-Type": "application/json",
            "Idempotency-Key": "permission-editor-handler-body-actor",
          },
          body: {
            base_revision: before,
            changes: [{ capability: "home.publish", value: true }],
            actor_user_id: ADMIN,
          },
        }
      ),
      testEnv()
    );
    assert.equal(response.status, 422);
    const body = await bodyOf(response);
    assert.equal(body.code, "VALIDATION");
    assert.equal(response.headers.get("X-Request-Id"), body.requestId);
    assert.equal(await currentRevision(), before);
  });

  test("PATCH commits one grant, correlates its audit, and replays without a second audit", async () => {
    const before = await currentRevision();
    const key = "permission-editor-handler-replay";
    const path = `/api/v1/identity/role-definitions/${PROGRAM_LEADER_ROLE}/grants`;
    const init = {
      method: "PATCH",
      headers: {
        Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: {
        base_revision: before,
        changes: [{ capability: "home.publish", value: true }],
      },
    };
    const first = await worker.fetch(request(path, init), testEnv());
    assert.equal(first.status, 200);
    const firstBody = await bodyOf(first);
    assert.equal(first.headers.get("X-Request-Id"), firstBody.requestId);
    const firstData = firstBody.data as {
      revision: number;
      permissions: readonly { capability: string; value: boolean }[];
    };
    assert.equal(firstData.revision, before + 1);
    assert.equal("idempotent" in firstData, false);
    assert.equal("responseRequestId" in firstData, false);
    const firstRequestId = firstBody.requestId;
    assert.equal(typeof firstRequestId, "string");

    const audit = await testDb()
      .prepare(
        `SELECT correlation_id, outcome FROM role_audit_events
           WHERE action = 'ROLE_DEFINITION_GRANT' AND entity_id = ?
           ORDER BY inserted_at DESC LIMIT 1`
      )
      .bind(PROGRAM_LEADER_ROLE)
      .first<{ correlation_id: string; outcome: string }>();
    assert.equal(audit?.correlation_id, firstBody.requestId);
    assert.equal(audit?.outcome, "SUCCESS");
    const current = await worker.fetch(
      request(path, {
        method: "PATCH",
        headers: {
          Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `${key}-current`,
        },
        body: {
          base_revision: firstData.revision,
          changes: [{ capability: "home.publish", value: false }],
        },
      }),
      testEnv()
    );
    assert.equal(current.status, 200);

    const replay = await worker.fetch(request(path, init), testEnv());
    assert.equal(replay.status, 200);
    const replayBody = await bodyOf(replay);
    assert.equal(replay.headers.get("X-Request-Id"), replayBody.requestId);
    assert.equal(replayBody.requestId, firstRequestId);
    const replayData = replayBody.data as {
      revision: number;
      permissions: readonly { capability: string; value: boolean }[];
    };
    assert.equal("idempotent" in replayData, false);
    assert.equal("responseRequestId" in replayData, false);
    assert.equal(replayData.revision, firstData.revision);
    assert.equal(
      replayData.permissions.find(
        (permission) => permission.capability === "home.publish"
      )?.value,
      true
    );
    const auditCount = await testDb()
      .prepare(
        `SELECT COUNT(*) AS count FROM role_audit_events
           WHERE action = 'ROLE_DEFINITION_GRANT' AND entity_id = ?`
      )
      .bind(PROGRAM_LEADER_ROLE)
      .first<{ count: number }>();
    assert.equal(auditCount?.count, 2);
  });

  test("stale PATCH returns nested authoritative revision and Member is forbidden", async () => {
    const current = await currentRevision();
    const stale = await worker.fetch(
      request(`/api/v1/identity/role-definitions/${STAFF_ROLE}/grants`, {
        method: "PATCH",
        headers: {
          Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
          "Content-Type": "application/json",
          "Idempotency-Key": "permission-editor-handler-stale",
        },
        body: {
          base_revision: current - 1,
          changes: [{ capability: "role.read", value: false }],
        },
      }),
      testEnv()
    );
    assert.equal(stale.status, 409);
    const staleBody = await bodyOf(stale);
    assert.equal(staleBody.code, "ROLE_POLICY_CONFLICT");
    assert.ok(
      staleBody.data &&
        typeof staleBody.data === "object" &&
        "authoritativeRevision" in staleBody.data
    );
    const staleData = staleBody.data;
    assert.equal(
      typeof staleData === "object" && staleData !== null
        ? staleData.authoritativeRevision
        : undefined,
      current
    );
    assert.equal(stale.headers.get("X-Request-Id"), staleBody.requestId);
    const staleReplay = await worker.fetch(
      request(`/api/v1/identity/role-definitions/${STAFF_ROLE}/grants`, {
        method: "PATCH",
        headers: {
          Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
          "Content-Type": "application/json",
          "Idempotency-Key": "permission-editor-handler-stale",
        },
        body: {
          base_revision: current - 1,
          changes: [{ capability: "role.read", value: false }],
        },
      }),
      testEnv()
    );
    assert.equal(staleReplay.status, 409);
    const staleReplayBody = await bodyOf(staleReplay);
    assert.equal(staleReplayBody.code, "ROLE_POLICY_CONFLICT");
    assert.ok(
      staleReplayBody.data &&
        typeof staleReplayBody.data === "object" &&
        "authoritativeRevision" in staleReplayBody.data
    );
    const staleReplayData = staleReplayBody.data;
    assert.equal(
      typeof staleReplayData === "object" && staleReplayData !== null
        ? staleReplayData.authoritativeRevision
        : undefined,
      current
    );
    assert.equal(staleReplayBody.requestId, staleBody.requestId);
    const staleAudits = await testDb()
      .prepare(
        `SELECT COUNT(*) AS count FROM role_audit_events
          WHERE action = 'ROLE_DEFINITION_POLICY_UPDATE'
            AND entity_id = ? AND outcome = 'CONFLICT'`
      )
      .bind(STAFF_ROLE)
      .first<{ count: number }>();
    assert.equal(staleAudits?.count, 1);

    const forbidden = await worker.fetch(
      request(`/api/v1/identity/role-definitions/${STAFF_ROLE}/grants`, {
        method: "PATCH",
        headers: {
          Cookie: `${ACCESS_COOKIE_NAME}=${memberCookie}`,
          "Content-Type": "application/json",
          "Idempotency-Key": "permission-editor-handler-member",
        },
        body: {
          base_revision: current,
          changes: [{ capability: "role.read", value: false }],
        },
      }),
      testEnv()
    );
    assert.equal(forbidden.status, 403);
    const forbiddenBody = await bodyOf(forbidden);
    assert.equal(forbiddenBody.code, "ROLE_FORBIDDEN");
    assert.equal(
      forbidden.headers.get("X-Request-Id"),
      forbiddenBody.requestId
    );
  });
  test("closed capabilities map to ROLE_NOT_FOUND while malformed changes stay invalid targets", async () => {
    const current = await currentRevision();
    const response = await worker.fetch(
      request(
        `/api/v1/identity/role-definitions/${PROGRAM_LEADER_ROLE}/grants`,
        {
          method: "PATCH",
          headers: {
            Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
            "Content-Type": "application/json",
            "Idempotency-Key": "permission-editor-handler-closed",
          },
          body: {
            base_revision: current,
            changes: [{ capability: "closed.capability", value: true }],
          },
        }
      ),
      testEnv()
    );
    assert.equal(response.status, 422);
    const body = await bodyOf(response);
    assert.equal(body.code, "ROLE_NOT_FOUND");
    assert.equal(response.headers.get("X-Request-Id"), body.requestId);

    const malformed = await worker.fetch(
      request(
        `/api/v1/identity/role-definitions/${PROGRAM_LEADER_ROLE}/grants`,
        {
          method: "PATCH",
          headers: {
            Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
            "Content-Type": "application/json",
            "Idempotency-Key": "permission-editor-handler-malformed",
          },
          body: {
            base_revision: current,
            changes: [{ capability: "role.read" }],
          },
        }
      ),
      testEnv()
    );
    assert.equal(malformed.status, 422);
    const malformedBody = await bodyOf(malformed);
    assert.equal(malformedBody.code, "ROLE_INVALID_TARGET");
  });

  test("protected denial replay preserves the original request identity", async () => {
    const current = await currentRevision();
    const path = `/api/v1/identity/role-definitions/${"018f3b8a-0000-7000-8000-000000000a01"}/grants`;
    const init = {
      method: "PATCH",
      headers: {
        Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}`,
        "Content-Type": "application/json",
        "Idempotency-Key": "permission-editor-handler-denial-replay",
      },
      body: {
        base_revision: current,
        changes: [{ capability: "role.read", value: false }],
      },
    };
    const first = await worker.fetch(request(path, init), testEnv());
    assert.equal(first.status, 403);
    const firstBody = await bodyOf(first);
    assert.equal(firstBody.code, "ROLE_ADMIN_PROTECTED");
    const replay = await worker.fetch(request(path, init), testEnv());
    assert.equal(replay.status, 403);
    const replayBody = await bodyOf(replay);
    assert.equal(replayBody.code, "ROLE_ADMIN_PROTECTED");
    assert.equal(replayBody.requestId, firstBody.requestId);
    const audits = await testDb()
      .prepare(
        `SELECT COUNT(*) AS count FROM role_audit_events
          WHERE entity_id = ? AND outcome = 'DENIED'`
      )
      .bind("018f3b8a-0000-7000-8000-000000000a01")
      .first<{ count: number }>();
    assert.equal(audits?.count, 1);
  });
});
