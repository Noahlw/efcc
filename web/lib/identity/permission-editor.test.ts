// @vitest-environment workers
/**
 * #485 — Permission Editor domain seam.
 *
 * These tests intentionally exercise the normalized role-definition detail and
 * grant mutation interfaces, not implementation helpers. The Worker/component
 * adapters consume the same projection and mutation result.
 */
import assert from "node:assert/strict";

import { beforeAll, describe, test } from "vitest";

import { applyMigrations, testDb } from "../auth/test-bootstrap";
import {
  loadRoleDefinitionDetail,
  updateRoleDefinitionGrants,
} from "./permission-editor";
import {
  RoleCapabilityCatalogError,
  RoleIdempotencyConflictError,
  RoleRevisionConflictError,
} from "./mutations";
import {
  preflightDisposableSchema,
  seedDisposableIdentity,
} from "./index";
import { CAPABILITY_CATALOG } from "./capability-catalog";
import { resolveActorCapabilities } from "./role-hierarchy";

const DISPOSABLE_DATABASE = "E2E_disposable-local";
const ADMIN = "E2E_DISPOSABLE_ADMIN";
const MEMBER = "E2E_DISPOSABLE_MEMBER";
const STAFF_ROLE = "018f3b8a-0000-7000-8000-000000000a02";
const MEMBER_ROLE = "018f3b8a-0000-7000-8000-000000000a03";
const PROGRAM_LEADER_ROLE = "018f3b8a-0000-7000-8000-100000000002";
const NOW = "2026-08-29T00:00:00.000Z";

async function revision(): Promise<number> {
  const row = await testDb()
    .prepare("SELECT revision FROM role_policy_revisions WHERE id = 1")
    .first<{ revision: number }>();
  return row?.revision ?? 0;
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
      admin.permissions.find((permission) => permission.capability === "role.read")
        ?.label,
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
    assert.ok(protectedAdmin.permissions.every((permission) => permission.value));
    assert.ok(protectedAdmin.permissions.every((permission) => permission.locked));

    const baseline = await loadRoleDefinitionDetail(testDb(), ADMIN, MEMBER_ROLE);
    const enroll = baseline.permissions.find(
      (permission) => permission.capability === "program.enroll"
    );
    assert.equal(enroll?.value, true);
    assert.equal(enroll?.locked, true);
    const memberCapabilities = await resolveActorCapabilities(testDb(), MEMBER);
    assert.equal(memberCapabilities["program.enroll"], true);
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
      added.permissions.find((permission) => permission.capability === "home.publish")
        ?.value,
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
      actions.results?.map((row) => [row.action, row.outcome, row.correlation_id]),
      [
        ["ROLE_DEFINITION_GRANT", "SUCCESS", "permission-editor-correlation-add"],
        ["ROLE_DEFINITION_REVOKE", "SUCCESS", "permission-editor-correlation-remove"],
        [
          "ROLE_DEFINITION_POLICY_UPDATE",
          "SUCCESS",
          "permission-editor-correlation-mixed",
        ],
      ]
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
    assert.equal(await revision(), noOpBefore);
    const noOpAudit = await testDb()
      .prepare("SELECT audit_id FROM role_audit_events WHERE audit_id = ?")
      .bind("permission-editor-audit-no-op")
      .first();
    assert.equal(noOpAudit, null);

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
  });
});
