import { afterEach, describe, expect, test, vi } from "vitest";

import * as accountAccessDomain from "@/lib/identity/account-access";
import * as accountAccessApi from "@/lib/identity/account-access-api";
import {
  getAccountAccess,
  getRoleDefinitionLifecyclePreview,
  mutateAccountAssignments,
  revokeAccountAssignments,
  searchEligibleAccounts,
  updateRoleDefinitionLifecycle,
} from "@/lib/identity/account-access-api";
import * as accountAccessHandlers from "@/lib/identity/account-access-handlers";
import { getRoleHierarchy } from "@/lib/identity/role-hierarchy-api";

const fetchMock = vi.fn<typeof fetch>();

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("Account Access API", () => {
  test("does not export obsolete compatibility aliases", () => {
    expect(accountAccessApi).not.toHaveProperty("getEligibleAccounts");
    expect(accountAccessApi).not.toHaveProperty("getAccountAssignments");
    expect(accountAccessDomain).not.toHaveProperty(
      "updateRoleDefinitionLifecycle"
    );
    expect(accountAccessHandlers).not.toHaveProperty(
      "handleGetEligibleAccounts"
    );
    expect(accountAccessHandlers).not.toHaveProperty(
      "handlePostRoleDefinitionLifecycle"
    );
    expect(accountAccessHandlers).not.toHaveProperty(
      "handleGetAccountAssignments"
    );
    expect(accountAccessHandlers).not.toHaveProperty(
      "handlePostAccountAssignments"
    );
    expect(accountAccessHandlers).not.toHaveProperty("handleLifecycle");
  });
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
      expect.objectContaining({
        method: "GET",
        headers: {},
        cache: "no-store",
      })
    );

    const lifecycleResult = {
      roleDefinitionId: "role-a",
      action: "archive",
      isArchived: true,
      revision: 7,
      affectedAccountUserIds: [],
      impact: [],
      idempotent: false,
    };
    const accessView = {
      account: {
        userId: "target",
        name: "Target",
        username: "target",
        status: "Active",
      },
      activeAssignments: [],
      revokedAssignments: [],
      assignmentHistory: [],
      assignableRoles: [],
      effectiveAccess: { Global: [], Department: [], Program: [] },
      lifecycleImpacts: {},
      revision: 1,
      actions: {
        assign: true,
        revoke: true,
        archive: false,
        restore: false,
        revokeRoleDefinitionIds: [],
        archiveRoleDefinitionIds: [],
        restoreRoleDefinitionIds: [],
      },
      idempotent: false,
      duplicateRoleDefinitionIds: [],
    };
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      const data = url.endsWith("/api/v1/identity/roles")
        ? {
            categories: [],
            revision: 1,
            caller: { userId: "u", highestPosition: 0 },
          }
        : url.includes("/lifecycle")
          ? url.includes("action=")
            ? { ...lifecycleResult, idempotent: undefined }
            : lifecycleResult
          : accessView;
      return new Response(JSON.stringify({ requestId: "r-2", data }), {
        status: 200,
      });
    });
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
    await getRoleHierarchy();
    expect(fetchMock.mock.calls[5]?.[0]).toBe(
      "/api/v1/identity/role-definitions/role-a/lifecycle?action=archive"
    );
    const calls = fetchMock.mock.calls;
    expect(calls[6]?.[1]).toMatchObject({
      method: "GET",
      cache: "no-store",
    });
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

  test("rejects malformed success data with MALFORMED_RESPONSE", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          requestId: "r-bad",
          data: { account: null },
        }),
        {
          status: 200,
          headers: { "X-Request-Id": "r-bad" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(getAccountAccess("target")).rejects.toMatchObject({
      problem: expect.objectContaining({
        code: "MALFORMED_RESPONSE",
        requestId: "r-bad",
      }),
    });
  });

  test("preserves status and requestId on malformed error bodies", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ unexpected: true }), {
        status: 403,
        headers: { "X-Request-Id": "r-bad-2" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(getAccountAccess("target")).rejects.toMatchObject({
      problem: expect.objectContaining({ status: 403, requestId: "r-bad-2" }),
    });
  });
});
