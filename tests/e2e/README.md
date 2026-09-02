# Playwright end-to-end tests

The browser suites under `tests/e2e/` exercise the rebuilt Worker/D1 application, and none of them uploads code or mutates the production Sheet.

## Test ownership

Each Playwright config has a positive `testMatch`; suites must not cross loaders.

| Config | Command | Coverage |
| --- | --- | --- |
| `auth-d1.config.ts` | `pnpm exec playwright test -c tests/e2e/auth-d1.config.ts` | Cookie-only password login/logout and disposable legacy-PIN upgrade. |
| `programs-d1.config.ts` | `pnpm exec playwright test -c tests/e2e/programs-d1.config.ts` | PUI-01 Programs boundary, capability-shaped management entry, URL intent, and recovery at phone/desktop sizes. |
| `attendance-d1.config.ts` | `pnpm exec playwright test -c tests/e2e/attendance-d1.config.ts` | ATT-04 attendance flows against the real Worker API and browser UI. |
| `live-ui.config.ts` | `pnpm exec playwright test -c tests/e2e/live-ui.config.ts` | Rebuilt Next UI shell, Profile, Account Settings, approval flow, and responsive browser states. |
| `responsive.config.ts` | `pnpm test:shell-responsive` | Deterministic static-shell responsive/accessibility checks with an in-browser RPC stub. |
| `shell-geometry.config.ts` | `pnpm test:shell-geometry` | Pinned Chromium shell geometry at 320/390/600/799/800/1024/1440 CSS px (TK-09): critical anchors, no overflow/obstruction, numeric CSS-pixel evidence only (TK-12). |
| `role-hierarchy-geometry.config.ts` | `pnpm test:role-hierarchy-geometry` | #478 H-20 pinned hierarchy/list/detail/rename geometry at 320/390/600/799/800/1024/1440 CSS px; numeric CSS-pixel evidence only (no screenshots). |

`pnpm test:shell-responsive` builds the Next static export and serves it through `tests/e2e/serve-static.ts` on port `4173`. It runs the mobile and desktop projects without a Worker, D1, Google session, or network target.

`pnpm test:shell-geometry` is the pinned-width companion (TK-09): the same static-shell harness at 320, 390, 600, 799, 800, 1024, and 1440 CSS px. Both 799 and 800 are exercised so the 800px shell breakpoint is verified on each side. Evidence is numeric CSS pixels only — no screenshots, image snapshots, or pixel diffs (TK-12). Both suites run locally via `pnpm verify`; they are not part of the automatic CI gate (Fast CI is typecheck-only).

`pnpm test:role-hierarchy-geometry` builds the static export and runs the real category expand, detail, and rename controls at each pinned width. It asserts non-vacuous hierarchy anchors, 44px controls, no horizontal overflow, and phone dock clearance; the command is included in `pnpm verify` and is a local browser check, not part of the automatic CI gate.

The retired Apps Script `/exec` Playwright suite, Google storage-state capture helper, clasp deployment helper, `src/gas/`, and `tests/gas/` VM-harness were removed with the GAS retirement.

## Local-first run

The required acceptance target is local `wrangler dev` with local D1 at `http://127.0.0.1:8787`. On a fresh checkout, prepare the ignored local variables once:

```sh
cp web/.dev.vars.example web/.dev.vars
openssl rand -hex 32 # paste the value into EFCC_ACCESS_TOKEN_SECRET
```

Use two terminals:

```sh
# terminal 1
pnpm dev:local

# terminal 2
pnpm db:seed:local       # E2E_ accounts + disposable identity foundation
pnpm db:seed:disposable  # role-only rerun; --local and E2E_ rows only
pnpm db:seed:demo        # E2E_DEMO_ department, programs, and generated events
pnpm exec playwright test -c tests/e2e/programs-d1.config.ts
```

`pnpm dev:local` builds the Next static export and applies local migrations. `pnpm db:seed:local` is safe to rerun; it first resets only disposable `E2E_`/`E2E_DEMO_` domain rows, seeds the account fixtures, and then invokes the local-only `pnpm db:seed:disposable` identity seed. The identity seed is additive (`INSERT OR IGNORE`), contains only `E2E_DISPOSABLE_` rows, and never targets a remote or non-disposable database.

| Username | Credential | Seeded identity context |
| --- | --- | --- |
| `E2E_admin` | `E2E_admin!dev` | Protected Admin identity |
| `E2E_staff` | `E2E_staff!dev` | Assignable Staff identity |
| `E2E_member` | `E2E_member!dev` | Automatic `會友基礎` baseline |
| `E2E_legacy` | PIN `1234` (upgrade test) | Automatic `會友基礎` after upgrade |

The local auth suite defaults to those fixtures. The account seed resets `E2E_legacy` to its legacy-PIN state so the upgrade test can be rerun. The other D1 suites use the active three accounts by default; `attendance-d1` creates its own disposable domain rows for each run. `db:seed:demo` is local-only and refuses non-loopback targets; it creates one `E2E_DEMO_` department, four programs, and generated events for the recurring program.

The local stack reads `web/.dev.vars`. Start from `web/.dev.vars.example`; the local access-token secret is required for protected routes. Never put production credentials, cookies, or tokens in that file.

## Optional deployed smoke

Cloudflare deployment is optional operational evidence, not the repository `READY` gate. When an operator chooses to run it, override the relevant target with a fresh disposable Worker URL:

- `AUTH_TARGET_URL` for `auth-d1.config.ts` (`efcc-auth-*` or `efcc-dev-*` reserved host).
- `PROGRAMS_TARGET_URL` for `programs-d1.config.ts` and `attendance-d1.config.ts` (`efcc-auth-*` or `efcc-dev-*` reserved host).
- `AUTH_UI_TARGET_URL` for `live-ui.config.ts` (`efcc-auth-*` reserved host).

Remote overrides must be HTTPS, contain no credentials, and use only the allowlisted reserved namespaces enforced by each config. Remote runs require explicit disposable `E2E_` fixture variables; local defaults never spill into a remote target. The `deployed-auth` GitHub Actions job is `workflow_dispatch` only and remains fail-closed.

## Acceptance evidence

`tests/e2e/plan-doc-appender.ts` is a manual utility. Pass `--plan`, `--results`, `--heading`, and `--target-url` explicitly when recording a run; there is no automatic post-test hook. It sanitizes credentials from the recorded URL and replaces only the requested Markdown section.

Example:

```sh
pnpm exec tsx tests/e2e/plan-doc-appender.ts \
  --plan=docs/omp-plans/2026-08-11-pui-01-ticket-245.md \
  --results=tests/e2e/test-results/programs-d1-results.json \
  --heading="## Executed results — local Programs D1" \
  --target-url=http://127.0.0.1:8787
```

## Phase F release evidence

Phase F (#494/#495) keeps the release evidence numeric and local. Geometry suites attach UTF-8 JSON through Playwright `testInfo.attach`; their configs record `metadata.phaseFTargetUrl`, and the renderer rejects image attachments, missing target metadata, and non-loopback target URLs:

```sh
pnpm verify:contraction
pnpm exec tsx tests/e2e/render-phase-f-evidence.ts \
  --input=tests/e2e/test-results/phase-f \
  --json=docs/qa/2026-09-01-s4-phase-f-release-evidence.json \
  --html=docs/qa/2026-09-01-s4-phase-f-release-evidence.html
pnpm exec tsx tests/e2e/plan-doc-appender.ts \
  --plan=docs/specs/s4-phase-f-acceptance-trace.md \
  --results=tests/e2e/test-results/phase-f/phase-d-programs-geometry/results.json \
  --heading="## Executed results" \
  --target-url=http://127.0.0.1:8787
```

The per-suite reports live under `tests/e2e/test-results/phase-f/<suite>/results.json`. The rendered JSON/HTML, the acceptance trace, `docs/qa/2026-09-01-s4-phase-f-release-gate.md`, and `docs/qa/2026-09-01-s4-phase-f-audit-dispositions.md` are the reviewable outputs. Numeric evidence proves DOM/API geometry and state only; it does not claim human keyboard/AT, real-device camera/touch, native print-preview, forced-colors, zoom/reflow, or text-spacing outcomes.

All Phase F automated runs use `http://127.0.0.1:8787`, local D1, pinned Chromium, and disposable `E2E_`, `E2E_DEMO_`, or `E2E_DISPOSABLE_` fixtures. They never mutate Apps Script, Google Sheets, Cloudflare production, remote D1, or a non-disposable account. A complete local matrix failure remains a release blocker; unavailable human rows stay `UNCLAIMED`.

## Static-shell suite

`pnpm test:shell-responsive` builds the Next static export and serves it through `tests/e2e/serve-static.ts` on port `4173`. It runs the mobile and desktop projects without a Worker, D1, Google session, or network target.

## Implemented-scope rule

Only implemented behavior may be asserted as acceptance coverage. The D1 suites exercise the Worker routes that exist in this branch; unfinished domain capabilities remain planned in the linked specification/ticket.
