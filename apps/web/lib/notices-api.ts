/**
 * Participant Notices client for the cookie-only Programs API.
 *
 * The browser sends same-origin requests only; authentication stays in the
 * Worker-managed httpOnly cookies. Non-2xx responses are surfaced as the
 * shared RFC 9457 `RpcError` shape used by the other domain clients.
 */

import {
  MarkedCountSchema,
  ParticipantNoticesViewSchema,
  parseProblemDetails,
  parseSuccessEnvelope,
  problemFallback,
} from "@efcc/contracts";

import { RpcError, type ProblemDetails } from "@/lib/api";

type NoticeKind = "event" | "program" | "account";

export interface Notice {
  notice_id: string;
  kind: NoticeKind;
  title: string;
  body: string;
  program_id: string | null;
  event_id: string | null;
  read_at: number | null;
  created_at: number;
}

export interface NoticesResult {
  notices: Notice[];
  unread_count: number;
}

function idempotencyKey(): string {
  return crypto.randomUUID();
}

function malformedResponse(status: number): RpcError {
  return new RpcError({
    status,
    code: "MALFORMED_RESPONSE",
    title: "Malformed response",
    detail: "伺服器回應格式錯誤。",
  });
}

async function noticesFetch<T>(
  path: string,
  method: "GET" | "POST",
  payloadSchema: { safeParse: (value: unknown) => { success: boolean } }
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        Accept: "application/json",
        ...(method === "POST"
          ? {
              "Idempotency-Key": idempotencyKey(),
            }
          : {}),
      },
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
  if (response.ok) {
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw malformedResponse(response.status);
    }
    const envelope = parseSuccessEnvelope(parsed);
    // Shared contract gate (#656): malformed 2xx data is
    // MALFORMED_RESPONSE, never a partial success.
    if (!envelope || !payloadSchema.safeParse(envelope.data).success) {
      throw malformedResponse(response.status);
    }
    return envelope.data as T;
  }

  let parsedError: unknown;
  try {
    parsedError = await response.json();
  } catch {
    parsedError = null;
  }
  // Parse-failure fallback preserves the historical split (UNAVAILABLE
  // on 5xx, MALFORMED_RESPONSE otherwise); a parsed non-record is
  // always MALFORMED_RESPONSE, exactly as before.
  const fallbackCode =
    response.status >= 500 ? "UNAVAILABLE" : "MALFORMED_RESPONSE";
  const problem =
    parseProblemDetails(parsedError, response.status, requestId) ??
    (parsedError === null
      ? problemFallback(
          response.status,
          requestId,
          fallbackCode,
          "Upstream error",
          "系統暫時無法處理請求，請稍後再試。"
        )
      : problemFallback(
          response.status,
          requestId,
          "MALFORMED_RESPONSE",
          "Malformed error response",
          "伺服器回應格式錯誤。"
        ));
  throw new RpcError(problem as ProblemDetails);
}

/** GET /api/v1/programs/notices — member-scoped notices within retention. */
export function listNotices(): Promise<NoticesResult> {
  return noticesFetch<NoticesResult>(
    "/api/v1/programs/notices",
    "GET",
    ParticipantNoticesViewSchema
  );
}

/** POST /api/v1/programs/notices/read-all — idempotent member read-state write. */
export function markAllNoticesRead(): Promise<{ marked_count: number }> {
  return noticesFetch<{ marked_count: number }>(
    "/api/v1/programs/notices/read-all",
    "POST",
    MarkedCountSchema
  );
}
