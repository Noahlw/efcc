import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  authProbeCredentials,
  assertLocalTarget,
  artifactPaths,
  classifyRuntimeSignals,
  cookieHeaderFromSetCookieHeaders,
  redactSecrets,
  runLogged,
  runtimeRunSucceeded,
  runtimeCommands,
  runtimeEnvironment,
  stageTimeoutMs,
} from "./run-programs-acceptance";

describe("T05 local Programs runtime runner", () => {
  test("normalizes only the loopback target and fixed port", () => {
    const target = assertLocalTarget(
      "http://127.0.0.1:8787/ignored?credential=hidden#state"
    );

    expect(target.href).toBe("http://127.0.0.1:8787/");
  });

  test.each([
    "https://127.0.0.1:8787/",
    "http://example.test:8787/",
    "http://user:password@127.0.0.1:8787/",
    "http://127.0.0.1:1023/",
    "not-a-url",
  ])("rejects non-local target %s", (target) => {
    expect(() => assertLocalTarget(target)).toThrow();
  });

  test("allows an alternate unprivileged loopback port", () => {
    expect(assertLocalTarget("http://127.0.0.1:8788/").href).toBe(
      "http://127.0.0.1:8788/"
    );
  });

  test("allocates a separate result and output path per run", () => {
    const paths = artifactPaths("/tmp/efcc-t05", "20260903t051000000z");

    expect(paths.directory).toBe("/tmp/efcc-t05/20260903t051000000z");
    expect(paths.results).toBe(
      "/tmp/efcc-t05/20260903t051000000z/programs-d1-results.json"
    );
    expect(paths.playwrightOutput).toBe(
      "/tmp/efcc-t05/20260903t051000000z/playwright-output"
    );
    expect(paths.wranglerLog).toBe(
      "/tmp/efcc-t05/20260903t051000000z/wrangler.log"
    );
    expect(paths.persistence).toBe(
      "/tmp/efcc-t05/20260903t051000000z/wrangler-state"
    );
    expect(() => artifactPaths("/tmp/efcc-t05", "../overwrite")).toThrow();
  });

  test("uses one loopback target for Programs and demo seed commands", () => {
    const paths = artifactPaths("/tmp/efcc-t05", "20260903t051000000z");
    const target = assertLocalTarget("http://127.0.0.1:8788/");
    const environment = runtimeEnvironment(target, paths, {});

    expect(environment.PROGRAMS_TARGET_URL).toBe("http://127.0.0.1:8788");
    expect(environment.DEMO_TARGET_URL).toBe(environment.PROGRAMS_TARGET_URL);
    expect(environment.PROGRAMS_PERSIST_TO).toBe(paths.persistence);
  });

  test("redacts local secrets before writing a failure summary", () => {
    expect(
      redactSecrets(
        "worker secret=disposable-token and again disposable-token",
        ["disposable-token"]
      )
    ).toBe("worker secret=[REDACTED] and again [REDACTED]");
  });

  test("keeps the first runtime marker separate from downstream refusals", () => {
    const summary = classifyRuntimeSignals(
      [
        "kj::async-io-unix.c++:186: disconnected: Broken pipe",
        "Error in ProxyController: Error inside ProxyWorker",
        "Network connection lost.",
        "page.goto: net::ERR_CONNECTION_REFUSED",
        "another ERR_CONNECTION_REFUSED cascade",
      ].join("\n")
    );

    expect(summary.firstRuntimeSignal).toContain("Broken pipe");
    expect(summary.proxyFailure).toContain("ProxyController");
    expect(summary.downstreamConnectionSignals).toBe(2);
  });
  test("ignores inspector reload bookkeeping as a proxy failure", () => {
    const summary = classifyRuntimeSignals(
      [
        '[InspectorProxyWorker] handleProxyControllerIncomingMessage {"type":"reloadStart"}',
        "Error in ProxyController: Error inside ProxyWorker",
        "Network connection lost.",
      ].join("\n")
    );

    expect(summary.firstRuntimeSignal).toContain("Error in ProxyController");
    expect(summary.proxyFailure).toContain("Error in ProxyController");
  });

  test("runs direct D1 preparation before one Worker and browser journey", () => {
    const commands = runtimeCommands(
      "/tmp/efcc-t05/20260903t051000000z/wrangler-state"
    );

    expect(commands.map(({ name }) => name)).toEqual([
      "build",
      "bundle",
      "migrate",
      "seed-local",
      "worker",
      "seed-demo",
      "programs-playwright",
    ]);
    expect(commands[2]?.args).toEqual([
      "--dir",
      "web",
      "exec",
      "wrangler",
      "d1",
      "migrations",
      "apply",
      "efcc-identity",
      "--local",
      "--persist-to",
      "/tmp/efcc-t05/20260903t051000000z/wrangler-state",
    ]);
    expect(commands[4]?.args).toEqual([
      "--dir",
      "web",
      "exec",
      "wrangler",
      "dev",
      ".wrangler/local-bundle/worker.js",
      "--config",
      "wrangler.jsonc",
      "--local",
      "--no-bundle",
      "--port",
      "8787",
      "--persist-to",
      "/tmp/efcc-t05/20260903t051000000z/wrangler-state",
    ]);
    expect(commands[6]?.args).toEqual([
      "exec",
      "playwright",
      "test",
      "-c",
      "tests/e2e/programs-d1.config.ts",
    ]);
  });

  test("does not report a late Worker failure as a successful run", () => {
    expect(runtimeRunSucceeded(true, { code: 1, signal: null })).toBe(false);
    expect(runtimeRunSucceeded(true, { code: 0, signal: null })).toBe(true);
    expect(runtimeRunSucceeded(true, { code: null, signal: "SIGTERM" })).toBe(
      false
    );
    expect(runtimeRunSucceeded(false, { code: 0, signal: null })).toBe(false);
  });

  test("bounds post-start stages and terminates a timed-out child", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "efcc-t05-runtime-"));
    try {
      const result = await runLogged(
        {
          name: "seed-demo",
          command: process.execPath,
          args: [
            "-e",
            "process.on('SIGINT', () => process.exit(0)); setInterval(() => {}, 1000)",
          ],
        },
        process.cwd(),
        process.env,
        path.join(directory, "stage.log"),
        25
      );

      expect(result.error).toContain("seed-demo timed out after 25ms");
      expect(stageTimeoutMs("seed-demo")).toBe(120_000);
      expect(stageTimeoutMs("programs-playwright")).toBe(900_000);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("auth readiness uses disposable fixtures and strips cookie attributes", () => {
    expect(
      authProbeCredentials({
        PROGRAMS_ADMIN_USERNAME: "E2E_admin",
        PROGRAMS_ADMIN_CREDENTIAL: "E2E_admin!dev",
      })
    ).toEqual({
      username: "E2E_admin",
      credential: "E2E_admin!dev",
    });
    expect(() =>
      authProbeCredentials({
        PROGRAMS_ADMIN_USERNAME: "admin",
        PROGRAMS_ADMIN_CREDENTIAL: "not-disposable",
      })
    ).toThrow();
    expect(
      cookieHeaderFromSetCookieHeaders([
        "efcc_access=access-value; Path=/; HttpOnly",
        "efcc_refresh=refresh-value; Path=/; HttpOnly",
      ])
    ).toBe("efcc_access=access-value; efcc_refresh=refresh-value");
  });
});
