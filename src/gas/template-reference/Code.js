function doGet(e) {
  let template;
  template = HtmlService.createTemplateFromFile("login");
  return template
    .evaluate()
    .setTitle("Login with Multiple Pages")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// Generate token (simple random string + timestamp)
function generateToken() {
  return Utilities.getUuid();
}

// Login handler
function loginUser(email, password) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName("Users");
  const data = userSheet.getDataRange().getValues(); // all rows

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == email && data[i][1] == password) {
      const token = generateToken();
      const expiry = new Date().getTime() + 3 * 60 * 60 * 1000; // 3 hours

      // Return success with token and access info
      return JSON.stringify({
        success: true,
        token: token,
        expiry: expiry,
        accessPages: data[i][2].split(","), // e.g. Dashboard,Reports
      });
    }
  }
  return JSON.stringify({
    success: false,
    message: "Invalid email or password",
  });
}

// Get menu items based on access pages
function getMenu(accessPages) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const menuSheet = ss.getSheetByName("Menu");
  const data = menuSheet.getDataRange().getValues();
  let menus = [];
  for (let i = 1; i < data.length; i++) {
    if (accessPages.includes(data[i][2])) {
      menus.push({ name: data[i][0], url: data[i][1] });
    }
  }
  return menus;
}

function loadPage(page) {
  return HtmlService.createTemplateFromFile(page).evaluate().getContent();
}

function uploadFile(formObject) {
  try {
    var targetSheetId = "YOUR_SHEET_ID_HERE"; // Replace with your existing sheet ID

    // Create a blob from the uploaded file
    var blob = formObject.fileToUpload;

    // Save file temporarily in Drive
    var file = DriveApp.createFile(blob);

    // Convert Excel file to Google Sheets
    var resource = {
      title: file.getName(),
      mimeType: MimeType.GOOGLE_SHEETS,
    };
    var converted = Drive.Files.copy(resource, file.getId()); // Needs Advanced Drive Service enabled

    // Open both sheets
    var tempSpreadsheet = SpreadsheetApp.openById(converted.id);
    var tempSheet = tempSpreadsheet.getSheets()[0]; // take first sheet
    var data = tempSheet.getDataRange().getValues();

    var targetSpreadsheet = SpreadsheetApp.openById(targetSheetId);
    var targetSheet = targetSpreadsheet.getSheets()[0]; // pick specific sheet if needed

    // Clear existing data and paste new data
    targetSheet.clear();
    targetSheet.getRange(1, 1, data.length, data[0].length).setValues(data);

    // Cleanup: delete temporary files
    DriveApp.getFileById(file.getId()).setTrashed(true);
    DriveApp.getFileById(converted.id).setTrashed(true);

    return "Data imported successfully into: " + targetSpreadsheet.getUrl();
  } catch (e) {
    return "Error: " + e.toString();
  }
}
