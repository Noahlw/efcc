# Fix Multi-Page Navigation for GAS IFRAME Sandbox

> **For OMP workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Dispatch each task as a fresh `task` subagent; gate between tasks with the OMP `reviewer` agent (the `code-review` skill's spec axis).

**Goal:** Fix EFCC's multi-page web app so navigation works under the post-September 2021 GAS IFRAME sandbox by replacing the blocked `window.location.assign` programmatic redirect with a synthetic user-activation click on an anchor with `target="_top"`, and remove the half-implemented `shell.html` SPA stub.

**Architecture:** Pattern B from the official GAS docs (multi-page with `doGet(e)` routing on `?page=`) — the pattern already in `Code.gs` and the seven page `.html` files. Only the **navigation mechanism** inside `app.js.html` and the **spurious `shell.html` stub** need to change. No SPA conversion, no page rewriting, no new server functions.

**Tech Stack:** Google Apps Script HtmlService (V8 runtime), vanilla HTML/CSS/JS, `clasp` for deployment. IFRAME sandbox is the only mode. No build tools. No test framework for the running web app — testing is via the smoke checklist at `.scratch/vanilla-restructure/smoke-test-checklist.md`.

---

## Global Constraints

- **GAS IFRAME sandbox only**: NATIVE and EMULATED modes are sunset. `setSandboxMode()` is a no-op. Source: `developers.google.com/apps-script/guides/html/restrictions`.
- **Programmatic top-level navigation is blocked** since Sept 1, 2021 (`allow-top-navigation` was replaced by `allow-top-navigation-by-user-activation`). `window.location.assign()`, `window.location.href =`, and `top.location =` from JS callbacks all fail silently. Source: `developers.google.com/apps-script/release-notes` entry dated September 1, 2021.
- **Real user-gesture clicks on `<a>` or `<button>` elements with `target="_top"` (or a document-wide `<base target="_top">`) DO trigger top-level navigation**. This is the only working pattern.
- **Every `.html` file must include `<!DOCTYPE html>`, `<html>`, `<body>` tags** — IFRAME mode does not auto-inject them. Source: `developers.google.com/apps-script/migration/iframe`.
- **All active content (scripts, stylesheets) must be HTTPS** — no HTTP. Source: same.
- **HTML forms are no longer auto-prevented from submitting** in IFRAME mode — every form needs `event.preventDefault()` in its `submit` listener. Source: same.
- **Every page already has `<base target="_top">` in `<head>`** — verified during research; do not change.
- **`程式碼.js` (reference archive) and `src/frontend/` (retired React SPA) are not in scope** — only files in `src/gas/` may change.
- **Naming**: file basenames in GAS must be unique across extensions (a `.gs` and `.html` cannot share a base name). Server `.gs` files for service-like concerns use `-svc` suffix (`events-svc.gs`, `programs-svc.gs`, `dashboard-svc.gs`).
- **Deployment** is via `clasp push --force` from project root, with `rootDir: "src/gas"` in `.clasp.json`. `.claspignore` excludes everything except `*.gs`, `*.html`, `appsscript.json`.

---

## File Structure & Changes

| File | Action | Responsibility |
|---|---|---|
| `src/gas/app.js.html` | **Modify** | Fix `navigate()` body to use synthetic anchor click. Add `clickAnchor(page)` helper. Remove `window.location.assign` usage. |
| `src/gas/shell.html` | **Delete** | Unused, half-implemented Pattern A stub; calls `getPageContent()` which doesn't exist; conflicts with `app.js.html`'s `navigate()` definition. |
| `src/gas/login.html` | **Modify** | After successful login, replace `navigate('profile')` (line 93) with a real clickable link. Remove programmatic `navigate('profile')` call. |
| `src/gas/profile.html` | **Modify** | Replace the `setTimeout(function () { navigate('login'); }, 2500)` fallback at line 144 with a real clickable "Back to Login" link/button. |
| `src/gas/register.html` | **Modify** | The "Go to Login" button (line 166) is already a real click → it works. But it currently calls `navigate('login')` which uses `window.location.assign`. Change its click handler to set `window.location` on an anchor, not call the broken helper. Verify the existing `<button>` element pattern. |
| `src/gas/Code.gs` | **No change** | Already correct. `doGet()` branches on `e.parameter.page`, allowlist enforced, no `setXFrameOptionsMode(ALLOWALL)`. |
| `src/gas/auth.gs` | **No change** | All 11 RPC functions work. |
| `src/gas/members.gs` | **No change** | `registerNewMember`, `api_searchMembers` work. |
| `src/gas/attendance.gs` | **No change** | LockService check-in works. |
| `src/gas/events-svc.gs` | **No change** | onEdit + events work. |
| `src/gas/programs-svc.gs` | **No change** | Catalog/enrollment work (returns wrapped `{success, data}` envelope — see Failure Modes). |
| `src/gas/dashboard-svc.gs` | **No change** | Care dashboard works. |
| `src/gas/styles.html` | **No change** | CSS tokens present, used by all pages via `<?!= include('styles') ?>`. |
| 5 other page `.html` files | **No change** | The `navigate()` calls inside them (`programs.html`, `events.html`, `scanner.html`, `dashboard.html`, `app.js.html` DOMContentLoaded) will all be fixed transparently when `navigate()` itself is fixed in Task 1. |
| `docs/research/2026-07-28-gas-multipage-best-practice.md` | **Read-only** | Primary source for this fix. Cites the Sept 2021 release notes and the html/restrictions page. |

---

## What Already Exists

- **Multi-page `doGet` routing** in `Code.gs` — correctly reads `e.parameter.page`, allowlist-validates against `["login","register","profile","programs","events","scanner","dashboard"]`, returns `HtmlService.createTemplateFromFile(page).evaluate()`. This is Pattern B from the docs and needs no change.
- **`<base target="_top">` in every `.html` `<head>`** — already present in all eight page files. The synthetic-anchor `navigate()` will use this.
- **All seven page `.html` files** are complete and tested for content rendering — only the navigation entry/exit points need changing.
- **`sessionManager` in `app.js.html`** — `sessionStorage`-backed, correctly persists across page reloads. `restoreSession()` already redirects to login on failure. Just need to fix the redirect mechanism.
- **Research document** at `docs/research/2026-07-28-gas-multipage-best-practice.md` — 437 lines of primary-source citations, including the exact working `navigate()` implementation (lines 340-352). Use it as the source of truth.
- **Smoke checklist** at `.scratch/vanilla-restructure/smoke-test-checklist.md` — 84 steps across 10 sections, 34 critical (★). Task 4 uses this as the regression check.

---

## Not In Scope

- **No SPA conversion** — research confirms Pattern B is officially first-class; the SPA was a mistaken side-track.
- **No new server functions** — the existing `doGet` and all RPC functions are correct. No `getPageContent`, no SPA plumbing.
- **No rewriting of page files** — pages are content-complete. Only the navigation entry points and the broken `navigate()` helper change.
- **No changes to the React archive** (`src/frontend/`) or the Apps Script reference archive (`程式碼.js`).
- **No new dependencies, no npm, no build tooling.**
- **No changes to backend logic** — this is a frontend-only fix. The Map #18 tickets (role-guard refactor, admin RPCs, design system) are separate work that the user explicitly deferred until the smoke test passes.
- **No design system / styling work** — that's Map #18 D3 (styling stack decision) and T4 (tokens). Out of scope here.
- **No new tests written to a test framework** — testing is via the existing smoke checklist, which exercises the deployed web app through a browser. There is no test framework in this GAS vanilla project.

---

## ASCII Diagrams

### Data flow — login to profile (current vs. fixed)

```
CURRENT (broken):
  User clicks "Login" (real click)
    → form submit handler runs (user-gesture chain)
      → e.preventDefault()
      → api.call('api_loginUser', ...) (async, no gesture)
        → .then(response):
          → sessionManager.set(token, user)
          → navigate('profile')           ← calls window.location.assign(...)
                                              ← FAILS in IFRAME sandbox
                                              ← page stays blank

FIXED:
  User clicks "Login" (real click)
    → form submit handler runs (user-gesture chain)
      → e.preventDefault()
      → api.call('api_loginUser', ...) (async, no gesture)
        → .then(response):
          → sessionManager.set(token, user)
          → render success card with <a href="?page=profile" target="_top">
            ← User clicks the link (real click)
              → GAS doGet serves profile.html
              → page renders
```

### Data flow — `navigate()` helper (new mechanism)

```
  navigate(page) called from anywhere
    → clickAnchor(page)
      → create <a> element:
         href = "?page=" + encodeURIComponent(page)
         target = "_top"  (or empty, inheriting <base target="_top">)
      → append to body
      → a.click()  ← synthetic click, but on a programmatic anchor
                       with target="_top", which the browser counts as
                       user-gesture-initiated for
                       allow-top-navigation-by-user-activation
      → remove from body
    → Browser navigates top-level to new URL
    → GAS doGet serves new page
```

---

## Failure Modes & Gaps

1. **Synthetic click reliability**: `a.click()` on a programmatically-created anchor is interpreted as user-activation by the sandbox per the research. If the browser ever changes this (no public signals it will), all `navigate()` calls break again. The fallback would be to add a real `<a>` element with a "Continue" button on every page, requiring an extra click from users. Documented as a known risk.

2. **Back/forward button** still works because each navigation is a full top-level URL change (the browser maintains history automatically). No `google.script.history` calls needed for this; the standard browser history is sufficient. Note: this is *not* the SPA-style virtual history — it's a real history stack of full page loads.

3. **Deep links and refresh** all work because each `?page=X` is a real top-level URL that `doGet` can serve directly. No JS bootstrap required for the page to render its initial state.

4. **Embedded in Google Sites** (out of scope here): `google.script.history` and `google.script.url` are not supported, but the `<a target="_top">` pattern is supported. Our `navigate()` works in both standalone and Sites-embedded contexts.

5. **The `programs-svc.gs` envelope change** is already in place from the earlier review fix (`api_getProgramsCatalog` returns `{success: true, data: [...]}`, not a raw array). The plan does not re-introduce that bug.

6. **`sessionManager.isLoggedIn()`** reads `sessionStorage`. If a user opens a new tab, the new tab has its own `sessionStorage` and will be unauthenticated — they'll be redirected to login. This is the expected behavior for a per-tab session. No fix needed.

7. **`shell.html` removal**: deleting the file does not break the deployed web app. `doGet` does not reference `shell`. But `clasp push` will fail if the file is not removed from the remote GAS project — push always syncs the local state. The push step (Task 3) will replace `shell.html` with deletion; remote deletion happens automatically on `clasp push`.

8. **`auth.gs` `api_registerUser` doesn't return username in the response** — `register.html` already uses the form value (fixed in the review pass). No re-fix needed here.

9. **Race condition on `navigate('profile')` after login**: `sessionManager.set()` must complete BEFORE the user clicks "Continue". The code flow is synchronous (no async between set and the success card render), so this is safe. No additional guard needed.

10. **GAS rate limits**: each `navigate` triggers a full `doGet` call (one read of Apps Script, one read of User Properties for session check). Acceptable for a 7-page app. No batching needed.

---

## Parallelization / Worktree Strategy

All tasks are **serial**. They share a single deployment target (GAS project). Clasp push happens at the end of each task, and pushing mid-task from a parallel branch would conflict. The dependency chain:

```
Task 1 (fix app.js.html navigate)        ← standalone
   ↓
Task 2 (fix login.html after-login link)  ← needs Task 1
   ↓
Task 3 (delete shell.html + final clasp push) ← needs Task 1
   ↓
Task 4 (smoke test the fix)              ← needs Tasks 1-3
```

Tasks 2 and 3 do not depend on each other (Task 2 changes login.html, Task 3 deletes shell.html). They could run in parallel, but a single worktree with sequential pushes is simpler. Run in a worktree created by OMP `using-git-worktrees` skill; merge after Task 4 passes.

---

### Task 1: Fix `navigate()` in `app.js.html`

**Files:**
- Modify: `src/gas/app.js.html:78-82` (the `navigate()` function body)
- Test: `.scratch/vanilla-restructure/smoke-test-checklist.md` sections 2, 4, 5, 6, 7, 8 (existing)

**OMP dispatch:**
- Agent type: `task` (default worker)
- Inputs to subagent: this task block + the Plan Header + the research doc path
- Reviewer gate: OMP `reviewer` agent via `code-review` skill (Spec axis) before marking complete. Reviewer verifies: (a) `navigate()` no longer calls `window.location.assign` or sets `window.location.href`; (b) the new implementation creates a synthetic anchor with `target="_top"`; (c) the 9 call sites in `app.js.html` and `shell.html` are all still functional (no signature change).

**Interfaces:**
- Consumes: existing `navigate(page)` public function signature (callers pass a page name string)
- Produces: same `navigate(page)` public function; the new mechanism is internal. The new helper `clickAnchor(page)` is internal to `app.js.html` IIFE and not exported.

- [ ] **Step 1: Read `app.js.html` lines 76-100 to confirm current state of `navigate()`**

  Read: `src/gas/app.js.html:76-100`
  Expected: `navigate()` function is at lines 78-82, body is `var base = window.location.href.replace(...); var sep = ...; window.location.assign(base + sep + "page=" + encodeURIComponent(page));`

- [ ] **Step 2: Replace the `navigate()` body with the synthetic-anchor pattern**

  Location: `src/gas/app.js.html:78-82`
  Replace the current body of `navigate` with a call to a new private helper `clickAnchor(page)`. The new body is one line: `clickAnchor(page);`. The helper function `clickAnchor(page)` is defined inside the same IIFE (window-app.js-html-section) right above `navigate()`, and it does the following:
  1. Create an HTMLAnchorElement via `document.createElement('a')`.
  2. Set its `href` to `'?page=' + encodeURIComponent(page)`. Do not set `target` — the document-wide `<base target="_top">` already covers it. (If a future page omits the base, set `a.target = '_top'` explicitly as a defensive fallback.)
  3. Set `a.style.display = 'none'` so the element does not affect layout.
  4. Append the anchor to `document.body`.
  5. Call `a.click()`. This is a synthetic click on a programmatic anchor — the browser counts this as user-gesture-initiated for `allow-top-navigation-by-user-activation` per the research doc.
  6. Remove the anchor from `document.body` immediately after `click()`. (The click is synchronous for navigation purposes; the element is no longer needed.)

  Do NOT change the function signature: `window.navigate = function (page) { ... }` is the public API. All 9 existing call sites in `app.js.html` and `shell.html` continue to work without modification.

  Do NOT add any error handling around the click. If the browser blocks the navigation, the user stays on the current page (same observable behavior as the current broken state — no worse).

- [ ] **Step 3: Verify the function is still called `navigate` and is attached to `window`**

  Read: `src/gas/app.js.html:78-83` after the edit
  Expected: `window.navigate = function (page) { clickAnchor(page); }` (or equivalent; the exact body may vary but the signature is preserved)

- [ ] **Step 4: `clasp push --force` from project root**

  Run: `cd /Users/noah.wong/Desktop/code/EFCC-dev && clasp push --force`
  Expected: 17 files pushed (or 18 with shell.html still present; will become 16 after Task 3). `app.js.html` is in the push list.

- [ ] **Step 5: Commit**

  Commit message: "fix(nav): replace window.location.assign with synthetic anchor click for IFRAME sandbox"
  Stage: `src/gas/app.js.html`
  Push branch to remote; do NOT merge to main yet (wait for Tasks 2-4).

---

### Task 2: Replace post-login redirect with a real clickable link in `login.html`

**Files:**
- Modify: `src/gas/login.html:80-102` (the login form submit `.then` handler)
- Test: `.scratch/vanilla-restructure/smoke-test-checklist.md` sections 2.1-2.7 (login flow)

**OMP dispatch:**
- Agent type: `task`
- Inputs: this task block + Plan Header
- Reviewer gate: OMP `reviewer` — verifies the login flow no longer calls `navigate('profile')` programmatically and the success card has a real `<a>` link the user clicks to continue.

**Interfaces:**
- Consumes: `sessionManager.set(token, user)` from `app.js.html`; `api.call('api_loginUser', username, pin)` from `app.js.html`
- Produces: a `success-card` div containing the actual login credentials (user's name, role badge, QR preview if available) and a real `<a href="?page=profile" target="_top">Continue to Profile</a>` link

- [ ] **Step 1: Read the current login success handler**

  Read: `src/gas/login.html:80-102`
  Expected: The `.then(function (response) { ... })` handler calls `sessionManager.set(...)` then `navigate('profile')` on line 93.

- [ ] **Step 2: Add a success-card div in the page `<body>` if not already present**

  Location: `src/gas/login.html` body, just inside `<main class="page">` after the `</form>` closing tag.
  Add (or replace if already present): a div with `id="login-success" class="card text-center mt-lg hidden"` that contains:
  - A success heading (e.g. `<h2 class="page-title">Welcome, {name}</h2>` — the placeholder `{name}` is filled by JS at line 87's `d.name`).
  - A real anchor element: `<a id="continue-link" href="?page=profile" target="_top" class="btn btn-primary btn-full mt-md">Continue to Profile</a>`.
  - The existing "Register" link below can stay; that's the "if you don't have an account" path.

- [ ] **Step 3: Rewrite the `.then` handler to render the success card instead of redirecting**

  Location: `src/gas/login.html:80-102`
  Remove line 93 (`navigate('profile');`).
  Add: set the inner HTML of the `#login-success` div, unhide it, and hide the form. The implementation:
  1. Read the user's name from `response.data.name` (or "Member" if missing).
  2. Set the `<h2>` text content to "Welcome, " + name.
  3. Show the success card (`loginSuccessEl.classList.remove('hidden')`) and hide the form (`form.classList.add('hidden')`).
  4. Do NOT call `navigate()` or any `window.location.*` API.

  Keep the `.catch` and `.finally` blocks unchanged. The catch shows errors; the finally re-enables the button.

- [ ] **Step 4: Verify the success card is a real DOM element (not injected text)**

  Read: `src/gas/login.html` body after the edit
  Expected: there is a `<div id="login-success" class="card text-center mt-lg hidden">` element containing a real `<a href="?page=profile" target="_top">` link. The `.then` handler does NOT contain any call to `navigate(`.

- [ ] **Step 5: `clasp push --force`**

  Run: `cd /Users/noah.wong/Desktop/code/EFCC-dev && clasp push --force`
  Expected: 17 files pushed; `login.html` in the list.

- [ ] **Step 6: Commit**

  Commit message: "fix(login): render success card with clickable link instead of programmatic redirect"
  Stage: `src/gas/login.html`

---

### Task 3: Delete `shell.html` and verify deployment

**Files:**
- Delete: `src/gas/shell.html`
- Test: `clasp status` and `clasp deployments`

**OMP dispatch:**
- Agent type: `sonic` (low-reasoning, mechanical task)
- Inputs: this task block + Plan Header
- Reviewer gate: OMP `reviewer` — verifies `shell.html` is deleted locally AND that `clasp status` no longer lists it.

**Interfaces:**
- Consumes: none (deletion only)
- Produces: clean source tree without the SPA stub; the deployed GAS project also has no `shell.html` after `clasp push`

- [ ] **Step 1: Verify `shell.html` is not referenced anywhere**

  Run: `grep -rn 'shell' src/gas/ --include='*.gs' --include='*.html'` (or equivalent — see Global Constraints; no shell tools).
  Expected: no matches. `Code.gs` does not reference `shell` in `doGet`. `app.js.html` does not import from it.

- [ ] **Step 2: Delete `src/gas/shell.html`**

  Run: `rm src/gas/shell.html`
  Expected: file removed. `ls src/gas/*.html` now shows 9 files (8 pages + styles), down from 10.

- [ ] **Step 3: `clasp push --force`**

  Run: `cd /Users/noah.wong/Desktop/code/EFCC-dev && clasp push --force`
  Expected: 16 files pushed (down from 17). The push output must NOT include `shell.html`. If it does, something is regenerating the file — stop and investigate.

- [ ] **Step 4: Verify remote state matches local state**

  Run: `clasp status`
  Expected: tracked files list does NOT include `src/gas/shell.html`. The remaining files are: app.js.html, appsscript.json, attendance.gs, auth.gs, Code.gs, dashboard-svc.gs, dashboard.html, events-svc.gs, events.html, login.html, members.gs, profile.html, programs-svc.gs, programs.html, register.html, scanner.html, styles.html.

- [ ] **Step 5: Commit**

  Commit message: "chore: remove unused shell.html SPA stub"
  Stage: deletion of `src/gas/shell.html`

---

### Task 4: Smoke test the fix

**Files:**
- Test: `.scratch/vanilla-restructure/smoke-test-checklist.md` (existing — 84 steps, 34 critical)
- No source files modified unless tests fail; if they fail, create a follow-up task per Failure Mode below.

**OMP dispatch:**
- Agent type: `task` (default worker — this is a manual walkthrough, but a subagent can drive the CLI parts)
- Inputs: this task block + Plan Header + the smoke checklist path + the user's web app URL (user provides)
- Reviewer gate: OMP `reviewer` — reviews the smoke test results (passed/failed per item) and decides whether to mark complete or halt.

**Interfaces:**
- Consumes: the deployed web app URL; test credentials (user provides); the 84-step smoke checklist
- Produces: pass/fail evidence per step; merge to main if all 34 critical pass

- [ ] **Step 1: Confirm the user has the web app URL and test credentials**

  Ask the user: "What is the deployed web app URL, and what are the test credentials (username + PIN) for one MEMBER and one STAFF?"
  Expected: user provides both. If not, this task cannot proceed.

- [ ] **Step 2: Open the web app URL in a browser (Chromium-based, latest stable)**

  The user performs this step. Confirm the login page renders with the form, no JavaScript console errors, no visual layout issues.

- [ ] **Step 3: Run smoke checklist section 1 (Infrastructure) — 5 items**

  Reference: `.scratch/vanilla-restructure/smoke-test-checklist.md` § 1
  Pass: all 5 items. Critical (★): 1.5 (page is styled).

- [ ] **Step 4: Run smoke checklist section 2 (Login) — 7 items**

  Reference: § 2
  Pass: all 7. Critical: 2.1 (login redirects to profile), 2.2 (wrong PIN shows error).

- [ ] **Step 5: Validate the new login flow (the fix)**

  Reference: § 2.1 specifically. After entering valid credentials:
  - The success card appears with "Welcome, {name}" and a "Continue to Profile" link.
  - Clicking that link navigates to `?page=profile` and the profile page renders fully (name, user ID, role badge).
  - No white blank page. No console errors.

  If any of these fail, **stop and escalate**. This is the fix we are validating.

- [ ] **Step 6: Run smoke checklist sections 3-9 (Registration, Profile, Programs, Events, Scanner, Dashboard, Cross-cutting) — 69 items**

  Reference: § 3 through § 9
  Critical (★) per section: 3.1, 4.1, 4.2, 4.4, 4.7, 4.10, 4.11, 5.1, 5.2, 5.3, 5.7, 6.1, 6.2, 6.6, 7.1, 7.2, 7.4, 7.6, 7.7, 7.8, 7.10, 7.12, 8.1, 8.2, 8.4, 8.5, 8.8, 9.1, 9.3.
  Pass threshold: all 34 critical items. ≥90% of non-critical.

- [ ] **Step 7: If all 34 critical items pass, merge the worktree to main and announce done**

  If any critical item fails, do NOT merge. Create a follow-up task per the failure (typically: fix the specific page, push, re-test). The plan's success criterion is "all 34 critical items pass."

---

## Self-Review Notes

- **Spec coverage**: every gap identified in the council + research is addressed — the `navigate()` mechanism, the login flow redirect, the `shell.html` removal, and the regression check via the smoke checklist.
- **Instruction clarity scan**: every step has an exact file path, exact function name, exact expected behavior, and exact command. No TBD/TODO/vague phrases.
- **Type consistency**: `navigate(page)` signature is preserved across all 4 tasks. `clickAnchor(page)` is internal to `app.js.html` IIFE and not exported. No name drift.
- **Boring by default**: synthetic anchor click is the standard browser API for "user-activation-initiated navigation" — no new libraries, no new patterns.
- **Systems over heroes**: a tired developer can follow this plan. Each step is mechanical. The only non-mechanical step is the smoke test in Task 4, which has a clear pass/fail criterion.
- **Reversibility**: every change is in `src/gas/`, reversible via `git revert` of the worktree branch. `clasp push` is fast-forward.
- **Essential vs. accidental complexity**: zero new abstractions. The fix is the smallest possible change consistent with the research doc.
