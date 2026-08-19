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
const ROLE_SECTION_KEYS: Record<string, Section["key"][]> = {
  Member: ["home", "programs", "scanner", "notices", "profile"],
  Staff: ["home", "programs", "scanner", "management", "profile"],
  Admin: ["home", "programs", "scanner", "management", "profile"],
};

function materializeSections(keys: Section["key"][]): Section[] {
  const sections = defaultSections();
  return keys.flatMap((key) => {
    const section = sections.find((candidate) => candidate.key === key);
    return section ? [section] : [];
  });
}

/** Server-projected stable nav metadata consumed verbatim by the shell. */
export function stableNavigationSections(
  role = "Member",
  hasManagementGrant = false
): Section[] {
  const isManagement =
    role === "Admin" || role === "Staff" || hasManagementGrant;
  const keys: Section["key"][] = isManagement
    ? ["home", "programs", "scanner", "management", "profile"]
    : ["home", "programs", "scanner", "notices", "profile"];
  return materializeSections(keys);
}

/**
 * Sections authorized for a role. Unknown or absent roles use the stable
 * Member-safe base (Home, Programs, Scanner, Notices, Profile).
 */
export function sectionsForRole(
  role: string,
  hasManagementGrant = false
): Section[] {
  const allowed = Object.hasOwn(ROLE_SECTION_KEYS, role)
    ? ROLE_SECTION_KEYS[role]
    : undefined;
  const keys = allowed ?? ROLE_SECTION_KEYS.Member;
  if (hasManagementGrant && !keys.includes("management")) {
    const next = [...keys];
    const noticesIdx = next.indexOf("notices");
    if (noticesIdx !== -1) {
      next.splice(noticesIdx, 1, "management");
    } else {
      next.push("management");
    }
    return materializeSections(next);
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
      key: "notices",
      label: COPY.sections.notices,
      capability: "READ",
      requiresServerAuth: false,
    },
    {
      key: "management",
      label: COPY.sections.management,
      capability: "AUTH",
      requiresServerAuth: false,
    },
    {
      key: "permissions",
      label: COPY.sections.permissions,
      capability: "AUTH",
      requiresServerAuth: false,
    },
    {
      key: "profile",
      label: COPY.sections.profile,
      capability: "READ",
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
