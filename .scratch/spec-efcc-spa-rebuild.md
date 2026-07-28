## Problem Statement

EFCC's church-management web app (`src/gas/`) uses a `?page=` query-string multi-page routing model (ADR-0007) with a synthetic-anchor + meta-refresh navigation workaround for Google Apps Script's IFRAME sandbox. This login/navigation path is demonstrated broken: a real-credential test on the deployed `/exec` URL still fails to reach the profile page, contradicting an earlier (unverified) claim that a smoke-test-based fix resolved it. Independently, a review of a reference GAS template (script ID `1rl1oS1nggq-WJ-D1dk_Ddn0N8mgTdCdXenl797vZ8q42kuemaI15XVFE`) showed a structurally different, sandbox-safe pattern: an SPA shell with server-rendered HTML fragments swapped in via DOM mutation (`document.open/write/close`, `innerHTML` injection) — never via browser navigation, so the sandbox's `allow-top-navigation-by-user-activation` restriction never applies.

No claim is made that the rest of the current app (programs, events, scanner, dashboard, care) is broken — those paths are unverified either way. This spec covers a deliberate, from-scratch rebuild chosen for architectural soundness and a stated UI preference (bottom-tab mobile chrome), not a symptom patch.

## Solution

Rebuild `src/gas/` on the template's SPA-shell + DOM-swap architecture, reimplementing EFCC's domain logic from `程式碼.js` (the 616 KB, 48-function monolithic reference archive) rather than porting the current `src/gas/` server files. This was decided via a `ceo-review` pass: three approaches were weighed (minimal client-only rewrite reusing current server code; hybrid diff-audit; full cathedral reimplementation); the cathedral approach was selected, with Mode 2 (Selective Expansion — ship a bulletproof baseline first, defer optional expansions to explicit follow-up).

Full decision trail: `docs/adr/0008-restart-from-template-1rl1o1ngg.md`, `docs/adr/0009-audit-log-write-pattern.md`, `docs/research/2026-07-28-template-walkthrough.md`.

## User Stories

1. As a church member, I want to log in with my username and PIN and land on my profile immediately, so that I don't hit a blank page or broken link after login.
2. As a church member on a mobile phone, I want a bottom tab bar for navigation, so that the app feels like a native mobile app and doesn't waste screen space on a desktop-style sidebar.
3. As a church member on a desktop browser, I want a sidebar for navigation, so that I have direct access to all my accessible pages without a mobile-cramped layout.
4. As a member with only baseline access, I want to see only the pages I'm actually allowed to use in my navigation chrome, so that I'm not confused by options that will just reject me.
5. As a STAFF or ADMIN user, I want to see Dashboard, Scanner, and Care in my chrome (in addition to Profile/Programs/Events), so that I can reach my elevated-privilege tools without hunting for a hidden URL.
6. As a Program Leader (per ADR-0006), I want to see the Scanner page in my chrome for programs I lead, even if my global role is MEMBER, so that my per-program grant is usable without needing STAFF.
7. As any authenticated user, I want tapping a nav item to swap page content without a full browser reload, so that the app feels fast and the header/nav chrome doesn't flicker.
8. As any authenticated user, I want to log out and have my session fully cleared, so that the next person using this device isn't automatically logged in as me.
9. As an ADMIN or STAFF user performing a privileged action (approving a member, changing a role, cancelling an event), I want that action recorded in an audit trail with who/what/when/outcome, so that there is accountability for admin actions per ADR-0006.
10. As the developer maintaining this app, I want a single explicit `writeAuditLog()` call site per privileged function (not a hidden decorator), so that I can read a function and see exactly what gets logged without chasing framework magic.
11. As the developer maintaining this app, I want concurrent privileged writes serialized via `LockService`, so that two staff members approving different members at the same time don't corrupt or interleave the Audit_Log rows.
12. As the developer maintaining this app, I want the domain logic reimplemented from `程式碼.js` (not ported piecemeal from the current build), so that the new codebase has one clear source of truth instead of inheriting whatever the previous port did or didn't preserve correctly.
13. As the developer maintaining this app, I want a defined smoke-test exit criteria (see Testing Decisions) before declaring the rebuild "done," so that "it renders a form" is never again mistaken for "the feature works."
14. As the church office, I want the current live deployment(s) preserved as rollback references until the new build passes its exit criteria, so that a failed rebuild doesn't take down the app members currently rely on.

## Implementation Decisions

**Server (`src/gas/`, all `.gs` files reimplemented from `程式碼.js`, not the current `src/gas/`):**
- `doGet(e)` always returns `login.html` — no `e.parameter.page` routing.
- `loadPage(name)`: `return HtmlService.createTemplateFromFile(name).evaluate().getContent();` — the single function returning any fragment's rendered HTML string. `name` is validated against a server-side allow-list (`profile`, `programs`, `events`, `scanner`, `dashboard`, `care`) before the template lookup, to avoid arbitrary file reads.
- `include(filename)` — unchanged utility, used by `<?!= include('styles'); ?>` in `main.html`.
- Domain functions (auth, members, programs, events, attendance, dashboard, infrastructure — 48 total across 7 domains in `程式碼.js`) reimplemented with EFCC's existing sheet schema and RBAC matrix (ADR-0006) unchanged; return shape normalized to objects (not JSON strings) throughout, since GAS `google.script.run` already marshals objects across the boundary.
- `writeAuditLog(actorId, actionType, targetId, oldValue, newValue, reason, outcome, correlationId)` (ADR-0009): called **twice** per privileged mutation — once with `outcome='ATTEMPT'` before the mutation, once with `'SUCCESS'`/`'ERROR'` after, sharing one `correlationId`. Each call wraps its `appendRow` in `LockService.getScriptLock().waitLock(30000)` / `finally { releaseLock() }`, writes the extended schema (`Log_ID`, `Timestamp`, `Actor_User_ID`, `Action_Type`, `Target_User_ID`, `Old_Value`, `New_Value`, `Reason`, `Outcome`, `Correlation_ID`, `Actor_Session_Key`), and mirrors to `console.log`. Google Sheets has no cross-write transactions — this pattern does not achieve atomic rollback of the mutation (impossible on this platform); it makes failures reconstructable via unmatched `Correlation_ID`s instead of silently invisible or falsely marked successful. Neither call may swallow its exception.

**Client:**
- `login.html`: only top-level page. Username + PIN fields (not template's email + password). On success: store `{token, expiry, accessPages}` in `localStorage`, fetch the user's accessible-pages menu, then `document.open(); document.write(mainHtml); document.close();` to swap in `main.html`. No success card, no "Continue" confirmation step — navigation is immediate (locked per prior session directive).
- `main.html` (shell): renders sidebar (desktop, `≥768px`) and bottom tab bar (mobile, `<768px`) from the same accessible-pages list, both invoking one shared `loadMenuPage(pageName, el)` — no duplicated menu-rendering logic between the two chromes. On load, validates the stored token's expiry client-side and cross-checks with a server session-validation call; on failure, swaps back to `login.html` via the same DOM-swap pattern.
- `loadMenuPage(pageName, el)`: shows a loading state in `#main-content`, calls `loadPage(pageName)` via `google.script.run`, injects the returned HTML via `innerHTML`, re-creates and re-executes any `<script>` tags found in the injected fragment (required because `innerHTML`-injected `<script>` tags do not auto-execute), then calls `window["init" + Capitalize(pageName)]()` if defined.
- Fragments (`profile.html`, `programs.html`, `events.html`, `scanner.html`, `dashboard.html`, `care.html`): bare `<div>` + `<script>` blocks, no `<html>/<head>/<body>`, each defining its `initXxx()` convention function; each also re-checks the current user's role/grants before rendering privileged controls (defense in depth alongside the server-side chrome filter).
- `styles.html`: kept as a separate file (unchanged from current convention), included into `main.html`'s `<head>` via `<?!= include('styles'); ?>`.
- Logout: clears `localStorage`, DOM-swaps back to `login.html`.

**RBAC / chrome filtering:**
- A server function (name TBD at implementation — analogous to template's `getMenu(accessPages)`) returns only the pages the authenticated user can navigate to, computed from their global `Role` (ADMIN/STAFF/MEMBER per ADR-0006) plus any `Program_Leaders` grants. The client renders exactly this list into both sidebar and bottom-tab chrome.

**Audit_Log schema change** (ADR-0009): add `Outcome`, `Correlation_ID`, `Actor_Session_Key` columns to the existing sheet — additive, no existing column renamed or removed.

## Testing Decisions

**Definition of a good test here**: an observable, end-to-end behavior a real user or a real privileged caller would trigger — not a code-shape assertion. Given GAS's runtime constraints (no standard JS test runner without extra tooling; `clasp` deploys directly to Google's infrastructure), the primary test seam for this rebuild is:

- **Seam 1 (primary, proposed)**: a browser-automation smoke test (via headless Chromium, the same `browser` tool already used this session) driving the **deployed `/exec` URL** with a **real test-account** credential — not a code-inspection check. This is the mechanism for the Bulletproof Baseline exit criteria already defined in ADR-0008:
  1. Login form renders on `/exec`.
  2. Real credential submit → session established → `main.html` renders (verify both viewport widths: sidebar at desktop width, bottom tabs at mobile width).
  3. Each of the 6 fragments loads via `loadMenuPage()` without blank screen / script error / stuck spinner.
  4. RBAC-filtered chrome: a MEMBER test account does not see Dashboard/Scanner/Care; a STAFF test account does.
  5. Logout clears session; a fresh page load does not auto-restore.
  6. F5 refresh from `main.html` with a valid session resolves back to `main.html` (brief login flash acceptable, permanent trap is not).
  7. One privileged action (e.g. approve a pending member) produces a correctly-shaped `Audit_Log` row, verified by reading the sheet directly (via `SpreadsheetApp` inspection or the Sheets UI).

- **Seam 2 (secondary, proposed)**: direct server-function invocation via `clasp run` (or an Apps Script test-trigger harness) for the reimplemented domain functions where a full browser round-trip is unnecessary — e.g. PIN-hash comparison logic, event-recurrence generation math, RBAC gate helper (`checkRoleAtLeast_`-equivalent). Prefer this seam for pure-logic functions with no Sheets side effect; prefer Seam 1 for anything touching session state or the DOM-swap chrome.

**Test seam confirmation requested from user before this becomes binding** (per `to-spec` skill's explicit checkpoint) — proposed above, not yet confirmed.

**Prior art in this repo**: `.scratch/vanilla-restructure/smoke-test-checklist.md` (84-step manual checklist from the previous build) and `.scratch/vanilla-restructure/TESTING.md` — both written for the old multi-page architecture and not directly reusable, but establish the existing convention of exhaustive manual smoke-test checklists for this app. This spec's Seam 1 supersedes that convention with browser-automated equivalents where feasible.

## Out of Scope

- **Cherry-pick expansions (CEO Review Mode 2) — explicit follow-up only, not committed in this spec**:
  1. End-to-end login verification harness as a *standing* CI-style check (beyond the one-time exit-criteria pass above).
  2. Formal diff-audit of `程式碼.js`'s 48 functions against the current `src/gas/` implementations (informational; would not change the "reimplement from `程式碼.js`" decision).
  3. Full per-function TDD suite for all 48 reimplemented functions.
  4. Explicit rollback trigger criteria/automation (beyond "keep old deployment IDs live").
  5. A blind-spot `reviewer` subagent pass on the ADRs before implementation starts.
  6. URL-hash-based deep-linking layered onto the DOM-swap model.
- Any change to the RBAC matrix, Program Leader model, or Member approval flow (ADR-0006) — those stay exactly as specified.
- Any change to the Google Sheets database choice (ADR-0001) or PIN-based authentication mechanism (ADR-0002) — reimplemented as-is, not redesigned.
- Moving `Audit_Log` off Google Sheets, or adding cryptographic hash-chaining for tamper-evidence (considered and rejected in ADR-0009).
- Desktop-vs-mobile detection beyond a CSS media-query breakpoint (no server-side device detection, no separate desktop/mobile deployments).

## Further Notes

- Original navigation-bug research is preserved at `docs/research/2026-07-28-gas-nav-real-world-patterns.md` — useful context on why the old multi-page pattern needed a synthetic-anchor workaround at all (Sept 2021 IFRAME sandbox change removing unconditional `allow-top-navigation`), even though this spec supersedes that architecture.
- The template walkthrough (`docs/research/2026-07-28-template-walkthrough.md`) is the primary technical reference for the new architecture's mechanics — codebase-memory-graph-verified, not a training-data guess.
- Current live deployments (`@1` through `@7`, script `11FXWYDvyLxxa6K01tEZeWn9g8JYOdyXoWJWmWFmo2LMXjjrKYmpCSXIK`) stay live and untouched until the new build passes the Bulletproof Baseline exit criteria — no forced cutover before that gate.
- `程式碼.js` and `src/frontend/` (retired React SPA) remain at their current paths as read-only historical archives; this rebuild does not touch them.
- The template clone at `src/gas/template-reference/` is reference-only and must not be pushed via `clasp` (it is not part of the deployed script's `rootDir`).