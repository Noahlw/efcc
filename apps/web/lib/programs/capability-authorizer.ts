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
}

export class D1CapabilityAuthorizer implements CapabilityAuthorizer {
  readonly db: D1Database;
  // getModule creates an authorizer per Worker request. Reuse the complete
  // scope projection across capability checks without caching across requests.
  private readonly actorCapabilities = new Map<
    string,
    Promise<Awaited<ReturnType<typeof resolveActorCapabilities>>>
  >();
  private readonly programAccess = new Map<
    string,
    Promise<ProgramAccess | null>
  >();

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
      const programId = scope.programId;
      const key = `${ctx.actorUserId}\0${programId}`;
      const access = await this.memoize(this.programAccess, key, () =>
        resolveProgramAccess(this.db, ctx.actorUserId, programId)
      );
      if (
        !access ||
        (scope.departmentId && access.departmentId !== scope.departmentId)
      ) {
        return false;
      }
      return access.capabilities[capability] === true;
    }
    const scopeKey =
      scope === null
        ? "global"
        : scope?.departmentId
          ? `department:${scope.departmentId}`
          : "unscoped";
    const key = `${ctx.actorUserId}\0${scopeKey}`;
    const capabilities = await this.memoize(this.actorCapabilities, key, () =>
      resolveActorCapabilities(this.db, ctx.actorUserId, scope)
    );
    return capabilities[capability] === true;
  }

  private memoize<T>(
    cache: Map<string, Promise<T>>,
    key: string,
    resolve: () => Promise<T>
  ): Promise<T> {
    let pending = cache.get(key);
    if (!pending) {
      pending = resolve();
      cache.set(key, pending);
      void pending.catch(() => {
        if (cache.get(key) === pending) {
          cache.delete(key);
        }
      });
    }
    return pending;
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file
export class AuthorizationDeniedError extends Error {
  constructor(capability: Capability) {
    super(`Capability denied: ${capability}`);
    this.name = "AuthorizationDeniedError";
  }
}
