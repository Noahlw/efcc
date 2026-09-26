import assert from "node:assert/strict";

import { describe, test } from "vitest";

import { RpcError } from "./api";
import { listHomeAudit, saveHomeDraft } from "./home-cms-api";

function stubFetch(handler: () => Response): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => handler();
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function jsonResponse(
  payload: unknown,
  status: number,
  requestId: string
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
    },
  });
}

describe("home-cms-api client", () => {
  test("saveHomeDraft unwraps data on valid success", async () => {
    const restore = stubFetch(() =>
      jsonResponse(
        {
          requestId: "req-cms-1",
          data: {
            contentId: "home",
            version: 2,
            templateType: "B",
            status: "Draft",
            publishMode: "immediate",
            startAt: null,
            endAt: null,
            title: "草稿",
            summary: null,
            bodyMarkdown: null,
            ctaLabel: null,
            ctaUrl: null,
            imageUrl: null,
            imageAlt: null,
            featuredEventId: null,
            updatedBy: "CMS-ADMIN",
            updatedAt: "2026-09-20T00:00:00.000Z",
            publishedBy: null,
            publishedAt: null,
          },
        },
        200,
        "req-cms-1"
      )
    );
    try {
      const result = await saveHomeDraft({ template_type: "B" });
      assert.strictEqual(result.version, 2);
      assert.strictEqual(result.status, "Draft");
    } finally {
      restore();
    }
  });

  test("saveHomeDraft rejects malformed success data", async () => {
    const restore = stubFetch(() =>
      jsonResponse(
        {
          requestId: "req-cms-2",
          data: {
            contentId: "home",
            version: "two",
            templateType: "B",
            status: "Draft",
          },
        },
        200,
        "req-cms-2"
      )
    );
    try {
      await assert.rejects(
        () => saveHomeDraft({ template_type: "B" }),
        (error: unknown) => {
          assert.ok(error instanceof RpcError);
          assert.strictEqual(error.problem.code, "MALFORMED_RESPONSE");
          assert.strictEqual(error.problem.requestId, "req-cms-2");
          return true;
        }
      );
    } finally {
      restore();
    }
  });

  test("saveHomeDraft preserves conflict code and extensions", async () => {
    const restore = stubFetch(() =>
      jsonResponse(
        {
          type: "tag:apps-script/efcc/errors#CONFLICT",
          title: "Content changed",
          status: 409,
          code: "CONFLICT",
          detail:
            "The latest published content must be reloaded before saving.",
          requestId: "req-cms-3",
          latest: { contentId: "home", version: 3 },
          reloadRequired: true,
        },
        409,
        "req-cms-3"
      )
    );
    try {
      await assert.rejects(
        () => saveHomeDraft({ template_type: "B" }),
        (error: unknown) => {
          assert.ok(error instanceof RpcError);
          assert.strictEqual(error.problem.status, 409);
          assert.strictEqual(error.problem.code, "CONFLICT");
          assert.strictEqual(error.problem.requestId, "req-cms-3");
          return true;
        }
      );
    } finally {
      restore();
    }
  });

  test("listHomeAudit keeps UNAVAILABLE with requestId on empty error bodies", async () => {
    const restore = stubFetch(
      () =>
        new Response(null, {
          status: 503,
          headers: { "X-Request-Id": "req-cms-4" },
        })
    );
    try {
      await assert.rejects(
        () => listHomeAudit(),
        (error: unknown) => {
          assert.ok(error instanceof RpcError);
          assert.strictEqual(error.problem.status, 503);
          assert.strictEqual(error.problem.code, "UNAVAILABLE");
          assert.strictEqual(error.problem.requestId, "req-cms-4");
          return true;
        }
      );
    } finally {
      restore();
    }
  });

  test("malformed 4xx Problem Details retains HTTP status and UNAVAILABLE", async () => {
    const restore = stubFetch(() =>
      jsonResponse({ unexpected: true }, 409, "req-cms-malformed")
    );
    try {
      await assert.rejects(listHomeAudit(), (error: unknown) => {
        assert.ok(error instanceof RpcError);
        assert.strictEqual(error.problem.status, 409);
        assert.strictEqual(error.problem.code, "UNAVAILABLE");
        assert.strictEqual(error.problem.requestId, "req-cms-malformed");
        return true;
      });
    } finally {
      restore();
    }
  });
});
