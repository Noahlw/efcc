/**
 * Browser client for the authenticated Home Content CMS surface.
 *
 * Identity travels only in server-set httpOnly cookies. Mutations use the
 * same-origin `{ requestId, data }` envelope and expose RFC 9457 errors as
 * `RpcError`, matching the rest of the management client.
 */

import type {
  FeaturedEventPreview,
  HomeAuditItem,
  HomeContent,
  HomeContentStatus,
  HomePublishMode,
  HomeTemplateType,
} from "@efcc/contracts";
import {
  FeaturedEventPreviewSchema,
  HomeAuditListSchema,
  HomeContentSchema,
  parseProblemDetails,
  parseSuccessEnvelope,
  problemFallback,
} from "@efcc/contracts";

import { RpcError } from "@/lib/api";
import type { ProblemDetails } from "@/lib/api";

export type {
  FeaturedEventPreview,
  HomeAuditItem,
  HomeContent,
  HomeContentStatus,
  HomePublishMode,
  HomeTemplateType,
};

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
  payloadSchema: { safeParse: (value: unknown) => { success: boolean } },
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
  const headerRequestId = requestIdFrom(response);
  if (!response.ok) {
    // Shared error contract (#646): a well-formed Problem Details keeps
    // its codes and extensions; anything else falls back with the HTTP
    // status and request reference — never success.
    const resolved =
      parseProblemDetails(parsed, response.status, headerRequestId) ??
      problemFallback(
        response.status,
        headerRequestId,
        response.status >= 500 ? "UNAVAILABLE" : "MALFORMED_RESPONSE",
        response.status >= 500 ? "Upstream error" : "Malformed error response",
        response.status >= 500
          ? "系統暫時無法處理請求，請稍後再試。"
          : "伺服器回應格式錯誤。"
      );
    throw new RpcError(resolved as ProblemDetails);
  }

  const envelope = parseSuccessEnvelope(parsed);
  // Shared contract gate (#646): malformed 2xx data is
  // MALFORMED_RESPONSE, never a partial success.
  if (!envelope || !payloadSchema.safeParse(envelope.data).success) {
    throw new RpcError({
      status: response.status,
      code: "MALFORMED_RESPONSE",
      title: "Malformed success response",
      detail: "伺服器回應格式錯誤。",
      requestId: headerRequestId,
    });
  }

  return envelope.data as T;
}

/** GET /api/v1/home/content — latest editable draft/published content. */
export function getHomeContent(): Promise<HomeContent | null> {
  return homeCmsFetch<HomeContent | null>(
    "/api/v1/home/content",
    "GET",
    HomeContentSchema.nullable()
  );
}

/** POST /api/v1/home/draft — persist the current editor as an unpublished draft. */
export function saveHomeDraft(input: HomeDraftInput): Promise<HomeContent> {
  return homeCmsFetch<HomeContent>(
    "/api/v1/home/draft",
    "POST",
    HomeContentSchema,
    input
  );
}

/** POST /api/v1/home/publish — publish now or queue a Hong Kong-time window. */
export function publishHomeContent(
  input: HomePublishInput
): Promise<HomeContent> {
  return homeCmsFetch<HomeContent>(
    "/api/v1/home/publish",
    "POST",
    HomeContentSchema,
    input
  );
}

/** GET /api/v1/home/audit — visible publication accountability history. */
export function listHomeAudit(limit = 25): Promise<{ items: HomeAuditItem[] }> {
  return homeCmsFetch<{ items: HomeAuditItem[] }>(
    `/api/v1/home/audit?limit=${encodeURIComponent(String(limit))}`,
    "GET",
    HomeAuditListSchema
  );
}

/** GET /api/v1/home/cms/featured-event/:eventId — resolve a draft featured event for preview. */
export function getFeaturedEventPreview(
  eventId: string
): Promise<FeaturedEventPreview> {
  return homeCmsFetch<FeaturedEventPreview>(
    `/api/v1/home/cms/featured-event/${encodeURIComponent(eventId)}`,
    "GET",
    FeaturedEventPreviewSchema
  );
}
