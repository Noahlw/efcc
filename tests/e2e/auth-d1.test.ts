import { expect, test } from "@playwright/test";

const TEST_USERNAME = process.env.AUTH_TEST_USERNAME;
const TEST_CREDENTIAL = process.env.AUTH_TEST_CREDENTIAL;
const LEGACY_USERNAME = process.env.AUTH_LEGACY_USERNAME;
const LEGACY_PIN = process.env.AUTH_LEGACY_PIN;
const NEW_CREDENTIAL = process.env.AUTH_NEW_CREDENTIAL;

function originFor(baseURL: string | undefined): string {
  if (!baseURL) {
    throw new Error("AUTH_TARGET_URL is required");
  }
  return new URL(baseURL).origin;
}

function setCookieHeaders(response: {
  headersArray(): Array<{ name: string; value: string }>;
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
    ["AUTH_LEGACY_USERNAME", LEGACY_USERNAME],
    ["AUTH_LEGACY_PIN", LEGACY_PIN],
    ["AUTH_NEW_CREDENTIAL", NEW_CREDENTIAL],
  ]) {
    if (!value) {
      throw new Error(`${name} is required`);
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
    assertLockedCookies(setCookieHeaders(login));
    assertNoTokenMaterial(await login.json());

    const logout = await request.post("/api/v1/auth/logout", {
      headers: { Origin: origin },
    });
    expect(logout.status()).toBe(204);
    assertClearedCookies(setCookieHeaders(logout));
  });

  test("legacy account upgrade verifies the PIN before issuing cookies", async ({
    request,
    baseURL,
  }) => {
    const origin = originFor(baseURL);
    const upgrade = await request.post("/api/v1/auth/upgrade", {
      headers: { Origin: origin },
      data: {
        username: LEGACY_USERNAME,
        legacyPin: LEGACY_PIN,
        newCredential: NEW_CREDENTIAL,
      },
    });

    expect(upgrade.status()).toBe(200);
    assertLockedCookies(setCookieHeaders(upgrade));
    assertNoTokenMaterial(await upgrade.json());

    const logout = await request.post("/api/v1/auth/logout", {
      headers: { Origin: origin },
    });
    expect(logout.status()).toBe(204);
    assertClearedCookies(setCookieHeaders(logout));
  });
});
