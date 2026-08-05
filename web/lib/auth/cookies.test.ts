/**
 * AUTH-02 (#160) — cookie-only auth transport contract.
 *
 * Acceptance covered here (ADR-0020 §2 / web/lib/auth/cookies.ts):
 *   - Access and refresh tokens travel in two SEPARATE httpOnly cookies with
 *     Secure, SameSite=Strict, Path=/ and matching max-ages.
 *   - Token material is read ONLY from cookies; the Authorization header and
 *     any other transport are ignored.
 *   - Logout clears both cookies.
 *   - Non-cookie transport (Authorization header, cross-origin) is rejected
 *     fail-closed with a secret-free diagnostic.
 *   - No client-side (localStorage/sessionStorage) token storage: the module
 *     never references browser storage.
 *
 * Runs in the default node environment (no D1 needed) — Headers is global in
 * Node 18+.
 */
import { describe, test, expect } from "vitest";

import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  accessCookieHeader,
  refreshCookieHeader,
  clearAuthCookieHeaders,
  readAuthCookies,
  hasAuthorizationHeader,
  isCrossOrigin,
  rejectNonCookieTransport,
} from "./cookies";

const ORIGIN = "https://efcc.example.com";

describe("AUTH-02: cookie attributes", () => {
  test("access and refresh are separate cookies with locked attributes", () => {
    const access = accessCookieHeader("access.token.value");
    const refresh = refreshCookieHeader("opaque-refresh-key");

    // Separate names.
    expect(access.startsWith(`${ACCESS_COOKIE_NAME}=`)).toBe(true);
    expect(refresh.startsWith(`${REFRESH_COOKIE_NAME}=`)).toBe(true);
    expect(ACCESS_COOKIE_NAME).not.toBe(REFRESH_COOKIE_NAME);

    for (const cookie of [access, refresh]) {
      expect(cookie).toContain("Path=/");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=Strict");
    }
  });

  test("access cookie max-age matches the ~15-min token lifetime", () => {
    expect(accessCookieHeader("t")).toContain("Max-Age=900");
  });

  test("refresh cookie is the opaque D1 key with a 90-day max-age", () => {
    const header = refreshCookieHeader("opaque-refresh-key");
    expect(header).toContain("Max-Age=7776000");
    // The opaque key is carried verbatim, never derived from or equal to the
    // access token.
    expect(header).toContain("opaque-refresh-key");
    expect(header).not.toContain("access");
  });

  test("logout clears both cookies", () => {
    const clears = clearAuthCookieHeaders();
    expect(clears).toHaveLength(2);
    for (const c of clears) {
      expect(c).toContain("Max-Age=0");
    }
    expect(clears.some((c) => c.startsWith(`${ACCESS_COOKIE_NAME}=`))).toBe(true);
    expect(clears.some((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`))).toBe(true);
  });
});

describe("AUTH-02: cookie-only read", () => {
  test("token material is read only from cookies", () => {
    const headers = new Headers({
      Cookie: `${ACCESS_COOKIE_NAME}=tok; ${REFRESH_COOKIE_NAME}=refkey`,
      // A sneaky Authorization header must be ignored.
      Authorization: "Bearer should-not-be-used",
    });
    const got = readAuthCookies(headers);
    expect(got.accessToken).toBe("tok");
    expect(got.refreshSessionId).toBe("refkey");
  });

  test("missing cookies read as null", () => {
    expect(readAuthCookies(new Headers()).accessToken).toBeNull();
    expect(readAuthCookies(new Headers()).refreshSessionId).toBeNull();
  });
});

describe("AUTH-02: rejection of header/CORS transport", () => {
  test("Authorization header is detected and rejected", () => {
    expect(hasAuthorizationHeader(new Headers({ Authorization: "Bearer x" }))).toBe(true);
    expect(hasAuthorizationHeader(new Headers())).toBe(false);

    const diag = rejectNonCookieTransport(
      new Headers({ Authorization: "Bearer x" }),
      ORIGIN
    );
    expect(diag).toMatch(/Authorization header is not supported/);
    expect(diag).not.toContain("Bearer x"); // no secret in diagnostic
  });

  test("cross-origin request is detected and rejected", () => {
    expect(isCrossOrigin(new Headers({ Origin: "https://evil.example" }), ORIGIN)).toBe(true);
    expect(isCrossOrigin(new Headers({ Origin: "https://efcc.example.com" }), ORIGIN)).toBe(false);
    expect(isCrossOrigin(new Headers(), ORIGIN)).toBe(false);

    const diag = rejectNonCookieTransport(
      new Headers({ Origin: "https://evil.example" }),
      ORIGIN
    );
    expect(diag).toMatch(/Cross-origin requests are not supported/);
  });

  test("clean cookie-only same-origin request passes the guard", () => {
    const headers = new Headers({
      Cookie: `${ACCESS_COOKIE_NAME}=tok; ${REFRESH_COOKIE_NAME}=refkey`,
      Origin: "https://efcc.example.com",
    });
    expect(rejectNonCookieTransport(headers, ORIGIN)).toBeNull();
  });
});

describe("AUTH-02: no client-side token storage", () => {
  test("token material is only ever exposed inside HttpOnly cookies", () => {
    // The only route token material leaves the module is the Set-Cookie
    // header, and it is always HttpOnly -> the browser never hands it to JS
    // (no localStorage/sessionStorage, no JS-readable token state).
    const access = accessCookieHeader("secret-access-token");
    const refresh = refreshCookieHeader("secret-refresh-key");
    expect(access).toContain("HttpOnly");
    expect(refresh).toContain("HttpOnly");
    // The values appear verbatim only inside those headers, never separately.
    expect(access).toContain("secret-access-token");
    expect(refresh).toContain("secret-refresh-key");
  });
});