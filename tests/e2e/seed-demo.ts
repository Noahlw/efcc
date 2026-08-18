/* oxlint-disable eslint/complexity -- demo seed orchestrates many idempotent API steps */
/* oxlint-disable eslint/complexity -- demo seed orchestrates many idempotent API steps */
/**
 * Local-only E2E_DEMO_ domain seed for the Worker + D1 walkthrough.
 *
 * This intentionally drives the public API rather than printing SQL: the
 * recurring program is seeded through the real schedule-rule and event
 * generation endpoints. Re-running the command is safe because department
 * and program rows are found by their stable E2E_DEMO_ identifiers, schedule
 * rules are found before creation, and event generation is database-idempotent.
 */
import { DEV_ADMIN, DEV_MEMBER } from "./dev-fixtures";

const DEFAULT_TARGET_URL = "http://127.0.0.1:8787";
const targetUrl = process.env.DEMO_TARGET_URL ?? DEFAULT_TARGET_URL;

const DEPARTMENT = {
  code: "E2E_DEMO_MINISTRY",
  name: "E2E_DEMO_示範事工",
  description: "本機示範資料；不可用於生產環境。",
} as const;

const PROGRAMS = [
  {
    name: "E2E_DEMO_成人查經",
    description: "每週聚會的本機示範課程。",
    category: "門徒訓練",
    behavior_type: "Recurring" as const,
    lifecycle: "Active" as const,
    discoverability: "Listed" as const,
    enrollment_mode: "MemberRequest" as const,
    display_order: 1,
  },
  {
    name: "E2E_DEMO_青年團契",
    description: "一次性聚會的本機示範課程。",
    category: "團契",
    behavior_type: "OneOff" as const,
    lifecycle: "Active" as const,
    discoverability: "Listed" as const,
    enrollment_mode: "MemberRequest" as const,
    display_order: 2,
  },
  {
    name: "E2E_DEMO_社區關懷",
    description: "供管理者預備中的本機示範課程。",
    category: "關懷",
    behavior_type: "Recurring" as const,
    lifecycle: "Active" as const,
    discoverability: "Unlisted" as const,
    enrollment_mode: "ManagerOnly" as const,
    display_order: 3,
  },
  {
    name: "E2E_DEMO_管理安排",
    description: "由管理者安排成員加入的本機示範課程。",
    category: "事工安排",
    behavior_type: "Recurring" as const,
    lifecycle: "Active" as const,
    discoverability: "Listed" as const,
    enrollment_mode: "ManagerOnly" as const,
    display_order: 4,
  },
] as const;

const REQUIRED_MODULES = [
  "program_catalog",
  "events",
  "enrollment",
  "attendance",
] as const;

// CFG-01 (#254): a dedicated disposable department with events/attendance
// left disabled by design, so tests can assert the module-gated
// "unavailable" settings copy without touching the shared demo
// department's module state (which E2E_DEMO_MINISTRY's other tests and
// human QA rely on staying enabled). Deliberately NOT under the
// "E2E_DEMO_" prefix: MUI-01's directory test hardcodes
// `demoDirectoryRows` count === 4 for names matching that exact prefix,
// so a fixture program sharing it would silently break an unrelated,
// pre-existing assertion. "E2E_" alone is still disposable (the reset
// script's GLOB covers `E2E_*`, not just `E2E_DEMO_*`).
const MODULE_GATE_DEPARTMENT = {
  code: "E2E_MODULE_GATE",
  name: "E2E_模組停用示範",
  description:
    "本機示範資料；不可用於生產環境。聚會與出席模組刻意停用，供 CFG-01 測試使用。",
} as const;

const MODULE_GATE_PROGRAM = {
  name: "E2E_模組停用課程",
  description: "聚會與出席模組已停用的示範課程。",
  category: "測試",
  behavior_type: "Recurring" as const,
  lifecycle: "Active" as const,
  discoverability: "Unlisted" as const,
  enrollment_mode: "MemberRequest" as const,
  // Deliberately last: management-directory.tsx sorts by display_order
  // then name, and several pre-existing tests (e.g. MUI-01's
  // "keyboard-operable" test) pick the FIRST directory row assuming it
  // is always E2E_DEMO_成人查經. A tied/low display_order here would
  // silently take that slot and break those tests' unrelated
  // assumption -- this fixture must never sort first.
  display_order: 999,
} as const;

interface JsonRecord {
  data?: unknown;
  [key: string]: unknown;
}

interface DepartmentRow {
  department_id: string;
  code: string;
}

interface ModuleRow {
  module_key: string;
  enabled: number | boolean;
}

interface ProgramRow {
  program_id: string;
  name: string;
  behavior_type: "Recurring" | "OneOff";
}

interface ScheduleRuleRow {
  rule_id: string;
  recurrence: "WEEKLY" | "MONTHLY";
  day_of_week: number | null;
  start_time: string;
  end_time: string;
}
class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, path: string) {
    super(`HTTP ${status} from ${path}: ${JSON.stringify(body)}`);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
  }
}

function assertLocalTarget(): URL {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new Error(
      `DEMO_TARGET_URL must be an absolute local URL (default: ${DEFAULT_TARGET_URL})`
    );
  }
  if (
    parsed.protocol !== "http:" ||
    parsed.username ||
    parsed.password ||
    !["localhost", "127.0.0.1"].includes(parsed.hostname)
  ) {
    throw new Error(
      "DEMO_TARGET_URL must point to http://localhost or http://127.0.0.1; the demo seed never writes a remote database"
    );
  }
  return parsed;
}

function responseCookies(response: Response): string {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const values = headers.getSetCookie?.() ?? [
    response.headers.get("set-cookie") ?? "",
  ];
  return values
    .filter(Boolean)
    .map((value) => value.split(";", 1)[0])
    .join("; ");
}

async function readJson(response: Response): Promise<JsonRecord> {
  try {
    return (await response.json()) as JsonRecord;
  } catch {
    return {};
  }
}

function payload<T>(body: JsonRecord): T {
  if (body.data === undefined) {
    throw new Error(
      `Expected an EFCC response envelope: ${JSON.stringify(body)}`
    );
  }
  return body.data as T;
}

async function seedDemoHomeContent(
  request: (
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: Record<string, unknown>
  ) => Promise<JsonRecord>
): Promise<string> {
  const homeContentBody = await request("GET", "/api/v1/home/content");
  const homeContent = homeContentBody.data as { version?: number } | null;
  if (homeContent?.version) {
    return "Demo home content already present.";
  }
  const draftBody = await request("POST", "/api/v1/home/draft", {
    content_id: "home",
    template_type: "B",
    publish_mode: "immediate",
    title: "E2E_DEMO_教會消息",
    summary: "本機示範教會消息；Home CMS E2E 會還原此內容。",
    body_markdown: "示範內容，請勿用於生產環境。",
  });
  const draftVersion = (draftBody.data as { version: number }).version;
  await request("POST", "/api/v1/home/publish", {
    content_id: "home",
    version: draftVersion,
    publish_mode: "immediate",
  });
  return "Seeded demo home content (Template B).";
}

async function seedDemo(): Promise<void> {
  const base = assertLocalTarget();
  let cookie = "";

  const loginResponse = await fetch(`${base.origin}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: base.origin,
    },
    body: JSON.stringify({
      username: DEV_ADMIN.username,
      password: DEV_ADMIN.credential,
    }),
  });
  const loginBody = await readJson(loginResponse);
  if (!loginResponse.ok) {
    throw new HttpError(loginResponse.status, loginBody, "/api/v1/auth/login");
  }
  cookie = responseCookies(loginResponse);
  if (!cookie) {
    throw new Error("Local admin login did not return a session cookie");
  }

  const request = async (
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: Record<string, unknown>
  ): Promise<JsonRecord> => {
    const headers: Record<string, string> = {
      Cookie: cookie,
      Origin: base.origin,
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const response = await fetch(`${base.origin}${path}`, init);
    const responseBody = await readJson(response);
    if (!response.ok) {
      throw new HttpError(response.status, responseBody, path);
    }
    return responseBody;
  };

  let department: DepartmentRow;
  const departments = payload<{ departments: DepartmentRow[] }>(
    await request("GET", "/api/v1/programs/departments")
  );
  const existingDepartment = departments.departments.find(
    (candidate) => candidate.code === DEPARTMENT.code
  );
  if (existingDepartment) {
    department = existingDepartment;
    await request(
      "PATCH",
      `/api/v1/programs/departments/${encodeURIComponent(department.department_id)}`,
      {
        name: DEPARTMENT.name,
        description: DEPARTMENT.description,
        lifecycle: "Active",
      }
    );
  } else {
    const { department: createdDepartment } = payload<{
      department: DepartmentRow;
    }>(
      await request("POST", "/api/v1/programs/departments", {
        ...DEPARTMENT,
        lifecycle: "Active",
        display_order: 90,
      })
    );
    department = createdDepartment;
  }

  const departmentDetails = payload<{
    department: DepartmentRow;
    modules: ModuleRow[];
  }>(
    await request(
      "GET",
      `/api/v1/programs/departments/${encodeURIComponent(department.department_id)}`
    )
  );
  const enabledModules = new Map(
    departmentDetails.modules.map((module) => [
      module.module_key,
      module.enabled,
    ])
  );
  for (const moduleKey of REQUIRED_MODULES) {
    if (
      enabledModules.get(moduleKey) === true ||
      enabledModules.get(moduleKey) === 1
    ) {
      continue;
    }
    await request(
      "POST",
      `/api/v1/programs/departments/${encodeURIComponent(department.department_id)}/modules/${moduleKey}/enable`
    );
  }

  const listedPrograms = payload<{ programs: ProgramRow[] }>(
    await request(
      "GET",
      `/api/v1/programs/departments/${encodeURIComponent(department.department_id)}/programs`
    )
  );
  const programs = new Map(
    listedPrograms.programs.map((program) => [program.name, program])
  );
  for (const definition of PROGRAMS) {
    if (programs.has(definition.name)) {
      continue;
    }
    const created = payload<{ program: ProgramRow }>(
      await request(
        "POST",
        `/api/v1/programs/departments/${encodeURIComponent(department.department_id)}/programs`,
        definition
      )
    );
    programs.set(created.program.name, created.program);
  }

  const recurring = programs.get(PROGRAMS[0].name);
  if (!recurring || recurring.behavior_type !== "Recurring") {
    throw new Error(
      "The E2E_DEMO recurring program was not available after seeding"
    );
  }
  const rules = payload<{ rules: ScheduleRuleRow[] }>(
    await request(
      "GET",
      `/api/v1/programs/${encodeURIComponent(recurring.program_id)}/schedule-rules`
    )
  );
  const expectedRule = rules.rules.find(
    (rule) =>
      rule.recurrence === "WEEKLY" &&
      rule.day_of_week === 3 &&
      rule.start_time === "19:30" &&
      rule.end_time === "20:45"
  );
  if (!expectedRule) {
    await request(
      "POST",
      `/api/v1/programs/${encodeURIComponent(recurring.program_id)}/schedule-rules`,
      {
        recurrence: "WEEKLY",
        day_of_week: 3,
        start_time: "19:30",
        end_time: "20:45",
      }
    );
  }
  const preview = payload<{
    plan: { plan_id: string };
    occurrences: unknown[];
  }>(
    await request(
      "POST",
      `/api/v1/programs/${encodeURIComponent(recurring.program_id)}/events/preview`,
      { horizon_days: 90 }
    )
  );
  if (preview.occurrences.length === 0) {
    throw new Error("The E2E_DEMO recurring program previewed no occurrences");
  }
  await request(
    "POST",
    `/api/v1/programs/${encodeURIComponent(recurring.program_id)}/events/generate`,
    { plan_id: preview.plan.plan_id }
  );
  const events = payload<{ events: { event_id: string }[] }>(
    await request(
      "GET",
      `/api/v1/programs/${encodeURIComponent(recurring.program_id)}/events`
    )
  );
  if (events.events.length === 0) {
    throw new Error("The E2E_DEMO recurring program generated no events");
  }

  // CFG-01 module-gate fixture: a separate department with only
  // program_catalog enabled (required for program creation itself),
  // events/attendance left disabled. Never toggled at runtime by tests.
  let gateDepartment: DepartmentRow;
  const gateExisting = departments.departments.find(
    (candidate) => candidate.code === MODULE_GATE_DEPARTMENT.code
  );
  if (gateExisting) {
    gateDepartment = gateExisting;
  } else {
    const { department: createdGateDepartment } = payload<{
      department: DepartmentRow;
    }>(
      await request("POST", "/api/v1/programs/departments", {
        ...MODULE_GATE_DEPARTMENT,
        lifecycle: "Active",
        display_order: 91,
      })
    );
    gateDepartment = createdGateDepartment;
  }
  const gateModules = payload<{ modules: ModuleRow[] }>(
    await request(
      "GET",
      `/api/v1/programs/departments/${encodeURIComponent(gateDepartment.department_id)}`
    )
  );
  const gateEnabledModules = new Map(
    gateModules.modules.map((module) => [module.module_key, module.enabled])
  );
  // Deterministic target state, enforced on every run: program_catalog
  // must be enabled (required for program creation); events and
  // attendance must be disabled (that's the whole point of this
  // fixture). A prior interrupted test or manual toggle must not leave
  // this department in a state that makes CFG-01's module-gate test
  // flaky.
  const gateModuleTargetState: Record<string, boolean> = {
    program_catalog: true,
    events: false,
    attendance: false,
  };
  for (const [moduleKey, shouldBeEnabled] of Object.entries(
    gateModuleTargetState
  )) {
    const currentlyEnabled =
      gateEnabledModules.get(moduleKey) === true ||
      gateEnabledModules.get(moduleKey) === 1;
    if (currentlyEnabled !== shouldBeEnabled) {
      await request(
        "POST",
        `/api/v1/programs/departments/${encodeURIComponent(gateDepartment.department_id)}/modules/${moduleKey}/${shouldBeEnabled ? "enable" : "disable"}`
      );
    }
  }
  const gatePrograms = payload<{ programs: ProgramRow[] }>(
    await request(
      "GET",
      `/api/v1/programs/departments/${encodeURIComponent(gateDepartment.department_id)}/programs`
    )
  );
  if (!gatePrograms.programs.some((p) => p.name === MODULE_GATE_PROGRAM.name)) {
    await request(
      "POST",
      `/api/v1/programs/departments/${encodeURIComponent(gateDepartment.department_id)}/programs`,
      MODULE_GATE_PROGRAM
    );
  }

  // 085-07 (#324): 3 participant Notices for the E2E member, created via the
  // admin POST /api/v1/programs/notices endpoint. Idempotent by title: a
  // notice whose title already exists for the member is skipped. The read
  // "帳戶更新" notice is created first and marked read (the only read endpoint
  // is mark-all-read, so it must be the sole unread notice at that moment) —
  // the two unread notices are created after, converging unread_count to 2.
  const oneOff = programs.get(PROGRAMS[1].name);
  if (!oneOff) {
    throw new Error(
      "The E2E_DEMO one-off program was not available after seeding"
    );
  }
  // 085-07 (#324): the participant event-detail projection (getEventDetail)
  // requires an Active enrollment on the event's program, so the 聚會提醒
  // notice's deep link only opens for an enrolled member. Assisted-enroll
  // the demo member into the recurring program; the store quiets same-actor
  // duplicates, so re-running the seed is safe.
  await request("POST", `/api/v1/programs/${recurring.program_id}/enrollments`, {
    member_user_id: DEV_MEMBER.userId,
  });
  const memberLogin = await fetch(`${base.origin}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: base.origin,
    },
    body: JSON.stringify({
      username: DEV_MEMBER.username,
      password: DEV_MEMBER.credential,
    }),
  });
  const memberLoginBody = await readJson(memberLogin);
  if (!memberLogin.ok) {
    throw new HttpError(
      memberLogin.status,
      memberLoginBody,
      "/api/v1/auth/login"
    );
  }
  const memberCookie = responseCookies(memberLogin);
  const memberRequest = async (
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: Record<string, unknown>
  ): Promise<JsonRecord> => {
    const headers: Record<string, string> = {
      Cookie: memberCookie,
      Origin: base.origin,
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const response = await fetch(`${base.origin}${path}`, init);
    const responseBody = await readJson(response);
    if (!response.ok) {
      throw new HttpError(response.status, responseBody, path);
    }
    return responseBody;
  };
  const memberNotices = payload<{ notices: { title: string }[] }>(
    await memberRequest("GET", "/api/v1/programs/notices")
  );
  const existingNoticeTitles = new Set(
    memberNotices.notices.map((notice) => notice.title)
  );
  const noticesToSeed = [
    {
      title: "聚會提醒",
      body: "你已報名的聚會即將開始。",
      kind: "event",
      program_id: recurring.program_id,
      event_id: events.events[0].event_id,
      read: false,
    },
    {
      title: "報名結果",
      body: "你的報名申請已獲核准。",
      kind: "program",
      program_id: oneOff.program_id,
      event_id: null,
      read: false,
    },
    {
      title: "帳戶更新",
      body: "你的帳戶資料已更新。",
      kind: "account",
      program_id: null,
      event_id: null,
      read: true,
    },
  ] as const;
  const pendingNotices = noticesToSeed.filter(
    (notice) => !existingNoticeTitles.has(notice.title)
  );
  if (pendingNotices.length > 0) {
    const readNotice = pendingNotices.find((notice) => notice.read);
    if (readNotice) {
      await request("POST", "/api/v1/programs/notices", {
        member_user_id: DEV_MEMBER.userId,
        kind: readNotice.kind,
        title: readNotice.title,
        body: readNotice.body,
        ...(readNotice.program_id ? { program_id: readNotice.program_id } : {}),
        ...(readNotice.event_id ? { event_id: readNotice.event_id } : {}),
      });
      await memberRequest("POST", "/api/v1/programs/notices/read-all");
    }
    for (const notice of pendingNotices) {
      if (notice === readNotice) {
        continue;
      }
      await request("POST", "/api/v1/programs/notices", {
        member_user_id: DEV_MEMBER.userId,
        kind: notice.kind,
        title: notice.title,
        body: notice.body,
        ...(notice.program_id ? { program_id: notice.program_id } : {}),
        ...(notice.event_id ? { event_id: notice.event_id } : {}),
      });
    }
  }

  const homeContentMessage = await seedDemoHomeContent(request);

  process.stdout.write(
    `${[
      `Seeded local ${DEPARTMENT.code}.`,
      `Programs: ${PROGRAMS.map(({ name }) => name).join(", ")}.`,
      `Generated events for ${PROGRAMS[0].name}: ${events.events.length}.`,
      `Seeded local ${MODULE_GATE_DEPARTMENT.code} (events/attendance disabled).`,
      `Seeded participant notices for ${DEV_MEMBER.userId} (2 unread, 1 read).`,
      homeContentMessage,
    ].join("\n")}\n`
  );
}

async function run(): Promise<void> {
  try {
    await seedDemo();
  } catch (error: unknown) {
    process.stderr.write(
      `error: local demo seed failed: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
}

void run();
