import type { Section } from "@/lib/api";
import { COPY } from "@/lib/copy";

/**
 * Stable authenticated navigation destinations (Issue #241/#242).
 *
 * Navigation is a server-shaped presentation projection, not section
 * authorization. Events remains a stable destination for every role; most
 * Member accounts receive no Events authorization in `sections[]` by
 * default, except a Member holding an active Program Leader or Department
 * Manager grant (`sectionsForRole`'s `hasManagementGrant` parameter, #215
 * ATT-03).
 */
const STABLE_NAVIGATION_KEYS: Section["key"][] = [
  "home",
  "programs",
  "events",
  "scanner",
  "profile",
];

/**
 * Server-authorized section projection.
 *
 * Home is a safe authenticated shell placeholder for every account. Events,
 * Scanner, Care, and Permissions remain capability/role-authorized sections;
 * the browser must not infer those permissions from the profile role.
 */
const ROLE_SECTION_KEYS: Record<string, Section["key"][]> = {
  Member: ["home", "profile", "programs"],
  Staff: ["home", "profile", "programs", "events", "scanner", "care", "permissions"],
  Admin: ["home", "profile", "programs", "events", "scanner", "care", "permissions"],
};

function materializeSections(keys: Section["key"][]): Section[] {
  const sections = defaultSections();
  return keys.flatMap((key) => {
    const section = sections.find((candidate) => candidate.key === key);
    return section ? [section] : [];
  });
}

/** Server-projected stable nav metadata consumed verbatim by the shell. */
export function stableNavigationSections(): Section[] {
  return materializeSections(STABLE_NAVIGATION_KEYS);
}

/**
 * Sections authorized for a role. Unknown or absent roles use the stable
 * Member-safe base (Home, Profile, Programs).
 *
 * `hasManagementGrant` (#215 ATT-03) additionally authorizes `events` for a
 * Member who holds an active Program Leader or Department Manager grant —
 * roles that already include `events` (Staff/Admin) ignore the flag. The
 * caller is expected to resolve this only for Member accounts; it is never
 * inferred here from the role string.
 */
export function sectionsForRole(
  role: string,
  hasManagementGrant = false
): Section[] {
  // hasOwn keeps inherited Object keys such as "constructor" and "toString"
  // from becoming role projections; unknown values use the Member-safe set.
  const allowed = Object.hasOwn(ROLE_SECTION_KEYS, role)
    ? ROLE_SECTION_KEYS[role]
    : undefined;
  const keys = allowed ?? ROLE_SECTION_KEYS.Member;
  if (hasManagementGrant && !keys.includes("events")) {
    return materializeSections([...keys, "events"]);
  }
  return materializeSections(keys);
}

/**
 * Canonical section catalog used to materialize the server projection.
 *
 * Visibility and order come from `sectionsForRole`; this catalog only owns
 * stable labels and capability metadata.
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
      key: "home",
      label: COPY.sections.home,
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
  // The stable shell presents Home first, but Profile remains the deterministic
  // login/recovery destination for every non-empty projection.
  return sections.find((section) => section.key === "profile")?.key ??
    sections[0]?.key ??
    "profile";
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
