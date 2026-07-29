// Vitest suite for the Programs Section async recovery controller
// (issue #69 — make every asynchronous transition recover visibly,
// prerequisite slice of #53).
//
// Strategy: same harness pattern as nested-task-navigation.test.js —
// extract the JavaScript from shell-session.js.html's <script> block
// and evaluate it inside a node:vm context against a purpose-built
// fake DOM, localStorage, and google.script.run fake. This file uses
// a CONTROLLABLE google.script.run fake (manual resolve/reject per
// call, not an auto-dispatched queue) so stale/out-of-order response
// scenarios can be driven precisely from the test body.
//
// Coverage (issue #69 AC, scoped to the real Programs Section RPC):
//   AC #1 — shell stays mounted through loading/success/failure/retry
//   AC #2 — client request ID (callServer_ tag) per async load
//   AC #3 — late response from an abandoned Section is ignored
//           (Programs -> Events, and Programs -> task-open)
//   AC #4 — repeated taps on the same pending navigation are no-ops
//   AC #5 — distinct Traditional Chinese copy per error/state code
//   AC #6 — retry repeats only the failed operation
//   AC #7 — FORBIDDEN refreshes authorization
//   AC #8 — SESSION_EXPIRED (AUTH_REQUIRED) clears state, shows Login
//   AC #9 — rendering exception caught at the Section boundary
//   AC #11 — repeat-navigation stress test

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { describe, test } from "vitest";

const __dirname = import.meta.dirname;
const REPO_ROOT = path.join(__dirname, "..", "..");
const SHELL_SESSION = path.join(
  REPO_ROOT,
  "src",
  "gas",
  "shell-session.js.html"
);

// ---------------------------------------------------------------------------
// Source extraction
// ---------------------------------------------------------------------------

function loadShellSessionSource() {
  const raw = readFileSync(SHELL_SESSION, "utf-8");
  const match = raw.match(/<script[^>]*>(?<body>[\s\S]*?)<\/script>/iu);
  assert.ok(match !== null, "shell-session.js.html must contain a <script>");
  return match[1];
}

const FORM_GUARD = path.join(REPO_ROOT, "src", "gas", "form-guard.js.html");

function loadFormGuardSource() {
  const raw = readFileSync(FORM_GUARD, "utf-8");
  const match = raw.match(/<script[^>]*>(?<body>[\s\S]*?)<\/script>/iu);
  assert.ok(match !== null, "form-guard.js.html must contain a <script> block");
  return match[1];
}

// ---------------------------------------------------------------------------
// Minimal localStorage shim
// ---------------------------------------------------------------------------

function createLocalStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(String(key), String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

// ---------------------------------------------------------------------------
// Minimal fake DOM (mirrors src/gas/App.html)
// ---------------------------------------------------------------------------

function makeEvent(type) {
  return {
    type,
    target: null,
    currentTarget: null,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

function createFakeDom() {
  // eslint-disable-next-line unicorn/consistent-function-scoping
  function makeClassList(initial = []) {
    const set = new Set(initial);
    return {
      add: (...names) => {
        for (const n of names) {
          set.add(n);
        }
      },
      remove: (...names) => {
        for (const n of names) {
          set.delete(n);
        }
      },
      toggle(name, force) {
        const on = force === undefined ? !set.has(name) : !!force;
        if (on) {
          set.add(name);
        } else {
          set.delete(name);
        }
        return on;
      },
      contains: (name) => set.has(name),
      toString: () => [...set].join(" "),
    };
  }

  function makeElement(tag, attrs = {}) {
    const classes = attrs.class
      ? String(attrs.class).split(/\s+/u).filter(Boolean)
      : [];
    const el = {
      tagName: String(tag).toUpperCase(),
      id: attrs.id ?? "",
      nodeType: 1,
      childNodes: [],
      children: [],
      attributes: { ...attrs },
      _listeners: new Map(),
      _textContent: "",
      _hidden: "hidden" in attrs,
      scrollTop: 0,
      classList: makeClassList(classes),
      get textContent() {
        if (el._textContent) {
          return el._textContent;
        }
        return el.childNodes.map((n) => n.textContent ?? "").join("");
      },
      set textContent(value) {
        el._textContent = String(value ?? "");
        el.childNodes = [];
        el.children = [];
      },
      get hidden() {
        return el._hidden;
      },
      set hidden(v) {
        el._hidden = !!v;
      },
      getAttribute(name) {
        return Object.hasOwn(el.attributes, name)
          ? String(el.attributes[name])
          : null;
      },
      setAttribute(name, value) {
        el.attributes[name] = String(value);
        if (name === "hidden") {
          el._hidden = true;
        }
      },
      removeAttribute(name) {
        if (name === "hidden") {
          el._hidden = false;
        }
        // oxlint-disable-next-line typescript/no-dynamic-delete
        delete el.attributes[name];
      },
      hasAttribute: (name) => Object.hasOwn(el.attributes, name),
      addEventListener(type, listener) {
        if (!el._listeners.has(type)) {
          el._listeners.set(type, []);
        }
        el._listeners.get(type).push(listener);
      },
      removeEventListener(type, listener) {
        const arr = el._listeners.get(type);
        if (!arr) {
          return;
        }
        const idx = arr.indexOf(listener);
        if (idx !== -1) {
          arr.splice(idx, 1);
        }
      },
      appendChild(child) {
        el.childNodes.push(child);
        if (child && child.nodeType === 1) {
          el.children.push(child);
        }
        return child;
      },
      append(...children) {
        for (const child of children) {
          el.childNodes.push(child);
          if (child && child.nodeType === 1) {
            el.children.push(child);
          }
        }
      },
      removeChild(child) {
        const i = el.childNodes.indexOf(child);
        if (i !== -1) {
          el.childNodes.splice(i, 1);
        }
        const j = el.children.indexOf(child);
        if (j !== -1) {
          el.children.splice(j, 1);
        }
        return child;
      },
      focus() {},
      blur() {},
    };
    return el;
  }

  const document = makeElement("#document", {});
  const app = makeElement("div", { id: "app", "data-app-state": "BOOTING" });
  const header = makeElement("header", { id: "app-header" });
  const status = makeElement("div", { id: "app-status", role: "status" });
  const content = makeElement("main", { id: "app-content" });
  const navPhone = makeElement("nav", { id: "app-nav-phone", hidden: "" });
  const navDesktop = makeElement("nav", { id: "app-nav-desktop", hidden: "" });
  app.append(header);
  app.append(status);
  app.append(content);
  app.append(navPhone);
  app.append(navDesktop);

  const index = {
    app,
    "app-header": header,
    "app-status": status,
    "app-content": content,
    "app-nav-phone": navPhone,
    "app-nav-desktop": navDesktop,
  };

  const listeners = new Map();
  document._listeners = listeners;
  document.getElementById = (id) => (id in index ? index[id] : null);
  document.createElement = (tag) => {
    const node = makeElement(String(tag).toLowerCase(), {});
    const origSet = node.setAttribute;
    node.setAttribute = function setAttribute(name, value) {
      origSet.call(node, name, value);
      if (name === "id" && value) {
        index[value] = node;
      }
    };
    return node;
  };
  document.createTextNode = (text) => {
    const t = makeElement("#text", {});
    t._textContent = String(text ?? "");
    t.nodeType = 3;
    t.tagName = "#text";
    return t;
  };
  document.addEventListener = (type, fn) => {
    if (!listeners.has(type)) {
      listeners.set(type, []);
    }
    listeners.get(type).push(fn);
  };

  document.createDocumentFragment = () => {
    const frag = {
      _children: [],
      childNodes: [],
      appendChild(child) {
        frag._children.push(child);
        frag.childNodes.push(child);
        return child;
      },
      get firstChild() {
        return frag._children[0] || null;
      },
    };
    return frag;
  };

  document.querySelector = (selector) => {
    // Support [data-action="value"] selectors used in the source.
    const attrMatch = selector.match(
      /^\[(?<name>[a-zA-Z-]+)="(?<value>[^"]*)"\]$/u
    );
    if (attrMatch) {
      const { name } = attrMatch.groups;
      const { value } = attrMatch.groups;
      const walk = (node) => {
        if (node.getAttribute && node.getAttribute(name) === value) {
          return node;
        }
        if (node.children) {
          for (const child of node.children) {
            const found = walk(child);
            if (found) {
              return found;
            }
          }
        }
        return null;
      };
      return walk(document.body || app);
    }
    return null;
  };

  return { document, index };
}

// ---------------------------------------------------------------------------
// Controllable google.script.run fake — every call is captured with
// explicit resolve()/reject() functions the test invokes manually,
// rather than an auto-dispatching queue. This gives exact control
// over response ORDER, which is what the stale-response tests need.
// ---------------------------------------------------------------------------

function createControllableGoogleRun() {
  const pending = [];

  function makeBuilder() {
    const builder = {
      _success: null,
      _failure: null,
      withSuccessHandler(fn) {
        builder._success = fn;
        return builder;
      },
      withFailureHandler(fn) {
        builder._failure = fn;
        return builder;
      },
    };
    for (const name of [
      "api_loginUser",
      "api_restoreApp",
      "api_logoutUser",
      "api_getPrograms",
    ]) {
      builder[name] = (...args) => {
        const entry = {
          method: name,
          args,
          resolve(value) {
            if (typeof builder._success === "function") {
              builder._success(value);
            }
          },
          reject(err) {
            if (typeof builder._failure === "function") {
              builder._failure(err);
            }
          },
        };
        pending.push(entry);
        return builder;
      };
    }
    return builder;
  }

  const run = { pending };
  Object.defineProperty(run, "run", {
    get: () => makeBuilder(),
    configurable: true,
  });
  return run;
}

// ---------------------------------------------------------------------------
// Boot the controller inside a vm context
// ---------------------------------------------------------------------------

function bootShellSession({ storedSession = null } = {}) {
  const localStorage = createLocalStorage();
  if (storedSession) {
    localStorage.setItem("efccSession", JSON.stringify(storedSession));
  }
  const dom = createFakeDom();
  const googleRun = createControllableGoogleRun();

  const context = {
    console,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    Promise,
    JSON,
    Date,
    Math,
    localStorage,
    document: dom.document,
    window: {},
    google: { script: googleRun },
  };
  context.window.document = dom.document;
  context.window.localStorage = localStorage;
  context.window.google = context.google;
  context.window.queueMicrotask = queueMicrotask;
  context.window.Promise = Promise;
  context.window.setTimeout = setTimeout;
  context.window.clearTimeout = clearTimeout;
  context.self = context;

  vm.createContext(context);
  // Load form-guard.js.html BEFORE shell-session.js.html per App.html.
  vm.runInContext(loadFormGuardSource(), context, {
    filename: "form-guard.js.html",
  });
  vm.runInContext(loadShellSessionSource(), context, {
    filename: "shell-session.js.html",
  });

  const ready = makeEvent("DOMContentLoaded");
  const docListeners =
    context.document._listeners?.get("DOMContentLoaded") ?? [];
  for (const fn of docListeners) {
    fn(ready);
  }

  return { dom, localStorage, googleRun, context };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function bootstrapDto(overrides = {}) {
  return {
    session: {
      userId: "U001",
      name: "王小明",
      role: "MEMBER",
      qrCodeString: "QR-U001",
      sessionId: "sid-001",
      sessionToken: "tok-001",
    },
    sections: [
      { key: "profile", label: "個人資料", capability: "READ" },
      { key: "programs", label: "課程", capability: "READ" },
      { key: "events", label: "聚會", capability: "READ" },
    ],
    profile: {
      userId: "U001",
      name: "王小明",
      username: "user001",
      phone: "91234567",
      role: "MEMBER",
      status: "Active",
      qrCodeString: "QR-U001",
    },
    ...overrides,
  };
}

function programsEnvelope(items) {
  return { success: true, requestId: "req-programs", data: items };
}

function failureEnvelope(code, message) {
  return {
    success: false,
    requestId: "req-fail",
    error: { code, message },
  };
}

async function flushMicrotasks() {
  for (let i = 0; i < 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
  // eslint-disable-next-line promise/avoid-new
  await new Promise((resolve) => {
    setTimeout(resolve, 5);
  });
  for (let i = 0; i < 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

function getTest(context) {
  return context.window.__test__;
}

function collectText(el) {
  if (!el) {
    return "";
  }
  if (el.nodeType === 3) {
    return el.textContent || "";
  }
  if (!el.children || el.children.length === 0) {
    return el.textContent || "";
  }
  let out = "";
  for (const c of el.children) {
    out += collectText(c);
  }
  return out;
}

async function bootAndLogin() {
  const stored = {
    userId: "U001",
    sessionId: "sid-001",
    sessionToken: "tok-001",
  };
  const { dom, context, googleRun } = bootShellSession({
    storedSession: stored,
  });
  await flushMicrotasks();
  // The restore call is pending[0].
  const restoreCall = googleRun.pending.shift();
  assert.equal(restoreCall.method, "api_restoreApp");
  restoreCall.resolve({ success: true, requestId: "r1", data: bootstrapDto() });
  await flushMicrotasks();
  return { dom, context, googleRun };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Programs Section async recovery — issue #69 (prerequisite slice of #53)", () => {
  test("AC #1/#2: navigating to Programs shows loading, then READY content via the tagged RPC", async () => {
    const { dom, context, googleRun } = await bootAndLogin();
    const hooks = getTest(context);
    const content = dom.index["app-content"];

    hooks.navigateTo_("programs");
    // Loading card renders synchronously before the RPC resolves.
    assert.ok(
      collectText(content).includes("載入中"),
      "should show loading state immediately"
    );
    assert.equal(hooks.getSectionState_("programs"), "LOADING");

    const call = googleRun.pending.shift();
    assert.equal(call.method, "api_getPrograms");
    assert.deepEqual(call.args, ["U001", "sid-001", "tok-001"]);

    call.resolve(
      programsEnvelope([
        { id: "P1", name: "青崇", type: "Youth", description: "desc" },
      ])
    );
    await flushMicrotasks();

    assert.equal(hooks.getSectionState_("programs"), "READY");
    assert.ok(collectText(content).includes("課程"));
    assert.ok(collectText(content).includes("青崇"));
    // Shell stays mounted throughout.
    assert.ok(dom.index["app-header"]);
    assert.ok(dom.index["app-status"]);
  });

  test("AC #5: EMPTY state shows distinct copy for zero programs", async () => {
    const { dom, context, googleRun } = await bootAndLogin();
    const hooks = getTest(context);
    const content = dom.index["app-content"];

    hooks.navigateTo_("programs");
    const call = googleRun.pending.shift();
    call.resolve(programsEnvelope([]));
    await flushMicrotasks();

    assert.equal(hooks.getSectionState_("programs"), "EMPTY");
    assert.ok(collectText(content).includes("目前沒有課程資料"));
  });

  test("AC #5: TRANSPORT failure shows distinct copy with retry", async () => {
    const { dom, context, googleRun } = await bootAndLogin();
    const hooks = getTest(context);
    const content = dom.index["app-content"];

    hooks.navigateTo_("programs");
    const call = googleRun.pending.shift();
    call.reject(new Error("network down"));
    await flushMicrotasks();

    assert.equal(hooks.getSectionState_("programs"), "ERROR");
    assert.equal(hooks.getSectionErrorCode_("programs"), "TRANSPORT");
    const text = collectText(content);
    assert.ok(text.includes("網絡連線失敗"));
    assert.ok(text.includes("重試"));
  });

  test("AC #5: FORBIDDEN and SESSION_EXPIRED are handled distinctly, not via the generic error card", async () => {
    const { context, googleRun } = await bootAndLogin();
    const hooks = getTest(context);

    hooks.navigateTo_("programs");
    const call = googleRun.pending.shift();
    call.resolve(failureEnvelope("FORBIDDEN", "你沒有權限使用此功能。"));
    await flushMicrotasks();

    assert.equal(hooks.getSectionState_("programs"), "ERROR");
    assert.equal(hooks.getSectionErrorCode_("programs"), "FORBIDDEN");
    // FORBIDDEN triggers refreshAuthorization_, which re-issues restore.
    const nextCall = googleRun.pending.shift();
    assert.equal(
      nextCall.method,
      "api_restoreApp",
      "FORBIDDEN must trigger an authorization refresh"
    );
  });

  test("AC #8: AUTH_REQUIRED (session expired) clears state and shows Login in the same document", async () => {
    const { dom, context, googleRun } = await bootAndLogin();
    const hooks = getTest(context);
    const content = dom.index["app-content"];

    hooks.navigateTo_("programs");
    const call = googleRun.pending.shift();
    call.resolve(failureEnvelope("AUTH_REQUIRED", "登入工作階段已失效。"));
    await flushMicrotasks();

    const text = collectText(content);
    assert.ok(text.includes("登入"), "Login view should render");
    assert.ok(dom.index["app-nav-phone"].hasAttribute("hidden"));
    assert.ok(dom.index["app-nav-desktop"].hasAttribute("hidden"));
  });

  test("AC #3: a late response from Programs after navigating to Events does not overwrite Events", async () => {
    const { dom, context, googleRun } = await bootAndLogin();
    const hooks = getTest(context);
    const content = dom.index["app-content"];

    hooks.navigateTo_("programs");
    const programsCall = googleRun.pending.shift();
    assert.equal(programsCall.method, "api_getPrograms");

    // Navigate away BEFORE the Programs RPC resolves.
    hooks.navigateTo_("events");
    assert.ok(
      collectText(content).includes("聚會"),
      "Events should render synchronously"
    );

    // The stale Programs response now arrives.
    programsCall.resolve(
      programsEnvelope([
        { id: "P1", name: "青崇", type: "Youth", description: "desc" },
      ])
    );
    await flushMicrotasks();

    // Events must still be showing — Programs' late response must be dropped.
    assert.ok(
      collectText(content).includes("聚會"),
      "stale Programs response must not overwrite Events"
    );
    assert.ok(
      !collectText(content).includes("青崇"),
      "stale Programs data must not leak into the DOM"
    );
    // sectionStates_.programs must NOT have been mutated to READY by
    // the dropped response — it must remain whatever the generation
    // check left it as (LOADING, since the response never landed).
    assert.equal(
      hooks.getSectionState_("programs"),
      "LOADING",
      "dropped response must not mutate sectionStates_.programs"
    );
  });

  test("AC #3: a late FAILURE response from Programs after navigating away does not render an error over the new view", async () => {
    const { dom, context, googleRun } = await bootAndLogin();
    const hooks = getTest(context);
    const content = dom.index["app-content"];

    hooks.navigateTo_("programs");
    const programsCall = googleRun.pending.shift();

    hooks.navigateTo_("profile");
    assert.ok(collectText(content).includes("個人資料"));

    programsCall.reject(new Error("late failure"));
    await flushMicrotasks();

    assert.ok(
      collectText(content).includes("個人資料"),
      "stale Programs failure must not overwrite Profile"
    );
    assert.ok(!collectText(content).includes("網絡連線失敗"));
    assert.equal(
      hooks.getSectionState_("programs"),
      "LOADING",
      "dropped failure must not mutate sectionStates_.programs to ERROR"
    );
  });

  test("AC #3: a late Programs response after opening a nested task does not overwrite the task view", async () => {
    const { dom, context, googleRun } = await bootAndLogin();
    const hooks = getTest(context);
    const content = dom.index["app-content"];

    hooks.navigateTo_("programs");
    const programsCall = googleRun.pending.shift();

    // Open a task on top of the still-loading Programs section.
    hooks.openTask_({
      key: "programs-detail-demo",
      parentSection: "programs",
      parentLabel: "課程",
      title: "詳情",
      kind: "detail",
    });
    assert.ok(collectText(content).includes("詳情"), "task view should render");

    // Programs' late response arrives while the task is open.
    programsCall.resolve(
      programsEnvelope([
        { id: "P1", name: "青崇", type: "Youth", description: "desc" },
      ])
    );
    await flushMicrotasks();

    assert.ok(
      collectText(content).includes("詳情"),
      "stale Programs response must not overwrite the open task view"
    );
    assert.ok(!collectText(content).includes("青崇"));
    assert.equal(
      hooks.getSectionState_("programs"),
      "LOADING",
      "dropped response must not mutate sectionStates_.programs"
    );
  });

  test("malformed success envelope (non-array data) is treated as an error, not EMPTY", async () => {
    const { dom, context, googleRun } = await bootAndLogin();
    const hooks = getTest(context);
    const content = dom.index["app-content"];

    hooks.navigateTo_("programs");
    const call = googleRun.pending.shift();
    // Malformed: success:true but data is not an array.
    call.resolve({ success: true, requestId: "req-bad", data: { oops: true } });
    await flushMicrotasks();

    assert.equal(
      hooks.getSectionState_("programs"),
      "ERROR",
      "malformed data must not be silently treated as EMPTY"
    );
    assert.equal(hooks.getSectionErrorCode_("programs"), "INTERNAL_ERROR");
    const text = collectText(content);
    assert.ok(
      !text.includes("目前沒有課程資料"),
      "must not show the EMPTY copy"
    );
    assert.ok(text.includes("伺服器錯誤"));
  });

  test("revisiting Programs after abandoning a stale LOADING load restarts and succeeds (no permanent spinner)", async () => {
    const { dom, context, googleRun } = await bootAndLogin();
    const hooks = getTest(context);
    const content = dom.index["app-content"];

    // Start Programs, abandon it by navigating to Events before it resolves.
    hooks.navigateTo_("programs");
    const abandonedCall = googleRun.pending.shift();
    hooks.navigateTo_("events");
    assert.ok(collectText(content).includes("聚會"));

    // Revisit Programs. Per the design, sectionStates_.programs is
    // still "LOADING" (stale) at this point, but re-entering must
    // start a genuinely NEW request rather than freezing on the old
    // (now-abandoned) loading card forever.
    hooks.navigateTo_("programs");
    assert.ok(
      collectText(content).includes("載入中"),
      "revisiting Programs must show a fresh loading state"
    );
    assert.equal(
      googleRun.pending.length,
      1,
      "revisiting must issue exactly one new api_getPrograms call"
    );
    const freshCall = googleRun.pending.shift();
    assert.equal(freshCall.method, "api_getPrograms");

    // The abandoned FIRST call finally resolves — must still be dropped.
    abandonedCall.resolve(
      programsEnvelope([
        { id: "STALE", name: "舊資料", type: "x", description: "d" },
      ])
    );
    await flushMicrotasks();
    assert.ok(
      !collectText(content).includes("舊資料"),
      "abandoned response must not apply"
    );

    // The fresh call resolves and must render successfully.
    freshCall.resolve(
      programsEnvelope([
        { id: "P1", name: "青崇", type: "Youth", description: "d" },
      ])
    );
    await flushMicrotasks();
    assert.equal(hooks.getSectionState_("programs"), "READY");
    assert.ok(
      collectText(content).includes("青崇"),
      "fresh response must render"
    );
  });

  test("AC #6: retry after a transport failure re-issues exactly one new api_getPrograms call", async () => {
    const { context, googleRun } = await bootAndLogin();
    const hooks = getTest(context);

    hooks.navigateTo_("programs");
    const firstCall = googleRun.pending.shift();
    firstCall.reject(new Error("network down"));
    await flushMicrotasks();
    assert.equal(hooks.getSectionState_("programs"), "ERROR");

    hooks.handleSectionRetry_("programs");
    await flushMicrotasks();

    assert.equal(
      googleRun.pending.length,
      1,
      "retry must issue exactly one new call"
    );
    const retryCall = googleRun.pending.shift();
    assert.equal(retryCall.method, "api_getPrograms");

    retryCall.resolve(
      programsEnvelope([
        { id: "P1", name: "青崇", type: "Youth", description: "desc" },
      ])
    );
    await flushMicrotasks();
    assert.equal(hooks.getSectionState_("programs"), "READY");
  });

  test("AC #4: repeated taps on the same pending navigation are coalesced (no duplicate RPC)", async () => {
    const { dom, context, googleRun } = await bootAndLogin();
    const hooks = getTest(context);
    const content = dom.index["app-content"];

    hooks.navigateTo_("programs");
    hooks.navigateTo_("programs");
    hooks.navigateTo_("programs");
    await flushMicrotasks();

    assert.equal(
      googleRun.pending.length,
      1,
      "repeated taps on the same pending Section must not duplicate the RPC"
    );
    assert.ok(collectText(content).includes("載入中"));
  });

  test("Explicit Refresh forces a real re-fetch, not a cached re-render", async () => {
    const { context, googleRun } = await bootAndLogin();
    const hooks = getTest(context);

    hooks.navigateTo_("programs");
    const first = googleRun.pending.shift();
    first.resolve(
      programsEnvelope([
        { id: "P1", name: "青崇", type: "Youth", description: "d1" },
      ])
    );
    await flushMicrotasks();
    assert.equal(hooks.getSectionState_("programs"), "READY");

    hooks.refreshSection_("programs");
    await flushMicrotasks();

    assert.equal(
      googleRun.pending.length,
      1,
      "refresh must issue a new RPC call"
    );
    const second = googleRun.pending.shift();
    assert.equal(second.method, "api_getPrograms");
  });

  test("AC #9: an unexpected rendering exception is caught and shows a recoverable error panel", async () => {
    const { dom, context, googleRun } = await bootAndLogin();
    const hooks = getTest(context);
    const content = dom.index["app-content"];

    hooks.makeRenderProgramsContentThrow_();

    hooks.navigateTo_("programs");
    const call = googleRun.pending.shift();
    call.resolve(
      programsEnvelope([
        { id: "P1", name: "青崇", type: "Youth", description: "d" },
      ])
    );
    await flushMicrotasks();

    const text = collectText(content);
    assert.ok(
      text.includes("顯示錯誤"),
      "render exception should show 顯示錯誤"
    );
    assert.ok(text.includes("重試"));

    hooks.restoreRenderProgramsContent_();
  });

  test("AC #6/#9: retrying a RENDER_ERROR re-attempts rendering ONLY — no new RPC is issued", async () => {
    const { dom, context, googleRun } = await bootAndLogin();
    const hooks = getTest(context);
    const content = dom.index["app-content"];

    hooks.makeRenderProgramsContentThrow_();
    hooks.navigateTo_("programs");
    const call = googleRun.pending.shift();
    call.resolve(
      programsEnvelope([
        { id: "P1", name: "青崇", type: "Youth", description: "d" },
      ])
    );
    await flushMicrotasks();
    assert.equal(hooks.getSectionState_("programs"), "ERROR");
    assert.equal(hooks.getSectionErrorCode_("programs"), "RENDER_ERROR");

    // Retry while the renderer is STILL broken: must re-attempt
    // rendering the already-fetched data, not issue a new RPC.
    hooks.handleSectionRetry_("programs");
    await flushMicrotasks();
    assert.equal(
      googleRun.pending.length,
      0,
      "render-only retry must NOT issue a new api_getPrograms call"
    );
    assert.equal(
      hooks.getSectionState_("programs"),
      "ERROR",
      "repeat render failure stays ERROR"
    );
    assert.equal(hooks.getSectionErrorCode_("programs"), "RENDER_ERROR");
    assert.ok(
      collectText(content).includes("顯示錯誤"),
      "repeat render failure still shows the recoverable panel"
    );

    // Fix the renderer, retry again: must succeed WITHOUT a new RPC.
    hooks.restoreRenderProgramsContent_();
    hooks.handleSectionRetry_("programs");
    await flushMicrotasks();
    assert.equal(
      googleRun.pending.length,
      0,
      "successful render-only retry must still not issue a new RPC"
    );
    assert.equal(hooks.getSectionState_("programs"), "READY");
    assert.ok(collectText(content).includes("青崇"));
  });

  test("a RENDER_ERROR retry for the EMPTY view dispatches to renderProgramsEmpty_, not renderProgramsContent_", async () => {
    const { dom, context, googleRun } = await bootAndLogin();
    const hooks = getTest(context);
    const content = dom.index["app-content"];

    hooks.makeRenderProgramsEmptyThrow_();
    hooks.navigateTo_("programs");
    const call = googleRun.pending.shift();
    // empty catalog
    call.resolve(programsEnvelope([]));
    await flushMicrotasks();

    assert.equal(hooks.getSectionState_("programs"), "ERROR");
    assert.equal(hooks.getSectionErrorCode_("programs"), "RENDER_ERROR");

    // Retry while the EMPTY renderer is STILL broken — must stay
    // RENDER_ERROR with the same (empty) data, no new RPC, and must
    // NOT regress into calling renderProgramsContent_([]).
    hooks.handleSectionRetry_("programs");
    await flushMicrotasks();
    assert.equal(googleRun.pending.length, 0, "must not issue a new RPC");
    assert.equal(hooks.getSectionState_("programs"), "ERROR");
    assert.equal(hooks.getSectionErrorCode_("programs"), "RENDER_ERROR");

    // Fix the EMPTY renderer, retry again: must dispatch correctly
    // to the EMPTY view, not the content view.
    hooks.restoreRenderProgramsEmpty_();
    hooks.handleSectionRetry_("programs");
    await flushMicrotasks();
    assert.equal(googleRun.pending.length, 0);
    assert.equal(hooks.getSectionState_("programs"), "EMPTY");
    assert.ok(
      collectText(content).includes("目前沒有課程資料"),
      "must render the EMPTY view, not a content-view regression"
    );
  });

  test("AC #11: repeat-navigation stress test — rapid switching never leaves the shell blank", async () => {
    const { dom, context, googleRun } = await bootAndLogin();
    const hooks = getTest(context);
    const content = dom.index["app-content"];

    hooks.navigateTo_("programs");
    let call = googleRun.pending.shift();
    call.resolve(
      programsEnvelope([
        { id: "P1", name: "青崇", type: "Youth", description: "d" },
      ])
    );
    await flushMicrotasks();

    const sequence = ["events", "profile", "programs", "events", "profile"];
    for (const key of sequence) {
      hooks.navigateTo_(key);
      // Drain any pending Programs RPC issued by this navigation so
      // the next iteration starts clean.
      // eslint-disable-next-line no-await-in-loop
      await flushMicrotasks();
      if (googleRun.pending.length > 0) {
        call = googleRun.pending.shift();
        call.resolve(
          programsEnvelope([
            { id: "P1", name: "青崇", type: "Youth", description: "d" },
          ])
        );
        // eslint-disable-next-line no-await-in-loop
        await flushMicrotasks();
      }
      assert.ok(
        content.children.length > 0,
        `content must not be blank after navigating to ${key}`
      );
    }
  });
});
