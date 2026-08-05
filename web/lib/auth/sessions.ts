/**
 * EFCC D1 identity — access token + refresh session lifecycle (AUTH-02 #160).
 *
 * Session architecture per ADR-0020 §2:
 *   * A short-lived (~15 min) HMAC-signed access token is issued on login /
 *     refresh and verified STATELESSLY on ordinary protected requests — zero
 *     D1 reads on the common path.
 *   * The D1 `sessions` row is read only on token refresh or explicit
 *     revocation (logout, credential change, admin suspend). It uses a 90-day
 *     idle expiry, touched on each successful refresh, and supports multiple
 *     concurrent devices per member.
 *
 * Access token format: `payload.signature` where payload is base64url JSON
 * `{ sid, uid, iat, exp }` and signature is HMAC-SHA256(payload, secret). The
 * signature binds the token to a specific session (sid) so revocation of one
 * session cannot be masked by a token from another.
 *
 * No credential, access token, or raw session value is ever logged or returned
 * except the access token string handed to the client and the (non-secret)
 * session identity.
 */

import {
  ACCESS_TOKEN_TTL_MS,
  REFRESH_IDLE_TTL_MS,
  constantTimeEqual,
} from "./credentials";
import type { AccountRow } from "./accounts";
import { findAccountByUserId } from "./accounts";

const textEncoder = new TextEncoder();

export interface AccessTokenClaims {
  sid: string; // session id
  uid: string; // user id
  iat: number; // issued-at epoch millis
  exp: number; // expiry epoch millis
}

export interface SessionBundle {
  sessionId: string;
  accessToken: string;
  issuedAt: number;
  expiresAt: number; // refresh-session idle expiry (last_seen + 90d)
}

export type AuthErrorCode =
  | "AUTH_REQUIRED" // no/expired/revoked session, unknown account
  | "FORBIDDEN" // account not Active (suspended/deactivated/pending)
  | "UPGRADE_REQUIRED"; // legacy account must complete forced credential upgrade

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(data)
  );
  return new Uint8Array(sig);
}

/**
 * Sign a short-lived access token. `secret` is the deployment secret
 * (EFCC_ACCESS_TOKEN_SECRET); never logged.
 */
export async function signAccessToken(
  secret: string,
  claims: Omit<AccessTokenClaims, "exp"> & { exp?: number }
): Promise<string> {
  const full: AccessTokenClaims = {
    ...claims,
    exp: claims.exp ?? claims.iat + ACCESS_TOKEN_TTL_MS,
  };
  const payload = b64urlEncode(textEncoder.encode(JSON.stringify(full)));
  const sig = await hmacSha256(secret, payload);
  return `${payload}.${b64urlEncode(sig)}`;
}

/**
 * Verify a signed access token STATELESSLY (no D1 read). Returns the claims
 * on success, or null for malformed / tampered / expired tokens (fail closed).
 */
export async function verifyAccessToken(
  secret: string,
  token: string,
  now: number = Date.now()
): Promise<AccessTokenClaims | null> {
  const dot = token.lastIndexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const sig = await hmacSha256(secret, payload);
  const expected = b64urlEncode(sig);
  if (!constantTimeEqual(expected, signature)) return null;

  let claims: AccessTokenClaims;
  try {
    claims = JSON.parse(
      new TextDecoder().decode(b64urlDecode(payload))
    ) as AccessTokenClaims;
  } catch {
    return null;
  }
  if (
    typeof claims.sid !== "string" ||
    typeof claims.uid !== "string" ||
    typeof claims.iat !== "number" ||
    typeof claims.exp !== "number"
  ) {
    return null;
  }
  if (now >= claims.exp) return null;
  return claims;
}

/** Assert an account may hold a session: Active and not awaiting upgrade. */
function assertActiveForSession(account: AccountRow | null): AccountRow {
  if (!account) throw new AuthError("AUTH_REQUIRED", "Unknown account.");
  if (account.requires_upgrade === 1) {
    throw new AuthError("UPGRADE_REQUIRED", "Credential upgrade required.");
  }
  if (account.account_status !== "Active") {
    throw new AuthError("FORBIDDEN", "Account is not active.");
  }
  return account;
}

/**
 * Issue exactly one new refresh-session row plus one access token for an
 * Active, non-upgrade-pending account. Multi-device safe: each call creates an
 * independent session row; revoking one does not affect others.
 */
export async function issueSession(
  db: D1Database,
  options: {
    userId: string;
    accessTokenSecret: string;
    deviceFingerprint?: string;
    now?: number;
    expiresAt?: number;
  }
): Promise<SessionBundle> {
  const now = options.now ?? Date.now();
  const account = assertActiveForSession(
    await findAccountByUserId(db, options.userId)
  );

  const sessionId = crypto.randomUUID();
  const expiresAt =
    options.expiresAt ?? now + REFRESH_IDLE_TTL_MS;

  await db
    .prepare(
      `INSERT INTO sessions (
         session_id, user_id, issued_at, last_seen_at, expires_at,
         revoked_at, device_fingerprint, created_at
       ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`
    )
    .bind(
      sessionId,
      account.user_id,
      now,
      now,
      expiresAt,
      options.deviceFingerprint ?? null,
      now
    )
    .run();

  const accessToken = await signAccessToken(options.accessTokenSecret, {
    sid: sessionId,
    uid: account.user_id,
    iat: now,
  });

  return { sessionId, accessToken, issuedAt: now, expiresAt };
}

/**
 * Exchange a valid refresh session for a fresh access token (restore-on-load)
 * and ROTATE the opaque refresh value per RFC 9700 §4.14.2 + AUTH-04 (#162):
 * every successful refresh mints a brand-new session id, invalidating the
 * presented value immediately, so a stolen refresh cookie is useless after
 * the first use. The new session row re-anchors the 90-day idle expiry and
 * the fresh access token binds to the new session. Reads/writes D1 only on
 * this path. Throws AuthError for unknown, revoked, or idle-expired sessions.
 */
export async function refreshSession(
  db: D1Database,
  options: {
    sessionId: string;
    accessTokenSecret: string;
    deviceFingerprint?: string;
    now?: number;
  }
): Promise<SessionBundle> {
  const now = options.now ?? Date.now();

  const session = await db
    .prepare("SELECT * FROM sessions WHERE session_id = ?")
    .bind(options.sessionId)
    .first<{
      session_id: string;
      user_id: string;
      issued_at: number;
      expires_at: number;
      revoked_at: number | null;
    }>();

  if (!session) throw new AuthError("AUTH_REQUIRED", "Unknown session.");
  if (session.revoked_at !== null) {
    throw new AuthError("AUTH_REQUIRED", "Session revoked.");
  }
  if (now >= session.expires_at) {
    throw new AuthError("AUTH_REQUIRED", "Session idle-expired.");
  }

  // Live account re-check: deactivation / suspension ends the session on the
  // next refresh, matching the legacy status-self-invalidation behavior.
  const account = assertActiveForSession(
    await findAccountByUserId(db, session.user_id)
  );

  // Rotate: mint a fresh session row, then invalidate the presented value in
  // the same transaction. The old value can never be renewed afterwards.
  const newSessionId = crypto.randomUUID();
  const expiresAt = now + REFRESH_IDLE_TTL_MS;
  await db
    .batch([
      db
        .prepare(
          `INSERT INTO sessions (
             session_id, user_id, issued_at, last_seen_at, expires_at,
             revoked_at, device_fingerprint, created_at
           ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`
        )
        .bind(
          newSessionId,
          account.user_id,
          now,
          now,
          expiresAt,
          options.deviceFingerprint ?? null,
          now
        ),
      db
        .prepare(
          `UPDATE sessions
              SET revoked_at = ?
            WHERE session_id = ? AND revoked_at IS NULL`
        )
        .bind(now, session.session_id),
    ]);

  const accessToken = await signAccessToken(options.accessTokenSecret, {
    sid: newSessionId,
    uid: account.user_id,
    iat: now,
  });

  return {
    sessionId: newSessionId,
    accessToken,
    issuedAt: session.issued_at,
    expiresAt,
  };
}

/**
 * Revoke a single session (logout / device-specific revocation). Does not
 * affect any other session the member holds on other devices.
 */
export async function revokeSession(
  db: D1Database,
  sessionId: string,
  now: number = Date.now()
): Promise<void> {
  await db
    .prepare(
      `UPDATE sessions SET revoked_at = ? WHERE session_id = ? AND revoked_at IS NULL`
    )
    .bind(now, sessionId)
    .run();
}

/**
 * Revoke every active session for a member (credential change / admin
 * suspend). Outstanding access tokens keep working only until their remaining
 * lifetime (≤ ~15 min) and can never be silently renewed.
 */
export async function revokeAllUserSessions(
  db: D1Database,
  userId: string,
  now: number = Date.now()
): Promise<void> {
  await db
    .prepare(
      `UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`
    )
    .bind(now, userId)
    .run();
}