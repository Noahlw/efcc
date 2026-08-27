import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";
// .tsx extension: jsdom component suite only (unit worker pool matches *.test.ts).

/**
 * Token contract seam (trace TK-01, TK-10): the Civic Minimal Tailwind token
 * families declared in `web/app/globals.css` — color, spacing, typography,
 * target/control size, radius, borders, elevation, widths, layering, motion —
 * plus the named 800px shell breakpoint. Every family must be present and the
 * shell modules must not introduce off-token literals.
 */
const globals = readFileSync(
  path.resolve(import.meta.dirname, "../../app/globals.css"),
  "utf8"
);

const FAMILIES: Record<string, readonly string[]> = {
  color: [
    "--surface",
    "--surface-raised",
    "--ink",
    "--ink-muted",
    "--line",
    "--line-strong",
    "--accent",
    "--accent-deep",
    "--focus",
    "--success",
    "--success-surface",
    "--success-border",
    "--error",
    "--error-surface",
    "--error-border",
    "--pending",
    "--pending-surface",
    "--pending-border",
    "--skeleton",
  ],
  spacing: [
    "--space-1",
    "--space-2",
    "--space-3",
    "--space-4",
    "--space-5",
    "--space-6",
    "--space-7",
    "--space-8",
    "--space-9",
  ],
  typography: [
    "--text-display",
    "--text-title",
    "--text-subtitle",
    "--text-body",
    "--text-label",
    "--text-caption",
    "--leading-display",
    "--leading-title",
    "--leading-subtitle",
    "--leading-body",
    "--leading-label",
    "--weight-regular",
    "--weight-bold",
    "--weight-extrabold",
  ],
  "target/control size": [
    "--control-min-size",
    "--control-radius",
  ],
  radius: ["--radius-sm", "--radius-md", "--radius-pill", "--radius-mark"],
  borders: ["--border-hairline", "--border-control"],
  elevation: [
    "--shadow-dock",
    "--shadow-rail-active",
    "--shadow-overlay",
  ],
  widths: ["--width-rail", "--width-container", "--width-overlay"],
  layering: [
    "--layer-dock",
    "--layer-rail",
    "--layer-offline-banner",
    "--layer-overlay",
  ],
  motion: ["--duration-fast", "--duration-med", "--ease-standard"],
};

describe("Civic Minimal token contract (TK-01)", () => {
  for (const [family, tokens] of Object.entries(FAMILIES)) {
    test(`${family} family is fully declared`, () => {
      for (const token of tokens) {
        expect(
          globals.includes(`${token}:`),
          `missing ${token} in globals.css`
        ).toBe(true);
      }
    });
  }

  test("named 800px shell breakpoint is declared", () => {
    expect(globals).toContain("--breakpoint-shell: 800px");
  });
});
