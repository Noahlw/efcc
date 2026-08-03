# Frontend Migration Effort Analysis & GitHub Issue Breakdown

**Date:** 2026-08-01
**Target:** Migrate EFCC's FRONTEND to **React / Next.js hosted on Cloudflare**, keeping
Apps Script + Google Sheets as the backend/DB. Tracking via **GitHub Issues**.
**Team:** 2 volunteers (part-time). **Prior art:** `docs/wayfinder/002-migration-playbook.md`
(React-inside-Apps-Script, retired) and `docs/adr/0007` (vanilla, current).

---

## TL;DR

1. **React is viable this time because ADR-0007's two killers don't apply on Cloudflare:**
   the 5 MB GAS project limit and the singlefile-inlining constraint both disappear when
   the bundle is served as static assets instead of pushed via `clasp`. Only the third
   ADR-0007 concern survives - **toolchain burden on a volunteer team** - and that is the
   real effort/risk, not the framework choice.
2. **Migration scope (parity): ~3,710 lines of vanilla frontend to port** (the live
   controller `shell-session.js.html` is 2,671 of those) **+ a backend dispatch rewrite**
   (`google.script.run` -> HTTP `/exec` JSON) **+ the mandatory CORS proxy**. The ~2,809
   lines of `.gs` backend logic STAY. Estimated **~27-41 volunteer-days** for a 2-person
   team (parity only).
3. **Repo recommendation: SEPARATE repo for the frontend** (`efcc-web`). The frontend has
   a wholly different toolchain/deploy (Next.js + Cloudflare) from the backend (clasp +
   Apps Script). Backend stays in the current repo. E2E tests move to the frontend repo.
4. **Use Next.js `output: 'export'` (static) + a Pages Function CORS proxy** - this keeps
   100% of member page traffic in Cloudflare's free unlimited static pool (per the cost
   model); SSR-on-Workers would push all traffic into the billable 100k/day bucket.
5. **22 GitHub Issues across 7 milestones** below, issue-ready. Unbuilt sections (Events,
   Care, Permissions, registration, event/enrollment mgmt) are GREENFIELD, not migration -
   deferred to a post-migration milestone.

---

## 1. The ADR-0007 tension (read first)

ADR-0007 retired React for three reasons. Two are voided by Cloudflare hosting; one is not.

| ADR-0007 reason | Applies on Cloudflare? | Why |
|---|---|---|
| 5 MB GAS project limit (bundle inlined into Apps Script) | **No** | Static assets served by Cloudflare; nothing inlined via `clasp`. No ceiling. |
| Singlefile build artifact (GAS has no static server) | **No** | Cloudflare IS the static server. Normal hashed multi-file bundles work. |
| Toolchain foreign to Apps Script maintainers | **Yes** | A successor volunteer must now span Next.js + Cloudflare + the CORS proxy + Apps Script. This is the sustainability risk from the cost/sustainability report, restated. |

**Implication:** the decision to use React is defensible *if* the team accepts the toolchain-
burden tradeoff (documented in the sustainability report). Recommend recording a new ADR
(ADR-0017 or similar) that explicitly supersedes ADR-0007 for the frontend layer and records
this reasoning - otherwise the repo's own decision record contradicts the migration.

---

## 2. Migration scope (grounded in `src/gas/`)

### Built (must reach parity)
| Section / capability | Backend RPC | Frontend | Port effort |
|---|---|---|---|
| Login / PIN auth | `api_loginUser` | view-login.html | Medium |
| Session restore / logout | `api_restoreApp`, `api_logoutUser` | shell-session | Medium |
| Section auth + nav | `api_authorizedNavigate` | shell-session | Medium |
| Profile | (bootstrap data) | shell-session | Low |
| Programs (read) | `api_getPrograms` | shell-session | Medium |
| Scanner: event picker | `api_getScannerEvents` | shell-session | Medium |
| Scanner: check-in + external bridge | `api_qrCheckIn` | shell-session + external window (ADR-0015) | **High** |
| Form guard / safe render | - | form-guard.js.html (274) | Medium |
| Demo form (idempotency) | `api_submitDemoTaskForm` | shell-session | Low |

### NOT built (greenfield - NOT migration, defer)
Events section content, Care dashboard, Permissions section, member registration UI, event
management UI, enrollment management UI. (Repositories exist; no `api_` wrappers for these
except as noted.) Build these natively in React after parity - do not fold into the
migration estimate.

### Sizing
- **Frontend to port: ~3,710 lines** - `shell-session.js.html` (2,671), `styles.html` (640),
  `form-guard.js.html` (274), `view-login.html` (40), `App.html` (30), `shell.js.html` (43).
- **Backend stays: ~2,809 lines** of `.gs` (API + 7 repositories). Only the **dispatch
  layer** changes: `doGet`/`doPost` must branch on action/path and return
  `ContentService.createTextOutput(JSON)` instead of `HtmlService`.

---

## 3. Effort by workstream (rough, volunteer-days)

A "volunteer-day" = one solid half-day of focused work. Ranges reflect uncertainty.
2-person team; many items parallelizable.

| # | Workstream | Effort | Notes |
|---|---|---|---|
| WS1 | Repo + Next.js scaffold + Cloudflare deploy + CORS proxy | 3-5 | The proxy is mandatory (Apps Script can't emit CORS headers). |
| WS2 | Backend HTTP dispatch rewrite (`google.script.run` -> `/exec` JSON) + contract doc | 4-6 | Largest backend piece; reverses ADR-0003's "no REST/CORS" advantage. |
| WS3 | Auth transport: PIN/session HMAC token over HTTP (ADR-0011 model) | 2-3 | Token already bearer-style; translates cleanly. |
| WS4 | Port shell + state machine + login + profile | 5-8 | 2,671-line controller is the bulk. |
| WS5 | Port Programs + Scanner (incl. external scanner postMessage bridge) | 5-7 | Scanner bridge (ADR-0015) is the trickiest single item. |
| WS6 | Form guard + RPC-error -> HTTP-status mapping + recovery UX | 2-3 | |
| WS7 | Test migration (rebuild vanilla FE unit tests; retarget E2E; keep backend unit tests) | 4-6 | E2E is largely reusable - just retarget + update auth. |
| WS8 | CI/CD + production cutover + smoke test | 2-3 | |
| | **Parity total** | **27-41 vol-days** | ~3-5 weeks focused, longer part-time. |

Greenfield sections (Events/Care/Permissions/registration/mgmt): separate estimate, ~10+ days,
NOT in the migration scope above.

---

## 4. Repo strategy recommendation: SEPARATE repo

**Recommendation: create a new `efcc-web` repo for the React/Next.js frontend.** Backend
stays in the current `EFCC-dev` repo (clasp-managed Apps Script).

| Factor | Separate repo | Monorepo (same repo) |
|---|---|---|
| Toolchain clash (Next.js/npm vs clasp/Apps Script) | Clean separation | Two build systems in one repo |
| CI (current precheck.yml/e2e.yml are clasp-oriented) | Each repo has fitting CI | Must merge divergent CI |
| Cloudflare deploy lives with frontend | Yes | Mixed concerns |
| API contract sync | Needs a versioned contract doc | Atomic commits (but Apps Script can't consume npm types anyway) |
| Issue/PR flow (you chose GitHub Issues) | Clean tracker on frontend repo | Mixed backend/frontend issues |

**Contract sync (the one real cost of separating):** Apps Script `.gs` cannot `npm install`
a shared types package, so the API contract (AuthenticatedBootstrap DTO, `RPC_CODES`,
`api_*` signatures) must be kept in sync manually via a **versioned contract document**
committed to BOTH repos (e.g. `API_CONTRACT.md` + a generated `types.ts` in the frontend
repo). CI check: frontend's `types.ts` hash matches the contract doc. This is the same
SECTION_KEYS duplication pattern CONTEXT.md already documents - just formalized.

**Test placement:** backend unit tests (`tests/gas/*.test.js`, 14 files) STAY in the current
repo (they test `.gs` logic that isn't changing). E2E tests (`tests/e2e/*`) MOVE to the
frontend repo and retarget to the Cloudflare URL. The few vanilla-frontend unit tests
(`shell-session.test.js`, `app-shell.contract.test.js`, `role-navigation.test.js`) are
replaced by React component tests in the frontend repo.

---

## 5. GitHub Issue breakdown (issue-ready)

**Labels:** `migration`, plus `frontend` / `backend` / `infra` / `proxy` / `auth` /
`scanner` / `tests` / `ci` / `contract` / `blocker`.
**Milestones** below map to GitHub Milestones. Dependencies noted as "blocks"/"blocked by".

### Milestone 0 - Foundation
- **[M0-1] Create `efcc-web` repo + Next.js (static export) scaffold** (`infra`, `frontend`)
  - Next.js with `output: 'export'`; TS; ESLint/Prettier; dir structure (`app/` or `pages/`,
    `components/`, `lib/api/`, `lib/state/`). Mirror domain types from the contract.
  - Blocks: M0-2, M2-1.
- **[M0-2] Cloudflare Pages deploy + mandatory CORS proxy** (`infra`, `proxy`, `blocker`)
  - Pages project, preview + prod envs. **Pages Function** `/api/[action]` that proxies to
    the Apps Script `/exec` URL, adds `Access-Control-Allow-Origin`, handles OPTIONS
    preflight. Server-side `fetch` (not subject to CORS). This is the single point of
    failure - document + test it. (Per cost model: counts against 100k/day free, ~1.2% at
    max.)
  - Blocked by: M0-1. Blocks: everything in M2+.
- **[M0-3] API contract document + generated `types.ts`** (`contract`)
  - Versioned `API_CONTRACT.md` (AuthenticatedBootstrap, `RPC_CODES`, every `api_*`
    signature, error->HTTP-status mapping). Generated `src/types.ts` in frontend. Commit
    doc to BOTH repos. CI hash check.
  - Blocks: M1-1, M2-1.

### Milestone 1 - Backend HTTP API (in current `EFCC-dev` repo)
- **[M1-1] Rewrite Apps Script dispatch: `doGet`/`doPost` -> JSON over `/exec`** (`backend`, `blocker`)
  - Branch on `e.pathInfo`/`action` param; route to existing `api_*`; return
    `ContentService.createTextOutput(JSON.stringify(...)).setMimeType(JSON)`. Reuse existing
    `api_*` bodies + `RpcSuccess`/`RpcFailure` envelope. Map `RPC_CODES` -> HTTP status.
  - Blocked by: M0-3. Blocks: M2-1.
- **[M1-2] Confirm/fix `webapp.access = ANYONE_ANONYMOUS`** (`backend`, `auth`, `blocker`)
  - CONTEXT.md says `ANYONE`; PIN design needs `ANYONE_ANONYMOUS` (else `fetch()` gets a
    Google OAuth redirect, not JSON). Verify live deployment; fix + redeploy.
  - Blocks: M0-2 (proxy can't work without it).

### Milestone 2 - Auth + Shell + Profile (parity)
- **[M2-1] Port app state machine + shell/nav** (`frontend`) - BOOTING->SIGNED_OUT->
  AUTHENTICATING/RESTORING->LOADING_SECTION->READY + RECOVERABLE_ERROR; phone bottom nav +
  desktop rail; `localStorage` session key. Port of `shell-session.js.html` core.
  - Blocked by: M0-2, M1-1.
- **[M2-2] Login view (PIN) over HTTP** (`frontend`, `auth`) - username + 4-digit PIN;
  calls `/api/loginUser` via proxy; stores session token.
- **[M2-3] Session restore + logout over HTTP** (`frontend`, `auth`) - `/api/restoreApp`,
  `/api/logoutUser`; HMAC token in header (ADR-0011 model).
- **[M2-4] Profile section parity** (`frontend`) - from AuthenticatedBootstrap.

### Milestone 3 - Programs + Scanner (parity)
- **[M3-1] Programs section parity** (`frontend`) - `/api/getPrograms`.
- **[M3-2] Scanner: event picker** (`frontend`, `scanner`) - `/api/getScannerEvents`,
  capability-filtered event list.
- **[M3-3] Scanner bridge + check-in** (`frontend`, `scanner`, `blocker`) - external
  scanner window (`noahwong-hue.github.io/efcc-scanner`) + `postMessage` bridge + `/api/qrCheckIn`
  (ADR-0015). Trickiest item - getUserMedia lives in the external window; result flows back.
  Includes duplicate/quiet-success, NOT_ENROLLED, MEMBER_INACTIVE error UX.

### Milestone 4 - Form guard + error/recovery
- **[M4-1] Port form-guard state machine + safe rendering** (`frontend`) - port of
  `form-guard.js.html` (274 lines); discard-confirmation, draft lifecycle.
- **[M4-2] RPC error envelope -> HTTP status mapping + recoverable-error UX** (`frontend`)
  - business errors (`AUTH_REQUIRED`, `FORBIDDEN`, `VALIDATION`, `BUSY`...) to UI states;
  session-expiry re-login flow.

### Milestone 5 - Tests
- **[M5-1] Replace vanilla FE unit tests with React component tests** (`tests`, `frontend`)
  - Vitest + RTL; covers state machine, login, nav, sections. Replaces
  `shell-session.test.js`, `app-shell.contract.test.js`, `role-navigation.test.js`.
- **[M5-2] Retarget E2E (Playwright) to Cloudflare URL + PIN-over-HTTP auth** (`tests`)
  - Move `tests/e2e/*` to frontend repo; update `auth.ts` storage-state capture for HTTP
  token; role-matrix, form-protection, nested-task-navigation, deploy-acceptance.
- **[M5-3] Backend: keep unit tests + add HTTP dispatch tests** (`tests`, `backend`) - the
  14 `tests/gas` files stay; add dispatch-routing + CORS/status-mapping tests.

### Milestone 6 - CI/CD + cutover
- **[M6-1] Frontend CI (lint/typecheck/test/build/deploy)** (`ci`) - GitHub Actions on
  push/PR; deploy preview on PR, prod on main.
- **[M6-2] E2E pipeline against deployed Cloudflare + `/exec`** (`ci`, `tests`) - Headless-
  Gate (AGENTS.md): acceptance trace BEFORE cutover; 100% pass on fresh deploy.
- **[M6-3] Production cutover + smoke test + retire vanilla frontend** (`infra`, `blocker`)
  - Flip DNS/links to Cloudflare URL; fresh-deploy smoke test; archive `src/gas/*.html`
  frontend (keep `.gs` backend); record ADR superseding ADR-0007.

### (Deferred) Milestone 7 - Greenfield sections
Events, Care, Permissions, member registration, event/enrollment management - built natively
in React, estimated separately (~10+ days). Not part of migration parity.

---

## 6. Risks (ranked)

1. **Scanner bridge regression (M3-3)** - the external-origin `postMessage` + `getUserMedia`
   pattern is the most fragile piece; a CORS/proxy misstep breaks check-in. Mitigate: port
   it first with a dedicated E2E.
2. **Contract drift across two repos** - mitigated by M0-3 versioned contract + CI hash check.
3. **`webapp.access` misconfiguration (M1-2)** - if left `ANYONE`, the whole proxy returns
   OAuth redirects. Blocker; verify before any frontend wiring.
4. **Toolchain burden on volunteers** (ADR-0007 survivor) - mitigated by docs + the
   cutover leaving the backend in a familiar place.
5. **CORS proxy as SPOF** - single point of failure for the entire frontend; document +
   monitor + keep a fallback.

---

## 7. To file these as GitHub Issues

The new `efcc-web` repo must exist first (M0-1). Once created and `gh` is authenticated, I
can file all 22 issues with milestones + labels via `gh issue create` / `gh api` in one
batch. Confirm: (a) the new repo name, (b) whether to create milestones + labels first, and
(c) whether the M1 backend issues should file against the current `EFCC-dev` repo instead
(since that work lives there).

## Assumptions
- Next.js static export (not SSR-on-Workers) to keep traffic in Cloudflare's free static pool.
- E2E tests move to the frontend repo; backend unit tests stay.
- Greenfield sections are out of migration scope.
- Effort estimates are planning-grade for a 2-volunteer, part-time team.
