/**
 * Programs authorization adapter over the normalized identity kernel.
 *
 * The adapter deliberately owns no policy data. Every decision is recomputed
 * from D1 through the identity resolver, including exact Department/Program
 * scope checks.
 */

import type { Capability } from "../identity/capability-catalog";
import { resolveActorCapabilities } from "../identity/role-hierarchy";
import { resolveProgramAccess } from "./program-resolver";

export interface AuthorizationContext {
  actorUserId: string;
}

export interface CapabilityAuthorizer {
  can: (
    ctx: AuthorizationContext,
    capability: Capability,
    scope: { departmentId?: string; programId?: string } | null
  ) => Promise<boolean>;
}

export class D1CapabilityAuthorizer implements CapabilityAuthorizer {
  readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async can(
    ctx: AuthorizationContext,
    capability: Capability,
    scope: { departmentId?: string; programId?: string } | null
  ): Promise<boolean> {
    if (!ctx.actorUserId) {
      return false;
    }
    if (scope?.programId) {
      const access = await resolveProgramAccess(
        this.db,
        ctx.actorUserId,
        scope.programId
      );
      if (
        !access ||
        (scope.departmentId && access.departmentId !== scope.departmentId)
      ) {
        return false;
      }
      return access.capabilities[capability] === true;
    }
    const capabilities = await resolveActorCapabilities(
      this.db,
      ctx.actorUserId,
      scope
    );
    return capabilities[capability] === true;
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class AuthorizationDeniedError extends Error {
  constructor(capability: Capability) {
    super(`Capability denied: ${capability}`);
    this.name = "AuthorizationDeniedError";
  }
}
