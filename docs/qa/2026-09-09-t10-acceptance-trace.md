# T10 / #515 acceptance trace

## Machine state

`T10 IMPLEMENTATION_GREEN — READY FOR OWNER L2`

The qualified executable candidate is `04066074` on
`rescue/t10-composition-grammar`, based on the post-T09 planning tip
`19501b5795c387d2562ad50f06e5a390e777e465` from
`planning/post-t09-ui-playground-rewrite`. The final PR is ticket-isolated:
the planning branch remains the base and the T10 branch contains only the
post-T09-base T10 sequence plus this documentation-only closeout:

| Commit | Responsibility |
|---|---|
| `4e9393f3` | Establish canonical Page Frame and migrate `DirectoryFrame`. |
| `8fe49350` | Establish canonical Route Header, migrate live callers, and add the ordinary Route Header Story. |
| `fd0db65c` | Record explicit supporting grammar dispositions and defer route-specific census debt. |
| `b7e96b66` | Strengthen Page Frame and Route Header W7 geometry assertions and correct residual-owner accounting. |
| `04066074` | Restore ordinary Story auto-discovery and the exact 799-column / 800-row Route Header breakpoint contract. |

No owner design approval is claimed. L2 review remains focused on whether the
shared frame/header composition is the desired reusable precedent and whether
the deferred route-family boundaries are appropriate.

## Direct Playground locators

- [T10 Page Frame](http://127.0.0.1:6006/iframe.html?id=t10-composition--page-frame&viewMode=story)
- [T10 Route Header](http://127.0.0.1:6006/iframe.html?id=t10-composition--route-header-story&viewMode=story)

Both are ordinary deterministic Stories. They are not PSNs and are not added to
the shipped-screen catalog solely for grammar demonstration.

## Qualification ledger

| Seam | Evidence |
|---|---|
| Typecheck | `pnpm verify:fast` — PASS for root, E2E and web TypeScript. |
| Public component behavior | Focused component run — 6 files / 63 tests PASS for Page Frame, Route Header and mechanically affected callers. |
| W7 browser geometry | `pnpm test:t10:composition` — 14/14 PASS, Chromium, one worker, zero retries, at 320/375/390/414/799/800/1440. Assertions cover gutter, width boundary, top/bottom reserve, containment, wrapping, action reachability and the 799/800 layout boundary. |
| Storybook build | `pnpm --dir web storybook:build` — PASS. |
| Storybook index | `pnpm --dir web storybook:verify-index` — PASS: 60 Stories, 35 Screen Catalog obligations, 7 control Stories and 12 foundation Stories; registered declarations and all Screen Catalog baselines are resolvable, while ordinary Stories are auto-discovered without an allowlist. |
| Governance | Full and affected audits — PASS with zero active violations; only existing ledger-backed waivers remain. |
| Required aggregate | Commit hook / `pnpm verify:precommit` — PASS: 44 web test files / 606 tests, 65 component files / 923 tests, and full governance. |

## Visual self-review

The combined candidate was rendered and inspected at narrow, boundary and wide
viewports. The Page Frame remained contained with its shared gutter and reserve;
the Route Header wrapped long title/lead content at narrow widths, kept actions
reachable, and remained stable at the exact 799/800 boundary: 799px is the
column layout and 800px is the row layout. No clipping, horizontal overflow,
duplicate heading, migration drift or action-reachability defect was found in
scope.

The ordinary-Story contract was also probed independently by removing both
historical T10 ordinary IDs and adding a renamed ordinary Story. The index
still passed with 59 Stories, 35 Screen Catalog obligations, 7 control Stories
and 12 foundation Stories, proving that ordinary Stories are discovered rather
than admitted through a fixed ID list.

## Review and handoff

- Standards and Spec reviews were run against fixed point
  `19501b5795c387d2562ad50f06e5a390e777e465..04066074`; both passed with no
  unresolved implementation blocker after the W7 assertion, ordinary-Story
  contract and residual-owner repairs.
- The planning PR is not the T10 PR and is not treated as owner design
  approval. The owner should review the qualified executable candidate above
  and the two direct Stories at L2 before promoting the T10 work.
