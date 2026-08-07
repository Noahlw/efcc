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

## Milestones

| Timestamp (UTC) | Workstream | Branch | Commit (short) | Contains | Known-good state |
|-----------------|------------|--------|----------------|----------|------------------|
| 2026-08-08 | live-ui E2E + glossary | `rebase/prg-05-201` | `aadef18` | Two live-ui mutation tests (registration submit/reject, admin password rotation round-trip), seed reset handles `registration_requests`, CONTEXT.md glossary rows (Guest Check-in, Check-in Sheet, dev-testing worker), session-fallback doc | `pnpm exec playwright test --config=tests/e2e/live-ui.config.ts` against `efcc-auth-test`: 26/26 PASS; trace appended to `docs/omp-plans/2026-08-07-ui-04-release-stack.md` |

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