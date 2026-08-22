# S2 Participant Origin and Recovery Acceptance Plan

**Baseline:** `88b96afa`  
**Polish branch:** `feat/391-polish-on-88b96af`  
**Target:** local `wrangler dev` at `http://127.0.0.1:8787` with disposable `E2E_` / `E2E_DEMO_` D1 fixtures only.

## Scope

This trace covers the selected Phase 391 polish contracts: validated origin-aware detail navigation, Home loading/error/empty truthfulness, stale Event Detail recovery without changing authorization, Messages lead and malformed-detail recovery, Programs true-empty copy, and long-token wrapping. Strict Program Detail schedule/history export parity is deferred.

## Setup

```bash
export PATH=/Users/noah.wong/.local/share/fnm/node-versions/v22.18.0/installation/bin:$PATH
pnpm db:seed:local
./node_modules/.bin/tsx tests/e2e/seed-demo.ts
```

Authenticate through the UI as `E2E_member` / `E2E_member!dev`. Use fresh browser contexts per scenario. Capture at `320x844`, `375x844`, `390x844`, and `414x844`; `390x844` is the required parity viewport.

## Acceptance Criteria

| ID | Scenario | Observable acceptance |
|---|---|---|
| ORG-01 | Home Explore → Program Detail | On `/home`, the `data-testid="explore-card"` href contains the safe featured Program id and `from=home`; activating it renders Program Detail. The detail Back action navigates to `/home`, not the Programs catalog. |
| ORG-02 | Catalog → Program Detail | Selecting a Programs catalog row produces `from=programs`; Back returns to `/programs` with no detail query. |
| ORG-03 | Notices → Program/Event Detail | Program/Event Notice links contain `from=notices`; valid origin Back returns to `/notices`. Account Notice remains `/profile`. |
| ORG-04 | Event direct deep link | A direct participant Event URL with no internal Programs history has a working Back fallback to its safe parent Program Detail, or `/programs` when the id is unusable. No arbitrary URL is followed. |
| ORG-05 | Messages list/detail | Message rows contain `from=messages`; detail Back replaces the query and renders the list without a history loop. Malformed/unknown `content` renders `找不到此內容。` and `返回教會消息`, without echoing the supplied id. |
| REC-01 | Stale/unauthorized Event Detail | A non-enrolled participant Event deep link keeps the server 404/enrollment authorization behavior, renders a recoverable alert, offers `查看課程詳情` only for a safe Program id, and always offers `返回課程目錄`; no check-in CTA appears. |
| REC-02 | Home loading/error/empty | A slow Home response shows `aria-busy` loading, never the resolved empty card. If Home and catalog fallback fail, a `role="alert"` plus `重試載入首頁` appears. A successful empty response renders the existing empty card and Explore CTA. |
| REC-03 | Programs true empty vs filtered empty | Zero catalog data shows `目前沒有可顯示的課程`; a non-empty catalog with zero search/filter matches shows `找不到相關課程`. The clear action resets both query and filter. |
| VIS-01 | Status and typography | Open Event Detail `可簽到` uses success semantic tokens; Notices/Messages Section H1 and row titles use explicit semibold weight; Messages shows `崇拜、聚會安排及教會公告。`. |
| VIS-02 | Long content | URL-like title/body content wraps inside Notices/Messages grid cells at 320px; chevron/timestamp remain visible; no document or element horizontal overflow. |
| RESP-01 | Phone widths | For every selected scenario, `document.documentElement.scrollWidth <= window.innerWidth`; primary CTAs remain at least `44x44px`; single CTA bars remain readable; multi-action recovery/dialog controls stack deliberately at 320px rather than accidental wrapping. |
| AUTH-01 | Authorization invariant | Existing backend Event Detail authorization tests remain green; no Worker/ D1 permission rule or enrollment projection is loosened. |

## Evidence Contract

Record the live URL, fixture state, viewport, screenshot path, and observable DOM/URL assertion for each criterion. Use the existing `.impeccable/phase-391/harden/*.html` files only as check-only proposals; they are not acceptance evidence until the corresponding production state is selected and exercised.

## Out of Scope

No production database, Google Sheets, Apps Script, deployed Worker, or management Section is mutated. Strict schedule-card/history-dot parity and broad export literal radius/width normalization remain deferred.
