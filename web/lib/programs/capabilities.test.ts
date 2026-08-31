import { describe, expect, test } from "vitest";

import {
  CAPABILITY_CATALOG,
  isCapability,
} from "../identity/capability-catalog";
import { CAPABILITY } from "./capabilities";

describe("normalized Programs capability vocabulary", () => {
  test("every Programs capability is in the closed identity catalog", () => {
    for (const capability of Object.values(CAPABILITY)) {
      expect(isCapability(capability)).toBe(true);
    }
  });

  test("the catalog keeps the participant baseline and Admin-only powers", () => {
    expect(
      CAPABILITY_CATALOG.some(
        ({ capability }) => capability === "program.enroll"
      )
    ).toBe(true);
    expect(
      CAPABILITY_CATALOG.find(({ capability }) => capability === "home.publish")
        ?.systemOnly
    ).toBe(true);
    expect(
      CAPABILITY_CATALOG.find(
        ({ capability }) => capability === "account.permissions.write"
      )?.systemOnly
    ).toBe(true);
  });
});
