import { hasDepartmentManagementScope } from "@/lib/programs/capabilities";
import type { Department, Program } from "@/lib/programs/program-api";

export interface ProgramsManagementAccess {
  hasManagementCapability: boolean;
  departmentScopes: number;
  programScopes: number;
}

/**
 * Project the management entry from server-filtered scope fields only.
 * `program.enroll` is intentionally participant access, not management access.
 */
export function projectManagementAccess(
  departments: readonly Department[],
  programsByDepartment: readonly (readonly Program[])[]
): ProgramsManagementAccess {
  const departmentScopes = departments.filter(
    hasDepartmentManagementScope
  ).length;
  const programScopes = programsByDepartment
    .flat()
    .filter(
      ({ capabilities }) =>
        capabilities.manage ||
        capabilities.publish ||
        capabilities.leader_assign
    ).length;

  return {
    hasManagementCapability: departmentScopes > 0 || programScopes > 0,
    departmentScopes,
    programScopes,
  };
}
