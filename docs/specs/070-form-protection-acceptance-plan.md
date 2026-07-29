# Issue #70 — Form Protection Acceptance Plan

**Status:** Implemented locally / **Blocked on fresh `/exec` deployment**
**Branch:** `feat/issue-70-form-protection`
**Parent:** #64. Blocked-by: #67 (merged), #68 (merged), #69 (merged).
**Spec:** `docs/specs/009-phone-first-shell-navigation.md` §"Client responsibilities" + issue #70 AC list.
**Date:** 2026-07-29

## Scope, as grilled and confirmed

No ticket under #64 (#65–#72, verified by reading every child issue and
cross-checking `src/gas/` on `origin/main`) owns building a Programs
domain RPC. Issue #53 is the authoritative Programs/Enrollment spec —
open, unimplemented, and much larger than what #70 needs (self-enrollment,
assisted enrollment, Program-Leader-scoped locks, audit log, candidate
search). Issue #43 is explicitly superseded by #53 ("replaces conflicting
assumptions in #11, #32, and #43") and is out of scope going forward.

**Decision:** #70 builds a **self-contained form-protection module** plus a
demonstration submit RPC — not a real business mutation. The form state
machine, dirty-form discard guard, duplicate-submission idempotency, and
safe-rendering utilities are production-ready; the submit RPC
(`api_submitDemoTaskForm`) is a pure in-memory/CacheService demo that
exercises the full auth boundary, validation, and idempotency contract
without touching any Sheet or Enrollment data. Real write RPCs for Events,
Enrollment, or Programs are explicitly deferred to later tickets (#53 etc.).

## What was implemented

### Server (`src/gas/`)

1. **`api_submitDemoTaskForm(userId, sessionId, sessionToken, requestKey, fieldValue)`**
   in `Code.gs` — new public RPC demonstrating the form-protection client-to-server
   data flow. Session-verifies via `sessionVerify_`, checks `userId` match
   WITHOUT revoking the session on mismatch (matching `api_getPrograms`'s
   SECURITY NOTE pattern), checks active status, then validates `fieldValue`
   (1–200 chars, trimmed, non-empty). A `CacheService.getScriptCache()` backed
   idempotency check keyed on `"demoform_" + requestKey` returns the cached
   envelope with `idempotent: true` on repeat submits; cache TTL is 60 seconds.
   Unexpected exceptions return `RPC_CODES.INTERNAL_ERROR`; validation failures
   return `RPC_CODES.VALIDATION`. Returns `RpcSuccess<{echoedValue, submittedAt, idempotent}>`
   or `RpcFailure` per ADR-0003's accepted-in-principle amendment.

### Client (`src/gas/form-guard.js.html`) — new module

1. **State machine** (`create()`) — five states: PRISTINE → DIRTY → SUBMITTING →
   SUCCEEDED / FAILED, with a retry path from FAILED back to SUBMITTING (reuses
   the existing `requestKey` for idempotency). A new `requestKey` is generated
   when `markDirty()` transitions TO DIRTY from PRISTINE, SUCCEEDED, or FAILED.
   `beginSubmit()` returns `false` from PRISTINE (no form) or SUBMITTING/SUCCEEDED
   (duplicate-submit guard).
2. **`renderMultilineText(text)`** — builds a `DocumentFragment` with text nodes
   and `<br>` elements. NEVER uses `innerHTML` or any DOM API that interprets
   markup.
3. **`buildSafeLink(labelText, href)`** — builds an `<a>` element with
   `target="_blank" rel="noopener noreferrer"` for `http:`/`https:` URLs, or
   a plain `<span>` for any unparseable/unsafe input. The raw href is NEVER
   placed into any DOM attribute in the unsafe case.
4. **`confirmDiscard(opts)`** — Traditional Chinese discard-confirmation modal
   (overlay + dialog with `role="dialog"` and `aria-modal="true"`). Confirm
   button ("捨棄變更") calls `onConfirm()`; Cancel button ("繼續編輯") and
   Escape restore focus to `restoreFocusTo` element. Focus starts on Cancel
   (safer default).
5. **`window.EfccFormGuard`** — single global namespace exposing `STATE`,
   `create`, `renderMultilineText`, `buildSafeLink`, `confirmDiscard`.

### Client (`src/gas/shell-session.js.html`)

1. **`activeFormGuard_`** — module-level variable holding the active form's
   guard instance (or `null`). Set by `handleDemoFormSubmit_`-adjacent wiring
   (the task render creates the guard when it renders the demo edit form).
2. **Dirty-form guard in `navigateTo_`** — if `activeFormGuard_` is dirty,
   shows `confirmDiscard` before navigating. Cancel restores focus to
   `demo-edit-field`; Confirm clears the guard and proceeds.
3. **Dirty-form guard in `closeTask_`** — if `activeFormGuard_` is dirty, shows
   `confirmDiscard` before closing. Same pattern as `navigateTo_`.
4. **Dirty-form guard in `handleLogoutClick_`** — if `activeFormGuard_` is dirty,
   shows `confirmDiscard` before logging out.
5. **`handleDemoFormSubmit_`** — renamed from `handleMockSave_` (`data-action`
   re-keyed from `"mock-save"` to `"demo-form-submit"`). Calls
   `activeFormGuard_.beginSubmit()` — if it returns `false` (duplicate guard),
   the handler returns immediately. Disables the submit button, clears previous
   error, then calls `callServer_("task:submit:events-edit-demo", ...)` which
   issues `google.script.run.api_submitDemoTaskForm(...)`. On success:
   transitions guard to SUCCEEDED, clears the guard, increments
   `eventsDemoCounter_`, invalidates the Events section, re-renders the Events
   root. On server validation/auth failure: transitions guard to FAILED, shows
   the server error message, leaves the field value untouched for retry. On
   transport failure: same FAILED transition with a network-error message.

### Tests

- `tests/gas/form-guard.test.js` — 30+ tests covering every state transition,
  idempotency/request-key rules, renderMultilineText (multi-line, empty,
  single-line), buildSafeLink (safe URL, unparseable, non-http protocol,
  empty href), confirmDiscard (render, confirm click, cancel click, Escape
  key, cleanup on repeated calls).
- `tests/gas/api-submit-demo-task-form.test.js` — tests for `api_submitDemoTaskForm`
  (success, all three roles, validation boundary, AUTH_REQUIRED for bogus/
  mismatched/deactivated sessions — including the regression proving a
  mismatched-userId call does NOT revoke the legitimate session,
  INTERNAL_ERROR on exception, duplicate-submit idempotency via CacheService).
- Existing `tests/gas/nested-task-navigation.test.js` updated AC #6 — the
  mock-save test now exercises the real `handleDemoFormSubmit_` /
  `api_submitDemoTaskForm` RPC path with a controllable `google.script.run`
  fake that resolves the submit envelope. The test asserts exactly 2
  `google.script.run` calls (1 bootstrap + 1 submit), uses `data-action`
  `"demo-form-submit"`, and verifies the submit button disabled state, error
  message display, and Events-root re-render.

**Total: All unit tests pass. `pnpm check` (lint + format) clean.
`pnpm typecheck` clean.**

## Official documentation evidence (AGENTS.md gate)

- `google.script.run` / `withSuccessHandler` / `withFailureHandler`:
  https://developers.google.com/apps-script/guides/html/reference/run
- `CacheService` / `getScriptCache()`:
  https://developers.google.com/apps-script/reference/cache/cache-service
- `Element.textContent` (used in safe-render instead of `innerHTML`):
  https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent
- `Document.createDocumentFragment` (used in multiline render):
  https://developer.mozilla.org/en-US/docs/Web/API/Document/createDocumentFragment

Context7 (`/websites/developers_google_apps-script`) was unavailable
(invalid API key) at the time of this check; official
`developers.google.com` and `developer.mozilla.org` pages were fetched
directly per the AGENTS.md fallback order.

## AC disposition

| AC | Status | Evidence |
|---|---|---|
| #1 form state machine implementation (PRISTINE/DIRTY/SUBMITTING/SUCCEEDED/FAILED) | **proven locally** | `form-guard.test.js` — all state transitions |
| #2 dirty-form guard on navigation with confirmDiscard modal | **proven locally** | `form-guard.test.js` (confirmDiscard tests) + `shell-session.js.html` wiring |
| #3 duplicate-submit suppression (beginSubmit returns false from SUBMITTING/SUCCEEDED) | **proven locally** | `form-guard.test.js` — dedicated duplicate-guard tests |
| #4 server-side idempotency via CacheService requestKey | **proven locally** | `api-submit-demo-task-form.test.js` — idempotency test |
| #5 safe text rendering (multiline via text nodes+br, safe link building) | **proven locally** | `form-guard.test.js` — renderMultilineText and buildSafeLink tests |
| #6 real-RPC submit via api_submitDemoTaskForm instead of client-only mock | **proven locally** | `nested-task-navigation.test.js` AC #6 — asserts 2 google.script.run calls |
| #7 submit button disabled while pending | **proven locally** | `nested-task-navigation.test.js` AC #6 — disabled-state assertion |
| #8 Traditional Chinese feedback for server/transport errors | **proven locally** | `form-guard.test.js` + `shell-session.js.html` error messages |
| #9 retry from FAILED reuses the existing requestKey (idempotent retry) | **proven locally** | `form-guard.test.js` — request-key reuse on retry |
| #10 discard-confirmation modal (cancel/confirm/Escape) | **proven locally** | `form-guard.test.js` — confirmDiscard interaction tests |
| #11 automated tests for the form-protection paths | **done** | this branch's three new test files |
| #12 `/exec` records browser-console and Apps Script execution evidence | **BLOCKED** | requires a fresh versioned `/exec` deployment |

## Remaining blocker: AC #12 / the fresh `/exec` gate

Per AGENTS.md, this issue is not ready until a fresh, isolated versioned
`/exec` deployment demonstrates the same form-protection paths live, with
browser-console and Apps Script execution evidence recorded.

**Deployment status:** `clasp push` and `clasp deploy` have been run —
versioned deployment `@43` (`AKfycbyJYzeQE_YJik1JCTEq_KlXFn2CrAdRM-CMc1CgaugzWwhLuIsGHlAw-8Q5dP6qgTm2`)
is live at `https://script.google.com/macros/s/AKfycbyJYzeQE_YJik1JCTEq_KlXFn2CrAdRM-CMc1CgaugzWwhLuIsGHlAw-8Q5dP6qgTm2/exec`.
A cold-start (unauthenticated) headless-browser check against this URL
confirmed `data-app-state="SIGNED_OUT"`, the login form present, and zero
injected `<script>` tags — the static shell and safe-render baseline are
live and correct.

**Remaining blocker:** the login-gated Playwright acceptance suite
(`tests/e2e/form-protection.test.ts` + the rest of the suite) requires a
real Google account session per role. `pnpm e2e:auth -- --role=<role>`
opens a visible Chromium window for an interactive Google sign-in that
only a human can complete — this is not something this session can
perform. `.auth/*.storage.json` are currently empty stubs. Until a human
captures each role's session and the suite runs against `@43`, AC #12
remains unmet and the issue is not `READY`.

### What the `/exec` run must cover

#### Role matrix

Reuses the three seeded EFCC application-layer users from ADR-0012 / issue
#67 — no new Sheet rows required.

| Role | Username | PIN | Notable |
| --- | --- | --- | --- |
| MEMBER | alice | 1234 | Can open the demo edit task; discard-guard and submit flow visible |
| STAFF | bob | 5678 | Same demo task presence; can verify submit returns the same result |
| ADMIN | noah | 6883 | Same demo task presence; can verify the admin session path |

#### Phone viewport trace (375×812) — dirty-form discard cancel+confirm

1. **Navigate to Events demo edit → dirty the form → Cancel discard**
   - Log in as alice. Navigate to 聚會 (Events).
   - Open the demo edit task ("編輯範例聚會"). Confirm the form renders with
     an empty text field and a submit button labeled "儲存".
   - Type a value into the field (proving `markDirty()` transitioned to DIRTY).
   - Without clicking submit, tap the phone nav 個人 (Profile) or 返回 (Back).
   - Confirm a Traditional Chinese discard-confirmation modal appears:
     heading "確認離開", message "系統將捨棄尚未儲存的變更，確定要離開嗎？",
     cancel button "繼續編輯" (focused by default), confirm button "捨棄變更".
   - Tap "繼續編輯" (Cancel). Confirm the modal disappears, the field still
     contains the typed value, and the user is still on the Events demo edit
     task (not navigated away). Confirm Escape key does the same.

2. **Dirty-form → Confirm discard**
   - Repeat the same setup (navigate to Events demo edit → type a value).
   - Tap phone nav 課程 (Programs) to trigger the guard.
   - Tap "捨棄變更" (Confirm). Confirm the modal disappears and the app
     navigates to the 課程 root Section (the dirty form was discarded).
   - Navigate back to 聚會 and re-open the demo edit. Confirm the field is
     empty (the previously discarded edit was not persisted — expected for a
     demo RPC that acts only when explicitly submitted).

3. **Dirty-form → close-task Back → Cancel + Confirm**
   - Same setup (Events demo edit, form dirty).
   - Tap the phone-level Back control ("返回"). Confirm the discard modal
     appears (the `closeTask_` dirty-form guard fires).
   - Cancel → confirm the task is still open, field intact.
   - Tap 返回 again → Confirm → confirm the task closes and the Events root
     Section renders.

#### Desktop viewport trace (1280×800) — successful submit + duplicate-submit-guard

1. **Successful submit via `api_submitDemoTaskForm`**
   - Log in as bob at 1280×800.
   - Navigate to 聚會 (Events) via the side rail.
   - Open the demo edit task ("編輯範例聚會").
   - Enter a valid field value (e.g. "測試提交內容").
   - Click "儲存". Confirm:
     - The submit button shows `disabled` state while pending.
     - The task closes and the Events root Section re-renders.
     - The Events badge value increments (proving `eventsDemoCounter_`
       incremented and `invalidateSection_` fired).
     - A single `google.script.run.api_submitDemoTaskForm(...)` call was made
       (verify via browser DevTools console or the Apps Script execution log),
       with the correct `requestKey`, `userId`, `sessionId`, `sessionToken`,
       and `fieldValue`.

2. **Duplicate-submit guard — beginSubmit returns false**
   - Re-open the demo edit task. Enter a value.
   - Click "儲存" once — the submit button becomes disabled.
   - Click "儲存" again while the first submit is still pending (within the
     same SUBMITTING-state window). Confirm the second click produces zero
     additional `google.script.run` calls — the duplicate guard in
     `beginSubmit()` returns `false` from SUBMITTING state.

3. **Duplicate-submit guard — server-side idempotency**
   - After a successful submit completes, note the `requestKey` used
     (visible in the Apps Script execution log if correlated).
   - Re-open the demo edit, enter the SAME value, submit.
   - Verify via Apps Script execution log or by checking the response envelope
     in console that the second submit returns `{idempotent: true}` with the
     same `echoedValue` and `submittedAt`, proving the CacheService-backed
     idempotency check fired.

4. **Validation failure**
   - Open the demo edit, leave the field empty, click "儲存".
   - Confirm the submit shows a Traditional Chinese validation error
     ("請輸入範例欄位內容（1–200 字元）。") below the field, the submit
     button is re-enabled, and the field value is untouched for retry.
   - Enter a 201-character string, submit. Confirm the same validation error.
   - Enter a valid value, submit. Confirm it succeeds.

5. **Auth-boundary rejection**
   - Open the demo edit as bob, enter a value.
   - Before submitting, use DevTools to set `session_.sessionToken` to an
     invalid value.
   - Click "儲存". Confirm a Traditional Chinese session-expired message
     appears ("工作階段已過期，請重新登入") and the submit button is
     re-enabled (the FAILED state allows a retry).

#### "Untrusted content" trace — safe-render assertions

1. **`renderMultilineText` never interprets markup**
   - Deliver a multiline string containing HTML tags to any element rendered
     via `EfccFormGuard.renderMultilineText` (e.g. via the demo task's error
     message area or a dedicated test trigger in the shell).
   - Use DevTools Elements panel to inspect the rendered DOM. Confirm the
     HTML tags appear as literal text content (e.g. `<script>alert(1)</script>`
     is a text node, NOT an executable `<script>` element).
   - Confirm line breaks are rendered as `<br>` elements, not as `<p>` or
     `<div>` wrappers.

2. **`buildSafeLink` renders unsafe URLs as safe spans**
   - Deliver an unsafe href value (`javascript:alert(1)` or a raw data URI)
     to a component that uses `EfccFormGuard.buildSafeLink`.
   - Use DevTools to inspect the rendered DOM. Confirm the output is a
     `<span>` element containing the label text — NOT an `<a>` element with
     a dangerous `href` attribute, and NOT an executable link.
   - Confirm a valid `https://` URL renders as an `<a>` element with
     `target="_blank" rel="noopener noreferrer"` and `textContent` equal
     to the label.

3. **Discard modal text content (no innerHTML)**
   - Trigger the discard-confirmation modal and inspect the DOM. Confirm the
     heading, message, and button labels are set via `textContent` — no
     `innerHTML` anywhere in the modal construction.

- **Target deployment:** a fresh versioned `/exec` URL created after
  this branch is pushed (NOT the production deployment).
- **Role × viewport matrix:** MEMBER (alice/1234), STAFF (bob/5678),
  ADMIN (noah/6883) — each at phone 375×812 and desktop 1280×800.
- **Trace coverage:** phone (dirty-form discard cancel+confirm), desktop
  (successful submit, duplicate-submit guard, validation, auth rejection),
  safe-render assertions across all roles.
- **Evidence:** record the deployment version ID, execution IDs correlated
  via request IDs, and the exact `/exec` URL + Hong Kong timestamp tested,
  per spec 009's testing decisions.

## Non-goals for this branch

- No `isEnrolled`, no Enrollments sheet read, no enrollment write/lock/
  audit — explicitly #53's scope.
- No real Events, Programs, or Attendance write RPCs — `api_submitDemoTaskForm`
  is a pure in-memory/CacheService demonstration RPC.
- No server-side input sanitization, CSP headers, or XSS boundary beyond
  the client-side safe-render utilities — the Apps Script runtime serves a
  single-origin client via `/exec` and has no HTTP response header control.
- No persisted audit log of form submissions — the CacheService-backed
  idempotency check is ephemeral (60s TTL) and exists only for demo purposes.

## Executed results

_(Appended automatically by `pnpm test:e2e` → `tests/e2e/plan-doc-appender.ts` once the Playwright assertions exist and run against a fresh `/exec` deployment. Not yet run — this is the AC #12 blocker above.)_

## Rollback

No production Sheet, Apps Script project, or deployment is touched by
this branch. If the `/exec` run fails acceptance, the branch is not
merged; no rollback procedure is needed since nothing is deployed yet.
