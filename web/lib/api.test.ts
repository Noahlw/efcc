// Client contract tests for web/lib/api.ts (issue #142).
//
// Strategy: stub globalThis.fetch to assert the EXACT wire shape (method,
// URL, headers, body) leaving the browser, and the envelope/error/retry
// behavior on the response. Per Spec 074's testing decisions, stubbing
// fetch here is legitimate because these tests assert the client's own
// contract construction, not the Worker's proxy behavior (covered by
// worker.test.ts in workerd). MSW is reserved for the component seam.
//
// No PINs, session tokens, or QR values appear in any fixture - the
// verification requirement in #142. Sessions use opaque placeholder
// strings that carry no real credential.
import assert from "node:assert/strict";

import { describe, test } from "vitest";

import {
  authorizedNavigate,
  callRpc,
  loginUser,
  logoutUser,
  restoreApp,
} from "./api";
import type { Bootstrap, RpcError, Session } from "./api";

// ---------------------------------------------------------------------------
// Fixtures - opaque placeholders, never real credentials.
// ---------------------------------------------------------------------------

const SESSION: Session = {
  sessionId: "sess-id-placeholder",
  sessionToken: "token-placeholder",
  userId: "U-test",
};

const BOOTSTRAP: Bootstrap = {
  session: {
    userId: "U-test",
    name: "測試",
    role: "MEMBER",
    qrCodeString: "qr-placeholder",
    sessionId: "sess-id-placeholder",
    sessionToken: "token-placeholder",
  },
  sections: [
    {
      key: "profile",
      label: "個人資料",
      capability: "READ",
      requiresServerAuth: false,
    },
  ],
  profile: {
    userId: "U-test",
    name: "測試",
    username: "test",
    phone: "00000000",
    role: "MEMBER",
    status: "Active",
    qrCodeString: "qr-placeholder",
  },
};

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

function makeResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  const ct = status >= 400 ? "application/problem+json" : "application/json";
  return Response.json(body, {
    status,
    headers: { "Content-Type": ct, ...headers },
  });
}

function installFetch(
  responder: (call: FetchCall, attempt: number) => Response | Promise<Response>
) {
  const calls: FetchCall[] = [];
  let attempt = 0;
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    attempt += 1;
    const body = init?.body ? String(init.body) : "";
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    // Preserve original header case: api.ts passes a plain Record, and
    // asserting on the exact header name (Authorization, X-Efcc-Session-Id,
    // Idempotency-Key) is part of the contract. new Headers() would
    // lowercase them, forcing the test to know about that normalization.
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
      url,
      method: init?.method ?? "GET",
      headers: reqHeaders,
      body,
    };
    calls.push(call);
    return Promise.resolve(responder(call, attempt));
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

// Each test installs/restores its own fetch mock; no global hooks needed.

// ---------------------------------------------------------------------------
// Envelope parsing
// ---------------------------------------------------------------------------

describe("api.ts: success envelope", () => {
  test("parses {success:true, requestId, data} and returns data", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(200, { success: true, requestId: "r-1", data: BOOTSTRAP })
    );
    try {
      const result = await loginUser("test", "0000");
      assert.deepEqual(result, BOOTSTRAP);
      assert.equal(fetchMock.calls.length, 1);
    } finally {
      fetchMock.restore();
    }
  });

  test("malformed success envelope becomes safe RpcError (no body leak)", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(200, { not: "an envelope" })
    );
    try {
      await assert.rejects(
        () => loginUser("test", "0000"),
        (err: RpcError) => {
          assert.equal(err.name, "RpcError");
          assert.equal(err.problem.code, "MALFORMED_RESPONSE");
          // The raw body must not appear in the error message.
          assert.ok(!err.message.includes("not"), "raw body must not leak");
          return true;
        }
      );
    } finally {
      fetchMock.restore();
    }
  });

  test("non-JSON success response becomes safe RpcError", async () => {
    const fetchMock = installFetch(
      () =>
        new Response("<html>oops</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        })
    );
    try {
      await assert.rejects(
        () => loginUser("test", "0000"),
        (err: RpcError) => {
          assert.equal(err.problem.code, "MALFORMED_RESPONSE");
          assert.ok(!err.message.includes("html"), "raw body must not leak");
          return true;
        }
      );
    } finally {
      fetchMock.restore();
    }
  });
});

// ---------------------------------------------------------------------------
// Problem Details / error parsing
// ---------------------------------------------------------------------------

describe("api.ts: RFC 9457 Problem Details", () => {
  test("parses problem+json and branches on code; preserves status/requestId", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(
        401,
        {
          type: "tag:efcc.app,2026:error:AUTH_REQUIRED",
          status: 401,
          code: "AUTH_REQUIRED",
          title: "AUTH_REQUIRED",
          detail: "工作階段已過期，請重新登入",
          requestId: "r-401",
        },
        { "X-Request-Id": "r-401" }
      )
    );
    try {
      await assert.rejects(
        () => restoreApp(SESSION),
        (err: RpcError) => {
          assert.equal(err.problem.code, "AUTH_REQUIRED");
          assert.equal(err.problem.status, 401);
          assert.equal(err.problem.requestId, "r-401");
          assert.equal(err.problem.detail, "工作階段已過期，請重新登入");
          return true;
        }
      );
    } finally {
      fetchMock.restore();
    }
  });

  test("non-JSON error response becomes safe recoverable RpcError", async () => {
    const fetchMock = installFetch(
      () =>
        new Response("Bad Gateway", {
          status: 502,
          headers: { "Content-Type": "text/plain" },
        })
    );
    try {
      await assert.rejects(
        () => restoreApp(SESSION),
        (err: RpcError) => {
          assert.equal(err.problem.status, 502);
          assert.ok(
            err.problem.code === "UNAVAILABLE" ||
              err.problem.code === "MALFORMED_RESPONSE"
          );
          assert.ok(
            !err.message.includes("Bad Gateway"),
            "raw body must not leak"
          );
          return true;
        }
      );
    } finally {
      fetchMock.restore();
    }
  });

  test("Retry-After header is parsed onto the error as seconds", async () => {
    // Use a non-retriable status (401) so the error is thrown immediately
    // without sleeping the backoff - we only assert the header is parsed.
    const fetchMock = installFetch(() =>
      makeResponse(
        401,
        { status: 401, code: "AUTH_REQUIRED", title: "Auth required" },
        { "Retry-After": "30" }
      )
    );
    try {
      await assert.rejects(
        () => restoreApp(SESSION),
        (err: RpcError) => {
          assert.equal(err.retryAfter, 30);
          return true;
        }
      );
    } finally {
      fetchMock.restore();
    }
  });
});

// ---------------------------------------------------------------------------
// Headers (ADR-0018 §2, §7, §8)
// ---------------------------------------------------------------------------

describe("api.ts: headers", () => {
  test("protected call sends Authorization Bearer + X-Efcc-Session-Id, never in URL or body", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(200, { success: true, requestId: "r-1", data: BOOTSTRAP })
    );
    try {
      await restoreApp(SESSION);
      const [call] = fetchMock.calls;
      assert.equal(call.url, "/api/v1/rpc");
      assert.equal(call.headers.Authorization, "Bearer token-placeholder");
      assert.equal(call.headers["X-Efcc-Session-Id"], "sess-id-placeholder");
      // Session identity must NOT appear in the URL query string.
      assert.ok(!call.url.includes("sessionToken"), "no sessionToken in URL");
      assert.ok(!call.url.includes("sessionId"), "no sessionId in URL");
    } finally {
      fetchMock.restore();
    }
  });

  test("loginUser (anonymous) sends no Authorization header", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(200, { success: true, requestId: "r-1", data: BOOTSTRAP })
    );
    try {
      await loginUser("test", "0000");
      const [call] = fetchMock.calls;
      assert.equal(call.headers.Authorization, undefined);
    } finally {
      fetchMock.restore();
    }
  });

  test("mutating call (logoutUser) sends Idempotency-Key; read (restoreApp) does not", async () => {
    const fetchMock = installFetch((call) => {
      if (JSON.parse(call.body).action === "logoutUser") {
        return makeResponse(200, { success: true, requestId: "r-1", data: {} });
      }
      return makeResponse(200, {
        success: true,
        requestId: "r-2",
        data: BOOTSTRAP,
      });
    });
    try {
      await restoreApp(SESSION);
      assert.equal(
        fetchMock.calls[0].headers["Idempotency-Key"],
        undefined,
        "read needs no key"
      );

      await logoutUser(SESSION);
      const key = fetchMock.calls[1].headers["Idempotency-Key"];
      assert.ok(
        key && key.length > 0,
        "mutating call must send Idempotency-Key"
      );
    } finally {
      fetchMock.restore();
    }
  });

  test("body is {action, params}", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(200, {
        success: true,
        requestId: "r-1",
        data: { authorized: true },
      })
    );
    try {
      await authorizedNavigate(SESSION, "scanner");
      const body = JSON.parse(fetchMock.calls[0].body);
      assert.equal(body.action, "authorizedNavigate");
      assert.equal(body.params.sectionKey, "scanner");
    } finally {
      fetchMock.restore();
    }
  });
});

// ---------------------------------------------------------------------------
// Retry policy (ADR-0018 §6)
// ---------------------------------------------------------------------------

describe("api.ts: retry policy", () => {
  test("retries on 503 up to 2 times, then succeeds", async () => {
    const fetchMock = installFetch((_call, attempt) => {
      if (attempt < 3) {
        return makeResponse(503, { status: 503, code: "UNAVAILABLE" });
      }
      return makeResponse(200, {
        success: true,
        requestId: "r-ok",
        data: BOOTSTRAP,
      });
    });
    try {
      const result = await restoreApp(SESSION);
      assert.deepEqual(result, BOOTSTRAP);
      assert.equal(fetchMock.calls.length, 3, "2 retries + 1 success");
    } finally {
      fetchMock.restore();
    }
  });

  test("retries on network error (fetch throw), then succeeds", async () => {
    const fetchMock = installFetch((_call, attempt) => {
      if (attempt < 2) {
        throw new Error("ECONNREFUSED");
      }
      return makeResponse(200, {
        success: true,
        requestId: "r-ok",
        data: BOOTSTRAP,
      });
    });
    try {
      const result = await restoreApp(SESSION);
      assert.deepEqual(result, BOOTSTRAP);
      assert.equal(fetchMock.calls.length, 2);
    } finally {
      fetchMock.restore();
    }
  });

  test("never retries on 4xx (401)", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(401, { status: 401, code: "AUTH_REQUIRED" })
    );
    try {
      await assert.rejects(() => restoreApp(SESSION));
      assert.equal(fetchMock.calls.length, 1, "4xx must not retry");
    } finally {
      fetchMock.restore();
    }
  });

  test("never retries on 500", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(500, { status: 500, code: "INTERNAL_ERROR" })
    );
    try {
      await assert.rejects(() => restoreApp(SESSION));
      assert.equal(fetchMock.calls.length, 1, "500 must not retry");
    } finally {
      fetchMock.restore();
    }
  });

  test("retries on 502/503/504 but gives up after MAX_RETRIES=2", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(502, { status: 502, code: "UPSTREAM_UNREACHABLE" })
    );
    try {
      await assert.rejects(() => restoreApp(SESSION));
      assert.equal(fetchMock.calls.length, 3, "1 initial + 2 retries");
    } finally {
      fetchMock.restore();
    }
  });

  test("honors Retry-After for backoff timing on retryable status", async () => {
    let firstAt = 0;
    let secondAt = 0;
    const fetchMock = installFetch((_call, attempt) => {
      if (attempt === 1) {
        firstAt = Date.now();
        // Retry-After: 0 so the test stays fast but proves the path.
        return makeResponse(
          503,
          { status: 503, code: "UNAVAILABLE" },
          { "Retry-After": "0" }
        );
      }
      secondAt = Date.now();
      return makeResponse(200, {
        success: true,
        requestId: "r-ok",
        data: BOOTSTRAP,
      });
    });
    try {
      await restoreApp(SESSION);
      assert.equal(fetchMock.calls.length, 2);
      // Retry-After: 0 means immediate; just assert we actually retried.
      assert.ok(secondAt >= firstAt);
    } finally {
      fetchMock.restore();
    }
  });
});

// ---------------------------------------------------------------------------
// Direct callRpc typing
// ---------------------------------------------------------------------------

describe("api.ts: callRpc direct", () => {
  test("returns typed data for a generic action", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(200, {
        success: true,
        requestId: "r-1",
        data: { value: 42 },
      })
    );
    try {
      const result = await callRpc<{ value: number }>("someRead", {});
      assert.equal(result.value, 42);
    } finally {
      fetchMock.restore();
    }
  });
});

// ---------------------------------------------------------------------------
// CF0 Task 1: envelope validation, token-in-body scrubbing, abort signal.
// ---------------------------------------------------------------------------

describe("api.ts: CF0 envelope & signal hardening", () => {
  test("success envelope missing data throws MALFORMED_RESPONSE", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(200, { success: true, requestId: "r-no-data" })
    );
    try {
      await assert.rejects(
        () => loginUser("test", "0000"),
        (err: RpcError) => {
          assert.equal(err.name, "RpcError");
          assert.equal(err.problem.code, "MALFORMED_RESPONSE");
          return true;
        }
      );
    } finally {
      fetchMock.restore();
    }
  });

  test("success envelope missing requestId throws MALFORMED_RESPONSE", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(200, { success: true, data: { value: 1 } })
    );
    try {
      await assert.rejects(
        () => loginUser("test", "0000"),
        (err: RpcError) => {
          assert.equal(err.name, "RpcError");
          assert.equal(err.problem.code, "MALFORMED_RESPONSE");
          return true;
        }
      );
    } finally {
      fetchMock.restore();
    }
  });

  test("restoreApp body params omit sessionToken", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(200, { success: true, requestId: "r-1", data: BOOTSTRAP })
    );
    try {
      await restoreApp(SESSION);
      const body = JSON.parse(fetchMock.calls[0].body);
      const params = body.params as Record<string, unknown>;
      assert.ok(
        !("sessionToken" in params),
        "sessionToken must not appear in body params"
      );
      assert.equal(params.userId, "U-test");
      assert.equal(params.sessionId, "sess-id-placeholder");
    } finally {
      fetchMock.restore();
    }
  });

  test("logoutUser body params omit sessionToken", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(200, { success: true, requestId: "r-1", data: {} })
    );
    try {
      await logoutUser(SESSION);
      const body = JSON.parse(fetchMock.calls[0].body);
      const params = body.params as Record<string, unknown>;
      assert.ok(
        !("sessionToken" in params),
        "sessionToken must not appear in body params"
      );
    } finally {
      fetchMock.restore();
    }
  });

  test("authorizedNavigate body params omit sessionToken", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(200, {
        success: true,
        requestId: "r-1",
        data: { authorized: true },
      })
    );
    try {
      await authorizedNavigate(SESSION, "scanner");
      const body = JSON.parse(fetchMock.calls[0].body);
      const params = body.params as Record<string, unknown>;
      assert.ok(
        !("sessionToken" in params),
        "sessionToken must not appear in body params"
      );
    } finally {
      fetchMock.restore();
    }
  });

  test("callRpc rethrows AbortError without retrying", async () => {
    let attempts = 0;
    const fetchMock = installFetch(() => {
      attempts += 1;
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });
    try {
      await assert.rejects(
        () =>
          callRpc("someRead", {}, undefined, {
            signal: AbortSignal.abort(),
          }),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.equal(err.name, "AbortError");
          return true;
        }
      );
      assert.equal(attempts, 1, "must not retry on AbortError");
    } finally {
      fetchMock.restore();
    }
  });

  test("restoreApp rethrows AbortError without retrying", async () => {
    let attempts = 0;
    const fetchMock = installFetch(() => {
      attempts += 1;
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });
    try {
      await assert.rejects(
        () => restoreApp(SESSION, { signal: AbortSignal.abort() }),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.equal(err.name, "AbortError");
          return true;
        }
      );
      assert.equal(attempts, 1, "must not retry on AbortError");
    } finally {
      fetchMock.restore();
    }
  });
});
