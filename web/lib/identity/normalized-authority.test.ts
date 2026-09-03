import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, test } from "vitest";

import worker from "../../worker";
import type { Env } from "../../worker";
import { ACCESS_COOKIE_NAME } from "../auth/cookies";
import { applyMigrations, testDb } from "../auth/test-bootstrap";
import {
  D1CapabilityAuthorizer,
  type AuthorizationContext,
} from "../programs/capability-authorizer";
import { resolveProgramAccess } from "../programs/program-resolver";
import { preflightDisposableSchema, seedDisposableIdentity } from "./index";
import { resolveActorCapabilities } from "./role-hierarchy";

const SECRET = "test-access-token-secret";
const DATABASE = "E2E_DISPOSABLE_AUTHORITY";
const DEPARTMENT = "018f3b8a-0000-7000-8000-000000000002";
const PROGRAM = "018f3b8a-0000-7000-8000-300000000001";
const OTHER_DEPARTMENT = "018f3b8a-0000-7000-8000-000000000001";

function testEnv(): Env {
  return {
    ...(env as unknown as Env),
    EFCC_ACCESS_TOKEN_SECRET: SECRET,
  };
}

async function login(username: string): Promise<string> {
  const response = await worker.fetch(
    new Request("https://efcc.example/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: "0000" }),
    }),
    testEnv()
  );
  expect(response.status).toBe(200);
  const cookie = response.headers
    .getSetCookie()
    .find((value: string) => value.startsWith(`${ACCESS_COOKIE_NAME}=`));
  expect(cookie).toBeTruthy();
  return cookie!.split(";")[0].slice(ACCESS_COOKIE_NAME.length + 1);
}

interface BootstrapProbe {
  user: {
    identities: {
      label: string;
      scopeKind: string;
      scopeLabel: string | null;
    }[];
    capabilities: Record<string, boolean>;
  };
  sections: { key: string }[];
  navigation: { key: string }[];
}

async function me(cookie: string): Promise<BootstrapProbe> {
  const response = await worker.fetch(
    new Request("https://efcc.example/api/v1/auth/me", {
      headers: { Cookie: `${ACCESS_COOKIE_NAME}=${cookie}` },
    }),
    testEnv()
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { data: BootstrapProbe };
  return body.data;
}

describe("#487 normalized identity authority", () => {
  beforeAll(async () => {
    await applyMigrations();
    const preflight = await preflightDisposableSchema(testDb(), {
      databaseName: DATABASE,
    });
    expect(preflight.kind).toBe("ok");
    await seedDisposableIdentity(testDb(), { databaseName: DATABASE });
  });

  test("resolver applies automatic baseline and exact scope", async () => {
    const member = await resolveActorCapabilities(
      testDb(),
      "E2E_DISPOSABLE_MEMBER"
    );
    expect(member).toMatchObject({ "program.enroll": true });
    expect(member["program.manage"]).not.toBe(true);

    const department = await resolveActorCapabilities(
      testDb(),
      "E2E_DISPOSABLE_DM",
      { departmentId: DEPARTMENT }
    );
    expect(department["department.manage"]).toBe(true);
    expect(department["program.manage"]).toBe(true);
    const outsideDepartment = await resolveActorCapabilities(
      testDb(),
      "E2E_DISPOSABLE_DM",
      { departmentId: OTHER_DEPARTMENT }
    );
    expect(outsideDepartment["department.manage"]).not.toBe(true);

    const program = await resolveProgramAccess(
      testDb(),
      "E2E_DISPOSABLE_PL",
      PROGRAM
    );
    expect(program?.capabilities["program.manage"]).toBe(true);
    expect(program?.departmentId).toBe(OTHER_DEPARTMENT);
    const authorizer = new D1CapabilityAuthorizer(testDb());
    const context: AuthorizationContext = {
      actorUserId: "E2E_DISPOSABLE_PL",
    };
    expect(
      await authorizer.can(context, "program.manage", { programId: PROGRAM })
    ).toBe(true);
    expect(
      await authorizer.can(context, "program.manage", {
        departmentId: DEPARTMENT,
        programId: PROGRAM,
      })
    ).toBe(false);
  });

  test("Admin is all-on and bootstrap is privacy-safe and capability-driven", async () => {
    const admin = await resolveActorCapabilities(
      testDb(),
      "E2E_DISPOSABLE_ADMIN"
    );
    expect(admin["home.publish"]).toBe(true);
    expect(admin["role.permissions.write"]).toBe(true);

    const member = await me(await login("E2E_disposable_member"));
    expect(member.user).not.toHaveProperty("role");
    expect(member.user).not.toHaveProperty("systemRole");
    expect(member.user.identities).toStrictEqual([]);
    expect(member.user.capabilities["program.enroll"]).toBe(true);
    expect(member.sections.map(({ key }) => key)).toStrictEqual([
      "home",
      "programs",
      "scanner",
      "notices",
      "profile",
    ]);
    expect(member.navigation.map(({ key }) => key)).toStrictEqual([
      "home",
      "programs",
      "scanner",
      "notices",
      "profile",
    ]);

    const scoped = await me(await login("E2E_disposable_pl"));
    expect(scoped.user).not.toHaveProperty("role");
    expect(scoped.user).not.toHaveProperty("systemRole");
    expect(scoped.user.identities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "青少年查經帶領",
          scopeKind: "Program",
        }),
      ])
    );
    expect(scoped.sections.map(({ key }) => key)).toContain("management");
    expect(scoped.sections.map(({ key }) => key)).toContain("events");
  });

  test("removed fixed routes return 404 rather than a compatibility projection", async () => {
    const cookie = await login("E2E_disposable_admin");
    for (const path of [
      "/api/v1/programs/account-permissions",
      `/api/v1/programs/${PROGRAM}/leaders`,
      `/api/v1/programs/departments/${DEPARTMENT}/managers`,
    ]) {
      const response = await worker.fetch(
        new Request(`https://efcc.example${path}`, {
          headers: { Cookie: `${ACCESS_COOKIE_NAME}=${cookie}` },
        }),
        testEnv()
      );
      expect(response.status).toBe(404);
      const body = (await response.json()) as { code: string };
      expect(body.code).toBe("NOT_FOUND");
    }
  });

  test("reserved account-permissions route stays 404 on a program ID collision", async () => {
    const now = new Date().toISOString();
    await testDb()
      .prepare(
        `INSERT INTO programs
           (program_id, department_id, name, description, category,
            behavior_type, lifecycle, discoverability, enrollment_mode,
            display_order, created_by, created_at, updated_by, updated_at)
         VALUES ('account-permissions', ?, 'Reserved route collision', NULL,
                 NULL, 'OneOff', 'Active', 'Listed', 'MemberRequest', 0,
                 'E2E_DISPOSABLE_ADMIN', ?, 'E2E_DISPOSABLE_ADMIN', ?)`
      )
      .bind(DEPARTMENT, now, now)
      .run();
    try {
      const cookie = await login("E2E_disposable_admin");
      const response = await worker.fetch(
        new Request(
          "https://efcc.example/api/v1/programs/account-permissions",
          { headers: { Cookie: `${ACCESS_COOKIE_NAME}=${cookie}` } }
        ),
        testEnv()
      );
      expect(response.status).toBe(404);
      const body = (await response.json()) as { code: string };
      expect(body.code).toBe("NOT_FOUND");
    } finally {
      await testDb()
        .prepare(
          "DELETE FROM programs WHERE program_id = 'account-permissions'"
        )
        .run();
    }
  });
});
