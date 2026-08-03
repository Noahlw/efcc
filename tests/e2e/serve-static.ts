// Zero-dep static server for web/out. Run via tsx; no framework deps.
// Used by tests/e2e/responsive.config.ts webServer to serve the Next.js
// static export on 127.0.0.1:4173. The e2e suite stubs the /api/v1/rpc
// endpoint in-browser; this server only serves static assets.

import fs from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

const PORT = Number.parseInt(process.env.PORT ?? "4173", 10);
const HOST = "127.0.0.1";
const ROOT = path.resolve(import.meta.dirname, "../../web/out");

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function safeResolveAsset(pathname: string): string | null {
  const decoded = decodeURIComponent(pathname);
  const candidate = path.normalize(`${ROOT}${decoded}`);
  if (!candidate.startsWith(`${ROOT}/`) && candidate !== ROOT) {
    return null;
  }

  // Resolve order: exact file → extensionless → .html → trailing / → index.html.
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return candidate;
  }
  if (!path.extname(candidate)) {
    const withHtml = `${candidate}.html`;
    if (fs.existsSync(withHtml) && fs.statSync(withHtml).isFile()) {
      return withHtml;
    }
  }
  if (candidate.endsWith("/") || pathname.endsWith("/")) {
    const withIndex = `${candidate.replace(/\/+$/u, "")}/index.html`;
    if (fs.existsSync(withIndex) && fs.statSync(withIndex).isFile()) {
      return withIndex;
    }
  }
  return null;
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (!req.url) {
    res.statusCode = 404;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("Not Found");
    return;
  }

  const url = new URL(req.url, `http://${HOST}`);
  const asset = safeResolveAsset(url.pathname);
  if (!asset) {
    res.statusCode = 404;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("Not Found");
    return;
  }

  res.statusCode = 200;
  res.setHeader(
    "content-type",
    CONTENT_TYPES[path.extname(asset).toLowerCase()] ??
      "application/octet-stream"
  );
  // No cache headers — test runs are deterministic on a fresh build.
  res.end(fs.readFileSync(asset));
});

server.listen(PORT, HOST, () => {
  // ponytail: stdout banner is how Playwright readiness detects the server.
  // eslint-disable-next-line no-console
  console.log(`serving web/out on http://${HOST}:${PORT}`);
});
