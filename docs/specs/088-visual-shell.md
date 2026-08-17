# 088 — Visual Shared Shell (prototype-faithful chrome)

Status: Ready for agent
Scope: One stack-top implementation on `prototype-port/085-07-notices` (PR #347). Restyle the Shared Shell and every catalogued Section body to match the binding HTML prototypes. No new routes, D1, or Worker behavior.
Blocks: none (084–087 behavior already on the stack). This spec is visual debt those specs named and did not ship.

## Prototype lock (read this first)

The binding originals are these two files. Open **these**, not a rename, not 8787:

| Role | Path | SHA-256 |
| --- | --- | --- |
| Participant | `/Users/noah.wong/Desktop/code/temp/EFCC Participant Check-in (Standalone).html` | `3e52635e1309600a1957621829c9808f96cac74280aabaeb3940596fbeade1f2` |
| Management | `/Users/noah.wong/Desktop/code/temp/EFCC Management Workspace (Standalone).html` | `b101731d680e4c18054be396048207a355d73ce46135701ecfd83579dbc52754` |

`design/efcc-*-prototype.html` is only an in-repo snapshot. If it disagrees with
the Standalone files, **the Standalone files win** — recopy them into `design/`
before continuing. ADR-0032 named `design/`; Spec 088 names the Standalone
paths as the operator-provided originals.

**During implementation, those two Standalone files must stay open.** For each
surface, manually open the exact `?screen=` at 390×844 and, when chrome
differs, 1280×800. Inventory: `docs/specs/088-prototype-screen-map.md`.
Decode notes: `design/README.md`.

Each later ticket must include a manual prototype-reference block containing:

- the exact Standalone file;
- the exact `?screen=` and query parameters;
- the interaction steps needed to reach the reference state; and
- the target viewport.

The HTML is the only visual authority. Do not create, link, or rely on a
generated screenshot gallery: automated captures can open the wrong state,
miss interactive transitions, or stop before the prototype finishes rendering.

**Not the prototype** — do not restyle against:

- `docs/specs/design-tree-efcc-redesign.html` (retired, ADR-0032)
- `web/out/prototype.html`
- `prototype/scanner/prototype-index.html`
- `127.0.0.1:8787` / current civic-minimal chrome
- Spec 084–087 prose, `CONTEXT.md`, or generated screenshot artifacts
- `design/*.html` when its hash does not match the Standalone table above

If the Standalone files are missing, stop. Do not invent a substitute.

CEO review: `memory/ceo-review-088-visual-shell.md`. Grilling: `.scratch/prototype-port-2026/GRILLING-DECISIONS.md`.

## Problem Statement

Members and ministry operators opening the production Shared Shell do not
recognize the product they were shown in the Bolt prototypes. Specs 084–087
ported IA, copy, and D1 wiring into the existing civic-minimal chrome (text-only
dock, 登出 in the header, 800px rail, 「簽到」 / 「課程與活動」). The prototypes
use icon+label dock, a raised 掃描 FAB, 920px left rail, contextual 72px headers,
and section layouts (chips, cards, hub grouping) that 8787 still does not match.

## Solution

One new PR on top of #347 restyles Shared Shell + catalogued screens against the
HTML files above. Destinations stay the navigation projection. Labels, DOM, CSS,
and states change. Demo scaffolding is stripped. Proof is Playwright green plus
manual side-by-side inspection of each exact HTML screen/state at the target
viewport.

## User Stories

### Shared Shell — phone dock

1. As any authenticated account on a phone viewport (<920px), I want a 5-slot bottom dock with icon and visible label on every slot, so that I can reach 首頁, 課程, 掃描, slot 4, and 帳戶 without reading a text-only bar.
2. As any authenticated account on a phone, I want the 掃描 slot to be a raised circular FAB keyed to the scanner navigation key (not “the third link”), so that scan stays the same destination if slot 4 swaps.
3. As a Member with no management capability, I want slot 4 to read 通知, so that Notices stay one tap away.
4. As a management-capable account, I want slot 4 to read 管理, so that I reach the Management Hub from the dock.
5. As any authenticated account, I want every dock label to remain visible (not icon-only), so that the accessible name matches what I see.
6. As any authenticated account, I want 課程 and 通知/管理 hit targets to stay at least 44px when the FAB is raised, so that the FAB does not steal taps.
7. As any authenticated account on a notched phone, I want shell content padded for FAB overhang plus safe-area, so that the last card is not hidden under the dock.
8. As a keyboard user, I want the inactive phone or desktop nav to use `display: none`, so that I do not tab through two copies of the same destinations.
9. As any authenticated account, I want the current dock slot marked with the prototype accent (not underline-only), so that I can see where I am.

### Shared Shell — desktop rail

10. As any authenticated account on a desktop viewport (≥920px), I want a left icon+label rail about 180px wide from top to bottom, so that navigation matches the HTML at 1280px.
11. As any authenticated account on desktop, I want the header and main content in the column to the right of the rail (not under it), so that 顯恩堂 is not clipped by the rail.
12. As a management-capable account on desktop, I want a visual 內容與系統 grouping around the hub destination, so that the rail matches the management HTML (no new route).
13. As any authenticated account resizing across 920px, I want the shell switch to be CSS only, so that rotate/resize cannot desync a JS `isDesktop` flag.

### Shared Shell — header and 登出

14. As any authenticated account on Home, I want the Shared Shell header brand to read 顯恩堂, so that it matches the participant HTML (not the full legal church name, not Simplified 显恩堂).
15. As any authenticated account on a nested Section, I want the 72px header title to follow a pathname lookup (課程, 掃描, 通知, 帳戶, 帳戶設定, 課程詳情, …), so that I am not stuck seeing 顯恩堂 on every screen.
16. As any authenticated account, I want 登出 only on Account (and Forbidden’s existing 登出並返回登入), so that chrome matches the HTML.
17. As a management-capable account, I want actor name and role in the header plus a bell that goes to Notices, so that management chrome matches the HTML.
18. As a management-capable account whose bootstrap does not authorize Notices, I want no bell, so that chrome does not dump me on Forbidden.
19. As any authenticated account, I want skip-to-content and the offline banner to keep working, so that visual restyle does not drop Shared Shell accessibility or offline warning.

### Copy and projection

20. As any authenticated account, I want dock 課程 and 掃描 from `COPY.sections`, so that chrome matches the HTML short labels.
21. As any authenticated account on Programs, I want the page heading to keep its existing Programs copy (not auto-shortened by the dock key), so that H1 and dock can differ.

### Catalogued Section bodies

22. As a Member on Home, I want next-event, then 教會消息, then 探索, laid out like participant `?screen=home`, so that Home is not a civic-minimal list in a new dock.
23. As a Member on Programs, I want pill search and selected filter chips like participant `?screen=programs`, so that the directory matches the HTML.
24. As a Member on Scanner, I want 聚會簽到 viewfinder chrome like participant `?screen=scan`, so that Scan matches the HTML while existing resolve/confirm RPCs stay.
25. As a Member on Notices and Account, I want those bodies to match `?screen=notices` and `?screen=account`, including 登出 on Account.
26. As a management-capable account on Hub, Cockpit, Approvals, Permissions, directory, and Home CMS, I want those bodies to match the management HTML `?screen=` rows in the screen map, so that 087 surfaces are not old cards in a new rail.
27. As any authenticated account hitting a catalogued empty or error body (empty Home, empty Notices, scan outcomes, session-expired, not-available), I want that inner layout restyled too, so that empty states are not leftover civic-minimal.
28. As any account on a catalogued Auth Surface, I want login/register/guest/session-expired chrome to match the HTML while titles stay 登入顯恩堂 (not the full legal name).

### Demo chrome

29. As any account, I must not see 示範資料, scenario chips, or persona hard-links, so that production is not the Bolt demo.

### Proof

30. As a reviewer, I want Playwright green against local wrangler plus manual inspection of the exact HTML screen/state, so that READY is observable without trusting generated images.
31. As a reviewer, I want every catalogued screen and state to have an explicit HTML URL, interaction setup, and viewport in its ticket, so that another agent can reproduce the same visual reference.

## Implementation Decisions

1. **Design authority:** the two Standalone HTML paths in the Prototype lock (not `design/` unless hashes match). Screen map: `docs/specs/088-prototype-screen-map.md`. Before editing a surface, manually open the exact Standalone `?screen=` and reproduce its interaction state at the ticket's viewport. HTML, not generated screenshots, wins on both interaction and visual appearance.
2. **Stack:** one PR `prototype-port/088-visual-shell` from `prototype-port/085-07-notices`. Do not reopen #325–#346 for CSS.
3. **No Bolt dump:** restyle existing Shared Shell and Section CSS modules. Do not paste the standalone bundle into the Next app. Do not add an icon npm package. Reuse in-app SVG; take a prototype `<symbol>` only when a navigation key has no icon.
4. **Navigation projection:** `bootstrap.navigation` remains the only destination list. Special-case `scanner` as `.nav-fab`. Icons keyed by `s.key`. Missing scanner → no FAB, remaining items flex. Unknown key → label without empty image. Extra keys → render all (existing cramped dock).
5. **COPY:** `COPY.sections.programs` → 課程, `COPY.sections.scanner` → 掃描. Page headings still on `COPY.sections.*` move to existing Section COPY leaves. `shell-nav` / app tests keep asserting `COPY.sections.*`.
6. **Header titles:** pathname lookup table, not page context. Home → 顯恩堂. First segment → `COPY.sections`. Nested paths → existing COPY (帳戶設定, 課程詳情, …). Unknown → 顯恩堂. Header height 72px. Back chevrons stay in the page body.
7. **Desktop frame:** `min-width: 920px` only for dock hide / rail show / content `margin-left: 180px`. Header lives in the content column. Grep 800px queries that assume the rail; 800 stays only as a named card-density exception.
8. **Bell:** `Link` to Notices if Notices is an authorized section; otherwise omit. No dropdown API.
9. **Logout:** keep Profile `signOut` and Forbidden `COPY.logout.forbiddenAction`. Remove header 登出. Existing `authLogout` failure copy unchanged.
10. **Empty/error:** catalogued empty/error inner layouts are in. No new skeleton loaders. `LoadingShell` stays unless that screen is in the catalog.
11. **Auth titles:** do not change 登入顯恩堂 to the full legal name.
12. **No design-system package, no screenshot CI, no Worker/D1/API changes.**

## Testing Decisions

**Seams (one visual seam, one existing E2E seam):**

- **Highest seam:** Playwright vs local `wrangler dev` + local D1 (ADR-0029). Assert dock labels, FAB is the scanner key (not `nth(2)`), Home header 顯恩堂, nested header from the lookup table, 登出 on Account not in `ShellHeader`, rail at ≥920 and phone dock at ≤919. Retarget existing `app.test.tsx` / `shell-nav` / responsive fixtures; do not weaken locators by putting 登出 back in the header.
- **Visual seam:** manual side-by-side review. Open the exact Standalone file at its `?screen=`, perform the documented state setup, set the target viewport, then inspect the corresponding 8787 route. If the HTML reference and Playwright disagree, preserve the HTML's visual contract and fix the implementation or accessible locator; do not paper over a mismatch with a generated baseline image.
- Do not assert CSS class names or computed colors as the merge gate.

Prior art: `tests/e2e/shell-nav.test.ts`, `web/lib/app.test.tsx`, `tests/e2e/responsive.config.ts`, Headless-Gate traces under `.scratch/prototype-port-2026/acceptance-traces/`.

Write `.scratch/prototype-port-2026/acceptance-traces/088-visual-shell.md` before the first chrome commit.

## Out of Scope

- New routes, D1 tables, Worker handlers, navigation payload shape
- Reopening PRs #325–#346 for visual hunks
- Copying Bolt JS/CSS into production
- Pixelmatch CI, decorative FAB animation, skeleton LoadingShell
- Design-system / `shell-kit` extract
- Generated screenshot galleries and screenshot-based visual baselines
- Changing 084–087 enrollment, scan RPC, CMS, or approvals behavior
- Using `docs/specs/design-tree-efcc-redesign.html` as design authority

## Further Notes

- Specs 084–087 already required prototype DOM/CSS; this spec is the visual pass they skipped.
- `COPY.appFullName` (中國基督教播道會顯恩堂) stays for non-header uses; Shared Shell header does not read it.
- Implementation does not start until the 088 acceptance trace exists (Headless-Gate).
