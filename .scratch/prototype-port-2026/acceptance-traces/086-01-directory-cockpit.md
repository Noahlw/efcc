# 086-01 Management Directory + Course Cockpit acceptance trace

Authority: issue #309, `docs/specs/086-course-cockpit-and-operations.md` (US 1-7), and the canonical management prototype in `design/efcc-management-workspace-prototype.html`.

Run against local `wrangler dev`/local D1 with authenticated E2E admin/staff fixtures. Assert each step through visible DOM or response state; no fabricated data.

1. Sign in as a management-capable account and enter management mode.
   - Observe the directory lists ONLY programs within the actor's real authorized scope (department/program grants, never role-inferred). Sign in as an account with zero management scope and observe an honest empty state, not a crash or hidden screen.
2. Open a program's Cockpit from the directory.
   - Observe the status-first layout: program name + 編輯課程, department/lifecycle pills, then (when an upcoming meeting exists) the 下一聚會 card with real title, `when · where`, 自動排程 tag for recurring programs, live 已簽到 x/y progress for recurring programs, and 前往管理名單 button.
   - For a program with NO upcoming meeting: observe the next-meeting block is fully omitted (no empty placeholder) while the 2-up operational tiles remain.
3. 2-up operational tiles: 聚會 tile shows real 個聚會 count; 參與者 tile shows 待審批報名 ×N when pending requests exist (real count) or 查看活躍名單 when none.
4. Select 前往管理名單 on the next-meeting card.
   - Observe direct navigation into that specific meeting's roster view carrying the event context (086-04 builds the roster UI; the path/task param must carry the event id).
5. From a program's participant detail, switch into management mode.
   - Observe the same program's Cockpit opens — the program context is preserved across the mode switch.
6. Quiet low-frequency rows (課程資料 / 設定 / …) render under 其他 — 低頻設定 below the operational tiles, not competing for primary attention.

Focused proof: `web/lib/programs/program-workspace.test.tsx` + `management-directory.test.tsx` component suites plus worker tests for any new cockpit projection; e2e additions in `tests/e2e/programs-d1.test.ts` MUI-01 block; final proof also requires the repository's local verification gate and `git diff --check` before the ticket branch is submitted.