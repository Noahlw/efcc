/**
 * EFCC Home domain — browser client for `/api/v1/home`.
 *
 * Identity travels only in server-set httpOnly cookies.
 * Success response is unwrapped from `{ requestId, data }`.
 * Errors are RFC 9457 Problem Details surfaced as RpcError.
 */

import { RpcError } from "@/lib/api";
import type { ProblemDetails } from "@/lib/api";

export interface HomeFeaturedEvent {
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

export interface HomeAnnouncement {
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

export interface HomeExploreProgram {
  programId: string;
  title: string;
  summary: string | null;
  category: string | null;
  enrollmentType: string;
  nextEventStartAt: string | null;
}

export interface HomeData {
  featuredEvent: HomeFeaturedEvent | null;
  announcement: HomeAnnouncement | null;
  exploreProgram: HomeExploreProgram | null;
}

export interface HomeResponse {
  requestId: string;
  data: HomeData;
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

/** One fetch to the cookie-only home surface. Never builds auth headers. */
export async function getHome(): Promise<HomeData> {
  let res: Response;
  try {
    res = await fetch("/api/v1/home", {
      method: "GET",
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

  const requestId = res.headers.get("X-Request-Id") ?? undefined;
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    if (res.ok) {
      throw new RpcError({
        status: res.status,
        code: "MALFORMED_RESPONSE",
        title: "Malformed success response",
        detail: "伺服器回應格式錯誤。",
        requestId,
      });
    }
    throw new RpcError({
      status: res.status,
      code: "UNAVAILABLE",
      title: "Upstream error",
      detail: "系統暫時無法處理請求，請稍後再試。",
      requestId,
    });
  }

  if (!res.ok) {
    throw new RpcError(problemFromPayload(parsed, res.status, requestId));
  }
  if (!hasData(parsed)) {
    throw new RpcError({
      status: res.status,
      code: "MALFORMED_RESPONSE",
      title: "Malformed success envelope",
      detail: "伺服器回應格式錯誤。",
      requestId,
    });
  }
  return parsed.data as HomeData;
}
