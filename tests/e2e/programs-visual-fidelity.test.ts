import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  expect as playwrightExpect,
  test as playwrightTest,
} from "@playwright/test";
import type { Page } from "@playwright/test";

const expect = playwrightExpect;
const test = playwrightTest;

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const artifactDirectory = path.resolve(
  process.env.PROGRAMS_VISUAL_ARTIFACT_DIR ?? ""
);

const VISUAL_CASES = [
  [
    "participant-directory-member",
    "t07-3-programs--participant-directory",
    "01b-participant-directory-member.html",
  ],
  [
    "participant-directory-capable",
    "t07-3-programs-material-states--participant-directory-capable",
    "01-participant-directory-capable.html",
  ],
  [
    "participant-program-detail",
    "t07-3-programs--participant-program-detail",
    "02-participant-program-detail.html",
  ],
  [
    "participant-event-detail",
    "t07-3-programs--participant-event-detail",
    "03-participant-event-detail.html",
  ],
  [
    "management-directory",
    "t07-3-programs--management-directory",
    "04-management-directory.html",
  ],
  [
    "workspace-overview",
    "t07-3-programs--workspace-overview",
    "05-management-workspace-overview.html",
  ],
  [
    "workspace-events",
    "t07-3-programs--workspace-events",
    "06-management-events.html",
  ],
  [
    "workspace-schedule",
    "t07-3-programs--workspace-schedule",
    "07-management-schedule.html",
  ],
  [
    "workspace-participants",
    "t07-3-programs--workspace-participants",
    "08-management-participants.html",
  ],
  [
    "workspace-settings",
    "t07-3-programs--workspace-settings",
    "09-management-settings.html",
  ],
  [
    "workspace-notifications",
    "t07-3-programs--workspace-notifications",
    "10-management-notifications.html",
  ],
] as const;

const VIEWPORTS = [
  { width: 402, height: 874 },
  { width: 360, height: 800 },
] as const;

const CONTACT_SHEETS = [
  "actual-402x874.png",
  "frozen-402x874.png",
  "actual-360x800.png",
  "frozen-360x800.png",
] as const;

const manifestPath = path.join(artifactDirectory, "manifest.json");

type VisualCase = (typeof VISUAL_CASES)[number];
type Viewport = (typeof VIEWPORTS)[number];

interface PageMeasurements {
  routeMarkerCount: number;
  shellMainCount: number;
  busyStateCount: number;
  horizontalOverflow: number;
  mainContentOverflow: number;
  minimumVisibleTargetSize: number;
  viewportWidth: number;
  viewportHeight: number;
  documentWidth: number;
  documentHeight: number;
}

interface ImageDimensions {
  width: number;
  height: number;
}

interface VisualManifestRow {
  caseKey: string;
  storyId: string;
  candidateSha: string;
  viewport: Viewport;
  prototypePath: string;
  prototypeSha256: string;
  actualImage: string;
  frozenImage: string;
  actualImageDimensions: ImageDimensions;
  frozenImageDimensions: ImageDimensions;
  actual: PageMeasurements;
  frozen: PageMeasurements;
  capturedAt: string;
}

interface VisualManifest {
  schemaVersion: 1;
  candidateSha: string;
  viewports: readonly Viewport[];
  caseCount: number;
  contactSheets: readonly string[];
  rows: VisualManifestRow[];
  generatedAt: string;
}

const candidateSha = process.env.PROGRAMS_CANDIDATE_SHA?.trim() ?? "";

function artifactPath(fileName: string) {
  const root = `${path.resolve(artifactDirectory)}${path.sep}`;
  const target = path.resolve(artifactDirectory, fileName);
  if (!target.startsWith(root)) {
    throw new Error(
      `Artifact path escapes PROGRAMS_VISUAL_ARTIFACT_DIR: ${fileName}`
    );
  }
  return target;
}

function viewportLabel(viewport: Viewport) {
  return `${viewport.width}x${viewport.height}`;
}

function storyUrl(storyId: string) {
  return `/iframe.html?id=${storyId}&viewMode=story`;
}

function prototypeFile(prototypeName: string) {
  return path.join(
    repositoryRoot,
    "docs/design/programs-screen-foundations-v1",
    prototypeName
  );
}

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function pngDimensions(value: Buffer): ImageDimensions {
  if (
    value.length < 24 ||
    value.readUInt32BE(0) !== 0x89_50_4e_47 ||
    value.readUInt32BE(4) !== 0x0d_0a_1a_0a
  ) {
    throw new Error("Expected a PNG screenshot artifact.");
  }
  return {
    width: value.readUInt32BE(16),
    height: value.readUInt32BE(20),
  };
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
}

async function measure(
  page: Page,
  mainSelector: "main#shell-content" | "main.page"
): Promise<PageMeasurements> {
  return page.evaluate((selector) => {
    const documentElement = document.documentElement;
    const body = document.body;
    const main = document.querySelector<HTMLElement>(selector);
    const targets = [
      ...document.querySelectorAll<HTMLElement>(
        'a[href], button, input, textarea, select, [role="button"]'
      ),
    ].filter((target) => {
      const box = target.getBoundingClientRect();
      const style = getComputedStyle(target);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        box.width > 0 &&
        box.height > 0
      );
    });
    const boxes = targets.map((target) => target.getBoundingClientRect());

    return {
      routeMarkerCount: document.querySelectorAll(
        '[data-screen-route="programs"]'
      ).length,
      shellMainCount: document.querySelectorAll(selector).length,
      busyStateCount: document.querySelectorAll('[aria-busy="true"]').length,
      horizontalOverflow: Math.max(
        0,
        Math.max(documentElement.scrollWidth, body.scrollWidth) -
          window.innerWidth
      ),
      mainContentOverflow: main
        ? Math.max(0, main.scrollWidth - main.clientWidth)
        : Number.MAX_SAFE_INTEGER,
      minimumVisibleTargetSize:
        boxes.length === 0
          ? 0
          : Math.min(...boxes.map((box) => Math.min(box.width, box.height))),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: Math.max(documentElement.scrollWidth, body.scrollWidth),
      documentHeight: Math.max(documentElement.scrollHeight, body.scrollHeight),
    };
  }, mainSelector);
}

function assertActualGeometry(
  measurements: PageMeasurements,
  viewport: Viewport
) {
  expect(measurements.routeMarkerCount).toBe(1);
  expect(measurements.shellMainCount).toBe(1);
  expect(measurements.busyStateCount).toBe(0);
  expect(measurements.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(measurements.mainContentOverflow).toBeLessThanOrEqual(1);
  expect(measurements.minimumVisibleTargetSize).toBeGreaterThanOrEqual(44);
  expect(measurements.viewportWidth).toBe(viewport.width);
  expect(measurements.viewportHeight).toBe(viewport.height);
}

async function capturePage(
  page: Page,
  fileName: string
): Promise<ImageDimensions> {
  const outputPath = artifactPath(fileName);
  await page.screenshot({ path: outputPath, fullPage: true });
  return pngDimensions(await readFile(outputPath));
}

async function exists(filePath: string) {
  return access(filePath)
    .then(() => true)
    .catch(() => false);
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function escapeHtml(value: string) {
  return value.replaceAll(
    /[&<>"']/gu,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character
  );
}

async function renderContactSheet(
  page: Page,
  fileName: string,
  rows: readonly VisualManifestRow[],
  imageKey: "actualImage" | "frozenImage"
) {
  const cards = await Promise.all(
    rows.map(async (row) => {
      const imageName = row[imageKey];
      const image = (await readFile(artifactPath(imageName))).toString(
        "base64"
      );
      return `<figure><img src="data:image/png;base64,${image}" alt="${escapeHtml(
        row.caseKey
      )}"><figcaption>${escapeHtml(row.caseKey)}</figcaption></figure>`;
    })
  );
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.setContent(
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;background:#ebe8e2;color:#1b1d1f;font-family:system-ui,sans-serif}body{padding:24px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}figure{margin:0;padding:12px;background:#fff;border:1px solid #d7d1c8;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08)}img{display:block;width:100%;height:auto;max-height:700px;object-fit:contain;object-position:top;background:#f7f5f1}figcaption{padding-top:8px;font-size:14px;font-weight:700}
</style></head><body><div class="grid">${cards.join("")}</div></body></html>`,
    {
      waitUntil: "load",
    }
  );
  await settle(page);
  await page.screenshot({ path: artifactPath(fileName), fullPage: true });
}

async function finalizeArtifacts(page: Page) {
  const shardRows = await Promise.all(
    VIEWPORTS.map(async (viewport) => {
      const shardPath = artifactPath(`rows-${viewportLabel(viewport)}.json`);
      const shard = JSON.parse(await readFile(shardPath, "utf-8")) as {
        rows: VisualManifestRow[];
      };
      return shard.rows;
    })
  );
  const rows = shardRows.flat();
  rows.sort((left, right) => {
    const leftViewport = viewportLabel(left.viewport);
    const rightViewport = viewportLabel(right.viewport);
    return (
      VIEWPORTS.findIndex(
        (viewport) => viewportLabel(viewport) === leftViewport
      ) -
        VIEWPORTS.findIndex(
          (viewport) => viewportLabel(viewport) === rightViewport
        ) ||
      VISUAL_CASES.findIndex((visualCase) => visualCase[0] === left.caseKey) -
        VISUAL_CASES.findIndex((visualCase) => visualCase[0] === right.caseKey)
    );
  });

  expect(rows).toHaveLength(VISUAL_CASES.length * VIEWPORTS.length);
  const actualSheets = VIEWPORTS.map((viewport) => ({
    viewport,
    rows: rows.filter(
      (row) => viewportLabel(row.viewport) === viewportLabel(viewport)
    ),
  }));
  for (const { viewport, rows: viewportRows } of actualSheets) {
    await renderContactSheet(
      page,
      `actual-${viewportLabel(viewport)}.png`,
      viewportRows,
      "actualImage"
    );
    await renderContactSheet(
      page,
      `frozen-${viewportLabel(viewport)}.png`,
      viewportRows,
      "frozenImage"
    );
  }

  await writeJson(manifestPath, {
    schemaVersion: 1,
    candidateSha,
    viewports: VIEWPORTS,
    caseCount: VISUAL_CASES.length,
    contactSheets: CONTACT_SHEETS,
    rows,
    generatedAt: new Date().toISOString(),
  } satisfies VisualManifest);
}

async function assertManifestContract() {
  const manifest = JSON.parse(
    await readFile(manifestPath, "utf-8")
  ) as VisualManifest;
  expect(manifest.schemaVersion).toBe(1);
  expect(manifest.candidateSha).toBe(candidateSha);
  expect(manifest.caseCount).toBe(VISUAL_CASES.length);
  expect(manifest.viewports).toEqual(VIEWPORTS);
  expect(manifest.rows).toHaveLength(VISUAL_CASES.length * VIEWPORTS.length);
  expect(manifest.contactSheets).toEqual([...CONTACT_SHEETS]);

  const expectedKeys = new Set(
    VIEWPORTS.flatMap((viewport) =>
      VISUAL_CASES.map(([caseKey]) => `${caseKey}@${viewportLabel(viewport)}`)
    )
  );
  expect(
    new Set(
      manifest.rows.map(
        (row) => `${row.caseKey}@${viewportLabel(row.viewport)}`
      )
    )
  ).toEqual(expectedKeys);
  for (const row of manifest.rows) {
    expect(row.candidateSha).toBe(candidateSha);
    expect(row.prototypePath).toMatch(
      /^docs\/design\/programs-screen-foundations-v1\/.*\.html$/u
    );
    expect(row.prototypeSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(row.actualImageDimensions.width).toBe(row.viewport.width);
    expect(row.frozenImageDimensions.width).toBe(row.viewport.width);
    expect(row.actual.routeMarkerCount).toBe(1);
    expect(row.actual.shellMainCount).toBe(1);
    expect(row.actual.busyStateCount).toBe(0);
    expect(row.actual.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(row.actual.mainContentOverflow).toBeLessThanOrEqual(1);
    expect(row.actual.minimumVisibleTargetSize).toBeGreaterThanOrEqual(44);
    expect(row.frozen.shellMainCount).toBe(1);
    expect(row.frozen.busyStateCount).toBe(0);
    expect(row.frozen.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(row.frozen.mainContentOverflow).toBeLessThanOrEqual(1);
  }
  for (const sheet of CONTACT_SHEETS) {
    expect(await exists(artifactPath(sheet))).toBe(true);
  }
}

test("Programs visual harness satisfies its output contract", async ({
  page,
}) => {
  await mkdir(artifactDirectory, { recursive: true });
  const projectName = test.info().project.name;
  const viewport = VIEWPORTS.find(
    (candidate) => viewportLabel(candidate) === projectName
  );
  if (!viewport) {
    throw new Error(`Unexpected visual project: ${projectName}`);
  }

  const rows: VisualManifestRow[] = [];
  for (const [
    caseKey,
    storyId,
    prototypeName,
  ] of VISUAL_CASES as readonly VisualCase[]) {
    await page.goto(storyUrl(storyId), { waitUntil: "domcontentloaded" });
    const routeMarker = page.locator(
      '[data-screen-foundation="page-frame"][data-screen-route="programs"]'
    );
    await expect(routeMarker).toHaveCount(1);
    await expect(page.locator("main#shell-content")).toHaveCount(1);
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await expect(routeMarker).toBeVisible();
    await settle(page);
    const actual = await measure(page, "main#shell-content");
    assertActualGeometry(actual, viewport);
    const actualImage = `actual-${caseKey}-${viewportLabel(viewport)}.png`;
    const actualImageDimensions = await capturePage(page, actualImage);

    const prototypeBuffer = await readFile(prototypeFile(prototypeName));
    await page.setContent(prototypeBuffer.toString("utf-8"), {
      waitUntil: "load",
    });
    await settle(page);
    const frozen = await measure(page, "main.page");
    const frozenImage = `frozen-${caseKey}-${viewportLabel(viewport)}.png`;
    const frozenImageDimensions = await capturePage(page, frozenImage);
    rows.push({
      caseKey,
      storyId,
      candidateSha,
      viewport,
      prototypePath: path.relative(
        repositoryRoot,
        prototypeFile(prototypeName)
      ),
      prototypeSha256: sha256(prototypeBuffer),
      actualImage,
      frozenImage,
      actualImageDimensions,
      frozenImageDimensions,
      actual,
      frozen,
      capturedAt: new Date().toISOString(),
    });
  }

  await writeJson(artifactPath(`rows-${viewportLabel(viewport)}.json`), {
    candidateSha,
    viewport,
    rows,
  });

  const allShardsReady = await Promise.all(
    VIEWPORTS.map((candidate) =>
      exists(artifactPath(`rows-${viewportLabel(candidate)}.json`))
    )
  ).then((values) => values.every(Boolean));
  if (!allShardsReady) {
    return;
  }

  await finalizeArtifacts(page);
  await assertManifestContract();
});
