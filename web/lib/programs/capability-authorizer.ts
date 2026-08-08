/**
 * EFCC Programs domain — authorization seam (CapabilityAuthorizer).
 *
 * Every protected operation resolves the actor's effective global-role policy and
 * Department/Program scope through this interface. Browser visibility is never
 * authority.
 */

import type { Capability } from "./capabilities";

export interface AuthorizationContext {
  actorUserId: string;
  actorRole: string;
}

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
    if (
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
