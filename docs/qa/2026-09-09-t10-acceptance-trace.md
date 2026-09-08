# T10 / #515 acceptance trace

## Machine state

`T10 IMPLEMENTATION_GREEN — WAITING_OWNER_L2`

The implementation candidate is `b7e96b66` on
`planning/post-t09-ui-playground-rewrite`, based on the post-T09 planning tip
`19501b5795c387d2562ad50f06e5a390e777e465`. The branch contains one T10
sequence:

| Commit | Responsibility |
|---|---|
| `4e9393f3` | Establish canonical Page Frame and migrate `DirectoryFrame`. |
| `8fe49350` | Establish canonical Route Header, migrate live callers, and add the ordinary Route Header Story. |
| `fd0db65c` | Record explicit supporting grammar dispositions and defer route-specific census debt. |
| `b7e96b66` | Strengthen Page Frame and Route Header W7 geometry assertions and correct residual-owner accounting. |

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
| Storybook index | `pnpm --dir web storybook:verify-index` — PASS: 60 Stories, 35 Screen Catalog obligations, 7 control Stories, 12 foundation Stories and 2 ordinary T10 Stories; all baselines resolvable. |
| Governance | Full and affected audits — PASS with zero active violations; only existing ledger-backed waivers remain. |
| Required aggregate | Commit hook / `pnpm verify:precommit` — PASS: 44 web test files / 606 tests, 65 component files / 923 tests, and full governance. |

## Visual self-review

The combined candidate was rendered and inspected at narrow, boundary and wide
viewports. The Page Frame remained contained with its shared gutter and reserve;
the Route Header wrapped long title/lead content at narrow widths, kept actions
reachable, and remained stable at the 799/800 boundary. No clipping, horizontal
overflow, duplicate heading, migration drift or action-reachability defect was
found in scope.

## Review and handoff

- Standards and Spec reviews were run against the fixed post-T09 planning tip;
  no unresolved blocker remains after the W7 assertion and residual-owner
  repairs.
- The existing planning PR is not treated as owner design approval. The owner
  should review the candidate SHA above and the two direct Stories at L2 before
  promoting the T10 work.
