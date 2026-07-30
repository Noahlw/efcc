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
    .addMetaTag(
      "viewport",
      "width=device-width, initial-scale=1, maximum-scale=1"
    )
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
 * @property {Array<{key: string, label: string, capability: string,
 *            requiresServerAuth: boolean}>} sections
 *   Server-authorized Sections the client may render. The first entry
 *   is the initial route (Profile for every authenticated role in
 *   Day 1 per ADR-0010 / spec 009). requiresServerAuth is true for
 *   guarded sections (scanner, care, permissions) - the client must
 *   call api_authorizedNavigate before rendering those.
 * @property {{userId: string, name: string, username: string,
 *           phone: string, role: string, status: string,
 *           qrCodeString: string}} profile
 *   Initial Profile data per issue #66. Distinct from the session
 *   block so future Profile fields can evolve without changing the
 *   session shape.
 */

/**
 * Stable server-side Section key constants. Used by
 * bootstrapSectionsForRole_ and intended to be reused by any
 * future server-side RPC (e.g. api_getPrograms, api_getEvents)
 * that re-checks section authorization. Matches the client-side
 * SECTION_KEYS in shell-session.js.html by convention — the two
 * files live in different execution contexts (server vs browser
 * IIFE) and cannot share a binding, so the strings are duplicated
 * intentionally. Drift between the two is caught by the role-
 * matrix tests in tests/gas/role-navigation.test.js.
 */
var SECTION_KEYS = Object.freeze({
  PROFILE: "profile", // AC #2 / #3 / #4 / #5
  PROGRAMS: "programs", // AC #2 / #3 / #4 / #5
  EVENTS: "events", // AC #2 / #3 / #4 / #5
  SCANNER: "scanner", // AC #3 (PL) / #4 (STAFF/ADMIN)
  CARE: "care", // AC #4 (STAFF/ADMIN)
  PERMISSIONS: "permissions", // AC #4 (STAFF/ADMIN)
});

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
  var sections = [
    { key: SECTION_KEYS.PROFILE, label: "個人資料", capability: "READ", requiresServerAuth: false },
  ];
  sections.push({
    key: SECTION_KEYS.PROGRAMS,
    label: "課程",
    capability: "READ",
    requiresServerAuth: false,
  });

  var isProgramLeader = programLeadersHasActiveAssignment_(userId);
  var isStaffOrAbove = role === "STAFF" || role === "ADMIN";

  // Ordering matches the issue #67 acceptance criteria:
  //   MEMBER:       profile, programs, events
  //   PL:           profile, programs, events, scanner
  //   STAFF/ADMIN:  profile, programs, scanner, events, care, permissions
  if (isStaffOrAbove) {
    sections.push({
      key: SECTION_KEYS.SCANNER,
      label: "掃描",
      capability: "USE",
      requiresServerAuth: true,
    });
  }

  sections.push({
    key: SECTION_KEYS.EVENTS,
    label: "聚會",
    capability: "READ",
    requiresServerAuth: false,
  });

  if (!isStaffOrAbove && isProgramLeader) {
    sections.push({
      key: SECTION_KEYS.SCANNER,
      label: "掃描",
      capability: "USE",
      requiresServerAuth: true,
    });
  }

  if (isStaffOrAbove) {
    sections.push({
      key: SECTION_KEYS.CARE,
      label: "關懷",
      capability: "READ",
      requiresServerAuth: true,
    });
    sections.push({
      key: SECTION_KEYS.PERMISSIONS,
      label: "權限管理",
      capability: "USE",
      requiresServerAuth: true,
    });
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
      rpcLog_(op, requestId, "FORBIDDEN", Date.now() - t0);
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
    console.error(e);
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
    console.error(e);
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
    console.error(e);
    rpcLog_(op, requestId, "UNAVAILABLE", Date.now() - t0);
    return rpcFailure_(
      requestId,
      RPC_CODES.UNAVAILABLE,
      "系統暫時無法處理請求，請稍後再試。"
    );
  }
}

/**
 * api_getPrograms — read-only Programs list for the Programs Section
 * (issue #69, prerequisite slice of #53).
 *
 * Reuses the same authenticated boundary as api_restoreApp: a bare
 * userId parameter could be forged from the browser, so every call
 * re-verifies (sessionId, sessionToken) via sessionVerify_ and
 * rechecks the live Users Sheet status. Available to every active
 * authenticated role per issue #64's navigation matrix — Programs is
 * visible to MEMBER, Program Leader, STAFF, and ADMIN.
 *
 * Scope note: this RPC does NOT read Enrollments and does NOT
 * compute isEnrolled. That is issue #53's scope (self-service and
 * assisted enrollment). Building it here would duplicate #53's
 * ticket — see docs/specs/069-async-recovery-acceptance-plan.md.
 *
 * Unexpected exceptions here deliberately return RPC_CODES.
 * INTERNAL_ERROR rather than UNAVAILABLE (unlike the other three
 * RPCs in this file) — the user's explicit choice during the
 * grilling session for this ticket; see the acceptance plan for the
 * rationale record.
 *
 * SECURITY NOTE (deliberate divergence from api_restoreApp): a
 * mismatched userId parameter against an otherwise-VALID
 * (sessionId, sessionToken) pair does NOT revoke the session here.
 * sessionId is not secret (it travels alongside the token, and a
 * client-side bug or a stale multi-tab race could pair the wrong
 * userId with a real token); revoking on mismatch would let anyone
 * who merely observes a sessionId force-log-out a legitimate,
 * unrelated session — a denial-of-service surface issue #73's
 * multi-session design does not accept. api_restoreApp has the same
 * revoke-on-mismatch pattern today; that is flagged here as a
 * follow-up hardening candidate, not fixed retroactively in this
 * branch since #66/#73 are already shipped and out of scope for #69.
 *
 * @param {string} userId
 * @param {string} sessionId
 * @param {string} sessionToken
 * @returns {RpcSuccess<Array<{id: string, name: string, type: string, description: string}>>|RpcFailure}
 */
function api_getPrograms(userId, sessionId, sessionToken) {
  var op = "api_getPrograms";
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
      sessionRevoke_(sessionId);
      return rpcFailure_(
        requestId,
        RPC_CODES.AUTH_REQUIRED,
        "工作階段已過期，請重新登入"
      );
    }
    if (verification.userId !== userId) {
      // Mismatched userId parameter on an otherwise-VALID session —
      // fail the request WITHOUT revoking the session (see the
      // SECURITY NOTE above). This deliberately does not match
      // api_restoreApp's current revoke-on-mismatch behavior.
      rpcLog_(op, requestId, "AUTH_REQUIRED", Date.now() - t0);
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
    var programs = programsList_();
    rpcLog_(op, requestId, "SUCCESS", Date.now() - t0);
    return rpcSuccess_(requestId, programs);
  } catch (e) {
    console.error(e);
    rpcLog_(op, requestId, "INTERNAL_ERROR", Date.now() - t0);
    return rpcFailure_(
      requestId,
      RPC_CODES.INTERNAL_ERROR,
      "系統發生錯誤，請稍後再試。"
    );
  }
}

/**
 * api_authorizedNavigate - server-authorized Section-entry RPC (issue #69 AC #7).
 *
 * Verifies the session and checks whether the user is authorized to
 * access the requested section. Returns FORBIDDEN for unauthorized
 * sections, enabling real deployed forbidden-recovery testing.
 *
 * Tiered auth model (CEO review): this RPC is called by the client
 * ONLY for security-guarded sections (scanner, care, permissions)
 * where requiresServerAuth === true. Member-accessible sections
 * (profile, programs, events) use client-side check only.
 *
 * @param {string} userId
 * @param {string} sessionId
 * @param {string} sessionToken
 * @param {string} sectionKey
 * @returns {RpcSuccess<{authorized: boolean}>|RpcFailure}
 */
function api_authorizedNavigate(userId, sessionId, sessionToken, sectionKey) {
  var op = "api_authorizedNavigate";
  var requestId = rpcRequestId_();
  var t0 = Date.now();
  try {
    var verification = sessionVerify_(sessionId, sessionToken);
    if (!verification.ok) {
      rpcLog_(op, requestId, verification.reason || "AUTH_REQUIRED", Date.now() - t0);
      sessionRevoke_(sessionId);
      return rpcFailure_(
        requestId,
        RPC_CODES.AUTH_REQUIRED,
        "工作階段已過期，請重新登入"
      );
    }
    if (verification.userId !== userId) {
      rpcLog_(op, requestId, "AUTH_REQUIRED", Date.now() - t0);
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
    var sections = bootstrapSectionsForRole_(user.role, userId);
    var authorized = false;
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].key === sectionKey) {
        authorized = true;
        break;
      }
    }
    if (!authorized) {
      rpcLog_(op, requestId, "FORBIDDEN", Date.now() - t0);
      return rpcFailure_(
        requestId,
        RPC_CODES.FORBIDDEN,
        "你沒有權限使用此功能（" + sectionKey + "）"
      );
    }
    rpcLog_(op, requestId, "SUCCESS", Date.now() - t0);
    return rpcSuccess_(requestId, { authorized: true });
  } catch (e) {
    console.error(e);
    rpcLog_(op, requestId, "INTERNAL_ERROR", Date.now() - t0);
    return rpcFailure_(
      requestId,
      RPC_CODES.INTERNAL_ERROR,
      "系統發生錯誤，請稍後再試。"
    );
  }
}

/**
 * api_submitDemoTaskForm — demo form submission with idempotency
 * protection (issue #70 / #64).
 *
 * Demonstrates the client-to-server data flow for form-protection
 * patterns. Uses CacheService for duplicate-submit detection; no
 * Sheet read or write occurs — this is a pure in-memory/CacheService
 * demonstration RPC.
 *
 * Auth boundary matches api_getPrograms exactly: re-verify the
 * session, reject a mismatched userId without revoking the session
 * (see api_getPrograms's SECURITY NOTE), reject inactive users.
 * Validation runs after the auth boundary (auth failures take
 * precedence).
 *
 * @param {string} userId
 * @param {string} sessionId
 * @param {string} sessionToken
 * @param {string} requestKey Client-generated idempotency key.
 * @param {string} fieldValue Raw demo form field string value.
 * @returns {RpcSuccess<{echoedValue: string, submittedAt: string, idempotent: boolean}>|RpcFailure}
 */
function api_submitDemoTaskForm(
  userId,
  sessionId,
  sessionToken,
  requestKey,
  fieldValue
) {
  var op = "api_submitDemoTaskForm";
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
      sessionRevoke_(sessionId);
      return rpcFailure_(
        requestId,
        RPC_CODES.AUTH_REQUIRED,
        "工作階段已過期，請重新登入"
      );
    }
    if (verification.userId !== userId) {
      // Mismatched userId parameter on an otherwise-VALID session —
      // fail the request WITHOUT revoking the session (matching
      // api_getPrograms's SECURITY NOTE pattern).
      rpcLog_(op, requestId, "AUTH_REQUIRED", Date.now() - t0);
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
    // Validation — runs after auth boundary per the contract (auth
    // failures take precedence).
    var trimmed = String(fieldValue || "").trim();
    if (trimmed === "" || trimmed.length > 200) {
      rpcLog_(op, requestId, "VALIDATION", Date.now() - t0);
      return rpcFailure_(
        requestId,
        RPC_CODES.VALIDATION,
        "請輸入範例欄位內容（1–200 字元）。"
      );
    }
    // Idempotency check - CacheService fast path, then LockService +
    // Script Properties authoritative store (D16, CEO review Issue 8.1).
    var cacheKey = "demoform_" + requestKey;
    var spKey = "demoform_" + requestKey;
    var cache = CacheService.getScriptCache();
    var cached = cache.get(cacheKey);

    // Fast path: CacheService hit (skip lock).
    if (cached) {
      try {
        var parsed = JSON.parse(cached);
        parsed.idempotent = true;
        rpcLog_(op, requestId, "SUCCESS", Date.now() - t0);
        return rpcSuccess_(requestId, parsed);
      } catch (e) {
        // Corrupt cache entry - fall through to authoritative store.
      }
    }

    // Authoritative path: LockService + Script Properties.
    // Doc evidence: Context7 /websites/developers_google_apps-script:
    //   LockService.getScriptLock().waitLock(30000) acquires a script lock;
    //   PropertiesService.getScriptProperties() provides persistent key/value storage;
    //   CacheService cached data is not guaranteed to remain until expiration.
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var sp = PropertiesService.getScriptProperties();
      var existing = sp.getProperty(cacheKey);
      if (existing) {
        try {
          var existingData = JSON.parse(existing);
          if (existingData.timestamp && Date.now() - existingData.timestamp < 60000) {
            existingData.idempotent = true;
            rpcLog_(op, requestId, "SUCCESS", Date.now() - t0);
            return rpcSuccess_(requestId, existingData);
          }
        } catch (e) {
          // Corrupt property - fall through to process as fresh.
        }
      }

      // First successful submission for this requestKey.
      var data = {
        echoedValue: trimmed,
        submittedAt: Utilities.formatDate(
          new Date(),
          "Asia/Hong_Kong",
          "yyyy-MM-dd HH:mm:ss"
        ),
        idempotent: false,
        timestamp: Date.now(),
      };

      // Store in Script Properties (authoritative).
      try {
        sp.setProperty(cacheKey, JSON.stringify(data));
      } catch (e) {
        // Property store failure is non-fatal.
      }

      // Also store in CacheService (fast path for next call).
      try {
        cache.put(cacheKey, JSON.stringify(data), 60);
      } catch (e) {
        // Cache-put failure (e.g. size limit) is non-fatal.
      }

      // Cleanup: remove expired demoform_* entries from Script Properties.
      try {
        var allKeys = sp.getKeys();
        for (var ki = 0; ki < allKeys.length; ki++) {
          if (allKeys[ki].indexOf("demoform_") === 0) {
            try {
              var entry = JSON.parse(sp.getProperty(allKeys[ki]));
              if (!entry.timestamp || Date.now() - entry.timestamp >= 60000) {
                sp.deleteProperty(allKeys[ki]);
              }
            } catch (e) {
              sp.deleteProperty(allKeys[ki]);
            }
          }
        }
      } catch (e) {
        // Cleanup failure is non-fatal.
      }

      rpcLog_(op, requestId, "SUCCESS", Date.now() - t0);
      return rpcSuccess_(requestId, data);
    } finally {
      lock.releaseLock();
    }
  } catch (e) {
    console.error(e);
    rpcLog_(op, requestId, "INTERNAL_ERROR", Date.now() - t0);
    return rpcFailure_(
      requestId,
      RPC_CODES.INTERNAL_ERROR,
      "系統發生錯誤，請稍後再試。"
    );
  }
}

/**
 * diagSetupScriptProperties — one-time setup for standalone Apps Script
 * projects. Runs from the Apps Script editor (select function, click Run,
 * authorize when prompted). Sets the two Script Properties required by
 * the login and session RPCs:
 *
 *   EFCC_SPREADSHEET_ID — the Google Sheet backing the application
 *   EFCC_SESSION_SALT   — a random hex string for HMAC session signatures
 *
 * Idempotent: skips properties that are already set (non-empty).
 * Logs each action so the operator can verify the result in Executions.
 *
 * Apps Script APIs used (per AGENTS.md docs-backed method rule):
 *   - PropertiesService.getScriptProperties().setProperty(key, value):
 *     https://developers.google.com/apps-script/reference/properties/properties-service
 *   - Utilities.getUuid():
 *     https://developers.google.com/apps-script/reference/utilities/utilities#getUuid()
 */
function diagSetupScriptProperties() {
  var props = PropertiesService.getScriptProperties();

  var existingSheetId = props.getProperty("EFCC_SPREADSHEET_ID");
  if (!existingSheetId || existingSheetId.trim() === "") {
    props.setProperty(
      "EFCC_SPREADSHEET_ID",
      "1ISBjcQmsWrvrt93gxbShyvAax2uMgYkrhbNJiYSCHdw"
    );
    console.log("EFCC_SPREADSHEET_ID set.");
  } else {
    console.log("EFCC_SPREADSHEET_ID already set (skipped).");
  }

  var existingSalt = props.getProperty("EFCC_SESSION_SALT");
  if (!existingSalt || existingSalt.trim() === "") {
    var salt = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty("EFCC_SESSION_SALT", salt);
    console.log("EFCC_SESSION_SALT set.");
  } else {
    console.log("EFCC_SESSION_SALT already set (skipped).");
  }

  console.log("diagSetupScriptProperties complete.");
}

/**
 * diagSheetStructure_ — read every sheet tab's header row from the
 * configured spreadsheet. Returns a JSON-safe object mapping sheet
 * name → { header: [...], rowCount: number }. Intended for one-time
 * diagnostics via ?diag=sheet-structure on doGet().
 *
 * Apps Script APIs used:
 *   - SpreadsheetApp.openById / Sheet.getSheetName / getDataRange / getValues
 */
function diagSheetStructure_() {
  var ss = efccSpreadsheet_();
  var sheets = ss.getSheets();
  var result = {};
  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var name = sheet.getSheetName();
    var data = sheet.getDataRange().getValues();
    result[name] = {
      header: data.length > 0 ? data[0] : [],
      rowCount: data.length,
    };
  }
  return result;
}
