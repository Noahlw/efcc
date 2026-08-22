# S2 Participant Sections — Consolidated Design Direction

**Decision artifact:** Phase 391 read-only synthesis  
**Source worktree:** `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/stack-385-389`  
**Branch / HEAD:** `feat/391-polish-on-88b96af` / `15956de0641f9d5b9aeeb18873b6e7d117b607e0`  
**Frozen polish baseline:** `88b96afa`  
**Design authority:** `/Users/noah.wong/Desktop/code/EFCC-dev/.scratch/efcc-redesign-handoff-2026-08-18/source/claude-design/design_export/participant/*.html`  
**Reports read:** `.impeccable/phase-391/reviews/{home,programs,program-detail,event-detail,notices,messages}.md`  
**Scope:** Read-only direction. No production source, test, migration, configuration, route, or harden proposal was modified. No validation suite was run.

The absolute worktree is the only code source used below. The repository root/main checkout was deliberately excluded when a report identified a stale-root artifact.

## 1. Executive verdict and design-health scores

### Executive verdict

The six participant Sections already share a credible, authored **Variant A Official Civic Minimal** language: a quiet `#f4f5f3` surface, raised white content, restrained hairlines, cinnabar actions, Cantonese-first copy, real semantic links, and a single responsive Shared Shell. This is not a redesign problem. It is a small number of navigation and state-contract corrections followed by selective parity polish.

There are no P0 blockers in the six reports. The release-critical work is:

1. Make Home Explore a real Home → Program Detail entry, not a catalog dead end.
2. Separate Home loading, recoverable error, and true empty states.
3. Preserve a validated origin through Program/Event/Message detail and provide a safe fallback when it is absent or malformed.
4. Add recovery UX for stale/unauthorized Event Detail links **without** weakening the backend authorization gate or offering an Event CTA that will 404.
5. Close the one confirmed visual CSS defect (Event success badge cascade) and the shared long-unbroken-token wrapping gap.
6. Restore the Messages lead and split Programs true-empty from filtered-empty copy.

The live 72px phone dock and semantic design tokens are the production visual truth. The exports use 78px docks and literal colors/radii as a static reference; those values must not be copied when they conflict with the shared token contract.

### Design-health score (0–20)

| Section | Score | Evidence-backed health readout |
| --- | --: | --- |
| **Home / 首頁** | **14/20** | Token, card, CTA, shell, copy, and 320/375/390/414 box-model parity are strong (`web/app/home/home.module.css:3-49,106-238`; `home.md:65-127,234-248`). The score loses points for the P1 Explore card dropping `programId` (`web/app/home/page.tsx:493-515`) and for the initial `null` projection rendering the same branch as a real empty/error (`page.tsx:365-390,437-463`). |
| **Programs / 課程目錄** | **17/20** | The stack has the search icon and accessible name, tokenized pending/error/skeleton colors, semantic list rows, deliberate 320 clear-button stacking, and zero overflow at all required widths (`participant-directory.tsx:320-463`; `programs.module.css:1253-1342,1518-1585`; `programs.md:60-129,278-304`). Residual debt is mainly empty-vs-filtered copy and modest token/radius/weight drift. |
| **Program Detail / 課程詳情** | **15/20** | Facts-grid drift was removed, lifecycle branches are explicit, the sticky bar has safe-area clearance, and the detail is overflow-free at 320/375/390/414 (`participant-program-detail.tsx:330-467`; `participant-enrollment.tsx:120-280`; `programs.module.css:1587-1597,2282-2315`; `program-detail.md:82-139,241-248`). The score loses points for loose schedule/history grouping and the current catalog-hardcoded back callback. The hidden Event CTA for eligible non-enrolled viewers is intentional authorization safety, not a parity defect. |
| **Event Detail / 聚會詳情** | **15/20** | Open/closed check-in copy, dynamic opening time, primary/secondary CTA hierarchy, semantic info card, safe-area sticky clearance, and four-width responsive behavior are strong (`event-detail.tsx:399-481`; `event-detail.md:63-136,202-211`). The confirmed badge cascade defect, direct-deep-link back no-op, and generic stale/unauthorized recovery panel reduce the score. |
| **Notices / 通知功能區** | **16/20** | Loading/empty/error states, unread/read persistence, HK relative dates, semantic deep links, 44px actions, and measured 320/375/390/414 behavior are complete (`notices-panel.tsx:74-204`; `notices-panel.module.css:34-220`; `notices.md:111-153,185-194`). The remaining cost is typography/header weight drift and long unbroken-token bleed; the removed mobile timestamp stacking is correctly closed, not a regression. |
| **Messages / 消息** | **13/20** | Shared tokens, 72px list rows, correct archival date semantics, no incorrect unread machinery, empty/error/offline states, and natural long-CJK wrapping are sound (`messages-panel.tsx:92-125`; `notices-panel.module.css:121-171`; `messages.md:137-158,265-281`). The missing lead is P1; title weight, unbroken URLs, silent malformed/unknown content links, management-shell context, and detail history behavior are additional gaps. |

## 2. Cross-screen priority table

P0 is intentionally empty: every report found no crash, data-loss path, auth bypass, or unrecoverable normal-state failure.

| Priority | Finding / contract | Exact worktree source | Recommended fix path | Type / disposition |
| --- | --- | --- | --- | --- |
| **P0** | None found | All six reports, each P0 section | No P0 work. Do not manufacture a redesign blocker from export literal drift. | Close |
| **P1** | Home Explore card is a catalog dead end | `web/app/home/page.tsx:493-515`, especially `501-504`; existing sibling event builder `414-422`; `web/lib/programs/programs-intent.ts:195-244` | Build the card href with `buildProgramsHref({mode:"participant", programId: program.programId})`. Keep the `全部課程` heading link as catalog. Preserve `from=home` under the navigation contract below. | **Selected behavior change** |
| **P1** | Home loading/error/empty are conflated | `web/app/home/page.tsx:365-390` initializes `projection=null` and has no error branch; `437-463` renders the empty branch; `web/lib/home-api.ts` projection load path | Add an explicit loading state and recoverable error + retry. Only render the current empty card after data/fallback resolution says the data is truly empty. The harden skeleton/error files are visual references, not production implementations. | **Selected behavior change** |
| **P1** | Messages list omits the design lead | `web/lib/messages-panel.tsx:92-96`; design authority `participant/messages.html:74-77`; shared `.pageLead` at `web/lib/notices-panel.module.css:23-28` | Add the existing design copy as a `pageLead` (new `COPY.home.messagesLead` only if no existing key is appropriate). Keep the Shared Shell; do not add a second prototype header. | **Selected copy/structure change** |
| **P1** | Stale/unauthorized Event Detail link becomes a generic retry dead end | Authorization guard `web/lib/programs/department-workspace.ts:2610-2626`; recovery rendering `web/lib/programs/event-detail.tsx:373-389`; participant routing `web/lib/programs/programs-boundary.tsx:552-566` | Keep the server check exactly as-is. On NOT_FOUND/unauthorized participant detail, render privacy-preserving recovery with a safe Program Detail and/or Programs catalog return. Do not offer `查看聚會詳情` to an eligible non-enrolled/non-managing viewer, and do not make the backend public just to match the export. | **Selected recovery behavior; authorization weakening rejected** |
| **P2** | Back behavior loses origin and is catalog-hardcoded | `web/lib/programs/programs-boundary.tsx:43-65,564,678-695`; URL builder `web/lib/programs/programs-intent.ts:22-31,195-244`; Event wrapper `web/lib/programs/participant-event-detail-page.tsx:20-22` | Add a small validated origin contract. Push internal detail entries, prefer a verified same-app history return, and use a canonical safe fallback (`/programs`, parent Program Detail, `/messages`, or `/home`) when history/origin is unavailable. | **Selected behavior change** |
| **P2** | Event success badge is overridden by later generic status CSS | Participant markup `web/lib/programs/event-detail.tsx:413-429`; status rules `web/app/programs/programs.module.css:1413-1434` followed by generic `.directoryStatus` at `1491-1499` | Give status/state compounds explicit specificity (or reorder the rules) so `directoryStatusSuccess` retains success tokens. Verify open state computes success color/border; no literal export color is required. | **Selected visual-only CSS change** |
| **P2** | Direct Event Detail deep link has an inert Back button | `web/lib/programs/participant-event-detail-page.tsx:20-22` | `history.back()` when a verified same-app prior entry exists; otherwise navigate to the safe parent Program Detail using the validated `programId`, or `/programs` if that ID is unusable. | **Selected behavior change** |
| **P2** | Messages malformed/unknown `content` silently falls through to list | Parser `web/lib/messages-intent.ts:3-20`; selected-detail branch `web/lib/messages-panel.tsx:50-63` | Render the existing empty/error chrome with “找不到此內容” and a `返回教會消息` link for malformed or valid-but-missing IDs. Do not echo untrusted IDs. | **Selected behavior change** |
| **P2** | Messages detail Back uses `push`, creating a history loop | `web/lib/messages-panel.tsx:56-60`; `buildMessagesHref` `web/lib/messages-intent.ts:22-26` | Use a verified `history.back()` or `router.replace('/messages')`; preserve a valid `from` context only for labeling, never as an arbitrary return URL. | **Selected behavior change** |
| **P2** | Long unbroken CMS tokens can bleed/overflow in Notices and Messages | Shared `web/lib/notices-panel.module.css:121-148`; Message row `web/lib/messages-panel.tsx:103-117`; reproduced by `messages-long-copy.html` and `notices-long-copy.html` | Add semantic wrapping (`overflow-wrap:anywhere` or equivalent) to title/body cells and keep `min-width:0`. Apply the same rule to Home card copy only if Home CMS data demonstrates the same unbroken-token input. | **Selected shared visual/robustness change** |
| **P2** | Programs true-empty and filtered-empty share one message | `web/lib/programs/participant-directory.tsx:393-412` | Branch on catalog length: “目前沒有可顯示的課程” for true empty; “找不到相關課程” for an active query/filter. Keep the same clear action, but label it accurately. | **Selected behavior/copy change** |
| **P2** | Notices/Messages headings and row titles are over/under-weighted | Notices page source `web/lib/notices-panel.module.css:8-28,125-141`; Messages markup `web/lib/messages-panel.tsx:94-96,110-117` | Normalize Section H1 and row title to the design language (H1 600, row title 600) using the shared class; remove reliance on UA `<strong>` weight. Do not create screen-specific type scales. | **Selected visual-only CSS/copy change** |
| **P2** | Program schedule/history lacks the export’s grouped card/timeline treatment | `web/lib/programs/participant-program-detail.tsx:439-492`; schedule CSS `web/app/programs/programs.module.css:1680-1694`; history uses `eventList/eventRow` in the same component | Treat as a bounded visual polish option: wrapper card and dot timeline may be added only if the user chooses strict export parity. Preserve the current flex-wrap schedule because it is safer at 320px. | **Deferred visual-only** |
| **P3** | Home long descriptions and bottom-dock clearance are under-hardened | `web/app/home/home.module.css:197-238,332-341`; `page.tsx:506-511`; shell dock `web/app/globals.css:110-123,295-307` | Keep natural wrapping until real long-copy evidence requires a clamp; then clamp only secondary copy with a full-text affordance. Consider page bottom padding after a 390 end-of-page capture. | **Deferred visual-only** |
| **P3** | Management user loses Messages context in the shell | `web/lib/shell-header.tsx:45-85` | Follow up in Shared Shell scope: retain a small contextual title/breadcrumb alongside management identity on `/messages`. Do not change the participant shell in this phase. | **Deferred behavior/visual shell change** |
| **P3** | Literal export radius/hover/78px dock differs from live tokens | Tokens `web/app/globals.css:28-53,110-123`; examples `programs.module.css:1518-1546`, `notices-panel.module.css:75-103` | Keep semantic tokens and the real 72px dock. Update authority/design documentation if needed; do not chase `#868182`, `#f7f7f7`, or 78px when it conflicts with ADR/shared-shell behavior. | **Rejected as a production defect** |

## 3. Selected vs deferred vs rejected findings

### Selected

- **Home Explore deep link:** the report evidence shows `program.programId` is already in hand and the sibling event CTA already uses the canonical builder. This is a one-seam contract repair, not a new API.
- **Home tri-state:** the current `projection=null` state is indistinguishable from a real empty and a swallowed fetch failure. A participant should never infer “nothing is scheduled” from a network race.
- **Messages lead and shared typography:** the export and Notices establish the same purpose/lead rhythm. A missing lead is a concrete copy omission, not a subjective redesign.
- **Validated origin-aware navigation:** Home Explore, Notices deep links, Messages list/detail, and nested Event Detail all need a consistent return model. The contract is explicit in §5.
- **Event stale/unauthorized recovery:** keep authorization and make recovery humane. The user can return to a Program or Catalog without being told an unauthorized event exists or being offered a request that will 404.
- **Event badge specificity:** this is the only confirmed CSS cascade defect, and it is fixed with semantic token-preserving selectors.
- **Shared long-token wrapping:** Notices and Messages both accept CMS text. CJK wrapping passes, but a URL-like token can bleed at 320. This is a low-risk shared CSS fix.
- **Programs empty split:** the existing clear handler already clears query and filter; only the message needs to distinguish zero catalog data from zero matches.

### Deferred

- Schedule card wrapper and enrollment-history dot timeline in Program Detail.
- Strict 680px normalization for Notices/Messages and literal radius/hover matching.
- Home description clamping, offline-specific stale note, bottom padding adjustment, and `datetime` on the greeting date.
- Programs weekday shortening, extra density adjustments, and extreme unread-count toolbar wrapping.
- Loading skeleton redesigns, 8-second hints, and CLS refinements where current `aria-busy`/retry behavior is already correct.
- Management shell contextual title, because it is a Shared Shell follow-up rather than participant-only polish.
- Event action height changing from the accessible 44px token to 48px solely for export parity.

### Rejected

- **Do not weaken Event authorization** or change `getEventDetail` to expose active/available events to non-enrolled Members. The backend’s `hasActiveEnrollment` check at `department-workspace.ts:2620-2626` is intentional. The export’s always-visible Event CTA assumes an enrolled fixture; it is not an authorization requirement.
- **Do not add a disabled-looking `查看聚會詳情` CTA** for an eligible non-enrolled viewer. That still offers an action whose route cannot succeed. Use explanatory text plus safe Program/Catalog recovery instead.
- **Do not treat the Programs “missing search icon” finding as live:** the absolute stack has the icon at `participant-directory.tsx:324-353` and CSS at `programs.module.css:1258-1280`. The earlier claim came from the root/main checkout and is stale.
- **Do not re-add the Programs “參與者模式” heading** based on the contradictory P3 paragraph: the stack’s current directory begins at `participant-directory.tsx:246` after the stale heading was removed. The current visual hierarchy matches the participant export.
- **Do not add Notices’ unread dots/counts to Messages.** Messages is broadcast history with no per-member `read_at`; the absence of unread treatment is domain-correct (`messages.md:137-148`).
- **Do not copy prototype-only `示範資料`, scenario switchers, or a second shell.** The live `AppShell`/`NavBar` owns shell framing.
- **Do not replace semantic token values with literal export hexes** when the shared token/ADR contract differs. Use `--surface`, `--line`, `--line-strong`, `--accent`, `--focus`, and status tokens.

## 4. One coherent design language direction

### Shell framing

- Keep one authenticated Shared Shell for every Section. `AppShell` owns the top header, offline banner, skip link, responsive navigation, and recoverable shell states (`web/lib/app-shell.tsx:55-73,91-189`). Never duplicate the export’s inline header/nav inside a live Section.
- On phones, use the canonical five-slot fixed dock at the tokenized 72px height plus safe area (`web/app/globals.css:100-123,175-183`). On desktop, use the existing rail at the 800px breakpoint. Treat the export’s 78px dock as a static visual reference, not a mandate to move the live shell.
- Keep the content outlet scrollable and reserved above the dock (`web/app/globals.css:295-307`). Detail surfaces may add their own sticky clearance, but must not compete with dock z-index or cover the last content block.
- Use a centered reading column. The export authority is 680px; the shared `BoundaryFrame` may remain wider where it serves operational density. Do not introduce new 760px containers for participant content, and do not make a broad width migration a prerequisite for this phase.

### Heading weight and rhythm

- Primary Section/detail H1: semibold **600**, responsive clamp, restrained tracking. Section H2: approximately 650. Row/card titles: explicit **600**. Active navigation may remain heavier for state indication; shell identity may remain heavier for operational identity.
- Use the existing intro rhythm: date/eyebrow, H1, muted lead, then 22–28px section separation. Messages must regain its lead; Notices already has one. Avoid the live-only 800 page-title weight unless it is intentionally the active navigation/identity signal.
- Keep headings Cantonese-first and do not invent English labels in the participant flow.

### Card, radius, and border treatment

- Base: `--surface` for the quiet page, `--surface-raised` for content, `--ink`/`--ink-muted` for hierarchy, `--line` for hairlines, `--line-strong` for interactive boundaries. No shadows on ordinary list cards.
- Use a simple hierarchy: `--radius-sm` for controls/back buttons, `--radius-md` for grouped panels, `--radius-pill` for statuses/chips. The exports’ 10px cards sit between the live 8px/12px semantic values; do not force a literal radius solely to make a screenshot number match.
- A list is one raised container with internal hairlines and semantic rows. A detail schedule/history card is optional strict-parity polish, not permission to nest card inside card or restyle the whole page.
- Status colors always come from semantic tokens (`success`, `pending`, `error`, neutral), and selector specificity must not erase them.

### CTA and button geometry

- Primary action: full-width, semantically a link for navigation or button for mutation, minimum **48px** where it is the principal action (`home.module.css:106-124`). Secondary/back/utility controls: minimum **44px**. All visible targets remain at least 44×44px.
- Use cinnabar for the primary positive/action path; use neutral raised secondary controls for “not yet open”; use error/danger tokens only for destructive enrollment actions. Do not turn all controls into primary buttons.
- At 320px, an action group stacks deliberately when two controls cannot remain legible. A single CTA remains full-width. At 375/390/414, keep compatible actions in one row only where intrinsic widths fit; never rely on accidental wrapping.
- Chips are a horizontally scrollable, single-row group. The group may scroll; the page must not acquire horizontal overflow.

### Sticky bars

- Preserve the current detail sticky bar: raised/translucent surface, hairline border, restrained shadow, one full-width CTA, `bottom: calc(72px + gap + env(safe-area-inset-bottom))`, and a reserved article bottom inset (`programs.module.css:1587-1597,2282-2315`).
- The live 72px offset is correct because the live dock is 72px. Do not adopt the export’s 78px offset in isolation; that would create a shell mismatch.
- Error text remains in the bar/panel with `role="alert"`; loading uses `aria-busy`; no visual harden proposal silently becomes a mutation or new permission rule.

### Responsive behavior

The four phone widths are intentional design points, not a single “mobile” bucket:

| Width | Required behavior |
| --: | --- |
| **320** | No document or element overflow; clear-search controls stack intentionally; long titles/CJK wrap; unbroken CMS tokens break; single primary CTA remains readable; confirm dialogs stack full-width; sticky bars clear the dock. |
| **375** | Same geometry with additional breathing room; no action-group clipping or unexpected line break. |
| **390** | Required visual proof viewport; confirm `scrollWidth <= innerWidth`, origin labels/back behavior, status colors, and sticky clearance here. |
| **414** | Preserve the same hierarchy rather than stretching controls or introducing a second layout. |

At all four widths, measure `document.documentElement.scrollWidth <= window.innerWidth`, inspect long-copy and empty/error/loading branches, and verify every action target. Desktop smoke at 800/1440 remains a Shared Shell concern after participant changes.

## 5. Origin-aware navigation contract

The product direction is **origin-aware back navigation**, not “always return to catalog” and not arbitrary browser history. The contract below is the implementation target; it is not implemented by this read-only artifact.

### 5.1 Origin vocabulary and encoding

- Define a closed enum of first-party origins: `home`, `notices`, `messages`, and `programs`. Nested Event Detail also records its safe parent Program Detail; it does not accept a free-form URL.
- Extend the existing intent builders rather than concatenating query strings in components. `buildProgramsHref` already validates `programId`/`eventId` (`web/lib/programs/programs-intent.ts:195-244`); add an optional validated `from` field and reject duplicate/unknown values in the parser. `buildMessagesHref`/`parseMessagesIntent` should similarly accept only the known list-detail context if an explicit token is needed.
- Never trust `returnTo`, `referrer`, or arbitrary URL input from the address bar. Unknown or malformed origins are treated as absent. The current malformed ID guards remain authoritative.

### 5.2 Home Explore → Program Detail

1. Home Explore card navigates to `/programs?program=<safe-id>&from=home` via `buildProgramsHref({mode:"participant", programId, from:"home"})`.
2. This is a pushed same-app entry, not a replacement, so the browser history still contains Home.
3. Program Detail shows a contextual back label such as `返回首頁` when the validated origin is `home` and the same-app history entry is verified.
4. Back first uses the verified same-app history return; if history is unavailable (new tab, restored deep link, or stale session), it uses the safe `/home` fallback. It must never fall through to a bare catalog merely because `onBack` was wired with `replaceState`.
5. `全部課程` and direct catalog row selection remain `from=programs`/generic `課程` and fall back to `/programs`.

### 5.3 Notices → Program/Event Detail

- `noticeHref` currently builds canonical Program/Event URLs (`web/lib/notices-panel.tsx:20-38`). Add `from=notices` through the builder for those links.
- Program Detail/Event Detail use `返回通知` only when the token is valid and the prior entry is the Notices list. Otherwise they return to the safe parent Program or Programs catalog. Account notices continue to `/profile` and do not invent a Program origin.
- A browser Back remains a valid native escape hatch, but the visible affordance must not depend on history being non-empty.

### 5.4 Messages → Message Detail

- Messages list rows use `/messages?content=<safe-id>&from=messages` (or an equivalent internal state record). The list-to-detail back action returns to `/messages` with `replace`/verified `back`, not `push` onto the same stack.
- A malformed or unknown `content` value renders a recoverable “找不到此內容” state with `返回教會消息`; it does not silently show a successful-looking list and does not echo the supplied ID.
- If a future Messages row links onward to Program/Event, use `from=messages` in the Programs builder and preserve that origin through the same contract.

### 5.5 Program Detail → Event Detail and Event fallback

- A permitted Event Detail entry carries its safe `programId`, `eventId`, and parent origin. Its normal Back returns to the parent Program Detail, not directly to a guessed external URL.
- A direct Event URL with no usable history falls back to `/programs?program=<safe-id>`; if the program ID is malformed/unknown, fall back to `/programs`.
- If Event Detail returns NOT_FOUND/unauthorized for a non-enrolled/non-managing participant, show a privacy-preserving recovery panel: “無法開啟這個聚會” (or the approved equivalent), `查看課程詳情` only when the safe Program ID is known, and `返回課程目錄`. This is recovery UX, not a new Event CTA and not an authorization change.
- Do not show check-in or Event Detail actions to an eligible non-enrolled viewer merely because the static export shows one. The existing `canOpenEventDetail = canManage || hasActiveEnrollment` gate (`participant-program-detail.tsx:340-342,416-425`) remains.

### 5.6 Malformed/unknown origin fallback

- Invalid/duplicate origin token: ignore the token and use the section’s canonical fallback.
- Malformed Program/Event/Content IDs: preserve existing safe StatePanel/unavailable behavior; do not fetch with the malformed value and do not disclose whether a protected record exists.
- Valid but stale/unknown IDs: show the section’s recoverable unavailable state with a safe return action.
- Fallback map: Program Detail → `/programs`; Event Detail → safe parent Program Detail, else `/programs`; Message Detail → `/messages`; Home-origin detail → `/home` only when the origin is valid. No arbitrary `returnTo` is ever followed.

## 6. Harden decision matrix (check-only; no implementation)

The 39 HTML files below are proposals under `.impeccable/phase-391/harden/`. They are not production fixtures and none is selected for automatic implementation. “Visual-only” means it changes presentation/measurement only; “Behavior change” means it would alter state, copy branching, navigation, or authorization-facing behavior; “Defer” means keep as a review artifact until a separate decision.

| Screen | Harden proposal / state | What it proposes | Type / decision |
| --- | --- | --- | --- |
| Home | `home-loading.html` | Skeleton instead of the current empty flash while `getHome()` resolves | **Behavior change — selected** as Home tri-state; HTML remains check-only |
| Home | `home-error.html` | Recoverable error panel and Retry for Home fetch failure | **Behavior change — selected** with tri-state; HTML remains check-only |
| Home | `home-empty.html` | Verify enrolled-empty vs no-program empty composition | **Visual-only — defer**; current true-empty branch is structurally sound |
| Home | `home-long-copy.html` | Stress long name/title/description; proposes clamp and word breaking | **Visual-only — defer** until real copy evidence; wrapping must stay safe |
| Home | `home-permission.html` | Show shell-level forbidden/role mismatch, not a Home empty | **Behavior change — reject production change**; `AppShell` already owns this state |
| Home | `home-offline.html` | Offline banner, stale note, and dock-safe footer | **Behavior change — defer**; global banner exists, tri-state/retry comes first |
| Programs | `programs-loading.html` | Catalog skeleton and hidden controls until ready | **Visual-only — defer**; current skeleton/`aria-busy` is adequate |
| Programs | `programs-empty.html` | Split true-empty from filtered-empty and rename clear action | **Behavior change — selected** at `participant-directory.tsx:393-412` |
| Programs | `programs-error.html` | Contrast recoverable error with forbidden and add possible Home return | **Behavior change — defer**; current retry/focus/forbidden path is valid |
| Programs | `programs-permission.html` | Document Member vs management entry binary | **Visual-only — defer**; no permission surface change |
| Programs | `programs-long-copy.html` | Stress long program names/secondary text/query | **Visual-only — defer**; CJK is safe and shared overflow work is higher value |
| Programs | `programs-offline.html` | Reuse the Shared Shell OfflineBanner | **Visual-only — defer**; do not add a duplicate directory banner |
| Program Detail | `program-detail-loading.html` | Skeleton/latency hint for detail load | **Visual-only — defer**; current focusable loading state already announces |
| Program Detail | `program-detail-unavailable.html` | Privacy-preserving unavailable state and back | **Visual-only — defer**; current unavailable copy/back is safe |
| Program Detail | `program-detail-error.html` | Recoverable error focus/retry presentation | **Visual-only — defer**; current retry/error path is implemented |
| Program Detail | `program-detail-permission.html` | Compare Event CTA/management entry for eligible vs active viewer | **Behavior change — reject CTA addition; defer visual documentation**; authorization gate remains |
| Program Detail | `program-detail-long-copy.html` | Stress title/description/location and propose `overflow-wrap` | **Visual-only — defer** unless a URL-like value is observed |
| Program Detail | `program-detail-offline.html` | Offline enrollment error using existing `panelError` | **Behavior change — defer**; submit/confirm guards already block offline mutation |
| Program Detail | `program-detail-enrollment-variants.html` | Side-by-side eight lifecycle CTA states | **Visual-only — defer** as regression reference; current state machine is explicit |
| Event Detail | `event-detail-open.html` | Open check-in badge and primary scan CTA | **Visual-only — select badge CSS only**; current open behavior is correct |
| Event Detail | `event-detail-closed.html` | Closed state opening time and neutral scan CTA | **Visual-only — defer**; current dynamic copy/CTA is stronger than export |
| Event Detail | `event-detail-unenrolled.html` | Contextual recovery instead of a generic 404 retry dead end | **Behavior change — selected**; do not alter backend authorization |
| Event Detail | `event-detail-loading.html` | Skeleton before event fetch completes | **Visual-only — defer**; current loading is not a release blocker |
| Event Detail | `event-detail-error.html` | Retry plus safe Program return | **Behavior change — selected** as stale/unauthorized recovery |
| Event Detail | `event-detail-long-copy.html` | Stress long title/location/instruction wrapping | **Visual-only — defer**; current fact rows wrap safely |
| Event Detail | `event-detail-offline.html` | Shared OfflineBanner over loaded/detail error state | **Visual-only — defer**; existing global banner is sufficient |
| Notices | `notices-empty.html` | Empty card with disabled mark-all action | **Visual-only — defer**; current implementation matches |
| Notices | `notices-loading.html` | Loading output/skeleton rows | **Visual-only — defer**; current `aria-busy` text state is sufficient |
| Notices | `notices-error.html` | Error alert and bordered retry | **Visual-only — defer**; current state already matches |
| Notices | `notices-long-copy.html` | Wrap unbroken title/body tokens at 320 | **Visual-only — selected** as shared overflow rule |
| Notices | `notices-offline.html` | Disable mark-all offline and show banner/error composition | **Behavior change — defer**; retain retry/error semantics first |
| Notices | `notices-permission.html` | Forbidden screen when Notices slot is unavailable | **Behavior change — reject new page behavior**; shell/auth boundary owns it |
| Messages | `messages-empty.html` | Reuse Notices-equivalent empty card and document missing lead | **Visual-only — defer** after restoring lead in production |
| Messages | `messages-loading.html` | Header-preserving skeleton/CLS treatment | **Visual-only — defer** unless CLS is measured as a release issue |
| Messages | `messages-error.html` | Error/retry plus OfflineBanner composition | **Visual-only — defer**; current alert/retry is correct |
| Messages | `messages-long-copy.html` | Wrap long title/body/URL and preserve chevron | **Visual-only — selected** as shared overflow rule |
| Messages | `messages-detail.html` | Detail back-label branches, origin, long title, optional external row | **Behavior change — selected** for validated origin/malformed fallback; visual variants defer |
| Messages | `messages-offline.html` | Shared OfflineBanner with list/error composition | **Visual-only — defer**; no second banner |
| Messages | `messages-permission.html` | Hypothetical future audience-scoped permission card | **Behavior change — reject** unless Messages gains an explicit audience gate |

## 7. Implementation order, smallest ownership, and observable acceptance checks

This is the implementation order after the direction is approved. The current assignment does not execute it.

### 1. Establish the navigation seam first

**Smallest ownership:**

- `web/lib/programs/programs-intent.ts` — validated `Origin` enum, parse/build support, duplicate/unknown rejection.
- `web/lib/programs/programs-boundary.tsx` — preserve origin on push, contextual Back selection, verified history and safe fallback.
- `web/app/home/page.tsx` — Home Explore builder call only; keep `全部課程` catalog link.
- `web/lib/notices-panel.tsx` — add `from=notices` through the builder.
- `web/lib/messages-intent.ts` + `web/lib/messages-panel.tsx` — list/detail origin parsing, malformed/unknown state, replace/back behavior.
- `web/lib/programs/participant-event-detail-page.tsx` — direct deep-link Back fallback.

**Observable acceptance:**

- Authenticated Home → tap `data-testid="explore-card"` → `/programs?program=<featured>&from=home`, detail renders, Back returns Home once.
- Programs catalog → detail → Back returns `/programs`.
- Notices Program/Event link → detail → Back returns Notices when `from=notices` is valid; direct open falls back safely.
- Messages list → detail → Back returns `/messages` without a history loop; malformed/unknown `content` shows recovery text and a list link.
- Direct Event URL with history length 1 has a working Back to Program/Programs; no arbitrary URL is followed.

**Regression tests required:** intent parser/builder tests, Home E2E deep-link/back assertion, Program boundary origin tests, Messages malformed/back tests, Event direct-back test. These are new observable route contracts.

### 2. Make Home state truthful

**Smallest ownership:** `web/app/home/page.tsx` state/effect/render branches; reuse existing `COPY.error.networkError` or add the single Home-specific copy key only if needed. Do not change the Home API or Worker.

**Observable acceptance:**

- Slow response shows loading/skeleton, never a false empty flash.
- Network/5xx error shows `role="alert"` and Retry; retry can resolve into enrolled, empty, or error.
- Resolved empty still shows the existing `探索課程` behavior and does not invent a program when none exists.
- Enrolled Home preserves the current EventCard/announcement/Explore layout at 390px.

**Regression tests required:** Home loading/error/empty branch tests plus the existing Home E2E fixture path. No test should submit or mutate enrollment.

### 3. Close Event recovery and the confirmed CSS defect

**Smallest ownership:** `web/lib/programs/event-detail.tsx`, `web/lib/programs/participant-event-detail-page.tsx`, and `web/app/programs/programs.module.css`. Do **not** edit `department-workspace.ts` for this direction.

**Observable acceptance:**

- Active/enrolled/open event still shows green `可簽到`, dynamic instruction, and cinnabar `前往掃描`.
- Closed event still shows opening time and neutral `前往掃描`.
- Non-enrolled direct/stale Event URL shows privacy-preserving recovery with safe Program/Catalog links and no check-in CTA.
- `getEventDetail` authorization behavior is unchanged.
- `scrollWidth <= innerWidth` and sticky safe-area clearance pass at 320/375/390/414.

**Regression tests required:** Event Detail open/closed/unauthorized recovery, badge token/class behavior, and direct deep-link Back. Authorization tests must assert the backend remains protected.

### 4. Apply shared, low-risk visual/content corrections

**Smallest ownership:**

- `web/lib/notices-panel.module.css` — explicit 600 title weight and unbroken-token wrapping.
- `web/lib/messages-panel.tsx` plus shared copy — Messages lead.
- `web/lib/programs/participant-directory.tsx` — true-empty/filtered-empty branch.
- `web/lib/shell-header.tsx` — only if the management contextual-title follow-up is approved separately.

**Observable acceptance:**

- Notices and Messages titles share explicit 600 weight; no UA-dependent `<strong>` styling.
- Long English/URL-like tokens wrap inside the grid at 320 with the timestamp/chevron still visible.
- Messages shows the design-authority lead without a duplicate header.
- Programs’ empty copy accurately describes zero catalog vs zero matches; clear action resets both.
- No new horizontal overflow at required widths.

**Regression tests required:** Messages lead/malformed/unknown tests, Programs empty split test, and a responsive browser check for shared long-copy behavior. Typography-only changes need visual capture rather than logic tests.

### 5. Optional strict export parity, only after the contract work

**Smallest ownership:** `web/lib/programs/participant-program-detail.tsx` and `web/app/programs/programs.module.css` for schedule/history grouping; any width/radius changes remain Section-local and token-based.

**Observable acceptance:**

- Schedule remains flex-wrapping and overflow-free at 320; a card wrapper must not introduce nested-card noise.
- Enrollment history remains ordered and accessible; a dot is decorative and does not replace text.
- No 78px dock or literal color override is introduced.

**Regression tests required:** none for a pure wrapper/dot presentation change; retain the existing detail lifecycle and responsive smoke checks.

## 8. User decision gate — resolved

**Decision recorded 2026-08-20:**

1. **Origin encoding:** Use a validated `from` query enum in canonical URLs (`home`, `notices`, `messages`, `programs`). Unknown, duplicate, malformed, or missing origins use safe canonical fallbacks; arbitrary `returnTo` URLs are forbidden.
2. **Event stale/unauthorized recovery:** Show `查看課程詳情` when a safe `programId` is known plus `返回課程目錄`; preserve the backend enrollment authorization gate and never show a failing Event CTA to an eligible non-enrolled viewer.
3. **Strict visual parity:** Defer schedule-card/history-dot treatment and broad 680px/radius normalization. This remains a later handle item in this session; the current pass ships the contract fixes and low-risk token-driven polish only.

Implementation may proceed in the order above without reopening the six reconnaissance reports.
