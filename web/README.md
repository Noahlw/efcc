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
