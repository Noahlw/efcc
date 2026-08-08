# Session Fallback Timeline — 2026-08-08

Session date: 2026-08-08.
Session goal: **phase 1** E2E completeness → **phase 2** UI/UX → **phase 3** code quality.

> Rule: every row below is a restore point. Any milestone row can be restored
> with the recipes in [Restore recipes](#restore-recipes). Keep this file updated;
> append one milestone row per commit (timestamp, workstream, branch, SHA,
> contents, known-good state).

## Baseline (session start)

| Branch | Commit SHA | Notes |
|--------|-----------|-------|
| `rebase/prg-05-201` | `502afba` (HEAD) | Live-ui workstream checkout; pushed baseline `origin/prg-05-201` @ `e57a569`. |
| `att-qr-213-215` | `df4a8e4` | Attendance QR / guest check-in workstream baseline. |

### Environment (acceptance fixtures)

| Target | Worker / D1 binding | Notes |
|--------|--------------------|-------|
| `efcc-dev-testing` | Worker + D1 `efcc-dev-testing` (`edb464d2-d142-4c51-aa50-c5b800112756`) | programs-d1 / attendance-d1 suites. |
| `efcc-auth-test` | D1 `efcc-identity` (`ae437eac-c6ef-4835-bfe8-13c61b5cf586`) | live-ui suite; fixtures `U-E2E-ADMIN` / `U-E2E-STAFF` / `U-E2E-MEMBER`, credentials `E2E_<role>!dev`. |
| `efcc-auth-ui04` | D1 `efcc-identity-ui04` (`3c1eaf4b-cba6-4f14-a9dc-860765cf598c`) | Prior UI-04 gate host. |
FINAL standing state (2026-08-08T08:49Z): the published stack is linked and clean: #207 `prg-01-197` → #208 `prg-02-198` → #209 `prg-03-199` → #210 `prg-04-200` → #211 `prg-05-201` (`6417c23`) → #218 `att-qr-213-215` (`f5862fa`). The local integration proof branch `integration/stack-live-test-2` (`57975f6`) deployed to `efcc-dev-testing` as `8a02f9ad`; the worker was cleaned after spot checks and retains only the three `E2E_` fixture accounts (audit history is immutable). GitHub PRs #211 and #218 report CLEAN. Local configs and suites are valid, but the committed GitHub workflows do not invoke programs-d1, attendance-d1, or live-ui for stacked PR bases; no CI check is claimed.

## Milestones

| Timestamp (UTC) | Workstream | Branch | Commit (short) | Contains | Known-good state |
|-----------------|------------|--------|----------------|----------|------------------|
| 2026-08-08 | live-ui E2E + glossary | `rebase/prg-05-201` | `aadef18` | Two live-ui mutation tests (registration submit/reject, admin password rotation round-trip), seed reset handles `registration_requests`, CONTEXT.md glossary rows (Guest Check-in, Check-in Sheet, dev-testing worker), session-fallback doc | `pnpm exec playwright test --config=tests/e2e/live-ui.config.ts` against `efcc-auth-test`: 26/26 PASS; trace appended to `docs/omp-plans/2026-08-07-ui-04-release-stack.md` |
| 2026-08-07T19:02Z | events-panel UI slice (WS-A) | `rebase/prg-05-201` | `e00c99f` | Red acceptance trace E2E-18..22 (MONTHLY rule, member picker, per-event 改期/取消該次/恢復該次, cancel-with-reason) — red run recorded: 75/29, new tests failed on 4 engines as intended | red baseline proving the missing controls |
| 2026-08-07T19:05Z | events-panel UI slice (WS-A) | `rebase/prg-05-201` | `58e9ed1` | Per-event exception controls implemented (capability-gated), cancel reason display, copy.ts strings, panel unit tests U8-U11 | 104/104 across 4 engines (per-engine reset+seed discipline), unit 253/253 + 162/162, worker deployed Version 21609297-4a3f-4e62-879d-2efd7e82021e |
| 2026-08-07T19:32Z | attendance E2E (WS-B) | `att-qr-213-215` | `bd065e5` | attendance-d1 suite (9 tests A-I) + seed port (DevFixtureAccount fix) + product fixes: mint check_in_token/manual codes at program/event create (migration 0004 backfills only pre-existing rows), bare-entry check-in 403 fix (deriveCheckInMethod), cancelled-event resolve 410 fix; #216 acceptance-trace plan doc with executed results | 18/18 PASS (2 viewports) on efcc-dev-testing (worker version 268e8930), unit 270/270 web + 158/158 components, migration 0004 applied |
| 2026-08-08T00:15Z | attendance design pass (WS-E) | `att-qr-213-215` | `7421c8e` | Impeccable pass: guest page civic header (seal + church title), button vocabulary primary/secondary/danger, tone-gated status box, 3px focus rings, flat roster rows, noEvents/memberSearchEmpty copy | attendance-d1 18/18 PASS (worker 45d7fbc2), unit 270/270 + 158/158 |
| 2026-08-08T00:52Z | programs/auth design pass (WS-F) | `rebase/prg-05-201` | `8ae0c52` + `f93d705` + `0027af1` | Design pass: exception control semantics (改期 secondary / 取消聚會 danger / 恢復該次 success), focus handoff after inline confirm, single 聚會 heading, visible rule-form labels, token-unified notices (login/queue), iOS input size, disabled styling, .cancelForm width fix; also repaired pre-existing DevAccount type breakage (root typecheck was red) | programs-d1 104/104 per-engine reset (worker a88ce149), live-ui 26/26, unit 253/253 + 162/162, root typecheck PASS |
| 2026-08-08T01:05Z | attendance quality pass (WS-G) | `att-qr-213-215` | `7f6eb4b` | Phase-3 quality: shared use-qr-camera hook (dedupes camera lifecycle, fixes stale eventId closure), requireActor() prologue extraction, dead-code/type cleanups, +2 regression tests (guest-correction 409 conflict, void requires reason) | attendance-d1 18/18 PASS (worker f7e6aa54), unit 272/272 + 158/158 |
| 2026-08-08T01:52Z | programs quality pass (WS-H) | `rebase/prg-05-201` | `b7b1087` | Phase-3 quality: dead persistence members removed, RecurrenceKind/actions single-sourced, handleDecide/Withdraw mint fresh requestId (no longer echo caller Idempotency-Key as X-Request-Id), invalid department update now 422, RESCHEDULE end<=start 422, rule-patch range validation; +4 regression tests | programs-d1 104/104 per-engine (worker 5301dfad), live-ui 26/26, unit 257/257 + 162/162, root typecheck PASS |
| 2026-08-08T05:44Z | programs root-cause fix (WS-I) | `rebase/prg-05-201` | `6417c23` | Impeccable findings fixed: exception badge/copy, per-rule exception uniqueness, keyboard MemberPicker, skip link, HK timestamp formatting, nested-main removal, QR lazy-load, breakpoint documentation | root 278/278, web 290/290, components 178/178, both typechecks, build PASS; programs-d1 26/26 phone + 26/26 desktop evidence on the integration build |
| 2026-08-08T06:15Z | attendance root-cause/design/quality fixes (WS-J) | `att-qr-213-215` | `e0c8b0c` + `66095da` + `fd4c99a` | Guest/member duplicate contract unified to `200 {outcome: duplicate}`, server detail surfaced, name bounds/overflow fixed, cancelled-event operator handling, announcements, member route guard, Cantonese status/method maps, HK time helper, public main landmark restored, deterministic E/J setup | attendance-d1 24/24 (12 tests × phone/desktop) on the integration deployment; unit 276/276 + components 167/167 on the attendance branch |
| 2026-08-08T07:02Z | integration artifact repair | `integration/stack-live-test-2` | `57975f6` | Rebuilt fixed branches; repaired rerere-carried missing `removeException` brace and stale `hkWallLabel` reference; code tree matches the rebased attendance branch | root 278/278, web 290/290, components 178/178, typechecks, build PASS; worker deployed as `8a02f9ad` |
| 2026-08-08T08:15Z | published stack | `rebase/prg-05-201` / `att-qr-213-215` | `6417c23` / `f5862fa` | Fast-forwarded #211 base and force-with-lease pushed rebased #218 head | GitHub #211 and #218 both CLEAN; stacked branch pushes produced no workflow checks because current workflows filter only `main`/`master` and run auth only |
| 2026-08-08T08:49Z | live spot checks + cleanup | `integration/stack-live-test-2` | `8a02f9ad` | Chrome-only B guest duplicate and J cancelled-event operator panel scenarios, phone + desktop; temporary E2E rows removed afterward | 4/4 spot checks PASS; final dev-testing counts: departments 0, programs 0, events 0, attendances 0, E2E fixture accounts 3; audit rows retained by immutable trigger |

Run discipline: a single 4-project invocation accumulates D1 state and times out later engines — reset+seed before EACH engine run is now the required procedure for programs-d1 (recorded in the ticket-201 trace).

## Restore recipes

To restore any milestone row:

1. Confirm the target branch is checked out in the right worktree (`git branch --show-current`).
2. **Destructive operation — requires user confirmation:** `git -C <worktree> reset --hard <sha>` (discards everything after `<sha>` on that branch; never run on a pushed branch without explicit approval).
   - Live-ui worktree: `/var/folders/pw/6vk89mjx4klgcgc8yp48y_lm0000gp/T/opencode/efcc-prg05` on `rebase/prg-05-201`.
3. If the environment itself needs to return to a baseline (worker redeploy + reseed D1):
   - Redeploy — never deploy the checked-in `web/wrangler.jsonc` directly (placeholder worker `efcc-prototype-129` + placeholder D1 id):
     - `pnpm --dir web build`
     - `cp /tmp/wrangler-dev.json web/wrangler-dev.json` (renames the worker to `efcc-dev-testing` with the real D1 id `edb464d2-d142-4c51-aa50-c5b800112756`; migrations auto-apply)
     - `pnpm --dir web exec wrangler deploy --config wrangler-dev.json`
     - `rm web/wrangler-dev.json`
   - Reseed the dev-testing D1 — use the direct binary (pnpm prints "Already up to date" to stdout, corrupting a redirected SQL file) and ALWAYS use a fresh filename (wrangler caches by filename):
     - reset first: `RESET_SQL=/tmp/reset-$(date +%s).sql && ./node_modules/.bin/tsx tests/e2e/seed-dev-accounts.ts --reset > "$RESET_SQL" && pnpm --dir web exec wrangler d1 execute efcc-dev-testing --remote --file="$RESET_SQL"`
     - then seed: `SEED_SQL=/tmp/seed-$(date +%s%N).sql && ./node_modules/.bin/tsx tests/e2e/seed-dev-accounts.ts > "$SEED_SQL" && pnpm --dir web exec wrangler d1 execute efcc-dev-testing --remote --file="$SEED_SQL"`
   - Reseed the acceptance D1 (live-ui fixtures): apply the same reset + seed to `efcc-identity` with the same fresh-filename rule. `INSERT OR IGNORE` skips existing rows, so to rotate credentials/QR values delete the three fixture rows first: `DELETE FROM accounts WHERE user_id IN ('U-E2E-ADMIN','U-E2E-STAFF','U-E2E-MEMBER');` (each reseed step also clears `E2E_%` registration_requests in `--reset` mode)
4. Re-run the suite for the restored milestone and confirm the recorded known-good state before continuing.