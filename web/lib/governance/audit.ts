/**
 * EFCC UI Control Recovery — Static Governance Source Audit Engine.
 *
 * Implements machine-enforced source code audits across the repository:
 * 1. RULE-NO-UNLAYERED-HIGH-BLAST-RADIUS-CSS: detect unlayered high-blast-radius CSS rules.
 * 2. RULE-NO-CSS-MODULES: detect reintroduced CSS Modules.
 * 3. RULE-NO-INLINE-STYLES: detect ordinary inline visual declarations.
 * 4. RULE-NO-ROUTE-GLOBAL-SELECTORS: detect route-owned global selectors.
 * 5. RULE-UNDOCUMENTED-NATIVE-EXCEPTION: detect undocumented native HTML controls.
 * 6. RULE-NO-ROUTE-CVA: detect invalid route-specific CVA variants.
 * 7. RULE-NO-FORBIDDEN-STYLING-HOOKS: detect !important routine containment and unapproved runtimes.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { NATIVE_EXCEPTION_REGISTRY, WAIVER_REGISTRY } from "./registries";
import type {
  AuditResult,
  AuditRuleId,
  AuditScanError,
  AuditViolation,
  NativeException,
  OwnershipLayer,
  Waiver,
} from "./types";
import { parseStrictDateValue } from "./validation";

export interface AuditOptions {
  /**
   * Root directory of the repository. Defaults to auto-resolved repo root.
   */
  readonly rootDir?: string;

  /**
   * Explicit file paths to audit (for affected-scope auditing).
   */
  readonly targetFiles?: readonly string[];

  /**
   * Active waivers to evaluate. Defaults to canonical WAIVER_REGISTRY.
   */
  readonly waivers?: readonly Waiver[];

  /**
   * Documented native exceptions. Defaults to canonical NATIVE_EXCEPTION_REGISTRY.
   */
  readonly nativeExceptions?: readonly NativeException[];

  /**
   * Reference date for waiver expiration. Defaults to now.
   */
  readonly now?: Date | string | number;
}

const BROAD_ELEMENT_TAG_REGEX =
  /^(html|body|div|p|span|a|button|input|textarea|select|table|thead|tbody|tr|th|td|ul|ol|li|h[1-6]|header|footer|nav|main|section|article|aside|dialog|form|label)\b/i;
const BROAD_ELEMENT_TOKEN_REGEX =
  /(?:^|[\s>+~,])(html|body|div|p|span|a|button|input|textarea|select|table|thead|tbody|tr|th|td|ul|ol|li|h[1-6]|header|footer|nav|main|section|article|aside|dialog|form|label)\b/i;

function stripQuotedCssText(value: string): string {
  let output = "";
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (quote !== null) {
      if (char === "\\") {
        output += "  ";
        i++;
      } else if (char === quote) {
        quote = null;
        output += " ";
      } else {
        output += " ";
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      output += " ";
    } else {
      output += char;
    }
  }

  return output;
}

function findPseudoWrapperArguments(selector: string): string[] {
  const argumentsFound: string[] = [];

  for (let i = 0; i < selector.length; i++) {
    const wrapperMatch = selector.slice(i).match(/^:(where|is|has)\s*\(/i);
    if (!wrapperMatch) continue;

    const openIndex = i + wrapperMatch[0].lastIndexOf("(");
    let depth = 1;
    let quote: "'" | '"' | null = null;
    let closeIndex = -1;

    for (let j = openIndex + 1; j < selector.length; j++) {
      const char = selector[j];
      if (quote !== null) {
        if (char === "\\") {
          j++;
        } else if (char === quote) {
          quote = null;
        }
        continue;
      }
      if (char === "'" || char === '"') {
        quote = char;
      } else if (char === "(") {
        depth++;
      } else if (char === ")") {
        depth--;
        if (depth === 0) {
          closeIndex = j;
          break;
        }
      }
    }

    if (closeIndex !== -1) {
      argumentsFound.push(selector.slice(openIndex + 1, closeIndex));
      i = closeIndex;
    }
  }

  return argumentsFound;
}

function isBroadSelector(selector: string): boolean {
  const trimmed = selector.trim();
  if (!trimmed) return false;

  const withoutStrings = stripQuotedCssText(trimmed);
  if (withoutStrings.trim() === "*") return true;
  if (BROAD_ELEMENT_TAG_REGEX.test(withoutStrings.trim())) return true;

  return findPseudoWrapperArguments(withoutStrings).some((argument) => {
    if (/\*/u.test(argument) || BROAD_ELEMENT_TOKEN_REGEX.test(argument))
      return true;
    return splitTopLevelSelectors(argument).some((nestedSelector) =>
      isBroadSelector(nestedSelector)
    );
  });
}

const CSS_MODULE_PATH_REGEX = /\.module\.(css|scss|sass|less|pcss)$/i;
const CSS_MODULE_IMPORT_REGEX =
  /(?:\bimport\s+(?:[^'"`]*?\s+from\s+)?['"`][^'"`\r\n]*?\.module\.(?:css|scss|sass|less|pcss)(?:[?#][^'"`]*)?['"`]|\b(?:import|require)\s*\(\s*['"`][^'"`\r\n]*?\.module\.(?:css|scss|sass|less|pcss)(?:[?#][^'"`]*)?['"`]\s*\))/i;

function splitTopLevelSelectors(selectorString: string): string[] {
  const parts: string[] = [];
  let current = "";
  let parenDepth = 0;
  let bracketDepth = 0;
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < selectorString.length; i++) {
    const char = selectorString[i];
    if (quote !== null) {
      current += char;
      if (char === "\\") {
        if (i + 1 < selectorString.length) current += selectorString[++i];
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      current += char;
    } else if (char === "(") {
      parenDepth++;
      current += char;
    } else if (char === ")") {
      if (parenDepth > 0) parenDepth--;
      current += char;
    } else if (char === "[") {
      bracketDepth++;
      current += char;
    } else if (char === "]") {
      if (bracketDepth > 0) bracketDepth--;
      current += char;
    } else if (char === "," && parenDepth === 0 && bracketDepth === 0) {
      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
      current = "";
    } else {
      current += char;
    }
  }

  const lastTrimmed = current.trim();
  if (lastTrimmed) parts.push(lastTrimmed);

  return parts;
}

/**
 * Evaluates whether a CSS @media query expression represents a print-media context.
 *
 * - Direct: "@media print", "@media only print" -> true
 * - Compound with features: "@media print and (min-width: 600px)" -> true
 * - Comma-separated queries are allowed only when every branch is print-only.
 * - Negated or mixed queries such as "@media not print" or "@media screen, print" -> false
 * - Ordinary screen/speech: "@media screen", "@media (min-width: 768px)" -> false
 */
export function isPrintMediaQuery(mediaQueryList: string): boolean {
  let trimmed = mediaQueryList.trim();
  if (!trimmed) return false;

  // Strip leading @media if present
  if (/^@media\b/i.test(trimmed)) {
    trimmed = trimmed.replace(/^@media\b/i, "").trim();
  }
  if (!trimmed) return false;

  // Split comma-separated media queries (top-level only, ignoring commas inside parens)
  const queries: string[] = [];
  let current = "";
  let parenDepth = 0;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (char === "(") {
      parenDepth++;
      current += char;
    } else if (char === ")") {
      if (parenDepth > 0) parenDepth--;
      current += char;
    } else if (char === "," && parenDepth === 0) {
      const q = current.trim();
      if (q) queries.push(q);
      current = "";
    } else {
      current += char;
    }
  }
  const lastQ = current.trim();
  if (lastQ) queries.push(lastQ);

  if (queries.length === 0) return false;

  // Every branch must be exclusively print media; a mixed "screen, print"
  // query still applies to screen and cannot authorize !important.
  return queries.every((query) => {
    const q = query.toLowerCase().trim();
    // Fail-closed on any negated branch (e.g. "not print", "not only print", "not (print)")
    if (/\bnot\b/i.test(q)) return false;
    // Fail-closed on other media types (screen, all, speech, etc.)
    if (/\b(?:screen|all|speech|tv|handheld|projection)\b/i.test(q))
      return false;
    // Must start with print or only print
    return /^(?:only\s+)?print\b/i.test(q);
  });
}

/**
 * Resolves repository root directory starting from a given directory or import.meta.dirname.
 */
export function resolveRepoRoot(startDir?: string): string {
  let current = startDir
    ? path.resolve(startDir)
    : typeof import.meta !== "undefined" && import.meta.dirname
      ? path.resolve(import.meta.dirname, "../../..")
      : process.cwd();

  while (current && current !== path.dirname(current)) {
    if (
      fs.existsSync(path.join(current, "pnpm-lock.yaml")) &&
      fs.existsSync(path.join(current, "web"))
    ) {
      return current;
    }
    if (fs.existsSync(path.join(current, ".git"))) {
      return current;
    }
    current = path.dirname(current);
  }

  return startDir ? path.resolve(startDir) : process.cwd();
}

/**
 * Resolves target file path checking multiple root variants.
 */
function resolveTargetFilePath(f: string, repoRoot: string): string {
  if (path.isAbsolute(f)) return f;
  const candidate1 = path.resolve(repoRoot, f);
  if (fs.existsSync(candidate1)) return candidate1;
  const candidate2 = path.resolve(repoRoot, "..", f);
  if (fs.existsSync(candidate2)) return candidate2;
  if (f.startsWith("web/")) {
    const stripped = f.slice(4);
    const candidate3 = path.resolve(repoRoot, stripped);
    if (fs.existsSync(candidate3)) return candidate3;
    const candidate4 = path.resolve(repoRoot, "web", stripped);
    if (fs.existsSync(candidate4)) return candidate4;
  }
  return candidate1;
}

/**
 * Normalizes file path to repository-relative format (forward slashes, no leading slash/dots).
 * Always starts with "web/..." for web package files.
 */
export function normalizeRepoPath(filePath: string, rootDir?: string): string {
  const repoRoot = rootDir ? path.resolve(rootDir) : resolveRepoRoot();
  const absPath = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(repoRoot, filePath);
  let relPath = path.relative(repoRoot, absPath).replace(/\\/g, "/");

  // If relPath starts with "../", fallback to cleaned filePath
  if (relPath.startsWith("../") || relPath === "..") {
    relPath = filePath.replace(/\\/g, "/").replace(/^\.?\/+/, "");
  }

  // Ensure path starts with web/ if it is inside web
  if (!relPath.startsWith("web/") && absPath.includes("/web/")) {
    const idx = absPath.indexOf("/web/");
    relPath = absPath.slice(idx + 1).replace(/\\/g, "/");
  }

  return relPath;
}
/**
 * Strips comments from CSS string while preserving line breaks.
 */
function stripCssComments(css: string): string {
  let output = "";
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    if (quote !== null) {
      output += char;
      if (char === "\\" && i + 1 < css.length) {
        output += css[++i];
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      output += char;
    } else if (char === "/" && css[i + 1] === "*") {
      i += 2;
      while (i < css.length && !(css[i] === "*" && css[i + 1] === "/")) {
        if (css[i] === "\n") output += "\n";
        i++;
      }
      if (i < css.length) i++;
    } else {
      output += char;
    }
  }

  return output;
}

function countUnquotedCharacter(value: string, target: string): number {
  let count = 0;
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (quote !== null) {
      if (char === "\\") {
        i++;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
    } else if (char === target) {
      count++;
    }
  }

  return count;
}

function firstUnquotedCharacter(value: string, target: string): number {
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (quote !== null) {
      if (char === "\\") {
        i++;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
    } else if (char === target) {
      return i;
    }
  }

  return -1;
}

function extractCssBlockSource(
  lines: readonly string[],
  startLine: number,
  openingBraceIndex: number
): string {
  let source = "";
  let braceDepth = 0;

  for (let lineIndex = startLine; lineIndex < lines.length; lineIndex++) {
    const segment =
      lineIndex === startLine
        ? lines[lineIndex].slice(openingBraceIndex)
        : lines[lineIndex];
    source += `${lineIndex === startLine ? "" : "\n"}${segment}`;
    braceDepth += countUnquotedCharacter(segment, "{");
    braceDepth -= countUnquotedCharacter(segment, "}");
    if (braceDepth <= 0) return source;
  }

  return source;
}

function normalizeCssSource(source: string): string {
  return source
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/\s*([{}:;,>+~])\s*/gu, "$1");
}

function getCssSourceFingerprint(
  selector: string,
  blockSource: string
): string {
  return createHash("sha256")
    .update(normalizeCssSource(`${selector}${blockSource}`), "utf8")
    .digest("hex");
}

/**
 * Matches a native JSX element tag and its attribute slice against a comma-separated selector list.
 * e.g. "input[type=radio], input[type=datetime-local]" or "select#assisted-event-context"
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasExactJsxAttribute(
  tagContent: string,
  attributeName: string,
  expectedValue?: string
): boolean {
  const escapedName = escapeRegExp(attributeName);
  const attributeBoundary = new RegExp(
    `(?:^|\\s)${escapedName}(?=\\s|=|/?>)`,
    "i"
  );
  if (!attributeBoundary.test(tagContent)) return false;
  if (expectedValue === undefined) return true;

  const escapedValue = escapeRegExp(expectedValue);
  const valuePattern = new RegExp(
    `(?:^|\\s)${escapedName}\\s*=\\s*(?:["']${escapedValue}["']|\\{\\s*["']${escapedValue}["']\\s*\\}|${escapedValue}(?=\\s|/?>))`,
    "i"
  );
  return valuePattern.test(tagContent);
}

function findJsxOpeningTagSlice(
  lines: readonly string[],
  startLine: number,
  startIndex: number
): string {
  let tagSlice = "";
  let braceDepth = 0;
  let quote: "'" | '"' | null = null;

  for (let lineIndex = startLine; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const segment = lineIndex === startLine ? line.slice(startIndex) : line;
    if (lineIndex > startLine) tagSlice += "\n";

    for (let charIndex = 0; charIndex < segment.length; charIndex++) {
      const char = segment[charIndex];
      tagSlice += char;
      if (quote !== null) {
        if (char === "\\") {
          if (charIndex + 1 < segment.length) tagSlice += segment[++charIndex];
        } else if (char === quote) {
          quote = null;
        }
        continue;
      }
      if (char === "'" || char === '"') {
        quote = char;
      } else if (char === "{") {
        braceDepth++;
      } else if (char === "}" && braceDepth > 0) {
        braceDepth--;
      } else if (char === ">" && braceDepth === 0) {
        return tagSlice;
      }
    }
  }

  return tagSlice;
}

function matchesNativeControlSelector(
  tag: string,
  tagContent: string,
  selectorList: string
): boolean {
  const selectors = splitTopLevelSelectors(selectorList);
  for (const sel of selectors) {
    const tagMatch = sel.match(/^([a-zA-Z0-9_-]+|\*)/);
    const expectedTag = tagMatch ? tagMatch[1].toLowerCase() : "*";
    if (expectedTag !== "*" && expectedTag !== tag.toLowerCase()) continue;

    const idMatch = sel.match(/#([a-zA-Z0-9_-]+)/);
    if (idMatch && !hasExactJsxAttribute(tagContent, "id", idMatch[1]))
      continue;

    const attrRegex =
      /\[\s*([a-zA-Z0-9_-]+)(?:\s*=\s*['"]?([^'"\]]+)['"]?)?\s*\]/g;
    let attrMatch: RegExpExecArray | null;
    let allAttrsMatch = true;

    while ((attrMatch = attrRegex.exec(sel)) !== null) {
      const attrName = attrMatch[1];
      const attrVal = attrMatch[2];
      if (!hasExactJsxAttribute(tagContent, attrName, attrVal)) {
        allAttrsMatch = false;
        break;
      }
    }

    if (allAttrsMatch) return true;
  }
  return false;
}

/**
 * Audits a single file content in-memory against all governance rules.
 */
export function auditFileContent(
  filePath: string,
  content: string,
  options: AuditOptions = {}
): AuditViolation[] {
  const violations: AuditViolation[] = [];
  const repoRoot = options.rootDir
    ? path.resolve(options.rootDir)
    : resolveRepoRoot();
  const normalizedPath = normalizeRepoPath(filePath, repoRoot);

  // Skip vendor, build artifacts, and node_modules
  if (
    normalizedPath.includes("node_modules/") ||
    normalizedPath.includes(".next/") ||
    normalizedPath === "web/.wrangler" ||
    normalizedPath.startsWith("web/.wrangler/") ||
    normalizedPath === "web/out" ||
    normalizedPath.startsWith("web/out/") ||
    normalizedPath.includes("dist/") ||
    normalizedPath.includes("coverage/") ||
    normalizedPath.includes(".scratch/")
  ) {
    return violations;
  }

  const isCssFile = /\.(css|scss|sass|less|pcss)$/i.test(normalizedPath);
  const isTsxOrJsx =
    normalizedPath.endsWith(".tsx") || normalizedPath.endsWith(".jsx");
  const isTestFile =
    normalizedPath.includes(".test.") ||
    normalizedPath.includes("/tests/") ||
    normalizedPath.startsWith("tests/") ||
    normalizedPath.startsWith("scripts/") ||
    normalizedPath.includes("/test-setup.");
  const isUiPrimitive = normalizedPath.startsWith("web/components/ui/");
  const isRouteFile = normalizedPath.startsWith("web/app/");
  // Rule 1: RULE-NO-UNLAYERED-HIGH-BLAST-RADIUS-CSS
  if (isCssFile) {
    const cleanContent = stripCssComments(content);
    const lines = cleanContent.split("\n");
    let layerBraceDepth = 0;
    let keyframesBraceDepth = 0;
    let themeBraceDepth = 0;
    let pendingSelector = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed) continue;

      const wasInLayer = layerBraceDepth > 0;
      const wasInKeyframes = keyframesBraceDepth > 0;
      const wasInTheme = themeBraceDepth > 0;

      const isOpeningLayer = /^@layer\b/i.test(trimmed);
      const isOpeningKeyframes = /^@keyframes\b/i.test(trimmed);
      const isOpeningTheme = /^@theme\b/i.test(trimmed);

      const openBraces = countUnquotedCharacter(line, "{");
      const closeBraces = countUnquotedCharacter(line, "}");
      const openingBraceIndex = firstUnquotedCharacter(line, "{");

      if (wasInLayer || isOpeningLayer) {
        layerBraceDepth += openBraces - closeBraces;
        if (layerBraceDepth <= 0 && closeBraces > 0) layerBraceDepth = 0;
      }
      if (wasInKeyframes || isOpeningKeyframes) {
        keyframesBraceDepth += openBraces - closeBraces;
        if (keyframesBraceDepth <= 0 && closeBraces > 0)
          keyframesBraceDepth = 0;
      }
      if (wasInTheme || isOpeningTheme) {
        themeBraceDepth += openBraces - closeBraces;
        if (themeBraceDepth <= 0 && closeBraces > 0) themeBraceDepth = 0;
      }

      const outsideProtectedBlock =
        !wasInLayer &&
        !isOpeningLayer &&
        !wasInKeyframes &&
        !isOpeningKeyframes &&
        !wasInTheme &&
        !isOpeningTheme &&
        layerBraceDepth === 0 &&
        keyframesBraceDepth === 0 &&
        themeBraceDepth === 0;

      if (outsideProtectedBlock) {
        if (openingBraceIndex !== -1) {
          const currentSelector = line.slice(0, openingBraceIndex).trim();
          const rawSelector =
            (pendingSelector ? pendingSelector + " " : "") + currentSelector;
          pendingSelector = "";
          const selectorPart = rawSelector.trim();
          if (selectorPart && !selectorPart.startsWith("@")) {
            const selectorParts = splitTopLevelSelectors(selectorPart);
            const broadSelector = selectorParts.find((selector) =>
              isBroadSelector(selector)
            );
            if (broadSelector) {
              violations.push({
                ruleId: "RULE-NO-UNLAYERED-HIGH-BLAST-RADIUS-CSS",
                file: normalizedPath,
                line: i + 1,
                snippet: trimmed,
                sourceFingerprint: getCssSourceFingerprint(
                  selectorPart,
                  extractCssBlockSource(lines, i, openingBraceIndex)
                ),
                message: `Unlayered high-blast-radius selector "${broadSelector}" detected in "${normalizedPath}". Global CSS rules belong in globals.css @layer base or scoped pattern classes.`,
                likelyOwnershipLayer: "global",
              });
            }
          }
        } else if (
          firstUnquotedCharacter(trimmed, ";") === -1 &&
          !trimmed.startsWith("@") &&
          firstUnquotedCharacter(trimmed, "}") === -1
        ) {
          pendingSelector =
            (pendingSelector ? pendingSelector + " " : "") + trimmed;
        } else {
          pendingSelector = "";
        }
      } else {
        pendingSelector = "";
      }
    }
  }

  // Rule 2: RULE-NO-CSS-MODULES
  if (
    !isTestFile &&
    (CSS_MODULE_PATH_REGEX.test(normalizedPath) ||
      CSS_MODULE_IMPORT_REGEX.test(content))
  ) {
    const lines = content.split("\n");
    let matchedLine: number | undefined;
    let snippet = normalizedPath;

    for (let i = 0; i < lines.length; i++) {
      if (
        CSS_MODULE_IMPORT_REGEX.test(lines[i]) ||
        /\.module\.(css|scss|sass|less|pcss)/i.test(lines[i])
      ) {
        matchedLine = i + 1;
        snippet = lines[i].trim();
        break;
      }
    }

    violations.push({
      ruleId: "RULE-NO-CSS-MODULES",
      file: normalizedPath,
      line: matchedLine,
      snippet,
      message: `CSS Module island detected in "${normalizedPath}". Reintroduced CSS Modules are prohibited; use Civic Minimal Tailwind token utilities.`,
      likelyOwnershipLayer: "global",
    });
  }

  // Rule 3: RULE-NO-INLINE-STYLES (ordinary visual declarations)
  if (isTsxOrJsx && !isTestFile) {
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (
        trimmed.startsWith("//") ||
        trimmed.startsWith("/*") ||
        trimmed.startsWith("*")
      ) {
        continue;
      }

      if (/\bstyle\s*=\s*(?:\{\{|\{|\s*["'])/i.test(line)) {
        violations.push({
          ruleId: "RULE-NO-INLINE-STYLES",
          file: normalizedPath,
          line: i + 1,
          snippet: line.trim(),
          message: `Ordinary visual inline style declaration detected. Visual styling must use Tailwind utility classes; raw style props are prohibited.`,
          likelyOwnershipLayer: isRouteFile ? "route" : "pattern",
        });
      }
    }
  }

  // Rule 4: RULE-NO-ROUTE-GLOBAL-SELECTORS
  if (isRouteFile && !isTestFile) {
    if (
      content.includes("<style jsx global>") ||
      content.includes("<style global>") ||
      /<style[^>]*global/i.test(content) ||
      /<style(\s|>)/i.test(content)
    ) {
      violations.push({
        ruleId: "RULE-NO-ROUTE-GLOBAL-SELECTORS",
        file: normalizedPath,
        message: `Route file declares global or raw style tags. Routes must not own global styling or inject style elements.`,
        likelyOwnershipLayer: "route",
      });
    }
  }

  // Rule 5: RULE-UNDOCUMENTED-NATIVE-EXCEPTION
  if (isTsxOrJsx && !isTestFile && !isUiPrimitive) {
    // Check if the file is registered in native exceptions
    const registeredExceptions = (
      options.nativeExceptions ?? NATIVE_EXCEPTION_REGISTRY
    ).filter(
      (nex) => normalizeRepoPath(nex.location, repoRoot) === normalizedPath
    );

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comment lines
      const trimmed = line.trim();
      if (
        trimmed.startsWith("//") ||
        trimmed.startsWith("/*") ||
        trimmed.startsWith("*")
      ) {
        continue;
      }

      const tagRegex = /<(select|input|button|textarea|dialog)(?=\s|>|\/|$)/g;
      let match: RegExpExecArray | null;
      while ((match = tagRegex.exec(line)) !== null) {
        const tag = match[1];
        // Extract the opening tag while respecting quoted values and JSX expressions.
        const startIndex = match.index;
        const tagContent = findJsxOpeningTagSlice(lines, i, startIndex);

        const isAuthorized = registeredExceptions.some((nex) =>
          matchesNativeControlSelector(tag, tagContent, nex.control)
        );

        if (!isAuthorized) {
          violations.push({
            ruleId: "RULE-UNDOCUMENTED-NATIVE-EXCEPTION",
            file: normalizedPath,
            line: i + 1,
            snippet: line.trim(),
            message: `Undocumented native HTML element <${tag}> used in app-facing UI without matching registration in NATIVE_EXCEPTION_REGISTRY. Use shadcn primitives from web/components/ui/ or document native exception in registry.`,
            likelyOwnershipLayer: isRouteFile ? "route" : "pattern",
          });
          break; // One violation per line is sufficient
        }
      }
    }
  }

  // Rule 6: RULE-NO-ROUTE-CVA
  if (isRouteFile && !isTestFile) {
    const CVA_IMPORT_REGEX =
      /(?:from\s+['"`]class-variance-authority['"`]|(?:import|require)\s*\(\s*['"`]class-variance-authority['"`]\s*\)|import\s+['"`]class-variance-authority['"`])/i;
    const hasCvaImport = CVA_IMPORT_REGEX.test(content);
    const hasCvaCall = /\bcva\s*\(/i.test(content);

    if (hasCvaImport || hasCvaCall) {
      const lines = content.split("\n");
      let matchedLine: number | undefined;
      let snippet: string | undefined;

      for (let i = 0; i < lines.length; i++) {
        if (CVA_IMPORT_REGEX.test(lines[i]) || /\bcva\s*\(/i.test(lines[i])) {
          matchedLine = i + 1;
          snippet = lines[i].trim();
          break;
        }
      }

      violations.push({
        ruleId: "RULE-NO-ROUTE-CVA",
        file: normalizedPath,
        line: matchedLine,
        snippet,
        message: `Route-level CVA variant declared or imported in "${normalizedPath}". CVA belongs in primitive (web/components/ui/) or pattern (web/lib/) layers; routes compose existing primitives and patterns.`,
        likelyOwnershipLayer: "route",
      });
    }
  }

  // Rule 7: RULE-NO-FORBIDDEN-STYLING-HOOKS
  if (!isTestFile) {
    // Check for routine !important in CSS or unapproved styling runtimes
    if (isCssFile) {
      const cleanCss = stripCssComments(content);
      let line = 1;
      let lineStartIndex = 0;
      let inString: "'" | '"' | null = null;
      let braceDepth = 0;
      const mediaStack: Array<{ isPrint: boolean; braceDepth: number }> = [];
      let atRuleBuffer: string | null = null;

      for (let idx = 0; idx < cleanCss.length; idx++) {
        const char = cleanCss[idx];

        if (char === "\n") {
          line++;
          lineStartIndex = idx + 1;
        }

        // Handle string literals to avoid misinterpreting braces or !important inside strings
        if (inString !== null) {
          if (char === "\\") {
            idx++; // Skip escaped character
          } else if (char === inString) {
            inString = null;
          }
          continue;
        }

        if (char === "'" || char === '"') {
          inString = char;
          continue;
        }

        // If buffering @media expression until the opening brace '{'
        if (atRuleBuffer !== null) {
          if (char === "{") {
            const isPrint = isPrintMediaQuery(atRuleBuffer);
            braceDepth++;
            mediaStack.push({ isPrint, braceDepth });
            atRuleBuffer = null;
            continue;
          } else if (char === ";" || char === "}") {
            atRuleBuffer = null;
          } else {
            atRuleBuffer += char;
            continue;
          }
        }

        // Check for opening @media
        if (char === "@") {
          const remaining = cleanCss.slice(idx);
          const mediaMatch = remaining.match(/^@media\b/i);
          if (mediaMatch) {
            atRuleBuffer = "";
            idx += mediaMatch[0].length - 1;
            continue;
          }
        }

        // Handle opening brace
        if (char === "{") {
          braceDepth++;
          continue;
        }

        // Handle !important BEFORE closing braces
        if (char === "!") {
          const remaining = cleanCss.slice(idx);
          const importantMatch = remaining.match(/^!\s*important\b/i);
          if (importantMatch) {
            const isInsidePrint =
              mediaStack.length > 0 && mediaStack.every((m) => m.isPrint);
            if (!isInsidePrint) {
              const lineEnd = cleanCss.indexOf("\n", idx);
              const lineText = cleanCss
                .slice(
                  lineStartIndex,
                  lineEnd === -1 ? cleanCss.length : lineEnd
                )
                .trim();

              violations.push({
                ruleId: "RULE-NO-FORBIDDEN-STYLING-HOOKS",
                file: normalizedPath,
                line,
                snippet: lineText,
                message: `Routine !important containment hook detected in CSS outside @media print. Civic Minimal uses strict cascade layers and utility ordering.`,
                likelyOwnershipLayer: "global",
              });
            }
            idx += importantMatch[0].length - 1;
            continue;
          }
        }

        // Handle closing brace
        if (char === "}") {
          if (
            mediaStack.length > 0 &&
            mediaStack[mediaStack.length - 1].braceDepth === braceDepth
          ) {
            mediaStack.pop();
          }
          braceDepth = Math.max(0, braceDepth - 1);
          continue;
        }
      }
    }

    const FORBIDDEN_LIBRARIES_REGEX =
      /(?:from\s+['"`](?:styled-components(?:\/[^'"`\s]+)?|@emotion\/[^'"`\s]+|@emotion|aphrodite(?:\/[^'"`\s]+)?)['"`]|(?:import|require)\s*\(\s*['"`](?:styled-components(?:\/[^'"`\s]+)?|@emotion\/[^'"`\s]+|@emotion|aphrodite(?:\/[^'"`\s]+)?)['"`]\s*\)|import\s+['"`](?:styled-components(?:\/[^'"`\s]+)?|@emotion\/[^'"`\s]+|@emotion|aphrodite(?:\/[^'"`\s]+)?)['"`])/i;

    if (!isCssFile && FORBIDDEN_LIBRARIES_REGEX.test(content)) {
      const lines = content.split("\n");
      let matchedLine: number | undefined;
      let matchedSnippet: string | undefined;

      for (let i = 0; i < lines.length; i++) {
        if (FORBIDDEN_LIBRARIES_REGEX.test(lines[i])) {
          matchedLine = i + 1;
          matchedSnippet = lines[i].trim();
          break;
        }
      }

      violations.push({
        ruleId: "RULE-NO-FORBIDDEN-STYLING-HOOKS",
        file: normalizedPath,
        line: matchedLine,
        snippet: matchedSnippet,
        message: `Forbidden runtime styling library imported in "${normalizedPath}". Only Tailwind CSS and class-variance-authority are permitted.`,
        likelyOwnershipLayer: "global",
      });
    }
  }

  return violations;
}

/**
 * Runs governance static audit across repository files.
 */
export function auditSourceCode(options: AuditOptions = {}): AuditResult {
  const repoRoot = options.rootDir
    ? path.resolve(options.rootDir)
    : resolveRepoRoot();
  const scanErrors: AuditScanError[] = [];

  let refDate: Date;
  if (options.now !== undefined) {
    const parsedDate = parseStrictDateValue(options.now);
    if (parsedDate === undefined) {
      scanErrors.push({
        file: "validation",
        message: `Invalid reference date "${String(options.now)}" provided for audit`,
      });
      refDate = new Date(0);
    } else {
      refDate = parsedDate;
    }
  } else {
    refDate = new Date();
  }

  const activeWaivers = options.waivers ?? WAIVER_REGISTRY;
  const nativeExceptions =
    options.nativeExceptions ?? NATIVE_EXCEPTION_REGISTRY;

  const targetFiles: string[] = [];

  if (options.targetFiles !== undefined) {
    for (const f of options.targetFiles) {
      const resolved = resolveTargetFilePath(f, repoRoot);
      try {
        const stat = fs.lstatSync(resolved);
        if (stat.isSymbolicLink()) {
          scanErrors.push({
            file: normalizeRepoPath(f, repoRoot),
            message: `Target path "${f}" is a symbolic link. Explicit target files must be regular files.`,
          });
        } else if (stat.isDirectory()) {
          scanErrors.push({
            file: normalizeRepoPath(f, repoRoot),
            message: `Target path "${f}" is a directory. Explicit target file path expected.`,
          });
        } else if (!stat.isFile()) {
          scanErrors.push({
            file: normalizeRepoPath(f, repoRoot),
            message: `Target path "${f}" is not a regular file.`,
          });
        } else {
          targetFiles.push(resolved);
        }
      } catch (err) {
        scanErrors.push({
          file: normalizeRepoPath(f, repoRoot),
          message: `Target file does not exist or is unreadable: ${f} (${err instanceof Error ? err.message : String(err)})`,
          error: err,
        });
      }
    }
  } else {
    // Scan standard web directory
    const webDir = fs.existsSync(path.join(repoRoot, "web"))
      ? path.join(repoRoot, "web")
      : fs.existsSync(path.join(repoRoot, "app"))
        ? repoRoot
        : path.resolve(repoRoot, "web");

    if (!fs.existsSync(webDir)) {
      scanErrors.push({
        file: normalizeRepoPath(webDir, repoRoot),
        message: `Scan root directory does not exist: ${webDir}`,
      });
    } else {
      collectFilesRecursively(webDir, targetFiles, scanErrors);
    }
  }

  const rawViolations: AuditViolation[] = [];
  let scannedCount = 0;

  for (const filePath of targetFiles) {
    try {
      const stat = fs.lstatSync(filePath);
      if (stat.isSymbolicLink()) {
        scanErrors.push({
          file: normalizeRepoPath(filePath, repoRoot),
          message: `Path is a symbolic link, not a regular file: ${filePath}`,
        });
        continue;
      }
      if (!stat.isFile()) {
        scanErrors.push({
          file: normalizeRepoPath(filePath, repoRoot),
          message: `Path is not a regular file: ${filePath}`,
        });
        continue;
      }

      scannedCount++;
      const content = fs.readFileSync(filePath, "utf-8");
      const fileViolations = auditFileContent(filePath, content, {
        ...options,
        rootDir: repoRoot,
        nativeExceptions,
      });
      rawViolations.push(...fileViolations);
    } catch (err) {
      scanErrors.push({
        file: normalizeRepoPath(filePath, repoRoot),
        message: `Failed to read or audit file: ${err instanceof Error ? err.message : String(err)}`,
        error: err,
      });
    }
  }

  // Filter against active waivers
  const activeViolations: AuditViolation[] = [];
  const waivedViolations: AuditViolation[] = [];

  for (const violation of rawViolations) {
    const matchingWaiver = activeWaivers.find((waiver) => {
      if (waiver.ruleId !== violation.ruleId) return false;
      if (waiver.status !== "active") return false;

      // Check waiver expiration
      const expiryDate = parseStrictDateValue(waiver.expiresAt);
      if (expiryDate === undefined || expiryDate < refDate) {
        return false;
      }

      // Exact file match ONLY (canonical waivers are exact files; wildcards are prohibited)
      const matchesFile = waiver.affectedFiles.some((affFile) => {
        const normAff = normalizeRepoPath(affFile, repoRoot);
        const normViol = normalizeRepoPath(violation.file, repoRoot);
        return normAff === normViol;
      });

      if (!matchesFile) return false;
      if (violation.ruleId === "RULE-NO-UNLAYERED-HIGH-BLAST-RADIUS-CSS") {
        return waiver.sourceFingerprint === violation.sourceFingerprint;
      }
      return true;
    });

    if (matchingWaiver) {
      waivedViolations.push({
        ...violation,
        waived: true,
        waiverId: matchingWaiver.id,
      });
    } else {
      activeViolations.push(violation);
    }
  }

  return {
    passed: activeViolations.length === 0 && scanErrors.length === 0,
    violations: activeViolations,
    waivedViolations,
    scannedFilesCount: scannedCount,
    scanErrors: scanErrors.length > 0 ? scanErrors : undefined,
  };
}

function collectFilesRecursively(
  dir: string,
  fileList: string[],
  scanErrors: AuditScanError[],
  rootDir = dir
): void {
  try {
    const dirStat = fs.lstatSync(dir);
    if (dirStat.isSymbolicLink()) {
      scanErrors.push({
        file: dir,
        message: `Scan directory is a symbolic link and cannot be traversed: ${dir}`,
      });
      return;
    }
    if (!dirStat.isDirectory()) {
      scanErrors.push({
        file: dir,
        message: `Scan root is not a directory: ${dir}`,
      });
      return;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      // T03 owns the narrow exclusion for generated web outputs. Only the
      // web-root directories are excluded; a shipped route directory named
      // `out` or `.wrangler` must remain auditable.
      const isKnownGeneratedDirectory =
        dir === rootDir && (entry.name === "out" || entry.name === ".wrangler");
      if (
        entry.name === "node_modules" ||
        entry.name === ".next" ||
        isKnownGeneratedDirectory ||
        entry.name === "dist" ||
        entry.name === "coverage" ||
        entry.name === ".git" ||
        entry.name === ".scratch"
      ) {
        continue;
      }

      if (entry.isSymbolicLink()) {
        scanErrors.push({
          file: fullPath,
          message: `Symbolic link encountered during recursive audit: ${fullPath}`,
        });
      } else if (entry.isDirectory()) {
        collectFilesRecursively(fullPath, fileList, scanErrors, rootDir);
      } else if (entry.isFile()) {
        if (
          /\.(ts|tsx|js|jsx|css|scss|sass|less|pcss|json|mjs)$/i.test(
            entry.name
          )
        ) {
          fileList.push(fullPath);
        }
      }
    }
  } catch (err) {
    scanErrors.push({
      file: dir,
      message: `Failed to read directory: ${err instanceof Error ? err.message : String(err)}`,
      error: err,
    });
  }
}
