/**
 * EFCC D1 identity — browser-facing auth route handlers (AUTH-04 #162 /
 * AUTH-06 #165). Each handler implements ONE `/api/v1/auth/*` route.
 *
 * Transport is cookie-only (ADR-0020 §2 / AUTH-02 #160):
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
 * Contract (AUTH-04 #162, locked): success responses use the `{ requestId,
 * data }` envelope; errors are RFC 9457 Problem Details (ADR-0018 §5) with
 * `X-Request-Id` correlation on every response. `register`, `approve`, and
 * `reject` require an `Idempotency-Key` header; `login` is deliberately not
 * idempotent; `refresh` rotates the opaque value per RFC 9700 §4.14.2.
 *
 * The handlers are pure functions that take a Request and env-like context
 * and return a Response. They are tested directly via the workerd runtime.
 */

import { findAccountByUserId, findAccountByUsername } from "./accounts";
import type { AccountRow } from "./accounts";
import {
  AccountConflictError,
  AccountStatusError,
  WrongCurrentPasswordError,
  changePassword,
  changeUsername,
} from "./account-settings";
import type { UsernameChangeResult } from "./account-settings";
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  accessCookieHeader,
  clearAuthCookieHeaders,
  refreshCookieHeader,
  setAuthCookieHeaders,
} from "./cookies";
import { verifyCredential, hashCredential } from "./credentials";
import { LegacyUpgradeLockedError, adminUnlockLegacyUpgrade } from "./lockout";
import {
  approveRegistration,
  listPendingRegistrations,
  createRegistrationRequest,
  rejectRegistration,
  RegistrationConflictError,
  RegistrationNotFoundError,
} from "./registrations";
import {
  AuthError,
  issueSession,
  refreshSession,
  revokeAllUserSessions,
  revokeSession,
  verifyAccessToken,
} from "./sessions";
import { completeCredentialUpgrade, verifyLegacyPinForLogin } from "./upgrade";
import { hasActiveManagementGrant } from "./management-grants";
import { sectionsForRole, stableNavigationSections } from "../sections";

export interface AuthEnv {
  DB: D1Database;
  EFCC_ACCESS_TOKEN_SECRET: string;
}

/** Public user-facing profile shape (no secrets). */
export interface PublicUser {
  userId: string;
  name: string;
  username: string;
  phone: string;
  role: string;
  status: string;
  qrCodeString: string;
}

function secretFreeUser(account: {
  user_id: string;
  name: string;
  username: string;
  role: string;
  account_status: string;
  phone: string | null;
  qr_code_string: string | null;
}): PublicUser {
  return {
    userId: account.user_id,
    name: account.name,
    username: account.username,
    phone: account.phone ?? "",
    role: account.role,
    status: account.account_status,
    qrCodeString: account.qr_code_string ?? "",
  };
}

/**
 * RFC 9457 Problem Details error (ADR-0018 §5). `status` matches the outer
 * HTTP status; `requestId` is echoed in both the body and the X-Request-Id
 * header for correlation.
 */
function problem(
  status: number,
  code: string,
  title: string,
  detail: string | undefined,
  requestId: string
): Response {
  const body: Record<string, unknown> = {
    type: `tag:apps-script/efcc/errors#${code}`,
    title,
    status,
    code,
    requestId,
  };
  if (detail !== undefined) {
    body.detail = detail;
  }
  const headers = new Headers({
    "Content-Type": "application/problem+json",
    "X-Request-Id": requestId,
  });
  return Response.json(body, { status, headers });
}

/** Success envelope with X-Request-Id correlation. */
function jsonResponse(
  status: number,
  body: unknown,
  requestId: string
): Response {
  return Response.json(body, {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
    },
  });
}

/**
 * Success response carrying BOTH auth cookies as two real `Set-Cookie`
 * headers (access first, refresh second) via `Headers.append`. Token
 * material is emitted only here — never in the response body.
 */
function authCookieJsonResponse(
  status: number,
  body: unknown,
  accessValue: string,
  refreshValue: string,
  requestId: string
): Response {
  const headers = setAuthCookieHeaders(accessValue, refreshValue);
  headers.set("Content-Type", "application/json");
  headers.set("X-Request-Id", requestId);
  return Response.json(body, { status, headers });
}

/**
 * Success response that CLEARS BOTH auth cookies via two real `Set-Cookie`
 * delete headers (the `handleLogout` fail-closed clearing pattern). Used by
 * the account-change handlers: both changes revoke every refresh session, so
 * the client must drop both cookies and re-authenticate. Token material is
 * never emitted in the body.
 */
function clearedAuthJsonResponse(
  status: number,
  body: unknown,
  requestId: string
): Response {
  const cleared = clearAuthCookieHeaders();
  const headers = setAuthCookieHeaders(cleared[0], cleared[1]);
  headers.set("Content-Type", "application/json");
  headers.set("X-Request-Id", requestId);
  return Response.json(body, { status, headers });
}

/** Map a session-layer AuthError onto its Problem Details response. */
function authErrorToProblem(err: Error, requestId: string): Response {
  if (err instanceof AuthError) {
    const status =
      err.code === "AUTH_REQUIRED" ? 401 : err.code === "FORBIDDEN" ? 403 : 409;
    return problem(status, err.code, err.code, err.message, requestId);
  }
  return problem(
    401,
    "AUTH_REQUIRED",
    "Unauthorized",
    "Authentication failed.",
    requestId
  );
}

/** Read a named cookie value from the request's Cookie header. */
function readCookie(headers: Headers, name: string): string | null {
  const raw = headers.get("Cookie");
  if (!raw) {
    return null;
  }
  for (const pair of raw.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const k = pair.slice(0, eq).trim();
    if (k === name) {
      return pair.slice(eq + 1).trim();
    }
  }
  return null;
}

/**
 * Resolve the authenticated account from the access cookie. Returns
 * `{ account }` on success, or a Problem Details Response (401) to return
 * directly — cookie missing / token invalid / unknown account. Shared by
 * the Admin-or-Staff and self-service session gates.
 */
async function resolveAuthenticatedAccount(
  request: Request,
  env: AuthEnv,
  requestId: string
): Promise<{ account: AccountRow } | Response> {
  const access = readCookie(request.headers, ACCESS_COOKIE_NAME);
  if (!access) {
    return problem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Access cookie missing.",
      requestId
    );
  }
  const claims = await verifyAccessToken(env.EFCC_ACCESS_TOKEN_SECRET, access);
  if (!claims) {
    return problem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Access token invalid or expired.",
      requestId
    );
  }
  const account = await findAccountByUserId(env.DB, claims.uid);
  if (!account) {
    return problem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Unknown account.",
      requestId
    );
  }
  return { account };
}

/**
 * Resolve the caller from the access cookie and require Admin or Staff
 * role (ADR-0025: Teacher is retired). Returns `{ caller }` on success, or
 * a Problem Details Response to return directly.
 */
async function requireAdminOrStaff(
  request: Request,
  env: AuthEnv,
  requestId: string
): Promise<{ caller: AccountRow } | Response> {
  const resolved = await resolveAuthenticatedAccount(request, env, requestId);
  if (resolved instanceof Response) {
    return resolved;
  }
  if (resolved.account.role !== "Admin" && resolved.account.role !== "Staff") {
    return problem(
      403,
      "FORBIDDEN",
      "Forbidden",
      "Admin or Staff role required.",
      requestId
    );
  }
  return { caller: resolved.account };
}

/**
 * Resolve the currently authenticated account from the access cookie and
 * require an Active status. Returns `{ account }` on success, or a Problem
 * Details Response to return directly. This is the self-service session gate
 * for the account-change handlers (Spec #191): missing/invalid session -> 401;
 * account not Active -> 403.
 */
async function requireSessionUser(
  request: Request,
  env: AuthEnv,
  requestId: string
): Promise<{ account: AccountRow } | Response> {
  const resolved = await resolveAuthenticatedAccount(request, env, requestId);
  if (resolved instanceof Response) {
    return resolved;
  }
  if (resolved.account.account_status !== "Active") {
    return problem(
      403,
      "FORBIDDEN",
      "Forbidden",
      "Account is not active.",
      requestId
    );
  }
  return { account: resolved.account };
}

/**
 * POST /api/v1/auth/register (AUTH-04 #162)
 *
 * Body: `{ username, password, name, phone? }`. Idempotency-Key required.
 * Creates a Pending registration request (no session issued); a Teacher/Admin
 * later approves it. Duplicate usernames fail closed (409) so a retry never
 * duplicates a request.
 */
export async function handleRegister(
  request: Request,
  env: AuthEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (!request.headers.get("Idempotency-Key")) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "Idempotency-Key header is required.",
      requestId
    );
  }
  let body: {
    username?: unknown;
    password?: unknown;
    name?: unknown;
    phone?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "Body must be JSON.",
      requestId
    );
  }
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name : "";
  const phone = typeof body.phone === "string" ? body.phone : "";
  if (!username || !password || !name || !phone) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "username, password, name, and phone are required.",
      requestId
    );
  }
  if (password.length < 8) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "password must be at least 8 characters.",
      requestId
    );
  }

  const credentialHash = await hashCredential(password);
  try {
    await createRegistrationRequest(env.DB, {
      userId: crypto.randomUUID(),
      username,
      name,
      phone,
      credentialHash,
    });
  } catch (error) {
    if (error instanceof RegistrationConflictError) {
      return problem(409, "CONFLICT", "Conflict", error.message, requestId);
    }
    throw error;
  }
  return jsonResponse(
    200,
    { requestId, data: { status: "pending" } },
    requestId
  );
}

/**
 * POST /api/v1/auth/login (AUTH-04 #162)
 *
 * Body: `{ username, password }`. NOT idempotent — a repeated successful call
 * issues a fresh refresh session (never a duplicate account/resource). For a
 * migrated legacy account the `password` is verified against the one-time
 * legacy-PIN hash; a match returns `mustSetNewCredential: true` WITHOUT
 * issuing a session (the forced-upgrade flow triggers immediately). A normal
 * account issues access+refresh cookies and returns `mustSetNewCredential:
 * false`.
 */
export async function handleLogin(
  request: Request,
  env: AuthEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  let body: { username?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "Body must be JSON.",
      requestId
    );
  }
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "username and password are required.",
      requestId
    );
  }

  const account = await findAccountByUsername(env.DB, username);
  if (!account) {
    return problem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Invalid username or password.",
      requestId
    );
  }

  // Legacy-PIN forced-upgrade gate (AUTH-01 #159 / ADR-0020 §4): the account
  // is gated (requires_upgrade) until the one-time legacy PIN proves identity.
  if (account.requires_upgrade === 1) {
    const check = await verifyLegacyPinForLogin(env.DB, {
      userId: account.user_id,
      legacyPin: password,
    });
    if (check.locked) {
      return problem(
        423,
        "UPGRADE_LOCKED",
        "Locked",
        "Account is locked pending credential-upgrade review.",
        requestId
      );
    }
    if (!check.ok) {
      return problem(
        401,
        "AUTH_REQUIRED",
        "Unauthorized",
        "Invalid username or password.",
        requestId
      );
    }
    // Identity proven but no session is issued until the credential is set.
    return jsonResponse(
      200,
      {
        requestId,
        data: {
          userId: account.user_id,
          name: account.name,
          role: account.role,
          status: account.account_status,
          mustSetNewCredential: true,
        },
      },
      requestId
    );
  }

  if (account.account_status !== "Active") {
    return problem(
      403,
      "FORBIDDEN",
      "Forbidden",
      "Account is not active.",
      requestId
    );
  }
  const ok = await verifyCredential(password, account.credential_hash);
  if (!ok) {
    return problem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Invalid username or password.",
      requestId
    );
  }

  const bundle = await issueSession(env.DB, {
    userId: account.user_id,
    accessTokenSecret: env.EFCC_ACCESS_TOKEN_SECRET,
  });
  return authCookieJsonResponse(
    200,
    {
      requestId,
      data: {
        userId: account.user_id,
        name: account.name,
        role: account.role,
        status: account.account_status,
        mustSetNewCredential: false,
      },
    },
    accessCookieHeader(bundle.accessToken),
    refreshCookieHeader(bundle.sessionId),
    requestId
  );
}

/**
 * POST /api/v1/auth/upgrade (preserved from AUTH-02 #160, ADR-0020 §4)
 *
 * Body: `{ username, legacyPin, newCredential }`. Completes the forced
 * credential upgrade for a legacy account: verifies the one-time legacy PIN,
 * sets the new credential, clears the legacy proof, and issues a session.
 */
export async function handleUpgrade(
  request: Request,
  env: AuthEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  let body: {
    username?: unknown;
    legacyPin?: unknown;
    newCredential?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "Body must be JSON.",
      requestId
    );
  }
  const username = typeof body.username === "string" ? body.username : "";
  const legacyPin = typeof body.legacyPin === "string" ? body.legacyPin : "";
  const newCredential =
    typeof body.newCredential === "string" ? body.newCredential : "";
  if (!username || !legacyPin || !newCredential) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "username, legacyPin, newCredential are required.",
      requestId
    );
  }
  if (newCredential.length < 8) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "newCredential must be at least 8 characters.",
      requestId
    );
  }

  const account = await findAccountByUsername(env.DB, username);
  try {
    await completeCredentialUpgrade(env.DB, {
      userId: account?.user_id ?? "",
      legacyPin,
      newCredential,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorToProblem(error, requestId);
    }
    if (error instanceof LegacyUpgradeLockedError) {
      return problem(
        423,
        "UPGRADE_LOCKED",
        "Locked",
        "Account is locked pending credential-upgrade review.",
        requestId
      );
    }
    const message = error instanceof Error ? error.message : "Upgrade failed.";
    if (
      /invalid username or pin/iu.test(message) ||
      /unknown account/iu.test(message)
    ) {
      return problem(
        401,
        "AUTH_REQUIRED",
        "Unauthorized",
        "Invalid username or PIN.",
        requestId
      );
    }
    if (/not awaiting credential upgrade/iu.test(message)) {
      return problem(409, "UPGRADE_REQUIRED", "Conflict", message, requestId);
    }
    return problem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Invalid username or PIN.",
      requestId
    );
  }

  const upgradedAccount = account
    ? await findAccountByUserId(env.DB, account.user_id)
    : null;
  if (!upgradedAccount) {
    return problem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Invalid username or credential.",
      requestId
    );
  }
  const bundle = await issueSession(env.DB, {
    userId: upgradedAccount.user_id,
    accessTokenSecret: env.EFCC_ACCESS_TOKEN_SECRET,
  });
  return authCookieJsonResponse(
    200,
    { requestId, data: { user: secretFreeUser(upgradedAccount) } },
    accessCookieHeader(bundle.accessToken),
    refreshCookieHeader(bundle.sessionId),
    requestId
  );
}

/**
 * POST /api/v1/auth/refresh (AUTH-04 #162)
 *
 * Reads the refresh cookie, exchanges it for a fresh access token AND a NEW
 * rotated refresh value (RFC 9700 §4.14.2); the old value is invalidated
 * immediately. No body.
 */
export async function handleRefresh(
  request: Request,
  env: AuthEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const refresh = readCookie(request.headers, REFRESH_COOKIE_NAME);
  if (!refresh) {
    return problem(
      401,
      "AUTH_REQUIRED",
      "Unauthorized",
      "Refresh cookie missing.",
      requestId
    );
  }
  try {
    const bundle = await refreshSession(env.DB, {
      sessionId: refresh,
      accessTokenSecret: env.EFCC_ACCESS_TOKEN_SECRET,
    });
    return authCookieJsonResponse(
      200,
      { requestId, data: {} },
      accessCookieHeader(bundle.accessToken),
      refreshCookieHeader(bundle.sessionId),
      requestId
    );
  } catch (error) {
    return authErrorToProblem(
      error instanceof Error ? error : new Error("Refresh failed."),
      requestId
    );
  }
}

/**
 * POST /api/v1/auth/logout (AUTH-04 #162)
 *
 * Reads the refresh cookie, revokes the session server-side, and clears both
 * cookies. Naturally idempotent. Returns 204 with X-Request-Id correlation.
 */
export async function handleLogout(
  request: Request,
  env: AuthEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const refresh = readCookie(request.headers, REFRESH_COOKIE_NAME);
  if (refresh) {
    try {
      await revokeSession(env.DB, refresh);
    } catch {
      // Fail-closed: even though server-side revocation failed, the client
      // must not keep credentials it can no longer use. Clear both cookies
      // while still surfacing the 503 so the client can report the partial
      // failure (Spec 077 keeps the existing logout-notice behavior).
      const cleared = clearAuthCookieHeaders();
      const headers = setAuthCookieHeaders(cleared[0], cleared[1]);
      const res = problem(
        503,
        "UNAVAILABLE",
        "Service unavailable",
        "Unable to revoke the refresh session.",
        requestId
      );
      for (const [key, value] of headers) {
        res.headers.append(key, value);
      }
      return res;
    }
  }
  const cleared = clearAuthCookieHeaders();
  const headers = setAuthCookieHeaders(cleared[0], cleared[1]);
  headers.set("X-Request-Id", requestId);
  return new Response(null, { status: 204, headers });
}

/**
 * GET /api/v1/auth/me (preserved from AUTH-02 #160)
 *
 * Reads the access cookie, verifies statelessly, and returns the public user
 * alongside server-authorized sections and stable navigation metadata.
 */
export async function handleMe(
  request: Request,
  env: AuthEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const resolved = await resolveAuthenticatedAccount(request, env, requestId);
  if (resolved instanceof Response) {
    return resolved;
  }
  if (resolved.account.account_status !== "Active") {
    return problem(
      403,
      "FORBIDDEN",
      "Forbidden",
      "Account is not active.",
      requestId
    );
  }
  // Only Members can gain `events` from a scoped grant (Staff/Admin already
  // have it via role); skip the extra query for every other role so the
  // highest-traffic auth route pays for this check only when it can change
  // the answer.
  const hasManagementGrant =
    resolved.account.role === "Member"
      ? await hasActiveManagementGrant(env.DB, resolved.account.user_id)
      : false;
  // The server emits a separate stable navigation projection. It is
  // presentation metadata only; `sections` remains the authorization set.
  return jsonResponse(
    200,
    {
      requestId,
      data: {
        user: secretFreeUser(resolved.account),
        sections: sectionsForRole(resolved.account.role, hasManagementGrant),
        navigation: stableNavigationSections(
          resolved.account.role,
          hasManagementGrant
        ),
      },
    },
    requestId
  );
}

/**
 * POST /api/v1/auth/username (UI-04 #196 / Spec #191)
 *
 * Session-authenticated self-service username change. Body: `{ username }`.
 * No current password is required (ADR-0020 §1.1 locks a session-authenticated
 * flow). The immutable User_ID and QR identity default are never touched.
 *
 * Success (200) carries `{ requestId, data: { username, sessionRevoked:
 * true } }` and clears BOTH auth cookies via Set-Cookie delete headers,
 * because every refresh session was revoked inside the same transaction.
 * An unchanged value is a value-idempotent no-op (200, `sessionRevoked:
 * false`, no cookies cleared). Duplicates fail closed with 409 (accounts AND
 * registration_requests, incl. the race path); validation is 422.
 */
export async function handleChangeUsername(
  request: Request,
  env: AuthEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireSessionUser(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }

  let body: { username?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "Body must be JSON.",
      requestId
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "Body must be a JSON object.",
      requestId
    );
  }
  const username = typeof body.username === "string" ? body.username : "";
  if (!username.trim()) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "username is required.",
      requestId
    );
  }

  let result: UsernameChangeResult;
  try {
    result = await changeUsername(env.DB, {
      userId: auth.account.user_id,
      username,
      requestId,
    });
  } catch (error) {
    if (error instanceof AccountConflictError) {
      return problem(409, "CONFLICT", "Conflict", error.message, requestId);
    }
    if (error instanceof AccountStatusError) {
      return problem(
        403,
        "FORBIDDEN",
        "Forbidden",
        error.message,
        requestId
      );
    }
    throw error;
  }

  if (!result.changed) {
    if (result.sessionRevoked) {
      // Replay of an identical earlier change that already revoked every
      // session: this request wrote nothing, but the client must clear its
      // auth cookies to leave the signed-out surface.
      return clearedAuthJsonResponse(
        200,
        {
          requestId,
          data: { username: result.username, sessionRevoked: true },
        },
        requestId
      );
    }
    // Fresh value-idempotent no-op: nothing changed, so no revocation and
    // no cookie clearing — the session stays live.
    return jsonResponse(
      200,
      {
        requestId,
        data: { username: result.username, sessionRevoked: false },
      },
      requestId
    );
  }
  return clearedAuthJsonResponse(
    200,
    {
      requestId,
      data: { username: result.username, sessionRevoked: true },
    },
    requestId
  );
}

/**
 * POST /api/v1/auth/password (UI-04 #196 / Spec #191)
 *
 * Session-authenticated self-service password change. Body:
 * `{ currentPassword, newPassword }`. The current password is verified
 * against the stored PBKDF2 hash; a wrong value is 422 VALIDATION with
 * detail "current password is incorrect" — deliberately NOT 401, so the
 * client cannot conflate it with session expiry. `newPassword` must be
 * >= 8 characters (Unicode). Success (200) carries `{ requestId, data:
 * { sessionRevoked: true } }` and clears both auth cookies.
 */
export async function handleChangePassword(
  request: Request,
  env: AuthEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireSessionUser(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }

  let body: { currentPassword?: unknown; newPassword?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "Body must be JSON.",
      requestId
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "Body must be a JSON object.",
      requestId
    );
  }
  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword =
    typeof body.newPassword === "string" ? body.newPassword : "";
  if (!currentPassword || !newPassword) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "currentPassword and newPassword are required.",
      requestId
    );
  }
  if (newPassword.length < 8) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "newPassword must be at least 8 characters.",
      requestId
    );
  }

  try {
    await changePassword(env.DB, {
      userId: auth.account.user_id,
      currentPassword,
      newPassword,
      requestId,
    });
  } catch (error) {
    if (error instanceof WrongCurrentPasswordError) {
      return problem(
        422,
        "VALIDATION",
        "Validation failed",
        error.message,
        requestId
      );
    }
    if (error instanceof AccountStatusError) {
      return problem(
        403,
        "FORBIDDEN",
        "Forbidden",
        error.message,
        requestId
      );
    }
    throw error;
  }

  return clearedAuthJsonResponse(
    200,
    { requestId, data: { sessionRevoked: true } },
    requestId
  );
}

/**
 * POST /api/v1/auth/admin-unlock (preserved from AUTH-02 #160)
 *
 * Admin/Teacher intervention: clears a legacy-PIN lockout so the upgrade can
 * proceed. Body: `{ userId }`. The caller must be authenticated (access
 * cookie) and hold Admin or Staff.
 */
export async function handleAdminUnlock(
  request: Request,
  env: AuthEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireAdminOrStaff(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }

  let body: { userId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "Body must be JSON.",
      requestId
    );
  }
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!userId) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "userId is required.",
      requestId
    );
  }
  const unlocked = await adminUnlockLegacyUpgrade(env.DB, userId);
  if (!unlocked) {
    return problem(
      404,
      "NOT_FOUND",
      "Not found",
      "No account with that userId.",
      requestId
    );
  }
  // Operator convention: revoke every outstanding session for the unlocked
  // account so the member re-authenticates with the new credential.
  await revokeAllUserSessions(env.DB, userId);
  return jsonResponse(
    200,
    { requestId, data: { userId, unlocked: true } },
    requestId
  );
}

/**
 * POST /api/v1/auth/registrations/:id/approve (AUTH-04 #162)
 *
 * Teacher/Admin approves a Pending registration into an Active account.
 * Idempotency-Key required; approving an already-approved request is a no-op
 * success. Body: empty or optional note (ignored).
 */
export async function handleApprove(
  request: Request,
  env: AuthEnv,
  registrationId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (!request.headers.get("Idempotency-Key")) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "Idempotency-Key header is required.",
      requestId
    );
  }
  const auth = await requireAdminOrStaff(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }

  let accountStatus: string;
  try {
    accountStatus = await approveRegistration(env.DB, {
      requestId: registrationId,
      reviewerId: auth.caller.user_id,
    });
  } catch (error) {
    if (error instanceof RegistrationNotFoundError) {
      return problem(
        404,
        "NOT_FOUND",
        "Not found",
        "Unknown registration request.",
        requestId
      );
    }
    if (error instanceof RegistrationConflictError) {
      return problem(409, "CONFLICT", "Conflict", error.message, requestId);
    }
    throw error;
  }
  return jsonResponse(200, { requestId, data: { accountStatus } }, requestId);
}

/**
 * POST /api/v1/auth/registrations/:id/reject (AUTH-04 #162)
 *
 * Teacher/Admin rejects a Pending registration without creating an account.
 * Idempotency-Key required; rejecting an already-rejected request is a no-op
 * success. Body: empty or optional note (ignored).
 */
export async function handleReject(
  request: Request,
  env: AuthEnv,
  registrationId: string
): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (!request.headers.get("Idempotency-Key")) {
    return problem(
      422,
      "VALIDATION",
      "Validation failed",
      "Idempotency-Key header is required.",
      requestId
    );
  }
  const auth = await requireAdminOrStaff(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }

  let accountStatus: string;
  try {
    accountStatus = await rejectRegistration(env.DB, {
      requestId: registrationId,
      reviewerId: auth.caller.user_id,
    });
  } catch (error) {
    if (error instanceof RegistrationNotFoundError) {
      return problem(
        404,
        "NOT_FOUND",
        "Not found",
        "Unknown registration request.",
        requestId
      );
    }
    if (error instanceof RegistrationConflictError) {
      return problem(409, "CONFLICT", "Conflict", error.message, requestId);
    }
    throw error;
  }
  return jsonResponse(200, { requestId, data: { accountStatus } }, requestId);
}

/**
 * GET /api/v1/auth/registrations (AUTH-05 #163)
 *
 * Teacher/Admin-only approval queue listing. Returns safe metadata only for
 * Pending requests — no credential hash, no session/token material, no
 * immutable identity key — correlated via X-Request-Id. 401 when
 * unauthenticated, 403 for non-Admin/Staff roles.
 */
export async function handleListRegistrations(
  request: Request,
  env: AuthEnv
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const auth = await requireAdminOrStaff(request, env, requestId);
  if (auth instanceof Response) {
    return auth;
  }

  const rows = await listPendingRegistrations(env.DB);
  const registrations = rows.map((r) => ({
    requestId: r.request_id,
    username: r.username,
    name: r.name,
    phone: r.phone,
    submittedAt: r.submitted_at,
    accountStatus: r.account_status,
    role: r.role,
  }));
  return jsonResponse(200, { requestId, data: { registrations } }, requestId);
}
