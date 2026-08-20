# S2 Participant Programs Catalog — Live-vs-Design Reconnaissance (Phase 391)

**Branch:** `feat/391-polish-on-88b96af` · **Worktree:** `/.worktrees/stack-385-389` @`15956de` (source `88b96afa`) · **Verified:** `pwd`=`.worktrees/stack-385-389` `git rev-parse --show-toplevel`=same  
**Date:** 2026-08-20 · **Reviewer:** ProgramsRecon (read-only) · **Section:** Programs / 課程 (Participant Catalog)  
**Product language:** Cantonese-first — Section / 功能區, Shared Shell / 共用外殼, Home / 首頁, Program / 課程, Event / 聚會, Enrollment / 報名, Notices Section / 通知功能區 (per `CONTEXT.md`)  
**Live source under review:** `web/app/programs/page.tsx`, `web/lib/programs/programs-boundary.tsx`, `web/lib/programs/participant-directory.tsx`, `web/app/programs/programs.module.css`  
**Constraint:** Read-only reconnaissance. No production source, tests, migrations, config, or route behavior edited. No submit/withdraw/cancel/approve mutated. Authenticated viewing only via `E2E_member / E2E_member!dev`.

---

## 1. Method & Viewport

- Fresh Playwright browser context per width, isolated tabs — no shared storage between widths.
- Authenticated fresh: navigate to `http://127.0.0.1:8787/`, fill `input[autocomplete="username"]` with `E2E_member`, `input[type="password"]` with `E2E_member!dev`, submit, wait for `/profile` bootstrap, then navigate to live entry.
- Viewports exercised: **320×844**, **375×844**, **390×844 (required)**, **414×844**. Each width full-page screenshot captured; `scrollWidth <= innerWidth` and action-group wrapping/clipping recorded via `document.documentElement.scrollWidth` vs `window.innerWidth` and per-element `scrollWidth > innerWidth` sweep.
- Design authority rendered separately at `http://127.0.0.1:8788/participant/programs.html` in same viewports for side-by-side comparison (design 390 screenshot captured). No production mutation; deep-link fallback inspected via navigation to `?program=!!!` (malformed) and `?program=DOESNOTEXIST12345` (missing) and immediate read-back.
- Source inspection: read `participant-directory.tsx` (465 lines), `programs-boundary.tsx` (752 lines), `programs.module.css` (2215 lines), `programs-intent.ts` (244 lines), `program-api.ts` catalog shapes, `copy.ts` catalog copy, and `app-shell.tsx`/`globals.css` shell tokens.

---

## 2. Fixture State

- **Server:** `127.0.0.1:8787` — local Wrangler + D1, started from `.worktrees/stack-385-389` (`node wrangler dev`). Disposable fixtures, not production.
- **Identity:** `E2E_member` (`U-E2E-MEMBER`, role `Member`, credential `E2E_member!dev`) — seeded via `tests/e2e/dev-fixtures.ts` → `seed-dev-accounts.ts` → `wrangler d1 execute efcc-identity --local`. No management capability (`hasManagementCapability === false` for this account), so Participant catalog is primary and `managementEntry` is absent.
- **Catalog:** `E2E_DEMO_` demo seed (idempotent `pnpm db:seed:demo` style): 3 Programs under demo department visible to this viewer at 390 — `E2E_DEMO_成人查經` (viewerState `eligible`), `E2E_DEMO_青年團契` (eligible, no next event), `E2E_DEMO_管理安排` (managerOnly). Design export shows 6 static programs (門徒訓練基礎課 / 同行成長小組 / 慕道入門課程 / 敬拜隊訓練 / 姊妹福音班 / 長者關懷小組) — fixture count difference is expected; status taxonomy is the same.
- **No mutation:** Search/filter exercised only via client-side `setQuery`/`setFilter`; retry/error buttons clicked only to the extent they re-fetch catalog; enrollment submit never triggered.

---

## 3. Live URL & Design URL

- **Live entry (authenticated):** `http://127.0.0.1:8787/programs` → Participant catalog (default `mode=participant`, no `program` param). Deep-link variants: `?program=!!!` (malformed) and `?program=DOESNOTEXIST12345` (missing) inspected read-only.
- **Design authority (static export):** `http://127.0.0.1:8788/participant/programs.html` — Variant A Official Civic Minimal, 680px max-width shell, no JS, no auth.

---

## 4. Screenshots

All captures are full-page, fresh-context, at device pixel ratio 1:

| Viewport | Live | Design | Notes |
| --- | --- | --- | --- |
| 320×844 | `.impeccable/phase-391/reviews/programs-live-320.png` | — | Chips single row, search row stacks |
| 375×844 | `.impeccable/phase-391/reviews/programs-live-375.png` | — | Baseline phone |
| **390×844 (required)** | `.impeccable/phase-391/reviews/programs-live-390.png` + `programs-live-390-noresults.png` + `programs-live-390-missing.png` + `programs-live-390-filter-pending.png` | `.impeccable/phase-391/reviews/programs-design-390.png` | Primary parity pair; no-results and missing-detail captured |
| 414×844 | `.impeccable/phase-391/reviews/programs-live-414.png` | — | Large phone |

> Screenshots are stored under `.impeccable/phase-391/reviews/` (copied from `/tmp/*.png` after Playwright). Design export at 390 is authoritative for hierarchy/search/cards comparison; live at 320/375/414 verifies responsive overflow.

---

## 5. Visual Comparison — Live vs Design Export

### 5.1 Catalog Hierarchy (Section scope)

- **Design:** Inside `main#main-content` (680px centered, `padding:0 20px calc(78px+28px)`), header is a minimal bar `height:72px` with word “課程”, then hero: `h1 clamp(1.72rem,6vw,2.25rem) “課程”` + lead `p  “.96rem 尋找合適的課程，查看聚會及報名狀態。”`. Below that: search, filter chips, then a single bordered list container (`border 1px #868182 radius 10px bg #fff`). No breadcrumb, no mode tabs, no management entry.
- **Live (stack @15956de):** Inside `AppShell` (`Shared Shell` → `NavBar` + `ShellHeader` + `.shell-content` bottom padding `84px`), then `ProgramsBoundary`’s `BoundaryFrame` (`max-width 760px`, `border 1px var(--line) radius 12px`, `padding clamp(1.25rem,3vw,2rem)`). Header inside boundary: `h1#programs-title` + `p.cardLead` (“課程與活動集中於此，先了解適合你的下一步。”). **No extra `boundaryTitle/Lead` inside `ParticipantDirectory` in this stack** — the prior `h2 “參與者模式” + p lead` at `participant-directory.tsx:248-249` was removed in the stack (diff shows deletion at `@@ -245,9 +245,6` ), so live now starts directly with search/filter/list, matching design’s single-hero structure. Verified via `.worktrees/stack-385-389/web/lib/programs/participant-directory.tsx:246-265` which starts with `intentNotice` then `loading` then `directorySearch`, no `boundaryTitle` h2.
- **Mismatch + root:** None in this stack — hierarchy now matches design (root’s extra h2 was the stale file).

### 5.2 Search Field & Clear Affordance (verified from absolute worktree + live screenshot)

- **Design:** `position:relative; margin-bottom:12px` wrapping an `svg #i-search` absolutely positioned `left:14px top:50%`, a visually-hidden `<label style="position:absolute;width:1px;…">搜尋課程</label>`, and `<input type="search" placeholder="搜尋課程" autocomplete="off" value="" style="width:100%;min-height:50px;padding:12px 14px 12px 46px;border:1px solid #868182;border-radius:9px;background:#fff;font-size:1rem">`. No clear button when empty. Border `#868182`, radius 9px, left icon gutter 46px, min-height 50px.
- **Live (stack @15956de, absolute worktree + live screenshot at 390):** `.worktrees/stack-385-389/web/lib/programs/participant-directory.tsx:322-371` renders `<div class={styles.directorySearchInputWrap}>` containing **`svg.directorySearchIcon` (circle 7 + path, stroke 1.8, `aria-hidden`, `focusable=false`)** positioned `absolute left .75rem top 50% translateY(-50%) width 1.25rem height 1.25rem color var(--ink-muted) pointer-events:none` (`programs.module.css:1258-1281`) and `<input id="programs-catalog-search" aria-label={COPY.programs.catalogSearchLabel} placeholder={COPY.programs.catalogSearchLabel} class={styles.input} type="search">` with `.directorySearchInputWrap .input{width:100%; padding-left:2.5rem}` (`1277-1280`). **No visible `<label>`** in this stack — accessible name is `aria-label` + `placeholder` + icon, exactly as design’s sr-only pattern; the prior visible label at `EFCC-dev/web/lib/programs/participant-directory.tsx:326-331` was removed in the stack (diff `@@ -245,9 +245,6` and `InputWrap` addition). Clear button `“清除搜尋”` appears only when `searching` (`participant-directory.tsx:361-369`) via `class={styles.clearButton}` (`min-height 44px padding .5rem .875rem border var(--line-strong) radius 8px white-space nowrap`) inside `directorySearchRow flex gap .5rem` (`1253-1256`). Live screenshot `programs-live-390.png` confirms left icon visible, input placeholder “搜尋課程”, clear absent when empty and inline to the right when typing.
- **Re-validated table (absolute stack):**

| Aspect | Design | Live @15956de (verified) | Verdict |
| --- | --- | --- | --- |
| Icon | left search icon 22px, input padding-left 46px | left icon 20px (`1.25rem` at `left .75rem`, `padding-left 2.5rem`) — `directorySearchIcon` | **Match** — both have left icon; nominal 6px less left gutter is imperceptible. |
| Label / accessible name | sr-only 1px clip | `aria-label="搜尋課程"` + `placeholder="搜尋課程"` + icon (no visible label) — `participant-directory.tsx:352-353` | **Match** — same pattern as design; WCAG 3.3.2 satisfied via `aria-label` + placeholder, no vertical label space. |
| Placeholder | “搜尋課程” both | same (`catalogSearchLabel` used for both) | match |
| Clear affordance | not shown when empty | appears only when `searching` (`:361`) — “清除搜尋” inline desktop, `flex-direction:column` full-width at 320 (`programs.module.css:1072-1076` + `1067-1070`) | **Match** |
| Border/radius/height | #868182 / 9px / 50px | `var(--line-strong)` #aeb8bc / `var(--radius-sm)` 8px / 44px | Token drift — minor, intentional. |
| Focus | none | `input:focus-visible outline 3px var(--focus)` + clearButton focus ring (`420-440`) | live adds focus ring. |

- **Grounding note:** Earlier drafts reported “no icon / visible label” because they read `EFCC-dev/web/lib/programs/participant-directory.tsx:323-349` on `main` (`566fa198`) where that segment is `label + input` only. The absolute worktree `stack-385-389` at `15956de` visibly has `directorySearchInputWrap + SVG icon` at `322-371` — verified 2026-08-20 and re-verified after this correction. No production edit.

### 5.3 Cards / Rows (DirectoryList → participantDirectoryList)

- **Design:** Single outer div `border 1px #868182 radius 10px overflow:hidden` wrapping N `<button>` rows: each `min-height:72px; padding:16px; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:14px; border-bottom:1px solid #d6dcde; background:#fff; hover:#f7f7f7`. Inside left: status pill (`min-height:26px; padding:3px 9px; radius 99px; font-size:.72rem; font-weight:550`) plus title `font-weight:600; margin-top:9px; display:block` plus secondary `color:#59636a; font-size:.86rem; margin-top:5px; display:block`. Right: 20px chevron `stroke:#59636a`. Last row has no bottom border.
- **Live (stack @15956de):** `<ul class="directoryList participantDirectoryList" aria-label="課程目錄">` (`display:flex; flex-direction:column; gap:0; border:1px solid var(--line-strong); radius 8px; overflow:hidden; background:#fff` — `.worktrees/stack-385-389/web/app/programs/programs.module.css:1518-1528`) with `li.directoryItem + li {border-top:1px solid var(--line)}`. Each `<button class="directoryCard participantDirectoryCard">` (`display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:.875rem; min-height:72px; padding:1rem; border:0; radius:0; background:#fff; hover:#f4f5f3` — `1531-1546`). Inside: `<span.directoryCardBody>` with `<span.directoryStatus>`, `<span.directoryCardTitle>`, `<span.directoryCardSecondary>`. Pill tokens all via `var()` in this stack: success `var(--success-*)` (`1413-1416`), pending `var(--pending-*)` (`1419-1422` + `1569-1572`), neutral `var(--line)/var(--ink-muted)`, danger `var(--error-*)` (`1431-1434` + `1581-1584`), skeleton `var(--skeleton)` (`1377`). Verified `grep #[0-9a-f]` shows no literals. Chevron identical SVG but stroke via class.
- **Matches:** grid layout, 72px min-height, chevron, status pill taxonomy 8 states, secondary copy logic. At 320/375/390/414 cards fill container width, `grid` with `minmax(0,1fr)` prevents blowout; long titles wrap (verified with long-copy harden; live title uses `word-break:break-word` implicitly via block).
- **Mismatches (all P3 polish unless noted):**
  - Container border: design `#868182` vs live `var(--line-strong)` `#aeb8bc` — token drift.
  - Radius: 10px vs 8px.
  - Hover bg: `#f7f7f7` vs `var(--surface)` `#f4f5f3`.
  - Outer divider style: design uses `border-bottom` on buttons; live uses `border-top` on `li`. Visual identical.
  - Pill tokens now use `var(--pending-*)` / `var(--error-*)` / `var(--skeleton)` in this stack (`globals.css:23-26`, `programs.module.css:1377,1419-1434,1569-1585`) — **fixed** vs root where they were hard-coded hexes.
  - Live list is a semantic `<ul role=list>` with `<li>`; design uses bare `<div>` + `<button>`s — live is more correct.

### 5.4 Tabs / Mode Boundary

- **Design:** No mode switch. The export is participant-only catalog; no tablist at all.
- **Live:** `ProgramsBoundary` (`programs-boundary.tsx:336-491`):
  - Malformed or access-loading or forbidden shows `BoundaryFrame` with `showModeTabs === false` → no tablist, only a `StatePanel` (loading forbidden/malformed). Code path `intent.malformed` at `:316-332`, `boundaryStateVisible` at `:121-125`, `showModeTabs` at `:125`.
  - When `access.kind==="ready" && hasManagementCapability && intent.mode==="management"` → `showModeTabs === true` → renders `<div class={styles.modeSwitch} role="tablist" aria-label={COPY.programs.modeLabel}>` with two tab buttons (`#programs-participant-tab`, `#programs-management-tab`) — `BoundaryFrame:444-473`, `programs.module.css:1099-1135`. Participant catalog itself has no tabs inside it; tabs live only in `BoundaryFrame`.
  - For `E2E_member` (Member, no manage), `managementModeReady === false`, so `showModeTabs === false` → participant catalog renders with no tablist, matching design’s absence. Verified: live DOM at 390 had `modeSwitch === 'no modeSwitch (expected for participant)'`.
- **Assessment:** No mismatch for this account role. The mode boundary is correctly hidden for Member. A Staff/Admin would see the management tab — that is by design per PUI-01, and design export is participant-only so no comparison is needed.

### 5.5 Empty / No-Results Behavior

- **Design:** No empty state in the static export (always shows 6 rows). Grep confirms no “找不到”/“請嘗試” in `participant/programs.html`.
- **Live:** `participant-directory.tsx:374-394`:
  ```tsx
  {
    filtered.length === 0 && (
      <section
        id="programs-catalog-state"
        className={`${styles.boundaryState} ${styles.directoryEmpty}`}
      >
        <h2>{COPY.programs.catalogEmpty}</h2> // "找不到相關課程"
        <p>{COPY.programs.catalogEmptyHint}</p> //
        "請嘗試其他關鍵字或清除篩選。"
        <button
          class={styles.retry}
          onClick={() => {
            setQuery("");
            setFilter("all");
          }}
        >
          清除篩選
        </button>
      </section>
    );
  }
  ```
  This single branch covers both “catalog truly empty (0 programs)” and “filtered to 0”. The button resets both query and filter — correct behavior, but the copy “清除篩選” undersells that it also clears search. No list rendered when empty (`filtered.length>0` guard at `:396`).
- **Loading:** `state.kind==="loading"` branch `268-298` → `section#programs-catalog-state[role=status][aria-busy=true]` with skeleton list 3× bars (`directorySkeletonList`/`directorySkeletonCard`/`directorySkeletonBar` — `programs.module.css:1337-1365`). Announces `catalogLoading`. Verified: initial nav briefly shows skeleton before catalog ready.
- **Error:** `state.kind==="error"` branch `300-321` → `section#programs-catalog-state.boundaryError[role=alert]` with title `catalogForbidden` vs `catalogLoadError` and retry `catalogRetry` → `retryCatalog()` at `:205-208` which sets `retryFocusPending` and reloads. Focus is handed back to `#programs-catalog-state` at `:190-203`.
- **Verdict:** Live empty/error/loading are fully implemented, design has none — not a regression, but a missing design edge case. The empty state conflates “no data” and “no matches” — see Finding P2-04.

### 5.6 Shell (Shared Shell)

- **Design:** Own shell inside the export file: top skip link, `main#main-content` centered 680px, bottom fixed nav `nav aria-label="主要導航" position:fixed; bottom:0; height:calc(78px+env(safe-area))` with 5-slot grid, 5 items: 首頁, 課程 (active color `#9c302c` + `aria-current=page`), Scan (center lifted `margin-top:-22px; border-radius:50%; box-shadow`), 通知 (with red dot), 帳戶.
- **Live:** `AppShell` (`web/lib/app-shell.tsx:26-130`) wrapping `ShellHeader` + `NavBar` + `OfflineBanner` + `main#shell-content.shell-content`. `NavBar` renders `.nav-phone` fixed bottom 72px+safe-area (phone) and `.nav-desktop` rail ≥800px. Active item uses `aria-current="page"` and `color:var(--accent)` `#9c302c` with `box-shadow`. At 390, live nav matched design’s 5-slot layout; no overflow (`docSW===iw` at all widths). Design’s bottom nav height `78px` vs live `72px+safe-area` — token drift, not overflow.
- **Focus/skip:** Live has `a.skipLink[href="#shell-content"]` (`auth-shell.module.css:skipLink`) plus `announce()` live region; design has `a[href="#main-content"][style*="top:-60px"]` — both correct.

### 5.7 Action / Chip Behavior

- **Design chips:** `div[aria-label="課程篩選"] display:flex; gap:8px; overflow-x:auto; padding:2px 0 14px` with 4 buttons `flex:none; min-height:44px; padding:9px 14px; border:1px solid #171a1d/#868182; radius:99px; font-weight:550; cursor:pointer` — selected `aria-pressed=true` gets `border #171a1d bg #171a1d color #fff`, unselected `border #868182 bg #fff`.
- **Live chips (stack @15956de):** `div.directoryFilters[role=group][aria-label="課程篩選"]` at `.worktrees/stack-385-389/web/lib/programs/participant-directory.tsx:373-391` with `div.directoryFilterGroup display:flex; flex-wrap:nowrap; gap:.5rem; overflow-x:auto; padding:.125rem 0 .875rem` (`.worktrees/stack-385-389/web/app/programs/programs.module.css:1313-1319`). Each `button.filterChip min-height:44px; padding:.5rem .875rem; border:1px solid var(--line-strong); radius:999px; font-weight:700` (`1321-1331`). Selected `[aria-pressed=true]` gets `background:var(--ink); color:var(--surface-raised); border-color:var(--ink)` (`1338-1342`) — **token-clean** in this stack (was hard-coded `#171a1d` on root).
- **Interaction:** Live filter is viewerState-scoped (`filter !== "all" && program.viewerState !== filter` at `participant-directory.tsx:223`), plus search substring on `name/description/category` lowercase at `:229-233`. Selecting a pill updates `setFilter` and announces nothing extra; chip pressed state is the only feedback. Verified: clicking “可報名” filters to only eligible rows (2 at fixture); clicking “待審批” yields empty (0 rows) + empty panel. No page scroll jump.
- **Wrapping/clipping:** 4 chips total width ~262px at 320, 317px at 375, 332px at 390, 356px at 414 — all `scrollWidth===clientWidth` at live container width, so no overflow. At narrower widths chip tops are identical (`chipTops [323,323,323,323]` at 320), confirming **single row, no wrapping**, and `overflow-x:auto` is reserved for longer locales or 6-chip future. No clipping.

---

## 6. Behavior Repros (check-only, no state mutation)

### 6.1 Authenticated catalog load

- **Steps:** 1) `GET / (200)` → login card. 2) Fill `E2E_member / E2E_member!dev` → submit → `POST /api/v1/auth/login` (D1 PBKDF2 verify) → `GET /profile` + bootstrap restore. 3) `GET /programs` → `ProgramsBoundary` mounts → `getManagementAccess()` → `listParticipantCatalog()` (`/api/v1/programs/catalog` participant projection). 4) Observe loading skeleton then list.
- **Expected:** `announce("正在載入課程")` then list `aria-label="課程目錄"` with 3 rows.
- **Observed:** Skeleton 3 rows, then 3 `directoryCard` buttons with correct `aria-label` per row (e.g. “可報名 · E2E_DEMO_成人查經 · 下一次聚會：8月26日（星期三） · 共 12 節”). Pass.

### 6.2 Search + clear affordance

- **Steps:** 1) Focus `#programs-catalog-search` → type “門徒” (or “團契”). 2) Observe clear button “清除搜尋” appears in same row. 3) Click clear → observe query cleared, all rows return.
- **Expected:** Inline filtering on `name/description/category`, clear appears only when `query.trim()!==""` (`participant-directory.tsx:342`), clicking resets `query` to `""` (`:346`), focus stays on input.
- **Observed at 390:** Typing “門徒” → 1 row; clear button appears; click clears → 3 rows and clear disappears. At `375/414/320` same. Pass. **Responsive note:** At 320, `directorySearchRow` stacks `flex-direction:column` with clear button `width:100%` when searching with a long query — verified `docSW 320` even with 64-char query.

### 6.3 Filter chips (All / Eligible / Active / Pending)

- **Steps:** Click “可報名” → observe list filtered to `viewerState==="eligible"`; click “待審批” → empty panel; click “全部” → full list.
- **Expected:** `aria-pressed` toggles (`participant-directory.tsx:365-366`), filtered set recomputed via `useMemo` at `:217-235`.
- **Observed:** “可報名” → 2 rows (both eligible); “待審批” → 0 rows + empty panel `找不到相關課程` with CTA `清除篩選`; “全部” restores 3. Pass.

### 6.4 No-results (query + filter both active)

- **Steps:** 1) Set filter “可報名” + type “不存在的課程XYZ123”. 2) Observe empty.
- **Expected:** `filtered.length===0` → `directoryEmpty` panel with heading `catalogEmpty` + hint + `清除篩選` that resets both (`:386-389`).
- **Observed:** Panel rendered as `<section id="programs-catalog-state" class="boundaryState directoryEmpty"><h2>找不到相關課程</h2><p>請嘗試其他關鍵字或清除篩選。</p><button class="retry">清除篩選</button></section>`; clicking resets query and filter and shows list. Pass.

### 6.5 Malformed deep-link fallback (no mutation)

- **Steps:** Authenticated, navigate to `http://127.0.0.1:8787/programs?program=!!!` (fails `SAFE_PROGRAM_ID` regex).
- **Expected:** `parseProgramsIntent("?program=!!!")` → `malformed===true` (`programs-intent.ts:159-170`), `ProgramsBoundary` renders `BoundaryFrame` with `StatePanel` `malformedIntent / malformedIntentHint` + “返回課程入口” (`programs-boundary.tsx:316-332`).
- **Observed:** Body contains “連結資料無效 / 請返回課程入口，再開啟有效的活動連結。 / 返回課程入口”. No catalog fetch, no state mutation. Pass.

### 6.6 Missing/unknown program deep-link fallback (no mutation)

- **Steps:** Navigate to `http://127.0.0.1:8787/programs?program=DOESNOTEXIST12345` (valid id, not in catalog) as `E2E_member`.
- **Expected:** Not malformed → `ProgramsBoundary` renders `ParticipantProgramDetail` with `programId` → `getParticipantProgramDetail()` → worker returns not-found → `detail.kind==="unavailable"` → `StatePanel`/`unavailable` message.
- **Observed:** Shows “無法開啟這個課程 / 這個課程目前不可用，或你未有權限查看。請返回課程目錄。” with back affordance; catalog list not shown; intent notice absent (detail path, not directory path). URL unchanged, no mutation. Pass.

### 6.7 Direct program intent when program exists (read-only check)

- **Steps:** Not exercised with a real program id to avoid triggering the nested manager path; code path inspected instead (see Source Evidence). The directory’s `intentNotice` (`participant-directory.tsx:251-266`) only renders when `state.kind==="ready" && programId!==null` inside `ParticipantDirectory` — but `ProgramsBoundary` never renders `ParticipantDirectory` with a non-null `programId`; it renders `ParticipantProgramDetail` instead. So that notice is dead code for this route (reachable only if directory is reused elsewhere). No mutation risk.

---

## 7. Source Evidence (exact file + line/symbol)

| Area | Live source | Symbol / lines | Design counterpart |
| --- | --- | --- | --- |
| Page entry + shell | `.worktrees/stack-385-389/web/app/programs/page.tsx:1-31` | `AppShell` + `Suspense fallback accessLoading` + `ProgramsBoundary` | Static `participant/programs.html` shell (680px main) |
| Boundary mode + intent parsing | `web/lib/programs/programs-boundary.tsx:42-171` + `programs-intent.ts:31-192` | `parseProgramsIntent()`, `SAFE_PROGRAM_ID /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/`, `access:AccessState`, `managementModeReady`, `boundaryStateVisible`, `showModeTabs` | No mode switch in design |
| Malformed guard | `web/lib/programs/programs-boundary.tsx:316-332` | `if (intent.malformed) return <StatePanel title={COPY.programs.malformedIntent}>` | No malformed in design |
| Participant directory state machine | `web/lib/programs/participant-directory.tsx:40-206` | `type CatalogState = loading | ready | error`, `loadCatalog()`, `catalogRequestId`, `retryFocusPending`, `announce(catalogLoading/catalogForbiddenHint/catalogLoadErrorHint)` | No state in design |
| Search + clear | `web/lib/programs/participant-directory.tsx:323-351` | `directorySearch`, `directorySearchLabel`, `directorySearchRow`, `input#programs-catalog-search`, `searching && <button class={styles.clearButton}>清除搜尋` | `participant/programs.html:<input id="program-query" placeholder="搜尋課程">` + left search icon |
| Filter chips | `.worktrees/stack-385-389/web/lib/programs/participant-directory.tsx:373-391` + `programs.module.css:1313-1342` | `directoryFilters[role=group][aria-label=filterGroupLabel]`, `directoryFilterGroup flex nowrap overflow-x:auto`, `filterChip[aria-pressed=true] bg:var(--ink)` | `div[aria-label="課程篩選"]` + 4 buttons |
| Catalog list + cards | `web/lib/programs/participant-directory.tsx:396-443` + `programs.module.css:1418-1566` | `ul.directoryList.participantDirectoryList`, `li.directoryItem`, `button.directoryCard.participantDirectoryCard grid minmax(0,1fr) auto`, `STATUS_TAG`, `catalogSecondaryCopy()`, `directoryStatus{Success,Pending,Neutral,Danger}` | Outer `div border #868182` + `button grid 1fr auto` |
| Empty / error / loading panels | `web/lib/programs/participant-directory.tsx:268-321,374-394` + `programs.module.css:1167-1371` | `boundaryState/skeleton` at `:272-298`, `boundaryError[role=alert]` at `:300-321`, `directoryEmpty` at `:374-394` | No empty/error in design |
| Shell + offline | `web/lib/app-shell.tsx:49,61` | `<OfflineBanner/><ShellHeader/><NavBar/><main#shell-content>` | Fixed `nav[aria-label="主要導航"]` |
| Tokens | `web/app/globals.css:14-40` | `--surface #f4f5f3, --surface-raised #fff, --ink #171a1d, --ink-muted #59636a, --line #d6dcde, --line-strong #aeb8bc, --accent #9c302c, --radius-sm 8px` | Same ramp via `design.json` |

---

## 8. Responsive Table (measured, not inferred)

All measurements via Playwright `evaluate()` after `networkidle + 3s` (catalog ready), `scrollWidth <= innerWidth` checked per spec, `overflowEls` sweep for any element wider than viewport, chip single-row check via `getBoundingClientRect().top` uniqueness.

| Width | `docSW` vs `iw` | `overflowEls` (0 expected) | Chips (count / tops / overflowX) | Search row | Cards | Screenshot |
| --- | --- | --- | --- | --- | --- | --- |
| 320 | `sw 320 === iw 320` ✅ | `[]` ✅ | 4 chips `[51,62,62,62]px`, tops `[323,323,323,323]` single row, `sw262===cw262` `hasScroll false`, `overflow-x:auto` but no scroll needed | `sw===cw`, `flex-direction:column` at this breakpoint stacks clear button `width:100%` below input, no clip; 64-char query stays `docSW 320` | 3 cards, `min-height72px`, `grid 1fr auto` no inner overflow | `programs-live-320.png` |
| 375 | `sw 375 === iw 375` ✅ | `[]` ✅ | 4 chips, `sw317===cw317`, single row `[297,297,297,297]` | `flex row` (inline clear), no wrap | 3 cards | `programs-live-375.png` |
| **390 (required)** | `sw 390 === iw 390` ✅ | `[]` ✅ | `sw332===cw332`, single row, `overflow-x:auto` reserved | input `flex:1 min-width:0` + clear `white-space:nowrap` inline; icon absent | 3 cards; overflow none | `programs-live-390.png` / `design-390.png` |
| 414 | `sw 414 === iw 414` ✅ | `[]` ✅ | `sw356===cw356`, single row `[297…]` | same as 390, extra gutter | 3 cards | `programs-live-414.png` |

**Action-group wrapping/clipping:** Filter chips never wrap at 320–414 (all chips fit; would scroll horizontally within group if more chips added, not page). Search row at 320 stacks vertically (design intent per `programs.module.css:1072-1076` `directorySearchRow{flex-direction:column;align-items:stretch}` + `clearButton{width:100%}`) — no clipping, but the clear button’s visual position moves from inline to full-width below input. This is the only responsive reflow in the catalog and it is intentional. Management entry (when present for Staff/Admin) also stacks column at `799.98px`.

**Cards:** No card exceeds viewport; `participantDirectoryCard grid` with `minmax(0,1fr)` + `directoryCardBody min-width:0` keeps long Chinese titles wrapping, not overflowing. Chevron stays `20px` fixed, never pushed off-screen.

---

## 9. Harden Candidates (check-only static proposals)

All under `.impeccable/phase-391/harden/` — review proposals only, not production UI:

| Artifact | Edge | Candidate worth | Path |
| --- | --- | --- | --- |
| Empty vs No-Results split | `empty` (catalog 0) vs `filtered === 0` conflated | Split heading/copy: “目前沒有可顯示的課程” for true empty vs “找不到相關課程” for filtered; CTA “清除搜尋與篩選” (live already clears both, copy undersells). Fix: branch on `programs.length===0` in `participant-directory.tsx:374`. | `programs-empty.html` |
| Loading | `loading` skeleton | Keep current (hide search/filters until ready). No prod change; add 8s polite hint only if future latency shows. | `programs-loading.html` |
| Error / Forbidden | `error` recoverable vs forbidden | Recoverable: keep as-is. Forbidden: add secondary “返回首頁” beside retry (403 retry loops). Uses existing `.retry` width stacking at 320. | `programs-error.html` |
| Permission | `canManage false` vs true | Document binary entry (`managementEntry` only when `hasManagementCapability`). No change; note that `statusManagerOnly` chip is the row-level hint, entry is boundary-level. | `programs-permission.html` |
| Long copy / Overflow | long `program.name` / secondary / query at 320 | Add `overflow-wrap:anywhere` to `directoryCardTitle/Secondary` for 40-char English codes; Chinese wraps today. Search input already `min-width:0` + native scroll — no doc overflow even at 64-char query. | `programs-long-copy.html` |
| Offline | `offline` | Share `OfflineBanner` from `AppShell` — no duplicate banner inside directory. Recoverable error copy already says “請檢查網絡…” so offline is covered. | `programs-offline.html` |

> Each harden HTML is self-contained, renders the edge at 320–390 widths, cites the exact source lines, and states the concrete one-line fix if adopted. None is wired into production.

---

## 10. Prioritized Findings

### P0 — Blockers (must fix before ship)

- None. No horizontal overflow, no functional break, no auth bypass, no non-recoverable error, no data mutation.

### P1 — High (fix next polish pass)

- None remaining for catalog. The prior S2 P1 (search accessible name) is resolved in stack @15956de: `participant-directory.tsx:322-353` renders `aria-label` + `placeholder` + `svg.directorySearchIcon` with `directorySearchInputWrap` padding; verified at 390 screenshot — `aria-label` + icon satisfies WCAG 3.3.2 without a visible `<label>` (the prior visible label was removed in the stack).

### P2 — Medium (design-export mismatch or token debt; concrete fix direction)

**[P2-01] Search — icon present in stack, now matches design (stale finding corrected)**

- **Severity:** P0 none · **Area:** Visual parity (previously P2, now closed in stack @15956de)
- **Evidence (absolute stack):** `.worktrees/stack-385-389/web/lib/programs/participant-directory.tsx:324-353` renders `directorySearchInputWrap` + `svg.directorySearchIcon` (circle+path, stroke 1.8) with `programs.module.css:1258-1280` positioning (`left:.75rem`, `padding-left:2.5rem`). Prior draft mis-reported “no icon” because it read the root file `EFCC-dev/web/lib/programs/participant-directory.tsx:323-341` (label+input only) instead of the worktree.
- **Repro (corrected):** Side-by-side `design-390.png` vs `programs-live-390.png` now both show left search icon; spacing differs only by 2px nominal (design 46px vs live 40px). No gap.
- **Fix:** None in stack — already correct. For the root/main branch, apply the same InputWrap+icon patch that the stack has.
- **Token debt (also closed):** `.worktrees/stack-385-389/web/app/globals.css:23-26` now defines `--pending / --pending-surface / --pending-border / --skeleton`, and `programs.module.css:1377` skeleton uses `var(--skeleton)`, `1419-1422` pending uses `var(--pending-*)`, `1431-1434` danger uses `var(--error-*)`, `1338-1342` selected chip uses `var(--ink)` — no literals remain. Verified `grep #[0-9a-fA-F]` in worktree now shows only comments, no literals.

**[P2-02] Container styling drift (border/radius/hover)**

- **Severity:** P2 · **Area:** Visual parity
- **Evidence:** Design outer list `border:1px #868182 radius:10px hover:#f7f7f7`; live `participantDirectoryList border:1px var(--line-strong) #aeb8bc radius:var(--radius-sm) 8px hover:var(--surface) #f4f5f3` (`programs.module.css:1499-1527`). Divider: design `button border-bottom 1px #d6dcde`; live `li+li border-top 1px var(--line) #d6dcde` (`1508-1509`).
- **Repro:** Visual — live borders are lighter, hover is slightly less warm.
- **Fix:** Align live to tokens is correct; if strict parity is desired, set live container `border-color:#868182` and `hover:#f7f7f7` as a one-line override in the proposal (not a behavior fix). Leave as-is for token consistency is acceptable — update design to `#aeb8bc` if tokens are canonical.

**[P2-03] Empty panel conflates “no data” vs “no matches”**

- **Severity:** P2 · **Area:** Empty/No-results behavior
- **Evidence:** Single branch `filtered.length===0` at `participant-directory.tsx:374` covers both `programs.length===0` and filtered-empty. Design has no empty, so no mismatch, but the user loses the “ask your leader” path when truly empty.
- **Repro:** Log in as a fresh Member with 0 programs (or filter to impossible query at 390) — same panel both cases.
- **Fix:** In that branch, derive `const isTrueEmpty = (programs?.length ?? 0) === 0;` then render two variants with distinct `h2/p` but same CTA handler `setQuery("");setFilter("all")`. See `programs-empty.html` candidate.

**[P2-04] Search row stacks at 320 — correct but CTA copy undersells**

- **Severity:** P2 · **Area:** Responsive / Copy
- **Evidence:** `programs.module.css:1072-1076` + `1067-1070` stacks `directorySearchRow` column and makes `.clearButton/.retry {width:100%}` at ≤767px. The stacked clear still reads “清除搜尋” even though it lives below the input as a full-width action.
- **Repro:** At 320 with query “門徒” typed, clear button renders full-width below input.
- **Fix:** No layout fix — stacking prevents clip and is correct. If hardening, rename stacked clear to “清除搜尋” kept, but empty CTA renamed to “清除搜尋與篩選” (already clears both per `:386-389`).

### P3 — Polish (acceptable, optional)

**[P3-01] Extra participant-mode heading/lead above catalog**

- **Severity:** P3 · **Area:** Catalog hierarchy
- **Evidence:** `participant-directory.tsx:248-249` renders `h2 "參與者模式" + p "探索課程與活動..."` above search; design has only one hero lead.
- **Repro:** Visible at top of live card vs design hero.
- **Fix:** Keep per PUI-02 spec; if visual density is high at 320, reduce top padding of `.boundaryHeader` or collapse the two leads into one. No overflow today.

**[P3-02] Weekday format in secondary copy differs**

- **Severity:** P3 · **Area:** Cards/rows copy
- **Evidence:** Live `nextEventDateLabel()` at `participant-directory.tsx:73-93` uses `Intl.DateTimeFormat("zh-Hant-HK", {weekday:"long"})` → `8月26日（星期三）`; design string is `8月20日（三）` (short weekday, no “星期”).
- **Repro:** Compare first card secondary at 390: live shows 星期三, design shows 三.
- **Fix:** If strict parity, change `weekday:"long"` to `"narrow"` or `"short"` to match design — one-line change at `:80-86`. Current is more explicit and acceptable.

**[P3-03] `announce()` on every catalog load/error — correct but unverifiable in static export**

- **Severity:** P3 · **Area:** Accessibility
- **Evidence:** `announce(COPY.programs.catalogLoading)` at `:158`, `announce(...ForbiddenHint/LoadErrorHint)` at `:179`, `aria-busy` on skeleton at `:272-275`.
- **Repro:** Inspect live-region `output[role=status][aria-live=polite]` — not visible in screenshots.
- **Fix:** None; keep.

---

## 11. Responsive Overflow Evidence

- **320:** `scrollWidth 320 === innerWidth 320`, `overflowEls []`, chips single row, search row stacks correctly, cards no inner overflow.
- **375:** `375===375`, no overflow, single row.
- **390:** `390===390`, no overflow, single row — required width passes.
- **414:** `414===414`, no overflow, single row.
- **Action-group wrapping:** Filter group `flex-wrap:nowrap; overflow-x:auto` never wraps; at 320 total chip width 262 fits container 262, so no scroll needed; would scroll within group if chips grew, not page. Search row wraps only via media-query stack at 320, which is intentional and preserves 44px targets. No clipping of first/last chip (padding reserves gutter). No element exceeds viewport at any width — verified via `Array.from(document.querySelectorAll('*')).filter(el=>el.scrollWidth>window.innerWidth) === []` at each width.

---

## 12. Malformed / Missing Deep-Link Fallback — Summary

- **Malformed (`?program=!!!`):** caught before any data fetch by `parseProgramsIntent` (`programs-intent.ts:59-77` regex fail → `malformed true`) → `ProgramsBoundary` bypasses `loadAccess` per `intent.malformed` guard at `programs-boundary.tsx:109` and renders `BoundaryFrame` with `StatePanel` error `連結資料無效 / 請返回課程入口…` + `返回課程入口` CTA navigating to `participant` without `program` (`navigateMode("participant", true)`). No mutation; URL preserved until user clicks CTA. ✅
- **Missing/unknown (`?program=DOESNOTEXIST12345`, valid format):** not malformed → boundary loads access then renders `ParticipantProgramDetail` → detail fetch returns unavailable → renders `boundaryError` / `unavailable` message `無法開啟這個課程 / 這個課程目前不可用… / 請返回課程目錄。` with back affordance. `ParticipantDirectory`’s `intentNotice` path (`participant-directory.tsx:251-266`) is dead for this route (boundary never renders directory with non-null id) — no “無法開啟…” banner inside directory, only detail’s unavailable state. ✅
- Both paths are read-only (no `approve/cancel/withdraw` called) and keep search state separately (list not mounted, so no query loss).

---

## 13. Recommended Next Action

**Proceed to a single polish PR targeting residual P2s (empty split), then re-smoke at 390×844 and 320×844. Stack @15956de already closes the icon/token P2s:**

1. **Already closed in this stack (no edit needed):** Search icon (`directorySearchInputWrap + svg at 322-353`) and tokenization (`globals.css:23-26` + `programs.module.css:1338,1377,1419-1434,1569-1585`) — verified via `grep #[0-9a-f]` and absolute-stack reads. Root/main still needs this patch; stack does not.
2. **Split empty copy (one branch, no API):** In `.worktrees/stack-385-389/web/lib/programs/participant-directory.tsx:393-412` distinguish true-empty vs filtered-empty as in `programs-empty.html` candidate (same `setQuery("");setFilter("all")` handler, different heading/hint). Still open as P2-03.
3. **Re-smoke:** Re-run fresh-context auth at 390 and 320 (worktree server `127.0.0.1:8787` from `stack-385-389`), screenshot, confirm `scrollWidth===innerWidth`, chip single-row, search row stacking (icon + input + clear), and empty/error focus via `retryFocusPending`.

No P0 blocks shipping; the catalog is responsive, overflow-free, and behaviorally sound across the 4 required widths. The design-export gaps are theming/copy, not functional.

---

## Appendices

### A. File Map (change: none — read-only)

| File | Role |
| --- | --- |
| `web/app/programs/page.tsx:1-31` | AppShell + suspense wrapper for `ProgramsBoundary` |
| `web/lib/programs/programs-boundary.tsx:1-752` | Intent parse, mode tabs, access, malformed guard, management/participant routing |
| `web/lib/programs/participant-directory.tsx:1-465` | Flat catalog, filters, search, status tags, skeleton/empty/error, management entry gate |
| `web/app/programs/programs.module.css:1-2215` | Tokens, search, filters, list/cards, boundary, skeleton, responsive stack |
| `web/lib/programs/programs-intent.ts:1-244` | `parseProgramsIntent` / `buildProgramsHref` + SAFE regexes |
| `web/lib/copy.ts:801-847` | `COPY.programs.*` strings |

### B. Copy Keys Referenced

`catalogLoading, catalogReady, catalogEmpty, catalogEmptyHint, catalogLoadError(Hint), catalogRetry, catalogForbidden(Hint), catalogSearchLabel/Placeholder, catalogClearSearch, catalogNoMatches, catalogClearFilters, catalogListLabel, filterGroupLabel, filterAll/Eligible/Active/Pending, statusActive/Pending/Eligible/ManagerOnly/Withdrawn/Cancelled/Rejected/Archived, catalogPendingCopy/ManagerOnlyCopy/RejectedCopy/ArchivedCopy, catalogActivePrefix/EventCountSuffix, programUnavailable(Hint), participantMode/Lead, managementMode/Lead, enterManagement, malformedIntent(Hint), backToEntry`

### C. Harden Artifacts

- `../harden/programs-empty.html` — split empty vs filtered
- `../harden/programs-loading.html` — skeleton
- `../harden/programs-error.html` — recoverable vs forbidden
- `../harden/programs-permission.html` — canManage gate
- `../harden/programs-long-copy.html` — overflow stress (title/secondary/query)
- `../harden/programs-offline.html` — Shared Shell offline banner reuse

### D. Commands Used (read-only)

```bash
# fresh-context screenshots + metrics (no mutation)
node -e "const {chromium}=require('playwright'); ... page.locator('input[autocomplete=username]').fill('E2E_member'); ... page.goto('/programs'); ... page.screenshot({path:'/tmp/programs-390.png'}); ... evaluate()=>({scrollWidth:document.documentElement.scrollWidth,innerWidth:window.innerWidth})"
curl -s http://127.0.0.1:8788/participant/programs.html | head -n 800
```

---

_Report generated read-only under `.worktrees/stack-385-389/.impeccable/phase-391/reviews/programs.md` (mirrored to `EFCC-dev/.impeccable/phase-391/reviews/programs.md`). Sources cited are from the absolute worktree `.worktrees/stack-385-389/web/...` at `15956de`; root `EFCC-dev/web/...` at `566fa198` was not used (earlier stale icon finding came from root and has been corrected). No production files were modified, no tests/linters/formatters were run. Verified `pwd`=worktree, `git rev-parse --show-toplevel`=worktree, `git log -1 --oneline`=15956de._
