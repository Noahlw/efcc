/**
 * EFCC Programs domain — authorization seam (CapabilityAuthorizer).
 *
 * Every protected operation resolves the actor's effective global-role policy and
 * Department/Program scope through this interface. Browser visibility is never
 * authority.
 */

import type { Capability } from "./capabilities";
import { CAPABILITY } from "./capabilities";

export interface AuthorizationContext {
  actorUserId: string;
  actorRole: string;
}

/**
 * Program-scoped leadership (program_leaders) grants only operational
 * capabilities for that program — never delegation/administration powers.
 * ADR-0006: grant/revoke Program Leader is Admin/Staff only.
 */
const LEADERSHIP_CAPABILITIES: Partial<Record<Capability, true>> = {
  [CAPABILITY.PROGRAM_MANAGE]: true,
  [CAPABILITY.PROGRAM_PUBLISH]: true,
};
const DEPARTMENT_CAPABILITIES: Partial<Record<Capability, true>> = {
  [CAPABILITY.DEPARTMENT_MANAGE]: true,
  [CAPABILITY.DEPARTMENT_PUBLISH]: true,
  [CAPABILITY.DEPARTMENT_MODULE_CONFIGURE]: true,
};
const DEPARTMENT_PROGRAM_CAPABILITIES: Partial<Record<Capability, true>> = {
  [CAPABILITY.PROGRAM_MANAGE]: true,
  [CAPABILITY.PROGRAM_PUBLISH]: true,
  [CAPABILITY.PROGRAM_LEADER_ASSIGN]: true,
};

export interface CapabilityAuthorizer {
  can: (
    ctx: AuthorizationContext,
    capability: Capability,
    scope: { departmentId?: string; programId?: string } | null
  ) => Promise<boolean>;
}

export interface RolePolicyStore {
  hasCapability: (role: string, capability: Capability) => Promise<boolean>;
  hasProgramLeadership: (userId: string, programId: string) => Promise<boolean>;
  hasDepartmentManagement: (
    userId: string,
    departmentId: string
  ) => Promise<boolean>;
}

export class D1CapabilityAuthorizer implements CapabilityAuthorizer {
  readonly store: RolePolicyStore;

  constructor(store: RolePolicyStore) {
    this.store = store;
  }

  async can(
    ctx: AuthorizationContext,
    capability: Capability,
    scope: { departmentId?: string; programId?: string } | null
  ): Promise<boolean> {
    if (await this.store.hasCapability(ctx.actorRole, capability)) {
      return true;
    }
    const departmentCapability =
      DEPARTMENT_CAPABILITIES[capability] === true ||
      (DEPARTMENT_PROGRAM_CAPABILITIES[capability] === true &&
        (capability !== CAPABILITY.PROGRAM_LEADER_ASSIGN ||
          Boolean(scope?.programId)));
    if (
      scope?.departmentId &&
      departmentCapability &&
      (await this.store.hasDepartmentManagement(
        ctx.actorUserId,
        scope.departmentId
      ))
    ) {
      return true;
    }
    if (
      LEADERSHIP_CAPABILITIES[capability] === true &&
      scope?.programId &&
      (await this.store.hasProgramLeadership(ctx.actorUserId, scope.programId))
    ) {
      return true;
    }
    return false;
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class AuthorizationDeniedError extends Error {
  constructor(capability: Capability) {
    super(`Capability denied: ${capability}`);
    this.name = "AuthorizationDeniedError";
  }
}
