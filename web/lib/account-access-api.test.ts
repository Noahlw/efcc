import { afterEach, describe, expect, test, vi } from "vitest";

import {
  getAccountAccess,
  getRoleDefinitionLifecyclePreview,
  mutateAccountAssignments,
  revokeAccountAssignments,
  searchEligibleAccounts,
  updateRoleDefinitionLifecycle,
} from "@/lib/identity/account-access-api";

const fetchMock = vi.fn<typeof fetch>();

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("Account Access API", () => {
  test("keeps cookie-only transport and exact account route bodies", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          requestId: "r-1",
          data: { accounts: [], nextOffset: null },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Request-Id": "r-1",
          },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    await searchEligibleAccounts("staff", { offset: 2, limit: 10 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/identity/accounts?q=staff&offset=2&limit=10",
      expect.objectContaining({ method: "GET", headers: {} })
    );

    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ requestId: "r-2", data: {} }), {
          status: 200,
        })
    );
    await getAccountAccess("user/target");
    await mutateAccountAssignments(
      "target",
      { baseRevision: 4, roleDefinitionIds: ["role-a"] },
      "key-a"
    );
    await revokeAccountAssignments(
      "target",
      { baseRevision: 5, roleDefinitionIds: ["role-a"] },
      "key-b"
    );
    await updateRoleDefinitionLifecycle(
      "role-a",
      { action: "archive", baseRevision: 6, reason: "retire" },
      "key-c"
    );
    await getRoleDefinitionLifecyclePreview("role-a", "archive");
    expect(fetchMock.mock.calls[5]?.[0]).toBe(
      "/api/v1/identity/role-definitions/role-a/lifecycle?action=archive"
    );
    const calls = fetchMock.mock.calls;
    expect(calls[1]?.[0]).toBe(
      "/api/v1/identity/accounts/user%2Ftarget/assignments"
    );
    expect(calls[2]?.[0]).toBe("/api/v1/identity/accounts/target/assignments");
    expect(calls[2]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "key-a",
      },
      body: JSON.stringify({
        base_revision: 4,
        role_definition_ids: ["role-a"],
      }),
    });
    expect(calls[3]?.[0]).toBe(
      "/api/v1/identity/accounts/target/assignments/revoke"
    );
    expect(calls[4]?.[0]).toBe(
      "/api/v1/identity/role-definitions/role-a/lifecycle"
    );
    expect(
      (calls[2]?.[1]?.headers as Record<string, string>)["Authorization"]
    ).toBeUndefined();
  });
});
