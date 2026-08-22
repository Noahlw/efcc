import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement HTMLDialogElement.showModal()/close() -- polyfill
// with the attribute-toggling behavior real browsers use, close enough for
// component tests that drive <dialog> via these methods.
if (typeof HTMLDialogElement !== "undefined") {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function  showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function  close(this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
}
