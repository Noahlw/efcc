# R8D — Expose Authoritative Settings Conflict Recovery

> Load this bounded child packet only while the master tracker marks R8D ACTIVE. R8 remains BLOCKED until this packet is complete and restarted from a fresh candidate freeze.

**Outcome:** Make the existing Settings conflict contract truthful: preserve the edited draft after a 409, expose the existing reload copy, refetch the server-shaped workspace only after the user chooses reload, and allow a subsequent save against the refreshed state. This packet does not add an API field or change the Worker/D1 contract.

## Files

- Modify: `web/lib/programs/program-settings.tsx`
- Modify: `web/lib/programs/program-settings.test.tsx`
- Modify: `web/lib/programs/workspace-context.tsx`
- Modify: `web/lib/programs/workspace-task.tsx`
- Modify: `web/lib/programs/workspace-settings-task.tsx`
- Modify: `web/lib/programs/program-workspace.tsx`
- Modify: `web/.storybook/programs-fixtures.ts`
- Modify: `web/.storybook/programs-material-states.stories.tsx`
- Update: master tracker and this packet

## Contract

- The first Settings PATCH receives the existing 409 `CONFLICT`; the edited draft remains visible and the user is told to reload before retrying.
- Activating the reload action calls the existing workspace `GET /api/v1/programs/:programId/management` path through its current async-resource retry owner. The refreshed server value replaces the draft only after that explicit user action.
- The route-backed conflict Play observes a changed authoritative server value after reload, then edits and successfully submits a second PATCH. No client-only fixture state may claim a reload.
- Existing uncertain-transport retry behavior, dirty Back/Discard behavior, focus/announcement behavior, API payloads, and non-Settings workspace tasks remain unchanged.

## Steps

- [x] **Step 1: Add the red regression.** Extend the focused Settings conflict test to require the conflict reload action while preserving the draft. Run the focused test and record the expected failure against the current production component.
- [x] **Step 2: Wire the smallest production repair.** Thread the existing workspace retry callback through the task context and Settings task; render the existing conflict reload action only for 409 Settings mutations. Do not broaden retry behavior for validation, schedule, or transport errors.
- [x] **Step 3: Prove route-backed authoritative recovery.** Make the conflict fixture return a changed server-shaped Program on the explicit management reload, update the conflict Play to assert that value before the second PATCH, and retain the exact attempt count.
- [x] **Step 4: Run focused gates.** Run the focused Settings component tests, Storybook, R6 material Play/T11 coverage, web/root typecheck, formatter, and `git diff --check` through Node 22.18.0. Record exact counts and artifacts.
- [x] **Step 5: Review and commit once.** Inspect the eight-file bounded diff, verify no API/baseline/catalog change or suppression, update the R8/R8D checkpoints and ledger, then commit exactly once with `fix(programs): expose authoritative settings conflict recovery`.

## Completion Criterion

R8D is complete only when the focused red assertion is green, the explicit reload refetches and displays an authoritative changed server value, the second PATCH succeeds, all named focused/T11/typecheck gates pass, the bounded diff is reviewed, and exactly one matching child commit exists after the Start SHA. R8 must then restart from candidate-freeze Step 1.

## Checkpoint Log

### Checkpoint — 2026-09-12 03:20 HKT

- **State:** R8D claimed; R8 remains BLOCKED.
- **Branch / HEAD:** `codex/programs-screen-foundations/wave-3` / `f5dc4e77e6d3b20320f6f2d8e9ad5f426dc3350b`.
- **Dirty paths:** existing R8 QA/packet/tracker/artifacts plus this R8D packet; no production overlap before the red regression.
- **Last command / result:** source review of `ProgramWorkspace`, `SettingsTask`, `ProgramSettings`, and R8C conflict Play — `EXPECTED GAP; 409 preserves local draft but no reload action is rendered and Back/re-entry does not call the management GET`.
- **Active finding:** R6 contract line 20 requires an existing reload/retry path; current `retryPatch` is intentionally null for 409 and the workspace retry owner is not exposed to Settings.
- **Next unchecked checkbox:** `Step 1 — add the red regression`.

### Checkpoint — 2026-09-12 04:07 HKT

- **State:** R8D red/green/review complete; the bounded child commit is the next atomic action. R8 remains `BLOCKED` and must restart from a fresh candidate after this commit.
- **Red:** `fnm exec --using 22.18.0 pnpm --dir web exec vitest run --config vitest.components.config.ts lib/programs/program-settings.test.tsx` failed `1/22` before the repair because the existing 409 flow preserved the draft but rendered no `COPY.homeEditor.conflictReload` action.
- **Green:** the focused Settings suite is `22/22`; Storybook is `10 files / 94 tests`; the fresh R6 material T11 run is `9/9` across W7 widths using the dedicated port `6113`; root/e2e plus web `verify:fast`, targeted `oxfmt --check`, and `git diff --check` all pass under Node `22.18.0`.
- **Route evidence:** the conflict fixture now changes the server-shaped Program only after the first 409, the explicit reload refetches `/api/v1/programs/:programId/management`, the Play observes `伺服器最新課程`, and the second PATCH succeeds with attempt count `2`.
- **Review:** the bounded implementation is exactly eight code/fixture/test files plus this packet and the master tracker. No API field, baseline identity, Screen Catalog entry, `ISSUE-#601`, lint suppression, or unrelated task behavior changed.
- **Last completed checkbox:** Step 5 — review and commit once (atomic commit pending).
- **Next action:** stage only the R8D code/fixture/test files, this packet, and the master tracker; commit exactly once with `fix(programs): expose authoritative settings conflict recovery`; verify the unique subject after `f5dc4e77e6d3b20320f6f2d8e9ad5f426dc3350b`.
