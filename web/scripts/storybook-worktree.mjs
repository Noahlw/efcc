import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { parseStorybookPort } from "./storybook-port.mjs";

const scriptDirectory = import.meta.dirname;
const webRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(webRoot, "..");
const defaultPort = 6006;
const storyId = "t07-1-management-hub--default";
const markerDirectory = path.join(os.tmpdir(), "efcc-storybook-worktrees");
const markerName = `${createHash("sha256")
  .update(repositoryRoot)
  .digest("hex")
  .slice(0, 16)}.json`;
const markerPath = path.join(markerDirectory, markerName);

function parseArgs(args) {
  const portIndex = args.indexOf("--port");
  const port =
    portIndex === -1
      ? undefined
      : parseStorybookPort(args[portIndex + 1], "--port");

  return {
    printPort: args.includes("--print-port"),
    port,
  };
}

async function readMarker() {
  try {
    return JSON.parse(await readFile(markerPath, "utf-8"));
  } catch {
    return null;
  }
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function processCommand(pid) {
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

function isOwnedMarker(marker) {
  return Boolean(
    marker?.repositoryRoot === repositoryRoot &&
    processIsAlive(marker.pid) &&
    /storybook-worktree\.mjs|storybook(?:\s|$)/u.test(
      processCommand(marker.pid)
    )
  );
}

async function isPortListening(port) {
  const socket = net.createConnection({ host: "127.0.0.1", port });

  try {
    await once(socket, "connect", { signal: AbortSignal.timeout(250) });
    return true;
  } catch {
    return false;
  } finally {
    socket.destroy();
  }
}

async function closeServer(server) {
  if (!server.listening) {
    return;
  }

  server.close();
  await once(server, "close");
}

async function isPortAvailable(port) {
  const server = net.createServer();

  try {
    server.listen(port, "127.0.0.1");
    await once(server, "listening");
    await closeServer(server);
    return true;
  } catch {
    await closeServer(server);
    return false;
  }
}

async function selectEphemeralPort() {
  const server = net.createServer();

  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : null;
    await closeServer(server);

    if (!port) {
      throw new Error("Could not select a free Storybook port.");
    }

    return port;
  } catch (error) {
    await closeServer(server);
    throw error;
  }
}

async function selectPort(preferredPort) {
  const marker = await readMarker();

  if (
    isOwnedMarker(marker) &&
    Number.isInteger(marker.port) &&
    (await isPortListening(marker.port))
  ) {
    return { marker, port: marker.port };
  }

  if (marker) {
    await rm(markerPath, { force: true });
  }

  if (await isPortAvailable(preferredPort)) {
    return { marker: null, port: preferredPort };
  }

  return { marker: null, port: await selectEphemeralPort() };
}

function printUrls(port) {
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Storybook worktree: ${repositoryRoot}`);
  console.log(`Storybook URL: ${baseUrl}`);
  console.log(
    `Management Hub Story: ${baseUrl}/iframe.html?id=${storyId}&viewMode=story`
  );
}

async function waitForOwnedProcess(pid) {
  while (processIsAlive(pid)) {
    // The owned process must be observed sequentially until it exits.
    // eslint-disable-next-line no-await-in-loop
    await delay(500);
  }
}

async function startStorybook(port) {
  await mkdir(markerDirectory, { recursive: true });
  await writeFile(
    markerPath,
    JSON.stringify(
      {
        pid: process.pid,
        port,
        repositoryRoot,
        startedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  const child = spawn(
    "storybook",
    [
      "dev",
      "--no-open",
      "--no-version-updates",
      "--ci",
      "--port",
      String(port),
    ],
    {
      cwd: webRoot,
      env: { ...process.env, STORYBOOK_PORT: String(port) },
      stdio: "inherit",
    }
  );

  const stopChild = () => {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  };
  process.once("SIGINT", stopChild);
  process.once("SIGTERM", stopChild);

  let exitCode = 1;
  try {
    [exitCode] = await once(child, "exit");
  } catch {
    exitCode = 1;
  } finally {
    await rm(markerPath, { force: true });
  }

  process.exitCode = typeof exitCode === "number" ? exitCode : 1;
}

const { printPort, port: requestedPort } = parseArgs(process.argv.slice(2));
const preferredPort = parseStorybookPort(
  requestedPort ?? process.env.STORYBOOK_PORT ?? defaultPort,
  requestedPort === undefined ? "STORYBOOK_PORT" : "--port"
);
const { marker, port } = await selectPort(preferredPort);

if (printPort) {
  console.log(port);
} else {
  printUrls(port);
  if (marker) {
    console.log(
      `Reusing Storybook process ${marker.pid} owned by this worktree.`
    );
    await waitForOwnedProcess(marker.pid);
  } else {
    await startStorybook(port);
  }
}
