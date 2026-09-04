/**
 * T05.2 / #552 — the narrow Worker Contract Gate tracer.
 *
 * This file owns one server-side Programs journey. It deliberately calls the
 * Worker directly inside the official Workers Vitest integration so a failure
 * can be attributed to authorization, D1, or the Worker projection without a
 * browser transport or viewport in the path.
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

const HOST = "https://efcc.example";
const SECRET = "t05-contract-test-secret";
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
  init: {
    method?: string;
    cookie?: string;
    idempotencyKey?: string;
    body?: unknown;
  } = {}
): Request {
  const headers = new Headers({ Origin: HOST });
  if (init.cookie) {
    headers.set("Cookie", `${ACCESS_COOKIE_NAME}=${init.cookie}`);
  }
  if (init.idempotencyKey) {
    headers.set("Idempotency-Key", init.idempotencyKey);
  }
  if (init.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  return new Request(`${HOST}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

async function correlated<T>(response: Response): Promise<T> {
  const requestId = response.headers.get("X-Request-Id");
  assert.ok(requestId, "Worker responses must carry X-Request-Id");
  const body = (await response.json()) as { requestId?: string };
  if (body.requestId !== undefined) {
    assert.equal(body.requestId, requestId);
  }
  return body as T;
}

async function login(username: string, password: string): Promise<string> {
  const response = await worker.fetch(
    request("/api/v1/auth/login", {
      method: "POST",
      body: { username, password },
    }),
    testEnv()
  );
  assert.equal(response.status, 200, `login must succeed for ${username}`);
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith(`${ACCESS_COOKIE_NAME}=`));
  assert.ok(cookie, "login must set an access cookie");
  return cookie.split(";", 1)[0].slice(ACCESS_COOKIE_NAME.length + 1);
}

async function installSystemIdentity(
  stableKey: "admin" | "member",
  accountUserId: string
): Promise<void> {
  const roleDefinitionId = `t05-contract-${stableKey}`;
  const now = new Date().toISOString();
  await testDb()
    .prepare(
      `INSERT OR IGNORE INTO role_definitions
        (role_definition_id, category_key, stable_key, label, description,
         scope_kind, scope_id, position, is_protected, is_archived,
         created_by, created_at, updated_by, updated_at)
       VALUES (?, 'Global', ?, ?, 'T05.2 Worker Contract identity',
               'Global', NULL, ?, 1, 0, NULL, ?, NULL, ?)`
    )
    .bind(
      roleDefinitionId,
      stableKey,
      stableKey === "admin" ? "系統管理員" : "會友基礎",
      stableKey === "admin" ? 0 : 999,
      now,
      now
    )
    .run();
  await testDb()
    .prepare(
      `INSERT OR IGNORE INTO role_assignments
        (assignment_id, account_user_id, role_definition_id, granted_by,
         granted_at, scope_kind, scope_id)
       VALUES (?, ?, ?, 'U001', ?, 'Global', NULL)`
    )
    .bind(crypto.randomUUID(), accountUserId, roleDefinitionId, now)
    .run();
}

async function createDepartment(adminCookie: string): Promise<string> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const response = await worker.fetch(
    request("/api/v1/programs/departments", {
      method: "POST",
      cookie: adminCookie,
      idempotencyKey: `t05-contract-department-${suffix}`,
      body: {
        code: `T05C${suffix}`,
        name: `T05 Contract Department ${suffix}`,
        lifecycle: "Active",
      },
    }),
    testEnv()
  );
  assert.equal(response.status, 201);
  const body = await correlated<{
    data: { department: { department_id: string } };
  }>(response);
  const departmentId = body.data.department.department_id;
  for (const moduleKey of ["program_catalog", "events", "enrollment"]) {
    const moduleResponse = await worker.fetch(
      request(
        `/api/v1/programs/departments/${departmentId}/modules/${moduleKey}/enable`,
        { method: "POST", cookie: adminCookie }
      ),
      testEnv()
    );
    assert.equal(moduleResponse.status, 200, `${moduleKey} must be enabled`);
  }
  return departmentId;
}

async function createProgram(
  adminCookie: string,
  departmentId: string
): Promise<{ programId: string; idempotencyKey: string }> {
  const idempotencyKey = `t05-contract-program-${crypto.randomUUID()}`;
  const response = await worker.fetch(
    request(`/api/v1/programs/departments/${departmentId}/programs`, {
      method: "POST",
      cookie: adminCookie,
      idempotencyKey,
      body: {
        name: `T05 Contract Program ${crypto.randomUUID().slice(0, 8)}`,
        description: "Representative Worker Contract Gate program",
        category: "T05",
        behavior_type: "Recurring",
        lifecycle: "Active",
        discoverability: "Listed",
        enrollment_mode: "MemberRequest",
      },
    }),
    testEnv()
  );
  assert.equal(response.status, 201);
  const body = await correlated<{
    data: { program: { program_id: string } };
  }>(response);
  return { programId: body.data.program.program_id, idempotencyKey };
}

beforeAll(async () => {
  await applyMigrations();
  await importLegacyUsers(testDb(), [
    HEADER,
    ["U001", "T05 Contract Admin", "t05-admin", "1234", "Admin", "Active"],
    ["U002", "T05 Contract Member", "t05-member", "5678", "Member", "Active"],
  ]);
  await completeCredentialUpgrade(testDb(), {
    userId: "U001",
    legacyPin: "1234",
    newCredential: "t05-admin-secret",
  });
  await completeCredentialUpgrade(testDb(), {
    userId: "U002",
    legacyPin: "5678",
    newCredential: "t05-member-secret",
  });
  await installSystemIdentity("admin", "U001");
  await installSystemIdentity("member", "U002");
});

describe("T05.2 Worker Contract Gate", () => {
  test("proves authenticated Programs mutation, D1 outcome, audit/idempotency, and projection read-back", async () => {
    const adminCookie = await login("t05-admin", "t05-admin-secret");
    const memberCookie = await login("t05-member", "t05-member-secret");
    const departmentId = await createDepartment(adminCookie);

    const memberCreate = await worker.fetch(
      request(`/api/v1/programs/departments/${departmentId}/programs`, {
        method: "POST",
        cookie: memberCookie,
        body: {
          name: "member must not create",
          description: "authorization tracer",
          behavior_type: "Recurring",
          lifecycle: "Active",
        },
      }),
      testEnv()
    );
    assert.equal(memberCreate.status, 403);

    const { programId, idempotencyKey: programKey } = await createProgram(
      adminCookie,
      departmentId
    );
    const programAudit = await testDb()
      .prepare(
        `SELECT outcome, correlation_id FROM audit_events
         WHERE action = 'PROGRAM_CREATE' AND entity_id = ?
         ORDER BY inserted_at DESC LIMIT 1`
      )
      .bind(programId)
      .first<{ outcome: string; correlation_id: string | null }>();
    assert.equal(programAudit?.outcome, "SUCCESS");
    assert.equal(programAudit?.correlation_id, programKey);

    const catalogResponse = await worker.fetch(
      request("/api/v1/programs/catalog", { cookie: memberCookie }),
      testEnv()
    );
    assert.equal(catalogResponse.status, 200);
    const catalog = await correlated<{
      data: {
        catalog: {
          programs: { program_id: string; viewerState: string }[];
        }[];
      };
    }>(catalogResponse);
    const catalogProgram = catalog.data.catalog
      .flatMap(({ programs }) => programs)
      .find(({ program_id }) => program_id === programId);
    assert.equal(catalogProgram?.program_id, programId);

    const requestKey = `t05-contract-enrollment-${crypto.randomUUID()}`;
    const enrollmentRequestResponse = await worker.fetch(
      request(`/api/v1/programs/${programId}/enrollment-requests`, {
        method: "POST",
        cookie: memberCookie,
        idempotencyKey: requestKey,
        body: {},
      }),
      testEnv()
    );
    assert.equal(enrollmentRequestResponse.status, 201);
    const enrollmentRequest = await correlated<{
      data: { request: { request_id: string; status: string } };
    }>(enrollmentRequestResponse);
    assert.equal(enrollmentRequest.data.request.status, "Pending");

    const decisionKey = `t05-contract-decision-${crypto.randomUUID()}`;
    const decisionResponse = await worker.fetch(
      request(
        `/api/v1/programs/${programId}/enrollment-requests/${enrollmentRequest.data.request.request_id}/decision`,
        {
          method: "POST",
          cookie: adminCookie,
          idempotencyKey: decisionKey,
          body: { action: "Approved" },
        }
      ),
      testEnv()
    );
    assert.equal(decisionResponse.status, 200);
    const decision = await correlated<{
      data: {
        request: { status: string };
        enrollment: { enrollment_id: string; status: string };
      };
    }>(decisionResponse);
    assert.equal(decision.data.request.status, "Approved");
    assert.equal(decision.data.enrollment.status, "Active");

    const repeatedDecisionResponse = await worker.fetch(
      request(
        `/api/v1/programs/${programId}/enrollment-requests/${enrollmentRequest.data.request.request_id}/decision`,
        {
          method: "POST",
          cookie: adminCookie,
          idempotencyKey: decisionKey,
          body: { action: "Approved" },
        }
      ),
      testEnv()
    );
    assert.equal(repeatedDecisionResponse.status, 200);

    const detailResponse = await worker.fetch(
      request(`/api/v1/programs/${programId}/participant-detail`, {
        cookie: memberCookie,
      }),
      testEnv()
    );
    assert.equal(detailResponse.status, 200);
    const detail = await correlated<{
      data: {
        detail: {
          program: { program_id: string };
          enrollment: { enrollments: { status: string }[] };
        };
      };
    }>(detailResponse);
    assert.equal(detail.data.detail.program.program_id, programId);
    assert.equal(
      detail.data.detail.enrollment.enrollments[0]?.status,
      "Active"
    );

    const storedRequest = await testDb()
      .prepare("SELECT status FROM enrollment_requests WHERE request_id = ?")
      .bind(enrollmentRequest.data.request.request_id)
      .first<{ status: string }>();
    assert.equal(storedRequest?.status, "Approved");
    const storedEnrollments = await testDb()
      .prepare("SELECT enrollment_id FROM enrollments WHERE request_id = ?")
      .bind(enrollmentRequest.data.request.request_id)
      .all<{ enrollment_id: string }>();
    assert.equal(storedEnrollments.results?.length, 1);

    const lifecycleAudits = await testDb()
      .prepare(
        `SELECT action, outcome, correlation_id FROM audit_events
         WHERE entity_id = ? OR entity_id = ?
         ORDER BY inserted_at`
      )
      .bind(
        enrollmentRequest.data.request.request_id,
        decision.data.enrollment.enrollment_id
      )
      .all<{
        action: string;
        outcome: string;
        correlation_id: string | null;
      }>();
    const auditPairs = (lifecycleAudits.results ?? []).map(
      ({ action, outcome }) => `${action}:${outcome}`
    );
    assert.ok(auditPairs.includes("ENROLLMENT_REQUEST_CREATE:SUCCESS"));
    assert.ok(auditPairs.includes("ENROLLMENT_REQUEST_DECIDE:SUCCESS"));
    assert.ok(auditPairs.includes("ENROLLMENT_REQUEST_DECIDE:DUPLICATE"));
    assert.ok(auditPairs.includes("ENROLLMENT_CREATE:SUCCESS"));
    assert.ok(
      lifecycleAudits.results?.some(
        ({ action, correlation_id }) =>
          action === "ENROLLMENT_REQUEST_CREATE" &&
          correlation_id === requestKey
      )
    );
    assert.ok(
      lifecycleAudits.results?.some(
        ({ action, correlation_id }) =>
          action === "ENROLLMENT_REQUEST_DECIDE" &&
          correlation_id === decisionKey
      )
    );
  });
});
