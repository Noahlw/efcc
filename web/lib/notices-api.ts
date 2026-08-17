/**
 * Participant Notices client for the cookie-only Programs API.
 *
 * The browser sends same-origin requests only; authentication stays in the
 * Worker-managed httpOnly cookies. Non-2xx responses are surfaced as the
 * shared RFC 9457 `RpcError` shape used by the other domain clients.
 */

import { RpcError, type ProblemDetails } from "@/lib/api";

export type NoticeKind = "event" | "program" | "account";

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

interface NoticesSuccess<T> {
  request_id: string;
  data: T;
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
  method: "GET" | "POST"
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

  if (response.ok) {
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw malformedResponse(response.status);
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("data" in parsed)
    ) {
      throw malformedResponse(response.status);
    }
    return (parsed as NoticesSuccess<T>).data;
  }

  const requestId = response.headers.get("X-Request-Id") ?? undefined;
  let problem: ProblemDetails;
  try {
    problem = (await response.json()) as ProblemDetails;
  } catch {
    problem = {
      status: response.status,
      code: response.status >= 500 ? "UNAVAILABLE" : "MALFORMED_RESPONSE",
      requestId,
    };
  }
  if (typeof problem !== "object" || problem === null) {
    problem = {
      status: response.status,
      code: "MALFORMED_RESPONSE",
      requestId,
    };
  }
  if (typeof problem.status !== "number") {
    problem.status = response.status;
  }
  if (requestId && !problem.requestId) {
    problem.requestId = requestId;
  }
  throw new RpcError(problem);
}

/** GET /api/v1/programs/notices — member-scoped notices within retention. */
export function listNotices(): Promise<NoticesResult> {
  return noticesFetch<NoticesResult>("/api/v1/programs/notices", "GET");
}

/** POST /api/v1/programs/notices/read-all — idempotent member read-state write. */
export function markAllNoticesRead(): Promise<{ marked_count: number }> {
  return noticesFetch<{ marked_count: number }>(
    "/api/v1/programs/notices/read-all",
    "POST"
  );
}
