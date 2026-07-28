# 00 — Scaffold core SPA shell (prefactor)

**What to build:** No user-visible behavior. Shared scaffolding every later slice depends on: `Code.gs` with `doGet(e)` (always returns `login.html`, no query-string routing), `loadPage(name)` (validates `name` against a server-side allow-list of the 6 known fragment names before `HtmlService.createTemplateFromFile(name).evaluate().getContent()`), `include(filename)` (unchanged utility). `main.html` shell skeleton: sidebar (desktop `≥768px`) + bottom tab bar (mobile `<768px`) via CSS media query, empty `#main-content`, shared `loadMenuPage(pageName, el)` function (loading state → `google.script.run.loadPage(pageName)` → `innerHTML` injection → `<script>` re-execution → `initXxx()` call). `styles.html` unchanged, included via `<?!= include('styles'); ?>`. `appsscript.json` copied from current root config.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `Code.gs` exists with `doGet`, `loadPage(name)` (allow-list enforced — rejecting an unknown `name` throws, does not silently 404 or read arbitrary files), `include`.
- [ ] `main.html` renders an empty shell with sidebar visible at desktop viewport width and bottom tabs visible at mobile viewport width (verified via browser automation at both widths).
- [ ] `loadMenuPage(pageName, el)` is implemented and unit-testable in isolation (can be invoked with a stub `loadPage` response and correctly injects + re-executes a `<script>` tag).
- [ ] `styles.html` include renders without error.
- [ ] No fragment files exist yet — this ticket does not add `profile.html`/etc.
- [ ] `clasp push --force` succeeds with the new file set (no basename collisions).