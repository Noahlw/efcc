<!--
Thank you for contributing. Read CONTRIBUTING.md before opening this PR:
  - Work in a dedicated branch/worktree, never directly on main.
  - Never commit or transmit secrets, credentials, or Google Sheet data.
  - Keep changes scoped to the linked issue; do not bundle unrelated work.
Keep this template's headings and fill in every section. Delete this comment block.
-->

## Summary

<!-- One or two sentences: what changes and why. Reference the issue(s) this closes. -->

Closes #<!-- issue number -->

## Scope boundary

<!-- What is explicitly in and out of scope for this change. -->

- **In scope:**
- **Out of scope:**

## Acceptance trace

<!-- Map each observable change to the evidence that proves it, tying back to the linked issue. -->

| Requirement | Evidence |
| --- | --- |
| <!-- e.g. Request accepts a valid date --> | <!-- link to test / screenshot / log --> |

## Verification commands

<!-- Exact commands run and their output. Paste the actual output, not "it passed". -->

```bash
pnpm run bootstrap && pnpm run verify
```

<!-- Add any additional commands you ran (e.g. `pnpm --dir web test:components`, `playwright test ...`). -->

**Local/manual smoke** (what you ran on your machine, not yet deployed):

<!-- **Official deployed evidence** (only if applicable — link to the deployed Worker/D1 or web export): -->

## Migration / deployment notes

<!-- Any schema, D1 migration, or deployment step required. If none, say "None — no migration or deployment step required." -->

## Safety confirmation

<!-- Required. Confirm no secrets, credentials, or Google Sheet data were exposed or requested. -->

- [ ] No secrets, credentials, or `.env*`/`.dev.vars*` values are included anywhere in this PR.
- [ ] No Google Sheet data or other production data was committed, logged, or uploaded.
- [ ] No request for credentials or secrets was added to this PR.
