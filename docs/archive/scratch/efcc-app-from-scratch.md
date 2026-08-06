# Handoff: GAS Multi-Page Web App — Architecture Survey & Recommendation

**Audience**: A fresh engineer (or future-you) starting from scratch on a Google Apps Script web app that needs a multi-page UI.

**Scope of this doc**: Base architecture for a multi-page web app, powered by Apps Script on the backend. Not a finished product spec — a survey of the external patterns you'd sample from, plus a recommended starting baseline.

**Reference rule**: Strictly external sources only. GitHub repos, Stack Overflow answers, OWASP / NIST, Google's own Apps Script docs. No prior code in this repo, no prior ADRs, no prior attempts — this is a clean-slate starting point.

---

## 1. Why this exists

You want a multi-page web app whose backend is Google Apps Script (V8 runtime). The "multi-page" requirement is the central design question — every Apps Script web app has exactly one URL (whatever `doGet` returns), so there is no native router. Everything about "page X" or "page Y" is a convention you build on top of the single IFRAME-sandboxed HTML page.

**Two main approaches exist in the wild** for solving "multi-page":

1. **Multi-page with query-string routing** — `doGet(e)` reads `e.parameter.page`, serves different `.html` files; full browser navigation between pages.
2. **SPA shell + fragment loading** — `doGet(e)` always serves one shell; client-side JS calls `google.script.run` to fetch fragment HTML and injects it into a content area, no full navigation.

Both work. Both have trade-offs. Survey below.

---

## 2. The hard constraint you have to design around

Google Apps Script web apps in **IFRAME sandbox mode** (the only mode Apps Script supports as of 2021) restrict top-level navigation:

> "In iframe mode, you need to set the target attribute of links to `_top` or `_blank`... `allow-top-navigation-by-user-activation` — This attribute is only set for stand-alone script projects."
>
> — [Google Apps Script: HTML Service Restrictions](https://developers.google.com/apps-script/guides/html/restrictions)

In plain terms: programmatic top-level redirects (`window.top.location.href`, `window.location.assign`, `<meta http-equiv="refresh">` from a non-user-activation callback, synthetic anchor clicks from async callbacks) **silently fail or are blocked by the browser**. Only a real user-initiated gesture — a hand clicking a link or button — triggers the one permitted path (`allow-top-navigation-by-user-activation`).

This is the single most-cited complaint in the Apps Script community since September 2021:

> "The same code, never modified. However, since September, the javascript `top.location.href='https://....'` and `window.open("https://....", "_top")` all of above are stopped working"
>
> — Stack Overflow, [Google Script about redirect not working and appears peculiar error, what happened](https://stackoverflow.com/questions/69128777/google-script-about-redirect-not-working-and-appears-peculiar) (49mo ago)

> "I am trying to reload the page by hitting the same URL of the app but getting this error in googleappscript, previously it was working fine but not it has stopped working"
>
> — Stack Overflow, [The frame attempting navigation of the top-level window is sandboxed with the 'allow-top-navigation-by-user-activation'](https://stackoverflow.com/questions/69281683/the-frame-attempting-navigation-of-the-top-level-window-is-sandboxed-with-the-a) (59mo ago)

**Any architecture you pick must respect this constraint, or it will work locally and break silently in production.**

---

## 3. Approach A — Multi-page with `?page=` query-string routing

### What it looks like

**`Code.gs`:**

```javascript
function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) || 'home';
  return HtmlService.createTemplateFromFile(page).evaluate();
}
```

**`index.html`** (and any other page) links to others via `?page=` query strings:

```html
<a href="?page=about">About</a>
<a href="?page=contact">Contact</a>
```

The browser navigates between URLs (`.../exec?page=home`, `.../exec?page=about`); each navigation reloads the full page in the iframe.

### Strengths

- **Trivially simple.** One routing function. Each page is a self-contained `.html` file.
- **Browser history works for free.** Back/forward buttons, bookmarks, shareable URLs all just work because they're real URLs.
- **No async context to worry about.** Navigation is always a full browser navigation, always user-initiated, always permitted by the sandbox.
- **Most-cited pattern in production.** The reference answer from Stack Overflow (64 upvotes, still the canonical 2024-2025 citation) uses this approach:

  > "doGet(e) { var page = e.parameter.page || 'Index'; return HtmlService.createTemplateFromFile(page).evaluate(); }"
  >
  > — bpwebs gist, [Multi-Page Google Apps Script Web App](https://gist.github.com/bpwebs/6e9b72e819751f37d76949fd19cc2389) (21mo ago, still maintained)

### Weaknesses

- **Full page reload on every navigation** — the iframe context, topbar, sidebar (if any), all re-render each time. For a small admin app this is fine; for a chatty UI it feels slow.
- **State doesn't persist across navigations.** You need to put auth tokens / session state in `localStorage` or `sessionStorage` and re-hydrate on every page load.
- **`doGet` validation matters.** A naive `createTemplateFromFile(e.parameter.page)` will happily serve any file in your project (including `Code.js`, `appsscript.json` raw). Validate `page` against an allow-list of known page names before the lookup.

### When this is the right pick

You have ≤ ~10 pages, most are read-mostly, you want bookmarkable/shareable URLs, you don't need a heavy persistent client-side state, and you want the simplest possible architecture that works.

---

## 4. Approach B — SPA shell + fragment loading (no real navigation)

### What it looks like

**`Code.gs`** — always serves one shell page:

```javascript
function doGet(e) {
  return HtmlService.createTemplateFromFile('shell').evaluate();
}

// Fragment loader (called by client)
function loadPage(name) {
  var allowed = ['profile', 'programs', 'events', 'care'];  // server-side allow-list
  if (allowed.indexOf(name) === -1) throw new Error('Unknown fragment: ' + name);
  return HtmlService.createTemplateFromFile(name).evaluate().getContent();
}
```

**`shell.html`** — sidebar + topbar + content area + a JS function:

```javascript
function loadMenuPage(pageName, el) {
  document.getElementById('main-content').innerHTML = '<div class="loading">Loading…</div>';
  google.script.run
    .withSuccessHandler(function(html) {
      document.getElementById('main-content').innerHTML = html;
      // Re-execute any <script> tags — innerHTML doesn't auto-run scripts
      var scripts = document.getElementById('main-content').querySelectorAll('script');
      scripts.forEach(function(oldScript) {
        var newScript = document.createElement('script');
        for (var i = 0; i < oldScript.attributes.length; i++) {
          newScript.setAttribute(oldScript.attributes[i].name, oldScript.attributes[i].value);
        }
        newScript.text = oldScript.text;
        document.body.appendChild(newScript);
        document.body.removeChild(newScript);
      });
      // Convention: each fragment exposes window['init' + Capitalize(name)]()
      var fn = window['init' + pageName.charAt(0).toUpperCase() + pageName.slice(1)];
      if (typeof fn === 'function') fn();
    })
    .loadPage(pageName);
}
```

Each "page" is a **fragment** (bare `<div>` + `<script>`, no `<html>/<head>/<body>`), loaded via `google.script.run` and injected into the shell's content area.

### Strengths

- **No navigation constraints to fight.** DOM mutation is never subject to the sandbox; `document.write`, `innerHTML`, fragment injection — all permitted. You can swap "pages" as fast as the user can click.
- **Native client-side state** — chrome (sidebar/tabs) never re-renders, so you can keep live state across "navigations" trivially.
- **Smooth UX** — no iframe reload flicker.

### Weaknesses

- **No browser history.** Back/forward buttons don't navigate between "pages"; you'd have to build your own history stack if you care.
- **No bookmarkable URLs.** `?page=events` doesn't take you to events — there's no path to be on. Every session starts at login.
- **Refresh on a fragment URL is undefined behavior.** `doGet` always returns the shell; the shell needs client-side logic to re-derive which fragment to render, and that's where refresh-bug reports come from.
- **`document.write()` / `innerHTML` from server-returned HTML** has to re-execute `<script>` tags manually — `innerHTML` doesn't auto-run scripts. Get this wrong and your fragment looks fine but its JS never ran.
- **More moving parts.** A correct implementation needs: fragment allow-list on the server, script re-execution, init-function convention, `withFailureHandler` on every RPC.

### When this is the right pick

You have a heavy persistent UI (sidebar that stays across "navigations", a live shell that re-renders content), you don't need URL-based deep-linking, refresh-bug tolerance is acceptable, and you've accepted the additional complexity cost.

---

## 5. Comparison table

| Concern | A: `?page=` multi-page | B: SPA shell + fragments |
|---|---|---|
| Implementation complexity | Low | Medium |
| Browser back/forward | Works | Doesn't (custom history needed) |
| Bookmarkable URLs | Works | Doesn't |
| Page refresh behavior | Predictable | Needs client-side rehydration |
| Sandbox-navigation fights | None (always user-initiated full navigation) | None (no top-level navigation at all) |
| Persistent chrome (sidebar/tabs) | Re-renders each page | Stays put |
| Client-side state across pages | Must use localStorage/sessionStorage | Native |
| Production-proven | Many examples (bpwebs gist, SO canonical) | Many examples (also bpwebs, InvincibleRain) |
| Audit-log / RBAC complexity | Same | Same |
| LockService concurrency concerns | Same | Same |
| Best for | Small admin apps, mostly-read content, mobile users who expect real URLs | Heavy interactive UIs with persistent chrome |

---

## 6. Cross-cutting concerns (apply to both approaches)

### 6.1 Client ↔ Server RPC envelope

> "Use `withSuccessHandler(...)` to handle results and `withFailureHandler(...)` to catch errors. This makes the asynchronous nature explicit and avoids blind waiting."
>
> — Google for Developers, [HTML Service: Communicate with Server Functions](https://developers.google.com/apps-script/guides/html/communication)

Standard pattern in production code:

```javascript
google.script.run
  .withSuccessHandler(function(response) { /* update UI */ })
  .withFailureHandler(function(err) { /* show error, NEVER ignore */ })
  .serverFunction(args);
```

Server returns a small, well-typed envelope — the prevailing convention is `{ success, message, data }`:

```javascript
function serverFunction(args) {
  return { success: true, data: { /* ... */ } };
}
function serverFunctionThatFailed() {
  return { success: false, message: "Human-readable error" };
}
```

**Pitfall called out across the community**: if `withFailureHandler` is missing, the call silently hangs — no console error visible to the user.

### 6.2 Concurrent writes (LockService)

Google Sheets has no cross-cell/cross-write transactions. If two staff members approve different members at the same time, naive code could interleave their writes (or corrupt the audit log). The community-canonical solution is `LockService.getScriptLock()`:

```javascript
var lock = LockService.getScriptLock();
lock.waitLock(30000);  // wait up to 30s
try {
  // ... read, validate, write ...
} finally {
  lock.releaseLock();
}
```

> "Use `LockService.getScriptLock()` for web apps that share one script... Always release the lock in a `finally` block to avoid deadlocks."
>
> — Google for Developers, [Class LockService](https://developers.google.com/apps-script/reference/lock/lock-service)

This is **not** the same as a transaction — it's a serialization point. Code holds the lock longer → higher contention. Keep locked sections short: read inputs, validate, do the actual sheet mutation, release. This pattern is widely used in production:

> "Use an absolute script lock or a per-user lock. This prevents concurrent write collisions on the same spreadsheet."
>
> — Stack Overflow, [How do I use LockService properly every time in Google Apps Script?](https://stackoverflow.com/questions/57017691/how-do-i-use-lockservice-properly-every-time-in-google-apps-script) (85mo ago)

### 6.3 Audit logging

For any privileged mutation (role change, approval, deletion), an audit record should be written. Standards-based schema guidance:

> "The application logs must record 'when, where, who and what' for each event."
>
> — OWASP, [Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)

Core fields for a privileged-action audit:

| Field | Purpose |
|---|---|
| `timestamp` | When (with timezone, ideally UTC) |
| `actor_id` | Who |
| `action_type` | What action category (`MEMBER_APPROVE`, `EVENT_CANCEL`, ...) |
| `target_id` | What was acted on |
| `old_value` / `new_value` | Before/after state |
| `outcome` | `success` / `failure` / `denied` |
| `reason` | Free text for human reviewers |
| `correlation_id` | Group multi-step operations |
| `session_id` | Link to the user's session (privacy-safe proxy for IP — Apps Script can't see client IP) |

OWASP also requires:

- "Always log: Input validation failures... Authentication successes and failures"
- "Test the effect on the application of logging failures"
- "Avoid logging secrets: passwords, tokens... log only necessary details"
- "Apply the security principle of least privilege"

The privacy caveat is real for Apps Script web apps specifically: you **cannot read the client's IP address** from `HtmlService`. Use `Session.getTemporaryActiveUserKey()` as a privacy-preserving proxy for the actor's session context.

### 6.4 Quota limits

| Limit | Value | Implication |
|---|---|---|
| Script runtime | 6 min / execution | Long jobs must be split |
| Custom function runtime | 30 sec / execution | Different limit applies to spreadsheet formulas |
| Simultaneous executions per user | 30 | One user can't fan out 31 calls |
| Simultaneous executions per script | 1,000 | Hard ceiling on total concurrent traffic |

> — Google for Developers, [Apps Script services quotas](https://developers.google.com/apps-script/guides/services/quotas)

If you expect more than ~30 concurrent users hitting privileged-write endpoints at once, you need a different backend. For small-org apps (church, club, small business) this is comfortably sufficient.

### 6.5 Deployment

> "Publish as Web App with 'execute the app as' set to the user accessing the web app, so permissions align with the signed-in user."
>
> — Google for Developers, [Web Apps](https://developers.google.com/apps-script/guides/web)

Two settings matter:
- **Execute as**: `USER_DEPLOYING` (recommended — runs as you, full sheet access) or `USER_ACCESSING` (runs as the visitor — they must have sheet access)
- **Access**: `ANYONE_ANONYMOUS` (public, anyone with the URL), `ANYONE` (signed-in Google account), or domain-restricted

For an internal small-org app, `USER_DEPLOYING` + `ANYONE_ANONYMOUS` (with a PIN gate at login) is the common pattern.

---

## 7. Recommended starting baseline

If the goal is **"keep it small, get a multi-page web app working"**, recommend Approach A:

**Why A over B:**
- You said "small" — Approach A is ~30 lines of routing code total, Approach B is ~100+ with more failure modes.
- You said "multi-page" — Approach A gives you real URLs for free, which is what people usually mean by "multi-page."
- The sandbox-navigation trap doesn't apply to A (you never need to navigate programmatically — every page link is a real user click on a real `<a>`).
- The complexity in B (script re-execution, init-function convention, refresh rehydration, withFailureHandler on every RPC) is real and a fresh engineer will hit it.

**Minimal starting stack:**

1. **`doGet(e)` with `e.parameter.page` allow-list** — `['login', 'home', ...]`. Fall back to `login` on miss. Refuse any name not in the list (don't pass it to `createTemplateFromFile` raw).
2. **`include(filename)`** — one-line helper for shared template parts (header, footer, styles).
3. **Pages as full `.html` files** — each with `<!DOCTYPE html>`, `<html>`, `<head><base target="_top"></head>`, `<body>`. The `<base target="_top">` is mandatory for any link that needs to navigate outside the iframe.
4. **PIN-based or password auth on `login`** — server-side credential check + a session token stored in `localStorage`. Validation on every other page via `doGet`'s check, redirect to `?page=login` if invalid.
5. **`google.script.run` for all data calls** — every page that needs server data calls a dedicated server function. Server returns `{success, message, data}`.
6. **Audit log for privileged mutations** — write to an `Audit_Log` sheet with the OWASP schema above. Wrap the write and the mutation in `LockService.getScriptLock()`.
7. **Manual smoke test before deploy** — verify: login renders, login submit → next page, links navigate, F5 refresh stays on same page, logout returns to login, one privileged action writes an audit row.

**Don't bother with, on day one:**
- SPA shell pattern (Approach B) — add it later if you actually need persistent chrome
- A build system / npm / TypeScript — vanilla HTML/CSS/JS is the documented Apps Script pattern and what the official docs and 95% of Stack Overflow answers assume
- Client-side router libraries
- Anything that requires a non-Apps-Script backend

**When to graduate to B:**
- You have ≥ 5 pages where the chrome (sidebar/tabs) would otherwise re-render on every click
- You want real client-side state to survive across "page changes"
- You don't need URL-based sharing of "pages"
- You can accept the additional complexity

---

## 8. Recommended GitHub repos to sample from (start here)

External reference repos that demonstrate production-grade patterns for Apps Script web apps:

1. **bpwebs/[6e9b72e8...]** — [Multi-Page Google Apps Script Web App (gist)](https://gist.github.com/bpwebs/6e9b72e819751f37d76949fd19cc2389) — the canonical Approach A example, last updated 2024-11-05. ~80 lines total. Closest to "smallest possible correct multi-page web app."
2. **tomcam/gassidebar** — [Google Apps Script sidebar example](https://github.com/tomcam/gassidebar) — sidebar + HTML/JS/CSS on the client. Useful as a layout reference if you ever want persistent chrome.
3. **tanaikech/taking-advantage-of-Web-Apps-with-google-apps-script** — [report on Web Apps patterns](https://github.com/tanaikech/taking-advantage-of-Web-Apps-with-google-apps-script) — broader survey of Web Apps patterns; useful as a "what's possible" reference.
4. **OWASP/CheatSheetSeries** — [Logging Cheat Sheet](https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/Logging_Cheat_Sheet.md) — primary-source audit log schema guidance.

For Approach B if you decide to go there later:
5. The `bpwebs` gist also has a related SPA-pattern branch worth comparing; the broader Apps Script community (search "Apps Script SPA shell" on GitHub) has several smaller examples.

---

## 9. Open questions to settle before implementation

1. **Multi-user vs single-admin**: If only one or two admins ever use the app, RBAC is trivial. If you need per-user roles (member / staff / admin), design the auth model first — it's load-bearing for every page.
2. **Public or restricted**: `ANYONE_ANONYMOUS` (PIN gate) vs domain-restricted changes the entire security model. Pick first.
3. **Mobile vs desktop primary**: Approach A works equally for both (real URLs, browser navigation). Approach B is friendlier to mobile-first if you do it right (bottom tabs over sidebar), but the responsive CSS is on you.
4. **Sheet schema vs AppSheet**: A from-scratch `doGet` web app is one option. AppSheet (Google's no-code sheet-front-end product) is another. They have different cost/complexity tradeoffs — worth a 30-minute evaluation before committing.
5. **Data volume**: How many rows in your main sheet? `getValues()` on a sheet with > ~10k rows gets slow. Plan an indexing/filtering strategy from day one if you'll grow.

---

## 10. Summary recommendation

**Start with Approach A** — the smallest correct multi-page Apps Script web app is ~30 lines of routing code, has the fewest failure modes, gives you real URLs for free, and sidesteps the entire IFRAME sandbox navigation trap. Sample from bpwebs' gist first. Add a LockService-wrapped audit log for privileged mutations. Defer SPA shell pattern until you actually need persistent chrome.

When the app's complexity outgrows A's limitations (heavy persistent chrome, many live-updating sections, no URL-bookmarking need), graduate to B — by then you'll know exactly which constraints of B matter for your app.

---

## Source ledger (every external citation used)

- **Google Apps Script — HTML Service Restrictions**: <https://developers.google.com/apps-script/guides/html/restrictions>
- **Google Apps Script — Migrate to IFRAME Sandbox Mode**: <https://developers.google.com/apps-script/migration/iframe>
- **Google Apps Script — Communicate with Server Functions**: <https://developers.google.com/apps-script/guides/html/communication>
- **Google Apps Script — Web Apps**: <https://developers.google.com/apps-script/guides/web>
- **Google Apps Script — Templated HTML**: <https://developers.google.com/apps-script/guides/html/templates>
- **Google Apps Script — Best Practices**: <https://developers.google.com/apps-script/guides/html/best-practices>
- **Google Apps Script — Class LockService**: <https://developers.google.com/apps-script/reference/lock/lock-service>
- **Google Apps Script — Services Quotas**: <https://developers.google.com/apps-script/guides/services/quotas>
- **bpwebs gist — Multi-Page Google Apps Script Web App**: <https://gist.github.com/bpwebs/6e9b72e819751f37d76949fd19cc2389>
- **tomcam/gassidebar**: <https://github.com/tomcam/gassidebar>
- **tanaikech/taking-advantage-of-Web-Apps-with-google-apps-script**: <https://github.com/tanaikech/taking-advantage-of-Web-Apps-with-google-apps-script>
- **OWASP Logging Cheat Sheet**: <https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html> (canonical), <https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/Logging_Cheat_Sheet.md> (source)
- **Stack Overflow — `?page=` multi-page pattern**: <https://stackoverflow.com/questions/39271006/serve-separate-html-pages-google-apps-script-not-working>
- **Stack Overflow — IFRAME sandbox redirect broken**: <https://stackoverflow.com/questions/69128777/google-script-about-redirect-not-working-and-appears-peculiar>
- **Stack Overflow — frame navigation blocked**: <https://stackoverflow.com/questions/69281683/the-frame-attempting-navigation-of-the-top-level-window-is-sandboxed-with-the-a>
- **Stack Overflow — `window.top.location.href` stopped working**: <https://stackoverflow.com/questions/69046958/google-apps-script-redirecting-by-window-top-location-href-stop-working>
- **Stack Overflow — LockService best practice**: <https://stackoverflow.com/questions/57017691/how-do-i-use-lockservice-properly-every-time-in-google-apps-script>
- **UX Stack Exchange — bottom tabs vs sidebar**: <https://ux.stackexchange.com/questions/110969/responsive-web-app-bottom-tabs-for-secondary-navigation-or-primary-actions>
- **Medium — Web App with Google App Script and Google Sheet**: <https://medium.com/@pistol.air32/web-app-with-google-app-script-and-google-sheet-26f068e675d7>

---

*This document is a starting point, not a finished spec. It samples public material to inform a fresh from-scratch build of an Apps-Script-backed multi-page web app. Adapt, evolve, and replace it as the project takes shape.*