import type { Section } from "@/lib/api";
import { COPY } from "@/lib/copy";

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
