# 085-06 Scanner Confirm + Result acceptance trace

Authority: issue #313, `docs/specs/085-participant-experience.md` (US 36-40), and the canonical participant prototype (`design/efcc-participant-checkin-prototype.html` onScanContext + onCheckinResult).

Run against local `wrangler dev`/local D1 with an authenticated E2E member fixture. Assert each step through visible DOM or response state; no fabricated outcomes.

1. Resolve to exactly one event (direct scan or manual code, or via the multi-event chooser).
   - Observe the explicit confirmation screen: 確認簽到 header, 已辨識 tag, h1 確認聚會, lead 請核對聚會資料，確認後才會記錄出席。, event identity card (program name, event title, date/time, location), 確認簽到 primary action, and 不是這個聚會 escape.
2. Select 不是這個聚會.
   - Observe return to re-resolution (chooser when multiple events remain, else the scanner main screen) with NOTHING written (no attendance record created).
3. Select 確認簽到 → success.
   - Observe 簽到完成 result with the program/event identity, 返回首頁 and 再次簽到 actions; 返回首頁 navigates home, 再次簽到 returns to the scanner.
4. Re-scan the same event after a successful check-in.
   - Observe the quiet neutral duplicate result: 已完成簽到 / 你已在此聚會簽到，無需重複。 — never an error styling.
5. Force a server-side submit failure.
   - Observe the inline error 未能完成簽到，請重試一次。 with an explicit retry action that re-attempts the same confirmation.
6. Confirm while offline.
   - Observe the inline error 未能提交簽到。請重新連線後再次確認；系統不會自動重試。 and zero local or server state change (attendance not recorded; retry online succeeds).

Focused proof: `web/lib/self-check-in-panel.test.tsx` extensions (confirmation screen, escape, success, duplicate, failure+retry, offline) + e2e additions in `tests/e2e/attendance-d1.test.ts`; final proof also requires the repository's local verification gate and `git diff --check` before the ticket branch is submitted.