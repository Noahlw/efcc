/**
 * PROTOTYPE (issue #129 / #142) - THROWAWAY HTTP dispatch, isolated
 * versioned deployment only. Do NOT wire into the production deployment.
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
 * #142 extends this throwaway to cover the shell's four smoke-path
 * actions (login, restore, logout, guarded navigation) so CF0's typed
 * client + Worker can be exercised end-to-end against real infrastructure
 * before #131 ships the production dispatcher. The production dispatcher
 * will derive userId from the header-borne sessionId via sessionLookup_
 * (Apps Script doPost cannot read request headers - verified against
 * developers.google.com/apps-script/guides/web); this interim keeps
 * reading session fields from body.params for that reason. Both sides
 * implement the same ADR-0018 contract, so the swap is backend-only.
 *
 * Does NOT implement the full RPC_CODES status-code table's tag: URI
 * type/instance fields - this dispatcher returns a minimal problem-shaped
 * JSON body (status/code/title/detail/requestId) just precise enough for
 * the prototype's Next.js client to parse. #131 owns the full RFC 9457
 * serialization.
 *
 * Pointer: https://github.com/Noahlw/efcc/issues/129
 *           https://github.com/Noahlw/efcc/issues/142
 * Delete this file once #131 lands the real HTTP dispatch decision.
 */

var PROTOTYPE_129_ACTIONS_ = {
  loginUser: function (params) {
    return api_loginUser(params.username, params.pin);
  },
  restoreApp: function (params) {
    return api_restoreApp(params.userId, params.sessionId, params.sessionToken);
  },
  // #142: logout + guarded navigation for the shell smoke path. Both
  // delegate to existing, already-tested api_* functions unchanged.
  logoutUser: function (params) {
    return api_logoutUser(params.userId, params.sessionId, params.sessionToken);
  },
  authorizedNavigate: function (params) {
    return api_authorizedNavigate(
      params.userId,
      params.sessionId,
      params.sessionToken,
      params.sectionKey
    );
  },
};

/**
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  var status = 200;
  var responseBody;

  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;
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
      var envelope = handler(body.params || {});
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
