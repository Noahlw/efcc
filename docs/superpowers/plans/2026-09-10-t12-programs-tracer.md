# T12 Programs tracer implementation plan

> **Execution note:** This plan is the working plan for T12 / #517. The
> acceptance trace is committed separately as the Ticket 00 contract before
> any browser-test or runner behavior changes.

## Goal

Deliver a thin, complete dual-authority Programs tracer from the current
`main` ancestry. The tracer must prove the real member and manager journeys at
the browser/Worker/D1 seam, qualify the three existing Programs Storybook
baselines across the established W7 widths, and produce an evidence-backed
SALVAGE STACK versus SELECTIVE REPLAY recommendation for human L2 review.

## Fixed baseline and boundaries

- Repository: `Noahlw/efcc`.
- Branch/worktree: `codex/t12-issue-517` /
  `/Users/noah.wong/Desktop/code/efcc-t12-issue-517`.
- Continuing rescue base: `eee8ba1872fbb53ffd835063b78e824b8d187e68`, the
  verified `origin/main` and local `main` tip at session start.
- The frozen Phase-F/S4 source is already in current-main ancestry. No old
  Phase-F/S4 branch may be merged, cherry-picked, rebased, or restored.
- B-003 remains a separately reported residual runtime risk.
- Existing Programs Screen Catalog identities and T07 PSNs stay unchanged.
- No production rewrite, generic router/state framework, future T13–T16
  lifecycle rescue, T11 cleanup, or historical 201-test mega-suite revival.
- No fake Storybook permission authority: synthetic Storybook identity is only
  presentation fixture data; real permission proof is the disposable local
  Worker/D1 browser journey.
- The pre-existing generated dirty diff in
  `web/.storybook/public/mockServiceWorker.js` is preserved and excluded from
  T12 commits unless a later focused check proves it is part of this work.

The named handoff files `START-HERE.md`, `SPEC.md`, `RECON-EVIDENCE.md`,
`TICKET-GRAPH.md`, and `IMPLEMENT-WORKFLOW.md` were searched for in the
repository, refs, attachments, and temporary handoff locations and were not
available. Their intended scope is reconstructed from live issue #517 and the
current repository authorities; this absence is recorded in Ticket 00 rather
than silently invented.

## Ticket sequence

### Ticket 00 — record the acceptance contract

Create `docs/qa/2026-09-10-t12-programs-tracer-acceptance-trace.md` before
changing browser assertions, runner configuration, or product behavior. The
trace names every observable participant, management, Worker Contract,
responsive, Storybook, preservation, review, and owner-approval boundary. It
records the exact baseline SHA and the missing-handoff fallback. Commit only
the plan and this trace as the first T12 commit.

### Ticket 01 — prove the participant tracer

Strengthen `tests/e2e/programs-participant-acceptance.test.ts` at the existing
real local `createTestHarness` seam. The member journey must start from the
ordinary `/programs` route, assert the server projection does not expose the
management gateway, search the disposable Program, prove a guaranteed
no-result and clear-search recovery, select `可報名`, open the disposable row,
  observe canonical `/programs?program=...&from=programs` and
  `#program-detail-title`, activate the detail back control to return to
  ordinary `/programs`, then reopen the same row before retaining the existing
  enrollment request, admin approval, read-back, and
cancellation assertions.

Add the T12 Storybook W7 runner in the established worktree-aware pattern:

- `tests/e2e/t12-programs-storybook.config.ts`
- `tests/e2e/t12-programs-storybook.test.ts`
- root `package.json` script `test:t12:programs-storybook`

The runner opens only these existing production Stories:
`ParticipantDirectory`, `ParticipantProgramDetail`, and `ManagementDirectory`
from `web/.storybook/programs.stories.tsx`. It runs exactly
`320 / 375 / 390 / 414 / 799 / 800 / 1440` CSS-pixel projects with Chromium,
one worker, zero retries, and direct Storybook iframe URLs. It must assert the
existing production shell plus each story's existing locator contract and
capture direct locator evidence at the review widths.

### Ticket 02 — prove the management tracer

Strengthen `tests/e2e/programs-management-acceptance.test.ts` at the same real
local Worker/D1 seam. The admin journey must start from ordinary `/programs`,
assert the real server projection exposes `進入管理模式`, click that control,
reach canonical `?mode=management`, observe `管理課程目錄`, search the unique
disposable Program, open it, and retain the Settings mutation/read-back proof.

The fixture remains disposable and is archived in `finally`. No Storybook prop
is used as authorization evidence, and no management lifecycle scope is added.

### Ticket 03 — qualify, decide, and stop at L2 review

Run the combined qualification exactly as required by #517:

```text
pnpm test:t12:programs-storybook
pnpm test:programs:browser
pnpm test:programs:contract
pnpm test:programs:responsive
pnpm --dir web storybook:build
pnpm --dir web storybook:verify-index
pnpm verify:fast
pnpm verify:precommit
pnpm verify:programs
node scripts/t09-frontier-census.mjs --json
```

Inspect the rendered three tracer baselines, especially `390`, `799`, and
`800`. If and only if T12 changes production presentation/composition code,
run representative Firefox and WebKit checks at `390` and `800`; otherwise
the Chromium W7 run is the truthful cross-browser boundary.

Compare both rescue paths using preservation, ownership/locality,
composability with T08–T11, regression confidence, code lineage,
rollback/reviewability, and evidence/failure attribution. Default to SALVAGE
STACK when both remain viable. Selective replay requires fresh evidence of
non-local ownership, shotgun change, interface widening, poor rollback, or
poor failure attribution that cannot be repaired locally. Neither path may
weaken URL semantics, authorization, mutation semantics, Worker/domain
behavior, or preservation tests.

Run current Standards and Spec review against the actual live-main merge base,
resolve every real in-scope finding, and commit the final evidence. The result
must stop at exactly one of:

```text
T12 MACHINE_GREEN — PATH_PROPOSED: SALVAGE STACK — READY_FOR_OWNER_L2
T12 MACHINE_GREEN — PATH_PROPOSED: SELECTIVE REPLAY — READY_FOR_OWNER_L2
```

This plan does not self-approve, merge, claim `PATH_APPROVED`, claim
`STACK_GREEN`, authorize T13, or claim merge readiness.

## Verification and evidence rules

- Use Node `22.18.0` through the existing `fnm` flow; Node 20 is not valid for
  the `node:sqlite` Worker seam.
- Run focused checks after each ticket, then the exact combined qualification.
- Treat already-green new assertions as valid characterization evidence; never
  manufacture a failing test by changing production behavior.
- Record real browser route/URL, Worker projection, mutation status, responsive
  matrix, direct Storybook locator, and artifact paths in the acceptance trace.
- Keep census records such as CEN-026 and CEN-059–CEN-068 visible as deferred
  dispositions; do not absorb T13–T16 debt into T12.
- Re-read live branch, PR, remote SHA, dirty diff, and issue state before any
  GitHub write. No PR merge is performed by this plan.
