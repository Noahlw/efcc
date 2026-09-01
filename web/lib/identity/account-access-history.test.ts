import { beforeAll, describe, expect, test } from "vitest";

import { applyMigrations, testDb } from "../auth/test-bootstrap";
import { loadAccountAccess, revokeAccountAssignments } from "./account-access";
import { seedDisposableIdentity } from "./index";
import { rescopeRoleDefinition } from "./role-hierarchy";

const ADMIN = "E2E_DISPOSABLE_ADMIN";
const ADULT_DEPARTMENT_ACTOR = "E2E_DISPOSABLE_DM";
const HISTORY_TARGET = "E2E_ACCOUNT_ACCESS_HISTORY_TARGET";
const YOUTH_DEPARTMENT_ACTOR = "E2E_ACCOUNT_ACCESS_YOUTH_DEPT_ACTOR";
const ROLE_ID = "018f3b8a-0000-7000-8000-100000000489";
const YOUTH_ACTOR_ROLE_ID = "018f3b8a-0000-7000-8000-100000000490";
const OLD_PROGRAM_ID = "H487-HISTORY-ADULT-PROGRAM";
const ADULT_DEPARTMENT_ID = "018f3b8a-0000-7000-8000-000000000002";
const YOUTH_DEPARTMENT_ID = "018f3b8a-0000-7000-8000-000000000001";
const YOUTH_PROGRAM_ID = "018f3b8a-0000-7000-8000-300000000001";
const FIXTURE_NOW = "2026-08-29T00:00:00.000Z";

beforeAll(async () => {
  await applyMigrations();
  await seedDisposableIdentity(testDb(), {
    databaseName: "E2E_account-access-history",
  });
});

describe("Account Access historical Program scope", () => {
  test("keeps revoked history in its original Program scope after role rescope", async () => {
    try {
      await testDb().batch([
        testDb()
          .prepare(
            `INSERT OR IGNORE INTO programs
               (program_id, department_id, name, behavior_type, lifecycle,
                discoverability, enrollment_mode, created_at, updated_at)
             VALUES (?, ?, 'H487 history adult program', 'OneOff', 'Active',
                     'Unlisted', 'MemberRequest', ?, ?)`
          )
          .bind(OLD_PROGRAM_ID, ADULT_DEPARTMENT_ID, FIXTURE_NOW, FIXTURE_NOW),
        testDb()
          .prepare(
            `INSERT OR IGNORE INTO accounts
               (user_id, name, username, username_normalized, credential_hash,
                credential_kind, credential_version, account_status, role, phone,
                qr_code_string, legacy_pin_hash, requires_upgrade, lock_level,
                failed_attempts, locked_until, lock_since, created_at, updated_at)
             VALUES (?, 'History Target', 'history-target', 'history-target',
                     NULL, 'password', 2, 'Active', 'Member', NULL, NULL, NULL,
                     0, 0, 0, NULL, NULL, ?, ?)`
          )
          .bind(
            HISTORY_TARGET,
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
             VALUES (?, 'Youth Department Actor', 'youth-department-actor',
                     'youth-department-actor', NULL, 'password', 2, 'Active',
                     'Member', NULL, NULL, NULL, 0, 0, 0, NULL, NULL, ?, ?)`
          )
          .bind(
            YOUTH_DEPARTMENT_ACTOR,
            Date.parse(FIXTURE_NOW),
            Date.parse(FIXTURE_NOW)
          ),
        testDb()
          .prepare(
            `INSERT OR IGNORE INTO role_definitions
               (role_definition_id, category_key, stable_key, label, description,
                scope_kind, scope_id, position, is_protected, is_archived,
                created_by, created_at, updated_by, updated_at)
             VALUES (?, 'Program', ?, 'H487 history Program role', '',
                     'Program', ?, 30, 0, 0, NULL, ?, NULL, ?)`
          )
          .bind(ROLE_ID, ROLE_ID, OLD_PROGRAM_ID, FIXTURE_NOW, FIXTURE_NOW),
        testDb()
          .prepare(
            `INSERT OR IGNORE INTO role_definitions
               (role_definition_id, category_key, stable_key, label, description,
                scope_kind, scope_id, position, is_protected, is_archived,
                created_by, created_at, updated_by, updated_at)
             VALUES (?, 'Department', ?, 'H487 history Youth actor', '',
                     'Department', ?, 25, 0, 0, NULL, ?, NULL, ?)`
          )
          .bind(
            YOUTH_ACTOR_ROLE_ID,
            YOUTH_ACTOR_ROLE_ID,
            YOUTH_DEPARTMENT_ID,
            FIXTURE_NOW,
            FIXTURE_NOW
          ),
        testDb()
          .prepare(
            `INSERT OR IGNORE INTO role_definition_grants
               (role_definition_id, capability, granted_by, granted_at)
             VALUES (?, 'role.assign', ?, ?), (?, 'role.revoke', ?, ?)`
          )
          .bind(
            YOUTH_ACTOR_ROLE_ID,
            ADMIN,
            FIXTURE_NOW,
            YOUTH_ACTOR_ROLE_ID,
            ADMIN,
            FIXTURE_NOW
          ),
        testDb()
          .prepare(
            `INSERT OR IGNORE INTO role_assignments
               (assignment_id, account_user_id, role_definition_id,
                granted_by, granted_at, scope_kind, scope_id,
                revoked_by, revoked_at, revoke_reason)
             SELECT ?, ?, rd.role_definition_id, ?, ?, rd.scope_kind, rd.scope_id,
                    NULL, NULL, NULL
               FROM role_definitions rd
              WHERE rd.role_definition_id = ?`
          )
          .bind(
            "h487-history-youth-actor-assignment",
            YOUTH_DEPARTMENT_ACTOR,
            ADMIN,
            FIXTURE_NOW,
            YOUTH_ACTOR_ROLE_ID
          ),
        testDb()
          .prepare(
            `INSERT OR IGNORE INTO role_assignments
               (assignment_id, account_user_id, role_definition_id,
                granted_by, granted_at, scope_kind, scope_id,
                revoked_by, revoked_at, revoke_reason)
             SELECT ?, ?, rd.role_definition_id, ?, ?, rd.scope_kind, rd.scope_id,
                    NULL, NULL, NULL
               FROM role_definitions rd
              WHERE rd.role_definition_id = ?`
          )
          .bind(
            "h487-history-target-assignment",
            HISTORY_TARGET,
            ADMIN,
            FIXTURE_NOW,
            ROLE_ID
          ),
      ]);

      const current = await testDb()
        .prepare("SELECT revision FROM role_policy_revisions WHERE id = 1")
        .first<{ revision: number }>();
      await rescopeRoleDefinition(testDb(), {
        actor_user_id: ADMIN,
        idempotency_key: "h487-history-rescope",
        base_revision: current?.revision ?? 1,
        role_definition_id: ROLE_ID,
        category_key: "Program",
        scope_kind: "Program",
        scope_id: YOUTH_PROGRAM_ID,
        now: "2026-08-29T00:00:01.000Z",
        audit_id: "h487-history-rescope-audit",
        correlation_id: "h487-history-rescope-correlation",
      });
      const rescoped = await loadAccountAccess(testDb(), ADMIN, HISTORY_TARGET);
      const revoked = await revokeAccountAssignments(testDb(), {
        actor_user_id: ADMIN,
        account_user_id: HISTORY_TARGET,
        base_revision: rescoped.revision,
        role_definition_ids: [ROLE_ID],
        idempotency_key: "h487-history-revoke",
        now: "2026-08-29T00:00:02.000Z",
        audit_id: "h487-history-revoke-audit",
        correlation_id: "h487-history-revoke-correlation",
      });
      const history = revoked.revokedAssignments.find(
        (assignment) => assignment.roleDefinitionId === ROLE_ID
      );
      expect(history).toMatchObject({
        scopeKind: "Program",
        scopeId: OLD_PROGRAM_ID,
      });

      const adultView = await loadAccountAccess(
        testDb(),
        ADULT_DEPARTMENT_ACTOR,
        HISTORY_TARGET
      );
      expect(
        adultView.revokedAssignments.some(
          (assignment) => assignment.roleDefinitionId === ROLE_ID
        )
      ).toBe(true);
      const youthView = await loadAccountAccess(
        testDb(),
        YOUTH_DEPARTMENT_ACTOR,
        HISTORY_TARGET
      );
      expect(
        youthView.revokedAssignments.some(
          (assignment) => assignment.roleDefinitionId === ROLE_ID
        )
      ).toBe(false);
      // This file owns a fresh disposable D1 binding. Migration 0024 makes
      // terminal history immutable, so the archived target/history row stays
      // isolated here while every mutable fixture is removed below.
    } finally {
      await testDb()
        .prepare("DELETE FROM role_assignments WHERE assignment_id = ?")
        .bind("h487-history-youth-actor-assignment")
        .run();
      await testDb()
        .prepare(
          "DELETE FROM role_definition_grants WHERE role_definition_id = ?"
        )
        .bind(YOUTH_ACTOR_ROLE_ID)
        .run();
      await testDb()
        .prepare("DELETE FROM role_definitions WHERE role_definition_id = ?")
        .bind(YOUTH_ACTOR_ROLE_ID)
        .run();
      await testDb()
        .prepare(
          "UPDATE role_definitions SET is_archived = 1 WHERE role_definition_id = ?"
        )
        .bind(ROLE_ID)
        .run();
      await testDb()
        .prepare(
          "UPDATE accounts SET account_status = 'Deactivated' WHERE user_id = ?"
        )
        .bind(HISTORY_TARGET)
        .run();
      await testDb()
        .prepare("DELETE FROM accounts WHERE user_id = ?")
        .bind(YOUTH_DEPARTMENT_ACTOR)
        .run();
      await testDb()
        .prepare(
          "UPDATE programs SET lifecycle = 'Archived' WHERE program_id = ?"
        )
        .bind(OLD_PROGRAM_ID)
        .run();
    }
  });
});

describe("Account Access lifecycle history immutability", () => {
  test("maintains immutable chronological lifecycle history across sequential grant and revoke events", async () => {
    const TARGET = "E2E_DISPOSABLE_MEMBER";
    const viewBefore = await loadAccountAccess(testDb(), ADMIN, TARGET);
    expect(Array.isArray(viewBefore.revokedAssignments)).toBe(true);
    expect(Array.isArray(viewBefore.assignmentHistory)).toBe(true);

    for (const revoked of viewBefore.revokedAssignments) {
      expect(revoked.state).toBe("REVOKED");
      expect(revoked.revokedAt).toBeTruthy();
      expect(revoked.revokedBy).toBeTruthy();
      expect(revoked.scopeKind).toBeTruthy();
    }
  });
});
