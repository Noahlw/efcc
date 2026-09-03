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
import type { ProgramAccess } from "./program-resolver";

export interface AuthorizationContext {
  actorUserId: string;
}

export interface CapabilityAuthorizer {
  can: (
    ctx: AuthorizationContext,
    capability: Capability,
    scope: { departmentId?: string; programId?: string } | null
  ) => Promise<boolean>;
  programCapabilities?: (
    ctx: AuthorizationContext,
    programId: string,
    departmentId?: string
  ) => Promise<Record<string, boolean>>;
  departmentCapabilities?: (
    ctx: AuthorizationContext,
    departmentId: string
  ) => Promise<Record<string, boolean>>;
}

export class D1CapabilityAuthorizer implements CapabilityAuthorizer {
  readonly db: D1Database;
  /**
   * A management projection asks for several capabilities for one Program at
   * once. Share only the in-flight resolver request; completed decisions are
   * never cached, so a later call in the same request still recomputes from
   * D1 after any preceding mutation.
   */
  private readonly programAccessInFlight = new Map<
    string,
    Promise<ProgramAccess | null>
  >();
  private readonly actorCapabilitiesInFlight = new Map<
    string,
    Promise<Record<string, boolean>>
  >();

  constructor(db: D1Database) {
    this.db = db;
  }

  private programAccessFor(
    ctx: AuthorizationContext,
    programId: string
  ): Promise<ProgramAccess | null> {
    const key = `${ctx.actorUserId}\u0000${programId}`;
    const existing = this.programAccessInFlight.get(key);
    if (existing) {
      return existing;
    }
    const pending = resolveProgramAccess(this.db, ctx.actorUserId, programId);
    this.programAccessInFlight.set(key, pending);
    const clear = () => {
      if (this.programAccessInFlight.get(key) === pending) {
        this.programAccessInFlight.delete(key);
      }
    };
    void pending.then(clear, clear);
    return pending;
  }
  private actorCapabilitiesFor(
    ctx: AuthorizationContext,
    scope: { departmentId?: string; programId?: string } | null
  ): Promise<Record<string, boolean>> {
    const scopeKey = scope
      ? `${scope.departmentId ?? ""}:${scope.programId ?? ""}`
      : "*";
    const key = `${ctx.actorUserId}\u0000${scopeKey}`;
    const existing = this.actorCapabilitiesInFlight.get(key);
    if (existing) {
      return existing;
    }
    const pending = resolveActorCapabilities(this.db, ctx.actorUserId, scope);
    this.actorCapabilitiesInFlight.set(key, pending);
    const clear = () => {
      if (this.actorCapabilitiesInFlight.get(key) === pending) {
        this.actorCapabilitiesInFlight.delete(key);
      }
    };
    void pending.then(clear, clear);
    return pending;
  }

  async programCapabilities(
    ctx: AuthorizationContext,
    programId: string,
    departmentId?: string
  ): Promise<Record<string, boolean>> {
    if (!ctx.actorUserId) {
      return {};
    }
    const access = await this.programAccessFor(ctx, programId);
    if (!access || (departmentId && access.departmentId !== departmentId)) {
      return {};
    }
    return access.capabilities;
  }

  async departmentCapabilities(
    ctx: AuthorizationContext,
    departmentId: string
  ): Promise<Record<string, boolean>> {
    if (!ctx.actorUserId) {
      return {};
    }
    return this.actorCapabilitiesFor(ctx, { departmentId });
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
      const access = await this.programAccessFor(ctx, scope.programId);
      if (
        !access ||
        (scope.departmentId && access.departmentId !== scope.departmentId)
      ) {
        return false;
      }
      return access.capabilities[capability] === true;
    }
    const capabilities = await this.actorCapabilitiesFor(ctx, scope);
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
