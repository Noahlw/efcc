import assert from "node:assert/strict";

import { describe, test } from "vitest";

import { RpcError } from "@/lib/api";
import {
  getManagementAccess,
  getManagementDirectory,
  guestCheckIn,
  listParticipantCatalog,
  reconcileGuestCheckIn,
  searchMemberOptions,
  setEventAvailability,
  cancelEvent,
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

  test("rejects malformed member options and Event mutation acknowledgements", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return jsonResponse(
        { requestId: "missing-program-fields", data: { unexpected: true } },
        200,
        "missing-program-fields"
      );
    };
    try {
      for (const action of [
        () => searchMemberOptions("program-1", "member"),
        () => setEventAvailability("program-1", "event-1", "Inactive"),
        () => cancelEvent("program-1", "event-1", "reason"),
      ]) {
        await assert.rejects(action(), (error: unknown) => {
          assert.ok(error instanceof RpcError);
          assert.strictEqual(error.problem.code, "MALFORMED_RESPONSE");
          assert.strictEqual(error.problem.requestId, "missing-program-fields");
          return true;
        });
      }
      assert.strictEqual(calls, 3, "mutations are never auto-replayed");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("uses the persisted Event operation key on the wire", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_input, init) => {
      assert.strictEqual(
        new Headers(init?.headers).get("Idempotency-Key"),
        "event-operation-1"
      );
      return jsonResponse(
        { requestId: "event-operation-1", data: { unexpected: true } },
        200,
        "event-operation-1"
      );
    };
    try {
      await assert.rejects(
        cancelEvent("program-1", "event-1", null, "event-operation-1"),
        (error: unknown) => {
          assert.ok(error instanceof RpcError);
          assert.strictEqual(error.problem.code, "MALFORMED_RESPONSE");
          return true;
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
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

  test("guest check-in rejects malformed acknowledgement once, preserving requestId", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return jsonResponse(
        { requestId: "guest-malformed", data: { outcome: "success" } },
        201,
        "guest-malformed"
      );
    };
    try {
      await assert.rejects(
        guestCheckIn(
          {
            event_id: "event-1",
            method: "guest_manual_code",
            name: "訪客",
            phone: "91234567",
            entry: "ATT1234",
          },
          "guest-key-1"
        ),
        (error: unknown) => {
          assert.ok(error instanceof RpcError);
          assert.strictEqual(error.problem.code, "MALFORMED_RESPONSE");
          assert.strictEqual(error.problem.requestId, "guest-malformed");
          return true;
        }
      );
      assert.strictEqual(
        calls,
        1,
        "malformed acknowledgement is never auto-replayed"
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("guest reconciliation rejects malformed outcomes with requestId", async () => {
    const restore = stubFetch(() =>
      jsonResponse(
        {
          requestId: "guest-reconcile-malformed",
          data: { outcome: "success" },
        },
        200,
        "guest-reconcile-malformed"
      )
    );
    try {
      await assert.rejects(
        reconcileGuestCheckIn(
          {
            event_id: "event-1",
            method: "guest_manual_code",
            name: "訪客",
            phone: "91234567",
            entry: "ATT1234",
          },
          "guest-key-1"
        ),
        (error: unknown) => {
          assert.ok(error instanceof RpcError);
          assert.strictEqual(error.problem.code, "MALFORMED_RESPONSE");
          assert.strictEqual(
            error.problem.requestId,
            "guest-reconcile-malformed"
          );
          return true;
        }
      );
    } finally {
      restore();
    }
  });

  test("enrollment mutations reject malformed data", async () => {
    const { submitEnrollmentRequest, decideEnrollmentRequest } =
      await import("@/lib/programs/program-api");
    const restore = stubFetch(() =>
      jsonResponse(
        { requestId: "r-p-9", data: { request: { request_id: "r" } } },
        201,
        "r-p-9"
      )
    );
    try {
      await assert.rejects(submitEnrollmentRequest("p"), (error: unknown) => {
        assert.ok(error instanceof RpcError);
        assert.strictEqual(error.problem.code, "MALFORMED_RESPONSE");
        return true;
      });
    } finally {
      restore();
    }
    const restore2 = stubFetch(() =>
      jsonResponse(
        { requestId: "r-p-10", data: { request: null } },
        200,
        "r-p-10"
      )
    );
    try {
      await assert.rejects(
        decideEnrollmentRequest("p", "r", "Approved"),
        (error: unknown) => {
          assert.ok(error instanceof RpcError);
          assert.strictEqual(error.problem.code, "MALFORMED_RESPONSE");
          return true;
        }
      );
    } finally {
      restore2();
    }
  });

  test("schedule mutations reject malformed data", async () => {
    const { previewEvents, generateEvents } =
      await import("@/lib/programs/program-api");
    const restore = stubFetch(() =>
      jsonResponse(
        { requestId: "r-p-7", data: { plan: null, occurrences: [] } },
        200,
        "r-p-7"
      )
    );
    try {
      await assert.rejects(previewEvents("p", 90), (error: unknown) => {
        assert.ok(error instanceof RpcError);
        assert.strictEqual(error.problem.code, "MALFORMED_RESPONSE");
        return true;
      });
    } finally {
      restore();
    }
    const restore2 = stubFetch(() =>
      jsonResponse(
        { requestId: "r-p-8", data: { generated: { status: "weird" } } },
        200,
        "r-p-8"
      )
    );
    try {
      await assert.rejects(generateEvents("p", "plan"), (error: unknown) => {
        assert.ok(error instanceof RpcError);
        assert.strictEqual(error.problem.code, "MALFORMED_RESPONSE");
        return true;
      });
    } finally {
      restore2();
    }
  });

  test("settings mutations reject malformed data", async () => {
    const { createDepartment, setDepartmentModule } =
      await import("@/lib/programs/program-api");
    const restore = stubFetch(() =>
      jsonResponse(
        { requestId: "r-p-5", data: { department: { department_id: "d" } } },
        201,
        "r-p-5"
      )
    );
    try {
      await assert.rejects(
        createDepartment({ code: "T", name: "x", lifecycle: "Active" }),
        (error: unknown) => {
          assert.ok(error instanceof RpcError);
          assert.strictEqual(error.problem.code, "MALFORMED_RESPONSE");
          return true;
        }
      );
    } finally {
      restore();
    }
    const restore2 = stubFetch(() =>
      jsonResponse({ requestId: "r-p-6", data: { module: null } }, 200, "r-p-6")
    );
    try {
      await assert.rejects(
        setDepartmentModule("d", "attendance", true),
        (error: unknown) => {
          assert.ok(error instanceof RpcError);
          assert.strictEqual(error.problem.code, "MALFORMED_RESPONSE");
          return true;
        }
      );
    } finally {
      restore2();
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
