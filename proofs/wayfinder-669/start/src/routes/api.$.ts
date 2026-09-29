import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import worker from "../../../src/worker";

const handle = ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  if (["/api/seed", "/api/draft", "/api/state"].includes(url.pathname)) {
    url.pathname = url.pathname.slice(4);
  }
  return worker.fetch(new Request(url, request), env as { DB: D1Database });
};

export const Route = createFileRoute("/api/$")({
  server: { handlers: { GET: handle, POST: handle } },
});
