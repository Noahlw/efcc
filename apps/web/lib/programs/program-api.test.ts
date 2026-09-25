import assert from "node:assert/strict";

import { describe, test } from "vitest";

import { RpcError } from "@/lib/api";
import {
  getManagementAccess,
  getManagementDirectory,
  listParticipantCatalog,
} from "@/lib/programs/program-api";

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

describe("program-api client", () => {
  test("unwraps a valid directory projection", async () => {
    const restore = stubFetch(() =>
      jsonResponse(
        { requestId: "r-p-1", data: { departments: [], programs: [] } },
        200,
        "r-p-1"
      )
    );
    try {
      const directory = await getManagementDirectory();
      assert.deepStrictEqual(directory, { departments: [], programs: [] });
    } finally {
      restore();
    }
  });

  test("rejects malformed success data with MALFORMED_RESPONSE", async () => {
    const restore = stubFetch(() =>
      jsonResponse(
        {
          requestId: "r-p-2",
          data: { departments: "nope", programs: [] },
        },
        200,
        "r-p-2"
      )
    );
    try {
      await assert.rejects(getManagementDirectory(), (error: unknown) => {
        assert.ok(error instanceof RpcError);
        assert.strictEqual(error.problem.code, "MALFORMED_RESPONSE");
        assert.strictEqual(error.problem.requestId, "r-p-2");
        return true;
      });
    } finally {
      restore();
    }
  });

  test("preserves status and requestId on malformed error bodies", async () => {
    const restore = stubFetch(() =>
      jsonResponse({ unexpected: true }, 403, "r-p-3")
    );
    try {
      await assert.rejects(listParticipantCatalog(), (error: unknown) => {
        assert.ok(error instanceof RpcError);
        assert.strictEqual(error.problem.status, 403);
        assert.strictEqual(error.problem.requestId, "r-p-3");
        return true;
      });
    } finally {
      restore();
    }
  });

  test("unvalidated routes keep the envelope-only check until their slice", async () => {
    // getManagementAccess IS validated in #656: a malformed projection
    // must not resolve.
    const restore = stubFetch(() =>
      jsonResponse(
        { requestId: "r-p-4", data: { hasManagementCapability: "yes" } },
        200,
        "r-p-4"
      )
    );
    try {
      await assert.rejects(getManagementAccess(), (error: unknown) => {
        assert.ok(error instanceof RpcError);
        assert.strictEqual(error.problem.code, "MALFORMED_RESPONSE");
        return true;
      });
    } finally {
      restore();
    }
  });
});
