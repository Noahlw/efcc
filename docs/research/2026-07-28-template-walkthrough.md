# Template Walkthrough — `1rl1oS1nggq-WJ-D1dk_Ddn0N8mgTdCdXenl797vZ8q42kuemaI15XVFE`

Source: `src/gas/template-reference/` (cloned 2026-07-28 via `clasp clone`).
Indexed via codebase-memory graph: project `template-reference` (32 nodes, 32 edges).

## TL;DR

The template is a **single-page app shell** with **server-rendered HTML fragments** injected
into a sidebar layout via `document.open(); document.write(html); document.close()`.
It is NOT true multi-page routing. It is "SPA with server-side HTML".

### Locked architecture (Grill 3.1 — locked 2026-07-28)

- **Decision**: template's SPA shell + DOM-swap fragments pattern.
- **Why not Option A (giant single page)**: EFCC has 6+ pages; one file would be unmaintainable.
- **Why not Option C (show/hide sections)**: still ships all code up-front; CSS-driven nav feels artificial.
- **LOCKED via Grill 3.1 (Option B, template's shell + DOM-swap).**

### Locked UI chrome (Grill 3.2 — locked 2026-07-28)


- **Decision**: hybrid layout — sidebar on desktop (≥768px), bottom tab bar on mobile (<768px).
- **Both chromes are rendered in `main.html`**; CSS shows/hides via `@media (max-width: 768px)`.
- **Both chromes call the same `loadMenuPage(pageName, el)`** — single navigation function, two visual presentations.
- **Active-state styling**: `.active` class applied on click (template's existing pattern).
- **LOCKED via Grill 3.2 (Option C, hybrid chrome).**


### Locked chrome content rules (Grill 3.3 — locked 2026-07-28)

- **Decision**: chrome shows all pages the user has any access to (RBAC filter at render time).
- **Server filter**: `getMenu()` (or equivalent `getNav()`) returns only pages the user can navigate to, based on role + Program Leader assignments.
- **RBAC also at fragment load**: `initXxx()` checks role before executing privileged actions (defense in depth).
- **Chrome order (default, all roles)**: Profile, Programs, Events, (Scanner if granted), (Dashboard if Staff+), (Care if Staff+).
- **LOCKED via Grill 3.3 (Option A, accessible-pages-only).**

### Locked login flow (Grill 3.4 — locked 2026-07-28)

- **Decision**: keep template's login pattern (single card, two fields, button with spinner); adapt fields to EFCC's `username` + `pin` and replace Bootstrap CSS classes with our custom CSS.
- **Out of scope**: full visual redesign (Option B) and two-step login (Option C).
- **Registration**: "Register New Member" link below the login card → separate `register.html` page (template doesn't have registration; EFCC does).
- **LOCKED via Grill 3.4 (Option A, template pattern + EFCC fields).**


### Locked rebuild scope (Grill 3.5 — locked 2026-07-28)

- **Decision**: aggressive rebuild — discard current `src/gas/` (17 files), rebuild SPA shell + fragments from template pattern, port EFCC domain logic from `程式碼.js` (the 616 KB reference archive).
- **Source of truth**: `程式碼.js` has the 48 validated functions across 7 domains (auth, members, programs, events, attendance, dashboard, infrastructure). This is the EFCC domain logic, NOT the current `src/gas/` which is a Wayfinder-built copy with the navigation bug.
- **Out of scope**: rewriting server functions from scratch; keeping current `src/gas/` files; incremental per-page migration.
- **LOCKED via Grill 3.5 (Option A, aggressive rebuild from 程式碼.js).**
This is **fundamentally different** from EFCC's current `?page=` multi-page architecture
(ADR-0007). The user has chosen to fully adapt the new design (the template's SPA pattern).

---

## File Inventory

| File | Type | Purpose |
|---|---|---|
| `Code.js` | Server | 4 functions: `doGet`, `include`, `loginUser`, `getMenu`, `loadPage`, `uploadFile` |
| `login.html` | Page | Login form with token check on load |
| `main.html` | Page | **SPA shell** — sidebar + topbar + content area; sidebar menu from localStorage |
| `dashboard.html` | Fragment | Initial content for the main shell; `<div class="container">` + `initDashboard()` |
| `contact.html` | Fragment | Standalone contact form (no `initContact`) |
| `setting.html` | Fragment | Settings placeholder + `initSetting()` |
| `report.html` | Fragment | Report placeholder + `initReport()` |
| `appsscript.json` | Manifest | V8 runtime, ANYONE_ANONYMOUS, USER_DEPLOYING, STACKDRIVER logging |

8 files total. ~14 KB of HTML/CSS, 3.1 KB of server JS.

---

## Server-side architecture (`Code.js`)

### `doGet(e)` — always returns login.html

```js
function doGet(e) {
  let template = HtmlService.createTemplateFromFile("login");
  return template.evaluate()
    .setTitle('Login with Multiple Pages')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
```

- **Always serves `login.html`**. No `e.parameter.page` switch. Auth-gating is done client-side.
- `setXFrameOptionsMode(ALLOWALL)` is explicit — needed because the app uses
  `document.open()/write()/close()` to swap page content, and GAS IFRAME sandbox
  blocks some cross-frame operations by default.

### `loginUser(email, password)` — server-side credential check

```js
function loginUser(email, password) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName("Users");
  const data = userSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == email && data[i][1] == password) {
      const token = generateToken();
      const expiry = new Date().getTime() + 3 * 60 * 60 * 1000; // 3 hours
      return JSON.stringify({
        success: true, token: token, expiry: expiry,
        accessPages: data[i][2].split(",")
      });
    }
  }
  return JSON.stringify({ success: false, message: "Invalid email or password" });
}
```

- Reads `Users` sheet directly: columns `[email, password, accessPages]`.
- `accessPages` is a comma-separated string of menu names from a `Menu` sheet.
- Token is `Utilities.getUuid()` with a 3-hour expiry baked into the JSON.
- Returns a **JSON string** (not an object) — the client must `JSON.parse(res)`.

### `getMenu(accessPages)` — RBAC menu builder

```js
function getMenu(accessPages) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const menuSheet = ss.getSheetByName("Menu");
  const data = menuSheet.getDataRange().getValues();
  let menus = [];
  for (let i = 1; i < data.length; i++) {
    if (accessPages.includes(data[i][2])) {
      menus.push({ name: data[i][0], url: data[i][1] });
    }
  }
  return menus;
}
```

- Reads `Menu` sheet: columns `[name, url, accessPage]`.
- Filters menu items by `accessPages.includes(menu.accessPage)`.
- Returns an **object array** (not JSON string) — the client doesn't need to parse.
- **RBAC is menu-level**, not role-level. Each menu item has an `accessPage` tag,
  and the user gets the union of all items tagged with their `accessPages`.

### `loadPage(page)` — the universal page switcher

```js
function loadPage(page) {
  return HtmlService.createTemplateFromFile(page).evaluate().getContent();
}
```

- Returns the **rendered HTML string** of any page template.
- Called from 3 places (per codebase-memory trace):
  1. `login.html` DOMContentLoaded — if token valid, swap to `main`
  2. `login.html` after login success — swap to `main` after menu is fetched
  3. `main.html` DOMContentLoaded — if token expired, swap to `login`
  4. `main.html` logout — clear localStorage, swap to `login`
  5. `main.html` `loadMenuPage(pageName, el)` — sidebar navigation

This is **the entire multi-page mechanism**: `loadPage(name)` returns HTML, client
calls `document.open/write/close` to inject it. No URL change. No browser history.

### `uploadFile(formObject)` — out of scope

Unrelated Excel import helper, not part of the multi-page pattern.

---

## Client-side architecture

### `login.html` — the entry point

```html
<script>
  document.addEventListener("DOMContentLoaded", () => {
    const loginCard = document.getElementById("loginCard");
    const tokenData = JSON.parse(localStorage.getItem("authToken"));
    if (tokenData && Date.now() < tokenData.expiry) {
      // Already logged in → swap to main
      google.script.run.withSuccessHandler(function (html) {
        document.open();
        document.write(html);
        document.close();
      }).loadPage('main');
    } else {
      loginCard.style.display = "block";
    }
  });

  function handleLogin() {
    google.script.run.withSuccessHandler((res) => {
      res = JSON.parse(res);
      if (res.success) {
        localStorage.setItem("authToken", JSON.stringify({
          token: res.token, expiry: res.expiry, accessPages: res.accessPages
        }));
        google.script.run.withSuccessHandler((menus) => {
          localStorage.setItem("userMenu", JSON.stringify(menus));
          google.script.run.withSuccessHandler(function (html) {
            document.open(); document.write(html); document.close();
          }).loadPage('main');
        }).getMenu(res.accessPages);
      } else { /* show error */ }
    }).loginUser(email, password);
  }
</script>
```

**Key patterns**:
- Auth token is in **`localStorage`** (not `sessionStorage`) with a 3-hour expiry timestamp.
- On login success: store token → fetch menu → store menu → load main shell.
- **Nested `google.script.run` callbacks** (3 levels deep). Each level wraps a server call.
- The page itself never navigates — only its DOM contents swap.

### `main.html` — the SPA shell

```html
<div id="sidebar">
  <ul id="menu"></ul>
</div>
<div id="main">
  <nav id="topbar">
    <button onclick="logout()">Logout</button>
  </nav>
  <div id="content">
    <div id="main-content">
      <?!= include('dashboard'); ?> <!-- initial content -->
    </div>
  </div>
</div>

<script>
  document.addEventListener("DOMContentLoaded", () => {
    const tokenData = JSON.parse(localStorage.getItem("authToken"));
    if (!tokenData || Date.now() > tokenData.expiry) {
      localStorage.clear();
      google.script.run.withSuccessHandler(function (html) {
        document.open(); document.write(html); document.close();
      }).loadPage('login');
      return;
    }
    // Build sidebar menu from localStorage
    const menus = JSON.parse(localStorage.getItem("userMenu") || "[]");
    menus.forEach(m => {
      const li = document.createElement("li");
      li.innerHTML = `<a href="#" onclick="loadMenuPage('${m.url}', this)">${m.name}</a>`;
      menuContainer.appendChild(li);
    });
    initDashboard()
  });

  function loadMenuPage(pageName, el) {
    // Highlight active menu
    document.querySelectorAll("#menu a").forEach(a => a.classList.remove("active"));
    if (el) el.classList.add("active");
    // Show loading spinner
    document.getElementById("main-content").innerHTML = '<spinner>';
    // Load page into content area
    google.script.run.withSuccessHandler(function (html) {
      const container = document.getElementById("main-content");
      container.innerHTML = html;
      // Extract and run scripts
      const scripts = container.querySelectorAll("script");
      scripts.forEach(script => {
        const newScript = document.createElement("script");
        if (script.src) {
          newScript.src = script.src;
        } else {
          newScript.textContent = script.textContent;
        }
        document.body.appendChild(newScript);
        document.body.removeChild(newScript);
      });
      // Auto-call init function if defined
      const initFnName = "init" + pageName.charAt(0).toUpperCase() + pageName.slice(1);
      if (typeof window[initFnName] === "function") {
        window[initFnName]();
      }
    }).loadPage(pageName);
  }

  function logout() {
    localStorage.clear();
    google.script.run.withSuccessHandler(function (html) {
      document.open(); document.write(html); document.close();
    }).loadPage('login');
  }
</script>
```

**Key patterns**:
- `<?!= include('dashboard'); ?>` is a **server-side include** that embeds the initial
  page fragment directly in the shell HTML (no AJAX round-trip for first paint).
- `loadMenuPage(pageName, el)` is the universal in-app navigation:
  1. Show spinner
  2. Call `loadPage(pageName)` → returns HTML string
  3. Inject via `container.innerHTML = html`
  4. **Extract `<script>` tags and re-execute them** (innerHTML doesn't run scripts)
  5. Auto-call `initXxx()` based on page name (convention: `initDashboard`, `initReport`, etc.)
- Sidebar is built dynamically from `localStorage.userMenu` — RBAC enforced at render time.
- Logout: clears `localStorage`, swaps in `login.html`.

### `dashboard.html` / `report.html` / `setting.html` — fragments with init convention

```html
<div class="container">
  <h2>Dashboard</h2>
  <p>Welcome to the dashboard.</p>
</div>
<script>
  function initDashboard() {
    console.log("Dashboard page initialized!");
  }
</script>
```

- Each fragment is a **bare `<div>` with no `<html>`/`<head>`/`<body>`**.
- It is injected into the shell's `#main-content` div.
- **Convention**: if the page is `xxx.html`, define `initXxx()` to run after injection.
- `contact.html` has no init function — that's fine, the auto-call guards with `typeof`.

---

## The Multi-Page Mechanism (precise)

There are exactly **5 transition sites** in the codebase:

| # | From | Trigger | Server call | DOM mutation |
|---|------|---------|-------------|--------------|
| 1 | `login.html` | DOMContentLoaded + valid token | `loadPage('main')` | `document.open/write/close` |
| 2 | `login.html` | Login success | `loginUser` → `getMenu` → `loadPage('main')` | Same |
| 3 | `main.html` | DOMContentLoaded + expired token | `loadPage('login')` | Same |
| 4 | `main.html` | Logout button | `loadPage('login')` | Same |
| 5 | `main.html` | Sidebar menu click | `loadPage(pageName)` | `container.innerHTML` + script re-execution |

All transitions happen **within the same GAS web app page** — no URL change, no browser
navigation, no IFRAME sandbox navigation concerns. The `document.open/write/close`
sequence **replaces the entire document** with the new HTML, including `<head>` content.

This is **why the template's navigation "just works"** in IFRAME sandbox:
- No `window.top.location.href` — would be blocked
- No `window.location.assign` — would be blocked
- No `<a target="_top">` — would be blocked in async contexts
- **No navigation at all** — DOM is replaced in-place

---

## Codebase-memory graph walkthrough (per your directive)

```
template-reference
├── Project
│   └── Code (Module, fan_in=0, fan_out=0)
│       ├── generateToken (Function, fan_in=1)  ← HOTSPOT
│       ├── loginUser (Function, calls → generateToken)
│       ├── getMenu (Function)
│       ├── loadPage (Function)
│       └── uploadFile (Function)
├── login.html (Module) — google.script.run×4, localStorage×4
├── main.html (Module) — google.script.run×3, localStorage×5
├── dashboard.html, contact.html, setting.html, report.html (Module)
└── appsscript.json
```

**Edges**:
- `loginUser` CALLS `generateToken` (the only CALLS edge in the graph)
- All other relationships are DEFINES (function → symbol) and CONTAINS_FILE (project → file)

The graph is **flat**: 1 package, 7 functions, no test files, no cross-package calls.
This is a **small, single-purpose template** — easy to fully internalize.

---

## Comparison with EFCC's current `src/gas/`

| Aspect | Template | EFCC current (`src/gas/`) |
|---|---|---|
| Routing | SPA shell + `document.open/write/close` | Multi-page `doGet(e)` + `?page=` |
| URL change | **Never** | Yes (URL bar updates) |
| Browser back/forward | **Doesn't work** (no history) | Works |
| Page refresh | **Fails** (loses state, no login bypass) | Works (session in sessionStorage) |
| Sandbox IFRAME concerns | **None** — all transitions are DOM mutations | Many — synthetic anchor, meta-refresh fallback |
| Auth storage | `localStorage` (persistent across browser restarts) | `sessionStorage` (cleared on tab close) |
| Token expiry | **Client-side only** (`Date.now() < expiry`); no server validation | Server-validated via `api_getCurrentSession` |
| RBAC | Menu-level (`accessPages` from sheet) | Role-level (`ADMIN`, `STAFF`, `EVENT_LEADER`, `MEMBER`) per ADR-0006 |
| Page-to-page data | Pass via `localStorage` + DOM | Pass via URL params + sessionStorage + `api_*` calls |
| Sheet access | `SpreadsheetApp.getActiveSpreadsheet()` per call | Same (no caching) |
| Script init | Convention: `initXxx()` auto-called after page swap | Per-page DOMContentLoaded + `restoreSession()` |
| Error handling | Bare `try/catch` in `uploadFile`; no global handler | Centralized in `api.call().catch()` |
| Page assets | Bootstrap 5 CDN | Custom CSS via `styles.html` partial |
| File count | 8 (1 server + 1 shell + 4 fragments + 1 form + manifest) | 17 (8 server + 9 pages) |

---

## Adaptation plan (per user directive: "fully adapting the new design")

### What we KEEP from EFCC

1. **Domain model** — sheet names (`Users`, `Programs`, `Enrollments`, `Events`,
   `Attendance`, `Program_Leaders`, `Audit_Log`) and column definitions per ADR-0006.
2. **Program Leader model** — `EVENT_LEADER` retired; per-program leaders.
3. **Audit Log** — every privileged action logged.
4. **PIN auth** — `username` + 4-digit PIN, not email + password.
5. **Event leader workflow** — create/cancel events, take attendance, scoped per program.
6. **`程式碼.js` archive** — kept at root as reference.
7. **`src/frontend/` (React SPA) archive** — kept as historical.

### What we ADOPT from the template

1. **SPA shell + DOM-swap pattern** — replace `?page=` multi-page routing.
2. **`loadPage(name)` server function** — single point of page fragment retrieval.
3. **`document.open/write/close` for top-level navigation** — solves IFRAME sandbox.
4. **`localStorage` with expiry** — replaces `sessionStorage` for persistent auth.
5. **Menu-driven RBAC** — extend to role-aware; sidebar built from user's accessible pages.
6. **`initXxx()` convention** — page-specific init auto-called after fragment injection.
7. **Server-side initial content include** — `<?!= include('dashboard') ?>` for first paint.
8. **Nested `google.script.run` callbacks** — embrace the pattern (was avoided in EFCC
   due to navigation concerns; those concerns don't apply in pure DOM-swap world).

### What we REDESIGN

1. **Auth envelope** — `username` + `pin` instead of `email` + `password`; token in
   EFCC's existing format (UUID + session row).
2. **Menu model** — replace template's `Menu` sheet with EFCC's existing `Programs` +
   `Program_Leaders` sheets. `accessPages` maps to programs the user leads + role
   baseline (profile always accessible; dashboard for `ADMIN`/`STAFF`; scanner for
   event leaders of active programs).
3. **Session expiry** — server-validated, not just client-side timestamp.
4. **Pages** — replace template's `dashboard.html`/`report.html`/`setting.html`/
   `contact.html` with EFCC's domain: `profile.html`, `programs.html`, `events.html`,
   `scanner.html`, `dashboard.html`, `care.html`.
5. **Restore session on fragment load** — equivalent of EFCC's `restoreSession`,
   but called from inside `loadMenuPage` success handler (since URL doesn't change).
6. **First-paint** — server-side include initial content; no FOUC.

### What we DELETE

1. `doGet(e)` query-string routing (template's `doGet` always returns login; we follow).
2. All EFCC `navigate()` machinery (synthetic anchor click + meta-refresh fallback).
3. EFCC's per-page `restoreSession()` + DOMContentLoaded (folded into `main.html`).
4. EFCC's `styles.html` partial (move to inline `<style>` in `main.html` since
   fragments don't need full stylesheet — fragments inherit the shell's CSS).

---

## Open risks

1. **`document.open/write/close` after async callback** — the success handlers run
   from inside `google.script.run.withSuccessHandler`. This is a non-user-activation
   context. The template uses `document.open()` (which is a DOM mutation, not a
   navigation), so user activation shouldn't be required — but **must verify**.
2. **Refresh on `main.html`** — pressing F5 on `main.html` would re-load `login.html`
   (because `doGet` returns login), then `login.html` checks localStorage token
   validity and immediately swaps to `main.html`. **A user briefly sees login.html
   even though they're authenticated.** The template lives with this; EFCC users
   may notice.
3. **No deep-linkable URLs** — bookmarking `?page=events` does nothing (template's
   `doGet` ignores query string). EFCC loses URL-based sharing.
4. **Sidebar menu rebuild on every page swap** — template rebuilds menu once on
   `main.html` load. Should be fine, but confirm.
5. **Script re-execution via DOM mutation** — `innerHTML = html` then extracting
   `<script>` and creating new script elements. This works in modern browsers but
   has historically had edge cases (CSP, Trusted Types). EFCC's GAS IFRAME sandbox
   may or may not enforce Trusted Types.

---

## Status

**READY.** Template fully walked through via codebase-memory graph + raw file reads.
Adaptation plan is concrete. Awaiting user's go-ahead to start the rebuild.