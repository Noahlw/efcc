/**
 * EFCC 顯恩堂 — server entry point.
 *
 * Stable top-level App Document per ADR-0010 (single HTML Service entry;
 * client-side module composition in shell.js.html). doGet() must not read
 * the incoming request's query parameters — navigation lives entirely in
 * the SPA shell hosted by App.html, not query-string routing.
 *
 * Public RPC entry points (no trailing underscore) and the DTO they
 * return are documented in this file. Sensitive helpers (sheet access,
 * HMAC, session storage) live in dedicated modules and use the
 * trailing-underscore convention so they are NOT directly
 * browser-callable per ADR-0003 / spec 009.
 *
 * Apps Script APIs used (per AGENTS.md docs-backed method rule):
 *   - HtmlService.createTemplateFromFile(name):
 *     https://developers.google.com/apps-script/reference/html/html-service#createTemplateFromFile(String)
 *   - HtmlOutput.setTitle / addMetaTag / setXFrameOptionsMode:
 *     https://developers.google.com/apps-script/reference/html/html-output
 *   - XFrameOptionsMode.ALLOWALL:
 *     https://developers.google.com/apps-script/reference/html/x-frame-options-mode#ALLOWALL
 *   - addMetaTag("viewport", ...) is in the explicit allowlist per
 *     the official HtmlOutput docs.
 */

function doGet(e) {
  return HtmlService.createTemplateFromFile("App")
    .evaluate()
    .setTitle("EFCC 顯恩堂")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ---------------------------------------------------------------------------
// AuthenticatedBootstrap DTO and capability calculator
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} AuthenticatedBootstrap
 * @property {{userId: string, name: string, role: string,
 *            qrCodeString: string, sessionId: string,
 *            sessionToken: string}} session
 *   Per #73 the session has no expiryTimestamp — sessions are
 *   non-expiring until revoked. The browser stores sessionId +
 *   sessionToken; the server stores sessionId -> {userId, issuedAt}.
 * @property {Array<{key: string, label: string, capability: string}>} sections
 *   Server-authorized Sections the client may render. The first entry
 *   is the initial route (Profile for every authenticated role in
 *   Day 1 per ADR-0010 / spec 009).
 * @property {{userId: string, name: string, username: string,
 *           phone: string, role: string, status: string,
 *           qrCodeString: string}} profile
 *   Initial Profile data per issue #66. Distinct from the session
 *   block so future Profile fields can evolve without changing the
 *   session shape.
 */

/**
 * Compute the Sections list for a given user. Per ADR-0006 / issue
 * #64 Day 1 / issue #67, every authenticated role lands on Profile.
 * Programs and Events are visible to every authenticated user.
 * Scanner is visible to Program Leaders (if they have active
 * assignments), STAFF, and ADMIN. Care and Permissions are visible
 * only to STAFF and ADMIN. Every protected RPC independently
 * rechecks authorization — this is presentation, not enforcement.
 *
 * @param {string} role One of "MEMBER" / "STAFF" / "ADMIN".
 * @param {string} userId Used to check Program_Leaders assignments.
 * @returns {Array<{key: string, label: string, capability: string}>}
 */
function bootstrapSectionsForRole_(role, userId) {
  var sections = [{ key: "profile", label: "個人資料", capability: "READ" }];
  sections.push({ key: "programs", label: "課程", capability: "READ" });

  var isProgramLeader = programLeadersHasActiveAssignment_(userId);
  var isStaffOrAbove = role === "STAFF" || role === "ADMIN";

  // Ordering matches the issue #67 acceptance criteria:
  //   MEMBER:       profile, programs, events
  //   PL:           profile, programs, events, scanner
  //   STAFF/ADMIN:  profile, programs, scanner, events, care, permissions
  if (isStaffOrAbove) {
    sections.push({ key: "scanner", label: "掃描", capability: "USE" });
  }

  sections.push({ key: "events", label: "聚會", capability: "READ" });

  if (!isStaffOrAbove && isProgramLeader) {
    sections.push({ key: "scanner", label: "掃描", capability: "USE" });
  }

  if (isStaffOrAbove) {
    sections.push({ key: "care", label: "關懷", capability: "READ" });
    sections.push({ key: "permissions", label: "權限管理", capability: "USE" });
  }

  return sections;
}

/**
 * Build the AuthenticatedBootstrap DTO for a known-good user +
 * issued session. Every value is JSON-safe (string / number /
 * object / array) — no Date / Range ever crosses the
 * google.script.run boundary, per the official Apps Script
 * "Parameters and return values" rule.
 *
 * @param {Object} user usersRowToDto_ DTO.
 * @param {{sessionId: string, sessionToken: string,
 *         issuedAt: number}} issued sessionIssue_ return.
 * @returns {AuthenticatedBootstrap}
 */
function bootstrapBuild_(user, issued) {
  return {
    session: {
      userId: user.userId,
      name: user.name,
      role: user.role,
      qrCodeString: user.qrCodeString,
      sessionId: issued.sessionId,
      sessionToken: issued.sessionToken,
    },
    sections: bootstrapSectionsForRole_(user.role, user.userId),
    profile: {
      userId: user.userId,
      name: user.name,
      username: user.username,
      phone: user.phone,
      role: user.role,
      status: user.status,
      qrCodeString: user.qrCodeString,
    },
  };
}

// ---------------------------------------------------------------------------
// Public RPC entry points (no trailing underscore → browser-callable)
// ---------------------------------------------------------------------------

/**
 * api_loginUser — submit credentials, receive AuthenticatedBootstrap.
 *
 * Per ADR-0002: username is case-insensitive, PIN is normalized to
 * 4 digits, ambiguous "username not found" / "PIN wrong" messaging
 * returns the same code/message so a caller cannot enumerate users.
 *
 * Per issue #73: a new per-session HMAC token is issued and stored
 * in PropertiesService on success.
 *
 * @param {string} username
 * @param {string} pin
 * @returns {RpcSuccess<AuthenticatedBootstrap>|RpcFailure}
 */
function api_loginUser(username, pin) {
  var op = "api_loginUser";
  var requestId = rpcRequestId_();
  var t0 = Date.now();
  try {
    var user = usersFindByUsername_(username);
    if (!user) {
      rpcLog_(op, requestId, "AUTH_REQUIRED", Date.now() - t0);
      return rpcFailure_(
        requestId,
        RPC_CODES.AUTH_REQUIRED,
        "使用者名稱或 PIN 碼錯誤"
      );
    }
    // Re-read the current PIN from the Sheet via the repository
    // rather than reading it from the DTO. The DTO intentionally
    // omits pinCode because it is sensitive — the comparison path
    // is the only one that should touch the raw PIN value.
    var sheetPin = usersCurrentPinById_(user.userId);
    var normalizedPin = sessionNormalizePin_(pin);
    if (sheetPin === "" || normalizedPin === "" || sheetPin !== normalizedPin) {
      rpcLog_(op, requestId, "AUTH_REQUIRED", Date.now() - t0);
      return rpcFailure_(
        requestId,
        RPC_CODES.AUTH_REQUIRED,
        "使用者名稱或 PIN 碼錯誤"
      );
    }
    if (String(user.status).toLowerCase() !== "active") {
      // Same code/message as a wrong PIN — no user enumeration.
      return rpcFailure_(
        requestId,
        RPC_CODES.AUTH_REQUIRED,
        "使用者名稱或 PIN 碼錯誤"
      );
    }
    // Bind the HMAC to the authoritative Sheet PIN, not to whatever
    // the user typed, so a normalization mismatch cannot leak
    // through the signature.
    var issued = sessionIssue_(user.userId, sheetPin);
    var dto = bootstrapBuild_(user, issued);
    rpcLog_(op, requestId, "SUCCESS", Date.now() - t0);
    return rpcSuccess_(requestId, dto);
  } catch (e) {
    // Salt missing (or other unconfigured environment) surfaces as
    // UNAVAILABLE per the fail-closed contract. The client renders
    // a generic recoverable error.
    rpcLog_(op, requestId, "UNAVAILABLE", Date.now() - t0);
    return rpcFailure_(
      requestId,
      RPC_CODES.UNAVAILABLE,
      "系統暫時無法處理請求，請稍後再試。"
    );
  }
}

/**
 * api_restoreApp — revalidate a previously-issued session and return
 * the AuthenticatedBootstrap shape. Called on app load when the
 * browser has a stored session in localStorage.
 *
 * Per issue #73 the 3-step verification
 *   (1) PropertiesService entry exists
 *   (2) HMAC matches recomputed-from-current-Sheet-PIN
 *   (3) live Status = Active
 * is enforced on every call. A PIN change or deactivation between
 * sessions surfaces as AUTH_REQUIRED.
 *
 * The existing session entry is preserved on success (we just
 * re-verify) so other concurrent sessions for the same user remain
 * independent, matching #73's multi-device-coexistence design.
 *
 * @param {string} userId
 * @param {string} sessionId
 * @param {string} sessionToken
 * @returns {RpcSuccess<AuthenticatedBootstrap>|RpcFailure}
 */
function api_restoreApp(userId, sessionId, sessionToken) {
  var op = "api_restoreApp";
  var requestId = rpcRequestId_();
  var t0 = Date.now();
  try {
    var verification = sessionVerify_(sessionId, sessionToken);
    if (!verification.ok) {
      rpcLog_(
        op,
        requestId,
        verification.reason || "AUTH_REQUIRED",
        Date.now() - t0
      );
      // Clear the now-stale session entry so subsequent restores do
      // not keep retrying a dead session.
      sessionRevoke_(sessionId);
      return rpcFailure_(
        requestId,
        RPC_CODES.AUTH_REQUIRED,
        "工作階段已過期，請重新登入"
      );
    }
    if (verification.userId !== userId) {
      // Mismatched userId on a valid signature — treat as auth
      // failure rather than authority confusion.
      rpcLog_(op, requestId, "AUTH_REQUIRED", Date.now() - t0);
      sessionRevoke_(sessionId);
      return rpcFailure_(
        requestId,
        RPC_CODES.AUTH_REQUIRED,
        "工作階段已過期，請重新登入"
      );
    }
    var user = usersFindById_(verification.userId);
    if (!user || user.status !== "Active") {
      rpcLog_(op, requestId, "FORBIDDEN", Date.now() - t0);
      sessionRevoke_(sessionId);
      return rpcFailure_(
        requestId,
        RPC_CODES.AUTH_REQUIRED,
        "工作階段已過期，請重新登入"
      );
    }
    // Re-verify passed; return the existing session in the DTO so
    // the caller keeps a still-valid token. The user may have
    // multiple concurrent sessions, so do NOT revoke this one.
    var stored = sessionLookup_(sessionId);
    var dto = bootstrapBuild_(user, {
      sessionId: sessionId,
      sessionToken: sessionToken,
      issuedAt: stored ? stored.issuedAt : 0,
    });
    rpcLog_(op, requestId, "SUCCESS", Date.now() - t0);
    return rpcSuccess_(requestId, dto);
  } catch (e) {
    rpcLog_(op, requestId, "UNAVAILABLE", Date.now() - t0);
    return rpcFailure_(
      requestId,
      RPC_CODES.UNAVAILABLE,
      "系統暫時無法處理請求，請稍後再試。"
    );
  }
}

/**
 * api_logoutUser — delete the calling session. Other sessions for
 * the same user are unaffected (per-session keying per #73).
 *
 * Idempotent: logging out an already-revoked session returns a
 * success envelope so the client can clear local state without
 * surfacing a user-visible error.
 *
 * @param {string} userId
 * @param {string} sessionId
 * @param {string} sessionToken
 * @returns {RpcSuccess<{}>|RpcFailure}
 */
function api_logoutUser(userId, sessionId, sessionToken) {
  var op = "api_logoutUser";
  var requestId = rpcRequestId_();
  var t0 = Date.now();
  try {
    var verification = sessionVerify_(sessionId, sessionToken);
    if (verification.ok && verification.userId === userId) {
      sessionRevoke_(sessionId);
      rpcLog_(op, requestId, "SUCCESS", Date.now() - t0);
      return rpcSuccess_(requestId, {});
    }
    // Unknown / mismatched session — still return success so the
    // client can clean up. Surface the failure only in the log.
    sessionRevoke_(sessionId);
    rpcLog_(op, requestId, "AUTH_REQUIRED", Date.now() - t0);
    return rpcSuccess_(requestId, {});
  } catch (e) {
    rpcLog_(op, requestId, "UNAVAILABLE", Date.now() - t0);
    return rpcFailure_(
      requestId,
      RPC_CODES.UNAVAILABLE,
      "系統暫時無法處理請求，請稍後再試。"
    );
  }
}
