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
import { preflightDisposableSchema, seedDisposableIdentity } from "./index";

const DISPOSABLE_DATABASE = "E2E_disposable-local";

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

  test("representative Active Accounts hold the documented baseline 會友基礎 assignment", async () => {
    const memberRoleId = await readScalar<{ role_definition_id: string }>(
      `SELECT role_definition_id FROM role_definitions WHERE stable_key = ?`,
      "member"
    );
    expect(memberRoleId).toBeDefined();
    const expected = [
      "E2E_DISPOSABLE_ADMIN",
      "E2E_DISPOSABLE_STAFF",
      "E2E_DISPOSABLE_DM",
      "E2E_DISPOSABLE_PL",
      "E2E_DISPOSABLE_MEMBER",
    ];
    for (const userId of expected) {
      const row = await readScalar<{ c: number }>(
        `SELECT COUNT(*) AS c FROM role_assignments
          WHERE account_user_id = ? AND role_definition_id = ?
            AND revoked_at IS NULL`,
        userId,
        memberRoleId?.role_definition_id ?? ""
      );
      expect(row).toBeDefined();
      expect(row?.c).toBe(1);
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
});
