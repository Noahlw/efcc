# Assessment B — T2B_CatalogEmptyB · Programs catalog, empty search-result state

**Target:** Programs catalog, empty search-result state · `web/lib/programs/participant-directory.tsx` **Method:** Assessment B (detector + browser evidence) · isolated from Assessment A **Date:** 2026-08-20 · Viewport 390×844 (mobile) · Dev server `http://127.0.0.1:8787` (wrangler dev, already running) **Auth:** `E2E_member` / `E2E_member!dev` — session was already authenticated on this worktree (verified: `GET /programs` returned directory without redirect to `/`; re-checked via `tab.goto → /profile` showing logged-in shell before catalog steps). No enrollment or catalog mutation was submitted. **Design ground truth:** `file:///Users/noah.wong/Desktop/code/EFCC-dev/.scratch/efcc-redesign-handoff-2026-08-18/source/claude-design/design_export/participant/programs.html`

---

## 1. CLI Detector

**Command:**

```bash
node /Users/noah.wong/.dotfiles/ai/agents/skills/impeccable/scripts/detect.mjs --json web/lib/programs/participant-directory.tsx
```

**Output:**

```json
[]
```

- **Findings:** 0
- **Exit code:** 0
- **Wall time:** 0.11s
- **File scanned:** `web/lib/programs/participant-directory.tsx` (481 lines, `ParticipantDirectory` component, Issue PUI-02 / #246)
- **Rule coverage:** `detect.mjs` delegates to `detector/detect-antipatterns.mjs` via `detectCli()` — markup/JSX files are scanned, CSS-only files are skipped per spec. The JSON output is the full report.

No counts to table — zero findings. No overlay injection step was applicable (nothing to highlight).

**Related assets not scanned in this task scope (noted for completeness):**

- `web/app/programs/programs.module.css` (2290 lines; contains `.directoryEmpty`, `.directorySearchRow`, `.filterChip`, `.retry`, etc.) — out of scope for the single-file task directive.
- `web/lib/copy.ts` strings consumed by the empty state: `catalogEmpty: "找不到相關課程"`, `catalogEmptyHint: "請嘗試其他關鍵字或清除篩選。"`, `catalogClearFilters: "清除篩選"`, `catalogClearSearch: "清除搜尋"`, `catalogSearchLabel: "搜尋課程"`, `filterGroupLabel: "課程篩選"`, `catalogListLabel: "課程目錄"`.

---

## 2. Browser Evidence

### 2.1 Tab & Navigation

- **Tool:** `browser` (Orca headless Chromium, shared session)
- **Fresh tab:** `t2b-empty-2` opened at `http://127.0.0.1:8787/` with viewport `{"width":390,"height":844,"deviceScaleFactor":1.25}`
- **Login path:** Navigated directly to `/` then to `/programs`. The worktree's existing auth cookie yielded an authenticated shell immediately; the login form was not re-filled (previous run had already established the `E2E_member` session).
- **Catalog load:** Initial `GET /programs` aria snapshot showed:
  - `banner: "課程與活動"` + 5 bottom-nav links
  - `main region "課程"`: `h1 "課程"` + `p "尋找合適的課程，查看聚會及報名狀態。"`
  - `searchbox "搜尋課程" [ref=e51]` with value `""`
  - `group "課程篩選"` with 4 chips: `全部 [pressed=true]`, `可報名`, `已參加`, `待審批`
  - `list "課程目錄"` with 3 items (post-seed demo data: `E2E_DEMO_成人查經`, `E2E_DEMO_青年團契`, `E2E_DEMO_管理安排`) — confirming the clean/unenrolled baseline (no enrollments for `E2E_member`).

### 2.2 Triggering the empty state

Task directive: _"search a nonsense string to trigger the empty state"_.

- **Attempt 1:** `tab.click` + `tab.type` on the searchbox ref failed (`timed out after 8000ms` — the input is inside a flex row with absolute icon overlay; ARIA click targeting flaked).
- **Retry — native setter + input event (React controlled-component compatible):**

```js
const input = document.querySelector('input[type=\"search\"]');
const nativeSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value"
).set;
nativeSetter.call(input, "zzzzzzz9999");
input.dispatchEvent(new Event("input", { bubbles: true }));
await new Promise((r) => setTimeout(r, 800));
```

Verified in-evaluate: `input.value === "zzzzzzz9999"` → DOM filtered.

**Pre-search vs post-search `document.body.innerText`:**

- _Before (q=""):_ list of 3 cards + no empty section.
- _After (q="zzzzzzz9999"):_

```
清除搜尋
全部  可報名  已參加  待審批
找不到相關課程
請嘗試其他關鍵字或清除篩選。
清除篩選
```

`document.querySelector('[class*="directoryEmpty"]') !== null` → `true` `document.querySelector('[class*="directoryList"]') === null` → `true` (list removed from DOM, not hidden).

Observed DOM for the empty section (verbatim):

```html
<section
  id="programs-catalog-state"
  class="programs-module__zTMsaW__boundaryState programs-module__zTMsaW__directoryEmpty"
>
  <h2 class="programs-module__zTMsaW__boundaryTitle">找不到相關課程</h2>
  <p>請嘗試其他關鍵字或清除篩選。</p>
  <button class="programs-module__zTMsaW__retry" type="button">清除篩選</button>
</section>
```

Search row when `searching === true`:

```html
<div class="programs-module__zTMsaW__directorySearchRow">
  <svg
    aria-hidden="true"
    class="programs-module__zTMsaW__directorySearchIcon"
    ...
  >
    …
  </svg>
  <input
    id="programs-catalog-search"
    aria-label="搜尋課程"
    class="programs-module__zTMsaW__input"
    autocomplete="off"
    type="search"
    value="zzzzzzz9999"
  />
  <button class="programs-module__zTMsaW__clearButton" type="button">
    清除搜尋
  </button>
</div>
```

Filter group snapshot (unchanged in empty state):

```html
<div
  class="programs-module__zTMsaW__directoryFilters"
  role="group"
  aria-label="課程篩選"
>
  <div class="programs-module__zTMsaW__directoryFilterGroup">
    <button
      class="programs-module__zTMsaW__filterChip"
      type="button"
      aria-pressed="true"
    >
      全部
    </button>
    <button
      class="programs-module__zTMsaW__filterChip"
      type="button"
      aria-pressed="false"
    >
      可報名
    </button>
    <button
      class="programs-module__zTMsaW__filterChip"
      type="button"
      aria-pressed="false"
    >
      已參加
    </button>
    <button
      class="programs-module__zTMsaW__filterChip"
      type="button"
      aria-pressed="false"
    >
      待審批
    </button>
  </div>
</div>
```

**Browser console / live-region findings:**

- `output[role="status"][aria-live="polite"].sr-only` text was `"正在載入課程"` at capture time (stale loading announcement, not an empty-state announcement). No error in console.
- Empty section attributes: `role=null`, `aria-live=null`, `aria-busy=null` — contrast with the sibling states:
  - `loading` branch: `<section id="programs-catalog-state" tabIndex={-1} class="boundaryState" role="status" aria-busy="true" aria-label="正在載入課程">`
  - `error` branch: `<section id="programs-catalog-state" tabIndex={-1} class="boundaryError" role="alert">`
  - `empty` branch: no `role`, `tabIndex`, or live attribute.

### 2.3 Screenshots

| Shot | Path (ephemeral) | Dimensions | State |
| --- | --- | --- | --- |
| **Live empty state** | `/var/folders/pw/6vk89mjx4klgcgc8yp48y_lm0000gp/T/omp-sshots-155e842daf372283.webp` | 390×844 (WebP 14.09 KB) | `q="zzzzzzz9999"`, filter `全部`, empty card visible, focus ring on search input |
| **Design export — filled catalog** | `/var/folders/pw/6vk89mjx4klgcgc8yp48y_lm0000gp/T/omp-sshots-155e846f8bf72284.webp` | 362×1024 (WebP 17.07 KB, rendered 390×1104 → displayed 362×1024) | `file://…/participant/programs.html` (no empty-state variant exists in static export; shows 6 program cards) |

Screenshots were captured with `tab.screenshot({fullPage:true})` via the `browser` tool. Viewport deviceScaleFactor 1.25 (live) / file:// rendering at same mobile width.

---

## 3. Structural Facts (no design judgment)

### 3.1 Component logic — `participant-directory.tsx:217-410`

```ts
const filtered = useMemo(() => {
  if (!programs) return [];
  const q = query.trim().toLowerCase();
  return programs.filter((program) => {
    if (filter !== "all" && program.viewerState !== filter) return false;
    if (q === "") return true;
    return (
      program.name.toLowerCase().includes(q) ||
      (program.description ?? "").toLowerCase().includes(q) ||
      (program.category ?? "").toLowerCase().includes(q)
    );
  });
}, [filter, programs, query]);

const searching = query.trim() !== "";
```

- Empty triggers on `filtered.length === 0` when `programs !== null` (i.e., after `state.kind === "ready"`). While `state.kind === "loading"` or `"error"`, the empty branch is not rendered.
- `searching` gates the `清除搜尋` button; its handler is `setQuery("")`.
- `清除篩選` handler resets both: `setQuery(""); setFilter("all");`
- List removal: `{filtered.length === 0 && <section …directoryEmpty>}` and `{filtered.length > 0 && <ul …directoryList>}` — mutually exclusive, not co-rendered/visually hidden.
- Filter constants (`FILTERS`): `all / eligible / active / pending` mapped to labels `全部 / 可報名 / 已參加 / 待審批`.

### 3.2 CSS — `programs.module.css` (measured values via `getComputedStyle` + `getBoundingClientRect`)

| Selector | Key properties | Measured (live empty state) |
| --- | --- | --- |
| `.directorySearch` | `margin: 0 0 1.25rem` | search block occupies y ~231→327 |
| `.directorySearchRow` | `display:flex; position:relative; gap:0.5rem` | flex row; in practice at 390px the `clearButton` wrapped to next line (stacked) |
| `.directorySearchIcon` | `position:absolute; left:0.75rem; top:50%; width:1.25rem; height:1.25rem; color:var(--ink-muted); pointer-events:none; transform:translateY(-50%)` | icon inside input left padding |
| `.directorySearchRow .input` | `flex:1; min-width:0; padding-left:2.5rem` | `input#programs-catalog-search` geom `x29 y231 w332 h44`, `border-color rgb(23,106,135)` when focused, `outline rgb(23,106,135) solid 3px`, `document.activeElement === input` is true during capture |
| `.clearButton` | `min-height:44px; padding:0.5rem 0.875rem; border:1px solid var(--line-strong); border-radius:var(--radius-sm); background:var(--surface-raised)` | geom `x29 y283 w332 h44`, `display:block`, text `清除搜尋`, `type="button"` |
| `.directoryFilters` | `margin:0 0 1rem; border:0` + `role="group" aria-label="課程篩選"` | visible below search (chips y ~339→385) |
| `.directoryFilterGroup` | `display:flex; flex-wrap:nowrap; gap:0.5rem; overflow-x:auto; padding:0.125rem 0 0.875rem` | horizontal scroll container, 4 chips |
| `.filterChip[aria-pressed="true"]` | `color:var(--surface-raised); background:#171a1d; border-color:#171a1d` | `全部` pressed |
| `.directoryEmpty` | `margin-top:0.75rem; padding:2.125rem 1.375rem; text-align:center` + `.boundaryState` | `section#programs-catalog-state.directoryEmpty` geom `x29 y423 w332 h194`, `background rgb(244,245,243)`, `border 1px solid rgb(214,220,222)`, same bg as `body rgb(244,245,243)` |
| `.boundaryTitle` inside empty | `h2` | `x52 y458 w286 h30`, text `找不到相關課程` |
| Empty `p` | sibling of title | `x52 y496 w286 h26`, text `請嘗試其他關鍵字或清除篩選。` |
| `.retry` inside empty (mapped to `catalogClearFilters`) | `min-height:44px` (inherited) | geom `x52 y538 w286 h44`, `border-color rgb(156,48,44)` (danger/red), text `清除篩選`, `type="button"` |

- **Layout math:** `input.bottom = y231+44 = 275`, `clearSearch.y = 283` (gap 8px), `empty.top = 423`.
- **Input accessibility:** `aria-label="搜尋課程"`, `id="programs-catalog-search"`, `autocomplete="off"`, `type="search"`, **no `placeholder` attribute** (`inputHasPlaceholder === false`). Label is exposed via `aria-label`, not `<label for>`.
- **Viewport at capture:** `window.innerWidth 390`, `innerHeight 844`, `scrollY 0`, `emptyInViewport true`.

### 3.3 Design export ground truth (`programs.html`)

- **File type:** static HTML with inline styles (handoff, not production code). Opened via `file://`, not localhost (spec's `file://` path for design comparison; this task's comparison tile is intentionally `file://`).
- **No empty-state variant exists** in the export — the static mock renders only the filled catalog:
  - Header: `height:72px` with `font-weight:600 "課程"` + `h1 clamp(1.72rem,6vw,2.25rem)` + `p color #59636a "尋找合適的課程，查看聚會及報名狀態。"`
  - Search: `input#program-query type="search" placeholder="搜尋課程"` inside `position:relative` with `svg 22px left 14px top 50%` + `label htmlFor="program-query"` (visually hidden) + input `min-height 50px padding 12px 14px 12px 46px border 1px solid #868182 radius 9px bg #ffffff`
  - Filters: `div aria-label="課程篩選"` with 4 chips `min-height 44px padding 9px 14px border-radius 99px`, active style `border #171a1d bg #171a1d color #fff`
  - Catalog: `div overflow hidden border 1px solid #868182 radius 10px bg #fff` containing 6 `<button>` cards each `min-height 72px padding 16px grid 1fr auto gap 14px border-bottom 1px solid #d6dcde`, each with status pill (`min-height 26px padding 3px 9px radius 99px`) + program name `font-weight:600` + secondary copy `color #59636a .86rem` + `svg 20px color #59636a` chevron.
- **Static pills (hard-coded in export):** `已參加` (`#9cb49d / #2e6b37 / #e9f0ea`), `待審批` (`#c1ad95 / #8a5b16 / #f3eee8`), `可報名` (same as pending), `由同工安排`, `已拒絕` (`#d7a199 / #b3261e / #fbecea`), `已封存`.
- **Placeholder vs live:** export uses `placeholder` attribute; live uses `aria-label` with no placeholder.

---

## 4. Visual Facts From Screenshots (observed, not judged)

### 4.1 Live empty state (390×844)

Capture order top → bottom:

1. `h1 "課程"` + lead `p "尋找合適的課程，查看聚會及報名狀態。"` inside white card `shell`.
2. **Search input:** white rounded field (`radius var(--radius-sm) ~9px`) with blue focus outline `3px solid rgb(23,106,135)`, `border rgb(23,106,135)` when focused, text `zzzzzzz9999` left-aligned, native search `×` glyph visible at right edge (native `type="search"` decoration) alongside the custom icon area, icon (magnifier) visibly faint at left padding (≈0.75rem) — appears slightly clipped behind the text baseline in the static capture but `pointer-events:none` confirms it does not intercept input.
3. **Clear-search button:** full-width white button `44px` height, `radius var(--radius-sm)`, `border var(--line-strong)`, label `清除搜尋` centered, positioned **below** the input (stacked), not inline-end. Gap between input and button ≈8px.
4. **Filter chips:** single row, 4 pills, `全部` filled black (`#171a1d` bg, white text, pill), others white with gray border `#868182`. Text: `全部 / 可報名 / 已參加 / 待審批`.
5. **Empty card:** light gray (`#f4f5f3`, matching page bg) rounded rectangle with thin gray border, centered stack:
   - `h2 1.125rem-ish "找不到相關課程"` (≈30px tall, y458)
   - `p "請嘗試其他關鍵字或清除篩選。"` (≈26px, y496, `color var(--ink)` `~0.95rem`)
   - Button `清除篩選` full-width inside card, white bg, thin red border `rgb(156,48,44)`, red text, `44px` height, `radius 8px`.
6. **Bottom nav:** 5 items (首頁 / 課程與活動 highlighted / 簽到 central red FAB / 通知 / 帳戶), fixed bottom, icons `20-22px`.

- No catalog list items are visible.
- No spinner/loading chrome overlaps the empty card at capture time (loading state had already resolved to `ready`).

### 4.2 Design export — `programs.html` (filled state)

- Search input shows placeholder text `搜尋課程` (faded `#868182`) with visible magnifier icon `22px` centered vertically in left padding.
- Filter chips identical set but with placeholder value styling (empty value case).
- Catalog container is a **white** card (`bg #ffffff border #868182`) with **6** demo rows as noted above, each with colored status pill and chevron. No empty-state chrome is modeled; the file has no `找不到相關課程` node and no `清除篩選` / `清除搜尋` button in the empty sense.
- Bottom nav: same 5 items, active emphasis on `課程`.

---

## 5. CLI Findings vs. Visual Correlation

| # | File:Line | Rule | What triggered | Verdict |
| --- | --- | --- | --- | --- |
| — | `participant-directory.tsx` | — | No detector rule fired | **0 findings** — clean pass. No structural antipattern surfaced for this screen slice. |

No detector finding maps to or contradicts the visual evidence. That is itself a signal: the empty state's issues (if any) are not of the kind the lexical/SAST detector is wired to catch (it looks for a11y/pattern antipatterns like `onClick` without keyboard, bare `img` without alt, etc.), not for content/layout correctness.

---

## 6. False Positives & Skipped / Failed Steps

### False positives

- **None** — detector returned `[]`, so there is no finding to classify as true/false.

### Skipped / failed browser steps (with concrete reasons)

| Step | Status | Reason / Fallback |
| --- | --- | --- |
| Login via `/` form (`E2E_member` / `E2E_member!dev` + "登入" click) | **Skipped — already authenticated** | On arrival at `http://127.0.0.1:8787/` the worker reused the existing session cookie. `tab.goto("/programs")` resolved to the shell + directory without a login interstitial; `tab.goto("/profile")` confirmed the authenticated header. Re-running credential entry would have risked session invalidation during concurrent critique runs, so the existing session was reused (state explicitly preserved per task note: _do not mutate D1_). |
| `tab.click` → `tab.type` on `searchbox` ref `e51` | **Failed → recovered** | `tab.click("e51") timed out after 8000ms` (flex-row/absolute-icon hit-test ambiguity). Fallback used was `evaluate` with `HTMLInputElement.prototype.value` native setter + `input`/`change` event dispatch, which reliably triggers React's synthetic `onChange` for the controlled `query` state. Verified by subsequent aria snapshot showing `searchbox "搜尋課程" [active]: zzzzzzz9999` and `emptyFound true`. |
| Design comparison overlay injection (`visibility.set(true)` / `Human` tab overlay) | **Not attempted — no detector issues to overlay** | Per spec, overlay flow highlights detector-reported issues. With 0 findings, there is no overlay to inject; behavior is correct. |
| Keyboard-driven visual regression harness (custom Playwright script) | **Not used — harness provides `browser` tool** | Spec allows native browser-canvas screenshot path before falling back to a custom script. `browser`'s `tab.screenshot`/`ariaSnapshot`/`evaluate` covered evidence. |

No steps were left incomplete. All recovery paths were verified by re-observing the aria snapshot and DOM after each action.

---

## 7. Evidence Completeness Checklist (Assessment B only)

- [x] Detector run on `web/lib/programs/participant-directory.tsx` with `--json` — output captured (`[]`, 0 findings).
- [x] Live server probed via `browser` at mobile viewport `390×844` (not `file://`, not `curl`).
- [x] Auth verified (authenticated shell observed; no state mutation).
- [x] Empty state triggered client-side (`filtered.length === 0` via nonce query `zzzzzzz9999`) — DOM + aria snapshot proof.
- [x] Structured evidence captured: search input attrs, filter group attrs, empty section HTML, list absence, live-region text, geometry via `getBoundingClientRect` + `getComputedStyle`.
- [x] Screenshots captured: live empty state (390×844 WebP) + design export filled reference (362×1024 WebP).
- [x] No source files modified; no enrollment/management submission performed.
- [x] No cross-assessment contamination — this report does not reference any Assessment A output.

---

## 8. Raw Pointers for Audit

- **Detector script:** `/Users/noah.wong/.dotfiles/ai/agents/skills/impeccable/scripts/detect.mjs` → delegates to `detector/detect-antipatterns.mjs`
- **Scanned file:** `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/stack-385-389/web/lib/programs/participant-directory.tsx`
- **CSS file (contextual):** `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/stack-385-389/web/app/programs/programs.module.css` (lines 1240-1383 for search/empty/filter)
- **Copy source:** `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/stack-385-389/web/lib/copy.ts:810-826`
- **Design file:** `/Users/noah.wong/Desktop/code/EFCC-dev/.scratch/efcc-redesign-handoff-2026-08-18/source/claude-design/design_export/participant/programs.html`
- **Live URLs exercised:** `http://127.0.0.1:8787/`, `http://127.0.0.1:8787/programs`, `http://127.0.0.1:8787/profile` (verification only)
- **Screenshot paths (temp, ephemeral):** `omp-sshots-155e842daf372283.webp` (live empty), `omp-sshots-155e846f8bf72284.webp` (design filled)

---

_Report persisted to this file per task directive; the chat response for this T2B slice is intentionally short — this markdown is the deliverable. No code was changed._
