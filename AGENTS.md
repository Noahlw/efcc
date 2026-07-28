# EFCC Project Guidance

## Apps Script evidence gate

Before recommending, accepting, or implementing a decision that touches the Google Apps Script backend or an Apps Script browser API:

1. Query Context7 first using the official Google Apps Script documentation library (`/websites/developers_google_apps-script`).
2. If Context7 is unavailable or does not answer the question, use web search restricted to official Google documentation first, then another trustworthy primary source when Google does not document the concern.
3. Distinguish documented API support from deployed EFCC behavior. Official documentation proves platform availability only.
4. Keep the decision `Proposed` until a minimal implementation test and a fresh deployed `/exec` IFRAME smoke test both pass.
5. Record the documentation source, test flow, deployment version, date, and observed result in the relevant spec or ADR.

## Apps Script docs-backed method rule

Every Apps Script API call, method chain, manifest field, or configuration directive I propose or implement in this project — whether in a Code.gs file, a front-end `google.script.run` call, an `appsscript.json` key, a clasp command, or a deploy/runtime setting — must be backed by the official Google Apps Script documentation. A "method" is any of:

- a function or class on an Apps Script service (e.g. `HtmlService`, `PropertiesService`, `SpreadsheetApp`, `LockService`, `UrlFetchApp`, `Utilities`, `CacheService`, `Session`, `ScriptApp`, `ContentService`, `Logger`, `HtmlService.createTemplateFromFile` / `createHtmlOutputFromFile`, `HtmlOutput.addMetaTag` / `setXFrameOptionsMode` / `setSandboxMode`, `HtmlService.XFrameOptionsMode` / `SandboxMode` enums, etc.);
- a manifest field in `appsscript.json` (e.g. `webapp.executeAs`, `webapp.access`, `runtimeVersion`, `oauthScopes`, `dependencies`, `timeZone`, `exceptionLogging`);
- a clasp CLI command, flag, or `.clasp.json`/`.claspignore` directive;
- a versioned-deployment or Apps Script CDN behavior relied on at runtime (cache headers, redirect behavior, iframe sandbox attributes, etc.).

Acceptable evidence is, in priority order:

1. the official Google Apps Script documentation served via Context7 (`/websites/developers_google_apps-script` is the canonical library);
2. the official Google Apps Script documentation on `developers.google.com` fetched directly;
3. the official clasp documentation / GitHub repo for clasp-specific behavior.

Community sources (Stack Overflow, blog posts, GitHub issues) are not acceptable as the primary evidence for a method or directive. They may appear as supplementary context but cannot substitute for an official source.

When I cite a method, I cite the source with the proposal: either a Context7 library ref + quote, a `developers.google.com` URL + quoted passage, or a clasp doc URL + quoted passage. If no official source exists for a behavior, I do not silently invent it — I surface that as a blocking question and ask for direction rather than guessing.

This rule applies to every interaction in this repo: code review, code implementation, debugging, planning, and user-facing recommendations. It cannot be weakened by efficiency, familiarity, or a request to "just do it."

## End Apps Script docs-backed method rule
