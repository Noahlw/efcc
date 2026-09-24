import { describe, expect, it } from "vitest";

import type { CapabilityAuthorizer } from "./capability-authorizer";
import { DepartmentWorkspace } from "./department-workspace";

describe("DepartmentWorkspace management access", () => {
  it("skips department and Program scans when no management scope exists", async () => {
    const workspace = new DepartmentWorkspace({} as never, {
      can: async (_ctx, _capability, scope) => {
        expect(scope).toEqual({});
        return false;
      },
    } satisfies CapabilityAuthorizer);

    await expect(
      workspace.getManagementAccess({ actorUserId: "member" })
    ).resolves.toEqual({
      hasManagementCapability: false,
      departmentScopes: 0,
      programScopes: 0,
    });
  });
});
