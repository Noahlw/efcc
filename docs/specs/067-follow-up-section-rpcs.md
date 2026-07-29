# Follow-up ticket: Server-side Section RPCs (deferred from #67, AC #9)

**File via `gh issue create` on Noahlw/efcc with this body. Blocked-by this branch merging first.**

## Parent

- #67 (Render server-authorized navigation for every role — branch `feat/issue-67-role-navigation`, commit 8a5dee3)
- Blocked by: this branch merging first

## Why

Issue #67's AC #9 required *"Calling a protected RPC directly without the required capability returns a structured forbidden response."* The current `Code.gs` exposes only `api_loginUser`, `api_restoreApp`, `api_logoutUser`. `renderSection_` in `shell-session.js.html` shows static placeholder text with zero RPC calls. The 5 section RPCs (`api_getPrograms`, `api_getEvents`, `api_getScannerEvents`, `api_getCareData`, `api_getPermissionsData`) do not exist, so the AC cannot be met by client-side enforcement alone.

## What to build

Five new public RPCs, one per Section, plus a shared capability gate.

### 1. `sessionHasCapability_(user, sectionKey)` shared helper

Every protected RPC uses this — single source of truth for server-side authorization, derived from the existing `bootstrapSectionsForRole_(role, userId)`:

```javascript
function sessionHasCapability_(user, sectionKey) {
  var authorized = bootstrapSectionsForRole_(user.role, user.userId);
  for (var i = 0; i < authorized.length; i++) {
    if (authorized[i].key === sectionKey) return true;
  }
  return false;
}
```

Reuse the existing `SECTION_KEYS` const from `Code.gs` (extracted in the #67 branch). Do not duplicate the section-key strings.

### 2. Five new public RPCs

Each follows the existing envelope pattern (`rpcSuccess_` / `rpcFailure_` with `RPC_CODES.FORBIDDEN` for missing capability). Each takes `userId`, `sessionId`, `sessionToken` (the same session triple every other protected RPC uses), verifies via `sessionVerify_`, then gates on `sessionHasCapability_`. Each returns the DTO for its section — placeholder content is fine for this ticket; the AC is the enforcement shape, not the data.

| RPC | Section key | Capability | DTO shape (placeholder) |
|-----|-------------|------------|--------------------------|
| `api_getPrograms` | `SECTION_KEYS.PROGRAMS` | READ | `{ programs: [] }` |
| `api_getEvents` | `SECTION_KEYS.EVENTS` | READ | `{ events: [] }` |
| `api_getScannerEvents` | `SECTION_KEYS.SCANNER` | USE | `{ events: [] }` |
| `api_getCareData` | `SECTION_KEYS.CARE` | READ | `{ members: [] }` |
| `api_getPermissionsData` | `SECTION_KEYS.PERMISSIONS` | USE | `{ leaders: [] }` |

**Empty data is fine.** The ticket's job is the envelope + capability gate. Domain content is owned by the corresponding per-feature tickets (#60 catalog admin, etc.).

### 3. Wire client-side `renderSection_` to call the new RPCs

`renderSection_` currently shows placeholders. Replace each case with a `google.script.run` call to the matching RPC. Map `FORBIDDEN` → `renderForbidden_(sectionKey)` (already exists). Map other failures → existing `handleRpcFailure_` path. On success, render the DTO into `#app-content`.

### 4. Server-side unit tests (vm-harness, not jsdom)

Add to `tests/gas/role-navigation.test.js` (or a new `tests/gas/section-rpc.test.js`):

For each of the 5 new RPCs:
- **Unauthenticated** → `AUTH_REQUIRED`
- **Invalid session** → `AUTH_REQUIRED`
- **MEMBER user → `api_getCareData`** → `FORBIDDEN` (MEMBER doesn't have care)
- **MEMBER user → `api_getPrograms`** → success with empty placeholder DTO
- **STAFF user → `api_getCareData`** → success
- **STAFF user → `api_getPermissionsData`** → success
- **Program Leader (has Program_Leaders row) → `api_getScannerEvents`** → success
- **Program Leader (no Program_Leaders row) → `api_getScannerEvents`** → `FORBIDDEN`

Reuse the existing vm-harness in `tests/gas/role-navigation.test.js`. Do not add jsdom / browser tests in this ticket — the spec gating happens server-side here, client-side rendering is already covered.

## Acceptance criteria

- [ ] All 5 RPCs exist as `api_*` functions in `Code.gs` with no trailing underscore.
- [ ] Each RPC requires a valid session (returns `AUTH_REQUIRED` otherwise).
- [ ] Each RPC checks `sessionHasCapability_` for its section key (returns `FORBIDDEN` if the user lacks the section).
- [ ] On success, each returns a JSON-safe DTO (string/number/array/object — no Date, no Range).
- [ ] Each RPC is logged via `rpcLog_` with operation name, requestId, outcome, durationMs — no PII.
- [ ] Client-side `renderSection_` calls the matching RPC; `FORBIDDEN` → `renderForbidden_`; other failures → existing recovery UI; success → DTO rendered.
- [ ] 8+ vm-harness unit tests per RPC (unauthenticated, invalid session, authorized, unauthorized, edge cases). 40+ new tests total.
- [ ] All existing 65 tests still pass.
- [ ] Versioned isolated `/exec` deployed; headless browser trace against @HEAD exercises one authorized RPC and one unauthorized RPC, captures results into the issue's plan doc.

## Out of scope

- Real domain data for each section (owned by per-feature tickets: catalog admin #60, attendance #6, care #7, permissions #63)
- Changing the navigation matrix (already locked from #67 AC #2-#7)
- Client-side rendering improvements (placeholder rendering is fine; this ticket proves the *enforcement*, not the *display*)

## Notes

- The `SECTION_KEYS` const is already in `Code.gs` (extracted in the #67 refactor, commit 8a5dee3). Use it; do not duplicate the strings.
- The client-side `shell-session.js.html` also has its own local `SECTION_KEYS` const (separate realm, no cross-binding). The strings must match; the existing `role-navigation.test.js` covers the server-side keys.
- The capability-gate shape is the AC. Empty DTOs are correct; the ticket is about *what* is returned when the gate fails, not *what data* flows through it.
