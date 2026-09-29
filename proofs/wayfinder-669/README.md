# EFCC Wayfinder #669: disposable runtime and D1 proof

This branch is a **throwaway local proof**, not a migration PR. It uses synthetic `U-PROOF` data, a public test signing string, dummy D1 IDs, and local Wrangler state only. Do not deploy it or use its login endpoint as application auth.

## Scope and pins

- Base: `origin/main@8bcbf45239cc2a1a17807fd2d3a5e521119cf8ab` after merged foundation PRs #684/#685 and Dependabot #691. Branch: `proof/efcc-runtime-drizzle-669`; scratch worktree: `/tmp/efcc-proof-669`.
- Node 22.23.2; pnpm 11.7.0; React/DOM 19.2.8; Next 16.2.12; Vite 8.2.0; React Vite plugin 6.0.5; TanStack Router 1.170.40, Query 5.104.0, Start 1.168.59, Router plugin 1.168.41; Cloudflare Vite plugin 1.62.0, Wrangler 4.143.0, Workers types 5.20260929.1; Drizzle ORM 0.45.3 and Kit 0.31.11. React types were aligned at 19.3.0 after an initial duplicate-type failure.
- Three candidate shapes: existing Next static export with Query in a route (`web/app/proof-query`); Router/Query SPA with Vite and the existing Worker; Start SSR with the Cloudflare Vite plugin and local D1 binding. All read an authenticated Home row and conditionally publish a version with an audit.
- Only local Worker/D1/Playwright; no account access, remote D1, member data, Apps Script/Sheets mutation, deployment, or provider spend. Stop after this one slice; the architecture decision belongs to #670.

## Reproduction and observed result

From the scratch worktree root:

```sh
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install --frozen-lockfile
pnpm build
pnpm --filter web test:storybook
pnpm peers check
```

Frozen install passed. The unmodified base Next build passed with 18 static routes in 54.190 seconds; the scratch Next+Query build passed with 20 static routes. The inherited Storybook result was 92 passed and four known Programs material-state interaction failures, already recorded on #685. `pnpm peers check` reports the inherited #691 mismatch: `@vitest/browser` 5.0.2 against Storybook addon-vitest 10.6.0's `^3 || ^4` peer. This is not a new runtime candidate result. The first scratch Next build failed because the proof package's React types were 19.2.2 while web resolved 19.3.0; aligning both to 19.3.0 made the full static build pass. No Storybook baseline or test rule was changed. The first commit-hook governance run caught native buttons in the scratch Next page; replacing them with the existing UI `Button` made `pnpm test:governance` pass 19/19. The pre-commit aggregate was not claimed green because the inherited Storybook failures remain.

From `proofs/wayfinder-669`:

```sh
./node_modules/.bin/tsc --noEmit -p tsconfig.json
pnpm spa:build
pnpm start:build
```

All passed. The small SPA build transformed 148 modules in 417 ms; the small Start build transformed 153 client and 321 server modules in 1.01 seconds. These deliberately tiny builds **cannot** be compared as performance scores against EFCC's full Next build. A scan of Start's built client JavaScript found no `cloudflare:workers` binding, proof signing string, or Home `UPDATE` SQL; those appear only in its server output. This is a bounded bundle scan, not a complete secret-leak audit.

The following local commands recreate an independent D1 database and test the audited write. Use an empty `.wrangler/replay` directory for the fixed version-1/version-2 D1 script:

```sh
./node_modules/.bin/wrangler d1 migrations apply efcc-proof-669 --local --persist-to ./.wrangler/replay --config wrangler.d1.jsonc
./node_modules/.bin/wrangler dev --config wrangler.d1.jsonc --local --persist-to ./.wrangler/replay --ip 127.0.0.1 --port 8800
PROOF_ORIGIN=http://127.0.0.1:8800 node scripts/probe-d1.mjs
```

`probe-d1` passed against real local D1: zero-row publish returned 409/no audit; two concurrent version-1 publishes produced one 200/one 409 and one SUCCESS audit; duplicate publish returned 409/no new audit; a deliberately duplicate audit ID caused 503 and rolled the Home update back; version-2 retry succeeded with one audit; audit UPDATE and an invalid Home foreign key were rejected. Final state: two Published rows and two SUCCESS audits. `scripts/probe-auth.mjs` passed the production HMAC/session helper seam: unauthenticated 401, login 200, authenticated Home 200, logout 204, reused revoked cookie 401. The login route itself is synthetic.

The generated/reviewed SQL is in `drizzle/0000*` and `0002*`; immutable audit triggers and the descending Home index are in the reviewed custom `0001*` SQL. All three migrations ran through **one Wrangler `d1_migrations` ledger**. Fresh local inspection found three ledger entries, zero Drizzle ledger tables, five STRICT tables, five Home foreign keys, and two audit immutability triggers. Drizzle Kit did not emit EFCC's `STRICT` suffix; it was added to the reviewed generated SQL before local application. Its SQLite schema API did not express this proof's descending index, so that index remains raw SQL. This is a real migration-review requirement, not an automatic full-schema translation. Existing production migrations were not replaced.

Browser proof commands after applying the same local migrations and starting each candidate:

```sh
# Next static assets and API from one local Worker, port 8799:
./node_modules/.bin/wrangler dev --config wrangler.d1.jsonc --local --persist-to ./.wrangler/state --ip 127.0.0.1 --port 8799
node scripts/probe-next.mjs

# SPA local edit loop: Vite on 4180 proxies API to the local Worker on 8799.
pnpm spa:dev --host 127.0.0.1
node scripts/probe-spa.mjs

# SPA production build from one Worker origin, port 8801, using wrangler.spa.jsonc.
./node_modules/.bin/wrangler d1 migrations apply efcc-proof-669-spa --local --persist-to ./.wrangler/spa --config wrangler.spa.jsonc
./node_modules/.bin/wrangler dev --config wrangler.spa.jsonc --local --persist-to ./.wrangler/spa --ip 127.0.0.1 --port 8801
curl -X POST http://127.0.0.1:8801/seed
PROOF_UI_ORIGIN=http://127.0.0.1:8801 PROOF_WORKER_ORIGIN=http://127.0.0.1:8801 node scripts/probe-spa.mjs

# Start dev with its own local D1 binding and the same migration SQL:
# From start/: ../node_modules/.bin/wrangler d1 migrations apply efcc-proof-669-start --local --persist-to ./.wrangler/state
pnpm start:dev --host 127.0.0.1
node scripts/probe-start.mjs

# Start built preview with the same local-only rules:
# From start/: ../node_modules/.bin/vite preview --host 127.0.0.1 --port 8802
PROOF_START_ORIGIN=http://127.0.0.1:8802 node scripts/probe-start.mjs
```

Next static, SPA Vite dev, SPA built Worker assets, Start Vite dev, and Start built preview all passed browser-visible Home/auth/publish/logout, URL and Back navigation, and heading focus checks. Direct `/about` reload on the built SPA returned 200 and retained the route. The Start dev proof required a hydration-ready marker before clicking its server-rendered buttons; an early click before hydration was inert in the cold local session. The route's heading-focus behavior also needed an effect after page commit.

For each of Next, SPA, and Start, `node scripts/probe-uncertain.mjs <name>` forwarded one publish to the server and deliberately lost its response. All three showed an unknown-outcome message, made **one** request, had **one** SUCCESS audit for the new version, and showed Published after a manual reload. The first Next proof exposed a raw `Failed to fetch` message; the scratch candidate was corrected to tell the operator to refresh before retrying.

## Interpretation for architecture decision #670

| Candidate | Proven value | Cost or missing proof |
| --- | --- | --- |
| Next static + selective Query | Keeps current route ownership and Worker/static export. Query worked for authenticated Home and cache clearing. | TanStack Router did not own the same URL; adding it beside Next's router would introduce a second route owner. The current `dev:local` still builds first. |
| Router/Query SPA + Vite + Worker | Same-origin built assets/API/D1 and browser fallback worked. Query owns fetched state, Router owns URL, and Worker retains server authorization. | Existing EFCC route families, Storybook integration, accessibility contracts, and migration cost are unmeasured. No SSR benefit. |
| TanStack Start + Cloudflare Vite plugin | Local binding, SSR loader, server/client split, built preview and browser flow worked. | Needs Wrangler/plugin pin upgrade, Start route/server-function setup, a temporary server-route bridge to existing Worker handlers, and hydration/focus care. No measured maintenance saving over SPA or Next yet. |

The proof reused `web/lib/auth/sessions.ts` and cookie helpers, and reused the current Worker-style Home operations. It added a small Start server-route bridge and server loader; it did **not** eliminate the Worker operation code. The SPA needed explicit query invalidation, route focus, and one-origin asset fallback. Next retained its own route owner while adding Query. Drizzle made typed Home reads/inserts convenient but did not remove the reviewed SQL or the atomic D1 batch needed for the conditional audited write.

For #670, treat the Router/Query SPA on the existing Worker as the leading TanStack migration hypothesis, and retain Next+Query as the low-change fallback. Choose Start only if a representative existing EFCC journey proves that its SSR/server-function layer removes more code and maintenance than its additional bridge/configuration costs. Preserve the existing Wrangler SQL chain as the single D1 ledger; map existing tables into Drizzle first, then review only incremental generated/custom SQL before applying it. Do not replace the existing schema with this minimal proof schema.

One source-backed risk needs ownership in the future data/operation slice: `web/lib/home-cms-handlers.ts` currently checks Draft before its D1 batch, then inserts a SUCCESS audit unconditionally after the conditional UPDATE. If another publish wins between those steps, the later UPDATE can affect zero rows while still writing SUCCESS. This proof's D1 batch uses `INSERT ... SELECT ... WHERE changes() = 1` and verified the zero-row/race outcome. The production race has not been directly reproduced against the current full Worker; write that regression before changing the handler.

## Limits and cleanup

This slice omits full identity columns/credential checks, roles, other EFCC domains, existing database upgrades and backfills, real member/guest data, Storybook/W7 acceptance for migrated screens, all route-family parity, realistic traffic/performance, remote Cloudflare behavior, and production promotion. It does not decide Better Auth. All local servers were stopped and ignored local D1/build state was removed after proof; only source and this evidence note are intended to remain on the scratch branch. No PR from this branch should be merged.

Official references used: [TanStack Start build guide](https://tanstack.com/start/latest/docs/framework/react/build-from-scratch), [TanStack Start Cloudflare hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting), [Cloudflare TanStack Start bindings](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/), [TanStack Start server routes](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes), and [Drizzle D1 setup](https://orm.drizzle.team/docs/get-started/d1-new).
