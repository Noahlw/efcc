/**
 * EFCC D1 identity — cookie-only auth transport (AUTH-02 #160, ADR-0020 §2).
 *
 * The Worker's auth endpoints exchange credentials and session state ONLY
 * through two separate `httpOnly` cookies:
 *
 *   * `efcc_access`  — the short-lived (~15 min) HMAC-signed access token,
 *                      verified statelessly on the common path.
 *   * `efcc_refresh` — the high-entropy opaque D1 refresh-session key
 *                      (a UUID), read only on refresh/revocation.
 *
 * Both cookies are `HttpOnly; Secure; SameSite=Strict; Path=/` so the browser
 * never exposes the token material to JS (no localStorage/sessionStorage, no
 * JS-readable token state) and the cookie is never sent cross-site. There are
 * NO Authorization headers, NO CORS/OPTIONS, and no client-side token storage
 * on this transport.
 *
 * This module is the transport contract only — it builds/reads cookies and
 * rejects non-cookie transport. The HTTP endpoints that use it (login /
 * restore / refresh / logout) live in AUTH-04.
 */

export const ACCESS_COOKIE_NAME = "efcc_access";
export const REFRESH_COOKIE_NAME = "efcc_refresh";

/** Access cookie lifetime matches the ~15-min signed token TTL. */
export const ACCESS_COOKIE_MAX_AGE_SEC = 15 * 60;
/** Refresh cookie lifetime matches the 90-day refresh-session idle expiry. */
export const REFRESH_COOKIE_MAX_AGE_SEC = 90 * 24 * 60 * 60;

/** Token material read from the request cookies (never from any header). */
export interface AuthCookies {
  accessToken: string | null;
  refreshSessionId: string | null;
}

/** Parse a raw `Cookie` header value into a name -> value map. */
export function parseCookies(cookieHeader: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const pair of cookieHeader.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (name) out[name] = value;
  }
  return out;
}

/**
 * Read the auth token material from a request's cookies ONLY. The
 * Authorization header and any body/local-storage token are ignored.
 */
export function readAuthCookies(headers: Headers): AuthCookies {
  const cookies = parseCookies(headers.get("Cookie"));
  return {
    accessToken: cookies[ACCESS_COOKIE_NAME] ?? null,
    refreshSessionId: cookies[REFRESH_COOKIE_NAME] ?? null,
  };
}

/** Build a Set-Cookie header value with the locked attributes. */
function buildCookieHeader(
  name: string,
  value: string,
  maxAgeSec: number
): string {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSec}`;
}

/** Set-Cookie for the short-lived access token. */
export function accessCookieHeader(
  token: string,
  maxAgeSec: number = ACCESS_COOKIE_MAX_AGE_SEC
): string {
  return buildCookieHeader(ACCESS_COOKIE_NAME, token, maxAgeSec);
}

/** Set-Cookie for the opaque refresh-session key. */
export function refreshCookieHeader(
  sessionId: string,
  maxAgeSec: number = REFRESH_COOKIE_MAX_AGE_SEC
): string {
  return buildCookieHeader(REFRESH_COOKIE_NAME, sessionId, maxAgeSec);
}

/** Expire both auth cookies (logout). */
export function clearAuthCookieHeaders(): string[] {
  const clear = (name: string) =>
    `${name}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
  return [clear(ACCESS_COOKIE_NAME), clear(REFRESH_COOKIE_NAME)];
}

/**
 * Build a `Headers` instance carrying BOTH auth cookies as two real
 * `Set-Cookie` headers (access first, refresh second). `Headers.append`
 * keeps duplicate names, so a browser receives and stores both cookies.
 * There is deliberately no `Set-Cookie-2` fallback: that header is an
 * obsolete Netscape-era invention browsers ignore.
 */
export function setAuthCookieHeaders(
  accessValue: string,
  refreshValue: string
): Headers {
  const headers = new Headers();
  headers.append("Set-Cookie", accessValue);
  headers.append("Set-Cookie", refreshValue);
  return headers;
}

/**
 * True when the request carries an Authorization header. This transport
 * rejects it — token material must only ever travel via the httpOnly cookies.
 */
export function hasAuthorizationHeader(headers: Headers): boolean {
  const auth = headers.get("Authorization");
  return auth !== null && auth.trim() !== "";
}

/**
 * True when the request is cross-origin w.r.t. the Worker's own origin.
 * The auth transport is same-origin-only and emits no CORS headers, so any
 * cross-origin request is rejected.
 */
export function isCrossOrigin(headers: Headers, requestUrl: string): boolean {
  const origin = headers.get("Origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return true; // unparseable Origin -> fail closed
  }
  try {
    return originHost !== new URL(requestUrl).host;
  } catch {
    return true; // unparseable request URL -> fail closed
  }
}

/**
 * Transport guard: returns a human/secret-free diagnostic when the request
 * uses a forbidden transport (Authorization header or cross-origin), else
 * null. Callers fail closed by refusing the request when this is non-null.
 */
export function rejectNonCookieTransport(
  headers: Headers,
  requestUrl: string
): string | null {
  if (hasAuthorizationHeader(headers)) {
    return "Authorization header is not supported on this transport.";
  }
  if (isCrossOrigin(headers, requestUrl)) {
    return "Cross-origin requests are not supported on this transport.";
  }
  return null;
}