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
  if (typeof authorization === "string" && authorization.indexOf("Bearer ") === 0) {
    return authorization.slice("Bearer ".length);
  }
  return "";
}

/**
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  var status = 200;
  var responseBody;

  try {
    var body = JSON.parse(e.postData.contents);

    // CF1-01 (#151): the Worker sends a signed service envelope. The
    // dispatcher verifies it and dispatches strictly on the verified
    // action. Fail closed: an invalid or missing envelope is rejected
    // with FORBIDDEN — there is no fallback to the unsigned pre-CF1
    // body.params path, lest a forged request bypass the signature gate.
    var verified = serviceVerifyEnvelope_(body);
    if (!verified) {
      status = 403;
      responseBody = {
        status: status,
        code: "FORBIDDEN",
        title: "FORBIDDEN",
        detail: "無效的服務請求。",
        requestId: Utilities.getUuid(),
      };
      return ContentService.createTextOutput(
        JSON.stringify(responseBody)
      ).setMimeType(ContentService.MimeType.JSON);
    }

    var action = verified.action;
    var params = verified.params || {};
    var sessionId = verified.sessionId;
    var authorization = verified.authorization;

    var handler = PROTOTYPE_129_ACTIONS_[action];

    if (!handler) {
      status = 404;
      responseBody = {
        status: status,
        code: "UNKNOWN_ACTION",
        title: "UNKNOWN_ACTION",
        detail: "No such action: " + action,
      };
    } else {
      var envelope = handler(params, sessionId, authorization);
      if (envelope.success) {
        responseBody = envelope;
      } else {
        status = prototype129StatusForCode_(envelope.error.code);
        responseBody = {
          status: status,
          code: envelope.error.code,
          title: envelope.error.code,
          detail: envelope.error.message,
          requestId: envelope.requestId,
        };
      }
    }
  } catch (err) {
    // ADR-0018-style fail-closed: log the raw error for operators but
    // never expose err.message or stack to the client. The shape below
    // is the throwaway's success/failure envelope (`success`/`error`)
    // so the prototype client can parse it like any other handler
    // failure; the Worker proxy already maps this to outer HTTP 500.
    Logger.log(
      "prototype-129 doPost error: " + (err && err.stack ? err.stack : err)
    );
    status = 500;
    responseBody = {
      status: 500,
      code: "INTERNAL_ERROR",
      title: "Internal Server Error",
      detail: "伺服器處理時發生錯誤。",
      requestId: Utilities.getUuid(),
    };
  }

  // Apps Script's TextOutput has no setStatusCode API - the HTTP status
  // for a doPost web-app response is always 200 at the transport level;
  // the real status lives in the JSON body's `status` field. The
  // Worker proxy in this prototype passes the Apps Script response
  // straight through (it does not currently re-map this to an HTTP
  // status), so the Next.js client checks `body.status`/`body.code`,
  // not `response.status`, for this throwaway. #131/#128 must decide
  // how the real proxy performs this status remap (likely: proxy reads
  // the JSON body and sets the outer HTTP status itself before
  // returning to the browser).
  return ContentService.createTextOutput(
    JSON.stringify(responseBody)
  ).setMimeType(ContentService.MimeType.JSON);
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
