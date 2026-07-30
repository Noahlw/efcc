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

## Implementation verification workflow — headless browser gate

Every implementation that touches the Apps Script web app (server `.gs` files, client `.js.html`/`.html` files, navigation, session, RPC, or Section content) MUST include an acceptance plan derived directly from the governing spec or ticket acceptance criteria, executed against a fresh `/exec` deployment. Unit tests alone cannot prove that `google.script.run`, `google.script.history`, the deployed HTML Service IFRAME, login, navigation, role-gating, and error recovery work together at the deployed `/exec` URL.

### When it applies

- Any change to server `.gs` files, client `.js.html`/`.html` files, navigation, session, RPC, audit, repository, Section content, styles, or deployment configuration.
- Purely mechanical changes (formatting, comment fixes, renames with no behavioral change) are exempt.

### What the plan must contain

1. **Target deployment** — the fresh versioned `/exec` URL to test against (never the production deployment).
2. **Role matrix** — which roles (MEMBER, Program Leader, STAFF, ADMIN, combined) are exercised, at which viewport widths (phone 375px, desktop 1280px).
3. **Acceptance trace** — a step-by-step walk mapped 1:1 to the spec's acceptance criteria. Each step names the expected observable outcome (element text, visibility, `data-app-state`, nav item count, active section, error message).
4. **Forbidden paths** — direct RPC calls and direct section navigation that MUST return a recoverable forbidden/error state, never protected data or a blank document.
5. **Recovery paths** — session expiry, transport failure, and role/leadership change mid-session, each with the expected recovery UI.

The executed per-assertion results land in the ticket's plan doc as an "Executed results" section appended by the pipeline run (see `docs/adr/0012-e2e-testing-strategy.md`) — do NOT transcribe pass/fail rows by hand; the pipeline writes them.

### How to execute

For any acceptance run requiring an authenticated session (login-gated behavior: navigation, RPC, role-gating, session recovery), the Playwright pipeline under `tests/e2e/` is the primary execution mechanism (per ADR-0012). It persists three storage states, one per test role, generated by `npm run e2e:auth -- --role=<alice|bob|noah>` and consumed by `npm run test:e2e`:

- `alice` / MEMBER / PIN 1234 → `.auth/alice.storage.json`
- `bob` / STAFF / PIN 5678 → `.auth/bob.storage.json`
- `noah` / ADMIN / PIN 6883 → `.auth/noah.storage.json`

The pipeline loads each role's storage state, opens the deployed `/exec` URL, drives the EFCC login form (application-layer PIN, not the Google account), and asserts the role matrix end-to-end. Use it for everything that crosses the login boundary.

Use the Orca `browser` tool (driving the deployed `/exec` URL with `tab.observe()`, `tab.click()`, `tab.fill()`, `tab.evaluate()`) for:

- Cold-start / no-login assertions: `SIGNED_OUT` state, login form presence, CSS and layout checks (e.g. the mobile-sidebar and scroll-lock bugs fixed earlier). These do not require real authentication.
- Interactive one-off debugging when the Playwright pipeline itself needs troubleshooting.

Orca is NOT a substitute for the Playwright pipeline once login is involved. Headless Orca sessions hit a Google sign-in wall on `google.script.run` calls even with `ANYONE_ANONYMOUS` deployment access — `executeAs: USER_DEPLOYING` means the calling browser must hold a valid Google session cookie for the RPC handshake to complete, and a stateless headless session cannot pass this. Use Orca for what it can actually do; route anything login-gated through the pipeline.

Assert every acceptance criterion through observable DOM state — never assume a click "probably worked."

### Gate

- The headless run — via the Playwright pipeline for any login-gated check, or via the Orca `browser` tool for cold-start / CSS-only checks, whichever applies — MUST pass every criterion in the plan before the implementation is considered ready for review.
- A failure on any criterion blocks delivery. The fix goes back through implementation and re-verification; the criterion is not waived or downgraded.
- The plan itself is written BEFORE implementation begins and reviewed alongside the code changes.
- CI (GitHub Actions) runs the pipeline on every push per ADR-0012 (see `docs/adr/0012-e2e-testing-strategy.md`).

## Google Sheet database — no automatic mutation

The backend Google Sheet (connected to the Apps Script project) is the source of truth for user data, programs, enrollments, attendance, and audit records. It MUST NEVER be modified automatically by an agent through the Apps Script API, Sheets API, or clasp.

When an implementation requires a schema change (new sheet tab, new column, seed data) or a data fix:

1. State exactly what needs to change — sheet name, columns, rows.
2. Ask the user to perform the edit manually in Google Sheets.
3. Only continue after the user confirms the change is done.

This rule applies to every phase: implementation, testing, deployment, and debugging. The only permitted sheet interaction is reading the exported `.xlsx` snapshot for structural reference.

### Narrow E2E fixture exception (authorized 2026-07-31)

The DEV spreadsheet (`EFCC_SPREADSHEET_ID`) may be seeded/reset by CI for E2E acceptance runs, BUT ONLY under these conditions:

1. Through the **Google Sheets API** (never through Apps Script, Sheets UI automation, or clasp).
2. For rows whose first-column value starts with **`E2E_`** (in the Programs and Program_Leaders tabs only).
3. After **snapshotting** those rows via `values.batchGet` and before **restoring** them via `values.batchUpdate` with `valueInputOption: "RAW"`.
4. If the expected `E2E_` fixture IDs are **missing or duplicated**, the run MUST fail closed (no write).
5. A standalone **`fixture-reset.ts`** script writes known-good baseline values as a crash-recovery fallback.
6. The **Users tab is never mutated** by CI. Tests log in as real DEV users (alice/bob/noah).

Production and operational DEV Sheets (non-`E2E_` rows) remain strictly read-only under the original rule above.

The authoritative sheet structure is documented in [ADR-0013: Google Sheets Database Structure](docs/adr/0013-google-sheets-database-structure.md). CONTEXT.md § Data Store is a summary; ADR-0013 is the canonical record. Always refer to ADR-0013 for the current schema before writing or debugging sheet-dependent code.
