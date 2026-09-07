# T07.1 Storybook compatibility record

Validated 2026-09-06 before installation for `Noahlw/efcc`:

| Decision | Selected value | Basis |
| --- | --- | --- |
| Storybook | `10.6.0` | Live official npm `latest` dist-tag. Context7 `/storybookjs/storybook` currently indexes `10.2.9`; the live registry is newer, so `10.6.0` is the selected stable release. |
| Next.js integration | `@storybook/nextjs-vite@10.6.0` | Official Next.js Vite framework integration. Its published peers include Next `^16.0.0`, React/React-DOM `^19.0.0`, Vite `^5–^8`, and Storybook `^10.6.0`; this repo uses Next `16.2.12`, React `19.2.8`, and React-DOM `19.2.8`. |
| Vitest integration | `@storybook/addon-vitest@10.6.0`, `@vitest/browser@4.1.10`, `@vitest/browser-playwright@4.1.10` | Official addon/plugin path. The addon peers support Vitest 4 and the Playwright browser provider; the repo already uses Vitest `4.1.10`. |
| Accessibility | `@storybook/addon-a11y@10.6.0` | Official Storybook accessibility addon; it uses `axe-core` and shares the Storybook 10.6 peer. |
| HTTP boundary | `msw-storybook-addon@3.0.0` with the repo’s `msw@2.15.0` | Official MSW Storybook addon; published peers require MSW `>=2` and Storybook `>=9`. Handlers stay at the browser HTTP boundary. |
| Portable/browser mechanism | Storybook CSF Story exports and the direct Story iframe URL; Playwright uses a Node-safe stable Story ID bridge verified against the actual CSF declarations | The browser contract opens the same Story presentation truth rather than a second test page. |

Official references:

- [Next.js Vite framework](https://storybook.js.org/docs/get-started/frameworks/nextjs-vite)
- [Vitest addon](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon)
- [Accessibility testing](https://storybook.js.org/docs/writing-tests/accessibility-testing)
- [MSW Storybook addon](https://storybook.js.org/addons/msw-storybook-addon)
- [CSF Next / portable Stories](https://storybook.js.org/docs/api/csf/csf-next)

This record is compatibility evidence, not a new runtime authority. Storybook remains local development/test tooling; production code must not import Storybook files or adapters.

## Worktree-safe local workflow

Run `pnpm storybook` from `web/`. The launcher records the owning worktree and process in a temporary, worktree-keyed marker. A later invocation reuses that process only when the marker still points to a live Storybook launcher from the same worktree; otherwise it selects the preferred `6006` port when free or an ephemeral free port. It never kills a process owned by another worktree.

Startup prints the actual Storybook URL and the direct Management Hub Story URL. The launched Storybook process remains attached for HMR. The Playwright bridge uses the same selector and reuses only a live current-worktree server.

## Current repair-qualified workflow

The canonical workshop commands are run from the repository root with Node `22.18.0` and pnpm `11.7.0`:

```sh
fnm exec --using 22.18.0 pnpm --dir web storybook
fnm exec --using 22.18.0 pnpm --dir web test:t07:foundation
fnm exec --using 22.18.0 pnpm --dir web test:storybook
fnm exec --using 22.18.0 pnpm --dir web storybook:build
fnm exec --using 22.18.0 pnpm --dir web storybook:verify-index
```

`storybook:verify-index` must run after `storybook:build`; it checks the actual generated `storybook-static/index.json`, all discovered Story IDs, all primary baseline PSNs, and the independent Screen Catalog obligations. The current catalog is **35 screen obligations / 39 Stories**. The credential upgrade Story is supporting coverage for `auth-sign-in`; the registrations fallback is a directly reviewable Management/Identity redirect boundary.

Use the printed URL and direct Story URL rather than assuming port `6006`. The stable reference is the PSN, for example `PSN-MGMT-HUB-DEFAULT`; the Storybook slug is only a runtime locator. HMR is available while the same-worktree launcher remains attached. Review named Stories at `390`, `799`, `800`, and `1440`; a Controls state is not approval evidence.

Troubleshooting: an occupied port selects a free port; a stale marker is ignored unless it names a live launcher from this worktree; missing HTTP is handled by the Story's system-boundary MSW fixture; a missing baseline or import is fixed in the real CSF/catalog declaration. Do not kill another worktree's process, add a fake Story, or treat workshop fidelity as design or backend approval.
