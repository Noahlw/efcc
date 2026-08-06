/**
 * EFCC Programs domain — capability vocabulary (PRG-01 #197).
 *
 * Capabilities are coarse-grained domain verbs. The authorization seam
 * (capability-authorizer.ts) resolves whether an actor's effective policy
 * grants a capability for a given scope. No capability is implied by another;
 * the domain module composes them when an operation needs multiple powers.
 */

export const DEPARTMENT_CAPABILITY = {
  MANAGE: "department.manage",
  PUBLISH: "department.publish",
  MODULE_CONFIGURE: "department.module.configure",
} as const;

export const PROGRAM_CAPABILITY = {
  MANAGE: "program.manage",
  PUBLISH: "program.publish",
  ENROLL: "program.enroll",
  LEADER_ASSIGN: "program.leader.assign",
} as const;

export const CAPABILITY = {
  DEPARTMENT_MANAGE: DEPARTMENT_CAPABILITY.MANAGE,
  DEPARTMENT_PUBLISH: DEPARTMENT_CAPABILITY.PUBLISH,
  DEPARTMENT_MODULE_CONFIGURE: DEPARTMENT_CAPABILITY.MODULE_CONFIGURE,
  PROGRAM_MANAGE: PROGRAM_CAPABILITY.MANAGE,
  PROGRAM_PUBLISH: PROGRAM_CAPABILITY.PUBLISH,
  PROGRAM_ENROLL: PROGRAM_CAPABILITY.ENROLL,
  PROGRAM_LEADER_ASSIGN: PROGRAM_CAPABILITY.LEADER_ASSIGN,
} as const;

export type Capability = (typeof CAPABILITY)[keyof typeof CAPABILITY];

/** Approved product modules that may be enabled per Department. */
export const MODULE_KEY = {
  PROGRAM_CATALOG: "program_catalog",
  ENROLLMENT: "enrollment",
  EVENTS: "events",
  ATTENDANCE: "attendance",
  CUSTOM_FORMS: "custom_forms",
} as const;

export type ModuleKey = (typeof MODULE_KEY)[keyof typeof MODULE_KEY];

export const MODULE_KEYS: ModuleKey[] = Object.values(MODULE_KEY);

/** Default global role policies seeded on first migration/application boot.
 *  Admin owns everything. Staff manages programs and enrollments but cannot
 *  edit global authorization policy. Member is read-only on listed catalogues.
 *  Program-scoped grants are stored in program_leaders and layered on top. */
export const DEFAULT_ROLE_POLICIES: Record<
  string,
  { capability: Capability; granted_at: string }[]
> = {
  Admin: [
    {
      capability: CAPABILITY.DEPARTMENT_MANAGE,
      granted_at: "2026-08-06T00:00:00Z",
    },
    {
      capability: CAPABILITY.DEPARTMENT_PUBLISH,
      granted_at: "2026-08-06T00:00:00Z",
    },
    {
      capability: CAPABILITY.DEPARTMENT_MODULE_CONFIGURE,
      granted_at: "2026-08-06T00:00:00Z",
    },
    {
      capability: CAPABILITY.PROGRAM_MANAGE,
      granted_at: "2026-08-06T00:00:00Z",
    },
    {
      capability: CAPABILITY.PROGRAM_PUBLISH,
      granted_at: "2026-08-06T00:00:00Z",
    },
    {
      capability: CAPABILITY.PROGRAM_LEADER_ASSIGN,
      granted_at: "2026-08-06T00:00:00Z",
    },
  ],
  Staff: [
    {
      capability: CAPABILITY.DEPARTMENT_MANAGE,
      granted_at: "2026-08-06T00:00:00Z",
    },
    {
      capability: CAPABILITY.DEPARTMENT_PUBLISH,
      granted_at: "2026-08-06T00:00:00Z",
    },
    {
      capability: CAPABILITY.DEPARTMENT_MODULE_CONFIGURE,
      granted_at: "2026-08-06T00:00:00Z",
    },
    {
      capability: CAPABILITY.PROGRAM_MANAGE,
      granted_at: "2026-08-06T00:00:00Z",
    },
    {
      capability: CAPABILITY.PROGRAM_PUBLISH,
      granted_at: "2026-08-06T00:00:00Z",
    },
    {
      capability: CAPABILITY.PROGRAM_LEADER_ASSIGN,
      granted_at: "2026-08-06T00:00:00Z",
    },
  ],
  Member: [
    {
      capability: CAPABILITY.PROGRAM_ENROLL,
      granted_at: "2026-08-06T00:00:00Z",
    },
  ],
};
