/**
 * EFCC client for the cookie-only Worker authentication boundary.
 *
 * Auth identity travels only in server-set httpOnly cookies. This module
 * exposes public profile data and RFC 9457 errors without exposing credentials,
 * access tokens, refresh tokens, or legacy session headers to callers.
 */

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
 * Privacy-safe identity summary returned by the Worker bootstrap projection.
 * Scope labels are human-readable; stable IDs and credentials are omitted.
 */
export interface PublicIdentitySummary {
  label: string;
  scopeKind: "Global" | "Department" | "Program";
  scopeLabel: string | null;
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
  /** Legacy display vocabulary; not used for authorization. */
  role: string;
  systemRole?: "Admin" | "Staff" | null;
  identities?: readonly PublicIdentitySummary[];
  capabilities?: Record<string, boolean>;
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
  /** RFC 9457 extension member carrying authoritative conflict data. */
  data?: {
    authoritativeRevision?: number;
    [key: string]: unknown;
  };
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
  /** Reserved for the future Worker/D1 capability authorization contract. */
  requiresServerAuth: boolean;
}

export interface Bootstrap {
  /** Server-authorized content sections used by GuardedSection. */
  sections: Section[];
  /** Server-shaped stable shell destinations; never derived in the browser. */
  navigation: Section[];
  profile: PublicUser;
}

/**
 * GET /api/v1/auth/me response payload — the cookie-verified public user,
 * server-authorized sections, and the stable navigation projection.
 */
export interface AuthMeResult {
  user: PublicUser;
  sections: Section[];
  navigation: Section[];
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
 * Per-call options for the cookie-only surface.
 */
interface AuthFetchOptions {
  /**
   * Mint a fresh Idempotency-Key header for this mutating call (ADR-0018
   * §8) so the server can dedup a retried mutation. Reads omit it.
   */
  mutating?: boolean;
}

/**
 * One fetch to the cookie-only auth surface. No auth headers are built and
 * identity comes from the server-set cookies on the request. Mutating calls
 * carry a fresh Idempotency-Key (ADR-0018 §8). 4xx and 5xx are never
 * retried; a network failure surfaces as a safe NETWORK_ERROR.
 */
async function authFetch<T>(
  path: string,
  method: "POST" | "GET",
  body?: unknown,
  opts: AuthFetchOptions = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(opts.mutating ? { "Idempotency-Key": crypto.randomUUID() } : {}),
      },
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
  return authFetch<LoginResult>(
    "/api/v1/auth/login",
    "POST",
    {
      username,
      password,
    },
    { mutating: true }
  );
}

/** POST /api/v1/auth/upgrade — replaces a verified legacy credential. */
export function authUpgrade(
  username: string,
  legacyPin: string,
  newCredential: string
): Promise<{ user: PublicUser }> {
  return authFetch<{ user: PublicUser }>(
    "/api/v1/auth/upgrade",
    "POST",
    {
      username,
      legacyPin,
      newCredential,
    },
    { mutating: true }
  );
}

/** POST /api/v1/auth/refresh — rotates the refresh cookie, mints a fresh access. */
export function authRefresh(): Promise<void> {
  return authFetch<void>("/api/v1/auth/refresh", "POST", undefined, {
    mutating: true,
  });
}

/**
 * POST /api/v1/auth/logout — revokes the refresh session and clears both
 * cookies, returning 204. Naturally idempotent; the caller treats failure
 * as best-effort (local session is cleared regardless).
 */
export function authLogout(): Promise<void> {
  return authFetch<void>("/api/v1/auth/logout", "POST", undefined, {
    mutating: true,
  });
}

/**
 * GET /api/v1/auth/me — reads the access cookie and returns the public user,
 * server-authorized section projection, and stable navigation projection. The
 * endpoint wraps these fields under `data`; unwrap them here.
 */

export async function authMe(): Promise<AuthMeResult> {
  return authFetch<AuthMeResult>("/api/v1/auth/me", "GET");
}

/**
 * POST /api/v1/auth/username (UI-04 #196 / Spec #191) — session-authenticated
 * self-service username change. Success clears both auth cookies server-side
 * and revokes every refresh session; `sessionRevoked: true` tells the caller
 * to transition to the signed-out surface immediately. An unchanged value is
 * a value-idempotent no-op (`sessionRevoked: false`, session stays live).
 */
export async function authChangeUsername(
  username: string
): Promise<{ username: string; sessionRevoked: boolean }> {
  return authFetch<{ username: string; sessionRevoked: boolean }>(
    "/api/v1/auth/username",
    "POST",
    { username },
    { mutating: true }
  );
}

/**
 * POST /api/v1/auth/password (UI-04 #196 / Spec #191) — session-authenticated
 * self-service password change. Requires the correct current password (a
 * mismatch is a 422 VALIDATION with detail "current password is incorrect",
 * deliberately NOT 401). Success revokes every refresh session, clears both
 * cookies, and returns `sessionRevoked: true`.
 */
export async function authChangePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ sessionRevoked: boolean }> {
  return authFetch<{ sessionRevoked: boolean }>(
    "/api/v1/auth/password",
    "POST",
    { currentPassword, newPassword },
    { mutating: true }
  );
}
