/* oxlint-disable eslint/prefer-named-capture-group -- this package targets ES2017; captures are destructured by position. */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { AuditViolation } from "./types";

const CONTROL_MODULES = new Set([
  "button",
  "checkbox",
  "input",
  "select",
  "switch",
  "textarea",
]);

const CONTROL_EXPORTS = new Set([
  "Button",
  "Checkbox",
  "Input",
  "Select",
  "SelectTrigger",
  "Switch",
  "Textarea",
]);

const CONTROL_RECIPE_EXPORTS = new Set([
  "buttonVariants",
  "selectTriggerVariants",
]);

const SAFE_LAYOUT_CLASSES = new Set(["min-w-0", "w-auto", "w-fit", "w-full"]);

const GIT_ENV_VARS = new Set([
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_COMMON_DIR",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_PREFIX",
  "GIT_GRAFT_FILE",
  "GIT_NAMESPACE",
  "GIT_SHALLOW_FILE",
]);

export interface ControlOverrideRatchetOptions {
  readonly rootDir?: string;
  readonly baseRef?: string;
  readonly targetFiles?: readonly string[];
}

function git(rootDir: string, args: readonly string[]): string {
  const env = {
    NODE_ENV: process.env.NODE_ENV,
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !GIT_ENV_VARS.has(key))
    ),
  };
  return execFileSync("git", args, {
    cwd: rootDir,
    encoding: "utf-8",
    env,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function tryGit(rootDir: string, args: readonly string[]): string | undefined {
  try {
    const value = git(rootDir, args);
    return value || undefined;
  } catch {
    return undefined;
  }
}

/** Resolve an explicit or current branch comparison base; never ticket-pin a SHA. */
export function resolveControlOverrideBase(
  rootDir: string,
  suppliedBase?: string
): string | undefined {
  const explicit = suppliedBase?.trim();
  if (explicit) {
    return explicit;
  }

  const ciSha = process.env.GITHUB_BASE_SHA?.trim();
  if (ciSha && tryGit(rootDir, ["rev-parse", "--verify", ciSha])) {
    return ciSha;
  }

  const configured = process.env.T08_CONTROL_COMPARISON_BASE?.trim();
  if (configured && tryGit(rootDir, ["rev-parse", "--verify", configured])) {
    return configured;
  }

  const baseRef = process.env.GITHUB_BASE_REF?.trim();
  if (baseRef) {
    for (const candidate of [`origin/${baseRef}`, baseRef]) {
      const mergeBase = tryGit(rootDir, ["merge-base", candidate, "HEAD"]);
      if (mergeBase) {
        return mergeBase;
      }
      if (tryGit(rootDir, ["rev-parse", "--verify", candidate])) {
        return candidate;
      }
    }
  }

  const upstreamMergeBase = tryGit(rootDir, ["merge-base", "@{u}", "HEAD"]);
  if (upstreamMergeBase) {
    return upstreamMergeBase;
  }

  for (const candidate of ["origin/main", "main", "origin/master", "master"]) {
    const mergeBase = tryGit(rootDir, ["merge-base", candidate, "HEAD"]);
    if (mergeBase) {
      return mergeBase;
    }
  }

  const previous = tryGit(rootDir, ["rev-parse", "--verify", "HEAD~1"]);
  return previous;
}

function lineNumberAt(source: string, offset: number): number {
  return source.slice(0, offset).split("\n").length;
}

function addedLines(diff: string): Set<number> {
  const result = new Set<number>();
  let nextLine = 0;

  for (const line of diff.split("\n")) {
    if (/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/u.test(line)) {
      const plus = line.indexOf("+");
      const end = line.indexOf(" ", plus);
      nextLine = Number(line.slice(plus + 1, end).split(",", 1)[0]);
      continue;
    }
    if (line.startsWith("+++")) {
      continue;
    }
    if (line.startsWith("+")) {
      result.add(nextLine);
      nextLine += 1;
    } else if (!line.startsWith("-")) {
      nextLine += 1;
    }
  }

  return result;
}

interface OpeningElement {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly source: string;
}

interface ControlBindings {
  readonly elements: Set<string>;
  readonly recipes: Set<string>;
}

function findOpeningElements(
  source: string,
  names: ReadonlySet<string>
): OpeningElement[] {
  const elements: OpeningElement[] = [];
  const opening = /<[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\b/gu;
  let match: RegExpExecArray | null;

  while ((match = opening.exec(source)) !== null) {
    const name = match[0].slice(1);
    if (!name) {
      continue;
    }
    if (!names.has(name)) {
      continue;
    }

    let index = opening.lastIndex;
    let braceDepth = 0;
    let quote: "'" | '"' | null = null;

    for (; index < source.length; index += 1) {
      const char = source[index];
      if (quote !== null) {
        if (char === "\\") {
          index += 1;
        } else if (char === quote) {
          quote = null;
        }
        continue;
      }
      if (char === "'" || char === '"') {
        quote = char;
      } else if (char === "{") {
        braceDepth += 1;
      } else if (char === "}" && braceDepth > 0) {
        braceDepth -= 1;
      } else if (char === ">" && braceDepth === 0) {
        elements.push({
          name,
          start: match.index,
          end: index + 1,
          source: source.slice(match.index, index + 1),
        });
        opening.lastIndex = index + 1;
        break;
      }
    }
  }

  return elements;
}

function isControlModule(modulePath: string): boolean {
  const moduleName = modulePath
    .slice("@/components/ui".length)
    .replace(/^\//u, "");
  return moduleName === "" || CONTROL_MODULES.has(moduleName);
}

// oxlint-disable-next-line eslint/complexity -- finite import and wrapper binding parser
function importedControls(source: string): ControlBindings {
  const elements = new Set<string>();
  const recipes = new Set<string>();
  const namedImports =
    /import\s*\{([\s\S]*?)\}\s*from\s*["'](@\/components\/ui(?:\/[^"']+)?)["']/gu;

  for (const match of source.matchAll(namedImports)) {
    const [, specifiers, modulePath] = match;
    if (!specifiers || !modulePath || !isControlModule(modulePath)) {
      continue;
    }
    for (const specifier of specifiers.split(",")) {
      const parts = specifier.trim().split(/\s+as\s+/u);
      const imported = parts[0]?.trim();
      const local = parts[1]?.trim() || imported;
      if (imported && local && CONTROL_EXPORTS.has(imported)) {
        elements.add(local);
      }
      if (imported && local && CONTROL_RECIPE_EXPORTS.has(imported)) {
        recipes.add(local);
      }
    }
  }

  const namespaceImports =
    /import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s*["'](@\/components\/ui(?:\/[^"']+)?)["']/gu;
  for (const match of source.matchAll(namespaceImports)) {
    const [, namespace, modulePath] = match;
    if (!namespace || !modulePath || !isControlModule(modulePath)) {
      continue;
    }
    for (const name of CONTROL_EXPORTS) {
      elements.add(`${namespace}.${name}`);
    }
    for (const name of CONTROL_RECIPE_EXPORTS) {
      recipes.add(`${namespace}.${name}`);
    }
  }

  // Resolve common component-wrapper/factory aliases while keeping unrelated
  // dynamic class expressions outside the known-control scope.
  const aliases =
    /\b(?:const|let|var)\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(?:(?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$][\w$]*\s*\(\s*)?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)/gu;
  let changed = true;
  while (changed) {
    changed = false;
    for (const match of source.matchAll(aliases)) {
      const [, local, target] = match;
      if (local && target && elements.has(target) && !elements.has(local)) {
        elements.add(local);
        changed = true;
      }
    }
  }

  // A named factory result is still an app-facing control even when the
  // factory hides its source binding from the simple alias pattern.
  const namedFactories =
    /\b(?:const|let|var)\s+([A-Z][A-Za-z0-9_]*(?:Button|Checkbox|Input|Select|Switch|Textarea))\s*=\s*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\(/gu;
  for (const match of source.matchAll(namedFactories)) {
    const [, local] = match;
    if (local) {
      elements.add(local);
    }
  }

  return { elements, recipes };
}

function balancedCallEnd(source: string, openIndex: number): number {
  let depth = 0;
  let quote: "'" | '"' | "`" | null = null;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (quote !== null) {
      if (char === "\\") {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }

  return source.length;
}

function findFactoryElements(
  source: string,
  names: ReadonlySet<string>
): OpeningElement[] {
  const elements: OpeningElement[] = [];
  const calls =
    /(?:React\.)?(?:createElement|jsx|jsxs)\s*\(\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)/gu;

  for (const match of source.matchAll(calls)) {
    const [, name] = match;
    if (!name || !names.has(name) || match.index === undefined) {
      continue;
    }
    const openIndex = source.indexOf("(", match.index);
    if (openIndex === -1) {
      continue;
    }
    const end = balancedCallEnd(source, openIndex);
    elements.push({
      name,
      start: match.index,
      end,
      source: source.slice(match.index, end),
    });
  }

  return elements;
}

function findRecipeUses(
  source: string,
  names: ReadonlySet<string>
): OpeningElement[] {
  const elements: OpeningElement[] = [];
  const calls = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*\(/gu;

  for (const match of source.matchAll(calls)) {
    const [, name] = match;
    if (!name || !names.has(name) || match.index === undefined) {
      continue;
    }
    const openIndex = source.indexOf("(", match.index);
    if (openIndex === -1) {
      continue;
    }
    const end = balancedCallEnd(source, openIndex);
    elements.push({
      name,
      start: match.index,
      end,
      source: source.slice(match.index, end),
    });
  }

  return elements;
}

function attributes(
  source: string,
  name: string
): { value: string; offset: number; dynamic: boolean }[] {
  const result: { value: string; offset: number; dynamic: boolean }[] = [];
  const marker = new RegExp(
    String.raw`${name}\s*(?:=|:)\s*(?:"[^"]*"|'[^']*'|\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})`,
    "gu"
  );

  for (const match of source.matchAll(marker)) {
    const [full] = match;
    if (!full) {
      continue;
    }
    const separator = full.search(/[=:]/u);
    const raw = full.slice(separator + 1).trim();
    result.push({
      value: raw.slice(1, -1),
      offset: match.index ?? 0,
      dynamic: raw.startsWith("{"),
    });
  }

  return result;
}

function quotedLiterals(value: string): string[] {
  const result: string[] = [];
  let index = 0;

  while (index < value.length) {
    const quote = value[index];
    if (quote !== "'" && quote !== '"') {
      index += 1;
      continue;
    }
    const start = index + 1;
    index += 1;
    for (; index < value.length; index += 1) {
      if (value[index] === "\\") {
        index += 1;
      } else if (value[index] === quote) {
        result.push(value.slice(start, index));
        index += 1;
        break;
      }
    }
  }

  return result;
}

function staticClassTokens(value: string): string[] {
  return value.split(/\s+/u).filter(Boolean);
}

function isQuotedString(value: string): boolean {
  const trimmed = value.trim();
  return (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  );
}

function isIdentifierExpression(value: string): boolean {
  return /^!?[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*$/u.test(value.trim());
}

function isStaticallyClassifiableExpression(value: string): boolean {
  const expression = value.trim();
  if (isQuotedString(expression)) {
    return true;
  }

  const question = expression.indexOf("?");
  const colon = expression.indexOf(":", question + 1);
  if (
    question > 0 &&
    colon > question &&
    !expression.includes("?", question + 1)
  ) {
    return (
      isQuotedString(expression.slice(question + 1, colon)) &&
      isQuotedString(expression.slice(colon + 1))
    );
  }

  const and = expression.indexOf("&&");
  return (
    and > 0 &&
    !expression.includes("&&", and + 2) &&
    isIdentifierExpression(expression.slice(0, and)) &&
    isQuotedString(expression.slice(and + 2))
  );
}

function ownedProperty(token: string): string | undefined {
  const normalized = token.replace(/!$/u, "").split(":").at(-1) ?? token;
  if (SAFE_LAYOUT_CLASSES.has(normalized)) {
    return undefined;
  }
  if (
    /^(?:min-|max-)?h-(?!auto$)/u.test(normalized) ||
    normalized.startsWith("size-")
  ) {
    return "target/height";
  }
  if (/^(?:min-w-(?:11|\[44px\])|w-(?:11|\[44px\]))$/u.test(normalized)) {
    return "target/height";
  }
  if (/^(?:p|px|py|pt|pr|pb|pl)-/u.test(normalized)) {
    return "padding";
  }
  if (/^rounded(?:-|$)/u.test(normalized)) {
    return "radius";
  }
  if (/^(?:focus|focus-visible|active|outline|ring)(?:-|$)/u.test(normalized)) {
    return "focus";
  }
  return undefined;
}

function violation(
  file: string,
  line: number,
  message: string,
  snippet?: string
): AuditViolation {
  return {
    ruleId: "RULE-NO-NEW-CONTROL-OVERRIDE",
    file,
    line,
    snippet,
    message,
    likelyOwnershipLayer: "primitive",
  };
}

function inspectElement(
  file: string,
  source: string,
  element: OpeningElement,
  added: ReadonlySet<number>
): AuditViolation[] {
  const startLine = lineNumberAt(source, element.start);
  const endLine = lineNumberAt(source, element.end);
  let changed = false;
  for (let line = startLine; line <= endLine; line += 1) {
    if (added.has(line)) {
      changed = true;
      break;
    }
  }
  if (!changed) {
    return [];
  }

  const violations: AuditViolation[] = [];
  const line = startLine;

  if (/\{\s*\.\.\./u.test(element.source)) {
    violations.push(
      violation(
        file,
        line,
        `${element.name} caller spread props added may hide primitive-owned styling`,
        element.source.trim()
      )
    );
  }

  for (const attr of attributes(element.source, "style")) {
    violations.push(
      violation(
        file,
        lineNumberAt(source, element.start + attr.offset),
        `${element.name} caller inline style was added; primitive-owned presentation must remain classifiable`,
        attr.value
      )
    );
  }

  for (const attr of attributes(element.source, "className")) {
    const attrLine = lineNumberAt(source, element.start + attr.offset);
    if (!attr.dynamic) {
      for (const token of staticClassTokens(attr.value)) {
        const property = ownedProperty(token);
        if (property) {
          violations.push(
            violation(
              file,
              attrLine,
              `${element.name} caller override ${JSON.stringify(token)} redefines primitive-owned ${property}`,
              token
            )
          );
        }
      }
      continue;
    }

    const literals = quotedLiterals(attr.value);
    if (literals.length === 0) {
      violations.push(
        violation(
          file,
          attrLine,
          `${element.name} dynamic className is not statically classifiable; classify primitive-owned styling explicitly`,
          attr.value.trim()
        )
      );
      continue;
    }

    const hasCall = /[A-Za-z_$][\w$]*\s*\(/u.test(
      attr.value.replaceAll(/(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/gu, " ")
    );
    const dynamicTokens = literals.flatMap(staticClassTokens);
    const unsafe = dynamicTokens.filter((token) => ownedProperty(token));
    if (
      (hasCall || !isStaticallyClassifiableExpression(attr.value)) &&
      unsafe.length === 0
    ) {
      violations.push(
        violation(
          file,
          attrLine,
          `${element.name} dynamic className expression is not statically classifiable`,
          attr.value.trim()
        )
      );
      continue;
    }
    for (const token of unsafe) {
      const property = ownedProperty(token);
      if (property) {
        violations.push(
          violation(
            file,
            attrLine,
            `${element.name} dynamic caller override ${JSON.stringify(token)} redefines primitive-owned ${property}`,
            attr.value.trim()
          )
        );
      }
    }
  }

  return violations;
}

function inspectRecipeUse(
  file: string,
  source: string,
  recipe: OpeningElement,
  added: ReadonlySet<number>
): AuditViolation[] {
  const startLine = lineNumberAt(source, recipe.start);
  const endLine = lineNumberAt(source, recipe.end);
  for (let line = startLine; line <= endLine; line += 1) {
    if (added.has(line)) {
      return [
        violation(
          file,
          startLine,
          `${recipe.name} imported control recipe was added in app-facing code; classify primitive-owned styling through the control instead`,
          recipe.source.trim()
        ),
      ];
    }
  }
  return [];
}

function productionPath(file: string): boolean {
  return (
    file.startsWith("web/") &&
    !file.startsWith("web/components/ui/") &&
    !file.includes("/.storybook/") &&
    !file.includes("/prototype/") &&
    !file.includes(".test.")
  );
}

function normalizeTargetFile(rootDir: string, file: string): string {
  const normalized = file.replaceAll(path.sep, "/");
  const root = `${path.resolve(rootDir).replaceAll(path.sep, "/")}/`;
  return normalized.startsWith(root)
    ? normalized.slice(root.length)
    : normalized.replace(/^\.\//u, "");
}

export function auditNewControlOverrides(
  options: ControlOverrideRatchetOptions = {}
): AuditViolation[] {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const baseRef = resolveControlOverrideBase(rootDir, options.baseRef);
  if (!baseRef) {
    return [
      violation(
        "git-discovery",
        0,
        "Control override ratchet could not resolve a comparison base"
      ),
    ];
  }

  let diff: string;
  try {
    diff = git(rootDir, [
      "diff",
      "--unified=0",
      "--no-color",
      baseRef,
      "--",
      "web",
    ]);
  } catch (error) {
    return [
      violation(
        "git-discovery",
        0,
        `Control override ratchet could not inspect comparison base ${JSON.stringify(baseRef)}: ${error instanceof Error ? error.message : String(error)}`
      ),
    ];
  }

  const targets = options.targetFiles
    ? new Set(
        options.targetFiles.map((file) => normalizeTargetFile(rootDir, file))
      )
    : undefined;
  const fileDiffs = new Map<string, string>();
  let currentFile = "";
  let currentDiff = "";
  const flush = () => {
    if (currentFile) {
      fileDiffs.set(currentFile, currentDiff);
    }
  };

  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      flush();
      const marker = line.lastIndexOf(" b/");
      currentFile = marker === -1 ? "" : line.slice(marker + 3);
      currentDiff = `${line}\n`;
    } else if (currentFile) {
      currentDiff += `${line}\n`;
    }
  }
  flush();

  const violations: AuditViolation[] = [];
  for (const [file, fileDiff] of fileDiffs) {
    if (!productionPath(file) || (targets && !targets.has(file))) {
      continue;
    }
    const fullPath = path.join(rootDir, file);
    if (!fs.existsSync(fullPath)) {
      continue;
    }
    const source = fs.readFileSync(fullPath, "utf-8");
    const bindings = importedControls(source);
    if (bindings.elements.size === 0 && bindings.recipes.size === 0) {
      continue;
    }
    const added = addedLines(fileDiff);
    const elements = [
      ...findOpeningElements(source, bindings.elements),
      ...findFactoryElements(source, bindings.elements),
    ];
    for (const element of elements) {
      violations.push(...inspectElement(file, source, element, added));
    }
    for (const recipe of findRecipeUses(source, bindings.recipes)) {
      violations.push(...inspectRecipeUse(file, source, recipe, added));
    }
  }

  return violations;
}
