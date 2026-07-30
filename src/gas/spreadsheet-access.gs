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
