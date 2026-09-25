/**
 * Department/Program settings mutation contracts (spec #646, ticket #657).
 *
 * Source-derived from `apps/web/lib/programs/program-handlers.ts`
 * (create/update department, create/update program, set module) and
 * `workspace-store.ts` row shapes. Validators never transform.
 * Unknown-key policy differs per endpoint and is mirrored exactly:
 * create/update program REJECT unknown fields; update department
 * IGNORES them.
 */
import * as z from "zod";

import { nonEmptyString, nullableString } from "./primitives";
import {
  DepartmentLifecycleSchema,
  ProgramBehaviorTypeSchema,
  ProgramDiscoverabilitySchema,
  ProgramEnrollmentModeSchema,
} from "./programs-reads";

export const DepartmentRowSchema = z.object({
  department_id: nonEmptyString,
  code: nonEmptyString,
  name: z.string(),
  description: nullableString,
  lifecycle: DepartmentLifecycleSchema,
  display_order: z.number(),
  created_by: nullableString,
  created_at: nonEmptyString,
  updated_by: nullableString,
  updated_at: nonEmptyString,
});

export const ProgramRowSchema = z.object({
  program_id: nonEmptyString,
  department_id: nonEmptyString,
  name: z.string(),
  description: nullableString,
  category: nullableString,
  behavior_type: ProgramBehaviorTypeSchema,
  lifecycle: z.enum(["Draft", "Active", "Archived"]),
  discoverability: ProgramDiscoverabilitySchema,
  enrollment_mode: ProgramEnrollmentModeSchema,
  display_order: z.number(),
  created_by: nullableString,
  created_at: nonEmptyString,
  updated_by: nullableString,
  updated_at: nonEmptyString,
  check_in_token: nullableString,
  check_in_opens_at_minutes_before_start: z.number(),
  check_in_closes_at_minutes_after_end: z.number(),
});

export const ManagementProgramSettingsViewSchema = z.object({
  program_id: nonEmptyString,
  department_id: nonEmptyString,
  name: z.string(),
  description: nullableString,
  category: nullableString,
  behavior_type: ProgramBehaviorTypeSchema,
  lifecycle: z.enum(["Draft", "Active", "Archived"]),
  discoverability: ProgramDiscoverabilitySchema,
  enrollment_mode: ProgramEnrollmentModeSchema,
  display_order: z.number(),
  created_at: nonEmptyString,
  updated_at: nonEmptyString,
  capabilities: z.object({
    manage: z.boolean(),
    publish: z.boolean(),
    enroll: z.boolean(),
    leader_assign: z.boolean(),
    role_read: z.boolean().optional(),
    role_assign: z.boolean().optional(),
    role_revoke: z.boolean().optional(),
  }),
  check_in_opens_at_minutes_before_start: z.number().optional(),
  check_in_closes_at_minutes_after_end: z.number().optional(),
});

export const DepartmentModuleRowSchema = z.object({
  department_id: nonEmptyString,
  module_key: z.enum([
    "program_catalog",
    "enrollment",
    "events",
    "attendance",
    "custom_forms",
  ]),
  enabled: z.number(),
  enabled_by: nullableString,
  enabled_at: nonEmptyString,
});

export const DepartmentCreateResponseSchema = z.object({
  department: DepartmentRowSchema,
});
export const DepartmentUpdateResponseSchema = z.object({
  department: DepartmentRowSchema,
});
export const ProgramCreateResponseSchema = z.object({
  program: ProgramRowSchema,
});
export const ProgramUpdateResponseSchema = z.object({
  program: ManagementProgramSettingsViewSchema,
});
export const SetModuleResponseSchema = z.object({
  module: DepartmentModuleRowSchema,
});

/**
 * Exact port of the handler `parseProgramFields`: every entry of a
 * non-null object body must have a known parser and a valid value, and
 * all `required` keys must be present. Unknown keys fail the parse.
 * Validators never transform — the parsed output carries the same
 * trimmed/coerced values the handler forwards today.
 */
const INVALID = Symbol("invalid program value");

function parseName(value: unknown): unknown {
  return typeof value === "string" && value.trim() ? value.trim() : INVALID;
}

function parseNonNegativeInt(value: unknown): unknown {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : INVALID;
}

const PROGRAM_FIELD_PARSERS: Record<string, (value: unknown) => unknown> = {
  name: parseName,
  description: (value) =>
    value === null || typeof value === "string" ? value : INVALID,
  category: (value) =>
    typeof value === "string" && value.trim()
      ? value.trim()
      : value === null
        ? null
        : INVALID,
  behavior_type: (value) =>
    ProgramBehaviorTypeSchema.safeParse(value).success ? value : INVALID,
  lifecycle: (value) =>
    z.enum(["Draft", "Active", "Archived"]).safeParse(value).success
      ? value
      : INVALID,
  discoverability: (value) =>
    ProgramDiscoverabilitySchema.safeParse(value).success ? value : INVALID,
  enrollment_mode: (value) =>
    ProgramEnrollmentModeSchema.safeParse(value).success ? value : INVALID,
  display_order: parseNonNegativeInt,
  check_in_opens_at_minutes_before_start: parseNonNegativeInt,
  check_in_closes_at_minutes_after_end: parseNonNegativeInt,
};

export function parseProgramFields(
  body: Record<string, unknown>,
  required: readonly string[]
): Record<string, unknown> | null {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    const parser = PROGRAM_FIELD_PARSERS[key];
    if (!parser) {
      return null;
    }
    const parsed = parser(value);
    if (parsed === INVALID) {
      return null;
    }
    fields[key] = parsed;
  }
  return required.every((key) => key in fields) ? fields : null;
}
