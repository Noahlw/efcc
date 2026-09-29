import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";

import worker from "../../../src/worker";

export async function readHome() {
  const incoming = getRequest();
  const request = new Request(new URL("/api/home", incoming.url), {
    headers: incoming.headers,
  });
  const response = await worker.fetch(request, env as { DB: D1Database });
  const data = (await response.json()) as {
    userId?: string;
    content?: { title: string; status: string; version: number } | null;
    error?: string;
  };
  return { status: response.status, data };
}
