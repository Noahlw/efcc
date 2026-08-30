// @vitest-environment workers
/**
 * #485 — Permission Editor domain seam.
 *
 * These tests intentionally exercise the normalized role-definition detail and
 * grant mutation interfaces, not implementation helpers. The Worker/component
 * adapters consume the same projection and mutation result.
 */
import assert from "node:assert/strict";

import { beforeAll, describe, expect, test } from "vitest";

import { applyMigrations, testDb } from "../auth/test-bootstrap";
import { CAPABILITY_CATALOG } from "./capability-catalog";
import { preflightDisposableSchema, seedDisposableIdentity } from "./index";
import {
  RoleCapabilityCatalogError,
  RoleIdempotencyConflictError,
  RoleRevisionConflictError,
} from "./mutations";
import {
  loadRoleDefinitionDetail,
  updateRoleDefinitionGrants,
} from "./permission-editor";
import {
  RoleCapabilityDeniedError,
  resolveActorCapabilities,
} from "./role-hierarchy";
const DISPOSABLE_DATABASE = "E2E_disposable-local";
const ADMIN = "E2E_DISPOSABLE_ADMIN";
const MEMBER = "E2E_DISPOSABLE_MEMBER";
const ADMIN_ROLE = "018f3b8a-0000-7000-8000-000000000a01";
const STAFF_ROLE = "018f3b8a-0000-7000-8000-000000000a02";
const DEPARTMENT_MANAGER = "E2E_DISPOSABLE_DM";
const ADULT_DEPARTMENT = "018f3b8a-0000-7000-8000-000000000002";
const YOUTH_DEPARTMENT = "018f3b8a-0000-7000-8000-000000000001";
const YOUTH_PROGRAM = "018f3b8a-0000-7000-8000-300000000001";
const MEMBER_ROLE = "018f3b8a-0000-7000-8000-000000000a03";
const PROGRAM_LEADER_ROLE = "018f3b8a-0000-7000-8000-100000000002";
const WRITE_ONLY_ACTOR = "E2E_485_WRITE_ONLY";
const WRITE_ONLY_ROLE = "018f3b8a-0000-7000-8000-100000000485";
const WRITE_ONLY_ASSIGNMENT = "E2E_485_WRITE_ONLY_ASSIGNMENT";
const READ_ONLY_ACTOR = "E2E_485_READ_ONLY";
const READ_ONLY_ROLE = "018f3b8a-0000-7000-8000-100000000486";
const READ_ONLY_ASSIGNMENT = "E2E_485_READ_ONLY_ASSIGNMENT";
const ARCHIVED_ROLE = "018f3b8a-0000-7000-8000-100000000487";
const NOW = "2026-08-29T00:00:00.000Z";

async function revision(): Promise<number> {
  const row = await testDb()
    .prepare("SELECT revision FROM role_policy_revisions WHERE id = 1")
    .first<{ revision: number }>();
  return row?.revision ?? 0;
}

async function ensureWriteOnlyActor(): Promise<void> {
  const timestamp = Date.parse(NOW);
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
        WRITE_ONLY_ACTOR,
        "Permission Editor Write Only",
        "permission-editor-write-only",
        "permission-editor-write-only",
        timestamp,
        timestamp
      ),
    testDb()
      .prepare(
        `INSERT OR IGNORE INTO role_definitions
           (role_definition_id, category_key, stable_key, label, description,
            scope_kind, scope_id, position, is_protected, is_archived,
            created_by, created_at, updated_by, updated_at)
         VALUES (?, 'Global', ?, ?, ?, 'Global', NULL, 5, 0, 0,
                 NULL, ?, NULL, ?)`
      )
      .bind(
        WRITE_ONLY_ROLE,
        "permission-editor.write-only",
        "Permission Editor Write Only",
        "Test actor with write but no read",
        NOW,
        NOW
      ),
    testDb()
      .prepare(
        `INSERT OR IGNORE INTO role_definition_grants
           (role_definition_id, capability, granted_by, granted_at)
         VALUES (?, 'role.permissions.write', NULL, ?)`
      )
      .bind(WRITE_ONLY_ROLE, NOW),
    testDb()
      .prepare(
        `INSERT OR IGNORE INTO role_assignments
           (assignment_id, account_user_id, role_definition_id,
            granted_by, granted_at, scope_kind, scope_id,
            revoked_by, revoked_at, revoke_reason)
         VALUES (?, ?, ?, ?, ?, 'Global', NULL, NULL, NULL, NULL)`
      )
      .bind(
        WRITE_ONLY_ASSIGNMENT,
        WRITE_ONLY_ACTOR,
        WRITE_ONLY_ROLE,
        ADMIN,
        NOW
      ),
  ]);
}

async function ensureReadOnlyActor(): Promise<void> {
  const timestamp = Date.parse(NOW);
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
        READ_ONLY_ACTOR,
        "Permission Editor Read Only",
        "permission-editor-read-only",
        "permission-editor-read-only",
        timestamp,
        timestamp
      ),
    testDb()
      .prepare(
        `INSERT OR IGNORE INTO role_definitions
           (role_definition_id, category_key, stable_key, label, description,
            scope_kind, scope_id, position, is_protected, is_archived,
            created_by, created_at, updated_by, updated_at)
         VALUES (?, 'Global', ?, ?, ?, 'Global', NULL, 5, 0, 0,
                 NULL, ?, NULL, ?)`
      )
      .bind(
        READ_ONLY_ROLE,
        "permission-editor.read-only",
        "Permission Editor Read Only",
        "Test actor with read but no write",
        NOW,
        NOW
      ),
    testDb()
      .prepare(
        `INSERT OR IGNORE INTO role_definition_grants
           (role_definition_id, capability, granted_by, granted_at)
         VALUES (?, 'role.permissions.read', NULL, ?)`
      )
      .bind(READ_ONLY_ROLE, NOW),
    testDb()
      .prepare(
        `INSERT OR IGNORE INTO role_definitions
           (role_definition_id, category_key, stable_key, label, description,
            scope_kind, scope_id, position, is_protected, is_archived,
            created_by, created_at, updated_by, updated_at)
         VALUES (?, 'Global', ?, ?, ?, 'Global', NULL, 30, 0, 1,
                 NULL, ?, NULL, ?)`
      )
      .bind(
        ARCHIVED_ROLE,
        "permission-editor.archived",
        "Permission Editor Archived",
        "Archived target for guard precedence",
        NOW,
        NOW
      ),
    testDb()
      .prepare(
        `INSERT OR IGNORE INTO role_assignments
           (assignment_id, account_user_id, role_definition_id,
            granted_by, granted_at, scope_kind, scope_id,
            revoked_by, revoked_at, revoke_reason)
         VALUES (?, ?, ?, ?, ?, 'Global', NULL, NULL, NULL, NULL)`
      )
      .bind(READ_ONLY_ASSIGNMENT, READ_ONLY_ACTOR, READ_ONLY_ROLE, ADMIN, NOW),
  ]);
}

describe("#485 Permission Editor domain seam", () => {
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

  test("projects the complete catalog and protected/automatic lock state", async () => {
    const admin = await loadRoleDefinitionDetail(testDb(), ADMIN, STAFF_ROLE);
    assert.equal(admin.permissions.length, CAPABILITY_CATALOG.length);
    assert.equal(admin.caller.canRead, true);
    assert.equal(admin.caller.canWrite, true);
    assert.equal(
      admin.permissions.find(
        (permission) => permission.capability === "role.read"
      )?.label,
      "檢視身份組"
    );
    assert.equal(
      admin.permissions.find(
        (permission) => permission.capability === "role.permissions.write"
      )?.risk,
      "high"
    );
    for (const metadata of CAPABILITY_CATALOG) {
      assert.equal(typeof metadata.capability, "string");
      assert.ok(metadata.label.length > 0);
      assert.ok(metadata.description.length > 0);
      assert.ok(metadata.group.length > 0);
      assert.ok(metadata.risk === "normal" || metadata.risk === "high");
      assert.equal(typeof metadata.systemOnly, "boolean");
      assert.equal(typeof metadata.scopeRequired, "boolean");
    }

    const protectedAdmin = await loadRoleDefinitionDetail(
      testDb(),
      ADMIN,
      "018f3b8a-0000-7000-8000-000000000a01"
    );
    assert.ok(
      protectedAdmin.permissions.every((permission) => permission.value)
    );
    assert.ok(
      protectedAdmin.permissions.every((permission) => permission.locked)
    );

    const baseline = await loadRoleDefinitionDetail(
      testDb(),
      ADMIN,
      MEMBER_ROLE
    );
    const enroll = baseline.permissions.find(
      (permission) => permission.capability === "program.enroll"
    );
    assert.equal(enroll?.value, true);
    assert.equal(enroll?.locked, true);
    const memberCapabilities = await resolveActorCapabilities(testDb(), MEMBER);
    assert.equal(memberCapabilities["program.enroll"], true);
  });
  test("resolves global and exact scoped grants without widening", async () => {
    const inside = await resolveActorCapabilities(
      testDb(),
      DEPARTMENT_MANAGER,
      {
        departmentId: ADULT_DEPARTMENT,
      }
    );
    const outside = await resolveActorCapabilities(
      testDb(),
      DEPARTMENT_MANAGER,
      { departmentId: YOUTH_DEPARTMENT }
    );
    const program = await resolveActorCapabilities(
      testDb(),
      DEPARTMENT_MANAGER,
      { programId: YOUTH_PROGRAM }
    );
    assert.equal(inside["department.manage"], true);
    assert.equal(outside["department.manage"], undefined);
    assert.equal(program["department.manage"], undefined);
    assert.equal(outside["role.permissions.read"], true);
    assert.equal(outside["program.enroll"], true);
  });

  test("rejects write-only actors and capability-grant bypasses before mutation", async () => {
    await ensureWriteOnlyActor();
    const before = await revision();
    await assert.rejects(
      updateRoleDefinitionGrants(testDb(), {
        actor_user_id: WRITE_ONLY_ACTOR,
        role_definition_id: PROGRAM_LEADER_ROLE,
        base_revision: before,
        idempotency_key: "permission-editor-write-only",
        changes: [{ capability: "registration.approval.manage", value: true }],
        now: NOW,
        audit_id: "permission-editor-audit-write-only",
        correlation_id: "permission-editor-correlation-write-only",
      }),
      (error: unknown) => error instanceof RoleCapabilityDeniedError
    );
    assert.equal(await revision(), before);
    const writeOnlyAudit = await testDb()
      .prepare(
        `SELECT outcome, reason FROM role_audit_events
           WHERE audit_id = ?`
      )
      .bind("permission-editor-audit-write-only")
      .first<{ outcome: string; reason: string }>();
    assert.deepEqual(writeOnlyAudit, {
      outcome: "DENIED",
      reason: "ROLE_FORBIDDEN",
    });

    await assert.rejects(
      updateRoleDefinitionGrants(testDb(), {
        actor_user_id: DEPARTMENT_MANAGER,
        role_definition_id: PROGRAM_LEADER_ROLE,
        base_revision: before,
        idempotency_key: "permission-editor-grant-bypass",
        changes: [{ capability: "registration.approval.manage", value: true }],
        now: NOW,
        audit_id: "permission-editor-audit-grant-bypass",
        correlation_id: "permission-editor-correlation-grant-bypass",
      }),
      (error: unknown) => error instanceof RoleCapabilityDeniedError
    );
    assert.equal(await revision(), before);
  });

  test("adds/removes normalized grants with homogeneous and mixed audit actions", async () => {
    const roleId = PROGRAM_LEADER_ROLE;
    const addRevision = await revision();
    const added = await updateRoleDefinitionGrants(testDb(), {
      actor_user_id: ADMIN,
      role_definition_id: roleId,
      base_revision: addRevision,
      idempotency_key: "permission-editor-add",
      changes: [{ capability: "home.publish", value: true }],
      now: NOW,
      audit_id: "permission-editor-audit-add",
      correlation_id: "permission-editor-correlation-add",
    });
    assert.equal(added.idempotent, false);
    assert.equal(added.revision, addRevision + 1);
    assert.equal(
      added.permissions.find(
        (permission) => permission.capability === "home.publish"
      )?.value,
      true
    );

    const removeRevision = await revision();
    const removed = await updateRoleDefinitionGrants(testDb(), {
      actor_user_id: ADMIN,
      role_definition_id: roleId,
      base_revision: removeRevision,
      idempotency_key: "permission-editor-remove",
      changes: [{ capability: "home.publish", value: false }],
      now: NOW,
      audit_id: "permission-editor-audit-remove",
      correlation_id: "permission-editor-correlation-remove",
    });
    assert.equal(removed.revision, removeRevision + 1);

    const mixedRevision = await revision();
    await updateRoleDefinitionGrants(testDb(), {
      actor_user_id: ADMIN,
      role_definition_id: roleId,
      base_revision: mixedRevision,
      idempotency_key: "permission-editor-mixed",
      changes: [
        { capability: "home.publish", value: true },
        { capability: "program.enroll", value: false },
      ],
      now: NOW,
      audit_id: "permission-editor-audit-mixed",
      correlation_id: "permission-editor-correlation-mixed",
    });

    const actions = await testDb()
      .prepare(
        `SELECT action, outcome, correlation_id FROM role_audit_events
           WHERE audit_id IN (?, ?, ?)
           ORDER BY inserted_at ASC`
      )
      .bind(
        "permission-editor-audit-add",
        "permission-editor-audit-remove",
        "permission-editor-audit-mixed"
      )
      .all<{ action: string; outcome: string; correlation_id: string }>();
    assert.deepEqual(
      actions.results?.map((row) => [
        row.action,
        row.outcome,
        row.correlation_id,
      ]),
      [
        [
          "ROLE_DEFINITION_GRANT",
          "SUCCESS",
          "permission-editor-correlation-add",
        ],
        [
          "ROLE_DEFINITION_REVOKE",
          "SUCCESS",
          "permission-editor-correlation-remove",
        ],
        [
          "ROLE_DEFINITION_POLICY_UPDATE",
          "SUCCESS",
          "permission-editor-correlation-mixed",
        ],
      ]
    );
  });
  test("replays the stored original detail instead of projecting current state", async () => {
    const firstRevision = await revision();
    const first = await updateRoleDefinitionGrants(testDb(), {
      actor_user_id: ADMIN,
      role_definition_id: PROGRAM_LEADER_ROLE,
      base_revision: firstRevision,
      idempotency_key: "permission-editor-stored-original",
      changes: [{ capability: "account.directory.read", value: true }],
      now: NOW,
      audit_id: "permission-editor-audit-stored-original",
      correlation_id: "permission-editor-correlation-stored-original",
    });
    assert.equal(first.revision, firstRevision + 1);
    assert.equal(
      first.responseRequestId,
      "permission-editor-correlation-stored-original"
    );
    assert.equal(
      first.permissions.find(
        (permission) => permission.capability === "account.directory.read"
      )?.value,
      true
    );

    const second = await updateRoleDefinitionGrants(testDb(), {
      actor_user_id: ADMIN,
      role_definition_id: PROGRAM_LEADER_ROLE,
      base_revision: first.revision,
      idempotency_key: "permission-editor-stored-current",
      changes: [{ capability: "account.directory.read", value: false }],
      now: NOW,
      audit_id: "permission-editor-audit-stored-current",
      correlation_id: "permission-editor-correlation-stored-current",
    });
    assert.equal(
      second.permissions.find(
        (permission) => permission.capability === "account.directory.read"
      )?.value,
      false
    );

    const replay = await updateRoleDefinitionGrants(testDb(), {
      actor_user_id: ADMIN,
      role_definition_id: PROGRAM_LEADER_ROLE,
      base_revision: firstRevision,
      idempotency_key: "permission-editor-stored-original",
      changes: [{ capability: "account.directory.read", value: true }],
      now: NOW,
      audit_id: "permission-editor-audit-stored-replay",
      correlation_id: "permission-editor-correlation-stored-replay",
    });
    assert.equal(replay.idempotent, true);
    assert.equal(replay.revision, first.revision);
    assert.equal(
      replay.permissions.find(
        (permission) => permission.capability === "account.directory.read"
      )?.value,
      true
    );
  });

  test("replays successful patches after later revisions and keeps no-ops inert", async () => {
    const before = await revision();
    const replay = await updateRoleDefinitionGrants(testDb(), {
      actor_user_id: ADMIN,
      role_definition_id: PROGRAM_LEADER_ROLE,
      base_revision: 1,
      idempotency_key: "permission-editor-add",
      changes: [{ capability: "home.publish", value: true }],
      now: NOW,
      audit_id: "permission-editor-audit-replay",
      correlation_id: "permission-editor-correlation-replay",
    });
    assert.equal(replay.idempotent, true);
    assert.equal(await revision(), before);

    const noOpBefore = await revision();
    const noOp = await updateRoleDefinitionGrants(testDb(), {
      actor_user_id: ADMIN,
      role_definition_id: PROGRAM_LEADER_ROLE,
      base_revision: noOpBefore,
      idempotency_key: "permission-editor-no-op",
      changes: [{ capability: "home.publish", value: true }],
      now: NOW,
      audit_id: "permission-editor-audit-no-op",
      correlation_id: "permission-editor-correlation-no-op",
    });
    assert.equal(noOp.idempotent, false);
    assert.equal(noOp.responseRequestId, "permission-editor-correlation-no-op");
    assert.equal(await revision(), noOpBefore);
    const noOpAudit = await testDb()
      .prepare("SELECT audit_id FROM role_audit_events WHERE audit_id = ?")
      .bind("permission-editor-audit-no-op")
      .first();
    assert.equal(noOpAudit, null);
    const noOpLedger = await testDb()
      .prepare(
        `SELECT outcome, resulting_revision, result_json
           FROM role_policy_mutations
          WHERE idempotency_key = ?`
      )
      .bind("permission-editor-no-op")
      .first<{
        outcome: string;
        resulting_revision: number;
        result_json: string | null;
      }>();
    assert.equal(noOpLedger?.outcome, "SUCCESS");
    assert.equal(noOpLedger?.resulting_revision, noOpBefore);
    assert.ok(noOpLedger?.result_json);
    const noOpReplay = await updateRoleDefinitionGrants(testDb(), {
      actor_user_id: ADMIN,
      role_definition_id: PROGRAM_LEADER_ROLE,
      base_revision: noOpBefore,
      idempotency_key: "permission-editor-no-op",
      changes: [{ capability: "home.publish", value: true }],
      now: NOW,
      audit_id: "permission-editor-audit-no-op-replay",
      correlation_id: "permission-editor-correlation-no-op-replay",
    });
    assert.equal(noOpReplay.idempotent, true);
    assert.equal(noOpReplay.revision, noOpBefore);
    assert.equal(
      noOpReplay.responseRequestId,
      "permission-editor-correlation-no-op"
    );
    await assert.rejects(
      updateRoleDefinitionGrants(testDb(), {
        actor_user_id: ADMIN,
        role_definition_id: PROGRAM_LEADER_ROLE,
        base_revision: noOpBefore,
        idempotency_key: "permission-editor-no-op",
        changes: [{ capability: "home.publish", value: false }],
        now: NOW,
        audit_id: "permission-editor-audit-no-op-reuse",
        correlation_id: "permission-editor-correlation-no-op-reuse",
      }),
      (error: unknown) => error instanceof RoleIdempotencyConflictError
    );

    await assert.rejects(
      updateRoleDefinitionGrants(testDb(), {
        actor_user_id: ADMIN,
        role_definition_id: PROGRAM_LEADER_ROLE,
        base_revision: noOpBefore,
        idempotency_key: "permission-editor-add",
        changes: [{ capability: "program.enroll", value: true }],
        now: NOW,
        audit_id: "permission-editor-audit-reuse",
        correlation_id: "permission-editor-correlation-reuse",
      }),
      (error: unknown) => error instanceof RoleIdempotencyConflictError
    );
    const reuseAudits = await testDb()
      .prepare(
        `SELECT audit_id, action, outcome, reason, correlation_id
           FROM role_audit_events
          WHERE audit_id IN (?, ?)
          ORDER BY audit_id`
      )
      .bind(
        "permission-editor-audit-no-op-reuse",
        "permission-editor-audit-reuse"
      )
      .all<{
        audit_id: string;
        action: string;
        outcome: string;
        reason: string;
        correlation_id: string;
      }>();
    assert.deepEqual(
      reuseAudits.results?.map((row) => [
        row.audit_id,
        row.action,
        row.outcome,
        row.reason,
        row.correlation_id,
      ]),
      [
        [
          "permission-editor-audit-no-op-reuse",
          "ROLE_DEFINITION_POLICY_UPDATE",
          "REJECTED",
          "ROLE_IDEMPOTENCY_REUSE",
          "permission-editor-correlation-no-op-reuse",
        ],
        [
          "permission-editor-audit-reuse",
          "ROLE_DEFINITION_POLICY_UPDATE",
          "REJECTED",
          "ROLE_IDEMPOTENCY_REUSE",
          "permission-editor-correlation-reuse",
        ],
      ]
    );
    assert.equal(await revision(), noOpBefore);
  });

  test("rejects closed capabilities and protected targets with auditable outcomes", async () => {
    const before = await revision();
    await assert.rejects(
      updateRoleDefinitionGrants(testDb(), {
        actor_user_id: ADMIN,
        role_definition_id: PROGRAM_LEADER_ROLE,
        base_revision: before,
        idempotency_key: "permission-editor-closed",
        changes: [{ capability: "unknown.capability" as never, value: true }],
        now: NOW,
        audit_id: "permission-editor-audit-closed",
        correlation_id: "permission-editor-correlation-closed",
      }),
      (error: unknown) => error instanceof RoleCapabilityCatalogError
    );
    await assert.rejects(
      updateRoleDefinitionGrants(testDb(), {
        actor_user_id: ADMIN,
        role_definition_id: "018f3b8a-0000-7000-8000-000000000a01",
        base_revision: before,
        idempotency_key: "permission-editor-admin-protected",
        changes: [{ capability: "role.read", value: false }],
        now: NOW,
        audit_id: "permission-editor-audit-admin-protected",
        correlation_id: "permission-editor-correlation-admin-protected",
      }),
      (error: unknown) =>
        error instanceof Error && error.name === "RoleAdminProtectedError"
    );
    await assert.rejects(
      updateRoleDefinitionGrants(testDb(), {
        actor_user_id: ADMIN,
        role_definition_id: MEMBER_ROLE,
        base_revision: before,
        idempotency_key: "permission-editor-baseline-protected",
        changes: [{ capability: "program.enroll", value: false }],
        now: NOW,
        audit_id: "permission-editor-audit-baseline-protected",
        correlation_id: "permission-editor-correlation-baseline-protected",
      }),
      (error: unknown) =>
        error instanceof Error && error.name === "RoleBaselineProtectedError"
    );
    assert.equal(await revision(), before);
  });

  test("rejects a stale grant draft and does not mutate the target", async () => {
    const current = await revision();
    await assert.rejects(
      updateRoleDefinitionGrants(testDb(), {
        actor_user_id: ADMIN,
        role_definition_id: STAFF_ROLE,
        base_revision: current - 1,
        idempotency_key: "permission-editor-stale",
        changes: [{ capability: "role.read", value: false }],
        now: NOW,
        audit_id: "permission-editor-audit-stale",
        correlation_id: "permission-editor-correlation-stale",
      }),
      (error: unknown) =>
        error instanceof Error && error.name === "RoleRevisionConflictError"
    );
    assert.equal(await revision(), current);
    await assert.rejects(
      updateRoleDefinitionGrants(testDb(), {
        actor_user_id: ADMIN,
        role_definition_id: STAFF_ROLE,
        base_revision: current - 1,
        idempotency_key: "permission-editor-stale",
        changes: [{ capability: "role.read", value: false }],
        now: NOW,
        audit_id: "permission-editor-audit-stale-replay",
        correlation_id: "permission-editor-correlation-stale-replay",
      }),
      (error: unknown) => error instanceof RoleRevisionConflictError
    );
    const staleLedger = await testDb()
      .prepare(
        `SELECT outcome, resulting_revision FROM role_policy_mutations
          WHERE idempotency_key = ?`
      )
      .bind("permission-editor-stale")
      .first<{ outcome: string; resulting_revision: number }>();
    assert.deepEqual(staleLedger, {
      outcome: "CONFLICT",
      resulting_revision: current,
    });
    const staleAudits = await testDb()
      .prepare(
        `SELECT COUNT(*) AS count FROM role_audit_events
          WHERE action = 'ROLE_DEFINITION_POLICY_UPDATE'
            AND entity_id = ? AND outcome = 'CONFLICT'`
      )
      .bind(STAFF_ROLE)
      .first<{ count: number }>();
    assert.equal(staleAudits?.count, 1);
  });
  test("projects detail actions from the normalized actor and target projection", async () => {
    const detail = await loadRoleDefinitionDetail(
      testDb(),
      ADMIN,
      PROGRAM_LEADER_ROLE
    );
    expect(
      detail.roleDefinition.actions.some(
        (action) => action.action === "permissions"
      )
    ).toBe(true);
    expect(
      detail.roleDefinition.reorderActions.some(
        (action) => action.action === "reorder"
      )
    ).toBe(true);
    await assert.rejects(
      loadRoleDefinitionDetail(testDb(), MEMBER, PROGRAM_LEADER_ROLE),
      (error: unknown) => error instanceof RoleCapabilityDeniedError
    );
  });

  test("returns target-specific protected errors before generic write denial", async () => {
    await ensureReadOnlyActor();
    const before = await revision();
    const targets = [
      [ADMIN_ROLE, "RoleAdminProtectedError"],
      [MEMBER_ROLE, "RoleBaselineProtectedError"],
      [ARCHIVED_ROLE, "RoleArchivedError"],
      [READ_ONLY_ROLE, "RoleHighestProtectedError"],
    ] as const;
    for (const [roleDefinitionId, expectedName] of targets) {
      await assert.rejects(
        updateRoleDefinitionGrants(testDb(), {
          actor_user_id: READ_ONLY_ACTOR,
          role_definition_id: roleDefinitionId,
          base_revision: before,
          idempotency_key: `permission-editor-precedence-${expectedName}`,
          changes: [{ capability: "role.read", value: false }],
          now: NOW,
          audit_id: `permission-editor-audit-precedence-${expectedName}`,
          correlation_id: `permission-editor-correlation-precedence-${expectedName}`,
        }),
        (error: unknown) =>
          error instanceof Error && error.name === expectedName
      );
    }
    expect(await revision()).toBe(before);
  });

  test("reserves terminal denials and replays them before authority changes", async () => {
    await ensureReadOnlyActor();
    const before = await revision();
    const invalidInput = {
      actor_user_id: ADMIN,
      role_definition_id: PROGRAM_LEADER_ROLE,
      base_revision: before,
      idempotency_key: "permission-editor-denied-invalid-replay",
      changes: [{ capability: "unknown.capability" as never, value: true }],
      now: NOW,
      audit_id: "permission-editor-audit-denied-invalid",
      correlation_id: "permission-editor-correlation-denied-invalid",
    };
    await assert.rejects(
      updateRoleDefinitionGrants(testDb(), invalidInput),
      (error: unknown) => error instanceof RoleCapabilityCatalogError
    );
    await assert.rejects(
      updateRoleDefinitionGrants(testDb(), {
        ...invalidInput,
        audit_id: "permission-editor-audit-denied-invalid-replay",
        correlation_id: "permission-editor-correlation-denied-invalid-replay",
      }),
      (error: unknown) => error instanceof RoleCapabilityCatalogError
    );
    await assert.rejects(
      updateRoleDefinitionGrants(testDb(), {
        ...invalidInput,
        changes: [{ capability: "different.capability" as never, value: true }],
        audit_id: "permission-editor-audit-denied-invalid-reuse",
        correlation_id: "permission-editor-correlation-denied-invalid-reuse",
      }),
      (error: unknown) => error instanceof RoleIdempotencyConflictError
    );
    const invalidLedger = await testDb()
      .prepare(
        `SELECT outcome, result_json FROM role_policy_mutations
          WHERE idempotency_key = ?`
      )
      .bind(invalidInput.idempotency_key)
      .first<{ outcome: string; result_json: string | null }>();
    expect(invalidLedger?.outcome).toBe("DENIED");
    expect(JSON.parse(invalidLedger?.result_json ?? "{}")).toMatchObject({
      errorCode: "ROLE_NOT_FOUND",
      requestId: invalidInput.correlation_id,
    });
    const invalidAudits = await testDb()
      .prepare(
        `SELECT COUNT(*) AS count FROM role_audit_events
          WHERE audit_id LIKE 'permission-editor-audit-denied-invalid%'`
      )
      .first<{ count: number }>();
    expect(invalidAudits?.count).toBe(1);

    const unauthorizedInput = {
      actor_user_id: READ_ONLY_ACTOR,
      role_definition_id: PROGRAM_LEADER_ROLE,
      base_revision: before,
      idempotency_key: "permission-editor-denied-authority-replay",
      changes: [{ capability: "role.read" as const, value: false }],
      now: NOW,
      audit_id: "permission-editor-audit-denied-authority",
      correlation_id: "permission-editor-correlation-denied-authority",
    };
    await assert.rejects(
      updateRoleDefinitionGrants(testDb(), unauthorizedInput),
      (error: unknown) => error instanceof RoleCapabilityDeniedError
    );
    await testDb()
      .prepare(
        `INSERT OR IGNORE INTO role_definition_grants
           (role_definition_id, capability, granted_by, granted_at)
         VALUES (?, 'role.permissions.write', ?, ?)`
      )
      .bind(READ_ONLY_ROLE, ADMIN, NOW)
      .run();
    let replayError: unknown;
    try {
      await updateRoleDefinitionGrants(testDb(), {
        ...unauthorizedInput,
        audit_id: "permission-editor-audit-denied-authority-replay",
        correlation_id: "permission-editor-correlation-denied-authority-replay",
      });
    } catch (error) {
      replayError = error;
    }
    expect(replayError).toBeInstanceOf(RoleCapabilityDeniedError);
    expect(
      replayError &&
        typeof replayError === "object" &&
        "requestId" in replayError &&
        typeof replayError.requestId === "string"
        ? replayError.requestId
        : undefined
    ).toBe(unauthorizedInput.correlation_id);
    const unauthorizedAudits = await testDb()
      .prepare(
        `SELECT COUNT(*) AS count FROM role_audit_events
          WHERE audit_id LIKE 'permission-editor-audit-denied-authority%'`
      )
      .first<{ count: number }>();
    expect(unauthorizedAudits?.count).toBe(1);
    expect(await revision()).toBe(before);
  });
});
