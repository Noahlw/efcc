# 085-03 Program Detail + Enrollment Actions acceptance trace

Authority: issue #312, `docs/specs/085-participant-experience.md` (US 14-20), and the canonical participant prototype (`design/efcc-participant-checkin-prototype.html` onProgramDetail + STATE_ACTION machine).

Run against local `wrangler dev`/local D1 with authenticated E2E member fixtures. Assert each step through visible DOM or response state; no fabricated data.

1. Member opens a program detail.
   - Observe purpose text, next-event card (date/time/location) with 查看聚會詳情 link, 聚會時間表 schedule table, and the member's own 報名紀錄 enrollment history.
2. ManagerOnly program detail: observe the 由同工安排 status tag and the read-only note 此課程由同工安排參加; NO self-enroll action renders.
3. Archived program detail: observe the 已封存 tag + archived note; no interactive enrollment action.
4. Eligible member: select 報名 → status updates to 待審批 with a toast (報名申請已提交).
5. Pending member: select 取消申請 → explicit confirm dialog 取消報名申請？ / 你仍可在課程接受報名期間重新提交。; confirming withdraws the request (取消申請 action), canceling the dialog leaves the request intact.
6. Active member: select 退出課程 → explicit confirm dialog 退出課程？ / 退出後如需再參加，需重新報名。; confirming cancels the enrollment, canceling the dialog leaves it intact.
7. Withdrawn/cancelled/rejected member: 重新報名 re-submits a fresh pending request (toast 報名申請已提交).
8. Offline: with the network unavailable, any enrollment action shows an inline error and produces zero local or server state change (request still pending / enrollment still active after retry online).

Focused proof: `web/lib/programs/participant-program-detail.test.tsx` + `participant-enrollment.test.tsx` (one test per state transition incl. both dialog paths and offline) + e2e additions; final proof also requires the repository's local verification gate and `git diff --check` before the ticket branch is submitted.