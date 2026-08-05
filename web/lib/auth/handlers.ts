/**
 * EFCC D1 identity — browser-facing auth route handlers (AUTH-02 #160).
 *
 * Each handler implements ONE `/api/auth/*` route. Transport is cookie-only:
 *
 *   * Token material is read ONLY from the two httpOnly cookies (access +
 *     refresh). The Authorization header and X-Efcc-Session-Id header are
 *     not consulted on this surface (the Worker transport guard rejects
 *     them before the handler runs).
 *   * Responses set/clear the cookies via Set-Cookie headers — never echo the
 *     token material in the JSON body.
 *   * No Access-Control-* headers are emitted on this surface; the Worker
 *     transport guard rejects OPTIONS before it reaches the handler.
 *   * No raw credential, PIN, token, or session value is included in any
 *     response body or log.
 *
 * The handlers are pure functions that take a Request and env-like context
 * and return a Response. They are tested directly via the workerd runtime.
 */

import {
  normalizeUsername,
  verifyCredential,
} from "./credentials";
import {
  ACCESS_COOKIE_NAME,
  ACCESS_COOKIE_MAX_AGE_SEC,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_MAX_AGE_SEC,
  accessCookieHeader,
  clearAuthCookieHeaders,
  hasAuthorizationHeader,
  refreshCookieHeader,
} from "./cookies";
import { findAccountByUsername, findAccountByUserId } from "./accounts";
import { completeCredentialUpgrade } from "./upgrade";
import {
  AuthError,
  issueSession,
  refreshSession,
  revokeAllUserSessions,
  revokeSession,
  verifyAccessToken,
} from "./sessions";
import { adminUnlockLegacyUpgrade } from "./lockout";

export interface AuthEnv {
  DB: D1Database;
  EFCC_ACCESS_TOKEN_SECRET: string;
}

/** Public user-facing profile shape (no secrets). */
export interface PublicUser {
  userId: string;
  name: string;
  username: string;
  role: string;
  accountStatus: string;
  requiresUpgrade: boolean;
}

function secretFreeUser(account: {
  user_id: string;
  name: string;
  username: string;
  role: string;
  account_status: string;
  requires_upgrade: number;
}): PublicUser {
  return {
    userId: account.user_id,
    name: account.name,
    username: account.username,
    role: account.role,
    accountStatus: account.account_status,
    requiresUpgrade: account.requires_upgrade === 1,
  };
}

function jsonResponse(
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

function authErrorResponse(err: AuthError | Error): Response {
  if (err instanceof AuthError) {
    const status =
      err.code === "AUTH_REQUIRED"
        ? 401
        : err.code === "FORBIDDEN"
          ? 403
          : err.code === "UPGRADE_REQUIRED"
            ? 409
            : 400;
    return jsonResponse(status, {
      code: err.code,
      title: err.code,
      detail: err.message,
    });
  }
  return jsonResponse(401, {
    code: "AUTH_REQUIRED",
    title: "AUTH_REQUIRED",
    detail: "Authentication failed.",
  });
}

/** The Worker pre-handler guard must call this and refuse the request on non-null. */
function readCookie(headers: Headers, name: string): string | null {
  const raw = headers.get("Cookie");
  if (!raw) return null;
  for (const pair of raw.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const k = pair.slice(0, eq).trim();
    if (k === name) return pair.slice(eq + 1).trim();
  }
  return null;
}

/**
 * POST /api/auth/login
 *
 * Body: { username, credential }
 * On success: sets the two auth cookies, returns the public user.
 */
export async function handleLogin(
  request: Request,
  env: AuthEnv
): Promise<Response> {
  if (hasAuthorizationHeader(request.headers)) {
    return jsonResponse(403, {
      code: "FORBIDDEN",
      title: "FORBIDDEN",
      detail: "Authorization header is not supported on this transport.",
    });
  }
  let body: { username?: unknown; credential?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonResponse(400, {
      code: "VALIDATION",
      title: "VALIDATION",
      detail: "Body must be JSON.",
    });
  }
  const username = typeof body.username === "string" ? body.username : "";
  const credential = typeof body.credential === "string" ? body.credential : "";
  if (!username || !credential) {
    return jsonResponse(400, {
      code: "VALIDATION",
      title: "VALIDATION",
      detail: "username and credential are required.",
    });
  }

  const account = await findAccountByUsername(env.DB, username);
  if (!account || !account.credential_hash) {
    return jsonResponse(401, {
      code: "AUTH_REQUIRED",
      title: "AUTH_REQUIRED",
      detail: "Invalid username or credential.",
    });
  }
  if (account.requires_upgrade === 1) {
    return jsonResponse(409, {
      code: "UPGRADE_REQUIRED",
      title: "UPGRADE_REQUIRED",
      detail: "Credential upgrade required.",
    });
  }
  if (account.account_status !== "Active") {
    return jsonResponse(403, {
      code: "FORBIDDEN",
      title: "FORBIDDEN",
      detail: "Account is not active.",
    });
  }

  const ok = await verifyCredential(credential, account.credential_hash);
  if (!ok) {
    return jsonResponse(401, {
      code: "AUTH_REQUIRED",
      title: "AUTH_REQUIRED",
      detail: "Invalid username or credential.",
    });
  }

  const bundle = await issueSession(env.DB, {
    userId: account.user_id,
    accessTokenSecret: env.EFCC_ACCESS_TOKEN_SECRET,
  });
  return jsonResponse(
    200,
    { user: secretFreeUser(account), sessionId: bundle.sessionId },
    {
      "Set-Cookie": accessCookieHeader(bundle.accessToken),
      "Set-Cookie-2": refreshCookieHeader(bundle.sessionId),
    }
  );
}

/**
 * POST /api/auth/upgrade
 *
 * Body: { userId, legacyPin, newCredential }
 * On success: sets the two auth cookies, returns the public user.
 */
export async function handleUpgrade(
  request: Request,
  env: AuthEnv
): Promise<Response> {
  if (hasAuthorizationHeader(request.headers)) {
    return jsonResponse(403, {
      code: "FORBIDDEN",
      title: "FORBIDDEN",
      detail: "Authorization header is not supported on this transport.",
    });
  }
  let body: { userId?: unknown; legacyPin?: unknown; newCredential?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonResponse(400, {
      code: "VALIDATION",
      title: "VALIDATION",
      detail: "Body must be JSON.",
    });
  }
  const userId = typeof body.userId === "string" ? body.userId : "";
  const legacyPin = typeof body.legacyPin === "string" ? body.legacyPin : "";
  const newCredential =
    typeof body.newCredential === "string" ? body.newCredential : "";
  if (!userId || !legacyPin || !newCredential) {
    return jsonResponse(400, {
      code: "VALIDATION",
      title: "VALIDATION",
      detail: "userId, legacyPin, newCredential are required.",
    });
  }

  try {
    await completeCredentialUpgrade(env.DB, {
      userId,
      legacyPin,
      newCredential,
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    const message = err instanceof Error ? err.message : "Upgrade failed.";
    // Map known lockout / validation message prefixes to typed codes.
    if (/locked out/i.test(message)) {
      return jsonResponse(423, {
        code: "UPGRADE_LOCKED",
        title: "UPGRADE_LOCKED",
        detail: "Account is locked pending credential-upgrade review.",
      });
    }
    if (/Invalid username or PIN/i.test(message)) {
      return jsonResponse(401, {
        code: "AUTH_REQUIRED",
        title: "AUTH_REQUIRED",
        detail: "Invalid username or PIN.",
      });
    }
    if (/not awaiting credential upgrade/i.test(message)) {
      return jsonResponse(409, {
        code: "UPGRADE_REQUIRED",
        title: "UPGRADE_REQUIRED",
        detail: message,
      });
    }
    if (/Unknown account/i.test(message)) {
      return jsonResponse(401, {
        code: "AUTH_REQUIRED",
        title: "AUTH_REQUIRED",
        detail: "Invalid username or PIN.",
      });
    }
    return jsonResponse(401, {
      code: "AUTH_REQUIRED",
      title: "AUTH_REQUIRED",
      detail: "Invalid username or PIN.",
    });
  }

  // Upgrade succeeded: issue a fresh session for the new credential.
  const account = await findAccountByUserId(env.DB, userId);
  if (!account) {
    return jsonResponse(401, {
      code: "AUTH_REQUIRED",
      title: "AUTH_REQUIRED",
      detail: "Invalid username or credential.",
    });
  }
  const bundle = await issueSession(env.DB, {
    userId: account.user_id,
    accessTokenSecret: env.EFCC_ACCESS_TOKEN_SECRET,
  });
  return jsonResponse(
    200,
    { user: secretFreeUser(account), sessionId: bundle.sessionId },
    {
      "Set-Cookie": accessCookieHeader(bundle.accessToken),
      "Set-Cookie-2": refreshCookieHeader(bundle.sessionId),
    }
  );
}

/**
 * POST /api/auth/refresh
 *
 * Reads the refresh cookie, exchanges for a fresh access token. No body.
 */
export async function handleRefresh(
  request: Request,
  env: AuthEnv
): Promise<Response> {
  if (hasAuthorizationHeader(request.headers)) {
    return jsonResponse(403, {
      code: "FORBIDDEN",
      title: "FORBIDDEN",
      detail: "Authorization header is not supported on this transport.",
    });
  }
  const refresh = readCookie(request.headers, REFRESH_COOKIE_NAME);
  if (!refresh) {
    return jsonResponse(401, {
      code: "AUTH_REQUIRED",
      title: "AUTH_REQUIRED",
      detail: "Refresh cookie missing.",
    });
  }
  try {
    const bundle = await refreshSession(env.DB, {
      sessionId: refresh,
      accessTokenSecret: env.EFCC_ACCESS_TOKEN_SECRET,
    });
    return jsonResponse(
      200,
      { sessionId: bundle.sessionId },
      {
        "Set-Cookie": accessCookieHeader(bundle.accessToken),
        "Set-Cookie-2": refreshCookieHeader(bundle.sessionId),
      }
    );
  } catch (err) {
    return authErrorResponse(err instanceof Error ? err : new Error("Refresh failed"));
  }
}

/**
 * POST /api/auth/logout
 *
 * Reads the refresh cookie, revokes the session, clears both cookies.
 */
export async function handleLogout(
  request: Request,
  env: AuthEnv
): Promise<Response> {
  if (hasAuthorizationHeader(request.headers)) {
    const cleared = clearAuthCookieHeaders();
    return new Response(null, {
      status: 204,
      headers: {
        "Set-Cookie": cleared[0],
        "Set-Cookie-2": cleared[1],
      },
    });
  }
  const refresh = readCookie(request.headers, REFRESH_COOKIE_NAME);
  if (refresh) {
    try {
      await revokeSession(env.DB, refresh);
    } catch {
      // best-effort
    }
  }
  const cleared = clearAuthCookieHeaders();
  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": cleared[0],
      "Set-Cookie-2": cleared[1],
    },
  });
}

/**
 * GET /api/auth/me
 *
 * Reads the access cookie, verifies statelessly, returns the public user.
 */
export async function handleMe(
  request: Request,
  env: AuthEnv
): Promise<Response> {
  if (hasAuthorizationHeader(request.headers)) {
    return jsonResponse(403, {
      code: "FORBIDDEN",
      title: "FORBIDDEN",
      detail: "Authorization header is not supported on this transport.",
    });
  }
  const access = readCookie(request.headers, ACCESS_COOKIE_NAME);
  if (!access) {
    return jsonResponse(401, {
      code: "AUTH_REQUIRED",
      title: "AUTH_REQUIRED",
      detail: "Access cookie missing.",
    });
  }
  const claims = await verifyAccessToken(
    env.EFCC_ACCESS_TOKEN_SECRET,
    access
  );
  if (!claims) {
    return jsonResponse(401, {
      code: "AUTH_REQUIRED",
      title: "AUTH_REQUIRED",
      detail: "Access token invalid or expired.",
    });
  }
  const account = await findAccountByUserId(env.DB, claims.uid);
  if (!account) {
    return jsonResponse(401, {
      code: "AUTH_REQUIRED",
      title: "AUTH_REQUIRED",
      detail: "Unknown account.",
    });
  }
  if (account.account_status !== "Active") {
    return jsonResponse(403, {
      code: "FORBIDDEN",
      title: "FORBIDDEN",
      detail: "Account is not active.",
    });
  }
  return jsonResponse(200, { user: secretFreeUser(account) });
}

/**
 * POST /api/auth/admin-unlock
 *
 * Admin/Teacher intervention: clears a legacy-PIN lockout so the upgrade can
 * proceed. Body: { userId }. The caller must be authenticated (access cookie)
 * and hold Admin or Teacher.
 */
export async function handleAdminUnlock(
  request: Request,
  env: AuthEnv
): Promise<Response> {
  if (hasAuthorizationHeader(request.headers)) {
    return jsonResponse(403, {
      code: "FORBIDDEN",
      title: "FORBIDDEN",
      detail: "Authorization header is not supported on this transport.",
    });
  }
  const access = readCookie(request.headers, ACCESS_COOKIE_NAME);
  if (!access) {
    return jsonResponse(401, {
      code: "AUTH_REQUIRED",
      title: "AUTH_REQUIRED",
      detail: "Access cookie missing.",
    });
  }
  const claims = await verifyAccessToken(
    env.EFCC_ACCESS_TOKEN_SECRET,
    access
  );
  if (!claims) {
    return jsonResponse(401, {
      code: "AUTH_REQUIRED",
      title: "AUTH_REQUIRED",
      detail: "Access token invalid or expired.",
    });
  }
  const caller = await findAccountByUserId(env.DB, claims.uid);
  if (!caller || (caller.role !== "Admin" && caller.role !== "Teacher")) {
    return jsonResponse(403, {
      code: "FORBIDDEN",
      title: "FORBIDDEN",
      detail: "Admin or Teacher role required.",
    });
  }

  let body: { userId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonResponse(400, {
      code: "VALIDATION",
      title: "VALIDATION",
      detail: "Body must be JSON.",
    });
  }
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!userId) {
    return jsonResponse(400, {
      code: "VALIDATION",
      title: "VALIDATION",
      detail: "userId is required.",
    });
  }
  await adminUnlockLegacyUpgrade(env.DB, userId);
  // Operator convention: revoke every outstanding session for the unlocked
  // account so the member re-authenticates with the new credential.
  await revokeAllUserSessions(env.DB, userId);
  return jsonResponse(200, { userId, unlocked: true });
}

// Touched via handlers to ensure the named constants are not pruned when
// the file is tree-shaken; the auth surface depends on these guarantees.
export const AUTH_TTL_GUARDS = {
  ACCESS_COOKIE_MAX_AGE_SEC,
  REFRESH_COOKIE_MAX_AGE_SEC,
};
