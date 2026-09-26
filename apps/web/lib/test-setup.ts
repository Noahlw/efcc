import * as matchers from "@testing-library/jest-dom/matchers";
import { afterEach, expect } from "vitest";

expect.extend(matchers);

// Components persist session drafts by design; tests still need a fresh
// authenticated session boundary for each case.
afterEach(() => {
  globalThis.sessionStorage?.clear();
});

function showModal(this: HTMLDialogElement): void {
  this.setAttribute("open", "");
}

function closeDialog(this: HTMLDialogElement): void {
  this.removeAttribute("open");
  this.dispatchEvent(new Event("close"));
}

// jsdom doesn't implement HTMLDialogElement.showModal()/close() -- polyfill
// with the attribute-toggling behavior real browsers use, close enough for
// component tests that drive <dialog> via these methods.
if (typeof HTMLDialogElement !== "undefined") {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = showModal;
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = closeDialog;
  }
}
if (typeof HTMLElement !== "undefined") {
  if (!HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = () => false;
    HTMLElement.prototype.setPointerCapture = () => null;
    HTMLElement.prototype.releasePointerCapture = () => null;
  }
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => null;
  }
}

// Radix overlay primitives observe their trigger/content dimensions. jsdom
// does not provide ResizeObserver, so keep the browser contract available to
// component tests without making production code depend on a test polyfill.
if (typeof ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe(): void {
      void this;
    }
    unobserve(): void {
      void this;
    }
    disconnect(): void {
      void this;
    }
  };
}
