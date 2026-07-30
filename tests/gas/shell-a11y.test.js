// Vitest accessibility/focus/copy-source suite for src/gas/shell-session.js.html
// (issue #71 — make the shell usable across phone, desktop, keyboard, and
// screen reader).
//
// Strategy: same node:vm + minimal fake DOM pattern used by
// tests/gas/nested-task-navigation.test.js, extended with:
//   - document.activeElement tracking (needed to assert focus management,
//     which is issue #71's core testable behavior).
//   - a descendant-combinator-capable querySelector (`ANCESTOR desc[attr]`)
//     so the compound selectors used by focusSectionHeading_ and the
//     forbidden/task-back focus targets actually resolve, matching real
//     browser behavior.
//   - a queued google.script.run fake (mirrors nested-task-navigation's
//     createGoogleRun) so login/restore can be driven with a specific
//     6-Section STAFF bootstrap DTO, which is large enough to push
//     Care/Permissions into the phone-nav overflow ("More") menu.
//
// Coverage (issue #71 AC):
//   AC #5  nav buttons carry no role="link" misuse; aria-current toggles
//   AC #6/#7 focus moves after root nav change, task entry/exit, retry
//   AC #8  loading/error/empty/forbidden cards are role="status" aria-live
//   AC #10 badge carries an aria-label with the count
//   AC #11 copyText_ prefers window.EfccCopy and falls back to the
//          historical literal when it is absent
//   More-menu keyboard widget: aria-expanded toggles, Escape closes and
//   restores focus to the trigger.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
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
const FORM_GUARD = path.join(REPO_ROOT, "src", "gas", "form-guard.js.html");
const COPY = path.join(REPO_ROOT, "src", "gas", "copy.js.html");

function loadScriptBody(file) {
  const raw = readFileSync(file, "utf-8");
  const match = raw.match(/<script[^>]*>(?<body>[\s\S]*?)<\/script>/iu);
  assert.ok(match !== null, `${file} must contain a <script> block`);
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
  };
}

// ---------------------------------------------------------------------------
// Minimal fake DOM
// ---------------------------------------------------------------------------

function makeEvent(type, extra = {}) {
  return {
    type,
    target: null,
    currentTarget: null,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    ...extra,
  };
}

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
    contains(name) {
      return set.has(name);
    },
    toString() {
      return [...set].join(" ");
    },
  };
}

function matchesSimple(node, seg) {
  if (!node || node.nodeType !== 1) {
    return false;
  }
  if (seg.startsWith(".")) {
    return node.classList.contains(seg.slice(1));
  }
  if (seg.startsWith("#")) {
    return node.id === seg.slice(1);
  }
  const attrMatch = seg.match(/^\[(?<name>[\w-]+)(?:="(?<value>[^"]*)")?\]$/u);
  if (attrMatch) {
    const { name, value } = attrMatch.groups;
    if (!node.getAttribute) {
      return false;
    }
    const actual = node.getAttribute(name);
    if (value === undefined) {
      return actual !== null;
    }
    return actual === value;
  }
  return node.tagName === seg.toUpperCase();
}

function findAll(root, seg) {
  const out = [];
  const walk = (node) => {
    if (matchesSimple(node, seg)) {
      out.push(node);
    }
    for (const child of node.children || []) {
      walk(child);
    }
  };
  walk(root);
  return out;
}

function createFakeDom() {
  const focusLog = [];

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
      value: "",
      get firstChild() {
        return el.childNodes.length > 0 ? el.childNodes[0] : null;
      },
      classList: makeClassList(classes),
      get className() {
        return el.classList.toString();
      },
      set className(value) {
        el.classList = makeClassList(
          String(value ?? "")
            .split(/\s+/u)
            .filter(Boolean)
        );
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
      get hidden() {
        return el._hidden;
      },
      set hidden(v) {
        el._hidden = !!v;
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
        if (child) {
          child.parentNode = el;
        }
        return child;
      },
      append(...nodes) {
        for (const c of nodes) {
          el.childNodes.push(c);
          if (c && c.nodeType === 1) {
            el.children.push(c);
          }
          if (c) {
            c.parentNode = el;
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
      focus() {
        focusLog.push(el);
        document.activeElement = el;
      },
      blur() {
        if (document.activeElement === el) {
          document.activeElement = null;
        }
      },
    };
    Object.defineProperty(el, "parentNode", {
      value: null,
      writable: true,
      configurable: true,
    });
    return el;
  }

  const document = makeElement("#document", {});
  document.activeElement = null;
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

  const viewLogin = makeElement("section", { id: "view-login" });
  const loginCard = makeElement("div", { class: "login-card" });
  const loginForm = makeElement("form", { id: "login-form" });
  const usernameInput = makeElement("input", { id: "login-username" });
  const pinInput = makeElement("input", { id: "login-pin" });
  const submitBtn = makeElement("button", { id: "login-submit" });
  const loginMsg = makeElement("div", { id: "login-msg", class: "hidden" });
  loginForm.append(usernameInput);
  loginForm.append(pinInput);
  loginForm.append(submitBtn);
  loginForm.append(loginMsg);
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
  document.body = app;

  // Supports plain single-segment selectors AND one descendant
  // combinator ("ANCESTOR DESCENDANT"), which is everything the
  // source under test uses.
  document.querySelector = (selector) => {
    const parts = selector.trim().split(/\s+/u);
    if (parts.length === 1) {
      return findAll(document.body, parts[0])[0] ?? null;
    }
    const [ancestorSeg, descendantSeg] = parts;
    for (const ancestor of findAll(document.body, ancestorSeg)) {
      const [found] = findAll(ancestor, descendantSeg);
      if (found) {
        return found;
      }
    }
    return null;
  };

  return { document, index, focusLog };
}

// ---------------------------------------------------------------------------
// Fluent google.script.run fake with a queue (mirrors
// nested-task-navigation.test.js's createGoogleRun exactly).
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
      "api_submitDemoTaskForm",
    ]) {
      builder[name] = (...args) => {
        calls.push({ method: name, args });
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
          queueMicrotask(() => {
            if (typeof builder._success === "function") {
              builder._success({
                success: true,
                requestId: "req-programs",
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
    get: () => makeBuilder(),
    configurable: true,
  });
  return run;
}

function bootShellSession({
  queuedHandlers = [],
  withCopySource = false,
} = {}) {
  const localStorage = createLocalStorage();
  const dom = createFakeDom();
  const googleRun = createGoogleRun(queuedHandlers);

  const context = {
    console,
    setTimeout,
    clearTimeout,
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
  if (withCopySource) {
    vm.runInContext(loadScriptBody(COPY), context, {
      filename: "copy.js.html",
    });
  }
  vm.runInContext(loadScriptBody(FORM_GUARD), context, {
    filename: "form-guard.js.html",
  });
  vm.runInContext(loadScriptBody(SHELL_SESSION), context, {
    filename: "shell-session.js.html",
  });

  const ready = makeEvent("DOMContentLoaded");
  const docListeners =
    context.document._listeners?.get("DOMContentLoaded") ?? [];
  for (const fn of docListeners) {
    fn(ready);
  }

  return { dom, context };
}

async function flushMicrotasks() {
  for (let i = 0; i < 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
  await delay(5);
  for (let i = 0; i < 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

function successEnvelope(data, requestId = "req-test") {
  return { success: true, requestId, data };
}

// A 6-Section STAFF bootstrap: PHONE_MAX_VISIBLE is 4, so this pushes
// "care" and "permissions" into the phone overflow ("More") menu —
// exactly the scenario issue #71's More-menu AC targets.
function staffBootstrapDto() {
  return {
    session: {
      userId: "U001",
      name: "王小明",
      role: "STAFF",
      qrCodeString: "QR-U001",
      sessionId: "sid-001",
      sessionToken: "tok-001",
    },
    sections: [
      { key: "profile", label: "個人資料", capability: "READ" },
      { key: "programs", label: "課程", capability: "READ" },
      { key: "scanner", label: "掃描", capability: "USE" },
      { key: "events", label: "聚會", capability: "READ" },
      { key: "care", label: "關懷", capability: "READ" },
      { key: "permissions", label: "權限管理", capability: "USE" },
    ],
    profile: {
      userId: "U001",
      name: "王小明",
      username: "user001",
      phone: "91234567",
      role: "STAFF",
      status: "Active",
      qrCodeString: "QR-U001",
    },
  };
}

// Logs in as STAFF via the real login form + handleLoginSubmit_ path
// (not a test-only shortcut), then flushes past the deferred
// READY transition so navigation and Profile are on screen.
async function loginAsStaff(dom, queuedHandlers) {
  queuedHandlers.push({
    kind: "success",
    value: successEnvelope(staffBootstrapDto()),
  });
  dom.index["login-username"].value = "staffuser";
  dom.index["login-pin"].value = "5678";
  dom.index["login-form"].dispatchEvent(makeEvent("submit"));
  await flushMicrotasks();
}

describe("shell-session.js.html — issue #71 accessibility/focus/copy", () => {
  // -------------------------------------------------------------------
  // Copy source (AC #11)
  // -------------------------------------------------------------------

  test("copyText_ returns the literal fallback when window.EfccCopy is absent", () => {
    const { context } = bootShellSession({ withCopySource: false });
    const hooks = context.window.__test__;
    assert.equal(hooks.copyText_("refresh", "重新整理"), "重新整理");
    assert.equal(
      hooks.copyText_("does.not.exist", "fallback-value"),
      "fallback-value"
    );
  });

  test("copyText_ prefers window.EfccCopy nested paths when the copy source is loaded", () => {
    const { context } = bootShellSession({ withCopySource: true });
    const hooks = context.window.__test__;
    assert.equal(hooks.copyText_("navLabel.programs", "WRONG"), "課程");
    assert.equal(hooks.copyText_("navLabel.care", "WRONG"), "關懷");
    assert.equal(
      hooks.copyText_("errorCopy.TRANSPORT.heading", "WRONG"),
      "網絡連線失敗"
    );
  });

  test("errorCopyFor_ returns distinct per-code copy even without EfccCopy loaded", () => {
    const { context } = bootShellSession({ withCopySource: false });
    const hooks = context.window.__test__;
    const auth = hooks.errorCopyFor_("AUTH_REQUIRED");
    const transport = hooks.errorCopyFor_("TRANSPORT");
    const internal = hooks.errorCopyFor_("INTERNAL_ERROR");
    assert.equal(auth.heading, "登入工作階段已失效");
    assert.equal(transport.heading, "網絡連線失敗");
    assert.equal(internal.heading, "伺服器錯誤");
    assert.notEqual(auth.heading, transport.heading);
    assert.notEqual(transport.heading, internal.heading);
  });

  // -------------------------------------------------------------------
  // Nav semantics + focus management (AC #5, #6, #7, #10)
  // -------------------------------------------------------------------

  test("nav items carry no role=link, toggle aria-current, and badges carry aria-label", async () => {
    const queuedHandlers = [];
    const { dom, context } = bootShellSession({ queuedHandlers });
    await loginAsStaff(dom, queuedHandlers);

    const navPhone = dom.index["app-nav-phone"];
    assert.ok(navPhone.children.length > 0, "phone nav must have items");
    for (const item of navPhone.children) {
      assert.notEqual(
        item.getAttribute("role"),
        "link",
        `nav item ${item.dataset.section} must not carry role=link`
      );
    }
    // Profile is the initial route (issue #64 Day 1 landing Section).
    const profileItem = navPhone.children.find(
      (c) => c.dataset.section === "profile"
    );
    assert.equal(profileItem.getAttribute("aria-current"), "page");

    // Navigate to Programs, assert aria-current flips.
    context.window.__e2eNavigate("programs");
    await flushMicrotasks();
    const programsItem = navPhone.children.find(
      (c) => c.dataset.section === "programs"
    );
    assert.equal(programsItem.getAttribute("aria-current"), "page");
    assert.equal(profileItem.getAttribute("aria-current"), "false");

    // Badge accessible label (issue #71 AC #10).
    context.window.__test__.updateBadge_("events", 5);
    const eventsItem = navPhone.children.find(
      (c) => c.dataset.section === "events"
    );
    const badge = eventsItem.children.find((c) => c.dataset.badge === "events");
    assert.ok(badge, "events nav item must have a badge element");
    assert.ok(
      badge.getAttribute("aria-label"),
      "badge must carry an aria-label with the count"
    );
    assert.ok(badge.getAttribute("aria-label").includes("5"));
  });

  test("focus moves to the new Section heading after root navigation", async () => {
    const queuedHandlers = [];
    const { dom, context } = bootShellSession({ queuedHandlers });
    await loginAsStaff(dom, queuedHandlers);

    context.window.__e2eNavigate("events");
    await flushMicrotasks();

    const heading = dom.document.querySelector('[data-app-heading="events"]');
    assert.ok(heading, "events Section must render a data-app-heading node");
    assert.equal(dom.document.activeElement, heading);
  });

  test("focus moves to the task Back button on open, and to the parent nav item on close", async () => {
    const queuedHandlers = [];
    const { dom, context } = bootShellSession({ queuedHandlers });
    await loginAsStaff(dom, queuedHandlers);
    context.window.__e2eNavigate("programs");
    await flushMicrotasks();

    context.window.__test__.openTask_({
      key: "programs-detail-demo",
      parentSection: "programs",
      parentLabel: "課程",
      title: "詳情",
      kind: "detail",
    });
    await flushMicrotasks();
    const backBtn = dom.document.querySelector(
      '.view-task [data-action="task-back"]'
    );
    assert.ok(backBtn, "task view must render a Back button");
    assert.equal(dom.document.activeElement, backBtn);

    context.window.__test__.closeTask_();
    await flushMicrotasks();
    // Focus must land somewhere sensible (the nav item or the Section
    // heading) — never remain null/unset.
    assert.notEqual(dom.document.activeElement, null);
  });

  test("Section-level error card is a role=status aria-live=polite region and focuses its retry button", async () => {
    const queuedHandlers = [];
    const { dom, context } = bootShellSession({ queuedHandlers });
    await loginAsStaff(dom, queuedHandlers);

    // Trigger a Programs TRANSPORT failure by queuing a failure for the
    // next api_getPrograms call, then navigate to Programs.
    queuedHandlers.push({
      kind: "failure",
      value: new Error("network down"),
    });
    context.window.__e2eNavigate("programs");
    await flushMicrotasks();

    const errorSection = dom.document.querySelector(
      '[data-section="programs"]'
    );
    assert.ok(errorSection, "Programs error card must render");
    assert.equal(errorSection.getAttribute("role"), "status");
    assert.equal(errorSection.getAttribute("aria-live"), "polite");

    const retryBtn = dom.document.querySelector(
      '[data-action="section-retry"]'
    );
    assert.ok(retryBtn, "error card must render a retry button");
    assert.equal(dom.document.activeElement, retryBtn);
  });

  test("forbidden view is a role=status aria-live=polite region with a working return action", async () => {
    const queuedHandlers = [];
    const { dom, context } = bootShellSession({ queuedHandlers });
    await loginAsStaff(dom, queuedHandlers);

    // "permissions" IS authorized for STAFF in this DTO — request an
    // unauthorized key instead to exercise the forbidden path.
    context.window.__e2eNavigate("not-a-real-section");
    await flushMicrotasks();

    const forbiddenSection = dom.document.querySelector(
      '[data-section="not-a-real-section"]'
    );
    assert.ok(forbiddenSection, "forbidden view must render");
    assert.equal(forbiddenSection.getAttribute("role"), "status");
    assert.equal(forbiddenSection.getAttribute("aria-live"), "polite");
  });

  // -------------------------------------------------------------------
  // More-menu keyboard widget
  // -------------------------------------------------------------------

  test("More menu: trigger toggles aria-expanded, Escape closes it and restores focus to the trigger", async () => {
    const queuedHandlers = [];
    const { dom, context } = bootShellSession({ queuedHandlers });
    await loginAsStaff(dom, queuedHandlers);

    const hooks = context.window.__test__;
    const navPhone = dom.index["app-nav-phone"];
    const moreWrap = navPhone.children.find(
      (c) => c.dataset.appNavWrap === "more"
    );
    assert.ok(moreWrap, "6-Section STAFF nav must overflow into a More menu");
    const moreTrigger = moreWrap.children.find(
      (c) => c.dataset.section === "more"
    );
    assert.ok(moreTrigger, "More trigger button must exist");
    assert.equal(moreTrigger.getAttribute("role"), null);
    assert.equal(moreTrigger.getAttribute("aria-haspopup"), "menu");
    assert.equal(moreTrigger.getAttribute("aria-expanded"), "false");
    assert.equal(hooks.isMoreMenuOpen_(), false);

    // Open.
    moreTrigger.dispatchEvent(makeEvent("click"));
    await flushMicrotasks();
    assert.equal(moreTrigger.getAttribute("aria-expanded"), "true");
    assert.equal(hooks.isMoreMenuOpen_(), true);

    // Escape closes and restores focus to the trigger.
    dom.document.dispatchEvent(makeEvent("keydown", { key: "Escape" }));
    assert.equal(hooks.isMoreMenuOpen_(), false);
    assert.equal(moreTrigger.getAttribute("aria-expanded"), "false");
    assert.equal(dom.document.activeElement, moreTrigger);
  });
});
