import { afterEach, describe, expect, test, vi } from "vitest";

import {
  getRoleDefinitionDetail,
  getRoleHierarchy,
} from "@/lib/identity/role-hierarchy-api";

const fetchMock = vi.fn<typeof fetch>();

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function okResponse(data: unknown, requestId: string): Response {
  return new Response(JSON.stringify({ requestId, data }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
    },
  });
}

describe("role hierarchy API client", () => {
  test("unwraps a valid hierarchy projection", async () => {
    fetchMock.mockResolvedValue(
      okResponse(
        {
          categories: [],
          revision: 1,
          caller: { userId: "u", highestPosition: 0 },
        },
        "r-h-1"
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const view = await getRoleHierarchy();
    expect(view.revision).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/identity/roles",
      expect.objectContaining({ method: "GET", cache: "no-store" })
    );
  });

  test("rejects malformed success data with MALFORMED_RESPONSE", async () => {
    fetchMock.mockResolvedValue(
      okResponse({ categories: "nope", revision: 1 }, "r-h-2")
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(getRoleHierarchy()).rejects.toMatchObject({
      problem: expect.objectContaining({
        code: "MALFORMED_RESPONSE",
        requestId: "r-h-2",
      }),
    });
  });

  test("preserves conflict extensions on error bodies", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          type: "tag:apps-script/efcc/errors#ROLE_POLICY_CONFLICT",
          title: "Conflict",
          status: 409,
          code: "ROLE_POLICY_CONFLICT",
          detail: "身份組政策已有更新，請重新載入後再試。",
          requestId: "r-h-3",
          currentRevision: 7,
        }),
        {
          status: 409,
          headers: { "X-Request-Id": "r-h-3" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(getRoleDefinitionDetail("r")).rejects.toMatchObject({
      problem: expect.objectContaining({
        status: 409,
        code: "ROLE_POLICY_CONFLICT",
        requestId: "r-h-3",
        currentRevision: 7,
      }),
    });
  });
});
