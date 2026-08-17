# 085-05 Scanner Resolve acceptance trace

Authority: issue #308, `docs/specs/085-participant-experience.md` (US 26-33 + Implementation Decisions), and the canonical participant prototype in `design/efcc-participant-checkin-prototype.html`.

Run against local `wrangler dev`/local D1 with an authenticated E2E member fixture. Assert each step through visible DOM or response state; no fabricated outcomes, no demo scenario switcher.

1. Open `/scanner` (self mode).
   - Observe 聚會簽到 heading, the camera frame card, 開始掃描 button, and the 簽到方式 row with 輸入聚會代碼 and 只在你按下後使用相機 cards.
   - Assert no camera permission prompt appears on mount (lazy); it appears only after clicking 開始掃描.
2. Click 開始掃描 with camera available → video/camera state; with camera missing or denied → the 未能使用相機 alert appears while the manual-code card remains visible and usable.
3. Manual code entry: enter fewer/more than 6 digits or non-numeric text.
   - Observe inline error 請輸入六位數聚會代碼。, input retains focus, no request is sent; correct a 6-digit code and observe resolution.
4. A valid 6-digit code matching exactly one currently-open event → single event is selected and handed to the confirmation seam (確認/提交 controls from the existing flow; the prototype 確認聚會 screen itself is 085-06).
5. A code/QR matching multiple simultaneously-open events → the chooser screen appears (選擇要簽到的聚會, rows for each candidate with title + copy); 重新掃描 returns to the main screen; selecting a row lands on the confirmation seam.
6. A code for a program whose check-in window has not opened → outcome screen 簽到尚未開放 with the exact real opening time (聚會開始前 30 分鐘 parenthetical only when derived from real opens-at vs starts-at); 返回掃描 returns.
7. A code for a Cancelled event → outcome screen 此聚會已取消 with the exact copy; 返回掃描 returns.
8. A code for a program the member is not enrolled in (no open event) → outcome screen 你尚未報名此課程 with 查看課程詳情 linking to the real program detail and 返回掃描.
9. An invalid/unknown code → inline error on the main screen with immediate retry (no hang, no false resolution). Offline (network failure) → inline offline error with retry.
10. Duplicate check-in and submit-failure states remain covered by the existing flow (085-06 owns result screens).

Focused proof: `web/lib/self-check-in-panel.test.tsx` (one test per outcome branch) + worker tests for the extended resolve contract (`attendance-worker.test.ts`) + e2e additions in `tests/e2e/attendance-d1.test.ts`; final proof also requires the repository's local verification gate and `git diff --check` before the ticket branch is submitted.