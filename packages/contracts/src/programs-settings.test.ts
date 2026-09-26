import assert from "node:assert/strict";

import { describe, test } from "vitest";

import {
  DepartmentCreateResponseSchema,
  DepartmentModuleRowSchema,
  DepartmentRowSchema,
  ManagementProgramSettingsViewSchema,
  ProgramCreateResponseSchema,
  ProgramRowSchema,
  ProgramUpdateResponseSchema,
  SetModuleResponseSchema,
  parseProgramFields,
} from "./programs-settings";

describe("parseProgramFields parity", () => {
  test("accepts known valid fields and enforces required keys", () => {
    assert.deepStrictEqual(
      parseProgramFields(
        { name: "  門徒課  ", behavior_type: "Recurring", lifecycle: "Active" },
        ["name", "behavior_type", "lifecycle"]
      ),
      { name: "門徒課", behavior_type: "Recurring", lifecycle: "Active" }
    );
    assert.strictEqual(
      parseProgramFields({ name: "x" }, ["name", "lifecycle"]),
      null
    );
  });
  test("rejects unknown keys and invalid values", () => {
    assert.strictEqual(
      parseProgramFields({ name: "x", nickname: "y" }, ["name"]),
      null
    );
    assert.strictEqual(
      parseProgramFields({ name: "  ", lifecycle: "Active" }, ["name"]),
      null
    );
    assert.strictEqual(
      parseProgramFields(
        { name: "x", behavior_type: "Sometimes", lifecycle: "Active" },
        ["name"]
      ),
      null
    );
    assert.strictEqual(
      parseProgramFields({ name: "x", display_order: -1 }, ["name"]),
      null
    );
    assert.strictEqual(
      parseProgramFields(
        {
          name: "x",
          description: null,
          category: null,
          display_order: 2,
          check_in_opens_at_minutes_before_start: 10,
          check_in_closes_at_minutes_after_end: 5,
        },
        ["name"]
      ) !== null,
      true
    );
  });
});

describe("settings response schemas", () => {
  const department = {
    department_id: "d",
    code: "T073",
    name: "培育部",
    description: null,
    lifecycle: "Active",
    display_order: 1,
    created_by: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_by: null,
    updated_at: "2026-09-01T00:00:00.000Z",
  };
  test("department create/update responses", () => {
    assert.strictEqual(
      DepartmentCreateResponseSchema.safeParse({ department }).success,
      true
    );
    assert.strictEqual(
      DepartmentRowSchema.safeParse({ ...department, code: "" }).success,
      false
    );
  });
  test("program create/update responses", () => {
    const row = {
      program_id: "p",
      department_id: "d",
      name: "n",
      description: "desc",
      category: null,
      behavior_type: "Recurring",
      lifecycle: "Active",
      discoverability: "Listed",
      enrollment_mode: "MemberRequest",
      display_order: 0,
      created_by: null,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_by: null,
      updated_at: "2026-09-01T00:00:00.000Z",
      check_in_token: null,
      check_in_opens_at_minutes_before_start: 30,
      check_in_closes_at_minutes_after_end: 15,
    };
    assert.strictEqual(
      ProgramCreateResponseSchema.safeParse({ program: row }).success,
      true
    );
    assert.strictEqual(ProgramRowSchema.safeParse(row).success, true);
    assert.strictEqual(
      ProgramUpdateResponseSchema.safeParse({
        program: {
          ...row,
          capabilities: {
            manage: true,
            publish: false,
            enroll: false,
            leader_assign: false,
          },
        },
      }).success,
      true
    );
    assert.strictEqual(
      ProgramUpdateResponseSchema.safeParse({ program: row }).success,
      false
    );
  });
  test("set-module response", () => {
    assert.strictEqual(
      SetModuleResponseSchema.safeParse({
        module: {
          department_id: "d",
          module_key: "attendance",
          enabled: 1,
          enabled_by: null,
          enabled_at: "2026-09-01T00:00:00.000Z",
        },
      }).success,
      true
    );
    assert.strictEqual(
      DepartmentModuleRowSchema.safeParse({
        department_id: "d",
        module_key: "bogus",
        enabled: 1,
        enabled_by: null,
        enabled_at: "2026-09-01T00:00:00.000Z",
      }).success,
      false
    );
  });
});
