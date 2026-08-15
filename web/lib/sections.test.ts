import { describe, test, expect } from "vitest";

import type { Section } from "./api";
import {
  defaultSections,
  firstSection,
  isPermitted,
  getSection,
  recoverySection,
  sectionsForRole,
  stableNavigationSections,
} from "./sections";

const profile: Section = {
  key: "profile",
  label: "個人資料",
  capability: "READ",
  requiresServerAuth: false,
};
const home: Section = {
  key: "home",
  label: "首頁",
  capability: "READ",
  requiresServerAuth: false,
};
const programs: Section = {
  key: "programs",
  label: "課程",
  capability: "READ",
  requiresServerAuth: false,
};
const events: Section = {
  key: "events",
  label: "聚會",
  capability: "READ",
  requiresServerAuth: false,
};
const scanner: Section = {
  key: "scanner",
  label: "掃描",
  capability: "AUTH",
  requiresServerAuth: true,
};
const care: Section = {
  key: "care",
  label: "關懷",
  capability: "AUTH",
  requiresServerAuth: true,
};
const permissions: Section = {
  key: "permissions",
  label: "權限管理",
  capability: "AUTH",
  requiresServerAuth: true,
};

const MEMBER_SECTIONS = [home, profile, programs];
const STAFF_SECTIONS = [...MEMBER_SECTIONS, events, scanner, care, permissions];

describe(firstSection, () => {
  test("returns first section key for MEMBER", () => {
    expect(firstSection(MEMBER_SECTIONS)).toBe("profile");
  });

  test("returns first section key for STAFF", () => {
    expect(firstSection(STAFF_SECTIONS)).toBe("profile");
  });

  test("falls back to 'profile' for empty list", () => {
    expect(firstSection([])).toBe("profile");
  });

  test("keeps Profile as the restore target when Home is first", () => {
    expect(firstSection(sectionsForRole("Member"))).toBe("profile");
  });
});

describe(isPermitted, () => {
  test("allows profile for MEMBER", () => {
    expect(isPermitted(MEMBER_SECTIONS, "profile")).toBeTruthy();
  });

  test("denies scanner for MEMBER", () => {
    expect(isPermitted(MEMBER_SECTIONS, "scanner")).toBeFalsy();
  });

  test("allows scanner for STAFF", () => {
    expect(isPermitted(STAFF_SECTIONS, "scanner")).toBeTruthy();
  });

  test("denies permissions for MEMBER", () => {
    expect(isPermitted(MEMBER_SECTIONS, "permissions")).toBeFalsy();
  });
});

describe(getSection, () => {
  test("finds profile", () => {
    expect(getSection(MEMBER_SECTIONS, "profile")).toStrictEqual(profile);
  });

  test("returns undefined for unknown key", () => {
    expect(getSection(MEMBER_SECTIONS, "unknown")).toBeUndefined();
  });
});

describe(recoverySection, () => {
  test("returns first section for MEMBER", () => {
    expect(recoverySection(MEMBER_SECTIONS)).toBe("profile");
  });
});

describe(defaultSections, () => {
  test("returns the canonical section catalog with profile first", () => {
    const sections = defaultSections();
    expect(sections.map((s) => s.key)).toStrictEqual([
      "profile",
      "home",
      "programs",
      "events",
      "scanner",
      "care",
      "permissions",
      "management",
      "notices",
    ]);
    expect(firstSection(sections)).toBe("profile");
    expect(sections.every((s) => s.requiresServerAuth === false)).toBeTruthy();
  });
});

describe(stableNavigationSections, () => {
  test("projects the stable 5-slot navigation for Participant and Management", () => {
    expect(stableNavigationSections(false).map((s) => s.key)).toStrictEqual([
      "home",
      "programs",
      "scanner",
      "notices",
      "profile",
    ]);
    expect(stableNavigationSections(true).map((s) => s.key)).toStrictEqual([
      "home",
      "programs",
      "scanner",
      "management",
      "profile",
    ]);
  });
});

describe(sectionsForRole, () => {
  const memberKeys = ["home", "profile", "programs"];
  const staffKeys = [...memberKeys, "events", "scanner", "care", "permissions"];

  test("Member receives Home, Profile, and Programs only", () => {
    expect(sectionsForRole("Member").map((s) => s.key)).toStrictEqual(
      memberKeys
    );
  });

  test("unknown role falls back to the Member authorization set", () => {
    expect(sectionsForRole("UNKNOWN").map((s) => s.key)).toStrictEqual(
      memberKeys
    );
  });

  test("uppercase legacy spellings fall back to the Member authorization set", () => {
    expect(sectionsForRole("STAFF").map((s) => s.key)).toStrictEqual(
      memberKeys
    );
  });

  test("inherited Object keys fall back to the Member authorization set", () => {
    expect(sectionsForRole("toString").map((s) => s.key)).toStrictEqual(
      memberKeys
    );
    expect(sectionsForRole("constructor").map((s) => s.key)).toStrictEqual(
      memberKeys
    );
  });

  test("Member with an active management grant additionally receives Events (#215)", () => {
    expect(sectionsForRole("Member", true).map((s) => s.key)).toStrictEqual([
      ...memberKeys,
      "events",
    ]);
  });

  test("Member without a management grant still receives no Events (default false)", () => {
    expect(sectionsForRole("Member", false).map((s) => s.key)).toStrictEqual(
      memberKeys
    );
  });

  test("hasManagementGrant is a no-op for roles that already include Events", () => {
    expect(sectionsForRole("Staff", true).map((s) => s.key)).toStrictEqual(
      staffKeys
    );
  });
});
