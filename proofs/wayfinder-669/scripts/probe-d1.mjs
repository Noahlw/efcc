import assert from "node:assert/strict";

const origin = process.env.PROOF_ORIGIN ?? "http://127.0.0.1:8799";

async function call(method, path, body) {
  const response = await fetch(new URL(path, origin), {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}

const state = () => call("GET", "/state");
const publish = (version, auditId) =>
  call("POST", "/publish", { version, auditId, correlationId: auditId });

assert.equal((await call("POST", "/seed")).status, 200);
let current = (await state()).data;
assert.equal(current.home.length, 1);
assert.equal(current.home[0].status, "Draft");
assert.equal(current.audit.length, 0);

const zeroRow = await publish(99, "zero-row");
assert.deepEqual(zeroRow, {
  status: 409,
  data: { changed: 0, auditInserted: 0 },
});
assert.equal((await state()).data.audit.length, 0);

const race = await Promise.all([publish(1, "race-a"), publish(1, "race-b")]);
assert.deepEqual(race.map((result) => result.status).sort(), [200, 409]);
current = (await state()).data;
assert.equal(current.home[0].status, "Published");
assert.equal(current.audit.length, 1);
assert.equal(current.audit[0].outcome, "SUCCESS");
const priorAuditId = current.audit[0].auditId;

const duplicate = await publish(1, "duplicate");
assert.deepEqual(duplicate, {
  status: 409,
  data: { changed: 0, auditInserted: 0 },
});
assert.equal((await state()).data.audit.length, 1);

assert.equal((await call("POST", "/draft", { version: 2 })).status, 201);
const failedAudit = await publish(2, priorAuditId);
assert.equal(failedAudit.status, 503);
current = (await state()).data;
assert.equal(current.home.find((row) => row.version === 2).status, "Draft");
assert.equal(current.audit.length, 1);

const secondSuccess = await publish(2, "second-success");
assert.deepEqual(secondSuccess, {
  status: 200,
  data: { changed: 1, auditInserted: 1 },
});
current = (await state()).data;
assert.equal(current.audit.length, 2);
assert.equal(current.home.find((row) => row.version === 2).status, "Published");

assert.deepEqual(await call("POST", "/audit-tamper"), {
  status: 200,
  data: { blocked: true },
});
assert.deepEqual(await call("POST", "/invalid-foreign-key"), {
  status: 200,
  data: { blocked: true },
});

console.log(
  JSON.stringify({
    result: "passed",
    zeroRow,
    race,
    duplicate,
    failedAuditStatus: failedAudit.status,
    secondSuccess,
    final: {
      homeRows: current.home.length,
      publishedRows: current.home.filter((row) => row.status === "Published")
        .length,
      successAudits: current.audit.length,
    },
    auditImmutable: true,
    foreignKeyProtected: true,
  })
);
