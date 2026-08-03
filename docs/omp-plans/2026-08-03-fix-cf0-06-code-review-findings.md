# CF0-06 Code-Review Findings Fix Plan

> **For OMP workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Dispatch each task as a fresh `task` subagent; gate between tasks with the OMP `reviewer` agent (the `code-review` skill's spec axis).

**Goal:** Resolve all 5 findings from the two-axis review of CF0-06 (#147, commit `eed7a19`): close the generation-guard hole, announce Section loading through the polite live region, make the rendered stale/coalescing tests non-vacuous, and add committed responsive/accessibility checks at 375×812 and 1280×800 against the production route components.

**Architecture:** Move the navigation-generation bump to the top of `GuardedSection.authorize()` so every re-authorization invalidates in-flight requests regardless of branch; announce the authorizing state via the existing `announce()`/`LiveRegion` module; strengthen the two CF0-06 rendered tests; add a second Playwright suite (separate from the GAS `playwright.config.ts`) that serves the built static export locally and drives the real route components with in-browser RPC stubbing — no HtmlService, no Google storage helpers.

**Tech Stack:** React 19 / Next.js 16 static export (`output: "export"`), Vitest 4 + Testing Library (jsdom), Playwright 1.62 (already installed, `playwright install chromium` runs on `postinstall`), tsx, zero new dependencies.

## Global Constraints

- TDD per task: RED (write failing test) → VERIFY RED → GREEN (minimal change) → VERIFY GREEN → commit. Subagents never run formatters/linters — the planner runs `ultracite`/`oxfmt` once at the end.
- **Never** use `--no-verify` / `-n` on `git commit`/`git push` (AGENTS.md). The pre-commit hook runs `ultracite`; if a check would strip or reject required markup, use a line-scoped `eslint-disable-next-line` comment with an explanatory comment — never a config edit, never a hook bypass.
- All user-facing copy comes from `web/lib/copy.ts` (Traditional Chinese); no inline literals in components. Tests may import `COPY` from `web/lib/copy.ts`.
- Exactly one polite live region (`<output role="status" aria-live="polite">` in `web/app/layout.tsx`, wired through `web/lib/live-region.tsx` `announce()`); Spec 074 story 27 requires loading, success, AND error states announced through it.
- Interactive targets ≥44×44 CSS px; active nav state via `aria-current="page"`; visible focus cue required.
- No `console.log`/`debugger` left in modified code.
- Root typecheck covers `tests/e2e/` (`tsc --noEmit -p tests/e2e/tsconfig.json`) — all new e2e files must typecheck.

## File Structure & Changes

- Modify `web/lib/guarded-section.tsx` — generation bump placement + `announce(COPY.nav.loading)` on authorizing.
- Modify `web/lib/app.test.tsx` — 2 new tests (permission-revocation stale discard; live-region announce on authorizing) + strengthen 2 existing CF0-06 tests.
- Create `tests/e2e/serve-static.ts` — zero-dependency static file server for `web/out` (extensionless path → `${path}.html`, content types, no listing).
- Create `tests/e2e/responsive.config.ts` — Playwright config: `testMatch: /responsive\.test\.ts$/`, projects `mobile-375x812` / `desktop-1280x800`, `webServer` = `pnpm --dir web build && pnpm exec tsx tests/e2e/serve-static.ts` on port 4173.
- Create `tests/e2e/responsive.test.ts` — shell responsive/accessibility checks against real routes (`/profile.html`, `/care.html`) with localStorage session seed + `/api/v1/rpc` route interception.
- Modify `package.json` (root) — add script `"test:shell-responsive": "playwright test --config=tests/e2e/responsive.config.ts"`.
- Modify `tests/e2e/README.md` — document the new local suite (no E2E_TARGET_URL, no Google session state).

## What Already Exists

- `web/lib/navigation-controller.ts` — the pure controller seam (generation counter + pending-op map) from `eed7a19`; reused as-is. The defect is its *usage* in `GuardedSection`, not the controller.
- `web/lib/live-region.tsx` — `announce()` + `LiveRegion`; already imported by `app-shell.tsx`, `page.tsx`, `recovery-view.tsx`.
- `web/lib/copy.ts` — `COPY.nav.loading` ("載入中…"), `COPY.error.forbidden` ("您沒有權限執行此操作。"), `COPY.nav.label` ("主要導航"), `COPY.logout.submit` ("登出"), `COPY.restore.restored` — all exist.
- `web/lib/app.test.tsx` fixtures: `BOOTSTRAP`, `VALID_SESSION`, `STAFF_SECTIONS` (includes `care` with `requiresServerAuth: true`), MSW `server.use(http.post("/api/v1/rpc", ...))` pattern, `Promise.withResolvers` deferreds, `vi.waitFor`.
- Playwright + tsx at root; `web/package.json` `build` = `next build` (static export); session persisted in `localStorage` under `efcc_session` (`web/lib/session.ts`) — seedable via `addInitScript`.
- `tests/e2e/playwright.config.ts` (GAS pipeline) stays untouched; the new config is a separate file so the GAS `E2E_TARGET_URL` hard requirement doesn't leak in.

## Not In Scope

- Worker-pool Vitest env bug (`ChaiStyleAssertions` peer drift) — pre-existing, unchanged.
- The 4 pre-existing oxfmt base failures — untouched.
- Nested-task navigation, section content, camera, backend dispatch (ticket's out-of-scope list).
- Running the responsive suite in CI — local script only, per ticket ("checks run against the production route components" — the committed local suite is the deliverable; CI wiring is a separate decision).

## ASCII Diagrams

Race being closed (Task 1):

```
authorize() invocation            in-flight RPC        stale check
─────────────────────────────     ────────────────     ───────────────────
A: care (auth)  gen=g1 ─────────► authorizedNavigate ─► resolves
B: sections revoke care          (A's promise still   isCurrent(g1)?
   → forbidden branch               pending)
   [BUG] no bump: A passes isCurrent → ready resurrects care
   [FIX] bump at authorize top → g2 → A discarded → forbidden stands
```

## Failure Modes & Gaps

- `next build` in `webServer` is slow on first run — `timeout: 240_000`; `reuseExistingServer: !process.env.CI` for local iteration.
- Static export may emit `care.html` and/or `care/index.html` depending on `trailingSlash` defaults — `serve-static.ts` tries `${path}.html` then `${path}/index.html`, so both layouts work.
- Nav `Link` hrefs are `/care` (no extension) — assertions read the `href` attribute; clicks are avoided except where a fallback serves the page.
- `announce` on authorizing may follow the restore announcement in the same region — sequential, acceptable (single polite region).
- If `next build` fails for an unrelated static-export reason, Task 2 reports BLOCKED with the build error rather than working around it.

## Parallelization / Worktree Strategy

Task 1 (`web/lib/guarded-section.tsx` + `web/lib/app.test.tsx`) and Task 2 (`tests/e2e/*` + root `package.json` + README) touch disjoint files — dispatch both in ONE parallel `task` batch. Reviewer gates run after both land: one reviewer on the Task 1 diff (spec axis), one on the Task 2 diff. No shared-file coordination needed; the e2e suite does not assert on Task 1's announce behavior beyond "live region non-empty" (already satisfied pre-fix).

---

### Task 1: Close the generation-guard hole and announce Section loading

**Files:**
- Modify: `web/lib/guarded-section.tsx` (authorize `useCallback`, lines ~39-83)
- Modify: `web/lib/app.test.tsx` (CF0-06 describe block, after the two existing CF0-06 tests)

**OMP dispatch:**
- Agent type: `task`
- Reviewer gate: `reviewer` (spec axis) on the Task 1 diff after the task reports

**Interfaces:**
- Consumes: `announce` from `@/lib/live-region` (module-level function, already exported); `COPY.nav.loading`, `COPY.error.forbidden` from `@/lib/copy`; fixtures `BOOTSTRAP`, `VALID_SESSION`, `STAFF_SECTIONS` in `web/lib/app.test.tsx`; the existing MSW deferred-RPC pattern in that file's CF0-06 tests.
- Produces: `GuardedSection.authorize` bumps the generation on EVERY invocation (before the `getSection` lookup); authorizing transition announces `COPY.nav.loading`.

- [ ] **Step 1: Write the failing permission-revocation test (RED)**

In `web/lib/app.test.tsx`, inside the existing `describe("CF0-06: stale-response discard and coalescing", ...)` block, add:

Test name: `"revoked permission discards an in-flight authorization response"`.
Test intent: an authorization RPC that started before the user's permission was revoked must not resurrect the section when it resolves.
Setup (copy the existing CF0-06 test patterns): MSW `server.use(http.post("/api/v1/rpc", ...))` that, for `body.action === "authorizedNavigate"`, increments a `calls` counter and returns `deferred.promise.then((d) => HttpResponse.json({ success: true, requestId: "r-1", data: d }))` with `deferred = Promise.withResolvers<{ authorized: boolean }>()`; any other action returns the 400 `MALFORMED_REQUEST` problem+json (same as the existing tests).
Flow:
1. `render(<AppProvider bootstrap={{ ...BOOTSTRAP, sections: STAFF_SECTIONS }} session={VALID_SESSION} onSignOut={() => {}}><GuardedSection sectionKey="care"><p>care content</p></GuardedSection></AppProvider>)`; assert `screen.getByText(COPY.nav.loading)` is in the document (authorizing).
2. `rerender` the SAME `GuardedSection` position with `sectionKey="care"` unchanged but `bootstrap={{ ...BOOTSTRAP, sections: STAFF_SECTIONS.filter((s) => s.key !== "care") }}` (care removed from permitted sections — new array identity so the `authorize` memoized callback is recreated and the effect re-runs). Assert `screen.getByText(COPY.error.forbidden)` is in the document.
3. `deferred.resolve({ authorized: true })`; then `await vi.waitFor(() => { expect(screen.queryByText("care content")).not.toBeInTheDocument(); })`.
4. Assert `screen.getByText(COPY.error.forbidden)` is STILL in the document, and `calls` is exactly 1.
Expected: FAIL on current code — the stale response passes `isCurrent` (generation never bumped by the forbidden branch) and flips the state to `ready`, rendering "care content" and removing the forbidden view.

- [ ] **Step 2: Run the new test to verify it fails**

Run: `pnpm --dir web exec vitest run --config vitest.components.config.ts lib/app.test.tsx -t "revoked permission"`
Expected: FAIL (the "care content" assertion or the forbidden-still-present assertion fails).

- [ ] **Step 3: Write the failing live-region announce test (RED)**

Same describe block, add:

Test name: `"section authorization loading is announced through the live region"`.
Test intent: while a Section is authorizing, the single polite live region announces `COPY.nav.loading`.
Flow: MSW handler for `authorizedNavigate` returns a pending `deferred.promise.then(...)` (never resolved within the test). Render the same care/STAFF_SECTIONS wrapper as the existing tests. Then query the live region element with `container.querySelector('output[role="status"]')` and assert `expect(...).toHaveTextContent(COPY.nav.loading)`.
Follow the file's existing convention for announcements that fire inside effects (check how the existing restore/login announcement tests wrap `announce`-driven state updates — use `act` from `react` exactly as those tests do, including around the initial `render` if the existing pattern requires it).
Expected: FAIL on current code (no announce call in `GuardedSection`; region is empty).

- [ ] **Step 4: Run the announce test to verify it fails**

Run: `pnpm --dir web exec vitest run --config vitest.components.config.ts lib/app.test.tsx -t "is announced through the live region"`
Expected: FAIL (live region text is empty / does not contain `COPY.nav.loading`).

- [ ] **Step 5: Implement the GREEN changes in `web/lib/guarded-section.tsx`**

1. Add `import { announce } from "@/lib/live-region";` to the imports (alphabetical with the other `@/lib` imports).
2. In the `authorize` `useCallback`: move `const gen = ctrlRef.current.nextGeneration();` from inside `if (section.requiresServerAuth) { ... }` to the FIRST statement of the callback body, before `const section = getSection(bootstrap.sections, sectionKey);`. Every invocation — auth branch, non-auth ready branch, missing-section forbidden branch — must invalidate any in-flight request from a prior invocation. Do not duplicate the call; there is exactly one `nextGeneration()` call left in the file.
3. In the auth branch, next to `setState({ kind: "authorizing" });`, add `announce(COPY.nav.loading);` so the async loading transition is announced (Spec 074 story 27; criterion 6). The `forbidden` and `error` branches need no announce — they render `RecoveryView`, which already announces on mount.
4. Do NOT change `navigation-controller.ts`, the loading/forbidden/error JSX, or any other file.

- [ ] **Step 6: Run both new tests to verify they pass**

Run: `pnpm --dir web exec vitest run --config vitest.components.config.ts lib/app.test.tsx -t "CF0-06"`
Expected: PASS (permission-revocation test, announce test, and the two existing CF0-06 tests).

- [ ] **Step 7: Strengthen the existing stale-response rendered test**

In the existing test `"stale authorizedNavigate response is discarded (generation mismatch)"`, after `deferred1.resolve({ authorized: true })` and the existing assertion that `care content` is absent, add the missing positive assertions so the test is not tautological: assert `screen.getByText(COPY.nav.loading)` is still in the document AND `screen.queryByText("scanner content")` is null (the current route stays loading; the stale completion cannot surface scanner content early). Keep the existing `deferred2.resolve(...)` + `vi.waitFor(scanner content)` tail. Expected: PASS on current code (mountedRef covers the cross-route case) — this makes the user-visible invariant explicit.

- [ ] **Step 8: Make the coalescing rendered test deterministic**

In the existing test `"duplicate rapid authorizations for same section coalesce to one RPC"`, change the rerender so a second authorization provably starts while the first is pending:
1. Rerender with `bootstrap={{ ...staffBootstrap, sections: [...STAFF_SECTIONS] }}` (new array identity, same content) — this guarantees the `authorize` callback is recreated and the effect re-runs even if `onSignOut` were ever memoized upstream.
2. After the rerender, assert `screen.getByText(COPY.nav.loading)` is still in the document (a second authorization entered the pending path).
3. Keep `deferred.resolve(...)`, the `vi.waitFor` on content, and `expect(callCount).toBe(1)`.
Expected: PASS on current code (the second `run()` coalesces onto the pending promise) — the test now explicitly exercises two authorizations while pending. Add a short comment above the rerender: "new sections identity forces authorize() to re-run while the first request is pending".

- [ ] **Step 9: Run the full component suite and typecheck**

Run: `pnpm --dir web exec vitest run --config vitest.components.config.ts` — expected 93 passed (91 + 2 new), 0 failures.
Run: `pnpm --dir web exec tsc --noEmit -p tsconfig.json` and `pnpm typecheck` — expected clean.

- [ ] **Step 10: Commit**

Commit message: "fix(shell): bump navigation generation on every authorize and announce section loading"
Stage: `web/lib/guarded-section.tsx` and `web/lib/app.test.tsx`
Do NOT use `--no-verify`. If the pre-commit hook rejects a change, fix the code/comments per the Global Constraints — never bypass the hook.

---

### Task 2: Responsive and accessibility checks at 375×812 / 1280×800

**Files:**
- Create: `tests/e2e/serve-static.ts`
- Create: `tests/e2e/responsive.config.ts`
- Create: `tests/e2e/responsive.test.ts`
- Modify: `package.json` (root, `scripts`)
- Modify: `tests/e2e/README.md`

**OMP dispatch:**
- Agent type: `task`
- Reviewer gate: `reviewer` (spec axis) on the Task 2 diff after the task reports

**Interfaces:**
- Consumes: `web/out` produced by `pnpm --dir web build` (static export); `web/lib/copy.ts` `COPY` (importable — pure module, no web-only imports); the real route components `web/app/profile/page.tsx` (contains the Sign Out button) and `web/app/care/page.tsx` (auth-gated via `GuardedSection`); session localStorage key `efcc_session`; RPC endpoint `POST /api/v1/rpc`.
- Produces: `pnpm test:shell-responsive` (Playwright, 2 viewport projects), static server on port 4173.

- [ ] **Step 1: Create the static server `tests/e2e/serve-static.ts`**

Zero-dependency Node server (~50 lines, run via tsx):
- Port from `process.env.PORT ?? 4173`; root `path.resolve(import.meta.dirname, "../../web/out")`; host 127.0.0.1.
- `node:http` request handler: decode URL pathname; never traverse outside root (`path.normalize` + prefix check). Resolve order: exact file → if pathname has no extension, `${pathname}.html` → if ends with `/`, `${pathname}index.html`. 404 plain text otherwise.
- Content types: `.html` → `text/html; charset=utf-8`, `.js` → `text/javascript`, `.css` → `text/css`, `.svg` → `image/svg+xml`, `.json` → `application/json`, `.woff2` → `font/woff2`, `.png`/`.ico` → `image/png`/`image/x-icon`, else `application/octet-stream`. No directory listing, no caching headers needed.
- Log a one-line startup banner to stdout ("serving web/out on http://127.0.0.1:4173") so Playwright readiness can observe the port.

- [ ] **Step 2: Create `tests/e2e/responsive.config.ts`**

Playwright config:
- `testDir: "."`, `testMatch: /responsive\.test\.ts$/` (so the GAS suite's files are excluded), `timeout: 30_000`, `retries: 1`, `fullyParallel: false`, `workers: 1`, `reporter: [["list"]]`.
- `use.baseURL: "http://127.0.0.1:4173"` — NO `E2E_TARGET_URL` requirement, NO storageState, NO GAS URL validation (this suite must not depend on HtmlService or Google session state).
- `webServer`: `{ command: "pnpm --dir web build && pnpm exec tsx tests/e2e/serve-static.ts", url: "http://127.0.0.1:4173", reuseExistingServer: !process.env.CI, timeout: 240_000 }`.
- Two projects: `{ name: "mobile-375x812", use: { viewport: { width: 375, height: 812 } } }` and `{ name: "desktop-1280x800", use: { viewport: { width: 1280, height: 800 } } }`.

- [ ] **Step 3: Create `tests/e2e/responsive.test.ts`**

Imports: `test, expect` from `@playwright/test`; `COPY` via relative import `import { COPY } from "../../web/lib/copy";`.

Shared fixtures at module level:
- `BOOTSTRAP`: a full `Bootstrap`-shaped object — `session` with non-empty `userId/name/role/qrCodeString/sessionId/sessionToken`; `profile` with all seven fields non-empty; `sections` exactly: `{ key: "profile", label: COPY.sections.profile, capability: "READ", requiresServerAuth: false }`, `{ key: "programs", label: COPY.sections.programs, capability: "READ", requiresServerAuth: false }`, `{ key: "care", label: COPY.sections.care, capability: "AUTH", requiresServerAuth: true }`.
- `SESSION` for localStorage: `{ userId: "u1", sessionId: "s1", sessionToken: "t1" }`.

`test.beforeEach`:
1. `page.addInitScript` that sets `localStorage.setItem("efcc_session", JSON.stringify(SESSION))` (defined inline in the script, since `SESSION` is a Node-scope value — stringify inside the init script body).
2. `page.route("**/api/v1/rpc", ...)`: read the request body JSON; if `action === "restoreApp"` → `route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, requestId: "r-1", data: BOOTSTRAP }) })`; if `action === "authorizedNavigate"` → `{ success: true, requestId: "r-2", data: { authorized: true } }`; otherwise `route.fulfill({ status: 400, contentType: "application/problem+json", body: JSON.stringify({ status: 400, code: "MALFORMED_REQUEST", title: "Bad request" }) })`.

Helper: `const isMobile = (project: string) => project.startsWith("mobile");` — read `testInfo.project.name`.

Tests (each runs in both projects — use `testInfo.project.name` for viewport-conditional expectations; all must pass at BOTH viewports unless stated):

1. `"bottom nav below 768px, side rail at or above 768px"` — `goto("/care.html")`; mobile: `.nav-phone` visible, `.nav-desktop` hidden; desktop: inverse. Use `expect(page.locator(".nav-phone")).toBeVisible()` / `.toBeHidden()`.
2. `"no horizontal overflow at the target viewport"` — `goto("/profile.html")`, then `goto("/care.html")`; after each, `expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()`.
3. `"bottom nav reserves safe-area inset"` — `goto("/care.html")`; `page.evaluate` over `document.styleSheets` (recursively collect `cssRules`, stringify each `cssText`) and return whether any rule text contains `"safe-area-inset-bottom"`; expect truthy (the CSS contract exists; computed value is 0 without a notch).
4. `"nav targets are at least 44x44 and keyboard reachable with a visible focus cue"` — `goto("/profile.html")`; for the VISIBLE nav only (`.nav-phone` on mobile, `.nav-desktop` on desktop): every `.nav-item` link `boundingBox()` must be non-null and `width >= 44 && height >= 44`. Then `page.keyboard.press("Tab")`; expect `document.activeElement` to be a `.nav-item` and `getComputedStyle(document.activeElement).outlineWidth !== "0px"` (focus-visible cue — real keyboard focus matches `:focus-visible`).
5. `"active section exposes aria-current and the nav has an accessible label"` — `goto("/care.html")`; the visible nav (`nav[aria-label="主要導航"]` — assert the label equals `COPY.nav.label`) contains exactly one `[aria-current="page"]` link and its `href` attribute is `/care`; the other visible nav contains exactly one `[aria-current="page"]` too (both rails render the same sections).
6. `"exactly one polite live region announces shell status"` — `goto("/care.html")`; `expect(page.locator('output[role="status"][aria-live="polite"]')).toHaveCount(1)`; its `textContent` is non-empty (restore/nav announcements land there).
7. `"primary controls are at least 44x44"` — `goto("/profile.html")`; the Sign Out button (`getByRole("button", { name: COPY.logout.submit })`) is visible with `boundingBox()` `width >= 44 && height >= 44`.

- [ ] **Step 4: Verify the suite fails meaningfully before the fix (optional but recommended)**

Run: `pnpm --dir web build` then `pnpm exec playwright test --config=tests/e2e/responsive.config.ts`
Expected: the suite itself passes (the shell already satisfies these invariants; this is a verification harness, not a TDD red — TDD red applies to Task 1). If ANY test fails, investigate the shell/CSS before proceeding: criterion 4/5/6 failures indicate a real gap to fix in Task 1 or a follow-up — report it, don't weaken the assertion.

- [ ] **Step 5: Wire the script and document the suite**

1. Root `package.json` scripts: add `"test:shell-responsive": "playwright test --config=tests/e2e/responsive.config.ts"` (keep existing scripts unchanged).
2. `tests/e2e/README.md`: add a section "## Local shell responsive suite" explaining: runs `pnpm test:shell-responsive`; builds the static export and serves it locally on 4173; no `E2E_TARGET_URL`, no Google session state, no HtmlService dependency (per CF0-06 criterion 7); two viewport projects (375×812, 1280×800); in-browser RPC stubbing via Playwright route interception; `web/out` and the built assets are ephemeral.

- [ ] **Step 6: Run the full verification set**

Run: `pnpm test:shell-responsive` — expected 14 passed (7 tests × 2 projects), 0 failures.
Run: `pnpm typecheck` — expected clean (new files compile under `tests/e2e/tsconfig.json`).
Run: `pnpm --dir web test:components` — expected 93 passed (unchanged by this task, but confirm).

- [ ] **Step 7: Commit**

Commit message: "test(e2e): add responsive and accessibility checks for the production shell"
Stage: `tests/e2e/serve-static.ts`, `tests/e2e/responsive.config.ts`, `tests/e2e/responsive.test.ts`, `package.json`, `tests/e2e/README.md`
Do NOT use `--no-verify`. If the pre-commit hook rejects something (e.g. formatting), fix per Global Constraints — never bypass the hook.

---

## Final Gate (planner, after both tasks)

1. Run `pnpm --dir web exec vitest run --config vitest.components.config.ts` (93), `pnpm test:gas` (240), `pnpm typecheck`, `pnpm --dir web exec tsc --noEmit -p tsconfig.json`.
2. Run `pnpm exec ultracite check` and `pnpm exec oxfmt --check` on the branch-touched files only (4 pre-existing base failures remain out of scope); format branch files if needed via `pnpm exec ultracite fix` / `pnpm exec oxfmt` and amend a style commit (never `--no-verify`).
3. Dispatch the OMP `code-review` skill: two `reviewer` agents in one batch on `62ffcc1...HEAD` (Standards axis + Spec axis vs issue #147 criteria 1, 2, 3, 4, 5, 6, 7). Acceptance: both READY; BLOCKED findings become follow-up commits in the same plan.
4. Push `feat/qr-scan` and report the per-finding resolution to the user.

---

## Follow-up: first final review (BLOCKED → fixed, re-review pending)

Both reviewers returned BLOCKED; all findings fixed as follow-up commits (see below). Re-review on `62ffcc1...HEAD` (now includes the follow-ups) is dispatched at the end of this plan.

### Standards axis (final-standards) — 2 findings, both fixed

- [x] **P2 — Unique op token for pending cleanup** (`web/lib/navigation-controller.ts`): `cancelPending(key)` + immediate `run` at the same generation let the cancelled op's `finally` delete the replacement entry, so a later duplicate would start an extra request. Fixed: per-run `op` counter in the pending map; cleanup compares `pending.get(key)?.op === op`. Regression test: "late-settling cancelled op never evicts the newer pending op" (`navigation-controller.test.ts`).
- [x] **P2 — Platform-neutral root containment** (`tests/e2e/serve-static.ts`): `${ROOT}/` prefix check breaks on Windows separators. Fixed: `path.relative(ROOT, candidate)` containment + `decodeURIComponent` guarded with try/catch.

### Spec axis (final-spec) — 2 findings, both fixed

- [x] **P2 — Criterion 4 partial: outlet reserves fixed 60px, not nav height + inset** (`web/app/globals.css`): `.shell` padding-bottom is now `calc(60px + env(safe-area-inset-bottom, 0))`; e2e "bottom nav and page outlet reserve safe-area inset" asserts the outlet rule as well as the nav rule.
- [x] **P1 — Criterion 5 partial: login form targets unverified / below 44px** (`web/app/page.tsx`): both username and PIN inputs now have `min-height: 44px`. e2e additions: "login form controls are at least 44x44" (AUTH_REQUIRED stub → login route, measures username/PIN/submit) and "recovery retry control is at least 44x44" (503 stub → RecoveryView retry).

### Verification after follow-ups

- [x] `pnpm --dir web build` ✓
- [x] `pnpm --dir web exec vitest run --config vitest.components.config.ts` → 103/103
- [x] `pnpm test:shell-responsive` → 18/18 (14 original + 2 new tests × 2 viewports)
- [x] `pnpm typecheck` (root incl. `tests/e2e/tsconfig.json`) ✓
- [x] `pnpm --dir web exec tsc --noEmit -p tsconfig.json` ✓
- [x] `pnpm test:gas` → 240/240
- [x] `pnpm exec ultracite check` on the 8 changed files ✓

### Re-review

- [ ] Dispatch both reviewers on `62ffcc1...HEAD` and record verdicts here.
