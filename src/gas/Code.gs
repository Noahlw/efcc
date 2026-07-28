// =============================================================================
// Code.gs — Web App Entry Point & Shared Infrastructure
// Ported from 程式碼.js: doGet, normalize utilities, session infrastructure.
// All .gs files in this project share a single global scope per GAS runtime.
// =============================================================================

// --- Shared constants --------------------------------------------------------

var PROGRAMS_CACHE_KEY_ = "programs_catalog_v2";
var PROGRAMS_CACHE_TTL_SEC_ = 300;
var SESSION_TTL_MS_ = 30 * 24 * 60 * 60 * 1000; // 30-day rolling session
var DEFAULT_DEV_SALT_ = "static-dev-salt-change-me";

// --- Web App Routing (ADR-0008 T00: SPA shell, no query-string routing) -----

/**
 * doGet(e) — ADR-0008 lock: always returns login.html. No query-string
 * routing. Auth gating is done client-side (post-login) — server has no idea
 * what page the user is on, only which HTML fragment to bootstrap with.
 *
 * NOTE for T01 (issue://42): `login.html` is not added by this ticket (T00).
 * Deploying this entry before T01 lands will error at template-eval time.
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile("login")
    .evaluate()
    .setTitle("EFCC 顯恩堂")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// --- Template Include --------------------------------------------------------

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// --- Fragment Loader (ADR-0008 T00) ------------------------------------------

/**
 * Single source of truth for which client-side navigation targets are valid.
 * loadPage() refuses any name not on this list, so a client (or a buggy
 * caller) cannot coerce the server into reading arbitrary .html files.
 */
var SPA_FRAGMENT_ALLOWLIST_ = Object.freeze([
  "profile",
  "programs",
  "events",
  "scanner",
  "dashboard",
  "care",
]);

/**
 * loadPage(name) — returns the rendered HTML string of a fragment.
 * Validates `name` against SPA_FRAGMENT_ALLOWLIST_ before touching
 * HtmlService; throws for any unlisted name rather than silently
 * falling through to a 404 or an arbitrary file read.
 */
function loadPage(name) {
  var key = String(name == null ? "" : name).trim().toLowerCase();
  if (SPA_FRAGMENT_ALLOWLIST_.indexOf(key) === -1) {
    throw new Error(
      'loadPage: unknown fragment "' + name + '". ' +
      "Allowed: " + SPA_FRAGMENT_ALLOWLIST_.join(", ") + "."
    );
  }
  return HtmlService.createTemplateFromFile(key).evaluate().getContent();
}

// --- Normalisation Utilities ------------------------------------------------

function normalizeHeader_(h) {
  return String(h)
    .trim()
    .toLowerCase()
    .replaceAll(/[\s_]+/g, "");
}

function findHeaderIndex_(headers, names) {
  var normalized = headers.map(normalizeHeader_);
  for (var n = 0; n < names.length; n++) {
    var idx = normalized.indexOf(normalizeHeader_(names[n]));
    if (idx !== -1) return idx;
  }
  return -1;
}

function normalizeId_(value) {
  if (value === null || value === undefined) return "";
  if (
    Object.prototype.toString.call(value) === "[object Date]" &&
    !isNaN(value.getTime())
  ) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd"
    );
  }
  if (typeof value === "number" && isFinite(value)) {
    return String(Math.round(value));
  }
  return String(value).trim();
}

function isActiveStatus_(raw) {
  var s = String(raw == null ? "" : raw)
    .trim()
    .toLowerCase();
  return !s || s === "active";
}

// --- Session Infrastructure -------------------------------------------------

function getSessionSalt_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var stored = props.getProperty("EFCC_SESSION_SALT");
    if (stored) return stored;
  } catch (_) {}
  return DEFAULT_DEV_SALT_;
}

function sha256Hmac_(input) {
  var raw = String(input == null ? "" : input);
  var digest = Utilities.computeHmacSha256Signature(raw, getSessionSalt_());
  var bytes = [];
  for (var i = 0; i < digest.length; i++) {
    var hex = (digest[i] & 0xff).toString(16);
    if (hex.length === 1) hex = "0" + hex;
    bytes.push(hex);
  }
  return bytes.join("");
}

function getSessionIssuedAt_(userId) {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty("session_issued_" + normalizeId_(userId));
  return raw ? Number(raw) : 0;
}

function setSessionIssuedNow_(userId) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty(
    "session_issued_" + normalizeId_(userId),
    String(Date.now())
  );
}

function clearSessionIssued_(userId) {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty("session_issued_" + normalizeId_(userId));
}

function isSessionActiveForUser_(userId) {
  var issuedAt = getSessionIssuedAt_(userId);
  if (!issuedAt) return false;
  return Date.now() - issuedAt <= SESSION_TTL_MS_;
}

// --- Program Catalog & Enrollment Helpers -----------------------------------
