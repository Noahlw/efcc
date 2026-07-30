/**
 * EFCC 顯恩堂 — shared Spreadsheet handle for the app's Google Sheets
 * database.
 *
 * Per ADR-0015, the script is standalone (not bound to the
 * Users/Programs/Events spreadsheet), so the spreadsheet's own Drive
 * sharing can stay fully private while the deployed web app is
 * public. Container-bound scripts inherit the container's access
 * list (https://developers.google.com/apps-script/guides/bound#access_to_bound_scripts),
 * which would force the spreadsheet — and the member PII it holds —
 * to be shared with the same audience as the web app. Opening it by
 * ID instead keeps the two access lists independent
 * (https://developers.google.com/apps-script/guides/collaborating#collaboration_basics).
 *
 * Apps Script APIs used (per AGENTS.md docs-backed method rule):
 *   - PropertiesService.getScriptProperties():
 *     https://developers.google.com/apps-script/reference/properties/properties-service#getScriptProperties()
 *   - SpreadsheetApp.openById(id):
 *     https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet-app#openById(String)
 */

var EFCC_SPREADSHEET_ID_KEY = "EFCC_SPREADSHEET_ID";

/**
 * @returns {string} The Spreadsheet ID. Throws if absent.
 */
function efccSpreadsheetId_() {
  var id = PropertiesService.getScriptProperties().getProperty(
    EFCC_SPREADSHEET_ID_KEY
  );
  if (!id) {
    throw new Error(
      "EFCC_SPREADSHEET_ID missing from Script Properties. " +
        "Set it before deploying; fail-closed, same as EFCC_SESSION_SALT."
    );
  }
  return id;
}

/**
 * Open the app's Spreadsheet by ID. Replaces
 * SpreadsheetApp.getActiveSpreadsheet(), which only works for a
 * script bound to the Spreadsheet as its container (ADR-0015).
 *
 * @returns {Spreadsheet}
 */
function efccSpreadsheet_() {
  return SpreadsheetApp.openById(efccSpreadsheetId_());
}
