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
import {
  createRoleDefinition,
  loadBootstrapIdentity,
  resolveActorCapabilities,
  rescopeRoleDefinition,
} from "./role-hierarchy";

const ADMIN = "E2E_DISPOSABLE_ADMIN";
const STAFF = "E2E_DISPOSABLE_STAFF";
const MEMBER = "E2E_DISPOSABLE_MEMBER";
const DEPARTMENT_ROLE = "018f3b8a-0000-7000-8000-100000000001";
const PROGRAM_ROLE = "018f3b8a-0000-7000-8000-100000000002";
const LOWER_DEPARTMENT_ROLE = "018f3b8a-0000-7000-8000-100000000003";
const GRANTABLE_DEPARTMENT_ROLE = "018f3b8a-0000-7000-8000-100000000005";
const DELETE_ONLY_ROLE = "018f3b8a-0000-7000-8000-100000000004";
const BASELINE_ROLE = "018f3b8a-0000-7000-8000-000000000a03";
const SCOPED_ACTOR = "E2E_ACCOUNT_ACCESS_SCOPED_ACTOR";
const PROGRAM_ACTOR = "E2E_DISPOSABLE_PL";
const ADULT_DEPARTMENT = "018f3b8a-0000-7000-8000-000000000002";
const YOUTH_PROGRAM = "018f3b8a-0000-7000-8000-300000000001";
const DELETE_ONLY_ACTOR = "E2E_ACCOUNT_ACCESS_DELETE_ONLY_ACTOR";
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
        `INSERT OR IGNORE INTO accounts
           (user_id, name, username, username_normalized, credential_hash,
            credential_kind, credential_version, account_status, role, phone,
            qr_code_string, legacy_pin_hash, requires_upgrade, lock_level,
            failed_attempts, locked_until, lock_since, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, 'password', 2, 'Active', 'Member',
                 NULL, NULL, NULL, 0, 0, 0, NULL, NULL, ?, ?)`
      )
      .bind(
        DELETE_ONLY_ACTOR,
        "Delete Only Actor",
        "account-access-delete-only-actor",
        "account-access-delete-only-actor",
        Date.parse(FIXTURE_NOW),
        Date.parse(FIXTURE_NOW)
      ),
    testDb()
      .prepare(
        `INSERT OR IGNORE INTO role_definitions
           (role_definition_id, category_key, stable_key, label, description,
            scope_kind, scope_id, position, is_protected, is_archived,
            created_by, created_at, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, NULL, ?)`
      )
      .bind(
        LOWER_DEPARTMENT_ROLE,
        "Department",
        "account-access-lower-department",
        "部門下級測試身份組",
        "",
        "Department",
        "018f3b8a-0000-7000-8000-000000000002",
        30,
        FIXTURE_NOW,
        FIXTURE_NOW
      ),
    testDb()
      .prepare(
        `INSERT OR IGNORE INTO role_definition_grants
           (role_definition_id, capability, granted_by, granted_at)
         VALUES (?, ?, ?, ?)`
      )
      .bind(LOWER_DEPARTMENT_ROLE, "department.publish", ADMIN, FIXTURE_NOW),
    testDb()
      .prepare(
        `INSERT OR IGNORE INTO role_definitions
           (role_definition_id, category_key, stable_key, label, description,
            scope_kind, scope_id, position, is_protected, is_archived,
            created_by, created_at, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 0, 0, NULL, ?, NULL, ?)`
      )
      .bind(
        DELETE_ONLY_ROLE,
        "Global",
        "account-access-delete-only",
        "只可停用測試身份組",
        "",
        "Global",
        5,
        FIXTURE_NOW,
        FIXTURE_NOW
      ),
    testDb()
      .prepare(
        `INSERT OR IGNORE INTO role_definition_grants
           (role_definition_id, capability, granted_by, granted_at)
         VALUES (?, ?, ?, ?)`
      )
      .bind(DELETE_ONLY_ROLE, "role.delete", ADMIN, FIXTURE_NOW),
    testDb()
      .prepare(
        `INSERT OR IGNORE INTO role_definitions
           (role_definition_id, category_key, stable_key, label, description,
            scope_kind, scope_id, position, is_protected, is_archived,
            created_by, created_at, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, NULL, ?)`
      )
      .bind(
        GRANTABLE_DEPARTMENT_ROLE,
        "Department",
        "account-access-grantable-department",
        "部門授權測試身份組",
        "",
        "Department",
        "018f3b8a-0000-7000-8000-000000000002",
        40,
        FIXTURE_NOW,
        FIXTURE_NOW
      ),
    testDb()
      .prepare(
        `INSERT OR IGNORE INTO role_definition_grants
           (role_definition_id, capability, granted_by, granted_at)
         VALUES (?, ?, ?, ?)`
      )
      .bind(GRANTABLE_DEPARTMENT_ROLE, "department.manage", ADMIN, FIXTURE_NOW),
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
        "account-access-delete-only-role",
        DELETE_ONLY_ACTOR,
        DELETE_ONLY_ROLE,
        ADMIN,
        Date.parse(FIXTURE_NOW),
        DELETE_ONLY_ROLE
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
        "account-access-delete-only-baseline",
        DELETE_ONLY_ACTOR,
        BASELINE_ROLE,
        ADMIN,
        Date.parse(FIXTURE_NOW),
        BASELINE_ROLE
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
        "account-access-mixed-lower-department",
        MIXED_SCOPE_TARGET,
        LOWER_DEPARTMENT_ROLE,
        ADMIN,
        Date.parse(FIXTURE_NOW),
        LOWER_DEPARTMENT_ROLE
      ),
  ]);
}

interface RevisionRaceDatabase {
  firstDb: D1Database;
  secondDb: D1Database;
  firstRevisionRead: Promise<void>;
}

interface RevisionRaceControl {
  firstRevisionRead: Promise<void>;
  releaseFirstRevisionRead: () => void;
  firstBatchComplete: Promise<void>;
  releaseFirstBatch: () => void;
}

function revisionRaceDatabase(db: D1Database): RevisionRaceDatabase {
  let firstBatchReleased = false;
  let releaseFirstRevisionRead!: () => void;
  let releaseFirstBatch!: () => void;
  const control: RevisionRaceControl = {
    firstRevisionRead: new Promise<void>((resolve) => {
      releaseFirstRevisionRead = resolve;
    }),
    releaseFirstRevisionRead: () => releaseFirstRevisionRead(),
    firstBatchComplete: new Promise<void>((resolve) => {
      releaseFirstBatch = resolve;
    }),
    releaseFirstBatch: () => releaseFirstBatch(),
  };
  const wrap = (owner: "first" | "second"): D1Database => {
    const originalPrepare = db.prepare.bind(db);
    const originalBatch = db.batch.bind(db);
    const prepare = (sql: string): D1PreparedStatement => {
      const statement = originalPrepare(sql);
      if (!sql.includes("SELECT revision FROM role_policy_revisions")) {
        return statement;
      }
      return new Proxy(statement, {
        get(target, property, receiver) {
          if (property !== "first") {
            return Reflect.get(target, property, receiver);
          }
          const first = target.first.bind(target);
          return async () => {
            if (owner === "first") {
              control.releaseFirstRevisionRead();
            } else {
              await control.firstBatchComplete;
            }
            return first();
          };
        },
      }) as D1PreparedStatement;
    };
    const batch = async (
      statements: D1PreparedStatement[]
    ): Promise<D1Result<unknown>[]> => {
      const result = await originalBatch(statements);
      if (owner === "first" && !firstBatchReleased) {
        firstBatchReleased = true;
        control.releaseFirstBatch();
      }
      return result;
    };
    return new Proxy(db, {
      get(target, property, receiver) {
        if (property === "prepare") {
          return prepare;
        }
        if (property === "batch") {
          return batch;
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  };
  return {
    firstDb: wrap("first"),
    secondDb: wrap("second"),
    firstRevisionRead: control.firstRevisionRead,
  };
}
interface DeniedReservationInput {
  idempotencyKey: string;
  requestFingerprint: string;
  actorUserId: string;
  baseRevision: number;
  errorCode: string;
  action: string;
  entityType: string;
  entityId: string;
  now: string;
}

function deniedReservationDatabase(
  db: D1Database,
  input: DeniedReservationInput
): D1Database {
  let injected = false;
  const originalPrepare = db.prepare.bind(db);
  const originalBatch = db.batch.bind(db);
  const injectDeniedReservation = async (): Promise<void> => {
    if (injected) {
      return;
    }
    injected = true;
    await originalBatch([
      originalPrepare(
        `INSERT INTO role_policy_mutations
          (idempotency_key, request_fingerprint, actor_user_id, base_revision,
           outcome, resulting_revision, result_json, applied, audit_written,
           created_at, completed_at)
         VALUES (?, ?, ?, ?, 'DENIED', ?, ?, 0, 1, ?, ?)`
      ).bind(
        input.idempotencyKey,
        input.requestFingerprint,
        input.actorUserId,
        input.baseRevision,
        input.baseRevision + 1,
        JSON.stringify({
          errorCode: input.errorCode,
          requestId: "denied-reservation-race",
        }),
        input.now,
        input.now
      ),
      originalPrepare(
        "UPDATE role_policy_revisions SET revision = revision + 1 WHERE id = 1"
      ),
      originalPrepare(
        `INSERT INTO role_audit_events
          (audit_id, inserted_at, actor_user_id, action, entity_type, entity_id,
           old_value_json, new_value_json, reason, outcome, correlation_id)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, 'DENIED', ?)`
      ).bind(
        `denied-reservation-race-${input.idempotencyKey}`,
        input.now,
        input.actorUserId,
        input.action,
        input.entityType,
        input.entityId,
        input.errorCode,
        "denied-reservation-race"
      ),
    ]);
  };
  const wrapMutationStatement = (
    statement: D1PreparedStatement
  ): D1PreparedStatement =>
    new Proxy(statement, {
      get(target, property, receiver) {
        if (property === "bind") {
          const bind = target.bind.bind(target) as (
            ...args: unknown[]
          ) => D1PreparedStatement;
          return (...args: unknown[]) => wrapMutationStatement(bind(...args));
        }
        if (property === "first") {
          const first = target.first.bind(target);
          return async () => {
            const result = await first();
            if (result === null) {
              await injectDeniedReservation();
            }
            return result;
          };
        }
        return Reflect.get(target, property, receiver);
      },
    }) as D1PreparedStatement;
  const prepare = (sql: string): D1PreparedStatement => {
    const statement = originalPrepare(sql);
    return sql.includes("FROM role_policy_mutations") &&
      sql.includes("idempotency_key = ?")
      ? wrapMutationStatement(statement)
      : statement;
  };
  return new Proxy(db, {
    get(target, property, receiver) {
      if (property === "prepare") {
        return prepare;
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
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
    expect(view.activeAssignments).toHaveLength(0);
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
      expect.arrayContaining([BASELINE_ROLE, LOWER_DEPARTMENT_ROLE])
    );
    expect(activeRoleIds).not.toContain(DEPARTMENT_ROLE);
    expect(activeRoleIds).not.toContain(PROGRAM_ROLE);
    expect(view.effectiveAccess.Department.length).toBeGreaterThan(0);
    expect(view.effectiveAccess.Program).toHaveLength(0);
    expect(JSON.stringify(view)).not.toContain("青少年查經帶領");
  });
  test("Department actor can manage a same-department Program identity", async () => {
    const programId = "ACCOUNT-ACCESS-ADULT-PROGRAM";
    const roleId = "ACCOUNT-ACCESS-ADULT-PROGRAM-ROLE";
    const now = "2026-08-29T00:02:00.000Z";
    await testDb().batch([
      testDb()
        .prepare(
          `INSERT OR IGNORE INTO programs
            (program_id, department_id, name, behavior_type, lifecycle,
             discoverability, enrollment_mode, created_at, updated_at)
           VALUES (?, '018f3b8a-0000-7000-8000-000000000002',
                   'Account Access 成人課程', 'OneOff', 'Active', 'Unlisted',
                   'MemberRequest', ?, ?)`
        )
        .bind(programId, now, now),
      testDb()
        .prepare(
          `INSERT OR IGNORE INTO role_definitions
            (role_definition_id, category_key, stable_key, label, description,
             scope_kind, scope_id, position, is_protected, is_archived,
             created_by, created_at, updated_by, updated_at)
           VALUES (?, 'Program', ?, '成人課程身份組', 'same-department Program fixture',
                   'Program', ?, 30, 0, 0, NULL, ?, NULL, ?)`
        )
        .bind(roleId, roleId, programId, now, now),
    ]);
    const before = await loadAccountAccess(
      testDb(),
      SCOPED_ACTOR,
      MIXED_SCOPE_TARGET
    );
    const granted = await mutateAccountAssignments(testDb(), {
      actor_user_id: SCOPED_ACTOR,
      account_user_id: MIXED_SCOPE_TARGET,
      base_revision: before.revision,
      role_definition_ids: [roleId],
      idempotency_key: "account-access-red-scoped-program-grant",
      now,
      audit_id: "account-access-red-scoped-program-grant-audit",
      correlation_id: "account-access-red-scoped-program-grant-correlation",
    });
    expect(
      granted.activeAssignments.some(
        (assignment) => assignment.roleDefinitionId === roleId
      )
    ).toBe(true);
    const revoked = await revokeAccountAssignments(testDb(), {
      actor_user_id: SCOPED_ACTOR,
      account_user_id: MIXED_SCOPE_TARGET,
      base_revision: granted.revision,
      role_definition_ids: [roleId],
      idempotency_key: "account-access-red-scoped-program-revoke",
      now: "2026-08-29T00:02:01.000Z",
      audit_id: "account-access-red-scoped-program-revoke-audit",
      correlation_id: "account-access-red-scoped-program-revoke-correlation",
    });
    expect(
      revoked.activeAssignments.some(
        (assignment) => assignment.roleDefinitionId === roleId
      )
    ).toBe(false);
  });

  test("searches identity metadata within exact lower role scope", async () => {
    const result = await searchEligibleAccounts(
      testDb(),
      SCOPED_ACTOR,
      "Mixed Scope",
      0,
      20
    );
    const target = result.accounts.find(
      (account) => account.userId === MIXED_SCOPE_TARGET
    );
    expect(target).toBeDefined();
    expect(
      target?.identities.map((identity) => identity.roleDefinitionId)
    ).toEqual([LOWER_DEPARTMENT_ROLE]);
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
    const audit = await testDb()
      .prepare("SELECT outcome FROM role_audit_events WHERE audit_id = ?")
      .bind("account-access-red-unauthorized-absent-revoke-audit")
      .first<{ outcome: string }>();
    expect(audit?.outcome).toBe("DENIED");
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
    const audit = await testDb()
      .prepare("SELECT outcome FROM role_audit_events WHERE audit_id = ?")
      .bind("account-access-red-unauthorized-duplicate-audit")
      .first<{ outcome: string }>();
    expect(audit?.outcome).toBe("DENIED");
  });

  test("preserves assignment scope snapshots for display, capability, and re-add", async () => {
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
      scope_id: YOUTH_PROGRAM,
      now: "2026-08-29T00:00:55.000Z",
      audit_id: "account-access-red-scope-snapshot-create-audit",
      correlation_id: "account-access-red-scope-snapshot-create-correlation",
    });
    await testDb()
      .prepare(
        `INSERT OR IGNORE INTO role_definition_grants
           (role_definition_id, capability, granted_by, granted_at)
         VALUES (?, 'program.manage', ?, ?)`
      )
      .bind(created.roleDefinitionId, ADMIN, "2026-08-29T00:00:56.000Z")
      .run();

    const added = await mutateAccountAssignments(testDb(), {
      actor_user_id: ADMIN,
      account_user_id: MEMBER,
      base_revision: created.revision,
      role_definition_ids: [created.roleDefinitionId],
      idempotency_key: "account-access-red-scope-snapshot-add",
      now: "2026-08-29T00:01:00.000Z",
      audit_id: "account-access-red-scope-snapshot-add-audit",
      correlation_id: "account-access-red-scope-snapshot-add-correlation",
    });
    const initial = added.activeAssignments.find(
      (assignment) => assignment.roleDefinitionId === created.roleDefinitionId
    );
    expect(initial).toMatchObject({
      scopeKind: "Program",
      scopeId: YOUTH_PROGRAM,
    });
    expect(
      added.effectiveAccess.Program.some(
        (grant) =>
          grant.capability === "program.manage" &&
          grant.scopeId === YOUTH_PROGRAM &&
          grant.sources.includes("快照歷史測試身份組")
      )
    ).toBe(true);
    expect((await loadBootstrapIdentity(testDb(), MEMBER)).identities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "快照歷史測試身份組",
          scopeKind: "Program",
        }),
      ])
    );
    const initialProgramCapabilities = await resolveActorCapabilities(
      testDb(),
      MEMBER,
      { programId: YOUTH_PROGRAM }
    );
    expect(initialProgramCapabilities["program.manage"]).toBe(true);
    const initialDepartmentCapabilities = await resolveActorCapabilities(
      testDb(),
      MEMBER,
      { departmentId: ADULT_DEPARTMENT }
    );
    expect(initialDepartmentCapabilities["program.manage"]).not.toBe(true);

    const rescoped = await rescopeRoleDefinition(testDb(), {
      actor_user_id: ADMIN,
      idempotency_key: "account-access-red-scope-snapshot-rescope",
      base_revision: added.revision,
      role_definition_id: created.roleDefinitionId,
      category_key: "Department",
      scope_kind: "Department",
      scope_id: ADULT_DEPARTMENT,
      now: "2026-08-29T00:01:05.000Z",
      audit_id: "account-access-red-scope-snapshot-rescope-audit",
      correlation_id: "account-access-red-scope-snapshot-rescope-correlation",
    });
    expect(rescoped.scopeKind).toBe("Department");
    const rescopeView = await loadAccountAccess(testDb(), ADMIN, MEMBER);
    const active = rescopeView.activeAssignments.find(
      (assignment) => assignment.roleDefinitionId === created.roleDefinitionId
    );
    expect(active).toMatchObject({
      scopeKind: "Program",
      scopeId: YOUTH_PROGRAM,
    });
    expect(
      rescopeView.effectiveAccess.Program.some(
        (grant) =>
          grant.capability === "program.manage" &&
          grant.scopeId === YOUTH_PROGRAM &&
          grant.sources.includes("快照歷史測試身份組")
      )
    ).toBe(true);
    expect(
      rescopeView.effectiveAccess.Department.some(
        (grant) => grant.capability === "program.manage"
      )
    ).toBe(false);
    const scopedRescopeView = await loadAccountAccess(
      testDb(),
      SCOPED_ACTOR,
      MEMBER
    );
    expect(
      scopedRescopeView.activeAssignments.some(
        (assignment) => assignment.roleDefinitionId === created.roleDefinitionId
      )
    ).toBe(false);
    expect(
      scopedRescopeView.assignableRoles.some(
        (role) => role.roleDefinitionId === created.roleDefinitionId
      )
    ).toBe(false);
    const activeProgramCapabilities = await resolveActorCapabilities(
      testDb(),
      MEMBER,
      { programId: YOUTH_PROGRAM }
    );
    expect(activeProgramCapabilities["program.manage"]).toBe(true);
    const activeDepartmentCapabilities = await resolveActorCapabilities(
      testDb(),
      MEMBER,
      { departmentId: ADULT_DEPARTMENT }
    );
    expect(activeDepartmentCapabilities["program.manage"]).not.toBe(true);
    expect((await loadBootstrapIdentity(testDb(), MEMBER)).identities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "快照歷史測試身份組",
          scopeKind: "Program",
        }),
      ])
    );

    const scopedView = await loadAccountAccess(testDb(), PROGRAM_ACTOR, MEMBER);
    expect(
      scopedView.activeAssignments.some(
        (assignment) =>
          assignment.roleDefinitionId === created.roleDefinitionId &&
          assignment.scopeKind === "Program" &&
          assignment.scopeId === YOUTH_PROGRAM
      )
    ).toBe(true);
    await testDb()
      .prepare(
        `INSERT OR IGNORE INTO role_definition_grants
           (role_definition_id, capability, granted_by, granted_at)
         VALUES (?, 'role.delete', ?, ?)`
      )
      .bind(DEPARTMENT_ROLE, ADMIN, FIXTURE_NOW)
      .run();
    try {
      const lifecyclePreview = await getRoleDefinitionLifecyclePreview(
        testDb(),
        SCOPED_ACTOR,
        created.roleDefinitionId,
        "archive"
      );
      const lifecycleImpact = lifecyclePreview.impact.find(
        (impact) => impact.accountUserId === MEMBER
      );
      expect(lifecycleImpact?.lost.Program).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            capability: "program.manage",
            scopeId: YOUTH_PROGRAM,
            sources: expect.arrayContaining(["快照歷史測試身份組"]),
          }),
        ])
      );
    } finally {
      await testDb()
        .prepare(
          `DELETE FROM role_definition_grants
            WHERE role_definition_id = ? AND capability = 'role.delete'`
        )
        .bind(DEPARTMENT_ROLE)
        .run();
    }
    const candidateSearch = await searchEligibleAccounts(
      testDb(),
      PROGRAM_ACTOR,
      "Disposable Member",
      0,
      20
    );
    const candidate = candidateSearch.accounts.find(
      (account) => account.userId === MEMBER
    );
    expect(candidate?.identities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roleDefinitionId: created.roleDefinitionId,
          label: "快照歷史測試身份組",
          scopeLabel: "E2E_DISPOSABLE_青少年查經",
        }),
      ])
    );
    const revoked = await revokeAccountAssignments(testDb(), {
      actor_user_id: PROGRAM_ACTOR,
      account_user_id: MEMBER,
      base_revision: scopedView.revision,
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
      scopeId: YOUTH_PROGRAM,
    });

    const readded = await mutateAccountAssignments(testDb(), {
      actor_user_id: ADMIN,
      account_user_id: MEMBER,
      base_revision: revoked.revision,
      role_definition_ids: [created.roleDefinitionId],
      idempotency_key: "account-access-red-scope-snapshot-readd",
      now: "2026-08-29T00:01:12.000Z",
      audit_id: "account-access-red-scope-snapshot-readd-audit",
      correlation_id: "account-access-red-scope-snapshot-readd-correlation",
    });
    const fresh = readded.activeAssignments.find(
      (assignment) => assignment.roleDefinitionId === created.roleDefinitionId
    );
    expect(fresh?.assignmentId).not.toBe(initial?.assignmentId);
    expect(fresh).toMatchObject({
      scopeKind: "Department",
      scopeId: ADULT_DEPARTMENT,
    });
    expect(
      readded.effectiveAccess.Department.some(
        (grant) =>
          grant.capability === "program.manage" &&
          grant.scopeId === ADULT_DEPARTMENT &&
          grant.sources.includes("快照歷史測試身份組")
      )
    ).toBe(true);
    const postRescopeDepartmentCapabilities = await resolveActorCapabilities(
      testDb(),
      MEMBER,
      { departmentId: ADULT_DEPARTMENT }
    );
    expect(postRescopeDepartmentCapabilities["program.manage"]).toBe(true);
    const postRescopeProgramCapabilities = await resolveActorCapabilities(
      testDb(),
      MEMBER,
      { programId: YOUTH_PROGRAM }
    );
    expect(postRescopeProgramCapabilities["program.manage"]).not.toBe(true);
    expect((await loadBootstrapIdentity(testDb(), MEMBER)).identities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "快照歷史測試身份組",
          scopeKind: "Department",
        }),
      ])
    );

    await revokeAccountAssignments(testDb(), {
      actor_user_id: ADMIN,
      account_user_id: MEMBER,
      base_revision: readded.revision,
      role_definition_ids: [created.roleDefinitionId],
      idempotency_key: "account-access-red-scope-snapshot-cleanup",
      now: "2026-08-29T00:01:15.000Z",
      audit_id: "account-access-red-scope-snapshot-cleanup-audit",
      correlation_id: "account-access-red-scope-snapshot-cleanup-correlation",
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
  test("records complete state for duplicate assignment audits", async () => {
    const beforeRows = await testDb()
      .prepare(
        "SELECT role_definition_id FROM role_assignments WHERE account_user_id = ? AND revoked_at IS NULL"
      )
      .bind(MIXED_SCOPE_TARGET)
      .all<{ role_definition_id: string }>();
    const beforeIds = (beforeRows.results ?? []).map(
      (row) => row.role_definition_id
    );
    const revision = await testDb()
      .prepare("SELECT revision FROM role_policy_revisions WHERE id = 1")
      .first<{ revision: number }>();
    const duplicateGrant = await mutateAccountAssignments(testDb(), {
      actor_user_id: SCOPED_ACTOR,
      account_user_id: MIXED_SCOPE_TARGET,
      base_revision: revision?.revision ?? 1,
      role_definition_ids: [LOWER_DEPARTMENT_ROLE],
      idempotency_key: "account-access-red-duplicate-complete-grant",
      now: "2026-08-29T00:07:30.000Z",
      audit_id: "account-access-red-duplicate-complete-grant-audit",
      correlation_id: "account-access-red-duplicate-complete-grant-correlation",
    });
    expect(duplicateGrant.duplicateRoleDefinitionIds).toEqual([
      LOWER_DEPARTMENT_ROLE,
    ]);
    const grantAudit = await testDb()
      .prepare(
        "SELECT old_value_json, new_value_json, reason FROM role_audit_events WHERE audit_id = ?"
      )
      .bind("account-access-red-duplicate-complete-grant-audit")
      .first<{
        old_value_json: string;
        new_value_json: string;
        reason: string;
      }>();
    expect(new Set(JSON.parse(grantAudit?.old_value_json ?? "[]"))).toEqual(
      new Set(beforeIds)
    );
    expect(new Set(JSON.parse(grantAudit?.new_value_json ?? "[]"))).toEqual(
      new Set(beforeIds)
    );
    expect(grantAudit?.reason).toContain("ROLE_ASSIGNMENT_DUPLICATE");
    const duplicateRevoke = await revokeAccountAssignments(testDb(), {
      actor_user_id: SCOPED_ACTOR,
      account_user_id: MIXED_SCOPE_TARGET,
      base_revision: duplicateGrant.revision,
      role_definition_ids: [GRANTABLE_DEPARTMENT_ROLE],
      idempotency_key: "account-access-red-duplicate-complete-revoke",
      now: "2026-08-29T00:07:35.000Z",
      audit_id: "account-access-red-duplicate-complete-revoke-audit",
      correlation_id:
        "account-access-red-duplicate-complete-revoke-correlation",
    });
    expect(duplicateRevoke.duplicateRoleDefinitionIds).toEqual([
      GRANTABLE_DEPARTMENT_ROLE,
    ]);
    const revokeAudit = await testDb()
      .prepare(
        "SELECT old_value_json, new_value_json, reason FROM role_audit_events WHERE audit_id = ?"
      )
      .bind("account-access-red-duplicate-complete-revoke-audit")
      .first<{
        old_value_json: string;
        new_value_json: string;
        reason: string;
      }>();
    expect(new Set(JSON.parse(revokeAudit?.old_value_json ?? "[]"))).toEqual(
      new Set(beforeIds)
    );
    expect(new Set(JSON.parse(revokeAudit?.new_value_json ?? "[]"))).toEqual(
      new Set(beforeIds)
    );
    expect(revokeAudit?.reason).toContain("ROLE_ASSIGNMENT_DUPLICATE");
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
    const audit = await testDb()
      .prepare("SELECT outcome FROM role_audit_events WHERE audit_id = ?")
      .bind("account-access-red-invalid-audit")
      .first<{ outcome: string }>();
    expect(audit?.outcome).toBe("REJECTED");
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
  test("computes lifecycle impact for a role.delete-only actor", async () => {
    const preview = await getRoleDefinitionLifecyclePreview(
      testDb(),
      DELETE_ONLY_ACTOR,
      DEPARTMENT_ROLE,
      "archive"
    );
    const impact = preview.impact.find(
      (item) => item.accountUserId === "E2E_DISPOSABLE_DM"
    );
    expect(impact?.lost.Department.length).toBeGreaterThan(0);
    expect(
      impact?.retained.Global.some(
        (grant) =>
          grant.capability === "program.enroll" &&
          grant.sources.includes("會友基礎")
      )
    ).toBe(true);
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
  test("records complete authoritative assignment summaries", async () => {
    const initial = await loadAccountAccess(
      testDb(),
      SCOPED_ACTOR,
      MIXED_SCOPE_TARGET
    );
    const authoritativeRows = await testDb()
      .prepare(
        "SELECT role_definition_id FROM role_assignments WHERE account_user_id = ? AND revoked_at IS NULL"
      )
      .bind(MIXED_SCOPE_TARGET)
      .all<{ role_definition_id: string }>();
    const fullBefore = (authoritativeRows.results ?? []).map(
      (row) => row.role_definition_id
    );
    const grant = await mutateAccountAssignments(testDb(), {
      actor_user_id: SCOPED_ACTOR,
      account_user_id: MIXED_SCOPE_TARGET,
      base_revision: initial.revision,
      role_definition_ids: [GRANTABLE_DEPARTMENT_ROLE],
      idempotency_key: "account-access-red-authoritative-grant",
      now: "2026-08-29T00:08:00.000Z",
      audit_id: "account-access-red-authoritative-grant-audit",
      correlation_id: "account-access-red-authoritative-grant-correlation",
    });
    const grantAudit = await testDb()
      .prepare(
        "SELECT old_value_json, new_value_json FROM role_audit_events WHERE audit_id = ?"
      )
      .bind("account-access-red-authoritative-grant-audit")
      .first<{ old_value_json: string; new_value_json: string }>();
    expect(new Set(JSON.parse(grantAudit?.old_value_json ?? "[]"))).toEqual(
      new Set(fullBefore)
    );
    expect(new Set(JSON.parse(grantAudit?.new_value_json ?? "[]"))).toEqual(
      new Set([...fullBefore, GRANTABLE_DEPARTMENT_ROLE])
    );

    await revokeAccountAssignments(testDb(), {
      actor_user_id: SCOPED_ACTOR,
      account_user_id: MIXED_SCOPE_TARGET,
      base_revision: grant.revision,
      role_definition_ids: [GRANTABLE_DEPARTMENT_ROLE],
      idempotency_key: "account-access-red-authoritative-revoke",
      now: "2026-08-29T00:08:30.000Z",
      audit_id: "account-access-red-authoritative-revoke-audit",
      correlation_id: "account-access-red-authoritative-revoke-correlation",
    });
    const revokeAudit = await testDb()
      .prepare(
        "SELECT old_value_json, new_value_json FROM role_audit_events WHERE audit_id = ?"
      )
      .bind("account-access-red-authoritative-revoke-audit")
      .first<{ old_value_json: string; new_value_json: string }>();
    expect(new Set(JSON.parse(revokeAudit?.old_value_json ?? "[]"))).toEqual(
      new Set([...fullBefore, GRANTABLE_DEPARTMENT_ROLE])
    );
    expect(new Set(JSON.parse(revokeAudit?.new_value_json ?? "[]"))).toEqual(
      new Set(fullBefore)
    );
  });
  test("replays an assignment reservation that wins a revision race", async () => {
    const before = await loadAccountAccess(testDb(), ADMIN, STAFF);
    const input = {
      actor_user_id: ADMIN,
      account_user_id: STAFF,
      base_revision: before.revision,
      role_definition_ids: [GRANTABLE_DEPARTMENT_ROLE],
      idempotency_key: "account-access-red-assignment-race",
      now: "2026-08-29T00:09:00.000Z",
      audit_id: "account-access-red-assignment-race-audit",
      correlation_id: "account-access-red-assignment-race-correlation",
    };
    const race = revisionRaceDatabase(testDb());
    const firstPromise = mutateAccountAssignments(race.firstDb, input);
    await race.firstRevisionRead;
    const secondPromise = mutateAccountAssignments(race.secondDb, {
      ...input,
      now: "2026-08-29T00:09:01.000Z",
      audit_id: "account-access-red-assignment-race-audit-2",
      correlation_id: "account-access-red-assignment-race-correlation-2",
    });
    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(first.idempotent).toBe(false);
    expect(second.idempotent).toBe(true);
    expect(second.revision).toBe(first.revision);
    expect(
      second.activeAssignments.some(
        (assignment) =>
          assignment.roleDefinitionId === GRANTABLE_DEPARTMENT_ROLE
      )
    ).toBe(true);
  });

  test("replays a revoke reservation that wins a revision race", async () => {
    const before = await loadAccountAccess(testDb(), ADMIN, STAFF);
    const input = {
      actor_user_id: ADMIN,
      account_user_id: STAFF,
      base_revision: before.revision,
      role_definition_ids: [GRANTABLE_DEPARTMENT_ROLE],
      idempotency_key: "account-access-red-revoke-race",
      now: "2026-08-29T00:09:30.000Z",
      audit_id: "account-access-red-revoke-race-audit",
      correlation_id: "account-access-red-revoke-race-correlation",
    };
    const race = revisionRaceDatabase(testDb());
    const firstPromise = revokeAccountAssignments(race.firstDb, input);
    await race.firstRevisionRead;
    const secondPromise = revokeAccountAssignments(race.secondDb, {
      ...input,
      now: "2026-08-29T00:09:31.000Z",
      audit_id: "account-access-red-revoke-race-audit-2",
      correlation_id: "account-access-red-revoke-race-correlation-2",
    });
    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(first.idempotent).toBe(false);
    expect(second.idempotent).toBe(true);
    expect(second.revision).toBe(first.revision);
    expect(
      second.activeAssignments.some(
        (assignment) =>
          assignment.roleDefinitionId === GRANTABLE_DEPARTMENT_ROLE
      )
    ).toBe(false);
  });

  test("replays a lifecycle reservation that wins a revision race", async () => {
    const before = await loadAccountAccess(testDb(), ADMIN, STAFF);
    const input = {
      actor_user_id: ADMIN,
      role_definition_id: DELETE_ONLY_ROLE,
      action: "archive" as const,
      base_revision: before.revision,
      idempotency_key: "account-access-red-lifecycle-race",
      now: "2026-08-29T00:10:00.000Z",
      audit_id: "account-access-red-lifecycle-race-audit",
      correlation_id: "account-access-red-lifecycle-race-correlation",
    };
    const race = revisionRaceDatabase(testDb());
    const firstPromise = mutateRoleDefinitionLifecycle(race.firstDb, input);
    await race.firstRevisionRead;
    const secondPromise = mutateRoleDefinitionLifecycle(race.secondDb, {
      ...input,
      now: "2026-08-29T00:10:01.000Z",
      audit_id: "account-access-red-lifecycle-race-audit-2",
      correlation_id: "account-access-red-lifecycle-race-correlation-2",
    });
    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(first.idempotent).toBe(false);
    expect(second.idempotent).toBe(true);
    expect(second.revision).toBe(first.revision);
    expect(second.isArchived).toBe(true);
  });
  test("replays a denied assignment reservation from a revision race", async () => {
    const before = await loadAccountAccess(testDb(), ADMIN, STAFF);
    const requestFingerprint = `assignment|grant|${ADMIN}|${STAFF}|${before.revision}|${GRANTABLE_DEPARTMENT_ROLE}`;
    const db = deniedReservationDatabase(testDb(), {
      idempotencyKey: "account-access-red-denied-assignment-race",
      requestFingerprint,
      actorUserId: ADMIN,
      baseRevision: before.revision,
      errorCode: "ROLE_SCOPE_MISMATCH",
      action: "ROLE_ASSIGNMENT_GRANT",
      entityType: "account",
      entityId: STAFF,
      now: "2026-08-29T00:11:00.000Z",
    });
    await expect(
      mutateAccountAssignments(db, {
        actor_user_id: ADMIN,
        account_user_id: STAFF,
        base_revision: before.revision,
        role_definition_ids: [GRANTABLE_DEPARTMENT_ROLE],
        idempotency_key: "account-access-red-denied-assignment-race",
        now: "2026-08-29T00:11:00.000Z",
        audit_id: "account-access-red-denied-assignment-race-audit",
        correlation_id: "account-access-red-denied-assignment-race-correlation",
      })
    ).rejects.toThrow("ROLE_SCOPE_MISMATCH");
  });

  test("replays a denied revoke reservation from a revision race", async () => {
    const before = await loadAccountAccess(testDb(), ADMIN, STAFF);
    const requestFingerprint = `assignment|revoke|${ADMIN}|${STAFF}|${before.revision}|${PROGRAM_ROLE}`;
    const db = deniedReservationDatabase(testDb(), {
      idempotencyKey: "account-access-red-denied-revoke-race",
      requestFingerprint,
      actorUserId: ADMIN,
      baseRevision: before.revision,
      errorCode: "ROLE_SCOPE_MISMATCH",
      action: "ROLE_ASSIGNMENT_REVOKE",
      entityType: "account",
      entityId: STAFF,
      now: "2026-08-29T00:11:30.000Z",
    });
    await expect(
      revokeAccountAssignments(db, {
        actor_user_id: ADMIN,
        account_user_id: STAFF,
        base_revision: before.revision,
        role_definition_ids: [PROGRAM_ROLE],
        idempotency_key: "account-access-red-denied-revoke-race",
        now: "2026-08-29T00:11:30.000Z",
        audit_id: "account-access-red-denied-revoke-race-audit",
        correlation_id: "account-access-red-denied-revoke-race-correlation",
      })
    ).rejects.toThrow("ROLE_SCOPE_MISMATCH");
  });

  test("replays a denied lifecycle reservation from a revision race", async () => {
    const before = await loadAccountAccess(testDb(), ADMIN, STAFF);
    const requestFingerprint = `lifecycle|archive|${ADMIN}|${PROGRAM_ROLE}|${before.revision}|`;
    const db = deniedReservationDatabase(testDb(), {
      idempotencyKey: "account-access-red-denied-lifecycle-race",
      requestFingerprint,
      actorUserId: ADMIN,
      baseRevision: before.revision,
      errorCode: "ROLE_SCOPE_MISMATCH",
      action: "ROLE_DEFINITION_ARCHIVE",
      entityType: "role_definition",
      entityId: PROGRAM_ROLE,
      now: "2026-08-29T00:12:00.000Z",
    });
    await expect(
      mutateRoleDefinitionLifecycle(db, {
        actor_user_id: ADMIN,
        role_definition_id: PROGRAM_ROLE,
        action: "archive",
        base_revision: before.revision,
        idempotency_key: "account-access-red-denied-lifecycle-race",
        now: "2026-08-29T00:12:00.000Z",
        audit_id: "account-access-red-denied-lifecycle-race-audit",
        correlation_id: "account-access-red-denied-lifecycle-race-correlation",
      })
    ).rejects.toThrow("ROLE_SCOPE_MISMATCH");
  });
  test("records changed-key reuse as rejected audit without mutation for grant, revoke, and lifecycle", async () => {
    const grantBefore = await loadAccountAccess(testDb(), ADMIN, STAFF);
    const grantInput = {
      actor_user_id: ADMIN,
      account_user_id: STAFF,
      base_revision: grantBefore.revision,
      role_definition_ids: [LOWER_DEPARTMENT_ROLE],
      idempotency_key: "account-access-red-reuse-grant",
      now: "2026-08-29T00:13:00.000Z",
      audit_id: "account-access-red-reuse-grant-audit",
      correlation_id: "account-access-red-reuse-grant-correlation",
    };
    const granted = await mutateAccountAssignments(testDb(), grantInput);
    await expect(
      mutateAccountAssignments(testDb(), {
        ...grantInput,
        role_definition_ids: [PROGRAM_ROLE],
        audit_id: "account-access-red-reuse-grant-rejected-audit",
        correlation_id: "account-access-red-reuse-grant-rejected-correlation",
      })
    ).rejects.toThrow("ROLE_IDEMPOTENCY_REUSE");
    const afterGrantReuse = await loadAccountAccess(testDb(), ADMIN, STAFF);
    expect(afterGrantReuse.revision).toBe(granted.revision);
    expect(
      afterGrantReuse.activeAssignments.filter(
        (assignment) => assignment.roleDefinitionId === LOWER_DEPARTMENT_ROLE
      )
    ).toHaveLength(1);

    const grantReuseAudit = await testDb()
      .prepare(
        `SELECT action, outcome, reason, correlation_id
           FROM role_audit_events WHERE audit_id = ?`
      )
      .bind("account-access-red-reuse-grant-rejected-audit")
      .first<{
        action: string;
        outcome: string;
        reason: string;
        correlation_id: string;
      }>();
    expect(grantReuseAudit).toEqual({
      action: "ROLE_ASSIGNMENT_GRANT",
      outcome: "REJECTED",
      reason: "ROLE_IDEMPOTENCY_REUSE",
      correlation_id: "account-access-red-reuse-grant-rejected-correlation",
    });

    const revokeInput = {
      actor_user_id: ADMIN,
      account_user_id: STAFF,
      base_revision: granted.revision,
      role_definition_ids: [LOWER_DEPARTMENT_ROLE],
      idempotency_key: "account-access-red-reuse-revoke",
      now: "2026-08-29T00:13:01.000Z",
      audit_id: "account-access-red-reuse-revoke-audit",
      correlation_id: "account-access-red-reuse-revoke-correlation",
    };
    const revoked = await revokeAccountAssignments(testDb(), revokeInput);
    await expect(
      revokeAccountAssignments(testDb(), {
        ...revokeInput,
        role_definition_ids: [PROGRAM_ROLE],
        audit_id: "account-access-red-reuse-revoke-rejected-audit",
        correlation_id: "account-access-red-reuse-revoke-rejected-correlation",
      })
    ).rejects.toThrow("ROLE_IDEMPOTENCY_REUSE");
    const afterRevokeReuse = await loadAccountAccess(testDb(), ADMIN, STAFF);
    expect(afterRevokeReuse.revision).toBe(revoked.revision);
    expect(
      afterRevokeReuse.activeAssignments.some(
        (assignment) => assignment.roleDefinitionId === LOWER_DEPARTMENT_ROLE
      )
    ).toBe(false);
    const revokeReuseAudit = await testDb()
      .prepare(
        `SELECT action, outcome, reason, correlation_id
           FROM role_audit_events WHERE audit_id = ?`
      )
      .bind("account-access-red-reuse-revoke-rejected-audit")
      .first<{
        action: string;
        outcome: string;
        reason: string;
        correlation_id: string;
      }>();
    expect(revokeReuseAudit).toEqual({
      action: "ROLE_ASSIGNMENT_REVOKE",
      outcome: "REJECTED",
      reason: "ROLE_IDEMPOTENCY_REUSE",
      correlation_id: "account-access-red-reuse-revoke-rejected-correlation",
    });

    const lifecycleBefore = await loadAccountAccess(testDb(), ADMIN, STAFF);
    const lifecycleInput = {
      actor_user_id: ADMIN,
      role_definition_id: DEPARTMENT_ROLE,
      action: "archive" as const,
      base_revision: lifecycleBefore.revision,
      idempotency_key: "account-access-red-reuse-lifecycle",
      now: "2026-08-29T00:13:02.000Z",
      audit_id: "account-access-red-reuse-lifecycle-audit",
      correlation_id: "account-access-red-reuse-lifecycle-correlation",
    };
    const archived = await mutateRoleDefinitionLifecycle(
      testDb(),
      lifecycleInput
    );
    expect(archived.isArchived).toBe(true);
    await expect(
      mutateRoleDefinitionLifecycle(testDb(), {
        ...lifecycleInput,
        action: "restore",
        audit_id: "account-access-red-reuse-lifecycle-rejected-audit",
        correlation_id:
          "account-access-red-reuse-lifecycle-rejected-correlation",
      })
    ).rejects.toThrow("ROLE_IDEMPOTENCY_REUSE");
    const lifecycleRow = await testDb()
      .prepare(
        `SELECT is_archived FROM role_definitions
          WHERE role_definition_id = ?`
      )
      .bind(DEPARTMENT_ROLE)
      .first<{ is_archived: number }>();
    expect(lifecycleRow?.is_archived).toBe(1);
    const lifecycleReuseAudit = await testDb()
      .prepare(
        `SELECT action, outcome, reason, correlation_id
           FROM role_audit_events WHERE audit_id = ?`
      )
      .bind("account-access-red-reuse-lifecycle-rejected-audit")
      .first<{
        action: string;
        outcome: string;
        reason: string;
        correlation_id: string;
      }>();
    expect(lifecycleReuseAudit).toEqual({
      action: "ROLE_DEFINITION_RESTORE",
      outcome: "REJECTED",
      reason: "ROLE_IDEMPOTENCY_REUSE",
      correlation_id: "account-access-red-reuse-lifecycle-rejected-correlation",
    });
  });
  test("rejects atomic assignment batch containing an archived or ineligible role definition without applying any grants", async () => {
    const before = await loadAccountAccess(testDb(), ADMIN, STAFF);
    const beforeCount = await testDb()
      .prepare(
        "SELECT COUNT(*) AS count FROM role_assignments WHERE account_user_id = ? AND revoked_at IS NULL"
      )
      .bind(STAFF)
      .first<{ count: number }>();

    await expect(
      mutateAccountAssignments(testDb(), {
        actor_user_id: ADMIN,
        account_user_id: STAFF,
        base_revision: before.revision,
        role_definition_ids: [
          GRANTABLE_DEPARTMENT_ROLE,
          "018f3b8a-ffff-7000-8000-999999999999",
        ],
        idempotency_key: "account-access-atomic-invalid-batch",
        now: "2026-08-29T00:14:00.000Z",
        audit_id: "account-access-atomic-invalid-batch-audit",
        correlation_id: "account-access-atomic-invalid-batch-correlation",
      })
    ).rejects.toThrow();

    const afterCount = await testDb()
      .prepare(
        "SELECT COUNT(*) AS count FROM role_assignments WHERE account_user_id = ? AND revoked_at IS NULL"
      )
      .bind(STAFF)
      .first<{ count: number }>();
    expect(afterCount?.count).toBe(beforeCount?.count);
  });

  test("rejects assignment and revoke on nonexistent, inactive, or admin accounts with canonical domain errors", async () => {
    const revision =
      (
        await testDb()
          .prepare("SELECT revision FROM role_policy_revisions WHERE id = 1")
          .first<{ revision: number }>()
      )?.revision ?? 1;

    await expect(
      loadAccountAccess(testDb(), ADMIN, "NONEXISTENT_USER_999")
    ).rejects.toThrow();

    await expect(
      mutateAccountAssignments(testDb(), {
        actor_user_id: ADMIN,
        account_user_id: ADMIN,
        base_revision: revision,
        role_definition_ids: [DEPARTMENT_ROLE],
        idempotency_key: "account-access-admin-target-grant",
        now: "2026-08-29T00:14:01.000Z",
        audit_id: "account-access-admin-target-grant-audit",
        correlation_id: "account-access-admin-target-grant-correlation",
      })
    ).rejects.toThrow();
  });

  test("rejects cross-department scope tampering when assigning or revoking roles", async () => {
    const revision =
      (
        await testDb()
          .prepare("SELECT revision FROM role_policy_revisions WHERE id = 1")
          .first<{ revision: number }>()
      )?.revision ?? 1;

    await expect(
      mutateAccountAssignments(testDb(), {
        actor_user_id: PROGRAM_ACTOR,
        account_user_id: STAFF,
        base_revision: revision,
        role_definition_ids: [DEPARTMENT_ROLE],
        idempotency_key: "account-access-cross-scope-tamper",
        now: "2026-08-29T00:14:02.000Z",
        audit_id: "account-access-cross-scope-tamper-audit",
        correlation_id: "account-access-cross-scope-tamper-correlation",
      })
    ).rejects.toThrow();
  });

  test("computes grouped Global, Department, and Program impact with multi-source provenance on revoke", async () => {
    const view = await loadAccountAccess(testDb(), ADMIN, STAFF);
    expect(view.effectiveAccess).toHaveProperty("Global");
    expect(view.effectiveAccess).toHaveProperty("Department");
    expect(view.effectiveAccess).toHaveProperty("Program");

    for (const scope of ["Global", "Department", "Program"] as const) {
      for (const grant of view.effectiveAccess[scope]) {
        expect(Array.isArray(grant.sources)).toBe(true);
        expect(grant.sources.length).toBeGreaterThan(0);
        expect(Array.isArray(grant.sourceRoleDefinitionIds)).toBe(true);
        expect(grant.sourceRoleDefinitionIds.length).toBeGreaterThan(0);
      }
    }
  });
});
