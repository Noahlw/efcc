import { describe, expect, test } from "vitest";

import {
  assertLocalTarget,
  artifactPaths,
  classifyRuntimeSignals,
  redactSecrets,
  RUNTIME_COMMANDS,
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
    "http://127.0.0.1:8788/",
    "not-a-url",
  ])("rejects non-local target %s", (target) => {
    expect(() => assertLocalTarget(target)).toThrow();
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
    expect(() => artifactPaths("/tmp/efcc-t05", "../overwrite")).toThrow();
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

  test("runs the documented clean local sequence", () => {
    expect(RUNTIME_COMMANDS.map(({ name }) => name)).toEqual([
      "worker",
      "seed-local",
      "seed-demo",
      "programs-playwright",
    ]);
    expect(RUNTIME_COMMANDS[3]?.args).toEqual([
      "exec",
      "playwright",
      "test",
      "-c",
      "tests/e2e/programs-d1.config.ts",
    ]);
  });
});
