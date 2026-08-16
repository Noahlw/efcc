import assert from "node:assert/strict";

// Worker tests for CF0-01 (issue #142). Run inside the real `workerd`
// runtime via @cloudflare/vitest-pool-workers.
//
// Pattern (per Cloudflare's "write your first test" guide): import the
// Worker's default export directly and call worker.fetch(request, env, ctx).
// `env` comes from `cloudflare:workers` so the test sees the real bindings
// (ASSETS, RateLimit) declared in wrangler.jsonc.
//
// No PINs, session tokens, or QR values appear in any assertion or
// fixture here - the verification requirement in #142.
import { env } from "cloudflare:workers";
import { describe, test, vi } from "vitest";

import type * as Handlers from "./lib/auth/handlers";
import worker from "./worker";
import type { Env } from "./worker";

// T3: stub a single auth handler to throw so the Worker's new outer RFC9457
// catch is exercised. The rest of the module stays real.
vi.mock(import("./lib/auth/handlers"), async (importOriginal) => {
  const actual = await importOriginal<typeof Handlers>();
  return {
    ...actual,
    handleMe: vi.fn<() => Promise<Response>>().mockRejectedValue(new Error("boom")),
  };
});

const ORIGIN = "https://efcc.example";

/** Build a test Env; ASSETS comes from `env`. */
function testEnv(overrides: Partial<Env> = {}): Env {
  // `env` is typed as Cloudflare.Env (a loose record); at runtime the
  // bindings declared in wrangler.jsonc are present. Cast to our Env.
  return {
    ...(env as unknown as Env),
    ...overrides,
  };
}

/** Parse a JSON response body as a typed value for assertions. */
async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

function makeRequest(
  path: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {}
): Request {
  return new Request(`https://efcc.example${path}`, {
    method: init.method ?? "POST",
    headers: { Origin: ORIGIN, ...init.headers },
    body:
      init.body === undefined
        ? undefined
        : typeof init.body === "string"
          ? init.body
          : JSON.stringify(init.body),
  });
}

describe("Worker: non-/api paths", () => {
  test("falls through to ASSETS binding for non-/api paths", async () => {
    const res = await worker.fetch(
      makeRequest("/some-page", { method: "GET" }),
      testEnv()
    );
    // ASSETS binding in test returns whatever the static-asset fetcher does;
    // we only assert the Worker did not 500 and delegated (no /api prefix).
    assert.ok(res.status !== 500, "non-/api path must not 500");
  });
});

describe("Worker: RFC9457 outer error envelope (unhandled auth-route errors)", () => {
  test("a throwing handler returns 500 application/problem+json with X-Request-Id", async () => {
    const res = await worker.fetch(
      makeRequest("/api/v1/auth/me", {
        method: "GET",
        headers: {
          Cookie: `efcc_access=abc; efcc_refresh=def`,
        },
      }),
      testEnv({ EFCC_ACCESS_TOKEN_SECRET: "test-secret" })
    );
    assert.equal(res.status, 500);
    assert.match(
      res.headers.get("Content-Type") ?? "",
      /application\/problem\+json/u
    );
    assert.ok(res.headers.get("X-Request-Id"), "X-Request-Id must be present");
    const body = await json<{
      type: string;
      status: number;
      code: string;
      detail: string;
    }>(res);
    assert.ok(
      body.type.includes("#INTERNAL_ERROR"),
      "type must reference #INTERNAL_ERROR"
    );
    assert.equal(body.code, "INTERNAL_ERROR");
    assert.equal(body.detail, "Internal server error.");
    assert.equal(body.status, 500);
  });
});
