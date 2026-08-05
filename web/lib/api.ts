/**
 * EFCC HTTP client for the ADR-0018 same-origin RPC boundary.
 *
 * Sole owner of `fetch` to `POST /api/v1/rpc`. Implements:
 *   - Session identity in `Authorization: Bearer <token>` + `X-Efcc-Session-Id`
 *     headers, never in the URL or body (AGENTS.md §2).
 *   - `Idempotency-Key` on every mutating action (ADR-0018 §7).
 *   - RFC 9457 Problem Details parsing on non-2xx, branching on the `code`
 *     extension member (ADR-0018 §5).
 *   - Retries on network error / 502 / 503 / 504 only, for reads and
 *     already-idempotent actions, max 2 retries with bounded backoff/jitter
 *     honoring `Retry-After` (ADR-0018 §6). 4xx and 500 are never retried.
 *   - `X-Request-Id` surfaced for cross-dashboard correlation (ADR-0018 §8).
 *
 * The success envelope `{success: true, requestId, data}` is unchanged from
 * `src/gas/rpc-envelope.gs`; Problem Details only replaces the error path.
 */

// ---------------------------------------------------------------------------
// Public types - mirror the server contract in src/gas/rpc-envelope.gs and
// Code.gs's AuthenticatedBootstrap. The client never redefines these server-side.
// ---------------------------------------------------------------------------

export interface Session {
  sessionId: string;
  sessionToken: string;
  userId: string;
}

/**
 * AUTH-04 login response data (POST /api/v1/auth/login). Identity is
 * carried server-side in the httpOnly access+refresh cookies; this payload
 * carries only the public profile fields and the forced-upgrade gate.
 * `mustSetNewCredential: true` means a legacy account proved its one-time
 * legacy credential but NO session is issued — the forced-upgrade flow must
 * run before login can succeed (ADR-0020 §4 / AUTH-01 #159).
 */
export interface LoginResult {
  userId: string;
  name: string;
  role: string;
  status: string;
  mustSetNewCredential: boolean;
}

/**
 * Public user profile returned by GET /api/v1/auth/me from the access
 * cookie. No credential, token, or session identifier ever appears here.
 */
export interface PublicUser {
  userId: string;
  name: string;
  username: string;
  phone: string;
  role: string;
  status: string;
  qrCodeString: string;
}

export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  /** RFC 9457 extension member - the existing RPC_CODES token. */
  code?: string;
  /** RFC 9457 extension member - direct access without URI parsing. */
  requestId?: string;
}

/**
 * Error thrown for any non-2xx RPC response or malformed payload. Carries
 * the parsed Problem Details and the `Retry-After` value (in seconds)
 * when the server provided one. Never exposes raw response bodies - the
 * `message` is the problem's `detail`/`title`, not the raw HTTP body.
 */
export class RpcError extends Error {
  problem: ProblemDetails;
  /** `Retry-After` header value in seconds, when present (ADR-0018 §6). */
  retryAfter?: number;

  constructor(problem: ProblemDetails, retryAfter?: number) {
    super(problem.detail || problem.title || "Request failed");
    this.name = "RpcError";
    this.problem = problem;
    if (retryAfter !== undefined) {
      this.retryAfter = retryAfter;
    }
  }
}

export interface Section {
  key: string;
  label: string;
  capability: string;
  /** Server-authoritative flag: call api_authorizedNavigate before rendering. */
  requiresServerAuth: boolean;
}

export interface Bootstrap {
  sections: Section[];
  profile: PublicUser;
}

// ---------------------------------------------------------------------------
// Error construction - never exposes raw response bodies to callers.
// ---------------------------------------------------------------------------

// RpcError (declared above) is constructed directly at each throw site;
// no factory wrapper needed.

// ---------------------------------------------------------------------------
// Retry policy + idempotency classification (ADR-0018 §6, §7).
// ---------------------------------------------------------------------------

/**
 * Actions that change server state and thus get an `Idempotency-Key`.
 * Every action here is also retry-safe (idempotent server-side) unless
 * listed in NON_IDEMPOTENT_MUTATIONS below.
 *
 * - authorizedNavigate: a read, not listed here.
 * - submitDemoTaskForm: not yet wired; already has its own CacheService
 *   guard. Add it here when CF2+ wires it.
 *
 * The AUTH-04 cookie surface (/api/v1/auth/*) is deliberately NOT routed
 * through this envelope: login is explicitly not idempotent (AUTH-04
 * #162) and carries no client session, so it uses authFetch instead.
 */
const MUTATING_ACTIONS = new Set<string>();

/**
 * Mutations that are NOT safe to auto-retry (would duplicate a
 * non-idempotent side effect). Today empty - every mutating action in
 * the set above is idempotent-by-design per ADR-0018 §6. When CF2+ adds
 * a genuinely non-idempotent mutation, add it here so it gets an
 * Idempotency-Key but does NOT auto-retry.
 */
const NON_IDEMPOTENT_MUTATIONS = new Set<string>();

/** Max retries on network/502/503/504 (ADR-0018 §6). */
const MAX_RETRIES = 2;
/** Base backoff in ms; doubled per attempt with up to ±25% jitter. */
const BASE_BACKOFF_MS = 200;

/** Mutating actions get an Idempotency-Key (ADR-0018 §7). */
function isMutating(action: string): boolean {
  return MUTATING_ACTIONS.has(action);
}

/** Reads + already-idempotent actions retry; genuinely mutating ones don't. */
function isRetrySafe(action: string): boolean {
  return !NON_IDEMPOTENT_MUTATIONS.has(action);
}

/** 502/503/504 are gateway/availability blips; 500 is a server bug, never retried. */
function isRetryableStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

/** Parse Retry-After (seconds) per RFC 7231; returns ms, or undefined. */
function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) {
    return undefined;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return seconds * 1000;
  }
  // HTTP-date form - rare for this stack, fall back to base backoff.
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return undefined;
}

function backoffMs(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs !== undefined) {
    return retryAfterMs;
  }
  const exp = BASE_BACKOFF_MS * 2 ** attempt;
  const jitter = exp * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, exp + jitter);
}

// ---------------------------------------------------------------------------
// Idempotency-Key (ADR-0018 §7).
// ---------------------------------------------------------------------------

/**
 * Mutating actions get an Idempotency-Key. Reads don't need one (they have
 * no side effect to dedupe). Today every action is either a read or
 * already idempotent server-side, so the key is informational for the
 * current set; CF2+ mutating actions will rely on it for real dedup.
 */
// crypto.randomUUID is available in all modern browsers and in workerd.

// ---------------------------------------------------------------------------
// Core fetch + retry loop.
// ---------------------------------------------------------------------------

interface RpcSuccess<T> {
  success: true;
  requestId: string;
  data: T;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  if (signal?.aborted) {
    reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    return promise;
  }
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    },
    { once: true }
  );
  return promise;
}

/**
 * True when the caller cancelled via options.signal, or the underlying
 * fetch failure was an AbortError (timeout or external signal). Both
 * cases must bypass retries - returning undefined-network-error
 * would lie about why the request stopped.
 */
function isAbort(error: unknown, externalSignal?: AbortSignal): boolean {
  if (externalSignal?.aborted) {
    return true;
  }
  if (error !== null && typeof error === "object" && "name" in error) {
    return error.name === "AbortError";
  }
  return false;
}

async function parseSuccess<T>(res: Response): Promise<T> {
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    throw new RpcError({
      status: res.status,
      code: "MALFORMED_RESPONSE",
      title: "Malformed success response",
      detail: "伺服器回應格式錯誤。",
    });
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { success?: unknown }).success !== true
  ) {
    throw new RpcError({
      status: res.status,
      code: "MALFORMED_RESPONSE",
      title: "Malformed success envelope",
      detail: "伺服器回應格式錯誤。",
    });
  }
  // ADR-0018 §3: the success envelope MUST carry both `requestId` and
  // `data`. Without them the client cannot correlate across dashboards
  // nor trust the payload - reject as a malformed response so callers
  // see a recoverable error instead of a silent undefined.data.
  const env = parsed as Partial<RpcSuccess<T>>;
  if (typeof env.requestId !== "string" || env.data === undefined) {
    throw new RpcError({
      status: res.status,
      code: "MALFORMED_RESPONSE",
      title: "Malformed success envelope",
      detail: "伺服器回應格式錯誤。",
    });
  }
  return env.data as T;
}

async function parseProblemDetails(
  res: Response,
  requestIdHeader?: string
): Promise<ProblemDetails> {
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    // Non-JSON upstream response - safe recoverable error, no body leak.
    return {
      status: res.status,
      code: res.status >= 500 ? "UNAVAILABLE" : "MALFORMED_RESPONSE",
      title: res.status >= 500 ? "Upstream error" : "Malformed error response",
      detail:
        res.status >= 500
          ? "系統暫時無法處理請求，請稍後再試。"
          : "伺服器回應格式錯誤。",
      requestId: requestIdHeader,
    };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return {
      status: res.status,
      code: "MALFORMED_RESPONSE",
      title: "Malformed error response",
      detail: "伺服器回應格式錯誤。",
      requestId: requestIdHeader,
    };
  }
  const p = parsed as ProblemDetails;
  // Normalize: status from outer HTTP if the body didn't carry it, so the
  // client's branch on `problem.status` always agrees with the wire.
  if (typeof p.status !== "number") {
    p.status = res.status;
  }
  if (requestIdHeader && !p.requestId) {
    p.requestId = requestIdHeader;
  }
  return p;
}

/**
 * Execute one RPC with the ADR-0018 wire contract. Public actions below
 * delegate here; tests drive it directly via a stubbed `fetch` to assert
 * the exact request shape (headers, body, retries) leaving the browser.
 */
// eslint-disable-next-line complexity -- retry+envelope+signal orchestration is intentionally linear here; splitting would scatter a contract whose atomicity is the point
export async function callRpc<T>(
  action: string,
  params: Record<string, unknown>,
  session?: Session,
  options?: { idempotencyKey?: string; signal?: AbortSignal }
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (session) {
    headers.Authorization = `Bearer ${session.sessionToken}`;
    headers["X-Efcc-Session-Id"] = session.sessionId;
  }
  if (isMutating(action)) {
    headers["Idempotency-Key"] = options?.idempotencyKey ?? crypto.randomUUID();
  }

  const body = JSON.stringify({ action, params });
  const canRetry = isRetrySafe(action);

  let lastError: RpcError | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    let res: Response;
    try {
      // eslint-disable-next-line no-await-in-loop -- sequential retry; each attempt depends on the prior response
      const signals: AbortSignal[] = [AbortSignal.timeout(30_000)];
      if (options?.signal) {
        signals.push(options.signal);
      }
      // eslint-disable-next-line no-await-in-loop -- sequential retry; each attempt depends on the prior response
      res = await fetch("/api/v1/rpc", {
        method: "POST",
        headers,
        body,
        // Bounded timeout per AGENTS.md Production Resilience. 30s matches
        // Apps Script's 6-min limit with comfortable headroom for the
        // proxy hop; the client should never hang longer than this.
        // Combined with optional external signal for cancellation.
        signal: AbortSignal.any(signals),
      });
    } catch (error) {
      // Honor caller cancellation immediately: never retry an aborted
      // request, regardless of action idempotency. AbortError may arrive
      // either from the explicit options.signal or from the bundled
      // 30s timeout signal, so check both.
      if (isAbort(error, options?.signal)) {
        throw error;
      }
      // Network failure / timeout (non-abort) - retryable if the action is safe.
      lastError = new RpcError({
        status: 0,
        code: "NETWORK_ERROR",
        title: "Network error",
        detail: "無法連接伺服器，請檢查網路後再試。",
      });
      if (canRetry && attempt < MAX_RETRIES) {
        // eslint-disable-next-line no-await-in-loop -- sequential backoff is intentional; retries must not race
        await sleep(backoffMs(attempt), options?.signal);
        continue;
      }
      throw lastError;
    }

    // Success path.
    if (res.ok) {
      return parseSuccess<T>(res);
    }

    // Error path - parse Problem Details, never leak raw body.
    const retryAfterMs = parseRetryAfterMs(res.headers.get("Retry-After"));
    const requestId = res.headers.get("X-Request-Id") ?? undefined;
    // eslint-disable-next-line no-await-in-loop -- sequential retry; the next attempt depends on this parse
    const problem = await parseProblemDetails(res, requestId);
    lastError = new RpcError(
      problem,
      retryAfterMs === undefined ? undefined : Math.ceil(retryAfterMs / 1000)
    );

    // 4xx and 500 are never retried (ADR-0018 §6). Only 502/503/504.
    const retriable = isRetryableStatus(res.status);
    if (canRetry && retriable && attempt < MAX_RETRIES) {
      // eslint-disable-next-line no-await-in-loop -- sequential backoff is intentional
      await sleep(backoffMs(attempt, retryAfterMs), options?.signal);
      continue;
    }
    throw lastError;
  }
  // Should be unreachable - the loop either returns or throws on every path.
  throw (
    lastError ?? new RpcError({ code: "INTERNAL_ERROR", title: "Unreachable" })
  );
}

// ---------------------------------------------------------------------------
// Public RPC actions - the domain RPC layer the shell needs (Spec 074,
// ticket #142). Each is a thin typed wrapper over callRpc; no business
// logic lives here. The legacy /api/v1/rpc transport is preserved for
// Apps Script domain RPCs (e.g. server-authorized section navigation);
// the AUTH-04 cookie surface lives in the AUTH section below.
// ---------------------------------------------------------------------------

/**
 * Spread session identity into body params for the interim #129 dispatcher,
 * which cannot read request headers (Apps Script doPost limitation - verified
 * against developers.google.com/apps-script/guides/web). #131's production
 * dispatcher will derive userId from the header-borne sessionId via
 * sessionLookup_, dropping the redundant body params. The headers are
 * already sent by callRpc for ADR-0018 contract compliance either way.
 */
function sessionParams(session: Session): Record<string, unknown> {
  return {
    userId: session.userId,
    sessionId: session.sessionId,
    // sessionToken intentionally omitted: it travels in the
    // Authorization Bearer header (ADR-0018 §2), never in the body.
    // Body params exist only for the #129 dispatcher workaround until
    // #131 routes identity from the header-borne sessionId.
  };
}

export function authorizedNavigate(
  session: Session,
  sectionKey: string
): Promise<{ authorized: boolean }> {
  return callRpc<{ authorized: boolean }>(
    "authorizedNavigate",
    { ...sessionParams(session), sectionKey },
    session
  );
}

// ---------------------------------------------------------------------------
// AUTH-04 cookie surface (ADR-0020 / AUTH-04 #162).
//
// The locked /api/v1/auth/* transport is cookie-only: identity travels in
// two httpOnly Secure SameSite=Strict cookies (access + rotating refresh)
// set by the server. The client NEVER stores a token, session identifier,
// or credential, and NEVER constructs an Authorization / X-Efcc-Session-Id
// header. Requests are same-origin; no CORS, no OPTIONS. `login` is
// explicitly NOT idempotent (AUTH-04 #162), so this surface never retries
// on a 4xx and never auto-retries a login — double-submit protection is the
// caller's job (busy state).
// ---------------------------------------------------------------------------

/** Envelope shape on the auth surface: `{ requestId, data }` (no success flag). */
interface AuthSuccess<T> {
  requestId: string;
  data: T;
}

/**
 * One fetch to the cookie-only auth surface. No auth headers are built and
 * no Idempotency-Key is attached: identity comes from the server-set
 * cookies on the request, and login must not be blindly retried. 4xx and
 * 5xx are never retried; a network failure surfaces as a safe NETWORK_ERROR.
 */
async function authFetch<T>(
  path: string,
  method: "POST" | "GET",
  body?: unknown
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      // Bounded timeout per AGENTS.md Production Resilience.
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

  if (res.ok) {
    // logout returns a bare 204 with no body.
    if (res.status === 204) {
      return undefined as T;
    }
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      throw new RpcError({
        status: res.status,
        code: "MALFORMED_RESPONSE",
        title: "Malformed success response",
        detail: "伺服器回應格式錯誤。",
      });
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { data?: unknown }).data === undefined
    ) {
      throw new RpcError({
        status: res.status,
        code: "MALFORMED_RESPONSE",
        title: "Malformed success envelope",
        detail: "伺服器回應格式錯誤。",
      });
    }
    return (parsed as AuthSuccess<T>).data as T;
  }

  const requestId = res.headers.get("X-Request-Id") ?? undefined;
  const problem = await parseProblemDetails(res, requestId);
  throw new RpcError(problem);
}

/** POST /api/v1/auth/login — sets the httpOnly access+refresh cookies. */
export function authLogin(
  username: string,
  password: string
): Promise<LoginResult> {
  return authFetch<LoginResult>("/api/v1/auth/login", "POST", {
    username,
    password,
  });
}

/** POST /api/v1/auth/upgrade — replaces a verified legacy credential. */
export function authUpgrade(
  username: string,
  legacyPin: string,
  newCredential: string
): Promise<{ user: PublicUser }> {
  return authFetch<{ user: PublicUser }>("/api/v1/auth/upgrade", "POST", {
    username,
    legacyPin,
    newCredential,
  });
}

/** POST /api/v1/auth/refresh — rotates the refresh cookie, mints a fresh access. */
export function authRefresh(): Promise<void> {
  return authFetch<void>("/api/v1/auth/refresh", "POST");
}

/**
 * POST /api/v1/auth/logout — revokes the refresh session and clears both
 * cookies, returning 204. Naturally idempotent; the caller treats failure
 * as best-effort (local session is cleared regardless).
 */
export function authLogout(): Promise<void> {
  return authFetch<void>("/api/v1/auth/logout", "POST");
}

/**
 * GET /api/v1/auth/me — reads the access cookie, returns the public user.
 * The endpoint wraps the user under `data.user`; unwrap it here.
 */

export async function authMe(): Promise<PublicUser> {
  const data = await authFetch<{ user: PublicUser }>("/api/v1/auth/me", "GET");
  return data.user;
}
