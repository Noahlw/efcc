import assert from "node:assert/strict";

// Worker tests for CF0-01 (issue #142) + CF1-01 (issue #151).
// Run inside the real `workerd` runtime via @cloudflare/vitest-pool-workers.
//
// Pattern: import the Worker's default export directly and call
// worker.fetch(request, env, ctx). `env` comes from `cloudflare:workers`.
// Outbound `fetch` from the Worker is mocked by replacing globalThis.fetch.
//
// CF1-01 (#151): the Worker no longer forwards raw browser headers.
// Instead it constructs a signed service envelope with HMAC-SHA-256.
// Tests assert the envelope shape and that browser headers are NOT
// forwarded as raw upstream headers.
//
// No PINs, session tokens, or QR values appear in any assertion or
// fixture here - the verification requirement in #142.
import { env } from "cloudflare:workers";
import { describe, test } from "vitest";

import worker from "./worker";
import type { Env } from "./worker";

const UPSTREAM_URL = "https://script.google.com/macros/s/fake/exec";
const ORIGIN = "https://efcc.example";
const SERVICE_SECRET = "efcc-test-secret-2026";

/** Build a test Env with the upstream URL set; ASSETS comes from `env`. */
function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...(env as unknown as Env),
    APPS_SCRIPT_EXEC_URL: UPSTREAM_URL,
    EFCC_SERVICE_SECRET: SERVICE_SECRET,
    ...overrides,
  };
}

/** Parse a JSON response body as a typed value for assertions. */
async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
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

function captureUpstream(
  respond: (req: FetchCall) => {
    status: number;
    body: string;
    headers?: Record<string, string>;
  }
) {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const body = init?.body ? String(init.body) : "";
    const reqHeaders: Record<string, string> = {};
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        for (const [k, v] of init.headers.entries()) {
          reqHeaders[k] = v;
        }
      } else if (Array.isArray(init.headers)) {
        for (const [k, v] of init.headers) {
          reqHeaders[k] = v;
        }
      } else {
        for (const [k, v] of Object.entries(init.headers)) {
          reqHeaders[k] = String(v);
        }
      }
    }
    const call: FetchCall = {
      url: req.url,
      method: req.method,
      headers: reqHeaders,
      body,
    };
    calls.push(call);
    const { status, body: respBody, headers } = respond(call);
    return Promise.resolve(new Response(respBody, { status, headers }));
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

describe("Worker: non-/api paths", () => {
  test("falls through to ASSETS binding for non-/api paths", async () => {
    const res = await worker.fetch(
      makeRequest("/some-page", { method: "GET" }),
      testEnv()
    );
    assert.ok(res.status !== 500, "non-/api path must not 500");
  });
});

describe("Worker: method handling", () => {
  test("OPTIONS returns 204 with CORS headers including Idempotency-Key", async () => {
    const res = await worker.fetch(
      makeRequest("/api/v1/rpc", { method: "OPTIONS" }),
      testEnv()
    );
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
    assert.ok(
      res.headers
        .get("Access-Control-Allow-Headers")
        ?.includes("Idempotency-Key"),
      "preflight must allow Idempotency-Key"
    );
    assert.ok(
      res.headers
        .get("Access-Control-Allow-Headers")
        ?.includes("Authorization"),
      "preflight must allow Authorization"
    );
    assert.ok(
      res.headers
        .get("Access-Control-Allow-Headers")
        ?.includes("X-Efcc-Session-Id"),
      "preflight must allow X-Efcc-Session-Id"
    );
  });

  test("GET is rejected with 405 METHOD_NOT_ALLOWED", async () => {
    const res = await worker.fetch(
      makeRequest("/api/v1/rpc", { method: "GET" }),
      testEnv()
    );
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("Content-Type"), "application/problem+json");
    const body = await json<{ code: string }>(res);
    assert.equal(body.code, "METHOD_NOT_ALLOWED");
  });
});

describe("Worker: CF1-01 signed service envelope", () => {
  test("upstream receives a signed envelope, not raw browser headers", async () => {
    const upstream = captureUpstream(() => ({
      status: 200,
      body: JSON.stringify({ success: true, requestId: "r-1", data: {} }),
    }));
    try {
      await worker.fetch(
        makeRequest("/api/v1/rpc", {
          headers: {
            Authorization: "Bearer token-xyz",
            "X-Efcc-Session-Id": "sess-123",
            "Idempotency-Key": "idem-456",
          },
          body: { action: "restoreApp", params: { userId: "U-1" } },
        }),
        testEnv()
      );
      assert.equal(upstream.calls.length, 1, "one upstream call");
      const fwd = upstream.calls[0].headers;
      // Only Content-Type is forwarded; no raw browser headers.
      assert.equal(fwd["Content-Type"], "application/json");
      assert.equal(
        fwd.Authorization,
        undefined,
        "Authorization must NOT be forwarded as raw header"
      );
      assert.equal(
        fwd["X-Efcc-Session-Id"],
        undefined,
        "X-Efcc-Session-Id must NOT be forwarded as raw header"
      );
      assert.equal(
        fwd["Idempotency-Key"],
        undefined,
        "Idempotency-Key must NOT be forwarded as raw header"
      );
      assert.equal(
        fwd.Origin,
        undefined,
        "browser Origin must NOT be forwarded"
      );
      // The body is a signed envelope.
      const envelope = JSON.parse(upstream.calls[0].body);
      assert.equal(envelope.version, 1);
      assert.equal(envelope.keyId, "k1");
      assert.equal(typeof envelope.signature, "string");
      assert.equal(envelope.signature.length, 64);
      assert.equal(envelope.request.action, "restoreApp");
      assert.equal(envelope.request.params.userId, "U-1");
      assert.equal(envelope.request.sessionId, "sess-123");
      assert.equal(envelope.request.authorization, "Bearer token-xyz");
      assert.equal(
        envelope.request.idempotencyKey,
        "idem-456",
        "Idempotency-Key must be carried through the envelope (ADR-0018 §8)"
      );
    } finally {
      upstream.restore();
    }
  });

  test("missing EFCC_SERVICE_SECRET returns 503 PROXY_MISCONFIGURED", async () => {
    const upstream = captureUpstream(() => ({
      status: 200,
      body: JSON.stringify({ success: true, requestId: "r-1", data: {} }),
    }));
    try {
      const res = await worker.fetch(
        makeRequest("/api/v1/rpc", {
          body: { action: "restoreApp", params: {} },
        }),
        testEnv({ EFCC_SERVICE_SECRET: undefined })
      );
      assert.equal(res.status, 503);
      const body = await json<{ code: string }>(res);
      assert.equal(body.code, "PROXY_MISCONFIGURED");
    } finally {
      upstream.restore();
    }
  });

  test("malformed JSON body returns 400 VALIDATION", async () => {
    const upstream = captureUpstream(() => ({
      status: 200,
      body: JSON.stringify({ success: true, requestId: "r-1", data: {} }),
    }));
    try {
      const res = await worker.fetch(
        new Request("https://efcc.example/api/v1/rpc", {
          method: "POST",
          headers: { Origin: ORIGIN, "Content-Type": "application/json" },
          body: "not json",
        }),
        testEnv()
      );
      assert.equal(res.status, 400);
      const body = await json<{ code: string }>(res);
      assert.equal(body.code, "VALIDATION");
    } finally {
      upstream.restore();
    }
  });

  test("JSON null body returns structured 400 VALIDATION", async () => {
    const upstream = captureUpstream(() => ({
      status: 200,
      body: JSON.stringify({ success: true, requestId: "r-1", data: {} }),
    }));
    try {
      const res = await worker.fetch(
        makeRequest("/api/v1/rpc", { body: null }),
        testEnv()
      );
      assert.equal(res.status, 400);
      assert.equal(res.headers.get("Content-Type"), "application/problem+json");
      const body = await json<{ code: string }>(res);
      assert.equal(body.code, "VALIDATION");
      assert.equal(
        upstream.calls.length,
        0,
        "invalid body must not reach upstream"
      );
    } finally {
      upstream.restore();
    }
  });

  test("rejects browser-supplied sessionToken in action params", async () => {
    const upstream = captureUpstream(() => ({
      status: 200,
      body: JSON.stringify({ success: true, requestId: "r-1", data: {} }),
    }));
    try {
      const res = await worker.fetch(
        makeRequest("/api/v1/rpc", {
          headers: {
            Authorization: "Bearer header-authority",
            "X-Efcc-Session-Id": "sess-header-authority",
          },
          body: {
            action: "restoreApp",
            params: { userId: "U-1", sessionToken: "body-credential" },
          },
        }),
        testEnv()
      );
      assert.equal(res.status, 400);
      const body = await json<{ code: string }>(res);
      assert.equal(body.code, "VALIDATION");
      assert.equal(
        upstream.calls.length,
        0,
        "credential-bearing params must not be signed"
      );
    } finally {
      upstream.restore();
    }
  });

  test("missing action field returns 400 VALIDATION", async () => {
    const upstream = captureUpstream(() => ({
      status: 200,
      body: JSON.stringify({ success: true, requestId: "r-1", data: {} }),
    }));
    try {
      const res = await worker.fetch(
        makeRequest("/api/v1/rpc", {
          body: { params: {} },
        }),
        testEnv()
      );
      assert.equal(res.status, 400);
      const body = await json<{ code: string }>(res);
      assert.equal(body.code, "VALIDATION");
    } finally {
      upstream.restore();
    }
  });

  test("explicit params:null is rejected with 400 VALIDATION", async () => {
    const upstream = captureUpstream(() => ({
      status: 200,
      body: JSON.stringify({ success: true, requestId: "r-1", data: {} }),
    }));
    try {
      const res = await worker.fetch(
        makeRequest("/api/v1/rpc", {
          body: { action: "restoreApp", params: null },
        }),
        testEnv()
      );
      assert.equal(res.status, 400);
      assert.equal(res.headers.get("Content-Type"), "application/problem+json");
      const body = await json<{ code: string }>(res);
      assert.equal(body.code, "VALIDATION");
      assert.equal(upstream.calls.length, 0, "null params must not be signed");
    } finally {
      upstream.restore();
    }
  });
});

describe("Worker: status remap (ADR-0018 §5 load-bearing)", () => {
  test("remaps body status 401 onto outer HTTP 401 and sets application/problem+json", async () => {
    const upstream = captureUpstream(() => ({
      status: 200,
      body: JSON.stringify({
        status: 401,
        code: "AUTH_REQUIRED",
        title: "AUTH_REQUIRED",
        detail: "工作階段已過期",
        requestId: "r-401",
      }),
    }));
    try {
      const res = await worker.fetch(
        makeRequest("/api/v1/rpc", {
          body: { action: "restoreApp", params: {} },
        }),
        testEnv()
      );
      assert.equal(res.status, 401, "outer status must be remapped from body");
      assert.equal(res.headers.get("Content-Type"), "application/problem+json");
      const body = await json<{ code: string; status: number }>(res);
      assert.equal(body.code, "AUTH_REQUIRED");
      assert.equal(body.status, 401);
    } finally {
      upstream.restore();
    }
  });

  test("success body keeps outer 200 and application/json", async () => {
    const upstream = captureUpstream(() => ({
      status: 200,
      body: JSON.stringify({
        success: true,
        requestId: "r-ok",
        data: { authorized: true },
      }),
    }));
    try {
      const res = await worker.fetch(
        makeRequest("/api/v1/rpc", {
          body: { action: "authorizedNavigate", params: {} },
        }),
        testEnv()
      );
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("Content-Type"), "application/json");
    } finally {
      upstream.restore();
    }
  });

  test("non-JSON upstream response falls through with upstream status (safe)", async () => {
    const upstream = captureUpstream(() => ({
      status: 200,
      body: "<html>not json</html>",
    }));
    try {
      const res = await worker.fetch(
        makeRequest("/api/v1/rpc", {
          body: { action: "restoreApp", params: {} },
        }),
        testEnv()
      );
      assert.equal(res.status, 200);
    } finally {
      upstream.restore();
    }
  });
});

describe("Worker: correlation (ADR-0018 §8)", () => {
  test("surfaces upstream requestId as X-Request-Id response header", async () => {
    const upstream = captureUpstream(() => ({
      status: 200,
      body: JSON.stringify({
        success: true,
        requestId: "upstream-req-1",
        data: {},
      }),
    }));
    try {
      const res = await worker.fetch(
        makeRequest("/api/v1/rpc", {
          body: { action: "restoreApp", params: {} },
        }),
        testEnv()
      );
      assert.equal(res.headers.get("X-Request-Id"), "upstream-req-1");
    } finally {
      upstream.restore();
    }
  });

  test("generates an X-Request-Id when upstream body has none", async () => {
    const upstream = captureUpstream(() => ({
      status: 200,
      body: JSON.stringify({ success: true, data: {} }),
    }));
    try {
      const res = await worker.fetch(
        makeRequest("/api/v1/rpc", {
          body: { action: "restoreApp", params: {} },
        }),
        testEnv()
      );
      const rid = res.headers.get("X-Request-Id");
      assert.ok(rid && rid.length > 0, "must generate a fallback X-Request-Id");
    } finally {
      upstream.restore();
    }
  });
});

describe("Worker: upstream failure mapping", () => {
  test("fetch throw becomes 502 UPSTREAM_UNREACHABLE problem", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    try {
      const res = await worker.fetch(
        makeRequest("/api/v1/rpc", {
          body: { action: "restoreApp", params: {} },
        }),
        testEnv()
      );
      assert.equal(res.status, 502);
      assert.equal(res.headers.get("Content-Type"), "application/problem+json");
      const body = await json<{ code: string }>(res);
      assert.equal(body.code, "UPSTREAM_UNREACHABLE");
    } finally {
      globalThis.fetch = original;
    }
  });

  test("missing APPS_SCRIPT_EXEC_URL returns 500 PROXY_MISCONFIGURED", async () => {
    const res = await worker.fetch(
      makeRequest("/api/v1/rpc", {
        body: { action: "restoreApp", params: {} },
      }),
      testEnv({ APPS_SCRIPT_EXEC_URL: "" })
    );
    assert.equal(res.status, 500);
    const body = await json<{ code: string }>(res);
    assert.equal(body.code, "PROXY_MISCONFIGURED");
  });
});

describe("Worker: fail-closed rate limiter (ADR-0018 §9)", () => {
  test("missing RPC_RATE_LIMITER binding with session identity returns 503 UNAVAILABLE", async () => {
    const res = await worker.fetch(
      makeRequest("/api/v1/rpc", {
        headers: { "X-Efcc-Session-Id": "sess-fail-closed" },
        body: { action: "restoreApp", params: {} },
      }),
      testEnv({ RPC_RATE_LIMITER: undefined })
    );
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("Content-Type"), "application/problem+json");
    const body = await json<{ code: string; detail: string }>(res);
    assert.equal(body.code, "UNAVAILABLE");
    assert.equal(body.detail, "系統暫時無法處理請求，請稍後再試。");
  });

  test("RPC_RATE_LIMITER.limit() throw with session identity returns 503 UNAVAILABLE", async () => {
    const throwingLimiter = {
      limit: () => {
        throw new Error("ratelimit backend down");
      },
    } as unknown as Env["RPC_RATE_LIMITER"];
    const res = await worker.fetch(
      makeRequest("/api/v1/rpc", {
        headers: { "X-Efcc-Session-Id": "sess-throwing" },
        body: { action: "restoreApp", params: {} },
      }),
      testEnv({ RPC_RATE_LIMITER: throwingLimiter })
    );
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("Content-Type"), "application/problem+json");
    const body = await json<{ code: string; detail: string }>(res);
    assert.equal(body.code, "UNAVAILABLE");
    assert.equal(body.detail, "系統暫時無法處理請求，請稍後再試。");
  });
});
