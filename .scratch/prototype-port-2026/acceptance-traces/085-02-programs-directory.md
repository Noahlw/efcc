# 085-02 Programs Directory acceptance trace

Authority: issue #307, `docs/specs/085-participant-experience.md` (US 9-13), and the canonical participant prototype in `design/efcc-participant-checkin-prototype.html`.

Run against local `wrangler dev`/local D1 with an authenticated E2E member fixture. Assert each step through visible DOM or response state; no fabricated data.

1. Sign in as a member and open `/programs` (participant mode).
   - Observe the search field (搜尋課程), the 課程篩選 pill group with exactly 全部/可報名/已參加/待審批, and the catalog card list with per-program status tags (已參加/待審批/可報名/由同工安排/已退出/已取消申請/已拒絕/已封存) matching the member's real enrollment relationship.
2. Type a program name fragment into search.
   - Observe the catalog narrows to matching programs only; clear the query and observe all rows return.
3. Select 可報名.
   - Observe only programs with viewerState eligible; select 已參加 → only active-enrolled; 待審批 → only pending-request programs; 全部 → all.
4. During fetch, observe the loading skeleton with `aria-label="正在載入課程"`.
5. Force the catalog fetch to fail (e.g. intercept/offline).
   - Observe the alert state 未能載入課程 / 請檢查網絡後再試。你的搜尋條件會保留。; set a search query + a filter first, then retry with 重新載入 and observe the same query + filter selection preserved and rows reloading.
6. Search/filter to a zero-match state.
   - Observe 找不到相關課程 / 請嘗試其他關鍵字或清除篩選。; select 清除篩選 and observe the query cleared, filter reset to 全部, and the full catalog restored.
7. Select a program row.
   - Observe navigation to the program detail URL intent (existing `/programs?program=<id>` handoff), unchanged by this ticket.

Focused proof: `web/lib/programs/participant-directory.test.tsx` plus worker tests for the catalog viewer-state projection; final proof also requires the repository's local verification gate and `git diff --check` before the ticket branch is submitted.