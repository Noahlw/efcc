---
name: pr-description
description: PR descriptions. Use whenever creating or editing a PR body; UI-affecting changes include a conditional UI Review Handoff.
---

# PR description template

PR resolve issue(s) must auto-close on merge via GitHub closing keywords.

## Rule

**First line** of PR body must be closing statement, before `## Summary`:

```
Closes #<N>[, #<M>, ...]
```

- List every issue this PR fully resolves. Use `Closes` (not `Fixes`/`Resolves` — pick one verb, keep consistent across repo).
- Only list issues actually resolved by this PR's diff. Issue referenced but deliberately deferred (see ADR marking out of scope) goes in prose, not closing line.
- No issues resolved (docs-only or infra-only PR) → omit line entirely, don't write `Closes` with nothing after it.

## UI Review Handoff

Include this section only for a materially app-facing UI or presentation PR. Backend-only, infrastructure-only, and documentation-only PRs omit it.

### Candidate

- **Review level:** L1 / L2 / L3
- **Baseline Story:** <direct Storybook/Playground locator>
- **Material Stories:** <only the useful states for this change, or `None`>
- **Risk viewport/platform:** <only if relevant, or `None`>

### Agent self-review

- [ ] Baseline inspected across W7.
- [ ] Material states inspected at relevant risk viewports.
- [ ] Obvious defects found during self-review were repaired.
- [ ] No known in-scope visual defect remains.
- [ ] Relevant focused verification is green.

### Human review focus

- <only genuine subjective/high-risk review points; use `Routine owner spot-check` for ordinary L1 work>

### Visual comparison

- <for major visual changes, include useful before/after or representative phone/desktop/risky-state images when available; otherwise omit this subsection>

Live Storybook is the primary visual review surface; images support the review. Do not duplicate the Test plan. L1 means normal AI-owned implementation plus mandatory owner Storybook spot-check; L2 is human design review triggered by design risk; L3 is actual platform/device/assistive-technology/manual truth. Detailed escalation law remains in the central repository authority.

## Similarity to master (LLM-judged)

Every PR body MUST include a **Similarity to master** section. It is a reviewer-facing
communication aid that summarizes how much of the existing behavior/output the PR
preserves relative to the mainline. It is an **LLM judgment**, not a measurement —
no scripts, no byte-diff, no pixel-diff. The writing agent reads the actual diff and
reasons to each verdict.

### Rules

1. **Baseline is explicit.** Compare the PR head against `master` (resolved via
   merge-base). Title the section with the reference, e.g.
   `## Similarity to master (vs master @ <sha>)`. Never report a number without
   stating what it is compared against. For a stacked PR chain (`A → B → C`), compare
   the *accumulated head* against master — reviewers see what actually lands on the
   mainline, not just this PR's own delta. If the PR's own delta is materially
   different from the cumulative tip, say so in one line.
2. **Axes are agent-chosen per diff.** Do NOT use a fixed axis list. Read the diff and
   pick the axes that are actually informative for this change. Examples of axes you
   may choose (add or drop as the diff demands):
   - **Visual / DOM** — UI-rendering source changed? (components, styles, markup)
   - **Report / output schema** — the persisted/emitted contract changed?
   - **Report values** — the data changed? (scores, costs, computed fields)
   - **Behavior / lifecycle** — interactions, status transitions, retry/abort/cancel?
   - **Config / infra** — CI, tooling, dependencies, deployment?
   - **Docs / ADR** — documentation-only, no runtime impact?
   Drop an axis that the diff doesn't touch rather than reporting a meaningless number.
   This keeps the report project-agnostic: it works for any repo, not just this one.
3. **Every verdict is an LLM judgment with a reason.** For each axis, give a similarity
   percentage AND a one-line justification grounded in the real diff (quote the files
   that moved). The % is an estimate, not a measurement — its authority comes from the
   reasoning, not the number.
4. **Honest vocabulary.** Use these labels per axis:
   - `unchanged (100%)` — the diff does not touch this axis.
   - `<N>%` — the diff partially changes this axis; justify the estimate.
   - `n/a` — the axis is nondeterministic output (e.g. LLM-generated prose) and a
     similarity % would be a fake precision. Say so explicitly.
   - `changed by design — see summary` — an intentional behavior/data change; link it
     to the Summary bullet, don't dress it as a similarity failure.
   Never invent a fake % for nondeterministic content. Never blend axes into one
   aggregate number.
5. **Label the report as a judgment.** One line at the end: "Similarity is an LLM
   assessment of the diff, not a CI gate or measurement." This prevents anyone from
   mistaking it for a hard verification.

### Template

```md
## Similarity to master (vs master @ <sha>)

This is an LLM judgment of the diff, not a measurement.

- **<Axis 1>**: <verdict> — <reason, quoting the diff>
- **<Axis 2>**: <verdict> — <reason>
- **<Axis 3>**: <verdict> — <reason>

Similarity is an LLM assessment of the diff, not a CI gate or measurement.
```

## Template (full body)

```md
Closes #<N>, #<M>

## Summary
- <what changed and why, 1-3 bullets>

## Similarity to master (vs master @ <sha>)
- **<Axis 1>**: <verdict> — <reason>
- **<Axis 2>**: <verdict> — <reason>

Similarity is an LLM assessment of the diff, not a CI gate or measurement.

## Test plan
- [ ] <how this was verified>

## QA Test Steps
1. <how qa test this>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
https://claude.ai/code/session_017QWhHHbUxYJ3kusvFbqUDu
```

## Example

```md
Closes #9, #10, #15, #16

## Summary
- primaryColor/welcomeMessage/avatarUrl wired into rendering per ADR-0007
- destroy() added for SPA cleanup
- #17 intentionally left open — deferred per ADR-0008, not part of this PR

## Similarity to master (vs master @ 1a2b3c4)
- **Visual / DOM**: unchanged (100%) — no .tsx/.css files in the diff.
- **Report values**: changed by design — color tokens and welcome copy differ; see Summary.
- **Config**: n/a — dependency/dep-only changes, no runtime surface moved.

Similarity is an LLM assessment of the diff, not a CI gate or measurement.

## Test plan
- [x] bun run typecheck passes
- [x] verified live in headless Chromium

🤖 Generated with [Claude Code](https://claude.com/claude-code)
https://claude.ai/code/session_017QWhHHbUxYJ3kusvFbqUDu
```
