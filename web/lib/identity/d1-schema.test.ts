/**
 * #476 — Disposable D1 identity schema contract.
 *
 * These tests exercise the Worker/D1 boundary and disposable D1 binding.
 * They prove clean creation, duplicate rejection, archive-safe history,
 * closed-capability writes, protected-identity immutability, immutable
 * audit, idempotency terminal state, and reset safety.
 *
 * The test path is the natural seam for the role-level disposable contract;
 * Worker handlers, the read projection (#478), and downstream command
 */
/* oxlint-disable vitest/require-top-level-describe, vitest/max-expects, vitest/expect-expect, vitest/prefer-to-be-truthy, vitest/prefer-to-be-falsy, vitest/prefer-strict-equal, eslint/no-await-in-loop, eslint/no-unused-vars -- shared workerd/D1 fixture spans the suites; max-expects is per-acceptance-trace group. */
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, test } from "vitest";

import { applyMigrations, testDb } from "../auth/test-bootstrap";
import { preflightDisposableSchema, seedDisposableIdentity } from "./index";
import {
  applyRoleMutation,
  recordRoleDenial,
  RoleCapabilityCatalogError,
  RoleIdempotencyConflictError,
  RoleRevisionConflictError,
} from "./mutations";
import { CAPABILITY_CATALOG, PROTECTED_STABLE_KEYS } from "./types";

const DISPOSABLE_DATABASE = "E2E_disposable-local";

interface TableNameRow {
  name: string;
}

async function readAllTables(): Promise<string[]> {
  const rows = await testDb()
    .prepare(
      `SELECT name FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
    )
    .all<TableNameRow>();
  return (rows.results ?? []).map((r) => r.name).sort();
}

async function readScalar<T>(
  sql: string,
  ...binds: unknown[]
): Promise<T | undefined> {
  const stmt = testDb().prepare(sql);
  const row = await stmt.bind(...binds).first<T>();
  return row ?? undefined;
}

async function expectAbort(
  fn: () => Promise<unknown>,
  messageFragment: string
): Promise<void> {
  let thrown: unknown = null;
  try {
    await fn();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(Error);
  expect((thrown as Error).message).toContain(messageFragment);
}

describe("#476 disposable D1 schema contract", () => {
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

  test("preflight reports non-disposable database names without touching D1", async () => {
    const result = await preflightDisposableSchema(testDb(), {
      databaseName: "efcc-identity-prod",
    });
    expect(result.kind).toBe("non-disposable");
    if (result.kind !== "non-disposable") {
      throw new Error("expected non-disposable outcome");
    }
    expect(result.resetCommand).toContain("DROP TABLE IF EXISTS");
    expect(result.message).toContain("efcc-identity-prod");
    const tables = await readAllTables();
    expect(tables).toContain("role_definitions");
  });

  test("preflight flags a stale pre-019 schema and never auto-drops", async () => {
    const db = testDb();
    const newTables = [
      "role_categories",
      "role_definitions",
      "role_definition_grants",
      "role_assignments",
      "role_policy_revisions",
      "role_policy_mutations",
      "role_audit_events",
    ];
    const backup = `__backup_${Date.now()}`;
    for (const table of newTables) {
      await db
        .prepare(`ALTER TABLE ${table} RENAME TO ${backup}_${table}`)
        .run();
    }
    try {
      const result = await preflightDisposableSchema(db, {
        databaseName: DISPOSABLE_DATABASE,
      });
      expect(result.kind).toBe("stale-schema");
      if (result.kind !== "stale-schema") {
        throw new Error("expected stale-schema outcome");
      }
      const hasLegacy = result.legacyTables.some(
        (t) =>
          t === "role_capabilities" ||
          t === "permission_policy_state" ||
          t === "permission_policy_mutations"
      );
      expect(hasLegacy).toBeTruthy();
      expect(result.resetCommand).toContain("DROP TABLE IF EXISTS");
    } finally {
      for (const table of newTables) {
        await db
          .prepare(`ALTER TABLE ${backup}_${table} RENAME TO ${table}`)
          .run();
      }
    }
  });

  test("D1 rejects a scoped Role Definition without an explicit scope_id", async () => {
    await expectAbort(async () => {
      await testDb()
        .prepare(
          `INSERT INTO role_definitions
               (role_definition_id, category_key, stable_key, label, description,
                scope_kind, scope_id, position, is_protected, is_archived,
                created_by, created_at, updated_by, updated_at)
             VALUES ('018f3b8a-0000-7000-8000-999900000001', 'Department', 'test.no_scope',
                     'Test', 'Test', 'Department', NULL, 0, 0, 0,
                     NULL, '2026-08-27T00:00:00.000Z', NULL, '2026-08-27T00:00:00.000Z')`
        )
        .run();
    }, "scope_id is required");
  });

  test("D1 rejects a Global Role Definition that carries a scope_id", async () => {
    await expectAbort(async () => {
      await testDb()
        .prepare(
          `INSERT INTO role_definitions
               (role_definition_id, category_key, stable_key, label, description,
                scope_kind, scope_id, position, is_protected, is_archived,
                created_by, created_at, updated_by, updated_at)
             VALUES ('018f3b8a-0000-7000-8000-999900000002', 'Global', 'test.global_with_scope',
                     'Test', 'Test', 'Global', 'not-null', 0, 0, 0,
                     NULL, '2026-08-27T00:00:00.000Z', NULL, '2026-08-27T00:00:00.000Z')`
        )
        .run();
    }, "scope_id is required");
  });

  test("D1 rejects a duplicate active assignment for the same (account, Role Definition)", async () => {
    const dmUser = "E2E_DISPOSABLE_DM";
    const roleId = "018f3b8a-0000-7000-8000-100000000001";
    await expectAbort(async () => {
      await testDb()
        .prepare(
          `INSERT INTO role_assignments
               (assignment_id, account_user_id, role_definition_id,
                granted_by, granted_at, revoked_by, revoked_at, revoke_reason)
             VALUES ('018f3b8a-0000-7000-8000-aaaa00000001', ?, ?,
                     ?, '2026-08-27T00:00:00.000Z', NULL, NULL, NULL)`
        )
        .bind(dmUser, roleId, "E2E_DISPOSABLE_ADMIN")
        .run();
    }, "UNIQUE constraint failed");
  });

  test("D1 rejects a grant whose capability is not in the closed catalog", async () => {
    const roleId = "018f3b8a-0000-7000-8000-100000000001";
    await expectAbort(async () => {
      await testDb()
        .prepare(
          `INSERT INTO role_definition_grants
               (role_definition_id, capability, granted_by, granted_at)
             VALUES (?, 'unknown.capability', NULL, '2026-08-27T00:00:00.000Z')`
        )
        .bind(roleId)
        .run();
    }, "CHECK constraint failed");
  });

  test("D1 rejects UPDATE/DELETE of a protected system identity", async () => {
    const adminRoleId = "018f3b8a-0000-7000-8000-000000000a01";
    await expectAbort(async () => {
      await testDb()
        .prepare(
          `UPDATE role_definitions SET label = 'Hacked' WHERE role_definition_id = ?`
        )
        .bind(adminRoleId)
        .run();
    }, "protected system identity rows are immutable");
    await expectAbort(async () => {
      await testDb()
        .prepare(`DELETE FROM role_definitions WHERE role_definition_id = ?`)
        .bind(adminRoleId)
        .run();
    }, "protected system identity rows are immutable");
  });

  test("D1 rejects UPDATE/DELETE of an audit row", async () => {
    const auditId = "018f3b8a-0000-7000-8000-aaaa00000099";
    await testDb()
      .prepare(
        `INSERT INTO role_audit_events
           (audit_id, inserted_at, actor_user_id, action, entity_type,
            entity_id, old_value_json, new_value_json, reason, outcome, correlation_id)
         VALUES (?, '2026-08-27T00:00:00.000Z', NULL, 'TEST', 'test', 'test',
                 NULL, NULL, NULL, 'SUCCESS', NULL)`
      )
      .bind(auditId)
      .run();
    await expectAbort(async () => {
      await testDb()
        .prepare(
          `UPDATE role_audit_events SET outcome = 'FAILED' WHERE audit_id = ?`
        )
        .bind(auditId)
        .run();
    }, "role_audit_events is immutable");
    await expectAbort(async () => {
      await testDb()
        .prepare(`DELETE FROM role_audit_events WHERE audit_id = ?`)
        .bind(auditId)
        .run();
    }, "role_audit_events is immutable");
  });

  test("applyRoleMutation succeeds once and replays idempotently with the same key", async () => {
    const adminUser = "E2E_DISPOSABLE_ADMIN";
    const base = await readScalar<{ revision: number }>(
      `SELECT revision FROM role_policy_revisions WHERE id = 1`
    );
    expect(base).toBeDefined();
    const memberUser = "E2E_DISPOSABLE_MEMBER";
    const newRoleId = "018f3b8a-0000-7000-8000-100000000099";
    const newAssignmentId = "018f3b8a-0000-7000-8000-100000000099-a1";
    const input = {
      idempotency_key: "t476-idempotent-1",
      request_fingerprint: "fp-1",
      actor_user_id: adminUser,
      base_revision: base?.revision ?? 1,
      now: "2026-08-27T01:00:00.000Z",
      audit_id: "018f3b8a-0000-7000-8000-aaaa00000010",
      desired: [
        {
          kind: "create_role_definition" as const,
          role_definition_id: newRoleId,
          category_key: "Program" as const,
          stable_key: "t476.idempotent.role",
          label: "T476 Idempotent Role",
          description: "Disposable test role",
          scope_kind: "Program" as const,
          scope_id: "018f3b8a-0000-7000-8000-300000000001",
          position: 30,
          capabilities: ["program.manage"],
        },
        {
          kind: "grant_assignment" as const,
          assignment_id: newAssignmentId,
          account_user_id: memberUser,
          role_definition_id: newRoleId,
        },
      ],
      audit_summary: {
        action: "ROLE_DEFINITION_CREATE",
        entity_type: "role_definition",
        entity_id: newRoleId,
        new_value_json: JSON.stringify({ label: "T476 Idempotent Role" }),
      },
    };

    const first = await applyRoleMutation(testDb(), input);
    expect(first.outcome).toBe("SUCCESS");
    expect(first.idempotent).toBeFalsy();
    const after = await readScalar<{ revision: number }>(
      `SELECT revision FROM role_policy_revisions WHERE id = 1`
    );
    expect(after?.revision).toBe((base?.revision ?? 1) + 1);

    const replay = await applyRoleMutation(testDb(), input);
    expect(replay.outcome).toBe("SUCCESS");
    expect(replay.idempotent).toBeTruthy();
    expect(replay.resulting_revision).toBe(after?.revision);

    const roleCount = await readScalar<{ c: number }>(
      `SELECT COUNT(*) AS c FROM role_definitions WHERE role_definition_id = ?`,
      newRoleId
    );
    expect(roleCount?.c).toBe(1);
    const assignmentCount = await readScalar<{ c: number }>(
      `SELECT COUNT(*) AS c FROM role_assignments WHERE role_definition_id = ?`,
      newRoleId
    );
    expect(assignmentCount?.c).toBe(1);
  });

  test("reusing an idempotency key for a different payload is rejected with no second write", async () => {
    const adminUser = "E2E_DISPOSABLE_ADMIN";
    const base = await readScalar<{ revision: number }>(
      `SELECT revision FROM role_policy_revisions WHERE id = 1`
    );
    expect(base).toBeDefined();
    const newRoleId = "018f3b8a-0000-7000-8000-1000000000a0";
    const input = {
      idempotency_key: "t476-reuse-1",
      request_fingerprint: "fp-A",
      actor_user_id: adminUser,
      base_revision: base?.revision ?? 1,
      now: "2026-08-27T02:00:00.000Z",
      audit_id: "018f3b8a-0000-7000-8000-aaaa00000011",
      desired: [
        {
          kind: "create_role_definition" as const,
          role_definition_id: newRoleId,
          category_key: "Program" as const,
          stable_key: "t476.reuse.role",
          label: "T476 Reuse Role",
          description: "Disposable test role",
          scope_kind: "Program" as const,
          scope_id: "018f3b8a-0000-7000-8000-300000000001",
          position: 31,
          capabilities: ["program.manage"],
        },
      ],
      audit_summary: {
        action: "ROLE_DEFINITION_CREATE",
        entity_type: "role_definition",
        entity_id: newRoleId,
        new_value_json: JSON.stringify({ label: "T476 Reuse Role" }),
      },
    };
    await applyRoleMutation(testDb(), input);
    const after = await readScalar<{ revision: number }>(
      `SELECT revision FROM role_policy_revisions WHERE id = 1`
    );
    expect(after).toBeDefined();
    const reused = {
      ...input,
      request_fingerprint: "fp-B",
      base_revision: after?.revision ?? 1,
    };
    await expect(applyRoleMutation(testDb(), reused)).rejects.toBeInstanceOf(
      RoleIdempotencyConflictError
    );
    const final = await readScalar<{ revision: number }>(
      `SELECT revision FROM role_policy_revisions WHERE id = 1`
    );
    expect(final?.revision).toBe(after?.revision);
  });

  test("stale base revision is rejected and the policy is unchanged", async () => {
    const adminUser = "E2E_DISPOSABLE_ADMIN";
    const current = await readScalar<{ revision: number }>(
      `SELECT revision FROM role_policy_revisions WHERE id = 1`
    );
    expect(current).toBeDefined();
    const newRoleId = "018f3b8a-0000-7000-8000-1000000000b0";
    const input = {
      idempotency_key: "t476-stale-1",
      request_fingerprint: "fp-stale",
      actor_user_id: adminUser,
      base_revision: (current?.revision ?? 2) - 1,
      now: "2026-08-27T03:00:00.000Z",
      audit_id: "018f3b8a-0000-7000-8000-aaaa00000012",
      desired: [
        {
          kind: "create_role_definition" as const,
          role_definition_id: newRoleId,
          category_key: "Program" as const,
          stable_key: "t476.stale.role",
          label: "T476 Stale Role",
          description: "Disposable test role",
          scope_kind: "Program" as const,
          scope_id: "018f3b8a-0000-7000-8000-300000000001",
          position: 32,
          capabilities: ["program.manage"],
        },
      ],
      audit_summary: {
        action: "ROLE_DEFINITION_CREATE",
        entity_type: "role_definition",
        entity_id: newRoleId,
        new_value_json: JSON.stringify({ label: "T476 Stale Role" }),
      },
    };
    await expect(applyRoleMutation(testDb(), input)).rejects.toBeInstanceOf(
      RoleRevisionConflictError
    );
    const after = await readScalar<{ revision: number }>(
      `SELECT revision FROM role_policy_revisions WHERE id = 1`
    );
    expect(after?.revision).toBe(current?.revision);
    const roleCount = await readScalar<{ c: number }>(
      `SELECT COUNT(*) AS c FROM role_definitions WHERE role_definition_id = ?`,
      newRoleId
    );
    expect(roleCount?.c).toBe(0);
  });

  test("closed capability set rejects an unknown capability before any D1 write", async () => {
    const adminUser = "E2E_DISPOSABLE_ADMIN";
    const base = await readScalar<{ revision: number }>(
      `SELECT revision FROM role_policy_revisions WHERE id = 1`
    );
    expect(base).toBeDefined();
    const newRoleId = "018f3b8a-0000-7000-8000-1000000000c0";
    const input = {
      idempotency_key: "t476-closed-1",
      request_fingerprint: "fp-closed",
      actor_user_id: adminUser,
      base_revision: base?.revision ?? 1,
      now: "2026-08-27T04:00:00.000Z",
      audit_id: "018f3b8a-0000-7000-8000-aaaa00000013",
      desired: [
        {
          kind: "create_role_definition" as const,
          role_definition_id: newRoleId,
          category_key: "Program" as const,
          stable_key: "t476.closed.role",
          label: "T476 Closed Role",
          description: "Disposable test role",
          scope_kind: "Program" as const,
          scope_id: "018f3b8a-0000-7000-8000-300000000001",
          position: 33,
          capabilities: ["program.manage", "not.a.real.capability"],
        },
      ],
      audit_summary: {
        action: "ROLE_DEFINITION_CREATE",
        entity_type: "role_definition",
        entity_id: newRoleId,
        new_value_json: JSON.stringify({ label: "T476 Closed Role" }),
      },
    };
    await expect(applyRoleMutation(testDb(), input)).rejects.toBeInstanceOf(
      RoleCapabilityCatalogError
    );
    const roleCount = await readScalar<{ c: number }>(
      `SELECT COUNT(*) AS c FROM role_definitions WHERE role_definition_id = ?`,
      newRoleId
    );
    expect(roleCount?.c).toBe(0);
  });

  test("archiving a Role Definition revokes active assignments atomically and writes audit", async () => {
    const adminUser = "E2E_DISPOSABLE_ADMIN";
    const newRoleId = "018f3b8a-0000-7000-8000-1000000000d0";
    const newAssignmentId = "018f3b8a-0000-7000-8000-1000000000d0-a1";
    const base = await readScalar<{ revision: number }>(
      `SELECT revision FROM role_policy_revisions WHERE id = 1`
    );
    expect(base).toBeDefined();
    const memberUser = "E2E_DISPOSABLE_MEMBER";
    const createInput = {
      idempotency_key: "t476-archive-create",
      request_fingerprint: "fp-archive-create",
      actor_user_id: adminUser,
      base_revision: base?.revision ?? 1,
      now: "2026-08-27T05:00:00.000Z",
      audit_id: "018f3b8a-0000-7000-8000-aaaa00000014",
      desired: [
        {
          kind: "create_role_definition" as const,
          role_definition_id: newRoleId,
          category_key: "Program" as const,
          stable_key: "t476.archive.role",
          label: "T476 Archive Role",
          description: "Disposable test role",
          scope_kind: "Program" as const,
          scope_id: "018f3b8a-0000-7000-8000-300000000001",
          position: 34,
          capabilities: ["program.manage"],
        },
        {
          kind: "grant_assignment" as const,
          assignment_id: newAssignmentId,
          account_user_id: memberUser,
          role_definition_id: newRoleId,
        },
      ],
      audit_summary: {
        action: "ROLE_DEFINITION_CREATE",
        entity_type: "role_definition",
        entity_id: newRoleId,
        new_value_json: JSON.stringify({ label: "T476 Archive Role" }),
      },
    };
    await applyRoleMutation(testDb(), createInput);
    const afterCreate = await readScalar<{ revision: number }>(
      `SELECT revision FROM role_policy_revisions WHERE id = 1`
    );
    expect(afterCreate).toBeDefined();
    const activeBefore = await readScalar<{ c: number }>(
      `SELECT COUNT(*) AS c FROM role_assignments
        WHERE role_definition_id = ? AND revoked_at IS NULL`,
      newRoleId
    );
    expect(activeBefore?.c).toBe(1);

    const archiveInput = {
      idempotency_key: "t476-archive-archive",
      request_fingerprint: "fp-archive-archive",
      actor_user_id: adminUser,
      base_revision: afterCreate?.revision ?? 1,
      now: "2026-08-27T05:30:00.000Z",
      audit_id: "018f3b8a-0000-7000-8000-aaaa00000015",
      desired: [
        {
          kind: "archive_role_definition" as const,
          role_definition_id: newRoleId,
        },
      ],
      audit_summary: {
        action: "ROLE_DEFINITION_ARCHIVE",
        entity_type: "role_definition",
        entity_id: newRoleId,
        new_value_json: JSON.stringify({ is_archived: 1 }),
      },
    };
    const archive = await applyRoleMutation(testDb(), archiveInput);
    expect(archive.outcome).toBe("SUCCESS");

    const archivedFlag = await readScalar<{ is_archived: number }>(
      `SELECT is_archived FROM role_definitions WHERE role_definition_id = ?`,
      newRoleId
    );
    expect(archivedFlag?.is_archived).toBe(1);
    const activeAfter = await readScalar<{ c: number }>(
      `SELECT COUNT(*) AS c FROM role_assignments
        WHERE role_definition_id = ? AND revoked_at IS NULL`,
      newRoleId
    );
    expect(activeAfter?.c).toBe(0);
    const revoked = await readScalar<{ c: number }>(
      `SELECT COUNT(*) AS c FROM role_assignments
        WHERE role_definition_id = ? AND revoked_at IS NOT NULL`,
      newRoleId
    );
    expect(revoked?.c).toBe(1);

    await expectAbort(async () => {
      await testDb()
        .prepare(
          `INSERT INTO role_assignments
               (assignment_id, account_user_id, role_definition_id,
                granted_by, granted_at, revoked_by, revoked_at, revoke_reason)
             VALUES ('018f3b8a-0000-7000-8000-1000000000d0-a2', ?, ?,
                     ?, '2026-08-27T05:31:00.000Z', NULL, NULL, NULL)`
        )
        .bind(memberUser, newRoleId, adminUser)
        .run();
    }, "cannot assign an archived Role Definition");
  });

  test("denial audit rows are persisted when the Worker rejects an unauthorized attempt", async () => {
    const auditId = "018f3b8a-0000-7000-8000-aaaa00000d01";
    await recordRoleDenial(testDb(), {
      audit_id: auditId,
      inserted_at: "2026-08-27T06:00:00.000Z",
      actor_user_id: "E2E_DISPOSABLE_STAFF",
      action: "ROLE_DEFINITION_CREATE",
      entity_type: "role_definition",
      entity_id: "t476-attempt-1",
      old_value_json: null,
      new_value_json: null,
      reason: "actor lacks account.permissions.write",
      outcome: "DENIED",
      correlation_id: "t476-denied-1",
    });
    const row = await readScalar<{ outcome: string; action: string }>(
      `SELECT outcome, action FROM role_audit_events WHERE audit_id = ?`,
      auditId
    );
    expect(row).toBeDefined();
    expect(row?.outcome).toBe("DENIED");
    expect(row?.action).toBe("ROLE_DEFINITION_CREATE");
  });

  test("CAPABILITY_CATALOG is closed and matches the schema CHECK set", () => {
    const expected = [
      "department.manage",
      "department.publish",
      "department.module.configure",
      "department.manager.assign",
      "program.manage",
      "program.publish",
      "program.enroll",
      "program.leader.assign",
      "account.permissions.read",
      "account.permissions.write",
      "account.directory.read",
      "registration.approval.manage",
      "home.publish",
    ];
    expect([...CAPABILITY_CATALOG].sort()).toStrictEqual(expected.sort());
    expect(PROTECTED_STABLE_KEYS.ADMIN).toBe("admin");
  });
});
