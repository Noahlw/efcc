// @vitest-environment workers
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, test } from "vitest";

import worker from "../../worker";
import type { Env } from "../../worker";
import { preflightDisposableSchema, seedDisposableIdentity } from "../identity";
import { resolveActorCapabilities } from "../identity/role-hierarchy";
import { importLegacyUsers } from "./accounts";
import { ACCESS_COOKIE_NAME } from "./cookies";
import { signAccessToken } from "./sessions";
import { applyMigrations, testDb } from "./test-bootstrap";
import { completeCredentialUpgrade } from "./upgrade";

const HOST = "https://efcc.example";
const SECRET = "test-access-token-secret";
const DATABASE = "E2E_C487_AUTHORITY";
const YOUTH_DEPARTMENT = "018f3b8a-0000-7000-8000-000000000001";
const ADULT_DEPARTMENT = "018f3b8a-0000-7000-8000-000000000002";
const YOUTH_PROGRAM = "018f3b8a-0000-7000-8000-300000000001";
const ADULT_PROGRAM = "C487-ADULT-PROGRAM";
const YOUTH_EVENT = "C487-YOUTH-EVENT";
const ADULT_EVENT = "C487-ADULT-EVENT";
const CUSTOM_USER = "E2E_C487_CUSTOM";
const TARGET_USER = "E2E_C487_TARGET";
const CUSTOM_ROLE = "C487-CUSTOM-PROGRAM-ROLE";
const TARGET_REQUEST_PL = "C487-REQUEST-PL";
const TARGET_REQUEST_MEMBER = "C487-REQUEST-MEMBER";
const TARGET_REQUEST_CUSTOM = "C487-REQUEST-CUSTOM";

const HEADER = [
  "User_ID",
  "Name",
  "Username",
  "PIN_Code",
  "System_Role",
  "Status",
];

function testEnv(): Env {
  return {
    ...(env as unknown as Env),
    EFCC_ACCESS_TOKEN_SECRET: SECRET,
  };
}

function request(path: string, init: RequestInit = {}): Request {
  return new Request(`${HOST}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

async function login(username: string, password: string): Promise<string> {
  const response = await worker.fetch(
    request("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
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

async function envelope<T>(response: Response): Promise<T> {
  const body = (await response.json()) as {
    requestId?: string;
    data?: T;
  };
  expect(body.requestId).toBe(response.headers.get("X-Request-Id"));
  return body.data as T;
}

async function problem(
  response: Response,
  status: number,
  code: string
): Promise<void> {
  expect(response.status).toBe(status);
  expect(response.headers.get("Content-Type")).toContain(
    "application/problem+json"
  );
  const body = (await response.json()) as {
    code?: string;
    requestId?: string;
  };
  expect(body.code).toBe(code);
  expect(body.requestId).toBe(response.headers.get("X-Request-Id"));
}

interface BootstrapData {
  user: {
    role: string;
    systemRole: "Admin" | "Staff" | null;
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

async function bootstrap(cookie: string): Promise<BootstrapData> {
  const response = await worker.fetch(
    request("/api/v1/auth/me", {
      headers: { Cookie: `${ACCESS_COOKIE_NAME}=${cookie}` },
    }),
    testEnv()
  );
  expect(response.status).toBe(200);
  return envelope<BootstrapData>(response);
}

async function withCookie(
  path: string,
  cookie: string,
  init: RequestInit = {}
): Promise<Response> {
  return worker.fetch(
    request(path, {
      ...init,
      headers: {
        Cookie: `${ACCESS_COOKIE_NAME}=${cookie}`,
        ...init.headers,
      },
    }),
    testEnv()
  );
}

async function addFixtureAccounts(): Promise<void> {
  await importLegacyUsers(testDb(), [
    HEADER,
    [
      CUSTOM_USER,
      "C487 Custom Operator",
      "c487-custom",
      "0000",
      "Member",
      "Active",
    ],
    [
      TARGET_USER,
      "C487 Target Member",
      "c487-target",
      "0001",
      "Member",
      "Active",
    ],
  ]);
  await completeCredentialUpgrade(testDb(), {
    userId: CUSTOM_USER,
    legacyPin: "0000",
    newCredential: "c487-custom-password",
  });
  await completeCredentialUpgrade(testDb(), {
    userId: TARGET_USER,
    legacyPin: "0001",
    newCredential: "c487-target-password",
  });
}

async function addNormalizedFixtures(): Promise<void> {
  const db = testDb();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT OR IGNORE INTO role_definitions
        (role_definition_id, category_key, stable_key, label, description,
         scope_kind, scope_id, position, is_protected, is_archived,
         created_by, created_at, updated_by, updated_at)
       VALUES (?, 'Program', ?, '自訂課程操作員', 'C-487 scoped custom identity',
               'Program', ?, 30, 0, 0, 'E2E_DISPOSABLE_ADMIN', ?, NULL, ?)`
    )
    .bind(CUSTOM_ROLE, CUSTOM_ROLE, YOUTH_PROGRAM, now, now)
    .run();
  await db
    .prepare(
      `INSERT OR IGNORE INTO role_definition_grants
        (role_definition_id, capability, granted_by, granted_at)
       VALUES (?, 'program.manage', 'E2E_DISPOSABLE_ADMIN', ?)`
    )
    .bind(CUSTOM_ROLE, now)
    .run();
  await db
    .prepare(
      `INSERT OR IGNORE INTO role_assignments
        (assignment_id, account_user_id, role_definition_id, granted_by,
         granted_at, scope_kind, scope_id)
       VALUES (?, ?, ?, 'E2E_DISPOSABLE_ADMIN', ?, 'Program', ?)`
    )
    .bind(
      `${CUSTOM_ROLE}-assignment`,
      CUSTOM_USER,
      CUSTOM_ROLE,
      now,
      YOUTH_PROGRAM
    )
    .run();

  for (const departmentId of [YOUTH_DEPARTMENT, ADULT_DEPARTMENT]) {
    for (const moduleKey of [
      "program_catalog",
      "enrollment",
      "events",
      "attendance",
    ]) {
      await db
        .prepare(
          `UPDATE department_modules
              SET enabled = 1, enabled_by = ?, enabled_at = ?
            WHERE department_id = ? AND module_key = ?`
        )
        .bind("E2E_DISPOSABLE_ADMIN", now, departmentId, moduleKey)
        .run();
    }
  }

  await db
    .prepare(
      `INSERT OR IGNORE INTO programs
        (program_id, department_id, name, description, category, behavior_type,
         lifecycle, discoverability, enrollment_mode, display_order, created_by,
         created_at, updated_by, updated_at, check_in_token,
         check_in_opens_at_minutes_before_start,
         check_in_closes_at_minutes_after_end)
       VALUES (?, ?, 'C-487 成人課程', 'C-487 scope fixture', '測試', 'OneOff',
               'Active', 'Listed', 'MemberRequest', 1, 'E2E_DISPOSABLE_ADMIN',
               ?, 'E2E_DISPOSABLE_ADMIN', ?, 'C487-ADULT-TOKEN', 30, 30)`
    )
    .bind(ADULT_PROGRAM, ADULT_DEPARTMENT, now, now)
    .run();

  const startsAt = new Date(Date.now() - 5 * 60_000).toISOString();
  const endsAt = new Date(Date.now() + 25 * 60_000).toISOString();
  const windowOpens = new Date(Date.now() - 30 * 60_000).toISOString();
  const windowCloses = new Date(Date.now() + 30 * 60_000).toISOString();
  for (const [eventId, programId, code] of [
    [YOUTH_EVENT, YOUTH_PROGRAM, "C487-YOUTH-CODE"],
    [ADULT_EVENT, ADULT_PROGRAM, "C487-ADULT-CODE"],
  ] as const) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO events
          (event_id, program_id, starts_at, ends_at, status, source,
           cancel_reason, created_by, created_at, updated_by, updated_at,
           manual_check_in_code, check_in_window_opens_at,
           check_in_window_closes_at, availability, name, location, event_type)
         VALUES (?, ?, ?, ?, 'Active', 'MANUAL', NULL,
                 'E2E_DISPOSABLE_ADMIN', ?, 'E2E_DISPOSABLE_ADMIN', ?,
                 ?, ?, ?, 'Active', 'C-487 Event', 'C-487 Room', '小組')`
      )
      .bind(
        eventId,
        programId,
        startsAt,
        endsAt,
        now,
        now,
        code,
        windowOpens,
        windowCloses
      )
      .run();
  }

  for (const [programId, suffix] of [
    [YOUTH_PROGRAM, "YOUTH"],
    [ADULT_PROGRAM, "ADULT"],
  ] as const) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO enrollments
          (enrollment_id, program_id, member_user_id, request_id, status,
           enrolled_at, cancelled_at, cancelled_by, created_by, created_at)
         VALUES (?, ?, 'E2E_DISPOSABLE_MEMBER', NULL, 'Active', ?, NULL, NULL,
                 'E2E_DISPOSABLE_ADMIN', ?)`
      )
      .bind(`C487-${suffix}-MEMBER-ENROLLMENT`, programId, now, now)
      .run();
    await db
      .prepare(
        `INSERT OR IGNORE INTO enrollments
          (enrollment_id, program_id, member_user_id, request_id, status,
           enrolled_at, cancelled_at, cancelled_by, created_by, created_at)
         VALUES (?, ?, ?, NULL, 'Active', ?, NULL, NULL,
                 'E2E_DISPOSABLE_ADMIN', ?)`
      )
      .bind(
        `C487-${suffix}-TARGET-ENROLLMENT`,
        programId,
        TARGET_USER,
        now,
        now
      )
      .run();
  }

  for (const requestId of [
    TARGET_REQUEST_PL,
    TARGET_REQUEST_MEMBER,
    TARGET_REQUEST_CUSTOM,
  ]) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO enrollment_requests
          (request_id, program_id, member_user_id, status, submitted_at,
           request_version)
         VALUES (?, ?, ?, 'Pending', ?, 1)`
      )
      .bind(requestId, YOUTH_PROGRAM, TARGET_USER, now)
      .run();
  }
}

describe("#487 normalized authority Worker seams", () => {
  beforeAll(async () => {
    await applyMigrations();
    const preflight = await preflightDisposableSchema(testDb(), {
      databaseName: DATABASE,
    });
    if (preflight.kind !== "ok") {
      throw new Error(preflight.message);
    }
    await seedDisposableIdentity(testDb(), { databaseName: DATABASE });
    await addFixtureAccounts();
    await addNormalizedFixtures();
  });

  test("C-487-01 bootstrap projects capabilities, scopes, and privacy-safe identity", async () => {
    const memberCookie = await login("E2E_disposable_member", "0000");
    const staffCookie = await login("E2E_disposable_staff", "0000");
    const dmCookie = await login("E2E_disposable_dm", "0000");
    const plCookie = await login("E2E_disposable_pl", "0000");
    const adminCookie = await login("E2E_disposable_admin", "0000");
    const customCookie = await login("c487-custom", "c487-custom-password");

    const member = await bootstrap(memberCookie);
    expect(member.user.systemRole).toBeNull();
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

    const staff = await bootstrap(staffCookie);
    expect(staff.user.systemRole).toBe("Staff");
    expect(staff.sections.map(({ key }) => key)).toContain("management");
    expect(staff.sections.map(({ key }) => key)).toContain("events");

    const department = await bootstrap(dmCookie);
    expect(department.user.systemRole).toBeNull();
    expect(department.user.identities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "成人部門管理者",
          scopeKind: "Department",
          scopeLabel: "成區",
        }),
      ])
    );
    expect(department.sections.map(({ key }) => key)).toContain("management");
    expect(department.sections.map(({ key }) => key)).toContain("events");

    const program = await bootstrap(plCookie);
    expect(program.user.systemRole).toBeNull();
    expect(program.user.identities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "青少年查經帶領",
          scopeKind: "Program",
          scopeLabel: "E2E_DISPOSABLE_青少年查經",
        }),
      ])
    );
    expect(program.sections.map(({ key }) => key)).toContain("management");
    expect(program.sections.map(({ key }) => key)).toContain("events");

    const custom = await bootstrap(customCookie);
    expect(custom.user.systemRole).toBeNull();
    expect(custom.user.identities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "自訂課程操作員",
          scopeKind: "Program",
          scopeLabel: "E2E_DISPOSABLE_青少年查經",
        }),
      ])
    );
    expect(custom.sections.map(({ key }) => key)).toContain("management");

    const admin = await bootstrap(adminCookie);
    expect(admin.user.systemRole).toBe("Admin");
    expect(admin.user.capabilities["home.publish"]).toBe(true);
    expect(admin.user.capabilities["role.permissions.write"]).toBe(true);
    expect(admin.sections.map(({ key }) => key)).toContain("management");
    expect(admin.sections.map(({ key }) => key)).toContain("events");

    for (const projection of [
      member,
      staff,
      department,
      program,
      custom,
      admin,
    ]) {
      const serialized = JSON.stringify(projection);
      expect(serialized).not.toContain("credential_hash");
      expect(serialized).not.toContain("legacy_pin_hash");
      expect(serialized).not.toContain("refreshToken");
      expect(serialized).not.toContain("session_id");
    }

    // The legacy display field is not an authority source: changing it must
    // not promote a Member or erase a normalized scoped identity.
    await testDb()
      .prepare("UPDATE accounts SET role = 'Admin' WHERE user_id = ?")
      .bind("E2E_DISPOSABLE_MEMBER")
      .run();
    await testDb()
      .prepare("UPDATE accounts SET role = 'Member' WHERE user_id = ?")
      .bind("E2E_DISPOSABLE_PL")
      .run();
    try {
      const tamperedMember = await bootstrap(memberCookie);
      expect(tamperedMember.sections.map(({ key }) => key)).not.toContain(
        "management"
      );
      expect(tamperedMember.user.capabilities["program.enroll"]).toBe(true);
      const tamperedProgram = await bootstrap(plCookie);
      expect(tamperedProgram.sections.map(({ key }) => key)).toContain(
        "management"
      );
      expect(tamperedProgram.user.identities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: "青少年查經帶領" }),
        ])
      );
    } finally {
      await testDb()
        .prepare("UPDATE accounts SET role = 'Member' WHERE user_id = ?")
        .bind("E2E_DISPOSABLE_MEMBER")
        .run();
      await testDb()
        .prepare("UPDATE accounts SET role = 'Staff' WHERE user_id = ?")
        .bind("E2E_DISPOSABLE_PL")
        .run();
    }
  });

  test("C-487-02 Programs use one exact-scope resolver for Staff, DM, PL, and Custom", async () => {
    const cookies = {
      member: await login("E2E_disposable_member", "0000"),
      staff: await login("E2E_disposable_staff", "0000"),
      dm: await login("E2E_disposable_dm", "0000"),
      pl: await login("E2E_disposable_pl", "0000"),
      custom: await login("c487-custom", "c487-custom-password"),
    };

    const capabilities = await Promise.all(
      Object.entries(cookies).map(async ([persona, cookie]) => {
        const response = await withCookie("/api/v1/programs/access", cookie);
        expect(response.status, persona).toBe(200);
        return [
          persona,
          await envelope<{
            hasManagementCapability: boolean;
            departmentScopes: number;
            programScopes: number;
          }>(response),
        ] as const;
      })
    );
    const accessByPersona = Object.fromEntries(capabilities);
    expect(accessByPersona.member.hasManagementCapability).toBe(false);
    expect(accessByPersona.staff.hasManagementCapability).toBe(true);
    expect(accessByPersona.dm.hasManagementCapability).toBe(true);
    expect(accessByPersona.pl.hasManagementCapability).toBe(true);
    expect(accessByPersona.custom.hasManagementCapability).toBe(true);
    expect(accessByPersona.dm.departmentScopes).toBeGreaterThan(0);
    expect(accessByPersona.pl.programScopes).toBeGreaterThan(0);
    expect(accessByPersona.custom.programScopes).toBeGreaterThan(0);
    const departmentScopedProgramCapabilities = await resolveActorCapabilities(
      testDb(),
      "E2E_DISPOSABLE_DM",
      { programId: ADULT_PROGRAM }
    );
    expect(departmentScopedProgramCapabilities["program.manage"]).toBe(true);
    expect(departmentScopedProgramCapabilities["role.assign"]).toBe(true);

    for (const [persona, programId, expected] of [
      ["dm", ADULT_PROGRAM, 200],
      ["pl", YOUTH_PROGRAM, 200],
      ["custom", YOUTH_PROGRAM, 200],
    ] as const) {
      const response = await withCookie(
        `/api/v1/programs/${programId}/management`,
        cookies[persona]
      );
      expect(response.status, persona).toBe(expected);
      const data = await envelope<{
        program: {
          program_id: string;
          capabilities: {
            role_read?: boolean;
            role_assign?: boolean;
            role_revoke?: boolean;
          };
        };
      }>(response);
      expect(data.program.program_id).toBe(programId);
      if (persona === "dm" || persona === "pl") {
        expect(data.program.capabilities.role_read).toBe(true);
        expect(data.program.capabilities.role_assign).toBe(true);
        expect(data.program.capabilities.role_revoke).toBe(true);
      } else {
        expect(data.program.capabilities.role_read).not.toBe(true);
        expect(data.program.capabilities.role_assign).not.toBe(true);
        expect(data.program.capabilities.role_revoke).not.toBe(true);
      }
    }

    for (const [persona, programId] of [
      ["dm", YOUTH_PROGRAM],
      ["pl", ADULT_PROGRAM],
      ["member", YOUTH_PROGRAM],
    ] as const) {
      const response = await withCookie(
        `/api/v1/programs/${programId}/management`,
        cookies[persona]
      );
      await problem(response, 404, "NOT_FOUND");
    }

    const moduleDenied = await withCookie(
      `/api/v1/programs/departments/${YOUTH_DEPARTMENT}/modules/events/enable`,
      cookies.custom,
      { method: "POST" }
    );
    await problem(moduleDenied, 403, "FORBIDDEN");
    const moduleAllowed = await withCookie(
      `/api/v1/programs/departments/${YOUTH_DEPARTMENT}/modules/events/enable`,
      cookies.staff,
      { method: "POST" }
    );
    expect(moduleAllowed.status).toBe(200);
    await envelope(moduleAllowed);

    const plDecision = await withCookie(
      `/api/v1/programs/${YOUTH_PROGRAM}/enrollment-requests/${TARGET_REQUEST_PL}/decision`,
      cookies.pl,
      {
        method: "POST",
        headers: { "Idempotency-Key": "C487-PL-DECISION" },
        body: JSON.stringify({ action: "Rejected", request_version: 1 }),
      }
    );
    expect(plDecision.status).toBe(200);
    await envelope(plDecision);

    const customDecision = await withCookie(
      `/api/v1/programs/${YOUTH_PROGRAM}/enrollment-requests/${TARGET_REQUEST_CUSTOM}/decision`,
      cookies.custom,
      {
        method: "POST",
        headers: { "Idempotency-Key": "C487-CUSTOM-DECISION" },
        body: JSON.stringify({ action: "Rejected", request_version: 1 }),
      }
    );
    expect(customDecision.status).toBe(200);
    await envelope(customDecision);

    const memberDecision = await withCookie(
      `/api/v1/programs/${YOUTH_PROGRAM}/enrollment-requests/${TARGET_REQUEST_MEMBER}/decision`,
      cookies.member,
      {
        method: "POST",
        headers: { "Idempotency-Key": "C487-MEMBER-DECISION" },
        body: JSON.stringify({ action: "Rejected", request_version: 1 }),
      }
    );
    await problem(memberDecision, 403, "FORBIDDEN");
  });

  test("C-487-03 attendance chooser and assisted mutation enforce Program/Department scope", async () => {
    const member = await login("E2E_disposable_member", "0000");
    const dm = await login("E2E_disposable_dm", "0000");
    const pl = await login("E2E_disposable_pl", "0000");
    const custom = await login("c487-custom", "c487-custom-password");

    const plEvents = await withCookie("/api/v1/attendance/events", pl);
    expect(plEvents.status).toBe(200);
    const plEventData = await envelope<{ events: { event_id: string }[] }>(
      plEvents
    );
    expect(plEventData.events.map(({ event_id }) => event_id)).toContain(
      YOUTH_EVENT
    );
    expect(plEventData.events.map(({ event_id }) => event_id)).not.toContain(
      ADULT_EVENT
    );

    const dmEvents = await withCookie("/api/v1/attendance/events", dm);
    expect(dmEvents.status).toBe(200);
    const dmEventData = await envelope<{ events: { event_id: string }[] }>(
      dmEvents
    );
    expect(dmEventData.events.map(({ event_id }) => event_id)).toContain(
      ADULT_EVENT
    );
    expect(dmEventData.events.map(({ event_id }) => event_id)).not.toContain(
      YOUTH_EVENT
    );

    const customEvents = await withCookie(
      "/api/v1/attendance/scanner-events",
      custom
    );
    expect(customEvents.status).toBe(200);
    const customEventData = await envelope<{ events: { event_id: string }[] }>(
      customEvents
    );
    expect(customEventData.events.map(({ event_id }) => event_id)).toContain(
      YOUTH_EVENT
    );

    const memberEvents = await withCookie("/api/v1/attendance/events", member);
    expect(memberEvents.status).toBe(200);
    const memberEventData = await envelope<{ events: { event_id: string }[] }>(
      memberEvents
    );
    expect(memberEventData.events).toStrictEqual([]);

    const plCheckIn = await withCookie(
      `/api/v1/attendance/events/${YOUTH_EVENT}/check-in`,
      pl,
      {
        method: "POST",
        body: JSON.stringify({
          member_user_id: TARGET_USER,
          method: "leader_manual_search",
        }),
      }
    );
    expect(plCheckIn.status).toBe(201);
    const plResult = await envelope<{ outcome: string }>(plCheckIn);
    expect(plResult.outcome).toBe("success");

    const customCheckIn = await withCookie(
      `/api/v1/attendance/events/${YOUTH_EVENT}/check-in`,
      custom,
      {
        method: "POST",
        body: JSON.stringify({
          member_user_id: "E2E_DISPOSABLE_MEMBER",
          method: "leader_manual_search",
        }),
      }
    );
    expect(customCheckIn.status).toBe(201);
    const customResult = await envelope<{ outcome: string }>(customCheckIn);
    expect(customResult.outcome).toBe("success");

    const dmCheckIn = await withCookie(
      `/api/v1/attendance/events/${ADULT_EVENT}/check-in`,
      dm,
      {
        method: "POST",
        body: JSON.stringify({
          member_user_id: TARGET_USER,
          method: "leader_manual_search",
        }),
      }
    );
    expect(dmCheckIn.status).toBe(201);
    await envelope(dmCheckIn);

    const memberDenied = await withCookie(
      `/api/v1/attendance/events/${ADULT_EVENT}/check-in`,
      member,
      {
        method: "POST",
        body: JSON.stringify({
          member_user_id: TARGET_USER,
          method: "leader_manual_search",
        }),
      }
    );
    await problem(memberDenied, 403, "FORBIDDEN");

    const expired = await signAccessToken(SECRET, {
      sid: "C487-EXPIRED",
      uid: "E2E_DISPOSABLE_PL",
      iat: Date.now() - 120_000,
      exp: Date.now() - 1,
    });
    const expiredAttendance = await worker.fetch(
      request("/api/v1/attendance/events", {
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${expired}` },
      }),
      testEnv()
    );
    await problem(expiredAttendance, 401, "AUTH_REQUIRED");
  });

  test("C-487-04 management and directories use normalized authority, not accounts.role", async () => {
    const member = await login("E2E_disposable_member", "0000");
    const staff = await login("E2E_disposable_staff", "0000");
    const custom = await login("c487-custom", "c487-custom-password");

    const memberHub = await withCookie("/api/v1/programs/hub", member);
    expect(memberHub.status).toBe(200);
    const memberHubData = await envelope<{
      groups: unknown[];
      entryCard: unknown;
    }>(memberHub);
    expect(memberHubData.groups).toStrictEqual([]);
    expect(memberHubData.entryCard).toBeNull();

    const customHub = await withCookie("/api/v1/programs/hub", custom);
    expect(customHub.status).toBe(200);
    const customHubData = await envelope<{
      groups: { rows: { key: string }[] }[];
      entryCard: unknown;
    }>(customHub);
    expect(
      customHubData.groups.flatMap(({ rows }) => rows.map(({ key }) => key))
    ).toContain("attendance");
    expect(customHubData.entryCard).not.toBeNull();

    const staffAccounts = await withCookie(
      "/api/v1/programs/accounts?q=C487",
      staff
    );
    expect(staffAccounts.status).toBe(200);
    const accountData = await envelope<{
      accounts: { userId: string; role: string }[];
    }>(staffAccounts);
    expect(
      accountData.accounts.some(({ userId }) => userId === CUSTOM_USER)
    ).toBe(true);

    const memberAccounts = await withCookie(
      "/api/v1/programs/accounts?q=C487",
      member
    );
    await problem(memberAccounts, 403, "FORBIDDEN");

    const customAccounts = await withCookie(
      "/api/v1/programs/accounts?q=C487",
      custom
    );
    await problem(customAccounts, 403, "FORBIDDEN");

    const staffMembers = await withCookie(
      "/api/v1/programs/members?q=Disposable",
      staff
    );
    expect(staffMembers.status).toBe(200);
    await envelope(staffMembers);

    const memberMembers = await withCookie(
      "/api/v1/programs/members?q=Disposable",
      member
    );
    await problem(memberMembers, 403, "FORBIDDEN");

    await testDb()
      .prepare("UPDATE accounts SET role = 'Member' WHERE user_id = ?")
      .bind("E2E_DISPOSABLE_STAFF")
      .run();
    try {
      const staffAccess = await withCookie("/api/v1/programs/access", staff);
      expect(staffAccess.status).toBe(200);
      const data = await envelope<{ hasManagementCapability: boolean }>(
        staffAccess
      );
      expect(data.hasManagementCapability).toBe(true);
    } finally {
      await testDb()
        .prepare("UPDATE accounts SET role = 'Staff' WHERE user_id = ?")
        .bind("E2E_DISPOSABLE_STAFF")
        .run();
    }
  });

  test("C-487-05/C-487-06 fresh schema and preflight keep legacy authority absent", async () => {
    const db = testDb();
    const tables = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
      )
      .all<{ name: string }>();
    const tableNames = (tables.results ?? []).map(({ name }) => name);
    for (const legacyTable of [
      "role_capabilities",
      "department_managers",
      "program_leaders",
      "permission_policy_state",
      "permission_policy_mutations",
    ]) {
      expect(tableNames).not.toContain(legacyTable);
    }
    expect(tableNames).toContain("role_definitions");
    expect(tableNames).toContain("role_assignments");
    expect(tableNames).toContain("role_definition_grants");

    const seeded = await db
      .prepare(
        `SELECT stable_key, is_protected FROM role_definitions
          WHERE stable_key IN ('admin', 'staff', 'member')
          ORDER BY position`
      )
      .all<{ stable_key: string; is_protected: number }>();
    expect(seeded.results).toStrictEqual([
      { stable_key: "admin", is_protected: 1 },
      { stable_key: "staff", is_protected: 0 },
      { stable_key: "member", is_protected: 1 },
    ]);
    const adminAssignments = await db
      .prepare(
        `SELECT rd.stable_key
           FROM role_assignments ra
           JOIN role_definitions rd
             ON rd.role_definition_id = ra.role_definition_id
          WHERE ra.account_user_id = 'E2E_DISPOSABLE_ADMIN'
            AND ra.revoked_at IS NULL
          ORDER BY rd.position`
      )
      .all<{ stable_key: string }>();
    expect(adminAssignments.results).toStrictEqual([{ stable_key: "admin" }]);
    const memberAssignments = await db
      .prepare(
        `SELECT ra.assignment_id
           FROM role_assignments ra
          WHERE ra.account_user_id = 'E2E_DISPOSABLE_MEMBER'
            AND ra.revoked_at IS NULL`
      )
      .all<{ assignment_id: string }>();
    expect(memberAssignments.results).toStrictEqual([]);

    await db
      .prepare("CREATE TABLE IF NOT EXISTS C487_LEGACY_MARKER (marker TEXT)")
      .run();
    try {
      const stale = await preflightDisposableSchema(db, {
        databaseName: DATABASE,
      });
      expect(stale.kind).toBe("ok");

      await db
        .prepare("CREATE TABLE permission_policy_state (marker TEXT)")
        .run();
      const legacy = await preflightDisposableSchema(db, {
        databaseName: DATABASE,
      });
      expect(legacy.kind).toBe("stale-schema");
      if (legacy.kind !== "stale-schema") {
        throw new Error("expected stale-schema preflight result");
      }
      expect(legacy.legacyTables).toContain("permission_policy_state");
      expect(legacy.resetCommand).toContain("DROP TABLE IF EXISTS");
      const stillThere = await db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'permission_policy_state'"
        )
        .first<{ name: string }>();
      expect(stillThere?.name).toBe("permission_policy_state");
    } finally {
      await db.prepare("DROP TABLE IF EXISTS permission_policy_state").run();
      await db.prepare("DROP TABLE IF EXISTS C487_LEGACY_MARKER").run();
    }

    const memberCapabilities = await resolveActorCapabilities(
      db,
      "E2E_DISPOSABLE_MEMBER"
    );
    expect(memberCapabilities["program.enroll"]).toBe(true);
    expect(memberCapabilities["home.publish"]).not.toBe(true);
    const adminCapabilities = await resolveActorCapabilities(
      db,
      "E2E_DISPOSABLE_ADMIN"
    );
    expect(adminCapabilities["home.publish"]).toBe(true);
  });

  test("expired bootstrap sessions fail closed", async () => {
    const expired = await signAccessToken(SECRET, {
      sid: "C487-EXPIRED-ME",
      uid: "E2E_DISPOSABLE_ADMIN",
      iat: Date.now() - 120_000,
      exp: Date.now() - 1,
    });
    const response = await worker.fetch(
      request("/api/v1/auth/me", {
        headers: { Cookie: `${ACCESS_COOKIE_NAME}=${expired}` },
      }),
      testEnv()
    );
    await problem(response, 401, "AUTH_REQUIRED");
  });
});
