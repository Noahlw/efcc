# 088 Visual Shared Shell — acceptance trace

Authority: Spec 088 (`docs/specs/088-visual-shell.md`) and the **Standalone
HTML files** (open these; do not use 8787, design-tree, or a stale `design/`
copy as the prototype):

- `/Users/noah.wong/Desktop/code/temp/EFCC Participant Check-in (Standalone).html`
  SHA-256 `3e52635e1309600a1957621829c9808f96cac74280aabaeb3940596fbeade1f2`
- `/Users/noah.wong/Desktop/code/temp/EFCC Management Workspace (Standalone).html`
  SHA-256 `b101731d680e4c18054be396048207a355d73ce46135701ecfd83579dbc52754`

Screen inventory: `docs/specs/088-prototype-screen-map.md`.
Run against local `wrangler dev` + local D1. Assert through visible DOM or
response state. For each visual step, manually open the exact Standalone
`?screen=` first and reproduce the documented state at the target viewport.

1. Confirm both Standalone files exist and their SHA-256 values match the hashes above. If `design/*.html` differs, recopy from Standalone.
2. For every implementation ticket, record the exact prototype file, `?screen=` query, state setup steps, and target viewport before editing the corresponding production surface.
3. Sign in as `E2E_member` at phone width ≤919. Compare the live production shell manually with the participant Standalone Home reference. Observe dock labels 首頁 / 課程 / 掃描 / 通知 / 帳戶 with icons. Observe 掃描 is a raised FAB whose link is the scanner key. Observe Home header **顯恩堂**. Observe no header 登出. Observe no 示範資料.
4. Open Account. Observe 登出. Sign out (existing logout failure copy if RPC fails).
5. Sign in as `E2E_staff` or `E2E_admin`. Compare the live shell manually with the management Standalone `directory`/`home` reference. Observe slot 4 管理. Observe header actor + role. If Notices is authorized, observe a bell that opens Notices; otherwise no bell.
6. Visit Programs. Manually open the matching participant or management Standalone `?screen=programs&...` at the same viewport. Observe header 課程 (lookup table), not 顯恩堂. Visit `/profile/settings` and compare with the Standalone `account-settings` screen; observe header 帳戶設定.
7. Resize or set viewport ≥920. Manually compare with the Standalone desktop reference. Observe left rail ~180px, header in the content column (not under the rail), phone dock hidden.
8. For each catalogued screen and state, perform the manual reference workflow in the ticket, then inspect the corresponding 8787 route side by side. Do not use generated PNGs or screenshot baselines as proof.
9. Focused proof: retargeted `tests/e2e/shell-nav.test.ts` + `web/lib/app.test.tsx` + responsive fixtures; `pnpm verify` / required Playwright suites green. FAB assertion is by scanner accessible name / key, not `nth(2)`.
