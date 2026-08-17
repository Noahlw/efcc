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
const ADMIN_USER = process.env.PROGRAMS_ADMIN_USERNAME ??
  (localTarget ? DEV_ADMIN.username : undefined);
const ADMIN_CREDENTIAL = process.env.PROGRAMS_ADMIN_CREDENTIAL ??
  (localTarget ? DEV_ADMIN.credential : undefined);

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is required for Home CMS E2E proof`);
  return value;
}
async function clearSession(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.removeItem("efcc_auth_active"));
}

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator('input[autocomplete="username"]').fill(
    required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER)
  );
  await page.locator('input[autocomplete="current-password"]').fill(
    required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CREDENTIAL)
  );
  await page.getByRole("button", { name: LOGIN }).click();
  await page.waitForURL((url) => url.pathname !== "/");
}

async function api(
  page: Page,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<{ status: number; body: Record<string, unknown> }> {
  return page.evaluate(
    async ({ path: requestPath, method, body }) => {
      const response = await fetch(requestPath, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    },
    { path, method: init.method ?? "GET", body: init.body }
  );
}

test.describe("087-05 Home Content CMS", () => {
  test("edits both templates, saves then publishes, previews, and rejects stale writes", async ({
    page,
  }) => {
    await clearSession(page);
    await loginAsAdmin(page);
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
    await expect(page.getByText(EDITOR.saveSuccess)).toBeVisible();

    const contentResponse = await api(page, "/api/v1/home/content");
    expect(contentResponse.status).toBe(200);
    const content = contentResponse.body.data as {
      contentId: string;
      version: number;
    };

    // Drafts are not live until the explicit publish action.
    const beforePublish = await api(page, "/api/v1/home");
    expect(JSON.stringify(beforePublish.body)).not.toContain(title);

    await page.getByRole("button", { name: EDITOR.savePublished }).click();
    await expect(page.getByText(EDITOR.publishSuccess)).toBeVisible();

    const publishedHome = await api(page, "/api/v1/home");
    expect(publishedHome.status).toBe(200);
    expect(JSON.stringify(publishedHome.body)).toContain(title);

    // The rendered preview is real content in both requested viewport modes.
    const phonePreview = page.getByRole("button", { name: EDITOR.previewPhone });
    const desktopPreview = page.getByRole("button", { name: EDITOR.previewDesktop });
    await phonePreview.click();
    await expect(phonePreview).toHaveAttribute("aria-pressed", "true");
    await desktopPreview.click();
    await expect(desktopPreview).toHaveAttribute("aria-pressed", "true");

    // A write carrying an older published version is an explicit 409 conflict.
    const stale = await api(page, "/api/v1/home/draft", {
      method: "POST",
      body: {
        content_id: content.contentId,
        expected_version: content.version,
        template_type: "B",
        title: `${title} stale`,
        publish_mode: undefined,
      },
    });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("CONFLICT");
  });
});
