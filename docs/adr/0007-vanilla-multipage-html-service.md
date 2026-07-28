# Vanilla Multi-Page HTML Service Architecture

**Status**: Accepted

We decided to replace the React + Vite + viteSinglefile frontend with a vanilla
HTML/CSS/JS multi-page architecture served via `HtmlService`, following Google's
official [HTML Service Best Practices](https://developers.google.com/apps-script/guides/html/best-practices).

## Why

Three forces converged:

1. **5 MB GAS project limit.** React 19 + `html5-qrcode` + `qrcode` alone
   consumed a meaningful fraction of the ceiling, with no room for future
   features. Removing the framework layer recovers that headroom.

2. **GAS-native team surface.** The server side is Google Sheets + Apps Script
   V8. Requiring Vite/React/TypeScript/JSX from the next maintainer (who may
   only know Apps Script) is an artificial barrier when the official platform
   already provides a complete, documented web app surface.

3. **Official docs are vanilla-first.** Every example in the HTML Service guide,
   Best Practices, and Templated HTML documentation uses `include()`,
   `google.script.run`, and `google.script.history` with plain HTML/CSS/JS.
   There are zero React examples. Staying aligned with the documented path
   reduces undocumented edge cases and makes support resources directly
   applicable.

## Considered Options

**React SPA (current):** Excellent DX during development, TypeScript safety,
component isolation, vitest. Rejected because: the build artifact must be a
single inlined HTML file (GAS has no static asset server), the toolchain is
foreign to the Apps Script ecosystem, and the 5 MB ceiling is real.

**Vanilla SPA (google.script.history):** Client-side routing with a single
HTML shell, all views swapped via JS. Rejected because: adds complexity without
benefit for ~7 views, and the official `history` API docs show it as a tool for
dynamic URL manipulation, not as a recommended SPA pattern.

**Vanilla Multi-Page (chosen):** Each view is its own `.html` file served via
`doGet(e.parameter.page)`. Query-string routing gives native browser
back/forward, isolates pages from each other, and matches every `doGet()` example
in the official documentation.

## Consequences

- `src/frontend/` (React) becomes a retired archive; `程式碼.js` remains as a
  reference.
- New canonical source lives in `src/gas/` with `.gs` server modules and `.html`
  client pages.
- No build step — clasp pushes `src/gas/` directly.
- Future feature work targets `src/gas/`, not `src/frontend/`.
- Design-system decisions (Wayfinder Map #18, D3 #21) now apply to vanilla
  HTML/CSS, not React components.
