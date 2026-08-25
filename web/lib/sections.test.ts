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

const home: Section = {
  key: "home",
  label: "首頁",
  capability: "READ",
  requiresServerAuth: false,
};
const programs: Section = {
  key: "programs",
  label: "聚會",
  capability: "READ",
  requiresServerAuth: false,
};
const scanner: Section = {
  key: "scanner",
  label: "簽到",
  capability: "AUTH",
  requiresServerAuth: false,
};
const notices: Section = {
  key: "notices",
  label: "通知",
  capability: "READ",
  requiresServerAuth: false,
};
const management: Section = {
  key: "management",
  label: "管理",
  capability: "AUTH",
  requiresServerAuth: false,
};
const profile: Section = {
  key: "profile",
  label: "帳戶",
  capability: "READ",
  requiresServerAuth: false,
};

const MEMBER_SECTIONS = [home, programs, scanner, notices, profile];
const STAFF_SECTIONS = [home, programs, scanner, management, profile];

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
});

describe(isPermitted, () => {
  test("allows profile for MEMBER", () => {
    expect(isPermitted(MEMBER_SECTIONS, "profile")).toBeTruthy();
  });

  test("allows notices for MEMBER", () => {
    expect(isPermitted(MEMBER_SECTIONS, "notices")).toBeTruthy();
  });

  test("denies management for MEMBER", () => {
    expect(isPermitted(MEMBER_SECTIONS, "management")).toBeFalsy();
  });

  test("allows management for STAFF", () => {
    expect(isPermitted(STAFF_SECTIONS, "management")).toBeTruthy();
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
  test("returns the canonical section catalog", () => {
    const sections = defaultSections();
    expect(sections.map((s) => s.key)).toStrictEqual([
      "home",
      "programs",
      "events",
      "scanner",
      "notices",
      "management",
      "permissions",
      "profile",
    ]);
    expect(sections.every((s) => s.requiresServerAuth === false)).toBeTruthy();
  });
});

describe(stableNavigationSections, () => {
  test("projects 5-slot navigation for Member with notices", () => {
    expect(stableNavigationSections("Member").map((s) => s.key)).toStrictEqual([
      "home",
      "programs",
      "scanner",
      "notices",
      "profile",
    ]);
  });

  test("projects 5-slot navigation for Staff with management", () => {
    expect(stableNavigationSections("Staff").map((s) => s.key)).toStrictEqual([
      "home",
      "programs",
      "scanner",
      "management",
      "profile",
    ]);
  });
});

describe(sectionsForRole, () => {
  const memberKeys = ["home", "programs", "scanner", "notices", "profile"];
  const staffKeys = [
    "home",
    "programs",
    "scanner",
    "management",
    "profile",
    "events",
  ];
  test("Admin receives authorized sections with management", () => {
    expect(sectionsForRole("Admin").map((s) => s.key)).toStrictEqual(staffKeys);
  });

  test("Staff receives authorized sections with management", () => {
    expect(sectionsForRole("Staff").map((s) => s.key)).toStrictEqual(staffKeys);
  });

  test("Member receives 5 slots with notices", () => {
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

  test("Member with an active management grant receives management instead of notices", () => {
    expect(sectionsForRole("Member", true).map((s) => s.key)).toStrictEqual(
      staffKeys
    );
  });

  test("Member without a management grant receives notices (default false)", () => {
    expect(sectionsForRole("Member", false).map((s) => s.key)).toStrictEqual(
      memberKeys
    );
  });

  test("hasManagementGrant is a no-op for roles that already include management", () => {
    expect(sectionsForRole("Staff", true).map((s) => s.key)).toStrictEqual(
      staffKeys
    );
  });
});
