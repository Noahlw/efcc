# EFCC Testing Pipeline — TDD at GAS Seams

> This document defines the testing seams, patterns, and workflow for the EFCC
> Google Apps Script vanilla web app. Follow the TDD skill (`/skill:tdd`) cycle
> at each seam: **confirm seam → red → green → code-review**.

---

## Seam Map

```
┌─────────────────────────────────────────────────────────┐
│ Seam A — Server RPC (clasp run)                         │
│   Fast, isolated, no Sheet mutation                     │
│   Tests: pure functions, validation, response shapes    │
├─────────────────────────────────────────────────────────┤
│ Seam B — Client DOM (browser)                           │
│   Manual, against deployed web app                      │
│   Tests: UI behaviour, navigation, role gating          │
├─────────────────────────────────────────────────────────┤
│ Seam C — End-to-End (smoke checklist)                   │
│   Scripted manual walkthrough, pre-release              │
│   Tests: full user journeys, edge cases                 │
└─────────────────────────────────────────────────────────┘
```

---

## Seam A — Server RPC (`clasp run`)

### When to use

- Adding or modifying any `.gs` function
- Verifying response shapes match contracts after a port/refactor
- Testing validation logic (e.g. "Name is required", "PIN must be 4 digits")

### Setup

```bash
# One-time: ensure function is callable
clasp open                        # opens GAS Editor
# In Editor: select function → Run → review permissions
```

### Pattern

```bash
# RED: write a test expectation before implementing
echo "Expect api_registerUser with empty name → {success:false, message:'Name is required'}"

# GREEN: run the function
clasp run api_registerUser '{"name":"","username":"test","pin":"1234","phone":"99999999","address":""}'
# → {"success":false,"message":"Name is required."}  ← verify this matches

# Repeat for each validation path
```

### Test catalog (run after every push)

```bash
# 1. Infrastructure
clasp run getProgramsCatalog        # → Array of programs with {programId, title, type, dayOfWeek, startTime, endTime, description}

# 2. Auth (requires real Sheet data — run once with known credentials)
clasp run verifyLogin '["<test-username>","<test-pin>"]'
# → {success:true, name:"...", userId:"...", qrString:"..."}

# 3. Programs (read-only, no side effects)
clasp run api_getProgramsCatalog '["<userId>","<sessionToken>"]'
# → {success:true, data:[...]}

clasp run api_getAvailablePrograms '["<userId>","<sessionToken>"]'
# → {success:true, data:[...]} with isEnrolled boolean

# 4. Events — sessionToken required for mutation tests
# (manual only — creates real Sheet rows)

# 5. Dashboard (read-only)
clasp run api_getCareDashboard '[30,"<sessionToken>"]'
# → {generatedAt, thresholdDays, inactiveMembers:[...]}
```

### Red flag patterns

| Test | Expected failure | Reason to test |
|------|-----------------|----------------|
| `api_registerUser({name:""})` | `"Name is required"` | Validation gates |
| `api_registerUser({username:""})` | `"Username is required"` | Validation gates |
| `api_registerUser({pin:"123"})` | `"PIN must be exactly 4 digits"` | Input validation |
| `api_loginUser("bad","0000")` | `"Invalid Username or PIN"` | Auth failure |
| `api_createEvent({})` | `"Missing payload"` | Required fields |
| `api_createEvent({eventName:""})` | `"Event name is required"` | Field validation |

---

## Seam B — Client DOM (browser)

### When to use

- Adding or modifying any `.html` page
- Testing UI behaviour: form submission, navigation, role gating
- Testing client-side JavaScript: `sessionManager`, `api.call()`, `restoreSession()`

### Pattern

```
1. clasp push                    # deploy latest
2. Open web app URL in browser   # https://script.google.com/macros/s/<id>/exec
3. Open DevTools console         # Cmd+Opt+I
4. Run test assertions in console:
   sessionManager.isLoggedIn()   # → true/false
   api.call("getProgramsCatalog")  # → Promise
   isGrantedUser()               # → true/false
5. Verify DOM state:
   document.querySelector(".page-title").textContent
   document.querySelectorAll(".card").length
```

### Console-based test script

```javascript
// Paste into DevTools on any page after login:

// 1. Verify session exists
console.assert(sessionManager.isLoggedIn(), "FAIL: session not active");
console.assert(sessionManager.getUser(), "FAIL: no user object");

// 2. Verify role helpers
var user = sessionManager.getUser();
console.log("Role:", user.role, "isGranted:", isGrantedUser(), "isStaff:", isStaff());

// 3. Verify API wrapper
api.call("api_getProgramsCatalog", user.userId, sessionManager.getToken())
  .then(function(r) {
    console.assert(r.success, "FAIL: api_getProgramsCatalog returned !success");
    console.assert(Array.isArray(r.data), "FAIL: data is not array");
    console.log("Programs count:", r.data.length);
  })
  .catch(function(e) { console.error("FAIL:", e.message); });

// 4. Verify navigation
navigate("profile");
// → observe browser navigates to ?page=profile
```

---

## Seam C — End-to-End (smoke checklist)

Full checklist at `.scratch/vanilla-restructure/smoke-test-checklist.md`.

### Run before every production push

```bash
# 1. Push latest
clasp push --force

# 2. Run server tests (non-mutating)
clasp run getProgramsCatalog
clasp run api_getCareDashboard '[30,"<sessionToken>"]'

# 3. Open web app and walk through checklist
open "https://script.google.com/macros/s/<deployment-id>/exec"

# 4. Verify critical paths:
#    - MEMBER login → profile → programs → logout
#    - STAFF login → profile → events → scanner → dashboard → logout
#    - MEMBER cannot access STAFF pages
```

### Pass threshold

- **Blockers**: 34 critical (★) items → 100% must pass
- **Warnings**: non-critical items → ≥90%
- **Fail**: any critical item fails → BLOCKED for production

---

## TDD Workflow Integration

### Step 1 — Confirm seam

Before writing any test, ask:

| Question | Seam |
|----------|------|
| Testing a server function? | Seam A — `clasp run` |
| Testing UI behaviour? | Seam B — browser console |
| Full user journey? | Seam C — smoke checklist |

### Step 2 — Write RED test

```
# Seam A example: adding api_deleteEvent
echo "Expect: clasp run api_deleteEvent '{}' → {success:false, message:'Missing payload'}"
clasp run api_deleteEvent '{}'
# → Script function not found  ← RED, expected

# Seam B example: testing login form error
// Paste into browser console (before fix):
api.call("api_loginUser", "", "").then(r => console.assert(!r.success))
// → Shows "Please enter your username and PIN."  ← RED, bug exists
```

### Step 3 — Implement GREEN

Make the minimal change to pass the test. Run it again:

```
clasp push --force
clasp run api_deleteEvent '{}'
# → {"success":false,"message":"Missing payload."} ← GREEN
```

### Step 4 — Code review

Run `/skill:code-review` against the diff. Fix findings. Re-run tests.

### Step 5 — Commit

```
git add -A && git commit -m "feat(<domain>): <description>"
```

---

## Testing Constraints

| Constraint | Workaround |
|------------|------------|
| No test framework (no vitest/Jest) | Seam A (`clasp run`) for server, Seam B (DevTools) for client |
| Live Google Sheet — mutations are real | Test read-only functions first; reserve mutation tests for final verification |
| Session tokens required for auth-protected RPCs | Login via browser first, copy token from `sessionManager.getToken()` |
| Camera required for scanner page | Use manual search for CI; camera test is manual only |
| 5 MB project limit | Keep test artifacts lightweight (checklists, not test databases) |

---

## Quick Reference

```bash
# Deploy & verify
clasp push --force                        # deploy latest code
clasp deployments                         # list active deployments

# Server tests (non-mutating)
clasp run getProgramsCatalog              # verify program catalog
clasp run getAvailablePrograms '["<uid>"]' # verify enrollment status

# Client tests (requires login first)
# → browser console:
sessionManager.getUser()                  # verify session
api.call("api_getProgramsCatalog", uid, token).then(r => console.log(r))
```

**Smoke checklist**: `.scratch/vanilla-restructure/smoke-test-checklist.md`
