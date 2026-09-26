import * as matchers from "@testing-library/jest-dom/matchers";
import { HttpResponse } from "msw";
import { afterEach, expect } from "vitest";

expect.extend(matchers);

// Legacy MSW fixtures model Worker envelopes but often omit the matching
// transport header. Complete only those synthetic envelopes; real responses
// and explicit missing-header client tests still exercise strict parsing.
const originalJson = HttpResponse.json;
Object.defineProperty(HttpResponse, "json", {
  value: (
    body: Parameters<typeof HttpResponse.json>[0],
    init?: Parameters<typeof HttpResponse.json>[1]
  ) => {
    if (
      body &&
      typeof body === "object" &&
      "data" in body &&
      "requestId" in body &&
      typeof body.requestId === "string"
    ) {
      const headers = new Headers(init?.headers);
      if (!headers.has("X-Request-Id")) {
        headers.set("X-Request-Id", body.requestId);
      }
      return originalJson(body, { ...init, headers });
    }
    return originalJson(body, init);
  },
});

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
