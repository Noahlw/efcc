import { describe, expect, test } from "vitest";

import {
  ALL_PRESENTATION_DECLARATIONS,
  CONTROL_PRESENTATION_DECLARATIONS,
  SCREEN_CATALOG,
  SCREEN_PRESENTATION_DECLARATIONS,
  validateScreenCatalog,
} from "./presentation-catalog";

describe("T08 presentation subject contract", () => {
  test("normalizes legacy screens and keeps controls outside Screen Catalog", () => {
    expect(SCREEN_PRESENTATION_DECLARATIONS).toHaveLength(40);
    expect(
      SCREEN_PRESENTATION_DECLARATIONS.every(
        (declaration) =>
          declaration.subject === "screen" &&
          typeof declaration.screenId === "string"
      )
    ).toBeTruthy();

    expect(CONTROL_PRESENTATION_DECLARATIONS).toHaveLength(7);
    expect(
      CONTROL_PRESENTATION_DECLARATIONS.map(({ controlId, psn }) => [
        controlId,
        psn,
      ])
    ).toStrictEqual([
      ["button", "PSN-CONTROL-BUTTON"],
      ["icon-button", "PSN-CONTROL-ICON-BUTTON"],
      ["input", "PSN-CONTROL-INPUT"],
      ["textarea", "PSN-CONTROL-TEXTAREA"],
      ["checkbox", "PSN-CONTROL-CHECKBOX"],
      ["switch", "PSN-CONTROL-SWITCH"],
      ["select", "PSN-CONTROL-SELECT"],
    ]);
    expect(
      validateScreenCatalog(SCREEN_CATALOG, ALL_PRESENTATION_DECLARATIONS)
    ).toStrictEqual([]);
  });

  test("rejects control metadata that adds screen identity or route intent", () => {
    const [control] = CONTROL_PRESENTATION_DECLARATIONS;
    if (!control) {
      throw new Error("Control presentation declaration is missing");
    }
    const invalid = {
      ...control,
      screenId: "invented-screen",
      route: "/invented",
      intent: "invented=true",
    } as unknown as (typeof ALL_PRESENTATION_DECLARATIONS)[number];
    const declarations = [
      ...ALL_PRESENTATION_DECLARATIONS.filter(
        (declaration) => declaration.storyId !== control.storyId
      ),
      invalid,
    ];

    expect(validateScreenCatalog(SCREEN_CATALOG, declarations)).toStrictEqual(
      expect.arrayContaining([
        expect.stringContaining("Control Story route must be null"),
        expect.stringContaining("Control Story intent must be null"),
        expect.stringContaining("Control Story must not declare screenId"),
      ])
    );
  });
});
