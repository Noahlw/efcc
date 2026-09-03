import { beforeEach, describe, expect, test, vi } from "vitest";

import { D1CapabilityAuthorizer } from "./capability-authorizer";
import type { ProgramAccess } from "./program-resolver";
const mocks = vi.hoisted(() => ({
  resolveProgramAccess: vi.fn(),
  resolveActorCapabilities: vi.fn(),
}));

vi.mock("./program-resolver", () => ({
  resolveProgramAccess: mocks.resolveProgramAccess,
}));

vi.mock("../identity/role-hierarchy", () => ({
  resolveActorCapabilities: mocks.resolveActorCapabilities,
}));

describe("D1CapabilityAuthorizer", () => {
  const db = {} as D1Database;
  const context = { actorUserId: "actor" };
  const access: ProgramAccess = {
    programId: "program",
    departmentId: "department",
    capabilities: { "program.manage": true },
  };

  beforeEach(() => {
    mocks.resolveProgramAccess.mockReset();
    mocks.resolveActorCapabilities.mockReset();
  });

  test("coalesces concurrent capability checks without caching completed results", async () => {
    mocks.resolveProgramAccess.mockResolvedValue(access);
    const authorizer = new D1CapabilityAuthorizer(db);

    const [canManage, canPublish] = await Promise.all([
      authorizer.can(context, "program.manage", {
        departmentId: "department",
        programId: "program",
      }),
      authorizer.can(context, "program.publish", {
        departmentId: "department",
        programId: "program",
      }),
    ]);

    expect(canManage).toBe(true);
    expect(canPublish).toBe(false);
    expect(mocks.resolveProgramAccess).toHaveBeenCalledTimes(1);

    await authorizer.can(context, "program.manage", {
      departmentId: "department",
      programId: "program",
    });
    expect(mocks.resolveProgramAccess).toHaveBeenCalledTimes(2);
  });
  test("coalesces concurrent department-scoped capability checks", async () => {
    mocks.resolveActorCapabilities.mockResolvedValue({
      "department.manage": true,
      "department.publish": false,
    });
    const authorizer = new D1CapabilityAuthorizer(db);

    const [canManage, canPublish] = await Promise.all([
      authorizer.can(context, "department.manage", {
        departmentId: "dept-1",
      }),
      authorizer.can(context, "department.publish", {
        departmentId: "dept-1",
      }),
    ]);

    expect(canManage).toBe(true);
    expect(canPublish).toBe(false);
    expect(mocks.resolveActorCapabilities).toHaveBeenCalledTimes(1);

    await authorizer.can(context, "department.manage", {
      departmentId: "dept-1",
    });
    expect(mocks.resolveActorCapabilities).toHaveBeenCalledTimes(2);
  });

  test("programCapabilities resolves all capabilities in one shot", async () => {
    mocks.resolveProgramAccess.mockResolvedValue(access);
    const authorizer = new D1CapabilityAuthorizer(db);

    const caps = await authorizer.programCapabilities(
      context,
      "program",
      "department"
    );

    expect(caps["program.manage"]).toBe(true);
    expect(caps["program.publish"]).toBeUndefined();
    expect(mocks.resolveProgramAccess).toHaveBeenCalledTimes(1);
  });

  test("departmentCapabilities resolves all capabilities in one shot", async () => {
    mocks.resolveActorCapabilities.mockResolvedValue({
      "department.manage": true,
    });
    const authorizer = new D1CapabilityAuthorizer(db);

    const caps = await authorizer.departmentCapabilities(context, "dept-1");

    expect(caps["department.manage"]).toBe(true);
    expect(mocks.resolveActorCapabilities).toHaveBeenCalledTimes(1);
  });
});
