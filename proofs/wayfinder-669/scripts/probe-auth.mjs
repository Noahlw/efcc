import assert from "node:assert/strict";

const base = "http://127.0.0.1:8799";
const request = (path, init) => fetch(`${base}${path}`, init);

assert.equal((await request("/api/home")).status, 401);
const login = await request("/api/login", { method: "POST" });
assert.equal(login.status, 200);
const cookie = login.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie, "login must set an access cookie");
const headers = { Cookie: cookie };
const home = await request("/api/home", { headers });
assert.equal(home.status, 200);
assert.equal((await home.json()).userId, "U-PROOF");
assert.equal(
  (await request("/api/logout", { method: "POST", headers })).status,
  204
);
assert.equal((await request("/api/home", { headers })).status, 401);
console.log("auth proof: 401 -> login 200 -> Home 200 -> logout 204 -> 401");
