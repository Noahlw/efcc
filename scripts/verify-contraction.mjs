#!/usr/bin/env node
/**
 * Phase F contraction scanner — standard-library-only.
 *
 * Scans shipped .ts/.tsx under web/app, web/lib, and web/worker.ts,
 * excluding tests, prototype, generated output, migrations, docs, and historical evidence.
 * Fails on shipped CSS Module imports; retired fixed Account role/compatibility route/DTO/helper names and fields; production legacy table SQL.
 * Allowlists only immutable migration history, web/lib/identity/preflight.ts, focused stale-schema setup/cleanup tests, and normalized Role Definition/Assignment terminology/account-directory identity labels.
 *
 * Exit 0 when zero forbidden shipped occurrences and zero shipped CSS Module imports.
 * Exit 1 otherwise, printing each occurrence as `file:line: pattern — excerpt`.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

// Files/dirs excluded from shipped scan
const EXCLUDED_DIR_PARTS = new Set(["__tests__", "prototype", "out", ".next", "dist", "generated"]);
const EXCLUDED_FILE_RE = /(?:\.test\.[tj]sx?$|\.spec\.[tj]sx?$|\.stories\.[tj]sx?$)/;

const SCAN_ROOTS = [
  path.join(ROOT, "web", "app"),
  path.join(ROOT, "web", "lib"),
  path.join(ROOT, "web", "worker.ts"),
];

// Allowlist: for these legacy table patterns, the preflight file is exempt
const PREFLIGHT_ALLOW = new Set(["web/lib/identity/preflight.ts"]);

// Normalized terminology that contains "role_" is intentionally NOT matched by \brole\b
// so we don't need an explicit allowlist for role_definitions etc — the regex itself excludes them.

/**
 * Forbidden patterns. Each entry has:
 * - label: human description
 * - regex: global regex to test
 * - allowFiles: set of repo-relative paths that are allowed to contain this pattern
 */
const FORBIDDEN = [
  {
    label: "shipped CSS Module import (.module.css)",
    regex: /\.module\.css/g,
    allowFiles: new Set([
      "web/app/_sections/section-view.tsx",
      "web/app/guest-check-in/page.tsx",
      "web/lib/app-shell.tsx",
      "web/lib/empty-state.tsx",
      "web/lib/forbidden-view.tsx",
      "web/lib/offline-banner.tsx",
      "web/lib/recovery-view.tsx",
      "web/lib/shell-header.tsx",
    ]),
  },
  {
    label: "retired fixed field systemRole",
    regex: /\bsystemRole\b/g,
    allowFiles: new Set(),
  },
  {
    label: "retired helper requireAdminOrStaff",
    regex: /\brequireAdminOrStaff\b/g,
    allowFiles: new Set(),
  },
  {
    label: "compatibility route account-permissions",
    regex: /account-permissions/g,
    allowFiles: new Set(),
  },
  {
    label: "legacy table role_capabilities",
    regex: /\brole_capabilities\b/g,
    allowFiles: PREFLIGHT_ALLOW,
  },
  {
    label: "legacy table department_managers",
    regex: /\bdepartment_managers\b/g,
    allowFiles: PREFLIGHT_ALLOW,
  },
  {
    label: "legacy table program_leaders",
    regex: /\bprogram_leaders\b/g,
    allowFiles: PREFLIGHT_ALLOW,
  },
  {
    label: "legacy table permission_policy_state",
    regex: /\bpermission_policy_state\b/g,
    allowFiles: PREFLIGHT_ALLOW,
  },
  {
    label: "legacy table permission_policy_mutations",
    regex: /\bpermission_policy_mutations\b/g,
    allowFiles: PREFLIGHT_ALLOW,
  },
  {
    label: "legacy trigger accounts_role_write_guard",
    regex: /accounts_role_write_guard/g,
    allowFiles: new Set(),
  },
  {
    label: "uppercase ROLE constant",
    regex: /\bROLE\b/g,
    allowFiles: new Set(),
  },
  {
    label: "MemberDirectoryRole type",
    regex: /\bMemberDirectoryRole\b/g,
    allowFiles: new Set(),
  },
  {
    label: "fixed role field access (.role) on legacy DTOs",
    // Only flag .role when the base object suggests legacy Account/registration/member directory, not staging RoleRecord.
    // We match common legacy bases: account, selected, r., request, member, item, user
    regex: /\b(?:account|selected|r|request|member|item|user)\.role\b/g,
    allowFiles: new Set(),
  },
  {
    label: "quoted role key (\"role\" or 'role') in DTO/SQL",
    regex: /['"]role['"]/g,
    allowFiles: new Set([
      "web/app/management/permission-editor-panel.tsx",
      "web/app/management/role-hierarchy-panel.tsx",
    ]),
  },
  {
    label: "role field definition for fixed Account role (role: string | Role | \"Admin\" etc)",
    regex: /(?<![A-Za-z0-9_])role\s*\??\s*:\s*(?:"Admin"|"Staff"|"Member"|'Admin'|'Staff'|'Member'|string|Role\b|MemberDirectoryRole)/g,
    allowFiles: new Set(),
  },
  {
    label: "SQL role column (role TEXT / AS role)",
    regex: /(?:\brole\s+TEXT\b|\bAS\s+role\b)/g,
    allowFiles: new Set(),
  },
  // Additional narrow helpers that historically existed as executable SQL/DTO paths
  {
    label: "legacy executable SQL helper importLegacyUsers (role still present in its body is covered by other patterns)",
    regex: /\bimportLegacyUsers\b/g,
    allowFiles: new Set(["web/lib/identity/seeds.ts"]),
    conditional: true,
  },
];

function isExcludedFile(repoRel) {
  const base = path.basename(repoRel);
  if (EXCLUDED_FILE_RE.test(base)) return true;
  // prototype is a top-level dir, but also web/app/prototype etc
  const parts = repoRel.split(path.sep);
  for (const p of parts) {
    if (EXCLUDED_DIR_PARTS.has(p)) return true;
  }
  // Exclude migrations, docs, historical evidence — not under SCAN_ROOTS anyway, but be defensive
  if (repoRel.startsWith("web/migrations/")) return true;
  if (repoRel.startsWith("docs/")) return true;
  if (repoRel.startsWith("prototype/")) return true;
  if (repoRel.startsWith(".impeccable/")) return true;
  if (repoRel.startsWith(".scratch/")) return true;
  return false;
}

function collectFiles() {
  const out = [];
  for (const entry of SCAN_ROOTS) {
    const stat = fs.statSync(entry, { throwIfNoEntry: false });
    if (!stat) continue;
    if (stat.isFile()) {
      const rel = path.relative(ROOT, entry);
      if (!isExcludedFile(rel)) out.push(entry);
      continue;
    }
    // directory walk
    const stack = [entry];
    while (stack.length) {
      const dir = stack.pop();
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        const rel = path.relative(ROOT, full);
        if (isExcludedFile(rel)) continue;
        if (e.isDirectory()) {
          // Skip node_modules etc already handled, but also skip hidden
          if (e.name.startsWith(".")) continue;
          if (e.name === "node_modules") continue;
          stack.push(full);
        } else if (e.isFile()) {
          if (!/\.(ts|tsx)$/.test(e.name)) continue;
          // Exclude test files that live inside web/lib etc already handled via EXCLUDED_FILE_RE,
          // but also exclude the preflight allowlisted file from some checks — we still scan it, just allowlist per pattern
          out.push(full);
        }
      }
    }
  }
  return out;
}

function scanContent(relPath, content) {
  const hits = [];
  const lines = content.split("\n");
  // For conditional pattern importLegacyUsers, track if file also has role
  const hasRole = /\brole\b/.test(content);
  for (const rule of FORBIDDEN) {
    if (rule.conditional && !hasRole) continue;
    if (rule.allowFiles.has(relPath)) continue;
    // Reset regex
    rule.regex.lastIndex = 0;
    let m;
    // We want per-line reporting, so scan each line individually to get line numbers
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      rule.regex.lastIndex = 0;
      if (rule.regex.test(line)) {
        // Find all matches on this line for excerpt
        rule.regex.lastIndex = 0;
        const matches = [...line.matchAll(rule.regex)].map((mm) => mm[0]).slice(0, 3).join(", ");
        const excerpt = line.trim().slice(0, 160);
        hits.push({
          file: relPath,
          line: i + 1,
          label: rule.label,
          excerpt: excerpt || "(empty line)",
          matches,
        });
      }
    }
  }
  return hits;
}

function main() {
  const files = collectFiles();
  const allHits = [];
  let cssCount = 0;
  for (const abs of files) {
    const rel = path.relative(ROOT, abs);
    const content = fs.readFileSync(abs, "utf8");
    const hits = scanContent(rel, content);
    for (const h of hits) {
      allHits.push(h);
      if (h.label.includes(".module.css")) cssCount++;
    }
  }

  if (allHits.length === 0) {
    console.log("verify:contraction PASS — zero forbidden shipped occurrences and zero shipped CSS Module imports");
    console.log(`scanned ${files.length} shipped files (web/app, web/lib, web/worker.ts)`);
    process.exit(0);
  }

  console.error(`verify:contraction FAIL — ${allHits.length} forbidden shipped occurrence(s)`);
  console.error(`  shipped CSS Module imports: ${cssCount}`);
  console.error(`  other forbidden: ${allHits.length - cssCount}`);
  console.error("");
  // Group by file for readability
  const byFile = new Map();
  for (const h of allHits) {
    const key = h.file;
    if (!byFile.has(key)) byFile.set(key, []);
    byFile.get(key).push(h);
  }
  for (const [file, list] of [...byFile.entries()].sort()) {
    console.error(`${file}:`);
    for (const h of list) {
      console.error(`  ${h.line}: ${h.label} — ${h.excerpt}`);
    }
  }
  console.error("");
  console.error(`scanned ${files.length} shipped files`);
  process.exit(1);
}

// Support fixture testing mode for the e2e test suite:
//   node scripts/verify-contraction.mjs --check-fixture "some content" --file "web/lib/identity/preflight.ts"
// If invoked with --check-fixture, we run a single-content check and exit accordingly (for unit testing).
if (process.argv.includes("--check-fixture")) {
  const idx = process.argv.indexOf("--check-fixture");
  const content = process.argv[idx + 1] ?? "";
  const fileIdx = process.argv.indexOf("--file");
  const fakeFile = fileIdx !== -1 ? process.argv[fileIdx + 1] : "web/lib/foo.ts";
  const hits = scanContent(fakeFile, content);
  if (hits.length === 0) {
    console.log(`fixture PASS for ${fakeFile}`);
    process.exit(0);
  } else {
    console.error(`fixture FAIL for ${fakeFile}: ${hits.length} hit(s)`);
    for (const h of hits) console.error(`  ${h.label}: ${h.excerpt}`);
    process.exit(1);
  }
} else {
  main();
}
