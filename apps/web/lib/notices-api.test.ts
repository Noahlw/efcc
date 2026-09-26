import assert from "node:assert/strict";

import { test } from "vitest";

import { RpcError } from "./api";
import { listNotices } from "./notices-api";

test("malformed Notices error stays a 4xx with its request reference", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ unexpected: true }), {
      status: 403,
      headers: { "X-Request-Id": "notice-error-1" },
    });
  try {
    await assert.rejects(listNotices(), (error: unknown) => {
      assert.ok(error instanceof RpcError);
      assert.strictEqual(error.problem.status, 403);
      assert.strictEqual(error.problem.code, "UNAVAILABLE");
      assert.strictEqual(error.problem.requestId, "notice-error-1");
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
