# ADR-0031 — Dev-Testing Worker and E2E Deliverable

**Status:** accepted

## Decision

A standing **dev-testing worker** (`efcc-dev-testing.efcc-ggc.workers.dev`, D1 `efcc-dev-testing`) is the permanent local E2E target for the Programs stack. It is provisioned via local wrangler OAuth, not CI.

The Programs E2E suite is a **local, agent-runnable deliverable**: Playwright driven against the dev-testing worker with no secrets — `E2E_` accounts seeded in its D1, fixed dev-only credentials documented in the repo, not stored as secrets. It is **not** a GitHub CI gate.

**Ask-mechanic policy**: at completion of a spec/plan implementation, the agent MUST ask the user (question mechanic) whether to build and run the E2E before claiming done — no size heuristic; small changes may be skipped by user decision.

The `deployed-programs` CI job (`.github/workflows/e2e.yml`) was removed because it never ran and was "not real E2E".

## Context

The Programs stack previously wired its deployed E2E as a `workflow_dispatch` CI job gated on `PROGRAMS_*` secrets and an isolated `efcc-auth-*` acceptance host. That job never executed — the secrets and isolated host were never provisioned, so the gate existed in name only.

## Considered Options

- **CI-gated deployed Programs smoke** (keep the `deployed-programs` job) was rejected: it never ran, required disposable-secret choreography for every change, and duplicated what a standing dev target gives for free.
- **Dev-testing worker as the sole E2E target** was chosen: provisioned once via local wrangler OAuth, seeded `E2E_` accounts live in its D1, fixed dev-only credentials documented rather than secret-scoped, so any local agent session can build and run the suite on demand.

## Consequences

- E2E runs happen locally against the dev-testing worker; no CI job, no secrets, no workflow_dispatch choreography.
- Visual evidence is Playwright trace/screenshot artifacts; an agent-browser visual pass may run locally when UI quality is under review (the deployed boundary's Stateless-Wall blocks Orca on authenticated RPCs).
- "Done" for a spec/plan implementation now includes the ask-mechanic question, not an automatic E2E build — the user decides for small changes.
