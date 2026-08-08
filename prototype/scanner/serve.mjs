#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
/*
 * Local HTTPS server for the EFCC QR scanner prototype (issue #100 testing).
 *
 * getUserMedia requires a secure context. This serves prototype/scanner/ over
 * HTTPS with a self-signed cert (generated on first run via openssl). Open the
 * printed URL on your phone and tap through the cert warning.
 *
 *   node prototype/scanner/serve.mjs            # default port 8443
 *   PORT=9000 node prototype/scanner/serve.mjs  # custom port
 *
 * No dependencies - Node 22 built-ins only.
 */
import https from "node:https";
import os from "node:os";
import path from "node:path";

const __dirname = import.meta.dirname;
const PORT = Number(process.env.PORT) || 8443;
const CERT_DIR = path.join(__dirname, ".cert");
const KEY_PATH = path.join(CERT_DIR, "key.pem");
const CERT_PATH = path.join(CERT_DIR, "cert.pem");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".md": "text/plain; charset=utf-8",
};

function lanIp() {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const i of list) {
      if (i.family === "IPv4" && !i.internal) {
        return i.address;
      }
    }
  }
  return "127.0.0.1";
}

function ensureCert(ip) {
  if (fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH)) {
    return;
  }
  fs.mkdirSync(CERT_DIR, { recursive: true });
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      KEY_PATH,
      "-out",
      CERT_PATH,
      "-days",
      "365",
      "-subj",
      `/CN=${ip}`,
      "-addext",
      `subjectAltName=IP:${ip},DNS:localhost`,
    ],
    { stdio: "ignore" }
  );
}

function serve(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, "https://x").pathname);
  const rel = pathname === "/" ? "/opener.html" : pathname;
  // Block access to the cert directory and dotfiles.
  if (rel.includes("/.cert") || rel.includes("/.")) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  const file = path.resolve(path.join(__dirname, rel));
  if (!file.startsWith(__dirname) || !fs.existsSync(file)) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  if (fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const ext = path.extname(file);
  res.writeHead(200, {
    "content-type": MIME[ext] || "application/octet-stream",
  });
  fs.createReadStream(file).pipe(res);
}

const ip = lanIp();
ensureCert(ip);
const server = https.createServer(
  { key: fs.readFileSync(KEY_PATH), cert: fs.readFileSync(CERT_PATH) },
  serve
);

server.listen(PORT, "0.0.0.0", () => {
  const line = "=".repeat(54);
  console.log(`\n${line}`);
  console.log(" EFCC QR Scanner prototype - local HTTPS server");
  console.log(`${line}`);
  console.log("\nOn your phone (same Wi-Fi), open ONE of these and tap");
  console.log("through the 'Not Private' cert warning:\n");
  console.log(`  App Document harness:  https://${ip}:${PORT}/opener.html`);
  console.log(`  Direct scanner page:   https://${ip}:${PORT}/index.html`);
  console.log(`  Test QR (laptop):      https://${ip}:${PORT}/test-qr.html`);
  console.log(
    `  New prototype flows:   https://${ip}:${PORT}/prototype-index.html`
  );
  console.log(`  Member self check-in:  https://${ip}:${PORT}/check-in.html`);
  console.log(
    `  Guest check-in:        https://${ip}:${PORT}/guest-check-in.html`
  );
  console.log(
    `  Event management:      https://${ip}:${PORT}/event-manage.html`
  );
  console.log(`  Design showcase:       https://${ip}:${PORT}/showcase.html`);
  console.log(`\nServing: ${__dirname}`);
  console.log("Ctrl-C to stop.\n");
});
