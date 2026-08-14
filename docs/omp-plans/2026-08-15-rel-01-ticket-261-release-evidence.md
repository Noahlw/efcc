# REL-01 (#261): Release evidence — rollback, seeding/recovery, deployment ownership, deferred work

Companion to `2026-08-15-rel-01-ticket-261-acceptance-trace.md` (written first, per the
Headless-Gate rule). This doc satisfies #261's AC6 (CI/deployment evidence mapping to
Spec #241) and AC7 (rollback, seeding/recovery, ownership, deferred work documented).

## 1. Rollback plan

The production path is Cloudflare Worker (`efcc-prototype-129` today; a real deploy
target gets a fresh name, see §3) + static Next export served from `ASSETS` + D1
(`efcc-identity`). Rollback has two independent halves:

- **Worker/static rollback.** Cloudflare Workers keeps prior deployments; `wrangler
  rollback [deployment-id]` (or the dashboard's "Rollback" action) reverts the Worker
  script and its bundled static assets to the previous deployment atomically. No D1
  migration is triggered by a rollback — this only affects code/asset serving.
- **D1 migration rollback.** Every migration under `web/migrations/` is additive
  (`CREATE TABLE`, `ALTER TABLE ... ADD COLUMN`, new indexes) — none drop or destructively
  rewrite existing columns. This means rolling the Worker back to a previous version
  while a newer migration has already applied is safe: older code simply does not read
  the new columns/tables. There is no destructive migration in this vertical's history
  that would require a compensating down-migration.
- **Git rollback.** Because this ticket's stack is never merged automatically (fail-closed
  per the stack skill), rollback at the source level is: do not merge the pending PR, or
  `git revert` the merge commit if it was already merged before a defect surfaced.

## 2. Data seeding and recovery

Already-established, reused as-is for this ticket's own verification (not reinvented):

- `pnpm dev:local` — builds the static Next export, applies all D1 migrations locally,
  and starts `wrangler dev` on `127.0.0.1:8787`.
- `pnpm db:seed:local` — resets and seeds the disposable `E2E_` account fixtures
  (`E2E_admin` / `E2E_staff` / `E2E_member`, `tests/e2e/seed-dev-accounts.ts`) into the
  local D1. Safe to run repeatedly; it resets first.
- `pnpm db:seed:demo` — seeds the `E2E_DEMO_` domain-walkthrough fixtures (departments,
  programs, events) consumed by `tests/e2e/programs-d1.test.ts`.
- Recovery from a corrupted local D1 state: delete `web/.wrangler/state/v3/d1` and
  re-run `pnpm dev:local` (migrations reapply from scratch) followed by the seed
  commands above.
- Per this repo's Database Safety rule: only `E2E_`/`E2E_DEMO_`-prefixed fixtures are
  ever reset by these scripts, and only against local/CI D1 — Apps Script, Google
  Sheets, and any deployed production D1 are never touched by this tooling.

## 3. Deployment ownership and runbook (operator-executed)

**This agent did not, and will not, run `wrangler deploy`.** Reasons, verified before
writing this doc (see the acceptance-trace doc §1):
- `web/wrangler.jsonc`'s `name` is still `"efcc-prototype-129"` — the exact stale host
  this repo's `AGENTS.md` Headless-Gate rule names as forbidden to redeploy.
- `d1_databases[0].database_id` and `ratelimits[0].namespace_id` are placeholders;
  deploying with them as-is would either fail or point an "isolated preview" at the
  same D1 used by local dev, breaking the "disposable D1" requirement.
- No Cloudflare account/API token is available to this agent, and a real cloud deploy
  is a consequential external-service action requiring explicit operator authorization
  regardless of credential availability.

**Runbook for the operator to produce actual deployed-Cloudflare evidence:**
1. `wrangler login` (or set `CLOUDFLARE_API_TOKEN`) with an account that owns a fresh
   `efcc-auth-*` or `efcc-dev-*` Worker name — never `efcc-prototype-129`.
2. Create a new, isolated D1 database (`wrangler d1 create <fresh-name>`) — do not reuse
   `ae437eac-c6ef-4835-bfe8-13c61b5cf586` (the shared local/dev database id).
3. Create a fresh Rate Limiting namespace id for `ratelimits[0].namespace_id`.
4. Copy `web/wrangler.jsonc`, set `name`/`database_id`/`namespace_id` to the values from
   steps 1-3 (do not edit the checked-in file; deploy from a local, gitignored copy or
   pass overrides via `wrangler deploy --name ... `).
5. `wrangler secret put EFCC_ACCESS_TOKEN_SECRET` (a fresh disposable secret, never the
   local `.dev.vars` value).
6. `pnpm --dir web build && wrangler deploy --config <the-copy-from-step-4>`.
7. Apply migrations to the new D1: `wrangler d1 migrations apply <fresh-db> --remote`.
8. Seed with the same `E2E_`/`E2E_DEMO_` scripts, pointed at the deployed URL via
   `PROGRAMS_TARGET_URL=https://<fresh-host>.workers.dev pnpm exec playwright test -c
   tests/e2e/programs-vertical-proof.config.ts` (and the three new suites from this
   ticket) to reproduce this ticket's local-proof results against the real deployment.
9. Tear the isolated preview down (`wrangler delete`, `wrangler d1 delete`) once the
   evidence is captured — it is disposable, not a new long-lived environment.

Ownership: whoever holds Cloudflare account credentials for this project. This agent's
role ends at producing a runbook precise enough that no additional discovery is needed.

## 4. Deferred / optional work

| Item | Why deferred | Who unblocks it |
|---|---|---|
| Actual Cloudflare preview deployment execution | Requires operator-owned credentials and config values (§3); a real cloud deploy is a consequential external action needing explicit authorization | Operator, via the §3 runbook |
| Physical-device camera capture + real QR scan | No physical hardware available to this agent; ADR-0029 and this session's established precedent treat this as manual operator evidence, never fabricated | Operator, with a real phone against the deployed preview from §3 |
| Synthetic-video QR decode (software-only, no physical device) | `BarcodeDetector` has no custom decode logic to validate; existing coverage (component mocks + manual-code E2E path) already proves the surrounding state machine; building a Y4M video with an embedded QR pattern is real infra effort for marginal incremental confidence | Optional follow-up ticket if ever prioritized — not blocking #261 |
| Retirement of legacy/prototype deployments and artifacts | #261 and Spec #241 Implementation Decision #29 both require retirement only after explicit target verification and operator approval — never performed speculatively during feature construction | Operator decision, after reviewing this ticket's evidence |

## 5. Final verification results (this ticket, local `wrangler dev` + D1)

| Suite | Tests | Pass | Run-time | Notes |
|---|---|---|---|---|
| `programs-vertical-proof` (PR #288) — re-verified after this ticket's changes | 30 | 30 | 29.4s (desktop project isolated; combined run hits a pre-existing miniflare inspector-proxy ~45s timeout — not a regression) | 15 phone-375x667 + 15 desktop-1280x720 across all 4 tiers |
| `programs-resilience-proof` (NEW, Slice C) | 8 | 8 | 13.2s | T1 enrollment network failure, T2 scanner offline, T3 mid-flow viewport, T4 mid-mutation session expiry — phone + desktop |
| `programs-capability-matrix-proof` (NEW, Slice B) | 3 | 3 | 0.8s | T1 Program-Leader cross-Program denial + positive control, T2 Department-Manager cross-Department denial + Staff role-global breadth (documented discrepancy), T3 Staff/Admin role-global PATCH success on un-granted Program |
| `programs-device-proof` (NEW, Slice A) | 2 | 2 | 5.4s | T1 real-browser `getUserMedia` → `<video>` (`readyState: 4, 640×480, playing`), T2 reduced-motion Event Undo (`matchMedia` + computed `transitionDuration: 0s`) |
| **Total** | **43** | **43** | | |

All new suites prove the three genuine acceptance gaps for #261 that no prior test
covered (cross-scope direct-request denial, real-browser camera stream binding,
mid-flow network/viewport/session resilience). Already-proven coverage from
#245–#260 and PR #288 is cited in the testing-decisions matrix, not re-run here.

Typecheck: `pnpm typecheck` (root + `tests/e2e` + `web/`) — 0 errors.
`ultracite check` — all matched files correctly formatted.
