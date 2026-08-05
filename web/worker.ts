/**
 * EFCC Cloudflare Worker (ADR-0017 / ADR-0018 / ADR-0020 / ADR-0021).
 *
 * Two routes, two transport contracts:
 *
 *   * `/api/v1/auth/*` — cookie-only auth surface (AUTH-04 #162 / AUTH-06
 *     #165). Six locked actions — register, login, refresh, logout,
 *     registrations/:id/approve, registrations/:id/reject — plus the
 *     preserved legacy forced-upgrade helpers (upgrade, me, admin-unlock).
 *     No CORS, no OPTIONS, no Authorization header, no X-Efcc-Session-Id
 *     header. Token material travels only in two httpOnly Secure
 *     SameSite=Strict cookies. The transport guard rejects forbidden
 *     headers before any handler runs.
 *
 *   * `/api/v1/rpc` — same-origin RPC proxy for the legacy domain RPCs
 *     (ADR-0018). The legacy proxy contract is preserved unchanged: it
 *     forwards Authorization / X-Efcc-Session-Id / Idempotency-Key, emits
 *     CORS preflight, and remaps the Apps Script body status onto the
 *     outer HTTP response. No business authorization is owned here.
 *
 * Non-/api paths fall through to the ASSETS binding (static export).
 * AUTH-01 (#159) and AUTH-02 (#160) keep D1 as the identity authority; AUTH-04
 * (#162) / AUTH-06 (#165) expose the locked cookie-only auth boundary.
 */

export interface Env {
  ASSETS: Fetcher;
  APPS_SCRIPT_EXEC_URL: string;
  /**
   * D1 identity database (ADR-0020 / AUTH-01 #159). Sole system of record
   * for accounts, credentials, sessions, and registration requests. The
   * auth/session lifecycle in web/lib/auth/ reads and writes here.
   *
   * Set via `wrangler secret put EFCC_ACCESS_TOKEN_SECRET` before deploy;
   * the Worker fails closed when it is absent.
   */
  DB: D1Database;
  EFCC_ACCESS_TOKEN_SECRET?: string;
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
    if (
      typeof peek === "object" &&
      peek !== null &&
      "action" in peek &&
      "params" in peek
    ) {
      const { action } = peek;
      const { params } = peek;
      if (
        action === "loginUser" &&
        typeof params === "object" &&
        params !== null &&
        "username" in params
      ) {
        const { username } = params;
        if (typeof username === "string") {
          return `login:${username}`;
        }
      }
    }
  } catch {
    // Malformed body - no key; the upstream forward will reject it.
  }
  return null;
}

/** Build a minimal RFC 9457 Problem Details response (proxy path only). */
function problemResponse(
  status: number,
  code: string,
  title: string,
  origin: string,
  detail?: string,
  extra?: { retryAfter?: string }
): Response {
  const requestId = crypto.randomUUID();
  const body: Record<string, unknown> = {
    type: `https://efcc.dev/problems/${code.toLowerCase()}`,
    status,
    code,
    title,
    requestId,
  };
  if (detail !== undefined) {
    body.detail = detail;
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/problem+json",
    "Access-Control-Allow-Origin": origin,
    "X-Request-Id": requestId,
  };
  if (extra?.retryAfter) {
    headers["Retry-After"] = extra.retryAfter;
  }
  return Response.json(body, { status, headers });
}

function authProblemResponse(
  status: number,
  code: string,
  title: string,
  detail: string
): Response {
  const requestId = crypto.randomUUID();
  return Response.json(
    {
      type: `tag:apps-script/efcc/errors#${code}`,
      title,
      status,
      detail,
      code,
      requestId,
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

/**
 * Cookie-only transport guard for the `/api/v1/auth/*` surface (AUTH-04 #162).
 * Rejects:
 *   * OPTIONS / non-POST/GET methods (no CORS preflight support).
 *   * Authorization header (every flavor is forbidden on this surface).
 *   * X-Efcc-Session-Id header (the legacy session id travels only via the
 *     opaque refresh cookie).
 *   * Cross-origin requests (no CORS = no cross-origin).
 * Returns null on a clean cookie-only same-origin request, or a 403/405
 * Response otherwise.
 */
function authTransportGuard(request: Request): Response | null {
  const url = new URL(request.url);
  const reqOrigin = request.headers.get("Origin");
  // Same-origin when no Origin is sent (same-host navigation) or when the
  // Origin matches the Worker's own host.
  if (reqOrigin) {
    let reqOriginHost: string;
    try {
      reqOriginHost = new URL(reqOrigin).host;
    } catch {
      return authProblemResponse(
        403,
        "CROSS_ORIGIN_FORBIDDEN",
        "Forbidden",
        "Cross-origin requests are not supported on this transport."
      );
    }
    if (reqOriginHost !== url.host) {
      return authProblemResponse(
        403,
        "CROSS_ORIGIN_FORBIDDEN",
        "Forbidden",
        "Cross-origin requests are not supported on this transport."
      );
    }
  }
  if (request.method === "OPTIONS") {
    return authProblemResponse(
      405,
      "METHOD_NOT_ALLOWED",
      "Method Not Allowed",
      "CORS preflight is not supported on this transport."
    );
  }
  if (request.headers.get("Authorization") !== null) {
    return authProblemResponse(
      403,
      "TRANSPORT_FORBIDDEN",
      "Forbidden",
      "Authorization header is not supported on this transport."
    );
  }
  if (request.headers.get("X-Efcc-Session-Id") !== null) {
    return authProblemResponse(
      403,
      "TRANSPORT_FORBIDDEN",
      "Forbidden",
      "X-Efcc-Session-Id header is not supported on this transport."
    );
  }
  return null;
}

export default {
  // The explicit route matrix is the locked auth contract; complexity is intentional.
  // oxlint-disable-next-line eslint/complexity
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ---- Auth surface: cookie-only transport, no CORS ------------------
    if (url.pathname.startsWith("/api/v1/auth/")) {
      const guard = authTransportGuard(request);
      if (guard) {
        return guard;
      }
      if (!env.EFCC_ACCESS_TOKEN_SECRET) {
        return authProblemResponse(
          503,
          "AUTH_NOT_CONFIGURED",
          "Service unavailable",
          "Auth signing secret is not configured."
        );
      }
      const authEnv = {
        DB: env.DB,
        EFCC_ACCESS_TOKEN_SECRET: env.EFCC_ACCESS_TOKEN_SECRET,
      } as const;
      const {
        handleRegister,
        handleLogin,
        handleUpgrade,
        handleRefresh,
        handleLogout,
        handleMe,
        handleAdminUnlock,
        handleApprove,
        handleReject,
        handleListRegistrations,
      } = await import("./lib/auth/handlers");
      if (
        url.pathname === "/api/v1/auth/register" &&
        request.method === "POST"
      ) {
        return handleRegister(request, authEnv);
      }
      if (url.pathname === "/api/v1/auth/login" && request.method === "POST") {
        return handleLogin(request, authEnv);
      }
      if (
        url.pathname === "/api/v1/auth/upgrade" &&
        request.method === "POST"
      ) {
        return handleUpgrade(request, authEnv);
      }
      if (
        url.pathname === "/api/v1/auth/refresh" &&
        request.method === "POST"
      ) {
        return handleRefresh(request, authEnv);
      }
      if (url.pathname === "/api/v1/auth/logout" && request.method === "POST") {
        return handleLogout(request, authEnv);
      }
      if (url.pathname === "/api/v1/auth/me" && request.method === "GET") {
        return handleMe(request, authEnv);
      }
      if (
        url.pathname === "/api/v1/auth/registrations" &&
        request.method === "GET"
      ) {
        return handleListRegistrations(request, authEnv);
      }
      if (
        url.pathname === "/api/v1/auth/admin-unlock" &&
        request.method === "POST"
      ) {
        return handleAdminUnlock(request, authEnv);
      }
      const approve = url.pathname.match(
        /^\/api\/v1\/auth\/registrations\/(?<id>[^/]+)\/approve$/u
      );
      if (approve && request.method === "POST") {
        return handleApprove(request, authEnv, approve.groups?.id ?? "");
      }
      const reject = url.pathname.match(
        /^\/api\/v1\/auth\/registrations\/(?<id>[^/]+)\/reject$/u
      );
      if (reject && request.method === "POST") {
        return handleReject(request, authEnv, reject.groups?.id ?? "");
      }
      return authProblemResponse(
        404,
        "NOT_FOUND",
        "Not found",
        "Unknown auth route."
      );
    }

    // ---- Static assets fallthrough -------------------------------------
    if (!url.pathname.startsWith("/api/")) {
      // Should not normally be reached (run_worker_first scopes this
      // Worker to /api/* only), but fall back to assets defensively.
      return env.ASSETS.fetch(request);
    }

    // ---- Domain RPC proxy: preserves legacy CF1 transport -------------
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
    const rateLimitKey = await rateLimitKeyFor(request);
    if (rateLimitKey) {
      if (!env.RPC_RATE_LIMITER) {
        return problemResponse(
          503,
          "UNAVAILABLE",
          "Service unavailable",
          origin,
          "系統暫時無法處理請求，請稍後再試。"
        );
      }
      let limitResult: { success: boolean };
      try {
        limitResult = await env.RPC_RATE_LIMITER.limit({ key: rateLimitKey });
      } catch {
        return problemResponse(
          503,
          "UNAVAILABLE",
          "Service unavailable",
          origin,
          "系統暫時無法處理請求，請稍後再試。"
        );
      }
      const { success } = limitResult;
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
    }

    // Forward auth/session/idempotency headers (ADR-0018 §2, §7).
    // Browser Origin is NOT forwarded - server-side fetch is not subject
    // to CORS, and Apps Script never needs to see a browser Origin.
    const auth = request.headers.get("Authorization");
    const sessionId = request.headers.get("X-Efcc-Session-Id");
    const idempotencyKey = request.headers.get("Idempotency-Key");
    const forwardedHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (auth) {
      forwardedHeaders.Authorization = auth;
    }
    if (sessionId) {
      forwardedHeaders["X-Efcc-Session-Id"] = sessionId;
    }
    if (idempotencyKey) {
      forwardedHeaders["Idempotency-Key"] = idempotencyKey;
    }

    const bodyText = await request.text();

    let upstream: Response;
    try {
      // Bounded timeout per AGENTS.md Production Resilience. 30s gives
      // Apps Script headroom under its 6-min limit while preventing the
      // Worker from hanging on a dead upstream.
      upstream = await fetch(env.APPS_SCRIPT_EXEC_URL, {
        method: "POST",
        headers: forwardedHeaders,
        body: bodyText,
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

    // Apps Script's TextOutput has no API to set an HTTP status code -
    // doPost responses are always transport-level 200 regardless of
    // what the JSON body says. The dispatcher embeds the real intended
    // status in the body's `status` field; this proxy is the layer that
    // must remap it onto the actual outer HTTP response so RFC 9457's
    // "status MUST match the response status" (ADR-0018 §5) is honored
    // for the browser. This is load-bearing correctness, not a nicety.
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
  },
} satisfies ExportedHandler<Env>;
