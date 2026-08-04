# CF0 Canonical Artifact Restoration Plan

> **For OMP workers:** Restore only the four missing documentation artifacts; do not modify implementation code, dependency files, or issue metadata. Skip formatters, linters, and project-wide tests in worker tasks; the parent session owns final verification.

**Goal:** Restore the canonical CF0 decision/specification files referenced by issues #118, #127–#130, #141, and implementation tickets #142–#144 without inventing behavior beyond the resolved ticket decisions.

**Architecture:** Recreate two ADRs and two specs as source-of-truth documentation. ADR-0017 defines same-repository monorepo topology and Cloudflare deployment ownership; ADR-0018 defines the browser/Worker/Apps Script HTTP contract; Spec 073 classifies inherited HtmlService clauses; Spec 074 restates the preserved shell contract for Next.js/Cloudflare.

**Tech Stack:** Markdown, existing EFCC ADR/spec conventions, GitHub issue records as authoritative recovery sources.

## Global Constraints

- Preserve Google Sheets, Apps Script, server-side authorization, session, lock, audit, and domain decisions.
- Do not add implementation code, new APIs, Sheet columns, dependencies, or deployment configuration.
- Ground restored decisions in issue comments: #127, #128, #129, #130, and canonical Spec #141.
- Keep ADR status `Proposed` where repository policy requires deployed proof; distinguish decision records from implementation proof.
- Do not fabricate unavailable full historical text; where a source only gives a classification, state the classification and rationale explicitly.

## File Structure & Changes

- Create `docs/adr/0017-frontend-repo-rendering-and-cloudflare-deployment-boundary.md`: same-repo monorepo, Next.js static export, Cloudflare Workers static assets/API proxy, ownership, preview/promotion/rollback, and free-tier guardrail.
- Create `docs/adr/0018-frontend-http-boundary-auth-and-api-contract.md`: versioned RPC endpoint, header session transport, RFC 9457 errors, status remapping, retries, idempotency, correlation, and rate limiting.
- Create `docs/specs/073-htmlservice-spec-reconciliation-matrix.md`: document-level and clause-level PRESERVE/AMEND/SUPERSEDE matrix for the inherited ADR/spec set, including scanner and headless-auth findings.
- Create `docs/specs/074-cloudflare-frontend-shell.md`: canonical CF0 shell contract recovered from issue #141, including user stories, module structure, state machine, routing, HTTP client, session, Worker, accessibility, deployment, testing, and out-of-scope boundaries.

## What Already Exists

- `CONTEXT.md` records the CF0 frontier and references these canonical paths.
- `web/lib/api.ts`, `web/lib/session.ts`, `web/worker.ts`, and current tests implement portions of the contracts.
- Existing ADRs/specs 000–072 provide inherited terminology and domain authority; workers must link rather than rewrite them.
- Issue #141 contains the complete canonical Spec 074 body; issue comments #127/#128/#130 contain the resolved decision content and matrix summary.

## Not In Scope

- React, Worker, Apps Script, Sheet, test, package, or CI changes.
- Re-running or repairing the known Cloudflare Vitest-pool mismatch or existing `pnpm check` failures.
- Closing/editing GitHub issues, pushing branches, or creating a pull request.
- Reopening the scanner decision #136, backend CF1 #131, or downstream CF2 implementation.

## Parallelization / Worktree Strategy

The four files are independent creates with disjoint paths and can be restored in one parallel task batch. Agents must write only their named file and skip validation; the parent session reviews the combined documentation for cross-links and source fidelity afterward. Work stays in the user's current `feat/qr-scan` checkout because the explicit request is to repair this current folder and it is clean before the restoration.

---

### Task 1: Restore ADR-0017

**Files:** Create `docs/adr/0017-frontend-repo-rendering-and-cloudflare-deployment-boundary.md`.

**Source:** `issue://127`, especially the resolved comment; `issue://118` lines covering inherited decisions and CF0 frontier; existing ADR headers.

**Acceptance:** The file records same-repo monorepo (the separate `efcc-web` option is superseded), Next.js `output: 'export'`, Cloudflare Workers with static assets and `/api/*` proxy, shared ownership, branch previews, main promotion gate, instant rollback, passive free-tier monitoring, relationship to ADR-0007/ADR-0018, and no backend/domain migration claim.

### Task 2: Restore ADR-0018

**Files:** Create `docs/adr/0018-frontend-http-boundary-auth-and-api-contract.md`.

**Source:** `issue://128`, `issue://129`, `issue://118`, and current `web/lib/api.ts`/`web/worker.ts` contract names.

**Acceptance:** The file records `POST /api/v1/rpc`, `{action, params}`, Authorization and `X-Efcc-Session-Id` headers, anonymous Apps Script web-app access, same-origin Worker proxy, RFC 9457 Problem Details and RPC_CODES mapping, Worker JSON-body status remap, bounded retries, `Idempotency-Key` for mutations, `X-Request-Id` correlation, and session-keyed rate limiting. It distinguishes prototype proof from production CF1 implementation and avoids claiming code/deployment work for this ADR.

### Task 3: Restore Spec 073

**Files:** Create `docs/specs/073-htmlservice-spec-reconciliation-matrix.md`.

**Source:** `issue://130` resolved comment, current `docs/adr/`, current `docs/specs/`, and the issue #118 decision summary.

**Acceptance:** The matrix explicitly covers the inherited frontend/backend ADRs and domain/acceptance specs present in the repository, classifies transport/UI clauses as PRESERVE, AMEND, or SUPERSEDE, identifies ADR-0003/ADR-0008/spec 008 as wholesale superseded, preserves domain substrate, flags scanner mechanism work for #136, records the headless-auth implication of ADR-0018, and lists unresolved non-blocking threads. Do not claim a source was read if it is absent; identify any issue-only source as such.

### Task 4: Restore Spec 074

**Files:** Create `docs/specs/074-cloudflare-frontend-shell.md`.

**Source:** Exact body of `issue://141`, with links resolved relative to `docs/specs/` and `docs/adr/`.

**Acceptance:** Reproduce the canonical 33 user stories and all implementation/testing/out-of-scope sections from issue #141 without adding CF2–CF7 domain behavior or implementation claims.

## Final Verification

- Review all four files against their issue source and cross-link targets.
- Confirm all four previously missing paths exist and no unrelated files changed.
- Run `git diff --check` and a scripted link/path inventory; do not claim the broader code suite is green because the pre-existing web pool and lint failures are outside this documentation restoration.
