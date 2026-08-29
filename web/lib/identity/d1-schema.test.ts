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
/* oxlint-disable vitest/require-top-level-describe, vitest/max-expects, vitest/expect-expect, vitest/prefer-to-be-truthy, vitest/prefer-to-be-falsy, vitest/prefer-strict-equal, eslint/no-await-in-loop, eslint/no-unused-vars, promise/avoid-new -- shared workerd/D1 fixture spans the suites; max-expects is per-acceptance-trace group; the H-06 barrier needs a manually resolved deferred gate because Promise.withResolvers is ES2024 and the web build targets ES2017. */
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

/**
 * D1 wrapper that holds same-key callers at the batch barrier until every
 * caller has passed preflight, then releases them together. This forces the
 * H-06 concurrency race deterministically: both `applyRoleMutation` calls
 * read "no ledger row, base revision N" before either batch commits, so the
 * loser's INSERT OR IGNORE must lose the PK claim instead of replaying via
 * the sequential fast path.
 */
interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let release!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    release = resolve;
  });
  return { promise, resolve: release };
}

function barrieredDb(db: D1Database): D1Database {
  let arrived = 0;
  // Promise.withResolvers is ES2024; the web build targets ES2017, so build
  // the same deferred gate with the Promise constructor instead.
  const gate = deferred<void>();
  const realBatch = db.batch.bind(db);
  const batch = async (
    statements: D1PreparedStatement[]
  ): Promise<D1Result<unknown>[]> => {
    arrived += 1;
    if (arrived >= 2) {
      gate.resolve();
    }
    await gate.promise;
    return realBatch(statements);
  };
  return new Proxy(db, {
    get(target, prop) {
      if (prop === "batch") {
        return batch;
      }
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
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
    expect(result.resetCommand).toContain("pnpm db:seed:disposable");
    expect(result.resetCommand).toContain("pnpm --dir web db:migrate:local");
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

  test("D1 keeps fixed Role Categories non-assignable and immutable", async () => {
    await expectAbort(async () => {
      await testDb()
        .prepare(
          `UPDATE role_categories SET label = '已篡改'
             WHERE category_key = 'Global'`
        )
        .run();
    }, "role_categories are fixed and non-assignable");
    await expectAbort(async () => {
      await testDb()
        .prepare(
          `UPDATE role_categories SET is_assignable = 1
             WHERE category_key = 'Department'`
        )
        .run();
    }, "role_categories are fixed and non-assignable");
    await expectAbort(async () => {
      await testDb()
        .prepare(`DELETE FROM role_categories WHERE category_key = 'Program'`)
        .run();
    }, "role_categories is fixed and non-assignable");
    const rows = await testDb()
      .prepare(
        `SELECT category_key, is_assignable FROM role_categories
          ORDER BY display_order`
      )
      .all<{ category_key: string; is_assignable: number }>();
    expect(rows.results?.map((row) => row.category_key)).toStrictEqual([
      "Global",
      "Department",
      "Program",
    ]);
    expect(rows.results?.every((row) => row.is_assignable === 0)).toBe(true);
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

  test("D1 allows a custom Role Definition to reparent with its explicit scope", async () => {
    const roleId = "018f3b8a-0000-7000-8000-999900000003";
    await testDb()
      .prepare(
        `INSERT INTO role_definitions
           (role_definition_id, category_key, stable_key, label, description,
            scope_kind, scope_id, position, is_protected, is_archived,
            created_by, created_at, updated_by, updated_at)
         VALUES (?, 'Department', 'test.rescope.boundary', 'Test rescope',
                 'Test', 'Department',
                 '018f3b8a-0000-7000-8000-000000000002', 50, 0, 0,
                 NULL, '2026-08-27T00:00:00.000Z', NULL,
                 '2026-08-27T00:00:00.000Z')`
      )
      .bind(roleId)
      .run();
    await testDb()
      .prepare(
        `UPDATE role_definitions
            SET category_key = 'Program',
                scope_kind = 'Program',
                scope_id = '018f3b8a-0000-7000-8000-300000000001',
                position = 51
          WHERE role_definition_id = ?`
      )
      .bind(roleId)
      .run();
    const row = await readScalar<{
      category_key: string;
      scope_kind: string;
      scope_id: string | null;
      position: number;
    }>(
      `SELECT category_key, scope_kind, scope_id, position
         FROM role_definitions WHERE role_definition_id = ?`,
      roleId
    );
    expect(row).toEqual({
      category_key: "Program",
      scope_kind: "Program",
      scope_id: "018f3b8a-0000-7000-8000-300000000001",
      position: 51,
    });
    await testDb()
      .prepare(`DELETE FROM role_definitions WHERE role_definition_id = ?`)
      .bind(roleId)
      .run();
  });

  test("D1 rejects a duplicate active assignment for the same (account, Role Definition)", async () => {
    const dmUser = "E2E_DISPOSABLE_DM";
    const roleId = "018f3b8a-0000-7000-8000-100000000001";
    await expectAbort(async () => {
      await testDb()
        .prepare(
          `INSERT INTO role_assignments
               (assignment_id, account_user_id, role_definition_id,
                granted_by, granted_at, scope_kind, scope_id,
                revoked_by, revoked_at, revoke_reason)
             VALUES ('018f3b8a-0000-7000-8000-aaaa00000001', ?, ?,
                     ?, '2026-08-27T00:00:00.000Z', 'Department',
                     '018f3b8a-0000-7000-8000-000000000002', NULL, NULL, NULL)`
        )
        .bind(dmUser, roleId, "E2E_DISPOSABLE_ADMIN")
        .run();
    }, "UNIQUE constraint failed");
  });
  test("D1 backfills assignment scope snapshots and keeps them immutable", async () => {
    const snapshot = await readScalar<{
      scope_kind: string;
      scope_id: string | null;
    }>(
      `SELECT scope_kind, scope_id
         FROM role_assignments
        WHERE account_user_id = 'E2E_DISPOSABLE_DM'
          AND role_definition_id = '018f3b8a-0000-7000-8000-100000000001'
          AND revoked_at IS NULL`
    );
    expect(snapshot).toEqual({
      scope_kind: "Department",
      scope_id: "018f3b8a-0000-7000-8000-000000000002",
    });
    await expectAbort(async () => {
      await testDb()
        .prepare(
          `UPDATE role_assignments
              SET scope_kind = 'Global', scope_id = NULL
            WHERE account_user_id = 'E2E_DISPOSABLE_DM'
              AND role_definition_id = '018f3b8a-0000-7000-8000-100000000001'
              AND revoked_at IS NULL`
        )
        .run();
    }, "scope snapshot is immutable");
  });

  test("D1 permits only one active-to-revoked transition and protects terminal history", async () => {
    const assignmentId = "018f3b8a-0000-7000-8000-aaaa00000024-terminal-guard";
    const roleId = "018f3b8a-0000-7000-8000-100000000001";
    await testDb()
      .prepare(
        `INSERT INTO role_assignments
             (assignment_id, account_user_id, role_definition_id,
              granted_by, granted_at, scope_kind, scope_id,
              revoked_by, revoked_at, revoke_reason)
         VALUES (?, 'E2E_DISPOSABLE_MEMBER', ?, 'E2E_DISPOSABLE_ADMIN',
                 '2026-08-29T00:00:00.000Z', 'Department',
                 '018f3b8a-0000-7000-8000-000000000002', NULL, NULL, NULL)`
      )
      .bind(assignmentId, roleId)
      .run();
    await testDb()
      .prepare(
        `UPDATE role_assignments
            SET revoked_by = 'E2E_DISPOSABLE_ADMIN',
                revoked_at = '2026-08-29T00:01:00.000Z',
                revoke_reason = 'terminal-test'
          WHERE assignment_id = ?`
      )
      .bind(assignmentId)
      .run();

    await expectAbort(
      () =>
        testDb()
          .prepare(
            "UPDATE role_assignments SET account_user_id = ? WHERE assignment_id = ?"
          )
          .bind("E2E_DISPOSABLE_ADMIN", assignmentId)
          .run(),
      "terminal assignment rows are immutable"
    );
    await expectAbort(
      () =>
        testDb()
          .prepare(
            "UPDATE role_assignments SET role_definition_id = ? WHERE assignment_id = ?"
          )
          .bind("018f3b8a-0000-7000-8000-100000000002", assignmentId)
          .run(),
      "terminal assignment rows are immutable"
    );
    await expectAbort(
      () =>
        testDb()
          .prepare(
            "UPDATE role_assignments SET granted_by = ? WHERE assignment_id = ?"
          )
          .bind("E2E_DISPOSABLE_MEMBER", assignmentId)
          .run(),
      "terminal assignment rows are immutable"
    );
    await expectAbort(
      () =>
        testDb()
          .prepare(
            "UPDATE role_assignments SET granted_at = ? WHERE assignment_id = ?"
          )
          .bind("2026-08-29T00:02:00.000Z", assignmentId)
          .run(),
      "terminal assignment rows are immutable"
    );
    await expectAbort(
      () =>
        testDb()
          .prepare(
            "UPDATE role_assignments SET revoked_by = NULL WHERE assignment_id = ?"
          )
          .bind(assignmentId)
          .run(),
      "terminal assignment rows are immutable"
    );
    await expectAbort(
      () =>
        testDb()
          .prepare(
            "UPDATE role_assignments SET revoked_at = NULL WHERE assignment_id = ?"
          )
          .bind(assignmentId)
          .run(),
      "terminal assignment rows are immutable"
    );
    await expectAbort(
      () =>
        testDb()
          .prepare(
            "UPDATE role_assignments SET revoke_reason = ? WHERE assignment_id = ?"
          )
          .bind("rewritten", assignmentId)
          .run(),
      "terminal assignment rows are immutable"
    );
    await expectAbort(
      () =>
        testDb()
          .prepare("DELETE FROM role_assignments WHERE assignment_id = ?")
          .bind(assignmentId)
          .run(),
      "terminal assignment rows are immutable"
    );
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

  test("D1 rejects UPDATE/DELETE of every protected system-identity column", async () => {
    const anchorIds = [
      "018f3b8a-0000-7000-8000-000000000a01",
      "018f3b8a-0000-7000-8000-000000000a03",
    ];
    const columnUpdates = [
      ["category_key", "'Department'"],
      ["stable_key", "'protected.changed'"],
      ["label", "'Hacked'"],
      ["description", "'Hacked'"],
      ["scope_kind", "'Department'"],
      ["scope_id", "'scope-changed'"],
      ["position", "2"],
      ["is_protected", "0"],
      ["is_archived", "1"],
      ["created_by", "NULL"],
      ["created_at", "'2026-08-28T00:00:00.000Z'"],
      ["updated_by", "NULL"],
      ["updated_at", "'2026-08-28T00:00:00.000Z'"],
    ] as const;

    for (const roleId of anchorIds) {
      for (const [column, value] of columnUpdates) {
        await expectAbort(async () => {
          await testDb()
            .prepare(
              `UPDATE role_definitions SET ${column} = ${value}
                WHERE role_definition_id = ?`
            )
            .bind(roleId)
            .run();
        }, "protected system identity rows are immutable");
      }
      await expectAbort(async () => {
        await testDb()
          .prepare(`DELETE FROM role_definitions WHERE role_definition_id = ?`)
          .bind(roleId)
          .run();
      }, "protected system identity rows are immutable");
    }
  });

  test("Staff remains assignable and writable at the D1 boundary", async () => {
    const staffRoleId = "018f3b8a-0000-7000-8000-000000000a02";
    await expectAbort(async () => {
      await testDb()
        .prepare(
          `UPDATE role_definitions SET is_protected = 1
            WHERE role_definition_id = ?`
        )
        .bind(staffRoleId)
        .run();
    }, "Staff must remain assignable");
    await testDb()
      .prepare(
        `UPDATE role_definitions SET label = ? WHERE role_definition_id = ?`
      )
      .bind("同工測試", staffRoleId)
      .run();
    const changed = await readScalar<{ label: string; is_protected: number }>(
      `SELECT label, is_protected FROM role_definitions WHERE role_definition_id = ?`,
      staffRoleId
    );
    expect(changed?.label).toBe("同工測試");
    expect(changed?.is_protected).toBe(0);
    await expectAbort(async () => {
      await testDb()
        .prepare(
          `UPDATE role_definitions
              SET role_definition_id = '018f3b8a-0000-7000-8000-9999000000a1'
            WHERE role_definition_id = ?`
        )
        .bind(staffRoleId)
        .run();
    }, "role_definition_id is immutable");
    await testDb()
      .prepare(
        `UPDATE role_definitions SET label = ? WHERE role_definition_id = ?`
      )
      .bind("同工", staffRoleId)
      .run();
    const assignment = await readScalar<{ c: number }>(
      `SELECT COUNT(*) AS c FROM role_assignments
         WHERE role_definition_id = ? AND revoked_at IS NULL`,
      staffRoleId
    );
    expect(assignment?.c).toBeGreaterThan(0);
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

  test("D1 rejects UPDATE/DELETE of a terminal role_policy_mutations row, and replays remain idempotent", async () => {
    const adminUser = "E2E_DISPOSABLE_ADMIN";
    const base = await readScalar<{ revision: number }>(
      `SELECT revision FROM role_policy_revisions WHERE id = 1`
    );
    expect(base).toBeDefined();
    const newRoleId = "018f3b8a-0000-7000-8000-100000001000";
    const input = {
      idempotency_key: "t476-terminal-imm-1",
      request_fingerprint: "fp-terminal-1",
      actor_user_id: adminUser,
      base_revision: base?.revision ?? 1,
      now: "2026-08-27T07:00:00.000Z",
      audit_id: "018f3b8a-0000-7000-8000-aaaa00000016",
      desired: [
        {
          kind: "create_role_definition" as const,
          role_definition_id: newRoleId,
          category_key: "Program" as const,
          stable_key: "t476.terminal.role",
          label: "T476 Terminal Role",
          description: "Disposable test role",
          scope_kind: "Program" as const,
          scope_id: "018f3b8a-0000-7000-8000-300000000001",
          position: 50,
          capabilities: ["program.manage"],
        },
      ],
      audit_summary: {
        action: "ROLE_DEFINITION_CREATE",
        entity_type: "role_definition",
        entity_id: newRoleId,
        new_value_json: JSON.stringify({ label: "T476 Terminal Role" }),
      },
    };
    // First call commits the mutation and flips the ledger row to terminal.
    const first = await applyRoleMutation(testDb(), input);
    expect(first.outcome).toBe("SUCCESS");
    expect(first.idempotent).toBe(false);

    // The terminal row is now immutable: a follow-up UPDATE that
    // rewrites outcome or resulting_revision is rejected by the trigger.
    await expectAbort(async () => {
      await testDb()
        .prepare(
          `UPDATE role_policy_mutations
                SET outcome = 'CONFLICT', resulting_revision = 0
              WHERE idempotency_key = ?`
        )
        .bind(input.idempotency_key)
        .run();
    }, "terminal idempotency rows are immutable");
    // DELETE is rejected too.
    await expectAbort(async () => {
      await testDb()
        .prepare(`DELETE FROM role_policy_mutations WHERE idempotency_key = ?`)
        .bind(input.idempotency_key)
        .run();
    }, "terminal idempotency rows are immutable");

    // The terminal row is byte-for-byte unchanged after both blocked
    // attempts: the prior SUCCESS outcome and resulting revision survive.
    const after = await readScalar<{
      outcome: string;
      resulting_revision: number | null;
    }>(
      `SELECT outcome, resulting_revision FROM role_policy_mutations
        WHERE idempotency_key = ?`,
      input.idempotency_key
    );
    expect(after?.outcome).toBe("SUCCESS");
    expect(after?.resulting_revision).toBe((base?.revision ?? 1) + 1);

    // The legitimate atomic path stays open: a replay of the same
    // (idempotency_key, request_fingerprint) returns the original
    // terminal record without inserting any new state.
    const replay = await applyRoleMutation(testDb(), input);
    expect(replay.outcome).toBe("SUCCESS");
    expect(replay.idempotent).toBe(true);
    expect(replay.resulting_revision).toBe(after?.resulting_revision);

    const ledgerCount = await readScalar<{ c: number }>(
      `SELECT COUNT(*) AS c FROM role_policy_mutations WHERE idempotency_key = ?`,
      input.idempotency_key
    );
    expect(ledgerCount?.c).toBe(1);

    // The legitimate atomic path stays open on a fresh idempotency key
    // too: the PENDING → terminal flow still commits as before.
    const freshRoleId = "018f3b8a-0000-7000-8000-100000001001";
    const base2 = await readScalar<{ revision: number }>(
      `SELECT revision FROM role_policy_revisions WHERE id = 1`
    );
    const fresh = {
      ...input,
      idempotency_key: "t476-terminal-imm-2",
      request_fingerprint: "fp-terminal-2",
      audit_id: "018f3b8a-0000-7000-8000-aaaa00000017",
      base_revision: base2?.revision ?? 1,
      desired: [
        {
          kind: "create_role_definition" as const,
          role_definition_id: freshRoleId,
          category_key: "Program" as const,
          stable_key: "t476.terminal2.role",
          label: "T476 Terminal Role 2",
          description: "Disposable test role",
          scope_kind: "Program" as const,
          scope_id: "018f3b8a-0000-7000-8000-300000000001",
          position: 51,
          capabilities: ["program.manage"],
        },
      ],
      audit_summary: {
        action: "ROLE_DEFINITION_CREATE",
        entity_type: "role_definition",
        entity_id: freshRoleId,
        new_value_json: JSON.stringify({ label: "T476 Terminal Role 2" }),
      },
    };
    const freshResult = await applyRoleMutation(testDb(), fresh);
    expect(freshResult.outcome).toBe("SUCCESS");
    expect(freshResult.idempotent).toBe(false);
  });
  test("kernel reserves terminal no-ops and rejects a changed key reuse", async () => {
    const base = await readScalar<{ revision: number }>(
      `SELECT revision FROM role_policy_revisions WHERE id = 1`
    );
    const input = {
      idempotency_key: "t485-noop-reservation",
      request_fingerprint: "fp-485-noop",
      actor_user_id: "E2E_DISPOSABLE_ADMIN",
      base_revision: base?.revision ?? 1,
      now: "2026-08-29T08:00:00.000Z",
      audit_id: "t485-noop-audit",
      result_json: JSON.stringify({ revision: base?.revision ?? 1 }),
      desired: [] as const,
      audit_summary: {
        action: "ROLE_DEFINITION_POLICY_UPDATE",
        entity_type: "role_definition",
        entity_id: "t485-noop",
      },
    };
    const first = await applyRoleMutation(testDb(), input);
    expect(first.outcome).toBe("SUCCESS");
    expect(first.idempotent).toBe(false);
    expect(first.resulting_revision).toBe(input.base_revision);
    expect(first.result_json).toBe(input.result_json);
    const unchanged = await readScalar<{ revision: number }>(
      `SELECT revision FROM role_policy_revisions WHERE id = 1`
    );
    expect(unchanged?.revision).toBe(input.base_revision);
    const auditCount = await readScalar<{ count: number }>(
      `SELECT COUNT(*) AS count FROM role_audit_events WHERE audit_id = ?`,
      input.audit_id
    );
    expect(auditCount?.count).toBe(0);

    const replay = await applyRoleMutation(testDb(), input);
    expect(replay.idempotent).toBe(true);
    expect(replay.result_json).toBe(input.result_json);
    await expect(
      applyRoleMutation(testDb(), {
        ...input,
        request_fingerprint: "fp-485-noop-changed",
      })
    ).rejects.toBeInstanceOf(RoleIdempotencyConflictError);
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
          scope_kind: "Program" as const,
          scope_id: "018f3b8a-0000-7000-8000-300000000001",
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

  test("H-06: concurrent same-key mutations commit once and the loser replays the authoritative result", async () => {
    const adminUser = "E2E_DISPOSABLE_ADMIN";
    const base = await readScalar<{ revision: number }>(
      `SELECT revision FROM role_policy_revisions WHERE id = 1`
    );
    expect(base).toBeDefined();
    const newRoleId = "018f3b8a-0000-7000-8000-1000000000e2";
    const key = "t476-concurrent-same-key";
    const fingerprint = "fp-concurrent-same-key";
    const makeInput = (auditId: string, correlationId: string) => ({
      idempotency_key: key,
      request_fingerprint: fingerprint,
      actor_user_id: adminUser,
      base_revision: base?.revision ?? 1,
      now: "2026-08-27T08:00:00.000Z",
      audit_id: auditId,
      correlation_id: correlationId,
      desired: [
        {
          kind: "create_role_definition" as const,
          role_definition_id: newRoleId,
          category_key: "Program" as const,
          stable_key: "t478.concurrent.race.role",
          label: "T478 Concurrent Race Role",
          description: "Disposable concurrent race fixture",
          scope_kind: "Program" as const,
          scope_id: "018f3b8a-0000-7000-8000-300000000001",
          position: 60,
          capabilities: ["program.manage"],
        },
      ],
      audit_summary: {
        action: "ROLE_DEFINITION_CREATE",
        entity_type: "role_definition",
        entity_id: newRoleId,
        new_value_json: JSON.stringify({ label: "T478 Concurrent Race Role" }),
      },
    });
    const auditA = "018f3b8a-0000-7000-8000-aaaa00000020";
    const auditB = "018f3b8a-0000-7000-8000-aaaa00000021";
    // The barrier holds both calls at db.batch until each has passed
    // preflight, so both believe "no ledger row, revision N" and race for
    // the idempotency-key PK instead of replaying via the fast path.
    const db = barrieredDb(testDb());
    const [first, second] = await Promise.all([
      applyRoleMutation(db, makeInput(auditA, "corr-race-a")),
      applyRoleMutation(db, makeInput(auditB, "corr-race-b")),
    ]);
    // Exactly one caller claimed the key; the other is an identifiable
    // replay of the authoritative result — never a second SUCCESS.
    const outcomes = [first, second].map((result) => result.outcome);
    const idempotentFlags = [first, second].map((result) => result.idempotent);
    expect(outcomes).toStrictEqual(["SUCCESS", "SUCCESS"]);
    expect(idempotentFlags.filter(Boolean)).toHaveLength(1);
    expect(idempotentFlags.filter((flag) => !flag)).toHaveLength(1);
    for (const result of [first, second]) {
      expect(result.resulting_revision).toBe((base?.revision ?? 1) + 1);
      expect(result.created).toBe(!result.idempotent);
    }

    // One committed mutation: one role row, one revision advance, one
    // ledger row, one SUCCESS audit (only the winner's audit_id exists).
    const roleCount = await readScalar<{ c: number }>(
      `SELECT COUNT(*) AS c FROM role_definitions WHERE role_definition_id = ?`,
      newRoleId
    );
    expect(roleCount?.c).toBe(1);
    const revision = await readScalar<{ revision: number }>(
      `SELECT revision FROM role_policy_revisions WHERE id = 1`
    );
    expect(revision?.revision).toBe((base?.revision ?? 1) + 1);
    const ledger = await readScalar<{ c: number; outcome: string }>(
      `SELECT COUNT(*) AS c, MAX(outcome) AS outcome
         FROM role_policy_mutations WHERE idempotency_key = ?`,
      key
    );
    expect(ledger?.c).toBe(1);
    expect(ledger?.outcome).toBe("SUCCESS");
    const audit = await readScalar<{ c: number; outcome: string }>(
      `SELECT COUNT(*) AS c, MAX(outcome) AS outcome
         FROM role_audit_events WHERE entity_id = ?`,
      newRoleId
    );
    expect(audit?.c).toBe(1);
    expect(audit?.outcome).toBe("SUCCESS");
    const winnerAudits = await readScalar<{ c: number }>(
      `SELECT COUNT(*) AS c FROM role_audit_events
        WHERE audit_id IN (?, ?)`,
      auditA,
      auditB
    );
    expect(winnerAudits?.c).toBe(1);

    // A later sequential replay of the same key returns the same
    // authoritative result without any new audit or state.
    const replay = await applyRoleMutation(
      testDb(),
      makeInput(auditA, "corr-race-replay")
    );
    expect(replay.outcome).toBe("SUCCESS");
    expect(replay.idempotent).toBe(true);
    expect(replay.resulting_revision).toBe(revision?.revision);
    const auditsAfterReplay = await readScalar<{ c: number }>(
      `SELECT COUNT(*) AS c FROM role_audit_events WHERE entity_id = ?`,
      newRoleId
    );
    expect(auditsAfterReplay?.c).toBe(1);
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

  test("actor-bound idempotency rejects the same key from another actor", async () => {
    const base = await readScalar<{ revision: number }>(
      `SELECT revision FROM role_policy_revisions WHERE id = 1`
    );
    const roleId = "018f3b8a-0000-7000-8000-1000000000a1";
    const input = {
      idempotency_key: "t476-actor-bound",
      request_fingerprint: "same-client-fingerprint",
      actor_user_id: "E2E_DISPOSABLE_ADMIN",
      base_revision: base?.revision ?? 1,
      now: "2026-08-27T03:30:00.000Z",
      audit_id: "018f3b8a-0000-7000-8000-aaaa00000018",
      desired: [
        {
          kind: "create_role_definition" as const,
          role_definition_id: roleId,
          category_key: "Program" as const,
          stable_key: "t476.actor.bound",
          label: "T476 Actor Bound",
          description: "Disposable actor-bound fixture",
          scope_kind: "Program" as const,
          scope_id: "018f3b8a-0000-7000-8000-300000000001",
          position: 52,
          capabilities: [],
        },
      ],
      audit_summary: {
        action: "ROLE_DEFINITION_CREATE",
        entity_type: "role_definition",
        entity_id: roleId,
        new_value_json: JSON.stringify({ label: "T476 Actor Bound" }),
      },
    };
    await applyRoleMutation(testDb(), input);
    await expect(
      applyRoleMutation(testDb(), {
        ...input,
        actor_user_id: "E2E_DISPOSABLE_STAFF",
        audit_id: "018f3b8a-0000-7000-8000-aaaa00000019",
      })
    ).rejects.toBeInstanceOf(RoleIdempotencyConflictError);
    const row = await readScalar<{
      actor_user_id: string;
      outcome: string;
    }>(
      `SELECT actor_user_id, outcome FROM role_policy_mutations
        WHERE idempotency_key = ?`,
      input.idempotency_key
    );
    expect(row?.actor_user_id).toBe("E2E_DISPOSABLE_ADMIN");
    expect(row?.outcome).toBe("SUCCESS");
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
          scope_kind: "Program" as const,
          scope_id: "018f3b8a-0000-7000-8000-300000000001",
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
                granted_by, granted_at, scope_kind, scope_id,
                revoked_by, revoked_at, revoke_reason)
             VALUES ('018f3b8a-0000-7000-8000-1000000000d0-a2', ?, ?,
                     ?, '2026-08-27T05:31:00.000Z', 'Program',
                     '018f3b8a-0000-7000-8000-300000000001', NULL, NULL, NULL)`
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
      "role.read",
      "role.assign",
      "role.revoke",
      "role.reorder",
      "role.name.write",
      "role.permissions.read",
      "role.permissions.write",
      "role.scope.read",
      "role.scope.write",
      "role.create",
      "role.delete",
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
    expect(
      CAPABILITY_CATALOG.map((entry) => entry.capability).sort()
    ).toStrictEqual(expected.sort());
    expect(PROTECTED_STABLE_KEYS.ADMIN).toBe("admin");
  });
});
