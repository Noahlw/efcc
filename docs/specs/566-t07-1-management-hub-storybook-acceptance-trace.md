# T07.1 / #566 — Management Hub Storybook Acceptance Trace

**Status:** implementation-scope trace; `CHECKPOINT_GREEN` requires every row below
to be evidenced. This is not a human workshop-fidelity approval.

**Authority:** #566 (owner `noahwong-hue`, approved in the live issue and the
implementation prompt on 2026-09-06), ADR-0045, and the Phase 1 Storybook
amendment. The source acceptance criteria and RouteScenario correction
authorization predate implementation; this file makes their observable checks
explicit for the owning checkpoint. The live issue and prompt are the approval
artifacts; this trace is the repository evidence index, not a new approval.

**Implementation base:** `a1a40d12d7a334183951604ae1adec509015474c`

**Scope:** one real production screen (`ManagementHub`), one shared branch
(`rescue/t07-storybook-foundation`), and no T07.2–T07.6 implementation.

## Observable acceptance cases

| ID | Given | When | Observable result / evidence |
|---|---|---|---|
| T07.1-01 | The repository uses Next `16.2.12`, React `19.2.8`, and Vitest `4.1.10` | Storybook dependencies are resolved from the selected official integration | Storybook `10.6.0`, `@storybook/nextjs-vite`, addon-vitest, addon-a11y, MSW, and the Playwright browser provider build and run as dev/test tooling only. |
| T07.1-02 | `ManagementHub` is the production component and its shell path is `AppShell → GuardedSection → ManagementHub` | Each named Story opens from its direct iframe URL | The four stable PSNs render the production component with production CSS/tokens/providers, synthetic auth, and deterministic system-boundary MSW: `DEFAULT`, `LOADING`, `EMPTY`, `RECOVERABLE-ERROR`. |
| T07.1-03 | A Story has a stable PSN and Story ID owned by its Story contract | Storybook/Vitest runs the Stories | Interaction assertions and addon-a11y configuration pass without importing Storybook code into production. |
| T07.1-04 | The browser contract uses a Node-safe stable Story ID bridge verified against the owning Story declarations | Playwright opens the direct Story iframe at `390`, `799`, `800`, and `1440` CSS px | The same Story presentation truth is reachable and the production shell/navigation/link contract is observable at all four review widths. |
| T07.1-05 | The test-only broken target is `36×36` against a `44px` minimum | The T03 structured probe runs | It throws `StructuredContractFailureError` with rule, route, PSN scenario, expected/actual geometry, computed style, ownership layer, browser, viewport, and baseline SHA. It is not in the active Screen Catalog. |
| T07.1-06 | The Screen Catalog is derived from owning Story declarations | Catalog validation runs | Every declared PSN and Story ID is unique, directly resolvable, and the Management Hub baseline is present. |
| T07.1-07 | Port `6006` may belong to another process or this worktree | The local launcher starts or is invoked again | It reuses only a live same-worktree marker, otherwise selects a free port, prints the actual URL and direct Story URL, and never kills an unrelated process. |

## Owner-authorized RouteScenario contract change

This is the narrow pseudo-route correction explicitly included in #566’s
approved implementation scope. IDs and contract references remain stable; only
the route model is corrected to match the real management query-module router.

| Scenario IDs | Current incorrect expectation | Proposed / implemented expectation | Reason and preservation |
|---|---|---|---|
| `SCN-MEMBER-DIRECTORY`, `SCN-ACCOUNT-DIRECTORY`, `SCN-ROLE-HIERARCHY`, `SCN-PERMISSION-EDITOR`, `SCN-HOME-CMS-EDITOR`, `SCN-APPROVAL-QUEUE` | Separate pseudo-paths or `/approvals`, each with `scenario=default` | `route=/management`, with `scenario=module=members`, `accounts`, `roles`, `permissions`, `home-content`, or `approvals` respectively | Matches the shipped `/management?module=...` router; preserves IDs, viewport/browser coverage, contract IDs, ownership layers, and downstream references. Rollback is a single registry revert; removal is deferred until a generated route inventory replaces the pseudo-route entries. |

## Human review boundary

The automated evidence is prepared for human workshop-fidelity review at the
four routine widths. No pixel baseline, owner approval, `STACK_GREEN`, or
production-release claim is created by this trace. T07.6 remains the approval
and shared-PR qualification gate.
