import { describe, expect, test } from "vitest";

import {
  defaultSections,
  firstSection,
  getSection,
  isPermitted,
  projectNavigation,
  projectSections,
  recoverySection,
} from "./sections";

describe("capability-driven section projection", () => {
  test("baseline capabilities keep the five safe destinations", () => {
    expect(
      projectSections({ "program.enroll": true }).map(({ key }) => key)
    ).toStrictEqual(["home", "programs", "scanner", "notices", "profile"]);
    expect(
      projectNavigation({ "program.enroll": true }).map(({ key }) => key)
    ).toStrictEqual(["home", "programs", "scanner", "notices", "profile"]);
  });

  test("normalized management and event capabilities project stable order", () => {
    const capabilities = {
      "program.enroll": true,
      "program.manage": true,
      "account.directory.read": true,
    };
    expect(projectSections(capabilities).map(({ key }) => key)).toStrictEqual([
      "home",
      "programs",
      "scanner",
      "management",
      "profile",
      "events",
    ]);
    expect(projectNavigation(capabilities).map(({ key }) => key)).toStrictEqual(
      ["home", "programs", "scanner", "management", "profile"]
    );
  });

  test("no capabilities fail closed", () => {
    expect(projectSections({}).map(({ key }) => key)).toStrictEqual([
      "home",
      "programs",
      "scanner",
      "notices",
      "profile",
    ]);
  });

  test("shared section helpers keep deterministic fallback", () => {
    const sections = defaultSections();
    expect(firstSection(sections)).toBe("profile");
    expect(recoverySection(sections)).toBe("profile");
    expect(isPermitted(sections, "home")).toBe(true);
    expect(getSection(sections, "management")?.key).toBe("management");
  });
  test("one normalized management capability does not imply event access", () => {
    const capabilities = { "home.publish": true };
    expect(projectSections(capabilities).map(({ key }) => key)).toStrictEqual([
      "home",
      "programs",
      "scanner",
      "management",
      "profile",
    ]);
    expect(projectNavigation(capabilities).map(({ key }) => key)).toStrictEqual(
      ["home", "programs", "scanner", "management", "profile"]
    );
  });
});
