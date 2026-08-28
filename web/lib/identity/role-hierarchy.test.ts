/**
 * #478 — S5-A03 normalized read-only 身份組 hierarchy + one rename mutation
 * (Spec 091, ADR-0042).
 *
 * Worker/D1 seam (acceptance trace rows H-01–H-16): exercises the read
 * projection and the rename authority guards against the real workerd D1
 * binding with the disposable seeds:
 *
 *   * authorized read with fixed categories, ordered summaries, the
 *     protected Admin / 會友基礎 anchors, scope labels, counts, protected
 *     states, and scope-aware server-projected actions;
 *   * rename success preserving stable ID / assignments / order / scope /
 *     grants and advancing the revision by exactly one, with one SUCCESS
 *     audit row and one terminal idempotency row;
 *   * replay returning the original result with no duplicate audit row;
 *   * name conflict, protected-identity lock, highest-actor lock, scope
 *     lock, self-rename lock, stale revision, and idempotency-key reuse;
 *   * atomic commit of domain / audit / idempotency.
 *
 * The audit/idempotency seam asserts the documented outcome rows and
 * exactly one terminal idempotency row per key.
 */
/* oxlint-disable vitest/require-top-level-describe, vitest/max-expects, vitest/expect-expect, vitest/prefer-expect-resolves, vitest/prefer-to-have-length, vitest/prefer-to-be-truthy, vitest/prefer-to-be-falsy, vitest/prefer-strict-equal, eslint/no-await-in-loop, eslint/no-inline-comments, eslint/no-unused-vars, unicorn/no-await-expression-member -- shared workerd/D1 fixture spans the suite; max-expects is per-acceptance-trace group; inline comments mark fixture IDs. */
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, test } from "vitest";

import { importLegacyUsers } from "../auth/accounts";
import { applyMigrations, testDb } from "../auth/test-bootstrap";
import {
  applyRoleMutation,
  loadRoleHierarchy,
  preflightDisposableSchema,
  seedDisposableIdentity,
  recordRoleDenialForRename,
  renameRoleDefinition,
  RoleHighestProtectedError,
  RoleIdempotencyConflictError,
  RoleInvalidNameError,
  RoleNameConflictError,
  RoleProtectedIdentityError,
  RoleRevisionConflictError,
  RoleScopeMismatchError,
  RoleSelfRenameError,
  RoleTargetNotFoundError,
  ROLE_NAME_MAX_LENGTH,
} from "./index";
import { ROLE_CATEGORY_KEY } from "./types";

const DISPOSABLE_DATABASE = "E2E_disposable-local";

const ADMIN = "E2E_DISPOSABLE_ADMIN";
const STAFF = "E2E_DISPOSABLE_STAFF";
const DEPARTMENT_MANAGER = "E2E_DISPOSABLE_DM";
const PROGRAM_LEADER = "E2E_DISPOSABLE_PL";
const MEMBER = "E2E_DISPOSABLE_MEMBER";

const ADMIN_ROLE = "018f3b8a-0000-7000-8000-000000000a01";
const STAFF_ROLE = "018f3b8a-0000-7000-8000-000000000a02";
const MEMBER_ROLE = "018f3b8a-0000-7000-8000-000000000a03";
const DEPARTMENT_MANAGER_ROLE = "018f3b8a-0000-7000-8000-100000000001"; // 成人部門管理者
const PROGRAM_LEADER_ROLE = "018f3b8a-0000-7000-8000-100000000002"; // 青少年查經帶領

const NOW = "2026-08-28T00:00:00.000Z";

async function readScalar<T>(
  sql: string,
  ...binds: unknown[]
): Promise<T | undefined> {
  const stmt = testDb().prepare(sql);
  const row = await stmt.bind(...binds).first<T>();
  return row ?? undefined;
}

async function readRevision(): Promise<number> {
  const row = await readScalar<{ revision: number }>(
    `SELECT revision FROM role_policy_revisions WHERE id = 1`
  );
  return row?.revision ?? 0;
}

async function readAuditRows(
  action = "ROLE_DEFINITION_RENAME",
  entityId?: string
): Promise<{ outcome: string; reason: string | null }[]> {
  const rows = await testDb()
    .prepare(
      `SELECT outcome, reason FROM role_audit_events
        WHERE action = ? ${entityId ? "AND entity_id = ?" : ""}
        ORDER BY inserted_at ASC`
    )
    .bind(...(entityId ? [action, entityId] : [action]))
    .all<{ outcome: string; reason: string | null }>();
  return rows.results ?? [];
}

async function readMutation(
  key: string
): Promise<{ outcome: string; resulting_revision: number | null } | null> {
  return (
    (await readScalar<{
      outcome: string;
      resulting_revision: number | null;
    }>(
      `SELECT outcome, resulting_revision FROM role_policy_mutations
        WHERE idempotency_key = ?`,
      key
    )) ?? null
  );
}

function renameInput(
  overrides: Partial<Parameters<typeof renameRoleDefinition>[1]> = {}
) {
  return {
    actor_user_id: ADMIN,
    request_fingerprint: "fp-h-05",
    idempotency_key: "h-05-rename",
    base_revision: 1,
    role_definition_id: PROGRAM_LEADER_ROLE,
    label: "青少年查經組長",
    now: NOW,
    audit_id: "018f3b8a-0000-7000-8000-aaaa00000501",
    correlation_id: "corr-h-05",
    ...overrides,
  };
}

describe("#478 role hierarchy and rename contract", () => {
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

  test("H-01/H-03: authorized read shows fixed categories, ordered summaries, anchors, scope, counts, protected state, and server-projected actions", async () => {
    const view = await loadRoleHierarchy(testDb(), ADMIN);

    expect(view.categories.map((category) => category.categoryKey)).toEqual([
      ROLE_CATEGORY_KEY.GLOBAL,
      ROLE_CATEGORY_KEY.DEPARTMENT,
      ROLE_CATEGORY_KEY.PROGRAM,
    ]);
    expect(view.categories.every((category) => category.childCount >= 0)).toBe(
      true
    );
    expect(view.revision).toBeGreaterThanOrEqual(1);

    const global = view.categories.find(
      (category) => category.categoryKey === ROLE_CATEGORY_KEY.GLOBAL
    );
    expect(global).toBeDefined();
    if (!global) {
      throw new Error("missing Global category");
    }
    const admin = global.definitions.find(
      (definition) => definition.roleDefinitionId === ADMIN_ROLE
    );
    const member = global.definitions.find(
      (definition) => definition.roleDefinitionId === MEMBER_ROLE
    );
    expect(admin).toBeDefined();
    expect(member).toBeDefined();
    if (!admin || !member) {
      throw new Error("missing protected anchors");
    }
    // H-01: Admin pinned highest, 會友基礎 pinned lowest, both protected.
    expect(admin.position).toBe(0);
    expect(member.position).toBe(999);
    expect(admin.isProtected).toBe(true);
    expect(member.isProtected).toBe(true);
    expect(admin.actions).toEqual([]);
    expect(member.actions).toEqual([]);

    const department = view.categories.find(
      (category) => category.categoryKey === ROLE_CATEGORY_KEY.DEPARTMENT
    );
    expect(department).toBeDefined();
    if (!department) {
      throw new Error("missing Department category");
    }
    const manager = department.definitions.find(
      (definition) => definition.roleDefinitionId === DEPARTMENT_MANAGER_ROLE
    );
    expect(manager).toBeDefined();
    if (!manager) {
      throw new Error("missing department manager definition");
    }
    // H-03: scope label, position, grant count, assignment count, protected state.
    expect(manager.scopeLabel).toBeTruthy();
    expect(manager.position).toBe(10);
    expect(manager.grantCount).toBe(6);
    expect(manager.assignmentCount).toBe(1);
    expect(manager.isProtected).toBe(false);
    // Admin may rename any lower non-protected definition.
    expect(manager.actions.map((action) => action.action)).toContain("rename");
    // Technical capability keys never appear in the projection.
    expect(JSON.stringify(view)).not.toContain("department.manage");
  });

  test("H-02: expansion state is local to the projection (no persisted state)", async () => {
    // The projection carries no expansion state; the component owns it.
    const view = await loadRoleHierarchy(testDb(), ADMIN);
    const program = view.categories.find(
      (category) => category.categoryKey === ROLE_CATEGORY_KEY.PROGRAM
    );
    expect(program?.childCount).toBe(1);
  });

  test("H-09/H-14 projection: actions appear only strictly below the actor's own highest identity", async () => {
    const view = await loadRoleHierarchy(testDb(), PROGRAM_LEADER);
    const global = view.categories.find(
      (category) => category.categoryKey === ROLE_CATEGORY_KEY.GLOBAL
    );
    const staff = global?.definitions.find(
      (definition) => definition.roleDefinitionId === STAFF_ROLE
    );
    const member = global?.definitions.find(
      (definition) => definition.roleDefinitionId === MEMBER_ROLE
    );
    // PL's highest identity is Staff (position 1, Global scope): Staff and
    // the protected baseline are never actionable.
    expect(staff?.actions).toEqual([]);
    expect(member?.actions).toEqual([]);
    const department = view.categories.find(
      (category) => category.categoryKey === ROLE_CATEGORY_KEY.DEPARTMENT
    );
    const manager = department?.definitions.find(
      (definition) => definition.roleDefinitionId === DEPARTMENT_MANAGER_ROLE
    );
    // Department Manager (position 10) sits below Staff: rename is projected.
    expect(manager?.actions.map((action) => action.action)).toContain("rename");
  });

  test("H-05/H-15: rename commits domain, audit, idempotency, and response atomically", async () => {
    const base = await readRevision();
    const before = await loadRoleHierarchy(testDb(), ADMIN);
    const target = before.categories
      .flatMap((category) => category.definitions)
      .find(
        (definition) => definition.roleDefinitionId === PROGRAM_LEADER_ROLE
      );
    expect(target).toBeDefined();
    if (!target) {
      throw new Error("missing program leader definition");
    }
    const assignmentsBefore = target.assignmentCount;
    const grantsBefore = target.grantCount;

    const result = await renameRoleDefinition(
      testDb(),
      renameInput({ base_revision: base, label: "青少年查經組長" })
    );

    expect(result.roleDefinitionId).toBe(PROGRAM_LEADER_ROLE);
    expect(result.label).toBe("青少年查經組長");
    expect(result.revision).toBe(base + 1);
    expect(result.idempotent).toBe(false);

    // Stable ID, assignments, order position, scope, and grants survive.
    const row = await readScalar<{
      role_definition_id: string;
      label: string;
      scope_kind: string;
      scope_id: string | null;
      position: number;
    }>(
      `SELECT role_definition_id, label, scope_kind, scope_id, position
         FROM role_definitions WHERE role_definition_id = ?`,
      PROGRAM_LEADER_ROLE
    );
    expect(row?.role_definition_id).toBe(PROGRAM_LEADER_ROLE);
    expect(row?.label).toBe("青少年查經組長");
    expect(row?.scope_kind).toBe("Program");
    expect(row?.scope_id).toBe("018f3b8a-0000-7000-8000-300000000001");
    expect(row?.position).toBe(20);

    const after = await loadRoleHierarchy(testDb(), ADMIN);
    const renamed = after.categories
      .flatMap((category) => category.definitions)
      .find(
        (definition) => definition.roleDefinitionId === PROGRAM_LEADER_ROLE
      );
    expect(renamed?.assignmentCount).toBe(assignmentsBefore);
    expect(renamed?.grantCount).toBe(grantsBefore);
    expect(renamed?.position).toBe(20);

    // H-15: audit + idempotency terminal row committed with the rename.
    const audits = await readAuditRows(
      "ROLE_DEFINITION_RENAME",
      PROGRAM_LEADER_ROLE
    );
    expect(audits.filter((audit) => audit.outcome === "SUCCESS")).toHaveLength(
      1
    );
    const mutation = await readMutation("h-05-rename");
    expect(mutation?.outcome).toBe("SUCCESS");
    expect(mutation?.resulting_revision).toBe(base + 1);
  });

  test("H-06: replaying the same idempotency key returns the original result without a new audit row", async () => {
    const mutationBefore = await readMutation("h-05-rename");
    const auditsBefore = await readAuditRows(
      "ROLE_DEFINITION_RENAME",
      PROGRAM_LEADER_ROLE
    );
    const successBefore = auditsBefore.filter(
      (audit) => audit.outcome === "SUCCESS"
    ).length;

    const replay = await renameRoleDefinition(
      testDb(),
      renameInput({
        base_revision: 999, // stale base is irrelevant on replay
        label: "青少年查經組長",
      })
    );

    expect(replay.roleDefinitionId).toBe(PROGRAM_LEADER_ROLE);
    expect(replay.label).toBe("青少年查經組長");
    expect(replay.revision).toBe(mutationBefore?.resulting_revision);
    expect(replay.idempotent).toBe(true);

    const mutationAfter = await readMutation("h-05-rename");
    expect(mutationAfter?.outcome).toBe("SUCCESS");
    const auditsAfter = await readAuditRows(
      "ROLE_DEFINITION_RENAME",
      PROGRAM_LEADER_ROLE
    );
    expect(
      auditsAfter.filter((audit) => audit.outcome === "SUCCESS").length
    ).toBe(successBefore);
  });

  test("H-13: idempotency key reused with a different payload is rejected and audited", async () => {
    const base = await readRevision();
    const auditsBefore = await readAuditRows(
      "ROLE_DEFINITION_RENAME",
      DEPARTMENT_MANAGER_ROLE
    );
    await expect(
      renameRoleDefinition(
        testDb(),
        renameInput({
          idempotency_key: "h-05-rename", // already used for the program leader
          request_fingerprint: "fp-different-payload",
          base_revision: base,
          role_definition_id: DEPARTMENT_MANAGER_ROLE,
          label: "成人部門主管",
          audit_id: "018f3b8a-0000-7000-8000-aaaa00000502",
        })
      )
    ).rejects.toBeInstanceOf(RoleIdempotencyConflictError);
    const auditsAfter = await readAuditRows(
      "ROLE_DEFINITION_RENAME",
      DEPARTMENT_MANAGER_ROLE
    );
    // H-13 documents a REJECTED audit row for key reuse with a different
    // payload; no domain mutation happens (no row was written for this
    // target, the revision is unchanged, and the original SUCCESS row is
    // untouched).
    expect(auditsAfter.length).toBe(auditsBefore.length + 1);
    expect(auditsAfter.at(-1)?.outcome).toBe("REJECTED");
    expect(auditsAfter.at(-1)?.reason).toBe("ROLE_IDEMPOTENCY_REUSE");
    expect(await readRevision()).toBe(base);
  });

  test("H-07: name conflict returns a typed error, no mutation, no revision advance, and a REJECTED audit row", async () => {
    const base = await readRevision();
    const rejectedBefore = (
      await readAuditRows("ROLE_DEFINITION_RENAME", DEPARTMENT_MANAGER_ROLE)
    ).filter((audit) => audit.outcome === "REJECTED").length;
    await expect(
      renameRoleDefinition(
        testDb(),
        renameInput({
          idempotency_key: "h-07-conflict",
          request_fingerprint: "fp-h-07",
          base_revision: base,
          role_definition_id: DEPARTMENT_MANAGER_ROLE,
          label: "系統管理員", // collides with Admin's label (case/space-insensitive)
          audit_id: "018f3b8a-0000-7000-8000-aaaa00000503",
        })
      )
    ).rejects.toBeInstanceOf(RoleNameConflictError);
    expect(await readRevision()).toBe(base);
    const row = await readScalar<{ label: string }>(
      `SELECT label FROM role_definitions WHERE role_definition_id = ?`,
      DEPARTMENT_MANAGER_ROLE
    );
    expect(row?.label).toBe("成人部門管理者");
    const audits = await readAuditRows(
      "ROLE_DEFINITION_RENAME",
      DEPARTMENT_MANAGER_ROLE
    );
    expect(audits.filter((audit) => audit.outcome === "REJECTED").length).toBe(
      rejectedBefore + 1
    );
    const mutation = await readMutation("h-07-conflict");
    expect(mutation).toBeNull();
  });

  test("H-11: empty or over-long names are rejected before any write with no mutation", async () => {
    const base = await readRevision();
    const auditsBefore = await readAuditRows(
      "ROLE_DEFINITION_RENAME",
      DEPARTMENT_MANAGER_ROLE
    );
    // Empty after trimming.
    await expect(
      renameRoleDefinition(
        testDb(),
        renameInput({
          idempotency_key: "h-11-empty",
          request_fingerprint: "fp-h-11-empty",
          base_revision: base,
          role_definition_id: DEPARTMENT_MANAGER_ROLE,
          label: "   ",
          audit_id: "018f3b8a-0000-7000-8000-aaaa0000050c",
        })
      )
    ).rejects.toBeInstanceOf(RoleInvalidNameError);
    // Over the documented 60-character maximum.
    await expect(
      renameRoleDefinition(
        testDb(),
        renameInput({
          idempotency_key: "h-11-long",
          request_fingerprint: "fp-h-11-long",
          base_revision: base,
          role_definition_id: DEPARTMENT_MANAGER_ROLE,
          label: "超".repeat(ROLE_NAME_MAX_LENGTH + 1),
          audit_id: "018f3b8a-0000-7000-8000-aaaa0000050d",
        })
      )
    ).rejects.toBeInstanceOf(RoleInvalidNameError);
    // No mutation: revision, label, and audit rows are all unchanged.
    expect(await readRevision()).toBe(base);
    const row = await readScalar<{ label: string }>(
      `SELECT label FROM role_definitions WHERE role_definition_id = ?`,
      DEPARTMENT_MANAGER_ROLE
    );
    expect(row?.label).toBe("成人部門管理者");
    const auditsAfter = await readAuditRows(
      "ROLE_DEFINITION_RENAME",
      DEPARTMENT_MANAGER_ROLE
    );
    const trimmedMax = ` ${"長".repeat(ROLE_NAME_MAX_LENGTH)} `;
    const baseAfter = await readRevision();
    await expect(
      renameRoleDefinition(
        testDb(),
        renameInput({
          idempotency_key: "h-11-trimmed-max",
          request_fingerprint: "fp-h-11-trimmed",
          base_revision: baseAfter,
          role_definition_id: DEPARTMENT_MANAGER_ROLE,
          label: trimmedMax,
          audit_id: "018f3b8a-0000-7000-8000-aaaa0000050e",
        })
      )
    ).resolves.toMatchObject({ label: "長".repeat(ROLE_NAME_MAX_LENGTH) });
    expect(await readRevision()).toBe(baseAfter + 1);
  });

  test("H-08: Admin and 會友基礎 are locked for every actor", async () => {
    const base = await readRevision();
    for (const roleId of [ADMIN_ROLE, MEMBER_ROLE]) {
      await expect(
        renameRoleDefinition(
          testDb(),
          renameInput({
            idempotency_key: `h-08-${roleId}`,
            request_fingerprint: `fp-h-08-${roleId}`,
            base_revision: base,
            role_definition_id: roleId,
            label: "改名嘗試",
            audit_id: `018f3b8a-0000-7000-8000-aaaa00000504-${roleId}`,
          })
        )
      ).rejects.toBeInstanceOf(RoleProtectedIdentityError);
    }
    expect(await readRevision()).toBe(base);
  });

  test("H-09: an actor cannot rename a Role Definition at or above their highest position", async () => {
    const base = await readRevision();
    // Member's highest identity is 會友基礎 (position 999, the global
    // baseline); every real definition sits at-or-above that, so any
    // target is locked (H-09 highest lock).
    await expect(
      renameRoleDefinition(
        testDb(),
        renameInput({
          actor_user_id: MEMBER,
          idempotency_key: "h-09-member-high",
          request_fingerprint: "fp-h-09",
          base_revision: base,
          role_definition_id: DEPARTMENT_MANAGER_ROLE,
          label: "改名嘗試",
          audit_id: "018f3b8a-0000-7000-8000-aaaa00000505",
        })
      )
    ).rejects.toBeInstanceOf(RoleHighestProtectedError);
    expect(await readRevision()).toBe(base);
  });

  test("H-14: an actor cannot rename their own highest assignment", async () => {
    // Give Member a custom non-protected identity at position 5 — that
    // becomes Member's highest; renaming it is the own-highest lock.
    const base = await readRevision();
    const customRoleId = "018f3b8a-0000-7000-8000-1000000000e1";
    await applyRoleMutation(testDb(), {
      idempotency_key: "h-14-create",
      request_fingerprint: "fp-h-14-create",
      actor_user_id: ADMIN,
      base_revision: base,
      now: NOW,
      audit_id: "018f3b8a-0000-7000-8000-aaaa0000056a",
      desired: [
        {
          kind: "create_role_definition",
          role_definition_id: customRoleId,
          category_key: "Program" as const,
          stable_key: "t478.custom.highest",
          label: "自訂測試角色",
          description: "H-14 fixture",
          scope_kind: "Program" as const,
          scope_id: "018f3b8a-0000-7000-8000-300000000001",
          position: 5,
          capabilities: [],
        },
        {
          kind: "grant_assignment" as const,
          assignment_id: `${customRoleId}-member`,
          account_user_id: MEMBER,
          role_definition_id: customRoleId,
        },
      ],
      audit_summary: {
        action: "ROLE_DEFINITION_CREATE",
        entity_type: "role_definition",
        entity_id: customRoleId,
        new_value_json: JSON.stringify({ label: "自訂測試角色" }),
      },
    });

    const afterCreate = await readRevision();
    await expect(
      renameRoleDefinition(
        testDb(),
        renameInput({
          actor_user_id: MEMBER,
          idempotency_key: "h-14-member-highest",
          request_fingerprint: "fp-h-14",
          base_revision: afterCreate,
          role_definition_id: customRoleId,
          label: "改名嘗試",
          audit_id: "018f3b8a-0000-7000-8000-aaaa00000506",
        })
      )
    ).rejects.toBeInstanceOf(RoleSelfRenameError);
    expect(await readRevision()).toBe(afterCreate);
    const denied = await readAuditRows("ROLE_DEFINITION_RENAME", customRoleId);
    expect(denied.some((audit) => audit.outcome === "DENIED")).toBe(true);
  });

  test("H-10 mutation: an out-of-scope actor cannot rename a Department Manager", async () => {
    // Build a Program-scoped-only actor: a fresh account assigned exactly
    // one Program-scoped identity (plus the non-managing baseline), so
    // their highest identity is Program-scoped and the Department-scoped
    // manager definition is out of scope.
    const base = await readRevision();
    const scopedRoleId = "018f3b8a-0000-7000-8000-1000000000e2";
    const scopedAccount = "E2E_DISPOSABLE_SCOPED_PL";
    await importLegacyUsers(
      testDb(),
      [
        ["User_ID", "Name", "Username", "PIN_Code", "System_Role", "Status"],
        [
          scopedAccount,
          "Disposable Scoped PL",
          "E2E_disposable_scoped_pl",
          "0000",
          "Staff",
          "Active",
        ],
      ],
      Date.parse(NOW)
    );
    await applyRoleMutation(testDb(), {
      idempotency_key: "h-10-create",
      request_fingerprint: "fp-h-10-create",
      actor_user_id: ADMIN,
      base_revision: base,
      now: NOW,
      audit_id: "018f3b8a-0000-7000-8000-aaaa0000057a",
      desired: [
        {
          kind: "create_role_definition",
          role_definition_id: scopedRoleId,
          category_key: "Program" as const,
          stable_key: "t478.scoped.pl",
          label: "青少年查經副帶領",
          description: "H-10 fixture",
          scope_kind: "Program" as const,
          scope_id: "018f3b8a-0000-7000-8000-300000000001",
          // Below the Department Manager (position 10) so the target passes
          // the highest lock and the SCOPE lock is what fires.
          position: 5,
          capabilities: [],
        },
      ],
      audit_summary: {
        action: "ROLE_DEFINITION_CREATE",
        entity_type: "role_definition",
        entity_id: scopedRoleId,
        new_value_json: JSON.stringify({ label: "青少年查經副帶領" }),
      },
    });
    await testDb()
      .prepare(
        `INSERT OR IGNORE INTO role_assignments
           (assignment_id, account_user_id, role_definition_id,
            granted_by, granted_at, revoked_by, revoked_at, revoke_reason)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)`
      )
      .bind(
        `${scopedRoleId}-${scopedAccount}`,
        scopedAccount,
        scopedRoleId,
        ADMIN,
        NOW
      )
      .run();
    // Every eligible account also holds the automatic 會友基礎 baseline;
    // without it the scoped role would be the actor's highest and the
    // target would trip the highest lock before the scope check.
    await testDb()
      .prepare(
        `INSERT OR IGNORE INTO role_assignments
           (assignment_id, account_user_id, role_definition_id,
            granted_by, granted_at, revoked_by, revoked_at, revoke_reason)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)`
      )
      .bind(
        `${MEMBER_ROLE}-${scopedAccount}`,
        scopedAccount,
        MEMBER_ROLE,
        ADMIN,
        NOW
      )
      .run();

    const afterCreate = await readRevision();
    await expect(
      renameRoleDefinition(
        testDb(),
        renameInput({
          actor_user_id: scopedAccount,
          idempotency_key: "h-10-out-of-scope",
          request_fingerprint: "fp-h-10",
          base_revision: afterCreate,
          role_definition_id: DEPARTMENT_MANAGER_ROLE,
          label: "改名嘗試",
          audit_id: "018f3b8a-0000-7000-8000-aaaa00000507",
        })
      )
    ).rejects.toBeInstanceOf(RoleScopeMismatchError);
    expect(await readRevision()).toBe(afterCreate);
    const denied = await readAuditRows(
      "ROLE_DEFINITION_RENAME",
      DEPARTMENT_MANAGER_ROLE
    );
    expect(denied.some((audit) => audit.outcome === "DENIED")).toBe(true);
  });

  test("H-16: the Worker recomputes authority — a tampered direct call is rejected with no mutation", async () => {
    const base = await readRevision();
    // A Member-baseline-only caller has no role-management authority; the
    // authority seam (not the UI projection) must reject the direct call.
    // (H-14 earlier granted the Member a custom Program-scoped identity, so
    // the Department Manager target is now a scope mismatch; either guard
    // proves the Worker recomputes authority — the call never reaches a
    // mutation.)
    await expect(
      renameRoleDefinition(
        testDb(),
        renameInput({
          actor_user_id: MEMBER,
          idempotency_key: "h-16-member-direct",
          request_fingerprint: "fp-h-16",
          base_revision: base,
          role_definition_id: DEPARTMENT_MANAGER_ROLE,
          label: "改名嘗試",
          audit_id: "018f3b8a-0000-7000-8000-aaaa00000508",
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof RoleScopeMismatchError ||
        error instanceof RoleHighestProtectedError
    );
    expect(await readRevision()).toBe(base);
    const denied = await readAuditRows(
      "ROLE_DEFINITION_RENAME",
      DEPARTMENT_MANAGER_ROLE
    );
    expect(denied.some((audit) => audit.outcome === "DENIED")).toBe(true);
  });

  test("H-12: a stale base revision is rejected with the authoritative revision and a CONFLICT audit row", async () => {
    const current = await readRevision();
    await expect(
      renameRoleDefinition(
        testDb(),
        renameInput({
          idempotency_key: "h-12-stale",
          request_fingerprint: "fp-h-12",
          base_revision: current - 10, // stale
          role_definition_id: DEPARTMENT_MANAGER_ROLE,
          label: "成人部門主管",
          audit_id: "018f3b8a-0000-7000-8000-aaaa00000509",
        })
      )
    ).rejects.toMatchObject({ currentRevision: current });
    expect(await readRevision()).toBe(current);
    const audits = await readAuditRows(
      "ROLE_DEFINITION_RENAME",
      DEPARTMENT_MANAGER_ROLE
    );
    expect(audits.some((audit) => audit.outcome === "CONFLICT")).toBe(true);
  });

  test("unknown target is a typed not-found error", async () => {
    await expect(
      renameRoleDefinition(
        testDb(),
        renameInput({
          idempotency_key: "h-unknown",
          request_fingerprint: "fp-unknown",
          role_definition_id: "018f3b8a-0000-7000-8000-00000000dead",
          label: "不存在",
          audit_id: "018f3b8a-0000-7000-8000-aaaa0000050a",
        })
      )
    ).rejects.toBeInstanceOf(RoleTargetNotFoundError);
  });

  test("denial audit rows are recorded for rejected rename attempts", async () => {
    const auditsBefore = await readAuditRows(
      "ROLE_DEFINITION_RENAME",
      DEPARTMENT_MANAGER_ROLE
    );
    await recordRoleDenialForRename(testDb(), {
      actor_user_id: MEMBER,
      role_definition_id: DEPARTMENT_MANAGER_ROLE,
      now: NOW,
      audit_id: "018f3b8a-0000-7000-8000-aaaa0000050b",
      correlation_id: "corr-denied",
      old_label: "成人部門管理者",
      new_label: "改名嘗試",
      outcome: "DENIED",
      reason: "ROLE_HIGHEST_PROTECTED",
    });
    const auditsAfter = await readAuditRows(
      "ROLE_DEFINITION_RENAME",
      DEPARTMENT_MANAGER_ROLE
    );
    expect(auditsAfter.length).toBe(auditsBefore.length + 1);
    expect(auditsAfter.at(-1)?.outcome).toBe("DENIED");
  });
});
