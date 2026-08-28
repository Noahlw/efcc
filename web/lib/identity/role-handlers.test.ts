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
      testEnv()
    );
    assert.equal(res.status, 401);
    const body = await problemBody(res);
    assert.equal(body.code, "AUTH_REQUIRED");
    assert.equal(body.status, 401);
    assert.equal(body.type, "tag:apps-script/efcc/errors#AUTH_REQUIRED");
    assert.equal(res.headers.get("X-Request-Id"), body.requestId);
  });

  test("a Member cannot rename: 403 ROLE_HIGHEST_PROTECTED problem", async () => {
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
    assert.equal(body.code, "ROLE_HIGHEST_PROTECTED");
    assert.equal(res.headers.get("X-Request-Id"), body.requestId);
    // No sensitive payload data is echoed back.
    assert.ok(!JSON.stringify(body).includes("改名嘗試"));
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
});
