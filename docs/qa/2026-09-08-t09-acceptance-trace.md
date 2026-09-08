# T09 / #514 acceptance trace

This trace was established before T09 production presentation-contract edits
and is updated with their machine evidence. It keeps the owner contract,
machine evidence, and final human design gate separate.

## Revision and authority

- Branch: `rescue/t09-surface-feedback-overlays`
- PR: [#577](https://github.com/Noahlw/efcc/pull/577), OPEN/DRAFT, stacked on
  `rescue/t08-control-contracts`
- Fixed T08 parent: `6ab0561f9d79b32e2ca5345325a5cb46f01d2e13`
- T09.0 checkpoint: `9285420a4829264577fae002382a07795091ca39`
- T09 implementation checkpoint: `a8b5033d6c7e9b2e54aa0fe253a6bb7518d03db2`
- T09 review-fix / reviewed production checkpoint: `1530c7aeb66abe4ad429912346ac2bfb26097488`
- Owner contract: D1 approved; D2 and D3 approved with changes in the owner
  decision supplied for T09 / #514. This authorizes implementation only; it is
  not final T09 design approval, `STACK_GREEN`, merge approval, issue closure,
  T10 authorization, or a B-003 disposition change.
- Initial implementation state: `MACHINE_QUALIFICATION_PENDING`
- Human design state: `WAITING_FOR_LATER_HUMAN_REVIEW`

## Acceptance scope

| ID | Criterion | Evidence to record |
|---|---|---|
| T09-01 | Foundation Stories use `subject: "foundation"` and `foundationId`, remain outside Screen Catalog obligations, and preserve T07/T08 declarations. | Story metadata/catalog tests; built-index reconciliation |
| T09-02 | Card remains the sole shared surface primitive, retains `size=default\|sm`, owns only approved surface chrome, and does not clip meaningful content by default. | primitive/component tests; Surface Story; browser geometry |
| T09-03 | Alert supports info/success/pending/warning/conflict/error tones independently from `none\|polite\|assertive` announcement ownership. | Alert contract tests; Feedback Story; duplicate-owner negative test |
| T09-04 | Dialog, AlertDialog, and Sheet expose explicit backdrop/content layer ordering and reachable bounded content/actions without breaking Radix focus/dismissal behavior. | primitive tests; overlay Stories; Chromium geometry/interaction matrix |
| T09-05 | Exact T09-owned login, recovery, approval-queue, and caller feedback/surface migrations preserve copy, domain state, and mutation consequences. | focused component tests; affected governance |
| T09-06 | Governance extends the existing dynamic-base ratchet to new T09-owned overrides and fails closed only for relevant new unclassifiable ownership escapes. | ratchet tests; affected and full governance |
| T09-07 | Required preservation and regression gates pass with zero retries where browser evidence applies. | command ledger below |

## Durable foundation Stories planned

The taxonomy is durable `Foundations`; Storybook slugs are locators only.
Stable PSNs and direct URLs are filled after the first local Storybook build.

| Foundation | PSN | Story ID / URL | Human review |
|---|---|---|---|
| Surface | `PSN-FOUNDATION-SURFACE` | [`foundations--surface`](http://127.0.0.1:6006/iframe.html?id=foundations--surface&viewMode=story) | pending |
| Feedback | `PSN-FOUNDATION-FEEDBACK` | [`foundations--feedback`](http://127.0.0.1:6006/iframe.html?id=foundations--feedback&viewMode=story) | pending |
| Dialog | `PSN-FOUNDATION-DIALOG` | [`foundations--dialog-overlay`](http://127.0.0.1:6006/iframe.html?id=foundations--dialog-overlay&viewMode=story) | pending |
| AlertDialog | `PSN-FOUNDATION-ALERT-DIALOG` | [`foundations--alert-dialog-overlay`](http://127.0.0.1:6006/iframe.html?id=foundations--alert-dialog-overlay&viewMode=story) | pending |
| Sheet | `PSN-FOUNDATION-SHEET` | [`foundations--sheet-overlay`](http://127.0.0.1:6006/iframe.html?id=foundations--sheet-overlay&viewMode=story) | pending |

## Required browser matrix

Chromium, workers `1`, retries `0`:

- `390 × 844`
- `799 × 900`
- `800 × 900`
- `1440 × 900`

Overlay containment may additionally use a deliberately short height when a
geometry assertion needs it; that supplemental viewport does not replace the
canonical four-width matrix.

## Command ledger

The exact commands and results are appended as checkpoint commits complete:

```text
node scripts/t09-frontier-census.mjs --check       PASS at T09.0 checkpoint
pnpm --dir web test:components                     PASS (64 files / 916 tests)
pnpm --dir web test:storybook                      PASS (7 files / 51 tests)
pnpm --dir web storybook:build                     PASS
pnpm --dir web storybook:verify-index              PASS (51 Stories / 35 Screen obligations / 7 controls / 5 foundations)
pnpm test:t09:foundations                           PASS (20 tests, 390/799/800/1440, retries 0; overlay interaction checks included)
pnpm test:storybook:scope                           PASS (1 file / 13 tests)
pnpm --dir web test:t07:foundation                  PASS (10 files / 47 tests)
pnpm verify:governance:affected                     PASS (43 files, 0 active violations, 4 waived)
pnpm verify:governance:full                         PASS (335 files, 0 active violations, 69 waived items)
pnpm verify:governance:release                      PASS (335 files, 0 active violations, 6 active waivers)
pnpm verify:fast                                    PASS
pnpm verify:precommit                               PASS (complete aggregate)
```

The T09 browser run used the repository's local Storybook launcher; no
Cloudflare account or production host was touched. The launcher resolves the
worktree's local package runtime on Ubuntu where `fnm` is not available.

`pnpm check` remains a separate repository-wide baseline failure (46
formatting files plus existing lint findings); a targeted check of T09 changed
lines reported no new diagnostics. This does not turn the command into a
pass or waive the existing failure.

`/code-review Standards` and `/code-review Spec` are required before any
final T09 machine-qualified handoff. Human design approval must be recorded
against the exact implementation SHA after machine qualification; the agent
must not self-approve it or create a T09 design ApprovalPackage early.

## Remaining bounded debt

The T09.0 register remains the source-backed frontier record. Its exact
`BOUNDED_LATER_DEBT`, native exceptions, and preserved compatibility seams
remain in `docs/implementation/t09-frontier-census.md`; this implementation
does not silently convert them into T09 obligations or T10 grammar.
