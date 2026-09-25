/* oxlint-disable vitest/prefer-importing-vitest-globals */
import { expect, test } from "@playwright/test";

import { DEV_ADMIN } from "./dev-fixtures";

const localTarget = (() => {
  const target = process.env.AUTH_TARGET_URL;
  if (!target) {
    return true;
  }
  try {
    const { hostname } = new URL(target);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
})();

const TEST_USERNAME =
  process.env.AUTH_TEST_USERNAME ??
  (localTarget ? DEV_ADMIN.username : undefined);
const TEST_CREDENTIAL =
  process.env.AUTH_TEST_CREDENTIAL ??
  (localTarget ? DEV_ADMIN.credential : undefined);
function originFor(baseURL: string | undefined): string {
  if (!baseURL) {
    throw new Error("AUTH_TARGET_URL is required");
  }
  return new URL(baseURL).origin;
}

function setCookieHeaders(response: {
  headersArray: () => { name: string; value: string }[];
}): string[] {
  return response
    .headersArray()
    .filter(({ name }) => name.toLowerCase() === "set-cookie")
    .map(({ value }) => value);
}

function assertLockedCookies(headers: string[]): void {
  expect(headers.map((header) => header.split("=", 1)[0]).sort()).toEqual([
    "efcc_access",
    "efcc_refresh",
  ]);
  expect(
    headers.every(
      (header) =>
        /; HttpOnly/iu.test(header) &&
        /; Secure/iu.test(header) &&
        /; SameSite=Strict/iu.test(header) &&
        /; Path=\//iu.test(header)
    )
  ).toBe(true);
}

function assertClearedCookies(headers: string[]): void {
  expect(headers.map((header) => header.split("=", 1)[0]).sort()).toEqual([
    "efcc_access",
    "efcc_refresh",
  ]);
  expect(headers.every((header) => /Max-Age=0|Expires=/iu.test(header))).toBe(
    true
  );
}

function assertNoTokenMaterial(body: unknown): void {
  expect(
    /sessionId|accessToken|refreshToken|sessionToken|session_id|access_token|refresh_token/iu.test(
      JSON.stringify(body)
    )
  ).toBe(false);
}

test.beforeAll(() => {
  for (const [name, value] of [
    ["AUTH_TEST_USERNAME", TEST_USERNAME],
    ["AUTH_TEST_CREDENTIAL", TEST_CREDENTIAL],
  ]) {
    if (!value) {
      throw new Error(`${name} is required`);
    }
  }
  for (const [name, value] of [["AUTH_TEST_USERNAME", TEST_USERNAME]]) {
    if (typeof value !== "string" || !value.startsWith("E2E_")) {
      throw new Error(
        `${name} must start with E2E_; destructive auth runs require disposable fixtures`
      );
    }
  }
});

test.describe("D1 cookie-only login gate", () => {
  test("password login and logout use the locked cookie boundary", async ({
    request,
    baseURL,
  }) => {
    const origin = originFor(baseURL);
    const login = await request.post("/api/v1/auth/login", {
      headers: { Origin: origin },
      data: {
        username: TEST_USERNAME,
        password: TEST_CREDENTIAL,
      },
    });

    expect(login.status()).toBe(200);
    const loginCookies = setCookieHeaders(login);
    assertLockedCookies(loginCookies);
    assertNoTokenMaterial(await login.json());
    const cookieHeader = loginCookies
      .map((header) => header.split(";", 1)[0])
      .join("; ");
    const me = await request.get("/api/v1/auth/me", {
      headers: { Origin: origin, Cookie: cookieHeader },
    });
    expect(me.status()).toBe(200);
    const meBody = await me.json();
    assertNoTokenMaterial(meBody);
    expect(meBody).toHaveProperty("data.user");

    const logout = await request.post("/api/v1/auth/logout", {
      headers: { Origin: origin, Cookie: cookieHeader },
    });
    expect(logout.status()).toBe(204);
    assertClearedCookies(setCookieHeaders(logout));
  });
});
