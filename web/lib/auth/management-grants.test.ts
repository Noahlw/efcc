/**
 * #215 ATT-03 — a Member-role account holding an active Program Leader or
 * Department Manager grant must be detectable via one cheap indexed query,
 * without pulling in the full DepartmentWorkspace/capability graph.
 */
import { describe, test, expect, beforeAll } from "vitest";

import { importLegacyUsers } from "./accounts";
import { hasActiveManagementGrant } from "./management-grants";
import { applyMigrations, testDb } from "./test-bootstrap";

const HEADER = [
  "User_ID",
  "Name",
  "Username",
  "PIN_Code",
  "System_Role",
  "Status",
];

beforeAll(async () => {
  await applyMigrations();
  await importLegacyUsers(testDb(), [
    HEADER,
    ["U-GRANT-1", "Grant Leader", "grant.leader", "1234", "Member", "Active"],
    ["U-GRANT-2", "Grant Manager", "grant.manager", "1234", "Member", "Active"],
    ["U-GRANT-3", "No Grant", "no.grant", "1234", "Member", "Active"],
    [
      "U-GRANT-4",
      "Revoked Leader",
      "revoked.leader",
      "1234",
      "Member",
      "Active",
    ],
  ]);
  const now = new Date().toISOString();
  await testDb()
    .prepare(
      `INSERT INTO departments (department_id, code, name, lifecycle, created_at, updated_at)
       VALUES ('DEPT-GRANT', 'GRANT-TEST', 'Grant Test Department', 'Active', ?, ?)`
    )
    .bind(now, now)
    .run();
  await testDb()
    .prepare(
      `INSERT INTO programs (program_id, department_id, name, category, behavior_type,
         lifecycle, discoverability, enrollment_mode, created_at, updated_at)
       VALUES ('PROG-GRANT', 'DEPT-GRANT', 'Grant Test Program', 'Test', 'OneOff',
         'Active', 'Listed', 'MemberRequest', ?, ?)`
    )
    .bind(now, now)
    .run();
  // Active Program Leader grant.
  await testDb()
    .prepare(
      `INSERT INTO program_leaders (program_id, user_id, granted_by, granted_at)
       VALUES ('PROG-GRANT', 'U-GRANT-1', 'U-GRANT-1', ?)`
    )
    .bind(now)
    .run();
  // Active Department Manager grant.
  await testDb()
    .prepare(
      `INSERT INTO department_managers (department_id, user_id, granted_by, granted_at)
       VALUES ('DEPT-GRANT', 'U-GRANT-2', 'U-GRANT-2', ?)`
    )
    .bind(now)
    .run();
  // Revoked Program Leader grant — must not count as active.
  await testDb()
    .prepare(
      `INSERT INTO program_leaders (program_id, user_id, granted_by, granted_at, revoked_by, revoked_at)
       VALUES ('PROG-GRANT', 'U-GRANT-4', 'U-GRANT-4', ?, 'U-GRANT-4', ?)`
    )
    .bind(now, now)
    .run();
});

describe(hasActiveManagementGrant, () => {
  test("true for an active Program Leader grant", async () => {
    await expect(
      hasActiveManagementGrant(testDb(), "U-GRANT-1")
    ).resolves.toBeTruthy();
  });

  test("true for an active Department Manager grant", async () => {
    await expect(
      hasActiveManagementGrant(testDb(), "U-GRANT-2")
    ).resolves.toBeTruthy();
  });

  test("false for an account with neither grant", async () => {
    await expect(
      hasActiveManagementGrant(testDb(), "U-GRANT-3")
    ).resolves.toBeFalsy();
  });

  test("false once the only grant is revoked", async () => {
    await expect(
      hasActiveManagementGrant(testDb(), "U-GRANT-4")
    ).resolves.toBeFalsy();
  });

  test("false for an unknown user id", async () => {
    await expect(
      hasActiveManagementGrant(testDb(), "U-NO-SUCH-USER")
    ).resolves.toBeFalsy();
  });
});
