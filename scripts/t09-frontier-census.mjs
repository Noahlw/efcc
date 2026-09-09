#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_PARENT =
  "6ab0561f9d79b32e2ca5345325a5cb46f01d2e13";
export const PARENT_BRANCH = "rescue/t08-control-contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWED = new Set([
  "MIGRATE_NOW",
  "VALID_CALLER_LAYOUT",
  "BOUNDED_LATER_DEBT",
  "NATIVE_EXCEPTION",
  "REFERENCE_PRESERVE",
  "NOT_T09",
  "PROVEN_FALSE_POSITIVE",
]);
const PRODUCTION_EXTENSIONS = /\.(?:css|js|jsx|mjs|ts|tsx)$/u;
const EXCLUDED =
  /(?:^|\/)(?:prototype|stories|__tests__|generated|storybook-static)(?:\/|$)|(?:\.test|\.spec|\.stories)\.|(?:^|\/)\.storybook(?:\/|$)|(?:^|\/)test-setup\./u;
const SURFACE_TOKEN =
  /^(?:border(?:-|$)|bg-|p(?:[trblxy])?(?:-|$)|rounded(?:-|$)|shadow(?:-|$)|ring(?:-|$)|gap(?:-|$)|overflow(?:-|$))/u;
const SHARED_OVERLAY_TOKEN =
  /^(?:border(?:-|$)|bg-|p(?:[trblxy])?(?:-|$)|rounded(?:-|$)|shadow(?:-|$)|max-h-|overflow-|pb-.*safe-area|safe-area)/u;
const CALLER_LAYOUT_TOKEN =
  /^(?:w-|max-w-|min-w-|h-|sm:|md:|lg:|xl:|top-|right-|bottom-|left-|inset-|translate-|order-|justify-|self-|grid|flex|items-|text-|mt-|mb-|mx-|my-|space-|min-h-|side-)/u;
const HIGH_RISK_FEEDBACK = new Set([
  "web/app/page.tsx",
  "web/lib/recovery-view.tsx",
  "web/lib/approval-queue.tsx",
]);
const REFERENCE_FEEDBACK = new Set(["web/lib/programs/program-form.tsx"]);
const OVERLAY_PRIMITIVES = new Set([
  "web/components/ui/dialog.tsx",
  "web/components/ui/sheet.tsx",
  "web/components/ui/alert-dialog.tsx",
]);
const OVERLAY_CALLER_NAMES = new Set([
  "Dialog",
  "DialogContent",
  "Sheet",
  "SheetContent",
  "AlertDialog",
  "AlertDialogContent",
]);

function git(args) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function isProductionFile(file) {
  return (
    file.startsWith("web/") &&
    PRODUCTION_EXTENSIONS.test(file) &&
    !EXCLUDED.test(file)
  );
}

function productionFiles() {
  return git(["ls-files", "-z"])
    .split("\0")
    .filter(Boolean)
    .filter(isProductionFile);
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function lineNumber(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function lineAt(source, line) {
  return source.split("\n")[line - 1]?.trim().replace(/\s+/gu, " ") ?? "";
}

function symbolAt(source, offset, fallback) {
  const lines = source.slice(0, offset).split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = lines[index].match(
      /(?:export\s+)?(?:const|function|class)\s+([A-Za-z_$][\w$]*)/u
    );
    if (match) return match[1];
  }
  return fallback;
}

function tagEnd(source, start) {
  let quote = "";
  let braces = 0;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") {
      braces += 1;
      continue;
    }
    if (char === "}") {
      braces = Math.max(0, braces - 1);
      continue;
    }
    if (char === ">" && braces === 0) return index;
  }
  return source.length - 1;
}

function openingTags(source, names) {
  const tags = [];
  const matcher = /<([A-Za-z_$][\w$]*)\b/gu;
  let match;
  while ((match = matcher.exec(source))) {
    if (!names.has(match[1])) continue;
    const end = tagEnd(source, match.index);
    tags.push({
      name: match[1],
      start: match.index,
      end,
      source: source.slice(match.index, end + 1),
    });
    matcher.lastIndex = end + 1;
  }
  return tags;
}

function attribute(tag, name) {
  const staticMatch = tag.match(
    new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "u")
  );
  if (staticMatch) {
    return { value: staticMatch[1], dynamic: false };
  }
  const dynamic = new RegExp(`${name}\\s*=\\s*\\{`, "u").test(tag);
  return { value: "", dynamic };
}

function classInfo(tag) {
  const attr = attribute(tag, "className");
  const tokens = attr.value.split(/\s+/u).filter(Boolean);
  return {
    ...attr,
    tokens,
    owned: tokens.filter((token) => SURFACE_TOKEN.test(token)),
    sharedOverlay: tokens.filter((token) => SHARED_OVERLAY_TOKEN.test(token)),
    layout: tokens.filter((token) => CALLER_LAYOUT_TOKEN.test(token)),
    spread: /\{\s*\.\.\./u.test(tag),
  };
}

function styleGroups(tokens) {
  const groups = new Set();
  for (const token of tokens) {
    if (/^rounded/u.test(token)) groups.add("radius");
    if (/^border(?:-|$)/u.test(token)) groups.add("border");
    if (/^bg-/u.test(token)) groups.add("background");
    if (/^p(?:[trblxy])?(?:-|$)/u.test(token)) groups.add("padding");
    if (/^shadow/u.test(token)) groups.add("elevation");
  }
  return groups;
}

function hasCommentOnlyLine(line) {
  return /^(?:\/\/|\/\*|\*|\*\/)/u.test(line.trim());
}

function census() {
  const records = [];
  const files = productionFiles();
  const add = ({
    family,
    file,
    start,
    end = start,
    symbol,
    concern,
    disposition,
    laterOwner = "",
    evidence = "",
  }) => {
    if (!ALLOWED.has(disposition)) {
      throw new Error(`Invalid disposition ${disposition} at ${file}:${start}`);
    }
    records.push({
      id: `CEN-${String(records.length + 1).padStart(3, "0")}`,
      family,
      file,
      line: start === end ? String(start) : `${start}-${end}`,
      symbol,
      concern,
      disposition,
      laterOwner,
      evidence,
    });
  };

  const cardPrimitive = "web/components/ui/card.tsx";
  add({
    family: "surface",
    file: cardPrimitive,
    start: 5,
    end: 21,
    symbol: "Card",
    concern:
      "Shared Card owns radius, background, vertical padding, overflow, ring, gap, and size density; CardHeader/Content/Footer consume the spacing token.",
    disposition: "MIGRATE_NOW",
    laterOwner: "T09.2 / D2-A",
    evidence: lineAt(read(cardPrimitive), 10),
  });

  const cardTags = new Set(["Card", "CardHeader", "CardTitle", "CardDescription", "CardAction", "CardContent", "CardFooter"]);
  for (const file of files) {
    const source = read(file);
    for (const tag of openingTags(source, cardTags)) {
      const info = classInfo(tag.source);
      const start = lineNumber(source, tag.start);
      const owned = info.owned;
      const dynamic = info.dynamic || info.spread;
      const isCardRoot = tag.name === "Card";
      const concern = isCardRoot
        ? `Card root surface tokens: ${owned.join(", ") || "none"}; ${dynamic ? "dynamic class/spread requires review" : "static caller expression"}.`
        : "Card subcomponent usage; spacing and nested surface boundary remain primitive-owned.";
      let disposition = "VALID_CALLER_LAYOUT";
      let laterOwner = "";
      if (!isCardRoot || owned.length || dynamic) {
        disposition = "MIGRATE_NOW";
        laterOwner = "T09.2 / D2-A";
      }
      if (file === "web/lib/programs/participant-program-detail.tsx" && owned.length) {
        disposition = "BOUNDED_LATER_DEBT";
        laterOwner = "T10 composition grammar / nested borderless detail surface";
      }
      add({
        family: "surface",
        file,
        start,
        end: lineNumber(source, tag.end),
        symbol: symbolAt(source, tag.start, tag.name),
        concern,
        disposition,
        laterOwner,
        evidence: tag.source.replace(/\s+/gu, " ").trim(),
      });
    }
  }

  const customSurfaceTags = new Set(["div", "section", "article", "aside"]);
  for (const file of files) {
    if (file.startsWith("web/components/ui/")) continue;
    const source = read(file);
    for (const tag of openingTags(source, customSurfaceTags)) {
      const info = classInfo(tag.source);
      const groups = styleGroups(info.tokens);
      if (
        !info.value ||
        groups.size < 3 ||
        !(groups.has("border") && groups.has("background"))
      ) {
        continue;
      }
      const start = lineNumber(source, tag.start);
      add({
        family: "surface-bypass",
        file,
        start,
        end: lineNumber(source, tag.end),
        symbol: symbolAt(source, tag.start, tag.name),
        concern: `Raw ${tag.name} surface bypasses Card with ${[...groups].join(", ")} tokens; no shared semantic identity is proven by this census.`,
        disposition: "BOUNDED_LATER_DEBT",
        laterOwner: "T10 composition grammar / exact caller surface",
        evidence: tag.source.replace(/\s+/gu, " ").trim(),
      });
    }
  }

  const alertPrimitive = "web/components/ui/alert.tsx";
  add({
    family: "feedback",
    file: alertPrimitive,
    start: 22,
    end: 35,
    symbol: "Alert",
    concern:
      "Alert unconditionally emits role=alert, so visual default/destructive variants currently imply assertive urgency.",
    disposition: "MIGRATE_NOW",
    laterOwner: "T09.3 / D2-B",
    evidence: lineAt(read(alertPrimitive), 30),
  });

  const alertTags = new Set(["Alert"]);
  const alertFiles = new Map();
  const announceFiles = new Map();
  for (const file of files) {
    const source = read(file);
    const alerts = openingTags(source, alertTags);
    const announces = [];
    const matcher = /\bannounce\s*\(/gu;
    let match;
    while ((match = matcher.exec(source))) {
      const line = lineNumber(source, match.index);
      if (file === "web/lib/live-region.tsx" && line === 12) continue;
      announces.push(line);
    }
    if (alerts.length) alertFiles.set(file, alerts.map((tag) => lineNumber(source, tag.start)));
    if (announces.length) announceFiles.set(file, announces);

    for (const tag of alerts) {
      const start = lineNumber(source, tag.start);
      const info = classInfo(tag.source);
      const variant = attribute(tag.source, "variant");
      let disposition = "REFERENCE_PRESERVE";
      let laterOwner = "";
      if (
        HIGH_RISK_FEEDBACK.has(file) ||
        variant.dynamic ||
        (!variant.value && file === "web/app/home/page.tsx")
      ) {
        disposition = "MIGRATE_NOW";
        laterOwner = "T09.3 / D2-B";
      } else if (REFERENCE_FEEDBACK.has(file)) {
        disposition = "REFERENCE_PRESERVE";
      }
      add({
        family: "feedback",
        file,
        start,
        end: lineNumber(source, tag.end),
        symbol: symbolAt(source, tag.start, "Alert"),
        concern: `Visible Alert variant ${variant.value || (variant.dynamic ? "dynamic" : "default")}; ${info.dynamic ? "class expression is dynamic" : "class is statically visible"}.`,
        disposition,
        laterOwner,
        evidence: tag.source.replace(/\s+/gu, " ").trim(),
      });
    }

    for (const line of announces) {
      let disposition = "REFERENCE_PRESERVE";
      let laterOwner = "";
      if (HIGH_RISK_FEEDBACK.has(file)) {
        disposition = "MIGRATE_NOW";
        laterOwner = "T09.3 / D2-B";
      } else if (REFERENCE_FEEDBACK.has(file)) {
        disposition = "REFERENCE_PRESERVE";
      } else if (alerts.length || /aria-live|role\s*=\s*["'](?:alert|status)["']/u.test(source)) {
        disposition = "BOUNDED_LATER_DEBT";
        laterOwner = `T09.6 caller migration / ${file}`;
      }
      add({
        family: "feedback-announcement",
        file,
        start: line,
        symbol: symbolAt(source, source.split("\n").slice(0, line - 1).join("\n").length, "announce"),
        concern: "Global polite announcement call; verify it is the sole owner for this transition when visible feedback also renders.",
        disposition,
        laterOwner,
        evidence: lineAt(source, line),
      });
    }

    const lines = source.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const text = lines[index];
      if (hasCommentOnlyLine(text)) continue;
      if (!/(?:aria-live|aria-atomic|role\s*=\s*(?:["'](?:alert|status)["']|\{[^}]*\b(?:alert|status)\b))/u.test(text)) {
        continue;
      }
      const line = index + 1;
      let disposition = "REFERENCE_PRESERVE";
      let laterOwner = "";
      if (file === alertPrimitive || file === "web/lib/live-region.tsx" || file === "web/lib/approval-queue.tsx") {
        disposition = "MIGRATE_NOW";
        laterOwner = "T09.3 / D2-B";
      } else if (file === "web/lib/offline-banner.tsx") {
        disposition = "NATIVE_EXCEPTION";
      } else if (REFERENCE_FEEDBACK.has(file)) {
        disposition = "REFERENCE_PRESERVE";
      } else if (alerts.length || announceFiles.has(file)) {
        disposition = "BOUNDED_LATER_DEBT";
        laterOwner = `T09.6 caller migration / ${file}`;
      }
      add({
        family: "feedback-semantics",
        file,
        start: line,
        symbol: symbolAt(source, source.split("\n").slice(0, index).join("\n").length, "feedback output"),
        concern: "Explicit alert/status/live-region ownership; reconcile visual tone and assistive urgency without duplicate transition announcements.",
        disposition,
        laterOwner,
        evidence: text.trim(),
      });
    }
  }

  for (const [file, alertLines] of alertFiles) {
    if (!announceFiles.has(file)) continue;
    const source = read(file);
    const highRisk = HIGH_RISK_FEEDBACK.has(file);
    add({
      family: "feedback-overlap",
      file,
      start: Math.min(...alertLines, ...announceFiles.get(file)),
      end: Math.max(...alertLines, ...announceFiles.get(file)),
      symbol: path.basename(file),
      concern: `Same production module contains visible Alert lines ${alertLines.join(", ")} and announce() lines ${announceFiles.get(file).join(", ")}; source requires an explicit one-owner decision per transition.`,
      disposition: highRisk ? "MIGRATE_NOW" : REFERENCE_FEEDBACK.has(file) ? "REFERENCE_PRESERVE" : "BOUNDED_LATER_DEBT",
      laterOwner: highRisk ? "T09.3 / D2-B" : REFERENCE_FEEDBACK.has(file) ? "" : `T09.6 caller migration / ${file}`,
      evidence: `${file}:${alertLines.join(",")}; announce:${announceFiles.get(file).join(",")}`,
    });
  }

  const feedSource = read("web/lib/feed-presentation.tsx");
  const feedLine = feedSource.split("\n").findIndex((line) => line.includes("data-feed-announcement-owner")) + 1;
  if (feedLine > 0) {
    add({
      family: "feedback-announcement",
      file: "web/lib/feed-presentation.tsx",
      start: feedLine,
      symbol: "FeedPresentation",
      concern: "Documented visible-error versus global-polite announcement ownership split is the canonical compatibility reference.",
      disposition: "REFERENCE_PRESERVE",
      evidence: lineAt(feedSource, feedLine),
    });
  }

  for (const file of OVERLAY_PRIMITIVES) {
    const source = read(file);
    const lines = source.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index].includes("z-[var(--layer-overlay)]")) continue;
      const isOverlay = /(?:overlay|content)/iu.test(lines[index]);
      if (!isOverlay) continue;
      add({
        family: "overlay-foundation",
        file,
        start: index + 1,
        symbol: symbolAt(source, source.split("\n").slice(0, index).join("\n").length, path.basename(file)),
        concern: "Backdrop/content currently share --layer-overlay; explicit backdrop < content ordering and universal containment must be primitive-owned.",
        disposition: "MIGRATE_NOW",
        laterOwner: "T09.4/T09.5 / D3",
        evidence: lines[index].trim(),
      });
    }
  }

  const globalCss = read("web/app/globals.css");
  const overlayTokenLine = globalCss.split("\n").findIndex((line) => line.includes("--layer-overlay:")) + 1;
  if (overlayTokenLine > 0) {
    add({
      family: "overlay-layer-token",
      file: "web/app/globals.css",
      start: overlayTokenLine,
      symbol: "theme",
      concern: "Single overlay layer token is shared by backdrop and content; preserve shell ordering while introducing explicit semantic order.",
      disposition: "MIGRATE_NOW",
      laterOwner: "T09.4/T09.5 / D3",
      evidence: lineAt(globalCss, overlayTokenLine),
    });
  }

  for (const file of files) {
    if (OVERLAY_PRIMITIVES.has(file)) continue;
    const source = read(file);
    const tags = openingTags(source, OVERLAY_CALLER_NAMES);
    const nativeDialogs = openingTags(source, new Set(["dialog"]));
    const hasOverlayImport = /@\/components\/ui\/(?:dialog|sheet|alert-dialog)/u.test(source);
    if (!tags.length && !nativeDialogs.length && !hasOverlayImport) continue;

    for (const tag of nativeDialogs) {
      const start = lineNumber(source, tag.start);
      add({
        family: "overlay-native",
        file,
        start,
        end: lineNumber(source, tag.end),
        symbol: symbolAt(source, tag.start, "dialog"),
        concern: "Native non-modal notification dialog/popover preserves platform focus and disclosure semantics; do not replace for visual uniformity.",
        disposition: "NATIVE_EXCEPTION",
        evidence: tag.source.replace(/\s+/gu, " ").trim(),
      });
    }

    for (const tag of tags) {
      const start = lineNumber(source, tag.start);
      const info = classInfo(tag.source);
      if (tag.name === "Dialog" || tag.name === "Sheet" || tag.name === "AlertDialog") {
        add({
          family: "overlay-caller",
          file,
          start,
          end: lineNumber(source, tag.end),
          symbol: symbolAt(source, tag.start, tag.name),
          concern: `${tag.name} root preserves caller-owned open state, route/domain consequence, and dismissal behavior.`,
          disposition: file === "web/app/management/management-action-framework.tsx" ? "VALID_CALLER_LAYOUT" : "REFERENCE_PRESERVE",
          evidence: tag.source.replace(/\s+/gu, " ").trim(),
        });
        continue;
      }
      const shared = info.sharedOverlay;
      const layout = info.layout;
      if (info.dynamic && file !== "web/lib/attention-panel.tsx") {
        add({
          family: "overlay-caller",
          file,
          start,
          end: lineNumber(source, tag.end),
          symbol: symbolAt(source, tag.start, tag.name),
          concern: `${tag.name} className expression is dynamic and needs explicit owned-property classification.`,
          disposition: "BOUNDED_LATER_DEBT",
          laterOwner: `T09.6 caller migration / ${file}`,
          evidence: tag.source.replace(/\s+/gu, " ").trim(),
        });
      } else if (shared.length) {
        add({
          family: "overlay-caller-owned",
          file,
          start,
          end: lineNumber(source, tag.end),
          symbol: symbolAt(source, tag.start, tag.name),
          concern: `${tag.name} repeats primitive-owned containment/surface tokens: ${shared.join(", ")}.`,
          disposition: "MIGRATE_NOW",
          laterOwner: "T09.4/T09.5 / D3",
          evidence: tag.source.replace(/\s+/gu, " ").trim(),
        });
      }
      if (layout.length || (!shared.length && !info.dynamic)) {
        add({
          family: "overlay-caller-layout",
          file,
          start,
          end: lineNumber(source, tag.end),
          symbol: symbolAt(source, tag.start, tag.name),
          concern: `${tag.name} caller placement/width/layout remains route or workflow-owned: ${layout.join(", ") || "no shared override"}.`,
          disposition: file === "web/lib/attention-panel.tsx" ? "REFERENCE_PRESERVE" : "VALID_CALLER_LAYOUT",
          evidence: tag.source.replace(/\s+/gu, " ").trim(),
        });
      }
    }

    for (const [index, line] of source.split("\n").entries()) {
      if (!/(?:onOpenAutoFocus|onCloseAutoFocus|onInteractOutside|onEscapeKeyDown|onPointerDownOutside)/u.test(line)) continue;
      add({
        family: "overlay-focus",
        file,
        start: index + 1,
        symbol: symbolAt(source, source.split("\n").slice(0, index).join("\n").length, "overlay caller"),
        concern: "Caller focus/dismissal override is retained as a compatibility tracer; primitive migration must preserve Radix focus return and Escape behavior.",
        disposition: "REFERENCE_PRESERVE",
        evidence: line.trim(),
      });
    }
  }

  const special = [
    [
      "web/app/management/management-action-framework.tsx",
      23,
      "ActionSurface",
      "Existing management action surface owns scroll, action clearance, and shell placement; it is not a new Card/Sheet primitive.",
      "REFERENCE_PRESERVE",
      "",
    ],
    [
      "web/lib/offline-banner.tsx",
      34,
      "OfflineBanner",
      "Native role=status banner uses its own z layer and safe-area top reserve; platform/status semantics are intentionally independent of Alert.",
      "NATIVE_EXCEPTION",
      "",
    ],
    [
      "web/app/globals.css",
      438,
      "attention-panel",
      "Existing attention Dialog tracer owns top-right placement, bounded height, overflow, surface tokens, and overlay z layer in the approved CSS seam.",
      "REFERENCE_PRESERVE",
      "",
    ],
    [
      "web/lib/programs/programs-notifications.tsx",
      54,
      "notificationPopover",
      "Native dialog notification popover owns local placement, containment, and non-modal disclosure behavior.",
      "NATIVE_EXCEPTION",
      "",
    ],
  ];
  for (const [file, line, symbol, concern, disposition, laterOwner] of special) {
    add({
      family: "overlay-or-surface-exception",
      file,
      start: line,
      symbol,
      concern,
      disposition,
      laterOwner,
      evidence: lineAt(read(file), line),
    });
  }

  for (const file of [
    "web/components/ui/card.tsx",
    "web/components/ui/alert.tsx",
    "web/components/ui/dialog.tsx",
    "web/components/ui/sheet.tsx",
    "web/components/ui/alert-dialog.tsx",
  ]) {
    const source = read(file);
    for (const [index, line] of source.split("\n").entries()) {
      if (!/\{\.\.\.(?:props|rest)\}/u.test(line)) continue;
      add({
        family: "spread-review",
        file,
        start: index + 1,
        symbol: symbolAt(source, source.split("\n").slice(0, index).join("\n").length, path.basename(file)),
        concern: "Primitive prop spread forwards the public DOM/Radix API after the owned class; it is not a caller styling escape.",
        disposition: "PROVEN_FALSE_POSITIVE",
        evidence: line.trim(),
      });
    }
  }

  return { files, records };
}

function summary(result) {
  const byDisposition = Object.fromEntries(
    [...ALLOWED].map((disposition) => [
      disposition,
      result.records.filter((record) => record.disposition === disposition).length,
    ])
  );
  const byFamily = Object.fromEntries(
    [...new Set(result.records.map((record) => record.family))].sort().map((family) => [
      family,
      result.records.filter((record) => record.family === family).length,
    ])
  );
  return {
    fixedParent: git(["rev-parse", PARENT_BRANCH]),
    head: git(["rev-parse", "HEAD"]),
    mergeBase: git(["merge-base", PARENT_BRANCH, "HEAD"]),
    productionFiles: result.files.length,
    records: result.records.length,
    byDisposition,
    byFamily,
    unknownRecords: result.records.filter((record) => !ALLOWED.has(record.disposition)).length,
  };
}

function check(result) {
  const report = summary(result);
  if (report.fixedParent !== EXPECTED_PARENT) {
    throw new Error(`Parent moved: expected ${EXPECTED_PARENT}, got ${report.fixedParent}`);
  }
  if (report.mergeBase !== EXPECTED_PARENT) {
    throw new Error(`Branch is not based on ${EXPECTED_PARENT}; merge-base is ${report.mergeBase}`);
  }
  if (!result.records.length) throw new Error("Census produced no records");
  if (report.unknownRecords) throw new Error("Census contains unknown dispositions");
  for (const record of result.records) {
    if (
      !record.file ||
      !record.line ||
      !record.symbol ||
      !record.concern ||
      !record.evidence
    ) {
      throw new Error(`Incomplete census record: ${record.id}`);
    }
    if (record.disposition === "BOUNDED_LATER_DEBT" && !record.laterOwner) {
      throw new Error(`Bounded debt lacks owner: ${record.id}`);
    }
    if (!isProductionFile(record.file)) {
      throw new Error(`Record outside production scope: ${record.file}`);
    }
  }
  const protectedChanges = git(["diff", "--name-only", `${EXPECTED_PARENT}...HEAD`])
    .split("\n")
    .filter((file) => /^(?:web\/(?:app|components|lib)\/)/u.test(file));
  if (protectedChanges.length) {
    throw new Error(`T09.0 changed protected production files: ${protectedChanges.join(", ")}`);
  }
  return report;
}

function markdownCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function markdown(result) {
  const report = summary(result);
  const lines = [
    "# T09.0 frontier census register",
    "",
    `Fixed parent: \`${report.fixedParent}\` (` + PARENT_BRANCH + ")",
    `Implementation HEAD: \`${report.head}\``,
    `Production scope: ${report.productionFiles} committed files under \`web/\`; tests, Stories, prototypes, generated output, and dependency output excluded.`,
    "",
    "The complete register below is generated by `node scripts/t09-frontier-census.mjs --markdown`; no production contract is changed by this tool.",
    "",
    "| Disposition | Records |",
    "|---|---:|",
    ...Object.entries(report.byDisposition).map(([key, value]) => `| ${key} | ${value} |`),
    `| **Total** | **${report.records}** |`,
    "",
    "| ID | Family | Source | Symbol | Concern | Evidence | Disposition | Later owner |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const record of result.records) {
    lines.push(
      `| ${record.id} | ${record.family} | \`${record.file}:${record.line}\` | ${markdownCell(record.symbol)} | ${markdownCell(record.concern)} | ${markdownCell(record.evidence)} | ${record.disposition} | ${markdownCell(record.laterOwner || "—")} |`
    );
  }
  return lines.join("\n");
}

const result = census();
const args = new Set(process.argv.slice(2));
if (args.has("--check")) {
  console.log(JSON.stringify({ status: "PASS", ...check(result) }, null, 2));
} else if (args.has("--json")) {
  console.log(JSON.stringify({ summary: summary(result), records: result.records }, null, 2));
} else if (args.has("--markdown")) {
  console.log(markdown(result));
} else {
  console.log(JSON.stringify(summary(result), null, 2));
}
