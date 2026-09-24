import { afterEach, describe, expect, it, vi } from "vitest";

const resolvers = vi.hoisted(() => ({
  actor: vi.fn(),
  program: vi.fn(),
}));

vi.mock("../identity/role-hierarchy", () => ({
  resolveActorCapabilities: resolvers.actor,
}));
vi.mock("./program-resolver", () => ({
  resolveProgramAccess: resolvers.program,
}));

import { CAPABILITY } from "./capabilities";
import { D1CapabilityAuthorizer } from "./capability-authorizer";

describe("D1CapabilityAuthorizer", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("shares one department resolution per request and refreshes on the next request", async () => {
    const db = {} as D1Database;
    const actor = { actorUserId: "manager" };
    const scope = { departmentId: "department-1" };
    resolvers.actor
      .mockResolvedValueOnce({
        [CAPABILITY.DEPARTMENT_MANAGE]: true,
        [CAPABILITY.DEPARTMENT_PUBLISH]: false,
      })
      .mockResolvedValueOnce({ [CAPABILITY.DEPARTMENT_MANAGE]: false });
    const requestAuthorizer = new D1CapabilityAuthorizer(db);

    await expect(
      Promise.all([
        requestAuthorizer.can(actor, CAPABILITY.DEPARTMENT_MANAGE, scope),
        requestAuthorizer.can(actor, CAPABILITY.DEPARTMENT_PUBLISH, scope),
      ])
    ).resolves.toEqual([true, false]);
    expect(resolvers.actor).toHaveBeenCalledOnce();

    const nextRequestAuthorizer = new D1CapabilityAuthorizer(db);
    await expect(
      nextRequestAuthorizer.can(actor, CAPABILITY.DEPARTMENT_MANAGE, scope)
    ).resolves.toBe(false);
    expect(resolvers.actor).toHaveBeenCalledTimes(2);
  });

  it("shares a program resolution without weakening Department scope checks", async () => {
    const authorizer = new D1CapabilityAuthorizer({} as D1Database);
    const actor = { actorUserId: "manager" };
    const scope = { departmentId: "department-1", programId: "program-1" };
    resolvers.program.mockResolvedValue({
      programId: "program-1",
      departmentId: "department-1",
      capabilities: {
        [CAPABILITY.PROGRAM_MANAGE]: true,
        [CAPABILITY.PROGRAM_PUBLISH]: false,
      },
    });

    await expect(
      Promise.all([
        authorizer.can(actor, CAPABILITY.PROGRAM_MANAGE, scope),
        authorizer.can(actor, CAPABILITY.PROGRAM_PUBLISH, scope),
      ])
    ).resolves.toEqual([true, false]);
    await expect(
      authorizer.can(actor, CAPABILITY.PROGRAM_MANAGE, {
        ...scope,
        departmentId: "department-2",
      })
    ).resolves.toBe(false);
    expect(resolvers.program).toHaveBeenCalledOnce();
  });
});
