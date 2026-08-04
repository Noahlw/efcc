/**
 * EFCC same-origin RPC proxy Worker (ADR-0017 / ADR-0018, CF1-01 / #151).
 *
 * Transport-only: serves the Next.js static export via the `ASSETS` binding
 * for every path except `/api/*` (routed here via `run_worker_first` in
 * wrangler.jsonc), which is proxied to the Apps Script `/exec` endpoint.
 * Owns CORS/preflight, signed service envelope construction (CF1-01),
 * the Apps Script body-status remap (load-bearing - ContentService.TextOutput
 * cannot set HTTP status), request correlation, and session-keyed rate
 * limiting. Owns NO business authorization - that stays server-enforced
 * in Apps Script.
 *
 * CF1-01 (#151): the Worker constructs a versioned HMAC-SHA-256 service
 * envelope over the browser's request, signed with EFCC_SERVICE_SECRET.
 * Browser Authorization, X-Efcc-Session-Id, and Idempotency-Key are never
 * forwarded as raw upstream headers (ADR-0018 §2, §4).
 *
 * Pointer: https://github.com/Noahlw/efcc/issues/142 (CF0-01)
 *          https://github.com/Noahlw/efcc/issues/151 (CF1-01)
 */

import { signServiceEnvelope } from "./lib/service-envelope";
import type { ServiceEnvelope } from "./lib/service-envelope";

export interface Env {
  ASSETS: Fetcher;
  APPS_SCRIPT_EXEC_URL: string;
  /**
   * HMAC-SHA-256 signing key for the service envelope (CF1-01 / #151).
   * Shared secret between the Worker and Apps Script. Must be set before
   * deployment; absent in dev/test causes the Worker to fail closed with
   * 503 PROXY_MISCONFIGURED.
   */
  EFCC_SERVICE_SECRET?: string;
  /**
   * Rate Limiting binding (ADR-0018 §9). Optional in dev/test - when absent,
   * rate limiting is skipped. Keys on session identity (authenticated) or
   * the login body's username (anonymous), NEVER on client IP per
   * Cloudflare's own binding guidance.
   */
  RPC_RATE_LIMITER?: RateLimit;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Efcc-Session-Id, Idempotency-Key",
};

// ---------------------------------------------------------------------------
// Helpers (declared before use per lint rule; hoisting works but the rule
// prefers textual ordering for readability).
// ---------------------------------------------------------------------------

/**
 * Rate-limit key: authenticated session identity, or the login body's
 * username for anonymous login attempts. NEVER client IP (ADR-0018 §9:
 * "can be shared by many users... especially on mobile networks").
 * Returns null when no usable identity is present - the Worker skips
 * limiting rather than blocking unidentified traffic.
 */
async function rateLimitKeyFor(request: Request): Promise<string | null> {
  const sessionId = request.headers.get("X-Efcc-Session-Id");
  if (sessionId) {
    return `sess:${sessionId}`;
  }

  // Anonymous path: key on the login body's username. Clone the request
  // so the body remains readable for the upstream forward below.
  try {
    const peek = await request.clone().json();
    if (typeof peek === "object" && peek !== null) {
      const { action } = peek as { action?: unknown };
      const username = (peek as { params?: { username?: unknown } }).params
        ?.username;
      if (action === "loginUser" && typeof username === "string") {
        return `login:${username}`;
      }
    }
  } catch {
    // Malformed body - no key; the upstream forward will reject it.
  }
  return null;
}

/** Build a minimal RFC 9457 Problem Details response. */
function problemResponse(
  status: number,
  code: string,
  title: string,
  origin: string,
  detail?: string,
  extra?: { retryAfter?: string }
): Response {
  // One correlation ID threads through both the body and the header
  // (ADR-0018 §8: "The same requestId value threads through... both
  // response envelopes").
  const requestId = crypto.randomUUID();
  const body = JSON.stringify({
    type: `tag:efcc.app,2026:error:${code}`,
    status,
    code,
    title,
    detail,
    requestId,
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/problem+json",
    "Access-Control-Allow-Origin": origin,
    "X-Request-Id": requestId,
  };
  if (extra?.retryAfter) {
    headers["Retry-After"] = extra.retryAfter;
  }
  return new Response(body, { status, headers });
}

/**
 * Session-keyed rate limiting (ADR-0018 §9). Returns a problem response
 * when the request must be rejected, or null when it may proceed. Fail
 * closed: when an identity is present, a missing/throws binding drops
 * the request with 503 rather than silently skipping the limit.
 */
async function enforceRateLimit(
  request: Request,
  env: Env,
  origin: string
): Promise<Response | null> {
  const rateLimitKey = await rateLimitKeyFor(request);
  if (!rateLimitKey) {return null;}

  if (!env.RPC_RATE_LIMITER) {
    return problemResponse(
      503,
      "UNAVAILABLE",
      "Service unavailable",
      origin,
      "系統暫時無法處理請求，請稍後再試。"
    );
  }
  try {
    const { success } = await env.RPC_RATE_LIMITER.limit({
      key: rateLimitKey,
    });
    if (!success) {
      return problemResponse(
        429,
        "RATE_LIMITED",
        "Too many requests",
        origin,
        "請求過於頻繁，請稍後再試。",
        { retryAfter: "60" }
      );
    }
  } catch {
    return problemResponse(
      503,
      "UNAVAILABLE",
      "Service unavailable",
      origin,
      "系統暫時無法處理請求，請稍後再試。"
    );
  }
  return null;
}

/**
 * Forward the signed envelope to Apps Script and remap its body status
 * onto the outer HTTP response. Apps Script's TextOutput has no API to
 * set an HTTP status code — doPost responses are always transport-level
 * 200 regardless of what the JSON body says. The dispatcher embeds the
 * real intended status in the body's `status` field; this proxy remaps
 * it so RFC 9457's "status MUST match the response status" (ADR-0018 §5)
 * holds for the browser. Load-bearing correctness, not a nicety.
 */
async function forwardToAppsScript(
  env: Env,
  origin: string,
  envelope: ServiceEnvelope
): Promise<Response> {
  let upstream: Response;
  try {
    // Bounded timeout per AGENTS.md Production Resilience. 30s gives
    // Apps Script headroom under its 6-min limit while preventing the
    // Worker from hanging on a dead upstream.
    upstream = await fetch(env.APPS_SCRIPT_EXEC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    return problemResponse(
      502,
      "UPSTREAM_UNREACHABLE",
      "Upstream unreachable",
      origin,
      error instanceof Error ? error.message : String(error)
    );
  }

  const upstreamBody = await upstream.text();
  let remappedStatus = upstream.status;
  let isProblem = false;
  let upstreamRequestId: string | undefined;
  try {
    const parsed = JSON.parse(upstreamBody) as {
      status?: unknown;
      requestId?: unknown;
    };
    if (typeof parsed.status === "number") {
      remappedStatus = parsed.status;
      isProblem = remappedStatus >= 400;
    }
    if (typeof parsed.requestId === "string") {
      upstreamRequestId = parsed.requestId;
    }
  } catch {
    // Not JSON (or malformed) - fall through with upstream.status.
  }

  // Correlation (ADR-0018 §8): prefer the upstream's requestId, fall
  // back to a fresh UUID so every response carries one for log search.
  const requestId = upstreamRequestId ?? crypto.randomUUID();

  return new Response(upstreamBody, {
    status: remappedStatus,
    headers: {
      "Content-Type": isProblem
        ? "application/problem+json"
        : "application/json",
      "Access-Control-Allow-Origin": origin,
      "X-Request-Id": requestId,
    },
  });
}

/**
 * Parse the browser request body, reject structured and credential-bearing
 * shapes, and return either a structured Problem details response or the
 * validated action/params projection. Called by the Worker fetch handler
 * to enforce the CF1-01 boundary invariant: a browser cannot smuggle
 * `sessionToken` through `params` and a JSON null body short-circuits to
 * VALIDATION before any upstream fetch.
 */
async function parseAndValidateBody(
  request: Request,
  origin: string
): Promise<
  | {response: Response}
  | {action: string; params: Record<string, unknown>}
> {
  const bodyText = await request.text();

  let bodyParsed: unknown;
  try {
    bodyParsed = JSON.parse(bodyText);
  } catch {
    return {
      response: problemResponse(
        400,
        "VALIDATION",
        "Bad Request",
        origin,
        "Invalid JSON body"
      ),
    };
  }

  if (
    bodyParsed === null ||
    typeof bodyParsed !== "object" ||
    Array.isArray(bodyParsed)
  ) {
    return {
      response: problemResponse(
        400,
        "VALIDATION",
        "Bad Request",
        origin,
        "Invalid JSON body"
      ),
    };
  }

  const body = bodyParsed as Record<string, unknown>;
  const {action} = body;
  if (!action || typeof action !== "string") {
    return {
      response: problemResponse(
        400,
        "VALIDATION",
        "Bad Request",
        origin,
        "Missing action field"
      ),
    };
  }

  const rawParams = body.params;
  if (rawParams === undefined) {
    return {action, params: {}};
  }
  const params = rawParams as Record<string, unknown>;
  if (
    rawParams === null ||
    typeof rawParams !== "object" ||
    Array.isArray(rawParams) ||
    Object.hasOwn(params, "sessionToken")
  ) {
    return {
      response: problemResponse(
        400,
        "VALIDATION",
        "Bad Request",
        origin,
        "Invalid params field"
      ),
    };
  }
  return {action, params};
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      // Should not normally be reached (run_worker_first scopes this
      // Worker to /api/* only), but fall back to assets defensively.
      return env.ASSETS.fetch(request);
    }

    const origin = request.headers.get("Origin") ?? "*";

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { ...CORS_HEADERS, "Access-Control-Allow-Origin": origin },
      });
    }

    if (request.method !== "POST") {
      return problemResponse(
        405,
        "METHOD_NOT_ALLOWED",
        "Method Not Allowed",
        origin
      );
    }

    if (!env.APPS_SCRIPT_EXEC_URL) {
      return problemResponse(
        500,
        "PROXY_MISCONFIGURED",
        "Proxy misconfigured",
        origin,
        "APPS_SCRIPT_EXEC_URL is not set"
      );
    }

    // Rate limit (ADR-0018 §9) - session-keyed, never IP. Fail closed:
    // when an identity is present, a missing/throws binding drops the
    // request with 503 rather than silently skipping the limit (which
    // would let unauthenticated traffic reach the upstream unchecked).
    const limited = await enforceRateLimit(request, env, origin);
    if (limited) {return limited;}

    // CF1-01 (#151): construct the signed service envelope. The Worker
    // terminates the browser boundary and applies the service-authenticated
    // transport. Browser Authorization, X-Efcc-Session-Id, and
    // Idempotency-Key are never forwarded as raw upstream headers
    // (ADR-0018 §2, §4). The upstream only receives Content-Type and the
    // signed envelope body.
    const auth = request.headers.get("Authorization");
    const sessionId = request.headers.get("X-Efcc-Session-Id");
    const idempotencyKey = request.headers.get("Idempotency-Key");
    const validated = await parseAndValidateBody(request, origin);
    if ("response" in validated) {
      return validated.response;
    }
    const {action, params} = validated;

    if (!env.EFCC_SERVICE_SECRET) {
      return problemResponse(
        503,
        "PROXY_MISCONFIGURED",
        "Service unavailable",
        origin,
        "系統暫時無法處理請求，請稍後再試。"
      );
    }

    const envelope = await signServiceEnvelope(env.EFCC_SERVICE_SECRET, {
      action,
      params,
      sessionId: sessionId ?? undefined,
      authorization: auth ?? undefined,
      idempotencyKey: idempotencyKey ?? undefined,
    });

    return forwardToAppsScript(env, origin, envelope);
  },
} satisfies ExportedHandler<Env>;
