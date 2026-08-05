/**
 * EFCC Cloudflare Worker (ADR-0017 / ADR-0018 / ADR-0020 / ADR-0021).
 *
 * Two routes, two transport contracts:
 *
 *   * `/api/auth/*` — cookie-only auth surface (AUTH-02 #160). No CORS,
 *     no OPTIONS, no Authorization header, no X-Efcc-Session-Id header.
 *     Token material travels only in two httpOnly Secure SameSite=Strict
 *     cookies. The transport guard rejects forbidden headers before any
 *     handler runs.
 *
 *   * `/api/v1/rpc` — same-origin RPC proxy for the legacy domain RPCs
 *     (ADR-0018). The legacy proxy contract is preserved unchanged: it
 *     forwards Authorization / X-Efcc-Session-Id / Idempotency-Key, emits
 *     CORS preflight, and remaps the Apps Script body status onto the
 *     outer HTTP response. No business authorization is owned here.
 *
 * Non-/api paths fall through to the ASSETS binding (static export).
 * AUTH-03 (#161) adds a `scheduled` handler for the D1→Sheets review mirror.
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
   * AUTH-03 (#161): the Apps Script mirror endpoint the scheduled handler
   * POSTs the signed identity-metadata snapshot to. Set via
   * `wrangler secret put EFCC_IDENTITY_MIRROR_URL`. When absent, the mirror
   * run fails closed.
   */
  EFCC_IDENTITY_MIRROR_URL?: string;
  /**
   * AUTH-03 (#161): shared secret for the signed Worker → Apps Script mirror
   * boundary. Set via `wrangler secret put EFCC_SERVICE_SECRET`; never logged.
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
    if (
      typeof peek === "object" &&
      peek !== null &&
      "action" in peek &&
      "params" in peek
    ) {
      const action = peek.action; // unknown - narrowed below
      const params = peek.params; // unknown
      if (
        action === "loginUser" &&
        typeof params === "object" &&
        params !== null &&
        "username" in params
      ) {
        const username = params.username; // unknown
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
  const body = JSON.stringify({
    type: `https://efcc.dev/problems/${code.toLowerCase()}`,
    status,
    code,
    title,
    ...(detail !== undefined ? { detail } : {}),
    requestId: crypto.randomUUID(),
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/problem+json",
    "Access-Control-Allow-Origin": origin,
    "X-Request-Id": crypto.randomUUID(),
  };
  if (extra?.retryAfter) {
    headers["Retry-After"] = extra.retryAfter;
  }
  return new Response(body, { status, headers });
}

/**
 * Cookie-only transport guard for the `/api/auth/*` surface (AUTH-02 #160).
 * Rejects:
 *   * OPTIONS / non-POST/GET methods (no CORS preflight support).
 *   * Authorization header (every flavor is forbidden on this surface).
 *   * X-Efcc-Session-Id header (the legacy session id travels only via the
 *     opaque refresh cookie).
 *   * Cross-origin requests (no CORS = no cross-origin).
 * Returns null on a clean cookie-only same-origin request, or a 403/405
 * Response otherwise.
 */
async function authTransportGuard(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const reqOrigin = request.headers.get("Origin");
  // Same-origin when no Origin is sent (same-host navigation) or when the
  // Origin matches the Worker's own host.
  if (reqOrigin) {
    let reqOriginHost: string;
    try {
      reqOriginHost = new URL(reqOrigin).host;
    } catch {
      return jsonResponse(403, {
        code: "CROSS_ORIGIN_FORBIDDEN",
        title: "CROSS_ORIGIN_FORBIDDEN",
        detail: "Cross-origin requests are not supported on this transport.",
      });
    }
    if (reqOriginHost !== url.host) {
      return jsonResponse(403, {
        code: "CROSS_ORIGIN_FORBIDDEN",
        title: "CROSS_ORIGIN_FORBIDDEN",
        detail: "Cross-origin requests are not supported on this transport.",
      });
    }
  }
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 405,
      headers: { "Content-Type": "text/plain" },
    });
  }
  if (request.headers.get("Authorization") !== null) {
    return jsonResponse(403, {
      code: "TRANSPORT_FORBIDDEN",
      title: "TRANSPORT_FORBIDDEN",
      detail: "Authorization header is not supported on this transport.",
    });
  }
  if (request.headers.get("X-Efcc-Session-Id") !== null) {
    return jsonResponse(403, {
      code: "TRANSPORT_FORBIDDEN",
      title: "TRANSPORT_FORBIDDEN",
      detail: "X-Efcc-Session-Id header is not supported on this transport.",
    });
  }
  return null;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ---- Auth surface: cookie-only transport, no CORS ------------------
    if (url.pathname.startsWith("/api/auth/")) {
      const guard = await authTransportGuard(request);
      if (guard) return guard;
      if (!env.EFCC_ACCESS_TOKEN_SECRET) {
        return jsonResponse(503, {
          code: "AUTH_NOT_CONFIGURED",
          title: "AUTH_NOT_CONFIGURED",
          detail: "Auth signing secret is not configured.",
        });
      }
      const authEnv = {
        DB: env.DB,
        EFCC_ACCESS_TOKEN_SECRET: env.EFCC_ACCESS_TOKEN_SECRET,
      } as const;
      const {
        handleLogin,
        handleUpgrade,
        handleRefresh,
        handleLogout,
        handleMe,
        handleAdminUnlock,
      } = await import("./lib/auth/handlers");
      if (url.pathname === "/api/auth/login" && request.method === "POST") {
        return handleLogin(request, authEnv);
      }
      if (url.pathname === "/api/auth/upgrade" && request.method === "POST") {
        return handleUpgrade(request, authEnv);
      }
      if (url.pathname === "/api/auth/refresh" && request.method === "POST") {
        return handleRefresh(request, authEnv);
      }
      if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        return handleLogout(request, authEnv);
      }
      if (url.pathname === "/api/auth/me" && request.method === "GET") {
        return handleMe(request, authEnv);
      }
      if (
        url.pathname === "/api/auth/admin-unlock" &&
        request.method === "POST"
      ) {
        return handleAdminUnlock(request, authEnv);
      }
      return jsonResponse(404, {
        code: "NOT_FOUND",
        title: "NOT_FOUND",
        detail: "Unknown auth route.",
      });
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
  /**
   * AUTH-03 (#161): operator-controlled D1 → Sheets identity-metadata review
   * mirror. Fired by the `0 19 * * *` Cron Trigger (19:00 UTC = 03:00
   * Asia/Hong_Kong next day). Reads non-secret identity metadata from D1,
   * signs it, and POSTs it to the mirror Apps Script endpoint. D1 stays
   * authoritative; the Sheet is human read-only review data. Fails closed on
   * any missing config, D1/API failure, or upstream rejection — throwing lets
   * Cloudflare retry the scheduled invocation.
   */
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const { readIdentityMirrorAccounts, runIdentityMirror } = await import(
      "./lib/mirror/identity-mirror"
    );

    if (!env.EFCC_IDENTITY_MIRROR_URL || !env.EFCC_SERVICE_SECRET) {
      throw new Error(
        "Identity mirror failed closed: EFCC_IDENTITY_MIRROR_URL / EFCC_SERVICE_SECRET are not configured."
      );
    }

    const accounts = await readIdentityMirrorAccounts(env.DB);
    await runIdentityMirror({
      secret: env.EFCC_SERVICE_SECRET,
      accounts,
      mirrorUrl: env.EFCC_IDENTITY_MIRROR_URL,
    });
  },
} satisfies ExportedHandler<Env>;
