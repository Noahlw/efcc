# Repo-wide organization target inventory

**Checked:** 2026-09-24

**Scope:** Local development and test targets plus the checked-in Cloudflare configuration. This is an inventory of observed configuration, not authorization to deploy or mutate a remote resource.

| Target | Observed identity | Environment classification | Allowed action |
| --- | --- | --- | --- |
| Vitest Worker/D1 | Wrangler Vitest pool provides the Worker DB binding and applies the checked-in migration directory. | Disposable local test harness. | Run local Worker/D1 tests. |
| Programs browser acceptance | The runtime runner starts the Worker from `web/wrangler.jsonc` with `wrangler dev --local`, applies migrations and fixture SQL through Wrangler D1 CLI, and serves an ephemeral loopback origin. Each run uses a unique temporary persistence directory shared by the CLI and Worker, then removes it on shutdown. | Disposable local Worker/D1 test environment. | Run browser acceptance and seed only the runner-owned temporary D1. |
| Wrangler local D1 | Root scripts name efcc-identity and explicitly pass --local. | Local development database. | Reset or seed only with explicit local mode. |
| Checked-in Wrangler deployment config | Worker name efcc-prototype-129; main worker.ts; static assets from out; /api/* is worker-first; compatibility date 2026-08-02. D1 binding DB names efcc-identity and contains configured ID ae437eac-c6ef-4835-bfe8-13c61b5cf586; RPC_RATE_LIMITER has configured namespace 1001. | Remote target identity is unknown. The worker name is explicitly stale; the D1 ID, rate-limit namespace, route/domain, account, and environment were not verified. | No remote reset, migration, deploy, or configuration identity change. Keep the values as historical/unverified until authoritative account inventory exists. |
| Connected Cloudflare account inventory | Read-only Cloudflare API GET on 2026-09-24 returned zero D1 databases and zero Worker scripts. This does not inventory routes or resources under other accounts. | No EFCC remote target was identified in this connected account; other accounts remain unknown. | No remote reset, migration, deploy, or config identity change. |
| Shared/manual Cloudflare development or test D1 | No exact target, account, binding, or environment evidence is available in this checkout. | Uninventoried/unknown. A zero result in the connected account does not establish that EFCC has no resources in another account. | Do not reset or migrate. Obtain valid account identity, list resources, then classify each exact target first. |

## Routes and resource bindings

The checked-in configuration declares only the asset directory and worker-first API path. It does not establish a verified production hostname or custom route. The D1 and rate-limit identifiers are recorded above as the literal configuration values, not as confirmed Cloudflare resource identities. The connected-account API inventory was read-only and found no D1 databases or Worker scripts; it cannot establish whether resources exist in a different Cloudflare account.

No deployment-target identity was established and no remote Cloudflare resource was changed during this audit or implementation.
