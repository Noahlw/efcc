import assert from "node:assert/strict";

import { describe, test } from "vitest";

import {
  AccountAccessViewSchema,
  GrantChangeSchema,
  AssignmentsBodySchema,
  CreateBodySchema,
  EligibleAccountSearchSchema,
  GrantsBodySchema,
  LifecycleBodySchema,
  RenameBodySchema,
  ReorderBodySchema,
  RescopeBodySchema,
  RoleDefinitionDetailViewSchema,
  RoleDefinitionLifecyclePreviewSchema,
  RoleHierarchyViewSchema,
  RoleRenameResultSchema,
  isValidRoleLabel,
  normalizeRoleName,
  parseAccountSearchQuery,
  parseIdempotencyKey,
} from "./identity";

describe("identity request predicates", () => {
  test("idempotency key is trimmed 1..200", () => {
    assert.strictEqual(parseIdempotencyKey("  k  "), "k");
    assert.strictEqual(parseIdempotencyKey(""), null);
    assert.strictEqual(parseIdempotencyKey("x".repeat(201)), null);
    assert.strictEqual(parseIdempotencyKey("x".repeat(200)), "x".repeat(200));
    assert.strictEqual(parseIdempotencyKey(undefined), null);
  });
  test("role label rule mirrors H-11", () => {
    assert.strictEqual(normalizeRoleName("  成人部  "), "成人部");
    assert.strictEqual(isValidRoleLabel("成人部門管理者"), true);
    assert.strictEqual(isValidRoleLabel("   "), false);
    assert.strictEqual(isValidRoleLabel("x".repeat(61)), false);
    assert.strictEqual(isValidRoleLabel(42), false);
  });
  test("rename/create/rescope/reorder bodies mirror handler branches", () => {
    assert.strictEqual(
      RenameBodySchema.safeParse({ label: "A", base_revision: 1 }).success,
      true
    );
    assert.strictEqual(
      RenameBodySchema.safeParse({ label: "A" }).success,
      false
    );
    assert.strictEqual(
      CreateBodySchema.safeParse({
        category_key: "Department",
        label: "A",
        scope_kind: "Department",
        base_revision: 1,
      }).success,
      true
    );
    assert.strictEqual(
      CreateBodySchema.safeParse({
        category_key: "Department",
        label: "A",
        scope_kind: "Department",
        scope_id: 42,
        base_revision: 1,
      }).success,
      false
    );
    // Unknown keys ignored on loose bodies.
    assert.strictEqual(
      CreateBodySchema.safeParse({
        category_key: "Global",
        label: "A",
        scope_kind: "Global",
        base_revision: 1,
        future: true,
      }).success,
      true
    );
    assert.strictEqual(
      RescopeBodySchema.safeParse({ scope_kind: "Program", base_revision: 2 })
        .success,
      true
    );
    assert.strictEqual(
      ReorderBodySchema.safeParse({
        category_key: "Global",
        targets: [
          { role_definition_id: "a", position: 0 },
          { role_definition_id: "b", position: 1 },
        ],
        base_revision: 1,
      }).success,
      true
    );
    assert.strictEqual(
      ReorderBodySchema.safeParse({
        category_key: "Global",
        targets: [{ role_definition_id: "a", position: 0 }],
        base_revision: 1,
      }).success,
      false
    );
  });
  test("grants/assignments/lifecycle bodies enforce strict keys", () => {
    assert.strictEqual(
      GrantsBodySchema.safeParse({
        base_revision: 1,
        changes: [{ capability: "role.read", value: true }],
      }).success,
      true
    );
    // Actor echo rejected: identity comes from the cookie.
    assert.strictEqual(
      GrantsBodySchema.safeParse({
        base_revision: 1,
        changes: [],
        actor_user_id: "u",
      }).success,
      false
    );
    assert.strictEqual(
      GrantChangeSchema.safeParse({ capability: "role.read", value: "yes" })
        .success,
      false
    );
    assert.strictEqual(
      AssignmentsBodySchema.safeParse({
        base_revision: 1,
        role_definition_ids: ["a"],
      }).success,
      true
    );
    assert.strictEqual(
      AssignmentsBodySchema.safeParse({
        base_revision: 1,
        role_definition_ids: ["a"],
        extra: 1,
      }).success,
      false
    );
    assert.strictEqual(
      LifecycleBodySchema.safeParse({ action: "archive", base_revision: 1 })
        .success,
      true
    );
    assert.strictEqual(
      LifecycleBodySchema.safeParse({ action: "delete", base_revision: 1 })
        .success,
      false
    );
  });
  test("search query rejects (never clamps) bad pagination", () => {
    assert.deepStrictEqual(
      parseAccountSearchQuery(new URLSearchParams("q=a&offset=5&limit=20")),
      { q: "a", offset: 5, limit: 20 }
    );
    assert.strictEqual(
      parseAccountSearchQuery(new URLSearchParams("offset=-1")),
      null
    );
    assert.strictEqual(
      parseAccountSearchQuery(new URLSearchParams("limit=101")),
      null
    );
    assert.strictEqual(
      parseAccountSearchQuery(new URLSearchParams("limit=abc")),
      null
    );
  });
});

describe("identity response schemas", () => {
  test("rename result and hierarchy view", () => {
    assert.strictEqual(
      RoleRenameResultSchema.safeParse({
        roleDefinitionId: "r",
        label: "L",
        revision: 2,
        idempotent: false,
      }).success,
      true
    );
    assert.strictEqual(
      RoleHierarchyViewSchema.safeParse({
        categories: [],
        revision: 1,
        caller: { userId: "u", highestPosition: 0 },
      }).success,
      true
    );
    assert.strictEqual(
      RoleHierarchyViewSchema.safeParse({
        categories: [
          {
            categoryKey: "Global",
            label: "l",
            description: "d",
            displayOrder: 0,
            childCount: 1,
            definitions: [
              {
                roleDefinitionId: "r",
                label: "l",
                description: "d",
                kind: "GLOBAL",
                scopeKind: "Global",
                scopeId: null,
                scopeLabel: null,
                position: 0,
                isProtected: false,
                isArchived: false,
                assignmentCount: 0,
                grantCount: 0,
                actions: [{ action: "rename", label: "改名" }],
                reorderActions: [],
              },
            ],
            createOptions: [],
          },
        ],
        revision: 1,
        caller: { userId: "u", highestPosition: 0 },
      }).success,
      true
    );
  });
  test("detail view requires complete permission rows", () => {
    const ok = {
      roleDefinition: {
        roleDefinitionId: "r",
        label: "l",
        description: "d",
        kind: "GLOBAL",
        scopeKind: "Global",
        scopeId: null,
        scopeLabel: null,
        position: 0,
        isProtected: false,
        isArchived: false,
        assignmentCount: 0,
        grantCount: 1,
        actions: [],
        reorderActions: [],
      },
      permissions: [
        {
          capability: "role.read",
          label: "l",
          description: "d",
          group: "g",
          risk: "high",
          scopeRequired: false,
          value: true,
          editable: true,
          locked: false,
          lockReason: null,
        },
      ],
      assignedAccounts: [],
      revision: 1,
      caller: { userId: "u", canRead: true, canWrite: true },
    };
    assert.strictEqual(
      RoleDefinitionDetailViewSchema.safeParse(ok).success,
      true
    );
    assert.strictEqual(
      RoleDefinitionDetailViewSchema.safeParse({
        ...ok,
        permissions: [{ capability: "role.read", value: "yes" }],
      }).success,
      false
    );
  });
  test("account access and search shapes", () => {
    assert.strictEqual(
      EligibleAccountSearchSchema.safeParse({
        accounts: [
          {
            userId: "u",
            name: "n",
            username: "x",
            identities: [
              { roleDefinitionId: "r", label: "l", scopeLabel: null },
            ],
          },
        ],
        nextOffset: null,
      }).success,
      true
    );
    assert.strictEqual(
      RoleDefinitionLifecyclePreviewSchema.safeParse({
        roleDefinitionId: "r",
        action: "archive",
        isArchived: false,
        revision: 1,
        affectedAccountUserIds: [],
        impact: [],
      }).success,
      true
    );
    assert.strictEqual(
      AccountAccessViewSchema.safeParse({
        account: { userId: "u", name: "n", username: "x", status: "Active" },
        activeAssignments: [],
        revokedAssignments: [],
        assignmentHistory: [],
        assignableRoles: [],
        effectiveAccess: { Global: [], Department: [], Program: [] },
        lifecycleImpacts: {},
        revision: 1,
        actions: {
          assign: true,
          revoke: true,
          archive: false,
          restore: false,
          revokeRoleDefinitionIds: [],
          archiveRoleDefinitionIds: [],
          restoreRoleDefinitionIds: [],
        },
      }).success,
      true
    );
  });
});
