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
  "utf-8"
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
    "--info",
    "--info-surface",
    "--info-border",
    "--success",
    "--success-surface",
    "--success-border",
    "--error",
    "--error-surface",
    "--error-border",
    "--pending",
    "--pending-surface",
    "--pending-border",
    "--warning",
    "--warning-surface",
    "--warning-border",
    "--conflict",
    "--conflict-surface",
    "--conflict-border",
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
  "target/control size": ["--control-min-size", "--control-radius"],
  radius: ["--radius-sm", "--radius-md", "--radius-pill", "--radius-mark"],
  borders: ["--border-hairline", "--border-control"],
  elevation: ["--shadow-dock", "--shadow-rail-active", "--shadow-overlay"],
  widths: ["--width-rail", "--width-container", "--width-overlay"],
  layering: [
    "--layer-dock",
    "--layer-rail",
    "--layer-offline-banner",
    "--layer-overlay-backdrop",
    "--layer-overlay-content",
    "--layer-overlay",
  ],
  motion: ["--duration-fast", "--duration-med", "--ease-standard"],
};

/**
 * Programs Screen Foundations token seam (issue #587). Expected values are
 * independently transcribed from the frozen `00-screen-foundations.html`
 * root contract and its canonical component rules, not derived from the
 * runtime CSS under test.
 */
const SCREEN_FOUNDATION_TOKENS: Record<string, string> = {
  "--screen-shell-bg": "#f1eee8",
  "--screen-canvas": "#fbfaf7",
  "--screen-surface": "#ffffff",
  "--screen-surface-soft": "#f6f3ee",
  "--screen-ink": "#1b1d1f",
  "--screen-muted": "#666d73",
  "--screen-line": "#e2ddd5",
  "--screen-line-strong": "#cfc8be",
  "--screen-accent": "#9c302c",
  "--screen-accent-deep": "#842824",
  "--screen-accent-soft": "#f6e7e5",
  "--screen-success": "#2f6a4c",
  "--screen-success-surface": "#e8f4ec",
  "--screen-pending": "#9a650a",
  "--screen-pending-surface": "#fff3d8",
  "--screen-info": "#315f8a",
  "--screen-info-surface": "#e8f1f9",
  "--screen-danger": "#a9322f",
  "--screen-danger-surface": "#fbeceb",
  "--screen-focus": "#176a87",
  "--screen-gutter": "16px",
  "--screen-shell-height": "56px",
  "--screen-bottom-nav-height": "72px",
  "--screen-touch-target": "44px",
  "--screen-radius-control": "10px",
  "--screen-radius-surface": "14px",
  "--screen-radius-sheet": "20px",
  "--screen-radius-pill": "999px",
  "--screen-root-title-size": "28px",
  "--screen-root-title-leading": "34px",
  "--screen-child-title-size": "24px",
  "--screen-child-title-leading": "30px",
  "--screen-section-title-size": "17px",
  "--screen-section-title-leading": "24px",
  "--screen-body-size": "15px",
  "--screen-body-leading": "22px",
  "--screen-meta-size": "13px",
  "--screen-meta-leading": "18px",
  "--screen-row-min-height": "64px",
  "--screen-settings-row-min-height": "56px",
  "--screen-section-gap": "24px",
  "--screen-utility-gap": "8px",
  "--screen-row-padding-block": "10px",
  "--screen-settings-row-padding-block": "8px",
  "--screen-surface-padding": "14px",
  "--screen-control-padding-inline": "14px",
  "--screen-icon-size": "20px",
  "--screen-font-sans":
    '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang HK", "PingFang TC", "Noto Sans TC", "Segoe UI", sans-serif',
  "--screen-shadow-sticky": "0 -8px 24px rgba(28,25,20,.06)",
  "--screen-shadow-dock": "0 -6px 20px rgba(40,34,26,.045)",
  "--screen-shadow-sheet": "0 -18px 50px rgba(20,18,15,.18)",
};

const normalizeCssValue = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ",")
    .replace(/\b0\.(\d+)/g, ".$1");

const readCustomProperty = (token: string) => {
  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const declaration = globals.match(
    new RegExp(`(?:^|\\n)\\s*${escapedToken}\\s*:\\s*([\\s\\S]*?);`)
  );

  expect(
    declaration,
    `missing ${token} declaration in globals.css`
  ).not.toBeNull();
  return declaration?.[1] ?? "";
};

describe("Civic Minimal token contract (TK-01)", () => {
  test.each(Object.entries(FAMILIES))(
    "%s family is fully declared",
    (_family, tokens) => {
      for (const token of tokens) {
        expect(globals, `missing ${token} in globals.css`).toContain(
          `${token}:`
        );
      }
    }
  );

  test("named 800px shell breakpoint is declared", () => {
    expect(globals).toContain("--breakpoint-shell: 800px");
  });
});

describe("Programs screen shell geometry (TK-01/TK-06)", () => {
  test("maps the frozen shell geometry to shared tokens", () => {
    expect(globals).toMatch(
      /\.shell-top\s*\{[\s\S]*height:\s*calc\([\s\S]*var\(--screen-shell-height\)/u
    );
    expect(globals).toMatch(
      /#main-navigation\s*\{[\s\S]*height:\s*calc\([\s\S]*var\(--screen-bottom-nav-height\)/u
    );
    expect(globals).toContain(
      "padding: env(safe-area-inset-top, 0px) var(--screen-gutter) 0"
    );
    expect(globals).toContain("--screen-touch-target: 44px");
    expect(globals).toContain("--screen-gutter: 16px");
  });

  test("keeps the mobile shell from introducing horizontal overflow", () => {
    expect(globals).toContain("overflow-x: hidden");
    expect(globals).toContain("min-width: 0");
  });
});

describe("Programs Screen Foundations token contract (#587)", () => {
  test.each(Object.entries(SCREEN_FOUNDATION_TOKENS))(
    "%s preserves its frozen Warm Civic Minimal value",
    (token, value) => {
      expect(
        normalizeCssValue(readCustomProperty(token)),
        `expected ${token} to preserve the frozen 00-screen-foundations.html value ${value}`
      ).toBe(normalizeCssValue(value));
    }
  );
});
