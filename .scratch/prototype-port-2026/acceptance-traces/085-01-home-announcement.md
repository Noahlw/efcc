# 085-01 Home + Announcement Detail acceptance trace

Authority: issue #306, `docs/specs/085-participant-experience.md`, and the canonical participant prototype in `design/efcc-participant-checkin-prototype.html`.

Run against local `wrangler dev`/local D1 with an authenticated E2E member fixture. Assert each step through visible DOM or response state; do not use prototype demo toggles or fabricated data.

1. Sign in as a member with an upcoming enrolled event and visit `/home`.
   - Observe a greeting with the member name and `下一項與你有關的安排。`.
   - Observe the real program/event title, date, time, location, `已報名`, and `查看聚會`.
2. Sign in as a member without an upcoming enrolled event and visit `/home`.
   - Observe `暫時沒有與你有關的聚會` and `你未有已報名的聚會。探索課程，尋找合適的參加機會。`.
   - Observe `探索課程`; no event commitment or demo content is rendered.
3. With published Home Content available, visit `/home`.
   - Observe the real Template B church-announcement title/summary/date card under `教會消息`.
   - Select the card and observe the announcement detail screen.
   - Observe venue/arrival guidance, `崇拜及主要聚會`, `親子室`, and `訪客接待` rows.
   - Observe any venue URL labeled `外部連結`, with `target="_blank"` and `rel="noopener"`.
   - Select `首頁`/back and observe `/home` restored.
4. With an open-for-enrollment program available, visit `/home`.
   - Observe one real program under `探索`.
   - Select `全部課程` and observe navigation to `/programs`.
5. In the stale featured-event case, observe the next eligible future Active event instead of a placeholder or stale event.

Focused proof: `tests/e2e/home.test.ts` plus `web/lib/home.test.tsx`; final proof also requires the repository's local verification gate and `git diff --check` before the ticket branch is submitted.