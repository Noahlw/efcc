# EFCC Web Frontend

Next.js static export hosted on Cloudflare Workers with D1-native `/api/v1/*` routes (ADR-0017 / ADR-0018 / ADR-0020).

## Local Development & Testing

The Worker serves the Next static export and the D1 API surfaces (`/api/v1/auth/*`, `/api/v1/programs/*`, `/api/v1/attendance*`). Run the local Worker preview server for full interactive testing:

### 1. Configure Local Secret (`.dev.vars`)

Create `web/.dev.vars` (gitignored) from `web/.dev.vars.example` and set a local-only `EFCC_ACCESS_TOKEN_SECRET` (see the template):

```sh
cp .dev.vars.example .dev.vars
openssl rand -hex 32   # paste into EFCC_ACCESS_TOKEN_SECRET
```

### 2. Build Static Export & Run Wrangler Local Dev

```bash
cd web
pnpm build
npx wrangler dev
```

Open `http://127.0.0.1:8787` in your browser.

## Component Tests

```bash
cd web
pnpm test:components
```

Runs Vitest component tests in `jsdom` with MSW mocking the `/api/v1/*` surfaces.

## Local Storybook presentation workshop

Storybook is local-only development/test tooling. It renders the production presentation seams with synthetic boundary fixtures; it is not a product route, backend acceptance environment, or human design-approval record.

From the repository root, use the pinned Node and pnpm versions:

```sh
fnm exec --using 22.18.0 pnpm --dir web storybook
```

The worktree-safe launcher reuses only a live Storybook process owned by this worktree. Otherwise it chooses a free port and prints the actual URL plus the direct Management Hub Story URL. Keep that process running for HMR. `PSN-*` identities are stable presentation references; Storybook slugs and iframe URLs are locators only.

Focused qualification commands are:

```sh
fnm exec --using 22.18.0 pnpm --dir web test:t07:foundation
fnm exec --using 22.18.0 pnpm --dir web test:storybook
fnm exec --using 22.18.0 pnpm --dir web storybook:build
fnm exec --using 22.18.0 pnpm --dir web storybook:verify-index
```

The index reconciliation command is run after a successful build and verifies the actual generated Storybook `index.json` against discovered CSF Stories and the independent Screen Catalog obligations. Review the named Stories at `390`, `799`, `800`, and `1440` CSS px; Controls are exploratory, while approval-sensitive evidence must name the Story/PSN. Human workshop fidelity, design approval, and backend acceptance remain separate gates.

If a port is occupied, stop only the current-worktree launcher or choose a free port; never kill another worktree's process. A missing handler should be fixed at the system-boundary fixture, and a missing baseline/Story import is a catalog or CSF declaration failure—not a reason to add a placeholder Story.
