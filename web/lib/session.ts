/**
 * Client-side session state for the AUTH-04 cookie-only boundary (ADR-0020).
 *
 * Credentials, tokens, and session identifiers never touch browser storage —
 * they live only in the server-set httpOnly access+refresh cookies. The only
 * thing persisted here is a non-secret boolean "an authenticated session is
 * active" hint, which lets cold boot skip a restore call when nothing is
 * stored (Spec 074: "renders Login, makes no restore call"). The hint is
 * never treated as proof of identity: every restore re-verifies against the
 * cookie boundary via /api/v1/auth/refresh + /api/v1/auth/me.
 */

import { authMe, authRefresh, RpcError } from "@/lib/api";
import type { Bootstrap, PublicUser } from "@/lib/api";
import type { Section } from "@/lib/api";

const AUTH_HINT_KEY = "efcc_auth_active";
export const DEEP_LINK_KEY = "efcc_deep_link";

/** Persist a same-origin path/query/hash for the post-login handoff. */
export function rememberDeepLink(value: string): void {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return;
  }
  try {
    sessionStorage.setItem(DEEP_LINK_KEY, value);
  } catch {
    // Storage unavailable — the current URL remains the safe fallback.
  }
}

/** Consume and validate the post-login path/query/hash handoff. */
export function consumeDeepLink(): string | null {
  try {
    const value = sessionStorage.getItem(DEEP_LINK_KEY);
    sessionStorage.removeItem(DEEP_LINK_KEY);
    if (
      value &&
      value.startsWith("/") &&
      !value.startsWith("//") &&
      !value.includes("\\")
    ) {
      return value;
    }
  } catch {
    // Storage unavailable — the caller falls back to the first shell section.
  }
  return null;
}

export function clearDeepLink(): void {
  try {
    sessionStorage.removeItem(DEEP_LINK_KEY);
  } catch {
    // Best-effort.
  }
}
/** True when a cookie-authenticated session was last known to be active. */
export function hasAuthHint(): boolean {
  try {
    return localStorage.getItem(AUTH_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

/** Record that login/refresh succeeded (a non-secret presence flag). */
export function setAuthHint(): void {
  try {
    localStorage.setItem(AUTH_HINT_KEY, "1");
  } catch {
    // Storage unavailable — non-critical; cookies remain the source of truth.
  }
}

/** Clear the presence flag (logout, expiry, or revoked session). */
export function clearAuthHint(): void {
  try {
    localStorage.removeItem(AUTH_HINT_KEY);
  } catch {
    // Best-effort.
  }
}

/**
 * Assemble the shell Bootstrap from cookie-verified user data and the two
 * server projections. Missing or malformed projections fail closed; the
 * browser never derives authorization or navigation from `user.role`.
 */
export function buildBootstrap(
  user: PublicUser,
  serverSections?: Section[],
  serverNavigation?: Section[]
): Bootstrap {
  return {
    profile: user,
    sections: Array.isArray(serverSections) ? serverSections : [],
    navigation: Array.isArray(serverNavigation) ? serverNavigation : [],
  };
}

/**
 * Resolve the current user against the cookie boundary. Prefers a live
 * access cookie via /api/v1/auth/me; when that 401s (the ~15-min access
 * token expired), silently refreshes the refresh cookie and retries me.
 * Throws RpcError otherwise (AUTH_REQUIRED = refresh cookie gone/revoked).
 */
async function currentUser(): Promise<{
  user: PublicUser;
  sections: Section[];
  navigation: Section[];
}> {
  try {
    return await authMe();
  } catch (error) {
    if (error instanceof RpcError && error.problem.code === "AUTH_REQUIRED") {
      await authRefresh();
      return authMe();
    }
    throw error;
  }
}

/**
 * Restore the authenticated shell state on load. Returns null when no
 * session is stored (render Login without any restore call); otherwise
 * cookie-verifies and returns a ready Bootstrap. Throws RpcError with the
 * same codes as the auth surface (AUTH_REQUIRED = expired/revoked refresh).
 */
export async function restoreBootstrap(): Promise<Bootstrap | null> {
  if (!hasAuthHint()) {
    clearAuthHint();
    return null;
  }
  const { user, sections, navigation } = await currentUser();
  return buildBootstrap(user, sections, navigation);
}
