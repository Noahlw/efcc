/* oxlint-disable vitest/prefer-importing-vitest-globals */
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { COPY } from "../../web/lib/copy";
import { DEV_ADMIN } from "./dev-fixtures";

const EDITOR = COPY.homeEditor;
const LOGIN = COPY.login.submit;

const configuredTarget = process.env.PROGRAMS_TARGET_URL;
const localTarget =
  !configuredTarget ||
  ["localhost", "127.0.0.1"].includes(new URL(configuredTarget).hostname);
const ADMIN_USER =
  process.env.PROGRAMS_ADMIN_USERNAME ??
  (localTarget ? DEV_ADMIN.username : undefined);
const ADMIN_CREDENTIAL =
  process.env.PROGRAMS_ADMIN_CREDENTIAL ??
  (localTarget ? DEV_ADMIN.credential : undefined);

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is required for Home CMS E2E proof`);
  }
  return value;
}
async function clearSession(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.evaluate(() => {
    try {
      localStorage.removeItem("efcc_auth_active");
    } catch {
      // Storage unavailable before first navigation.
    }
  });
}

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/");
  await page
    .locator('input[autocomplete="username"]')
    .fill(required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER));
  await page
    .locator('input[autocomplete="current-password"]')
    .fill(required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CREDENTIAL));
  await page.getByRole("button", { name: LOGIN }).click();
  await page.waitForURL((url) => url.pathname !== "/");
}

async function api(
  page: Page,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<{ status: number; body: Record<string, unknown> }> {
  const method = init.method ?? "GET";
  return await page.evaluate(
    async ({ requestPath, requestMethod, requestBody }) => {
      const requestInit: RequestInit = { method: requestMethod };
      if (requestBody !== undefined) {
        requestInit.headers = { "Content-Type": "application/json" };
        requestInit.body = JSON.stringify(requestBody);
      }
      const response = await fetch(requestPath, requestInit);
      return {
        status: response.status,
        body: (await response.json()) as Record<string, unknown>,
      };
    },
    { requestPath: path, requestMethod: method, requestBody: init.body }
  );
}

interface HomeContentSnapshot {
  contentId: string;
  templateType: string;
  status: string;
  publishMode: string;
  startAt: string | null;
  endAt: string | null;
  title: string | null;
  summary: string | null;
  bodyMarkdown: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  featuredEventId: string | null;
}

function readSnapshotField(
  data: Record<string, unknown>,
  camel: string,
  snake: string
): string | null {
  const value = data[camel] ?? data[snake];
  return value === null || value === undefined ? null : String(value);
}

async function captureHomeSnapshot(
  page: Page
): Promise<HomeContentSnapshot | null> {
  const contentResponse = await api(page, "/api/v1/home/content");
  if (contentResponse.status !== 200) {
    return null;
  }
  const data = contentResponse.body.data as Record<string, unknown> | null;
  if (!data) {
    return null;
  }
  return {
    contentId: readSnapshotField(data, "contentId", "content_id") ?? "home",
    templateType:
      readSnapshotField(data, "templateType", "template_type") ?? "A",
    status: readSnapshotField(data, "status", "status") ?? "Draft",
    publishMode:
      readSnapshotField(data, "publishMode", "publish_mode") ?? "immediate",
    startAt: readSnapshotField(data, "startAt", "start_at"),
    endAt: readSnapshotField(data, "endAt", "end_at"),
    title: readSnapshotField(data, "title", "title"),
    summary: readSnapshotField(data, "summary", "summary"),
    bodyMarkdown: readSnapshotField(data, "bodyMarkdown", "body_markdown"),
    ctaLabel: readSnapshotField(data, "ctaLabel", "cta_label"),
    ctaUrl: readSnapshotField(data, "ctaUrl", "cta_url"),
    imageUrl: readSnapshotField(data, "imageUrl", "image_url"),
    imageAlt: readSnapshotField(data, "imageAlt", "image_alt"),
    featuredEventId: readSnapshotField(
      data,
      "featuredEventId",
      "featured_event_id"
    ),
  };
}

async function restoreHomeSnapshot(
  page: Page,
  snapshot: HomeContentSnapshot | null
): Promise<void> {
  if (!snapshot) {
    return;
  }
  const draft = await api(page, "/api/v1/home/draft", {
    method: "POST",
    body: {
      content_id: snapshot.contentId,
      template_type: snapshot.templateType,
      publish_mode: snapshot.publishMode,
      start_at: snapshot.startAt,
      end_at: snapshot.endAt,
      title: snapshot.title,
      summary: snapshot.summary,
      body_markdown: snapshot.bodyMarkdown,
      cta_label: snapshot.ctaLabel,
      cta_url: snapshot.ctaUrl,
      image_url: snapshot.imageUrl,
      image_alt: snapshot.imageAlt,
      featured_event_id: snapshot.featuredEventId,
    },
  });
  if (draft.status !== 200) {
    throw new Error(`Home CMS restore draft failed with HTTP ${draft.status}`);
  }
  if (snapshot.status !== "Published") {
    return;
  }
  const latest = await api(page, "/api/v1/home/content");
  if (latest.status !== 200) {
    throw new Error(
      `Home CMS restore read content failed with HTTP ${latest.status}`
    );
  }
  const latestData = latest.body.data as { version: number } | null;
  if (!latestData?.version) {
    throw new Error("Home CMS restore missing draft version after save");
  }
  const publish = await api(page, "/api/v1/home/publish", {
    method: "POST",
    body: {
      content_id: snapshot.contentId,
      version: latestData.version,
      publish_mode: snapshot.publishMode,
      start_at: snapshot.startAt,
      end_at: snapshot.endAt,
    },
  });
  if (publish.status !== 200) {
    throw new Error(
      `Home CMS restore publish failed with HTTP ${publish.status}`
    );
  }
}

test.describe("087-05 Home Content CMS", () => {
  test("edits both templates, saves then publishes, previews, and rejects stale writes", async ({
    page,
  }) => {
    await clearSession(page);
    await loginAsAdmin(page);
    const snapshot = await captureHomeSnapshot(page);
    try {
      await page.goto("/management?module=home-content");

      await expect(
        page.getByRole("heading", { name: EDITOR.editorTitle })
      ).toBeVisible();

      // Template A exposes the linked event and automatic fallback controls.
      await expect(page.locator("#home-cms-featured-event")).toBeVisible();
      await expect(page.locator("#home-cms-fallback")).toBeVisible();

      // Switching to Template B exposes its complete content shape.
      await page.getByRole("button", { name: EDITOR.templateB }).click();
      await expect(page.locator("#home-cms-title")).toBeVisible();
      await expect(page.locator("#home-cms-summary")).toBeVisible();
      await expect(page.locator("#home-cms-body")).toBeVisible();
      await expect(page.locator("#home-cms-cta-label")).toBeVisible();
      await expect(page.locator("#home-cms-cta-url")).toBeVisible();
      await expect(page.locator("#home-cms-image-url")).toBeVisible();
      await expect(page.locator("#home-cms-image-alt")).toBeVisible();

      const title = `E2E Home CMS ${Date.now()}`;
      await page.locator("#home-cms-title").fill(title);
      await page.locator("#home-cms-summary").fill("E2E draft summary");
      await page.getByRole("button", { name: EDITOR.saveDraft }).click();
      await expect(
        page.locator(
          '[aria-labelledby="home-cms-editor-title"] output[aria-live="polite"]'
        )
      ).toContainText(EDITOR.saveSuccess);

      const contentResponse = await api(page, "/api/v1/home/content");
      expect(contentResponse.status).toBe(200);
      const content = contentResponse.body.data as {
        contentId: string;
        version: number;
      };

      // Drafts are not live until the explicit publish action.
      const beforePublish = await api(page, "/api/v1/home");
      expect(JSON.stringify(beforePublish.body)).not.toContain(title);

      await page.getByRole("button", { name: EDITOR.preview }).click();
      await expect(page.locator("#home-cms-preview-title")).toBeVisible();

      // The rendered preview is real content in both requested viewport modes.
      const phonePreview = page.getByRole("button", {
        name: EDITOR.previewPhone,
      });
      const desktopPreview = page.getByRole("button", {
        name: EDITOR.previewDesktop,
      });
      await phonePreview.click();
      await expect(phonePreview).toHaveAttribute("aria-pressed", "true");
      await desktopPreview.click();
      await expect(desktopPreview).toHaveAttribute("aria-pressed", "true");

      await page.getByRole("button", { name: EDITOR.savePublished }).click();
      await expect(
        page.locator(
          '[aria-labelledby="home-cms-editor-title"] output[aria-live="polite"]'
        )
      ).toContainText(EDITOR.publishSuccess);

      const publishedHome = await api(page, "/api/v1/home");
      expect(publishedHome.status).toBe(200);
      expect(JSON.stringify(publishedHome.body)).toContain(title);

      await expect(
        page.getByRole("heading", { name: EDITOR.auditTrail })
      ).toBeVisible();
      await expect(
        page.locator('[aria-labelledby="home-cms-audit-title"]')
      ).toContainText(title);

      // A concurrent save from another client surfaces explicit conflict UI.
      const afterPublish = await api(page, "/api/v1/home/content");
      const currentVersion = (afterPublish.body.data as { version: number })
        .version;
      const bumped = await api(page, "/api/v1/home/draft", {
        method: "POST",
        body: {
          content_id: content.contentId,
          expected_version: currentVersion,
          template_type: "B",
          title: `${title} newer`,
        },
      });
      expect(bumped.status).toBe(200);

      await page.locator("#home-cms-title").fill(`${title} stale-ui`);
      await page.getByRole("button", { name: EDITOR.saveDraft }).click();
      await expect(page.getByText(EDITOR.conflictTitle)).toBeVisible();
      await page.locator("#home-cms-conflict-reload").click();
      await expect(page.getByText(EDITOR.conflictReload)).toBeVisible();
      await expect(page.locator("#home-cms-title")).toHaveValue(
        `${title} newer`
      );
    } finally {
      await restoreHomeSnapshot(page, snapshot);
    }
  });
});
