/**
 * Browser client for the Home Content CMS endpoints.
 *
 * Identity remains in the server-set httpOnly cookies. Mutations carry a fresh
 * idempotency key, while every successful response is unwrapped from the
 * shared `{ requestId, data }` envelope.
 */

import { RpcError } from "@/lib/api";
import type { ProblemDetails } from "@/lib/api";

export type HomeTemplateType = "A" | "B";
/** Wire values required by POST /api/v1/home/publish. */
export type HomePublishMode = "immediate" | "scheduled";

export interface HomeEvent {
  event_id?: string;
  eventId?: string;
  name?: string | null;
  starts_at?: string | null;
  startsAt?: string | null;
  ends_at?: string | null;
  endsAt?: string | null;
  location?: string | null;
}

/**
 * The Worker uses snake_case domain fields. The camelCase aliases are kept in
 * this boundary because fixtures and older preview payloads may use the
 * browser spelling; HomeSurface normalizes both before rendering.
 */
export interface HomeContent {
  content_id?: string;
  contentId?: string;
  version?: number;
  template_type?: HomeTemplateType;
  templateType?: HomeTemplateType;
  template?: HomeTemplateType;
  status?: "Draft" | "Published" | "Archived";
  publish_mode?: HomePublishMode | null;
  publishMode?: HomePublishMode | null;
  featured_event_id?: string | null;
  featuredEventId?: string | null;
  featured_event?: HomeEvent | null;
  featuredEvent?: HomeEvent | null;
  fallback_event?: HomeEvent | null;
  fallbackEvent?: HomeEvent | null;
  event?: HomeEvent | null;
  fallback?: boolean;
  title?: string | null;
  summary?: string | null;
  /** Server-validated Markdown or allowlisted HTML. */
  body_markdown?: string | null;
  bodyMarkdown?: string | null;
  body?: string | null;
  body_html?: string | null;
  bodyHtml?: string | null;
  sanitized_body_html?: string | null;
  sanitizedBodyHtml?: string | null;
  image_url?: string | null;
  imageUrl?: string | null;
  image_alt?: string | null;
  imageAlt?: string | null;
  cta_label?: string | null;
  ctaLabel?: string | null;
  cta_url?: string | null;
  ctaUrl?: string | null;
  start_at?: string | null;
  startAt?: string | null;
  end_at?: string | null;
  endAt?: string | null;
  [key: string]: unknown;
}

export interface HomeResponse {
  content?: HomeContent | null;
  [key: string]: unknown;
}

export interface HomeEditorResponse {
  drafts?: {
    template_a?: HomeContent | null;
    template_b?: HomeContent | null;
    [key: string]: HomeContent | null | undefined;
  };
  draft?: HomeContent | null;
  content?: HomeContent | null;
  latest_version?: number;
  latestVersion?: number;
  version?: number;
  [key: string]: unknown;
}

export interface HomeDraftInput {
  content_id: string;
  base_version?: number;
  template_type: HomeTemplateType;
  title?: string | null;
  summary?: string | null;
  body_markdown?: string | null;
  cta_label?: string | null;
  cta_url?: string | null;
  image_url?: string | null;
  image_alt?: string | null;
  featured_event_id?: string | null;
}

export interface HomePublishInput {
  content_id: string;
  base_version: number;
  publish_mode: HomePublishMode;
  start_at?: string;
  end_at?: string;
}

export interface HomeHistoryEntry {
  content_id?: string;
  version?: number;
  template_type?: HomeTemplateType;
  status?: "Draft" | "Published" | "Archived";
  published_by?: string | null;
  published_by_name?: string | null;
  published_at?: string | null;
}

export interface HomeHistoryResponse {
  history?: HomeHistoryEntry[];
}



function recordFrom(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function problemFromPayload(
  parsed: unknown,
  status: number,
  requestId?: string
): ProblemDetails {
  const outer = recordFrom(parsed);
  if (!outer) {
    return { status, code: "UNAVAILABLE", requestId };
  }
  const source = recordFrom(outer.error) ?? outer;
  const problem: ProblemDetails = {};
  for (const key of [
    "type",
    "title",
    "detail",
    "instance",
    "code",
    "requestId",
  ] as const) {
    const value = source[key];
    if (typeof value === "string") {
      problem[key] = value;
    }
  }
  problem.status =
    typeof source.status === "number" ? source.status : status;
  if (requestId && !problem.requestId) {
    problem.requestId = requestId;
  }
  return problem;
}

function hasData(value: unknown): value is { data: unknown } {
  const record = recordFrom(value);
  return record !== null && "data" in record && record.data !== undefined;
}

async function homeFetch<T>(
  path: string,
  method: "GET" | "PUT" | "POST",
  body?: unknown
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(method === "GET" ? {} : { "Idempotency-Key": crypto.randomUUID() }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new RpcError({
      status: 0,
      code: "NETWORK_ERROR",
      title: "Network error",
      detail: "無法連接伺服器，請檢查網路後再試。",
    });
  }

  const requestId = response.headers.get("X-Request-Id") ?? undefined;
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    if (response.ok) {
      throw new RpcError({
        status: response.status,
        code: "MALFORMED_RESPONSE",
        title: "Malformed success response",
        detail: "伺服器回應格式錯誤。",
        requestId,
      });
    }
    throw new RpcError({
      status: response.status,
      code: "UNAVAILABLE",
      title: "Upstream error",
      detail: "系統暫時無法處理請求，請稍後再試。",
      requestId,
    });
  }

  if (!response.ok) {
    throw new RpcError(problemFromPayload(parsed, response.status, requestId));
  }
  if (!hasData(parsed)) {
    throw new RpcError({
      status: response.status,
      code: "MALFORMED_RESPONSE",
      title: "Malformed success envelope",
      detail: "伺服器回應格式錯誤。",
      requestId,
    });
  }
  const data = parsed.data;
  return data as T;
}

/** GET /api/v1/home — public current Home projection. */
export function getHome(): Promise<HomeResponse> {
  return homeFetch<HomeResponse>("/api/v1/home", "GET");
}

/** GET /api/v1/home/editor — editor draft and latest committed version. */
export function getHomeEditor(): Promise<HomeEditorResponse> {
  return homeFetch<HomeEditorResponse>("/api/v1/home/editor", "GET");
}

/** GET /api/v1/home/history — admin publishing history, newest first. */
export function getHomeHistory(): Promise<HomeHistoryResponse> {
  return homeFetch<HomeHistoryResponse>("/api/v1/home/history", "GET");
}

/** PUT /api/v1/home/drafts — replace the editor's current draft. */
export function saveHomeDraft(
  input: HomeDraftInput
): Promise<HomeEditorResponse> {
  return homeFetch<HomeEditorResponse>("/api/v1/home/drafts", "PUT", input);
}

/** POST /api/v1/home/publish — publish with optimistic concurrency. */
export function publishHome(
  input: HomePublishInput
): Promise<HomeEditorResponse> {
  return homeFetch<HomeEditorResponse>("/api/v1/home/publish", "POST", input);
}
