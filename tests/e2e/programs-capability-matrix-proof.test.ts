/* oxlint-disable vitest/prefer-importing-vitest-globals */
// Programs Capability-Matrix Proof (REL-01 #261 — Slice B)
//
// Proves the capability-authorizer.ts model at the API layer with direct requests
// (no UI), using the verified three-tier resolution order:
//   1. role-global hasCapability(role, ...) — checked FIRST, short-circuits scope;
//   2. Department scope (hasDepartmentManagement) — department-manager grants;
//   3. Program scope (hasProgramLeadership) — program-leader grants.
//
// Actor split (deliberately isolated so each test exercises exactly one tier):
//   - DEV_MEMBER: Program Leader of Program A only            -> Test 1 (Program tier)
//   - DEV_STAFF:  Department Manager of Dept X only           -> Test 2 Probe A
//     (documents Staff's role-global department breadth) and Test 3 (role-global
//     Program breadth)
//   - DEV_MEMBER: Department Manager of Dept M only (M != X)  -> Test 2 Probe B
//     (Department tier — genuine 403 cross-department denial)
//   - DEV_ADMIN:  no explicit grants                          -> Test 3 (role-global
//     breadth)
//
// ⚠ ORCHESTRATOR TRIAGE — verified discrepancy vs the dispatch's expectation:
//
// The dispatch specified Test 2 as "Department Manager of Department X is denied a
// direct mutation scoped to Department Y via API" using DEV_STAFF (granted Department
// Manager of X only), expecting 403. The verified model contradicts that expectation:
//
//   - role_capabilities (migration 0003_d1_program_domain.sql seed, INSERT OR IGNORE
//     lines 397-410; no later migration revokes them) grants Staff EVERY department
//     and program capability role-globally: department.manage, department.publish,
//     department.module.configure, program.manage, program.publish,
//     program.leader.assign. Member holds only program.enroll.
//   - D1CapabilityAuthorizer.can() (web/lib/programs/capability-authorizer.ts)
//     checks hasCapability(ctx.actorRole, capability) FIRST and returns true
//     immediately for role-global grants — the scope grants
//     (hasDepartmentManagement / hasProgramLeadership) are only consulted for roles
//     WITHOUT the global grant.
//
//   => DEV_STAFF PATCH /api/v1/programs/departments/:deptYId returns 200, not 403.
//      This is EXISTING, intended behavior — web/lib/programs/programs.test.ts header:
//      "Admin/Staff can create/list/update departments and programs. Members are
//      denied management operations (403)." Test 2 Probe A therefore asserts the
//      OBSERVED 200 and documents the discrepancy instead of asserting a 403 the code
//      cannot produce. No authorization source file was modified (non-goal honored).
//
//   - To still prove the department-scope denial tier the acceptance trace's Slice B
//     item 2 requires (a Department Manager denied on a resource outside their
//     department, 403), Test 2 Probe B uses DEV_MEMBER as Department Manager of a
//     dedicated fresh department (Dept M, separate from Dept X) — Member is the only
//     role for which the department-scope tier is load-bearing. This deviates from
//     the dispatch's "DEV_MEMBER Program-Leader-only" split, but does NOT confound
//     Test 1: Programs A/B live in Dept X, and the Member manager grant is on Dept M
//     only, so Member's PATCH on Program B still resolves 403 via Program scope.
//
// Triage decision needed: is Staff's role-global department/program policy intended
// (then the dispatch's Test-2 expectation was simply wrong and this suite documents
// correct behavior), or should Staff be department-scoped (then the role_capabilities
// seed in migration 0003 needs a change — explicitly out of scope for this ticket)?
//
// This file is API-only, so it defines no local COPY object: the self-contained-file
// convention's COPY exists to avoid importing web/lib/copy.ts from the app for UI
// strings, and no UI strings are needed here.

import { expect, test } from "@playwright/test";
import type { APIRequestContext, PlaywrightWorkerArgs } from "@playwright/test";

import { DEV_ADMIN, DEV_STAFF, DEV_MEMBER } from "./dev-fixtures";

interface StorageState {
  cookies: {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Strict" | "Lax" | "None";
  }[];
  origins: {
    origin: string;
    localStorage: { name: string; value: string }[];
  }[];
}

type RequestFactory = Pick<PlaywrightWorkerArgs["playwright"], "request">;
const TARGET_URL = process.env.PROGRAMS_TARGET_URL ?? "http://127.0.0.1:8787";
const AUTH_HINT_KEY = "efcc_auth_active";

const ADMIN_USER = process.env.PROGRAMS_ADMIN_USERNAME ?? DEV_ADMIN.username;
const ADMIN_CRED =
  process.env.PROGRAMS_ADMIN_CREDENTIAL ?? DEV_ADMIN.credential;
const STAFF_USER = process.env.PROGRAMS_STAFF_USERNAME ?? DEV_STAFF.username;
const STAFF_CRED =
  process.env.PROGRAMS_STAFF_CREDENTIAL ?? DEV_STAFF.credential;
const MEMBER_USER = process.env.PROGRAMS_MEMBER_USERNAME ?? DEV_MEMBER.username;
const MEMBER_CRED =
  process.env.PROGRAMS_MEMBER_CREDENTIAL ?? DEV_MEMBER.credential;

function fresh(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required credential for ${name}`);
  }
  return value;
}

function storageStateFromCookies(
  setCookieHeaders: string[],
  domain: string
): StorageState {
  const cookies = setCookieHeaders.map((header) => {
    const [pair, ...rest] = header.split(";");
    const eq = pair.indexOf("=");
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    const attrs = new Map(
      rest.map((part) => {
        const trimmed = part.trim();
        const sep = trimmed.indexOf("=");
        return sep === -1
          ? [trimmed.toLowerCase(), ""]
          : [trimmed.slice(0, sep).toLowerCase(), trimmed.slice(sep + 1)];
      })
    );
    const maxAge = attrs.get("max-age");
    const sameSite = attrs.get("samesite");
    return {
      name,
      value,
      domain,
      path: attrs.get("path") ?? "/",
      expires: maxAge ? Math.floor(Date.now() / 1000) + Number(maxAge) : -1,
      httpOnly: attrs.has("httponly"),
      secure: attrs.has("secure"),
      sameSite:
        sameSite === "Lax" ? "Lax" : sameSite === "None" ? "None" : "Strict",
    } as const satisfies StorageState["cookies"][number];
  });
  return { cookies, origins: [] };
}

async function loginApi(
  playwright: RequestFactory,
  usernameInput: string,
  passwordInput: string
): Promise<{ api: APIRequestContext; storageState: StorageState }> {
  const loginContext = await playwright.request.newContext({
    baseURL: TARGET_URL,
  });
  const response = await loginContext.post("/api/v1/auth/login", {
    headers: { Origin: new URL(TARGET_URL).origin },
    data: { username: usernameInput, password: passwordInput },
  });
  expect(response.status()).toBe(200);
  const setCookieHeaders = response
    .headersArray()
    .filter(({ name }) => name.toLowerCase() === "set-cookie")
    .map(({ value }) => value);
  const storageState: StorageState = storageStateFromCookies(
    setCookieHeaders,
    new URL(TARGET_URL).hostname
  );
  storageState.origins = [
    {
      origin: new URL(TARGET_URL).origin,
      localStorage: [{ name: AUTH_HINT_KEY, value: "1" }],
    },
  ];
  const cookieHeader = setCookieHeaders
    .map((header) => header.split(";", 1)[0])
    .join("; ");
  await loginContext.dispose();
  const api = await playwright.request.newContext({
    baseURL: TARGET_URL,
    extraHTTPHeaders: { Cookie: cookieHeader },
  });
  return { api, storageState };
}

async function postJson(
  api: APIRequestContext,
  path: string,
  data: unknown
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await api.post(path, { data });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    // Non-JSON response
  }
  return { status: res.status(), body };
}

// ---------------------------------------------------------------------------
// Fixture-creation helpers (shapes verified against the running app; the same
// surfaces used by programs-vertical-proof.test.ts).
// ---------------------------------------------------------------------------

async function createDepartment(
  api: APIRequestContext,
  code: string
): Promise<string> {
  const res = await postJson(api, "/api/v1/programs/departments", {
    code,
    name: `Capability Matrix ${code}`,
    lifecycle: "Active",
  });
  expect(res.status).toBe(201);
  return (res.body.data as { department: { department_id: string } }).department
    .department_id;
}

async function createProgram(
  api: APIRequestContext,
  departmentId: string,
  name: string
): Promise<string> {
  const res = await postJson(
    api,
    `/api/v1/programs/departments/${departmentId}/programs`,
    {
      name,
      category: "測試",
      behavior_type: "Recurring",
      lifecycle: "Active",
      discoverability: "Listed",
      enrollment_mode: "ManagerOnly",
    }
  );
  expect(res.status).toBe(201);
  return (res.body.data as { program: { program_id: string } }).program
    .program_id;
}

async function enableModule(
  api: APIRequestContext,
  departmentId: string,
  moduleKey: string
): Promise<void> {
  const res = await api.post(
    `/api/v1/programs/departments/${departmentId}/modules/${moduleKey}/enable`
  );
  expect(res.status()).toBe(200);
}

interface ProofFixtures {
  deptXId: string;
  programAId: string;
  programBId: string;
  deptYId: string;
  programCId: string;
  deptMId: string;
  programEId: string;
  deptZId: string;
  programDId: string;
  adminContext: { storageState: StorageState };
  staffContext: { storageState: StorageState };
  memberContext: { storageState: StorageState };
}

let fixtures: ProofFixtures;
let adminApi: APIRequestContext | undefined;
let staffApi: APIRequestContext | undefined;
let memberApi: APIRequestContext | undefined;

function apiOf(
  ref: APIRequestContext | undefined,
  who: string
): APIRequestContext {
  if (!ref) {
    throw new Error(
      `API context for ${who} is unavailable (beforeAll failed?)`
    );
  }
  return ref;
}

const ALL_MODULES = [
  "program_catalog",
  "events",
  "enrollment",
  "attendance",
] as const;

test.beforeAll(async ({ playwright }) => {
  const adminLogin = await loginApi(
    playwright,
    required("PROGRAMS_ADMIN_USERNAME", ADMIN_USER),
    required("PROGRAMS_ADMIN_CREDENTIAL", ADMIN_CRED)
  );
  const staffLogin = await loginApi(
    playwright,
    required("PROGRAMS_STAFF_USERNAME", STAFF_USER),
    required("PROGRAMS_STAFF_CREDENTIAL", STAFF_CRED)
  );
  const memberLogin = await loginApi(
    playwright,
    required("PROGRAMS_MEMBER_USERNAME", MEMBER_USER),
    required("PROGRAMS_MEMBER_CREDENTIAL", MEMBER_CRED)
  );
  adminApi = adminLogin.api;
  staffApi = staffLogin.api;
  memberApi = memberLogin.api;

  // 1. Department X (all 4 modules) containing Programs A and B — the pure
  //    Program-Leader scope tier lives here (DEV_MEMBER is leader of A only).
  const deptXId = await createDepartment(adminApi, fresh("DEPT_X"));
  for (const moduleKey of ALL_MODULES) {
    await enableModule(adminApi, deptXId, moduleKey);
  }
  const programAId = await createProgram(adminApi, deptXId, fresh("PROG_A"));
  const programBId = await createProgram(adminApi, deptXId, fresh("PROG_B"));

  // 2. Department Y (program_catalog enabled) containing Program C — the
  //    out-of-scope target for Test 2's cross-department probes.
  const deptYId = await createDepartment(adminApi, fresh("DEPT_Y"));
  await enableModule(adminApi, deptYId, "program_catalog");
  const programCId = await createProgram(adminApi, deptYId, fresh("PROG_C"));

  // 3. Department M (all 4 modules) containing Program E — the department-scope
  //    tier lives here (DEV_MEMBER is Department Manager of M only; M != X so the
  //    Member manager grant cannot leak into Test 1's Program-scope denial).
  const deptMId = await createDepartment(adminApi, fresh("DEPT_M"));
  for (const moduleKey of ALL_MODULES) {
    await enableModule(adminApi, deptMId, moduleKey);
  }
  const programEId = await createProgram(adminApi, deptMId, fresh("PROG_E"));

  // 4. Department Z (program_catalog enabled) containing Program D — Test 3's
  //    role-global breadth target. NO explicit leader/manager grants for anyone.
  const deptZId = await createDepartment(adminApi, fresh("DEPT_Z"));
  await enableModule(adminApi, deptZId, "program_catalog");
  const programDId = await createProgram(adminApi, deptZId, fresh("PROG_D"));

  // 5. Grants — each exactly one scope tier, isolated across actors/departments:
  //    DEV_MEMBER -> Program Leader of A (Program scope, Dept X)
  //    DEV_STAFF  -> Department Manager of X (Department scope, Dept X)
  //    DEV_MEMBER -> Department Manager of M (Department scope, Dept M)
  //    DEV_ADMIN  -> no explicit grant anywhere (role-global only)
  const leaderRes = await postJson(
    adminApi,
    `/api/v1/programs/${programAId}/leaders`,
    { user_id: DEV_MEMBER.userId }
  );
  expect(leaderRes.status).toBe(200);
  const staffManagerRes = await postJson(
    adminApi,
    `/api/v1/programs/departments/${deptXId}/managers`,
    { user_id: DEV_STAFF.userId }
  );
  expect(staffManagerRes.status).toBe(200);
  const memberManagerRes = await postJson(
    adminApi,
    `/api/v1/programs/departments/${deptMId}/managers`,
    { user_id: DEV_MEMBER.userId }
  );
  expect(memberManagerRes.status).toBe(200);

  fixtures = {
    deptXId,
    programAId,
    programBId,
    deptYId,
    programCId,
    deptMId,
    programEId,
    deptZId,
    programDId,
    adminContext: { storageState: adminLogin.storageState },
    staffContext: { storageState: staffLogin.storageState },
    memberContext: { storageState: memberLogin.storageState },
  };
});

test.afterAll(async () => {
  // API contexts are kept alive across the API-only tests (unlike the
  // UI-driven vertical proof, which disposes them in beforeAll).
  await adminApi?.dispose();
  await staffApi?.dispose();
  await memberApi?.dispose();
});

test("Test 1 — Program Leader of Program A is denied a direct mutation on Program B via API", async () => {
  const memberApiRef = apiOf(memberApi, "DEV_MEMBER");

  // DEV_MEMBER's ONLY explicit grant is Program Leader of Program A. Program B
  // shares Department X but has no leadership grant: hasProgramLeadership(MEMBER,
  // B) is false and Member holds no role-global program.manage, so the Program
  // scope tier must deny the PATCH with 403 (scope-specific, not a blanket ban).
  const denied = await memberApiRef.patch(
    `/api/v1/programs/${fixtures.programBId}`,
    { data: { name: "Should Be Denied" } }
  );
  expect(denied.status()).toBe(403);

  // Positive control: the same actor PATCHes Program A itself -> 200. Proves the
  // denial above is scope-specific (leadership grant on A is intact and works).
  const allowed = await memberApiRef.patch(
    `/api/v1/programs/${fixtures.programAId}`,
    { data: { name: fresh("Renamed A") } }
  );
  expect(allowed.status()).toBe(200);
});

test("Test 2 — Department-scope tier: Member Department Manager of Dept M denied on Dept Y (403); Staff's cross-department access is role-global, not scope-granted (200)", async () => {
  const staffApiRef = apiOf(staffApi, "DEV_STAFF");
  const memberApiRef = apiOf(memberApi, "DEV_MEMBER");

  // Probe A — DEV_STAFF (Department Manager of Dept X only) mutates Department Y
  // (PATCH /api/v1/programs/departments/:deptYId, payload {name} per
  // handleUpdateDepartment in program-handlers.ts). The dispatch expected 403
  // here; the verified model yields 200 because Staff holds department.manage
  // role-globally (migration 0003 seed) and D1CapabilityAuthorizer.can()
  // short-circuits on hasCapability() before any scope check. Documented as the
  // observed behavior; flagged at the top of this file for orchestrator triage.
  const staffProbe = await staffApiRef.patch(
    `/api/v1/programs/departments/${fixtures.deptYId}`,
    { data: { name: fresh("DeptY Staff Rename") } }
  );
  expect(staffProbe.status()).toBe(200);

  // Probe B — DEV_MEMBER (Department Manager of Dept M only) is denied the same
  // Department-Y-scoped mutation: Member holds no role-global department
  // capability, so the department-scope tier is load-bearing and enforced.
  const denied = await memberApiRef.patch(
    `/api/v1/programs/departments/${fixtures.deptYId}`,
    { data: { name: fresh("DeptY Member Rename") } }
  );
  expect(denied.status()).toBe(403);

  // Positive control 1 — same actor, equivalent mutation within Dept M -> 200
  // (department-management scope on M is real and works).
  const allowedDept = await memberApiRef.patch(
    `/api/v1/programs/departments/${fixtures.deptMId}`,
    { data: { name: fresh("DeptM Rename") } }
  );
  expect(allowedDept.status()).toBe(200);

  // Positive control 2 — department scope confers PROGRAM_MANAGE on Programs
  // within the department (DEPARTMENT_PROGRAM_CAPABILITIES inheritance in
  // capability-authorizer.ts): PATCH Program E (Dept M) -> 200.
  const allowedProgram = await memberApiRef.patch(
    `/api/v1/programs/${fixtures.programEId}`,
    { data: { name: fresh("Program E Rename") } }
  );
  expect(allowedProgram.status()).toBe(200);
});

test("Test 3 — Staff and Admin both manage a fresh Program D neither was explicitly granted leader/manager rights on, via direct API", async () => {
  const staffApiRef = apiOf(staffApi, "DEV_STAFF");
  const adminApiRef = apiOf(adminApi, "DEV_ADMIN");

  // Program D (Dept Z) carries NO explicit leader/manager grant for DEV_STAFF or
  // DEV_ADMIN. hasCapability(role, "program.manage") is role-global and checked
  // before any scope grant, so both roles manage D by policy alone.
  const staffRes = await staffApiRef.patch(
    `/api/v1/programs/${fixtures.programDId}`,
    { data: { name: fresh("Staff-managed D") } }
  );
  expect(staffRes.status()).toBe(200);

  const adminRes = await adminApiRef.patch(
    `/api/v1/programs/${fixtures.programDId}`,
    { data: { name: fresh("Admin-managed D") } }
  );
  expect(adminRes.status()).toBe(200);

  // Contrast (comment only, per dispatch — no assertion): DEV_MEMBER would get
  // 403 on this same unscoped Program D. Member holds no role-global grant
  // (only program.enroll) and no explicit scope grant on D/Z, so PATCH D
  // resolves through the same denial path Test 1 proves for Program B.
});
