# S2 Home Structural Loading Skeleton — Acceptance Plan

**Status:** Accepted — HOME-SKEL-01 through HOME-SKEL-05 verified locally
**Scope:** Home Section content loading only. No shell, API, auth, enrollment, or mutation change.
**Authority:** `design_export/participant/home.html` for composition; live Shared Shell and token contracts remain authoritative when the export has no loading state.

## Contract

While the authenticated Home projection is pending, Home renders a non-interactive structural skeleton that reserves the main content geometry for:

- the greeting/header block;
- the next-event card;
- announcement rows; and
- the Home Explore area.

The skeleton uses the existing loading announcement and `aria-busy` state. It does not add an elapsed-time timer, an 8-second hint, fake content, clickable links, or a second offline banner. Once the projection resolves, the skeleton is replaced by exactly one of the existing `ready`, `empty`, or `error` states.

## Acceptance trace

### HOME-SKEL-01 — Pending projection is distinct from empty

1. Open authenticated `/home` as `E2E_member` while the Home projection remains pending.
2. Assert a Home loading region is present with `aria-busy="true"` and the structural skeleton test hook.
3. Assert `home-empty-state`, `home-error-state`, Explore links, and event/detail links are not presented as loaded content.
4. Assert the existing loading announcement remains available to assistive technology.

### HOME-SKEL-02 — Skeleton preserves responsive geometry

At viewport widths `320x844`, `375x844`, `390x844`, `414x844`, `799x900`, `800x900`, and `1440x900`:

- `document.documentElement.scrollWidth <= window.innerWidth`;
- no skeleton element clips or creates horizontal scrolling;
- shell dock/rail clearance remains intact; and
- no skeleton control is presented as an actionable 44px target.

### HOME-SKEL-03 — Ready transition removes skeleton

1. Resolve the pending Home projection with normal demo data.
2. Assert the skeleton is removed.
3. Assert the Home event/announcement/Explore content is rendered once.
4. Assert no empty-state copy was exposed during the pending-to-ready transition.

### HOME-SKEL-04 — Empty transition remains truthful

1. Resolve the pending projection with no enrolled upcoming event and no Home content.
2. Assert the skeleton is removed.
3. Assert the existing Home empty state and `探索課程` CTA are rendered.
4. Assert no loading placeholder remains in the DOM.

### HOME-SKEL-05 — Error transition remains recoverable

1. Resolve the Home projection with a recoverable network/5xx failure.
2. Assert the skeleton is removed.
3. Assert the existing Home error state is exposed as an alert with Retry.
4. Activate Retry and assert the loading state can appear again without duplicate skeletons or duplicate announcements.

## Verification gate

The local `wrangler dev` + disposable `E2E_*` D1 fixture run must cover HOME-SKEL-01 through HOME-SKEL-05. This plan does not authorize a deployed `/exec` smoke or any mutation of Apps Script/Google Sheets.
