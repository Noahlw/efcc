# EFCC Testing Agent Instructions

> **Always test at the confirmed seam before implementing.** Follow `/skill:tdd` workflow.
> Full pipeline: `.scratch/vanilla-restructure/TESTING.md`
> Smoke checklist: `.scratch/vanilla-restructure/smoke-test-checklist.md`

---

## Quick: Which seam?

| You are... | Use... |
|------------|--------|
| Adding/modifying a `.gs` function | **Seam A** — `clasp run <function> '<json-args>'` |
| Adding/modifying an `.html` page | **Seam B** — browser DevTools console |
| Pre-release verification | **Seam C** — smoke checklist (84 steps, 34 critical) |

---

## Seam A — Server test loop

### Prerequisites (one-time)

```bash
# 1. Deploy as API executable
clasp deploy --description "API executable for testing"

# 2. Authorize scopes manually
clasp open                          # opens GAS Editor
# → In Editor: select any function → Run → grant permissions

# 3. Verify it works
clasp run getProgramsCatalog        # should return JSON array
```

### Test cycle

```bash
# RED: write expectation, run failing test
clasp run <NewFunction> '<args>'
# → "Script function not found" or error response  ← RED

# Implement function in .gs file

# GREEN: push and run
clasp push --force
clasp run <NewFunction> '<args>'
# → expected response  ← GREEN

# Then: /skill:code-review → git commit
```

### Fallback when clasp run fails

Open the web app, login, then paste in DevTools console:
```javascript
var u = sessionManager.getUser();
var t = sessionManager.getToken();
api.call("<functionName>", <args>).then(function(r) {
  console.log(r);                     // inspect response
  console.assert(r.success, "FAIL");  // verify success
});
```

### Non-mutating tests (safe, no Sheet changes)

```bash
clasp run getProgramsCatalog                    # returns program list
```

### Requires known credentials

```bash
# Get userId + token from browser: sessionManager.getToken()
clasp run verifyLogin '["<username>","<pin>"]'
clasp run api_getAvailablePrograms '["<uid>","<token>"]'
clasp run api_getGrantedUserEvents '["<uid>","<token>"]'
clasp run api_getCareDashboard '[30,"<token>"]'
```

### Mutation tests (creates real rows — use test data only)

```bash
clasp run api_registerUser '{"name":"Test","username":"test-xyz","pin":"1234","phone":"99999999","address":"Test"}'
clasp run api_createEvent '{"createdBy":"<uid>","__sessionToken":"<tok>","eventName":"Test","eventDate":"2026-08-01","timeSlot":"10:00","programId":"<pid>","eventType":"REGULAR","recurrence":"NONE"}'
```

---

## Seam B — Client test loop

```
1. clasp push --force
2. Open web app in browser
3. Login → verify session: sessionManager.isLoggedIn() → true
4. Run assertions:
   api.call("api_getProgramsCatalog", uid, tok).then(r => console.log(r))
   document.querySelector(".page-title").textContent
5. Test UI interactions: click buttons, check navigation
```

---

## Seam C — Smoke test

```bash
clasp push --force
# Open .scratch/vanilla-restructure/smoke-test-checklist.md
# Walk through 84 steps → check off each
# Threshold: all 34 ★ items must pass
```

---

## Pre-commit gate

- [ ] `clasp push` succeeded
- [ ] Modified functions tested (Seam A or B)
- [ ] No `console.log` / `debugger` in `.html` files
- [ ] `/skill:code-review` passed or findings addressed
