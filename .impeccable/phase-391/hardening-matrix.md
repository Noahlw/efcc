# Phase 391 Participant Visual Hardening Matrix

**Status:** accepted direction; implementation is case-specific **Scope:** Home, Programs, Program Detail, Event Detail, Notices, and Messages participant Sections **Authority:** `.scratch/efcc-redesign-handoff-2026-08-18/source/claude-design/design_export/participant/*.html`, constrained by live product contracts and ADR-0036 **Prototype rule:** `Selected` means prototype candidate only. Static files under `.impeccable/phase-391/harden/` are check-only and do not authorize production changes.

## Status vocabulary

- **Implemented** — the live product already satisfies the case, or the approved production change is implemented and must remain covered by regression checks.
- **Selected** — prototype exploration is approved; production implementation still requires a later decision and acceptance gate.
- **Deferred** — no current observable failure or intentionally postponed visual exploration.
- **Rejected** — conflicts with a settled domain, shell, authorization, accessibility, or token contract.
- **Evidence-blocked** — reserved for a reproducible failure or unresolved contract contradiction; uncertainty alone is not enough.
- **`optional` tag** — independent scope marker. It is not a status and is not a production commitment.

## 39 state cases

### Home / 首頁

| Case | Status | Evidence | Observable acceptance / decision |
| --- | --- | --- | --- |
| `home-loading` | **Implemented** | `web/app/home/page.tsx:351-391,471-473`; `web/app/home/home.module.css:11-110`; `docs/specs/393-s2-home-structural-skeleton-acceptance-plan.md` | Structural skeleton reserves greeting, next-event, announcement, and Explore geometry; `aria-busy=true`; no empty/error links, fake content, or timer hint. Validate HOME-SKEL-01..05 at all required widths. |
| `home-error` | **Implemented** | `web/lib/app-shell.tsx:154-187`; `web/app/home/page.tsx:481-496` | Recoverable shell/projection failure exposes alert and Retry; retry returns through loading to ready/empty without duplicate skeletons. |
| `home-empty` | **Implemented** | `web/app/home/page.tsx:505-513`; `web/app/home/home.module.css:140-158`; `web/lib/home.test.tsx:196-217` | Authenticated member with no enrolled upcoming Event sees truthful empty copy and `探索課程`; no loading placeholders remain. |
| `home-long-copy` | **Selected** | `web/app/home/home.module.css:197-239`; `.impeccable/phase-391/harden/home-long-copy.html` | Prototype shared `overflow-wrap:anywhere` rule for Home card title/description. Preserve natural copy; no clamp without a full-text affordance. |
| `home-offline` | **Implemented** | `web/lib/app-shell.tsx:58`; `web/lib/offline-banner.tsx:1-36` | Shared OfflineBanner is the only offline banner; loaded Home content remains readable; submit-like actions do not pretend to succeed. |
| `home-permission` | **Implemented** | `web/lib/app-shell.tsx:105-144`; `web/app/home/page.tsx:362,511-515` | Active authenticated accounts can land on Home; invalid/suspended sessions stop at the shell gate. No Home-local permission page. |

### Programs / 課程目錄

| Case | Status | Evidence | Observable acceptance / decision |
| --- | --- | --- | --- |
| `programs-loading` | **Implemented** | `web/lib/programs/participant-directory.tsx:158,265-295`; `web/app/programs/programs.module.css:1337-1365` | Polite loading announcement, `aria-busy` state, three skeleton cards, hidden stale filters, no overflow at 320/799/800. Elapsed-time hints are rejected. |
| `programs-empty` | **Implemented** | `web/lib/programs/participant-directory.tsx:393-419`; `web/lib/copy.ts:817-820,831`; `web/lib/programs/participant-directory.test.tsx:161-177,377-412` | True-empty and filtered-empty have distinct copy; `清除搜尋與篩選` resets both controls; state remains focusable and 44px-safe. |
| `programs-error` | **Implemented + Selected subcase** | `web/lib/programs/participant-directory.tsx:165-185,297-318`; `web/lib/programs/programs-boundary.tsx:348-386`; `.impeccable/phase-391/harden/programs-error.html` | Recoverable network/5xx keeps query/filter and retries; 401 restores login deep link; 403 stays distinct. Prototype candidate adds safe `返回首頁` escape without changing authorization. |
| `programs-offline` | **Implemented** | `web/lib/app-shell.tsx:49,58`; `web/lib/offline-banner.tsx`; `web/lib/programs/participant-directory.tsx:217-235,300-318` | Shared OfflineBanner covers connectivity; cached catalog remains searchable; no duplicate directory banner. |
| `programs-permission` | **Implemented** | `web/lib/programs/participant-directory.tsx:448-463`; `web/lib/programs/programs-boundary.tsx:119-126,387-422` | `canManage=false` removes management entry/tabs; management-capable actors see the management entry; row-level manager-only status remains separate. |
| `programs-long-copy` | **Selected** | `web/app/programs/programs.module.css:1377-1383,1450-1453`; `.impeccable/phase-391/harden/programs-long-copy.html` | Prototype defensive `overflow-wrap:anywhere` on title/secondary text for URL-like tokens; retain `min-width:0`, chevron position, and 320/799/800 no-overflow checks. |

### Program Detail / 課程詳情

| Case | Status | Evidence | Observable acceptance / decision |
| --- | --- | --- | --- |
| `program-detail-loading` | **Implemented** | `web/lib/programs/participant-program-detail.tsx:227-229,313-324` | Focusable `aria-busy` loading state announces `正在載入課程內容…`; no layout shift or exposed identifiers. |
| `program-detail-unavailable` | **Implemented** | `web/lib/programs/participant-program-detail.tsx:251-258,326-344`; `web/lib/programs/programs-boundary.tsx:564` | NOT_FOUND/FORBIDDEN is privacy-preserving, focused, and returns safely to Programs; no IDs/stack traces. |
| `program-detail-error` | **Implemented** | `web/lib/programs/participant-program-detail.tsx:259-266,346-371`; `web/app/programs/programs.module.css:1708,1968-1974` | Recoverable error has alert, Retry, and safe catalog return; mobile buttons stack at 44px minimum. |
| `program-detail-permission` | **Implemented gate + Selected advisory** | `web/lib/programs/department-workspace.ts:2610-2626`; `web/lib/programs/participant-program-detail.tsx:337-338,472-479,576-590` | Non-enrolled Members never receive a failing Event CTA. Prototype may test muted `加入後可查看聚會詳情`; it cannot expose event facts or weaken the enrollment gate. |
| `program-detail-long-copy` | **Implemented base; Deferred extra guard** | `web/lib/programs/participant-program-detail.tsx:402-471`; `web/app/programs/programs.module.css:1587-1694` | Existing flex wrapping handles long names/descriptions/locations at mobile widths. Do not add a clamp; revisit only with a reproducible URL/token failure. |
| `program-detail-offline` | **Implemented** | `web/lib/programs/participant-enrollment.tsx:264-269,299-301,397-399,461-464` | Mutation attempts fail with alert copy, no optimistic state change, and the Shared Shell remains the single offline indicator. |
| `program-detail-enrollment-variants` | **Implemented state machine + Selected prototype** | `web/lib/programs/participant-enrollment.tsx:91-239`; `.impeccable/phase-391/harden/program-detail-enrollment-variants.html` | Eight lifecycle states preserve precedence and copy. Member sees latest summary only; mutation states have one movable action; ManagerOnly/Archived are read-only; no duplicate controls or history timeline. |

### Event Detail / 聚會詳情

| Case | Status | Evidence | Observable acceptance / decision |
| --- | --- | --- | --- |
| `event-detail-open` | **Implemented** | `web/lib/programs/event-detail.tsx:423-506`; `web/app/programs/programs.module.css:1413-1434,2257-2317` | Enrolled member with open window sees success `可簽到`, event facts, and sticky scan CTA to `/scanner?event=<id>`. |
| `event-detail-closed` | **Implemented** | `web/lib/programs/event-detail.tsx:447,489-494,500`; `web/lib/copy.ts:1164` | Closed window omits the open badge, gives dynamic opening time, and uses neutral secondary scan treatment. |
| `event-detail-unenrolled` | **Implemented** | `web/lib/programs/department-workspace.ts:2610-2626`; `web/lib/programs/participant-program-detail.tsx:340-342,416-425`; `web/lib/programs/event-detail.tsx:378-415` | Unauthorized/non-enrolled deep link renders privacy-preserving recovery and safe Program/Catalog links; backend gate is unchanged. |
| `event-detail-loading` | **Deferred** | `web/lib/programs/event-detail.tsx:151,416-418`; `BoundaryFrame` busy state | Existing busy state avoids a broken flash. Do not add a skeleton until measured CLS or loading evidence exists. |
| `event-detail-error` | **Implemented** | `web/lib/programs/event-detail.tsx:197-207,378-415`; `web/lib/copy.ts:1168-1170,1271-1275` | Network/5xx failure exposes alert, focused Retry, and safe parent/catalog recovery. |
| `event-detail-offline` | **Implemented** | `web/lib/app-shell.tsx:58`; `web/lib/offline-banner.tsx`; `web/lib/self-check-in-panel.tsx:147-190` | Read-only facts remain available when loaded; scanner mutation fails cleanly offline; no duplicate banner. |
| `event-detail-long-copy` | **Implemented base; Deferred extra visual variant** | `web/lib/programs/event-detail.tsx:456-476`; `web/app/programs/programs.module.css:2257-2281` | Long title/location/instructions wrap without displacing icons or creating horizontal scroll at required mobile widths. |

### Notices / 通知功能區

| Case | Status | Evidence | Observable acceptance / decision |
| --- | --- | --- | --- |
| `notices-loading` | **Implemented; Deferred skeleton variant** | `web/lib/notices-panel.tsx:138-149`; `web/lib/notices-panel.module.css:204-206` | Text loading output has polite announcement/`aria-busy` and no layout shift; three-row shimmer remains deferred. |
| `notices-empty` | **Implemented** | `web/lib/notices-panel.tsx:187,193-198`; `web/lib/notices-panel.module.css:175-194` | Empty card is centered, mark-all is disabled, and copy matches the participant export. |
| `notices-error` | **Implemented** | `web/lib/notices-panel.tsx:151-169`; `web/lib/notices-panel.test.tsx:174-193` | Alert and 44px Retry re-run the load path; no stale mutation state leaks. |
| `notices-offline` | **Implemented** | `web/lib/app-shell.tsx:58`; `web/lib/notices-panel.tsx:105-136`; `web/lib/notices-api.ts:65-71` | Server remains canonical for account-level `read_at`; client updates optimistically, POST stays idempotent, and offline failure is announced without pretending persistence succeeded. Do not add an online-disable branch. |
| `notices-permission` | **Implemented** | `web/lib/app-shell.tsx:159-179`; `web/lib/forbidden-view.tsx`; `web/lib/programs/program-handlers.ts:2849` | Unauthorized access uses the standard shell/Worker ForbiddenView; no in-panel permission card. |
| `notices-long-copy` | **Implemented** | `web/lib/notices-panel.module.css:89-150`; `web/lib/notices-panel.tsx:50-74` | `overflow-wrap:anywhere` plus `min-width:0` keeps title/body tokens inside the row; timestamp remains readable and no horizontal scroll occurs. |

### Messages / 消息

| Case | Status | Evidence | Observable acceptance / decision |
| --- | --- | --- | --- |
| `messages-loading` | **Implemented** | `web/lib/messages-panel.tsx:80-88`; `web/lib/copy.ts:274` | Loading output is announced with `aria-busy`; no premature empty/error flash. |
| `messages-empty` | **Implemented** | `web/lib/messages-panel.tsx:134-138`; `design_export/participant/messages.html:111-118` | Empty card uses the canonical message copy and omits the list container. |
| `messages-error` | **Implemented** | `web/lib/messages-panel.tsx:90-105`; `web/lib/copy.ts:272-273` | Alert and Retry are 44px-safe and recover through the normal load path. |
| `messages-offline` | **Implemented** | `web/lib/app-shell.tsx:58`; `web/lib/offline-banner.tsx`; `web/lib/home-api.ts:109-116` | Shared offline banner owns connection state; cached content stays readable; uncached load fails recoverably. |
| `messages-permission` | **Implemented** | `web/lib/home-handlers.ts:491-494`; `web/lib/app-shell.tsx:160-179` | All active authenticated accounts may read church-wide Messages; inactive accounts stop at the shell gate. |
| `messages-long-copy` | **Implemented** | `web/lib/notices-panel.module.css:125-130,152-162`; `web/lib/messages-panel.tsx:140-161` | Long CJK/Latin content wraps inside `minmax(0,1fr)`; chevrons and back controls remain usable. |
| `messages-detail` | **Implemented** | `web/lib/messages-panel.tsx:37-40,70-78,107-126`; `web/lib/messages-intent.ts:10-54` | Validated origin/malformed recovery, list Back via replace, and safe external links remain intact. Root Messages remains a Shell Section; no redundant root topbar Back. |

## Cross-cutting handles

| Handle | Status | Tag | Decision / acceptance |
| --- | --- | --- | --- |
| 800px Shared Shell + fluid participant body | **Implemented contract** | — | Keep one 800px shell transition; use fluid body constraints. Probe 320/375/390/414/799/800/1440. Assert no overflow, 44px targets, focus/keyboard, and dock/rail clearance. |
| Broad 680px / literal radius / literal border / 78px dock normalization | **Rejected** | — | Product tokens and Shared Shell win. Do not force export 680px, 10px/9px radii, export hex borders, or 78px dock where the live contract differs. |
| Participant enrollment history timeline | **Rejected** | — | Member detail exposes latest Participant Enrollment Summary only. Full history/decision notes remain in Manager Workspace. |
| Grouped Program schedule panel | **Selected** | — | One visual panel with separate `時間規則` and `即將舉行` groups; preserve source data split; hide empty groups. Prototype: `program-detail-upcoming-events-variants.html`. |
| Upcoming Event Set cap | **Selected** | — | Prototype/product hypothesis: active future Events ordered by `starts_at`, four on phone-width layouts and eight on desktop-width layouts. |
| Lifecycle dots | **Selected** | — | Variant 1 chosen: lifecycle dot rows. Active is neutral; `可簽到` is a visible compact label only when attendance is available. Prototype supports the 4/8 cap. |
| Single movable enrollment action | **Selected** | — | One control semantics for mutation states, inline/sticky as needed; no duplicate inline/sticky buttons. Prototype: `program-detail-enrollment-variants.html`. |
| Member permission advisory | **Selected** | — | Prototype muted `加入後可查看聚會詳情`; never exposes Event facts or weakens the backend gate. |
| Programs forbidden escape | **Selected** | — | Prototype safe `返回首頁` secondary escape; keep forbidden/recoverable distinction and existing authorization. |
| Home/Programs/Notices shared long-copy guards | **Selected** | — | Prototype `overflow-wrap:anywhere`; no line clamp or copy loss. Notices current rule is already Implemented. |
| Elapsed-time loading hints | **Rejected** | — | No 8-second timers or latency-specific copy in participant Sections. |
| Event Lifecycle Visibility | **Deferred** | `optional` | Separate future ticket for participant cancelled/rescheduled rows, explicit lifecycle copy, and danger/pending dots. Current contract remains active-only. |
| Notices offline mark-all disable | **Rejected** | — | Notices read state remains server-canonical with client optimistic presentation and reactive failure; native offline disable would create a second ownership model. |
| Evidence-blocked queue | **None** | — | Add a row only when a required viewport/state produces a reproducible failure or a real contract contradiction. |

## Prototype artifacts

- `.impeccable/phase-391/harden/program-detail-upcoming-events-variants.html`
  - `?variant=dot` is the selected lifecycle-dot direction.
  - `?variant=rail` and `?variant=baseline` remain comparison references.
  - phone renders four fixture Events; desktop renders eight.
- `.impeccable/phase-391/harden/program-detail-enrollment-variants.html`
  - eight lifecycle states;
  - latest Member summary only;
  - one mutation action element per actionable state;
  - no participant history timeline.
- Existing Section harden HTML files remain check-only references; they are not production fixtures.

## Wayfinder follow-ups

The existing root map is [#366](https://github.com/Noahlw/efcc/issues/366). Cross-cutting work that should survive the S2 stack is tracked as children rather than promoted into the active #396 implementation contract:

- [#397](https://github.com/Noahlw/efcc/issues/397) — Event Lifecycle Visibility (`wayfinder:grilling`, `type:optional`).
- [#398](https://github.com/Noahlw/efcc/issues/398) — Event Detail pre-window guidance prototype (`wayfinder:prototype`, production blocked by #370).
- [#399](https://github.com/Noahlw/efcc/issues/399) — Data-driven announcement venue contract (`wayfinder:grilling`, depends on #373).
- [#400](https://github.com/Noahlw/efcc/issues/400) — Management Messages contextual shell contract (`wayfinder:grilling`, depends on #369).

Rejected rows remain rejected and low-value no-failure visual variants remain matrix notes only.
