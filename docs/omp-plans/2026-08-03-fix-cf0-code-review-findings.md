# Fix CF0 Code Review Findings Implementation Plan (TDD-Enforced)

> **For OMP workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Dispatch each task as a fresh `task` subagent; gate between tasks with the OMP `reviewer` agent (the `code-review` skill's spec axis).

**Goal:** Resolve all 11 Standards-axis and 8 Spec-axis code review findings across CF0-01 through CF0-05 (#142–#146), ensuring complete security, route authorization, session lifecycle, error recovery, and copy compliance.

**Architecture:** Refine the Next.js frontend shell (`web/`), HTTP client (`web/lib/api.ts`), Cloudflare Worker proxy (`web/worker.ts`), and Apps Script throwaway dispatcher (`src/gas/prototype-129-http-dispatch.gs`) to strictly conform to ADR-0018, ADR-0019, and Spec 074.

**Tech Stack:** Next.js (App Router, static export), TypeScript, Cloudflare Workers, Vitest, React Testing Library, MSW.

## Global Constraints & TDD Seams

### Constraints
- All user-facing copy MUST come from `web/lib/copy.ts` in Traditional Chinese (`zh-Hant`). Zero inline text literals on section pages or error views.
- No session tokens or PIN credentials in URLs, diagnostics, console logs, or JSON request body parameters (`params`).
- Interactive targets MUST be ≥44×44 CSS pixels with safe-area inset support.
- Production rate-limiter failure MUST fail closed with `503 UNAVAILABLE`.
- GAS tests (`pnpm test:gas`) and web component tests (`pnpm --dir web test:components`) MUST pass cleanly.

### Confirmed Seams & Test Boundaries
1. **Seam 1: RPC Client (`web/lib/api.ts`)**
   - *Public Interface:* `callRpc`, `loginUser`, `restoreApp`, `logoutUser`, `authorizedNavigate`.
   - *Test Seam:* `web/lib/api.test.ts` via Vitest + MSW / fetch mocks.
   - *Behavior Verified:* Envelope validation (`requestId` + `data`), body `sessionParams` security (no `sessionToken`), fast fail on abort signal without retry.
2. **Seam 2: Worker Proxy (`web/worker.ts`)**
   - *Public Interface:* Worker `fetch` handler.
   - *Test Seam:* `web/worker.test.ts` via Miniflare / `@cloudflare/vitest-pool-workers`.
   - *Behavior Verified:* Fail-closed `503 UNAVAILABLE` when rate limit binding is missing in production.
3. **Seam 3: Centralized Copy & Error Mapping (`web/lib/copy.ts` & Page components)**
   - *Public Interface:* `errorCopyFor(code, detail)` & Section page React components.
   - *Test Seam:* `web/lib/app.test.tsx` via Vitest + React Testing Library.
   - *Behavior Verified:* `errorCopyFor` never returns arbitrary detail for unknown codes; section pages render centralized `COPY` text.
4. **Seam 4: Profile Sign Out & Logout Transport Recovery (`web/app/profile/page.tsx` & `web/lib/app-shell.tsx`)**
   - *Public Interface:* `ProfileContent` Sign Out button + `handleSignOut` lifecycle in `AppShell`.
   - *Test Seam:* `web/lib/app.test.tsx` via RTL + MSW.
   - *Behavior Verified:* Sign Out button presence, `logoutUser` RPC invocation, session clearance, redirect to `/` with recoverable notice on transport error.
5. **Seam 5: Restore Recovery & Route Authorization (`web/lib/app-shell.tsx` & `web/lib/guarded-section.tsx`)**
   - *Public Interface:* `AppShell` restore state machine + `GuardedSection` allowlist check.
   - *Test Seam:* `web/lib/app.test.tsx` via RTL + MSW.
   - *Behavior Verified:* Restore 503 preserves session & retries `restoreApp`; restore `AUTH_REQUIRED` wipes session & replaces route to `/`; unpermitted route renders `RecoveryView` with safe route.
6. **Seam 6: Screen Reader Politeness Region (`web/app/layout.tsx`)**
   - *Public Interface:* `RootLayout` DOM tree.
   - *Test Seam:* `web/lib/app.test.tsx` via RTL.
   - *Behavior Verified:* Output element with `role="status"` and `aria-live="polite"`.

---

## File Structure & Changes

| File | Purpose / Responsibility |
| --- | --- |
| `web/lib/api.ts` | Remove `sessionToken` from body `sessionParams`, validate `requestId` and `data` in RPC envelope, fail immediately without retry on aborted signals. |
| `web/worker.ts` | Fail closed with 503 when rate limit binding is missing in production environment. |
| `src/gas/prototype-129-http-dispatch.gs` | Sanitize exception messages returned in Problem Details `detail`. |
| `web/lib/copy.ts` | Eliminate raw `detail` fallback in `errorCopyFor`, add section placeholders and logout failure notice copy. |
| `web/app/page.tsx` | Map login error codes via `errorCopyFor` instead of rendering raw `detail`. |
| `web/app/profile/page.tsx` | Render explicit Sign Out button control wired to `onSignOut`. |
| `web/app/{programs,events,care,scanner,permissions}/page.tsx` | Use centralized `COPY` for section headers/placeholders. |
| `web/lib/app-shell.tsx` | Preserve local session on transient restore 503/network error; redirect to `/` on `AUTH_REQUIRED`; render safe recoverable notice on logout RPC failure. |
| `web/lib/guarded-section.tsx` | Validate requested route key against `bootstrap.sections` allowlist; render `RecoveryView` for unpermitted sections. |
| `web/app/layout.tsx` | Update live region output with `role="status"` and `aria-live="polite"`. |
| `web/lib/app.test.tsx` | Component tests covering logout button, unpermitted route guard, restore 503 retry, and live region announcements. |
| `web/lib/api.test.ts` | Tests covering envelope validation and abort signal no-retry behavior. |
| `web/worker.test.ts` | Worker tests covering fail-closed rate-limiter binding fallback. |

## What Already Exists

- `web/lib/api.ts`: RPC client with `callRpc`, `loginUser`, `restoreApp`, `logoutUser`, `authorizedNavigate`.
- `web/lib/app-shell.tsx`: `AppShell` controller and `ShellFrame` provider.
- `web/lib/guarded-section.tsx`: Route guard wrapper component.
- `web/lib/copy.ts`: Centralized `zh-Hant` copy definitions.

## Not In Scope

- Camera / QR scanning execution (owned by CF5 / #136).
- Production CF1 Apps Script dispatcher (`#131`).
- Domain section data loading for Programs/Events/Care/Permissions (CF2–CF7).

## ASCII Diagrams

### Restore Error & Recovery Lifecycle Flow
```
[Reload / App Shell Load]
        |
   Load Session
   /          \
(No)          (Yes)
  |             |
Login (/)   restoreApp RPC
            /      |       \
     (Success)  (503/Net)  (AUTH_REQUIRED)
        |          |              |
    Ready Shell  Keep Session  Clear Session
                 RecoveryView  Redirect to / (Login)
                 (Retry RPC)   with Expired Copy
```

## Failure Modes & Gaps

- *Missing rate limit binding*: Must return 503 instead of skipping rate limits.
- *Malformed RPC envelope*: Must throw `MALFORMED_RESPONSE` instead of crashing React render.
- *Unpermitted Deep Link*: Must show `RecoveryView` with route to safe first section instead of showing guarded placeholder.

## Parallelization / Worktree Strategy

Sequential execution by task slice within the current worktree to ensure clean verification between steps.

---

### Task 1: RPC Client Security, Envelope Validation & Signal Cancellation (Seam 1)

**Files:**
- Modify: `web/lib/api.ts:210-230,310-330,370-380`
- Test: `web/lib/api.test.ts`

**Interfaces:**
- Consumes: `RpcSuccess<T>`, `Response`, `AbortSignal`
- Produces: Sanitized `callRpc<T>`, `sessionParams` without `sessionToken`

- [ ] **Step 1: Write failing tests for envelope validation, body security, and abort signals (RED)**
Location: `web/lib/api.test.ts`
Test intent:
1. Verify `callRpc` throws `MALFORMED_RESPONSE` when `{success: true}` lacks `data` or `requestId`.
2. Verify `sessionParams` does not include `sessionToken`.
3. Verify an aborted `signal` causes `callRpc` to fail fast with `AbortError` without retrying.

- [ ] **Step 2: Run test to verify it fails (VERIFY RED)**
Run: `pnpm --dir web test web/lib/api.test.ts`
Expected: FAIL on envelope validation, body parameter security, and abort signal assertions.

- [ ] **Step 3: Implement minimal code to pass tests (GREEN)**
Location: `web/lib/api.ts`
1. Update `sessionParams(session: Session)` to return `{ userId: session.userId, sessionId: session.sessionId }` (strip `sessionToken`).
2. Update `parseSuccess<T>(res)`: check `typeof env.requestId === "string"` and `env.data !== undefined`. Throw `MALFORMED_RESPONSE` `RpcError` if missing.
3. In `callRpc` `catch` block: check if `options?.signal?.aborted` or `error.name === "AbortError"`. If aborted, rethrow immediately without retrying.

- [ ] **Step 4: Run test to verify it passes (VERIFY GREEN)**
Run: `pnpm --dir web test web/lib/api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
Commit message: "fix(api): validate RPC envelopes, strip token from params, and halt retries on abort"

---

### Task 2: Worker Fail-Closed Rate Limit & Dispatcher Error Sanitization (Seam 2)

**Files:**
- Modify: `web/worker.ts:139-156`
- Modify: `src/gas/prototype-129-http-dispatch.gs:97-105`
- Test: `web/worker.test.ts`

**Interfaces:**
- Consumes: `Env.RPC_RATE_LIMITER`, Apps Script `doPost` exception handling
- Produces: Fail-closed rate limiter 503 response and sanitized GAS error responses

- [ ] **Step 1: Write failing worker test for missing rate-limiter binding in production (RED)**
Location: `web/worker.test.ts`
Test intent: verify worker returns 503 `UNAVAILABLE` Problem Details when `RPC_RATE_LIMITER` is undefined or throws an error.

- [ ] **Step 2: Run worker test to verify failure (VERIFY RED)**
Run: `pnpm --dir web test web/worker.test.ts`
Expected: FAIL on missing rate-limiter 503 test.

- [ ] **Step 3: Implement minimal code to pass test (GREEN)**
1. In `web/worker.ts`: update rate-limit check. If `rateLimitKey` is present but `env.RPC_RATE_LIMITER` is missing/throws, return `problemResponse(503, "UNAVAILABLE", "Service unavailable", origin, "系統暫時無法處理請求，請稍後再試。")`.
2. In `src/gas/prototype-129-http-dispatch.gs`: in top-level `catch (err)` of `doPost`, log `err` to Apps Script console, but return `{ success: false, error: { code: "INTERNAL_ERROR", message: "伺服器處理時發生錯誤。" } }` without exposing `err.message` or `err.stack`.

- [ ] **Step 4: Run worker test to verify it passes (VERIFY GREEN)**
Run: `pnpm --dir web test web/worker.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
Commit message: "fix(worker): fail closed on missing rate limiter and sanitize dispatcher error details"

---

### Task 3: Centralized Traditional Chinese Copy & Section Literals (Seam 3)

**Files:**
- Modify: `web/lib/copy.ts:40-70`
- Modify: `web/app/page.tsx:110-120`
- Modify: `web/app/programs/page.tsx`
- Modify: `web/app/events/page.tsx`
- Modify: `web/app/care/page.tsx`
- Modify: `web/app/scanner/page.tsx`
- Modify: `web/app/permissions/page.tsx`
- Test: `web/lib/app.test.tsx`

**Interfaces:**
- Consumes: `COPY` object in `web/lib/copy.ts`
- Produces: Typed centralized Traditional Chinese copy for all sections, login errors, and logout notices

- [ ] **Step 1: Write failing test for copy compliance and error detail fallback (RED)**
Location: `web/lib/app.test.tsx`
Test intent: verify `errorCopyFor` never returns arbitrary detail string for unknown code, and verify login view maps error codes via `COPY`.

- [ ] **Step 2: Run test to verify failure (VERIFY RED)**
Run: `pnpm --dir web test:components`
Expected: FAIL on fallback detail assertion.

- [ ] **Step 3: Implement minimal code to pass test (GREEN)**
1. In `web/lib/copy.ts`:
   - Update `COPY`: add `logout.failedNotice: "登出請求失敗，但本機工作階段已清除。"`
   - Add `sections`: `{ profile: "個人檔案", programs: "課程與活動", events: "聚會管理", scanner: "掃描簽到", care: "關懷儀表板", permissions: "權限管理" }`.
   - Update `errorCopyFor(code, detail)`: return `COPY.error.unknown` instead of `detail || COPY.error.unknown` for unrecognized codes.
2. In `web/app/page.tsx`: replace `errorCopyFor(undefined, error.problem.detail)` with `errorCopyFor(error.problem.code)`.
3. In `web/app/{programs,events,care,scanner,permissions}/page.tsx`: import `COPY` and use `COPY.sections.<key>` instead of inline literals.

- [ ] **Step 4: Run test to verify it passes (VERIFY GREEN)**
Run: `pnpm --dir web test:components`
Expected: PASS

- [ ] **Step 5: Commit**
Commit message: "fix(copy): enforce centralized Traditional Chinese copy and eliminate raw detail fallbacks"

---

### Task 4: Profile Sign Out Control & Logout Transport Recovery (Seam 4)

**Files:**
- Modify: `web/app/profile/page.tsx`
- Modify: `web/lib/app-shell.tsx:25-40`
- Test: `web/lib/app.test.tsx`

**Interfaces:**
- Consumes: `useApp().signOut`, `COPY.logout`
- Produces: Rendered Profile Sign Out button and safe logout error recovery on Login

- [ ] **Step 1: Write failing component test for Profile logout control & transport failure (RED)**
Location: `web/lib/app.test.tsx`
Test intent: verify Profile renders a Sign Out button, clicking it calls `signOut`, and if `logoutUser` RPC fails, local session is cleared, user is redirected to `/`, and a notice is displayed.

- [ ] **Step 2: Run test to verify failure (VERIFY RED)**
Run: `pnpm --dir web test:components`
Expected: FAIL (no sign out button on Profile).

- [ ] **Step 3: Implement minimal code to pass test (GREEN)**
1. In `web/app/profile/page.tsx`: add a Sign Out button below the `<dl>`:
   ```tsx
   <button
     type="button"
     onClick={signOut}
     style={{ marginTop: "1.5rem", minWidth: 44, minHeight: 44, padding: "0.5rem 1rem" }}
   >
     {COPY.logout.submit}
   </button>
   ```
2. In `web/lib/app-shell.tsx`: update `handleSignOut`. On `logoutUser` catch, set a temporary notice state or URL parameter so Login view displays `COPY.logout.failedNotice`. In both success and catch branches: call `clearSession()`, `sessionStorage.removeItem(DEEP_LINK_KEY)`, and `router.replace('/')`.

- [ ] **Step 4: Run test to verify it passes (VERIFY GREEN)**
Run: `pnpm --dir web test:components`
Expected: PASS

- [ ] **Step 5: Commit**
Commit message: "feat(profile): add Sign Out control and surface non-sensitive logout transport notice"

---

### Task 5: Restore Failure Lifecycle, Route Authorization & Expiry Handling (Seam 5)

**Files:**
- Modify: `web/lib/app-shell.tsx:100-140`
- Modify: `web/lib/guarded-section.tsx:35-60`
- Test: `web/lib/app.test.tsx`

**Interfaces:**
- Consumes: `bootstrap.sections`, `restoreApp`
- Produces: Session-preserving restore retry for 503/network error, immediate Login redirect on `AUTH_REQUIRED`, and route allowlist checking in `GuardedSection`

- [ ] **Step 1: Write failing component tests for restore retry & unpermitted deep links (RED)**
Location: `web/lib/app.test.tsx`
Test intent:
1. Verify restore 503 error keeps stored session in `localStorage` and clicking retry re-executes `restoreApp`.
2. Verify restore `AUTH_REQUIRED` clears session and performs `router.replace('/')`.
3. Verify deep-linking to an unpermitted route renders `RecoveryView` with route to first permitted section.

- [ ] **Step 2: Run test to verify failure (VERIFY RED)**
Run: `pnpm --dir web test:components`
Expected: FAIL on restore session wipe and unpermitted route rendering.

- [ ] **Step 3: Implement minimal code to pass test (GREEN)**
1. In `web/lib/app-shell.tsx`:
   - In `restoreApp` catch block: check `error instanceof RpcError && error.problem.code === "AUTH_REQUIRED"`.
   - If `AUTH_REQUIRED`: call `clearSession()`, `sessionStorage.setItem(DEEP_LINK_KEY, pathname)`, and `router.replace('/')`.
   - If network / 503 / other error: do NOT call `clearSession()`. Keep stored session. `onRetry` callback increments `tick`, re-triggering the `useEffect` to re-call `restoreApp(stored)`.
2. In `web/lib/guarded-section.tsx`:
   - Before authorization, check if `sectionKey` is present in `bootstrap.sections`.
   - If `sectionKey` is missing from `bootstrap.sections` or forbidden by server, render `RecoveryView` with `message={COPY.error.forbidden}` and `safeHref={`/${bootstrap.sections[0]?.key || "profile"}`}`.

- [ ] **Step 4: Run test to verify it passes (VERIFY GREEN)**
Run: `pnpm --dir web test:components`
Expected: PASS

- [ ] **Step 5: Commit**
Commit message: "fix(shell): preserve session on restore 503, route AUTH_REQUIRED to login, and enforce section allowlist"

---

### Task 6: Screen Reader Politeness Live Region (Seam 6)

**Files:**
- Modify: `web/app/layout.tsx:15-25`
- Test: `web/lib/app.test.tsx`

**Interfaces:**
- Consumes: React layout children
- Produces: Accessible live region `<output role="status" aria-live="polite" className="sr-only">`

- [ ] **Step 1: Write failing component test for politeness live region (RED)**
Location: `web/lib/app.test.tsx`
Test intent: verify document contains `<output role="status" aria-live="polite">` element for screen reader announcements.

- [ ] **Step 2: Run test to verify failure (VERIFY RED)**
Run: `pnpm --dir web test:components`
Expected: FAIL on live region attributes.

- [ ] **Step 3: Implement minimal code to pass test (GREEN)**
Update `RootLayout`:
```tsx
<output role="status" aria-live="polite" className="sr-only" />
```

- [ ] **Step 4: Run test to verify it passes (VERIFY GREEN)**
Run: `pnpm --dir web test:components`
Expected: PASS

- [ ] **Step 5: Commit**
Commit message: "fix(accessibility): add role=status and aria-live=polite to layout live region"

---

### Task 7: Full Suite Verification & Formatter Check

**Files:**
- Modify/Verify: All workspace files touched

- [ ] **Step 1: Run typecheck**
Run: `pnpm typecheck`
Expected: PASS with zero errors.

- [ ] **Step 2: Run frontend component tests**
Run: `pnpm --dir web test:components`
Expected: PASS with 100% test success.

- [ ] **Step 3: Run GAS unit tests**
Run: `pnpm test:gas`
Expected: PASS with 240/240 tests passing.

- [ ] **Step 4: Run oxfmt formatting check**
Run: `pnpm exec oxfmt --check`
Expected: All files correctly formatted.

- [ ] **Step 5: Final commit if formatting changes were required**
Commit message: "style: format code review fixes"
