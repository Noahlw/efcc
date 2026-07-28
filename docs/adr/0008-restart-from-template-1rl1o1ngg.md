# ADR-0008 — Full Rebuild on Template-Derived SPA Architecture (Template ID: 1rl1oS1nggq-WJ-D1dk_Ddn0N8mgTdCdXenl797vZ8q42kuemaI15XVFE)

- **Status**: Accepted
- **Deciders**: Noah Wong, OMP planner (grill-with-docs, ceo-review)
- **Date**: 2026-07-28
- **Supersedes**: ADR-0007 (vanilla multi-page HTML Service architecture)
- **Related**: ADR-0006 (RBAC/Program Leader model — unchanged), ADR-0009 (audit log write pattern), CONTEXT.md

## Context

The existing `src/gas/` codebase (17 files, built across 7 Wayfinder tickets) uses a `?page=` query-string multi-page routing model with a synthetic-anchor + meta-refresh navigation fallback for IFRAME sandbox compatibility. The user identified a GAS template (script ID `1rl1oS1nggq-WJ-D1dk_Ddn0N8mgTdCdXenl797vZ8q42kuemaI15XVFE`) using a different architecture — an SPA shell with server-rendered HTML fragments injected via DOM mutation, never via navigation — and directed a full rebuild on that pattern, adding a bottom-tab-bar chrome for mobile.

## Premise Correction (evidence-scoped)

An earlier browser-driven smoke test (see git history — this ADR's prior revision) checked only static HTML content of the login page: form present, `<base target="_top">` present, the string `navigate("profile")` present in script text. **It never submitted real credentials, never observed a response from `api_loginUser`, and never confirmed an actual login → profile transition.** The user then reported the login/navigation flow **still fails when tested from the correct deployment URL**, directly contradicting the earlier "verified working" claim.

**What this evidence supports**: the login → profile navigation path in the current `src/gas/` build is demonstrated broken.

**What this evidence does NOT support**: no claim about the correctness of `programs.html`, `scanner.html`, `dashboard.html`, `events.html`, or `care`-related code — those paths were never exercised in this session and have no supporting or contradicting evidence either way. The rebuild decision below is not justified by "the whole app is broken"; it is justified by (a) the demonstrated login/navigation defect, (b) the user's independent architectural preference for the template's pattern, and (c) the user's explicit choice (CEO Review, Approach 3) to treat `程式碼.js` as sole source of truth rather than inherit any part of the current build.

## Decision

Full rebuild of `src/gas/` on the template's SPA-shell + DOM-swap architecture, reimplementing all domain logic from `程式碼.js` (not from the current `src/gas/`). This was deliberated via `ceo-review`: three approaches were presented (minimal client-only rewrite reusing current server files; hybrid diff-audit; full cathedral reimplementation); the user selected the cathedral approach and Mode 2 (Selective Expansion — bulletproof baseline, then explicit opt-in cherry-picks).

## Locked Decisions (Grill Sessions 1–5 + CEO Review)

| # | Question | Choice |
|---|----------|--------|
| 1.1 | Scope of restart | **A** — Schema-driven (preserve domain glossary/ADRs, adopt template's architecture) |
| 1.2 | Analysis depth | **A** — Deep dive first (full file read + codebase-memory walkthrough) |
| 1.3 | Branch + rollout | **A** — Hard cutover (single merge, clean) |
| 1.4 | Pre-rebuild navigation fix | **Reverted** — user directed cloning the template before any fix attempt |
| 2.1 | Navigation diagnosis method | **A** — Browser smoke test. **Scope-corrected**: verified static HTML only, not an end-to-end login. Superseded by the rebuild. |
| 3.1 | Architecture | **B** — Template's SPA shell + DOM-swap fragments (no URL routing) |
| 3.2 | UI chrome | **C** — Hybrid: sidebar (desktop ≥768px) + bottom tab bar (mobile <768px) |
| 3.3 | Chrome content rules | **A** — Show all pages the user has any access to (RBAC filter at render time) |
| 3.4 | Login flow | **A** — Template's pattern + EFCC fields (username + PIN, not email + password) |
| 3.5 | Rebuild scope | **A**, reconfirmed under CEO Review Approach 3 — reimplement from `程式碼.js`, discard current `src/gas/` entirely (server + client) |
| 4.1 | Fragment file naming | **A** — Bare names, corrected to 5 real pages during implementation: `profile.html`, `programs.html`, `events.html`, `scanner.html`, `care.html` (a phantom 6th "dashboard" page was in the original scaffold and menu logic; verified during T02/T06 wave prep against `docs/specs/007` and `程式碼.js` that "dashboard" was never a distinct feature — the old build's `dashboard.html`/`dashboard-svc.gs` files are literally the Pastoral Care Dashboard under an old name. T05 (issue #46) was closed as a duplicate of T06 (#47); `Code.gs`'s `SPA_FRAGMENT_ALLOWLIST_` and `auth.gs`'s `EFCC_MENU_PAGES_` corrected to 5 entries.) |
| 4.2 | Port scope | **C**, reconfirmed under CEO Review Approach 3 — port all 48 `程式碼.js` functions, then audit and prune |
| 5.1 | Audit log write pattern | **C** — single `writeAuditLog()` helper + `LockService` (see ADR-0009) |
| 5.3 | Asset strategy | **B** — `styles.html` kept as a separate file, included via `<?!= include('styles'); ?>` |

## Architecture Summary

- **Server**: `doGet(e)` always returns `login.html` (no query-string routing). A `loadPage(name)` function returns rendered HTML strings for fragments (`profile`, `programs`, `events`, `scanner`, `dashboard`, `care`) via `HtmlService.createTemplateFromFile(name).evaluate().getContent()` — `name` is validated against a server-side allow-list of the 6 known fragment names before the template lookup, to prevent arbitrary file reads.
- **Client**: `login.html` is the only top-level page. After a successful login, `document.open(); document.write(html); document.close();` swaps in `main.html` (the shell). The shell renders sidebar (desktop) and bottom tab bar (mobile); both call the same `loadMenuPage(name, el)`, which fetches a fragment via `loadPage()` and injects it into `#main-content`, then re-executes any `<script>` tags and calls the fragment's `initXxx()` convention function.
- **Auth**: `localStorage` JSON blob with token + expiry (client-side check per template) — cross-checked against a server-side session validation call (naming and shape TBD in spec).
- **RBAC**: server returns only the pages a user can access; chrome renders exactly those. Fragments re-check role in `initXxx()` (defense in depth) per ADR-0006's matrix.
- **Audit**: privileged mutations call `writeAuditLog()` twice — `ATTEMPT` before the mutation, `SUCCESS`/`ERROR` after — sharing one `Correlation_ID`, inside `LockService.getScriptLock()` (ADR-0009). This does not achieve cross-write atomicity (Sheets has none); it makes failures reconstructable instead of silently invisible or falsely successful.

## Domain Sources

- **Sheet schema**: per `CONTEXT.md` (Users, Programs, Enrollments, Events, Attendance, Program_Leaders, Audit_Log) — unchanged; ADR-0009 adds `Outcome`, `Correlation_ID`, `Actor_Session_Key` columns to `Audit_Log`.
- **RBAC matrix**: per ADR-0006 — unchanged.
- **Domain functions**: reimplement all 48 from `程式碼.js`, not the current `src/gas/`.

## Bulletproof Baseline — Exit Criteria

Per CEO Review Mode 2, the baseline must pass this smoke test before any cherry-pick expansion work begins. All steps run against a **freshly deployed** `/exec` URL (not `/dev`), with a real test-account credential (not a code inspection):

1. Load the deployment `/exec` URL → login form renders.
2. Submit real test-account username + PIN → `api_loginUser`-equivalent server call returns success → client stores session → `main.html` shell renders (sidebar on desktop viewport, bottom tabs on mobile viewport).
3. Each of the 6 fragments (`profile`, `programs`, `events`, `scanner`, `dashboard`, `care`) loads via `loadMenuPage()` without a blank screen, script error, or infinite spinner — verified per-fragment, not just the initial one.
4. RBAC is enforced: a MEMBER-role test account does not see `dashboard`/`scanner`/`care` in chrome; a STAFF-role test account does.
5. Logout clears the session and returns to `login.html`; a subsequent direct hit on the `/exec` URL does not auto-restore the cleared session.
6. Refreshing (F5) while on `main.html` with a valid session does not trap the user on a permanently blank or permanently-login page — it may show the documented brief login flash (ADR-0008 Consequences), but must resolve back to `main.html` within a few seconds.
7. At least one privileged action (e.g. approve a pending member) writes a correctly-shaped `Audit_Log` row per ADR-0009's schema, verified by reading the sheet directly.

**Only after all 7 steps pass** does the baseline count as "bulletproof," and cherry-pick expansions (see below) become eligible for review.

## Scope Boundaries (Non-Goals)

- Do NOT keep the current `src/gas/`'s `?page=` multi-page routing.
- Do NOT keep the `navigate()` machinery (synthetic anchor + meta-refresh fallback) — irrelevant under DOM-swap.
- Do NOT keep per-page `restoreSession()` — folded into `login.html` and `main.html`.
- Do NOT introduce new libraries or build tooling beyond what the template already uses.

## Consequences

- Positive: architecture is IFRAME-sandbox-safe by construction (DOM mutation, never navigation).
- Positive: modular fragments; bottom-tab mobile UX; RBAC enforced at chrome-render and fragment-load.
- Positive: `程式碼.js` reimplementation with the exit-criteria smoke test removes the "unverified inherited code" uncertainty entirely, rather than carrying it forward.
- Negative: reimplementing 48 functions is significant work with real translation-error risk.
- Negative: no URL-based deep-linking; refresh briefly flashes `login.html` even with a valid session.
- Risk: `LockService.getScriptLock()` serializes all privileged writes across all users — acceptable at EFCC's expected concurrency, not a scalable pattern beyond it.

## Cherry-Pick Expansions (CEO Review Mode 2 — NOT committed, presented to user for individual opt-in)

These live in chat, not as ADR commitments, until the user explicitly opts in per item:

1. End-to-end login verification harness (real credentials, browser-observed, before cutover).
2. Formal diff-audit: `程式碼.js`'s 48 functions vs. current `src/gas/` implementations (informational).
3. Per-function TDD suite for all 48 reimplemented functions.
4. Explicit rollback trigger criteria (when to revert to deployment `@7`).
5. Blind-spot `reviewer` subagent pass on this ADR before implementation starts.
6. URL-hash-based deep-linking, layered on top of the DOM-swap model without changing it.