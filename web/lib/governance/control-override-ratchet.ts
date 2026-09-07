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
    const remoteRef = `origin/${baseRef}`;
    if (tryGit(rootDir, ["rev-parse", "--verify", remoteRef])) {
      return remoteRef;
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
      nextLine = Number(line.slice(plus + 1, end));
      continue;
    }
    if (line.startsWith("+++")) {
      continue;
    }
    if (line.startsWith("+")) {
      result.add(nextLine);
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

function findOpeningElements(
  source: string,
  names: ReadonlySet<string>
): OpeningElement[] {
  const elements: OpeningElement[] = [];
  const opening = /<[A-Z][A-Za-z0-9_]*\b/gu;
  let match: RegExpExecArray | null;

  while ((match = opening.exec(source)) !== null) {
    const name = match[0].slice(1);
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

function importedControls(source: string): Set<string> {
  const names = new Set<string>();
  const imports =
    /import\s*\{[\s\S]*?\}\s*from\s*["']@\/components\/ui\/[^"']+["']/gu;

  for (const match of source.matchAll(imports)) {
    const [statement] = match;
    if (!statement) {
      continue;
    }
    const open = statement.indexOf("{");
    const close = statement.lastIndexOf("}");
    const specifiers = statement.slice(open + 1, close);
    const modulePrefix = "@/components/ui/";
    const moduleStart = statement.indexOf(modulePrefix) + modulePrefix.length;
    const doubleEnd = statement.indexOf('"', moduleStart);
    const singleEnd = statement.indexOf("'", moduleStart);
    const moduleEnd =
      doubleEnd === -1
        ? singleEnd
        : singleEnd === -1
          ? doubleEnd
          : Math.min(doubleEnd, singleEnd);

    if (!CONTROL_MODULES.has(statement.slice(moduleStart, moduleEnd))) {
      continue;
    }
    for (const specifier of specifiers.split(",")) {
      const parts = specifier.trim().split(/\s+as\s+/u);
      const imported = parts[0]?.trim();
      const local = parts[1]?.trim() || imported;
      if (imported && local && CONTROL_EXPORTS.has(imported)) {
        names.add(local);
      }
    }
  }

  return names;
}

function attributes(
  source: string,
  name: string
): { value: string; offset: number; dynamic: boolean }[] {
  const result: { value: string; offset: number; dynamic: boolean }[] = [];
  const marker = new RegExp(
    String.raw`${name}\s*=\s*(?:"[^"]*"|'[^']*'|\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})`,
    "gu"
  );

  for (const match of source.matchAll(marker)) {
    const [full] = match;
    if (!full) {
      continue;
    }
    const equals = full.indexOf("=");
    const raw = full.slice(equals + 1).trim();
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
    if (hasCall && unsafe.length === 0) {
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
    const names = importedControls(source);
    if (names.size === 0) {
      continue;
    }
    const added = addedLines(fileDiff);
    for (const element of findOpeningElements(source, names)) {
      violations.push(...inspectElement(file, source, element, added));
    }
  }

  return violations;
}
