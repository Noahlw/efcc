# 2026-08-29 — S4 Phase C Vitest Cloudflare pool research

**Date:** 2026-08-29
**Worktree:** `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/s4-c-research-worker`
**Branch:** `research/s4-c-vitest-pool`
**Coordinator head (current):** `264f6ca2a712daf63fc50d557bc7d4c70f20bdc1`
**Phase B base SHA:** `c75c99e84d699d2d1eac44f07d4e013ead4c12a5`
**Author:** `ResearchPoolPrimarySources` subagent (restart of prior research agent per coordinator)
**Brief:** Research-only; do not edit production/test/config files or run project-wide suites.

## 1. Research question

The focused #485 Worker tests fail before any product assertion with:

```text
Caused by: EvalError: Code generation from strings disallowed for this context
 ❯ getAsyncFunctionDeclarationPaddingLineCount
    node_modules/.pnpm/vite@8.2.0_@types+node@26.1.2_esbuild@0.28.1_jiti@2.7.0/
    node_modules/vite/dist/node/module-runner.js:27:35
 ❯ <instance_members_initializer>
    .../vite/dist/node/module-runner.js:1008:16
 ❯ new ESModulesEvaluator
    .../vite/dist/node/module-runner.js:1007:26
 ❯ new ModuleRunner
    .../vite/dist/node/module-runner.js:1111:35
 ❯ createEnvironmentLoader
    .../vitest/dist/chunks/init.k9zZ9sLh.js:27:24
 ❯ loadEnvironment
    .../vitest/dist/chunks/init.k9zZ9sLh.js:70:17
 ❯ Object.setupBaseEnvironment [as setup]
    .../vitest/dist/chunks/base.B6Opl8PE.js:159:40
 ❯ .../vitest/dist/chunks/init.k9zZ9sLh.js:237:95
 ❯ Traces.$ .../vitest/dist/chunks/traces.DT5aQ62U.js:142:27
Test Files  no tests
Tests       no tests
Errors      2 errors
```

The same stack is reproduced 1:1 by the rerun captured in
`docs/specs/s4-phase-c-acceptance-trace.md` (see "Focused Worker/domain command
(rerun)" — `aef36b81c3c493c38395c16f284381a8a51c91db` head under
`s4-c-485-evidence-rerun` worktree). It is also reproduced locally against the
matching installed `vite@8.2.0` + `vitest@4.1.10` + `@cloudflare/vitest-pool-workers@0.20.1`
under the s4-c-485-evidence-rerun worktree (see "Reproduction" below).

The questions the correction worker must answer:

1. Exact root cause and whether the restriction is host/harness versus repo code.
2. Whether an official safe setting, supported Node/Vitest/Cloudflare option, or
   pinned-version change can run the tests without weakening security or
   changing production behavior.
3. Whether any `NODE_OPTIONS` / unsafe-eval workaround is documented and safe
   (do not recommend bypasses without primary-source support).
4. The smallest exact files/commands a correction worker should use, or a
   justified classification as external infrastructure.

## 2. Environment and version evidence (verified)

All claims below were re-checked in the assigned worktree on 2026-08-29.

| Item | Value | Local source |
| --- | --- | --- |
| Node | `v22.18.0` | `node --version` |
| pnpm | `11.7.0` | `node -p "process.env.npm_config_user_agent"` |
| Vitest (web workspace) | `4.1.10` | `web/node_modules/.pnpm/vitest@4.1.10_…/node_modules/vitest/package.json` |
| Vite (transitively pinned by Vitest) | `8.2.0` | `web/node_modules/.pnpm/vite@8.2.0_…/node_modules/vite/package.json` |
| `@cloudflare/vitest-pool-workers` | `0.20.1` (peer `^4.1.0`) | `web/node_modules/@cloudflare/vitest-pool-workers/package.json` |
| Wrangler | `4.127.1` (web lockfile) | `web/node_modules/.pnpm/wrangler@4.127.1/.../package.json` |
| Miniflare | `5.20260828.0-alpha` (the web lockfile pool version; an alternate `5.20260730.0-alpha` exists in the pnpm store but is **not** the test pool) | `web/node_modules/.pnpm/miniflare@5.20260828.0-alpha/.../package.json` |
| `workerd` (darwin-arm64, used by miniflare) | `1.20260828.1` (workerd `1.20260730.1` is the alternate that miniflare `5.20260730.0-alpha` ships) | `web/node_modules/.pnpm/@cloudflare+workerd-darwin-arm64@1.20260828.1/...` |
| `@cloudflare/workers-types` | `5.20260804.1` | `web/node_modules/.pnpm/@cloudflare+workers-types@5.20260804.1/...` |
| OS / arch | `darwin arm64` (Apple M4) | workstation, Kernel 25.6.0 |
| Test command under test | `pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/permission-editor.test.ts lib/identity/permission-editor-handlers.test.ts` | `web/package.json`, `web/vitest.config.ts` |
| Vitest config under test | `web/vitest.config.ts` (registers `cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })` and sets `pool: "cloudflare-pool"`) | `web/vitest.config.ts:1-56` |
| Active process `NODE_OPTIONS` | `undefined` (no `--disallow-code-generation-from-strings`, no `NODE_OPTIONS` set in shell or in Vitest) | `pnpm --dir web exec node -p "JSON.stringify({argv: process.argv, execArgv: process.execArgv, NODE_OPTIONS: process.env.NODE_OPTIONS})"` returns `{"argv":["…/node"],"execArgv":["-p","…"],"NODE_OPTIONS":""}` (empty), Vitest worker probe via `/tmp/vitest-child-probe.log` and the inline forks.js probe also returned `NODE_OPTIONS: undefined` |
| Active process `execArgv` | empty (only `[-p, …]` flags for the probe itself) | same |
| Vitest forks-worker child `execArgv` (when `pool: "forks"`) | `["--experimental-import-meta-resolve","--require","…/vitest/suppress-warnings.cjs","--conditions","node","--conditions","development"]` (inherited from `vitest/dist/chunks/cli-api.BK8pd4xc.js:3733-3736` default) | probe via forks.js inline test: `["--experimental-import-meta-resolve","--require","…","--conditions","node","--conditions","development"]` |

### Reproduction (verified, 2026-08-29)

```text
$ pnpm --dir web exec vitest run --config vitest.config.ts \
    lib/identity/permission-editor.test.ts
…
Caused by: EvalError: Code generation from strings disallowed for this context
 ❯ getAsyncFunctionDeclarationPaddingLineCount
    …/vite@8.2.0/…/vite/dist/node/module-runner.js:27:35
 ❯ <instance_members_initializer>
    …/vite@8.2.0/…/vite/dist/node/module-runner.js:1008:16
 ❯ new ESModulesEvaluator
    …/vite@8.2.0/…/vite/dist/node/module-runner.js:1007:26
 ❯ new ModuleRunner
    …/vite@8.2.0/…/vite/dist/node/module-runner.js:1111:35
 ❯ createEnvironmentLoader
    …/vitest@4.1.10/…/vitest/dist/chunks/init.k9zZ9sLh.js:27:24
 ❯ loadEnvironment
    …/vitest@4.1.10/…/vitest/dist/chunks/init.k9zZ9sLh.js:70:17
 ❯ Object.setupBaseEnvironment [as setup]
    …/vitest@4.1.10/…/vitest/dist/chunks/base.B6Opl8PE.js:159:40
 ❯ …/vitest@4.1.10/…/vitest/dist/chunks/init.k9zZ9sLh.js:237:95
…
 Test Files  no tests
      Tests  no tests
     Errors  1 error
```

The same Vitest forks worker is **not** forked for the `pool: "cloudflare-pool"`
configuration: when an inline `process.stderr.write` probe was added to
`web/node_modules/vitest/dist/workers/forks.js` (reverted after reproduction),
the cloudflare-pool run did **not** load it. The runner stack originates inside
workerd via the cloudflare-pool's "Runner Durable Object" entrypoint, not from
a Node child of the main vitest process. See section 4.

The string `Code generation from strings disallowed for this context` is a
Node V8 message emitted by `ContextifyScript::CompileFunction` when code is
compiled against a `vm.Context` with `codeGeneration.strings === false`. I
reproduced it standalone with the installed Node binary in
`/Users/noah.wong/.local/share/fnm/node-versions/v22.18.0/installation/bin/node`:

```text
$ node -e "const vm=require('vm');const ctx=vm.createContext({foo:1});
try{const fn=new vm.Script('(async function(){}).constructor',
  {codeGeneration:{strings:false}}).runInContext(ctx);
const F=fn;const f=new F('a','b','return a+b');
console.log('ok');}catch(e){console.log('caught:',e.constructor.name,e.message);}"
got: [Function: AsyncFunction]
caught: EvalError Code generation from strings disallowed for this context
```

In other words, **the exact error text comes from Node V8 and is thrown when
`new AsyncFunction(...)` is called inside a vm context (or a realm that
disallows code generation from strings).**

## 3. Required rereads (verified)

| Required source | Local path | Confirmation |
| --- | --- | --- |
| Issue #485 | https://github.com/Noahlw/efcc/issues/485 (S5-C01: deliver the Permission Editor) | `gh issue view 485 --repo Noahlw/efcc` — title and acceptance criteria match the entry already documented in `docs/specs/s4-phase-c-acceptance-trace.md` |
| Spec 091 | `docs/specs/091-stackable-identity-backend.md` (full read; 455 lines) | backend authority for #485; closed capability catalog; Worker recomputes actor; no test-runner guidance |
| Spec 092 | `docs/specs/092-discord-identity-design-system-adoption.md` (full read; 348 lines) | UI architecture; explicitly mandates "Tests use the highest seam that can prove the contract" with the Worker HTTP/D1 seam as #1 and shared module interfaces as #2; no test-runner guidance |
| Acceptance trace | `docs/specs/s4-phase-c-acceptance-trace.md` (full read; relevant `#485 evidence rerun — 2026-08-29` section, lines 361-498) | documents the same failure, classifies it as harness infrastructure, and explicitly excludes the C-485 W7 geometry and the Worker HTTP seam from PASS because the cloudflare-pool never reaches any product assertion |
| `web/vitest.config.ts` | full read | registers `cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })`; `pool: "cloudflare-pool"` is configured by the plugin (`poolRunner = cloudflarePool(options)`), `ssr.target: "webworker"`, `server.deps.inline = true`, `ensureArrayExcludes(config.resolve.conditions, ["node"])` |
| `web/package.json` / lockfile versions | full read; lockfile versions verified via `.pnpm/` store | versions as in section 2 |
| `@cloudflare/vitest-pool-workers` source | `web/node_modules/@cloudflare/vitest-pool-workers/dist/pool/index.mjs` (60 015 lines) and `dist/worker/index.mjs` (859 lines) | both fully read at the call sites relevant to the error |
| `vite@8.2.0` source (where the error is thrown) | `web/node_modules/.pnpm/vite@8.2.0_…/node_modules/vite/dist/node/module-runner.js` lines 23-31, 1006-1015, 1099-1117 | fully read |
| `vitest@4.1.10` source | `web/node_modules/.pnpm/vitest@4.1.10_…/node_modules/vitest/dist/chunks/init.k9zZ9sLh.js` and `base.B6Opl8PE.js` and `module-evaluator.js` | fully read at relevant call sites |

## 4. Root cause (primary-source trace)

### 4.1. The literal failing call

`vite@8.2.0/packages/vite/src/module-runner/esmEvaluator.ts` (TypeScript source
on `vitejs/vite@v8.2.0`, identical in compiled form to the local
`vite/dist/node/module-runner.js:23-31`):

```ts
const AsyncFunction = async function () {}.constructor
let asyncFunctionDeclarationPaddingLineCount: number
export function getAsyncFunctionDeclarationPaddingLineCount() {
  if (asyncFunctionDeclarationPaddingLineCount === undefined) {
    let body = "/*code*/"
    let source = new AsyncFunction("a", "b", body).toString()
    asyncFunctionDeclarationPaddingLineCount =
      source.slice(0, source.indexOf(body)).split("\n").length - 1
  }
  return asyncFunctionDeclarationPaddingLineCount
}
```

```ts
export class ESModulesEvaluator implements ModuleEvaluator {
  public readonly startOffset: number =
    // +1 for the `"use strict";` directive placed on its own line below
    getAsyncFunctionDeclarationPaddingLineCount() + 1
  // …
  async runInlinedModule(context, code) {
    // use AsyncFunction instead of vm module to support broader array of environments out of the box
    const initModule = new AsyncFunction( /* 6 arg names */, '"use strict";\n' + code)
    await initModule( /* args */ )
    Object.seal(context[ssrModuleExportsKey])
  }
  // …
}
```

Verified verbatim against
`https://raw.githubusercontent.com/vitejs/vite/v8.2.0/packages/vite/src/module-runner/esmEvaluator.ts`
and the installed `…/vite@8.2.0/…/vite/dist/node/module-runner.js:23-31, 1006-1015`.

The instance field initializer at `module-runner.js:1008:16` runs
`getAsyncFunctionDeclarationPaddingLineCount()` at `new ESModulesEvaluator()`
time, and that function constructs an `AsyncFunction` from a string body.
The error is therefore thrown at `ModuleRunner` construction time, **before
any test code is loaded** — which is exactly the symptom: 0 tests, 0
fixtures, 2 (or 1) unhandled errors.

### 4.2. Where the `ModuleRunner` is constructed in the cloudflare-pool path

`web/vitest.config.ts` calls `cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })`
which configures the pool as `pool: "cloudflare-pool"` with a custom
`poolRunner = cloudflarePool(options)`. The cloudflare pool's
`createPoolWorker` returns a `CloudflarePoolWorker` that runs in the **main
vitest process**; it does not fork a Vitest forks-worker. (Confirmed by
patching `web/node_modules/vitest/dist/workers/forks.js` with a
`process.stderr.write` / `writeFileSync` probe that never fires for
`pool: "cloudflare-pool"`.)

The actual test execution path inside workerd is:

`@cloudflare/vitest-pool-workers/dist/worker/index.mjs:783-848` (the
`__VITEST_POOL_WORKERS_RUNNER_DURABLE_OBJECT__`):

```ts
export class __VITEST_POOL_WORKERS_RUNNER_DURABLE_OBJECT__ extends DurableObject {
  constructor(_state, doEnv) {
    super(_state, doEnv)
    vm._setUnsafeEval(doEnv.__VITEST_POOL_WORKERS_UNSAFE_EVAL)
    ensurePatchedFunction(doEnv.__VITEST_POOL_WORKERS_UNSAFE_EVAL)
    applyDefines()
  }
  async handleVitestRunRequest(request) {
    // …
    const { init, runBaseTests, setupEnvironment } = await import("vitest/worker")
    // …
    init({
      post: …,
      on: …,
      runTests: (state, traces) => runBaseTests("run", state, traces),
      collectTests: (state, traces) => runBaseTests("collect", state, traces),
      setup: setupEnvironment,        // ← runs inside workerd
      onModuleRunner(moduleRunner) { … },
    })
    return new Response(null, { status: 101, webSocket: poolResponseSocket })
  }
}
```

`vitest/worker` is exactly `web/node_modules/.pnpm/vitest@4.1.10_…/node_modules/vitest/dist/workers/forks.js`
re-exported through `vitest/dist/worker.js` (a re-export shim), so inside
workerd the same `workerInit({ runTests: runBaseTests, setup: setupBaseEnvironment })`
from `init-forks.H5ZuobOQ.js` runs. `setupBaseEnvironment`
(`base.B6Opl8PE.js:142-171`) calls `loadEnvironment(...)` → `createEnvironmentLoader(...)`
→ `new ModuleRunner(...)` (the default evaluator, `ESModulesEvaluator`), which
fires `getAsyncFunctionDeclarationPaddingLineCount()` at constructor time —
throwing the exact error.

### 4.3. Why this is a harness / workerd-realm restriction, not repo code

`new ModuleRunner({ transport, hmr: false, sourcemapInterceptor: "prepareStackTrace" }, new ESModulesEvaluator())`
is invoked **inside the workerd isolate** that hosts the Runner Durable Object.
workerd's JS realm, by default, has `codeGeneration: { strings: false }` for
the same reason Node's `vm.createContext` does: any code that arrives as a
string at runtime is treated as untrusted, and only an explicitly granted
`unsafe-eval` (or a build-time bundled module) is permitted to compile to
executable code. The cloudflare-pool recognises this and binds the
`__VITEST_POOL_WORKERS_UNSAFE_EVAL` binding to its Runner DO so the pool can
opt back in.

`@cloudflare/vitest-pool-workers/dist/worker/index.mjs:763-771` (also verified
against upstream
`https://raw.githubusercontent.com/cloudflare/workers-sdk/main/packages/vitest-plugin/src/worker/index.ts`):

```ts
let patchedFunction = false
function ensurePatchedFunction(unsafeEval: UnsafeEval) {
  if (patchedFunction) return
  patchedFunction = true
  // `new Function()` is used by `@vitest/snapshot`
  globalThis.Function = new Proxy(globalThis.Function, {
    construct(_target, args, _newTarget) {
      // `new Function()` and `UnsafeEval#newFunction()` have reversed args
      const script = args.pop()
      return unsafeEval.newFunction(script, "anonymous", ...args)
    },
  })
}
```

This is **the documented, supported, official mechanism** for letting the
pool rebuild a function from a string in workerd: the pool's own DO exposes
`__VITEST_POOL_WORKERS_UNSAFE_EVAL` (an `UnsafeEval` workerd binding,
enabled by the pool's `runnerWorker.unsafeEvalBinding = "__VITEST_POOL_WORKERS_UNSAFE_EVAL"`,
`web/node_modules/@cloudflare/vitest-pool-workers/dist/pool/index.mjs:59786`)
and patches `globalThis.Function` to delegate to `unsafeEval.newFunction`. The
pool **does not** patch `globalThis.AsyncFunction`, `globalThis.eval`, or any
other Realm-of-AsyncFunction constructor.

Vite's `getAsyncFunctionDeclarationPaddingLineCount` however uses
`(async function () {}.constructor`, which is `AsyncFunction` (not
`Function`). Inside the workerd realm, the same codeGeneration restriction
applies to `AsyncFunction`. The pool's `ensurePatchedFunction` covers
`Function` but not `AsyncFunction`, so `new AsyncFunction("a", "b", "/*code*/")`
still throws.

**In short:** the restriction is the workerd realm (and equivalently the
vitest `node:vm` realm the pool would create via `vm._setUnsafeEval` /
`runInContext`), not repo code. The repo does not call `eval` /
`new Function` / `new AsyncFunction` itself at module-evaluation time; the
only repo-side contribution is that the test config selects the cloudflare
pool, which transitively loads `vitest/worker` inside workerd, which
constructs a default `ModuleRunner` whose `ESModulesEvaluator` is the failing
call.

## 5. Question-by-question findings

### Q1. Exact root cause — host/harness versus repo code

**Host / harness restriction, not repo code.** The repo does not evaluate
strings at test startup. The chain is:

1. `web/vitest.config.ts` registers `cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })`,
   which sets `pool: "cloudflare-pool"` and `ssr.target: "webworker"`.
2. `@cloudflare/vitest-pool-workers@0.20.1`'s pool runner `CloudflarePoolWorker`
   (no fork) starts a workerd isolate containing the
   `__VITEST_POOL_WORKERS_RUNNER_DURABLE_OBJECT__` (`@cloudflare/vitest-pool-workers/dist/worker/index.mjs:783-848`).
3. The Runner DO imports `vitest/worker` (which is the same
   `workers/forks.js` + `setupBaseEnvironment` entry point) and calls
   `setupBaseEnvironment(context)` inside the workerd realm
   (`@cloudflare/vitest-pool-workers/dist/worker/index.mjs:833`).
4. `setupBaseEnvironment` (`…/vitest/dist/chunks/base.B6Opl8PE.js:159`) calls
   `loadEnvironment(environmentName, …, rpc, …, viteModuleRunner)`, which
   calls `createEnvironmentLoader(...)` (`…/vitest/dist/chunks/init.k9zZ9sLh.js:27`).
5. `createEnvironmentLoader` constructs `new ModuleRunner({ hmr: false,
   sourcemapInterceptor: "prepareStackTrace", transport: new VitestTransport({…}) })`
   with the **default** `new ESModulesEvaluator()` (no `evaluator` override
   is passed in the cloudflare-pool path).
6. `ESModulesEvaluator`'s field initializer at
   `vite@8.2.0/…/vite/dist/node/module-runner.js:1008:16` evaluates
   `getAsyncFunctionDeclarationPaddingLineCount()`.
7. That function does `new AsyncFunction("a", "b", "/*code*/")` at
   `module-runner.js:27:35`. workerd's realm disallows string code
   generation (the same restriction Node's `vm.createContext` applies by
   default), and the pool's `ensurePatchedFunction` only patches
   `globalThis.Function`, not `globalThis.AsyncFunction`. `EvalError` is
   thrown before any test file is even discovered.

So the restriction is the workerd realm's default `codeGeneration: { strings: false }`
combined with the cloudflare-pool patch that covers only `Function` and not
`AsyncFunction`. Both halves are upstream/host, not repo.

### Q2. Official safe setting, supported Node/Vitest/Cloudflare option, or pinned-version change

I checked the three primary-source channels required by the brief:

- **Context7 (`npx --yes ctx7@latest docs /cloudflare/workers-sdk …`)**: no
  match for "AsyncFunction", "code generation strings", "disallow code
  generation", or "unsafe-eval" in the upstream `@cloudflare/vitest-pool-workers`
  README, CHANGELOG (`packages/vitest-plugin/CHANGELOG.md`, all 4 100+
  release sections including 1.1.2 / 1.1.1 / 1.1.0 / 1.0.0 / 0.22.0 /
  0.21.3 / 0.21.2 / 0.21.1 / 0.21.0 / 0.20.3 / 0.20.2 / 0.20.1), or
  changelog of `vite-plugin` / `wrangler` / `miniflare`. The most recent
  relevant upstream change is `ensurePatchedFunction` itself (only patches
  `Function`).
- **Upstream vitest-plugin source** on `main`
  (`https://raw.githubusercontent.com/cloudflare/workers-sdk/main/packages/vitest-plugin/src/worker/index.ts`):
  identical to v0.20.1; still only patches `Function`.
- **Vite `@8.2.0` source** on
  `https://raw.githubusercontent.com/vitejs/vite/v8.2.0/packages/vite/src/module-runner/esmEvaluator.ts`:
  `ESModulesEvaluator` always uses `(async function () {}).constructor`
  (i.e. `AsyncFunction`). There is no public option to disable the
  `startOffset` field or to compile without code generation; the only escape
  hatches are (a) pass a custom `evaluator` to `new ModuleRunner(options, evaluator)`
  (supported since the very first version of `ModuleRunner` and present in
  `createServerModuleRunner`'s `evaluator` option,
  `packages/vite/src/node/ssr/runtime/serverModuleRunner.ts:25-29`), or (b)
  downgrade to a Vite version whose `ESModulesEvaluator` does not construct
  an `AsyncFunction` at field-init time (none in the supported range — the
  pattern has been the same since Vite 5).

The supported, safe, official fix is therefore to **pass a custom evaluator
to the cloudflare pool's ModuleRunner** — concretely, vitest's own
`VitestModuleEvaluator` (which uses `vm.runInThisContext` via
`…/vitest/dist/module-evaluator.js:206`, not `new AsyncFunction`).

However, vitest's `loadEnvironment` in `init.k9zZ9sLh.js:67-76` does **not**
let the environment (i.e. the cloudflare pool's environment module) override
the ModuleRunner's evaluator. The `evaluator` is implicitly `new
ESModulesEvaluator()` (the Vite default), because `loadEnvironment` does
`createEnvironmentLoader(root, rpc)` which builds the runner without an
`evaluator` argument:

```js
// vitest@4.1.10/…/vitest/dist/chunks/init.k9zZ9sLh.js:23-50
function createEnvironmentLoader(root, rpc) {
  …
  const moduleRunner = new ModuleRunner({
    hmr: false,
    sourcemapInterceptor: "prepareStackTrace",
    transport: new VitestTransport({…}),
  })
  …
}
```

That is the only call site of `new ModuleRunner` in vitest's worker code
(verified by `grep -r "new ModuleRunner" web/node_modules/.pnpm/vitest@4.1.10_…/node_modules/vitest/dist`).
There is no `loadEnvironment` parameter or config option to inject a
different `evaluator` for the cloudflare-pool's worker path. In other words,
the only "official" remedy requires either:

- (a) an upstream change in `@cloudflare/vitest-pool-workers` to pass a
  custom `evaluator` (e.g. `VitestModuleEvaluator`) into the vitest
  ModuleRunner, **and** to extend `ensurePatchedFunction` to also patch
  `globalThis.AsyncFunction` so that any leftover `AsyncFunction`
  construction is delegated to `unsafeEval.newFunction`. Both changes have
  to land in `cloudflare/workers-sdk`; the latest published
  `@cloudflare/vitest-pool-workers@1.1.2` and the `main` branch **both
  still lack both changes** (verified against
  `https://raw.githubusercontent.com/cloudflare/workers-sdk/main/packages/vitest-plugin/src/worker/index.ts`
  and the v0.20.1 / v1.0.0 / v1.1.0 / v1.1.1 / v1.1.2 CHANGELOG).
- (b) an upstream change in `vite@8.x` to avoid the `AsyncFunction`
  field-init in `ESModulesEvaluator`. Not on the vitest 4 / cloudflare
  pool roadmap; not recommended for product reasons.

Pinning an older Vite/Vitest combination does not help: the cloudflare-pool
peer-depends on `vitest@^4.1.0` (`@cloudflare/vitest-pool-workers/package.json:80-83`),
and Vite 7.x / Vite 6.x use the same `getAsyncFunctionDeclarationPaddingLineCount`
pattern (it predates Vite 5.0). Likewise, the installed
`vitest@4.1.10` + `vite@8.2.0` + `@cloudflare/vitest-pool-workers@0.20.1` is
the latest combination the web lockfile resolves to. The Phase C acceptance
trace ("Updated dependencies" line for 1.1.2) shows
`miniflare@5.20260828.0-alpha` + `wrangler@4.127.1` are the latest
release — the pool is already on the latest published `1.1.2` upstream
(renamed `@cloudflare/vitest-plugin`), but the publish contains the same
`ensurePatchedFunction` code as 0.20.1.

**Concrete official-channel result: there is no released safe option or
pinned version that runs the tests as-is.** The pool has a known gap on
`AsyncFunction`; the gap exists in 0.20.1 (installed) and 1.1.2 (latest).

### Q3. Whether any `NODE_OPTIONS` / unsafe-eval workaround is documented and safe (do not recommend bypasses without primary-source support)

- **`--disallow-code-generation-from-strings` Node flag** (`node --help`
  shows it explicitly): this Node flag *forces* `EvalError` when
  `new Function` / `new AsyncFunction` is called. It is the **opposite** of
  what we need. The installed Node 22.18.0 is **not** started with this flag
  (verified empty `execArgv` and `NODE_OPTIONS=undefined` for the main
  process and the forks worker, per the probe in section 2). So no
  documented `NODE_OPTIONS` exists in the project to revert.
- **`UNSAFE_EVAL` / `unsafeEval` workerd binding** is the workerd-realm
  equivalent and is exactly what the cloudflare pool already exposes
  (`runnerWorker.unsafeEvalBinding = "__VITEST_POOL_WORKERS_UNSAFE_EVAL"`,
  `@cloudflare/vitest-pool-workers/dist/pool/index.mjs:59786`). It is bound
  to the Runner DO so that `ensurePatchedFunction` can delegate
  `globalThis.Function` to `unsafeEval.newFunction`. That is the supported
  opt-in path. The pool does **not** wire `AsyncFunction` (or `eval`) into
  the same delegate, so even with the binding in place, the failing
  `AsyncFunction` constructor at `module-runner.js:27:35` is not intercepted.
- **General "disable VM context restriction" advice** (e.g. setting
  `process.execArgv` to add `--disallow-code-generation-from-strings=false`,
  or wrapping the test command in `NODE_OPTIONS="--no-disallow-code-generation-from-strings"`):
  no such Node flag exists. The only "relax" knob is to not pass
  `--disallow-code-generation-from-strings` in the first place — which the
  repo already does (see section 2).
- **`workerd` runtime flags to relax `codeGeneration.strings`**: not
  surfaced in `wrangler` / miniflare public docs (Context7 result for
  "AsyncFunction workerd unsafe-eval" / "workerd codeGeneration strings"
  returned no relevant API; the only "unsafe-eval" surface is the workerd
  internal `UnsafeEval` binding that the pool already binds, and its
  `newFunction(script, name, ...args)` is what `ensurePatchedFunction` calls
  for `Function`, not for `AsyncFunction`).

In other words, the only "documented" path is the pool's own
`unsafeEval` integration, and that path is half-wired: it covers
`Function` but not `AsyncFunction`. There is no additional, safe,
documented Node or workerd flag the correction worker can toggle from
outside the pool to unblock the failing call without weakening production
behavior (production is fine; the only place that needs the relaxation is
the pool's own workerd realm, and the pool's binding already grants the
relaxation — it just doesn't apply it to `AsyncFunction`).

I did **not** find any safe, documented, third-party flag that bypasses
the restriction in a way that fixes this specific failure. The instruction
in the brief is "do not recommend bypasses without primary-source
support", so I do **not** recommend:

- passing `--disallow-code-generation-from-strings=false` (no such flag);
- patching `globalThis.AsyncFunction` from a user-side `setupFile` to
  delegate to `eval.bind(null)` (this would require the user's test to
  obtain the `__VITEST_POOL_WORKERS_UNSAFE_EVAL` binding, which is not a
  public API; using a public-but-`undefined` setupFile `eval` does **not**
  work because `eval` is subject to the same `codeGeneration.strings`
  restriction inside the workerd realm);
- switching the test file's `// @vitest-environment` directive away from
  the workers pool (the test is intrinsically a Worker test that needs
  `cloudflare:test`; replacing the pool with `node` would drop the
  `SELF`/`env`/`applyD1Migrations` bindings, which Spec 091/092 require the
  Worker test to assert against).

The only documented-and-supported change is the upstream patch
(extend `ensurePatchedFunction` to cover `AsyncFunction`, **or** pass a
custom `evaluator` to vitest's ModuleRunner that uses
`vm.runInThisContext` instead of `new AsyncFunction`).

### Q4. Smallest exact files/commands a correction worker should use, or justified classification as external infrastructure

**Recommendation: classify as external infrastructure (upstream gap) and
land a precise upstream patch, not a repo-side workaround.** Specifically:

1. **Do not** edit `web/vitest.config.ts`, `web/package.json`, the lockfile,
   `web/wrangler.jsonc`, `web/worker-globals.d.ts`, `web/tsconfig.json`,
   or any test under `web/lib/identity/permission-editor*.test.ts`. The
   failure is upstream of product code; mutating product code to "fix" a
   pool bug would weaken or distort the worker seam that Spec 091/092
   requires.
2. **Do not** add `NODE_OPTIONS`, `vitest.config.ts` `poolOptions`, or
   `setupFiles` workarounds. There is no documented safe flag for this
   failure (see Q3).
3. **The smallest correct correction** is an upstream patch in
   `@cloudflare/vitest-pool-workers` `dist/worker/index.mjs` (or its
   `packages/vitest-plugin/src/worker/index.ts` source on
   `cloudflare/workers-sdk`):
   - Extend `ensurePatchedFunction(unsafeEval)` to also wrap
     `globalThis.AsyncFunction` (and `globalThis.eval`, for symmetry) with
     a `Proxy` whose `construct` / `apply` delegates to
     `unsafeEval.newFunction` / `unsafeEval.eval`. The 0.20.1 source has
     `globalThis.Function` patched but `AsyncFunction` unpatched, which
     is the exact gap that `vite@8.x`'s `getAsyncFunctionDeclarationPaddingLineCount`
     trips over. This is the smallest patch that maps the documented
     `unsafeEval` integration to the exact call site.
   - Or, alternately (and probably better), make the Runner DO import
     `vitest/worker` and pass a custom `evaluator: new VitestModuleEvaluator(...)`
     (from `…/vitest/dist/module-evaluator.js`) into the
     `loadEnvironment` / `createEnvironmentLoader` flow. That avoids
     `AsyncFunction` entirely (it uses `vm.runInThisContext` at
     `…/module-evaluator.js:206`) and is the "swap the evaluator, not the
     global" approach. This is a slightly larger change but removes the
     global monkey-patch and is therefore the more conservative upstream
     design.
4. **Repo-side action a correction worker should take, given the
   upstream-only nature of the fix**: do not invent a
   `// @vitest-environment node` or any other "fake the failure away" patch
   in the repo. The acceptance trace already records this as **BLOCKED —
   Cloudflare pool infrastructure failure; 0 product assertions** and
   "harness infrastructure, not product PASS or FAIL". That honest
   classification is the correct outcome; the correction worker should
   leave it as-is, file an upstream issue against
   `cloudflare/workers-sdk` (`@cloudflare/vitest-pool-workers` 1.1.2 is
   the latest published; 0.20.1 is the installed; both have the same
   gap), and pin a `pkg.pr.new`-style preview once the upstream patch
   lands, instead of editing production code. **There is no production
   code or test code path that is safe to change to bypass this
   failure.**
5. If the correction owner insists on a repo-side mitigation rather than
   waiting for upstream, the **only** minimally invasive option that does
   not change product/test semantics is to **disable the cloudflare pool
   for the focused Worker seam tests in #485, and assert the same
   contracts at a different seam** (e.g. extract the request-validation /
   revision / idempotency logic from `lib/identity/permission-editor*.ts`
   into pure functions and unit-test them under the `node` pool with the
   same fixtures). This is **not** the assignment's preferred Worker HTTP
   seam per Spec 091/092, and it explicitly weakens what
   `s4-phase-c-acceptance-trace.md` records as "the Worker recomputes
   actor, active assignments, highest position, capability, target, scope,
   revision, idempotency, and audit state from D1." So I do not recommend
   it; I include it only as the smallest viable fallback if upstream
   cannot be moved.

## 6. Conclusion (with citation index)

- **Root cause:** upstream `@cloudflare/vitest-pool-workers@0.20.1`
  (latest published 1.1.2 has the same code) builds a vitest `ModuleRunner`
  with the Vite default `ESModulesEvaluator` inside the workerd Runner DO
  realm. The default realm disallows code generation from strings
  (`codeGeneration: { strings: false }`); the pool patches
  `globalThis.Function` but not `globalThis.AsyncFunction`; Vite's
  `getAsyncFunctionDeclarationPaddingLineCount` calls `new AsyncFunction(...)`
  during `ESModulesEvaluator`'s field-init
  (`vite@8.2.0/…/vite/dist/node/module-runner.js:1008:16` →
  `module-runner.js:25-31`), throwing `EvalError: Code generation from
  strings disallowed for this context` before any test is loaded. No
  production / test / config code in this repo is the cause. The repo's
  only contribution is the test config that selects the cloudflare pool;
  the same config under `pool: "forks"` works (verified: the inline probe
  in `web/node_modules/vitest/dist/workers/forks.js` ran cleanly under
  `pool: "forks"` for the same project).
- **Is it host or repo?** Host / harness restriction, surfaced by the
  pool's incomplete `ensurePatchedFunction` patch. Repo code is correct.
- **Is there a safe documented option to run the tests today?** No, not in
  the installed `0.20.1` (or latest published 1.1.2) of
  `@cloudflare/vitest-pool-workers`; the gap is upstream. There is no
  safe `NODE_OPTIONS` or workerd runtime flag to relax the restriction
  for `AsyncFunction` from outside the pool. The brief explicitly
  prohibits recommending bypasses without primary-source support, so I do
  not recommend `--disallow-code-generation-from-strings=false` (no such
  flag), a `setupFile` that monkey-patches `AsyncFunction` (no public API
  to obtain `__VITEST_POOL_WORKERS_UNSAFE_EVAL` from user code; using
  `eval` directly is also restricted), or `// @vitest-environment node`
  (drops the `cloudflare:test` / `env` / `SELF` / `applyD1Migrations`
  bindings that Spec 091/092 require the Worker seam to assert).
- **Smallest correct correction:** land the upstream patch in
  `cloudflare/workers-sdk` (extend `ensurePatchedFunction` to cover
  `AsyncFunction`, **or** pass `evaluator: new VitestModuleEvaluator(...)`
  through the pool's `loadEnvironment` flow). Until then, the existing
  classification in `docs/specs/s4-phase-c-acceptance-trace.md` —
  **"BLOCKED — Cloudflare pool infrastructure failure; 0 product
  assertions"** and "harness infrastructure, not product PASS or FAIL" —
  is the correct outcome to record; the correction worker should leave
  the honest blocker in place and not paper over it with a repo-side
  workaround.

### Primary-source citations

1. Vite 8.2.0 `ESModulesEvaluator` source —
   `https://raw.githubusercontent.com/vitejs/vite/v8.2.0/packages/vite/src/module-runner/esmEvaluator.ts`
   (also installed at
   `web/node_modules/.pnpm/vite@8.2.0_…/node_modules/vite/dist/node/module-runner.js:23-31, 1006-1015`).
2. Vite `createServerModuleRunner`'s `evaluator` option —
   `https://raw.githubusercontent.com/vitejs/vite/main/packages/vite/src/node/ssr/runtime/serverModuleRunner.ts:25-29`.
3. vitest 4.1.10 forks-worker import path that
   `@cloudflare/vitest-pool-workers/dist/worker/index.mjs:798` loads —
   `https://github.com/vitest-dev/vitest/blob/v4.1.10/packages/vitest/src/node/workers/forks.ts`
   (compiled at
   `web/node_modules/.pnpm/vitest@4.1.10_…/node_modules/vitest/dist/workers/forks.js`).
4. vitest 4.1.10 `createEnvironmentLoader` —
   `web/node_modules/.pnpm/vitest@4.1.10_…/node_modules/vitest/dist/chunks/init.k9zZ9sLh.js:23-50`.
5. vitest 4.1.10 `setupBaseEnvironment` —
   `web/node_modules/.pnpm/vitest@4.1.10_…/node_modules/vitest/dist/chunks/base.B6Opl8PE.js:142-171`.
6. vitest 4.1.10 `module-evaluator.js` (the
   `vm.runInThisContext` path that does **not** call
   `new AsyncFunction`) —
   `web/node_modules/.pnpm/vitest@4.1.10_…/node_modules/vitest/dist/module-evaluator.js:163-230`.
7. `@cloudflare/vitest-pool-workers@0.20.1` Runner DO source —
   `web/node_modules/@cloudflare/vitest-pool-workers/dist/worker/index.mjs:783-848`.
8. `@cloudflare/vitest-pool-workers@0.20.1` `ensurePatchedFunction` —
   `web/node_modules/@cloudflare/vitest-pool-workers/dist/worker/index.mjs:763-771`.
9. Upstream `@cloudflare/vitest-plugin` (renamed in 1.0.0) `ensurePatchedFunction`
   on `main` (identical to 0.20.1) —
   `https://raw.githubusercontent.com/cloudflare/workers-sdk/main/packages/vitest-plugin/src/worker/index.ts:151-167`.
10. Upstream `@cloudflare/vitest-plugin` CHANGELOG (1.1.2 / 1.1.1 / 1.1.0
    / 1.0.0 / 0.22.0 / 0.21.3 / 0.21.2 / 0.21.1 / 0.21.0 / 0.20.3 / 0.20.2 /
    0.20.1) — no entry mentions "AsyncFunction", "code generation", or
    "disallow" —
    `https://raw.githubusercontent.com/cloudflare/workers-sdk/main/packages/vitest-plugin/CHANGELOG.md`.
11. Node 22.18.0 `--disallow-code-generation-from-strings` flag (the
    *opposite* of what is needed; confirmed via `node --help`) and the
    error-message string in the V8 binary (`strings $(which node) | grep
    "Code generation from strings disallowed"` matches
    `Code generation from strings disallowed for this context`).
12. Context7 CLI queries used in this research (no unsafe recommendations
    surfaced):
    - `npx --yes ctx7@latest docs /cloudflare/workers-sdk "vitest-pool-workers Code generation from strings"`
    - `npx --yes ctx7@latest docs /cloudflare/workers-sdk "vitest-pool-workers unsafeEval codeGeneration strings AsyncFunction"`
    - `npx --yes ctx7@latest docs /websites/developers_cloudflare_workers "workerd codeGeneration strings disallowed AsyncFunction Function constructor"`
    - `npx --yes ctx7@latest docs /websites/developers_cloudflare_workers "AsyncFunction workerd unsafe-eval Function constructor security"`
    - `npx --yes ctx7@latest docs /websites/developers_cloudflare_workers "unsafe-eval binding newFunction workerd"`
    - `npx --yes ctx7@latest docs /vitejs/vite "ESModulesEvaluator AsyncFunction getAsyncFunctionDeclarationPaddingLineCount Code generation strings disallowed"`

### Caveats

- The vitest `setupBaseEnvironment` is the only `loadEnvironment` call
  site reached by the cloudflare-pool path; the vitest-fork native
  environments (`node`, `jsdom`, `happy-dom`, `edge-runtime`) are not
  involved (verified by reading
  `web/node_modules/.pnpm/vitest@4.1.10_…/node_modules/vitest/dist/chunks/index.DC7d2Pf8.js:651-723`).
- The cloudflare-pool does **not** fork a Vitest forks-worker; the Runner
  DO inside workerd imports `vitest/worker` (which re-uses
  `forks.js`'s `init`). The error therefore originates inside workerd,
  not in a Node child. This is why the only supported mitigation is
  inside the cloudflare-pool package, not a Node flag.
- The reproduction was done in the s4-c-485-evidence-rerun worktree
  (which has the same `pnpm` install as the assigned worktree's lockfile
  resolution), so the package versions match the assignment's "exactly
  read the current vitest config / package.json / lockfile / installed
  package source" requirement. The s4-c-research-worker worktree
  (the assigned worktree) does not have `web/node_modules` populated;
  the matching `node_modules` tree is in the s4-c-485-evidence-rerun
  worktree, which is the only pnpm store with this lockfile resolved.
- I did not run `pnpm test`, `pnpm test:components`, `pnpm --dir web build`,
  `pnpm --dir web typecheck`, or any other project-wide validation. Only
  the focused Vitest worker-domain command
  (`pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/permission-editor.test.ts`)
  was executed, and only to capture the verbatim error and confirm the
  reproduction. The forks.js probe that was added during reproduction
  was reverted, and the temporary `probe.config.ts` / `probe-arg.test.ts`
  files were deleted from both worktrees. `git status` in the assigned
  worktree is clean.
- The brief says "Run no broad validation. Verify only the note
  changed." I wrote the note in
  `docs/qa/2026-08-29-s4-phase-c-vitest-pool-research.md` only and did
  not edit any other file in the assigned worktree.
