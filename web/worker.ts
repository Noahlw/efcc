/**
 * EFCC Cloudflare Worker (ADR-0017 / ADR-0018 / ADR-0020 / ADR-0021).
 *
 * Routes:
 *
 *   * `/api/v1/auth/*` — cookie-only auth surface (AUTH-04 #162 / AUTH-06
 *     #165). Locked actions — register, login, refresh, logout,
 *     registrations/:id/approve, registrations/:id/reject — plus the
 *     self-service account changes (username, password, UI-04 #196) and the
 *     preserved legacy forced-upgrade helpers (upgrade, me, admin-unlock).
 *     No CORS, no OPTIONS, no Authorization header, no X-Efcc-Session-Id
 *     header. Token material travels only in two httpOnly Secure
 *     SameSite=Strict cookies. The transport guard rejects forbidden
 *     headers before any handler runs.
 *
 *   * `/api/v1/programs/*` — D1-native Programs domain (PRG-01 #197).
 *
 *   * `/api/v1/attendance*` — D1-native Attendance domain.
 *
 *   * `/api/v1/home` — D1-native Home domain public projection (085-01 #306).
 *
 *   * `/api/v1/identity/*` — D1-native Role Identity domain (#478/#479/#485):
 *     hierarchy, role-definition detail, grant editing, rename, scope, create,
 *     and reorder mutations.
 * Non-/api paths fall through to the ASSETS binding (static export).
 * AUTH-01 (#159) and AUTH-02 (#160) keep D1 as the identity authority; AUTH-04
 * (#162) / AUTH-06 (#165) expose the locked cookie-only auth boundary.
 */

import { ACCESS_COOKIE_NAME, parseCookies } from "./lib/auth/cookies";

export interface Env {
  ASSETS: Fetcher;
  /**
   * D1 identity database (ADR-0020 / AUTH-01 #159). Sole system of record
   * for accounts, credentials, sessions, and registration requests. The
   * auth/session lifecycle in web/lib/auth/ reads and writes here.
   *
   * Set via `wrangler secret put EFCC_ACCESS_TOKEN_SECRET` before deploy;
   * the Worker fails closed when it is absent.
   */
  DB: D1Database;
  EFCC_ACCESS_TOKEN_SECRET?: string;
  /**
   * Rate Limiting binding. Optional in dev/test - when absent, rate
   * limiting is skipped. Used by the Attendance surface for guest
   * check-in rate limiting (keyed per event, NEVER on client IP).
   */
  RPC_RATE_LIMITER?: RateLimit;
}

// ---------------------------------------------------------------------------
// Helpers (declared before use per lint rule; hoisting works but the rule
// prefers textual ordering for readability).
// ---------------------------------------------------------------------------

function authProblemResponse(
  status: number,
  code: string,
  title: string,
  detail: string,
  requestId: string = crypto.randomUUID()
): Response {
  return Response.json(
    {
      type: `tag:apps-script/efcc/errors#${code}`,
      title,
      status,
      detail,
      code,
      requestId,
    },
    {
      status,
      headers: {
        "Content-Type": "application/problem+json",
        "X-Request-Id": requestId,
      },
    }
  );
}

/**
 * Decode a percent-encoded path segment without throwing on malformed
 * encoding (e.g. a lone `%` or a truncated `%E4`). Returns null for
 * malformed input so routes can answer with a stable RFC 9457
 * validation/not-found problem instead of a 500.
 */
function decodePathSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
/**
 * Cookie-only transport guard for the `/api/v1/auth/*` surface (AUTH-04 #162).
 * Rejects:
 *   * OPTIONS / non-POST/GET methods (no CORS preflight support).
 *   * Authorization header (every flavor is forbidden on this surface).
 *   * X-Efcc-Session-Id header (the legacy session id travels only via the
 *     opaque refresh cookie).
 *   * Cross-origin requests (no CORS = no cross-origin).
 * Returns null on a clean cookie-only same-origin request, or a 403/405
 * Response otherwise.
 */
function authTransportGuard(request: Request): Response | null {
  const url = new URL(request.url);
  const reqOrigin = request.headers.get("Origin");
  // Same-origin when no Origin is sent (same-host navigation) or when the
  // Origin matches the Worker's own host.
  if (reqOrigin) {
    let reqOriginHost: string;
    try {
      reqOriginHost = new URL(reqOrigin).host;
    } catch {
      return authProblemResponse(
        403,
        "CROSS_ORIGIN_FORBIDDEN",
        "Forbidden",
        "Cross-origin requests are not supported on this transport."
      );
    }
    if (reqOriginHost !== url.host) {
      return authProblemResponse(
        403,
        "CROSS_ORIGIN_FORBIDDEN",
        "Forbidden",
        "Cross-origin requests are not supported on this transport."
      );
    }
  }
  if (request.method === "OPTIONS") {
    return authProblemResponse(
      405,
      "METHOD_NOT_ALLOWED",
      "Method Not Allowed",
      "CORS preflight is not supported on this transport."
    );
  }
  if (request.headers.get("Authorization") !== null) {
    return authProblemResponse(
      403,
      "TRANSPORT_FORBIDDEN",
      "Forbidden",
      "Authorization header is not supported on this transport."
    );
  }
  if (request.headers.get("X-Efcc-Session-Id") !== null) {
    return authProblemResponse(
      403,
      "TRANSPORT_FORBIDDEN",
      "Forbidden",
      "X-Efcc-Session-Id header is not supported on this transport."
    );
  }
  return null;
}

export default {
  // The explicit route matrix is the locked auth contract; complexity is intentional.
  // oxlint-disable-next-line complexity
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ---- Auth surface: cookie-only transport, no CORS ------------------
    if (url.pathname.startsWith("/api/v1/auth/")) {
      try {
        // oxlint-disable-next-line complexity
        return await (async () => {
          const guard = authTransportGuard(request);
          if (guard) {
            return guard;
          }
          if (!env.EFCC_ACCESS_TOKEN_SECRET) {
            return authProblemResponse(
              503,
              "AUTH_NOT_CONFIGURED",
              "Service unavailable",
              "Auth signing secret is not configured."
            );
          }
          const authEnv = {
            DB: env.DB,
            EFCC_ACCESS_TOKEN_SECRET: env.EFCC_ACCESS_TOKEN_SECRET,
          } as const;
          const {
            handleRegister,
            handleLogin,
            handleUpgrade,
            handleRefresh,
            handleLogout,
            handleMe,
            handleAdminUnlock,
            handleApprove,
            handleApproveBatch,
            handleReject,
            handleListRegistrations,
            handleRegistrationDetail,
            handleChangeUsername,
            handleChangePassword,
          } = await import("./lib/auth/handlers");
          if (
            url.pathname === "/api/v1/auth/username" &&
            request.method === "POST"
          ) {
            return handleChangeUsername(request, authEnv);
          }
          if (
            url.pathname === "/api/v1/auth/password" &&
            request.method === "POST"
          ) {
            return handleChangePassword(request, authEnv);
          }
          if (
            url.pathname === "/api/v1/auth/register" &&
            request.method === "POST"
          ) {
            return handleRegister(request, authEnv);
          }
          if (
            url.pathname === "/api/v1/auth/login" &&
            request.method === "POST"
          ) {
            return handleLogin(request, authEnv);
          }
          if (
            url.pathname === "/api/v1/auth/upgrade" &&
            request.method === "POST"
          ) {
            return handleUpgrade(request, authEnv);
          }
          if (
            url.pathname === "/api/v1/auth/refresh" &&
            request.method === "POST"
          ) {
            return handleRefresh(request, authEnv);
          }
          if (
            url.pathname === "/api/v1/auth/logout" &&
            request.method === "POST"
          ) {
            return handleLogout(request, authEnv);
          }
          if (url.pathname === "/api/v1/auth/me" && request.method === "GET") {
            return handleMe(request, authEnv);
          }
          if (
            url.pathname === "/api/v1/auth/registrations" &&
            request.method === "GET"
          ) {
            return handleListRegistrations(request, authEnv);
          }
          if (
            url.pathname === "/api/v1/auth/registrations/approve-batch" &&
            request.method === "POST"
          ) {
            return handleApproveBatch(request, authEnv);
          }
          const registrationDetail = url.pathname.match(
            /^\/api\/v1\/auth\/registrations\/(?<id>[^/]+)$/u
          );
          if (registrationDetail && request.method === "GET") {
            return handleRegistrationDetail(
              request,
              authEnv,
              registrationDetail.groups?.id ?? ""
            );
          }
          if (
            url.pathname === "/api/v1/auth/admin-unlock" &&
            request.method === "POST"
          ) {
            return handleAdminUnlock(request, authEnv);
          }
          const approve = url.pathname.match(
            /^\/api\/v1\/auth\/registrations\/(?<id>[^/]+)\/approve$/u
          );
          if (approve && request.method === "POST") {
            return handleApprove(request, authEnv, approve.groups?.id ?? "");
          }
          const reject = url.pathname.match(
            /^\/api\/v1\/auth\/registrations\/(?<id>[^/]+)\/reject$/u
          );
          if (reject && request.method === "POST") {
            return handleReject(request, authEnv, reject.groups?.id ?? "");
          }
          return authProblemResponse(
            404,
            "NOT_FOUND",
            "Not found",
            "Unknown auth route."
          );
        })();
      } catch (error) {
        // RFC 9457 envelope for unhandled route errors. Typed errors already
        // flow through the handlers' problem() paths; this catch only fires
        // on untyped throws. authProblemResponse sets X-Request-Id, so the
        // 500 always carries one for log correlation.
        // The detail is a constant safe string (ADR-0018 §5): raw exception
        // text could expose D1/implementation diagnostics; the requestId in
        // the envelope correlates with the server log line below.
        const requestId = crypto.randomUUID();
        console.error(
          `[auth] unhandled route error requestId=${requestId}:`,
          error
        );
        return authProblemResponse(
          500,
          "INTERNAL_ERROR",
          "Internal error",
          "Internal server error.",
          requestId
        );
      }
    }

    // ---- Programs domain: cookie-only transport, no CORS ----------------
    if (url.pathname.startsWith("/api/v1/programs/")) {
      if (!env.EFCC_ACCESS_TOKEN_SECRET) {
        return authProblemResponse(
          503,
          "AUTH_NOT_CONFIGURED",
          "Service unavailable",
          "Auth signing secret is not configured."
        );
      }
      const programEnv = {
        DB: env.DB,
        EFCC_ACCESS_TOKEN_SECRET: env.EFCC_ACCESS_TOKEN_SECRET,
      } as const;
      if (url.pathname === "/api/v1/programs/account-permissions") {
        return authProblemResponse(
          404,
          "NOT_FOUND",
          "Not found",
          "Unknown programs route."
        );
      }
      const {
        handleCreateDepartment,
        handleListDepartments,
        handleListManagementAccess,
        handleGetManagementHub,
        handleListManagementDirectory,
        handleSearchManagementMembers,
        handleSearchAccountDirectory,
        handleGetAccountDirectoryDetail,
        handleGetManagementAttention,
        handleGetManagementNotifications,
        handleMarkManagementNotificationsRead,
        handleListParticipantCatalog,
        handleGetParticipantProgramDetail,
        handleGetManagementProgram,
        handleGetManagementCockpit,
        handleGetDepartment,
        handleUpdateDepartment,
        handleCreateProgram,
        handleListPrograms,
        handleGetProgram,
        handleUpdateProgram,
        handleSearchMemberOptions,
        handleSetModule,
        handleListScheduleRules,
        handleListScheduleExceptions,
        handleCreateScheduleRule,
        handleUpdateScheduleRule,
        handleCreateScheduleException,
        handleDeleteScheduleException,
        handlePreviewEvents,
        handleGenerateEvents,
        handleCreateEvent,
        handleListEvents,
        handleGetEvent,
        handleEventUpdate,
        handleCreateEnrollmentRequest,
        handleListEnrollmentRequests,
        handleListEnrollmentSnapshot,
        handleDecideEnrollmentRequest,
        handleWithdrawEnrollmentRequest,
        handleAssistedEnroll,
        handleListEnrollments,
        handleCancelEnrollment,
        handleListParticipantNotices,
        handleMarkParticipantNoticesRead,
        handleCreateParticipantNotice,
      } = await import("./lib/programs/program-handlers");

      if (
        url.pathname === "/api/v1/programs/access" &&
        request.method === "GET"
      ) {
        return handleListManagementAccess(request, programEnv);
      }
      if (url.pathname === "/api/v1/programs/hub" && request.method === "GET") {
        return handleGetManagementHub(request, programEnv);
      }
      if (
        url.pathname === "/api/v1/programs/management-directory" &&
        request.method === "GET"
      ) {
        return handleListManagementDirectory(request, programEnv);
      }
      if (
        url.pathname.startsWith("/api/v1/programs/accounts/") &&
        request.method === "GET"
      ) {
        const accountId = url.pathname.slice(
          "/api/v1/programs/accounts/".length
        );
        return handleGetAccountDirectoryDetail(request, programEnv, accountId);
      }
      if (
        url.pathname === "/api/v1/programs/accounts" &&
        request.method === "GET"
      ) {
        return handleSearchAccountDirectory(request, programEnv);
      }
      if (
        url.pathname === "/api/v1/programs/members" &&
        request.method === "GET"
      ) {
        return handleSearchManagementMembers(request, programEnv);
      }
      if (
        url.pathname === "/api/v1/programs/attention" &&
        request.method === "GET"
      ) {
        return handleGetManagementAttention(request, programEnv);
      }
      if (
        url.pathname === "/api/v1/programs/notifications" &&
        request.method === "GET"
      ) {
        return handleGetManagementNotifications(request, programEnv);
      }
      if (
        url.pathname === "/api/v1/programs/notifications/read" &&
        request.method === "POST"
      ) {
        return handleMarkManagementNotificationsRead(request, programEnv);
      }
      if (
        url.pathname === "/api/v1/programs/notices" &&
        request.method === "GET"
      ) {
        return handleListParticipantNotices(request, programEnv);
      }
      if (
        url.pathname === "/api/v1/programs/notices/read-all" &&
        request.method === "POST"
      ) {
        return handleMarkParticipantNoticesRead(request, programEnv);
      }
      if (
        url.pathname === "/api/v1/programs/notices" &&
        request.method === "POST"
      ) {
        return handleCreateParticipantNotice(request, programEnv);
      }
      if (
        url.pathname === "/api/v1/programs/catalog" &&
        request.method === "GET"
      ) {
        return handleListParticipantCatalog(request, programEnv);
      }
      const managementProgram = url.pathname.match(
        /^\/api\/v1\/programs\/(?<id>[^/]+)\/management$/u
      );
      if (managementProgram && request.method === "GET") {
        return handleGetManagementProgram(
          request,
          programEnv,
          managementProgram.groups?.id ?? ""
        );
      }
      const cockpit = url.pathname.match(
        /^\/api\/v1\/programs\/(?<id>[^/]+)\/cockpit$/u
      );
      if (cockpit && request.method === "GET") {
        return handleGetManagementCockpit(
          request,
          programEnv,
          cockpit.groups?.id ?? ""
        );
      }
      const participantDetail = url.pathname.match(
        /^\/api\/v1\/programs\/(?<id>[^/]+)\/participant-detail$/u
      );
      if (participantDetail && request.method === "GET") {
        return handleGetParticipantProgramDetail(
          request,
          programEnv,
          participantDetail.groups?.id ?? ""
        );
      }
      if (
        url.pathname === "/api/v1/programs/departments" &&
        request.method === "POST"
      ) {
        return handleCreateDepartment(request, programEnv);
      }
      if (
        url.pathname === "/api/v1/programs/departments" &&
        request.method === "GET"
      ) {
        return handleListDepartments(request, programEnv);
      }
      const department = url.pathname.match(
        /^\/api\/v1\/programs\/departments\/(?<id>[^/]+)$/u
      );
      if (department && request.method === "GET") {
        return handleGetDepartment(
          request,
          programEnv,
          department.groups?.id ?? ""
        );
      }
      if (department && request.method === "PATCH") {
        return handleUpdateDepartment(
          request,
          programEnv,
          department.groups?.id ?? ""
        );
      }
      const departmentPrograms = url.pathname.match(
        /^\/api\/v1\/programs\/departments\/(?<id>[^/]+)\/programs$/u
      );
      if (departmentPrograms && request.method === "POST") {
        return handleCreateProgram(
          request,
          programEnv,
          departmentPrograms.groups?.id ?? ""
        );
      }
      if (departmentPrograms && request.method === "GET") {
        return handleListPrograms(
          request,
          programEnv,
          departmentPrograms.groups?.id ?? ""
        );
      }
      const moduleMatch = url.pathname.match(
        /^\/api\/v1\/programs\/departments\/(?<id>[^/]+)\/modules\/(?<key>[^/]+)\/(?<action>enable|disable)$/u
      );
      if (moduleMatch && request.method === "POST") {
        return handleSetModule(
          request,
          programEnv,
          moduleMatch.groups?.id ?? "",
          moduleMatch.groups?.key ?? "",
          moduleMatch.groups?.action === "enable"
        );
      }
      const program = url.pathname.match(
        /^\/api\/v1\/programs\/(?<id>[^/]+)$/u
      );
      if (program && request.method === "GET") {
        return handleGetProgram(request, programEnv, program.groups?.id ?? "");
      }
      if (program && request.method === "PATCH") {
        return handleUpdateProgram(
          request,
          programEnv,
          program.groups?.id ?? ""
        );
      }
      const memberOptions = url.pathname.match(
        /^\/api\/v1\/programs\/(?<id>[^/]+)\/member-options$/u
      );
      if (memberOptions && request.method === "GET") {
        return handleSearchMemberOptions(
          request,
          programEnv,
          memberOptions.groups?.id ?? ""
        );
      }
      const scheduleRules = url.pathname.match(
        /^\/api\/v1\/programs\/(?<id>[^/]+)\/schedule-rules$/u
      );
      if (scheduleRules && request.method === "POST") {
        return handleCreateScheduleRule(
          request,
          programEnv,
          scheduleRules.groups?.id ?? ""
        );
      }
      if (scheduleRules && request.method === "GET") {
        return handleListScheduleRules(
          request,
          programEnv,
          scheduleRules.groups?.id ?? ""
        );
      }
      const scheduleRule = url.pathname.match(
        /^\/api\/v1\/programs\/(?<id>[^/]+)\/schedule-rules\/(?<ruleId>[^/]+)$/u
      );
      if (scheduleRule && request.method === "PATCH") {
        return handleUpdateScheduleRule(
          request,
          programEnv,
          scheduleRule.groups?.id ?? "",
          scheduleRule.groups?.ruleId ?? ""
        );
      }
      const scheduleExceptions = url.pathname.match(
        /^\/api\/v1\/programs\/(?<id>[^/]+)\/schedule-rules\/(?<ruleId>[^/]+)\/exceptions$/u
      );
      if (scheduleExceptions && request.method === "POST") {
        return handleCreateScheduleException(
          request,
          programEnv,
          scheduleExceptions.groups?.id ?? "",
          scheduleExceptions.groups?.ruleId ?? ""
        );
      }
      if (scheduleExceptions && request.method === "GET") {
        return handleListScheduleExceptions(
          request,
          programEnv,
          scheduleExceptions.groups?.id ?? "",
          scheduleExceptions.groups?.ruleId ?? ""
        );
      }
      const scheduleException = url.pathname.match(
        /^\/api\/v1\/programs\/(?<id>[^/]+)\/schedule-rules\/(?<ruleId>[^/]+)\/exceptions\/(?<exceptionId>[^/]+)$/u
      );
      if (scheduleException && request.method === "DELETE") {
        return handleDeleteScheduleException(
          request,
          programEnv,
          scheduleException.groups?.id ?? "",
          scheduleException.groups?.exceptionId ?? ""
        );
      }
      const programPreview = url.pathname.match(
        /^\/api\/v1\/programs\/(?<id>[^/]+)\/events\/preview$/u
      );
      if (programPreview && request.method === "POST") {
        return handlePreviewEvents(
          request,
          programEnv,
          programPreview.groups?.id ?? ""
        );
      }
      const programGenerate = url.pathname.match(
        /^\/api\/v1\/programs\/(?<id>[^/]+)\/events\/generate$/u
      );
      if (programGenerate && request.method === "POST") {
        return handleGenerateEvents(
          request,
          programEnv,
          programGenerate.groups?.id ?? ""
        );
      }
      const programEvents = url.pathname.match(
        /^\/api\/v1\/programs\/(?<id>[^/]+)\/events$/u
      );
      if (programEvents && request.method === "POST") {
        return handleCreateEvent(
          request,
          programEnv,
          programEvents.groups?.id ?? ""
        );
      }
      if (programEvents && request.method === "GET") {
        return handleListEvents(
          request,
          programEnv,
          programEvents.groups?.id ?? ""
        );
      }
      const event = url.pathname.match(
        /^\/api\/v1\/programs\/(?<id>[^/]+)\/events\/(?<eventId>[^/]+)$/u
      );
      if (event && request.method === "GET") {
        return handleGetEvent(
          request,
          programEnv,
          event.groups?.id ?? "",
          event.groups?.eventId ?? ""
        );
      }
      if (event && request.method === "PATCH") {
        return handleEventUpdate(
          request,
          programEnv,
          event.groups?.id ?? "",
          event.groups?.eventId ?? ""
        );
      }
      const enrollmentRequests = url.pathname.match(
        /^\/api\/v1\/programs\/(?<id>[^/]+)\/enrollment-requests$/u
      );
      if (enrollmentRequests && request.method === "POST") {
        return handleCreateEnrollmentRequest(
          request,
          programEnv,
          enrollmentRequests.groups?.id ?? ""
        );
      }
      if (enrollmentRequests && request.method === "GET") {
        return handleListEnrollmentRequests(
          request,
          programEnv,
          enrollmentRequests.groups?.id ?? ""
        );
      }
      const enrollmentSnapshot = url.pathname.match(
        /^\/api\/v1\/programs\/(?<id>[^/]+)\/enrollment-snapshot$/u
      );
      if (enrollmentSnapshot && request.method === "GET") {
        return handleListEnrollmentSnapshot(
          request,
          programEnv,
          enrollmentSnapshot.groups?.id ?? ""
        );
      }
      const enrollmentRequest = url.pathname.match(
        /^\/api\/v1\/programs\/(?<id>[^/]+)\/enrollment-requests\/(?<requestId>[^/]+)\/(?<action>decision|withdraw)$/u
      );
      if (enrollmentRequest && request.method === "POST") {
        if (enrollmentRequest.groups?.action === "decision") {
          return handleDecideEnrollmentRequest(
            request,
            programEnv,
            enrollmentRequest.groups?.id ?? "",
            enrollmentRequest.groups?.requestId ?? ""
          );
        }
        return handleWithdrawEnrollmentRequest(
          request,
          programEnv,
          enrollmentRequest.groups?.id ?? "",
          enrollmentRequest.groups?.requestId ?? ""
        );
      }
      const enrollments = url.pathname.match(
        /^\/api\/v1\/programs\/(?<id>[^/]+)\/enrollments$/u
      );
      if (enrollments && request.method === "POST") {
        return handleAssistedEnroll(
          request,
          programEnv,
          enrollments.groups?.id ?? ""
        );
      }
      if (enrollments && request.method === "GET") {
        return handleListEnrollments(
          request,
          programEnv,
          enrollments.groups?.id ?? ""
        );
      }
      const enrollment = url.pathname.match(
        /^\/api\/v1\/programs\/(?<id>[^/]+)\/enrollments\/(?<enrollmentId>[^/]+)\/cancel$/u
      );
      if (enrollment && request.method === "POST") {
        return handleCancelEnrollment(
          request,
          programEnv,
          enrollment.groups?.id ?? "",
          enrollment.groups?.enrollmentId ?? ""
        );
      }
      return authProblemResponse(
        404,
        "NOT_FOUND",
        "Not found",
        "Unknown programs route."
      );
    }

    if (url.pathname.startsWith("/api/v1/attendance")) {
      if (!env.EFCC_ACCESS_TOKEN_SECRET) {
        return authProblemResponse(
          503,
          "AUTH_NOT_CONFIGURED",
          "Service unavailable",
          "Auth signing secret is not configured."
        );
      }
      const attendanceEnv = {
        DB: env.DB,
        EFCC_ACCESS_TOKEN_SECRET: env.EFCC_ACCESS_TOKEN_SECRET,
        RPC_RATE_LIMITER: env.RPC_RATE_LIMITER,
      } as const;
      const {
        handleAssistedCheckIn,
        handleCorrectGuest,
        handleGuestCheckIn,
        handleListManageableEvents,
        handleListRoster,
        handleListScannerEvents,
        handleSearchMembers,
        handleResolve,
        handleSelfCheckIn,
        handleVoidAttendance,
      } = await import("./lib/attendance");

      if (
        url.pathname === "/api/v1/attendance/events" &&
        request.method === "GET"
      ) {
        return handleListManageableEvents(request, attendanceEnv);
      }

      if (
        url.pathname === "/api/v1/attendance/scanner-events" &&
        request.method === "GET"
      ) {
        return handleListScannerEvents(request, attendanceEnv);
      }

      if (
        url.pathname === "/api/v1/attendance/resolve" &&
        request.method === "GET"
      ) {
        return handleResolve(request, attendanceEnv);
      }
      if (
        url.pathname === "/api/v1/attendance/self" &&
        request.method === "POST"
      ) {
        return handleSelfCheckIn(request, attendanceEnv);
      }
      if (
        url.pathname === "/api/v1/attendance/guest" &&
        request.method === "POST"
      ) {
        return handleGuestCheckIn(request, attendanceEnv);
      }
      const eventAttendance = url.pathname.match(
        /^\/api\/v1\/attendance\/events\/(?<eventId>[^/]+)\/(?<action>check-in|roster|members)$/u
      );
      if (
        eventAttendance?.groups?.action === "roster" &&
        request.method === "GET"
      ) {
        return handleListRoster(
          request,
          attendanceEnv,
          eventAttendance.groups.eventId ?? ""
        );
      }
      if (
        eventAttendance?.groups?.action === "members" &&
        request.method === "GET"
      ) {
        return handleSearchMembers(
          request,
          attendanceEnv,
          eventAttendance.groups.eventId ?? ""
        );
      }
      if (
        eventAttendance?.groups?.action === "check-in" &&
        request.method === "POST"
      ) {
        return handleAssistedCheckIn(
          request,
          attendanceEnv,
          eventAttendance.groups.eventId ?? ""
        );
      }
      const attendanceAction = url.pathname.match(
        /^\/api\/v1\/attendance\/(?<attendanceId>[^/]+)\/(?<action>void|guest-correction)$/u
      );
      if (
        attendanceAction?.groups?.action === "void" &&
        request.method === "POST"
      ) {
        return handleVoidAttendance(
          request,
          attendanceEnv,
          attendanceAction.groups.attendanceId ?? ""
        );
      }
      if (
        attendanceAction?.groups?.action === "guest-correction" &&
        request.method === "PATCH"
      ) {
        return handleCorrectGuest(
          request,
          attendanceEnv,
          attendanceAction.groups.attendanceId ?? ""
        );
      }
      return authProblemResponse(
        404,
        "NOT_FOUND",
        "Not found",
        "Unknown attendance route."
      );
    }

    // ---- Home domain: cookie-only transport, public participant projection
    if (
      url.pathname === "/api/v1/home" ||
      url.pathname.startsWith("/api/v1/home/")
    ) {
      if (!env.EFCC_ACCESS_TOKEN_SECRET) {
        return authProblemResponse(
          503,
          "AUTH_NOT_CONFIGURED",
          "Service unavailable",
          "Auth signing secret is not configured."
        );
      }
      const homeEnv = {
        DB: env.DB,
        EFCC_ACCESS_TOKEN_SECRET: env.EFCC_ACCESS_TOKEN_SECRET,
      } as const;
      const { handleGetHome, handleGetAnnouncements } =
        await import("./lib/home-handlers");
      const {
        handleGetHomeContent,
        handleGetFeaturedEventPreview,
        handleSaveHomeDraft,
        handlePublishHome,
        handleListHomeAudit,
      } = await import("./lib/home-cms-handlers");

      if (url.pathname === "/api/v1/home" && request.method === "GET") {
        return handleGetHome(request, homeEnv);
      }
      if (
        url.pathname === "/api/v1/home/announcements" &&
        request.method === "GET"
      ) {
        return handleGetAnnouncements(request, homeEnv);
      }
      if (url.pathname === "/api/v1/home/content" && request.method === "GET") {
        return handleGetHomeContent(request, homeEnv);
      }
      if (url.pathname === "/api/v1/home/draft" && request.method === "POST") {
        return handleSaveHomeDraft(request, homeEnv);
      }
      if (
        url.pathname === "/api/v1/home/publish" &&
        request.method === "POST"
      ) {
        return handlePublishHome(request, homeEnv);
      }
      if (url.pathname === "/api/v1/home/audit" && request.method === "GET") {
        return handleListHomeAudit(request, homeEnv);
      }
      const featuredPreviewPrefix = "/api/v1/home/cms/featured-event/";
      if (
        url.pathname.startsWith(featuredPreviewPrefix) &&
        request.method === "GET"
      ) {
        const eventId = decodeURIComponent(
          url.pathname.slice(featuredPreviewPrefix.length)
        );
        return handleGetFeaturedEventPreview(request, homeEnv, eventId);
      }

      return authProblemResponse(
        404,
        "NOT_FOUND",
        "Not found",
        "Unknown home route."
      );
    }

    // ---- Role Identity domain (Spec 091 / #478): cookie-only transport --
    if (url.pathname.startsWith("/api/v1/identity/")) {
      const guard = authTransportGuard(request);
      if (guard) {
        return guard;
      }
      if (!parseCookies(request.headers.get("Cookie"))[ACCESS_COOKIE_NAME]) {
        return authProblemResponse(
          401,
          "AUTH_REQUIRED",
          "Unauthorized",
          "Access cookie missing."
        );
      }
      if (!env.EFCC_ACCESS_TOKEN_SECRET) {
        return authProblemResponse(
          503,
          "AUTH_NOT_CONFIGURED",
          "Service unavailable",
          "Auth signing secret is not configured."
        );
      }
      const roleEnv = {
        DB: env.DB,
        EFCC_ACCESS_TOKEN_SECRET: env.EFCC_ACCESS_TOKEN_SECRET,
      } as const;
      const {
        handleGetRoleHierarchy,
        handleRenameRoleDefinition,
        handleCreateRoleDefinition,
        handleRescopeRoleDefinition,
        handleReorderRoleDefinitions,
      } = await import("./lib/identity/role-handlers");
      const {
        handleGetRoleDefinitionDetail,
        handleUpdateRoleDefinitionGrants,
      } = await import("./lib/identity/permission-editor-handlers");
      const {
        handleSearchEligibleAccounts,
        handleGetAccountAccess,
        handleMutateAccountAssignments,
        handleRevokeAccountAssignments,
        handleGetRoleDefinitionLifecyclePreview,
        handleRoleDefinitionLifecycle,
      } = await import("./lib/identity/account-access-handlers");

      if (
        url.pathname === "/api/v1/identity/roles" &&
        request.method === "GET"
      ) {
        return handleGetRoleHierarchy(request, roleEnv);
      }
      if (
        url.pathname === "/api/v1/identity/role-definitions" &&
        request.method === "POST"
      ) {
        return handleCreateRoleDefinition(request, roleEnv);
      }
      if (
        url.pathname === "/api/v1/identity/roles/order" &&
        request.method === "PATCH"
      ) {
        return handleReorderRoleDefinitions(request, roleEnv);
      }
      if (
        url.pathname === "/api/v1/identity/accounts" &&
        request.method === "GET"
      ) {
        return handleSearchEligibleAccounts(request, roleEnv);
      }
      const accountPrefix = "/api/v1/identity/accounts/";
      if (url.pathname.startsWith(accountPrefix)) {
        const accountPath = url.pathname.slice(accountPrefix.length);
        const revokeSuffix = "/assignments/revoke";
        const assignmentSuffix = "/assignments";
        const isRevoke = accountPath.endsWith(revokeSuffix);
        const suffix = isRevoke ? revokeSuffix : assignmentSuffix;
        if (accountPath.endsWith(suffix)) {
          const accountSegment = accountPath.slice(0, -suffix.length);
          if (accountSegment.includes("/")) {
            return authProblemResponse(
              404,
              "ROLE_TARGET_INELIGIBLE",
              "Not found",
              "找不到指定的帳戶。"
            );
          }
          const accountUserId = decodePathSegment(accountSegment);
          if (accountUserId === null || accountUserId.length === 0) {
            return authProblemResponse(
              404,
              "ROLE_TARGET_INELIGIBLE",
              "Not found",
              "找不到指定的帳戶。"
            );
          }
          if (request.method === "GET" && !isRevoke) {
            return handleGetAccountAccess(request, roleEnv, accountUserId);
          }
          if (request.method === "POST") {
            return isRevoke
              ? handleRevokeAccountAssignments(request, roleEnv, accountUserId)
              : handleMutateAccountAssignments(request, roleEnv, accountUserId);
          }
        }
      }
      const lifecyclePrefix = "/api/v1/identity/role-definitions/";
      if (
        url.pathname.startsWith(lifecyclePrefix) &&
        url.pathname.endsWith("/lifecycle") &&
        request.method === "GET"
      ) {
        const roleDefinitionId = decodePathSegment(
          url.pathname.slice(lifecyclePrefix.length, -"/lifecycle".length)
        );
        if (roleDefinitionId === null || roleDefinitionId.includes("/")) {
          return authProblemResponse(
            404,
            "ROLE_NOT_FOUND",
            "Not found",
            "找不到指定的身份組。"
          );
        }
        return handleGetRoleDefinitionLifecyclePreview(
          request,
          roleEnv,
          roleDefinitionId
        );
      }
      if (
        url.pathname.startsWith(lifecyclePrefix) &&
        url.pathname.endsWith("/lifecycle") &&
        request.method === "POST"
      ) {
        const roleDefinitionId = decodePathSegment(
          url.pathname.slice(lifecyclePrefix.length, -"/lifecycle".length)
        );
        if (roleDefinitionId === null || roleDefinitionId.includes("/")) {
          return authProblemResponse(
            404,
            "ROLE_NOT_FOUND",
            "Not found",
            "找不到指定的身份組。"
          );
        }
        return handleRoleDefinitionLifecycle(
          request,
          roleEnv,
          roleDefinitionId
        );
      }
      const detailPrefix = "/api/v1/identity/role-definitions/";
      const detailPath = url.pathname.slice(detailPrefix.length);
      if (
        url.pathname.startsWith(detailPrefix) &&
        request.method === "GET" &&
        !detailPath.includes("/")
      ) {
        const roleDefinitionId = decodePathSegment(detailPath);
        if (roleDefinitionId === null) {
          return authProblemResponse(
            404,
            "ROLE_NOT_FOUND",
            "Not found",
            "找不到指定的身份組。"
          );
        }
        return handleGetRoleDefinitionDetail(
          request,
          roleEnv,
          roleDefinitionId
        );
      }
      if (
        url.pathname.startsWith(detailPrefix) &&
        request.method === "PATCH" &&
        detailPath.endsWith("/grants")
      ) {
        const rolePath = detailPath.slice(0, -"/grants".length);
        if (rolePath.includes("/")) {
          return authProblemResponse(
            404,
            "ROLE_NOT_FOUND",
            "Not found",
            "找不到指定的身份組。"
          );
        }
        const roleDefinitionId = decodePathSegment(rolePath);
        if (roleDefinitionId === null) {
          return authProblemResponse(
            404,
            "ROLE_NOT_FOUND",
            "Not found",
            "找不到指定的身份組。"
          );
        }
        return handleUpdateRoleDefinitionGrants(
          request,
          roleEnv,
          roleDefinitionId
        );
      }
      const rescopePrefix = "/api/v1/identity/role-definitions/";
      if (
        url.pathname.startsWith(rescopePrefix) &&
        url.pathname.endsWith("/scope") &&
        request.method === "PATCH"
      ) {
        const roleDefinitionId = decodePathSegment(
          url.pathname.slice(rescopePrefix.length, -"/scope".length)
        );
        if (roleDefinitionId === null) {
          return authProblemResponse(
            404,
            "ROLE_NOT_FOUND",
            "Not found",
            "找不到指定的身份組。"
          );
        }
        return handleRescopeRoleDefinition(request, roleEnv, roleDefinitionId);
      }
      const renamePrefix = "/api/v1/identity/roles/";
      if (
        url.pathname.startsWith(renamePrefix) &&
        url.pathname.endsWith("/name") &&
        request.method === "PATCH"
      ) {
        const roleDefinitionId = decodePathSegment(
          url.pathname.slice(renamePrefix.length, -"/name".length)
        );
        if (roleDefinitionId === null) {
          // Malformed percent-encoding in the role ID is a stable 404
          // Problem Details response, never a 500 (RFC 9457).
          return authProblemResponse(
            404,
            "ROLE_NOT_FOUND",
            "Not found",
            "找不到指定的身份組。"
          );
        }
        return handleRenameRoleDefinition(request, roleEnv, roleDefinitionId);
      }
      return authProblemResponse(
        404,
        "NOT_FOUND",
        "Not found",
        "Unknown identity route."
      );
    }

    // ---- Static assets fallthrough -------------------------------------
    if (!url.pathname.startsWith("/api/")) {
      // Should not normally be reached (run_worker_first scopes this
      // Worker to /api/* only), but fall back to assets defensively.
      return env.ASSETS.fetch(request);
    }

    return authProblemResponse(404, "NOT_FOUND", "Not found", "Unknown route.");
  },
} satisfies ExportedHandler<Env>;
