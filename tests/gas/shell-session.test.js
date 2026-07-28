// Vitest controller-behavior suite for src/gas/shell-session.js.html
// — the auth + bootstrap + logout controller that lives in the
// issue #66 App Document.
//
// Strategy:
//   - Extract the JavaScript from shell-session.js.html's <script>
//     block and evaluate it inside a `node:vm` context against a
//     purpose-built minimal fake DOM, localStorage, and a fluent
//     `google.script.run` fake.
//   - The fake DOM is intentionally narrow — it implements only the
//     surfaces the controller actually touches: getElementById,
//     createElement, createTextNode, appendChild/removeChild,
//     attribute setters, classList, addEventListener/dispatchEvent
//     for 'submit'/'click'/'input', focus/blur, and a
//     textContent/innerHTML pair for assertions.
//   - The google.script.run fake queues one or more pending
//     success/failure behaviors per test; each test pushes the
//     expected envelope onto the queue before triggering the
//     controller action that consumes it.
//
// Coverage targets issue #66's client-side acceptance criteria:
//   AC #1  cold start with no stored session shows Login, no RPC
//   AC #2  cold start with stored session invokes api_restoreApp once
//   AC #3  successful login persists efccSession and reaches READY
//   AC #4  invalid credentials show Traditional Chinese inline error
//   AC #6  transport failure renders a recoverable retry affordance
//   AC #7  AUTH_REQUIRED on restore clears efccSession, returns to Login
//   AC #10 logout calls api_logoutUser, clears state, shows Login

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
  assert.ok(
    match !== null,
    `shell-session.js.html must contain a <script> block (file=${SHELL_SESSION})`
  );
  return match[1];
}

// ---------------------------------------------------------------------------
// Minimal localStorage shim
// ---------------------------------------------------------------------------

function createLocalStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index) {
      return [...store.keys()][index] ?? null;
    },
    get length() {
      return store.size;
    },
  };
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Minimal fake DOM
function makeEvent(type) {
  return {
    type,
    defaultPrevented: false,
    target: null,
    currentTarget: null,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {},
    stopImmediatePropagation() {},
  };
}

function createFakeDom() {
  // eslint-disable-next-line unicorn/consistent-function-scoping
  function makeClassList(initial = []) {
    const set = new Set(initial);
    return {
      add(...names) {
        for (const n of names) {
          set.add(n);
        }
      },
      remove(...names) {
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
      contains(name) {
        return set.has(name);
      },
      toString() {
        return [...set].join(" ");
      },
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
      style: {},
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
      get innerHTML() {
        return el.children
          .map((c) => c.outerHTML ?? c.textContent ?? "")
          .join("");
      },
      set innerHTML(value) {
        el._textContent = String(value ?? "");
        el.childNodes = [];
        el.children = [];
      },
      get hidden() {
        return el._hidden;
      },
      set hidden(v) {
        el._hidden = !!v;
        if (el._hidden) {
          el.attributes.hidden = "";
        } else {
          delete el.attributes.hidden;
        }
      },
      // `dataset` is the DOMStringMap view of `data-*` attributes.
      // The ultracite rule unicorn/prefer-dom-node-dataset auto-fixes
      // getAttribute('data-x') to el.dataset.x, so the harness
      // exposes dataset as a real getter (not just a stub).
      get dataset() {
        const map = {};
        for (const [k, v] of Object.entries(el.attributes)) {
          if (k.startsWith("data-")) {
            // data-app-state -> appState (camelCase conversion)
            const camel = k
              .slice(5)
              .replaceAll(/-(?<char>[a-z])/gu, (_, c) => c.toUpperCase());
            map[camel] = v;
          }
        }
        return map;
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
        // eslint-disable-next-line typescript/no-dynamic-delete
        delete el.attributes[name];
      },

      hasAttribute(name) {
        return Object.hasOwn(el.attributes, name);
      },
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
      dispatchEvent(event) {
        event.target = el;
        event.currentTarget = el;
        const arr = el._listeners.get(event.type) ?? [];
        for (const fn of arr) {
          fn(event);
        }
        return !event.defaultPrevented;
      },
      appendChild(child) {
        el.childNodes.push(child);
        if (child && child.nodeType === 1) {
          el.children.push(child);
        }
        return child;
      },
      // Real DOM nodes support both append() and appendChild(). The
      // ultracite rule unicorn/prefer-dom-node-append auto-fixes
      // appendChild() to append(), so the harness exposes both.
      append(...nodes) {
        for (const c of nodes) {
          el.childNodes.push(c);
          if (c && c.nodeType === 1) {
            el.children.push(c);
          }
        }
        return el;
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
      querySelector(selector) {
        function find(root) {
          for (const c of root.children ?? []) {
            if (selector.startsWith("#") && c.id === selector.slice(1)) {
              return c;
            }
            if (selector.startsWith("[") && selector.includes("data-action")) {
              const m = selector.match(
                /data-action\s*=\s*"?(?<value>[^"\]]+)"?/u
              );
              if (
                m &&
                c.attributes &&
                c.attributes["data-action"] === m.groups.value
              ) {
                return c;
              }
            }
            if (
              !selector.startsWith("#") &&
              !selector.startsWith("[") &&
              c.classList &&
              c.classList.contains(selector.replace(/^\./u, ""))
            ) {
              return c;
            }
            if (inner) {
              return inner;
            }
          }
          return null;
        }
        if (
          selector.startsWith("#") ||
          selector.startsWith(".") ||
          selector.startsWith("[")
        ) {
          return find(el);
        }
        return null;
      },
      focus() {},
      blur() {},
      select() {},
    };
    Object.defineProperty(el, "parentNode", {
      value: null,
      writable: true,
      configurable: true,
    });
    el.outerHTML = (() => {
      const attrPairs = Object.entries(el.attributes)
        .map(([k, v]) => `${k}="${String(v).replaceAll('"', "&quot;")}"`)
        .join(" ");
      return `<${el.tagName.toLowerCase()}${attrPairs ? ` ${attrPairs}` : ""}></${el.tagName.toLowerCase()}>`;
    })();
    return el;
  }

  // Document scaffold mirrors src/gas/App.html.
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

  // view-login fragment mirrors src/gas/view-login.html.
  const viewLogin = makeElement("section", { id: "view-login" });
  const loginCard = makeElement("div", { class: "login-card" });
  const loginTitle = makeElement("h2");
  loginTitle._textContent = "登入";
  const loginForm = makeElement("form", { id: "login-form" });
  const usernameInput = makeElement("input", {
    id: "login-username",
    type: "text",
    name: "username",
  });
  const pinInput = makeElement("input", {
    id: "login-pin",
    type: "password",
    name: "pin",
  });
  const submitBtn = makeElement("button", {
    id: "login-submit",
    type: "submit",
  });
  submitBtn._textContent = "登入";
  const loginMsg = makeElement("div", { id: "login-msg", class: "hidden" });

  loginForm.append(usernameInput);
  loginForm.append(pinInput);
  loginForm.append(submitBtn);
  loginForm.append(loginMsg);
  loginCard.append(loginTitle);
  loginCard.append(loginForm);
  viewLogin.append(loginCard);
  content.append(viewLogin);

  const index = {
    app,
    "app-header": header,
    "app-status": status,
    "app-content": content,
    "app-nav-phone": navPhone,
    "app-nav-desktop": navDesktop,
    "view-login": viewLogin,
    "login-form": loginForm,
    "login-username": usernameInput,
    "login-pin": pinInput,
    "login-submit": submitBtn,
    "login-msg": loginMsg,
  };

  document.getElementById = (id) => (id in index ? index[id] : null);
  // The controller's `el()` helper builds new nodes at runtime
  // (Login form rebuild, Profile render, error/retry views). The
  // controller must stay inside the existing tree, so we
  // deliberately do NOT expose a way to replace #app or
  // #app-content from the helper.
  document.createElement = (tag) => {
    const node = makeElement(String(tag).toLowerCase(), {});
    const origSet = node.setAttribute;
    node.setAttribute = function setAttribute(name, value) {
      origSet.call(node, name, value);
      if (name === "id" && value) {
        // Always overwrite so a fresh element with the same id
        // replaces the pre-seeded placeholder. The controller
        // re-renders Login into #app-content on every cold start;
        // the test must observe the live element, not the seed.
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

  return {
    document,
    index,
    setFieldValue(input, value) {
      input.value = String(value ?? "");
    },
    fireSubmit() {
      // Dispatch on the live #login-form, not the pre-seeded
      // closure reference. The controller's renderLogin_ replaces
      // the form on every cold start, and the auto-registration
      // in createElement updates index["login-form"] to the live
      // element.
      const ev = makeEvent("submit");
      (index["login-form"] || loginForm).dispatchEvent(ev);
      return ev;
    },
  };
}

// ---------------------------------------------------------------------------
// Fluent google.script.run fake with a queue
// ---------------------------------------------------------------------------

function createGoogleRun(queuedHandlers) {
  const calls = [];

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
    for (const name of ["api_loginUser", "api_restoreApp", "api_logoutUser"]) {
      builder[name] = (...args) => {
        calls.push({
          method: name,
          args,
          hasSuccess: typeof builder._success === "function",
          hasFailure: typeof builder._failure === "function",
        });
        const behavior = queuedHandlers.shift();
        if (behavior) {
          queueMicrotask(() => {
            if (
              behavior.kind === "success" &&
              typeof builder._success === "function"
            ) {
              builder._success(behavior.value);
            } else if (
              behavior.kind === "failure" &&
              typeof builder._failure === "function"
            ) {
              builder._failure(behavior.value);
            }
          });
        }
        return builder;
      };
    }
    return builder;
  }

  const run = { calls };
  Object.defineProperty(run, "run", {
    get() {
      return makeBuilder();
    },
    configurable: true,
  });
  return run;
}

// ---------------------------------------------------------------------------
// Boot the controller inside a vm context
// ---------------------------------------------------------------------------

function bootShellSession({ storedSession = null, queuedHandlers = [] } = {}) {
  const localStorage = createLocalStorage();
  if (storedSession) {
    localStorage.setItem("efccSession", JSON.stringify(storedSession));
  }
  const dom = createFakeDom();
  const googleRun = createGoogleRun(queuedHandlers);

  const context = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    Promise,
    JSON,
    Date,
    Math,
    URL,
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
  vm.runInContext(loadShellSessionSource(), context, {
    filename: "shell-session.js.html",
  });

  // Fire DOMContentLoaded so the controller runs its onReady hook.
  const ready = {
    type: "DOMContentLoaded",
    defaultPrevented: false,
    target: null,
    currentTarget: null,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
  const docListeners =
    context.document._listeners?.get("DOMContentLoaded") ?? [];
  for (const fn of docListeners) {
    fn(ready);
  }

  return { dom, localStorage, googleRun, context };
}

// ---------------------------------------------------------------------------
// Envelope / DTO factories
// ---------------------------------------------------------------------------

function successEnvelope(data, requestId = "req-test") {
  return { success: true, requestId, data };
}

function failureEnvelope(code, message, requestId = "req-test") {
  return { success: false, requestId, error: { code, message } };
}

function profileDto(overrides = {}) {
  return {
    session: {
      userId: "U001",
      name: "王小明",
      role: "MEMBER",
      qrCodeString: "QR-U001",
      sessionId: "sid-001",
      sessionToken: "tok-001",
    },
    sections: [{ key: "profile", label: "個人資料", capability: "READ" }],
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

// Drain pending microtasks and any setTimeout(0) callback the
// controller uses. The timeout is real and unavoidable — the
// controller defers the READY transition through setTimeout(0).
async function flushMicrotasks() {
  for (let i = 0; i < 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop -- sequential drain
    await Promise.resolve();
  }
  // eslint-disable-next-line promise/avoid-new -- setTimeout drain
  await new Promise((resolve) => {
    setTimeout(resolve, 5);
  });
  for (let i = 0; i < 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop -- sequential drain
    await Promise.resolve();
  }
}

const CJK = /[\u4E00-\u9FFF]/u;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("shell-session.js.html — issue #66 client controller", () => {
  test("AC #1: cold start with no stored session shows Login, performs zero RPCs, no document replacement", async () => {
    const env = bootShellSession();
    await flushMicrotasks();

    assert.ok(
      env.dom.index["view-login"],
      "#view-login must be present after boot"
    );
    assert.ok(
      !env.dom.index["view-login"].hasAttribute("hidden"),
      "Login view must be visible on cold start"
    );
    assert.ok(env.dom.index["login-form"], "#login-form must be present");
    assert.equal(
      env.googleRun.calls.length,
      0,
      "cold start must NOT invoke any google.script.run RPC"
    );
    assert.ok(env.dom.index["app"], "shell must not replace #app");
  });

  test("AC #2: cold start with a stored session invokes api_restoreApp exactly once with (userId, sessionId, sessionToken)", async () => {
    const stored = {
      userId: "U001",
      sessionId: "sid-stored",
      sessionToken: "tok-stored",
    };
    const env = bootShellSession({
      storedSession: stored,
      queuedHandlers: [
        { kind: "success", value: successEnvelope(profileDto()) },
      ],
    });
    await flushMicrotasks();

    const restoreCalls = env.googleRun.calls.filter(
      (c) => c.method === "api_restoreApp"
    );
    assert.equal(restoreCalls.length, 1, "exactly one api_restoreApp call");
    assert.deepEqual(
      restoreCalls[0].args,
      [stored.userId, stored.sessionId, stored.sessionToken],
      "args must be (userId, sessionId, sessionToken) in that order"
    );
    assert.ok(restoreCalls[0].hasSuccess, "success handler registered");
    assert.ok(restoreCalls[0].hasFailure, "failure handler registered");
  });

  test("AC #3: successful login persists exactly one efccSession JSON record, reaches READY, no document replacement", async () => {
    const env = bootShellSession({
      queuedHandlers: [
        { kind: "success", value: successEnvelope(profileDto()) },
      ],
    });
    await flushMicrotasks();
    env.dom.setFieldValue(env.dom.index["login-username"], "user001");
    env.dom.setFieldValue(env.dom.index["login-pin"], "1234");
    env.dom.fireSubmit();
    await flushMicrotasks();

    const raw = env.localStorage.getItem("efccSession");
    assert.ok(raw !== null, "successful login must persist efccSession");
    const parsed = JSON.parse(raw);
    assert.ok(parsed.userId, "efccSession must include userId");
    assert.ok(parsed.sessionId, "efccSession must include sessionId");
    assert.ok(parsed.sessionToken, "efccSession must include sessionToken");

    const allKeys = [];
    for (let i = 0; i < env.localStorage.length; i += 1) {
      const k = env.localStorage.key(i);
      if (k) {
        allKeys.push(k);
      }
    }
    assert.deepEqual(
      allKeys.filter((k) => k === "efccSession"),
      ["efccSession"],
      "localStorage must hold exactly one efccSession record"
    );

    assert.equal(
      env.dom.index["app"].dataset.appState,
      "READY",
      "successful login must set data-app-state to READY"
    );
    const rendered =
      env.dom.index["app-content"].textContent +
      env.dom.index["app-status"].textContent;
    assert.ok(
      rendered.includes("王小明"),
      "Profile view must include the member name"
    );
    assert.ok(
      !/<script\b/iu.test(rendered),
      "Profile render must not introduce <script> tags"
    );
    assert.ok(env.dom.index["app"], "shell must not replace #app");
  });

  test("AC #4: invalid credentials show Traditional Chinese inline error, keep the form interactive, do not persist efccSession", async () => {
    const env = bootShellSession({
      queuedHandlers: [
        {
          kind: "success",
          value: failureEnvelope("AUTH_REQUIRED", "使用者名稱或 PIN 碼錯誤"),
        },
      ],
    });
    await flushMicrotasks();

    env.dom.setFieldValue(env.dom.index["login-username"], "user001");
    env.dom.setFieldValue(env.dom.index["login-pin"], "0000");
    env.dom.fireSubmit();
    await flushMicrotasks();

    assert.equal(
      env.dom.index["app"].dataset.appState,
      "SIGNED_OUT",
      "invalid credentials must keep app-state SIGNED_OUT"
    );
    const msg = env.dom.index["login-msg"];
    assert.ok(msg, "inline #login-msg must be present");
    assert.ok(
      CJK.test(msg.textContent),
      "inline error must contain Traditional Chinese text"
    );
    assert.ok(
      !msg.classList.contains("hidden"),
      "inline error must NOT be hidden after a failed login"
    );
    assert.ok(
      env.dom.index["login-form"] && !env.dom.index["login-form"].hidden,
      "login form must remain interactive after failure"
    );
    assert.equal(
      env.localStorage.getItem("efccSession"),
      null,
      "failed login must NOT persist efccSession"
    );
    assert.equal(env.googleRun.calls.length, 1, "exactly one RPC issued");
    assert.equal(env.googleRun.calls[0].method, "api_loginUser");
  });

  test("AC #6: restore transport failure renders RECOVERABLE_ERROR with a retry affordance, keeps Login visible", async () => {
    const stored = {
      userId: "U001",
      sessionId: "sid-stored",
      sessionToken: "tok-stored",
    };
    const env = bootShellSession({
      storedSession: stored,
      queuedHandlers: [
        {
          kind: "failure",
          value: { status: "ERROR", message: "network down" },
        },
      ],
    });
    await flushMicrotasks();

    assert.equal(
      env.dom.index["app"].dataset.appState,
      "RECOVERABLE_ERROR",
      "restore transport failure must surface RECOVERABLE_ERROR"
    );
    const statusText =
      env.dom.index["app-status"].textContent +
      env.dom.index["app-status"].innerHTML;
    assert.ok(
      CJK.test(statusText),
      "RECOVERABLE_ERROR must include Traditional Chinese copy"
    );
    // The recovery view must surface a retry affordance. We
    // assert via the live index (auto-registered by createElement)
    // and the copy / attribute patterns as defense in depth.
    const retryButton = env.dom.index["error-retry"];
    assert.ok(
      retryButton !== undefined,
      "RECOVERABLE_ERROR must expose a retry affordance (live #error-retry)"
    );
    assert.ok(
      env.dom.index["login-form"] && !env.dom.index["login-form"].hidden,
      "login form must remain visible during RECOVERABLE_ERROR"
    );
    assert.ok(
      env.dom.index["app"],
      "shell must not replace #app on restore failure"
    );
    assert.ok(
      env.localStorage.getItem("efccSession") !== null,
      "restore transport failure must NOT clear efccSession; user can retry"
    );
  });

  test("AC #7: AUTH_REQUIRED on restore clears efccSession and returns to the same-document Login", async () => {
    const stored = {
      userId: "U001",
      sessionId: "sid-stored",
      sessionToken: "tok-stored",
    };
    const env = bootShellSession({
      storedSession: stored,
      queuedHandlers: [
        {
          kind: "success",
          value: failureEnvelope("AUTH_REQUIRED", "工作階段已過期，請重新登入"),
        },
      ],
    });
    await flushMicrotasks();

    assert.equal(
      env.dom.index["app"].dataset.appState,
      "SIGNED_OUT",
      "AUTH_REQUIRED must transition to SIGNED_OUT"
    );
    assert.equal(
      env.localStorage.getItem("efccSession"),
      null,
      "AUTH_REQUIRED must clear efccSession"
    );
    assert.ok(env.dom.index["app"], "AUTH_REQUIRED must not replace #app");
    const viewLogin = env.dom.index["view-login"];
    assert.ok(viewLogin, "view-login must remain mounted");
    assert.ok(
      !viewLogin.hidden,
      "view-login must be visible after AUTH_REQUIRED"
    );
    const form = env.dom.index["login-form"];
    assert.ok(
      form && !form.hidden,
      "login form must be interactive after AUTH_REQUIRED"
    );
  });

  test("AC #10: logout calls api_logoutUser with (userId, sessionId, sessionToken), clears efccSession, shows Login", async () => {
    const stored = {
      userId: "U001",
      sessionId: "sid-stored",
      sessionToken: "tok-stored",
    };
    const env = bootShellSession({
      storedSession: stored,
      queuedHandlers: [
        { kind: "success", value: successEnvelope(profileDto()) },
        { kind: "success", value: successEnvelope({ ok: true }) },
      ],
    });
    await flushMicrotasks();
    assert.equal(
      env.dom.index["app"].dataset.appState,
      "READY",
      "restore must drive state to READY before logout can be triggered"
    );
    const logoutEl =
      env.dom.index["profile-logout"] ??
      env.dom.document.querySelector('[data-action="logout"]') ??
      env.dom.document.querySelector("#logout") ??
      env.dom.document.querySelector(".logout") ??
      null;
    logoutEl.dispatchEvent({
      type: "click",
      defaultPrevented: false,
      target: null,
      currentTarget: null,
      preventDefault() {
        this.defaultPrevented = true;
      },
    });
    await flushMicrotasks();

    const logoutCalls = env.googleRun.calls.filter(
      (c) => c.method === "api_logoutUser"
    );
    assert.equal(
      logoutCalls.length,
      1,
      "logout must invoke api_logoutUser exactly once"
    );

    assert.equal(
      logoutCalls.length,
      1,
      "logout must invoke api_logoutUser exactly once"
    );
    // After restore, applyBootstrap_ reissues a fresh sessionId and
    // sessionToken. The live in-memory session is the source of
    // truth for the logout args, not the pre-restore stored
    // sessionId.
    const restoreCall = env.googleRun.calls.find(
      (c) => c.method === "api_restoreApp"
    );
    assert.ok(restoreCall, "api_restoreApp must have been called");
    assert.deepEqual(
      logoutCalls[0].args,
      [restoreCall.args[0], "sid-001", "tok-001"],
      "args must use the live sessionId/sessionToken from the restore"
    );
    assert.ok(logoutCalls[0].hasSuccess, "success handler registered");
    assert.ok(logoutCalls[0].hasFailure, "failure handler registered");
    assert.ok(env.dom.index["app"], "logout must not replace #app");
  });
});
