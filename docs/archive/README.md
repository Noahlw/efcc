# docs/archive — Retired working documents

Historical working documents kept for provenance. Everything here is
**read-only reference material**: it is not part of the active
architecture, and no decision in it is current authority unless a
surviving ADR/spec says so.

## Contents

- `scratch/` — the former `.scratch/` directory: planning artifacts from
  the SPA-rebuild (vanilla-restructure, spa-rebuild, efcc-webapp-migration)
  and the backend smoke harness (`task3-backend-smoke.cjs`,
  `review-fixes-backend-smoke.cjs`). These predate the Cloudflare
  Worker + D1 architecture (ADR-0017/0018/0020–0022). Kept so the
  decision trail behind the current specs remains greppable.

## What was removed

- `memory/ceo-review-2026-07-31-e2e-pipeline-repair.md` — deleted
  2026-08-06. Its 8 decisions survive in
  `docs/superpowers/plans/2026-07-31-e2e-pipeline-repair.md`
  (4 implemented in code; 4 unimplemented — fixture-reset, `E2E_`-prefixed
  fixtures, smart teardown, setup/proxy deployment smoke — preserved
  there as design).