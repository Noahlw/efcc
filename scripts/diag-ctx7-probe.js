// Redacted probe — key loaded from env, never logged.
const KEY = process.env.CTX7_KEY;
if (!KEY) {
  console.log("NO_KEY_ENV");
  process.exit(0);
}
const masked = `${KEY.slice(0, 6)}…${KEY.slice(-4)}`;
console.log(
  "KEY_PREFIX_OK=",
  KEY.startsWith("ctx7sk-"),
  "LENGTH=",
  KEY.length,
  "MASKED=",
  masked
);

async function probe(label, url, headers, body) {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...headers,
      },
      body: JSON.stringify(body),
    });
    const txt = await r.text();
    console.log(`=== ${label} ===`);
    console.log("HTTP", r.status, r.statusText);
    console.log("CT", r.headers.get("content-type"));
    console.log(
      "BODY[0..500]=",
      txt.slice(0, 500).replaceAll(/ctx7sk-[A-Za-z0-9-]+/gu, "ctx7sk-REDACTED")
    );
  } catch (error) {
    console.log(`=== ${label} ERROR ===`, String(error).slice(0, 300));
  }
}

const init = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "diag", version: "1.0" },
  },
};
const list = { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} };
const call = {
  jsonrpc: "2.0",
  id: 3,
  method: "tools/call",
  params: { name: "resolve-library-id", arguments: { query: "react" } },
};

await probe(
  "A. mcp.context7.com initialize + header CONTEXT7_API_KEY",
  "https://mcp.context7.com/mcp",
  { CONTEXT7_API_KEY: KEY },
  init
);
await probe(
  "B. mcp.context7.com tools/list + header CONTEXT7_API_KEY",
  "https://mcp.context7.com/mcp",
  { CONTEXT7_API_KEY: KEY },
  list
);
await probe(
  "C. mcp.context7.com resolve-library-id + header CONTEXT7_API_KEY",
  "https://mcp.context7.com/mcp",
  { CONTEXT7_API_KEY: KEY },
  call
);
await probe(
  "D. mcp.context7.com tools/list + Authorization Bearer",
  "https://mcp.context7.com/mcp",
  { Authorization: `Bearer ${KEY}` },
  list
);
await probe(
  "E. context7.com/api/v1/search + Bearer",
  "https://context7.com/api/v1/search",
  { Authorization: `Bearer ${KEY}` },
  { query: "react" }
);
await probe(
  "F. mcp.context7.com with NO key",
  "https://mcp.context7.com/mcp",
  {},
  init
);

// Authoritative REST row — this is the endpoint the MCP client validates against at startup.
async function restGet(label, url, headers) {
  try {
    const r = await fetch(url, { method: "GET", headers });
    const txt = await r.text();
    console.log(`=== ${label} ===`);
    console.log(
      "HTTP",
      r.status,
      r.statusText,
      "CT",
      r.headers.get("content-type")
    );
    console.log(
      "BODY[0..400]=",
      txt.slice(0, 400).replaceAll(/ctx7sk-[A-Za-z0-9-]+/gu, "ctx7sk-REDACTED")
    );
  } catch (error) {
    console.log(`=== ${label} ERROR ===`, String(error).slice(0, 300));
  }
}
await restGet(
  "G. GET /api/v2/libs/search + Bearer (authoritative)",
  "https://context7.com/api/v2/libs/search?query=react",
  { Authorization: `Bearer ${KEY}` }
);
await restGet(
  "H. GET /api/v2/libs/search + empty Bearer (control)",
  "https://context7.com/api/v2/libs/search?query=react",
  { Authorization: "Bearer " }
);
await restGet(
  "I. GET /api/v2/libs/search + no auth (control)",
  "https://context7.com/api/v2/libs/search?query=react",
  {}
);
