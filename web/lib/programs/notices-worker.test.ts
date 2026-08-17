/**
 * 085-07 (#324) — Participant Notices Worker contract.
 *
 * Acceptance (trace `085-07-participant-notices`): GET
 * /api/v1/programs/notices is strictly self-scoped (a member only ever sees
 * their own notices, newest-first, READ included, within the 90-day retention
 * window) and ships unread_count for the returned set; POST .../read-all is
 * idempotent (a second call marks 0); POST .../notices is Admin/Staff-only
 * (403 for a Member), validates kind/title/body (422), and the created notice
 * appears in the member's list.
 */
import assert from "node:assert/strict";

import { env } from "cloudflare:workers";
import { beforeAll, describe, test } from "vitest";

import worker from "../../worker";
import type { Env } from "../../worker";
import { importLegacyUsers } from "../auth/accounts";
import { ACCESS_COOKIE_NAME } from "../auth/cookies";
import { applyMigrations, testDb } from "../auth/test-bootstrap";
import { completeCredentialUpgrade } from "../auth/upgrade";

const SECRET = "test-access-token-secret";
const HOST = "https://efcc.example";
const HEADER = [
  "User_ID",
  "Name",
  "Username",
  "PIN_Code",
  "System_Role",
  "Status",
];

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...(env as unknown as Env),
    EFCC_ACCESS_TOKEN_SECRET: SECRET,
    ...overrides,
  };
}

function request(
  path: string,
  access: string,
  init: { method?: string; body?: unknown } = {}
): Request {
  const headers: Record<string, string> = {
    Origin: HOST,
    Cookie: `${ACCESS_COOKIE_NAME}=${access}`,
  };
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  return new Request(`${HOST}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

async function login(username: string, password: string): Promise<string> {
  const response = await worker.fetch(
    new Request(`${HOST}/api/v1/auth/login`, {
      method: "POST",
      headers: { Origin: HOST, "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }),
    testEnv()
  );
  assert.strictEqual(response.status, 200);
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith(`${ACCESS_COOKIE_NAME}=`));
  assert.ok(cookie);
  return cookie.split(";")[0].slice(ACCESS_COOKIE_NAME.length + 1);
}

type NoticeKind = "event" | "program" | "account";

interface NoticeDto {
  notice_id: string;
  kind: NoticeKind;
  title: string;
  body: string;
  program_id: string | null;
  event_id: string | null;
  read_at: number | null;
  created_at: number;
}

async function fetchNotices(
  access: string
): Promise<{ status: number; data: { notices: NoticeDto[]; unread_count: number } }> {
  const response = await worker.fetch(
    request("/api/v1/programs/notices", access),
    testEnv()
  );
  const body = (await response.json()) as {
    requestId: string;
    data: { notices: NoticeDto[]; unread_count: number };
  };
  assert.strictEqual(
    body.requestId,
    response.headers.get("X-Request-Id"),
    "body requestId must equal X-Request-Id"
  );
  return { status: response.status, data: body.data };
}

async function postReadAll(
  access: string
): Promise<{ status: number; markedCount: number }> {
  const response = await worker.fetch(
    request("/api/v1/programs/notices/read-all", access, { method: "POST" }),
    testEnv()
  );
  const body = (await response.json()) as {
    data: { marked_count: number };
  };
  return { status: response.status, markedCount: body.data.marked_count };
}

async function postCreate(
  access: string,
  body: Record<string, unknown>
): Promise<{ status: number; notice?: NoticeDto }> {
  const response = await worker.fetch(
    request("/api/v1/programs/notices", access, { method: "POST", body }),
    testEnv()
  );
  const parsed = (await response.json()) as {
    data: { notice: NoticeDto };
  };
  return { status: response.status, notice: parsed.data?.notice };
}

async function insertNotice(input: {
  noticeId: string;
  memberUserId: string;
  kind: NoticeKind;
  title: string;
  body: string;
  programId?: string | null;
  eventId?: string | null;
  readAt?: number | null;
  createdAt: number;
}): Promise<void> {
  await testDb()
    .prepare(
      `INSERT INTO participant_notices
         (notice_id, member_user_id, kind, title, body, program_id, event_id,
          read_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      input.noticeId,
      input.memberUserId,
      input.kind,
      input.title,
      input.body,
      input.programId ?? null,
      input.eventId ?? null,
      input.readAt ?? null,
      input.createdAt
    )
    .run();
}

describe("085-07: Participant Notices", () => {
  let adminAccess: string;
  let memberAAccess: string;
  let memberDAccess: string;
  let memberEAccess: string;
  let memberFAccess: string;
  let memberGAccess: string;

  beforeAll(async () => {
    await applyMigrations();
    await importLegacyUsers(testDb(), [
      HEADER,
      ["A001", "Admin One", "notices-admin", "1011", "Admin", "Active"],
      ["A002", "Member A", "notices-member-a", "1012", "Member", "Active"],
      ["A003", "Member D", "notices-member-d", "1013", "Member", "Active"],
      ["A004", "Member E", "notices-member-e", "1014", "Member", "Active"],
      ["A005", "Member F", "notices-member-f", "1015", "Member", "Active"],
      ["A006", "Member G", "notices-member-g", "1016", "Member", "Active"],
    ]);
    await Promise.all(
      (
        [
          ["A001", "1011", "admin-secret"],
          ["A002", "1012", "member-a-secret"],
          ["A003", "1013", "member-d-secret"],
          ["A004", "1014", "member-e-secret"],
          ["A005", "1015", "member-f-secret"],
          ["A006", "1016", "member-g-secret"],
        ] as const
      ).map(([userId, legacyPin, newCredential]) =>
        completeCredentialUpgrade(testDb(), {
          userId,
          legacyPin,
          newCredential,
        })
      )
    );
    adminAccess = await login("notices-admin", "admin-secret");
    memberAAccess = await login("notices-member-a", "member-a-secret");
    memberDAccess = await login("notices-member-d", "member-d-secret");
    memberEAccess = await login("notices-member-e", "member-e-secret");
    memberFAccess = await login("notices-member-f", "member-f-secret");
    memberGAccess = await login("notices-member-g", "member-g-secret");
  });

  test("admin create is role-gated, validates kind/title/body, and appears in the member list", async () => {
    const asMember = await postCreate(memberAAccess, {
      member_user_id: "A002",
      kind: "event",
      title: "聚會提醒",
      body: "你已報名的聚會即將開始。",
    });
    assert.strictEqual(asMember.status, 403, "a Member cannot create notices");

    for (const bad of [
      { member_user_id: "A002", kind: "spam", title: "x", body: "y" },
      { member_user_id: "A002", kind: "event", title: "  ", body: "y" },
      { member_user_id: "A002", kind: "event", title: "x", body: "" },
      { member_user_id: "", kind: "event", title: "x", body: "y" },
    ]) {
      const rejected = await postCreate(adminAccess, bad);
      assert.strictEqual(
        rejected.status,
        422,
        `create should reject ${JSON.stringify(bad)} with 422`
      );
    }

    const created = await postCreate(adminAccess, {
      member_user_id: "A002",
      kind: "event",
      title: "聚會提醒",
      body: "你已報名的聚會即將開始。",
      program_id: "P-ADULT-BIBLE",
      event_id: "E-001",
    });
    assert.strictEqual(created.status, 201);
    assert.ok(created.notice);
    assert.strictEqual(created.notice.kind, "event");
    assert.strictEqual(created.notice.title, "聚會提醒");
    assert.strictEqual(created.notice.program_id, "P-ADULT-BIBLE");
    assert.strictEqual(created.notice.event_id, "E-001");
    assert.strictEqual(created.notice.read_at, null);
    assert.ok(typeof created.notice.created_at === "number");

    const memberList = await fetchNotices(memberAAccess);
    assert.strictEqual(memberList.status, 200);
    assert.ok(
      memberList.data.notices.some(
        (notice) => notice.notice_id === created.notice?.notice_id
      ),
      "the created notice must appear in the member's list"
    );
    assert.ok(memberList.data.unread_count >= 1);
  });

  test("member lists own notices newest-first with unread_count; other members' notices are invisible", async () => {
    const now = Date.now();
    await insertNotice({
      noticeId: "notice-d-3",
      memberUserId: "A003",
      kind: "program",
      title: "第一舊",
      body: "oldest",
      createdAt: now,
      readAt: null,
    });
    await insertNotice({
      noticeId: "notice-d-2",
      memberUserId: "A003",
      kind: "account",
      title: "第二中",
      body: "middle, already read",
      createdAt: now + 1000,
      readAt: now + 500,
    });
    await insertNotice({
      noticeId: "notice-d-1",
      memberUserId: "A003",
      kind: "event",
      title: "第三新",
      body: "newest, unread",
      programId: "P-1",
      eventId: "E-1",
      createdAt: now + 2000,
      readAt: null,
    });
    // A different member's notice must never leak into D's list.
    await insertNotice({
      noticeId: "notice-e-1",
      memberUserId: "A004",
      kind: "account",
      title: "E 專屬",
      body: "only for member E",
      createdAt: now + 3000,
      readAt: null,
    });

    const listD = await fetchNotices(memberDAccess);
    assert.strictEqual(listD.status, 200);
    assert.deepStrictEqual(
      listD.data.notices.map((notice) => notice.title),
      ["第三新", "第二中", "第一舊"],
      "notices must be newest-first"
    );
    assert.strictEqual(listD.data.unread_count, 2);
    assert.ok(
      listD.data.notices.every((notice) => notice.notice_id !== "notice-e-1"),
      "member D must not see member E's notice"
    );

    const listE = await fetchNotices(memberEAccess);
    assert.strictEqual(listE.status, 200);
    assert.deepStrictEqual(
      listE.data.notices.map((notice) => notice.title),
      ["E 專屬"]
    );
    assert.strictEqual(listE.data.unread_count, 1);
  });

  test("retention window excludes notices older than 90 days", async () => {
    const now = Date.now();
    await insertNotice({
      noticeId: "notice-f-old",
      memberUserId: "A005",
      kind: "account",
      title: "過期通知",
      body: "older than the 90-day window",
      createdAt: now - 91 * 24 * 60 * 60 * 1000,
      readAt: null,
    });
    await insertNotice({
      noticeId: "notice-f-recent",
      memberUserId: "A005",
      kind: "program",
      title: "近期通知",
      body: "inside the 90-day window",
      createdAt: now - 60 * 60 * 1000,
      readAt: null,
    });

    const listF = await fetchNotices(memberFAccess);
    assert.strictEqual(listF.status, 200);
    assert.deepStrictEqual(
      listF.data.notices.map((notice) => notice.title),
      ["近期通知"],
      "the >90-day-old notice must be dropped"
    );
  });

  test("read-all marks every unread notice read idempotently", async () => {
    const now = Date.now();
    await insertNotice({
      noticeId: "notice-g-1",
      memberUserId: "A006",
      kind: "event",
      title: "未讀一",
      body: "unread one",
      createdAt: now,
      readAt: null,
    });
    await insertNotice({
      noticeId: "notice-g-2",
      memberUserId: "A006",
      kind: "program",
      title: "未讀二",
      body: "unread two",
      createdAt: now + 1000,
      readAt: null,
    });
    await insertNotice({
      noticeId: "notice-g-read",
      memberUserId: "A006",
      kind: "account",
      title: "已讀",
      body: "already read",
      createdAt: now + 2000,
      readAt: now + 1500,
    });

    const first = await postReadAll(memberGAccess);
    assert.strictEqual(first.status, 200);
    assert.strictEqual(first.markedCount, 2);

    const second = await postReadAll(memberGAccess);
    assert.strictEqual(second.status, 200);
    assert.strictEqual(second.markedCount, 0, "second call must be a no-op");

    const listG = await fetchNotices(memberGAccess);
    assert.strictEqual(listG.data.unread_count, 0);
    assert.ok(
      listG.data.notices.every(
        (notice) => notice.read_at !== null && notice.read_at >= now
      ),
      "every notice must now carry a read_at"
    );
  });
});
