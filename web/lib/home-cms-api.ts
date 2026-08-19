/**
 * Browser client for the authenticated Home Content CMS surface.
 *
 * Identity travels only in server-set httpOnly cookies. Mutations use the
 * same-origin `{ requestId, data }` envelope and expose RFC 9457 errors as
 * `RpcError`, matching the rest of the management client.
 */

import { RpcError } from "@/lib/api";
import type { ProblemDetails } from "@/lib/api";

export type HomeTemplateType = "A" | "B";
export type HomeContentStatus = "Draft" | "Published" | "Archived";
export type HomePublishMode = "immediate" | "scheduled";

export interface HomeContent {
  contentId: string;
  version: number;
  templateType: HomeTemplateType;
  status: HomeContentStatus;
  publishMode: HomePublishMode;
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
  updatedBy: string | null;
  updatedAt: string;
  publishedBy: string | null;
  publishedAt: string | null;
}

export interface HomeDraftInput {
  content_id?: string;
  expected_version?: number;
  template_type: HomeTemplateType;
  publish_mode?: HomePublishMode;
  start_at?: string | null;
  end_at?: string | null;
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
  version: number;
  publish_mode: HomePublishMode;
  start_at?: string | null;
  end_at?: string | null;
}

export interface HomeAuditItem {
  auditId: string;
  insertedAt: string;
  actorUserId: string;
  actorName?: string | null;
  action: string;
  entityId: string;
  version: number;
  templateType: HomeTemplateType;
}

export interface FeaturedEventPreview {
  eventId: string;
  programId: string;
  programTitle: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  status: string;
}

interface SuccessEnvelope<T> {
  requestId: string;
  data: T;
}

function fallbackProblem(status: number): ProblemDetails {
  return {
    status,
    code: status >= 500 ? "UNAVAILABLE" : "MALFORMED_RESPONSE",
    title: status >= 500 ? "Upstream error" : "Malformed error response",
    detail:
      status >= 500
        ? "系統暫時無法處理請求，請稍後再試。"
        : "伺服器回應格式錯誤。",
  };
}

function requestIdFrom(response: Response): string | undefined {
  return response.headers.get("X-Request-Id") ?? undefined;
}

function idempotencyKey(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `home-cms-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function homeCmsFetch<T>(
  path: string,
  method: "GET" | "POST",
  body?: unknown
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(method === "POST" ? { "Idempotency-Key": idempotencyKey() } : {}),
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

  const parsed = await readJson(response);
  if (!response.ok) {
    const problem =
      typeof parsed === "object" && parsed !== null
        ? ({ ...(parsed as ProblemDetails) } as ProblemDetails)
        : fallbackProblem(response.status);
    problem.status ??= response.status;
    problem.requestId ??= requestIdFrom(response);
    throw new RpcError(problem);
  }

  if (typeof parsed !== "object" || parsed === null || !("data" in parsed)) {
    throw new RpcError({
      status: response.status,
      code: "MALFORMED_RESPONSE",
      title: "Malformed success response",
      detail: "伺服器回應格式錯誤。",
      requestId: requestIdFrom(response),
    });
  }

  return (parsed as SuccessEnvelope<T>).data;
}

/** GET /api/v1/home/content — latest editable draft/published content. */
export function getHomeContent(): Promise<HomeContent | null> {
  return homeCmsFetch<HomeContent | null>("/api/v1/home/content", "GET");
}

/** POST /api/v1/home/draft — persist the current editor as an unpublished draft. */
export function saveHomeDraft(input: HomeDraftInput): Promise<HomeContent> {
  return homeCmsFetch<HomeContent>("/api/v1/home/draft", "POST", input);
}

/** POST /api/v1/home/publish — publish now or queue a Hong Kong-time window. */
export function publishHomeContent(
  input: HomePublishInput
): Promise<HomeContent> {
  return homeCmsFetch<HomeContent>("/api/v1/home/publish", "POST", input);
}

/** GET /api/v1/home/audit — visible publication accountability history. */
export function listHomeAudit(limit = 25): Promise<{ items: HomeAuditItem[] }> {
  return homeCmsFetch<{ items: HomeAuditItem[] }>(
    `/api/v1/home/audit?limit=${encodeURIComponent(String(limit))}`,
    "GET"
  );
}

/** GET /api/v1/home/cms/featured-event/:eventId — resolve a draft featured event for preview. */
export function getFeaturedEventPreview(
  eventId: string
): Promise<FeaturedEventPreview> {
  return homeCmsFetch<FeaturedEventPreview>(
    `/api/v1/home/cms/featured-event/${encodeURIComponent(eventId)}`,
    "GET"
  );
}
