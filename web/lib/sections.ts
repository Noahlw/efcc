import type { Section } from "@/lib/api";

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
      label: "個人資料",
      capability: "READ",
      requiresServerAuth: false,
    },
    {
      key: "programs",
      label: "課程",
      capability: "READ",
      requiresServerAuth: false,
    },
    {
      key: "events",
      label: "聚會",
      capability: "READ",
      requiresServerAuth: false,
    },
    {
      key: "scanner",
      label: "掃描",
      capability: "AUTH",
      requiresServerAuth: false,
    },
    {
      key: "care",
      label: "關懷",
      capability: "AUTH",
      requiresServerAuth: false,
    },
    {
      key: "permissions",
      label: "權限管理",
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
