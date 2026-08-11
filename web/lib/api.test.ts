// Client contract tests for web/lib/api.ts (issue #142 / AUTH-04 #162).
//
// Strategy: stub globalThis.fetch to assert the EXACT wire shape (method,
// URL, headers, body) leaving the browser, and the envelope/error/retry
// behavior on the response. Per Spec 074's testing decisions, stubbing
// fetch here is legitimate because these tests assert the client's own
// contract construction, not the Worker's proxy behavior (covered by
// worker.test.ts in workerd). MSW is reserved for the component seam.
//
// No PINs, password, session tokens, or QR values appear in any fixture -
// the verification requirement in #142 / #164. Sessions use opaque
// placeholder strings that carry no real credential.
import assert from "node:assert/strict";

import { describe, test } from "vitest";

import {
  authChangePassword,
  authChangeUsername,
  authLogin,
  authLogout,
  authMe,
  authRefresh,
} from "./api";
import type { LoginResult, PublicUser, RpcError } from "./api";

// ---------------------------------------------------------------------------
// Fixtures - opaque placeholders, never real credentials.
// ---------------------------------------------------------------------------

const LOGIN_RESULT: LoginResult = {
  userId: "U-test",
  name: "測試",
  role: "Member",
  status: "Active",
  mustSetNewCredential: false,
};

const LOGIN_UPGRADE: LoginResult = {
  userId: "U-test",
  name: "測試",
  role: "Member",
  status: "Active",
  mustSetNewCredential: true,
};

const PUBLIC_USER: PublicUser = {
  userId: "U-test",
  name: "測試",
  username: "test",
  phone: "00000000",
  role: "Member",
  status: "Active",
  qrCodeString: "qr-placeholder",
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
// AUTH-04 cookie surface: wire shape (no headers, no idempotency, no secrets)
// ---------------------------------------------------------------------------

describe("api.ts: AUTH-04 cookie surface", () => {
  test("authLogin POSTs {username,password} to /api/v1/auth/login with no auth header and a fresh Idempotency-Key", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(200, { requestId: "r-1", data: LOGIN_RESULT })
    );
    try {
      const result = await authLogin("test", "s3cret");
      assert.deepEqual(result, LOGIN_RESULT);
      const [call] = fetchMock.calls;
      assert.equal(call.method, "POST");
      assert.equal(call.url, "/api/v1/auth/login");
      assert.equal(call.headers.Authorization, undefined);
      assert.equal(call.headers["X-Efcc-Session-Id"], undefined);
      assert.ok(
        call.headers["Idempotency-Key"],
        "login carries an Idempotency-Key"
      );
      const body = JSON.parse(call.body);
      assert.equal(body.username, "test");
      assert.equal(body.password, "s3cret");
      // Credentials must never appear in the URL.
      assert.ok(!call.url.includes("s3cret"), "no password in URL");
    } finally {
      fetchMock.restore();
    }
  });
  test("authLogin parses the {requestId,data} auth envelope (no success flag)", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(200, { requestId: "r-1", data: LOGIN_RESULT })
    );
    try {
      const result = await authLogin("test", "s3cret");
      assert.deepEqual(result, LOGIN_RESULT);
      assert.equal(fetchMock.calls.length, 1);
    } finally {
      fetchMock.restore();
    }
  });

  test("authLogin surfaces mustSetNewCredential for a legacy account", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(200, { requestId: "r-1", data: LOGIN_UPGRADE })
    );
    try {
      const result = await authLogin("legacy", "pin");
      assert.equal(result.mustSetNewCredential, true);
      assert.equal(result.userId, "U-test");
    } finally {
      fetchMock.restore();
    }
  });

  test("authLogin malformed success envelope becomes safe RpcError (no body leak)", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(200, { not: "an auth envelope" })
    );
    try {
      await assert.rejects(
        () => authLogin("test", "s3cret"),
        (err: RpcError) => {
          assert.equal(err.name, "RpcError");
          assert.equal(err.problem.code, "MALFORMED_RESPONSE");
          assert.ok(!err.message.includes("an auth envelope"), "no body leak");
          return true;
        }
      );
    } finally {
      fetchMock.restore();
    }
  });

  test("authLogin non-JSON success response becomes safe RpcError", async () => {
    const fetchMock = installFetch(
      () =>
        new Response("<html>oops</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        })
    );
    try {
      await assert.rejects(
        () => authLogin("test", "s3cret"),
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

  test("authLogin 401 AUTH_REQUIRED preserves code/status/requestId (invalid credentials)", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(
        401,
        {
          status: 401,
          code: "AUTH_REQUIRED",
          title: "Unauthorized",
          detail: "用戶名稱或密碼不正確。",
          requestId: "r-401",
        },
        { "X-Request-Id": "r-401" }
      )
    );
    try {
      await assert.rejects(
        () => authLogin("bad", "wrong"),
        (err: RpcError) => {
          assert.equal(err.problem.code, "AUTH_REQUIRED");
          assert.equal(err.problem.status, 401);
          assert.equal(err.problem.requestId, "r-401");
          return true;
        }
      );
    } finally {
      fetchMock.restore();
    }
  });

  test("authLogin 403 FORBIDDEN (inactive account) surfaces FORBIDDEN", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(403, {
        status: 403,
        code: "FORBIDDEN",
        title: "Forbidden",
        detail: "Account is not active.",
        requestId: "r-403",
      })
    );
    try {
      await assert.rejects(
        () => authLogin("pending", "s3cret"),
        (err: RpcError) => {
          assert.equal(err.problem.code, "FORBIDDEN");
          assert.equal(err.problem.status, 403);
          return true;
        }
      );
    } finally {
      fetchMock.restore();
    }
  });

  test("authLogin never retries, even on a retryable 503 (login is not idempotent)", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(503, { status: 503, code: "UNAVAILABLE" })
    );
    try {
      await assert.rejects(() => authLogin("test", "s3cret"));
      assert.equal(fetchMock.calls.length, 1, "login must not auto-retry");
    } finally {
      fetchMock.restore();
    }
  });

  test("authLogin network failure surfaces safe NETWORK_ERROR", async () => {
    const fetchMock = installFetch(() => {
      throw new Error("ECONNREFUSED");
    });
    try {
      await assert.rejects(
        () => authLogin("test", "s3cret"),
        (err: RpcError) => {
          assert.equal(err.problem.code, "NETWORK_ERROR");
          return true;
        }
      );
    } finally {
      fetchMock.restore();
    }
  });

  test("authRefresh POSTs /api/v1/auth/refresh with no body, no auth header", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(200, { requestId: "r-refresh", data: {} })
    );
    try {
      await authRefresh();
      const [call] = fetchMock.calls;
      assert.equal(call.method, "POST");
      assert.equal(call.url, "/api/v1/auth/refresh");
      assert.equal(
        call.body,
        "",
        "refresh sends no body (identity from cookie)"
      );
      assert.equal(call.headers.Authorization, undefined);
      assert.equal(call.headers["X-Efcc-Session-Id"], undefined);
    } finally {
      fetchMock.restore();
    }
  });

  test("authRefresh 401 AUTH_REQUIRED surfaces expired/revoked refresh", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(401, {
        status: 401,
        code: "AUTH_REQUIRED",
        title: "Unauthorized",
        detail: "Refresh cookie missing.",
        requestId: "r-401",
      })
    );
    try {
      await assert.rejects(
        () => authRefresh(),
        (err: RpcError) => {
          assert.equal(err.problem.code, "AUTH_REQUIRED");
          return true;
        }
      );
    } finally {
      fetchMock.restore();
    }
  });

  test("authLogout POSTs /api/v1/auth/logout and returns on 204 (no body)", async () => {
    const fetchMock = installFetch(
      () =>
        new Response(null, {
          status: 204,
          headers: { "X-Request-Id": "r-logout" },
        })
    );
    try {
      await authLogout();
      const [call] = fetchMock.calls;
      assert.equal(call.method, "POST");
      assert.equal(call.url, "/api/v1/auth/logout");
      assert.equal(call.headers.Authorization, undefined);
    } finally {
      fetchMock.restore();
    }
  });

  test("authMe GETs /api/v1/auth/me and returns the user + server-authorized sections (S15)", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(200, {
        requestId: "r-me",
        data: { user: PUBLIC_USER, sections: [{ key: "profile" }] },
      })
    );
    try {
      const me = await authMe();
      assert.deepEqual(me.user, PUBLIC_USER);
      assert.deepEqual(me.sections, [{ key: "profile" }]);
      const [call] = fetchMock.calls;
      assert.equal(call.method, "GET");
      assert.equal(call.url, "/api/v1/auth/me");
      assert.equal(call.headers.Authorization, undefined);
      assert.ok(!call.url.includes("qr-placeholder"), "no QR in URL");
    } finally {
      fetchMock.restore();
    }
  });

  test("authMe 401 AUTH_REQUIRED surfaces missing/expired access cookie", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(401, {
        status: 401,
        code: "AUTH_REQUIRED",
        title: "Unauthorized",
        detail: "Access cookie missing.",
        requestId: "r-401",
      })
    );
    try {
      await assert.rejects(
        () => authMe(),
        (err: RpcError) => {
          assert.equal(err.problem.code, "AUTH_REQUIRED");
          return true;
        }
      );
    } finally {
      fetchMock.restore();
    }
  });
});

describe("api.ts: Idempotency-Key on mutating auth calls (ADR-0018 §8)", () => {
  test("authLogin sends a fresh non-empty Idempotency-Key on every call", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(200, { requestId: "r-1", data: LOGIN_RESULT })
    );
    try {
      await authLogin("test", "s3cret");
      await authLogin("test", "s3cret");
      assert.equal(fetchMock.calls.length, 2);
      const [first, second] = fetchMock.calls;
      assert.ok(first.headers["Idempotency-Key"], "login sends a key");
      assert.ok(second.headers["Idempotency-Key"], "login sends a key");
      assert.notEqual(
        first.headers["Idempotency-Key"],
        second.headers["Idempotency-Key"],
        "each call mints a fresh key"
      );
    } finally {
      fetchMock.restore();
    }
  });

  test("authLogout sends an Idempotency-Key", async () => {
    const fetchMock = installFetch(
      () =>
        new Response(null, {
          status: 204,
          headers: { "X-Request-Id": "r-logout" },
        })
    );
    try {
      await authLogout();
      assert.ok(fetchMock.calls[0].headers["Idempotency-Key"]);
    } finally {
      fetchMock.restore();
    }
  });

  test("authChangeUsername and authChangePassword send an Idempotency-Key", async () => {
    const fetchMock = installFetch((call) =>
      call.url.includes("/password")
        ? makeResponse(200, {
            requestId: "r-1",
            data: { sessionRevoked: true },
          })
        : makeResponse(200, {
            requestId: "r-1",
            data: { username: "newname", sessionRevoked: true },
          })
    );
    try {
      await authChangeUsername("newname");
      await authChangePassword("old-secret", "new-secret-88");
      assert.equal(fetchMock.calls.length, 2);
      assert.ok(fetchMock.calls[0].headers["Idempotency-Key"]);
      assert.ok(fetchMock.calls[1].headers["Idempotency-Key"]);
    } finally {
      fetchMock.restore();
    }
  });

  test("authMe (read) sends no Idempotency-Key", async () => {
    const fetchMock = installFetch(() =>
      makeResponse(200, {
        requestId: "r-me",
        data: { user: PUBLIC_USER, sections: [] },
      })
    );
    try {
      await authMe();
      assert.equal(fetchMock.calls[0].headers["Idempotency-Key"], undefined);
    } finally {
      fetchMock.restore();
    }
  });
});
