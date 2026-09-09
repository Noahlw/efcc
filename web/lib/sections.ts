import type { Section } from "@/lib/api";
import { COPY } from "@/lib/copy";

const MANAGEMENT_CAPABILITIES = [
  "role.read",
  "role.assign",
  "role.revoke",
  "role.reorder",
  "role.name.write",
  "role.permissions.read",
  "role.permissions.write",
  "role.scope.read",
  "role.scope.write",
  "role.create",
  "role.delete",
  "department.manage",
  "department.publish",
  "department.module.configure",
  "department.manager.assign",
  "program.manage",
  "program.publish",
  "program.leader.assign",
  "account.permissions.read",
  "account.permissions.write",
  "account.directory.read",
  "registration.approval.manage",
  "home.publish",
] as const;

const EVENT_CAPABILITIES = [
  "department.manage",
  "department.module.configure",
  "program.manage",
  "program.leader.assign",
] as const;

function materializeSections(keys: readonly Section["key"][]): Section[] {
  const sections = defaultSections();
  return keys.flatMap((key) => {
    const section = sections.find((candidate) => candidate.key === key);
    return section ? [section] : [];
  });
}

function hasCapability(
  capabilities: Readonly<Record<string, boolean>>,
  keys: readonly string[]
): boolean {
  return keys.some((key) => capabilities[key] === true);
}

/** Project authorized sections without consulting account role strings. */
export function projectSections(
  capabilities: Readonly<Record<string, boolean>>
): Section[] {
  const management = hasCapability(capabilities, MANAGEMENT_CAPABILITIES);
  const events = hasCapability(capabilities, EVENT_CAPABILITIES);
  const keys: Section["key"][] = ["home", "programs", "scanner"];
  keys.push(management ? "management" : "notices", "profile");
  if (events) {
    keys.push("events");
  }
  return materializeSections(keys);
}

/** Project stable shell navigation from server-provided capabilities. */
export function projectNavigation(
  capabilities: Readonly<Record<string, boolean>>
): Section[] {
  const management = hasCapability(capabilities, MANAGEMENT_CAPABILITIES);
  return materializeSections(
    management
      ? ["home", "programs", "scanner", "management", "profile"]
      : ["home", "programs", "scanner", "notices", "profile"]
  );
}

/** Canonical section catalog used to materialize server projections. */
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
  return (
    sections.find((section) => section.key === "profile")?.key ??
    sections[0]?.key ??
    "profile"
  );
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
