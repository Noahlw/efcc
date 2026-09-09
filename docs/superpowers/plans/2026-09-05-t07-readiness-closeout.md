# EFCC T07 Readiness Closeout Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. <!-- Note: subagent-driven-development and executing-plans skills are not available -->

**Goal:** Correct and promote the already-approved Phase 1 planning authority, reconcile the live tracker and ticket entry gates, and finish with T07.1 / #566 eligible for a separately authorized implementation session.

**Architecture:** Reuse planning PR #572, its six authority-document changes, the existing T07 issue graph, and the single implementation tracker. Make narrow, evidence-backed documentation and issue-routing corrections; qualify the exact corrected revision; merge only with explicit owner authorization; then publish one planning-only frontier activation. This plan implements the planning closeout, not Storybook.

**Tech Stack:** Markdown, Git, GitHub CLI or equivalent connected GitHub actions; existing `pnpm bootstrap` and `pnpm verify:precommit`; Node `22.18.0` as the previously successful verification environment; repository-pinned `pnpm@11.7.0`; existing Vitest/TypeScript/governance checks. No new application framework, package, validator service, or CI job.

## Global Constraints

- Repository: `Noahlw/efcc`.
- Planning PR: `#572`; source: `docs/phase1-storybook-amendment`; target: `rescue/ui-control-recovery`.
- “This session is **NOT** a Storybook implementation session.”
- “Planning publication or issue creation alone is not `/implement` authorization.”
- “B-003 remains `OPEN` residual sustained-runtime risk.” Do not claim a runtime fix, harmlessness, or production readiness.
- “T07 uses one shared implementation PR with six child checkpoint commits.” This exception does not turn the planning PR into the T07 implementation PR.
- “T08–T12 return to one ticket / one branch / one PR.”
- “T13–T36 inherit the global architecture now, but their full ticket wording is revalidated only at phase entry.”
- Preserve Phase 0/T06 evidence, domain behavior, permissions, runtime dependencies, tests, coverage, tolerances, historical source-stack provenance, and all production/main promotion gates.
- Do not install Storybook, edit application/test/configuration source, change manifests/lockfiles, create a T07 implementation worktree, or run `/implement` for #566 in this session.
- Ordinary frozen-lockfile installation of the existing root/web dependencies is permitted solely to run the existing verification. It is not permission to add, upgrade, or configure Storybook.
- Owner approval of this plan is not automatically permission to merge #572. Record an explicit instruction authorizing that merge; otherwise finish the pre-merge work and return `READY_FOR_OWNER_MERGE`.
- `FRONTIER` means eligible next work, not started, approved design, `STACK_GREEN`, or merged implementation. Stop at this eligibility state.

## File Structure & Changes

All paths below are relative to the EFCC repository root. Locate edits by exact headings as well as line content; do not trust line numbers after formatting.

| File/resource | Action in this closeout | Responsibility |
|---|---|---|
| `docs/superpowers/plans/2026-09-05-t07-readiness-closeout.md` | Save this plan once on the planning branch | Execution instructions; not a replacement spec or a second tracker |
| `docs/implementation/ui-control-recovery-plan.md` | Modify active summaries, routing and later activation | Current phase, prerequisites, SHA roles, child graph, next action, links and reconciliation record |
| `docs/implementation/ui-control-recovery-governance.md` | Narrow corrections in §§3–4, 9–10 | Fix inverted Storybook prohibition and reconcile already-approved Phase 1 exceptions |
| `AGENTS.md` | Add short routing/precedence clarification, not a rewrite | Agents use current testing authority, the T07 child exception and scoped Phase 1 qualification rules |
| `TESTING.md` | Read/review; no additional edit expected | Preserve T05 and current presentation-testing separation |
| `docs/adr/0032-prototype-design-authority.md` | Read/review; no additional edit expected | Preserve historical prototype reconciliation and current supersession disposition |
| `docs/adr/0045-local-storybook-presentation-authority.md` | Read/review; no additional edit expected | Approved local Storybook architecture |
| GitHub #512 and #566 | Idempotent body/label reconciliation | Correct child link and unambiguous implementation entry conditions |
| GitHub #513–#517 and #567–#571 | Verify; repair only an objectively missing approved reference | Existing scope, approval rules and dependency graph |
| GitHub #518–#541 | Verify existing inheritance banners; do not republish blindly | New architecture inherited without speculative future rewrites |
| GitHub #505 and its amendments | Read; preserve existing amendments | Owner-approved requirements, including T05 and Phase 1 precedence |
| PR #572 body/comment | Update truthful current evidence and publication state | Exact reviewed head, checks, findings and merge authorization |

Maximum expected full-PR file set: its existing six Markdown files plus this one plan. This closeout normally edits only the tracker, governance, `AGENTS.md`, and the saved plan. Stop before extending the source/configuration footprint.

Keep disposable evidence outside tracked files under the Git common directory. Do not invent a new permanent testing framework for these documentation corrections.

**Protected, unchanged paths:** `CONTEXT.md`, `DESIGN.md`, `web/COMPONENT_INVENTORY.md`, ADR-0043/0044, `web/README.md`, both package manifests and lockfiles, `.github/workflows/`, `.storybook/`, all Story files, governance TypeScript, production code and test implementation.

## What Already Exists

The author read live PR #572 and its patch on 2026-09-05. The observed head was `0d5d840363ed8ade0bff1990c832cb2d52bbc4a7`, the base was `56f2195f72645440ea2e2f350f628479e48a330e`, and the PR was open and unmerged. Re-read these facts at execution time rather than resetting anything to this snapshot. [S1]

Already published: #505 Phase 1 amendment; rewritten #512–#517; T07.1–T07.6 as #566–#571. The previous live audit found all 24 downstream #518–#541 inheritance banners and the #538/#539/#541 notes. #572's body reports bootstrap, precommit and read-back success. That is recorded execution evidence, not a test rerun performed by this plan's author. [S1, S3, S4]

Existing scripts are sufficient: root `bootstrap` installs root and web with `--frozen-lockfile`; `verify:precommit` already composes typechecks, Vitest suites, Worker contracts/tests, components and governance. It includes canary **unit tests**, not the five-minute live canary. Do not replace this with `pnpm verify`, start another soak, or restore the historical 201-row acceptance gate. [S5]

Reusable assets: the existing #572 branch/worktree, the canonical tracker, GitHub issue bodies/comments, the current two-axis review practice, Git's diff/ancestry checks, and GitHub CLI's exact-head merge guard. No new distributed artifact is introduced.

## Not In Scope

Actual T07.1 implementation, library-version selection, `.storybook` setup, PSN/Screen Catalog implementation, Storybook interaction tests, Fast CI changes, runtime-adapter changes, human design approval, T12's salvage/replay decision, bulk rewriting future acceptance criteria, or a merge into `main`.

GitHub native sub-issue/dependency metadata is optional tooling, not a newly imposed start gate. Do not spend this closeout building those relationships unless separately requested. Labels do not override ticket/tracker gates.

## ASCII Diagrams

```text
Live GitHub + rescue refs + owner-approved amendments
                        |
              verify current state
                 /             \
      already repaired       gaps remain
            |                    |
        verify/no-op      docs + routing fixes
                 \             /
             exact-head verification + review
                        |
            explicit merge authorization?
                 /                 \
               no                  yes
               |                    |
     READY_FOR_OWNER_MERGE     merge #572 to rescue
             STOP                   |
                          verify actual merged commit
                                     |
                          publish tracker activation
                                     |
                      T07/#512 + T07.1/#566 FRONTIER
                          implementation not started
                                     |
                                    STOP
```

```text
Future T07 implementation graph — NOT executed here

#566 / T07.1
    +----> #567 / T07.2 ----+
    +----> #568 / T07.3 ----+
    +----> #569 / T07.4 ----+----> #571 / T07.6
    +----> #570 / T07.5 ----+

One implementation branch/PR; child checkpoints are not separate PRs.
```

## Failure Modes & Gaps

- **Stale handoff:** #572 may already be merged or repaired. Verify first; do not reopen it, duplicate banners, reset the rescue branch, or recreate completed work.
- **Concurrent work:** Local dirt, another agent on the same worktree, or remote head/base movement invalidates the assumed edit/review base. Preserve changes, refetch and assess the delta; never force-push or reset someone else's work.
- **Unmerged synthetic SHA:** A PR can expose `merge_commit_sha` before merge. Only `merged=true` / non-null `mergedAt` proves promotion; then retrieve the actual merge commit and confirm ancestry.
- **Permissions:** Earlier GitHub connector writes returned 403. Use the user's authorized local `gh` connection when available; do not request tokens in chat or print credentials. On unavailable write access, retain local patches and report the boundary.
- **Empty checks:** Empty status contexts do not prove that checks passed or that check-runs are absent. Inspect both status contexts and check-runs, plus review requirements. Do not bypass required checks with `--admin`.
- **Missing dependencies:** Existing lockfile bootstrap is allowed. Dependency upgrades, lockfile regeneration and source changes are not a remedy for this docs-only task.
- **Historical text:** The tracker contains historical logs with old states. Do not globally replace them. Repair active summaries; label historical checkpoints clearly and retain their original evidence.
- **Approval drift:** Generic pre-Storybook `STACK_GREEN` text differs from the approved Phase 1 qualification order. Document the scoped exception, not a new global state machine. Do not weaken required owner approval.
- **Local-state visibility:** GitHub cannot prove the absence of unpushed local worktrees. Inspect accessible local worktrees and state the scope of that observation; do not claim knowledge of every device.
- **B-003:** Remains unresolved residual runtime risk. It is not a new prerequisite for this planning closeout or isolated Storybook work, but it does not waive any actual required finite failure or release gate.

## Parallelization / Worktree Strategy

Use one writer and execute tasks sequentially. Independent read-only review is allowed; concurrent issue/body edits or tracker writers are not.

Reuse the existing clean #572 worktree. Run `git worktree list --porcelain` before choosing it. If it is absent, use the available `using-git-worktrees` skill at execution time to create an isolated **planning** worktree tracking `docs/phase1-storybook-amendment`. If that skill is unavailable, use the repository's documented worktree procedure and record that fact. Never create `rescue/t07-storybook-foundation` here.

Use normal commits and non-forced pushes. Reuse open #572 rather than opening another architecture PR. If #572 has already merged with missing corrections, Task 1 explicitly stops for a scoped follow-up instead of silently pushing fixes to a closed PR. After #572 merges, the default activation is one reviewed tracker-only fast-forward commit to rescue where existing policy permits it; if branch rules require a PR, use a tracker-only activation PR and wait for its authorized merge before claiming readiness.

---

## Verification Design — Defined Before Editing

This is a docs/control-plane correction, so regression checks assert text meaning, issue structure, provenance and Git state. Do not add dummy React/Vitest tests just to satisfy a test-first ritual. First demonstrate the concrete old failure, then patch, then repeat the same check. Existing application regressions are covered by the unchanged `verify:precommit` command. [S5]

| Check | Required observation before correction | Passing observation |
|---|---|---|
| V1 — Phase 0 summary | Active exit says both T06 merged and “T06 not yet merged”; merged-ticket list omits T06 | T01–T06 listed, T06 merge retained, checkpoint/ref roles accurately labeled |
| V2 — T07 routing | T07 section can be followed by T05 “Current child order”; active sections still say replacement plan does not exist | T05 order stays in T05 section; T07 maps #566–#571; current wording distinguishes published planning from unstarted implementation |
| V3 — Storybook scope | Governance §10's `Do not` list forbids treating Storybook as a development/test workshop | Workshop use is explicitly permitted; only shipped-product/runtime treatment is prohibited |
| V4 — Scoped precedence | Generic one-PR-per-ticket / approval-after-STACK_GREEN language can override Phase 1 | T07 checkpoint and Phase 1 approval exceptions are explicit at general entry instructions; no global rule or T05 acceptance weakened |
| V5 — Issue adaptation | Verify current bodies rather than assume missing fixes | #512/#566 gates align; #566–#571 graph is correct; exactly one inheritance banner per downstream issue and three named notes |
| V6 — No scope leak | Snapshot manifests, lockfiles and PR changed-file list | Only allowed Markdown changes; no new T07 code/worktree; frozen dependencies unchanged |
| V7 — Merge truth | #572 open, or current actual state | Exact reviewed head merged into rescue with non-null merge time and verified ancestry; not a synthetic candidate SHA |
| V8 — Activation | Awaiting-plan frontier before promotion | Only #512/#566 eligible after actual promotion; other tickets retain blockers; no implementation-start claim |

No fabricated red result is required when a newer head has already fixed a finding. Record `ALREADY_SATISFIED` with the inspected revision and continue.

## Runtime Values and Evidence Contract

Resolve and record these values during Task 1. They are observations, not future values to invent:

- `START_HEAD`: full SHA of #572's observed source head before this session's edits.
- `START_BASE`: full SHA of the observed rescue branch before this session's edits.
- `MAIN_BEFORE`: current remote main SHA, used only to detect unrelated movement; never reset main.
- `REVIEWED_HEAD`: the final corrected and reviewed #572 head from Task 4.
- `MERGE_SHA`: actual #572 merge commit retrieved only after confirmed merge.
- `ACTIVATION_PARENT`: rescue head immediately before the tracker activation commit.
- `ACTIVATION_SHA`: the published tracker activation commit, recorded outside its own content.

Use one existing shell session or persist these values in the local evidence directory and reload them when sessions change. Never silently recalculate `REVIEWED_HEAD` to mean an unreviewed revision.

Create a run-specific evidence directory, outside the working tree:

```bash
COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
EVIDENCE="$COMMON_DIR/t07-readiness-closeout/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$EVIDENCE/issues"
```

Keep `context.md`, `checks.md`, `review.md`, `result.md`, a working checklist copy of this plan, before/after issue JSON/body files, and command logs there. Track progress in that evidence copy; do not create repeated repository commits solely to toggle plan checkboxes. Publish a concise exact-SHA summary to #572 for durable team visibility. Never commit secrets or claim these local files are durable remote artifacts.

---

### Task 1: Establish a Current, Reversible Planning Baseline

**Files:** Read root guidance, both package manifests/lockfiles, the six #572 authority files and all relevant issue bodies/comments. Save this plan to `docs/superpowers/plans/2026-09-05-t07-readiness-closeout.md` only after selecting the planning worktree. Local evidence: `$EVIDENCE/context.md`, `$EVIDENCE/checks.md`, `$EVIDENCE/issues/`.

**Interfaces:** Consumes the live PR/ref state and [S3] owner-approved amendment. Produces `START_HEAD`, `START_BASE`, `MAIN_BEFORE`, a verified planning worktree, and before-snapshots for idempotent edits.

- [ ] **Step 1: Read repo guidance and inspect local ownership.** Run `git status --short`, `git remote -v`, and `git worktree list --porcelain`. Verify `Noahlw/efcc` is the intended remote. Expected: the chosen planning worktree is clean and not being edited by another agent. If dirty or occupied, stop before touching it; do not stash/reset/delete automatically.
- [ ] **Step 2: Read actual remote PR and branch state.** Use these read-only commands:

  ```bash
  gh pr view 572 --repo Noahlw/efcc --json number,state,isDraft,baseRefName,baseRefOid,headRefName,headRefOid,mergedAt,mergeCommit,reviewDecision,statusCheckRollup,url,body
  git fetch origin
  git rev-parse origin/rescue/ui-control-recovery
  git rev-parse origin/main
  ```

  Expected on the audited starting state: #572 open, source `docs/phase1-storybook-amendment`, target `rescue/ui-control-recovery`. If already merged, inspect what landed: when all planned corrections are present, skip satisfied correction/merge tasks and continue only the outstanding activation checks. If it merged without these corrections, do not edit or push the closed #572 branch; stop with a scoped docs-only follow-up PR proposal and the exact missing corrections. If closed unmerged, retargeted or carrying implementation changes, stop and report that specific divergence.
- [ ] **Step 3: Reuse/synchronize the planning worktree.** Enter its actual listed path and run `git pull --ff-only`. Expected: no non-fast-forward loss and local HEAD equals the intended remote planning branch. If no such worktree exists, create only the planning worktree using the strategy above. Do not create a T07 implementation branch.
- [ ] **Step 4: Record baseline values and back up source material.** Record exact SHAs and the PR state in `context.md`. Snapshot #505 body plus comments; #512–#541; #566–#571; and #572's metadata/review discussion. For each number in that explicit set, assign the shell variable `ISSUE` to the integer, then run `gh api "repos/Noahlw/efcc/issues/$ISSUE" > "$EVIDENCE/issues/$ISSUE.before.json"`. Preserve the returned body, title, labels and `updated_at`. Here `ISSUE` is the current member of the listed finite set, not an unspecified input. Read comments where they contain an amendment, especially #505, #516 and #538. Record the observed V1–V8 results in `checks.md`. No “verified” entry may be based solely on an older chat summary.
- [ ] **Step 5: Snapshot protected paths and changed-file scope.** Run `git diff --name-only origin/rescue/ui-control-recovery...HEAD` and `git diff --stat origin/rescue/ui-control-recovery...HEAD`. Expected: the original six Markdown paths. Record root/web manifest and lockfile contents or hashes. Check `git ls-remote --heads origin 'refs/heads/*t07*'` and local worktrees. If T07 implementation has already started, stop before rewriting its state as unstarted; report that divergence rather than deleting it.
- [ ] **Step 6: Prepare the existing verification environment before commit hooks run.** Read current runtime guidance. With the audited environment, run `fnm exec --using 22.18.0 pnpm bootstrap` if root/web dependencies are missing; otherwise verify that the existing installation is usable. Without `fnm`, select Node `22.18.0` using the already-supported local manager and run `pnpm bootstrap`; do not install another manager. Expected: existing frozen-lockfile installation succeeds with unchanged root/web manifests and lockfiles. On dependency/network failure, retain evidence and stop before committing; do not bypass hooks or upgrade dependencies.
- [ ] **Step 7: Persist the execution plan.** Copy this complete document to its repo path, without copying the entire old five-file draft bundle. Commit only that file with message `docs(plan): record T07 readiness closeout`. Expected: one plan document added; no implementation/source changes. If an identical plan is already committed, do not add a duplicate or an empty commit.

**Task gate:** A reviewer can identify the exact current state, changes already completed, and rollback inputs. Infrastructure/permission failure is reported honestly, not bypassed.

### Task 2: Repair Active Tracker Facts Without Rewriting History

**Files:** Modify `docs/implementation/ui-control-recovery-plan.md`, specifically §§2–7, active parts of §§8–13, §§16–17 and §20. Append one current planning reconciliation entry under §14; preserve earlier historical entries. Test evidence: `$EVIDENCE/checks.md`.

**Interfaces:** Consumes verified PR/ref and merged-ticket facts from Task 1. Produces a self-consistent pre-merge tracker: Phase 0 complete; planning published but pending promotion; no T07 implementation frontier yet.

- [ ] **Step 1: Reproduce factual contradictions.** Search with `rg -n 'T06 not yet merged|intentionally untouched|separate owner-approved replacement plan|Stop at T06|Current child order|STACK_GREEN' docs/implementation/ui-control-recovery-plan.md`. Classify each hit as active state or historical log. Expected on the audited head: active V1/V2 failures. Do not treat a historical checkpoint as a present blocker.
- [ ] **Step 2: Reconcile Phase 0 completion facts.** In the active Phase 0 exit record, include T06/#511 among T01–T06 merged tickets. Preserve T06's actual merge `ffef73087c3cc985f1b314e8017cfdf973e26d58` as the **Phase 0 exit implementation merge**, and the later `56f2195f72645440ea2e2f350f628479e48a330e` as the **post-T06 tracker checkpoint**, unless newer verified facts supersede the current-ref field. Remove “T06 not yet merged” only from active summaries. Put T06's merge SHA in the table's Merge SHA column, not only inside its PR cell.
- [ ] **Step 3: Separate mutable HEAD from evidence SHAs.** In Current execution state and Active phase stack, label the rescue SHA as “observed rescue base at this planning checkpoint,” using the runtime `START_BASE`. Do not pretend a file can contain the hash of its own future commit. Preserve older T05/T06 tested/merge SHAs with their correct roles. Record current head after commits externally in #572/result evidence instead of generating endless tracker-only self-hash commits.
- [ ] **Step 4: Correct current planning/routing text.** Across active §4, Phase overview, §7, §13 and §20, use the meaning: “Phase 0 complete; Storybook planning published in #505/#512–#517/#566–#571; PR #572 awaiting merge; T07 implementation not started.” Keep #512 and #566 `BLOCKED — AWAITING PLAN MERGE` until actual promotion. Replace “future placeholder / replacement plan does not exist” assertions. Current merge frontier is the planning PR #572, not an unmerged T06 PR.
- [ ] **Step 5: Repair graph placement and entry instructions.** Move the T05 “Current child order” line back inside the T05 override; do not delete its provenance. Link #566–#571 in the T07 override. Add an explicit pointer at generic session-start/per-ticket instructions: T07 children use `CHECKPOINT_GREEN`, one shared branch/PR, and the child graph; they do not need a separate PR or a parent child-`STACK_GREEN`. T07.6 is the only shared-PR final qualifier.
- [ ] **Step 6: Reconcile cross-phase summaries.** In §16, mark T05 and the earlier stacked-delivery amendment as merged only after verifying their PR facts. Link the #505 Storybook amendment, #572, ADR-0045 and the six T07 children in the existing references/assets/decision structure; reuse an existing Storybook decision row if present rather than creating a competing registry. In Phase 2–5 exit placeholders, replace the obsolete “T07 needs a new plan” sentence with each actual next-phase gate: Phase 2 → Phase 3 after T13–T16 merge/approval; Phase 3 → Phase 4 after T17–T19; Phase 4 → Phase 5 after T20–T27; Phase 5 → Phase 6 after T28–T31 and required device/print evidence. None of these future gates is claimed satisfied.
- [ ] **Step 7: Preserve historical execution logs.** Earlier §14 entries retain their original dates/SHAs/status observations. Add one new closeout checkpoint with the actual current planning state, links and verified outcomes. The active instruction must no longer be “stop at T06 forever”; the historical instruction can remain historical.
- [ ] **Step 8: Repeat V1/V2 and commit.** Read the active Current execution state, Phase 0 exit, Phase 1 table, Active phase stack, cross-phase assets and Next safe action together. Expected: they describe the same state. `git diff --check` must exit 0. Commit only the tracker with `docs(tracker): reconcile post-T06 planning state`.

### Task 3: Remove Authority Contradictions Already Resolved by the Approved Plan

**Files:** Modify `docs/implementation/ui-control-recovery-governance.md`, `AGENTS.md`, and the general workflow/state explanations in `docs/implementation/ui-control-recovery-plan.md`. Read `TESTING.md`, ADR-0045, #505 amendment §9, and #512–#517. No TypeScript/schema changes.

**Interfaces:** Consumes the approved architecture and qualification rules [S3], not a new design decision. Produces explicit precedence so an agent cannot follow an obsolete global sentence instead of the scoped Phase 1 contract.

- [ ] **Step 1: Reproduce V3/V4.** Read governance §§3–4, 9–10 together with #505's Phase 1 amendment. The audited §10 says, under “Do not,” “treat Storybook as a development/test presentation workshop or production route.” The same document earlier requires workshop use. The generic §9 also allows child implementation before human approval, while the approved T08–T10 sequence puts required design approval before `STACK_GREEN`. Record these contradictions; do not characterize them as new architecture requests. [S2, S3]
- [ ] **Step 2: Fix the inverted prohibition.** Replace only the faulty §10 list item with: “treat Storybook as a shipped-product route or production runtime dependency.” Place a separate positive sentence outside the negative list: “Storybook is the canonical local development/test presentation workshop. Historical prototypes and temporary compatibility paths are not shipped-product authority.” Preserve prototype/domain reconciliation and the ban on copying a fake shell.
- [ ] **Step 3: State scoped promotion precedence.** Add a concise Phase 1 precedence note to governance §9 and the tracker's generic state/visual-flow explanation. T07 child checkpoints follow their approved criteria; #571's whole-PR qualification includes required workshop-fidelity approval. T08–T12 retain their own required design approval/final qualification criteria before their declared `STACK_GREEN`. Generic `STACK_GREEN → WAITING_HUMAN` text must not override those stricter approved criteria. Do not change the global state enum, invent new statuses, or remove later external/merge gates. Do not extend this clarification to unrelated phases without authority.
- [ ] **Step 4: Preserve the approved abstraction exceptions.** Reconcile governance's blanket “second caller required” sentences with #505 §9 and #515: a shared production abstraction requires multiple genuine production uses, an existing use plus demonstrated T12 product-wide seam, or a clear documented domain/accessibility/shell ownership reason. Storybook examples alone do not count as production uses. A speculative single-screen wrapper stays feature-local. This clarification changes no source module and does not pre-approve arbitrary wrappers.
- [ ] **Step 5: Add short agent routing, not another manual.** In `AGENTS.md`, explicitly point generic per-ticket branch/PR instructions to the T07 exception and the scoped Phase 1 qualification rule. Clarify that generic real-app `READY` guidance applies to required integration evidence, while isolated presentation follows `TESTING.md`/ADR-0045; this does not waive any required browser/Worker test. State that an issue label alone never authorizes a worktree or `/implement`.
- [ ] **Step 6: Repeat V3/V4 against the complete docs.** Expected: workshop use is permitted, production dependency direction stays prohibited, T07 children can progress through their checkpoint graph, and no generic sentence permits skipping required Phase 1 approval. Human approval remains human; no approval result is invented now. Commit only changed authority Markdown with `docs(governance): clarify Storybook scope and Phase 1 precedence`.

**Task gate:** The reviewer checks corrections against already-approved [S3] and current ticket criteria. If an independently newer owner amendment genuinely conflicts, stop at that specific conflict; do not silently choose a new policy.

### Task 4: Finish Ticket Routing Idempotently and Qualify the Exact Candidate

**Files/resources:** GitHub #512/#566; read #505, #513–#541, #567–#571; PR #572 body/comment; local evidence. No additional repo source files.

**Interfaces:** Consumes the corrected planning documents and before-snapshots. Produces a verified issue map and `REVIEWED_HEAD` with test/review evidence. No merge occurs in this task.

- [ ] **Step 1: Verify the existing fixes before patching.** #512 must list T07.6 as #571. #512/#566 must require #572 actually merged into rescue and tracker #512/#566 `FRONTIER`; explicitly retain the separate implementation-authorization boundary. Fix only a missing link or ambiguous gate. #566's grammar can be repaired without changing scope: “PR #572 must be merged…” and “Do not create a T07 implementation worktree or run `/implement` before both planning conditions are true.”
- [ ] **Step 2: Validate the whole first-phase graph.** Check #567–#570 depend on #566; #571 depends on #567–#570; #513→#512, #514→#513, #515→#514, #516→#510/#515, and #517→#506/#511/#516. Confirm Management Hub's four named tracer states and T07 preservation/no-redesign scope remain intact. Existing T05 finite-gate and B-003 qualifications must remain in #516. Do not rewrite already-correct bodies or mark implementation checkboxes complete.
- [ ] **Step 3: Verify all 24 downstream bodies.** Inspect #518–#541 individually, not just a search result count. Each has one architecture-inheritance banner, and #538/#539/#541 have their specific future-revalidation notes. If correct, make zero edits. If an insertion is genuinely missing, restore only that approved banner/note from the earlier V2 handoff or an already-verified sibling; preserve the original product/acceptance/dependency body. “ADR-0045 in planning PR #572, effective after merge” is a valid conditional statement and need not trigger another 24-ticket rewrite after merge.
- [ ] **Step 4: Protect against concurrent issue edits.** Before each write, re-read its body and `updated_at` and compare with the snapshot. On a difference, preserve the new content and reconcile only the intended block. Save edited body and after-read-back locally. Use `gh issue edit 566 --repo Noahlw/efcc --body-file "$EVIDENCE/issues/566.after.md"` for an actually changed #566, with the matching number/path for another approved edit. Never replace labels as a whole or silently overwrite someone else's comment/body.
- [ ] **Step 5: Align only the immediate execution label.** Remove `ready-for-agent` from #512 while it is an umbrella/pending promotion, if present. Do not add it to #566 yet. Do not mass-edit downstream labels or native dependency metadata. The tracker remains the execution authority.
- [ ] **Step 6: Confirm the verification environment.** Run `fnm exec --using 22.18.0 node --version` and `fnm exec --using 22.18.0 pnpm --version`, or equivalent commands under the existing selected runtime. Expected for this audited baseline: Node `v22.18.0` and pnpm `11.7.0`, with the root/web dependencies prepared in Task 1 and unchanged manifests/lockfiles. A newer documented runtime policy takes precedence after explicit reconciliation. Missing dependency/network/workerd/platform capability is a reported infrastructure failure, not permission to upgrade or patch source. [S5]
- [ ] **Step 7: Run the unchanged qualification.** Run `fnm exec --using 22.18.0 pnpm --reporter=silent verify:precommit` under that runtime, or the identical pnpm command after selecting Node via the existing manager. Capture the full process result. Expected: exit 0. A longer command may exceed one small planning step's time estimate; wait for its real exit instead of declaring timeout output a pass. Also run `git diff --check origin/rescue/ui-control-recovery...HEAD` and verify clean post-hook content. Do not run a live five-minute canary merely for this docs PR.
- [ ] **Step 8: Review the complete PR, not only the latest patch.** Run the current Standards/Spec read-only review against the full base-to-head diff, using the supplied reviewer brief. Include original ADR/governance changes as well as closeout corrections. Record exact head, findings, disposition and reviewer mode in `review.md`. Fix actionable plan-alignment problems; advisory wording/native-metadata suggestions do not restart planning. If no subagent reviewer is available, perform and label a self-review; never report a nonexistent independent review. Satisfy any actual required reviewer policy before merge.
- [ ] **Step 9: Publish the corrected branch without force.** Commit any remaining approved Markdown correction, run necessary repeat checks, then `git push origin docs/phase1-storybook-amendment`. Capture `REVIEWED_HEAD` from the final locally reviewed commit and verify it equals #572's `headRefOid`. Test evidence may be carried forward only across explicitly reviewed documentation-only deltas; rerun relevant checks when content changes. No empty “evidence update” commit loop is needed.
- [ ] **Step 10: Refresh PR evidence truthfully.** Update #572 with the exact reviewed head, actual local verification results, changed-file scope, and corrected semantic audit. Do not reuse “no conflicts” from before these corrections. Inspect `gh pr view 572 --repo Noahlw/efcc --json reviewDecision,latestReviews,statusCheckRollup` and the head's status/check-runs if necessary. Record `NO_CHECKS_REPORTED` distinctly from PASS. Do not add new CI implementation or bypass existing required checks.

**Task gate:** `READY_FOR_OWNER_MERGE` requires V1–V6 satisfied, exact-head local qualification/review, no scope leak, and correct current issue routing. If merge authorization is absent, report this state and stop here.

### Task 5: Merge Only the Reviewed Planning Revision, When Authorized

**Files/resources:** PR #572 and rescue Git ref only. No application file edits.

**Interfaces:** Consumes `REVIEWED_HEAD`, qualified current base and explicit owner merge authorization. Produces verified `MERGE_SHA`. Source branch is retained; implementation issues remain open.

- [ ] **Step 1: Record the authorization.** Require a direct instruction such as “Merge PR #572 into rescue after the checks pass.” A request to write/read this plan, or approval of Storybook architecture, is insufficient by itself. If absent, stop with the specific missing permission, not another architecture question.
- [ ] **Step 2: Recheck immediately before merge.** Re-read #572 state, base, head, reviews, status checks and source diff. Expected: same `REVIEWED_HEAD`, intended rescue target, no blocking required review/check and no new implementation file. If source moved, review the delta and refresh exact-head evidence. If rescue moved, inspect the base change and requalify the effective merge candidate; do not force the old plan onto it.
- [ ] **Step 3: Merge with an exact-head guard.** If repository policy allows merge commits, run:

  ```bash
  gh pr merge 572 --repo Noahlw/efcc --merge --match-head-commit "$REVIEWED_HEAD"
  ```

  Do not use `--admin`, `--auto`, force pushes, branch deletion, or a different target. If repository policy forbids the merge method, follow the already-approved project method without bypassing protection; if method authorization is unresolved, report that bounded question. A queued merge is not an actual merge. [S6]
- [ ] **Step 4: Verify actual promotion.** Run `gh pr view 572 --repo Noahlw/efcc --json state,mergedAt,mergeCommit,headRefOid,baseRefName`, retrieve the actual merge SHA and fetch origin. Expected: `MERGED`, a real merge timestamp, correct rescue target, and the merge in rescue ancestry. Check `git merge-base --is-ancestor "$MERGE_SHA" origin/rescue/ui-control-recovery` returns 0. Do not reuse #572's pre-merge candidate `merge_commit_sha` as proof.
- [ ] **Step 5: Verify the landed tree and preserve boundaries.** Read merged ADR-0045/governance/tracker from rescue, and compare the resulting allowed-path diff. Confirm no implementation issue was auto-closed by this planning PR. Record any concurrent main movement separately; this plan must not write or reset main. Do not create a T07 worktree.

**Task gate:** Planning authority really exists on rescue. PR closure without merge or a queued/predicted merge does not satisfy this task.

### Task 6: Publish a Consistent T07 Frontier Activation and Stop

**Files:** Modify only `docs/implementation/ui-control-recovery-plan.md` for activation. GitHub #566 label and a factual result comment/body update on #572. No T07 implementation branch.

**Interfaces:** Consumes verified `MERGE_SHA` and current rescue ancestry. Produces published `ACTIVATION_SHA`, one consistent active frontier, and a final next-session instruction that names #566 without executing it.

- [ ] **Step 1: Select a clean rescue checkout for the tracker update.** Reuse an existing clean rescue checkout when safe; synchronize with `git pull --ff-only`. Record `ACTIVATION_PARENT` from actual rescue HEAD. If direct tracker-only pushes are prohibited, prepare a docs-only activation branch/PR using existing policy. Do not confuse an unmerged activation branch's intended state with live rescue state.
- [ ] **Step 2: Activate every active routing surface together.** Update Current execution state, Phase overview, Phase 1 table, Active phase stack, cross-phase assets and Next safe action to agree:

  | Field | Required activated value |
  |---|---|
  | Current phase | Phase 1 — Executable UI Foundation |
  | Phase 0 | Complete through T06, evidence preserved |
  | Planning authority | #572 merged; actual `MERGE_SHA` recorded |
  | T07 / #512 | `FRONTIER` umbrella; not implemented |
  | T07.1 / #566 | `FRONTIER`; sole next executable child |
  | T07.2–T07.5 | `BLOCKED` by #566 checkpoint |
  | T07.6 / #571 | `BLOCKED` by #567–#570 |
  | T08–T12 and T13–T36 | Existing logical/phase gates unchanged |
  | Active implementation stack | None yet |
  | Next safe action | On separate owner implementation authorization, begin only #566 from the then-current verified rescue HEAD |
  | Residual risk | B-003 `OPEN`; no runtime-fix/release claim |

- [ ] **Step 3: Remove stale active pre-merge statements.** Change statements that #572 “is still open” or planning is “awaiting publication” to factual promotion references. Keep conditional downstream banner wording valid; do not mass-rewrite it. Keep historical pre-merge logs labeled historical. Record the verified source/merge/checkpoint SHAs by role; the activation commit does not embed its own unknown SHA.
- [ ] **Step 4: Verify V7/V8 and the activation diff.** Expected activation diff: tracker only. Re-read all active routing tables together; no “stop at T06 / missing replacement plan” remains as a current command. Run `git diff --check`, required repository commit hooks and the applicable existing verification policy. Append a planning-only activation log entry, not a T07 implementation completion entry.
- [ ] **Step 5: Commit and publish activation without force.** Use message `docs(tracker): activate T07.1 after planning promotion`. Publish through the permitted rescue update flow. If a tracker-only PR is required, wait for its authorized actual merge; until then return `WAITING_ACTIVATION_PROMOTION`. After publication, record `ACTIVATION_SHA` externally and verify it is in rescue ancestry. Do not add another commit just to put that SHA inside itself.
- [ ] **Step 6: Set the immediate execution label and read back.** Add `ready-for-agent` to #566 only after live activation. Keep #512 as an umbrella and keep issues open. If label permission alone fails, record the metadata warning; a direct #566 invocation can use verified tracker/ticket authority without making native metadata a new architectural blocker.
- [ ] **Step 7: Issue the final readiness receipt.** Publish one exact-SHA summary in #572's discussion and return the fields below to the owner. Do not reuse T06's old PASS record as a review of #572. Do not begin #566, create `.storybook`, or create the implementation worktree.

**Final receipt fields:** PR #572 state; actual `MERGE_SHA`; `ACTIVATION_PARENT`; `ACTIVATION_SHA` and observed rescue HEAD; exact documents/issues changed versus verified-no-op; downstream banner count and three notes; local verification and review mode/SHA; GitHub check status; B-003 disposition; local worktree inspection scope; unchanged protected paths; final status.

Use only one of these final statuses:

- `READY_FOR_OWNER_MERGE` — corrected/qualified but merge not authorized or not yet performed.
- `WAITING_ACTIVATION_PROMOTION` — planning landed; live tracker activation not yet published.
- `READY_FOR_T07_1 — IMPLEMENTATION_NOT_STARTED` — planning landed, tracker activated, required evidence satisfied; separate implementation instruction can now start #566.
- `BLOCKED` — name the concrete unmet requirement, current evidence and safe resumption point.

Do not call T07 `STACK_GREEN` or claim its Stories/tests exist.

---

## Bounded Completion Checklist

- [ ] Active Phase 0 completion facts and SHA roles are accurate; historical logs remain preserved.
- [ ] T07 graph is #566 → (#567/#568/#569/#570) → #571 on one future shared implementation PR.
- [ ] No governance sentence forbids the approved local Storybook workshop.
- [ ] Scoped Phase 1 approval/abstraction rules agree with #505 and #512–#517.
- [ ] #512/#566 entry gates are explicit; #512's #571 link is correct; no duplicate body edits.
- [ ] #518–#541 inherit current architecture; targeted #538/#539/#541 notes exist; product scope/dependencies preserved.
- [ ] Existing verification is truthfully green or a concrete blocker is reported; empty CI is not PASS.
- [ ] Complete corrected PR reviewed at a named exact head, without fictitious independent-review claims.
- [ ] #572 merged only with explicit permission and exact-head protection.
- [ ] Actual merge and tracker activation are present in rescue ancestry before readiness is claimed.
- [ ] No main/deployment/data mutation and no Storybook implementation occurred.
- [ ] Agent stops after the readiness receipt; no new architecture grilling or optional-tooling gate is introduced.

## Rollback and Resume

Before publication, revert only this session's own tracked corrections after checking the working tree; never discard unrelated work. After publication, prefer a small forward correction. Reverting an already merged governance PR or activation is a separate owner-authorized action, not an automatic error handler.

Issue edits are separate from Git commits: preserve before/after bodies and only restore this session's inserted block when no concurrent edit would be lost. Do not overwrite an entire issue from a stale snapshot. Never delete preserved comments, close the approved spec, or reset branch history.

On interruption, resume from the last verified task artifact and re-read live refs. Already-correct bodies and already-merged PRs are no-ops. Publication/activation are idempotent, not instructions to recreate tickets or replay merges.

## Plan Self-Review and Reviewer Handoff

Author self-review checks: requirements mapped to Tasks 1–6; exact paths and runtime values named; no source implementation; no stale SHA forced onto live refs; protected historical logs; narrow issue edits; approval boundary explicit; exact-head merge; self-hash recursion avoided; optional metadata not a new blocker.

This is an author self-review, not a claimed independent subagent approval. Use the accompanying `PLAN-REVIEW.md` with an available read-only reviewer before execution, or explicitly record self-review when no reviewer agent is available. The review follows the uploaded template: completeness, spec alignment, task decomposition and buildability; only actionable failures block approval. Do not turn minor wording preferences into another planning loop.

## Sources and Scope Provenance

- **S1 — Live PR snapshot and full changed-file patch, read 2026-09-05:** https://github.com/Noahlw/efcc/pull/572 ; audited head `0d5d840363ed8ade0bff1990c832cb2d52bbc4a7`.
- **S2 — Governance at that exact head:** https://github.com/Noahlw/efcc/blob/0d5d840363ed8ade0bff1990c832cb2d52bbc4a7/docs/implementation/ui-control-recovery-governance.md . §10 contains the inverted prohibition; §9 carries the old generic state guidance.
- **S3 — Owner-approved Phase 1 amendment, especially §§7–10 and 13:** https://github.com/Noahlw/efcc/issues/505#issuecomment-5552371886 . This supplies the architecture, checkpoint, approval and abstraction decisions; this plan does not invent them.
- **S4 — Current published acceptance/routing:** https://github.com/Noahlw/efcc/issues/512 ; https://github.com/Noahlw/efcc/issues/566 ; #513–#517 and #567–#571, plus inherited #518–#541. The preceding live audit supplied the downstream reconciliation findings; Task 4 rechecks each current body.
- **S5 — Existing script definitions:** https://github.com/Noahlw/efcc/blob/0d5d840363ed8ade0bff1990c832cb2d52bbc4a7/package.json . `bootstrap` is frozen-lockfile root+web install; `verify:precommit` is the existing aggregate, not a live sustained canary.
- **S6 — Official CLI references checked for this plan:** https://cli.github.com/manual/gh_pr_merge ; https://cli.github.com/manual/gh_pr_view ; https://cli.github.com/manual/gh_api . CLI examples are operational commands, not new application implementation.
- **Source files supplied by the owner:** `SKILL.md` (`writing-plans`) and `plan-document-reviewer-prompt.md`; the previous `EFCC_POST_T06_TICKET_RECONCILIATION_HANDOFF_V2.md` supplies the earlier scoped issue-cleanup/inheritance contract. This closeout plan supersedes that handoff's stale missing-work assumptions, not its approved architecture.

**Terminal instruction:** Finish this bounded planning closeout, return the readiness receipt, and STOP. Starting #566 is a separate implementation session.
