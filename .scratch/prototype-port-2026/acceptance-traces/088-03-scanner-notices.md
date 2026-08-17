# 088-03 Participant Scanner and Notices — acceptance trace

## Authority and truth ranking

- Binding prototype: `/Users/noah.wong/Desktop/code/temp/EFCC Participant Check-in (Standalone).html`
- Binding SHA-256: `3e52635e1309600a1957621829c9808f96cac74280aabaeb3940596fbeade1f2`
- Verified on 2026-08-18 before production edits.
- The binding file contains a JSON-encoded `script[type="__bundler/template"]`. It was
  parsed with `JSON.parse`; the decoded value is the 213198-byte participant template.
- Truth ranking for this ticket:
  1. Decoded template markup, inline styles, and `script[type="text/x-dc"]`
     handlers from the binding file.
  2. Existing production route/API contracts and tests.
  3. Live/headless prototype observations at the target viewports.
  4. Ticket prose where the prototype does not expose a required production
     state (notably Notices loading/retry).
- If live rendering disagrees with decoded source, decoded source wins.
- Scenario controls, offline simulator, and `示範資料` are reference-only and
  must not be copied to production.

## Decoded source map

The decoded `__bundler/template` blocks used for this ticket are:

| Source block | Decoded template lines | Important handlers |
| --- | ---: | --- |
| Scan shell | 411–443 | `onStartScan`, `onOpenManual` |
| Chooser | 444–463 | `backFromChooser`, `row.onChoose` |
| Outcome | 464–490 | `backToScan`, `viewIntroFromOutcome` |
| Confirmation | 491–515 | `backFromChooser`, `onConfirmCheckin`, `onNotThisEvent` |
| Check-in result | 516–533 | `goHomeFromResult`, `scanAgainFromResult` |
| Notices | 534–557 | `onMarkAllRead`, `n.onOpen` |
| Manual overlay | 653–669 | `onCloseManual`, `onSubmitManual` |
| Confirmation overlay | 670–684 | `onAcceptConfirm`, `onCloseConfirm` |

The decoded `text/x-dc` handler source confirms:

- `openManual` opens the manual-code overlay and clears its error.
- `submitManualCode` requires exactly six digits and reports
  `請輸入六位數聚會代碼。`; valid input closes the overlay and resolves.
- `startScan` delegates to the same resolve path as manual entry.
- `resolveScan` routes normal, multi-event, window-not-open, cancelled,
  not-enrolled, invalid-code, and offline outcomes without changing the
  underlying check-in contract.
- `confirmCheckin` keeps the confirmation screen on offline/submit failure,
  and the successful path records success or duplicate then shows the result.
- `markAllRead` clears every notice's unread flag and announces
  `所有通知已標示為已讀`.

## Source-derived visual and copy contract

### Scan (`?screen=scan`)

- Shared shell/header label is `掃描`; participant page H1 is `聚會簽到`.
- Lead is `掃描場地顯示的二維碼。`.
- Main scan card is a white raised surface with a `1px solid #d6dcde`
  border, `10px` radius, `22px` padding, and centered content.
- Viewfinder is square, `max-width: 280px`, `aspect-ratio: 1`, `#fafafa`
  background, `1px solid #d6dcde` border, `12px` radius, and a centered
  camera affordance with an inset `15%` black `3px` scan frame.
- Primary action is full width, at least `48px` high, cinnabar
  (`#9c302c`) with white text: `開始掃描`.
- Manual fallback is a two-column method grid on space where it fits:
  `輸入聚會代碼` / `相機不可用時，輸入現場顯示的六位數代碼。`.
- Privacy note is a bordered note card:
  `只在你按下後使用相機` /
  `相機權限只會在開始掃描時請求。`.
- Camera-unavailable alert uses:
  `未能使用相機` /
  `你可以檢查瀏覽器權限，或改用下面的聚會代碼繼續 — 兩種方式同樣可靠。`.
- No scenario chips, offline simulator, or preview/demo copy may render.

### Chooser and confirmation

- Chooser header is `選擇聚會`, with `重新掃描`, the tag
  `已辨識多個聚會`, H1 `選擇要簽到的聚會`, and lead
  `此二維碼可用於多個聚會，請揀選你參加的那一個。`.
- Chooser rows are full-width, at least `72px`, left-aligned, bordered
  white cards with a trailing chevron.
- Confirmation header is `確認簽到`, with `重新掃描`, `已辨識`, H1
  `確認聚會`, lead `請核對聚會資料，確認後才會記錄出席。`.
- Confirmation shows program, event name, Hong Kong date/time, and location
  before any write. Actions are `確認簽到` and `不是這個聚會`.
- Submit failure is visible on the confirmation screen, preserves the event
  identity, and exposes a retry only for retryable online/server failures.
  Offline submit uses the production copy and does not auto-retry.

### Outcome and result states

- Outcome hierarchy has `簽到狀態`, a 64px semantic status icon, a centered H1,
  explanatory body, and `返回掃描`.
- Window-not-open: `簽到尚未開放`, opening time, and the
  30-minute-before-start explanation when the API provides that relationship.
- Cancelled: `此聚會已取消` and
  `請留意教會通知，或聯絡負責同工了解最新安排。此聚會不會記錄出席。`.
- Not enrolled: `你尚未報名此課程`, its enrollment guidance, and
  `查看課程詳情` plus `返回掃描`.
- Invalid code and resolve-offline failures remain observable inline on the
  scan surface with production error copy and an immediately usable retry path.
- Success result: `簽到結果`, `簽到完成`, event identity, `返回首頁`,
  `再次簽到`.
- Duplicate result is neutral: `已完成簽到`,
  `你已在此聚會簽到，無需重複。`; it is not an error/alert state.

### Notices (`?screen=notices`)

- Shared shell/header label and page H1 are `通知`.
- Lead is `聚會、報名及帳戶相關消息。`.
- Toolbar has `最新` and `全部標示已讀`.
- List is a bordered white container of full-width rows with unread red dots,
  title/body copy, and a Hong Kong timestamp.
- Empty state is `暫時沒有通知` with
  `有新的聚會或帳戶消息時，會在這裡顯示。`.
- Production also keeps the existing observable loading state
  `正在載入通知…`, recoverable error state `未能載入通知。`, and retry
  `重試載入通知` because those are in the ticket contract and API seam even
  though the standalone prototype's notices block only shows list/empty.
- Mark-all-read updates the visible unread state and live announcement without
  changing the existing `/api/v1/programs/notices/read-all` contract.

## Exact source workflows exercised

At `390×844` with the binding file loaded:

1. `?screen=scan` → `正常` → `開始掃描` → `確認聚會` → `確認簽到` →
   `簽到完成`; repeat through `再次簽到` → `已完成簽到`.
2. `多個聚會` → `開始掃描` → `選擇要簽到的聚會`.
3. `尚未開放` → `開始掃描` → `簽到尚未開放`.
4. `已取消` → `開始掃描` → `此聚會已取消`.
5. `未報名` → `開始掃描` → `你尚未報名此課程`.
6. `無效代碼` → `開始掃描` →
   `找不到此代碼對應的聚會，請確認後重試。`.
7. `離線` → `開始掃描` →
   `現時沒有網絡，未能核實聚會資料。請重新連線後再試一次。`.
8. `輸入聚會代碼` → invalid `12345` →
   `請輸入六位數聚會代碼。`; valid `123456` → `確認聚會`.
9. `送出失敗` → `開始掃描` → `確認簽到` →
   `未能完成簽到，請重試一次。`.
10. `?screen=notices` → list → `全部標示已讀` →
    `所有通知已標示為已讀`.

The direct owned screens `?screen=scan`, `?screen=scan-chooser`,
`?screen=scan-context`, `?screen=checkin-result`, `?screen=scan-outcome`,
and `?screen=notices` were opened at both `390×844` and `1280×800`.
Each rendered its expected H1 and had no horizontal overflow in the DOM.

## Production assertions

All acceptance assertions must use observable DOM or same-origin response
state. Do not use CSS-module class names as acceptance selectors.

- `ScannerBoundary`: `/scanner` remains the only route; scanner-intent query
  state still controls self/assisted mode and event context; nested event
  deep links keep the scanner active state.
- `SelfCheckInPanel`: H1/lead, camera frame, primary action, camera-unavailable
  alert, manual fallback, privacy note, six-digit validation, chooser,
  confirmation-before-write, all three resolve outcomes, invalid/offline
  status, submit failure + retry, success, duplicate, and rescan are all
  observable through roles, labels, copy, and response assertions.
- `attendance-scanner-ui`: chooser, confirmation, result, outcome, camera,
  and unavailable components expose the prototype hierarchy and production
  copy through public props/DOM.
- `NoticesPanel`: loading, error/retry, empty, unread indicators and
  timestamps, list links, mark-all-read response, disabled-after-read state,
  and live announcement are observable.
- `scanner-intent`: malformed/valid scanner query state remains unchanged and
  no new route or worker seam is introduced.

## TDD seams and commands

Write failing assertions before implementation at the existing seams:

- `web/lib/scanner-boundary.test.tsx`
- `web/lib/self-check-in-panel.test.tsx`
- `web/lib/attendance-scanner-ui.test.tsx` (add only if the existing UI seam
  needs direct coverage)
- `web/lib/notices-panel.test.tsx`
- `web/lib/scanner-intent.test.ts`
- `tests/e2e/attendance-d1.test.ts` and the existing responsive suite for
  observable local production behavior.

Focused iteration commands:

```sh
pnpm --dir web exec vitest run --config vitest.components.config.ts \
  web/lib/scanner-boundary.test.tsx \
  web/lib/self-check-in-panel.test.tsx \
  web/lib/notices-panel.test.tsx
pnpm --dir web exec vitest run web/lib/scanner-intent.test.ts
pnpm --dir web typecheck
pnpm typecheck
```

Required local acceptance gate:

```sh
pnpm db:seed:local
pnpm db:seed:demo
pnpm dev:local
pnpm exec playwright test -c tests/e2e/attendance-d1.config.ts
pnpm exec playwright test -c tests/e2e/responsive.config.ts
pnpm verify
```

`pnpm dev:local` must serve `wrangler dev` at `127.0.0.1:8787`. The D1 seed
commands may reset only the checked-in disposable `E2E_` / `E2E_DEMO_`
fixtures. No Apps Script, Google Sheets, Cloudflare account, new Worker,
new D1 migration, route, or demo fixture is part of this ticket.
