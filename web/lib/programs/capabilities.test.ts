import assert from "node:assert/strict";

import { describe, test } from "vitest";

import {
  CAPABILITY,
  GLOBAL_ROLES,
  ROLE_CAPABILITY_DEFAULTS,
} from "./capabilities";

describe("S4 additive role capability policy", () => {
  test("keeps every global role on the Church Member participant baseline", () => {
    for (const role of GLOBAL_ROLES) {
      assert.ok(
        ROLE_CAPABILITY_DEFAULTS[role].includes(CAPABILITY.PROGRAM_ENROLL)
      );
    }
  });

  test("gives Staff normal Department and Program management authority", () => {
    const staff = ROLE_CAPABILITY_DEFAULTS.Staff;
    const expected = [
      CAPABILITY.DEPARTMENT_MANAGE,
      CAPABILITY.DEPARTMENT_PUBLISH,
      CAPABILITY.DEPARTMENT_MODULE_CONFIGURE,
      CAPABILITY.DEPARTMENT_MANAGER_ASSIGN,
      CAPABILITY.PROGRAM_MANAGE,
      CAPABILITY.PROGRAM_PUBLISH,
      CAPABILITY.PROGRAM_LEADER_ASSIGN,
      CAPABILITY.ACCOUNT_PERMISSIONS_READ,
      CAPABILITY.ACCOUNT_DIRECTORY_READ,
      CAPABILITY.REGISTRATION_APPROVAL_MANAGE,
      CAPABILITY.PROGRAM_ENROLL,
    ];
    assert.deepStrictEqual([...staff].sort(), [...expected].sort());
    assert.ok(!staff.includes(CAPABILITY.HOME_PUBLISH));
    assert.ok(!staff.includes(CAPABILITY.ACCOUNT_PERMISSIONS_WRITE));
  });

  test("keeps Admin-only authority explicit and complete", () => {
    const admin = ROLE_CAPABILITY_DEFAULTS.Admin;
    assert.ok(admin.includes(CAPABILITY.HOME_PUBLISH));
    assert.ok(admin.includes(CAPABILITY.ACCOUNT_PERMISSIONS_WRITE));
    assert.deepStrictEqual(admin, Object.values(CAPABILITY));
  });

  test("keeps Member limited to the shared participant baseline", () => {
    assert.deepStrictEqual(ROLE_CAPABILITY_DEFAULTS.Member, [
      CAPABILITY.PROGRAM_ENROLL,
    ]);
  });
});
