# R8 — Fixed-Point Qualification

> Load this packet only when the [master tracker](../2026-09-11-programs-route-fidelity-recovery-tracker.md) marks R8 ACTIVE and R7 plus every inserted recovery packet are COMPLETE. Read the master Global Constraints, Claim and Update Protocol, Cold Resume Contract, and Fixed Completion Invariant first. Mutable task status lives only in the master ledger.

**Outcome:** One immutable production candidate receives full Storybook, component, real Worker/D1, responsive, W7, visual, and two-axis review evidence. The QA status advances to `WAITING_OWNER_L2` only if every machine condition is green.

## Files

- Modify: `docs/qa/2026-09-11-programs-route-fidelity-correction.md`
- Create generated evidence: `docs/qa/artifacts/programs-route-fidelity/${candidate_sha_short}/manifest.json`, where `candidate_sha_short` is derived with `git rev-parse --short=12`
- Create generated evidence: four actual/frozen contact sheets in the same artifact directory
- Update: master tracker and this packet

## Gate Set

### Story and presentation

~~~sh
fnm exec --using 22.18.0 pnpm --dir web test:t07:foundation
fnm exec --using 22.18.0 pnpm --dir web test:storybook
fnm exec --using 22.18.0 pnpm --dir web storybook:build
fnm exec --using 22.18.0 pnpm --dir web storybook:verify-index
fnm exec --using 22.18.0 pnpm test:t08:controls
fnm exec --using 22.18.0 pnpm test:t09:foundations
fnm exec --using 22.18.0 pnpm test:t11:storybook
~~~

### Component, contract, and type

~~~sh
fnm exec --using 22.18.0 pnpm --dir web test:components
fnm exec --using 22.18.0 pnpm test:programs:contract
fnm exec --using 22.18.0 pnpm verify:fast
~~~

### Real route and promotion

~~~sh
fnm exec --using 22.18.0 pnpm test:programs:browser
fnm exec --using 22.18.0 pnpm test:programs:responsive
fnm exec --using 22.18.0 pnpm verify:programs
~~~

### Shared blast radius and repository gate

~~~sh
fnm exec --using 22.18.0 pnpm test:shell-responsive
fnm exec --using 22.18.0 pnpm test:shell-geometry
fnm exec --using 22.18.0 pnpm test:role-hierarchy-geometry
fnm exec --using 22.18.0 pnpm verify:precommit
~~~

## Base Reproduction Recipe

Create one clean detached checkout and install its own locked dependencies:

~~~sh
base_worktree=$(mktemp -d /tmp/efcc-programs-base.XXXXXX)
git worktree add --detach "$base_worktree" 9ad90d253bfd50bf2bbcea85f39c18c1587b1f88
fnm exec --using 22.18.0 pnpm --dir "$base_worktree" bootstrap
~~~

For each failing candidate command, run its exact base equivalent: `pnpm --dir "$base_worktree" test:t09:foundations`, `test:shell-responsive`, `test:shell-geometry`, `test:role-hierarchy-geometry`, or `verify:precommit`, always through `fnm exec --using 22.18.0`. Record output and `git -C "$base_worktree" status --short --branch`. Remove the disposable worktree with `git worktree remove "$base_worktree"` only after it is clean and every required log has been copied into the QA evidence.

## Steps

- [ ] **Step 1: Claim R8 and freeze the candidate.** Run the master preflight; derive `candidate_sha=$(git rev-parse HEAD)` and `candidate_sha_short=$(git rev-parse --short=12 HEAD)`; verify only R8 tracker/QA/artifact files are dirty; and re-read live PR #607/base/remote/check state. Complete when the checkpoint records immutable candidate SHA and live provenance with no overlap/drift.

- [ ] **Step 2: Generate durable visual evidence.** Run `candidate_sha=$(git rev-parse HEAD); candidate_sha_short=$(git rev-parse --short=12 HEAD); PROGRAMS_CANDIDATE_SHA="$candidate_sha" PROGRAMS_VISUAL_ARTIFACT_DIR="docs/qa/artifacts/programs-route-fidelity/$candidate_sha_short" fnm exec --using 22.18.0 pnpm test:programs:visual`. Complete when the 22-row manifest and four contact sheets exist in the exact SHA directory and the geometry test passes.

- [ ] **Step 3: Run the complete Gate Set.** Execute every command above, including commands also covered by aggregate scripts. Record command, exit code, counts, artifact path, and limitation in the QA file. Remove or relocate generated `web/storybook-static` after index verification so it is not candidate dirt. Complete when every command has a truthful PASS/FAIL record; an unrun command is FAIL for promotion purposes.

- [ ] **Step 4: Base-reproduce every non-Programs failure.** For each T09, shell, role-hierarchy, or precommit failure, create one disposable detached worktree at `9ad90d253bfd50bf2bbcea85f39c18c1587b1f88`, install with Node 22.18.0, and run the identical command/config. Record base and candidate outcomes. Complete when each failure is either candidate-caused and routed to Step 6, or proven at the original execution start and retained as an explicit limitation.

- [ ] **Step 5: Perform the 22-row visual comparison.** Inspect actual/reference contact sheets and individual captures. For each case/viewport, record hierarchy, density, copy, status mix, control placement, Back/mode/bell placement, dock/rail collision, wrapping, and domain-driven intentional differences. Complete when all 22 manifest rows have explicit PASS or an actionable finding; geometry alone cannot produce PASS.

- [ ] **Step 6: Route every actionable finding into a packet.** If any gate, visual row, or review finding requires code/test changes, create `R8A-residual-fidelity-defect.md`, insert it before R8 completion in the master ledger, mark R8 `BLOCKED`, and stop. The packet owns <=8 files, one red/green cycle, one gate, and one unique commit subject; after it completes, restart R8 from Step 1. If a later full rerun finds a distinct defect, use `R8B-residual-fidelity-defect.md`. Complete when there are no actionables or every actionable is disclosed and R8 is blocked.

- [ ] **Step 7: Run fixed-point two-axis review.** Review `9ad90d253bfd50bf2bbcea85f39c18c1587b1f88...$candidate_sha` for (A) original correction-plan/frozen-prototype acceptance and (B) repository standards, accessibility, regression risk, and unnecessary complexity. Account for every changed file, including deletes/renames, and search for suppressions. Resolve through Step 6, then repeat the entire review until one pass finds zero actionables. Complete when QA records every round and the final zero-actionable round.

- [ ] **Step 8: Write final QA truth.** Replace the stale Task-5-only narrative with execution-start SHA `9ad90d25`, exact candidate SHA, recovery commit subjects, gate table, base reproductions, material Play inventory, artifact links, 22-row visual verdict, review rounds, limitations, and status. Complete when `WAITING_OWNER_L2` appears only if every required machine gate and visual row is green; otherwise status remains `NOT_ROUTE_GREEN — CHANGES_REQUIRED` with exact blockers.

- [ ] **Step 9: Recheck catalog and governance.** Verify all ten baseline identities still carry `ISSUE-#601`, material/component Stories remain non-cataloged, no APV/owner approval is fabricated, and no push/PR/issue mutation occurred. Complete when governance tests and source inspection agree.

- [ ] **Step 10: Review and commit R8.** Run `git diff --check`, inspect every R8 file, stage QA, manifest/contact sheets, this packet, and master tracker, then commit with `test(programs): requalify route fidelity recovery`. Complete when exactly one matching subject exists after the R8 start SHA, the worktree is clean, R8 is `COMPLETE`, `Active Task` is `NONE`, and the ledger records the final gate verdict.

- [ ] **Step 11: Post-commit guard and stop.** Run `git status --short --branch`, `git log --oneline --decorate 9ad90d253bfd50bf2bbcea85f39c18c1587b1f88..HEAD`, `git diff --check 9ad90d253bfd50bf2bbcea85f39c18c1587b1f88...HEAD`, and live `gh pr view 607`. Complete when local history is append-only and the report stops at `WAITING_OWNER_L2` or the exact lower status; do not push or mutate GitHub.

## Completion Criterion

R8 is complete only when every Gate Set command and all 22 visual comparisons pass or are truthfully classified with exact base reproduction, fixed-point review finds zero actionables, catalog/governance remains truthful, the R8 qualification commit exists, and the machine status is no higher than `WAITING_OWNER_L2`.

## Checkpoint Log

- 2026-09-11 plan authoring: R8 procedure created; no implementation attempted; prerequisites are R1–R7 and every inserted packet COMPLETE; next unchecked item is Step 1.
