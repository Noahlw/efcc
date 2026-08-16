import { findAccountByUserId } from "./auth/accounts";
import { readAuthCookies } from "./auth/cookies";
import { verifyAccessToken } from "./auth/sessions";

export interface HomeContentEnv {
  DB: D1Database;
  EFCC_ACCESS_TOKEN_SECRET: string;
}

export interface HomeContentRow {
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
  archived_by: string | null;
  archived_at: string | null;
}

interface FeaturedEventRow {
  event_id: string;
  program_id: string;
  name: string;
  starts_at: string;
  ends_at?: string | null;
  location?: string | null;
}

interface HomeHistorySnapshot {
  version: number;
  template_type: "A" | "B";
  status: "Draft" | "Published" | "Archived";
  title: string | null;
  summary: string | null;
  body_markdown: string | null;
  cta_label: string | null;
  cta_url: string | null;
  image_url: string | null;
  image_alt: string | null;
  featured_event_id: string | null;
}

interface HomeHistoryRow {
  content_id: string;
  version: number;
  template_type: "A" | "B";
  status: "Draft" | "Published" | "Archived";
  published_by: string | null;
  published_by_name: string | null;
  published_at: string;
  title: string | null;
  summary: string | null;
  body_markdown: string | null;
  cta_label: string | null;
  cta_url: string | null;
  image_url: string | null;
  image_alt: string | null;
  featured_event_id: string | null;
  before_version: number | null;
  before_template_type: "A" | "B" | null;
  before_status: "Draft" | "Published" | "Archived" | null;
  before_title: string | null;
  before_summary: string | null;
  before_body_markdown: string | null;
  before_cta_label: string | null;
  before_cta_url: string | null;
  before_image_url: string | null;
  before_image_alt: string | null;
  before_featured_event_id: string | null;
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const RAW_HTML = /<!--[\s\S]*-->|<\/?[a-zA-Z][^>]*>/u;
const DANGEROUS_SCHEME = /(?:javascript|vbscript|data)\s*:/iu;
const CONTENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function problem(
  status: number,
  code: string,
  title: string,
  detail: string,
  requestId: string,
  extensions: Record<string, unknown> = {}
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

function jsonResponse(status: number, data: unknown, requestId: string): Response {
  return Response.json(
    { requestId, data },
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
      },
    }
  );
}

function isHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

/** Reject active content instead of trying to make an incomplete HTML parser safe. */
export function sanitizeMarkdown(value: string): string | null {
  if (
    value.length > 100_000 ||
    RAW_HTML.test(value) ||
    DANGEROUS_SCHEME.test(value)
  ) {
    return null;
  }
  return value;
}

function isSafeLink(value: string): boolean {
  return (value.startsWith("/") && !value.startsWith("//")) || isHttpsUrl(value);
}
const MARKDOWN_LINK = /!?\[([^\]]*)\]\(([^)\s]+)\)/gu;

function renderMarkdown(value: string): string | null {
  if (sanitizeMarkdown(value) === null) return null;
  for (const match of value.matchAll(MARKDOWN_LINK)) {
    const destination = match[2] ?? "";
    if (
      match[0]?.startsWith("!") ||
      !(destination.startsWith("/") && !destination.startsWith("//")) &&
        !isHttpsUrl(destination)
    ) {
      return null;
    }
  }
  const escaped = value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  const inline = (line: string): string =>
    line
      .replace(
        /\[([^\]]+)\]\(((?:https:\/\/|\/)[^)\s]+)\)/gu,
        '<a href="$2" rel="noopener noreferrer">$1</a>'
      )
      .replace(/\*\*([^*\n]+)\*\*/gu, "<strong>$1</strong>")
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/gu, "<em>$1</em>");
  const output: string[] = [];
  let list: "ul" | "ol" | null = null;
  const closeList = () => {
    if (list) {
      output.push(`</${list}>`);
      list = null;
    }
  };
  for (const rawLine of escaped.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
    } else if (line.startsWith("### ")) {
      closeList();
      output.push(`<h3>${inline(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      closeList();
      output.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith("&gt; ")) {
      closeList();
      output.push(`<blockquote>${inline(line.slice(5))}</blockquote>`);
    } else if (/^[-*]\s+/u.test(line)) {
      if (list !== "ul") {
        closeList();
        output.push("<ul>");
        list = "ul";
      }
      output.push(`<li>${inline(line.replace(/^[-*]\s+/u, ""))}</li>`);
    } else if (/^\d+\.\s+/u.test(line)) {
      if (list !== "ol") {
        closeList();
        output.push("<ol>");
        list = "ol";
      }
      output.push(`<li>${inline(line.replace(/^\d+\.\s+/u, ""))}</li>`);
    } else {
      closeList();
      output.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return output.join("");
}
const SAFE_RENDERED_TAG =
  /<\/?(?:blockquote|h2|h3|p|ul|ol|li|strong|em)>|<a href="([^"]+)" rel="noopener noreferrer">|<\/a>/gu;

function isSafeRenderedHtml(value: string): boolean {
  if (DANGEROUS_SCHEME.test(value)) return false;
  const tags = [...value.matchAll(SAFE_RENDERED_TAG)];
  if (tags.length === 0) return false;
  for (const tag of tags) {
    const href = tag[1];
    if (href !== undefined && !isSafeLink(href)) return false;
  }
  return !value.replace(SAFE_RENDERED_TAG, "").includes("<") &&
    !value.replace(SAFE_RENDERED_TAG, "").includes(">");
}

/**
 * Render a stored body into allowlisted HTML for the public projection.
 * Legacy rows that already hold allowlisted rendered HTML pass through;
 * everything else is rendered from Markdown at read time so the public
 * surface never trusts raw stored bytes.
 */
function renderPublicBody(value: string | null): string | null {
  if (value === null) return null;
  if (isSafeRenderedHtml(value)) return value;
  return renderMarkdown(value);
}

function parseIso(value: unknown): string | null {
  if (typeof value !== "string" || !ISO_UTC.test(value) || Number.isNaN(Date.parse(value))) {
    return null;
  }
  return value;
}

function optionalText(
  body: Record<string, unknown>,
  key: string,
  maxLength: number
): string | null | undefined {
  const value = body[key];
  if (value === undefined || value === null) return value === null ? null : undefined;
  if (
    typeof value !== "string" ||
    value.length > maxLength ||
    RAW_HTML.test(value) ||
    DANGEROUS_SCHEME.test(value)
  ) {
    throw new Error(`${key} is invalid.`);
  }
  return value;
}

function rowDto(row: HomeContentRow): Record<string, unknown> {
  return {
    content_id: row.content_id,
    version: row.version,
    template_type: row.template_type,
    status: row.status,
    publish_mode: row.publish_mode,
    start_at: row.start_at,
    end_at: row.end_at,
    title: row.title,
    summary: row.summary,
    body_markdown: row.body_markdown,
    cta_label: row.cta_label,
    cta_url: row.cta_url,
    image_url: row.image_url,
    image_alt: row.image_alt,
    featured_event_id: row.featured_event_id,
    published_at: row.published_at,
    updated_at: row.updated_at,
    updated_by: row.updated_by,
  };
}
function historySnapshot(
  row: HomeHistoryRow,
  before: boolean
): HomeHistorySnapshot | null {
  if (!before) {
    return {
      version: row.version,
      template_type: row.template_type,
      status: row.status,
      title: row.title,
      summary: row.summary,
      body_markdown: row.body_markdown,
      cta_label: row.cta_label,
      cta_url: row.cta_url,
      image_url: row.image_url,
      image_alt: row.image_alt,
      featured_event_id: row.featured_event_id,
    };
  }
  if (
    row.before_version === null ||
    row.before_template_type === null ||
    row.before_status === null
  ) {
    return null;
  }
  return {
    version: row.before_version,
    template_type: row.before_template_type,
    status: row.before_status,
    title: row.before_title,
    summary: row.before_summary,
    body_markdown: row.before_body_markdown,
    cta_label: row.before_cta_label,
    cta_url: row.before_cta_url,
    image_url: row.before_image_url,
    image_alt: row.before_image_alt,
    featured_event_id: row.before_featured_event_id,
  };
}

async function latestByContentId(
  db: D1Database,
  contentId: string
): Promise<HomeContentRow | null> {
  return db
    .prepare(
      `SELECT * FROM home_content
        WHERE content_id = ?
        ORDER BY version DESC LIMIT 1`
    )
    .bind(contentId)
    .first<HomeContentRow>();
}

async function requireEditor(
  request: Request,
  env: HomeContentEnv,
  requestId: string
): Promise<{ userId: string; role: string } | Response> {
  const access = readAuthCookies(request.headers).accessToken;
  if (!access) {
    return problem(401, "AUTH_REQUIRED", "Unauthorized", "Access cookie missing.", requestId);
  }
  const claims = await verifyAccessToken(env.EFCC_ACCESS_TOKEN_SECRET, access);
  if (!claims) {
    return problem(401, "AUTH_REQUIRED", "Unauthorized", "Access token invalid or expired.", requestId);
  }
  const account = await findAccountByUserId(env.DB, claims.uid);
  if (!account) {
    return problem(401, "AUTH_REQUIRED", "Unauthorized", "Unknown account.", requestId);
  }
  if (account.account_status !== "Active") {
    return problem(403, "FORBIDDEN", "Forbidden", "Account is not active.", requestId);
  }
  if (account.role !== "Admin" && account.role !== "Staff") {
    return problem(403, "FORBIDDEN", "Forbidden", "Home publishing is restricted to Admin and Staff.", requestId);
  }
  const capability = await env.DB
    .prepare("SELECT 1 FROM role_capabilities WHERE role = ? AND capability = 'home.publish'")
    .bind(account.role)
    .first<{ 1: number }>();
  if (!capability) {
    return problem(403, "FORBIDDEN", "Forbidden", "Account lacks the home.publish capability.", requestId);
  }
  return { userId: account.user_id, role: account.role };
}

async function parseJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

interface DraftFields {
  contentId: string;
  template: "A" | "B";
  title: string | null;
  summary: string | null;
  body: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  featuredEventId: string | null;
}

function parseDraftFields(body: Record<string, unknown>): DraftFields | string {
  const contentId = body.content_id;
  const template = body.template_type;
  if (typeof contentId !== "string" || !CONTENT_ID.test(contentId)) {
    return "content_id is required and must be a safe identifier.";
  }
  if (template !== "A" && template !== "B") {
    return "template_type must be A or B.";
  }
  try {
    const title = optionalText(body, "title", 200) ?? null;
    const summary = optionalText(body, "summary", 500) ?? null;
    const rawBodyValue = body.body_markdown;
    const rawBody =
      rawBodyValue === undefined || rawBodyValue === null
        ? null
        : rawBodyValue;
    if (rawBody !== null) {
      if (
        typeof rawBody !== "string" ||
        rawBody.length > 100_000 ||
        renderMarkdown(rawBody) === null
      ) {
        return "body_markdown contains raw HTML, an embed, or a dangerous URL scheme.";
      }
    }
    const ctaLabel = optionalText(body, "cta_label", 60) ?? null;
    const rawCtaUrl = optionalText(body, "cta_url", 2048);
    const rawImageUrl = optionalText(body, "image_url", 2048);
    const rawImageAlt = optionalText(body, "image_alt", 160);
    const featured = optionalText(body, "featured_event_id", 128);
    if (
      template === "A" &&
      (rawBody != null ||
        ctaLabel !== null ||
        rawCtaUrl != null ||
        rawImageUrl != null ||
        rawImageAlt != null)
    ) {
      return "Template A does not accept Template B fields.";
    }
    if (template === "B" && featured != null) {
      return "Template B does not accept featured_event_id.";
    }
    const cleanBody = rawBody; // body_markdown stays raw Markdown; rendering happens at read time
    const ctaUrl =
      rawCtaUrl === undefined || rawCtaUrl === null ? null : rawCtaUrl;
    const imageUrl =
      rawImageUrl === undefined || rawImageUrl === null ? null : rawImageUrl;
    const imageAlt =
      rawImageAlt === undefined || rawImageAlt === null ? null : rawImageAlt;
    if (ctaUrl !== null && !isSafeLink(ctaUrl)) {
      return "cta_url must be an HTTPS URL or a same-origin path.";
    }
    if (imageUrl !== null && !isHttpsUrl(imageUrl)) {
      return "image_url must be an HTTPS URL.";
    }
    if (imageUrl !== null && !imageAlt?.trim()) {
      return "image_alt is required when image_url is set.";
    }
    if (imageUrl === null && imageAlt?.trim()) {
      return "image_alt requires image_url.";
    }
    return {
      contentId,
      template,
      title,
      summary,
      body: cleanBody,
      ctaLabel,
      ctaUrl,
      imageUrl,
      imageAlt,
      featuredEventId: featured ?? null,
    };
  } catch (error) {
    return error instanceof Error ? error.message : "Draft fields are invalid.";
  }
}

async function featuredEvent(
  db: D1Database,
  eventId: string | null
): Promise<FeaturedEventRow | null> {
  const eligible =
    `SELECT e.event_id, e.program_id, COALESCE(e.name, p.name) AS name,
            e.starts_at, e.ends_at, e.location
       FROM events e JOIN programs p ON p.program_id = e.program_id
      WHERE e.status = 'Active' AND e.availability = 'Active'
        AND p.lifecycle = 'Active' AND p.discoverability = 'Listed'
        AND e.starts_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;
  if (eventId) {
    const configured = await db
      .prepare(`${eligible} AND e.event_id = ? LIMIT 1`)
      .bind(eventId)
      .first<FeaturedEventRow>();
    if (configured) {
      return configured;
    }
  }
  return db
    .prepare(`${eligible} ORDER BY e.starts_at ASC LIMIT 1`)
    .first<FeaturedEventRow>();
}

/** Public, SQL-time-authoritative home projection. */
export async function handleGetHome(
  _request: Request,
  env: HomeContentEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const row = await env.DB
      .prepare(
        `SELECT * FROM home_content
          WHERE status = 'Published'
            AND publish_mode IN ('immediate', 'scheduled')
            AND (
              publish_mode = 'immediate' OR
              (start_at IS NOT NULL AND start_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            )
            AND (end_at IS NULL OR end_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
          ORDER BY version DESC, published_at DESC LIMIT 1`
      )
      .first<HomeContentRow>();
    const event =
      row?.template_type === "B"
        ? null
        : await featuredEvent(
            env.DB,
            row?.template_type === "A" ? row.featured_event_id : null
          );
    return jsonResponse(
      200,
      {
        content: row
          ? {
              template_type: row.template_type,
              content_id: row.content_id,
              version: row.version,
              published_at: row.published_at,
              updated_at: row.updated_at,
              title: row.title,
              summary: row.summary,
              body_html: renderPublicBody(row.body_markdown),
              cta_label: row.cta_label,
              cta_url: row.cta_url,
              image_alt: row.image_alt,
              featured_event: event,
              fallback: false,
            }
          : {
              template_type: "A",
              content_id: null,
              version: null,
              published_at: null,
              updated_at: null,
              title: null,
              summary: null,
              body_html: null,
              cta_label: null,
              cta_url: null,
              image_alt: null,
              featured_event: event,
              fallback: true,
            },
      },
      requestId
    );
  } catch (error) {
    console.error(`[home] public projection failed requestId=${requestId}:`, error);
    return problem(
      503,
      "HOME_UNAVAILABLE",
      "Service unavailable",
      "Home content is temporarily unavailable.",
      requestId
    );
  }
}

/** GET /api/v1/home/editor. */
export async function handleGetHomeEditor(
  request: Request,
  env: HomeContentEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const auth = await requireEditor(request, env, requestId);
    if (auth instanceof Response) return auth;
    const [a, b] = await Promise.all([
      env.DB.prepare("SELECT * FROM home_content WHERE template_type = 'A' ORDER BY updated_at DESC, version DESC LIMIT 1").first<HomeContentRow>(),
      env.DB.prepare("SELECT * FROM home_content WHERE template_type = 'B' ORDER BY updated_at DESC, version DESC LIMIT 1").first<HomeContentRow>(),
    ]);
    return jsonResponse(200, { drafts: { template_a: a ? rowDto(a) : null, template_b: b ? rowDto(b) : null } }, requestId);
  } catch (error) {
    console.error(`[home] editor read failed requestId=${requestId}:`, error);
    return problem(503, "HOME_UNAVAILABLE", "Service unavailable", "Home editor is temporarily unavailable.", requestId);
  }
}

/** GET /api/v1/home/history — admin publishing history, newest first. */
export async function handleGetHomeHistory(
  request: Request,
  env: HomeContentEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const auth = await requireEditor(request, env, requestId);
    if (auth instanceof Response) return auth;
    if (auth.role !== "Admin") {
      return problem(
        403,
        "FORBIDDEN",
        "Forbidden",
        "Home publishing history is restricted to Admin accounts.",
        requestId
      );
    }
    // `before` is the nearest lower version that was already published for
    // this content ID; draft-only versions are intentionally skipped.
    const rows = await env.DB
      .prepare(
        `SELECT h.content_id, h.version, h.template_type, h.status,
                h.published_by, a.name AS published_by_name, h.published_at,
                h.title, h.summary, h.body_markdown, h.cta_label, h.cta_url,
                h.image_url, h.image_alt, h.featured_event_id,
                prior_row.version AS before_version,
                prior_row.template_type AS before_template_type,
                prior_row.status AS before_status,
                prior_row.title AS before_title,
                prior_row.summary AS before_summary,
                prior_row.body_markdown AS before_body_markdown,
                prior_row.cta_label AS before_cta_label,
                prior_row.cta_url AS before_cta_url,
                prior_row.image_url AS before_image_url,
                prior_row.image_alt AS before_image_alt,
                prior_row.featured_event_id AS before_featured_event_id
           FROM home_content h
           LEFT JOIN accounts a ON a.user_id = h.published_by
           LEFT JOIN home_content prior_row
             ON prior_row.content_id = h.content_id
            AND prior_row.published_at IS NOT NULL
            AND prior_row.version = (
              SELECT MAX(previous.version)
                FROM home_content previous
               WHERE previous.content_id = h.content_id
                 AND previous.published_at IS NOT NULL
                 AND previous.version < h.version
            )
          WHERE h.published_at IS NOT NULL
          ORDER BY h.published_at DESC, h.version DESC
          LIMIT 50`
      )
      .all<HomeHistoryRow>();
    const history = (rows.results ?? []).map((row) => ({
      content_id: row.content_id,
      version: row.version,
      template_type: row.template_type,
      status: row.status,
      published_by: row.published_by,
      published_by_name: row.published_by_name,
      published_at: row.published_at,
      before: historySnapshot(row, true),
      after: historySnapshot(row, false),
    }));
    return jsonResponse(200, { history }, requestId);
  } catch (error) {
    console.error(`[home] history read failed requestId=${requestId}:`, error);
    return problem(
      503,
      "HOME_UNAVAILABLE",
      "Service unavailable",
      "Home publishing history is temporarily unavailable.",
      requestId
    );
  }
}

/** PUT /api/v1/home/drafts. */
export async function handlePutHomeDraft(
  request: Request,
  env: HomeContentEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const auth = await requireEditor(request, env, requestId);
    if (auth instanceof Response) return auth;
    const body = await parseJson(request);
    if (!body) return problem(422, "VALIDATION", "Validation failed", "A JSON object is required.", requestId);
    const fields = parseDraftFields(body);
    if (typeof fields === "string") return problem(422, "VALIDATION", "Validation failed", fields, requestId);
    const latest = await latestByContentId(env.DB, fields.contentId);
    const base = body.base_version;
    if (latest) {
      if (!Number.isInteger(base) || base !== latest.version) {
        return problem(409, "HOME_CONTENT_CONFLICT", "Conflict", "The draft has changed; keep your edits and reload the current version.", requestId, { current_version: latest.version });
      }
      if (latest.template_type !== fields.template) {
        return problem(422, "VALIDATION", "Validation failed", "template_type does not match the existing content.", requestId);
      }
    } else if (base !== undefined && base !== 0) {
      return problem(409, "HOME_CONTENT_CONFLICT", "Conflict", "The draft does not exist at the requested base version.", requestId, { current_version: 0 });
    }
    if (fields.featuredEventId) {
      const event = await env.DB.prepare("SELECT 1 FROM events WHERE event_id = ?").bind(fields.featuredEventId).first<{ 1: number }>();
      if (!event) return problem(422, "VALIDATION", "Validation failed", "featured_event_id does not reference an event.", requestId);
    }
    const now = new Date().toISOString();
    const nextVersion = await env.DB
      .prepare("SELECT COALESCE(MAX(version), 0) + 1 AS version FROM home_content")
      .first<{ version: number }>();
    const version = Number(nextVersion?.version ?? 1);
    await env.DB.prepare(
      `INSERT INTO home_content
        (content_id, version, template_type, status, publish_mode, start_at, end_at,
         title, summary, body_markdown, cta_label, cta_url, image_url, image_alt,
         featured_event_id, created_by, created_at, updated_by, updated_at)
       VALUES (?, ?, ?, 'Draft', 'immediate', NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      fields.contentId,
      version,
      fields.template,
      fields.title,
      fields.summary,
      fields.body,
      fields.ctaLabel,
      fields.ctaUrl,
      fields.imageUrl,
      fields.imageAlt,
      fields.featuredEventId,
      latest?.created_by ?? auth.userId,
      latest?.created_at ?? now,
      auth.userId,
      now
    ).run();
    const draft = await latestByContentId(env.DB, fields.contentId);
    return jsonResponse(version === 1 ? 201 : 200, { draft: draft ? rowDto(draft) : null }, requestId);
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) {
      return problem(409, "HOME_CONTENT_CONFLICT", "Conflict", "The draft has changed; keep your edits and reload the current version.", requestId);
    }
    console.error(`[home] draft write failed requestId=${requestId}:`, error);
    return problem(503, "HOME_UNAVAILABLE", "Service unavailable", "Home content is temporarily unavailable.", requestId);
  }
}

function publishWindow(
  body: Record<string, unknown>,
  now: string
): { mode: "immediate" | "scheduled"; startAt: string; endAt: string | null } | string {
  const mode = body.publish_mode;
  if (mode !== "immediate" && mode !== "scheduled") return "publish_mode must be immediate or scheduled.";
  const requestedStart = body.start_at;
  const requestedEnd = body.end_at;
  if (requestedStart !== undefined && requestedStart !== null && parseIso(requestedStart) === null) return "start_at must be an ISO-8601 UTC instant.";
  if (requestedEnd !== undefined && requestedEnd !== null && parseIso(requestedEnd) === null) return "end_at must be an ISO-8601 UTC instant.";
  const startAt = mode === "immediate" ? now : (requestedStart as string | undefined);
  if (!startAt) return "start_at is required for scheduled publishing.";
  if (mode === "scheduled" && Date.parse(startAt) <= Date.parse(now)) return "scheduled start_at must be in the future.";
  const endAt = requestedEnd === undefined || requestedEnd === null ? null : (requestedEnd as string);
  if (endAt !== null && Date.parse(endAt) <= Date.parse(startAt)) return "end_at must be after start_at.";
  return { mode, startAt, endAt };
}

async function audit(
  db: D1Database,
  input: {
    actorUserId: string | null;
    action: string;
    entityId: string;
    oldValue: unknown;
    newValue: unknown;
    reason: string | null;
    outcome: "SUCCESS" | "CONFLICT" | "DENIED" | "FAILED";
    correlationId: string;
  }
): Promise<D1PreparedStatement> {
  return db.prepare(
    `INSERT INTO audit_events
      (audit_id, inserted_at, actor_user_id, action, entity_type, entity_id,
       old_value_json, new_value_json, reason, outcome, correlation_id)
     VALUES (?, ?, ?, ?, 'home_content', ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    new Date().toISOString(),
    input.actorUserId,
    input.action,
    input.entityId,
    input.oldValue === null ? null : JSON.stringify(input.oldValue),
    input.newValue === null ? null : JSON.stringify(input.newValue),
    input.reason,
    input.outcome,
    input.correlationId
  );
}

/** POST /api/v1/home/publish. */
export async function handlePublishHome(
  request: Request,
  env: HomeContentEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const auth = await requireEditor(request, env, requestId);
    if (auth instanceof Response) return auth;
    const body = await parseJson(request);
    if (
      !body ||
      typeof body.content_id !== "string" ||
      !CONTENT_ID.test(body.content_id) ||
      !Number.isInteger(body.base_version)
    ) {
      return problem(
        422,
        "VALIDATION",
        "Validation failed",
        "content_id and integer base_version are required.",
        requestId
      );
    }
    const contentId = body.content_id;
    const latest = await latestByContentId(env.DB, contentId);
    if (!latest) {
      return problem(
        404,
        "NOT_FOUND",
        "Not found",
        "No draft exists for content_id.",
        requestId
      );
    }
    if (latest.version !== body.base_version || latest.status !== "Draft") {
      await (
        await audit(env.DB, {
          actorUserId: auth.userId,
          action: "HOME_CONTENT_PUBLISH",
          entityId: contentId,
          oldValue: { version: latest.version, status: latest.status },
          newValue: null,
          reason: "stale base version",
          outcome: "CONFLICT",
          correlationId: requestId,
        })
      ).run();
      return problem(
        409,
        "HOME_CONTENT_CONFLICT",
        "Conflict",
        "The draft has changed; keep your edits and reload the current version.",
        requestId,
        { current_version: latest.version }
      );
    }
    const now = new Date().toISOString();
    const window = publishWindow(body, now);
    if (typeof window === "string") {
      return problem(422, "VALIDATION", "Validation failed", window, requestId);
    }
    const update = env.DB.prepare(
      `UPDATE home_content
          SET status = 'Published', publish_mode = ?, start_at = ?, end_at = ?,
              published_by = ?, published_at = ?, updated_by = ?, updated_at = ?
        WHERE content_id = ? AND version = ? AND status = 'Draft'`
    ).bind(
      window.mode,
      window.startAt,
      window.endAt,
      auth.userId,
      now,
      auth.userId,
      now,
      contentId,
      latest.version
    );
    const updateResult = await update.run();
    if ((updateResult.meta.changes ?? 0) !== 1) {
      const current = await latestByContentId(env.DB, contentId);
      await (
        await audit(env.DB, {
          actorUserId: auth.userId,
          action: "HOME_CONTENT_PUBLISH",
          entityId: contentId,
          oldValue: {
            version: current?.version ?? latest.version,
            status: current?.status ?? "Unknown",
          },
          newValue: null,
          reason: "stale base version",
          outcome: "CONFLICT",
          correlationId: requestId,
        })
      ).run();
      return problem(
        409,
        "HOME_CONTENT_CONFLICT",
        "Conflict",
        "The draft has changed; keep your edits and reload the current version.",
        requestId,
        { current_version: current?.version ?? latest.version }
      );
    }
    await (
      await audit(env.DB, {
        actorUserId: auth.userId,
        action: "HOME_CONTENT_PUBLISH",
        entityId: contentId,
        oldValue: { version: latest.version, status: latest.status },
        newValue: {
          version: latest.version,
          publish_mode: window.mode,
          start_at: window.startAt,
          end_at: window.endAt,
        },
        reason: null,
        outcome: "SUCCESS",
        correlationId: requestId,
      })
    ).run();
    const published = await latestByContentId(env.DB, contentId);
    return jsonResponse(
      200,
      { published: published ? rowDto(published) : null },
      requestId
    );
  } catch (error) {
    console.error(`[home] publish failed requestId=${requestId}:`, error);
    return problem(
      503,
      "HOME_UNAVAILABLE",
      "Service unavailable",
      "Home content is temporarily unavailable.",
      requestId
    );
  }
}

/** Idempotent five-minute cron operation. */
export async function runHomeContentExpiry(
  db: D1Database,
  now: string = new Date().toISOString()
): Promise<number> {
  const rows = await db.prepare(
    `SELECT content_id, version, end_at FROM home_content
      WHERE status = 'Published' AND end_at IS NOT NULL AND end_at <= ?`
  ).bind(now).all<{ content_id: string; version: number; end_at: string }>();
  let expired = 0;
  for (const row of rows.results ?? []) {
    const update = db
      .prepare(
        `UPDATE home_content
            SET status = 'Archived', archived_by = NULL, archived_at = ?, updated_at = ?
          WHERE content_id = ? AND version = ? AND status = 'Published'`
      )
      .bind(now, now, row.content_id, row.version);
    const result = await update.run();
    if ((result.meta.changes ?? 0) !== 1) continue;
    const auditStatement = await audit(db, {
      actorUserId: null,
      action: "HOME_CONTENT_EXPIRED",
      entityId: row.content_id,
      oldValue: { version: row.version, status: "Published", end_at: row.end_at },
      newValue: { version: row.version, status: "Archived" },
      reason: "Publication window expired.",
      outcome: "SUCCESS",
      correlationId: crypto.randomUUID(),
    });
    await auditStatement.run();
    expired += 1;
  }
  return expired;
}
