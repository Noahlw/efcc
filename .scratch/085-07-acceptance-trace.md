# NTC-01 Acceptance Trace — 085-07 Participant Notices (#324)

Gate: fresh local D1 (migrate → `db:seed:local` → `db:seed:demo`), wrangler dev on 127.0.0.1:8787, member `E2E_member`.

Demo seed creates 3 notices for the E2E member: 聚會提醒 (kind=event, linked to a real E2E_DEMO_成人查經 event, unread), 報名結果 (kind=program, E2E_DEMO_青年團契, unread), 帳戶更新 (kind=account, read). unread_count = 2.

## Criteria → observable assertion

1. **List renders unread indicator + timestamp per item** →
   `/notices` shows the 通知清單 list with 3 items; titles 聚會提醒/報名結果/帳戶更新 and their bodies visible; toolbar shows `2 未讀`; the two unread items carry an sr-only 未讀 label (the read 帳戶更新 item does not); each item renders a `<time dateTime>`.
2. **全部標示已讀 clears every unread indicator with a toast** →
   click 全部標示已讀 → announce output role=status contains 已將全部通知標示為已讀; toolbar unread count disappears; `page.reload()` → list still shows 3 items with zero unread indicators (server-persisted read state, notices retained, not deleted).
3. **Empty state** → covered by the component test (`notices-panel.test.tsx`): zero notices renders 暫時沒有通知 + 有新消息時會在這裡顯示。 (no member-visible way to delete notices in the e2e without a destroy endpoint).
4. **Routing per subject — one test per destination type** (component tests) + e2e URL assertions:
   - event notice → `buildProgramsHref({mode:"participant", programId, eventId})` → `/programs?program=<id>&event=<eventId>` (URL asserted in e2e).
   - program notice → `/programs?program=<id>` (URL asserted in e2e).
   - account notice → `/profile` (URL asserted in e2e).
5. **Read notices retained** → after mark-all-read + reload, all 3 notices remain listed (read_at set, rows not deleted); retention window is 90 days (server-side `created_at > now - 90d`), exercised by the worker test (notices-worker.test.ts).

## Rerun tolerance
Suite runs 3 viewport projects against one shared D1; the first project sees the fresh unread state, later projects see read state. The list+mark-all e2e branches on the observed unread count so it stays green on reruns while still asserting the fresh state on the first project.
