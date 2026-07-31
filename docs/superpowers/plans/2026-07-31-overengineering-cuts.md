# Over-Engineering Cuts Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. <!-- Note: subagent-driven-development and executing-plans skills are not available -->

**Goal:** Remove four docs-validated over-engineering cuts (dead lint config, dead diag functions, repeated RPC auth boilerplate, duplicated column-resolution) without changing any deployed behavior.

**Architecture:** Pure behavior-preserving refactor + dead-code deletion across `src/gas/*.gs` and `oxlint.config.ts`. Two new pure-JS helper functions (`requireActiveSession_`, `resolveColumnsByCandidates_`) are added to already-loaded `.gs` files so the `vm.runInContext` test harness needs no file-list changes. No new Apps Script service calls; no sheet mutation; no RPC contract change.

**Tech Stack:** Google Apps Script (`.gs`/`.html`), Vitest (`tests/gas`, `vm.runInContext` loader), Playwright (`tests/e2e`), oxlint/ultracite, clasp.

## Global Constraints

- **Apps Script docs-backed method rule (AGENTS.md):** No new Apps Script service methods. Both new helpers are pure JS composing already-documented primitives (`sessionVerify_`, `sessionRevoke_`, `usersFindById_`, `rpcFailure_`, `rpcLog_`, `RPC_CODES`). CacheService/LockService/PropertiesService usage is unchanged.
- **Behavior-preserving:** RPC envelope shape, codes, messages, section keys, and the intentional `revokeOnUserIdMismatch` inconsistency MUST be preserved verbatim.
- **Traditional Chinese copy preserved verbatim:** `"工作階段已過期，請重新登入"`, `"系統發生錯誤，請稍後再試。"`, `"系統暫時無法處理請求，請稍後再試。"`.
- **No Google Sheet mutation** (AGENTS.md). None of these cuts touch sheet data.
- **E2E gate (AGENTS.md / ADR-0012):** Every `.gs` change is verified against a fresh-versioned DEV `/exec` redeployment via the Playwright role matrix before delivery. Never create/delete a deployment - only `clasp redeploy` the existing DEV deployment.
- **Test harness:** `tests/gas` loads `.gs` files via `vm.runInContext` into one shared global scope in load order. Helpers must live in `session.js.gs` or `spreadsheet-access.gs` (already loaded first by every relevant test) to avoid test file-list churn.

## File Structure & Changes

- **Modify** `oxlint.config.ts` (Task 1) - drop dead `react` import/extends + entire `overrides` array.
- **Modify** `src/gas/Code.gs` (Task 2) - delete `diagRunSheetStructure` + `diagSheetStructure_`.
- **Modify** `src/gas/session.js.gs` (Task 3) - add `requireActiveSession_`.
- **Modify** `src/gas/Code.gs` (Task 3) - refactor 4 RPCs to call `requireActiveSession_`.
- **Create** `tests/gas/rpc-auth.test.js` (Task 3) - unit tests for the helper.
- **Modify** `src/gas/spreadsheet-access.gs` (Task 4) - add `resolveColumnsByCandidates_`.
- **Modify** `src/gas/users-repository.gs` + `src/gas/program-leaders-repository.gs` (Task 4) - reduce resolvers to wrappers.
- **Modify** `tests/gas/spreadsheet-access.test.js` (Task 4) - unit tests for the helper.
- **Deploy + E2E** (Task 5) - `clasp push`/`redeploy` + Playwright role matrix.

## What Already Exists

- `rpc-envelope.gs`: `rpcSuccess_`/`rpcFailure_`/`rpcRequestId_`/`rpcLog_`/`RPC_CODES` - reused by `requireActiveSession_`.
- `session.js.gs`: `sessionVerify_`/`sessionRevoke_` - reused by `requireActiveSession_`.
- `users-repository.gs`: `usersFindById_` - reused by `requireActiveSession_`.
- `spreadsheet-access.gs`: `efccSpreadsheet_` - home for the new column resolver.
- `tests/gas` vm loader pattern (e.g. `api-get-programs.test.js:83-89`) - copy for the new test file.
- `tests/gas` regression net: `login-and-bootstrap`, `forbidden-rpc`, `api-get-programs`, `api-submit-demo-form`, `programs-section-recovery`, `role-navigation`, `program-leaders-cache`, `programs-repository`.
- E2E pipeline: `npm run e2e:auth -- --role=<alice|bob|noah>`, `npm run test:e2e`, `E2E_TARGET_URL`, `clasp redeploy` (per `tests/e2e/lib/deploy-acceptance.ts:61`).

## Not In Scope

- **#5 demo 3-tier idempotency - RETRACTED.** Official CacheService docs (`developers.google.com/apps-script/reference/cache/cache-service`): *"data you write to the cache is not guaranteed to persist until its expiration time"*; `put` doc: *"expiration time is only a suggestion; cached data may be removed before this time... cap for cached items is 1,000."* The LockService + Script Properties authoritative store + cleanup sweep are docs-justified, not over-engineering.
- **#3 login-form duplication** - deferred pending decision (not a clean delete; needs a clone-on-first-paint refactor of `renderLogin_` vs `view-login.html`).
- **#7 drop `ultracite`** - deferred pending decision (tooling; the `react` portion is handled by Task 1).
- `programs-repository.gs` column resolver - distinct return shape `{id,name,type,description}`; lower ROI; left as-is.
- Any sheet schema/data change, any new Apps Script service, any RPC contract change.

## ASCII Diagrams

`requireActiveSession_` guard flow (no try/catch - exceptions propagate to caller's existing catch):

```
requireActiveSession_(op, requestId, t0, userId, sessionId, sessionToken, {revokeOnUserIdMismatch})
  |
  +- verification = sessionVerify_(sessionId, sessionToken)
  |   `- !ok  -> log(reason||AUTH_REQUIRED), revoke, return {ok:false, failure: AUTH_REQUIRED "工作階段已過期，請重新登入"}
  |
  +- verification.userId !== userId
  |   `- true -> log(AUTH_REQUIRED), [revoke IF revokeOnUserIdMismatch], return {ok:false, failure: AUTH_REQUIRED "工作階段已過期，請重新登入"}
  |
  +- user = usersFindById_(verification.userId)
  |   `- !user || user.status !== "Active" -> log(FORBIDDEN), revoke, return {ok:false, failure: AUTH_REQUIRED "工作階段已過期，請重新登入"}
  |
  `- return {ok:true, user}
```

Per-RPC flag + catch matrix (must be preserved):

| RPC | revokeOnUserIdMismatch | catch code | catch message |
|-----|------------------------|------------|---------------|
| `api_restoreApp` | `true` | `UNAVAILABLE` | `系統暫時無法處理請求，請稍後再試。` |
| `api_getPrograms` | `false` | `INTERNAL_ERROR` | `系統發生錯誤，請稍後再試。` |
| `api_authorizedNavigate` | `false` | `INTERNAL_ERROR` | `系統發生錯誤，請稍後再試。` |
| `api_submitDemoTaskForm` | `false` | `INTERNAL_ERROR` | `系統發生錯誤，請稍後再試。` |

(`api_loginUser`/`api_logoutUser` are structurally different - NOT refactored.)

## Failure Modes & Gaps

- **revokeOnUserIdMismatch is a security property** (comment in `Code.gs`: revoking on mismatch would let an observer of a `sessionId` force-logout a legitimate session). Getting the flag wrong is a security regression, not just a behavior change - the unit test in Task 3 explicitly asserts both branches.
- **Catch-code divergence** (`UNAVAILABLE` vs `INTERNAL_ERROR`) is preserved by keeping try/catch at each call site; the helper does not catch.
- **E2E gate depends on DEV deployment access.** If `clasp`/DEV deployment is unavailable, the Vitest suite is the fallback but delivery is blocked per AGENTS.md until `/exec` passes.
- **Column-resolver case handling:** the helper lowercases both header and candidates (matches existing `programLeadersResolveColumns_`). Existing repo tests are the regression net; if a case-sensitivity divergence surfaces in `usersResolveColumns_`, adjust there, not in the helper.

## Parallelization / Worktree Strategy

Sequential, single worktree. Tasks 2 and 3 both edit `Code.gs`; Tasks 3 and 4 share the test harness. No parallel worktrees. Each task ends with an independent commit.

---

### Task 1: Cut dead oxlint `react` config + `overrides`

**Files:**
- Modify: `oxlint.config.ts`

**Interfaces:** None (config-only).

- [ ] **Step 1: Baseline - confirm green before**

Run: `pnpm exec oxlint && pnpm typecheck`
Expected: both PASS (establishes baseline; removed blocks are all `"off"` rules for nonexistent files, so removal changes nothing for real files).

- [ ] **Step 2: Edit `oxlint.config.ts`**

Remove, verbatim: the `import react from "ultracite/oxlint/react";` line; `react` from the `extends: [core, react, vitest]` array (leave `extends: [core, vitest]`); the `"react/react-compiler": "off"` rule; and the entire `overrides: [ ... ]` array (every `files:` entry targets `src/frontend/src/views/*.tsx` / `components/*.tsx` / `services/api.ts`, none of which exist - `git ls-files '*.tsx' '*.jsx'` is empty, `ls src/` shows only `gas/`). Keep: `extends: [core, vitest]`, `ignorePatterns`, and the global `rules` object (`no-nested-ternary`, `unicorn/*`, etc.).

- [ ] **Step 3: Verify lint still green**

Run: `pnpm exec oxlint`
Expected: PASS, no new errors.

- [ ] **Step 4: Verify typecheck + gas suite**

Run: `pnpm typecheck && pnpm test:gas`
Expected: both PASS.

- [ ] **Step 5: Commit**

Message: `chore: drop dead react overrides from oxlint config`
Stage: `oxlint.config.ts`

---

### Task 2: Delete dead `diag` sheet-structure functions

**Files:**
- Modify: `src/gas/Code.gs` (delete `diagRunSheetStructure` at ~line 808 and `diagSheetStructure_` at ~line 813, plus their JSDoc blocks starting ~line 800)

**Interfaces:** None (functions have zero callers).

- [ ] **Step 1: Confirm dead**

Run: `rtk rg -n 'diagRunSheetStructure|diagSheetStructure_' src/ tests/ .github/`
Expected: only the two definitions in `src/gas/Code.gs` (no callers). `doGet(e)` never reads `e.parameter`, so the `?diag=sheet-structure` path documented in the JSDoc does not exist.

- [ ] **Step 2: Delete the two functions**

In `src/gas/Code.gs`, delete `diagRunSheetStructure`, `diagSheetStructure_`, and their JSDoc comment blocks. **Keep** `diagSetupScriptProperties` (lines ~756-796) - it is a manually-run editor setup utility that sets `EFCC_SPREADSHEET_ID` / `EFCC_SESSION_SALT` Script Properties, not dead code.

- [ ] **Step 3: Verify gas suite + lint**

Run: `pnpm test:gas && pnpm exec oxlint && pnpm typecheck`
Expected: all PASS.

- [ ] **Step 4: Commit**

Message: `chore: remove dead diagRunSheetStructure/diagSheetStructure_`
Stage: `src/gas/Code.gs`

---

### Task 3: Extract `requireActiveSession_` helper and refactor 4 RPCs

**Files:**
- Create: `tests/gas/rpc-auth.test.js`
- Modify: `src/gas/session.js.gs` (add helper)
- Modify: `src/gas/Code.gs` (refactor `api_restoreApp` ~L291, `api_getPrograms` ~L436, `api_authorizedNavigate` ~L510, `api_submitDemoTaskForm` ~L594)

**Interfaces:**
- Produces: `requireActiveSession_(op, requestId, t0, userId, sessionId, sessionToken, opts)` where `opts = { revokeOnUserIdMismatch: boolean }`; returns `{ ok: true, user }` or `{ ok: false, failure: <RpcFailure> }`; performs `rpcLog_` + conditional `sessionRevoke_` side effects; does NOT try/catch.
- Consumes: `sessionVerify_`, `sessionRevoke_` (session.js.gs), `usersFindById_` (users-repository.gs), `rpcFailure_`, `rpcLog_`, `RPC_CODES` (rpc-envelope.gs) - all existing globals.

- [ ] **Step 1: Write failing test**

Create `tests/gas/rpc-auth.test.js`. Copy the `vm.createContext` + `loadGasModule` loader pattern from `tests/gas/api-get-programs.test.js:21-100`. Load `rpc-envelope.gs` then `session.js.gs`. After loading, stub three globals on the context: `sessionVerify_`, `usersFindById_`, `sessionRevoke_` (spies that the test controls per-case). Write cases:
  1. verify ok + active user -> returns `{ok:true, user}`; `sessionRevoke_` NOT called.
  2. verify `!ok` -> returns `{ok:false, failure}` where `failure.success===false`, `failure.error.code==="AUTH_REQUIRED"`, `failure.error.message==="工作階段已過期，請重新登入"`; `sessionRevoke_` called once.
  3. userId mismatch + `revokeOnUserIdMismatch:true` -> `sessionRevoke_` called once; failure AUTH_REQUIRED.
  4. userId mismatch + `revokeOnUserIdMismatch:false` -> `sessionRevoke_` NOT called; failure AUTH_REQUIRED.
  5. user found but `status !== "Active"` -> `sessionRevoke_` called once; failure AUTH_REQUIRED; `rpcLog_` outcome `"FORBIDDEN"`.
Test framework: Vitest. File: `tests/gas/rpc-auth.test.js`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:gas tests/gas/rpc-auth.test.js`
Expected: FAIL with `requireActiveSession_ is not defined`.

- [ ] **Step 3: Implement the helper**

In `src/gas/session.js.gs`, add `requireActiveSession_(op, requestId, t0, userId, sessionId, sessionToken, opts)` implementing the 4-branch flow in the ASCII diagram exactly. Use `opts.revokeOnUserIdMismatch` (default `false`). Log outcomes via `rpcLog_(op, requestId, <outcome>, Date.now() - t0)`. Return `{ok:false, failure: rpcFailure_(requestId, RPC_CODES.AUTH_REQUIRED, "工作階段已過期，請重新登入")}` for all three failure branches. Do NOT wrap in try/catch.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:gas tests/gas/rpc-auth.test.js`
Expected: PASS (all 5 cases).

- [ ] **Step 5a: Refactor `api_restoreApp`**

In `src/gas/Code.gs` (~L291), replace the three guard branches (`!verification.ok`, `verification.userId !== userId`, `!user || user.status !== "Active"`) with:
`var guard = requireActiveSession_(op, requestId, t0, userId, sessionId, sessionToken, { revokeOnUserIdMismatch: true });` then `if (!guard.ok) return guard.failure;` then `var user = guard.user;`. Keep the existing body (uses `user`) and the existing `catch` returning `RPC_CODES.UNAVAILABLE` / `"系統暫時無法處理請求，請稍後再試。"`.
Run: `pnpm test:gas tests/gas/login-and-bootstrap.test.js` -> PASS.

- [ ] **Step 5b: Refactor `api_getPrograms`**

Same pattern, `{ revokeOnUserIdMismatch: false }`. Keep `catch` returning `RPC_CODES.INTERNAL_ERROR` / `"系統發生錯誤，請稍後再試。"`. The body returns `programs` and does not use `user`, so drop the now-unused `var user` if appropriate.
Run: `pnpm test:gas tests/gas/api-get-programs.test.js` -> PASS.

- [ ] **Step 5c: Refactor `api_authorizedNavigate`**

Same pattern, `{ revokeOnUserIdMismatch: false }`. Keep `catch` `INTERNAL_ERROR`. Body uses `user.role` for `bootstrapSectionsForRole_(user.role, userId)` - use `guard.user.role`.
Run: `pnpm test:gas tests/gas/forbidden-rpc.test.js tests/gas/role-navigation.test.js` -> PASS.

- [ ] **Step 5d: Refactor `api_submitDemoTaskForm`**

Same pattern, `{ revokeOnUserIdMismatch: false }`. Keep `catch` `INTERNAL_ERROR`. Body (idempotency logic) unchanged - it is the docs-justified 3-tier design (do NOT touch per Not In Scope).
Run: `pnpm test:gas tests/gas/api-submit-demo-form.test.js` -> PASS.

- [ ] **Step 6: Full gas suite + lint**

Run: `pnpm test:gas && pnpm exec oxlint && pnpm typecheck`
Expected: all PASS (regression net: every RPC test green).

- [ ] **Step 7: Commit**

Message: `refactor: extract requireActiveSession_ guard, dedupe 4 RPCs`
Stage: `src/gas/session.js.gs`, `src/gas/Code.gs`, `tests/gas/rpc-auth.test.js`

---

### Task 4: Extract `resolveColumnsByCandidates_` (users + leaders)

**Files:**
- Modify: `tests/gas/spreadsheet-access.test.js`
- Modify: `src/gas/spreadsheet-access.gs` (add helper)
- Modify: `src/gas/users-repository.gs` (`usersResolveColumns_` ~L58 -> wrapper)
- Modify: `src/gas/program-leaders-repository.gs` (`programLeadersResolveColumns_` ~L45 -> wrapper)

**Interfaces:**
- Produces: `resolveColumnsByCandidates_(headerRow, candidatesMap)` where `candidatesMap = { LOGICAL_KEY: [candidate, ...] }`; returns `{ LOGICAL_KEY: columnIndex }`; throws `Error` if any key has no match.
- Consumes: none new (pure JS).

- [ ] **Step 1: Write failing test**

Add to `tests/gas/spreadsheet-access.test.js`. Load `spreadsheet-access.gs` (already the pattern there). Cases:
  1. `resolveColumnsByCandidates_(["User_ID","Name"], {ID:["User_ID"], NAME:["Name"]})` -> `{ID:0, NAME:1}`.
  2. Case-insensitive + alternate candidate: `(["user_id"], {ID:["User_ID","UserID"]})` -> `{ID:0}`.
  3. Missing column throws `Error` whose message contains `"Expected one of: User_ID / UserID"`.
  4. Returns a plain object map (not array).
Test framework: Vitest. File: `tests/gas/spreadsheet-access.test.js`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:gas tests/gas/spreadsheet-access.test.js`
Expected: FAIL with `resolveColumnsByCandidates_ is not defined`.

- [ ] **Step 3: Implement the helper**

In `src/gas/spreadsheet-access.gs`, add `resolveColumnsByCandidates_(headerRow, candidatesMap)`. Behavior: build `normalized` = `headerRow.map(h => String(h).trim().toLowerCase())`; for each `key` in `Object.keys(candidatesMap)`, find first index `i` where `normalized[i]` equals some `candidates[c].toLowerCase()`; if none, `throw new Error("... missing a required column. Expected one of: " + candidates.join(" / "))`; accumulate `{key: idx}`; return it.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:gas tests/gas/spreadsheet-access.test.js`
Expected: PASS.

- [ ] **Step 5: Reduce `usersResolveColumns_` to a wrapper**

In `src/gas/users-repository.gs` (~L58), replace the body of `usersResolveColumns_(headerRow)` with `return resolveColumnsByCandidates_(headerRow, USERS_COL_CANDIDATES_);`. Keep `USERS_COL_CANDIDATES_` unchanged. Callers still do `USERS_COL = usersResolveColumns_(...)` - unaffected.

- [ ] **Step 6: Reduce `programLeadersResolveColumns_` to a wrapper**

In `src/gas/program-leaders-repository.gs` (~L45), replace the body with `return resolveColumnsByCandidates_(headerRow, PROGRAM_LEADERS_COL_CANDIDATES_);`. The existing default-header call in `programLeadersReadAll_` (when sheet missing) still works.

- [ ] **Step 7: Full gas suite + lint**

Run: `pnpm test:gas && pnpm exec oxlint && pnpm typecheck`
Expected: all PASS (regression: `program-leaders-cache`, `programs-repository`, `login-and-bootstrap`, `api-get-programs` all use these resolvers).

- [ ] **Step 8: Commit**

Message: `refactor: extract resolveColumnsByCandidates_, dedupe users+leaders`
Stage: `src/gas/spreadsheet-access.gs`, `src/gas/users-repository.gs`, `src/gas/program-leaders-repository.gs`, `tests/gas/spreadsheet-access.test.js`

---

### Task 5: E2E acceptance gate (fresh-versioned DEV `/exec`)

**Files:** None (verification + deploy). Per AGENTS.md / ADR-0012.

**Interfaces:** Consumes Tasks 2-4 (deployed `.gs` changes).

- [ ] **Step 1: Push source to Apps Script**

Run: `clasp push`
Expected: uploads `src/gas/` to script `1NvyYCSXEl3dBZzmEPOQNfwJbHm49WFxFFb3OHzENBP45H-myiU0FQppX` (`.clasp.json`).

- [ ] **Step 2: Create a version**

Run: `clasp version "overengineering cuts"`
Expected: prints a version number `<V>`.

- [ ] **Step 3: Identify the DEV deployment**

Run: `clasp deployments`
Expected: lists deployments; identify the DEV deployment ID `<DEV_ID>` matching the `AKfycbz...` ID in your existing `E2E_TARGET_URL`. (Per `tests/e2e/README.md`, the suite rejects any URL other than the approved DEV deployment - do NOT create a new deployment.)

- [ ] **Step 4: Redeploy DEV to the new version**

Run: `clasp redeploy <DEV_ID> <V> "overengineering cuts acceptance"`
Expected: DEV deployment now serves version `<V>`.

- [ ] **Step 5: Set the target URL**

Run: `export E2E_TARGET_URL="https://script.google.com/macros/s/<DEV_ID>/exec"`
Expected: env var set (Playwright config at `tests/e2e/playwright.config.ts:3` validates the `/exec` shape).

- [ ] **Step 6: Regenerate per-role storage states**

Run: `npm run e2e:auth -- --role=alice && npm run e2e:auth -- --role=bob && npm run e2e:auth -- --role=noah`
Expected: three `.auth/*.storage.json` files written (PINs: alice 1234 / bob 5678 / noah 6883).

- [ ] **Step 7: Run the role-matrix E2E suite**

Run: `npm run test:e2e`
Expected: all scenarios PASS - `role-matrix`, `forbidden-rpc`/forbidden recovery, `form-protection`, `nested-task-navigation`. (Scenarios are read-only w.r.t. sheet business data; the demo form uses its existing client-side path - no sheet mutation.)

- [ ] **Step 8: Review appended results**

The `posttest:e2e` hook (`tests/e2e/plan-doc-appender.ts`) appends per-assertion results to the acceptance plan doc. Review for any FAILED row.
Expected: all rows PASS. Any failure blocks delivery - fix and re-run from Step 1.

- [ ] **Step 9: Commit any plan-doc artifacts** (only if results files are tracked)

Message: `test: e2e acceptance for overengineering cuts`
Stage: any generated acceptance-plan result files.

---

## Self-Review

1. **Spec coverage:** All four validated cuts (#1, #2, #4, #6) have tasks. #5 retracted (docs-justified). #3/#7 explicitly deferred. Done.
2. **Instruction clarity:** Every step has exact paths, function names, signatures, commands, expected output. Done.
3. **Type consistency:** `requireActiveSession_` signature identical in Task 3 test, implementation, and all 4 call sites; `resolveColumnsByCandidates_` identical in Task 4 test, implementation, and both wrappers. Done.
4. **Boring by default:** Pure JS helpers, no novel mechanisms, reuse existing test/deploy infra. Done.
5. **Systems over heroes:** Step-by-step, each RPC refactored with its own test run; no clever batch leaps. Done.
6. **Reversibility:** Each task is one commit; refactors are behavior-preserving with test nets; dead-code deletions are trivially reversible via git. Done.
7. **Essential vs accidental:** No new abstraction beyond the two dedup helpers; no new files; no new deps. Done.
