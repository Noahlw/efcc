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
  canonicalRenameFingerprint,
  canonicalRescopeFingerprint,
  rescopeRoleDefinition,
  createRoleDefinition,
  reorderRoleDefinitions,
  RoleAdminProtectedError,
  RoleArchivedError,
  RoleBaselineProtectedError,
  RoleCapabilityDeniedError,
  RoleHighestProtectedError,
  RoleIdempotencyConflictError,
  RoleInvalidNameError,
  RoleNameConflictError,
  RoleRevisionConflictError,
  RoleScopeMismatchError,
  RoleSelfRenameError,
  RoleTargetNotFoundError,
  RoleOrderConflictError,
  RoleInvalidParentError,
  RoleCrossCategoryError,
  RoleScopeRequiredError,
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
    const staff = global.definitions.find(
      (definition) => definition.roleDefinitionId === STAFF_ROLE
    );
    expect(staff).toBeDefined();
    if (!staff) {
      throw new Error("missing assignable Staff identity");
    }
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
    expect(staff.isProtected).toBe(false);
    expect(staff.actions.map((action) => action.action)).toContain("rename");

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
    expect(manager.grantCount).toBe(12);
    expect(manager.assignmentCount).toBe(1);
    expect(manager.isProtected).toBe(false);
    // Admin may rename any lower non-protected definition.
    expect(manager.actions.map((action) => action.action)).toContain("rename");
    // Technical capability keys never appear in the projection.
    expect(JSON.stringify(view)).not.toContain("department.manage");
  });

  test("H-03 distinguishes a custom Global identity from system anchors", async () => {
    const roleId = "018f3b8a-0000-7000-8000-1000000000f1";
    const base = await readRevision();
    await applyRoleMutation(testDb(), {
      idempotency_key: "h-03-custom-global",
      request_fingerprint: "fp-h-03-custom-global",
      actor_user_id: ADMIN,
      base_revision: base,
      now: NOW,
      audit_id: "018f3b8a-0000-7000-8000-aaaa0000050f",
      desired: [
        {
          kind: "create_role_definition",
          role_definition_id: roleId,
          category_key: "Global",
          stable_key: "t478.custom.global",
          label: "全域自訂身份組",
          description: "H-03 custom Global fixture",
          scope_kind: "Global",
          scope_id: null,
          position: 30,
          capabilities: [],
        },
      ],
      audit_summary: {
        action: "ROLE_DEFINITION_CREATE",
        entity_type: "role_definition",
        entity_id: roleId,
        new_value_json: JSON.stringify({ label: "全域自訂身份組" }),
      },
    });
    const view = await loadRoleHierarchy(testDb(), ADMIN);
    const custom = view.categories
      .flatMap((category) => category.definitions)
      .find((definition) => definition.roleDefinitionId === roleId);
    expect(custom?.kind).toBe("GLOBAL");
    expect(custom?.isProtected).toBe(false);
    expect(custom?.actions.map((action) => action.action)).toContain("rename");
  });

  test("H-13: canonical rename fingerprints are actor-bound", () => {
    const input = {
      role_definition_id: DEPARTMENT_MANAGER_ROLE,
      base_revision: 7,
      label: "  成人部門管理者  ",
    };
    expect(
      canonicalRenameFingerprint({ actor_user_id: ADMIN, ...input })
    ).not.toBe(canonicalRenameFingerprint({ actor_user_id: STAFF, ...input }));
    expect(
      canonicalRenameFingerprint({ actor_user_id: ADMIN, ...input })
    ).toContain("|成人部門管理者");
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
    // The fixture assigns PL the global Staff identity, so Staff's
    // role-management grants are effective for lower definitions.
    expect(staff?.isProtected).toBe(false);
    expect(manager?.actions.map((action) => action.action)).toEqual([
      "rename",
      "scope",
      "permissions",
    ]);
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
    const audit = await readScalar<{
      actor_user_id: string;
      old_value_json: string;
      new_value_json: string;
      reason: string;
      correlation_id: string;
    }>(
      `SELECT actor_user_id, old_value_json, new_value_json, reason, correlation_id
         FROM role_audit_events WHERE audit_id = ?`,
      "018f3b8a-0000-7000-8000-aaaa00000501"
    );
    expect(audit?.actor_user_id).toBe(ADMIN);
    expect(JSON.parse(audit?.old_value_json ?? "{}").label).toBe(
      "青少年查經帶領"
    );
    expect(JSON.parse(audit?.new_value_json ?? "{}").label).toBe(
      "青少年查經組長"
    );
    expect(audit?.reason).toBe(`base=${base};new=${base + 1};idem=h-05-rename`);
    expect(audit?.correlation_id).toBe("corr-h-05");
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
        base_revision: (mutationBefore?.resulting_revision ?? 2) - 1,
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

  test("H-12: concurrent rename revision race yields one success and one conflict", async () => {
    const roleA = "018f3b8a-0000-7000-8000-1000000000f2";
    const roleB = "018f3b8a-0000-7000-8000-1000000000f3";
    const createBase = await readRevision();
    await applyRoleMutation(testDb(), {
      idempotency_key: "h-12-race-create",
      request_fingerprint: "fp-h-12-race-create",
      actor_user_id: ADMIN,
      base_revision: createBase,
      now: NOW,
      audit_id: "018f3b8a-0000-7000-8000-aaaa00000510",
      desired: [
        {
          kind: "create_role_definition",
          role_definition_id: roleA,
          category_key: "Program",
          stable_key: "t478.race.a",
          label: "競爭角色甲",
          description: "H-12 race fixture A",
          scope_kind: "Program",
          scope_id: "018f3b8a-0000-7000-8000-300000000001",
          position: 40,
          capabilities: [],
        },
        {
          kind: "create_role_definition",
          role_definition_id: roleB,
          category_key: "Program",
          stable_key: "t478.race.b",
          label: "競爭角色乙",
          description: "H-12 race fixture B",
          scope_kind: "Program",
          scope_id: "018f3b8a-0000-7000-8000-300000000001",
          position: 41,
          capabilities: [],
        },
      ],
      audit_summary: {
        action: "ROLE_DEFINITION_CREATE",
        entity_type: "role_definition",
        entity_id: roleA,
        new_value_json: JSON.stringify({ label: "競爭角色甲" }),
      },
    });
    const base = await readRevision();
    const results = await Promise.allSettled([
      renameRoleDefinition(
        testDb(),
        renameInput({
          idempotency_key: "h-12-race-a",
          base_revision: base,
          role_definition_id: roleA,
          label: "競爭角色甲更新",
          audit_id: "018f3b8a-0000-7000-8000-aaaa00000511",
          correlation_id: "corr-h-12-race-a",
        })
      ),
      renameRoleDefinition(
        testDb(),
        renameInput({
          idempotency_key: "h-12-race-b",
          base_revision: base,
          role_definition_id: roleB,
          label: "競爭角色乙更新",
          audit_id: "018f3b8a-0000-7000-8000-aaaa00000512",
          correlation_id: "corr-h-12-race-b",
        })
      ),
    ]);
    const successes = results.filter((result) => result.status === "fulfilled");
    const conflicts = results.filter(
      (result) =>
        result.status === "rejected" &&
        result.reason instanceof RoleRevisionConflictError
    );
    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    expect(await readRevision()).toBe(base + 1);
    const labels = await testDb()
      .prepare(
        `SELECT role_definition_id, label FROM role_definitions
          WHERE role_definition_id IN (?, ?)
          ORDER BY role_definition_id`
      )
      .bind(roleA, roleB)
      .all<{ role_definition_id: string; label: string }>();
    const roleLabels = labels.results?.map((row) => row.label) ?? [];
    expect(roleLabels).toHaveLength(2);
    expect(roleLabels.filter((label) => label.endsWith("更新")).length).toBe(1);
    expect(
      roleLabels.filter(
        (label) => label === "競爭角色甲" || label === "競爭角色乙"
      )
    ).toHaveLength(1);
    const raceAudits = await testDb()
      .prepare(
        `SELECT outcome FROM role_audit_events
          WHERE action = 'ROLE_DEFINITION_RENAME'
            AND entity_id IN (?, ?)`
      )
      .bind(roleA, roleB)
      .all<{ outcome: string }>();
    expect(
      raceAudits.results?.map((audit) => audit.outcome).sort()
    ).toStrictEqual(["CONFLICT", "SUCCESS"]);
  });

  test("ROLE_ARCHIVED: archived targets reject rename without mutation", async () => {
    const roleId = "018f3b8a-0000-7000-8000-1000000000f4";
    const createBase = await readRevision();
    await applyRoleMutation(testDb(), {
      idempotency_key: "h-archived-create",
      request_fingerprint: "fp-h-archived-create",
      actor_user_id: ADMIN,
      base_revision: createBase,
      now: NOW,
      audit_id: "018f3b8a-0000-7000-8000-aaaa00000513",
      desired: [
        {
          kind: "create_role_definition",
          role_definition_id: roleId,
          category_key: "Program",
          stable_key: "t478.archived.rename",
          label: "已停用身份組",
          description: "Archived rename fixture",
          scope_kind: "Program",
          scope_id: "018f3b8a-0000-7000-8000-300000000001",
          position: 50,
          capabilities: [],
        },
      ],
      audit_summary: {
        action: "ROLE_DEFINITION_CREATE",
        entity_type: "role_definition",
        entity_id: roleId,
        new_value_json: JSON.stringify({ label: "已停用身份組" }),
      },
    });
    const archiveBase = await readRevision();
    await applyRoleMutation(testDb(), {
      idempotency_key: "h-archived-archive",
      request_fingerprint: "fp-h-archived-archive",
      actor_user_id: ADMIN,
      base_revision: archiveBase,
      now: NOW,
      audit_id: "018f3b8a-0000-7000-8000-aaaa00000514",
      desired: [
        { kind: "archive_role_definition", role_definition_id: roleId },
      ],
      audit_summary: {
        action: "ROLE_DEFINITION_ARCHIVE",
        entity_type: "role_definition",
        entity_id: roleId,
        new_value_json: JSON.stringify({ is_archived: 1 }),
      },
    });
    const renameBase = await readRevision();
    await expect(
      renameRoleDefinition(
        testDb(),
        renameInput({
          idempotency_key: "h-archived-rename",
          base_revision: renameBase,
          role_definition_id: roleId,
          label: "不應更新",
          audit_id: "018f3b8a-0000-7000-8000-aaaa00000515",
        })
      )
    ).rejects.toBeInstanceOf(RoleArchivedError);
    expect(await readRevision()).toBe(renameBase);
    const row = await readScalar<{ label: string; is_archived: number }>(
      `SELECT label, is_archived FROM role_definitions
        WHERE role_definition_id = ?`,
      roleId
    );
    expect(row?.label).toBe("已停用身份組");
    expect(row?.is_archived).toBe(1);
    const audit = await readScalar<{ outcome: string; reason: string }>(
      `SELECT outcome, reason FROM role_audit_events
        WHERE audit_id = ?`,
      "018f3b8a-0000-7000-8000-aaaa00000515"
    );
    expect(audit?.outcome).toBe("REJECTED");
    expect(audit?.reason).toBe("ROLE_ARCHIVED");
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
          base_revision: baseAfter,
          role_definition_id: DEPARTMENT_MANAGER_ROLE,
          label: trimmedMax,
          audit_id: "018f3b8a-0000-7000-8000-aaaa0000050e",
        })
      )
    ).resolves.toMatchObject({ label: "長".repeat(ROLE_NAME_MAX_LENGTH) });
    expect(await readRevision()).toBe(baseAfter + 1);
  });

  test("H-08/B5: Admin and 會友基礎 use distinct protected errors", async () => {
    const base = await readRevision();
    await expect(
      renameRoleDefinition(
        testDb(),
        renameInput({
          idempotency_key: "h-08-admin",
          base_revision: base,
          role_definition_id: ADMIN_ROLE,
          label: "改名嘗試",
          audit_id: "018f3b8a-0000-8000-aaaa00000504-admin",
        })
      )
    ).rejects.toBeInstanceOf(RoleAdminProtectedError);
    await expect(
      renameRoleDefinition(
        testDb(),
        renameInput({
          idempotency_key: "h-08-member",
          base_revision: base,
          role_definition_id: MEMBER_ROLE,
          label: "改名嘗試",
          audit_id: "018f3b8a-0000-8000-aaaa00000504-member",
        })
      )
    ).rejects.toBeInstanceOf(RoleBaselineProtectedError);
    expect(await readRevision()).toBe(base);
  });

  test("H-09: capable actor cannot rename a role at or above highest position", async () => {
    const actor = "E2E_DISPOSABLE_HIGHEST";
    const actorRoleId = "018f3b8a-0000-7000-8000-1000000000d1";
    const higherRoleId = "018f3b8a-0000-7000-8000-1000000000d2";
    await importLegacyUsers(
      testDb(),
      [
        ["User_ID", "Name", "Username", "PIN_Code", "System_Role", "Status"],
        [
          actor,
          "Highest Test Actor",
          "highest_test_actor",
          "0000",
          "Staff",
          "Active",
        ],
      ],
      Date.parse(NOW)
    );
    const base = await readRevision();
    await applyRoleMutation(testDb(), {
      idempotency_key: "h-09-create",
      request_fingerprint: "fp-h-09-create",
      actor_user_id: ADMIN,
      base_revision: base,
      now: NOW,
      audit_id: "018f3b8a-0000-8000-aaaa00000505-create",
      desired: [
        {
          kind: "create_role_definition",
          role_definition_id: actorRoleId,
          category_key: "Program" as const,
          stable_key: "t478.highest.actor",
          label: "最高順位測試角色",
          description: "H-09 actor fixture",
          scope_kind: "Program" as const,
          scope_id: "018f3b8a-0000-8000-300000000001",
          position: 5,
          capabilities: ["role.read", "role.name.write"],
        },
        {
          kind: "create_role_definition",
          role_definition_id: higherRoleId,
          category_key: "Program" as const,
          stable_key: "t478.highest.target",
          label: "更高順位測試角色",
          description: "H-09 target fixture",
          scope_kind: "Program" as const,
          scope_id: "018f3b8a-0000-8000-300000000001",
          position: 4,
          capabilities: [],
        },
        {
          kind: "grant_assignment" as const,
          assignment_id: `${actorRoleId}-${actor}`,
          account_user_id: actor,
          role_definition_id: actorRoleId,
          scope_kind: "Program" as const,
          scope_id: "018f3b8a-0000-8000-300000000001",
        },
        {
          kind: "grant_assignment" as const,
          assignment_id: `${MEMBER_ROLE}-${actor}`,
          account_user_id: actor,
          role_definition_id: MEMBER_ROLE,
          scope_kind: "Global" as const,
          scope_id: null,
        },
      ],
      audit_summary: {
        action: "ROLE_DEFINITION_CREATE",
        entity_type: "role_definition",
        entity_id: actorRoleId,
        new_value_json: JSON.stringify({ label: "最高順位測試角色" }),
      },
    });
    const afterCreate = await readRevision();
    await expect(
      renameRoleDefinition(
        testDb(),
        renameInput({
          actor_user_id: actor,
          idempotency_key: "h-09-high-target",
          base_revision: afterCreate,
          role_definition_id: higherRoleId,
          label: "改名嘗試",
          audit_id: "018f3b8a-0000-8000-aaaa00000505-attempt",
        })
      )
    ).rejects.toBeInstanceOf(RoleHighestProtectedError);
    expect(await readRevision()).toBe(afterCreate);
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
          capabilities: ["role.name.write"],
        },
        {
          kind: "grant_assignment" as const,
          assignment_id: `${customRoleId}-member`,
          account_user_id: MEMBER,
          role_definition_id: customRoleId,
          scope_kind: "Program" as const,
          scope_id: "018f3b8a-0000-8000-300000000001",
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
          capabilities: ["role.read", "role.name.write"],
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
            granted_by, granted_at, scope_kind, scope_id,
            revoked_by, revoked_at, revoke_reason)
         VALUES (?, ?, ?, ?, ?, 'Program',
                 '018f3b8a-0000-7000-8000-300000000001',
                 NULL, NULL, NULL)`
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
            granted_by, granted_at, scope_kind, scope_id,
            revoked_by, revoked_at, revoke_reason)
         VALUES (?, ?, ?, ?, ?, 'Global', NULL, NULL, NULL, NULL)`
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

describe("#479 role definition creation, scoped authority, and sibling order", () => {
  function createInput(
    overrides: Partial<Parameters<typeof createRoleDefinition>[1]> = {}
  ) {
    return {
      actor_user_id: ADMIN,
      idempotency_key: "b479-create-1",
      base_revision: 1,
      category_key: "Department" as const,
      label: "新設部門角色",
      description: "B-479 creation fixture",
      scope_kind: "Department" as const,
      scope_id: "018f3b8a-0000-7000-8000-000000000002", // 成區
      now: NOW,
      audit_id: "018f3b8a-0000-7000-8000-bbbb00000001",
      correlation_id: "corr-b479-create-1",
      ...overrides,
    };
  }

  function reorderInput(
    overrides: Partial<Parameters<typeof reorderRoleDefinitions>[1]> = {}
  ) {
    return {
      actor_user_id: ADMIN,
      idempotency_key: "b479-reorder-1",
      base_revision: 1,
      category_key: "Department" as const,
      targets: [
        {
          role_definition_id: DEPARTMENT_MANAGER_ROLE,
          position: 11,
        },
        {
          role_definition_id: "018f3b8a-0000-7000-8000-1000000000f9",
          position: 10,
        },
      ],
      now: NOW,
      audit_id: "018f3b8a-0000-7000-8000-bbbb00000020",
      correlation_id: "corr-b479-reorder-1",
      ...overrides,
    };
  }
  function rescopeInput(
    overrides: Partial<Parameters<typeof rescopeRoleDefinition>[1]> = {}
  ) {
    return {
      actor_user_id: STAFF,
      idempotency_key: "b479-rescope-1",
      base_revision: 1,
      role_definition_id: DEPARTMENT_MANAGER_ROLE,
      category_key: "Program" as const,
      scope_kind: "Program" as const,
      scope_id: "018f3b8a-0000-7000-8000-300000000001",
      now: NOW,
      audit_id: "018f3b8a-0000-7000-8000-bbbb00000040",
      correlation_id: "corr-b479-rescope-1",
      ...overrides,
    };
  }

  test("B-479 Staff defaults expose rename and scope capabilities and scoped create options", async () => {
    const grants = await testDb()
      .prepare(
        `SELECT capability FROM role_definition_grants
          WHERE role_definition_id = ?`
      )
      .bind(STAFF_ROLE)
      .all<{ capability: string }>();
    const capabilitySet = new Set(
      (grants.results ?? []).map((row) => row.capability)
    );
    expect(capabilitySet.has("role.name.write")).toBe(true);
    expect(capabilitySet.has("role.scope.read")).toBe(true);
    expect(capabilitySet.has("role.scope.write")).toBe(true);
    const view = await loadRoleHierarchy(testDb(), STAFF);
    const global = view.categories.find(
      (category) => category.categoryKey === ROLE_CATEGORY_KEY.GLOBAL
    );
    const department = view.categories.find(
      (category) => category.categoryKey === ROLE_CATEGORY_KEY.DEPARTMENT
    );
    expect(global?.createOptions).toEqual([]);
    expect(department?.createOptions.length).toBeGreaterThan(0);
    expect(department?.createOptions.every((option) => option.scope_id)).toBe(
      true
    );
    const manager = department?.definitions.find(
      (definition) => definition.roleDefinitionId === DEPARTMENT_MANAGER_ROLE
    );
    expect(
      manager?.scopeOptions?.every((option) => option.scope_kind !== "Global")
    ).toBe(true);
    const adminView = await loadRoleHierarchy(testDb(), ADMIN);
    const adminDepartment = adminView.categories.find(
      (category) => category.categoryKey === ROLE_CATEGORY_KEY.DEPARTMENT
    );
    expect(adminDepartment?.createOptions.length).toBeGreaterThan(0);
  });

  test("B-479-01/B-479-03/B-479-14: Admin creates a scoped Role Definition that is Active, zero-grant, uniquely named, and lands on the authoritative revision", async () => {
    const base = await readRevision();
    const result = await createRoleDefinition(
      testDb(),
      createInput({ base_revision: base })
    );
    expect(result.roleDefinitionId).toBeTruthy();
    expect(result.categoryKey).toBe("Department");
    expect(result.scopeKind).toBe("Department");
    expect(result.scopeId).toBe("018f3b8a-0000-7000-8000-000000000002");
    expect(result.position).toBeGreaterThan(0);
    expect(result.revision).toBe(base + 1);
    expect(result.idempotent).toBe(false);

    const row = await readScalar<{
      label: string;
      is_archived: number;
      is_protected: number;
      position: number;
    }>(
      `SELECT label, is_archived, is_protected, position FROM role_definitions
        WHERE role_definition_id = ?`,
      result.roleDefinitionId
    );
    expect(row?.label).toBe("新設部門角色");
    expect(row?.is_archived).toBe(0);
    expect(row?.is_protected).toBe(0);
    const grants = await readScalar<{ c: number }>(
      `SELECT COUNT(*) AS c FROM role_definition_grants
        WHERE role_definition_id = ?`,
      result.roleDefinitionId
    );
    expect(grants?.c).toBe(0);
    const audit = await readScalar<{
      action: string;
      outcome: string;
      correlation_id: string;
    }>(
      `SELECT action, outcome, correlation_id FROM role_audit_events
        WHERE audit_id = ?`,
      "018f3b8a-0000-7000-8000-bbbb00000001"
    );
    expect(audit?.action).toBe("ROLE_DEFINITION_CREATE");
    expect(audit?.outcome).toBe("SUCCESS");
    expect(audit?.correlation_id).toBe("corr-b479-create-1");
  });

  test("B-479-02/B-479-13: a Member (no role.create) cannot create, and a tampered Global attempt is rejected by the Worker authority", async () => {
    const base = await readRevision();
    await expect(
      createRoleDefinition(
        testDb(),
        createInput({
          actor_user_id: MEMBER,
          base_revision: base,
          idempotency_key: "b479-create-member",
          audit_id: "018f3b8a-0000-7000-8000-bbbb00000033",
          correlation_id: "corr-b479-create-member",
        })
      )
    ).rejects.toBeInstanceOf(RoleCapabilityDeniedError);
    await expect(
      createRoleDefinition(
        testDb(),
        createInput({
          base_revision: base,
          category_key: "Global",
          scope_kind: "Global",
          scope_id: null,
          idempotency_key: "b479-create-global-staff",
          actor_user_id: STAFF,
          audit_id: "018f3b8a-0000-7000-8000-bbbb00000034",
          correlation_id: "corr-b479-create-global-staff",
        })
      )
    ).rejects.toBeInstanceOf(RoleCapabilityDeniedError);
    const staffAudit = await readScalar<{
      actor_user_id: string;
      action: string;
      entity_type: string;
      entity_id: string;
      reason: string;
      outcome: string;
      correlation_id: string;
    }>(
      `SELECT actor_user_id, action, entity_type, entity_id, reason, outcome,
              correlation_id
         FROM role_audit_events
        WHERE audit_id = ?`,
      "018f3b8a-0000-7000-8000-bbbb00000034"
    );
    expect(staffAudit).toEqual({
      actor_user_id: STAFF,
      action: "ROLE_DEFINITION_CREATE",
      entity_type: "role_definition",
      entity_id: "key:b479-create-global-staff",
      reason: "ROLE_FORBIDDEN",
      outcome: "DENIED",
      correlation_id: "corr-b479-create-global-staff",
    });
    const staffAuditCount = await readScalar<{ c: number }>(
      `SELECT COUNT(*) AS c FROM role_audit_events
        WHERE action = 'ROLE_DEFINITION_CREATE'
          AND correlation_id = ?`,
      "corr-b479-create-global-staff"
    );
    expect(staffAuditCount?.c).toBe(1);
    expect(await readRevision()).toBe(base);
  });

  test("B-479-04: a scoped creation without an explicit scope is rejected before any write", async () => {
    const base = await readRevision();
    await expect(
      createRoleDefinition(
        testDb(),
        createInput({
          base_revision: base,
          scope_id: null,
          idempotency_key: "b479-create-no-scope",
          audit_id: "018f3b8a-0000-7000-8000-bbbb00000035",
          correlation_id: "corr-b479-create-no-scope",
        })
      )
    ).rejects.toBeInstanceOf(RoleScopeRequiredError);
    const audit = await readScalar<{
      action: string;
      entity_id: string;
      reason: string;
      outcome: string;
      correlation_id: string;
    }>(
      `SELECT action, entity_id, reason, outcome, correlation_id
         FROM role_audit_events WHERE audit_id = ?`,
      "018f3b8a-0000-7000-8000-bbbb00000035"
    );
    expect(audit).toEqual({
      action: "ROLE_DEFINITION_CREATE",
      entity_id: "key:b479-create-no-scope",
      reason: "ROLE_SCOPE_REQUIRED",
      outcome: "REJECTED",
      correlation_id: "corr-b479-create-no-scope",
    });
    expect(await readRevision()).toBe(base);
  });

  test("B-479-04: a duplicate normalized name is rejected with a REJECTED audit row and no revision advance", async () => {
    const base = await readRevision();
    await expect(
      createRoleDefinition(
        testDb(),
        createInput({
          base_revision: base,
          label: "  系統管理員  ",
          idempotency_key: "b479-create-taken",
          audit_id: "018f3b8a-0000-7000-8000-bbbb00000003",
        })
      )
    ).rejects.toBeInstanceOf(RoleNameConflictError);
    expect(await readRevision()).toBe(base);
    const audit = await readScalar<{ outcome: string; reason: string }>(
      `SELECT outcome, reason FROM role_audit_events
        WHERE audit_id = ?`,
      "018f3b8a-0000-7000-8000-bbbb00000003"
    );
    expect(audit?.outcome).toBe("REJECTED");
    expect(audit?.reason).toBe("ROLE_NAME_TAKEN");
  });

  test("B-479-16/B-479-17: create replays idempotently and rejects a changed payload with ROLE_IDEMPOTENCY_REUSE", async () => {
    const base = await readRevision();
    const first = await createRoleDefinition(
      testDb(),
      createInput({
        base_revision: base,
        label: "重播建立角色",
        idempotency_key: "b479-create-replay",
        audit_id: "018f3b8a-0000-7000-8000-bbbb00000030",
      })
    );
    const after = await readRevision();
    expect(first.revision).toBe(base + 1);
    // Response-loss replay: same actor/key/payload returns the original.
    const replay = await createRoleDefinition(
      testDb(),
      createInput({
        base_revision: base,
        label: "重播建立角色",
        idempotency_key: "b479-create-replay",
        audit_id: "018f3b8a-0000-7000-8000-bbbb00000031",
      })
    );
    expect(replay.roleDefinitionId).toBe(first.roleDefinitionId);
    expect(replay.revision).toBe(after);
    expect(replay.idempotent).toBe(true);
    const roleCount = await readScalar<{ c: number }>(
      `SELECT COUNT(*) AS c FROM role_definitions WHERE role_definition_id = ?`,
      first.roleDefinitionId
    );
    expect(roleCount?.c).toBe(1);
    const replayAuditCount = await readScalar<{ c: number }>(
      `SELECT COUNT(*) AS c FROM role_audit_events
        WHERE action = 'ROLE_DEFINITION_CREATE'
          AND entity_id = ?`,
      first.roleDefinitionId
    );
    expect(replayAuditCount?.c).toBe(1);
    const replayAudit = await readScalar<{ correlation_id: string }>(
      `SELECT correlation_id FROM role_audit_events WHERE audit_id = ?`,
      "018f3b8a-0000-7000-8000-bbbb00000030"
    );
    expect(replayAudit?.correlation_id).toBe("corr-b479-create-1");
    // Changed payload with the same key is rejected.
    await expect(
      createRoleDefinition(
        testDb(),
        createInput({
          base_revision: base,
          label: "另一個名稱",
          idempotency_key: "b479-create-replay",
          audit_id: "018f3b8a-0000-7000-8000-bbbb00000032",
        })
      )
    ).rejects.toBeInstanceOf(RoleIdempotencyConflictError);
    expect(await readRevision()).toBe(after);
  });

  test("B-479-07/B-479-08: 上移/下移 sibling reorder swaps two positions and never touches grants, scope, or assignments", async () => {
    const base = await readRevision();
    // Create a second Department sibling at position 11.
    const sibling = await createRoleDefinition(
      testDb(),
      createInput({
        base_revision: base,
        label: "成區副管理者",
        idempotency_key: "b479-reorder-sibling-create",
        audit_id: "018f3b8a-0000-7000-8000-bbbb00000005",
      })
    );
    const before = await loadRoleHierarchy(testDb(), ADMIN);
    const managerBefore = before.categories
      .flatMap((category) => category.definitions)
      .find(
        (definition) => definition.roleDefinitionId === DEPARTMENT_MANAGER_ROLE
      );
    const siblingBefore = before.categories
      .flatMap((category) => category.definitions)
      .find(
        (definition) => definition.roleDefinitionId === sibling.roleDefinitionId
      );
    expect(managerBefore?.position).toBe(10);
    expect(siblingBefore?.position).toBe(sibling.position);
    expect(siblingBefore?.position).toBeGreaterThan(10);
    const managerGrantsBefore = managerBefore?.grantCount;
    const managerAssignmentsBefore = managerBefore?.assignmentCount;

    const reorderBase = await readRevision();
    const result = await reorderRoleDefinitions(
      testDb(),
      reorderInput({
        base_revision: reorderBase,
        targets: [
          { role_definition_id: sibling.roleDefinitionId, position: 10 },
          {
            role_definition_id: DEPARTMENT_MANAGER_ROLE,
            position: sibling.position,
          },
        ],
        idempotency_key: "b479-reorder-1",
      })
    );
    expect(result.revision).toBe(reorderBase + 1);
    expect(result.idempotent).toBe(false);
    const after = await loadRoleHierarchy(testDb(), ADMIN);
    const managerAfter = after.categories
      .flatMap((category) => category.definitions)
      .find(
        (definition) => definition.roleDefinitionId === DEPARTMENT_MANAGER_ROLE
      );
    const siblingAfter = after.categories
      .flatMap((category) => category.definitions)
      .find(
        (definition) => definition.roleDefinitionId === sibling.roleDefinitionId
      );
    expect(managerAfter?.position).toBe(sibling.position);
    const replay = await reorderRoleDefinitions(
      testDb(),
      reorderInput({
        base_revision: reorderBase,
        targets: [
          { role_definition_id: sibling.roleDefinitionId, position: 10 },
          {
            role_definition_id: DEPARTMENT_MANAGER_ROLE,
            position: sibling.position,
          },
        ],
        idempotency_key: "b479-reorder-1",
        audit_id: "018f3b8a-0000-7000-8000-bbbb0000003a",
        correlation_id: "corr-b479-reorder-replay",
      })
    );
    expect(replay).toEqual({ ...result, idempotent: true });
    const reorderReplayAuditCount = await readScalar<{ c: number }>(
      `SELECT COUNT(*) AS c FROM role_audit_events
        WHERE action = 'ROLE_DEFINITION_REORDER'
          AND entity_id = ?`,
      `${sibling.roleDefinitionId},${DEPARTMENT_MANAGER_ROLE}`
    );
    expect(reorderReplayAuditCount?.c).toBe(1);
    expect(siblingAfter?.position).toBe(10);
    // Grants/scope/assignments are untouched by construction.
    expect(managerAfter?.grantCount).toBe(managerGrantsBefore);
    expect(managerAfter?.assignmentCount).toBe(managerAssignmentsBefore);
    expect(managerAfter?.scopeId).toBe("018f3b8a-0000-7000-8000-000000000002");
    const audit = await readScalar<{ action: string; outcome: string }>(
      `SELECT action, outcome FROM role_audit_events
        WHERE audit_id = ?`,
      "018f3b8a-0000-7000-8000-bbbb00000020"
    );
    expect(audit?.action).toBe("ROLE_DEFINITION_REORDER");
    expect(audit?.outcome).toBe("SUCCESS");
  });

  test("B-479-09: cross-category reorder is rejected with ROLE_INVALID_PARENT and no mutation", async () => {
    const base = await readRevision();
    await expect(
      reorderRoleDefinitions(
        testDb(),
        reorderInput({
          base_revision: base,
          targets: [
            { role_definition_id: DEPARTMENT_MANAGER_ROLE, position: 1 },
            { role_definition_id: STAFF_ROLE, position: 10 },
          ],
          idempotency_key: "b479-reorder-cross",
          audit_id: "018f3b8a-0000-7000-8000-bbbb00000036",
          correlation_id: "corr-b479-reorder-cross",
        })
      )
    ).rejects.toBeInstanceOf(RoleCrossCategoryError);
    const crossAudit = await readScalar<{
      action: string;
      entity_id: string;
      reason: string;
      outcome: string;
      correlation_id: string;
    }>(
      `SELECT action, entity_id, reason, outcome, correlation_id
         FROM role_audit_events WHERE audit_id = ?`,
      "018f3b8a-0000-7000-8000-bbbb00000036"
    );
    expect(crossAudit).toEqual({
      action: "ROLE_DEFINITION_REORDER",
      entity_id: `${DEPARTMENT_MANAGER_ROLE},${STAFF_ROLE}`,
      reason: "ROLE_INVALID_PARENT",
      outcome: "REJECTED",
      correlation_id: "corr-b479-reorder-cross",
    });
    expect(await readRevision()).toBe(base);
  });

  test("B-479 protected reorder is denied with one immutable audit row", async () => {
    const base = await readRevision();
    await expect(
      reorderRoleDefinitions(
        testDb(),
        reorderInput({
          base_revision: base,
          category_key: "Global",
          targets: [
            { role_definition_id: ADMIN_ROLE, position: 1 },
            { role_definition_id: STAFF_ROLE, position: 0 },
          ],
          idempotency_key: "b479-reorder-admin-protected",
          audit_id: "018f3b8a-0000-7000-8000-bbbb00000037",
          correlation_id: "corr-b479-reorder-admin-protected",
        })
      )
    ).rejects.toBeInstanceOf(RoleAdminProtectedError);
    const protectedAudit = await readScalar<{
      actor_user_id: string;
      action: string;
      entity_id: string;
      reason: string;
      outcome: string;
      correlation_id: string;
    }>(
      `SELECT actor_user_id, action, entity_id, reason, outcome, correlation_id
         FROM role_audit_events WHERE audit_id = ?`,
      "018f3b8a-0000-7000-8000-bbbb00000037"
    );
    expect(protectedAudit).toEqual({
      actor_user_id: ADMIN,
      action: "ROLE_DEFINITION_REORDER",
      entity_id: `${ADMIN_ROLE},${STAFF_ROLE}`,
      reason: "ROLE_ADMIN_PROTECTED",
      outcome: "DENIED",
      correlation_id: "corr-b479-reorder-admin-protected",
    });
    expect(await readRevision()).toBe(base);
  });

  test("B-479-10: a stale order revision is rejected with the authoritative revision and order (ROLE_ORDER_CONFLICT)", async () => {
    const current = await readRevision();
    // Make a real sibling pair inside Department: the manager (position 10)
    // plus a fresh sibling whose position is the manager's swap target.
    const sibling = await createRoleDefinition(
      testDb(),
      createInput({
        base_revision: current,
        label: "成區副手",
        idempotency_key: "b479-stale-create",
        audit_id: "018f3b8a-0000-7000-8000-bbbb00000007",
      })
    );
    const managerRow = await readScalar<{ position: number }>(
      `SELECT position FROM role_definitions WHERE role_definition_id = ?`,
      DEPARTMENT_MANAGER_ROLE
    );
    const siblingRow = await readScalar<{ position: number }>(
      `SELECT position FROM role_definitions WHERE role_definition_id = ?`,
      sibling.roleDefinitionId
    );
    expect(managerRow).toBeDefined();
    expect(siblingRow).toBeDefined();
    const afterCreate = await readRevision();
    expect(managerRow).toBeDefined();
    expect(siblingRow).toBeDefined();
    const managerPosition = managerRow?.position ?? 0;
    const siblingPosition = siblingRow?.position ?? 0;
    // A genuine swap of the two current positions, but with a stale base
    // revision — the kernel must reject with the authoritative revision
    // and expose the authoritative sibling order.
    let conflict: unknown = null;
    try {
      await reorderRoleDefinitions(
        testDb(),
        reorderInput({
          base_revision: afterCreate - 1, // stale
          targets: [
            {
              role_definition_id: sibling.roleDefinitionId,
              position: managerPosition,
            },
            {
              role_definition_id: DEPARTMENT_MANAGER_ROLE,
              position: siblingPosition,
            },
          ],
          idempotency_key: "b479-reorder-stale",
          audit_id: "018f3b8a-0000-7000-8000-bbbb00000008",
        })
      );
    } catch (error) {
      conflict = error;
    }
    expect(conflict).toBeInstanceOf(RoleOrderConflictError);
    expect((conflict as RoleOrderConflictError).currentRevision).toBe(
      afterCreate
    );
    expect(
      (conflict as RoleOrderConflictError).authoritativeIds.length
    ).toBeGreaterThan(0);
    expect(await readRevision()).toBe(afterCreate);
    const conflictAudit = await readScalar<{ outcome: string; reason: string }>(
      `SELECT outcome, reason FROM role_audit_events
        WHERE audit_id = ?`,
      "018f3b8a-0000-7000-8000-bbbb00000008"
    );
    expect(conflictAudit?.outcome).toBe("CONFLICT");
    expect(conflictAudit?.reason).toContain("ROLE_ORDER_CONFLICT");
  });

  test("B-479-15: an archived target rejects reorder with ROLE_ARCHIVED and no mutation", async () => {
    const base = await readRevision();
    const created = await createRoleDefinition(
      testDb(),
      createInput({
        base_revision: base,
        label: "待封存角色",
        idempotency_key: "b479-archived-create",
        audit_id: "018f3b8a-0000-7000-8000-bbbb00000006",
      })
    );
    const afterCreate = await readRevision();
    const managerRow = await readScalar<{ position: number }>(
      `SELECT position FROM role_definitions WHERE role_definition_id = ?`,
      DEPARTMENT_MANAGER_ROLE
    );
    const createdRow = await readScalar<{ position: number }>(
      `SELECT position FROM role_definitions WHERE role_definition_id = ?`,
      created.roleDefinitionId
    );
    expect(managerRow).toBeDefined();
    expect(createdRow).toBeDefined();
    const managerPosition = managerRow?.position ?? 0;
    const createdPosition = createdRow?.position ?? 0;
    await testDb()
      .prepare(
        `UPDATE role_definitions SET is_archived = 1 WHERE role_definition_id = ?`
      )
      .bind(created.roleDefinitionId)
      .run();
    await expect(
      reorderRoleDefinitions(
        testDb(),
        reorderInput({
          base_revision: afterCreate,
          targets: [
            {
              role_definition_id: created.roleDefinitionId,
              position: managerPosition,
            },
            {
              role_definition_id: DEPARTMENT_MANAGER_ROLE,
              position: createdPosition,
            },
          ],
          idempotency_key: "b479-reorder-archived",
          audit_id: "018f3b8a-0000-7000-8000-bbbb00000038",
          correlation_id: "corr-b479-reorder-archived",
        })
      )
    ).rejects.toBeInstanceOf(RoleArchivedError);
    const archivedAudit = await readScalar<{
      action: string;
      entity_id: string;
      reason: string;
      outcome: string;
      correlation_id: string;
    }>(
      `SELECT action, entity_id, reason, outcome, correlation_id
         FROM role_audit_events WHERE audit_id = ?`,
      "018f3b8a-0000-7000-8000-bbbb00000038"
    );
    expect(archivedAudit).toEqual({
      action: "ROLE_DEFINITION_REORDER",
      entity_id: `${created.roleDefinitionId},${DEPARTMENT_MANAGER_ROLE}`,
      reason: "ROLE_ARCHIVED",
      outcome: "REJECTED",
      correlation_id: "corr-b479-reorder-archived",
    });
    expect(await readRevision()).toBe(afterCreate);
  });

  test("B-479 global create stays above the pinned 會友基礎 anchor", async () => {
    const base = await readRevision();
    const result = await createRoleDefinition(
      testDb(),
      createInput({
        base_revision: base,
        category_key: "Global",
        scope_kind: "Global",
        scope_id: null,
        label: "全域新增角色",
        idempotency_key: "b479-global-position",
        audit_id: "018f3b8a-0000-7000-8000-bbbb00000050",
      })
    );
    const anchors = await testDb()
      .prepare(
        `SELECT stable_key, position FROM role_definitions
          WHERE stable_key IN ('admin', 'staff', 'member')`
      )
      .all<{ stable_key: string; position: number }>();
    const byKey = new Map(
      (anchors.results ?? []).map((row) => [row.stable_key, row.position])
    );
    expect(result.position).toBeGreaterThan(byKey.get("staff") ?? 1);
    expect(result.position).toBeLessThan(byKey.get("member") ?? 999);
    expect(byKey.get("admin")).toBe(0);
    expect(byKey.get("staff")).toBe(1);
    expect(byKey.get("member")).toBe(999);
  });

  test("B-479 scope edit lets Staff rescope a lower role and preserves identity, grants, assignments, and anchors", async () => {
    const createBase = await readRevision();
    const created = await createRoleDefinition(
      testDb(),
      createInput({
        base_revision: createBase,
        label: "待改適用範圍角色",
        idempotency_key: "b479-rescope-create",
        audit_id: "018f3b8a-0000-7000-8000-bbbb00000051",
      })
    );
    await testDb()
      .prepare(
        `INSERT INTO role_definition_grants
           (role_definition_id, capability, granted_by, granted_at)
         VALUES (?, 'program.enroll', ?, ?)`
      )
      .bind(created.roleDefinitionId, ADMIN, NOW)
      .run();
    await testDb()
      .prepare(
        `INSERT INTO role_assignments
           (assignment_id, account_user_id, role_definition_id,
            granted_by, granted_at, scope_kind, scope_id,
            revoked_by, revoked_at, revoke_reason)
         VALUES (?, ?, ?, ?, ?, 'Department',
                 '018f3b8a-0000-7000-8000-000000000002',
                 NULL, NULL, NULL)`
      )
      .bind(
        "b479-rescope-assignment",
        MEMBER,
        created.roleDefinitionId,
        ADMIN,
        NOW
      )
      .run();
    const before = await readScalar<{
      stable_key: string;
      label: string;
      position: number;
      category_key: string;
      scope_kind: string;
      scope_id: string | null;
    }>(
      `SELECT stable_key, label, position, category_key, scope_kind, scope_id
         FROM role_definitions WHERE role_definition_id = ?`,
      created.roleDefinitionId
    );
    const managerPositionBefore = await readScalar<{ position: number }>(
      `SELECT position FROM role_definitions WHERE role_definition_id = ?`,
      DEPARTMENT_MANAGER_ROLE
    );
    const rescopeBase = await readRevision();
    const result = await rescopeRoleDefinition(
      testDb(),
      rescopeInput({
        base_revision: rescopeBase,
        role_definition_id: created.roleDefinitionId,
        idempotency_key: "b479-rescope-success",
        audit_id: "018f3b8a-0000-7000-8000-bbbb00000052",
        correlation_id: "corr-b479-rescope-success",
      })
    );
    expect(result.roleDefinitionId).toBe(created.roleDefinitionId);
    expect(result.categoryKey).toBe("Program");
    expect(result.scopeKind).toBe("Program");
    expect(result.scopeId).toBe("018f3b8a-0000-7000-8000-300000000001");
    expect(result.revision).toBe(rescopeBase + 1);
    expect(result.idempotent).toBe(false);
    const after = await readScalar<{
      stable_key: string;
      label: string;
      position: number;
      category_key: string;
      scope_kind: string;
      scope_id: string | null;
    }>(
      `SELECT stable_key, label, position, category_key, scope_kind, scope_id
         FROM role_definitions WHERE role_definition_id = ?`,
      created.roleDefinitionId
    );
    expect(after?.stable_key).toBe(before?.stable_key);
    expect(after?.label).toBe(before?.label);
    expect(after?.category_key).toBe("Program");
    expect(after?.scope_kind).toBe("Program");
    expect(after?.scope_id).toBe("018f3b8a-0000-7000-8000-300000000001");
    expect(after?.position).toBe(result.position);
    expect(
      await readScalar<{ c: number }>(
        `SELECT COUNT(*) AS c FROM role_definition_grants
          WHERE role_definition_id = ? AND capability = 'program.enroll'`,
        created.roleDefinitionId
      )
    ).toEqual({ c: 1 });
    expect(
      await readScalar<{ c: number }>(
        `SELECT COUNT(*) AS c FROM role_assignments
          WHERE role_definition_id = ? AND revoked_at IS NULL`,
        created.roleDefinitionId
      )
    ).toEqual({ c: 1 });
    expect(
      await readScalar<{ position: number }>(
        `SELECT position FROM role_definitions WHERE stable_key = 'member'`
      )
    ).toEqual({ position: 999 });
    expect(
      await readScalar<{ position: number }>(
        `SELECT position FROM role_definitions WHERE role_definition_id = ?`,
        DEPARTMENT_MANAGER_ROLE
      )
    ).toEqual(managerPositionBefore);
    const audit = await readScalar<{
      action: string;
      outcome: string;
      correlation_id: string;
    }>(
      `SELECT action, outcome, correlation_id FROM role_audit_events
        WHERE audit_id = ?`,
      "018f3b8a-0000-7000-8000-bbbb00000052"
    );
    expect(audit).toEqual({
      action: "ROLE_DEFINITION_RESCOPE",
      outcome: "SUCCESS",
      correlation_id: "corr-b479-rescope-success",
    });
  });

  test("B-479 scope edit rejects mismatched parent, Staff Global, and out-of-scope destinations, plus archived targets", async () => {
    const createBase = await readRevision();
    const created = await createRoleDefinition(
      testDb(),
      createInput({
        base_revision: createBase,
        label: "範圍拒絕角色",
        idempotency_key: "b479-rescope-rejections-create",
        audit_id: "018f3b8a-0000-7000-8000-bbbb00000053",
      })
    );
    const base = await readRevision();
    await expect(
      rescopeRoleDefinition(
        testDb(),
        rescopeInput({
          role_definition_id: created.roleDefinitionId,
          base_revision: base,
          category_key: "Program",
          scope_kind: "Program",
          scope_id: null,
          idempotency_key: "b479-rescope-no-scope",
          audit_id: "018f3b8a-0000-7000-8000-bbbb00000039",
          correlation_id: "corr-b479-rescope-no-scope",
        })
      )
    ).rejects.toBeInstanceOf(RoleScopeRequiredError);
    await expect(
      rescopeRoleDefinition(
        testDb(),
        rescopeInput({
          role_definition_id: created.roleDefinitionId,
          base_revision: base,
          category_key: "Department",
          idempotency_key: "b479-rescope-invalid-parent",
          audit_id: "018f3b8a-0000-7000-8000-bbbb00000054",
          correlation_id: "corr-b479-rescope-invalid-parent",
        })
      )
    ).rejects.toBeInstanceOf(RoleInvalidParentError);
    await expect(
      rescopeRoleDefinition(
        testDb(),
        rescopeInput({
          role_definition_id: created.roleDefinitionId,
          base_revision: base,
          category_key: "Global",
          scope_kind: "Global",
          scope_id: null,
          idempotency_key: "b479-rescope-staff-global",
          audit_id: "018f3b8a-0000-7000-8000-bbbb00000055",
          correlation_id: "corr-b479-rescope-staff-global",
        })
      )
    ).rejects.toBeInstanceOf(RoleScopeMismatchError);

    await testDb()
      .prepare(
        `UPDATE role_definitions
            SET scope_kind = 'Department', scope_id = ?
          WHERE stable_key = 'staff'`
      )
      .bind("018f3b8a-0000-7000-8000-000000000002")
      .run();
    try {
      await expect(
        rescopeRoleDefinition(
          testDb(),
          rescopeInput({
            role_definition_id: created.roleDefinitionId,
            base_revision: base,
            idempotency_key: "b479-rescope-out-of-scope",
            audit_id: "018f3b8a-0000-7000-8000-bbbb00000056",
            correlation_id: "corr-b479-rescope-out-of-scope",
          })
        )
      ).rejects.toBeInstanceOf(RoleScopeMismatchError);
    } finally {
      await testDb()
        .prepare(
          `UPDATE role_definitions
              SET scope_kind = 'Global', scope_id = ?
            WHERE stable_key = 'staff'`
        )
        .bind(null)
        .run();
    }

    await testDb()
      .prepare(
        `UPDATE role_definitions SET is_archived = 1
          WHERE role_definition_id = ?`
      )
      .bind(created.roleDefinitionId)
      .run();
    await expect(
      rescopeRoleDefinition(
        testDb(),
        rescopeInput({
          role_definition_id: created.roleDefinitionId,
          base_revision: base,
          idempotency_key: "b479-rescope-archived",
          audit_id: "018f3b8a-0000-7000-8000-bbbb00000057",
          correlation_id: "corr-b479-rescope-archived",
        })
      )
    ).rejects.toBeInstanceOf(RoleArchivedError);
    const rescopeAudits = await testDb()
      .prepare(
        `SELECT audit_id, actor_user_id, action, entity_id, reason, outcome,
                correlation_id
           FROM role_audit_events
          WHERE audit_id IN (?, ?, ?, ?)`
      )
      .bind(
        "018f3b8a-0000-7000-8000-bbbb00000039",
        "018f3b8a-0000-7000-8000-bbbb00000054",
        "018f3b8a-0000-7000-8000-bbbb00000055",
        "018f3b8a-0000-7000-8000-bbbb00000056"
      )
      .all<{
        audit_id: string;
        actor_user_id: string;
        action: string;
        entity_id: string;
        reason: string;
        outcome: string;
        correlation_id: string;
      }>();
    expect(rescopeAudits.results ?? []).toHaveLength(4);
    const rescopeAuditById = new Map(
      (rescopeAudits.results ?? []).map((audit) => [audit.audit_id, audit])
    );
    expect(
      rescopeAuditById.get("018f3b8a-0000-7000-8000-bbbb00000039")
    ).toEqual({
      audit_id: "018f3b8a-0000-7000-8000-bbbb00000039",
      actor_user_id: STAFF,
      action: "ROLE_DEFINITION_RESCOPE",
      entity_id: created.roleDefinitionId,
      reason: "ROLE_SCOPE_REQUIRED",
      outcome: "REJECTED",
      correlation_id: "corr-b479-rescope-no-scope",
    });
    expect(
      rescopeAuditById.get("018f3b8a-0000-7000-8000-bbbb00000054")
    ).toEqual({
      audit_id: "018f3b8a-0000-7000-8000-bbbb00000054",
      actor_user_id: STAFF,
      action: "ROLE_DEFINITION_RESCOPE",
      entity_id: created.roleDefinitionId,
      reason: "ROLE_INVALID_PARENT",
      outcome: "REJECTED",
      correlation_id: "corr-b479-rescope-invalid-parent",
    });
    expect(
      rescopeAuditById.get("018f3b8a-0000-7000-8000-bbbb00000055")
    ).toEqual({
      audit_id: "018f3b8a-0000-7000-8000-bbbb00000055",
      actor_user_id: STAFF,
      action: "ROLE_DEFINITION_RESCOPE",
      entity_id: created.roleDefinitionId,
      reason: "ROLE_SCOPE_MISMATCH",
      outcome: "DENIED",
      correlation_id: "corr-b479-rescope-staff-global",
    });
    expect(
      rescopeAuditById.get("018f3b8a-0000-7000-8000-bbbb00000056")
    ).toEqual({
      audit_id: "018f3b8a-0000-7000-8000-bbbb00000056",
      actor_user_id: STAFF,
      action: "ROLE_DEFINITION_RESCOPE",
      entity_id: created.roleDefinitionId,
      reason: "ROLE_SCOPE_MISMATCH",
      outcome: "DENIED",
      correlation_id: "corr-b479-rescope-out-of-scope",
    });
    const archivedAudit = await readScalar<{
      actor_user_id: string;
      action: string;
      entity_id: string;
      reason: string;
      outcome: string;
      correlation_id: string;
    }>(
      `SELECT actor_user_id, action, entity_id, reason, outcome, correlation_id
         FROM role_audit_events WHERE audit_id = ?`,
      "018f3b8a-0000-7000-8000-bbbb00000057"
    );
    expect(archivedAudit).toEqual({
      actor_user_id: STAFF,
      action: "ROLE_DEFINITION_RESCOPE",
      entity_id: created.roleDefinitionId,
      reason: "ROLE_ARCHIVED",
      outcome: "REJECTED",
      correlation_id: "corr-b479-rescope-archived",
    });
    expect(await readRevision()).toBe(base);
  });

  test("B-479 scope edit reports stale revisions without a partial write", async () => {
    const createBase = await readRevision();
    const created = await createRoleDefinition(
      testDb(),
      createInput({
        base_revision: createBase,
        label: "過期範圍角色",
        idempotency_key: "b479-rescope-stale-create",
        audit_id: "018f3b8a-0000-7000-8000-bbbb00000058",
      })
    );
    const current = await readRevision();
    await expect(
      rescopeRoleDefinition(
        testDb(),
        rescopeInput({
          role_definition_id: created.roleDefinitionId,
          base_revision: current - 1,
          idempotency_key: "b479-rescope-stale",
          audit_id: "018f3b8a-0000-7000-8000-bbbb00000059",
        })
      )
    ).rejects.toBeInstanceOf(RoleRevisionConflictError);
    expect(await readRevision()).toBe(current);
    const row = await readScalar<{ category_key: string; scope_kind: string }>(
      `SELECT category_key, scope_kind FROM role_definitions
        WHERE role_definition_id = ?`,
      created.roleDefinitionId
    );
    expect(row).toEqual({
      category_key: "Department",
      scope_kind: "Department",
    });
    const audit = await readScalar<{ outcome: string; reason: string }>(
      `SELECT outcome, reason FROM role_audit_events WHERE audit_id = ?`,
      "018f3b8a-0000-7000-8000-bbbb00000059"
    );
    expect(audit?.outcome).toBe("CONFLICT");
    expect(audit?.reason).toContain("ROLE_REVISION_CONFLICT");
  });

  test("B-479 scope edit replays response loss and rejects changed-key reuse", async () => {
    const createBase = await readRevision();
    const created = await createRoleDefinition(
      testDb(),
      createInput({
        base_revision: createBase,
        label: "可重播範圍角色",
        idempotency_key: "b479-rescope-replay-create",
        audit_id: "018f3b8a-0000-7000-8000-bbbb00000060",
      })
    );
    const base = await readRevision();
    const input = rescopeInput({
      role_definition_id: created.roleDefinitionId,
      base_revision: base,
      idempotency_key: "b479-rescope-replay",
      audit_id: "018f3b8a-0000-7000-8000-bbbb00000061",
      correlation_id: "corr-b479-rescope-replay",
    });
    const first = await rescopeRoleDefinition(testDb(), input);
    const replay = await rescopeRoleDefinition(testDb(), {
      ...input,
      audit_id: "018f3b8a-0000-7000-8000-bbbb00000062",
      correlation_id: "corr-b479-rescope-replay-2",
    });
    expect(replay).toEqual({ ...first, idempotent: true });
    expect(await readRevision()).toBe(first.revision);
    const rescopeReplayAuditCount = await readScalar<{ c: number }>(
      `SELECT COUNT(*) AS c FROM role_audit_events
        WHERE action = 'ROLE_DEFINITION_RESCOPE'
          AND entity_id = ?`,
      created.roleDefinitionId
    );
    expect(rescopeReplayAuditCount?.c).toBe(1);
    const rescopeReplayAudit = await readScalar<{ correlation_id: string }>(
      `SELECT correlation_id FROM role_audit_events WHERE audit_id = ?`,
      "018f3b8a-0000-7000-8000-bbbb00000061"
    );
    expect(rescopeReplayAudit?.correlation_id).toBe("corr-b479-rescope-replay");
    await expect(
      rescopeRoleDefinition(testDb(), {
        ...input,
        category_key: "Department",
        scope_kind: "Department",
        scope_id: "018f3b8a-0000-7000-8000-000000000002",
        audit_id: "018f3b8a-0000-7000-8000-bbbb00000063",
      })
    ).rejects.toBeInstanceOf(RoleIdempotencyConflictError);
    expect(await readRevision()).toBe(first.revision);
    const row = await readScalar<{ category_key: string; scope_id: string }>(
      `SELECT category_key, scope_id FROM role_definitions
        WHERE role_definition_id = ?`,
      created.roleDefinitionId
    );
    expect(row).toEqual({
      category_key: "Program",
      scope_id: "018f3b8a-0000-7000-8000-300000000001",
    });
    const audit = await readScalar<{ outcome: string; reason: string }>(
      `SELECT outcome, reason FROM role_audit_events WHERE audit_id = ?`,
      "018f3b8a-0000-7000-8000-bbbb00000063"
    );
    expect(audit).toEqual({
      outcome: "REJECTED",
      reason: "ROLE_IDEMPOTENCY_REUSE",
    });
  });
  test("C-485: Program Leader without permission-read has no permissions affordance", async () => {
    const actor = "E2E_485_PROGRAM_ONLY";
    const target = "018f3b8a-0000-7000-8000-100000000485";
    const assignment = "E2E_485_PROGRAM_ONLY_ASSIGNMENT";
    const program = "018f3b8a-0000-7000-8000-300000000001";
    await testDb().batch([
      testDb()
        .prepare(
          `INSERT OR IGNORE INTO accounts
             (user_id, name, username, username_normalized, credential_hash,
              credential_kind, credential_version, account_status, role, phone,
              qr_code_string, legacy_pin_hash, requires_upgrade, lock_level,
              failed_attempts, locked_until, lock_since, created_at, updated_at)
           VALUES (?, ?, ?, ?, NULL, 'password', 2, 'Active', 'Member',
                   NULL, NULL, NULL, 0, 0, 0, NULL, NULL, ?, ?)`
        )
        .bind(
          actor,
          "Permission-only test Program Leader",
          "permission-only-program-leader",
          "permission-only-program-leader",
          Date.parse(NOW),
          Date.parse(NOW)
        ),
      testDb()
        .prepare(
          `INSERT OR IGNORE INTO role_definitions
             (role_definition_id, category_key, stable_key, label, description,
              scope_kind, scope_id, position, is_protected, is_archived,
              created_by, created_at, updated_by, updated_at)
           VALUES (?, 'Program', 'c485.permission-target', 'C-485 target',
                   'Permission affordance target', 'Program', ?, 30, 0, 0,
                   NULL, ?, NULL, ?)`
        )
        .bind(target, program, NOW, NOW),
      testDb()
        .prepare(
          `INSERT OR IGNORE INTO role_assignments
             (assignment_id, account_user_id, role_definition_id,
              granted_by, granted_at, scope_kind, scope_id,
              revoked_by, revoked_at, revoke_reason)
           VALUES (?, ?, ?, ?, ?, 'Program',
                   '018f3b8a-0000-7000-8000-300000000001',
                   NULL, NULL, NULL)`
        )
        .bind(assignment, actor, PROGRAM_LEADER_ROLE, ADMIN, NOW),
    ]);
    try {
      const view = await loadRoleHierarchy(testDb(), actor);
      const targetDefinition = view.categories
        .flatMap((category) => category.definitions)
        .find((definition) => definition.roleDefinitionId === target);
      expect(targetDefinition).toBeDefined();
      expect(
        targetDefinition?.actions.some(
          (action) => action.action === "permissions"
        )
      ).toBe(false);
    } finally {
      await testDb()
        .prepare("DELETE FROM role_assignments WHERE assignment_id = ?")
        .bind(assignment)
        .run();
      await testDb()
        .prepare("DELETE FROM role_definitions WHERE role_definition_id = ?")
        .bind(target)
        .run();
      await testDb()
        .prepare("DELETE FROM accounts WHERE user_id = ?")
        .bind(actor)
        .run();
    }
  });
});
