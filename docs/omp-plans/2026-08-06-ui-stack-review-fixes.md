# UI Stack Review Fixes Implementation Plan

> **For OMP workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Dispatch each task as a fresh `task` subagent; gate between tasks with the OMP `reviewer` agent (the `code-review` skill's Spec axis).
>
> **This plan fixes the 14 final-report findings + spec-grounded interim findings from the two-axis review** (StandardsReviewerLuna + SpecReviewerLuna, run 2026-08-06 on luna) of the stacked UI PRs #202–#205 (tickets #193–#196, spec #191).

**Goal:** Make the stacked UI branch (ui-01…ui-04) pass the two-axis review: fix all fourteen final-report findings plus the spec-grounded interim ones, verify with the real Cloudflare-deployment E2E, and close the loop on PR #205.

**Architecture:** All fixes land as new commits on **`ui-04-196`** (top of the stack; the chain is linear so a single tip covers every file). Backend fixes harden the D1 `db.batch` credential-change transaction (guards + status predicate + changes-check), add a Problem-Details outer catch and Idempotency-Key contract to the Worker boundary; client fixes implement S15 role-gated sections, S16 immediate sign-out on `sessionRevoked`, a real scannable QR, S13 forbidden states, 44px touch targets, and exact 079 copy; a D1 migration retires `Teacher`. The final task deploys to Cloudflare and runs the authenticated Playwright suite against the fresh deployment (AGENTS.md updated to make the Cloudflare deployment the E2E authority).

**Tech Stack:** Cloudflare Worker + D1 (`web/worker.ts`, strict-mode TS), Next static export (`web/app/`), Vitest (unit + real-D1 workerd integration), Playwright (`tests/e2e/`), `qrcode` (new, only new dependency), wrangler for deploy.

## Global Constraints

Copy-pasted from the founding documents; every task implicitly obeys these:

- **079 §2 (line 32, 45):** focus ring MUST be token `--focus: #176a87` (never a literal); all interactive elements maintain `min-height: 44px`.
- **079 §S3 (line 69):** registration submit button reads `提交註冊申請` (exact); "fits within phone screen height without overflow"; inputs ≥44px.
- **079 §S5 (line 71):** role tag MUST read `Member / Staff / Admin`; QR code is a **centered 220×220px square**, `aspect-ratio: 1/1`, `alt`/ARIA; profile fits 667px phone screen **without page scroll** (`scrollHeight <= offsetHeight`).
- **079 §S13 (line 79):** 403 state = alert block `您沒有權限執行此操作。` + secondary action `返回個人檔案`; action ≥44px; `role="alert"`.
- **079 §S15 (line 81):** "Unauthorized Sections are omitted from navigation; direct links still receive server authorization."
- **079 §S16:** `sessionRevoked` transitions the client to signed-out **immediately** (login surface shows `帳戶資料已更新，請重新登入。` — copy exists in `web/lib/copy.ts:46`).
- **ADR-0018 §5/§9:** every error envelope is RFC 9457 `application/problem+json` with `requestId`; responses carry `X-Request-Id` (server-generated); §8: **every mutating action sends an `Idempotency-Key`** (loginUser, logoutUser, and the new username/password changes; reads do NOT).
- **ADR-0020 §1.1:** credential changes are one **atomic batch**; uniqueness rejects collisions with accounts + registration requests, including concurrent updates; audited without credential material; both changes revoke all refresh sessions.
- **ADR-0025 (line 5):** canonical roles `Admin / Staff / Member`; `Teacher` retired as stored+API value (migration + enforcement, not display-only).
- **No new dependencies beyond `qrcode`** (+ `@types/qrcode` devDep).
- Every task commits separately; commit messages follow the repo's `fix(web):` / `feat(web):` / `test(...)` conventions; zh-Hant UI copy only.

## File Structure & Changes

| File (all under `web/` unless noted) | Change | Task |
|---|---|---|
| `app/profile/account-settings.tsx` | remove 900ms delay + mountRef cancel; immediate sign-out handoff | 1 |
| `lib/auth/account-settings.ts` | batch guards (`account_status='Active'`, `username_normalized=?`), changes===0 paths, guarded password audit/revoke | 2 |
| `worker.ts` | outer try/catch → RFC9457 500 envelope (+ tests) | 3 |
| `lib/api.ts` (`authFetch`) | Idempotency-Key on mutating calls (login/logout/changeUsername/changePassword) | 4 |
| `lib/sections.ts` | `ROLE_SECTIONS` matrix + `sectionsForRole(role)` | 5 |
| `lib/session.ts` (`buildBootstrap`) | filter sections by `user.role` | 5 |
| `app/profile/page.tsx` / `app/profile/settings/page.tsx` | move `<AccountSettings/>` to its own route | 6 |
| `app/profile/settings/page.tsx` (new) | the moved settings surface | 6 |
| `lib/qr-code.tsx` (new) + `package.json` + `pnpm-lock.yaml` | SVG QR renderer (`qrcode`) | 7 |
| `app/profile/profile.module.css` | `.qrSquare` width: 220px (no `min()`) | 7 |
| `app/profile/account-settings.module.css` | focus ring → `var(--focus)` | 8 |
| `app/auth.module.css`, `lib/approval-queue.tsx`, `lib/registration-copy.ts` | 44px brand/skipLink/back-link; ForbiddenView on 401/403; copy `注册申請` | 9 |
| `lib/approval-queue.tsx` likewise; `lib/forbidden-view.tsx` reuse | S13 | 9 |
| `app/auth.module.css` | trim paddings until S3 667px no-scroll | 10 |
| `migrations/0002_retire_teacher.sql` (new) | data migration; `lib/auth/accounts.ts` import mapping; `handlers.ts` rename | 11 |
| `lib/auth/handlers.ts` | extract `resolveAuthenticatedAccount` (dedup smell) | 12 |
| `AGENTS.md`, `CONTEXT.md`, `tests/e2e/README.md` | Cloudflare-deployment E2E authority | 13 |
| `tests/` (responsive, auth-d1, worker, api, sections, account-settings, approval-queue, registration, qr-code) | regression tests | 1–14 |

## What Already Exists (reuse, don't rebuild)

- `problem()` (RFC 9457 helper) — `web/lib/auth/handlers.ts:106`.
- `authProblemResponse` / `problemResponse` (both emit `X-Request-Id`) — `web/worker.ts:134`.
- Cross-table guarded UPDATE pattern (NOT EXISTS accounts + registration_requests) already in `changeUsername` — extend, don't replace.
- `ForbiddenView` (`web/lib/forbidden-view.tsx`) — props `{ safeHref, onSignOut? }`, copy `您沒有權限執行此操作。` + 返回個人檔案. Reuse it.
- `GuardedSection` — already renders `ForbiddenView` when section absent; only the section list needs to change.
- Real-D1 workerd integration pattern for `account-settings.test.ts`; spy-based race-test precedent.
- `tests/e2e/responsive.test.ts` (mobile 375×812 + desktop 1280×800, Playwright + static export serve), `auth-d1.config.ts`/`auth-d1.test.ts` + `plan-doc-appender.ts` for the fresh-deployment gate.
- Idempotency precedent: `web/lib/registration-client.ts:86,121` already sends keys for register/approve/reject.
- `sessionStorage` key `efcc_account_updated` + login-surface notice (`web/app/page.tsx:156-172`) — already the right signed-out notice mechanism.

## Not In Scope

- Server-side per-section data APIs (sections are static pages; their RPCs are Group 2 ProgramSystem #197–#201).
- A server-side Idempotency-Key dedup store (ADR-0018 §8 as written requires the header on the wire; no D1 dedup table exists — if ADR is read stricter, flag it as a follow-up note, do not build a store here).
- QR **scannability-verification** in E2E (a real scanner test is out of band; unit asserts SVG structure).
- Re-running the luna reviewer on the whole chain (Task 14 re-reviews the final diff via the standard reviewer gate).
- Branch `main` merges / deploy to production (`efcc-prototype-129` dev preview target only per wrangler).

## ASCII Diagrams

### 1. changeUsername atomic batch (target)

```
preflight (handler)  →  requireActiveUser (403 if not Active)
                     →  uniqueness pre-check (409 if dup)        [fast-fail only]
  ┌────────────────────────────  env.DB.batch([...])  ────────────────────────────────┐
  │  1. UPDATE accounts SET username=?/username_normalized=?/updated_at=?             │
  │       WHERE user_id=? AND account_status='Active'                                 │
  │         AND username_normalized=?   (guards: dup NOT EXISTS ×2)                   │
  │  2. INSERT account_events (username_changed, old=?, new=?)                        │
  │       SELECT ... WHERE NOT EXISTS(dup accounts) AND NOT EXISTS(dup requests)      │
  │  3. UPDATE sessions SET revoked_at WHERE user_id=? AND revoked_at IS NULL         │
  │       AND EXISTS(SELECT 1 FROM accounts WHERE user_id=? AND username_normalized=?)│
  └────────────────────────────────────────────────────────────────────────────────────┘
  changes(1) === 0 → throw AccountConflictError (409)   // race or state changed; nothing else ran
```

### 2. sessionRevoked timeline (fix)

```
BEFORE (bug):  response(OK,{sessionRevoked}) → setDone → ⏱900ms → clearAuthHint/…  [window where unmount cancels → revoked shell stays]
AFTER  (fix):  response(OK,{sessionRevoked}) → setDone + sessionStorage.setItem + clearAuthHint + router.replace("/")   [same tick]
```

### 3. Section tree (S15)

```
authMe() → PublicUser{role} → buildBootstrap(user)
                                  └─ sectionsForRole(role) → [authorized Section[]]
NavBar renders bootstrap.sections only              GuardedSection: NOT in list → ForbiddenView (S13)
```

## Failure Modes & Gaps

- **Role/section matrix** is derived from ADR-0005/0006/067, not written in 079: Member = profile, programs; Staff = profile, programs, events, scanner, care; Admin = all six. If 079/prototype defines a wider Member set, adjust in Task 5; the reviewer gate checks this.
- **409 vs 403 on batch changes===0:** both a status race and a name race collapse to one WHERE guard; single changes===0 → 409. A suspended account handled by the entry `requireActiveUser` (403) still precedes the batch; residual race is 409 — documented, acceptable (ADR-0020 requires *atomic rejection*; 409 IS that commitment).
- **D1 batch never throws on 0-change statements** — the guarded audit/revoke (#2) pick up this slack (no side effects on no-op).
- **qrcode is CJS** — Next/pages static export handles CJS; if the worker bundle chokes, import it with `.default` interop. Typecheck via `@types/qrcode`.
- **E2E Task 14 is operator-gated**: requires `AUTH_TARGET_URL` + 5 acceptance secrets (E2E_ account). If unobtainable, the task records the blocker and halts fail-closed (per AGENTS.md, do NOT claim READY without the run).
- **Force-push after fixes** requires explicit user approval (repo rule) — Task 14 end.
- **Migration 0002 on production D1**: `UPDATE accounts SET role='Staff' WHERE role='Teacher'` — reversible (UPDATE back). No account rows created/dropped; user_id/QR fields untouched.

## Parallelization / Worktree Strategy

**Sequential, one worktree (`~/.omp/wt/ui-04-196`).** Tasks 1–12 interlock (all in `web/`, chained commits on one linear branch); parallel branches would break the stack invariants. Task 13 (docs) can overlap Task 12's implementation while it writes; Task 14 (deploy+E2E) is the serial gate at the end. Execution order = 1 → 2 → … → 14; reviewer gate fires between every task (Spec axis: does the diff still implement the named finding's acceptance, quoting the spec line).

---

### Task 1: S16 — immediate signed-out on sessionRevoked

**Finding:** SpecReviewerLuna #4 (P1): `completeChange` waits 900ms; unmount cancels handoff.

**Files:**
- Modify: `web/app/profile/account-settings.tsx` (lines 29, 84-109)
- Test: `web/lib/account-settings.test.tsx`

**OMP dispatch:** Agent `task`; reviewer gate after commit.

**Interfaces:**
- Consumes: `sessionStorage` key `efcc_account_updated` (= `"1"`), `clearAuthHint()`, `router.replace("/")`, existing success state.
- Produces: `completeChange(result)` returns `void`; on `result.sessionRevoked === true` it performs the handoff synchronously in the same async continuation: `setDone()`, `sessionStorage.setItem(ACCOUNT_UPDATED_KEY, "1")`, `clearAuthHint()`, `router.replace("/")`. Delete `REDIRECT_DELAY_MS` and the `mountRef` cancel check entirely (no timer, no cancel path).

- [ ] **Step 1: Write the failing test** — in `web/lib/account-settings.test.tsx`, add: mock `next/navigation` `useRouter` (existing pattern), mock the auth-change fetch to resolve `{ sessionRevoked: true }`, mock `clearAuthHint`. Render the username form, submit, await the fetch resolution, and assert `router.replace` was called with `"/"` AND `sessionStorage.efcc_account_updated === "1"` AND `clearAuthHint` called — **without any fake timers** (old code needs 900ms, so this test fails under the old behavior).
- [ ] **Step 2: Run to verify it fails** — `cd web && pnpm test:components -- account-settings` → expect FAIL (replace not called synchronously).
- [ ] **Step 3: Implement** — remove `REDIRECT_DELAY_MS` + `mountRef`; in the success path of `completeChange`, perform the four handoff calls in order in the same tick as the fetch resolution; keep the success announcement text on the settings form for the brief render before navigation.
- [ ] **Step 4: Verify passes** — same command → PASS.
- [ ] **Step 5: Commit** — `fix(web): transition to signed-out immediately on sessionRevoked (S16)`.

### Task 2: Batch atomicity — Active + old-value guards, changes-check everywhere

**Findings:** SpecReviewerLuna #2 (P1, Active outside batch), #3 (P2, stale audit); StandardsReviewerLuna #3 (P2); interim Active-predicate (P1).

**Files:**
- Modify: `web/lib/auth/account-settings.ts` (`changeUsername` 105-235, `changePassword` 243-296)
- Test: `web/lib/auth/account-settings.test.ts` (real-D1 workerd pattern)

**OMP dispatch:** Agent `task`; reviewer gate.

**Interfaces:**
- Consumes: existing `AccountConflictError`, `AccountStatusError`, `requireActiveUser`, D1 `env.DB`.
- Produces (exact new statement shapes):
  - `changeUsername` UPDATE #1 WHERE adds `AND account_status = 'Active' AND username_normalized = ?` (the expected old value, bound after `user_id`). Audit #2 and revoke #3 keep their guards. After `batch()`, `if (meta[0].changes === 0) throw new AccountConflictError(...)` (existing 409 path now covers status/name races).
  - `changePassword` UPDATE #1 WHERE adds `AND account_status = 'Active'`. Audit #2 becomes `INSERT INTO account_events ... SELECT ... WHERE EXISTS (SELECT 1 FROM accounts WHERE user_id = ? AND credential_hash = ?)` (bound with the NEW hash). Revoke #3 adds the same `EXISTS` predicate. After `batch()`, `if (meta[0].changes === 0) throw new AccountStatusError(...)` (403; only an Active+existing account can reach changes>0).
  - Unchanged: uniqueness NOT EXISTS guards, revoke `revoked_at IS NULL`, `unique|constraint` → `AccountConflictError` catch.

- [ ] **Step 1: Failing tests** (three new cases in `web/lib/auth/account-settings.test.ts`, real D1 fixture): (a) suspension race — spy on the uniqueness helper; inside the spy, `UPDATE accounts SET account_status='Suspended'` before returning; then expect 409/`AccountConflictError` from changeUsername AND zero `account_events` rows AND zero revoked sessions AND stored username unchanged; (b) concurrent name race — two changeUsername calls from the same account to different free names, second must get `AccountConflictError`, and the FIRST audit row must carry the account's original username as `old_username_normalized`; (c) password race — suspend between current-password check and batch; expect `AccountStatusError` (403) with no audit row and no revocation.
- [ ] **Step 2: Run to verify fail** — `cd web && pnpm test -- auth/account-settings` → expect (a)/(b) pass but (c) FAIL (old code has no status guard; it commits), and (a) FAIL if it asserts no-audit on suspension (old code audits).
- [ ] **Step 3: Implement** — apply the two statement-shape changes above + changes===0 branches.
- [ ] **Step 4: Verify** — `cd web && pnpm test` → all pass (full worker suite 151+).
- [ ] **Step 5: Commit** — `fix(auth): in-batch Active + old-username guards, guarded audit/revoke, changes checks`.

### Task 3: Problem-Details outer catch in the Worker

**Finding:** StandardsReviewerLuna #1 (P1): untyped handler errors → raw 500, no RFC 9457, no X-Request-Id.

**Files:**
- Modify: `web/worker.ts` (route dispatch ~227-494)
- Test: `web/worker.test.ts`

**OMP dispatch:** Agent `task`; reviewer gate.

**Interfaces:**
- Consumes: `authProblemResponse` (worker.ts:134-158) — reuse its envelope.
- Produces: an outer `try/catch` around the auth-route dispatch block; catch-all returns `authProblemResponse(500, "INTERNAL", ...)` with `X-Request-Id` present (the helper already sets it); non-auth routes keep their existing behavior; the existing inner proxy `UPSTREAM_UNREACHABLE` catch (442-450) is untouched.

- [ ] **Step 1: Failing test** — in `web/worker.test.ts`: stub a handler (or route the dispatch through a fake that throws `new Error("boom")`), invoke the worker `fetch` with a valid session cookie; assert status 500, `content-type: application/problem+json`, body has `type` containing `#INTERNAL`, and an `X-Request-Id` header is present.
- [ ] **Step 2: Run to verify fail** — `cd web && pnpm test -- worker.test` → expect FAIL (raw 500, no problem JSON).
- [ ] **Step 3: Implement** — wrap dispatch; keep typed errors flowing through the handlers' existing `problem()` calls (the catch only fires on untyped throws).
- [ ] **Step 4: Verify** — `cd web && pnpm test` → all pass; `pnpm typecheck` → exit 0.
- [ ] **Step 5: Commit** — `fix(web): RFC9457 outer error envelope + X-Request-Id on unhandled worker errors`.

### Task 4: Idempotency-Key on every mutating auth call

**Finding:** Standards interim (P1/P2, ADR-0018 §8): `authFetch` sends no key; login/logout never did either.

**Files:**
- Modify: `web/lib/api.ts` (`authFetch` 151-208; `loginUser`, `logoutUser`, `authChangeUsername`, `authChangePassword`)
- Test: `web/lib/api.test.ts`

**OMP dispatch:** Agent `task`; reviewer gate.

**Interfaces:**
- Consumes: `crypto.randomUUID()` (available in browser + workerd).
- Produces: `authFetch(input, init, opts?: { mutating?: boolean })`; when `mutating: true` it generates one fresh UUID per call and sets header `Idempotency-Key`. The four mutating functions pass `mutating: true`; reads (`authMe`, restore, bootstrap) do not. No server-side dedup store (see Not In Scope).

- [ ] **Step 1: Failing tests** — in `web/lib/api.test.ts`: mock `fetch`; assert `loginUser` and `logoutUser` each send a non-empty `Idempotency-Key` header and that two consecutive calls send different keys; assert `authChangeUsername`/`authChangePassword` do too; assert `authMe()` sends none.
- [ ] **Step 2: Run to verify fail** — `cd web && pnpm test -- api.test` → FAIL (no header today).
- [ ] **Step 3: Implement** — the `opts` flag + header injection; update the four call sites.
- [ ] **Step 4: Verify** — same command → PASS; `cd web && pnpm test` all green.
- [ ] **Step 5: Commit** — `fix(web): Idempotency-Key on mutating auth calls (ADR-0018 §8)`.

### Task 5: S15 — role-authorized section list in the bootstrap

**Findings:** SpecReviewerLuna #1 (P1, S15); Standards interim (NavBar shows all sections).

**Files:**
- Modify: `web/lib/sections.ts` (add matrix + filter), `web/lib/session.ts` (`buildBootstrap` 51-53), `web/lib/guarded-section.tsx` (verify only; presence gate already correct)
- Test: `web/lib/sections.test.ts`, `web/lib/app.test.tsx` (NavBar)

**OMP dispatch:** Agent `task`; reviewer gate.

**Interfaces:**
- Consumes: `Section` type (`web/lib/api.ts:80-83`), `PublicUser.role`, existing `defaultSections()`.
- Produces:
  - `ROLE_SECTIONS: Record<Role, SectionKey[]>` — `Member: [profile, programs]`; `Staff: [profile, programs, events, scanner, care]`; `Admin: [profile, programs, events, scanner, care, permissions]` (derived from ADR-0005/0006/067; reviewer gate validates).
  - `sectionsForRole(role: string): Section[]` — filters `defaultSections()` by the matrix; unknown/absent role → `Member` set.
  - `buildBootstrap(user)` returns `sections: sectionsForRole(user.role)`. NavBar + GuardedSection need no change beyond what they consume (they already read the list and GuardedSection already renders ForbiddenView when a section is absent).

- [ ] **Step 1: Failing tests** — in `web/lib/sections.test.ts`: add `sectionsForRole` cases: Admin→6, Staff→5 (no permissions), Member→2 (profile, programs), unknown→Member set. In `web/lib/app.test.tsx`: render AppShell with a `Member` profile and assert the nav does NOT contain 活動/掃描/關懷/權限 targets, and that a direct `GuardedSection` render of `scanner` for a Member shows the ForbiddenView (S13 copy).
- [ ] **Step 2: Run to verify fail** — `cd web && pnpm test -- sections.test` → FAIL (today all roles get 6).
- [ ] **Step 3: Implement** — matrix + `sectionsForRole` + `buildBootstrap` change; update the existing `defaultSections` test name/comment (it says "CF0-04 stand-in").
- [ ] **Step 4: Verify** — `cd web && pnpm test` + `pnpm test:components` → all pass.
- [ ] **Step 5: Commit** — `feat(web): role-authorized sections in bootstrap (S15)`.

### Task 6: AccountSettings to its own route; Profile back inside S5

**Findings:** StandardsReviewerLuna #4 (P1, Profile no-scroll); Spec interim (registration/profile sizing).

**Files:**
- Modify: `web/app/profile/page.tsx` (remove `<AccountSettings/>` line 66; add 帳戶資料 entry button ≥44px), `web/app/middleware.ts` (verify `/profile/settings` covered by the auth guard — extend the prefix list if it's explicit)
- Create: `web/app/profile/settings/page.tsx` (same auth-shell layout as `profile/page.tsx`, renders `<AccountSettings/>`)
- Test: `web/lib/account-settings.test.tsx` (settings page render), `tests/e2e/responsive.test.ts` (no-scroll assertion)

**OMP dispatch:** Agent `task`; reviewer gate.

**Interfaces:**
- Consumes: `AccountSettings` component (unchanged interface), `AppShell` layout pattern from `profile/page.tsx`.
- Produces: route `/profile/settings` reachable only with a valid session (middleware); `profile/page.tsx` no longer imports `AccountSettings`; Profile page content = avatar/name/role/status/QR only.

- [ ] **Step 1: Failing test** — in `tests/e2e/responsive.test.ts` add (mobile 375×812, stubbed `restoreApp` + `authorizedNavigate`): navigate to `/profile`, assert `document.scrollHeight <= document.documentElement.clientHeight` (no page scroll). Also component test: `account-settings.test.tsx` renders when mounted at `/profile/settings`.
- [ ] **Step 2: Run to verify fail** — `pnpm test:shell-responsive` → FAIL (profile scrolls with settings inline).
- [ ] **Step 3: Implement** — new settings page + entry button (44px, copy 帳戶資料) + remove inline settings from profile + middleware check.
- [ ] **Step 4: Verify** — `pnpm test:shell-responsive` → PASS (and existing 10/10 mobile + 10/10 desktop stay green); `cd web && pnpm test:components` → PASS.
- [ ] **Step 5: Commit** — `feat(web): move account settings to /profile/settings, restore S5 profile surface`.

### Task 7: Real scannable QR + fixed 220px slot

**Findings:** StandardsReviewerLuna #5 (P1, QR is text); SpecReviewerLuna #5 (P2, 206px at 375px).

**Files:**
- Modify: `web/package.json` (+`qrcode` dep, +`@types/qrcode` devDep), `web/pnpm-lock.yaml`, `web/app/profile/page.tsx` (QR slot), `web/app/profile/profile.module.css` (`.qrSquare`)
- Create: `web/lib/qr-code.tsx`
- Test: `web/lib/qr-code.test.tsx` (new)

**OMP dispatch:** Agent `task`; reviewer gate.

**Interfaces:**
- Consumes: `PublicUser.qrCodeString`, `COPY.profile.qrCode` label.
- Produces: `<QrCode value: string; label: string; className?: string>` — client component; on mount generates SVG via `QRCode.toString(value, { type: "svg", width: 220, margin: 1, errorCorrectionLevel: "M" })` and injects it inside a `div role="img" aria-label={label}`; loading/error fallback renders the raw string (never crashes profile). `.qrSquare` becomes `width: 220px; height: 220px` (drop `min(220px, 55vw)`), keeps `aspect-ratio: 1/1`.

- [ ] **Step 1: Failing test** — `web/lib/qr-code.test.tsx`: render with a known value ("qr-alice"); assert the container has `role="img"` + the label, and the injected SVG exists with at least one `<path>` element (a text span would fail this). Profile test: `app.test.tsx` asserts the profile QR region width computes to 220 (stub `getBoundingClientRect` or assert the CSS class string contains no `min(`).
- [ ] **Step 2: Run to verify fail** — `cd web && pnpm test:components -- qr-code` → FAIL (component missing).
- [ ] **Step 3: Implement** — `pnpm --dir web add qrcode && pnpm --dir web add -D @types/qrcode`; component + CSS + page wiring.
- [ ] **Step 4: Verify** — `cd web && pnpm test:components` → PASS; `pnpm typecheck` exit 0; `cd web && pnpm build` exit 0.
- [ ] **Step 5: Commit** — `feat(web): scannable SVG QR in profile at 220px (S5)`.

### Task 8: Canonical focus token on settings inputs

**Finding:** StandardsReviewerLuna #6 (P2): `.input:focus-visible` literal `#1565c0` vs `--focus: #176a87`.

**Files:**
- Modify: `web/app/profile/account-settings.module.css` (lines 77-81)

**OMP dispatch:** Agent `task`; reviewer gate.

**Interfaces:**
- Produces: `.input:focus-visible` uses `var(--focus)` (`.retry:focus-visible` already does — confirm, then normalize the `.input` rule to the same token; delete the literal `#1565c0`).

- [ ] **Step 1: Failing test (CSS contract)** — add to `web/lib/account-settings.test.tsx` a source-level assertion: read the module CSS file with `fs.readFileSync` and assert it contains `var(--focus)` and does NOT contain `#1565c0` (jsdom cannot compute CSS-module styles reliably; source assertion is the deterministic contract).
- [ ] **Step 2: Run to verify fail** — `cd web && pnpm test:components -- account-settings` → FAIL (literal present).
- [ ] **Step 3: Implement** — replace `#1565c0` with `var(--focus)` in `.input:focus-visible`.
- [ ] **Step 4: Verify** — same command → PASS; `cd web && pnpm typecheck` exit 0.
- [ ] **Step 5: Commit** — `fix(web): canonical --focus token on account-settings inputs`.

### Task 9: 44px targets + S13 forbidden state + exact registration copy

**Findings:** StandardsReviewerLuna #7 (P2, brand <44px); Standards interim (skipLink, approval back-link, S13 403 state); Spec interim (提交註冊 vs 提交註冊申請).

**Files:**
- Modify: `web/app/auth.module.css` (`.brand` 52-61, `.skipLink` 18-29), `web/lib/approval-queue.tsx` (error block ~180-195, bottom back link ~295-302), `web/lib/registration-copy.ts` (line 29)
- Test: `web/lib/approval-queue.test.tsx`, `web/lib/registration.test.tsx`, `tests/e2e/responsive.test.ts`

**OMP dispatch:** Agent `task`; reviewer gate.

**Interfaces:**
- Consumes: `ForbiddenView` (`web/lib/forbidden-view.tsx`, props `{ safeHref, onSignOut? }`), `COPY.error.forbidden`, `COPY.nav.backToProfile`.
- Produces:
  - `.brand` gains `min-height: 44px; align-items: center` (keeps inline-flex); `.skipLink` gains `min-height: 44px; display: inline-flex; align-items: center` (keeps the off-screen focus trick: `top: -3rem` until `:focus`).
  - `ApprovalQueue` 401/403 fetch results render `<ForbiddenView safeHref="/profile" />` instead of the inline `<p role="alert">` + 返回首頁 link (S13: alert copy 您沒有權限執行此操作。 + secondary action 返回個人檔案).
  - ApprovalQueue bottom back link: replace inline styles with a module class giving `min-height: 44px; display: inline-flex; align-items: center` (same 返回 link to `/`).
  - `REGISTRATION_COPY.submit` becomes `提交註冊申請`.

- [ ] **Step 1: Failing tests** — approval-queue: mock queue fetch to 403; assert rendered alert contains 您沒有權限執行此操作。 and a link with href `/profile` and text 返回個人檔案 (old code: 返回首頁 + generic alert → FAIL). registration: assert submit button text `提交註冊申請` (old: 提交註冊 → FAIL). responsive e2e: extend the 44px test (or add a public-routes case) — on `/register`, Tab to the skip link and measure `getBoundingClientRect().height >= 44`; assert the brand link box ≥44px.
- [ ] **Step 2: Run to verify fail** — `cd web && pnpm test:components -- approval-queue registration` → FAIL; `pnpm test:shell-responsive` → FAIL on the new assertions.
- [ ] **Step 3: Implement** — the four changes above; keep all zh-Hant copy in the copy modules (no inline strings).
- [ ] **Step 4: Verify** — component suites PASS; `pnpm test:shell-responsive` PASS (all cases green).
- [ ] **Step 5: Commit** — `fix(web): 44px targets, S13 forbidden state on approval queue, exact S3 copy`.

### Task 10: S3 — registration fits 375×667 without scroll

**Finding:** Standards interim (P2): register surface exceeds 667px.

**Files:**
- Modify: `web/app/auth.module.css` (`.body` 82-88, `.card` 90-97)
- Test: `tests/e2e/responsive.test.ts` (or the public-routes case added in Task 9)

**OMP dispatch:** Agent `task`; reviewer gate.

**Interfaces:**
- Consumes: the Task 9 e2e file/pattern.
- Produces: on `/register` at 375×667, `document.scrollHeight <= 667` while every input keeps ≥44px height (existing 44px e2e assertions still pass).

- [ ] **Step 1: Failing test** — add to the responsive suite: viewport 375×667, goto `/register`, assert no vertical scroll (`scrollHeight <= clientHeight`).
- [ ] **Step 2: Run to verify fail** — `pnpm test:shell-responsive` → the new case FAILS.
- [ ] **Step 3: Implement** — reduce `.body` top/bottom padding and `.card` padding until the register page fits 667px; do NOT shrink inputs below 44px and do not change fonts (adjust paddings/gaps first).
- [ ] **Step 4: Verify** — `pnpm test:shell-responsive` PASS (new case + all prior); login page and 375×812 mobile cases still green.
- [ ] **Step 5: Commit** — `fix(web): registration fits 375x667 without scroll (S3)`.

### Task 11: Teacher retirement — D1 migration, importer, handler rename

**Findings:** SpecReviewerLuna #6 (P2, role tag); Standards interim (raw Teacher leak); ADR-0025 mandates stored+API conversion.

**Files:**
- Create: `web/migrations/0002_retire_teacher.sql`
- Modify: `web/lib/auth/accounts.ts` (importer ~203-210: `TEACHER` → `ROLE.TEACHER` becomes `ROLE.STAFF`), `web/lib/auth/handlers.ts` (`requireAdminOrTeacher` → `requireAdminOrStaff`, role check `role !== "Admin" && role !== "Staff"`, rename + all callers), role union type in `web/lib/api.ts` (drop `"Teacher"` from `Role` if present)
- Test: `web/lib/auth/accounts.test.ts`, `web/worker.auth.test.ts`, `tests/e2e/role-matrix.test.ts` (if it references Teacher)

**OMP dispatch:** Agent `task`; reviewer gate.

**Interfaces:**
- Consumes: existing migration runner (`wrangler d1 migrations apply`), real-D1 test fixture pattern.
- Produces: `0002_retire_teacher.sql` = exactly `UPDATE accounts SET role = 'Staff' WHERE role = 'Teacher';`; importer maps TEACHER→STAFF; `requireAdminOrStaff(request, env, db)` keeps the same 401/403 shapes; `Role` union = `"Admin" | "Staff" | "Member"`.

- [ ] **Step 1: Failing tests** — accounts: importing a TEACHER source row yields role `Staff` (old: Teacher); migration test: on the workerd D1 fixture, insert an account with role `Teacher`, run `0002_retire_teacher.sql`, assert role `Staff`; worker.auth: `requireAdminOrStaff` accepts Admin+Staff and 403s Member (existing teacher cases updated).
- [ ] **Step 2: Run to verify fail** — `cd web && pnpm test -- auth/accounts worker.auth` → FAIL.
- [ ] **Step 3: Implement** — migration file, importer mapping, rename + callers (grep `requireAdminOrTeacher` — update every call site), role union.
- [ ] **Step 4: Verify** — `cd web && pnpm test` → all pass; `pnpm typecheck` exit 0.
- [ ] **Step 5: Commit** — `feat(auth): retire Teacher role (migration 0002, importer, ADR-0025)`.

### Task 12: Extract shared authenticated-account resolver (P3 smell)

**Finding:** StandardsReviewerLuna #8 (P3): `requireSessionUser` duplicates `requireAdminOrStaff`.

**Files:**
- Modify: `web/lib/auth/handlers.ts` (extract ~276-321 and ~222-267 into one resolver)
- Test: `web/worker.auth.test.ts` (existing coverage must stay green)

**OMP dispatch:** Agent `task`; reviewer gate.

**Interfaces:**
- Consumes: `verifyAccessToken`, `findAccountByUserId`, cookie parsing (existing internals).
- Produces: `resolveAuthenticatedAccount(request, env, db): Promise<AccountRow>` — throws the existing typed 401s (cookie missing / invalid token / unknown account); `requireAdminOrStaff` = `await resolveAuthenticatedAccount(...)` + role check (403); `requireSessionUser` = `await resolveAuthenticatedAccount(...)` + status check (403). No behavior change; pure extraction.

- [ ] **Step 1: Write the refactor with the existing tests as the safety net** — run `cd web && pnpm test -- worker.auth` BEFORE changing anything; record it green.
- [ ] **Step 2: Implement** — extract; both functions delegate; delete duplicated blocks.
- [ ] **Step 3: Verify** — `cd web && pnpm test` all pass; `pnpm typecheck` exit 0.
- [ ] **Step 4: Commit** — `refactor(auth): shared authenticated-account resolver (dedup)`.

### Task 13: AGENTS.md + CONTEXT.md + E2E README — Cloudflare deployment is the E2E authority

**Finding:** StandardsReviewerLuna #2 (P1): Headless-Gate says fresh `/exec`; Cloudflare is the real target.

**Files:**
- Modify: `AGENTS.md` (repo root, Headless-Gate section), `CONTEXT.md` (Testing quick reference if it mentions the gate), `tests/e2e/README.md`

**OMP dispatch:** Agent `task`; reviewer gate.

**Interfaces:**
- Produces: AGENTS.md Headless-Gate now reads: authenticated E2E runs against the **Cloudflare deployment** (`AUTH_TARGET_URL` = the deployed `*.workers.dev` URL of `web/wrangler.jsonc` name `efcc-prototype-129`), via the Playwright `auth-d1` pipeline; READY requires 100% pass on a fresh Cloudflare deployment; `tests/e2e/README.md` documents: `cd web && pnpm exec wrangler deploy` → set `AUTH_TARGET_URL` + the five E2E_ secrets → `pnpm exec playwright test -c tests/e2e/auth-d1.config.ts` → append results via `plan-doc-appender.ts`. No `/exec` wording remains.

- [ ] **Step 1: Edit** — apply the wording changes to the three files; keep every other rule intact.
- [ ] **Step 2: Verify** — grep the three files for `exec` — no stale `/exec` gate wording remains (docs only; no test run needed).
- [ ] **Step 3: Commit** — `docs: Cloudflare deployment is the authenticated E2E authority (Headless-Gate)`.

### Task 14: Fresh Cloudflare deployment + authenticated E2E + close-out

**Findings:** StandardsReviewerLuna #2 (P1) — the gate itself; this task RUNS it.

**Files:**
- Run: `web/` deploy + `tests/e2e/auth-d1` suite; append results to this plan doc's Verification section (via `plan-doc-appender.ts` pattern)
- Branch close-out: force-push `ui-04-196` (**requires explicit user approval** — repo rule), update PR #205 body (test plan + Similarity), verify PRs #202–#204 unchanged

**OMP dispatch:** Agent `task`; operator-in-the-loop (secrets).

**Interfaces:**
- Consumes: the five acceptance secrets (E2E_ accounts) + deploy credentials from the user; `AUTH_TARGET_URL`.
- Produces: a fresh deployment of `efcc-prototype-129` carrying all fix commits; full `auth-d1` suite 100% pass; results appended; branch pushed.

- [ ] **Step 1: Preflight** — `cd /Users/noah.wong/.omp/wt/ui-04-196/web && pnpm typecheck && pnpm test && pnpm test:components && pnpm build` → all exit 0; `cd /Users/noah.wong/.omp/wt/ui-04-196 && pnpm test:shell-responsive` → all pass.
- [ ] **Step 2: Deploy** — `cd web && pnpm exec wrangler deploy` (name `efcc-prototype-129`); record the returned `*.workers.dev` URL.
- [ ] **Step 3: E2E** — from repo root: `AUTH_TARGET_URL=<deployed-url> <five secrets as env> pnpm exec playwright test -c tests/e2e/auth-d1.config.ts` → expect 100%. If secrets are unavailable, STOP: record the exact blocker in this plan doc, do NOT claim READY (Headless-Gate fail-closed).
- [ ] **Step 4: Append results** — `pnpm exec tsx tests/e2e/plan-doc-appender.ts <plan-doc> <results>` (or the documented appender call) so the plan doc carries the pass evidence.
- [ ] **Step 5: Final diff review** — run the reviewer gate (Spec axis) on `origin/main...origin/ui-04-196`; `READY` required.
- [ ] **Step 6: Push (with user approval)** — ask the user explicitly, then `git push --force-with-lease origin ui-04-196`; update PR #205 body test-plan/similarity; confirm #202–#204 diffs unchanged.

---

## Verification (filled by Task 14)

_TBD — completed by the executor._