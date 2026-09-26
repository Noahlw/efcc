/**
 * EFCC Home domain — browser client for `/api/v1/home`.
 *
 * Identity travels only in server-set httpOnly cookies.
 * Success response is unwrapped from `{ requestId, data }`.
 * Errors are RFC 9457 Problem Details surfaced as RpcError.
 */

import type { HomeAnnouncement, HomeProjection } from "@efcc/contracts";
import {
  HomeAnnouncementsSchema,
  HomeProjectionSchema,
  parseProblemDetails,
  parseSuccessEnvelope,
  problemFallback,
} from "@efcc/contracts";

import { RpcError } from "@/lib/api";
import type { ProblemDetails } from "@/lib/api";

export type { HomeAnnouncement };
/** Browser name for the shared home projection contract. */
export type HomeData = HomeProjection;

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
  const source = outer ? (recordFrom(outer.error) ?? outer) : parsed;
  return (
    parseProblemDetails(source, status, requestId) ??
    problemFallback(
      status,
      requestId,
      "UNAVAILABLE",
      "Upstream error",
      "系統暫時無法處理請求，請稍後再試。"
    )
  );
}

/** One fetch to the cookie-only home surface. Never builds auth headers. */
async function homeGet<T>(
  path: string,
  payloadSchema: { safeParse: (value: unknown) => { success: boolean } }
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
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
  const envelope = parseSuccessEnvelope(parsed);
  // Shared contract gate (#646): the envelope carries no shape promise —
  // a 2xx whose data fails the route schema is MALFORMED_RESPONSE,
  // never a partial success.
  if (!envelope || !payloadSchema.safeParse(envelope.data).success) {
    throw new RpcError({
      status: res.status,
      code: "MALFORMED_RESPONSE",
      title: "Malformed success envelope",
      detail: "伺服器回應格式錯誤。",
      requestId,
    });
  }
  return envelope.data as T;
}

export function getHome(): Promise<HomeData> {
  return homeGet<HomeData>("/api/v1/home", HomeProjectionSchema);
}

export function listAnnouncements(): Promise<{
  announcements: HomeAnnouncement[];
}> {
  return homeGet<{ announcements: HomeAnnouncement[] }>(
    "/api/v1/home/announcements",
    HomeAnnouncementsSchema
  );
}
