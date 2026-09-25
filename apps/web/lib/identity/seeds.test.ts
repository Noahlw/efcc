/**
 * #476 — Disposable seed contract.
 *
 * The seeds create the three system identities (Admin and 會友基礎 are
 * protected; Staff remains assignable), the fixed Department / Program Role
 * Categories, a representative scoped Department manager Role Definition, a
 * representative scoped Program leader Role Definition, and the
 * representative Active Accounts.
 *
 * Every seed is idempotent (INSERT OR IGNORE on a stable key) so re-running
 * the seeds against a partially seeded disposable D1 must not double-insert
 * or break invariants.
 */
/* oxlint-disable vitest/require-top-level-describe, vitest/max-expects, vitest/prefer-to-be-truthy, vitest/expect-expect, eslint/no-await-in-loop, eslint/no-unused-vars -- shared workerd/D1 fixture spans the suites; max-expects is per-acceptance-trace group. */
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, test } from "vitest";

import { applyMigrations, testDb } from "../auth/test-bootstrap";
import {
  mutateRoleDefinitionLifecycle,
  revokeAccountAssignments,
} from "./account-access";
import { preflightDisposableSchema, seedDisposableIdentity } from "./index";
import { resolveActorCapabilities } from "./role-hierarchy";

const DISPOSABLE_DATABASE = "E2E_disposable-local";
const ADMIN = "E2E_DISPOSABLE_ADMIN";
const DEPARTMENT_ROLE = "018f3b8a-0000-7000-8000-100000000001";
const PROGRAM_ROLE = "018f3b8a-0000-7000-8000-100000000002";

async function readScalar<T>(
  sql: string,
  ...binds: unknown[]
): Promise<T | undefined> {
  const stmt = testDb().prepare(sql);
  const row = await stmt.bind(...binds).first<T>();
  return row ?? undefined;
}

describe("#476 disposable seed contract", () => {
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
  });

  test("Admin and 會友基礎 are protected while Staff remains assignable", async () => {
    const admin = await readScalar<{
      label: string;
      is_protected: number;
      stable_key: string;
      scope_kind: string;
    }>(
      `SELECT label, is_protected, stable_key, scope_kind
         FROM role_definitions WHERE stable_key = ?`,
      "admin"
    );
    expect(admin).toBeDefined();
    expect(admin?.is_protected).toBe(1);
    expect(admin?.scope_kind).toBe("Global");
    expect(admin?.stable_key).toBe("admin");

    const member = await readScalar<{
      is_protected: number;
      stable_key: string;
    }>(
      `SELECT is_protected, stable_key FROM role_definitions WHERE stable_key = ?`,
      "member"
    );
    expect(member).toBeDefined();
    expect(member?.is_protected).toBe(1);
    expect(member?.stable_key).toBe("member");

    const staff = await readScalar<{ is_protected: number; position: number }>(
      `SELECT is_protected, position FROM role_definitions WHERE stable_key = ?`,
      "staff"
    );
    expect(staff).toBeDefined();
    expect(staff?.is_protected).toBe(0);
    const adminPos = await readScalar<{ position: number }>(
      `SELECT position FROM role_definitions WHERE stable_key = ?`,
      "admin"
    );
    expect(adminPos).toBeDefined();
    expect(staff?.position ?? 0).toBeGreaterThan(adminPos?.position ?? 0);
  });

  test("Staff seeds the role-management grants required for rename and scope edits", async () => {
    const rows = await testDb()
      .prepare(
        `SELECT capability FROM role_definition_grants
          WHERE role_definition_id = (
            SELECT role_definition_id FROM role_definitions
             WHERE stable_key = 'staff'
          )`
      )
      .all<{ capability: string }>();
    const capabilities = new Set(
      (rows.results ?? []).map((row) => row.capability)
    );
    expect(capabilities.has("role.name.write")).toBe(true);
    expect(capabilities.has("role.scope.read")).toBe(true);
    expect(capabilities.has("role.scope.write")).toBe(true);
  });

  test("fixed Department and Program categories are seeded as non-assignable", async () => {
    const rows = await testDb()
      .prepare(
        `SELECT category_key, is_assignable FROM role_categories
          WHERE category_key IN ('Global', 'Department', 'Program')`
      )
      .all<{ category_key: string; is_assignable: number }>();
    const map = new Map(
      (rows.results ?? []).map((row) => [row.category_key, row.is_assignable])
    );
    expect(map.size).toBe(3);
    for (const value of map.values()) {
      expect(value).toBe(0);
    }
  });

  test("scoped Role Definitions carry an explicit scope_id matching their scope_kind", async () => {
    const dm = await readScalar<{
      scope_kind: string;
      scope_id: string | null;
    }>(
      `SELECT scope_kind, scope_id FROM role_definitions WHERE stable_key = ?`,
      "department.manager.adult"
    );
    expect(dm).toBeDefined();
    expect(dm?.scope_kind).toBe("Department");
    expect(dm?.scope_id).toBeTruthy();

    const pl = await readScalar<{
      scope_kind: string;
      scope_id: string | null;
    }>(
      `SELECT scope_kind, scope_id FROM role_definitions WHERE stable_key = ?`,
      "program.leader.youth-bible-study"
    );
    expect(pl).toBeDefined();
    expect(pl?.scope_kind).toBe("Program");
    expect(pl?.scope_id).toBeTruthy();
  });

  test("representative Active Accounts receive automatic 會友基礎 access", async () => {
    const expected = [
      "E2E_DISPOSABLE_ADMIN",
      "E2E_DISPOSABLE_STAFF",
      "E2E_DISPOSABLE_DM",
      "E2E_DISPOSABLE_PL",
      "E2E_DISPOSABLE_MEMBER",
    ];
    for (const userId of expected) {
      const capabilities = await resolveActorCapabilities(testDb(), userId);
      expect(capabilities["program.enroll"]).toBe(true);
    }
  });

  test("scoped Department manager and Program leader assignments seed only for the matching account", async () => {
    const dmRoleId = await readScalar<{ role_definition_id: string }>(
      `SELECT role_definition_id FROM role_definitions WHERE stable_key = ?`,
      "department.manager.adult"
    );
    const plRoleId = await readScalar<{ role_definition_id: string }>(
      `SELECT role_definition_id FROM role_definitions WHERE stable_key = ?`,
      "program.leader.youth-bible-study"
    );
    expect(dmRoleId).toBeDefined();
    expect(plRoleId).toBeDefined();
    const dmHolder = await readScalar<{ account_user_id: string }>(
      `SELECT account_user_id FROM role_assignments
        WHERE role_definition_id = ? AND revoked_at IS NULL`,
      dmRoleId?.role_definition_id ?? ""
    );
    expect(dmHolder).toBeDefined();
    expect(dmHolder?.account_user_id).toBe("E2E_DISPOSABLE_DM");
    const plHolder = await readScalar<{ account_user_id: string }>(
      `SELECT account_user_id FROM role_assignments
        WHERE role_definition_id = ? AND revoked_at IS NULL`,
      plRoleId?.role_definition_id ?? ""
    );
    expect(plHolder).toBeDefined();
    expect(plHolder?.account_user_id).toBe("E2E_DISPOSABLE_PL");
  });

  test("seeds are idempotent: a second seed run does not duplicate rows", async () => {
    const before = await readScalar<{ c: number }>(
      `SELECT COUNT(*) AS c FROM role_definitions`
    );
    const beforeAssignments = await readScalar<{ c: number }>(
      `SELECT COUNT(*) AS c FROM role_assignments`
    );
    await seedDisposableIdentity(testDb(), {
      databaseName: DISPOSABLE_DATABASE,
    });
    const after = await readScalar<{ c: number }>(
      `SELECT COUNT(*) AS c FROM role_definitions`
    );
    const afterAssignments = await readScalar<{ c: number }>(
      `SELECT COUNT(*) AS c FROM role_assignments`
    );
    expect(before).toBeDefined();
    expect(after).toBeDefined();
    expect(after?.c).toBe(before?.c);
    expect(beforeAssignments).toBeDefined();
    expect(afterAssignments).toBeDefined();
    expect(afterAssignments?.c).toBe(beforeAssignments?.c);
  });
  test("re-seeding preserves revoked history, re-creates active assignments, and skips archived roles", async () => {
    const departmentAssignment = await readScalar<{
      assignment_id: string;
    }>(
      `SELECT assignment_id FROM role_assignments
        WHERE account_user_id = 'E2E_DISPOSABLE_DM'
          AND role_definition_id = ? AND revoked_at IS NULL`,
      DEPARTMENT_ROLE
    );
    expect(departmentAssignment?.assignment_id).toBeTruthy();
    const revision = await readScalar<{ revision: number }>(
      "SELECT revision FROM role_policy_revisions WHERE id = 1"
    );
    const revoked = await revokeAccountAssignments(testDb(), {
      actor_user_id: ADMIN,
      account_user_id: "E2E_DISPOSABLE_DM",
      base_revision: revision?.revision ?? 1,
      role_definition_ids: [DEPARTMENT_ROLE],
      idempotency_key: "seeds-red-revoke-department",
      now: "2026-08-30T00:00:00.000Z",
      audit_id: "seeds-red-revoke-department-audit",
      correlation_id: "seeds-red-revoke-department-correlation",
    });
    expect(
      revoked.revokedAssignments.some(
        (assignment) => assignment.roleDefinitionId === DEPARTMENT_ROLE
      )
    ).toBe(true);

    await seedDisposableIdentity(testDb(), {
      databaseName: DISPOSABLE_DATABASE,
    });
    const departmentAssignments = await testDb()
      .prepare(
        `SELECT assignment_id, revoked_at FROM role_assignments
          WHERE account_user_id = 'E2E_DISPOSABLE_DM'
            AND role_definition_id = ?
          ORDER BY granted_at`
      )
      .bind(DEPARTMENT_ROLE)
      .all<{ assignment_id: string; revoked_at: string | null }>();
    const activeDepartmentAssignments = (
      departmentAssignments.results ?? []
    ).filter((assignment) => assignment.revoked_at === null);
    const revokedDepartmentAssignments = (
      departmentAssignments.results ?? []
    ).filter((assignment) => assignment.revoked_at !== null);
    expect(activeDepartmentAssignments).toHaveLength(1);
    expect(revokedDepartmentAssignments).toHaveLength(1);
    expect(activeDepartmentAssignments[0]?.assignment_id).not.toBe(
      departmentAssignment?.assignment_id
    );

    const roleRevision = await readScalar<{ revision: number }>(
      "SELECT revision FROM role_policy_revisions WHERE id = 1"
    );
    await mutateRoleDefinitionLifecycle(testDb(), {
      actor_user_id: ADMIN,
      role_definition_id: PROGRAM_ROLE,
      action: "archive",
      base_revision: roleRevision?.revision ?? 1,
      idempotency_key: "seeds-red-archive-program",
      now: "2026-08-30T00:00:01.000Z",
      audit_id: "seeds-red-archive-program-audit",
      correlation_id: "seeds-red-archive-program-correlation",
    });
    const grantsBeforeReseed = await readScalar<{ c: number }>(
      `SELECT COUNT(*) AS c FROM role_definition_grants
        WHERE role_definition_id = ?`,
      PROGRAM_ROLE
    );
    await seedDisposableIdentity(testDb(), {
      databaseName: DISPOSABLE_DATABASE,
    });
    const archivedProgram = await readScalar<{
      is_archived: number;
    }>(
      "SELECT is_archived FROM role_definitions WHERE role_definition_id = ?",
      PROGRAM_ROLE
    );
    const grantsAfterReseed = await readScalar<{ c: number }>(
      `SELECT COUNT(*) AS c FROM role_definition_grants
        WHERE role_definition_id = ?`,
      PROGRAM_ROLE
    );
    const programAssignments = await testDb()
      .prepare(
        `SELECT revoked_at FROM role_assignments
          WHERE account_user_id = 'E2E_DISPOSABLE_PL'
            AND role_definition_id = ?`
      )
      .bind(PROGRAM_ROLE)
      .all<{ revoked_at: string | null }>();
    expect(archivedProgram?.is_archived).toBe(1);
    expect(grantsAfterReseed?.c).toBe(grantsBeforeReseed?.c);
    expect(programAssignments.results ?? []).toHaveLength(1);
    expect(programAssignments.results?.[0]?.revoked_at).not.toBeNull();
  });
});
