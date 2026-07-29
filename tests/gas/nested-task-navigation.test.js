// Vitest nested task navigation suite for src/gas/shell-session.js.html
// (issue #68 — navigate root Sections and nested tasks without losing
// context).
//
// Strategy:
//   - Duplicate the harness pattern from shell-session.hooks.js: extract
//     the JavaScript from shell-session.js.html's <script> block and
//     evaluate it inside a `node:vm` context against a purpose-built
//     minimal fake DOM, localStorage, and fluent google.script.run
//     fake.
//   - The fake DOM scaffold mirrors src/gas/App.html exactly, with
//     #app, #app-header, #app-status, #app-content, #app-nav-phone,
//     and #app-nav-desktop.
//   - Tests drive the controller through window.__test__ and
//     window.__e2eNavigate hooks exposed by the IIFE for testing.
//   - Each test sets up, bootstraps, then exercises the relevant
//     navigation scenario and asserts on the fake DOM state.
//
// Coverage (issue #68 AC):
//   1. Root section switching still works post-change
//   2. Opening a nested task shows Back + breadcrumb + parent label
//   3. Back returns to the parent root (no task DOM remains)
//   4. Selecting a DIFFERENT root nav item while a task is open
//      lands directly on that Section
//   5. Selecting the SAME root nav item as the open task's parent
//      closes the task and shows that root
//   6. Mock-save on Events demo task invalidates+refreshes without
//      any google.script.run call, and badge/demo value changes
//   7. formatBadgeCount_(150) == "99+", formatBadgeCount_(3) == "3"
//   8. Unknown/unauthorized Section key recovers with Traditional
//      Chinese explanation + working return control
//   9. Badge count of 150 displays "99+" on nav items

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

const FORM_GUARD = path.join(REPO_ROOT, "src", "gas", "form-guard.js.html");

function loadFormGuardSource() {
  const raw = readFileSync(FORM_GUARD, "utf-8");
  const match = raw.match(/<script[^>]*>(?<body>[\s\S]*?)<\/script>/iu);
  assert.ok(
    match !== null,
    `form-guard.js.html must contain a <script> block (file=${FORM_GUARD})`
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
// Minimal fake DOM
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
      scrollTop: 0,
      get firstChild() {
        return el.childNodes.length > 0 ? el.childNodes[0] : null;
      },
      classList: makeClassList(classes),
      get className() {
        return (
          el.classList.toString() ? el.classList.toString().split(/\s+/u) : []
        ).join(" ");
      },
      set className(value) {
        const names = String(value ?? "")
          .split(/\s+/u)
          .filter(Boolean);
        el.classList = makeClassList(names);
      },
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
          // eslint-disable-next-line typescript/no-dynamic-delete
          delete el.attributes.hidden;
        }
      },
      get dataset() {
        const map = {};
        for (const [k, v] of Object.entries(el.attributes)) {
          if (k.startsWith("data-")) {
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

  return {
    document,
    index,
    setFieldValue(input, value) {
      input.value = String(value ?? "");
    },
    fireSubmit() {
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
    for (const name of [
      "api_loginUser",
      "api_restoreApp",
      "api_logoutUser",
      "api_getPrograms",
    ]) {
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
        } else if (name === "api_getPrograms") {
          // Issue #69: these pre-existing #68 navigation tests don't
          // exercise Programs' real data contract — they only need
          // the async Section RPC to resolve so Programs renders
          // its READY state ("課程" heading) rather than staying in
          // an unresolved LOADING/transport-failure state. Tests
          // that DO care about the Programs contract queue their
          // own behavior above and this branch is skipped.
          queueMicrotask(() => {
            if (typeof builder._success === "function") {
              builder._success({
                success: true,
                requestId: "default-programs",
                data: [
                  {
                    id: "P001",
                    name: "主日學",
                    type: "Bible Study",
                    description: "示範課程",
                  },
                ],
              });
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
// Controllable google.script.run fake — every call is captured with
// explicit resolve()/reject() functions the test invokes manually,
// rather than an auto-dispatching queue. Includes api_submitDemoTaskForm.
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
      "api_submitDemoTaskForm",
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
  // Load form-guard.js.html BEFORE shell-session.js.html per App.html.
  vm.runInContext(loadFormGuardSource(), context, {
    filename: "form-guard.js.html",
  });
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

// Drain pending microtasks + setTimeout(0).
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

const CJK = /[\u4E00-\u9FFF]/u;

function findElementByDataAction(root, action) {
  function find(node) {
    if (!node || !node.children) {
      return null;
    }
    for (const child of node.children) {
      if (child.getAttribute && child.dataset.action === action) {
        return child;
      }
      const found = find(child);
      if (found) {
        return found;
      }
    }
    return null;
  }
  return find(root);
}

function findBadgeBySection(navContainer, sectionKey) {
  for (const child of navContainer.children) {
    if (child.getAttribute && child.dataset.section === sectionKey) {
      for (const grandchild of child.children) {
        if (
          grandchild.getAttribute &&
          grandchild.dataset.badge === sectionKey
        ) {
          return grandchild;
        }
      }
    }
  }
  return null;
}

function getTest(context) {
  return context.window.__test__;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("nested-task-navigation.js.html — issue #68", () => {
  /**
   * Helper: boot and bootstrap as MEMBER with profile/programs/events.
   */
  async function bootAsMember() {
    const bootstrap = profileDto();
    const result = bootShellSession({
      storedSession: {
        userId: "U001",
        sessionId: "sid-001",
        sessionToken: "tok-001",
      },
      queuedHandlers: [{ kind: "success", value: successEnvelope(bootstrap) }],
    });
    await flushMicrotasks();
    return result;
  }

  /**
   * Helper: boot and bootstrap as MEMBER with a controllable google.run
   * that includes api_submitDemoTaskForm. Returns googleRun.pending for
   * manual resolve/reject.
   */
  async function bootAsMemberControllable() {
    const bootstrap = profileDto();
    const googleRun = createControllableGoogleRun();
    const dom = createFakeDom();
    const ls = createLocalStorage();
    ls.setItem(
      "efccSession",
      JSON.stringify({
        userId: "U001",
        sessionId: "sid-001",
        sessionToken: "tok-001",
      })
    );

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
      localStorage: ls,
      document: dom.document,
      window: {},
      google: { script: googleRun },
    };
    context.window.document = dom.document;
    context.window.localStorage = ls;
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

    // Fire DOMContentLoaded.
    const ready = makeEvent("DOMContentLoaded");
    const docListeners =
      context.document._listeners?.get("DOMContentLoaded") ?? [];
    for (const fn of docListeners) {
      fn(ready);
    }

    await flushMicrotasks();

    // Resolve the bootstrap restoreApp call.
    const restoreCall = googleRun.pending.shift();
    assert.ok(
      restoreCall !== undefined,
      "bootstrap api_restoreApp should be pending"
    );
    assert.strictEqual(restoreCall.method, "api_restoreApp");
    restoreCall.resolve(successEnvelope(bootstrap));
    await flushMicrotasks();

    return { dom, localStorage: ls, googleRun, context };
  }

  test("AC #1: root Section switching still works post-change", async () => {
    const { dom, context } = await bootAsMember();
    const hooks = getTest(context);
    const content = dom.index["app-content"];

    // After bootstrap we land on Profile.
    assert.ok(
      content.children.length > 0,
      "content should have children after bootstrap"
    );
    const [profileSection] = content.children;
    assert.ok(
      profileSection.classList.contains("view-profile") ||
        profileSection.textContent.includes("個人資料"),
      "first rendered section should be Profile"
    );

    // Navigate to Programs.
    hooks.navigateTo_("programs");
    await flushMicrotasks();
    assert.ok(
      content.children.length > 0,
      "content should have children after navigating to Programs"
    );
    assert.ok(
      content.children[0].textContent.includes("課程"),
      "Programs section should contain 課程"
    );

    // Navigate to Events.
    hooks.navigateTo_("events");
    assert.ok(content.children.length > 0, "Events section should render");
    assert.ok(
      content.children[0].textContent.includes("聚會"),
      "Events section should contain 聚會"
    );

    // Navigate back to Profile.
    hooks.navigateTo_("profile");
    assert.ok(
      content.children.length > 0,
      "profile section should render after navigating back"
    );
    assert.ok(
      content.children[0].textContent.includes("個人資料"),
      "back to Profile should show 個人資料"
    );
  });

  test("AC #2: opening a nested task shows Back + breadcrumb + parent label", async () => {
    const { dom, context } = await bootAsMember();
    const hooks = getTest(context);

    hooks.navigateTo_("programs");
    hooks.openTask_({
      key: "programs-detail-demo",
      parentSection: "programs",
      parentLabel: "課程",
      title: "詳情",
      kind: "detail",
    });

    const content = dom.index["app-content"];
    assert.ok(content.children.length > 0, "task should render in content");
    const [taskSection] = content.children;
    assert.ok(
      taskSection.classList.contains("view-task"),
      "task section should have view-task class"
    );
    assert.strictEqual(
      taskSection.dataset.taskKey,
      "programs-detail-demo",
      "task section should have data-task-key attribute"
    );

    // Check Back button.
    const backBtn = findElementByDataAction(content, "task-back");
    assert.ok(backBtn !== null, "Back button should exist in task");
    assert.strictEqual(
      backBtn.getAttribute("aria-label"),
      "返回",
      "Back button aria-label should be 返回"
    );

    // Check breadcrumb parent and current labels.
    let parentLabel = null;
    let currentLabel = null;
    (function walkNodes(nodes) {
      for (const node of nodes) {
        if (node.getAttribute) {
          if (node.dataset.breadcrumbParent !== undefined) {
            parentLabel = node.textContent;
          }
          if (node.dataset.breadcrumbCurrent !== undefined) {
            currentLabel = node.textContent;
          }
        }
        if (node.children) {
          walkNodes(node.children);
        }
        if (node.childNodes) {
          walkNodes(node.childNodes);
        }
      }
    })([content]);

    assert.strictEqual(
      parentLabel,
      "課程",
      "breadcrumb parent should show 課程"
    );
    assert.strictEqual(
      currentLabel,
      "詳情",
      "breadcrumb current should show 詳情"
    );
  });

  test("AC #3: Back returns to the parent root (no task DOM remains)", async () => {
    const { dom, context } = await bootAsMember();
    const hooks = getTest(context);

    hooks.navigateTo_("programs");
    hooks.openTask_({
      key: "programs-detail-demo",
      parentSection: "programs",
      parentLabel: "課程",
      title: "詳情",
      kind: "detail",
    });

    // Click Back button.
    const content = dom.index["app-content"];
    const backBtn = findElementByDataAction(content, "task-back");
    assert.ok(backBtn !== null, "Back button should exist");
    const clickEvent = makeEvent("click");
    backBtn.dispatchEvent(clickEvent);

    // After closeTask_, the content should show Programs root.
    assert.ok(
      content.children.length > 0,
      "content should have children after Back"
    );

    // No task-key element should remain.
    let hasTaskKey = false;
    (function walkNodes(nodes) {
      for (const node of nodes) {
        if (node.getAttribute && node.dataset.taskKey !== undefined) {
          hasTaskKey = true;
        }
        if (node.children) {
          walkNodes(node.children);
        }
      }
    })([content]);
    assert.ok(!hasTaskKey, "no task-key element should remain after Back");
  });

  test("AC #4: selecting a DIFFERENT root nav item while a task is open lands on that Section", async () => {
    const { dom, context } = await bootAsMember();
    const hooks = getTest(context);

    hooks.navigateTo_("programs");
    hooks.openTask_({
      key: "programs-detail-demo",
      parentSection: "programs",
      parentLabel: "課程",
      title: "詳情",
      kind: "detail",
    });

    // While task is open, navigate to Events (different root).
    hooks.navigateTo_("events");

    const content = dom.index["app-content"];
    assert.ok(content.children.length > 0, "content should have children");

    // activeTask_ is not directly accessible, but we can check the DOM.
    let hasTaskKey = false;
    (function walkNodes(nodes) {
      for (const node of nodes) {
        if (node.getAttribute && node.dataset.taskKey !== undefined) {
          hasTaskKey = true;
        }
        if (node.children) {
          walkNodes(node.children);
        }
      }
    })([content]);
    assert.ok(!hasTaskKey, "no task-key element should remain after nav away");
    assert.ok(
      content.children[0].textContent.includes("聚會"),
      "Events section should contain 聚會"
    );
  });

  test("AC #5: selecting the SAME root nav item as the open task's parent closes the task", async () => {
    const { dom, context } = await bootAsMember();
    const hooks = getTest(context);

    hooks.navigateTo_("programs");
    await flushMicrotasks();
    hooks.openTask_({
      key: "programs-detail-demo",
      parentSection: "programs",
      parentLabel: "課程",
      title: "詳情",
      kind: "detail",
    });

    // While task is open, navigate to the same root (programs).
    hooks.navigateTo_("programs");
    await flushMicrotasks();

    const content = dom.index["app-content"];

    // No task-key element should remain.
    let hasTaskKey = false;
    (function walkNodes(nodes) {
      for (const node of nodes) {
        if (node.getAttribute && node.dataset.taskKey !== undefined) {
          hasTaskKey = true;
        }
        if (node.children) {
          walkNodes(node.children);
        }
      }
    })([content]);
    assert.ok(
      !hasTaskKey,
      "no task should be visible after re-selecting parent"
    );
    assert.ok(
      content.children[0].textContent.includes("課程"),
      "Programs root should be visible"
    );
  });

  test("AC #6: demo-form-submit calls api_submitDemoTaskForm RPC and shows updated Events root", async () => {
    const { dom, googleRun, context } = await bootAsMemberControllable();
    const hooks = getTest(context);

    hooks.navigateTo_("events");
    const counterBefore = hooks.getEventsDemoCounter();

    hooks.openTask_({
      key: "events-edit-demo",
      parentSection: "events",
      parentLabel: "聚會",
      title: "編輯",
      kind: "edit",
    });

    // Find and click the demo-form-submit button.
    const content = dom.index["app-content"];
    const submitBtn = findElementByDataAction(content, "demo-form-submit");
    assert.ok(submitBtn !== null, "demo-form-submit button should exist");
    assert.strictEqual(
      submitBtn.dataset.action,
      "demo-form-submit",
      "submit button data-action should be demo-form-submit"
    );

    // Type into the field to make the form dirty (PRISTINE -> DIRTY),
    // then dispatch input so handleFieldInput_ calls activeFormGuard_.markDirty().
    const fieldEl = dom.index["demo-edit-field"];
    assert.ok(fieldEl !== null, "demo-edit-field input should exist");
    fieldEl.value = "修改資料";
    const inputEvent = makeEvent("input");
    fieldEl.dispatchEvent(inputEvent);

    // Dirty the form guard — make sure it's now DIRTY before we submit.
    assert.strictEqual(
      hooks.getFormGuardState(),
      "DIRTY",
      "form guard should be DIRTY after field input"
    );

    const clickEvent = makeEvent("click");
    submitBtn.dispatchEvent(clickEvent);

    // Assert beginSubmit() worked — form guard shows SUBMITTING.
    assert.strictEqual(
      hooks.getFormGuardState(),
      "SUBMITTING",
      "form guard should be in SUBMITTING state after click"
    );

    // Assert the submit button is disabled while pending.
    assert.strictEqual(
      submitBtn.getAttribute("disabled"),
      "disabled",
      "submit button should be disabled while pending"
    );

    // 1 bootstrap call (api_restoreApp) was already resolved and shifted
    // by bootAsMemberControllable. The submit call is now the only pending
    // entry in googleRun.pending.
    assert.strictEqual(
      googleRun.pending.length,
      1,
      "should have exactly 1 pending RPC call after submit (api_submitDemoTaskForm)"
    );

    // Resolve the submit RPC with a success envelope.
    const [submitCall] = googleRun.pending;
    assert.strictEqual(
      submitCall.method,
      "api_submitDemoTaskForm",
      "the pending call should be api_submitDemoTaskForm"
    );
    submitCall.resolve({
      success: true,
      requestId: "submit-req-001",
      data: {},
    });
    await flushMicrotasks();

    // After resolution: the task should close and Events root should render
    // with the incremented counter.
    assert.ok(
      content.children.length > 0,
      "content should render after successful submit"
    );
    assert.ok(
      content.children[0].textContent.includes(
        `範例計數器：${counterBefore + 1}`
      ),
      "Events root should show updated demo counter value"
    );

    // The demo counter should have incremented.
    assert.strictEqual(
      hooks.getEventsDemoCounter(),
      counterBefore + 1,
      "eventsDemoCounter should increment after submit"
    );

    // The nav badge for events must derive automatically from the
    // submit flow — not require a manual updateBadge_ call.
    // counterBefore starts at 150 (seeded), so after one increment
    // (151) the badge must still cap-display as "99+".
    const navPhone = dom.index["app-nav-phone"];
    const eventsBadge = findBadgeBySection(navPhone, "events");
    assert.ok(
      eventsBadge !== null,
      "events nav badge should exist automatically after submit"
    );
    assert.strictEqual(
      eventsBadge.textContent,
      "99+",
      "events nav badge should read 99+ immediately after submit, with no manual updateBadge_ call"
    );
    assert.strictEqual(
      eventsBadge.getAttribute("hidden"),
      null,
      "events nav badge should not be hidden after submit"
    );
  });

  test("AC #7: formatBadgeCount_ formats correctly", () => {
    const { context } = bootShellSession({});
    const hooks = getTest(context);

    assert.strictEqual(
      hooks.formatBadgeCount_(150),
      "99+",
      "formatBadgeCount_(150) should return '99+'"
    );
    assert.strictEqual(
      hooks.formatBadgeCount_(3),
      "3",
      "formatBadgeCount_(3) should return '3'"
    );
    assert.strictEqual(
      hooks.formatBadgeCount_(99),
      "99",
      "formatBadgeCount_(99) should return '99'"
    );
    assert.strictEqual(
      hooks.formatBadgeCount_(100),
      "99+",
      "formatBadgeCount_(100) should return '99+'"
    );
    assert.strictEqual(
      hooks.formatBadgeCount_(0),
      "0",
      "formatBadgeCount_(0) should return '0'"
    );
  });

  test("AC #8: unknown/unauthorized Section key recovers with Traditional Chinese explanation", async () => {
    const { dom, context } = await bootAsMember();
    const hooks = getTest(context);

    // Try navigating to an unknown/unauthorized section key.
    hooks.navigateTo_("unknown-section");

    const content = dom.index["app-content"];
    assert.ok(content.children.length > 0, "content should have children");
    const [section] = content.children;

    // Should render the forbidden view.
    assert.ok(
      section.classList.contains("view-forbidden"),
      "unknown section should render view-forbidden"
    );

    // Should have Traditional Chinese explanation mentioning access level.
    assert.ok(
      CJK.test(section.textContent),
      "forbidden view should contain Traditional Chinese text"
    );
    assert.ok(
      section.textContent.includes("無法存取"),
      "forbidden view should mention 無法存取"
    );

    // Should have a return button that navigates to the first permitted section.
    let foundReturnBtn = false;
    (function walkNodes(nodes) {
      for (const node of nodes) {
        if (node.tagName === "BUTTON") {
          foundReturnBtn = true;
          // Click the return button.
          const ev = makeEvent("click");
          node.dispatchEvent(ev);
        }
        if (node.children) {
          walkNodes(node.children);
        }
      }
    })([section]);
    assert.ok(foundReturnBtn, "forbidden view should have a return button");
  });

  test("badge count of 150 is displayable on nav items (seeded deterministic)", async () => {
    const { dom, context } = await bootAsMember();
    const hooks = getTest(context);

    // After bootstrap, nav should be rendered. Set a badge count for events.
    hooks.updateBadge_("events", 150);

    // Check phone nav for the badge.
    const navPhone = dom.index["app-nav-phone"];
    const badge = findBadgeBySection(navPhone, "events");
    assert.ok(badge !== null, "badge should exist in phone nav for events");
    assert.strictEqual(
      badge.textContent,
      "99+",
      "badge for count 150 should display '99+'"
    );
    assert.strictEqual(
      badge.getAttribute("hidden"),
      null,
      "badge should not be hidden for positive count"
    );

    // Update to 0 should hide it.
    hooks.updateBadge_("events", 0);
    const badgeAfterZero = findBadgeBySection(navPhone, "events");
    assert.ok(
      badgeAfterZero !== null,
      "badge element should still exist after update to 0"
    );
    assert.ok(
      badgeAfterZero.getAttribute("hidden") !== null || badgeAfterZero.hidden,
      "badge should be hidden for count 0"
    );
  });
});
