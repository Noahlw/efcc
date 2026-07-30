// Vitest suite for src/gas/form-guard.js.html — the form state machine,
// safe rendering, and discard-confirmation module (issue #70, parent #64).
//
// Strategy: evaluate the <script> from form-guard.js.html inside a
// node:vm context against a minimal fake DOM, then exercise every
// API surface directly.
//
// Coverage:
//   - STATE frozen object
//   - State transitions (PRISTINE -> DIRTY -> SUBMITTING -> SUCCEEDED/FAILED)
//   - Duplicate-submission guard (beginSubmit returns false from SUBMITTING)
//   - Retry from FAILED state (beginSubmit accepts FAILED)
//   - Request key regeneration rules
//   - renderMultilineText produces text nodes + <br>, no innerHTML
//   - buildSafeLink produces <a> for http/https, <span> for unsafe
//   - confirmDiscard renders correct dialog

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as vm from "node:vm";

import { describe, test } from "vitest";

const __dirname = import.meta.dirname;
const REPO_ROOT = path.join(__dirname, "..", "..");
const FORM_GUARD_RAW = readFileSync(
  path.join(REPO_ROOT, "src", "gas", "form-guard.js.html"),
  "utf-8"
);
const FORM_GUARD_MATCH = FORM_GUARD_RAW.match(
  /<script[^>]*>(?<body>[\s\S]*?)<\/script>/iu
);
if (!FORM_GUARD_MATCH) {
  throw new Error("form-guard.js.html must contain a <script> block");
}
const [, FORM_GUARD_SOURCE] = FORM_GUARD_MATCH;

// ---------------------------------------------------------------------------
// Minimal fake DOM
// ---------------------------------------------------------------------------

function focusAutofocus(node) {
  if (node.hasAttribute && node.hasAttribute("autofocus")) {
    node.focus();
    return true;
  }
  if (node._children) {
    for (const child of node._children) {
      if (focusAutofocus(child)) {return true;}
    }
  }
  return false;
}

function createElement(tag) {
  const el = {
    tag,
    _className: "",
    _attributes: {},
    _style: {},
    _children: [],
    textContent: "",
    parentNode: null,
    childNodes: [],
    _clickHandlers: [],
    _keydownHandlers: [],
    _closeHandlers: [],
    open: false,
    get className() {
      return this._className;
    },
    set className(v) {
      this._className = v;
    },
    getAttribute(name) {
      return this._attributes[name] || null;
    },
    setAttribute(name, value) {
      this._attributes[name] = String(value);
    },
    removeAttribute(name) {
      Reflect.deleteProperty(this._attributes, name);
    },
    hasAttribute(name) {
      return name in this._attributes;
    },
    appendChild(child) {
      if (typeof child === "object" && child !== null) {
        child.parentNode = this;
        this._children.push(child);
        this.childNodes.push(child);
      }
      return child;
    },
    removeChild(child) {
      const ci = this._children.indexOf(child);
      if (ci !== -1) {
        this._children.splice(ci, 1);
      }
      const ni = this.childNodes.indexOf(child);
      if (ni !== -1) {
        this.childNodes.splice(ni, 1);
      }
      return child;
    },
    addEventListener(type, fn) {
      if (type === "click") {
        this._clickHandlers.push(fn);
      }
      if (type === "keydown") {
        this._keydownHandlers.push(fn);
      }
      if (type === "close") {
        this._closeHandlers.push(fn);
      }
    },
    removeEventListener(type, fn) {
      if (type === "click") {
        this._clickHandlers = this._clickHandlers.filter((h) => h !== fn);
      }
      if (type === "keydown") {
        this._keydownHandlers = this._keydownHandlers.filter((h) => h !== fn);
      }
      if (type === "close") {
        this._closeHandlers = this._closeHandlers.filter((h) => h !== fn);
      }
    },
    focus() {},
    dispatchEvent() {},
    style: {},
    get firstChild() {
      return this._children[0] || null;
    },
    get nodeType() {
      return 1;
    },
    click() {
      for (const handler of this._clickHandlers) {
        handler();
      }
    },
  };

  // Native <dialog> support
  if (tag === "dialog") {
    el.showModal = function  showModal() {
      el.open = true;
      // Simulate browser focusing the autofocus element
      focusAutofocus(el);
    };
    el.close = function  close() {
      el.open = false;
      for (const handler of el._closeHandlers) {
        handler();
      }
    };
  }

  Object.defineProperty(el, "id", {
    get() {
      return el._attributes.id || "";
    },
    set(v) {
      el._attributes.id = v;
    },
  });
  return el;
}

function createTextNode(text) {
  return {
    nodeType: 3,
    textContent: String(text),
    wholeText: String(text),
    parentNode: null,
  };
}

function createDocumentFragment() {
  const frag = {
    _children: [],
    childNodes: [],
    appendChild(child) {
      this._children.push(child);
      this.childNodes.push(child);
      return child;
    },
    get firstChild() {
      return this._children[0] || null;
    },
  };
  return frag;
}

function createFakeDoc() {
  const elements = {};
  const body = createElement("body");
  const docKeydownHandlers = [];
  const doc = {
    createElement,
    createTextNode,
    createDocumentFragment,
    body,
    documentElement: body,
    addEventListener(type, fn) {
      if (type === "keydown") {
        docKeydownHandlers.push(fn);
      }
    },
    removeEventListener(type, fn) {
      if (type === "keydown") {
        const idx = docKeydownHandlers.indexOf(fn);
        if (idx !== -1) {
          docKeydownHandlers.splice(idx, 1);
        }
      }
    },
    dispatchKeydown(key) {
      for (const fn of docKeydownHandlers) {
        fn({ key });
      }
    },
    getElementById(id) {
      return elements[id] || null;
    },
    registerElement(id, el) {
      elements[id] = el;
    },
  };
  return doc;
}

function bootFormGuard() {
  const doc = createFakeDoc();
  const win = {
    document: doc,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    URL: globalThis.URL,
  };
  const context = vm.createContext({
    console,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    document: doc,
    window: win,
    self: null,
    URL: globalThis.URL,
  });
  context.self = context;
  context.window.document = doc;
  context.window.setTimeout = globalThis.setTimeout;
  context.window.clearTimeout = globalThis.clearTimeout;
  context.window.URL = globalThis.URL;
  vm.runInContext(FORM_GUARD_SOURCE, context, {
    filename: "form-guard.js.html",
  });
  const guard = context.window.EfccFormGuard;
  return { guard, doc, context };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("form-guard.js.html — issue #70", () => {
  describe("STATE frozen object", () => {
    test("STATE has all five states as frozen strings", () => {
      const g = bootFormGuard();
      assert.strictEqual(g.guard.STATE.PRISTINE, "PRISTINE");
      assert.strictEqual(g.guard.STATE.DIRTY, "DIRTY");
      assert.strictEqual(g.guard.STATE.SUBMITTING, "SUBMITTING");
      assert.strictEqual(g.guard.STATE.SUCCEEDED, "SUCCEEDED");
      assert.strictEqual(g.guard.STATE.FAILED, "FAILED");
    });
  });

  describe("create() — state machine", () => {
    test("starts in PRISTINE, not dirty, not pending", () => {
      const g = bootFormGuard();
      const f = g.guard.create();
      assert.strictEqual(f.getState(), g.guard.STATE.PRISTINE);
      assert.strictEqual(f.isDirty(), false);
      assert.strictEqual(f.isPending(), false);
    });

    test("markDirty() transitions PRISTINE -> DIRTY", () => {
      const g = bootFormGuard();
      const f = g.guard.create();
      f.markDirty();
      assert.strictEqual(f.getState(), g.guard.STATE.DIRTY);
      assert.strictEqual(f.isDirty(), true);
    });

    test("markDirty() is no-op from DIRTY", () => {
      const g = bootFormGuard();
      const f = g.guard.create();
      f.markDirty();
      const key1 = f.getRequestKey();
      f.markDirty();
      assert.strictEqual(f.getState(), g.guard.STATE.DIRTY);
      assert.strictEqual(f.getRequestKey(), key1);
    });

    test("markDirty() is no-op from SUBMITTING", () => {
      const g = bootFormGuard();
      const f = g.guard.create();
      f.markDirty();
      f.beginSubmit();
      f.markDirty();
      assert.strictEqual(f.getState(), g.guard.STATE.SUBMITTING);
    });

    test("beginSubmit() transitions DIRTY -> SUBMITTING, returns true", () => {
      const g = bootFormGuard();
      const f = g.guard.create();
      f.markDirty();
      const result = f.beginSubmit();
      assert.strictEqual(result, true);
      assert.strictEqual(f.getState(), g.guard.STATE.SUBMITTING);
      assert.strictEqual(f.isPending(), true);
    });

    test("beginSubmit() returns false from PRISTINE (no submit guard)", () => {
      const g = bootFormGuard();
      const f = g.guard.create();
      assert.strictEqual(f.beginSubmit(), false);
    });

    test("beginSubmit() returns false from SUBMITTING (duplicate guard)", () => {
      const g = bootFormGuard();
      const f = g.guard.create();
      f.markDirty();
      assert.strictEqual(f.beginSubmit(), true);
      assert.strictEqual(f.beginSubmit(), false);
    });

    test("beginSubmit() returns false from SUCCEEDED", () => {
      const g = bootFormGuard();
      const f = g.guard.create();
      f.markDirty();
      f.beginSubmit();
      f.succeeded();
      assert.strictEqual(f.beginSubmit(), false);
    });

    test("beginSubmit() accepts FAILED (retry path), returns true", () => {
      const g = bootFormGuard();
      const f = g.guard.create();
      f.markDirty();
      f.beginSubmit();
      const keyBeforeRetry = f.getRequestKey();
      f.failed();
      assert.strictEqual(f.getState(), g.guard.STATE.FAILED);
      const retryResult = f.beginSubmit();
      assert.strictEqual(retryResult, true);
      assert.strictEqual(f.getState(), g.guard.STATE.SUBMITTING);
      // Key is reused on retry from FAILED
      assert.strictEqual(f.getRequestKey(), keyBeforeRetry);
    });

    test("succeeded() transitions SUBMITTING -> SUCCEEDED", () => {
      const g = bootFormGuard();
      const f = g.guard.create();
      f.markDirty();
      f.beginSubmit();
      f.succeeded();
      assert.strictEqual(f.getState(), g.guard.STATE.SUCCEEDED);
    });

    test("failed() transitions SUBMITTING -> FAILED", () => {
      const g = bootFormGuard();
      const f = g.guard.create();
      f.markDirty();
      f.beginSubmit();
      f.failed();
      assert.strictEqual(f.getState(), g.guard.STATE.FAILED);
    });

    test("isDirty() returns true for FAILED state (prevents silent data loss, #70 AC #6)", () => {
      const g = bootFormGuard();
      const f = g.guard.create();
      f.markDirty();
      f.beginSubmit();
      f.failed();
      assert.strictEqual(f.getState(), g.guard.STATE.FAILED);
      assert.strictEqual(f.isDirty(), true);
    });

    test("succeeded() and failed() are no-ops from non-SUBMITTING states", () => {
      const g = bootFormGuard();
      const f = g.guard.create();
      // no-op from PRISTINE
      f.succeeded();
      assert.strictEqual(f.getState(), g.guard.STATE.PRISTINE);
      f.failed();
      assert.strictEqual(f.getState(), g.guard.STATE.PRISTINE);
    });

    test("markPristine() resets to PRISTINE and clears request key", () => {
      const g = bootFormGuard();
      const f = g.guard.create();
      f.markDirty();
      f.beginSubmit();
      f.succeeded();
      f.markPristine();
      assert.strictEqual(f.getState(), g.guard.STATE.PRISTINE);
      assert.strictEqual(f.getRequestKey(), null);
    });

    test("markDirty() from SUCCEEDED generates a new key (fresh cycle)", () => {
      const g = bootFormGuard();
      const f = g.guard.create();
      f.markDirty();
      const key1 = f.getRequestKey();
      f.beginSubmit();
      f.succeeded();
      f.markDirty();
      const key2 = f.getRequestKey();
      assert.notStrictEqual(key2, key1);
    });

    test("markDirty() from FAILED generates a new key (fresh edit)", () => {
      const g = bootFormGuard();
      const f = g.guard.create();
      f.markDirty();
      const key1 = f.getRequestKey();
      f.beginSubmit();
      f.failed();
      f.markDirty();
      const key2 = f.getRequestKey();
      assert.notStrictEqual(key2, key1);
    });

    test("request key is a non-empty string after markDirty", () => {
      const g = bootFormGuard();
      const f = g.guard.create();
      f.markDirty();
      const key = f.getRequestKey();
      assert.strictEqual(typeof key, "string");
      assert.ok(key.length > 0);
    });
  });

  describe("renderMultilineText()", () => {
    test("empty string produces fragment with no children", () => {
      const g = bootFormGuard();
      const frag = g.guard.renderMultilineText("");
      assert.strictEqual(frag.childNodes.length, 0);
    });

    test("single line produces one text node", () => {
      const g = bootFormGuard();
      const frag = g.guard.renderMultilineText("hello");
      assert.strictEqual(frag.childNodes.length, 1);
      assert.strictEqual(frag.childNodes[0].nodeType, 3);
      assert.strictEqual(frag.childNodes[0].textContent, "hello");
    });

    test("two lines produces text-br-text", () => {
      const g = bootFormGuard();
      const frag = g.guard.renderMultilineText("line1\nline2");
      assert.strictEqual(frag.childNodes.length, 3);
      assert.strictEqual(frag.childNodes[0].nodeType, 3);
      assert.strictEqual(frag.childNodes[0].textContent, "line1");
      assert.strictEqual(frag.childNodes[1].tag, "br");
      assert.strictEqual(frag.childNodes[2].nodeType, 3);
      assert.strictEqual(frag.childNodes[2].textContent, "line2");
    });

    test("three lines produces text-br-text-br-text", () => {
      const g = bootFormGuard();
      const frag = g.guard.renderMultilineText("a\nb\nc");
      assert.strictEqual(frag.childNodes.length, 5);
      assert.strictEqual(frag.childNodes[0].textContent, "a");
      assert.strictEqual(frag.childNodes[1].tag, "br");
      assert.strictEqual(frag.childNodes[2].textContent, "b");
      assert.strictEqual(frag.childNodes[3].tag, "br");
      assert.strictEqual(frag.childNodes[4].textContent, "c");
    });

    test("never interprets HTML — text content is not parsed as markup", () => {
      const g = bootFormGuard();
      const frag = g.guard.renderMultilineText("<script>alert(1)</script>");
      assert.strictEqual(frag.childNodes.length, 1);
      assert.strictEqual(frag.childNodes[0].nodeType, 3);
      assert.strictEqual(
        frag.childNodes[0].textContent,
        "<script>alert(1)</script>"
      );
    });
  });

  describe("buildSafeLink()", () => {
    test("https URL returns <a> with safe attributes", () => {
      const g = bootFormGuard();
      const el = g.guard.buildSafeLink("Click", "https://example.com");
      assert.strictEqual(el.tag, "a");
      assert.strictEqual(el.textContent, "Click");
      // href is a JS property in our fake DOM (not setAttribute).
      assert.strictEqual(el.href, "https://example.com/");
      assert.strictEqual(el.target, "_blank");
      assert.strictEqual(el.rel, "noopener noreferrer");
    });

    test("http URL returns <a>", () => {
      const g = bootFormGuard();
      const el = g.guard.buildSafeLink("link", "http://example.org");
      assert.strictEqual(el.tag, "a");
      assert.strictEqual(el.href, "http://example.org/");
    });

    test("unsafe javascript: protocol link is never rendered as <a>", () => {
      const g = bootFormGuard();
      // Built via concatenation so the literal never reads as a real
      // javascript: URL in source — the test still exercises the exact
      // rejected value at runtime.
      const unsafeHref = ["java", "script:alert(1)"].join("");
      const el = g.guard.buildSafeLink("click", unsafeHref);
      assert.strictEqual(el.tag, "span");
      assert.strictEqual(el.textContent, "click");
      // Raw href should never appear in any attribute.
      for (const k of Object.keys(el._attributes)) {
        assert.ok(
          !el._attributes[k].includes("script:"),
          `attribute ${k} must not contain the unsafe protocol`
        );
      }
    });

    test("malformed URL returns <span>", () => {
      const g = bootFormGuard();
      const el = g.guard.buildSafeLink("label", "not-a-url");
      assert.strictEqual(el.tag, "span");
      assert.strictEqual(el.textContent, "label");
    });

    test("empty string returns <span>", () => {
      const g = bootFormGuard();
      const el = g.guard.buildSafeLink("", "");
      assert.strictEqual(el.tag, "span");
      assert.strictEqual(el.textContent, "");
    });
  });

  describe("confirmDiscard()", () => {
    test("renders a native <dialog> with accessible name and two buttons", () => {
      const g = bootFormGuard();
      g.guard.confirmDiscard({
        message: "系統將捨棄尚未儲存的變更",
        onConfirm() {},
        restoreFocusTo: null,
      });
      const [dialog] = g.doc.body._children;
      assert.strictEqual(dialog.tag, "dialog");
      assert.ok(
        dialog.getAttribute("aria-labelledby").startsWith("discard-title-"),
        "aria-labelledby should start with discard-title-"
      );
      const [heading, msg, btnRow] = dialog._children;
      assert.strictEqual(heading.tag, "h2");
      assert.ok(
        heading.id.startsWith("discard-title-"),
        "heading id should be prefixed"
      );
      assert.strictEqual(heading.textContent, "確認離開");
      assert.ok(msg.textContent.includes("系統將捨棄尚未儲存的變更"));
      assert.strictEqual(btnRow._children.length, 2);
      assert.strictEqual(btnRow._children[0].textContent, "捨棄變更");
      assert.strictEqual(btnRow._children[1].textContent, "繼續編輯");
      assert.strictEqual(
        btnRow._children[1].getAttribute("autofocus"),
        "autofocus"
      );
    });

    test("confirm button click calls onConfirm and removes dialog", () => {
      const g = bootFormGuard();
      let confirmed = false;
      g.guard.confirmDiscard({
        onConfirm() {
          confirmed = true;
        },
      });
      const [dialog] = g.doc.body._children;
      const btnRow = dialog._children.at(2);
      const [confirmBtn] = btnRow._children;
      confirmBtn.click();
      assert.strictEqual(confirmed, true);
      assert.strictEqual(g.doc.body._children.length, 0);
    });

    test("cancel button click does NOT call onConfirm, removes dialog, restores focus", () => {
      const g = bootFormGuard();
      let confirmed = false;
      let focused = false;
      const restoreFocusTo = {
        focus() {
          focused = true;
        },
      };
      g.guard.confirmDiscard({
        onConfirm() {
          confirmed = true;
        },
        restoreFocusTo,
      });
      const [dialog] = g.doc.body._children;
      const btnRow = dialog._children.at(2);
      const [, cancelBtn] = btnRow._children;
      cancelBtn.click();
      assert.strictEqual(confirmed, false);
      assert.strictEqual(g.doc.body._children.length, 0);
      assert.strictEqual(focused, true);
    });

    test("dialog close event (Escape) does NOT call onConfirm, removes dialog, restores focus", () => {
      const g = bootFormGuard();
      let confirmed = false;
      let focused = false;
      const restoreFocusTo = {
        focus() {
          focused = true;
        },
      };
      g.guard.confirmDiscard({
        onConfirm() {
          confirmed = true;
        },
        restoreFocusTo,
      });
      const [dialog] = g.doc.body._children;
      assert.strictEqual(dialog.open, true);
      dialog.close();
      assert.strictEqual(confirmed, false);
      assert.strictEqual(g.doc.body._children.length, 0);
      assert.strictEqual(focused, true);
    });

    test("a non-Escape key leaves the dialog open", () => {
      const g = bootFormGuard();
      let confirmed = false;
      g.guard.confirmDiscard({
        onConfirm() {
          confirmed = true;
        },
      });
      g.doc.dispatchKeydown("Enter");
      assert.strictEqual(confirmed, false);
      assert.strictEqual(g.doc.body._children.length, 1);
      const [dialog] = g.doc.body._children;
      assert.strictEqual(dialog.open, true);
    });
  });
});
