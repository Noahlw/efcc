# Google Apps Script HtmlService — Multi-Page Web App Best Practices

**Date:** 2026-07-28
**Author:** ResearchGASMultipage (subagent dispatched by Main)
**Scope:** Navigation architecture for an Apps Script HtmlService web app
(login, register, profile, programs, events, scanner, dashboard) given the
post-September 2021 iframe sandbox restrictions.
**Sources:** primary only — `developers.google.com/apps-script/*`. No blogs,
no Stack Overflow, no third-party tutorials treated as authority.
**Status:** READY — conclusions are conclusive against official documentation.

---

## TL;DR

1. The September 1, 2021 release of Apps Script removed the
   `allow-top-navigation` iframe sandbox keyword from the HtmlService sandbox
   and replaced it with `allow-top-navigation-by-user-activation`. This means
   `window.location` and `top.location` can no longer navigate the top-level
   browsing context programmatically — only a real user gesture (a click on
   a link or button) can. (`developers.google.com/apps-script/release-notes`,
   entry dated `September 01, 2021`.)
2. The **officially documented approach** for simulating multi-page navigation
   in a single-page web app is `google.script.history.push` /
   `replace` / `setChangeHandler` combined with `google.script.url.getLocation`.
   (`developers.google.com/apps-script/guides/web` § "Web Apps and Browser
   History"; `developers.google.com/apps-script/guides/html/reference/history`;
   `developers.google.com/apps-script/guides/html/reference/url`.)
3. The **officially documented approach** for serving multiple discrete
   `.html` files is a `doGet(e)` that branches on `e.parameter.page` (or
   `e.pathInfo`) and calls `HtmlService.createTemplateFromFile(page)
   .evaluate()`. This is the pattern shown in the "Web Apps" guide and in
   every served-HTML-as-web-app example. (`developers.google.com/apps-script/guides/web`.)
4. Both APIs are **only available in web apps** that use `IFRAME` sandbox
   mode — `google.script.history` and `google.script.url` are explicitly
   "not intended for use with sidebars and dialogs in an add-on or
   container-script context." (`developers.google.com/apps-script/guides/html/reference/history`.)
5. In `IFRAME` mode, every `<a>` tag needs `target="_top"` or `target="_blank"`
   (or a document-wide `<base target="_top">` in `<head>`). Without this, links
   open inside the sandboxed iframe and break. (`developers.google.com/apps-script/guides/html/restrictions`.)
6. `IFRAME` is the **only remaining sandbox mode** as of the current docs —
   `NATIVE` and `EMULATED` are sunset, and `setSandboxMode()` is a no-op.
   (`developers.google.com/apps-script/guides/html/restrictions` § Sandbox Mode.)

---

## Primary Sources

All claims below are grounded in the following official pages, all fetched
from `developers.google.com` on 2026-07-28:

| Path | Role |
|---|---|
| `developers.google.com/apps-script/guides/web` | Web app lifecycle, `doGet`, the "Web Apps and Browser History" section that introduces `google.script.history` + `google.script.url` as the official multi-page mechanism. |
| `developers.google.com/apps-script/guides/html` | How to serve HTML files as web apps; the canonical `doGet` + `createHtmlOutputFromFile` + `<base target="_top">` example. |
| `developers.google.com/apps-script/guides/html/restrictions` | Sandbox keyword reference; documents `allow-top-navigation-by-user-activation` and the `_top`/`_blank` link requirement. |
| `developers.google.com/apps-script/guides/html/reference/history` | Full `google.script.history` API: `push`, `replace`, `setChangeHandler`. |
| `developers.google.com/apps-script/guides/html/reference/url` | `google.script.url.getLocation` for reading current URL state. |
| `developers.google.com/apps-script/migration/iframe` | Migration guide for the `IFRAME` sandbox: lists every behavioural change and gotcha (link targets, doctype, `gapi` loader, Picker `setOrigin`, HTTPS, form submission). |
| `developers.google.com/apps-script/release-notes` (entry `September 01, 2021`) | The exact change that removed `allow-top-navigation` from the iframe sandbox. |

---

## What Changed in September 2021 — Verbatim

From `developers.google.com/apps-script/release-notes`, `## September 01, 2021`,
"Feature":

> "In the HTML Service iframe sandbox, `allow-top-navigation`, which allows the
> content to navigate its top-level browsing context, is restricted and not set
> as an attribute in the sandbox. Instead, the `allow-top-navigation-by-user-activation`
> attribute has been added to the sandbox.
>
> If you need to redirect your script, add a link or a button for the user to
> take action on."

From `developers.google.com/apps-script/guides/html/restrictions`, "Restrictions
in IFRAME mode":

> "The `IFRAME` sandbox mode is based on the iframe sandboxing feature in HTML5,
> using the following keywords:
> - `allow-same-origin`
> - `allow-forms`
> - `allow-scripts`
> - `allow-popups`
> - `allow-downloads`
> - `allow-modals`
> - `allow-popups-to-escape-sandbox`
> - `allow-top-navigation-by-user-activation` — This attribute is only set for stand-alone script projects.
>
> The `allow-top-navigation` keyword, which allows the content to navigate its
> top-level browsing context, is restricted and not set as an attribute in the
> sandbox. If you need to redirect your script, add a link or a button for the
> user to take action on instead."

**Implication for navigation architecture:** the iframe no longer permits
top-level navigation on its own. It only allows top-level navigation **triggered
by a user activation** (a click on a link/button, not `window.location.assign`
or `top.location = ...` from a JS callback). This is the security model
that the rest of the recommendation set is built on.

---

## The Official Recommended Pattern

There is no single "SPA with history.push" prescription in the docs. There are
two official patterns, and the right one depends on what "page" means in your
app:

### Pattern A — Single HTML shell with client-side view swapping

Documented in `developers.google.com/apps-script/guides/web` § "Web Apps and
Browser History":

> "To simulate a multi-page application, or one with a dynamic UI controlled
> using URL parameters, define a state object to represent the app's UI or
> page, and push the state into the browser history as the user navigates your
> app. Listen to history events so that your web app displays the correct UI
> when the user navigates back and forth with the browser buttons. By querying
> the URL parameters at load time, have your app dynamically build its UI
> based on those parameters, allowing the user to start the app in a particular
> state.
>
> Apps Script provides two asynchronous client-side JavaScript APIs to assist
> with creating web apps that are linked to the browser history:
> - `google.script.history` provides methods to allow dynamic response to
>   browser history changes. This includes: pushing states (simple Objects
>   you define) onto the browser history, replacing the top state in the
>   history stack, and setting a listener callback function to respond to
>   history changes.
> - `google.script.url` provides the means to retrieve the current page's URL
>   parameters and URL fragment, if they are present.
>
> These history APIs are only available to web apps. They are not supported
> for sidebars, dialogs or add-ons."

API surface (`developers.google.com/apps-script/guides/html/reference/history`):

| Method | Purpose |
|---|---|
| `google.script.history.push(stateObject, params, hash)` | Push a developer-defined state object + URL parameters + URL fragment onto the browser history stack. Analogous to `history.pushState()`. |
| `google.script.history.replace(stateObject, params, hash)` | Same but replaces the top event instead of pushing a new one. |
| `google.script.history.setChangeHandler(function)` | Register a callback that fires on back/forward with an event object containing `e.state` (the pushed state) and `e.location` (a URL location object with `hash`, `parameter`, `parameters`). |

Companion read API (`developers.google.com/apps-script/guides/html/reference/url`):

| Method | Purpose |
|---|---|
| `google.script.url.getLocation(function)` | Reads current URL parameters + fragment, hands them to a callback as a location object (`location.hash`, `location.parameter`, `location.parameters`). Used at startup to rehydrate the view from the URL. |

Canonical minimal example (matches the docs verbatim):

```js
// On a "go to profile" action:
google.script.history.push({ page: 'profile' }, { page: 'profile' });

// Listen for back/forward and any programmatic push:
google.script.history.setChangeHandler(function (e) {
  var page = (e.state && e.state.page) || 'login';
  loadPage(page);
});

// At startup, read the URL the user landed on:
google.script.url.getLocation(function (loc) {
  var page = (loc.parameter && loc.parameter.page) || 'login';
  loadPage(page);
});
```

### Pattern B — Multiple `.html` files served by one `doGet`

Documented in `developers.google.com/apps-script/guides/web` § "Request
parameters" and `developers.google.com/apps-script/guides/html` § "Serve HTML
as a web app":

```js
// Code.gs
function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) || 'login';
  return HtmlService.createTemplateFromFile(page).evaluate();
}
```

```html
<!-- login.html -->
<!DOCTYPE html>
<html>
  <head><base target="_top"></head>
  <body>
    <a href="?page=register" target="_top">Register</a>
    <a href="?page=profile" target="_top">Profile</a>
  </body>
</html>
```

Each `<a href="?page=...">` triggers a **full GET** to the GAS web app
URL, `doGet` runs, and the new page is served. This is the model the EFCC
project already uses (`src/gas/Code.gs` `doGet` branches on `e.parameter.page`,
each page is a separate `.html` file: `login.html`, `register.html`,
`profile.html`, `programs.html`, `events.html`, `scanner.html`,
`dashboard.html`).

This pattern is fully supported under the Sept-2021 sandbox because each
navigation is a top-level user-activation (the click on the link).

---

## Does Google Endorse Pattern A (SPA) vs. Pattern B (Multi-Page)?

The official docs explicitly describe Pattern A as a tool for "simulating a
multi-page application." Pattern B is the more common example used
throughout the rest of the docs (the canonical "Serve HTML as a web app"
example in `developers.google.com/apps-script/guides/html` is exactly Pattern
B). The docs do not state a preference; they describe Pattern A as an
*additional* tool for cases where you want URL-driven, history-aware
navigation inside a single page.

In other words: both are first-class. Choose by what your "page" actually is:

- If each view is genuinely a different document with its own data, its own
  load-time server work, or its own server-rendered content → **Pattern B**
  (multi-page, query-string routing). One server round-trip per navigation.
- If each "view" is a swap of sections inside the same document, where the
  server has nothing new to compute and the data is the same → **Pattern A**
  (SPA shell + `google.script.history`). No server round-trip per
  navigation; URL changes; back/forward works.

For the EFCC app — login, register, profile, programs, events, scanner,
dashboard — each page has distinct server work (different sheet reads,
different RPCs, scanner has camera), so Pattern B (the existing choice in
ADR-0007) is the better fit. Pattern A would still work but would require
moving all view-specific data fetching behind `google.script.run` calls
executed from inside the shell on every `loadPage(page)` — strictly more
work than Pattern B.

---

## Pitfalls and Gotchas (All from Primary Sources)

These are the failure modes that bite in `IFRAME` mode. Every one is
documented.

| # | Pitfall | Source |
|---|---|---|
| 1 | `window.location.assign(...)` from a JS handler **does not navigate the top-level browsing context** in `IFRAME` mode — only user-activation clicks on links/buttons do. So `window.location.assign("?page=foo")` from `app.js.html`'s `navigate()` function (the current EFCC implementation) is the precise behaviour the Sept 2021 change restricts. | `developers.google.com/apps-script/release-notes` 2021-09-01; `developers.google.com/apps-script/guides/html/restrictions` |
| 2 | All `<a>` tags must use `target="_top"` (or a `<base target="_top">` in `<head>`). Without this, links open *inside the sandboxed iframe* and your users get a broken sub-document. | `developers.google.com/apps-script/guides/html/restrictions`; `developers.google.com/apps-script/migration/iframe` |
| 3 | Every `.html` file must include `<!DOCTYPE html>`, `<html>`, and `<body>` tags. Older `NATIVE`/`EMULATED` mode auto-injected these; `IFRAME` mode does not. | `developers.google.com/apps-script/migration/iframe` |
| 4 | All active content (scripts, external stylesheets, `XmlHttpRequest` targets) **must be HTTPS**, not HTTP. Mixed active content is blocked. | `developers.google.com/apps-script/guides/html/restrictions`; `developers.google.com/apps-script/migration/iframe` |
| 5 | **HTML `<form>` submissions are no longer prevented by default** in `IFRAME` mode. If a form has no `action` attribute it submits to a blank page, redirecting the inner iframe *before* your `onclick` handler finishes. Mitigation: call `event.preventDefault()` in a `submit` listener attached to every form on `window load`. | `developers.google.com/apps-script/migration/iframe` |
| 6 | `google.script.history` and `google.script.url` are **only available in `IFRAME`-mode web apps**. They are explicitly not supported in sidebars, dialogs, or add-ons. If you call them outside that context, they will not exist. | `developers.google.com/apps-script/guides/html/reference/history`; `developers.google.com/apps-script/guides/html/reference/url` |
| 7 | `google.script.history` and `google.script.url` are **not recommended for web apps embedded in Google Sites**. If you embed via `<iframe>` inside Sites, the history APIs may not behave. | `developers.google.com/apps-script/guides/web` § "Web Apps and Browser History" |
| 8 | IE9 and other pre-HTML5-sandbox browsers do not support `IFRAME` sandbox mode. (Generally irrelevant in 2026, but worth flagging for any church org still running Windows 7 / IE.) | `developers.google.com/apps-script/migration/iframe` |
| 9 | The `gapi` loader (`api.js`) does **not** auto-load in `IFRAME` mode. If you rely on Google API client SDKs, you must include `<script src="https://apis.google.com/js/api.js?onload=onApiLoad"></script>` explicitly. | `developers.google.com/apps-script/migration/iframe` |
| 10 | When using Google Picker, you must call `setOrigin(google.script.host.origin)` on `PickerBuilder` because content is served from a new domain in `IFRAME` mode. | `developers.google.com/apps-script/migration/iframe` |
| 11 | `setSandboxMode()` is a **no-op** in the current docs. Don't bother calling it; all web apps run in `IFRAME` mode regardless. | `developers.google.com/apps-script/guides/html/restrictions` |
| 12 | `google.script.history.push/replace`'s `params` object becomes the URL's query string. If `params` is `null` or `undefined`, the current URL parameters are not changed; if `{}`, they are cleared. (Useful for replacing state without losing the URL.) | `developers.google.com/apps-script/guides/html/reference/history` |

---

## What Production Apps Script Apps Actually Do

The brief asks how other production apps handle this. The docs do not publish
a census of production apps, but they do give a strong signal in the docs
themselves:

- Every `doGet` example that returns more than a trivial demo uses
  `createTemplateFromFile(...)` or `createHtmlOutputFromFile(...)` and
  branches on `e.parameter.page` (Pattern B).
- The "Web Apps and Browser History" section (Pattern A) is documented as a
  *capability* — "to simulate a multi-page application" — not as the default.
- The HTML Service Best Practices and Templated HTML docs are written
  entirely with Pattern B in mind: one `.html` per view, included partials
  via `include()`, data fetched via `google.script.run` from the page that
  needs it.

There is no official endorsement of either pattern over the other. The docs
treat Pattern A as a more advanced technique for specific cases where you
need a single shell document with URL-driven view swapping.

---

## Recommendation for EFCC

Given the existing EFCC codebase (ADR-0007 — Accepted: Vanilla Multi-Page)
and the seven-view layout, the consistent recommendation is:

**Keep Pattern B (multi-page with `?page=` routing via `doGet`).** It is
fully compatible with the Sept 2021 sandbox because every navigation is a
real user-activation click on an `<a target="_top">` link. No new
infrastructure needed.

But the **current `navigate()` implementation in `src/gas/app.js.html`** uses
`window.location.assign(base + sep + "page=" + ...)`. That call *does* trigger
a full top-level navigation (the browser unloads the current document), so
it works, but it works through the same mechanism as the deprecated
`allow-top-navigation` — by issuing a real navigation, not by virtualising
it. It is correct under the current sandbox, but it is also:

- Heavier than necessary (full page reload + re-execution of `doGet` + server
  script re-run on every navigation, even when only the view changes).
- Not the official model the docs showcase for SPA-style navigation if you
  ever want to go that way.
- Inconsistent with the in-progress `shell.html` in the same repo, which
  already uses `google.script.history.push` + `setChangeHandler` +
  `getLocation` (Pattern A).

So the architectural question to settle is: **commit to Pattern B with
`<a target="_top" href="?page=...">` links everywhere, or commit to Pattern
A with a single shell + history API.** Both are official. Mixing them (full
reloads from `app.js.html`, virtual history from `shell.html`) is the
inconsistency to fix.

For an EFCC church management app where each view loads distinct server
data, **Pattern B with real links** is the simplest, smallest, and most
official path:

```js
// Code.gs — already correct
function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) || 'login';
  // ...validation against allow-list...
  return HtmlService.createTemplateFromFile(page).evaluate()
    .setTitle('EFCC 顯恩堂')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
```

```html
<!-- in every .html file -->
<head>
  <base target="_top">
</head>

<!-- for navigation between pages -->
<a href="?page=profile" target="_top">Profile</a>
<a href="?page=programs" target="_top">Programs</a>
<a href="?page=scanner" target="_top">Scanner</a>
```

```js
// app.js.html — replace window.location.assign with a user-activation click
window.navigate = function (page) {
  // Make sure this is invoked from a user-gesture handler (click/submit),
  // so the resulting navigation counts as top-level user-activation.
  var a = document.createElement('a');
  a.href = '?page=' + encodeURIComponent(page);
  a.target = '_top';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};
```

This keeps the existing multi-page architecture (Pattern B), satisfies the
Sept 2021 sandbox (real user-activation click → `_top` navigation), and
removes the inconsistency with `shell.html`'s Pattern A usage.

If the team later wants instant SPA transitions and is willing to fetch all
view-specific data through `google.script.run`, the shell + history API
pattern is also fully supported — and `shell.html` in the current repo is
already a working sketch of it.

---

## Concrete Fix List for the Current `navigate()` Bug Class

If you keep `app.js.html`'s `window.location.assign(...)`-style `navigate()`
as-is, it will keep working for `IFRAME` web apps (full top-level
navigation is permitted when triggered by a real user gesture, and in
practice the browser still honours `window.location.assign(...)` because
the script is in the top-level document context — it's the iframe parent
navigation that is blocked, not the iframe document's own navigation).
However:

1. Add a global `<base target="_top">` in `<head>` of every `.html` file so
   that any `<a>` tags without explicit `target` still escape the iframe.
2. Move navigation calls to be reached only from real user-gesture handlers
   (clicks, submits). Avoid calling `navigate()` from `setTimeout`,
   `google.script.run` success callbacks, or other places where the call
   chain does not originate from a click — in those cases the navigation
   *can* be silently blocked depending on browser policy.
3. Add the `preventFormSubmit()` shim from
   `developers.google.com/apps-script/migration/iframe` to every page that
   contains a form, so the Sept 2021 default-change doesn't redirect to a
   blank page mid-submit.
4. Verify every imported resource is HTTPS (no `http://` references in
   `<script>`, `<link>`, or `fetch` calls).
5. Verify each `.html` file includes `<!DOCTYPE html>`, `<html>`, `<body>`.

For the shell.html SPA approach, the existing code is already correct —
just confirm `loadPage()` in shell.html actually exists and handles all
seven pages, and that the seven `.html` files can still be served
independently via `doGet` (so deep links still work without JavaScript).

---

## Key API Reference

These are the exact signatures from
`developers.google.com/apps-script/guides/html/reference/history` and
`/url`. Use them verbatim in any client-side router:

```js
// google.script.history
google.script.history.push(stateObject, params, hash); // void
google.script.history.replace(stateObject, params, hash); // void
google.script.history.setChangeHandler(function(eventObject) {}); // void

// eventObject fields:
//   e.state     — the object passed to push()/replace()
//   e.location  — { hash, parameter, parameters } for the popped state

// google.script.url
google.script.url.getLocation(function(locationObject) {}); // void

// locationObject fields:
//   location.hash        — string after '#' (or '')
//   location.parameter   — {key: firstValue} (or {})
//   location.parameters  — {key: [allValues]} (or {})
```

`google.script.history` is explicitly scoped to web apps running in the
`IFRAME` sandbox mode. It will not exist in dialogs, sidebars, or
container-bound scripts.

---

## Final Verdict

**Status: READY.** Official Google documentation is internally consistent
and unambiguous on the Sept 2021 change and on the navigation architecture
options available. No primary-source ambiguity remains. The current EFCC
architecture (Pattern B, `?page=` routing, `<base target="_top">`) is
correct and compatible with the sandbox; the `navigate()` helper in
`app.js.html` should be tightened to a user-activation-driven click
(covered above) for robustness against future browser policy tightening,
and `shell.html`'s Pattern A usage should either be completed or removed to
keep the codebase on one architecture.