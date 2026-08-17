import assert from "node:assert/strict";

import { env } from "cloudflare:workers";
import { beforeAll, describe, test } from "vitest";

import worker from "../worker";
import type { Env } from "../worker";
import { importLegacyUsers } from "./auth/accounts";
import { ACCESS_COOKIE_NAME } from "./auth/cookies";
import { applyMigrations, testDb } from "./auth/test-bootstrap";
import { completeCredentialUpgrade } from "./auth/upgrade";

const HOST = "https://efcc.example";
const SECRET = "test-access-token-secret";

function testEnv(): Env {
  return {
    ...(env as unknown as Env),
    EFCC_ACCESS_TOKEN_SECRET: SECRET,
  };
}

function request(path: string, init: RequestInit = {}): Request {
  return new Request(`${HOST}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

async function accessCookie(): Promise<string> {
  const response = await worker.fetch(
    request("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: "cms-admin",
        password: "cms-admin-password",
      }),
    }),
    testEnv()
  );
  assert.strictEqual(response.status, 200);
  const cookie = response.headers
    .getSetCookie()
    .find((value: string) => value.startsWith(`${ACCESS_COOKIE_NAME}=`));
  assert.ok(cookie);
  return cookie.split(";")[0].slice(ACCESS_COOKIE_NAME.length + 1);
}

// oxlint-disable-next-line no-explicit-any
async function json(response: Response): Promise<Record<string, any>> {
  // oxlint-disable-next-line no-explicit-any
  return (await response.json()) as Record<string, any>;
}

function saveDraft(
  cookie: string,
  contentId: string,
  extra: Record<string, unknown> = {}
): Promise<Response> {
  return worker.fetch(
    request("/api/v1/home/draft", {
      method: "POST",
      headers: { Cookie: `${ACCESS_COOKIE_NAME}=${cookie}` },
      body: JSON.stringify({
        content_id: contentId,
        template_type: "B",
        title: `CMS ${contentId}`,
        summary: "Summary",
        body_markdown: "Safe body <script>alert(1)</script>",
        ...extra,
      }),
    }),
    testEnv()
  );
}

describe("Home Content CMS Worker routes", () => {
  let adminCookie: string;

  beforeAll(async () => {
    await applyMigrations();
    await importLegacyUsers(testDb(), [
      ["User_ID", "Name", "Username", "PIN_Code", "System_Role", "Status"],
      ["CMS-ADMIN", "CMS Admin", "cms-admin", "1234", "Admin", "Active"],
    ]);
    await completeCredentialUpgrade(testDb(), {
      userId: "CMS-ADMIN",
      legacyPin: "1234",
      newCredential: "cms-admin-password",
    });
    adminCookie = await accessCookie();
  });

  test("saves drafts independently and sanitizes the body", async () => {
    const response = await saveDraft(adminCookie, "cms-draft-success");
    assert.strictEqual(response.status, 200);
    const payload = await json(response);
    assert.strictEqual(payload.data.status, "Draft");
    assert.strictEqual(payload.data.templateType, "B");
    assert.match(payload.data.bodyMarkdown, /Safe body/u);
    assert.doesNotMatch(payload.data.bodyMarkdown, /script/iu);
    const publicResponse = await worker.fetch(
      request("/api/v1/home", {
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}` },
      }),
      testEnv()
    );
    const publicPayload = await json(publicResponse);
    assert.strictEqual(publicPayload.data.announcement, null);
  });

  test("returns 409 with the latest content for a stale expected version", async () => {
    const first = await json(
      await saveDraft(adminCookie, "cms-draft-conflict")
    );
    const current = first.data;
    const newer = await json(
      await saveDraft(adminCookie, "cms-draft-conflict", {
        expected_version: current.version,
        title: "Newer version",
      })
    );
    const conflict = await saveDraft(adminCookie, "cms-draft-conflict", {
      expected_version: current.version,
      title: "Stale version",
    });
    assert.strictEqual(conflict.status, 409);
    const problem = await json(conflict);
    assert.strictEqual(problem.code, "CONFLICT");
    assert.strictEqual(problem.reloadRequired, true);
    assert.strictEqual(problem.latest.version, newer.data.version);
    assert.strictEqual(problem.latest.title, "Newer version");
  });

  test("publishes immediate content and the public projection sees it", async () => {
    const draft = await json(await saveDraft(adminCookie, "cms-publish-now"));
    const response = await worker.fetch(
      request("/api/v1/home/publish", {
        method: "POST",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}` },
        body: JSON.stringify({
          content_id: "cms-publish-now",
          version: draft.data.version,
          publish_mode: "immediate",
        }),
      }),
      testEnv()
    );
    const publishedPayload = await json(response);
    assert.strictEqual(publishedPayload.data.status, "Published");

    const publicResponse = await worker.fetch(
      request("/api/v1/home", {
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}` },
      }),
      testEnv()
    );
    const publicPayload = await json(publicResponse);
    assert.strictEqual(
      publicPayload.data.announcement.title,
      "CMS cms-publish-now"
    );
  });

  test("stores scheduled publication in UTC from an HK wall time", async () => {
    const draft = await json(
      await saveDraft(adminCookie, "cms-publish-scheduled", {
        publish_mode: "scheduled",
        start_at: "2999-01-02T10:30",
      })
    );
    const response = await worker.fetch(
      request("/api/v1/home/publish", {
        method: "POST",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}` },
        body: JSON.stringify({
          content_id: "cms-publish-scheduled",
          version: draft.data.version,
          publish_mode: "scheduled",
          start_at: "2999-01-02T10:30",
        }),
      }),
      testEnv()
    );
    assert.strictEqual(response.status, 200);
    const payload = await json(response);
    assert.strictEqual(payload.data.publishMode, "scheduled");
    assert.strictEqual(payload.data.startAt, "2999-01-02T02:30:00.000Z");

    const publicResponse = await worker.fetch(
      request("/api/v1/home", {
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}` },
      }),
      testEnv()
    );
    const publicPayload = await json(publicResponse);
    assert.notStrictEqual(
      publicPayload.data.announcement?.title,
      "CMS cms-publish-scheduled"
    );
  });

  test("lists publication audit rows with actor, version, and template", async () => {
    const response = await worker.fetch(
      request("/api/v1/home/audit?limit=10", {
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${adminCookie}` },
      }),
      testEnv()
    );
    assert.strictEqual(response.status, 200);
    const auditPayload = await json(response);
    const items = auditPayload.data.items as Record<string, unknown>[];
    const row = items.find((item) => item.entityId === "cms-publish-now");
    assert.ok(row);
    assert.strictEqual(row.actorUserId, "CMS-ADMIN");
    assert.strictEqual(row.action, "HOME_PUBLISH");
    assert.strictEqual(row.templateType, "B");
  });
});
