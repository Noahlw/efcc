import { Resolver } from "node:dns";
import { isIP } from "node:net";

import { defineConfig, devices } from "@playwright/test";

const targetUrl = process.env.E2E_TARGET_URL;

if (!targetUrl) {
  throw new Error("E2E_TARGET_URL is required");
}

// HTTPS-only: this suite carries credentials across the signed-envelope
// boundary, so a plaintext http target is rejected at config load. Any
// origin that serves the Next.js app + /api/v1/rpc over TLS qualifies
// (Cloudflare Worker, Apps Script /exec, or a future HTTPS backend).
let parsedUrl: URL;
try {
  parsedUrl = new URL(targetUrl);
} catch {
  throw new Error("E2E_TARGET_URL must be a valid https URL");
}
if (parsedUrl.protocol !== "https:") {
  throw new Error("E2E_TARGET_URL must be an https URL");
}

const targetHost = parsedUrl.hostname;

/**
 * Resolve the target hostname to a public IP. Some corporate/Tailscale
 * resolvers answer *.workers.dev with 127.0.0.1 (a DNS blocklist), which
 * would make every request fail with ERR_CONNECTION_REFUSED locally while
 * the deployment is healthy. When that happens, fall back to public DNS
 * (1.1.1.1 / 8.8.8.8) so the trace still reaches the real Worker.
 *
 * Returns null when the host is fine or unreachable either way; callers
 * then run without DNS pinning.
 */
async function resolvePublicIp(host: string): Promise<string | null> {
  const resolver = new Resolver();
  resolver.setServers(["1.1.1.1", "8.8.8.8"]);
  try {
    const addresses = await new Promise<string[]>((resolve, reject) => {
      resolver.resolve4(host, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
    const publicIp = addresses.find(
      (addr: string) => isIP(addr) === 4 && !addr.startsWith("127.")
    );
    return publicIp ?? null;
  } catch {
    return null;
  }
}

async function buildConfig() {
  let hostResolverRules: string | undefined;

  // Explicit override wins; otherwise pin automatically only when the
  // system resolver appears to be poisoning the hostname.
  const explicit = process.env.E2E_HOST_RESOLVER_RULES;
  if (explicit) {
    hostResolverRules = explicit;
  } else {
    try {
      const { lookup } = await import("node:dns/promises");
      const { address } = await lookup(targetHost);
      const poisoned =
        address === "127.0.0.1" ||
        address === "::1" ||
        address.startsWith("127.");
      if (poisoned) {
        const realIp = await resolvePublicIp(targetHost);
        if (realIp) {
          hostResolverRules = `MAP ${targetHost} ${realIp}`;
        }
      }
    } catch {
      // Resolution failed; run unpinned.
    }
  }

  return defineConfig({
    testDir: ".",
    testMatch: "worker-transport.test.ts",
    // 60s: the client retries 502/503 (ADR-0018 §6, up to 3 attempts with
    // exponential backoff) when the upstream intermittently returns a
    // non-JSON response; the retry-heavy login/restore path needs headroom.
    timeout: 60_000,
    // Strict run must not mask intermittent failures. The authorized run
    // command is `playwright test ... --retries=0` (see plan §3).
    retries: 0,
    fullyParallel: false,
    workers: 1,
    reporter: [
      ["list"],
      ["json", { outputFile: "test-results/worker-transport-results.json" }],
    ],
    use: {
      baseURL: targetUrl,
      // Credential-bearing transport suite: traces and screenshots stay
      // disabled so failures cannot persist session-bearing browser data.
      trace: "off",
      screenshot: "off",
      // Auto-pins the Worker hostname to its real public IP when the local
      // resolver blocks/poisons *.workers.dev; unpinned otherwise.
      ...(hostResolverRules
        ? {
            launchOptions: {
              args: [`--host-resolver-rules=${hostResolverRules}`],
            },
          }
        : {}),
    },
    projects: [
      {
        name: "chrome",
        use: { ...devices["Desktop Chrome"] },
      },
    ],
  });
}

export default buildConfig();
