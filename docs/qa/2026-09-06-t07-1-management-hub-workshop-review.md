# T07.1 Management Hub workshop-fidelity review packet

**Status:** `READY_FOR_HUMAN_REVIEW` — no human approval claimed.

**Scope:** T07.1 / #566 only. This packet does not create a pixel baseline,
`STACK_GREEN`, or a production-release claim.

## Review URLs

- Storybook: `http://127.0.0.1:6006`
- Management Hub default Story:
  `http://127.0.0.1:6006/iframe.html?id=t07-1-management-hub--default&viewMode=story`

The worktree-safe launcher prints the actual URLs at startup and may choose a
different free port when `6006` is occupied. The direct Story URL keeps the
same Story identity when that happens.

Automated run receipt: [`2026-09-06-t07-1-management-hub-storybook-run.json`](2026-09-06-t07-1-management-hub-storybook-run.json).

## Review matrix

| Viewport | Story states to inspect | Automated browser result |
|---:|---|---|
| `390×844` | Default, Loading, Empty, Recoverable Error | PASS |
| `799×900` | Default, Loading, Empty, Recoverable Error | PASS |
| `800×900` | Default, Loading, Empty, Recoverable Error | PASS |
| `1440×900` | Default, Loading, Empty, Recoverable Error | PASS |

## Human checklist

- [ ] Civic Minimal hierarchy, density, grouping, and shell presentation remain
  truthful to the production Management Hub.
- [ ] No clipping, horizontal overflow, or breakpoint discontinuity at `799/800`.
- [ ] Loading, empty, and recoverable-error copy/state are understandable and
  recoverable; retry remains keyboard and touch reachable.
- [ ] Focus, landmarks, headings, link destinations, and reduced-motion behavior
  are acceptable for workshop review.
- [ ] Synthetic identity/data and Storybook-only MSW boundary contain no member
  records, production identifiers, secrets, or API keys.

The owner may attach screenshots or an ApprovalPackage after this review. Until
then, the packet is evidence prepared for review, not an approval artifact.
