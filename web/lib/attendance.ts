import { findAccountByUserId } from "./auth/accounts";
import type { AccountRow } from "./auth/accounts";
import { ACCESS_COOKIE_NAME } from "./auth/cookies";
import { verifyAccessToken } from "./auth/sessions";
import { loadActorRoles, resolveActorCapabilities } from "./identity/role-hierarchy";
import { resolveProgramAccess } from "./programs/program-resolver";

export type AttendanceMethod =
  | "self_qr_scan"
  | "self_manual_code"
  | "leader_qr_scan"
  | "leader_manual_search"
  | "guest_qr_scan"
  | "guest_manual_code";

/** Guest-name cap shared by check-in and guest correction (UI maxLength). */
export const GUEST_NAME_MAX_LENGTH = 80;

export interface AttendanceEnv {
  DB: D1Database;
  EFCC_ACCESS_TOKEN_SECRET: string;
  RPC_RATE_LIMITER?: RateLimit;
}

export interface AttendanceEvent {
  event_id: string;
  program_id: string;
  program_name: string;
  name: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  manual_check_in_code: string;
  check_in_window_opens_at: string;
  check_in_window_closes_at: string;
  status: "Active" | "Cancelled";
  availability: "Active" | "Inactive";
}

export interface AttendanceResolveLatest {
  status: "Active" | "Cancelled";
  availability: "Active" | "Inactive";
  starts_at: string | null;
  check_in_window_opens_at: string | null;
  program_id: string;
  program_name: string;
}

export interface AttendanceResolveResult {
  events: AttendanceEvent[];
  latest?: AttendanceResolveLatest | null;
  enrolled?: boolean;
}
/** Explicitly safe fields for chooser/context projections; credentials stay server-side. */
export interface AttendanceEventSummary {
  event_id: string;
  program_id: string;
  program_name: string;
  name: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  check_in_window_opens_at: string;
  check_in_window_closes_at: string;
  status: "Active" | "Cancelled";
  availability: "Active" | "Inactive";
}

export interface AttendanceRow {
  attendance_id: string;
  event_id: string;
  member_user_id: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  guest_phone_normalized: string | null;
  method: AttendanceMethod;
  status: "Active" | "Voided";
  checked_in_at: string;
  checked_in_by: string | null;
  voided_by: string | null;
  voided_at: string | null;
  void_reason: string | null;
}

export interface AttendanceMember {
  user_id: string;
  name: string;
  phone: string | null;
  qr_code_string: string | null;
}

export function normalizeGuestPhone(input: string): string | null {
  const compact = input.trim().replaceAll(/[\s().-]/gu, "");
  if (!compact) {
    return null;
  }
  if (/^\+852\d{8}$/u.test(compact)) {
    return `hk:${compact.slice(1)}`;
  }
  if (/^852\d{8}$/u.test(compact)) {
    return `hk:${compact}`;
  }
  if (/^\d{8}$/u.test(compact)) {
    return `hk:852${compact}`;
  }
  if (/^\+[1-9]\d{6,14}$/u.test(compact)) {
    return `intl:${compact.slice(1)}`;
  }
  if (/^\d{7,15}$/u.test(compact)) {
    return `intl:${compact}`;
  }
  return null;
}

function requestId(): string {
  return crypto.randomUUID();
}

// RFC 9457 title map (ADR-0018 §5): a short English label per problem code,
// distinct from the machine `code` — matching program-handlers.ts.
const PROBLEM_TITLES: Record<string, string> = {
  AUTH_REQUIRED: "Authentication required",
  FORBIDDEN: "Forbidden",
  ROLE_FORBIDDEN: "Forbidden",
  ROLE_SCOPE_MISMATCH: "Forbidden",
  VALIDATION: "Invalid request",
  NOT_FOUND: "Not found",
  CHECK_IN_NOT_FOUND: "Check-in event not found",
  CHECK_IN_CLOSED: "Check-in window closed",
  EVENT_CANCELLED: "Event cancelled",
  INVALID_CHECK_IN_ENTRY: "Invalid check-in entry",
  ENROLLMENT_REQUIRED: "Enrollment required",
  DUPLICATE_ATTENDANCE: "Duplicate attendance",
  RATE_LIMITED: "Too many requests",
  UNAVAILABLE: "Service unavailable",
  CONFLICT: "Conflict",
};

function problem(
  status: number,
  code: string,
  detail: string,
  id: string
): Response {
  return Response.json(
    {
      type: `tag:apps-script/efcc/errors#${code}`,
      title: PROBLEM_TITLES[code] ?? code,
      status,
      detail,
      code,
      requestId: id,
    },
    {
      status,
      headers: {
        "Content-Type": "application/problem+json",
        "X-Request-Id": id,
      },
    }
  );
}

function json(status: number, data: unknown, id: string): Response {
  return Response.json(
    { requestId: id, data },
    { status, headers: { "X-Request-Id": id } }
  );
}

async function body<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function cookie(request: Request): string | null {
  const value = request.headers.get("Cookie");
  if (!value) {
    return null;
  }
  const part = value
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${ACCESS_COOKIE_NAME}=`));
  return part?.slice(ACCESS_COOKIE_NAME.length + 1) ?? null;
}

async function actor(
  request: Request,
  env: AttendanceEnv,
  id: string,
  required: boolean
): Promise<AccountRow | null | Response> {
  const access = cookie(request);
  if (!access) {
    return required ? problem(401, "AUTH_REQUIRED", "登入要求", id) : null;
  }
  const claims = await verifyAccessToken(env.EFCC_ACCESS_TOKEN_SECRET, access);
  if (!claims) {
    return required ? problem(401, "AUTH_REQUIRED", "登入要求", id) : null;
  }
  const account = await findAccountByUserId(env.DB, claims.uid);
  if (!account || account.account_status !== "Active") {
    return required ? problem(403, "FORBIDDEN", "帳戶不可用", id) : null;
  }
  return account;
}

/**
 * Authenticated-actor prologue shared by every protected handler: resolves
 * the account (401 when absent) so callers only handle the Response branch.
 */
async function requireActor(
  request: Request,
  env: AttendanceEnv,
  id: string
): Promise<AccountRow | Response> {
  const current = await actor(request, env, id, true);
  return current instanceof Response || current === null
    ? (current ?? problem(401, "AUTH_REQUIRED", "登入要求", id))
    : current;
}

async function findEvent(
  db: D1Database,
  eventId: string
): Promise<AttendanceEvent | null> {
  return (
    (await db
      .prepare(
        `SELECT e.event_id, e.program_id, p.name AS program_name,
                e.name, e.location, e.starts_at, e.ends_at,
                e.manual_check_in_code, e.check_in_window_opens_at,
                e.check_in_window_closes_at, e.status, e.availability
           FROM events e JOIN programs p ON p.program_id = e.program_id
          WHERE e.event_id = ?`
      )
      .bind(eventId)
      .first<AttendanceEvent>()) ?? null
  );
}

async function eventMatchesEntry(
  db: D1Database,
  eventId: string,
  method: AttendanceMethod,
  programToken?: string,
  manualCode?: string
): Promise<boolean> {
  const isQr = method === "self_qr_scan" || method === "guest_qr_scan";
  if ((isQr && !programToken) || (!isQr && !manualCode)) {
    return false;
  }
  const row = await db
    .prepare(
      isQr
        ? `SELECT 1 FROM events e JOIN programs p ON p.program_id = e.program_id
            WHERE e.event_id = ? AND p.check_in_token = ?`
        : `SELECT 1 FROM events
            WHERE event_id = ? AND manual_check_in_code = ?`
    )
    .bind(eventId, isQr ? programToken : manualCode)
    .first();
  return Boolean(row);
}

async function hasActiveEnrollment(
  db: D1Database,
  programId: string,
  memberUserId: string
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 FROM enrollments
        WHERE program_id = ? AND member_user_id = ? AND status = 'Active'`
    )
    .bind(programId, memberUserId)
    .first();
  return Boolean(row);
}

/**
 * Resolve an ambiguous typed entry to a concrete method + credential pair.
 * The manual code is tried first (globally unique per migration 0003), then
 * the Program token. Returns null when neither matches.
 */
async function resolveEntryMethod<M extends AttendanceMethod>(
  db: D1Database,
  eventId: string,
  entry: string,
  manualMethod: M,
  qrMethod: M
): Promise<M | null> {
  if (await eventMatchesEntry(db, eventId, manualMethod, undefined, entry)) {
    return manualMethod;
  }
  if (await eventMatchesEntry(db, eventId, qrMethod, entry)) {
    return qrMethod;
  }
  return null;
}

/**
 * Derive the check-in method from an explicit method + credential, or an
 * ambiguous entry (manual code first, then Program token). Returns a 403
 * problem when no credential matches the Event.
 */
async function deriveCheckInMethod<M extends AttendanceMethod>(
  env: AttendanceEnv,
  event: AttendanceEvent,
  input: {
    method?: unknown;
    program_token?: unknown;
    manual_code?: unknown;
    entry?: unknown;
  },
  manualMethod: M,
  qrMethod: M,
  id: string
): Promise<{ method: M } | { method: null; response: Response }> {
  const method =
    input.method === manualMethod
      ? manualMethod
      : input.method === qrMethod
        ? qrMethod
        : undefined;
  let resolved = method;
  if (typeof input.entry === "string" && input.entry) {
    resolved =
      (await resolveEntryMethod(
        env.DB,
        event.event_id,
        input.entry,
        manualMethod,
        qrMethod
      )) ?? method;
  }
  // The typed-entry path (the panel sends a bare `entry`) carries no
  // explicit credential param: once `entry` resolved to a method above, that
  // entry IS the credential for the final re-check. Feeding undefined
  // credentials here made every entry-only check-in 403 even though
  // resolveEntryMethod had just validated the entry against this Event.
  const entryCredential =
    typeof input.entry === "string" && input.entry ? input.entry : undefined;
  if (
    resolved === undefined ||
    !(await eventMatchesEntry(
      env.DB,
      event.event_id,
      resolved,
      typeof input.program_token === "string"
        ? input.program_token
        : resolved === qrMethod
          ? entryCredential
          : undefined,
      typeof input.manual_code === "string"
        ? input.manual_code
        : resolved === manualMethod
          ? entryCredential
          : undefined
    ))
  ) {
    return {
      method: null,
      response: problem(
        403,
        "INVALID_CHECK_IN_ENTRY",
        "請從有效的 QR 或聚會代碼進入簽到。",
        id
      ),
    };
  }
  return { method: resolved };
}
function isOpen(event: AttendanceEvent, now = new Date()): boolean {
  return (
    event.status === "Active" &&
    event.availability === "Active" &&
    now >= new Date(event.check_in_window_opens_at) &&
    now <= new Date(event.check_in_window_closes_at)
  );
}

function entryWhere(byProgramToken: boolean): string {
  return byProgramToken ? "p.check_in_token = ?" : "e.manual_check_in_code = ?";
}

async function openEvents(
  db: D1Database,
  byProgramToken: boolean,
  value: string
): Promise<AttendanceEvent[]> {
  const result = await db
    .prepare(
      `SELECT e.event_id, e.program_id, p.name AS program_name,
              e.name, e.location, e.starts_at, e.ends_at,
              e.manual_check_in_code, e.check_in_window_opens_at,
              e.check_in_window_closes_at, e.status, e.availability
         FROM events e JOIN programs p ON p.program_id = e.program_id
        WHERE ${entryWhere(byProgramToken)}
          AND e.status = 'Active' AND e.availability = 'Active'
        ORDER BY e.starts_at ASC`
    )
    .bind(value)
    .all<AttendanceEvent>();
  return (result.results ?? []).filter((event) => isOpen(event));
}

async function matchingEventState(
  db: D1Database,
  byProgramToken: boolean,
  value: string
): Promise<AttendanceResolveLatest | null> {
  const row = await db
    .prepare(
      `SELECT e.status, e.availability, e.starts_at, e.check_in_window_opens_at,
              p.program_id, p.name AS program_name
         FROM events e JOIN programs p ON p.program_id = e.program_id
        WHERE ${entryWhere(byProgramToken)}
        ORDER BY e.starts_at DESC LIMIT 1`
    )
    .bind(value)
    .first<AttendanceResolveLatest>();
  return row ?? null;
}

interface ResolveLookup {
  events: AttendanceEvent[];
  latest: AttendanceResolveLatest | null;
}

async function resolveLookup(
  db: D1Database,
  token: string | null,
  code: string | null,
  value: string
): Promise<ResolveLookup> {
  let events: AttendanceEvent[];
  let latest: AttendanceResolveLatest | null = null;
  if (token || code) {
    const byProgramToken = Boolean(token);
    events = await openEvents(db, byProgramToken, value);
    if (events.length === 0) {
      latest = await matchingEventState(db, byProgramToken, value);
    }
    return { events, latest };
  }

  events = await openEvents(db, false, value);
  if (events.length > 0) {
    return { events, latest };
  }
  // The typed value may be a cancelled/closed Event's manual code, so check
  // that status before falling back to the Program token column.
  latest = await matchingEventState(db, false, value);
  if (latest !== null) {
    return { events, latest };
  }
  events = await openEvents(db, true, value);
  if (events.length === 0) {
    latest = await matchingEventState(db, true, value);
  }
  return { events, latest };
}

async function resolveNoEvents(
  db: D1Database,
  latest: AttendanceResolveLatest | null,
  memberUserId: string | null,
  id: string
): Promise<Response> {
  let enrolled = false;
  if (latest && memberUserId) {
    enrolled = await hasActiveEnrollment(db, latest.program_id, memberUserId);
  }
  return json(200, { events: [], latest: latest ?? null, enrolled }, id);
}

async function audit(
  db: D1Database,
  input: {
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    outcome: "SUCCESS" | "DUPLICATE" | "CONFLICT" | "DENIED" | "FAILED";
    oldValue?: unknown;
    newValue?: unknown;
    reason?: string;
    correlationId: string;
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_events
        (audit_id, inserted_at, actor_user_id, action, entity_type, entity_id,
         old_value_json, new_value_json, reason, outcome, correlation_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      new Date().toISOString(),
      input.actorUserId,
      input.action,
      input.entityType,
      input.entityId,
      input.oldValue === undefined ? null : JSON.stringify(input.oldValue),
      input.newValue === undefined ? null : JSON.stringify(input.newValue),
      input.reason ?? null,
      input.outcome,
      input.correlationId
    )
    .run();
}

/**
 * Scanner deep-link resolver. Looks up the event by id and mirrors the
 * existing resolveLookup contract: returns the open event when eligible,
 * else falls through to `latest` describing why the caller cannot check in.
 */
async function resolveByEventId(
  db: D1Database,
  eventId: string
): Promise<ResolveLookup> {
  const result = await db
    .prepare(
      `SELECT e.event_id, e.program_id, p.name AS program_name,
              e.name, e.location, e.starts_at, e.ends_at,
              e.manual_check_in_code, e.check_in_window_opens_at,
              e.check_in_window_closes_at, e.status, e.availability
         FROM events e JOIN programs p ON p.program_id = e.program_id
        WHERE e.event_id = ?
        ORDER BY e.starts_at ASC`
    )
    .bind(eventId)
    .all<AttendanceEvent>();
  const events = (result.results ?? []).filter((event) => isOpen(event));
  if (events.length > 0) {
    return { events, latest: null };
  }
  const latest = await matchingEventStateById(db, eventId);
  return { events: [], latest };
}

async function matchingEventStateById(
  db: D1Database,
  eventId: string
): Promise<AttendanceResolveLatest | null> {
  const row = await db
    .prepare(
      `SELECT e.status, e.availability, e.starts_at, e.check_in_window_opens_at,
              p.program_id, p.name AS program_name
         FROM events e JOIN programs p ON p.program_id = e.program_id
        WHERE e.event_id = ?`
    )
    .bind(eventId)
    .first<AttendanceResolveLatest>();
  return row ?? null;
}

export async function handleResolve(
  request: Request,
  env: AttendanceEnv
): Promise<Response> {
  const id = requestId();
  const url = new URL(request.url);
  const token = url.searchParams.get("program_token");
  const code = url.searchParams.get("manual_code");
  const entry = url.searchParams.get("entry");
  const eventId = url.searchParams.get("event");
  // The scanner deep-link (?event=<id>) is an explicit pre-select and is
  // mutually exclusive with the credential-shaped params; otherwise the
  // caller is asking the server to resolve ambiguity it cannot.
  const explicitCount = [token, code, eventId].filter(Boolean).length;
  if (explicitCount > 1) {
    return problem(422, "VALIDATION", "請提供課程 QR 或聚會代碼。", id);
  }
  // The typed-input path sends an ambiguous `entry`: the server resolves it
  // as a manual code first (globally unique per migration 0003), then as a
  // Program token. No client-side length heuristic decides identity.
  const value = token ?? code ?? entry ?? "";
  if (eventId) {
    const currentActor = await actor(request, env, id, false);
    const memberUserId =
      currentActor && !(currentActor instanceof Response)
        ? currentActor.user_id
        : null;
    const { events, latest } = await resolveByEventId(env.DB, eventId);
    if (events.length === 0) {
      return resolveNoEvents(env.DB, latest, memberUserId, id);
    }
    return json(200, { events }, id);
  }
  if (!value) {
    return problem(422, "VALIDATION", "請提供課程 QR 或聚會代碼。", id);
  }
  const currentActor = await actor(request, env, id, false);
  const memberUserId =
    currentActor && !(currentActor instanceof Response)
      ? currentActor.user_id
      : null;

  const { events, latest } = await resolveLookup(env.DB, token, code, value);
  if (events.length === 0) {
    return resolveNoEvents(env.DB, latest, memberUserId, id);
  }
  return json(200, { events }, id);
}

async function checkInGate(
  env: AttendanceEnv,
  event: AttendanceEvent,
  input: {
    actor: AccountRow | null;
    memberUserId: string | null;
  },
  id: string,
  windowGated = true
): Promise<Response | null> {
  if (event.status === "Cancelled") {
    await audit(env.DB, {
      actorUserId: input.actor?.user_id ?? null,
      action: "attendance.check_in",
      entityType: "Event",
      entityId: event.event_id,
      outcome: "DENIED",
      reason: "EVENT_CANCELLED",
      correlationId: id,
    });
    return problem(410, "EVENT_CANCELLED", "此聚會已取消，不能簽到。", id);
  }
  if (event.availability === "Inactive") {
    await audit(env.DB, {
      actorUserId: input.actor?.user_id ?? null,
      action: "attendance.check_in",
      entityType: "Event",
      entityId: event.event_id,
      outcome: "DENIED",
      reason: "EVENT_UNAVAILABLE",
      correlationId: id,
    });
    return problem(
      409,
      "EVENT_UNAVAILABLE",
      "此聚會已暫停開放，不能簽到。",
      id
    );
  }
  if (input.memberUserId !== null) {
    const member = await findAccountByUserId(env.DB, input.memberUserId);
    if (!member || member.account_status !== "Active") {
      await audit(env.DB, {
        actorUserId: input.actor?.user_id ?? null,
        action: "attendance.check_in",
        entityType: "Event",
        entityId: event.event_id,
        outcome: "DENIED",
        reason: "ACCOUNT_NOT_ACTIVE",
        correlationId: id,
      });
      return problem(403, "FORBIDDEN", "帳戶不可用", id);
    }
  }
  if (windowGated && !isOpen(event)) {
    await audit(env.DB, {
      actorUserId: input.actor?.user_id ?? null,
      action: "attendance.check_in",
      entityType: "Event",
      entityId: event.event_id,
      outcome: "DENIED",
      reason: "CHECK_IN_CLOSED",
      correlationId: id,
    });
    return problem(409, "CHECK_IN_CLOSED", "簽到時間已結束或尚未開始。", id);
  }
  return null;
}

async function insertAttendance(
  env: AttendanceEnv,
  event: AttendanceEvent,
  input: {
    actor: AccountRow | null;
    memberUserId: string | null;
    guestName?: string | null;
    guestPhone?: string | null;
    guestPhoneNormalized?: string | null;
    method: AttendanceMethod;
    publicDuplicateMessage: string;
  },
  id: string,
  windowGated = true
): Promise<Response> {
  const gated = await checkInGate(env, event, input, id, windowGated);
  if (gated) {
    return gated;
  }
  const attendanceId = crypto.randomUUID();
  try {
    await env.DB.prepare(
      `INSERT INTO attendances
        (attendance_id, event_id, member_user_id, guest_name, guest_phone,
         guest_phone_normalized, method, status, checked_in_at, checked_in_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?)`
    )
      .bind(
        attendanceId,
        event.event_id,
        input.memberUserId,
        input.guestName ?? null,
        input.guestPhone ?? null,
        input.guestPhoneNormalized ?? null,
        input.method,
        new Date().toISOString(),
        input.actor?.user_id ?? null
      )
      .run();
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !/UNIQUE constraint failed/u.test(error.message)
    ) {
      // Only the active-member / active-guest unique indexes turn a real
      // check-in into a duplicate; anything else must surface as a 500.
      throw error;
    }
    const existing = input.memberUserId
      ? await env.DB.prepare(
          `SELECT attendance_id FROM attendances
            WHERE event_id = ? AND member_user_id = ? AND status = 'Active'`
        )
          .bind(event.event_id, input.memberUserId)
          .first<{ attendance_id: string }>()
      : input.guestPhoneNormalized
        ? await env.DB.prepare(
            `SELECT attendance_id FROM attendances
              WHERE event_id = ? AND guest_phone_normalized = ? AND status = 'Active'
                AND member_user_id IS NULL`
          )
            .bind(event.event_id, input.guestPhoneNormalized)
            .first<{ attendance_id: string }>()
        : null;
    await audit(env.DB, {
      actorUserId: input.actor?.user_id ?? null,
      action: "attendance.check_in",
      entityType: "Event",
      entityId: event.event_id,
      outcome: "DUPLICATE",
      reason: "ACTIVE_ATTENDANCE_EXISTS",
      correlationId: id,
    });
    if (existing) {
      // Members and guests share one duplicate shape (200 + outcome) so the
      // client treats both as neutral already-done notices; only the
      // un-look-up-able case (no normalized phone on a guest insert) stays a
      // problem+json 409. The existing record's id is never returned to the
      // caller (Spec #244 dec 14 / #259 AC4: duplicate responses reveal no
      // existing guest identity or time — the id would be an oracle).
      return json(200, { outcome: "duplicate" }, id);
    }
    return problem(
      409,
      "DUPLICATE_ATTENDANCE",
      input.publicDuplicateMessage,
      id
    );
  }
  await audit(env.DB, {
    actorUserId: input.actor?.user_id ?? null,
    action: "attendance.check_in",
    entityType: "Attendance",
    entityId: attendanceId,
    outcome: "SUCCESS",
    correlationId: id,
  });
  return json(201, { outcome: "success", attendance_id: attendanceId }, id);
}

export async function handleSelfCheckIn(
  request: Request,
  env: AttendanceEnv
): Promise<Response> {
  const id = requestId();
  const current = await requireActor(request, env, id);
  if (current instanceof Response) {
    return current;
  }
  const input = await body<{
    event_id?: unknown;
    method?: unknown;
    program_token?: unknown;
    manual_code?: unknown;
    entry?: unknown;
  }>(request);
  if (
    !input ||
    typeof input.event_id !== "string" ||
    (input.method !== undefined &&
      input.method !== "self_qr_scan" &&
      input.method !== "self_manual_code") ||
    (typeof input.entry !== "string" &&
      typeof input.program_token !== "string" &&
      typeof input.manual_code !== "string")
  ) {
    return problem(422, "VALIDATION", "簽到資料無效。", id);
  }
  const event = await findEvent(env.DB, input.event_id);
  if (!event) {
    return problem(404, "NOT_FOUND", "找不到聚會。", id);
  }
  const derived = await deriveCheckInMethod(
    env,
    event,
    input,
    "self_manual_code",
    "self_qr_scan",
    id
  );
  if (derived.method === null) {
    return derived.response;
  }
  const { method } = derived;
  const enrolled = await hasActiveEnrollment(
    env.DB,
    event.program_id,
    current.user_id
  );
  if (!enrolled) {
    await audit(env.DB, {
      actorUserId: current.user_id,
      action: "attendance.check_in",
      entityType: "Event",
      entityId: event.event_id,
      outcome: "DENIED",
      reason: "ACTIVE_ENROLLMENT_REQUIRED",
      correlationId: id,
    });
    return problem(403, "ENROLLMENT_REQUIRED", "你尚未報名此課程。", id);
  }
  return insertAttendance(
    env,
    event,
    {
      actor: current,
      memberUserId: current.user_id,
      method,
      publicDuplicateMessage: "你已完成此聚會簽到。",
    },
    id
  );
}

async function permittedOperator(
  env: AttendanceEnv,
  actorAccount: AccountRow,
  programId: string
): Promise<boolean> {
  const access = await resolveProgramAccess(
    env.DB,
    actorAccount.user_id,
    programId
  );
  return access?.capabilities["program.manage"] === true;
}

/**
 * Shared operator prologue: resolve the authenticated actor, the Event, and
 * the Event-Program operator grant. Returns the failure Response, or the
 * `{ current, event }` pair on success.
 */
async function requireEventOperator(
  request: Request,
  env: AttendanceEnv,
  eventId: string,
  id: string,
  deniedAction?: string
): Promise<{ current: AccountRow; event: AttendanceEvent } | Response> {
  const current = await requireActor(request, env, id);
  if (current instanceof Response) {
    return current;
  }
  const event = await findEvent(env.DB, eventId);
  if (!event) {
    return problem(404, "NOT_FOUND", "找不到聚會。", id);
  }
  if (!(await permittedOperator(env, current, event.program_id))) {
    if (deniedAction) {
      await audit(env.DB, {
        actorUserId: current.user_id,
        action: deniedAction,
        entityType: "Event",
        entityId: event.event_id,
        outcome: "DENIED",
        reason: "OUT_OF_SCOPE",
        correlationId: id,
      });
    }
    return problem(403, "FORBIDDEN", "你沒有管理此聚會簽到的權限。", id);
  }
  return { current, event };
}

/**
 * Assisted mutations revalidate the same active Program boundary as the
 * chooser. The legacy roster surface deliberately keeps historical Events
 * readable, so this gate is scoped to assisted search/check-in only.
 */
async function requireAssistedEventOperator(
  request: Request,
  env: AttendanceEnv,
  eventId: string,
  id: string,
  deniedAction = "attendance.check_in"
): Promise<{ current: AccountRow; event: AttendanceEvent } | Response> {
  const operator = await requireEventOperator(
    request,
    env,
    eventId,
    id,
    deniedAction
  );
  if (operator instanceof Response) {
    return operator;
  }
  const program = await env.DB.prepare(
    "SELECT lifecycle FROM programs WHERE program_id = ?"
  )
    .bind(operator.event.program_id)
    .first<{ lifecycle: string }>();
  if (program?.lifecycle !== "Active") {
    await audit(env.DB, {
      actorUserId: operator.current.user_id,
      action: deniedAction,
      entityType: "Event",
      entityId: eventId,
      outcome: "DENIED",
      reason: "PROGRAM_INACTIVE",
      correlationId: id,
    });
    return problem(403, "FORBIDDEN", "你沒有管理此聚會簽到的權限。", id);
  }
  return operator;
}

async function guestRateLimit(
  env: AttendanceEnv,
  eventId: string,
  id: string
): Promise<Response | null> {
  if (!env.RPC_RATE_LIMITER) {
    return problem(503, "UNAVAILABLE", "系統暫時無法處理請求。", id);
  }
  try {
    const limited = await env.RPC_RATE_LIMITER.limit({
      key: `guest:${eventId}`,
    });
    if (!limited.success) {
      return problem(429, "RATE_LIMITED", "請求過於頻繁，請稍後再試。", id);
    }
  } catch {
    return problem(503, "UNAVAILABLE", "系統暫時無法處理請求。", id);
  }
  return null;
}

export async function handleGuestCheckIn(
  request: Request,
  env: AttendanceEnv
): Promise<Response> {
  const id = requestId();
  const input = await body<{
    event_id?: unknown;
    method?: unknown;
    name?: unknown;
    phone?: unknown;
    program_token?: unknown;
    manual_code?: unknown;
    entry?: unknown;
  }>(request);
  if (
    !input ||
    typeof input.event_id !== "string" ||
    typeof input.name !== "string" ||
    typeof input.phone !== "string" ||
    (input.method !== undefined &&
      input.method !== "guest_qr_scan" &&
      input.method !== "guest_manual_code") ||
    (typeof input.entry !== "string" &&
      typeof input.program_token !== "string" &&
      typeof input.manual_code !== "string") ||
    !input.name.trim()
  ) {
    return problem(422, "VALIDATION", "姓名和電話都是必填資料。", id);
  }
  if (input.name.trim().length > GUEST_NAME_MAX_LENGTH) {
    return problem(
      422,
      "VALIDATION",
      `姓名不可超過 ${GUEST_NAME_MAX_LENGTH} 個字元。`,
      id
    );
  }
  const normalized = normalizeGuestPhone(input.phone);
  if (!normalized) {
    return problem(422, "VALIDATION", "請輸入有效電話號碼。", id);
  }
  const current = await actor(request, env, id, false);
  if (current instanceof Response) {
    return current;
  }
  const event = await findEvent(env.DB, input.event_id);
  if (!event) {
    return problem(404, "NOT_FOUND", "找不到聚會。", id);
  }
  const derived = await deriveCheckInMethod(
    env,
    event,
    input,
    "guest_manual_code",
    "guest_qr_scan",
    id
  );
  if (derived.method === null) {
    return derived.response;
  }
  const { method } = derived;
  // Charge the per-Event guest limiter only after the entry validated, so an
  // attacker cannot burn the shared bucket with garbage inputs.
  // ponytail: one shared 100/60s Rate Limiting binding (wrangler.jsonc);
  // split per-Event namespaces only if a single popular Event gets flooded.
  const limited = await guestRateLimit(env, event.event_id, id);
  if (limited instanceof Response) {
    return limited;
  }
  return insertAttendance(
    env,
    event,
    {
      actor: current,
      memberUserId: null,
      guestName: input.name.trim(),
      guestPhone: input.phone.trim(),
      guestPhoneNormalized: normalized,
      method,
      publicDuplicateMessage: "此電話已簽到。如需協助，請聯絡聚會負責人。",
    },
    id
  );
}

export async function handleListRoster(
  request: Request,
  env: AttendanceEnv,
  eventId: string
): Promise<Response> {
  const id = requestId();
  const operator = await requireEventOperator(request, env, eventId, id);
  if (operator instanceof Response) {
    return operator;
  }
  const { event } = operator;
  const result = await env.DB.prepare(
    `SELECT * FROM attendances WHERE event_id = ? ORDER BY checked_in_at ASC`
  )
    .bind(eventId)
    .all<AttendanceRow>();
  return json(200, { event, attendances: result.results ?? [] }, id);
}

export async function handleAssistedCheckIn(
  request: Request,
  env: AttendanceEnv,
  eventId: string
): Promise<Response> {
  const id = requestId();
  const operator = await requireAssistedEventOperator(
    request,
    env,
    eventId,
    id
  );
  if (operator instanceof Response) {
    return operator;
  }
  const { current, event } = operator;
  const input = await body<{
    member_user_id?: unknown;
    method?: unknown;
  }>(request);
  if (
    !input ||
    typeof input.member_user_id !== "string" ||
    (input.method !== undefined &&
      input.method !== "leader_qr_scan" &&
      input.method !== "leader_manual_search")
  ) {
    return problem(422, "VALIDATION", "請選擇已報名成員。", id);
  }
  if (
    !(await hasActiveEnrollment(env.DB, event.program_id, input.member_user_id))
  ) {
    await audit(env.DB, {
      actorUserId: current.user_id,
      action: "attendance.check_in",
      entityType: "Event",
      entityId: event.event_id,
      outcome: "DENIED",
      reason: "ACTIVE_ENROLLMENT_REQUIRED",
      correlationId: id,
    });
    return problem(403, "ENROLLMENT_REQUIRED", "此成員尚未報名此課程。", id);
  }
  return insertAttendance(
    env,
    event,
    {
      actor: current,
      memberUserId: input.member_user_id,
      method:
        input.method === "leader_qr_scan"
          ? "leader_qr_scan"
          : "leader_manual_search",
      publicDuplicateMessage: "此成員已完成簽到。",
    },
    id,
    // Assisted check-in is capability-gated only (Spec 081 L88): an operator
    // may still record attendance after the window closes (US 25 recovery).
    // Cancelled/Inactive events remain rejected by checkInGate regardless.
    false
  );
}

export async function handleSearchMembers(
  request: Request,
  env: AttendanceEnv,
  eventId: string
): Promise<Response> {
  const id = requestId();
  const operator = await requireAssistedEventOperator(
    request,
    env,
    eventId,
    id
  );
  if (operator instanceof Response) {
    return operator;
  }
  const { current, event } = operator;
  // Member search is window-exempt (US 25 recovery): the operator must be
  // able to find the member for a post-window recording. Cancelled and
  // Inactive events remain rejected — check-in on those can never succeed.
  const gate = await checkInGate(
    env,
    event,
    { actor: current, memberUserId: null },
    id,
    false
  );
  if (gate) {
    return gate;
  }
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query) {
    return json(200, { members: [] }, id);
  }
  const result = await env.DB.prepare(
    `SELECT DISTINCT a.user_id, a.name, a.phone, a.qr_code_string
       FROM accounts a JOIN enrollments en ON en.member_user_id = a.user_id
      WHERE en.program_id = ? AND en.status = 'Active'
        AND a.account_status = 'Active'
        AND (a.name LIKE ? OR a.phone LIKE ? OR a.qr_code_string = ?)
      ORDER BY a.name ASC LIMIT 20`
  )
    .bind(event.program_id, `%${query}%`, `%${query}%`, query)
    .all<AttendanceMember>();
  return json(200, { members: result.results ?? [] }, id);
}
/**
 * Resolve active Programs the actor may manage through the normalized
 * identity resolver. The caller uses the resulting IDs to distinguish an
 * authorized empty projection from a forbidden or out-of-scope request.
 */
async function resolveOperatorProgramIds(
  db: D1Database,
  actorUserId: string
): Promise<string[]> {
  const programRows = await db
    .prepare(`SELECT program_id FROM programs WHERE lifecycle = 'Active'`)
    .all<{ program_id: string }>();
  return resolveAuthorizedProgramIds(
    db,
    actorUserId,
    (programRows.results ?? []).map(({ program_id }) => program_id)
  );
}

async function resolveAuthorizedProgramIds(
  db: D1Database,
  actorUserId: string,
  programIds: readonly string[]
): Promise<string[]> {
  const authorized = await Promise.all(
    [...new Set(programIds)].map(async (programId) => {
      const access = await resolveProgramAccess(db, actorUserId, programId);
      return access?.capabilities["program.manage"] === true ? programId : null;
    })
  );
  return authorized.filter(
    (programId): programId is string => programId !== null
  );
}

async function operatorListProblem(
  db: D1Database,
  actorUserId: string,
  authorizedProgramIds: readonly string[],
  id: string
): Promise<Response | null> {
  if (authorizedProgramIds.length > 0) {
    return null;
  }
  const [capabilities, globalCapabilities, actorRoles] = await Promise.all([
    resolveActorCapabilities(db, actorUserId),
    resolveActorCapabilities(db, actorUserId, null),
    loadActorRoles(db, actorUserId),
  ]);
  if (globalCapabilities["program.manage"] === true) {
    return null;
  }
  const highest = actorRoles[0];
  if (capabilities["program.manage"] === true && highest?.scope_id) {
    const scopedCapabilities = await resolveActorCapabilities(
      db,
      actorUserId,
      highest.scope_kind === "Department"
        ? { departmentId: highest.scope_id }
        : { programId: highest.scope_id }
    );
    if (scopedCapabilities["program.manage"] === true) {
      const scopeExists =
        highest.scope_kind === "Department"
          ? await db
              .prepare("SELECT 1 FROM departments WHERE department_id = ?")
              .bind(highest.scope_id)
              .first()
          : await db
              .prepare("SELECT 1 FROM programs WHERE program_id = ?")
              .bind(highest.scope_id)
              .first();
      if (scopeExists) {
        return null;
      }
    }
  }
  const code =
    capabilities["program.manage"] === true
      ? "ROLE_SCOPE_MISMATCH"
      : "ROLE_FORBIDDEN";
  const detail =
    code === "ROLE_SCOPE_MISMATCH"
      ? "你沒有管理此範圍內的聚會簽到。"
      : "你沒有管理聚會簽到的權限。";
  return problem(403, code, detail, id);
}

/**
 * GET /api/v1/attendance/events — operator chooser.
 * Historical events remain readable to an operator with exact normalized
 * Program or Department scope.
 */
export async function handleListManageableEvents(
  request: Request,
  env: AttendanceEnv
): Promise<Response> {
  const id = requestId();
  const current = await requireActor(request, env, id);
  if (current instanceof Response) {
    return current;
  }
  const authorizedProgramIds = await resolveOperatorProgramIds(
    env.DB,
    current.user_id
  );
  const accessProblem = await operatorListProblem(
    env.DB,
    current.user_id,
    authorizedProgramIds,
    id
  );
  if (accessProblem) {
    return accessProblem;
  }
  // Keep each IN-list below D1's variable ceiling while retaining all
  // authorized Programs before the final 50-event result limit.
  const events: AttendanceEventSummary[] = [];
  for (let offset = 0; offset < authorizedProgramIds.length; offset += 80) {
    const chunk = authorizedProgramIds.slice(offset, offset + 80);
    const placeholders = chunk.map(() => "?").join(", ");
    const result = await env.DB.prepare(
      `SELECT e.event_id, e.program_id, p.name AS program_name,
              e.name, e.location, e.starts_at, e.ends_at,
              e.check_in_window_opens_at, e.check_in_window_closes_at,
              e.status, e.availability
         FROM events e
         JOIN programs p ON p.program_id = e.program_id
        WHERE p.lifecycle = 'Active'
          AND p.program_id IN (${placeholders})
        ORDER BY e.starts_at DESC
        LIMIT 50`
    )
      .bind(...chunk)
      .all<AttendanceEventSummary>();
    events.push(...(result.results ?? []));
  }
  events.sort((left, right) => right.starts_at.localeCompare(left.starts_at));
  return json(200, { events: events.slice(0, 50) }, id);
}

/**
 * GET /api/v1/attendance/scanner-events — open Events in the actor's
 * normalized Program/Department scope.
 */
export async function handleListScannerEvents(
  request: Request,
  env: AttendanceEnv
): Promise<Response> {
  const id = requestId();
  const current = await requireActor(request, env, id);
  if (current instanceof Response) {
    return current;
  }
  const now = new Date().toISOString();
  const [result, authorizedProgramIds] = await Promise.all([
    env.DB.prepare(
      `SELECT e.event_id, e.program_id, p.name AS program_name,
              e.name, e.location, e.starts_at, e.ends_at,
              e.check_in_window_opens_at, e.check_in_window_closes_at,
              e.status, e.availability
         FROM events e
         JOIN programs p ON p.program_id = e.program_id
        WHERE p.lifecycle = 'Active'
          AND e.status = 'Active'
          AND e.availability = 'Active'
          AND julianday(e.check_in_window_opens_at) <= julianday(?)
          AND julianday(e.check_in_window_closes_at) >= julianday(?)
        ORDER BY e.starts_at DESC`
    )
      .bind(now, now)
      .all<AttendanceEventSummary>(),
    resolveOperatorProgramIds(env.DB, current.user_id),
  ]);
  const accessProblem = await operatorListProblem(
    env.DB,
    current.user_id,
    authorizedProgramIds,
    id
  );
  if (accessProblem) {
    return accessProblem;
  }
  const authorizedProgramIdSet = new Set(authorizedProgramIds);
  const events = (result.results ?? []).filter((event) =>
    authorizedProgramIdSet.has(event.program_id)
  );
  return json(200, { events }, id);
}

export async function handleVoidAttendance(
  request: Request,
  env: AttendanceEnv,
  attendanceId: string
): Promise<Response> {
  const id = requestId();
  const current = await requireActor(request, env, id);
  if (current instanceof Response) {
    return current;
  }
  const input = await body<{ reason?: unknown }>(request);
  if (!input || typeof input.reason !== "string" || !input.reason.trim()) {
    return problem(422, "VALIDATION", "取消簽到需要原因。", id);
  }
  const existing = await env.DB.prepare(
    `SELECT a.*, e.program_id FROM attendances a JOIN events e ON e.event_id = a.event_id
      WHERE a.attendance_id = ?`
  )
    .bind(attendanceId)
    .first<AttendanceRow & { program_id: string }>();
  if (!existing) {
    return problem(404, "NOT_FOUND", "找不到簽到記錄。", id);
  }
  if (!(await permittedOperator(env, current, existing.program_id))) {
    return problem(403, "FORBIDDEN", "你沒有取消此簽到的權限。", id);
  }
  if (existing.status === "Voided") {
    // ADR-0023: the duplicate/no-op path is still audited, like the check-in
    // duplicate path, so every void attempt leaves a trace.
    await audit(env.DB, {
      actorUserId: current.user_id,
      action: "attendance.void",
      entityType: "Attendance",
      entityId: attendanceId,
      outcome: "DUPLICATE",
      reason: "ALREADY_VOIDED",
      correlationId: id,
    });
    return json(
      200,
      { outcome: "already_voided", attendance_id: attendanceId },
      id
    );
  }
  await env.DB.prepare(
    `UPDATE attendances SET status = 'Voided', voided_by = ?, voided_at = ?, void_reason = ?
      WHERE attendance_id = ? AND status = 'Active'`
  )
    .bind(
      current.user_id,
      new Date().toISOString(),
      input.reason.trim(),
      attendanceId
    )
    .run();
  await audit(env.DB, {
    actorUserId: current.user_id,
    action: "attendance.void",
    entityType: "Attendance",
    entityId: attendanceId,
    outcome: "SUCCESS",
    reason: input.reason.trim(),
    correlationId: id,
  });
  return json(200, { outcome: "voided", attendance_id: attendanceId }, id);
}

export async function handleCorrectGuest(
  request: Request,
  env: AttendanceEnv,
  attendanceId: string
): Promise<Response> {
  const id = requestId();
  const current = await requireActor(request, env, id);
  if (current instanceof Response) {
    return current;
  }
  const input = await body<{
    name?: unknown;
    phone?: unknown;
    reason?: unknown;
  }>(request);
  if (
    !input ||
    typeof input.name !== "string" ||
    typeof input.phone !== "string" ||
    typeof input.reason !== "string" ||
    !input.name.trim() ||
    !input.reason.trim()
  ) {
    return problem(422, "VALIDATION", "姓名、電話和原因都是必填資料。", id);
  }
  if (input.name.trim().length > GUEST_NAME_MAX_LENGTH) {
    return problem(
      422,
      "VALIDATION",
      `姓名不可超過 ${GUEST_NAME_MAX_LENGTH} 個字元。`,
      id
    );
  }
  const normalized = normalizeGuestPhone(input.phone);
  if (!normalized) {
    return problem(422, "VALIDATION", "請輸入有效電話號碼。", id);
  }
  const existing = await env.DB.prepare(
    `SELECT a.*, e.program_id FROM attendances a JOIN events e ON e.event_id = a.event_id
      WHERE a.attendance_id = ? AND a.member_user_id IS NULL`
  )
    .bind(attendanceId)
    .first<AttendanceRow & { program_id: string }>();
  if (!existing) {
    return problem(404, "NOT_FOUND", "找不到訪客簽到記錄。", id);
  }
  if (!(await permittedOperator(env, current, existing.program_id))) {
    return problem(403, "FORBIDDEN", "你沒有修改此訪客記錄的權限。", id);
  }
  try {
    const result = await env.DB.prepare(
      `UPDATE attendances SET guest_name = ?, guest_phone = ?, guest_phone_normalized = ?
        WHERE attendance_id = ? AND status = 'Active'`
    )
      .bind(input.name.trim(), input.phone.trim(), normalized, attendanceId)
      .run();
    if ((result.meta?.changes ?? 0) === 0) {
      // ADR-0023: a rejected mutation attempt is audited, like the check-in
      // DENIED paths, so the refusal leaves a trace.
      await audit(env.DB, {
        actorUserId: current.user_id,
        action: "attendance.guest_correct",
        entityType: "Attendance",
        entityId: attendanceId,
        outcome: "DENIED",
        reason: "NOT_ACTIVE_ATTENDANCE",
        correlationId: id,
      });
      return problem(409, "CONFLICT", "只有有效的簽到記錄可以修改。", id);
    }
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !/UNIQUE constraint failed/u.test(error.message)
    ) {
      // Only the active-guest unique index makes a correction a duplicate;
      // anything else must surface as a 500 rather than a mislabeled 409.
      throw error;
    }
    return problem(409, "DUPLICATE_ATTENDANCE", "此電話已在此聚會簽到。", id);
  }
  await audit(env.DB, {
    actorUserId: current.user_id,
    action: "attendance.guest_correct",
    entityType: "Attendance",
    entityId: attendanceId,
    outcome: "SUCCESS",
    oldValue: { name: existing.guest_name, phone: existing.guest_phone },
    newValue: { name: input.name.trim(), phone: input.phone.trim() },
    reason: input.reason.trim(),
    correlationId: id,
  });
  return json(200, { outcome: "corrected", attendance_id: attendanceId }, id);
}
