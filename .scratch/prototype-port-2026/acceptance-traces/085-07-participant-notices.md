# 085-07 Participant Notices acceptance trace

Authority: issue #324, `docs/specs/085-participant-experience.md` (Notices user stories), and the participant prototype Notices screen.

Run against local `wrangler dev`/local D1 with `pnpm db:seed:local && pnpm db:seed:demo`. Assert each step through visible DOM or response state.

1. Sign in as `E2E_member` and open `/notices` from the dock slot.
   - Observe the notices list with HK timestamps; unread items show an unread indicator.
2. Tap **全部標示已讀** when unread items exist.
   - Observe success feedback; reload → unread count is zero; items remain listed.
3. Open an event notice (e.g. 聚會提醒).
   - Observe navigation to `/programs?program=…&event=…` (Event Detail).
4. Tap **返回** on Event Detail.
   - Observe return to `/notices` with the list visible (Notices origin back-nav).

Focused proof: `web/lib/notices-panel.test.tsx`, `web/lib/programs/notices-worker.test.ts`, `tests/e2e/programs-d1.test.ts` NTC-01 block.
