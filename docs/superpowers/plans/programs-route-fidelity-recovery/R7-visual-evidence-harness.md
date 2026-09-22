# R7 — Build the Visual Evidence Harness

> Load this packet only when the [master tracker](../2026-09-11-programs-route-fidelity-recovery-tracker.md) marks R7 ACTIVE and R6 plus every inserted recovery packet are COMPLETE. Read the master Global Constraints, Claim and Update Protocol, and Cold Resume Contract first. Mutable task status lives only in the master ledger.

**Outcome:** A deterministic Playwright harness can capture actual route-backed Programs Stories and their frozen HTML references at both primary viewports, assert geometry, and emit a manifest plus contact sheets without a new image dependency.

## Files

- Create: `tests/e2e/programs-visual-fidelity.test.ts`
- Create: `tests/e2e/programs-visual-fidelity.config.ts`
- Modify: `package.json`
- Update: master tracker and this packet

## Visual Case Map

| Actual Story | Frozen reference |
| --- | --- |
| `t07-3-programs--participant-directory` | `01b-participant-directory-member.html` |
| `t07-3-programs-material-states--participant-directory-capable` | `01-participant-directory-capable.html` |
| `t07-3-programs--participant-program-detail` | `02-participant-program-detail.html` |
| `t07-3-programs--participant-event-detail` | `03-participant-event-detail.html` |
| `t07-3-programs--management-directory` | `04-management-directory.html` |
| `t07-3-programs--workspace-overview` | `05-management-workspace-overview.html` |
| `t07-3-programs--workspace-events` | `06-management-events.html` |
| `t07-3-programs--workspace-schedule` | `07-management-schedule.html` |
| `t07-3-programs--workspace-participants` | `08-management-participants.html` |
| `t07-3-programs--workspace-settings` | `09-management-settings.html` |
| `t07-3-programs--workspace-notifications` | `10-management-notifications.html` |

## Output Contract

- Add root script `test:programs:visual` that runs the dedicated config with the existing Storybook lifecycle.
- Require `PROGRAMS_CANDIDATE_SHA` and `PROGRAMS_VISUAL_ARTIFACT_DIR`; reject missing values before opening a browser.
- Run exactly two projects: `402x874` and `360x800`. Capture the 11-case map above for 22 actual/reference pairs after Story route readiness and font/layout settlement.
- For frozen HTML, read the exact file and use Playwright `setContent` so no additional server is required. Hash each prototype file with SHA-256.
- Emit `manifest.json`, four contact sheets—actual/frozen at each viewport—and optional individual captures. Build contact sheets by rendering an HTML grid of data-URL screenshots in Playwright; add no image package.
- Manifest rows contain candidate SHA, Story ID, prototype path/hash, viewport, image names, route-marker count, shell-main count, busy-state count, horizontal/main overflow, minimum visible target size, and capture timestamp.
- Assert actual route marker =1, shell main =1, busy state =0, overflow <=1px, and visible required targets >=44px before capture. These assertions prove geometry, not visual fidelity.

## Steps

- [x] **Step 1: Claim R7 and write output-contract tests.** Run the master preflight and record the start SHA. Create the dedicated spec/config with assertions for the exact 11-case map, two viewports, 22 manifest rows, required fields, and four contact-sheet names. Complete when the test fails because the capture/output implementation is absent, not because Storybook cannot start.

- [x] **Step 2: Run the harness red.** Use a clean task-specific target: `visual_dir=$(mktemp -d /tmp/efcc-programs-visual-r7.XXXXXX); PROGRAMS_CANDIDATE_SHA=$(git rev-parse HEAD) PROGRAMS_VISUAL_ARTIFACT_DIR="$visual_dir" fnm exec --using 22.18.0 pnpm test:programs:visual`. Complete when the checkpoint records the intended missing-output failure and the temp path.

- [x] **Step 3: Implement capture and measurements.** Add only Story readiness, frozen `setContent`, screenshots, geometry extraction, prototype hashing, manifest output, and HTML-grid contact-sheet assembly. Complete when all output fields derive from the live capture or exact file rather than hard-coded PASS values.

- [x] **Step 4: Run the harness green twice.** Run the Step 2 command twice with separate `mktemp` directories and compare manifest row keys, prototype hashes, dimensions, and contact-sheet existence. Timestamps and screenshot bytes may differ; case inventory and measured contract results must agree. Complete when both runs pass independently with 22 rows and four sheets.

- [x] **Step 5: Run focused safety.** Run `fnm exec --using 22.18.0 pnpm test:t11:storybook`, `fnm exec --using 22.18.0 pnpm typecheck`, and `fnm exec --using 22.18.0 pnpm --dir web typecheck`. Complete when the existing Storybook route suite and both TypeScript projects pass with the new harness/config.

- [x] **Step 6: Review the R7 diff.** Compare against the R7 start SHA, run `git diff --check`, confirm the harness writes only beneath the supplied artifact directory, and verify no dependency/lockfile or production file changed. Complete when every changed line belongs to deterministic evidence generation.

- [x] **Step 7: Commit and close R7.** Check all boxes, append the final checkpoint, update the master ledger, and commit the three harness files plus tracker updates with `test(programs): add visual fidelity evidence`. Complete when exactly one matching subject exists after the R7 start SHA, R7 is `COMPLETE`, `Active Task` is `NONE`, and the ledger records green harness/T11/type gates.

## Completion Criterion

R7 is complete only when two independent runs produce the same 11-case/two-viewport inventory and geometry verdicts, four contact sheets and a 22-row manifest are emitted under the caller's target, existing T11/type gates pass, and the committed harness touches no production or dependency files.

## Checkpoint Log

- 2026-09-11 plan authoring: R7 procedure created; no implementation attempted; prerequisites are R1–R6 and every inserted packet COMPLETE; next unchecked item is Step 1.

### Checkpoint — 2026-09-11 20:31 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `54bf903fae79b1a03a2d29e3596f7389f373e340`
- Dirty paths: tracker, this packet, `package.json`, and the new R7 config/spec
- Last completed checkbox: `Step 2 — run the harness red`
- Last command / result: `visual_dir=$(mktemp -d /tmp/efcc-programs-visual-r7.XXXXXX); PROGRAMS_CANDIDATE_SHA=$(git rev-parse HEAD) PROGRAMS_VISUAL_ARTIFACT_DIR="$visual_dir" fnm exec --using 22.18.0 pnpm test:programs:visual` — `EXPECTED FAIL; Storybook started and both viewport tests failed only because /tmp/efcc-programs-visual-r7.EgnGeR/manifest.json was absent`
- Active finding: R7 output-contract tests and the two-project config are in place; no capture/output implementation has been added yet.
- Next unchecked checkbox: `Step 3 — implement capture and measurements`

### Checkpoint — 2026-09-11 20:54 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `54bf903fae79b1a03a2d29e3596f7389f373e340`
- Dirty paths: tracker, this packet, `package.json`, `tests/e2e/programs-visual-fidelity.config.ts`, and `tests/e2e/programs-visual-fidelity.test.ts`
- Last completed checkbox: `Step 5 — run focused safety`
- Last command / result: two fresh visual runs plus manifest comparison; `fnm exec --using 22.18.0 pnpm test:t11:storybook`; root and web typecheck — `PASS; visual runs 2/2 each with 22 rows and 4/4 sheets, comparison keys/hashes/dimensions PASS, T11 117/117, both typechecks pass`
- Active finding: every manifest measurement comes from the live Story/frozen HTML capture; actual route marker/shell/busy/overflow/44px geometry gates are green, and the only expected frozen 360px sub-44 measurement is recorded without being used as an actual-route gate.
- Next unchecked checkbox: `Step 6 — review the R7 diff`

### Checkpoint — 2026-09-11 20:46 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `54bf903fae79b1a03a2d29e3596f7389f373e340`
- Dirty paths: tracker, this packet, `package.json`, `tests/e2e/programs-visual-fidelity.config.ts`, and `tests/e2e/programs-visual-fidelity.test.ts`
- Last completed checkbox: `Step 6 — review the R7 diff`
- Last command / result: latest two-run comparison; `git diff --check`; `oxfmt --check`; `oxlint`; scope scan — `PASS; only R7 packet/tracker, package script, and two harness files changed; no lockfile, production file, or out-of-scope artifact write`
- Active finding: the harness validates required environment before browser launch, confines all generated manifest/PNG/shard writes through the supplied artifact directory, and emits no hard-coded geometry verdicts.
- Next unchecked checkbox: `Step 7 — commit and close R7`

### Checkpoint — 2026-09-11 20:47 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `54bf903fae79b1a03a2d29e3596f7389f373e340`
- Dirty paths: tracker, this packet, `package.json`, `tests/e2e/programs-visual-fidelity.config.ts`, and `tests/e2e/programs-visual-fidelity.test.ts`
- Last completed checkbox: `Step 7 — prepare the R7 closeout commit`
- Last command / result: closeout inventory — `PASS; all R7 acceptance boxes are checked, ledger prepared as R7 COMPLETE / Active Task NONE, and the unique commit subject is ready to run`
- Active finding: R7 scope is limited to the dedicated visual harness, root script, packet, and tracker; commit is the only remaining local mutation before post-commit identity verification.
- Next unchecked checkbox: `none; verify the unique R7 commit subject after commit`

### Checkpoint — 2026-09-11 20:27 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `54bf903fae79b1a03a2d29e3596f7389f373e340`
- Dirty paths: `clean before claim`
- Last completed checkbox: `none; R7 claim/preflight`
- Last command / result: local/remote/PR preflight — `PASS; local HEAD 54bf903f, remote wave-3 9ad90d25, PR #607 OPEN on wave-2 base, no remote write`
- Active finding: R6 and R6A are COMPLETE with their unique commits; R7 is the only active packet and no visual harness files exist yet.
- Next unchecked checkbox: `Step 1 — claim R7 and write output-contract tests`
