# T07.3 Programs Storybook acceptance trace

## Current repair addendum — 2026-09-07

Every Programs baseline now requires a screen-specific settled semantic/data marker. A representative loading-shell fixture is a negative control and cannot satisfy readiness; the shared `<main>` landmark alone is no longer accepted. Notifications intent is validated through production `parseProgramsIntent()` and is programless.

**Ticket:** T07.3 / #568
**Scope:** Programs presentation catalog only; no T12 migration, redesign,
backend/domain change, hardware proof, or `/prototype` reuse.
**Status:** `CHECKPOINT_GREEN`

## Code-backed meaningful-screen audit

The Programs route is a boundary containing multiple user-perceivable
compositions. The baseline catalog uses the production components below and
keeps participant and management personas separate.

| Screen | Production boundary | Persona | Baseline PSN | Gap |
|---|---|---|---|---|
| Participant directory | `ParticipantDirectory` | Synthetic Member | `PSN-PROGRAMS-PARTICIPANT-DIRECTORY` | None |
| Participant Program detail | `ParticipantProgramDetail` | Synthetic Member | `PSN-PROGRAMS-PARTICIPANT-PROGRAM-DETAIL` | None |
| Participant Event detail | `ParticipantEventDetailPage` / `EventDetail` | Synthetic Member | `PSN-PROGRAMS-PARTICIPANT-EVENT-DETAIL` | None |
| Management directory | `ManagementDirectory` | Synthetic authorized Manager | `PSN-PROGRAMS-MANAGEMENT-DIRECTORY` | None |
| Program workspace overview | `ProgramWorkspace` / `WorkspaceOverview` | Synthetic authorized Manager | `PSN-PROGRAMS-WORKSPACE-OVERVIEW` | None |
| Workspace Events task | `ProgramWorkspace` / `EventsTask` | Synthetic authorized Manager | `PSN-PROGRAMS-WORKSPACE-EVENTS` | None |
| Workspace Participants task | `ProgramWorkspace` / `ParticipantsTask` | Synthetic authorized Manager | `PSN-PROGRAMS-WORKSPACE-PARTICIPANTS` | None |
| Workspace Settings task | `ProgramWorkspace` / `SettingsTask` | Synthetic authorized Manager | `PSN-PROGRAMS-WORKSPACE-SETTINGS` | None |
| Workspace Notifications task | `ProgramsNotifications` | Synthetic authorized Manager | `PSN-PROGRAMS-WORKSPACE-NOTIFICATIONS` | None |

Query parameters and route aliases remain intent within these screen
identities. The hardware/scanner, Management/Identity, and later T07 child
families remain out of scope.

## Acceptance evidence

- [x] Every audited Programs screen resolves from Screen Catalog to one owning
  Story/PSN declaration.
- [x] Participant Stories use the synthetic Member identity; management Stories
  use the authorized synthetic Manager identity.
- [x] Production presentation components, shell/providers, styling, and local
  primitives are reused; no `/prototype` code is imported.
- [x] Genuine HTTP boundaries use deterministic synthetic MSW responses only.
- [x] Focused Storybook interaction/a11y checks pass.
- [x] Storybook import/build and catalog integrity pass.
- [x] Standards and Spec reviews pass.
- [x] One owning T07.3 checkpoint commit exists on the shared branch.

## Machine evidence

- `pnpm typecheck` — PASS (`tsconfig.json`, `tsconfig.worker.json`).
- `pnpm test:t07:foundation` — PASS, 3 files / 8 tests.
- `pnpm test:storybook` — PASS, 3 files / 21 browser stories.
- `pnpm test` — PASS, 44 files / 606 tests.
- `pnpm storybook:build` — PASS on Storybook `10.6.0`.
- Final Standards review — PASS.
- Final Spec review — PASS after fixing the Storybook Meta component generic.

## Scope guard

No human workshop-fidelity approval, hard pixel baseline, `STACK_GREEN`, PR
merge, or T07.4–T07.6 implementation is claimed by this child.
