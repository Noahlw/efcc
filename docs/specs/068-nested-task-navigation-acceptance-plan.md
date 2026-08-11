# Issue #68 — Nested Task Navigation Acceptance Plan

**Target:** Fresh versioned `/exec` deployment after push
**Spec:** `docs/specs/009-phone-first-shell-navigation.md` §"Client responsibilities" / §"Expansion contract" + ADR-0010 + issue #64 Implementation Decisions + issue #68 AC
**Date:** 2026-07-29
**Branch:** `feat/issue-68-nested-task-navigation`
**Parent:** #64. Blocked by: #67 (merged into `main`, commit history confirms).

## Scope note

Issue #68 builds the **navigation-model infrastructure**: a single client
navigation controller that owns root Section, an optional nested task, the
active parent, loading/error state, and recoverable per-Section view context
(filter/scroll/selection). Real domain features (Program catalog admin,
Event create/edit, enrollment, attendance, scanning) are owned by later specs
(#43–#53 etc.) and are explicitly out of scope here — this ticket proves the
*mechanism* generically, demonstrated through two concrete example nested
tasks (a "detail" task under Programs and an "edit" task with a client-only
mock mutation under Events) that exercise every AC without inventing real
business RPCs. No server (`.gs`) changes are required; this is a client-only
extension of `shell-session.js.html`.

## Role matrix

Reuses the three seeded EFCC application-layer users from ADR-0012 / issue
#67 — no new Sheet rows required.

| Role | Username | PIN | Root Sections available (phone order) |
| --- | --- | --- | --- |
| MEMBER | alice | 1234 | 個人, 課程, 聚會 |
| STAFF | bob | 5678 | 個人, 課程, 掃描, 聚會, 更多(關懷/權限) |
| ADMIN | noah | 6883 | 個人, 課程, 掃描, 聚會, 更多(關懷/權限) |

## Phone viewport trace (375×812) — MEMBER (alice)

### 1. Login → Programs root → open demo detail task
- Log in as alice. Land on 個人資料 (Profile).
- Click 課程 (Programs). Confirm root Section renders and 課程 nav item is
  active (`aria-current="page"`).
- Click the demo "查看範例課程詳情" button. Confirm:
  - The content region replaces with the nested task view, not a new
    document (`document.title` unchanged, no URL change).
  - A Traditional Chinese Back control (`返回`) is visible.
  - The task view displays its parent Section name ("課程") in a header/
    breadcrumb-equivalent element.
  - The root phone nav still shows 課程 as the active item (parent stays
    highlighted per issue #64 user story 22).

### 2. Nested Back returns to the Section root with preserved state
- Before opening the task, scroll the Programs list container and note
  scroll position (demo section renders enough filler content to be
  scrollable at 375px, or the test asserts the stored `scrollTop` value
  directly if visually negligible).
- Click 返回. Confirm the content region shows the Programs root view again
  (not a full re-render from scratch — same scroll/selection state restored)
  and the nested task DOM is fully unmounted (no leftover breadcrumb/back
  button in the DOM).

### 3. Selecting a root nav item from within a nested task exits ambiguity-free
- Re-open the demo detail task under Programs.
- Click 聚會 (Events) in the phone nav. Confirm the app lands directly on
  the Events root Section (not the Programs root, not the nested task) —
  no intermediate state, no duplicated back-stack.
- Click 課程 (Programs) again. Confirm it lands on the Programs **root**
  view (not a stale nested task), since the last direct nav action targeted
  Events in between.

## Desktop viewport trace (1280×800) — STAFF (bob)

### 4. Desktop breadcrumb on a nested task
- Log in as bob. Navigate to 聚會 (Events) via the side rail.
- Click the demo "編輯範例聚會" (edit) button on the placeholder Event.
  Confirm a breadcrumb-equivalent element reading something like
  "聚會 › 編輯" is visible (desktop uses breadcrumb instead of/in addition to
  the phone Back button per issue #64 user story 23).

### 5. Successful mock mutation invalidates cache and refreshes
- Inside the demo edit task, click the demo "儲存" (save) button. Confirm:
  - The task closes and the view returns to the Events root.
  - The Events root shows a visibly different value than before the "save"
    (proving the section's cached view state was invalidated, not silently
    reused) — e.g. an updated demo counter/label.
  - No `google.script.run` call occurs anywhere in this flow (client-only
    mock, no server RPC exists for Events yet).

### 6. Explicit Refresh action on a data-bearing Section
- On the Events root (desktop), locate an explicit "重新整理" (Refresh)
  control distinct from browser reload. Click it. Confirm the Section
  re-renders without navigating away and without any full-document reload.

## Forbidden / unknown route trace

### 7. Unauthorized root Section via console-level `navigateTo_`
- After alice (MEMBER) login, evaluate in the browser console a call that
  requests an unauthorized/unknown Section key (e.g. `care`, which alice
  does not have).
- Confirm a visible Traditional Chinese explanation renders (not a blank
  screen, not protected content) and a control returns to the nearest
  permitted root Section (課程 or 個人).

## Badge trace

### 8. Badge caps at 99+ and never blocks navigation
- Where the demo badge count is deliberately seeded above 99 (client-side
  fixture, no server dependency), confirm the rendered badge text reads
  `99+`, and that clicking the badge-bearing nav item still navigates
  successfully (a badge-computation failure/absence must never block the
  click).

## Non-goals for this run

- Program Leader role testing (no controlled `Program_Leaders` sheet
  assignment in this pipeline, same limitation as the #67 run).
- Real Program/Event domain data — the demo tasks use client-only fixture
  content, clearly labeled, pending the deferred section-RPC ticket.

## Executed results

_(Historical record. The retired Apps Script `/exec` Playwright runner and its `pnpm test:e2e`/`posttest:e2e` appender are no longer part of this repository. Current acceptance evidence uses the local Worker/D1 suites documented in `tests/e2e/README.md`.)_
