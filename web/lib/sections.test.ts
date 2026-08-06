import { describe, test, expect } from "vitest";

import type { Section } from "./api";
import {
  defaultSections,
  firstSection,
  isPermitted,
  getSection,
  recoverySection,
} from "./sections";

const profile: Section = {
  key: "profile",
  label: "個人資料",
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

const MEMBER_SECTIONS = [profile, programs, events];
const STAFF_SECTIONS = [profile, programs, events, scanner, care, permissions];

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

  test("denies scanner for MEMBER", () => {
    expect(isPermitted(MEMBER_SECTIONS, "scanner")).toBeFalsy();
  });

  test("allows scanner for STAFF", () => {
    expect(isPermitted(STAFF_SECTIONS, "scanner")).toBeTruthy();
  });

  test("denies unknown key", () => {
    expect(isPermitted(MEMBER_SECTIONS, "unknown")).toBeFalsy();
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
  test("returns the six shell sections with profile first (CF0-04 stand-in)", () => {
    const sections = defaultSections();
    expect(sections.map((s) => s.key)).toStrictEqual([
      "profile",
      "programs",
      "events",
      "scanner",
      "care",
      "permissions",
    ]);
    expect(firstSection(sections)).toBe("profile");
    // No section requires a server-auth RPC in this slice (deferred to CF0-04).
    expect(sections.every((s) => s.requiresServerAuth === false)).toBeTruthy();
  });
});
