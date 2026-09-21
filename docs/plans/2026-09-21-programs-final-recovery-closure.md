# Programs Final Recovery Closure Plan

**Status:** Ready for `deliver-work`
**Execution boundary:** Local engineering closure only. No push, PR, merge,
deployment, pilot, production D1 access, Owner L2 claim, or physical-device
claim is authorized by this plan.

## Outcome and authority

Finish the Programs recovery repair on `codex/programs-production/ds1-repair`
as one coherent local task. The final application SHA must preserve the working
F01-F04 repairs, close the remaining mutation-outcome, authenticated-recovery,
and dirty-navigation gaps, pass the required machine seams, and receive
independent final-SHA review. Human/device/promotion gates remain a truthful
handoff after engineering closure.

Authority, in precedence order:

- [#586](https://github.com/Noahlw/efcc/issues/586) R42, R43, R45, R50-R52.
- [#628](https://github.com/Noahlw/efcc/issues/628) RP1-RP6 and accepted
  R634-01-R634-05 corrections; package references #629-#633.
- [`CONTEXT.md`](../../CONTEXT.md),
  [ADR-0047](../adr/0047-generate-attempt-unresolved-until-authoritative.md),
  and [ADR-0048](../adr/0048-programs-local-recovery-boundary.md).
- [`TESTING.md`](../../TESTING.md) and the repository UI-control recovery
  governance.

Accepted decisions to implement without reopening:

1. Engineering closure ends at final-SHA machine qualification plus independent
   review; human/device/pilot/merge/release gates stay separate.
2. Every privileged non-GET Programs mutation treats an unexpected
   `500 INTERNAL_ERROR` without a no-commit guarantee as an unknown write.
   GET/Preview 500 remains a settled read failure; known 4xx remains settled;
   no unknown write is blindly replayed.
3. Authenticated Programs recovery clears as one boundary on sign-out, expiry,
   failed logout cleanup, and child `AUTH_REQUIRED`. It includes Management and
   Event drafts, Generate recovery, and shared workspace mutation recovery.
   Guest-only recovery remains separate; no actor key is added.
4. Every dirty Settings or Preview draft, including hidden/orphan drafts, blocks
   all leave paths. `Continue Editing` preserves all drafts, opens the Schedule
   recovery surface, and focuses the first dirty owner. `Discard and Leave`
   clears all dirty drafts owned by the current Program workspace, then leaves.

Preserve the existing Reviewed Schedule Plan/Generate fixes, occurrence-scoped
draft keys, notification fire-and-forget navigation, presentation ratchet,
RFC 9457 500 envelope plus `X-Request-Id`, D1 idempotency/unique constraints,
zero Playwright retries, and current shadcn/Radix/CVA ownership. Do not create a
Generation Run, generic mutation framework, generic dirty-state framework, or
new state library.

## Current basis

- Effective worktree: `/home/ubuntu/gh-repo/efcc-pack-post`.
- Branch/HEAD: `codex/programs-production/ds1-repair` at `b8fb0ba4`; base and
  merge-base `codex/programs-production/ds1` at `6383bcee`. Remote `ds1-repair`
  does not exist as of 2026-09-21.
- Final local application candidate: `b8fb0ba4`; earlier `cdfd9897` evidence
  remains historical and is not relabeled.
- Dirty work owned by this planning session: `CONTEXT.md`, ADR-0047, ADR-0048,
  and this plan. Untracked `.orca/` is unrelated and must remain untouched and
  uncommitted.
- Reuse the component-proven Generate persist-before-dispatch, Plan B dispatch,
  generation cleanup, parent Back handshake, notification navigation, and
  presentation-ratchet work already on the branch.
- Material gaps confirmed against current source:
  - `isUnknownMutationWriteOutcome()` is used by Generate/schedule paths, while
    other Programs writes still use the transport-only classifier.
  - shell cleanup clears Generate recovery, but shared workspace mutation
    recovery and child `AUTH_REQUIRED` do not share the boundary.
  - inline dirty state is visibility/focus-derived; browser Back and
    hidden/orphan/multiple-draft behavior are not closed.
  - real-route RP1.2/RP1.4/RP1.6/RP2.1 are unverified because workerd emitted
    `Broken pipe`/connection resets before product assertions. The recorded
    artifacts lack the first failed request, request ID, Account, and D1 state.

Revalidate the branch, base, remote refs, dirty ownership, Node 22.18.0, pnpm
11.7.0, and frozen lockfiles before editing. Stop rather than reset, overwrite,
or absorb unrelated changes if any topology fact moved.

## Changes

1. **Make the mutation outcome contract complete.**
   - Inventory every production caller of `isUnknownMutationOutcome()` and every
     privileged Programs write in `web/lib/programs` and attendance surfaces.
   - Route writes through the existing mutation-only classifier; keep reads on
     the transport/read classifier. Each caller retains its existing operation
     identity, recovery UI, and authoritative readback. If a caller has no safe
     reconciliation path, add only the smallest mutation-specific retained
     identity/readback required by #628; never auto-retry.
   - Primary entrypoints include `program-api.ts`, `workspace-events-task.tsx`,
     Program/Department Settings, enrollment, Event detail/create/update/cancel,
     and self/assisted/guest Attendance callers.
   - Add focused proof that an exception before a durable write and an exception
     after a durable write both produce honest, distinguishable recovery. Keep
     Worker GET/Preview 500 coverage proving it does not enter unknown-write UI.

2. **Use one authenticated local-recovery cleanup boundary.**
   - Reuse the existing clear helpers and expose one narrow cleanup function for
     authenticated Programs state; do not add per-feature logout callbacks or
     actor-key storage.
   - Invoke it from actual sign-out, expiry, failed logout cleanup, cold auth
     restore failure, forbidden/session loss, and child `AUTH_REQUIRED` before
     redirect/deep-link handoff.
   - Clear Management Drafts, Event drafts, Generate recovery, and
     `efcc_workspace_mutation_recovery`; leave guest-only recovery untouched.
   - Prove Account A cannot leave recoverable metadata for Account B in the same
     tab, including the direct child-auth-expiry path.

3. **Complete dirty-owner navigation without a framework.**
   - Derive workspace dirty ownership from the existing Settings and Preview
     draft stores, including drafts whose occurrence is no longer visible.
     Preserve stable occurrence keys and existing orphan Recover/Discard UI.
   - Feed the union into the existing Program workspace guards for in-app Back,
     task/tab switch, external navigation, and browser Back.
   - `Continue Editing` opens Schedule recovery and focuses the first dirty
     owner while preserving all drafts and the attempted destination.
     `Discard and Leave` clears all dirty Settings/Preview drafts for that
     Program before completing the original destination.
   - Extend the existing production-composition tests; do not introduce a
     generic registry unless current stores cannot supply the accepted union.

4. **Create and verify the new application candidate.**
   - Run focused component tests for Events/Schedule, Program workspace,
     Settings, auth shell, and each changed mutation family; run Worker contract
     tests and typechecks. Repair in-scope failures rather than weakening
     acceptance, retries, baselines, or governance.
   - Review the diff against `6383bcee`, ensure `.orca/` and unrelated changes
     are excluded, and create one focused local application commit under
     `deliver-work`. Record its SHA before qualification.

5. **Diagnose the grouped-run failure before changing isolation.**
   - From a clean detached disposable worktree of the new application SHA,
     reproduce the first zero-retry browser failure and capture execution order,
     preceding scenario, role/Account, method, URL, request ID, response, Worker
     log, relevant D1 rows, and fixture cleanup result.
   - Classify H1 D1 contamination, H2 auth/session contamination, H3 module
     cache, H4 Worker/runtime lifetime, or H5 Playwright context reuse from the
     first causal evidence. Do not add retries or recycle Workers as a remedy.
   - Apply the smallest root-cause fix only after classification, rerun its
     focused reproduction, and create a new application SHA if code changes.

6. **Qualify the exact final application SHA.**
   - Run zero-retry authenticated browser and responsive gates through RP1.2
     in-flight reload, RP1.4 Plan B Generate dispatch, RP1.6 Account A logout to
     Account B, and RP2.1 dirty/reload/saved-exception failure.
   - Exercise migrations 0027-0037 from disposable base-schema data, the
     approximately 30-person mixed approval/roster journeys, signed-out
     guest-login revalidation, and QR artifact/readback journeys using existing
     runners/fixtures. Never touch production D1.
   - Run the finite aggregate. Run the five-minute canary separately and report
     B-003 honestly; a failed or unrun canary is not folded into a green claim.

7. **Review, repair, and record truthful completion.**
   - Obtain independent fresh-context Standards and Spec/Acceptance review of
     the final application SHA because recovery, data meaning, authentication,
     navigation, and real Worker/D1 seams are high risk. Reproduce and repair
     material findings, then rerun affected checks.
   - Update `.delivery/programs-633/evidence.json` with the final application
     SHA and per-criterion results. Preserve older package evidence as historical
     rather than relabeling it. An optional evidence-only commit must name, not
     replace, the application SHA.
   - Hand off Owner L2, iPhone Safari/Android Chrome, virtual keyboard/safe area,
     native print, pilot, push/PR, merge, deployment, and release as separate
     unclaimed gates.

## Acceptance

| Requirement | Starting state and action | Observable result | Primary evidence |
| --- | --- | --- | --- |
| Mutation 500 | Authorized user performs each representative privileged Programs write; inject `INTERNAL_ERROR` before and after durable write | Unknown-write state retains operation identity and reconciles by authoritative readback; no blind replay. GET/Preview 500 and known 4xx stay settled | Focused component tests plus Worker/D1 fault-injection and readback |
| Generate preservation | Current Plan; dispatch Generate; interrupt/reload; reconcile. Separately settle `requires_review`, Preview matching Plan B, Generate again | Pending attempt survives, no duplicate Events, and Plan B ID is dispatched while old history remains | Existing component proofs plus authenticated real-route RP1.2/RP1.4 |
| Auth boundary | Account A leaves each authenticated recovery kind, then sign-out/expiry/failed RPC/child `AUTH_REQUIRED`, then Account B signs in in the same tab | No authenticated recovery metadata/UI crosses the boundary; guest recovery is unchanged | Cleanup unit/component tests plus authenticated real route RP1.6 |
| Dirty union | Settings plus multiple Preview drafts, including closed Sheet and orphaned occurrence; attempt every leave path | One Continue/Discard decision; Continue reveals/focuses first owner and preserves all; Discard clears all Program drafts and reaches original destination | Production-composition component tests plus browser Back and real-route RP2.1 |
| Harness cause | Run grouped browser scenarios with zero retries until first causal failure | Failure record contains request/Worker/D1/session/order correlation and one evidence-backed H1-H5 classification | Preserved runner artifacts and focused reproduction |
| Final candidate | Clean detached final SHA; run required finite, browser, responsive, migration, bulk, guest/QR, and review seams | Required machine criteria verified at the exact SHA; canary and remaining human gates reported separately | Revision-pinned `.delivery/programs-633/evidence.json` and raw artifacts |

Canonical commands, revalidated at planning time:

```sh
pnpm typecheck
pnpm --dir web typecheck
pnpm test:programs:contract
pnpm test:workerd
pnpm test:programs:browser
pnpm test:programs:responsive
pnpm verify:programs
pnpm test:programs:canary
git diff --check
```

Focused Vitest invocations should use the existing component/Worker configs and
only the changed families before the aggregate. `pnpm db:migrate:local` may run
only against an explicitly disposable local D1 seeded from the required base
schema.

## Review and completion

`acceptanceProfile: complex`; `reviewRisk.level: high` because the work crosses
unknown durable writes, Account/session isolation, loss-prevention navigation,
and real Worker/D1 behavior. Independent final-SHA review is required.

The plan is complete when the final application SHA has passed every available
machine criterion above, remaining unavailable human/device gates are named
without inflation, the evidence record points to the exact SHA, and the focused
local commit(s) exclude `.orca/`. Passing component tests alone, the historical
`cdfd9897` evidence, Fast CI, or an evidence-only HEAD is not completion.

## Execution handoff (2026-09-21)

Application repair is implemented through `b8fb0ba4`. The focused component
aggregate passed 346 tests, the auth/attendance set passed 146 tests, the
Program workspace rerun passed 82 tests, the Worker contract passed, and web
typecheck, oxfmt, and `git diff --check` passed. The final evidence record keeps
browser, responsive, full Workerd, canary, migration, bulk, guest/QR, and
human/device gates truthful where they were not completed or where the local
harness remained unavailable; none is claimed green here.

## Manual execution brief

> Implement this plan at
> `docs/plans/2026-09-21-programs-final-recovery-closure.md` in
> `/home/ubuntu/gh-repo/efcc-pack-post`. Preserve the accepted Reviewed Schedule
> Plan, draft-key, notification, presentation, zero-retry, and no-auto-replay
> behavior. Complete the shared mutation-500 contract, authenticated recovery
> cleanup, dirty navigation, harness-first diagnosis, final qualification, and
> independent review as one local task. Exclude `.orca/`, production D1,
> push/PR/merge/deploy, and human/device claims. Revalidate branch
> `codex/programs-production/ds1-repair`, base `6383bcee`, dirty ownership,
> runtime pins, and remote refs before editing. Follow the small-task path of
> `deliver-work`: implement, verify, review, repair, and create a focused local
> application commit; qualify its exact SHA in a clean detached disposable
> worktree and record truthful evidence. Escalate only a new product decision or
> unavailable external prerequisite; do not reopen Q1-Q5.
