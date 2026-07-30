/**
 * EFCC 顯恩堂 — Programs sheet repository. READ-ONLY.
 *
 * Scope note (issue #69, prerequisite slice of #53): this repository
 * returns only { id, name, type, description } from the Programs
 * sheet. It does NOT read Enrollments and does NOT compute
 * isEnrolled — that is issue #53's scope (self-service and assisted
 * enrollment), which owns writes, per-Program-Leader authorization,
 * a caller-owned lock, and audit logging. Building any of that here
 * would duplicate #53's ticket. See
 * docs/specs/069-async-recovery-acceptance-plan.md for the full
 * grilled scope decision.
 *
 * Column model per docs/specs/004-programs-catalog.md §2/§5:
 *   Program_ID | Program_Name | Type | Description
 * Column order is not fixed — resolved by header-name matching so
 * extra columns (Location, Leader, Max Capacity, ...) do not break
 * parsing; they are simply ignored.
 *
 * Caching per spec 004 §3: CacheService.getScriptCache(), key
 * "programs_catalog_v1", TTL 300 seconds. The cache is shared across
 * all users (script-scoped) because this slice carries no per-user
 * field. A corrupt cache entry falls back to a fresh Sheet read
 * rather than throwing, per the official CacheService contract:
 * "You must be prepared to get back null from all reads."
 *
 * Sheet access is opened by ID via efccSpreadsheet_()
 * (spreadsheet-access.gs / ADR-0015), not
 * SpreadsheetApp.getActiveSpreadsheet() — this script is standalone,
 * not bound to the spreadsheet.
 *
 * Apps Script APIs used (per AGENTS.md docs-backed method rule):
 *   - Sheet.getDataRange().getValues():
 *     https://developers.google.com/apps-script/reference/spreadsheet/sheet#getDataRange()
 *   - CacheService.getScriptCache():
 *     https://developers.google.com/apps-script/reference/cache/cache-service#getScriptCache()
 *     ("Gets the cache instance scoped to the script. Script caches
 *     are common to all users of the script.")
 *   - Cache.get(key) / Cache.put(key, value, expirationInSeconds):
 *     https://developers.google.com/apps-script/reference/cache/cache
 */

var PROGRAMS_SHEET_NAME = "Programs";
var PROGRAMS_CACHE_KEY_ = "programs_catalog_v1";
var PROGRAMS_CACHE_TTL_SEC_ = 300;

// In-memory guard so a single script execution does not hit
// CacheService twice for the same request chain. Reset between
// Vitest test cases via programsResetForTesting_(); in a real Apps
// Script execution this is naturally scoped to one invocation.
var PROGRAMS_MEMO_ = null;

/**
 * Test-only reset hook. Clears the in-process memo so each Vitest
 * case starts from a clean slate against its own CacheService fake.
 */
function programsResetForTesting_() {
  PROGRAMS_MEMO_ = null;
}

/**
 * Resolve column indexes by header name, order-independent, per
 * spec 004 §5. Matches case-insensitively.
 *
 * @param {Array<string>} header
 * @returns {{id: number, name: number, type: number, description: number}}
 */
function programsResolveColumns_(header) {
  function findIndex(candidates) {
    for (var i = 0; i < header.length; i++) {
      var h = String(header[i]).trim().toLowerCase();
      for (var c = 0; c < candidates.length; c++) {
        if (h === candidates[c]) return i;
      }
    }
    return -1;
  }
  return {
    id: findIndex(["program_id", "program id", "programid"]),
    name: findIndex(["program_name", "program name", "name"]),
    type: findIndex(["type"]),
    description: findIndex([
      "description",
      "program_description",
      "program description",
    ]),
  };
}

/**
 * Read and parse the Programs sheet into plain objects. Bypasses
 * the cache — callers use programsList_() for the cached path.
 *
 * @returns {Array<{id: string, name: string, type: string, description: string}>}
 */
function programsReadAndParse_() {
  var ss = efccSpreadsheet_();
  var sheet = ss.getSheetByName(PROGRAMS_SHEET_NAME);
  if (!sheet) return [];
  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];
  var cols = programsResolveColumns_(rows[0]);
  var result = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var id = cols.id >= 0 ? String(row[cols.id]).trim() : "";
    if (!id) continue; // Program_ID missing on a row -> skip entirely.
    result.push({
      id: id,
      name: cols.name >= 0 ? String(row[cols.name]) : "",
      type: cols.type >= 0 ? String(row[cols.type]) : "",
      description: cols.description >= 0 ? String(row[cols.description]) : "",
    });
  }
  return result;
}

/**
 * Return the Programs list, read-through the script cache per spec
 * 004 §3. Cache-put failures (e.g. size limit) are swallowed —
 * the fresh Sheet data is still returned to the caller.
 *
 * @returns {Array<{id: string, name: string, type: string, description: string}>}
 */
function programsList_() {
  if (PROGRAMS_MEMO_) return PROGRAMS_MEMO_;
  var cache = CacheService.getScriptCache();
  var cached = cache.get(PROGRAMS_CACHE_KEY_);
  if (cached) {
    try {
      var parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        PROGRAMS_MEMO_ = parsed;
        return parsed;
      }
    } catch (e) {
      // Corrupt cache entry -> fall through to a fresh Sheet read.
    }
  }
  var fresh = programsReadAndParse_();
  try {
    cache.put(
      PROGRAMS_CACHE_KEY_,
      JSON.stringify(fresh),
      PROGRAMS_CACHE_TTL_SEC_
    );
  } catch (e) {
    // Cache put failed (e.g. size limit) -- continue with fresh data.
  }
  PROGRAMS_MEMO_ = fresh;
  return fresh;
}
