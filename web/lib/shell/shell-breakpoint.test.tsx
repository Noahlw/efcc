import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";
// .tsx extension: jsdom component suite only (unit worker pool matches *.test.ts).

/**
 * Shell breakpoint seam (trace TK-06): the named 800px shell breakpoint is
 * the single phone-dock / desktop-rail transition for the authenticated
 * shell. The global CSS must switch the single #main-navigation landmark at
 * exactly 800px and must not declare any other shell nav breakpoint.
 */
const globals = readFileSync(
  path.resolve(import.meta.dirname, "../../app/globals.css"),
  "utf8"
);

describe("named 800px shell breakpoint (TK-06)", () => {
  test("phone dock is the <800px presentation of #main-navigation", () => {
    expect(globals).toMatch(/@media \(max-width: 799\.98px\)/u);
    expect(globals).toContain("#main-navigation .nav-item");
  });

  test("desktop rail is the >=800px presentation of #main-navigation", () => {
    expect(globals).toMatch(/@media \(min-width: 800px\)/u);
    expect(globals).toContain("#main-navigation");
    expect(globals).toContain("--width-rail");
  });

  test("no other nav breakpoint exists (single 800px transition)", () => {
    // Only the 800px boundary may switch the shell nav presentation.
    const otherBreakpoints = [
      ...globals.matchAll(/@media \(max-width: (\d+(?:\.\d+)?)px\)/gu),
    ]
      .map((m) => m[1])
      .filter((width) => width !== "799.98");
    expect(otherBreakpoints).toEqual([]);
  });

  test("shell outlet reserves the dock only below 800px", () => {
    expect(globals).toMatch(
      /@media \(min-width: 800px\)[\s\S]*#shell-content[\s\S]*padding-bottom: 0/u
    );
  });

  test("phone active navigation uses the frozen centered top indicator", () => {
    const phoneDock = globals.match(
      /@media \(max-width: 799\.98px\)[\s\S]*?(?=\/\* Desktop rail)/u
    )?.[0];

    expect(phoneDock).toBeDefined();
    expect(phoneDock).toMatch(
      /#main-navigation \.nav-item\[aria-current="page"\]\s*\{[^}]*?color: var\(--accent\);[^}]*?background: transparent;/u
    );
    expect(phoneDock).not.toMatch(
      /#main-navigation \.nav-item\[aria-current="page"\]\s*\{[^}]*?background: var\(--surface\);/u
    );
    expect(phoneDock).toMatch(
      /#main-navigation \.nav-item\[aria-current="page"\]::before[\s\S]*?content:\s*["']?["'];[\s\S]*?position:\s*absolute;[\s\S]*?top:\s*3px;[\s\S]*?left:\s*50%;[\s\S]*?width:\s*18px;[\s\S]*?height:\s*2px;[\s\S]*?transform:\s*translateX\(-50%\);[\s\S]*?background:\s*var\(--accent\);/u
    );
    expect(phoneDock).not.toMatch(/box-shadow:\s*inset\s+0\s+-2px/u);
    expect(phoneDock).not.toMatch(
      /#main-navigation \.nav-item--scan\[aria-current="page"\]\s*\{[^}]*?background: var\(--surface\);/u
    );
    expect(phoneDock).toMatch(
      /#main-navigation \.nav-item--scan\[aria-current="page"\]::before/u
    );
  });
});
