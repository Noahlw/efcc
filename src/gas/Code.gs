/**
 * EFCC 顯恩堂 — server entry point.
 *
 * Stable top-level App Document per ADR-0010 (single HTML Service entry;
 * client-side module composition in shell.js.html). doGet() must not read
 * the incoming request's query parameters — navigation lives entirely in
 * the SPA shell hosted by App.html, not query-string routing.
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile("App")
    .evaluate()
    .setTitle("EFCC 顯恩堂")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
