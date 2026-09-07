import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { getCanonicalRegistries } from "@/lib/governance/registries";
import { validateRegistries } from "@/lib/governance/validation";

import {
  ALL_PRESENTATION_DECLARATIONS,
  SCREEN_CATALOG,
  validateScreenCatalog,
} from "./presentation-catalog";

describe("T07.6 aggregate presentation qualification", () => {
  test("keeps every declared Story/PSN and catalog reference unique", () => {
    const psns = ALL_PRESENTATION_DECLARATIONS.map(({ psn }) => psn);
    const storyIds = ALL_PRESENTATION_DECLARATIONS.map(
      ({ storyId }) => storyId
    );

    expect(new Set(psns).size).toBe(psns.length);
    expect(new Set(storyIds).size).toBe(storyIds.length);
    expect(
      validateScreenCatalog(SCREEN_CATALOG, ALL_PRESENTATION_DECLARATIONS)
    ).toStrictEqual([]);
    expect(SCREEN_CATALOG).toHaveLength(35);
    expect(ALL_PRESENTATION_DECLARATIONS).toHaveLength(39);
  });

  test("keeps canonical governance and historical approval provenance valid", () => {
    const registries = getCanonicalRegistries();
    const result = validateRegistries(registries, {
      presentationPsns: new Set(
        ALL_PRESENTATION_DECLARATIONS.map(({ psn }) => psn)
      ),
    });

    expect(result.errors).toStrictEqual([]);
  });

  test("keeps Storybook fixtures synthetic and boundary-only", () => {
    const fixtureFiles = readdirSync(import.meta.dirname).filter((fileName) =>
      fileName.endsWith("-fixtures.ts")
    );
    const forbidden =
      /production|api[_-]?key|authorization|bearer|access[_-]?token|secret|E2E_/iu;

    for (const fixtureFile of fixtureFiles) {
      const source = readFileSync(
        path.join(import.meta.dirname, fixtureFile),
        "utf-8"
      );
      expect(source).not.toMatch(forbidden);
    }
  });

  test("keeps the MSW worker out of the shipped application public root", () => {
    expect(
      existsSync(
        path.join(import.meta.dirname, "../public/mockServiceWorker.js")
      )
    ).toBeFalsy();
    expect(
      existsSync(path.join(import.meta.dirname, "public/mockServiceWorker.js"))
    ).toBeTruthy();
  });

  test("keeps the deliberately broken contract harness test-only", () => {
    const storybookFiles = readdirSync(import.meta.dirname);
    expect(storybookFiles).toContain("management-hub-structured-failure.ts");
    expect(storybookFiles).toContain(
      "management-hub-structured-failure.test.ts"
    );
  });
});
