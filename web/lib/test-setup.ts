import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement HTMLDialogElement.showModal()/close() -- polyfill
// with the attribute-toggling behavior real browsers use, close enough for
// component tests that drive <dialog> via these methods.
if (typeof HTMLDialogElement !== "undefined") {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(
      this: HTMLDialogElement
    ) {
      this.setAttribute("open", "");
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close(
      this: HTMLDialogElement
    ) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
}
if (typeof HTMLElement !== "undefined") {
  if (!HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = () => false;
    HTMLElement.prototype.setPointerCapture = () => undefined;
    HTMLElement.prototype.releasePointerCapture = () => undefined;
  }
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => undefined;
  }
}

// Radix overlay primitives observe their trigger/content dimensions. jsdom
// does not provide ResizeObserver, so keep the browser contract available to
// component tests without making production code depend on a test polyfill.
if (typeof ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
