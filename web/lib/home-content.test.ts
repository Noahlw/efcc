import assert from "node:assert/strict";

import { env } from "cloudflare:workers";
import { beforeAll, describe, test } from "vitest";

import { importLegacyUsers } from "./auth/accounts";
import { applyMigrations, testDb } from "./auth/test-bootstrap";
import { signAccessToken } from "./auth/sessions";
import { runHomeContentExpiry, sanitizeMarkdown } from "./home-content";
import worker from "../worker";
import type { Env } from "../worker";

const SECRET = "home-test-secret";
const HOST = "https://efcc.example";
const ADMIN = "HOME-CMS-ADMIN";
const PROGRAM = "HOME-CMS-PROGRAM";
const EVENT = "HOME-CMS-EVENT";

function testEnv(): Env {
  return { ...(env as unknown as Env), EFCC_ACCESS_TOKEN_SECRET: SECRET };
}

function request(path: string, init: RequestInit = {}): Request {
  return new Request(`${HOST}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

async function accessCookie(): Promise<string> {
  const token = await signAccessToken(SECRET, {
    sid: "home-test-session",
    uid: ADMIN,
    iat: Date.now(),
    exp: Date.now() + 60_000,
  });
  return `efcc_access=${token}`;
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

beforeAll(async () => {
  await applyMigrations();
  await importLegacyUsers(testDb(), [
    ["User_ID", "Name", "Username", "PIN_Code", "System_Role", "Status"],
    [ADMIN, "Home CMS Admin", "home-cms-admin", "1234", "Admin", "Active"],
  ]);
  const now = new Date().toISOString();
  await testDb()
    .prepare(
      `INSERT OR IGNORE INTO programs
       (program_id, department_id, name, behavior_type, lifecycle, discoverability,
        enrollment_mode, check_in_token, created_at, updated_at)
       VALUES (?, ?, 'Home fallback event', 'OneOff', 'Active', 'Listed',
               'MemberRequest', ?, ?, ?)`
    )
    .bind(PROGRAM, "018f3b8a-0000-7000-8000-000000000001", "HOME-CMS-TOKEN", now, now)
    .run();
  await testDb()
    .prepare(
      `INSERT OR IGNORE INTO events
       (event_id, program_id, starts_at, ends_at, status, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Active', 'MANUAL', ?, ?)`
    )
    .bind(EVENT, PROGRAM, "2099-01-01T10:00:00.000Z", "2099-01-01T11:00:00.000Z", now, now)
    .run();
});

describe("Home Content CMS", () => {
  test("rejects raw HTML and dangerous Markdown URLs", () => {
    assert.strictEqual(sanitizeMarkdown("<script>alert(1)</script>"), null);
    assert.strictEqual(sanitizeMarkdown("[click](javascript:alert(1))"), null);
    assert.strictEqual(sanitizeMarkdown("**safe**"), "**safe**");
  });

  test("GET /api/v1/home falls back to earliest eligible event", async () => {
    const response = await worker.fetch(request("/api/v1/home", { method: "GET" }), testEnv());
    assert.strictEqual(response.status, 200);
    const body = await json<{
      data: {
        content: {
          template_type: string;
          fallback: boolean;
          featured_event: { event_id: string } | null;
        };
      };
    }>(response);
    assert.strictEqual(body.data.content.template_type, "A");
    assert.strictEqual(body.data.content.fallback, true);
    assert.strictEqual(body.data.content.featured_event?.event_id, EVENT);
  });
  test("rejects unsafe Template B drafts at the Worker boundary", async () => {
    const response = await worker.fetch(
      request("/api/v1/home/drafts", {
        method: "PUT",
        headers: { Cookie: await accessCookie() },
        body: JSON.stringify({
          content_id: "home-unsafe-body",
          template_type: "B",
          body_markdown: "<iframe src='javascript:alert(1)'></iframe>",
        }),
      }),
      testEnv()
    );
    assert.strictEqual(response.status, 422);
    const problem = await json<{ code: string }>(response);
    assert.strictEqual(problem.code, "VALIDATION");
  });
  test("renders supported Markdown blockquotes in public HTML", async () => {
    const cookie = await accessCookie();
    const contentId = `home-blockquote-${crypto.randomUUID()}`;
    const draft = await worker.fetch(
      request("/api/v1/home/drafts", {
        method: "PUT",
        headers: { Cookie: cookie },
        body: JSON.stringify({
          content_id: contentId,
          template_type: "B",
          title: "Quote",
          body_markdown: "> Please take note.",
        }),
      }),
      testEnv()
    );
    assert.ok([200, 201].includes(draft.status));
    const draftBody = await json<{ data: { draft: { version: number } } }>(
      draft
    );
    const publish = await worker.fetch(
      request("/api/v1/home/publish", {
        method: "POST",
        headers: { Cookie: cookie },
        body: JSON.stringify({
          content_id: contentId,
          base_version: draftBody.data.draft.version,
          publish_mode: "immediate",
        }),
      }),
      testEnv()
    );
    assert.strictEqual(publish.status, 200);

    const response = await worker.fetch(
      request("/api/v1/home", { method: "GET" }),
      testEnv()
    );
    const body = await json<{
      data: {
        content: { content_id: string; body_html: string | null };
      };
    }>(response);
    assert.strictEqual(body.data.content.content_id, contentId);
    assert.strictEqual(
      body.data.content.body_html,
      "<blockquote>Please take note.</blockquote>"
    );
  });


  test("stale publish returns HOME_CONTENT_CONFLICT", async () => {
    const contentId = `home-test-${crypto.randomUUID()}`;
    const cookie = await accessCookie();
    const first = await worker.fetch(
      request("/api/v1/home/drafts", {
        method: "PUT",
        headers: { Cookie: cookie },
        body: JSON.stringify({ content_id: contentId, template_type: "B", title: "One", body_markdown: "Safe" }),
      }),
      testEnv()
    );
    assert.ok([200, 201].includes(first.status));
    const firstBody = await json<{ data: { draft: { version: number } } }>(first);
    const second = await worker.fetch(
      request("/api/v1/home/drafts", {
        method: "PUT",
        headers: { Cookie: cookie },
        body: JSON.stringify({ content_id: contentId, base_version: firstBody.data.draft.version, template_type: "B", title: "Two", body_markdown: "Safe" }),
      }),
      testEnv()
    );
    assert.strictEqual(second.status, 200);
    const publish = await worker.fetch(
      request("/api/v1/home/publish", {
        method: "POST",
        headers: { Cookie: cookie },
        body: JSON.stringify({ content_id: contentId, base_version: firstBody.data.draft.version, publish_mode: "immediate" }),
      }),
      testEnv()
    );
    assert.strictEqual(publish.status, 409);
    const problem = await json<{ code: string; current_version: number }>(publish);
    assert.strictEqual(problem.code, "HOME_CONTENT_CONFLICT");
    assert.strictEqual(problem.current_version, firstBody.data.draft.version + 1);
  });

  test("cron archives expired published content and audits it", async () => {
    const now = new Date().toISOString();
    await testDb()
      .prepare(
        `INSERT OR REPLACE INTO home_content
         (content_id, version, template_type, status, publish_mode, start_at, end_at,
          title, created_by, created_at, updated_by, updated_at)
         VALUES ('home-expiry-test', 99, 'A', 'Published', 'immediate', ?, ?, 'Expired', ?, ?, ?, ?)`
      )
      .bind(
        "2020-01-01T00:00:00.000Z",
        "2020-01-02T00:00:00.000Z",
        ADMIN,
        now,
        ADMIN,
        now
      )
      .run();
    const count = await runHomeContentExpiry(testDb(), now);
    assert.strictEqual(count, 1);
    const row = await testDb()
      .prepare("SELECT status FROM home_content WHERE content_id = 'home-expiry-test' AND version = 99")
      .first<{ status: string }>();
    assert.strictEqual(row?.status, "Archived");
    const audit = await testDb()
      .prepare("SELECT action FROM audit_events WHERE action = 'HOME_CONTENT_EXPIRED' AND entity_id = 'home-expiry-test'")
      .first<{ action: string }>();
    assert.strictEqual(audit?.action, "HOME_CONTENT_EXPIRED");
  });
});
