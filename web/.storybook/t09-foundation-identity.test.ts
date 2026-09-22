import { describe, expect, test } from "vitest";

import {
  ALL_PRESENTATION_DECLARATIONS,
  FOUNDATION_PRESENTATION_DECLARATIONS,
  SCREEN_CATALOG,
  SCREEN_PRESENTATION_DECLARATIONS,
  validateScreenCatalog,
} from "./presentation-catalog";
import {
  discoverStoryDeclarations,
  type FoundationPresentationMetadata,
} from "./presentation-meta";

describe("T09 additive foundation presentation identity", () => {
  test("discovers durable foundation Stories without creating Screen Catalog obligations", () => {
    expect(FOUNDATION_PRESENTATION_DECLARATIONS).toHaveLength(14);
    expect(
      FOUNDATION_PRESENTATION_DECLARATIONS.map(({ foundationId, psn }) => [
        foundationId,
        psn,
      ])
    ).toStrictEqual([
      ["surface", "PSN-FOUNDATION-SURFACE"],
      ["surface", "PSN-FOUNDATION-SURFACE-CARD-FOOTER"],
      ["feedback", "PSN-FOUNDATION-FEEDBACK"],
      ["dialog", "PSN-FOUNDATION-DIALOG"],
      ["dialog", "PSN-FOUNDATION-DIALOG-LONG-CONTENT"],
      ["dialog", "PSN-FOUNDATION-DIALOG-BUSY-DISABLED"],
      ["alert-dialog", "PSN-FOUNDATION-ALERT-DIALOG"],
      ["alert-dialog", "PSN-FOUNDATION-ALERT-DIALOG-LONG-CONTENT"],
      ["alert-dialog", "PSN-FOUNDATION-ALERT-DIALOG-BUSY-DISABLED"],
      ["sheet", "PSN-FOUNDATION-SHEET"],
      ["sheet", "PSN-FOUNDATION-SHEET-LONG-CONTENT"],
      ["sheet", "PSN-FOUNDATION-SHEET-BUSY-DISABLED"],
      ["screen-foundations", "PSN-SCREEN-FOUNDATIONS-PLAYGROUND"],
      ["screen-foundations-states", "PSN-SCREEN-FOUNDATIONS-STATES"],
    ]);
    expect(
      FOUNDATION_PRESENTATION_DECLARATIONS.filter(
        ({ baseline }) => baseline === "supporting"
      )
    ).toHaveLength(8);
    expect(SCREEN_PRESENTATION_DECLARATIONS).toHaveLength(39);
    expect(SCREEN_CATALOG).toHaveLength(35);
    expect(
      FOUNDATION_PRESENTATION_DECLARATIONS.every(
        (declaration) =>
          declaration.subject === "foundation" &&
          declaration.route === null &&
          declaration.intent === null &&
          !Object.hasOwn(declaration, "screenId") &&
          !Object.hasOwn(declaration, "controlId")
      )
    ).toBe(true);
    expect(
      validateScreenCatalog(SCREEN_CATALOG, ALL_PRESENTATION_DECLARATIONS)
    ).toStrictEqual([]);
  });

  test("rejects foundation metadata that borrows screen/control identity", () => {
    const presentation: FoundationPresentationMetadata = {
      subject: "foundation",
      foundationId: "surface",
      productFamily: "foundations",
      lifecycle: "active",
      baseline: "primary",
      psn: "PSN-FOUNDATION-INVALID",
      route: null,
      intent: null,
      state: "default",
      gap: null,
      supersedes: [],
    };

    expect(() =>
      discoverStoryDeclarations({
        default: { id: "invalid-foundation" },
        Broken: {
          parameters: {
            presentation: {
              ...presentation,
              screenId: "not-a-foundation",
            },
          },
        },
      })
    ).toThrow(/foundationId is invalid/u);
  });

  test("rejects foundation route and intent values", () => {
    const base = {
      subject: "foundation",
      foundationId: "surface",
      productFamily: "foundations",
      lifecycle: "active",
      baseline: "primary",
      psn: "PSN-FOUNDATION-INVALID",
      state: "default",
      gap: null,
      supersedes: [],
    };

    expect(() =>
      discoverStoryDeclarations({
        default: { id: "invalid-foundation" },
        Broken: {
          parameters: {
            presentation: { ...base, route: "/", intent: null },
          },
        },
      })
    ).toThrow(/Foundation Story route must be null/u);
  });
});
