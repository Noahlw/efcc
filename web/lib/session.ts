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
import { sectionsForRole } from "@/lib/sections";

const AUTH_HINT_KEY = "efcc_auth_active";
const LOCAL_DEMO_AUTH_KEY = "efcc_local_demo_auth";

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
    localStorage.removeItem(LOCAL_DEMO_AUTH_KEY);
  } catch {
    // Best-effort.
  }
}

function localDemoEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

/** Local-only login fixture for the running development server. */
export function isLocalDemoCredentials(
  username: string,
  password: string
): boolean {
  return (
    localDemoEnabled() && username.trim() === "noah" && password === "6883"
  );
}

/** Mark the local demo session without creating or storing a real token. */
export function setLocalDemoAuth(): void {
  if (!localDemoEnabled()) {
    return;
  }
  try {
    localStorage.setItem(LOCAL_DEMO_AUTH_KEY, "1");
  } catch {
    // Storage unavailable — the current page can still navigate after login.
  }
}

/** Remove a development-only demo marker before a real auth attempt. */
export function clearLocalDemoAuth(): void {
  try {
    localStorage.removeItem(LOCAL_DEMO_AUTH_KEY);
  } catch {
    // Storage unavailable — no marker can be read on the next restore.
  }
}

function hasLocalDemoAuth(): boolean {
  if (!localDemoEnabled()) {
    return false;
  }
  try {
    return localStorage.getItem(LOCAL_DEMO_AUTH_KEY) === "1";
  } catch {
    return false;
  }
}

export function buildLocalDemoBootstrap(): Bootstrap {
  return {
    profile: {
      userId: "local-noah",
      name: "Noah",
      username: "noah",
      phone: "",
      role: "Staff",
      status: "Active",
      qrCodeString: "EFCC-LOCAL-NOAH",
    },
    // S15: role-based section authorization (Staff sees six sections).
    sections: sectionsForRole("Staff"),
  };
}

/** Keep local-demo sign-out from calling the production auth API. */
export function isLocalDemoBootstrap(bootstrap: Bootstrap): boolean {
  return hasLocalDemoAuth() && bootstrap.profile.userId === "local-noah";
}

/**
 * Assemble the shell's Bootstrap from a cookie-verified public user,
 * authorizing the shell sections by the user's role (S15).
 */
export function buildBootstrap(
  user: PublicUser,
  serverSections?: Section[]
): Bootstrap {
  // S15: the server authorizes the section list. /api/v1/auth/me returns the
  // role-appropriate `sections` (computed with the canonical stored role);
  // the client consumes them verbatim. `sectionsForRole` is only a
  // resilience fallback for servers that do not send the list yet.
  return {
    profile: user,
    sections: serverSections ?? sectionsForRole(user.role),
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
  if (hasLocalDemoAuth()) {
    return buildLocalDemoBootstrap();
  }
  if (!hasAuthHint()) {
    clearAuthHint();
    return null;
  }
  const { user, sections } = await currentUser();
  return buildBootstrap(user, sections);
}
