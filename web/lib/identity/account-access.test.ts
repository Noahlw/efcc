import { beforeAll, describe, expect, test } from "vitest";

import { applyMigrations, testDb } from "../auth/test-bootstrap";
import {
  getRoleDefinitionLifecyclePreview,
  loadAccountAccess,
  mutateAccountAssignments,
  mutateRoleDefinitionLifecycle,
  revokeAccountAssignments,
  searchEligibleAccounts,
} from "./account-access";
import type { AccountAccessView } from "./account-access";
import { seedDisposableIdentity } from "./index";
import { createRoleDefinition, rescopeRoleDefinition } from "./role-hierarchy";

const ADMIN = "E2E_DISPOSABLE_ADMIN";
const STAFF = "E2E_DISPOSABLE_STAFF";
const MEMBER = "E2E_DISPOSABLE_MEMBER";
const DEPARTMENT_ROLE = "018f3b8a-0000-7000-8000-100000000001";
const PROGRAM_ROLE = "018f3b8a-0000-7000-8000-100000000002";
const BASELINE_ROLE = "018f3b8a-0000-7000-8000-000000000a03";
const SCOPED_ACTOR = "E2E_ACCOUNT_ACCESS_SCOPED_ACTOR";
const MIXED_SCOPE_TARGET = "E2E_ACCOUNT_ACCESS_MIXED_TARGET";
const OUT_OF_SCOPE_TARGET = "E2E_ACCOUNT_ACCESS_OUT_OF_SCOPE_TARGET";
const FIXTURE_NOW = "2026-08-29T00:00:00.000Z";

async function ensureMixedScopeFixtures(): Promise<void> {
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
        SCOPED_ACTOR,
        "Scoped Account Access Actor",
        "account-access-scoped-actor",
        "account-access-scoped-actor",
        Date.parse(FIXTURE_NOW),
        Date.parse(FIXTURE_NOW)
      ),
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
        MIXED_SCOPE_TARGET,
        "Mixed Scope Target",
        "account-access-mixed-target",
        "account-access-mixed-target",
        Date.parse(FIXTURE_NOW),
        Date.parse(FIXTURE_NOW)
      ),
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
        OUT_OF_SCOPE_TARGET,
        "Out Of Scope Target",
        "account-access-out-of-scope-target",
        "account-access-out-of-scope-target",
        Date.parse(FIXTURE_NOW),
        Date.parse(FIXTURE_NOW)
      ),
    testDb()
      .prepare(
        `INSERT OR IGNORE INTO role_assignments
           (assignment_id, account_user_id, role_definition_id,
            granted_by, granted_at, scope_kind, scope_id,
            revoked_by, revoked_at, revoke_reason)
         SELECT ?, ?, ?, ?, ?, rd.scope_kind, rd.scope_id,
                NULL, NULL, NULL
           FROM role_definitions rd
          WHERE rd.role_definition_id = ?`
      )
      .bind(
        "account-access-scoped-actor-department",
        SCOPED_ACTOR,
        DEPARTMENT_ROLE,
        ADMIN,
        Date.parse(FIXTURE_NOW),
        DEPARTMENT_ROLE
      ),
    ...[
      [MIXED_SCOPE_TARGET, "account-access-mixed-baseline", BASELINE_ROLE],
      [MIXED_SCOPE_TARGET, "account-access-mixed-department", DEPARTMENT_ROLE],
      [MIXED_SCOPE_TARGET, "account-access-mixed-program", PROGRAM_ROLE],
      [OUT_OF_SCOPE_TARGET, "account-access-outside-baseline", BASELINE_ROLE],
      [OUT_OF_SCOPE_TARGET, "account-access-outside-program", PROGRAM_ROLE],
    ].map(([account, assignment, role]) =>
      testDb()
        .prepare(
          `INSERT OR IGNORE INTO role_assignments
             (assignment_id, account_user_id, role_definition_id,
              granted_by, granted_at, scope_kind, scope_id,
              revoked_by, revoked_at, revoke_reason)
           SELECT ?, ?, ?, ?, ?, rd.scope_kind, rd.scope_id,
                  NULL, NULL, NULL
             FROM role_definitions rd
            WHERE rd.role_definition_id = ?`
        )
        .bind(assignment, account, role, ADMIN, Date.parse(FIXTURE_NOW), role)
    ),
  ]);
}

type AccountAccessViewWithAssignmentOptions = AccountAccessView & {
  assignableRoles: readonly { roleDefinitionId: string }[];
};

beforeAll(async () => {
  await applyMigrations();
  await seedDisposableIdentity(testDb(), {
    databaseName: "E2E_account-access-red",
  });
  await ensureMixedScopeFixtures();
});

describe("#486 Account Access domain", () => {
  test("searches only eligible Active non-Admin accounts and omits private fields", async () => {
    const result = await searchEligibleAccounts(
      testDb(),
      ADMIN,
      "Disposable",
      0,
      20
    );
    expect(result.accounts.some((account) => account.userId === ADMIN)).toBe(
      false
    );
    expect(result.accounts.every((account) => account.userId !== ADMIN)).toBe(
      true
    );
    expect(
      result.accounts.every((account) => "phone" in account === false)
    ).toBe(true);
    expect(
      result.accounts.every((account) => "credential_hash" in account === false)
    ).toBe(true);
  });

  test("loads effective access with automatic baseline and exact scope provenance", async () => {
    const view = await loadAccountAccess(testDb(), ADMIN, STAFF);
    expect(view.account).toMatchObject({
      userId: STAFF,
      status: "Active",
    });
    expect(
      view.effectiveAccess.Global.some(
        (grant) => grant.capability === "program.enroll"
      )
    ).toBe(true);
    expect(JSON.stringify(view)).not.toContain("credential_hash");
    expect(JSON.stringify(view)).not.toContain("phone");
  });
  test("includes the automatic baseline for an account with no lower identity", async () => {
    const view = await loadAccountAccess(testDb(), ADMIN, MEMBER);
    expect(view.activeAssignments).toHaveLength(1);
    expect(view.activeAssignments[0]?.label).toBe("會友基礎");
    expect(
      view.effectiveAccess.Global.map((grant) => grant.capability)
    ).toContain("program.enroll");
  });
  test("keeps mixed-scope targets eligible while filtering out-of-scope access", async () => {
    const view = await loadAccountAccess(
      testDb(),
      SCOPED_ACTOR,
      MIXED_SCOPE_TARGET
    );
    const activeRoleIds = view.activeAssignments.map(
      (assignment) => assignment.roleDefinitionId
    );
    expect(activeRoleIds).toEqual(
      expect.arrayContaining([BASELINE_ROLE, DEPARTMENT_ROLE])
    );
    expect(activeRoleIds).not.toContain(PROGRAM_ROLE);
    expect(view.effectiveAccess.Department.length).toBeGreaterThan(0);
    expect(view.effectiveAccess.Program).toHaveLength(0);
    expect(JSON.stringify(view)).not.toContain("青少年查經帶領");
  });

  test("keeps targets with only out-of-scope assignments eligible with baseline access", async () => {
    const view = await loadAccountAccess(
      testDb(),
      SCOPED_ACTOR,
      OUT_OF_SCOPE_TARGET
    );
    expect(
      view.activeAssignments.map((assignment) => assignment.roleDefinitionId)
    ).toEqual([BASELINE_ROLE]);
    expect(view.effectiveAccess.Department).toHaveLength(0);
    expect(view.effectiveAccess.Program).toHaveLength(0);
    expect(
      view.effectiveAccess.Global.map((grant) => grant.capability)
    ).toContain("program.enroll");
  });

  test("rejects an unauthorized absent revoke before returning Account Access", async () => {
    const before = await loadAccountAccess(testDb(), ADMIN, STAFF);
    await expect(
      revokeAccountAssignments(testDb(), {
        actor_user_id: MEMBER,
        account_user_id: STAFF,
        base_revision: before.revision,
        role_definition_ids: [DEPARTMENT_ROLE],
        idempotency_key: "account-access-red-unauthorized-absent-revoke",
        now: "2026-08-29T00:00:30.000Z",
        audit_id: "account-access-red-unauthorized-absent-revoke-audit",
        correlation_id:
          "account-access-red-unauthorized-absent-revoke-correlation",
      })
    ).rejects.toThrow("ROLE_FORBIDDEN");
  });

  test("rejects an unauthorized active duplicate before returning Account Access", async () => {
    const revision = await testDb()
      .prepare("SELECT revision FROM role_policy_revisions WHERE id = 1")
      .first<{ revision: number }>();
    await mutateAccountAssignments(testDb(), {
      actor_user_id: ADMIN,
      account_user_id: "E2E_DISPOSABLE_DM",
      base_revision: revision?.revision ?? 1,
      role_definition_ids: [DEPARTMENT_ROLE],
      idempotency_key: "account-access-red-unauthorized-duplicate-seed",
      now: "2026-08-29T00:00:45.000Z",
      audit_id: "account-access-red-unauthorized-duplicate-seed-audit",
      correlation_id:
        "account-access-red-unauthorized-duplicate-seed-correlation",
    });
    const before = await loadAccountAccess(
      testDb(),
      ADMIN,
      "E2E_DISPOSABLE_DM"
    );
    await expect(
      mutateAccountAssignments(testDb(), {
        actor_user_id: MEMBER,
        account_user_id: "E2E_DISPOSABLE_DM",
        base_revision: before.revision,
        role_definition_ids: [DEPARTMENT_ROLE],
        idempotency_key: "account-access-red-unauthorized-duplicate",
        now: "2026-08-29T00:00:50.000Z",
        audit_id: "account-access-red-unauthorized-duplicate-audit",
        correlation_id: "account-access-red-unauthorized-duplicate-correlation",
      })
    ).rejects.toThrow("ROLE_FORBIDDEN");
  });

  test("preserves assignment scope snapshot after role rescope and revoke history", async () => {
    const current = await testDb()
      .prepare("SELECT revision FROM role_policy_revisions WHERE id = 1")
      .first<{ revision: number }>();
    const created = await createRoleDefinition(testDb(), {
      actor_user_id: ADMIN,
      idempotency_key: "account-access-red-scope-snapshot-create",
      base_revision: current?.revision ?? 1,
      category_key: "Program",
      label: "快照歷史測試身份組",
      description: "",
      scope_kind: "Program",
      scope_id: "018f3b8a-0000-7000-8000-300000000001",
      now: "2026-08-29T00:00:55.000Z",
      audit_id: "account-access-red-scope-snapshot-create-audit",
      correlation_id: "account-access-red-scope-snapshot-create-correlation",
    });
    const added = await mutateAccountAssignments(testDb(), {
      actor_user_id: ADMIN,
      account_user_id: STAFF,
      base_revision: created.revision,
      role_definition_ids: [created.roleDefinitionId],
      idempotency_key: "account-access-red-scope-snapshot-add",
      now: "2026-08-29T00:01:00.000Z",
      audit_id: "account-access-red-scope-snapshot-add-audit",
      correlation_id: "account-access-red-scope-snapshot-add-correlation",
    });
    const rescoped = await rescopeRoleDefinition(testDb(), {
      actor_user_id: ADMIN,
      idempotency_key: "account-access-red-scope-snapshot-rescope",
      base_revision: added.revision,
      role_definition_id: created.roleDefinitionId,
      category_key: "Department",
      scope_kind: "Department",
      scope_id: "018f3b8a-0000-7000-8000-000000000002",
      now: "2026-08-29T00:01:05.000Z",
      audit_id: "account-access-red-scope-snapshot-rescope-audit",
      correlation_id: "account-access-red-scope-snapshot-rescope-correlation",
    });
    expect(rescoped.scopeKind).toBe("Department");
    const rescopeView = await loadAccountAccess(testDb(), ADMIN, STAFF);
    const active = rescopeView.activeAssignments.find(
      (assignment) => assignment.roleDefinitionId === created.roleDefinitionId
    );
    expect(active).toMatchObject({
      scopeKind: "Department",
      scopeId: "018f3b8a-0000-7000-8000-000000000002",
    });
    const revoked = await revokeAccountAssignments(testDb(), {
      actor_user_id: ADMIN,
      account_user_id: STAFF,
      base_revision: rescopeView.revision,
      role_definition_ids: [created.roleDefinitionId],
      idempotency_key: "account-access-red-scope-snapshot-revoke",
      now: "2026-08-29T00:01:10.000Z",
      audit_id: "account-access-red-scope-snapshot-revoke-audit",
      correlation_id: "account-access-red-scope-snapshot-revoke-correlation",
    });
    const history = revoked.revokedAssignments.find(
      (assignment) => assignment.roleDefinitionId === created.roleDefinitionId
    );
    expect(history).toMatchObject({
      scopeKind: "Program",
      scopeId: "018f3b8a-0000-7000-8000-300000000001",
    });
    const duplicateRevoke = await revokeAccountAssignments(testDb(), {
      actor_user_id: ADMIN,
      account_user_id: STAFF,
      base_revision: revoked.revision,
      role_definition_ids: [created.roleDefinitionId],
      idempotency_key: "account-access-red-scope-snapshot-duplicate-revoke",
      now: "2026-08-29T00:01:15.000Z",
      audit_id: "account-access-red-scope-snapshot-duplicate-revoke-audit",
      correlation_id:
        "account-access-red-scope-snapshot-duplicate-revoke-correlation",
    });
    expect(duplicateRevoke.duplicateRoleDefinitionIds).toEqual([
      created.roleDefinitionId,
    ]);
    const audit = await testDb()
      .prepare(
        "SELECT action, outcome FROM role_audit_events WHERE audit_id = ?"
      )
      .bind("account-access-red-scope-snapshot-duplicate-revoke-audit")
      .first<{ action: string; outcome: string }>();
    expect(audit).toEqual({
      action: "ROLE_ASSIGNMENT_REVOKE",
      outcome: "DUPLICATE",
    });
  });

  test("atomically adds several lower identities and reports active duplicates", async () => {
    const revision = await testDb()
      .prepare("SELECT revision FROM role_policy_revisions WHERE id = 1")
      .first<{ revision: number }>();
    const result = await mutateAccountAssignments(testDb(), {
      actor_user_id: ADMIN,
      account_user_id: STAFF,
      base_revision: revision?.revision ?? 1,
      role_definition_ids: [DEPARTMENT_ROLE, PROGRAM_ROLE],
      idempotency_key: "account-access-red-add",
      now: "2026-08-29T00:00:00.000Z",
      audit_id: "account-access-red-add-audit",
      correlation_id: "account-access-red-add-correlation",
    });
    expect(result.idempotent).toBe(false);
    expect(result.duplicateRoleDefinitionIds).toEqual([]);
    expect(
      result.activeAssignments.map((assignment) => assignment.roleDefinitionId)
    ).toEqual(expect.arrayContaining([DEPARTMENT_ROLE, PROGRAM_ROLE]));
    expect(result.effectiveAccess.Department.length).toBeGreaterThan(0);
    expect(result.effectiveAccess.Program.length).toBeGreaterThan(0);
    const audit = await testDb()
      .prepare("SELECT reason FROM role_audit_events WHERE audit_id = ?")
      .bind("account-access-red-add-audit")
      .first<{ reason: string | null }>();
    expect(audit?.reason).toBe("account_access_grant");
  });

  test("active identities are a named duplicate no-op and replay without a second audit", async () => {
    const before = await loadAccountAccess(testDb(), ADMIN, STAFF);
    const result = await mutateAccountAssignments(testDb(), {
      actor_user_id: ADMIN,
      account_user_id: STAFF,
      base_revision: before.revision,
      role_definition_ids: [DEPARTMENT_ROLE],
      idempotency_key: "account-access-red-duplicate",
      now: "2026-08-29T00:01:30.000Z",
      audit_id: "account-access-red-duplicate-audit",
      correlation_id: "account-access-red-duplicate-correlation",
    });
    expect(result.idempotent).toBe(false);
    expect(result.duplicateRoleDefinitionIds).toEqual([DEPARTMENT_ROLE]);
    const replay = await mutateAccountAssignments(testDb(), {
      actor_user_id: ADMIN,
      account_user_id: STAFF,
      base_revision: before.revision,
      role_definition_ids: [DEPARTMENT_ROLE],
      idempotency_key: "account-access-red-duplicate",
      now: "2026-08-29T00:02:30.000Z",
      audit_id: "account-access-red-duplicate-replay-audit",
      correlation_id: "account-access-red-duplicate-replay-correlation",
    });
    expect(replay.idempotent).toBe(true);
    const audits = await testDb()
      .prepare(
        "SELECT COUNT(*) AS count FROM role_audit_events WHERE correlation_id LIKE 'account-access-red-duplicate%'"
      )
      .first<{ count: number }>();
    expect(audits?.count).toBe(1);
  });

  test("rejects an invalid identity before changing any assignment", async () => {
    const before = await testDb()
      .prepare("SELECT COUNT(*) AS count FROM role_assignments")
      .first<{ count: number }>();
    const revision = await testDb()
      .prepare("SELECT revision FROM role_policy_revisions WHERE id = 1")
      .first<{ revision: number }>();
    await expect(
      mutateAccountAssignments(testDb(), {
        actor_user_id: ADMIN,
        account_user_id: STAFF,
        base_revision: revision?.revision ?? 1,
        role_definition_ids: [DEPARTMENT_ROLE, "unknown-role-definition"],
        idempotency_key: "account-access-red-invalid",
        now: "2026-08-29T00:01:00.000Z",
        audit_id: "account-access-red-invalid-audit",
        correlation_id: "account-access-red-invalid-correlation",
      })
    ).rejects.toThrow(/ROLE_NOT_FOUND|ROLE_TARGET_INELIGIBLE/);
    const after = await testDb()
      .prepare("SELECT COUNT(*) AS count FROM role_assignments")
      .first<{ count: number }>();
    expect(after?.count).toBe(before?.count);
  });

  test("revokes into immutable history and re-adds with a fresh assignment event", async () => {
    const before = await loadAccountAccess(testDb(), ADMIN, STAFF);
    const assignment = before.activeAssignments.find(
      (item) => item.roleDefinitionId === DEPARTMENT_ROLE
    );
    expect(assignment).toBeDefined();
    const revoke = await revokeAccountAssignments(testDb(), {
      actor_user_id: ADMIN,
      account_user_id: STAFF,
      base_revision: before.revision,
      role_definition_ids: [DEPARTMENT_ROLE],
      idempotency_key: "account-access-red-revoke",
      now: "2026-08-29T00:02:00.000Z",
      audit_id: "account-access-red-revoke-audit",
      correlation_id: "account-access-red-revoke-correlation",
    });
    expect(
      revoke.activeAssignments.some(
        (item) => item.roleDefinitionId === DEPARTMENT_ROLE
      )
    ).toBe(false);
    expect(
      revoke.revokedAssignments.some(
        (item) => item.roleDefinitionId === DEPARTMENT_ROLE
      )
    ).toBe(true);
    const readd = await mutateAccountAssignments(testDb(), {
      actor_user_id: ADMIN,
      account_user_id: STAFF,
      base_revision: revoke.revision,
      role_definition_ids: [DEPARTMENT_ROLE],
      idempotency_key: "account-access-red-readd",
      now: "2026-08-29T00:03:00.000Z",
      audit_id: "account-access-red-readd-audit",
      correlation_id: "account-access-red-readd-correlation",
    });
    const fresh = readd.activeAssignments.find(
      (item) => item.roleDefinitionId === DEPARTMENT_ROLE
    );
    expect(fresh?.assignmentId).not.toBe(assignment?.assignmentId);
    expect(
      readd.revokedAssignments.filter(
        (item) => item.roleDefinitionId === DEPARTMENT_ROLE
      )
    ).toHaveLength(1);
    const audit = await testDb()
      .prepare("SELECT reason FROM role_audit_events WHERE audit_id = ?")
      .bind("account-access-red-revoke-audit")
      .first<{ reason: string | null }>();
    expect(audit?.reason).toBe("account_access_revoke");
  });

  test("authorizes Account Access and lifecycle before target disclosure", async () => {
    const revision = await testDb()
      .prepare("SELECT revision FROM role_policy_revisions WHERE id = 1")
      .first<{ revision: number }>();
    const input = {
      actor_user_id: MEMBER,
      account_user_id: "unknown-account",
      base_revision: revision?.revision ?? 1,
      role_definition_ids: [DEPARTMENT_ROLE],
      idempotency_key: "account-access-red-authorize-first-assignment",
      now: "2026-08-29T00:03:30.000Z",
      audit_id: "account-access-red-authorize-first-assignment-audit",
      correlation_id:
        "account-access-red-authorize-first-assignment-correlation",
    };
    await expect(mutateAccountAssignments(testDb(), input)).rejects.toThrow(
      "ROLE_FORBIDDEN"
    );
    await expect(
      loadAccountAccess(testDb(), MEMBER, "unknown-account")
    ).rejects.toThrow("ROLE_FORBIDDEN");
    await expect(
      mutateRoleDefinitionLifecycle(testDb(), {
        actor_user_id: MEMBER,
        role_definition_id: "unknown-role-definition",
        action: "archive",
        base_revision: revision?.revision ?? 1,
        idempotency_key: "account-access-red-authorize-first-lifecycle",
        now: "2026-08-29T00:03:31.000Z",
        audit_id: "account-access-red-authorize-first-lifecycle-audit",
        correlation_id:
          "account-access-red-authorize-first-lifecycle-correlation",
      })
    ).rejects.toThrow("ROLE_FORBIDDEN");
  });

  test("returns a server-authorized assignment picker and lifecycle impact preview", async () => {
    const view = await loadAccountAccess(testDb(), ADMIN, STAFF);
    const assignableRoles = (view as AccountAccessViewWithAssignmentOptions)
      .assignableRoles;
    expect(assignableRoles.length).toBeGreaterThan(0);
    expect(
      assignableRoles.every(
        (role) =>
          !view.activeAssignments.some(
            (assignment) =>
              assignment.roleDefinitionId === role.roleDefinitionId
          )
      )
    ).toBe(true);
    const preview = await getRoleDefinitionLifecyclePreview(
      testDb(),
      ADMIN,
      PROGRAM_ROLE,
      "archive"
    );
    expect(preview.revision).toBeGreaterThanOrEqual(view.revision);
    expect(preview.impact.length).toBeGreaterThan(0);
    expect(preview.impact[0]?.lost).toBeDefined();
    expect(preview.impact[0]?.retained).toBeDefined();
  });

  test("archives all live assignments and restores definition without assignments", async () => {
    const before = await loadAccountAccess(testDb(), ADMIN, STAFF);
    expect(before.actions.archiveRoleDefinitionIds).toContain(PROGRAM_ROLE);
    expect(before.lifecycleImpacts[PROGRAM_ROLE]).toMatchObject({
      roleDefinitionId: PROGRAM_ROLE,
      action: "archive",
      label: "青少年查經帶領",
    });
    expect(
      before.lifecycleImpacts[PROGRAM_ROLE]?.lost.Program.length
    ).toBeGreaterThan(0);
    expect(
      before.lifecycleImpacts[PROGRAM_ROLE]?.retained.Global.some((grant) =>
        grant.sources.includes("會友基礎")
      )
    ).toBe(true);
    const lifecycle = await mutateRoleDefinitionLifecycle(testDb(), {
      actor_user_id: ADMIN,
      role_definition_id: PROGRAM_ROLE,
      action: "archive",
      base_revision: before.revision,
      idempotency_key: "account-access-red-archive",
      now: "2026-08-29T00:04:00.000Z",
      audit_id: "account-access-red-archive-audit",
      correlation_id: "account-access-red-archive-correlation",
    });
    expect(lifecycle.isArchived).toBe(true);
    const archived = await loadAccountAccess(testDb(), ADMIN, STAFF);
    expect(
      archived.activeAssignments.some(
        (item) => item.roleDefinitionId === PROGRAM_ROLE
      )
    ).toBe(false);
    const restored = await mutateRoleDefinitionLifecycle(testDb(), {
      actor_user_id: ADMIN,
      role_definition_id: PROGRAM_ROLE,
      action: "restore",
      base_revision: archived.revision,
      idempotency_key: "account-access-red-restore",
      now: "2026-08-29T00:05:00.000Z",
      audit_id: "account-access-red-restore-audit",
      correlation_id: "account-access-red-restore-correlation",
    });
    expect(restored.isArchived).toBe(false);
    const afterRestore = await loadAccountAccess(testDb(), ADMIN, STAFF);
    expect(
      afterRestore.activeAssignments.some(
        (item) => item.roleDefinitionId === PROGRAM_ROLE
      )
    ).toBe(false);
    expect(
      afterRestore.revokedAssignments.some(
        (item) => item.roleDefinitionId === PROGRAM_ROLE
      )
    ).toBe(true);
    const audit = await testDb()
      .prepare(
        "SELECT action, outcome, correlation_id FROM role_audit_events WHERE audit_id = ?"
      )
      .bind("account-access-red-archive-audit")
      .first<{ action: string; outcome: string; correlation_id: string }>();
    expect(audit).toMatchObject({
      action: "ROLE_DEFINITION_ARCHIVE",
      outcome: "SUCCESS",
      correlation_id: "account-access-red-archive-correlation",
    });
  });
  test("replays the original successful projection after response loss", async () => {
    const before = await loadAccountAccess(testDb(), ADMIN, STAFF);
    const input = {
      actor_user_id: ADMIN,
      account_user_id: STAFF,
      base_revision: before.revision,
      role_definition_ids: [PROGRAM_ROLE],
      idempotency_key: "account-access-red-success-replay",
      now: "2026-08-29T00:06:00.000Z",
      audit_id: "account-access-red-success-replay-audit",
      correlation_id: "account-access-red-success-replay-correlation",
    };
    const first = await mutateAccountAssignments(testDb(), input);
    const replay = await mutateAccountAssignments(testDb(), {
      ...input,
      now: "2026-08-29T00:07:00.000Z",
      audit_id: "account-access-red-success-replay-2-audit",
      correlation_id: "account-access-red-success-replay-2-correlation",
    });
    expect(replay.idempotent).toBe(true);
    expect(replay.revision).toBe(first.revision);
    expect(replay.activeAssignments).toEqual(first.activeAssignments);
    const auditCount = await testDb()
      .prepare(
        "SELECT COUNT(*) AS count FROM role_audit_events WHERE action = 'ROLE_ASSIGNMENT_GRANT' AND entity_id = ?"
      )
      .bind(STAFF)
      .first<{ count: number }>();
    expect(auditCount?.count).toBeGreaterThanOrEqual(1);
  });
});
