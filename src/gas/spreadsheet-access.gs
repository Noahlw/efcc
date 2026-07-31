/**
 * Access the DEV spreadsheet via a Script Property configuration.
 *
 * Web-app executions do not have an active spreadsheet UI, so repositories
 * must open the project's known parent spreadsheet explicitly via openById.
 *
 * The spreadsheet ID is read from the EFCC_SPREADSHEET_ID Script Property,
 * not hard-coded in source. This allows DEV/production to use different
 * spreadsheets without source changes.
 *
 * Apps Script API used (per AGENTS.md docs-backed method rule):
 *   - PropertiesService.getScriptProperties().getProperty(key):
 *     https://developers.google.com/apps-script/reference/properties/properties-service
 *   - SpreadsheetApp.openById(id):
 *     https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet-app#openById(String)
 *
 * Doc evidence: Context7 /websites/developers_google_apps-script:
 *   "Set Properties with PropertiesService" -
 *   scriptProperties.setProperty('SERVER_URL', ...) / getProperty(key)
 */

/**
 * Reads the spreadsheet ID from the EFCC_SPREADSHEET_ID Script Property.
 * Throws a clear error with setup instructions if the property is absent or empty.
 *
 * @returns {string} The spreadsheet ID
 * @throws {Error} If EFCC_SPREADSHEET_ID Script Property is not set
 */
function efccSpreadsheetId_() {
  var id = PropertiesService.getScriptProperties().getProperty("EFCC_SPREADSHEET_ID");
  if (!id) {
    throw new Error(
      "EFCC_SPREADSHEET_ID Script Property is not set. " +
      "Open Project Settings > Script Properties and set " +
      "EFCC_SPREADSHEET_ID to the spreadsheet ID."
    );
  }
  return id;
}

/**
 * Opens the DEV spreadsheet by ID read from Script Properties.
 *
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function efccSpreadsheet_() {
  return SpreadsheetApp.openById(efccSpreadsheetId_());
}

/**
 * Resolve column indexes by header name from an actual sheet header
 * row. Shared by users-repository.gs and program-leaders-repository.gs
 * (programs-repository has a distinct return shape and is not
 * covered by this helper).
 *
 * Case-insensitive: header cells are trimmed+lowercased, candidates
 * are lowercased on compare. If a logical key has no matching header,
 * the helper throws with the candidate list so the operator can
 * diagnose a missing or renamed column.
 *
 * @param {Array<string>} headerRow
 * @param {Object<string, Array<string>>} candidatesMap
 *   Map of LOGICAL_KEY -> array of acceptable header strings.
 * @returns {Object<string, number>} Map of LOGICAL_KEY -> column index.
 */
function resolveColumnsByCandidates_(headerRow, candidatesMap) {
  var normalized = [];
  for (var h = 0; h < headerRow.length; h++) {
    normalized.push(String(headerRow[h]).trim().toLowerCase());
  }
  var col = {};
  var keys = Object.keys(candidatesMap);
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k];
    var candidates = candidatesMap[key];
    var idx = -1;
    for (var c = 0; c < candidates.length; c++) {
      idx = normalized.indexOf(candidates[c].toLowerCase());
      if (idx !== -1) break;
    }
    if (idx === -1) {
      throw new Error(
        "Sheet is missing a required column. Expected one of: " +
          candidates.join(" / ")
      );
    }
    col[key] = idx;
  }
  return col;
}
