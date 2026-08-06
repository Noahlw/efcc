import type { Section } from "@/lib/api";
import { COPY } from "@/lib/copy";

/**
 * Role → Section authorization matrix (ADR-0005/0006/067).
 *
 * Derived from the ADRs, not from 079: a Member sees profile + programs;
 * Staff adds events, scanner, care; Admin sees all six. The map holds the
 * section keys, and `sectionsForRole` filters `defaultSections()` so the
 * canonical shell baseline (labels, ordering, capability) stays the single
 * source of truth.
 */
const ROLE_SECTION_KEYS: Record<string, Section["key"][]> = {
  // Canonical ADR-0025 values (title-case): D1 stores and the API expose
  // Admin / Staff / Member — NOT uppercase. Uppercase keys here silently
  // fell back to the Member set for every Staff/Admin account.
  Member: ["profile", "programs"],
  // Staff reads permissions data (067-follow-up §2: STAFF ->
  // api_getPermissionsData success; role-matrix.test.ts bob set).
  Staff: [
    "profile",
    "programs",
    "events",
    "scanner",
    "care",
    "permissions",
  ],
  Admin: [
    "profile",
    "programs",
    "events",
    "scanner",
    "care",
    "permissions",
  ],
};

/**
 * Sections authorized for a role. Unknown or absent roles fall back to the
 * Member set (profile + programs) — the least-privilege default.
 */
export function sectionsForRole(role: string): Section[] {
  const allowed = ROLE_SECTION_KEYS[role];
  const keys = allowed ?? ROLE_SECTION_KEYS.Member;
  return defaultSections().filter((s) => keys.includes(s.key));
}

/**
 * Shell section baseline shown to any authenticated user.
 *
 * ponytail: this is a temporary client-side stand-in until CF0-04 (#145)
 * ships server-authoritative Section visibility from the bootstrap's
 * `sections[]`. The client never hardcodes a role→Section map here (Spec
 * 074 user story 13); every section is listed with `requiresServerAuth:
 * false` so the shell renders after the cookie-boundary login, and the
 * per-section authorization gate is deferred to CF0-04.
 */
export function defaultSections(): Section[] {
  return [
    {
      key: "profile",
      label: COPY.sections.profile,
      capability: "READ",
      requiresServerAuth: false,
    },
    {
      key: "programs",
      label: COPY.sections.programs,
      capability: "READ",
      requiresServerAuth: false,
    },
    {
      key: "events",
      label: COPY.sections.events,
      capability: "READ",
      requiresServerAuth: false,
    },
    {
      key: "scanner",
      label: COPY.sections.scanner,
      capability: "AUTH",
      requiresServerAuth: false,
    },
    {
      key: "care",
      label: COPY.sections.care,
      capability: "AUTH",
      requiresServerAuth: false,
    },
    {
      key: "permissions",
      label: COPY.sections.permissions,
      capability: "AUTH",
      requiresServerAuth: false,
    },
  ];
}

export function firstSection(sections: Section[]): string {
  return sections.length > 0 ? sections[0].key : "profile";
}

export function isPermitted(sections: Section[], key: string): boolean {
  return sections.some((s) => s.key === key);
}

export function getSection(
  sections: Section[],
  key: string
): Section | undefined {
  return sections.find((s) => s.key === key);
}

export function recoverySection(sections: Section[]): string {
  return firstSection(sections);
}
