/**
 * One-time manual setup for the operational Attendances sheet.
 *
 * Before running this function, manually rename the legacy Attendances tab to
 * a dated archive name (for example, Attendances_Legacy_20260801). This
 * function deliberately refuses to rename, delete, clear, or overwrite any
 * existing sheet.
 *
 * Run `setupAttendancesSheet_` once from the Apps Script editor. It creates
 * the new tab and writes only the header row required by the check-in RPC.
 *
 * Official Apps Script references:
 * - SpreadsheetApp.openById (through efccSpreadsheet_):
 *   https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet-app#openById(String)
 * - Spreadsheet.getSheetByName / insertSheet:
 *   https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet.html
 * - Sheet.getRange / Range.setValues:
 *   https://developers.google.com/apps-script/reference/spreadsheet/sheet
 *   https://developers.google.com/apps-script/reference/spreadsheet/range#setValues(Object)
 */

function setupAttendancesSheet_() {
  var sheetName = "Attendances";
  // Use the configured DEV spreadsheet, not whichever spreadsheet happens to
  // be active in an Apps Script editor window.
  var spreadsheet = efccSpreadsheet_();

  if (spreadsheet.getSheetByName(sheetName)) {
    throw new Error(
      "The '" +
        sheetName +
        "' sheet already exists. Archive the legacy tab first; this setup does not overwrite sheets."
    );
  }

  var sheet = spreadsheet.insertSheet(sheetName);
  sheet
    .getRange(1, 1, 1, 7)
    .setValues([
      [
        "Attendance_ID",
        "Event_ID",
        "User_ID",
        "CheckIn_Time",
        "CheckIn_Method",
        "CheckIn_By",
        "Status",
      ],
    ]);

  return "Created the Attendances sheet with the operational check-in headers.";
}

/**
 * Public runner so the function appears in the Apps Script editor's Run
 * dropdown (private `_`-suffixed functions are not listed there).
 */
function runAttendancesSetup() {
  return setupAttendancesSheet_();
}
