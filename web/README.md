# EFCC Web Frontend

Next.js static export hosted on Cloudflare Workers with Apps Script `/api/*` RPC proxy (ADR-0017 / ADR-0018).

## Local Development & Testing

Because `/api/v1/rpc` requests are proxied by the Cloudflare Worker (`worker.ts`) to the Apps Script `/exec` backend, run the local Worker preview server for full interactive testing:

### 1. Configure Local Secret (`.dev.vars`)

Create `web/.dev.vars` (gitignored) and set your target Apps Script `/exec` URL:

```ini
APPS_SCRIPT_EXEC_URL="https://script.google.com/macros/s/<YOUR_DEPLOYMENT_ID>/exec"
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

Runs Vitest component tests in `jsdom` with MSW mocking `/api/v1/rpc`.
