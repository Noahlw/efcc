import {
  FeaturedEventPreviewSchema,
  HomeAuditListSchema,
  HomeContentSchema,
  HomePublishModeSchema,
  HomeTemplateTypeSchema,
  clampLimit,
  isValidExpectedVersion,
  normalizeHkTimestamp,
  positiveInt,
} from "@efcc/contracts";
import type { HomePublishMode, HomeTemplateType } from "@efcc/contracts";

import type { AccountRow } from "./auth/accounts";
import { resolveRequestSession } from "./auth/sessions";
import { CAPABILITY } from "./programs/capabilities";
import { D1CapabilityAuthorizer } from "./programs/capability-authorizer";

export interface HomeCmsEnv {
  DB: D1Database;
  EFCC_ACCESS_TOKEN_SECRET: string;
}

interface HomeContentRow {
  content_id: string;
  version: number;
  template_type: "A" | "B";
  status: "Draft" | "Published" | "Archived";
  publish_mode: "immediate" | "scheduled";
  start_at: string | null;
  end_at: string | null;
  title: string | null;
  summary: string | null;
  body_markdown: string | null;
  cta_label: string | null;
  cta_url: string | null;
  image_url: string | null;
  image_alt: string | null;
  featured_event_id: string | null;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  published_by: string | null;
  published_at: string | null;
}

interface AuditRow {
  audit_id: string;
  inserted_at: string;
  actor_user_id: string | null;
  actor_name: string | null;
  action: string;
  entity_id: string;
  new_value_json: string | null;
}

const CONTENT_ID = "home";

function problem(
  status: number,
  code: string,
  title: string,
  detail: string,
  requestId: string,
  extensions?: Record<string, unknown>
): Response {
  return Response.json(
    {
      type: `tag:apps-script/efcc/errors#${code}`,
      title,
      status,
      code,
      detail,
      requestId,
      ...extensions,
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
  data: unknown,
  requestId: string
): Response {
  return Response.json(
    { requestId, data },
    { status, headers: { "X-Request-Id": requestId } }
  );
}

function homeUnavailable(requestId: string, detail: string): Response {
  return problem(
    503,
    "HOME_UNAVAILABLE",
    "Service unavailable",
    detail,
    requestId
  );
}

async function requireActor(
  request: Request,
  env: HomeCmsEnv,
  requestId: string
): Promise<{ account: AccountRow } | Response> {
  const resolved = await resolveRequestSession(
    request,
    env.DB,
    env.EFCC_ACCESS_TOKEN_SECRET
  );
  if (resolved.status === "missing") {
    return problem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Access cookie missing.",
      requestId
    );
  }
  if (resolved.status === "invalid") {
    return problem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Access token invalid or expired.",
      requestId
    );
  }
  if (resolved.status === "unknown_account") {
    return problem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Unknown account.",
      requestId
    );
  }
  const { account } = resolved;
  if (account.account_status !== "Active") {
    return problem(
      403,
      "FORBIDDEN",
      "Forbidden",
      "Account is not active.",
      requestId
    );
  }
  const canPublish = await new D1CapabilityAuthorizer(env.DB).can(
    { actorUserId: account.user_id },
    CAPABILITY.HOME_PUBLISH,
    null
  );
  if (!canPublish) {
    return problem(
      403,
      "FORBIDDEN",
      "Forbidden",
      "Home publishing capability is required.",
      requestId
    );
  }
  return { account };
}

async function parseJson(
  request: Request
): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function optionalString(
  body: Record<string, unknown>,
  key: string
): string | null | undefined {
  if (!(key in body)) {
    return undefined;
  }
  const value = body[key];
  return value === null
    ? null
    : typeof value === "string"
      ? value.trim()
      : undefined;
}

function sanitizeBody(
  value: string | null | undefined
): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }
  return value
    .replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "")
    .replaceAll(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "")
    .replaceAll(/javascript\s*:/giu, "");
}

function latestDto(row: HomeContentRow | null): Record<string, unknown> | null {
  if (!row) {
    return null;
  }
  return {
    contentId: row.content_id,
    version: row.version,
    templateType: row.template_type,
    status: row.status,
    publishMode: row.publish_mode,
    startAt: row.start_at,
    endAt: row.end_at,
    title: row.title,
    summary: row.summary,
    bodyMarkdown: row.body_markdown,
    ctaLabel: row.cta_label,
    ctaUrl: row.cta_url,
    imageUrl: row.image_url,
    imageAlt: row.image_alt,
    featuredEventId: row.featured_event_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
    publishedBy: row.published_by,
    publishedAt: row.published_at,
  };
}

function latestContent(
  db: D1Database,
  contentId: string
): Promise<HomeContentRow | null> {
  return db
    .prepare(
      "SELECT * FROM home_content WHERE content_id = ? ORDER BY version DESC LIMIT 1"
    )
    .bind(contentId)
    .first<HomeContentRow>();
}

function conflict(requestId: string, row: HomeContentRow | null): Response {
  return problem(
    409,
    "CONFLICT",
    "Content changed",
    "The latest published content must be reloaded before saving.",
    requestId,
    { latest: latestDto(row), reloadRequired: true }
  );
}

// oxlint-disable-next-line complexity
function validateFields(
  body: Record<string, unknown>,
  existing: HomeContentRow | null,
  requestId: string
):
  | {
      templateType: HomeTemplateType;
      publishMode: HomePublishMode;
      startAt: string | null;
      endAt: string | null;
    }
  | Response {
  const templateType =
    body.template_type ?? body.templateType ?? existing?.template_type;
  if (!HomeTemplateTypeSchema.safeParse(templateType).success) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "template_type must be A or B.",
      requestId
    );
  }
  const publishMode =
    body.publish_mode ??
    body.publishMode ??
    existing?.publish_mode ??
    "immediate";
  if (!HomePublishModeSchema.safeParse(publishMode).success) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "publish_mode must be immediate or scheduled.",
      requestId
    );
  }
  const startRaw = body.start_at ?? body.startAt ?? existing?.start_at;
  const startAt =
    publishMode === "scheduled" ? normalizeHkTimestamp(startRaw) : null;
  if (publishMode === "scheduled" && !startAt) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "A valid HK-time start_at is required for scheduled content.",
      requestId
    );
  }
  const endRaw = body.end_at ?? body.endAt ?? existing?.end_at;
  const endAt =
    endRaw === null || endRaw === undefined || endRaw === ""
      ? null
      : normalizeHkTimestamp(endRaw);
  if (endRaw !== null && endRaw !== undefined && endRaw !== "" && !endAt) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "end_at must be a valid timestamp.",
      requestId
    );
  }
  if (startAt && endAt && endAt <= startAt) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "end_at must be after start_at.",
      requestId
    );
  }
  return {
    templateType: templateType as HomeTemplateType,
    publishMode: publishMode as HomePublishMode,
    startAt,
    endAt,
  };
}

function field(
  body: Record<string, unknown>,
  key: string,
  existing: HomeContentRow | null
): string | null {
  // oxlint-disable-next-line prefer-named-capture-group
  const camelKey = key.replaceAll(/_([a-z])/gu, (_, letter: string) =>
    letter.toUpperCase()
  );
  const supplied =
    key in body ? optionalString(body, key) : optionalString(body, camelKey);
  if (supplied !== undefined) {
    return supplied;
  }
  return existing
    ? (existing[key as keyof HomeContentRow] as string | null)
    : null;
}

export async function handleGetHomeContent(
  request: Request,
  env: HomeCmsEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  try {
    const latest = await env.DB.prepare(
      "SELECT * FROM home_content ORDER BY version DESC LIMIT 1"
    ).first<HomeContentRow>();
    const data = latestDto(latest);
    if (!HomeContentSchema.nullable().safeParse(data).success) {
      console.error(
        `[home-cms] GET content malformed data requestId=${requestId}`
      );
      return homeUnavailable(
        requestId,
        "Home content is temporarily unavailable."
      );
    }
    return jsonResponse(200, data, requestId);
  } catch (error) {
    console.error(
      `[home-cms] GET content failed requestId=${requestId}:`,
      error
    );
    return problem(
      503,
      "HOME_UNAVAILABLE",
      "Service unavailable",
      "Home content is temporarily unavailable.",
      requestId
    );
  }
}

interface FeaturedEventPreviewRow {
  event_id: string;
  program_id: string;
  program_title: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string;
  status: string;
}

export async function handleGetFeaturedEventPreview(
  request: Request,
  env: HomeCmsEnv,
  eventId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const trimmed = eventId.trim();
  if (!trimmed) {
    return problem(
      404,
      "NOT_FOUND",
      "Not found",
      "Featured event not found.",
      requestId
    );
  }
  try {
    const row = await env.DB.prepare(
      `SELECT e.event_id, e.program_id, p.name AS program_title,
              COALESCE(e.name, p.name) AS title,
              e.starts_at, e.ends_at, COALESCE(e.location, '') AS location,
              e.status
         FROM events e
         JOIN programs p ON p.program_id = e.program_id
        WHERE e.event_id = ?`
    )
      .bind(trimmed)
      .first<FeaturedEventPreviewRow>();
    if (!row) {
      return problem(
        404,
        "NOT_FOUND",
        "Not found",
        "Featured event not found.",
        requestId
      );
    }
    const data = {
      eventId: row.event_id,
      programId: row.program_id,
      programTitle: row.program_title,
      title: row.title,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      location: row.location,
      status: row.status,
    };
    if (!FeaturedEventPreviewSchema.safeParse(data).success) {
      console.error(
        `[home-cms] GET featured-event preview malformed data requestId=${requestId}`
      );
      return homeUnavailable(
        requestId,
        "Home content is temporarily unavailable."
      );
    }
    return jsonResponse(200, data, requestId);
  } catch (error) {
    console.error(
      `[home-cms] GET featured-event preview failed requestId=${requestId}:`,
      error
    );
    return problem(
      503,
      "HOME_UNAVAILABLE",
      "Service unavailable",
      "Home content is temporarily unavailable.",
      requestId
    );
  }
}

export async function handleSaveHomeDraft(
  request: Request,
  env: HomeCmsEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await parseJson(request);
  if (!body) {
    return problem(
      400,
      "INVALID_JSON",
      "Invalid request",
      "Request body must be a JSON object.",
      requestId
    );
  }
  const contentId =
    optionalString(body, "content_id") ??
    optionalString(body, "contentId") ??
    CONTENT_ID;
  const expected = body.expected_version ?? body.expectedVersion;
  if (!isValidExpectedVersion(expected)) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "expected_version must be a positive integer.",
      requestId
    );
  }
  try {
    const current = await latestContent(env.DB, contentId);
    if (
      expected !== undefined &&
      (current === null || current.version !== expected)
    ) {
      return conflict(requestId, current);
    }
    const validation = validateFields(body, current, requestId);
    if (validation instanceof Response) {
      return validation;
    }
    const now = new Date().toISOString();
    const versionRow = await env.DB.prepare(
      "SELECT COALESCE(MAX(version), 0) + 1 AS version FROM home_content"
    ).first<{ version: number }>();
    const version = versionRow?.version ?? 1;
    const values = {
      title: field(body, "title", current),
      summary: field(body, "summary", current),
      bodyMarkdown: sanitizeBody(field(body, "body_markdown", current)),
      ctaLabel: field(body, "cta_label", current),
      ctaUrl: field(body, "cta_url", current),
      imageUrl: field(body, "image_url", current),
      imageAlt: field(body, "image_alt", current),
      featuredEventId: field(body, "featured_event_id", current),
    };
    const result = await env.DB.batch([
      ...(current?.status === "Draft"
        ? [
            env.DB.prepare(
              "UPDATE home_content SET status = 'Archived', archived_by = ?, archived_at = ?, updated_by = ?, updated_at = ? WHERE content_id = ? AND version = ?"
            ).bind(
              auth.account.user_id,
              now,
              auth.account.user_id,
              now,
              contentId,
              current.version
            ),
          ]
        : []),
      env.DB.prepare(`INSERT INTO home_content
        (content_id, version, template_type, status, publish_mode, start_at, end_at,
         title, summary, body_markdown, cta_label, cta_url, image_url, image_alt,
         featured_event_id, created_by, created_at, updated_by, updated_at)
        VALUES (?, ?, ?, 'Draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        contentId,
        version,
        validation.templateType,
        validation.publishMode,
        validation.startAt,
        validation.endAt,
        values.title,
        values.summary,
        values.bodyMarkdown,
        values.ctaLabel,
        values.ctaUrl,
        values.imageUrl,
        values.imageAlt,
        values.featuredEventId,
        auth.account.user_id,
        now,
        auth.account.user_id,
        now
      ),
    ]);
    if (!result.length) {
      throw new Error("Draft write returned no result");
    }
    const saved = await env.DB.prepare(
      "SELECT * FROM home_content WHERE content_id = ? AND version = ?"
    )
      .bind(contentId, version)
      .first<HomeContentRow>();
    const savedDto = latestDto(saved);
    // Shared contract gate (#646): a malformed stored row must not
    // become a malformed 2xx. Same 503 fallback, never a new code.
    if (!HomeContentSchema.nullable().safeParse(savedDto).success) {
      console.error(
        `[home-cms] POST draft malformed data requestId=${requestId}`
      );
      return homeUnavailable(
        requestId,
        "Home content is temporarily unavailable."
      );
    }
    return jsonResponse(200, savedDto, requestId);
  } catch (error) {
    console.error(
      `[home-cms] POST draft failed requestId=${requestId}:`,
      error
    );
    return problem(
      503,
      "HOME_UNAVAILABLE",
      "Service unavailable",
      "Home content is temporarily unavailable.",
      requestId
    );
  }
}

export async function handlePublishHome(
  request: Request,
  env: HomeCmsEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await parseJson(request);
  if (!body) {
    return problem(
      400,
      "INVALID_JSON",
      "Invalid request",
      "Request body must be a JSON object.",
      requestId
    );
  }
  const contentId =
    optionalString(body, "content_id") ??
    optionalString(body, "contentId") ??
    CONTENT_ID;
  const { version } = body;
  if (!positiveInt.safeParse(version).success) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "version must be a positive integer.",
      requestId
    );
  }
  try {
    const current = await latestContent(env.DB, contentId);
    if (!current || current.version !== version || current.status !== "Draft") {
      return conflict(requestId, current);
    }
    const validation = validateFields(body, current, requestId);
    if (validation instanceof Response) {
      return validation;
    }
    const now = new Date().toISOString();
    if (
      validation.publishMode === "scheduled" &&
      validation.startAt !== null &&
      validation.startAt <= now
    ) {
      return problem(
        422,
        "VALIDATION",
        "Validation failed",
        "Scheduled start_at must be in the future.",
        requestId
      );
    }
    const auditValue = JSON.stringify({
      version,
      templateType: validation.templateType,
      publishMode: validation.publishMode,
      startAt: validation.startAt,
    });
    await env.DB.batch([
      env.DB.prepare(`UPDATE home_content SET status = 'Published', template_type = ?, publish_mode = ?, start_at = ?, end_at = ?,
        updated_by = ?, updated_at = ?, published_by = ?, published_at = ? WHERE content_id = ? AND version = ? AND status = 'Draft'`).bind(
        validation.templateType,
        validation.publishMode,
        validation.startAt,
        validation.endAt,
        auth.account.user_id,
        now,
        auth.account.user_id,
        now,
        contentId,
        version
      ),
      env.DB.prepare(`INSERT INTO audit_events
        (audit_id, inserted_at, actor_user_id, action, entity_type, entity_id, new_value_json, outcome, correlation_id)
        VALUES (?, ?, ?, 'HOME_PUBLISH', 'home_content', ?, ?, 'SUCCESS', ?)`).bind(
        crypto.randomUUID(),
        now,
        auth.account.user_id,
        contentId,
        auditValue,
        requestId
      ),
    ]);
    const published = await env.DB.prepare(
      "SELECT * FROM home_content WHERE content_id = ? AND version = ?"
    )
      .bind(contentId, version)
      .first<HomeContentRow>();
    const publishedDto = latestDto(published);
    if (!HomeContentSchema.nullable().safeParse(publishedDto).success) {
      console.error(
        `[home-cms] POST publish malformed data requestId=${requestId}`
      );
      return homeUnavailable(
        requestId,
        "Home content is temporarily unavailable."
      );
    }
    return jsonResponse(200, publishedDto, requestId);
  } catch (error) {
    console.error(
      `[home-cms] POST publish failed requestId=${requestId}:`,
      error
    );
    return problem(
      503,
      "HOME_UNAVAILABLE",
      "Service unavailable",
      "Home content is temporarily unavailable.",
      requestId
    );
  }
}

export async function handleListHomeAudit(
  request: Request,
  env: HomeCmsEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireActor(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }
  const url = new URL(request.url);
  // Shared clamp policy (#646): coerce then clamp to [1, 100], default
  // 50 — identical outcomes to the inline version (never 422).
  const limit = clampLimit(url.searchParams.get("limit"), 50, 1, 100);
  try {
    const rows =
      await env.DB.prepare(`SELECT a.audit_id, a.inserted_at, a.actor_user_id, ac.name AS actor_name,
      a.action, a.entity_id, a.new_value_json
      FROM audit_events a LEFT JOIN accounts ac ON ac.user_id = a.actor_user_id
      WHERE a.entity_type = 'home_content' AND a.action = 'HOME_PUBLISH' AND a.outcome = 'SUCCESS'
      ORDER BY a.inserted_at DESC LIMIT ?`)
        .bind(limit)
        .all<AuditRow>();
    const items = (rows.results ?? []).map((row) => {
      let details: { version?: number; templateType?: HomeTemplateType } = {};
      try {
        details = row.new_value_json
          ? (JSON.parse(row.new_value_json) as typeof details)
          : {};
      } catch {
        /* malformed historical audit remains visible */
      }
      return {
        auditId: row.audit_id,
        insertedAt: row.inserted_at,
        actorUserId: row.actor_user_id ?? "",
        actorName: row.actor_name,
        action: row.action,
        entityId: row.entity_id,
        contentId: row.entity_id,
        version: details.version ?? null,
        templateType: details.templateType ?? null,
      };
    });
    const data = { items };
    if (!HomeAuditListSchema.safeParse(data).success) {
      console.error(
        `[home-cms] GET audit malformed data requestId=${requestId}`
      );
      return homeUnavailable(
        requestId,
        "Home audit is temporarily unavailable."
      );
    }
    return jsonResponse(200, data, requestId);
  } catch (error) {
    console.error(`[home-cms] GET audit failed requestId=${requestId}:`, error);
    return problem(
      503,
      "HOME_UNAVAILABLE",
      "Service unavailable",
      "Home audit is temporarily unavailable.",
      requestId
    );
  }
}
