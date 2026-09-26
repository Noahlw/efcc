/* oxlint-disable eslint/no-unused-vars eslint/no-inline-comments */
import assert from "node:assert/strict";

import { env } from "cloudflare:workers";
import { beforeAll, describe, test } from "vitest";

import worker from "../worker";
import type { Env } from "../worker";
import { ACCESS_COOKIE_NAME } from "./auth/cookies";
import { issueSession } from "./auth/sessions";
import {
  applyMigrations,
  seedTestAccount,
  testDb,
} from "./auth/test-bootstrap";

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
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

async function accessCookieFor(
  username: string,
  password: string
): Promise<string> {
  const response = await worker.fetch(
    request("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
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

interface HomeApiResponse {
  requestId: string;
  data: {
    featuredEvent: {
      eventId: string;
      programId: string;
      programTitle: string;
      title: string;
      startsAt: string;
      endsAt: string;
      startAt?: string;
      endAt?: string;
      location: string;
      status: string;
      isEnrolled: boolean;
    } | null;
    announcement: {
      contentId: string;
      version: number;
      title: string;
      summary: string;
      bodyMarkdown: string | null;
      ctaLabel: string | null;
      ctaUrl: string | null;
      imageUrl: string | null;
      imageAlt: string | null;
      publishedAt: string | null;
    } | null;
    exploreProgram: {
      programId: string;
      title: string;
      summary: string | null;
      category: string | null;
      enrollmentType: string;
      nextEventStartAt: string | null;
    } | null;
  };
}

describe("GET /api/v1/home Worker route", () => {
  let memberCookie: string;
  let unenrolledMemberCookie: string;
  let adminCookie: string;

  beforeAll(async () => {
    await applyMigrations();

    await Promise.all(
      (
        [
          [
            "HOME-ADMIN",
            "Home Admin",
            "home-admin",
            "home-admin-password",
            "Active",
          ],
          [
            "HOME-MEMBER-1",
            "陳小明",
            "home-member-1",
            "home-member-password",
            "Active",
          ],
          [
            "HOME-MEMBER-2",
            "李大同",
            "home-member-2",
            "home-member-password",
            "Active",
          ],
          [
            "HOME-INACTIVE",
            "停用會員",
            "home-inactive",
            "home-inactive-password",
            "Suspended",
          ],
        ] as const
      ).map(([userId, name, username, password, accountStatus]) =>
        seedTestAccount({
          userId,
          name,
          username,
          password,
          accountStatus,
        })
      )
    );

    adminCookie = await accessCookieFor("home-admin", "home-admin-password");
    memberCookie = await accessCookieFor(
      "home-member-1",
      "home-member-password"
    );
    unenrolledMemberCookie = await accessCookieFor(
      "home-member-2",
      "home-member-password"
    );
  });

  test("rejects unauthenticated requests with 401 Problem Details", async () => {
    const response = await worker.fetch(
      request("/api/v1/home", { method: "GET" }),
      testEnv()
    );
    assert.strictEqual(response.status, 401);
    assert.strictEqual(
      response.headers.get("Content-Type"),
      "application/problem+json"
    );
    const problem = (await response.json()) as {
      code: string;
      requestId: string;
    };
    assert.strictEqual(problem.code, "AUTH_REQUIRED");
    assert.ok(problem.requestId);
    assert.strictEqual(response.headers.get("X-Request-Id"), problem.requestId);
  });

  test("rejects invalid access token with 401 Problem Details", async () => {
    const response = await worker.fetch(
      request("/api/v1/home", {
        method: "GET",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=invalid-token-here` },
      }),
      testEnv()
    );
    assert.strictEqual(response.status, 401);
    const problem = (await response.json()) as { code: string };
    assert.strictEqual(problem.code, "AUTH_REQUIRED");
  });

  test("rejects unknown method or unknown subroute with 404", async () => {
    const postRes = await worker.fetch(
      request("/api/v1/home", {
        method: "POST",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${memberCookie}` },
      }),
      testEnv()
    );
    assert.strictEqual(postRes.status, 404);

    const subRes = await worker.fetch(
      request("/api/v1/home/unknown", {
        method: "GET",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${memberCookie}` },
      }),
      testEnv()
    );
    assert.strictEqual(subRes.status, 404);
  });

  test("returns empty projections (nulls) when no domain records exist", async () => {
    const response = await worker.fetch(
      request("/api/v1/home", {
        method: "GET",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${memberCookie}` },
      }),
      testEnv()
    );
    assert.strictEqual(response.status, 200);
    assert.strictEqual(
      response.headers.get("Content-Type"),
      "application/json"
    );
    const payload = (await response.json()) as HomeApiResponse;
    assert.ok(payload.requestId);
    assert.strictEqual(response.headers.get("X-Request-Id"), payload.requestId);
    assert.strictEqual(payload.data.featuredEvent, null);
    assert.strictEqual(payload.data.announcement, null);
    assert.strictEqual(payload.data.exploreProgram, null);
  });

  test("returns published Template B announcement and ignores Draft/Archived/Template A", async () => {
    const now = new Date();
    const publishedAt = now.toISOString();

    // 1. Insert a Draft Template B
    await testDb()
      .prepare(
        `INSERT INTO home_content
          (content_id, version, template_type, status, publish_mode, start_at, end_at,
           title, summary, body_markdown, cta_label, cta_url, created_by, created_at,
           updated_by, updated_at)
         VALUES ('draft-announcement', 1, 'B', 'Draft', 'immediate', NULL, NULL,
                 '草稿公告', '草稿摘要', '草稿內容', '連結', 'https://example.com',
                 'HOME-ADMIN', ?, 'HOME-ADMIN', ?)`
      )
      .bind(publishedAt, publishedAt)
      .run();

    // Verify draft is invisible
    const res1 = await worker.fetch(
      request("/api/v1/home", {
        method: "GET",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${memberCookie}` },
      }),
      testEnv()
    );
    const body1 = (await res1.json()) as HomeApiResponse;
    assert.strictEqual(body1.data.announcement, null);

    // 2. Insert a Template A published content
    await testDb()
      .prepare(
        `INSERT INTO home_content
          (content_id, version, template_type, status, publish_mode, start_at, end_at,
           title, summary, body_markdown, created_by, created_at, updated_by, updated_at,
           published_by, published_at)
         VALUES ('template-a-content', 2, 'A', 'Published', 'immediate', NULL, NULL,
                 '主頁推薦A', '推薦摘要', NULL, 'HOME-ADMIN', ?, 'HOME-ADMIN', ?,
                 'HOME-ADMIN', ?)`
      )
      .bind(publishedAt, publishedAt, publishedAt)
      .run();

    // Verify Template A is NOT returned as church announcement
    const res2 = await worker.fetch(
      request("/api/v1/home", {
        method: "GET",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${memberCookie}` },
      }),
      testEnv()
    );
    const body2 = (await res2.json()) as HomeApiResponse;
    assert.strictEqual(body2.data.announcement, null);

    // 3. Insert a Published Template B announcement matching the prototype
    await testDb()
      .prepare(
        `INSERT INTO home_content
          (content_id, version, template_type, status, publish_mode, start_at, end_at,
           title, summary, body_markdown, cta_label, cta_url, image_url, image_alt,
           created_by, created_at, updated_by, updated_at, published_by, published_at)
         VALUES ('church-msg-1', 3, 'B', 'Published', 'immediate', NULL, NULL,
                 '本週崇拜及聚會安排', '請留意場地及時間更新 · 8月15日',
                 '請按現場指示前往聚會地點，禮堂入口設有接待同工協助登記。',
                 '聚會場地資料 · 外部連結', 'https://example.com/venue',
                 'https://example.com/cover.jpg', '場地照片',
                 'HOME-ADMIN', ?, 'HOME-ADMIN', ?, 'HOME-ADMIN', ?)`
      )
      .bind(publishedAt, publishedAt, publishedAt)
      .run();

    const res3 = await worker.fetch(
      request("/api/v1/home", {
        method: "GET",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${memberCookie}` },
      }),
      testEnv()
    );
    const body3 = (await res3.json()) as HomeApiResponse;
    assert.ok(body3.data.announcement);
    assert.strictEqual(body3.data.announcement.contentId, "church-msg-1");
    assert.strictEqual(body3.data.announcement.version, 3);
    assert.strictEqual(body3.data.announcement.title, "本週崇拜及聚會安排");
    assert.strictEqual(
      body3.data.announcement.summary,
      "請留意場地及時間更新 · 8月15日"
    );
    assert.strictEqual(
      body3.data.announcement.bodyMarkdown,
      "請按現場指示前往聚會地點，禮堂入口設有接待同工協助登記。"
    );
    assert.strictEqual(
      body3.data.announcement.ctaLabel,
      "聚會場地資料 · 外部連結"
    );
    assert.strictEqual(
      body3.data.announcement.ctaUrl,
      "https://example.com/venue"
    );
    assert.strictEqual(
      body3.data.announcement.imageUrl,
      "https://example.com/cover.jpg"
    );
    assert.strictEqual(body3.data.announcement.imageAlt, "場地照片");
  });

  test("projects member's next enrolled event when available", async () => {
    const now = new Date();
    const futureStart = new Date(now.getTime() + 86_400_000).toISOString(); // +1 day
    const futureEnd = new Date(now.getTime() + 90_000_000).toISOString();

    // 1. Create a program and event
    await testDb()
      .prepare(
        `INSERT INTO programs
          (program_id, department_id, name, description, category, behavior_type,
           lifecycle, discoverability, enrollment_mode, created_by, created_at, updated_by, updated_at)
         VALUES ('PRG-DISCIPLESHIP', '018f3b8a-0000-7000-8000-000000000001',
                 '門徒訓練基礎課', '訓練信徒生命', '門徒訓練', 'Recurring',
                 'Active', 'Listed', 'MemberRequest', 'HOME-ADMIN', ?, 'HOME-ADMIN', ?)`
      )
      .bind(now.toISOString(), now.toISOString())
      .run();

    await testDb()
      .prepare(
        `INSERT INTO events
          (event_id, program_id, starts_at, ends_at, status, availability, source,
           name, location, created_by, created_at, updated_by, updated_at)
         VALUES ('EVT-DISCIPLESHIP-3', 'PRG-DISCIPLESHIP', ?, ?, 'Active', 'Active', 'MANUAL',
                 '第三課聚會', '二樓禮堂', 'HOME-ADMIN', ?, 'HOME-ADMIN', ?)`
      )
      .bind(futureStart, futureEnd, now.toISOString(), now.toISOString())
      .run();

    // 2. Enroll HOME-MEMBER-1
    await testDb()
      .prepare(
        `INSERT INTO enrollments
          (enrollment_id, program_id, member_user_id, status, enrolled_at, created_by, created_at)
         VALUES ('ENR-MEMBER-1', 'PRG-DISCIPLESHIP', 'HOME-MEMBER-1', 'Active', ?, 'HOME-ADMIN', ?)`
      )
      .bind(now.toISOString(), now.toISOString())
      .run();

    // 3. Query as HOME-MEMBER-1 -> should see enrolled event
    const resMember1 = await worker.fetch(
      request("/api/v1/home", {
        method: "GET",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${memberCookie}` },
      }),
      testEnv()
    );
    const body1 = (await resMember1.json()) as HomeApiResponse;
    assert.ok(body1.data.featuredEvent);
    assert.strictEqual(body1.data.featuredEvent.eventId, "EVT-DISCIPLESHIP-3");
    assert.strictEqual(body1.data.featuredEvent.programId, "PRG-DISCIPLESHIP");
    assert.strictEqual(body1.data.featuredEvent.programTitle, "門徒訓練基礎課");
    assert.strictEqual(body1.data.featuredEvent.title, "第三課聚會");
    assert.strictEqual(body1.data.featuredEvent.location, "二樓禮堂");
    assert.strictEqual(body1.data.featuredEvent.isEnrolled, true);
    assert.strictEqual(body1.data.featuredEvent.startsAt, futureStart);

    // 4. Query as HOME-MEMBER-2 (not enrolled) -> should see church-wide fallback with isEnrolled: false
    const resMember2 = await worker.fetch(
      request("/api/v1/home", {
        method: "GET",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${unenrolledMemberCookie}` },
      }),
      testEnv()
    );
    const body2 = (await resMember2.json()) as HomeApiResponse;
    assert.ok(body2.data.featuredEvent);
    assert.strictEqual(body2.data.featuredEvent.eventId, "EVT-DISCIPLESHIP-3");
    assert.strictEqual(body2.data.featuredEvent.isEnrolled, false);
  });

  test("falls back to church-wide next event when member's enrolled event is stale/past", async () => {
    const now = new Date();
    const pastStart = new Date(now.getTime() - 86_400_000).toISOString(); // -1 day (past)
    const pastEnd = new Date(now.getTime() - 80_000_000).toISOString();
    const futureStart = new Date(now.getTime() + 172_800_000).toISOString(); // +2 days
    const futureEnd = new Date(now.getTime() + 176_400_000).toISOString();

    // Create a second program with future church-wide event
    await testDb()
      .prepare(
        `INSERT INTO programs
          (program_id, department_id, name, description, category, behavior_type,
           lifecycle, discoverability, enrollment_mode, created_by, created_at, updated_by, updated_at)
         VALUES ('PRG-WORSHIP', '018f3b8a-0000-7000-8000-000000000001',
                 '週日崇拜', '主日敬拜與信息', '崇拜', 'Recurring',
                 'Active', 'Listed', 'MemberRequest', 'HOME-ADMIN', ?, 'HOME-ADMIN', ?)`
      )
      .bind(now.toISOString(), now.toISOString())
      .run();

    await testDb()
      .prepare(
        `INSERT INTO events
          (event_id, program_id, starts_at, ends_at, status, availability, source,
           name, location, created_by, created_at, updated_by, updated_at)
         VALUES ('EVT-WORSHIP-SUN', 'PRG-WORSHIP', ?, ?, 'Active', 'Active', 'MANUAL',
                 '主日早堂崇拜', '一樓正堂', 'HOME-ADMIN', ?, 'HOME-ADMIN', ?)`
      )
      .bind(futureStart, futureEnd, now.toISOString(), now.toISOString())
      .run();

    // Move member 1's event to the past
    await testDb()
      .prepare(
        `UPDATE events SET starts_at = ?, ends_at = ? WHERE event_id = 'EVT-DISCIPLESHIP-3'`
      )
      .bind(pastStart, pastEnd)
      .run();

    // Query as member 1 -> should not see past event, should fall back to next future church-wide event
    const res = await worker.fetch(
      request("/api/v1/home", {
        method: "GET",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${memberCookie}` },
      }),
      testEnv()
    );
    const body = (await res.json()) as HomeApiResponse;
    assert.ok(body.data.featuredEvent);
    assert.strictEqual(body.data.featuredEvent.eventId, "EVT-WORSHIP-SUN");
    assert.strictEqual(body.data.featuredEvent.programTitle, "週日崇拜");
    assert.strictEqual(body.data.featuredEvent.title, "主日早堂崇拜");
    assert.strictEqual(body.data.featuredEvent.isEnrolled, false);
  });

  test("selects exploreProgram correctly (listed, active, member-request with future event)", async () => {
    const now = new Date();
    const futureStart = new Date(now.getTime() + 300_000_000).toISOString();
    const futureEnd = new Date(now.getTime() + 303_600_000).toISOString();

    // Insert explore candidate: '慕道入門課程'
    await testDb()
      .prepare(
        `INSERT INTO programs
          (program_id, department_id, name, description, category, behavior_type,
           lifecycle, discoverability, enrollment_mode, display_order, created_by, created_at, updated_by, updated_at)
         VALUES ('PRG-INTRO', '018f3b8a-0000-7000-8000-000000000001',
                 '慕道入門課程', '現正接受報名 · 9月7日開始', '福音', 'OneOff',
                 'Active', 'Listed', 'MemberRequest', 0, 'HOME-ADMIN', ?, 'HOME-ADMIN', ?)`
      )
      .bind(now.toISOString(), now.toISOString())
      .run();

    await testDb()
      .prepare(
        `INSERT INTO events
          (event_id, program_id, starts_at, ends_at, status, availability, source,
           name, location, created_by, created_at, updated_by, updated_at)
         VALUES ('EVT-INTRO-1', 'PRG-INTRO', ?, ?, 'Active', 'Active', 'MANUAL',
                 '第一課：認識信仰', '三樓副堂', 'HOME-ADMIN', ?, 'HOME-ADMIN', ?)`
      )
      .bind(futureStart, futureEnd, now.toISOString(), now.toISOString())
      .run();

    // Ensure PRG-WORSHIP has higher display_order so PRG-INTRO is preferred
    await testDb()
      .prepare(
        `UPDATE programs SET display_order = 10 WHERE program_id = 'PRG-WORSHIP'`
      )
      .run();

    const res = await worker.fetch(
      request("/api/v1/home", {
        method: "GET",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${memberCookie}` },
      }),
      testEnv()
    );
    const body = (await res.json()) as HomeApiResponse;
    assert.ok(body.data.exploreProgram);
    assert.strictEqual(body.data.exploreProgram.programId, "PRG-INTRO");
    assert.strictEqual(body.data.exploreProgram.title, "慕道入門課程");
    assert.strictEqual(
      body.data.exploreProgram.summary,
      "現正接受報名 · 9月7日開始"
    );
    assert.strictEqual(
      body.data.exploreProgram.enrollmentType,
      "MemberRequest"
    );
    assert.strictEqual(body.data.exploreProgram.nextEventStartAt, futureStart);
  });

  test("rejects inactive/suspended account with 403 Problem Details", async () => {
    await testDb()
      .prepare(
        "UPDATE accounts SET account_status = 'Active' WHERE user_id = ?"
      )
      .bind("HOME-INACTIVE")
      .run();
    const session = await issueSession(testDb(), {
      userId: "HOME-INACTIVE",
      accessTokenSecret: SECRET,
    });
    await testDb()
      .prepare(
        "UPDATE accounts SET account_status = 'Suspended' WHERE user_id = ?"
      )
      .bind("HOME-INACTIVE")
      .run();

    const response = await worker.fetch(
      request("/api/v1/home", {
        method: "GET",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${session.accessToken}` },
      }),
      testEnv()
    );
    assert.strictEqual(response.status, 403);
    const problem = (await response.json()) as { code: string };
    assert.strictEqual(problem.code, "FORBIDDEN");
  });

  test("hides scheduled announcement with future start_at or expired announcement with past end_at", async () => {
    const now = new Date();
    const futureStart = new Date(now.getTime() + 3_600_000).toISOString();
    const pastStart = new Date(now.getTime() - 7_200_000).toISOString();
    const pastEnd = new Date(now.getTime() - 3_600_000).toISOString();

    // 1. Archive the existing announcement so it doesn't match
    await testDb()
      .prepare(
        `UPDATE home_content SET status = 'Archived' WHERE content_id = 'church-msg-1'`
      )
      .run();

    // 2. Insert scheduled announcement with future start_at
    await testDb()
      .prepare(
        `INSERT INTO home_content
          (content_id, version, template_type, status, publish_mode, start_at, end_at,
           title, summary, body_markdown, created_by, created_at, updated_by, updated_at, published_by, published_at)
         VALUES ('scheduled-msg', 4, 'B', 'Published', 'scheduled', ?, NULL,
                 '未來公告', '未來摘要', '內容', 'HOME-ADMIN', ?, 'HOME-ADMIN', ?, 'HOME-ADMIN', ?)`
      )
      .bind(
        futureStart,
        now.toISOString(),
        now.toISOString(),
        now.toISOString()
      )
      .run();

    const res1 = await worker.fetch(
      request("/api/v1/home", {
        method: "GET",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${memberCookie}` },
      }),
      testEnv()
    );
    const body1 = (await res1.json()) as HomeApiResponse;
    assert.strictEqual(body1.data.announcement, null);

    // 3. Insert expired announcement with past end_at
    await testDb()
      .prepare(
        `INSERT INTO home_content
          (content_id, version, template_type, status, publish_mode, start_at, end_at,
           title, summary, body_markdown, created_by, created_at, updated_by, updated_at, published_by, published_at)
         VALUES ('expired-msg', 5, 'B', 'Published', 'scheduled', ?, ?,
                 '過期公告', '過期摘要', '內容', 'HOME-ADMIN', ?, 'HOME-ADMIN', ?, 'HOME-ADMIN', ?)`
      )
      .bind(
        pastStart,
        pastEnd,
        now.toISOString(),
        now.toISOString(),
        now.toISOString()
      )
      .run();

    const res2 = await worker.fetch(
      request("/api/v1/home", {
        method: "GET",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${memberCookie}` },
      }),
      testEnv()
    );
    const body2 = (await res2.json()) as HomeApiResponse;
    assert.strictEqual(body2.data.announcement, null);
  });

  test("shows scheduled announcement once start_at is in the past", async () => {
    const now = new Date();
    const pastStart = new Date(now.getTime() - 3_600_000).toISOString();

    await testDb()
      .prepare(
        `UPDATE home_content SET status = 'Archived' WHERE content_id = 'church-msg-1'`
      )
      .run();

    await testDb()
      .prepare(
        `INSERT INTO home_content
          (content_id, version, template_type, status, publish_mode, start_at, end_at,
           title, summary, body_markdown, created_by, created_at, updated_by, updated_at, published_by, published_at)
         VALUES ('live-scheduled-msg', 7, 'B', 'Published', 'scheduled', ?, NULL,
                 '已生效預約公告', '摘要', '內容', 'HOME-ADMIN', ?, 'HOME-ADMIN', ?, 'HOME-ADMIN', ?)`
      )
      .bind(pastStart, now.toISOString(), now.toISOString(), now.toISOString())
      .run();

    const response = await worker.fetch(
      request("/api/v1/home", {
        method: "GET",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${memberCookie}` },
      }),
      testEnv()
    );
    const body = (await response.json()) as HomeApiResponse;
    assert.strictEqual(body.data.announcement?.title, "已生效預約公告");
  });

  test("falls back to Template A configured featured event when unenrolled", async () => {
    const now = new Date();
    const futureStart = new Date(now.getTime() + 500_000_000).toISOString();
    const futureEnd = new Date(now.getTime() + 503_600_000).toISOString();

    // Create a special featured event
    await testDb()
      .prepare(
        `INSERT INTO events
          (event_id, program_id, starts_at, ends_at, status, availability, source,
           name, location, created_by, created_at, updated_by, updated_at)
         VALUES ('EVT-FEATURED-SPECIAL', 'PRG-WORSHIP', ?, ?, 'Active', 'Active', 'MANUAL',
                 '特別崇拜推薦', '大堂', 'HOME-ADMIN', ?, 'HOME-ADMIN', ?)`
      )
      .bind(futureStart, futureEnd, now.toISOString(), now.toISOString())
      .run();

    // Publish Template A pointing to EVT-FEATURED-SPECIAL
    await testDb()
      .prepare(
        `INSERT INTO home_content
          (content_id, version, template_type, status, publish_mode, start_at, end_at,
           featured_event_id, title, summary, created_by, created_at, updated_by, updated_at, published_by, published_at)
         VALUES ('template-a-special', 6, 'A', 'Published', 'immediate', NULL, NULL,
                 'EVT-FEATURED-SPECIAL', '特選聚會', '精選活動', 'HOME-ADMIN', ?, 'HOME-ADMIN', ?, 'HOME-ADMIN', ?)`
      )
      .bind(now.toISOString(), now.toISOString(), now.toISOString())
      .run();

    // Query as unenrolled member 2
    const res = await worker.fetch(
      request("/api/v1/home", {
        method: "GET",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${unenrolledMemberCookie}` },
      }),
      testEnv()
    );
    const body = (await res.json()) as HomeApiResponse;
    assert.ok(body.data.featuredEvent);
    assert.strictEqual(body.data.featuredEvent.eventId, "EVT-FEATURED-SPECIAL");
    assert.strictEqual(body.data.featuredEvent.title, "特別崇拜推薦");
    assert.strictEqual(body.data.featuredEvent.isEnrolled, false);
  });

  test("lists published Template B announcements newest-first", async () => {
    const publishedAt = new Date().toISOString();
    await testDb()
      .prepare(
        `INSERT INTO home_content
          (content_id, version, template_type, status, publish_mode, start_at, end_at,
           title, summary, created_by, created_at, updated_by, updated_at, published_by, published_at)
         VALUES ('list-announcement', 99, 'B', 'Published', 'immediate', NULL, NULL,
                 '列表公告', '列表摘要', 'HOME-ADMIN', ?, 'HOME-ADMIN', ?, 'HOME-ADMIN', ?)`
      )
      .bind(publishedAt, publishedAt, publishedAt)
      .run();

    const res = await worker.fetch(
      request("/api/v1/home/announcements", {
        method: "GET",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${memberCookie}` },
      }),
      testEnv()
    );
    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as {
      data: { announcements: { contentId: string; title: string }[] };
    };
    assert.ok(
      body.data.announcements.some(
        (row) => row.contentId === "list-announcement"
      )
    );
  });

  test("keeps Home and Messages announcement windows, ordering, defaults, and limits", async () => {
    const now = new Date();
    const past = new Date(now.getTime() - 60_000).toISOString();
    const future = new Date(now.getTime() + 60_000).toISOString();
    const rows: {
      contentId: string;
      version: number;
      templateType: string;
      status: string;
      publishMode: string;
      startAt: string | null;
      endAt: string | null;
      title: string | null;
      summary: string | null;
      publishedAt: string | null;
      updatedAt: string;
    }[] = Array.from({ length: 21 }, (_, index) => {
      const version = 200 + index;
      return {
        contentId: `trial-${version}`,
        version,
        templateType: "B",
        status: "Published",
        publishMode: version === 218 ? "scheduled" : "immediate",
        startAt: version === 218 ? past : null,
        endAt: version === 219 ? future : null,
        title: `Trial ${version}`,
        summary: `Summary ${version}`,
        publishedAt: new Date(
          now.getTime() - 300_000 + version * 1000
        ).toISOString(),
        updatedAt: past,
      };
    });
    rows.push(
      {
        contentId: "trial-221",
        version: 221,
        templateType: "B",
        status: "Published",
        publishMode: "immediate",
        startAt: null,
        endAt: null,
        title: "Trial 221",
        summary: "Summary 221",
        publishedAt: new Date(now.getTime() - 10_000).toISOString(),
        updatedAt: past,
      },
      {
        contentId: "trial-null-published-at",
        version: 222,
        templateType: "B",
        status: "Published",
        publishMode: "immediate",
        startAt: null,
        endAt: null,
        title: null,
        summary: null,
        publishedAt: null,
        updatedAt: past,
      },
      {
        contentId: "trial-template-a",
        version: 901,
        templateType: "A",
        status: "Published",
        publishMode: "immediate",
        startAt: null,
        endAt: null,
        title: "Template A",
        summary: "Excluded",
        publishedAt: future,
        updatedAt: past,
      },
      {
        contentId: "trial-draft",
        version: 902,
        templateType: "B",
        status: "Draft",
        publishMode: "immediate",
        startAt: null,
        endAt: null,
        title: "Draft",
        summary: "Excluded",
        publishedAt: future,
        updatedAt: past,
      },
      {
        contentId: "trial-scheduled-future",
        version: 903,
        templateType: "B",
        status: "Published",
        publishMode: "scheduled",
        startAt: future,
        endAt: null,
        title: "Future scheduled",
        summary: "Excluded",
        publishedAt: future,
        updatedAt: past,
      },
      {
        contentId: "trial-expired",
        version: 904,
        templateType: "B",
        status: "Published",
        publishMode: "immediate",
        startAt: null,
        endAt: past,
        title: "Expired",
        summary: "Excluded",
        publishedAt: future,
        updatedAt: past,
      }
    );

    const insert = `INSERT INTO home_content
      (content_id, version, template_type, status, publish_mode, start_at, end_at,
       title, summary, created_by, created_at, updated_by, updated_at, published_by, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'HOME-ADMIN', ?, 'HOME-ADMIN', ?, 'HOME-ADMIN', ?)`;
    await testDb().batch(
      rows.map((row) =>
        testDb()
          .prepare(insert)
          .bind(
            row.contentId,
            row.version,
            row.templateType,
            row.status,
            row.publishMode,
            row.startAt,
            row.endAt,
            row.title,
            row.summary,
            past,
            row.updatedAt,
            row.publishedAt
          )
      )
    );

    const homeResponse = await worker.fetch(
      request("/api/v1/home", {
        method: "GET",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${memberCookie}` },
      }),
      testEnv()
    );
    assert.strictEqual(homeResponse.status, 200);
    const homeBody = (await homeResponse.json()) as HomeApiResponse;
    assert.strictEqual(
      homeBody.data.announcement?.contentId,
      "trial-null-published-at"
    );
    assert.strictEqual(homeBody.data.announcement?.title, "");
    assert.strictEqual(homeBody.data.announcement?.summary, "");
    assert.strictEqual(homeBody.data.announcement?.publishedAt, past);

    const listResponse = await worker.fetch(
      request("/api/v1/home/announcements", {
        method: "GET",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${memberCookie}` },
      }),
      testEnv()
    );
    assert.strictEqual(listResponse.status, 200);
    const listBody = (await listResponse.json()) as {
      data: { announcements: { contentId: string }[] };
    };
    const listedIds = listBody.data.announcements.map((row) => row.contentId);
    assert.strictEqual(listedIds.length, 20);
    assert.deepStrictEqual(listedIds, [
      "trial-null-published-at",
      "trial-221",
      ...Array.from({ length: 18 }, (_, index) => `trial-${220 - index}`),
    ]);
    assert.ok(!listedIds.includes("trial-template-a"));
    assert.ok(!listedIds.includes("trial-draft"));
    assert.ok(!listedIds.includes("trial-scheduled-future"));
    assert.ok(!listedIds.includes("trial-expired"));
  });

  test("ignores unknown query parameters on public reads", async () => {
    const response = await worker.fetch(
      request("/api/v1/home?future=param&limit=not-a-number", {
        method: "GET",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${memberCookie}` },
      }),
      testEnv()
    );
    assert.strictEqual(response.status, 200);
    const body = (await response.json()) as HomeApiResponse;
    assert.ok("featuredEvent" in body.data);
  });

  test("returns 503 HOME_UNAVAILABLE when stored announcement data is malformed", async () => {
    // The public projection filters on exact template/status values, so a
    // corrupted row would deselect rather than serve malformed data.
    // Prove the shared contract gate with a delegating store: real D1 for
    // auth and every other table, one malformed home_content row.
    const malformed = {
      content_id: "contract-malformed",
      version: "corrupt",
      title: "合約測試公告",
      summary: "摘要",
      body_markdown: null,
      cta_label: null,
      cta_url: null,
      image_url: null,
      image_alt: null,
      published_at: null,
      updated_at: new Date().toISOString(),
    };
    const realDb = testDb();
    const delegatingDb = {
      prepare: (sql: string) => {
        if (sql.includes("home_content")) {
          return {
            bind: () => ({
              first: async () => null,
              all: async () => ({ results: [malformed] }),
            }),
          };
        }
        return realDb.prepare(sql);
      },
    };
    const { handleGetHome } = await import("./home-handlers");
    const response = await handleGetHome(
      request("/api/v1/home", {
        method: "GET",
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${memberCookie}` },
      }),
      {
        // oxlint-disable-next-line no-explicit-any
        DB: delegatingDb as any,
        EFCC_ACCESS_TOKEN_SECRET: SECRET,
      }
    );
    assert.strictEqual(response.status, 503);
    const body = (await response.json()) as {
      code: string;
      requestId: string;
    };
    assert.strictEqual(body.code, "HOME_UNAVAILABLE");
    assert.ok(typeof body.requestId === "string");
    assert.ok(response.headers.get("X-Request-Id"));
  });
});
