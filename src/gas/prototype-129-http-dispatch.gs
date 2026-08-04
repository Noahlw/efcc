/**
 * PROTOTYPE (issue #129 / #142) - THROWAWAY HTTP dispatch, isolated
 * versioned deployment only. Do NOT wire into the production deployment.
 *
 * CF1-01 (#151): the Worker now sends a signed service envelope. This
 * dispatcher verifies the envelope before invoking the existing api_*
 * functions. The envelope carries the browser's action, params, sessionId,
 * and authorization; the dispatcher projects the action and passes the
 * verified fields to the api_* functions.
 *
 * Proves the round trip question: can the Cloudflare proxy reach one
 * authenticated Apps Script endpoint over POST /exec, restore a session,
 * and get a structured recoverable error back? Reuses the existing,
 * already-tested api_loginUser / api_restoreApp / api_logoutUser /
 * api_authorizedNavigate functions UNCHANGED - this file adds a
 * dispatcher only, no new business logic.
 *
 * doGet() (src/gas/Code.gs) is untouched. Per the official Apps Script
 * web app docs (developers.google.com/apps-script/guides/web), doGet
 * and doPost are independent, HTTP-method-routed hooks in the same
 * script project - this file cannot affect the existing HtmlService
 * app's doGet-served behavior.
 *
 * Does NOT implement the full RPC_CODES status-code table's tag: URI
 * type/instance fields - this dispatcher returns a minimal problem-shaped
 * JSON body (status/code/title/detail/requestId) just precise enough for
 * the prototype's Next.js client to parse. #131 owns the full RFC 9457
 * serialization.
 *
 * Pointer: https://github.com/Noahlw/efcc/issues/129
 *           https://github.com/Noahlw/efcc/issues/142
 *           https://github.com/Noahlw/efcc/issues/151 (CF1-01)
 * Delete this file once #131 lands the real HTTP dispatch decision.
 */

var PROTOTYPE_129_ACTIONS_ = {
  loginUser: function (params) {
    return api_loginUser(params.username, params.pin);
  },
  restoreApp: function (params, sessionId, authorization) {
    // CF1-01: session authority comes from the verified envelope, not
    // body params. The sessionToken is extracted from the Authorization
    // header (Bearer <token>) carried inside the envelope; the sessionId
    // and userId come from the verified request.
    return api_restoreApp(
      params.userId,
      sessionId,
      prototype129Bearer_(authorization)
    );
  },
  logoutUser: function (params, sessionId, authorization) {
    return api_logoutUser(
      params.userId,
      sessionId,
      prototype129Bearer_(authorization)
    );
  },
  authorizedNavigate: function (params, sessionId, authorization) {
    return api_authorizedNavigate(
      params.userId,
      sessionId,
      prototype129Bearer_(authorization),
      params.sectionKey
    );
  },
};

/**
 * Extract the session token from a "Bearer <token>" Authorization value.
 * Returns "" when absent or malformed. Shared by the authenticated
 * handlers so the extraction logic lives in one place.
 *
 * @param {string|null} authorization
 * @returns {string}
 */
function prototype129Bearer_(authorization) {
  if (
    typeof authorization === "string" &&
    authorization.indexOf("Bearer ") === 0
  ) {
    return authorization.slice("Bearer ".length);
  }
  return "";
}

function prototype129Json_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function prototype129Problem_(status, code, detail) {
  return {
    status: status,
    code: code,
    title: code,
    detail: detail,
    requestId: Utilities.getUuid(),
  };
}

/**
 * Parse only the object shape accepted by the signed service-envelope
 * verifier. Missing event data, invalid JSON, and non-object JSON all
 * return null so doPost can reject them with the same opaque FORBIDDEN
 * problem instead of leaking parser details or entering unsigned dispatch.
 *
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {Object|null}
 */
function prototype129ParseBody_(e) {
  if (
    !e ||
    !e.postData ||
    typeof e.postData.contents !== "string" ||
    e.postData.contents.trim() === ""
  ) {
    return null;
  }

  try {
    var body = JSON.parse(e.postData.contents);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return null;
    }
    return body;
  } catch (err) {
    return null;
  }
}

/**
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  // CF1-01 (#151): reject malformed or unsigned input before any action
  // dispatch. There is no fallback to the unsigned pre-CF1 body.params path.
  var body = prototype129ParseBody_(e);
  if (!body) {
    return prototype129Json_(
      prototype129Problem_(403, "FORBIDDEN", "無效的服務請求。")
    );
  }

  // A verifier exception is treated exactly like a failed verification:
  // malformed envelopes never become a generic 500 or reach an api_* action.
  var verified = null;
  try {
    verified = serviceVerifyEnvelope_(body);
  } catch (err) {
    verified = null;
  }
  if (!verified) {
    return prototype129Json_(
      prototype129Problem_(403, "FORBIDDEN", "無效的服務請求。")
    );
  }

  try {
    var action = verified.action;
    var params = verified.params || {};
    var sessionId = verified.sessionId;
    var authorization = verified.authorization;
    var handler = Object.prototype.hasOwnProperty.call(
      PROTOTYPE_129_ACTIONS_,
      action
    )
      ? PROTOTYPE_129_ACTIONS_[action]
      : null;

    if (!handler) {
      return prototype129Json_({
        status: 404,
        code: "UNKNOWN_ACTION",
        title: "UNKNOWN_ACTION",
        detail: "No such action: " + action,
        requestId: Utilities.getUuid(),
      });
    }

    var envelope = handler(params, sessionId, authorization);
    if (envelope.success) {
      return prototype129Json_(envelope);
    }

    var status = prototype129StatusForCode_(envelope.error.code);
    return prototype129Json_({
      status: status,
      code: envelope.error.code,
      title: envelope.error.code,
      detail: envelope.error.message,
      requestId: envelope.requestId,
    });
  } catch (err) {
    // Never expose an exception or stack to the client.
    Logger.log(
      "prototype-129 doPost error: " + (err && err.stack ? err.stack : err)
    );
    return prototype129Json_(
      prototype129Problem_(500, "INTERNAL_ERROR", "伺服器處理時發生錯誤。")
    );
  }
}

/**
 * @param {string} code
 * @returns {number}
 */
function prototype129StatusForCode_(code) {
  switch (code) {
    case "AUTH_REQUIRED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "VALIDATION":
      return 422;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    case "UNAVAILABLE":
      return 503;
    default:
      return 500;
  }
}
