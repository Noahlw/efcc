/**
 * EFCC Home domain — Worker route handlers for `/api/v1/home`.
 *
 * Provides the public participant home projection with real D1 data:
 * - featuredEvent: current member's next future Active event from an Active enrollment,
 *   falling back to the next eligible future church-wide Active event when missing/stale.
 * - announcement: latest published Template B church announcement.
 * - exploreProgram: one real listed Active MemberRequest program with an eligible future event.
 */

import { findAccountByUserId } from "./auth/accounts";
import type { AccountRow } from "./auth/accounts";
import { ACCESS_COOKIE_NAME } from "./auth/cookies";
import { verifyAccessToken } from "./auth/sessions";

export interface HomeEnv {
  DB: D1Database;
  EFCC_ACCESS_TOKEN_SECRET: string;
}

export interface HomeFeaturedEventDto {
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
}

export interface HomeAnnouncementDto {
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
}

export interface HomeExploreProgramDto {
  programId: string;
  title: string;
  summary: string | null;
  category: string | null;
  enrollmentType: string;
  nextEventStartAt: string | null;
}

export interface HomeProjectionData {
  featuredEvent: HomeFeaturedEventDto | null;
  announcement: HomeAnnouncementDto | null;
  exploreProgram: HomeExploreProgramDto | null;
}

interface EventRow {
  event_id: string;
  program_id: string;
  program_title: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  status: string;
}

interface AnnouncementRow {
  content_id: string;
  version: number;
  title: string | null;
  summary: string | null;
  body_markdown: string | null;
  cta_label: string | null;
  cta_url: string | null;
  image_url: string | null;
  image_alt: string | null;
  published_at: string | null;
  updated_at: string;
}

interface ExploreProgramRow {
  program_id: string;
  title: string;
  summary: string | null;
  category: string | null;
  enrollment_type: string;
  next_event_start_at: string | null;
}

function problem(
  status: number,
  code: string,
  title: string,
  detail: string,
  requestId: string
): Response {
  return Response.json(
    {
      type: `tag:apps-script/efcc/errors#${code}`,
      title,
      status,
      code,
      detail,
      requestId,
    },
    {
      status,
      headers: {
        "Content-Type": "application/problem+json",
        "X-Request-Id": requestId,
      },
    }
  );
}

function jsonResponse(
  status: number,
  body: unknown,
  requestId: string
): Response {
  return Response.json(
    { requestId, data: body },
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
      },
    }
  );
}

function readCookie(headers: Headers, name: string): string | null {
  const raw = headers.get("Cookie");
  if (!raw) {
    return null;
  }
  for (const pair of raw.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const k = pair.slice(0, eq).trim();
    if (k === name) {
      return pair.slice(eq + 1).trim();
    }
  }
  return null;
}

async function requireActor(
  request: Request,
  env: HomeEnv,
  requestId: string
): Promise<{ account: AccountRow } | Response> {
  const access = readCookie(request.headers, ACCESS_COOKIE_NAME);
  if (!access) {
    return problem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Access cookie missing.",
      requestId
    );
  }
  const claims = await verifyAccessToken(env.EFCC_ACCESS_TOKEN_SECRET, access);
  if (!claims) {
    return problem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Access token invalid or expired.",
      requestId
    );
  }
  const account = await findAccountByUserId(env.DB, claims.uid);
  if (!account) {
    return problem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Unknown account.",
      requestId
    );
  }
  if (account.account_status !== "Active") {
    return problem(
      403,
      "FORBIDDEN",
      "Forbidden",
      "Account is not active.",
      requestId
    );
  }
  return { account };
}

async function resolveFeaturedEvent(
  db: D1Database,
  userId: string,
  nowIso: string
): Promise<HomeFeaturedEventDto | null> {
  // 1. Check if the current member has an Active enrollment with an upcoming Active event.
  const memberEvent = await db
    .prepare(
      `SELECT e.event_id, e.program_id, p.name AS program_title,
              COALESCE(e.name, p.name) AS title,
              e.starts_at, e.ends_at, COALESCE(e.location, '') AS location,
              e.status
         FROM enrollments en
         JOIN programs p ON p.program_id = en.program_id
         JOIN events e ON e.program_id = p.program_id
        WHERE en.member_user_id = ?
          AND en.status = 'Active'
          AND p.lifecycle = 'Active'
          AND e.status = 'Active'
          AND e.availability = 'Active'
          AND e.starts_at > ?
        ORDER BY e.starts_at ASC
        LIMIT 1`
    )
    .bind(userId, nowIso)
    .first<EventRow>();

  if (memberEvent) {
    return {
      eventId: memberEvent.event_id,
      programId: memberEvent.program_id,
      programTitle: memberEvent.program_title,
      title: memberEvent.title,
      startsAt: memberEvent.starts_at,
      endsAt: memberEvent.ends_at,
      startAt: memberEvent.starts_at,
      endAt: memberEvent.ends_at,
      location: memberEvent.location ?? "",
      status: memberEvent.status,
      isEnrolled: true,
    };
  }

  // 2. Fallback: Check if there is a published Template A row configuring a specific featured event.
  const templateAEvent = await db
    .prepare(
      `SELECT e.event_id, e.program_id, p.name AS program_title,
              COALESCE(e.name, p.name) AS title,
              e.starts_at, e.ends_at, COALESCE(e.location, '') AS location,
              e.status
         FROM home_content h
         JOIN events e ON e.event_id = h.featured_event_id
         JOIN programs p ON p.program_id = e.program_id
        WHERE h.template_type = 'A'
          AND h.status = 'Published'
          AND (
            h.publish_mode = 'immediate' OR
            (h.start_at IS NOT NULL AND h.start_at <= ?)
          )
          AND (h.end_at IS NULL OR h.end_at > ?)
          AND p.lifecycle = 'Active'
          AND p.discoverability = 'Listed'
          AND e.status = 'Active'
          AND e.availability = 'Active'
          AND e.starts_at > ?
        ORDER BY h.version DESC, h.published_at DESC
        LIMIT 1`
    )
    .bind(nowIso, nowIso, nowIso)
    .first<EventRow>();

  if (templateAEvent) {
    return {
      eventId: templateAEvent.event_id,
      programId: templateAEvent.program_id,
      programTitle: templateAEvent.program_title,
      title: templateAEvent.title,
      startsAt: templateAEvent.starts_at,
      endsAt: templateAEvent.ends_at,
      startAt: templateAEvent.starts_at,
      endAt: templateAEvent.ends_at,
      location: templateAEvent.location ?? "",
      status: templateAEvent.status,
      isEnrolled: false,
    };
  }

  // 3. Fallback: Next eligible future church-wide Active event.
  const churchEvent = await db
    .prepare(
      `SELECT e.event_id, e.program_id, p.name AS program_title,
              COALESCE(e.name, p.name) AS title,
              e.starts_at, e.ends_at, COALESCE(e.location, '') AS location,
              e.status
         FROM events e
         JOIN programs p ON p.program_id = e.program_id
        WHERE e.status = 'Active'
          AND e.availability = 'Active'
          AND p.lifecycle = 'Active'
          AND p.discoverability = 'Listed'
          AND e.starts_at > ?
        ORDER BY e.starts_at ASC
        LIMIT 1`
    )
    .bind(nowIso)
    .first<EventRow>();

  if (churchEvent) {
    return {
      eventId: churchEvent.event_id,
      programId: churchEvent.program_id,
      programTitle: churchEvent.program_title,
      title: churchEvent.title,
      startsAt: churchEvent.starts_at,
      endsAt: churchEvent.ends_at,
      startAt: churchEvent.starts_at,
      endAt: churchEvent.ends_at,
      location: churchEvent.location ?? "",
      status: churchEvent.status,
      isEnrolled: false,
    };
  }

  return null;
}

async function resolveAnnouncement(
  db: D1Database,
  nowIso: string
): Promise<HomeAnnouncementDto | null> {
  const row = await db
    .prepare(
      `SELECT content_id, version, title, summary, body_markdown,
              cta_label, cta_url, image_url, image_alt, published_at, updated_at
         FROM home_content
        WHERE template_type = 'B'
          AND status = 'Published'
          AND (
            publish_mode = 'immediate' OR
            (start_at IS NOT NULL AND start_at <= ?)
          )
          AND (end_at IS NULL OR end_at > ?)
        ORDER BY version DESC, published_at DESC
        LIMIT 1`
    )
    .bind(nowIso, nowIso)
    .first<AnnouncementRow>();

  if (!row) {
    return null;
  }

  return {
    contentId: row.content_id,
    version: row.version,
    title: row.title ?? "",
    summary: row.summary ?? "",
    bodyMarkdown: row.body_markdown ?? null,
    ctaLabel: row.cta_label ?? null,
    ctaUrl: row.cta_url ?? null,
    imageUrl: row.image_url ?? null,
    imageAlt: row.image_alt ?? null,
    publishedAt: row.published_at ?? row.updated_at,
  };
}

async function resolveExploreProgram(
  db: D1Database,
  userId: string,
  nowIso: string
): Promise<HomeExploreProgramDto | null> {
  const row = await db
    .prepare(
      `SELECT p.program_id, p.name AS title, p.description AS summary,
              p.category, p.enrollment_mode AS enrollment_type,
              (
                SELECT MIN(e.starts_at)
                  FROM events e
                 WHERE e.program_id = p.program_id
                   AND e.status = 'Active'
                   AND e.availability = 'Active'
                   AND e.starts_at > ?
              ) AS next_event_start_at
         FROM programs p
        WHERE p.lifecycle = 'Active'
          AND p.discoverability = 'Listed'
          AND p.enrollment_mode = 'MemberRequest'
          AND EXISTS (
            SELECT 1 FROM events e
             WHERE e.program_id = p.program_id
               AND e.status = 'Active'
               AND e.availability = 'Active'
               AND e.starts_at > ?
          )
        ORDER BY
          CASE WHEN EXISTS (
            SELECT 1 FROM enrollments en
             WHERE en.program_id = p.program_id
               AND en.member_user_id = ?
               AND en.status = 'Active'
          ) THEN 1 ELSE 0 END ASC,
          p.display_order ASC,
          next_event_start_at ASC,
          p.created_at DESC
        LIMIT 1`
    )
    .bind(nowIso, nowIso, userId)
    .first<ExploreProgramRow>();

  if (!row) {
    return null;
  }

  return {
    programId: row.program_id,
    title: row.title,
    summary: row.summary ?? null,
    category: row.category ?? null,
    enrollmentType: row.enrollment_type,
    nextEventStartAt: row.next_event_start_at ?? null,
  };
}

/**
 * GET /api/v1/home
 * Returns the public home projection for the authenticated member.
 */
export async function handleGetHome(
  request: Request,
  env: HomeEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const auth = await requireActor(request, env, requestId);
    if (auth instanceof Response) {
      return auth;
    }

    const nowIso = new Date().toISOString();
    const [featuredEvent, announcement, exploreProgram] = await Promise.all([
      resolveFeaturedEvent(env.DB, auth.account.user_id, nowIso),
      resolveAnnouncement(env.DB, nowIso),
      resolveExploreProgram(env.DB, auth.account.user_id, nowIso),
    ]);

    const data: HomeProjectionData = {
      featuredEvent,
      announcement,
      exploreProgram,
    };

    return jsonResponse(200, data, requestId);
  } catch (error) {
    console.error(`[home] GET /api/v1/home failed requestId=${requestId}:`, error);
    return problem(
      503,
      "HOME_UNAVAILABLE",
      "Service unavailable",
      "Home content is temporarily unavailable.",
      requestId
    );
  }
}
