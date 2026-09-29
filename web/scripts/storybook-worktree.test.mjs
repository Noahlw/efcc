import { execFileSync } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import path from "node:path";

import { expect, test } from "vitest";

test("Storybook worktrees avoid a port held by an IPv6 listener", async () => {
  const listener = net.createServer();
  listener.listen(0, "::");
  await once(listener, "listening");

  try {
    const address = listener.address();
    if (typeof address !== "object" || address === null) {
      throw new Error("Expected a TCP listener address");
    }
    const output = execFileSync(
      process.execPath,
      [
        path.join(import.meta.dirname, "storybook-worktree.mjs"),
        "--port",
        String(address.port),
        "--print-port",
      ],
      { encoding: "utf-8" }
    );
    expect(Number(output.trim())).not.toBe(address.port);
  } finally {
    listener.close();
    await once(listener, "close");
  }
});
